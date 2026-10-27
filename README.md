# Vast Ocean: Mareen Tales

A cozy 2.5D restaurant tycoon set beneath a vast ocean. Build a reef restaurant on an isometric grid, hire a crew of **Mareen** (a human tribe with small fin-like ears), set your menu and prices, and watch guests arrive, order, eat, tip and leave. Then reinvest the profit, one service day at a time.

Built with **React 19**, **TypeScript**, **Vite** and a 2D canvas isometric renderer. No backend, no accounts. All progress is saved locally in the browser.

> Every number in the game comes from a deterministic simulation: revenue, tips, wages, guest counts, ratings and offline earnings. The game never shows estimated or made-up figures.

> **Status:** Phases 1–3 of 5 are done (2.5D engine, reef town, and progression: furniture upgrades, daily tides, evening glow, depth zones and an eight-dish menu). Most art is still drawn with code shapes until the generated images arrive in Phase 4. See [Roadmap](#roadmap).

---

## Features

### Build and decorate
- **Isometric grid construction** on a 10×10 reef floor, expandable to 14×10 with the east grotto.
- **Interiors shop** with Dining, Decor and Kitchen categories: coral tables with shell seats, kelp counters, vent grills, sea anemones, kelp screens and glow-jelly lanterns.
- **Preview before you buy:** a ghost placement with a teal/red footprint, gold alignment guides, a column/row readout and aisle validation. You only pay when you press **Confirm**.
- Moving furniture is free. Selling refunds 70% of the price.
- **Pathfinding validation:** a layout is rejected if any guest or crew route gets blocked.

### An autonomous restaurant
- The crew and guests pathfind on their own. **Chefs** prepare kelp salads at kelp counters and sear fish cakes at vent grills. **Servers** deliver food and clear tables.
- Guests are Mareen in four looks (coral, pearl, lagoon, dusk).
- **Satisfaction meters** above every guest are driven by each guest's actual patience timer.
- Pause plus 1×, 2× and 3× speed.

### Run the business
- **Team:** hire chefs or servers (up to 6). Training makes them faster and raises their daily wage.
- **Menu:** toggle dishes and set prices. Charging more than the fair price drives some guests away.
- **Continuous days:** service rolls into the next day automatically, and each day saves an immutable receipt.
- **Ledger:** a weekly revenue chart, growth against the previous week, and the last 20 daily receipts.
- **Daily tides:** each service day rolls an ocean event (calm waters, feast tide, strong current, whale passing, plankton bloom, shoal run, murky water) that nudges guest arrivals, crew pace, tips, ingredient costs or patience. Day 1 is always calm; the tide is recorded on each receipt.
- **Daily challenges**, **milestones**, an interest-free **recovery loan** and a **low-capital warning** with one-click **Close for renovation**.

### Offline progress you can trust
- When you return, the game **replays the elapsed time at 1× through the same simulation step**, with checkpoints.
- An explicit pause, renovation or too little startup cash stops offline work.

### Reef town
- A 9×9 map of plots around the restaurant. Unlock neighbouring plots and choose what to build:
  - **Kelp farm** and **fishery**: cheaper kelp or fish dishes (50% stronger next to the restaurant)
  - **Mareen homes**: more crew slots
  - **Glow garden**: guests arrive more often; crew work faster next to homes
  - **Workshop**: all construction finishes faster
- Buildings and the restaurant level up to 15, with a new look at levels 6 and 11.
- Construction runs in real time, including while you are away: about a minute at first, hours at the top levels. One builder works at a time.
- **Time skips:** Current charms (−15 min) and Tide charms (−1 h), earned from a daily gift, all three daily challenges and milestones. **Pearls** finish a job instantly and buy a second builder.
- **Depth zones** are the long-term chapters. The middle 5×5 is the **Sunlit Shallows**; the next ring is the **Coral Reef**, the outer ring the **Twilight Zone**, and the dark drop-off around the town is the **Abyss**. Each zone needs reputation, buildings and cash (Coral Reef: 3.8★, 4 buildings, $3,000 · Twilight: 4.2★, 8 buildings, one at level 6, $9,000 · Abyss: 4.6★, 12 buildings, one at level 11, $25,000). Each zone opens two dishes and draws guests 5% more often; the Reef and Twilight also open their ring of plots.
- The pearl shop lists real-money packs, but they can't be bought until a store and payment provider are chosen.

### Underwater atmosphere
- Sun shafts from the surface, drifting caustics on the floor, rising bubbles, marine snow and distant fish schools.
- Swaying kelp and anemones, a glowing jelly lantern, and a vent grill that glows while a chef cooks.
- **Evening glow:** the reef darkens from 19:00 to 21:30 in both views; lanterns, the vent grill, glow gardens and top-tier buildings shine brighter, and bioluminescent plankton drifts by. Visual only.
- Everything ambient respects `prefers-reduced-motion`.

---

## How to play

1. **Make it yours:** open **Build → Interiors**, buy tables, anemones, lanterns or kelp screens, and snap them onto the grid.
2. **Set up your crew and menu:** you need a kelp counter for kelp salads and a vent grill for fish cakes.
3. **Open the restaurant.** Your crew takes it from there. Each day lasts about 2½ minutes at 1×.
4. **Read the receipt** from the business-updates card or the **Ledger**.
5. **Reinvest:** use **Build → Close for renovation** to change furniture, crew or menu.

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Place or move furniture | Tap a grid cell | Arrow keys |
| Rotate placement | Rotate button | `R` |
| Cancel / close panel | ✕ button | `Esc` |
| Pause / resume service | Pause button | `Space` |
| Look around | Drag the reef; zoom and reset buttons | — |

---

## Quick start

Requires [Bun](https://bun.sh) 1.1 or newer.

```bash
cd web-kitchen-rush
bun install
bun run dev        # http://localhost:8080
bun run build      # static site in web-kitchen-rush/dist
```

The output is a static site for any static host. Configure the host to serve `index.html` for unknown paths.

| Command | Description |
|---|---|
| `bun run dev` | Vite dev server on port 8080 |
| `bun run build` / `bun run preview` | Production build / preview |
| `bun run lint` | ESLint |
| `bun run test` | Unit tests, then browser tests (first run: `bunx playwright install chromium`) |
| `bunx tsc -p tsconfig.app.json --noEmit` | Type check |

---

## Project structure

```text
web-kitchen-rush/
├── src/
│   ├── management/          # The game
│   │   ├── engine.ts        # Deterministic simulation: economy, jobs, days, offline replay, saves
│   │   ├── types.ts         # Zod save schema, catalog, dishes, constants
│   │   ├── layout.ts        # Grid placement rules and pathfinding
│   │   ├── ManagementGame.tsx  # Owner UI shell: header, dock, panels, dialogs
│   │   ├── RestaurantScene.tsx # Canvas host: game loop, taps, drag-to-look, labels
│   │   └── iso/
│   │       ├── projection.ts   # Isometric math, fitting, depth order, sprite facing
│   │       ├── render.ts       # Draws one frame from the simulation state
│   │       ├── sprites.ts      # Art slots for generated images
│   │       ├── placeholders.ts # Code-drawn stand-in art used until images exist
│   │       └── ambience.ts     # Bubbles, motes and fish (visual only)
│   ├── components/ui/       # shadcn/ui primitives
│   └── test/                # Vitest unit (*.test.ts) and browser (*.browser.test.tsx) suites
```

---

## Architecture

- **The simulation is the single source of truth.** `RestaurantEngine` advances in fixed 0.1-second steps with a seeded RNG. Rendering never changes outcomes, and the tests prove offline replay matches live play.
- **Persistence:** a versioned save under `localStorage["vast-ocean-restaurant-v1"]`, validated with Zod on load.
- **Rendering:** a 2D canvas draws the reef with a 2:1 isometric projection (one tile is 64×32 art pixels). Objects are depth-sorted every frame, and agents are smoothed between simulation steps. Characters have a front and a back view, mirrored to cover four directions. Motion such as bobbing and swaying is done in code.
- **Art slots:** every drawable has a slot in `iso/sprites.ts` with a size and anchor. A slot with no image falls back to a placeholder, so art can be added one image at a time.

---

## Adding art

Art is generated as sprite sheets: several objects on one image, on a flat pure green, magenta or blue background, with gaps between them.

```bash
bun tools/slice-sheet.ts sheet.jpg cut/ table-1,table-2,table-3           # cut objects out, in reading order; writes cut/_preview.png
bun tools/prepare-sprites.ts cut/ public/art/furniture 84 table-1,table-2,table-3   # resize to game size, print slot sizes
```

Copy the printed sizes into `src/management/iso/sprites.ts` with each image's `src`.

---

## Game rules and economy

| Item | Value |
|---|---|
| Starting cash | $1,250 |
| Day length | 150 s of service, plus time to finish remaining guests (up to 90 s) |
| Rent | $30/day ($50 once expanded) |
| Wages | Chef $34, server $26, +$12 per training level |
| Hire | $150 (max 6 crew; at least 1 chef and 1 server) |
| Training | $180 × current level (max level 3) |
| Kelp salad | $7 ingredients, fair price $24, 6 s, needs a kelp counter |
| Vent-seared fish cake | $12 ingredients, fair price $38, 10 s, needs a vent grill |
| Coral Reef dishes | Sea-grape sushi ($14 / $44 / 8 s, counter) · Grilled reef lobster ($20 / $58 / 12 s, grill) |
| Twilight dishes | Moon-jelly salad ($18 / $56 / 10 s, counter) · Glow-squid skewers ($26 / $72 / 14 s, grill) |
| Abyss dishes | Vent pearl dumplings ($28 / $84 / 13 s, counter) · Abyssal ink noodles ($36 / $100 / 17 s, grill) |
| Furniture | Table $180 · Kelp counter $240 · Vent grill $360 · Anemone $65 · Kelp screen $80 · Lantern $110 |
| East grotto | $900, unlocks after 3 service days |
| Recovery loan | $600 at 0% when cash < $200, repaid at $30 per day |

---

## Roadmap

1. ✅ **2.5D engine** with placeholder art and the underwater theme.
2. ✅ **An underwater town:** plots, building choices, neighbour bonuses, real-time construction and time skips.
3. ✅ **Progression:** furniture upgrade tiers, daily tides, the evening glow, depth zones and an eight-dish menu (pearls and the supply chain arrived with the town).
4. **Generated art** dropped into the sprite slots, plus self-hosted audio (music currently loads from a remote placeholder URL in `src/management/assets.ts`).
5. **Release prep:** monetization, licensing, store or web hosting, and final checks.

---

## License

No license has been chosen yet. Add a `LICENSE` file before publishing. Fonts (Baloo 2, Quicksand; SIL OFL) and icons (Lucide; ISC) keep their own licenses.
