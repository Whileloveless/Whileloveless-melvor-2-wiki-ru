"use strict";

const wikiTools = (() => {
  const statusNames = {
    fits:"В пределах порога", exceeds:"Урон выше порога", blocked:"Бой требует участия",
    maxHit:"Нужен ваш максимальный удар", review:"Нужна ручная проверка"
  };
  const styles = {Melee:"Ближний бой",Ranged:"Дальний бой",Magic:"Магия"};
  const groups = {
    "Combat Areas":"Боевые зоны", "Slayer Zones":"Зоны Истребления", "Dark Areas":"Тёмные зоны",
    "Standard Dungeons":"Подземелья", "Quest Encounters":"Сюжетные бои", "Slayer Masters":"Наставники Истребления",
    monsters:"Все монстры"
  };
  const namespace = id => String(id || "").split(":").at(-1);
  const bounded = (value,min,max) => Math.max(min,Math.min(max,value));

  function roundThreshold(hp,rate) {
    const value = hp * rate;
    const lower = Math.floor(value);
    return value - lower === .5 ? lower + lower % 2 : Math.round(value);
  }

  function goldEstimate(method,level,killSeconds,cost) {
    const cycle = method.levels?.[level] ?? (method.gp > 0 && killSeconds > 0
      ? [method.gp,cost,killSeconds,killSeconds] : null);
    if (!cycle) return null;
    const [revenue,spent,seconds,actionSeconds] = cycle;
    return {hourly:(revenue-spent) * 3600 / seconds,spent,seconds,supplySeconds:seconds-actionSeconds};
  }

  function carryBetweenFights(encounters) {
    const effects = new Map();
    let enemyDamage = 0;
    for (const encounter of encounters) {
      enemyDamage = Math.max(enemyDamage,encounter.mods.Enemy.PercentDamageDealt || 0);
      for (const [key,mod] of encounter.carry) {
        if (!effects.has(key) || Math.abs(mod.value) > Math.abs(effects.get(key).value)) effects.set(key,mod);
      }
    }
    return {effects,enemyDamage};
  }

  function evaluateFight(encounter,profile,triangle,carry) {
    const notes = new Set(encounter.unresolved);
    if (encounter.pauses || encounter.immune.includes(profile.style) || encounter.immune.includes("All")) {
      return {damage:null,status:"blocked",notes:[encounter.pauses
        ? "Игра ставит бой на паузу при появлении противника."
        : "Противник невосприимчив к выбранному стилю боя."]};
    }
    const player = {...encounter.mods.Player};
    const enemy = encounter.mods.Enemy;
    const effects = {...encounter.vulnerability};
    const ownCarry = new Map(encounter.carry);
    for (const [key,mod] of carry?.effects || []) {
      const target = mod.id == null ? player : effects;
      const name = mod.id ?? mod.name;
      target[name] = (target[name] || 0) + mod.value - (ownCarry.get(key)?.value || 0);
    }
    const p = name => player[name] || 0;
    const e = name => enemy[name] || 0;
    const power = Math.max(1,Math.trunc((encounter.power + e("FlatPowerRating")) * (1 + e("PercentPowerRating"))));
    const protection = Math.max(0,Math.floor((profile.protection + p("FlatProtectionRating")) * (1 + p("PercentProtectionRating"))));
    let missingMaxHit = false;
    let worst = null;
    const damageScale = 1 + p("PercentDamageTaken") + p("PercentDamageTakenFrom") + profile.vulnerability / 100;
    const damageTaken = (raw,resist,armour,bonus,damageDealt) =>
      Math.trunc(Math.max(1,raw * (1 + damageDealt) * (damageScale + bonus) * (1-resist) - armour));

    for (const stance of encounter.stances || []) {
      if (stance.weight === 0) continue;
      const maximum = Math.max(1,Math.floor(stance.maxHit * (1 + e("PercentMaxHit")) + e("FlatMaxHit")));
      const resist = bounded((protection / (protection + power) + p("FlatResistance") + profile.resistance / 100)
        * (1 + p("PercentResistance")),0,.7);
      const finalResist = bounded(resist * (1 + (triangle[profile.style + "Vs" + stance.style] || 0)
        + p("ResistanceCombatTriangle")),0,1);
      function amount(row,owner,latestHit) {
        const mode = namespace(row?.Formula?.Type);
        const formula = row?.Formula?.Data || {};
        if (mode === "Fixed" && Number.isFinite(formula.Damage)) return formula.Damage;
        if (mode === "DamageDealt" && Number.isFinite(latestHit) && Number.isFinite(formula.Percent)) {
          return Math.trunc(latestHit * formula.Percent);
        }
        if (["CurrentHitpoints","MaxHitpoints","MaxHit","NormalDamage"].includes(mode) && Number.isFinite(formula.Percent)) {
          const health = mode.endsWith("Hitpoints");
          const base = owner === "Enemy" ? (health ? encounter.hp : maximum) : (health ? profile.hp : profile.maxHit);
          if (Number.isFinite(base)) return Math.ceil(base * formula.Percent);
          if (owner === "Player" && !health) missingMaxHit = true;
          else notes.add("Отсутствуют данные для формулы урона.");
          return 0;
        }
        notes.add("Неподдерживаемая формула урона" + (mode ? " (" + mode + ")." : "."));
        return 0;
      }

      const armour = p("ArmourBroken") ? 0 : profile.armour;
      const hits = encounter.hits.map(hit => {
        const raw = hit.reduce((total,row) => total + amount(row,row.Character === "Attacker" ? "Enemy" : "Player"),0);
        return e("FlatCriticalHitChance") ? Math.trunc(raw * (1.5 + e("FlatCriticalHitMultiplier"))) : raw;
      });
      const direct = (hit,currentArmour) => hit > 0
        ? damageTaken(hit,finalResist,currentArmour,p("PercentDamageTakenFromAttacks"),e("PercentDamageDealt")) : 0;
      if (armour && hits.some(hit => direct(hit,armour) >= armour)) {
        return evaluateFight(encounter,{...profile,armour:0},triangle,carry);
      }
      const largestHit = Math.max(0,...hits.map(hit => direct(hit,armour)));
      if (hits.length) worst = Math.max(worst ?? 0,largestHit);
      for (const effect of encounter.effects) {
        const source = effect.tick?.Character === "Target" ? "Player" : effect.source;
        const tick = effect.tick ? amount(effect.tick,source,largestHit) : Math.ceil(largestHit * effect.ratio);
        const raw = Math.max(1,tick) * effect.stacks;
        const modifier = effect.source === "Player" ? 0
          : effect.perTurn ? e("PercentDamageDealt") : carry?.enemyDamage ?? e("PercentDamageDealt");
        const damage = damageTaken(raw,0,0,(effects[effect.id] || 0) + (effects[""] || 0),modifier);
        worst = Math.max(worst ?? 0,damage);
      }
    }
    if (!Number.isFinite(worst)) notes.add("Недостаточно данных об уроне противника.");
    if (missingMaxHit) notes.add("Укажите наибольший удар вашего персонажа в бою для расчёта урона по себе.");
    const status = notes.size > Number(missingMaxHit) ? "review" : missingMaxHit ? "maxHit"
      : worst > roundThreshold(profile.hp,profile.rate) ? "exceeds" : "fits";
    return {damage:Number.isFinite(worst) ? worst : null,status,notes:[...notes]};
  }

  const field = (name,label,value,min,max,step="1",required="") => '<label>' + label +
    ' <input type="number" name="' + name + '" value="' + value + '" min="' + min + '" max="' + max +
    '" step="' + step + '" ' + required + '></label>';
  const select = (name,label,options) => '<label>' + label + ' <select name="' + name + '">' +
    Object.entries(options).map(([value,option]) => '<option value="' + value + '">' + option + '</option>').join("") +
    '</select></label>';

  function page(key) {
    if (key === "#/idle") return '<p>Оцените, переживёт ли персонаж максимальный удар или эффект до срабатывания автоеды. Расчёт предполагает, что еда экипирована и её хватает на весь бой.</p>' +
      '<form id="wiki-idle" class="wiki-tool"><fieldset><legend>Персонаж</legend><div class="drop-estimate-fields">' +
      field("hp","Максимум здоровья",100,1,1000000,1,"required") +
      field("protection","Рейтинг защиты",0,0,1000000) + field("armour","Броня",0,0,1000000) +
      select("tier","Уровень автоеды",{1:"I (25%)",2:"II (30%)",3:"III (35%)"}) + select("style","Стиль боя",styles) +
      '</div><details><summary>Дополнительные характеристики</summary><div class="drop-estimate-fields">' +
      field("maxHit","Ваш максимальный удар","",1,1000000) +
      field("eat","Бонус к порогу автоеды (п. п.)",0,-35,15,.1) +
      field("resistance","Сопротивление (%)",0,-100,70,.1) +
      field("vulnerability","Дополнительный входящий урон (%)",0,0,1000,.1) +
      '</div></details></fieldset><fieldset><legend>Противники</legend><div class="drop-estimate-fields">' +
      select("group","Категория",{"":"Все зоны и наставники",...groups}) +
      select("target","Зона или наставник",{"":"Все"}) +
      select("status","Результат",{"":"Любой",...statusNames}) +
      '<label>Название <input name="query" type="search" maxlength="80"></label></div></fieldset></form>' +
      '<p class="wiki-tool-status" role="status">Загружаем боевые данные…</p><div class="wiki-tool-results"></div>';
    if (key === "#/money") return '<p>Сравните способы заработка по уровню навыков. Скорость учитывает сбор материалов, промежуточные рецепты и покупки. Доход рассчитан по ценам продажи в магазин и базовым действиям.</p>' +
      '<form id="wiki-money" class="wiki-tool"><div class="drop-estimate-fields">' +
      field("level","Уровень навыков",99,1,99,1,"required") + select("skill","Навык",{"":"Все мирные навыки"}) +
      '<label>Название <input name="query" type="search" maxlength="80"></label></div>' +
      '<fieldset class="wiki-combat-profit" hidden><legend>Заработок на монстрах</legend><div class="drop-estimate-fields">' +
      field("kill","Время на убийство и ожидание (с)",15,.01,3600,.01,"required") +
      field("cost","Расход на бой (зол.)",0,0,1000000,.01,"required") +
      '</div><p>Введите среднее время и расход золота на одно убийство. Время нужно учитывать вместе с ожиданием нового противника.</p></fieldset></form>' +
      '<p class="wiki-tool-status" role="status">Загружаем способы заработка…</p><div class="wiki-tool-results"></div>';
    return "";
  }

  function bind(root,key,snapshot,index,hrefFor) {
    const form = root.querySelector(".wiki-tool");
    if (!form) return;
    const output = root.querySelector(".wiki-tool-results");
    const summary = root.querySelector(".wiki-tool-status");
    const title = key => index[key]?.[0] || namespace(key);
    const link = key => '<a href="' + esc(hrefFor(key)) + '">' + esc(title(key)) + '</a>';
    const named = (query,key) => matches(query,title(key),index[key]?.[1] || "",key);
    const value = name => form.elements.namedItem(name).value;
    const num = name => Number(value(name));
    const formatDamage = damage => damage === null ? "—" : number(damage);
    const badge = result => {
      const label = '<span class="wiki-tool-' + result.status + '">' + statusNames[result.status] + '</span>';
      return result.notes.length ? '<details><summary>' + label +
        '</summary><ul>' + result.notes.map(note=>'<li>' + esc(note) + '</li>').join("") + '</ul></details>' : label;
    };

    function gold() {
      const combat = value("skill") === "Combat";
      form.querySelector(".wiki-combat-profit").hidden = !combat;
      for (const name of ["kill","cost"]) form.elements.namedItem(name).disabled = !combat;
      if (!form.checkValidity()) return invalid();
      const level = num("level");
      const rows = snapshot.money.filter(row => combat ? row.skill === "Combat"
        : row.skill !== "Combat" && (!value("skill") || row.skill === value("skill")))
        .filter(row => named(value("query"),row.key)).map(row => [row,goldEstimate(row,level,num("kill"),num("cost"))])
        .filter(([,estimate]) => estimate).sort((a,b) => b[1].hourly - a[1].hourly);
      summary.textContent = "Найдено способов — " + number(rows.length);
      output.innerHTML = rows.length ? table(
        ["Способ","Навык","Уровень","Золото в час","Время цикла, с","Из них на материалы, с","Расход на цикл, зол."],
        rows.map(([row,estimate]) => [
          link(row.key),esc(row.skill === "Combat" ? "Бой" : title("Skill/MelvorBase:" + row.skill)),
          row.level ?? "—",number(estimate.hourly),number(estimate.seconds),number(estimate.supplySeconds),number(estimate.spent)
        ])) : '<p>Измените уровень, навык или запрос.</p>';
    }

    function idle() {
      if (!form.checkValidity()) return invalid();
      const data = snapshot.idle;
      const profile = {hp:num("hp"),rate:bounded(data.tiers[num("tier")] + num("eat") / 100,0,.5),
        protection:num("protection"),armour:num("armour"),style:value("style"),maxHit:num("maxHit") || null,
        resistance:num("resistance"),vulnerability:num("vulnerability")};
      const group = value("group");
      const target = value("target");
      const state = value("status");
      const query = value("query");
      const locations = data.locations.filter(area => !group || area.group === group);
      summary.textContent = "Порог автоеды — " + number(roundThreshold(profile.hp,profile.rate)) + " здоровья.";
      const enemiesFor = (keys,carry) => keys.map(key => {
        const encounter = data.encounters[key];
        return [encounter.enemy,evaluateFight(encounter,profile,data.triangle,carry)];
      });
      if (group === "monsters" || target) {
        const area = locations.find(area => area.key === target);
        const keys = area?.encounters || data.allMonsters;
        const carry = area ? carryBetweenFights(keys.map(key=>data.encounters[key])) : null;
        const rows = enemiesFor(keys,carry).filter(([enemy,result]) => named(query,enemy) && (!state || state === result.status));
        output.innerHTML = (area?.incomplete ? '<p>Данные для части боёв отсутствуют.</p>' : "") + (rows.length ? table(
          ["Противник","Максимальный урон за удар или эффект","Результат"],
          rows.map(([enemy,result]) => [link(enemy),formatDamage(result.damage),badge(result)])
        ) : '<p>Противники по выбранным фильтрам не найдены.</p>');
        return;
      }
      const rows = locations.filter(area => named(query,area.key) ||
        area.encounters.some(key => named(query,data.encounters[key].enemy))).map(area => {
        const carry = carryBetweenFights(area.encounters.map(key => data.encounters[key]));
        const results = enemiesFor(area.encounters,carry);
        const worst = Math.max(-1,...results.map(([,result])=>result.damage ?? -1));
        const order = ["blocked","review","maxHit","exceeds"];
        const status = order.find(state => (state === "review" && (area.incomplete || !results.length)) ||
          results.some(([,result])=>result.status === state)) || "fits";
        const notes = [...new Set(results.flatMap(([enemy,result]) => result.notes.map(note=>title(enemy) + " · " + note)))];
        if (area.incomplete || !results.length) notes.push("Данные для части боёв отсутствуют.");
        return [area,{damage:worst < 0 ? null : worst,status,notes}];
      }).filter(([,result]) => !state || result.status === state);
      output.innerHTML = rows.length ? table(["Зона или наставник","Противники","Максимальный урон","Результат"],
        rows.map(([area,result]) => [
          '<button type="button" class="button secondary" data-fight-target="' + esc(area.key) + '">' + esc(title(area.key)) + '</button>',
          number(area.encounters.length),formatDamage(result.damage),badge(result)
        ])) : '<p>Зоны по выбранным фильтрам не найдены.</p>';
    }

    function invalid() {
      summary.textContent = "Укажите значения в допустимых пределах.";
      output.replaceChildren();
    }

    if (key === "#/money") {
      const select = form.elements.namedItem("skill");
      const skills = [...new Set(snapshot.money.map(row=>row.skill))].filter(skill=>skill !== "Combat")
        .map(skill=>[skill,title("Skill/MelvorBase:" + skill)]).sort((a,b)=>compareWiki.compare(a[1],b[1]));
      for (const [skill,label] of [...skills,["Combat","Бой"]]) select.add(new Option(label,skill));
      select.addEventListener("change",gold);
      form.addEventListener("input",event=>{if (event.target.matches("input")) gold();});
      form.addEventListener("submit",event=>{event.preventDefault();gold();});
      gold();
      return;
    }
    const targets = form.elements.namedItem("target");
    function refreshTargets() {
      const group = value("group");
      targets.replaceChildren(new Option("Все",""));
      for (const area of snapshot.idle.locations) {
        if (!group || area.group === group) targets.add(new Option(title(area.key),area.key));
      }
      targets.disabled = group === "monsters";
    }
    form.addEventListener("input",event=>{if (event.target.matches("input")) idle();});
    form.addEventListener("change",event=>{
      if (!event.target.matches("select")) return;
      if (event.target.name === "group") refreshTargets();
      idle();
    });
    form.addEventListener("submit",event=>{event.preventDefault();idle();});
    output.addEventListener("click",event=>{
      const button = event.target.closest("[data-fight-target]");
      if (!button) return;
      targets.value = button.dataset.fightTarget;
      idle();
      targets.focus();
    });
    refreshTargets();
    idle();
  }

  return {page,bind,goldEstimate,evaluateFight,roundThreshold};
})();

if (typeof module !== "undefined") module.exports = wikiTools;
