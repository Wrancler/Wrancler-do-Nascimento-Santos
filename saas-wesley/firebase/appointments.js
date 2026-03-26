import {
  collection,
  getDocs,
  query,
  where,
  limit
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./config.js";

/**
 * ✅ USADO PELO BOOKING (PÚBLICO)
 * Lê de appointmentsPublic (sem dados sensíveis)
 */
export async function getAppointments({ tenantId, professionalId, date }) {
  const q = query(
    collection(db, "appointmentsPublic"),
    where("tenantId", "==", tenantId),
    where("professionalId", "==", professionalId),
    where("date", "==", date),
    where("status", "==", "confirmed")
  );

  const snap = await getDocs(q);

  return snap.docs.map(doc => {
    const data = doc.data();
    return {
      start: data.startTime,
      end: data.endTime
    };
  });
}

/**
 * ✅ CORRIGIDO: USADO PELO COMPROVANTE / ADMIN (PRIVADO)
 * Lê de appointments (com dados do cliente)
 */
export async function getAppointmentByCode({ tenantId, code }) {
  const q = query(
    collection(db, "appointmentsPublic"), // <-- A MUDANÇA É SÓ AQUI
    where("tenantId", "==", tenantId),
    where("code", "==", code),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}
