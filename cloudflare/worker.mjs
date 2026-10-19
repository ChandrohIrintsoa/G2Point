/* API G2Point (Cloudflare Worker + D1).
   - POST /api/archive : rejoue les coups avec le moteur avant d'archiver la partie.
   - GET  /api/ai      : endpoint conservé pour compatibilité ; apprentissage partagé désactivé
                        tant que les archives ne sont pas attribuées à des identités vérifiées.
   - Identité : si FIREBASE_PROJECT_ID est défini, les routes privées exigent un jeton Firebase (Authorization: Bearer)
     vérifié cryptographiquement ; chaque playerId est lié au uid qui l'a réclamé en premier.
   - Limites : corps lu en flux avec plafond, compteurs de fréquence atomiques dans D1.
   Le même moteur que le jeu est utilisé (public/js/engine.js). */
import '../public/js/engine.js';
const E=globalThis.G2Engine;

const SIZES=new Set(['11x15','17x23','23x31']),MAX_BODY=96*1024,MIN_MOVES=6,MAX_PER_HOUR_IP=40,MAX_PER_HOUR_PLAYER=20,
  MODES=new Set(['local','ai','daily','online']);
const ID_RE=/^[A-Za-z0-9_-]{6,64}$/; // Identifiant de joueur généré côté client.
const GAME_ID_RE=/^[A-Za-z0-9_-]{5,64}$/; // Les salons Firestore utilisent 5 caractères.

const cors=(req,env)=>{
  const o=req.headers.get('Origin')||'',ok=(env.ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean);
  return ok.includes(o)?{'Access-Control-Allow-Origin':o,'Vary':'Origin','Access-Control-Allow-Methods':'GET,POST,PUT,OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Max-Age':'86400'}:null;
};
const json=(data,status,h)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...h}});

async function sha(txt){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(txt));return[...new Uint8Array(b)].slice(0,12).map(x=>x.toString(16).padStart(2,'0')).join('')}

/* Rejoue la partie : renvoie null si un coup est illégal (hors terrain, case occupée, territoire confiné). */
export function validate(b){
  if(!b||typeof b!=='object'||Array.isArray(b))return null;
  const {gameId,playerId,w,h,n,tm,mode,moves,forfeit}=b;
  if(typeof gameId!=='string'||!GAME_ID_RE.test(gameId)||typeof playerId!=='string'||!ID_RE.test(playerId))return null;
  if(!Number.isInteger(w)||!Number.isInteger(h)||!SIZES.has(w+'x'+h))return null;
  if(!Number.isInteger(n)||![2,3,4].includes(n)||typeof tm!=='boolean'||(tm&&n!==4))return null;
  if(typeof mode!=='string'||!MODES.has(mode))return null;
  if(!Array.isArray(moves)||moves.length<MIN_MOVES||moves.length>w*h)return null;
  const s=E.create(w,h,n,tm),mv=[];
  for(const m of moves){
    if(!Array.isArray(m)||m.length!==2||!Number.isInteger(m[0])||!Number.isInteger(m[1]))return null;
    if(!E.apply(s,m))return null;
    mv.push([m[0],m[1]]);
  }
  // Abandon : équipe fautive exclue du classement, comme dans le navigateur (result()). Seul le mode en ligne en connaît.
  const K=s.sc.length;
  if(forfeit!==undefined&&forfeit!==null&&(!Number.isInteger(forfeit)||forfeit<0||forfeit>=K||mode!=='online'))return null;
  const fl=Number.isInteger(forfeit)?forfeit:-1,pool=s.sc.map((v,i)=>i).filter(i=>i!==fl);
  const mx=Math.max(...pool.map(i=>s.sc[i])),win=pool.filter(i=>s.sc[i]===mx);
  // Le champ result fourni par le navigateur n'est jamais considéré comme une preuve.
  const result=fl===0?'loss':(mx===0&&fl<0)?'draw':win.includes(0)?(win.length>1?'draw':'win'):'loss';
  return{gameId,playerId,w,h,n,tm,mode,result,mv,win:(mx>0||fl>=0)?win:[],sc:s.sc,forfeit:fl};
}

const validPlayerId=v=>typeof v==='string'&&ID_RE.test(v);
/* Lecture du corps en flux avec plafond : on refuse dès l'en-tête Content-Length, puis on coupe la lecture au-delà du plafond
   (le corps complet n'est jamais chargé en mémoire avant le contrôle). */
export async function readBody(req,max){
  const len=Number(req.headers.get('Content-Length'));
  if(Number.isFinite(len)&&len>max)return{error:413};
  if(!req.body)return{text:''};
  const reader=req.body.getReader(),chunks=[];let total=0;
  for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    total+=value.byteLength;
    if(total>max){try{await reader.cancel()}catch{}return{error:413}}
    chunks.push(value);
  }
  const buf=new Uint8Array(total);let o=0;for(const c of chunks){buf.set(c,o);o+=c.byteLength}
  return{text:new TextDecoder().decode(buf)};
}
const readJson=async(req,max=32768)=>{
  const b=await readBody(req,max);
  if(b.error)return{error:b.error};
  try{return{value:JSON.parse(b.text)}}catch{return{error:400}}
};

/* ---------- Identité (jetons Firebase) ---------- */
const JWKS_URL='https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const b64u=t=>{t=t.replace(/-/g,'+').replace(/_/g,'/');t+='='.repeat((4-t.length%4)%4);return Uint8Array.from(atob(t),c=>c.charCodeAt(0))};
const b64uText=t=>new TextDecoder().decode(b64u(t));
let jwksCache={at:0,keys:null};
async function getJwks(env){
  if(env.FIREBASE_JWKS)return JSON.parse(env.FIREBASE_JWKS).keys; // surcharge (tests)
  if(jwksCache.keys&&Date.now()-jwksCache.at<36e5)return jwksCache.keys;
  const r=await fetch(JWKS_URL,{cf:{cacheTtl:3600,cacheEverything:true}});
  if(!r.ok)throw new Error('JWKS '+r.status);
  jwksCache={at:Date.now(),keys:(await r.json()).keys||[]};return jwksCache.keys;
}
/* Vérifie un jeton d'identité Firebase (RS256) : signature, audience, émetteur, expiration. Retourne {uid} ou null. */
export async function verifyFirebaseToken(token,env,now=Date.now()){
  try{
    if(typeof token!=='string'||token.length>4096||!env.FIREBASE_PROJECT_ID)return null;
    const parts=token.split('.');if(parts.length!==3)return null;
    const header=JSON.parse(b64uText(parts[0])),p=JSON.parse(b64uText(parts[1])),pid=env.FIREBASE_PROJECT_ID,sec=Math.floor(now/1000);
    if(header.alg!=='RS256'||typeof header.kid!=='string')return null;
    if(p.aud!==pid||p.iss!=='https://securetoken.google.com/'+pid)return null;
    if(typeof p.sub!=='string'||!p.sub||p.sub.length>128)return null;
    if(!Number.isFinite(p.exp)||p.exp<=sec||(Number.isFinite(p.iat)&&p.iat>sec+300))return null;
    const jwk=(await getJwks(env)).find(k=>k.kid===header.kid);if(!jwk)return null;
    const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,b64u(parts[2]),new TextEncoder().encode(parts[0]+'.'+parts[1]));
    return ok?{uid:p.sub}:null;
  }catch{return null}
}
let tablesReady=false;
async function ensureTables(db){
  if(tablesReady)return;
  await db.prepare('CREATE TABLE IF NOT EXISTS player_owner(player_id TEXT PRIMARY KEY, uid TEXT NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch()))').run();
  await db.prepare('CREATE TABLE IF NOT EXISTS rate_limits(k TEXT PRIMARY KEY, c INTEGER NOT NULL, exp INTEGER NOT NULL)').run();
  tablesReady=true;
}
export const _resetForTests=()=>{tablesReady=false;jwksCache={at:0,keys:null}};
/* Lie un playerId au uid Firebase qui le réclame en premier ; tout autre uid est refusé (403). */
async function bindOwner(db,playerId,uid){
  await ensureTables(db);
  let row=await db.prepare('SELECT uid FROM player_owner WHERE player_id=?').bind(playerId).first();
  if(!row){await db.prepare('INSERT OR IGNORE INTO player_owner(player_id,uid) VALUES(?,?)').bind(playerId,uid).run();row=await db.prepare('SELECT uid FROM player_owner WHERE player_id=?').bind(playerId).first()}
  return !!row&&row.uid===uid;
}
/* Portail des routes privées. Retourne une Response d'erreur, ou null si l'accès est autorisé.
   Sans FIREBASE_PROJECT_ID (installation ancienne), le comportement historique est conservé. */
async function gate(req,env,h,playerId){
  if(!env.FIREBASE_PROJECT_ID||!env.DB)return null;
  const m=/^Bearer (.+)$/.exec(req.headers.get('Authorization')||'');
  const who=m?await verifyFirebaseToken(m[1],env):null;
  if(!who)return json({error:'authentification requise'},401,{...h,'WWW-Authenticate':'Bearer'});
  if(!(await bindOwner(env.DB,playerId,who.uid)))return json({error:'identifiant de joueur déjà réclamé par un autre compte'},403,h);
  return null;
}
/* ---------- Limitation de fréquence atomique ---------- */
async function rateOk(db,key,limit,windowSec){
  try{
    await ensureTables(db);
    const win=Math.floor(Date.now()/1000/windowSec),k=key+':'+win;
    const row=await db.prepare('INSERT INTO rate_limits(k,c,exp) VALUES(?,1,unixepoch()+?) ON CONFLICT(k) DO UPDATE SET c=c+1 RETURNING c').bind(k,windowSec*2).first();
    if(Math.random()<.01)await db.prepare('DELETE FROM rate_limits WHERE exp<unixepoch()').run();
    return (row&&row.c||1)<=limit;
  }catch(e){console.error('[G2Point Worker] limitation indisponible',e&&e.message);return true} // en cas de panne D1 on laisse passer plutôt que de couper le jeu
}
const ipHash=(req,env)=>sha((env.IP_SALT||'')+(req.headers.get('CF-Connecting-IP')||'?'));
const safeObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
const getPlayerId=(req,url)=>url.searchParams.get('playerId')||'';
async function handleProfile(req,env,h){
  const db=env.DB;
  if(req.method==='GET'){
    const id=getPlayerId(req,new URL(req.url));
    if(!validPlayerId(id))return json({error:'identifiant invalide'},400,h);
    {const denied=await gate(req,env,h,id);if(denied)return denied}
    const row=await db.prepare('SELECT nickname,created_at,updated_at FROM player_profiles WHERE player_id=?').bind(id).first();
    return json({profile:row||null},200,h);
  }
  if(req.method==='PUT'){
    const p=await readJson(req,4096);if(p.error)return json({error:'requête invalide'},p.error,h);
    const b=p.value||{};
    if(!validPlayerId(b.playerId)||typeof b.nickname!=='string')return json({error:'profil invalide'},422,h);
    {const denied=await gate(req,env,h,b.playerId);if(denied)return denied}
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
    {const denied=await gate(req,env,h,id);if(denied)return denied}
    const row=await db.prepare('SELECT progress_json,updated_at FROM player_progress WHERE player_id=?').bind(id).first();
    let progress=null;try{progress=row?JSON.parse(row.progress_json):null}catch{}
    return json({progress,updatedAt:row?.updated_at||null},200,h);
  }
  if(req.method==='PUT'){
    const p=await readJson(req,32768);if(p.error)return json({error:'requête invalide'},p.error,h);
    const b=p.value||{};
    if(!validPlayerId(b.playerId)||!safeObject(b.progress))return json({error:'progression invalide'},422,h);
    {const denied=await gate(req,env,h,b.playerId);if(denied)return denied}
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
    {const denied=await gate(req,env,h,id);if(denied)return denied}
    const row=await db.prepare('SELECT weights_json,games,wins,updated_at FROM player_ai WHERE player_id=?').bind(id).first();
    let weights=null;try{weights=row?JSON.parse(row.weights_json):null}catch{}
    return json({training:row?{weights,games:row.games,wins:row.wins,updatedAt:row.updated_at}:null},200,h);
  }
  if(req.method==='PUT'){
    const p=await readJson(req,4096);if(p.error)return json({error:'requête invalide'},p.error,h);
    const b=p.value||{},weights=b.weights;
    if(!validPlayerId(b.playerId)||!Array.isArray(weights)||weights.length!==6||weights.some(v=>!Number.isFinite(v)||v<0||v>100))return json({error:'paramètres IA invalides'},422,h);
    {const denied=await gate(req,env,h,b.playerId);if(denied)return denied}
    const games=Math.max(0,Math.min(10000000,Math.floor(Number(b.games)||0)));
    const wins=Math.max(0,Math.min(games,Math.floor(Number(b.wins)||0)));
    await db.prepare('INSERT INTO player_ai(player_id,weights_json,games,wins,updated_at) VALUES(?,?,?,?,unixepoch()) ON CONFLICT(player_id) DO UPDATE SET weights_json=excluded.weights_json,games=MAX(player_ai.games,excluded.games),wins=MAX(player_ai.wins,excluded.wins),updated_at=unixepoch()').bind(b.playerId,JSON.stringify(weights),games,wins).run();
    return json({ok:true},200,h);
  }
  return json({error:'méthode refusée'},405,h);
}

export async function handleArchive(req,env,h){
  const rb=await readBody(req,MAX_BODY);
  if(rb.error)return json({error:'trop gros'},rb.error,h);
  let body;
  try{body=JSON.parse(rb.text)}catch{return json({error:'json invalide'},400,h)}
  const g=validate(body);
  if(!g)return json({error:'partie invalide'},422,h);
  const db=env.DB;
  if(!db)return json({error:'stockage indisponible'},503,h);
  const denied=await gate(req,env,h,g.playerId);if(denied)return denied;
  const ip=await ipHash(req,env);
  /* compteurs atomiques (INSERT … ON CONFLICT … RETURNING) : des requêtes simultanées ne peuvent plus dépasser la limite */
  if(!(await rateOk(db,'arch:ip:'+ip,MAX_PER_HOUR_IP,3600))||!(await rateOk(db,'arch:p:'+g.playerId,MAX_PER_HOUR_PLAYER,3600)))return json({error:'trop de parties, réessayez plus tard'},429,h);
  const ins=await db.prepare('INSERT OR IGNORE INTO game_archives(game_id,player_id,result,moves_json,width,height,players,team,mode,ip_hash) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(g.gameId,g.playerId,g.result,JSON.stringify(g.mv),g.w,g.h,g.n,g.tm?1:0,g.mode,ip).run();
  if(!ins.meta||!ins.meta.changes)return json({ok:true,duplicate:true,sharedLearning:false},200,h);
  // Le mode envoyé par le navigateur n'est pas fiable : les archives ne nourrissent plus le livre IA global.
  return json({ok:true,archived:true,sharedLearning:false},200,h);
}

export async function handleAi(_env,h){
  // Mémoire partagée désactivée tant que les archives ne sont pas authentifiées.
  return json({schema:3,book:{},games:0,learning:false},200,{...h,'Cache-Control':'public, max-age=60'});
}

export default{
  async fetch(req,env){
    const url=new URL(req.url),allowed=cors(req,env),requestId=req.headers.get('cf-ray')||crypto.randomUUID();
    const h={...(allowed||{}),'X-Request-ID':requestId};
    if(req.method==='OPTIONS')return new Response(null,{status:allowed?204:403,headers:h});
    if(!allowed)return json({error:'origine non autorisée',requestId},403,h);
    try{
      if(url.pathname==='/api/archive'&&req.method==='POST')return await handleArchive(req,env,h);
      if(url.pathname==='/api/ai'&&req.method==='GET')return await handleAi(env,h);
      if(/^\/api\/(profile|progress|ai\/player)$/.test(url.pathname)&&env.DB){
        const write=req.method!=='GET',ip=await ipHash(req,env);
        if(!(await rateOk(env.DB,(write?'w:':'r:')+ip,write?30:120,60)))return json({error:'trop de requêtes, réessayez dans une minute',requestId},429,{...h,'Retry-After':'60'});
      }
      if(url.pathname==='/api/profile')return await handleProfile(req,env,h);
      if(url.pathname==='/api/progress')return await handleProgress(req,env,h);
      if(url.pathname==='/api/ai/player')return await handlePlayerAi(req,env,h);
      return json({error:'introuvable'},404,h);
    }catch(e){
      console.error('[G2Point Worker]',{requestId,method:req.method,path:url.pathname,error:e&&e.message||String(e),stack:e&&e.stack||null});
      return json({error:'erreur serveur',requestId},500,h);
    }
  }
};
