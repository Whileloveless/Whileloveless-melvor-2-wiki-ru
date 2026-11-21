const seoArchive = new Map();
const seoOrder = new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const seoNumber = new Intl.NumberFormat("ru");
const seoPageSize = 30;
const seoSource = "https://melvor2wiki.github.io/";
const seoGroups = {
  skills: ["Skill","Навыки","Прокачка, требования, действия и бонусы каждого навыка."],
  items: ["Item","Предметы","Снаряжение, ресурсы, расходники и способы их получения."],
  monsters: ["Enemy","Монстры","Боевые характеристики, места обитания и добыча."],
  quests: ["Quest","Задания","Цели, этапы, требования и награды заданий."],
  dungeons: ["Dungeon","Подземелья","Условия входа, волны противников и награды."],
};
const seoGroupByType = Object.fromEntries(Object.entries(seoGroups).map(([group,[type]]) => [type,group]));
const seoEntities = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const seoEscape = value => String(value ?? "").replace(/[&<>"']/g, char => seoEntities[char]);

function seoArticlePath(key) {
  const slash = key.indexOf("/");
  const type = key.slice(0,slash);
  const id = key.slice(slash + 1);
  const group = Object.hasOwn(seoGroupByType,type) && seoGroupByType[type];
  if (group && id.startsWith("MelvorBase:")) {
    return "/wiki/" + group + "/" + encodeURIComponent(id.slice("MelvorBase:".length));
  }
  return "/wiki/article/" + encodeURIComponent(key);
}

function seoSourceLink(key) {
  return seoSource + (key.startsWith("#/") ? key : "#/scheda?" + new URLSearchParams({id:key}));
}

function seoRewriteLinks(html) {
  return html.replace(/\bhref=(["'])#\/([^"']*)\1/g, (_, quote, route) =>
    "href=" + quote + (route ? "/wiki/" + route : "/") + quote
  );
}

function seoCrumbs(group, title) {
  return '<nav class="crumb" aria-label="Путь к статье"><a href="/">Главная</a>' +
    (group ? ' / <a href="/wiki/' + group + '">' + seoEscape(title) + '</a>' : "") + '</nav>';
}

function seoHeading(title, description) {
  return '<header class="page-head"><h1>' + seoEscape(title) + '</h1>' +
    (description ? '<p class="muted">' + seoEscape(description) + '</p>' : "") + '</header>';
}

function seoPageName(group) {
  return seoGroups[group]?.[1] || (group === "guides" ? "Руководства" : "Полный каталог");
}

function seoHtml(request,url,{ title,description,body,canonical,key,indexable=true,status=200 }) {
  const shell = assets["/index.html"][1];
  const name = canonical === "/" ? title : title + " — Melvor Idle 2 Вики";
  const tags = canonical ? '<link rel="canonical" href="' + seoEscape(url.origin + canonical) + '">\n' : "";
  const metadata = tags + (indexable ? "" : '<meta name="robots" content="noindex, follow">\n');
  const html = seoRewriteLinks(shell)
    .replace(/<title>[^<]*<\/title>/,() => "<title>" + seoEscape(name) + "</title>")
    .replace(/<meta name="description"[^>]*>/, () => '<meta name="description" content="' + seoEscape(description) + '">')
    .replace("</head>",metadata + "</head>")
    .replace('<main id="main"></main>', () =>
      '<main id="main"' + (key ? ' data-ssr-article="' + seoEscape(key) + '"' : "") + '>' + body + '</main>'
    );
  return seoResponse(request,html,"text/html; charset=utf-8",status,
    indexable ? {} : {"X-Robots-Tag":"noindex, follow"});
}

function seoResponse(request,body,contentType,status=200,headers={}) {
  return new Response(request.method === "HEAD" ? null : body,{
    status,
    headers:{
      "Content-Type":contentType,
      "Cache-Control":status === 200 ? "private, max-age=0, must-revalidate" : "no-store",
      "X-Content-Type-Options":"nosniff",
      ...headers
    }
  });
}

function seoNotFound(request,url) {
  const title = "Страница не найдена";
  return seoHtml(request,url,{
    title,description:"Проверьте адрес или найдите статью в каталоге Melvor Idle 2.",
    indexable:false,status:404,
    body:seoCrumbs() + seoHeading(title) + '<p><a href="/wiki/catalog">Открыть полный каталог</a></p>'
  });
}

async function seoJsonArchive(assetPath) {
  const asset = assets[assetPath];
  if (!asset) throw new Error("Missing wiki archive " + assetPath);
  const source = new Response(decodeAsset(asset[1]));
  return new Response(source.body.pipeThrough(new DecompressionStream("gzip"))).json();
}

let seoIndexPending;
function seoIndex() {
  if (!seoIndexPending) {
    seoIndexPending = seoJsonArchive("/article-index.json.gz").then(index => {
      const byGroup = Object.fromEntries(Object.keys(seoGroups).map(group => [group,[]]));
      const rows = Object.entries(index).sort(([,a],[,b]) =>
        seoOrder.compare(a[0],b[0]) || seoOrder.compare(a[1],b[1]));
      for (const entry of rows) {
        const group = seoGroupByType[entry[1][2]];
        if (group) byGroup[group].push(entry);
      }
      return {index,rows,byGroup};
    }).catch(error => {
      seoIndexPending = null;
      throw error;
    });
  }
  return seoIndexPending;
}

function seoPack(id) {
  const existing = seoArchive.get(id);
  if (existing) {
    seoArchive.delete(id);
    seoArchive.set(id,existing);
    return existing;
  }
  const pending = seoJsonArchive("/article-" + String(id).padStart(3,"0") + ".json.gz").catch(error => {
    if (seoArchive.get(id) === pending) seoArchive.delete(id);
    throw error;
  });
  seoArchive.set(id,pending);
  if (seoArchive.size > 4) seoArchive.delete(seoArchive.keys().next().value);
  return pending;
}

function seoCards(cards) {
  return '<div class="grid">' + cards.map(([href,title,copy]) =>
    '<a class="card" href="' + href + '"><div><h3>' + seoEscape(title) + '</h3><p>' +
    seoEscape(copy) + '</p></div></a>'
  ).join("") + '</div>';
}

function seoGuideCards() {
  return seoCards(Object.entries(seoGuides).map(([id,{name,subtitle}]) =>
    ["/wiki/guides/" + encodeURIComponent(id),name,subtitle]));
}

function seoHome(request,url) {
  const title = "Melvor Idle 2 — вики на русском";
  const description = "Предметы, навыки, монстры, задания и подземелья. Гайды для новичков, калькуляторы прокачки и шансов выпадения предметов.";
  const cards = Object.entries(seoGroups).map(([id,[,name,copy]]) => ["/wiki/" + id,name,copy]);
  cards.push(["/wiki/catalog","Полный каталог","Все категории и статьи русскоязычной вики."]);
  const body = '<section class="hero"><div class="hero-text"><div class="eyebrow">Русскоязычный справочник</div>' +
    '<h1>Melvor Idle <b>2</b> — вики на русском</h1><p>' + seoEscape(description) +
    '</p><a class="button" href="/wiki/guides/start">С чего начать</a></div></section>' +
    '<section class="section"><h2>Разделы вики</h2>' + seoCards(cards) + '</section>' +
    '<section class="section"><h2>Руководства</h2>' + seoGuideCards() + '</section>';
  return seoHtml(request,url,{title,description,body,canonical:"/"});
}

function seoGuide(request,url,id,index) {
  if (!id) {
    const title = "Руководства";
    const description = "Первые шаги, развитие навыков и подготовка к бою в Melvor Idle 2.";
    const guidesKey = "#/guides";
    const training = Object.hasOwn(index,guidesKey) ?
      '<section class="section"><h2>Прокачка навыков</h2><p><a href="' + seoArticlePath(guidesKey) +
      '">Все руководства по прокачке</a></p></section>' : "";
    return seoHtml(request,url,{title,description,canonical:"/wiki/guides",
      body:seoCrumbs() + seoHeading(title,description) + seoGuideCards() + training});
  }
  const guide = Object.hasOwn(seoGuides,id) ? seoGuides[id] : null;
  if (!guide) return seoNotFound(request,url);
  const {name:title,subtitle:description,sections,links} = guide;
  const related = links.map(([group,entity]) => {
    const type = seoGroups[group]?.[0];
    const key = type + "/MelvorBase:" + entity;
    return Object.hasOwn(index,key) ? '<li><a href="' + seoArticlePath(key) + '">' +
      seoEscape(index[key][0]) + '</a></li>' : "";
  }).join("");
  const body = seoCrumbs("guides","Руководства") + seoHeading(title,description) +
    sections.map(([heading,copy]) =>
      '<section class="section"><h2>' + seoEscape(heading) + '</h2><p>' + seoEscape(copy) + '</p></section>'
    ).join("") +
    (related ? '<section class="section"><h2>Справочные статьи</h2><ul>' + related + '</ul></section>' : "");
  return seoHtml(request,url,{
    title,description,body:'<article class="article">' + body + '</article>',
    canonical:"/wiki/guides/" + encodeURIComponent(id)
  });
}

function seoDescription(title,body) {
  for (const [,paragraph] of body.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/gi)) {
    const text = paragraph.replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ")
      .replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;|&#x27;/g,"'")
      .replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();
    if (text.length < 24 || !/[А-ЯЁа-яё]/.test(text)) continue;
    return title + " — " + (text.length <= 135 ? text : text.slice(0,132).replace(/\s+\S*$/,"") + "…");
  }
  return title + " в Melvor Idle 2. Характеристики, условия и связанные статьи русскоязычной вики.";
}

async function seoArticle(request,url,key,[title,original,type,packId]) {
  const pack = await seoPack(packId);
  if (!Object.hasOwn(pack,key)) throw new Error("Archived wiki article missing " + key);
  const content = seoRewriteLinks(pack[key][0]);
  const group = seoGroupByType[type];
  const body = '<article class="article wiki-page">' + seoCrumbs(group,seoPageName(group)) +
    seoHeading(title,original === title ? "" : original) +
    '<div class="wiki-article-content">' + content + '</div>' +
    '<section class="section"><h2>Источник</h2><p><a href="' + seoEscape(seoSourceLink(key)) +
    '" target="_blank" rel="noopener">Статья на английском</a></p></section></article>';
  return seoHtml(request,url,{title,description:seoDescription(title,content),body,key,canonical:seoArticlePath(key)});
}

function seoListPath(group,page,query="") {
  const params = new URLSearchParams();
  if (query) params.set("q",query);
  if (page > 1) params.set("page",String(page));
  const search = params.toString();
  return "/wiki/" + group + (search ? "?" + search : "");
}

function seoArticleRows(rows) {
  return '<ul class="wiki-ssr-list">' + rows.map(([key,[title,original]]) =>
    '<li><a href="' + seoArticlePath(key) + '">' + seoEscape(title) + '</a>' +
    (title === original ? "" : ' <small lang="en">' + seoEscape(original) + '</small>') + '</li>'
  ).join("") + '</ul>';
}

function seoPagination(group,page,total,query) {
  const link = (number,label) => '<a class="button secondary" href="' +
    seoEscape(seoListPath(group,number,query)) + '">' + label + '</a>';
  if (total < 2) return "";
  return '<nav class="pager" aria-label="Страницы каталога">' +
    (page > 1 ? link(page - 1,"Назад") : "") +
    '<span class="meta">Страница ' + seoNumber.format(page) + ' из ' + seoNumber.format(total) + '</span>' +
    (page < total ? link(page + 1,"Далее") : "") + '</nav>';
}

function seoList(request,url,group,snapshot) {
  const isSearch = group === "search";
  const title = isSearch ? "Поиск по вики" : seoPageName(group);
  const rawPage = url.searchParams.get("page");
  const page = rawPage && /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const query = isSearch ? (url.searchParams.get("q") || "").trim().slice(0,150) : "";
  const normalize = value => value.toLocaleLowerCase("ru").replaceAll("ё","е");
  const terms = query ? normalize(query).split(/\s+/) : [];
  const rows = isSearch ? snapshot.rows.filter(([key,[ru,en]]) => {
    const haystack = normalize([key,ru,en].join(" "));
    return terms.every(term => haystack.includes(term));
  }) : snapshot.byGroup[group] || snapshot.rows;
  const total = Math.max(1,Math.ceil(rows.length / seoPageSize));
  if (!Number.isSafeInteger(page) || page < 1 || page > total) return seoNotFound(request,url);
  const description = seoGroups[group]?.[2] || (isSearch ?
    "Поиск по русским и английским названиям в Melvor Idle 2." :
    "Полный каталог русскоязычной вики Melvor Idle 2.");
  const sliced = rows.slice((page - 1) * seoPageSize,page * seoPageSize);
  const body = seoCrumbs() + seoHeading(title,description) +
    (query ? '<p>Запрос <strong>' + seoEscape(query) + '</strong></p>' : "") +
    '<p class="meta">Статей: ' + seoNumber.format(rows.length) + '</p>' +
    (sliced.length ? seoArticleRows(sliced) : '<p>Ничего не найдено.</p>') + seoPagination(group,page,total,query);
  return seoHtml(request,url,{
    title:page === 1 ? title : title + " · страница " + seoNumber.format(page),
    description,body,canonical:isSearch ? null : seoListPath(group,page),indexable:!isSearch
  });
}

async function seoSitemap(request,url) {
  const {index} = await seoIndex();
  const paths = new Set(["/","/wiki/catalog","/wiki/guides",...Object.keys(seoGroups).map(section => "/wiki/" + section)]);
  for (const id of Object.keys(seoGuides)) paths.add("/wiki/guides/" + encodeURIComponent(id));
  for (const key of Object.keys(index)) paths.add(seoArticlePath(key));
  const body = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    Array.from(paths,path => '<url><loc>' + seoEscape(url.origin + path) + '</loc></url>').join("\n") + '\n</urlset>';
  return seoResponse(request,body,"application/xml; charset=utf-8");
}

async function routeSeo(request,url) {
  const {pathname} = url;
  if (pathname === "/robots.txt") return seoResponse(request,
    "User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: " + url.origin + "/sitemap.xml\n",
    "text/plain; charset=utf-8");
  if (pathname === "/sitemap.xml") return seoSitemap(request,url);
  if (pathname === "/") return seoHome(request,url);
  if (pathname === "/index.html") return Response.redirect(url.origin + "/",308);
  if (pathname === "/wiki" || pathname === "/wiki/") return Response.redirect(url.origin + "/wiki/catalog",308);
  if (!pathname.startsWith("/wiki/")) return null;

  const parts = pathname.replace(/\/+$/,"").slice("/wiki/".length).split("/");
  if (parts.length > 2) return seoNotFound(request,url);
  let group, id;
  try {
    [group,id] = parts.map(part => decodeURIComponent(part));
  } catch {
    return seoNotFound(request,url);
  }
  const builtIn = Object.hasOwn(seoGroups,group);
  if (!builtIn && !["article","guides","catalog","search"].includes(group)) return seoNotFound(request,url);
  if ((id && ["catalog","search"].includes(group)) || (!id && group === "article")) {
    return seoNotFound(request,url);
  }

  try {
    const snapshot = await seoIndex();
    if ((builtIn && id) || group === "article") {
      const key = builtIn ? seoGroups[group][0] + "/MelvorBase:" + id : id;
      if (!Object.hasOwn(snapshot.index,key)) return seoNotFound(request,url);
      const canonical = seoArticlePath(key);
      if (pathname !== canonical) return Response.redirect(url.origin + canonical + url.search,308);
      return await seoArticle(request,url,key,snapshot.index[key]);
    }
    const canonical = "/wiki/" + group + (id ? "/" + encodeURIComponent(id) : "");
    if (pathname !== canonical) return Response.redirect(url.origin + canonical + url.search,308);
    if (group === "guides") return seoGuide(request,url,id,snapshot.index);
    return seoList(request,url,group,snapshot);
  } catch (error) {
    console.error(error);
    const title = "Не удалось загрузить статью";
    return seoHtml(request,url,{title,description:title,indexable:false,status:503,
      body:seoCrumbs() + seoHeading(title) + '<p>Попробуйте обновить страницу позже.</p>'});
  }
}
