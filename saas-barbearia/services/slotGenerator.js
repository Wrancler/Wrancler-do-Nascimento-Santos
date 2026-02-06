import { timeToMinutes, minutesToTime } from "./timeUtils.js";

export function generateAvailableSlots(workingHours, appointments, serviceDuration) {
  const slots = [];

  for (const period of workingHours) {
    const [start, end] = period.split("-");
    let current = timeToMinutes(start);
    const endMinutes = timeToMinutes(end);

    while (current + serviceDuration <= endMinutes) {
      const slotStart = current;
      const slotEnd = current + serviceDuration;

      const conflict = appointments.some(app => {
        return (
          slotStart < timeToMinutes(app.end) &&
          slotEnd > timeToMinutes(app.start)
        );
      });

      if (!conflict) {
        slots.push(minutesToTime(slotStart));
      }

      current += serviceDuration;
    }
  }

  return slots;
}



