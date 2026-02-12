import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { db } from "../../firebase/config.js"; // só pra garantir que o app inicializou (mesmo que não use aqui)

function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

const tenant = getParam("tenant") || "tenant-demo"; // mantém multi-tenant no admin também
const auth = getAuth();

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");
const btn = document.getElementById("btnLogin");
const errorBox = document.getElementById("errorBox");

onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = `dashboard.html?tenant=${encodeURIComponent(tenant)}`;
  }
});

btn.addEventListener("click", async () => {
  errorBox.style.display = "none";
  const email = emailEl.value.trim();
  const password = passEl.value;

  if (!email) return showErr("Digite o e-mail.");
  if (!password) return showErr("Digite a senha.");

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = `dashboard.html?tenant=${encodeURIComponent(tenant)}`;
  } catch (e) {
    showErr("Login inválido. Verifique e tente novamente.");
    console.error(e);
  }
});

function showErr(msg) {
  errorBox.style.display = "block";
  errorBox.textContent = msg;
}
