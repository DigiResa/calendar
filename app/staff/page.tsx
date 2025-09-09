'use client';
import { useEffect, useState, useMemo } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';
dayjs.extend(utc); dayjs.extend(tz);
const API = process.env.NEXT_PUBLIC_API_URL as string;

type Slot = { start:string; end:string; zone:string; zone_id?:number; available_staff_ids:number[] };

export default function Staff(){
  const [today,setToday]=useState<string>(new Date().toISOString().slice(0,10));
  const [zone,setZone]=useState<string|undefined>();
  const [zonesList,setZonesList]=useState<{id:number;name:string}[]>([]);
  const [slots,setSlots]=useState<Slot[]>([]);
  const [staffFilter,setStaffFilter]=useState<number|undefined>();
  const [staffs,setStaffs]=useState<{id:number,name:string}[]>([]);
  const staffMap = useMemo(()=>Object.fromEntries(staffs.map(s=>[s.id,s.name])),[staffs]);

  const [modalOpen,setModalOpen]=useState(false);
  const [selectedSlot,setSelectedSlot]=useState<Slot|null>(null);

  useEffect(()=>{ 
    fetch(`${API}/admin/zones`).then(r=>r.json()).then(z=>setZonesList(Array.isArray(z)?z:[]));
    fetch(`${API}/admin/staff`).then(r=>r.json()).then(d=>setStaffs(Array.isArray(d)?d:[]));
  },[]);

  useEffect(()=>{
    const from=new Date(`${today}T00:00:00`);
    const to=new Date(`${today}T23:59:59`);
    const p=new URLSearchParams({from:from.toISOString(),to:to.toISOString(),...(zone?{zone}:{})} as any);
    fetch(`${API}/availability?${p.toString()}&_=${Date.now()}`, { cache:'no-store' })
      .then(r=>r.json())
      .then(d=>setSlots(Array.isArray(d.slots)?d.slots:[]))
      .catch(()=>setSlots([]));
  },[today,zone]);

  const viewSlots = useMemo(()=>{
    if (!staffFilter) return slots;
    return slots.filter(s=> s.available_staff_ids?.includes(staffFilter));
  },[slots, staffFilter]);

  return (
    <main style={{maxWidth:900,margin:'24px auto',fontFamily:'ui-sans-serif'}}>
      <h1>Vue Staff</h1>
      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center',flexWrap:'wrap'}}>
        <input type="date" value={today} onChange={e=>setToday(e.target.value)} />
        {zonesList.map(z=>
          <button key={z.id} onClick={()=>setZone(z.name)} style={styles.chip}>{z.name}</button>
        )}
        <button onClick={()=>setZone(undefined)} style={styles.chip}>Toutes</button>

        <select
          value={staffFilter??0}
          onChange={e=>setStaffFilter(Number(e.target.value)||undefined)}
          style={styles.select}
        >
          <option value={0}>Tous</option>
          {staffs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <ul style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
        {viewSlots.map((s,i)=>(
          <li key={i}
              style={{border:'1px solid #e5e7eb',padding:8,borderRadius:8,cursor:'pointer'}}
              onClick={()=>{ setSelectedSlot(s); setModalOpen(true); }}>
            <b>{new Date(s.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</b>
            {' '}→ {new Date(s.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
            <div>Zone : {s.zone}</div>
            <div>
              Staff libres : {
                s.available_staff_ids.length
                  ? s.available_staff_ids.map(id=>staffMap[id]||`Staff ${id}`).join(', ')
                  : '—'
              }
            </div>
          </li>
        ))}
        {viewSlots.length===0 && <li style={{gridColumn:'1 / -1',padding:12,color:'#6b7280'}}>Aucun créneau pour cette journée.</li>}
      </ul>

      <BookingModal
        open={modalOpen}
        onClose={()=>setModalOpen(false)}
        slot={selectedSlot}
        staffMap={staffMap}
      />
    </main>
  );
}

const styles:any = {
  chip:{ padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:999, background:'#fff', cursor:'pointer' },
  select:{ padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff' },
  backdrop:{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex',alignItems:'center',justifyContent:'center',zIndex:50 },
  modal:{ background:'#fff', padding:20, borderRadius:12, maxWidth:500, width:'100%' },
  input:{ padding:'8px 10px', border:'1px solid #e5e7eb', borderRadius:8, width:'100%' },
  primaryBtn:{ padding:'8px 12px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' },
  secondaryBtn:{ padding:'8px 12px', background:'#e5e7eb', border:'none', borderRadius:8, cursor:'pointer' }
};

function BookingModal({
  open, onClose, slot, staffMap
}:{open:boolean; onClose:()=>void; slot:Slot|null; staffMap:Record<number,string>}){
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [tel,setTel]=useState('');
  const [title,setTitle]=useState(''); const [notes,setNotes]=useState(''); const [att,setAtt]=useState('');
  const [staffId,setStaffId]=useState<number|undefined>(undefined);
  const [loading,setLoading]=useState(false); const [ok,setOk]=useState<string|null>(null); const [err,setErr]=useState<string|null>(null);

  useEffect(()=>{ if(open){ setName(''); setEmail(''); setTel(''); setTitle(''); setNotes(''); setAtt(''); setStaffId(undefined); setOk(null); setErr(null); setLoading(false);} },[open]);
  if(!open||!slot) return null;

  async function book(){
    setLoading(true); setOk(null); setErr(null);
    try{
      const localStart = dayjs(slot.start).tz('Europe/Paris').format();
      const localEnd   = dayjs(slot.end).tz('Europe/Paris').format();
      const body:any = {
        slot_start: localStart, slot_end: localEnd, zone_name:slot.zone,
        client_name:name, client_email:email, client_phone:tel,
        summary:title, notes,
        attendees: att.split(',').map(s=>s.trim()).filter(Boolean),
      };
      if (staffId) body.staff_id = staffId;
      const res=await fetch(`${API}/book`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},
        body:JSON.stringify(body)
      });
      const data=await res.json(); if(!res.ok) throw new Error(data?.detail||data?.error||'Erreur');
      setOk(`Réservé. ${staffMap[data.staff_id]||`Staff ${data.staff_id}`}. Event ${data.event_id||''}`);
    }catch(e:any){ setErr(e.message||'Erreur'); } finally{ setLoading(false); }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e=>e.stopPropagation()}>
        <h3 style={{margin:0}}>Créer un événement</h3>
        <p style={{marginTop:8}}>
          <b>{new Date(slot.start).toLocaleString('fr-FR')}</b>
          {' '}→ {new Date(slot.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
          {' '}· Zone <b>{slot.zone}</b>
        </p>

        <div style={{display:'grid',gap:8}}>
          <input placeholder="Titre (optionnel)" value={title} onChange={e=>setTitle(e.target.value)} style={styles.input}/>
          <textarea placeholder="Notes (optionnel)" value={notes} onChange={e=>setNotes(e.target.value)} style={{...styles.input,minHeight:70}} />
          <input placeholder="Invités (emails, séparés par virgules)" value={att} onChange={e=>setAtt(e.target.value)} style={styles.input}/>

          <div style={{display:'flex',gap:8}}>
            <select value={staffId??0} onChange={e=>setStaffId(Number(e.target.value)||undefined)} style={styles.input}>
              <option value={0}>Auto (least-load)</option>
              {slot.available_staff_ids.map(id=><option key={id} value={id}>{staffMap[id]||`Staff ${id}`}</option>)}
            </select>
            <input placeholder="Nom client *" value={name} onChange={e=>setName(e.target.value)} style={styles.input}/>
          </div>
          <div style={{display:'flex',gap:8}}>
            <input placeholder="Email client" value={email} onChange={e=>setEmail(e.target.value)} style={styles.input}/>
            <input placeholder="Téléphone" value={tel} onChange={e=>setTel(e.target.value)} style={styles.input}/>
          </div>

          <button onClick={book} disabled={!name||loading} style={styles.primaryBtn}>{loading?'Création…':'Créer l’événement'}</button>
          {ok && <div style={{color:'#16a34a',fontSize:13}}>{ok}</div>}
          {err && <div style={{color:'#dc2626',fontSize:13}}>{err}</div>}
          <button onClick={onClose} style={styles.secondaryBtn}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
