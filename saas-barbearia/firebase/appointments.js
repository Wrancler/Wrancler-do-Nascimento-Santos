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
 *
 * Retorna no formato que o slotGenerator espera:
 * [{ start: "09:00", end: "10:00" }]
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
 * ✅ USADO PELO COMPROVANTE / ADMIN (PRIVADO)
 * Lê de appointments (com dados do cliente)
 *
 * Busca um agendamento pelo "code" (comprovante).
 * Retorna null se não encontrar.
 */
export async function getAppointmentByCode({ tenantId, code }) {
  const q = query(
    collection(db, "appointments"),
    where("tenantId", "==", tenantId),
    where("code", "==", code),
    limit(1)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}
