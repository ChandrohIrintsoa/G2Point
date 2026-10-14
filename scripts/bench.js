/* Tournoi reproductible de l'IA. Usage : G2_BENCH_GAMES=100 npm run bench */
const fs=require('node:fs'),path=require('node:path'),E=require('../public/js/engine.js');
const LEVELS=[0,1,2,3],NAMES=['Facile','Normal','Difficile','Champion'];
const gamesPerPair=Math.max(1,Math.min(1000,Number(process.env.G2_BENCH_GAMES)||10));
const maxTurns=Math.max(30,Math.min(300,Number(process.env.G2_BENCH_MAX_TURNS)||120));
const pairs=[];
for(let a=0;a<LEVELS.length;a++)for(let b=a+1;b<LEVELS.length;b++)pairs.push([a,b]);
const now=()=>performance.now();
function play(seed,levelA,levelB,swap){
  const s=E.create(11,15,2,false),times=[[],[]],moves=[];
  const seatA=swap?1:0,seatB=1-seatA,start=now();
  while(s.free>0&&moves.length<maxTurns){
    const actor=s.cur,level=actor===seatA?levelA:levelB,t0=now();
    const move=E.aiMove(s,E.rng((seed^Math.imul(moves.length+1,0x9e3779b1))|0),{lvl:level});
    times[actor].push(now()-t0);
    if(!move||!E.apply(s,move))break;
    moves.push(move);
  }
  const elapsed=now()-start,win=s.sc[seatA]>s.sc[seatB]?0:s.sc[seatA]<s.sc[seatB]?1:2;
  return{win,moves:moves.length,elapsed,timesA:times[seatA],timesB:times[seatB],scores:s.sc.slice(),complete:s.free===0};
}
const quantile=(arr,q)=>{if(!arr.length)return 0;const a=arr.slice().sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor((a.length-1)*q))]};
const results=[];
for(const [a,b] of pairs){
  const stat={a:NAMES[a],b:NAMES[b],games:gamesPerPair,aWins:0,bWins:0,draws:0,completed:0,moves:[],elapsed:[],times:[]};
  for(let i=0;i<gamesPerPair;i++){
    const g=play((0x475032+i*7919+a*131+b*977)|0,a,b,i%2===1);
    if(g.win===0)stat.aWins++;else if(g.win===1)stat.bWins++;else stat.draws++;
    if(g.complete)stat.completed++;
    stat.moves.push(g.moves);stat.elapsed.push(g.elapsed);stat.times.push(...g.timesA,...g.timesB);
  }
  stat.aScoreRate=+((stat.aWins+.5*stat.draws)/gamesPerPair).toFixed(4);
  stat.meanMoves=+(stat.moves.reduce((x,y)=>x+y,0)/stat.moves.length).toFixed(2);
  stat.meanGameSeconds=+(stat.elapsed.reduce((x,y)=>x+y,0)/stat.elapsed.length/1000).toFixed(2);
  stat.meanMoveMs=+(stat.times.reduce((x,y)=>x+y,0)/Math.max(1,stat.times.length)).toFixed(2);
  stat.p95MoveMs=+quantile(stat.times,.95).toFixed(2);
  delete stat.moves;delete stat.elapsed;delete stat.times;
  results.push(stat);
  console.log(`${stat.a} vs ${stat.b}: ${stat.aWins}-${stat.bWins}-${stat.draws}, score ${(stat.aScoreRate*100).toFixed(1)} %, p95 ${stat.p95MoveMs} ms`);
}
const output={schema:1,createdAt:new Date().toISOString(),commit:process.env.GITHUB_SHA||null,seedBase:0x475032,gamesPerPair,maxTurns,board:'11x15',results};
const outDir=path.join(__dirname,'..','bench');fs.mkdirSync(outDir,{recursive:true});
const out=path.join(outDir,'results.json');fs.writeFileSync(out,JSON.stringify(output,null,2)+String.fromCharCode(10));
console.log('Résultats écrits dans '+out);
