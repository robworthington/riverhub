# Dart discharge permits — extraction, asset match & gaps

*15 June 2026. Analysis of the 145 South West Water permit PDFs in `../permits/`, matched to River
Hub Dart assets, with the flow figures extracted and entered (PDF attached as evidence). See
`scripts/import_permits.py` + the manifest `config/dart_permits.json`.*

## What was done

- **145 permit PDFs**, all carrying a **text layer** (no image-only scans) — extracted directly with
  PyMuPDF; the emission-limit **tables** (Schedule S3.1 / S3.3) parse cleanly on the modern EPR
  consolidated permits, giving Dry Weather Flow, storm-overflow setting and storage.
- **Matched to assets via the EA EDM `permit_reference`** field (permit number → outlet `unique_id`
  → our `asset_unique_id`) — the authoritative link, not fuzzy name matching.
- **23 of the 45 Dart assets matched** a permit file; the data was entered into `asset_permits`
  (permit number, issue date, DWF, FFT, storage) with the **PDF uploaded to the private `evidence`
  bucket** and linked via `permit_doc_path`. 18 of the 23 carry at least one flow figure.
- The other **109 permits in the folder are other catchments** (Teign, Salcombe/Kingsbridge,
  Plymouth fringe, etc.) — not entered against Dart assets.

## 1. Permits entered (23 assets)

Flow figures are auto-extracted from the permit tables; **spot-check against the attached PDF**
before relying on them (the PDF is attached precisely so each value is verifiable). Pumping
stations (SPS) and CSOs have no Dry Weather Flow — only an overflow setting (l/s, shown as FFT
m³/day = l/s × 86.4) and storage; only treatment works (STW) carry DWF.

| Asset | Permit | Issued | DWF m³/d | FFT m³/d | Storage m³ |
|---|---|---|--:|--:|--:|
| Totnes STW | 203080 | 2026-01-08 | **3,967** | 8,208 | 3,520 |
| Strete STW | 203410 | 2025-12-05 | **122** | 259 | 15 |
| Scorriton STW | 203887 | 2024-11-29 | **25** | 113† | — |
| Harbertonford STW | 203562 | 2020-07-01 | — | 691 | 58 |
| Dittisham Main STW | 202711 | 2008-10-14 | — | — | — |
| Totnes Town SPS | 201662 | 2022-05-12 | — | 6,221 | 4,020 |
| Warfleet Creek SPS | 202402 | 2020-12-23 | — | 864 | 40 |
| Darthaven Marina SPS | 202398 | — | — | 1,296 | 130 |
| Lower Ferry SPS | 200160/PC | — | — | 950 | 35 |
| Priory Slip SPS | 200159/PC | 2020-12-23 | — | 518 | 12 |
| Mill Creek SPS | 202742 | 2018-09-18 | — | 570 | 4 |
| Ferry Boat SPS | 202713 | 2018-09-18 | — | 346 | 7 |
| Furzegood SPS | 201665 | — | — | 778 | 2 |
| 31 Fore Street CSO | 201955 | 2019-10-29 | — | — | — |
| Bridgetown Steamer Quay CSO | 201695 | 2018-03-20 | — | 6,048 | — |
| St Katherines Way CSO | EPR-DB3893NP | 2018-02-13 | — | 5,875 | — |
| Smith St CSO | 202400 | 2020-12-23 | — | 3,456 | — |
| Dartington C CSO | 202968 | 2018-01-31 | — | 2,938 | — |
| Textile Mill CSO | 202967 | — | — | 3,024 | — |
| Dartington Sch Two CSO | 202963 | — | — | 1,555 | — |
| Shinners Bridge CSO | 202966 | 2019-10-29 | — | — | — |
| Swallowfields CSO | 202964 | 2019-10-29 | — | — | — |
| Mayors Avenue SPS | 202401 | — | — | — | — |

† Scorriton's overflow-setting parse looks low (≈1.3 l/s) — verify against the PDF.

## 2. Assets missing a permit (22 of 45)

None of these has a permit file in the folder. Two categories:

**(a) Legacy NRA/SWWA-era consent — no modern EPR permit document supplied** *(request the current
consolidated permit from SWW / the EA public register)*

| Asset | EDM permit ref |
|---|---|
| Rattery STW (SO) | NRASW1494 |
| Ashprington STW (SO + SSO) | NRASW3983 |
| Broadhempston STW (SSO) | NRASW1075 |
| Harberton STW (SO + SSO) | NRASW5295 |
| Holne STW (SO) | SWWA2251 |
| Kilbury STW Buckfastleigh (SO + SSO) | NRASW5004 / NRASW5003 |
| Staverton STW (SSO) | NRASW0257 |

> **Rattery STW** — the catchment's worst dry-weather spiller and the WINEP headline asset — has only
> a legacy NRA consent reference and no permit document here. Its FFT/DWF is the single most
> valuable missing figure for the compliance case; prioritise obtaining it.

**(b) Modern EPR permit reference, but the document is not in the folder** *(these exist on the EA
public register — download and re-run the importer, or EIR-request)*

| Asset | EDM permit ref |
|---|---|
| Princetown STW (SO + SSO) | 201064 |
| Blackbrook North CSO, Princetown | 201856 |
| Widecombe STW | 203911 |
| New Park Garden CSO, Widecombe | 201693 |
| Old Woollen Mill CSO, Buckfastleigh | 201803 |
| St Lukes Church CSO, Buckfastleigh | 201802 |
| Pear Tree Cross CSO, Ashburton | 201952 |
| Stonepark Crescent CSO, Ashburton | 202969 |
| Stoke Gabriel SPS | 202852 |
| Yarrow Bank SPS, Kingswear | 200472 |
| Opp 26 Market Street CSO, Buckfastleigh | *(no EDM permit ref)* |

## 3. Method & caveats

- **Matching** keys on the EA EDM `permit_reference_ea_condat` ↔ our `asset_unique_id` (via the EDM
  all-years FeatureServer), normalising separators (`/`, `-`, `_`). Reliable; not name-based.
- **Flow extraction** uses PyMuPDF table parsing of the EPR Schedule S3.1 (DWF) and S3.3 (storm
  overflow setting l/s + minimum storage m³). Values are **auto-extracted — verify against the
  attached PDF**, especially older 2008 "OSM" permits whose layout differs.
- **FFT** is recorded as the storm-overflow / pass-forward setting (l/s × 86.4 → m³/day). For a
  treatment works this is the flow passed forward before the storm overflow operates; confirm
  per-permit. Population equivalent (`permit_pe`) was rarely present as a clean value and is mostly
  blank.
- **Re-runnable:** `import_permits.py` upserts the PDF and replaces this org's scanned-permit rows;
  adding the missing PDFs to `../permits/` and re-running picks them up.

## 4. Applying to production

The data was verified end-to-end on the local stack. To apply to prod Dart (you hold the creds):

```
export SUPABASE_URL="https://srxibtugcaojjleuspct.supabase.co"
export SUPABASE_SERVICE_KEY="<service-role key from Supabase → Settings → API>"
export DB_URL="<session-pooler URI>"
export PERMITS_DIR="/Users/robertworthington/Documents/Claude/Projects/River Hub/permits"
cd scripts
python3 import_permits.py --config ../config/catchments/dart.json > /tmp/permits.sql
docker run --rm -i postgres:16 psql "$DB_URL" -v ON_ERROR_STOP=1 < /tmp/permits.sql
```

Expect `asset_permits now: 23`, `with a flow value: 18`. Then open an asset page (e.g. Totnes STW)
— the Permits panel shows the figures with a **PDF** link to the attached permit.
