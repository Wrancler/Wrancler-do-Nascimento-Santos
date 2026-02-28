import { collection, query, where, getDocs, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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

let docRefToUpdate = null; // Vai guardar o caminho exato para cancelar depois

async function init() {
  if (!appointmentId) {
    loadingText.textContent = "Erro: Link inválido ou quebrado.";
    return;
  }

  try {
    let appData = null;

    // 🔎 CÃO FAREJADOR: Busca o agendamento de 3 formas diferentes para não ter erro
    
    // 1. Tenta buscar direto pelo nome do documento
    const directDocRef = doc(db, "appointments", appointmentId);
    const directSnap = await getDoc(directDocRef);

    if (directSnap.exists()) {
      appData = directSnap.data();
      docRefToUpdate = directDocRef;
    } else {
      // 2. Procura nas pastas pelo campo "code" (o código TE-PZIJQ)
      const qCode = query(collection(db, "appointments"), where("code", "==", appointmentId));
      const snapCode = await getDocs(qCode);
      
      if (!snapCode.empty) {
        appData = snapCode.docs[0].data();
        docRefToUpdate = snapCode.docs[0].ref;
      } else {
        // 3. Procura pelo campo "id" interno
        const qId = query(collection(db, "appointments"), where("id", "==", appointmentId));
        const snapId = await getDocs(qId);
        
        if (!snapId.empty) {
          appData = snapId.docs[0].data();
          docRefToUpdate = snapId.docs[0].ref;
        }
      }
    }

    if (!appData) {
      loadingText.textContent = "Agendamento não encontrado no banco de dados.";
      return;
    }

    if (appData.status === "cancelled") {
      loadingText.textContent = "";
      successMessage.style.display = "block";
      successMessage.querySelector("h3").textContent = "Agendamento já estava cancelado!";
      return;
    }

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
      // 🎯 Tiro certeiro: Atualiza exatamente o documento que o farejador encontrou
      await updateDoc(docRefToUpdate, { status: "cancelled" });

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