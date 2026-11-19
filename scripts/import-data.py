"""Extract factual catalog fields from the verified community wiki release."""
import json
import sys
from pathlib import Path

raw = Path(sys.argv[1]).read_text()
data = json.loads(json.loads(raw.split("= ", 1)[1].strip().rstrip(";")))
objects = data["game"]["Objects"]
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

items = {}
for row in objects["Item"]:
    caps = row.get("Capabilities") or {}
    items[row["Id"]] = {
        "name": name(row), "price": (row.get("SellsFor") or {}).get("Quantity"),
        "types": [bare(t) for t in caps],
        "requirements": requirements(caps.get("MelvorBase:Equipment") or {}),
    }

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
        if req or produced:
            recipes.append({"id": row["Id"], "name": name(row), "kind": kind, "requirements": req,
                            "xp": row.get("BaseExperience"), "ms": row.get("BaseInterval"),
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
