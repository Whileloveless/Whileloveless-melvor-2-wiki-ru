import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";
import {parseArgs} from "node:util";
import {gunzipSync} from "node:zlib";

const root = fileURLToPath(new URL("..",import.meta.url));
const inputs = resolve(root,"dist");
const {values: options} = parseArgs({options:{
  url:{type:"string"},
  repository:{type:"string"},
  output:{type:"string",default:"_site"}
}});

if (!options.url || !options.repository) {
  throw new Error("Укажите --url https://username.github.io/repository/ и --repository username/repository");
}
const url = new URL(options.url);
const base = url.pathname.replace(/\/+$/,"");
if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
    !/^(?:\/[A-Za-z0-9._-]+)*$/.test(base) || !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(options.repository)) {
  throw new Error("Неверный HTTPS-адрес сайта или имя репозитория");
}

const output = resolve(options.output);
await mkdir(output,{recursive:true});
if ((await readdir(output)).length) throw new Error("Каталог вывода должен быть пустым: " + output);
const scratch = await mkdtemp(join(tmpdir(),"melvor-pages-worker-"));
const appScript = await readFile(join(inputs,"app.js"));
const appFilename = "app." + createHash("sha256").update(appScript).digest("hex").slice(0,12) + ".js";
const sourceArt = "https://melvor2wiki.github.io/";
const types = {items:"Item",skills:"Skill",monsters:"Enemy",quests:"Quest",dungeons:"Dungeon"};
const pageable = new Set(["catalog",...Object.keys(types)]);
const entities = {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
const escapeHtml = value => value.replace(/[&<>"']/g,char => entities[char]);
const literal = value => value.replaceAll("&amp;","&").replaceAll("&#39;","'");

function staticRoute(route) {
  const path = new URL(route,url.origin);
  let {pathname} = path;
  const generic = pathname.match(/^\/wiki\/article\/([^/]+)\/?$/);
  if (generic) {
    const slug = encodeURIComponent(decodeURIComponent(generic[1])).replaceAll("~","%7E").replaceAll("%","~");
    pathname = "/wiki/article/" + slug;
  }

  const collection = pathname.match(/^\/wiki\/([^/]+)\/?$/);
  const page = path.searchParams.get("page");
  if (collection && pageable.has(collection[1]) && /^[1-9]\d*$/.test(page || "")) {
    if (page !== "1") pathname = "/wiki/" + collection[1] + "/page/" + page;
    path.searchParams.delete("page");
  }
  if (pathname.startsWith("/wiki/") && !pathname.endsWith("/")) pathname += "/";
  return base + pathname + path.search + path.hash;
}

function rewriteUrl(value) {
  const decoded = literal(value);
  if (decoded === "/app.js") return base + "/" + appFilename;
  if (decoded.startsWith(sourceArt + "assets/")) return base + "/" + decoded.slice(sourceArt.length);
  if (decoded.startsWith("/") && !decoded.startsWith("//")) return staticRoute(decoded);
  if (decoded.startsWith(url.origin + "/")) return url.origin + staticRoute(decoded);
  return value;
}

function verificationTag(name, token) {
  if (!token?.trim()) return "";
  const code = token.trim();
  if (!/^[A-Za-z0-9_-]{1,250}$/.test(code)) throw new Error("Некорректный код проверки " + name);
  return '<meta name="' + name + '" content="' + code + '">\n';
}

const verification = verificationTag("google-site-verification",process.env.GOOGLE_SITE_VERIFICATION) +
  verificationTag("yandex-verification",process.env.YANDEX_VERIFICATION);

function rewriteHtml(original,{home=false,missing=false}={}) {
  let body = original.replace(/\b(href|src|action)=(["'])([^"']*)\2/g,(match,key,quote,value) => {
    const rewritten = rewriteUrl(value);
    return rewritten === value ? match : key + '="' + escapeHtml(rewritten) + '"';
  });
  const config = '<script src="' + escapeHtml(base + "/site-config.js") + '"></script>\n';
  body = body.replace("<head>","<head>\n" + (home ? verification : "") + config);
  body = body.replace(/<a id="suggestion-signin"[^>]*>[^<]*<\/a>\n?/,"");
  if (missing) body = body.replace('<main id="main">','<main id="main" data-static-not-found>');
  return body;
}

function fileFor(route) {
  const local = new URL(staticRoute(route),url.origin).pathname.slice(base.length);
  const file = local.split("/").filter(Boolean).join("/");
  return join(output,file,"index.html");
}

async function writePage(worker,route) {
  const response = await worker.fetch(new Request(url.origin + route),{});
  if (!response.ok) throw new Error("Не удалось собрать " + route + " (" + response.status + ")");
  const file = fileFor(route);
  await mkdir(dirname(file),{recursive:true});
  await writeFile(file,rewriteHtml(await response.text(),{home:route === "/"}));
}

try {
  execFileSync("python3",["scripts/build-worker.py",scratch],{cwd:root,stdio:"inherit"});
  const {default:worker} = await import(pathToFileURL(join(scratch,"dist/server/index.js")));
  const originalSitemap = await worker.fetch(new Request(url.origin + "/sitemap.xml"),{});
  if (!originalSitemap.ok) throw new Error("Не удалось прочитать карту статей");
  const routes = [...(await originalSitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map(match=>new URL(literal(match[1])).pathname);
  if (!routes.length) throw new Error("Карта статей пуста");

  const snapshot = JSON.parse(gunzipSync(await readFile(join(inputs,"article-index.json.gz"))));
  const typeCounts = new Map();
  for (const [, ,kind] of Object.values(snapshot)) typeCounts.set(kind,(typeCounts.get(kind) || 0) + 1);
  for (const section of pageable) {
    const count = section === "catalog" ? Object.keys(snapshot).length : typeCounts.get(types[section]);
    for (let page = 2; page <= Math.ceil(count / 30); page++) routes.push("/wiki/" + section + "?page=" + page);
  }
  const canonical = new Set(routes.map(route=>url.origin + staticRoute(route)));
  if (canonical.size !== routes.length) throw new Error("Найдены повторяющиеся адреса статей");

  for (const file of await readdir(inputs,{withFileTypes:true})) {
    if (!file.isFile() || file.name === "index.html") continue;
    const destination = join(output,file.name);
    if (file.name.endsWith(".css")) {
      const css = await readFile(join(inputs,file.name),"utf8");
      await writeFile(destination,css.replace(/url\((['"]?)\/(?!\/)/g,"url($1" + base + "/"));
    } else {
      await copyFile(join(inputs,file.name),destination);
    }
  }

  const config = {platform:"github-pages",basePath:base,repository:options.repository};
  await writeFile(join(output,appFilename),appScript);
  await writeFile(join(output,"site-config.js"),"globalThis.MELVOR_HOSTING = " + JSON.stringify(config) + ";\n");
  await writeFile(join(output,".nojekyll"),"");
  execFileSync("python3",["scripts/unpack-pages-art.py",join(root,"artwork/wiki-assets.zip"),output],{cwd:root,stdio:"inherit"});

  for (let index = 0; index < routes.length; index += 24) {
    await Promise.all(routes.slice(index,index + 24).map(route=>writePage(worker,route)));
  }
  await writePage(worker,"/wiki/search");

  const missing = await worker.fetch(new Request(url.origin + "/wiki/unknown-page"),{});
  if (missing.status !== 404) throw new Error("Пропущена страница 404");
  await writeFile(join(output,"404.html"),rewriteHtml(await missing.text(),{missing:true}));

  const addresses = [...canonical];
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    addresses.map(address=>'<url><loc>' + escapeHtml(address) + '</loc></url>').join("\n") + "\n</urlset>\n";
  await writeFile(join(output,"sitemap.xml"),xml);
  await writeFile(join(output,"sitemap.txt"),addresses.join("\n") + "\n");
  await writeFile(join(output,"robots.txt"),"User-agent: *\nAllow: /\nSitemap: " + url.origin + base + "/sitemap.xml\n");
  console.log("Страниц в карте сайта: " + canonical.size + " · " + output);
} finally {
  await rm(scratch,{recursive:true,force:true});
}
