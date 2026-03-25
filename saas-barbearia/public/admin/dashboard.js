import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, addDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "tenant-demo";
const auth = getAuth();

let workingHours = [];
let allAppointmentsForDay = []; 
let selectedBlockTime = null; 
let currentSnapshotUnsubscribe = null;
let servicesData = []; 
let profissionaisConfig = []; // Para a aba de equipe

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

const btnFinanceiro = document.getElementById("btnFinanceiro");
if (btnFinanceiro) {
  btnFinanceiro.addEventListener("click", async () => {
    const config = await getTenantConfig(tenantId);
    const pinDigitado = prompt("🔒 Digite o PIN do Gestor para acessar o Financeiro:");
    if (pinDigitado === null) return; 
    if (config.financePin && pinDigitado === String(config.financePin)) {
      sessionStorage.setItem("crachaFinanceiro", pinDigitado);
      window.location.href = `financeiro.html?tenant=${encodeURIComponent(tenantId)}`;
    } else {
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
const mainProfFilter = document.getElementById("mainProfFilter"); 

const manualProfSelect = document.getElementById("manualProf");
const manualServiceSelect = document.getElementById("manualService");
const manualTimeSelect = document.getElementById("manualTime");
const btnConfirmManual = document.getElementById("btnConfirmManual");
const manualClientName = document.getElementById("manualClientName");
const manualClientPhone = document.getElementById("manualClientPhone");

async function initDashboard() {
  try {
    const config = await getTenantConfig(tenantId);
    workingHours = config.workingHours || [];
    servicesData = config.services || []; 
    profissionaisConfig = config.professionals || []; // Guarda os profissionais
    
    blockProfSelect.innerHTML = '<option value="">Carregando profissionais...</option>';
    if (mainProfFilter) mainProfFilter.innerHTML = '<option value="todos">Todos os Barbeiros</option>';
    manualProfSelect.innerHTML = '<option value="">Selecione o Barbeiro...</option>';
    manualServiceSelect.innerHTML = '<option value="">Selecione o Serviço...</option>';

    if (config.professionals) {
      blockProfSelect.innerHTML = "";
      config.professionals.forEach(p => {
        const opt1 = document.createElement("option"); opt1.value = p.id; opt1.textContent = p.name;
        blockProfSelect.appendChild(opt1);

        if (mainProfFilter) {
          const opt2 = document.createElement("option"); opt2.value = p.id; opt2.textContent = p.name;
          mainProfFilter.appendChild(opt2);
        }

        const opt3 = document.createElement("option"); opt3.value = p.id; opt3.textContent = p.name;
        manualProfSelect.appendChild(opt3);
      });
    }

    if (config.services) {
      config.services.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.id;
        opt.textContent = `${s.name} (${s.duration} min) - R$${s.price}`;
        manualServiceSelect.appendChild(opt);
      });
    }
    
    // Prepara a tela de configurações para quando ele clicar
    renderConfigPanel();

  } catch(e) { console.error("Erro config", e); }

  blockProfSelect.addEventListener("change", renderBlockSlots);
  if (mainProfFilter) mainProfFilter.addEventListener("change", renderAppointmentsList);
  
  manualProfSelect.addEventListener("change", updateManualSlots);
  manualServiceSelect.addEventListener("change", updateManualSlots);
  manualTimeSelect.addEventListener("change", () => {
    btnConfirmManual.disabled = !manualTimeSelect.value;
  });

  renderAdminDateCards();
}

// ==========================================
// 3. LÓGICA DA ABA DE CONFIGURAÇÕES E GALERIA
// ==========================================
const configSection = document.getElementById("configSection");
const agendaSection = document.getElementById("agendaSection");
const listaSection = document.getElementById("listaSection");
const btnConfig = document.getElementById("btnConfig");

btnConfig.addEventListener("click", () => {
  agendaSection.style.display = "none";
  listaSection.style.display = "none";
  configSection.style.display = "block";
});

document.getElementById("btnCloseConfig").addEventListener("click", () => {
  configSection.style.display = "none";
  agendaSection.style.display = "block";
  listaSection.style.display = "block";
});

function renderConfigPanel() {
  const servicesList = document.getElementById("configServicesList");
  const teamList = document.getElementById("configTeamList");
  servicesList.innerHTML = ""; teamList.innerHTML = "";

  // Equipe
  profissionaisConfig.forEach(p => {
    teamList.innerHTML += `
      <div class="config-list-item">
        <div><strong>${p.name}</strong><br><span>👑 Gestor/Barbeiro</span></div>
        <div style="color: #4CAF50; font-size: 12px;">Ativo</div>
      </div>`;
  });

  // Serviços
  servicesData.forEach((s, index) => {
    servicesList.innerHTML += `
      <div class="config-list-item">
        <div style="display:flex; align-items:center; gap:12px;">
            ${s.image ? `<img src="${s.image}" style="width:36px; height:36px; border-radius:8px; object-fit:cover;">` : ''}
            <div><strong>${s.name}</strong><br><span>${s.duration} min • R$ ${s.price}</span></div>
        </div>
        <button class="btnRemoverServico" data-index="${index}" style="background:transparent; border:none; color:#ff5555; cursor:pointer; font-size:18px;">❌</button>
      </div>`;
  });

  document.querySelectorAll(".btnRemoverServico").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      if(!confirm("Remover este serviço do site?")) return;
      const index = e.target.getAttribute("data-index");
      servicesData.splice(index, 1); 
      await salvarConfiguracoes(true);
    });
  });
}

// MODAL DA GALERIA (IPHONE FIX)
const imageSheetOverlay = document.getElementById("imageSheetOverlay");
const sheetBtnGaleria = document.getElementById("sheetBtnGaleria");
const sheetBtnPadrao = document.getElementById("sheetBtnPadrao");
let currentNewServiceId = null;

document.getElementById("btnAddNewService").addEventListener("click", async () => {
  const nome = prompt("Nome do novo serviço (ex: Platinado):");
  if (!nome) return;
  const preco = prompt("Preço (ex: 70):");
  if (!preco) return;
  const duracao = prompt("Duração em minutos (ex: 60):");
  if (!duracao) return;

  document.getElementById("btnAddNewService").textContent = "A preparar...";

  const newId = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
  currentNewServiceId = newId; 
  const imageUrl = "https://cdn-icons-png.flaticon.com/512/6573/6573138.png"; 

  servicesData.push({ 
    id: newId, name: nome, price: Number(preco), duration: Number(duracao), image: imageUrl 
  });
  
  await salvarConfiguracoes(false);
  imageSheetOverlay.classList.add("is-open");
  document.getElementById("btnAddNewService").textContent = "+ Adicionar Novo Serviço";
});

sheetBtnGaleria.addEventListener("click", () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*'; 

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    sheetBtnGaleria.textContent = "A processar...";
    imageSheetOverlay.classList.remove("is-open"); 

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 300; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const base64Image = canvas.toDataURL('image/jpeg', 0.7); 
        
        const index = servicesData.findIndex(s => s.id === currentNewServiceId);
        if (index !== -1) {
          servicesData[index].image = base64Image;
          await salvarConfiguracoes(true); 
        }
        sheetBtnGaleria.textContent = "🖼️ Escolher da Galeria";
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click(); 
});

sheetBtnPadrao.addEventListener("click", () => {
  imageSheetOverlay.classList.remove("is-open");
  alert("Configurações atualizadas com sucesso!");
});

async function salvarConfiguracoes(mostrarAlerta = true) {
  try {
    document.getElementById("btnAddNewService").textContent = "A gravar...";
    await updateDoc(doc(db, "tenants", tenantId), {
      services: servicesData
    });
    if (mostrarAlerta) alert("Configurações atualizadas com sucesso!");
    document.getElementById("btnAddNewService").textContent = "+ Adicionar Novo Serviço";
    renderConfigPanel(); 
  } catch(e) {
    alert("Erro ao gravar. Tente novamente.");
    console.error(e);
  }
}

// ==========================================
// 4. DATE SLIDER E REALTIME BUSCA
// ==========================================
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

function loadAppointments(dateStr) {
  listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Buscando horários...</p>";
  totalHead.textContent = "Aguarde...";

  if (currentSnapshotUnsubscribe) {
    currentSnapshotUnsubscribe();
  }

  try {
    const q = query(
      collection(db, "appointments"),
      where("tenantId", "==", tenantId),
      where("date", "==", dateStr)
    );

    currentSnapshotUnsubscribe = onSnapshot(q, (snap) => {
      allAppointmentsForDay = []; 
      snap.forEach(d => allAppointmentsForDay.push({ id: d.id, ...d.data() }));

      allAppointmentsForDay = allAppointmentsForDay.filter(a => {
        if (!a || !a.startTime) return false;
        if (a.clientName === "⛔ BLOQUEIO DE AGENDA" && a.status === "cancelled") return false;
        return true;
      });
      
      allAppointmentsForDay.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

      renderBlockSlots(); 
      updateManualSlots(); 
      renderAppointmentsList(); 
    }, (error) => {
      console.error("Erro no tempo real:", error);
      listDiv.innerHTML = `<p style='color: #ff5555; text-align: center;'>Erro: ${error.message}</p>`;
    });

  } catch (error) {
    console.error("Erro:", error);
  }
}

function renderAppointmentsList() {
  listDiv.innerHTML = "";
  const profFiltro = mainProfFilter ? mainProfFilter.value : "todos";

  let appsToRender = allAppointmentsForDay;
  if (profFiltro !== "todos") {
    appsToRender = allAppointmentsForDay.filter(a => a.professionalId === profFiltro);
  }

  if (appsToRender.length === 0) {
    totalHead.textContent = "Nenhum agendamento.";
    listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Nenhum horário encontrado para este filtro.</p>";
    return;
  }

  totalHead.textContent = `${appsToRender.length} agendamento(s)`;

  appsToRender.forEach(app => {
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
        }
      };
      actionsDiv.appendChild(btnCancel);
    }
    
    item.appendChild(actionsDiv);
    listDiv.appendChild(item);
  });
}

// ==========================================
// 5. MOTOR BLINDADO DE HORÁRIOS (Dinâmico)
// ==========================================
function generateDynamicSlots(workHours, apps, durationMinutes = 30) {
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

  // ==========================================
  // O PULO DO GATO: Guilherme quer a visão igual a do cliente
  // ==========================================
  const saltoDaAgenda = 40; 

  workHours.forEach(period => {
    if (!period || typeof period !== "string" || !period.includes("-")) return;
    const parts = period.split("-");
    if (parts.length < 2) return;
    
    let [currH, currM] = parts[0].split(":").map(Number);
    const [endH, endM] = parts[1].split(":").map(Number);
    let currentTotal = currH * 60 + currM;
    const endTotal = endH * 60 + endM;

    while (currentTotal + durationMinutes <= endTotal) {
      const slotTime = `${String(Math.floor(currentTotal/60)).padStart(2,"0")}:${String(currentTotal%60).padStart(2,"0")}`;
      const slotEndTotal = currentTotal + durationMinutes;

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
      
      // MUDANÇA AQUI: Avança de 40 em 40 minutos!
      currentTotal += saltoDaAgenda; 
    }
  });

  return slots;
}

// ==========================================
// 6. LÓGICA DO AGENDAMENTO MANUAL E BLOQUEIOS
// ==========================================
function updateManualSlots() {
  const profId = manualProfSelect.value;
  const serviceId = manualServiceSelect.value;
  const dateStr = dateInput.value;

  manualTimeSelect.innerHTML = '<option value="">Selecione o Horário...</option>';
  manualTimeSelect.disabled = true;
  btnConfirmManual.disabled = true;

  if (!profId || !serviceId || !workingHours.length) return;

  const service = servicesData.find(s => s.id === serviceId);
  if (!service) return;

  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");
  
  let slots = generateDynamicSlots(workingHours, profAppointments, service.duration);

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  
  if (dateStr === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    slots = slots.filter(time => {
      if (!time) return false;
      const parts = time.split(":");
      return (Number(parts[0]) * 60 + Number(parts[1])) > currentMinutes;
    });
  }

  if (slots.length === 0) {
    manualTimeSelect.innerHTML = '<option value="">Sem horários livres</option>';
    return;
  }

  slots.forEach(time => {
    const opt = document.createElement("option");
    opt.value = time;
    opt.textContent = time;
    manualTimeSelect.appendChild(opt);
  });

  manualTimeSelect.disabled = false;
}

btnConfirmManual.addEventListener("click", async () => {
  const clientName = manualClientName.value.trim() || "Cliente Balcão";
  const clientPhone = manualClientPhone.value.trim().replace(/[^\d]/g, "") || "";
  const profId = manualProfSelect.value;
  const serviceId = manualServiceSelect.value;
  const time = manualTimeSelect.value;
  const dateStr = dateInput.value;

  if (!profId || !serviceId || !time) return alert("Preencha Barbeiro, Serviço e Horário.");

  const service = servicesData.find(s => s.id === serviceId);

  btnConfirmManual.textContent = "Agendando...";
  btnConfirmManual.disabled = true;

  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + service.duration; 
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
      clientName: clientName,
      clientPhone: clientPhone,
      serviceName: service.name,
      servicePrice: service.price,
      status: "confirmed"
    });

    manualClientName.value = "";
    manualClientPhone.value = "";
    manualProfSelect.value = "";
    manualServiceSelect.value = "";
    updateManualSlots();
    
    document.getElementById('secaoManual').style.display = 'none';
    document.getElementById('btnToggleManual').innerHTML = '➕ Novo Agendamento (Balcão)';

  } catch (error) {
    console.error(error);
    alert("Erro ao criar agendamento manual.");
  } finally {
    btnConfirmManual.textContent = "Confirmar Agendamento";
    btnConfirmManual.disabled = false;
  }
});

document.getElementById('btnToggleManual').addEventListener('click', function() {
  const secao = document.getElementById('secaoManual');
  if (secao.style.display === 'none') {
      secao.style.display = 'block';
      this.innerHTML = '🔼 Ocultar Formulário';
  } else {
      secao.style.display = 'none';
      this.innerHTML = '➕ Novo Agendamento (Balcão)';
  }
});

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
  let slots = generateDynamicSlots(workingHours, profAppointments, 30); 

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dateStr === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    slots = slots.filter(time => {
      if (!time) return false; 
      const parts = time.split(":");
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
    } catch (error) {
      console.error(error);
      alert("Erro ao bloquear a agenda.");
    } finally {
      btnConfirmBlock.textContent = "Bloquear Selecionado";
    }
  });
}

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

const btnBlockWholeDay = document.getElementById("btnBlockWholeDay");
if (btnBlockWholeDay) {
  btnBlockWholeDay.addEventListener("click", async () => {
    const profId = blockProfSelect.value;
    const dateStr = dateInput.value;

    if (!profId) return alert("Aguarde os profissionais carregarem.");

    const clientesAgendados = allAppointmentsForDay.filter(a => 
      a.professionalId === profId && 
      a.status === "confirmed" && 
      a.clientName !== "⛔ BLOQUEIO DE AGENDA"
    );

    let mensagemConfirmacao = `Tem certeza que deseja FECHAR A AGENDA O DIA INTEIRO neste dia? Ninguém conseguirá marcar horários.`;

    if (clientesAgendados.length > 0) {
      mensagemConfirmacao = `⚠️ ALERTA CRÍTICO: Existem ${clientesAgendados.length} cliente(s) já agendado(s) para este barbeiro neste dia!\n\nBloquear o dia inteiro NÃO cancela os agendamentos já feitos. Você precisará cancelar manualmente ou avisar os clientes.\n\nTem CERTEZA ABSOLUTA que deseja fechar a agenda mesmo assim?`;
    }

    if (confirm(mensagemConfirmacao)) {
      
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