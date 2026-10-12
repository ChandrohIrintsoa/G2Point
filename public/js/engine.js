/* Moteur de règles pur (sans DOM) : utilisé par app.js et par les tests Node. */
(function(root){
const N4=[[1,0],[-1,0],[0,1],[0,-1]],N8=[...N4,[1,1],[1,-1],[-1,1],[-1,-1]];
const grid=(W,H,v)=>Array.from({length:H},()=>Array(W).fill(v));
const tmOf=(tm,p)=>tm?p%2:p;
function create(w,h,n,tm){return{n:0,w,h,N:n,tm:!!tm,o:grid(w,h,0),d:grid(w,h,false),sc:Array(tm?2:n).fill(0),loops:[],cur:0,bonus:false,cap:[],capT:0}}
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
  const K=s.tm?2:s.N,t=tmOf(s.tm,s.cur);s.o[y][x]=t+1;let g=0;s.cap=[];s.capT=t;
  for(const c of scan(s,t)){
    const vic=c.cells.filter(([a,b])=>s.o[b][a]&&s.o[b][a]!=t+1&&!s.d[b][a]);
    if(vic.length){vic.forEach(([a,b])=>s.d[b][a]=true);s.sc[t]+=vic.length;g+=vic.length;s.loops.push({t,c});s.cap.push(...vic)}
  }
  if(!g)for(let u=0;u<K;u++){ /* piège : point posé dans une zone déjà fermée par un adversaire */
    if(u==t)continue;
    const c=scan(s,u).find(c=>c.cells.some(([a,b])=>a==x&&b==y));
    if(c){s.d[y][x]=true;s.sc[u]++;s.loops.push({t:u,c});s.cap=[[x,y]];s.capT=u;break}
  }
  s.bonus=g>0;if(!s.bonus)s.cur=(s.cur+1)%s.N; /* capture = le même joueur rejoue */
}
const clone=s=>({...s,o:s.o.map(r=>r.slice()),d:s.d.map(r=>r.slice()),sc:s.sc.slice(),loops:[],cap:[]});
const rng=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}; /* mulberry32 */
/* IA (duel) : gloutonne à 1 coup — gagne des points, évite les pièges, bloque les captures adverses. */
function aiMove(s,rnd=Math.random){
  const W=s.w,H=s.h,t=tmOf(s.tm,s.cur),opp=1-t,cand=[];let any=false;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
    if(s.o[y][x]){any=true;continue}
    let near=false;
    for(let j=-2;j<=2&&!near;j++)for(let i=-2;i<=2;i++){const a=x+i,b=y+j;if(a>=0&&b>=0&&a<W&&b<H&&s.o[b][a]){near=true;break}}
    if(near)cand.push([x,y]);
  }
  if(!any)return[W>>1,H>>1];
  let best=cand[0],bv=-1e9;
  for(const [x,y] of cand){
    const a=clone(s);apply(a,[x,y]);
    let v=(a.sc[t]-s.sc[t]-(a.sc[opp]-s.sc[opp]))*10;
    const b=clone(s);b.cur=opp;apply(b,[x,y]);v+=(b.sc[opp]-s.sc[opp])*7; /* case où l'adversaire capturerait */
    for(const [dx,dy] of N8){const u=x+dx,w=y+dy;if(u<0||w<0||u>=W||w>=H)continue;const p=s.o[w][u];if(p==t+1)v+=.4;else if(p)v+=.2}
    v+=rnd()*.3;if(v>bv){bv=v;best=[x,y]}
  }
  return best;
}
const api={create,scan,apply,tmOf,grid,clone,rng,aiMove};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.G2Engine=api;
})(typeof window!=='undefined'?window:globalThis);
