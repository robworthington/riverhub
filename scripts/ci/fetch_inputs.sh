#!/usr/bin/env bash
# Download the files the river import pipeline reads from disk, for a run off Rob's Mac (GitHub Actions
# or the VPS runner). Prints the environment variables to export. Usage:
#   scripts/ci/fetch_inputs.sh <dir>            # then: source <dir>/inputs.env
#
#  * EA Detailed EDM Start/Stop zips, the PR24 WINEP National Dataset and the Census 2021 OA cache:
#    from this repo's `import-inputs` release (copies of open data, OGL v3; see the release notes).
#  * NRW Open Water Quality Archive yearly zips (nrw-wq-<year>.zip, all of Wales, OGL v3): also from the
#    `import-inputs` release, copied there by hand because NRW's ShareFile share refuses scripted downloads.
#    Refresh them when NRW updates the archive (monthly; see scripts/import_nrw_wq_samples.py).
#  * Wastewater catchment areas (WWCA): straight from github.com/tillahoffmann/wastewater-catchment-areas
#    (MIT), release norm-intersection-sum.
set -euo pipefail
DIR="${1:?usage: fetch_inputs.sh <dir>}"
REPO="${GITHUB_REPOSITORY:-robworthington/riverhub}"
TAG="${INPUTS_TAG:-import-inputs}"
WWCA_TAG="norm-intersection-sum"
mkdir -p "$DIR/edm-startstop" "$DIR/wwca" "$DIR/cache" "$DIR/nrw-wq"

base="https://github.com/$REPO/releases/download/$TAG"
get() { curl -fsSL --retry 4 --retry-delay 5 -o "$2" "$1"; }

# release asset name -> the EA's own file name (the start/stop reader keys off the names inside the zips)
get "$base/edm-startstop-2024.zip" "$DIR/edm-startstop/2024 Detailed EDM Start-Stop Data.zip"
get "$base/edm-startstop-2025.zip" "$DIR/edm-startstop/2025 Detailed EDM Start-Stop Data.zip"
get "$base/edm-startstop-2026-to-sept.zip" "$DIR/edm-startstop/2026 Year to Sept Start-Stop Data.zip"
get "$base/pr24-winep-national-dataset.xlsx" "$DIR/winep.xlsx"
get "$base/oa2021.csv" "$DIR/cache/oa2021.csv"
for y in 2021 2022 2023 2024 2025 2026; do
  get "$base/nrw-wq-$y.zip" "$DIR/nrw-wq/nrw-wq-$y.zip"
done

wwca="https://github.com/tillahoffmann/wastewater-catchment-areas/releases/download/$WWCA_TAG"
get "$wwca/catchments_consolidated.zip" "$DIR/wwca/c.zip"
get "$wwca/waterbase_catchment_lookup.csv" "$DIR/wwca/waterbase_catchment_lookup.csv"
(cd "$DIR/wwca" && unzip -oq c.zip && rm c.zip)
ls "$DIR/wwca"/catchments_consolidated.shp >/dev/null

DIR_ABS="$(cd "$DIR" && pwd)"
cat > "$DIR/inputs.env" <<ENV
export EDM_STARTSTOP_DIR="$DIR_ABS/edm-startstop"
export WWCA_DIR="$DIR_ABS/wwca"
export WINEP_XLSX="$DIR_ABS/winep.xlsx"
export OA_CACHE="$DIR_ABS/cache/oa2021.csv"
export NRW_WQ_DIR="$DIR_ABS/nrw-wq"
export EA_FROM="\${EA_FROM:-2021-01-01}"
ENV
du -sh "$DIR"/* | sed "s#$DIR/##"
echo "inputs ready: source $DIR/inputs.env"
