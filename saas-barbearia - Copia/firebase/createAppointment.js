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

// Código curto e “bonito” baseado no ID do appointment (não dá conflito)
function makeAppointmentCode({ tenantId, appointmentId }) {
  const prefix = String(tenantId || "AG").trim().slice(0, 2).toUpperCase();
  const short = String(appointmentId || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 5)
    .toUpperCase();
  return `${prefix}-${short}`;
}

/**
 * createAppointment(payload)
 * Espera receber:
 * tenantId, professionalId, date, startTime, endTime,
 * serviceName, servicePrice, clientName, clientPhone
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

  // Privado (admin)
  const appointmentsCol = collection(db, "appointments");
  const appointmentRef = doc(appointmentsCol); // ID automático

  // Público (agenda do booking)
  const appointmentPublicRef = doc(db, "appointmentsPublic", appointmentRef.id);

  // code baseado no ID gerado
  const code = makeAppointmentCode({ tenantId, appointmentId: appointmentRef.id });

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
      appointmentCode: code,
      createdAt: serverTimestamp(),
    });

    // 2) appointment privado (com dados do cliente)
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
      code,
      createdAt: serverTimestamp(),
    });

    // 3) appointment público (SEM dados sensíveis)
    tx.set(appointmentPublicRef, {
      tenantId,
      professionalId,
      date,
      startTime,
      endTime,
      serviceName,
      status: "confirmed",
      appointmentId: appointmentRef.id,
      code,
      createdAt: serverTimestamp(),
    });

    return { appointmentId: appointmentRef.id, lockId, code };
  });
}
