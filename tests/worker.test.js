const test=require('node:test'),assert=require('node:assert/strict');

const sample=(overrides={})=>({
  gameId:'ABCDE',playerId:'player_123',w:11,h:15,n:2,tm:false,mode:'ai',
  result:'loss',
  moves:[[5,4],[5,5],[4,5],[0,0],[6,5],[0,2],[5,6]],
  ...overrides
});

test('les codes de salon Firestore de 5 caractères sont acceptés et le résultat est recalculé',async()=>{
  const {validate}=await import('../cloudflare/worker.mjs');
  const game=validate(sample({result:'loss'}));
  assert.ok(game);
  assert.equal(game.gameId,'ABCDE');
  assert.equal(game.result,'win');
  assert.deepEqual(game.sc,[1,0]);
});

test('validate rejette les identifiants, dimensions et types invalides',async()=>{
  const {validate}=await import('../cloudflare/worker.mjs');
  assert.equal(validate(sample({gameId:'ABCD'})),null);
  assert.equal(validate(sample({playerId:'x'})),null);
  assert.equal(validate(sample({w:'11'})),null);
  assert.equal(validate(sample({h:'15'})),null);
  assert.equal(validate(sample({tm:'false'})),null);
  assert.equal(validate(sample({n:'2'})),null);
});

test('un plateau sans capture est classé nul indépendamment du résultat envoyé',async()=>{
  const {validate}=await import('../cloudflare/worker.mjs');
  const game=validate(sample({result:'win',moves:[[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]]}));
  assert.ok(game);
  assert.equal(game.result,'draw');
});

test('la mémoire IA partagée reste désactivée tant que les archives ne sont pas fiables',async()=>{
  const {handleAi}=await import('../cloudflare/worker.mjs');
  const response=await handleAi({},{}),payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.schema,3);
  assert.deepEqual(payload.book,{});
  assert.equal(payload.learning,false);
});
