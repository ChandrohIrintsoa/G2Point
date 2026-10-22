/* G2Point — vérification d'une IA avant adoption (module pur : navigateur, Web Worker, Node).
   Une évolution (poids) n'est écrite que si elle passe trois contrôles :
   1. un match contre la version de référence (elle ne doit pas être nettement plus faible) ;
   2. une banque de techniques (prendre une capture disponible, parer une menace) : pas de régression ;
   3. un match contre des versions plus anciennes (« hall of fame »), si on en fournit.
   Les seuils sont des paramètres : strictes pour le champion publié, courts et souples pour l'IA personnelle. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.G2Verify=factory();
})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';

const allMoves=(E,s)=>{const out=[];for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)if(E.legal(s,x,y))out.push([x,y]);return out};
/* gain immédiat (cases capturées) du joueur au trait en jouant m ; 0 si aucune capture */
function gainOf(E,s,m){const c=E.clone(s),t=E.tmOf(c.tm,c.cur);if(!E.apply(c,m))return -1;return c.capT===t?c.cap.length:0}
/* meilleur gain immédiat de l'adversaire après que le joueur a joué m (réponse la plus dangereuse) */
function replyDanger(E,s,m){
  const c=E.clone(s);if(!E.apply(c,m))return 99;
  const me=E.tmOf(s.tm,s.cur);if(E.tmOf(c.tm,c.cur)===me)return 0; /* on rejoue (bonus) : pas de réponse adverse immédiate */
  let worst=0;for(const r of allMoves(E,c))worst=Math.max(worst,gainOf(E,c,r));
  return worst;
}

/* Banque de techniques, déterministe pour une graine donnée.
   - « capture » : une capture est possible ; le meilleur coup rapporte `best` cases.
   - « parade » : si le joueur ne parait pas, l'adversaire capture ; `min` est la plus petite réponse adverse atteignable, `max` la pire. */
function buildSuite(E,T,{seed=1,n=24,size=[9,9],maxTries=4000}={}){
  const suite=[],rnd=E.rng(seed|0);let tries=0;
  while(suite.length<n&&tries++<maxTries){
    const [w,h]=size,s=E.create(w,h,2,false),plies=6+Math.floor(rnd()*Math.max(4,w*h*.55));
    const moves=[];
    for(let i=0;i<plies&&s.free>0;i++){
      const lvl=rnd()<.5?0:1,mv=E.aiMove(s,E.rng((seed^Math.imul(i+1,0x9e3779b1)^tries)|0),{lvl});
      if(!mv||!E.apply(s,mv))break;moves.push(mv);
    }
    if(s.free<8)continue;
    const mv=allMoves(E,s);if(mv.length<4)continue;
    const gains=mv.map(m=>gainOf(E,s,m)),best=Math.max(...gains);
    if(best>0&&suite.filter(x=>x.kind==='capture').length<n/2){suite.push({kind:'capture',w,h,moves:moves.slice(),best});continue}
    if(suite.filter(x=>x.kind==='parade').length>=n/2)continue;
    const dangers=mv.map(m=>replyDanger(E,s,m)),min=Math.min(...dangers),max=Math.max(...dangers);
    if(max>=2&&max>min)suite.push({kind:'parade',w,h,moves:moves.slice(),min,max});
  }
  return suite;
}
function position(E,e){const s=E.create(e.w,e.h,2,false);for(const m of e.moves)if(!E.apply(s,m))break;return s}
/* score de technique dans [0,1] : 1 = toujours le bon coup */
function techScore(E,params,suite,lvl=1){
  if(!suite.length)return 1;
  let sum=0;
  for(let i=0;i<suite.length;i++){
    const e=suite[i],s=position(E,e),mv=E.aiMove(s,E.rng(0x5eed+i),{...params,lvl});
    if(!mv){continue}
    if(e.kind==='capture')sum+=Math.min(1,Math.max(0,gainOf(E,s,mv))/e.best);
    else{const d=replyDanger(E,s,mv);sum+=d<=e.min?1:Math.max(0,1-(d-e.min)/Math.max(1,e.max-e.min))}
  }
  return sum/suite.length;
}

/* Match alterné (sièges échangés). Retourne le score du candidat : 1 par victoire, .5 par nul. */
function playMatch(E,T,cand,base,{games=8,seed=1,size=[9,9],lvl=1}={}){
  let w=0,l=0,d=0;
  for(let i=0;i<games;i++){
    const r=T.playGame(E,{a:{params:cand,lvl},b:{params:base,lvl},swap:i%2===1,seed:(seed*7919+i*104729)|0,size});
    if(!r.complete)continue;
    if(r.winner===0)w++;else if(r.winner===1)l++;else d++;
  }
  const n=w+l+d;return{w,l,d,n,score:n?(w+d/2)/n:.5};
}

/* Porte de vérification. cand/base : {w,book,sbook,antiBook,antiSBook}. opts.hof : [{params,name}] versions anciennes. */
function gate(E,T,cand,base,opts={}){
  const o={games:8,hofGames:4,minScore:.4,minHof:.35,techTol:.1,size:[9,9],seed:1,suite:null,suiteSize:12,hof:[],...opts};
  const suite=o.suite||buildSuite(E,T,{seed:o.seed+101,n:o.suiteSize,size:o.size}),reasons=[],stats={};
  const m=playMatch(E,T,cand,base,{games:o.games,seed:o.seed,size:o.size});stats.match=m;
  if(m.n>0&&m.score<o.minScore)reasons.push('match contre la référence : '+m.score.toFixed(2)+' < '+o.minScore);
  const tc=techScore(E,cand,suite),tb=techScore(E,base,suite);stats.tech={cand:+tc.toFixed(3),base:+tb.toFixed(3),n:suite.length};
  if(tc<tb-o.techTol)reasons.push('régression sur les techniques : '+tc.toFixed(2)+' < '+(tb-o.techTol).toFixed(2));
  stats.hof=[];
  for(const h of o.hof||[]){
    const r=playMatch(E,T,cand,h.params,{games:o.hofGames,seed:o.seed+7,size:o.size});stats.hof.push({name:h.name,score:+r.score.toFixed(2),n:r.n});
    if(r.n>0&&r.score<o.minHof)reasons.push('perd contre '+h.name+' : '+r.score.toFixed(2)+' < '+o.minHof);
  }
  return{pass:reasons.length===0,reasons,stats};
}
return{buildSuite,techScore,playMatch,gate,position,gainOf,replyDanger,allMoves};
});
