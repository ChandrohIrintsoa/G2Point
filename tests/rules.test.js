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
test('case déjà jouée refusée',async()=>{await join();await pause();await assertSucceeds(mv('a',5,0));await pause();await assertFails(mv('a',5,0))});
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
  await assertSucceeds(updateDoc(ref('a'),{ended:true}));
  await assertFails(updateDoc(ref('b'),{next:'ZZZZ2'}));             // nextBy manquant
  await assertFails(updateDoc(ref('b'),{next:'ZZZZ2',nextBy:'a'}));  // usurpation d'identité
  await assertFails(updateDoc(ref('b'),{next:'zzzz2',nextBy:'b'}));  // format de code invalide
  await assertSucceeds(updateDoc(ref('b'),{next:'ZZZZ2',nextBy:'b'}));
  await assertFails(updateDoc(ref('a'),{next:'YYYY3',nextBy:'a'}));  // revanche déjà publiée
});
