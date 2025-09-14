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
  const [mergedAvail, setMergedAvail] = useState<Array<{start:string; end:string; staff_id:number}>>([]);
  const [zonesList, setZonesList] = useState<{id:number; name:string; color?:string}[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [staffs, setStaffs] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<any|null>(null);
  const [staffZones, setStaffZones] = useState<StaffZone[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [openBooking, setOpenBooking] = useState<Booking | null>(null);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);

  const staffMap = useMemo(() => Object.fromEntries(staffs.map(s => [s.id, s.name])), [staffs]);

  useEffect(() => { setMounted(true); }, []);

  // Chargements optimisés - tout en une fois
  const loadAllData = async (base = weekStart) => {
    if (loading) return;
    setLoading(true);
    
    try {
      const from = base.startOf('day').toISOString();
      const to = base.add(6, 'day').endOf('day').toISOString();
      const fromDate = base.startOf('day').format('YYYY-MM-DD');
      const toDate = base.add(6, 'day').endOf('day').format('YYYY-MM-DD');

      // Charger tout en parallèle
      const [staffData, settingsData, staffZonesData, zonesData, availData, bookingsData] = await Promise.all([
        fetch(`${API}/admin/staff`).then(r => r.json()).catch(() => []),
        fetch(`${API}/admin/settings`).then(r => r.json()).catch(() => null),
        fetch(`${API}/admin/staff_zones`).then(r => r.json()).catch(() => []),
        fetch(`${API}/admin/zones`).then(r => r.json()).catch(() => []),
        fetch(`${API}/availability?from=${from}&to=${to}&only=merged&_=${Date.now()}`, { cache: 'no-store' }).then(r => r.json()).catch(() => ({merged:[]})),
        fetch(`${API}/admin/bookings?from=${from}&to=${to}`).then(r => r.json()).catch(() => [])
      ]);

      // Mise à jour immédiate de tous les états
      setStaffs(Array.isArray(staffData) ? staffData : []);
      setSettings(settingsData);
      setStaffZones(Array.isArray(staffZonesData) ? staffZonesData : []);
      setZonesList(Array.isArray(zonesData) ? zonesData : []);
      setMergedAvail(Array.isArray(availData.merged) ? availData.merged : []);
      
      if (Array.isArray(bookingsData)) {
        const mappedBookings = bookingsData.map((x: any) => ({
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
        setBookings(mappedBookings);
      }
    } catch (error) {
      console.error('Erreur de chargement:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [weekStart]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => weekStart.add(i, 'day')), [weekStart]);

  const hourStart = 6;
  const hourEnd = 22;
  const hours = useMemo(() => Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i), []);

  function minutesFromStart(d: dayjs.Dayjs) {
    const t = d.tz('Europe/Paris');
    return t.hour() * 60 + t.minute() - hourStart * 60;
  }

  function getAvailabilityForDay(day: dayjs.Dayjs, staffId: number) {
    const dayAvail = mergedAvail.filter(m => 
      Number(m.staff_id) === Number(staffId) && 
      dayjs(m.start).tz('Europe/Paris').isSame(day, 'day')
    );
    
    return dayAvail.map(m => ({
      start: dayjs(m.start).tz('Europe/Paris'),
      end: dayjs(m.end).tz('Europe/Paris')
    })).sort((a, b) => a.start.valueOf() - b.start.valueOf());
  }

  function getBookingsForDay(day: dayjs.Dayjs) {
    return bookings.filter(b => dayjs(b.start).tz('Europe/Paris').isSame(day, 'day'));
  }

  function createSlot(start: dayjs.Dayjs, staffId: number) {
    const duration = Number(settings?.default_duration_min ?? 30);
    const end = start.add(duration, 'minute');
    
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      zone: '',
      available_staff_ids: [staffId]
    };
  }

  function prevWeek() { setWeekStart(weekStart.subtract(7, 'day')); }
  function nextWeek() { setWeekStart(weekStart.add(7, 'day')); }
  function goToday() { setWeekStart(weekStartMonday(dayjs())); }

  if (!mounted) return <div suppressHydrationWarning />;

  return (
    <div style={styles.container}>
      {/* Header ultra-simple */}
      <header style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.logo}>
            <div style={styles.logoIcon}>🗓️</div>
            <h1 style={styles.title}>Mon Calendrier</h1>
          </div>
          
          <div style={styles.navigation}>
            <button onClick={prevWeek} style={styles.navButton}>
              <span style={styles.navArrow}>←</span>
              <span>Semaine précédente</span>
            </button>
            
            <button onClick={goToday} style={styles.todayButton}>
              <span style={styles.todayIcon}>🏠</span>
              <span>Aujourd'hui</span>
            </button>
            
            <button onClick={nextWeek} style={styles.navButton}>
              <span>Semaine suivante</span>
              <span style={styles.navArrow}>→</span>
            </button>
          </div>

          <div style={styles.monthDisplay}>
            {weekStart.format('MMMM YYYY')}
          </div>
        </div>
      </header>

      {/* Indicateur de chargement simple */}
      {loading && (
        <div style={styles.loadingBar}>
          <div style={styles.loadingProgress}></div>
        </div>
      )}

      {/* Calendrier principal */}
      <main style={styles.main}>
        <div style={styles.calendarWrapper}>
          {/* En-têtes des jours - TRÈS SIMPLES */}
          <div style={styles.daysHeader}>
            <div style={styles.timeColumnHeader}></div>
            {days.map(day => {
              const isToday = day.isSame(dayjs(), 'day');
              const isWeekend = day.day() === 0 || day.day() === 6;
              
              return (
                <div key={day.toString()} style={{
                  ...styles.dayHeader,
                  ...(isToday ? styles.dayHeaderToday : {}),
                  ...(isWeekend ? styles.dayHeaderWeekend : {})
                }}>
                  <div style={styles.dayName}>
                    {day.format('dddd')}
                  </div>
                  <div style={styles.dayNumber}>
                    {day.format('D')}
                  </div>
                  {isToday && (
                    <div style={styles.todayBadge}>
                      Aujourd'hui ✨
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Grille du calendrier */}
          <div style={styles.calendarGrid}>
            {/* Colonne des heures */}
            <div style={styles.timeColumn}>
              {hours.map(hour => (
                <div key={hour} style={styles.timeSlot}>
                  <div style={styles.timeLabel}>
                    {hour}h
                  </div>
                </div>
              ))}
            </div>

            {/* Colonnes des jours */}
            {days.map(day => {
              const isWeekend = day.day() === 0 || day.day() === 6;
              const dayBookings = getBookingsForDay(day);
              const now = dayjs().tz('Europe/Paris');
              const showNowLine = day.isSame(now, 'day');
              const nowPosition = showNowLine ? minutesFromStart(now) : -1;

              return (
                <div key={day.toString()} style={{
                  ...styles.dayColumn,
                  ...(isWeekend ? styles.dayColumnWeekend : {})
                }}>
                  {/* Lignes d'heures */}
                  {hours.map(hour => (
                    <div key={hour} style={styles.hourSlot}>
                      {/* Créneaux disponibles pour cette heure */}
                      {(() => {
                        const hourStart = day.tz('Europe/Paris').hour(hour).minute(0);
                        const hourEnd = hourStart.add(1, 'hour');
                        const availableSlots: any[] = [];

                        // Pour chaque staff, vérifier la disponibilité
                        staffs.forEach(staff => {
                          const availability = getAvailabilityForDay(day, staff.id);
                          
                          availability.forEach(avail => {
                            // Si la disponibilité chevauche cette heure
                            if (avail.start.isBefore(hourEnd) && avail.end.isAfter(hourStart)) {
                              // Créer des créneaux de 30 min
                              let slotStart = dayjs.max(avail.start, hourStart);
                              const slotEnd = dayjs.min(avail.end, hourEnd);
                              
                              while (slotStart.add(30, 'minute').isSameOrBefore(slotEnd)) {
                                // Vérifier qu'il n'y a pas de réservation
                                const hasBooking = dayBookings.some(booking => {
                                  const bookingStart = dayjs(booking.start).tz('Europe/Paris');
                                  const bookingEnd = dayjs(booking.end).tz('Europe/Paris');
                                  return bookingStart.isBefore(slotStart.add(30, 'minute')) && 
                                         bookingEnd.isAfter(slotStart);
                                });

                                if (!hasBooking) {
                                  availableSlots.push({
                                    start: slotStart,
                                    staff: staff,
                                    duration: 30
                                  });
                                }
                                
                                slotStart = slotStart.add(30, 'minute');
                              }
                            }
                          });
                        });

                        return (
                          <div style={styles.slotsContainer}>
                            {availableSlots.map((slot, index) => (
                              <button
                                key={`${slot.start.toISOString()}-${slot.staff.id}`}
                                onClick={() => {
                                  const slotObj = createSlot(slot.start, slot.staff.id);
                                  setSelectedSlot(slotObj);
                                  setModalOpen(true);
                                }}
                                style={styles.availableSlot}
                              >
                                <div style={styles.slotTime}>
                                  {slot.start.format('HH:mm')}
                                </div>
                                <div style={styles.slotStaff}>
                                  👤 {slot.staff.name}
                                </div>
                                <div style={styles.slotAction}>
                                  ➕ Réserver
                                </div>
                              </button>
                            ))}
                          </div>
                        );
                      })()}

                      {/* Réservations existantes */}
                      {dayBookings
                        .filter(booking => {
                          const bookingStart = dayjs(booking.start).tz('Europe/Paris');
                          return bookingStart.hour() === hour;
                        })
                        .map(booking => (
                          <div
                            key={booking.id}
                            onClick={() => setOpenBooking(booking)}
                            style={styles.existingBooking}
                          >
                            <div style={styles.bookingTime}>
                              {dayjs(booking.start).tz('Europe/Paris').format('HH:mm')} - 
                              {dayjs(booking.end).tz('Europe/Paris').format('HH:mm')}
                            </div>
                            <div style={styles.bookingTitle}>
                              📅 {booking.client_name}
                            </div>
                            <div style={styles.bookingZone}>
                              📍 {booking.zone}
                            </div>
                          </div>
                        ))
                      }
                    </div>
                  ))}

                  {/* Ligne "maintenant" */}
                  {showNowLine && nowPosition >= 0 && nowPosition <= (hourEnd - hourStart) * 60 && (
                    <div style={{
                      ...styles.nowLine,
                      top: `${(nowPosition / 60) * 120}px`
                    }}>
                      <div style={styles.nowDot}></div>
                      <div style={styles.nowLabel}>Maintenant</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </main>

      {/* Modals */}
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
          await loadAllData();
          setModalOpen(false);
        }}
      />

      <BookingDetailsModal
        open={!!openBooking}
        onClose={() => setOpenBooking(null)}
        booking={openBooking}
        onCanceled={async () => {
          await loadAllData();
          setOpenBooking(null);
        }}
      />
    </div>
  );
}

// Modal de détails de réservation
function BookingDetailsModal({ 
  open, 
  onClose, 
  booking, 
  onCanceled 
}: {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
  onCanceled: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  if (!open || !booking) return null;

  const API = process.env.NEXT_PUBLIC_API_URL as string;

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

  return (
    <div style={modalStyles.backdrop} onClick={onClose}>
      <div style={modalStyles.modal} onClick={e => e.stopPropagation()}>
        <div style={modalStyles.header}>
          <h2 style={modalStyles.title}>📅 Détails du rendez-vous</h2>
          <button onClick={onClose} style={modalStyles.closeBtn}>✕</button>
        </div>
        <div style={modalStyles.content}>
          <div style={modalStyles.infoRow}>
            <span style={modalStyles.infoIcon}>🕐</span>
            <div>
              <div style={modalStyles.infoLabel}>Quand</div>
              <div style={modalStyles.infoValue}>
                {new Date(booking.start).toLocaleDateString('fr-FR', { 
                  weekday: 'long', 
                  day: 'numeric', 
                  month: 'long' 
                })} à {new Date(booking.start).toLocaleTimeString('fr-FR', {
                  hour: '2-digit', 
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>

          <div style={modalStyles.infoRow}>
            <span style={modalStyles.infoIcon}>👤</span>
            <div>
              <div style={modalStyles.infoLabel}>Client</div>
              <div style={modalStyles.infoValue}>{booking.client_name}</div>
            </div>
          </div>

          <div style={modalStyles.infoRow}>
            <span style={modalStyles.infoIcon}>📍</span>
            <div>
              <div style={modalStyles.infoLabel}>Zone</div>
              <div style={modalStyles.infoValue}>{booking.zone}</div>
            </div>
          </div>

          {booking.staff_name && (
            <div style={modalStyles.infoRow}>
              <span style={modalStyles.infoIcon}>👨‍💼</span>
              <div>
                <div style={modalStyles.infoLabel}>Staff</div>
                <div style={modalStyles.infoValue}>{booking.staff_name}</div>
              </div>
            </div>
          )}

          {err && (
            <div style={modalStyles.errorMessage}>
              ❌ {err}
            </div>
          )}

          <div style={modalStyles.actions}>
            <button onClick={onClose} style={modalStyles.closeButton}>
              Fermer
            </button>
            <button 
              onClick={cancel} 
              disabled={loading} 
              style={modalStyles.cancelButton}
            >
              {loading ? '⏳ Annulation...' : '🗑️ Annuler le rendez-vous'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Styles ultra-simples et colorés
const styles: any = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f0f8ff',
    fontFamily: '"Comic Sans MS", "Arial", sans-serif',
    color: '#2c3e50'
  },

  header: {
    backgroundColor: '#ffffff',
    borderBottom: '4px solid #3498db',
    boxShadow: '0 4px 12px rgba(52, 152, 219, 0.2)',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },

  headerContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 30px',
    maxWidth: '1400px',
    margin: '0 auto'
  },

  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  },

  logoIcon: {
    fontSize: '36px',
    animation: 'bounce 2s infinite'
  },

  title: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#3498db',
    margin: 0,
    textShadow: '2px 2px 4px rgba(0,0,0,0.1)'
  },

  navigation: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px'
  },

  navButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '25px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 8px rgba(52, 152, 219, 0.3)',
    ':hover': {
      backgroundColor: '#2980b9',
      transform: 'translateY(-2px)',
      boxShadow: '0 6px 12px rgba(52, 152, 219, 0.4)'
    }
  },

  navArrow: {
    fontSize: '20px',
    fontWeight: 'bold'
  },

  todayButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 20px',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '25px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 8px rgba(231, 76, 60, 0.3)',
    ':hover': {
      backgroundColor: '#c0392b',
      transform: 'translateY(-2px)',
      boxShadow: '0 6px 12px rgba(231, 76, 60, 0.4)'
    }
  },

  todayIcon: {
    fontSize: '20px'
  },

  monthDisplay: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#2c3e50',
    textTransform: 'capitalize',
    padding: '10px 20px',
    backgroundColor: '#ecf0f1',
    borderRadius: '15px',
    border: '3px solid #bdc3c7'
  },

  loadingBar: {
    height: '4px',
    backgroundColor: '#ecf0f1',
    overflow: 'hidden'
  },

  loadingProgress: {
    height: '100%',
    backgroundColor: '#3498db',
    animation: 'loading 1.5s ease-in-out infinite',
    width: '30%'
  },

  main: {
    padding: '20px',
    maxWidth: '1400px',
    margin: '0 auto'
  },

  calendarWrapper: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
    overflow: 'hidden',
    border: '4px solid #3498db'
  },

  daysHeader: {
    display: 'grid',
    gridTemplateColumns: '100px repeat(7, 1fr)',
    backgroundColor: '#3498db',
    color: 'white'
  },

  timeColumnHeader: {
    padding: '20px',
    backgroundColor: '#2980b9'
  },

  dayHeader: {
    padding: '20px 15px',
    textAlign: 'center',
    borderRight: '2px solid #2980b9',
    backgroundColor: '#3498db',
    position: 'relative'
  },

  dayHeaderToday: {
    backgroundColor: '#e74c3c',
    animation: 'pulse 2s infinite'
  },

  dayHeaderWeekend: {
    backgroundColor: '#9b59b6'
  },

  dayName: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '8px',
    textTransform: 'capitalize'
  },

  dayNumber: {
    fontSize: '24px',
    fontWeight: 'bold',
    width: '40px',
    height: '40px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto'
  },

  todayBadge: {
    position: 'absolute',
    bottom: '5px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#f39c12',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 'bold'
  },

  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: '100px repeat(7, 1fr)',
    minHeight: '800px'
  },

  timeColumn: {
    backgroundColor: '#ecf0f1',
    borderRight: '3px solid #bdc3c7'
  },

  timeSlot: {
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottom: '2px solid #bdc3c7'
  },

  timeLabel: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#2c3e50',
    backgroundColor: '#ffffff',
    padding: '8px 12px',
    borderRadius: '15px',
    border: '2px solid #3498db'
  },

  dayColumn: {
    borderRight: '2px solid #ecf0f1',
    backgroundColor: '#ffffff',
    position: 'relative'
  },

  dayColumnWeekend: {
    backgroundColor: '#fdf2e9'
  },

  hourSlot: {
    height: '120px',
    borderBottom: '2px solid #ecf0f1',
    padding: '10px',
    position: 'relative'
  },

  slotsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    height: '100%'
  },

  availableSlot: {
    backgroundColor: '#2ecc71',
    color: 'white',
    border: 'none',
    borderRadius: '15px',
    padding: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 8px rgba(46, 204, 113, 0.3)',
    fontSize: '14px',
    fontWeight: 'bold',
    ':hover': {
      backgroundColor: '#27ae60',
      transform: 'scale(1.05)',
      boxShadow: '0 6px 12px rgba(46, 204, 113, 0.4)'
    }
  },

  slotTime: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '4px'
  },

  slotStaff: {
    fontSize: '12px',
    opacity: 0.9,
    marginBottom: '4px'
  },

  slotAction: {
    fontSize: '12px',
    fontWeight: 'bold'
  },

  existingBooking: {
    backgroundColor: '#e74c3c',
    color: 'white',
    borderRadius: '15px',
    padding: '12px',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 8px rgba(231, 76, 60, 0.3)',
    marginBottom: '8px',
    ':hover': {
      backgroundColor: '#c0392b',
      transform: 'scale(1.02)',
      boxShadow: '0 6px 12px rgba(231, 76, 60, 0.4)'
    }
  },

  bookingTime: {
    fontSize: '14px',
    fontWeight: 'bold',
    marginBottom: '4px'
  },

  bookingTitle: {
    fontSize: '12px',
    marginBottom: '2px'
  },

  bookingZone: {
    fontSize: '11px',
    opacity: 0.9
  },

  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '4px',
    backgroundColor: '#f39c12',
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    borderRadius: '2px'
  },

  nowDot: {
    width: '16px',
    height: '16px',
    backgroundColor: '#f39c12',
    borderRadius: '50%',
    marginLeft: '-8px',
    border: '3px solid white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
  },

  nowLabel: {
    backgroundColor: '#f39c12',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '10px',
    fontSize: '12px',
    fontWeight: 'bold',
    marginLeft: '10px'
  }
};

// Styles pour les modals
const modalStyles: any = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '20px'
  },

  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '20px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    border: '4px solid #3498db'
  },

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '25px 30px',
    backgroundColor: '#3498db',
    color: 'white',
    borderRadius: '16px 16px 0 0'
  },

  title: {
    fontSize: '22px',
    fontWeight: 'bold',
    margin: 0
  },

  closeBtn: {
    width: '40px',
    height: '40px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    transition: 'all 0.3s ease',
    ':hover': {
      backgroundColor: 'rgba(255,255,255,0.3)',
      transform: 'scale(1.1)'
    }
  },

  content: {
    padding: '30px'
  },

  infoRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '15px',
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '15px',
    border: '2px solid #ecf0f1'
  },

  infoIcon: {
    fontSize: '24px',
    minWidth: '30px'
  },

  infoLabel: {
    fontSize: '14px',
    color: '#7f8c8d',
    fontWeight: 'bold',
    marginBottom: '5px'
  },

  infoValue: {
    fontSize: '16px',
    color: '#2c3e50',
    fontWeight: 'bold'
  },

  errorMessage: {
    padding: '15px',
    backgroundColor: '#ffebee',
    color: '#c62828',
    borderRadius: '15px',
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '20px',
    border: '2px solid #ef5350'
  },

  actions: {
    display: 'flex',
    gap: '15px',
    justifyContent: 'flex-end',
    paddingTop: '20px',
    borderTop: '3px solid #ecf0f1'
  },

  closeButton: {
    padding: '12px 24px',
    border: '2px solid #95a5a6',
    borderRadius: '25px',
    backgroundColor: '#ecf0f1',
    color: '#2c3e50',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    ':hover': {
      backgroundColor: '#bdc3c7',
      transform: 'translateY(-2px)'
    }
  },

  cancelButton: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '25px',
    backgroundColor: '#e74c3c',
    color: 'white',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 8px rgba(231, 76, 60, 0.3)',
    ':hover': {
      backgroundColor: '#c0392b',
      transform: 'translateY(-2px)',
      boxShadow: '0 6px 12px rgba(231, 76, 60, 0.4)'
    }
  }
};

// Ajout des animations CSS
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bounce {
      0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-10px); }
      60% { transform: translateY(-5px); }
    }
    
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    
    @keyframes loading {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }
  `;
  document.head.appendChild(style);
}