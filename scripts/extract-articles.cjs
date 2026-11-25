"use strict";
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {gunzipSync,gzipSync} = require('node:zlib');
const {once} = require('node:events');

const source = process.argv[2] || '/tmp/melvor-upstream/public';
const output = process.argv[3] || '/tmp/melvor-cards.jsonl';
const category = process.argv[4] || '';
const extending = category === '--extend';
const known = extending ? JSON.parse(gunzipSync(fs.readFileSync(process.argv[5]))) : {};
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
    nodes: all, groups, byType, imageSource, payload, publicLinkable, typeName,
    moneyRows, moneySupply, moneyCombat,
    idleData, idleEncounter, idleAutoEatRates, idleSlayerPools, publicNode,
    renderNode(node) {
      main.innerHTML=''; pageBaseInterval=null; calculator=null;
      detail(node); return {html:main.innerHTML,calculator};
    },
    renderReference(node) {
      main.innerHTML=''; catalogRecord(node);
      return {html:main.innerHTML};
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
    const typeLabel = extending ? api.typeName(type) : undefined;
    if(!file.write(JSON.stringify({key,title,type,typeLabel,image,html:data.html,calculator:data.calculator})+'\n')) {
      await once(file,'drain');
    }
    log[type] = (log[type] || 0) + 1;
  }
  for(const n of api.nodes) {
    const publicCard = api.publicLinkable(n) || api.groups.some(gr=>gr[2](n));
    if (extending ? Object.hasOwn(known,n.key) : !publicCard) continue;
    if (category && !extending && !new RegExp(category,'i').test(n.type)) continue;
    try {
      await record(n.key,n.name,n.type,publicCard ? api.renderNode(n) : api.renderReference(n),api.imageSource(n.image));
    } catch(e) {
      errors.push([n.key,String(e)]);
    }
  }
  if(extending) {
    await record('#/famiglie','Game Data Index','Directory',api.renderScreen('famiglie',null),'');
    await record('#/idle','AFK Combat Calculator','Tool',{html:'<p>AFK Combat Calculator</p>'},'');
    await record('#/money','Gold per Hour Calculator','Tool',{html:'<p>Gold per Hour Calculator</p>'},'');
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
  if (extending && errors.length) throw Error('Resolve all missing cards before importing');
}

function exportTools(target) {
  const money = api.moneyRows().map(entry => {
    const {n,skill,level,group} = entry;
    if (group === 'Combat') {
      const {gp} = api.moneyCombat(n);
      return {key:n.key,skill,gp};
    }
    const levels = Array.from({length:100},(_,i) => {
      if (i < Math.max(1,level)) return null;
      const cycle = api.moneySupply(entry,i);
      if (!cycle || cycle.seconds <= 0 || cycle.gp <= cycle.cash) return null;
      return [cycle.gp,cycle.cash,cycle.seconds,cycle.actionSeconds];
    });
    return {key:n.key,skill,level,levels};
  }).filter(entry => entry.gp > 0 || entry.levels?.some(Boolean));

  const {areas,data} = api.idleData();
  const encounters = {};
  function encounter(enemy, area) {
    const key = enemy.key + '|' + (area?.key || '');
    if (!Object.hasOwn(encounters,key)) {
      const e = api.idleEncounter(enemy,area);
      encounters[key] = {
        enemy:enemy.key, hp:e.stats?.hitpoints, power:e.stats?.powerRating, stances:e.stats?.maxHits,
        mods:e.totals, hits:e.attacks.flatMap(a=>a.Hits.filter(h=>h.Count>0).map(h=>h.Damage)),
        effects:e.effects.map(({id,source,effect})=>({
          id,source, perTurn:effect.DamagePerTurn,
          tick:effect.DamagePerProc || effect.DamagePerTurn, ratio:effect.PercentDamageDealtPerProc,
          stacks:effect.MaxStacks || 1
        })),
        carry:[...e.carryMods], vulnerability:Object.fromEntries(e.effectDamage),
        immune:[...e.immunities], pauses:Boolean(enemy.data.PauseOnSpawn), unresolved:[...e.unresolved],
      };
    }
    return key;
  }
  const locations = areas.filter(area=>!area.placeholder).map(area=>({
    key:area.node.key, group:area.category, incomplete:area.incomplete ||
      area.enemies.some(id=>!api.publicNode('Enemy',id)),
    encounters:area.enemies.flatMap(id=>{
      const enemy=api.publicNode('Enemy',id);
      if (!enemy) return [];
      return [encounter(enemy,area.node)];
    })
  }));
  for (const pool of api.idleSlayerPools(areas)) locations.push({
    key:pool.node.key,group:'Slayer Masters',incomplete:pool.missing,
    encounters:pool.targets.map(({node,area})=>encounter(node,area))
  });
  const allMonsters = (api.byType.get('Enemy') || []).map(enemy=>encounter(enemy,null));
  const triangle = {};
  for (const player of ['Melee','Ranged','Magic']) for (const enemy of ['Melee','Ranged','Magic']) {
    const key = player + 'Vs' + enemy;
    triangle[key] = data('CombatTriangleBonus',key)?.Bonuses?.Component
      ?.find(mod=>mod.Stat?.Name==='ResistanceCombatTriangle')?.Value || 0;
  }
  const snapshot = {build:api.payload.build,money,idle:{locations,encounters,allMonsters,triangle,tiers:api.idleAutoEatRates()}};
  fs.writeFileSync(target,gzipSync(JSON.stringify(snapshot),{level:9}));
  console.log('Tool data: '+money.length+' gold methods, '+Object.keys(encounters).length+' encounters');
}

write().then(()=>{
  if (extending && process.argv[6]) exportTools(process.argv[6]);
}).catch(e=>{console.error(e);process.exitCode=1;});
