"use strict";
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {once} = require('node:events');

const source = process.argv[2] || '/tmp/melvor-upstream/public';
const output = process.argv[3] || '/tmp/melvor-cards.jsonl';
const category = process.argv[4] || '';
function stub() {
  return {innerHTML:'', value:'', addEventListener(){}, querySelector(){return null;},
    querySelectorAll(){return [];}, classList:{add(){}}};
}
const dom = new Map();
const document = {
  getElementById(id) {
    if(!dom.has(id)) dom.set(id,stub());
    return dom.get(id);
  },
  addEventListener(){},
};
const sandbox = vm.createContext({document,location:{hash:''},
  window:{addEventListener(){},removeEventListener(){},scrollTo(){}},
  URLSearchParams,console});
vm.runInContext(fs.readFileSync(path.join(source,'data.js'),'utf8'),sandbox);
const upstream = fs.readFileSync(path.join(source,'app.js'),'utf8')
  .replace(/\nrender\(\);(?=\s*\/\* Shared reader)/,'\n');
const instrument = `
  let calculator;
  dropEstimateBind = (sources,xpFactor=0) => {calculator={sources:sources.map(({node,...s})=>({key:node?.key,title:node?.name,...s})),xpFactor};};
  trainingStartPlanner = () => {};
  trainingStartComparison = () => {};
  globalThis.exportWiki = {
    nodes: all, groups, byType, imageSource, payload, publicLinkable,
    renderNode(node) {
      main.innerHTML=''; pageBaseInterval=null; calculator=null;
      detail(node); return {html:main.innerHTML,calculator};
    },
    renderScreen(screen,id) {
      main.innerHTML=''; pageBaseInterval=null; calculator=null;
      const params=new URLSearchParams(id ? {id}: {});
      if(!publicRoute(screen,params)) {
        if(screen==='esperienza') wikiExperience();
        else if(screen==='famiglie') families();
        else if(screen==='categoria') {
          const group=groups.find(([key])=>key===id);
          listPage(group[1],all.filter(group[2]),screen,params);
        }
      }
      return {html:main.innerHTML,calculator};
    }
  };
`;
vm.runInContext(upstream + instrument,sandbox);
const api = sandbox.exportWiki;

async function write() {
  const file = fs.createWriteStream(output);
  const log = {};
  const errors = [];
  async function record(key,title,type,data,image) {
    if(!data.html) throw Error('Empty output');
    if(!file.write(JSON.stringify({key,title,type,image,html:data.html,calculator:data.calculator})+'\n')) {
      await once(file,'drain');
    }
    log[type] = (log[type] || 0) + 1;
  }
  for(const n of api.nodes) {
    if (!api.publicLinkable(n) && !api.groups.some(gr=>gr[2](n))) continue;
    if (category && !new RegExp(category,'i').test(n.type)) continue;
    try {
      await record(n.key,n.name,n.type,api.renderNode(n),api.imageSource(n.image));
    } catch(e) {
      errors.push([n.key,String(e)]);
    }
  }
  if(!category) {
    const pages = [
      ['esperienza',null,'Experience Table','Tool'],
      ['pets',null,'Pets','Directory'],
      ['guides',null,'Training Guides','Directory'],
      ['idle',null,'Can I Idle?','Tool'],
      ['money',null,'Money Making Guide','Tool'],
      ...api.byType.get('Skill').map(n=>['guide',n.id.split(':').at(-1),n.name+'/Training','Training']),
    ];
    for(const [screen,id,title,type] of pages) {
      try {
        await record('#/'+screen+(id?'?id='+encodeURIComponent(id):''),title,type,api.renderScreen(screen,id),'');
      } catch(e) {
        errors.push([screen+(id?' '+id:''),String(e)]);
      }
    }
  }
  file.end();
  await once(file,'finish');
  fs.writeFileSync(output+'.audit.json', JSON.stringify({build:api.payload.build, counts:log, errors},null,2));
  console.log(JSON.stringify({log,errors:errors.length,examples:errors.slice(0,20)}));
}
write().catch(e=>{console.error(e);process.exitCode=1;});
