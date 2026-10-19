'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

/* D1 minimal en mémoire : juste les requêtes utilisées par le Worker pour l'identité et la limitation de fréquence. */
function fakeDb(){
  const owners=new Map(),limits=new Map(),profiles=new Map();
  return{owners,limits,profiles,prepare(sql){
    let args=[];
    const q={bind(...a){args=a;return q},
      async first(){
        if(/FROM player_owner/.test(sql)){const u=owners.get(args[0]);return u?{uid:u}:null}
        if(/INTO rate_limits/.test(sql)){const c=(limits.get(args[0])||0)+1;limits.set(args[0],c);return{c}}
        if(/FROM player_profiles/.test(sql))return profiles.get(args[0])||null;
        return null},
      async run(){
        if(/INSERT OR IGNORE INTO player_owner/.test(sql)){if(!owners.has(args[0]))owners.set(args[0],args[1]);return{meta:{changes:1}}}
        if(/INTO player_profiles/.test(sql)){profiles.set(args[0],{nickname:args[1]});return{meta:{changes:1}}}
        if(/INTO game_archives/.test(sql))return{meta:{changes:1}};
        return{meta:{changes:0}}}};
    return q}};
}
async function makeKeys(){
  const pair=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk=await crypto.subtle.exportKey('jwk',pair.publicKey);jwk.kid='k1';jwk.alg='RS256';
  return{pair,jwks:JSON.stringify({keys:[jwk]})};
}
const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
async function token(pair,claims={},kid='k1'){
  const now=Math.floor(Date.now()/1000),p={aud:'proj',iss:'https://securetoken.google.com/proj',sub:'uid-A',iat:now,exp:now+3600,...claims};
  const head=enc({alg:'RS256',kid,typ:'JWT'}),body=enc(p),sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',pair.privateKey,Buffer.from(head+'.'+body));
  return head+'.'+body+'.'+Buffer.from(sig).toString('base64url');
}
const ORIGIN='https://app.example';
const req=(path,{method='GET',body,tok,headers={}}={})=>new Request('https://api.test'+path,{method,headers:{Origin:ORIGIN,'Content-Type':'application/json',...(tok?{Authorization:'Bearer '+tok}:{}),...headers},body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});

test('avec FIREBASE_PROJECT_ID, une route privée sans jeton est refusée (401)',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {jwks}=await makeKeys(),env={DB:fakeDb(),ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const r=await W.default.fetch(req('/api/profile?playerId=player_123456'),env);
  assert.equal(r.status,401);
});

test('un jeton valide passe ; faux (autre projet, expiré, mauvaise clé, falsifié) est refusé',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),other=await makeKeys(),env={FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  assert.deepEqual(await W.verifyFirebaseToken(await token(pair),env),{uid:'uid-A'});
  assert.equal(await W.verifyFirebaseToken(await token(pair,{aud:'autre'}),env),null);
  assert.equal(await W.verifyFirebaseToken(await token(pair,{iss:'https://evil'}),env),null);
  assert.equal(await W.verifyFirebaseToken(await token(pair,{exp:Math.floor(Date.now()/1000)-10}),env),null);
  assert.equal(await W.verifyFirebaseToken(await token(other.pair),env),null,'signé par une autre clé');
  assert.equal(await W.verifyFirebaseToken(await token(pair,{},'inconnu'),env),null);
  const t=await token(pair),parts=t.split('.');parts[1]=enc({aud:'proj',iss:'https://securetoken.google.com/proj',sub:'uid-B',exp:9999999999});
  assert.equal(await W.verifyFirebaseToken(parts.join('.'),env),null,'charge utile modifiée');
  assert.equal(await W.verifyFirebaseToken('abc',env),null);
});

test('un playerId réclamé par un compte ne peut pas être utilisé par un autre (403)',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),db=fakeDb(),env={DB:db,ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const a=await token(pair,{sub:'uid-A'}),b=await token(pair,{sub:'uid-B'});
  const put=(tok)=>W.default.fetch(req('/api/profile',{method:'PUT',tok,body:{playerId:'player_123456',nickname:'Zoé'}}),env);
  assert.equal((await put(a)).status,200);
  assert.equal((await put(b)).status,403,'autre compte refusé');
  assert.equal((await put(a)).status,200,'le propriétaire peut continuer');
  const get=await W.default.fetch(req('/api/profile?playerId=player_123456',{tok:b}),env);
  assert.equal(get.status,403,'lecture refusée aussi');
});

test('sans FIREBASE_PROJECT_ID le comportement historique est conservé',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const env={DB:fakeDb(),ALLOWED_ORIGINS:ORIGIN};
  const r=await W.default.fetch(req('/api/profile',{method:'PUT',body:{playerId:'player_123456',nickname:'X'}}),env);
  assert.equal(r.status,200);
});

test('un corps trop gros est refusé sans être lu en entier (Content-Length puis flux)',async()=>{
  const W=await import('../cloudflare/worker.mjs');
  const big=new Request('https://x.test/',{method:'POST',headers:{'Content-Length':'999999'},body:'{}'});
  assert.equal((await W.readBody(big,4096)).error,413);
  /* sans Content-Length fiable : flux de 200 Ko, plafond 4 Ko → coupé en cours de lecture */
  let pulled=0;const stream=new ReadableStream({pull(c){if(pulled>=50){c.close();return}pulled++;c.enqueue(new Uint8Array(4096))}});
  const chunked=new Request('https://x.test/',{method:'POST',body:stream,duplex:'half'});
  const r=await W.readBody(chunked,4096);
  assert.equal(r.error,413);assert.ok(pulled<10,'lecture interrompue après '+pulled+' blocs sur 50');
  const ok=await W.readBody(new Request('https://x.test/',{method:'POST',body:'{"a":1}'}),4096);
  assert.equal(ok.text,'{"a":1}');
});

test('limitation de fréquence atomique : au-delà de 30 écritures/minute → 429',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const env={DB:fakeDb(),ALLOWED_ORIGINS:ORIGIN};let last;
  const calls=[];for(let i=0;i<35;i++)calls.push(W.default.fetch(req('/api/profile',{method:'PUT',body:{playerId:'player_123456',nickname:'A'},headers:{'CF-Connecting-IP':'1.2.3.4'}}),env));
  const codes=(await Promise.all(calls)).map(r=>r.status);
  assert.equal(codes.filter(c=>c===200).length,30);assert.equal(codes.filter(c=>c===429).length,5);
});

test('archives : un abandon est pris en compte dans le résultat (audit 2.4)',async()=>{
  const {validate}=await import('../cloudflare/worker.mjs');
  /* partie où le joueur 0 mène 1-0 (même séquence que les autres tests) */
  const moves=[[5,4],[5,5],[4,5],[0,0],[6,5],[0,2],[5,6]],base={gameId:'ABCDE',playerId:'player_123',w:11,h:15,n:2,tm:false,mode:'online',moves};
  assert.equal(validate(base).result,'win');
  assert.equal(validate({...base,forfeit:0}).result,'loss','le joueur 0 a abandonné : défaite malgré l\'avance');
  const g=validate({...base,forfeit:1});assert.equal(g.result,'win');assert.equal(g.forfeit,1);
  assert.equal(validate({...base,forfeit:5}),null);
  assert.equal(validate({...base,forfeit:'0'}),null);
  assert.equal(validate({...base,mode:'ai',forfeit:1}),null,'un abandon n\'existe qu\'en ligne');
});
