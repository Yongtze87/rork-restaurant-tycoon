# Balance notes

How the economy was measured and tuned. Re-run the numbers whenever a balance constant changes.

## The simulator

```bash
cd web-kitchen-rush
bun tools/simulate.ts --days 56 --seed 91273 --quiet          # all three strategies, 8 real weeks
bun tools/simulate.ts --days 14 --strategy balanced            # one strategy, per-day table
bun tools/simulate.ts --days 56 --no-charms                    # never use time skips
bun tools/simulate.ts --days 56 --no-regions                   # the home town only (no claims, no branches)
bun tools/simulate.ts --days 120 --strategy balanced --region all   # easiest / richest / balanced region choice
bun tools/simulate.ts --payback --reference early|mid          # marginal value of each investment
bun tools/simulate.ts --payback --at 120 --strategy builder    # ...from a strategy's own business
```

The core lives in `src/management/sim/simulator.ts` (type-checked and linted with the app, imported only by
`tools/simulate.ts` and `src/test/balance.test.ts`, never by the app bundle). It drives a real
`RestaurantEngine` with no storage and an injected wall clock, calling `engine.update(.1)` at 1×. The
automated owner uses only public engine methods: `claim`, `unlockZone`, `claimRegion`, `unlockPlot`, `build`, `upgrade`,
`useCharm`, `buy`, `closeEarly`, `place`, `upgradeFurniture`, `hire`, `train`, `dismiss`, `sell`, `setDish`,
`expand`, `loan`, `open`, `pause`, `suspend`, `resume`.

### Time model

- **Sessions.** The owner opens the game 3 times per real day (08:00, 13:00, 20:00 UTC) and plays
  10 minutes each time at 1×, so **30 minutes of play per day**, about 9–10 service days. (`--sessions`, `--minutes`.)
- **Leaving.** The restaurant stays open (there is no pause any more), so time away is replayed on
  return: at most `OFFLINE_SERVICE_HOURS` and at most `OFFLINE_SERVICE_DAYS` (1) service day.
  `--away-hours 0` models an owner whose restaurant earns nothing while away.
- **Dining-room changes** (furniture, crew, menu) happen while open, once per service day, as owners did
  when the restaurant still closed between days. Town actions happen every 10 s of play and whenever a day ends.

### Strategies

| | Opening reserve kept | Priorities |
|---|---|---|
| `cautious` | 4 days of wages + rent | Dining room first (decor to 70 atmosphere, furniture upgrades up to restaurant level + 3), upgrades the restaurant building for level requirements, plots in reading order, never buys a builder |
| `builder` | 1.5 days | Town first: producers and gardens next to the restaurant, homes next to gardens, 3 buildings beyond each zone's requirement |
| `balanced` | 2 days | Same smart plots as `builder`, 1 extra building, furniture upgrades only when it can afford three times the price |

All three: add a table after 3+ guests found no seat in two days (a server instead if the seats were
blocked by uncleared tables), a chef/station or server after 3+ guests waited too long (whichever queue
was longer), train only when the crew is at its limit, enable every newly reached dish at its fair price,
claim milestones, save for the next zone once only its price is missing, hold arrival upgrades after a
day that lost more than 12% of guests, use a charm once at least half of it would be used, and recover
from a blocked reopening with the recovery loan, then by letting crew go and selling decor/tables.

### Targets

- Coral Reef around real day 2–4 of casual play (≈ 1–2 h played).
- Twilight Zone around week 2; Abyss around weeks 5–8.
- Nobody goes bankrupt by playing normally.
- Upgrades and buildings pay back in a reasonable number of days.
- Time skips feel useful but are not required.
- The first ocean region is claimable around the Coral Reef (real day 2–4); claims come in waves (claim, build up,
  next ring) and keep giving new goals for many weeks; branch income matters, but the flagship earns most early.

## Results

Unlock time as **real day (hours played)**, three seeds (91273 / 5 / 77), 56 real days each. These tables are
the home-town tuning pass, before regions existed (`--no-regions` reproduces them); the world model's results,
with the owner claiming regions and growing branches, are in "The Ocean: one world" below.

### Before (commit c365fd8)

| Strategy | Coral Reef | Twilight | Abyss | Profit/day d1–10 · d11–40 · d41–160 · d161+ | Reserve blocks · loans · bankrupt |
|---|---|---|---|---|---|
| cautious | 4 / 3 / 3 (1.1–1.5 h) | 14 / 15 / 16 | 34 / 36 / 35 | $525 · $739 · $1,101 · $2,352 | 0 · 0–1 · 0 |
| builder | 2 / 2 / 2 (0.65–0.83 h) | 9 / 10 / 9 | 17 / 17 / 17 | $455 · $857 · $1,384 · $2,530 | 5–13 · 3–4 · 0 |
| balanced | 2 / 2 / 2 (0.69–0.86 h) | **7 / 7 / 7** | **15 / 15 / 14** | $549 · $851 · $1,715 · $3,340 | 0–1 · 0–2 · 0 |

Problems: an engaged player (balanced/builder) reached the Twilight Zone in one week and the Abyss in
2½ weeks, then maxed every building to level 15 by about week 4 with $1M+ spent; late-game upgrades cost
a few hours of income. The Coral Reef came in under an hour. The binding requirements (from the
"requirements first met" line) were cash and the level requirement, never reputation.

### After

| Strategy | Coral Reef | Twilight | Abyss | Profit/day d1–10 · d11–40 · d41–160 · d161+ | Reserve blocks · loans · bankrupt |
|---|---|---|---|---|---|
| cautious | 3 / 3 / 4 (1.4–1.7 h) | 17 / 18 / 19 | 41 / 42 / 55 | $576 · $822 · $1,202 · $2,319 | 0–1 · 0–1 · 0 |
| builder | 2 / 2 / 2 (0.83–0.94 h) | 16 / 15 / 15 | 31 / 29 / 29 | $503 · $454 · $1,546 · $2,701 | 3–5 · 1–3 · 0 |
| balanced | 2 / 2 / 2 (0.78–0.94 h) | 13 / 13 / 12 | 26 / 27 / 25 | $571 · $863 · $1,803 · $3,173 | 0 · 0 · 0 |

- **Coral Reef:** real day 2–4, 0.8–1.7 h played. Balanced/builder sit at the fast edge of the target.
- **Twilight:** real day 12–19: week 2 for everyone, a little later for the cautious player.
- **Abyss:** a cautious player arrives in weeks 6–8; an optimising player in weeks 4. The later gate is
  the level-13 building (≈ 3 h of construction for the last level and $20–50k of upgrades) plus the
  $120k price, which is 5–7 real days of late income.
- **Solvency:** no strategy ever got stuck. The `builder` owner still hits the opening reserve 3–5 times in
  8 weeks because it spends mid-service (town purchases are allowed during service) and then cannot pay for
  ingredients; it recovers with the loan. The balanced owner's cash never went below zero.
- **Growth:** profit per day grows ~6× over 8 weeks (more guests, deeper dishes), smooth, no explosion or
  stall within the horizon. Late-game cash still outruns sinks once everything is level 15 (≈ week 6–7 for
  balanced), which is acceptable until Phase 4/5 content arrives.
- **Time skips:** with `--no-charms` every zone unlocks within a day of the charm run (balanced: Twilight
  rd 12 vs 13, Abyss rd 26 vs 26). Charms shorten waits inside a session but are not required. Players
  collect far more Current charms than early jobs need (240–310 earned in 8 weeks); jobs under 7½ minutes
  don't merit one.
- **Pearls:** 190–270 earned in 8 weeks (5 per milestone, 1 per three-challenge day), so the second builder
  (150 pearls) arrives around week 5–6 without paying.

### Payback (`--payback --reference early|mid`, 10 seeds × 10 days)

Extra cash per day from one investment against the same days without it, in a tidy reference business
(`early`: 5 tables, 2+2 crew, four level-1–2 buildings, Reef dishes; `mid`: 8 tables, 7 trained crew,
nine buildings at levels 3–6, Twilight dishes). Payback = cost ÷ gain. Noise is about ±10 $/day, and the
answer depends on the bottleneck, so read these as directions, not exact values.

| Investment | Early before → after | Mid before → after |
|---|---|---|
| Upgrade one table | 71 → 37 days | 128 → 42 days |
| Upgrade all tables | 133 → 69 days | 35 → 21 days |
| Upgrade grill / counter | never–98 → never–80 days | 106 → 82 (grill) |
| Kelp farm next to the restaurant | never (0 $/day) → 275 days | — (builder busy) |
| Fishery next to the restaurant | 76 → 90 days | — |
| Fishery +1 level | 52 → 67 days | 140 → never (60% cap reached) |
| Kelp farm +1 level | never (0 $/day) → 182 days | 233 → 610 days |
| Glow garden / garden +1 / restaurant +1 | never early (seats full); mid 53–170 → 80–191 days | |
| Sea anemone / lantern | 36–84 days; mid 3–5 days | unchanged |
| Train a server / chef | 10–21 days | unchanged |

What it shows:
- **Arrival upgrades (gardens, restaurant level) only pay when there is spare capacity.** With full seats the
  extra guests become "no free seat" misses, which also cost reputation. The simulator's owner therefore
  pauses arrival upgrades after a rough day. Not changed: it is a real decision for the player.
- **Producers were strictly dominated before:** dish costs are rounded to whole dollars, so a 4% step on a
  $7 kelp salad changed nothing (a level-1 kelp farm next to the restaurant left it at $7). At 6% per level
  most steps now move the price; kelp is still the weakest because kelp dishes are cheap.
- **Furniture upgrades** were poor value before (tables 71–133 days); a 20% cheaper curve and +3% tips per
  table level roughly halve the payback. Decor upgrades stay weak (+1 atmosphere, capped at 100).

## Constants changed

| Constant | File | Before → after | Why |
|---|---|---|---|
| `ZONES.reef.price` | `zones.ts` | $3,000 → $5,000 | Balanced/builder reached the Reef in 0.65–0.86 h; now 0.8–0.95 h (cautious 1.4–1.7 h), within real day 2–4. |
| `ZONES.twilight.price` | `zones.ts` | $9,000 → $20,000 | Twilight in week 1 (rd 7) for an engaged player; now rd 12–13. |
| `ZONES.twilight.topLevel` | `zones.ts` | 6 → 8 | Level 6 was reached by day 57–74, before the price; level 8 keeps upgrades part of the chapter. |
| `ZONES.abyss.price` | `zones.ts` | $25,000 → $120,000 | $25k was under 10 days of income when the Abyss opened (rd 14–17); now 5–7 real days of saving. |
| `ZONES.abyss.topLevel` | `zones.ts` | 11 → 13 | Level 11 was met ~2 weeks in; 13 is the main late gate (rd 25–31 engaged, 41–55 cautious). |
| `TOWN_BALANCE.upgradeExponent` (`upgradeCost`) | `town.ts` | 1.35 → 1.6 | Late upgrades were pocket change (garden L15 $5.8k at $3k+/day profit). L2 +19%, L15 +2×: more of a sink late, little change early. |
| `TOWN_BALANCE.restaurantUpgradeBase` | `town.ts` | 800 → 600 | Keeps restaurant L2–L5 about as cheap as before under the steeper curve (L2 $1,220 → $1,090); the old restaurant upgrade was the slowest payback in town. |
| `TOWN_BALANCE.producerPerLevel` | `town.ts` | 4% → 6% per level (cap 60% kept) | Producers paid back never–233 days; whole-dollar rounding swallowed 4% steps. |
| `BUILDINGS.kelpFarm.buildCost` | `town.ts` | $350 → $300 | Cheapest producer was the worst investment; its upgrades also scale from this base. |
| `BUILDINGS.fishery.buildCost` | `town.ts` | $450 → $350 | Same; the fishery is still the better producer (fish dishes cost more). |
| `FURNITURE_UPGRADES.tipPerLevel` | `types.ts` | 2% → 3% | Table upgrades paid back in 71–133 days; now 21–69. |
| `furnitureUpgradeCost` multiplier | `types.ts` | 0.5 → 0.4 | Same reason; table L2 $220 → $175. |

`TOWN_BALANCE` is new: the producer percentage was duplicated in `townEffects` and `effectText`, so it now
lives in one place (DESIGN.md: one place per system). Formula shapes are unchanged.

## Findings not changed (for follow-up)

- **Whole-dollar ingredient rounding** (`engine.dishCost`) makes small producer/tide effects invisible on
  cheap dishes. Rounding to cents would fix it but changes engine logic and money display.
- **Garden arrival bonus is uncapped** while every other town effect is capped; many high-level gardens
  can bring more guests than any dining room seats.
- **Mid-service town spending** can eat the ingredient money: chefs skip orders they can't afford, the day
  ends with a loss, and reopening is blocked. With a loan already running, the only way out is selling
  furniture or letting crew go. The capital warning covers it partly; consider warning in the Town panel too.
- **Leaving the restaurant open** replays every hour away at 1× (≈ 400 days per real day), which outpaces
  every real-time target above. The time model here assumes the owner pauses.
- **Charms pile up early** because early jobs take 1–9 minutes; they only matter from level 8+.

## Follow-up fixes (after the tuning pass)
- **Offline service is capped at 4 hours** (`OFFLINE_SERVICE_HOURS` in `engine.ts`). Leaving the restaurant open while away used to replay every hour at 1× (about 400 service days per real day), which overrode the pacing above. Construction timers still run in real time; the "While you were away" card says when the cap was reached. A longer cap is a natural future pearl-shop item.
- **Glow gardens' combined guest bonus is capped at +50%** (`TOWN_BALANCE.gardenCap`), in line with every other town effect.
- **Ingredient costs are exact to the cent** (`dishCost`), and the unpaid fraction carries between dishes (`ingredientCarry`), so cash stays in whole dollars while every discount counts.
- **Town purchases during service keep tonight's wages, rent and loan repayment** in the register (`reserveError` in `engine.ts`).

## The Ocean: one world, regions and branches

```bash
bun tools/simulate.ts --days 56 --seed 91273 --quiet                         # all strategies, with regions
bun tools/simulate.ts --days 120 --strategy balanced --quiet                 # 17 real weeks: claims, branch levels, fame
bun tools/simulate.ts --days 56 --strategy balanced --region all --quiet     # easiest / richest / balanced region choice
bun tools/simulate.ts --days 56 --strategy balanced --route "0,1;-1,1"       # a fixed claim order (region ids "x,y")
bun tools/simulate.ts --days 56 --strategy balanced --no-regions --quiet     # the home town only, for comparison
```

### Model

- **Geometry** (`world.ts`): one plot grid. The 9×9 home town is region (0, 0); every other region is the inner
  **7×7** of a 9×9 cell, so a one-plot seabed path runs between regions and the world stays a regular grid. 49 plots
  hold a branch and a specialised cluster of 10–20 buildings without becoming a grind, read as one block when zoomed
  out, and keep a developed world cheap: the renderer only walks the region cells on screen (at most 24×24).
- **Claiming** (`ocean.ts`): a region next to a claimed one (8 directions, the Home Reef counts) can be claimed,
  gated by the home town's depth zones: ring 1 after the **Coral Reef**, ring 2 after the **Twilight Zone**, ring 3+
  after the **Abyss**. Price = `2,500 × difficulty^1.2 × 2.2^(ring − 1) × 1.25^(regions already claimed)`, to $100,
  then the fame building discount. First ring with nothing claimed yet: lagoon $2,500 · kelp/atoll $4,100 ·
  ice/vents $5,700 · sunken city/Cinderfield $7,500 · trench $9,300. Claiming adds the 49 plots, the middle one owned.
- **Region plots** unlock next to owned plots, priced per region: `300 × (1 + 0.35 × (owned − 1))^1.6 × (1 + 0.6 × (ring − 1))`
  × the region's build cost × the fame discount ($260–$390 for the first plot in ring 1, about $29k for the last at
  neutral cost). Home plots keep their own curve.
- **Specialisation** applies only to plots and buildings in that region (upsides +10% per star; downsides scale with
  difficulty, 0.6 + 0.2 per level). Further out, building costs +6% and branches earn +8% per difficulty level, never
  cancelling the biome's own upside or downside. Town-wide caps (producers 60%, gardens +50%, workshops 45%) still
  apply to the sum.

| Biome | Upside (1★) | Downside (difficulty 1) | Good for |
|---|---|---|---|
| Kelp forest | kelp farms +50% | building time +12% | kelp farms |
| Volcanic vents | fisheries +50% | building cost +10% | fisheries |
| Coral atoll | glow gardens +50% | building cost +12% | glow gardens |
| Sunken city | workshops +50%, building −15% | branch income −15% | workshops, cheap building |
| Ice shelf | branch income +25% | building time +15% | a branch |
| Open trench | branch income +45%, fame ×1.4 | building cost +15%, time +10% | the richest branch |
| Calm lagoon | building cost −12%, time −12% | branch income −15%, fame ×0.5 | an easy, cheap start |

- **Branch restaurants** (`town.ts`): building kind `branch`, one per non-home region, build $1,200 / 4 min, upgrades
  on the normal curve (L6 $12.7k, L11 $33k, L15 $55k before region and fame). Income at every closing:
  `30 × level × region branch income × (1 + fame branch bonus)`, to the dollar (L1 $30, L6 $180, L11 $330, L15 $450
  before modifiers; the level-12 Frostlight branch in the screenshots earns $560). Paid in `finish()`, so offline
  replay is identical; recorded as `branch` on the receipt and counted in profit. Producers and gardens next to a
  branch get the same +50% neighbour bonus as next to the restaurant.
- **Fame** (permanent; `mastery` keys stop double payment): a region's mastery fame `10 × difficulty^1.5 × biome fame`
  is paid 30% on claiming, 30% when its branch reaches level 6, 25% at level 11 and 15% when every plot is owned;
  reaching the Abyss at home pays 30. Bonuses approach their caps as `cap × fame / (fame + 60)`: tips +15% of each
  bill, building and claims −25%, guests +12%, branch income +25%.

### The automated owner and regions

Claims come in waves: the owner claims the next region only when **every branch has reached the wave level**
(balanced 6, builder 4, cautious 7), the depth gate is open, and either it is the first claim, the home town has no
zone left, or a pause has passed since the last claim (balanced 4 real days, builder 3, cautious 7; sooner only if
the price is under 30% of spare cash). It saves for a claim only while the price is under about four real days of
profit, and a zone whose other requirements are met always comes first. In each region it builds the branch on the
middle plot, then (from branch level 2) the biome's specialised building next to it (balanced 2, builder 3, cautious 1).
Branch upgrades join the normal upgrade queue, ranked by price per extra dollar a day; a branch below the wave level
and three levels behind the home town's leader gets the builder first. Region choice: `easiest` (lowest difficulty),
`richest` (most fame) or `balanced` (most fame among the easier half), among regions whose depth gate is open.

### Results (56 real days, seeds 91273 / 5 / 77)

| Strategy | Coral Reef | Twilight | Abyss | Claims by real day (seed 91273) | Regions | Branch share of profit d41–160 · d161–320 · d321+ | Blocks · loans · bankrupt |
|---|---|---|---|---|---|---|---|
| cautious | 3 / 3 / 4 | 19 / 19 / 20 | 48 / 51 / >56 | 4, 26, 33, 40, 50 | 5 / 5 / 4 | 8–9% · 14–18% · 30–33% | 0 · 0 · 0 |
| builder | 3 / 2 / 2 | 18 / 20 / 18 | 33 / 35 / 35 | 3, 12, 15, 19, 23, 27, 36, 43, 50 | 9 / 10 / 9 | 12–13% · 29–30% · 32–35% | 0–1 · 1 · 0 |
| balanced | 2 / 2 / 2 | 14 / 13 / 13 | 31 / 29 / 29 | 3, 16, 20, 24, 33, 48, 50, 53 | 8 / 9 / 9 | 11–12% · 29–30% · 33–34% | 0 · 0 · 0 |

Balanced owner, seed 91273, profit per day incl. challenges: d1–10 $569 · d11–40 $889 · d41–160 $1,763 · d161+ $3,867
(home town only, `--no-regions`: $569 · $873 · $1,612 · $2,735, Twilight rd 12, Abyss rd 26). Branch income per day:
d1–40 $17 (2%) · d41–160 $200 (11%) · d161–320 $890 (30%) · d321+ $1,518 (33%). Fame after 8 weeks: 198–220.

- **First region:** claimed on real day 3–5 (balanced and builder rd 3, 1.2 h played; cautious rd 4–5), right after
  the Coral Reef. Its branch opens the same day.
- **Waves, not a line:** each owner claims a ring-1 region and builds it up, claims a burst of ring-2 regions after
  the Twilight Zone (balanced rd 16–24), works towards the Abyss, then reaches ring 3 (balanced rd 33) and fills in
  cheaper gaps (rd 48–53). Prices jump with each ring and each claim: $5.7k → $6.8k → $20k → $27k → $68k (ring 3), then
  $19k–$58k for the nearer gaps and $167k for the next ring-3 region (rd 58 in the long run).
- **The flagship stays the main earner early:** branches are 2% of profit in the first 40 service days, ~11% up to
  service day 160 (real weeks 2–3), ~30% in weeks 3–5 and about a third by week 8.
- **Depth zones** come a little later than in the home-town-only tuning because money goes to regions: balanced
  Twilight rd 13–14 (was 12–13), Abyss rd 29–31 (was 25–27); builder Abyss rd 33–35; cautious Abyss rd 48–51, one
  seed (77) just past week 8. Within or at the edge of the targets.
- **Solvency:** no bankrupt days; the builder still takes one recovery loan, as before.
- **Time skips:** with `--no-charms` the balanced owner reaches the Abyss on rd 30 (31 with charms): useful, never required.

Region choice (balanced owner, seed 91273):

| Route | Regions by rd 56 | Fame | Abyss | Branch share d161–320 · d321+ |
|---|---|---|---|---|
| easiest (lagoon first) | 6, first on rd 2 ($2,500) | 73 | rd 31 | 26% · 26% |
| richest (trench first) | 5, first on rd 3 ($9,300) | 208 | rd 27 | 25% · 27% |
| balanced (ice shelf first) | 8, first on rd 3 ($5,700) | 198 | rd 31 | 30% · 33% |

Easy regions are cheap and quick but pay little fame and modest branches; the trench-and-ruins route costs more per
claim, pays almost 3× the fame, and its cheap building (sunken cities) brings the Abyss four days sooner.

Long run (balanced, 120 real days, 59 h played): 15 regions, claimed on rd 3, 16, 20, 24, 33, 48, 50, 53, 58, 64, 65,
69, 100, 103, 108 (the late ones $230k–$340k, several real days of saving each); the first level-11 branches on rd
89–92; fame 438. Branch share of profit grows to 39% (service days 321–640) and 59% after service day 640 (about real
week 10 on), with 15 branches at levels 10–15. New goals keep coming for the whole run: a claim every one to two
weeks, branch levels 11–15, full regions and fame milestones.

### Tuning notes

- First pass (claim base $4,000 with +12% per claim, branch `45 × level^1.2`, fame branch cap 40%): the first claim
  waited until rd 15–19 because the owner spent every spare dollar at home; once claims started, 20 regions were taken
  by rd 56, branches made 70–86% of late profit and the Abyss slipped out of reach.
- Claim base $4,000 → **$2,500** (ring 1 affordable right after the Reef); growth per claim +12% linear → **×1.25
  compounding** (claims stay goals instead of a flood); ring factor 2.6 → **2.2**.
- Branch income `45 × level^1.2` → **`30 × level`**, build cost $1,500 → **$1,200**, fame branch cap 40% → **25%**: late
  branch share from 69–86% to a third at week 8 (59% from week 10).
- Regions whose downside is lower branch income (sunken city, lagoon) no longer get the per-difficulty income bonus,
  so the downside stays visible far out.

### Open questions

- **Late game:** after about 10 real weeks branches out-earn the flagship (59%). Fine as a long-term reward, but a
  gentler branch curve at levels 11–15 or a per-branch upkeep are the knobs if the flagship should stay ahead.
- **Cautious owner:** its Abyss lands on rd 48–51 (one seed past week 8). It upgrades the restaurant building itself
  and claims rarely; a longer pause between claims would pull it back.
- **Names:** generated names never repeat a first-ring name, but two far regions can share one (e.g. two "Glacier
  Ledge"); the panel shows the biome and stars next to each name.

## Always open (no more closing between days)

The restaurant no longer closes: furniture, crew and menu change while guests are in, and there is no pause or
speed control. Without a pause, every player now gets service replayed while away, so the offline cap matters a lot:

| offline cap (3 sessions a day) | balanced Coral Reef | Twilight | Abyss |
|---|---|---|---|
| no offline service (old model, owner paused) | real day 2 | 14 | 31 |
| 4 hours | 1 | 3 | 5 |
| 1 hour | 1 | 4 | 6 |
| 2 service days | 2 | 9 | 19 |
| **1 service day (chosen)** | **2** | **12** | **28** |

With one service day while away (8 weeks, all owners): cautious reaches the Abyss on real day 52, builder on 31,
balanced on 28; no bankrupt days. A short register at closing no longer closes the restaurant: the bank covers the
bills and the shortfall is added to the loan (repaid $30 a day). Ingredients are bought on credit, so a broke
restaurant can always cook its way out.

A longer offline shift (“night manager”) is an obvious premium item; it would speed players up roughly as the
table shows, so price it with that in mind.

## Real calendar days

Day numbers are gone for the player. Challenges, the tide and the daily gift now reset once per **real** day (local
midnight) instead of every 2½-minute shift. Before, an active player could finish a board every few minutes and
collect a pearl and a Current charm each time; now that happens at most once a day.

Challenge goals are sized for about four shifts (`DAY_GOAL = 4`) and pay four times the old rewards
(`DAY_REWARD = 4`, about $780 a day for all three plus the pearl and charm). With `DAY_REWARD = 3` the balanced owner
reached the Coral Reef a day later; with 4 the pacing is back on target (8 weeks, 3 sessions a day, restaurant open
while away):

| owner | Coral Reef | Twilight | Abyss |
|---|---|---|---|
| balanced | real day 2 | 12 | 26 |
| builder | 3 | 17 | 34 |
| cautious | 5 | 18 | 40 |

The simulator's rows and "svc day" columns still count shifts.

## Seasons replace the cost tides

Plankton bloom and Shoal run no longer roll; kelp and fish have seasons instead (2–3 days, hidden price stretch
+5–35%, ×2 demand). The simulated owner keeps suggested prices, so this measures the floor, not a player who prices
well: balanced Coral Reef real day 2, Twilight 12, Abyss 28; builder 3 / 17 / 30; cautious 5 / 17 / 38. A player
who finds a good in-season price earns somewhat more than this.

## Town on tiles (roads and building sizes)

Roads cost $10 a tile; a plot's streets are 7 tiles ($70). The simulated owners lay a plot's streets when they unlock it and
place each building on a spot a road already joins to the restaurant. 56-day runs, real day reached (before → after):

| Owner | Coral Reef | Twilight | Abyss |
|---|---|---|---|
| balanced | 2 → 2 | 12 → 13 | 28 → 25 |
| builder | 3 → 2 | 17 → 16 | 30 → 28 |
| cautious | 5 → 4 | 17 → 18 | 38 → 46 |

"Near" (touching or one tile apart) reaches up to 8 plots around the restaurant instead of 4, so the hub bonus is easier to
get; producer and garden caps still hold. The cautious owner's slower Abyss comes from its plain (non-adjacency) building
order on smaller footprints; worth a look if it matters.
