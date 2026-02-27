import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, query, where, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../../firebase/config.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenantId = getParam("tenant") || "tenant-demo";
const auth = getAuth();

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
// 2. INICIALIZAÇÃO E ROLETA DE DATAS
// ==========================================
const dateInput = document.getElementById("adminDate");
const listDiv = document.getElementById("appointmentsList");
const totalHead = document.getElementById("totalAppointments");

function initDashboard() {
  renderAdminDateCards();
}

function renderAdminDateCards() {
  const dateSlider = document.getElementById("adminDateSlider");
  if (!dateSlider) return;
  dateSlider.innerHTML = "";

  const today = new Date();
  const diasSemana = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  // Roleta Admin: Mostra 3 dias do passado e 14 pro futuro
  for (let i = -3; i <= 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    const card = document.createElement("div");
    card.className = "date-card";
    
    // Se for o dia de hoje, já deixa selecionado e escreve "HOJE"
    if (i === 0) {
      card.classList.add("is-selected");
      dateInput.value = isoDate; // Define o valor inicial do input invisível
      loadAppointments(isoDate); // Já busca os dados de hoje
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

  // Efeito charmoso: rola a roleta suavemente para centralizar o dia de Hoje
  setTimeout(() => {
    const selected = dateSlider.querySelector('.is-selected');
    if(selected) {
      selected.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 100);
}

// ==========================================
// 3. BUSCA OS AGENDAMENTOS NO BANCO
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
    const apps = [];
    snap.forEach(d => apps.push({ id: d.id, ...d.data() }));

    apps.sort((a, b) => a.startTime.localeCompare(b.startTime));

    listDiv.innerHTML = "";

    if (apps.length === 0) {
      totalHead.textContent = "Nenhum agendamento.";
      listDiv.innerHTML = "<p style='color: #888; text-align: center; padding: 20px;'>A agenda está livre neste dia!</p>";
      return;
    }

    totalHead.textContent = `${apps.length} agendamento(s)`;

    apps.forEach(app => {
      const item = document.createElement("div");
      item.className = "admin-item";

      const isCancelled = app.status === "cancelled";
      const timeColor = isCancelled ? "#ff5555" : "#e0b976";
      const timeText = isCancelled ? `${app.startTime} (Cancelado)` : app.startTime;

      const profName = app.professionalId.charAt(0).toUpperCase() + app.professionalId.slice(1);

      item.innerHTML = `
        <div class="admin-item__top">
          <div class="admin-item__time" style="color: ${timeColor};">${timeText}</div>
          <div class="admin-item__prof">${profName}</div>
        </div>
        <div class="admin-item__client">${app.clientName} <br> <span style="font-size: 0.85rem; color: #aaa;">${app.clientPhone}</span></div>
        <div class="admin-item__service">${app.serviceName} • R$ ${app.servicePrice}</div>
      `;

      if (!isCancelled) {
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "admin-item__actions";

        const btnCancel = document.createElement("button");
        btnCancel.className = "btn-admin btn-admin--cancel";
        btnCancel.textContent = "Cancelar Horário";
        
        btnCancel.onclick = async () => {
          if (confirm(`Tem certeza que deseja cancelar o horário de ${app.clientName} às ${app.startTime}?`)) {
            btnCancel.textContent = "Cancelando...";
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
    totalHead.textContent = "Erro!";
    listDiv.innerHTML = "<p style='color: #ff5555; text-align: center;'>Erro ao buscar a agenda.</p>";
  }
}