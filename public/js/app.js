const $=id=>document.getElementById(id),NAMES=['Rouge','Noir','Vert','Orange'];
const E=window.G2Engine;
let W=17,H=23,N=2,TM=false,mode='',moves=[],me=-1,code='',ref=null,unsub=null,unsubChat=null,db=null,auth=null,cid='',authReady=false,ended=false,ready=true,filled=0,hover=null,S=null,cs=20,gameData=null,chatUnread=0,firstChatSnapshot=true,raf=0,COL=null,dirty=true,LC=null,fx=null,wasOver=false,rematchCode='',ai=false,daily='',aiTimer=0,chatRows=[],lastSend=0,kb=[0,0],snd=(()=>{try{return localStorage.getItem('g2p.snd')!=='0'}catch(e){return true}})();
const getNickname=()=>{let v='';try{v=$('nickname').value.trim()||localStorage.getItem('g2p.nickname')||''}catch(e){v=$('nickname').value.trim()}return (v.replace(/[<>\u0000-\u001f]/g,'').slice(0,20)||'Joueur').trim()};
const K=()=>TM?2:N,tmOf=p=>TM?p%2:p;
const turn=()=>S?S.cur:0,over=()=>ended||moves.length>=W*H;
const can=()=>!!S&&!over()&&ready&&((mode=='local'&&!(ai&&S.cur==1))||(mode=='online'&&me==turn()));

/* Le moteur de règles vit dans engine.js (testé avec `npm test`). */
function sync(){
  let reset=false;
  if(S&&(S.n>moves.length||S.w!=W||S.h!=H||S.N!=N||S.tm!=TM))S=null;
  if(!S){S=E.create(W,H,N,TM);reset=true}
  const before=S.n;
  while(S.n<moves.length){E.apply(S,moves[S.n]);S.n++}
  const added=S.n-before;if(reset||added)dirty=true;
  return added>0&&(before>0||added===1); /* vrai = un nouveau coup à signaler (son, effet) */
}

/* Retours : son, vibration, effet de capture */
const RM=matchMedia('(prefers-reduced-motion: reduce)').matches;
let AC=null;
function sfx(k){
  if(!snd)return;
  try{
    AC=AC||new(window.AudioContext||window.webkitAudioContext)();AC.state=='suspended'&&AC.resume();
    const f={place:[520],cap:[440,660,880],win:[523,659,784,1047]}[k],t=AC.currentTime;
    f.forEach((hz,i)=>{const o=AC.createOscillator(),g=AC.createGain(),s0=t+i*.09;o.frequency.value=hz;
      g.gain.setValueAtTime(.0001,s0);g.gain.exponentialRampToValueAtTime(.12,s0+.01);g.gain.exponentialRampToValueAtTime(.0001,s0+.18);
      o.connect(g);g.connect(AC.destination);o.start(s0);o.stop(s0+.2)});
  }catch(e){}
}
const vib=p=>{try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}};
const startFx=()=>{if(!RM)fx={t:performance.now(),team:S.capT,cells:S.cap}};

/* Rendu : couleurs en cache, calque statique (grille, boucles, points) mis en cache, survol dessiné par-dessus */
const COLN=['--line','--c0','--c1','--c2','--c3','--tx'];
const col=n=>(COL||(COL=Object.fromEntries(COLN.map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue(k).trim()]))))[n];
function layer(x,w,h){
  x.strokeStyle=col('--line');x.lineWidth=1;x.beginPath();
  for(let i=1;i<=W;i++){x.moveTo(i*cs,0);x.lineTo(i*cs,h)}
  for(let j=1;j<=H;j++){x.moveTo(0,j*cs);x.lineTo(w,j*cs)}
  x.stroke();
  const {o,d}=S,P=(a,b)=>[(a+1)*cs,(b+1)*cs];
  x.lineCap='round';x.lineWidth=cs*.13;
  for(const {t,c} of S.loops){
    x.fillStyle=col('--c'+t);x.globalAlpha=.13;c.cells.forEach(([a,b])=>x.fillRect(a*cs+cs/2,b*cs+cs/2,cs,cs));x.globalAlpha=1;
    x.strokeStyle=col('--c'+t);
    const live=k=>{const a=k%W,b=(k-a)/W;return o[b][a]==t+1&&!d[b][a]};
    for(const k of c.bd){
      if(!live(k))continue;const a=k%W,b=(k-a)/W;
      for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){
        const u=a+dx,v=b+dy;if(u<0||v<0||u>=W||v>=H)continue;
        const k2=v*W+u;if(!c.bd.has(k2)||!live(k2))continue;
        if(dx&&dy&&(c.bd.has(b*W+u)||c.bd.has(v*W+a)))continue;
        const [x1,y1]=P(a,b),[x2,y2]=P(u,v);x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke();
      }
    }
  }
  const R=cs*.3;
  for(let b=0;b<H;b++)for(let a=0;a<W;a++){
    const p=o[b][a];if(!p)continue;const [px,py]=P(a,b);
    x.globalAlpha=d[b][a]?.4:1;x.fillStyle=col('--c'+(p-1));x.beginPath();x.arc(px,py,R,0,7);x.fill();x.globalAlpha=1;
    if(d[b][a]){x.strokeStyle=col('--tx');x.lineWidth=1.5;x.beginPath();x.moveTo(px-R,py-R);x.lineTo(px+R,py+R);x.moveTo(px+R,py-R);x.lineTo(px-R,py+R);x.stroke()}
  }
}
function paint(){
  if(!S)return;
  const c=$('cv');
  if(!$('game').hidden)document.querySelector('main').style.maxWidth=Math.max(320,Math.min(900,(innerHeight-250)*(W+1)/(H+1)))+'px';
  const w=c.parentElement.clientWidth;if(!w)return;
  cs=w/(W+1);const h=cs*(H+1),r=window.devicePixelRatio||1,pw=Math.round(w*r),ph=Math.round(h*r);
  if(c.width!=pw||c.height!=ph){c.width=pw;c.height=ph;c.style.height=h+'px';dirty=true}
  if(dirty||!LC){
    LC=LC||document.createElement('canvas');LC.width=pw;LC.height=ph;
    const lx=LC.getContext('2d');lx.scale(r,r);layer(lx,w,h);dirty=false;
  }
  const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,pw,ph);x.drawImage(LC,0,0);x.setTransform(r,0,0,r,0,0);
  const R=cs*.3,P=(a,b)=>[(a+1)*cs,(b+1)*cs],{o}=S;
  const L=moves[S.n-1];
  if(L){const [px,py]=P(L[0],L[1]);x.strokeStyle=col('--tx');x.lineWidth=1.5;x.beginPath();x.arc(px,py,R+3,0,7);x.stroke()}
  if(hover&&can()&&!o[hover[1]][hover[0]]){
    const [px,py]=P(hover[0],hover[1]);x.globalAlpha=.55;x.fillStyle=col('--c'+tmOf(turn()));
    x.beginPath();x.arc(px,py,R,0,7);x.fill();x.globalAlpha=1;
  }
  if(fx){
    const p=(performance.now()-fx.t)/600;
    if(p<1){x.strokeStyle=col('--c'+fx.team);x.lineWidth=2;x.globalAlpha=1-p;
      for(const [a,b] of fx.cells){const [px,py]=P(a,b);x.beginPath();x.arc(px,py,R+p*cs*.9,0,7);x.stroke()}
      x.globalAlpha=1;draw()}
    else fx=null;
  }
}
const draw=()=>{raf||(raf=requestAnimationFrame(()=>{raf=0;paint()}))}; /* au plus un rendu par image */
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{COL=null;dirty=true;draw()});

/* Libellés, résultat, historique, partage */
const label=i=>ai&&mode=='local'&&i==1?'IA':NAMES[i];
function result(){ /* un abandon exclut l'équipe fautive du classement */
  const fl=mode=='online'&&gameData&&Number.isInteger(gameData.forfeit)?tmOf(gameData.forfeit):-1;
  const pool=S.sc.map((v,i)=>i).filter(i=>i!=fl),mx=Math.max(...pool.map(i=>S.sc[i]));
  return{fl,mx,w:pool.filter(i=>S.sc[i]==mx)};
}
const loadHist=()=>{try{return JSON.parse(localStorage.getItem('g2p.hist')||'[]')}catch(e){return[]}};
function record(){
  if(S.n<1)return;
  const {w}=result(),mine=mode=='online'?(me>=0?tmOf(me):-1):(ai?0:-1);
  const r=mine<0?'':w.includes(mine)?(w.length>1?'draw':'win'):'loss';
  const h=loadHist();h.unshift({t:Date.now(),k:daily?'daily':ai?'ai':mode,w:W,h:H,sc:S.sc.slice(),r,d:daily||undefined});
  try{localStorage.setItem('g2p.hist',JSON.stringify(h.slice(0,30)))}catch(e){}
  renderHist();
}
function renderHist(){
  const h=loadHist(),box=$('hist');if(!h.length)return;
  const c=k=>h.filter(x=>x.r==k).length,p=document.createElement('p'),ul=document.createElement('ul');
  p.textContent='Victoires '+c('win')+' · Défaites '+c('loss')+' · Nuls '+c('draw')+' · '+h.length+' parties';
  const KN={ai:'Solo IA',daily:'Défi du jour',local:'Local',online:'En ligne'},RN={win:'Victoire',loss:'Défaite',draw:'Nul','':'—'};
  for(const x of h.slice(0,10)){const li=document.createElement('li'),a=document.createElement('span'),b=document.createElement('span');
    a.textContent=new Date(x.t).toLocaleDateString('fr-FR')+' · '+(KN[x.k]||x.k);b.textContent=x.sc.join(' – ')+' · '+RN[x.r];li.append(a,b);ul.append(li)}
  box.replaceChildren(p,ul);
}
$('share').onclick=async()=>{
  const txt='G2Point'+(daily?' — défi du '+daily:'')+' : '+S.sc.map((v,i)=>label(i)+' '+v).join(' – ')+' · '+location.href.split('#')[0];
  try{if(navigator.share){await navigator.share({text:txt});return}await navigator.clipboard.writeText(txt);note('Résultat copié.')}catch(e){}
};

/* Abandon : l'adversaire dont c'est le tour est inactif depuis plus de 2 minutes */
function checkIdle(){
  const t=gameData&&(gameData.lastAt||gameData.createdAt),ms=t&&t.toMillis?Date.now()-t.toMillis():0;
  const on=mode=='online'&&ready&&!!S&&!over()&&me>=0&&me!=turn()&&ms>12e4;
  $('forfeit').hidden=!on;if(on)$('forfeit').textContent='Déclarer l’abandon de '+playerName(gameData,turn());
}
setInterval(checkIdle,10000);
$('forfeit').onclick=async()=>{
  if(!confirm('Déclarer l’abandon de ce joueur ?'))return;
  try{await ref.update({ended:true,forfeit:S.cur})}catch(e){err(e)}
};

/* IA et défi du jour */
const seedOf=d=>+d.replace(/-/g,''),todayStr=()=>new Date().toLocaleDateString('sv-SE');
function dailyOpening(d){ /* 6 pierres posées au hasard (graine = date), identiques pour tous */
  const r=E.rng(seedOf(d)),out=[],used=new Set();
  while(out.length<6){const x=3+((r()*(W-6))|0),y=4+((r()*(H-8))|0);if(!used.has(y*W+x)){used.add(y*W+x);out.push([x,y])}}
  return out;
}
function aiTurn(){
  clearTimeout(aiTimer);
  const ok=()=>mode==='local'&&ai&&!!S&&!over()&&S.cur===1;
  if(!ok())return;
  aiTimer=setTimeout(()=>{
    if(!ok())return;
    moves=[...moves,E.aiMove(S,E.rng((daily?seedOf(daily):Date.now())+moves.length))];upd();saveLocal();aiTurn();
  },380);
}

/* Sauvegarde / reprise */
const loadSave=()=>{try{return JSON.parse(localStorage.getItem('g2p.save')||'null')}catch(e){return null}};
const putSave=v=>{try{localStorage.setItem('g2p.save',JSON.stringify(v))}catch(e){}};
function refreshResume(){
  const sv=loadSave(),b=$('bResume');b.hidden=!sv;
  if(sv)b.textContent=sv.m=='online'?'Reprendre la partie en ligne '+sv.c:'Reprendre '+(sv.d?'le défi du jour':sv.ai?'la partie contre l’IA':'la partie locale')+' ('+sv.mv.length+' coups)';
}
function clearSave(){try{localStorage.removeItem('g2p.save')}catch(e){}refreshResume()}
const saveLocal=()=>putSave({m:'local',ai,d:daily,w:W,h:H,n:N,tm:TM,mv:moves.map(([a,b])=>b*W+a)});

function upd(){
  const fresh=sync();const o=over(),p=turn(),t=tmOf(p),mt=me>=0?tmOf(me):-1,nm=i=>(TM?'Équipe ':'')+label(i);
  $('bar').style.gridTemplateColumns='repeat('+K()+',1fr)';
  $('bar').innerHTML=S.sc.map((v,i)=>'<div class="chip'+(!o&&ready&&i==t?' on':'')+'" style="--c:var(--c'+i+')"><span>'+label(i)+(mode=='online'&&i==mt?' ★':'')+'</span><b>'+v+'</b></div>').join('');
  let m;
  if(mode=='online'&&!ready)m='En attente des joueurs ('+filled+'/'+N+'). Partagez le code '+code+'.';
  else if(o){
    const {fl,mx,w}=result();
    m=(fl>=0?nm(fl)+' a abandonné. ':'')+(w.length>1?'Égalité à '+mx+' point'+(mx>1?'s':''):nm(w[0])+' gagne avec '+mx+' point'+(mx>1?'s':''));
  }
  else if(mode=='local')m='Au tour de '+nm(t)+(TM?' (joueur '+(p+1)+')':'');
  else if(me<0)m='Vous observez la partie.';
  else m=me==p?'À vous de jouer ('+nm(t)+')':'Au tour de '+nm(t)+(TM?' (joueur '+(p+1)+')':'');
  $('msg').textContent=m+(!o&&ready&&S.bonus?' — point bonus !':'');
  $('end').hidden=o||!ready;$('rematch').hidden=!o||(mode=='online'&&me<0);$('share').hidden=!o;checkIdle();
  $('rematch').textContent=mode=='online'&&rematchCode?'Rejoindre la revanche':'Revanche';
  document.title=(mode=='online'&&!o&&ready&&me==p?'▶ À vous · ':'')+'G2Point — Jeu de points';
  if(fresh){if(S.cap.length){startFx();sfx('cap');vib([30,40,30])}else{sfx('place');if(mode=='online'&&me==p)vib(40)}}
  if(o&&!wasOver){sfx('win');clearSave();record()}
  wasOver=o;
  draw();
}

const note=t=>($('menu').hidden?$('gnote'):$('mnote')).textContent=t||'';
const err=e=>{const c=e&&e.code;let m=c=='permission-denied'?'Accès refusé : vérifiez la configuration et les règles Firestore.':c=='functions/unauthenticated'?'Connectez-vous puis réessayez.':((e&&(e.message||e.code))||String(e));note('Erreur : '+m)};
function show(g){$('menu').hidden=g;$('game').hidden=!g;note('');if(!g){document.querySelector('main').style.maxWidth='';document.title='G2Point — Jeu de points';refreshResume()}}
const seatsOf=v=>Array.from({length:v.n},(_,k)=>v['s'+k]);

function sub(){
  unsub&&unsub();
  unsub=ref.onSnapshot(s=>{
    if(!s.exists){note('Partie introuvable.');return}
    const v=s.data(),sd=seatsOf(v);
    if(v.w!=W||v.h!=H||v.n!=N||!!v.tm!==TM)S=null;
    gameData=v;rematchCode=v.next||'';W=v.w;H=v.h;N=v.n;TM=!!v.tm;moves=(v.moves||[]).map(k=>[k%W,(k/W)|0]);ended=!!v.ended;
    ready=sd.every(Boolean);filled=sd.filter(Boolean).length;me=sd.indexOf(cid);renderOnlinePanel(v);upd();
  },e=>err(e));
  startChatListener();
}

function playerName(v,i){return (v&&v['name'+i]||'').trim()||'Joueur '+(i+1)}
function playerNameByUid(uid){
  if(!gameData||!uid)return 'Joueur';
  for(let i=0;i<(gameData.n||0);i++)if(gameData['s'+i]===uid)return playerName(gameData,i);
  return 'Joueur';
}
function renderOnlinePanel(v){
  const panel=$('onlinePanel');panel.hidden=mode!=='online';
  if(mode!=='online')return;
  $('gameCode').textContent=code||'—';
  const roster=$('roster');roster.replaceChildren();
  for(let i=0;i<v.n;i++){
    const uid=v['s'+i]||'',line=document.createElement('div');line.className='roster-player'+(uid?' filled':'');
    const name=document.createElement('span');name.textContent=(uid?playerName(v,i):'Place '+(i+1));
    const state=document.createElement('span');state.className='seat-state';state.textContent=uid?(uid===cid?'Vous':(v.tm?'Équipe '+(i%2===0?'Rouge':'Noir'):'Connecté')):'En attente';
    line.append(name,state);roster.append(line);
  }
  const badge=$('chatBadge');badge.hidden=chatUnread<1;badge.textContent=chatUnread>99?'99+':String(chatUnread);
}
function renderChatMessages(rows){
  const box=$('chatMessages'),wasNearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<70;
  box.replaceChildren();
  if(!rows.length){const empty=document.createElement('p');empty.className='chat-empty';empty.textContent='Aucun message pour le moment. Lancez la discussion.';box.append(empty);return}
  for(const row of rows){
    const d=row.data||{},msg=document.createElement('article');msg.className='chat-message'+(d.uid===cid?' mine':'');
    const meta=document.createElement('div');meta.className='chat-meta';
    const author=document.createElement('span');author.className='chat-author';author.textContent=d.uid===cid?'Vous':playerNameByUid(d.uid);
    const time=document.createElement('time');let date=null;try{date=d.createdAt&&d.createdAt.toDate?d.createdAt.toDate():null}catch(e){}
    time.textContent=date?date.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):'…';meta.append(author,time);
    const text=document.createElement('p');text.className='chat-text';text.textContent=String(d.text||'');msg.append(meta,text);box.append(msg);
  }
  if(wasNearBottom||!$('chatDialog').hidden)box.scrollTop=box.scrollHeight;
}
function startChatListener(){
  if(!ref||mode!=='online')return;
  unsubChat&&unsubChat();firstChatSnapshot=true;
  unsubChat=ref.collection('messages').orderBy('createdAt','asc').limitToLast(100).onSnapshot(snap=>{
    if(!firstChatSnapshot&&$('chatDialog').hidden){
      for(const ch of snap.docChanges())if(ch.type==='added'&&ch.doc.data().uid!==cid)chatUnread++;
    }
    firstChatSnapshot=false;chatRows=snap.docs.map(d=>({id:d.id,data:d.data()}));if(!$('chatDialog').hidden)renderChatMessages(chatRows);
    const badge=$('chatBadge');badge.hidden=chatUnread<1;badge.textContent=chatUnread>99?'99+':String(chatUnread);
    $('chatState').textContent='Discussion de la partie '+code+' · 100 derniers messages affichés';
  },e=>{$('chatState').textContent='Discussion indisponible : vérifiez les règles Firestore.';console.warn(e)});
}
async function sendChatMessage(text){
  const clean=String(text||'').trim().slice(0,500);
  if(!clean||mode!=='online'||!ref||!cid||Date.now()-lastSend<800)return;lastSend=Date.now();
  const send=$('chatSend');send.disabled=true;
  try{await ref.collection('messages').add({uid:cid,text:clean,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expireAt:expiry()});$('chatInput').value='';}
  catch(e){err(e);$('chatState').textContent='Envoi impossible. Vérifiez votre connexion et les règles Firestore.'}
  finally{send.disabled=false;$('chatInput').focus()}
}

const expiry=()=>firebase.firestore.Timestamp.fromMillis(Date.now()+7*864e5); /* purge via la politique TTL Firestore */
async function place(pt){
  if(!pt||!can()||S.o[pt[1]][pt[0]])return;
  note('');
  moves=[...moves,pt];upd(); /* coup optimiste : visible tout de suite, sans attendre le serveur */
  if(mode==='local'){saveLocal();aiTurn();return}
  try{ /* une seule écriture (pas de transaction) ; les règles Firestore valident tour et case libre */
    await ref.update({moves:firebase.firestore.FieldValue.arrayUnion(pt[1]*W+pt[0]),cur:S.cur,lastAt:firebase.firestore.FieldValue.serverTimestamp()});
  }catch(e){note('Coup refusé : ce n’était pas votre tour ou la partie a changé.');console.warn(e)} /* le snapshot suivant annule le coup */
}

const cv=$('cv');
const pt=e=>{const r=cv.getBoundingClientRect(),a=Math.round((e.clientX-r.left)/cs)-1,b=Math.round((e.clientY-r.top)/cs)-1;return a>=0&&b>=0&&a<W&&b<H?[a,b]:null};
cv.onpointerdown=e=>{if(!can())return;cv.setPointerCapture(e.pointerId);hover=pt(e);draw()};
cv.onpointermove=e=>{if(!can())return;hover=pt(e);draw()};
cv.onpointerup=e=>{const p=pt(e);hover=null;place(p);draw()};
cv.onpointerleave=()=>{hover=null;draw()};
cv.onpointercancel=()=>{hover=null;draw()};
window.addEventListener('resize',draw);

const readOpts=()=>{
  const [w,h]=$('size').value.split('x');W=+w;H=+h;ai=$('np').value==='ai';daily='';TM=$('np').value==='team';N=TM?4:ai?2:+$('np').value;
  moves=[];S=null;ended=false;wasOver=false;
};
$('np').onchange=()=>{$('modeHint').textContent=$('np').value==='team'?'Deux équipes alternent leurs tours : joueurs 1 et 3 contre joueurs 2 et 4.':$('np').value==='ai'?'Solo : vous jouez Rouge contre l’ordinateur.':$('np').value==='2'?'Duel : deux joueurs se relaient.':'Chacun pour soi : chaque joueur a son propre score.'};
$('nickname').onchange=()=>{try{localStorage.setItem('g2p.nickname',getNickname())}catch(e){}};
try{$('nickname').value=localStorage.getItem('g2p.nickname')||''}catch(e){}
$('bLocal').onclick=()=>{readOpts();mode='local';ready=true;me=-1;code='';gameData=null;renderOnlinePanel({n:N});show(true);upd()};
async function createGame(same){
  if(!db||!authReady||!cid){note('La connexion en ligne n’est pas prête. Vérifiez Firebase et réessayez.');return false}
  if(!same)readOpts();
  try{
    // L'alphabet contient 32 symboles : chaque octet aléatoire donne un caractère sans biais. Ne jamais écraser un salon.
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let created=false,nc='',nr=null;
    for(let attempt=0;attempt<5&&!created;attempt++){
      const bytes=new Uint8Array(5);crypto.getRandomValues(bytes);
      nc=Array.from(bytes,b=>alphabet[b&31]).join('');nr=db.doc('games/'+nc);
      created=await db.runTransaction(async tx=>{
        if((await tx.get(nr)).exists)return false;
        tx.set(nr,{n:N,tm:TM,w:W,h:H,s0:cid,s1:'',s2:'',s3:'',name0:getNickname(),name1:'',name2:'',name3:'',moves:[],cur:0,ended:false,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expireAt:expiry()});
        return true;
      });
    }
    if(!created)throw new Error('Impossible de générer un code de partie unique. Réessayez.');
    ai=false;daily='';code=nc;ref=nr;mode='online';ready=false;me=0;gameData=null;chatUnread=0;S=null;moves=[];ended=false;rematchCode='';wasOver=false;
    putSave({m:'online',c:code});show(true);sub();return true;
  }catch(e){err(e);return false}
}
async function joinGame(c){
  if(!db||!authReady||!cid){note('La connexion en ligne n’est pas prête. Vérifiez Firebase et réessayez.');return false}
  c=String(c||'').trim().toUpperCase();if(c.length!==5){note('Entrez le code à 5 caractères.');return false}
  const r=db.doc('games/'+c);
  try{
    await db.runTransaction(async tx=>{
      const sn=await tx.get(r);if(!sn.exists)throw new Error('Aucune partie avec ce code.');
      const v=sn.data();if(v.ended)throw new Error('Cette partie est terminée.');
      const seats=seatsOf(v);let i=seats.indexOf(cid);
      if(i<0){i=seats.findIndex(x=>!x);if(i<0)throw new Error('Cette partie est déjà complète.');
        tx.update(r,{['s'+i]:cid,['name'+i]:getNickname()});}
    });
    ai=false;daily='';code=c;ref=r;mode='online';chatUnread=0;S=null;rematchCode='';wasOver=false;putSave({m:'online',c:code});show(true);sub();return true;
  }catch(e){err(e);return false}
}
$('bNew').onclick=()=>createGame(false);
$('bJoin').onclick=()=>joinGame($('code').value);
$('bResume').onclick=()=>{
  const sv=loadSave();if(!sv)return;
  if(sv.m=='online'){joinGame(sv.c).then(ok=>{if(!ok)clearSave()});return}
  W=sv.w;H=sv.h;N=sv.n;TM=!!sv.tm;ai=!!sv.ai;daily=sv.d||'';moves=sv.mv.map(k=>[k%W,(k/W)|0]);S=null;ended=false;wasOver=false;mode='local';ready=true;me=-1;code='';gameData=null;
  renderOnlinePanel({n:N});show(true);if(daily)note('Défi du jour — '+daily);upd();aiTurn();
};
$('bDaily').onclick=()=>{
  ai=true;daily=todayStr();W=11;H=15;N=2;TM=false;moves=dailyOpening(daily);S=null;ended=false;wasOver=false;mode='local';ready=true;me=-1;code='';gameData=null;
  renderOnlinePanel({n:N});show(true);note('Défi du jour — '+daily);upd();
};
$('rematch').onclick=async()=>{
  if(mode=='local'){moves=daily?dailyOpening(daily):[];S=null;ended=false;wasOver=false;upd();aiTurn();return}
  if(rematchCode){joinGame(rematchCode);return}
  const old=ref;if(await createGame(true)&&old)old.update({next:code}).catch(()=>{}); /* invite les autres joueurs */
};
$('end').onclick=async()=>{
  if(!confirm('Terminer la partie maintenant ?'))return;
  if(mode=='local'){ended=true;upd()}
  else try{await ref.update({ended:true})}catch(e){err(e)}
};
$('back').onclick=()=>{clearTimeout(aiTimer);unsub&&unsub();unsub=null;unsubChat&&unsubChat();unsubChat=null;$('chatDialog').hidden=true;mode='';moves=[];S=null;gameData=null;show(false);renderOnlinePanel({n:N})};

$('online').hidden=false;
$('bNew').disabled=true;$('bJoin').disabled=true;
const FIREBASE_CONFIG=window.G2POINT_FIREBASE_CONFIG||{};
const validConfig=!!(FIREBASE_CONFIG.apiKey&&FIREBASE_CONFIG.authDomain&&FIREBASE_CONFIG.projectId&&FIREBASE_CONFIG.appId&&!String(FIREBASE_CONFIG.apiKey).includes('REMPLACER'));
if(window.firebase&&validConfig){
  try{
    firebase.initializeApp(FIREBASE_CONFIG);db=firebase.firestore();auth=firebase.auth();
    auth.onAuthStateChanged(user=>{
      if(user){cid=user.uid;authReady=true;$('bNew').disabled=false;$('bJoin').disabled=false;$('onlineSetup').hidden=true;$('hint').hidden=false;$('onlineState').textContent='Connexion prête. Créez une partie ou saisissez un code.'}
      else{cid='';authReady=false;$('bNew').disabled=true;$('bJoin').disabled=true;$('onlineSetup').hidden=false;$('hint').hidden=true}
    });
    auth.signInAnonymously().catch(e=>{
      console.error(e);$('onlineSetup').hidden=false;
      $('onlineSetup').textContent='Connexion Firebase impossible. Activez la connexion anonyme dans Authentication > Sign-in method, puis rechargez la page.';
      $('onlineState').textContent='Connexion indisponible.';
    });
  }catch(e){console.error(e);$('onlineState').textContent='Configuration Firebase invalide.'}
}else{
  $('onlineSetup').hidden=false;
  $('onlineState').textContent='Mode local disponible. Configurez Firebase pour activer le multijoueur en ligne.';
}

$('chatOpen').onclick=()=>{if(mode!=='online')return;chatUnread=0;$('chatBadge').hidden=true;$('chatDialog').hidden=false;renderChatMessages(chatRows);renderOnlinePanel(gameData||{n:N});$('chatInput').focus()};
$('chatClose').onclick=()=>$('chatDialog').hidden=true;
$('chatBackdrop').onclick=e=>{if(e.target===$('chatBackdrop'))$('chatDialog').hidden=true};
$('chatForm').addEventListener('submit',e=>{e.preventDefault();sendChatMessage($('chatInput').value)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('chatDialog').hidden=true});
$('copyCode').onclick=async()=>{
  if(!code)return;
  try{await navigator.clipboard.writeText(code);note('Code '+code+' copié. Envoyez-le à vos amis.');}
  catch(e){const field=document.createElement('textarea');field.value=code;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}field.remove();note(ok?'Code '+code+' copié.':'Code à partager : '+code)}
};

/* Son, clavier, hors-ligne */
const sndLabel=()=>$('snd').textContent=snd?'🔊 Son':'🔇 Muet';sndLabel();
$('snd').onclick=()=>{snd=!snd;try{localStorage.setItem('g2p.snd',snd?'1':'0')}catch(e){}sndLabel()};
cv.onkeydown=e=>{
  const dir={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
  if(dir){e.preventDefault();const c=hover||kb;hover=kb=[Math.max(0,Math.min(W-1,c[0]+dir[0])),Math.max(0,Math.min(H-1,c[1]+dir[1]))];draw()}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();place(hover||kb)}
};
refreshResume();renderHist();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
