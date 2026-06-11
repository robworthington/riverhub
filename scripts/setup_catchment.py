#!/usr/bin/env python3
"""
setup-catchment — one command configures a River Hub instance's geographic scope (federation F3).

Runs the importer pipeline from the Federation plan §3.2 in dependency order. Each step runs the
generator script (which fetches from national open-data services and prints SQL), applies the SQL
to the target database, then runs a verification count. All steps are idempotent — re-running is
safe and is also how an existing catchment (e.g. the Dart) is validated.

Steps:
  parishes      ONS parish + LAD boundaries for the bbox             (import_parishes.py)
  assets        WFD catchment geometry -> water-company EDM outlets  (import_catchment.py)*
  population    ONS Census 2021 OA -> parish + system populations    (estimate_system_population.py)
  annual-stats  EA EDM Annual Return spill history                   (import_annual_stats.py)†
  gauges        EA rainfall stations near the catchment centre       (import_rain_gauges.py)
  rivers        OSM waterways clipped to the loaded parishes         (import_rivers.py)
  ea-backfill   historical rainfall/flow readings (optional, slow)   (backfill_ea_history.py)

  * needs the EDM Annual Return 2024 xlsx on disk (EDM_ANNUAL_XLSX env) for permit enrichment.
  † downloads multi-hundred-MB ZIPs unless cached in EDM_CACHE.
Manual follow-ups (not orchestrated): water-quality bootstrap (group spreadsheets), river/flow
gauge registration specifics, EIR capacity data. See Federation plan §3.3.

Usage:
    python3 setup_catchment.py --config config/catchments/dart.json --db "$DB_URL" [options]
Options:
    --only step1,step2     run only these steps
    --skip step1,step2     skip these steps (default skips: ea-backfill)
    --dry-run              print the plan, run nothing
"""
import os, shutil, subprocess, sys, tempfile, time

import catchment_config

HERE = os.path.dirname(os.path.abspath(__file__))

STEPS = [
    ("parishes", "import_parishes.py",
     "select count(*) from parishes where boundary is not null", "parishes with boundary"),
    ("assets", "import_catchment.py",
     "select count(*) from sewage_assets", "sewage assets"),
    ("population", "estimate_system_population.py",
     "select count(*) from parishes where census_2021_population is not null", "parishes with population"),
    ("annual-stats", "import_annual_stats.py",
     "select count(*) from edm_annual_stats", "annual stat rows"),
    ("gauges", "import_rain_gauges.py",
     "select count(*) from rainfall_stations", "rainfall stations"),
    ("rivers", "import_rivers.py",
     "select count(*) from river_segments", "river segments"),
    ("ea-backfill", "backfill_ea_history.py",
     "select count(*) from rainfall_readings", "rainfall readings"),
]
DEFAULT_SKIP = {"ea-backfill"}


def arg(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        if i + 1 < len(sys.argv):
            return sys.argv[i + 1]
    return default


def psql(db_url, sql_path=None, command=None):
    """Run psql via local binary if present, else dockerised postgres:16."""
    if shutil.which("psql"):
        cmd = ["psql", db_url, "-v", "ON_ERROR_STOP=1", "-qAt"]
    else:
        local = "127.0.0.1" in db_url or "localhost" in db_url
        cmd = ["docker", "run", "--rm", "-i"] + (["--network", "host"] if local else []) + \
              ["postgres:16", "psql", db_url, "-v", "ON_ERROR_STOP=1", "-qAt"]
    if command:
        cmd += ["-c", command]
        return subprocess.run(cmd, capture_output=True, text=True)
    with open(sql_path) as f:
        return subprocess.run(cmd, stdin=f, capture_output=True, text=True)


def main():
    cfg_path = arg("--config") or os.environ.get("CATCHMENT_CONFIG") or catchment_config.DEFAULT
    db_url = arg("--db") or os.environ.get("DB_URL")
    only = set((arg("--only") or "").split(",")) - {""}
    skip = set((arg("--skip") or "").split(",")) - {""} or set(DEFAULT_SKIP)
    dry = "--dry-run" in sys.argv

    cfg = catchment_config.load() if not cfg_path else json_load(cfg_path)
    plan = [s for s in STEPS if (not only or s[0] in only) and s[0] not in skip]

    print(f"setup-catchment: {cfg['river']} ({cfg_path})")
    print(f"  db: {'(dry run)' if dry else mask(db_url)}")
    for name, script, _, label in plan:
        print(f"  - {name:<13} {script}")
    if dry:
        return
    if not db_url:
        sys.exit("--db <url> (or DB_URL env) is required")

    env = dict(os.environ, CATCHMENT_CONFIG=cfg_path)
    results = []
    for name, script, verify_sql, label in plan:
        t0 = time.time()
        print(f"\n=== {name} ===", flush=True)
        gen = subprocess.run([sys.executable, os.path.join(HERE, script)],
                             capture_output=True, text=True, env=env)
        sys.stderr.write(gen.stderr)
        if gen.returncode != 0:
            results.append((name, "FAILED (generate)", ""))
            print(f"!! {script} failed; continuing with remaining steps")
            continue
        with tempfile.NamedTemporaryFile("w", suffix=f"_{name}.sql", delete=False) as f:
            f.write(gen.stdout)
            sql_path = f.name
        app = psql(db_url, sql_path=sql_path)
        if app.returncode != 0:
            results.append((name, "FAILED (apply)", app.stderr.strip()[-300:]))
            print(f"!! apply failed: {app.stderr.strip()[-300:]}")
            continue
        ver = psql(db_url, command=verify_sql)
        count = ver.stdout.strip() if ver.returncode == 0 else "?"
        results.append((name, "ok", f"{count} {label}"))
        print(f"   ok in {time.time()-t0:.0f}s — {count} {label}")

    print("\n===== summary =====")
    for name, status, detail in results:
        print(f"  {name:<13} {status:<18} {detail}")
    if any(s != "ok" for _, s, _ in results):
        sys.exit(1)


def json_load(path):
    import json
    with open(path) as f:
        return json.load(f)


def mask(url):
    if not url:
        return "(none)"
    import re
    return re.sub(r":[^:@/]+@", ":****@", url)


if __name__ == "__main__":
    main()
