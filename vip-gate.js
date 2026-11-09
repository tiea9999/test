// TIEA TEST VIP gate — checks the same Firestore fields as member/login.html.
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from './member/firebase-config.js';

const LOGIN = '/test/member/login.html';
const WAIT = '/test/member/waiting.html';
const gateText = document.getElementById('tieaApp24GateText');
const message = (text) => { if (gateText) gateText.textContent = text; };
function expiryMs(v) {
  if (!v) return NaN;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  if (typeof v === 'number') return v < 1e11 ? v * 1000 : v;
  if (typeof v === 'string') return Date.parse(v);
  return NaN;
}
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let seq = 0;
onAuthStateChanged(auth, async (user) => {
  const id = ++seq;
  if (!user) { location.replace(LOGIN); return; }
  message('กำลังตรวจสอบสิทธิ์ VIP...');
  try {
    const snap = await getDoc(doc(db, 'members', user.uid));
    if (id !== seq) return;
    if (!snap.exists()) { location.replace(WAIT); return; }
    const d = snap.data();
    const exp = expiryMs(d.expire);
    const allowed = d.role === 'admin' || (d.vip === true && d.active === true && Number.isFinite(exp) && exp > Date.now());
    if (allowed) {
      document.documentElement.classList.add('tiea-app24-approved');
    } else {
      location.replace(WAIT);
    }
  } catch (err) {
    console.error('TIEA VIP verification error:', err);
    message('ตรวจสอบสมาชิกไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตและการตั้งค่า Firebase แล้วโหลดหน้าใหม่');
  }
}, (err) => {
  console.error('TIEA auth error:', err);
  message('ระบบยืนยันตัวตนขัดข้อง กรุณาโหลดหน้าใหม่');
});
