import test from 'node:test';
import assert from 'node:assert/strict';

test('ranks full hostname counts, merges HTTP/HTTPS, keeps subdomains and chooses observed HTTPS roots', async()=>{
  const {rankFrequentSites}=await import('../extension/frequent-sites.js');
  const result=rankFrequentSites([
    {id:'1',url:'http://example.com/a',visitCount:5,lastVisitTime:3},
    {id:'2',url:'https://example.com/b',visitCount:7,lastVisitTime:2},
    {id:'3',url:'https://sub.example.com/a',visitCount:11,lastVisitTime:4},
    {id:'4',url:'http://example.org/',visitCount:12,lastVisitTime:2},
    {url:'https://user:pass@example.edu/',visitCount:99}, {url:'file:///tmp/a',visitCount:99},
    {url:'https://invalid.test/',visitCount:-1}
  ]);
  assert.deepEqual(result.map(x=>[x.id,x.url,x.visitCount]),[
    ['example.com','https://example.com/',12],['example.org','http://example.org/',12],['sub.example.com','https://sub.example.com/',11]
  ]);
});
test('caps at 20 without padding and sorts ties deterministically',async()=>{
  const {rankFrequentSites}=await import('../extension/frequent-sites.js');
  const items=Array.from({length:23},(_,i)=>({id:String(i),url:`https://h${String(i).padStart(2,'0')}.test/`,visitCount:1,lastVisitTime:10}));
  assert.equal(rankFrequentSites(items).length,20);
  assert.equal(rankFrequentSites(items)[0].id,'h00.test');
  assert.equal(rankFrequentSites(items.slice(0,3)).length,3);
});
test('history scan splits bounded windows, deduplicates URLs and does not paginate by returned lastVisitTime',async()=>{
  const {scanHistory}=await import('../extension/frequent-sites.js');
  const calls=[];
  const api={history:{search:async q=>{
    calls.push(q);
    const a={id:'1',url:'https://a.test/',visitCount:5,lastVisitTime:200};
    const b={id:'2',url:'https://b.test/',visitCount:4,lastVisitTime:200};
    const c={id:'3',url:'https://c.test/',visitCount:3,lastVisitTime:200};
    if(q.startTime===0 && q.endTime===100) return [a,b,c];
    if(q.endTime===50) return [a,b];
    return [a,c];
  }}};
  const result=await scanHistory(api,{endTime:100,maxResults:3});
  assert.equal(result.length,3); assert.equal(result[0].visitCount,5);
  assert.deepEqual(calls.map(q=>[q.text,q.startTime,q.endTime,q.maxResults]),[['',0,100,3],['',0,50,3],['',50,100,3]]);
});
test('history scan rejects saturated timestamps, exhausted budgets, cancelled scans and API failures',async()=>{
  const {scanHistory}=await import('../extension/frequent-sites.js');
  const api={history:{search:async()=>[{id:'1',url:'https://a.test/'},{id:'2',url:'https://b.test/'}]}};
  await assert.rejects(scanHistory(api,{endTime:1,maxResults:2}),/完整/);
  await assert.rejects(scanHistory(api,{endTime:100,maxResults:2,maxQueries:1}),/完整/);
  await assert.rejects(scanHistory(api,{isCurrent:()=>false}),/过期/);
  await assert.rejects(scanHistory({history:{search:async()=>{throw Error('API failure');}}}),/API failure/);
});
