'use client';
import { useEffect, useMemo, useState, useCallback } from 'react';
import PinGate from './components/PinGate';
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

type Booking = { 
  id: number; 
  start: string; 
  end: string; 
  zone: string; 
  zone_id: number; 
  staff_id?: number; 
  staff_name?: string; 
  client_name: string; 
  restaurant_name?: string; 
  city?: string; 
  title?: string; 
  meeting_mode?: 'visio' | 'physique' 
};

type StaffZone = { staff_id: number; zone_id: number };

export default function CalendarWeek() {
  function weekStartMonday(base: any) {
    const s = dayjs(base).startOf('week');
    return s.day() === 1 ? s : s.add(1, 'day');
  }

  const [weekStart, setWeekStart] = useState(weekStartMonday(dayjs()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [mergedAvail, setMergedAvail] = useState<Array<{start: string; end: string; staff_id: number}>>([]);
  const [zonesList, setZonesList] = useState<{id: number; name: string; color?: string}[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staffs, setStaffs] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<any | null>(null);
  const [staffZones, setStaffZones] = useState<StaffZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataLoaded, setDataLoaded] = useState(false);

  const zonesById = useMemo(() => {
    const m = new Map<number, string>();
    for (const z of zonesList) m.set(z.id, z.name);
    return m;
  }, [zonesList]);

  const staffMap = useMemo(() => Object.fromEntries(staffs.map(s => [s.id, s.name])), [staffs]);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Chargement initial des données de base
  const loadInitialData = useCallback(async () => {
    try {
      const [st, se, sz, z] = await Promise.all([
        fetch(`${API}/admin/staff`).then(r => r.json()).catch(() => []),
        fetch(`${API}/admin/settings`).then(r => r.json()).catch(() => null),
        fetch(`${API}/admin/staff_zones`).then(r => r.json()).catch(() => []),
        fetch(`${API}/admin/zones`).then(r => r.json()).catch(() => [])
      ]);
      
      setStaffs(Array.isArray(st) ? st : []);
      setSettings(se);
      setStaffZones(Array.isArray(sz) ? sz : []);
      setZonesList(Array.isArray(z) ? z : []);
      setDataLoaded(true);
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
      setDataLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Chargement des slots et réservations
  const loadWeekData = useCallback(async (base = weekStart) => {
    if (!dataLoaded) return;
    
    setLoading(true);
    try {
      const from = base.startOf('day').toISOString();
      const to = base.add(6, 'day').endOf('day').toISOString();
      const fromDate = base.startOf('day').format('YYYY-MM-DD');
      const toDate = base.add(6, 'day').endOf('day').format('YYYY-MM-DD');

      const ids = (staffs && staffs.length >= 2) ? [staffs[0].id, staffs[1].id] : [];
      
      const promises = [];

      // Chargement des disponibilités
      if (ids.length === 2) {
        const [id1, id2] = ids;
        const q1 = new URLSearchParams({ from, to, only: 'merged', staff_id: String(id1) } as any);
        const q2 = new URLSearchParams({ from, to, only: 'merged', staff_id: String(id2) } as any);
        promises.push(
          Promise.all([
            fetch(`${API}/availability?${q1.toString()}&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ merged: [] })),
            fetch(`${API}/availability?${q2.toString()}&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({ merged: [] })),
          ]).then(([d1, d2]) => {
            const m1 = Array.isArray(d1.merged) ? d1.merged : [];
            const m2 = Array.isArray(d2.merged) ? d2.merged : [];
            setMergedAvail([...m1, ...m2]);
            setSlots([]);
          })
        );
      } else {
        const q = new URLSearchParams({ from, to, only: 'merged' } as any);
        promises.push(
          fetch(`${API}/availability?${q.toString()}&_=${Date.now()}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => {
              setMergedAvail(Array.isArray(d.merged) ? d.merged : []);
              setSlots([]);
            })
        );
      }

      // Chargement des réservations
      const qb = new URLSearchParams({
        from: `${fromDate}T00:00:00Z`,
        to: `${toDate}T23:59:59Z`
      } as any);
      
      promises.push(
        fetch(`${API}/admin/bookings?${qb.toString()}`)
          .then(r => r.json())
          .then(arr => {
            if (!Array.isArray(arr)) return setBookings([]);
            const mapped = arr.map((x: any) => ({
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
          .catch(() => setBookings([]))
      );

      await Promise.all(promises);
    } catch (error) {
      console.error('Erreur lors du chargement des données de la semaine:', error);
    } finally {
      setLoading(false);
    }
  }, [weekStart, dataLoaded, staffs]);

  useEffect(() => {
    loadWeekData();
  }, [loadWeekData]);

  // Recharge uniquement les réservations
  const reloadBookings = useCallback(async () => {
    try {
      const from = weekStart.startOf('day').format('YYYY-MM-DD');
      const to = weekStart.add(6, 'day').endOf('day').format('YYYY-MM-DD');
      const qb = new URLSearchParams({
        from: `${from}T00:00:00Z`,
        to: `${to}T23:59:59Z`
      } as any);
      
      const arr = await fetch(`${API}/admin/bookings?${qb.toString()}`).then(r => r.json());
      if (!Array.isArray(arr)) { setBookings([]); return; }
      
      const mapped = arr.map((x: any) => ({
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
    } catch { 
      setBookings([]); 
    }
  }, [weekStart]);

  // Jours affichés
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => weekStart.add(i, 'day')), [weekStart]); // Lundi à Samedi

  // Configuration des heures
  const hourStart = 8;
  const hourEnd = 20;
  const hours = useMemo(
    () => Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i),
    []
  );
  const PX_PER_HOUR = 80; // Augmenté de 60 à 80px par heure
  const [hoverTime, setHoverTime] = useState<{ day: string; time: string; y: number } | null>(null);

  // Événements UI
  type UiEvent = {
    id: string;
    kind: 'slot' | 'booking';
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
    isShort?: boolean;
  };

  function minutesFromStart(d: dayjs.Dayjs) {
    const t = d.tz('Europe/Paris');
    return t.hour() * 60 + t.minute() - hourStart * 60;
  }

  function eventsForDay(day: dayjs.Dayjs): UiEvent[] {
    const staffOrder = (staffs && staffs.length >= 2) ? [staffs[0].id, staffs[1].id] : [1, 2];
    const evts: UiEvent[] = [];

    // Créneaux disponibles
    for (let lane = 0; lane < 2; lane++) {
      const staffId = staffOrder[lane];
      if (staffId == null) continue;

      const fromApi = (mergedAvail || [])
        .filter(m => Number(m.staff_id) === Number(staffId))
        .filter(m => dayjs(m.start).tz('Europe/Paris').isSame(day, 'day'))
        .map(m => ({ start: m.start, end: m.end }))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

      for (const m of fromApi) {
        const ms = dayjs(m.start).tz('Europe/Paris');
        const me = dayjs(m.end).tz('Europe/Paris');
        const physDurMin = Number(settings?.demo_physique_duration_min ?? settings?.default_duration_min ?? 30);
        const intervalMin = me.diff(ms, 'minute');
        const isShort = intervalMin < physDurMin;
        const displayEnd = isShort ? me : me.subtract(Math.min(15, physDurMin), 'minute');

        if (displayEnd.isAfter(ms)) {
          evts.push({
            id: `avail-${staffId}-${m.start}-${m.end}`,
            kind: 'slot',
            startISO: ms.toISOString(),
            endISO: displayEnd.toISOString(),
            startMin: minutesFromStart(ms),
            endMin: minutesFromStart(displayEnd),
            zone: '',
            zone_id: undefined,
            color: isShort ? '#34a853' : '#34a853',
            title: isShort ? 'Dispo (Visio)' : 'Disponible',
            clickable: true,
            staffId: Number(staffId),
            lane,
            lanesCount: 2,
            isShort
          });
        }
      }
    }

    // Réservations
    for (const b of bookings) {
      const ds = dayjs(b.start).tz('Europe/Paris');
      if (!ds.isSame(day, 'day')) continue;
      const de = dayjs(b.end).tz('Europe/Paris');
      const sid: any = (b as any).staff_id;
      const lane = staffOrder.indexOf(Number(sid));
      if (lane === -1) continue;

      const isVisio = b.meeting_mode === 'visio';
      const bgColor = isVisio ? '#8ab4f8' : '#1a73e8';

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
        title: isVisio ? '🎥VISIO' : `📍 ${b.zone}`,
        subtitle: b.restaurant_name || b.client_name || '',
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

  function prevWeek() { setWeekStart(weekStart.subtract(7, 'day')); }
  function nextWeek() { setWeekStart(weekStart.add(7, 'day')); }
  function goToday() { setWeekStart(weekStartMonday(dayjs())); }

  if (!mounted) return <div suppressHydrationWarning />;

  return (
    <PinGate>
    <div style={styles.container}>
      {/* Header moderne */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.headerLeft}>
            <div style={styles.logo}>
              <CalendarIcon />
              <span style={styles.logoText}>DigiResa Calendar</span>
            </div>
            
            <div style={styles.dateNavigation}>
              <button onClick={goToday} style={styles.todayButton}>
                Aujourd'hui
              </button>
              <div style={styles.navButtons}>
                <button onClick={prevWeek} style={styles.navButton}>
                  <ChevronLeftIcon />
                </button>
                <button onClick={nextWeek} style={styles.navButton}>
                  <ChevronRightIcon />
                </button>
              </div>
              <h1 style={styles.monthTitle}>
                {weekStart.format('MMMM YYYY')}
              </h1>
            </div>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.staffInfo}>
              {staffs.slice(0, 2).map((staff, index) => (
                <div key={staff.id} style={styles.staffBadge}>
                  <div style={{
                    ...styles.staffAvatar,
                    backgroundColor: index === 0 ? '#1a73e8' : '#34a853'
                  }}>
                    {staff.name.charAt(0).toUpperCase()}
                  </div>
                  <span style={styles.staffName}>{staff.name}</span>
                </div>
              ))}
            </div>
            
           
          </div>
        </div>
      </header>

      {/* Indicateur de chargement */}
      {loading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingProgress}></div>
        </div>
      )}

      {/* Calendrier principal */}
      <main style={styles.main}>
        <div style={styles.calendarWrapper}>
          {/* Légende */}
          <div style={styles.legend}>
            <div style={{display:'flex', alignItems:'center', gap:16}}>
              <div style={styles.legendItem}>
                <div style={{...styles.legendDot, backgroundColor: '#34a853'}}></div>
                <span>Disponible</span>
              </div>
              <div style={styles.legendItem}>
                <div style={{...styles.legendDot, backgroundColor: '#1a73e8'}}></div>
                <span>RDV Physique</span>
              </div>
              <div style={styles.legendItem}>
                <div style={{...styles.legendDot, backgroundColor: '#8ab4f8'}}></div>
                <span>RDV Visio</span>
              </div>
            </div>
          </div>

          {/* Grille du calendrier */}
          <div style={styles.calendarGrid}>
            {/* En-tête des jours */}
            <div style={styles.weekHeader}>
              <div style={styles.timeColumnHeader}>
                <div style={styles.timeColumnTitle}>Horaires</div>
              </div>
              {days.map(day => {
                const isToday = day.isSame(dayjs(), 'day');
                const isWeekend = day.day() === 6; // Seulement samedi maintenant
                
                return (
                  <div key={day.toString()} style={{
                    ...styles.dayHeader,
                    ...(isToday ? styles.dayHeaderToday : {}),
                    ...(isWeekend ? styles.dayHeaderWeekend : {})
                  }}>
                    <div style={styles.dayInfo}>
                      <div style={styles.dayName}>
                        {day.format('ddd').toUpperCase()}
                      </div>
                      <div style={{
                        ...styles.dayNumber,
                        ...(isToday ? styles.dayNumberToday : {})
                      }}>
                        {day.format('D')}
                      </div>
                    </div>
                    
                    <div style={styles.staffColumns}>
                      {staffs.slice(0, 2).map((staff, index) => (
                        <div key={staff.id} style={styles.staffColumn}>
                          <div style={styles.staffInitial}>
                            {staff.name.charAt(0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Corps du calendrier */}
            <div style={styles.calendarBody}>
              {/* Colonne des heures */}
              <div style={styles.timeColumn}>
                {hours.map(hour => (
                  <div key={hour} style={styles.timeSlot}>
                    <span style={styles.timeLabel}>
                      {hour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                ))}
              </div>

              {/* Colonnes des jours */}
              {days.map(day => {
                const events = eventsForDay(day);
                const isWeekend = day.day() === 6; // Seulement samedi
                const now = dayjs().tz('Europe/Paris');
                const showNowLine = day.isSame(now, 'day');
                const nowMinutes = showNowLine ? minutesFromStart(now) : -1;

                return (
                  <div key={day.toString()} style={{
                    ...styles.dayColumn,
                    ...(isWeekend ? styles.dayColumnWeekend : {})
                  }}>
                    {/* Lignes horaires */}
                    {hours.map(hour => (
                      <div key={hour} style={styles.hourLine}></div>
                    ))}

                    {/* Ligne "maintenant" */}
                    {showNowLine && nowMinutes >= 0 && nowMinutes <= (hourEnd - hourStart) * 60 && (
                      <div style={{
                        ...styles.nowLine,
                        top: (nowMinutes / 60) * PX_PER_HOUR
                      }}>
                        <div style={styles.nowDot}></div>
                        <div style={styles.nowLabel}>
                          {now.format('HH:mm')}
                        </div>
                      </div>
                    )}

                    {/* Colonnes staff */}
                    <div style={styles.staffLane}></div>
                    <div style={styles.staffLane}></div>
                    <div style={styles.staffSeparator}></div>

                    {/* Hover time indicator */}
                    {hoverTime && hoverTime.day === day.format('YYYY-MM-DD') && (
                      <div style={{
                        ...styles.hoverTimeIndicator,
                        top: hoverTime.y
                      }}>
                        {hoverTime.time}
                      </div>
                    )}

                    {/* Événements */}
                    {events.map(event => {
                      const top = (event.startMin / 60) * PX_PER_HOUR;
                      const height = Math.max(20, ((event.endMin - event.startMin) / 60) * PX_PER_HOUR);
                      const leftPercent = (event.lane || 0) * 50;
                      const widthPercent = 48; // 50% - 2% margin

                      return (
                        <div
                          key={event.id}
                          style={{
                            ...styles.event,
                            ...(event.kind === 'slot' ? styles.eventSlot : styles.eventBooking),
                            top,
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            height,
                            backgroundColor: event.color,
                            ...(event.isShort ? styles.eventShort : {})
                          }}
                          onMouseMove={event.kind === 'slot' ? (e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const parentRect = e.currentTarget.parentElement!.getBoundingClientRect();
                            const y = e.clientY - parentRect.top;
                            const minutes = Math.max(0, (y / PX_PER_HOUR) * 60);
                            const step = Number(settings?.booking_step_min ?? 15);
                            const snapped = Math.floor(minutes / step) * step;
                            const time = dayjs().hour(hourStart).minute(0).add(snapped, 'minute').format('HH:mm');
                            setHoverTime({ day: day.format('YYYY-MM-DD'), time, y: (snapped / 60) * PX_PER_HOUR });
                          } : undefined}
                          onMouseLeave={event.kind === 'slot' ? () => setHoverTime(null) : undefined}
                          onClick={event.clickable ? (e) => {
                            if (event.kind === 'slot') {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const parentRect = e.currentTarget.parentElement!.getBoundingClientRect();
                              const y = e.clientY - parentRect.top;
                              const minutes = Math.max(0, (y / PX_PER_HOUR) * 60);
                              const step = Number(settings?.booking_step_min ?? 15);
                              const dur = Number(settings?.default_duration_min ?? 30);
                              const snapped = Math.floor(minutes / step) * step;
                              const startTime = day.tz('Europe/Paris').hour(hourStart).minute(0).add(snapped, 'minute');
                              const endTime = startTime.add(dur, 'minute');
                              
                              const slotObj: Slot = {
                                start: startTime.toISOString(),
                                end: endTime.toISOString(),
                                zone: event.zone || '',
                                zone_id: event.zone_id,
                                available_staff_ids: event.staffId ? [event.staffId] : []
                              };
                              setSelectedSlot(slotObj);
                              setModalOpen(true);
                            } else if (event.kind === 'booking') {
                              const bookingId = event.id.replace('bk-', '');
                              const booking = bookings.find(b => String(b.id) === bookingId);
                              if (booking) setOpenBooking(booking);
                            }
                          } : undefined}
                        >
                          <div style={styles.eventContent}>
                            <div style={styles.eventTitle}>{event.title}</div>
                            {event.subtitle && (
                              <div style={styles.eventSubtitle}>{event.subtitle}</div>
                            )}
                            <div style={styles.eventTime}>
                              {dayjs(event.startISO).tz('Europe/Paris').format('HH:mm')} - 
                              {dayjs(event.endISO).tz('Europe/Paris').format('HH:mm')}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
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
        onBooked={async () => {
          await reloadBookings();
          loadWeekData();
          setModalOpen(false);
        }}
      />

      <BookingDetailsModal
        open={!!openBooking}
        onClose={() => setOpenBooking(null)}
        booking={openBooking}
        settings={settings}
        onCanceled={async () => {
          await reloadBookings();
          loadWeekData();
          setOpenBooking(null);
        }}
      />
    </div>
    </PinGate>
  );
}

// Composants d'icônes
function CalendarIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="16" y1="2" x2="16" y2="6"></line>
      <line x1="8" y1="2" x2="8" y2="6"></line>
      <line x1="3" y1="10" x2="21" y2="10"></line>
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15,18 9,12 15,6"></polyline>
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="9,18 15,12 9,6"></polyline>
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );
}

// Styles modernes inspirés de Google Calendar
const styles: any = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#ffffff',
    fontFamily: '"Google Sans", "Roboto", -apple-system, BlinkMacSystemFont, sans-serif',
    color: '#3c4043',
    display: 'flex',
    flexDirection: 'column'
  },

  header: {
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #dadce0',
    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },

  headerContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    maxWidth: '1400px',
    margin: '0 auto',
    width: '100%'
  },

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px'
  },

  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: '#1a73e8'
  },

  logoText: {
    fontSize: '20px',
    fontWeight: 500,
    color: '#3c4043'
  },

  dateNavigation: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },

  todayButton: {
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

  navButtons: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px'
  },

  navButton: {
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

  monthTitle: {
    fontSize: '22px',
    fontWeight: 400,
    color: '#3c4043',
    margin: 0,
    textTransform: 'capitalize'
  },

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px'
  },

  staffInfo: {
    display: 'flex',
    gap: '16px'
  },

  staffBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '20px',
    border: '1px solid #e8eaed'
  },

  staffAvatar: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#ffffff',
    fontSize: '11px',
    fontWeight: 600
  },

  staffName: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#3c4043'
  },

  headerActions: {
    display: 'flex',
    gap: '12px'
  },

  adminButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    textDecoration: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#1557b0'
    }
  },

  loadingBar: {
    height: '3px',
    backgroundColor: '#f1f3f4',
    overflow: 'hidden'
  },

  loadingProgress: {
    height: '100%',
    backgroundColor: '#1a73e8',
    animation: 'loading 2s infinite',
    width: '30%'
  },

  main: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#f8f9fa'
  },

  calendarWrapper: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '1400px',
    margin: '0 auto',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)'
  },

  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    justifyContent: 'space-between',
    padding: '12px 24px',
    backgroundColor: '#f8f9fa',
    borderBottom: '1px solid #e8eaed',
    fontSize: '13px',
    color: '#5f6368'
  },

  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },

  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '2px'
  },

  calendarGrid: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },

  weekHeader: {
    display: 'grid',
    gridTemplateColumns: '120px repeat(6, 1fr)', // 6 jours au lieu de 7
    borderBottom: '1px solid #e8eaed',
    backgroundColor: '#ffffff',
    position: 'sticky',
    top: 0,
    zIndex: 10
  },

  timeColumnHeader: {
    borderRight: '1px solid #e8eaed',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa'
  },

  timeColumnTitle: {
    fontSize: '12px',
    fontWeight: 500,
    color: '#5f6368',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },

  dayHeader: {
    padding: '20px 12px', // Plus de padding
    borderRight: '1px solid #e8eaed',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minHeight: '100px', // Plus haut
    backgroundColor: '#ffffff'
  },

  dayHeaderToday: {
    backgroundColor: '#e8f0fe'
  },

  dayHeaderWeekend: {
    backgroundColor: '#fafbfc'
  },

  dayInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px'
  },

  dayName: {
    fontSize: '13px', // Plus gros
    fontWeight: 500,
    color: '#70757a',
    letterSpacing: '0.8px'
  },

  dayNumber: {
    fontSize: '28px', // Plus gros
    fontWeight: 400,
    color: '#3c4043',
    width: '40px', // Plus grand
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

  staffColumns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4px'
  },

  staffColumn: {
    display: 'flex',
    justifyContent: 'center'
  },

  staffInitial: {
    width: '28px', // Plus grand
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px', // Plus gros
    fontWeight: 600,
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
  },

  calendarBody: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '120px repeat(6, 1fr)', // 6 jours au lieu de 7
    overflow: 'auto'
  },

  timeColumn: {
    borderRight: '1px solid #e8eaed',
    backgroundColor: '#f8f9fa' // Fond légèrement gris
  },

  timeSlot: {
    height: '80px', // Plus haut (correspond au PX_PER_HOUR)
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    paddingRight: '16px', // Plus de padding
    paddingTop: '12px',
    borderBottom: '1px solid #f1f3f4'
  },

  timeLabel: {
    fontSize: '13px', // Plus gros
    color: '#70757a',
    fontWeight: 500
  },

  dayColumn: {
    position: 'relative',
    borderRight: '1px solid #e8eaed',
    backgroundColor: '#ffffff',
    minWidth: '200px' // Plus large
  },

  dayColumnWeekend: {
    backgroundColor: '#fafbfc'
  },

  hourLine: {
    height: '80px', // Plus haut
    borderBottom: '1px solid #f1f3f4'
  },

  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '2px',
    backgroundColor: '#ea4335',
    zIndex: 20,
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

  nowLabel: {
    marginLeft: '8px',
    fontSize: '11px',
    color: '#ea4335',
    fontWeight: 500,
    backgroundColor: '#ffffff',
    padding: '2px 6px',
    borderRadius: '4px',
    border: '1px solid #ea4335'
  },

  staffLane: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '50%',
    pointerEvents: 'none'
  },

  staffSeparator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '50%',
    width: '1px',
    backgroundColor: '#e8eaed',
    zIndex: 1
  },

  hoverTimeIndicator: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    zIndex: 30,
    pointerEvents: 'none'
  },

  event: {
    position: 'absolute',
    borderRadius: '4px',
    padding: '4px 8px', // Plus de padding
    fontSize: '10px', // Plus gros texte
    color: '#ffffff',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    zIndex: 10,
    border: '1px solid rgba(255,255,255,0.2)',
    minHeight: '32px' // Hauteur minimum plus grande
  },

  eventSlot: {
    ':hover': {
      transform: 'scale(1.02)',
      boxShadow: '0 4px 12px 0 rgba(60,64,67,0.4)',
      zIndex: 15
    }
  },

  eventBooking: {
    boxShadow: '0 2px 6px 0 rgba(60,64,67,0.3)',
    ':hover': {
      boxShadow: '0 4px 12px 0 rgba(60,64,67,0.4)',
      zIndex: 15
    }
  },

  eventShort: {
    borderStyle: 'dashed'
  },

  eventContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    height: '100%'
  },

  eventTitle: {
    fontWeight: 600,
    fontSize: '9px', // Plus gros
    lineHeight: '9px'
  },

  eventSubtitle: {
    fontSize: '9px', // Plus gros
    opacity: 0.9,
    lineHeight: '9px'
  },

  eventTime: {
    fontSize: '9px', // Plus gros
    opacity: 0.8,
    lineHeight: '13px',
    marginTop: 'auto'
  }
};

// Modal de détails de réservation
function BookingDetailsModal({ 
  open, 
  onClose, 
  booking, 
  onCanceled,
  settings
}: { 
  open: boolean; 
  onClose: () => void; 
  booking: Booking | null; 
  onCanceled: () => void,
  settings: any
}) {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [staffs, setStaffs] = useState<{id:number;name:string}[]>([]);
  const [startISO, setStartISO] = useState<string>('');
  const [endISO, setEndISO] = useState<string>('');
  const [staffId, setStaffId] = useState<number|undefined>(undefined);
  const [mode, setMode] = useState<'visio'|'physique'|undefined>(undefined);
  
  useEffect(()=>{
    if (open && booking){
      setStartISO(booking.start);
      setEndISO(booking.end);
      setStaffId(booking.staff_id);
      setMode(booking.meeting_mode);
      fetch(`${API}/admin/staff`).then(r=>r.json()).then(a=>{ if(Array.isArray(a)) setStaffs(a); }).catch(()=>{});
    }
  },[open, booking]);
  
  if (!open || !booking) return null;

  async function cancel() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`${API}/book/${booking.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Annulation impossible');
      await onCanceled();
    } catch (e: any) {
      setErr(e.message || 'Erreur');
    } finally {
      setLoading(false);
    }
  }

  function toLocalInput(iso: string) {
    try {
      const d = new Date(iso);
      const pad = (n: number) => ('0' + n).slice(-2);
      const yyyy = d.getFullYear();
      const mm = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const hh = pad(d.getHours());
      const mi = pad(d.getMinutes());
      return yyyy + '-' + mm + '-' + dd + 'T' + hh + ':' + mi;
    } catch { return ''; }
  }

  function fromLocalInput(val: string) {
    if (!val) return '' as any;
    const d = new Date(val);
    const t = d.getTime() - d.getTimezoneOffset() * 60000;
    return new Date(t).toISOString();
  }

  function shift(minutes:number){
    const s = new Date(startISO); const e = new Date(endISO);
    setStartISO(new Date(s.getTime()+minutes*60000).toISOString());
    setEndISO(new Date(e.getTime()+minutes*60000).toISOString());
  }

  async function saveChanges(){
    if (!booking) return;
    setSaving(true); setErr(null);
    try {
      const body:any = {
        slot_start: new Date(startISO).toISOString(),
        slot_end: new Date(endISO).toISOString(),
        zone_name: booking.zone,
        client_name: booking.client_name,
        summary: booking.title || '',
        meeting_mode: mode || booking.meeting_mode || 'physique'
      };
      if (booking.restaurant_name) body.restaurant_name = booking.restaurant_name;
      if (booking.city) body.city = booking.city;
      if (staffId) body.staff_id = staffId;
      const res = await fetch(`${API}/book`,{ method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()}, body: JSON.stringify(body)});
      const data = await res.json().catch(()=>({}));
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Erreur lors de l\'enregistrement');
      // annuler l'ancien
      await fetch(`${API}/book/${booking.id}`, { method:'DELETE' });
      await onCanceled();
      onClose();
    } catch(e:any){ setErr(e.message||'Erreur'); }
    finally { setSaving(false); }
  }

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>Détails du rendez-vous</h2>
          <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
        </div>
        
        <div style={modalStyles.content}>
          <div style={modalStyles.bookingInfo}>
            <div style={modalStyles.infoRow}>
              <span style={modalStyles.infoLabel}>📅 Date et heure</span>
              <span style={modalStyles.infoValue}>
                {new Date(booking.start).toLocaleDateString('fr-FR', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
                <br />
                {new Date(booking.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} - 
                {new Date(booking.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            <div style={modalStyles.infoRow}>
              <span style={modalStyles.infoLabel}>📍 Zone</span>
              <span style={modalStyles.infoValue}>{booking.zone}</span>
            </div>
            
            <div style={modalStyles.infoRow}>
              <span style={modalStyles.infoLabel}>👤 Client</span>
              <span style={modalStyles.infoValue}>{booking.client_name}</span>
            </div>
            
            {booking.restaurant_name && (
              <div style={modalStyles.infoRow}>
                <span style={modalStyles.infoLabel}>🏪 Restaurant</span>
                <span style={modalStyles.infoValue}>{booking.restaurant_name}</span>
              </div>
            )}
            
            {booking.city && (
              <div style={modalStyles.infoRow}>
                <span style={modalStyles.infoLabel}>🌍 Ville</span>
                <span style={modalStyles.infoValue}>{booking.city}</span>
              </div>
            )}
            
            {booking.staff_name && (
              <div style={modalStyles.infoRow}>
                <span style={modalStyles.infoLabel}>👨‍💼 Staff</span>
                <span style={modalStyles.infoValue}>{booking.staff_name}</span>
              </div>
            )}
            
            {booking.meeting_mode && (
              <div style={modalStyles.infoRow}>
                <span style={modalStyles.infoLabel}>💻 Type</span>
                <span style={modalStyles.infoValue}>
                  {booking.meeting_mode === 'visio' ? '🎥 Visioconférence' : '📍 Rendez-vous physique'}
                </span>
              </div>
            )}
            {editMode && (
              <div style={{marginTop:12, display:'grid', gap:8}}>
                <div style={{display:'flex', gap:8, alignItems:'center'}}>
                  <button onClick={()=>shift(-15)} style={modalStyles.secondaryButton}>-15 min</button>
                  <button onClick={()=>shift(15)} style={modalStyles.secondaryButton}>+15 min</button>
                  <span style={{fontSize:12,color:'#6b7280'}}>{new Date(startISO).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} → {new Date(endISO).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</span>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <select value={staffId||0} onChange={e=>setStaffId(Number(e.target.value)||undefined)} style={modalStyles.inputSmall}>
                    <option value={0}>Conseiller (inchangé)</option>
                    {staffs.map(s=>(<option key={s.id} value={s.id}>{s.name}</option>))}
                  </select>
                  <select value={mode||''} onChange={e=>setMode((e.target.value||'') as any)} style={modalStyles.inputSmall}>
                    <option value="">Type (inchangé)</option>
                    <option value="physique" disabled={(new Date(endISO).getTime()-new Date(startISO).getTime())/60000 < Number(settings?.demo_physique_duration_min ?? settings?.default_duration_min ?? 30)}>Physique</option>
                    <option value="visio">Visio</option>
                  </select>
                </div>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8}}>
                  <div>
                    <label style={{fontSize:12,color:'#6b7280'}}>Début</label>
                    <input type="datetime-local" value={toLocalInput(startISO)} onChange={e=>setStartISO(fromLocalInput(e.target.value))} style={modalStyles.inputSmall} />
                  </div>
                  <div>
                    <label style={{fontSize:12,color:'#6b7280'}}>Fin</label>
                    <input type="datetime-local" value={toLocalInput(endISO)} onChange={e=>setEndISO(fromLocalInput(e.target.value))} style={modalStyles.inputSmall} />
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {err && (
            <div style={modalStyles.errorMessage}>❌ {err}</div>
          )}
          
          <div style={modalStyles.actions}>
            <button onClick={onClose} style={modalStyles.cancelButton}>
              Fermer
            </button>
            {!editMode && (
              <button onClick={()=>setEditMode(true)} style={modalStyles.primaryButton}>Modifier</button>
            )}
            {editMode && (
              <button onClick={saveChanges} disabled={saving} style={modalStyles.primaryButton}>{saving?'Enregistrement…':'Enregistrer'}</button>
            )}
            <button 
              onClick={cancel} 
              disabled={loading} 
              style={{
                ...modalStyles.deleteButton,
                ...(loading ? modalStyles.deleteButtonDisabled : {})
              }}
            >
              {loading ? 'Annulation...' : 'Annuler le rendez-vous'}
            </button>
          </div>
        </div>
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
    zIndex: 1000,
    padding: '16px'
  },

  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    boxShadow: '0 24px 38px 3px rgba(0,0,0,0.14), 0 9px 46px 8px rgba(0,0,0,0.12), 0 11px 15px -7px rgba(0,0,0,0.2)',
    maxWidth: '500px',
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
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },

  content: {
    padding: '24px'
  },

  bookingInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    marginBottom: '24px'
  },

  infoRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px'
  },

  infoLabel: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#5f6368',
    minWidth: '120px'
  },

  infoValue: {
    fontSize: '14px',
    color: '#3c4043',
    flex: 1
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
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#f8f9fa'
    }
  },

  deleteButton: {
    padding: '10px 24px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#ea4335',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#d33b2c'
    }
  },

  deleteButtonDisabled: {
    backgroundColor: '#dadce0',
    color: '#9aa0a6',
    cursor: 'not-allowed'
  },
  primaryButton: {
    padding: '10px 24px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#1a73e8',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  secondaryButton: {
    padding: '8px 12px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#3c4043',
    fontSize: '12px',
    cursor: 'pointer'
  },
  inputSmall: {
    padding: '8px 12px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    fontSize: '12px'
  }
};
