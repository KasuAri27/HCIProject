import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../src/knowledgeModel.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};vm.runInNewContext(compiled,{exports:module.exports,Set,Map,Math,Infinity});
const {disclose,knowledgeNodes:nodes,knowledgeEdges:edges,getDisclosure,getLitNodes,learningProgress}=module.exports;

// A grey one-hop node cannot reveal a two-hop topic. A disconnected unlit
// cycle must also stay hidden: connectivity by itself never reveals names.
const names=['known','next','two-hop','cycle-a','cycle-b'];
const links=[[0,1],[1,2],[3,4]];
let state=disclose(names,links,new Set([0]));
assert.equal(state[0].state,'lit');assert.equal(state[1].title,'next');
assert.equal(state[1].state,'frontier');assert.equal(state[2].title,'???');
assert.equal(state[3].title,'???');assert.equal(state[4].title,'???');
state=disclose(names,links,new Set([0,1]));assert.equal(state[2].title,'two-hop');
assert.equal(disclose(names,links,new Set())[0].title,'???');
assert.equal(nodes.length,52);assert.equal(new Set(nodes.map(n=>n.name)).size,nodes.length);
const keys=new Set();for(const[a,b]of edges){assert(a!==b&&a>=0&&b<nodes.length);assert(!keys.has(`${a}:${b}`));keys.add(`${a}:${b}`);}
const reachable=new Set([0]);for(let i=0;i<nodes.length;i++)for(const[a,b]of edges){if(reachable.has(a))reachable.add(b);if(reachable.has(b))reachable.add(a);}
assert.equal(reachable.size,52);
for(const f of [0,84,150,229,230,300,377,378,509]){
  const lit=getLitNodes(f),states=getDisclosure(f);
  for(const node of nodes){
    const direct=edges.some(([a,b])=>(a===node.id&&lit.has(b))||(b===node.id&&lit.has(a)));
    const s=states[node.id];
    if(lit.has(node.id))assert.equal(s.state,'lit');
    else if(direct){assert.equal(s.state,'frontier');assert.equal(s.title,node.name);}
    else{assert.equal(s.state,'locked');assert.equal(s.title,'???');}
    const p=learningProgress(node,f);assert(p>=0&&p<=1);
  }
}
assert.equal(getDisclosure(0)[9].state,'frontier');
assert.equal(getDisclosure(229)[9].state,'frontier');assert.equal(getDisclosure(230)[9].state,'lit');
assert.equal(getDisclosure(378)[10].state,'lit');
const summary=[0,230,378].map(frame=>({frame,...getDisclosure(frame).reduce((a,s)=>(a[s.state]++,a),{lit:0,frontier:0,locked:0})}));
console.log(JSON.stringify({status:'PASS',nodes:nodes.length,edges:edges.length,states:summary},null,2));
