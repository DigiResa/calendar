'use client';
import { useEffect, useMemo, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL as string;

type Staff = { id:number; name:string };
type Zone = { id:number; name:string; color?:string };
type SZR = { id:number; staff_id:number; zone_id:number; weekday:number; start_time:string; end_time:string };

const WEEKDAYS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

export default function StaffZonesPage(){
  const [staffs,setStaffs]=useState<Staff[]>([]);
  const [zones,setZones]=useState<Zone[]>([]);
  const [rules,setRules]=useState<SZR[]>([]);
  const [loading,setLoading]=useState(true);

  const [staffId,setStaffId]=useState<number>(1);
  const [startTime,setStartTime]=useState('09:00:00');
  const [endTime,setEndTime]=useState('18:00:00');

  // Matrix: key `${zone_id}-${weekday}` -> boolean
  const [matrix,setMatrix]=useState<Record<string,boolean>>({});

  async function loadAll(){
    setLoading(true);
    try{
      const [s,z,sz] = await Promise.all([
        fetch(`${API}/admin/staff`).then(r=>r.json()).catch(()=>[]),
        fetch(`${API}/admin/zones`).then(r=>r.json()).catch(()=>[]),
        fetch(`${API}/admin/staff_zone_rules`).then(r=>r.json()).catch(()=>[]),
      ]);
      setStaffs(Array.isArray(s)?s:[]);
      setZones(Array.isArray(z)?z:[]);
      setRules(Array.isArray(sz)?sz:[]);
    } finally { setLoading(false); }
  }
  useEffect(()=>{ loadAll(); },[]);

  // Compute matrix from rules for selected staff
  useEffect(()=>{
    const m:Record<string,boolean>={};
    for (const r of rules){
      if (r.staff_id!==staffId) continue;
      m[`${r.zone_id}-${r.weekday}`] = true;
      // capture first times found
      if (startTime==='09:00:00' && endTime==='18:00:00'){
        if (r.start_time) setStartTime(r.start_time);
        if (r.end_time) setEndTime(r.end_time);
      }
    }
    setMatrix(m);
  },[rules,staffId]);

  function toggle(zoneId:number, weekday:number){
    const k = `${zoneId}-${weekday}`;
    setMatrix(prev=> ({...prev, [k]: !prev[k]}));
  }

  const existingMap = useMemo(()=>{
    const map = new Map<string,SZR>();
    for (const r of rules){
      if (r.staff_id!==staffId) continue;
      map.set(`${r.zone_id}-${r.weekday}`, r);
    }
    return map;
  },[rules,staffId]);

  async function save(){
    const ops:Promise<any>[]=[];
    // Create or update
    for (const z of zones){
      for (let wd=0; wd<7; wd++){
        const k=`${z.id}-${wd}`;
        const checked = !!matrix[k];
        const ex = existingMap.get(k);
        if (checked && !ex){
          ops.push(fetch(`${API}/admin/staff_zone_rules`,{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ staff_id: staffId, zone_id: z.id, weekday: wd, start_time: startTime, end_time: endTime })
          }));
        } else if (checked && ex && (ex.start_time!==startTime || ex.end_time!==endTime)){
          ops.push(fetch(`${API}/admin/staff_zone_rules/${ex.id}`,{
            method:'PUT', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ staff_id: staffId, zone_id: z.id, weekday: wd, start_time: startTime, end_time: endTime })
          }));
        } else if (!checked && ex){
          ops.push(fetch(`${API}/admin/staff_zone_rules/${ex.id}`,{ method:'DELETE' }));
        }
      }
    }
    await Promise.all(ops).catch(()=>{});
    await loadAll();
  }

  if (loading) return <div style={pageStyles.container}>Chargement…</div>;

  return (
    <div style={pageStyles.container}>
      <h1 style={{margin:'12px 0 16px'}}>Disponibilités Staff × Zones (hebdo)</h1>
      <div style={pageStyles.toolbar}>
        <label style={pageStyles.row}>
          <span>Staff</span>
          <select value={staffId} onChange={e=>setStaffId(Number(e.target.value))} style={pageStyles.select}>
            {staffs.map(s=>(<option key={s.id} value={s.id}>{s.name||`Staff ${s.id}`}</option>))}
          </select>
        </label>
        <label style={pageStyles.row}>
          <span>Début</span>
          <input type="time" value={startTime.slice(0,5)} onChange={e=>setStartTime((e.target.value.length===5?e.target.value+':00':e.target.value))} style={pageStyles.input}/>
        </label>
        <label style={pageStyles.row}>
          <span>Fin</span>
          <input type="time" value={endTime.slice(0,5)} onChange={e=>setEndTime((e.target.value.length===5?e.target.value+':00':e.target.value))} style={pageStyles.input}/>
        </label>
        <button onClick={save} style={pageStyles.saveBtn}>Enregistrer</button>
      </div>

      <div style={pageStyles.grid}>
        <div style={pageStyles.gridHeader}></div>
        {WEEKDAYS.map((d,i)=>(<div key={i} style={pageStyles.gridHeader}>{d}</div>))}
        {zones.map(z=> (
          <>
            <div key={`z-${z.id}`} style={{...pageStyles.zoneCell, borderLeft:`3px solid ${z.color||'#6b21a8'}`}}>{z.name}</div>
            {WEEKDAYS.map((_,wd)=>{
              const k=`${z.id}-${wd}`;
              const checked = !!matrix[k];
              return (
                <label key={k} style={pageStyles.cell}>
                  <input type="checkbox" checked={checked} onChange={()=>toggle(z.id,wd)} />
                </label>
              );
            })}
          </>
        ))}
      </div>

      <p style={{marginTop:12, color:'#6b7280', fontSize:13}}>
        Astuce: vous pouvez aussi définir des règles par date précise via l'API /admin/staff_zone_date_rules pour gérer des exceptions ponctuelles. Les sélections de zone Matin/Après‑midi au calendrier pilotent l'affichage.
      </p>
    </div>
  );
}

const pageStyles:any = {
  container:{ maxWidth:1000, margin:'24px auto', fontFamily:'ui-sans-serif', padding:'0 12px' },
  toolbar:{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap', marginBottom:12 },
  row:{ display:'flex', alignItems:'center', gap:6 },
  select:{ padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:8, background:'#fff' },
  input:{ padding:'6px 10px', border:'1px solid #e5e7eb', borderRadius:8 },
  saveBtn:{ padding:'8px 12px', background:'#6b21a8', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' },
  grid:{ display:'grid', gridTemplateColumns:'200px repeat(7,1fr)', border:'1px solid #e5e7eb', borderRadius:8, overflow:'hidden' },
  gridHeader:{ padding:8, borderBottom:'1px solid #e5e7eb', background:'#f9fafb', fontWeight:600, textAlign:'center' },
  zoneCell:{ padding:8, borderBottom:'1px solid #e5e7eb', background:'#fff', fontWeight:500 },
  cell:{ display:'flex', alignItems:'center', justifyContent:'center', padding:8, borderLeft:'1px solid #e5e7eb', borderBottom:'1px solid #e5e7eb' }
};

