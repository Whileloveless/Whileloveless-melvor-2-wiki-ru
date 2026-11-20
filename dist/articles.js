"use strict";

const wikiSource = "https://melvor2wiki.github.io/";
const wikiSections = { items:"Item", skills:"Skill", monsters:"Enemy", quests:"Quest", dungeons:"Dungeon" };
const wikiSectionByType = Object.fromEntries(Object.entries(wikiSections).map(([key,value]) => [value,key]));
const wikiTypes = {
  Item:"Предметы", Skill:"Навыки", Enemy:"Монстры", Quest:"Задания", Dungeon:"Подземелья",
  Currency:"Валюты", ArtisanRecipe:"Ремесленные рецепты", CookingRecipe:"Рецепты кулинарии",
  WoodcuttingRecipe:"Лесозаготовка", MiningRecipe:"Добыча руды", FishingLocation:"Места рыбалки",
  FishingRecipe:"Рыбалка", FiremakingRecipe:"Разведение огня", FiremakingBonfire:"Костры",
  ShopPurchase:"Товары магазина", MasteryGuildRank:"Ранги мастерства", MasteryGuildBonus:"Бонусы мастерства",
  MasteryGuildCategory:"Категории мастерства", MasteryGuildTask:"Испытания гильдий", ItemUpgrade:"Улучшения предметов",
  FarmingRecipe:"Земледелие", RanchingAnimalVariant:"Разновидности домашнего скота",
  RanchingAnimal:"Домашний скот", GrainMillRecipe:"Рецепты мельницы", Pet:"Питомцы",
  HuntingAnimal:"Охотничьи цели", HuntingLocation:"Охотничьи угодья", HuntingAnimalSpecies:"Виды животных",
  CombatStat:"Боевые характеристики", CombatStatCategory:"Группы боевых характеристик", AttackStance:"Боевые стойки",
  CombatArea:"Боевые зоны", Attack:"Атаки", DamageOverTimeEffect:"Периодический урон",
  StunEffect:"Оглушение", TurnCountingEffect:"Эффекты по ходам", MagicSpell:"Заклинания", SpellBook:"Книги заклинаний",
  CombatPassive:"Пассивные боевые эффекты", BleedEffect:"Кровотечение", EquipmentSetBonus:"Бонусы комплектов",
  AgilityCourse:"Трассы ловкости", AgilityLocation:"Зоны ловкости", AgilityObstacle:"Препятствия ловкости",
  AgilityTechnique:"Техники ловкости", ThievingLocation:"Районы воровства", ThievingRecipe:"Цели воровства",
  HerbloreRecipe:"Зелья", EndOfTurnDamageEffect:"Урон в конце хода", EndOfTurnHealingEffect:"Исцеление в конце хода",
  RandomMagnitudeEffect:"Эффекты случайной силы", StackingEffect:"Накапливаемые эффекты",
  SlayerMaster:"Наставники истребления", Prayer:"Молитвы", PrayerSlot:"Ячейки молитв", PrayerSlotType:"Типы ячеек молитв",
  ThievingDistraction:"Отвлекающие приёмы", AstrologyBonusesEvent:"Астрологические события",
  AstrologyConstellation:"Созвездия", AstrologyNode:"Астрологические узлы", AstrologyStarNode:"Звёзды созвездий",
  AttackChargingEffect:"Подготовка атак", AttackCountingEffect:"Эффекты серий атак",
  OvergrowthEffect:"Разрастание", Training:"Руководства по прокачке", Directory:"Подборки", Tool:"Справочные таблицы"
};
const compareWiki = new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const wikiPacks = new Map();

async function loadWikiPack(name) {
  const response = await fetch("/" + name + ".json.gz");
  if (!response.ok || !response.body) throw new Error("Wiki archive unavailable");
  return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
}

function wikiPack(name) {
  if (!wikiPacks.has(name)) {
    wikiPacks.set(name, loadWikiPack(name).catch(error => {
      wikiPacks.delete(name);
      throw error;
    }));
  }
  return wikiPacks.get(name);
}

function wikiArticlePath(key) {
  const slash = key.indexOf("/");
  const type = key.slice(0,slash);
  const id = key.slice(slash + 1);
  const section = Object.hasOwn(wikiSectionByType,type) && wikiSectionByType[type];
  if (section && id.startsWith("MelvorBase:")) return path(section,id.slice("MelvorBase:".length));
  return path("article",key);
}

function wikiSourcePage(key) {
  return wikiSource + (key.startsWith("#/") ? key : "#/scheda?" + new URLSearchParams({id:key}));
}

function setWikiTitle(title) {
  document.title = title + " — Melvor Idle 2 Вики";
}

function linkArticlePaths(content) {
  return content.replaceAll('href="#/"','href="/"').replaceAll('href="#/','href="/wiki/');
}

function bindWikiArticleControls(root, key) {
  root.addEventListener("click", event => {
    const sort = event.target.closest("[data-sort-column]");
    if (sort) {
      const table = sort.closest("table");
      const body = table?.tBodies[0];
      const column = Number(sort.dataset.sortColumn);
      if (!body || !Number.isInteger(column)) return;
      const reverse = sort.closest("th").getAttribute("aria-sort") === "ascending";
      for (const th of table.querySelectorAll("thead th[aria-sort]")) th.removeAttribute("aria-sort");
      sort.closest("th").setAttribute("aria-sort",reverse ? "descending" : "ascending");
      const sortValue = row => row.cells[column]?.dataset.sort ?? row.cells[column]?.textContent.trim() ?? "";
      [...body.rows].sort((a,b) => {
        const aValue = sortValue(a);
        const bValue = sortValue(b);
        const result = aValue && bValue && Number.isFinite(Number(aValue)) && Number.isFinite(Number(bValue))
          ? Number(aValue)-Number(bValue) : compareWiki.compare(aValue,bValue);
        return reverse ? -result : result;
      }).forEach(row => body.append(row));
      return;
    }
    const toggle = event.target.closest("[data-toggle-toc]");
    if (toggle) {
      const list = toggle.closest("nav")?.querySelector("ol, ul");
      if (!list) return;
      list.hidden = !list.hidden;
      toggle.setAttribute("aria-expanded",String(!list.hidden));
      toggle.textContent = list.hidden ? "Показать" : "Скрыть";
      return;
    }
    const link = event.target.closest("a[href^='#']:not([href^='#/'])");
    if (link) {
      const anchor = link.getAttribute("href").slice(1);
      const target = root.querySelector("#" + CSS.escape(anchor));
      if (!target) return;
      event.preventDefault();
      history.replaceState(null,"",wikiArticlePath(key) + "?section=" + encodeURIComponent(anchor));
      target.scrollIntoView({block:"start"});
    }
  });
  const anchor = routeParams().get("section");
  if (anchor) root.querySelector("#" + CSS.escape(anchor))?.scrollIntoView({block:"start"});
}

function articleError(title, url, fallback) {
  if (fallback) {
    fallback();
    return;
  }
  main.innerHTML = heading(null,title,"") + '<p>Не удалось загрузить содержание. ' +
    sourceLink(url,"Открыть первоисточник") + '</p>';
  setWikiTitle(title);
}

async function renderWikiArticle(key, section, id, fallback) {
  const requested = wikiRoute();
  const serverArticle = main.dataset?.ssrArticle === key;
  const initial = section && id && entry(section,id) ? titleFor(section,id) : "Статья";
  if (!serverArticle) {
    main.innerHTML = heading(section,initial,"",id) + '<p role="status" class="muted">Загружаем статью…</p>';
    setWikiTitle(initial);
  }
  try {
    const index = await wikiPack("article-index");
    if (wikiRoute() !== requested) return;
    if (!Object.hasOwn(index,key)) {
      if (fallback) fallback();
      else missing();
      return;
    }
    const [title, original, , packId] = index[key];
    const pack = await wikiPack("article-" + String(packId).padStart(3,"0"));
    if (wikiRoute() !== requested) return;
    if (!Object.hasOwn(pack,key)) throw new Error("Article missing from archive");
    const [content, calculator] = pack[key];
    if (!serverArticle) {
      main.innerHTML = '<article class="article wiki-page">' + heading(section,title,original === title ? "" : original,id) +
        '<div class="wiki-article-content">' + linkArticlePaths(content) + '</div>' +
        sectionBlock("Источник",'<p>' + sourceLink(wikiSourcePage(key)) + '</p>') + '</article>';
    }
    const root = main.querySelector(".wiki-article-content");
    if (!root) return;
    if (!serverArticle) setWikiTitle(title);
    if (typeof bindWikiDropCalculator === "function") bindWikiDropCalculator(root,calculator);
    if (key.startsWith("#/guide?") && typeof bindWikiTraining === "function") {
      const skill = new URLSearchParams(key.split("?")[1]).get("id");
      bindWikiTraining(root,skill,{
        titleFor: target => index[target]?.[0],
        hrefFor: target => Object.hasOwn(index,target) ? wikiArticlePath(target) : wikiSourcePage(target)
      });
    }
    bindWikiArticleControls(root,key);
  } catch (error) {
    if (!serverArticle && wikiRoute() === requested) articleError(initial,wikiSourcePage(key),fallback);
  }
}

async function renderWikiCatalog(isSearch) {
  const requested = wikiRoute();
  const term = routeParams().get("q") || "";
  const title = isSearch ? "Поиск по вики" : "Полный каталог";
  if (!main.querySelector("h1")?.textContent) {
    main.innerHTML = heading(null,title,"") + '<p role="status" class="muted">Загружаем каталог…</p>';
  }
  setWikiTitle(title);
  let index;
  try {
    index = await wikiPack("article-index");
  } catch {
    if (wikiRoute() === requested) {
      if (isSearch) list("search");
      else articleError(title,wikiSource + "#",null);
    }
    return;
  }
  if (wikiRoute() !== requested) return;
  const rows = Object.entries(index).sort(([,a],[,b]) =>
    compareWiki.compare(a[0],b[0]) || compareWiki.compare(a[1],b[1]));
  const typeCounts = new Map();
  for (const [,row] of rows) typeCounts.set(row[2],(typeCounts.get(row[2]) || 0) + 1);
  const categories = [...typeCounts].sort(([a],[b]) => compareWiki.compare(wikiTypes[a] || a,wikiTypes[b] || b));
  main.innerHTML = heading(null,title,"Поиск по русским и английским названиям") +
    '<div class="filters"><input id="wiki-query" type="search" aria-label="Название статьи" placeholder="Название или ID…" value="' +
    esc(term) + '"><select id="wiki-kind" aria-label="Тип статьи"><option value="">Все разделы</option>' +
    categories.map(([kind,total]) => '<option value="' + esc(kind) + '">' + esc(wikiTypes[kind] || kind) +
      " (" + number(total) + ")</option>").join("") +
    '</select><span id="wiki-count" class="meta" role="status"></span></div><div id="wiki-list"></div>';
  const filter = main.querySelector("#wiki-query");
  const kindFilter = main.querySelector("#wiki-kind");
  const results = main.querySelector("#wiki-list");
  const count = main.querySelector("#wiki-count");
  let page = currentWikiPage();
  const limit = 30;
  function draw() {
    const chosen = kindFilter.value;
    const filtered = rows.filter(([key,[translated,original,kind]]) => (!chosen || kind === chosen) &&
      matches(filter.value,key,translated,original));
    const total = Math.max(1,Math.ceil(filtered.length / limit));
    page = Math.min(page,total);
    count.textContent = "Статей: " + number(filtered.length);
    if (!filtered.length) {
      results.innerHTML = '<p class="muted">Ничего не найдено.</p>';
      return;
    }
    results.innerHTML = table(["Статья","Раздел"],filtered.slice((page - 1) * limit,page * limit)
      .map(([key,[translated,original,kind,,image]]) => [
        '<a href="' + wikiArticlePath(key) + '">' + (image ? '<img class="wiki-small-art" alt="" loading="lazy" src="' +
          esc(wikiSource + image) + '">' : "") + esc(translated) + '</a>' +
          (translated !== original ? '<small lang="en">' + esc(original) + '</small>' : ""),
        esc(wikiTypes[kind] || kind)
      ])) +
      (total === 1 ? "" : '<div class="pager"><button type="button" class="button secondary" data-wiki-page="-1"' +
        (page === 1 ? " disabled" : "") + '>Назад</button><span class="meta">Страница ' + number(page) + " из " +
        number(total) + '</span><button type="button" class="button secondary" data-wiki-page="1"' +
        (page === total ? " disabled" : "") + '>Далее</button></div>');
  }
  function refilter() { page = 1; setWikiPage(page); draw(); }
  filter.addEventListener("input",refilter);
  kindFilter.addEventListener("change",refilter);
  results.addEventListener("click",event => {
    const move = event.target.closest("[data-wiki-page]:enabled");
    if (!move) return;
    const offset = move.dataset.wikiPage;
    page += Number(offset);
    setWikiPage(page);
    draw();
    (results.querySelector('[data-wiki-page="' + offset + '"]:enabled') ||
      results.querySelector("[data-wiki-page]:enabled"))?.focus();
  });
  draw();
}
