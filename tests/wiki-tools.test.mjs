import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {test} from "node:test";
import {gunzipSync} from "node:zlib";
import tools from "../dist/wiki-tools.js";

const snapshot = JSON.parse(gunzipSync(readFileSync(new URL("../dist/wiki-tools-data.json.gz",import.meta.url))));

test("gold estimates include recurring supply time and costs at the chosen level", () => {
  const rows = snapshot.money.filter(row => row.levels);
  const best = level => rows.map(row => [row.key,tools.goldEstimate(row,level)])
    .filter(([,estimate]) => estimate).sort((a,b) => b[1].hourly-a[1].hourly)[0];
  assert.equal(best(1)[0],"ArtisanRecipe/MelvorBase:StoneSword");
  assert.equal(Math.round(best(1)[1].hourly),4008);
  assert.ok(best(1)[1].supplySeconds > 0);
  assert.equal(best(99)[0],"FishingRecipe/MelvorBase:DeepBlue");
  assert.equal(Math.round(best(99)[1].hourly),165738);
  assert.equal(tools.goldEstimate(rows.find(row => row.key === best(99)[0]),1),null);
  assert.equal(tools.goldEstimate({gp:50},1,20,10).hourly,7200);
});

test("AFK checks use the damage bound, protection, and blockers", () => {
  const encounter = snapshot.idle.encounters["Enemy/MelvorBase:Golbin|CombatArea/MelvorBase:GolbinForest"];
  const profile = {hp:28,rate:.25,protection:0,armour:0,resistance:0,vulnerability:0,style:"Melee",maxHit:null};
  const triangle = snapshot.idle.triangle;
  assert.equal(tools.roundThreshold(10,.25),2);
  assert.deepEqual(tools.evaluateFight(encounter,profile,triangle),{damage:8,status:"exceeds",notes:[]});
  assert.equal(tools.evaluateFight(encounter,{...profile,hp:32},triangle).status,"fits");
  assert.equal(tools.evaluateFight(encounter,{...profile,protection:63},triangle).damage,4);
  assert.equal(tools.evaluateFight({...encounter,pauses:true},profile,triangle).status,"blocked");
  assert.equal(tools.evaluateFight({...encounter,hits:[]},profile,triangle).status,"review");
});
