/* Moteur de règles pur (sans DOM) : utilisé par app.js et par les tests Node. */
(function(root){
const N4=[[1,0],[-1,0],[0,1],[0,-1]],N8=[...N4,[1,1],[1,-1],[-1,1],[-1,-1]];
const grid=(W,H,v)=>Array.from({length:H},()=>Array(W).fill(v));
const tmOf=(tm,p)=>tm?p%2:p;
function create(w,h,n,tm){return{n:0,w,h,N:n,tm:!!tm,o:grid(w,h,0),d:grid(w,h,false),sc:Array(tm?2:n).fill(0),loops:[],cur:0,bonus:false,cap:[],capT:0,blk:grid(w,h,false),free:w*h}}
/* Territoire : une zone fermée qui a capturé devient inaccessible pour tous. */
function mark(s,c){for(const [a,b] of c.cells)if(!s.blk[b][a]){s.blk[b][a]=true;if(!s.o[b][a])s.free--}}
/* Zones fermées par l'équipe t : composantes de cases non atteignables depuis le bord */
function scan(s,t){
  const W=s.w,H=s.h,{o,d}=s,wall=(a,b)=>o[b][a]==t+1&&!d[b][a],seen=grid(W,H,false),st=[];
  const push=(a,b)=>{if(!seen[b][a]&&!wall(a,b)){seen[b][a]=true;st.push([a,b])}};
  for(let a=0;a<W;a++){push(a,0);push(a,H-1)}
  for(let b=0;b<H;b++){push(0,b);push(W-1,b)}
  while(st.length){const [a,b]=st.pop();for(const [dx,dy] of N4){const u=a+dx,v=b+dy;if(u>=0&&v>=0&&u<W&&v<H)push(u,v)}}
  const comps=[],vis=grid(W,H,false);
  for(let b=0;b<H;b++)for(let a=0;a<W;a++){
    if(seen[b][a]||wall(a,b)||vis[b][a])continue;
    const cells=[],bd=new Set(),q=[[a,b]];vis[b][a]=true;
    while(q.length){
      const [i,j]=q.pop();cells.push([i,j]);
      for(const [dx,dy] of N8){
        const u=i+dx,v=j+dy;if(u<0||v<0||u>=W||v>=H)continue;
        if(wall(u,v))bd.add(v*W+u);
        else if(dx*dy==0&&!seen[v][u]&&!vis[v][u]){vis[v][u]=true;q.push([u,v])}
      }
    }
    comps.push({cells,bd});
  }
  return comps;
}
function apply(s,[x,y]){
  const K=s.tm?2:s.N,t=tmOf(s.tm,s.cur);s.o[y][x]=t+1;s.free--;let g=0;s.cap=[];s.capT=t;
  for(const c of scan(s,t)){
    const vic=c.cells.filter(([a,b])=>s.o[b][a]&&s.o[b][a]!=t+1&&!s.d[b][a]);
    if(vic.length){vic.forEach(([a,b])=>s.d[b][a]=true);s.sc[t]+=vic.length;g+=vic.length;s.loops.push({t,c});mark(s,c);s.cap.push(...vic)}
  }
  if(!g)for(let u=0;u<K;u++){ /* piège : point posé dans une zone déjà fermée par un adversaire */
    if(u==t)continue;
    const c=scan(s,u).find(c=>c.cells.some(([a,b])=>a==x&&b==y));
    if(c){s.d[y][x]=true;s.sc[u]++;s.loops.push({t:u,c});mark(s,c);s.cap=[[x,y]];s.capT=u;break}
  }
  s.bonus=g>0;if(!s.bonus)s.cur=(s.cur+1)%s.N; /* capture = le même joueur rejoue */
}
const clone=s=>({...s,o:s.o.map(r=>r.slice()),d:s.d.map(r=>r.slice()),blk:s.blk.map(r=>r.slice()),sc:s.sc.slice(),loops:[],cap:[]});
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
/* Rejoue une partie et enregistre, pour chaque coup, [fois joué, gain cumulé, victoires du joueur] */
function learn(book,mv,w,h,n,tm,win){
  const s=create(w,h,n,tm);
  for(const m of mv){
    const t=tmOf(tm,s.cur),k=patKey(s,m[0],m[1],t);
    apply(s,m);
    const gain=s.capT==t?s.cap.length:-s.cap.length,e=book[k]||(book[k]=[0,0,0]);
    e[0]++;e[1]+=gain;if(win.includes(t))e[2]++;
  }
}
function aiMove(s,rnd=Math.random,P){
  const W=s.w,H=s.h,t=tmOf(s.tm,s.cur),opp=1-t,cand=[],w=(P&&P.w)||DEFAULT_W,book=P&&P.book;let any=false;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(s.o[y][x]){any=true;continue}
    if(s.blk[y][x])continue; /* territoire fermé : interdit */
    let near=false;
    for(let j=-2;j<=2&&!near;j++)for(let i=-2;i<=2;i++){const a=x+i,b=y+j;if(a>=0&&b>=0&&a<W&&b<H&&s.o[b][a]){near=true;break}}
    if(near)cand.push([x,y]);
  }
  if(!any){const c=[W>>1,H>>1];return s.blk[c[1]][c[0]]?null:c}
  if(!cand.length){for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!s.o[y][x]&&!s.blk[y][x])return[x,y];return null}
  let best=cand[0],bv=-1e9;
  for(const [x,y] of cand){
    const a=clone(s);apply(a,[x,y]);
    let v=(a.sc[t]-s.sc[t])*w[0]-(a.sc[opp]-s.sc[opp])*w[1];
    const b=clone(s);b.cur=opp;apply(b,[x,y]);v+=(b.sc[opp]-s.sc[opp])*w[2]; /* case où l'adversaire capturerait */
    for(const [dx,dy] of N8){const u=x+dx,q=y+dy;if(u<0||q<0||u>=W||q>=H)continue;const p=s.o[q][u];if(p==t+1)v+=w[3];else if(p)v+=w[4]}
    const e=book&&book[patKey(s,x,y,t)];
    if(e)v+=w[5]*Math.max(-2,Math.min(3,(e[1]*1.5+e[2]*.8)/(e[0]+2))); /* techniques vues dans les parties */
    v+=rnd()*.3;if(v>bv){bv=v;best=[x,y]}
  }
  return best;
}
const api={create,scan,apply,tmOf,grid,clone,rng,aiMove,learn,patKey,mutate,DEFAULT_W};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.G2Engine=api;
})(typeof window!=='undefined'?window:globalThis);
