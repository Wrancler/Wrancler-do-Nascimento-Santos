import { timeToMinutes, minutesToTime } from "./timeUtils.js";

/**
 * workingHours: array de períodos "HH:mm-HH:mm"
 * appointments: array com os agendamentos vindos do Firebase
 * serviceDuration: duração do serviço em minutos (ex: 30, 45, 60)
 * stepMinutes: de quanto em quanto tempo pode começar um serviço (ex: 15 ou 30)
 */
export function generateAvailableSlots(
  workingHours,
  appointments,
  serviceDuration,
  stepMinutes = serviceDuration
) {
  const slots = [];

  for (const period of workingHours) {
    const [start, end] = period.split("-");
    let current = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);

    while (current + serviceDuration <= endMinutes) {
      const slotStart = current;
      const slotEnd = current + serviceDuration;

      const conflict = appointments.some(app => {
        // 🔥 CORREÇÃO: Lendo os nomes corretos vindos do Firebase (startTime / endTime)
        const startStr = app.startTime || app.start;
        const endStr = app.endTime || app.end;

        // Proteção: Se não tiver horário válido ou se o agendamento já foi cancelado, ignora (não há conflito)
        if (!startStr || !endStr || app.status === "cancelled") {
          return false;
        }

        const appStart = timeToMinutes(startStr);
        const appEnd = timeToMinutes(endStr);

        // Retorna true se houver choque de horários
        return slotStart < appEnd && slotEnd > appStart;
      });

      if (!conflict) {
        slots.push(minutesToTime(slotStart));
      }

      current += stepMinutes;
    }
  }

  return slots;
}