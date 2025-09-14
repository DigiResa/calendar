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
      {/* Header Google Calendar style */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <button style={styles.menuButton}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" fill="currentColor"/>
            </svg>
          </button>
          <div style={styles.logo}>
            <svg width="40" height="40" viewBox="0 0 24 24" style={styles.logoIcon}>
              <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z" fill="#4285f4"/>
            </svg>
            <span style={styles.logoText}>Calendrier</span>
          </div>
        </div>

        <div style={styles.headerCenter}>
          <div style={styles.navigationControls}>
            <button onClick={goToday} style={styles.todayButton}>
              Aujourd'hui
            </button>
            <div style={styles.navButtons}>
              <button onClick={prevWeek} style={styles.navButton}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="currentColor"/>
                </svg>
              </button>
              <button onClick={nextWeek} style={styles.navButton}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" fill="currentColor"/>
                </svg>
              </button>
            </div>
          </div>
          <h1 style={styles.monthTitle}>
            {weekStart.format('MMMM YYYY')}
          </h1>
        </div>

        <div style={styles.headerRight}>
          <button style={styles.viewButton}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" fill="currentColor"/>
            </svg>
            Semaine
          </button>
          <button style={styles.settingsButton}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </header>

      {/* Calendrier principal */}
      <main style={styles.main}>
        <div style={styles.calendarContainer}>
          {/* En-têtes des jours */}
          <div style={styles.weekHeader}>
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
                    {day.format('ddd').toUpperCase()}
                  </div>
                  <div style={{
                    ...styles.dayNumber,
                    ...(isToday ? styles.dayNumberToday : {})
                  }}>
                    {day.format('D')}
                  </div>
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
                    {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : hour === 0 ? '12 AM' : `${hour} AM`}
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
                              <div
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
                                  {slot.staff.name}
                                </div>
                              </div>
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
                        .map(booking => {
                          const bookingStart = dayjs(booking.start).tz('Europe/Paris');
                          const bookingEnd = dayjs(booking.end).tz('Europe/Paris');
                          const duration = bookingEnd.diff(bookingStart, 'minute');
                          const height = Math.max(20, (duration / 60) * 48);
                          
                          return (
                            <div
                              key={booking.id}
                              onClick={() => setOpenBooking(booking)}
                              style={{
                                ...styles.existingBooking,
                                height: `${height}px`,
                                backgroundColor: booking.meeting_mode === 'visio' ? '#1a73e8' : '#137333'
                              }}
                            >
                              <div style={styles.bookingTitle}>
                                {booking.client_name}
                              </div>
                              <div style={styles.bookingTime}>
                                {bookingStart.format('HH:mm')} - {bookingEnd.format('HH:mm')}
                              </div>
                              {booking.zone && (
                                <div style={styles.bookingZone}>
                                  {booking.zone}
                                </div>
                              )}
                            </div>
                          );
                        })
                      }
                    </div>
                  ))}

                  {/* Ligne "maintenant" */}
                  {showNowLine && nowPosition >= 0 && nowPosition <= (hourEnd - hourStart) * 60 && (
                    <div style={{
                      ...styles.nowLine,
                      top: `${(nowPosition / 60) * 48}px`
                    }}>
                      <div style={styles.nowDot}></div>
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
          <h2 style={modalStyles.title}>Détails du rendez-vous</h2>
          <button onClick={onClose} style={modalStyles.closeBtn}>
            <svg width="24" height="24" viewBox="0 0 24 24">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div style={modalStyles.content}>
          <div style={modalStyles.infoSection}>
            <div style={modalStyles.infoRow}>
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

            <div style={modalStyles.infoRow}>
              <div style={modalStyles.infoLabel}>Client</div>
              <div style={modalStyles.infoValue}>{booking.client_name}</div>
            </div>

            <div style={modalStyles.infoRow}>
              <div style={modalStyles.infoLabel}>Zone</div>
              <div style={modalStyles.infoValue}>{booking.zone}</div>
            </div>

            {booking.staff_name && (
              <div style={modalStyles.infoRow}>
                <div style={modalStyles.infoLabel}>Staff</div>
                <div style={modalStyles.infoValue}>{booking.staff_name}</div>
              </div>
            )}
          </div>

          {err && (
            <div style={modalStyles.errorMessage}>
              {err}
            </div>
          )}

          <div style={modalStyles.actions}>
            <button onClick={onClose} style={modalStyles.cancelButton}>
              Fermer
            </button>
            <button 
              onClick={cancel} 
              disabled={loading} 
              style={modalStyles.deleteButton}
            >
              {loading ? 'Suppression...' : 'Supprimer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Styles Google Calendar
const styles: any = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#ffffff',
    fontFamily: '"Google Sans", "Roboto", -apple-system, BlinkMacSystemFont, sans-serif',
    display: 'flex',
    flexDirection: 'column'
  },

  header: {
    height: '64px',
    backgroundColor: '#ffffff',
    borderBottom: '1px solid #dadce0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    position: 'sticky',
    top: 0,
    zIndex: 100
  },

  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },

  menuButton: {
    width: '48px',
    height: '48px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    color: '#5f6368',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },

  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },

  logoIcon: {
    flexShrink: 0
  },

  logoText: {
    fontSize: '22px',
    color: '#5f6368',
    fontWeight: 400
  },

  headerCenter: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px'
  },

  navigationControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },

  todayButton: {
    padding: '0 16px',
    height: '36px',
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
      boxShadow: '0 1px 2px 0 rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)'
    }
  },

  navButtons: {
    display: 'flex',
    alignItems: 'center'
  },

  navButton: {
    width: '36px',
    height: '36px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    color: '#5f6368',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },

  monthTitle: {
    fontSize: '22px',
    color: '#3c4043',
    fontWeight: 400,
    margin: 0
  },

  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },

  viewButton: {
    padding: '0 16px',
    height: '36px',
    border: '1px solid #dadce0',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    color: '#3c4043',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#f8f9fa'
    }
  },

  settingsButton: {
    width: '36px',
    height: '36px',
    border: 'none',
    borderRadius: '50%',
    backgroundColor: 'transparent',
    color: '#5f6368',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },

  main: {
    flex: 1,
    overflow: 'hidden'
  },

  calendarContainer: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column'
  },

  weekHeader: {
    display: 'grid',
    gridTemplateColumns: '56px repeat(7, 1fr)',
    borderBottom: '1px solid #dadce0',
    backgroundColor: '#ffffff'
  },

  timeColumnHeader: {
    borderRight: '1px solid #dadce0'
  },

  dayHeader: {
    padding: '12px 8px',
    textAlign: 'center',
    borderRight: '1px solid #dadce0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px'
  },

  dayHeaderToday: {
    color: '#1a73e8'
  },

  dayHeaderWeekend: {
    backgroundColor: '#f8f9fa'
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
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%'
  },

  dayNumberToday: {
    backgroundColor: '#1a73e8',
    color: '#ffffff'
  },

  calendarGrid: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '56px repeat(7, 1fr)',
    overflow: 'auto'
  },

  timeColumn: {
    borderRight: '1px solid #dadce0',
    backgroundColor: '#ffffff'
  },

  timeSlot: {
    height: '48px',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingTop: '4px',
    borderBottom: '1px solid #f1f3f4'
  },

  timeLabel: {
    fontSize: '10px',
    color: '#70757a',
    fontWeight: 500
  },

  dayColumn: {
    borderRight: '1px solid #dadce0',
    position: 'relative'
  },

  dayColumnWeekend: {
    backgroundColor: '#f8f9fa'
  },

  hourSlot: {
    height: '48px',
    borderBottom: '1px solid #f1f3f4',
    position: 'relative',
    padding: '2px'
  },

  slotsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    height: '100%'
  },

  availableSlot: {
    backgroundColor: '#e8f0fe',
    border: '1px solid #4285f4',
    borderRadius: '4px',
    padding: '4px 6px',
    cursor: 'pointer',
    fontSize: '11px',
    color: '#1a73e8',
    transition: 'all 0.2s ease',
    minHeight: '18px',
    ':hover': {
      backgroundColor: '#d2e3fc',
      boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
    }
  },

  slotTime: {
    fontWeight: 500,
    fontSize: '10px'
  },

  slotStaff: {
    fontSize: '9px',
    opacity: 0.8
  },

  existingBooking: {
    position: 'absolute',
    left: '2px',
    right: '2px',
    borderRadius: '4px',
    padding: '4px 6px',
    cursor: 'pointer',
    fontSize: '11px',
    color: '#ffffff',
    overflow: 'hidden',
    zIndex: 1,
    transition: 'all 0.2s ease',
    ':hover': {
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
    }
  },

  bookingTitle: {
    fontWeight: 500,
    fontSize: '11px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },

  bookingTime: {
    fontSize: '10px',
    opacity: 0.9
  },

  bookingZone: {
    fontSize: '9px',
    opacity: 0.8
  },

  nowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: '2px',
    backgroundColor: '#ea4335',
    zIndex: 10,
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
  }
};

// Styles pour les modals
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
    boxShadow: '0 24px 38px 3px rgba(0,0,0,0.14)',
    maxWidth: '480px',
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
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#f1f3f4'
    }
  },

  content: {
    padding: '24px'
  },

  infoSection: {
    marginBottom: '24px'
  },

  infoRow: {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: '16px'
  },

  infoLabel: {
    fontSize: '14px',
    color: '#5f6368',
    fontWeight: 500,
    minWidth: '80px',
    marginRight: '16px'
  },

  infoValue: {
    fontSize: '14px',
    color: '#3c4043',
    fontWeight: 400
  },

  errorMessage: {
    padding: '12px 16px',
    backgroundColor: '#fce8e6',
    color: '#d93025',
    borderRadius: '4px',
    fontSize: '14px',
    marginBottom: '16px'
  },

  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    paddingTop: '16px',
    borderTop: '1px solid #e8eaed'
  },

  cancelButton: {
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
      backgroundColor: '#f8f9fa'
    }
  },

  deleteButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#d93025',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background-color 0.2s ease',
    ':hover': {
      backgroundColor: '#b52d20'
    }
  }
};