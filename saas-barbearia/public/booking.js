import { generateAvailableSlots } from "../services/slotGenerator.js";
import { getAppointments } from "../firebase/appointments.js";
import { createAppointment } from "../firebase/createAppointment.js";
import { getTenantConfig } from "../firebase/tenants.js"; // Novo import

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "tenant-demo";

// Variáveis que agora vêm do Firebase
let barberWhatsapp = "";
let workingHours = [];
let servicesById = {};

// Função que inicia o sistema buscando os dados do SaaS
async function initTenant() {
  try {
    const config = await getTenantConfig(tenantId);
    
    // 1. Carrega as configurações gerais
    barberWhatsapp = config.whatsapp.replace(/[^\d]/g, "");
    workingHours = config.workingHours;
    
    // ==========================================
    // 2. RENDERIZA OS BARBEIROS DINAMICAMENTE
    // ==========================================
    const professionalsDiv = document.getElementById("professionals");
    professionalsDiv.innerHTML = ""; 

    // Pega o array de profissionais do banco
    const profs = config.professionals || []; 
    
    profs.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "card card--person";
      btn.type = "button";
      btn.setAttribute("data-prof", p.id);
      btn.setAttribute("data-prof-name", p.name);
      
      // Se não tiver imagem no banco, ele tenta achar pelo ID
      const imgCaminho = p.image || `assets/barbers/${p.id}.jpeg`;

      btn.innerHTML = `
        <div class="card__media">
          <img src="${imgCaminho}" alt="${p.name}" loading="lazy">
          <div class="card__fade"></div>
        </div>
        <div class="card__body">
          <div class="card__title">${p.name}</div>
          <div class="card__meta">Toque para selecionar</div>
        </div>
      `;
      professionalsDiv.appendChild(btn);
    });

    // ==========================================
    // 3. RENDERIZA OS SERVIÇOS DINAMICAMENTE
    // ==========================================
    const servicesDiv = document.getElementById("services");
    servicesDiv.innerHTML = ""; 

    config.services.forEach(s => {
      // Salva na memória para o agendamento
      servicesById[s.id] = {
        id: s.id,
        name: s.name,
        price: s.price,
        durationMinutes: s.duration
      };

      const btn = document.createElement("button");
      btn.className = "card card--service";
      btn.type = "button";
      btn.setAttribute("data-service", s.id);
      
      const imgCaminho = s.image || `assets/services/${s.id}.png`;

      btn.innerHTML = `
        <div class="card__media">
          <img src="${imgCaminho}" alt="${s.name}" loading="lazy">
          <div class="card__fade"></div>
        </div>
        <div class="card__body">
          <div class="card__title">${s.name}</div>
          <div class="card__meta">${s.duration} min • R$ ${s.price}</div>
        </div>
      `;
      servicesDiv.appendChild(btn);
    });

    // 4. Executa as validações do seu código original
    preselectFromUrl();
    updateScheduleLockState();

  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados da barbearia. Verifique o link.");
  }
}

// Função para atualizar o Card de Resumo em tempo real
function updateSummaryCard() {
  const summarySection = document.getElementById("summarySection");
  if (!summarySection) return;

  // Verifica se o cliente já clicou no barbeiro E no serviço
  if (selectedProfessionalName && selectedServiceId) {
    summarySection.style.display = "block"; // Faz o card aparecer
    
    // 1. Preenche Profissional
    document.getElementById("summaryProf").textContent = selectedProfessionalName;
    
    // 2. Preenche Serviço e Total
    const servico = servicesById[selectedServiceId];
    if (servico) {
      document.getElementById("summaryService").textContent = servico.name;
      document.getElementById("summaryTotal").textContent = `R$ ${servico.price.toFixed(2).replace('.', ',')}`;
    }

    // 3. Preenche Data e Hora
    const dateInput = document.getElementById("date").value;
    // Tenta achar o botão de horário que estiver com a classe de selecionado no seu HTML
    const selectedSlot = document.querySelector("#slots .slot.selected, #slots .chip.selected"); 
    
    let dateTimeText = "Escolha o dia e horário";
    
    if (dateInput) {
      const dataFormatada = dateInput.split("-").reverse().join("/");
      if (selectedSlot) {
        dateTimeText = `${dataFormatada} às ${selectedSlot.textContent}`;
      } else {
        dateTimeText = `${dataFormatada} (Aguardando horário)`;
      }
    }
    document.getElementById("summaryDateTime").textContent = dateTimeText;
  }
}

// Estado da seleção
let selectedProfessionalId = null;
let selectedProfessionalName = null;
let selectedServiceId = null;

// Dispara a busca no banco assim que o arquivo carrega
initTenant();

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

dateInput.addEventListener("change", () => {
  renderSlots();
  updateSummaryCard(); // Atualiza o resumo quando escolhe o dia
});

// ✅ Scroll helpers
function smoothScrollTo(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function smoothScrollToId(id) {
  smoothScrollTo(document.getElementById(id));
}

// ✅ Foco suave (espera o scroll terminar um pouco)
function focusAfterScroll(inputEl, delayMs = 350) {
  if (!inputEl) return;
  window.setTimeout(() => {
    inputEl.focus({ preventScroll: true });
  }, delayMs);
}

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

  // ✅ Selecionou barbeiro → pula para serviço
  smoothScrollToId("servicesSection");
  
  // ✅ GATILHO ADICIONADO: Atualiza o card de resumo
  updateSummaryCard();
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

  // ✅ Selecionou serviço → rola até Seus dados
  smoothScrollToId("clientSection");

  // ✅ E já coloca o cursor no "Seu nome"
  focusAfterScroll(clientNameInput, 350);
  
  // ✅ GATILHO ADICIONADO: Atualiza o card de resumo
  updateSummaryCard();
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
      // ✅ Selecionou data → rola até Horários disponíveis
      smoothScrollTo(slotsDiv);
      return;
    }

    slots.forEach(time => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = time;
      btn.onclick = () => handleCreateAppointment(time, date);
      slotsDiv.appendChild(btn);
    });

    // ✅ Selecionou data → rola até Horários disponíveis
    smoothScrollTo(slotsDiv);
  } catch (e) {
    console.error(e);
    slotsDiv.textContent = "Erro ao carregar horários. Tente novamente.";
    smoothScrollTo(slotsDiv);
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
    endTime: addMinutes(time, service.durationMinutes),
    clientName,
    clientPhone: formatPhoneDigits(clientPhone),
    status: "confirmed"
  };

  try {
    const result = await createAppointment(payload);
    const code = result?.code;

    // 1. Montamos a mensagem rica para o barbeiro (com emojis e negrito)
    const msg = `✂️ *NOVO AGENDAMENTO* ✂️\n\n` +
                `*Código:* ${code}\n` +
                `*Cliente:* ${clientName}\n` +
                `*Barbeiro:* ${selectedProfessionalName}\n` +
                `*Serviço:* ${service.name}\n` +
                `*Data:* ${date}\n` +
                `*Horário:* ${time}`;

    // 2. Link do WhatsApp
    const whatsappUrl = `https://wa.me/${barberWhatsapp}?text=${encodeURIComponent(msg)}`;
    
    // 3. REDIRECIONAMENTO INSTANTÂNEO
    window.location.replace(whatsappUrl);

  } catch (e) {
    if (e?.message === "HORARIO_OCUPADO") {
      alert("❌ Ops! Esse horário foi preenchido agora pouco. Escolha outro.");
    } else {
      alert("❌ Erro ao agendar: " + e.message);
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