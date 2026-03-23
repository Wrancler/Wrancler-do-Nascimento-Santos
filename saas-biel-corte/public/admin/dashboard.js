import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "biel-do-corte";
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

// NOVO: Acesso ao Financeiro com Senha PIN
const btnFinanceiro = document.getElementById("btnFinanceiro");
if (btnFinanceiro) {
  btnFinanceiro.addEventListener("click", async () => {
    // 1. Busca a senha verdadeira lá do Firebase
    const config = await getTenantConfig(tenantId);
    
    // 2. Pede para a pessoa digitar a senha
    const pinDigitado = prompt("🔒 Digite o PIN do Gestor para acessar o Financeiro:");
    
    if (pinDigitado === null) return; // Se a pessoa clicar em Cancelar, não faz nada
    
    // 3. Confere se a senha bate com o banco de dados
    if (config.financePin && pinDigitado === String(config.financePin)) {
      // Senha correta! Dá um "crachá" temporário e abre a porta
      sessionStorage.setItem("crachaFinanceiro", pinDigitado);
      window.location.href = `financeiro.html?tenant=${encodeURIComponent(tenantId)}`;
    } else {
      // Senha errada!
      alert("❌ Senha incorreta! Acesso negado.");
    }
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

         // ---------------------------------------------------------
    // NOVO: VERIFICAÇÃO DE GESTOR (DONO) PARA MOSTRAR O BOTÃO
    // ---------------------------------------------------------
    const btnFinanceiro = document.getElementById("btnFinanceiro");
    if (btnFinanceiro && auth.currentUser) {
      // Confere se o email que fez login é exatamente igual ao ownerEmail do banco
      if (config.ownerEmail && auth.currentUser.email === config.ownerEmail) {
        btnFinanceiro.style.display = "block"; // Revela o botão apenas para o dono
      }
    }
    // ---------------------------------------------------------


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

    allAppointmentsForDay = allAppointmentsForDay.filter(a => {
      if (!a || !a.startTime) return false;
      if (a.clientName === "⛔ BLOQUEIO DE AGENDA" && a.status === "cancelled") return false;
      return true;
    });
    
    allAppointmentsForDay.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    renderBlockSlots(); 

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
      const isCompleted = app.status === "completed"; 
      const isBlock = app.clientName === "⛔ BLOQUEIO DE AGENDA";
      
      let timeColor = "#e0b976"; 
      let timeText = app.startTime;

      if (isCancelled) { 
          timeColor = "#ff5555"; 
          timeText = `${app.startTime} (Cancelado)`; 
      } else if (isCompleted) {
          timeColor = "#4CAF50"; 
          timeText = `${app.startTime} (Finalizado)`;
          item.style.opacity = "0.6"; 
          item.style.borderLeft = "4px solid #4CAF50";
      } else if (isBlock) { 
          timeColor = "#888888"; 
      }

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
          <div class="admin-item__service">${app.serviceName || 'Serviço'}</div> 
        `;
      }

      // BOTÕES DE AÇÃO
      const actionsDiv = document.createElement("div");
      actionsDiv.className = "admin-item__actions";
      actionsDiv.style.display = "flex";
      actionsDiv.style.gap = "8px";

      if (isCompleted) {
        actionsDiv.innerHTML = `<span style="color: #4CAF50; font-weight: bold; font-size: 14px; padding: 8px 0;">✅ Serviço Finalizado</span>`;
      } 
      else if (isCancelled) {
        const btnExcluir = document.createElement("button");
        btnExcluir.className = "btn-admin btn-admin--cancel";
        btnExcluir.style.background = "#ff3333";
        btnExcluir.style.color = "white";
        btnExcluir.style.flex = "1";
        btnExcluir.textContent = "🗑️ Excluir da Tela";
        
        btnExcluir.onclick = async () => {
          if (confirm("Tem certeza que deseja limpar este horário cancelado da tela?")) {
            btnExcluir.textContent = "Excluindo...";
            await deleteDoc(doc(db, "appointments", app.id));
            loadAppointments(dateInput.value); 
          }
        };
        actionsDiv.appendChild(btnExcluir);
      } 
      else {
        if (!isBlock) {
          const btnFinalizar = document.createElement("button");
          btnFinalizar.className = "btn-admin";
          btnFinalizar.style.background = "#4CAF50"; 
          btnFinalizar.style.color = "white";
          btnFinalizar.style.flex = "1";
          btnFinalizar.textContent = "✅ Finalizar";
          
          btnFinalizar.onclick = async () => {
            if (confirm("Marcar este atendimento como concluído?")) {
              btnFinalizar.textContent = "Aguarde...";
              await updateDoc(doc(db, "appointments", app.id), { status: "completed" });
              loadAppointments(dateInput.value); 
            }
          };
          actionsDiv.appendChild(btnFinalizar);
        }

        const btnCancel = document.createElement("button");
        btnCancel.className = "btn-admin btn-admin--cancel";
        btnCancel.style.flex = "1";
        btnCancel.textContent = isBlock ? "Desbloquear Horário" : "Cancelar";
        
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
      }
      
      item.appendChild(actionsDiv);
      listDiv.appendChild(item);
    });

  } catch (error) {
    console.error("Erro:", error);
    totalHead.textContent = "Erro de Leitura";
    listDiv.innerHTML = `<p style='color: #ff5555; text-align: center;'>Erro: ${error.message}</p>`;
  }
}

// ==========================================
// 4. MOTOR BLINDADO DE HORÁRIOS
// ==========================================
function generateAdminSlots(workHours, apps) {
  const slots = [];
  if (!workHours || !Array.isArray(workHours)) return slots;

  const occupied = apps.map(app => {
    if (!app || !app.startTime) return null;
    let end = app.endTime;
    if (!end) { 
      try {
        const [h, m] = String(app.startTime).split(":").map(Number);
        const t = h * 60 + m + 40;
        end = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
      } catch(e) { end = "23:59"; }
    }
    return { start: String(app.startTime), end: String(end) };
  }).filter(Boolean);

  workHours.forEach(period => {
    if (!period || typeof period !== "string" || !period.includes("-")) return;
    const parts = period.split("-");
    if (parts.length < 2) return;
    
    let [currH, currM] = parts[0].split(":").map(Number);
    const [endH, endM] = parts[1].split(":").map(Number);
    let currentTotal = currH * 60 + currM;
    const endTotal = endH * 60 + endM;
    const duration = 30; 

    while (currentTotal + duration <= endTotal) {
      const slotTime = `${String(Math.floor(currentTotal/60)).padStart(2,"0")}:${String(currentTotal%60).padStart(2,"0")}`;
      const slotEndTotal = currentTotal + duration;

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
        } catch(e) { } 
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

  let slots = generateAdminSlots(workingHours, profAppointments);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  if (dateStr === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    slots = slots.filter(time => {
      if (!time || typeof time !== "string") return false; 
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

// Lógica da Gaveta
document.getElementById('btnToggleBloqueio').addEventListener('click', function() {
    const secao = document.getElementById('secaoBloqueio');
    if (secao.style.display === 'none') {
        secao.style.display = 'block';
        this.innerHTML = '🔼 Ocultar Horários de Bloqueio';
    } else {
        secao.style.display = 'none';
        this.innerHTML = '🔒 Gerenciar Horários de Bloqueio';
    }
});

// ==========================================
// 6. BLOQUEIO DO DIA INTEIRO
// ==========================================
const btnBlockWholeDay = document.getElementById("btnBlockWholeDay");
if (btnBlockWholeDay) {
  btnBlockWholeDay.addEventListener("click", async () => {
    const profId = blockProfSelect.value;
    const dateStr = dateInput.value;

    if (!profId) return alert("Aguarde os profissionais carregarem.");

    if (confirm(`Tem certeza que deseja FECHAR A AGENDA O DIA INTEIRO neste dia? Ninguém conseguirá marcar horários.`)) {
      
      btnBlockWholeDay.textContent = "Bloqueando o dia...";
      btnBlockWholeDay.disabled = true;

      try {
        await addDoc(collection(db, "appointments"), {
          tenantId: tenantId,
          professionalId: profId,
          date: dateStr,
          startTime: "00:00", 
          endTime: "23:59",   
          clientName: "⛔ BLOQUEIO DE AGENDA",
          clientPhone: "00000000000",
          serviceName: "Dia Inteiro Fechado",
          servicePrice: 0,
          status: "confirmed"
        });

        alert("Dia inteiro bloqueado com sucesso!");
        loadAppointments(dateStr); 
      } catch (error) {
        console.error(error);
        alert("Erro ao bloquear o dia.");
      } finally {
        btnBlockWholeDay.textContent = "🛑 Bloquear o Dia Inteiro";
        btnBlockWholeDay.disabled = false;
      }
    }
  });
}
