'use client';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL as string;

type Zone = { id:number; name:string; color:string };
type Rule = { id:number; zone_id:number; weekday:number; start_time:string; end_time:string };
type Ex   = { id:number; zone_id:number; date:string; start_time:string; end_time:string; note?:string };
type Settings = {
  booking_step_min: number;
  default_duration_min: number;
  buffer_before_min: number;
  buffer_after_min: number;
  notice_min: number;
  window_days: number;
  // Optionnels (peuvent ne pas exister selon l'instance SQL)
  demo_visio_duration_min?: number | null;
  demo_visio_buffer_before_min?: number | null;
  demo_visio_buffer_after_min?: number | null;
  demo_physique_duration_min?: number | null;
};
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
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>⚙️</div>
            <h1 style={styles.title}>Administration</h1>
          </div>
          <nav style={styles.nav}>
            <a href="/" style={styles.navLink}>← Retour au calendrier</a>
          </nav>
        </div>
      </header>

      <main style={styles.main}>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Connexions Google Agenda</h2>
          <p style={styles.cardDescription}>Synchronisez les calendriers Google des membres de l'équipe</p>
        </div>
        <div style={styles.buttonGroup}>
          <a href={`${API}/auth/google/init?staff_id=1`} style={styles.primaryButton}>
            <GoogleIcon />
            Connecter Staff 1
          </a>
          <a href={`${API}/auth/google/init?staff_id=2`} style={styles.primaryButton}>
            <GoogleIcon />
            Connecter Staff 2
          </a>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Zones</h2>
          <p style={styles.cardDescription}>Gérez les différentes zones de réservation</p>
        </div>
        <div style={styles.formRow}>
          <input 
            placeholder="Nom de la zone" 
            value={zn.name} 
            onChange={e=>setZn({...zn,name:e.target.value})} 
            style={styles.input}
          />
          <div style={styles.colorInputWrapper}>
            <input 
              type="color" 
              value={zn.color} 
              onChange={e=>setZn({...zn,color:e.target.value})} 
              style={styles.colorInput}
            />
            <span style={styles.colorLabel}>Couleur</span>
          </div>
          <button 
            onClick={()=>zn.name&&addZone(zn.name,zn.color)} 
            style={styles.addButton}
            disabled={!zn.name}
          >
            <PlusIcon />
            Ajouter
          </button>
        </div>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Nom</th>
                <th style={styles.th}>Couleur</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
          {zones.map(z=>(
            <tr key={z.id} style={styles.tableRow}>
              <td style={styles.td}>{z.id}</td>
              <td style={styles.td}>
                <input 
                  value={z.name} 
                  onChange={e=>setZones(p=>p.map(x=>x.id===z.id?{...x,name:e.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <div style={styles.colorPreview}>
                  <input 
                    type="color" 
                    value={z.color} 
                    onChange={e=>setZones(p=>p.map(x=>x.id===z.id?{...x,color:e.target.value}:x))} 
                    style={styles.tableColorInput}
                  />
                  <div style={{...styles.colorSwatch, backgroundColor: z.color}}></div>
                </div>
              </td>
              <td style={styles.td}>
                <div style={styles.actionButtons}>
                  <button onClick={()=>updZone(z)} style={styles.saveButton}>
                    <SaveIcon />
                  </button>
                  <button onClick={()=>delZone(z.id)} style={styles.deleteButton}>
                    <DeleteIcon />
                  </button>
                </div>
              </td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Règles hebdomadaires</h2>
          <p style={styles.cardDescription}>Définissez les horaires d'ouverture par zone et jour de la semaine</p>
        </div>
        <div style={styles.formRow}>
          <select value={rl.zone_id} onChange={e=>setRl({...rl,zone_id:Number(e.target.value)})} style={styles.select}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select value={rl.weekday} onChange={e=>setRl({...rl,weekday:Number(e.target.value)})} style={styles.select}>
            {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((d,i)=><option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" value={rl.start_time!} onChange={e=>setRl({...rl,start_time:e.target.value})} style={styles.input}/>
          <input type="time" value={rl.end_time!} onChange={e=>setRl({...rl,end_time:e.target.value})} style={styles.input}/>
          <button onClick={()=>rl.zone_id&&addRule(rl)} style={styles.addButton} disabled={!rl.zone_id}>
            <PlusIcon />
            Ajouter
          </button>
        </div>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Zone</th>
                <th style={styles.th}>Jour</th>
                <th style={styles.th}>Début</th>
                <th style={styles.th}>Fin</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
          {rules.map(r=>(
            <tr key={r.id} style={styles.tableRow}>
              <td style={styles.td}>{r.id}</td>
              <td style={styles.td}>
                <select value={r.zone_id} onChange={e=>setRules(p=>p.map(x=>x.id===r.id?{...x,zone_id:Number(e.target.value)}:x))} style={styles.tableSelect}>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select value={r.weekday} onChange={e=>setRules(p=>p.map(x=>x.id===r.id?{...x,weekday:Number(e.target.value)}:x))} style={styles.tableSelect}>
                  {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((d,i)=><option key={i} value={i}>{d}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <input 
                  type="time" 
                  value={r.start_time} 
                  onChange={e=>setRules(p=>p.map(x=>x.id===r.id?{...x,start_time:e.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <input 
                  type="time" 
                  value={r.end_time} 
                  onChange={e=>setRules(p=>p.map(x=>x.id===r.id?{...x,end_time:e.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <div style={styles.actionButtons}>
                  <button onClick={()=>updRule(r)} style={styles.saveButton}>
                    <SaveIcon />
                  </button>
                  <button onClick={()=>delRule(r.id)} style={styles.deleteButton}>
                    <DeleteIcon />
                  </button>
                </div>
              </td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Exceptions datées</h2>
          <p style={styles.cardDescription}>Définissez des horaires spéciaux pour des dates particulières</p>
        </div>
        <div style={styles.formRow}>
          <select value={ex.zone_id} onChange={e=>setEx({...ex,zone_id:Number(e.target.value)})} style={styles.select}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <input type="date" value={ex.date||''} onChange={e=>setEx({...ex,date:e.target.value})} style={styles.input}/>
          <input type="time" value={ex.start_time!} onChange={e=>setEx({...ex,start_time:e.target.value})} style={styles.input}/>
          <input type="time" value={ex.end_time!} onChange={e=>setEx({...ex,end_time:e.target.value})} style={styles.input}/>
          <input placeholder="Note" value={ex.note||''} onChange={e=>setEx({...ex,note:e.target.value})} style={styles.input}/>
          <button onClick={()=>ex.zone_id&&ex.date&&addEx(ex)} style={styles.addButton} disabled={!ex.zone_id || !ex.date}>
            <PlusIcon />
            Ajouter
          </button>
        </div>
        <div style={styles.actionRow}>
          <button onClick={async()=>{ const from=new Date(); const to=new Date(); to.setDate(to.getDate()+30);
          const data=await fetch(`${API}/admin/zone_exceptions?from=${from.toISOString().slice(0,10)}&to=${to.toISOString().slice(0,10)}`).then(r=>r.json()).catch(()=>[]);
          setExs(Array.isArray(data)?data:[]); }} style={styles.secondaryButton}>
            📅 Charger les 30 prochains jours
          </button>
        </div>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Zone</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Début</th>
                <th style={styles.th}>Fin</th>
                <th style={styles.th}>Note</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
          {exs.map(e=>(
            <tr key={e.id} style={styles.tableRow}>
              <td style={styles.td}>{e.id}</td>
              <td style={styles.td}>
                <select value={e.zone_id} onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,zone_id:Number(ev.target.value)}:x))} style={styles.tableSelect}>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <input 
                  type="date" 
                  value={e.date} 
                  onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,date:ev.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <input 
                  type="time" 
                  value={e.start_time} 
                  onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,start_time:ev.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <input 
                  type="time" 
                  value={e.end_time} 
                  onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,end_time:ev.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <input 
                  value={e.note||''} 
                  onChange={ev=>setExs(p=>p.map(x=>x.id===e.id?{...x,note:ev.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <div style={styles.actionButtons}>
                  <button onClick={()=>updEx(e)} style={styles.saveButton}>
                    <SaveIcon />
                  </button>
                  <button onClick={()=>delEx(e.id)} style={styles.deleteButton}>
                    <DeleteIcon />
                  </button>
                </div>
              </td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Paramètres système</h2>
          <p style={styles.cardDescription}>Configuration générale du système de réservation</p>
        </div>
        {settings && (
          <div style={styles.settingsGrid}>
            {[
              ['booking_step_min','Pas (min)'],
              ['default_duration_min','Durée par défaut (min)'],
              ['buffer_before_min','Buffer avant (min)'],
              ['buffer_after_min','Buffer après (min)'],
              ['notice_min','Préavis (min)'],
              ['window_days','Fenêtre (jours)'],
              ['demo_visio_duration_min','Durée visio (min)'],
              ['demo_visio_buffer_before_min','Buffer avant visio (min)'],
              ['demo_visio_buffer_after_min','Buffer après visio (min)'],
              ['demo_physique_duration_min','Durée physique (min)'],
            ].map(([k,label])=>(
              <label key={k} style={styles.settingItem}>
                <span style={styles.settingLabel}>{label}</span>
                <input 
                  type="number" 
                  value={(settings as any)[k] ?? ''} 
                  onChange={e=>setSettings({...settings,[k]: (e.target.value===''? null : Number(e.target.value))})} 
                  style={styles.settingInput}
                />
              </label>
            ))}
            <button onClick={()=>saveSettings(settings)} style={styles.saveAllButton}>
              <SaveIcon />
              Enregistrer les paramètres
            </button>
          </div>
        )}
      </section>

      {/* Générer planning express */}
      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Génération rapide de planning</h2>
          <p style={styles.cardDescription}>Créez rapidement des règles hebdomadaires ou des exceptions sur une période</p>
        </div>
        
        <div style={styles.quickGenSection}>
          <h3 style={styles.sectionTitle}>Règles hebdomadaires</h3>
          <div style={styles.quickGenGrid}>
            <select value={rl.zone_id} onChange={e=>setRl({...rl,zone_id:Number(e.target.value)})} style={styles.select}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <div style={styles.weekdayLabel}>
            <span>Lundi → Vendredi</span>
          </div>
          <input type="time" defaultValue="09:00:00" onChange={e=>setRl({...rl,start_time:e.target.value})} style={styles.input}/>
          <input type="time" defaultValue="18:00:00" onChange={e=>setRl({...rl,end_time:e.target.value})} style={styles.input}/>
          <button
            onClick={async()=>{
              if(!rl.zone_id) return;
              await fetch(`${API}/admin/generate_weekly_rules`,{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({ zone_id: rl.zone_id, weekdays:[1,2,3,4,5], start_time: rl.start_time||'09:00:00', end_time: rl.end_time||'18:00:00', replace: true })
              });
              loadAll();
            }}
            style={styles.generateButton}
          >
            🚀 Générer Lun-Ven 09h-18h
          </button>
          </div>
        </div>

        <div style={styles.quickGenSection}>
          <h3 style={styles.sectionTitle}>Exceptions sur période</h3>
          <div style={styles.quickGenGrid}>
            <select value={ex.zone_id||0} onChange={e=>setEx({...ex,zone_id:Number(e.target.value)})} style={styles.select}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <input id="ex_from" type="date" onChange={e=>setEx({...ex,date:e.target.value})} style={styles.input}/>
          <input id="ex_to" type="date" style={styles.input}/>
          <input type="time" defaultValue="09:00:00" onChange={e=>setEx({...ex,start_time:e.target.value})} style={styles.input}/>
          <input type="time" defaultValue="18:00:00" onChange={e=>setEx({...ex,end_time:e.target.value})} style={styles.input}/>
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
            style={styles.generateButton}
          >
            📅 Générer exceptions Lun-Ven
          </button>
          </div>
        </div>
      </section>

      {/* RÈGLES STAFF × ZONE */}
      <section style={styles.card}>
        <div style={styles.cardHeader}>
          <h2 style={styles.cardTitle}>Règles Staff × Zone</h2>
          <p style={styles.cardDescription}>Assignez des membres du staff à des zones spécifiques selon les jours</p>
        </div>
        <div style={styles.formRow}>
          <select value={szrNew.staff_id} onChange={e=>setSzrNew({...szrNew,staff_id:Number(e.target.value)})} style={styles.select}>
            {[1,2].map(s=> <option key={s} value={s}>Staff {s}</option>)}
          </select>
          <select value={szrNew.zone_id} onChange={e=>setSzrNew({...szrNew,zone_id:Number(e.target.value)})} style={styles.select}>
            <option value={0}>Zone…</option>
            {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          <select value={szrNew.weekday} onChange={e=>setSzrNew({...szrNew,weekday:Number(e.target.value)})} style={styles.select}>
            {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((d,i)=><option key={i} value={i}>{d}</option>)}
          </select>
          <input type="time" value={szrNew.start_time!} onChange={e=>setSzrNew({...szrNew,start_time:e.target.value})} style={styles.input}/>
          <input type="time" value={szrNew.end_time!} onChange={e=>setSzrNew({...szrNew,end_time:e.target.value})} style={styles.input}/>
          <button onClick={()=> szrNew.zone_id && addSZR(szrNew)} style={styles.addButton} disabled={!szrNew.zone_id}>
            <PlusIcon />
            Ajouter
          </button>
        </div>

        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeader}>
                <th style={styles.th}>ID</th>
                <th style={styles.th}>Staff</th>
                <th style={styles.th}>Zone</th>
                <th style={styles.th}>Jour</th>
                <th style={styles.th}>Début</th>
                <th style={styles.th}>Fin</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
          {szr.map(r=>(
            <tr key={r.id} style={styles.tableRow}>
              <td style={styles.td}>{r.id}</td>
              <td style={styles.td}>
                <select value={r.staff_id} onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,staff_id:Number(e.target.value)}:x))} style={styles.tableSelect}>
                  {[1,2].map(s=><option key={s} value={s}>Staff {s}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select value={r.zone_id} onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,zone_id:Number(e.target.value)}:x))} style={styles.tableSelect}>
                  {zones.map(z=><option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <select value={r.weekday} onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,weekday:Number(e.target.value)}:x))} style={styles.tableSelect}>
                  {['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'].map((d,i)=><option key={i} value={i}>{d}</option>)}
                </select>
              </td>
              <td style={styles.td}>
                <input 
                  type="time" 
                  value={r.start_time} 
                  onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,start_time:e.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <input 
                  type="time" 
                  value={r.end_time} 
                  onChange={e=>setSzr(p=>p.map(x=>x.id===r.id?{...x,end_time:e.target.value}:x))} 
                  style={styles.tableInput}
                />
              </td>
              <td style={styles.td}>
                <div style={styles.actionButtons}>
                  <button onClick={()=>updSZR(r)} style={styles.saveButton}>
                    <SaveIcon />
                  </button>
                  <button onClick={()=>delSZR(r.id)} style={styles.deleteButton}>
                    <DeleteIcon />
                  </button>
                </div>
              </td>
            </tr>
          ))}
            </tbody>
          </table>
        </div>
      </section>
      </main>
    </div>
  );
}

// Composants d'icônes
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20,6 9,17 4,12"></polyline>
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3,6 5,6 21,6"></polyline>
      <path d="M19,6V20a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6M8,6V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6"></path>
      <line x1="10" y1="11" x2="10" y2="17"></line>
      <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
  );
}

// Styles modernes
const styles: any = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f8f9fa',
    fontFamily: '"Google Sans", "Roboto", -apple-system, BlinkMacSystemFont, sans-serif'
  },
  
  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e8eaed',
    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },
  
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  
  logoIcon: {
    fontSize: '24px'
  },
  
  title: {
    fontSize: '24px',
    fontWeight: 400,
    color: '#3c4043',
    margin: 0
  },
  
  nav: {
    display: 'flex',
    alignItems: 'center'
  },
  
  navLink: {
    color: '#1a73e8',
    textDecoration: 'none',
    fontSize: '14px',
    fontWeight: 500,
    padding: '8px 16px',
    borderRadius: '4px',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },
  
  main: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '24px',
    display: 'grid',
    gap: '24px'
  },
  
  card: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
    overflow: 'hidden'
  },
  
  cardHeader: {
    padding: '24px 24px 16px',
    borderBottom: '1px solid #e8eaed'
  },
  
  cardTitle: {
    fontSize: '20px',
    fontWeight: 500,
    color: '#3c4043',
    margin: '0 0 8px 0'
  },
  
  cardDescription: {
    fontSize: '14px',
    color: '#5f6368',
    margin: 0
  },
  
  buttonGroup: {
    padding: '24px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap'
  },
  
  primaryButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    textDecoration: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
    border: 'none',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: '#1557b0',
      boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)'
    }
  },
  
  formRow: {
    padding: '24px',
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    alignItems: 'end'
  },
  
  input: {
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#3c4043',
    backgroundColor: '#ffffff',
    minWidth: '120px',
    transition: 'border-color 0.2s ease',
    ':focus': {
      borderColor: '#1a73e8',
      outline: 'none'
    }
  },
  
  select: {
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#3c4043',
    backgroundColor: '#ffffff',
    minWidth: '120px',
    cursor: 'pointer'
  },
  
  colorInputWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  
  colorInput: {
    width: '40px',
    height: '40px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  
  colorLabel: {
    fontSize: '14px',
    color: '#5f6368'
  },
  
  addButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#34a853',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#2d8f47'
    },
    ':disabled': {
      backgroundColor: '#dadce0',
      color: '#9aa0a6',
      cursor: 'not-allowed'
    }
  },
  
  secondaryButton: {
    padding: '12px 20px',
    backgroundColor: '#f8f9fa',
    color: '#3c4043',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },
  
  actionRow: {
    padding: '0 24px 24px'
  },
  
  tableContainer: {
    overflow: 'auto'
  },
  
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  
  tableHeader: {
    backgroundColor: '#f8f9fa'
  },
  
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontSize: '12px',
    fontWeight: 500,
    color: '#5f6368',
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    borderBottom: '1px solid #e8eaed'
  },
  
  tableRow: {
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#f8f9fa'
    }
  },
  
  td: {
    padding: '12px 16px',
    borderBottom: '1px solid #f1f3f4',
    fontSize: '14px',
    color: '#3c4043'
  },
  
  tableInput: {
    padding: '8px 12px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box'
  },
  
  tableSelect: {
    padding: '8px 12px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    width: '100%',
    cursor: 'pointer',
    boxSizing: 'border-box'
  },
  
  tableColorInput: {
    width: '32px',
    height: '32px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  
  colorPreview: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  
  colorSwatch: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    border: '2px solid #ffffff',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.1)'
  },
  
  actionButtons: {
    display: 'flex',
    gap: '8px'
  },
  
  saveButton: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#34a853',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#2d8f47'
    }
  },
  
  deleteButton: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#ea4335',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#d33b2c'
    }
  },
  
  settingsGrid: {
    padding: '24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '16px'
  },
  
  settingItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  
  settingLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#3c4043'
  },
  
  settingInput: {
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#3c4043'
  },
  
  saveAllButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 24px',
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    gridColumn: '1 / -1',
    justifySelf: 'center',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#1557b0'
    }
  },
  
  quickGenSection: {
    padding: '0 24px 24px'
  },
  
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#3c4043',
    margin: '0 0 16px 0'
  },
  
  quickGenGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px',
    alignItems: 'end'
  },
  
  weekdayLabel: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#5f6368',
    fontWeight: 500
  },
  
  generateButton: {
    gridColumn: '1 / -1',
    padding: '12px 24px',
    backgroundColor: '#ff6d01',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#e55100'
    }
  }
};
