import {
  collection,
  doc,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "./config.js";

function makeLockId({ tenantId, professionalId, date, startTime }) {
  return `${tenantId}_${professionalId}_${date}_${startTime}`.replace(/\s+/g, "");
}

/**
 * createAppointment(payload)
 * Espera receber os campos como você já está usando no booking.js:
 * tenantId, professionalId, date, startTime, endTime, serviceName, servicePrice, clientName, clientPhone
 */
export async function createAppointment(payload) {
  const {
    tenantId,
    professionalId,
    date,
    startTime,
    endTime,
    serviceName = "Serviço",
    servicePrice = 0,
    clientName = "Cliente",
    clientPhone = "",
  } = payload;

  const lockId = makeLockId({ tenantId, professionalId, date, startTime });
  const lockRef = doc(db, "slotLocks", lockId);

  const appointmentsCol = collection(db, "appointments");
  const appointmentRef = doc(appointmentsCol); // ID automático

  return runTransaction(db, async (tx) => {
    const lockSnap = await tx.get(lockRef);

    if (lockSnap.exists()) {
      throw new Error("HORARIO_OCUPADO");
    }

    // 1) lock do slot
    tx.set(lockRef, {
      tenantId,
      professionalId,
      date,
      startTime,
      endTime,
      appointmentId: appointmentRef.id,
      createdAt: serverTimestamp(),
    });

    // 2) appointment
    tx.set(appointmentRef, {
      tenantId,
      professionalId,
      date,
      startTime,
      endTime,
      serviceName,
      servicePrice,
      clientName,
      clientPhone,
      status: "confirmed",
      createdAt: serverTimestamp(),
    });

    return { appointmentId: appointmentRef.id, lockId };
  });
}
