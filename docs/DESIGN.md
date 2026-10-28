# Vast Ocean: Mareen Tales — design notes

The working agreement for anyone (human or agent) adding to the game.

## Pillars
1. **The town is the progression.** Players stay because their choices make their reef different: which plots, which buildings, where.
2. **Few new looks, many levels.** Anything upgradable has at most 3 looks (levels 1–5, 6–10, 11–15). Levels in between change numbers and small code-drawn touches only.
3. **Depth zones are chapters.** Shallows → Coral Reef → Twilight → Abyss. New zones carry most of the new content and art.
4. **Every day feels a little different.** Daily challenges, daily tides, the evening glow.
5. **Fair monetization.** Pearls buy time and convenience, never power that can't be earned by playing. Real-money packs stay non-purchasable until a store/payment provider is chosen.

## Hard rules
- **The simulation owns all numbers.** `RestaurantEngine` changes state; UI and rendering only read it. Never show a number the simulation didn't produce.
- **Determinism.** Restaurant randomness comes from the engine's seeded RNG (`this.random()`) or a pure hash of saved values (see `daily-challenges.ts`). Offline replay must equal live 1× play (`continuous-days.test.ts`).
- **Wall-clock things** (construction) use `this.now()` and are ticked during offline replay by simulated wall time.
- **Saves.** One versioned save (`vast-ocean-restaurant-v1`) validated by Zod. New fields get a `.default(...)` so existing saves still load. Never make an existing save fail to load.
- **Art.** Every drawable has a slot in `iso/sprites.ts`. Without `src`, a code-drawn placeholder is used. Keep placeholders simple; real art arrives later as sprite sheets (`tools/slice-sheet.ts`).
- **Balance numbers live in one place per system** (`types.ts` catalog/dishes, `town.ts`), never scattered.

## Code conventions
- TypeScript/TSX only. Match the existing dense style: short helpers, comments only for intent or non-obvious rules.
- Tailwind with the theme tokens: `paper` (panel surface), `ink` (text), `teal` (glow accent), `violet`, `tomato` (main action), `danger` (warnings/errors), `gold` (money), `abyss` (text on bright fills). Fonts: `font-display` (Baloo 2), `font-body` (Quicksand).
- Touch targets ≥ 44 px; layouts must work at 320 px wide; respect `prefers-reduced-motion`.
- Player-facing text: plain, short, active voice.

## Checks before committing
Run from `web-kitchen-rush/`:
```bash
bunx tsc -p tsconfig.app.json --noEmit
bun run lint            # 0 errors
bunx vitest run         # unit tests
bun run build
```
Browser tests: `bunx vitest run --config vitest.browser.config.ts`. In the cloud sandbox Chromium lives at `/opt/pw-browsers/chromium`; use a temporary copy of the config with `playwright({ launchOptions: { executablePath: '/opt/pw-browsers/chromium' } })`, and delete it (plus `.vitest-attachments`, `src/test/__screenshots__`) afterwards.

## The Ocean: one ever-growing world
There is **no separate map screen and no restart**. The Town view *is* the world: the Home Reef town in the middle, the neighbouring ocean regions drawn as real seabed around it in the same isometric scene, and fog beyond. The player drags and zooms across all of it.
- **Regions.** The world is an endless grid of regions around the Home Reef. Each region is a block of plots with a biome (kelp forest, volcanic vents, ice shelf, coral atoll, sunken city, open trench, calm lagoon) generated deterministically from its coordinates; the first ring is hand-designed. Regions next to claimed ones can be **claimed** in the scene; then their plots are unlocked and built on in place, like the home town. Everything built stays forever.
- **Regions specialise.** A region's biome makes certain buildings placed in it stronger (e.g. kelp farms in a kelp forest, fisheries in volcanic vents, gardens on a coral atoll, branch tips in an ice shelf) and applies its downsides inside that region (e.g. dearer or slower building). Where you build matters.
- **Branch restaurants.** One per non-home region: a building visible in the scene, levels 1–15 with 3 looks. Each branch earns automatically every service day from its level and its region (deterministic, included in offline replay and daily receipts). The Home Reef restaurant remains the one the player runs in detail.
- **Difficulty is not a straight line.** Regions further out cost more to claim and have tougher downsides on average, but every ring offers easier and harder choices (calm lagoons are easy and modest; trenches are hard and lucrative). Rewards grow faster than difficulty.
- **Fame** is permanent and earned by **mastering regions** (claiming them and reaching milestones in them, e.g. a branch at level 6 / 11). It grants the clear, capped bonuses (tips, cheaper building, more guests) shown in the region panel. Nothing ever resets.
- **Depth zones** (Shallows → Coral Reef → Twilight → Abyss) stay the home town's chapters and dish unlocks; reaching them also gates how far out regions can be claimed.
- **Where it lives:** `world.ts` (the plot grid: the 9×9 home town is region (0, 0); every other region is the inner 7×7 of a 9×9 cell, with a one-plot seabed path around it), `ocean.ts` (regions, biomes, specialisation, claim prices and gates, fame and mastery, palettes, the save record and the colony-build migration), `town.ts` (plots across the world, buildings including `branch`, region boosts in `townEffects`, branch income), the world renderer (`iso/town-render.ts`, culled to the screen) and `TownScene.tsx`, the Town panel's Regions section and region details (`TownPanel.tsx`), engine methods `claimRegion`, `claimError`, `claimPrice`, `branchIncomeAt`, `branchTotal` and the per-plot prices (`plotPrice`, `buildPrice`, `upgradePrice`, `jobSeconds` take the plot). Branch income is paid in `finish()` and recorded as `branch` on each receipt. Numbers and simulator results: `docs/BALANCE.md`.

## Town layout: tiles, roads and building sizes

- **Plots are land, tiles are where things stand.** Every plot is 4×4 tiles. Unlocking a plot buys its land; buildings and roads sit on its tiles.
- **Buildings come in different sizes.** Restaurant and branch 3×3, kelp farm and fishery 3×2, workshop 2×3, homes 2×2, glow garden 2×1. Any of them can be turned (width and depth swap). A building may cross into a neighbouring owned plot.
- **Roads are required.** A building needs a road along one side to be placed, and it only works (counts for effects) while a chain of roads joins it to the restaurant, or to its region's branch. Roads are 1 tile, $10 each (region build cost applies), built instantly with no builder, and lifted for free. "Lay this plot's streets" lays its last row and column (7 tiles) in one tap; neighbouring plots' streets join up into a grid.
- **Nearness replaces neighbour plots.** Producers and gardens get the hub bonus when they are near the restaurant or a branch, and gardens speed up crew when near homes. "Near" means touching, or one tile apart (for example across a road).
- **Moving is free.** Buildings can be moved or turned at any time, keeping their level and timer. Placement works like furniture: a ghost on the map, teal when it fits and red when it doesn't, with the reason in the card.
- **Old saves.** Each plot's building moves to its plot's corner tile, and every owned plot gets its streets, so old towns keep working.
- **Where it lives:** `town.ts` (tiles, footprints, `placementError`, `roadError`, `siteIn`, the road `network`, `connected`, `townEffects`, the save migration), `town-draft.ts` (placing from the card), engine methods `build(kind, x, z, turned)`, `moveBuilding`, `placeRoad`, `removeRoad`, `layStreets`, `streetsFor`, `placeError`, and `upgrade`, `useCharm` and `finishNow` by building id. The renderer draws in plot units; tile `t` spans `t / 4 − 0.5` to `(t + 1) / 4 − 0.5`.

## Screens and time

- **Always open.** After the first opening the restaurant never closes and there is no pause or speed control. Every change (furniture, crew, menu, town) works while guests are in; nothing is locked: moving a table takes its seated guests along and moving a station takes its cook (`followMove`); selling a table sends its unpaid guests away (counted as missed) and selling a station restarts the dishes it was making (`clearFor`). Everyone re-routes after a layout change (`reroute`). Only a busy crew member can't be dismissed. Work runs in shifts (`state.day` counts them, `DAY_LENGTH` each): wages, rent, loan repayment and branch income are settled per shift. Offline, the crew works at most `OFFLINE_SERVICE_DAYS` shifts.
- **Real calendar days.** The player never sees a day number. `calendar.ts` and `state.calendar` follow the local date: at local midnight (`rollCalendar`, run from `tickTown`) the day is archived into `state.days` (last 30, shown in the Ledger and the 7-day chart), a new tide is rolled and a fresh challenge board is created. A clock set back changes nothing. Challenges are sized for about four shifts of play (`DAY_GOAL`, `DAY_REWARD`).
- **Money safety.** Purchases go through `guardSpend` (`spend-guard.ts`), which asks first when a purchase would leave less than tonight's bills plus $30 of ingredients. A short register at the end of a shift is covered by the bank and added to the loan.
- **East grotto.** `expand()` opens columns `GROTTO_X`–`GROTTO_END` (`types.ts`), drawn as a cave behind a purely visual rock arch (`render.ts`). Only there can VIP `booth`s stand (`layoutError`); their guests pay `BOOTH.price` × the menu price plus `BOOTH.tip` extra tip, and booths fill before tables. `isSeating` lists the kinds that seat guests.
- **Menus.** Team, Menu, Ledger and the Town overview open in a `GameWindow` (full screen on phones, a centred card on larger screens), with tabs where there is more than one view. Build is a strip of items along the bottom, today's challenges and tide sit in a small chip over the scene that unfolds on tap, a one-time “Welcome back” popup sums up time away, and Town shows a small action card for the tapped plot or region, so the scene stays in view while you place or choose. Keep cards to a title, numbers and at most one short line; longer explanations go behind an `Info` (ⓘ) button.

## Seasons and pricing

- **Seasons follow ingredient groups**, not dishes: `INGREDIENTS` in `types.ts` lists the groups (each with its season name), and a dish joins one through `ingredient`. Add a group there and it gets a season; add a dish with an existing `ingredient` and it joins that season. Optional per-dish `appeal` (how often it is picked) and `stretch` (how far its price can go in season) default to 1.
- `state.season` rolls in `startSeason` (every 2–3 real days, from a hash of the seed and calendar day, so offline replay and reloads give the same result). `season.stretch` is hidden from the player: the UI shows only "demand looks strong/mild", sold and walked-away counts, and guest reactions (a green or red $ on the meter).
- `fairPrice(dish)` is what guests expect today; `demand(dish)` weights the order pick; price above `fairPrice` turns some guests away, at or below 90% of it makes them a bargain (tips ×1.25), above it pricey (tips ×0.75).
- Prices that change on more than `PRICE_CHANGES_PER_DAY` shifts a day cost 0.05 reputation per extra change (`finish`). Auto price changes don't count, and any manual price change turns auto price off.

## Screens on phones held sideways and zoom

- `short` (Tailwind screen in `tailwind.config.ts`: landscape and at most 520px tall) turns the bottom dock into a left rail, floats the header over the scene and opens Build, the Town card and the furniture panel as a 320px side panel, so the scene keeps the full height.
- Zoom goes to 4× (restaurant) and 3× (town) with the buttons, two-finger pinch and the mouse wheel; scenes zoom through `ZoomContext` (`iso/zoom-context.ts`), handled in `usePanTap`.
