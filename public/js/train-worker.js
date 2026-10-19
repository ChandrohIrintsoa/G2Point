/* Web Worker : joue les parties d'entraînement hors du fil principal (l'interface ne gèle jamais). */
importScripts('engine.js?v=21','trainer.js?v=1');
const E=self.G2Engine,T=self.G2Trainer;
self.onmessage=ev=>{
  const m=ev.data||{};
  if(m.type!=='play')return;
  try{
    const r=T.playGame(E,{a:m.a,b:m.b,swap:!!m.swap,seed:m.seed|0,size:m.size});
    self.postMessage({type:'result',id:m.id,result:r});
  }catch(e){self.postMessage({type:'error',id:m.id,message:String(e&&e.message||e)})}
};
