import {
  getAuth,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  doc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { db } from "../../firebase/config.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function makeLockId({ tenantId, professionalId, date, startTime }) {
  return `${tenantId}_${professionalId}_${date}_${startTime}`.replace(/\s+/g, "");
}

const tenantId = getParam("tenant") || "tenant-demo";
const auth = getAuth();

const subtitle = document.getElementById("subtitle");
const dateEl = document.getElementById("date");
const profEl = document.getElementById("professional");
const btnLoad = document.getElementById("btnLoad");
const btnLogout = document.getElementById("btnLogout");
const listEl = document.getElementById("list");
const summaryEl = document.getElementById("summary");
const errorBox = document.getElementById("errorBox");

subtitle.textContent = `Tenant: ${tenantId}`;
dateEl.value = new Date().toISOString().slice(0, 10);

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = `login.html?tenant=${encodeURIComponent(tenantId)}`;
    return;
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = `login.html?tenant=${encodeURIComponent(tenantId)}`;
});

btnLoad.addEventListener("click", load);

async function load() {
  errorBox.style.display = "none";
  listEl.innerHTML = "";
  summaryEl.textContent = "Carregando...";

  const date = dateEl.value;
  const professionalId = profEl.value;

  try {
    const base = [
      where("tenantId", "==", tenantId),
      where("date", "==", date)
    ];

    if (professionalId !== "all") base.push(where("professionalId", "==", professionalId));

    const q = query(
      collection(db, "appointments"),
      ...base,
      orderBy("startTime")
    );

    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    summaryEl.textContent = `${items.length} agendamento(s) em ${date}.`;

    if (items.length === 0) {
      listEl.innerHTML = `<div class="note">Nenhum agendamento encontrado.</div>`;
      return;
    }

    items.forEach(appt => {
      listEl.appendChild(renderItem(appt));
    });
  } catch (e) {
    console.error(e);
    summaryEl.textContent = "";
    errorBox.style.display = "block";
    errorBox.textContent = "Erro ao carregar. Se o Firebase pedir, crie o índice (ele mostra o link no F12).";
  }
}

function profName(id) {
  if (id === "guilherme") return "Guilherme Silva";
  if (id === "gabriel") return "Gabriel Silva";
  return id || "—";
}

function renderItem(appt) {
  const wrap = document.createElement("div");
  wrap.className = "admin-item";

  const status = appt.status || "confirmed";
  
  // 1. Criamos um visual de cores para o status
  let statusBadge = "";
  if (status === "confirmed") {
    statusBadge = `<span style="color: #4ade80; font-weight: bold;">CONFIRMADO</span>`;
  } else if (status === "done") {
    statusBadge = `<span style="color: #60a5fa; font-weight: bold;">FINALIZADO</span>`;
  } else if (status === "cancelled") {
    statusBadge = `<span style="color: #f87171; font-weight: bold;">CANCELADO</span>`;
  }

  // 2. Formatamos o telefone para criar o link do WhatsApp
  const cleanPhone = String(appt.clientPhone || "").replace(/[^\d]/g, "");
  const whatsAppAction = cleanPhone 
    ? `<a href="https://wa.me/${cleanPhone}" target="_blank" style="color: #25D366; text-decoration: none; font-weight: bold;">💬 Chamar no Whats</a>` 
    : "Sem número";

  wrap.innerHTML = `
    <div class="admin-item__top">
      <div>
        <div class="admin-item__title">${appt.startTime || "—"} • ${profName(appt.professionalId)}</div>
        <div class="admin-item__meta" style="margin-bottom: 8px;">
          ${appt.serviceName || "—"} <br> 
          👤 Cliente: ${appt.clientName || "—"} <br> 
          📱 Whats: ${whatsAppAction}
        </div>
        <div class="admin-item__code">Código: <strong>${appt.code || "—"}</strong> • Status: ${statusBadge}</div>
      </div>
      <div class="admin-item__actions">
        ${status === "confirmed" ? `
          <button class="btn btn--ghost" data-action="done">Finalizar</button>
          <button class="btn" data-action="cancel">Cancelar</button>
        ` : ''}
      </div>
    </div>
  `;

  // Adicionamos os eventos apenas se os botões existirem na tela
  const btnDone = wrap.querySelector('[data-action="done"]');
  const btnCancel = wrap.querySelector('[data-action="cancel"]');
  
  if (btnDone) btnDone.addEventListener("click", () => markDone(appt));
  if (btnCancel) btnCancel.addEventListener("click", () => cancel(appt));

  return wrap;
}

async function markDone(appt) {
  if (!confirm("Marcar como FINALIZADO?")) return;

  try {
    const batch = writeBatch(db);
    // Atualiza o privado e o público
    batch.update(doc(db, "appointments", appt.id), { status: "done" });
    batch.update(doc(db, "appointmentsPublic", appt.id), { status: "done" });
    
    await batch.commit();
    await load();
  } catch (e) {
    console.error(e);
    alert("Erro ao finalizar.");
  }
}

async function cancel(appt) {
  if (!confirm("CANCELAR este agendamento e liberar o horário?")) return;

  try {
    const lockId = makeLockId({
      tenantId: appt.tenantId,
      professionalId: appt.professionalId,
      date: appt.date,
      startTime: appt.startTime
    });

    const batch = writeBatch(db);

    // 1) muda status no privado e no público
    batch.update(doc(db, "appointments", appt.id), { status: "cancelled" });
    batch.update(doc(db, "appointmentsPublic", appt.id), { status: "cancelled" });

    // 2) remove lock do horário para voltar a aparecer na agenda
    batch.delete(doc(db, "slotLocks", lockId));

    await batch.commit();
    await load();
  } catch (e) {
    console.error(e);
    alert("Erro ao cancelar.");
  }
}