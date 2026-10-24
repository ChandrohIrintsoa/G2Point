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
   Affiche victoires/nuls/défaites, le score et un intervalle de confiance de Wilson à 95 % : une différence dont l'intervalle contient 0,5
   n'est PAS établie. À lancer avec assez de parties (≥ 100) avant de conclure. */
const E=require('../public/js/engine.js'),T=require('../public/js/trainer.js');
const games=Math.max(2,+process.env.G2_ABL_GAMES||20),size=+process.env.G2_ABL_SIZE||9;
function wilson(k,n,z=1.96){if(!n)return[0,1];const p=k/n,d=1+z*z/n,c=p+z*z/(2*n),m=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n));return[(c-m)/d,(c+m)/d]}
function duel(a,b,label){
  let w=0,l=0,d=0;
  for(let i=0;i<games;i++){
    const r=T.playGame(E,{a:{lvl:3,params:a},b:{lvl:3,params:b},swap:i%2===1,seed:1000+i,size:[size,size]});
    if(!r.complete)continue;if(r.winner===0)w++;else if(r.winner===1)l++;else d++;
  }
  const n=w+l+d,k=w+d/2,[lo,hi]=wilson(k,n);
  const verdict=lo>.5?'avantage établi':hi<.5?'désavantage établi':'non concluant';
  console.log(`${label.padEnd(40)} ${String(w).padStart(3)} V · ${String(d).padStart(3)} N · ${String(l).padStart(3)} D / ${String(n).padStart(3)} | score ${(n?k/n:.5).toFixed(3)} IC95 [${lo.toFixed(2)} ; ${hi.toFixed(2)}] → ${verdict}`);
  return{label,w,d,n,score:n?k/n:.5,lo,hi,verdict};
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
