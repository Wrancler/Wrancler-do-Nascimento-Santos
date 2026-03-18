import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDo1Q5rJgL8ar4HPhzPll67QE2m_AO2p5Y",
    authDomain: "saas-barbearia-68632.firebaseapp.com",
    projectId: "saas-barbearia-68632",
    storageBucket: "saas-barbearia-68632.firebasestorage.app",
    messagingSenderId: "209135809652",
    appId: "1:209135809652:web:8ac9ce231aa914121d8d21"
  };

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
