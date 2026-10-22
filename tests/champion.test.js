'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const AI=path.join(__dirname,'..','public','ai'),SUITE=path.join(AI,'suite.json'),CHAMP=path.join(AI,'champion.json');

function run(env){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'g2champ-'));fs.copyFileSync(SUITE,path.join(dir,'suite.json'));if(!env.NO_CHAMP)fs.copyFileSync(CHAMP,path.join(dir,'champion.json'));
  const r=spawnSync(process.execPath,[path.join(__dirname,'..','scripts','champion.js')],{encoding:'utf8',timeout:120000,
    env:{...process.env,G2_OUT_DIR:dir,G2_HOF_FILE:path.join(dir,'hof.json'),G2_PROPOSALS_URL:'off',G2_BUDGET_MIN:'0.1',G2_SCREEN:'4',G2_GATE:'8',G2_HOF_GAMES:'2',G2_SEED:'7',G2_BASE_GAMES:'6',...env}});
  return{dir,r};
}
test('champion : un seuil impossible ne promeut rien et n\'écrit aucun champion',()=>{
  const {dir,r}=run({G2_MIN_SCORE:'2'});
  assert.equal(r.status,0,r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'champion.json'),'utf8')).version,JSON.parse(fs.readFileSync(CHAMP,'utf8')).version,'le champion n\'a pas changé');
  assert.match(r.stdout,/0 promotion/);
});
test('champion : si une promotion a lieu, le fichier est valide et l\'ancien champion va au hall of fame',()=>{
  const {dir,r}=run({G2_MIN_SCORE:'0.01'});
  assert.equal(r.status,0,r.stderr);
  const f=path.join(dir,'champion.json');
  if(/0 promotion/.test(r.stdout))return;
  const c=JSON.parse(fs.readFileSync(f,'utf8'));
  assert.ok(c.version>JSON.parse(fs.readFileSync(CHAMP,'utf8')).version);assert.equal(c.w.length,6);assert.ok(c.w.every(v=>Number.isFinite(v)&&v>=0&&v<=100));
  assert.ok(c.report&&typeof c.report.score==='number');
  const hof=JSON.parse(fs.readFileSync(path.join(dir,'hof.json'),'utf8'));assert.ok(hof.length>=1);
});

test('champion : premier lancement sans champion = champion initial v1 (poids de référence + motifs)',()=>{
  const {dir,r}=run({NO_CHAMP:'1',G2_BASE_GAMES:'6',G2_MIN_SCORE:'2'});
  assert.equal(r.status,0,r.stderr);
  const c=JSON.parse(fs.readFileSync(path.join(dir,'champion.json'),'utf8'));
  assert.equal(c.version,1);assert.equal(c.report.from,'baseline');assert.equal(c.w.length,6);
});
