import {
  doc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./config.js";

// docId seguro: remove ":" do horário
function makeAppointmentId({ tenantId, professionalId, date, startTime }) {
  const safeTime = startTime.replace(":", ""); // "09:00" -> "0900"
  return `${tenantId}__${professionalId}__${date}__${safeTime}`;
}

export async function createAppointment(data) {
  const id = makeAppointmentId(data);
  const ref = doc(db, "appointments", id);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);

    if (snap.exists()) {
      throw new Error("Horário já ocupado.");
    }

    tx.set(ref, {
      ...data,
      createdAt: new Date().toISOString(),
    });
  });

  return id;
}
