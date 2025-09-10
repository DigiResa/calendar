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
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>👥</div>
            <h1 style={styles.title}>Vue Staff</h1>
          </div>
          <nav style={styles.nav}>
            <a href="/" style={styles.navLink}>← Retour au calendrier</a>
            <a href="/admin" style={styles.navLink}>Administration</a>
          </nav>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.filtersCard}>
          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Date</label>
            <input 
              type="date" 
              value={today} 
              onChange={e=>setToday(e.target.value)} 
              style={styles.dateInput}
            />
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Zones</label>
            <div style={styles.zoneFilters}>
              <button 
                onClick={()=>setZone(undefined)} 
                style={{
                  ...styles.zoneChip,
                  ...(zone === undefined ? styles.zoneChipActive : {})
                }}
              >
                Toutes les zones
              </button>
              {zonesList.map(z=>
                <button 
                  key={z.id} 
                  onClick={()=>setZone(z.name)} 
                  style={{
                    ...styles.zoneChip,
                    ...(zone === z.name ? styles.zoneChipActive : {})
                  }}
                >
                  {z.name}
                </button>
              )}
            </div>
          </div>

          <div style={styles.filterGroup}>
            <label style={styles.filterLabel}>Staff</label>
            <select
              value={staffFilter??0}
              onChange={e=>setStaffFilter(Number(e.target.value)||undefined)}
              style={styles.staffSelect}
            >
              <option value={0}>Tous les membres</option>
              {staffs.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div style={styles.slotsContainer}>
          <div style={styles.slotsHeader}>
            <h2 style={styles.slotsTitle}>
              Créneaux disponibles
              <span style={styles.slotsCount}>({viewSlots.length})</span>
            </h2>
            <div style={styles.dateDisplay}>
              {new Date(today).toLocaleDateString('fr-FR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
          </div>

          {viewSlots.length === 0 ? (
            <div style={styles.emptyState}>
              <div style={styles.emptyIcon}>📅</div>
              <h3 style={styles.emptyTitle}>Aucun créneau disponible</h3>
              <p style={styles.emptyDescription}>
                Il n'y a pas de créneaux libres pour cette journée avec les filtres sélectionnés.
              </p>
            </div>
          ) : (
            <div style={styles.slotsGrid}>
              {viewSlots.map((s,i)=>(
                <div 
                  key={i}
                  style={styles.slotCard}
                  onClick={()=>{ setSelectedSlot(s); setModalOpen(true); }}
                >
                  <div style={styles.slotTime}>
                    <div style={styles.timeRange}>
                      <span style={styles.startTime}>
                        {new Date(s.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
                      </span>
                      <span style={styles.timeSeparator}>→</span>
                      <span style={styles.endTime}>
                        {new Date(s.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
                      </span>
                    </div>
                    <div style={styles.duration}>
                      {Math.round((new Date(s.end).getTime() - new Date(s.start).getTime()) / (1000 * 60))} min
                    </div>
                  </div>

                  <div style={styles.slotZone}>
                    <div style={styles.zoneLabel}>Zone</div>
                    <div style={styles.zoneName}>{s.zone}</div>
                  </div>

                  <div style={styles.slotStaff}>
                    <div style={styles.staffLabel}>Staff disponibles</div>
                    <div style={styles.staffList}>
                      {s.available_staff_ids.length > 0 ? (
                        s.available_staff_ids.map(id => (
                          <span key={id} style={styles.staffBadge}>
                            {staffMap[id] || `Staff ${id}`}
                          </span>
                        ))
                      ) : (
                        <span style={styles.noStaff}>Aucun staff</span>
                      )}
                    </div>
                  </div>

                  <div style={styles.slotAction}>
                    <button style={styles.bookButton}>
                      📅 Réserver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </main>

      <BookingModal
        open={modalOpen}
        onClose={()=>setModalOpen(false)}
        slot={selectedSlot}
        staffMap={staffMap}
      />
    </div>
  );
}

const styles:any = {
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
    alignItems: 'center',
    gap: '16px'
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
    padding: '24px'
  },
  
  filtersCard: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
    padding: '24px',
    marginBottom: '24px',
    display: 'grid',
    gap: '24px'
  },
  
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  
  filterLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#3c4043'
  },
  
  dateInput: {
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#3c4043',
    backgroundColor: '#ffffff',
    maxWidth: '200px'
  },
  
  zoneFilters: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  
  zoneChip: {
    padding: '8px 16px',
    border: '1px solid #dadce0',
    borderRadius: '20px',
    backgroundColor: '#ffffff',
    color: '#3c4043',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },
  
  zoneChipActive: {
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    borderColor: '#1a73e8'
  },
  
  staffSelect: {
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#3c4043',
    backgroundColor: '#ffffff',
    maxWidth: '200px',
    cursor: 'pointer'
  },
  
  slotsContainer: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
    overflow: 'hidden'
  },
  
  slotsHeader: {
    padding: '24px 24px 16px',
    borderBottom: '1px solid #e8eaed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: '16px'
  },
  
  slotsTitle: {
    fontSize: '20px',
    fontWeight: 500,
    color: '#3c4043',
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  
  slotsCount: {
    fontSize: '16px',
    color: '#5f6368',
    fontWeight: 400
  },
  
  dateDisplay: {
    fontSize: '14px',
    color: '#5f6368',
    fontWeight: 500,
    textTransform: 'capitalize'
  },
  
  emptyState: {
    padding: '64px 24px',
    textAlign: 'center'
  },
  
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  
  emptyTitle: {
    fontSize: '20px',
    fontWeight: 500,
    color: '#3c4043',
    margin: '0 0 8px 0'
  },
  
  emptyDescription: {
    fontSize: '14px',
    color: '#5f6368',
    margin: 0,
    maxWidth: '400px',
    marginLeft: 'auto',
    marginRight: 'auto'
  },
  
  slotsGrid: {
    padding: '24px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '16px'
  },
  
  slotCard: {
    border: '1px solid #e8eaed',
    borderRadius: '8px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: '#ffffff',
    ':hover': {
      boxShadow: '0 2px 8px 0 rgba(60,64,67,0.3)',
      transform: 'translateY(-2px)'
    }
  },
  
  slotTime: {
    marginBottom: '16px'
  },
  
  timeRange: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '4px'
  },
  
  startTime: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1a73e8'
  },
  
  timeSeparator: {
    fontSize: '16px',
    color: '#5f6368'
  },
  
  endTime: {
    fontSize: '18px',
    fontWeight: 600,
    color: '#1a73e8'
  },
  
  duration: {
    fontSize: '12px',
    color: '#5f6368',
    fontWeight: 500
  },
  
  slotZone: {
    marginBottom: '16px'
  },
  
  zoneLabel: {
    fontSize: '12px',
    color: '#5f6368',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '4px'
  },
  
  zoneName: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#3c4043'
  },
  
  slotStaff: {
    marginBottom: '20px'
  },
  
  staffLabel: {
    fontSize: '12px',
    color: '#5f6368',
    fontWeight: 500,
    textTransform: 'uppercase',
    letterSpacing: '0.8px',
    marginBottom: '8px'
  },
  
  staffList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px'
  },
  
  staffBadge: {
    padding: '4px 8px',
    backgroundColor: '#e8f0fe',
    color: '#1a73e8',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 500
  },
  
  noStaff: {
    fontSize: '12px',
    color: '#9aa0a6',
    fontStyle: 'italic'
  },
  
  slotAction: {
    display: 'flex',
    justifyContent: 'flex-end'
  },
  
  bookButton: {
    padding: '10px 20px',
    backgroundColor: '#34a853',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#2d8f47'
    }
  },
  
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    padding: '16px'
  },
  
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 24px 38px 3px rgba(0,0,0,0.14)',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  
  input: {
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box'
  },
  
  primaryBtn: {
    padding: '12px 24px',
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  
  secondaryBtn: {
    padding: '12px 24px',
    backgroundColor: '#f8f9fa',
    color: '#3c4043',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  }
};

function BookingModal({
  open, onClose, slot, staffMap
}:{open:boolean; onClose:()=>void; slot:Slot|null; staffMap:Record<number,string>}){
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [tel,setTel]=useState('');
  const [title,setTitle]=useState(''); const [notes,setNotes]=useState(''); const [att,setAtt]=useState('');
  const [staffId,setStaffId]=useState<number|undefined>(undefined);
  const [isVisio, setIsVisio] = useState(false);
  const [restaurant, setRestaurant] = useState('');
  const [city, setCity] = useState('');
  const [loading,setLoading]=useState(false); const [ok,setOk]=useState<string|null>(null); const [err,setErr]=useState<string|null>(null);

  useEffect(()=>{ if(open){ setName(''); setEmail(''); setTel(''); setTitle(''); setNotes(''); setAtt(''); setStaffId(undefined); setIsVisio(false); setRestaurant(''); setCity(''); setOk(null); setErr(null); setLoading(false);} },[open]);
  if(!open||!slot) return null;

  async function book(){
    setLoading(true); setOk(null); setErr(null);
    try{
      const localStart = dayjs(slot.start).tz('Europe/Paris').format();
      const localEnd   = dayjs(slot.end).tz('Europe/Paris').format();
      const rawInv = att.split(',').map(s=>s.trim()).filter(Boolean);
      const emails = [ ...(email ? [email] : []), ...rawInv ];
      const seen = new Set<string>();
      const attendees = emails.filter(e => { const k = e.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });

      const body:any = {
        slot_start: localStart, slot_end: localEnd, zone_name:slot.zone,
        client_name:name, client_email:email, client_phone:tel,
        summary:`DÉMO DIGIRESA (${name||''})`, notes,
        attendees,
      };
      body.meeting_mode = isVisio ? 'visio' : 'physique';
      if (restaurant) body.restaurant_name = restaurant;
      if (city) body.city = city;
      if (staffId) body.staff_id = staffId;
      const res=await fetch(`${API}/book`,{
        method:'POST',
        headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},
        body:JSON.stringify(body)
      });
      const data=await res.json(); if(!res.ok) throw new Error(data?.detail||data?.error||'Erreur');
      const meet = data?.meet_link ? ` · Lien Meet: ${data.meet_link}` : '';
      setOk(`Réservé. ${staffMap[data.staff_id]||`Staff ${data.staff_id}`}. Event ${data.event_id||''}${meet}`);
    }catch(e:any){ setErr(e.message||'Erreur'); } finally{ setLoading(false); }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e=>e.stopPropagation()}>
        <div style={{padding:'24px 24px 16px', borderBottom:'1px solid #e8eaed'}}>
          <h3 style={{margin:0, fontSize:'20px', fontWeight:500, color:'#3c4043'}}>Nouvelle réservation</h3>
        </div>
        
        <div style={{padding:'16px 24px', backgroundColor:'#f8f9fa', borderBottom:'1px solid #e8eaed'}}>
          <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
            <div style={{fontSize:'24px'}}>🕐</div>
            <div>
              <div style={{fontSize:'16px', fontWeight:500, color:'#3c4043'}}>
                {new Date(slot.start).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </div>
              <div style={{fontSize:'14px', color:'#5f6368'}}>
                {new Date(slot.start).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
                {' '}→ {new Date(slot.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}
              </div>
              <div style={{fontSize:'14px', color:'#1a73e8', fontWeight:500}}>Zone: {slot.zone}</div>
            </div>
          </div>
        </div>

        <div style={{padding:'24px', display:'grid', gap:'16px'}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
            <div>
              <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>Nom du restaurant</label>
              <input placeholder="Ex: Chez Mario" value={restaurant} onChange={e=>setRestaurant(e.target.value)} style={styles.input} />
            </div>
            <div>
              <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>Ville</label>
              <input placeholder="Ex: Narbonne" value={city} onChange={e=>setCity(e.target.value)} style={styles.input} />
            </div>
          </div>
          <div>
            <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>
              Titre de l'événement
            </label>
            <input 
              placeholder="Rendez-vous client..." 
              value={title} 
              onChange={e=>setTitle(e.target.value)} 
              style={styles.input}
            />
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
            <div>
              <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>
                Nom du client *
              </label>
              <input 
                placeholder="Jean Dupont" 
                value={name} 
                onChange={e=>setName(e.target.value)} 
                style={styles.input}
                required
              />
            </div>
            <div>
              <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>
                Staff assigné
              </label>
              <select value={staffId??0} onChange={e=>setStaffId(Number(e.target.value)||undefined)} style={styles.input}>
              <option value={0}>Auto (least-load)</option>
              {slot.available_staff_ids.map(id=><option key={id} value={id}>{staffMap[id]||`Staff ${id}`}</option>)}
            </select>
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'16px'}}>
            <div>
              <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>
                Email
              </label>
              <input 
                type="email"
                placeholder="jean.dupont@email.com" 
                value={email} 
                onChange={e=>setEmail(e.target.value)} 
                style={styles.input}
              />
            </div>
            <div>
              <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>
                Téléphone
              </label>
              <input 
                type="tel"
                placeholder="06 12 34 56 78" 
                value={tel} 
                onChange={e=>setTel(e.target.value)} 
                style={styles.input}
              />
            </div>
          </div>

          <div>
            <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>
              Notes
            </label>
            <textarea 
              placeholder="Informations complémentaires..." 
              value={notes} 
              onChange={e=>setNotes(e.target.value)} 
              style={{...styles.input, minHeight:'80px', resize:'vertical', fontFamily:'inherit'}}
            />
          </div>

          <div>
            <label style={{display:'block', fontSize:'14px', fontWeight:500, color:'#3c4043', marginBottom:'8px'}}>
              Invités (emails séparés par des virgules)
            </label>
          <input 
            placeholder="invite1@email.com, invite2@email.com" 
            value={att} 
            onChange={e=>setAtt(e.target.value)} 
            style={styles.input}
          />
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:14, marginTop:8}}>
            <input type="checkbox" checked={isVisio} onChange={e=>setIsVisio(e.target.checked)} /> RDV en visio (Google Meet)
          </label>
          </div>

          {ok && (
            <div style={{padding:'12px 16px', backgroundColor:'#e8f5e8', color:'#137333', borderRadius:'4px', fontSize:'14px'}}>
              ✅ {ok}
            </div>
          )}

          {err && (
            <div style={{padding:'12px 16px', backgroundColor:'#fce8e6', color:'#d93025', borderRadius:'4px', fontSize:'14px'}}>
              ❌ {err}
            </div>
          )}

          <div style={{display:'flex', justifyContent:'flex-end', gap:'12px', paddingTop:'16px', borderTop:'1px solid #e8eaed'}}>
            <button onClick={onClose} style={styles.secondaryBtn}>Annuler</button>
            <button 
              onClick={book} 
              disabled={!name||loading} 
              style={{
                ...styles.primaryBtn,
                ...((!name||loading) ? {backgroundColor:'#dadce0', color:'#9aa0a6', cursor:'not-allowed'} : {})
              }}
            >
              {loading ? 'Création en cours...' : 'Créer l\'événement'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
