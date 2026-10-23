/* Web Worker : joue les parties d'entraînement hors du fil principal (l'interface ne gèle jamais). */
importScripts('engine.js?v=22','trainer.js?v=2','verify.js?v=2');
const E=self.G2Engine,T=self.G2Trainer;
self.onmessage=ev=>{
  const m=ev.data||{};
  if(m.type==='gate'){ /* vérification d'une évolution avant adoption (voir verify.js) */
    /* fermé par défaut : toute exception donne un REFUS (pass:false, error:true), jamais une validation */
    const r=self.G2Verify.safeGate(E,T,m.cand,m.base,{games:m.games||8,hofGames:m.hofGames||4,minScore:.4,minHof:.35,techTol:.1,suite:m.suite||null,hof:m.hof||[],seed:(m.seed|0)||1});
    self.postMessage({type:'gateResult',id:m.id,result:r});
    return;
  }
  if(m.type!=='play')return;
  try{
    const r=T.playGame(E,{a:m.a,b:m.b,swap:!!m.swap,seed:m.seed|0,size:m.size});
    self.postMessage({type:'result',id:m.id,result:r});
  }catch(e){self.postMessage({type:'error',id:m.id,message:String(e&&e.message||e)})}
};
