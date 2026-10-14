/* API G2Point (Cloudflare Worker + D1).
   - POST /api/archive : enregistre une partie terminée APRÈS l'avoir rejouée avec le moteur (aucune confiance au client),
                         puis fait apprendre l'IA partagée à partir de ses coups.
   - GET  /api/ai      : renvoie la mémoire partagée de l'IA (motifs + nombre de parties apprises).
   Le même moteur que le jeu est utilisé (public/js/engine.js), donc règles et zones confinées identiques. */
import E from '../public/js/engine.js';

const SIZES=new Set(['11x15','17x23','23x31']),MAX_BODY=96*1024,MIN_MOVES=6,MAX_PER_HOUR_IP=40,MAX_PER_HOUR_PLAYER=20,
  BOOK_MAX=1500,BOOK_KEEP=1200,MODES=new Set(['local','ai','daily','online']),RESULTS=new Set(['win','loss','draw','na']);
const ID_RE=/^[A-Za-z0-9_-]{6,64}$/;

const cors=(req,env)=>{
  const o=req.headers.get('Origin')||'',ok=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  return ok.includes(o)?{'Access-Control-Allow-Origin':o,'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'}:null;
};
const json=(data,status,h)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...h}});

async function sha(txt){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return[...new Uint8Array(b)].slice(0,12).map(x=>x.toString(16).padStart(2,'0')).join('')}

/* Rejoue la partie : renvoie null si un coup est illégal (hors terrain, case occupée, territoire confiné). */
export function validate(b){
  if(!b||typeof b!=='object')return null;
  const {gameId,playerId,w,h,n,tm,mode,result,moves}=b;
  if(!ID_RE.test(gameId||'')||!ID_RE.test(playerId||''))return null;
  if(!SIZES.has(w+'x'+h)||![2,3,4].includes(n)||(tm&&n!==4))return null;
  if(!MODES.has(mode)||!RESULTS.has(result))return null;
  if(!Array.isArray(moves)||moves.length<MIN_MOVES||moves.length>w*h)return null;
  const s=E.create(w,h,n,!!tm),mv=[];
  for(const m of moves){
    if(!Array.isArray(m)||m.length!==2||!Number.isInteger(m[0])||!Number.isInteger(m[1]))return null;
    if(!E.apply(s,m))return null;mv.push([m[0],m[1]]);
  }
  const mx=Math.max(...s.sc),win=s.sc.map((v,i)=>v===mx?i:-1).filter(i=>i>=0);
  return{gameId,playerId,w,h,n,tm:!!tm,mode,result,mv,win:mx>0?win:[],sc:s.sc};
}

const getStat=async(db,k)=>{const r=await db.prepare('SELECT statistic_value v FROM game_statistics WHERE statistic_key=?').bind(k).first();return r?r.v:null};
const setStat=(db,k,v)=>db.prepare('INSERT INTO game_statistics(statistic_key,statistic_value,updated_at) VALUES(?,?,unixepoch()) ON CONFLICT(statistic_key) DO UPDATE SET statistic_value=excluded.statistic_value,updated_at=unixepoch()').bind(k,v);

const validPlayerId=v=>typeof v==='string'&&ID_RE.test(v);
const readJson=async(req,max=32768)=>{
  const raw=await req.text();
  if(raw.length>max)return{error:413};
  try{return{value:JSON.parse(raw)}}catch{return{error:400}}
};
const safeObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
const getPlayerId=(req,url)=>url.searchParams.get('playerId')||'';
async function handleProfile(req,env,h){
  const db=env.DB;
  if(req.method==='GET'){
    const id=getPlayerId(req,new URL(req.url));
    if(!validPlayerId(id))return json({error:'identifiant invalide'},400,h);
    const row=await db.prepare('SELECT nickname,created_at,updated_at FROM player_profiles WHERE player_id=?').bind(id).first();
    return json({profile:row||null},200,h);
  }
  if(req.method==='PUT'){
    const p=await readJson(req,4096);if(p.error)return json({error:'requête invalide'},p.error,h);
    const b=p.value||{};
    if(!validPlayerId(b.playerId)||typeof b.nickname!=='string')return json({error:'profil invalide'},422,h);
    const nickname=b.nickname.replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,20)||'Joueur';
    await db.prepare('INSERT INTO player_profiles(player_id,nickname,created_at,updated_at) VALUES(?,?,unixepoch(),unixepoch()) ON CONFLICT(player_id) DO UPDATE SET nickname=excluded.nickname,updated_at=unixepoch()').bind(b.playerId,nickname).run();
    return json({ok:true,nickname},200,h);
  }
  return json({error:'méthode refusée'},405,h);
}
async function handleProgress(req,env,h){
  const db=env.DB;
  if(req.method==='GET'){
    const id=getPlayerId(req,new URL(req.url));
    if(!validPlayerId(id))return json({error:'identifiant invalide'},400,h);
    const row=await db.prepare('SELECT progress_json,updated_at FROM player_progress WHERE player_id=?').bind(id).first();
    let progress=null;try{progress=row?JSON.parse(row.progress_json):null}catch{}
    return json({progress,updatedAt:row?.updated_at||null},200,h);
  }
  if(req.method==='PUT'){
    const p=await readJson(req,32768);if(p.error)return json({error:'requête invalide'},p.error,h);
    const b=p.value||{};
    if(!validPlayerId(b.playerId)||!safeObject(b.progress))return json({error:'progression invalide'},422,h);
    const allowed=['streak','best','elo','ach','h2h'];
    if(Object.keys(b.progress).some(k=>!allowed.includes(k)))return json({error:'champs refusés'},422,h);
    const payload=JSON.stringify(b.progress);
    await db.prepare('INSERT INTO player_progress(player_id,progress_json,updated_at) VALUES(?,?,unixepoch()) ON CONFLICT(player_id) DO UPDATE SET progress_json=excluded.progress_json,updated_at=unixepoch()').bind(b.playerId,payload).run();
    return json({ok:true,updatedAt:Math.floor(Date.now()/1000)},200,h);
  }
  return json({error:'méthode refusée'},405,h);
}
async function handlePlayerAi(req,env,h){
  const db=env.DB;
  if(req.method==='GET'){
    const id=getPlayerId(req,new URL(req.url));
    if(!validPlayerId(id))return json({error:'identifiant invalide'},400,h);
    const row=await db.prepare('SELECT weights_json,games,wins,updated_at FROM player_ai WHERE player_id=?').bind(id).first();
    let weights=null;try{weights=row?JSON.parse(row.weights_json):null}catch{}
    return json({training:row?{weights,games:row.games,wins:row.wins,updatedAt:row.updated_at}:null},200,h);
  }
  if(req.method==='PUT'){
    const p=await readJson(req,4096);if(p.error)return json({error:'requête invalide'},p.error,h);
    const b=p.value||{},weights=b.weights;
    if(!validPlayerId(b.playerId)||!Array.isArray(weights)||weights.length!==6||weights.some(v=>!Number.isFinite(v)||v<0||v>100))return json({error:'paramètres IA invalides'},422,h);
    const games=Math.max(0,Math.min(10000000,Math.floor(Number(b.games)||0)));
    const wins=Math.max(0,Math.min(games,Math.floor(Number(b.wins)||0)));
    await db.prepare('INSERT INTO player_ai(player_id,weights_json,games,wins,updated_at) VALUES(?,?,?,?,unixepoch()) ON CONFLICT(player_id) DO UPDATE SET weights_json=excluded.weights_json,games=MAX(player_ai.games,excluded.games),wins=MAX(player_ai.wins,excluded.wins),updated_at=unixepoch()').bind(b.playerId,JSON.stringify(weights),games,wins).run();
    return json({ok:true},200,h);
  }
  return json({error:'méthode refusée'},405,h);
}

function trim(book){
  const ks=Object.keys(book);if(ks.length<=BOOK_MAX)return book;
  ks.sort((a,b)=>book[b][0]-book[a][0]);const nb={};ks.slice(0,BOOK_KEEP).forEach(k=>nb[k]=book[k]);return nb;
}

export async function handleArchive(req,env,h){
  const raw=await req.text();if(raw.length>MAX_BODY)return json({error:'trop gros'},413,h);
  let body;try{body=JSON.parse(raw)}catch(e){return json({error:'json invalide'},400,h)}
  const g=validate(body);if(!g)return json({error:'partie invalide'},422,h);
  const db=env.DB,ip=await sha((env.IP_SALT||'')+(req.headers.get('CF-Connecting-IP')||'?')),since="unixepoch()-3600";
  const c1=await db.prepare('SELECT COUNT(*) c FROM game_archives WHERE ip_hash=? AND created_at>'+since).bind(ip).first();
  const c2=await db.prepare('SELECT COUNT(*) c FROM game_archives WHERE player_id=? AND created_at>'+since).bind(g.playerId).first();
  if(c1.c>=MAX_PER_HOUR_IP||c2.c>=MAX_PER_HOUR_PLAYER)return json({error:'trop de parties, réessayez plus tard'},429,h);
  const ins=await db.prepare('INSERT OR IGNORE INTO game_archives(game_id,player_id,result,moves_json,width,height,players,team,mode,ip_hash) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(g.gameId,g.playerId,g.result,JSON.stringify(g.mv),g.w,g.h,g.n,g.tm?1:0,g.mode,ip).run();
  if(!ins.meta||!ins.meta.changes)return json({ok:true,duplicate:true},200,h); /* déjà reçue : on n'apprend pas deux fois */
  /* La mémoire v2 n'apprend que des coups joués par l'IA dans les parties Solo.
     Les anciennes archives (parties humaines et auto-simulations) ne doivent plus polluer sa stratégie. */
  let games=+await getStat(db,'ai_games_v2')||0;
  if(g.mode==='ai'){
    let book={};try{book=JSON.parse(await getStat(db,'ai_book_v2')||'{}')}catch(e){}
    E.learn(book,g.mv,g.w,g.h,g.n,g.tm,g.win,1);book=trim(book);
    games++;
    await db.batch([setStat(db,'ai_book_v2',JSON.stringify(book)),setStat(db,'ai_games_v2',String(games))]);
  }
  return json({ok:true,games},200,h);
}

export async function handleAi(env,h){
  const db=env.DB;let book={};try{book=JSON.parse(await getStat(db,'ai_book_v2')||'{}')}catch(e){}
  return json({schema:2,book,games:+await getStat(db,'ai_games_v2')||0},200,{...h,'Cache-Control':'public, max-age=60'});
}

export default{
  async fetch(req,env){
    const url=new URL(req.url),h=cors(req,env);
    if(req.method==='OPTIONS')return new Response(null,{status:h?204:403,headers:h||{}});
    if(!h)return json({error:'origine non autorisée'},403,{});
    try{
      if(url.pathname==='/api/archive'&&req.method==='POST')return await handleArchive(req,env,h);
      if(url.pathname==='/api/ai'&&req.method==='GET')return await handleAi(env,h);
      if(url.pathname==='/api/profile')return await handleProfile(req,env,h);
      if(url.pathname==='/api/progress')return await handleProgress(req,env,h);
      if(url.pathname==='/api/ai/player')return await handlePlayerAi(req,env,h);
      return json({error:'introuvable'},404,h);
    }catch(e){return json({error:'erreur serveur'},500,h)}
  }
};
