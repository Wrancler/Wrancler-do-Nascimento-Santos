import { getAuth, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";
import { createAppointment } from "../../firebase/createAppointment.js";
import { generateAvailableSlots } from "../../services/slotGenerator.js"; 

function getParam(name) { return new URLSearchParams(window.location.search).get(name); }

const tenantId = getParam("tenant") || "biel-do-corte";

let workingHours = [];
let allAppointmentsForDay = []; 
let servicesData = []; 
let currentSnapshotUnsubscribe = null;
let profissionaisConfig = [];
let adminPinConfig = "";
let tenantVencimento = null; // 🔥 Guarda a data de vencimento globalmente

let loggedRole = sessionStorage.getItem("loggedRole") || null; 
let loggedName = sessionStorage.getItem("loggedName") || null;

initDashboard();

document.getElementById("btnSwitchUser").addEventListener("click", () => {
  sessionStorage.removeItem("loggedRole");
  sessionStorage.removeItem("loggedName");
  window.location.reload();
});

const btnFinanceiro = document.getElementById("btnFinanceiro");
if (btnFinanceiro) {
  btnFinanceiro.addEventListener("click", () => {
    sessionStorage.setItem("crachaFinanceiro", adminPinConfig); 
    window.location.href = `financeiro.html?tenant=${encodeURIComponent(tenantId)}`;
  });
}

const loginUserSelect = document.getElementById("loginUserSelect");
const loginPinInput = document.getElementById("loginPinInput");
const btnUnlock = document.getElementById("btnUnlock");
const loginError = document.getElementById("loginError");
const lockScreen = document.getElementById("lockScreen");

// 🔥 NOVO: CONFIGURAÇÕES DO SEU SAAS 
const MEU_WHATSAPP = "5583996675179"; // <-- número
const VALOR_MENSALIDADE = "R$ 35,00"; // <-- valor da assinatura
const MINHA_CHAVE_PIX = "wranclernascimento@gmail.com"; // <-- CHAVE PIX 

async function initDashboard() {
  try {
    const config = await getTenantConfig(tenantId);
    workingHours = config.workingHours || [];
    servicesData = config.services || [];
    profissionaisConfig = config.professionals || [];
    adminPinConfig = config.financePin || "0000";
    
    // Apenas guarda a data, não roda a verificação ainda
    tenantVencimento = config.vencimento || null;

    profissionaisConfig.forEach(p => {
      if (p.isOwner === true) return; 
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

// 🔥 LÓGICA DE FATURAMENTO COM INTELIGÊNCIA DE CARGOS
function verificarFaturamento(vencimentoStr, cargoAtual) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0); 

  const partesData = vencimentoStr.split('/');
  const dia = partesData[0];
  const mes = partesData[1];
  const ano = partesData[2];
  const dataVencimento = new Date(ano, mes - 1, dia);
  
  const diffTime = dataVencimento.getTime() - hoje.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const billingModal = document.getElementById("billingModal");
  const billingTitle = document.getElementById("billingTitle");
  const billingMessage = document.getElementById("billingMessage");
  const btnLembrarDepois = document.getElementById("btnLembrarDepois");
  const btnPagarAgora = document.getElementById("btnPagarAgora");

  // ==========================================
  // REGRA 1: SE FOR COLABORADOR
  // ==========================================
  if (cargoAtual !== "admin") {
    if (diffDays < 0) {
      // Bloqueio Cego (Sem valores, sem botões)
      billingTitle.textContent = "Sistema Suspenso";
      billingTitle.style.color = "#ff5555";
      document.getElementById("billingIcon").textContent = "🔒";
      document.querySelector(".lock-box").style.borderColor = "#ff5555";
      billingMessage.textContent = "O sistema está temporariamente indisponível. Por favor, solicite ao Gestor da barbearia que verifique a licença.";
      
      if(btnPagarAgora) btnPagarAgora.style.display = "none";
      if(btnLembrarDepois) btnLembrarDepois.style.display = "none";
      
      setTimeout(() => { billingModal.classList.add("is-open"); }, 2000);
    }
    // Se faltarem 5 dias, não faz nada. O colaborador não recebe aviso.
    return; 
  }

  // ==========================================
  // REGRA 2: SE FOR O GESTOR (ADMIN)
  // ==========================================
  const pixValorDisplay = document.getElementById("pixValorDisplay");
  const pixKeyInput = document.getElementById("pixKeyInput");
  
  if(pixValorDisplay) pixValorDisplay.textContent = VALOR_MENSALIDADE;
  if(pixKeyInput) pixKeyInput.value = MINHA_CHAVE_PIX;

  if(btnPagarAgora) {
    btnPagarAgora.onclick = () => {
      document.getElementById("billingState1").style.display = "none";
      document.getElementById("billingState2").style.display = "block";
      billingTitle.textContent = "Pagamento via PIX";
      billingTitle.style.color = "#e0b976";
      document.getElementById("billingIcon").textContent = "💳";
      document.querySelector(".lock-box").style.borderColor = "#e0b976";
    };
  }

  const btnCopyPix = document.getElementById("btnCopyPix");
  if(btnCopyPix) {
    btnCopyPix.onclick = () => {
      const pixInput = document.getElementById("pixKeyInput");
      pixInput.select();
      pixInput.setSelectionRange(0, 99999); 
      navigator.clipboard.writeText(pixInput.value).then(() => {
        btnCopyPix.textContent = "Copiado! ✅";
        btnCopyPix.style.background = "#4CAF50";
        btnCopyPix.style.borderColor = "#4CAF50";
        setTimeout(() => {
          btnCopyPix.textContent = "Copiar";
          btnCopyPix.style.background = "#333";
          btnCopyPix.style.borderColor = "#444";
        }, 5000);
      });
    };
  }

  const btnEnviarComprovante = document.getElementById("btnEnviarComprovante");
  if(btnEnviarComprovante) {
    btnEnviarComprovante.onclick = () => {
      const msg = `Fala Wrancler! Já fiz o PIX de ${VALOR_MENSALIDADE}. Segue o comprovante de renovação da barbearia *${tenantId}*.`;
      window.open(`https://api.whatsapp.com/send?phone=${MEU_WHATSAPP}&text=${encodeURIComponent(msg)}`, '_blank');
    };
  }

  if(btnLembrarDepois) {
    btnLembrarDepois.onclick = () => {
      sessionStorage.setItem("billingDismissed", "true");
      billingModal.classList.remove("is-open");
    };
  }

  if (diffDays < 0) {
    // BLOQUEIO DO GESTOR
    billingTitle.textContent = "Sistema Suspenso";
    billingTitle.style.color = "#ff5555";
    document.getElementById("billingIcon").textContent = "🔒";
    document.querySelector(".lock-box").style.borderColor = "#ff5555";
    billingMessage.textContent = `Sua licença expirou há ${Math.abs(diffDays)} dias. Efetue o pagamento de ${VALOR_MENSALIDADE} para reativar seu acesso e a agenda dos seus clientes.`;
    if(btnLembrarDepois) btnLembrarDepois.style.display = "none"; 
    
    setTimeout(() => { billingModal.classList.add("is-open"); }, 7000);
  } 
  else if (diffDays <= 5) {
    // AVISO DO GESTOR
    if (sessionStorage.getItem("billingDismissed") !== "true") {
      billingTitle.textContent = "Renovação Próxima";
      document.getElementById("billingIcon").textContent = "⚠️";
      if (diffDays === 0) {
         billingMessage.textContent = `A sua licença do sistema vence HOJE! Garanta que seus clientes continuem agendando.`;
      } else {
         billingMessage.textContent = `Sua licença do sistema vence em ${diffDays} dia(s). Não deixe a sua agenda parar.`;
      }
      
      setTimeout(() => { billingModal.classList.add("is-open"); }, 7000);
    }
  }
}

btnUnlock.addEventListener("click", () => {
  const userSelecionado = loginUserSelect.value;
  const pinDigitado = loginPinInput.value;

  if (userSelecionado === "admin" && pinDigitado === adminPinConfig) {
    liberarAcesso("admin", "Gestor Geral");
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
  loggedRole = role; loggedName = name;
  lockScreen.style.opacity = "0";
  setTimeout(() => { lockScreen.style.display = "none"; aplicarPermissoesDeAcesso(); }, 300);
}

const blockProfSelect = document.getElementById("blockProf");
const mainProfFilter = document.getElementById("mainProfFilter"); 
const manualProfSelect = document.getElementById("manualProf");
const btnConfig = document.getElementById("btnConfig");

function aplicarPermissoesDeAcesso() {
  document.getElementById("tagCargo").textContent = loggedRole === "admin" ? "Acesso Gestor" : `Acesso: ${loggedName}`;

  blockProfSelect.innerHTML = ""; manualProfSelect.innerHTML = ""; mainProfFilter.innerHTML = "";

  if (loggedRole === "admin") {
    btnFinanceiro.style.display = "block";
    btnConfig.style.display = "block";
    mainProfFilter.style.display = "block";
    
    mainProfFilter.innerHTML = '<option value="todos">Todos os Barbeiros</option>';
    manualProfSelect.innerHTML = '<option value="">Selecione o Barbeiro...</option>';
    blockProfSelect.innerHTML = '<option value="">Selecione o Barbeiro...</option>';

    profissionaisConfig.forEach(p => {
      mainProfFilter.appendChild(new Option(p.name, p.id));
      manualProfSelect.appendChild(new Option(p.name, p.id));
      blockProfSelect.appendChild(new Option(p.name, p.id));
    });

    renderConfigPanel();
  } else {
    btnFinanceiro.style.display = "none"; btnConfig.style.display = "none"; mainProfFilter.style.display = "none";
    mainProfFilter.appendChild(new Option(loggedName, loggedRole));
    manualProfSelect.appendChild(new Option(loggedName, loggedRole));
    blockProfSelect.appendChild(new Option(loggedName, loggedRole));
  }

  document.getElementById("manualService").innerHTML = '<option value="">Selecione o Serviço...</option>';
  servicesData.forEach(s => { document.getElementById("manualService").appendChild(new Option(`${s.name} - R$${s.price}`, s.id)); });

  blockProfSelect.addEventListener("change", renderBlockSlots);
  mainProfFilter.addEventListener("change", renderAppointmentsList);
  manualProfSelect.addEventListener("change", updateManualSlots);
  document.getElementById("manualService").addEventListener("change", updateManualSlots);
  document.getElementById("manualTime").addEventListener("change", () => { document.getElementById("btnConfirmManual").disabled = !document.getElementById("manualTime").value; });

  renderAdminDateCards();

  // 🔥 RODA A VERIFICAÇÃO DE COBRANÇA DEPOIS DE VALIDAR QUEM LOGOU
  if (tenantVencimento) {
    verificarFaturamento(tenantVencimento, loggedRole);
  }
}

const configSection = document.getElementById("configSection");
const agendaSection = document.getElementById("agendaSection");
const listaSection = document.getElementById("listaSection");

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

  profissionaisConfig.forEach(p => {
    teamList.innerHTML += `
      <div class="config-list-item">
        <div><strong>${p.name}</strong><br><span>${p.isOwner ? '👑 Gestor' : '✂️ Colaborador'}</span></div>
        <div style="color: #4CAF50; font-size: 12px;">Ativo</div>
      </div>`;
  });

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
    
    if (mostrarAlerta) {
        alert("Configurações atualizadas com sucesso!");
    }
    
    document.getElementById("btnAddNewService").textContent = "+ Adicionar Novo Serviço";
    renderConfigPanel(); 
  } catch(e) {
    alert("Erro ao gravar. Tente novamente.");
    console.error(e);
  }
}

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

    allAppointmentsForDay.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

    renderBlockSlots(); 
    updateManualSlots(); 
    renderAppointmentsList(); 
  });
}

function renderAppointmentsList() {
  listDiv.innerHTML = "";
  const profFiltro = mainProfFilter.value;

  let appsToRender = allAppointmentsForDay;
  
  if (profFiltro !== "todos") {
    appsToRender = allAppointmentsForDay.filter(a => a.professionalId === profFiltro);
  }

  appsToRender = appsToRender.filter(a => !(a.clientName === "⛔ BLOQUEIO DE AGENDA" && a.status === "cancelled"));

  let totalAgendamentos = 0;
  let totalFaturamento = 0;
  let totalFinalizados = 0;

  appsToRender.forEach(app => {
    const isBlock = app.clientName === "⛔ BLOQUEIO DE AGENDA";
    const isCancelled = app.status === "cancelled";
    const isCompleted = app.status === "completed";

    if (!isBlock && !isCancelled) {
      totalAgendamentos++;
      totalFaturamento += (Number(app.servicePrice) || 0);
      if (isCompleted) totalFinalizados++;
    }
  });

  document.getElementById("metricAgendamentos").textContent = totalAgendamentos;
  document.getElementById("metricFaturamento").textContent = `R$ ${totalFaturamento}`;
  document.getElementById("metricFinalizados").textContent = totalFinalizados;


  if (appsToRender.length === 0) {
    totalHead.textContent = "Nenhum agendamento.";
    listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Agenda livre.</p>";
    return;
  }

  totalHead.textContent = `${appsToRender.length} compromisso(s)`;

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
        
        if (app.clientPhone && app.clientPhone.replace(/\D/g, '').length >= 10) {
          actionsDiv.innerHTML += `<button class="premium-btn-secondary" style="margin:0; padding:10px; color:#25D366; border-color:#25D366; background: rgba(37, 211, 102, 0.05);" onclick="lembrarApp('${app.clientName}', '${app.serviceName}', '${app.date}', '${app.startTime}', '${app.clientPhone}')">🔔 Lembrar</button>`;
        }
      }
      actionsDiv.innerHTML += `<button class="premium-btn-danger" style="margin:0; padding:10px;" onclick="cancelarApp('${app.id}', ${isBlock})">${isBlock ? 'Desbloquear' : 'Cancelar'}</button>`;
    }
    item.appendChild(actionsDiv);
    listDiv.appendChild(item);
  });
}

async function limparTravasDoAgendamento(appointmentId) {
  try {
    const lockQuery = query(collection(db, "slotLocks"), where("appointmentId", "==", appointmentId));
    const lockSnapshot = await getDocs(lockQuery);
    lockSnapshot.forEach(async (documento) => {
      await deleteDoc(doc(db, "slotLocks", documento.id));
    });

    const publicQuery = query(collection(db, "appointmentsPublic"), where("appointmentId", "==", appointmentId));
    const publicSnapshot = await getDocs(publicQuery);
    publicSnapshot.forEach(async (documento) => {
      await deleteDoc(doc(db, "appointmentsPublic", documento.id));
    });
  } catch (error) {
    console.error("Erro ao limpar travas do Firebase:", error);
  }
}

window.excluirApp = async (id) => { 
  if (confirm("Limpar da tela definitivamente?")) {
    await deleteDoc(doc(db, "appointments", id)); 
    await limparTravasDoAgendamento(id); 
  }
};

window.finalizarApp = async (id) => { 
  if (confirm("Marcar como concluído?")) {
    await updateDoc(doc(db, "appointments", id), { status: "completed" }); 
    await limparTravasDoAgendamento(id); 
  }
};

window.cancelarApp = async (id, isBlock) => { 
  if (confirm(isBlock ? "Liberar horário?" : "Cancelar cliente?")) {
    await updateDoc(doc(db, "appointments", id), { status: "cancelled" }); 
    await limparTravasDoAgendamento(id); 
  }
};

window.lembrarApp = (nome, servico, data, hora, telefone) => {
    let phoneLimpo = telefone.replace(/\D/g, '');
    if (phoneLimpo.length <= 11) phoneLimpo = "55" + phoneLimpo;
    
    const dataFormatada = data.split("-").reverse().join("/");
    let msg = '';
    
    const hoje = new Date();
    const dataHojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    
    if (data === dataHojeStr) {
        msg = `Olá *${nome}*! Passando para confirmar o seu horário de *${servico}* HOJE às *${hora}*. Tudo certo? 👍`;
    } else {
        msg = `Olá *${nome}*! Passando para lembrar do seu horário de *${servico}* amanhã (${dataFormatada}) às *${hora}*. Confirmado? 👍`;
    }
    
    window.open(`https://api.whatsapp.com/send?phone=${phoneLimpo}&text=${encodeURIComponent(msg)}`, '_blank');
};

function addMinutes(time, minsToAdd) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minsToAdd;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function updateManualSlots() {
  const profId = manualProfSelect.value; 
  const serviceId = document.getElementById("manualService").value;
  const timeSelect = document.getElementById("manualTime"); 
  timeSelect.innerHTML = '<option value="">Horário...</option>';
  document.getElementById("btnConfirmManual").disabled = true;

  if (!profId || !serviceId) return;
  const service = servicesData.find(s => s.id === serviceId);
  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");
  
  let slots = generateAvailableSlots(workingHours, profAppointments, service.duration);
  
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

  const payload = {
    tenantId: tenantId,
    professionalId: manualProfSelect.value,
    serviceName: service.name,
    servicePrice: service.price,
    date: dateInput.value,
    startTime: time,
    endTime: addMinutes(time, service.duration),
    clientName: document.getElementById("manualClientName").value || "Cliente Balcão",
    clientPhone: document.getElementById("manualClientPhone").value.replace(/[^\d]/g, ""),
    status: "confirmed"
  };

  try {
    await createAppointment(payload);
    document.getElementById('secaoManual').style.display = 'none';
  } catch (e) {
    alert("Erro ao marcar manualmente: " + e.message);
  } finally {
    btn.textContent = "Confirmar"; btn.disabled = false;
  }
});

function renderBlockSlots() {
  const profId = blockProfSelect.value; const blockSlotsDiv = document.getElementById("blockSlots");
  blockSlotsDiv.innerHTML = ""; document.getElementById("btnConfirmBlock").disabled = true;
  if (!profId) return;

  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");
  let slots = generateAvailableSlots(workingHours, profAppointments, 40); 
  
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
  
  const payload = {
    tenantId: tenantId,
    professionalId: blockProfSelect.value,
    serviceName: "Bloqueio Manual",
    servicePrice: 0,
    date: dateInput.value,
    startTime: time,
    endTime: addMinutes(time, 40),
    clientName: "⛔ BLOQUEIO DE AGENDA",
    clientPhone: "",
    status: "confirmed"
  };

  await createAppointment(payload);
});

document.getElementById("btnBlockWholeDay").addEventListener("click", async () => {
  if (confirm("Fechar o dia inteiro?")) {
    const payload = {
      tenantId: tenantId,
      professionalId: blockProfSelect.value,
      serviceName: "Dia Fechado",
      servicePrice: 0,
      date: dateInput.value,
      startTime: "00:00",
      endTime: "23:59",
      clientName: "⛔ BLOQUEIO DE AGENDA",
      clientPhone: "",
      status: "confirmed"
    };
    await createAppointment(payload);
  }
});

document.getElementById('btnToggleManual').onclick = function() {
  const s = document.getElementById('secaoManual'); s.style.display = s.style.display === 'none' ? 'block' : 'none';
};
document.getElementById('btnToggleBloqueio').onclick = function() {
  const s = document.getElementById('secaoBloqueio'); s.style.display = s.style.display === 'none' ? 'block' : 'none';
};