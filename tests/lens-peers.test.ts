import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync('public/lens-peers.js','utf8'),context);const peers=context.LensPeers;
const p={from:'2026-11-11',to:'2026-11-17',previousFrom:'2026-11-04',previousTo:'2026-11-10'};
function group(id:string,sales=97,platform='talabat',brand='FRB',base=100){return {id,name:id,brand,entries:[{platform,row:{identity:platform+';'+id,eligible:true,period:{...p},current:{sales,orders:100},previous:{sales:base,orders:100}}}]};}
const assess=(e:any)=>({valid:e.row.eligible===true});
const book=()=>[group('Selected',75),group('A',97),group('B',95),group('C',99)];
test('reference excludes the selected branch and weights branch changes equally',()=>{
 const groups=book(),before=JSON.stringify(groups),r=peers.compare(groups[0],groups,'talabat',assess);
 assert.equal(r.state,'READY');assert.equal(r.peers.length,3);assert.ok(Math.abs(r.subject.sales+25)<1e-8);assert.ok(Math.abs(r.medians.sales+3)<1e-8);assert.ok(Math.abs(r.gap+22)<1e-8);assert.equal(r.declining,3);assert.equal(JSON.stringify(groups),before);
 const giant=group('Giant',100000,undefined,undefined,1000000);const d=peers.compare(groups[0],[...groups,giant],'talabat',assess);assert.ok(Math.abs(d.medians.sales+4)<1e-8);
});
test('only authorized loaded same-brand same-platform exact periods enter reference',()=>{
 const groups=book();groups.push(group('Other brand',1,'talabat','Other'),group('Other platform',1,'keeta'));
 const wrongDate=group('Other dates');wrongDate.entries[0]!.row.period={...p,from:'2026-11-04',to:'2026-11-10',previousFrom:'2026-10-28',previousTo:'2026-11-03'};groups.push(wrongDate);
 const r=peers.compare(groups[0],groups,'talabat',assess);assert.equal(r.peers.length,3);assert.equal(r.excluded.OTHER_PERIOD,1);assert.equal(r.excluded.NO_SOURCE,1);assert.ok(r.peers.every((g:any)=>['A','B','C'].includes(g.id)));
 const restricted=peers.compare(groups[0],groups.slice(0,2),'talabat',assess);assert.equal(restricted.state,'INSUFFICIENT_PEERS');assert.equal(restricted.medians,undefined);
});
test('sample boundaries, zero baselines, invalid periods and unavailable evidence stay distinct',()=>{
 const groups=book();groups[1]!.entries[0]!.row.current.orders=19;groups[2]!.entries[0]!.row.previous.sales=0;groups[3]!.entries[0]!.row.eligible=false;
 const r=peers.compare(groups[0],groups,'talabat',assess);assert.equal(r.state,'INSUFFICIENT_PEERS');assert.equal(r.excluded.LOW_SAMPLE,1);assert.equal(r.excluded.ZERO_BASELINE,1);assert.equal(r.excluded.INVALID,1);
 groups[0]!.entries[0]!.row.current.orders=20;assert.equal(peers.compare(groups[0],book().map((g,i)=>i?g:groups[0]),'talabat',assess).state,'READY');
 groups[0]!.entries[0]!.row.period.to='2026-11-18';assert.equal(peers.compare(groups[0],groups,'talabat',assess).state,'SUBJECT_UNAVAILABLE');
});
test('conflicting source or canonical identities cannot duplicate reference members',()=>{
 const groups=book(),duplicate=group('Alias');duplicate.entries[0]!.row.identity=groups[1]!.entries[0]!.row.identity;groups.push(duplicate);
 const r=peers.compare(groups[0],groups,'talabat',assess);assert.equal(r.state,'INSUFFICIENT_PEERS');assert.equal(r.excluded.CONFLICT,2);
 const sameBranch=book();sameBranch.push(group('A'));assert.equal(peers.compare(sameBranch[0],sameBranch,'talabat',assess).excluded.CONFLICT,2);
 const selectedDuplicate=book();selectedDuplicate[1]!.entries[0]!.row.identity=selectedDuplicate[0]!.entries[0]!.row.identity;assert.equal(peers.compare(selectedDuplicate[0],selectedDuplicate,'talabat',assess).reason,'CONFLICT');
});
test('medians and rendered gaps retain negative signs, percentage points and escaped names',()=>{
 assert.equal(peers.median([-25,-3,-1]),-3);assert.equal(peers.median([-5,-3,-1,10]),-2);assert.equal(peers.median([]),null);assert.equal(peers.median([NaN]),null);
 const groups=book();groups[1]!.name='<Branch>';const html=peers.render(groups[0],groups,assess,'en');assert.match(html,/22 percentage points below/);assert.match(html,/−25%/);assert.match(html,/&lt;Branch&gt;/);assert.match(html,/reference branches also had lower sales/);
 const fa=peers.render(groups[0],groups,assess,'fa');assert.match(fa,/مقایسه با شعب هم‌برند/);assert.match(fa,/dir="ltr"/);assert.match(fa,/واحد درصد پایین‌تر/);
 const precise=[group('Selected',101004.9,undefined,undefined,100000),...['A','B','C'].map(id=>group(id,101005.1,undefined,undefined,100000))];assert.match(peers.render(precise[0],precise,assess,'en'),/Less than 0.01 percentage point/);
});
test('zero current sales stays a measured decline; zero prior sales never creates a percentage',()=>{
 const groups=book();groups[0]!.entries[0]!.row.current.sales=0;assert.equal(peers.compare(groups[0],groups,'talabat',assess).subject.sales,-100);
 groups[0]!.entries[0]!.row.previous.sales=0;assert.equal(peers.compare(groups[0],groups,'talabat',assess).reason,'ZERO_BASELINE');
});
