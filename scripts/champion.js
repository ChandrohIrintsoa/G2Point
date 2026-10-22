/* Entraînement central du champion : npm run champion
   Le champion est le moteur d'IA commun à tous les joueurs (public/ai/champion.json, lecture seule côté joueur).
   Des candidats (mutations, propositions de joueurs, apprentissage par auto-parties) ne deviennent champion que s'ils passent
   la porte de vérification (public/js/verify.js) : match contre le champion, banque de techniques, versions anciennes.
   Les propositions des joueurs ne sont jamais crues sur parole : elles sont jouées et jugées comme n'importe quel candidat.
   Variables : G2_BUDGET_MIN (15), G2_OUT_DIR (public/ai), G2_DRY=1 (n'écrit rien), G2_PROPOSALS_URL, G2_SEED. */
const fs=require('fs'),path=require('path');
const E=require('../public/js/engine.js'),T=require('../public/js/trainer.js'),V=require('../public/js/verify.js'),B=require('../public/js/brain.js');
const ROOT=path.join(__dirname,'..');
const OUT=process.env.G2_OUT_DIR?path.resolve(process.env.G2_OUT_DIR):path.join(ROOT,'public','ai');
const HOF_FILE=process.env.G2_HOF_FILE?path.resolve(process.env.G2_HOF_FILE):path.join(ROOT,'ai','hof.json');
const budgetMs=Math.max(.05,Number(process.env.G2_BUDGET_MIN)||15)*60000,dry=process.env.G2_DRY==='1';
const seed0=Number(process.env.G2_SEED)||Math.floor(Date.now()/36e5);
const cfg={screenGames:+process.env.G2_SCREEN||10,gateGames:+process.env.G2_GATE||80,hofGames:+process.env.G2_HOF_GAMES||10,minScore:+process.env.G2_MIN_SCORE||.56,techTol:.02,minHof:.5,hofKeep:3,suiteSize:40,sizes:[[9,9],[11,11]]};
const readJson=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch{return d}};
const validW=w=>Array.isArray(w)&&w.length===6&&w.every(v=>Number.isFinite(v)&&v>=0&&v<=100);
const params=c=>({w:c.w,book:c.book,sbook:c.sbook,antiBook:c.antiBook,antiSBook:c.antiSBook});
const trimBook=(b,n)=>{const ks=Object.keys(b||{});if(ks.length<=n)return b||{};ks.sort((p,q)=>(b[q][0]||0)-(b[p][0]||0));const o={};ks.slice(0,n).forEach(k=>o[k]=b[k]);return o};

async function fetchProposals(){
  const url=process.env.G2_PROPOSALS_URL||'https://g2point-api.irintsoachandroh.workers.dev/api/ai/proposals';
  if(process.env.G2_PROPOSALS_URL==='off')return[];
  try{
    const res=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    return(Array.isArray(data.proposals)?data.proposals:[]).filter(p=>validW(p.w)).slice(0,30).map(p=>({w:p.w,book:B.cleanBook(p.book),simulations:Math.max(0,+p.simulations||0)}));
  }catch(e){console.log('Propositions indisponibles :',e.message);return[]}
}

function loadSuite(){
  const f=path.join(OUT,'suite.json');let s=readJson(f,null);
  if(!s||!Array.isArray(s.entries)||s.entries.length<cfg.suiteSize){
    console.log('Construction de la banque de techniques…');
    s={schema:1,entries:V.buildSuite(E,T,{seed:20261021,n:cfg.suiteSize,size:[9,9]})};
    if(!dry){fs.mkdirSync(OUT,{recursive:true});fs.writeFileSync(f,JSON.stringify(s))}
  }
  return s.entries;
}

/* auto-parties : le candidat joue contre le champion et contre les niveaux fixes ; les victoires alimentent son livre */
function selfLearn(cand,base,games,seed){
  let played=0;
  const opponents=[{params:params(base),lvl:1},{params:null,lvl:0},{params:null,lvl:1},{params:params(base),lvl:2}];
  for(let i=0;i<games;i++){
    const o=opponents[i%opponents.length],size=cfg.sizes[i%cfg.sizes.length],swap=i%2===1;
    const r=T.playGame(E,{a:{params:params(cand),lvl:1},b:{params:o.params||{},lvl:o.lvl},swap,seed:(seed*31+i*7)|0,size});
    if(!r.complete)continue;played++;
    if(r.winner===0){const seat=r.seatA;E.learn(cand.book,r.moves,r.w,r.h,2,false,[seat],seat,cand.sbook)}
  }
  return played;
}

async function main(){
  const t0=Date.now(),log=[],say=m=>{console.log(m);log.push(m)};
  const prev=readJson(path.join(OUT,'champion.json'),null);
  let champ=prev&&validW(prev.w)?{...prev}:{schema:1,version:0,simulations:0,w:E.DEFAULT_W.slice(),book:{},sbook:{},antiBook:{},antiSBook:{}};
  for(const k of ['book','sbook','antiBook','antiSBook'])champ[k]=B.cleanBook(champ[k]);
  const suite=loadSuite(),hofAll=readJson(HOF_FILE,[]);
  const proposals=await fetchProposals();say(`Champion v${champ.version} ; ${suite.length} techniques ; ${hofAll.length} anciens champions ; ${proposals.length} propositions de joueurs`);
  const hofParams=()=>hofAll.slice(-cfg.hofKeep).map(h=>({name:'v'+h.version,params:{w:h.w}}));
  let round=0,promoted=0,tried=0,sims=0;const reports=[];
  /* Premier champion : poids de référence + motifs appris en auto-parties. Rien à battre encore ; les suivants devront le battre. */
  if(champ.version===0){
    const cand={w:champ.w.slice(),book:{},sbook:{},antiBook:{},antiSBook:{}};
    const n=selfLearn(cand,champ,+process.env.G2_BASE_GAMES||160,seed0);
    champ={schema:1,version:1,at:Date.now(),simulations:n,w:cand.w,c:cand.w,book:trimBook(cand.book,1500),sbook:trimBook(cand.sbook,1500),antiBook:{},antiSBook:{},report:{from:'baseline',games:n}};
    promoted++;say(`Champion initial v1 : poids de référence + ${Object.keys(champ.book).length} motifs appris en ${n} auto-parties`);
  }
  while(Date.now()-t0<budgetMs){
    round++;const seed=(seed0*1000+round)|0,rnd=E.rng(seed);
    /* 1) candidats : mutations du champion + propositions de joueurs (poids et livre) */
    const cands=[];
    for(let i=0;i<5;i++)cands.push({src:'mutation',cand:{w:E.mutate(champ.w,rnd),book:{...champ.book},sbook:{...champ.sbook},antiBook:{...champ.antiBook},antiSBook:{...champ.antiSBook}}});
    if(round===1)for(const p of proposals.slice(0,8))cands.push({src:'proposition',cand:{w:p.w,book:B.mergeBook(champ.book,p.book),sbook:{...champ.sbook},antiBook:{...champ.antiBook},antiSBook:{...champ.antiSBook}}});
    /* 2) criblage rapide contre le champion */
    let best=null;
    for(const c of cands){
      if(Date.now()-t0>=budgetMs)break;tried++;
      let sc=0,n=0;for(const size of cfg.sizes){const m=V.playMatch(E,T,params(c.cand),params(champ),{games:cfg.screenGames/2,seed:seed+tried,size});sc+=m.score*m.n;n+=m.n;sims+=m.n}
      c.screen=n?sc/n:.5;if(!best||c.screen>best.screen)best=c;
    }
    if(!best||best.screen<.5)continue;
    /* 3) apprentissage par auto-parties, puis porte complète */
    sims+=selfLearn(best.cand,champ,cfg.gateGames/2,seed);
    let gateOk=true,stats=null;
    const g1=V.gate(E,T,params(best.cand),params(champ),{games:cfg.gateGames/2,hofGames:cfg.hofGames/2,minScore:cfg.minScore,minHof:cfg.minHof,techTol:cfg.techTol,size:cfg.sizes[0],seed,suite,hof:hofParams()});
    const g2=V.gate(E,T,params(best.cand),params(champ),{games:cfg.gateGames/2,hofGames:0,minScore:cfg.minScore,techTol:1,size:cfg.sizes[1],seed:seed+1,suite:[],hof:[]});
    sims+=cfg.gateGames;stats={g9:g1.stats,g11:g2.stats.match};
    const total=(g1.stats.match.score*g1.stats.match.n+g2.stats.match.score*g2.stats.match.n)/Math.max(1,g1.stats.match.n+g2.stats.match.n);
    const reasons=[...g1.reasons.filter(r=>!/^match contre la référence/.test(r)),...(total<cfg.minScore?[`match global ${total.toFixed(2)} < ${cfg.minScore}`]:[])];
    gateOk=reasons.length===0;
    reports.push({round,src:best.src,screen:+best.screen.toFixed(2),score:+total.toFixed(3),pass:gateOk,reasons});
    if(gateOk){
      hofAll.push({version:champ.version,w:champ.w});while(hofAll.length>cfg.hofKeep+2)hofAll.shift();
      champ={schema:1,version:champ.version+1,at:Date.now(),simulations:champ.simulations+sims,w:best.cand.w,c:best.cand.w,
        book:trimBook(best.cand.book,1500),sbook:trimBook(best.cand.sbook,1500),antiBook:trimBook(best.cand.antiBook,1500),antiSBook:trimBook(best.cand.antiSBook,1500),
        report:{from:best.src,score:+total.toFixed(3),tech:g1.stats.tech,hof:g1.stats.hof}};
      sims=0;promoted++;say(`Round ${round} : PROMU v${champ.version} (${best.src}, score ${total.toFixed(2)}, techniques ${g1.stats.tech.cand}/${g1.stats.tech.base})`);
    }else say(`Round ${round} : refusé (${best.src}) — ${reasons.join(' ; ')||'?'}`);
  }
  say(`Terminé : ${tried} candidats évalués, ${promoted} promotion(s) en ${((Date.now()-t0)/1000).toFixed(0)} s`);
  if(promoted&&!dry){
    fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(path.dirname(HOF_FILE),{recursive:true});
    fs.writeFileSync(path.join(OUT,'champion.json'),JSON.stringify(champ));
    fs.writeFileSync(HOF_FILE,JSON.stringify(hofAll));
    fs.writeFileSync(path.join(path.dirname(HOF_FILE),'last-report.json'),JSON.stringify({at:Date.now(),version:champ.version,tried,promoted,reports:reports.slice(-30)},null,1));
  }
  if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`promoted=${promoted>0}\nversion=${champ.version}\n`);
  return{champ,promoted,tried,reports};
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1)});
module.exports={main};
