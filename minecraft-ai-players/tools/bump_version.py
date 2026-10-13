"""Sets the add-on's version in both manifests (pack headers, modules and the behavior pack's
dependency on the resource pack). min_engine_version is never touched.
Run: python3 tools/bump_version.py 1.26.0"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RP_UUID = "40a27797-dca3-436f-a415-2cb01ae9d04f"

version = [int(n) for n in sys.argv[1].split(".")]
assert len(version) == 3, "use major.minor.patch, e.g. 1.26.0"
for pack in ("behavior_pack", "resource_pack"):
    path = ROOT / pack / "manifest.json"
    manifest = json.loads(path.read_text())
    manifest["header"]["version"] = version
    for module in manifest["modules"]:
        module["version"] = version
    for dep in manifest.get("dependencies", []):
        if dep.get("uuid") == RP_UUID:
            dep["version"] = version
    path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(pack, "->", version)
