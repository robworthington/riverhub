"""
Catchment config loader (federation workstream F3).

Every importer reads its catchment-specific values (org, river, water company, WFD ids, bbox)
from a JSON config — see config/catchments/dart.json for the reference. National service URLs
(EA/ONS/OSM endpoints) stay in the scripts: they are central connectors, identical for every
catchment.

Resolution: --config <path> argv  >  CATCHMENT_CONFIG env  >  config/catchments/dart.json.
bbox convention: [south, west, north, east] (matches the Overpass order used by import_rivers).
"""
import json
import os
import sys

DEFAULT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "config", "catchments", "dart.json")


def load():
    path = os.environ.get("CATCHMENT_CONFIG") or DEFAULT
    argv = sys.argv
    for i, a in enumerate(argv):
        if a == "--config" and i + 1 < len(argv):
            path = argv[i + 1]
    with open(path) as f:
        cfg = json.load(f)
    for key in ("org_id", "river", "company", "geo"):
        if key not in cfg:
            sys.exit(f"catchment config {path} missing required key: {key}")
    return cfg


def bbox_envelope(cfg):
    """(xmin, ymin, xmax, ymax) = (west, south, east, north) for ArcGIS envelope queries."""
    s, w, n, e = cfg["geo"]["bbox"]
    return (w, s, e, n)
