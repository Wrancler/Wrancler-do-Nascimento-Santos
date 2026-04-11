import { generateAvailableSlots } from "../services/slotGenerator.js";
import { getAppointments } from "../firebase/appointments.js";
import { createAppointment } from "../firebase/createAppointment.js";
import { getTenantConfig } from "../firebase/tenants.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "biel-do-corte";

let barberWhatsapp = "";
let workingHours = [];
let servicesById = {};

// Estado da seleção
let selectedProfessionalId = null;
let selectedProfessionalName = null;
let selectedServiceId = null;
let selectedTime = null; // 🔥 NOVA VARIÁVEL: Guarda a hora na memória antes de agendar

async function initTenant() {
  try {
    const config = await getTenantConfig(tenantId);
    
    barberWhatsapp = config.whatsapp.replace(/[^\d]/g, "");
    workingHours = config.workingHours;

    // Ajuste dinâmico do Logo (WN Systems Lab)
    const brandLogo = document.querySelector(".brand__mark img");
    if (brandLogo && config.logo) {
      brandLogo.src = config.logo;
    }
    
    const professionalsDiv = document.getElementById("professionals");
    const professionalsSection = document.getElementById("professionalsSection"); 
    professionalsDiv.innerHTML = ""; 

    // 🔥 CORREÇÃO: A variável que estava faltando foi restaurada aqui!
    const profs = config.professionals || []; 
    
    // 🔥 LÓGICA DO LOBO SOLITÁRIO RECUPERADA
    if (profs.length === 1) {
      const p = profs[0];
      selectedProfessionalId = p.id;
      selectedProfessionalName = p.name;
      
      if (professionalsSection) {
        professionalsSection.style.display = "none";
      } else {
        professionalsDiv.style.display = "none";
      }

      const headerLobo = document.createElement("div");
      headerLobo.style = "display: flex; align-items: center; gap: 24px; background: #161616; padding: 32px; border-radius: 24px; border: 1px solid #e0b976; margin-bottom: 32px; box-shadow: 0 6px 20px rgba(0,0,0,0.4);";
      
      const imgCaminho = p.image || `assets/barbers/${p.id}.jpeg`;
      
      headerLobo.innerHTML = `
        <img src="${imgCaminho}" alt="${p.name}" style="width: 110px; height: 110px; border-radius: 50%; object-fit: cover; border: 4px solid #e0b976; box-shadow: 0 0 15px rgba(224, 185, 118, 0.3);">
        <div>
          <h2 style="margin: 0; color: #fff; font-size: 28px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">${p.name}</h2>
          <p style="margin: 8px 0 0 0; color: #bbb; font-size: 16px; font-weight: 400; line-height: 1.4;">Seu especialista dedicado e pronto<br>para te atender.</p>
        </div>
      `;
      
      const servicesSection = document.getElementById("servicesSection") || document.getElementById("services").parentElement;
      servicesSection.parentNode.insertBefore(headerLobo, servicesSection);

    } else {
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
    }

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
          <div class="card__meta">${s.duration} min</div>
        </div>
      `;
      servicesDiv.appendChild(btn);
    });

    preselectFromUrl();
    updateScheduleLockState();

    // 🔥 O TOQUE PREMIUM: Revela a tela inteira de uma vez, sem piscar nada
    const appBody = document.getElementById("appBody");
    if (appBody) {
      appBody.style.opacity = "1";
    }

  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados da barbearia. Verifique o link.");
  }
}

function updateSummaryCard() {
  const summarySection = document.getElementById("summarySection");
  if (!summarySection) return;

  if (selectedProfessionalName && selectedServiceId) {
    summarySection.style.display = "block"; 
    
    document.getElementById("summaryProf").textContent = selectedProfessionalName;
    
    const servico = servicesById[selectedServiceId];
    if (servico) {
      document.getElementById("summaryService").textContent = servico.name;
      document.getElementById("summaryTotal").textContent = ""; 
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

initTenant();

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

clientNameInput.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/(^\w{1})|(\s+\w{1})/g, letter => letter.toUpperCase());
});

clientPhoneInput.addEventListener("input", (e) => {
  let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
  e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
});

function smoothScrollTo(el, blockPos = "start") {
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: blockPos });
}

function smoothScrollToId(id, blockPos = "start") {
  smoothScrollTo(document.getElementById(id), blockPos);
}

clientNameInput.addEventListener("focus", () => {
  setTimeout(() => smoothScrollTo(clientNameInput, "center"), 300);
});

clientPhoneInput.addEventListener("focus", () => {
  setTimeout(() => smoothScrollTo(clientPhoneInput, "center"), 300);
});

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

professionalsDiv.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-prof]");
  if (!btn) return;

  selectedProfessionalId = btn.getAttribute("data-prof");
  selectedProfessionalName = btn.getAttribute("data-prof-name") || selectedProfessionalId;

  markSelected(professionalsDiv, "button[data-prof]", selectedProfessionalId, "data-prof");
  selectedProfessionalText.textContent = `Barbeiro selecionado: ${selectedProfessionalName}`;

  selectedTime = null; 
  slotsDiv.innerHTML = "";
  updateScheduleLockState();

  if (dateInput.value && selectedServiceId) renderSlots();

  smoothScrollToId("servicesSection", "start");
  updateSummaryCard();
});

servicesDiv.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-service]");
  if (!btn) return;

  const serviceId = btn.getAttribute("data-service");
  if (!servicesById[serviceId]) return;

  selectedServiceId = serviceId;

  markSelected(servicesDiv, "button[data-service]", selectedServiceId, "data-service");
  const s = servicesById[selectedServiceId];
  selectedServiceText.textContent = `Serviço selecionado: ${s.name} • ${s.durationMinutes} min`;

  selectedTime = null; 
  slotsDiv.innerHTML = "";
  updateScheduleLockState();

  if (dateInput.value && selectedProfessionalId) renderSlots();

  smoothScrollToId("clientSection", "start");
  
  updateSummaryCard();
});

async function renderSlots() {
  const date = dateInput.value;
  selectedTime = null; 
  
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
      smoothScrollTo(slotsDiv, "center");
      return;
    }

    finalSlots.forEach(time => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot";
      btn.textContent = time;
      
      // 🔥 A MÁGICA ACONTECE AQUI
      btn.onclick = () => {
        const allSlots = slotsDiv.querySelectorAll('button');
        allSlots.forEach(b => b.classList.remove('selected', 'is-selected'));
        
        btn.classList.add('selected', 'is-selected');
        
        selectedTime = time; // Guarda a hora na memória
        updateSummaryCard();
        
        // Rola suavemente para o botão de confirmar
        setTimeout(() => smoothScrollToId("summarySection", "start"), 100);
      };
      
      slotsDiv.appendChild(btn);
    });

    smoothScrollTo(slotsDiv, "center");
  } catch (e) {
    console.error(e);
    slotsDiv.textContent = "Erro ao carregar horários. Tente novamente.";
    smoothScrollTo(slotsDiv, "center");
  }
}

// 🔥 NOVO GATILHO: Dispara o agendamento através do botão final
const btnConfirmBooking = document.getElementById("btnConfirmBooking");
if (btnConfirmBooking) {
  btnConfirmBooking.addEventListener("click", () => {
    if (!selectedTime) {
      alert("Por favor, selecione um horário primeiro.");
      smoothScrollToId("scheduleSection", "start");
      return;
    }
    handleCreateAppointment(selectedTime, dateInput.value, btnConfirmBooking);
  });
}

async function handleCreateAppointment(time, date, clickedBtn) {
  const clientName = clientNameInput.value.trim();
  const clientPhone = clientPhoneInput.value.trim();

  if (!selectedProfessionalId) return alert("Escolha um barbeiro.");
  if (!selectedServiceId) return alert("Escolha um serviço.");
  if (!clientName) return alert("Digite seu nome.");
  
  const cleanPhone = formatPhoneDigits(clientPhone);
  if (cleanPhone.length < 10) return alert("Digite um WhatsApp válido com DDD.");

  if (clickedBtn) {
    clickedBtn.textContent = "AGENDANDO...";
    clickedBtn.disabled = true;
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

    const dataFormatada = date.split("-").reverse().join("/");

    const currentUrl = new URL(window.location.href);
    const baseUrl = currentUrl.origin + currentUrl.pathname.replace('booking.html', '');
    const linkCancelamento = `${baseUrl}cancelar.html?id=${code}`;

    const msg = `- * * * 📅 MEU AGENDAMENTO * * * *\n` +
                `👥 CLIENTE: *${clientName} *\n` +
                `📞 TELEFONE: ${cleanPhone}\n` +
                `=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=\n` +
                `📌 DIA ${dataFormatada}\n` +
                `⌚ HORÁRIO ${time}\n\n` +
                `💇‍♂️ PROFISSIONAL\n` +
                `${selectedProfessionalName}\n\n` +
                `✂️ SERVIÇO\n` +
                `${service.name}\n\n` +
                `Olá seu horário foi agendado com sucesso 👍\n` +
                `=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=\n\n` +
                `CASO DESEJE CANCELAR O AGENDAMENTO:\n` +
                `❌ Acesse o link abaixo para cancelar na hora:\n` +
                `${linkCancelamento}\n\n` +
                `COMPROVANTE DE AGENDAMENTO`;

    const config = await getTenantConfig(tenantId);
    const barbeiroEscolhido = config.professionals.find(p => p.id === selectedProfessionalId);
    let telefoneDestino = barberWhatsapp; 
    
    if (barbeiroEscolhido && barbeiroEscolhido.phone) {
      telefoneDestino = barbeiroEscolhido.phone.replace(/[^\d]/g, ""); 
    }

    const whatsappUrl = `https://api.whatsapp.com/send?phone=${telefoneDestino}&text=${encodeURIComponent(msg)}`;
    
    window.location.replace(whatsappUrl);

    setTimeout(() => {
      window.location.reload();
    }, 2000);

  } catch (e) {
    if (e?.message === "HORARIO_OCUPADO") {
      alert("❌ Ops! Esse horário foi preenchido agora pouco. Escolha outro.");
    } else {
      alert("❌ Erro ao agendar: " + e.message);
    }
    await renderSlots(); 
    if (clickedBtn) {
      clickedBtn.textContent = "Confirmar e Agendar";
      clickedBtn.disabled = false;
    }
  } finally {
    setButtonsDisabled(false);
  }
}

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

renderDateCards();
