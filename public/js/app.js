const $=id=>document.getElementById(id),NAMES=['Rouge','Noir','Vert','Orange'];
const N4=[[1,0],[-1,0],[0,1],[0,-1]],N8=[...N4,[1,1],[1,-1],[-1,1],[-1,-1]];
let W=17,H=23,N=2,TM=false,mode='',moves=[],me=-1,code='',ref=null,unsub=null,unsubChat=null,db=null,auth=null,cid='',authReady=false,ended=false,ready=true,filled=0,hover=null,S=null,cs=20,gameData=null,chatUnread=0,firstChatSnapshot=true;
const getNickname=()=>{let v='';try{v=$('nickname').value.trim()||localStorage.getItem('g2p.nickname')||''}catch(e){v=$('nickname').value.trim()}return (v.replace(/[<>\u0000-\u001f]/g,'').slice(0,20)||'Joueur').trim()};
const K=()=>TM?2:N,tmOf=p=>TM?p%2:p,grid=v=>Array.from({length:H},()=>Array(W).fill(v));
const turn=()=>S?S.cur:0,over=()=>ended||moves.length>=W*H;
const can=()=>!!S&&!over()&&ready&&(mode=='local'||(mode=='online'&&me==turn()));

/* Zones fermées par l'équipe t : composantes de cases non atteignables depuis le bord */
function scan(s,t){
  const {o,d}=s,wall=(a,b)=>o[b][a]==t+1&&!d[b][a],seen=grid(false),st=[];
  const push=(a,b)=>{if(!seen[b][a]&&!wall(a,b)){seen[b][a]=true;st.push([a,b])}};
  for(let a=0;a<W;a++){push(a,0);push(a,H-1)}
  for(let b=0;b<H;b++){push(0,b);push(W-1,b)}
  while(st.length){const [a,b]=st.pop();for(const [dx,dy] of N4){const u=a+dx,v=b+dy;if(u>=0&&v>=0&&u<W&&v<H)push(u,v)}}
  const comps=[],vis=grid(false);
  for(let b=0;b<H;b++)for(let a=0;a<W;a++){
    if(seen[b][a]||wall(a,b)||vis[b][a])continue;
    const cells=[],bd=new Set(),q=[[a,b]];vis[b][a]=true;
    while(q.length){
      const [i,j]=q.pop();cells.push([i,j]);
      for(const [dx,dy] of N8){
        const u=i+dx,v=j+dy;if(u<0||v<0||u>=W||v>=H)continue;
        if(wall(u,v))bd.add(v*W+u);
        else if(dx*dy==0&&!seen[v][u]&&!vis[v][u]){vis[v][u]=true;q.push([u,v])}
      }
    }
    comps.push({cells,bd});
  }
  return comps;
}

function apply(s,[x,y]){
  const t=tmOf(s.cur);s.o[y][x]=t+1;let g=0;
  for(const c of scan(s,t)){
    const vic=c.cells.filter(([a,b])=>s.o[b][a]&&s.o[b][a]!=t+1&&!s.d[b][a]);
    if(vic.length){vic.forEach(([a,b])=>s.d[b][a]=true);s.sc[t]+=vic.length;g+=vic.length;s.loops.push({t,c})}
  }
  if(!g)for(let u=0;u<K();u++){ /* piège : point posé dans une zone déjà fermée par un adversaire */
    if(u==t)continue;
    const c=scan(s,u).find(c=>c.cells.some(([a,b])=>a==x&&b==y));
    if(c){s.d[y][x]=true;s.sc[u]++;s.loops.push({t:u,c});break}
  }
  s.bonus=g>0;if(!s.bonus)s.cur=(s.cur+1)%N; /* capture = le même joueur rejoue */
}
function sync(){
  if(S&&(S.n>moves.length||S.w!=W||S.h!=H))S=null;
  if(!S)S={n:0,w:W,h:H,o:grid(0),d:grid(false),sc:Array(K()).fill(0),loops:[],cur:0,bonus:false};
  while(S.n<moves.length){apply(S,moves[S.n]);S.n++}
}

function draw(){
  const c=$('cv'),w=c.parentElement.clientWidth;if(!w||!S)return;
  cs=w/(W+1);const h=cs*(H+1),r=window.devicePixelRatio||1;
  c.width=w*r;c.height=h*r;c.style.height=h+'px';
  const x=c.getContext('2d');x.scale(r,r);
  const st=getComputedStyle(document.documentElement),col=n=>st.getPropertyValue(n).trim();
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
  const L=moves[S.n-1];
  if(L){const [px,py]=P(L[0],L[1]);x.strokeStyle=col('--tx');x.lineWidth=1.5;x.beginPath();x.arc(px,py,R+3,0,7);x.stroke()}
  if(hover&&can()&&!o[hover[1]][hover[0]]){
    const [px,py]=P(hover[0],hover[1]);x.globalAlpha=.55;x.fillStyle=col('--c'+tmOf(turn()));
    x.beginPath();x.arc(px,py,R,0,7);x.fill();x.globalAlpha=1;
  }
}

function upd(){
  sync();const o=over(),p=turn(),t=tmOf(p),mt=me>=0?tmOf(me):-1,nm=i=>(TM?'Équipe ':'')+NAMES[i];
  $('bar').style.gridTemplateColumns='repeat('+K()+',1fr)';
  $('bar').innerHTML=S.sc.map((v,i)=>'<div class="chip'+(!o&&ready&&i==t?' on':'')+'" style="--c:var(--c'+i+')"><span>'+NAMES[i]+(mode=='online'&&i==mt?' ★':'')+'</span><b>'+v+'</b></div>').join('');
  let m;
  if(mode=='online'&&!ready)m='En attente des joueurs ('+filled+'/'+N+'). Partagez le code '+code+'.';
  else if(o){
    const mx=Math.max(...S.sc),w=S.sc.map((v,i)=>v==mx?i:-1).filter(i=>i>=0);
    m=w.length>1?'Égalité à '+mx+' point'+(mx>1?'s':''):nm(w[0])+' gagne avec '+mx+' point'+(mx>1?'s':'');
  }
  else if(mode=='local')m='Au tour de '+nm(t)+(TM?' (joueur '+(p+1)+')':'');
  else if(me<0)m='Vous observez la partie.';
  else m=me==p?'À vous de jouer ('+nm(t)+')':'Au tour de '+nm(t)+(TM?' (joueur '+(p+1)+')':'');
  $('msg').textContent=m+(!o&&ready&&S.bonus?' — point bonus !':'');
  $('end').hidden=o||!ready;
  draw();
}

const note=t=>($('menu').hidden?$('gnote'):$('mnote')).textContent=t||'';
const err=e=>{const c=e&&e.code;let m=c=='permission-denied'?'Accès refusé : vérifiez la configuration et les règles Firestore.':c=='functions/unauthenticated'?'Connectez-vous puis réessayez.':((e&&(e.message||e.code))||String(e));note('Erreur : '+m)};
function show(g){$('menu').hidden=g;$('game').hidden=!g;note('')}
const seatsOf=v=>Array.from({length:v.n},(_,k)=>v['s'+k]);

function sub(){
  unsub&&unsub();
  unsub=ref.onSnapshot(s=>{
    if(!s.exists){note('Partie introuvable.');return}
    const v=s.data(),sd=seatsOf(v);
    if(v.w!=W||v.h!=H||v.n!=N||!!v.tm!==TM)S=null;
    gameData=v;W=v.w;H=v.h;N=v.n;TM=!!v.tm;moves=(v.moves||[]).map(k=>[k%W,(k/W)|0]);ended=!!v.ended;
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
    firstChatSnapshot=false;renderChatMessages(snap.docs.map(d=>({id:d.id,data:d.data()})));
    const badge=$('chatBadge');badge.hidden=chatUnread<1;badge.textContent=chatUnread>99?'99+':String(chatUnread);
    $('chatState').textContent='Discussion de la partie '+code+' · 100 derniers messages affichés';
  },e=>{$('chatState').textContent='Discussion indisponible : vérifiez les règles Firestore.';console.warn(e)});
}
async function sendChatMessage(text){
  const clean=String(text||'').trim().slice(0,500);
  if(!clean||mode!=='online'||!ref||!cid)return;
  const send=$('chatSend');send.disabled=true;
  try{await ref.collection('messages').add({uid:cid,text:clean,createdAt:firebase.firestore.FieldValue.serverTimestamp()});$('chatInput').value='';}
  catch(e){err(e);$('chatState').textContent='Envoi impossible. Vérifiez votre connexion et les règles Firestore.'}
  finally{send.disabled=false;$('chatInput').focus()}
}

async function place(pt){
  if(!pt||!can()||S.o[pt[1]][pt[0]])return;
  note('');
  if(mode==='local'){moves=[...moves,pt];upd();return}
  try{
    const cell=pt[1]*W+pt[0],expectedCount=moves.length;
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref);if(!snap.exists)throw new Error('Cette partie n’existe plus.');
      const v=snap.data(),list=v.moves||[];
      if(v.ended)throw new Error('Cette partie est terminée.');
      if(!seatsOf(v).includes(cid))throw new Error('Vous ne faites pas partie de cette partie.');
      if(list.length!==expectedCount)throw new Error('La partie vient de changer. Attendez la mise à jour puis rejouez.');
      if(list.includes(cell))throw new Error('Cette intersection est déjà occupée.');
      if(me!==turn())throw new Error('Ce n’est pas votre tour.');
      tx.update(ref,{moves:list.concat(cell)});
    });
  }catch(e){err(e)}
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
  const [w,h]=$('size').value.split('x');W=+w;H=+h;TM=$('np').value==='team';N=TM?4:+$('np').value;
  moves=[];S=null;ended=false;
};
$('np').onchange=()=>{$('modeHint').textContent=$('np').value==='team'?'Deux équipes alternent leurs tours : joueurs 1 et 3 contre joueurs 2 et 4.':$('np').value==='2'?'Duel : deux joueurs se relaient.':'Chacun pour soi : chaque joueur a son propre score.'};
$('nickname').onchange=()=>{try{localStorage.setItem('g2p.nickname',getNickname())}catch(e){}};
try{$('nickname').value=localStorage.getItem('g2p.nickname')||''}catch(e){}
$('bLocal').onclick=()=>{readOpts();mode='local';ready=true;me=-1;code='';gameData=null;renderOnlinePanel({n:N});show(true);upd()};
$('bNew').onclick=async()=>{
  if(!db||!authReady||!cid){note('La connexion en ligne n’est pas prête. Vérifiez Firebase et réessayez.');return}
  readOpts();
  mode='online';ready=false;me=0;gameData=null;chatUnread=0;S=null;
  try{
    // HTTPS browsers expose Web Crypto. The alphabet contains exactly 32 symbols,
    // so each random byte maps evenly to one character. Never overwrite a room.
    const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let created=false;
    for(let attempt=0;attempt<5&&!created;attempt++){
      const bytes=new Uint8Array(5);crypto.getRandomValues(bytes);
      code=Array.from(bytes,b=>alphabet[b&31]).join('');
      ref=db.doc('games/'+code);
      created=await db.runTransaction(async tx=>{
        const existing=await tx.get(ref);
        if(existing.exists)return false;
        tx.set(ref,{n:N,tm:TM,w:W,h:H,s0:cid,s1:'',s2:'',s3:'',name0:getNickname(),name1:'',name2:'',name3:'',moves:[],ended:false,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
        return true;
      });
    }
    if(!created)throw new Error('Impossible de générer un code de partie unique. Réessayez.');
    show(true);sub();
  }catch(e){mode='';err(e)}
};
$('bJoin').onclick=async()=>{
  if(!db||!authReady||!cid){note('La connexion en ligne n’est pas prête. Vérifiez Firebase et réessayez.');return}
  const c=$('code').value.trim().toUpperCase();if(c.length!==5){note('Entrez le code à 5 caractères.');return}
  const r=db.doc('games/'+c);
  try{
    await db.runTransaction(async tx=>{
      const s=await tx.get(r);if(!s.exists)throw new Error('Aucune partie avec ce code.');
      const v=s.data();if(v.ended)throw new Error('Cette partie est terminée.');
      const seats=seatsOf(v);let i=seats.indexOf(cid);
      if(i<0){i=seats.findIndex(x=>!x);if(i<0)throw new Error('Cette partie est déjà complète.');
        tx.update(r,{['s'+i]:cid,['name'+i]:getNickname()});}
    });
    code=c;ref=r;mode='online';chatUnread=0;S=null;show(true);sub();
  }catch(e){err(e)}
};
$('end').onclick=async()=>{
  if(mode=='local'){ended=true;upd()}
  else try{await ref.update({ended:true})}catch(e){err(e)}
};
$('back').onclick=()=>{unsub&&unsub();unsub=null;unsubChat&&unsubChat();unsubChat=null;$('chatDialog').hidden=true;mode='';moves=[];S=null;gameData=null;show(false);renderOnlinePanel({n:N})};

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

$('chatOpen').onclick=()=>{if(mode!=='online')return;chatUnread=0;$('chatBadge').hidden=true;$('chatDialog').hidden=false;renderOnlinePanel(gameData||{n:N});$('chatInput').focus()};
$('chatClose').onclick=()=>$('chatDialog').hidden=true;
$('chatBackdrop').onclick=e=>{if(e.target===$('chatBackdrop'))$('chatDialog').hidden=true};
$('chatForm').addEventListener('submit',e=>{e.preventDefault();sendChatMessage($('chatInput').value)});
document.addEventListener('keydown',e=>{if(e.key==='Escape')$('chatDialog').hidden=true});
$('copyCode').onclick=async()=>{
  if(!code)return;
  try{await navigator.clipboard.writeText(code);note('Code '+code+' copié. Envoyez-le à vos amis.');}
  catch(e){const field=document.createElement('textarea');field.value=code;field.setAttribute('readonly','');field.style.position='fixed';field.style.opacity='0';document.body.append(field);field.select();let ok=false;try{ok=document.execCommand('copy')}catch(_){}field.remove();note(ok?'Code '+code+' copié.':'Code à partager : '+code)}
};
