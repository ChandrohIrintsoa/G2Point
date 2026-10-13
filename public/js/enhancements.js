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
if(launch)launch.hidden=true;
const monitor=document.createElement('section');monitor.id='aiObserver';monitor.className='ai-observer';monitor.hidden=true;monitor.innerHTML='<header><div><small>APPRENTISSAGE AUTONOME</small><h2>Observatoire IA</h2></div><button type="button" id="observerClose">Fermer</button></header><p>L’IA observe les coups, les menaces et les trajectoires possibles autour de chaque point.</p><div class="observer-stats" id="observerStats"></div><button type="button" class="pri" id="observerLive">Demander une simulation en direct</button><div class="observer-log" id="observerLog" aria-live="polite">En attente d’une partie…</div><button type="button" id="observerClear">Effacer le journal visuel</button>';
document.body.append(monitor);
$('observerClose').onclick=()=>monitor.hidden=true;
$('observerClear').onclick=()=>$('observerLog').replaceChildren();
let holdTimer=0,holdStarted=0;
if(summary){
  summary.title='Maintenir appuyé pendant 15 secondes pour ouvrir l’observatoire IA';
  const start=()=>{holdStarted=Date.now();clearTimeout(holdTimer);summary.classList.add('observer-holding');holdTimer=setTimeout(()=>{monitor.hidden=false;summary.classList.remove('observer-holding');renderObserver();},15000)};
  const stop=()=>{clearTimeout(holdTimer);summary.classList.remove('observer-holding')};
  summary.addEventListener('pointerdown',start);['pointerup','pointerleave','pointercancel','blur'].forEach(ev=>summary.addEventListener(ev,stop));
  summary.addEventListener('contextmenu',e=>e.preventDefault());
}
const trajectory=[];
function renderObserver(){
  const ai=window.G2Engine,stats=$('observerStats');if(!stats)return;
  const a=(()=>{try{return JSON.parse(localStorage.getItem('g2p.ai')||'{}')}catch(e){return {}}})();
  stats.textContent='Parties observées : '+(a.games||0)+' · Simulations : '+(a.simulations||0)+' · Motifs : '+Object.keys(a.book||{}).length;
  const log=$('observerLog');log.replaceChildren();
  trajectory.slice(-24).reverse().forEach(t=>{const row=document.createElement('div');row.textContent=t;log.append(row)});
}
function logTrajectory(text){trajectory.push(new Date().toLocaleTimeString('fr-FR')+' — '+text);if(trajectory.length>120)trajectory.shift();if(!monitor.hidden)renderObserver()}

/* Analyse multi-directionnelle et anticipation de combinaisons.
   Pour chaque candidat, l'IA évalue les 8 directions (orthogonales + diagonales),
   puis simule ses suites légales pour estimer les menaces de capture/défense. */
const E=window.G2Engine;
if(E&&typeof E.aiMove==='function'&&!E.__observing){
  const base=E.aiMove;
  const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const scanRadius=4,MAX_CANDIDATES=120,REPLY_TOP=16;
  const collect=(s)=>{
    const found=new Map();
    for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)if(s.o[y][x]){
      for(const [dx,dy] of DIRS)for(let k=1;k<=scanRadius;k++){
        const a=x+dx*k,b=y+dy*k;
        if(E.legal(s,a,b))found.set(b*s.w+a,[a,b]);
      }
    }
    return [...found.values()];
  };
  const scorePosition=(before,after,me,opp,move)=>{
    const own=after.sc[me]-before.sc[me],lost=after.sc[opp]-before.sc[opp];
    let friendly=0,enemy=0,open=0;
    for(const [dx,dy] of DIRS){
      const x=move[0]+dx,y=move[1]+dy;
      if(x<0||y<0||x>=before.w||y>=before.h)continue;
      const p=before.o[y][x];
      if(p===me+1)friendly++;else if(p===opp+1)enemy++;else if(!p&&!before.blk[y][x])open++;
    }
    return own*30-lost*34+friendly*1.15+enemy*.9+open*.12;
  };
  E.aiMove=function(state,rng,params){
    const chosen=base(state,rng,params);if(!chosen)return chosen;
    if(!state.o.some(row=>row.some(Boolean)))return chosen;
    const me=E.tmOf(state.tm,state.cur),opp=1-me;
    const pool=collect(state);
    if(!pool.length)return chosen;
    /* Scanner tous les points adverses et alliés dans un rayon de quatre intersections. */
    const ranked=[];
    for(const move of pool){
      const next=E.clone(state);if(!E.apply(next,move))continue;
      let value=scorePosition(state,next,me,opp,move);
      ranked.push({move,next,value});
    }
    ranked.sort((a,b)=>b.value-a.value);
    /* Examiner les suites offensives et défensives, puis anticiper la meilleure riposte adverse. */
    const shortlist=ranked.slice(0,MAX_CANDIDATES);
    for(const item of shortlist.slice(0,REPLY_TOP)){
      const s=item.next;
      let follow=0,threat=0;
      if(!s.bonus){
        const continuation=base(s,()=>0.23,{...(params||{}),lvl:1});
        if(continuation){const c=E.clone(s);if(E.apply(c,continuation))follow=Math.max(0,c.sc[me]-s.sc[me]);}
        const reply=base(s,()=>0.37,{...(params||{}),lvl:2});
        if(reply){const c=E.clone(s);if(E.apply(c,reply))threat=Math.max(0,c.sc[opp]-s.sc[opp]);}
      }
      item.value+=follow*5.5-threat*7.5;
      if(item.move[0]===chosen[0]&&item.move[1]===chosen[1])item.value+=.2;
    }
    shortlist.sort((a,b)=>b.value-a.value);
    const best=shortlist[0]||{move:chosen,value:0};
    logTrajectory('Scan rayon 4 : '+pool.length+' cases · '+shortlist.length+' suites étudiées · attaque '+(best.next.sc[me]-state.sc[me])+' · menace adverse anticipée');
    return best.move;
  };
  E.__observing=true;
}
/* Simulation IA en direct, sur demande : IA contre IA sur un vrai terrain (mêmes couleurs, territoires et points capturés
   que dans une partie). Accessible depuis le menu caché (☰ Menu) et depuis l'observatoire. Lecture seule : ne modifie pas la mémoire de l'IA. */
const SIZES={'11x15':[11,15],'17x23':[17,23],'23x31':[23,31]},SPEEDS={slow:900,normal:420,fast:120},TAU=Math.PI*2,LIVE_NAMES=['Rouge','Cyan'];
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
const readAI=()=>{try{const a=JSON.parse(localStorage.getItem('g2p.ai')||'null');return a&&a.w&&a.book?a:{}}catch(e){return {}}};
const aiParams=()=>{const a=readAI();return{w:a.w,book:a.book,lvl:+$('demoLevel').value}}; /* mémoire apprise de l'IA, en lecture seule */
function liveReset(){
  if(!E)return;
  const [w,h]=SIZES[$('demoSize').value]||SIZES['11x15'];
  live.s=E.create(w,h,2,false);live.moves=0;live.last=null;live.flash=null;live.over=false;
  $('demoThink').textContent='';liveStatus('Terrain '+w+' × '+h+' prêt. Rouge commence.');liveDraw();
}
function liveStatus(text){$('demoStatus').textContent=text}
function liveScore(){const s=live.s;return LIVE_NAMES[0]+' '+s.sc[0]+' — '+LIVE_NAMES[1]+' '+s.sc[1]}
function liveFinish(){
  live.over=true;liveStop();const s=live.s,d=s.sc[0]-s.sc[1];
  liveStatus('Terminé après '+live.moves+' coups · '+liveScore()+' · '+(d===0?'égalité':LIVE_NAMES[d>0?0:1]+' gagne')+'.');
  $('demoRun').textContent='Relancer';liveDraw();
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
    const think=trajectory.length?trajectory[trajectory.length-1].replace(/^\S+ — /,''):'';
    $('demoThink').textContent=think;
    liveStatus('Coup '+live.moves+' · '+liveScore()+(s.bonus?' · capture, '+LIVE_NAMES[mover]+' rejoue':' · au tour de '+LIVE_NAMES[s.cur]));
    liveDraw();
    if(s.free<=0)liveFinish();
  }catch(e){console.warn('Simulation interrompue',e);liveStop()}
  finally{live.busy=false}
}
function liveStop(){live.running=false;clearTimeout(live.timer);$('demoRun').textContent=live.over?'Relancer':live.moves?'Reprendre':'Lancer la simulation'}
function liveLoop(){
  if(!live.running)return;
  liveStep();
  if(live.running)live.timer=setTimeout(liveLoop,SPEEDS[$('demoSpeed').value]||SPEEDS.normal); /* le coup suivant n'est planifié qu'une fois le précédent terminé */
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
  if(!live.s){const cur=$('size')&&$('size').value;if(SIZES[cur])$('demoSize').value=cur;liveReset()}else liveDraw();
}
function closeLive(){liveStop();demo.hidden=true}
$('demoClose').onclick=closeLive;
$('demoStep').onclick=()=>{liveStop();liveStep()};
$('demoRun').onclick=()=>{
  if(live.running){liveStop();return}
  if(live.over||!live.s)liveReset();
  live.running=true;$('demoRun').textContent='Pause';liveLoop();
};
$('demoReset').onclick=()=>{liveStop();liveReset();$('demoRun').textContent='Lancer la simulation'};
$('demoSize').onchange=()=>{liveStop();liveReset()};
$('observerLive').onclick=openLive;
const dockDemo=document.createElement('button');dockDemo.type='button';dockDemo.id='dockLive';dockDemo.textContent='Simulation IA en direct';dockDemo.onclick=openLive;panel?.append(dockDemo);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!demo.hidden)closeLive()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&live.running)liveStop()}); /* pas de calcul en arrière-plan */
addEventListener('resize',()=>{if(!demo.hidden)liveDraw()});
setInterval(()=>{if(!monitor.hidden)renderObserver()},5000);


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
