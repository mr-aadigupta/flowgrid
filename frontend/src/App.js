import React, { useState, useRef, useEffect } from 'react';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('triage');

  return (
    <div>
      {/* NAVIGATION BAR - Pure Black Glass */}
      <div className="glass-panel" style={{ padding: '15px 40px', display: 'flex', gap: '20px', alignItems: 'center', borderBottomRadius: '0', borderLeft: 'none', borderRight: 'none', borderTop: 'none', background: 'rgba(0,0,0,0.8)' }}>
        <h2 style={{ color: '#F8FAFC', margin: 0, marginRight: '30px', letterSpacing: '1.5px', fontSize: '1.4rem' }}>❖ FLOWGRID</h2>
        <button onClick={() => setActiveTab('triage')} className="btn" style={{ background: activeTab === 'triage' ? 'rgba(255, 255, 255, 0.15)' : 'transparent', color: activeTab === 'triage' ? 'white' : '#94A3B8', border: 'none', padding: '8px 20px', borderRadius: '30px', cursor: 'pointer', fontWeight: '600' }}>Voice Triage</button>
        <button onClick={() => setActiveTab('inventory')} className="btn" style={{ background: activeTab === 'inventory' ? 'rgba(255, 255, 255, 0.15)' : 'transparent', color: activeTab === 'inventory' ? 'white' : '#94A3B8', border: 'none', padding: '8px 20px', borderRadius: '30px', cursor: 'pointer', fontWeight: '600' }}>Staff Inventory</button>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '40px 20px' }}>
        {activeTab === 'triage' ? <VoiceTriage /> : <InventoryManager />}
      </div>
    </div>
  );
}

// ==========================================
//        TAB 1: VOICE TRIAGE DASHBOARD
// ==========================================
function VoiceTriage() {
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [bookingState, setBookingState] = useState('idle');
  const [voices, setVoices] = useState([]);
  
  const recognitionRef = useRef(null);
  const isListeningRef = useRef(isListening);

  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => setVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);

  const speakAnnouncement = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); 
      const utterance = new SpeechSynthesisUtterance(text);
      const premiumVoices = voices.filter(v => v.name.includes('Jenny') || v.name.includes('Google UK English Female') || v.name.includes('Google US English') || v.name.includes('Zira'));
      if (premiumVoices.length > 0) utterance.voice = premiumVoices[0];
      utterance.rate = 0.95; 
      utterance.pitch = 1.05; 
      window.speechSynthesis.speak(utterance);
    }
  };

  const startListening = () => {
    if (isListeningRef.current) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Voice AI is not supported in this browser.");
    
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // Indian English Accent Model
    
    recognition.onresult = (event) => {
      let currentTranscript = "";
      for (let i = 0; i < event.results.length; i++) currentTranscript += event.results[i][0].transcript;
      setTranscript(currentTranscript);
    };
    
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
    setIsListening(true);
    recognitionRef.current = recognition;
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault(); 
        if (!e.repeat) startListening();
      }
    };
    const handleKeyUp = (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT') {
        e.preventDefault();
        stopListening();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleProcess = async () => {
    if (!transcript.trim()) return;
    setLoading(true); setResult(null); setBookingState('idle');
    stopListening();
    
    try {
      const response = await fetch("http://localhost:8000/api/coordinate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript })
      });
      const data = await response.json();
      
      if (!response.ok) alert("Backend Error: " + data.detail);
      else {
        setResult(data);
        const docs = data.allocations.personnel;
        const equip = data.allocations.equipment;
        let announcement = `Routing patient to ${data.allocations.bed}. `;
        
        if (docs.length > 0) announcement += `Paging ${docs.map(d => d.replace('(', ', ').replace(')', '')).join(' and ')}. `;
        if (equip.length > 0) announcement += `Please prepare ${equip.join(' and ')}.`;
        speakAnnouncement(announcement);
      }
    } catch (error) { alert("Ensure FastAPI backend is running!"); }
    setLoading(false);
  };

  const handleBook = async () => {
    setBookingState('booking');
    try {
      const response = await fetch("http://localhost:8000/api/book", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.allocations)
      });
      if (response.ok) {
        setBookingState('booked');
        speakAnnouncement("Resources locked and dispatch logged.");
      }
      else {
        const err = await response.json().catch(() => ({}));
        alert(err.detail || "Failed to book.");
        setResult(null);          // clear the stale plan so they re-run triage
        setBookingState('idle');
      }
    } catch (error) { alert("Database error!"); setBookingState('idle'); }
  };

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: '40px' }}>
         <h1 style={{ color: '#F8FAFC', fontSize: '2.5rem', marginBottom: '10px', fontWeight: '700', letterSpacing: '-0.5px', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>Emergency Triage</h1>
         <p style={{ color: '#94A3B8', fontSize: '1.1rem' }}>Hold <kbd className="glass-panel" style={{ padding: '4px 10px', borderRadius: '6px', color: 'white', fontWeight: '600', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.2)' }}>Space</kbd> to dispatch or type below.</p>
      </div>
      
      {/* OBSIDIAN SEARCH BOX WITH VISUALIZER */}
      <div className={`glass-input ${isListening ? 'mic-recording' : ''}`} style={{ 
          display: 'flex', alignItems: 'center', borderRadius: '40px', 
          border: isListening ? '1px solid rgba(239, 68, 68, 0.8)' : '1px solid rgba(255, 255, 255, 0.15)', 
          padding: '8px 15px 8px 30px', marginBottom: '20px', transition: 'all 0.3s ease'
        }}>
        
        <input 
          value={transcript} 
          onChange={(e) => setTranscript(e.target.value)} 
          placeholder="e.g., Trauma patient, needs an orthopedist..." 
          style={{ flex: 1, background: 'transparent', border: 'none', color: '#F8FAFC', fontSize: '20px', outline: 'none', fontWeight: '500' }} 
        />
        
        {/* DYNAMIC AUDIO VISUALIZER */}
        {isListening && (
          <div className="audio-visualizer fade-in-slide">
            <div className="visualizer-bar"></div>
            <div className="visualizer-bar"></div>
            <div className="visualizer-bar"></div>
            <div className="visualizer-bar"></div>
            <div className="visualizer-bar"></div>
          </div>
        )}
        
        <button 
          onMouseDown={startListening}
          onMouseUp={stopListening}
          onMouseLeave={stopListening}
          className="btn"
          style={{ 
            width: '55px', height: '55px', borderRadius: '50%', background: isListening ? '#EF4444' : 'linear-gradient(135deg, #27272a 0%, #09090b 100%)', 
            color: 'white', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', 
            justifyContent: 'center', flexShrink: 0, marginLeft: '5px',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)'
          }}
          title="Hold to Talk"
        >
          {isListening ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"/></svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
          )}
        </button>
      </div>
      
      <button 
        onClick={handleProcess} 
        disabled={loading} 
        className="btn glass-panel"
        style={{ width: '100%', padding: '18px', fontSize: '18px', fontWeight: '600', background: loading ? 'rgba(255,255,255,0.05)' : 'rgba(0, 0, 0, 0.6)', color: 'white', borderRadius: '30px', cursor: loading ? 'not-allowed' : 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}>
        {loading ? "Processing Path..." : "Extract Needs & Route Patient"}
      </button>
      
      {result && result.allocations && (
        <div className="fade-in-slide glass-panel" style={{ marginTop: '40px', padding: '30px', borderRadius: '24px' }}>
          <h3 style={{ marginTop: 0, letterSpacing: '1px', fontSize: '0.9rem', color: '#94A3B8' }}>{'/// LIVE RESOURCE ALLOCATIONS'}</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '30px', marginTop: '20px' }}>
             <div className="glass-input" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid #10B981', borderTop: 'none', borderBottom: 'none', borderRight: 'none', background: 'rgba(0,0,0,0.6)' }}>
               <strong style={{color: '#94A3B8'}}>Bed</strong><br/><span style={{fontSize: '1.1rem', fontWeight: '500', display: 'inline-block', marginTop: '8px'}}>{result.allocations.bed}</span>
             </div>
             <div className="glass-input" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid #10B981', borderTop: 'none', borderBottom: 'none', borderRight: 'none', background: 'rgba(0,0,0,0.6)' }}>
               <strong style={{color: '#94A3B8'}}>Personnel</strong><br/><span style={{fontSize: '1.1rem', fontWeight: '500', display: 'inline-block', marginTop: '8px'}}>{result.allocations.personnel.join(', ') || 'None'}</span>
             </div>
             <div className="glass-input" style={{ padding: '20px', borderRadius: '16px', borderLeft: '4px solid #10B981', borderTop: 'none', borderBottom: 'none', borderRight: 'none', background: 'rgba(0,0,0,0.6)' }}>
               <strong style={{color: '#94A3B8'}}>Equipment</strong><br/><span style={{fontSize: '1.1rem', fontWeight: '500', display: 'inline-block', marginTop: '8px'}}>{result.allocations.equipment.join(', ') || 'None'}</span>
             </div>
          </div>
          
          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '20px 0' }} />
          <h3 style={{ color: '#94A3B8', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>↳ OPTIMIZED PATH</h3>
          <h2 style={{ color: '#10B981', margin: '10px 0 25px 0', lineHeight: '1.4', fontWeight: '600', textShadow: '0 0 20px rgba(16,185,129,0.3)' }}>{result.recommended_path}</h2>
          
          <button 
            onClick={handleBook} 
            disabled={bookingState !== 'idle'} 
            className="btn"
            style={{ width: '100%', padding: '18px', fontSize: '18px', fontWeight: '600', background: bookingState === 'booked' ? '#059669' : 'linear-gradient(135deg, #18181b 0%, #000000 100%)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '30px', cursor: bookingState === 'idle' ? 'pointer' : 'not-allowed', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px', boxShadow: '0 10px 20px rgba(0,0,0,0.6)' }}>
            {bookingState === 'idle' && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                Lock Resources & Dispatch
              </>
            )}
            {bookingState === 'booking' && "Locking Resources..."}
            {bookingState === 'booked' && (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                Resources Successfully Booked
              </>
            )}
          </button>

        </div>
      )}
    </div>
  );
}

// ==========================================
//        TAB 2: STAFF INVENTORY MANAGER
// ==========================================
function InventoryManager() {
  const [resources, setResources] = useState([]);
  const [newType, setNewType] = useState('bed');
  const [newName, setNewName] = useState('');

  const fetchResources = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/resources", { cache: "no-store" });
      setResources(await res.json());
    } catch (e) { console.error("Failed to fetch resources"); }
  };

  // --- LIVE WEBSOCKET CONNECTION ---
  useEffect(() => {
    fetchResources(); // Initial load
    
    const ws = new WebSocket("ws://localhost:8000/ws/inventory");
    
    ws.onmessage = (event) => {
      if (event.data === "update") {
        console.log("⚡ Live Update Received: Refreshing Inventory");
        fetchResources(); // Auto-refresh when someone locks a resource!
      }
    };

    return () => ws.close(); // Clean up on dismount
  }, []);

  const toggleStatus = async (id, currentStatus) => {
    const newStatus = currentStatus === 'Available' ? 'Occupied' : 'Available';
    await fetch(`http://localhost:8000/api/resources/${id}`, { method: 'PUT', headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    // WebSockets will automatically trigger the UI update now!
  };

  const addResource = async () => {
    if (!newName) return;
    await fetch("http://localhost:8000/api/resources", { method: 'POST', headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: newType, name: newName, status: 'Available' }) });
    setNewName(''); 
  };

  const deleteResource = async (id) => {
    await fetch(`http://localhost:8000/api/resources/${id}`, { method: 'DELETE' });
  };

  return (
    <div className="fade-in-slide">
      <h2 style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px', color: '#F8FAFC', fontWeight: '600', display: 'flex', justifyContent: 'space-between' }}>
        Staff Database Manager
        <span style={{ fontSize: '0.8rem', background: 'rgba(16, 185, 129, 0.2)', color: '#34D399', padding: '4px 10px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: '8px', height: '8px', background: '#34D399', borderRadius: '50%', display: 'inline-block' }}></span>
          Live Sync Active
        </span>
      </h2>
      
      {/* ADD NEW RESOURCE FORM */}
      <div className="glass-panel" style={{ padding: '20px', borderRadius: '24px', marginBottom: '30px', display: 'flex', gap: '15px' }}>
        <select value={newType} onChange={e => setNewType(e.target.value)} className="glass-input" style={{ padding: '15px', borderRadius: '16px', outline: 'none', fontFamily: 'inherit' }}>
            <option style={{background: '#000000'}} value="bed">Bed / Room</option>
            <option style={{background: '#000000'}} value="personnel">Personnel</option>
            <option style={{background: '#000000'}} value="equipment">Equipment</option>
        </select>
        <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. ICU Bed 16" className="glass-input" style={{ flex: 1, padding: '15px', borderRadius: '16px', outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={addResource} className="btn" style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '15px 30px', borderRadius: '16px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add
        </button>
      </div>

      {/* RESOURCES TABLE */}
      <div className="glass-panel" style={{ borderRadius: '24px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.4)', color: '#94A3B8' }}>
              <th style={{ padding: '20px', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Type</th>
              <th style={{ padding: '20px', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Name</th>
              <th style={{ padding: '20px', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Status</th>
              <th style={{ padding: '20px', textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '1px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((res, idx) => (
              <tr key={res.id} style={{ borderBottom: idx === resources.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
                <td style={{ padding: '20px', textTransform: 'capitalize', color: '#94A3B8' }}>{res.type}</td>
                <td style={{ padding: '20px', fontWeight: '600', color: '#F8FAFC' }}>{res.name}</td>
                <td style={{ padding: '20px' }}>
                  <span style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', textTransform: 'uppercase', background: res.status === 'Available' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', color: res.status === 'Available' ? '#34D399' : '#F87171', border: `1px solid ${res.status === 'Available' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}` }}>
                    {res.status}
                  </span>
                </td>
                <td style={{ padding: '20px', display: 'flex', gap: '10px' }}>
                  <button onClick={() => toggleStatus(res.id, res.status)} className="btn" style={{ padding: '8px 16px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', background: 'rgba(255,255,255,0.05)', color: '#E2E8F0', fontWeight: '500' }}>
                    Mark {res.status === 'Available' ? 'Occupied' : 'Available'}
                  </button>
                  
                  <button onClick={() => window.confirm(`Delete ${res.name}?`) && deleteResource(res.id)} className="btn" style={{ padding: '8px 16px', cursor: 'pointer', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '20px', background: 'rgba(239,68,68,0.1)', color: '#F87171', fontWeight: '500' }}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;