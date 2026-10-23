'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const E=require('../public/js/engine.js'),T=require('../public/js/trainer.js'),V=require('../public/js/verify.js');
const SUITE=JSON.parse(fs.readFileSync(path.join(__dirname,'..','public','ai','suite.json'),'utf8')).entries;
const def={w:E.DEFAULT_W.slice()},zero={w:[0,0,0,0,0,0]};

test('banque de techniques : fournie, valide, rejouable',()=>{
  assert.ok(SUITE.length>=24);
  assert.ok(SUITE.some(e=>e.kind==='capture')&&SUITE.some(e=>e.kind==='parade'));
  for(const e of SUITE.slice(0,6)){const s=V.position(E,e);assert.ok(s.free>0);if(e.kind==='capture')assert.ok(e.best>0)}
});
test('score de technique : une IA correcte réussit, des poids nuls échouent',()=>{
  const good=V.techScore(E,def,SUITE),bad=V.techScore(E,zero,SUITE);
  assert.ok(good>.7,'défaut '+good);assert.ok(bad<.4,'nul '+bad);
});
test('porte : une IA identique passe',()=>{
  const g=V.gate(E,T,def,def,{games:4,suite:SUITE.slice(0,16),seed:3});
  assert.equal(g.pass,true,g.reasons.join(';'));
});
test('porte : une évolution catastrophique est rejetée (match ET techniques)',()=>{
  const g=V.gate(E,T,zero,def,{games:4,suite:SUITE.slice(0,16),seed:3});
  assert.equal(g.pass,false);
  assert.ok(g.reasons.some(r=>/match/.test(r)));assert.ok(g.reasons.some(r=>/techniques/.test(r)));
});
test('porte : perdre contre un ancien champion est rejeté',()=>{
  const g=V.gate(E,T,zero,def,{games:2,hofGames:4,minScore:0,techTol:1,suite:[],hof:[{name:'v1',params:def}]});
  assert.equal(g.pass,false);assert.ok(g.reasons.some(r=>/v1/.test(r)));
});
test('porte : stable (mêmes entrées, même verdict)',()=>{
  const a=V.gate(E,T,zero,def,{games:2,suite:SUITE.slice(0,8),seed:5}),b=V.gate(E,T,zero,def,{games:2,suite:SUITE.slice(0,8),seed:5});
  assert.deepEqual(a.stats,b.stats);
});

/* ---- porte fermée par défaut (audit du 22 octobre, points 1 et 2) ---- */
test('fermée : aucune partie terminée => refus, même si rien n\'a « perdu »',()=>{
  const g=V.gate(E,T,def,def,{games:4,size:[9,9],suite:SUITE.slice(0,8),minComplete:1});
  assert.equal(g.pass,true,'référence : identique et parties jouées');
  // match impossible à terminer : plafond de coups minuscule via une taille dégénérée n'existe pas ; on simule n=0 par games=0
  const z=V.gate(E,T,def,def,{games:0,suite:SUITE.slice(0,8)});
  assert.equal(z.pass,false);assert.ok(z.reasons.some(r=>/trop peu de parties terminées/.test(r)),z.reasons.join(';'));
});
test('fermée : banque de techniques vide => refus (sauf demande explicite)',()=>{
  const g=V.gate(E,T,def,def,{games:2,suite:[]});
  assert.equal(g.pass,false);assert.ok(g.reasons.some(r=>/banque de techniques vide/.test(r)));
  const ok=V.gate(E,T,def,def,{games:2,suite:[],allowEmptySuite:true});
  assert.equal(ok.pass,true,ok.reasons.join(';'));
});
test('fermée : match contre un ancien champion sans partie terminée => refus',()=>{
  const g=V.gate(E,T,def,def,{games:2,suite:SUITE.slice(0,8),hofGames:0,hof:[{name:'v1',params:def}]});
  assert.equal(g.pass,false);assert.ok(g.reasons.some(r=>/contre v1/.test(r)),g.reasons.join(';'));
});
test('fermée : une exception du vérificateur est un REFUS (pass:false, error:true), jamais une validation',()=>{
  const bad={w:'pas-un-tableau'};
  const r=V.safeGate({...E,aiMove(){throw new Error('panne simulée')}},T,def,bad,{games:2,suite:SUITE.slice(0,4)});
  assert.equal(r.pass,false);assert.equal(r.error,true);assert.match(r.reasons[0],/vérification impossible : panne simulée/);
});
test('le Worker d\'entraînement n\'a plus de chemin « exception => pass:true »',()=>{
  const src=fs.readFileSync(path.join(__dirname,'..','public','js','train-worker.js'),'utf8');
  assert.ok(!/pass:\s*true/.test(src),'aucun pass:true dans train-worker.js');
  assert.match(src,/safeGate/);
});
