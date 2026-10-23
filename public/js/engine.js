/* Moteur de règles pur (sans DOM) : utilisé par app.js et par les tests Node. */
(function(root){
const N4=[[1,0],[-1,0],[0,1],[0,-1]],N8=[...N4,[1,1],[1,-1],[-1,1],[-1,-1]];
const grid=(W,H,v)=>Array.from({length:H},()=>Array(W).fill(v));
const tmOf=(tm,p)=>tm?p%2:p;
/* Zobrist déterministe : une mutation de case met à jour le hash en O(1). */
function zkey(kind,index,value){
  let z=(Math.imul((kind+1)^(Math.imul(index+1,0x9e3779b1)),0x85ebca6b)^Math.imul(value+1,0xc2b2ae35))>>>0;
  z^=z>>>16;z=Math.imul(z,0x7feb352d);z^=z>>>15;z=Math.imul(z,0x846ca68b);z^=z>>>16;
  return z>>>0;
}
function scalarHash(s){
  let h=zkey(10,s.w,s.h)^zkey(11,0,s.cur)^zkey(12,0,s.bonus?1:0)^zkey(13,0,s.combo||0)^zkey(16,0,s.N)^zkey(17,0,s.tm?1:0);
  for(let i=0;i<s.sc.length;i++)h^=zkey(14,i,s.sc[i])^zkey(15,i,(s.terr||[])[i]||0);
  return h>>>0;
}
function cellHashValue(idx,o,d,blk){return zkey(0,idx,o)^zkey(1,idx,d?1:0)^zkey(2,idx,blk?1:0)}
function computeHash(s){
  let h=scalarHash(s);
  for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)h^=cellHashValue(y*s.w+x,s.o[y][x],s.d[y][x],s.blk[y][x]);
  return h>>>0;
}
function ensureHash(s){if(!Number.isInteger(s._hash))s._hash=computeHash(s);return s._hash>>>0}
function updateCellHash(s,x,y,oldO,oldD,oldBlk){
  const idx=y*s.w+x;
  s._hash=(ensureHash(s)^cellHashValue(idx,oldO,oldD,oldBlk)^cellHashValue(idx,s.o[y][x],s.d[y][x],s.blk[y][x]))>>>0;
}
function updateScalarHash(s,before){
  let h=ensureHash(s);
  h^=zkey(11,0,before.cur)^zkey(11,0,s.cur);
  h^=zkey(12,0,before.bonus?1:0)^zkey(12,0,s.bonus?1:0);
  h^=zkey(13,0,before.combo||0)^zkey(13,0,s.combo||0);
  for(let i=0;i<s.sc.length;i++){
    h^=zkey(14,i,before.sc[i])^zkey(14,i,s.sc[i]);
    h^=zkey(15,i,(before.terr||[])[i]||0)^zkey(15,i,(s.terr||[])[i]||0);
  }
  s._hash=h>>>0;
}
const CAND_RADIUS=4;      /* scan tactique à rayon 4 autour de chaque point existant */
const TACT_TOP=6,TACT_THREAT=.3,TACT_FORK=.5,HARD_TOP=5,HARD_REPLY=.8,SEARCH_BEAM=6,SEARCH_DEPTH=4,TRANSPOSE_MAX=10000; /* recherche bornée, cache de transpositions */
const LEVELS=[{name:'Facile',noise:4,block:.3,book:false,deep:false},{name:'Normal',noise:.3,block:1,book:true,deep:false,tactic:true},{name:'Difficile',noise:.05,block:1,book:true,deep:true},{name:'Champion',noise:0,block:1.35,book:true,deep:true,champion:true}];
function create(w,h,n,tm){const K=tm?2:n,s={n:0,w,h,N:n,tm:!!tm,o:grid(w,h,0),d:grid(w,h,false),sc:Array(K).fill(0),big:Array(K).fill(0),combo:0,loops:[],cur:0,bonus:false,cap:[],capT:0,blk:grid(w,h,false),terr:Array(K).fill(0),free:w*h};s._hash=computeHash(s);return s}
/* Case jouable : dans le terrain, vide, et hors territoire confiné (zone fermée où une capture a eu lieu) */
const legal=(s,x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<s.w&&y<s.h&&!s.o[y][x]&&!s.blk[y][x];
/* Territoire : une zone fermée qui a capturé devient inaccessible pour tous. */
function mark(s,c,owner=null){for(const [a,b] of c.cells)if(!s.blk[b][a]){const oo=s.o[b][a],od=s.d[b][a],ob=s.blk[b][a];s.blk[b][a]=true;if(!s.o[b][a])s.free--;if(owner!=null&&s.terr)s.terr[owner]++;updateCellHash(s,a,b,oo,od,ob)}}
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
function apply(s,move){
  if(!Array.isArray(move)||move.length!==2)return false;
  const [x,y]=move;
  if(!legal(s,x,y))return false;
  ensureHash(s);
  const before={cur:s.cur,bonus:s.bonus,combo:s.combo,sc:s.sc.slice(),terr:(s.terr||[]).slice()};
  const K=s.tm?2:s.N,t=tmOf(s.tm,s.cur),oldO=s.o[y][x],oldD=s.d[y][x],oldBlk=s.blk[y][x];
  s.o[y][x]=t+1;updateCellHash(s,x,y,oldO,oldD,oldBlk);s.free--;let g=0;s.cap=[];s.capT=t;
  /* Un point relié à moins de 2 de mes points ne peut pas fermer de boucle : on évite le scan complet */
  if(canClose(s,x,y,t))for(const c of scan(s,t)){
    const vic=c.cells.filter(([a,b])=>s.o[b][a]&&s.o[b][a]!=t+1&&!s.d[b][a]);
    if(vic.length){vic.forEach(([a,b])=>{const oo=s.o[b][a],od=s.d[b][a],ob=s.blk[b][a];s.d[b][a]=true;updateCellHash(s,a,b,oo,od,ob)});s.sc[t]+=vic.length;g+=vic.length;s.loops.push({t,c});mark(s,c,t);s.cap.push(...vic)}
  }
  if(g&&g>s.big[t])s.big[t]=g;
  if(!g)for(let u=0;u<K;u++){ /* piège : point posé dans une zone déjà fermée par un adversaire */
    if(u==t)continue;
    const c=scan(s,u,[x,y])[0]; /* early-exit : seule la composante du point nous intéresse */
    if(c){const oo=s.o[y][x],od=s.d[y][x],ob=s.blk[y][x];s.d[y][x]=true;updateCellHash(s,x,y,oo,od,ob);s.sc[u]++;if(!s.big[u])s.big[u]=1;s.loops.push({t:u,c});mark(s,c,u);s.cap=[[x,y]];s.capT=u;break}
  }
  s.n=(s.n|0)+1; /* compteur de coups tenu par le moteur lui-même : simulations, apprentissage et recherche voient la bonne phase de partie */
  s.bonus=g>0;s.combo=s.bonus?s.combo+1:0;if(!s.bonus)s.cur=(s.cur+1)%s.N; /* capture = le même joueur rejoue */
  updateScalarHash(s,before);
  return true;
}
const clone=s=>({...s,o:s.o.map(r=>r.slice()),d:s.d.map(r=>r.slice()),blk:s.blk.map(r=>r.slice()),sc:s.sc.slice(),big:s.big.slice(),terr:(s.terr||[]).slice(),loops:[],cap:[]});
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
/* Contrat « nombre d'équipes » : l'évaluation de l'IA oppose le joueur à UN adversaire principal.
   À 2 équipes (duel, ou 2 équipes de 2) c'est exactement l'autre équipe. À 3 ou 4 joueurs sans équipes, l'adversaire principal est
   le rival qui mène (score le plus élevé, égalité : le plus proche dans l'ordre de jeu). Ce n'est pas une recherche max-n complète. */
const teamCount=s=>s.tm?2:s.N;
function rival(s,t){
  if(teamCount(s)<=2)return 1-t;
  let best=-1;
  for(let k=1;k<s.N;k++){const q=(t+k)%s.N;if(best<0||s.sc[q]>s.sc[best])best=q}
  return best;
}
/* Contexte stratégique appris : phase de partie, densité locale et chaîne de captures.
   Il permet à l'IA de réutiliser des familles de plans, pas seulement des voisinages isolés. */
function strategyKey(s,x,y,t){
  const opp=rival(s,t),phase=s.n<8?'O':s.n<30?'M':'E',mine=links(s,x,y,t),enemy=links(s,x,y,opp);
  const pressure=mine>=3?'F':mine>=1?'P':'I',danger=enemy>=2?'D':'S',chain=s.combo>0?'C':'N';
  const edge=x<2||y<2||x>=s.w-2||y>=s.h-2?'B':'C';
  return `S|${phase}|${pressure}|${danger}|${chain}|${edge}`;
}
function record(book,key,gain,won,now=Date.now()){
  const e=book[key]||(book[key]=[0,0,0,now]);
  e[0]++;e[1]+=gain;if(won)e[2]++;e[3]=now;
}
/* Les anciennes leçons restent présentes, mais leur influence décroît sur environ 30 jours. */
function bookValue(e,now=Date.now(),tau=30*864e5){
  if(!Array.isArray(e))return 0;
  const count=Math.max(0,+e[0]||0),gain=+e[1]||0,wins=+e[2]||0;
  if(!count)return 0;
  const last=Number.isFinite(+e[3])?+e[3]:now,age=Math.max(0,now-last);
  return ((gain*1.5+wins*.8)/(count+2))*Math.exp(-age/tau);
}
/* Enregistre une réponse choisie par l'entraîneur dans le motif et le contexte stratégique observés. */
function teach(book,s,x,y,t=0,quality=1,strategyBook=book){
  if(!legal(s,x,y))return false;
  const sign=quality<0?-1:1,now=Date.now();
  record(book,patKey(s,x,y,t),sign*2,sign>0,now);
  record(strategyBook,strategyKey(s,x,y,t),sign*2,sign>0,now);
  return true;
}
/* Le livre tactique et le livre stratégique évoluent séparément ; l'argument optionnel préserve l'API historique. */
function learn(book,mv,w,h,n,tm,win,focusPlayer=null,strategyBook=book){
  const s=create(w,h,n,tm);
  for(const m of mv){
    const t=tmOf(tm,s.cur),k=patKey(s,m[0],m[1],t),sk=strategyKey(s,m[0],m[1],t);
    if(!apply(s,m))continue;
    if(focusPlayer!=null&&t!==focusPlayer)continue;
    const gain=s.capT==t?s.cap.length:-s.cap.length,won=win.includes(t);
    record(book,k,gain,won);record(strategyBook,sk,gain,won);
  }
}
/* Profil adaptatif de l'adversaire : statistiques agrégées, sans conserver de données personnelles.
   captureRate mesure la fréquence des captures ; clusterRate les coups joués près de ses propres points. */
function observeOpponent(profile,mv,w,h,n,tm,focusPlayer=0){
  const p=profile&&typeof profile==='object'?profile:{};
  const out={samples:Math.max(0,+p.samples||0),captures:Math.max(0,+p.captures||0),cluster:Math.max(0,+p.cluster||0),edge:Math.max(0,+p.edge||0)};
  const s=create(w,h,n,tm);
  for(const m of mv){
    if(!legal(s,m[0],m[1]))continue;
    const t=tmOf(tm,s.cur),x=m[0],y=m[1],mine=links(s,x,y,t);
    const before=s.sc[t];apply(s,m);
    if(t===focusPlayer){out.samples++;if(s.sc[t]>before)out.captures++;if(mine>=2)out.cluster++;if(x<2||y<2||x>=w-2||y>=h-2)out.edge++}
  }
  return out;
}
function opponentStyle(p){
  const n=Math.max(1,+p?.samples||0);
  return{capture:Math.min(1,(+p?.captures||0)/n),cluster:Math.min(1,(+p?.cluster||0)/n),edge:Math.min(1,(+p?.edge||0)/n)};
}
function positionValue(s,root,weights,profile){
  const opp=rival(s,root),style=opponentStyle(profile);
  let v=(s.sc[root]-s.sc[opp])*(weights[0]+weights[1])*.5;
  let mine=0,theirs=0,frontier=0;
  for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++){
    const p=s.o[y][x];if(!p||s.d[y][x])continue;
    const t=p-1;if(t===root)mine++;else theirs++;
    const near=links(s,x,y,t),edge=x<2||y<2||x>=s.w-2||y>=s.h-2;
    if(t===root)frontier+=near*.035;
    else{frontier-=near*.035*(1+style.capture*.25);if(edge)frontier-=style.edge*.12}
  }
  const territory=s.terr||[0,0],total=s.w*s.h;
  v+=(mine-theirs)*.025+frontier+(territory[root]-territory[opp])*.12;
  if(s.free<total*.2)v+=(mine-theirs)*.08; /* en fin de partie, valorise les points vivants qui restent jouables */
  return v;
}
/* Recherche minimax à profondeur limitée. Chaque nœud ne conserve que les meilleurs candidats
   selon une évaluation tactique rapide ; les captures donnent un tour supplémentaire au même joueur. */
function stateHash(s){return ensureHash(s).toString(36)}
function searchBeam(s,root,depth,beam,weights,book,level,profile,ctx){
  const evaluate=()=>positionValue(s,root,weights,profile);
  if(depth<=0||s.free<=0||ctx.aborted)return evaluate();
  if((++ctx.nodes&31)===0&&nowMs()>ctx.deadline){ctx.aborted=true;return evaluate()}
  const hash=stateHash(s)+'|'+root+'|'+depth,hit=ctx.table.get(hash);
  if(hit!==undefined)return hit;
  const actor=tmOf(s.tm,s.cur),{list}=cands(s);
  if(!list.length)return evaluate();
  const style=opponentStyle(profile),ranked=[];
  for(const [x,y] of list){
    if(ctx.aborted)break;
    const next=clone(s);if(!apply(next,[x,y]))continue;
    const own=next.sc[actor]-s.sc[actor],against=next.sc[1-actor]-s.sc[1-actor];
    let h=(actor===root?own-against:against-own)*(weights[0]+weights[1])*.5;
    const same=links(s,x,y,actor),enemy=links(s,x,y,1-actor),sign=actor===root?1:-1;
    h+=sign*(same*weights[3]+enemy*weights[4]);
    if(actor!==root)h-=enemy*style.capture*weights[2]*.3;
    const key=(PBook=>PBook&&PBook[strategyKey(s,x,y,actor)])(level.sbook)||book&&book[strategyKey(s,x,y,actor)];
    if(level.book&&key)h+=weights[5]*bookValue(key);
    ranked.push({next,h});
  }
  ranked.sort((a,b)=>actor===root?b.h-a.h:a.h-b.h);
  const choices=ranked.slice(0,beam);
  let value=actor===root?-Infinity:Infinity;
  for(const c of choices){
    if(ctx.aborted)break;
    const v=c.h+searchBeam(c.next,root,depth-1,beam,weights,book,level,profile,ctx);
    value=actor===root?Math.max(value,v):Math.min(value,v);
  }
  if(!Number.isFinite(value))value=evaluate();
  if(ctx.table.size>=TRANSPOSE_MAX)ctx.table.clear();
  ctx.table.set(hash,value);
  return value;
}
/* Raffinement de type « bandit UCT à la racine » : ce N'EST PAS un arbre Monte-Carlo complet (aucun arbre de positions n'est
   conservé). On choisit parmi les meilleurs coups candidats par UCT, chacun évalué par des trajectoires heuristiques courtes
   (4 demi-coups). Son apport doit se mesurer par ablation (scripts/ablation.js) avant d'être invoqué comme argument de force.
   Les simulations sont bornées dans le temps et n'altèrent jamais l'état source. */
function mctsRefine(s,root,candidates,weights,profile,rnd=Math.random,deadline=nowMs()+160,iterations=180){
 const arms=candidates.slice(0,8).map(c=>({move:c.m||c,visits:0,total:0,mean:0}));
 if(!arms.length)return{move:null,visits:0};
 const rollout=(first)=>{
  const state=clone(s);if(!apply(state,first))return positionValue(state,root,weights,profile);
  for(let ply=0;ply<4&&state.free>0&&nowMs()<deadline;ply++){
   const actor=tmOf(state.tm,state.cur),{list}=cands(state);if(!list.length)break;
   const ranked=[];
   for(const [x,y] of list){
    const child=clone(state);if(!apply(child,[x,y]))continue;
    const gain=child.sc[actor]-state.sc[actor],loss=child.sc[1-actor]-state.sc[1-actor];
    const local=links(state,x,y,actor)-links(state,x,y,1-actor)*.25;
    ranked.push({move:[x,y],score:(gain-loss)*8+local});
   }
   if(!ranked.length)break;
   ranked.sort((a,b)=>b.score-a.score);
   const sample=ranked.slice(0,Math.min(4,ranked.length));
   const chosen=sample[Math.min(sample.length-1,Math.floor(Math.pow(Math.max(0,Math.min(.999999,rnd())),1.8)*sample.length))];
   if(!apply(state,chosen.move))break;
  }
  return positionValue(state,root,weights,profile);
 };
 let visits=0;
 for(;visits<iterations&&nowMs()<deadline;visits++){
  let arm;
  if(visits<arms.length)arm=arms[visits];
  else{
   const log=Math.log(visits+1);let best=-Infinity;
   for(const a of arms){const u=a.mean+1.35*Math.sqrt(log/(a.visits||1));if(u>best){best=u;arm=a}}
  }
  const value=rollout(arm.move);
  if(!Number.isFinite(value))continue;
  arm.visits++;arm.total+=value;arm.mean=arm.total/arm.visits;
 }
 arms.sort((a,b)=>b.mean-a.mean||b.visits-a.visits);
 return{move:arms[0].move,visits,arms:arms.map(a=>({move:a.move,visits:a.visits,mean:a.mean}))};
}
/* Plafond dur : au-delà, les étapes coûteuses restantes (recherche, raffinement) sont sautées et le meilleur coup déjà évalué est joué. */
const HARD_MAX_MS=2200;
const nowMs=()=>typeof performance!=='undefined'&&performance.now?performance.now():Date.now();
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
/* Menaces : nombre de cases proches de (x,y) où le joueur t capturerait au prochain coup si c'était son tour.
   Plusieurs menaces simultanées = fourchette (l'adversaire ne peut pas toutes les parer). */
function threatCount(s,t,x,y,radius=3){
  const c0=clone(s);c0.cur=t;c0.bonus=false;c0._hash=computeHash(c0);let n=0;
  for(let j=Math.max(0,y-radius);j<=Math.min(s.h-1,y+radius);j++)for(let i=Math.max(0,x-radius);i<=Math.min(s.w-1,x+radius);i++){
    if(!legal(c0,i,j))continue;
    const c=clone(c0);if(apply(c,[i,j])&&c.sc[t]>c0.sc[t])n++;
  }
  return n;
}
/* Projection stratégique Dijkstra/A* : cibles imaginaires dans un rayon de 4 cases
   et dix décisions adverses plausibles. Une projection est un scénario, pas une certitude. */
const FUTURE_HORIZON=10,IMAGINARY_RADIUS=4,FORECAST_BEAM=3;
function imaginaryTargets(s,player){
 const seen=new Set(),out=[];
 for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)if(s.o[y][x]===player+1&&!s.d[y][x])
  for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const a=x+dx,b=y+dy,k=b*s.w+a;if(a>=0&&b>=0&&a<s.w&&b<s.h&&legal(s,a,b)&&!seen.has(k)){seen.add(k);out.push([a,b])}}
 return out;
}
function dijkstraTargets(s,player,deadline=Infinity){
 const n=s.w*s.h,dist=new Float64Array(n);dist.fill(Infinity);const targets=imaginaryTargets(s,player),open=[];
 for(const [x,y] of targets){const k=y*s.w+x;dist[k]=0;open.push(k)}
 const done=new Uint8Array(n);
 while(open.length&&nowMs()<deadline){let bi=0;for(let i=1;i<open.length;i++)if(dist[open[i]]<dist[open[bi]])bi=i;
  const k=open.splice(bi,1)[0];if(done[k])continue;done[k]=1;const x=k%s.w,y=(k-x)/s.w;
  for(const [dx,dy] of N8){const a=x+dx,b=y+dy;if(a<0||b<0||a>=s.w||b>=s.h||s.o[b][a]||s.blk[b][a])continue;
   const j=b*s.w+a,nd=dist[k]+(dx&&dy?1.414:1);if(!done[j]&&nd<dist[j]){dist[j]=nd;open.push(j)}}
 }
 return{dist,targets};
}
function aStarRoute(s,start,goal){
 const id=([x,y])=>y*s.w+x,src=id(start),dst=id(goal),n=s.w*s.h,g=new Float64Array(n),prev=new Int32Array(n),closed=new Uint8Array(n),open=[src];
 g.fill(Infinity);g[src]=0;prev.fill(-1);
 const h=k=>Math.hypot(k%s.w-goal[0],Math.floor(k/s.w)-goal[1]);
 while(open.length){let bi=0;for(let i=1;i<open.length;i++)if(g[open[i]]+h(open[i])<g[open[bi]]+h(open[bi]))bi=i;
  const k=open.splice(bi,1)[0];if(k===dst){const path=[];for(let q=k;q!==-1;q=prev[q])path.push([q%s.w,Math.floor(q/s.w)]);return path.reverse()}
  if(closed[k])continue;closed[k]=1;const x=k%s.w,y=Math.floor(k/s.w);
  for(const [dx,dy] of N8){const a=x+dx,b=y+dy;if(a<0||b<0||a>=s.w||b>=s.h||(s.o[b][a]&&(a!==goal[0]||b!==goal[1]))||s.blk[b][a])continue;
   const j=b*s.w+a,ng=g[k]+(dx&&dy?1.414:1);if(ng<g[j]){g[j]=ng;prev[j]=k;open.push(j)}}
 }
 return[];
}
function forecastOpponent(s,opponent,horizon=FUTURE_HORIZON,deadline=Infinity){
 let beam=[{state:clone(s),moves:[],score:0}],projected=new Map();
 for(let turn=0;turn<horizon&&nowMs()<deadline;turn++){const next=[];
  for(const node of beam){const state=node.state;state.cur=opponent;state._hash=computeHash(state);const ranked=[];
   for(const move of cands(state).list){const child=clone(state),before=child.sc[opponent];if(!apply(child,move))continue;
    const gain=child.sc[opponent]-before,adj=links(state,move[0],move[1],opponent),score=node.score+gain*8+adj*.25;
    ranked.push({state:child,moves:[...node.moves,move],score})}
   ranked.sort((a,b)=>b.score-a.score);
   for(const v of ranked.slice(0,FORECAST_BEAM)){const [x,y]=v.moves.at(-1),k=y*s.w+x;projected.set(k,Math.max(projected.get(k)||0,1-turn/horizon));next.push(v)}
  }
  if(!next.length)break;next.sort((a,b)=>b.score-a.score);beam=next.slice(0,FORECAST_BEAM);
 }
 return{projected,lines:beam.map(x=>x.moves),horizon};
}
function predictiveMap(s,opponent,horizon=FUTURE_HORIZON,budgetMs=140){
 const deadline=nowMs()+Math.max(1,budgetMs),paths=dijkstraTargets(s,opponent,deadline),future=forecastOpponent(s,opponent,horizon,deadline),risk=new Float64Array(s.w*s.h);
 for(let i=0;i<risk.length;i++)risk[i]=(Number.isFinite(paths.dist[i])?1/(1+paths.dist[i]):0)+(future.projected.get(i)||0)*2;
 return{...paths,forecast:future,risk};
}
function aiMove(s,rnd=Math.random,P){
  const W=s.w,H=s.h,t=tmOf(s.tm,s.cur),opp=rival(s,t),startMs=nowMs(),late=()=>nowMs()-startMs>HARD_MAX_MS,w=(P&&P.w)||DEFAULT_W,book=P&&P.book,strategyBook=P&&P.sbook||book,antiBook=P&&P.antiBook,antiSBook=P&&P.antiSBook,L=LEVELS[(P&&P.lvl!=null)?P.lvl:1]||LEVELS[1],profile=P&&P.opponent;
  const {any,list:c0}=cands(s),Z=P&&P.zone,cand=Z?c0.filter(([x,y])=>x>=Z[0]&&x<=Z[1]&&y>=Z[2]&&y<=Z[3]):c0; /* zone optionnelle : jeu compact (puzzles) */
  if(!any){const c=[W>>1,H>>1];return legal(s,c[0],c[1])?c:null}
  if(!cand.length){for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(legal(s,x,y)&&(!Z||(x>=Z[0]&&x<=Z[1]&&y>=Z[2]&&y<=Z[3])))return[x,y];return null}
  const scored=[];
  for(const [x,y] of cand){
    const a=clone(s);apply(a,[x,y]);
    let v=(a.sc[t]-s.sc[t])*w[0]-(a.sc[opp]-s.sc[opp])*w[1];
    const b=clone(s);b.cur=opp;b._hash=computeHash(b);apply(b,[x,y]);v+=(b.sc[opp]-s.sc[opp])*w[2]*L.block; /* case où l'adversaire capturerait */
    for(const [dx,dy] of N8){const u=x+dx,q=y+dy;if(u<0||q<0||u>=W||q>=H)continue;const p=s.o[q][u];if(p==t+1)v+=w[3];else if(p)v+=w[4]}
    const e=L.book&&book&&book[patKey(s,x,y,t)],se=L.book&&strategyBook&&strategyBook[strategyKey(s,x,y,t)]||L.book&&book&&book[strategyKey(s,x,y,t)];
    if(e)v+=w[5]*Math.max(-2,Math.min(3,bookValue(e)));
    if(se&&se[0]>=3)v+=w[5]*.65*Math.max(-2,Math.min(3,bookValue(se)));
    /* Anti-motifs séparés : pénalise les schémas qui ont conduit à une victoire humaine. */
    if(antiBook){const ak=antiBook[patKey(s,x,y,opp)];if(ak)v-=w[5]*1.4*Math.max(0,bookValue(ak))}if(antiSBook){const ask=antiSBook[strategyKey(s,x,y,opp)];if(ask&&ask[0]>=2)v-=w[5]*.7*Math.max(0,bookValue(ask));}
    v+=rnd()*L.noise;scored.push({m:[x,y],v,cap:a.bonus});
  }
  scored.sort((p,q)=>q.v-p.v);
  if(L.tactic){
    /* Niveau tactique (sans recherche profonde) : on regarde UN coup adverse et UN coup à soi plus loin.
       - ne pas offrir de capture à l'adversaire ;
       - préférer les coups qui créent des menaces de capture, surtout plusieurs à la fois (fourchette). */
    for(const c of scored.slice(0,TACT_TOP)){
      const a=clone(s);if(!apply(a,c.m))continue;
      if(!c.cap)c.v-=replyGain(a,opp)*w[1]*HARD_REPLY;
      const th=threatCount(a,t,c.m[0],c.m[1]);
      c.v+=Math.min(th,3)*w[0]*TACT_THREAT+(th>=2?w[0]*TACT_FORK:0);
    }
    scored.sort((p,q)=>q.v-p.v);
  }
  if(L.deep&&(!P||P.predictive!==false)){
    const map=predictiveMap(s,opp,FUTURE_HORIZON,L.champion?200:130);
    for(const c of scored){const k=c.m[1]*W+c.m[0],risk=map.risk[k]||0;c.v+=risk*w[2]*.22;if(map.forecast.projected.has(k))c.v+=w[2]*.45}
  }
  if(L.deep&&!late()){
    /* Phase 1 : pénalité tactique immédiate, renforcée si l'adversaire est agressif. */
    const style=opponentStyle(profile),defense=1+style.capture*.35+style.cluster*.2;
    for(const c of scored.slice(0,HARD_TOP)){
      if(c.cap)continue;
      const a=clone(s);apply(a,c.m);
      c.v-=replyGain(a,opp)*w[1]*HARD_REPLY*defense;
    }
    /* Recherche itérative : on conserve toujours le meilleur coup déjà évalué si le budget expire.
       Le cache de transpositions partage les positions identiques entre les branches. */
    const budget=L.champion?1400:900,deadline=nowMs()+budget,ctx={table:new Map(),deadline,aborted:false,nodes:0};
    const maxDepth=Math.min(L.champion?5:SEARCH_DEPTH,s.free<24?5:s.free<80?3:2),baseScores=new Map(scored.map(c=>[c.m.join(','),c.v])),top=L.champion?8:HARD_TOP,beam=L.champion?8:SEARCH_BEAM;
    for(let depth=1;depth<=maxDepth&&!ctx.aborted;depth++){
      const iteration=scored.slice(0,top).map(c=>{
        const a=clone(s);apply(a,c.m);
        return{m:c.m,v:baseScores.get(c.m.join(','))+searchBeam(a,t,depth,beam,w,book,{...L,sbook:strategyBook},profile,ctx)*.22};
      });
      if(!ctx.aborted)for(const q of iteration){const target=scored.find(c=>c.m[0]===q.m[0]&&c.m[1]===q.m[1]);if(target)target.v=q.v}
      scored.sort((p,q)=>q.v-p.v);
    }
    scored.sort((p,q)=>q.v-p.v);
    if(L.champion&&!(P&&P.noMcts)&&!late()){
      const mc=mctsRefine(s,t,scored.slice(0,8),w,profile,rnd,nowMs()+180,180);
      if(mc.move&&legal(s,mc.move[0],mc.move[1]))return mc.move;
    }
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
      let m=aiMove(s,rnd,{...(P||{}),lvl:s.cur?0:1,zone:ZONE});if(!m)break;
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
const api={rival,teamCount,genPuzzle,puzzleSpec,create,scan,apply,legal,links,tmOf,grid,clone,rng,aiMove,learn,teach,observeOpponent,opponentStyle,positionValue,bookValue,patKey,strategyKey,mutate,imaginaryTargets,dijkstraTargets,aStarRoute,forecastOpponent,predictiveMap,mctsRefine,stateHash,rebuildHash:s=>{s._hash=computeHash(s);return s._hash.toString(36)},DEFAULT_W,LEVELS};
root.G2Engine=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
