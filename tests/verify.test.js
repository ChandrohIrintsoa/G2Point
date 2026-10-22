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
