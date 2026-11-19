"use strict";
const data = globalThis.MELVOR_DATA;
const main = document.querySelector("main");
const search = document.querySelector(".search");
const searchInput = search.elements.q;
const upstream = "https://melvor2wiki.github.io/#/";
const steam = "https://steamcommunity.com/app/3218350/allnews/?l=english";
const fmt = new Intl.NumberFormat("ru", { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat("ru", { style:"percent", maximumFractionDigits: 2 });
const smallPercent = new Intl.NumberFormat("ru", { style:"percent", maximumFractionDigits: 5 });
const formatChance = value => (value > 0 && value < 0.0001 ? smallPercent : percent).format(value);
const collator = new Intl.Collator("ru", { numeric: true });
const number = value => value == null ? "—" : fmt.format(value);
const esc = input => String(input ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const path = (section, id) => "#/" + section + (id ? "/" + encodeURIComponent(id) : "");
const normalize = value => value.toLocaleLowerCase("ru").replaceAll("ё","е").trim();
const matches = (needle, ...values) => normalize(needle).split(/\s+/).every(term => normalize(values.join(" ")).includes(term));
const groups = {
  skills:["Навыки","⚒","Боевые и мирные навыки","Skill"],
  items:["Предметы","◇","Снаряжение, ресурсы и расходники","Item"],
  monsters:["Монстры","⚔","Характеристики, места обитания и добыча","Enemy"],
  quests:["Задания","☷","Сюжетные и побочные задания","Quest"],
  dungeons:["Подземелья","♜","Волны врагов и условия открытия","Dungeon"],
  guides:["Руководства","✧","Первые шаги, развитие и подготовка к бою"]
};
const ru = {
 Attack:"Атака", Strength:"Сила", Defence:"Защита", Hitpoints:"Здоровье",
 Ranged:"Дальний бой", Magic:"Магия", Prayer:"Молитва", Slayer:"Истребление",
 Agility:"Ловкость", Beastcrafting:"Работа со зверями", Cooking:"Кулинария",
 Crafting:"Ремесло", Farming:"Земледелие", Firemaking:"Разведение огня",
 Fishing:"Рыбалка", Fletching:"Изготовление луков и стрел", Herblore:"Зельеварение",
 Hunting:"Охота", Mining:"Горное дело", Runecrafting:"Изготовление рун", Smithing:"Кузнечное дело",
 Thieving:"Воровство", Woodcutting:"Лесозаготовка", Ranching:"Животноводство", Astrology:"Астрология",
 DefaultWeapon:"Кулаки", NormalLog:"Обычное бревно", OakLog:"Дубовое бревно", WillowLog:"Ивовое бревно",
 TeakLog:"Тиковое бревно", MapleLog:"Кленовое бревно", MahoganyLog:"Бревно красного дерева",
 YewLog:"Тисовое бревно", MagicLog:"Магическое бревно", RedwoodLog:"Бревно секвойи",
 Stone:"Камень", StoneSword:"Каменный меч", StoneDagger:"Каменный кинжал", Flax:"Лён", Stick:"Палка", Bone:"Кость",
 Coal:"Уголь", CoalOre:"Уголь", DenseCoal:"Плотный уголь", Geode:"Жеода", GeodeDust:"Пыль жеоды",
 RawShrimp:"Сырая креветка", Shrimp:"Креветка", RawSardine:"Сырая сардина", Sardine:"Сардина",
 RawHerring:"Сырая сельдь", Herring:"Сельдь", RawTrout:"Сырая форель", Trout:"Форель",
 RawSalmon:"Сырой лосось", Salmon:"Лосось", RawLobster:"Сырой омар", Lobster:"Омар",
 RawShark:"Сырая акула", Shark:"Акула", CopperOre:"Медная руда", IronOre:"Железная руда", TinOre:"Оловянная руда",
 SilverOre:"Серебряная руда", GoldOre:"Золотая руда", MithrilOre:"Мифриловая руда",
 AdamantiteOre:"Адамантитовая руда", RuniteOre:"Рунитовая руда", DragoniteOre:"Драконитовая руда",
 CopperBar:"Медный слиток", IronBar:"Железный слиток", SteelBar:"Стальной слиток",
 SilverBar:"Серебряный слиток", GoldBar:"Золотой слиток", BronzeBar:"Бронзовый слиток",
 MithrilBar:"Мифриловый слиток", AdamantBar:"Адамантовый слиток", RuneBar:"Рунитовый слиток",
 AirRune:"Руна воздуха", EarthRune:"Руна земли", WaterRune:"Руна воды", FireRune:"Руна огня",
 RuneEssence:"Рунная эссенция", Potato:"Картофель", Onion:"Лук", BirdNest:"Птичье гнездо",
 Golbin:"Голбин", GolbinScout:"Голбин-разведчик", GolbinAmbusher:"Голбин-засадник", Hobgolbin:"Хобголбин",
 GolbinForest:"Лес голбинов", HobgolbinCamp:"Лагерь хобголбинов",
 SeedsofSustenance:"Семена пропитания", PackingLunch:"Обед с собой", HarvestFestival:"Праздник урожая",
 MQ1:"Подготовка к бою", MQ4:"Разведка в тумане", MQ6:"Побег из подземелья", Fisherman:"Рыбак",
 NormalTree:"Обычное дерево", ShallowPools:"Мелководье"
};
const materials = {
  Bronze:["Бронзовый","Бронзовая","Бронзовое","Бронзовые"], Iron:["Железный","Железная","Железное","Железные"],
  Steel:["Стальной","Стальная","Стальное","Стальные"], Copper:["Медный","Медная","Медное","Медные"],
  Mithril:["Мифриловый","Мифриловая","Мифриловое","Мифриловые"], Adamant:["Адамантовый","Адамантовая","Адамантовое","Адамантовые"],
  Rune:["Рунитовый","Рунитовая","Рунитовое","Рунитовые"], Stone:["Каменный","Каменная","Каменное","Каменные"]
};
const gear = { Sword:["меч",0], Dagger:["кинжал",0], Shield:["щит",0], Boots:["сапоги",3], Gloves:["перчатки",3],
  Helmet:["шлем",0], Longsword:["длинный меч",0], Axe:["топор",0], Pickaxe:["кирка",1],
  Arrows:["стрелы",3], Crossbow:["арбалет",0], Platebody:["кираса",1], Platelegs:["поножи",3],
  Scimitar:["скимитар",0], Mace:["булава",1], Spear:["копьё",2], Chainbody:["кольчуга",1], "2H Sword":["двуручный меч",0]
};
const labels = { Easy:"Лёгкая", Normal:"Обычная", Medium:"Средняя", Hard:"Высокая", VeryHard:"Очень высокая",
  Extreme:"Экстремальная", Melee:"Ближний бой", MainQuests:"Сюжетное", SideQuests:"Побочное", Equipment:"Снаряжение",
  Food:"Еда", Weapon:"Оружие", Potion:"Зелье", Seed:"Семена", Rune:"Руна", Ammo:"Боеприпасы", Compost:"Компост",
  Charges:"Заряды", ItemContainer:"Контейнер", Readable:"Читаемый предмет", Upgrade:"Улучшение",
  Toolbelt:"Пояс инструментов", Openable:"Контейнер", HuntingTrap:"Охотничья ловушка",
  Bury:"Закапывание", FishingBait:"Рыболовная наживка" };
const combatStatLabels = {
  AttackInterval:"Интервал между ходами", MeleeStrengthBonus:"Сила ближнего боя",
  RangedStrengthBonus:"Сила дальнего боя", MagicDamageBonus:"Магический урон", SpellMaxHit:"Максимальный урон заклинания",
  MaximumWard:"Максимальный барьер", Armour:"Броня", Lifesteal:"Вампиризм",
  PowerRatings:"Рейтинг силы", ProtectionRatings:"Рейтинг защиты"
};
const stanceLabels = {
  Stab:"колющий удар", Slash:"рубящий удар", Crush:"дробящий удар", Block:"блокирование",
  Accurate:"точный выстрел", Powerful:"мощный выстрел", LongRange:"дальний выстрел",
  Offensive:"усиленное заклинание", Defensive:"сосредоточенное заклинание"
};
const relationKinds = {
  Enemy:["Монстр","monsters"], Dungeon:["Подземелье","dungeons"], Item:["Контейнер","items"],
  Quest:["Задание","quests"], ThievingRecipe:["Воровство"], ShopPurchase:["Магазин"]
};
const chanceBasis = {
  kill:"за победу", clear:"за прохождение", open:"за открытие",
  stage:"за успешный этап кражи", target:"за завершение кражи"
};
const currencies = {GoldPieces:"Золото",PrayerPoints:"Очки молитвы",SlayerCoins:"Монеты истребителя"};
const recipeNames = { ArtisanRecipe:"Ремесленный рецепт", MiningRecipe:"Добыча", WoodcuttingRecipe:"Лесозаготовка",
 FishingRecipe:"Рыбалка", CookingRecipe:"Кулинария", FiremakingRecipe:"Разведение огня", FarmingRecipe:"Земледелие",
 GrainMillRecipe:"Помол", HerbloreRecipe:"Зельеварение", ThievingRecipe:"Воровство" };
const skillNotes = {
 Mining:"При добыче неудачные удары заполняют шкалу разведки, которая повышает шанс расколоть породу. Используйте руду в кузнечном деле.",
 Woodcutting:"Рубите деревья и кусты, чтобы получать древесину и другие материалы. Бревна пригодятся для разведения огня и изготовления снаряжения.",
 Fishing:"Место ловли определяет доступную рыбу и возможные побочные находки. Улов можно приготовить, чтобы запасти еду для боя.",
 Astrology:"Астрология даёт постоянные бонусы к навыкам и открывает дополнительные возможности. Выбирайте бонусы под действие, которым занимаетесь чаще всего.",
 Herblore:"Зельеварение позволяет готовить расходуемые усиления для разных навыков. Сравнивайте эффект зелья с затратами на его ингредиенты.",
 Agility:"Техники ловкости открывают дополнительный контент и вспомогательное снаряжение для некоторых мирных навыков.",
 Smithing:"Кузнечное дело превращает материалы в слитки и снаряжение. Каменный меч нужен для открытия боевого раздела в обучении.",
 Cooking:"Приготовленная еда пополняет здоровье в бою. Для открытия боевого раздела в обучении нужно приготовить десять креветок.",
 Runecrafting:"Изготавливайте руны для заклинаний. Перед тренировкой магии проверьте расход рун выбранного заклинания."
};
const guides = {
 start:{name:"Первые шаги", subtitle:"Обучение и первые припасы", sections:[
  ["Пройдите обучение","Подсказки обучения постепенно открывают страницы игры и знакомят с производственными цепочками. Пропуск доступен при создании персонажа и в меню паузы."],
  ["Подготовьтесь к первому бою","Добудьте камень, выкуйте каменный меч, поймайте и приготовьте десять креветок. В обычном обучении это выполняет условия открытия боя."],
  ["Проверяйте требования","Во внутриигровом Кодексе можно посмотреть, где взять нужный предмет и для чего он пригодится. Перед запуском длительного действия проверьте запасы материалов, еды и боеприпасов."]],
  links:[["skills","Mining"],["items","StoneSword"],["items","Shrimp"]]},
 progress:{name:"Прокачка навыков",subtitle:"Опыт, уровни и гильдии мастерства",sections:[
  ["Выберите следующее действие","В статьях о навыках есть таблицы доступных действий и, где это рассчитано источником, базовая скорость получения опыта. Учитывайте дополнительные условия открытия и время на добычу ингредиентов."],
  ["Сравнивайте полные циклы","Смотрите на опыт за час с учётом расхода материалов и простоев. Сравнивайте результаты через статистику текущего действия в игре."],
  ["Открывайте бонусы","У гильдий мастерства есть ранги и задания. Сверяйте их условия и награды в игре. Астрология, ловкость и зельеварение дают дополнительные возможности для развития."]],
  links:[["skills","Mining"],["skills","Astrology"],["skills","Herblore"]]},
 combat:{name:"Подготовка к бою",subtitle:"Снаряжение, еда и выбор противника",sections:[
  ["Соберите комплект","Подберите оружие под выбранный стиль. Проверьте запас еды, боеприпасов или рун и требования к снаряжению."],
  ["Оцените противника","В карточке монстра есть здоровье, интервал атаки и базовый максимальный удар по стилю. Особые атаки, эффекты зоны и взаимодействия стилей меняют итоговый урон."],
  ["Проверьте условия подземелья","Сверьте условия открытия и порядок волн. Перед боем без присмотра понаблюдайте за несколькими победами и проверьте расход еды."]],
  links:[["monsters","Golbin"],["dungeons","HobgolbinCamp"],["skills","Hitpoints"]]}
};
function localName(id, original) {
  if (Object.hasOwn(ru,id)) return ru[id];
  const space = (original || "").indexOf(" ");
  if (space > 0) {
    const adjective = materials[original.slice(0, space)];
    const noun = gear[original.slice(space + 1)];
    if (adjective && noun) return adjective[noun[1]] + " " + noun[0];
  }
  return original || id;
}
function entry(section, id) {
  const dictionary = section === "guides" ? guides : data[section];
  return Object.hasOwn(dictionary,id) ? dictionary[id] : undefined;
}
function titleFor(section, id) {
  return localName(id, entry(section, id)?.name);
}
function entity(section, id, fallback) {
  return entry(section,id) ? '<a href="' + path(section,id) + '">' + esc(titleFor(section,id)) + '</a>' : esc(localName(id,fallback));
}
function sourceLink(url, caption = "Статья на английском") {
  return '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(caption) + '</a>';
}
function card(section, title, subtitle, id) {
  return '<a class="card" href="' + path(section,id) + '"><span class="glyph ' + section + '" aria-hidden="true">' +
    groups[section][1] + '</span><div><h3>' + esc(title) + '</h3><p>' + esc(subtitle) + '</p></div></a>';
}
function home() {
  main.innerHTML = '<section class="hero"><div class="hero-text"><div class="eyebrow">Русскоязычный справочник</div>' +
    '<h1>Melvor <b>II</b> Вики</h1><p>Навыки, предметы, монстры и задания в мире Melvor Idle 2. Найдите нужное или начните с руководства.</p>' +
    '<a class="button" href="#/guides/start">С чего начать</a></div></section>' +
    '<section class="section"><h2>Разделы вики</h2><div class="grid">' +
    Object.entries(groups).map(([key,[title,,desc]]) => card(key,title,desc)).join("") +
    '</div></section><section class="section"><h2>Руководства</h2><div class="reading">' +
    Object.entries(guides).map(([id,g]) => card("guides",g.name,g.subtitle,id)).join("") + '</div></section>';
}
function heading(section, title, subtitle, detail) {
  return '<div class="crumb"><a href="#/">Главная</a>' + (section ? ' / ' +
    (detail ? '<a href="' + path(section) + '">' + groups[section][0] + '</a>' : groups[section][0]) : '') +
    '</div><header class="page-head"><h1>' + esc(title) + '</h1>' +
    (subtitle ? '<p class="muted">' + esc(subtitle) + '</p>' : '') + '</header>';
}
function table(headers, rows) {
  return '<div class="table-wrap"><table><thead><tr>' + headers.map(x => "<th scope=\"col\">" + esc(x) + "</th>").join("") +
    '</tr></thead><tbody>' + rows.map(row => "<tr>" + row.map(x => "<td>" + x + "</td>").join("") + "</tr>").join("") + '</tbody></table></div>';
}
function sectionBlock(title, html) {
  return html ? '<section class="section"><h2>' + esc(title) + '</h2>' + html + '</section>' : "";
}
function facts(fields) {
  return '<div class="facts">' + fields.map(([label,value]) => '<div class="fact"><small>' + esc(label) +
    '</small><strong>' + esc(value) + '</strong></div>').join("") + '</div>';
}
function reqs(list) {
  return (list || []).map(([id,lv]) => entity("skills",id) + " · ур. " + number(lv)).join("<br>");
}
function goodsTable(rows) {
  if (!rows?.length) return "";
  return table(["Предмет","Количество","Шанс"],rows.map(([id,count,max,chance]) =>
    [entity("items",id),quantity(count,max),chance == null ? "—" : formatChance(chance)]));
}
function quantity(count,max) {
  return max != null && max !== count ? number(count) + "–" + number(max) : number(count);
}
function recipeTable(rows, showCreationTime = false) {
  const headers = ["Действие","Требования по уровню","Базовый опыт","Ингредиенты","Предметы"];
  const hasTime = showCreationTime && rows.some(row => row.creationSeconds != null);
  if (hasTime) headers.push("Базовое время");
  return table(headers, rows.map(r => {
    const cells = [esc(localName(r.id,r.name)) + "<small>" + esc(recipeNames[r.kind] || r.kind) + "</small>", reqs(r.requirements) || "—",
      number(r.xp), r.inputs.map(([id,count]) => entity("items",id) + " × " + number(count)).join("<br>") || "—",
      r.outputs.map(([id,count,max]) => entity("items",id) + " × " + quantity(count,max)).join("<br>") || "—"];
    if (hasTime) cells.push(r.creationSeconds == null ? "—" : number(r.creationSeconds) + " с");
    return cells;
  }));
}
function relationTable(rows, isSource) {
  if (!rows?.length) return "";
  const headers = [isSource ? "Источник" : "Действие","Количество"];
  const hasChance = isSource && rows.some(row => row[5] != null);
  if (hasChance) headers.push("Базовый шанс");
  return table(headers,rows.map(([kind,id,name,count,max,chance,basis]) => {
    const [label,section] = relationKinds[kind];
    const link = section ? entity(section,id,name) : sourceLink(
      upstream + "scheda?" + new URLSearchParams({id:kind + "/MelvorBase:" + id}),localName(id,name));
    const cells = [link + "<small>" + label + "</small>",quantity(count,max)];
    if (hasChance) cells.push(chance == null ? "—" : formatChance(chance) +
      (chanceBasis[basis] ? "<small>" + chanceBasis[basis] + "</small>" : ""));
    return cells;
  }));
}
function itemCombatStats(stats) {
  if (!stats?.length) return "";
  return table(["Характеристика","Значение"],stats.map(([id,value,damageType]) => {
    let label = combatStatLabels[id];
    if (damageType) label += " · " + (damageType === "Normal" ? "обычный урон" : damageType);
    if (!label) {
      const [,stance,type] = id.match(/^(.*?)(Attack|Defence)Bonus$/) || [];
      label = stanceLabels[stance] ? (type === "Attack" ? "Бонус атаки" : "Бонус защиты") + " · " + stanceLabels[stance] : id;
    }
    let formatted = number(value);
    if (id === "AttackInterval") formatted = number(value / 1000) + " с";
    if (id === "MagicDamageBonus" || id === "Lifesteal") formatted = percent.format(value);
    return [esc(label),formatted];
  }));
}
function itemBody(id, row) {
  const produced = data.recipes.filter(r => r.outputs.some(x => x[0] === id));
  const used = data.recipes.filter(r => r.inputs.some(x => x[0] === id));
  const fields = [["Цена продажи",row.price == null ? "—" : number(row.price) + " зол."],
    ["Тип",row.types.map(t => labels[t] || t).join(", ") || "Ресурс"]];
  const description = row.description ? '<p' + (row.descriptionLanguage ? ' lang="en"' : '') +
    '>' + esc(row.description) + '</p>' : "";
  const healing = row.healing != null ? "<p>Восстанавливает <strong>" + number(row.healing) +
    "</strong> ед. здоровья при употреблении.</p>" : "";
  const bury = row.bury ? facts([[currencies[row.bury[0]] || row.bury[0], "+" + number(row.bury[1])]]) : "";
  return sectionBlock("Описание",description + healing) + facts(fields) +
    sectionBlock("Характеристики и эффекты",bury + itemCombatStats(row.stats)) +
    sectionBlock("Требования по уровню",reqs(row.requirements)) +
    sectionBlock("Получение в рецептах",produced.length ? recipeTable(produced,true) : "") +
    sectionBlock("Добыча и награды",relationTable(row.sources,true)) +
    sectionBlock("Содержимое",goodsTable(row.contents)) +
    sectionBlock("Использование в рецептах",used.length ? recipeTable(used,true) : "") +
    sectionBlock("Задания и обмен",relationTable(row.uses,false));
}
function renderDetail(section, id) {
  const row = entry(section,id);
  if (!row) return missing();
  const name = titleFor(section,id);
  let body = "";
  if (section === "guides") {
    body = row.sections.map(([label,copy]) => sectionBlock(label,"<p>" + esc(copy) + "</p>")).join("") +
      sectionBlock("Справочные статьи","<ul>" + row.links.map(([kind,key]) => "<li>" + entity(kind,key) + "</li>").join("") + "</ul>");
  } else if (section === "skills") {
    const available = data.recipes.filter(r => r.requirements.some(([key]) => key === id));
    const rates = (row.progress || []).filter(r => r[3] != null);
    body = (skillNotes[id] ? "<p>" + esc(skillNotes[id]) + "</p>" : "") +
      sectionBlock("Требования по уровню",reqs(row.requirements)) +
      sectionBlock("Ориентиры прокачки",rates.length ? "<p class=\"muted\">Базовые оценки источника. Дополнительные требования действий сохраняются.</p>" +
        table(["Уровень","Действие","Опыт / с"],rates.map(([lv,key,label,xp]) => [number(lv),esc(localName(key,label)),number(xp)])) : "") +
      sectionBlock("Действия и рецепты",available.length ? recipeTable(available) : "") +
      "<p>" + sourceLink(upstream + "guide?id=" + encodeURIComponent(id),"Руководство по навыку на английском") + "</p>";
  } else if (section === "items") {
    body = itemBody(id,row);
  } else if (section === "monsters") {
    body = facts([["Боевой уровень",number(row.combatLevel)],["Здоровье",number(row.hitpoints)],
      ["Интервал атаки",row.attackSeconds == null ? "—" : number(row.attackSeconds) + " с"],
      ["Броня",number(row.armour)],["Барьер",number(row.ward)]]) +
      sectionBlock("Базовый максимальный удар",row.maxHits.length ? table(["Стиль","Урон"],
        row.maxHits.map(([style,hit]) => [esc(labels[style] || ru[style] || style),number(hit)])) +
        '<p class="muted">Значения приведены без особых атак и эффектов зоны.</p>' : "") +
      sectionBlock("Места обитания",row.locations.length ? "<ul>" + row.locations.map(([key,label,kind]) =>
        "<li>" + (kind === "Dungeon" ? entity("dungeons",key,label) : esc(localName(key,label))) + "</li>").join("") + "</ul>" : "") +
      sectionBlock("Гарантированная добыча",goodsTable(row.drops.map(([key,min,max]) => [key,min,max,1])));
  } else if (section === "quests") {
    body = facts([["Категория",labels[row.category] || row.category || "—"],["Этапы",number(row.steps)]]) +
      sectionBlock("Предметы для сдачи",goodsTable(row.costs));
  } else if (section === "dungeons") {
    body = facts([["Сложность",labels[row.difficulty] || row.difficulty || "—"],["Волны",number(row.waves.length)]]) +
      sectionBlock("Требования по победам",row.unlocks.length ? "<ul>" + row.unlocks.map(([key,count]) =>
        "<li>" + entity("monsters",key) + " · " + number(count) + "</li>").join("") + "</ul>" : "") +
      sectionBlock("Волны противников",row.waves.length ? table(["Волна","Возможные противники","Количество"],
        row.waves.map(([count,keys],i) => [number(i + 1),keys.map(key => entity("monsters",key)).join(", "),number(count)])) : "");
  }
  const reference = section === "guides" ? sourceLink(steam,"Официальные новости игры") :
    sourceLink(upstream + "scheda?" + new URLSearchParams({id:groups[section][3] + "/MelvorBase:" + id}));
  main.innerHTML = '<article class="article">' + heading(section,name, row.name !== name ? row.name : "",true) +
    body + sectionBlock("Источник","<p>" + reference + "</p>") + "</article>";
}
function list(section) {
  const query = new URLSearchParams(location.hash.split("?")[1]).get("q") || "";
  const searching = section === "search";
  const source = searching ? Object.keys(groups) : [section];
  const rows = source.flatMap(kind => Object.entries(kind === "guides" ? guides : data[kind])
    .map(([id,row]) => ({id,kind,row,name:localName(id,row.name)})));
  const order = (a,b) => collator.compare(a.name,b.name);
  rows.sort(order);
  if (section === "guides") {
    main.innerHTML = heading(section,groups[section][0],groups[section][2]) +
      '<div class="reading">' + rows.map(r => card(section,r.name,r.row.subtitle,r.id)).join("") + "</div>";
    return;
  }
  const types = {
    items:[["Equipment","Снаряжение"],["Food","Еда"],["Potion","Зелья"],["Weapon","Оружие"]],
    quests:[["MainQuests","Сюжетные"],["SideQuests","Побочные"]]
  }[section] || [];
  main.innerHTML = heading(searching ? null : section,searching ? "Поиск по вики" : groups[section][0],
    searching ? "Поиск по русским и английским названиям" : groups[section][2]) +
    '<div class="filters"><input type="search" id="filter" aria-label="Фильтр по названию" placeholder="Поиск по названию…" value="' + esc(query) + '">' +
    (types.length ? '<select id="type" aria-label="Категория"><option value="">Все категории</option>' +
      types.map(([id,title]) => '<option value="' + id + '">' + title + "</option>").join("") + "</select>" : "") +
    '<span class="meta" id="count" role="status"></span></div><div id="results"></div>';
  const filter = document.querySelector("#filter");
  const type = document.querySelector("#type");
  const results = document.querySelector("#results");
  const count = document.querySelector("#count");
  let page = 1;
  const pageSize = 30;
  function resultsView() {
    const selected = type?.value;
    const filtered = rows.filter(({id,kind,row,name}) => matches(filter.value,id,name,row.name) &&
      (!selected || (kind === "items" ? row.types.includes(selected) : row.category === selected)));
    const max = Math.max(1,Math.ceil(filtered.length / pageSize));
    count.textContent = "Результатов: " + number(filtered.length);
    if (!filtered.length) {
      results.innerHTML = '<p class="muted">Ничего не найдено. Попробуйте другое название.</p>';
      return;
    }
    const visible = filtered.slice((page - 1) * pageSize,page * pageSize);
    const detailLabel = section === "monsters" ? "Боевой уровень" :
      section === "items" ? "Цена продажи" : section === "dungeons" ? "Сложность" : "Раздел";
    results.innerHTML = table(["Название",detailLabel],visible.map(({id,kind,row,name}) => [
      entity(kind,id) + (name !== row.name ? "<small>" + esc(row.name) + "</small>" : ""),
      section === "monsters" ? number(row.combatLevel) : section === "items" ? (row.price == null ? "—" : number(row.price) + " зол.") :
      section === "dungeons" ? esc(labels[row.difficulty] || row.difficulty) : esc(groups[kind][0]) ])) +
      (max > 1 ? '<div class="pager"><button type="button" class="button secondary" data-page="-1"' +
        (page === 1 ? " disabled" : "") + '>Назад</button><span class="meta">Страница ' + number(page) + ' из ' + number(max) +
        '</span><button type="button" class="button secondary" data-page="1"' + (page === max ? " disabled" : "") + '>Далее</button></div>' : "");
  }
  function refilter() {
    page = 1;
    resultsView();
  }
  filter.addEventListener("input",refilter);
  type?.addEventListener("change",refilter);
  results.addEventListener("click",event => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    const direction = Number(button.dataset.page);
    page += direction;
    resultsView();
    (results.querySelector('[data-page="' + direction + '"]:enabled') || results.querySelector(".pager button:enabled"))?.focus();
  });
  resultsView();
}
function missing() {
  main.innerHTML = heading(null,"Страница не найдена","") + '<p><a href="#/">Вернуться на главную</a></p>';
}
function render() {
  const [section,id] = location.hash.replace(/^#\/?/,"").split("?")[0].split("/");
  document.querySelectorAll("[data-nav]").forEach(a => {
    const active = a.dataset.nav === (section || "home");
    a.classList.toggle("active",active);
    if (active) a.setAttribute("aria-current","page");
    else a.removeAttribute("aria-current");
  });
  if (!section) home();
  else if (section === "search" && !id) list(section);
  else if (!Object.hasOwn(groups,section)) missing();
  else if (!id) list(section);
  else {
    try { renderDetail(section,decodeURIComponent(id)); }
    catch (error) {
      if (!(error instanceof URIError)) throw error;
      missing();
    }
  }
  const title = main.querySelector("h1").textContent;
  document.title = !section ? "Melvor II Вики — русскоязычный справочник" : title + " — Melvor II Вики";
  window.scrollTo(0,0);
}
search.addEventListener("submit",event => {
  event.preventDefault();
  const q = searchInput.value.trim();
  if (q) location.hash = "#/search?" + new URLSearchParams({q});
});
document.addEventListener("keydown",event => {
  if (event.key === "/" && !event.altKey && !event.ctrlKey && !event.metaKey &&
      !event.target.closest?.("input, textarea, select, [contenteditable]")) {
    event.preventDefault();
    searchInput.focus();
  }
});
window.addEventListener("hashchange",render);
render();
