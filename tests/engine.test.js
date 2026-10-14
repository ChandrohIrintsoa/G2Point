const test=require('node:test'),assert=require('node:assert/strict'),E=require('../public/js/engine.js');
const play=(s,pts)=>pts.forEach(p=>E.apply(s,p));
// Rouge (joueur 0) entoure le point noir (5,5) ; Noir joue ailleurs.
const ring=[[5,4],[5,5],[4,5],[0,0],[6,5],[0,2],[5,6]];
test('capture d’un point encerclé + bonus',()=>{
  const s=E.create(11,15,2,false);play(s,ring);
  assert.equal(s.sc[0],1);assert.equal(s.d[5][5],true);
  assert.equal(s.bonus,true);assert.equal(s.cur,0);assert.deepEqual(s.cap,[[5,5]]);
});
test('piège : poser dans une zone fermée = capturé, sans bonus',()=>{
  const s=E.create(11,15,2,false);
  play(s,[[5,4],[0,0],[4,5],[0,2],[6,5],[0,4],[5,6]]);
  assert.equal(s.cur,1);play(s,[[5,5]]);
  assert.equal(s.sc[0],1);assert.equal(s.d[5][5],true);assert.equal(s.bonus,false);assert.equal(s.cur,0);
});
test('les bords ne ferment pas une boucle',()=>{
  const s=E.create(11,15,2,false);
  play(s,[[0,3],[0,4],[1,4],[1,0],[0,5],[2,0]]);assert.equal(s.sc[0],0);
});
test('mode équipes : joueurs 1 et 3 contre 2 et 4',()=>{
  assert.deepEqual([0,1,2,3].map(p=>E.tmOf(true,p)),[0,1,0,1]);
  const s=E.create(11,15,4,true);assert.equal(s.sc.length,2);
  play(s,[[0,0],[1,0],[2,0]]);assert.equal(s.o[0][2],1);assert.equal(s.cur,3);
});

test('IA : complète une capture disponible',()=>{
  const s=E.create(11,15,2,false);
  play(s,[[5,5],[5,4],[0,0],[4,5],[0,2],[6,5],[0,4]]);
  assert.equal(s.cur,1);assert.deepEqual(E.aiMove(s,()=>0),[5,6]);
});
test('IA : bloque une capture adverse',()=>{
  const s=E.create(11,15,2,false);
  play(s,[[5,4],[5,5],[4,5],[0,0],[6,5],[0,2]]); // Rouge menace (5,6) ; c'est à Rouge de jouer ? non : Noir
  assert.equal(s.cur,0);play(s,[[0,4]]);assert.deepEqual(E.aiMove(s,()=>0),[5,6]);
});
test('IA : choix reproductible avec une graine fixe sur une position identique',()=>{
  const s=E.create(11,15,2,false);
  play(s,[[5,5],[5,4],[1,1],[4,5],[2,2],[6,5],[3,3]]);
  const a=E.aiMove(E.clone(s),E.rng(424242),{lvl:2});
  const b=E.aiMove(E.clone(s),E.rng(424242),{lvl:2});
  assert.deepEqual(a,b);
  assert.ok(a&&E.legal(s,a[0],a[1]));
});
test('IA difficile : anticipation reproductible sur plusieurs demi-coups',()=>{
  const s=E.create(11,15,2,false);
  play(s,[[5,5],[5,4],[1,1],[4,5],[2,2],[6,5],[3,3]]);
  const a=E.aiMove(E.clone(s),E.rng(91357),{lvl:2});
  const b=E.aiMove(E.clone(s),E.rng(91357),{lvl:2});
  assert.deepEqual(a,b);
  assert.ok(a&&E.legal(s,a[0],a[1]));
});
test('profil adverse : observe les captures, les chaînes et les bords séparément',()=>{
  const moves=[[5,5],[0,0],[6,5],[0,2],[6,6]];
  const p=E.observeOpponent({},moves,11,15,2,false,0);
  assert.equal(p.samples,3);
  assert.equal(p.cluster,2);
  assert.equal(p.edge,0);
  assert.equal(p.captures,0);
  const style=E.opponentStyle(p);
  assert.ok(style.cluster>0.6);
});
test('apprentissage solo : mémorise uniquement les coups de l’IA',()=>{
  const book={},moves=[[1,1],[2,2],[3,3],[4,4]],s=E.create(11,15,2,false);
  const humanKey=E.patKey(s,1,1,0);E.apply(s,moves[0]);
  const aiKey=E.patKey(s,2,2,1);
  E.learn(book,moves,11,15,2,false,[1],1);
  assert.equal(book[humanKey],undefined);
  assert.ok(book[aiKey]);
});

test('RNG déterministe (défi du jour)',()=>{
  const a=E.rng(20261012),b=E.rng(20261012);assert.deepEqual([a(),a(),a()],[b(),b(),b()]);
});

// Non-régression : parties aléatoires à graine fixe, résultats figés depuis le moteur d'origine (avant optimisation de scan/apply).
test('moteur : résultats identiques à la référence (parties aléatoires à graine fixe)',()=>{
  const ref=[
    {w:9,h:9,n:2,tm:false,seed:11,sc:[1,0],big:[1,0],free:13,loops:1},
    {w:11,h:15,n:2,tm:false,seed:22,sc:[0,6],big:[0,2],free:21,loops:6},
    {w:8,h:8,n:4,tm:true,seed:33,sc:[4,0],big:[2,0],free:8,loops:3},
    {w:17,h:23,n:3,tm:false,seed:44,sc:[1,3,4],big:[1,2,2],free:51,loops:6}
  ];
  for(const g of ref){
    const s=E.create(g.w,g.h,g.n,g.tm),r=E.rng(g.seed);
    for(let k=0;k<g.w*g.h*2;k++)E.apply(s,[(r()*g.w)|0,(r()*g.h)|0]);
    assert.deepEqual({sc:s.sc,big:s.big,free:s.free,loops:s.loops.length},{sc:g.sc,big:g.big,free:g.free,loops:g.loops});
  }
});
