// Tests des règles Firestore. Nécessitent Java + l'émulateur :
//   npx firebase-tools emulators:exec --only firestore --project g2p-test "npm test"
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,updateDoc,getDoc,getDocs,collection,serverTimestamp,Timestamp,arrayUnion}=require('firebase/firestore');
const test=require('node:test'),fs=require('fs');
let env;
const base=()=>({n:2,tm:false,w:11,h:15,s0:'a',s1:'',s2:'',s3:'',name0:'A',name1:'',name2:'',name3:'',moves:[],cur:0,ended:false,createdAt:serverTimestamp(),expireAt:Timestamp.fromMillis(Date.now()+864e5)});
const db=u=>env.authenticatedContext(u).firestore(),ref=u=>doc(db(u),'games','ABCDE');
/* Les règles imposent 250 ms minimum entre deux coups (mesurées depuis la création de la partie pour le premier coup).
   Sans cette pause, un coup joué juste après la création est refusé pour « trop rapide », pas pour la raison testée. */
const RATE_LIMIT_MS=250,pause=()=>new Promise(r=>setTimeout(r,RATE_LIMIT_MS+100));
test.before(async()=>{env=await initializeTestEnvironment({projectId:'g2p-test',firestore:{rules:fs.readFileSync('firebase/firestore.rules','utf8'),host:'127.0.0.1',port:8080}})});
test.after(()=>env.cleanup());
test.beforeEach(()=>env.clearFirestore());
const join=async()=>{await assertSucceeds(setDoc(ref('a'),base()));await assertSucceeds(updateDoc(ref('b'),{s1:'b',name1:'B'}))};
const mv=(u,cell,cur)=>updateDoc(ref(u),{moves:arrayUnion(cell),cur,lastAt:serverTimestamp()});
test('dimensions du plateau : seules les trois tailles du moteur sont acceptées',async()=>{
  await assertFails(setDoc(ref('a'),{...base(),w:11,h:31}));
  await assertFails(setDoc(ref('a'),{...base(),w:17,h:15}));
  await assertFails(setDoc(ref('a'),{...base(),w:23,h:23}));
  await assertSucceeds(setDoc(ref('a'),base()));
});
test('création et jonction',join);
test('invité sans compte refusé',async()=>assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'games','ABCDE'))));
test('listing des parties refusé',async()=>{await join();await assertFails(getDocs(collection(db('a'),'games')))});
test('coup dans son tour accepté, hors tour refusé',async()=>{
  await join();await pause();
  await assertSucceeds(mv('a',5,1));
  await pause();
  await assertFails(mv('a',6,1));      // hors tour
  await assertFails(mv('c',7,0));      // étranger
  await assertSucceeds(mv('b',6,0));
});
test('coup avant que la salle soit pleine refusé',async()=>{await assertSucceeds(setDoc(ref('a'),base()));await pause();await assertFails(mv('a',5,1))});
test('case déjà jouée refusée',async()=>{await join();await pause();await assertSucceeds(mv('a',5,1));await pause();await assertFails(mv('b',5,0))});
test('abandon refusé tant que le joueur n’est pas inactif',async()=>{
  await join();await assertFails(updateDoc(ref('b'),{ended:true,forfeit:0}));
});
test('abandon volontaire : uniquement pour soi-même',async()=>{
  await join();
  await assertFails(updateDoc(ref('a'),{ended:true,forfeit:1})); // a ne peut pas déclarer forfait à la place de b
  await assertSucceeds(updateDoc(ref('b'),{ended:true,forfeit:1}));
});
test('revanche seulement après la fin, avec les deux champs et un code valide',async()=>{
  await join();
  await assertFails(updateDoc(ref('a'),{next:'ZZZZ2',nextBy:'a'}));  // partie non terminée
  await assertSucceeds(updateDoc(ref('a'),{ended:true,forfeit:0}));  // fin par abandon volontaire
  await assertFails(updateDoc(ref('b'),{next:'ZZZZ2'}));             // nextBy manquant
  await assertFails(updateDoc(ref('b'),{next:'ZZZZ2',nextBy:'a'}));  // usurpation d'identité
  await assertFails(updateDoc(ref('b'),{next:'zzzz2',nextBy:'b'}));  // format de code invalide
  await assertSucceeds(updateDoc(ref('b'),{next:'ZZZZ2',nextBy:'b'}));
  await assertFails(updateDoc(ref('a'),{next:'YYYY3',nextBy:'a'}));  // revanche déjà publiée
});

/* ---- Durcissement (audit) ---- */
const admin=fn=>env.withSecurityRulesDisabled(c=>fn(c.firestore()));
const mvRun=(u,cell,cur,run)=>updateDoc(ref(u),{moves:arrayUnion(cell),cur,run,lastAt:serverTimestamp()});
test('garder la main sans capture est plafonné : série numérotée, 16 maximum',async()=>{
  await join();await pause();
  await assertFails(mv('a',5,0));                 // ancien client : garde la main sans compteur de série
  await assertSucceeds(mvRun('a',5,0,1));         // capture : il rejoue, série 1
  await pause();await assertFails(mvRun('a',6,0,3));   // saut de compteur
  await assertSucceeds(mvRun('a',6,0,2));
  await pause();await assertFails(mvRun('a',7,1,2));   // passer la main impose une série remise à 0
  await assertSucceeds(mvRun('a',7,1,0));
});
test('la série ne peut pas dépasser 16 coups consécutifs',async()=>{
  await join();
  await admin(d=>updateDoc(doc(d,'games','ABCDE'),{run:16,moves:[1,2,3],lastAt:Timestamp.fromMillis(Date.now()-5000)}));
  await assertFails(mvRun('a',9,0,17));
  await assertSucceeds(mvRun('a',9,1,0));
});
test('fin naturelle refusée avant la moitié du plateau, acceptée ensuite',async()=>{
  await join();
  await assertFails(updateDoc(ref('b'),{ended:true}));            // partie à peine commencée
  await admin(d=>updateDoc(doc(d,'games','ABCDE'),{moves:Array.from({length:83},(_,i)=>i)}));
  await assertSucceeds(updateDoc(ref('b'),{ended:true}));
});
test('prise de siège refusée sur une partie terminée ou expirée',async()=>{
  await assertSucceeds(setDoc(ref('a'),base()));
  await admin(d=>updateDoc(doc(d,'games','ABCDE'),{ended:true}));
  await assertFails(updateDoc(ref('b'),{s1:'b',name1:'B'}));
  await admin(d=>updateDoc(doc(d,'games','ABCDE'),{ended:false,expireAt:Timestamp.fromMillis(Date.now()-1000)}));
  await assertFails(updateDoc(ref('b'),{s1:'b',name1:'B'}));
});
test('aucun coup sur une partie expirée',async()=>{
  await join();
  await admin(d=>updateDoc(doc(d,'games','ABCDE'),{expireAt:Timestamp.fromMillis(Date.now()-1000),lastAt:Timestamp.fromMillis(Date.now()-5000)}));
  await assertFails(mv('a',5,1));
});
test('annonce de lobby : doit correspondre exactement à la partie',async()=>{
  await assertSucceeds(setDoc(ref('a'),base()));
  const lob=(over={})=>setDoc(doc(db('a'),'lobby','ABCDE'),{host:'a',n:2,tm:false,w:11,h:15,createdAt:serverTimestamp(),expireAt:Timestamp.fromMillis(Date.now()+3600e3),...over});
  await assertFails(lob({n:4}));       // fausse annonce : la partie est à 2 joueurs
  await assertFails(lob({w:23}));      // mauvaises dimensions
  await assertFails(lob({tm:true}));   // mauvais mode équipes
  await assertSucceeds(lob());
});
