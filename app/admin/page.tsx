'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL as string;

type Zone = { id:number; name:string; color:string };
type Rule = { id:number; zone_id:number; weekday:number; start_time:string; end_time:string };
type Ex   = { id:number; zone_id:number; date:string; start_time:string; end_time:string; note?:string };
type Settings = { booking_step_min:number; default_duration_min:number; buffer_before_min:number; buffer_after_min:number; notice_min:number; window_days:number };
type SZR = { id:number; staff_id:number; zone_id:number; weekday:number; start_time:string; end_time:string };

export default function Admin(){
  // ---- STATE ----
  const [zones,setZones]=useState<Zone[]>([]);
  const [rules,setRules]=useState<Rule[]>([]);
  const [exs,setExs]=useState<Ex[]>([]);
  const [settings,setSettings]=useState<Settings|null>(null);
  const [szr,setSzr]=useState<SZR[]>([]);

  const [zn,setZn]=useState({name:'',color:'#6b21a8'});
  const [rl,setRl]=useState<Partial<Rule>>({zone_id:0,weekday:1,start_time:'09:00:00',end_time:'12:00:00'});
  const [ex,setEx]=useState<Partial<Ex>>({zone_id:0,date:'',start_time:'09:00:00',end_time:'12:00:00',note:''});
  const [szrNew,setSzrNew]=useState<Partial<SZR>>({staff_id:1,zone_id:0,weekday:1,start_time:'09:00:00',end_time:'12:00:00'});

  // ---- LOAD ----
  async function loadAll(){
    const [z,r,s,sz] = await Promise.all([
      fetch(`${API}/admin/zones`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/admin/zone_rules`).then(r=>r.json()).catch(()=>[]),
      fetch(`${API}/admin/settings`).then(r=>r.json()).catch(()=>null),
      fetch(`${API}/admin/staff_zone_rules`).then(r=>r.json()).catch(()=>[])
    ]);
    setZones(Array.isArray(z)?z:[]);
    setRules(Array.isArray(r)?r:[]);
    setSettings(s??null);
    setSzr(Array.isArray(sz)?sz:[]);
  }
  useEffect(()=>{ loadAll(); },[]);

  async function reloadSZR(){ const d=await fetch(`${API}/admin/staff_zone_rules`).then(r=>r.json()).catch(()=>[]); setSzr(Array.isArray(d)?d:[]); }

  // ---- CRUD ----
  async function addZone(name:string,color:string){ await fetch(`${API}/admin/zones`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,color})}); loadAll(); }
  async function updZone(z:Zone){ await fetch(`${API}/admin/zones/${z.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(z)}); loadAll(); }
  async function delZone(id:number){
    const r=await fetch(`${API}/admin/zones/${id}`,{method:'DELETE'});
    if(!r.ok){ const e=await r.json().catch(()=>({message:'Suppression impossible'})); alert(e.message||'Suppression impossible'); return; }
    loadAll();
  }

  async function addRule(r:Partial<Rule>){ await fetch(`${API}/admin/zone_rules`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)}); loadAll(); }
  async function updRule(r:Rule){ await fetch(`${API}/admin/zone_rules/${r.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(r)}); loadAll(); }
  async function delRule(id:number){ await fetch(`${API}/admin/zone_rules/${id}`,{method:'DELETE'}); loadAll(); }

  async function addEx(e:Partial<Ex>){ await fetch(`${API}/admin/zone_exceptions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)}); loadAll(); }
  async function updEx(e:Ex){ await fetch(`${API}/admin/zone_exceptions/${e.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(e)}); loadAll(); }
  async function delEx(id:number){ await fetch(`${API}/admin/zone_exceptions/${id}`,{method:'DELETE'}); loadAll(); }

  async function saveSettings(s:Settings){ await fetch(`${API}/admin/settings`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)}); loadAll(); }

  async function addSZR(x:Partial<SZR>){
    await fetch(`${API}/admin/staff_zone_rules`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(x)});
    reloadSZR();
  }
  async function updSZR(x:SZR){
    await fetch(`${API}/admin/staff_zone_rules/${x.id}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(x)});
    reloadSZR();
  }
  async function delSZR(id:number){
    await fetch(`${API}/admin/staff_zone_rules/${id}`,{method:'DELETE'}); reloadSZR();
  }

  return (
    <main style={{maxWidth:1100,margin:'24px auto',fontFamily:'ui-sans-serif',display:'grid',gap:24}}>
      <h1 style={{margin:0}}>Admin</h1>

      <section style={card}>
        <h2>Agendas</h2>
        <div style={{display:'flex',gap:12}}>
          <a href={`${API}/auth/google/init?staff_id=1`} style={btn}>Connecter Google (Staff 1)</a>
          <a href={`${API}/auth/google/init?staff_id=2`} style={btn}>Connecter Google (Staff 2)</a>
        </div>
      </section>

      <section style={card}>
        <h2>Zones</h2>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <input placeholder="Nom zone" value={zn.name} onChange={e=>setZn({...zn,name:e.target.value})} style={input}/>
          <input type="color" value={zn.color} onChange={e=>setZn({...zn,color:e.target.value})} style={input}/>
          <button onClick={()=>zn.name&&addZone(zn.name,zn.color)} style={btn}>Ajouter</button>
        </div>
        <table style={table}><thead><tr><th>ID</th><th>Nom</th><th>Couleur</th><th></th></tr></thead><tbody>
          {zones.map(z=>(
            <tr key={z.id}>
              <td>{z.id}</td>
              <td><input value={z.name} onChange={e=>setZones(p=>p.map(x=>x.id===z.id?{...x,name:e.target.value}:x))} style={inputSm}/></td>
              <td><input type="color" value={z.color} onChange={e=>setZones(p=>p.map(x=>x.id===z.id?{...x,color:e.target.value}:x))} style={inputSm}/></td>
              <td style={{display:'flex',gap:8}}>
                <button onClick={()=>updZone(z)} style={btnSm}>Enr.</button>
                <button onClick={()=>delZone(z.id)} style={btnDangerSm}>Suppr.</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </section>

      <section style={card}>
        <h2>Règles hebdomadaires</h2>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <select value={rl.zone_id} onChange={e=>setRl({...rl,zone_id:Number(e.target.value)})} style={input}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select value={rl.weekday} onChange={e=>setRl({...rl,weekday:Number(e.target.value)})} style={input}>
            {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((d,i)=><option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" value={rl.start_time!} onChange={e=>setRl({...rl,start_time:e.target.value})} style={input}/>
          <input type="time" value={rl.end_time!} onChange={e=>setRl({...rl,end_time:e.target.value})} style={input}/>
          <button onClick={()=>rl.zone_id&&addRule(rl)} style={btn}>Ajouter</button>
        </div>
        <table style={table}><thead><tr><th>ID</th><th>Zone</th><th>Jour</th><th>Début</th><th>Fin</th><th></th></tr></thead><tbody>
          {rules.map(r=>(
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>
                <select value={r.zone_id} onChange={e=>setRules(p=>p.map(x=>x.id===r.id?{...x,zone_id:Number(e.target.value)}:x))} style={inputSm}>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </td>
              <td>
                <select value={r.weekday} onChange={e=>setRules(p=>p.map(x=>x.id===r.id?{...x,weekday:Number(e.target.value)}:x))} style={inputSm}>
                  {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((d,i)=><option key={i} value={i}>{d}</option>)}
                </select>
              </td>
              <td><input type="time" value={r.start_time} onChange={e=>setRules(p=>p.map(x=>x.id===r.id?{...x,start_time:e.target.value}:x))} style={inputSm}/></td>
              <td><input type="time" value={r.end_time} onChange={e=>setRules(p=>p.map(x=>x.id===r.id?{...x,end_time:e.target.value}:x))} style={inputSm}/></td>
              <td style={{display:'flex',gap:8}}>
                <button onClick={()=>updRule(r)} style={btnSm}>Enr.</button>
                <button onClick={()=>delRule(r.id)} style={btnDangerSm}>Suppr.</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </section>

      <section style={card}>
        <h2>Exceptions datées</h2>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <select value={ex.zone_id} onChange={e=>setEx({...ex,zone_id:Number(e.target.value)})} style={input}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <input type="date" value={ex.date||''} onChange={e=>setEx({...ex,date:e.target.value})} style={input}/>
          <input type="time" value={ex.start_time!} onChange={e=>setEx({...ex,start_time:e.target.value})} style={input}/>
          <input type="time" value={ex.end_time!} onChange={e=>setEx({...ex,end_time:e.target.value})} style={input}/>
          <input placeholder="Note" value={ex.note||''} onChange={e=>setEx({...ex,note:e.target.value})} style={input}/>
          <button onClick={()=>ex.zone_id&&ex.date&&addEx(ex)} style={btn}>Ajouter</button>
        </div>
        <button onClick={async()=>{ const from=new Date(); const to=new Date(); to.setDate(to.getDate()+30);
          const data=await fetch(`${API}/admin/zone_exceptions?from=${from.toISOString().slice(0,10)}&to=${to.toISOString().slice(0,10)}`).then(r=>r.json()).catch(()=>[]);
          setExs(Array.isArray(data)?data:[]); }} style={btn}>Charger 30j</button>
        <table style={table}><thead><tr><th>ID</th><th>Zone</th><th>Date</th><th>Début</th><th>Fin</th><th>Note</th><th></th></tr></thead><tbody>
          {exs.map(e=>(
            <tr key={e.id}>
              <td>{e.id}</td>
              <td>
                <select value={e.zone_id} onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,zone_id:Number(ev.target.value)}:x))} style={inputSm}>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </td>
              <td><input type="date" value={e.date} onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,date:ev.target.value}:x))} style={inputSm}/></td>
              <td><input type="time" value={e.start_time} onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,start_time:ev.target.value}:x))} style={inputSm}/></td>
              <td><input type="time" value={e.end_time} onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,end_time:ev.target.value}:x))} style={inputSm}/></td>
              <td><input value={e.note||''} onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,note:ev.target.value}:x))} style={inputSm}/></td>
              <td style={{display:'flex',gap:8}}>
                <button onClick={()=>updEx(e)} style={btnSm}>Enr.</button>
                <button onClick={()=>delEx(e.id)} style={btnDangerSm}>Suppr.</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </section>

      <section style={card}>
        <h2>Paramètres</h2>
        {settings && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
            {[
              ['booking_step_min','Pas (min)'],
              ['default_duration_min','Durée (min)'],
              ['buffer_before_min','Buffer avant (min)'],
              ['buffer_after_min','Buffer après (min)'],
              ['notice_min','Préavis (min)'],
              ['window_days','Fenêtre (jours)'],
            ].map(([k,label])=>(
              <label key={k} style={{display:'flex',gap:6,alignItems:'center'}}>
                <span style={{width:160}}>{label}</span>
                <input type="number" value={(settings as any)[k]} onChange={e=>setSettings({...settings,[k]:Number(e.target.value)})} style={input}/>
              </label>
            ))}
            <button onClick={()=>saveSettings(settings)} style={{...btn,gridColumn:'1 / -1'}}>Enregistrer</button>
          </div>
        )}
      </section>

      {/* Générer planning express */}
      <section style={card}>
        <h2>Générer planning</h2>
        <p style={{marginTop:0}}>Règles L→V 09–18 ou exceptions sur plage de dates.</p>
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,alignItems:'center',marginBottom:12}}>
          <strong style={{gridColumn:'1 / -1'}}>Règles hebdo</strong>
          <select value={rl.zone_id} onChange={e=>setRl({...rl,zone_id:Number(e.target.value)})} style={input}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <div style={{gridColumn:'2 / span 2',display:'flex',gap:8,alignItems:'center'}}>
            <span>Lun→Ven</span>
          </div>
          <input type="time" defaultValue="09:00:00" onChange={e=>setRl({...rl,start_time:e.target.value})} style={input}/>
          <input type="time" defaultValue="18:00:00" onChange={e=>setRl({...rl,end_time:e.target.value})} style={input}/>
          <button
            onClick={async()=>{
              if(!rl.zone_id) return;
              await fetch(`${API}/admin/generate_weekly_rules`,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ zone_id: rl.zone_id, weekdays:[1,2,3,4,5], start_time: rl.start_time||'09:00:00', end_time: rl.end_time||'18:00:00', replace: true })
              });
              loadAll();
            }}
            style={{...btn, gridColumn:'1 / -1'}}
          >Générer L→V 09–18 (remplace)</button>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8,alignItems:'center'}}>
          <strong style={{gridColumn:'1 / -1'}}>Exceptions datées</strong>
          <select value={ex.zone_id||0} onChange={e=>setEx({...ex,zone_id:Number(e.target.value)})} style={input}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <input id="ex_from" type="date" onChange={e=>setEx({...ex,date:e.target.value})} style={input}/>
          <input id="ex_to" type="date" style={input}/>
          <input type="time" defaultValue="09:00:00" onChange={e=>setEx({...ex,start_time:e.target.value})} style={input}/>
          <input type="time" defaultValue="18:00:00" onChange={e=>setEx({...ex,end_time:e.target.value})} style={input}/>
          <button
            onClick={async()=>{
              const from_date = (document.getElementById('ex_from') as HTMLInputElement)?.value;
              const to_date   = (document.getElementById('ex_to') as HTMLInputElement)?.value;
              if(!(ex.zone_id && from_date && to_date)) return;
              await fetch(`${API}/admin/generate_exceptions_range`,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ zone_id: ex.zone_id, from_date, to_date, weekdays:[1,2,3,4,5], start_time: ex.start_time||'09:00:00', end_time: ex.end_time||'18:00:00', replace: true })
              });
              loadAll();
            }}
            style={{...btn, gridColumn:'1 / -1'}}
          >Générer exceptions L→V (remplace)</button>
        </div>
      </section>

      {/* RÈGLES STAFF × ZONE */}
      <section style={card}>
        <h2>Règles Staff × Zone</h2>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
          <select value={szrNew.staff_id} onChange={e=>setSzrNew({...szrNew,staff_id:Number(e.target.value)})} style={input}>
            {[1,2].map(s=> <option key={s} value={s}>Staff {s}</option>)}
          </select>
          <select value={szrNew.zone_id} onChange={e=>setSzrNew({...szrNew,zone_id:Number(e.target.value)})} style={input}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select value={szrNew.weekday} onChange={e=>setSzrNew({...szrNew,weekday:Number(e.target.value)})} style={input}>
            {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((d,i)=><option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" value={szrNew.start_time!} onChange={e=>setSzrNew({...szrNew,start_time:e.target.value})} style={input}/>
          <input type="time" value={szrNew.end_time!} onChange={e=>setSzrNew({...szrNew,end_time:e.target.value})} style={input}/>
          <button onClick={()=> szrNew.zone_id && addSZR(szrNew)} style={btn}>Ajouter</button>
        </div>

        <table style={table}><thead>
          <tr><th>ID</th><th>Staff</th><th>Zone</th><th>Jour</th><th>Début</th><th>Fin</th><th></th></tr>
        </thead><tbody>
          {szr.map(r=>(
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>
                <select value={r.staff_id} onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,staff_id:Number(e.target.value)}:x))} style={inputSm}>
                  {[1,2].map(s=><option key={s} value={s}>Staff {s}</option>)}
                </select>
              </td>
              <td>
                <select value={r.zone_id} onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,zone_id:Number(e.target.value)}:x))} style={inputSm}>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </td>
              <td>
                <select value={r.weekday} onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,weekday:Number(e.target.value)}:x))} style={inputSm}>
                  {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((d,i)=><option key={i} value={i}>{d}</option>)}
                </select>
              </td>
              <td><input type="time" value={r.start_time} onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,start_time:e.target.value}:x))} style={inputSm}/></td>
              <td><input type="time" value={r.end_time} onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,end_time:e.target.value}:x))} style={inputSm}/></td>
              <td style={{display:'flex',gap:8}}>
                <button onClick={()=>updSZR(r)} style={btnSm}>Enr.</button>
                <button onClick={()=>delSZR(r.id)} style={btnDangerSm}>Suppr.</button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </section>
    </main>
  );
}

// ---- STYLES ----
const card={border:'1px solid #e5e7eb',borderRadius:12,padding:16,background:'#fff'};
const table:any={width:'100%',borderCollapse:'collapse'};
const input:any={padding:'8px 10px',border:'1px solid #e5e7eb',borderRadius:8};
const inputSm:any={padding:'6px 8px',border:'1px solid #e5e7eb',borderRadius:6,width:'100%'};
const btn:any={padding:'8px 12px',background:'#6b21a8',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'};
const btnSm:any={padding:'6px 8px',background:'#10b981',color:'#fff',border:'none',borderRadius:6,cursor:'pointer'};
const btnDangerSm:any={padding:'6px 8px',background:'#ef4444',color:'#fff',border:'none',borderRadius:6,cursor:'pointer'};
