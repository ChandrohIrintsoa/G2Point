/* G2Point — améliorations d'interface et observation autonome de l'IA */
(()=>{'use strict';
const $=id=>document.getElementById(id);

/* Menu d'actions intégré au flux du jeu : ne masque plus les scores sur mobile. */
const dock=$('gameDock'),toggle=$('gameDockToggle'),panel=$('gameDockPanel');
if(dock){
  const game=$('game'),bar=$('bar');
  if(game&&bar&&dock.parentElement!==game)bar.insertAdjacentElement('afterend',dock);
  dock.classList.add('dock-inline');
}

/* Fin de match : le plateau sort du fullscreen et laisse apparaître les résultats. */
let exitDone=false;
function leaveFullscreenOnResult(){
  const end=$('end'),msg=$('msg'),board=$('game');
  const text=(msg?.textContent||'').toLowerCase();
  const finished=!!end?.hidden&&/(gagne|égalité|abandon|réussi)/i.test(text);
  if(!finished){exitDone=false;return}
  if(exitDone)return;exitDone=true;
  if(board?.classList.contains('board-fullscreen')&&typeof setBoardFullscreen==='function')setBoardFullscreen(false); /* défini dans app.js */
  setTimeout(()=>{if($('win')&&$('win').hidden&&typeof window.showWin==='function')window.showWin()},80);
}
setInterval(leaveFullscreenOnResult,250);

/* Réactions rapides : repliées par défaut dans index.html, tout le comportement est dans app.js (setReactionsOpen). */

/* Laboratoire manuel retiré : accès au moniteur d'observation par appui long de 15 s. */
const lab=$('aiLab'),launch=$('aiLabLaunch'),summary=$('progSummary');
if(lab)lab.hidden=true;
const monitor=document.createElement('section');
monitor.id='aiObserver';
monitor.className='ai-observer ai-war-room';
monitor.hidden=true;
monitor.setAttribute('role','dialog');
monitor.setAttribute('aria-modal','true');
monitor.setAttribute('aria-label','Tableau de bord de guerre IA');
monitor.innerHTML=`
  <div class="wr-shell">
    <header class="wr-header">
      <div class="wr-header__id">
        <span class="wr-header__pulse" aria-hidden="true"></span>
        <div>
          <small class="wr-header__kicker">APPRENTISSAGE AUTONOME</small>
          <h2 class="wr-header__title">Observatoire IA</h2>
        </div>
      </div>
      <div class="wr-header__actions">
        <span class="wr-header__live" id="wrLive"><span class="wr-live__dot"></span><span class="wr-live__label">Standby</span></span>
        <button type="button" id="observerClose" class="wr-header__close" aria-label="Fermer">×</button>
      </div>
    </header>

    <div class="wr-grid">
      <div class="wr-card wr-card--kpis">
        <div class="wr-card__head"><span class="wr-card__title">Métriques</span><span class="wr-card__tag">Live</span></div>
        <div class="wr-kpis">
          <div class="wr-kpi"><span class="wr-kpi__val" id="wrKpiGames">0</span><span class="wr-kpi__label">Parties</span></div>
          <div class="wr-kpi"><span class="wr-kpi__val" id="wrKpiSims">0</span><span class="wr-kpi__label">Simulations</span></div>
          <div class="wr-kpi"><span class="wr-kpi__val" id="wrKpiPatterns">0</span><span class="wr-kpi__label">Motifs</span></div>
          <div class="wr-kpi"><span class="wr-kpi__val" id="wrKpiMoves">0</span><span class="wr-kpi__label">Coups</span></div>
        </div>
      </div>

      <div class="wr-card wr-card--score">
        <div class="wr-card__head"><span class="wr-card__title">Score de force IA</span><span class="wr-card__tag" id="wrForceTag">N/A</span></div>
        <div class="wr-score">
          <div class="wr-score__bar"><div class="wr-score__fill" id="wrScoreFill"></div></div>
          <div class="wr-score__legend"><span>Faible</span><span class="wr-score__val" id="wrScoreVal">0%</span><span>Maître</span></div>
        </div>
        <div class="wr-score__trend" id="wrScoreTrend">—</div>
      </div>

      <div class="wr-card wr-card--war">
        <div class="wr-card__head"><span class="wr-card__title">Champ de bataille</span><span class="wr-card__tag" id="wrWarTag">Idle</span></div>
        <div class="wr-war">
          <div class="wr-war__team wr-war__team--red">
            <span class="wr-war__name">Rouge</span>
            <span class="wr-war__score" id="wrRedScore">0</span>
            <div class="wr-war__hp"><div class="wr-war__hp-fill" id="wrRedHp"></div></div>
            <span class="wr-war__status" id="wrRedStatus">—</span>
          </div>
          <div class="wr-war__vs" aria-hidden="true">VS</div>
          <div class="wr-war__team wr-war__team--cyan">
            <span class="wr-war__name">Cyan</span>
            <span class="wr-war__score" id="wrCyanScore">0</span>
            <div class="wr-war__hp"><div class="wr-war__hp-fill" id="wrCyanHp"></div></div>
            <span class="wr-war__status" id="wrCyanStatus">—</span>
          </div>
        </div>
        <button type="button" class="pri wr-war__cta" id="observerLive">Lancer la guerre IA</button>
      </div>

      <div class="wr-card wr-card--autorun">
        <div class="wr-card__head"><span class="wr-card__title">Lancement automatique</span><span class="wr-card__tag" id="wrAutoTag">Off</span></div>
        <div class="wr-autorun">
          <label class="wr-toggle">
            <input type="checkbox" id="wrAutoStart">
            <span class="wr-toggle__track"><span class="wr-toggle__thumb"></span></span>
            <span class="wr-toggle__label">Démarrer à l’ouverture</span>
          </label>
          <label class="wr-toggle">
            <input type="checkbox" id="wrBgRun">
            <span class="wr-toggle__track"><span class="wr-toggle__thumb"></span></span>
            <span class="wr-toggle__label">Tourner en arrière-plan</span>
          </label>
          <div class="wr-autorun-row">
            <label>Vitesse
              <select id="wrSpeed"><option value="slow">Lente</option><option value="normal" selected>Normale</option><option value="fast">Rapide</option><option value="turbo">Turbo</option></select>
            </label>
            <label>Terrain
              <select id="wrSize"><option value="11x15" selected>Petit</option><option value="17x23">Moyen</option><option value="23x31">Grand</option></select>
            </label>
            <label>Niveau IA
              <select id="wrLevel"><option value="0">Facile</option><option value="1" selected>Normal</option><option value="2">Difficile</option></select>
            </label>
          </div>
          <div class="wr-autorun-loop">
            <label class="wr-toggle">
              <input type="checkbox" id="wrLoop" checked>
              <span class="wr-toggle__track"><span class="wr-toggle__thumb"></span></span>
              <span class="wr-toggle__label">Rejouer en boucle</span>
            </label>
            <span class="wr-autorun-info" id="wrLoopInfo">—</span>
          </div>
        </div>
      </div>

      <div class="wr-card wr-card--chart">
        <div class="wr-card__head"><span class="wr-card__title">Évolution temporelle</span><span class="wr-card__tag">60s</span></div>
        <canvas class="wr-chart__canvas" id="wrChart" aria-label="Graphique d évolution IA"></canvas>
        <div class="wr-chart__legend">
          <span class="wr-legend wr-legend--red"><span class="wr-legend__dot"></span>Rouge</span>
          <span class="wr-legend wr-legend--cyan"><span class="wr-legend__dot"></span>Cyan</span>
          <span class="wr-legend wr-legend--gold"><span class="wr-legend__dot"></span>Force</span>
          <span class="wr-legend wr-legend--violet"><span class="wr-legend__dot"></span>Coups</span>
        </div>
      </div>

      <div class="wr-card wr-card--board-log">
        <div class="wr-card__head"><span class="wr-card__title">Terrain &amp; journal</span><span class="wr-card__tag" id="wrBoardTag">Idle</span></div>
        <div class="wr-boardlog">
          <div class="wr-boardlog__board">
            <canvas id="wrMiniBoard" aria-label="Terrain live de la guerre IA"></canvas>
            <div class="wr-boardlog__overlay" id="wrBoardOverlay">En attente</div>
          </div>
          <div class="wr-boardlog__log">
            <div class="wr-log" id="observerLog" aria-live="polite"></div>
            <button type="button" id="observerClear" class="wr-card__btn">Vider le journal</button>
          </div>
        </div>
      </div>

      <div class="wr-card wr-card--train">
        <div class="wr-card__head"><span class="wr-card__title">Entraînement continu</span><span class="wr-card__tag" id="wrTrainTag">—</span></div>
        <div class="wr-train-controls">
          <label>Mode<select id="trMode"><option value="auto">Auto (onglet caché)</option><option value="on">Toujours actif</option><option value="off">Arrêté</option></select></label>
          <label>Pause après<select id="trPause"><option value="5">5 min</option><option value="15">15 min</option><option value="30">30 min</option><option value="60">1 h</option><option value="180">3 h</option></select></label>
          <label>Série cible<select id="trStreak"><option value="10">10</option><option value="50">50</option><option value="100">100</option><option value="250">250</option></select></label>
        </div>
        <div class="wr-train-status" id="trStatus" aria-live="polite"></div>
        <div class="wr-train-table" id="trTable"></div>
        <div class="wr-train-sync" id="trSync" aria-live="polite"></div>
        <div class="wr-train-actions">
          <button type="button" id="trSyncNow">Synchroniser</button>
          <button type="button" id="trReset">Reset séries</button>
        </div>
      </div>
    </div>
  </div>
`;
document.body.append(monitor);
const trainApi=()=>window.G2Train;
function renderTrain(){
  const api=trainApi(),st=api&&api.status();if(!st)return;
  const set=(id,v)=>{const e=$(id);if(e&&document.activeElement!==e)e.value=String(v)};
  set('trMode',st.mode);set('trPause',st.cfg.pauseMin);set('trStreak',st.cfg.streakLimit);
  const left=st.paused?Math.max(0,Math.ceil((st.pauseUntil-Date.now())/60000)):0;
  const statusText=(st.running?(st.paused?'En pause — reprise dans '+left+' min':'En cours'):'À l’arrêt')+' · '+st.games+' parties'+(st.incomplete?' · '+st.incomplete+' interrompues':'')+' · '+st.pauses+' pause(s)'+(st.lastPause?' · dernière série : '+st.lastPause.name+' ('+st.lastPause.streak+')':'');
  const statusEl=$('trStatus');if(statusEl)statusText!==statusEl.textContent&&(statusEl.textContent=statusText);
  const trainTag=$('wrTrainTag');if(trainTag)trainTag.textContent=st.running?(st.paused?'Pause':'Live'):'Idle';
  const sy=window.G2Sync&&window.G2Sync.status();
  const syncText=!sy?'':!sy.enabled?'Cloud non configuré : l’IA évolue sur cet appareil uniquement.':sy.note?sy.note:sy.last?'Cerveau IA synchronisé · v'+sy.version+' · il y a '+Math.max(0,Math.round((Date.now()-sy.last)/60000))+' min'+(sy.dirty?' · en attente':''):'Synchronisation en attente…';
  const syncEl=$('trSync');if(syncEl)syncText!==syncEl.textContent&&(syncEl.textContent=syncText);
  const t=$('trTable');if(t){
    t.replaceChildren();
    for(const p of st.players){
      const row=document.createElement('div');
      row.className='wr-train-row';
      const total=p.w+p.l+p.d||1;
      const winRate=Math.round(p.w/total*100);
      row.innerHTML='<span class="wr-train-row__name"></span><span class="wr-train-row__stats"></span><div class="wr-train-row__bar"><div class="wr-train-row__bar-fill"></div></div>';
      row.querySelector('.wr-train-row__name').textContent=p.name;
      row.querySelector('.wr-train-row__stats').textContent=p.w+'V · '+p.l+'D · '+p.d+'N · série '+p.streak+'/'+st.cfg.streakLimit;
      row.querySelector('.wr-train-row__bar-fill').style.width=winRate+'%';
      t.append(row);
    }
  }
}
$('trMode').onchange=()=>{trainApi()&&trainApi().setMode($('trMode').value);renderTrain()};
$('trPause').onchange=()=>{trainApi()&&trainApi().setConfig({pauseMin:+$('trPause').value})};
$('trStreak').onchange=()=>{trainApi()&&trainApi().setConfig({streakLimit:+$('trStreak').value})};
$('trSyncNow').onclick=()=>{if(window.G2Sync){window.G2Sync.now().then(renderTrain);renderTrain()}};
$('trReset').onclick=()=>{if(confirm('Remettre à zéro les séries et statistiques de l’entraînement ?')){trainApi()&&trainApi().reset();renderTrain()}};
$('observerClose').onclick=()=>{
  monitor.hidden=true;
  if(!autoCfg.bgRun){liveStop()}
  else if(live.running){logTrajectory('Guerre IA continue en arrière-plan')}
};
$('observerClear').onclick=()=>$('observerLog').replaceChildren();

function openObserver(){
  monitor.hidden=false;
  renderObserver();
  renderTrain();
  syncAutoCfgUI();
  updateAutoTag();
  if(typeof seedChart==='function')seedChart();
  if(typeof drawChart==='function')drawChart();
  drawMiniBoard();
  if(autoCfg.autoStart){
    setTimeout(()=>{
      if(monitor.hidden)return;
      if(!live.running&&(!live.s||live.over)){
        if(!live.s||live.over)liveReset();
        live.running=true;setLive('live');
        const btn=$('demoRun');if(btn)btn.textContent='Pause';
        liveLoop();
        logTrajectory('Guerre IA lancée automatiquement (autoStart)');
      }
    },300);
  }
}
const wrOpenBtn=$('wrOpen');
if(wrOpenBtn)wrOpenBtn.onclick=openObserver;

const HOLD_MS=2000;
let holdTimer=0,holdStart=0,holdRaf=0;
const holdBar=document.createElement('div');
holdBar.className='wr-hold-bar';
holdBar.setAttribute('aria-hidden','true');
const holdBarFill=document.createElement('div');
holdBarFill.className='wr-hold-bar__fill';
holdBar.append(holdBarFill);

function tickHold(ts){
  if(!holdStart){holdStart=ts}
  const progress=Math.min(1,(ts-holdStart)/HOLD_MS);
  holdBarFill.style.transform='scaleX('+progress+')';
  if(progress<1&&holdStart){holdRaf=requestAnimationFrame(tickHold)}
}
function startHold(e){
  if(e&&e.preventDefault)e.preventDefault();
  holdStart=0;
  summary.classList.add('observer-holding');
  if(!summary.contains(holdBar))summary.append(holdBar);
  cancelAnimationFrame(holdRaf);
  holdRaf=requestAnimationFrame(tickHold);
  clearTimeout(holdTimer);
  holdTimer=setTimeout(()=>{
    summary.classList.remove('observer-holding');
    holdBarFill.style.transform='scaleX(0)';
    openObserver();
  },HOLD_MS);
}
function stopHold(){
  clearTimeout(holdTimer);
  cancelAnimationFrame(holdRaf);
  holdStart=0;
  holdBarFill.style.transform='scaleX(0)';
  if(summary.contains(holdBar))summary.removeChild(holdBar);
  summary.classList.remove('observer-holding');
}
if(summary){
  summary.title='Maintenir appuyé 2 s pour ouvrir l’observatoire IA';
  summary.addEventListener('pointerdown',startHold);
  ['pointerup','pointerleave','pointercancel','blur'].forEach(ev=>summary.addEventListener(ev,stopHold));
  summary.addEventListener('contextmenu',e=>e.preventDefault());
  summary.addEventListener('touchstart',e=>{e.preventDefault();startHold()},{passive:false});
  ['touchend','touchcancel'].forEach(ev=>summary.addEventListener(ev,stopHold));
}
const trajectory=[];
const warState={moves:0,lastMoveAt:0,redScore:0,cyanScore:0,running:false};
function renderObserver(){
  const ai=window.G2Engine;if(!ai)return;
  const a=(()=>{try{return JSON.parse(localStorage.getItem('g2p.ai')||'{}')}catch(e){return {}}})();
  const games=a.games||0,sims=a.simulations||0,patterns=Object.keys(a.book||{}).length;
  setText('wrKpiGames',games);
  setText('wrKpiSims',sims);
  setText('wrKpiPatterns',patterns);
  setText('wrKpiMoves',warState.moves);
  const force=Math.min(100,Math.round((patterns/40)*40+Math.min(40,games/25)+Math.min(20,sims/50)));
  const fill=document.getElementById('wrScoreFill');
  if(fill)fill.style.width=force+'%';
  setText('wrScoreVal',force+'%');
  const tag=document.getElementById('wrForceTag');
  if(tag)tag.textContent=force<25?'Débutant':force<50?'Intermédiaire':force<75?'Avancé':force<90?'Expert':'Maître';
  const trend=document.getElementById('wrScoreTrend');
  if(trend&&trajectory.length){
    const recent=trajectory.length;
    trend.textContent=recent>5?'Tendance ↗':'Tendance →';
  }
  setText('wrRedScore',warState.redScore);
  setText('wrCyanScore',warState.cyanScore);
  const maxScore=Math.max(10,warState.redScore+warState.cyanScore);
  const redHp=document.getElementById('wrRedHp'),cyanHp=document.getElementById('wrCyanHp');
  if(redHp)redHp.style.width=Math.max(5,100-warState.redScore/maxScore*100)+'%';
  if(cyanHp)cyanHp.style.width=Math.max(5,100-warState.cyanScore/maxScore*100)+'%';
  setText('wrRedStatus',warState.running?'En combat':'Standby');
  setText('wrCyanStatus',warState.running?'En combat':'Standby');
  const log=document.getElementById('observerLog');
  if(log){
    const frag=document.createDocumentFragment();
    trajectory.slice(-30).reverse().forEach(t=>{
      const row=document.createElement('div');row.className='wr-log__line';
      const m=t.match(/^(\S+)\s+—\s+(.+)$/);
      if(m){
        const time=document.createElement('span');time.className='wr-log__time';time.textContent=m[1];
        const body=document.createElement('span');body.className='wr-log__body';body.textContent=m[2];
        row.append(time,body);
      }else{row.textContent=t}
      frag.append(row);
    });
    log.replaceChildren(frag);
  }
}
function setText(id,v){const e=document.getElementById(id);if(e&&String(e.textContent)!==String(v))e.textContent=v}
function setLive(state){
  const live=document.getElementById('wrLive');
  if(!live)return;
  live.dataset.state=state;
  const label=live.querySelector('.wr-live__label');
  if(label)label.textContent=state==='live'?'Live':state==='paused'?'Pause':'Standby';
  const warTag=document.getElementById('wrWarTag');
  if(warTag)warTag.textContent=state==='live'?'Live':state==='paused'?'Pause':'Idle';
  warState.running=state==='live';
}
function logTrajectory(text){
  trajectory.push(new Date().toLocaleTimeString('fr-FR')+' — '+text);
  if(trajectory.length>120)trajectory.shift();
  if(!monitor.hidden)renderObserver();
}

/* Observation passive : journalise le choix moteur sans modifier sa décision tactique. */
const E=window.G2Engine;
if(E&&typeof E.aiMove==='function'&&!E.__observing){
  const base=E.aiMove;
  E.aiMove=function(state,rng,params){
    const move=base(state,rng,params);
    if(move)logTrajectory('Coup retenu : '+String.fromCharCode(65+move[0])+(move[1]+1)+' · niveau '+((params&&params.lvl!=null)?params.lvl:1));
    return move;
  };
  E.__observing=true;
}
/* Simulation IA contre IA conservée uniquement dans l'observatoire caché, jamais dans le menu ☰. */
const SIZES={'11x15':[11,15],'17x23':[17,23],'23x31':[23,31]},SPEEDS={slow:900,normal:420,fast:120,turbo:50},TAU=Math.PI*2,LIVE_NAMES=['Rouge','Cyan'];
const demo=document.createElement('section');demo.id='aiLiveDemo';demo.className='ai-observer ai-live-demo';demo.hidden=true;
demo.setAttribute('role','dialog');demo.setAttribute('aria-label','Simulation IA en direct');
demo.innerHTML='<header><div><small>SIMULATION EN DIRECT</small><h2>Terrain d’exercice IA</h2></div><button type="button" id="demoClose">Fermer</button></header>'
 +'<div class="live-opts"><label>Terrain<select id="demoSize"><option value="11x15">Petit (11 × 15)</option><option value="17x23">Moyen (17 × 23)</option><option value="23x31">Grand (23 × 31)</option></select></label>'
 +'<label>Niveau<select id="demoLevel"><option value="0">Facile</option><option value="1" selected>Normal</option><option value="2">Difficile</option></select></label>'
 +'<label>Vitesse<select id="demoSpeed"><option value="slow">Lente</option><option value="normal" selected>Normale</option><option value="fast">Rapide</option></select></label></div>'
 +'<canvas id="demoBoard" aria-label="Terrain de simulation IA contre IA"></canvas>'
 +'<p id="demoStatus" class="live-status" aria-live="polite">Appuyez sur « Lancer la simulation » pour regarder l’IA s’exercer.</p>'
 +'<p id="demoThink" class="live-think" aria-live="off"></p>'
 +'<div class="demo-actions"><button type="button" class="pri" id="demoRun">Lancer la simulation</button><button type="button" id="demoStep">Un coup</button><button type="button" id="demoReset">Réinitialiser</button></div>';
document.body.append(demo);
const live={s:null,moves:0,running:false,timer:0,busy:false,last:null,flash:null,flashTeam:0,over:false};
const autoCfg={autoStart:false,bgRun:false,loop:true,speed:'normal',size:'11x15',level:1,gamesPlayed:0};
try{const saved=JSON.parse(localStorage.getItem('g2p.wrAuto')||'null');if(saved)Object.assign(autoCfg,saved)}catch(e){}
function saveAutoCfg(){try{localStorage.setItem('g2p.wrAuto',JSON.stringify(autoCfg))}catch(e){}}
function syncAutoCfgUI(){
  const map={wrAutoStart:'autoStart',wrBgRun:'bgRun',wrLoop:'loop',wrSpeed:'speed',wrSize:'size',wrLevel:'level'};
  for(const [id,key] of Object.entries(map)){
    const el=document.getElementById(id);if(!el)continue;
    if(el.type==='checkbox')el.checked=!!autoCfg[key];else el.value=autoCfg[key];
  }
}
function currentSpeed(){const el=document.getElementById('wrSpeed');return el?el.value:autoCfg.speed}
function currentSize(){const el=document.getElementById('wrSize');return el?el.value:autoCfg.size}
function currentLevel(){const el=document.getElementById('wrLevel');return el?+el.value:autoCfg.level}
function updateAutoTag(){
  const tag=document.getElementById('wrAutoTag');if(!tag)return;
  const any=autoCfg.autoStart||autoCfg.bgRun;
  tag.textContent=autoCfg.bgRun?'BG':autoCfg.autoStart?'Auto':'Off';
  tag.dataset.state=any?'on':'off';
}
const readAI=()=>{try{const a=JSON.parse(localStorage.getItem('g2p.ai')||'null');return a&&a.w&&a.book?a:{}}catch(e){return {}}};
const aiParams=()=>{const a=readAI();return{w:a.w,book:a.book,lvl:currentLevel()}};
function liveReset(){
  if(!E)return;
  const [w,h]=SIZES[currentSize()]||SIZES['11x15'];
  live.s=E.create(w,h,2,false);live.moves=0;live.last=null;live.flash=null;live.over=false;
  warState.moves=0;warState.redScore=0;warState.cyanScore=0;
  const demoThinkEl=$('demoThink');if(demoThinkEl)demoThinkEl.textContent='';
  liveStatus('Terrain '+w+' × '+h+' prêt. Rouge commence.');
  liveDraw();drawMiniBoard();
  if(!monitor.hidden)renderObserver();
}
function liveStatus(text){const el=$('demoStatus');if(el)el.textContent=text}
function liveScore(){const s=live.s;return LIVE_NAMES[0]+' '+s.sc[0]+' — '+LIVE_NAMES[1]+' '+s.sc[1]}
function liveFinish(){
  live.over=true;liveStop();const s=live.s,d=s.sc[0]-s.sc[1];
  warState.redScore=s.sc[0];warState.cyanScore=s.sc[1];
  setLive('paused');
  autoCfg.gamesPlayed++;
  saveAutoCfg();
  const loopInfo=document.getElementById('wrLoopInfo');if(loopInfo)loopInfo.textContent=autoCfg.gamesPlayed+' partie(s) jouées';
  liveStatus('Terminé après '+live.moves+' coups · '+liveScore()+' · '+(d===0?'égalité':LIVE_NAMES[d>0?0:1]+' gagne')+'.');
  const demoRunBtn=$('demoRun');if(demoRunBtn)demoRunBtn.textContent='Relancer';
  liveDraw();drawMiniBoard();
  if(!monitor.hidden)renderObserver();
  logTrajectory('Partie terminée : '+liveScore()+' · '+(d===0?'égalité':LIVE_NAMES[d>0?0:1]+' gagne'));
  if(autoCfg.loop&&monitor&&!monitor.hidden){
    setTimeout(()=>{if(!monitor.hidden&&autoCfg.loop){liveReset();live.running=true;setLive('live');liveLoop();}},800);
  }
}
function liveStep(){
  if(!E||live.busy)return;
  if(!live.s||live.over)liveReset();
  const s=live.s;
  if(s.free<=0){liveFinish();return}
  live.busy=true;
  try{
    const mover=s.cur,m=E.aiMove(s,E.rng((Date.now()+live.moves*7919)|0),aiParams());
    if(!m||!E.apply(s,m)){liveFinish();return}
    live.moves++;live.last=m;live.flash=s.cap.slice();live.flashTeam=s.capT;
    warState.moves=live.moves;warState.redScore=s.sc[0];warState.cyanScore=s.sc[1];
    const think=trajectory.length?trajectory[trajectory.length-1].replace(/^\S+ — /,''):'';
    const demoThinkEl=$('demoThink');if(demoThinkEl)demoThinkEl.textContent=think;
    liveStatus('Coup '+live.moves+' · '+liveScore()+(s.bonus?' · capture, '+LIVE_NAMES[mover]+' rejoue':' · au tour de '+LIVE_NAMES[s.cur]));
    liveDraw();drawMiniBoard();
    if(!monitor.hidden)renderObserver();
    if(s.free<=0)liveFinish();
  }catch(e){console.warn('Simulation interrompue',e);liveStop()}
  finally{live.busy=false}
}
function liveStop(){live.running=false;clearTimeout(live.timer);setLive('paused');const btn=$('demoRun');if(btn)btn.textContent=live.over?'Relancer':live.moves?'Reprendre':'Lancer la simulation'}
function liveLoop(){
  if(!live.running)return;
  liveStep();
  if(live.running)live.timer=setTimeout(liveLoop,SPEEDS[currentSpeed()]||SPEEDS.normal);
}
function drawMiniBoard(){
  const c=document.getElementById('wrMiniBoard');if(!c)return;
  const s=live.s;
  const css=getComputedStyle(document.documentElement),v=k=>css.getPropertyValue(k).trim();
  const container=c.parentElement;if(!container)return;
  const avail=container.clientWidth-16||240;
  const cw=Math.max(180,Math.min(avail,360));
  const ratio=s?(s.w+1)/(s.h+1):11/15;
  const ch=cw/ratio;
  const r=window.devicePixelRatio||1;
  const pw=Math.round(cw*r),ph=Math.round(ch*r);
  if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph}
  c.style.width=cw+'px';c.style.height=ch+'px';
  const x=c.getContext('2d');x.setTransform(r,0,0,r,0,0);x.clearRect(0,0,cw,ch);
  const overlay=document.getElementById('wrBoardOverlay');
  if(!s){if(overlay){overlay.textContent='En attente';overlay.hidden=false}return}
  if(overlay)overlay.hidden=true;
  const cs=cw/(s.w+1);
  const P=(a,b)=>[(a+1)*cs,(b+1)*cs],team=t=>v('--c'+t)||['#ff2a6d','#05d9e8'][t];
  x.fillStyle=v('--paper')||'#050410';x.fillRect(0,0,cw,ch);
  x.strokeStyle=v('--line')||'#2a2762';x.lineWidth=1;x.beginPath();
  for(let i=1;i<=s.w;i++){x.moveTo(i*cs,0);x.lineTo(i*cs,ch)}
  for(let j=1;j<=s.h;j++){x.moveTo(0,j*cs);x.lineTo(cw,j*cs)}
  x.stroke();
  const R=cs*.3;
  for(let b=0;b<s.h;b++)for(let a=0;a<s.w;a++){
    const p=s.o[b][a],[px,py]=P(a,b);
    if(!p)continue;
    const dead=s.d[b][a],cc=team(p-1);
    x.globalAlpha=dead?.4:1;x.fillStyle=cc;x.shadowColor=cc;x.shadowBlur=dead?0:cs*.7;
    x.beginPath();x.arc(px,py,R,0,TAU);x.fill();x.shadowBlur=0;
    if(!dead){x.fillStyle='rgba(255,255,255,.7)';x.beginPath();x.arc(px,py,R*.35,0,TAU);x.fill()}
    x.globalAlpha=1;
  }
  if(live.flash&&live.flash.length){
    x.strokeStyle=team(live.flashTeam);x.lineWidth=2;
    live.flash.forEach(([a,b])=>{const [px,py]=P(a,b);x.beginPath();x.arc(px,py,R+cs*.28,0,TAU);x.stroke()});
  }
  if(live.last){const [px,py]=P(live.last[0],live.last[1]);x.strokeStyle=v('--tx')||'#e9e7ff';x.lineWidth=1.5;x.beginPath();x.arc(px,py,R+3,0,TAU);x.stroke()}
}
function liveDraw(){
  const s=live.s,c=$('demoBoard');if(!s||!c||demo.hidden)return;
  const css=getComputedStyle(document.documentElement),v=k=>css.getPropertyValue(k).trim();
  const avail=c.parentElement.clientWidth-40||320,cw=Math.max(200,Math.min(avail,innerHeight*.5*(s.w+1)/(s.h+1))),cs=cw/(s.w+1),ch=cs*(s.h+1),r=window.devicePixelRatio||1;
  const pw=Math.round(cw*r),ph=Math.round(ch*r);
  if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph}
  c.style.width=cw+'px';c.style.height=ch+'px';
  const x=c.getContext('2d');x.setTransform(r,0,0,r,0,0);x.clearRect(0,0,cw,ch);
  const P=(a,b)=>[(a+1)*cs,(b+1)*cs],team=t=>v('--c'+t);
  x.fillStyle=v('--paper');x.fillRect(0,0,cw,ch);
  x.strokeStyle=v('--line');x.lineWidth=1;x.beginPath();
  for(let i=1;i<=s.w;i++){x.moveTo(i*cs,0);x.lineTo(i*cs,ch)}
  for(let j=1;j<=s.h;j++){x.moveTo(0,j*cs);x.lineTo(cw,j*cs)}
  x.stroke();
  x.lineCap='round';x.lineWidth=cs*.13;
  for(const {t,c:zone} of s.loops){ /* territoires fermés par une capture */
    x.fillStyle=team(t);x.globalAlpha=.16;zone.cells.forEach(([a,b])=>x.fillRect(a*cs+cs/2,b*cs+cs/2,cs,cs));x.globalAlpha=1;
    x.strokeStyle=team(t);x.shadowColor=team(t);x.shadowBlur=cs*.45;
    const alive=k=>{const a=k%s.w,b=(k-a)/s.w;return s.o[b][a]===t+1&&!s.d[b][a]};
    for(const k of zone.bd){
      if(!alive(k))continue;const a=k%s.w,b=(k-a)/s.w;
      for(const [dx,dy] of [[1,0],[0,1],[1,1],[-1,1]]){
        const u=a+dx,w2=b+dy;if(u<0||w2<0||u>=s.w||w2>=s.h)continue;
        const k2=w2*s.w+u;if(!zone.bd.has(k2)||!alive(k2))continue;
        if(dx&&dy&&(zone.bd.has(b*s.w+u)||zone.bd.has(w2*s.w+a)))continue;
        const [x1,y1]=P(a,b),[x2,y2]=P(u,w2);x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke();
      }
    }
    x.shadowBlur=0;
  }
  const R=cs*.3;
  for(let b=0;b<s.h;b++)for(let a=0;a<s.w;a++){
    const p=s.o[b][a],[px,py]=P(a,b);
    if(!p){if(s.blk[b][a]){x.strokeStyle=v('--tx');x.globalAlpha=.4;x.lineWidth=1;x.strokeRect(px-cs*.13,py-cs*.13,cs*.26,cs*.26);x.globalAlpha=1}continue}
    const dead=s.d[b][a],cc=team(p-1);
    x.globalAlpha=dead?.4:1;x.fillStyle=cc;x.shadowColor=cc;x.shadowBlur=dead?0:cs*.7;x.beginPath();x.arc(px,py,R,0,TAU);x.fill();x.shadowBlur=0;
    if(!dead){x.fillStyle='rgba(255,255,255,.7)';x.beginPath();x.arc(px,py,R*.35,0,TAU);x.fill()}
    else{x.strokeStyle=v('--tx');x.lineWidth=1.5;x.beginPath();x.moveTo(px-R,py-R);x.lineTo(px+R,py+R);x.moveTo(px+R,py-R);x.lineTo(px-R,py+R);x.stroke()}
    x.globalAlpha=1;
  }
  if(live.flash&&live.flash.length){ /* points capturés par le dernier coup */
    x.strokeStyle=team(live.flashTeam);x.lineWidth=2;
    live.flash.forEach(([a,b])=>{const [px,py]=P(a,b);x.beginPath();x.arc(px,py,R+cs*.28,0,TAU);x.stroke()});
  }
  if(live.last){const [px,py]=P(live.last[0],live.last[1]);x.strokeStyle=v('--tx');x.lineWidth=1.5;x.beginPath();x.arc(px,py,R+3,0,TAU);x.stroke()}
}
function openLive(){
  if(!E)return;
  monitor.hidden=true;if(panel)panel.hidden=true;
  const gt=$('gameDockToggle');if(gt){gt.setAttribute('aria-expanded','false');gt.textContent='☰ Menu'}
  demo.hidden=false;
  demo.style.inset='0';demo.style.transform='none';demo.style.width='100vw';demo.style.height='100dvh';demo.style.maxHeight='none';demo.style.maxWidth='none';demo.style.borderRadius='0';
  if(!live.s){const cur=$('size')&&$('size').value;if(SIZES[cur])$('demoSize').value=cur;liveReset()}else liveDraw();
}
function closeLive(){liveStop();demo.hidden=true;['inset','transform','width','height','max-height','max-width','border-radius'].forEach(k=>demo.style.removeProperty(k))}
$('demoClose').onclick=closeLive;
$('aiLiveLaunch').onclick=openLive;
$('demoStep').onclick=()=>{liveStop();liveStep()};
$('demoRun').onclick=()=>{
  if(live.running){liveStop();return}
  if(live.over||!live.s)liveReset();
  live.running=true;setLive('live');$('demoRun').textContent='Pause';liveLoop();
};
$('demoReset').onclick=()=>{liveStop();liveReset();$('demoRun').textContent='Lancer la simulation'};
$('demoSize').onchange=()=>{liveStop();liveReset()};
$('observerLive').onclick=()=>{
  if(!E)return;
  if(live.over||!live.s||!live.running){
    if(live.over||!live.s)liveReset();
    live.running=true;setLive('live');
    const btn=$('demoRun');if(btn)btn.textContent='Pause';
    liveLoop();
  }
  logTrajectory('Guerre IA lancée par l’opérateur');
};
function bindAutoControls(){
  const onStart=document.getElementById('wrAutoStart');
  if(onStart)onStart.onchange=()=>{autoCfg.autoStart=onStart.checked;saveAutoCfg();updateAutoTag()};
  const bg=document.getElementById('wrBgRun');
  if(bg)bg.onchange=()=>{autoCfg.bgRun=bg.checked;saveAutoCfg();updateAutoTag()};
  const lp=document.getElementById('wrLoop');
  if(lp)lp.onchange=()=>{autoCfg.loop=lp.checked;saveAutoCfg()};
  const sp=document.getElementById('wrSpeed');
  if(sp)sp.onchange=()=>{autoCfg.speed=sp.value;saveAutoCfg()};
  const sz=document.getElementById('wrSize');
  if(sz)sz.onchange=()=>{autoCfg.size=sz.value;saveAutoCfg();if(live.s){liveStop();liveReset()}};
  const lv=document.getElementById('wrLevel');
  if(lv)lv.onchange=()=>{autoCfg.level=+lv.value;saveAutoCfg()};
}
bindAutoControls();
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!demo.hidden)closeLive()});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&live.running&&!autoCfg.bgRun)liveStop();
});
addEventListener('resize',()=>{if(!demo.hidden)liveDraw();drawChart();drawMiniBoard()});
setInterval(()=>{if(!monitor.hidden){renderObserver();renderTrain();drawMiniBoard()}},2000);

const chartHistory={red:[],cyan:[],force:[],moves:[]};
const CHART_MAX=60;
function pushChartPoint(){
  chartHistory.red.push(warState.redScore);
  chartHistory.cyan.push(warState.cyanScore);
  const ai=(()=>{try{return JSON.parse(localStorage.getItem('g2p.ai')||'{}')}catch(e){return {}}})();
  const force=Math.min(100,Math.round((Object.keys(ai.book||{}).length/40)*40+Math.min(40,(ai.games||0)/25)+Math.min(20,(ai.simulations||0)/50)));
  chartHistory.force.push(force);
  chartHistory.moves.push(warState.moves);
  if(chartHistory.red.length>CHART_MAX){chartHistory.red.shift();chartHistory.cyan.shift();chartHistory.force.shift();chartHistory.moves.shift()}
}
function drawChart(){
  const c=document.getElementById('wrChart');if(!c||monitor.hidden)return;
  const r=window.devicePixelRatio||1;
  const w=c.parentElement.clientWidth-24||280,h=140;
  const pw=Math.round(w*r),ph=Math.round(h*r);
  if(c.width!==pw||c.height!==ph){c.width=pw;c.height=ph}
  c.style.width=w+'px';c.style.height=h+'px';
  const ctx=c.getContext('2d');ctx.setTransform(r,0,0,r,0,0);ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(255,255,255,.05)';ctx.lineWidth=1;ctx.beginPath();
  for(let i=0;i<=4;i++){const y=i*h/4;ctx.moveTo(0,y);ctx.lineTo(w,y)}
  for(let i=0;i<=6;i++){const x=i*w/6;ctx.moveTo(x,0);ctx.lineTo(x,h)}
  ctx.stroke();
  const series=[
    {data:chartHistory.red,color:'#ff2a6d',label:'Rouge'},
    {data:chartHistory.cyan,color:'#05d9e8',label:'Cyan'},
    {data:chartHistory.force,color:'#ffb800',label:'Force'},
    {data:chartHistory.moves,color:'#7c5cff',label:'Coups'}
  ];
  const maxVal=Math.max(10,...chartHistory.red,...chartHistory.cyan,...chartHistory.force,...chartHistory.moves);
  for(const s of series){
    if(s.data.length<2)continue;
    ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.shadowColor=s.color;ctx.shadowBlur=8;ctx.beginPath();
    s.data.forEach((v,i)=>{
      const x=i*w/(CHART_MAX-1);
      const y=h-(v/maxVal)*h;
      if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    });
    ctx.stroke();ctx.shadowBlur=0;
    const last=s.data[s.data.length-1];
    const lx=(s.data.length-1)*w/(CHART_MAX-1);
    const ly=h-(last/maxVal)*h;
    ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(lx,ly,3,0,Math.PI*2);ctx.fill();
  }
}
function seedChart(){
  if(chartHistory.red.length===0){
    for(let i=0;i<2;i++){pushChartPoint()}
  }
}
seedChart();
setInterval(()=>{if(!monitor.hidden){pushChartPoint();drawChart()}},1000);


/* Thèmes supplémentaires, avec variables de rendu cohérentes pour le moteur canvas. */
const themes={
  aurora:{paper:'#07131b',panel:'rgba(10,35,42,.82)',line:'#24505b',c0:'#ff6b9a',c1:'#5cf2d6',c2:'#b7ff72',c3:'#ffd166',tx:'#e8fff9',mut:'#91bdb5',bd:'#36727b',neon:'#5cf2d6',hot:'#ff6b9a'},
  royal:{paper:'#100b20',panel:'rgba(31,20,59,.86)',line:'#49366d',c0:'#ff6fae',c1:'#8b7cff',c2:'#6ee7b7',c3:'#fbbf24',tx:'#f4edff',mut:'#b4a6d5',bd:'#69519a',neon:'#a78bfa',hot:'#fb7185'},
  matrix:{paper:'#030b08',panel:'rgba(4,24,15,.88)',line:'#164b31',c0:'#ff5470',c1:'#00ff9c',c2:'#b6ff00',c3:'#f4e04d',tx:'#e1ffed',mut:'#80b99a',bd:'#23754a',neon:'#00ff9c',hot:'#ff5470'},
  sunset:{paper:'#1b0c17',panel:'rgba(48,17,38,.86)',line:'#65314e',c0:'#ff668c',c1:'#ffbd69',c2:'#a3e7a1',c3:'#ffe66d',tx:'#fff0e8',mut:'#d3a4b6',bd:'#884765',neon:'#ffbd69',hot:'#ff668c'}
};
function addThemes(){
  const select=$('theme');if(!select)return;
  Object.entries({aurora:'Aurore boréale',royal:'Royauté',matrix:'Matrix',sunset:'Coucher de soleil'}).forEach(([id,name])=>{
    if(select.querySelector('option[value="'+id+'"]'))return;const o=document.createElement('option');o.value=id;o.textContent=name;select.append(o);
  });
  const apply=id=>{const t=themes[id];if(!t)return;document.documentElement.dataset.theme=id;for(const [k,v] of Object.entries(t))document.documentElement.style.setProperty('--'+k,v);try{localStorage.setItem('g2p.theme',id)}catch(e){}};
  const original=select.onchange;select.addEventListener('change',()=>apply(select.value));
  const current=(()=>{try{return localStorage.getItem('g2p.theme')||''}catch(e){return''}})();if(themes[current])apply(current);
}
addThemes();
})();
