'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/js/engine.js'),T=require('../public/js/trainer.js');

test('une partie d\'entraînement va jusqu\'au bout (terrain plein) et rend un vainqueur cohérent',()=>{
  const r=T.playGame(E,{a:{lvl:1},b:{lvl:0},seed:11,swap:false});
  assert.equal(r.complete,true);
  assert.ok(r.moves.length>=100,'une partie 11x15 compte ~165 coups, pas 20');
  assert.ok([0,1,2].includes(r.winner));
  const [a,b]=r.scores;assert.equal(r.winner,a>b?0:a<b?1:2);
});

test('le moteur compte lui-même les coups (phase de partie correcte en simulation)',()=>{
  const s=E.create(11,15,2,false);
  for(const m of [[5,5],[0,0],[5,4],[0,2]])assert.ok(E.apply(s,m));
  assert.equal(s.n,4);
  assert.equal(E.apply(s,[5,5]),false);assert.equal(s.n,4,'un coup refusé ne compte pas');
  assert.equal(E.clone(s).n,4);
});

test('niveau Normal nettement plus fort que Facile (garde-fou anti-régression)',()=>{
  let normal=0,facile=0;
  for(let i=0;i<10;i++){const r=T.playGame(E,{a:{lvl:1},b:{lvl:0},seed:1000+i*37,swap:i%2===1});if(r.winner===0)normal++;else if(r.winner===1)facile++}
  assert.ok(normal>=facile+4,`Normal ${normal} victoires contre Facile ${facile}`);
});

test('la série de 100 victoires du même niveau déclenche la pause puis la relance',()=>{
  const t=new T.Tournament({streakLimit:100,pauseMin:30});
  const t0=1_000_000;let res;
  for(let i=0;i<99;i++){res=t.record('L2','L0',0,true,t0);assert.equal(res.pause,false)}
  assert.equal(t.st.streaks.L2,99);
  res=t.record('L2','L1',0,true,t0);
  assert.equal(res.pause,true);assert.equal(res.id,'L2');assert.equal(res.streak,100);
  assert.equal(t.paused(t0+29*60000),true);
  assert.equal(t.paused(t0+30*60000),false,'relance après 30 minutes');
  assert.equal(t.st.streaks.L2,0,'les séries repartent de zéro après la pause');
  assert.equal(t.st.pauses,1);
});

test('une défaite ou une égalité casse la série',()=>{
  const t=new T.Tournament();
  for(let i=0;i<50;i++)t.record('L2','L0',0);
  t.record('L2','L0',2);assert.equal(t.st.streaks.L2,0);
  for(let i=0;i<60;i++)t.record('L2','L1',0);
  t.record('L2','L1',1);assert.equal(t.st.streaks.L2,0);assert.equal(t.st.streaks.L1,1);
  assert.equal(t.st.pauses,0);
});

test('toutes les paires sont jouées en boucle, côtés alternés, apprenante incluse',()=>{
  const t=new T.Tournament();
  const seen=new Set(),swaps=new Set();
  for(let i=0;i<t.pairs.length*2;i++){const m=t.next();seen.add(m.a.id+'-'+m.b.id);swaps.add(m.swap)}
  assert.equal(seen.size,t.pairs.length);assert.equal(swaps.size,2);
  assert.ok([...seen].some(k=>k.includes('IA')),'l\'IA apprenante participe');
});

test('l\'état du tournoi survit à un rechargement',()=>{
  const t=new T.Tournament();
  for(let i=0;i<7;i++)t.record('L1','L0',0);
  const u=new T.Tournament({},t.snapshot());
  assert.equal(u.st.streaks.L1,7);assert.equal(u.st.games,7);assert.equal(u.st.stats.L1.w,7);
});

test('une partie interrompue est comptée à part (audit 3.3)',()=>{
  const t=new T.Tournament();t.record('L1','L0',0,false);
  assert.equal(t.st.incomplete,1);
});
