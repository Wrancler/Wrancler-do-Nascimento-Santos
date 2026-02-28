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
      loadingText.textContent = "Agendamento não encontrado.";
      return;
    }

    const appData = docSnap.data();

    if (appData.status === "cancelled") {
      loadingText.textContent = "";
      successMessage.style.display = "block";
      successMessage.querySelector("h3").textContent = "Agendamento já estava cancelado!";
      return;
    }

    const dataFormatada = appData.date.split("-").reverse().join("/");
    const profName = appData.professionalId.charAt(0).toUpperCase() + appData.professionalId.slice(1);

    lblService.textContent = appData.serviceName;
    lblDate.textContent = dataFormatada;
    lblTime.textContent = appData.startTime;
    lblProf.textContent = profName;

    loadingText.style.display = "none";
    appointmentInfo.style.display = "block";

  } catch (error) {
    console.error("Erro ao buscar agendamento:", error);
    loadingText.textContent = "Erro ao carregar dados. Tente novamente.";
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
      alert("Erro ao cancelar. Tente novamente.");
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
