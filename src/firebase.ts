import { initializeApp, getApp, getApps } from "firebase/app";
import { getDatabase, ref } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCc3EouS5NXhmbVrVyQIfyx2Dy8RlnyQUU",
  authDomain: "sports-803-1b806.firebaseapp.com",
  databaseURL: "https://sports-803-1b806-default-rtdb.firebaseio.com",
  projectId: "sports-803-1b806",
  storageBucket: "sports-803-1b806.firebasestorage.app",
  messagingSenderId: "655881545685",
  appId: "1:655881545685:web:0781db29504ecb7c817f5c"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const db = getDatabase(app);
export const auth = getAuth(app);

// Authenticate anonymously for secure RTDB read/writes
signInAnonymously(auth)
  .then(() => {
    console.log("Authenticated anonymously to Sports 803 Firebase");
  })
  .catch((error) => {
    console.warn("Firebase Anonymous Auth warning:", error.message);
  });
