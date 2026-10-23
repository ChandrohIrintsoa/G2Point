'use strict';
/* Tests de propriétés : parties aléatoires (fuzz), invariants vérifiés après CHAQUE coup, indépendamment des valeurs attendues historiques. */
const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../public/js/engine.js');

/* `free` = cases jouables : ni occupées, ni en territoire bloqué (c'est la définition de legal()) */
function emptyCount(s){let n=0;for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)if(E.legal(s,x,y))n++;return n}
function checkInvariants(s,label){
  assert.ok(s.free>=0&&s.free<=s.w*s.h,label+' : free hors bornes');
  assert.equal(s.free,emptyCount(s),label+' : free ≠ cases libres');
  const stored=s._hash!=null?s._hash.toString(36):null;
  if(stored!==null)assert.equal(E.rebuildHash(Object.assign(E.clone(s),{})),stored,label+' : hash incrémental ≠ reconstruit');
  for(const v of s.sc)assert.ok(Number.isFinite(v)&&v>=0,label+' : score invalide');
}
function fuzz(n,tm,seed,w=8,h=8,plies=70){
  const s=E.create(w,h,n,tm),r=E.rng(seed);
  for(let i=0;i<plies&&s.free>0;i++){
    const moves=[];for(let y=0;y<s.h;y++)for(let x=0;x<s.w;x++)if(E.legal(s,x,y))moves.push([x,y]);
    if(!moves.length)break;
    const m=moves[Math.floor(r()*moves.length)],before=E.clone(s),scoreBefore=s.sc.reduce((a,b)=>a+b,0);
    assert.equal(E.apply(s,m),true,'coup légal refusé');
    checkInvariants(s,`n=${n} tm=${tm} seed=${seed} coup ${i}`);
    assert.ok(s.sc.reduce((a,b)=>a+b,0)>=scoreBefore,'le score total ne peut pas diminuer');
    assert.equal(E.legal(s,m[0],m[1]),false,'une case jouée n\'est plus légale');
    assert.equal(E.apply(E.clone(s),m),false,'rejouer la même case doit être refusé');
    assert.equal(before.free-s.free>=1,true,'au moins une case consommée');
  }
}
test('propriétés : invariants après chaque coup (2, 3, 4 joueurs et équipes, 12 graines)',()=>{
  for(let seed=1;seed<=3;seed++){fuzz(2,false,seed);fuzz(3,false,seed+10);fuzz(4,false,seed+20);fuzz(4,true,seed+30)}
});
test('propriétés : un coup illégal ne modifie pas l\'état',()=>{
  const s=E.create(7,7,2,false);E.apply(s,[3,3]);
  const snap=JSON.stringify([s.o,s.d,s.sc,s.free,s.cur]);
  for(const m of [[3,3],[-1,0],[0,-1],[7,0],[0,7],[99,99]])assert.equal(E.apply(s,m),false);
  assert.equal(JSON.stringify([s.o,s.d,s.sc,s.free,s.cur]),snap);
});
test('contrat IA : 3 et 4 joueurs / équipes — coups toujours légaux, jamais d\'exception ni d\'adversaire invalide',()=>{
  for(const [n,tm] of [[3,false],[4,false],[4,true]])for(const lvl of [0,1,2]){
    const s=E.create(9,9,n,tm);
    for(let i=0;i<30&&s.free>0;i++){
      const m=E.aiMove(s,E.rng(i+lvl*100),{lvl});
      assert.ok(m,`aucun coup (n=${n} tm=${tm} lvl=${lvl})`);assert.equal(E.apply(s,m),true,`coup illégal (n=${n} tm=${tm} lvl=${lvl})`);
    }
  }
});
test('contrat IA : à 3 joueurs l\'adversaire principal est le rival qui mène ; à 2 équipes c\'est l\'autre équipe',()=>{
  const s=E.create(9,9,3,false);s.sc=[0,5,2];
  assert.equal(E.rival(s,0),1,'joueur 0 : le meneur est 1');
  assert.equal(E.rival(s,1),2,'joueur 1 (meneur) : son premier rival est 2');
  assert.equal(E.rival(s,2),1);
  const d=E.create(9,9,2,false);assert.equal(E.rival(d,0),1);assert.equal(E.rival(d,1),0);
  const t=E.create(9,9,4,true);assert.equal(E.rival(t,0),1);assert.equal(E.rival(t,1),0);
});
test('latence : niveau Champion sur grand plateau 17×23, coup unique sous le plafond dur (marge machine lente)',()=>{
  const s=E.create(17,23,2,false),r=E.rng(5);
  for(let i=0;i<120&&s.free>0;i++){const m=E.aiMove(s,r,{lvl:i%2?1:0});if(!m||!E.apply(s,m))break}
  let worst=0;
  for(let i=0;i<3;i++){const t0=Date.now();const m=E.aiMove(s,E.rng(i),{lvl:3});worst=Math.max(worst,Date.now()-t0);assert.ok(m&&E.apply(s,m));E.aiMove(s,E.rng(i),{lvl:0})&&E.apply(s,E.aiMove(s,E.rng(i+9),{lvl:0}))}
  assert.ok(worst<1500,'coup Champion trop lent : '+worst+' ms');
});
