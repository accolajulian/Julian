// Map awareness (Resource AI collecting for a sugar cane farm).
// - Scans everything loaded around it (48 blocks) and picks the best spot: the most of what it needs,
//   closest first (counted in 8 x 8 columns).
// - Nothing loaded nearby: it "cheats" and briefly loads land further out with a ticking area
//   (rings at 96, 160 and 224 blocks in 8 directions), scans it, and goes to the best spot found.
// - While an AI works far from every player (gathering, building, guarding) it keeps the land around
//   itself loaded (one ticking area per AI), so it keeps working instead of freezing.
// - The names of its ticking areas are saved; any left over (the world was closed mid-scout) are
//   removed when the world loads. Ticking areas you made yourself are never touched.
import { world, system, BlockVolume } from "@minecraft/server";
import { GATHER } from "./gather_data.js";

const LOCAL_RADIUS = 48;
const PROBE_DISTANCES = [96, 160, 224];
const PROBE_DIRECTIONS = 8;
const PROBE_RADIUS = 24; // scanned around each probe (its ticking area loads 2 chunks around it)
const PROBE_WAIT_TICKS = 40; // give the land 2 seconds to load
const GOOD_SPOT = 6; // enough blocks in one spot to stop looking further out
const KEEP_LOADED_FROM = 40; // keeps its own land loaded when no player is this close (well inside the smallest simulation distance, about 64 blocks)
const MOVE_AREA_AFTER = 24;

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ spot: Vector3, score: number, count: number }} Cluster */
/**
 * @typedef {Object} ScoutState  Per loaded AI (not saved).
 * @property {number} nextAt  tick when it may scout again
 * @property {{ points: Vector3[], i: number, readyAt: number, best: Cluster | undefined } | undefined} probe
 */

/** @returns {ScoutState} */
export function createScoutState() {
  return { nextAt: 0, probe: undefined };
}

/** @param {string[]} kinds GATHER focus kinds */
function typesFor(kinds) {
  return Object.keys(GATHER).filter((id) => kinds.includes(GATHER[id].focus));
}

/**
 * Where to go for these kinds of blocks. Returns a spot, "searching" while it's still looking
 * further out, "none" when it looked everywhere and found nothing, or undefined when there's nothing
 * new (it looked a moment ago, or it's already at the best spot).
 * @param {import("@minecraft/server").Entity} ai
 * @param {string[]} kinds
 * @param {ScoutState} state
 * @param {Map<string, number>} [avoid]  blocks to ignore ("x,y,z" -> until when)
 * @returns {Vector3 | "searching" | "none" | undefined}
 */
export function scout(ai, kinds, state, avoid) {
  const types = typesFor(kinds);
  if (types.length === 0) return undefined;
  const skip = avoidCheck(avoid);
  if (state.probe) return continueProbe(ai, types, state, skip);
  const now = system.currentTick;
  if (now < state.nextAt) return undefined;
  state.nextAt = now + 200;

  const here = ai.location;
  const local = bestCluster(ai.dimension, here, LOCAL_RADIUS, here.y - 16, here.y + 16, types, here, skip);
  if (local) return Math.hypot(local.spot.x - here.x, local.spot.z - here.z) > 6 ? local.spot : undefined;

  // Nothing loaded nearby: look further out.
  /** @type {Vector3[]} */
  const points = [];
  for (const d of PROBE_DISTANCES) {
    for (let i = 0; i < PROBE_DIRECTIONS; i++) {
      const a = (i / PROBE_DIRECTIONS) * Math.PI * 2;
      points.push({ x: Math.floor(here.x + Math.cos(a) * d), y: Math.floor(here.y), z: Math.floor(here.z + Math.sin(a) * d) });
    }
  }
  state.probe = { points, i: 0, readyAt: 0, best: undefined };
  return continueProbe(ai, types, state, skip);
}

/** @param {Map<string, number> | undefined} avoid */
function avoidCheck(avoid) {
  const now = Date.now();
  return (/** @type {Vector3} */ p) => (avoid?.get(`${p.x},${p.y},${p.z}`) ?? 0) > now;
}

/**
 * @param {import("@minecraft/server").Entity} ai @param {string[]} types @param {ScoutState} state
 * @param {(p: Vector3) => boolean} skip
 * @returns {Vector3 | "searching" | "none" | undefined}
 */
function continueProbe(ai, types, state, skip) {
  const probe = /** @type {NonNullable<ScoutState["probe"]>} */ (state.probe);
  const dim = ai.dimension;
  const now = system.currentTick;
  const name = `aip_scout_${clean(ai.id)}`;
  const p = probe.points[probe.i];
  if (probe.readyAt === 0) {
    command(dim, `tickingarea remove ${name}`);
    command(dim, `tickingarea add circle ${p.x} ${p.y} ${p.z} 2 ${name}`);
    probe.readyAt = now + PROBE_WAIT_TICKS;
    return "searching";
  }
  if (now < probe.readyAt) return "searching";

  const range = dim.heightRange;
  const low = Math.max(range.min, dim.id === "minecraft:overworld" ? 50 : p.y - 24);
  const high = Math.min(range.max - 1, dim.id === "minecraft:overworld" ? 120 : p.y + 24);
  const found = bestCluster(dim, p, PROBE_RADIUS, low, high, types, ai.location, skip);
  if (found && (!probe.best || found.score > probe.best.score)) probe.best = found;
  command(dim, `tickingarea remove ${name}`);
  probe.i++;
  probe.readyAt = 0;

  const ringDone = probe.i % PROBE_DIRECTIONS === 0;
  if ((ringDone && probe.best && probe.best.count >= GOOD_SPOT) || probe.i >= probe.points.length) {
    const best = probe.best;
    state.probe = undefined;
    state.nextAt = now + (best ? 200 : 1200); // found nothing at all: try again in a minute
    return best ? best.spot : "none";
  }
  return "searching";
}

/**
 * The best spot in a box: most wanted blocks per 8 x 8 column, closer counts more.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {Vector3} center @param {number} radius @param {number} yLow @param {number} yHigh
 * @param {string[]} types @param {Vector3} from
 * @param {(p: Vector3) => boolean} skip  blocks to ignore
 * @returns {Cluster | undefined}
 */
function bestCluster(dim, center, radius, yLow, yHigh, types, from, skip) {
  const range = dim.heightRange;
  const volume = new BlockVolume(
    { x: Math.floor(center.x - radius), y: Math.max(range.min, Math.floor(yLow)), z: Math.floor(center.z - radius) },
    { x: Math.floor(center.x + radius), y: Math.min(range.max - 1, Math.floor(yHigh)), z: Math.floor(center.z + radius) }
  );
  /** @type {Vector3[]} */
  let found;
  try {
    found = [...dim.getBlocks(volume, { includeTypes: types }).getBlockLocationIterator()];
  } catch {
    return undefined; // not loaded
  }
  /** @type {Map<string, { n: number, x: number, y: number, z: number }>} */
  const columns = new Map();
  for (const p of found) {
    if (skip(p)) continue;
    const k = `${Math.floor(p.x / 8)},${Math.floor(p.z / 8)}`;
    const c = columns.get(k) ?? { n: 0, x: 0, y: 0, z: 0 };
    c.n++;
    c.x += p.x;
    c.y += p.y;
    c.z += p.z;
    columns.set(k, c);
  }
  /** @type {Cluster | undefined} */
  let best;
  for (const c of columns.values()) {
    const spot = { x: c.x / c.n, y: c.y / c.n, z: c.z / c.n };
    const score = c.n / (1 + Math.hypot(spot.x - from.x, spot.z - from.z) / 32);
    if (!best || score > best.score) best = { spot, score, count: c.n };
  }
  return best;
}

/** Ticking areas this script made to keep AIs loaded: key -> where. @type {Map<string, { x: number, z: number, dim: string }>} */
const kept = new Map();

/**
 * Keeps the land around the AI loaded while it works far from every player (or stops doing that).
 * @param {import("@minecraft/server").Entity} ai @param {string} key @param {boolean} wanted
 */
export function keepLoaded(ai, key, wanted) {
  const name = `aip_keep_${clean(key)}`;
  const at = kept.get(key);
  const far = wanted && !world.getPlayers().some((p) =>
    p.dimension.id === ai.dimension.id && Math.hypot(p.location.x - ai.location.x, p.location.z - ai.location.z) < KEEP_LOADED_FROM
  );
  if (!far) {
    if (at) {
      command(world.getDimension(at.dim), `tickingarea remove ${name}`);
      kept.delete(key);
    }
    return;
  }
  if (at && at.dim === ai.dimension.id && Math.hypot(at.x - ai.location.x, at.z - ai.location.z) < MOVE_AREA_AFTER) return;
  const { x, y, z } = ai.location;
  command(at ? world.getDimension(at.dim) : ai.dimension, `tickingarea remove ${name}`);
  command(ai.dimension, `tickingarea add circle ${Math.floor(x)} ${Math.floor(y)} ${Math.floor(z)} 3 ${name}`);
  kept.set(key, { x, z, dim: ai.dimension.id });
}

/** The AI was deleted: remove the ticking area keeping it loaded. @param {string} key */
export function releaseLoaded(key) {
  const at = kept.get(key);
  if (!at) return;
  command(world.getDimension(at.dim), `tickingarea remove aip_keep_${clean(key)}`);
  kept.delete(key);
}

/** @param {import("@minecraft/server").Dimension} dim @param {string} text */
function command(dim, text) {
  try {
    dim.runCommand(text);
  } catch {
    // e.g. removing an area that isn't there, or the world already has 10 ticking areas
  }
  // Remember our own areas so leftovers can be cleaned up.
  const match = /^tickingarea (add|remove) (?:circle \S+ \S+ \S+ \d+ )?(aip_\w+)$/.exec(text);
  if (!match) return;
  const areas = savedAreas();
  areas[match[2]] = match[1] === "add" ? dim.id : undefined;
  if (match[1] === "remove") delete areas[match[2]];
  world.setDynamicProperty(AREAS_KEY, JSON.stringify(areas));
}

const AREAS_KEY = "aip:ticking_areas";

/** Our ticking areas: name -> dimension. @returns {Record<string, string | undefined>} */
function savedAreas() {
  try {
    const raw = world.getDynamicProperty(AREAS_KEY);
    return typeof raw === "string" ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// World loaded: remove ticking areas left over from last time (they're re-made when needed).
system.runTimeout(() => {
  for (const [name, dim] of Object.entries(savedAreas())) {
    if (dim) command(world.getDimension(dim), `tickingarea remove ${name}`);
  }
}, 40);

/** @param {string} text */
function clean(text) {
  return text.replace(/[^A-Za-z0-9]/g, "");
}
