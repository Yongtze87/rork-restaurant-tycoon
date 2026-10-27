# Balance notes

How the economy was measured and tuned. Re-run the numbers whenever a balance constant changes.

## The simulator

```bash
cd web-kitchen-rush
bun tools/simulate.ts --days 56 --seed 91273 --quiet          # all three strategies, 8 real weeks
bun tools/simulate.ts --days 14 --strategy balanced            # one strategy, per-day table
bun tools/simulate.ts --days 56 --no-charms                    # never use time skips
bun tools/simulate.ts --payback --reference early|mid          # marginal value of each investment
bun tools/simulate.ts --payback --at 120 --strategy builder    # ...from a strategy's own business
```

The core lives in `src/management/sim/simulator.ts` (type-checked and linted with the app, imported only by
`tools/simulate.ts` and `src/test/balance.test.ts`, never by the app bundle). It drives a real
`RestaurantEngine` with no storage and an injected wall clock, calling `engine.update(.1)` at 1×. The
automated owner uses only public engine methods: `claim`, `unlockZone`, `unlockPlot`, `build`, `upgrade`,
`useCharm`, `buy`, `closeEarly`, `place`, `upgradeFurniture`, `hire`, `train`, `dismiss`, `sell`, `setDish`,
`expand`, `loan`, `open`, `pause`, `suspend`, `resume`.

### Time model

- **Sessions.** The owner opens the game 3 times per real day (08:00, 13:00, 20:00 UTC) and plays
  10 minutes each time at 1×, so **30 minutes of play per day**, about 9–10 service days. (`--sessions`, `--minutes`.)
- **Leaving.** The owner pauses before leaving. While away only wall-clock construction moves
  (`resume()` grants the daily gift and finishes jobs). This is the conservative model: a player who
  leaves the restaurant *open* gets every hour away replayed at 1× (≈ 400 service days per real day),
  which makes real-day pacing meaningless for that play style.
- **Dining-room changes** need the planning phase, so the owner presses *Close for renovation* in the last
  half-second of a service day when something is worth buying, makes the changes, and reopens.
  Town actions happen every 10 s of play and whenever a day ends.

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

## Results

Unlock time as **real day (hours played)**, three seeds (91273 / 5 / 77), 56 real days each.

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

## The Ocean: colonies, fame and region modifiers

```bash
bun tools/simulate.ts --days 260 --strategy balanced --colonies 4 --region all --quiet   # easiest / richest / balanced routes
bun tools/simulate.ts --days 120 --strategy balanced --colonies 2 --route "0,-1"         # a fixed route (region ids "x,y")
```

The owner founds the next colony as soon as the current one reaches the Abyss, choosing among the foundable
regions: `easiest` (lowest difficulty), `richest` (most fame) or `balanced` (most fame among the easier half).
Everything else is the same automated owner as above. The table shows **real days / hours played since that
colony was founded**; colony 1 is the Home Reef.

### Model (all in `ocean.ts`)

- **Region effects** are multipliers on arrival, patience, crew speed, tips, kelp and fish cost, and town/zone
  prices (`buildCost` scales plots, buildings, upgrades and zone prices). The biome gives one upside (a little
  stronger per star) and one or two downsides scaled by `severity(difficulty)` (0.6 at difficulty 1, +0.2 per
  level, max 1.6). Every region past the Home Reef also pays +6% build cost and −3% arrival per difficulty
  level above 1 (up to difficulty 6), except on the axis that is the biome's upside. Each multiplier is clamped
  to 0.7–1.4.
- **Difficulty**: hand-made for the first ring; generated as `0.8 + 0.6 × ring ± 0.8 + biome shift` (trench +0.5,
  sunken +0.3, lagoon −1), minimum 1, shown as 1–5 stars.
- **Fame reward** = `12 × difficulty^1.5 × biome fame` (trench ×1.4, sunken ×1.1, lagoon ×0.5, Home Reef 30). It
  is added when that colony **reaches its Abyss**, so a hard region is slow for itself and pays off for every
  colony after it.
- **Fame bonuses** approach a cap: `cap × fame / (fame + 25)` — tips +25% of each bill, building −35%,
  guests +20%, starting cash +$6,000. At 30 fame (after the Home Reef): +14% / −19% / +11% / +$3,270.

The first tuning gave fame as tips × and guest arrival × only, credited at founding. Colony 2 was **not**
faster (lagoon 27, trench 28, ice 27 real days vs 25 for the Home Reef): tips are a small share of income and
extra guests mostly met full seats, while the binding costs (level-13 upgrades, the $120k Abyss) were
untouched. Making fame a capped **building discount** plus a tip share of the bill created the sawtooth;
crediting fame at the Abyss (not at founding) made harder regions slower than easy ones again.

### Results (balanced owner, seed 91273 unless noted)

| Route | Colony 1 Home Reef | Colony 2 | Colony 3 | Colony 4 |
|---|---|---|---|---|
| easiest | reef 1 · twilight 11 · **abyss 25** (12.9 h) | Glasswater Lagoon ★1: 1 · 9 · **21** (10.1 h) | Sunburst Atoll ★2: 1 · 10 · **22** (11.0 h) | Sulphur Rise ★2: 1 · 7 · **16** (8.3 h) |
| balanced | 1 · 11 · **25** | Frostlight Shelf ★2: 2 · 10 · **22** (10.8 h) | Ember Vents ★2: 0 · 8 · **19** (9.5 h) | Sunburst Garden ★2: 1 · 10 · **20** (9.9 h) |
| richest | 1 · 11 · **25** | Bluefall Trench ★3: 1 · 10 · **22** (11.0 h) | Drowned Spires ★3: 1 · 7 · **15** (7.2 h) | Sunburst Isle ★3: 1 · 8 · **19** (9.4 h) |
| balanced, seed 5 | 1 · 12 · **27** | Frostlight Shelf: 1 · 9 · **21** | Ember Vents: 0 · 8 · **18** | Sunburst Garden: 1 · 9 · **20** |
| balanced, seed 77 | 1 · 10 · **25** | Frostlight Shelf: 1 · 10 · **21** | Ember Vents: 1 · 9 · **18** | Sunburst Garden: 1 · 10 · **20** |
| builder owner | 2 · 14 · **32** | Frostlight Shelf: 1 · 13 · **26** | Ember Vents: 1 · 11 · **23** | — |
| cautious owner | 2 · 16 · **39** | Frostlight Shelf: 1 · 17 · **43** | Ember Vents: 0 · 14 · **33** | — |

Real days since founding to the Coral Reef · Twilight · Abyss (founding the next colony happens the same day
as the Abyss). Fame totals at the start of colonies 2/3/4: easiest 30/36/58, balanced 30/64/98, richest 30/117/186.

Same fame (30), different second region (hours played to the Abyss): lagoon ★1 10.1 h · Kelpwood ★2 10.3 h ·
Frostlight ★2 10.8 h · Bluefall Trench ★3 11.0 h, against 12.9 h for the Home Reef. The trench then pays 87
fame (vs 6 for the lagoon), and the colony after it reaches its Abyss in 15 real days.

- **Sawtooth:** every colony restarts at day 1 and still takes 2–3 real weeks to its Abyss, but colony 2 is
  12–22% faster than colony 1 in comparable regions, and colonies 3–4 are 20–40% faster.
- **Route choice:** harder regions are slower for themselves (more expensive building, fewer or less patient
  guests) and pay up to 15× more fame, so the richest route is slower once and faster after.
- **Early game:** Coral Reef in the first 1–2 real days for every colony (0.2–0.8 h played after colony 2);
  starting cash rises from $1,250 to $4,520 at 30 fame, which is most of the early speed-up.
- **Solvency:** no colony went bankrupt; a few recovery loans in later colonies (0–3 per 4-colony run) when the
  bigger starting cash was spent on the town before the first service.
- **Cautious owner (open question):** its second colony in a ★2 ice shelf was *slower* (43 vs 39 days): it
  upgrades the restaurant building itself to level 13 (the dearest base price) and the shelf's slower crew
  hurts a dining-room-first player most. Its third colony is 15% faster. A future knob is a little more
  starting fame or a smaller crew-speed downside on ★2 regions.
- **Long run:** bonuses approach their caps (fame 200: tips +22%, building −31%), and regions far out reach
  difficulty 5+ with build costs up to +40%, so later colonies settle around 2–3 weeks instead of collapsing to days.
