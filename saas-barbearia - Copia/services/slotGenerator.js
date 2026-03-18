import { timeToMinutes, minutesToTime } from "./timeUtils.js";

/**
 * workingHours: array de períodos "HH:mm-HH:mm"
 * appointments: array com { start: "HH:mm", end: "HH:mm" } (já ocupados)
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
        const appStart = timeToMinutes(app.start);
        const appEnd = timeToMinutes(app.end);

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



