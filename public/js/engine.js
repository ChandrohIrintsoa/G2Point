/* Moteur de règles pur (sans DOM) : utilisé par app.js et par les tests Node. */
(function(root){
const N4=[[1,0],[-1,0],[0,1],[0,-1]],N8=[...N4,[1,1],[1,-1],[-1,1],[-1,-1]];
const grid=(W,H,v)=>Array.from({length:H},()=>Array(W).fill(v));
const tmOf=(tm,p)=>tm?p%2:p;
const CAND_RADIUS=4;      /* scan tactique à rayon 4 autour de chaque point existant */
const MIN_LINK=2;         /* un point ne peut fermer une boucle que s'il touche ≥2 de mes points vivants */
const HARD_TOP=5,HARD_REPLY=.8; /* niveau difficile : réponses adverses examinées sur les 5 meilleurs coups */
const LEVELS=[{name:'Facile',noise:4,block:.3,book:false,deep:false},{name:'Normal',noise:.3,block:1,book:true,deep:false},{name:'Difficile',noise:.05,block:1,book:true,deep:true}];
function create(w,h,n,tm){const K=tm?2:n;return{n:0,w,h,N:n,tm:!!tm,o:grid(w,h,0),d:grid(w,h,false),sc:Array(K).fill(0),big:Array(K).fill(0),combo:0,loops:[],cur:0,bonus:false,cap:[],capT:0,blk:grid(w,h,false),free:w*h}}
/* Case jouable : dans le terrain, vide, et hors territoire confiné (zone fermée où une capture a eu lieu) */
const legal=(s,x,y)=>x>=0&&y>=0&&x<s.w&&y<s.h&&!s.o[y][x]&&!s.blk[y][x];
/* Territoire : une zone fermée qui a capturé devient inaccessible pour tous. */
function mark(s,c){for(const [a,b] of c.cells)if(!s.blk[b][a]){s.blk[b][a]=true;if(!s.o[b][a])s.free--}}
/* Zones fermées par l'équipe t : composantes de cases non atteignables depuis le bord.
   Si `at` est fourni, on s'arrête dès que la composante contenant `at` est trouvée (early-exit).
   Version tableaux typés + tampons réutilisés : aucune allocation par case (c'était le point chaud de l'IA). */
let SCR=null;
const scratch=n=>{if(!SCR||SCR.n!==n)SCR={n,wall:new Uint8Array(n),seen:new Uint8Array(n),vis:new Uint8Array(n),st:new Int32Array(n),mk:new Int32Array(n),stamp:0};else{SCR.seen.fill(0);SCR.vis.fill(0)}return SCR};
function scan(s,t,at){
  const W=s.w,H=s.h,{o,d}=s,n=W*H,SR=scratch(n),{wall,seen,vis,st}=SR,tt=t+1;
  function grow(i0){
    const cells=[],bd=new Set();let q=0;vis[i0]=1;st[q++]=i0;
    while(q){
      const i=st[--q],a=i%W,b=(i-a)/W;cells.push([a,b]);
      for(const [dx,dy] of N8){
        const u=a+dx,v=b+dy;if(u<0||v<0||u>=W||v>=H)continue;
        const k=v*W+u;
        if(wall[k])bd.add(k);
        else if(dx*dy==0&&!seen[k]&&!vis[k]){vis[k]=1;st[q++]=k}
      }
    }
    return{cells,bd};
  }
  if(at){ /* chemin rapide : on part de la case et on s'arrête dès qu'on touche le bord (cas le plus fréquent : pas enfermé) */
    const x0=at[0],y0=at[1];
    if(o[y0][x0]==tt&&!d[y0][x0])return[];
    if(x0<=0||y0<=0||x0>=W-1||y0>=H-1)return[];
    const mk=SR.mk,sg=++SR.stamp,i0=y0*W+x0;let sp=0;
    mk[i0]=sg;st[sp++]=i0;
    while(sp){
      const i=st[--sp],x=i%W,y=(i-x)/W;
      for(let k=0;k<4;k++){
        const u=k==0?x+1:k==1?x-1:x,v=k==2?y+1:k==3?y-1:y;
        if(u<0||v<0||u>=W||v>=H)continue;
        if(o[v][u]==tt&&!d[v][u])continue;
        const j=v*W+u;if(mk[j]==sg)continue;
        if(u==0||v==0||u==W-1||v==H-1)return[]; /* atteint le bord : non enfermé */
        mk[j]=sg;st[sp++]=j;
      }
    }
    /* enfermé : seen reste vide, la composante de at est exactement la zone atteinte */
    for(let y=0,i=0;y<H;y++){const ro=o[y],rd=d[y];for(let x=0;x<W;x++,i++)wall[i]=ro[x]==tt&&!rd[x]?1:0}
    return[grow(i0)];
  }
  let walls=0;
  for(let y=0,i=0;y<H;y++){const ro=o[y],rd=d[y];for(let x=0;x<W;x++,i++){const w=ro[x]==tt&&!rd[x];wall[i]=w?1:0;if(w)walls++}}
  if(walls<4)return[]; /* il faut au moins 4 murs (losange) pour enfermer une case */
  let sp=0;
  const push=i=>{if(!seen[i]&&!wall[i]){seen[i]=1;st[sp++]=i}};
  for(let x=0;x<W;x++){push(x);push((H-1)*W+x)}
  for(let y=0;y<H;y++){push(y*W);push(y*W+W-1)}
  while(sp){
    const i=st[--sp],x=i%W,y=(i-x)/W;
    if(x+1<W)push(i+1);if(x>0)push(i-1);if(y+1<H)push(i+W);if(y>0)push(i-W);
  }
  const comps=[];
  for(let i=0;i<n;i++){if(seen[i]||wall[i]||vis[i])continue;comps.push(grow(i))}
  return comps;
}
/* Nombre de points vivants de l'équipe t dans les 8 cases voisines */
function links(s,x,y,t){let k=0;for(const [dx,dy] of N8){const u=x+dx,v=y+dy;if(u>=0&&v>=0&&u<s.w&&v<s.h&&s.o[v][u]==t+1&&!s.d[v][u])k++}return k}
/* Condition nécessaire pour qu'un nouveau point ferme une boucle : il doit relier deux de mes points vivants
   qui ne se touchent pas déjà entre eux (distance de Tchebychev 2) — sinon ils fermaient déjà la zone sans lui. */
function canClose(s,x,y,t){
  const W=s.w,H=s.h,tt=t+1,px=[],py=[];
  for(const [dx,dy] of N8){const u=x+dx,v=y+dy;if(u>=0&&v>=0&&u<W&&v<H&&s.o[v][u]==tt&&!s.d[v][u]){px.push(dx);py.push(dy)}}
  for(let i=0;i<px.length;i++)for(let j=i+1;j<px.length;j++)if(Math.abs(px[i]-px[j])==2||Math.abs(py[i]-py[j])==2)return true;
  return false;
}
/* Joue un coup. Retourne false (sans rien modifier) si le coup est illégal, y compris dans un territoire confiné. */
function apply(s,[x,y]){
  if(!legal(s,x,y))return false;
  const K=s.tm?2:s.N,t=tmOf(s.tm,s.cur);s.o[y][x]=t+1;s.free--;let g=0;s.cap=[];s.capT=t;
  /* Un point relié à moins de 2 de mes points ne peut pas fermer de boucle : on évite le scan complet */
  if(canClose(s,x,y,t))for(const c of scan(s,t)){
    const vic=c.cells.filter(([a,b])=>s.o[b][a]&&s.o[b][a]!=t+1&&!s.d[b][a]);
    if(vic.length){vic.forEach(([a,b])=>s.d[b][a]=true);s.sc[t]+=vic.length;g+=vic.length;s.loops.push({t,c});mark(s,c);s.cap.push(...vic)}
  }
  if(g&&g>s.big[t])s.big[t]=g;
  if(!g)for(let u=0;u<K;u++){ /* piège : point posé dans une zone déjà fermée par un adversaire */
    if(u==t)continue;
    const c=scan(s,u,[x,y])[0]; /* early-exit : seule la composante du point nous intéresse */
    if(c){s.d[y][x]=true;s.sc[u]++;if(!s.big[u])s.big[u]=1;s.loops.push({t:u,c});mark(s,c);s.cap=[[x,y]];s.capT=u;break}
  }
  s.bonus=g>0;s.combo=s.bonus?s.combo+1:0;if(!s.bonus)s.cur=(s.cur+1)%s.N; /* capture = le même joueur rejoue */
  return true;
}
const clone=s=>({...s,o:s.o.map(r=>r.slice()),d:s.d.map(r=>r.slice()),blk:s.blk.map(r=>r.slice()),sc:s.sc.slice(),big:s.big.slice(),loops:[],cap:[]});
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}; /* mulberry32 */

/* ---- IA : évaluation + mémoire de motifs apprise des parties ---- */
// Poids : [gain de capture, perte/piège, blocage d'une capture adverse, voisins à moi, voisins adverses, motif appris]
const DEFAULT_W=[10,10,7,.4,.2,2];
const mutate=(w,r)=>w.map(x=>Math.max(0,+(x*(.7+r()*.6)).toFixed(3)));
/* Motif local (8 voisins) vu du joueur t : . vide, m à moi, o adverse, x capturé, b territoire, # bord */
function patKey(s,x,y,t){
  let k='';
  for(const [dx,dy] of N8){
    const u=x+dx,v=y+dy;
    if(u<0||v<0||u>=s.w||v>=s.h){k+='#';continue}
    const p=s.o[v][u];
    k+=!p?(s.blk[v][u]?'b':'.'):s.d[v][u]?'x':p==t+1?'m':'o';
  }
  return k;
}
/* Contexte stratégique appris : phase de partie, densité locale et chaîne de captures.
   Il permet à l'IA de réutiliser des familles de plans, pas seulement des voisinages isolés. */
function strategyKey(s,x,y,t){
  const opp=1-t,phase=s.n<8?'O':s.n<30?'M':'E',mine=links(s,x,y,t),enemy=links(s,x,y,opp);
  const pressure=mine>=3?'F':mine>=1?'P':'I',danger=enemy>=2?'D':'S',chain=s.combo>0?'C':'N';
  const edge=x<2||y<2||x>=s.w-2||y>=s.h-2?'B':'C';
  return `S|${phase}|${pressure}|${danger}|${chain}|${edge}`;
}
function record(book,key,gain,won){
  const e=book[key]||(book[key]=[0,0,0]);e[0]++;e[1]+=gain;if(won)e[2]++;
}
/* Enregistre une réponse choisie par l'entraîneur dans le motif et le contexte stratégique observés. */
function teach(book,s,x,y,t=0,quality=1){
  if(!legal(s,x,y))return false;
  const sign=quality<0?-1:1;
  for(const key of [patKey(s,x,y,t),strategyKey(s,x,y,t)]){
    const e=book[key]||(book[key]=[0,0,0]);
    e[0]+=3;e[1]+=sign*6;if(sign>0)e[2]+=3;
  }
  return true;
}
/* Rejoue une partie et enregistre, pour chaque coup, [fois joué, gain cumulé, victoires du joueur] */
function learn(book,mv,w,h,n,tm,win,focusPlayer=null){
  const s=create(w,h,n,tm);
  for(const m of mv){
    const t=tmOf(tm,s.cur),k=patKey(s,m[0],m[1],t);
    const sk=strategyKey(s,m[0],m[1],t);
    if(!apply(s,m))continue;
    if(focusPlayer!=null&&t!==focusPlayer)continue; /* en solo, seule l'IA apprend de ses propres décisions */
    const gain=s.capT==t?s.cap.length:-s.cap.length,won=win.includes(t);
    record(book,k,gain,won);record(book,sk,gain,won);
  }
}
/* Cases candidates : vides, hors territoire confiné, proches d'un point existant */
function cands(s){
  const W=s.w,H=s.h,out=[];let any=false;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(s.o[y][x]){any=true;continue}
    if(s.blk[y][x])continue;
    let near=false;
    for(let j=-CAND_RADIUS;j<=CAND_RADIUS&&!near;j++)for(let i=-CAND_RADIUS;i<=CAND_RADIUS;i++){const a=x+i,b=y+j;if(a>=0&&b>=0&&a<W&&b<H&&s.o[b][a]){near=true;break}}
    if(near)out.push([x,y]);
  }
  return{any,list:out};
}
/* Meilleur gain adverse possible après mon coup (niveau difficile) */
function replyGain(s,opp){
  const {list}=cands(s);let m=0;
  for(const [x,y] of list){const c=clone(s);if(!apply(c,[x,y]))continue;const g=c.sc[opp]-s.sc[opp];if(g>m)m=g}
  return m;
}
function aiMove(s,rnd=Math.random,P){
  const W=s.w,H=s.h,t=tmOf(s.tm,s.cur),opp=1-t,w=(P&&P.w)||DEFAULT_W,book=P&&P.book,L=LEVELS[(P&&P.lvl!=null)?P.lvl:1]||LEVELS[1];
  const {any,list:c0}=cands(s),Z=P&&P.zone,cand=Z?c0.filter(([x,y])=>x>=Z[0]&&x<=Z[1]&&y>=Z[2]&&y<=Z[3]):c0; /* zone optionnelle : jeu compact (puzzles) */
  if(!any){const c=[W>>1,H>>1];return legal(s,c[0],c[1])?c:null}
  if(!cand.length){for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(legal(s,x,y)&&(!Z||(x>=Z[0]&&x<=Z[1]&&y>=Z[2]&&y<=Z[3])))return[x,y];return null}
  const scored=[];
  for(const [x,y] of cand){
    const a=clone(s);apply(a,[x,y]);
    let v=(a.sc[t]-s.sc[t])*w[0]-(a.sc[opp]-s.sc[opp])*w[1];
    const b=clone(s);b.cur=opp;apply(b,[x,y]);v+=(b.sc[opp]-s.sc[opp])*w[2]*L.block; /* case où l'adversaire capturerait */
    for(const [dx,dy] of N8){const u=x+dx,q=y+dy;if(u<0||q<0||u>=W||q>=H)continue;const p=s.o[q][u];if(p==t+1)v+=w[3];else if(p)v+=w[4]}
    const e=L.book&&book&&book[patKey(s,x,y,t)],se=L.book&&book&&book[strategyKey(s,x,y,t)];
    if(e)v+=w[5]*Math.max(-2,Math.min(3,(e[1]*1.5+e[2]*.8)/(e[0]+2))); /* techniques vues dans les parties */
    if(se&&se[0]>=3)v+=w[5]*.65*Math.max(-2,Math.min(3,(se[1]*1.25+se[2])/(se[0]+2))); /* stratégie validée par plusieurs observations */
    v+=rnd()*L.noise;scored.push({m:[x,y],v,cap:a.bonus});
  }
  scored.sort((p,q)=>q.v-p.v);
  if(L.deep){ /* difficile : on regarde la meilleure réponse adverse pour les meilleurs coups */
    for(const c of scored.slice(0,HARD_TOP)){
      if(c.cap)continue; /* je rejoue après une capture : pas de réponse immédiate */
      const a=clone(s);apply(a,c.m);c.v-=replyGain(a,opp)*w[1]*HARD_REPLY;
    }
    scored.sort((p,q)=>q.v-p.v);
  }
  return scored[0].m;
}
/* Puzzle généré par l'IA : parties IA (Rouge niveau normal) contre IA faible (Bleu), on garde une position où Rouge
   a UN SEUL coup qui capture >= goal points. La difficulté (goal, nombre de pierres) croît avec l'intelligence de l'IA. */
const ZONE=[2,8,3,11]; /* zone centrale où se joue le puzzle */
const puzzleSpec=intel=>({goal:Math.min(4,1+Math.floor(intel/3)),minMoves:12+intel*2});
function genPuzzle(rnd=Math.random,intel=0,P,maxMs=1500){
  const {goal,minMoves}=puzzleSpec(intel),t0=Date.now();
  while(Date.now()-t0<maxMs){
    const s=create(11,15,2,false),mv=[];
    while(s.free>0&&mv.length<60&&Date.now()-t0<maxMs){
      let m=aiMove(s,rnd,{w:P&&P.w,book:P&&P.book,lvl:s.cur?0:1,zone:ZONE});if(!m)break;
      if(!s.cur){ /* Rouge construit sa chaîne mais ne conclut jamais : la capture reste à trouver */
        const t=clone(s);apply(t,m);
        if(t.sc[0]>s.sc[0]){const alt=cands(s).list.filter(([x,y])=>x>=ZONE[0]&&x<=ZONE[1]&&y>=ZONE[2]&&y<=ZONE[3]&&(()=>{const c=clone(s);apply(c,[x,y]);return c.sc[0]==s.sc[0]})());if(alt.length)m=alt[(rnd()*alt.length)|0]}
      }
      apply(s,m);mv.push(m);
      if(s.cur!==0||s.bonus||mv.length<minMoves)continue;
      const sol=[];
      for(let y=0;y<s.h&&sol.length<2;y++)for(let x=0;x<s.w;x++){
        if(!legal(s,x,y))continue;const c=clone(s);apply(c,[x,y]);if(c.sc[0]-s.sc[0]>=goal)sol.push([x,y]);
      }
      if(sol.length===1)return{name:'Puzzle IA',goal,intel,moves:mv.slice(),sol:sol[0],hint:'Un seul coup capture '+goal+' point'+(goal>1?'s':'')+' : trouvez-le.'};
    }
  }
  return null;
}
const api={genPuzzle,puzzleSpec,create,scan,apply,legal,links,tmOf,grid,clone,rng,aiMove,learn,teach,patKey,strategyKey,mutate,DEFAULT_W,LEVELS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.G2Engine=api;
})(typeof window!=='undefined'?window:globalThis);
