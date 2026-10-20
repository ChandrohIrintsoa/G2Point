/* G2Point — « cerveau » de l'IA synchronisable entre appareils (module pur : navigateur et Node/tests).
   La fusion est monotone, idempotente et commutative : fusionner deux fois, ou dans un autre ordre, donne le même résultat.
   - Livres d'ouvertures/motifs : pour chaque position on garde l'entrée la plus expérimentée (plus de parties, puis plus récente).
     On ne SOMME jamais : une somme compterait deux fois les mêmes parties à chaque synchronisation.
   - Poids, population génétique et profil adverse : ceux de l'IA la plus expérimentée (parties + simulations).
   - Compteurs et statistiques du tournoi : maximum champ par champ. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.G2Brain=factory();
})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const VERSION=1,BOOKS=['book','antiBook','sbook','antiSBook'],MAX_BOOK=2500,MAX_KEY=200;
const num=(v,d=0)=>Number.isFinite(+v)?+v:d;
const isW=w=>Array.isArray(w)&&w.length===6&&w.every(Number.isFinite);
const experience=a=>Math.max(0,num(a&&a.games))+Math.max(0,num(a&&a.simulations));

function cleanBook(b){
  const out={};if(!b||typeof b!=='object'||Array.isArray(b))return out;
  let n=0;
  for(const k of Object.keys(b)){
    const v=b[k];if(!Array.isArray(v)||k.length>MAX_KEY)continue;
    out[k]=[Math.max(0,num(v[0])),num(v[1]),Math.max(0,num(v[2])),num(v[3])];
    if(++n>=MAX_BOOK)break;
  }
  return out;
}
function mergeBook(a,b){
  const out={},A=cleanBook(a),B=cleanBook(b);
  for(const k of Object.keys(A))out[k]=A[k];
  for(const k of Object.keys(B)){
    const x=out[k],y=B[k];
    if(!x||y[0]>x[0]||(y[0]===x[0]&&y[3]>x[3]))out[k]=y;
  }
  return out;
}
/* Extrait la partie synchronisable d'une mémoire IA locale (sans le journal de coups, local à l'appareil). */
function pack(ai,train,now=Date.now()){
  ai=ai||{};
  const p={v:VERSION,at:now,w:isW(ai.w)?ai.w.slice():null,c:isW(ai.c)?ai.c.slice():null,
    pop:Array.isArray(ai.pop)&&ai.pop.length===8&&ai.pop.every(x=>x&&isW(x.w))?ai.pop.map(x=>({w:x.w.slice(),score:num(x.score),played:num(x.played),elo:num(x.elo,1200)})):null,
    active:Math.max(0,Math.min(7,Math.floor(num(ai.active)))),
    st:{g:Math.max(0,num(ai.st&&ai.st.g)),w:Math.max(0,num(ai.st&&ai.st.w))},
    games:Math.max(0,num(ai.games)),simulations:Math.max(0,num(ai.simulations)),manualLessons:Math.max(0,num(ai.manualLessons)),
    opponent:ai.opponent&&typeof ai.opponent==='object'?{samples:num(ai.opponent.samples),captures:num(ai.opponent.captures),cluster:num(ai.opponent.cluster),edge:num(ai.opponent.edge)}:null,
    train:cleanTrain(train)};
  for(const k of BOOKS)p[k]=cleanBook(ai[k]);
  return p;
}
function cleanTrain(t){
  if(!t||typeof t!=='object')return null;
  const out={epoch:Math.max(0,num(t.epoch)),games:Math.max(0,num(t.games)),incomplete:Math.max(0,num(t.incomplete)),cursor:Math.max(0,num(t.cursor)),pauses:Math.max(0,num(t.pauses)),pauseUntil:Math.max(0,num(t.pauseUntil)),
    lastPause:t.lastPause&&typeof t.lastPause==='object'?t.lastPause:null,stats:{},streaks:{}};
  for(const id of Object.keys(t.stats||{}).slice(0,16)){const x=t.stats[id]||{};out.stats[id]={w:Math.max(0,num(x.w)),l:Math.max(0,num(x.l)),d:Math.max(0,num(x.d))}}
  for(const id of Object.keys(t.streaks||{}).slice(0,16))out.streaks[id]=Math.max(0,num(t.streaks[id]));
  return out;
}
function mergeTrain(a,b){
  a=cleanTrain(a);b=cleanTrain(b);
  if(!a)return b;if(!b)return a;
  /* Une remise à zéro (epoch plus récent) l'emporte entièrement : sinon le maximum ressusciterait les anciennes statistiques. */
  if(a.epoch!==b.epoch)return a.epoch>b.epoch?a:b;
  const lead=a.games>=b.games?a:b,out={epoch:a.epoch,games:Math.max(a.games,b.games),incomplete:Math.max(a.incomplete,b.incomplete),pauses:Math.max(a.pauses,b.pauses),
    pauseUntil:Math.max(a.pauseUntil,b.pauseUntil),cursor:lead.cursor,lastPause:lead.lastPause||a.lastPause||b.lastPause,stats:{},streaks:{...lead.streaks}};
  for(const id of new Set([...Object.keys(a.stats),...Object.keys(b.stats)])){
    const x=a.stats[id]||{w:0,l:0,d:0},y=b.stats[id]||{w:0,l:0,d:0};
    out.stats[id]={w:Math.max(x.w,y.w),l:Math.max(x.l,y.l),d:Math.max(x.d,y.d)};
  }
  return out;
}
/* a, b : cerveaux produits par pack(). Résultat : un nouveau cerveau, supérieur ou égal aux deux. */
function merge(a,b){
  if(!a)return b||null;if(!b)return a;
  const lead=experience(a)>=experience(b)?a:b,other=lead===a?b:a,out={v:VERSION,at:Math.max(num(a.at),num(b.at))};
  for(const k of ['w','c','pop','active','opponent'])out[k]=lead[k]!=null?lead[k]:other[k];
  out.st={g:Math.max(num(a.st&&a.st.g),num(b.st&&b.st.g)),w:Math.max(num(a.st&&a.st.w),num(b.st&&b.st.w))};
  for(const k of ['games','simulations','manualLessons'])out[k]=Math.max(num(a[k]),num(b[k]));
  for(const k of BOOKS)out[k]=mergeBook(a[k],b[k]);
  out.train=mergeTrain(a.train,b.train);
  return out;
}
/* Applique un cerveau fusionné à une mémoire IA locale (qui garde son journal et ses champs propres). */
function applyTo(ai,brain){
  const out={...ai};if(!brain)return out;
  for(const k of ['w','c','pop','opponent'])if(brain[k])out[k]=brain[k];
  if(Number.isFinite(brain.active))out.active=brain.active;
  out.st={...(ai.st||{}),...brain.st};
  for(const k of ['games','simulations','manualLessons'])out[k]=Math.max(num(ai[k]),num(brain[k]));
  for(const k of BOOKS)out[k]=brain[k];
  return out;
}
/* Empreinte légère, indépendante de l'ordre des clés : deux cerveaux de même empreinte sont équivalents
   (évite d'écrire dans le cloud quand rien n'a changé). */
function fingerprint(b){
  if(!b)return '';
  const f=[b.games,b.simulations,b.manualLessons,b.st&&b.st.g,b.st&&b.st.w,b.active,(b.w||[]).join(','),b.train&&b.train.games,b.train&&b.train.pauses];
  for(const k of BOOKS){let n=0,c=0,wn=0,t=0;for(const key of Object.keys(b[k]||{})){const e=b[k][key];n++;c+=e[0];wn+=e[2];t=Math.max(t,e[3])}f.push(n,c,wn,t)}
  return f.join('|');
}
const same=(a,b)=>fingerprint(a)===fingerprint(b);
return{VERSION,pack,merge,mergeBook,mergeTrain,applyTo,same,fingerprint,cleanBook,cleanTrain,experience,MAX_BOOK};
});
