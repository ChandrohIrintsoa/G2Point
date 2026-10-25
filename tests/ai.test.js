const test=require('node:test'),assert=require('node:assert/strict'),E=require('../public/js/engine.js');

test('les motifs sont horodatés à chaque observation',()=>{
  const s=E.create(11,15,2,false),book={},before=Date.now();
  E.learn(book,[[5,5],[0,0]],11,15,2,false,[0],0);
  const values=Object.values(book);
  assert.equal(values.length,2);
  for(const entry of values){assert.equal(entry.length,4);assert.ok(entry[3]>=before&&entry[3]<=Date.now())}
});

test('les vieilles leçons perdent progressivement leur influence sans être supprimées',()=>{
  const now=Date.now(),fresh=[10,20,8,now],old=[10,20,8,now-30*864e5];
  assert.ok(E.bookValue(fresh,now)>E.bookValue(old,now));
  assert.ok(E.bookValue(old,now)>0);
});

test('les leçons négatives restent distinctes des leçons positives',()=>{
  const s=E.create(11,15,2,false),good={},bad={};
  E.teach(good,s,5,5,0,2);E.teach(bad,s,5,5,0,-2);
  const key=E.patKey(s,5,5,0);
  assert.ok(E.bookValue(good[key])>0);
  assert.ok(E.bookValue(bad[key])<0);
});

test('les anti-motifs peuvent être fournis à l’IA sans rendre un coup illégal',()=>{
  const s=E.create(11,15,2,false);
  for(const p of [[5,5],[5,4],[1,1],[4,5],[2,2],[6,5],[3,3]])E.apply(s,p);
  const antiBook={[E.patKey(s,5,6,0)]:[8,18,7,Date.now()]};
  const move=E.aiMove(E.clone(s),E.rng(20261014),{lvl:2,antiBook});
  assert.ok(move&&E.legal(s,move[0],move[1]));
});

test('les poids évolués restent finis et positifs',()=>{
  const a=E.mutate(E.DEFAULT_W,E.rng(123456));
  assert.equal(a.length,6);
  assert.ok(a.every(v=>Number.isFinite(v)&&v>=0));
});

test('les livres tactique et stratégique restent indépendants',()=>{
  const tactical={},strategic={},moves=[[5,5],[0,0]];
  E.learn(tactical,moves,11,15,2,false,[0],0,strategic);
  assert.equal(Object.keys(tactical).some(k=>k.startsWith('S|')),false);
  assert.equal(Object.keys(strategic).every(k=>k.startsWith('S|')),true);
  assert.ok(Object.keys(tactical).length>0&&Object.keys(strategic).length>0);
});

test('le territoire capturé est attribué et conservé dans les clones',()=>{
  const s=E.create(11,15,2,false);
  for(const p of [[5,4],[5,5],[4,5],[0,0],[6,5],[0,2],[5,6]])E.apply(s,p);
  assert.ok(s.terr[0]>0);
  assert.deepEqual(E.clone(s).terr,s.terr);
});

test('le livre stratégique séparé est accepté par la recherche profonde',()=>{
  const s=E.create(11,15,2,false);
  for(const p of [[5,5],[5,4],[1,1],[4,5],[2,2],[6,5],[3,3]])E.apply(s,p);
  const key=E.strategyKey(s,5,6,0),sbook={[key]:[20,40,15,Date.now()]};
  const move=E.aiMove(E.clone(s),E.rng(20261015),{lvl:2,sbook});
  assert.ok(move&&E.legal(s,move[0],move[1]));
});

test('le livre conserve ses entrées après plusieurs parties rejouées',()=>{
  const book={},moves=[[5,5],[0,0],[5,4],[0,2],[4,5],[0,4]];
  for(let game=0;game<25;game++)E.learn(book,moves,11,15,2,false,[game%2],1);
  assert.ok(Object.keys(book).length>0);
  assert.ok(Object.values(book).every(entry=>entry[0]>0&&entry.length===4));
  assert.ok(Object.values(book).some(entry=>entry[0]>=25));
});

test('les cibles imaginaires couvrent un rayon de quatre cases',()=>{
  const s=E.create(11,15,2,false);E.apply(s,[5,5]);
  const targets=E.imaginaryTargets(s,0);
  assert.ok(targets.some(([x,y])=>x===9&&y===5));
  assert.ok(!targets.some(([x,y])=>Math.abs(x-5)>4||Math.abs(y-5)>4));
});
test('Dijkstra calcule une distance vers les cibles adverses',()=>{
  const s=E.create(11,15,2,false);E.apply(s,[5,5]);E.apply(s,[0,0]);
  const map=E.dijkstraTargets(s,0);
  assert.ok(map.targets.length>0);
  assert.ok(Number.isFinite(map.dist[5*s.w+5])===false);
  assert.ok(Number.isFinite(map.dist[6*s.w+5]));
});
test('A* reconstruit un chemin légal vers une cible',()=>{
  const s=E.create(11,15,2,false);E.apply(s,[5,5]);
  const route=E.aStarRoute(s,[0,0],[4,4]);
  assert.deepEqual(route[0],[0,0]);assert.deepEqual(route.at(-1),[4,4]);
  assert.ok(route.length>1);
});
test('la projection adverse couvre dix décisions au maximum',()=>{
  const s=E.create(11,15,2,false);E.apply(s,[5,5]);E.apply(s,[0,0]);
  const forecast=E.forecastOpponent(s,0,10);
  assert.equal(forecast.horizon,10);
  assert.ok(forecast.lines.every(line=>line.length<=10));
  assert.ok(forecast.projected.size>0);
});
test('la carte prédictive produit des risques finis',()=>{
  const s=E.create(11,15,2,false);E.apply(s,[5,5]);E.apply(s,[0,0]);
  const map=E.predictiveMap(s,0,10);
  assert.equal(map.risk.length,s.w*s.h);
  assert.ok(Array.from(map.risk).every(Number.isFinite));
});

test('MCTS UCT échantillonne des réponses et conserve un coup légal',()=>{
  const s=E.create(11,15,2,false);E.apply(s,[5,5]);E.apply(s,[0,0]);
  const candidates=E.aiMove(s,E.rng(91),{lvl:2,predictive:false});
  const pool=E.cands?E.cands(s).list.slice(0,6):[[4,4],[5,4],[4,5],[6,6]];
  const result=E.mctsRefine(s,s.cur,pool,E.DEFAULT_W,null,E.rng(92),performance.now()+80,60);
  assert.ok(result.move&&E.legal(s,result.move[0],result.move[1]));
  assert.ok(result.visits>0);
  assert.ok(result.arms.every(a=>Number.isFinite(a.mean)));
  assert.ok(candidates&&E.legal(s,candidates[0],candidates[1]));
});

test('le niveau Champion est disponible avec recherche renforcée',()=>{
  assert.equal(E.LEVELS[3].name,'Champion');
  assert.equal(E.LEVELS[3].champion,true);
  const s=E.create(11,15,2,false);E.apply(s,[5,5]);E.apply(s,[0,0]);
  const move=E.aiMove(s,E.rng(20261016),{lvl:3,predictive:false});
  assert.ok(move&&E.legal(s,move[0],move[1]));
});

test('le hash Zobrist incrémental correspond toujours au hash reconstruit',()=>{
  const s=E.create(11,15,2,false),moves=[[5,4],[5,5],[4,5],[0,0],[6,5],[0,2],[5,6]];
  for(const move of moves){
    assert.equal(E.apply(s,move),true);
    const rebuilt=E.clone(s);
    assert.equal(E.stateHash(s),E.rebuildHash(rebuilt));
  }
  assert.ok(s.terr.some(v=>v>0));
});
test('le hash distingue les règles de jeu de même plateau',()=>{
  const a=E.create(11,15,2,false),b=E.create(11,15,4,true);
  assert.notEqual(E.stateHash(a),E.stateHash(b));
});

/* ---- Régression multijoueur (audit P0-1) : searchBeam/mctsRefine à 3-4 joueurs ----
   Avant le fix : `next.sc[1-actor]` produisait undefined → NaN dans l'évaluation
   des coups candidats. Le garde-fou `if(!Number.isFinite(value))value=evaluate()`
   empêchait le crash mais la recherche retombait sur l'heuristique superficielle,
   soit une IA Champion/Difficile à 3-4 joueurs équivalente à Facile.
   Maintenant : `rival(s,actor)` est utilisé à la place de `1-actor`. */
test('régression multijoueur : searchBeam+mctsRefine à 3 joueurs ne produisent pas de NaN (lvl=2 Difficile)',()=>{
  for(const seed of [1234,5678,9012]){
    const s=E.create(9,9,3,false),r=E.rng(seed);
    for(let i=0;i<8;i++){const m=E.aiMove(s,r,{lvl:0});if(!m||!E.apply(s,m))break} /* position initiale avec 3 scores divergents */
    s.sc=[5,2,0]; /* force un rival clair : joueur 0 mène */
    const m=E.aiMove(s,r,{lvl:2,predictive:false});
    assert.ok(m,'aiMove a renvoyé null à 3 joueurs Difficile');
    assert.equal(E.apply(s,m),true,'le coup choisi doit être légal');
    assert.ok(Number.isFinite(s.sc[0])&&Number.isFinite(s.sc[1])&&Number.isFinite(s.sc[2]),'les scores ne doivent pas devenir NaN');
  }
});
test('régression multijoueur : mctsRefine à 3 joueurs renvoie un coup valide (pas de NaN dans les rollouts)',()=>{
  for(const [n,tm] of [[3,false],[4,false],[4,true]]){
    const s=E.create(9,9,n,tm),r=E.rng(7777);
    for(let i=0;i<6;i++){const m=E.aiMove(s,r,{lvl:0});if(!m||!E.apply(s,m))break}
    s.sc=s.sc.map((v,i)=>v+(i===0?3:1)); /* diverger les scores */
    const pool=[];for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)if(E.legal(s,x,y))pool.push([x,y]);
    const res=E.mctsRefine(s,s.cur,pool.slice(0,8),E.DEFAULT_W,null,r,performance.now()+120,80);
    assert.ok(res&&Array.isArray(res.move)&&res.move.length===2,'mctsRefine doit renvoyer un move [x,y]');
    assert.ok(E.legal(s,res.move[0],res.move[1]),'le coup choisi doit être légal');
    assert.ok(res.visits>0,'mctsRefine doit effectuer au moins une visite');
  }
});
test('régression multijoueur : aiMove Champion (lvl=3) à 4 joueurs/équipes joue un coup légal',()=>{
  for(const [n,tm] of [[4,false],[4,true]]){
    const s=E.create(9,9,n,tm),r=E.rng(4242);
    for(let i=0;i<5;i++){const m=E.aiMove(s,r,{lvl:0});if(!m||!E.apply(s,m))break}
    const m=E.aiMove(s,r,{lvl:3,predictive:false});
    assert.ok(m,'aiMove Champion a renvoyé null à n='+n);
    assert.equal(E.apply(s,m),true,'le coup doit être légal');
  }
});

/* ---- Audit section 10 P1 : aiMoveDebug instrumentation ----
   Vérifie que aiMoveDebug renvoie une structure exploitable pour reproduire un coup suspect. */
test('audit P1 : aiMoveDebug renvoie le coup choisi + décomposition par candidat',()=>{
  const s=E.create(11,15,2,false);
  for(const m of [[5,4],[5,5],[4,5],[0,0],[6,5],[0,2]])E.apply(s,m);
  const dbg=E.aiMoveDebug(s,E.rng(42),{lvl:3,predictive:false});
  assert.ok(Array.isArray(dbg.move)&&dbg.move.length===2,'dbg.move doit être [x,y]');
  assert.ok(E.legal(s,dbg.move[0],dbg.move[1]),'le coup choisi doit être légal');
  assert.ok(Array.isArray(dbg.candidates),'dbg.candidates doit être un tableau');
  assert.ok(dbg.candidates.length>0,'au moins 1 candidat analysé');
  /* Le coup choisi DOIT être dans les candidats analysés (bug corrigé : avant le tri par pertinence,
     le top 20 venait du coin haut-gauche et le coup choisi pouvait être absent). */
  const chosen=dbg.candidates.find(c=>c.isChosen);
  assert.ok(chosen,'le coup choisi doit être marqué isChosen=true dans les candidats');
  assert.ok(sameMove(chosen.move,dbg.move),'isChosen correspond au coup choisi');
  /* Chaque candidat a une décomposition en composantes exploitables. */
  for(const c of dbg.candidates){
    assert.ok(c.components,'chaque candidat doit avoir components');
    const k=c.components;
    assert.equal(typeof k.immediateGain,'number','immediateGain doit être un nombre');
    assert.equal(typeof k.denialValue,'number','denialValue doit être un nombre (audit section 3 : heuristique de déni)');
    assert.equal(typeof k.replyRisk,'number','replyRisk doit être un nombre (vraie simulation de réponse)');
    assert.equal(typeof k.ownNeighbors,'number','ownNeighbors doit être un nombre');
    assert.equal(typeof k.enemyNeighbors,'number','enemyNeighbors doit être un nombre');
    assert.equal(typeof k.positionValueAfter,'number','positionValueAfter doit être un nombre');
  }
  /* Budget : durée mesurée + niveau + flags (deep, tactic, champion). */
  assert.ok(dbg.budget,'dbg.budget doit être présent');
  assert.ok(dbg.budget.usedMs>=0,'usedMs doit être >= 0');
  assert.equal(dbg.budget.level,'Champion','niveau Champion correct');
  assert.equal(dbg.budget.deep,true,'deep=true pour Champion');
  /* Meta : joueur racine, adversaire, nombre d'équipes. */
  assert.equal(dbg.meta.rootPlayer,0,'P0 racine');
  assert.equal(dbg.meta.opponent,1,'P1 adverse');
  assert.equal(dbg.meta.teamCount,2,'2 équipes');
});
test('audit P1 : aiMoveDebug pour la position capture_immediate — le coup choisi doit avoir immediateGain > 0',()=>{
  const s=E.create(11,15,2,false);
  for(const m of [[5,4],[5,5],[4,5],[0,0],[6,5],[0,2]])E.apply(s,m);
  const dbg=E.aiMoveDebug(s,E.rng(42),{lvl:3,predictive:false});
  const chosen=dbg.candidates.find(c=>c.isChosen);
  /* Pour cette position, le meilleur coup (5,6) capture (5,5) → immediateGain=1, replyRisk=0 (j'ai capturé, opp ne joue pas). */
  assert.ok(chosen.components.immediateGain>0,'le coup choisi doit avoir un gain immédiat (capture)');
  assert.equal(chosen.components.replyRisk,0,'replyRisk=0 après une capture (adversaire ne joue pas ensuite)');
});
test('audit P1 : aiMoveDebug documente la différence entre DENI (ligne 438) et RISQUE DE RÉPONSE (replyGain)',()=>{
  /* denialValue et replyRisk sont deux signaux distincts par construction :
     - denialValue simule l'adversaire jouant le MÊME coup que moi (heuristique de déni)
     - replyRisk simule la MEILLEURE RÉPONSE adverse APRÈS mon coup (vraie simulation)
     Sur une position où peu de captures sont possibles, les deux peuvent être 0 pour tous les
     candidats — c'est OK. On vérifie ici qu'ils sont TOUJOURS calculés (non-undefined) et
     que sur une position avec MENACE, au moins un candidat a replyRisk > 0. */
  const s=E.create(11,15,2,false);
  for(const m of [[5,4],[5,5],[4,5],[0,0],[6,5],[0,2]])E.apply(s,m);
  const dbg=E.aiMoveDebug(s,E.rng(42),{lvl:3,predictive:false});
  /* 1. Tous les candidats ont denialValue ET replyRisk comme nombres finis. */
  for(const c of dbg.candidates){
    assert.ok(Number.isFinite(c.components.denialValue),'denialValue doit être fini');
    assert.ok(Number.isFinite(c.components.replyRisk),'replyRisk doit être fini');
  }
  /* 2. Sur une position avec MENACE adverse (P1 a 3 coins du losange autour de (8,8) de P0),
     au moins un candidat a replyRisk > 0 — l'IA voit le risque. */
  const s2=E.create(11,15,2,false);
  /* 6 moves (cur=0 après) : P0 a (8,8),(5,4),(0,0). P1 a (8,7),(7,8),(9,8) — 3 coins du
     losange autour de (8,8) de P0. Si P1 joue (8,9) au prochain tour, il capture (8,8). */
  for(const m of [[8,8],[8,7],[5,4],[7,8],[0,0],[9,8]])E.apply(s2,m);
  assert.equal(s2.cur,0,'P0 doit jouer (sinon le setup est faux)');
  const dbg2=E.aiMoveDebug(s2,E.rng(42),{lvl:3,predictive:false});
  const withRisk=dbg2.candidates.filter(c=>c.components.replyRisk>0);
  assert.ok(withRisk.length>0,`sur position menacée, au moins un candidat a replyRisk > 0 (obtenu: ${withRisk.length}/${dbg2.candidates.length} avec risque)`);
});
function sameMove(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===2&&b.length===2&&a[0]===b[0]&&a[1]===b[1]}
