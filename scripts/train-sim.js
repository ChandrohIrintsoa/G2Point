/* Simulation hors navigateur de la boucle d'entraînement : npm run train:sim
   G2_TRAIN_GAMES=60 (nombre de parties), G2_STREAK=100 (série), pauses ignorées (affichées seulement). */
const E=require('../public/js/engine.js'),T=require('../public/js/trainer.js');
const games=Math.max(1,Number(process.env.G2_TRAIN_GAMES)||40),streakLimit=Math.max(2,Number(process.env.G2_STREAK)||100);
const t=new T.Tournament({streakLimit,pauseMin:30});
for(let i=0;i<games;i++){
  const m=t.next(),r=T.playGame(E,{a:{lvl:m.a.lvl},b:{lvl:m.b.lvl},swap:m.swap,seed:m.seed});
  const rec=t.record(m.a.id,m.b.id,r.winner,r.complete,0);
  if(rec.pause){console.log(`Série atteinte après ${t.st.games} parties : ${t.player(rec.id).name} (${rec.streak}). Pause ${t.cfg.pauseMin} min, puis relance.`);t.st.pauseUntil=0}
}
for(const p of t.players){const x=t.st.stats[p.id];console.log(`${p.name.padEnd(14)} ${x.w} V · ${x.l} D · ${x.d} N · série ${t.st.streaks[p.id]}`)}
