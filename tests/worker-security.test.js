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

test('sans FIREBASE_PROJECT_ID : fail-closed par défaut (503), legacy opt-in via G2_LEGACY_NO_AUTH (200)',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  // 1. Fail-closed par défaut : une route privée sans Firebase n'est plus accessible.
  const env1={DB:fakeDb(),ALLOWED_ORIGINS:ORIGIN};
  const r1=await W.default.fetch(req('/api/profile',{method:'PUT',body:{playerId:'player_123456',nickname:'X'}}),env1);
  assert.equal(r1.status,503,'fail-closed : authentification indisponible');
  // 2. Opt-in legacy explicite : les installations isolées retrouvent le comportement historique.
  const env2={DB:fakeDb(),ALLOWED_ORIGINS:ORIGIN,G2_LEGACY_NO_AUTH:'1'};
  const r2=await W.default.fetch(req('/api/profile',{method:'PUT',body:{playerId:'player_123456',nickname:'X'}}),env2);
  assert.equal(r2.status,200,'opt-in legacy rétablit l\'accès historique');
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
  // G2_LEGACY_NO_AUTH=1 : on isole le test du rate-limit (l'auth est couverte par les autres tests).
  const env={DB:fakeDb(),ALLOWED_ORIGINS:ORIGIN,G2_LEGACY_NO_AUTH:'1'};
  const calls=[];for(let i=0;i<35;i++)calls.push(W.default.fetch(req('/api/profile',{method:'PUT',body:{playerId:'player_123456',nickname:'A'},headers:{'CF-Connecting-IP':'1.2.3.4'}}),env));
  const codes=(await Promise.all(calls)).map(r=>r.status);
  assert.equal(codes.filter(c=>c===200).length,30);assert.equal(codes.filter(c=>c===429).length,5);
});

test('rateOk fail-closed : panne D1 → 429 (et non fail-open qui laisserait passer tout le trafic)',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  // D1 qui jette sur toute requête : rateOk doit retourner false (fail-closed).
  const brokenDb={prepare(){return{bind(){return{async first(){throw new Error('D1 indisponible')},async run(){throw new Error('D1 indisponible')}}}}}};
  const env={DB:brokenDb,ALLOWED_ORIGINS:ORIGIN,G2_LEGACY_NO_AUTH:'1'};
  const r=await W.default.fetch(req('/api/profile',{method:'PUT',body:{playerId:'player_123456',nickname:'A'},headers:{'CF-Connecting-IP':'1.2.3.4'}}),env);
  assert.equal(r.status,429,'panne D1 → 429 plutôt que fail-open');
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

/* ---- Cerveau IA synchronisé : verrou optimiste (version) ---- */
function brainDb(){
  const base=fakeDb(),rows=new Map(),orig=base.prepare.bind(base);
  return Object.assign(base,{rows,prepare(sql){
    const q=orig(sql);
    if(!/player_brain/.test(sql)||/CREATE TABLE/.test(sql))return q;
    let args=[];
    const w={bind(...a){args=a;q.bind(...a);return w},
      async first(){const r=rows.get(args[0]);return r?{brain_json:r.json,version:r.version,updated_at:1}:null},
      async run(){
        if(/INSERT OR IGNORE INTO player_brain/.test(sql)){if(rows.has(args[0]))return{meta:{changes:0}};rows.set(args[0],{json:args[1],version:1});return{meta:{changes:1}}}
        if(/UPDATE player_brain/.test(sql)){const r=rows.get(args[1]);if(!r||r.version!==args[2])return{meta:{changes:0}};r.json=args[0];r.version++;return{meta:{changes:1}}}
        return{meta:{changes:0}}}};
    return w}});
}
const goodBrain=(extra={})=>({v:1,at:1,w:[1,2,3,4,5,6],games:3,simulations:4,book:{k:[1,1,1,1]},...extra});

test('cerveau IA : PUT puis GET ; version périmée refusée (409) avec l\'état courant ; jamais d\'écrasement silencieux',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),db=brainDb(),env={DB:db,ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const tok=await token(pair,{sub:'uid-A'}),id='player_123456';
  const put=(base,brain)=>W.default.fetch(req('/api/ai/brain',{method:'PUT',tok,body:{playerId:id,base,brain}}),env);
  let r=await put(0,goodBrain());assert.equal(r.status,200);assert.equal((await r.json()).version,1);
  r=await W.default.fetch(req('/api/ai/brain?playerId='+id,{tok}),env);
  const g=await r.json();assert.equal(g.version,1);assert.equal(g.brain.simulations,4);
  r=await put(1,goodBrain({simulations:9}));assert.equal(r.status,200);assert.equal((await r.json()).version,2);
  r=await put(1,goodBrain({simulations:99}));assert.equal(r.status,409,'base périmée');
  const c=await r.json();assert.equal(c.conflict,true);assert.equal(c.version,2);assert.equal(c.brain.simulations,9);
  r=await put(0,goodBrain());assert.equal(r.status,409,'création sur ligne existante refusée');
});
test('cerveau IA : sans jeton 401 ; autre compte 403 ; contenu invalide 422',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),db=brainDb(),env={DB:db,ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const a=await token(pair,{sub:'uid-A'}),b=await token(pair,{sub:'uid-B'}),id='player_123456';
  assert.equal((await W.default.fetch(req('/api/ai/brain?playerId='+id),env)).status,401);
  assert.equal((await W.default.fetch(req('/api/ai/brain',{method:'PUT',tok:a,body:{playerId:id,base:0,brain:goodBrain()}}),env)).status,200);
  assert.equal((await W.default.fetch(req('/api/ai/brain?playerId='+id,{tok:b}),env)).status,403,'le cerveau d\'un autre est inaccessible');
  assert.equal((await W.default.fetch(req('/api/ai/brain',{method:'PUT',tok:b,body:{playerId:id,base:1,brain:goodBrain()}}),env)).status,403);
  for(const bad of [goodBrain({w:[1,2,3]}),goodBrain({book:{['x'.repeat(300)]:[1,1,1,1]}}),goodBrain({book:{k:[1,'a',1,1]}}),goodBrain({games:-1}),{v:2},goodBrain({pop:[1,2]})]){
    const r=await W.default.fetch(req('/api/ai/brain',{method:'PUT',tok:a,body:{playerId:id,base:1,brain:bad}}),env);
    assert.equal(r.status,422,JSON.stringify(bad).slice(0,60));
  }
});
test('cerveau IA : corps trop gros refusé (413)',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),env={DB:brainDb(),ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const tok=await token(pair),big='{"playerId":"player_123456","base":0,"brain":{"v":1,"pad":"'+'a'.repeat(1000000)+'"}}';
  const r=await W.default.fetch(req('/api/ai/brain',{method:'PUT',tok,body:big}),env);
  assert.equal(r.status,413);
});

/* ---- Liaison d'appareils par code à usage unique ---- */
function linkDb(){
  const base=brainDb(),orig=base.prepare.bind(base),codes=new Map(),links=new Set();
  return Object.assign(base,{codes,links,prepare(sql){
    if(!/link_codes|player_links/.test(sql)||/CREATE TABLE/.test(sql))return orig(sql);
    let args=[];
    const w={bind(...a){args=a;return w},
      async first(){
        if(/FROM link_codes/.test(sql)){const c=codes.get(args[0]);return c&&c.exp>Date.now()/1000?{player_id:c.player}:null}
        if(/FROM player_links/.test(sql))return links.has(args[0]+'|'+args[1])?{uid:args[1]}:null;
        return null},
      async run(){
        if(/DELETE FROM link_codes WHERE player_id/.test(sql)){for(const [k,v] of codes)if(v.player===args[0])codes.delete(k);return{meta:{changes:1}}}
        if(/INSERT INTO link_codes/.test(sql)){codes.set(args[0],{player:args[1],exp:Date.now()/1000+args[2]});return{meta:{changes:1}}}
        if(/DELETE FROM link_codes WHERE code/.test(sql)){codes.delete(args[0]);return{meta:{changes:1}}}
        if(/INSERT OR IGNORE INTO player_links/.test(sql)){links.add(args[0]+'|'+args[1]);return{meta:{changes:1}}}
        return{meta:{changes:0}}}};
    return w}});
}
test('liaison : le code donne à un 2e appareil (autre uid) accès au même joueur, une seule fois',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),db=linkDb(),env={DB:db,ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const phone=await token(pair,{sub:'uid-phone'}),pc=await token(pair,{sub:'uid-pc'}),id='player_123456';
  const call=(path,tok,body,method='POST')=>W.default.fetch(req(path,{method,tok,body}),env);
  assert.equal((await call('/api/ai/brain',phone,{playerId:id,base:0,brain:goodBrain({simulations:50})},'PUT')).status,200);
  assert.equal((await call('/api/ai/brain?playerId='+id,pc,undefined,'GET')).status,403,'avant liaison : refusé');
  const made=await (await call('/api/link/create',phone,{playerId:id})).json();
  assert.match(made.code,/^[A-Z2-9]{8}$/);
  assert.equal((await call('/api/link/create',pc,{playerId:id})).status,403,'un autre appareil ne peut pas générer de code');
  const red=await call('/api/link/redeem',pc,{code:made.code.toLowerCase().replace(/^(.{4})/,'$1-')});
  assert.equal(red.status,200);assert.equal((await red.json()).playerId,id);
  const got=await (await call('/api/ai/brain?playerId='+id,pc,undefined,'GET')).json();
  assert.equal(got.brain.simulations,50,'le PC lit le cerveau du téléphone');
  assert.equal((await call('/api/link/redeem',await token(pair,{sub:'uid-x'}),{code:made.code})).status,404,'usage unique');
  assert.equal((await call('/api/ai/brain?playerId='+id,await token(pair,{sub:'uid-x'}),undefined,'GET')).status,403,'un tiers reste exclu');
});
test('liaison : code inconnu 404, sans jeton 401, essais limités (429)',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),env={DB:linkDb(),ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const tok=await token(pair);
  assert.equal((await W.default.fetch(req('/api/link/redeem',{method:'POST',body:{code:'AAAAAAAA'}}),env)).status,401);
  for(let i=0;i<10;i++)assert.equal((await W.default.fetch(req('/api/link/redeem',{method:'POST',tok,body:{code:'AAAAAAAA'}}),env)).status,404);
  assert.equal((await W.default.fetch(req('/api/link/redeem',{method:'POST',tok,body:{code:'AAAAAAAA'}}),env)).status,429);
});

/* ---- Propositions d'IA au champion central ---- */
function propDb(){
  const base=fakeDb(),orig=base.prepare.bind(base),rows=new Map();
  return Object.assign(base,{rows,prepare(sql){
    if(!/ai_proposals/.test(sql)||/CREATE TABLE/.test(sql))return orig(sql);
    let args=[];
    const w={bind(...a){args=a;return w},
      async all(){return{results:[...rows.values()].sort((x,y)=>y.sim-x.sim).slice(0,20).map(r=>({json:r.json,sim:r.sim}))}},
      async run(){rows.set(args[0],{json:args[1],sim:args[2]});return{meta:{changes:1}}}};
    return w}});
}
const goodProp=(o={})=>({playerId:'player_123456',weights:[1,2,3,4,5,6],simulations:500,book:{k:[7,5,6,1]},...o});
test('propositions : un joueur authentifié propose (1/heure), la lecture publique est anonyme et sans Origin',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),db=propDb(),env={DB:db,ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const tok=await token(pair);
  const post=b=>W.default.fetch(req('/api/ai/proposal',{method:'POST',tok,body:b}),env);
  assert.equal((await post(goodProp())).status,200);
  assert.equal((await post(goodProp({simulations:900}))).status,429,'une proposition par heure');
  const r=await W.default.fetch(new Request('https://api.test/api/ai/proposals'),env); // pas d'Origin : entraînement central
  assert.equal(r.status,200);
  const data=await r.json();assert.equal(data.proposals.length,1);assert.deepEqual(data.proposals[0].w,[1,2,3,4,5,6]);
  assert.ok(!JSON.stringify(data).includes('player_123456'),'aucun identifiant de joueur exposé');
  assert.equal((await W.default.fetch(new Request('https://api.test/api/ai/proposal',{method:'POST',body:'{}'}),env)).status,403,'l\'écriture exige toujours une origine autorisée');
});
test('propositions : sans jeton 401 ; contenu invalide 422 (poids, trop peu de simulations, livre énorme)',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),env={DB:propDb(),ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const tok=await token(pair);
  assert.equal((await W.default.fetch(req('/api/ai/proposal',{method:'POST',body:goodProp()}),env)).status,401);
  const big={};for(let i=0;i<400;i++)big['k'+i]=[1,1,1,1];
  for(const bad of [goodProp({weights:[1,2,3]}),goodProp({weights:[1,2,3,4,5,999]}),goodProp({simulations:5}),goodProp({book:big}),goodProp({book:{k:[1,'x',1,1]}})]){
    assert.equal((await W.default.fetch(req('/api/ai/proposal',{method:'POST',tok,body:bad}),env)).status,422);
  }
});

/* ---- Audit section 5 : 422 explicite avec code de raison ---- */
test('audit 422 : un cerveau avec poids hors borne renvoie un code raison stable',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),env={DB:brainDb(),ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const tok=await token(pair),id='player_123456';
  // Poids hors borne : 150 > 100. Le client corrigé (clamp) n'enverra plus ça, mais le serveur doit refuser.
  const r=await W.default.fetch(req('/api/ai/brain',{method:'PUT',tok,body:{playerId:id,base:0,brain:goodBrain({w:[1,2,3,4,5,150]})}}),env);
  assert.equal(r.status,422);
  const b=await r.json();
  assert.equal(b.reason,'w_invalid','le code raison doit être stable et explicite');
  assert.ok(!JSON.stringify(b).includes('150'),'la valeur rejetée ne doit pas être divulguée');
});
test('audit 422 : population invalide renvoie pop_length ou pop_w_invalid',async()=>{
  const W=await import('../cloudflare/worker.mjs');W._resetForTests();
  const {pair,jwks}=await makeKeys(),env={DB:brainDb(),ALLOWED_ORIGINS:ORIGIN,FIREBASE_PROJECT_ID:'proj',FIREBASE_JWKS:jwks};
  const tok=await token(pair),id='player_123456';
  // pop de longueur 7 au lieu de 8
  const r1=await W.default.fetch(req('/api/ai/brain',{method:'PUT',tok,body:{playerId:id,base:0,brain:{...goodBrain(),pop:Array.from({length:7},()=>({w:[1,2,3,4,5,6]}))}}}),env);
  assert.equal(r1.status,422);
  const b1=await r1.json();assert.equal(b1.reason,'pop_length');
  // pop avec un chromosome dont un poids est négatif
  const r2=await W.default.fetch(req('/api/ai/brain',{method:'PUT',tok,body:{playerId:id,base:0,brain:{...goodBrain(),pop:Array.from({length:8},(_,i)=>({w:i===0?[1,2,3,4,5,-5]:[1,2,3,4,5,6]}))}}}),env);
  assert.equal(r2.status,422);
  const b2=await r2.json();assert.equal(b2.reason,'pop_w_invalid');
});
