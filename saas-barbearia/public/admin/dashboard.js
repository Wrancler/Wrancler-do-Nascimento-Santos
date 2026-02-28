import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";
import { generateAvailableSlots } from "../../services/slotGenerator.js";


function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "tenant-demo";
const auth = getAuth();

let workingHours = [];
let allAppointmentsForDay = []; // Guarda a agenda do dia para calcular os buracos livres
let selectedBlockTime = null; // Guarda o horário que o admin clicou

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
// 2. INICIALIZAÇÃO (Busca Configurações do SaaS)
// ==========================================
const dateInput = document.getElementById("adminDate");
const listDiv = document.getElementById("appointmentsList");
const totalHead = document.getElementById("totalAppointments");
const blockProfSelect = document.getElementById("blockProf");

async function initDashboard() {
  try {
    // Busca os dados da Barbearia (Horários e Profissionais)
    const config = await getTenantConfig(tenantId);
    workingHours = config.workingHours || [];
    
    // Popula a caixinha de barbeiros automaticamente!
    blockProfSelect.innerHTML = "";
    if (config.professionals) {
      config.professionals.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        blockProfSelect.appendChild(opt);
      });
    }
  } catch(e) { 
    console.error("Erro ao carregar configurações da barbearia", e); 
  }

  // Se trocar o barbeiro na caixinha, recalcula os botões de horário
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
    if(selected) {
      selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 100);
}

// ==========================================
// 3. BUSCA OS AGENDAMENTOS E GERA BOTÕES
// ==========================================
// ==========================================
// 3. BUSCA OS AGENDAMENTOS E GERA BOTÕES
// ==========================================
async function loadAppointments(dateStr) {
  listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Buscando horários na nuvem...</p>";
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

    // 🛡️ TRAVA DE SEGURANÇA MÁXIMA: Ignora agendamentos zumbis e garante que a hora é um texto
       // 🛡️ TRAVA DE SEGURANÇA MÁXIMA: Exige que o agendamento tenha Início E Fim!
    allAppointmentsForDay = allAppointmentsForDay.filter(a => a && a.startTime && a.endTime);

    allAppointmentsForDay.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    // Agora desenha os botões de bloqueio na tela
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
      const isBlock = app.clientName === "⛔ BLOQUEIO DE AGENDA";
      
      let timeColor = "#e0b976"; 
      let timeText = app.startTime;

      if (isCancelled) {
        timeColor = "#ff5555";
        timeText = `${app.startTime} (Cancelado)`;
      } else if (isBlock) {
        timeColor = "#888888"; 
      }

      // Previne erro caso o profissional tenha sido salvo em branco num teste antigo
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
    console.error("Erro ao buscar agendamentos:", error);
    totalHead.textContent = "Erro Fatal!";
    // 🚨 MOSTRA O CÓDIGO DO ERRO NA TELA PARA NÓS LERMOS
    listDiv.innerHTML = `
      <div style='background: rgba(255,0,0,0.1); border: 1px solid #ff5555; padding: 20px; border-radius: 12px; text-align: left;'>
        <h3 style='color: #ff5555; margin-top: 0;'>🚨 O Firebase bloqueou a leitura!</h3>
        <p style='color: #eee; font-size: 14px;'>O motivo exato foi:</p>
        <code style='color: #ffaa00; font-size: 13px; display: block; margin-top: 10px;'>${error.message}</code>
      </div>
    `;
  }
}

// ==========================================
// 4. MÁGICA DOS BOTÕES DE BLOQUEIO (NOVO)
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

  // Filtra os cortes APENAS desse barbeiro (pra não bloquear a agenda do outro)
  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");

  // Usa a mesma inteligência do app do cliente (Tamanho do bloqueio: 30 minutos)
  let slots = generateAvailableSlots(workingHours, profAppointments, 30);

  // Filtra horários que já passaram se for HOJE
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  if (dateStr === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    slots = slots.filter(time => {
      const [h, m] = time.split(":").map(Number);
      return (h * 60 + m) > currentMinutes;
    });
  }

  blockSlotsDiv.innerHTML = "";

  if (slots.length === 0) {
    blockSlotsDiv.innerHTML = "<p style='color:#888; font-size:13px;'>Sem horários livres para bloquear.</p>";
    return;
  }

  // Desenha a grade de botões (Chips) idêntica à do cliente
  slots.forEach(time => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "slot"; 
    btn.textContent = time;
    
    btn.onclick = () => {
      // Tira o amarelo dos outros e acende o clicado
      const allBtn = blockSlotsDiv.querySelectorAll('button');
      allBtn.forEach(b => b.classList.remove('selected', 'is-selected'));
      btn.classList.add('selected', 'is-selected');
      
      // Libera o botão vermelho
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

    if (!selectedBlockTime) return alert("Por favor, selecione um horário nos botões abaixo.");

    btnConfirmBlock.textContent = "Bloqueando...";
    btnConfirmBlock.disabled = true;

    // Calcula a duração do bloqueio (30 minutos)
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
      
      // Recarrega tudo (atualiza os cards e redesenha os botões sem o horário que acabou de sumir)
      loadAppointments(dateStr); 
    } catch (error) {
      console.error(error);
      alert("Erro ao bloquear a agenda. Verifique o console.");
    } finally {
      btnConfirmBlock.textContent = "Bloquear Selecionado";
    }
  });
}
