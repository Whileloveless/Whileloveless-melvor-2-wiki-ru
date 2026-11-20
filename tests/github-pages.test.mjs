import assert from "node:assert/strict";
import {readFile,stat} from "node:fs/promises";
import path from "node:path";
import {test} from "node:test";

const siteRoot=path.resolve(process.argv[2] || "_site");
const baseUrl=new URL(process.argv[3] || "https://whileloveless.github.io/melvor-2-wiki-ru/");
const base=baseUrl.pathname.replace(/\/$/,"");
const origin=baseUrl.origin;
const file=part=>readFile(path.join(siteRoot,part),"utf8");
const canonical=(route)=>origin + base + route;

test("Russian home, permanent article and illustration work at the repository path", async () => {
  const home=await file("index.html");
  assert.match(home,/<html lang="ru"/);
  assert.match(home,/<title>Melvor Idle 2/);
  assert.ok(home.includes('rel="canonical" href="' + canonical("/") + '"'));
  assert.ok(home.includes('href="' + base + '/wiki/items/"'));
  assert.ok(home.includes('src="' + base + '/site-config.js"'));
  assert.ok(home.includes('src="' + base + '/app.js"'));
  assert.ok(home.includes('action="' + base + '/wiki/search/"'));
  const item=await file("wiki/items/Shrimp/index.html");
  assert.match(item,/<h1>Креветка<\/h1>/);
  assert.match(item,/21,74%/);
  assert.ok(item.includes('rel="canonical" href="' + canonical("/wiki/items/Shrimp/") + '"'));
  assert.ok(item.includes('href="' + base + '/wiki/items/RawShrimp/"'));
  assert.ok(item.includes('src="' + base + '/assets/1302-b41ed02d0947.webp"'));
  assert.ok((await stat(path.join(siteRoot,"assets/1302-b41ed02d0947.webp"))).size > 0);
});

test("sitemap points to real HTML pages without hash routes or encoded slashes", async () => {
  const sitemap=await file("sitemap.xml");
  const links=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match=>match[1].replaceAll("&amp;","&"));
  assert.ok(links.length >= 9607);
  assert.equal(new Set(links).size,links.length);
  for (const url of links) {
    assert.ok(url.startsWith(canonical("/")),url);
    assert.doesNotMatch(url,/[#?]|%2f|\/search\//i);
  }
  for (const route of ["/","/wiki/items/Shrimp/","/wiki/article/Currency~2FMelvorBase~3AGoldPieces/","/wiki/items/page/2/"]) {
    assert.ok(links.includes(canonical(route)),route);
    assert.ok((await stat(path.join(siteRoot,route.slice(1),"index.html"))).size > 0,route);
  }
  const next=await file("wiki/items/page/2/index.html");
  assert.ok(next.includes('href="' + base + '/wiki/items/page/3/"'));
  assert.ok(next.includes('rel="canonical" href="' + canonical("/wiki/items/page/2/") + '"'));
  const search=await file("wiki/search/index.html");
  const missing=await file("404.html");
  assert.match(search,/noindex, follow/);
  assert.match(missing,/data-static-not-found/);
  assert.match(missing,/noindex, follow/);
  assert.doesNotMatch(await file("robots.txt"),/Disallow: \/\s*$/m);
});
