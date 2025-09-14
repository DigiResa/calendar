'use client';
import { useEffect, useMemo, useState } from 'react';

const APP_PIN = (process.env.NEXT_PUBLIC_ACCESS_PIN || '').trim();

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState<boolean>(false);
  const [pin, setPin] = useState<string>('');
  const [err, setErr] = useState<string>('');

  useEffect(() => {
    try {
      const v = localStorage.getItem('access_pin_ok_v1');
      setOk(v === '1');
    } catch {}
  }, []);

  const onSubmit = () => {
    setErr('');
    if (!APP_PIN) { setErr('PIN non configuré'); return; }
    if (pin.trim() === APP_PIN) {
      try { localStorage.setItem('access_pin_ok_v1', '1'); } catch {}
      setOk(true);
    } else {
      setErr('Code incorrect');
    }
  };

  if (ok) return <>{children}</>;

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <h2 style={styles.title}>Accès protégé</h2>
        <p style={styles.desc}>Veuillez saisir le code PIN pour accéder.</p>
        <input
          autoFocus
          value={pin}
          onChange={e=>setPin(e.target.value)}
          onKeyDown={e=>{ if (e.key==='Enter') onSubmit(); }}
          placeholder="Code PIN"
          style={styles.input}
        />
        {!!err && <div style={styles.err}>{err}</div>}
        <button onClick={onSubmit} style={styles.btn}>Entrer</button>
      </div>
    </div>
  );
}

const styles: any = {
  wrap: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
  },
  card: {
    width: 360, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 24,
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
  },
  title: { margin: 0, fontSize: 18, fontWeight: 600, color: '#111827' },
  desc: { margin: '8px 0 16px', color: '#6b7280', fontSize: 14 },
  input: { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14 },
  err: { marginTop: 8, color: '#b91c1c', fontSize: 13 },
  btn: {
    marginTop: 12, width: '100%', padding: '10px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6,
    fontSize: 14, fontWeight: 600, cursor: 'pointer'
  }
};

