"""Bundle the wiki assets, HTML renderer and feedback endpoint for Sites."""
import base64
import hashlib
import json
import shutil
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
output = Path(sys.argv[1])
assets = {}
for file in sorted((root / "dist").iterdir()):
    mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".webp": "image/webp",
        ".gz": "application/gzip",
    }.get(file.suffix)
    if mime is None or not file.is_file():
        continue
    binary = file.suffix in {".webp", ".gz"}
    raw = file.read_bytes()
    content = base64.b64encode(raw).decode("ascii") if binary else raw.decode("utf-8")
    etag = '"' + hashlib.sha256(raw).hexdigest()[:32] + '"'
    assets["/" + file.name] = [mime, content, binary, etag]

server = output / "dist/server"
server.mkdir(parents=True, exist_ok=True)
(server / "index.js").write_text(
    "const assets = " + json.dumps(assets, ensure_ascii=False, separators=(",", ":")) + ";\n"
    + assets["/editorial.js"][1] + "\n"
    + (root / "worker/seo.js").read_text() + "\n"
    + (root / "worker/index.js").read_text()
)
for path in (".openai/hosting.json", "drizzle/0000_wiki_suggestions.sql"):
    (output / path).parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / path, output / path)
