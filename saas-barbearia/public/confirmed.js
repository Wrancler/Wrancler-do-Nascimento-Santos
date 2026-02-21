import { getAppointmentByCode } from "../firebase/appointments.js";

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

function digits(v) {
  return String(v || "").replace(/[^\d]/g, "");
}

const tenantId = getParam("tenant") || "tenant-demo";
const code = getParam("code");
const whats = digits(getParam("whats") || "");

const codePill = document.getElementById("codePill");
const barberValue = document.getElementById("barberValue");
const serviceValue = document.getElementById("serviceValue");
const dateValue = document.getElementById("dateValue");
const timeValue = document.getElementById("timeValue");
const clientValue = document.getElementById("clientValue");
const phoneValue = document.getElementById("phoneValue");
const btnWhatsapp = document.getElementById("btnWhatsapp");
const errorBox = document.getElementById("errorBox");

if (!code) {
  codePill.textContent = "Código não informado.";
  errorBox.style.display = "block";
  errorBox.textContent = "Abra novamente o link do comprovante.";
} else {
  load();
}

async function load() {
  codePill.textContent = `CÓDIGO: ${code}`;

  try {
    const appt = await getAppointmentByCode({ tenantId, code });

    if (!appt) {
      errorBox.style.display = "block";
      errorBox.textContent = "Não encontramos esse agendamento. Verifique o código.";
      return;
    }

    const profName =
      appt.professionalName ||
      (appt.professionalId === "guilherme" ? "Guilherme Silva" :
       appt.professionalId === "gabriel" ? "Gabriel Silva" :
       appt.professionalId);

    barberValue.textContent = profName || "—";
    serviceValue.textContent = appt.serviceName || "—";
    dateValue.textContent = appt.date || "—";
    timeValue.textContent = `${appt.startTime || "—"} - ${appt.endTime || "—"}`;
    

    const msg =
`Comprovante de agendamento ✂️

Código: ${appt.code}
Barbeiro: ${profName}
Serviço: ${appt.serviceName}
Data: ${appt.date}
Hora: ${appt.startTime} (${(appt.endTime || "") ? "até " + appt.endTime : "40 min"})

Cliente: ${appt.clientName}
WhatsApp: ${digits(appt.clientPhone)}`;

    btnWhatsapp.onclick = () => {
      if (!whats) return alert("WhatsApp do barbeiro não informado no link.");
      window.open(`https://wa.me/${whats}?text=${encodeURIComponent(msg)}`, "_blank");
    };
  } catch (e) {
    console.error(e);
    errorBox.style.display = "block";
    errorBox.textContent = "Erro ao carregar comprovante. Tente novamente.";
  }
}
