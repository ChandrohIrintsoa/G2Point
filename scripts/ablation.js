/* Ablation du niveau Champion : npm run ablation   (G2_ABL_GAMES=20 parties par comparaison, G2_ABL_SIZE=9)
   Mêmes graines, sièges alternés. Compare le Champion complet à : sans raffinement « bandit UCT » (noMcts), sans carte prédictive (predictive:false).
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
  console.log(`${label.padEnd(34)} ${w} V · ${d} N · ${l} D sur ${n} | score ${(n?k/n:.5).toFixed(3)} IC95 [${lo.toFixed(2)} ; ${hi.toFixed(2)}] ${lo>.5?'→ avantage établi':hi<.5?'→ désavantage établi':'→ non concluant'}`);
}
console.log(`Ablation Champion, ${games} parties par ligne, plateau ${size}×${size}`);
duel({},{noMcts:true},'complet contre sans raffinement');
duel({},{predictive:false},'complet contre sans carte prédictive');
