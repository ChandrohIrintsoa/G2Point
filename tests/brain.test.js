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

test('motif maîtrisé : ≥ 6 rencontres, ≥ 80 % de victoires, gain positif ; détecté pour déclencher la synchro',()=>{
  assert.equal(B.isMastered([6,4,5,0]),true);
  assert.equal(B.isMastered([5,9,5,0]),false,'pas assez rencontré');
  assert.equal(B.isMastered([10,9,7,0]),false,'moins de 80 % de victoires');
  assert.equal(B.isMastered([10,1,9,0]),false,'gain trop faible');
  const a=ai({book:{a:[6,4,5,0],b:[2,2,2,0]},sbook:{c:[8,8,8,0]}});
  assert.equal(B.masteredCount(a),2);
  a.book.b=[6,6,6,0];assert.equal(B.masteredCount(a),3,'un nouveau motif franchit le seuil');
});

test('progression : l\'ELO descend après une défaite sans être « ressuscité » par la synchro (le plus récent gagne)',()=>{
  const phone={at:1000,streak:3,best:3,elo:{x:1450},ach:{a:5},h2h:{}},pc={at:2000,streak:0,best:3,elo:{x:1420},ach:{b:7},h2h:{}};
  const m=B.mergeProgress(phone,pc),m2=B.mergeProgress(pc,phone);
  assert.equal(m.elo.x,1420);assert.equal(m2.elo.x,1420);assert.equal(m.streak,0);
  assert.deepEqual(Object.keys(m.ach).sort(),['a','b']);assert.equal(m.at,2000);
});
test('progression : niveaux jamais joués ailleurs conservés, bilans et meilleure série en maximum, idempotent',()=>{
  const a={at:5,streak:1,best:9,elo:{x:1300,y:1500},ach:{},h2h:{u:{n:'A',w:3,l:1,d:0}}},b={at:9,streak:2,best:4,elo:{x:1280},ach:{},h2h:{u:{n:'A',w:2,l:4,d:1}}};
  const m=B.mergeProgress(a,b);
  assert.deepEqual(m.elo,{x:1280,y:1500});assert.equal(m.best,9);assert.deepEqual(m.h2h.u,{n:'A',w:3,l:4,d:1});
  assert.equal(B.canon(B.mergeProgress(m,m)),B.canon(m));assert.equal(B.canon(B.mergeProgress(m,a)),B.canon(B.mergeProgress(a,m)));
});
test('progression : anciens clients sans horodatage -> maximum (comportement prudent)',()=>{
  const m=B.mergeProgress({streak:1,best:2,elo:{x:1300}},{streak:4,best:3,elo:{x:1250}});
  assert.equal(m.elo.x,1300);assert.equal(m.streak,4);assert.equal(m.best,4);
});

/* ---- Audit section 5 : tests mathématiques STRICTS de la fusion ----
   Les tests précédents utilisaient `fingerprint()` (comparaison coarse par résumés)
   qui masquait les violations de commutativité quand deux cerveaux ont la même
   experience mais des contenus différents. Ici on compare les sérialisations
   canoniques complètes via B.canon(). */

test('audit 5 : merge STRICTEMENT commutative quand experiences différent',()=>{
  const a=B.pack(ai({games:5,simulations:50,w:W(1),book:{x:[3,1,1,9]}}));
  const b=B.pack(ai({games:2,simulations:90,w:W(9),book:{x:[3,4,2,20],y:[1,1,1,1]}}));
  assert.equal(B.canon(B.merge(a,b)),B.canon(B.merge(b,a)),'merge(a,b) === merge(b,a) en canon');
});

test('audit 5 : merge STRICTEMENT commutative à experience ÉGALE (cas précédemment cassé)',()=>{
  /* Deux cerveaux sans parties jouées mais avec poids et livres différents.
     Avant le fix : lead = experience(a)>=experience(b)?a:b => lead=a tjrs,
     donc merge(a,b).w venait de a, merge(b,a).w venait de b => != */
  const a=B.pack(ai({games:0,simulations:0,w:W(1),book:{k1:[3,1,1,9]}}));
  const b=B.pack(ai({games:0,simulations:0,w:W(9),book:{k1:[5,2,3,9],k2:[1,1,1,1]}}));
  assert.equal(B.canon(B.merge(a,b)),B.canon(B.merge(b,a)),'merge(a,b) === merge(b,a) à experience égale');
});

test('audit 5 : merge STRICTEMENT idempotente',()=>{
  const a=B.pack(ai({games:5,simulations:50,w:W(3),book:{x:[3,1,1,9]}}));
  assert.equal(B.canon(B.merge(a,a)),B.canon(a),'merge(a,a) === a en canon');
});

test('audit 5 : merge STRICTEMENT associative',()=>{
  const a=B.pack(ai({games:5,w:W(1),book:{k1:[3,1,1,9]}}));
  const b=B.pack(ai({games:2,simulations:90,w:W(9),book:{k1:[5,2,3,9],k2:[1,1,1,1]}}));
  const c=B.pack(ai({games:10,simulations:200,w:W(5),book:{k1:[7,3,5,9],k3:[2,2,2,2]}}));
  const l=B.merge(B.merge(a,b),c),r=B.merge(a,B.merge(b,c));
  assert.equal(B.canon(l),B.canon(r),'merge(merge(a,b),c) === merge(a,merge(b,c))');
});

test('audit 5 : mergeBook STRICTEMENT commutative à n et t égaux mais gain/w différents',()=>{
  /* Cas précis qui échouait avant le fix : deux entrées avec même n et même t
     mais gain/w différents. Sans tie-break JSON, l'ordre d'itération décidait. */
  const A={k:[5,3,3,100]},B_={k:[5,4,5,100]}; /* même n=5, même t=100, gain/w différents */
  assert.equal(JSON.stringify(B.mergeBook(A,B_)),JSON.stringify(B.mergeBook(B_,A)),'mergeBook(A,B) === mergeBook(B,A)');
  /* Vérifie aussi qu'on prend bien l'entrée la plus "grande" en canon (pas juste au hasard) */
  const merged=B.mergeBook(A,B_);
  assert.deepEqual(merged.k,[5,4,5,100],'l\'entrée avec gain+w supérieur est retenue');
});

test('audit 5 : mergeTrain STRICTEMENT commutative à games égaux (cas précédemment cassé)',()=>{
  /* Avant le fix : lead = a.games>=b.games?a:b => lead=a tjrs à games égal,
     cursor/lastPause/streaks venaient de a. */
  const ta=B.cleanTrain({epoch:0,games:30,cursor:4,lastPause:{id:'X',at:1},stats:{IA:{w:5,l:3,d:0}},streaks:{IA:7}});
  const tb=B.cleanTrain({epoch:0,games:30,cursor:9,lastPause:{id:'Y',at:2},stats:{IA:{w:12,l:1,d:2}},streaks:{IA:12}});
  assert.equal(B.canon(B.mergeTrain(ta,tb)),B.canon(B.mergeTrain(tb,ta)),'mergeTrain(a,b) === mergeTrain(b,a) à games égal');
});

test('audit 5 : sync croisée 3 appareils converge vers le même cerveau (commutativité + associativité)',()=>{
  /* Scénario réel : 3 appareils se synchronisent en parallèle.
     Les 3 paires (a-b, b-c, a-c) puis synchro avec le cloud doivent converger. */
  const a=B.pack(ai({games:5,simulations:50,w:W(1),book:{p1:[5,3,3,1]}}));
  const b=B.pack(ai({games:2,simulations:90,w:W(9),book:{p2:[4,2,2,1]}}));
  const c=B.pack(ai({games:10,simulations:200,w:W(5),book:{p3:[8,5,5,1]}}));
  /* 3 ordres possibles de sync */
  const o1=B.merge(B.merge(a,b),c);
  const o2=B.merge(B.merge(b,c),a);
  const o3=B.merge(B.merge(c,a),b);
  assert.equal(B.canon(o1),B.canon(o2),'ordre (a,b,c) == (b,c,a)');
  assert.equal(B.canon(o2),B.canon(o3),'ordre (b,c,a) == (c,a,b)');
});
