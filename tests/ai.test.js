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
