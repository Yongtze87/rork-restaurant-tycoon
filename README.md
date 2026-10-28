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
- **Always open:** after the first opening the restaurant never closes. Build, hire, train, upgrade and change the menu while guests come and go; a table with seated guests or a station that is cooking waits until it is free.

### Run the business
- **Team:** hire chefs or servers (up to 6). Training makes them faster and raises their daily wage.
- **Menu:** toggle dishes and set prices. Charging more than the fair price drives some guests away.
- **Real days, no day counter:** the crew works in short shifts (about 2½ minutes; wages and rent are paid at the end of each). Challenges, the tide and the daily gift reset at the player's **local midnight**, so an hour online and one quick visit get the same daily board.
- **Ledger:** today so far, a receipt per real day (the last 30), and a 7-day revenue chart.
- **Dish seasons:** every 2–3 real days one ingredient group is in season (Kelp season, Shoal season; new groups bring their own). Guests order those dishes about twice as often and will pay more for them, by a hidden amount that changes every season, so players find the right price by watching how many guests walk away. Below what guests expect, more of them order and they tip more; above it, some walk away. Changing a dish's price on more than two shifts a day upsets regulars (reputation). **Auto price** sets safe prices for players who don't want to tinker.
- **Daily tides:** each real day rolls an ocean event (calm waters, feast tide, strong current, whale passing, murky water) that nudges guest arrivals, crew pace, tips or patience. Day 1 is always calm.
- **Daily challenges** (three per real day; finishing all three also pays a pearl and a Current charm), **milestones**, an interest-free **recovery loan**, a **low-cash warning**, and a **“Tight on cash”** prompt before any purchase that would leave too little for the next payroll. If the register is short at closing, the bank covers it and you repay $30 a day.
- **Collection:** 63 long-term achievements in the Ledger (dish mastery, builder, explorer, ocean voyager, tide watcher, host, craft) that pay pearls and a few Tide charms. Collect each reward by hand; a badge on the Ledger button shows how many are ready.

### Offline progress you can trust
- When you return, the game **replays the elapsed time at 1× through the same simulation step**, with checkpoints.
- While you are away the crew works **at most one shift** (`OFFLINE_SERVICE_DAYS`); building timers keep running the whole time.

### Reef town
- A 9×9 map of plots around the restaurant. Unlock neighbouring plots and choose what to build:
  - **Kelp farm** and **fishery**: cheaper kelp or fish dishes (50% stronger next to the restaurant)
  - **Mareen homes**: more crew slots
  - **Glow garden**: guests arrive more often; crew work faster next to homes
  - **Workshop**: all construction finishes faster
- Buildings and the restaurant level up to 15, with a new look at levels 6 and 11.
- Construction runs in real time, including while you are away: about a minute at first, hours at the top levels. One builder works at a time.
- **Time skips:** Current charms (−15 min) and Tide charms (−1 h), earned from a daily gift, all three daily challenges and milestones. **Pearls** finish a job instantly and buy a second builder.
- **Depth zones** are the long-term chapters. The middle 5×5 is the **Sunlit Shallows**; the next ring is the **Coral Reef**, the outer ring the **Twilight Zone**, and the dark drop-off around the town is the **Abyss**. Each zone needs reputation, buildings and cash (Coral Reef: 3.8★, 4 buildings, $5,000 · Twilight: 4.2★, 8 buildings, one at level 8, $20,000 · Abyss: 4.6★, 12 buildings, one at level 13, $120,000). Each zone opens two dishes and draws guests 5% more often; the Reef and Twilight also open their ring of plots.
- The pearl shop lists real-money packs, but they can't be bought until a store and payment provider are chosen.

### The Ocean: one ever-growing world
- The Town view **is** the world: your Home Reef town in the middle, ocean regions around it as real seabed in the same isometric scene, and fog beyond. Drag to look around and zoom out to see several regions at once; **Reset view** recentres the Home Reef. Nothing ever resets: everything you build stays.
- **Claim regions** next to the ones you own. Each region is a 7×7 block of plots with a one-plot seabed path around it. Its middle plot comes owned; unlock the rest one by one next to owned plots, and build with the same buildings, builders, timers, charms and pearls as at home. The home town's depth zones gate how far out you can claim: the first ring after the Coral Reef, the second after the Twilight Zone, beyond after the Abyss. Prices grow with distance, difficulty and every region you already own.
- **Regions specialise.** Seven biomes, each with upsides and downsides for plots and buildings *in that region*: **kelp forest** (kelp farms 55% stronger, slower building), **volcanic vents** (fisheries stronger, dearer building), **coral atoll** (glow gardens stronger, dearer building), **sunken city** (workshops stronger and cheap building, branch earns less), **ice shelf** (branch earns more, slower building), **open trench** (the richest branch and more fame, but dear, slow building) and **calm lagoon** (cheap and quick, modest branch). Difficulty (1–5 stars) grows with distance, but every ring has easier and harder neighbours. Town-wide limits still apply.
- **Branch restaurants:** one per region outside the Home Reef, levels 1–15 with three looks. Your crew runs them on their own: each finished branch earns at the end of every shift (also offline) from its level, its region and your fame, shown as **Branch income** on every receipt and in the Ledger. Producers and gardens next to a branch are 50% stronger, as next to the restaurant. The Home Reef restaurant stays the one you run yourself.
- **Fame** is permanent and earned by mastering regions: claiming one, its branch reaching levels 6 and 11, owning all its plots, and reaching the Abyss at home. It gives capped bonuses: extra tips on each bill, cheaper building and claims, more guests, and richer branches.
- The Town panel lists your regions (with their branch income) and the ones you can claim (with their price); tap one, in the panel or in the scene, for its details.

### Underwater atmosphere
- Sun shafts from the surface, drifting caustics on the floor, rising bubbles, marine snow and distant fish schools.
- Swaying kelp and anemones, a glowing jelly lantern, and a vent grill that glows while a chef cooks.
- **Evening glow:** the reef darkens from 19:00 to 21:30 in both views; lanterns, the vent grill, glow gardens and top-tier buildings shine brighter, and bioluminescent plankton drifts by. Visual only.
- Everything ambient respects `prefers-reduced-motion`.

---

## How to play

1. **Make it yours:** open **Build → Interiors**, buy tables, anemones, lanterns or kelp screens, and snap them onto the grid.
2. **Set up your crew and menu:** you need a kelp counter for kelp salads and a vent grill for fish cakes.
3. **Open the restaurant** once. It stays open from then on; each day lasts about 2½ minutes.
4. **Read the receipt** from the business-updates card or the **Ledger**.
5. **Reinvest any time:** Build (a strip of furniture along the bottom), Team, Menu and Town all work while guests are in.

| Action | Mouse / touch | Keyboard |
|---|---|---|
| Place or move furniture | Tap a grid cell | Arrow keys |
| Rotate placement | Rotate button | `R` |
| Cancel / close a menu | ✕ button | `Esc` |
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
| `bun tools/simulate.ts --days 56` | Balance simulator: automated owners play the real engine, claiming regions and growing branches (see [docs/BALANCE.md](docs/BALANCE.md)); `--region easiest\|richest\|balanced\|all` picks how regions are chosen, `--no-regions` plays the home town only |

---

## Project structure

```text
web-kitchen-rush/
├── src/
│   ├── management/          # The game
│   │   ├── engine.ts        # Deterministic simulation: economy, jobs, days, offline replay, saves
│   │   ├── types.ts         # Zod save schema, catalog, dishes, constants
│   │   ├── world.ts         # World geometry: the home town and region blocks on one plot grid
│   │   ├── ocean.ts         # The Ocean: regions, biomes, specialisation, claiming, fame (pure)
│   │   ├── town.ts          # Plots across the world, buildings, branches, construction (pure)
│   │   ├── TownScene.tsx    # The world scene: drag, zoom, tap plots and regions
│   │   ├── layout.ts        # Grid placement rules and pathfinding
│   │   ├── ManagementGame.tsx  # Owner UI shell: header, dock, build tray, town card, menu windows
│   │   ├── RestaurantScene.tsx # Canvas host: game loop, taps, drag-to-look, labels
│   │   └── iso/
│   │       ├── projection.ts   # Isometric math, fitting, depth order, sprite facing
│   │       ├── render.ts       # Draws one frame from the simulation state
│   │       ├── town-render.ts  # Draws the whole world: regions, plots, labels and fog, culled to the screen
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
| East grotto | $900, unlocks after 3 shifts |
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
