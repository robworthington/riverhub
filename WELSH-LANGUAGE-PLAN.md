# River Hub in Welsh

*Assessment, 28 Nov 2026. Rob asked us to consider translating the site into Welsh now that 22 Welsh
rivers are live (30 after W5a). Nothing here is built yet.*

## 1. Where we are

The site is English only. The page says `lang="en-GB"`, there is no translation library, and every
sentence is written into the page code. Welsh appears in three places:

- **River names.** Each Welsh river has `river_name_cy` (Afon Tywi, Ynys Môn, Ddawan a Thregatwg), shown
  next to the English name.
- **Community councils.** The importer reads NRW's Welsh names (`name_cy`) along with the English ones.
- **Bathing waters.** NRW's Welsh name is stored in `attrs.name_cy`.

Overflow names come from Dŵr Cymru's live feed, which today has English names only (`asset_name`,
`Receiving_Water`). The `*_Welsh` fields `WALES-ROLLOUT-PLAN.md` mentions are no longer in the layer.

There's no legal duty. The Welsh Language Standards bind the public bodies named in the regulations, not
a volunteer site. The case for doing it is that about 30 of River Hub's rivers are in Wales, and the
people most likely to use a page about the Teifi or the Conwy include Welsh speakers.

## 2. How much text

The public and national pages are about 90 files holding roughly 10,000 words of written text, plus
templated phrases ("12 spilling now", "3 gaps"). Most of it sits in a few places:

| Part | Rough share | Notes |
|---|---|---|
| River pages: spills, map, dry spills, works, river health, who's fixing it | about half | What most visitors read |
| Method and explanation pages (how we know, why it happens, counting rules) | about a third | Long, technical, change rarely |
| National pages: home, districts, compare, incidents | the rest | Short |

Data text adds more: water body names, NEP action descriptions, NRW and EA determinand names. These come
from the sources in English. Where a source has Welsh (councils, bathing waters, NRW's water bodies), we
can show it; where it doesn't, it stays English.

## 3. How it would work

1. **Language switch.** A `/cy/...` version of every public page (`/cy/r/teifi/explore/spills`), with a
   Cymraeg / English switch in the header and `lang="cy"` on Welsh pages. Separate addresses rather
   than a cookie, so Welsh pages can be shared and indexed.
2. **Strings out of the code.** Move every sentence into message files (`messages/en.json`,
   `messages/cy.json`) through a library such as `next-intl`. This is the bulk of the engineering: about
   90 files, a week or so, and it's worth doing even before any Welsh, because the per-nation wording
   (`lib/nation.ts`) gets simpler too.
3. **Plurals and numbers.** Welsh has six plural forms (zero, one, two, few, many, other), so "3 gaps"
   can't be built by adding an "s". The message files need ICU plural rules; `next-intl` supports them.
4. **Names.** On Welsh pages, show Welsh names first where we have them (river, community, bathing
   water), English second. On English pages, the reverse.
5. **A check in CI.** A new English sentence without a Welsh one fails the build, or at least warns, so
   the Welsh version doesn't drift behind.

## 4. Translation and cost

Machine translation should only be a first draft. A wrong Welsh sentence on a page about sewage would do
more harm than an English one, so every string needs a human translator or reviewer.

- **Helo Blod**, the Welsh Government's free service, translates up to 500 words a month for a business,
  charity or community group. That covers the small, steady additions after launch, not the first
  10,000 words: those would take 20 months at that rate, and Helo Blod won't take paid work beyond the
  allowance.
- **A professional translator** for the first pass, found through Cymdeithas Cyfieithwyr Cymru (the
  Association of Welsh Translators and Interpreters). Get a quote for about 10,000 words; I'd expect
  low thousands of pounds, but I haven't checked current rates.
- **A Welsh-speaking reviewer** from one of the Welsh river groups, to check the terms read naturally
  to the people who will use them (gorlif storm, carthion, and so on). The Welsh Government's term bank,
  TermCymru, gives the standard terms, so ours match what NRW and Dŵr Cymru use.

## 5. Suggested order

| Step | What | Effort | Cost |
|---|---|---|---|
| 1 | Welsh names first on Welsh river pages; bilingual page titles and the river header | 1–2 days | none |
| 2 | Strings into message files, `/cy/` routes and the switch, English only to start | about a week | none |
| 3 | Translate the river pages (about 5,000 words) and launch Welsh for Welsh rivers | 1–2 weeks with a translator | translator |
| 4 | Method and national pages | as they settle | translator |
| 5 | Ongoing: new text through Helo Blod's 500 words a month | small | free |

Step 1 helps now and doesn't depend on the rest. Step 2 is engineering we control. Steps 3 and 4 depend
on a translator and a reviewer.

## 6. Decisions for Rob

1. Go ahead with step 1 now (Welsh names first on Welsh river pages)?
2. Commit to the full Welsh version (steps 2 to 4), or stop at names and headings for now?
3. Budget for a translator for the first pass, and is there a Welsh-speaking volunteer who could review?
4. Welsh pages for Welsh rivers only, or the whole site (English rivers included)?
