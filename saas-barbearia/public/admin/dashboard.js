import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";

// ❌ REMOVEMOS O slotGenerator.js externo. Vamos usar um motor blindado interno!

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "tenant-demo";
const auth = getAuth();

let workingHours = [];
let allAppointmentsForDay = []; 
let selectedBlockTime = null; 

// ==========================================
// 1. PROTEÇÃO DE ROTA E LOGOUT
// ==========================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = `login.html?tenant=${encodeURIComponent(tenantId)}`;
  } else {
    initDashboard();
  }
});

const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
  btnLogout.addEventListener("click", () => {
    signOut(auth).then(() => {
      window.location.href = `login.html?tenant=${encodeURIComponent(tenantId)}`;
    });
  });
}

// ==========================================
// 2. INICIALIZAÇÃO E ROLETA
// ==========================================
const dateInput = document.getElementById("adminDate");
const listDiv = document.getElementById("appointmentsList");
const totalHead = document.getElementById("totalAppointments");
const blockProfSelect = document.getElementById("blockProf");

async function initDashboard() {
  try {
    const config = await getTenantConfig(tenantId);
    workingHours = config.workingHours || [];
    
    blockProfSelect.innerHTML = "";
    if (config.professionals) {
      config.professionals.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        blockProfSelect.appendChild(opt);
      });
    }
  } catch(e) { console.error("Erro config", e); }

  blockProfSelect.addEventListener("change", renderBlockSlots);
  renderAdminDateCards();
}

function renderAdminDateCards() {
  const dateSlider = document.getElementById("adminDateSlider");
  if (!dateSlider) return;
  dateSlider.innerHTML = "";

  const today = new Date();
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  for (let i = -3; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    const card = document.createElement("div");
    card.className = "date-card";
    
    if (i === 0) {
      card.classList.add("is-selected");
      dateInput.value = isoDate; 
      loadAppointments(isoDate); 
    }

    card.innerHTML = `
      <span class="date-card__weekday">${i === 0 ? "HOJE" : diasSemana[d.getDay()]}</span>
      <span class="date-card__day">${String(d.getDate()).padStart(2, '0')}</span>
      <span class="date-card__month">${meses[d.getMonth()]}</span>
    `;

    card.addEventListener("click", () => {
      document.querySelectorAll("#adminDateSlider .date-card").forEach(c => c.classList.remove("is-selected"));
      card.classList.add("is-selected");
      dateInput.value = isoDate;
      loadAppointments(isoDate);
    });

    dateSlider.appendChild(card);
  }

  setTimeout(() => {
    const selected = dateSlider.querySelector('.is-selected');
    if(selected) selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, 100);
}

// ==========================================
// 3. BUSCA OS AGENDAMENTOS NA NUVEM
// ==========================================
// ==========================================
// 3. BUSCA OS AGENDAMENTOS NA NUVEM
// ==========================================
async function loadAppointments(dateStr) {
  listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Buscando horários...</p>";
  totalHead.textContent = "Carregando...";

  try {
    const q = query(
      collection(db, "appointments"),
      where("tenantId", "==", tenantId),
      where("date", "==", dateStr)
    );

    const snap = await getDocs(q);
    allAppointmentsForDay = []; 
    snap.forEach(d => allAppointmentsForDay.push({ id: d.id, ...d.data() }));

    // 🧹 MÁGICA DA LIMPEZA VISUAL: Filtro seguro que SOME com os bloqueios desbloqueados
    allAppointmentsForDay = allAppointmentsForDay.filter(a => {
      if (!a || !a.startTime) return false;
      // Se for um Bloqueio Manual que foi cancelado, ESCONDE da tela!
      if (a.clientName === "⛔ BLOQUEIO DE AGENDA" && a.status === "cancelled") return false;
      return true;
    });
    
    allAppointmentsForDay.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    renderBlockSlots(); // Chama nosso gerador blindado interno

    listDiv.innerHTML = "";

    if (allAppointmentsForDay.length === 0) {
      totalHead.textContent = "Nenhum agendamento.";
      listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>A agenda está livre neste dia!</p>";
      return;
    }

    totalHead.textContent = `${allAppointmentsForDay.length} agendamento(s)`;

    allAppointmentsForDay.forEach(app => {
      const item = document.createElement("div");
      item.className = "admin-item";

      const isCancelled = app.status === "cancelled";
      const isBlock = app.clientName === "⛔ BLOQUEIO DE AGENDA";
      let timeColor = "#e0b976"; 
      let timeText = app.startTime;

      if (isCancelled) { timeColor = "#ff5555"; timeText = `${app.startTime} (Cancelado)`; } 
      else if (isBlock) { timeColor = "#888888"; }

      const profIdSeguro = app.professionalId || "desconhecido";
      const profName = profIdSeguro.charAt(0).toUpperCase() + profIdSeguro.slice(1);

      if (isBlock) {
        item.style.borderLeft = "4px solid #888";
        item.style.opacity = "0.8";
        item.innerHTML = `
          <div class="admin-item__top">
            <div class="admin-item__time" style="color: ${timeColor};">${timeText} - ${app.endTime || '--:--'}</div>
            <div class="admin-item__prof">${profName}</div>
          </div>
          <div class="admin-item__client" style="color: #ff5555; font-weight: bold;">⛔ HORÁRIO FECHADO</div>
          <div class="admin-item__service">Bloqueado manualmente pelo Admin</div>
        `;
      } else {
        item.innerHTML = `
          <div class="admin-item__top">
            <div class="admin-item__time" style="color: ${timeColor};">${timeText}</div>
            <div class="admin-item__prof">${profName}</div>
          </div>
          <div class="admin-item__client">${app.clientName || 'Sem Nome'} <br> <span style="font-size: 0.85rem; color: #aaa;">${app.clientPhone || ''}</span></div>
          <div class="admin-item__service">${app.serviceName || 'Serviço'} • R$ ${app.servicePrice || '0'}</div>
        `;
      }

      if (!isCancelled) {
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "admin-item__actions";
        const btnCancel = document.createElement("button");
        btnCancel.className = "btn-admin btn-admin--cancel";
        btnCancel.textContent = isBlock ? "Desbloquear Horário" : "Cancelar Horário";
        
        btnCancel.onclick = async () => {
          const msg = isBlock 
            ? `Tem certeza que deseja LIBERAR o horário das ${app.startTime}?`
            : `Tem certeza que deseja cancelar o horário de ${app.clientName} às ${app.startTime}?`;
          if (confirm(msg)) {
            btnCancel.textContent = "Aguarde...";
            await updateDoc(doc(db, "appointments", app.id), { status: "cancelled" });
            loadAppointments(dateInput.value); 
          }
        };
        actionsDiv.appendChild(btnCancel);
        item.appendChild(actionsDiv);
      }
      listDiv.appendChild(item);
    });

  } catch (error) {
    console.error("Erro:", error);
    totalHead.textContent = "Erro de Leitura";
    listDiv.innerHTML = `<p style='color: #ff5555; text-align: center;'>Erro: ${error.message}</p>`;
  }
}

// ==========================================
// 4. MOTOR BLINDADO DE HORÁRIOS (NOVO)
// ==========================================
function generateAdminSlots(workHours, apps) {
  const slots = [];
  if (!workHours || !Array.isArray(workHours)) return slots;

  // Extrai ocupações com segurança extrema
  const occupied = apps.map(app => {
    if (!app || !app.startTime) return null;
    let end = app.endTime;
    if (!end) { // Se não tiver horário de término salvo, chuta 40 min pra frente pra não quebrar
      try {
        const [h, m] = String(app.startTime).split(":").map(Number);
        const t = h * 60 + m + 40;
        end = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
      } catch(e) { end = "23:59"; }
    }
    return { start: String(app.startTime), end: String(end) };
  }).filter(Boolean);

  // Desenha os blocos livres
  workHours.forEach(period => {
    if (!period || typeof period !== "string" || !period.includes("-")) return;
    const parts = period.split("-");
    if (parts.length < 2) return;
    
    let [currH, currM] = parts[0].split(":").map(Number);
    const [endH, endM] = parts[1].split(":").map(Number);
    let currentTotal = currH * 60 + currM;
    const endTotal = endH * 60 + endM;
    const duration = 30; // Blocos de 30 minutos

    while (currentTotal + duration <= endTotal) {
      const slotTime = `${String(Math.floor(currentTotal/60)).padStart(2,"0")}:${String(currentTotal%60).padStart(2,"0")}`;
      const slotEndTotal = currentTotal + duration;

      // Checa colisão
      let hasCollision = false;
      for (let occ of occupied) {
        try {
          const [oSh, oSm] = occ.start.split(":").map(Number);
          const [oEh, oEm] = occ.end.split(":").map(Number);
          const occStart = oSh * 60 + oSm;
          const occEnd = oEh * 60 + oEm;
          if (currentTotal < occEnd && slotEndTotal > occStart) {
            hasCollision = true; break;
          }
        } catch(e) { } // Ignora erro individual
      }

      if (!hasCollision) slots.push(slotTime);
      currentTotal += duration;
    }
  });

  return slots;
}

// ==========================================
// 5. GERA BOTÕES NA TELA
// ==========================================
function renderBlockSlots() {
  const profId = blockProfSelect.value;
  const blockSlotsDiv = document.getElementById("blockSlots");
  const btnConfirmBlock = document.getElementById("btnConfirmBlock");
  const dateStr = dateInput.value;
  
  selectedBlockTime = null;
  btnConfirmBlock.disabled = true;

  if (!workingHours.length || !profId) {
    blockSlotsDiv.innerHTML = "<p style='color:#888; font-size:13px;'>Configurações não carregadas.</p>";
    return;
  }

  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");

  // Usa o NOSSO gerador blindado local
  let slots = generateAdminSlots(workingHours, profAppointments);

  // Remove horários que já passaram hoje
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  if (dateStr === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    slots = slots.filter(time => {
      if (!time || typeof time !== "string") return false; // Trava extra!
      const parts = time.split(":");
      if (parts.length < 2) return false;
      return (Number(parts[0]) * 60 + Number(parts[1])) > currentMinutes;
    });
  }

  blockSlotsDiv.innerHTML = "";

  if (slots.length === 0) {
    blockSlotsDiv.innerHTML = "<p style='color:#888; font-size:13px;'>Sem horários livres para bloquear.</p>";
    return;
  }

  slots.forEach(time => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot"; 
    btn.textContent = time;
    
    btn.onclick = () => {
      blockSlotsDiv.querySelectorAll('button').forEach(b => b.classList.remove('selected', 'is-selected'));
      btn.classList.add('selected', 'is-selected');
      selectedBlockTime = time;
      btnConfirmBlock.disabled = false;
    };
    blockSlotsDiv.appendChild(btn);
  });
}

const btnConfirmBlock = document.getElementById("btnConfirmBlock");
if (btnConfirmBlock) {
  btnConfirmBlock.addEventListener("click", async () => {
    const profId = blockProfSelect.value;
    const dateStr = dateInput.value;

    if (!selectedBlockTime) return;

    btnConfirmBlock.textContent = "Bloqueando...";
    btnConfirmBlock.disabled = true;

    const time = selectedBlockTime;
    const [h, m] = time.split(":").map(Number);
    const total = h * 60 + m + 30; 
    const endH = String(Math.floor(total / 60)).padStart(2, "0");
    const endM = String(total % 60).padStart(2, "0");
    const endTime = `${endH}:${endM}`;

    try {
      await addDoc(collection(db, "appointments"), {
        tenantId: tenantId,
        professionalId: profId,
        date: dateStr,
        startTime: time,
        endTime: endTime,
        clientName: "⛔ BLOQUEIO DE AGENDA",
        clientPhone: "00000000000",
        serviceName: "Bloqueio Manual",
        servicePrice: 0,
        status: "confirmed"
      });

      alert("Horário bloqueado com sucesso!");
      loadAppointments(dateStr); 
    } catch (error) {
      console.error(error);
      alert("Erro ao bloquear a agenda.");
    } finally {
      btnConfirmBlock.textContent = "Bloquear Selecionado";
    }
  });
}
