import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { after, before, test } from "node:test";

const origin = "https://melvor.example";
const output = mkdtempSync(join(tmpdir(), "melvor-worker-"));
let worker;
before(async () => {
  execFileSync("python", ["scripts/build-worker.py", output], {
    cwd: new URL("..", import.meta.url), stdio: "inherit"
  });
  ({ default: worker } = await import(pathToFileURL(join(output,"dist/server/index.js"))));
});
after(() => rmSync(output,{ recursive:true, force:true }));

const request = (path, init) => worker.fetch(new Request(origin + path, init), {});
const fetchHtml = async path => {
  const res = await request(path);
  assert.match(res.headers.get("Content-Type") || "",/text\/html/);
  return [res, await res.text()];
};
const mainBody = html => html.match(/<main id="main"[^>]*>([\s\S]*?)<\/main>/)?.[1];
const href = "Item%2FMelvorBase%3AShrimp";

test("SSR home and category pages have real Russian content and page links", async () => {
  const [home, html] = await fetchHtml("/");
  assert.equal(home.status,200);
  assert.match(html,/<link rel="canonical" href="https:\/\/melvor.example\/">/);
  assert.match(mainBody(html),/<h1[^>]*>.*Melvor/);
  assert.match(mainBody(html),/href="\/wiki\/items"/);
  const [cat, listing] = await fetchHtml("/wiki/items?page=2");
  assert.equal(cat.status,200);
  assert.match(listing,/rel="canonical" href="https:\/\/melvor.example\/wiki\/items\?page=2"/);
  assert.match(mainBody(listing),/href="\/wiki\/items\?page=3"/);
  assert.equal(new Set([...mainBody(listing).matchAll(/href="(\/wiki\/items\/[^"]+)"/g)].map(x=>x[1])).size,30);
});

test("SSR articles use a single heading and resolve real packed data and links", async () => {
  const [page, article] = await fetchHtml("/wiki/items/Shrimp?section=effects");
  assert.equal(page.status,200);
  assert.match(article,/rel="canonical" href="https:\/\/melvor.example\/wiki\/items\/Shrimp"/);
  assert.match(article,/data-ssr-article="Item\/MelvorBase:Shrimp"/);
  assert.match(mainBody(article),/Креветка/);
  assert.match(mainBody(article),/wiki-article-content/);
  assert.match(mainBody(article),/href="\/wiki\/items\/RawShrimp"/);
  assert.match(mainBody(article),/href="#effects"/);
  assert.equal([...mainBody(article).matchAll(/<h1[ >]/g)].length,1);
  assert.doesNotMatch(mainBody(article),/href="#\//);
  const [generic, gold] = await fetchHtml("/wiki/article/Currency%2FMelvorBase%3AGoldPieces");
  assert.equal(generic.status,200);
  assert.match(gold,/data-ssr-article="Currency\/MelvorBase:GoldPieces"/);
  assert.match(gold,/rel="canonical" href="https:\/\/melvor.example\/wiki\/article\/Currency%2FMelvorBase%3AGoldPieces"/);
});

test("route variants redirect to canonical URLs and unknown pages return 404", async () => {
  for (const variant of ["/wiki/items/Shrimp/", "/wiki/article/" + href, "/wiki/items/%53hrimp"]) {
    const res = await request(variant);
    assert.equal(res.status,308,variant);
    assert.equal(res.headers.get("Location"),origin + "/wiki/items/Shrimp",variant);
  }
  for (const invalid of ["/wiki/unknown", "/wiki/items/absent", "/wiki/items?page=999999", "/wiki/items/%ZZ"]) {
    const res = await request(invalid);
    assert.equal(res.status,404,invalid);
  }
  assert.equal((await request("/wiki/items/Shrimp",{ method:"HEAD" })).status,200);
});

test("search noindex and printable response safely contain user query", async () => {
  const [res, html] = await fetchHtml("/wiki/search?q=" + encodeURIComponent("<b>креветка"));
  assert.equal(res.status,200);
  assert.match(html,/<meta name="robots" content="noindex, follow">/);
  assert.doesNotMatch(mainBody(html),/<b>креветка/);
});

test("SEO discovery endpoints include actual card count and canonical links", async () => {
  const robots = await request("/robots.txt");
  assert.match(robots.headers.get("Content-Type") || "",/text\/plain/);
  assert.match(await robots.text(),/Sitemap: https:\/\/melvor.example\/sitemap.xml/);
  const sitemap = await request("/sitemap.xml");
  assert.match(sitemap.headers.get("Content-Type") || "",/xml/);
  const body = await sitemap.text();
  assert.match(body,/<loc>https:\/\/melvor.example\/wiki\/items\/Shrimp<\/loc>/);
  assert.match(body,/<loc>https:\/\/melvor.example\/wiki\/article\/Currency%2FMelvorBase%3AGoldPieces<\/loc>/);
  assert.equal([...body.matchAll(/<loc>/g)].length >= 9596,true);
  assert.doesNotMatch(body,/\/wiki\/search|#/);
});

test("existing API and asset boundaries remain intact", async () => {
  assert.equal((await request("/api/suggestions")).status,405);
  assert.equal((await request("/api/suggestions",{ method:"POST" })).status,401);
  const archive = await request("/article-index.json.gz");
  assert.equal(archive.status,200);
  assert.match(archive.headers.get("Content-Type") || "",/application\/gzip/);
  const etag = archive.headers.get("ETag");
  assert.ok(etag);
  assert.equal((await request("/article-index.json.gz",{headers:{"If-None-Match":etag}})).status,304);
});
