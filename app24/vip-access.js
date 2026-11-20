import {initializeApp,getApps,getApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig} from '../member/firebase-config.js';
const login='../member/login.html?from=app24';
const app=getApps().length?getApp():initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const msg=document.getElementById('vipAuthMessage'),gate=document.getElementById('vipAuthGate'),panel=document.getElementById('vipMemberInfo');
function show(s){if(msg)msg.textContent=s;}
function dateMs(v){if(!v)return NaN;if(typeof v.toMillis==='function')return v.toMillis();if(typeof v.seconds==='number')return v.seconds*1000;if(typeof v==='number')return v<1e11?v*1000:v;return Date.parse(v);}
function failed(s,link){show(s);const a=document.getElementById('vipAuthAction');if(a){a.href=link||login;a.textContent=link?'ตรวจสอบสถานะสมาชิก':'เข้าสู่ระบบ';a.hidden=false;}const retry=document.getElementById('vipAuthRetry');if(retry)retry.hidden=false;}
const slow=setTimeout(()=>show('กำลังเชื่อมต่อ Firebase... หากรอนาน ให้ตรวจสอบอินเทอร์เน็ต'),3500);
onAuthStateChanged(auth,async user=>{
 if(!user){clearTimeout(slow);location.replace(login);return;}
 try{
  show('กำลังตรวจสอบสิทธิ์ VIP...');
  const snap=await getDoc(doc(db,'members',user.uid));
  if(!snap.exists()){clearTimeout(slow);failed('ยังไม่พบข้อมูลสมาชิก','../member/waiting.html');return;}
  const d=snap.data(),exp=dateMs(d.expire),valid=d.role==='admin'||(d.vip===true&&d.active===true&&Number.isFinite(exp)&&exp>Date.now());
  clearTimeout(slow);
  if(!valid){failed('บัญชีนี้ยังไม่ได้รับสิทธิ์ VIP หรือสิทธิ์หมดอายุ','../member/waiting.html');return;}
  document.documentElement.classList.add('vip-auth-ok');
  if(gate)gate.hidden=true;
  if(panel){const n=document.getElementById('vipMemberName'),e=document.getElementById('vipMemberExpiry');if(n)n.textContent=d.name||d.displayName||user.displayName||user.email||'สมาชิก VIP';if(e)e.textContent=d.role==='admin'?'ผู้ดูแลระบบ':'หมดอายุ '+new Date(exp).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});panel.hidden=false;}
 }catch(e){clearTimeout(slow);console.error('VIP access check',e);failed('ตรวจสอบสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้ง');}
},e=>{clearTimeout(slow);console.error(e);failed('เชื่อมต่อระบบสมาชิกไม่สำเร็จ');});
document.getElementById('vipAuthRetry')?.addEventListener('click',()=>location.reload());
document.getElementById('vipMemberLogout')?.addEventListener('click',async()=>{try{await signOut(auth);location.replace(login);}catch(e){alert('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');}});
