import { generateAvailableSlots } from "../services/slotGenerator.js";
import { getAppointments } from "../firebase/appointments.js";
import { createAppointment } from "../firebase/createAppointment.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Multi-tenant / link monetizável
const tenantId = getParam("tenant") || "tenant-demo";
const barberWhatsapp = (getParam("whats") || "5583999126226").replace(/[^\d]/g, "");

// Horários de trabalho (MVP hardcoded — depois vem do Firestore por professional)
const workingHours = ["09:00-12:00", "14:00-18:00"];

// ✅ Regra da barbearia: todos os serviços têm 40 minutos
const SERVICE_DURATION = 40;

// ✅ Serviços completos (com placeholders de preço: 0)
// Você pode preencher preços depois, sem mexer na lógica.
const servicesById = {
  combo_cabelo_barba_sobrancelha: {
    id: "combo_cabelo_barba_sobrancelha",
    name: "COMBO (Cabelo ╉ Barba ╉ Sobrancelhas)",
    price: 0,
    durationMinutes: SERVICE_DURATION
  },
  combo_cabelo_barba: {
    id: "combo_cabelo_barba",
    name: "COMBO (Cabelo ╉ Barba)",
    price: 0,
    durationMinutes: SERVICE_DURATION
  },
  barba: {
    id: "barba",
    name: "Barba",
    price: 0,
    durationMinutes: SERVICE_DURATION
  },
  degrade: {
    id: "degrade",
    name: "Degradê",
    price: 0,
    durationMinutes: SERVICE_DURATION
  },
  corte_simples: {
    id: "corte_simples",
    name: "Corte simples",
    price: 0,
    durationMinutes: SERVICE_DURATION
  },
  platinado: {
    id: "platinado",
    name: "Platinado",
    price: 0,
    durationMinutes: SERVICE_DURATION
  },
  luzes: {
    id: "luzes",
    name: "Luzes",
    price: 0,
    durationMinutes: SERVICE_DURATION
  },
  corte_pigmentacao: {
    id: "corte_pigmentacao",
    name: "Corte ╉ Pigmentação",
    price: 0,
    durationMinutes: SERVICE_DURATION
  }
};

// Estado da seleção
let selectedProfessionalId = null;
let selectedProfessionalName = null;
let selectedServiceId = null;

// Elements (do HTML premium)
const professionalsDiv = document.getElementById("professionals");
const servicesDiv = document.getElementById("services");
const selectedProfessionalText = document.getElementById("selectedProfessionalText");
const selectedServiceText = document.getElementById("selectedServiceText");
const scheduleSection = document.getElementById("scheduleSection");
const subtitle = document.getElementById("subtitle");
const hint = document.getElementById("hint");

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

function setSlotsLoading(text = "Carregando...") {
  slotsDiv.innerHTML = "";
  const p = document.createElement("p");
  p.textContent = text;
  slotsDiv.appendChild(p);
}

function setButtonsDisabled(disabled) {
  const buttons = slotsDiv.querySelectorAll("button");
  buttons.forEach(b => (b.disabled = disabled));
}

function formatPhoneDigits(phone) {
  return (phone || "").replace(/[^\d]/g, "");
}

function updateScheduleLockState() {
  const ready = !!selectedProfessionalId && !!selectedServiceId;

  // ✅ Para o layout premium, usamos aria-disabled
  scheduleSection.setAttribute("aria-disabled", ready ? "false" : "true");

  if (!ready) {
    hint.textContent = "Selecione um barbeiro e um serviço para liberar a agenda.";
    slotsDiv.innerHTML = "";
  } else {
    hint.textContent = "Agora escolha o dia e o horário.";
  }

  subtitle.textContent = ready
    ? `Agendando com ${selectedProfessionalName} • ${servicesById[selectedServiceId].name}`
    : "Escolha o barbeiro e o serviço para liberar a agenda.";
}

function markSelected(container, selector, selectedAttrValue, attrName) {
  const items = container.querySelectorAll(selector);
  items.forEach(el => {
    const val = el.getAttribute(attrName);
    el.classList.toggle("is-selected", val === selectedAttrValue);
  });
}

function preselectFromUrl() {
  const prof = getParam("prof");
  const service = (getParam("service") || "").toLowerCase();

  // barbeiro
  if (prof) {
    const btn = professionalsDiv?.querySelector?.(`[data-prof="${prof}"]`);
    if (btn) {
      selectedProfessionalId = prof;
      selectedProfessionalName = btn.getAttribute("data-prof-name") || prof;
      markSelected(professionalsDiv, "button[data-prof]", selectedProfessionalId, "data-prof");
      selectedProfessionalText.textContent = `Barbeiro selecionado: ${selectedProfessionalName}`;
    }
  }

  // serviço
  if (service && servicesById[service]) {
    selectedServiceId = service;
    markSelected(servicesDiv, "button[data-service]", selectedServiceId, "data-service");
    const s = servicesById[selectedServiceId];
    selectedServiceText.textContent = `Serviço selecionado: ${s.name} • ${s.durationMinutes} min`;
  }

  updateScheduleLockState();
}

// Clique no barbeiro
professionalsDiv.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-prof]");
  if (!btn) return;

  selectedProfessionalId = btn.getAttribute("data-prof");
  selectedProfessionalName = btn.getAttribute("data-prof-name") || selectedProfessionalId;

  markSelected(professionalsDiv, "button[data-prof]", selectedProfessionalId, "data-prof");
  selectedProfessionalText.textContent = `Barbeiro selecionado: ${selectedProfessionalName}`;

  // ao trocar barbeiro, reset slots
  slotsDiv.innerHTML = "";
  updateScheduleLockState();

  if (dateInput.value && selectedServiceId) renderSlots();
});

// Clique no serviço
servicesDiv.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-service]");
  if (!btn) return;

  const serviceId = btn.getAttribute("data-service");
  if (!servicesById[serviceId]) return; // evita mismatch com HTML

  selectedServiceId = serviceId;

  markSelected(servicesDiv, "button[data-service]", selectedServiceId, "data-service");
  const s = servicesById[selectedServiceId];
  selectedServiceText.textContent = `Serviço selecionado: ${s.name} • ${s.durationMinutes} min`;

  // ao trocar serviço, reset slots
  slotsDiv.innerHTML = "";
  updateScheduleLockState();

  if (dateInput.value && selectedProfessionalId) renderSlots();
});

async function renderSlots() {
  const date = dateInput.value;
  if (!date) return;

  if (!selectedProfessionalId || !selectedServiceId) {
    updateScheduleLockState();
    return;
  }

  const service = servicesById[selectedServiceId];

  setSlotsLoading("Carregando...");

  try {
    const appointments = await getAppointments({
      tenantId,
      professionalId: selectedProfessionalId,
      date
    });

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
      btn.type = "button";
      btn.textContent = time;
      btn.onclick = () => handleCreateAppointment(time, date);
      slotsDiv.appendChild(btn);
    });
  } catch (e) {
    console.error(e);
    slotsDiv.textContent = "Erro ao carregar horários. Tente novamente.";
  }
}

async function handleCreateAppointment(time, date) {
  const clientName = clientNameInput.value.trim();
  const clientPhone = clientPhoneInput.value.trim();

  if (!selectedProfessionalId) return alert("Escolha um barbeiro.");
  if (!selectedServiceId) return alert("Escolha um serviço.");

  if (!clientName) return alert("Digite seu nome.");
  if (!clientPhone) return alert("Digite seu WhatsApp.");

  const service = servicesById[selectedServiceId];

  setButtonsDisabled(true);

  const payload = {
    tenantId,
    professionalId: selectedProfessionalId,
    serviceName: service.name,
    servicePrice: service.price,
    date,
    startTime: time,
    endTime: addMinutes(time, service.durationMinutes), // ✅ 40 min fixo
    clientName,
    clientPhone,
    status: "confirmed"
  };

  try {
    await createAppointment(payload);

    const msg =
`Novo agendamento ✂️

Barbeiro: ${selectedProfessionalName}
Cliente: ${clientName}
WhatsApp: ${formatPhoneDigits(clientPhone)}
Serviço: ${service.name}
Data: ${date}
Hora: ${time} (${SERVICE_DURATION} min)`;

    window.open(`https://wa.me/${barberWhatsapp}?text=${encodeURIComponent(msg)}`, "_blank");

    alert("Agendamento confirmado!");
    await renderSlots();
  } catch (e) {
    if (e?.message === "HORARIO_OCUPADO") {
      alert("Esse horário acabou de ser reservado por outra pessoa. Escolha outro.");
    } else {
      alert(e?.message || "Erro ao agendar.");
    }
    await renderSlots();
  } finally {
    setButtonsDisabled(false);
  }
}

// ✅ Pré-seleção via URL (se tiver)
preselectFromUrl();

// Inicial
updateScheduleLockState();
