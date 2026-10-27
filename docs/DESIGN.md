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

## The Ocean: colonies and endless expansion
The Abyss ends a **chapter**, not the game. After reaching the Abyss the player can **found a new colony** in another region of an endless Ocean map.
- **Ocean map.** Regions on a grid around the Home Reef, expanding in every direction. Only regions next to explored ones can be colonised, so routes branch. The first ring is hand-designed; everything beyond is generated deterministically from the region's coordinates, so the map never runs out. Hand-made landmark regions can be added in updates.
- **Biomes.** Kelp forest, volcanic vents, ice shelf, coral atoll, sunken city, open trench (more later). Each biome has a look (water and ground palette, decor) and modifiers.
- **Difficulty is not a straight line.**
  1. *Sawtooth across colonies:* each colony restarts, but permanent fame makes the early game faster; difficulty then ramps to that colony's Abyss.
  2. *Route choice:* every region mixes upsides and downsides (e.g. ice shelf: slower crew, guests pay more; volcanic vents: cheaper fish, impatient guests; calm lagoon: easy and lower rewards). Distance raises difficulty on average, but there are always easier and harder neighbours.
  3. *Rewards grow faster than difficulty* so moving outward always feels worth it.
- **Kept on founding:** pearls, charms, extra builders, collections (claims and counters), tutorial state, fame. **Reset:** cash, restaurant layout and staff, town, zones, history.
- **Fame** is permanent and earned per founded colony (more for harder regions); it grants clear, capped bonuses (for example tips, starting cash, guest arrival) shown before founding.
- **Where it lives:** `ocean.ts` (regions, biomes, palettes, fame, the save record), `RestaurantEngine.colonyEffects` / `foundColony`, `OceanMap.tsx`. Numbers and simulator results: `docs/BALANCE.md`.
