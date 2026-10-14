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
