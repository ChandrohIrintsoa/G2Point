const $=id=>document.getElementById(id),NAMES=['Rouge','Cyan','Vert','Ambre'];
const E=window.G2Engine,PZ=window.G2Puzzles;
/* Constantes nommées (plus de nombres magiques dans le rendu et la logique) */
const TAU=Math.PI*2,STONE_R=.3,LINE_W=.13,LAST_RING=3,FX_MS=600,POP_MS=380,STAGGER_MS=60,MAX_STAGGER=20,WIN_DELAY=900,
  CHAT_BADGE_MAX=99,CHAT_SCROLL_SLACK=70,CHAT_TOAST_MS=4200,IDLE_FORFEIT_MS=12e4,AI_DELAY_MS=380,DAILY_STONES=6,MAX_LIVE=5,PAN_PX=10,
  ZOOM_MIN=1,ZOOM_MAX=4,ZOOM_STEP=1.18,PUZ_RETRY_MS=1300,ELO_K=24,LOBBY_TTL_MS=36e5,LOBBY_MAX_AGE_MS=6e5,CHAT_TTL_MS=24*60*60*1000,
  THEMES=[{id:'neon',name:'Néon',need:0},{id:'aurore',name:'Aurore',need:1},{id:'ambre',name:'Ambre',need:3},{id:'mono',name:'Monochrome',need:7}];
let puz=-1,puzState='',zoom=1,prevSc=null,prevCombo=0,pop=null,winTimer=0,lvl=1,lobbyCode='',an=null,newAch=[],pan=null;
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
  const fullBoard=$('game').classList.contains('board-fullscreen');
  if(!$('game').hidden)document.querySelector('main').style.maxWidth=fullBoard?'none':innerWidth>=960?'min(1280px, calc(100vw - 48px))':Math.max(320,Math.min(900,(innerHeight-250)*(W+1)/(H+1)))+'px';
  const bw=fullBoard?Math.min(innerWidth-24,innerHeight*.52*(W+1)/(H+1)):wrap.clientWidth;if(!bw)return; /* plein écran : 60 % de la hauteur, le reste garde scores, messages et boutons visibles */
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

/* Mémoire IA v4 : migration fusionnée, sauvegarde de secours et journal borné. */
const AI_SCHEMA=4,AI_LOG_MAX=500,AI_BOOK_MAX=1500,AI_BOOK_KEEP=1200;
let aiPendingLog=[],aiLogTimer=0,aiLogGame='';
function queueAIMoveLog(move){
  if(!ai||daily||mode!=='local'||!S)return;
  const player=E.tmOf(TM,S.cur),[x,y]=move;
  if(!aiLogGame||moves.length===0)aiLogGame=String(Date.now())+'-'+moves.length;
  const before=E.clone(S),key=E.patKey(before,x,y,player),strategy=E.strategyKey(before,x,y,player),after=E.clone(before);
  if(!E.apply(after,move))return;
  aiPendingLog.push({at:Date.now(),game:aiLogGame,player,key,strategy,gain:after.capT===player?after.cap.length:-after.cap.length,won:null});
  aiPendingLog=aiPendingLog.slice(-AI_LOG_MAX);
  clearTimeout(aiLogTimer);aiLogTimer=setTimeout(flushAIMoveLog,2000);
}
function flushAIMoveLog(){
  clearTimeout(aiLogTimer);aiLogTimer=0;if(!aiPendingLog.length)return;
  const a=loadAI();a.log=[...(a.log||[]),...aiPendingLog].slice(-AI_LOG_MAX);aiPendingLog=[];saveAI(a);
}
const AIDEF=()=>({schema:AI_SCHEMA,w:E.DEFAULT_W.slice(),c:E.DEFAULT_W.slice(),st:{g:0,w:0},book:{},antiBook:{},antiSBook:{},sbook:{},log:[],games:0,manualLessons:0,opponent:{samples:0,captures:0,cluster:0,edge:0},pop:[],active:0,schemaHistory:[]});
function normalizeBook(book,now){
  const out={};if(!book||typeof book!=='object'||Array.isArray(book))return out;
  for(const [k,v] of Object.entries(book)){if(!Array.isArray(v))continue;out[k]=[Math.max(0,Number(v[0])||0),Number(v[1])||0,Math.max(0,Number(v[2])||0),Number.isFinite(Number(v[3]))?Number(v[3]):now]}
  return out;
}
function freshPopulation(weights){
  const pop=[{w:weights.slice(),score:0,played:0,elo:1200}];
  for(let i=1;i<8;i++)pop.push({w:E.mutate(weights,E.rng(0x475032+i*7919)),score:0,played:0,elo:1200});
  return pop;
}
function loadAI(){
  const raw=jget('g2p.ai',null),now=Date.now();
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return AIDEF();
  const a={...AIDEF(),...raw};
  a.w=Array.isArray(raw.w)&&raw.w.length===6&&raw.w.every(Number.isFinite)?raw.w.slice():E.DEFAULT_W.slice();
  a.book=normalizeBook(raw.book,now);a.antiBook=normalizeBook(raw.antiBook,now);
  a.sbook=normalizeBook(raw.sbook,now);a.antiSBook=normalizeBook(raw.antiSBook,now);
  /* Migration sans perte : les anciennes clés S| quittent le livre tactique pour le livre stratégique. */
  for(const [src,dst] of [[a.book,a.sbook],[a.antiBook,a.antiSBook]])for(const [key,value] of Object.entries(src))if(key.startsWith('S|')){dst[key]=dst[key]||value;delete src[key]}
  a.st={...AIDEF().st,...(raw.st||{})};a.opponent={...AIDEF().opponent,...(raw.opponent||{})};
  a.log=Array.isArray(raw.log)?raw.log.slice(-AI_LOG_MAX):[];
  a.schemaHistory=Array.isArray(raw.schemaHistory)?raw.schemaHistory.slice(-12):[];
  a.pop=Array.isArray(raw.pop)&&raw.pop.length===8&&raw.pop.every(p=>Array.isArray(p.w)&&p.w.length===6&&p.w.every(Number.isFinite))?raw.pop:freshPopulation(a.w);
  a.active=Math.max(0,Math.min(a.pop.length-1,Number(raw.active)||0));
  if(raw.schema!==AI_SCHEMA){
    if(!jget('g2p.ai.bak',null))jset('g2p.ai.bak',raw);
    a.schemaHistory.push({from:Number(raw.schema)||1,at:now});a.c=Array.isArray(raw.c)&&raw.c.length===6&&raw.c.every(Number.isFinite)?raw.c.slice():a.w.slice();a.schema=AI_SCHEMA;
    jset('g2p.ai',a);
  }
  return a;
}
function saveAI(a){
  a.schema=AI_SCHEMA;a.c=(Array.isArray(a.c)&&a.c.length===6?a.c:a.w).slice();
  a.opponent={...AIDEF().opponent,...(a.opponent||{})};a.log=(a.log||[]).slice(-AI_LOG_MAX);
  const trim=book=>{const ks=Object.keys(book||{});if(ks.length>AI_BOOK_MAX){ks.sort((p,q)=>(book[q][0]||0)-(book[p][0]||0));const nb={};ks.slice(0,AI_BOOK_KEEP).forEach(k=>nb[k]=book[k]);return nb}return book||{}};
  a.book=trim(a.book);a.antiBook=trim(a.antiBook);a.sbook=trim(a.sbook);a.antiSBook=trim(a.antiSBook);
  jset('g2p.ai',a);cloudPersistAI(a);
}
function aiPick(){aiP=daily?null:(()=>{const a=loadAI(),candidate=a.pop[a.active];return{w:candidate&&candidate.w||a.w,book:a.book,antiBook:a.antiBook,antiSBook:a.antiSBook,sbook:a.sbook,opponent:a.opponent,lvl}})()}

function teachWorstAIMistake(a){
  const state=E.create(W,H,N,TM);let worst=null;
  for(const move of moves){const player=E.tmOf(TM,state.cur),before=E.clone(state);if(!E.apply(state,move))continue;
    if(player===1){const gain=state.capT===player?state.cap.length:-state.cap.length;if(!worst||gain<worst.gain)worst={gain,state:before,move}}
  }
  if(worst)E.teach(a.book,worst.state,worst.move[0],worst.move[1],1,-2,a.sbook);
}
function evolveAI(a,score,playerElo=1200){
  a.pop=a.pop.length===8?a.pop:freshPopulation(a.w);
  score=Math.max(0,Math.min(1,Number(score)||0));
  const p=a.pop[a.active]||a.pop[0],elo=p.elo||1200,expected=1/(1+Math.pow(10,(playerElo-elo)/400));
  p.played=(p.played||0)+1;p.score=(p.score||0)+score;p.elo=Math.round(elo+24*(score-expected));
  a.games=(a.games||0)+1;a.active=(a.active+1)%a.pop.length;a.c=a.pop[a.active].w.slice();
  if(a.games>0&&a.games%10===0){
    const ranked=a.pop.slice().sort((x,y)=>(y.score/(y.played||1))-(x.score/(x.played||1))||y.elo-x.elo);
    const next=ranked.slice(0,2).map(x=>({...x,w:x.w.slice()}));
    for(let i=0;i<6;i++){const parent=ranked[i%4];next.push({w:E.mutate(parent.w,E.rng(Date.now()+i*3571+a.games)),score:0,played:0,elo:1200})}
    a.pop=next;a.active=0;a.w=a.pop[0].w.slice();a.c=a.w.slice();
  }
}
/* Auto-entraînement discret : uniquement onglet caché + réseau, 1 coup/3 s, 40 coups puis pause 10 min.
   La simulation est isolée de la partie visible et s'arrête dès le retour de l'utilisateur. */
let idleTrainTimer=0,idleTrainMoves=0,idleTrainPause=0,idleTrainState=null,idleBatterySafe=true;
const IDLE_SESSION_MOVES=20,IDLE_DAILY_MOVES=120,IDLE_STEP_MS=6000;
if(navigator.getBattery)navigator.getBattery().then(b=>{
  const refresh=()=>{idleBatterySafe=!!b.charging||b.level>=.25;if(idleBatterySafe&&document.hidden)startIdleTraining();else if(!idleBatterySafe)stopIdleTraining()};
  refresh();b.addEventListener('chargingchange',refresh);b.addEventListener('levelchange',refresh);
}).catch(()=>{});
function cancelIdleTimer(){clearTimeout(idleTrainTimer);if(typeof cancelIdleCallback==='function')cancelIdleCallback(idleTrainTimer);idleTrainTimer=0}
function scheduleIdleStep(fn,delay){
  cancelIdleTimer();
  idleTrainTimer=setTimeout(()=>{
    if(typeof requestIdleCallback==='function')idleTrainTimer=requestIdleCallback(()=>{idleTrainTimer=0;fn()},{timeout:Math.max(1000,delay)});
    else{idleTrainTimer=0;fn()}
  },delay);
}
function stopIdleTraining(){cancelIdleTimer();idleTrainState=null}
function idleDailyBudget(){
  const day=new Date().toISOString().slice(0,10),saved=jget('g2p.ai.idleBudget',{day,moves:0});
  const budget=saved.day===day?saved:{day,moves:0};
  return budget;
}
function startIdleTraining(){
  if(!document.hidden||!navigator.onLine||daily||!idleBatterySafe)return;
  if(Date.now()<idleTrainPause){scheduleIdleStep(startIdleTraining,idleTrainPause-Date.now());return}
  if(idleDailyBudget().moves>=IDLE_DAILY_MOVES)return;
  idleTrainMoves=0;idleTrainState=null;scheduleIdleStep(idleTrainingStep,IDLE_STEP_MS);
}
function idleTrainingStep(){
  if(!document.hidden||!navigator.onLine||daily||!idleBatterySafe){stopIdleTraining();return}
  const dailyBudget=idleDailyBudget();
  if(dailyBudget.moves>=IDLE_DAILY_MOVES)return;
  if(idleTrainMoves>=IDLE_SESSION_MOVES){idleTrainPause=Date.now()+30*60*1000;stopIdleTraining();if(document.hidden)scheduleIdleStep(startIdleTraining,30*60*1000);return}
  if(!idleTrainState)idleTrainState={s:E.create(11,15,2,false),moves:[]};
  const a=loadAI(),state=idleTrainState.s,player=state.cur,candidate=a.pop[a.active]?.w||a.w;
  const options=player===0?{w:candidate,book:a.book,sbook:a.sbook,antiBook:a.antiBook,antiSBook:a.antiSBook,opponent:a.opponent,lvl:2}:{w:E.DEFAULT_W,lvl:0};
  const move=E.aiMove(state,E.rng(Date.now()+idleTrainMoves),options);
  if(move&&E.apply(state,move))idleTrainState.moves.push(move);
  idleTrainMoves++;dailyBudget.moves++;jset('g2p.ai.idleBudget',dailyBudget);
  if(!move||state.free<=0){
    a.simulations=(a.simulations||0)+1;
    const score=state.sc[0]>state.sc[1]?1:state.sc[0]===state.sc[1]?.5:0;
    if(score===1)E.learn(a.book,idleTrainState.moves,11,15,2,false,[0],0,a.sbook);
    evolveAI(a,score,1000);saveAI(a);idleTrainState=null;
  }
  if(idleTrainMoves>=IDLE_SESSION_MOVES){idleTrainPause=Date.now()+30*60*1000;stopIdleTraining();if(document.hidden)scheduleIdleStep(startIdleTraining,30*60*1000);return}
  scheduleIdleStep(idleTrainingStep,IDLE_STEP_MS);
}
function learnFromGame(win,r){
  if(!ai||daily||mode!=='local'||!aiP)return;
  flushAIMoveLog();const a=loadAI();a.st=a.st||{g:0,w:0};
  E.learn(a.book,moves,W,H,N,TM,win,1,a.sbook);
  if(!win.includes(1))teachWorstAIMistake(a);
  if(win.includes(0))E.learn(a.antiBook,moves,W,H,N,TM,win,0,a.antiSBook);
  a.opponent=E.observeOpponent(a.opponent,moves,W,H,N,TM,0);for(const entry of a.log)if(entry.game===aiLogGame&&entry.won==null)entry.won=win.includes(entry.player);aiLogGame='';
  a.st.g++;if(win.includes(1)&&!win.includes(0))a.st.w++;
  const playerRating=(loadProg().elo[eloKey()]||1200),score=win.includes(1)?(win.includes(0)?.5:1):0;evolveAI(a,score,playerRating);saveAI(a);aiPick();
}

/* Libellés, résultat, historique, partage */
const label=i=>ai&&mode=='local'&&i==1?'IA':NAMES[i];
function result(){ /* un abandon exclut l'équipe fautive du classement */
  const fl=mode=='online'&&gameData&&Number.isInteger(gameData.forfeit)?tmOf(gameData.forfeit):-1;
  const pool=S.sc.map((v,i)=>i).filter(i=>i!=fl),mx=Math.max(...pool.map(i=>S.sc[i]));
  return{fl,mx,w:pool.filter(i=>S.sc[i]==mx)};
}
function isOnlineLoser(r=result()){return mode==='online'&&me>=0&&!r.w.includes(tmOf(me))}
function canUseRematch(){return mode!=='online'||(me>=0&&(!!rematchCode||isOnlineLoser()))}
const loadHist=()=>{try{return JSON.parse(localStorage.getItem('g2p.hist')||'[]')}catch(e){return[]}};
function record(){
  if(S.n<1||puz>=0)return;
  const {w}=result(),mine=mode=='online'?(me>=0?tmOf(me):-1):(ai?0:-1);
  const r=mine<0?'':w.includes(mine)?(w.length>1?'draw':'win'):'loss';
  const h=loadHist();h.unshift({t:Date.now(),k:daily?'daily':ai?'ai':mode,w:W,h:H,sc:S.sc.slice(),r,d:daily||undefined});
  try{localStorage.setItem('g2p.hist',JSON.stringify(h.slice(0,30)))}catch(e){}
  learnFromGame(w,r);cloudQueue(r);progress(r,mine);renderHist();renderProg();track('game_end',{mode:daily?'daily':ai?'ai':mode,players:N,result:r||'none'});
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
function explainAIMove(state,move){
  const [x,y]=move,coord=String.fromCharCode(65+x)+(y+1),after=E.clone(state);
  if(!E.apply(after,move))return 'Coup '+coord+' choisi.';
  const captured=after.sc[1]-state.sc[1];
  if(captured>0)return{type:'capture',details:'Coup '+coord+' : capture immédiate de '+captured+' point'+(captured>1?'s':''),confidence:.98};
  const check=E.clone(state);check.cur=0;E.rebuildHash(check);E.apply(check,move);
  const blocked=check.sc[0]-state.sc[0];
  if(blocked>0)return{type:'block',details:'Coup '+coord+' : bloque une capture adverse potentielle',confidence:.9};
  const allies=E.links(state,x,y,1),enemies=E.links(state,x,y,0);
  if(allies>=2)return{type:'chain',details:'Coup '+coord+' : renforce une chaîne avec '+allies+' voisins alliés',confidence:.78};
  if(enemies>0)return{type:'pressure',details:'Coup '+coord+' : met la pression sur un groupe adverse proche',confidence:.7};
  if(allies===1)return{type:'develop',details:'Coup '+coord+' : prolonge une chaîne et prépare de nouvelles connexions',confidence:.62};
  return{type:'develop',details:'Coup '+coord+' : développe une nouvelle zone de jeu',confidence:.48};
}
function aiTurn(){
  clearTimeout(aiTimer);
  const insight=$('aiInsight');
  if(!ai){insight.hidden=true;insight.textContent='';return}
  const ok=()=>mode==='local'&&!!S&&!over()&&S.cur===1;
  if(!ok())return;
  aiTimer=setTimeout(()=>{
    if(!ok())return;
    const move=E.aiMove(S,E.rng((daily?seedOf(daily):Date.now())+moves.length),aiP);
    if(!move)return;
    queueAIMoveLog(move);
    const why=explainAIMove(S,move);insight.textContent=why.details+' · confiance '+Math.round(why.confidence*100)+' %';insight.dataset.reason=why.type;insight.hidden=false;
    moves=[...moves,move];upd();saveLocal();aiTurn();
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
function resetMatchFx(){pop=null;fx=null;prevCombo=0;const c=$('combo');c.classList.remove('show');c.textContent=''}
function upd(){
  const hadMove=!!S&&S.n>0,comboBefore=hadMove?S.combo:0,prev=prevSc,fresh=sync();
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
  $('end').hidden=o||!ready;$('rematch').hidden=!o||!canUseRematch();$('share').hidden=!o||puz>=0;checkIdle();
  $('undo').hidden=!(mode=='local'&&!o&&moves.length>undoBase()&&!puzState);
  $('resign').hidden=!(mode=='online'&&ready&&!o&&me>=0);
  $('rematch').textContent=puz>=0?'Puzzle suivant':mode=='online'&&rematchCode?'Rejoindre la revanche':'Demander une revanche';
  $('quickReactions').hidden=!(mode==='online'&&ready&&!o&&me>=0);
  $('cancelQueue').hidden=!(mode==='online'&&!ready&&me===0&&gameData&&seatsOf(gameData).slice(1).every(x=>!x)&&moves.length===0);
  if(o&&!$('win').hidden){$('winRematch').hidden=!canUseRematch();$('winRematch').textContent=mode==='online'&&rematchCode?'Rejoindre la revanche':'Demander une revanche'}
  document.title=(mode=='online'&&!o&&ready&&me==p?'▶ À vous · ':'')+'G2Point — Jeu de points';
  if(fresh){
    startPop();
    if(S.cap.length){startFx();sfx('cap',S.combo);vib([30,40,30]);if(hadMove&&S.combo>comboBefore&&S.combo>=2)showCombo(S.combo)}
    else{sfx('place');vib(mode=='online'&&me==p?40:15)}
  }
  if(o&&!wasOver){
    sfx('win');if(puz<0){clearSave();record();showWin()}
    if(mode=='online')dropLive(code);
  }
  wasOver=o;
  prevCombo=S.combo;
  if(o&&mode=='online'&&me>=0&&gameData&&!gameData.ended&&endSent!==code){endSent=code;ref.update({ended:true}).catch(()=>{})} /* plateau plein (territoires compris) : clôture pour permettre la revanche */
  draw();
}

const note=t=>($('menu').hidden?$('gnote'):$('mnote')).textContent=t||'';
const err=e=>{const c=e&&e.code;let m=c=='permission-denied'?'Accès refusé : vérifiez la configuration et les règles Firestore.':c=='functions/unauthenticated'?'Connectez-vous puis réessayez.':((e&&(e.message||e.code))||String(e));note('Erreur : '+m)};
function show(g){$('menu').hidden=g;$('game').hidden=!g;$('gameDock').hidden=!g;note('');if(!g){$('aiInsight').hidden=true;$('aiInsight').textContent='';document.querySelector('main').style.maxWidth='';document.title='G2Point — Jeu de points';refreshResume();renderLive();renderProg();fillThemes()}}
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
  $('quickReactions').hidden=mode!=='online'||!ready||me<0;
  $('cancelQueue').hidden=mode!=='online';
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
const chatIsFresh=d=>{const ex=d.expireAt,created=d.createdAt;const expires=ex&&ex.toDate?ex.toDate().getTime():ex&&typeof ex.seconds==='number'?ex.seconds*1000:Date.now()+CHAT_TTL_MS;const sent=created&&created.toDate?created.toDate().getTime():created&&typeof created.seconds==='number'?created.seconds*1000:0;return expires>Date.now()&&(!sent||Date.now()-sent<CHAT_TTL_MS)};
function renderChatMessages(rows){
  rows=rows.filter(row=>chatIsFresh(row.data||{}));
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
function showChatToast(d){
  const host=$('chatToasts');if(!host||document.hidden)return;
  while(host.children.length>=3)host.firstElementChild.remove();
  const toast=document.createElement('article'),meta=document.createElement('strong'),body=document.createElement('span');
  const message=String(d.text||'').slice(0,500),reaction=Array.from(message).length<=4;
  toast.className='chat-toast'+(reaction?' reaction':'');
  meta.textContent=d.uid===cid?'Vous':playerNameByUid(d.uid);body.textContent=message;
  toast.append(meta,body);host.append(toast);
  setTimeout(()=>{toast.classList.add('leaving');setTimeout(()=>toast.remove(),260)},CHAT_TOAST_MS);
}
async function purgeExpiredMessages(){
  if(!ref||!firebase||!firebase.firestore)return;
  try{for(const [field,cutoff] of [['expireAt',firebase.firestore.Timestamp.now()],['createdAt',firebase.firestore.Timestamp.fromMillis(Date.now()-CHAT_TTL_MS)]])for(let i=0;i<5;i++){const old=await ref.collection('messages').where(field,'<=',cutoff).limit(100).get();if(old.empty)break;await Promise.all(old.docs.map(d=>d.ref.delete().catch(()=>null)));if(old.size<100)break}}catch(e){}
}
function startChatListener(){
  if(!ref||mode!=='online')return;
  chatRows=[];chatUnread=0;
  $('chatState').textContent='Chargement des messages…';
  const messageBox=$('chatMessages');
  if(messageBox){const loading=document.createElement('p');loading.className='chat-empty';loading.textContent='Chargement des messages…';messageBox.replaceChildren(loading)}
  purgeExpiredMessages();
  unsubChat&&unsubChat();firstChatSnapshot=true;
  unsubChat=ref.collection('messages').orderBy('createdAt','asc').limitToLast(100).onSnapshot(snap=>{
    if(!firstChatSnapshot){
      for(const ch of snap.docChanges())if(ch.type==='added'&&ch.doc.data().uid!==cid){
        if($('chatDialog').hidden)chatUnread++;
        if($('chatDialog').hidden)showChatToast(ch.doc.data());
      }
    }
    firstChatSnapshot=false;chatRows=snap.docs.map(d=>({id:d.id,data:d.data()})).filter(row=>chatIsFresh(row.data));if(!$('chatDialog').hidden)renderChatMessages(chatRows);
    const badge=$('chatBadge');badge.hidden=chatUnread<1;badge.textContent=chatUnread>CHAT_BADGE_MAX?CHAT_BADGE_MAX+'+':String(chatUnread);
    $('chatState').textContent='Discussion éphémère · suppression automatique après 24 h';
  },e=>{$('chatState').textContent='Discussion indisponible : vérifiez les règles Firestore.';console.warn(e)});
}
async function sendChatMessage(text,keep){
  const clean=String(text||'').trim().slice(0,500);
  if(!clean||mode!=='online'||!ref||!cid||Date.now()-lastSend<800)return;lastSend=Date.now();
  const send=$('chatSend');send.disabled=true;
  let sent=false;
  try{await ref.collection('messages').add({uid:cid,text:clean,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expireAt:messageExpiry()});if(!keep){$('chatInput').value='';sent=true}else showChatToast({uid:cid,text:clean})} /* réaction : retour visuel immédiat pour l'expéditeur */
  catch(e){err(e);$('chatState').textContent='Envoi impossible. Vérifiez votre connexion et les règles Firestore.'}
  finally{send.disabled=false;if(sent)closeChatPopup();else if(!$('chatDialog').hidden)$('chatInput').focus()}
}

const expiry=()=>firebase.firestore.Timestamp.fromMillis(Date.now()+7*864e5);
const messageExpiry=()=>firebase.firestore.Timestamp.fromMillis(Date.now()+CHAT_TTL_MS);
async function place(pt){
  if(!pt||!can()||S.o[pt[1]][pt[0]])return;
  if(S.blk[pt[1]][pt[0]]){note('Territoire fermé : cette case est inaccessible.');return}
  note('');
  queueAIMoveLog(pt);
  moves=[...moves,pt];upd(); /* coup optimiste : visible tout de suite, sans attendre le serveur */
  if(mode==='local'){saveLocal();aiTurn();return}
  const sentCode=code;
  try{ /* une seule écriture (pas de transaction) ; les règles Firestore valident tour et case libre */
    await ref.update({moves:firebase.firestore.FieldValue.arrayUnion(pt[1]*W+pt[0]),cur:S.cur,lastAt:firebase.firestore.FieldValue.serverTimestamp()});
  }catch(e){
    if(sentCode===code){moves=(gameData&&gameData.moves||[]).map(k=>[k%W,(k/W)|0]);S=null;upd()}
    note('Coup non confirmé : vérifie le tour et la connexion, puis réessaie.');console.warn(e)
  }
}

/* Les notifications de discussion doivent rester au-dessus du calque de jeu en plein écran. */
const chatToastHost=$('chatToasts');
if(chatToastHost&&chatToastHost.parentElement!==document.body)document.body.append(chatToastHost);
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
  if(pinch){ /* Pincement à deux doigts : zoom continu, indépendant du défilement. */
    if(ptrs.size>=2){const [a,b]=[...ptrs.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch.d>0)setZoom(pinch.z*d/pinch.d)}
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
  lvl=+$('lvl').value||0;try{localStorage.setItem('g2p.lvl',String(lvl))}catch(e){}puz=-1;puzState='';moves=[];S=null;ended=false;wasOver=false;resetMatchFx();
};
$('np').onchange=()=>{$('lvlRow').hidden=$('np').value!=='ai'};
$('nickname').onchange=()=>{try{localStorage.setItem('g2p.nickname',getNickname())}catch(e){}cloudSyncProfile()};
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
    puz=-1;puzState='';ai=false;daily='';code=nc;ref=nr;mode='online';ready=false;me=0;gameData=null;chatUnread=0;S=null;moves=[];ended=false;rematchCode='';wasOver=false;resetMatchFx();
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
    puz=-1;puzState='';ai=false;daily='';code=c;ref=r;mode='online';chatUnread=0;S=null;rematchCode='';wasOver=false;resetMatchFx();putSave({m:'online',c:code});addLive(code);show(true);sub();return true;
  }catch(e){if(!quiet)err(e);return false}
}
/* Suppression atomique d'un salon d'attente : impossible si un adversaire a déjà pris un siège. */
async function cancelWaitingGame(c){
  if(!db||!cid||!c)return false;
  const gameRef=db.doc('games/'+c),lobbyRef=db.doc('lobby/'+c);
  try{
    await db.runTransaction(async tx=>{
      const [gs,ls]=await Promise.all([tx.get(gameRef),tx.get(lobbyRef)]);
      if(!gs.exists){if(ls.exists&&ls.data().host===cid){tx.delete(lobbyRef);return}throw new Error('Ce salon n’existe plus ou ne vous appartient pas.')}
      const v=gs.data(),others=seatsOf(v).slice(1);
      if(v.s0!==cid||others.some(Boolean)||(v.moves||[]).length||v.ended)throw new Error('Un joueur a peut-être déjà rejoint : ce salon ne peut plus être supprimé.');
      tx.delete(gameRef);
      if(ls.exists&&ls.data().host===cid)tx.delete(lobbyRef);
    });
    dropLive(c);
    if(code===c){
      unsub&&unsub();unsub=null;unsubChat&&unsubChat();unsubChat=null;
      lobbyCode='';mode='';code='';ref=null;gameData=null;moves=[];S=null;ended=false;ready=true;me=-1;
      clearSave();resetMatchFx();show(false);note('Le salon d’attente a été supprimé.');renderOnlinePanel({n:N});
    }else await renderLive();
    return true;
  }catch(e){note(e.message||'Impossible de supprimer ce salon.');return false}
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
      try{await db.doc('lobby/'+code).set({host:cid,n:N,tm:TM,w:W,h:H,createdAt:firebase.firestore.FieldValue.serverTimestamp(),expireAt:firebase.firestore.Timestamp.fromMillis(Date.now()+LOBBY_TTL_MS)});lobbyCode=code;note('Partie rapide : en attente d’un adversaire…');upd()}
      catch(e){console.warn(e);note('Salon créé, mais non public : partagez le code '+code+'.')}
      track('quick_match',{role:'host'});
    }
  }catch(e){err(e)}
}
$('bQuick').onclick=quickMatch;
$('cancelQueue').onclick=()=>cancelWaitingGame(code);
$('bNew').onclick=()=>createGame(false);
$('bJoin').onclick=()=>joinGame($('code').value);
$('bResume').onclick=()=>{
  const sv=loadSave();if(!sv)return;
  if(sv.m=='online'){joinGame(sv.c).then(ok=>{if(!ok)clearSave()});return}
  puz=-1;puzState='';lvl=sv.l==null?1:sv.l;W=sv.w;H=sv.h;N=sv.n;TM=!!sv.tm;ai=!!sv.ai;daily=sv.d||'';aiPick();moves=sv.mv.map(k=>[k%W,(k/W)|0]);S=null;ended=false;wasOver=false;resetMatchFx();mode='local';ready=true;me=-1;code='';gameData=null;
  renderOnlinePanel({n:N});show(true);if(daily)note('Défi du jour — '+daily);upd();aiTurn();
};
$('bDaily').onclick=()=>{
  puz=-1;puzState='';lvl=1;ai=true;daily=todayStr();aiPick();W=11;H=15;N=2;TM=false;moves=dailyOpening(daily);S=null;ended=false;wasOver=false;resetMatchFx();mode='local';ready=true;me=-1;code='';gameData=null;
  renderOnlinePanel({n:N});show(true);note('Défi du jour — '+daily);upd();
};
$('rematch').onclick=async()=>{
  if(puz>=0){newPuzzle();return}
  if(mode=='local'){aiPick();moves=daily?dailyOpening(daily):[];S=null;ended=false;wasOver=false;resetMatchFx();upd();aiTurn();return}
  if(rematchCode){joinGame(rematchCode);return}
  if(!isOnlineLoser()){note('Seul le joueur perdant peut demander une revanche.');return}
  const old=ref;if(await createGame(true)&&old)old.update({next:code,nextBy:cid}).catch(()=>{}); /* le perdant crée le nouveau salon et invite les autres */
};
$('end').onclick=async()=>{
  if(!confirm('Terminer la partie maintenant ?'))return;
  if(mode=='local'){ended=true;upd()}
  else try{await ref.update({ended:true})}catch(e){err(e)}
};
$('back').onclick=()=>{if(isBoardFullscreen())setBoardFullscreen(false);closeLobby();$('win').hidden=true;clearTimeout(winTimer);clearTimeout(aiTimer);unsub&&unsub();unsub=null;unsubChat&&unsubChat();unsubChat=null;$('chatDialog').hidden=true;mode='';moves=[];S=null;gameData=null;resetMatchFx();show(false);renderOnlinePanel({n:N})};

$('online').hidden=false;
$('bNew').disabled=true;$('bJoin').disabled=true;$('bQuick').disabled=true;
const FIREBASE_CONFIG=window.G2POINT_FIREBASE_CONFIG||{};
const validConfig=!!(FIREBASE_CONFIG.apiKey&&FIREBASE_CONFIG.authDomain&&FIREBASE_CONFIG.projectId&&FIREBASE_CONFIG.appId&&!String(FIREBASE_CONFIG.apiKey).includes('REMPLACER'));
  if(window.firebase&&validConfig){
  try{
    firebase.initializeApp(FIREBASE_CONFIG);db=firebase.firestore();auth=firebase.auth();
    try{db.settings({experimentalAutoDetectLongPolling:true})}catch(e){console.warn('Détection de transport Firestore indisponible',e)}
    try{db.enablePersistence({synchronizeTabs:true}).catch(()=>{})}catch(e){} /* cache hors-ligne : résiste aux coupures réseau */
    try{an=firebase.analytics()}catch(e){} /* mesure de rétention (measurementId déjà configuré) */
    auth.onAuthStateChanged(user=>{
      if(user){cid=user.uid;authReady=true;$('bNew').disabled=false;$('bJoin').disabled=false;$('bQuick').disabled=false;renderLive();$('onlineSetup').hidden=true;$('hint').hidden=false;setOnlineState('Connecté · créez une partie ou saisissez un code.','ready')}
      else{cid='';authReady=false;$('bNew').disabled=true;$('bJoin').disabled=true;$('bQuick').disabled=true;$('onlineSetup').hidden=false;$('hint').hidden=true;setOnlineState('Connexion au service en cours…','connecting')}
    });
    auth.signInAnonymously().catch(e=>{
      console.error(e);$('onlineSetup').hidden=false;
      $('onlineSetup').textContent='Connexion Firebase impossible. Activez la connexion anonyme dans Authentication > Sign-in method, puis rechargez la page.';
      setOnlineState('Connexion indisponible · le mode local reste disponible.','offline');
    });
  }catch(e){console.error(e);setOnlineState('Configuration Firebase invalide.','offline')}
}else{
  $('onlineSetup').hidden=false;
  setOnlineState('Mode local disponible · configurez Firebase pour jouer en ligne.','offline');
}

function setOnlineState(message,state='connecting'){
  const pill=$('onlineState');pill.textContent=message;pill.dataset.state=state;
}
window.addEventListener('offline',()=>setOnlineState('Connexion réseau interrompue · parties locales toujours disponibles.','offline'));
window.addEventListener('online',()=>setOnlineState(authReady?'Connecté · le multijoueur est disponible.':'Reconnexion au service…',authReady?'ready':'connecting'));
function openChatPopup(){if(mode!=='online'||!ready)return;chatUnread=0;$('chatBadge').hidden=true;$('chatDialog').hidden=false;renderChatMessages(chatRows);renderOnlinePanel(gameData||{n:N});$('chatInput').focus({preventScroll:true})}
function closeChatPopup(){$('chatDialog').hidden=true;$('chatInput').blur()}
$('chatOpen').onclick=openChatPopup;
$('chatClose').onclick=closeChatPopup;
/* Réactions rapides : un seul état (ouvert / replié). Elles se replient après un envoi, un appui à l'extérieur ou Échap. */
const reactBox=$('quickReactions'),reactToggle=$('toggleReactions');
function setReactionsOpen(open){
  reactBox.classList.toggle('collapsed',!open);
  reactToggle.textContent=open?'Réactions −':'Réactions +';
  reactToggle.setAttribute('aria-expanded',String(open));
}
reactToggle.addEventListener('click',()=>setReactionsOpen(reactBox.classList.contains('collapsed')));
reactBox.addEventListener('click',e=>{
  const b=e.target.closest('button[data-e]');if(!b)return;
  sendChatMessage(b.dataset.e,true);setReactionsOpen(false);
});
document.addEventListener('pointerdown',e=>{
  if(reactBox.classList.contains('collapsed')||reactBox.contains(e.target)||e.target.closest('#dockReactions'))return;
  setReactionsOpen(false);
});
setReactionsOpen(false);
$('chatForm').addEventListener('submit',e=>{e.preventDefault();sendChatMessage($('chatInput').value)});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    closeChatPopup();$('aiLab').hidden=true;setReactionsOpen(false);
    if(isBoardFullscreen()&&!document.fullscreenElement)setBoardFullscreen(false); /* repli sans API plein écran (ex. iPhone) */
    return;
  }
  const target=e.target,typing=target&&(target.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  if(!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='f'&&!$('game').hidden){
    e.preventDefault();toggleBoardFullscreen();
  }
});
$('gameDockToggle').onclick=()=>{const panel=$('gameDockPanel'),open=panel.hidden;panel.hidden=!open;$('gameDockToggle').setAttribute('aria-expanded',String(open));$('gameDockToggle').textContent=open?'☰ Fermer':'☰ Menu'};
$('dockFullscreen').onclick=()=>$('boardFullscreen').click();
$('dockReactions').onclick=()=>{
  if(reactBox.hidden){note('Les réactions rapides sont disponibles pendant une partie en ligne.');return}
  $('gameDockPanel').hidden=true;$('gameDockToggle').setAttribute('aria-expanded','false');$('gameDockToggle').textContent='☰ Menu';
  setReactionsOpen(reactBox.classList.contains('collapsed'));
};
$('dockChat').onclick=openChatPopup;
$('dockMenu').onclick=()=>$('back').click();
/* Plein écran : c'est le DOCUMENT qui passe en plein écran, pas #game. Un élément en plein écran masque tout le reste
   du body (fenêtre de message, résultat, simulation IA…) ; la classe .board-fullscreen agrandit le terrain et garde
   scores, message et boutons sous les yeux. Sans API plein écran (iPhone), la classe seule donne un plein cadre. */
const isBoardFullscreen=()=>$('game').classList.contains('board-fullscreen');
async function setBoardFullscreen(on){
  $('game').classList.toggle('board-fullscreen',on);document.body.classList.toggle('board-fs',on);
  try{
    if(on&&!document.fullscreenElement&&document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen({navigationUI:'hide'});
    else if(!on&&document.fullscreenElement)await document.exitFullscreen();
  }catch(e){/* refusé par le navigateur : le plein cadre par classe reste actif */}
  updateFullscreenLabel();draw();
}
const toggleBoardFullscreen=()=>setBoardFullscreen(!isBoardFullscreen());
function updateFullscreenLabel(){const active=isBoardFullscreen();$('boardFullscreen').textContent=active?'⤢ Quitter le plein écran':'⛶ Plein écran';$('dockFullscreen').textContent=active?'⤢ Quitter le plein écran':'⛶ Terrain plein écran'}
$('boardFullscreen').onclick=toggleBoardFullscreen;
document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement&&isBoardFullscreen()){$('game').classList.remove('board-fullscreen');document.body.classList.remove('board-fs')} /* sortie par Échap / retour système */
  updateFullscreenLabel();draw();
});
$('cvw').addEventListener('dblclick',toggleBoardFullscreen);

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
  jset('g2p.prog',P);cloudSyncProgress(P);
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

const AI_TRAIN_W=11,AI_TRAIN_H=15,AI_TRAIN_PAD=25,AI_TRAIN_STEP=50;
let aiTraining={stones:[],choice:null,suggestion:null};
const aiGoalText={
  attack:'Construis une chaîne qui menace les points adverses et prépare une capture.',
  defend:'Repère le point qui protège ta chaîne ou bloque la fermeture d’une boucle adverse.',
  approach:'Travaille le chemin vers la zone ciblée en gardant des connexions possibles.',
  chain:'Renforce un groupe de points et prépare de nouvelles connexions.'
};
function aiTrainingState(){
  const s=E.create(AI_TRAIN_W,AI_TRAIN_H,2,false);
  for(const p of aiTraining.stones)s.o[p.y][p.x]=p.owner;
  s.n=aiTraining.stones.length;s.free=AI_TRAIN_W*AI_TRAIN_H-s.n;s.cur=0;E.rebuildHash(s);
  return s;
}
function aiCoord(m){return String.fromCharCode(65+m[0])+(m[1]+1)}
function drawAITrainingBoard(){
  const c=$('aiBoard'),x=c.getContext('2d');if(!x)return;
  x.clearRect(0,0,c.width,c.height);x.fillStyle='#080d20';x.fillRect(0,0,c.width,c.height);
  x.strokeStyle='rgba(115,160,205,.22)';x.lineWidth=1.3;
  for(let col=0;col<AI_TRAIN_W;col++){const px=AI_TRAIN_PAD+col*AI_TRAIN_STEP;x.beginPath();x.moveTo(px,AI_TRAIN_PAD);x.lineTo(px,AI_TRAIN_PAD+(AI_TRAIN_H-1)*AI_TRAIN_STEP);x.stroke()}
  for(let row=0;row<AI_TRAIN_H;row++){const py=AI_TRAIN_PAD+row*AI_TRAIN_STEP;x.beginPath();x.moveTo(AI_TRAIN_PAD,py);x.lineTo(AI_TRAIN_PAD+(AI_TRAIN_W-1)*AI_TRAIN_STEP,py);x.stroke()}
  x.strokeStyle='rgba(5,217,232,.32)';x.lineWidth=2;x.strokeRect(AI_TRAIN_PAD,AI_TRAIN_PAD,(AI_TRAIN_W-1)*AI_TRAIN_STEP,(AI_TRAIN_H-1)*AI_TRAIN_STEP);
  for(const p of aiTraining.stones){
    const px=AI_TRAIN_PAD+p.x*AI_TRAIN_STEP,py=AI_TRAIN_PAD+p.y*AI_TRAIN_STEP;
    x.save();x.shadowBlur=15;x.shadowColor=p.owner===1?'#05d9e8':'#ff2a6d';
    const g=x.createRadialGradient(px-5,py-6,2,px,py,17);
    if(p.owner===1){g.addColorStop(0,'#d9ffff');g.addColorStop(.35,'#05d9e8');g.addColorStop(1,'#087f9c')}
    else{g.addColorStop(0,'#ffe1ec');g.addColorStop(.35,'#ff2a6d');g.addColorStop(1,'#9d174d')}
    x.fillStyle=g;x.beginPath();x.arc(px,py,14,0,Math.PI*2);x.fill();x.restore();
  }
  const mark=(m,color,r)=>{if(!m)return;const px=AI_TRAIN_PAD+m[0]*AI_TRAIN_STEP,py=AI_TRAIN_PAD+m[1]*AI_TRAIN_STEP;x.save();x.strokeStyle=color;x.lineWidth=3;x.shadowBlur=12;x.shadowColor=color;x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.stroke();x.restore()};
  mark(aiTraining.suggestion,'#ffd166',20);mark(aiTraining.choice,'#8cff98',24);
  x.fillStyle='rgba(173,195,226,.7)';x.font='15px system-ui';x.textAlign='center';x.textBaseline='middle';
  for(let col=0;col<AI_TRAIN_W;col++)x.fillText(String.fromCharCode(65+col),AI_TRAIN_PAD+col*AI_TRAIN_STEP,AI_TRAIN_PAD+(AI_TRAIN_H-1)*AI_TRAIN_STEP+18);
  x.textAlign='right';for(let row=0;row<AI_TRAIN_H;row++)x.fillText(String(row+1),AI_TRAIN_PAD-12,AI_TRAIN_PAD+row*AI_TRAIN_STEP);
}
function renderAILab(){
  const a=loadAI(),patterns=Object.keys(a.book||{}).length+Object.keys(a.sbook||{}).length,weights=(a.w||[]).length,played=a.st||{g:0,w:0};
  const rate=played.g?Math.round(100*(played.w||0)/played.g):0;
  const qi=Math.round((a.pop||[]).reduce((best,p)=>Math.max(best,+p.elo||0),1200));
  const op=a.opponent||{samples:0,captures:0,cluster:0,edge:0},style=E.opponentStyle(op);
  const stats=[['ELO IA calibré',qi+' pts'],['Parties apprises',a.st?.g||0],['Motifs IA',patterns],['Anti-motifs humains',Object.keys(a.antiBook||{}).length+Object.keys(a.antiSBook||{}).length],['Journal récent',(a.log||[]).length+'/500'],['Population génétique',(a.pop||[]).length+' chromosomes'],['Auto-parties cachées',a.simulations||0],['Adversaire observé',op.samples+' coups'],['Style adverse','Captures '+Math.round(style.capture*100)+' % · chaînes '+Math.round(style.cluster*100)+' %'],['Victoires IA',rate+' %']];
  const host=$('aiStats');host.replaceChildren();
  for(const [label,value] of stats){const card=document.createElement('div'),name=document.createElement('span'),v=document.createElement('strong');card.className='ai-stat';name.textContent=label;v.textContent=value;card.append(name,v);host.append(card)}
  const restore=document.createElement('button');restore.type='button';restore.textContent='Restaurer la mémoire IA précédente';restore.hidden=!jget('g2p.ai.bak',null);
  restore.onclick=()=>{const backup=jget('g2p.ai.bak',null);if(!backup||!confirm('Restaurer la sauvegarde IA précédente ? La mémoire actuelle sera remplacée.'))return;jset('g2p.ai',backup);aiPick();renderAILab();note('Sauvegarde IA restaurée ; elle sera migrée en douceur au prochain chargement.')};
  host.append(restore);
  drawAITrainingBoard();
}
function openAILab(){renderAILab();$('aiLab').hidden=false;$('aiTrainStatus').textContent='Made by ChaIr.'}
function setAITrainingHint(message){$('aiCoach').textContent=message}
$('aiBoard').addEventListener('click',e=>{
  const c=$('aiBoard'),r=c.getBoundingClientRect(),px=(e.clientX-r.left)*c.width/r.width,py=(e.clientY-r.top)*c.height/r.height;
  const col=Math.round((px-AI_TRAIN_PAD)/AI_TRAIN_STEP),row=Math.round((py-AI_TRAIN_PAD)/AI_TRAIN_STEP);
  if(col<0||col>=AI_TRAIN_W||row<0||row>=AI_TRAIN_H||Math.abs(px-(AI_TRAIN_PAD+col*AI_TRAIN_STEP))>AI_TRAIN_STEP*.48||Math.abs(py-(AI_TRAIN_PAD+row*AI_TRAIN_STEP))>AI_TRAIN_STEP*.48)return;
  const brush=$('aiBrush').value,idx=aiTraining.stones.findIndex(p=>p.x===col&&p.y===row);
  if(brush==='choice'){
    if(idx>=0){setAITrainingHint('Cette intersection est déjà occupée. Choisis une case vide pour le coup à enseigner.');return}
    aiTraining.choice=[col,row];setAITrainingHint('Coup choisi : '+aiCoord(aiTraining.choice)+'. Appuie sur « Enseigner le coup choisi » pour enregistrer cette leçon.');
  }else if(brush==='erase'){
    if(idx>=0)aiTraining.stones.splice(idx,1);
    aiTraining.choice=null;aiTraining.suggestion=null;
    setAITrainingHint('Point effacé. Continue à préparer la position.');
  }else{
    const owner=Number(brush);
    if(idx>=0)aiTraining.stones[idx].owner=owner;else aiTraining.stones.push({x:col,y:row,owner});
    aiTraining.choice=null;aiTraining.suggestion=null;
    setAITrainingHint('Point placé. Tu peux construire la position en alternant les deux camps.');
  }
  drawAITrainingBoard();
});
$('aiBrush').onchange=()=>{
  const v=$('aiBrush').value;
  setAITrainingHint(v==='choice'?'Touchez une intersection vide pour marquer le coup que tu veux enseigner.':v==='erase'?'Touchez un point pour l’effacer.':'Touchez les intersections pour placer les points du camp sélectionné.');
};
$('aiGoal').onchange=()=>setAITrainingHint(aiGoalText[$('aiGoal').value]+' Prépare la position, puis demande une analyse.');
$('aiAnalyze').onclick=()=>{
  const s=aiTrainingState(),a=loadAI(),m=E.aiMove(s,()=>0,{w:a.w,book:a.book,opponent:a.opponent,lvl:2});
  if(!m){$('aiTrainStatus').textContent='Aucun coup légal trouvé sur cette position.';return}
  aiTraining.suggestion=m;drawAITrainingBoard();
  $('aiTrainStatus').textContent='Réponse proposée par l’IA : '+aiCoord(m)+'. Sélectionne « Coup à enseigner » pour indiquer ta réponse de référence.';
};
$('aiTeach').onclick=()=>{
  if(!aiTraining.choice){$('aiTrainStatus').textContent='Choisis d’abord une intersection vide avec « Coup à enseigner ».';return}
  const s=aiTrainingState(),[x,y]=aiTraining.choice;
  if(!E.legal(s,x,y)){$('aiTrainStatus').textContent='Ce coup n’est pas légal dans cette position. Choisis une intersection vide.';return}
  const a=loadAI();
  if(!E.teach(a.book,s,x,y,0,1,a.sbook)){$('aiTrainStatus').textContent='La leçon n’a pas pu être enregistrée.';return}
  a.manualLessons=(a.manualLessons||0)+1;saveAI(a);
  $('aiTrainStatus').textContent='Leçon enregistrée : '+aiCoord([x,y])+' est mémorisé comme réponse à privilégier.';
  aiTraining.choice=null;renderAILab();
};
$('aiClear').onclick=()=>{
  aiTraining={stones:[],choice:null,suggestion:null};drawAITrainingBoard();
  setAITrainingHint('Terrain vidé. Construis une nouvelle situation pour l’IA.');
  $('aiTrainStatus').textContent='Terrain réinitialisé.';
};
$('aiLabLaunch').onclick=openAILab;
$('aiLabClose').onclick=()=>$('aiLab').hidden=true;
$('aiLabDone').onclick=()=>$('aiLab').hidden=true;
function fillThemes(){
  const n=jget('g2p.dd',[]).length,sel=$('theme'),cur=(()=>{try{return localStorage.getItem('g2p.theme')||'neon'}catch(e){return'neon'}})();
  sel.replaceChildren(...THEMES.map(t=>{const o=document.createElement('option'),ok=n>=t.need;o.value=t.id;o.disabled=!ok;o.textContent=ok?t.name:t.name+' 🔒 ('+t.need+' défi'+(t.need>1?'s':'')+' du jour)';return o}));
  const t=THEMES.find(x=>x.id==cur&&n>=x.need)?cur:'neon';sel.value=t;setTheme(t);
}
function updateThemeSwatches(){
  const host=$('themeSwatches');if(!host)return;
  const styles=getComputedStyle(document.documentElement);
  host.replaceChildren(...[0,1,2,3].map(i=>{
    const dot=document.createElement('span'),color=styles.getPropertyValue('--c'+i).trim();
    dot.style.background=color;dot.style.color=color;dot.setAttribute('aria-hidden','true');return dot;
  }));
}
function setTheme(id){document.documentElement.dataset.theme=id;try{localStorage.setItem('g2p.theme',id)}catch(e){}COL=null;dirty=true;updateThemeSwatches();draw()}
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
    const mine=mode==='online'&&me>=0?tmOf(me):mode==='local'&&ai?0:-1,isDraw=w.length>1,isMineWinner=mine>=0&&w.includes(mine);
    const perspective=mine<0?'Résultat de la partie':isMineWinner?(isDraw?'Égalité en tête':'Tu as gagné !'):'Tu as perdu';
    $('winTitle').textContent=mine<0?(isDraw?'Égalité !':nm(w[0])+' gagne !'):perspective;
    $('winStatus').textContent=mine<0?perspective:isMineWinner?(isDraw?'Tu partages la première place.':'Belle partie. Tu remportes ce match.'):'La partie est terminée. Tu peux demander une revanche.';
    $('win').classList.toggle('winner-view',mine>=0&&!isDraw&&isMineWinner);
    $('win').classList.toggle('loser-view',mine>=0&&!isMineWinner);
    $('win').classList.toggle('draw-view',isDraw&& (mine<0||isMineWinner));
    $('winScores').replaceChildren(...S.sc.map((v,i)=>{const d=document.createElement('div');d.className=w.includes(i)?(isDraw?'score-draw':'score-winner'):'score-loser';d.style.setProperty('--c','var(--c'+i+')');const b=mk('b',v);d.append(mk('span',label(i)),b);if(i===mine){const you=mk('small','Vous');you.className='score-you';d.append(you)}return d}));
    const terr=S.sc.map(()=>new Set());for(const {t,c} of S.loops)c.cells.forEach(([a,b])=>terr[t].add(b*W+a));
    const mx=Math.max(...S.big),bi=S.big.indexOf(mx);
    const rows=[['Coups joués',S.n],['Plus grosse capture',mx>0?nm(bi)+' · '+mx+' point'+(mx>1?'s':''):'—'],...S.sc.map((v,i)=>['Territoire '+label(i),Math.round(terr[i].size*100/(W*H))+' %'])];
    newAch.forEach(t=>rows.push([t,'']));
    $('winRecap').replaceChildren(...rows.map(([a,b])=>{const li=document.createElement('li');li.append(mk('span',a),mk('span',b));return li}));
    $('winRematch').hidden=!canUseRematch();
    $('winRematch').textContent=mode==='online'&&rematchCode?'Rejoindre la revanche':'Demander une revanche';
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
/* Zoom pilotable au curseur, aux boutons, au pincement et à Ctrl+molette. */
const zs=jget('g2p.zoom',null);if(zs)zoom=Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,+zs.z||1));
function zoomLabel(){
  $('zoomRange').value=String(zoom);$('zoomValue').textContent=Math.round(zoom*100)+' %';
  $('zoomIn').disabled=zoom>=ZOOM_MAX;$('zoomOut').disabled=zoom<=ZOOM_MIN;
  jset('g2p.zoom',{z:zoom});
}
function setZoom(z){
  z=Math.min(ZOOM_MAX,Math.max(ZOOM_MIN,z));if(Math.abs(z-zoom)<.005)return;
  const w=$('cvw'),ratio=z/zoom,cx=w.scrollLeft+w.clientWidth/2,cy=w.scrollTop+w.clientHeight/2;
  zoom=z;dirty=true;zoomLabel();paint();
  requestAnimationFrame(()=>{w.scrollLeft=Math.max(0,cx*ratio-w.clientWidth/2);w.scrollTop=Math.max(0,cy*ratio-w.clientHeight/2)});
}
$('zoomIn').onclick=()=>setZoom(zoom*ZOOM_STEP);
$('zoomOut').onclick=()=>setZoom(zoom/ZOOM_STEP);
$('zoomRange').oninput=()=>setZoom(+$('zoomRange').value);
$('zoomReset').onclick=()=>{setZoom(1);requestAnimationFrame(()=>{$('cvw').scrollLeft=0;$('cvw').scrollTop=0})};
$('cvw').addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();setZoom(zoom*(e.deltaY<0?ZOOM_STEP:1/ZOOM_STEP))}},{passive:false});

/* ===== Puzzles « capture en 1 coup » ===== */
const aiIntel=()=>{const a=loadAI(),best=Math.max(1000,...(a.pop||[]).map(p=>Number(p.elo)||1200));return Math.max(0,Math.min(10,Math.round((best-1000)/100)))}; /* QI des puzzles aligné sur l'ELO réel de la population */
let puzs=[],puzBusy=false;
function renderPuz(){
  const gen=document.createElement('button');gen.type='button';gen.className='pri';gen.disabled=puzBusy;gen.textContent=puzBusy?'L’IA prépare un puzzle…':'Nouveau puzzle de l’IA';gen.onclick=newPuzzle;
  $('puzList').replaceChildren(gen);
}
function newPuzzle(){
  if(puzBusy)return;puzBusy=true;renderPuz();
  setTimeout(()=>{ /* génération hors du rendu ; plusieurs tentatives si la position idéale n'est pas trouvée */
    const a=loadAI(),it=aiIntel();let p=null;
    for(let k=0;k<4&&!p;k++)p=E.genPuzzle(Math.random,it,{w:a.c||a.w,book:a.book,sbook:a.sbook,antiBook:a.antiBook,antiSBook:a.antiSBook,opponent:a.opponent},1500);
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
    if(n>=5){const P=loadProg();newAch=[];unlock(P,'puz');jset('g2p.prog',P);cloudSyncProgress(P);if(newAch.length)note(newAch.join(' · '))}}
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
      const waiting=v.s0===cid&&sd.slice(1).every(x=>!x)&&!(v.moves||[]).length;
      rows.push({c:it.c,txt:!sd.every(Boolean)?'En attente de joueurs':(v.cur||0)===i?'Ton tour contre '+others:'Tour de '+playerName(v,v.cur||0),waiting});
    }catch(e){}
  }
  det.hidden=!rows.length;
  $('liveList').replaceChildren(...rows.map(r=>{
    const d=document.createElement('div'),a=document.createElement('span'),actions=document.createElement('div'),b=document.createElement('button');
    d.className='live-row';actions.className='live-actions';a.textContent=r.c+' · '+r.txt;b.type='button';b.textContent='Reprendre';b.onclick=()=>joinGame(r.c);actions.append(b);
    if(r.waiting){const del=document.createElement('button');del.type='button';del.className='danger-soft';del.textContent='Supprimer';del.onclick=()=>cancelWaitingGame(r.c);actions.append(del)}
    d.append(a,actions);return d;
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

/* ===== Cloud : Cloudflare Worker + D1 (archives des parties + mémoire de l'IA partagée) ===== */
const CLOUD_PULL_MS=3e5,OUTBOX_MAX=30;
const cloudUrl=()=>((window.G2_CLOUD&&window.G2_CLOUD.url)||'').replace(/\/$/,'');
const devId=()=>{let v='';try{v=localStorage.getItem('g2p.pid')||''}catch(e){}if(!v){v='d'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):String(Math.random()).slice(2)+Date.now());try{localStorage.setItem('g2p.pid',v)}catch(e){}}return v};
let flushing=false,lastPull=0;
/* Mise en file d'attente : si le réseau est coupé, la partie est renvoyée plus tard (une seule fois par appareil côté serveur) */
function cloudQueue(r){
  if(!cloudUrl()||moves.length<6)return;
  if(mode=='online'&&me!==0)return; /* en ligne : un seul joueur envoie la partie, pour ne pas la faire apprendre deux fois */
  const id=mode=='online'?code:'g'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):String(Math.random()).slice(2)+Date.now());
  const rec={gameId:id,playerId:devId(),w:W,h:H,n:N,tm:!!TM,mode:daily?'daily':ai?'ai':mode=='online'?'online':'local',result:['win','loss','draw'].includes(r)?r:'na',moves:moves.map(m=>[m[0],m[1]])};
  jset('g2p.outbox',[...jget('g2p.outbox',[]),rec].slice(-OUTBOX_MAX));cloudFlush();
}
async function cloudFlush(){
  if(!cloudUrl()||flushing)return;flushing=true;
  try{
    let q=jget('g2p.outbox',[]);
    while(q.length){
      const res=await fetch(cloudUrl()+'/api/archive',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(q[0])});
      if(res.status===429||res.status>=500)break;     /* réessayer plus tard */
      q=q.slice(1);jset('g2p.outbox',q);               /* envoyée, déjà connue ou définitivement refusée */
    }
  }catch(e){/* hors-ligne : la file est conservée */}finally{flushing=false}
}
/* Récupère la mémoire de l'IA partagée (toutes les parties de tous les appareils) et la fusionne avec la mémoire locale */
let cloudAiTimer=0;
async function cloudRequest(path,method='GET',body=null){
  if(!cloudUrl())return null;
  const opts={method,headers:{'Content-Type':'application/json'}};
  if(body)opts.body=JSON.stringify(body);
  const res=await fetch(cloudUrl()+path,opts);
  if(!res.ok)throw new Error('Cloudflare '+res.status);
  return res.status===204?null:res.json();
}
async function cloudSyncProfile(){
  if(!cloudUrl())return;
  try{await cloudRequest('/api/profile','PUT',{playerId:devId(),nickname:getNickname()})}catch(e){}
}
async function cloudSyncProgress(P=loadProg()){
  if(!cloudUrl())return;
  try{await cloudRequest('/api/progress','PUT',{playerId:devId(),progress:P})}catch(e){}
}
function cloudPersistAI(A){
  if(!cloudUrl())return;
  clearTimeout(cloudAiTimer);
  cloudAiTimer=setTimeout(async()=>{
    try{await cloudRequest('/api/ai/player','PUT',{playerId:devId(),weights:A.c||A.w,games:A.games||0,wins:A.st&&A.st.w||0})}catch(e){}
  },1200);
}
async function cloudBootstrap(){
  if(!cloudUrl())return;
  const id=encodeURIComponent(devId());
  try{
    const [pr,pg,aiRemote]=await Promise.all([
      cloudRequest('/api/profile?playerId='+id),
      cloudRequest('/api/progress?playerId='+id),
      cloudRequest('/api/ai/player?playerId='+id)
    ]);
    if(pr&&pr.profile&&!localStorage.getItem('g2p.nickname')){
      $('nickname').value=pr.profile.nickname||'';
    }else await cloudSyncProfile();
    if(pg&&pg.progress){
      if(!localStorage.getItem('g2p.prog'))jset('g2p.prog',pg.progress);
      else await cloudSyncProgress();
    }else await cloudSyncProgress();
    if(aiRemote&&aiRemote.training){
      const A=loadAI(),T=aiRemote.training;
      /* Récupère éventuellement les poids, jamais les anciens compteurs : ils incluaient des parties non-IA. */
      if(Array.isArray(T.weights)&&T.weights.length===6&&T.weights.every(Number.isFinite)){
        A.w=T.weights;A.c=T.weights.slice();if(A.pop&&A.pop.length)A.pop[0].w=T.weights.slice();A.active=0;jset('g2p.ai',A);
      }
      cloudPersistAI(A);
    }else cloudPersistAI(loadAI());
    renderProg();
  }catch(e){}
}
async function cloudPull(force){
  if(!cloudUrl()||(!force&&Date.now()-lastPull<CLOUD_PULL_MS))return;lastPull=Date.now();
  try{
    const res=await fetch(cloudUrl()+'/api/ai');if(!res.ok)return;
    const rm=await res.json(),a=loadAI();
    if(rm&&rm.schema===2&&rm.book&&typeof rm.book==='object'){
      for(const [key,value] of Object.entries(rm.book)){
        if(!Array.isArray(value)||value.length<4)continue;
        const count=Number(value[0]),gain=Number(value[1]),wins=Number(value[2]),lastSeen=Number(value[3]);
        if(!Number.isSafeInteger(count)||count<3||count>10000000||!Number.isFinite(gain)||!Number.isFinite(wins)||wins<0||wins>count||!Number.isFinite(lastSeen)||lastSeen<=0||lastSeen>Date.now()+86400000)continue;
        if(key.startsWith('S|'))a.sbook[key]=[count,gain,wins,lastSeen];else a.book[key]=[count,gain,wins,lastSeen];
      }
      a.games=Math.max(a.games,+rm.games||0);saveAI(a)
    } /* seuls les motifs distants suffisamment observés et horodatés sont fusionnés */
  }catch(e){}
}
setTimeout(()=>{cloudFlush();cloudPull(true);cloudBootstrap()},2500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){stopIdleTraining();cloudFlush();cloudPull()}else startIdleTraining()});
if(document.hidden)startIdleTraining();

/* ===== Initialisation des nouveautés ===== */
try{const l=localStorage.getItem('g2p.lvl');if(l!=null)$('lvl').value=l}catch(e){}
fillThemes();renderProg();renderPuz();zoomLabel();$('lvlRow').hidden=$('np').value!=='ai';$('bDaily').title='Un nouveau défi, déterminé automatiquement pour la date du jour, est proposé à chaque journée.';
let firstRun=true;try{firstRun=!localStorage.getItem('g2p.tuto')}catch(e){}
if(firstRun)setTimeout(tutoOpen,500);

refreshResume();renderHist();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
