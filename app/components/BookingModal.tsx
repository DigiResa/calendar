'use client';
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';

type Slot = {
  start: string;
  end: string;
  zone: string;
  zone_id?: number;
  available_staff_ids: number[];
};

type BookingF = { start:string; end:string; meeting_mode?: string; zone_id?: number; zone?: string; staff_id?: number };

export default function BookingModal({
  open, onClose, slot, staffMap, slots, staffZones, zonesList, bookings, settings, onBooked
}: {
  open: boolean;
  onClose: () => void;
  slot: Slot | null;
  staffMap: Record<number, string>;
  slots: Slot[];
  staffZones: { staff_id: number; zone_id: number }[];
  zonesList: { id: number; name: string }[];
  bookings: BookingF[];
  settings: any | null;
  onBooked?: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [tel, setTel] = useState('');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [att, setAtt] = useState('');
  const [staffId, setStaffId] = useState<number | undefined>(undefined);
  const [isVisio, setIsVisio] = useState(false);
  const [restaurant, setRestaurant] = useState('');
  const [city, setCity] = useState('');
  const [zoneName, setZoneName] = useState('');
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<1|2>(1);

  useEffect(() => {
    if (open) {
      setName(''); setEmail(''); setTel(''); setTitle(''); setNotes(''); setAtt('');
      setStaffId((slot?.available_staff_ids?.length === 1) ? slot?.available_staff_ids?.[0] : undefined);
      setIsVisio(false); setRestaurant(''); setCity(''); setOk(null); setErr(null); setLoading(false);
      // Par défaut: aucune zone sélectionnée (l'utilisateur doit choisir)
      setZoneName('');
      setStep(1);
    }
  }, [open, slot]);

  const zoneOptions = useMemo(() => {
    if (!slot) return [] as string[];
    try {
      const sStart = dayjs(slot.start).tz('Europe/Paris');
      const sEnd   = dayjs(slot.end).tz('Europe/Paris');

      // 1) Si un RDV physique chevauche ce créneau exact, verrouille la zone de ce RDV
      const overlapping = (bookings || []).find(b => {
        if (String(b.meeting_mode) !== 'physique') return false;
        const bStart = dayjs(b.start).tz('Europe/Paris');
        const bEnd   = dayjs(b.end).tz('Europe/Paris');
        // chevauchement strict: bStart < sEnd && bEnd > sStart
        return bStart.isBefore(sEnd) && bEnd.isAfter(sStart);
      });
      if (overlapping && (overlapping.zone_id || overlapping.zone)) {
        const name = (overlapping.zone_id ? zonesList.find(z => z.id === overlapping.zone_id)?.name : overlapping.zone) || slot.zone;
        return name ? [name] : [];
      }

      // 2) Sinon, si un RDV physique existe sur la même demi‑journée, verrouille sa zone
      const isMorning = sStart.hour() < 13;
      const halfLocked = (bookings || []).find(b => {
        if (String(b.meeting_mode) !== 'physique') return false;
        const bs = dayjs(b.start).tz('Europe/Paris');
        return bs.isSame(sStart, 'day') && ((bs.hour() < 13) === isMorning);
      });
      if (halfLocked && (halfLocked.zone_id || halfLocked.zone)) {
        const name = (halfLocked.zone_id ? zonesList.find(z => z.id === halfLocked.zone_id)?.name : halfLocked.zone) || slot.zone;
        return name ? [name] : [];
      }
    } catch {}

    // 3) Par défaut, proposer uniquement les zones réellement dispo pour le staff sélectionné
    const sid = staffId || slot.available_staff_ids?.[0];
    const ids = staffZones.filter(x => x.staff_id === sid).map(x => x.zone_id);
    let names = zonesList.filter(z => ids.includes(z.id)).map(z => z.name);
    if (!names.length && slot.zone) names.push(slot.zone);
    // Si on a choisi PHYSIQUE, ne pas proposer la zone "VISIO"
    if (!isVisio) names = names.filter(n => !/visio/i.test(n));
    return names;
  }, [staffId, staffZones, zonesList, slot?.zone, slot?.available_staff_ids, slot, bookings, isVisio]);

  // Staff autorisés pour la zone sélectionnée (UX: éviter l'erreur backend)
  const allowedStaffIds = useMemo(() => {
    if (!slot) return [] as number[];
    // En visio: ne pas restreindre par zone
    if (isVisio) return slot.available_staff_ids || [];
    // Si aucune zone choisie: laisser la liste brute
    if (!zoneName) return slot.available_staff_ids || [];
    const zid = zonesList.find(z => z.name === zoneName)?.id;
    if (!zid) return [] as number[];
    const idsForZone = new Set(staffZones.filter(x => x.zone_id === zid).map(x => x.staff_id));
    return (slot.available_staff_ids || []).filter(id => idsForZone.has(id));
  }, [slot, isVisio, zoneName, zonesList, staffZones]);

  // Si staff sélectionné non autorisé pour la zone, réinitialiser
  useEffect(() => {
    if (!slot) return;
    if (isVisio) return; // pas de restriction
    if (!zoneName) return;
    if (staffId && !allowedStaffIds.includes(staffId)) {
      setStaffId(allowedStaffIds[0]);
    }
  }, [allowedStaffIds, isVisio, zoneName, slot]);

  if (!open || !slot) return null;

  const API = process.env.NEXT_PUBLIC_API_URL as string;

  // Validation côté UI: gaps et capacité
  function preValidate(): string | null {
    if (!slot) return null;
    try {
      const sStart = dayjs(slot.start).tz('Europe/Paris');
      const sEnd = dayjs(slot.end).tz('Europe/Paris');
      const isMorning = sStart.hour() < 13;
      const VISIO_GAP = Number(settings?.demo_visio_min_gap_min ?? settings?.demo_visio_buffer_after_min ?? 15);
      const PHYS_SECOND_GAP = Number(settings?.demo_physique_second_min_gap_min ?? 90);

      const dayBookings = (bookings || []).filter(b => dayjs(b.start).tz('Europe/Paris').isSame(sStart, 'day'));

      if (isVisio) {
        // Si on a un staff determiné, imposer 15 min entre fin précédente et début
        const cids = staffId ? [staffId] : (slot.available_staff_ids?.length ? slot.available_staff_ids : []);
        if (cids.length) {
          const badForAll = cids.every(cid => {
            const endsBefore = dayBookings.filter(b => Number(b.staff_id) === Number(cid)).map(b => dayjs(b.end).tz('Europe/Paris'));
            return endsBefore.some(e => e.isAfter(sStart.subtract(VISIO_GAP, 'minute')) && (e.isBefore(sStart) || e.isSame(sStart)));
          });
          if (badForAll) return `Respectez un délai de ${VISIO_GAP} min après le RDV précédent pour ce staff.`;
        }
        return null;
      }

      // Physique: max 2 par demi-journée + 90 min entre fin du 1er et début du 2nd si on est le 2nd
      const phys = dayBookings.filter(b => String(b.meeting_mode) === 'physique');
      const physHalf = phys.filter(b => (dayjs(b.start).tz('Europe/Paris').hour() < 13) === isMorning)
                           .map(b => ({ s: dayjs(b.start).tz('Europe/Paris'), e: dayjs(b.end).tz('Europe/Paris') }))
                           .sort((a,b)=> a.s.valueOf()-b.s.valueOf());
      if (physHalf.length >= 2) return 'Capacité atteinte: 2 RDV physiques max par demi‑journée.';
      if (physHalf.length === 1) {
        const first = physHalf[0];
        // Si le nouveau RDV commence après le 1er, imposer 90 min d'écart
        if (sStart.isAfter(first.e)) {
          const gap = sStart.diff(first.e, 'minute');
          if (gap < PHYS_SECOND_GAP) return `Écart insuffisant entre RDV physiques: ${gap} min (< ${PHYS_SECOND_GAP} min).`;
        }
      }
      return null;
    } catch { return null; }
  }

  async function book() {
    setLoading(true); setOk(null); setErr(null);
    try {
      const v = preValidate();
      if (v) { setErr(v); setLoading(false); return; }
      const localStart = dayjs(slot.start).tz('Europe/Paris').format();
      const localEnd = dayjs(slot.end).tz('Europe/Paris').format();
      const rawInv = att.split(',').map(s => s.trim()).filter(Boolean);
      const emails = [ ...(email ? [email] : []), ...rawInv ];
      const seen = new Set<string>();
      const attendees = emails.filter(e => { const k = e.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });

      const visioDefaultZone = zonesList.find(z=>/visio/i.test(z.name))?.name || slot.zone || zonesList[0]?.name || '';
      const payloadZoneName = isVisio ? visioDefaultZone : zoneName;

      const body: any = {
        slot_start: localStart, slot_end: localEnd, zone_name: payloadZoneName,
        client_name: name, client_email: email, client_phone: tel,
        summary: `DÉMO DIGIRESA (${name||''})`, notes,
        attendees,
      };
      body.meeting_mode = isVisio ? 'visio' : 'physique';
      if (restaurant) body.restaurant_name = restaurant;
      if (city) body.city = city;
      if (staffId) body.staff_id = staffId;
      const res = await fetch(`${API}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.detail || data?.error || 'Erreur');
      const meet = data?.meet_link ? ` · Lien Meet: ${data.meet_link}` : '';
      setOk(`Réservation confirmée ! ${staffMap[data.staff_id] || `Staff ${data.staff_id}`}${meet}`);
      try { onBooked && onBooked(); } catch {}
    } catch (e: any) {
      setErr(e.message || 'Erreur lors de la réservation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>🎉 Nouvelle réservation</h2>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.timeInfo}>
          <div style={styles.timeIcon}>🕐</div>
          <div>
            <div style={styles.timeText}>
              {new Date(slot.start).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div style={styles.timeRange}>
              {new Date(slot.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              {' '}–{' '}
              {new Date(slot.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {!isVisio && (
              <div style={styles.zoneInfo}>📍 Zone: {zoneName || slot.zone}</div>
            )}
          </div>
        </div>

        {/* Étape 1: choix du type de RDV */}
        {step===1 && (
          <div style={styles.content}>
            <div style={styles.stepTitle}>Quel type de rendez-vous ? 🤔</div>
            <div style={styles.choicesContainer}>
              <button type="button" onClick={()=>{ setIsVisio(true); setStep(2); }} style={styles.choiceCard}>
                <div style={styles.choiceIcon}>🎥</div>
                <div>
                  <div style={styles.choiceTitle}>RDV en visio</div>
                  <div style={styles.choiceDesc}>Par internet avec Google Meet</div>
                </div>
              </button>
              <button type="button" onClick={()=>{ setIsVisio(false); setStep(2); }} style={styles.choiceCard}>
                <div style={styles.choiceIcon}>📍</div>
                <div>
                  <div style={styles.choiceTitle}>RDV en personne</div>
                  <div style={styles.choiceDesc}>Dans un lieu physique</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Étape 2: formulaire complet */}
        {step===2 && (
        <form style={styles.form}>
          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>🍽️ Nom du restaurant</label>
              <input type="text" placeholder="Ex: Chez Mario" value={restaurant} onChange={e => setRestaurant(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>🏙️ Ville</label>
              <input type="text" placeholder="Ex: Narbonne" value={city} onChange={e => setCity(e.target.value)} style={styles.input} />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>👤 Nom du client *</label>
              <input type="text" placeholder="Jean Dupont" value={name} onChange={e => setName(e.target.value)} style={styles.input} required />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>📅 Type de rendez-vous</label>
              <div style={styles.typeDisplay}>
                <span>{isVisio ? 'Visio (Google Meet)' : 'Physique'}</span>
                <button type="button" onClick={()=>setStep(1)} style={styles.changeButton}>Changer</button>
              </div>
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>👨‍💼 Staff</label>
              {(allowedStaffIds && allowedStaffIds.length > 1) ? (
                <select value={staffId ?? 0} onChange={e=> setStaffId(Number(e.target.value)||undefined)} style={styles.select}>
                  <option value={0}>Auto (least-load)</option>
                  {allowedStaffIds.map(id => (
                    <option key={id} value={id}>{staffMap[id] || `Staff ${id}`}</option>
                  ))}
                </select>
              ) : (
                <div style={styles.staffDisplay}>
                  {(() => {
                    const sid = staffId ?? allowedStaffIds?.[0];
                    return sid ? (staffMap[sid] || `Staff ${sid}`) : 'Auto (sera attribué)';
                  })()}
                </div>
              )}
            </div>
            {!isVisio && (
              <div style={styles.formGroup}>
                <label style={styles.label}>📍 Zone</label>
                <select value={zoneName} onChange={e=>setZoneName(e.target.value)} style={styles.select}>
                  <option value="" disabled>Choisir une zone</option>
                  {(zoneOptions.length ? zoneOptions : [slot.zone]).map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
                {!zoneName && <div style={styles.helpText}>Veuillez choisir une zone</div>}
                {zoneName && allowedStaffIds.length===0 && (
                  <div style={styles.errorText}>Aucun staff associé à cette zone pour ce créneau.</div>
                )}
              </div>
            )}
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>📧 Email</label>
              <input type="email" placeholder="jean.dupont@email.com" value={email} onChange={e => setEmail(e.target.value)} style={styles.input} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>📞 Téléphone</label>
              <input type="tel" placeholder="06 12 34 56 78" value={tel} onChange={e => setTel(e.target.value)} style={styles.input} />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>📝 Notes</label>
            <textarea placeholder="Informations complémentaires..." value={notes} onChange={e => setNotes(e.target.value)} style={styles.textarea} rows={3} />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>👥 Invités (emails séparés par des virgules)</label>
            <input type="text" placeholder="invite1@email.com, invite2@email.com" value={att} onChange={e => setAtt(e.target.value)} style={styles.input} />
          </div>

          {ok && (<div style={styles.successMessage}>🎉 {ok}</div>)}
          {err && (<div style={styles.errorMessage}>❌ {err}</div>)}

          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>❌ Annuler</button>
            <button type="button" onClick={book} disabled={!name || loading || (!isVisio && (!zoneName || allowedStaffIds.length===0))} style={{...styles.saveButton, ...((!name || loading || (!isVisio && (!zoneName || allowedStaffIds.length===0))) ? styles.saveButtonDisabled : {})}}>
              {loading ? '⏳ Création en cours...' : '✅ Créer le rendez-vous'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

const styles: any = {
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
    maxWidth: '600px',
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
    fontSize: '24px',
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
    transition: 'all 0.3s ease'
  },

  timeInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    padding: '25px 30px',
    backgroundColor: '#ecf0f1',
    borderBottom: '3px solid #bdc3c7'
  },

  timeIcon: {
    fontSize: '32px'
  },

  timeText: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '8px'
  },

  timeRange: {
    fontSize: '16px',
    color: '#7f8c8d',
    fontWeight: 'bold',
    marginBottom: '4px'
  },

  zoneInfo: {
    fontSize: '16px',
    color: '#3498db',
    fontWeight: 'bold'
  },

  content: {
    padding: '30px'
  },

  stepTitle: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '20px',
    textAlign: 'center'
  },

  choicesContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px'
  },

  choiceCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '15px',
    padding: '25px',
    border: '3px solid #3498db',
    borderRadius: '20px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    fontSize: '16px',
    fontWeight: 'bold',
    ':hover': {
      backgroundColor: '#3498db',
      color: 'white',
      transform: 'scale(1.05)'
    }
  },

  choiceIcon: {
    fontSize: '48px'
  },

  choiceTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    textAlign: 'center'
  },

  choiceDesc: {
    fontSize: '14px',
    textAlign: 'center',
    opacity: 0.8
  },

  form: {
    padding: '30px'
  },

  formGroup: {
    marginBottom: '25px'
  },

  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '25px'
  },

  label: {
    display: 'block',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: '10px'
  },

  input: {
    width: '100%',
    padding: '15px 20px',
    border: '3px solid #bdc3c7',
    borderRadius: '15px',
    fontSize: '16px',
    color: '#2c3e50',
    backgroundColor: '#ffffff',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease',
    ':focus': {
      borderColor: '#3498db',
      outline: 'none',
      boxShadow: '0 0 10px rgba(52, 152, 219, 0.3)'
    }
  },

  select: {
    width: '100%',
    padding: '15px 20px',
    border: '3px solid #bdc3c7',
    borderRadius: '15px',
    fontSize: '16px',
    color: '#2c3e50',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    boxSizing: 'border-box'
  },

  textarea: {
    width: '100%',
    padding: '15px 20px',
    border: '3px solid #bdc3c7',
    borderRadius: '15px',
    fontSize: '16px',
    color: '#2c3e50',
    backgroundColor: '#ffffff',
    resize: 'vertical',
    fontFamily: '"Comic Sans MS", "Arial", sans-serif',
    boxSizing: 'border-box'
  },

  typeDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    padding: '15px 20px',
    backgroundColor: '#ecf0f1',
    borderRadius: '15px',
    border: '3px solid #bdc3c7',
    fontSize: '16px',
    fontWeight: 'bold'
  },

  changeButton: {
    padding: '8px 15px',
    border: 'none',
    borderRadius: '15px',
    backgroundColor: '#3498db',
    color: 'white',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },

  staffDisplay: {
    padding: '15px 20px',
    backgroundColor: '#ecf0f1',
    borderRadius: '15px',
    border: '3px solid #bdc3c7',
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#2c3e50'
  },

  helpText: {
    fontSize: '14px',
    color: '#7f8c8d',
    marginTop: '8px',
    fontWeight: 'bold'
  },

  errorText: {
    fontSize: '14px',
    color: '#e74c3c',
    marginTop: '8px',
    fontWeight: 'bold'
  },

  successMessage: {
    padding: '20px',
    backgroundColor: '#d5f4e6',
    color: '#27ae60',
    borderRadius: '15px',
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '25px',
    border: '3px solid #2ecc71',
    textAlign: 'center'
  },

  errorMessage: {
    padding: '20px',
    backgroundColor: '#ffebee',
    color: '#e74c3c',
    borderRadius: '15px',
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '25px',
    border: '3px solid #e74c3c',
    textAlign: 'center'
  },

  actions: {
    display: 'flex',
    gap: '20px',
    justifyContent: 'center',
    paddingTop: '25px',
    borderTop: '3px solid #ecf0f1'
  },

  cancelButton: {
    padding: '15px 30px',
    border: '3px solid #95a5a6',
    borderRadius: '25px',
    backgroundColor: '#ecf0f1',
    color: '#2c3e50',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease'
  },

  saveButton: {
    padding: '15px 30px',
    border: 'none',
    borderRadius: '25px',
    backgroundColor: '#2ecc71',
    color: 'white',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 8px rgba(46, 204, 113, 0.3)'
  },

  saveButtonDisabled: {
    backgroundColor: '#bdc3c7',
    color: '#7f8c8d',
    cursor: 'not-allowed',
    boxShadow: 'none'
  }
};

