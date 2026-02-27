import { generateAvailableSlots } from "../services/slotGenerator.js";
import { getAppointments } from "../firebase/appointments.js";
import { createAppointment } from "../firebase/createAppointment.js";
import { getTenantConfig } from "../firebase/tenants.js";

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

    const profs = config.professionals || []; 
    
    profs.forEach(p => {
      const btn = document.createElement("button");
      btn.className = "card card--person";
      btn.type = "button";
      btn.setAttribute("data-prof", p.id);
      btn.setAttribute("data-prof-name", p.name);
      
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

  if (selectedProfessionalName && selectedServiceId) {
    summarySection.style.display = "block"; 
    
    document.getElementById("summaryProf").textContent = selectedProfessionalName;
    
    const servico = servicesById[selectedServiceId];
    if (servico) {
      document.getElementById("summaryService").textContent = servico.name;
      document.getElementById("summaryTotal").textContent = `R$ ${servico.price.toFixed(2).replace('.', ',')}`;
    }

    const dateInput = document.getElementById("date").value;
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

initTenant();

// Elements
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

// =========================================
// MÁSCARAS E FORMATAÇÕES (NOVO)
// =========================================

// 1. Auto-Maiúscula no Nome
clientNameInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());
});

// 2. Máscara de Telefone (WhatsApp) Automática
clientPhoneInput.addEventListener("input", (e) => {
  let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
  e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
});

// =========================================
// FUNÇÕES DE UTILIDADE E FLUXO
// =========================================

// Scroll helpers
function smoothScrollTo(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}
function smoothScrollToId(id) {
  smoothScrollTo(document.getElementById(id));
}

// Foco suave
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

  if (prof) {
    const btn = professionalsDiv?.querySelector?.(`[data-prof="${prof}"]`);
    if (btn) {
      selectedProfessionalId = prof;
      selectedProfessionalName = btn.getAttribute("data-prof-name") || prof;
      markSelected(professionalsDiv, "button[data-prof]", selectedProfessionalId, "data-prof");
      selectedProfessionalText.textContent = `Barbeiro selecionado: ${selectedProfessionalName}`;
    }
  }

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

  slotsDiv.innerHTML = "";
  updateScheduleLockState();

  if (dateInput.value && selectedServiceId) renderSlots();

  smoothScrollToId("servicesSection");
  updateSummaryCard();
});

// Clique no serviço
servicesDiv.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-service]");
  if (!btn) return;

  const serviceId = btn.getAttribute("data-service");
  if (!servicesById[serviceId]) return;

  selectedServiceId = serviceId;

  markSelected(servicesDiv, "button[data-service]", selectedServiceId, "data-service");
  const s = servicesById[selectedServiceId];
  selectedServiceText.textContent = `Serviço selecionado: ${s.name} • ${s.durationMinutes} min`;

  slotsDiv.innerHTML = "";
  updateScheduleLockState();

  if (dateInput.value && selectedProfessionalId) renderSlots();

  smoothScrollToId("clientSection");
  focusAfterScroll(clientNameInput, 350);
  
  updateSummaryCard();
});

// =========================================
// RENDERIZAÇÃO INTELIGENTE DE HORÁRIOS
// =========================================
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

    let finalSlots = slots;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (date === todayStr) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      finalSlots = slots.filter(time => {
        const [h, m] = time.split(":").map(Number);
        return (h * 60 + m) > currentMinutes;
      });
    }

    slotsDiv.innerHTML = "";

    if (finalSlots.length === 0) {
      slotsDiv.textContent = "Sem horários disponíveis para hoje. Escolha outro dia.";
      smoothScrollTo(slotsDiv);
      return;
    }

    finalSlots.forEach(time => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = time;
      
      btn.onclick = () => {
        const allSlots = slotsDiv.querySelectorAll('button');
        allSlots.forEach(b => b.classList.remove('selected', 'is-selected'));
        
        btn.classList.add('selected', 'is-selected');
        updateSummaryCard();
        
        // Passa o botão clicado para a função colocar o efeito "Agendando..."
        setTimeout(() => handleCreateAppointment(time, date, btn), 300);
      };
      
      slotsDiv.appendChild(btn);
    });

    smoothScrollTo(slotsDiv);
  } catch (e) {
    console.error(e);
    slotsDiv.textContent = "Erro ao carregar horários. Tente novamente.";
    smoothScrollTo(slotsDiv);
  }
}

// Recebe o botão clicado (clickedBtn) para aplicar o visual de "Agendando..."
async function handleCreateAppointment(time, date, clickedBtn) {
  const clientName = clientNameInput.value.trim();
  const clientPhone = clientPhoneInput.value.trim();

  if (!selectedProfessionalId) return alert("Escolha um barbeiro.");
  if (!selectedServiceId) return alert("Escolha um serviço.");
  if (!clientName) return alert("Digite seu nome.");
  
  // Valida se o telefone tem pelo menos 10 números (DDD + 8 dígitos)
  const cleanPhone = formatPhoneDigits(clientPhone);
  if (cleanPhone.length < 10) return alert("Digite um WhatsApp válido com DDD.");

  // Se passou nas verificações de dados, aplica o efeito visual de carregamento!
  if (clickedBtn) {
    clickedBtn.textContent = "Agendando...";
  }
  setButtonsDisabled(true);

  const service = servicesById[selectedServiceId];

  const payload = {
    tenantId,
    professionalId: selectedProfessionalId,
    serviceName: service.name,
    servicePrice: service.price,
    date,
    startTime: time,
    endTime: addMinutes(time, service.durationMinutes),
    clientName,
    clientPhone: cleanPhone,
    status: "confirmed"
  };

  try {
    const result = await createAppointment(payload);
    const code = result?.code;

    const msg = `✂️ *NOVO AGENDAMENTO* ✂️\n\n` +
                `*Código:* ${code}\n` +
                `*Cliente:* ${clientName}\n` +
                `*Barbeiro:* ${selectedProfessionalName}\n` +
                `*Serviço:* ${service.name}\n` +
                `*Data:* ${date}\n` +
                `*Horário:* ${time}`;

    const whatsappUrl = `https://wa.me/${barberWhatsapp}?text=${encodeURIComponent(msg)}`;
    window.location.replace(whatsappUrl);
  // ✅ 2. NOVO: Recarrega a página após 2 segundos (quando ele já estiver no app do Zap)
    setTimeout(() => {
      window.location.reload();
    }, 2000);

  } catch (e) {
    if (e?.message === "HORARIO_OCUPADO") {
      alert("❌ Ops! Esse horário foi preenchido agora pouco. Escolha outro.");
    } else {
      alert("❌ Erro ao agendar: " + e.message);
    }
    // O erro fará os horários recarregarem e removerá o texto "Agendando..."
    await renderSlots();
  } finally {
    setButtonsDisabled(false);
  }
}

preselectFromUrl();
updateScheduleLockState();

// =========================================
// GERA A ROLETA DE DATAS (Próximos 15 dias)
// =========================================
function renderDateCards() {
  const dateSlider = document.getElementById("dateSlider");
  if (!dateSlider) return;
  dateSlider.innerHTML = "";

  const today = new Date();
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  for (let i = 0; i < 15; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    const card = document.createElement("div");
    card.className = "date-card";
    card.innerHTML = `
      <span class="date-card__weekday">${diasSemana[d.getDay()]}</span>
      <span class="date-card__day">${String(d.getDate()).padStart(2, '0')}</span>
      <span class="date-card__month">${meses[d.getMonth()]}</span>
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll(".date-card").forEach(c => c.classList.remove("is-selected"));
      card.classList.add("is-selected");

      const dateInput = document.getElementById("date");
      dateInput.value = isoDate;
      
      renderSlots();
      updateSummaryCard();
    });

    dateSlider.appendChild(card);
  }
}

// Inicia a roleta de datas na tela
renderDateCards();