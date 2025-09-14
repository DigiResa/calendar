'use client';
import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL as string;

type Row = {
  id: number;
  starts_at: string;
  client_name: string;
  client_email?: string | null;
  client_phone?: string | null;
  zone_name?: string | null;
  staff_name?: string | null;
  meeting_mode?: 'visio'|'physique'|null;
  sent_3d?: 0|1|null;
  sent_24h?: 0|1|null;
  sent_3d_at?: string | null;
  sent_24h_at?: string | null;
};

function formatDateParis(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(d);
}

export default function RemindersPage(){
  const [from,setFrom] = useState<string>(()=> new Date().toISOString().slice(0,10));
  const [to,setTo] = useState<string>(()=> new Date(Date.now()+7*24*3600*1000).toISOString().slice(0,10));
  const [zone,setZone] = useState<string>('');
  const [loading,setLoading]=useState(false);
  const [rows,setRows]=useState<Row[]>([]);
  const [err,setErr]=useState<string|undefined>();

  async function load(){
    setLoading(true); setErr(undefined);
    try {
      const q = new URLSearchParams({ from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` } as any);
      if (zone) q.set('zone', zone);
      const data = await fetch(`${API}/admin/reminders?${q.toString()}`, { cache:'no-store' }).then(r=>r.json());
      setRows(Array.isArray(data)?data:[]);
    } catch (e:any) {
      setErr(e?.message||'Erreur');
      setRows([]);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ load(); },[]);

  async function send(id:number, kind:'3d'|'24h'){
    await fetch(`${API}/admin/reminders/${id}/send`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ kind }) });
    await load();
  }

  const filtered = rows;

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Rappels RDV</h1>
      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:12 }}>
        <label>Date de: <input type="date" value={from} onChange={e=>setFrom(e.target.value)} /></label>
        <label>à: <input type="date" value={to} onChange={e=>setTo(e.target.value)} /></label>
        <label>Zone: <input type="text" placeholder="(toutes)" value={zone} onChange={e=>setZone(e.target.value)} /></label>
        <button onClick={load} disabled={loading}>Recharger</button>
      </div>
      {err && <div style={{ color:'#b91c1c', marginBottom:8 }}>Erreur: {err}</div>}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Date</th>
              <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Client</th>
              <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Zone</th>
              <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Conseiller</th>
              <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>Mode</th>
              <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>J-3</th>
              <th style={{ textAlign:'left', borderBottom:'1px solid #e5e7eb', padding:'6px 4px' }}>24h</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id}>
                <td style={{ borderBottom:'1px solid #f3f4f6', padding:'6px 4px' }}>{formatDateParis(r.starts_at)}</td>
                <td style={{ borderBottom:'1px solid #f3f4f6', padding:'6px 4px' }}>{r.client_name}</td>
                <td style={{ borderBottom:'1px solid #f3f4f6', padding:'6px 4px' }}>{r.zone_name||''}</td>
                <td style={{ borderBottom:'1px solid #f3f4f6', padding:'6px 4px' }}>{r.staff_name||''}</td>
                <td style={{ borderBottom:'1px solid #f3f4f6', padding:'6px 4px' }}>{r.meeting_mode || ''}</td>
                <td style={{ borderBottom:'1px solid #f3f4f6', padding:'6px 4px' }}>
                  {r.sent_3d ? (
                    <span style={{ color:'#059669' }}>{r.sent_3d_at ? formatDateParis(r.sent_3d_at) : 'Envoyé'}</span>
                  ) : (
                    <button onClick={()=>send(r.id,'3d')}>Envoyer J-3</button>
                  )}
                </td>
                <td style={{ borderBottom:'1px solid #f3f4f6', padding:'6px 4px' }}>
                  {r.sent_24h ? (
                    <span style={{ color:'#059669' }}>{r.sent_24h_at ? formatDateParis(r.sent_24h_at) : 'Envoyé'}</span>
                  ) : (
                    <button onClick={()=>send(r.id,'24h')}>Envoyer 24h</button>
                  )}
                </td>
              </tr>
            ))}
            {!filtered.length && !loading && (
              <tr><td colSpan={7} style={{ padding:12, color:'#6b7280' }}>Aucun élément</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

