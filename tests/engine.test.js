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
test('RNG déterministe (défi du jour)',()=>{
  const a=E.rng(20261012),b=E.rng(20261012);assert.deepEqual([a(),a(),a()],[b(),b(),b()]);
});
