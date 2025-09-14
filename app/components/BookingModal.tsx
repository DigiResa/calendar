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
              {new Date(slot.start).toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div style={modalStyles.timeRange}>
              {new Date(slot.start).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              {' '}–{' '}
              {new Date(slot.end).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            </div>
            {!isVisio && (
              <div style={modalStyles.zoneInfo}>Zone: {zoneName || slot.zone}</div>
            )}
          </div>
        </div>

        {/* Étape 1: choix du type de RDV */}
        {step===1 && (
          <div style={{padding:'24px', display:'grid', gap:16}}>
            <div style={{fontSize:14, color:'#5f6368'}}>Sélectionnez le type de rendez-vous</div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
              <button type="button" onClick={()=>{ setIsVisio(true); setStep(2); }} style={modalStyles.choiceCard}>
                <div style={modalStyles.choiceIcon}>🎥</div>
                <div>
                  <div style={modalStyles.choiceTitle}>RDV en visio</div>
                  <div style={modalStyles.choiceDesc}>Google Meet, pas de zone requise</div>
                </div>
              </button>
              <button type="button" onClick={()=>{ setIsVisio(false); setStep(2); }} style={modalStyles.choiceCard}>
                <div style={modalStyles.choiceIcon}>📍</div>
                <div>
                  <div style={modalStyles.choiceTitle}>RDV physique</div>
                  <div style={modalStyles.choiceDesc}>Nécessite une zone d'intervention</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Étape 2: formulaire complet */}
        {step===2 && (
        <form style={modalStyles.form}>
          <div style={modalStyles.formRow}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Nom du restaurant</label>
              <input type="text" placeholder="Ex: Chez Mario" value={restaurant} onChange={e => setRestaurant(e.target.value)} style={modalStyles.input} />
            </div>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Ville</label>
              <input type="text" placeholder="Ex: Narbonne" value={city} onChange={e => setCity(e.target.value)} style={modalStyles.input} />
            </div>
          </div>

          <div style={modalStyles.formRow}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Nom du client *</label>
              <input type="text" placeholder="Jean Dupont" value={name} onChange={e => setName(e.target.value)} style={modalStyles.input} required />
            </div>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Type de rendez-vous</label>
              <div style={{display:'flex', alignItems:'center', gap:8, fontSize:14}}>
                <span>{isVisio ? 'Visio (Google Meet)' : 'Physique'}</span>
                <button type="button" onClick={()=>setStep(1)} style={modalStyles.smallLinkButton}>Modifier</button>
              </div>
            </div>
          </div>

          <div style={modalStyles.formRow}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Staff</label>
              {(allowedStaffIds && allowedStaffIds.length > 1) ? (
                <select value={staffId ?? 0} onChange={e=> setStaffId(Number(e.target.value)||undefined)} style={modalStyles.select}>
                  <option value={0}>Auto (least-load)</option>
                  {allowedStaffIds.map(id => (
                    <option key={id} value={id}>{staffMap[id] || `Staff ${id}`}</option>
                  ))}
                </select>
              ) : (
                <div style={{fontSize:14, padding:'12px 0'}}>
                  {(() => {
                    const sid = staffId ?? allowedStaffIds?.[0];
                    return sid ? (staffMap[sid] || `Staff ${sid}`) : 'Auto (sera attribué)';
                  })()}
                </div>
              )}
            </div>
            {!isVisio && (
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Zone</label>
                <select value={zoneName} onChange={e=>setZoneName(e.target.value)} style={modalStyles.select}>
                  <option value="" disabled>Choisir une zone</option>
                  {(zoneOptions.length ? zoneOptions : [slot.zone]).map(z => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
                {!zoneName && <div style={{fontSize:12, color:'#9aa0a6', marginTop:6}}>Veuillez choisir une zone</div>}
                {zoneName && allowedStaffIds.length===0 && (
                  <div style={{fontSize:12, color:'#d93025', marginTop:6}}>Aucun staff associé à cette zone pour ce créneau.</div>
                )}
              </div>
            )}
          </div>

          <div style={modalStyles.formRow}>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Email</label>
              <input type="email" placeholder="jean.dupont@email.com" value={email} onChange={e => setEmail(e.target.value)} style={modalStyles.input} />
            </div>
            <div style={modalStyles.formGroup}>
              <label style={modalStyles.label}>Téléphone</label>
              <input type="tel" placeholder="06 12 34 56 78" value={tel} onChange={e => setTel(e.target.value)} style={modalStyles.input} />
            </div>
          </div>

          <div style={modalStyles.formGroup}>
            <label style={modalStyles.label}>Notes</label>
            <textarea placeholder="Informations complémentaires..." value={notes} onChange={e => setNotes(e.target.value)} style={modalStyles.textarea} rows={3} />
          </div>

          <div style={modalStyles.formGroup}>
            <label style={modalStyles.label}>Invités (emails séparés par des virgules)</label>
            <input type="text" placeholder="invite1@email.com, invite2@email.com" value={att} onChange={e => setAtt(e.target.value)} style={modalStyles.input} />
          </div>

          {/* Type de RDV déjà choisi en étape 1 */}

          {ok && (<div style={modalStyles.successMessage}>✅ {ok}</div>)}
          {err && (<div style={modalStyles.errorMessage}>❌ {err}</div>)}

          <div style={modalStyles.actions}>
            <button type="button" onClick={onClose} style={modalStyles.cancelButton}>Annuler</button>
            <button type="button" onClick={book} disabled={!name || loading || (!isVisio && (!zoneName || allowedStaffIds.length===0))} style={{...modalStyles.saveButton, ...((!name || loading || (!isVisio && (!zoneName || allowedStaffIds.length===0))) ? modalStyles.saveButtonDisabled : {})}}>
              {loading ? 'Création en cours...' : 'Créer l\'événement'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}

const modalStyles: any = {
  backdrop: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' },
  modal: { backgroundColor: '#ffffff', borderRadius: '8px', boxShadow: '0 24px 38px 3px rgba(0,0,0,0.14), 0 9px 46px 8px rgba(0,0,0,0.12), 0 11px 15px -7px rgba(0,0,0,0.2)', maxWidth: '600px', width: '100%', maxHeight: '90vh', overflow: 'auto' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 24px 16px', borderBottom: '1px solid #e8eaed' },
  title: { fontSize: '20px', fontWeight: 500, color: '#3c4043', margin: 0 },
  closeBtn: { width: '32px', height: '32px', border: 'none', borderRadius: '50%', backgroundColor: 'transparent', color: '#5f6368', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' },
  timeInfo: { display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 24px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #e8eaed' },
  timeIcon: { fontSize: '24px' },
  timeText: { fontSize: '16px', fontWeight: 500, color: '#3c4043', marginBottom: '4px' },
  timeRange: { fontSize: '14px', color: '#5f6368', marginBottom: '2px' },
  zoneInfo: { fontSize: '14px', color: '#1a73e8', fontWeight: 500 },
  form: { padding: '24px' },
  formGroup: { marginBottom: '20px' },
  formRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' },
  label: { display: 'block', fontSize: '14px', fontWeight: 500, color: '#3c4043', marginBottom: '8px' },
  input: { width: '100%', padding: '12px 16px', border: '1px solid #dadce0', borderRadius: '4px', fontSize: '14px', color: '#3c4043', backgroundColor: '#ffffff', boxSizing: 'border-box' },
  select: { width: '100%', padding: '12px 16px', border: '1px solid #dadce0', borderRadius: '4px', fontSize: '14px', color: '#3c4043', backgroundColor: '#ffffff', boxSizing: 'border-box' } as any,
  textarea: { width: '100%', padding: '12px 16px', border: '1px solid #dadce0', borderRadius: '4px', fontSize: '14px', color: '#3c4043', backgroundColor: '#ffffff', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' },
  successMessage: { padding: '12px 16px', backgroundColor: '#e8f5e8', color: '#137333', borderRadius: '4px', fontSize: '14px', marginBottom: '20px' },
  errorMessage: { padding: '12px 16px', backgroundColor: '#fce8e6', color: '#d93025', borderRadius: '4px', fontSize: '14px', marginBottom: '20px' },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '16px', borderTop: '1px solid #e8eaed' },
  cancelButton: { padding: '10px 24px', border: '1px solid #dadce0', borderRadius: '4px', backgroundColor: '#ffffff', color: '#3c4043', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  saveButton: { padding: '10px 24px', border: 'none', borderRadius: '4px', backgroundColor: '#1a73e8', color: '#ffffff', fontSize: '14px', fontWeight: 500, cursor: 'pointer' },
  saveButtonDisabled: { backgroundColor: '#dadce0', color: '#9aa0a6', cursor: 'not-allowed' }
};

// Extras UI pour l'étape 1
(modalStyles as any).choiceCard = {
  display: 'flex', gap: 12, alignItems: 'center',
  padding: '16px', border: '1px solid #e5e7eb', borderRadius: 8,
  background: '#fff', cursor: 'pointer'
};
(modalStyles as any).choiceIcon = { fontSize: 22 };
(modalStyles as any).choiceTitle = { fontWeight: 600, fontSize: 14, color: '#3c4043' };
(modalStyles as any).choiceDesc = { fontSize: 12, color: '#6b7280' };
(modalStyles as any).smallLinkButton = { border:'none', background:'transparent', color:'#1a73e8', cursor:'pointer', padding:0 };
