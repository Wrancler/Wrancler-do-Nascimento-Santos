import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "biel-do-corte";
const auth = getAuth();

let workingHours = [];
let allAppointmentsForDay = []; 
let servicesData = []; 
let currentSnapshotUnsubscribe = null;
let profissionaisConfig = [];
let adminPinConfig = "";

// Variáveis de Controle de Acesso
let loggedRole = sessionStorage.getItem("loggedRole") || null; // 'admin' ou o 'ID do barbeiro'
let loggedName = sessionStorage.getItem("loggedName") || null;

// ==========================================
// 1. PROTEÇÃO DE ROTA
// ==========================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = `login.html?tenant=${encodeURIComponent(tenantId)}`;
  } else {
    initDashboard();
  }
});

document.getElementById("btnSwitchUser").addEventListener("click", () => {
  sessionStorage.removeItem("loggedRole");
  sessionStorage.removeItem("loggedName");
  window.location.reload();
});

// Acesso ao Financeiro
const btnFinanceiro = document.getElementById("btnFinanceiro");
if (btnFinanceiro) {
  btnFinanceiro.addEventListener("click", () => {
    sessionStorage.setItem("crachaFinanceiro", adminPinConfig); // Passa direto pois ele já digitou o PIN para entrar
    window.location.href = `financeiro.html?tenant=${encodeURIComponent(tenantId)}`;
  });
}

// ==========================================
// 2. TELA DE BLOQUEIO E INICIALIZAÇÃO
// ==========================================
const loginUserSelect = document.getElementById("loginUserSelect");
const loginPinInput = document.getElementById("loginPinInput");
const btnUnlock = document.getElementById("btnUnlock");
const loginError = document.getElementById("loginError");
const lockScreen = document.getElementById("lockScreen");

async function initDashboard() {
  try {
    const config = await getTenantConfig(tenantId);
    workingHours = config.workingHours || [];
    servicesData = config.services || [];
    profissionaisConfig = config.professionals || [];
    adminPinConfig = config.financePin || "0000";

    // Preenche a tela de login APENAS com os colaboradores reais
    profissionaisConfig.forEach(p => {
      // O Pulo do Gato: Se o profissional tiver "isOwner: true" no Firebase, o sistema ignora ele aqui!
      if (p.isOwner === true) {
        return; 
      }

      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = `✂️ Colaborador: ${p.name}`;
      loginUserSelect.appendChild(opt);
    });

    if (!loggedRole) {
      lockScreen.style.display = "flex";
    } else {
      aplicarPermissoesDeAcesso();
    }

  } catch(e) { console.error("Erro config", e); }
}

btnUnlock.addEventListener("click", () => {
  const userSelecionado = loginUserSelect.value;
  const pinDigitado = loginPinInput.value;

  if (userSelecionado === "admin") {
    if (pinDigitado === adminPinConfig) {
      liberarAcesso("admin", "Gestor Geral");
    } else {
      loginError.style.display = "block";
    }
  } else {
    const barbeiro = profissionaisConfig.find(p => p.id === userSelecionado);
    if (barbeiro && barbeiro.pin && pinDigitado === barbeiro.pin) {
      liberarAcesso(barbeiro.id, barbeiro.name);
    } else {
      loginError.style.display = "block";
    }
  }
});

function liberarAcesso(role, name) {
  sessionStorage.setItem("loggedRole", role);
  sessionStorage.setItem("loggedName", name);
  loggedRole = role;
  loggedName = name;
  lockScreen.style.opacity = "0";
  setTimeout(() => {
    lockScreen.style.display = "none";
    aplicarPermissoesDeAcesso();
  }, 300);
}

// ==========================================
// 3. O MOTOR DE PERMISSÕES (VISÃO CHEFE VS COLABORADOR)
// ==========================================
const blockProfSelect = document.getElementById("blockProf");
const mainProfFilter = document.getElementById("mainProfFilter"); 
const manualProfSelect = document.getElementById("manualProf");

function aplicarPermissoesDeAcesso() {
  document.getElementById("tagCargo").textContent = loggedRole === "admin" ? "Acesso Gestor" : `Acesso: ${loggedName}`;

  blockProfSelect.innerHTML = "";
  manualProfSelect.innerHTML = "";
  mainProfFilter.innerHTML = "";

  if (loggedRole === "admin") {
    // VISÃO DO CHEFE (Vê tudo)
    btnFinanceiro.style.display = "block";
    mainProfFilter.style.display = "block";
    
    mainProfFilter.innerHTML = '<option value="todos">Todos os Barbeiros</option>';
    manualProfSelect.innerHTML = '<option value="">Selecione o Barbeiro...</option>';
    blockProfSelect.innerHTML = '<option value="">Selecione o Barbeiro...</option>';

    profissionaisConfig.forEach(p => {
      mainProfFilter.appendChild(new Option(p.name, p.id));
      manualProfSelect.appendChild(new Option(p.name, p.id));
      blockProfSelect.appendChild(new Option(p.name, p.id));
    });

  } else {
    // VISÃO DO COLABORADOR (Limitado)
    btnFinanceiro.style.display = "none"; // Some com o botão de dinheiro
    mainProfFilter.style.display = "none"; // Esconde o filtro de ver outros barbeiros
    
    // Trava os selectbox só no nome dele
    mainProfFilter.appendChild(new Option(loggedName, loggedRole));
    manualProfSelect.appendChild(new Option(loggedName, loggedRole));
    blockProfSelect.appendChild(new Option(loggedName, loggedRole));
  }

  // Preenche os serviços no formulário manual
  document.getElementById("manualService").innerHTML = '<option value="">Selecione o Serviço...</option>';
  servicesData.forEach(s => {
    document.getElementById("manualService").appendChild(new Option(`${s.name} - R$${s.price}`, s.id));
  });

  // Dá os gatilhos dos botões
  blockProfSelect.addEventListener("change", renderBlockSlots);
  mainProfFilter.addEventListener("change", renderAppointmentsList);
  manualProfSelect.addEventListener("change", updateManualSlots);
  document.getElementById("manualService").addEventListener("change", updateManualSlots);
  document.getElementById("manualTime").addEventListener("change", () => {
    document.getElementById("btnConfirmManual").disabled = !document.getElementById("manualTime").value;
  });

  renderAdminDateCards();
}

// ==========================================
// 4. ROLETA DE DATAS E RADAR (TEMPO REAL)
// ==========================================
const dateInput = document.getElementById("adminDate");
const listDiv = document.getElementById("appointmentsList");
const totalHead = document.getElementById("totalAppointments");

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

    card.innerHTML = `<span class="date-card__weekday">${i===0?"HOJE":diasSemana[d.getDay()]}</span><span class="date-card__day">${String(d.getDate()).padStart(2, '0')}</span><span class="date-card__month">${meses[d.getMonth()]}</span>`;

    card.addEventListener("click", () => {
      document.querySelectorAll("#adminDateSlider .date-card").forEach(c => c.classList.remove("is-selected"));
      card.classList.add("is-selected");
      dateInput.value = isoDate;
      loadAppointments(isoDate);
    });

    dateSlider.appendChild(card);
  }
}

function loadAppointments(dateStr) {
  listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Buscando horários...</p>";
  
  if (currentSnapshotUnsubscribe) currentSnapshotUnsubscribe();

  const q = query(collection(db, "appointments"), where("tenantId", "==", tenantId), where("date", "==", dateStr));

  currentSnapshotUnsubscribe = onSnapshot(q, (snap) => {
    allAppointmentsForDay = []; 
    snap.forEach(d => allAppointmentsForDay.push({ id: d.id, ...d.data() }));

    allAppointmentsForDay = allAppointmentsForDay.filter(a => a && a.startTime && !(a.clientName === "⛔ BLOQUEIO DE AGENDA" && a.status === "cancelled"));
    allAppointmentsForDay.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    renderBlockSlots(); 
    updateManualSlots(); 
    renderAppointmentsList(); 
  });
}

function renderAppointmentsList() {
  listDiv.innerHTML = "";
  const profFiltro = mainProfFilter.value;

  // Filtra dependendo se é o Gestor ou o Colaborador
  let appsToRender = allAppointmentsForDay;
  if (profFiltro !== "todos") {
    appsToRender = allAppointmentsForDay.filter(a => a.professionalId === profFiltro);
  }

  if (appsToRender.length === 0) {
    totalHead.textContent = "Nenhum agendamento.";
    listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Agenda livre.</p>";
    return;
  }

  totalHead.textContent = `${appsToRender.length} agendamento(s)`;

  appsToRender.forEach(app => {
    const item = document.createElement("div");
    item.className = "admin-item";

    const isCancelled = app.status === "cancelled";
    const isCompleted = app.status === "completed"; 
    const isBlock = app.clientName === "⛔ BLOQUEIO DE AGENDA";
    
    let timeColor = "#e0b976"; let timeText = app.startTime;
    if (isCancelled) { timeColor = "#ff5555"; timeText = `${app.startTime} (Cancelado)`; } 
    else if (isCompleted) { timeColor = "#4CAF50"; timeText = `${app.startTime} (Finalizado)`; item.style.opacity = "0.6"; item.style.borderLeft = "4px solid #4CAF50"; } 
    else if (isBlock) { timeColor = "#888888"; }

    const profName = (app.professionalId || "desconhecido").charAt(0).toUpperCase() + (app.professionalId || "").slice(1);

    if (isBlock) {
      item.style.borderLeft = "4px solid #888"; item.style.opacity = "0.8";
      item.innerHTML = `<div class="admin-item__top"><div class="admin-item__time" style="color: ${timeColor};">${timeText}</div><div class="admin-item__prof">${profName}</div></div><div class="admin-item__client" style="color: #ff5555; font-weight: bold;">⛔ HORÁRIO FECHADO</div>`;
    } else {
      item.innerHTML = `<div class="admin-item__top"><div class="admin-item__time" style="color: ${timeColor};">${timeText}</div><div class="admin-item__prof">${profName}</div></div><div class="admin-item__client">${app.clientName || 'Sem Nome'} <br> <span style="font-size: 0.85rem; color: #aaa;">${app.clientPhone || ''}</span></div><div class="admin-item__service">${app.serviceName || 'Serviço'}</div>`;
    }

    const actionsDiv = document.createElement("div");
    actionsDiv.style.display = "flex"; actionsDiv.style.gap = "8px"; actionsDiv.style.marginTop = "10px";

    if (isCompleted) {
      actionsDiv.innerHTML = `<span style="color: #4CAF50; font-weight: bold; font-size: 14px; padding: 8px 0;">✅ Finalizado</span>`;
    } else if (isCancelled) {
      actionsDiv.innerHTML = `<button class="premium-btn-danger" style="margin:0; padding:10px;" onclick="excluirApp('${app.id}')">🗑️ Excluir da Tela</button>`;
    } else {
      if (!isBlock) {
        actionsDiv.innerHTML += `<button class="premium-btn-main" style="margin:0; padding:10px; background:#4CAF50; color:#fff;" onclick="finalizarApp('${app.id}')">✅ Finalizar</button>`;
      }
      actionsDiv.innerHTML += `<button class="premium-btn-danger" style="margin:0; padding:10px;" onclick="cancelarApp('${app.id}', ${isBlock})">${isBlock ? 'Desbloquear' : 'Cancelar'}</button>`;
    }
    item.appendChild(actionsDiv);
    listDiv.appendChild(item);
  });
}

// Funções Globais para os botões dos cards
window.excluirApp = async (id) => { if (confirm("Limpar da tela?")) await deleteDoc(doc(db, "appointments", id)); };
window.finalizarApp = async (id) => { if (confirm("Marcar como concluído?")) await updateDoc(doc(db, "appointments", id), { status: "completed" }); };
window.cancelarApp = async (id, isBlock) => { if (confirm(isBlock ? "Liberar horário?" : "Cancelar cliente?")) await updateDoc(doc(db, "appointments", id), { status: "cancelled" }); };

// ==========================================
// 5. MOTOR DE SLOTS (BLOQUEIO E MANUAL)
// ==========================================
function generateDynamicSlots(workHours, apps, durationMinutes) {
  const slots = [];
  if (!workHours || !Array.isArray(workHours)) return slots;
  const occupied = apps.map(app => {
    let end = app.endTime;
    if (!end) { const [h, m] = String(app.startTime).split(":").map(Number); const t = h * 60 + m + 40; end = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`; }
    return { start: String(app.startTime), end: String(end) };
  });

  workHours.forEach(period => {
    const parts = period.split("-"); if (parts.length < 2) return;
    let [currH, currM] = parts[0].split(":").map(Number); const [endH, endM] = parts[1].split(":").map(Number);
    let currentTotal = currH * 60 + currM; const endTotal = endH * 60 + endM;

    while (currentTotal + durationMinutes <= endTotal) {
      const slotTime = `${String(Math.floor(currentTotal/60)).padStart(2,"0")}:${String(currentTotal%60).padStart(2,"0")}`;
      const slotEndTotal = currentTotal + durationMinutes;
      let hasCollision = false;
      for (let occ of occupied) {
        const [oSh, oSm] = occ.start.split(":").map(Number); const [oEh, oEm] = occ.end.split(":").map(Number);
        if (currentTotal < (oEh * 60 + oEm) && slotEndTotal > (oSh * 60 + oSm)) { hasCollision = true; break; }
      }
      if (!hasCollision) slots.push(slotTime);
      currentTotal += 10; 
    }
  });
  return slots;
}

function updateManualSlots() {
  const profId = manualProfSelect.value; const serviceId = document.getElementById("manualService").value;
  const timeSelect = document.getElementById("manualTime"); timeSelect.innerHTML = '<option value="">Horário...</option>';
  document.getElementById("btnConfirmManual").disabled = true;

  if (!profId || !serviceId) return;
  const service = servicesData.find(s => s.id === serviceId);
  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");
  
  let slots = generateDynamicSlots(workingHours, profAppointments, service.duration);
  const now = new Date(); const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dateInput.value === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    slots = slots.filter(time => (Number(time.split(":")[0]) * 60 + Number(time.split(":")[1])) > currentMinutes);
  }

  slots.forEach(time => timeSelect.appendChild(new Option(time, time)));
  timeSelect.disabled = false;
}

document.getElementById("btnConfirmManual").addEventListener("click", async () => {
  const btn = document.getElementById("btnConfirmManual");
  btn.disabled = true; btn.textContent = "Aguarde...";
  const service = servicesData.find(s => s.id === document.getElementById("manualService").value);
  const time = document.getElementById("manualTime").value;
  const [h, m] = time.split(":").map(Number); const t = h * 60 + m + service.duration; 

  await addDoc(collection(db, "appointments"), {
    tenantId: tenantId, professionalId: manualProfSelect.value, date: dateInput.value, startTime: time,
    endTime: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
    clientName: document.getElementById("manualClientName").value || "Cliente Balcão",
    clientPhone: document.getElementById("manualClientPhone").value.replace(/[^\d]/g, ""),
    serviceName: service.name, servicePrice: service.price, status: "confirmed"
  });

  document.getElementById('secaoManual').style.display = 'none';
  btn.textContent = "Confirmar"; btn.disabled = false;
});

function renderBlockSlots() {
  const profId = blockProfSelect.value; const blockSlotsDiv = document.getElementById("blockSlots");
  blockSlotsDiv.innerHTML = ""; document.getElementById("btnConfirmBlock").disabled = true;
  if (!profId) return;

  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");
  let slots = generateDynamicSlots(workingHours, profAppointments, 30);
  
  slots.forEach(time => {
    const btn = document.createElement("button"); btn.className = "slot"; btn.textContent = time;
    btn.onclick = () => {
      blockSlotsDiv.querySelectorAll('button').forEach(b => b.classList.remove('is-selected'));
      btn.classList.add('is-selected'); document.getElementById("btnConfirmBlock").disabled = false;
      document.getElementById("btnConfirmBlock").setAttribute("data-time", time);
    };
    blockSlotsDiv.appendChild(btn);
  });
}

document.getElementById("btnConfirmBlock").addEventListener("click", async () => {
  const time = document.getElementById("btnConfirmBlock").getAttribute("data-time");
  const [h, m] = time.split(":").map(Number); const t = h * 60 + m + 30; 
  await addDoc(collection(db, "appointments"), {
    tenantId, professionalId: blockProfSelect.value, date: dateInput.value, startTime: time,
    endTime: `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`,
    clientName: "⛔ BLOQUEIO DE AGENDA", serviceName: "Bloqueio Manual", status: "confirmed"
  });
});

document.getElementById("btnBlockWholeDay").addEventListener("click", async () => {
  if (confirm("Fechar o dia inteiro?")) {
    await addDoc(collection(db, "appointments"), {
      tenantId, professionalId: blockProfSelect.value, date: dateInput.value, startTime: "00:00", endTime: "23:59",
      clientName: "⛔ BLOQUEIO DE AGENDA", serviceName: "Dia Fechado", status: "confirmed"
    });
  }
});

// Lógica das gavetas premium
document.getElementById('btnToggleManual').onclick = function() {
  const s = document.getElementById('secaoManual'); s.style.display = s.style.display === 'none' ? 'block' : 'none';
};
document.getElementById('btnToggleBloqueio').onclick = function() {
  const s = document.getElementById('secaoBloqueio'); s.style.display = s.style.display === 'none' ? 'block' : 'none';
};
