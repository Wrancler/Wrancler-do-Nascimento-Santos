import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "tenant-demo";

let profSelecionadoAtual = "todos"; 

// ==========================================
// 1. SEGURANÇA E NAVEGAÇÃO 
// ==========================================
document.getElementById("btnVoltar").addEventListener("click", () => {
  window.location.href = `dashboard.html?tenant=${encodeURIComponent(tenantId)}`;
});

initFinanceiro();

// ==========================================
// 2. INICIALIZAÇÃO DOS DADOS E ABAS
// ==========================================
const dateStart = document.getElementById("dateStart");
const dateEnd = document.getElementById("dateEnd");
const profPills = document.getElementById("profPills"); 
const financeList = document.getElementById("financeList");
const totCortes = document.getElementById("totCortes");
const totValor = document.getElementById("totValor");
const totAgendamentos = document.getElementById("totAgendamentos"); 

function formatarDataIso(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

async function initFinanceiro() {
  try {
    const config = await getTenantConfig(tenantId);
    
    // A PORTA DO COFRE: Verifica se o utilizador digitou o PIN no Dashboard
    const cracha = sessionStorage.getItem("crachaFinanceiro");
    if (!config.financePin || cracha !== String(config.financePin)) {
      alert("⚠️ Acesso Restrito: Digite o PIN correto no painel para acessar.");
      window.location.href = `dashboard.html?tenant=${encodeURIComponent(tenantId)}`;
      return; 
    }

    profPills.innerHTML = `<button class="pill-btn active" data-id="todos">💰 Todos (Geral)</button>`;
    
    if (config.professionals) {
      config.professionals.forEach(p => {
        profPills.innerHTML += `<button class="pill-btn" data-id="${p.id}">✂️ ${p.name}</button>`;
      });
    }

    document.querySelectorAll(".pill-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
        e.target.classList.add("active");
        profSelecionadoAtual = e.target.getAttribute("data-id");
        calcularFinancas();
      });
    });

    renderFinanceDateCards();

  } catch(e) { 
    console.error("Erro ao carregar configurações:", e); 
  }
}

// ==========================================
// 3. ROLETA DE DATAS
// ==========================================
function definirFiltro(inicio, fim) {
  dateStart.value = inicio;
  dateEnd.value = fim;
  calcularFinancas();
}

function renderFinanceDateCards() {
  const dateSlider = document.getElementById("financeDateSlider");
  if (!dateSlider) return;
  dateSlider.innerHTML = "";

  const today = new Date();
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  const cardMes = document.createElement("div");
  cardMes.className = "date-card";
  cardMes.style.minWidth = "85px";
  cardMes.innerHTML = `
    <span class="date-card__weekday" style="color: #e0b976; font-size: 10px;">RESUMO</span>
    <span class="date-card__day" style="font-size: 16px; margin: 8px 0;">O Mês</span>
    <span class="date-card__month">${meses[today.getMonth()]}</span>
  `;
  cardMes.addEventListener("click", () => {
    document.querySelectorAll("#financeDateSlider .date-card").forEach(c => c.classList.remove("is-selected"));
    cardMes.classList.add("is-selected");
    
    const primeiroDia = new Date(today.getFullYear(), today.getMonth(), 1);
    const ultimoDia = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    definirFiltro(formatarDataIso(primeiroDia), formatarDataIso(ultimoDia));
  });
  dateSlider.appendChild(cardMes);

  for (let i = 0; i >= -15; i--) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const isoDate = formatarDataIso(d);
    const card = document.createElement("div"); card.className = "date-card";
    
    if (i === 0) { card.classList.add("is-selected"); definirFiltro(isoDate, isoDate); }

    card.innerHTML = `<span class="date-card__weekday">${i === 0 ? "HOJE" : diasSemana[d.getDay()]}</span><span class="date-card__day">${String(d.getDate()).padStart(2, '0')}</span><span class="date-card__month">${meses[d.getMonth()]}</span>`;

    card.addEventListener("click", () => {
      document.querySelectorAll("#financeDateSlider .date-card").forEach(c => c.classList.remove("is-selected"));
      card.classList.add("is-selected"); definirFiltro(isoDate, isoDate);
    });

    dateSlider.appendChild(card);
  }
}

dateStart.addEventListener("change", () => { document.querySelectorAll("#financeDateSlider .date-card").forEach(c => c.classList.remove("is-selected")); calcularFinancas(); });
dateEnd.addEventListener("change", () => { document.querySelectorAll("#financeDateSlider .date-card").forEach(c => c.classList.remove("is-selected")); calcularFinancas(); });


// ==========================================
// 4. MOTOR DE CÁLCULO FINANCEIRO
// ==========================================
async function calcularFinancas() {
  financeList.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>A calcular finanças...</p>";
  totCortes.textContent = "...";
  totValor.textContent = "...";
  if (totAgendamentos) totAgendamentos.textContent = "...";

  const start = dateStart.value; const end = dateEnd.value;
  if (!start || !end) return;

  try {
    const q = query(collection(db, "appointments"), where("tenantId", "==", tenantId));
    const snap = await getDocs(q);
    
    let agendamentosValidos = [];
    let valorAcumulado = 0;
    let totalAgendamentosCount = 0; // Conta o movimento total da loja

    snap.forEach(d => {
      const app = d.data();
      
      if (app.date >= start && app.date <= end && (profSelecionadoAtual === "todos" || app.professionalId === profSelecionadoAtual)) {
        
        // Ignora bloqueios e cancelamentos na contagem geral
        if (app.clientName !== "⛔ BLOQUEIO DE AGENDA" && app.status !== "cancelled") {
          totalAgendamentosCount++;
          
          // O dinheiro e a lista final só contam quem realmente pagou e finalizou
          if (app.status === "completed") {
            agendamentosValidos.push(app);
            const preco = parseFloat(app.servicePrice) || 0;
            valorAcumulado += preco;
          }
        }
      }
    });

    agendamentosValidos.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return String(b.startTime).localeCompare(String(a.startTime));
    });

    if (totAgendamentos) totAgendamentos.textContent = totalAgendamentosCount;
    totCortes.textContent = agendamentosValidos.length;
    totValor.textContent = `R$ ${valorAcumulado.toFixed(2).replace('.', ',')}`;

    financeList.innerHTML = "";

    if (agendamentosValidos.length === 0) {
      financeList.innerHTML = "<p style='color: #888; text-align: center; padding: 40px 20px;'>Nenhum serviço finalizado neste período.</p>";
      return;
    }

    agendamentosValidos.forEach(app => {
      const item = document.createElement("div");
      
      item.style.background = "#161616";
      item.style.border = "1px solid #2a2a2a";
      item.style.borderRadius = "16px";
      item.style.padding = "20px";
      item.style.marginBottom = "16px";
      item.style.boxShadow = "0 4px 15px rgba(0,0,0,0.2)";

      const dataFormatada = app.date.split("-").reverse().join("/");
      const profName = (app.professionalId || "desconhecido").charAt(0).toUpperCase() + (app.professionalId || "").slice(1);
      const precoFormatado = parseFloat(app.servicePrice || 0).toFixed(2).replace('.', ',');

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #222; padding-bottom: 12px; margin-bottom: 12px;">
          <div style="color: #e0b976; font-weight: 600; font-size: 14px;">📅 ${dataFormatada} às ${app.startTime}</div>
          <div style="background: rgba(224,185,118,0.1); color: #e0b976; padding: 4px 10px; border-radius: 8px; font-size: 11px; text-transform: uppercase;">${profName}</div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="color: #fff; font-weight: bold; font-size: 16px; margin-bottom: 4px;">${app.clientName || 'Sem Nome'}</div>
            <div style="color: #888; font-size: 13px;">✂️ ${app.serviceName || 'Serviço'}</div> 
          </div>
          <div style="font-size: 20px; font-weight: bold; color: #fff;">
            R$ ${precoFormatado}
          </div>
        </div>
      `;
      financeList.appendChild(item);
    });

  } catch (error) {
    console.error("Erro ao buscar dados financeiros:", error);
    financeList.innerHTML = `<p style='color: #ff5555; text-align: center;'>Erro: ${error.message}</p>`;
  }
}
