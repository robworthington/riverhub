#!/usr/bin/env python3
"""
Snapshot the EA-owned WINEP Driver Codes lookup to a committed JSON, so the WINEP importer decodes
driver codes (e.g. EnvAct_IMP3 -> label + obligation) offline, with no live service call at import.

Source: the EA's DriverCodes ArcGIS service (EA-owned — see ../WINEP-DATA-RESEARCH.md). This is the
ONLY WINEP input that isn't the downloaded National Dataset .xlsx; snapshotting it keeps imports
fully file-driven and reproducible. Re-run when the EA revises the driver-code set.

    python3 gen_winep_driver_codes.py            # writes winep_driver_codes.json next to this file

import_winep.py reads the JSON; if a code is missing it falls back to the National Dataset's own
Obligation column.
"""
import json, os, ssl, sys, urllib.parse, urllib.request

DRIVER_FS = os.environ.get(
    "WINEP_DRIVER_FS_URL",
    "https://services1.arcgis.com/JZM7qJpmv7vJ0Hzx/arcgis/rest/services/DriverCodes/FeatureServer/0",
)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "winep_driver_codes.json")

_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE


def fetch():
    """Full EA DriverCodes table -> {code: {"obligation": .., "label": ..}} (~93 rows)."""
    url = f"{DRIVER_FS}/query?" + urllib.parse.urlencode({
        "where": "1=1", "outFields": "Obligation,Full_Driver_Code,Description_",
        "returnGeometry": "false", "resultRecordCount": 1000, "f": "json",
    })
    with urllib.request.urlopen(url, timeout=120, context=_SSL) as r:
        page = json.load(r)
    out = {}
    for f in page.get("features", []):
        a = f["attributes"]
        code = (a.get("Full_Driver_Code") or "").strip()
        if not code:
            continue
        out[code] = {
            "obligation": " ".join((a.get("Obligation") or "").split()) or None,
            "label": " ".join((a.get("Description_") or "").split()) or None,
        }
    return out


def main():
    codes = fetch()
    if not codes:
        sys.exit("no driver codes returned — check the EA DriverCodes service URL")
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(codes, fh, indent=1, sort_keys=True, ensure_ascii=False)
        fh.write("\n")
    print(f"wrote {len(codes)} driver codes -> {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
