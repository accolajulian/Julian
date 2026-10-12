"""Checks every JSON file, then zips both packs into dist/AI_Players.mcaddon.
Run: python3 tools/build.py"""
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKS = ["behavior_pack", "resource_pack"]
OUT = ROOT / "dist/AI_Players.mcaddon"

for pack in PACKS:
    for f in (ROOT / pack).rglob("*.json"):
        json.loads(f.read_text())  # raises with a line number if broken

OUT.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    for pack in PACKS:
        for f in sorted((ROOT / pack).rglob("*")):
            if f.is_file() and not f.name.startswith("."):
                # Folder names inside the .mcaddon: "AI Players BP" / "AI Players RP"
                name = "AI Players BP" if pack == "behavior_pack" else "AI Players RP"
                z.write(f, f"{name}/{f.relative_to(ROOT / pack).as_posix()}")

print("built", OUT, OUT.stat().st_size, "bytes")
