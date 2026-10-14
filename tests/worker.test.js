const test=require('node:test'),assert=require('node:assert/strict');

test('le livre cloud ignore les motifs peu observés ou non horodatés',async()=>{
  const {filterSharedBook}=await import('../cloudflare/worker.mjs');
  const now=Date.now();
  const book={
    'motif-fiable':[3,4,2,now],
    'trop-peu':[2,9,1,now],
    'sans-date':[8,10,4,0],
    'date-invalide':[8,10,4,'not-a-date'],
    'date-futur':[8,10,4,now+2*864e5],
    'gains-invalides':[4,Infinity,1,now]
  };
  assert.deepEqual(filterSharedBook(book,now),{'motif-fiable':[3,4,2,now]});
});
test('un livre cloud mal formé est rejeté sans planter',async()=>{
  const {filterSharedBook}=await import('../cloudflare/worker.mjs');
  assert.deepEqual(filterSharedBook(null),{});
  assert.deepEqual(filterSharedBook([]),{});
});
