/* Synchronisation de la mémoire de l'IA : fusion (engine.js) + API Worker (cloudflare/worker.mjs) avec une fausse base D1. */
const test=require('node:test'),assert=require('node:assert/strict'),E=require('../public/js/engine.js');

test('mergeBook : garde l’entrée la plus observée, idempotent et commutatif',()=>{
  const a={'.m.o':[5,10,3],'x':[1,0,0]},b={'.m.o':[8,4,6],'y':[2,2,1]};
  const ab=E.mergeBook(a,b),ba=E.mergeBook(b,a);
  assert.deepEqual(ab,{'.m.o':[8,4,6],'x':[1,0,0],'y':[2,2,1]});
  assert.deepEqual(ab,ba);
  assert.deepEqual(E.mergeBook(ab,b),ab);          /* rejouer une synchro ne gonfle rien */
  assert.deepEqual(E.mergeBook(ab,ab),ab);
});
test('mergeBook : ignore les entrées mal formées et ne modifie pas ses arguments',()=>{
  const a={ok:[1,1,1]},snap=JSON.stringify(a);
  const m=E.mergeBook(a,{bad:'x',short:[1,2],nul:null});
  assert.deepEqual(m,{ok:[1,1,1]});assert.equal(JSON.stringify(a),snap);
  assert.deepEqual(E.mergeBook(null,undefined),{});
});
test('mergeBook : borne la mémoire en gardant les motifs les plus vus',()=>{
  const big={};for(let i=0;i<2000;i++)big['k'+i]=[i+1,0,0];
  const m=E.mergeBook(big,{});
  assert.equal(Object.keys(m).length,E.BOOK_KEEP);
  assert.ok(m.k1999&&!m.k0);
});

/* ---- Worker ---- */
let worker;
test.before(async()=>{worker=await import('../cloudflare/worker.mjs')});

function fakeDb({noBookTable=false}={}){
  const ai=new Map(),book=new Map();
  return{ai,book,prepare(sql){
    let args=[];
    const q={bind(...a){args=a;return q},
      async first(){
        if(/FROM player_ai_book/.test(sql)){if(noBookTable)throw new Error('no such table: player_ai_book');const r=book.get(args[0]);return r?{book_json:r.book_json,simulations:r.simulations}:null}
        if(/FROM player_ai WHERE/.test(sql)){const r=ai.get(args[0]);return r?{weights_json:r.weights_json,games:r.games,wins:r.wins,updated_at:1}:null}
        return null},
      async run(){
        if(/INSERT INTO player_ai_book/.test(sql)){if(noBookTable)throw new Error('no such table: player_ai_book');const [id,json,sims]=args,o=book.get(id);book.set(id,{book_json:json,simulations:Math.max(o?o.simulations:0,sims)});return{}}
        if(/INSERT INTO player_ai\(/.test(sql)){const [id,w,g,wi]=args,o=ai.get(id);ai.set(id,{weights_json:w,games:Math.max(o?o.games:0,g),wins:Math.max(o?o.wins:0,wi)});return{}}
        return{}}};
    return q}};
}
const ORIGIN='https://g2ppoint.web.app',env=db=>({DB:db,ALLOWED_ORIGINS:ORIGIN+',https://g2ppoint.firebaseapp.com'});
const call=(db,method,path,body)=>worker.default.fetch(new Request('https://api.test'+path,{method,headers:{Origin:ORIGIN,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined}),env(db));
const W6=E.DEFAULT_W.slice(),PID='device_abc123';

test('sanitizeBook : refuse __proto__, clés étranges, valeurs hors bornes',()=>{
  const raw=JSON.parse('{"__proto__":[1,1,1],"a b":[1,1,1],"ok":[3,2,1],"neg":[0,0,0],"huge":[1e12,0,0],"wins":[2,0,5],"nan":[1,"x",0]}');
  assert.deepEqual(worker.sanitizeBook(raw),{ok:[3,2,1]});
  assert.equal(worker.sanitizeBook([1,2]),null);
  assert.equal(worker.sanitizeBook(null),null);
  const many={};for(let i=0;i<3001;i++)many['k'+i]=[1,0,0];
  assert.equal(worker.sanitizeBook(many),null);
});

test('PUT /api/ai/player : enregistre la mémoire et la renvoie fusionnée ; GET la restitue',async()=>{
  const db=fakeDb();
  let r=await call(db,'PUT','/api/ai/player',{playerId:PID,weights:W6,games:4,wins:2,simulations:3,book:{'.m.o':[5,10,3]}});
  assert.equal(r.status,200);let j=await r.json();
  assert.deepEqual(j.book,{'.m.o':[5,10,3]});assert.equal(j.simulations,3);
  /* un 2e appareil du même joueur apporte d'autres motifs : la mémoire serveur est l'union */
  r=await call(db,'PUT','/api/ai/player',{playerId:PID,weights:W6,games:2,wins:1,simulations:7,book:{'.m.o':[2,0,0],'x.x':[9,9,9]}});
  j=await r.json();
  assert.deepEqual(j.book,{'.m.o':[5,10,3],'x.x':[9,9,9]});assert.equal(j.simulations,7);
  r=await call(db,'GET','/api/ai/player?playerId='+PID);j=await r.json();
  assert.deepEqual(j.training.book,{'.m.o':[5,10,3],'x.x':[9,9,9]});
  assert.equal(j.training.games,4);assert.equal(j.training.simulations,7);
  /* rejouer la même synchro ne change rien */
  r=await call(db,'PUT','/api/ai/player',{playerId:PID,weights:W6,games:4,wins:2,simulations:7,book:j.training.book});
  assert.deepEqual((await r.json()).book,j.training.book);
});

test('PUT : les mémoires de deux joueurs restent séparées',async()=>{
  const db=fakeDb();
  await call(db,'PUT','/api/ai/player',{playerId:PID,weights:W6,games:1,wins:0,simulations:1,book:{aaa:[1,1,1]}});
  await call(db,'PUT','/api/ai/player',{playerId:'device_other99',weights:W6,games:1,wins:0,simulations:1,book:{bbb:[1,1,1]}});
  const j=await (await call(db,'GET','/api/ai/player?playerId='+PID)).json();
  assert.deepEqual(j.training.book,{aaa:[1,1,1]});
});

test('PUT : entrées invalides refusées, ancien client (sans mémoire) toujours accepté',async()=>{
  const db=fakeDb();
  assert.equal((await call(db,'PUT','/api/ai/player',{playerId:PID,weights:W6,games:1,wins:0,book:[1,2,3]})).status,422);
  assert.equal((await call(db,'PUT','/api/ai/player',{playerId:'x',weights:W6,book:{}})).status,422);
  const r=await call(db,'PUT','/api/ai/player',{playerId:PID,weights:W6,games:1,wins:0});
  assert.equal(r.status,200);assert.equal((await r.json()).book,undefined);
});

test('schéma pas encore migré : poids enregistrés, réponse sans mémoire (le client le signale)',async()=>{
  const db=fakeDb({noBookTable:true});
  const r=await call(db,'PUT','/api/ai/player',{playerId:PID,weights:W6,games:3,wins:1,simulations:1,book:{aaa:[1,1,1]}});
  assert.equal(r.status,200);const j=await r.json();assert.equal(j.ok,true);assert.equal(j.book,null);
  assert.equal(db.ai.get(PID).games,3);
  const g=await call(db,'GET','/api/ai/player?playerId='+PID);assert.equal(g.status,200);
  assert.equal((await g.json()).training.book,undefined);
});

test('origine non autorisée refusée',async()=>{
  const r=await worker.default.fetch(new Request('https://api.test/api/ai/player?playerId='+PID,{headers:{Origin:'https://evil.example'}}),env(fakeDb()));
  assert.equal(r.status,403);
});
