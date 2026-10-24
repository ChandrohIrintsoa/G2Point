/* Ablation du niveau Champion : npm run ablation   (G2_ABL_GAMES=20 parties par comparaison, G2_ABL_SIZE=9)
   Mêmes graines, sièges alternés. Compare le Champion complet à 7 variantes (audit section 7C) :
     1. (référence) complet                              — baseline
     2. sans raffinement « bandit UCT »    (noMcts)      — mesure l'apport de mctsRefine()
     3. sans carte prédictive              (predictive)  — mesure l'apport de forecastOpponent/predictiveMap
     4. sans livres de motifs              (noBooks)     — mesure l'apport du book + sbook appris
     5. sans anti-motifs                   (noAnti)      — mesure l'apport de l'antiBook (anti-patterns humains)
     6. plus de candidats (rayon 8 vs 4)   (moreCands)   — mesure le coût/bénéfice d'un scan spatial élargi
     7. budget de recherche doublé        (biggerBudget)— mesure si l'IA est limitée par le temps ou l'algo
     8. sans recherche profonde            (noDeep)      — mesure l'apport de searchBeam (vs heuristique seule)

   Audit P1 : IC95 basé sur la variance empirique de X ∈ {0, 0.5, 1} (W/D/L), pas Wilson inadapté aux nulles.
   Audit P2 : un rapport JSON est archivé dans bench/ablation-<commit>-<ts>.json avec commit, seeds, scores, IC. */
const fs=require('node:fs'),path=require('node:path');
const E=require('../public/js/engine.js'),T=require('../public/js/trainer.js');
const games=Math.max(2,+process.env.G2_ABL_GAMES||20),size=+process.env.G2_ABL_SIZE||9;
/* Borne inférieure de l'IC 95% pour X ∈ {0, 0.5, 1}. */
function scoreLow95(mean,w,d,n,z=1.96){if(!n)return 0;const ex2=(w+0.25*d)/n,v=Math.max(0,ex2-mean*mean),se=Math.sqrt(v/n);return mean-z*se}
function duel(a,b,label){
  let w=0,l=0,d=0,completed=0,incomplete=0;
  for(let i=0;i<games;i++){
    const r=T.playGame(E,{a:{lvl:3,params:a},b:{lvl:3,params:b},swap:i%2===1,seed:1000+i,size:[size,size]});
    if(!r.complete){incomplete++;continue}
    completed++;if(r.winner===0)w++;else if(r.winner===1)l++;else d++;
  }
  const n=completed,k=w+d/2,score=n?k/n:.5,lo=scoreLow95(score,w,d,n),hi=2*score-lo;
  const verdict=lo>.5?'avantage établi':hi<.5?'désavantage établi':'non concluant';
  console.log(`${label.padEnd(40)} ${String(w).padStart(3)} V · ${String(d).padStart(3)} N · ${String(l).padStart(3)} D / ${String(n).padStart(3)} (+${incomplete} inc.) | score ${(n?score:.5).toFixed(3)} IC95 [${lo.toFixed(2)} ; ${hi.toFixed(2)}] → ${verdict}`);
  return{label,score:+score.toFixed(4),ic95Low:+lo.toFixed(4),ic95High:+hi.toFixed(4),w,d,l,n:completed,incomplete,verdict};
}
console.log(`Ablation Champion, ${games} parties par ligne, plateau ${size}×${size}`);
console.log('Référence = Champion complet. Une ligne "avantage établi" signifie que le composant ablaté contribue positivement.');
console.log('');
const results=[];
results.push(duel({},{noMcts:true},   'Champion vs sans mctsRefine'));
results.push(duel({},{predictive:false},'Champion vs sans carte prédictive'));
results.push(duel({},{noBooks:true},  'Champion vs sans livres de motifs'));
results.push(duel({},{noAnti:true},   'Champion vs sans anti-motifs'));
results.push(duel({},{moreCands:true},'Champion vs plus de candidats (R=8)'));
results.push(duel({},{biggerBudget:true},'Champion vs budget de recherche x2'));
results.push(duel({},{noDeep:true},   'Champion vs sans recherche profonde'));
console.log('');
console.log('Synthèse :');
for(const r of results){
  const impact=r.verdict==='avantage établi'?'le composant aide l\'IA (l\'enlever la dégrade)':
               r.verdict==='désavantage établi'?'le composant nuit à l\'IA (l\'enlever l\'améliore) !':
               'effet non concluant (augmenter G2_ABL_GAMES)';
  console.log(`  • ${r.label.padEnd(40)} → ${impact}`);
}
/* Audit P2 : archive un rapport JSON versionné, lié au commit. */
const commit=process.env.GITHUB_SHA||process.env.COMMIT_SHA||'local';
const outDir=path.join(__dirname,'..','bench');fs.mkdirSync(outDir,{recursive:true});
const out=path.join(outDir,`ablation-${commit.slice(0,12)}-${Date.now()}.json`);
const report={schema:1,createdAt:new Date().toISOString(),commit,gamesPerPair:games,size,seedBase:1000,results};
fs.writeFileSync(out,JSON.stringify(report,null,2)+String.fromCharCode(10));
console.log(`\nRapport archivé : ${out}`);
