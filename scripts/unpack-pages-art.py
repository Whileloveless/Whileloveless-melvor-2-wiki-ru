"""Copy the verified game illustrations into the static site tree."""
import re
import sys
from pathlib import Path
from zipfile import ZipFile

output = Path(sys.argv[2])
with ZipFile(sys.argv[1]) as archive:
    for name in archive.namelist():
        if not re.fullmatch(r"assets/[\w.-]+\.(?:webp|png|svg|jpg|jpeg|gif|avif)",name,re.I):
            raise ValueError("Unexpected artwork path: " + name)
        path = output / name
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(archive.read(name))
    print(f"Иллюстраций: {len(archive.namelist())}")
