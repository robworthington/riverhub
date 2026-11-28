"""
Shared helpers for the Welsh importers (WALES-ROLLOUT-PLAN.md §5). Standard library only.

  wfs(layer, ...)        DataMapWales WFS (NRW and Welsh Government layers, OGL v3), paged, lon/lat
  arcgis(url, ...)       an ArcGIS FeatureServer layer, paged (Dŵr Cymru's feeds and annual returns)
  simplify_geometry(g)   Douglas-Peucker on a GeoJSON (Multi)Polygon, outer rings kept
  match_points(a, b)     pair each point in `a` with the best point in `b` within a radius, preferring
                         a shared word in the names (Dŵr Cymru's live feed carries no permit number)
"""
import json
import math
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

WFS = "https://datamap.gov.wales/geoserver/ows"
DCWW = "https://services3.arcgis.com/KLNF7YxtENPLYVey/arcgis/rest/services"
DCWW_LIVE = f"{DCWW}/Spill_Prod__External/FeatureServer/0"
DCWW_NAME = "Dŵr Cymru Welsh Water"
NRW_ATTRIBUTION = "Contains Natural Resources Wales information © Natural Resources Wales and Database Right"
UA = {"User-Agent": "river-hub-importer"}


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def _get(url, tries=5):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
                return json.load(r)
        except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
            if i == tries - 1:
                raise
            time.sleep(5 * (i + 1))


def wfs(layer, props=None, bbox=None, cql=None, page=2000):
    """Every feature of a DataMapWales layer. bbox = (west, south, east, north) in lon/lat."""
    out, start = [], 0
    while True:
        p = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": layer,
             "outputFormat": "application/json", "srsName": "EPSG:4326", "count": page, "startIndex": start}
        if props:
            p["propertyName"] = ",".join(props)
        if bbox:
            p["bbox"] = ",".join(str(x) for x in bbox) + ",EPSG:4326"
        if cql:
            p["CQL_FILTER"] = cql
        d = _get(WFS + "?" + urllib.parse.urlencode(p))
        feats = d.get("features", [])
        out += feats
        if len(feats) < page:
            return out
        start += len(feats)


def arcgis(url, where="1=1", fields="*", geometry=True, bbox=None, page=1000):
    """bbox = (west, south, east, north) in lon/lat."""
    out, off = [], 0
    while True:
        p = {"where": where, "outFields": fields, "returnGeometry": "true" if geometry else "false",
             "outSR": 4326, "resultOffset": off, "resultRecordCount": page, "f": "json"}
        if bbox:
            p.update({"geometry": ",".join(str(x) for x in bbox), "geometryType": "esriGeometryEnvelope",
                      "inSR": 4326, "spatialRel": "esriSpatialRelIntersects"})
        d = _get(url + "/query?" + urllib.parse.urlencode(p))
        if "error" in d:
            sys.exit(f"{url}: {d['error']}")
        feats = d.get("features", [])
        out += feats
        if len(feats) < page and not d.get("exceededTransferLimit"):
            return out
        off += len(feats)


# --- geometry -----------------------------------------------------------------------------------------

def _perp(p, a, b):
    (x, y), (x1, y1), (x2, y2) = p, a, b
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x - x1, y - y1)
    t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (x1 + t * dx), y - (y1 + t * dy))


def simplify(points, tol):
    """Douglas-Peucker, iterative."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        s, e = stack.pop()
        best, idx = 0.0, None
        for i in range(s + 1, e):
            d = _perp(points[i], points[s], points[e])
            if d > best:
                best, idx = d, i
        if idx is not None and best > tol:
            keep[idx] = True
            stack += [(s, idx), (idx, e)]
    return [p for p, k in zip(points, keep) if k]


def simplify_geometry(g, tol=0.0002, digits=5):
    """GeoJSON Polygon/MultiPolygon -> simplified MultiPolygon (outer rings only)."""
    polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
    out = []
    for poly in polys:
        ring = simplify([(round(c[0], digits), round(c[1], digits)) for c in poly[0]], tol)
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])
        if len(ring) >= 4:
            out.append([ring])
    return {"type": "MultiPolygon", "coordinates": out}


def geojson_sql(g):
    return f"ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON({q(json.dumps(g, separators=(',', ':')))}), 4326))"


def bounds(geoms):
    xs, ys = [], []
    for g in geoms:
        polys = g["coordinates"] if g["type"] == "MultiPolygon" else [g["coordinates"]]
        for poly in polys:
            for x, y, *_ in poly[0]:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)   # west, south, east, north


# --- matching -----------------------------------------------------------------------------------------

STOP = {"storm", "overflow", "cso", "sso", "so", "sps", "wwtw", "stw", "pumping", "station", "ps", "combined",
        "sewer", "sewage", "treatment", "works", "the", "of", "and", "rd", "road", "st", "on", "network", "at"}


def metres(a, b):
    (x1, y1), (x2, y2) = a, b
    return math.hypot((x1 - x2) * 111320 * math.cos(math.radians((y1 + y2) / 2)), (y1 - y2) * 110540)


def words(s):
    return {w for w in re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).split() if w not in STOP and len(w) > 1}


def best_match(point, name, candidates, radius=100):
    """candidates: [(point, name, payload)]. Returns (payload, distance_m, shared_words) or None."""
    lw = words(name)
    near = [(metres(point, p), n, pl) for p, n, pl in candidates]
    near = [t for t in near if t[0] <= radius]
    if not near:
        return None
    d, n, pl = min(near, key=lambda t: (-len(lw & words(t[1])), t[0]))
    return pl, d, len(lw & words(n))


def dcww_live(bbox):
    """Dŵr Cymru's live outlets in a bbox: [(dcww_id, name, (lon, lat), receiving_water)]."""
    feats = arcgis(DCWW_LIVE, fields="DCWW_ID,asset_name,Receiving_Water", bbox=bbox)
    return [(f["attributes"]["DCWW_ID"], f["attributes"]["asset_name"], (f["geometry"]["x"], f["geometry"]["y"]),
             f["attributes"]["Receiving_Water"]) for f in feats if f.get("geometry") and f["attributes"].get("DCWW_ID")]


# Dŵr Cymru's annual EDM returns, one layer per year; field names differ a little between years, so
# fields are found by prefix.
DCWW_ANNUAL = {2022: "EDM2022", 2023: "EDM_2023", 2024: "EDM_2024", 2025: "EDM_2025"}
# field-name prefixes per column; EDM_2023 uses its own names (and has no % data or discharge type)
ANNUAL_FIELDS = {"site": "Permitted_site_name", "permit": ("NRW_permit_reference", "Permit_reference", "Permit_Number"),
                 "activity": "Activity_Reference", "duration": ("Duration_of_all_spills", "Total_Duration_hours"),
                 "counted": ("No__of_block_counted_spills", "Counted_Spills_using_12_24"), "pct": "Percentage_complete_data",
                 "type": "Storm_discharge", "lat": "Latitude", "lon": "Longitude"}


def _field(attrs, prefixes):
    for k in attrs:
        if any(k.startswith(p) for p in ((prefixes,) if isinstance(prefixes, str) else prefixes)):
            return attrs[k]
    return None


def dcww_annual(year, bbox):
    """One year of Dŵr Cymru's annual returns inside a bbox: list of dicts with the ANNUAL_FIELDS keys."""
    layer = DCWW_ANNUAL.get(year)
    if not layer:
        return []
    # the layer id isn't always 0 (EDM_2023 is layer 3), so look it up
    info = _get(f"{DCWW}/{layer}/FeatureServer?f=json")
    lid = (info.get("layers") or [{"id": 0}])[0]["id"]
    rows = []
    for f in arcgis(f"{DCWW}/{layer}/FeatureServer/{lid}", bbox=bbox):
        a = f["attributes"]
        r = {k: _field(a, p) for k, p in ANNUAL_FIELDS.items()}
        g = f.get("geometry") or {}
        r["lon"], r["lat"] = r["lon"] or g.get("x"), r["lat"] or g.get("y")
        if r["lon"] is not None and r["lat"] is not None:
            rows.append(r)
    return rows


def asset_type(text, name=""):
    """Dŵr Cymru's storm discharge asset type (or the outlet name) -> River Hub asset_type."""
    t = f"{text or ''} {name or ''}".lower()
    if "tank" in t:
        return "storm_tank"
    if "wwtw" in t or "treatment" in t or " stw" in t:
        return "sewage_treatment_works"
    if "pumping" in t or "sps" in t or "pump" in t:
        return "pumping_station"
    return "combined_sewer_overflow"
