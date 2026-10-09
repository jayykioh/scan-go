# Market price survey

How the Seed gets realistic ingredient prices, where they come from, and how
close they are to a real purchase cost.

## Run it

```bash
npm run market:survey                       # survey HCM, write the generated file
npm run market:survey -- --region=HCM,HN    # survey both regions
npm run market:survey -- --dry-run          # print the review table only
```

The command reads three public listings, converts each candidate to the base
unit the Seed stores, keeps the cheapest comparable product per ingredient, and
writes `functions/src/scripts/market-prices.generated.ts`.

Nothing reaches the Seed automatically. The generated file is a proposal that is
reviewed in a diff — that review step is the point, because automated name
matching gets things wrong.

## Sellers surveyed

| Seller | Type | Regions | How it is read |
|---|---|---|---|
| **Kamereo** | **wholesale** | HCM, HN | GraphQL catalogue; sells to restaurants, not consumers |
| WinMart | retail | HCM | Storefront JSON API, category + keyword search |
| Co.op Online | retail | HCM | `__NEXT_DATA__` payload on the category page |

WinMart store 1535 and Co.op Online are southern chains, so they are **skipped
and reported** for a Hanoi survey rather than relabelled. Only Kamereo serves
both regions, which is why a Hanoi survey leans entirely on wholesale prices.

Kamereo is the important one. It is a business-to-business food supplier, so its
listed price is the closest public number to what a kitchen actually pays. Every
observation records its `marketType`, so a wholesale price is never confused
with a retail one.

Bách Hoá Xanh was evaluated and **could not be surveyed**: its product list is
rendered client-side and gated behind an interactive store selection, so no
product data is reachable without driving a full browser session through the
location flow. It is not surveyed rather than silently skipped.

## Wholesale versus retail, on the same ingredient

This is the number that matters. Where both a wholesaler and a retailer carry a
comparable product:

| Ingredient | Wholesale (Kamereo) | Retail | Retail markup |
|---|---|---|---|
| Cá lóc | 110.000/kg | 199.000/kg (WinMart) | **+81%** |
| Cà chua | 23.000/kg | 32.000/kg (WinMart) | +39% |
| Thịt heo | 103.000/kg | 119.000/kg (WinMart) | +16% |
| Gà ta | 83.000/kg | 96.000/kg (WinMart) | +16% |
| Thịt bò | 253.000/kg | 282.000/kg (WinMart) | +11% |
| Nước dừa | 41.000/l | 44.000/l (WinMart) | +7% |
| Trứng gà | 5.250/quả | 2.690/quả (Co.op) | −49% |

**A retail listing overstates Cost by 16–81% on fresh food.** That is why the
survey prefers a wholesale observation and why the Seed prints a warning.

The egg row runs the other way, and it is not a bug: Kamereo's egg is a premium
graded line while Co.op's is a standard own-brand box. A large gap in either
direction means the two products are not the same grade — the generated file
records `spreadPercent` per ingredient so a reviewer sees it.

## Does the region change the price?

Yes, but not the way it first looks. The survey carries a `region` on every
observation, and the comparison table prints whether the two regions are even
looking at the same product:

| Ingredient | HCM | HN | Gap | Same product? |
|---|---|---|---|---|
| Bún tươi | 18 (WinMart) | 68 (Kamereo) | 278% | no — different source |
| Hành tím | 90 (WinMart) | 28 (Kamereo) | 221% | no — different source |
| Giá đỗ | 33 (WinMart) | 14 (Kamereo) | 136% | no — different source |
| Thịt heo | 103 (Kamereo) | 170 (Kamereo) | 65% | no — different cut |
| Thịt bò | 199 (Co.op) | 290 (Kamereo) | 46% | no — different source |
| Trứng gà | 2.690 (Co.op) | 3.413 (Kamereo) | 27% | no — different grade |
| Cà chua | 23 (Kamereo) | 29 (Kamereo) | 26% | no — Đà Lạt vs Bắc |
| **Nước dừa** | **41 (Kamereo)** | **41 (Kamereo)** | **0%** | **yes** |

Two separate effects are in play, and conflating them would be wrong:

1. **A nationally priced product costs the same in both regions.** Comparing
   identical branded lines (CP chicken, imported pork belly, Cocoxim coconut
   water) across HCM and HN gave **0% difference on every match**. The supplier
   sets one national price for a branded SKU.
2. **What differs is the catalogue and therefore which product is cheapest.**
   The produce category holds **524 products in HCM against 302 in HN**, and the
   cheapest tomato is a Đà Lạt beef tomato in the south against a northern
   `Cà Chua Bắc` in the north. `Dứa (thơm)` is listed in Hanoi and not in the
   southern produce category at all.

So a Hanoi shop is not paying a "Hanoi markup" on the same carrot — it is buying
a **different carrot from a different supplier**. That is why the Seed resolves
per region and why a region with no observation keeps its fallback instead of
borrowing another city's price.

## What the survey found

Measured 2026-10-07. Of 20 Seed ingredients, **17 produced a usable price**, and
5 of those came from the wholesale seller:

| Ingredient | Source | Type | Unit cost |
|---|---|---|---|
| Cà chua | Kamereo | wholesale | 23.000/kg |
| Gà ta | Kamereo | wholesale | 83.000/kg |
| Thịt heo | Kamereo | wholesale | 103.000/kg |
| Cá lóc | Kamereo | wholesale | 110.000/kg |
| Nước dừa | Kamereo | wholesale | 41.000/l |
| Gạo tẻ | Co.op | retail | 15.000/kg |
| Thịt bò | Co.op | retail | 199.000/kg |
| Tôm sú | Co.op | retail | 339.000/kg |
| Trứng gà | Co.op | retail | 2.690/quả |
| Rau sống | Co.op | retail | 48.000/kg |
| Bánh phở | WinMart | retail | 34.000/kg |
| Bún tươi | WinMart | retail | 18.000/kg |
| Đậu hũ | WinMart | retail | 51.000/kg |
| Giá đỗ | WinMart | retail | 33.000/kg |
| Sả | WinMart | retail | 45.000/kg |
| Tỏi | WinMart | retail | 70.000/kg |
| Hành tím | WinMart | retail | 90.000/kg |

**3 report no match, with a reason:**

- `Dứa (thơm)` — sold by the fruit (`Dứa/khóm`, QUA @ 34.000) with no weight, so
  it cannot be converted to the gram the Seed stores.
- `Me chua` — not sold as a raw ingredient by any of the three sellers.
- `Nước cốt trà đào` — only ready-to-drink bottles, no concentrate.

## Traps this pipeline already hit

Each of these silently produced a wrong number before a human read the review
table. They are recorded because the same class of bug will recur.

**A missed unit spelling dropped a whole catalogue.** Kamereo writes its unit as
the enum code `KILOGRAM`, not `KG`. The bulk-measure check only knew `KG`, `Kg`,
and `L`, so **every per-kilogram wholesale line was discarded** and only its pack
and carton lines were ever compared. Fixing it took the wholesale win count from
3 ingredients to 5. `listing.test.ts` now pins every spelling.

**Decomposed Unicode defeated every accented pattern.** Kamereo returns
`Mỡ Heo` as `M` + `ơ` + U+0303 COMBINING TILDE, while a pattern written as the
single codepoint `ỡ` (U+1EE1) does not match it. The failure is silent — the row
simply never matches — and it defeated the exclusions that keep pork fat and
bones out of a meat price. Every adapter now normalizes names to NFC.

**A missing word boundary turned a lime into tamarind.** The `me chua` pattern
used `me\b`, which also matches the tail of `Lime`. It is now `\bme\b`.

**A pack weight hidden in `uomName`.** The WinMart search endpoint writes the
pack weight into `uomName` (`0.385KG`) while `uom` still says `KG`, whereas the
category endpoint writes a friendly label (`Kg`) and a per-kilogram price.
Reading `uom` alone priced a 385g pack of minced pork as a kilogram — a **2.6x
understatement**. A declared pack weight is now folded into the name so the
shared parser reads it.

**Keyword search crosses departments.** Searching `sả` returned a floor cleaner
and searching `thịt bò` returned instant noodles. The seller's own category path
is now checked against an allowed department — but only for search hits, because
a category read is already scoped and a wholesale catalogue names its
departments in English.

**Prepared dishes carry the ingredient's name.** A search for `thịt bò` returned
`Bánh mì tươi tròn xẻ nhân thịt bò`, whose price is a sandwich. Prepared dishes
are excluded from the protein targets only — `bánh` would wrongly exclude
`bánh phở`.

**A single-region survey labelled as national.** The first survey quoted every
price for `regionCode: 'HCM'` and a southern store, so a Hanoi shop would have
been costed at Saigon prices. Region is now a field on every observation, the
collector refuses to query a seller outside the requested region, and the Seed
resolver matches the region exactly rather than borrowing the nearest one.

**Milled rice is not rice.** The Hanoi catalogue priced `Bột Gạo Tài Ký` as the
cheapest "rice" — a 400g bag of rice flour at 49.000/kg. `bột` is now excluded
along with `nếp` and `lứt`.

**Wrong species and wrong cuts.** Early runs priced `Thịt heo` from pork tail
bone and pork fat, `Gà ta` from chicken tail, `Tôm sú` from a different shrimp
species, and `Cà chua` from a specialty variety at three times a common tomato.
`ingredient-map.ts` records why each exclusion exists; read those comments
before loosening a pattern.

## Keeping it current, and comparing it to reality

A survey is a snapshot. Two mechanisms keep it useful over time.

### The benchmark refreshes itself

`.github/workflows/market-survey.yml` re-runs the survey every Monday and **opens
a pull request** with the updated prices. It never commits directly, because the
matching rules are heuristic and a human has to see which product each number
came from. The workflow refuses to open a PR if the survey returned fewer than
ten observations, so a silently empty scrape cannot delete every price.

### The shop's own cost is the reality

**No public source can tell you what your shop pays.** Your price depends on your
supplier, your volume, your payment terms, and your negotiation. The only source
of truth is your own purchase invoice — and ScanGo already records it:
`ingredient.unitCostVnd` is the weighted average of your purchase lots
(ADR 0014), updated every time stock is received with a price.

`npm run market:drift` puts the two side by side:

```bash
npm run market:drift -- --tenant <tenantId>
npm run market:drift -- --tenant <tenantId> --region HN
```

```
Nguyên liệu         Giá quán trả  Giá thị trường  Lệch     Kết luận
Hành tím            90            28              +221%    CAO HƠN THỊ TRƯỜNG — nên xem lại
Cà chua             23            29              -21%     rẻ hơn thị trường
Thịt heo            103           170             -39%     rẻ hơn thị trường
Đậu hũ              5.000         —               —        khác đơn vị — không so được
Me chua             60            —               —        chưa có giá tham chiếu
```

Rules the report follows, each pinned by a test:

- **The region must match.** A Da Nang shop is not graded against a Hanoi or
  Saigon reference.
- **The base unit must match.** The shop stores `Đậu hũ` per piece while the
  listing only sells a 300g pack; comparing them once reported a **9700%
  overspend that did not exist**.
- **Archived and unpriced ingredients are skipped** — there is nothing to compare.
- **A tenant still on Seed prices is flagged as circular**, because its "actual"
  cost is the survey itself.

Neither number replaces the other. The survey cannot know your supplier; your
weighted average cannot tell you whether your supplier is competitive. **The gap
between them is the signal.**

## Replacing a surveyed price

The authoritative Cost is the shop's own purchase invoice. Put it in
`APPROVED_PRICE_OVERRIDES` in
`functions/src/scripts/market-prices/market-prices.ts`; an override always beats
the survey.

```ts
export const APPROVED_PRICE_OVERRIDES: Readonly<Record<string, number>> = {
  'seed-ing-thit-bo': 280000,
};
```

## Precedence

1. `APPROVED_PRICE_OVERRIDES` — a human decision.
2. The generated survey — the cheapest observed price, when the base unit matches.
3. The hand-written Seed fallback — used when nothing comparable was found.

`seed-data.ts` exposes `SEED_INGREDIENT_PRICE_SOURCES` so the seed prints which
source each price came from, and warns when the survey is older than 90 days.

## Adding a source or an ingredient

- **A new ingredient**: add an entry to `SURVEY_TARGETS` in
  `functions/src/scripts/market-prices/ingredient-map.ts` with its category
  slugs, search keywords, and include/exclude patterns.
- **A new seller**: add a client next to `kamereo.ts`, `winmart.ts`, or
  `coop.ts` returning the `ListingItem` shape, then register it in
  `SOURCE_FETCHERS` (and `SOURCE_SEARCHERS` if it has a search endpoint) in
  `collect.ts`.

## Scope and etiquette

The survey reads the same public endpoints the storefronts' own pages use: one
request per category page, three pages per category, one request per keyword,
spaced 1.2s apart with a bounded retry. It is a price survey, not a crawl.
