const $=id=>document.getElementById(id),NAMES=['Rouge','Cyan','Vert','Ambre'];
const E=window.G2Engine,PZ=window.G2Puzzles;
/* Constantes nommées (plus de nombres magiques dans le rendu et la logique) */
const TAU=Math.PI*2,STONE_R=.3,LINE_W=.13,LAST_RING=3,FX_MS=600,POP_MS=380,STAGGER_MS=60,MAX_STAGGER=20,WIN_DELAY=900,
  CHAT_BADGE_MAX=99,CHAT_SCROLL_SLACK=70,IDLE_FORFEIT_MS=12e4,AI_DELAY_MS=380,DAILY_STONES=6,MAX_LIVE=5,PAN_PX=10,
  ZOOM_MIN=1,ZOOM_MAX=4,ZOOM_STEP=1.25,AUTO_EVERY_MS=45000,AUTO_MAX_GAMES=40,PUZ_RETRY_MS=1300,ELO_K=24,LOBBY_TTL_MS=36e5,LOBBY_MAX_AGE_MS=6e5,
  THEMES=[{id:'neon',name:'Néon',need:0},{id:'aurore',name:'Aurore',need:1},{id:'ambre',name:'Ambre',need:3},{id:'mono',name:'Monochrome',need:7}];
let puz=-1,puzState='',zoom=1,prevSc=null,pop=null,winTimer=0,lvl=1,autoBusy=false,autoCount=0,lobbyCode='',an=null,newAch=[],pan=null;
const jget=(k,d)=>{try{const v=JSON.parse(localStorage.getItem(k));return v==null?d:v}catch(e){return d}},jset=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const track=(n,p)=>{try{an&&an.logEvent(n,p)}catch(e){}};
let W=17,H=23,N=2,TM=false,mode='',moves=[],me=-1,code='',ref=null,unsub=null,unsubChat=null,db=null,auth=null,cid='',authReady=false,ended=false,ready=true,filled=0,hover=null,S=null,cs=20,gameData=null,chatUnread=0,firstChatSnapshot=true,raf=0,COL=null,dirty=true,LC=null,fx=null,wasOver=false,rematchCode='',endSent='',aiP=null,ai=false,daily='',aiTimer=0,chatRows=[],lastSend=0,kb=[0,0],snd=(()=>{try{return localStorage.getItem('g2p.snd')!=='0'}catch(e){return true}})();
const getNickname=()=>{let v='';try{v=$('nickname').value.trim()||localStorage.getItem('g2p.nickname')||''}catch(e){v=$('nickname').value.trim()}return (v.replace(/[<>\u0000-\u001f]/g,'').slice(0,20)||'Joueur').trim()};
const K=()=>TM?2:N,tmOf=p=>TM?p%2:p;
const turn=()=>S?S.cur:0,over=()=>ended||(S?S.free<=0:moves.length>=W*H);
const can=()=>!!S&&!over()&&ready&&(puz<0||!puzState)&&((mode=='local'&&!(ai&&S.cur==1))||(mode=='online'&&me==turn()));

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
function sfx(k,combo=0){
  if(!snd)return;
  try{
    AC=AC||new(window.AudioContext||window.webkitAudioContext)();AC.state=='suspended'&&AC.resume();
    const up=Math.pow(2,Math.min(combo,8)/12*2),f=({place:[520],cap:[440,660,880],win:[523,659,784,1047]}[k]).map(h=>k=='cap'?h*up:h),t=AC.currentTime; /* le « ding » monte en pitch à chaque capture enchaînée */
    f.forEach((hz,i)=>{const o=AC.createOscillator(),g=AC.createGain(),s0=t+i*.09;o.frequency.value=hz;
      g.gain.setValueAtTime(.0001,s0);g.gain.exponentialRampToValueAtTime(.12,s0+.01);g.gain.exponentialRampToValueAtTime(.0001,s0+.18);
      o.connect(g);g.connect(AC.destination);o.start(s0);o.stop(s0+.2)});
  }catch(e){}
}
const vib=p=>{try{navigator.vibrate&&navigator.vibrate(p)}catch(e){}};
const startFx=()=>{if(!RM)fx={t:performance.now(),team:S.capT,cells:S.cap,from:moves[S.n-1]}};
const startPop=()=>{if(!RM&&moves[S.n-1])pop={a:moves[S.n-1][0],b:moves[S.n-1][1],t:performance.now()}};

/* Rendu : couleurs en cache, calque statique (grille, boucles, points) mis en cache, survol dessiné par-dessus */
const COLN=['--line','--c0','--c1','--c2','--c3','--tx','--paper'];
const col=n=>(COL||(COL=Object.fromEntries(COLN.map(k=>[k,getComputedStyle(document.documentElement).getPropertyValue(k).trim()]))))[n];
function stone(x,px,py,cc,dead,k=1,al=1){
  const R=cs*STONE_R*k;
  x.globalAlpha=(dead?.4:1)*al;x.fillStyle=cc;x.shadowColor=cc;x.shadowBlur=dead?0:cs*.7;
  x.beginPath();x.arc(px,py,R,0,TAU);x.fill();x.shadowBlur=0;
  if(!dead){x.fillStyle='rgba(255,255,255,.7)';x.beginPath();x.arc(px,py,R*.35,0,TAU);x.fill()}
  x.globalAlpha=al;
  if(dead){x.strokeStyle=col('--tx');x.lineWidth=1.5;x.beginPath();x.moveTo(px-R,py-R);x.lineTo(px+R,py+R);x.moveTo(px+R,py-R);x.lineTo(px-R,py+R);x.stroke()}
  x.globalAlpha=1;
}
function layer(x,w,h){
  x.fillStyle=col('--paper');x.fillRect(0,0,w,h);
  x.strokeStyle=col('--line');x.lineWidth=1;x.beginPath();
  for(let i=1;i<=W;i++){x.moveTo(i*cs,0);x.lineTo(i*cs,h)}
  for(let j=1;j<=H;j++){x.moveTo(0,j*cs);x.lineTo(w,j*cs)}
  x.stroke();
  const {o,d,blk}=S,P=(a,b)=>[(a+1)*cs,(b+1)*cs];
  x.lineCap='round';x.lineWidth=cs*LINE_W;
  for(const {t,c} of S.loops){ /* territoires : remplissage néon + contour lumineux */
    x.fillStyle=col('--c'+t);x.globalAlpha=.16;c.cells.forEach(([a,b])=>x.fillRect(a*cs+cs/2,b*cs+cs/2,cs,cs));x.globalAlpha=1;
    x.strokeStyle=col('--c'+t);x.shadowColor=col('--c'+t);x.shadowBlur=cs*.45;
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
    x.shadowBlur=0;
  }
  const R=cs*STONE_R,q=cs*LINE_W;
  x.strokeStyle=col('--tx');x.lineWidth=1;x.globalAlpha=.4; /* cases verrouillées (territoire fermé) */
  for(let b=0;b<H;b++)for(let a=0;a<W;a++)if(blk[b][a]&&!o[b][a]){const [px,py]=P(a,b);x.strokeRect(px-q,py-q,2*q,2*q);x.beginPath();x.moveTo(px-q,py-q);x.lineTo(px+q,py+q);x.stroke()}
  x.globalAlpha=1;
  for(let b=0;b<H;b++)for(let a=0;a<W;a++){
    const p=o[b][a];if(!p||(pop&&pop.a==a&&pop.b==b))continue; /* la pierre qui « tombe » est dessinée par paint() */
    const [px,py]=P(a,b);stone(x,px,py,col('--c'+(p-1)),d[b][a]);
  }
}
function paint(){
  if(!S)return;
  const c=$('cv'),wrap=$('cvw');
  if(!$('game').hidden)document.querySelector('main').style.maxWidth=Math.max(320,Math.min(900,(innerHeight-250)*(W+1)/(H+1)))+'px';
  const bw=wrap.clientWidth;if(!bw)return;
  wrap.classList.toggle('zoomed',zoom>1);
  const w=bw*zoom;
  cs=w/(W+1);const h=cs*(H+1),r=window.devicePixelRatio||1,pw=Math.round(w*r),ph=Math.round(h*r),now=performance.now();
  if(pop&&now-pop.t>=POP_MS){pop=null;dirty=true}
  if(c.width!=pw||c.height!=ph){c.width=pw;c.height=ph;c.style.width=w+'px';c.style.height=h+'px';dirty=true}
  if(dirty||!LC){
    LC=LC||document.createElement('canvas');LC.width=pw;LC.height=ph;
    const lx=LC.getContext('2d');lx.scale(r,r);layer(lx,w,h);dirty=false;
  }
  const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,pw,ph);x.drawImage(LC,0,0);x.setTransform(r,0,0,r,0,0);
  const R=cs*STONE_R,P=(a,b)=>[(a+1)*cs,(b+1)*cs],{o}=S;
  const L=moves[S.n-1];
  if(L&&!pop){const [px,py]=P(L[0],L[1]);x.strokeStyle=col('--tx');x.lineWidth=1.5;x.beginPath();x.arc(px,py,R+LAST_RING,0,TAU);x.stroke()}
  if(hover&&can()&&!o[hover[1]][hover[0]]&&!S.blk[hover[1]][hover[0]]){
    const [px,py]=P(hover[0],hover[1]);x.globalAlpha=.55;x.fillStyle=col('--c'+tmOf(turn()));
    x.beginPath();x.arc(px,py,R,0,TAU);x.fill();x.globalAlpha=1;
  }
  if(pop){ /* animation de pose : la pierre tombe et rebondit */
    const p=(now-pop.t)/POP_MS,e=1-Math.pow(1-p,3),k=1+Math.sin(p*Math.PI*3)*(1-p)*.35,[px,py]=P(pop.a,pop.b),pl=o[pop.b][pop.a];
    if(pl)stone(x,px,py-(1-e)*cs*1.2,col('--c'+(pl-1)),S.d[pop.b][pop.a],k,Math.min(1,p*4));
    draw();
  }
  if(fx){ /* capture : onde depuis le point joué + anneaux en cascade sur les points capturés */
    const n=Math.min(fx.cells.length,MAX_STAGGER),end=n*STAGGER_MS+FX_MS,el=now-fx.t;
    if(el<end){
      x.strokeStyle=col('--c'+fx.team);x.lineWidth=2;
      if(fx.from){const p0=Math.min(1,el/(FX_MS*1.4)),[wx,wy]=P(fx.from[0],fx.from[1]);x.globalAlpha=(1-p0)*.6;x.beginPath();x.arc(wx,wy,R+p0*cs*6,0,TAU);x.stroke()}
      fx.cells.forEach(([a,b],i)=>{
        const p=(el-Math.min(i,MAX_STAGGER)*STAGGER_MS)/FX_MS;if(p<0||p>=1)return;
        const [px,py]=P(a,b);x.globalAlpha=1-p;x.beginPath();x.arc(px,py,R+p*cs*.9,0,TAU);x.stroke();
      });
      x.globalAlpha=1;draw();
    }else fx=null;
  }
}
const draw=()=>{raf||(raf=requestAnimationFrame(()=>{raf=0;paint()}))}; /* au plus un rendu par image */
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{COL=null;dirty=true;draw()});

/* IA évolutive : mémoire de motifs qui copie les techniques vues dans TOUS les matchs terminés
   (solo, duel, 3-4 joueurs, équipes, en ligne, défi du jour, y compris les coups de l'adversaire),
   + poids d'évaluation optimisés par essais successifs (champion / challenger).
   Tout est automatique : aucun bouton d'entraînement, l'IA s'améliore seule. */
const AIDEF=()=>({w:E.DEFAULT_W.slice(),c:null,st:{g:0,w:0},book:{},games:0});
function loadAI(){const a=jget('g2p.ai',null);return a&&a.w&&a.book?a:AIDEF()}
function saveAI(a){
  const ks=Object.keys(a.book);
  if(ks.length>1500){ks.sort((p,q)=>a.book[q][0]-a.book[p][0]);const nb={};ks.slice(0,1200).forEach(k=>nb[k]=a.book[k]);a.book=nb}
  jset('g2p.ai',a);
}
/* Le défi du jour utilise toujours l'IA de base (même adversaire pour tout le monde). */
function aiPick(){aiP=daily?null:(()=>{const a=loadAI();return{w:a.c||a.w,book:a.book,ch:!!a.c,lvl}})()}
function learnFromGame(win,r){
  if(moves.length<6)return; /* toutes les parties comptent : plus de restriction de mode */
  const a=loadAI();E.learn(a.book,moves,W,H,N,TM,win);a.games++;
  if(ai&&!daily&&aiP&&mode=='local'&&lvl>0){ /* r = résultat du joueur humain */
    const aiOk=r!='win';a.st.g++;a.st.w+=r=='loss'?1:0;
    if(aiP.ch){if(aiOk)a.w=a.c;a.c=null}          /* le challenger ne perd pas : il devient champion */
    if(!aiOk&&!a.c)a.c=E.mutate(a.w,Math.random);  /* l'IA a perdu : elle teste une variante */
  }
  saveAI(a);
}
async function selfPlay(PA,PB){
  const s=E.create(11,15,2,false),mv=[];
  while(s.free>0&&mv.length<90){
    const m=E.aiMove(s,Math.random,s.cur?PB:PA);if(!m)break;
    E.apply(s,m);mv.push(m);if(mv.length%4==0)await new Promise(r=>setTimeout(r));
  }
  return{sc:s.sc,moves:mv};
}
/* Auto-apprentissage en arrière-plan : quelques parties IA contre IA lorsque le menu est affiché.
   Chaque résultat est fusionné dans la mémoire déjà sauvegardée (pas d'écrasement d'une partie réelle). */
async function autoTrain(){
  if(autoBusy||mode||document.hidden||$('menu').hidden||autoCount>=AUTO_MAX_GAMES)return;
  autoBusy=true;
  try{
    const base=loadAI(),ch=E.mutate(base.w,Math.random),baseKey=JSON.stringify(base.w);let d=0;
    for(const side of[0,1]){
      if(mode||document.hidden||$('menu').hidden)return;
      const a0=loadAI(),A={w:a0.w,book:a0.book,lvl:1},B={w:ch,book:a0.book,lvl:1};
      const r=await selfPlay(side?A:B,side?B:A);autoCount++;
      d+=side?r.sc[1]-r.sc[0]:r.sc[0]-r.sc[1]; /* + = la variante gagne (côté 0 : variante = Rouge ; côté 1 : variante = Bleu) */
      const a=loadAI();E.learn(a.book,r.moves,11,15,2,false,r.sc[0]>r.sc[1]?[0]:r.sc[1]>r.sc[0]?[1]:[]);a.games++;
      if(side&&d>0&&JSON.stringify(a.w)==baseKey)a.w=ch; /* la variante qui bat le champion le remplace */
      saveAI(a);
    }
  }finally{autoBusy=false}
}
setInterval(()=>{'requestIdleCallback' in window?requestIdleCallback(autoTrain,{timeout:8000}):autoTrain()},AUTO_EVERY_MS);
setTimeout(autoTrain,6000);

/* Libellés, résultat, historique, partage */
const label=i=>ai&&mode=='local'&&i==1?'IA':NAMES[i];
function result(){ /* un abandon exclut l'équipe fautive du classement */
  const fl=mode=='online'&&gameData&&Number.isInteger(gameData.forfeit)?tmOf(gameData.forfeit):-1;
  const pool=S.sc.map((v,i)=>i).filter(i=>i!=fl),mx=Math.max(...pool.map(i=>S.sc[i]));
  return{fl,mx,w:pool.filter(i=>S.sc[i]==mx)};
}
const loadHist=()=>{try{return JSON.parse(localStorage.getItem('g2p.hist')||'[]')}catch(e){return[]}};
function record(){
  if(S.n<1||puz>=0)return;
  const {w}=result(),mine=mode=='online'?(me>=0?tmOf(me):-1):(ai?0:-1);
  const r=mine<0?'':w.includes(mine)?(w.length>1?'draw':'win'):'loss';
  const h=loadHist();h.unshift({t:Date.now(),k:daily?'daily':ai?'ai':mode,w:W,h:H,sc:S.sc.slice(),r,d:daily||undefined});
  try{localStorage.setItem('g2p.hist',JSON.stringify(h.slice(0,30)))}catch(e){}
  learnFromGame(w,r);progress(r,mine);renderHist();renderProg();track('game_end',{mode:daily?'daily':ai?'ai':mode,players:N,result:r||'none'});
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
const dayNo=d=>Math.floor((Date.parse(d)-Date.parse('2026-01-01'))/864e5)+1;
function shareText(){
  if(daily){const me0=S.sc[0],ot=S.sc[1],res=me0>ot?'Gagné 🏆':me0==ot?'Égalité 🤝':'Perdu 💀';
    return 'G2Point — Défi #'+dayNo(daily)+'\n🔴 '+me0+' – '+ot+' ⚫  '+res+' en '+Math.max(0,moves.length-DAILY_STONES)+' coups\n'+location.href.split('#')[0]}
  return 'G2Point : '+S.sc.map((v,i)=>label(i)+' '+v).join(' – ')+' · '+location.href.split('#')[0];
}
/* Carte de résultat : image du terrain final + score, générée depuis le canvas du jeu */
async function resultBlob(){
  paint();const src=$('cv'),hd=Math.round(src.width*.16),out=document.createElement('canvas');out.width=src.width;out.height=src.height+hd;
  const x=out.getContext('2d'),u=out.width/360;
  x.fillStyle=col('--paper');x.fillRect(0,0,out.width,out.height);
  x.fillStyle=col('--tx');x.font='800 '+Math.round(22*u)+'px Orbitron,system-ui,sans-serif';x.textBaseline='middle';x.fillText('G2Point'+(daily?' · Défi #'+dayNo(daily):''),14*u,hd*.36);
  const K=S.sc.length,bw=(out.width-28*u)/K;
  S.sc.forEach((v,i)=>{x.fillStyle=col('--c'+i);x.font='700 '+Math.round(15*u)+'px system-ui,sans-serif';x.fillText(label(i)+' '+v,14*u+i*bw,hd*.74)});
  x.drawImage(src,0,hd);
  return new Promise(r=>out.toBlob(r,'image/png'));
}
async function shareResult(){
  const txt=shareText();
  try{
    const blob=await resultBlob();
    if(blob){
      const f=new File([blob],'g2point.png',{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],text:txt});return}
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='g2point.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),4000);
      try{await navigator.clipboard.writeText(txt)}catch(e){}
      note('Image enregistrée, texte copié.');return;
    }
  }catch(e){if(e&&e.name==='AbortError')return}
  try{if(navigator.share){await navigator.share({text:txt});return}await navigator.clipboard.writeText(txt);note('Résultat copié.')}catch(e){}
}
$('share').onclick=shareResult;

/* Abandon : l'adversaire dont c'est le tour est inactif depuis plus de 2 minutes */
function checkIdle(){
  const t=gameData&&(gameData.lastAt||gameData.createdAt),ms=t&&t.toMillis?Date.now()-t.toMillis():0;
  const on=mode=='online'&&ready&&!!S&&!over()&&me>=0&&me!=turn()&&ms>IDLE_FORFEIT_MS;
  $('forfeit').hidden=!on;if(on)$('forfeit').textContent='Déclarer l’abandon de '+playerName(gameData,turn());
}
setInterval(checkIdle,10000);
$('resign').onclick=async()=>{
  if(!confirm('Abandonner la partie ? Vous serez exclu du classement.'))return;
  try{await ref.update({ended:true,forfeit:me})}catch(e){err(e)}
};
$('forfeit').onclick=async()=>{
  if(!confirm('Déclarer l’abandon de ce joueur ?'))return;
  try{await ref.update({ended:true,forfeit:S.cur})}catch(e){err(e)}
};

/* IA et défi du jour */
const seedOf=d=>+d.replace(/-/g,''),todayStr=()=>new Date().toLocaleDateString('sv-SE');
function dailyOpening(d){ /* 6 pierres posées au hasard (graine = date), identiques pour tous */
  const r=E.rng(seedOf(d)),out=[],used=new Set();
  while(out.length<DAILY_STONES){const x=3+((r()*(W-6))|0),y=4+((r()*(H-8))|0);if(!used.has(y*W+x)){used.add(y*W+x);out.push([x,y])}}
  return out;
}
function aiTurn(){
  clearTimeout(aiTimer);
  const ok=()=>mode==='local'&&ai&&!!S&&!over()&&S.cur===1;
  if(!ok())return;
  aiTimer=setTimeout(()=>{
    if(!ok())return;
    const m=E.aiMove(S,E.rng((daily?seedOf(daily):Date.now())+moves.length),aiP);if(!m)return;moves=[...moves,m];upd();saveLocal();aiTurn();
  },AI_DELAY_MS);
}

/* Sauvegarde / reprise */
const loadSave=()=>{try{return JSON.parse(localStorage.getItem('g2p.save')||'null')}catch(e){return null}};
const putSave=v=>{try{localStorage.setItem('g2p.save',JSON.stringify(v))}catch(e){}};
function refreshResume(){
  const sv=loadSave(),b=$('bResume');b.hidden=!sv;
  if(sv)b.textContent=sv.m=='online'?'Reprendre la partie en ligne '+sv.c:'Reprendre '+(sv.d?'le défi du jour':sv.ai?'la partie contre l’IA':'la partie locale')+' ('+sv.mv.length+' coups)';
}
function clearSave(){try{localStorage.removeItem('g2p.save')}catch(e){}refreshResume()}
const saveLocal=()=>{if(puz<0)putSave({m:'local',ai,d:daily,l:lvl,w:W,h:H,n:N,tm:TM,mv:moves.map(([a,b])=>b*W+a)})};

const undoBase=()=>puz>=0?PZ.setup(puzs[puz]).length:daily?DAILY_STONES:0;
function animateScores(prev,fresh){ /* chip qui saute, compteur qui roule, « +N » flottant */
  if(!fresh||RM||!prev||prev.length!=S.sc.length)return;
  S.sc.forEach((v,i)=>{
    const dv=v-prev[i],chip=$('bar').children[i];if(dv<=0||!chip)return;
    const b=chip.querySelector('b'),t0=performance.now(),pl=document.createElement('i');
    chip.classList.add('bump');pl.className='plus';pl.textContent='+'+dv;chip.append(pl);setTimeout(()=>pl.remove(),1000);
    const tick=()=>{const p=Math.min(1,(performance.now()-t0)/420);b.textContent=Math.round(prev[i]+dv*p);if(p<1)requestAnimationFrame(tick)};tick();
  });
}
function showCombo(k){const c=$('combo');c.textContent='COMBO ×'+k;c.classList.remove('show');void c.offsetWidth;c.classList.add('show')}
function upd(){
  const prev=prevSc,fresh=sync();
  if(puz>=0&&mode=='local'&&!puzState){ /* puzzle : un seul coup autorisé */
    const pz=puzs[puz],base=PZ.setup(pz).length;
    if(moves.length>base){
      if(S.sc[0]>=pz.goal){puzState='ok';ended=true;puzSolved(puz)}
      else{puzState='ko';setTimeout(()=>{if(puz>=0&&puzState=='ko'){moves=moves.slice(0,base);puzState='';S=null;upd()}},PUZ_RETRY_MS)}
    }
  }
  const o=over(),p=turn(),t=tmOf(p),mt=me>=0?tmOf(me):-1,nm=i=>(TM?'Équipe ':'')+label(i);
  $('bar').style.gridTemplateColumns='repeat('+K()+',1fr)';
  $('bar').innerHTML=S.sc.map((v,i)=>'<div class="chip'+(!o&&ready&&i==t?' on':'')+'" style="--c:var(--c'+i+')"><span>'+label(i)+(mode=='online'&&i==mt?' ★':'')+'</span><b>'+v+'</b></div>').join('');
  animateScores(prev,fresh);prevSc=S.sc.slice();
  $('game').style.setProperty('--turn',o||!ready?'var(--neon)':'var(--c'+t+')'); /* bordure du terrain = couleur du joueur actif */
  let m;
  if(puz>=0&&puzState=='ok')m='Réussi ! 🏆 '+S.sc[0]+' point'+(S.sc[0]>1?'s':'')+' capturé'+(S.sc[0]>1?'s':'')+'.';
  else if(puz>=0&&puzState=='ko')m='Raté : ce coup ne capture pas assez de points. On recommence…';
  else if(puz>=0)m='Objectif : capturer '+puzs[puz].goal+' point'+(puzs[puz].goal>1?'s':'')+' en un seul coup.';
  else if(mode=='online'&&!ready)m='En attente des joueurs ('+filled+'/'+N+'). Partagez le code '+code+'.';
  else if(o){
    const {fl,mx,w}=result();
    m=(fl>=0?nm(fl)+' a abandonné. ':'')+(w.length>1?'Égalité à '+mx+' point'+(mx>1?'s':''):nm(w[0])+' gagne avec '+mx+' point'+(mx>1?'s':''));
  }
  else if(mode=='local')m='Au tour de '+nm(t)+(TM?' (joueur '+(p+1)+')':'');
  else if(me<0)m='Vous observez la partie.';
  else m=me==p?'À vous de jouer ('+nm(t)+')':'Au tour de '+nm(t)+(TM?' (joueur '+(p+1)+')':'');
  $('msg').textContent=m+(puz<0&&!o&&ready&&S.bonus?' — point bonus !':'');
  $('end').hidden=o||!ready;$('rematch').hidden=!o||(mode=='online'&&me<0);$('share').hidden=!o||puz>=0;checkIdle();
  $('undo').hidden=!(mode=='local'&&!o&&moves.length>undoBase()&&!puzState);
  $('resign').hidden=!(mode=='online'&&ready&&!o&&me>=0);
  $('rematch').textContent=puz>=0?'Puzzle suivant':mode=='online'&&rematchCode?'Rejoindre la revanche':'Revanche';
  document.title=(mode=='online'&&!o&&ready&&me==p?'▶ À vous · ':'')+'G2Point — Jeu de points';
  if(fresh){
    startPop();
    if(S.cap.length){startFx();sfx('cap',S.combo);vib([30,40,30]);if(S.combo>=2)showCombo(S.combo)}
    else{sfx('place');vib(mode=='online'&&me==p?40:15)}
  }
  if(o&&!wasOver){
    sfx('win');if(puz<0){clearSave();record();showWin()}
    if(mode=='online')dropLive(code);
  }
  wasOver=o;
  if(o&&mode=='online'&&me>=0&&gameData&&!gameData.ended&&endSent!==code){endSent=code;ref.update({ended:true}).catch(()=>{})} /* plateau plein (territoires compris) : clôture pour permettre la revanche */
  draw();
}

const note=t=>($('menu').hidden?$('gnote'):$('mnote')).textContent=t||'';
const err=e=>{const c=e&&e.code;let m=c=='permission-denied'?'Accès refusé : vérifiez la configuration et les règles Firestore.':c=='functions/unauthenticated'?'Connectez-vous puis réessayez.':((e&&(e.message||e.code))||String(e));note('Erreur : '+m)};
function show(g){$('menu').hidden=g;$('game').hidden=!g;note('');if(!g){document.querySelector('main').style.maxWidth='';document.title='G2Point — Jeu de points';refreshResume();renderLive();renderProg();fillThemes()}}
const seatsOf=v=>Array.from({length:v.n},(_,k)=>v['s'+k]);

function sub(){
  unsub&&unsub();
  unsub=ref.onSnapshot(s=>{
    if(!s.exists){note('Partie introuvable.');return}
    const v=s.data(),sd=seatsOf(v);
    if(v.w!=W||v.h!=H||v.n!=N||!!v.tm!==TM)S=null;
    gameData=v;rematchCode=v.next||'';W=v.w;H=v.h;N=v.n;TM=!!v.tm;moves=(v.moves||[]).map(k=>[k%W,(k/W)|0]);ended=!!v.ended;
    ready=sd.every(Boolean);filled=sd.filter(Boolean).length;me=sd.indexOf(cid);renderOnlinePanel(v);upd();
    if(ready&&lobbyCode===code){closeLobby()} /* partie rapide complète : on retire l'annonce */
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
    const state=document.createElement('span');state.className='seat-state';state.textContent=uid?(uid===cid?'Vous':(v.tm?'Équipe '+NAMES[i%2]:'Connecté')):'En attente';
    line.append(name,state);roster.append(line);
  }
  const badge=$('chatBadge');badge.hidden=chatUnread<1;badge.textContent=chatUnread>CHAT_BADGE_MAX?CHAT_BADGE_MAX+'+':String(chatUnread);
}
function renderChatMessages(rows){
  const box=$('chatMessages'),wasNearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<CHAT_SCROLL_SLACK;
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
    const badge=$('chatBadge');badge.hidden=chatUnread<1;badge.textContent=chatUnread>CHAT_BADGE_MAX?CHAT_BADGE_MAX+'+':String(chatUnread);
    $('chatState').textContent='Discussion de la partie '+code+' · 100 derniers messages affichés';
  },e=>{$('chatState').textContent='Discussion indisponible : vérifiez les règles Firestore.';console.warn(e)});
}
async function sendChatMessage(text,keep){
  const clean=String(text||'').trim().slice(0,500);
  if(!clean||mode!=='online'||!ref||!cid||Date.now()-lastSend<800)return;lastSend=Date.now();
  const send=$('chatSend');send.disabled=true;
  try{await ref.collection('messages').add({uid:cid,text:clean,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expireAt:expiry()});if(!keep)$('chatInput').value='';}
  catch(e){err(e);$('chatState').textContent='Envoi impossible. Vérifiez votre connexion et les règles Firestore.'}
  finally{send.disabled=false;$('chatInput').focus()}
}

const expiry=()=>firebase.firestore.Timestamp.fromMillis(Date.now()+7*864e5); /* purge via la politique TTL Firestore */
async function place(pt){
  if(!pt||!can()||S.o[pt[1]][pt[0]])return;
  if(S.blk[pt[1]][pt[0]]){note('Territoire fermé : cette case est inaccessible.');return}
  note('');
  moves=[...moves,pt];upd(); /* coup optimiste : visible tout de suite, sans attendre le serveur */
  if(mode==='local'){saveLocal();aiTurn();return}
  try{ /* une seule écriture (pas de transaction) ; les règles Firestore valident tour et case libre */
    await ref.update({moves:firebase.firestore.FieldValue.arrayUnion(pt[1]*W+pt[0]),cur:S.cur,lastAt:firebase.firestore.FieldValue.serverTimestamp()});
  }catch(e){note('Coup refusé : ce n’était pas votre tour ou la partie a changé.');console.warn(e)} /* le snapshot suivant annule le coup */
}

const cv=$('cv');
const pt=e=>{const r=cv.getBoundingClientRect(),a=Math.round((e.clientX-r.left)/cs)-1,b=Math.round((e.clientY-r.top)/cs)-1;return a>=0&&b>=0&&a<W&&b<H?[a,b]:null};
const ptrs=new Map();let pinch=null;
cv.onpointerdown=e=>{
  ptrs.set(e.pointerId,[e.clientX,e.clientY]);cv.setPointerCapture(e.pointerId);
  if(ptrs.size==2){const [a,b]=[...ptrs.values()];pinch={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:zoom};pan=null;hover=null;return}
  pan={x:e.clientX,y:e.clientY,sx:$('cvw').scrollLeft,sy:$('cvw').scrollTop,moved:false};if(can()){hover=pt(e);draw()}
};
cv.onpointermove=e=>{
  if(ptrs.has(e.pointerId))ptrs.set(e.pointerId,[e.clientX,e.clientY]);
  if(pinch){ /* pincement : zoom manuel (ignoré si la taille est verrouillée) */
    if(ptrs.size>=2&&!zoomLocked){const [a,b]=[...ptrs.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch.d>0)setZoom(pinch.z*d/pinch.d)}
    return;
  }
  if(pan&&e.buttons&&zoom>1){ /* zoom : un glissement déplace le terrain, un simple appui pose le point */
    const dx=e.clientX-pan.x,dy=e.clientY-pan.y;
    if(pan.moved||Math.hypot(dx,dy)>PAN_PX){pan.moved=true;hover=null;$('cvw').scrollLeft=pan.sx-dx;$('cvw').scrollTop=pan.sy-dy;draw();return}
  }
  if(!can())return;hover=pt(e);draw();
};
cv.onpointerup=e=>{ptrs.delete(e.pointerId);if(pinch){if(!ptrs.size)pinch=null;pan=null;hover=null;draw();return}const moved=pan&&pan.moved;pan=null;if(moved){hover=null;draw();return}const p=pt(e);hover=null;place(p);draw()};
cv.onpointerleave=()=>{hover=null;draw()};
cv.onpointercancel=e=>{ptrs.delete(e.pointerId);if(!ptrs.size)pinch=null;hover=null;pan=null;draw()};
window.addEventListener('resize',draw);

const readOpts=()=>{
  const [w,h]=$('size').value.split('x');W=+w;H=+h;ai=$('np').value==='ai';daily='';TM=$('np').value==='team';N=TM?4:ai?2:+$('np').value;
  lvl=+$('lvl').value||0;try{localStorage.setItem('g2p.lvl',String(lvl))}catch(e){}puz=-1;puzState='';moves=[];S=null;ended=false;wasOver=false;
};
$('np').onchange=()=>{$('lvlRow').hidden=$('np').value!=='ai';$('modeHint').textContent=$('np').value==='team'?'Deux équipes alternent leurs tours : joueurs 1 et 3 contre joueurs 2 et 4.':$('np').value==='ai'?'Solo : vous jouez Rouge contre l’ordinateur.':$('np').value==='2'?'Duel : deux joueurs se relaient.':'Chacun pour soi : chaque joueur a son propre score.'};
$('nickname').onchange=()=>{try{localStorage.setItem('g2p.nickname',getNickname())}catch(e){}};
try{$('nickname').value=localStorage.getItem('g2p.nickname')||''}catch(e){}
$('bLocal').onclick=()=>{readOpts();aiPick();mode='local';ready=true;me=-1;code='';gameData=null;renderOnlinePanel({n:N});show(true);upd()};
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
    puz=-1;puzState='';ai=false;daily='';code=nc;ref=nr;mode='online';ready=false;me=0;gameData=null;chatUnread=0;S=null;moves=[];ended=false;rematchCode='';wasOver=false;
    putSave({m:'online',c:code});addLive(code);show(true);sub();return true;
  }catch(e){err(e);return false}
}
async function joinGame(c,quiet){
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
    puz=-1;puzState='';ai=false;daily='';code=c;ref=r;mode='online';chatUnread=0;S=null;rematchCode='';wasOver=false;putSave({m:'online',c:code});addLive(code);show(true);sub();return true;
  }catch(e){if(!quiet)err(e);return false}
}
/* Partie rapide : salon public sans code (collection `lobby`), le premier salon compatible est rejoint, sinon on en crée un */
function closeLobby(){const c=lobbyCode;lobbyCode='';if(c&&db)db.doc('lobby/'+c).delete().catch(()=>{})}
async function quickMatch(){
  if(!db||!authReady||!cid){note('La connexion en ligne n’est pas prête. Vérifiez Firebase et réessayez.');return}
  readOpts();note('Recherche d’un adversaire…');
  try{
    const snap=await db.collection('lobby').where('n','==',N).where('tm','==',TM).where('w','==',W).where('h','==',H).limit(10).get(),now=Date.now();
    for(const d of snap.docs){
      const v=d.data(),ts=v.createdAt&&v.createdAt.toMillis?v.createdAt.toMillis():now;
      if(v.host===cid||now-ts>LOBBY_MAX_AGE_MS)continue;
      if(await joinGame(d.id,true)){track('quick_match',{role:'join'});return}
    }
    if(await createGame(true)){
      try{await db.doc('lobby/'+code).set({host:cid,n:N,tm:TM,w:W,h:H,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expireAt:firebase.firestore.Timestamp.fromMillis(Date.now()+LOBBY_TTL_MS)});lobbyCode=code;note('Partie rapide : en attente d’un adversaire…')}
      catch(e){console.warn(e);note('Salon créé, mais non public : partagez le code '+code+'.')}
      track('quick_match',{role:'host'});
    }
  }catch(e){err(e)}
}
$('bQuick').onclick=quickMatch;
$('bNew').onclick=()=>createGame(false);
$('bJoin').onclick=()=>joinGame($('code').value);
$('bResume').onclick=()=>{
  const sv=loadSave();if(!sv)return;
  if(sv.m=='online'){joinGame(sv.c).then(ok=>{if(!ok)clearSave()});return}
  puz=-1;puzState='';lvl=sv.l==null?1:sv.l;W=sv.w;H=sv.h;N=sv.n;TM=!!sv.tm;ai=!!sv.ai;daily=sv.d||'';aiPick();moves=sv.mv.map(k=>[k%W,(k/W)|0]);S=null;ended=false;wasOver=false;mode='local';ready=true;me=-1;code='';gameData=null;
  renderOnlinePanel({n:N});show(true);if(daily)note('Défi du jour — '+daily);upd();aiTurn();
};
$('bDaily').onclick=()=>{
  puz=-1;puzState='';lvl=1;ai=true;daily=todayStr();aiPick();W=11;H=15;N=2;TM=false;moves=dailyOpening(daily);S=null;ended=false;wasOver=false;mode='local';ready=true;me=-1;code='';gameData=null;
  renderOnlinePanel({n:N});show(true);note('Défi du jour — '+daily);upd();
};
$('rematch').onclick=async()=>{
  if(puz>=0){newPuzzle();return}
  if(mode=='local'){aiPick();moves=daily?dailyOpening(daily):[];S=null;ended=false;wasOver=false;upd();aiTurn();return}
  if(rematchCode){joinGame(rematchCode);return}
  const old=ref;if(await createGame(true)&&old)old.update({next:code}).catch(()=>{}); /* invite les autres joueurs */
};
$('end').onclick=async()=>{
  if(!confirm('Terminer la partie maintenant ?'))return;
  if(mode=='local'){ended=true;upd()}
  else try{await ref.update({ended:true})}catch(e){err(e)}
};
$('back').onclick=()=>{closeLobby();$('win').hidden=true;clearTimeout(winTimer);clearTimeout(aiTimer);unsub&&unsub();unsub=null;unsubChat&&unsubChat();unsubChat=null;$('chatDialog').hidden=true;mode='';moves=[];S=null;gameData=null;show(false);renderOnlinePanel({n:N})};

$('online').hidden=false;
$('bNew').disabled=true;$('bJoin').disabled=true;$('bQuick').disabled=true;
const FIREBASE_CONFIG=window.G2POINT_FIREBASE_CONFIG||{};
const validConfig=!!(FIREBASE_CONFIG.apiKey&&FIREBASE_CONFIG.authDomain&&FIREBASE_CONFIG.projectId&&FIREBASE_CONFIG.appId&&!String(FIREBASE_CONFIG.apiKey).includes('REMPLACER'));
if(window.firebase&&validConfig){
  try{
    firebase.initializeApp(FIREBASE_CONFIG);db=firebase.firestore();auth=firebase.auth();
    try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{})}catch(e){} /* cache hors-ligne : résiste aux coupures réseau */
    try{an=firebase.analytics()}catch(e){} /* mesure de rétention (measurementId déjà configuré) */
    auth.onAuthStateChanged(user=>{
      if(user){cid=user.uid;authReady=true;$('bNew').disabled=false;$('bJoin').disabled=false;$('bQuick').disabled=false;renderLive();$('onlineSetup').hidden=true;$('hint').hidden=false;$('onlineState').textContent='Connexion prête. Créez une partie ou saisissez un code.'}
      else{cid='';authReady=false;$('bNew').disabled=true;$('bJoin').disabled=true;$('bQuick').disabled=true;$('onlineSetup').hidden=false;$('hint').hidden=true}
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
$('emojis').onclick=e=>{const b=e.target.closest('button[data-e]');if(b)sendChatMessage(b.dataset.e,true)};
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
/* ===== Progression : série, ELO local, face-à-face, succès, thèmes ===== */
const ACHS=[
  {id:'first_cap',n:'Première capture',d:'Capturer un point adverse'},
  {id:'ten',n:'Gros coup',d:'Capturer 10 points en un seul coup'},
  {id:'flawless',n:'Sans une égratignure',d:'Gagner sans perdre un point'},
  {id:'win3',n:'Triple série',d:'Gagner 3 parties d’affilée'},
  {id:'daily',n:'Habitué du jour',d:'Terminer un défi du jour'},
  {id:'hard',n:'Défi relevé',d:'Battre l’IA en niveau difficile'},
  {id:'puz',n:'Casse-tête',d:'Résoudre 5 puzzles de l’IA'}
];
const loadProg=()=>{const P=jget('g2p.prog',null)||{};return{streak:P.streak||0,best:P.best||0,elo:P.elo||{},ach:P.ach||{},h2h:P.h2h||{}}};
const eloKey=()=>(TM?'Équipes':N+' joueurs')+(ai?' · vs IA':'');
function unlock(P,id){if(P.ach[id])return;P.ach[id]=Date.now();newAch.push('🏆 '+ACHS.find(a=>a.id==id).n)}
function progress(r,mine){
  newAch=[];if(mine<0||!r)return;
  const P=loadProg(),K=S.sc.length;
  if(r=='win'){P.streak++;P.best=Math.max(P.best,P.streak)}else if(r=='loss')P.streak=0;
  /* ELO local, approximatif : adversaire de référence 1000/1200/1400 selon le niveau de l'IA, 1/N pour les parties à plusieurs */
  const key=eloKey(),R=P.elo[key]||1200,opp=ai?[1000,1200,1400][lvl]||1200:1200,ex=K==2?1/(1+Math.pow(10,(opp-R)/400)):1/K;
  P.elo[key]=Math.round(R+ELO_K*((r=='win'?1:r=='draw'?.5:0)-ex));
  if(mode=='online'&&N==2&&!TM&&gameData&&me>=0){ /* face-à-face contre le même adversaire (suivi par identifiant anonyme) */
    const o=1-me,uid=gameData['s'+o];
    if(uid){const h=P.h2h[uid]||{n:'',w:0,l:0,d:0};h.n=playerName(gameData,o);if(r=='win')h.w++;else if(r=='loss')h.l++;else h.d++;P.h2h[uid]=h}
  }
  if(S.sc[mine]>0)unlock(P,'first_cap');
  if(S.big[mine]>=10)unlock(P,'ten');
  if(r=='win'&&S.sc.every((v,i)=>i==mine||v==0))unlock(P,'flawless');
  if(P.streak>=3)unlock(P,'win3');
  if(ai&&!daily&&lvl==2&&r=='win')unlock(P,'hard');
  if(daily){
    unlock(P,'daily');const dd=jget('g2p.dd',[]);
    if(!dd.includes(daily)){dd.push(daily);jset('g2p.dd',dd);for(const t of THEMES)if(t.need==dd.length&&t.need>0)newAch.push('🎨 Thème « '+t.name+' » débloqué')}
  }
  jset('g2p.prog',P);
  if(newAch.length)note(newAch.join(' · '));
}
function renderProg(){
  const P=loadProg(),box=$('prog'),mk=(tag,txt,cls)=>{const e=document.createElement(tag);e.textContent=txt;if(cls)e.className=cls;return e};
  const els=[mk('p','Série 🔥 '+P.streak+' victoire'+(P.streak>1?'s':'')+' · record '+P.best)];
  const elo=Object.entries(P.elo);
  if(elo.length){const ul=mk('ul','','prog-list');elo.forEach(([k,v])=>ul.append(mk('li','ELO '+k+' : '+v)));els.push(ul)}
  const h=Object.values(P.h2h).filter(x=>x.w+x.l+x.d>0);
  if(h.length){const ul=mk('ul','','prog-list');h.forEach(x=>ul.append(mk('li',x.w>x.l?'Tu mènes '+x.w+'-'+x.l+' contre '+x.n:x.w<x.l?x.n+' mène '+x.l+'-'+x.w+' contre toi':'Égalité '+x.w+'-'+x.l+' contre '+x.n)));els.push(ul)}
  const ul=mk('ul','','prog-list');
  ACHS.forEach(a=>ul.append(mk('li',(P.ach[a.id]?'🏆 ':'🔒 ')+a.n+' — '+a.d,P.ach[a.id]?'':'off')));els.push(ul);
  box.replaceChildren(...els);
}
function fillThemes(){
  const n=jget('g2p.dd',[]).length,sel=$('theme'),cur=(()=>{try{return localStorage.getItem('g2p.theme')||'neon'}catch(e){return'neon'}})();
  sel.replaceChildren(...THEMES.map(t=>{const o=document.createElement('option'),ok=n>=t.need;o.value=t.id;o.disabled=!ok;o.textContent=ok?t.name:t.name+' 🔒 ('+t.need+' défi'+(t.need>1?'s':'')+' du jour)';return o}));
  const t=THEMES.find(x=>x.id==cur&&n>=x.need)?cur:'neon';sel.value=t;setTheme(t);
}
function setTheme(id){document.documentElement.dataset.theme=id;try{localStorage.setItem('g2p.theme',id)}catch(e){}COL=null;dirty=true;draw()}
$('theme').onchange=()=>setTheme($('theme').value);

/* ===== Écran de victoire + confettis ===== */
function confetti(){
  if(RM)return;
  const c=$('confetti'),x=c.getContext('2d');c.width=innerWidth;c.height=innerHeight;
  const cols=[0,1,2,3].map(i=>col('--c'+i)),t0=performance.now();
  const ps=Array.from({length:140},()=>({x:Math.random()*c.width,y:-Math.random()*c.height*.5,vx:(Math.random()-.5)*2,vy:2+Math.random()*3,r:3+Math.random()*4,c:cols[(Math.random()*4)|0],a:Math.random()*TAU,va:(Math.random()-.5)*.3}));
  const step=()=>{
    x.clearRect(0,0,c.width,c.height);
    for(const p of ps){p.x+=p.vx;p.y+=p.vy;p.a+=p.va;x.save();x.translate(p.x,p.y);x.rotate(p.a);x.fillStyle=p.c;x.fillRect(-p.r,-p.r/2,p.r*2,p.r);x.restore()}
    if(performance.now()-t0<3500&&!$('win').hidden)requestAnimationFrame(step);else x.clearRect(0,0,c.width,c.height);
  };
  step();
}
function showWin(){
  clearTimeout(winTimer);
  winTimer=setTimeout(()=>{
    if(!S||!over()||puz>=0)return;
    const {w}=result(),nm=i=>(TM?'Équipe ':'')+label(i),mk=(tag,txt)=>{const e=document.createElement(tag);e.textContent=txt;return e};
    $('winTitle').textContent=w.length>1?'Égalité !':nm(w[0])+' gagne !';
    $('winScores').replaceChildren(...S.sc.map((v,i)=>{const d=document.createElement('div');d.style.setProperty('--c','var(--c'+i+')');const b=mk('b',v);d.append(mk('span',label(i)),b);return d}));
    const terr=S.sc.map(()=>new Set());for(const {t,c} of S.loops)c.cells.forEach(([a,b])=>terr[t].add(b*W+a));
    const mx=Math.max(...S.big),bi=S.big.indexOf(mx);
    const rows=[['Coups joués',S.n],['Plus grosse capture',mx>0?nm(bi)+' · '+mx+' point'+(mx>1?'s':''):'—'],...S.sc.map((v,i)=>['Territoire '+label(i),Math.round(terr[i].size*100/(W*H))+' %'])];
    newAch.forEach(t=>rows.push([t,'']));
    $('winRecap').replaceChildren(...rows.map(([a,b])=>{const li=document.createElement('li');li.append(mk('span',a),mk('span',b));return li}));
    $('winRematch').hidden=mode=='online'&&me<0;
    $('win').hidden=false;confetti();
  },WIN_DELAY);
}
$('winClose').onclick=()=>{$('win').hidden=true};
$('winShare').onclick=shareResult;
$('winRematch').onclick=()=>{$('win').hidden=true;$('rematch').onclick()};

/* ===== Annuler (local) et zoom ===== */
function undo(){
  if(mode!=='local'||over()||puzState)return;
  clearTimeout(aiTimer);const base=undoBase();if(moves.length<=base)return;
  moves=moves.slice(0,-1);
  if(ai)for(;;){ /* contre l'IA : on revient au tour du joueur humain */
    if(moves.length<=base)break;const t=E.create(W,H,N,TM);for(const m of moves)E.apply(t,m);
    if(t.cur!==1)break;moves=moves.slice(0,-1);
  }
  S=null;saveLocal();upd();
}
$('undo').onclick=undo;
/* Zoom manuel (boutons − / +, pincement, Ctrl+molette) ; le bouton cadenas verrouille / déverrouille la taille choisie */
let zoomLocked=false;
const zs=jget('g2p.zoom',null);if(zs){zoom=Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,+zs.z||1));zoomLocked=!!zs.lock}
function zoomLabel(){
  $('zoomLock').textContent=zoomLocked?'🔒 Zoom ×'+zoom.toFixed(1):'🔓 Zoom libre';$('zoomLock').setAttribute('aria-pressed',zoomLocked);
  $('zoomIn').disabled=zoomLocked||zoom>=ZOOM_MAX;$('zoomOut').disabled=zoomLocked||zoom<=ZOOM_MIN;
  jset('g2p.zoom',{z:zoom,lock:zoomLocked});
}
function setZoom(z){
  z=Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,z));if(z===zoom||zoomLocked)return;
  const w=$('cvw'),fx=(w.scrollLeft+w.clientWidth/2)/Math.max(1,w.scrollWidth),fy=(w.scrollTop+w.clientHeight/2)/Math.max(1,w.scrollHeight);
  zoom=z;dirty=true;zoomLabel();paint();
  w.scrollLeft=fx*w.scrollWidth-w.clientWidth/2;w.scrollTop=fy*w.scrollHeight-w.clientHeight/2; /* on garde le centre de la vue */
}
$('zoomIn').onclick=()=>setZoom(zoom*ZOOM_STEP);
$('zoomOut').onclick=()=>setZoom(zoom/ZOOM_STEP);
$('zoomLock').onclick=()=>{zoomLocked=!zoomLocked;zoomLabel()};
$('cvw').addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();setZoom(zoom*(e.deltaY<0?ZOOM_STEP:1/ZOOM_STEP))}},{passive:false});

/* ===== Puzzles « capture en 1 coup » ===== */
const aiIntel=()=>{const a=loadAI();return Math.min(10,Math.floor(Math.sqrt(a.games))+Math.floor(Object.keys(a.book).length/300)+Math.min(3,a.st.w))}; /* « intelligence » = expérience de l'IA */
let puzs=[],puzBusy=false;
function renderPuz(){
  const gen=document.createElement('button');gen.type='button';gen.className='pri';gen.disabled=puzBusy;gen.textContent=puzBusy?'L’IA prépare un puzzle…':'Nouveau puzzle de l’IA';gen.onclick=newPuzzle;
  $('puzList').replaceChildren(gen);
}
function newPuzzle(){
  if(puzBusy)return;puzBusy=true;renderPuz();
  setTimeout(()=>{ /* génération hors du rendu ; plusieurs tentatives si la position idéale n'est pas trouvée */
    const a=loadAI(),it=aiIntel();let p=null;
    for(let k=0;k<4&&!p;k++)p=E.genPuzzle(Math.random,it,{w:a.c||a.w,book:a.book},1500);
    puzBusy=false;
    if(!p){renderPuz();note('Aucun puzzle trouvé cette fois, réessayez.');return}
    puzs.push(p);renderPuz();startPuzzle(puzs.length-1);
  },30);
}
function startPuzzle(i){
  const p=puzs[i];puz=i;puzState='';W=PZ.W;H=PZ.H;N=2;TM=false;ai=false;daily='';aiPick();
  moves=PZ.setup(p);S=null;ended=false;wasOver=false;mode='local';ready=true;me=-1;code='';gameData=null;
  renderOnlinePanel({n:N});show(true);note('Puzzle de l’IA (intelligence '+p.intel+') : '+p.hint);upd();
}
function puzSolved(i){
  const p=puzs[i];if(!p.done){p.done=true;const n=jget('g2p.puzn',0)+1;jset('g2p.puzn',n);
    if(n>=5){const P=loadProg();newAch=[];unlock(P,'puz');jset('g2p.prog',P);if(newAch.length)note(newAch.join(' · '))}}
  track('puzzle_solved',{intel:p.intel});renderPuz();
}
$('bPuz').onclick=()=>{const b=$('puzList');b.hidden=!b.hidden;renderPuz()};

/* ===== Parties en ligne en cours ===== */
const loadLive=()=>jget('g2p.live',[]),saveLive=a=>jset('g2p.live',a.slice(0,MAX_LIVE));
const addLive=c=>saveLive([{c,t:Date.now()},...loadLive().filter(x=>x.c!==c)]);
const dropLive=c=>saveLive(loadLive().filter(x=>x.c!==c));
async function renderLive(){
  const det=$('liveBox'),list=loadLive();
  if(!db||!authReady||!list.length){det.hidden=true;return}
  const rows=[];
  for(const it of list){
    try{
      const sn=await db.doc('games/'+it.c).get();
      if(!sn.exists){dropLive(it.c);continue}
      const v=sn.data(),sd=seatsOf(v),i=sd.indexOf(cid);
      if(v.ended||i<0){dropLive(it.c);continue}
      const others=sd.map((u,k)=>k).filter(k=>k!==i&&sd[k]).map(k=>playerName(v,k)).join(', ')||'…';
      rows.push({c:it.c,txt:!sd.every(Boolean)?'En attente de joueurs':(v.cur||0)===i?'Ton tour contre '+others:'Tour de '+playerName(v,v.cur||0)});
    }catch(e){}
  }
  det.hidden=!rows.length;
  $('liveList').replaceChildren(...rows.map(r=>{
    const d=document.createElement('div'),a=document.createElement('span'),b=document.createElement('button');
    d.className='live-row';a.textContent=r.c+' · '+r.txt;b.type='button';b.textContent='Reprendre';b.onclick=()=>joinGame(r.c);d.append(a,b);return d;
  }));
}

/* ===== Tutoriel interactif (3 étapes + règle du territoire confiné) ===== */
const TUTO=[
  {t:'Posez un point',x:'Touchez une intersection pour poser un point. Les joueurs jouent à tour de rôle.',s:{r:[[2,2]],b:[[3,3]],h:[[3,2]]}},
  {t:'Entourez',x:'Reliez vos points en chaîne (les diagonales comptent) pour encercler des points adverses.',s:{r:[[2,1],[1,2],[3,2]],b:[[2,2]],h:[[2,3]]}},
  {t:'Capturez',x:'Fermez la boucle : les points encerclés sont capturés, vous marquez et rejouez aussitôt.',s:{r:[[2,1],[1,2],[3,2],[2,3]],b:[[2,2]],dead:[[2,2]],tint:[[2,2]]}},
  {t:'Zone confinée',x:'Une zone où une capture a eu lieu est confinée : ni vous ni l’adversaire ne pouvez plus y poser de point.',s:{r:[[2,1],[3,1],[1,2],[4,2],[2,3],[3,3]],b:[[2,2]],dead:[[2,2]],lock:[[3,2]],tint:[[2,2],[3,2]]}}
];
let tutoI=0;
function tutoDraw(sc){
  const c=$('tutoCv'),x=c.getContext('2d'),G=36,O=22,P=(a,b)=>[O+a*G,O+b*G];
  x.clearRect(0,0,220,220);x.fillStyle=col('--paper');x.fillRect(0,0,220,220);
  x.strokeStyle=col('--line');x.lineWidth=1;x.beginPath();for(let i=0;i<6;i++){x.moveTo(O+i*G,O);x.lineTo(O+i*G,O+5*G);x.moveTo(O,O+i*G);x.lineTo(O+5*G,O+i*G)}x.stroke();
  const dot=(a,b,cc,dead)=>{const [px,py]=P(a,b);x.globalAlpha=dead?.4:1;x.fillStyle=cc;x.shadowColor=cc;x.shadowBlur=dead?0:10;x.beginPath();x.arc(px,py,10,0,TAU);x.fill();x.shadowBlur=0;x.globalAlpha=1;
    if(dead){x.strokeStyle=col('--tx');x.lineWidth=2;x.beginPath();x.moveTo(px-9,py-9);x.lineTo(px+9,py+9);x.moveTo(px+9,py-9);x.lineTo(px-9,py+9);x.stroke()}};
  (sc.tint||[]).forEach(([a,b])=>{const [px,py]=P(a,b);x.fillStyle=col('--c0');x.globalAlpha=.18;x.fillRect(px-G/2,py-G/2,G,G);x.globalAlpha=1});
  (sc.lock||[]).forEach(([a,b])=>{const [px,py]=P(a,b);x.strokeStyle=col('--tx');x.globalAlpha=.7;x.lineWidth=1.5;x.strokeRect(px-7,py-7,14,14);x.beginPath();x.moveTo(px-7,py-7);x.lineTo(px+7,py+7);x.stroke();x.globalAlpha=1});
  (sc.h||[]).forEach(([a,b])=>{const [px,py]=P(a,b);x.strokeStyle=col('--c3');x.setLineDash([4,4]);x.beginPath();x.arc(px,py,11,0,TAU);x.stroke();x.setLineDash([])});
  sc.r.forEach(([a,b])=>dot(a,b,col('--c0'),false));
  sc.b.forEach(([a,b])=>dot(a,b,col('--c1'),(sc.dead||[]).some(d=>d[0]==a&&d[1]==b)));
}
function tutoShow(i){
  tutoI=i;const st=TUTO[i];
  $('tutoStep').textContent='Étape '+(i+1)+' / '+TUTO.length;$('tutoTitle').textContent=st.t;$('tutoTxt').textContent=st.x;
  $('tutoNext').textContent=i==TUTO.length-1?'C’est parti !':'Suivant';tutoDraw(st.s);
}
function tutoOpen(){$('tuto').hidden=false;tutoShow(0);$('tutoNext').focus()}
function tutoClose(){$('tuto').hidden=true;try{localStorage.setItem('g2p.tuto','1')}catch(e){}}
$('tutoNext').onclick=()=>tutoI>=TUTO.length-1?tutoClose():tutoShow(tutoI+1);
$('tutoSkip').onclick=tutoClose;$('bTuto').onclick=tutoOpen;
document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('win').hidden=true;if(!$('tuto').hidden)tutoClose()}});

/* ===== Initialisation des nouveautés ===== */
try{const l=localStorage.getItem('g2p.lvl');if(l!=null)$('lvl').value=l}catch(e){}
fillThemes();renderProg();renderPuz();zoomLabel();
let firstRun=true;try{firstRun=!localStorage.getItem('g2p.tuto')}catch(e){}
if(firstRun)setTimeout(tutoOpen,500);

refreshResume();renderHist();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
