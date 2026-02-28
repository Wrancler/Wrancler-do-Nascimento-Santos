import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "../firebase/config.js"; 

const urlParams = new URLSearchParams(window.location.search);
const appointmentId = urlParams.get("id");

const loadingText = document.getElementById("loadingText");
const appointmentInfo = document.getElementById("appointmentInfo");
const successMessage = document.getElementById("successMessage");
const cancelCard = document.getElementById("cancelCard");

const lblService = document.getElementById("lblService");
const lblDate = document.getElementById("lblDate");
const lblTime = document.getElementById("lblTime");
const lblProf = document.getElementById("lblProf");

const btnConfirmCancel = document.getElementById("btnConfirmCancel");
const btnKeep = document.getElementById("btnKeep");

async function init() {
  if (!appointmentId) {
    loadingText.textContent = "Erro: Link inválido ou quebrado.";
    return;
  }

  try {
    const docRef = doc(db, "appointments", appointmentId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      loadingText.textContent = "Agendamento não encontrado no banco de dados.";
      return;
    }

    const appData = docSnap.data();

    if (appData.status === "cancelled") {
      loadingText.textContent = "";
      successMessage.style.display = "block";
      successMessage.querySelector("h3").textContent = "Agendamento já estava cancelado!";
      return;
    }

    // 🛡️ Blindagem extra: garante que a data existe antes de tentar cortar (split)
    const dataSalva = appData.date || "";
    const dataFormatada = dataSalva.includes("-") ? dataSalva.split("-").reverse().join("/") : dataSalva;
    
    const profIdSalvo = appData.professionalId || "desconhecido";
    const profName = profIdSalvo.charAt(0).toUpperCase() + profIdSalvo.slice(1);

    lblService.textContent = appData.serviceName || "Serviço Indefinido";
    lblDate.textContent = dataFormatada || "--/--/----";
    lblTime.textContent = appData.startTime || "--:--";
    lblProf.textContent = profName;

    loadingText.style.display = "none";
    appointmentInfo.style.display = "block";

  } catch (error) {
    console.error("Erro ao buscar agendamento:", error);
    // 🚨 O DETETIVE ENTRA EM AÇÃO AQUI:
    loadingText.innerHTML = `
      <div style='background: rgba(255,0,0,0.1); border: 1px dashed #ff5555; padding: 15px; border-radius: 8px; text-align: left; margin-top: 20px;'>
        <strong style='color: #ff5555;'>🚨 Erro Técnico:</strong><br>
        <span style='color: #ffaa00; font-size: 14px;'>${error.message}</span>
      </div>
    `;
  }
}

if (btnConfirmCancel) {
  btnConfirmCancel.addEventListener("click", async () => {
    btnConfirmCancel.textContent = "Cancelando...";
    btnConfirmCancel.disabled = true;

    try {
      const docRef = doc(db, "appointments", appointmentId);
      await updateDoc(docRef, { status: "cancelled" });

      appointmentInfo.style.display = "none";
      successMessage.style.display = "block";
    } catch (error) {
      console.error("Erro ao cancelar:", error);
      alert("Erro ao cancelar: " + error.message);
      btnConfirmCancel.textContent = "Sim, quero cancelar";
      btnConfirmCancel.disabled = false;
    }
  });
}

if (btnKeep) {
  btnKeep.addEventListener("click", () => {
    window.location.href = "booking.html"; 
  });
}

init();