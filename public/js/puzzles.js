/* Puzzles « capture en 1 coup » : Rouge (joueur 0) joue un seul coup sur un terrain 11 × 15.
   La position est construite en alternant Rouge / Bleu ; `fill` = pierres de Bleu posées loin de l'action. */
(function(root){
const FILL=[[0,0],[10,0],[0,14],[10,14],[0,7],[10,7],[5,14],[5,0]];
const P=[
  {name:'Le diamant',goal:1,hint:'Un point bleu est presque encerclé : fermez le losange.',red:[[5,4],[4,5],[6,5]],blue:[[5,5]]},
  {name:'Double capture',goal:2,hint:'Deux points bleus côte à côte : une seule case ferme la chaîne.',red:[[4,5],[7,5],[5,4],[6,4],[5,6]],blue:[[5,5],[6,5]]},
  {name:'Le trio',goal:3,hint:'Trois points alignés : trouvez la case qui boucle le contour.',red:[[3,5],[7,5],[4,4],[5,4],[6,4],[4,6],[5,6]],blue:[[4,5],[5,5],[6,5]]},
  {name:'Le pilier',goal:2,hint:'Deux points empilés : il manque la case du bas pour fermer.',red:[[5,4],[4,5],[6,5],[4,6],[6,6]],blue:[[5,5],[5,6]]}
];
/* Séquence de coups alternés (Rouge d'abord) menant à la position du puzzle */
function setup(p){
  const mv=[],bl=p.blue.slice();let f=0;
  for(let i=0;i<p.red.length;i++){mv.push(p.red[i]);mv.push(bl[i]||FILL[f++])}
  return mv;
}
const api={W:11,H:15,list:P,setup};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.G2Puzzles=api;
})(typeof window!=='undefined'?window:globalThis);
