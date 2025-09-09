// app/calendar/page.tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import tz from 'dayjs/plugin/timezone';
import 'dayjs/locale/fr';
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

type Zone = { id: number; name: string; color?: string };
type ZoneRule = { id: number; zone_id: number; weekday: number; start_time: string; end_time: string };
type StaffZoneRule = { id:number; staff_id:number; zone_id:number; weekday:number; start_time:string; end_time:string };
type ZoneException = { id:number; zone_id:number; date:string; start_time:string; end_time:string; note?:string };
type Booking = { id:number; start:string; end:string; zone:string; zone_id:number; staff_name?:string; client_name:string };

export default function CalendarWeek() {
  const [weekStart, setWeekStart] = useState(dayjs().startOf('week').add(1, 'day')); // Lundi
  const [slots, setSlots] = useState<Slot[]>([]);
  const [zonesList, setZonesList] = useState<Zone[]>([]);
  const [zoneRules, setZoneRules] = useState<ZoneRule[]>([]);
  const [staffZoneRules, setStaffZoneRules] = useState<StaffZoneRule[]>([]);
  const [zoneExceptions, setZoneExceptions] = useState<ZoneException[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staffs, setStaffs] = useState<{ id: number; name: string }[]>([]);
  const staffMap = useMemo(() => Object.fromEntries(staffs.map(s => [s.id, s.name])), [staffs]);
  const zoneByName = useMemo(() => Object.fromEntries(zonesList.map(z => [z.name, z])), [zonesList]);
  const zoneById = useMemo(() => Object.fromEntries(zonesList.map(z => [z.id, z])), [zonesList]);

  const [zoneFilter, setZoneFilter] = useState<string | undefined>();
  const [staffFilter, setStaffFilter] = useState<number | undefined>();

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Edition ponctuelle (jour par jour)
  const [editDay, setEditDay] = useState<string | null>(null); // YYYY-MM-DD
  const [editZoneId, setEditZoneId] = useState<number>(0);
  const [editStart, setEditStart] = useState('09:00:00');
  const [editEnd, setEditEnd] = useState('18:00:00');
  const [editLoading, setEditLoading] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  // Chargements init
  useEffect(() => {
    Promise.all([
      fetch(`${API}/admin/zones`).then(r => r.json()).catch(() => []),
      fetch(`${API}/admin/zone_rules`).then(r => r.json()).catch(() => []),
      fetch(`${API}/admin/staff_zone_rules`).then(r => r.json()).catch(() => []),
      fetch(`${API}/admin/staff`).then(r => r.json()).catch(() => [])
    ]).then(([z, zr, szr, st]) => {
      setZonesList(Array.isArray(z) ? z : []);
      setZoneRules(Array.isArray(zr) ? zr : []);
      setStaffZoneRules(Array.isArray(szr) ? szr : []);
      setStaffs(Array.isArray(st) ? st : []);
    });
  }, []);

  // Charge les slots de la semaine
  function reloadSlots(base = weekStart) {
    const from = base.startOf('day').toISOString();
    const to = base.add(6, 'day').endOf('day').toISOString();
    const q = new URLSearchParams({ from, to } as any);
    fetch(`${API}/availability?${q.toString()}&_=${Date.now()}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setSlots(Array.isArray(d.slots) ? d.slots : []))
      .catch(() => setSlots([]));
  }
  useEffect(() => { reloadSlots(); }, [weekStart]);

  // Charger exceptions et réservations pour la semaine visible (header + RDV pris)
  useEffect(() => {
    const from = weekStart.startOf('day').format('YYYY-MM-DD');
    const to = weekStart.add(6, 'day').endOf('day').format('YYYY-MM-DD');
    fetch(`${API}/admin/zone_exceptions?from=${from}&to=${to}`)
      .then(r => r.json()).then(d => setZoneExceptions(Array.isArray(d) ? d : []))
      .catch(() => setZoneExceptions([]));

    const qb = new URLSearchParams({
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
      ...(zoneFilter ? { zone: zoneFilter } : {})
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
          staff_name: x.staff_name || undefined,
          client_name: x.client_name || ''
        }));
        setBookings(mapped);
      })
      .catch(() => setBookings([]));
  }, [weekStart, zoneFilter]);

  function asTime(v: string) { return v.length === 5 ? `${v}:00` : v; }
  async function applyDayConfig(dateStr: string) {
    if (!editZoneId) { setEditMsg('Choisissez une zone'); return; }
    setEditLoading(true); setEditMsg(null);
    try {
      const body = {
        zone_id: editZoneId,
        from_date: dateStr,
        to_date: dateStr,
        start_time: asTime(editStart),
        end_time: asTime(editEnd),
        replace: true
      };
      const res = await fetch(`${API}/admin/generate_exceptions_range`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.message || e?.error || 'Erreur enregistrement');
      }
      setEditMsg('Enregistré');
      reloadSlots();
    } catch (e: any) {
      setEditMsg(e.message || 'Erreur');
    } finally { setEditLoading(false); }
  }

  // Jours affichés
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  // Règles des zones par weekday (0..6)
  const rulesByWeekday = useMemo(() => {
    const map = new Map<number, Map<number, Array<{ start: string; end: string }>>>();

    const feed = (arr: Array<{ zone_id:number; weekday:number; start_time:string; end_time:string }>) => {
      for (const r of arr) {
        const wd = ((r.weekday % 7) + 7) % 7; // 7 => 0
        if (!map.has(wd)) map.set(wd, new Map());
        const m = map.get(wd)!;
        if (!m.has(r.zone_id)) m.set(r.zone_id, []);
        m.get(r.zone_id)!.push({ start: r.start_time, end: r.end_time });
      }
    };

    if (zoneRules.length) feed(zoneRules);
    else if (staffZoneRules.length) feed(staffZoneRules);

    // tri et dédoublonnage des plages identiques
    for (const m of map.values()) {
      for (const [k, arr] of m.entries()) {
        arr.sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
        const uniq: typeof arr = [];
        let last: {start:string;end:string}|null = null;
        for (const x of arr) {
          if (!last || last.start!==x.start || last.end!==x.end) { uniq.push(x); last = x; }
        }
        m.set(k, uniq);
      }
    }
    return map;
  }, [zoneRules, staffZoneRules]);

  function zonesForDay(wd: number) {
    const m = rulesByWeekday.get(wd);
    if (!m) return [] as Array<{ id: number; name: string; color?: string; ranges: string[] }>;
    const zmap = Object.fromEntries(zonesList.map(z => [z.id, z]));
    const out: Array<{ id: number; name: string; color?: string; ranges: string[] }> = [];
    for (const [zoneId, ranges] of m.entries()) {
      const z = zmap[zoneId]; if (!z) continue;
      if (zoneFilter && z.name !== zoneFilter) continue;
      out.push({ id: zoneId, name: z.name, color: z.color, ranges: ranges.map(r => `${r.start.slice(0,5)}–${r.end.slice(0,5)}`) });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  // Exceptions par date (YYYY-MM-DD) → zone_id → ranges
  const exceptionsByDate = useMemo(() => {
    const map = new Map<string, Map<number, Array<{start:string;end:string}>>>();
    for (const e of zoneExceptions) {
      if (!map.has(e.date)) map.set(e.date, new Map());
      const m = map.get(e.date)!;
      if (!m.has(e.zone_id)) m.set(e.zone_id, []);
      m.get(e.zone_id)!.push({ start: e.start_time, end: e.end_time });
    }
    for (const m of map.values()) {
      for (const arr of m.values()) arr.sort((a,b)=> a.start.localeCompare(b.start));
    }
    return map;
  }, [zoneExceptions]);

  // Heures verticales affichées (7h → 20h)
  const hourStart = 7;
  const hourEnd = 20;
  const hours = useMemo(
    () => Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i),
    []
  );
  const PX_PER_HOUR = 60; // hauteur visuelle d'une heure
  const totalHeight = (hourEnd - hourStart) * PX_PER_HOUR;
  const [, setTick] = useState(0); // pour actualiser la ligne 'maintenant'
  useEffect(() => {
    const id = setInterval(() => setTick(x => x + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Slots filtrés
  const filteredSlots = useMemo(() => {
    return slots.filter(s => {
      if (zoneFilter && s.zone !== zoneFilter) return false;
      if (staffFilter && !s.available_staff_ids?.includes(staffFilter)) return false;
      return true;
    });
  }, [slots, zoneFilter, staffFilter]);

  // Mise en page type Google Calendar: position absolue avec lanes pour chevauchement
  type UiEvent = {
    id: string; kind: 'slot' | 'booking'; startISO: string; endISO: string;
    startMin: number; endMin: number; zone: string; color: string; title: string; subtitle?: string; clickable: boolean;
    lane?: number; lanesCount?: number;
  };
  function minutesFromStart(d: dayjs.Dayjs) {
    const t = d.tz('Europe/Paris');
    return t.hour() * 60 + t.minute() - hourStart * 60;
  }
  function eventsForDay(day: dayjs.Dayjs): UiEvent[] {
    const evts: UiEvent[] = [];
    for (const s of filteredSlots) {
      const ds = dayjs(s.start).tz('Europe/Paris');
      if (!ds.isSame(day, 'day')) continue;
      const de = dayjs(s.end).tz('Europe/Paris');
      const zc = (zoneByName[s.zone]?.color) || '#6b21a8';
      const title = `${ds.format('HH:mm')} → ${de.format('HH:mm')}`;
      const subtitle = (s.available_staff_names && s.available_staff_names.length
        ? s.available_staff_names
        : s.available_staff_ids.map(id => staffMap[id] || `Staff ${id}`)
      ).join(', ');
      evts.push({
        id: `slot-${s.start}-${s.end}-${s.zone}`,
        kind: 'slot', startISO: s.start, endISO: s.end,
        startMin: minutesFromStart(ds), endMin: minutesFromStart(de),
        zone: s.zone, color: zc, title, subtitle, clickable: true
      });
    }
    for (const b of bookings) {
      const ds = dayjs(b.start).tz('Europe/Paris');
      if (!ds.isSame(day, 'day')) continue;
      const de = dayjs(b.end).tz('Europe/Paris');
      const title = `${ds.format('HH:mm')} → ${de.format('HH:mm')}`;
      const subtitle = `${b.client_name}${b.staff_name ? ` · ${b.staff_name}` : ''}`;
      evts.push({
        id: `bk-${b.id}`,
        kind: 'booking', startISO: b.start, endISO: b.end,
        startMin: minutesFromStart(ds), endMin: minutesFromStart(de),
        zone: b.zone, color: '#ef4444', title, subtitle, clickable: false
      });
    }
    const maxMin = (hourEnd - hourStart) * 60;
    for (const e of evts) {
      e.startMin = Math.max(0, Math.min(maxMin, e.startMin));
      e.endMin = Math.max(0, Math.min(maxMin, e.endMin));
    }
    evts.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
    const laneEnds: number[] = [];
    for (const e of evts) {
      let lane = laneEnds.findIndex(end => end <= e.startMin);
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e.endMin); }
      else { laneEnds[lane] = e.endMin; }
      e.lane = lane;
    }
    const lanesCount = Math.max(1, laneEnds.length);
    for (const e of evts) e.lanesCount = lanesCount;
    return evts;
  }

  function prevWeek() { setWeekStart(weekStart.subtract(7, 'day')); }
  function nextWeek() { setWeekStart(weekStart.add(7, 'day')); }
  function goToday() { setWeekStart(dayjs().startOf('week').add(1, 'day')); }

  return (
    <main style={{ maxWidth: '100%', margin: '16px auto', fontFamily: 'ui-sans-serif' }}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={prevWeek} style={styles.navBtn}>←</button>
          <button onClick={goToday} style={styles.navBtn}>Aujourd’hui</button>
          <button onClick={nextWeek} style={styles.navBtn}>→</button>
          <h2 style={{ margin: '0 12px', fontSize:20 }}>
            Semaine du {weekStart.format('DD MMM')} au {weekStart.add(6,'day').format('DD MMM YYYY')}
          </h2>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={styles.legend}><span style={{...styles.legendDot, background:'#6b21a8'}} /> Libre</div>
          <div style={styles.legend}><span style={{...styles.legendDot, background:'#ef4444'}} /> Réservé</div>
          <select value={zoneFilter || ''} onChange={e => setZoneFilter(e.target.value || undefined)} style={styles.select}>
            <option value="">Toutes les zones</option>
            {zonesList.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
          </select>
          <select value={staffFilter || 0} onChange={e => setStaffFilter(Number(e.target.value) || undefined)} style={styles.select}>
            <option value={0}>Tous les staffs</option>
            {staffs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      </div>

      {/* Grille semaine */}
      <div style={{ display: 'grid', gridTemplateColumns: `100px repeat(7, 1fr)`, border: '1px solid #e5e7eb', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 2px rgba(0,0,0,0.06)' }}>
        {/* En-têtes jours */}
        <div style={{...styles.headerCell, position:'sticky', top:0, zIndex:5, background:'#fff'}}></div>
        {days.map(d => {
          const wd = d.day();
          const dateStr = d.format('YYYY-MM-DD');
          const ex = exceptionsByDate.get(dateStr);
          let zForDay = [] as Array<{ id:number; name:string; color?:string; ranges:string[] }>;
          if (ex && ex.size) {
            const zmap = Object.fromEntries(zonesList.map(z => [z.id, z]));
            for (const [zoneId, ranges] of ex.entries()) {
              const z = zmap[zoneId]; if (!z) continue;
              if (zoneFilter && z.name !== zoneFilter) continue;
              const hasStaff = staffZoneRules.some(r => r.zone_id===zoneId && r.weekday===wd);
              const labelRanges = ranges.map(r => `${r.start.slice(0,5)}–${r.end.slice(0,5)}`);
              zForDay.push({ id: zoneId, name: z.name + (hasStaff? '' : ' • aucun staff'), color: z.color, ranges: labelRanges });
            }
            zForDay.sort((a,b)=> a.name.localeCompare(b.name));
          } else {
            zForDay = zonesForDay(wd);
          }
          return (
            <div key={d.toString()} style={{...styles.headerCell, position:'sticky', top:0, zIndex:4, background:'#fff'}}>
              <div style={{ fontWeight: 700 }}>{d.format('dddd')}</div>
              <div style={{ opacity: 0.8, fontSize:13 }}>{d.format('DD/MM')}</div>
              {d.isSame(dayjs(),'day') && <div style={styles.todayBadge}>Aujourd’hui</div>}
              {zForDay.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, justifyContent: 'center' }}>
                  {zForDay.map(z => (
                    <span key={z.id} title={z.ranges.join(', ')} style={{
                      padding: '2px 8px', border: `1px solid ${z.color || '#e5e7eb'}`, borderRadius: 999, fontSize: 12, lineHeight: '18px', background: '#fff'
                    }}>
                      {z.name}{z.ranges.length ? ` (${z.ranges.join(', ')})` : ''}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 6 }}>
                {editDay === dateStr ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <select value={editZoneId} onChange={e => setEditZoneId(Number(e.target.value))} style={styles.select}>
                      <option value={0}>Zone…</option>
                      {zonesList.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <input type="time" value={editStart.slice(0,5)} onChange={e => setEditStart(asTime(e.target.value))} style={styles.input} />
                      <input type="time" value={editEnd.slice(0,5)} onChange={e => setEditEnd(asTime(e.target.value))} style={styles.input} />
                    </div>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button onClick={() => applyDayConfig(dateStr)} disabled={editLoading} style={styles.primaryBtn}>{editLoading ? 'Enregistrement…' : 'Appliquer au jour'}</button>
                      <button onClick={() => { setEditDay(null); setEditMsg(null); }} style={styles.secondaryBtn}>Fermer</button>
                    </div>
                    {editMsg && <div style={{ fontSize: 12, color: editMsg==='Enregistré' ? '#16a34a' : '#dc2626' }}>{editMsg}</div>}
                  </div>
                ) : (
                  <button onClick={() => { setEditDay(dateStr); setEditZoneId(zonesList[0]?.id || 0); setEditMsg(null); }} style={styles.btn}>Modifier</button>
                )}
              </div>
            </div>
          );
        })}

        {/* Corps horaires (une seule rangée, colonnes par jour) */}
        <Row>
          {/* Colonne heures */}
          <div style={{ ...styles.hoursBody, height: totalHeight, position:'relative' }}>
            {hours.map((h,i)=> (
              <div key={h} style={{ position:'absolute', top: i*PX_PER_HOUR-8, right:8, color:'#6b7280', fontSize:12 }}>{(`${h}`).padStart(2,'0')}:00</div>
            ))}
          </div>
          {/* Colonnes jours */}
          {days.map(d => {
            const evts = eventsForDay(d);
            const isWknd = d.day()===0 || d.day()===6;
            const now = dayjs().tz('Europe/Paris');
            const showNow = d.isSame(now,'day');
            const nowMin = (now.hour()*60+now.minute()) - hourStart*60;
            return (
              <div key={`col-${d.toString()}`} style={{ ...styles.dayCol, height: totalHeight, background: isWknd?'#fafafc':'#fff', backgroundImage: `repeating-linear-gradient(to bottom, #eef2f7 0, #eef2f7 1px, transparent 1px, transparent ${PX_PER_HOUR}px)` }}>
                {showNow && nowMin>=0 && nowMin<=(hourEnd-hourStart)*60 && (
                  <div style={{ position:'absolute', top: nowMin/60*PX_PER_HOUR, left:0, right:0, height:2, background:'#ef4444' }} />
                )}
                {evts.map((e)=>{
                  const gap = 4; const cols = Math.max(1, e.lanesCount||1);
                  const widthPct = (100 - (cols-1)*gap) / cols;
                  const leftPct  = (e.lane||0) * (widthPct + gap);
                  const top = (e.startMin/60)*PX_PER_HOUR;
                  const height = Math.max(18, ((e.endMin - e.startMin)/60)*PX_PER_HOUR);
                  return (
                    <div key={e.id}
                      onClick={e.clickable? ()=>{ const s = slots.find(s=> `slot-${s.start}-${s.end}-${s.zone}`===e.id); if (s){ setSelectedSlot(s as any); setModalOpen(true);} }: undefined}
                      style={{ position:'absolute', top, left: `${leftPct}%`, width: `${widthPct}%`, height, background: e.color, color:'#fff', borderRadius:8, padding:'6px 8px', boxShadow:'inset 0 -1px 0 rgba(0,0,0,0.08)', cursor: e.clickable?'pointer':'default', overflow:'hidden' }}
                      title={`${e.title} · ${e.zone}${e.subtitle?` · ${e.subtitle}`:''}`}
                    >
                      <div style={{fontWeight:600}}>{e.title}</div>
                      <div style={{fontSize:12,opacity:0.95}}>{e.zone}</div>
                      {e.subtitle && <div style={{fontSize:11,opacity:0.9}}>{e.subtitle}</div>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Row>
      </div>

      <BookingModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        slot={selectedSlot}
        staffMap={staffMap}
      />
    </main>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

const styles: any = {
  toolbar: { display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap', marginBottom:12 },
  navBtn: { padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' },
  btn: { padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', cursor: 'pointer' },
  select: { padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff' },
  headerCell: { border: '1px solid #e5e7eb', padding: 10, textAlign: 'center', background: '#f9fafb' },
  hourCell: { border: '1px solid #e5e7eb', padding: 8, fontSize: 12, textAlign: 'right', background: '#fafafa' },
  dayCell: { border: '1px solid #e5e7eb', minHeight: 64, position: 'relative', padding: 6, display: 'flex', flexDirection: 'column', gap: 6 },
  hoursBody: { borderRight: '1px solid #e5e7eb', background:'#fafafa' },
  dayCol: { position:'relative', borderLeft: '1px solid #e5e7eb' },
  slotBox: { color: '#fff', padding: '6px 8px', borderRadius: 8, fontSize: 12, cursor: 'pointer', overflow: 'hidden', boxShadow:'inset 0 -1px 0 rgba(0,0,0,0.08)' },
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  modal: { background: '#fff', padding: 20, borderRadius: 12, maxWidth: 520, width: '100%' },
  input: { padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, width: '100%' },
  primaryBtn: { padding: '8px 12px', background: '#6b21a8', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' },
  secondaryBtn: { padding: '8px 12px', background: '#e5e7eb', border: 'none', borderRadius: 8, cursor: 'pointer' },
  legend: { display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#374151' },
  legendDot: { width:10, height:10, borderRadius:999, display:'inline-block' },
  todayBadge: { display:'inline-block', marginTop:6, fontSize:11, padding:'2px 6px', background:'#e0f2fe', color:'#0369a1', borderRadius:999 }
};

// ===== Booking Modal =====
function BookingModal({
  open, onClose, slot, staffMap
}: { open: boolean; onClose: () => void; slot: Slot | null; staffMap: Record<number, string>; }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [att, setAtt] = useState('');
  const [staffId, setStaffId] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false); const [ok, setOk] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(''); setEmail(''); setTel(''); setTitle(''); setNotes(''); setAtt('');
      setStaffId(undefined); setOk(null); setErr(null); setLoading(false);
    }
  }, [open]);

  if (!open || !slot) return null;

  async function book() {
    setLoading(true); setOk(null); setErr(null);
    try {
      const localStart = dayjs(slot.start).tz('Europe/Paris').format();
      const localEnd   = dayjs(slot.end).tz('Europe/Paris').format();
      const body: any = {
        slot_start: localStart, slot_end: localEnd, zone_name: slot.zone,
        client_name: name, client_email: email, client_phone: tel,
        summary: title, notes,
        attendees: att.split(',').map(s => s.trim()).filter(Boolean),
      };
      if (staffId) body.staff_id = staffId;
      const res = await fetch(`${API}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(body)
      });
      const data = await res.json(); if (!res.ok) throw new Error(data?.detail || data?.error || 'Erreur');
      setOk(`Réservé. ${staffMap[data.staff_id] || `Staff ${data.staff_id}`}. Event ${data.event_id || ''}`);
    } catch (e: any) { setErr(e.message || 'Erreur'); } finally { setLoading(false); }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Créer un événement</h3>
        <p style={{ marginTop: 8 }}>
          <b>{new Date(slot.start).toLocaleString('fr-FR')}</b>
          {' '}→ {new Date(slot.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          {' '}· Zone <b>{slot.zone}</b>
        </p>

        <div style={{ display: 'grid', gap: 8 }}>
          <input placeholder="Titre (optionnel)" value={title} onChange={e => setTitle(e.target.value)} style={styles.input} />
          <textarea placeholder="Notes (optionnel)" value={notes} onChange={e => setNotes(e.target.value)} style={{ ...styles.input, minHeight: 70 }} />
          <input placeholder="Invités (emails, séparés par virgules)" value={att} onChange={e => setAtt(e.target.value)} style={styles.input} />

          <div style={{ display: 'flex', gap: 8 }}>
            <select value={staffId ?? 0} onChange={e => setStaffId(Number(e.target.value) || undefined)} style={styles.input}>
              <option value={0}>Auto (least-load)</option>
              {slot.available_staff_ids.map(id => <option key={id} value={id}>{staffMap[id] || `Staff ${id}`}</option>)}
            </select>
            <input placeholder="Nom client *" value={name} onChange={e => setName(e.target.value)} style={styles.input} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Email client" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} />
            <input placeholder="Téléphone" value={tel} onChange={e => setTel(e.target.value)} style={styles.input} />
          </div>

          <button onClick={book} disabled={!name || loading} style={styles.primaryBtn}>{loading ? 'Création…' : 'Créer l’événement'}</button>
          {ok && <div style={{ color: '#16a34a', fontSize: 13 }}>{ok}</div>}
          {err && <div style={{ color: '#dc2626', fontSize: 13 }}>{err}</div>}
          <button onClick={onClose} style={styles.secondaryBtn}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
