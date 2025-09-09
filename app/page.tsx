// app/page.tsx
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
  const [weekStart, setWeekStart] = useState(dayjs().startOf('week').add(1, 'day'));
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
  const [viewMode, setViewMode] = useState<'week' | 'day'>('week');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);

  // Edition ponctuelle
  const [editDay, setEditDay] = useState<string | null>(null);
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

  // Charger exceptions et réservations
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

  // Règles des zones par weekday
  const rulesByWeekday = useMemo(() => {
    const map = new Map<number, Map<number, Array<{ start: string; end: string }>>>();

    const feed = (arr: Array<{ zone_id:number; weekday:number; start_time:string; end_time:string }>) => {
      for (const r of arr) {
        const wd = ((r.weekday % 7) + 7) % 7;
        if (!map.has(wd)) map.set(wd, new Map());
        const m = map.get(wd)!;
        if (!m.has(r.zone_id)) m.set(r.zone_id, []);
        m.get(r.zone_id)!.push({ start: r.start_time, end: r.end_time });
      }
    };

    if (zoneRules.length) feed(zoneRules);
    else if (staffZoneRules.length) feed(staffZoneRules);

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

  // Exceptions par date
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

  // Configuration des heures
  const hourStart = 6;
  const hourEnd = 22;
  const hours = useMemo(
    () => Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i),
    []
  );
  const PX_PER_HOUR = 64;
  const totalHeight = (hourEnd - hourStart) * PX_PER_HOUR;
  const [, setTick] = useState(0);
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

  // Événements UI
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
      const zc = (zoneByName[s.zone]?.color) || '#4285f4';
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
        zone: b.zone, color: '#ea4335', title, subtitle, clickable: false
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
          <div style={styles.viewToggle}>
            <button 
              onClick={() => setViewMode('day')} 
              style={{...styles.viewBtn, ...(viewMode === 'day' ? styles.viewBtnActive : {})}}
            >
              Jour
            </button>
            <button 
              onClick={() => setViewMode('week')} 
              style={{...styles.viewBtn, ...(viewMode === 'week' ? styles.viewBtnActive : {})}}
            >
              Semaine
            </button>
          </div>

          <div style={styles.filters}>
            <select 
              value={zoneFilter || ''} 
              onChange={e => setZoneFilter(e.target.value || undefined)} 
              style={styles.filterSelect}
            >
              <option value="">Toutes les zones</option>
              {zonesList.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
            </select>
            
            <select 
              value={staffFilter || 0} 
              onChange={e => setStaffFilter(Number(e.target.value) || undefined)} 
              style={styles.filterSelect}
            >
              <option value={0}>Tous les staffs</option>
              {staffs.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <button style={styles.settingsBtn}>
            <Settings />
          </button>
        </div>
      </header>

      {/* Calendrier principal */}
      <main style={styles.main}>
        <div style={styles.calendarContainer}>
          {/* En-têtes des jours */}
          <div style={styles.weekHeader}>
            <div style={styles.timeColumn}></div>
            {days.map(d => {
              const wd = d.day();
              const dateStr = d.format('YYYY-MM-DD');
              const isToday = d.isSame(dayjs(), 'day');
              const isWeekend = wd === 0 || wd === 6;
              
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
                  
                  {zForDay.length > 0 && (
                    <div style={styles.dayZones}>
                      {zForDay.slice(0, 3).map(z => (
                        <div key={z.id} style={{
                          ...styles.zoneChip,
                          backgroundColor: z.color + '20',
                          borderColor: z.color,
                          color: z.color
                        }}>
                          {z.name}
                        </div>
                      ))}
                      {zForDay.length > 3 && (
                        <div style={styles.moreZones}>+{zForDay.length - 3}</div>
                      )}
                    </div>
                  )}

                  {editDay === dateStr ? (
                    <div style={styles.editPanel}>
                      <select 
                        value={editZoneId} 
                        onChange={e => setEditZoneId(Number(e.target.value))} 
                        style={styles.editSelect}
                      >
                        <option value={0}>Zone…</option>
                        {zonesList.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                      </select>
                      <div style={styles.timeInputs}>
                        <input 
                          type="time" 
                          value={editStart.slice(0,5)} 
                          onChange={e => setEditStart(asTime(e.target.value))} 
                          style={styles.timeInput} 
                        />
                        <input 
                          type="time" 
                          value={editEnd.slice(0,5)} 
                          onChange={e => setEditEnd(asTime(e.target.value))} 
                          style={styles.timeInput} 
                        />
                      </div>
                      <div style={styles.editActions}>
                        <button 
                          onClick={() => applyDayConfig(dateStr)} 
                          disabled={editLoading} 
                          style={styles.saveBtn}
                        >
                          {editLoading ? '⏳' : '✓'}
                        </button>
                        <button 
                          onClick={() => { setEditDay(null); setEditMsg(null); }} 
                          style={styles.cancelBtn}
                        >
                          ✕
                        </button>
                      </div>
                      {editMsg && (
                        <div style={{
                          ...styles.editMessage,
                          color: editMsg === 'Enregistré' ? '#34d399' : '#f87171'
                        }}>
                          {editMsg}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button 
                      onClick={() => { 
                        setEditDay(dateStr); 
                        setEditZoneId(zonesList[0]?.id || 0); 
                        setEditMsg(null); 
                      }} 
                      style={styles.editBtn}
                    >
                      <Edit />
                    </button>
                  )}
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

            {/* Colonnes des jours */}
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

                  {/* Événements */}
                  {evts.map((e) => {
                    const gap = 2;
                    const cols = Math.max(1, e.lanesCount || 1);
                    const widthPct = (100 - (cols - 1) * gap) / cols;
                    const leftPct = (e.lane || 0) * (widthPct + gap);
                    const top = (e.startMin / 60) * PX_PER_HOUR;
                    const height = Math.max(24, ((e.endMin - e.startMin) / 60) * PX_PER_HOUR);

                    return (
                      <div
                        key={e.id}
                        onClick={e.clickable ? () => {
                          const s = slots.find(s => `slot-${s.start}-${s.end}-${s.zone}` === e.id);
                          if (s) {
                            setSelectedSlot(s as any);
                            setModalOpen(true);
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
                          cursor: e.clickable ? 'pointer' : 'default'
                        }}
                        title={`${e.title} · ${e.zone}${e.subtitle ? ` · ${e.subtitle}` : ''}`}
                      >
                        <div style={styles.eventTitle}>{e.title}</div>
                        <div style={styles.eventZone}>{e.zone}</div>
                        {e.subtitle && (
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
    flexDirection: 'column'
  },
  
  weekHeader: {
    display: 'grid',
    gridTemplateColumns: '64px repeat(7, 1fr)',
    borderBottom: '1px solid #e8eaed',
    backgroundColor: '#ffffff',
    position: 'sticky',
    top: '73px',
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
    gridTemplateColumns: '64px repeat(7, 1fr)',
    flex: 1,
    overflow: 'auto'
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
    borderRight: '1px solid #e8eaed'
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

// Modal de réservation modernisée
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
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
      const localEnd = dayjs(slot.end).tz('Europe/Paris').format();
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
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Erreur');
      setOk(`Réservation confirmée ! ${staffMap[data.staff_id] || `Staff ${data.staff_id}`}`);
    } catch (e: any) {
      setErr(e.message || 'Erreur lors de la réservation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Nouvelle réservation</h2>
          <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
        </div>
        
        <div style={modalStyles.timeInfo}>
          <div style={modalStyles.timeIcon}>🕐</div>
          <div>
            <div style={modalStyles.timeText}>
              {new Date(slot.start).toLocaleDateString('fr-FR', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })}
            </div>
            <div style={modalStyles.timeRange}>
              {new Date(slot.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              {' '}–{' '}
              {new Date(slot.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            <div style={modalStyles.zoneInfo}>Zone: {slot.zone}</div>
          </div>
        </div>

        <form style={modalStyles.form}>
          <div style={modalStyles.formGroup}>
            <label style={modalStyles.label}>Titre de l'événement</label>
            <input
              type="text"
              placeholder="Rendez-vous client..."
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={modalStyles.input}
            />
          </div>

          <div style={modalStyles.formRow}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Nom du client *</label>
              <input
                type="text"
                placeholder="Jean Dupont"
                value={name}
                onChange={e => setName(e.target.value)}
                style={modalStyles.input}
                required
              />
            </div>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Staff assigné</label>
              <select
                value={staffId ?? 0}
                onChange={e => setStaffId(Number(e.target.value) || undefined)}
                style={modalStyles.select}
              >
                <option value={0}>Attribution automatique</option>
                {slot.available_staff_ids.map(id => (
                  <option key={id} value={id}>
                    {staffMap[id] || `Staff ${id}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={modalStyles.formRow}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Email</label>
              <input
                type="email"
                placeholder="jean.dupont@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                style={modalStyles.input}
              />
            </div>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Téléphone</label>
              <input
                type="tel"
                placeholder="06 12 34 56 78"
                value={tel}
                onChange={e => setTel(e.target.value)}
                style={modalStyles.input}
              />
            </div>
          </div>

          <div style={modalStyles.formGroup}>
            <label style={modalStyles.label}>Notes</label>
            <textarea
              placeholder="Informations complémentaires..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={modalStyles.textarea}
              rows={3}
            />
          </div>

          <div style={modalStyles.formGroup}>
            <label style={modalStyles.label}>Invités (emails séparés par des virgules)</label>
            <input
              type="text"
              placeholder="invite1@email.com, invite2@email.com"
              value={att}
              onChange={e => setAtt(e.target.value)}
              style={modalStyles.input}
            />
          </div>

          {ok && (
            <div style={modalStyles.successMessage}>
              ✅ {ok}
            </div>
          )}

          {err && (
            <div style={modalStyles.errorMessage}>
              ❌ {err}
            </div>
          )}

          <div style={modalStyles.actions}>
            <button
              type="button"
              onClick={onClose}
              style={modalStyles.cancelButton}
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={book}
              disabled={!name || loading}
              style={{
                ...modalStyles.saveButton,
                ...((!name || loading) ? modalStyles.saveButtonDisabled : {})
              }}
            >
              {loading ? 'Création en cours...' : 'Créer l\'événement'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

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