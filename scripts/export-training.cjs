"use strict";
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {once} = require('node:events');

const source = process.argv[2] || '/tmp/melvor-upstream/public';
const output = process.argv[3] || '/tmp/melvor-training-engine.js';
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
globalThis.exportTraining = (() => {
  const nodes = Object.create(null);
  const actions = Object.create(null);
  const internals = [moneyAverage,moneySuccess,moneySourceModel,thievingFood,moneyRouteSteps,thievingTiming,
    trainingEligible,trainingXP,thievingTrainingChoice,trainingChoice,trainingPlan];

  function capture(node) {
    if (!node) return null;
    if (nodes[node.key]) return node.key;
    const d = node.data;
    nodes[node.key] = {
      key: node.key, type: node.type, id: node.id, name: node.name, image: imageSource(node.image),
      gates: moneyGates(node).map(({Type,Data}) => ({Type,Data})),
      recurring: moneyRecurringInputs(node),
      data: Object.fromEntries([
        'BaseExperience','BaseInterval','Category','Costs','Damage','Difficulty','FishChance','BaseFishChance',
        'Ingredients','Perception','Product','Products','Provides','RandomProducts','RecipeType','Stages'
      ].filter(key=>d[key]!=null).map(key=>[key,d[key]]))
    };
    const cap = d.Capabilities || {};
    const supported = ['MelvorBase:Food', 'MelvorBase:Openable', 'MelvorBase:Toolbelt'];
    const trimmed = Object.fromEntries(supported.filter(key=>cap[key]).map(key=>[key,cap[key]]));
    if (Object.keys(trimmed).length) nodes[node.key].data.Capabilities = trimmed;
    if (node.type==='ShopPurchase') {
      nodes[node.key].data.AllowBulkPurchase = d.AllowBulkPurchase;
      nodes[node.key].data.DefaultBuyLimit = d.DefaultBuyLimit;
    }
    return node.key;
  }

  for (const {id} of byType.get('Skill')) {
    const skill = bare(id);
    const candidates = readerCandidates(skill);
    if (!candidates.length) continue;
    actions[skill] = candidates.map(r => {
      const node = guideV2Node(r);
      capture(node);
      return Object.fromEntries(['type','id','name','level','xp','seconds','xpPerSecond','successChance']
        .filter(k=>r[k]!=null).map(k=>[k,r[k]]));
    });
  }
  const entries = moneyRows().filter(e=>['Gathering','Crafting'].includes(e.group)).map(e=>({
    key:capture(e.n),skill:e.skill,level:e.level,gross:e.gross,seconds:e.seconds,group:e.group
  }));
  for(const n of byType.get('ShopPurchase')) {
    const d=n.data;
    if(d.AllowBulkPurchase && d.DefaultBuyLimit === 0 && d.Costs &&
       !d.Costs.Currencies?.some(c=>bare(c.Currency)!=='GoldPieces')) capture(n);
  }
  for(const n of byType.get('Item')) {
    if(n.data.Capabilities?.['MelvorBase:Food'] || n.data.Capabilities?.['MelvorBase:Openable']) capture(n);
  }
  const tools = thievingTrainingTools().map(capture);
  return { model:{nodes,actions,entries,tools}, functions:internals.map(f=>f.toString()) };
})();
`;
vm.runInContext(upstream + instrument,sandbox);
const exported=sandbox.exportTraining;
const prelude=`"use strict";
(() => {
const MODEL = ${JSON.stringify(exported.model)};
const bare = value => String(value ?? "").split(":").at(-1);
const publicNode = (type, id) => MODEL.nodes[type + "/" + id];
const guideV2Node = action => publicNode(action.type, action.id);
const byType = Map.groupBy(Object.values(MODEL.nodes), node => node.type);
const moneyGates = node => node.gates;
const moneyRecurringInputs = node => node.recurring;
const entries = MODEL.entries.map(row => ({...row,n:MODEL.nodes[row.key]}));
const moneyRows = () => entries;
const readerCandidates = skill => MODEL.actions[skill] || [];
function readerRate(row, level, skill) {
  if (skill === "Thieving") return row.xp / thievingTiming(guideV2Node(row), level).seconds;
  if (skill !== "Cooking") return row.xpPerSecond;
  return row.xp * Math.min(1, (69 + level) / (69 + (guideV2Node(row)?.data.Difficulty || 0))) / row.seconds;
}
`;
const finale=`
globalThis.MelvorWikiTraining = {
  calculate(skill, profile) {
    const input = {
      ...profile,
      tools: (profile.tools || []).map(id=>publicNode("Item",id)).filter(Boolean)
    };
    const plan = trainingPlan(skill, input);
    const comparison = skill === "Thieving" ? compareThieving(input) : [];
    return {plan,comparison};
  },
  title(key) { return MODEL.nodes[key]?.name; }
};

function compareThieving(profile) {
  const level = profile.from;
  const supply = () => moneySourceModel(profile.support, "Thieving", 1, profile.unlocked);
  const ranks = readerCandidates("Thieving").map(action=>thievingTrainingChoice(action,level,profile,supply))
    .filter(Boolean).sort((a,b)=>b.rate-a.rate);
  const examples=new Set(["LockedThugChest","BanditLeader","Miner"]);
  return ranks.filter(({action},index)=>index<8||examples.has(bare(action.id)));
}
})();
`;
fs.writeFileSync(output,prelude + "\n" + exported.functions.join("\n\n") + finale);
console.log(JSON.stringify({skills:Object.keys(exported.model.actions),nodes:Object.keys(exported.model.nodes).length,
  entries:exported.model.entries.length,bytes:fs.statSync(output).size}));
