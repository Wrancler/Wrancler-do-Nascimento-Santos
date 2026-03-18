import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from "./config.js";

export async function getTenantConfig(tenantId) {
  const docRef = doc(db, "tenants", tenantId);
  const snap = await getDoc(docRef);
  
  if (!snap.exists()) {
    throw new Error("Barbearia não encontrada no sistema.");
  }
  
  return snap.data();
}