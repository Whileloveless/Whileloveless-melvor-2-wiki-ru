"""Normalize a source wiki card export and build the Russian catalog and article packs."""
import argparse
import gzip
import json
import re
from collections import Counter
from html import escape
from pathlib import Path
from urllib.parse import parse_qs, quote, urlsplit

from lxml import etree, html

SOURCE = "https://melvor2wiki.github.io/"
BASE_SECTIONS = {"Item": "items", "Skill": "skills", "Enemy": "monsters",
                 "Quest": "quests", "Dungeon": "dungeons"}
ASSET = re.compile(r"(?:\./)?assets/[\w.-]+\.(?:webp|png|svg|jpg|jpeg|gif|avif)$", re.I)
WORD = re.compile(r"[A-Za-z]{2}")
IDENTIFIER = re.compile(r"(?:\w+:)?[\w\-.:/]+")
SPACE = re.compile(r"\s+")
BLOCKED = {"script", "style", "iframe", "object", "embed", "video", "audio", "link", "meta", "base"}
ALLOWED_ATTRS = {"id", "class", "title", "alt", "lang", "name", "value", "type",
                 "scope", "colspan", "rowspan", "min", "max", "step", "open", "src",
                 "href", "role", "checked", "selected", "inputmode", "loading", "placeholder",
                 "for", "aria-label", "aria-live", "aria-expanded", "aria-hidden", "data-jump",
                 "data-toggle-toc", "data-sort-column", "data-sort", "data-type", "data-table-toggle",
                 "data-level-filter", "data-level-min", "data-level-max"}
KNOWN_UNITS = {"s": "с", "m": "мин", "h": "ч", "XP": "Опыт", "GP": "зол.",
               "XP/s": "Опыт/с", "XP/h": "Опыт/ч", "GP/s": "зол./с", "GP/h": "зол./ч"}
NUMBERED_NAMES = {"Allotment": "Грядка", "Herb Plot": "Грядка для трав", "Tree Plot": "Участок для дерева",
                  "Land": "Участок", "Loadout": "Набор экипировки", "Level": "Уровень", "Track": "Композиция",
                  "Custom": "Значок", "Global Modifier Description": "Глобальный модификатор",
                  "Modifier Description": "Модификатор"}


def route(key):
    type_, _, id_ = key.partition("/")
    if type_ in BASE_SECTIONS and id_.startswith("MelvorBase:"):
        return "#/" + BASE_SECTIONS[type_] + "/" + quote(id_.split(":", 1)[1], safe="")
    return "#/article/" + quote(key, safe="")


def rewrite_link(href, keys):
    if href.startswith(("#/scheda?", "#/record?")):
        params = parse_qs(urlsplit(href[1:]).query)
        key = params.get("id", [""])[0]
        if key in keys:
            section = params.get("section", [""])[0]
            return route(key) + ("?section=" + quote(section, safe="") if section else "")
    if "#/famiglie" in keys and href.startswith("#/famiglia?"):
        kind = parse_qs(urlsplit(href[1:]).query).get("id", [""])[0]
        if kind:
            return "#/catalog?type=" + quote(kind, safe="")
    if href in keys:
        return route(href)
    if href.startswith("#/"):
        params = parse_qs(urlsplit(href[1:]).query)
        section = params.get("section", [""])[0]
        category = href.split("?", 1)[0]
        if category in keys:
            return route(category) + ("?section=" + quote(section, safe="") if section else "")
    if href.startswith("#/"):
        return SOURCE + href
    if href.startswith("#"):
        return href
    url = urlsplit(href)
    return href if url.scheme in {"http", "https"} else ""


def normalized_text(value):
    return SPACE.sub(" ", value.strip())


def text_candidates(node):
    for el in node.iter():
        if not isinstance(el.tag, str):
            continue
        if el.text is not None and el.tag not in {"code", "kbd", "samp"}:
            yield el, "text", el.text
        if el.tail is not None:
            yield el, "tail", el.tail
        for attr in ("alt", "title", "aria-label", "placeholder"):
            if attr in el.attrib:
                yield el, attr, el.attrib[attr]


def clean_card(record, keys):
    content = html.fragment_fromstring(record["html"], create_parent="div")
    for el in list(content.iterdescendants()):
        if not isinstance(el.tag, str):
            if el.getparent() is not None:
                el.getparent().remove(el)
            continue
        if el.tag in BLOCKED:
            el.drop_tree()
            continue
        if el.tag == "header" and el.find(".//h1") is not None:
            el.set("class", "source-card-art")
        if el.tag == "footer" or el.get("id") in {"suggest", "suggest-edit"}:
            el.drop_tree()
            continue
        if el.tag == "h1":
            el.drop_tree()
            continue

        if el.tag == "a":
            href = el.get("href", "")
            if href.startswith("#/suggest"):
                el.drop_tree()
                continue
            url = rewrite_link(href, keys)
            if url:
                el.set("href", url)
                if url.startswith(("https:", "http:")):
                    el.set("rel", "noopener")
                    el.set("target", "_blank")
            elif "href" in el.attrib:
                del el.attrib["href"]

        if el.tag == "img":
            src = el.get("src", "")
            if ASSET.fullmatch(src):
                el.set("src", SOURCE + src.removeprefix("./"))
                el.set("loading", "lazy")
                el.set("referrerpolicy", "no-referrer")
            else:
                el.drop_tree()
                continue

        for attr in list(el.attrib):
            if attr not in ALLOWED_ATTRS and attr not in {"rel", "target", "referrerpolicy"}:
                del el.attrib[attr]
    return content


def translate(value, translations):
    text = normalized_text(value)
    if text in KNOWN_UNITS:
        replacement = KNOWN_UNITS[text]
    elif text in translations:
        replacement = translations[text]
    elif text.endswith(" index") and text[:-6] in translations:
        replacement = "Раздел «" + translations[text[:-6]] + "»"
    elif re.fullmatch(r"Level \d+", text):
        replacement = text.replace("Level ", "Уровень ", 1)
    elif (match := re.fullmatch(r"([A-Za-z ]*?[A-Za-z])\s*(\d+)", text)) and match[1] in NUMBERED_NAMES:
        replacement = f"{NUMBERED_NAMES[match[1]]} {match[2]}"
    elif match := re.fullmatch(r"(.+?) ([IVX]+)", text):
        translated = translations.get(match[1])
        replacement = f"{translated} {match[2]}" if translated else text
    elif re.fullmatch(r"[\d.,]+ s", text):
        replacement = text[:-1] + "с"
    elif re.fullmatch(r"[\d.,]+ XP", text):
        replacement = text[:-2] + "опыта"
    else:
        return value
    prefix = value[:len(value) - len(value.lstrip())]
    suffix = value[len(value.rstrip()):]
    return prefix + replacement + suffix


def serialize(node):
    return escape(node.text or "") + "".join(
        etree.tostring(child, method="html", encoding="unicode") for child in node)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--corpus", type=Path)
    parser.add_argument("--translations", type=Path)
    parser.add_argument("--glossary", action="append", type=Path, default=[])
    parser.add_argument("--output", type=Path)
    parser.add_argument("--extend", action="store_true")
    args = parser.parse_args()
    with args.source.open(encoding="utf-8") as source:
        cards = {r["key"]: r for line in source if (r := json.loads(line)).get("html")}
    translations = {}
    if args.translations:
        values = (json.loads(gzip.decompress(args.translations.read_bytes()))
                  if args.translations.suffix == ".gz" else json.loads(args.translations.read_text(encoding="utf-8")))
        if isinstance(values, list):
            if not args.corpus:
                parser.error("--corpus is required for a translation array")
            strings = json.loads(args.corpus.read_text(encoding="utf-8"))
            translations.update(zip(strings, values, strict=True))
        else:
            translations.update(values)
    for glossary in args.glossary:
        translations.update(json.loads(glossary.read_text(encoding="utf-8")))
    if args.corpus and not args.translations:
        corpus = Counter()
        for record in cards.values():
            content = clean_card(record, cards)
            for _, _, val in text_candidates(content):
                text = normalized_text(val)
                if WORD.search(text) and not re.fullmatch(r"(?:MelvorBase|Placeholder):[\w./-]+", text):
                    corpus[text] += 1
            corpus[record["title"]] += 1
            for source in (record.get("calculator") or {}).get("sources") or []:
                for key in ("title", "name"):
                    if source.get(key):
                        corpus[source[key]] += 1
        strings = [s for s, _ in corpus.most_common() if s not in KNOWN_UNITS
                   and (translate(s, translations) == s and s not in translations)]
        args.corpus.write_text(json.dumps(strings, ensure_ascii=False), encoding="utf-8")
        print(f"Strings to translate: {len(strings)}; instances: {sum(corpus[s] for s in strings)}")
    if not args.output:
        return

    args.output.mkdir(parents=True, exist_ok=True)
    def read_archive(name):
        return json.loads(gzip.decompress((args.output / (name + ".json.gz")).read_bytes()))

    def save_archive(name, records):
        path = args.output / (name + ".json.gz")
        path.write_bytes(gzip.compress(json.dumps(records, ensure_ascii=False,
                                                 separators=(",", ":")).encode(), compresslevel=9, mtime=0))

    index = read_archive("article-index") if args.extend else {}
    first_pack = 1 + max((row[3] for row in index.values()), default=-1)
    all_keys = index.keys() | cards.keys()
    pack, number = {}, first_pack

    def localized_title(record):
        title = record["title"]
        if record["type"] == "FarmingPlot" and title.startswith("Allotment "):
            return title.replace("Allotment ", "Грядка ", 1)
        translated = translate(title, translations)
        id_ = record["key"].partition(":")[2]
        if record["type"] == "AgilityCoursePath":
            course_id = re.sub(r"(Simple|Advanced)Path$", "", id_)
            course = index.get("AgilityCourse/MelvorBase:" + course_id)
            if course:
                return course[0] + " · " + translated.lower()
        if record["type"] == "AstrologyObservationEvent" and title == "Observation":
            name = re.sub(r"Observation(\d+)$", r" \1", id_)
            return translated + " · " + (name.replace("Nothing ", "без результата ") if name != id_ else id_)
        return translated

    for record in cards.values():
        key = record["key"]
        if key in index:
            continue
        if len(pack) >= 100:
            save_archive(f"article-{number:03}", pack)
            number += 1
            pack.clear()
        title = localized_title(record)
        if record["type"] == "Training" and key.startswith("#/guide?"):
            skill = parse_qs(urlsplit(key[1:]).query).get("id", [""])[0]
            skill_card = cards.get("Skill/MelvorBase:" + skill)
            if skill_card:
                title = translate(skill_card["title"], translations) + " · прокачка"
        content = clean_card(record, all_keys)
        for el, field, value in text_candidates(content):
            translated = title if value == record["title"] else translate(value, translations)
            if field in {"text", "tail"}:
                setattr(el, field, translated)
            else:
                el.set(field, translated)
        calculator = record.get("calculator")
        if calculator:
            for source in calculator.get("sources", []):
                for field in ("title", "name"):
                    if field in source and source[field]:
                        source[field] = translate(source[field], translations)

        image = record.get("image")
        index[key] = [title, record["title"], record["type"], number,
                      image if image and ASSET.fullmatch(image) else None]
        if record.get("typeLabel") in translations:
            index[key].append(translations[record["typeLabel"]])
        pack[key] = [serialize(content), calculator]
    if pack:
        save_archive(f"article-{number:03}", pack)
    if args.extend and "Pet/MelvorBase:Arya" in index:
        key = "Pet/MelvorBase:Arya"
        name = f"article-{index[key][3]:03}"
        pets = read_archive(name)
        content = html.fragment_fromstring(pets[key][0], create_parent="div")
        unlock = content.find(".//section[@id='pet-unlock']/p")
        effect = content.find(".//section[@id='pet-effect']/p/span")
        if unlock is not None and len(unlock) and effect is not None:
            unlock.text = "Получайте опыт навыка «"
            unlock[0].tail = "». "
            effect.text = "+1% к валюте за задания Истребления"
            pets[key][0] = serialize(content)
            save_archive(name, pets)
    save_archive("article-index", index)
    print(f"Cards: {len(index)}; packs: {number + 1}; bytes: {sum(f.stat().st_size for f in args.output.glob('article-*.gz'))}")


if __name__ == "__main__":
    main()
