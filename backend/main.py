import os
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import sqlite3
from database import setup_db

app = FastAPI()

ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ABSOLUTE DATABASE PATH ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "hospital.db")
if not os.path.exists(DB_PATH):
    setup_db()

# --- WEBSOCKET MANAGER (For Zero-Refresh UI) ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

# --- DATA MODELS ---
class VoiceRequest(BaseModel): transcript: str
class BookingRequest(BaseModel): bed: str; personnel: List[str]; equipment: List[str]
class ResourceItem(BaseModel): type: str; name: str; status: str
class StatusUpdate(BaseModel): status: str

import re

def has_keyword(text, keywords):
    # whole-word match, allowing a simple plural ending
    return any(re.search(rf"\b{re.escape(k)}(?:s|es)?\b", text) for k in keywords)

# --- AGENTS ---
class TriageAgent:
    def extract_intent(self, transcript: str) -> dict:
        text = transcript.lower()
        needs = {"bed_type": "General Ward", "specialists": [], "equipment": []}
        
        bed_keywords = {
            "ICU": ["icu", "intensive care", "sepsis"], 
            "Trauma Bay": ["trauma", "car crash", "rta", "gunshot", "casualty", "mlc"], 
            "NICU": ["nicu", "premature", "baby"],
            "Operating Room": ["operating room", "surgery", "appendicitis"],
            "Burn Unit": ["burn", "fire", "chemical"],
            "Cath Lab": ["cath lab", "stemi", "heart attack"], 
            "Labor and Delivery": ["labor", "delivery", "pregnant"],
            "Psychiatric Ward": ["psych", "suicidal", "overdose"]
        }
        spec_keywords = {
            "Cardiologist": ["cardiologist", "heart", "chest pain"], 
            "Radiologist": ["x-ray", "mri", "ct scan", "ultrasound"], 
            "Trauma Surgeon": ["trauma surgeon", "surgeon", "massive bleeding", "rta"],
            "Orthopedist": ["orthopedist", "bone", "fracture"],
            "Neurologist": ["neurologist", "brain", "stroke", "seizure"],
            "Pediatrician": ["pediatrician", "child", "infant"],
            "Anesthesiologist": ["anesthesiologist", "anesthesia", "intubate"],
            "Obstetrician": ["obstetrician", "baby delivery", "labor", "pregnant"],
            "Psychiatrist": ["psychiatrist", "therapist"],
            "Pulmonologist": ["pulmonologist", "asthma", "oxygen"],
            "CMO (Duty Doctor)": ["cmo", "duty doctor", "mlc", "police case"]
        }
        equip_keywords = {
            "ECG": ["ecg", "ekg", "heart monitor"], 
            "Ventilator": ["ventilator", "intubate"], 
            "Defibrillator": ["defibrillator", "shock", "cardiac arrest", "code blue"],
            "Portable Ultrasound": ["ultrasound", "fast scan"],
            "CT Scanner": ["ct scan", "head injury"],
            "Crash Cart": ["crash cart", "resuscitation"],
            "Oxygen Cylinder": ["oxygen", "o2", "gasping"],
            "Stretcher": ["stretcher", "unconscious", "collapsed"]
        }

        for bed, keywords in bed_keywords.items():
            if has_keyword(text, keywords): needs["bed_type"] = bed; break
        for spec, keywords in spec_keywords.items():
            if has_keyword(text, keywords) and spec not in needs["specialists"]: needs["specialists"].append(spec)
        for eq, keywords in equip_keywords.items():
            if has_keyword(text, keywords) and eq not in needs["equipment"]: needs["equipment"].append(eq)
            
        return needs

class ResourceAgent:
    def allocate(self, needs: dict) -> dict:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        def query_db(resource_type, keyword):
            c.execute(
                "SELECT name FROM resources WHERE type=? AND status='Available' AND name LIKE ? LIMIT 1",
                (resource_type, f"%{keyword}%"),
            )
            result = c.fetchone()
            return result[0] if result else f"ALERT: No {keyword} available"

        allocations = {
            "bed": query_db('bed', needs["bed_type"]),
            "personnel": [query_db('personnel', s) for s in needs["specialists"]],
            "equipment": [query_db('equipment', e) for e in needs["equipment"]]
        }
        conn.close()
        return allocations

class DispatchAgent:
    def create_path(self, allocations: dict) -> str:
        docs = ", ".join(allocations["personnel"]) if allocations["personnel"] else "No personnel"
        equip = ", ".join(allocations["equipment"]) if allocations["equipment"] else "No equipment"
        return f"Emergency -> {allocations['bed']} -> {docs} -> {equip}"

class BookingAgent:
    def lock_resources(self, bed: str, personnel: list, equipment: list):
        names = [n for n in [bed, *personnel, *equipment] if n and "ALERT" not in n]
        names = list(dict.fromkeys(names))  # remove duplicates, keep order
        if not names:
            return {"ok": False, "taken": []}

        conn = sqlite3.connect(DB_PATH)
        try:
            c = conn.cursor()
            taken = []
            for name in names:
                # only succeeds if the item is still Available
                c.execute(
                    "UPDATE resources SET status='Occupied' WHERE name=? AND status='Available'",
                    (name,),
                )
                if c.rowcount == 0:
                    taken.append(name)

            if taken:
                conn.rollback()  # undo everything, book all or nothing
                return {"ok": False, "taken": taken}

            conn.commit()
            return {"ok": True, "taken": []}
        finally:
            conn.close()

triage_agent = TriageAgent()
resource_agent = ResourceAgent()
dispatch_agent = DispatchAgent()
booking_agent = BookingAgent()

# --- API ROUTES ---
@app.websocket("/ws/inventory")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/coordinate")
async def coordinate_resources(req: VoiceRequest):
    try:
        needs = triage_agent.extract_intent(req.transcript)
        allocations = resource_agent.allocate(needs)
        path = dispatch_agent.create_path(allocations)
        return {"extracted_needs": needs, "allocations": allocations, "recommended_path": path}
    except Exception as e: raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/book")
async def book_resources(req: BookingRequest):
    try:
        result = booking_agent.lock_resources(req.bed, req.personnel, req.equipment)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if not result["ok"]:
        if result["taken"]:
            detail = "Already taken: " + ", ".join(result["taken"]) + ". Please re-run triage."
        else:
            detail = "Nothing available to book."
        raise HTTPException(status_code=409, detail=detail)

    await manager.broadcast("update")
    return {"status": "success"}

@app.get("/api/resources")
async def get_all_resources():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT id, type, name, status FROM resources ORDER BY type, name")
    rows = c.fetchall()
    conn.close()
    return [{"id": r[0], "type": r[1], "name": r[2], "status": r[3]} for r in rows]

@app.post("/api/resources")
async def add_resource(item: ResourceItem):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("INSERT INTO resources (type, name, status) VALUES (?, ?, ?)", (item.type, item.name, item.status))
    conn.commit()
    conn.close()
    await manager.broadcast("update")
    return {"message": "Resource added"}

@app.put("/api/resources/{res_id}")
async def update_resource_status(res_id: int, req: StatusUpdate):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("UPDATE resources SET status=? WHERE id=?", (req.status, res_id))
    conn.commit()
    conn.close()
    await manager.broadcast("update")
    return {"message": "Status updated"}

@app.delete("/api/resources/{res_id}")
async def delete_resource(res_id: int):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("DELETE FROM resources WHERE id=?", (res_id,))
    conn.commit()
    conn.close()
    await manager.broadcast("update")
    return {"message": "Resource deleted"}