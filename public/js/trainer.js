/* G2Point — boucle d'entraînement IA contre IA (module pur : navigateur, Web Worker et Node/tests).
   Des IA de niveaux différents s'affrontent en boucle. Quand un même participant enchaîne `streakLimit` victoires
   consécutives (100 par défaut), l'entraînement se met en pause `pauseMin` minutes puis redémarre tout seul. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.G2Trainer=factory();
})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const LEVEL_NAMES=['Facile','Normal','Difficile','Champion'];
const LEVEL_ELO=[800,1000,1300,1600]; /* repères pour l'évolution des poids (Elo estimé de chaque niveau fixe) */
const DEFAULTS={streakLimit:100,pauseMin:30,levels:[0,1,2],size:[11,15],learnerLevel:2};

/* Une partie complète. a et b : {lvl, params}. Retourne le vainqueur côté A/B (0, 1) ou 2 pour égalité. */
function playGame(E,spec){
  const [w,h]=spec.size||DEFAULTS.size,s=E.create(w,h,2,false),seatA=spec.swap?1:0,moves=[],cap=spec.maxMoves||w*h*2;
  while(s.free>0&&moves.length<cap){
    const side=s.cur===seatA?spec.a:spec.b,mv=E.aiMove(s,E.rng((spec.seed^Math.imul(moves.length+1,0x9e3779b1))|0),{...(side.params||{}),lvl:side.lvl});
    if(!mv||!E.apply(s,mv))break;
    moves.push(mv);
  }
  const a=s.sc[seatA],b=s.sc[1-seatA];
  return{winner:a>b?0:a<b?1:2,scores:[a,b],moves,seatA,complete:s.free<=0,w,h};
}

class Tournament{
  constructor(cfg,saved){
    this.cfg={...DEFAULTS,...(cfg||{})};
    const levels=this.cfg.levels.filter(l=>Number.isInteger(l)&&l>=0&&l<LEVEL_NAMES.length);
    this.players=levels.map(l=>({id:'L'+l,lvl:l,name:LEVEL_NAMES[l]}));
    this.players.push({id:'IA',lvl:this.cfg.learnerLevel,name:'IA apprenante',learner:true});
    this.pairs=[];
    for(let i=0;i<this.players.length;i++)for(let j=i+1;j<this.players.length;j++){
      const p=this.players[i],q=this.players[j];
      if(p.lvl!==q.lvl||p.learner!==q.learner)this.pairs.push([p.id,q.id]); /* niveaux différents, ou apprenante contre son propre niveau */
    }
    this.st={games:0,incomplete:0,cursor:0,pauses:0,pauseUntil:0,lastPause:null,stats:{},streaks:{}};
    for(const p of this.players){this.st.stats[p.id]={w:0,l:0,d:0};this.st.streaks[p.id]=0}
    if(saved&&typeof saved==='object')this.restore(saved);
  }
  restore(saved){
    const st=this.st;
    for(const k of ['games','incomplete','cursor','pauses','pauseUntil'])if(Number.isFinite(saved[k])&&saved[k]>=0)st[k]=saved[k];
    if(saved.lastPause&&typeof saved.lastPause==='object')st.lastPause=saved.lastPause;
    for(const p of this.players){
      const x=saved.stats&&saved.stats[p.id];
      if(x)st.stats[p.id]={w:+x.w||0,l:+x.l||0,d:+x.d||0};
      const k=saved.streaks&&saved.streaks[p.id];if(Number.isFinite(k)&&k>=0)st.streaks[p.id]=k;
    }
  }
  snapshot(){return JSON.parse(JSON.stringify(this.st))}
  player(id){return this.players.find(p=>p.id===id)}
  paused(now=Date.now()){return now<this.st.pauseUntil}
  /* Prochaine rencontre : toutes les paires à tour de rôle, côtés alternés à chaque tour complet. */
  next(){
    const c=this.st.cursor++,n=this.pairs.length,[x,y]=this.pairs[c%n],swap=Math.floor(c/n)%2===1;
    return{a:this.player(x),b:this.player(y),swap,seed:(0x475032+c*7919)|0,index:c};
  }
  /* Enregistre un résultat. Retourne {pause:true, id, streak} quand la série de victoires est atteinte. */
  record(aId,bId,winner,complete=true,now=Date.now()){
    const st=this.st,A=st.stats[aId],B=st.stats[bId];
    if(!A||!B)return{pause:false};
    st.games++;if(!complete)st.incomplete++;
    if(winner===0){A.w++;B.l++;st.streaks[aId]++;st.streaks[bId]=0}
    else if(winner===1){B.w++;A.l++;st.streaks[bId]++;st.streaks[aId]=0}
    else{A.d++;B.d++;st.streaks[aId]=0;st.streaks[bId]=0}
    const top=winner===0?aId:winner===1?bId:null;
    if(top&&st.streaks[top]>=this.cfg.streakLimit){
      st.pauses++;st.pauseUntil=now+this.cfg.pauseMin*60000;
      st.lastPause={id:top,name:this.player(top).name,streak:st.streaks[top],at:now,games:st.games};
      for(const id of Object.keys(st.streaks))st.streaks[id]=0;
      return{pause:true,id:top,streak:st.lastPause.streak,until:st.pauseUntil};
    }
    return{pause:false};
  }
}
return{LEVEL_NAMES,LEVEL_ELO,DEFAULTS,playGame,Tournament};
});
