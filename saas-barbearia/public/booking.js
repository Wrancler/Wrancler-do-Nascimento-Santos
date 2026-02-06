import { generateAvailableSlots } from "../services/slotGenerator.js";
import { getAppointments } from "../firebase/appointments.js";
import { createAppointment } from "../firebase/createAppointment.js";

// MVP hardcoded (depois vira via URL / banco)
const tenantId = "tenant-demo";
const professionalId = "prof-demo";
const barberWhatsapp = "558399912-6226"; // WhatsApp da barbearia (com DDI)

const workingHours = ["09:00-12:00", "14:00-18:00"];
const service = { name: "Corte", price: 30, durationMinutes: 60 };

const dateInput = document.getElementById("date");
const slotsDiv = document.getElementById("slots");
const clientNameInput = document.getElementById("clientName");
const clientPhoneInput = document.getElementById("clientPhone");

dateInput.addEventListener("change", renderSlots);

function addMinutes(time, minutes) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

async function renderSlots() {
  const date = dateInput.value;
  if (!date) return;

  slotsDiv.textContent = "Carregando...";

  const appointments = await getAppointments({ tenantId, professionalId, date });

  const slots = generateAvailableSlots(
    workingHours,
    appointments,
    service.durationMinutes
  );

  slotsDiv.innerHTML = "";

  if (slots.length === 0) {
    slotsDiv.textContent = "Sem horários disponíveis neste dia.";
    return;
  }

  slots.forEach(time => {
    const btn = document.createElement("button");
    btn.textContent = time;
    btn.onclick = () => handleCreateAppointment(time, date);
    slotsDiv.appendChild(btn);
  });
}

async function handleCreateAppointment(time, date) {
  const clientName = clientNameInput.value.trim();
  const clientPhone = clientPhoneInput.value.trim();

  if (!clientName) return alert("Digite seu nome.");
  if (!clientPhone) return alert("Digite seu WhatsApp.");

  const payload = {
    tenantId,
    professionalId,
    serviceName: service.name,
    servicePrice: service.price,
    date,
    startTime: time,
    endTime: addMinutes(time, service.durationMinutes),
    clientName,
    clientPhone,
    status: "confirmed"
  };

  try {
    await createAppointment(payload);

    const msg =
`Novo agendamento ✂️

Cliente: ${clientName}
WhatsApp: ${clientPhone}
Serviço: ${service.name} (R$ ${service.price})
Data: ${date}
Hora: ${time}`;

    window.open(`https://wa.me/${barberWhatsapp}?text=${encodeURIComponent(msg)}`, "_blank");

    alert("Agendamento confirmado!");
    await renderSlots(); // atualiza lista (o horário some)
  } catch (e) {
    alert(e.message || "Erro ao agendar.");
    await renderSlots();
  }
}
