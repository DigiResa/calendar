// app/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';
import 'dayjs/locale/fr';
import BookingModal from './components/BookingModal';
dayjs.locale('fr');
dayjs.extend(utc);
dayjs.extend(tz);

const API = process.env.NEXT_PUBLIC_API_URL as string;

type Slot = {
  start: string;
  end: string;
  zone: string;
  zone_id?: number;
  available_staff_ids: number[];
  available_staff_names?: string[];
};

type Booking = { id:number; start:string; end:string; zone:string; zone_id:number; staff_id?:number; staff_name?:string; client_name:string; restaurant_name?:string; city?:string; title?:string; meeting_mode?: 'visio' | 'physique' };
type StaffZone = { staff_id:number; zone_id:number };

export default function CalendarWeek() {
  function weekStartMonday(base: any){
    const s = dayjs(base).startOf('week');
    // Si startOf('week') est déjà lundi, garder; sinon ajouter 1 jour
    return s.day() === 1 ? s : s.add(1, 'day');
  }
  const [weekStart, setWeekStart] = useState(weekStartMonday(dayjs()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [mergedAvail, setMergedAvail] = useState<Array<{start:string; end:string; staff_id:number}>>([]);
  const [zonesList, setZonesList] = useState<{id:number; name:string; color?:string}[]>([]);
  const [daySel, setDaySel] = useState<Record<string, { morning?: number; afternoon?: number }>>({});
  // Zones et règles supprimées de l'UI; on ne garde que les slots calculés par l'API
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staffs, setStaffs] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<any|null>(null);
  const [staffZones, setStaffZones] = useState<StaffZone[]>([]);
  const zonesById = useMemo(()=>{
    const m = new Map<number,string>();
    for (const z of zonesList) m.set(z.id, z.name);
    return m;
  },[zonesList]);
  const zoneColorById = useMemo(()=>{
    const m = new Map<number,string>();
    for (const z of zonesList) if ((z as any).color) m.set(z.id, (z as any).color as string);
    return m;
  },[zonesList]);
  const staffMap = useMemo(() => Object.fromEntries(staffs.map(s => [s.id, s.name])), [staffs]);
  // Plus de sélecteurs de zones ni de filtres; on construit directement par staff
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');
  const [viewScope, setViewScope] = useState<'global'|'zone'>('global');
  const [scopeZoneId, setScopeZoneId] = useState<number|undefined>(undefined);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);
  // Garde-fou pour éviter les divergences SSR/CSR (hydration)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Plus d'édition ponctuelle liée aux zones

  // Chargements init: staff, settings, staff↔zones, zones
  useEffect(() => {
    Promise.all([
      fetch(`${API}/admin/staff`).then(r => r.json()).catch(() => []),
      fetch(`${API}/admin/settings`).then(r => r.json()).catch(() => null),
      fetch(`${API}/admin/staff_zones`).then(r => r.json()).catch(() => []),
      fetch(`${API}/admin/zones`).then(r => r.json()).catch(() => [])
    ]).then(([st, se, sz, z]) => {
      setStaffs(Array.isArray(st) ? st : []);
      setSettings(se);
      setStaffZones(Array.isArray(sz) ? sz : []);
      setZonesList(Array.isArray(z) ? z : []);
    });
  }, []);

  // Charge les slots de la semaine
  function reloadSlots(base = weekStart) {
    const from = base.startOf('day').toISOString();
    const to = base.add(6, 'day').endOf('day').toISOString();
    const ids = (staffs && staffs.length>=2) ? [staffs[0].id, staffs[1].id] : [];
    // Vue par staff: charger uniquement ce staff pour alléger
    // pas de vue par staff
    if (ids.length === 2) {
      const [id1, id2] = ids;
      const q1 = new URLSearchParams({ from, to, only: 'merged', staff_id: String(id1) } as any);
      const q2 = new URLSearchParams({ from, to, only: 'merged', staff_id: String(id2) } as any);
      Promise.all([
        fetch(`${API}/availability?${q1.toString()}&_=${Date.now()}`, { cache: 'no-store' }).then(r=>r.json()).catch(()=>({merged:[]})),
        fetch(`${API}/availability?${q2.toString()}&_=${Date.now()}`, { cache: 'no-store' }).then(r=>r.json()).catch(()=>({merged:[]})),
      ]).then(([d1,d2])=>{
        const m1 = Array.isArray(d1.merged)? d1.merged : [];
        const m2 = Array.isArray(d2.merged)? d2.merged : [];
        setMergedAvail([ ...m1, ...m2 ]);
        setSlots([]);
      }).catch(()=>{ setMergedAvail([]); setSlots([]); });
    } else {
      const q = new URLSearchParams({ from, to, only: 'merged' } as any);
      fetch(`${API}/availability?${q.toString()}&_=${Date.now()}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => { setMergedAvail(Array.isArray(d.merged)? d.merged : []); setSlots([]); })
        .catch(() => { setMergedAvail([]); setSlots([]); });
    }
  }
  useEffect(() => { reloadSlots(); }, [weekStart, viewScope]);

  // Charger les sélections de zones par demi-journée pour l'en-tête
  useEffect(() => {
    const from = weekStart.startOf('day').format('YYYY-MM-DD');
    const to = weekStart.add(6, 'day').endOf('day').format('YYYY-MM-DD');
    fetch(`${API}/admin/day_zone_selection?from=${from}&to=${to}`)
      .then(r=>r.json())
      .then(arr => {
        if (!Array.isArray(arr)) { setDaySel({}); return; }
        const map: Record<string, { morning?: number; afternoon?: number }> = {};
        for (const it of arr) {
          const key = String(it.date);
          if (!map[key]) map[key] = {};
          if (String(it.half) === 'morning') map[key].morning = Number(it.zone_id);
          else map[key].afternoon = Number(it.zone_id);
        }
        setDaySel(map);
      }).catch(()=>setDaySel({}));
  }, [weekStart]);

  // Charger les réservations
  useEffect(() => {
    const from = weekStart.startOf('day').format('YYYY-MM-DD');
    const to = weekStart.add(6, 'day').endOf('day').format('YYYY-MM-DD');
    const qb = new URLSearchParams({
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`
    } as any);
    fetch(`${API}/admin/bookings?${qb.toString()}`)
      .then(r => r.json())
      .then(arr => {
        if (!Array.isArray(arr)) return setBookings([]);
        const mapped = arr.map((x:any) => ({
          id: x.id,
          start: new Date(x.starts_at).toISOString(),
          end: new Date(x.ends_at).toISOString(),
          zone: x.zone_name,
          zone_id: x.zone_id,
          staff_id: x.staff_id,
          staff_name: x.staff_name || undefined,
          client_name: x.client_name || '',
          restaurant_name: x.restaurant_name || undefined,
          city: x.city || undefined,
          title: x.title || x.client_name || '',
          meeting_mode: (x.meeting_mode === 'visio' || x.meeting_mode === 'physique') ? x.meeting_mode : undefined
        }));
        setBookings(mapped);
      })
      .catch(() => setBookings([]));
  }, [weekStart]);

  // Recharge uniquement les réservations (après annulation, etc.)
  async function reloadBookings() {
    try {
      const from = weekStart.startOf('day').format('YYYY-MM-DD');
      const to = weekStart.add(6, 'day').endOf('day').format('YYYY-MM-DD');
      const qb = new URLSearchParams({
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`
      } as any);
      const arr = await fetch(`${API}/admin/bookings?${qb.toString()}`).then(r=>r.json());
      if (!Array.isArray(arr)) { setBookings([]); return; }
      const mapped = arr.map((x:any) => ({
        id: x.id,
        start: new Date(x.starts_at).toISOString(),
        end: new Date(x.ends_at).toISOString(),
        zone: x.zone_name,
        zone_id: x.zone_id,
        staff_id: x.staff_id,
        staff_name: x.staff_name || undefined,
        client_name: x.client_name || '',
        restaurant_name: x.restaurant_name || undefined,
        city: x.city || undefined,
        title: x.title || x.client_name || ''
      }));
      setBookings(mapped);
    } catch { setBookings([]); }
  }

  // plus de configuration par zone

  // Jours affichés
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  // Plus de règles/ exceptions par zone affichées côté UI

  // Configuration des heures
  const hourStart = 9;
  const hourEnd = 19;
  const hours = useMemo(
    () => Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i),
    []
  );
  const PX_PER_HOUR = 84;
  const totalHeight = (hourEnd - hourStart) * PX_PER_HOUR;
  const [, setTick] = useState(0);
  const [hoverHint, setHoverHint] = useState<{ key: string; top: number; label: string } | null>(null);
  useEffect(() => {
    const id = setInterval(() => setTick(x => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Slots filtrés
  const filteredSlots = useMemo(() => slots, [slots]);

  // Événements UI
  type UiEvent = {
    id: string;
    kind: 'slot' | 'booking' | 'busy';
    startISO: string;
    endISO: string;
    startMin: number;
    endMin: number;
    zone: string;
    zone_id?: number;
    staffId?: number;
    color: string;
    title: string;
    subtitle?: string;
    clickable: boolean;
    lane?: number;
    lanesCount?: number;
    onlyVisio?: boolean;
  };
  
  function minutesFromStart(d: dayjs.Dayjs) {
    const t = d.tz('Europe/Paris');
    return t.hour() * 60 + t.minute() - hourStart * 60;
  }
  
  function eventsForDay(day: dayjs.Dayjs): UiEvent[] {
    const staffOrder = (staffs && staffs.length >= 2)
      ? [staffs[0].id, staffs[1].id]
      : [1, 2]; // Deux colonnes: STAFF 1 et STAFF 2
    const evts: UiEvent[] = [];

    for (let lane = 0; lane < 2; lane++) {
      const staffId = staffOrder[lane];
      if (staffId == null) continue;
      
      // Use pre-merged availability from API when present; otherwise merge locally
      let merged: { start: string; end: string }[] = [];
      const fromApi = (mergedAvail || []).filter(m => Number(m.staff_id) === Number(staffId))
        .filter(m => dayjs(m.start).tz('Europe/Paris').isSame(day, 'day'))
        .map(m => ({ start: m.start, end: m.end }))
        .sort((a,b)=> Date.parse(a.start) - Date.parse(b.start));
      if (fromApi.length) {
        merged = fromApi;
      } else {
        const intervals: { start: string; end: string }[] = [];
        for (const s of filteredSlots) {
          const ds = dayjs(s.start).tz('Europe/Paris');
          const de = dayjs(s.end).tz('Europe/Paris');
          if (!ds.isSame(day, 'day')) continue;
          if (!(s.available_staff_ids || []).includes(Number(staffId))) continue;
          intervals.push({ start: s.start, end: s.end });
        }
        intervals.sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || Date.parse(a.end) - Date.parse(b.end));
        for (const it of intervals) {
          if (!merged.length) { merged.push({ start: it.start, end: it.end }); continue; }
          const last = merged[merged.length - 1];
          if (Date.parse(it.start) <= Date.parse(last.end)) {
            if (Date.parse(it.end) > Date.parse(last.end)) last.end = it.end;
          } else {
            merged.push({ start: it.start, end: it.end });
          }
        }
      }
      // Build green availability and red busy complement
      const dayStart = day.tz('Europe/Paris').hour(hourStart).minute(0).second(0).millisecond(0);
      const dayEnd = day.tz('Europe/Paris').hour(hourEnd).minute(0).second(0).millisecond(0);
      let cursor = dayStart;
      for (const m of merged) {
        const ms = dayjs(m.start).tz('Europe/Paris');
        const me = dayjs(m.end).tz('Europe/Paris');
        // Vue par zone: ne pas afficher les fenêtres de dispo (slots) pour éviter la confusion
        if (viewScope!=='zone') {
        // busy before interval
        if (ms.isAfter(cursor)) {
          evts.push({
            id: `busy-${staffId}-${cursor.toISOString()}-${ms.toISOString()}`,
            kind: 'busy',
            startISO: cursor.toISOString(),
            endISO: ms.toISOString(),
            startMin: minutesFromStart(cursor),
            endMin: minutesFromStart(ms),
            zone: '',
            color: 'transparent',
            title: '',
            clickable: false,
            lane,
            lanesCount: 2
          });
        }
        // avail interval:
        // - Bleu si la fenêtre est plus courte que la durée d'un RDV physique
        // - Sinon, tronquer l'affichage pour garantir qu'un physique (durée min) tienne avant le prochain busy
        const physDurMin = Number(settings?.demo_physique_duration_min ?? settings?.default_duration_min ?? 30);
        const intervalMin = me.diff(ms, 'minute');
        const isShort = intervalMin < physDurMin;
        const displayEnd = isShort ? me : me.subtract(physDurMin, 'minute');
        evts.push({
          id: `avail-${staffId}-${m.start}-${m.end}`,
          kind: 'slot',
          startISO: ms.toISOString(),
          endISO: displayEnd.toISOString(),
          startMin: minutesFromStart(ms),
          endMin: minutesFromStart(displayEnd),
          zone: '',
          zone_id: undefined,
          color: '#34a853',
          title: `${ms.format('HH:mm')} → ${displayEnd.format('HH:mm')}`,
          clickable: true,
          staffId: Number(staffId),
          lane,
          lanesCount: 2,
          onlyVisio: isShort
        });
        }
        cursor = me;
      }
      if (cursor.isBefore(dayEnd)) {
        evts.push({
          id: `busy-${staffId}-${cursor.toISOString()}-${dayEnd.toISOString()}`,
          kind: 'busy',
          startISO: cursor.toISOString(),
          endISO: dayEnd.toISOString(),
          startMin: minutesFromStart(cursor),
          endMin: minutesFromStart(dayEnd),
          zone: '',
          color: 'transparent',
          title: '',
          clickable: false,
          lane,
          lanesCount: 2
        });
      }
    }

    // Bookings overlay
    for (const b of bookings) {
      const ds = dayjs(b.start).tz('Europe/Paris');
      if (!ds.isSame(day, 'day')) continue;
      const de = dayjs(b.end).tz('Europe/Paris');
      const sid: any = (b as any).staff_id;
      const lane = ((staffs && staffs.length >= 2) ? [staffs[0].id, staffs[1].id] : [1,2]).indexOf(Number(sid));
      if (lane === -1) continue;
      if (viewScope==='zone' && scopeZoneId && Number(b.zone_id)!==Number(scopeZoneId)) continue;
      
      const timeLabel = `${ds.format('HH:mm')} → ${de.format('HH:mm')}`;
      const mainTitle = (b.zone || '').toUpperCase();
      const subtitle = `Démo DigiResa - ${b.restaurant_name || b.client_name || ''}`;
      const bgColor = '#1a73e8';
      evts.push({
        id: `bk-${b.id}`,
        kind: 'booking',
        startISO: ds.toISOString(),
        endISO: de.toISOString(),
        startMin: minutesFromStart(ds),
        endMin: minutesFromStart(de),
        zone: b.zone,
        zone_id: b.zone_id,
        staffId: Number(sid) || undefined,
        color: bgColor,
        title: mainTitle,
        subtitle,
        clickable: true,
        lane,
        lanesCount: 2
      });
    }

    const maxMin = (hourEnd - hourStart) * 60;
    for (const e of evts) {
      e.startMin = Math.max(0, Math.min(maxMin, e.startMin));
      e.endMin = Math.max(0, Math.min(maxMin, e.endMin));
    }
    evts.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    return evts;
  }

  // Initiales d'un nom de staff
  function staffInitials(name?: string) {
    if (!name) return '';
    const parts = String(name).trim().split(/\s+/);
    const letters = parts.map(p => p[0]?.toUpperCase() || '').join('');
    return letters.slice(0, 3);
  }

  function prevWeek() { setWeekStart(weekStart.subtract(7, 'day')); }
  function nextWeek() { setWeekStart(weekStart.add(7, 'day')); }
  function goToday() { setWeekStart(weekStartMonday(dayjs())); }

  // Préférences de vue (persistées)
  useEffect(() => {
    try {
      const vs = localStorage.getItem('cal_viewScope');
      if (vs === 'global' || vs === 'zone') setViewScope(vs);
      const sz = localStorage.getItem('cal_scopeZoneId');
      if (sz != null) setScopeZoneId(Number(sz));
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { try { localStorage.setItem('cal_viewScope', viewScope); } catch {} }, [viewScope]);
  // plus de persistance de scopeStaffId
  useEffect(() => { try { if (scopeZoneId!=null) localStorage.setItem('cal_scopeZoneId', String(scopeZoneId)); } catch {} }, [scopeZoneId]);

  // Evite tout rendu côté serveur pour prévenir les écarts SSR/CSR (dates, TZ, etc.)
  if (!mounted) return <div suppressHydrationWarning />;

  return (
    <div style={styles.container}>
      {/* Header moderne */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>📅</div>
            <span style={styles.logoText}>Calendar</span>
          </div>
          
          <nav style={styles.nav}>
            <button onClick={goToday} style={styles.todayBtn}>Aujourd'hui</button>
            <div style={styles.navControls}>
              <button onClick={prevWeek} style={styles.navBtn}>
                <ChevronLeft />
              </button>
              <button onClick={nextWeek} style={styles.navBtn}>
                <ChevronRight />
              </button>
            </div>
            <h1 style={styles.dateTitle}>
              {weekStart.format('MMMM YYYY')}
            </h1>
          </nav>
        </div>

        <div style={styles.headerRight}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Vue:</span>
            <button onClick={()=>setViewScope('global')} style={{...styles.secondaryBtn, backgroundColor: viewScope==='global'?'#e8f0fe':'#f8f9fa'}}>Globale</button>
            
            <button onClick={()=>setViewScope('zone')} style={{...styles.secondaryBtn, backgroundColor: viewScope==='zone'?'#e8f0fe':'#f8f9fa'}}>Par zone</button>
            
            {viewScope==='zone' && (
              <select value={scopeZoneId ?? (zonesList[0]?.id||0)} onChange={e=>setScopeZoneId(Number(e.target.value)||undefined)} style={styles.input}>
                {zonesList.map(z=> <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            )}
          </div>
        </div>
      </header>

      {/* Calendrier principal */}
      <main style={styles.main}>
        <div style={styles.calendarContainer}>
          {/* Légende couleurs + zones affectées par staff */}
          <div style={styles.legend}>
            <div style={styles.legendItem}><span style={{...styles.legendDot, background:'#34a853'}} /> Dispo (≥ {Number(settings?.demo_physique_duration_min ?? settings?.default_duration_min ?? 30)} min)</div>
            <div style={styles.legendItem}><span style={{...styles.legendDot, background:'#1a73e8'}} /> Réservation</div>
            <div style={styles.legendItem}>
              <span style={{fontWeight:600, marginRight:6}}>{staffs[0]?.name || 'Staff 1'}:</span>
              <span>{((staffZones.filter(x=>x.staff_id===(staffs[0]?.id||-1)).map(x=> zonesById.get(x.zone_id)).filter(Boolean) as string[]).join(' · ')) || '-'}</span>
            </div>
            <div style={styles.legendItem}>
              <span style={{fontWeight:600, marginRight:6}}>{staffs[1]?.name || 'Staff 2'}:</span>
              <span>{((staffZones.filter(x=>x.staff_id===(staffs[1]?.id||-1)).map(x=> zonesById.get(x.zone_id)).filter(Boolean) as string[]).join(' · ')) || '-'}</span>
            </div>
          </div>
          {/* En-têtes des jours (sans sélecteurs de zones) */}
          <div style={styles.weekHeader}>
            <div style={styles.timeColumn}></div>
            {days.map(d => {
              const dateStr = d.format('YYYY-MM-DD');
              const isToday = d.isSame(dayjs(), 'day');
              const isWeekend = d.day() === 0 || d.day() === 6;

              return (
                <div key={d.toString()} style={{
                  ...styles.dayHeader,
                  ...(isToday ? styles.dayHeaderToday : {}),
                  ...(isWeekend ? styles.dayHeaderWeekend : {})
                }}>
                  <div style={styles.dayHeaderTop}>
                    <div style={styles.dayName}>{d.format('ddd').toUpperCase()}</div>
                    <div style={{...styles.dayNumber, ...(isToday ? styles.dayNumberToday : {})}}>
                      {d.format('D')}
                    </div>
                  </div>
                  {/* Initiales des deux staffs alignées avec les 2 colonnes */}
                  <div style={{ position:'relative', fontSize:12, color:'#6b7280', padding:'2px 6px' }}>
                    {(() => {
                      const key = d.format('YYYY-MM-DD');
                      const sel = daySel[key];
                      if (sel && (sel.morning || sel.afternoon)) {
                        return (
                          <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
                            <div>MATIN: {sel?.morning ? (zonesById.get(sel.morning) || sel.morning) : '-'}</div>
                            <div>SOIR: {sel?.afternoon ? (zonesById.get(sel.afternoon) || sel.afternoon) : '-'}</div>
                          </div>
                        );
                      }
                      // fallback: initiales staff
                      return (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
                          <div style={{ textAlign:'center' }}>{staffInitials(staffs[0]?.name) || 'S1'}</div>
                          <div style={{ textAlign:'center' }}>{staffInitials(staffs[1]?.name) || 'S2'}</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Grille horaire */}
          <div style={styles.calendarGrid}>
            {/* Colonne des heures */}
            <div style={styles.timeColumn}>
              {hours.map((h, i) => (
                <div key={h} style={{
                  ...styles.timeSlot,
                  height: PX_PER_HOUR
                }}>
                  <span style={styles.timeLabel}>
                    {h.toString().padStart(2, '0')}:00
                  </span>
                </div>
              ))}
            </div>

            {/* Colonnes des jours (2 colonnes: STAFF 1 / STAFF 2) */}
            {days.map(d => {
              const evts = eventsForDay(d);
              const isWeekend = d.day() === 0 || d.day() === 6;
              const now = dayjs().tz('Europe/Paris');
              const showNow = d.isSame(now, 'day');
              const nowMin = (now.hour() * 60 + now.minute()) - hourStart * 60;

              return (
                <div key={`col-${d.toString()}`} style={{
                  ...styles.dayColumn,
                  backgroundColor: isWeekend ? '#fafbfc' : '#ffffff'
                }}>
                  {/* Info: no availability windows for staff lanes */}
                  {/* Labels 'Pas de DISPO' retirés */}
                  {/* Lignes horaires */}
                  {hours.map(h => (
                    <div key={h} style={styles.hourLine} />
                  ))}

                  {/* Ligne "maintenant" */}
                  {showNow && nowMin >= 0 && nowMin <= (hourEnd - hourStart) * 60 && (
                    <div style={{
                      ...styles.nowLine,
                      top: (nowMin / 60) * PX_PER_HOUR
                    }}>
                      <div style={styles.nowDot} />
                    </div>
                  )}

                  {/* Fonds de colonnes Staff (gauche/droite) */}
                  <div style={styles.staffBgLeft} />
                  <div style={styles.staffBgRight} />

                  {/* no extra column header inside day columns */}

                  {/* Séparateur vertical au milieu pour matérialiser les 2 colonnes */}
                  <div style={{ position:'absolute', top:0, bottom:0, left:'50%', width:1, background:'#e8eaed', zIndex:1 }} />

                  {/* Aperçu de l'heure au survol */}
                  {hoverHint && hoverHint.key===`col-${d.toString()}` && (
                    <div style={{ position:'absolute', left:'50%', transform:'translate(-50%, -50%)', top: hoverHint.top, background:'#fff', border:'1px solid #e5e7eb', borderRadius:6, padding:'2px 6px', fontSize:10, color:'#374151', zIndex:6, boxShadow:'0 1px 2px rgba(0,0,0,0.1)', pointerEvents:'none' }}>
                      {hoverHint.label}
                    </div>
                  )}

                  {/* Événements */}
                  {evts.map((e) => {
                    const gap = 2;
                    const cols = 2;
                    const widthPct = (100 - (cols - 1) * gap) / cols;
                    const leftPct = (e.lane || 0) * (widthPct + gap);
                    const top = (e.startMin / 60) * PX_PER_HOUR;
                    const height = Math.max(24, ((e.endMin - e.startMin) / 60) * PX_PER_HOUR);

                    return (
                      <div
                        key={e.id}
                        onMouseMove={e.kind==='slot' ? (ev) => {
                          const parent = (ev.currentTarget as HTMLDivElement).parentElement as HTMLDivElement;
                          const rect = parent.getBoundingClientRect();
                          const y = ev.clientY - rect.top;
                          const minutesFromStart = Math.max(0, Math.min(((y / PX_PER_HOUR) * 60), (hourEnd - hourStart) * 60));
                          const step = Number(settings?.booking_step_min ?? 15);
                          const snapped = Math.floor(minutesFromStart / step) * step;
                          const startPick = d.tz('Europe/Paris').hour(hourStart).minute(0).second(0).millisecond(0).add(snapped, 'minute');
                          setHoverHint({ key: `col-${d.toString()}`, top: (snapped/60)*PX_PER_HOUR, label: startPick.format('HH:mm') });
                        } : undefined}
                        onMouseLeave={e.kind==='slot' ? () => setHoverHint(null) : undefined}
                        onClick={e.clickable ? (ev) => {
                          if (e.kind === 'slot') {
                            const parent = (ev.currentTarget as HTMLDivElement).parentElement as HTMLDivElement;
                            const rect = parent.getBoundingClientRect();
                            const y = ev.clientY - rect.top;
                            const minutesFromStart = Math.max(0, Math.min(((y / PX_PER_HOUR) * 60), (hourEnd - hourStart) * 60));
                            const step = Number(settings?.booking_step_min ?? 15);
                            const dur = Number(settings?.default_duration_min ?? 30);
                            const snapped = Math.floor(minutesFromStart / step) * step;
                            const startPick = d.tz('Europe/Paris').hour(hourStart).minute(0).second(0).millisecond(0).add(snapped, 'minute');
                            const finalStart = startPick;
                            const finalEnd = finalStart.add(dur, 'minute');
                            const sid = e.staffId ?? ((staffs && staffs.length>=2) ? [staffs[0].id, staffs[1].id][e.lane || 0] : undefined);
                            const slotObj: Slot = {
                              start: finalStart.toISOString(),
                              end: finalEnd.toISOString(),
                              zone: e.zone || '',
                              zone_id: e.zone_id,
                              available_staff_ids: sid ? [sid] : []
                            };
                            setSelectedSlot(slotObj);
                            setModalOpen(true);
                          } else if (e.kind === 'booking') {
                            const idStr = e.id.replace('bk-', '');
                            const b = bookings.find(x => String(x.id) === idStr);
                            if (b) setOpenBooking(b);
                          }
                        } : undefined}
                        style={{
                          ...styles.event,
                          ...(e.kind === 'slot' ? styles.eventSlot : styles.eventBooking),
                          top,
                          left: `${leftPct}%`,
                          width: `${widthPct}%`,
                          height,
                          backgroundColor: e.color,
                          cursor: e.clickable ? 'pointer' : 'default',
                          zIndex: (e.kind === 'booking') ? 4 : (e.kind === 'slot' ? 3 : 2)
                        }}
                        title={`${e.title} · ${e.zone}${e.subtitle ? ` · ${e.subtitle}` : ''}`}
                      >
                        <div style={styles.eventTitle}>{e.title}</div>
                        {e.kind==='slot' && e.onlyVisio && (
                          <div style={{position:'absolute', top:4, right:4, background:'#1a73e8', color:'#fff', borderRadius:4, padding:'0 4px', fontSize:9}}>SEULEMENT VISIO</div>
                        )}
                        {/* Sur les bookings: n'afficher que le sous-titre (zone en titre) */}
                        {e.kind === 'booking' && e.subtitle && (
                          <div style={styles.eventSubtitle}>{e.subtitle}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <BookingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        slot={selectedSlot}
        staffMap={staffMap}
        slots={slots}
        staffZones={staffZones}
        zonesList={zonesList}
        bookings={bookings}
        settings={settings}
        onBooked={async()=>{ await reloadBookings(); reloadSlots(); setModalOpen(false); }}
      />
      <BookingDetailsModal
        open={!!openBooking}
        onClose={()=>setOpenBooking(null)}
        booking={openBooking}
        onCanceled={async()=>{ await reloadBookings(); reloadSlots(); setOpenBooking(null); }}
      />
    </div>
  );
}

// Composants d'icônes
function ChevronLeft() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15,18 9,12 15,6"></polyline>
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9,18 15,12 9,6"></polyline>
    </svg>
  );
}

function Settings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );
}

function Edit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
    </svg>
  );
}

// Styles modernes inspirés de Google Calendar
const styles: any = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#ffffff',
    fontFamily: '"Google Sans", "Roboto", -apple-system, BlinkMacSystemFont, sans-serif',
    color: '#3c4043'
  },
  
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 24px',
    borderBottom: '1px solid #e8eaed',
    backgroundColor: '#ffffff',
    position: 'sticky',
    top: 0,
    zIndex: 10,
    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)'
  },
  
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px'
  },
  
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  
  logoIcon: {
    fontSize: '24px'
  },
  
  logoText: {
    fontSize: '22px',
    fontWeight: 400,
    color: '#5f6368'
  },
  
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  
  todayBtn: {
    padding: '8px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#3c4043',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#f8f9fa',
      boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3)'
    }
  },
  
  navControls: {
    display: 'flex',
    alignItems: 'center'
  },
  
  navBtn: {
    width: '40px',
    height: '40px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    color: '#5f6368',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },
  
  dateTitle: {
    fontSize: '22px',
    fontWeight: 400,
    color: '#3c4043',
    margin: 0
  },
  
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  
  viewToggle: {
    display: 'flex',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  
  viewBtn: {
    padding: '8px 16px',
    border: 'none',
    backgroundColor: '#ffffff',
    color: '#5f6368',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  
  viewBtnActive: {
    backgroundColor: '#1a73e8',
    color: '#ffffff'
  },
  
  filters: {
    display: 'flex',
    gap: '8px'
  },
  
  filterSelect: {
    padding: '8px 12px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#3c4043',
    fontSize: '14px',
    cursor: 'pointer'
  },
  
  settingsBtn: {
    width: '40px',
    height: '40px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    color: '#5f6368',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },
  
  main: {
    flex: 1,
    overflow: 'hidden'
  },
  
  calendarContainer: {
    height: 'calc(100vh - 73px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'auto'
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '8px 16px',
    fontSize: '12px',
    color: '#5f6368',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #e8eaed'
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px'
  },
  legendDot: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '2px'
  },
  
  weekHeader: {
    display: 'grid',
    gridTemplateColumns: '64px repeat(6, 1fr)',
    borderBottom: '1px solid #e8eaed',
    backgroundColor: '#ffffff',
    position: 'sticky',
    top: 0,
    zIndex: 5
  },
  
  timeColumn: {
    borderRight: '1px solid #e8eaed',
    backgroundColor: '#ffffff'
  },
  
  dayHeader: {
    padding: '16px 8px',
    borderRight: '1px solid #e8eaed',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '120px'
  },
  
  dayHeaderToday: {
    backgroundColor: '#e8f0fe'
  },
  
  dayHeaderWeekend: {
    backgroundColor: '#fafbfc'
  },
  
  dayHeaderTop: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px'
  },
  
  dayName: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#70757a',
    letterSpacing: '0.8px'
  },
  
  dayNumber: {
    fontSize: '26px',
    fontWeight: 400,
    color: '#3c4043',
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%'
  },
  
  dayNumberToday: {
    backgroundColor: '#1a73e8',
    color: '#ffffff'
  },
  
  dayZones: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'center'
  },
  
  zoneChip: {
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 500,
    border: '1px solid',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  
  moreZones: {
    fontSize: '11px',
    color: '#70757a',
    fontWeight: 500
  },
  
  editPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '8px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e8eaed'
  },
  
  editSelect: {
    padding: '6px 8px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '12px'
  },
  
  timeInputs: {
    display: 'flex',
    gap: '4px'
  },
  
  timeInput: {
    padding: '6px 8px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '12px',
    flex: 1
  },
  
  editActions: {
    display: 'flex',
    gap: '4px',
    justifyContent: 'center'
  },
  
  saveBtn: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: '#34a853',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px'
  },
  
  cancelBtn: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: '#ea4335',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px'
  },
  
  editMessage: {
    fontSize: '11px',
    textAlign: 'center',
    fontWeight: 500
  },
  
  editBtn: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    color: '#5f6368',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
    alignSelf: 'center',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },
  
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: '64px repeat(6, 1fr)',
    flex: 1
  },
  
  timeSlot: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingRight: '8px',
    paddingTop: '4px',
    borderBottom: '1px solid #f1f3f4'
  },
  
  timeLabel: {
    fontSize: '10px',
    color: '#70757a',
    fontWeight: 400
  },
  
  dayColumn: {
    position: 'relative',
    borderRight: '1px solid #e8eaed',
    minWidth: '240px'
  },
  
  hourLine: {
    height: '64px',
    borderBottom: '1px solid #f1f3f4'
  },
  
  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '2px',
    backgroundColor: '#ea4335',
    zIndex: 3,
    display: 'flex',
    alignItems: 'center'
  },
  
  nowDot: {
    width: '12px',
    height: '12px',
    backgroundColor: '#ea4335',
    borderRadius: '50%',
    marginLeft: '-6px',
    border: '2px solid #ffffff'
  },
  
  // Fond de colonne pour séparer visuellement les 2 staffs
  staffBgLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '50%',
    backgroundColor: '#fbfbfe',
    zIndex: 0
  },
  staffBgRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: '50%',
    backgroundColor: '#fdfcf8',
    zIndex: 0
  },
  
  event: {
    position: 'absolute',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#ffffff',
    overflow: 'hidden',
    boxShadow: '0 1px 3px 0 rgba(60,64,67,0.3)',
    transition: 'all 0.2s ease',
    zIndex: 2
  },
  
  eventSlot: {
    ':hover': {
      transform: 'scale(1.02)',
      boxShadow: '0 2px 8px 0 rgba(60,64,67,0.4)'
    }
  },
  
  eventBooking: {
    opacity: 0.9
  },
  
  eventTitle: {
    fontWeight: 600,
    fontSize: '12px',
    lineHeight: '16px',
    marginBottom: '2px'
  },
  
  eventZone: {
    fontSize: '11px',
    opacity: 0.9,
    lineHeight: '14px'
  },
  
  eventSubtitle: {
    fontSize: '10px',
    opacity: 0.8,
    lineHeight: '12px',
    marginTop: '2px'
  }
};

// BookingModal moved to components/BookingModal.tsx

const modalStyles: any = {
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
    boxShadow: '0 24px 38px 3px rgba(0,0,0,0.14), 0 9px 46px 8px rgba(0,0,0,0.12), 0 11px 15px -7px rgba(0,0,0,0.2)',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto'
  },
  
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '24px 24px 16px',
    borderBottom: '1px solid #e8eaed'
  },
  
  title: {
    fontSize: '20px',
    fontWeight: 500,
    color: '#3c4043',
    margin: 0
  },
  
  closeBtn: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    color: '#5f6368',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '18px',
    transition: 'background-color 0.2s ease'
  },
  
  timeInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '16px 24px',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #e8eaed'
  },
  
  timeIcon: {
    fontSize: '24px'
  },
  
  timeText: {
    fontSize: '16px',
    fontWeight: 500,
    color: '#3c4043',
    marginBottom: '4px'
  },
  
  timeRange: {
    fontSize: '14px',
    color: '#5f6368',
    marginBottom: '2px'
  },
  
  zoneInfo: {
    fontSize: '14px',
    color: '#1a73e8',
    fontWeight: 500
  },
  
  form: {
    padding: '24px'
  },
  
  formGroup: {
    marginBottom: '20px'
  },
  
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '20px'
  },
  
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#3c4043',
    marginBottom: '8px'
  },
  
  input: {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#3c4043',
    backgroundColor: '#ffffff',
    transition: 'border-color 0.2s ease',
    boxSizing: 'border-box'
  },
  
  select: {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#3c4043',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    boxSizing: 'border-box'
  },
  
  textarea: {
    width: '100%',
    padding: '12px 16px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '14px',
    color: '#3c4043',
    backgroundColor: '#ffffff',
    resize: 'vertical',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  
  successMessage: {
    padding: '12px 16px',
    backgroundColor: '#e8f5e8',
    color: '#137333',
    borderRadius: '4px',
    fontSize: '14px',
    marginBottom: '20px'
  },
  
  errorMessage: {
    padding: '12px 16px',
    backgroundColor: '#fce8e6',
    color: '#d93025',
    borderRadius: '4px',
    fontSize: '14px',
    marginBottom: '20px'
  },
  
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    paddingTop: '16px',
    borderTop: '1px solid #e8eaed'
  },
  
  cancelButton: {
    padding: '10px 24px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#3c4043',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  
  saveButton: {
    padding: '10px 24px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  
  saveButtonDisabled: {
    backgroundColor: '#dadce0',
    color: '#9aa0a6',
    cursor: 'not-allowed'
  }
};
function BookingDetailsModal({ open, onClose, booking, onCanceled }:{ open:boolean; onClose:()=>void; booking:Booking|null; onCanceled:()=>void }){
  const [err,setErr]=useState<string|null>(null);
  const [loading,setLoading]=useState(false);
  if (!open || !booking) return null;
  async function cancel(){
    setLoading(true); setErr(null);
    try{
      const res = await fetch(`${API}/book/${booking.id}`, { method:'DELETE' });
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.detail||data?.error||'Annulation impossible');
      await onCanceled();
    }catch(e:any){ setErr(e.message||'Erreur'); } finally{ setLoading(false); }
  }
  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e=>e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Détails du rendez-vous</h2>
          <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
        </div>
        <div style={modalStyles.form}>
          <div style={{marginBottom:12}}><b>Quand:</b> {new Date(booking.start).toLocaleString('fr-FR')} → {new Date(booking.end).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div>
          <div style={{marginBottom:12}}><b>Zone:</b> {booking.zone}</div>
          <div style={{marginBottom:12}}><b>Client:</b> {booking.client_name}</div>
          {booking.staff_name && <div style={{marginBottom:12}}><b>Staff:</b> {booking.staff_name}</div>}
          {err && <div style={modalStyles.errorMessage}>❌ {err}</div>}
          <div style={modalStyles.actions}>
            <button onClick={onClose} style={modalStyles.cancelButton}>Fermer</button>
            <button onClick={cancel} disabled={loading} style={modalStyles.saveButton}>{loading?'Annulation…':'Annuler le rendez-vous'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
