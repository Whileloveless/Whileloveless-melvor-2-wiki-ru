"""Build the wiki thumbnail sheet from the community wiki's asset index."""
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

source, output = map(Path, sys.argv[1:3])
data = json.loads(json.loads((source / "data.js").read_text().split("= ", 1)[1].strip().rstrip(";")))
objects = data["game"]["Objects"]
images = data["images"]
size, columns = 32, 48
paths = {}


def index_for(asset):
    if not asset:
        return None
    path = images.get(asset.removeprefix("res://"))
    if path is None:
        return None
    if path not in paths:
        paths[path] = len(paths)
    return paths[path]


def index_rows(rows, key):
    result = {}
    for row in rows:
        position = index_for(row.get("Icon") or row.get("Media"))
        if position is not None:
            result[key(row)] = position
    return result


fallback = index_for("Assets/Icons/missing_artwork.png")
icons = {"fallback": fallback, "columns": columns}
icons["items"] = index_rows(objects["Item"], lambda row: row["Id"])
icons["skills"] = index_rows(objects["LegacySkillNavigationOption"], lambda row: row["Entity"].split(":")[-1])
icons["actions"] = index_rows(
    (row for kind, rows in objects.items() if kind.endswith("Recipe") for row in rows),
    lambda row: row["Id"],
)
icons["rows"] = (len(paths) + columns - 1) // columns
sheet = Image.new("RGBA", (columns * size, icons["rows"] * size))
for relative, index in paths.items():
    with Image.open(source / relative) as original:
        image = original.convert("RGBA")
        image.thumbnail((size - 2, size - 2), Image.Resampling.LANCZOS)
        x = index % columns * size + (size - image.width) // 2
        y = index // columns * size + (size - image.height) // 2
        sheet.paste(image, (x, y))

output.mkdir(parents=True, exist_ok=True)
sheet.save(output / "icons.webp", quality=82, method=6)
(output / "icons.js").write_text("globalThis.MELVOR_ICONS = " + json.dumps(icons, separators=(",", ":")) + ";\n")
shutil.copyfile(source / images[data["visuals"]["logo"]], output / "game-logo.webp")
