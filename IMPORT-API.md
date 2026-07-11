# Results import API

Programmatic ingestion of test results — Phase 3 of [IMPORT-TOOL-DESIGN.md](IMPORT-TOOL-DESIGN.md).
Reuses the same validate/load pipeline as the upload wizard; the difference is only the front-end
(HTTP JSON instead of a parsed file).

## Endpoint
```
POST https://<instance-host>/api/import/results
Authorization: Bearer <api-key>        # or:  x-api-key: <api-key>
Content-Type: application/json
```

## Auth
API keys are created per organisation in the app: **Admin → API keys** (admin only). The full key
(`rvh_…`) is shown once at creation; only its SHA-256 hash is stored. A key grants write access to
that org's results — treat it like a password; revoke from the same page. Requests authenticate with
the service role internally, so RLS is enforced by scoping every write to the key's organisation.

## Request body
A JSON array of records, or `{ "records": [ … ] }` (max 5000 per request). Each record is one
sampling visit with one or more measurements — the wide→long unpivot is done for you:
```json
{
  "records": [
    {
      "site": "Shaldon Bathing Water",          // by name, or "site_id": "<uuid>"
      "sampled_at": "2025-04-30T13:16",           // or "date": "2025-04-30", "time": "13:16"
      "condition": "dry",                          // optional: wet | dry
      "rainfall": 0, "temperature_c": 14.2, "salinity_ppt": 31,   // optional first-class fields
      "context": { "tide_state": "E", "tide_height_m": 2 },        // optional free-form
      "measurements": [
        { "test": "E. coli (culture)", "value": 10, "qualifier": "<" },
        { "test": "Intestinal enterococci (culture)", "value": 49 }
      ]
    }
  ]
}
```
- **site** — matched to an existing site by name (case-insensitive) or `site_id`. Unknown → row error.
- **sampled_at / date** — `date` (YYYY-MM-DD) is required; `time` optional.
- **measurements[].test** — matched to an existing test type by name (or `test_type_id`). `qualifier`
  is `<`, `>` or `=` (default). Unknown test → that measurement errors, others still load.
- **Idempotent** — upserts on `(site, date, time, test type)`, so re-sending the same data updates
  rather than duplicates. Rows are stamped `source = 'api'`.

## Response
```json
{ "ok": true, "records": 1, "imported": 2, "skipped": 0, "errors": [] }
```
- `200` all good · `207` partial (some rows errored, others imported) · `400` nothing imported ·
  `401` missing/invalid/revoked key · `413` too many records.
- `errors[]` is `{ index, error }` per failed record/measurement (index into your `records`).

## Example
```bash
curl -s -X POST "https://riverhub-teign.vercel.app/api/import/results" \
  -H "Authorization: Bearer rvh_XXXXXXXX" -H "Content-Type: application/json" \
  -d '{"records":[{"site":"Shaldon Bathing Water","sampled_at":"2025-04-30T13:16",
        "rainfall":0,"context":{"tide_state":"E"},
        "measurements":[{"test":"E. coli (culture)","value":10,"qualifier":"<"},
                        {"test":"Intestinal enterococci (culture)","value":49}]}]}'
```

## Notes
- Test types and sites must already exist for the org (the API resolves, it doesn't create them).
- Same data model as the wizard, so imported results appear identically on site/analysis pages and
  feed the bathing-water classification.
