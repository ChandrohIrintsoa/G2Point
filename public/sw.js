/* Cache hors-ligne : le réseau d'abord (une mise en ligne est visible dès le rechargement), le cache en secours sans connexion.
   L'ancienne stratégie « cache d'abord » resservait l'ancienne page après un déploiement : anciens bugs affichés jusqu'à un 2e rechargement. */
const V='g2p-v12',A=['./','css/style.css','css/enhancements.css','js/engine.js','js/puzzles.js','js/cloud-config.js','js/app.js','js/enhancements.js','js/firebase-config.js','manifest.webmanifest','icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(A)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{
    if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp))}
    return res;
  }).catch(()=>caches.match(r).then(hit=>hit||caches.match('./'))));
});
