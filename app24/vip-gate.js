// TIEA APP24 Firebase VIP test V1 - web gate only, not a native device lock.
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import { firebaseConfig } from '../member/firebase-config.js';
const LOGIN='../member/login.html', WAIT='../member/waiting.html';
const app=getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth=getAuth(app), db=getFirestore(app);
const $=id=>document.getElementById(id);
let currentUser=null, checking=false;
function gateText(t){if($('tieaApp24GateText'))$('tieaApp24GateText').textContent=t;}
function expiryMs(value){
 if(!value)return null;
 if(typeof value.toMillis==='function')return value.toMillis();
 if(typeof value.seconds==='number')return value.seconds*1000;
 if(typeof value==='number')return value<1e11?value*1000:value;
 if(typeof value==='string'){const n=Date.parse(value);return Number.isFinite(n)?n:NaN;}
 return NaN;
}
function memberUI(user,d,exp){
 const name=$('tieaApp24MemberName'), expiry=$('tieaApp24MemberExpiry'), logout=$('tieaApp24Logout');
 if(name)name.textContent=String(d.name||d.displayName||user.displayName||user.email||'สมาชิก');
 if(expiry)expiry.textContent=d.role==='admin'?'ผู้ดูแลระบบ':(Number.isFinite(exp)?'หมดอายุ '+new Date(exp).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'}):'ไม่ระบุวันหมดอายุ');
 if(logout&&!logout.dataset.bound){logout.dataset.bound='1';logout.addEventListener('click',async()=>{
  logout.disabled=true;
  try{await signOut(auth);location.replace(LOGIN);}catch(e){console.error(e);alert('ออกจากระบบไม่สำเร็จ');logout.disabled=false;}
 });}
}
async function checkMember(user){
 if(checking)return;
 checking=true;
 try{
  const snap=await getDoc(doc(db,'members',user.uid));
  if(!snap.exists()){document.documentElement.classList.remove('tiea-app24-approved');location.replace(WAIT);return;}
  const d=snap.data(), exp=expiryMs(d.expire);
  if(d.role==='admin'||(d.vip===true&&d.active===true&&exp!==null&&Number.isFinite(exp)&&exp>Date.now())){
   memberUI(user,d,exp);
   document.documentElement.classList.add('tiea-app24-approved');
  }else{document.documentElement.classList.remove('tiea-app24-approved');location.replace(WAIT);}
 }catch(err){
  console.error('APP24 VIP check failed',err);
  if(!document.documentElement.classList.contains('tiea-app24-approved'))gateText('ตรวจสอบสมาชิกไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วโหลดหน้าใหม่');
 }finally{checking=false;}
}
onAuthStateChanged(auth,user=>{
 currentUser=user;
 if(!user){document.documentElement.classList.remove('tiea-app24-approved');location.replace(LOGIN);return;}
 gateText('กำลังตรวจสอบสิทธิ์ VIP...');
 checkMember(user);
},err=>{console.error(err);gateText('ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ กรุณาโหลดหน้าใหม่');});
// Recheck when returning to APP24, including after membership changes.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&currentUser)checkMember(currentUser);});
