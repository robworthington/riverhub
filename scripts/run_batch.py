#!/usr/bin/env python3
"""
Load a batch of rivers in parallel, verify each, and re-run failed steps (ENGLAND-ROLLOUT-PLAN.md
Phase 0.4, NATIONAL-ONBOARDING.md §7). Replaces the scratch run_batch.sh / rerun_failed.sh.

  # load every approved river in a sheet, 4 at a time, then verify each (org-scoped)
  run_batch.py --sheet batches/wessex.csv --db "$DB_URL" --jobs 4

  # or name configs directly
  run_batch.py --configs config/catchments/parrett.json config/catchments/brue.json --db "$DB_URL"

  # re-run only the steps that failed last time (transient EA 500s / dropped DB connections are normal)
  run_batch.py --rerun batches/wessex.results.csv --db "$DB_URL"

Each river's setup_catchment.py output goes to logs/<slug>.log. Results (failed steps, verify outcome,
minutes) go to <sheet>.results.csv, or batch.results.csv for --configs. A failure never stops the batch.
verify-river.sh's org-scoped reconciliation is the only check trusted (the orchestrator's own counts
are whole-table). Rivers stay live=false throughout; go live is a separate, reviewed SQL update.
"""
import argparse
import csv
import json
import os
import re
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
LOG_DIR = os.path.join(ROOT, "logs")
RESULT_FIELDS = ["slug", "org_id", "config", "status", "failed_steps", "verify", "minutes", "log"]


def rivers_from_sheet(path, kind=None):
    """One config per river (rows sharing a slug are one river). kind='rivers' or 'coastal' keeps
    only those, so coastal stretches can load in a second pass after the rivers."""
    with open(path, newline="") as f:
        rows = [r for r in csv.DictReader(f) if r["approve"].strip().lower() == "yes" and r["org_id"]]
    out = []
    for r in rows:
        p = os.path.join(ROOT, "config", "catchments", f"{r['slug']}.json")
        if p in out:
            continue
        if kind:
            with open(p) as fh:
                coastal = bool(json.load(fh).get("wfd", {}).get("coastal"))
            if coastal != (kind == "coastal"):
                continue
        out.append(p)
    return out


def load_cfg(path):
    with open(path) as f:
        cfg = json.load(f)
    return os.path.splitext(os.path.basename(path))[0], cfg["org_id"]


def setup(config, db, only=None, dry=False):
    """Run setup_catchment.py for one river; returns (status, failed steps, log path, minutes)."""
    slug, _ = load_cfg(config)
    os.makedirs(LOG_DIR, exist_ok=True)
    log = os.path.join(LOG_DIR, f"{slug}.log")
    cmd = [sys.executable, os.path.join(HERE, "setup_catchment.py"), "--config", config, "--db", db]
    if only:
        cmd += ["--only", ",".join(only)]
    if dry:
        cmd.append("--dry-run")
    t0 = time.time()
    with open(log, "a") as fh:
        fh.write(f"\n##### {time.strftime('%Y-%m-%d %H:%M:%S')} {' '.join(c if c != db else '<db>' for c in cmd)}\n")
        fh.flush()
        res = subprocess.run(cmd, stdout=fh, stderr=subprocess.STDOUT, text=True)
    text = open(log).read().split("#####")[-1]
    failed = re.findall(r"^\s{2}(\S+)\s+FAILED", text, re.M)
    status = "dry-run" if dry else ("ok" if res.returncode == 0 and not failed else "failed")
    return status, failed, log, round((time.time() - t0) / 60, 1)


def verify(slug, org_id, db):
    """verify-river.sh org-scoped DB reconciliation (no page checks: rivers are still hidden)."""
    res = subprocess.run(["bash", os.path.join(HERE, "verify-river.sh"), slug, org_id, "", db],
                         capture_output=True, text=True)
    with open(os.path.join(LOG_DIR, f"{slug}.log"), "a") as fh:
        fh.write("\n##### verify-river.sh\n" + res.stdout + res.stderr)
    return "pass" if res.returncode == 0 else "fail"


def run(configs, db, jobs, results_path, only_by_slug=None, dry=False):
    out = []

    def one(config):
        slug, org = load_cfg(config)
        only = (only_by_slug or {}).get(slug)
        status, failed, log, mins = setup(config, db, only, dry)
        ver = "" if dry else verify(slug, org, db)
        print(f"  {slug:<28} {status:<8} failed={','.join(failed) or '-':<24} verify={ver or '-'} {mins} min", flush=True)
        return {"slug": slug, "org_id": org, "config": os.path.relpath(config, ROOT), "status": status,
                "failed_steps": ",".join(failed), "verify": ver, "minutes": mins, "log": os.path.relpath(log, ROOT)}

    print(f"run_batch: {len(configs)} rivers, {jobs} at a time{' (dry run)' if dry else ''}", flush=True)
    with ThreadPoolExecutor(max_workers=jobs) as pool:
        for fut in as_completed([pool.submit(one, c) for c in configs]):
            try:
                out.append(fut.result())
            except Exception as e:  # a crash in one river never stops the batch
                print(f"  !! {e}", flush=True)
    out.sort(key=lambda r: r["slug"])
    write_results(results_path, out)
    bad = [r for r in out if r["status"] == "failed" or r["verify"] == "fail"]
    print(f"\n{len(out) - len(bad)}/{len(out)} rivers clean. Results: {os.path.relpath(results_path, ROOT)}")
    if bad:
        print(f"Re-run the failed steps with: run_batch.py --rerun {os.path.relpath(results_path, ROOT)} --db \"$DB_URL\"")
    return out


def write_results(path, rows):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=RESULT_FIELDS)
        w.writeheader()
        w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--sheet", help="review sheet from onboard_company.py (rows with approve=yes)")
    src.add_argument("--configs", nargs="+", help="config/catchments/*.json files")
    src.add_argument("--rerun", help="a previous .results.csv: re-run only each river's failed steps")
    ap.add_argument("--db", default=os.environ.get("DB_URL"), help="national DB url (or DB_URL env)")
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--kind", choices=["rivers", "coastal"],
                    help="with --sheet: only rivers, or only coastal stretches (load coastal after rivers)")
    ap.add_argument("--only", help="with --sheet/--configs: comma-separated steps to run (default: all)")
    ap.add_argument("--dry-run", action="store_true", help="show each river's plan without loading anything")
    a = ap.parse_args()
    if not a.db and not a.dry_run:
        sys.exit("--db <url> (or DB_URL env) is required")
    db = a.db or "postgresql://dry-run"

    if a.rerun:
        with open(a.rerun, newline="") as f:
            prev = list(csv.DictReader(f))
        todo = [r for r in prev if r["status"] == "failed" or r["verify"] == "fail"]
        configs = [os.path.join(ROOT, r["config"]) for r in todo]
        only = {r["slug"]: [s for s in r["failed_steps"].split(",") if s] or None for r in todo}
        tmp = a.rerun + ".rerun.csv"
        redone = {r["slug"]: r for r in run(configs, db, a.jobs, tmp, only_by_slug=only, dry=a.dry_run)}
        os.remove(tmp)
        if not a.dry_run:  # fold the re-run rivers back into the full results
            write_results(a.rerun, [redone.get(r["slug"], r) for r in prev])
        return
    configs = rivers_from_sheet(a.sheet, a.kind) if a.sheet else [os.path.abspath(c) for c in a.configs]
    results = ((os.path.splitext(a.sheet)[0] + (f".{a.kind}" if a.kind else "") + ".results.csv") if a.sheet
               else os.path.join(ROOT, "batch.results.csv"))
    only = None
    if a.only:
        steps = [x.strip() for x in a.only.split(",") if x.strip()]
        only = {load_cfg(c)[0]: steps for c in configs}
    run(configs, db, a.jobs, results, only_by_slug=only, dry=a.dry_run)


if __name__ == "__main__":
    main()
