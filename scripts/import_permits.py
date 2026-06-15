#!/usr/bin/env python3
"""
Import South West Water discharge permits for a catchment: upload each scanned permit PDF to the
private 'evidence' storage bucket and insert an asset_permits row linked to the matching asset, with
the flow figures (DWF / overflow setting / storage) extracted from the permit.

The permit→asset match and the extracted figures are pre-computed into a manifest JSON
(config/<catchment>_permits.json) by the analysis step — each row carries the asset's EDM
unique id (asset_unique_id), the source PDF filename, the permit number, issue date, and the
extracted dwf / fft / storage / pe. This script:
  1. uploads <permits_dir>/<file> to evidence at  assets/<asset_id>/permits/<permit_number>.pdf
  2. emits idempotent SQL inserting asset_permits (asset resolved by asset_unique_id), with
     permit_doc_path pointing at the uploaded object.

Upload needs the Storage REST API (service-role key). SQL is emitted to stdout for psql, matching
the other importers. Re-runnable: upload is upsert; the SQL deletes this catchment's permit rows
sourced from 'sww-scan' before re-inserting.

Env:
    SUPABASE_URL           e.g. https://<ref>.supabase.co  (or http://127.0.0.1:54421 local)
    SUPABASE_SERVICE_KEY   service-role / secret key (storage upload)
    PERMITS_DIR            path to the folder of permit PDFs (default ../permits)
Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_KEY=... python3 import_permits.py \
        --config ../config/catchments/dart.json --manifest ../config/dart_permits.json > /tmp/permits.sql
    docker run --rm -i postgres:16 psql "$DB_URL" < /tmp/permits.sql
"""
import json, os, ssl, sys, urllib.request, urllib.parse, urllib.error

import catchment_config

_SSL = ssl.create_default_context(); _SSL.check_hostname = False; _SSL.verify_mode = ssl.CERT_NONE


def arg(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def upload(base, key, path, data):
    url = f"{base}/storage/v1/object/{urllib.parse.quote(path)}"
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": f"Bearer {key}", "apikey": key,
        "Content-Type": "application/pdf", "x-upsert": "true",
    })
    try:
        with urllib.request.urlopen(req, timeout=120, context=_SSL) as r:
            return r.status
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", "replace")[:300]
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code}: {body}") from None


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def numlit(v):
    if v in (None, ""):
        return "null"
    try:
        return repr(round(float(v), 2))
    except (TypeError, ValueError):
        return "null"


def main():
    cfg = catchment_config.load()
    org = cfg["org_id"]
    base = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not base or not key:
        sys.exit("set SUPABASE_URL and SUPABASE_SERVICE_KEY (service-role key) to upload PDFs")
    here = os.path.dirname(os.path.abspath(__file__))
    permits_dir = os.environ.get("PERMITS_DIR") or os.path.join(here, "..", "permits")
    manifest = arg("--manifest") or os.path.join(here, "..", "config", f"{cfg['name']}_permits.json")
    rows = json.load(open(manifest))

    uploaded, out = [], []
    for r in rows:
        src = os.path.join(permits_dir, r["file"])
        if not os.path.exists(src):
            print(f"-- MISSING FILE, skipped: {r['file']}", file=sys.stderr); continue
        # object path mirrors the app's PermitForm convention (assets/<id>/permits/<name>)
        # asset id isn't known here, so key on asset_unique_id; resolved to a tidy object name.
        obj = f"assets/{r['uid']}/permits/{r['permit_number'].replace('/','-')}.pdf"
        with open(src, "rb") as fh:
            try:
                upload(base, key, f"evidence/{obj}", fh.read())
            except Exception as e:
                print(f"-- UPLOAD FAILED {r['file']}: {e}", file=sys.stderr); continue
        uploaded.append({**r, "obj": obj})
        print(f"-- uploaded {r['permit_number']:14} -> {obj}", file=sys.stderr)

    orgl = q(org) + "::uuid"
    out.append(f"-- River Hub: SWW permits for {cfg['river']} (matched via EDM permit_reference; "
               f"flows extracted from the permit PDFs). Idempotent.")
    out.append("begin;")
    # replace this catchment's scanned-permit rows (keep any manually-entered permits)
    out.append(f"delete from asset_permits where organisation_id = {orgl} and permit_doc_path like 'assets/%/permits/%' "
               f"and asset_id in (select id from sewage_assets where organisation_id = {orgl});")
    for r in uploaded:
        out.append(
            "insert into asset_permits (organisation_id, asset_id, permit_number, permit_start_date, "
            "required_storage_capacity, permit_dwf_m3d, permit_fft_m3d, permit_pe, permit_doc_path)\n"
            f"select {orgl}, sa.id, {q(r['permit_number'])}, {q(r['issued'])}, "
            f"{numlit(r['storage_m3'])}, {numlit(r['dwf'])}, {numlit(r['fft_m3d'])}, "
            f"{('null' if r.get('pe') in (None,'') else int(r['pe']))}, {q(r['obj'])}\n"
            f"from sewage_assets sa where sa.organisation_id = {orgl} and sa.asset_unique_id = {q(r['uid'])};"
        )
    out.append(f"select 'asset_permits now: ' || count(*) from asset_permits where organisation_id = {orgl};")
    out.append(f"select 'with a flow value: ' || count(*) from asset_permits where organisation_id = {orgl} "
               f"and (permit_dwf_m3d is not null or permit_fft_m3d is not null or required_storage_capacity is not null);")
    out.append("commit;")
    print("\n".join(out))
    print(f"-- uploaded {len(uploaded)} PDFs, {len(rows)-len(uploaded)} skipped", file=sys.stderr)


if __name__ == "__main__":
    main()
