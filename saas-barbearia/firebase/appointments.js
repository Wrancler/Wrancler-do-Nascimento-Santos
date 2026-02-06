import {
  collection,
  getDocs,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./config.js";

/**
 * Retorna os agendamentos no formato que o slotGenerator espera:
 * [{ start: "09:00", end: "10:00" }]
 */
export async function getAppointments({ tenantId, professionalId, date }) {
  const q = query(
    collection(db, "appointments"),
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
