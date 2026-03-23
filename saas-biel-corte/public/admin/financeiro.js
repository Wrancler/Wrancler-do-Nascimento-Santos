import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";
import { getTenantConfig } from "../../firebase/tenants.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "tenant-demo";
const auth = getAuth();

// ==========================================
// 1. SEGURANÇA E NAVEGAÇÃO
// ==========================================
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = `login.html?tenant=${encodeURIComponent(tenantId)}`;
  } else {
    initFinanceiro();
  }
});

document.getElementById("btnVoltar").addEventListener("click", () => {
  window.location.href = `dashboard.html?tenant=${encodeURIComponent(tenantId)}`;
});

// ==========================================
// 2. INICIALIZAÇÃO DOS DADOS E BLOQUEIO VIP
// ==========================================
const dateStart = document.getElementById("dateStart");
const dateEnd = document.getElementById("dateEnd");
const profFilter = document.getElementById("profFilter");
const btnFiltrar = document.getElementById("btnFiltrar");
const financeList = document.getElementById("financeList");
const totCortes = document.getElementById("totCortes");
const totValor = document.getElementById("totValor");

async function initFinanceiro() {
  try {
    const config = await getTenantConfig(tenantId);
    
    // ---------------------------------------------------------
    // NOVO: BARREIRA DE SEGURANÇA POR PIN
    // ---------------------------------------------------------
    // Puxa o "crachá" que salvamos na aba anterior
    const cracha = sessionStorage.getItem("crachaFinanceiro");
    
    // Se não tem crachá, ou se o crachá é diferente da senha oficial: RUA!
    if (!config.financePin || cracha !== String(config.financePin)) {
      alert("⚠️ Acesso Restrito: Digite o PIN correto no painel para acessar.");
      window.location.href = `dashboard.html?tenant=${encodeURIComponent(tenantId)}`;
      return; 
    }
    // ---------------------------------------------------------

    // Preenche a lista de barbeiros
    if (config.professionals) {
// ... (o resto do código continua igualzinho)
      config.professionals.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.id;
        opt.textContent = p.name;
        profFilter.appendChild(opt);
      });
    }

    // Define as datas padrão (Primeiro e Último dia do mês atual)
    const hoje = new Date();
    const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);

    dateStart.value = primeiroDia.toISOString().split('T')[0];
    dateEnd.value = ultimoDia.toISOString().split('T')[0];

    // Carrega automaticamente os dados do mês
    calcularFinancas();

  } catch(e) { 
    console.error("Erro ao carregar configurações:", e); 
  }
}

// ==========================================
// 3. MOTOR DE CÁLCULO FINANCEIRO
// ==========================================
btnFiltrar.addEventListener("click", calcularFinancas);

async function calcularFinancas() {
  financeList.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>A calcular finanças...</p>";
  totCortes.textContent = "...";
  totValor.textContent = "...";

  const start = dateStart.value;
  const end = dateEnd.value;
  const profSelecionado = profFilter.value;

  if (!start || !end) return alert("Por favor, selecione uma data inicial e final.");

  try {
    // Busca todos os agendamentos do tenant
    const q = query(collection(db, "appointments"), where("tenantId", "==", tenantId));
    const snap = await getDocs(q);
    
    let agendamentosValidos = [];
    let valorAcumulado = 0;

    snap.forEach(d => {
      const app = d.data();
      
      // Regras para entrar na conta:
      // 1. Tem de estar "completed" (finalizado pelo administrador)
      // 2. A data tem de estar dentro do período escolhido
      // 3. O barbeiro tem de corresponder (ou se for "todos")
      if (
        app.status === "completed" &&
        app.date >= start &&
        app.date <= end &&
        (profSelecionado === "todos" || app.professionalId === profSelecionado)
      ) {
        agendamentosValidos.push(app);
        
        // Soma o valor do serviço garantindo que é um número
        const preco = parseFloat(app.servicePrice) || 0;
        valorAcumulado += preco;
      }
    });

    // Ordena por data e depois por hora
    agendamentosValidos.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return String(a.startTime).localeCompare(String(b.startTime));
    });

    // Atualiza os cartões lá em cima
    totCortes.textContent = agendamentosValidos.length;
    totValor.textContent = `R$ ${valorAcumulado.toFixed(2).replace('.', ',')}`;

    // Atualiza a lista na tela
    financeList.innerHTML = "";

    if (agendamentosValidos.length === 0) {
      financeList.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>Nenhum serviço finalizado neste período.</p>";
      return;
    }

    agendamentosValidos.forEach(app => {
      const item = document.createElement("div");
      item.className = "admin-item";
      item.style.borderLeft = "4px solid #4CAF50";

      // Converte YYYY-MM-DD para DD/MM/YYYY
      const dataFormatada = app.date.split("-").reverse().join("/");
      const profName = (app.professionalId || "desconhecido").charAt(0).toUpperCase() + (app.professionalId || "").slice(1);
      const precoFormatado = parseFloat(app.servicePrice || 0).toFixed(2).replace('.', ',');

      item.innerHTML = `
        <div class="admin-item__top">
          <div class="admin-item__time" style="color: #4CAF50;">${dataFormatada} às ${app.startTime}</div>
          <div class="admin-item__prof">${profName}</div>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
          <div>
            <div class="admin-item__client">${app.clientName || 'Sem Nome'}</div>
            <div class="admin-item__service">${app.serviceName || 'Serviço'}</div> 
          </div>
          <div style="font-size: 18px; font-weight: bold; color: #fff;">
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