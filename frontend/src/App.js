import React, { useState, useRef, useEffect, useCallback } from 'react';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace(/^http/, 'ws');

const EXAMPLES = [
  'Car crash, unconscious, massive bleeding',
  'Heart attack with chest pain',
  'Premature baby needs NICU',
  'Stroke with seizure',
];
const TYPE_LABELS = { bed: 'Beds and rooms', personnel: 'Staff', equipment: 'Equipment' };
const isAlert = (s) => s.startsWith('ALERT');

const Mark = () => (
  <svg className="mark" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="2" width="9" height="9" rx="2" />
    <rect x="13" y="2" width="9" height="9" rx="2" />
    <rect x="2" y="13" width="9" height="9" rx="2" />
    <rect x="13" y="13" width="9" height="9" rx="2" className="hot" />
  </svg>
);

// Checks the backend on load and retries, because a sleeping free server takes a while to wake.
function useServerStatus() {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let stop = false;
    let timer;
    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/api/resources`, { cache: 'no-store' });
        if (res.ok) { if (!stop) setOnline(true); return; }
      } catch (e) { /* retry below */ }
      if (!stop) timer = setTimeout(ping, 4000);
    };
    ping();
    return () => { stop = true; clearTimeout(timer); };
  }, []);
  return online;
}

function App() {
  const [tab, setTab] = useState('triage');
  const online = useServerStatus();

  return (
    <>
      <header className="topbar">
        <div className="brand"><Mark />FlowGrid</div>
        <nav className="tabs">
          <button className="tab" aria-current={tab === 'triage'} onClick={() => setTab('triage')}>Voice triage</button>
          <button className="tab" aria-current={tab === 'inventory'} onClick={() => setTab('inventory')}>Staff inventory</button>
        </nav>
        <div className="status" role="status">
          <span className={`dot ${online ? '' : 'wait'}`} />
          <span className="stext">{online ? 'Server online' : 'Waking the server, this can take a minute'}</span>
        </div>
      </header>
      <main className="page">
        {tab === 'triage' ? <VoiceTriage /> : <InventoryManager />}
      </main>
    </>
  );
}

// ==========================================
//          TAB 1: VOICE TRIAGE
// ==========================================
function VoiceTriage() {
  const [transcript, setTranscript] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [booking, setBooking] = useState('idle');
  const [notice, setNotice] = useState('');
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

  const speak = (text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const preferred = voices.find((v) => /Jenny|Google UK English Female|Google US English|Zira/.test(v.name));
    if (preferred) utterance.voice = preferred;
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  const startListening = () => {
    if (isListeningRef.current) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setNotice('Voice input isn’t supported in this browser. Use Chrome or Edge, or type the emergency instead.'); return; }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
    recognition.onresult = (event) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      setTranscript(text);
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

  // Hold the space bar to talk (ignored while typing in a field)
  useEffect(() => {
    const typing = (e) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
    const down = (e) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      if (!e.repeat) startListening();
    };
    const up = (e) => {
      if (e.code !== 'Space' || typing(e)) return;
      e.preventDefault();
      stopListening();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProcess = async () => {
    const text = transcript.trim();
    if (!text) return;
    stopListening();
    setLoading(true); setResult(null); setBooking('idle'); setNotice('');
    try {
      const res = await fetch(`${API_URL}/api/coordinate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.detail || 'The server couldn’t process that request.');
      } else {
        setResult(data);
        setSubmitted(text);
        const { bed, personnel, equipment } = data.allocations;
        const staff = personnel.filter((p) => !isAlert(p)).map((d) => d.replace('(', ', ').replace(')', ''));
        const gear = equipment.filter((e) => !isAlert(e));
        let say = isAlert(bed) ? 'No suitable bed is available. ' : `Routing patient to ${bed}. `;
        if (staff.length) say += `Paging ${staff.join(' and ')}. `;
        if (gear.length) say += `Please prepare ${gear.join(' and ')}.`;
        speak(say);
      }
    } catch (e) {
      setNotice('Can’t reach the server. If it was idle, wait a minute and try again.');
    }
    setLoading(false);
  };

  const handleBook = async () => {
    setBooking('booking'); setNotice('');
    try {
      const res = await fetch(`${API_URL}/api/book`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.allocations),
      });
      if (res.ok) {
        setBooking('booked');
        speak('Resources locked and dispatch logged.');
      } else {
        const err = await res.json().catch(() => ({}));
        setNotice(err.detail || 'Booking failed.');
        setResult(null);
        setBooking('idle');
      }
    } catch (e) {
      setNotice('Can’t reach the server. Try again in a moment.');
      setBooking('idle');
    }
  };

  const newCase = () => { setTranscript(''); setResult(null); setBooking('idle'); setNotice(''); };

  const alloc = result && result.allocations;
  const stops = alloc ? [
    { label: 'Incoming case', value: submitted, kind: 'case' },
    { label: 'Bed or room', value: alloc.bed },
    ...(alloc.personnel.length ? alloc.personnel.map((p) => ({ label: 'Staff', value: p })) : [{ label: 'Staff', value: 'None requested', kind: 'none' }]),
    ...(alloc.equipment.length ? alloc.equipment.map((e) => ({ label: 'Equipment', value: e })) : [{ label: 'Equipment', value: 'None requested', kind: 'none' }]),
  ] : [];
  const unavailable = stops.filter((s) => !s.kind && isAlert(s.value)).length;
  const bookable = alloc && [alloc.bed, ...alloc.personnel, ...alloc.equipment].some((v) => !isAlert(v));

  return (
    <div className="triage">
      <section>
        <h1>Describe the emergency</h1>
        <p className="lede">Say or type what’s happening. FlowGrid finds a bed, the right specialists and equipment.</p>

        <div className={`voicebox ${isListening ? 'live' : ''}`}>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleProcess(); } }}
            placeholder="e.g. Trauma patient, needs an orthopedist"
            aria-label="Emergency description"
          />
          {isListening && <div className="bars" aria-hidden="true"><i /><i /><i /><i /></div>}
          <button
            className={`mic ${isListening ? 'live' : ''}`}
            onMouseDown={startListening} onMouseUp={stopListening} onMouseLeave={stopListening}
            onTouchStart={startListening} onTouchEnd={stopListening}
            aria-label="Hold to talk"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>
        </div>
        <p className="hint">Hold the space bar or the mic button to talk. Press Enter to route.</p>

        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => setTranscript(ex)}>{ex}</button>
          ))}
        </div>

        <button className="btn block" onClick={handleProcess} disabled={loading || !transcript.trim()}>
          {loading ? 'Finding resources…' : 'Find resources'}
        </button>
      </section>

      <section aria-live="polite">
        {notice && <div className="notice" role="alert">{notice}</div>}

        {!result ? (
          <div className="plan empty">
            <h2>No patient routed yet</h2>
            <p>The dispatch plan appears here once you describe an emergency.</p>
          </div>
        ) : (
          <div className="plan">
            <h2>Dispatch plan</h2>
            <ol className="route">
              {stops.map((s, i) => {
                const bad = !s.kind && isAlert(s.value);
                return (
                  <li key={i} className={`stop ${s.kind || ''} ${bad ? 'alert' : ''}`}>
                    <small>{s.label}</small>
                    <strong>{bad ? s.value.replace('ALERT: ', '') : s.value}</strong>
                  </li>
                );
              })}
            </ol>
            {unavailable > 0 && <p className="note">{unavailable} unavailable right now. The rest can still be locked.</p>}
            <div className="actions">
              <button className={`btn ${booking === 'booked' ? 'done' : ''}`} onClick={handleBook} disabled={booking !== 'idle' || !bookable}>
                {booking === 'idle' && 'Lock resources and dispatch'}
                {booking === 'booking' && 'Locking…'}
                {booking === 'booked' && 'Resources locked'}
              </button>
              <button className="btn ghost" onClick={newCase}>New case</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// ==========================================
//          TAB 2: STAFF INVENTORY
// ==========================================
function InventoryManager() {
  const [items, setItems] = useState([]);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [newType, setNewType] = useState('bed');
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/resources`, { cache: 'no-store' });
      setItems(await res.json());
      setError('');
    } catch (e) {
      setError('Can’t reach the server. It may still be waking up.');
    }
  }, []);

  // Live updates over WebSocket, reconnecting automatically if the server restarts
  useEffect(() => {
    let ws;
    let closed = false;
    let timer;
    const connect = () => {
      ws = new WebSocket(`${WS_URL}/ws/inventory`);
      ws.onopen = () => { setLive(true); load(); };
      ws.onmessage = (event) => { if (event.data === 'update') load(); };
      ws.onclose = () => { setLive(false); if (!closed) timer = setTimeout(connect, 3000); };
    };
    load();
    connect();
    return () => { closed = true; clearTimeout(timer); if (ws) ws.close(); };
  }, [load]);

  const send = async (path, method, body) => {
    try {
      await fetch(`${API_URL}${path}`, {
        method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body),
      });
      load();
    } catch (e) {
      setError('Couldn’t save that change. Try again.');
    }
  };

  const toggle = (r) => send(`/api/resources/${r.id}`, 'PUT', { status: r.status === 'Available' ? 'Occupied' : 'Available' });
  const remove = (r) => window.confirm(`Delete ${r.name}?`) && send(`/api/resources/${r.id}`, 'DELETE');
  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    await send('/api/resources', 'POST', { type: newType, name, status: 'Available' });
    setNewName('');
  };

  const stats = Object.keys(TYPE_LABELS).map((t) => {
    const all = items.filter((i) => i.type === t);
    return { t, free: all.filter((i) => i.status === 'Available').length, total: all.length };
  });
  const visible = items.filter((i) => (filter === 'all' || i.type === filter) && i.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div>
      <div className="inv-head">
        <h1>Staff inventory</h1>
        <div className="sync"><span className={`dot ${live ? '' : 'wait'}`} />{live ? 'Live sync on' : 'Reconnecting…'}</div>
      </div>

      {error && <div className="notice" role="alert">{error}</div>}

      <div className="summary">
        {stats.map((s) => (
          <div key={s.t}>
            <p>{TYPE_LABELS[s.t]}</p>
            <b>{s.free}</b> <span>of {s.total} available</span>
          </div>
        ))}
      </div>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter by type">
          {['all', ...Object.keys(TYPE_LABELS)].map((t) => (
            <button key={t} aria-pressed={filter === t} onClick={() => setFilter(t)}>{t === 'all' ? 'All' : TYPE_LABELS[t]}</button>
          ))}
        </div>
        <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name" aria-label="Search resources" />
      </div>

      <div className="addrow">
        <select className="field" value={newType} onChange={(e) => setNewType(e.target.value)} aria-label="Resource type">
          <option value="bed">Bed or room</option>
          <option value="personnel">Personnel</option>
          <option value="equipment">Equipment</option>
        </select>
        <input className="field" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="e.g. ICU Bed 16" aria-label="New resource name" />
        <button className="btn" onClick={add}>Add resource</button>
      </div>

      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>Type</th><th>Name</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td className="empty" colSpan="4">Nothing matches. Clear the search or add a resource above.</td></tr>
            )}
            {visible.map((r) => (
              <tr key={r.id}>
                <td className="type">{TYPE_LABELS[r.type] || r.type}</td>
                <td className="name">{r.name}</td>
                <td><span className={`badge ${r.status === 'Available' ? 'ok' : 'busy'}`}>{r.status}</span></td>
                <td className="row-actions">
                  <button className="btn ghost small" onClick={() => toggle(r)}>Mark {r.status === 'Available' ? 'occupied' : 'available'}</button>
                  <button className="btn danger small" onClick={() => remove(r)}>Delete</button>
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