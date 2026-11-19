"""Extract factual catalog fields from the verified community wiki release."""
import json
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text()
data = json.loads(json.loads(raw.split("= ", 1)[1].strip().rstrip(";")))
objects = data["game"]["Objects"]
descriptions = json.loads(Path(__file__).with_name("item-descriptions-ru.json").read_text())
def bare(value):
    return (value or "").split(":")[-1]

def name(row):
    value = row.get("DisplayName") or row["Id"]
    return value.get("Singular", row["Id"]) if isinstance(value, dict) else value

def requirements(row):
    return [[bare(r["Data"]["Component"]["Entity"]), r["Data"]["Level"]]
            for r in (row.get("Requirements") or [])
            if bare(r["Type"]) == "Level" and r["Data"].get("Component")]

def goods(rows):
    return [[bare(r["Item"]), r.get("Quantity", r.get("MinQuantity", 1)),
             r.get("MaxQuantity"), r.get("Chance")] for r in rows if r.get("Item")]

def weighted(rows, activation=1):
    total = sum(r.get("Weight") or 0 for r in rows)
    for row in rows:
        chance = row.get("Chance")
        if row.get("Weight") is not None and total:
            chance = row["Weight"] / total
        yield {**row, "Chance": chance * activation if chance is not None else None}

def fixed(rows):
    return [{**row, "Chance": 1} for row in rows]

def rewards(payload):
    yield from fixed(payload.get("FixedItems") or [])
    for table in payload.get("ItemTables") or []:
        yield from weighted(table.get("Table") or [], table.get("Chance", 1))

def combat_stats(capability):
    stats = capability.get("Stats") or {}
    yield from ([bare(row["Stat"]), row["Value"]] for row in stats.get("Stats") or [])
    for field in ("PowerRatings", "ProtectionRatings"):
        yield from ([field, row["Value"], bare(row["DamageType"])]
                    for row in stats.get(field) or [])

def add_relation(field, kind, row, entries, basis=None):
    for item_id, count, maximum, chance in goods(entries):
        if item_id in items:
            items[item_id].setdefault(field, []).append(
                [kind, row["Id"], name(row), count, maximum, chance, basis])

items = {}
for row in objects["Item"]:
    caps = row.get("Capabilities") or {}
    equipment = caps.get("MelvorBase:Equipment") or {}
    toolbelt = caps.get("MelvorBase:Toolbelt") or {}
    items[row["Id"]] = {
        "name": name(row), "price": (row.get("SellsFor") or {}).get("Quantity"),
        "types": [bare(t) for t in caps],
        "requirements": requirements(equipment) + requirements(toolbelt),
    }
    item = items[row["Id"]]
    if description := row.get("Description"):
        item["description"] = descriptions.get(description, description)
        if description not in descriptions:
            item["descriptionLanguage"] = "en"
    if (healing := (caps.get("MelvorBase:Food") or {}).get("BaseHealing")) is not None:
        item["healing"] = healing
    stats = [stat for capability in caps.values() for stat in combat_stats(capability)]
    if stats:
        item["stats"] = stats
    if gain := (caps.get("MelvorBase:Bury") or {}).get("CurrencyGain"):
        item["bury"] = [bare(gain["Currency"]), gain["Quantity"]]
    if container := caps.get("MelvorBase:Openable"):
        item["contents"] = goods(fixed(container.get("AlwaysDrops") or [])) + goods(
            weighted(container.get("DropTable") or []))

for row in objects["Item"]:
    if container := row["Capabilities"].get("MelvorBase:Openable"):
        add_relation("sources", "Item", row, fixed(container.get("AlwaysDrops") or []), "open")
        add_relation("sources", "Item", row, weighted(container.get("DropTable") or []), "open")
for row in objects["Enemy"]:
    add_relation("sources", "Enemy", row, rewards(row.get("Drops") or {}), "kill")
for row in objects["Dungeon"]:
    add_relation("sources", "Dungeon", row, rewards(row.get("Rewards") or {}), "clear")
for row in objects["ThievingRecipe"]:
    for table, chance, basis in (
        ("CommonDropTable", "BaseCommonLootChance", "stage"),
        ("RareDropTable", "BaseRareLootChance", "stage"),
        ("CompletionDropTable", None, "target"),
    ):
        activation = (row.get(chance) or 0) if chance else 1
        add_relation("sources", "ThievingRecipe", row, weighted(row.get(table) or [], activation), basis)
for row in objects["ShopPurchase"]:
    add_relation("sources", "ShopPurchase", row, (row.get("Provides") or {}).get("Items") or [])
    add_relation("uses", "ShopPurchase", row, (row.get("Costs") or {}).get("Items") or [])
for row in objects["Quest"]:
    add_relation("sources", "Quest", row, (row.get("Rewards") or {}).get("Items") or [])
    for step in row.get("Steps") or []:
        for task in step.get("TasksInOrder") or []:
            add_relation("uses", "Quest", row, (task.get("Costs") or {}).get("Items") or [])

recipes = []
for kind, rows in objects.items():
    if not kind.endswith("Recipe"):
        continue
    for row in rows:
        if not isinstance(row.get("Id"), str):
            continue
        produced = list(row.get("Products") or [])
        for field in ("Product", "RandomProducts", "RandomProductsPerHit", "RandomProductsPerCut", "SpecialProducts"):
            value = row.get(field)
            if isinstance(value, list):
                produced.extend(value)
            elif isinstance(value, dict):
                produced.append(value)
        ingredients = row.get("Ingredients") or {}
        req = requirements(row)
        interval = row.get("BaseInterval")
        creation_seconds = None
        if kind in {"ArtisanRecipe", "CookingRecipe", "HerbloreRecipe", "GrainMillRecipe", "FarmingRecipe"}:
            interval = interval if interval is not None else row.get("BaseGrowthTime")
            if interval is not None:
                creation_seconds = interval * (row.get("Steps") or 1) / 1000
        if req or produced:
            recipes.append({"id": row["Id"], "name": name(row), "kind": kind, "requirements": req,
                            "xp": row.get("BaseExperience"), "ms": row.get("BaseInterval"),
                            "creationSeconds": creation_seconds,
                            "inputs": goods(ingredients.get("Items") or []) if isinstance(ingredients, dict) else [],
                            "outputs": goods(produced)})

monsters = {}
for mid, row in data["monsters"]["enemies"].items():
    monsters[mid] = {k: row.get(k) for k in ("name", "combatLevel", "hitpoints", "attackSeconds", "armour", "ward")}
    monsters[mid]["maxHits"] = [[x["style"], x["maxHit"]] for x in row.get("maxHits", [])]
    monsters[mid]["drops"] = [[bare(x["id"]), x["min"], x["max"]] for x in row.get("guaranteedDrops", [])]
    monsters[mid]["locations"] = [[bare(x["id"]), x["name"], x["type"]] for x in row.get("locations", [])]

quests = {}
for row in objects["Quest"]:
    steps = row.get("Steps") or []
    quests[row["Id"]] = {
        "name": name(row), "category": bare(row.get("Category")),
        "steps": len(steps),
        "costs": [entry for step in steps for task in (step.get("TasksInOrder") or [])
                  for entry in goods((task.get("Costs") or {}).get("Items") or [])],
    }

dungeons = {}
for row in objects["Dungeon"]:
    dungeons[row["Id"]] = {"name": name(row), "difficulty": bare(row.get("Difficulty")),
                          "waves": [[wave.get("Count"), [bare(x["Enemy"]) for x in wave.get("Enemies", [])]]
                                    for wave in row.get("Enemies", [])],
                          "unlocks": [[bare(r["Data"]["Enemy"]), r["Data"]["Value"]]
                                      for r in (row.get("UnlockRequirements") or [])
                                      if bare(r["Type"]) == "EnemyStatistic" and
                                      bare(r["Data"].get("Statistic")) == "CombatEnemyKilled"]}

skills = {bare(row["Entity"]): {"name": name(row), "requirements": requirements(row)}
          for row in objects["LegacySkillNavigationOption"]}
for sid, row in data["guides"]["skills"].items():
    if sid in skills:
        skills[sid]["progress"] = [[x["atLevel"], bare(x["id"]), x["name"], x.get("xpPerSecond")]
                                   for x in row.get("progression", [])]

catalog = {"build": data["build"], "skills": skills, "items": items, "monsters": monsters,
           "quests": quests, "dungeons": dungeons, "recipes": recipes}
Path(sys.argv[2]).write_text("globalThis.MELVOR_DATA = " + json.dumps(catalog, ensure_ascii=False, separators=(",", ":")) + ";\n")
