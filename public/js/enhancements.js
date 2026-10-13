/* G2Point — améliorations d'interface et observation autonome de l'IA */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const style=document.createElement('link');style.rel='stylesheet';style.href='css/enhancements.css';document.head.append(style);

/* Menu flottant : déplacement tactile/souris et repli indépendant. */
const dock=$('gameDock'),toggle=$('gameDockToggle'),panel=$('gameDockPanel');
if(dock&&toggle&&panel){
  let drag=null,moved=false;
  const saved=(()=>{try{return JSON.parse(localStorage.getItem('g2p.dock')||'null')}catch(e){return null}})();
  if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y)){dock.style.left=saved.x+'px';dock.style.top=saved.y+'px';dock.style.right='auto';dock.style.bottom='auto'}
  toggle.addEventListener('pointerdown',e=>{if(e.button!==0)return;const r=dock.getBoundingClientRect();drag={x:e.clientX,y:e.clientY,l:r.left,t:r.top};moved=false;toggle.setPointerCapture(e.pointerId)});
  toggle.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>5)moved=true;if(moved){dock.style.left=Math.max(0,Math.min(innerWidth-dock.offsetWidth,drag.l+dx))+'px';dock.style.top=Math.max(0,Math.min(innerHeight-dock.offsetHeight,drag.t+dy))+'px';dock.style.right='auto';dock.style.bottom='auto'}});
  toggle.addEventListener('pointerup',()=>{if(moved){const r=dock.getBoundingClientRect();try{localStorage.setItem('g2p.dock',JSON.stringify({x:r.left,y:r.top}))}catch(e){} }drag=null;});
  toggle.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopImmediatePropagation();moved=false}},true);
}

/* Fin de match : le plateau sort du fullscreen et laisse apparaître les résultats. */
let exitDone=false;
function leaveFullscreenOnResult(){
  const end=$('end'),msg=$('msg'),board=$('cvw');
  const text=(msg?.textContent||'').toLowerCase();
  const finished=!!end?.hidden&&/(gagne|égalité|abandon|réussi)/i.test(text);
  if(!finished){exitDone=false;return}
  if(exitDone)return;exitDone=true;
  if(board?.classList.contains('board-fullscreen'))board.classList.remove('board-fullscreen');
  if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});
  setTimeout(()=>{if($('win')&&$('win').hidden&&typeof window.showWin==='function')window.showWin()},80);
}
setInterval(leaveFullscreenOnResult,250);

/* Réactions : panneau repliable, ancré en bas à droite en mode fullscreen. */
const reactions=$('quickReactions'),reactionToggle=$('toggleReactions');
if(reactions&&reactionToggle){
  reactionToggle.setAttribute('aria-expanded','true');
  reactionToggle.addEventListener('click',()=>{const collapsed=reactions.classList.toggle('collapsed');reactionToggle.setAttribute('aria-expanded',String(!collapsed));reactionToggle.textContent=collapsed?'Réactions +':'Réactions −'});
}

/* Laboratoire manuel retiré : accès au moniteur d'observation par appui long de 15 s. */
const lab=$('aiLab'),launch=$('aiLabLaunch'),summary=$('progSummary');
if(lab)lab.remove();
if(launch)launch.remove();
const monitor=document.createElement('section');monitor.id='aiObserver';monitor.className='ai-observer';monitor.hidden=true;monitor.innerHTML='<header><div><small>APPRENTISSAGE AUTONOME</small><h2>Observatoire IA</h2></div><button type="button" id="observerClose">Fermer</button></header><p>L’IA observe les coups, les menaces et les trajectoires possibles autour de chaque point.</p><div class="observer-stats" id="observerStats"></div><div class="observer-log" id="observerLog" aria-live="polite">En attente d’une partie…</div><button type="button" id="observerClear">Effacer le journal visuel</button>';
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
  E.aiMove=function(state,rng,params){
    const chosen=base(state,rng,params);if(!chosen)return chosen;
    const me=E.tmOf(state.tm,state.cur),opp=1-me,dirs=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    const candidates=new Map(),add=(x,y)=>{if(E.legal(state,x,y))candidates.set(y*state.w+x,[x,y])};
    if(!state.o.some(row=>row.some(Boolean)))return chosen;
    for(let y=0;y<state.h;y++)for(let x=0;x<state.w;x++)if(state.o[y][x]){
      for(const [dx,dy] of dirs)for(let k=1;k<=2;k++)add(x+dx*k,y+dy*k);
    }
    add(chosen[0],chosen[1]);
    let best=chosen,bestScore=-Infinity,examined=0;
    for(const move of candidates.values()){
      if(++examined>64)break;
      const next=E.clone(state);if(!E.apply(next,move))continue;
      const gain=next.sc[me]-state.sc[me],loss=next.sc[opp]-state.sc[opp];
      let own=0,enemy=0,diagonal=0;
      for(const [dx,dy] of dirs){const x=move[0]+dx,y=move[1]+dy;if(x<0||y<0||x>=state.w||y>=state.h)continue;
        const p=state.o[y][x];if(p===me+1)own++;else if(p===opp+1)enemy++;if(dx&&dy&&p===me+1)diagonal++;
      }
      let follow=0,defence=0;
      if(!next.bonus){
        for(const [dx,dy] of dirs){const x=move[0]+dx,y=move[1]+dy;if(x<0||y<0||x>=state.w||y>=state.h||!E.legal(next,x,y))continue;
          const chain=E.clone(next);if(E.apply(chain,[x,y]))follow=Math.max(follow,chain.sc[me]-next.sc[me]);
          const block=E.clone(next);block.cur=opp;if(E.apply(block,[x,y]))defence=Math.max(defence,block.sc[opp]-next.sc[opp]);
        }
      }
      const score=gain*18-loss*20+own*1.25+enemy*.7+diagonal*.8+follow*3.2-defence*2.8+(move[0]===chosen[0]&&move[1]===chosen[1]?.15:0);
      if(score>bestScore){bestScore=score;best=move}
    }
    logTrajectory('Coup '+String.fromCharCode(65+best[0])+(best[1]+1)+' · '+examined+' trajectoires · score '+bestScore.toFixed(1));
    return best;
  };
  E.__observing=true;
}
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
