'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const B=require('../public/js/brain.js'),E=require('../public/js/engine.js'),T=require('../public/js/trainer.js');

const W=n=>Array.from({length:6},(_,i)=>n+i);
const pop=n=>Array.from({length:8},(_,i)=>({w:W(n+i),score:0,played:0,elo:1200}));
const ai=(o={})=>({w:W(1),c:W(1),pop:pop(1),active:0,st:{g:0,w:0},games:0,simulations:0,manualLessons:0,opponent:{samples:0,captures:0,cluster:0,edge:0},book:{},antiBook:{},sbook:{},antiSBook:{},...o});

test('livres : on garde l\'entrée la plus expérimentée, sans jamais additionner',()=>{
  const a=ai({book:{k1:[10,5,6,100],k2:[1,0,0,50]}}),b=ai({book:{k1:[4,9,1,500],k3:[7,2,3,10]}});
  const m=B.merge(B.pack(a),B.pack(b));
  assert.deepEqual(m.book.k1,[10,5,6,100],'k1 : 10 parties > 4 parties');
  assert.deepEqual(m.book.k2,[1,0,0,50]);assert.deepEqual(m.book.k3,[7,2,3,10]);
});
test('fusion idempotente et commutative (pas de double comptage à chaque synchro)',()=>{
  const a=B.pack(ai({games:5,simulations:50,book:{x:[3,1,1,9]}})),b=B.pack(ai({games:2,simulations:90,w:W(9),book:{x:[3,4,2,20],y:[1,1,1,1]}}));
  const ab=B.merge(a,b),ba=B.merge(b,a);
  assert.equal(B.fingerprint(ab),B.fingerprint(ba));
  assert.equal(B.fingerprint(B.merge(ab,b)),B.fingerprint(ab));
  assert.equal(B.fingerprint(B.merge(ab,ab)),B.fingerprint(ab));
});
test('les poids et la population viennent de l\'IA la plus expérimentée',()=>{
  const young=B.pack(ai({simulations:10,w:W(1)})),old=B.pack(ai({simulations:500,w:W(7),c:W(7),pop:pop(7)}));
  const m=B.merge(young,old);
  assert.deepEqual(m.w,W(7));assert.equal(m.pop[0].w[0],7);assert.equal(m.simulations,500);
  assert.deepEqual(B.merge(old,young).w,W(7));
});
test('compteurs : maximum ; tournoi : maximum champ par champ ; pause la plus lointaine',()=>{
  const ta={epoch:0,games:30,incomplete:1,cursor:4,pauses:1,pauseUntil:1000,stats:{L0:{w:5,l:3,d:0},IA:{w:9,l:1,d:2}},streaks:{L0:3,IA:7}};
  const tb={epoch:0,games:50,incomplete:0,cursor:9,pauses:2,pauseUntil:500,stats:{L0:{w:4,l:8,d:1},IA:{w:12,l:1,d:2}},streaks:{L0:0,IA:12}};
  const m=B.mergeTrain(ta,tb);
  assert.equal(m.games,50);assert.equal(m.pauses,2);assert.equal(m.pauseUntil,1000);
  assert.deepEqual(m.stats.L0,{w:5,l:8,d:1});assert.equal(m.streaks.IA,12);
});
test('une remise à zéro (epoch plus récent) l\'emporte au lieu d\'être ressuscitée par le maximum',()=>{
  const old={epoch:0,games:900,stats:{IA:{w:500,l:1,d:0}},streaks:{IA:50}},reset={epoch:12345,games:0,stats:{IA:{w:0,l:0,d:0}},streaks:{IA:0}};
  const m=B.mergeTrain(old,reset);
  assert.equal(m.games,0);assert.equal(m.stats.IA.w,0);assert.equal(m.epoch,12345);
});
test('un vrai Tournament accepte l\'état fusionné (restore) et conserve l\'epoch',()=>{
  const t=new T.Tournament({streakLimit:100,pauseMin:30,levels:[0,1,2],size:[11,15],learnerLevel:2},{epoch:777,games:12});
  assert.equal(t.snapshot().epoch,777);assert.equal(t.snapshot().games,12);
  const m=B.mergeTrain(t.snapshot(),{epoch:777,games:40,stats:{IA:{w:3,l:0,d:0}}});
  t.restore(m);assert.equal(t.st.games,40);assert.equal(t.st.stats.IA.w,3);
});
test('applyTo : met à jour livres/poids sans perdre le journal local',()=>{
  const local=ai({log:[{a:1}],simulations:3,book:{a:[1,1,1,1]}}),remote=B.pack(ai({simulations:30,w:W(5),c:W(5),pop:pop(5),book:{b:[2,2,2,2]}}));
  const out=B.applyTo(local,B.merge(B.pack(local),remote));
  assert.deepEqual(out.log,[{a:1}]);assert.deepEqual(out.w,W(5));assert.ok(out.book.a&&out.book.b);assert.equal(out.simulations,30);
});
test('données hostiles nettoyées : clés trop longues, entrées invalides, livre limité',()=>{
  const evil={book:{['x'.repeat(500)]:[1,1,1,1],ok:[1,2,3,4],bad:'zz',nan:[NaN,1,1,1]}};
  const c=B.cleanBook(evil.book);assert.deepEqual(Object.keys(c).sort(),['nan','ok']);assert.equal(c.nan[0],0);
  const huge={};for(let i=0;i<5000;i++)huge['k'+i]=[1,0,0,0];
  assert.equal(Object.keys(B.cleanBook(huge)).length,B.MAX_BOOK);
});
test('scénario deux appareils : après synchro croisée, les deux ont tout ce que chacun a appris',()=>{
  let cloud=null;
  const sync=dev=>{const m=B.merge(dev,cloud);cloud=m;return m};
  const phone=B.pack(ai({simulations:200,book:{p1:[5,3,3,1],shared:[2,1,1,1]}})),pc=B.pack(ai({simulations:800,w:W(8),c:W(8),pop:pop(8),book:{c1:[9,6,6,1],shared:[6,3,4,1]}}));
  const p1=sync(phone),c1=sync(pc),p2=sync(p1);
  for(const d of [c1,p2]){assert.ok(d.book.p1&&d.book.c1);assert.deepEqual(d.book.shared,[6,3,4,1]);assert.deepEqual(d.w,W(8))}
});
