import { collection, query, where, getDocs, doc, updateDoc, addDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";

function getParam(name) { return new URLSearchParams(window.location.search).get(name); }
const tenantId = getParam("tenant") || "tenant-demo";

// 🔥 CONFIGURAÇÕES DO SAAS PARA COBRANÇA
const MEU_WHATSAPP = "5583996675179"; 
const VALOR_MENSALIDADE = "R$ 35,00"; 
const MINHA_CHAVE_PIX = "wranclernascimento@gmail.com"; 

let workingHours = [];
let allAppointmentsForDay = []; 
let selectedBlockTime = null; 
let currentSnapshotUnsubscribe = null;
let servicesData = []; 
let profissionaisConfig = []; 

initDashboard();

const btnFinanceiro = document.getElementById("btnFinanceiro");
if (btnFinanceiro) {
  btnFinanceiro.addEventListener("click", async () => {
    const config = await getTenantConfig(tenantId);
    const pinDigitado = prompt("🔒 Digite o PIN do Gestor para aceder ao Financeiro:");
    if (pinDigitado === null) return; 
    if (config.financePin && pinDigitado === String(config.financePin)) {
      sessionStorage.setItem("crachaFinanceiro", pinDigitado);
      window.location.href = `financeiro.html?tenant=${encodeURIComponent(tenantId)}`;
    } else {
      alert("❌ Senha incorreta! Acesso negado.");
    }
  });
}

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
    profissionaisConfig = config.professionals || []; 
    
    // 🔥 GATILHO DE FATURAÇÃO COM DELAY
    if (config.vencimento) {
      verificarFaturamento(config.vencimento);
    } else {
      console.log("[SaaS] Nenhuma data de vencimento encontrada no Firebase para este cliente.");
    }

    blockProfSelect.innerHTML = '<option value="">A carregar profissionais...</option>';
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
    
    renderConfigPanel();
  } catch(e) { console.error("Erro config", e); }

  blockProfSelect.addEventListener("change", renderBlockSlots);
  if (mainProfFilter) mainProfFilter.addEventListener("change", renderAppointmentsList);
  manualProfSelect.addEventListener("change", updateManualSlots);
  manualServiceSelect.addEventListener("change", updateManualSlots);
  manualTimeSelect.addEventListener("change", () => { btnConfirmManual.disabled = !manualTimeSelect.value; });

  renderAdminDateCards();
}

// 🔥 LÓGICA DO POP-UP DE FATURAÇÃO SAAS
function verificarFaturamento(vencimentoStr) {
  const hoje = new Date(); 
  hoje.setHours(0, 0, 0, 0); 
  const partesData = vencimentoStr.split('/');
  const dataVencimento = new Date(partesData[2], partesData[1] - 1, partesData[0]);
  const diffTime = dataVencimento.getTime() - hoje.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  console.log(`[SaaS] Vencimento em: ${vencimentoStr}. Faltam: ${diffDays} dias.`);

  const billingModal = document.getElementById("billingModal");
  const billingTitle = document.getElementById("billingTitle");
  const billingMessage = document.getElementById("billingMessage");
  const btnLembrarDepois = document.getElementById("btnLembrarDepois");
  const btnPagarAgora = document.getElementById("btnPagarAgora");

  if(document.getElementById("pixValorDisplay")) document.getElementById("pixValorDisplay").textContent = VALOR_MENSALIDADE;
  if(document.getElementById("pixKeyInput")) document.getElementById("pixKeyInput").value = MINHA_CHAVE_PIX;

  if(btnPagarAgora) {
    btnPagarAgora.onclick = () => {
      document.getElementById("billingState1").style.display = "none";
      document.getElementById("billingState2").style.display = "block";
      billingTitle.textContent = "Pagamento via PIX"; 
      billingTitle.style.color = "#e0b976";
      document.getElementById("billingIcon").textContent = "💳"; 
      document.querySelector("#billingModal .premium-sheet").style.borderColor = "#e0b976";
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
      const msg = `Olá Wrancler! Já efetuei o PIX de ${VALOR_MENSALIDADE}. Segue o comprovativo de renovação da barbearia *${tenantId}*.`;
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
    // Bloqueio Total após o vencimento
    billingTitle.textContent = "Sistema Suspenso"; 
    billingTitle.style.color = "#ff5555"; 
    document.getElementById("billingIcon").textContent = "🔒";
    document.querySelector("#billingModal .premium-sheet").style.borderColor = "#ff5555";
    billingMessage.textContent = `A sua licença expirou há ${Math.abs(diffDays)} dias. Efetue o pagamento de ${VALOR_MENSALIDADE} para reativar o acesso.`;
    if(btnLembrarDepois) btnLembrarDepois.style.display = "none"; 
    
    // 🔥 DELAY DE 5 SEGUNDOS
    setTimeout(() => { billingModal.classList.add("is-open"); }, 5000); 
  } 
  else if (diffDays <= 5) {
    // Aviso prévio de renovação
    if (sessionStorage.getItem("billingDismissed") !== "true") {
      billingTitle.textContent = "Renovação Próxima"; 
      document.getElementById("billingIcon").textContent = "⚠️";
      if (diffDays === 0) billingMessage.textContent = `A licença do sistema vence HOJE!`;
      else billingMessage.textContent = `A sua licença do sistema vence em ${diffDays} dia(s).`;
      
      // 🔥 DELAY DE 5 SEGUNDOS
      setTimeout(() => { billingModal.classList.add("is-open"); }, 5000); 
    } else {
      console.log("[SaaS] O usuário clicou em 'Lembrar Depois' recentemente. Ocultando pop-up nesta sessão.");
    }
  }
}

// ==========================================
// CÓDIGO ORIGINAL DA AGENDA ABAIXO (INTACTO)
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

  profissionaisConfig.forEach(p => {
    teamList.innerHTML += `
      <div class="config-list-item">
        <div><strong>${p.name}</strong><br><span>👑 Gestor/Barbeiro</span></div>
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

  servicesData.push({ id: newId, name: nome, price: Number(preco), duration: Number(duracao), image: imageUrl });
  
  await salvarConfiguracoes(false);
  imageSheetOverlay.classList.add("is-open");
  document.getElementById("btnAddNewService").textContent = "+ Adicionar Novo Serviço";
});

sheetBtnGaleria.addEventListener("click", () => {
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*'; 
  input.onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    sheetBtnGaleria.textContent = "A processar..."; imageSheetOverlay.classList.remove("is-open"); 

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas'); const MAX_WIDTH = 300; const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL('image/jpeg', 0.7); 
        
        const index = servicesData.findIndex(s => s.id === currentNewServiceId);
        if (index !== -1) { servicesData[index].image = base64Image; await salvarConfiguracoes(true); }
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
});

async function salvarConfiguracoes(mostrarAlerta = true) {
  try {
    document.getElementById("btnAddNewService").textContent = "A gravar...";
    await updateDoc(doc(db, "tenants", tenantId), { services: servicesData });
    if (mostrarAlerta) alert("Configurações atualizadas com sucesso!");
    document.getElementById("btnAddNewService").textContent = "+ Adicionar Novo Serviço";
    renderConfigPanel(); 
  } catch(e) { console.error(e); }
}

function renderAdminDateCards() {
  const dateSlider = document.getElementById("adminDateSlider");
  if (!dateSlider) return;
  dateSlider.innerHTML = "";

  const today = new Date();
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  for (let i = -3; i <= 14; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const year = d.getFullYear(); const month = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    const card = document.createElement("div"); card.className = "date-card";
    
    if (i === 0) { card.classList.add("is-selected"); dateInput.value = isoDate; loadAppointments(isoDate); }

    card.innerHTML = `<span class="date-card__weekday">${i === 0 ? "HOJE" : diasSemana[d.getDay()]}</span><span class="date-card__day">${String(d.getDate()).padStart(2, '0')}</span><span class="date-card__month">${meses[d.getMonth()]}</span>`;

    card.addEventListener("click", () => {
      document.querySelectorAll("#adminDateSlider .date-card").forEach(c => c.classList.remove("is-selected"));
      card.classList.add("is-selected"); dateInput.value = isoDate; loadAppointments(isoDate);
    });

    dateSlider.appendChild(card);
  }

  setTimeout(() => {
    const selected = dateSlider.querySelector('.is-selected');
    if(selected) selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, 100);
}

function loadAppointments(dateStr) {
  listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>A buscar horários...</p>";
  totalHead.textContent = "Aguarde...";

  if (currentSnapshotUnsubscribe) currentSnapshotUnsubscribe();

  try {
    const q = query(collection(db, "appointments"), where("tenantId", "==", tenantId), where("date", "==", dateStr));

    currentSnapshotUnsubscribe = onSnapshot(q, (snap) => {
      allAppointmentsForDay = []; 
      snap.forEach(d => allAppointmentsForDay.push({ id: d.id, ...d.data() }));

      allAppointmentsForDay = allAppointmentsForDay.filter(a => {
        if (!a || !a.startTime) return false;
        if (a.clientName === "⛔ BLOQUEIO DE AGENDA" && a.status === "cancelled") return false;
        return true;
      });
      
      allAppointmentsForDay.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));

      renderBlockSlots(); updateManualSlots(); renderAppointmentsList(); 
    }, (error) => {
      console.error("Erro no tempo real:", error); listDiv.innerHTML = `<p style='color: #ff5555; text-align: center;'>Erro: ${error.message}</p>`;
    });
  } catch (error) { console.error("Erro:", error); }
}

function renderAppointmentsList() {
  listDiv.innerHTML = "";
  const profFiltro = mainProfFilter ? mainProfFilter.value : "todos";

  let appsToRender = allAppointmentsForDay;
  if (profFiltro !== "todos") appsToRender = allAppointmentsForDay.filter(a => a.professionalId === profFiltro);

  if (appsToRender.length === 0) {
    totalHead.textContent = "Nenhum agendamento."; listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Nenhum horário encontrado para este filtro.</p>"; return;
  }

  totalHead.textContent = `${appsToRender.length} agendamento(s)`;

  appsToRender.forEach(app => {
    const item = document.createElement("div"); item.className = "admin-item";

    const isCancelled = app.status === "cancelled"; const isCompleted = app.status === "completed"; const isBlock = app.clientName === "⛔ BLOQUEIO DE AGENDA";
    
    let timeColor = "#e0b976"; let timeText = app.startTime;

    if (isCancelled) { timeColor = "#ff5555"; timeText = `${app.startTime} (Cancelado)`; } 
    else if (isCompleted) { timeColor = "#4CAF50"; timeText = `${app.startTime} (Finalizado)`; item.style.opacity = "0.6"; item.style.borderLeft = "4px solid #4CAF50"; } 
    else if (isBlock) { timeColor = "#888888"; }

    const profIdSeguro = app.professionalId || "desconhecido"; const profName = profIdSeguro.charAt(0).toUpperCase() + profIdSeguro.slice(1);

    if (isBlock) {
      item.style.borderLeft = "4px solid #888"; item.style.opacity = "0.8";
      item.innerHTML = `
        <div class="admin-item__top"><div class="admin-item__time" style="color: ${timeColor};">${timeText} - ${app.endTime || '--:--'}</div><div class="admin-item__prof">${profName}</div></div>
        <div class="admin-item__client" style="color: #ff5555; font-weight: bold;">⛔ HORÁRIO FECHADO</div>
        <div class="admin-item__service">Bloqueado manualmente pelo Admin</div>`;
    } else {
      item.innerHTML = `
        <div class="admin-item__top"><div class="admin-item__time" style="color: ${timeColor};">${timeText}</div><div class="admin-item__prof">${profName}</div></div>
        <div class="admin-item__client">${app.clientName || 'Sem Nome'} <br> <span style="font-size: 0.85rem; color: #aaa;">${app.clientPhone || ''}</span></div>
        <div class="admin-item__service">${app.serviceName || 'Serviço'}</div>`;
    }

    const actionsDiv = document.createElement("div"); 
    actionsDiv.className = "admin-item__actions"; 
    actionsDiv.style.display = "flex"; 
    actionsDiv.style.gap = "8px";

    if (isCompleted) {
      actionsDiv.innerHTML = `<span style="color: #4CAF50; font-weight: bold; font-size: 14px; padding: 8px 0;">✅ Serviço Finalizado</span>`;
    } else if (isCancelled) {
      let buttonsHTML = `<button class="btn-admin btn-admin--cancel" style="background: #ff3333; color: white; flex: 1;" onclick="excluirApp('${app.id}', this)">🗑️ Excluir da Tela</button>`;
      actionsDiv.innerHTML = buttonsHTML;
    } else {
      let buttonsHTML = "";
      if (!isBlock) {
        buttonsHTML += `<button class="btn-admin" style="background: #4CAF50; color: white; flex: 1;" onclick="finalizarApp('${app.id}', this)">✅ Finalizar</button>`;
        if (app.clientPhone && app.clientPhone.replace(/\D/g, '').length >= 10) {
          buttonsHTML += `<button class="btn-admin" style="background: rgba(37, 211, 102, 0.1); color: #25D366; border: 1px solid #25D366; flex: 1;" onclick="lembrarApp('${app.clientName}', '${app.serviceName}', '${app.date}', '${app.startTime}', '${app.clientPhone}')">🔔 Lembrar</button>`;
        }
      }
      buttonsHTML += `<button class="btn-admin btn-admin--cancel" style="flex: 1;" onclick="cancelarApp('${app.id}', ${isBlock}, this)">${isBlock ? 'Desbloquear Horário' : 'Cancelar'}</button>`;
      actionsDiv.innerHTML = buttonsHTML;
    }
    
    item.appendChild(actionsDiv); 
    listDiv.appendChild(item);
  });
}

window.excluirApp = async (id, btn) => { 
  btn.textContent = "A apagar..."; btn.disabled = true;
  await deleteDoc(doc(db, "appointments", id)); 
};

window.finalizarApp = async (id, btn) => { 
  btn.textContent = "Aguarde..."; btn.disabled = true;
  await updateDoc(doc(db, "appointments", id), { status: "completed" }); 
};

window.cancelarApp = async (id, isBlock, btn) => { 
  btn.textContent = "Aguarde..."; btn.disabled = true;
  await updateDoc(doc(db, "appointments", id), { status: "cancelled" }); 
};

window.lembrarApp = (nome, servico, data, hora, telefone) => {
    let phoneLimpo = telefone.replace(/\D/g, '');
    if (phoneLimpo.length <= 11) phoneLimpo = "55" + phoneLimpo;
    const dataFormatada = data.split("-").reverse().join("/");
    let msg = ''; const hoje = new Date(); const dataHojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
    if (data === dataHojeStr) { msg = `Olá *${nome}*! Passando para confirmar o seu horário de *${servico}* HOJE às *${hora}*. Tudo certo? 👍`; } 
    else { msg = `Olá *${nome}*! Passando para lembrar do seu horário de *${servico}* amanhã (${dataFormatada}) às *${hora}*. Confirmado? 👍`; }
    window.open(`https://api.whatsapp.com/send?phone=${phoneLimpo}&text=${encodeURIComponent(msg)}`, '_blank');
};

function generateDynamicSlots(workHours, apps, durationMinutes = 30) {
  const slots = [];
  if (!workHours || !Array.isArray(workHours)) return slots;

  const occupied = apps.map(app => {
    if (!app || !app.startTime) return null;
    let end = app.endTime;
    if (!end) { 
      try {
        const [h, m] = String(app.startTime).split(":").map(Number); const t = h * 60 + m + 40;
        end = `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`;
      } catch(e) { end = "23:59"; }
    }
    return { start: String(app.startTime), end: String(end) };
  }).filter(Boolean);

  const saltoDaAgenda = 40; 

  workHours.forEach(period => {
    if (!period || typeof period !== "string" || !period.includes("-")) return;
    const parts = period.split("-"); if (parts.length < 2) return;
    
    let [currH, currM] = parts[0].split(":").map(Number); const [endH, endM] = parts[1].split(":").map(Number);
    let currentTotal = currH * 60 + currM; const endTotal = endH * 60 + endM;

    while (currentTotal + durationMinutes <= endTotal) {
      const slotTime = `${String(Math.floor(currentTotal/60)).padStart(2,"0")}:${String(currentTotal%60).padStart(2,"0")}`;
      const slotEndTotal = currentTotal + durationMinutes;

      let hasCollision = false;
      for (let occ of occupied) {
        try {
          const [oSh, oSm] = occ.start.split(":").map(Number); const [oEh, oEm] = occ.end.split(":").map(Number);
          const occStart = oSh * 60 + oSm; const occEnd = oEh * 60 + oEm;
          if (currentTotal < occEnd && slotEndTotal > occStart) { hasCollision = true; break; }
        } catch(e) { } 
      }
      if (!hasCollision) slots.push(slotTime);
      currentTotal += saltoDaAgenda; 
    }
  });
  return slots;
}

function updateManualSlots() {
  const profId = manualProfSelect.value; const serviceId = manualServiceSelect.value; const dateStr = dateInput.value;
  manualTimeSelect.innerHTML = '<option value="">Selecione o Horário...</option>'; manualTimeSelect.disabled = true; btnConfirmManual.disabled = true;

  if (!profId || !serviceId || !workingHours.length) return;
  const service = servicesData.find(s => s.id === serviceId); if (!service) return;

  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");
  let slots = generateDynamicSlots(workingHours, profAppointments, service.duration);

  const now = new Date(); const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dateStr === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    slots = slots.filter(time => { if (!time) return false; const parts = time.split(":"); return (Number(parts[0]) * 60 + Number(parts[1])) > currentMinutes; });
  }

  if (slots.length === 0) { manualTimeSelect.innerHTML = '<option value="">Sem horários livres</option>'; return; }
  slots.forEach(time => { const opt = document.createElement("option"); opt.value = time; opt.textContent = time; manualTimeSelect.appendChild(opt); });
  manualTimeSelect.disabled = false;
}

btnConfirmManual.addEventListener("click", async () => {
  const clientName = manualClientName.value.trim() || "Cliente Balcão"; const clientPhone = manualClientPhone.value.trim().replace(/[^\d]/g, "") || "";
  const profId = manualProfSelect.value; const serviceId = manualServiceSelect.value; const time = manualTimeSelect.value; const dateStr = dateInput.value;

  if (!profId || !serviceId || !time) return alert("Preencha Barbeiro, Serviço e Horário.");
  const service = servicesData.find(s => s.id === serviceId);
  btnConfirmManual.textContent = "A agendar..."; btnConfirmManual.disabled = true;

  const [h, m] = time.split(":").map(Number); const total = h * 60 + m + service.duration; 
  const endH = String(Math.floor(total / 60)).padStart(2, "0"); const endM = String(total % 60).padStart(2, "0"); const endTime = `${endH}:${endM}`;

  try {
    await addDoc(collection(db, "appointments"), {
      tenantId: tenantId, professionalId: profId, date: dateStr, startTime: time, endTime: endTime,
      clientName: clientName, clientPhone: clientPhone, serviceName: service.name, servicePrice: service.price, status: "confirmed"
    });
    manualClientName.value = ""; manualClientPhone.value = ""; manualProfSelect.value = ""; manualServiceSelect.value = ""; updateManualSlots();
    document.getElementById('secaoManual').style.display = 'none'; document.getElementById('btnToggleManual').innerHTML = '➕ Novo Agendamento (Balcão)';
  } catch (error) { console.error(error); alert("Erro ao criar agendamento manual."); } 
  finally { btnConfirmManual.textContent = "Confirmar Horário"; btnConfirmManual.disabled = false; }
});

document.getElementById('btnToggleManual').addEventListener('click', function() {
  const secao = document.getElementById('secaoManual');
  if (secao.style.display === 'none') { secao.style.display = 'block'; this.innerHTML = '🔼 Ocultar Formulário'; } 
  else { secao.style.display = 'none'; this.innerHTML = '➕ Novo Agendamento (Balcão)'; }
});

function renderBlockSlots() {
  const profId = blockProfSelect.value; const blockSlotsDiv = document.getElementById("blockSlots"); const btnConfirmBlock = document.getElementById("btnConfirmBlock"); const dateStr = dateInput.value;
  selectedBlockTime = null; btnConfirmBlock.disabled = true;

  if (!workingHours.length || !profId) { blockSlotsDiv.innerHTML = "<p style='color:#888; font-size:13px;'>Configurações não carregadas.</p>"; return; }

  const profAppointments = allAppointmentsForDay.filter(a => a.professionalId === profId && a.status !== "cancelled");
  let slots = generateDynamicSlots(workingHours, profAppointments, 30); 

  const now = new Date(); const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dateStr === todayStr) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    slots = slots.filter(time => { if (!time) return false; const parts = time.split(":"); return (Number(parts[0]) * 60 + Number(parts[1])) > currentMinutes; });
  }

  blockSlotsDiv.innerHTML = "";
  if (slots.length === 0) { blockSlotsDiv.innerHTML = "<p style='color:#888; font-size:13px;'>Sem horários livres para bloquear.</p>"; return; }

  slots.forEach(time => {
    const btn = document.createElement("button"); btn.type = "button"; btn.className = "slot"; btn.textContent = time;
    btn.onclick = () => {
      blockSlotsDiv.querySelectorAll('button').forEach(b => b.classList.remove('selected', 'is-selected'));
      btn.classList.add('selected', 'is-selected'); selectedBlockTime = time; btnConfirmBlock.disabled = false;
    };
    blockSlotsDiv.appendChild(btn);
  });
}

const btnConfirmBlock = document.getElementById("btnConfirmBlock");
if (btnConfirmBlock) {
  btnConfirmBlock.addEventListener("click", async () => {
    const profId = blockProfSelect.value; const dateStr = dateInput.value;
    if (!selectedBlockTime) return;
    btnConfirmBlock.textContent = "A bloquear..."; btnConfirmBlock.disabled = true;
    const time = selectedBlockTime; const [h, m] = time.split(":").map(Number); const total = h * 60 + m + 30; 
    const endH = String(Math.floor(total / 60)).padStart(2, "0"); const endM = String(total % 60).padStart(2, "0"); const endTime = `${endH}:${endM}`;

    try {
      await addDoc(collection(db, "appointments"), {
        tenantId: tenantId, professionalId: profId, date: dateStr, startTime: time, endTime: endTime,
        clientName: "⛔ BLOQUEIO DE AGENDA", clientPhone: "00000000000", serviceName: "Bloqueio Manual", servicePrice: 0, status: "confirmed"
      });
    } catch (error) { console.error(error); alert("Erro ao bloquear a agenda."); } 
    finally { btnConfirmBlock.textContent = "Bloquear Selecionado"; }
  });
}

document.getElementById('btnToggleBloqueio').addEventListener('click', function() {
    const secao = document.getElementById('secaoBloqueio');
    if (secao.style.display === 'none') { secao.style.display = 'block'; this.innerHTML = '🔼 Ocultar Horários de Bloqueio'; } 
    else { secao.style.display = 'none'; this.innerHTML = '🔒 Gerenciar Horários de Bloqueio'; }
});

const btnBlockWholeDay = document.getElementById("btnBlockWholeDay");
if (btnBlockWholeDay) {
  btnBlockWholeDay.addEventListener("click", async () => {
    const profId = blockProfSelect.value; const dateStr = dateInput.value;
    if (!profId) return;

    btnBlockWholeDay.textContent = "A bloquear o dia..."; btnBlockWholeDay.disabled = true;
    try {
      await addDoc(collection(db, "appointments"), {
        tenantId: tenantId, professionalId: profId, date: dateStr, startTime: "00:00", endTime: "23:59",   
        clientName: "⛔ BLOQUEIO DE AGENDA", clientPhone: "00000000000", serviceName: "Dia Inteiro Fechado", servicePrice: 0, status: "confirmed"
      });
    } catch (error) { console.error(error); } 
    finally { btnBlockWholeDay.textContent = "🛑 Fechar o Dia Inteiro"; btnBlockWholeDay.disabled = false; }
  });
}
