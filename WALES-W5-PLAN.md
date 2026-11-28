# River Hub: W5, the rest of Wales

*Plan, 28 Nov 2026. Follows `WALES-ROLLOUT-PLAN.md` (PR #100), whose W5 row said "Dee and Severn in
Wales, together with England Phase 5". W3 (Teifi) and W4 (21 Western Wales pages) are live: 22 Welsh
rivers, 111 nationally. Every figure below was taken on 28 Nov 2026 from NRW's Cycle 3 operational
catchments (DataMapWales) and the Rivers Trust's 2025 annual-return layer, with each overflow placed in
an operational catchment by its location.*

## 1. What is left

NRW has 133 operational catchments. W3 and W4 used 90. The other 43 are:

| Area | NRW district | Operational catchments | Overflows (2025 returns) | Companies |
|---|---|---|---|---|
| South East Valleys | Severn | 8 | 464 | Dŵr Cymru |
| Usk | Severn | 5 | 138 | Dŵr Cymru |
| Wye (Welsh part) | Severn | 11 | 60 | Dŵr Cymru |
| Severn Uplands and Teme Upper | Severn | 10 | 52 | Hafren Dyfrdwy (51), Severn Trent (1) |
| Dee | Dee | 9 | 211 | Dŵr Cymru, United Utilities (1) |

South East Valleys sits in NRW's Severn district, not Western Wales, which is why W4 left it out. Its
overflows spilled for the longest of any Welsh area in 2025: Ebbw and Sirhowy alone recorded 18,372 hours.

Three things split this work into different jobs:

1. **The Wye and the Dee cross into England.** NRW's catchments stop at the border. Hereford, the Lugg
   and the Arrow are EA catchments; so is Chester. Dŵr Cymru runs the sewers on both sides: the EA's
   annual returns list 122 Dŵr Cymru overflows in England (64 in the Dee district, 58 in the Severn).
   A page for either river needs both nations' data.
2. **Hafren Dyfrdwy has no live feed.** Its 54 overflows are all in the upper Severn in Wales (Severn
   Uplands, plus two in the Teme headwaters). Severn Trent's live feed (2,417 outlets) covers only
   Severn Trent: its eight sites in mid Wales's bounding box are English ones near Oswestry. Hafren
   Dyfrdwy does publish its annual return (`HD_EDM_2025_Final_File` on Severn Trent's ArcGIS), and the
   Rivers Trust layers carry 2023 and 2024.
3. **The Severn district already mixes nations.** It has four live English rivers (Wessex Water). The
   district outlines for Severn and Dee already include their Welsh parts, and the district page already
   words the baseline for a mixed district ("2020 for English rivers, 2022 for Welsh rivers"). Nothing
   to build here.

## 2. Proposal: three parts

### W5a. Wholly Welsh, Dŵr Cymru only: South East Valleys and Usk (now)

These load with today's pipeline, unchanged: the same Welsh steps as W4, the same company, wholly inside
Wales. Eight pages, about 600 overflows:

| Slug | English | Welsh (draft) | NRW operational catchments | Overflows | Hours 2025 |
|---|---|---|---|---|---|
| `taff` | River Taff | Afon Taf | Taff US Cynon, Taff DS Cynon | 66 | 12,850 |
| `rhondda` | Rhondda | Afon Rhondda | Rhondda | 87 | 17,078 |
| `cynon` | River Cynon | Afon Cynon | Cynon | 69 | 14,230 |
| `ely` | River Ely | Afon Elái | Ely | 43 | 10,170 |
| `rhymney` | River Rhymney | Afon Rhymni | Rhymney, Reens West | 72 | 15,658 |
| `ebbw-sirhowy` | Ebbw and Sirhowy | Ebwy a Sirhywi | Ebbw Sirhowy | 127 | 18,372 |
| `usk` | River Usk | Afon Wysg | Usk above Brecon, Usk Brecon to Abergavenny, Usk below Abergavenny, Reens East | 74 | 25,970 |
| `afon-lwyd` | Afon Lwyd | Afon Lwyd | Llwyd | 64 | 13,463 |

Counts are rows in the 2025 annual return; the live feed's outlet count will differ a little, as it did
in W4. The Gwent Levels reens (one overflow west of the Usk, three east) go with their nearest page.

**The Taff.** W4's `taf` page is the Carmarthenshire Taf, whose Welsh name is also "Afon Taf". The
Cardiff Taff would need a different slug (`taff`) and some way to tell the two apart in Welsh. One
option: show the Cardiff river as "Afon Taf (Caerdydd)". Rob to decide.

Effort: one day for configs and seeding, an overnight batch (two jobs, not three: three parallel jobs
deadlocked on the systems step in W4), half a day to verify. Live after Rob approves the names.

### W5b. Cross-border, Dŵr Cymru: Wye and Dee

Each river becomes one page covering both sides of the border. Dŵr Cymru is the only company on the Wye
on both sides, and the main one on the Dee (United Utilities has five overflows near Chester), so the
live feed is the same one W4 uses. What is new is that one page needs both nations' readers:

1. **Config:** a page lists NRW operational catchments (`nrw.opcats`) and EA ones (`wfd.opcat_ids`), and
   gets `"nation": "border"` (or a list of nations).
2. **Pipeline:** `setup_catchment.py` runs the Welsh step for the Welsh part and the English step for the
   English part, each clipped to its side, so water quality comes from both the NRW archive and the EA
   archive, protected areas from both NRW and Natural England, incidents from both, and so on. The
   importers already limit deletes by source, so the two passes don't remove each other's rows; this
   needs checking step by step.
3. **Annual returns:** Welsh overflows from Dŵr Cymru's EDM layers (as W4); English overflows from the
   EA's all-years layer (2020 onwards), which already lists Dŵr Cymru's English sites.
4. **Spill history:** the EA's start/stop files should include Dŵr Cymru's English sites, giving the
   English side years of events while the Welsh side starts on 28 Nov 2026. The pages must say so.
5. **Wording:** a border page names both regulators ("Natural Resources Wales and the Environment
   Agency") and both baselines. The incident pages already name each record's publisher; the water
   quality and protected-area credits need the same.

Pages (to refine once the English side is mapped): the Wye probably as three (Upper Wye with the Ithon
and Irfon; Lower Wye and Monnow; Lugg and Arrow), the Dee as three (Upper Dee to Llangollen; the Alyn;
Lower Dee and estuary through Chester). Effort: about a week for the pipeline and wording, then a batch.

### W5c. Hafren Dyfrdwy: upper Severn and Vyrnwy (with England Phase 5)

The upper Severn is Hafren Dyfrdwy's in Wales and Severn Trent's from Shropshire down. Two choices:

- **With Phase 5 (the original plan).** Load the Welsh upper Severn together with Severn Trent's
  Shropshire pages, so the Severn reads as one river through Welshpool and Shrewsbury.
- **Now, Welsh part only.** One or two pages (Upper Severn, Vyrnwy with Tanat and Banwy) from Hafren
  Dyfrdwy's annual returns, with live status shown as "Hafren Dyfrdwy doesn't publish live data". This
  needs a small new reader for Hafren Dyfrdwy's annual returns.

Either way, Rob's W1 email asking Hafren Dyfrdwy whether a live feed exists is still unsent.

## 3. Order

| Part | What | Depends on |
|---|---|---|
| W5a | South East Valleys and Usk, 8 pages | Rob's names (and the Taff question) |
| W5b | Border pipeline and wording, then Wye and Dee, about 6 pages | W5a done; nothing external |
| W5c | Upper Severn and Vyrnwy | Rob's choice; England Phase 5 or a Hafren Dyfrdwy reader |

When all three are done, every NRW operational catchment with an overflow has a page.

## 4. Decisions for Rob

1. Start W5a now with the eight pages above?
2. The Cardiff Taff: slug `taff`, and how to name it in Welsh next to the Carmarthenshire Taf?
3. Border rivers: one page across both nations (recommended), or Welsh part only for now?
4. Upper Severn: wait for England Phase 5, or load the Welsh part now without a live feed?

**Decided 28 Nov 2026 (Rob):** all four as recommended. W5a started the same day (Load rivers run
46176126608, two jobs). The Cardiff river is `taff`, "Afon Taf (Caerdydd)" in Welsh, and the
Carmarthenshire Taf became "Afon Taf (Sir Gâr)". The Wye and Dee get one page each across both nations
(W5b). The upper Severn waits for England Phase 5 (W5c).
