<script src="https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.21.0/firebase-auth.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js"></script>
<script>
  
  const firebaseConfig = {
    apiKey: "AIzaSyAt-INcGErGDPcADyXOOB0ODp4320h34GY",
    authDomain: "mino-c60bb.firebaseapp.com",
    databaseURL: "https://mino-c60bb-default-rtdb.firebaseio.com",
    projectId: "mino-c60bb",
    storageBucket: "mino-c60bb.appspot.com",
    messagingSenderId: "1040599096922",
    appId: "1:1040599096922:web:f49152eb6d458304d94263",
    measurementId: "G-Z27RNGLDQ9"
  };
  
  import { initializeApp } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-app.js";
  import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-auth.js";
  import { getDatabase, ref, push, onValue } from "https://www.gstatic.com/firebasejs/9.21.0/firebase-database.js";

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const database = getDatabase(app);
</script>
