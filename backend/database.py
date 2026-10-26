import sqlite3

def setup_db():
    conn = sqlite3.connect('hospital.db')
    c = conn.cursor()
    
    # Create the table
    c.execute('''CREATE TABLE IF NOT EXISTS resources 
                 (id INTEGER PRIMARY KEY, type TEXT, name TEXT, status TEXT)''')
    
    # Clear old data so we start fresh
    c.execute('DELETE FROM resources')
    
    # --- EXPANDED HOSPITAL INVENTORY ---
    mock_data = [
        # BEDS & ROOMS
        ('bed', 'ICU Bed 14', 'Available'),
        ('bed', 'ICU Bed 15', 'Occupied'),
        ('bed', 'Trauma Bay 1', 'Available'),
        ('bed', 'Trauma Bay 2', 'Occupied'),
        ('bed', 'NICU Incubator 4', 'Available'),
        ('bed', 'Operating Room A', 'Available'),
        ('bed', 'Isolation Room B (Negative Pressure)', 'Available'),
        ('bed', 'Burn Unit Bed 2', 'Available'),
        ('bed', 'General Ward Bed 42', 'Available'),
        ('bed', 'Cath Lab 1', 'Available'),
        ('bed', 'Labor and Delivery Suite 1', 'Available'),
        ('bed', 'Psychiatric Ward Bed 3', 'Available'),

        # PERSONNEL & SPECIALISTS
        ('personnel', 'Dr. Kumar (Cardiologist)', 'Available'),
        ('personnel', 'Dr. Smith (Neurologist)', 'Available'),
        ('personnel', 'Dr. Adams (Radiologist)', 'Available'),
        ('personnel', 'Dr. Lee (Trauma Surgeon)', 'Available'),
        ('personnel', 'Dr. Patel (Anesthesiologist)', 'Available'),
        ('personnel', 'Dr. Carter (Pediatrician)', 'Available'),
        ('personnel', 'Dr. Gomez (Pulmonologist)', 'Occupied'), 
        ('personnel', 'Dr. Singh (Orthopedist)', 'Available'),
        ('personnel', 'Nurse Sarah (Rapid Response)', 'Available'),
        ('personnel', 'Dr. Rao (Obstetrician)', 'Available'),
        ('personnel', 'Dr. Mehta (Psychiatrist)', 'Available'),
        ('personnel', 'Dr. Iyer - CMO (Duty Doctor)', 'Available'),

        # EQUIPMENT & MACHINES
        ('equipment', 'ECG Machine 2', 'Available'),
        ('equipment', 'Ventilator 4', 'Available'),
        ('equipment', 'Ventilator 5', 'Occupied'),
        ('equipment', 'Defibrillator (AED) 1', 'Available'),
        ('equipment', 'Portable Ultrasound', 'Available'),
        ('equipment', 'CT Scanner Room 1', 'Available'),
        ('equipment', 'MRI Machine A', 'Occupied'), # Simulating a busy hospital
        ('equipment', 'MRI Machine B', 'Available'),
        ('equipment', 'Crash Cart 3', 'Available'),
        ('equipment', 'Dialysis Machine 2', 'Available'),
        ('equipment', 'Oxygen Cylinder 1', 'Available'),
        ('equipment', 'Oxygen Cylinder 2', 'Available'),
        ('equipment', 'Stretcher A', 'Available'),
        ('equipment', 'Stretcher B', 'Available')
    ]
    
    c.executemany('INSERT INTO resources (type, name, status) VALUES (?, ?, ?)', mock_data)
    conn.commit()
    conn.close()
    print("Expanded Hospital Database initialized successfully!")

if __name__ == "__main__":
    setup_db()