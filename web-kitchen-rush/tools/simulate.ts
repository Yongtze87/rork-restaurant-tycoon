/**
 * Balance simulator CLI. Drives the real engine with an automated owner and prints pacing.
 *
 *   bun tools/simulate.ts [--days N] [--strategy cautious|builder|balanced|all] [--seed S] [--seeds K]
 *                         [--sessions N] [--minutes M] [--no-charms] [--json]
 *                         [--no-regions] [--region easiest|richest|balanced|all] [--route x,y;x,y]
 *
 * The owner claims ocean regions in waves (once every branch is built up), opens a branch in each and
 * builds what the region is good for. --region picks how it chooses; --route fixes the order; --no-regions
 * plays the home town only. Each run prints the claims and how much of the profit the branches earn.
 * --days is real calendar days; each day has --sessions play sessions of --minutes at 1×.
 * The model is described in docs/BALANCE.md.
 */
import { REGION_STRATEGIES, STRATEGIES, Simulation, averageProfit, buildNear, buyFurniture, measurePayback, referenceSnapshot, simulate, upgradeBuilding, type Investment, type RegionStrategy, type SimResult, type StrategyName } from '../src/management/sim/simulator';
import type { RestaurantEngine } from '../src/management/engine';
import { DISH_IDS, comfort, type FurnitureKind } from '../src/management/types';
import { ZONE_IDS, type ZoneId } from '../src/management/zones';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string, fallback: string) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const days = Number(value('days', '14')), seed = Number(value('seed', '91273')), seeds = Number(value('seeds', '1'));
const which = value('strategy', 'all'), strategies = which === 'all' ? STRATEGIES : [which as StrategyName];
const regionArg = value('region', 'balanced'), regionList = regionArg === 'all' ? REGION_STRATEGIES : [regionArg as RegionStrategy], world = !flag('no-regions');
const route = value('route', '') ? value('route', '').split(';') : undefined;
const sessions = Number(value('sessions', '3')), minutes = Number(value('minutes', '10')), charms = !flag('no-charms'), quiet = flag('quiet');
const awayHours = value('away-hours', '') === '' ? undefined : Number(value('away-hours', ''));

const pad = (v: unknown, n: number) => String(v).padStart(n);
const when = (t?: { day: number; realDay: number; activeHours: number }) => t ? `svc day ${t.day} · real day ${t.realDay} · ${t.activeHours} h played` : '—';

function report(r: SimResult): void {
  console.log(`\n=== ${r.strategy} · seed ${r.seed} · ${r.serviceDays} service days · ${r.activeHours} h active ===`);
  for (const id of ZONE_IDS.slice(1)) console.log(`  ${pad(id, 9)}  unlockable: ${when(r.unlockable[id])}\n  ${pad('', 9)}  unlocked:   ${when(r.unlocked[id])}`);
  console.log('  requirements first met: ' + Object.entries(r.requirements).map(([k, t]) => `${k} d${t.day}`).join(' · '));
  const last = r.rows[r.rows.length - 1]?.day ?? 0, windows = [[1, 5], [6, 10], [11, 20], [21, 40], [41, 80], [81, 160], [161, 320], [321, 640]].filter(([a]) => a <= last);
  console.log('  avg profit/day incl. challenges: ' + windows.map(([a, b]) => `d${a}-${Math.min(b, last)} $${averageProfit(r, a, b)}`).join(' · '));
  if (!quiet) {
    console.log('  real day | svc day |     cash | profit | served/missed | rep  | buildings');
    let shown = 0;
    for (const row of r.rows) if (row.realDay > shown) {
      shown = row.realDay;
      console.log(`  ${pad(row.realDay, 8)} | ${pad(row.day, 7)} | ${pad('$' + row.cash, 8)} | ${pad(row.profit + row.bonus, 6)} | ${pad(row.served, 6)}/${pad(row.missed, 3)}    | ${row.reputation.toFixed(2)} | ${row.buildings}`);
    }
  }
  console.log(`  buildings: ${r.buildings.map(b => `${b.kind}:${b.level}`).join(' ')}`);
  console.log(`  furniture: ${r.furniture.length} pieces, ${r.furniture.reduce((s, f) => s + f.level - 1, 0)} upgrade levels · staff ${r.staff} (+${r.trainedLevels} training)`);
  console.log(`  reserve blocks ${r.reserveBlocks} · loans ${r.loans} · bankrupt days ${r.bankruptDays} · min cash $${Math.round(r.minCash)} · final cash $${r.finalCash}`);
  console.log(`  pearls earned ${r.pearlsEarned} · charms earned ${r.charmsEarned.current} current / ${r.charmsEarned.tide} tide, used ${r.charmsUsed.current} / ${r.charmsUsed.tide}`);
  console.log(`  spent: ${Object.entries(r.spent).map(([k, v]) => `${k} $${Math.round(v)}`).join(' · ')}`);
  if (world) worldTable(r);
}
/** Real day of a timing, or a dash. */
const rd = (t?: { realDay: number }) => t ? `rd ${t.realDay}` : '—';
/** Branch income per day and its share of profit (incl. challenges) over service-day windows. */
export function branchShare(r: SimResult, from: number, to: number): { branch: number; share: number } {
  const rows = r.rows.filter(x => x.day >= from && x.day <= to); if (!rows.length) return { branch: 0, share: 0 };
  const branch = rows.reduce((s, x) => s + x.branch, 0), profit = rows.reduce((s, x) => s + x.profit + x.bonus, 0);
  return { branch: Math.round(branch / rows.length), share: profit > 0 ? Math.round(branch / profit * 100) : 0 };
}
/** Every claim: when, what it cost, and when its branch opened and reached levels 6 and 11. */
function worldTable(r: SimResult): void {
  console.log(`  fame ${r.fame} · regions claimed ${r.claims.length}`);
  console.log('  #  | region                          | ring ★   | claim price | claimed      | branch L1 | L6     | L11');
  for (const c of r.claims) console.log(`  ${pad(c.index, 2)} | ${`${c.name} (${c.biome})`.padEnd(31)} | ${c.ring}  ${c.difficulty.toFixed(1)} | ${pad('$' + c.price.toLocaleString('en-US'), 11)} | ${`${rd(c.claimed)} ${c.claimed.activeHours}h`.padEnd(12)} | ${rd(c.branch1).padEnd(9)} | ${rd(c.branch6).padEnd(6)} | ${rd(c.branch11)}`);
  const last = r.rows[r.rows.length - 1]?.day ?? 0, windows = [[1, 40], [41, 160], [161, 320], [321, 640], [641, 9999]].filter(([a]) => a <= last);
  console.log('  branch income/day (share of profit): ' + windows.map(([a, b]) => { const x = branchShare(r, a, b); return `d${a}-${Math.min(b, last)} $${x.branch} (${x.share}%)`; }).join(' · '));
}

if (flag('payback')) {
  // Marginal value of each investment from the balanced owner's business after --at service days.
  // --reference early|mid uses a tidy built-up business; otherwise the strategy's own business after --at days.
  const reference = value('reference', '');
  let snap: ReturnType<Simulation['snapshot']>;
  if (reference) snap = referenceSnapshot(reference as 'early' | 'mid');
  else {
    const at = Number(value('at', '15')), sim = new Simulation({ strategy: (which === 'all' ? 'balanced' : which) as StrategyName, days: 999, seed, maxServiceDays: at, sessions, sessionMinutes: minutes });
    sim.run(); snap = sim.snapshot();
    if (flag('log')) console.log(sim.log.join('\n'));
  }
  const s = snap.state;
  console.log(`Snapshot after ${s.day - 1} days: cash $${Math.round(s.cash)}, rep ${s.reputation}, comfort ${comfort(s)}, ${s.furniture.filter(f => f.kind === 'table').length} tables, crew ${s.staff.map(m => m.role[0] + m.level).join(' ')}, menu ${DISH_IDS.filter(d => s.menu[d].enabled).join(',')}`);
  console.log(`  town ${s.town.plots.filter(p => p.building).map(p => `${p.building}:${p.level}`).join(' ')} · zones ${s.town.zones.join(',')}`);
  const furn = (kind: FurnitureKind) => (e: RestaurantEngine) => buyFurniture(e, kind);
  const up = (kind: FurnitureKind) => (e: RestaurantEngine) => { const f = e.state.furniture.filter(x => x.kind === kind).sort((a, b) => a.level - b.level)[0]; return f ? e.upgradeFurniture(f.id) : 'none'; };
  const upAll = (kind: FurnitureKind) => (e: RestaurantEngine) => { for (const f of e.state.furniture.filter(x => x.kind === kind)) { const err = e.upgradeFurniture(f.id); if (err) return err; } return null; };
  const train = (role: 'chef' | 'server') => (e: RestaurantEngine) => { const m = e.state.staff.filter(x => x.role === role && x.level < 3).sort((a, b) => a.level - b.level)[0]; return m ? e.train(m.id) : 'none'; };
  const investments: Investment[] = [
    { name: 'coral table', apply: furn('table') }, { name: 'sea anemone', apply: furn('plant') }, { name: 'glow lantern', apply: furn('lamp') },
    { name: 'hire chef', apply: e => e.hire('chef') }, { name: 'hire server', apply: e => e.hire('server') },
    { name: 'train a chef', apply: train('chef') }, { name: 'train a server', apply: train('server') },
    { name: 'upgrade one table', apply: up('table') }, { name: 'upgrade all tables', apply: upAll('table') }, { name: 'upgrade grill', apply: up('grill') }, { name: 'upgrade counter', apply: up('prep') }, { name: 'upgrade a lantern', apply: up('lamp') },
    { name: 'kelp farm by restaurant', apply: e => buildNear(e, 'kelpFarm', true) }, { name: 'fishery by restaurant', apply: e => buildNear(e, 'fishery', true) },
    { name: 'fishery elsewhere', apply: e => buildNear(e, 'fishery', false) }, { name: 'glow garden by restaurant', apply: e => buildNear(e, 'garden', true) },
    { name: 'glow garden elsewhere', apply: e => buildNear(e, 'garden', false) }, { name: 'homes', apply: e => buildNear(e, 'homes', false) },
    { name: 'restaurant +1 level', apply: e => upgradeBuilding(e, 'restaurant') }, { name: 'garden +1 level', apply: e => upgradeBuilding(e, 'garden') },
    { name: 'fishery +1 level', apply: e => upgradeBuilding(e, 'fishery') }, { name: 'kelp farm +1 level', apply: e => upgradeBuilding(e, 'kelpFarm') },
  ];
  console.log('  investment                 |   cost | +$/day | payback days');
  for (const r of measurePayback(snap, investments, Number(value('measure', '12')), Number(value('seeds', '4')))) console.log(`  ${r.name.padEnd(26)} | ${pad(Number.isNaN(r.cost) ? 'n/a' : r.cost, 6)} | ${pad(Number.isNaN(r.gainPerDay) ? 'n/a' : r.gainPerDay, 6)} | ${Number.isNaN(r.paybackDays) ? 'n/a' : r.paybackDays === Infinity ? 'never' : r.paybackDays}`);
  process.exit(0);
}

const all: SimResult[] = [];
for (const strategy of strategies) for (const region of world ? regionList : [undefined]) for (let i = 0; i < seeds; i++) {
  const t = performance.now(), r = simulate({ strategy, days, seed: seed + i * 7919, sessions, sessionMinutes: minutes, charms, regions: world, region, route, awayHours });
  if (world && regionList.length > 1 && !flag('json')) console.log(`\n--- regions: ${route ? `route ${route.join(' → ')}` : region} ---`);
  all.push(r);
  if (flag('json')) continue;
  report(r); console.log(`  (${((performance.now() - t) / 1000).toFixed(1)} s)`);
}
const med = (xs: number[]) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : NaN; };
if (flag('json')) console.log(JSON.stringify(all.map(({ rows: _rows, ...rest }) => rest), null, 1));
else {
  console.log('\n=== summary: median unlock time over seeds (service day / real day / hours played) ===');
  for (const strategy of strategies) {
    const rs = all.filter(r => r.strategy === strategy);
    const z = (id: ZoneId) => {
      const never = rs.filter(r => !r.unlocked[id]).length, got = rs.filter(r => r.unlocked[id]);
      if (!got.length) return 'never';
      return `d${med(got.map(r => r.unlocked[id]!.day))} / rd${med(got.map(r => r.unlocked[id]!.realDay))} / ${med(got.map(r => r.unlocked[id]!.activeHours))}h${never ? ` (${never} never)` : ''}`;
    };
    console.log(`  ${pad(strategy, 9)} reef ${z('reef')} · twilight ${z('twilight')} · abyss ${z('abyss')}`);
    if (world) console.log(`  ${pad('', 9)} claims (real day) ${rs.map(r => r.claims.map(c => c.claimed.realDay).join(',')).join(' / ')} · fame ${rs.map(r => r.fame).join('/')} · branch share d161-320 ${rs.map(r => branchShare(r, 161, 320).share).join('/')}% · d321+ ${rs.map(r => branchShare(r, 321, 9999).share).join('/')}%`);
    console.log(`  ${pad('', 9)} profit/day d1-10 $${med(rs.map(r => averageProfit(r, 1, 10)))} · d11-40 $${med(rs.map(r => averageProfit(r, 11, 40)))} · d41-160 $${med(rs.map(r => averageProfit(r, 41, 160)))} · d161+ $${med(rs.map(r => averageProfit(r, 161, 9999)))} · blocks ${rs.map(r => r.reserveBlocks).join('/')} · loans ${rs.map(r => r.loans).join('/')} · bankrupt ${rs.map(r => r.bankruptDays).join('/')} · min $${rs.map(r => Math.round(r.minCash)).join('/')} · final $${rs.map(r => r.finalCash).join('/')}`);
  }
}
