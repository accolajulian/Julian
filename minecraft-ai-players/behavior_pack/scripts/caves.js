// Caves (Resource AI job).
// - Pick which ores it mines (switch each on/off any time): iron, gold, diamond, lapis lazuli,
//   redstone, coal (stone and deepslate versions both count). In the Nether it only mines Ancient
//   Debris, Nether Gold Ore and Nether Quartz Ore (each also switchable).
// - Pick where it works with a laser: look at a cave or ravine and tap Place (or left click). The spot
//   has to be underground: at least 10 blocks above it (or deep down with a roof over it). The AI is
//   sent there and explores the caves from there (see gather.js: it sees ores through the rock, walks
//   the cave to the ones in the walls, tunnels to hidden ones close by, and follows the cave down).
import { world, system, MolangVariableMap } from "@minecraft/server";
import { isLeftClick } from "./effects.js";
import { GATHER } from "./gather_data.js";
import { getAi, saveRecord, findPlayer } from "./data.js";

/** The ores it can mine in caves (key -> name). */
export const CAVE_ORES = [
  { key: "iron", label: "Iron ore" },
  { key: "gold", label: "Gold ore" },
  { key: "diamond", label: "Diamond ore" },
  { key: "lapis", label: "Lapis Lazuli ore" },
  { key: "redstone", label: "Redstone ore" },
  { key: "coal", label: "Coal ore" },
];
/** The Nether's ores (the only ones it mines there). */
export const NETHER_ORES = [
  { key: "ancient_debris", label: "Ancient Debris", id: "minecraft:ancient_debris" },
  { key: "nether_gold", label: "Nether Gold Ore", id: "minecraft:nether_gold_ore" },
  { key: "quartz", label: "Nether Quartz Ore", id: "minecraft:quartz_ore" },
];
const MIN_COVER = 10; // blocks above the spot
const DEEP_Y = 20; // this deep down, a roof of 3 blocks is enough
const DEEP_COVER = 3;
const LASER_RANGE = 64;
const PLACING_MS = 120000;
export const CAVE_LEASH = 128; // explores the caves up to about this far from its cave spot (goes back if it's further)

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ x: number, y: number, z: number, dim: string }} CaveSpot */

/** The ore keys it mines (all of them until you choose). @param {import("./data.js").AiRecord} record */
export function oresOf(record) {
  return record.ores ?? CAVE_ORES.map((o) => o.key);
}

/** The Nether ore keys it mines (all of them until you choose). @param {import("./data.js").AiRecord} record */
export function netherOresOf(record) {
  return record.netherOres ?? NETHER_ORES.map((o) => o.key);
}

/**
 * The block ids it mines in caves, from its chosen ores (the Nether has its own list).
 * @param {import("./data.js").AiRecord} record @param {string} dimensionId
 */
export function caveBlocks(record, dimensionId) {
  if (dimensionId === "minecraft:nether") {
    const nether = netherOresOf(record);
    return NETHER_ORES.filter((o) => nether.includes(o.key)).map((o) => o.id);
  }
  const keys = oresOf(record);
  return Object.keys(GATHER).filter((id) => keys.some((k) => new RegExp(`^minecraft:(lit_)?(deepslate_)?${k}_ore$`).test(id)));
}

// ================================================================ the laser

/**
 * @typedef {Object} CavePreview
 * @property {Vector3 | undefined} spot  where its feet go
 * @property {boolean} valid
 * @property {string} reason
 */
/** @type {Map<string, { key: string, until: number, preview: CavePreview | undefined, onPick: (spot: CaveSpot) => void }>} */
const placing = new Map();

/** @param {string} playerId */
export function isCavePlacing(playerId) {
  return placing.has(playerId);
}

/**
 * Starts the laser. onPick runs with the chosen spot.
 * @param {import("@minecraft/server").Player} player @param {string} key @param {(spot: CaveSpot) => void} onPick
 */
export function startCavePlacing(player, key, onPick) {
  placing.set(player.id, { key, until: Date.now() + PLACING_MS, preview: undefined, onPick });
  player.sendMessage("§eAim at a cave or ravine. Tap Place (or left click) to send it there, sneak to cancel.");
}

/** @param {import("@minecraft/server").Player} player @param {string} [why] */
function stop(player, why) {
  placing.delete(player.id);
  if (why) player.sendMessage(why);
  player.onScreenDisplay.setActionBar("");
}

/**
 * Where the laser points: a spot on a cave floor, with how many blocks are above it.
 * @param {import("@minecraft/server").Player} player
 * @returns {CavePreview}
 */
function aim(player) {
  const dim = player.dimension;
  const hit = player.getBlockFromViewDirection({ maxDistance: LASER_RANGE });
  if (!hit) return { spot: undefined, valid: false, reason: "Aim at a cave floor or wall" };
  const off = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], West: [-1, 0, 0], East: [1, 0, 0] }[hit.face] ?? [0, 1, 0];
  let p = { x: hit.block.location.x + off[0], y: hit.block.location.y + off[1], z: hit.block.location.z + off[2] };
  // Drop down to the floor.
  for (let i = 0; i < 16 && dim.getBlock({ ...p, y: p.y - 1 })?.isAir; i++) p = { ...p, y: p.y - 1 };
  const feet = dim.getBlock(p);
  const head = dim.getBlock({ ...p, y: p.y + 1 });
  const floor = dim.getBlock({ ...p, y: p.y - 1 });
  if (!feet?.isAir || !head?.isAir || !floor || floor.isAir || floor.isLiquid) {
    return { spot: p, valid: false, reason: "No room to stand there" };
  }
  // Count the solid blocks above it.
  let cover = 0;
  const top = Math.min(dim.heightRange.max - 1, p.y + 120);
  for (let y = p.y + 2; y <= top; y++) {
    const b = dim.getBlock({ ...p, y });
    if (!b) break;
    if (!b.isAir && !b.isLiquid) cover++;
  }
  const valid = cover >= MIN_COVER || (p.y <= DEEP_Y && cover >= DEEP_COVER);
  return { spot: p, valid, reason: valid ? `${cover} blocks above` : `Must be underground (${cover} blocks above, needs ${MIN_COVER})` };
}

/** Laser colors, made the first time they're needed (not allowed while the add-on starts up). */
/** @type {{ good: MolangVariableMap, bad: MolangVariableMap } | undefined} */
let colors;
function laserColors() {
  if (!colors) {
    const good = new MolangVariableMap();
    good.setColorRGB("variable.color", { red: 0.3, green: 1, blue: 0.4 });
    const bad = new MolangVariableMap();
    bad.setColorRGB("variable.color", { red: 1, green: 0.2, blue: 0.2 });
    colors = { good, bad };
  }
  return colors;
}

/** Draws the laser and a ring where the AI would stand (only the aiming player sees it). @param {import("@minecraft/server").Player} player @param {CavePreview} pv */
function draw(player, pv) {
  player.onScreenDisplay.setActionBar(
    pv.valid ? `§aCave spot (${pv.reason}) §7| Tap Place: send it | Sneak: cancel` : `§c${pv.reason} §7| Sneak: cancel`
  );
  if (!pv.spot) return;
  const c = pv.valid ? laserColors().good : laserColors().bad;
  const dot = (/** @type {Vector3} */ p) => {
    try {
      player.spawnParticle("minecraft:colored_flame_particle", p, c);
    } catch {
      // unloaded
    }
  };
  const eye = player.getHeadLocation();
  const target = { x: pv.spot.x + 0.5, y: pv.spot.y + 0.2, z: pv.spot.z + 0.5 };
  const len = Math.hypot(target.x - eye.x, target.y - eye.y, target.z - eye.z);
  for (let d = 1.5; d < len; d += 1.5) {
    const t = d / len;
    dot({ x: eye.x + (target.x - eye.x) * t, y: eye.y - 0.3 + (target.y - eye.y + 0.3) * t, z: eye.z + (target.z - eye.z) * t });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    dot({ x: target.x + Math.cos(a) * 0.7, y: target.y, z: target.z + Math.sin(a) * 0.7 });
  }
}

system.runInterval(() => {
  for (const [id, s] of placing) {
    const player = findPlayer(id);
    if (!player) {
      placing.delete(id);
      continue;
    }
    if (Date.now() > s.until) {
      stop(player, "§7Cave spot picking timed out.");
      continue;
    }
    if (player.isSneaking) {
      stop(player, "§7Cancelled.");
      continue;
    }
    try {
      s.preview = aim(player);
      draw(player, s.preview);
    } catch (error) {
      console.warn(`[AI Players] cave laser error: ${error}`);
    }
  }
}, 5);

/** Place (use) or left click while aiming: send it there. @param {import("@minecraft/server").Player} player */
function pick(player) {
  const s = placing.get(player.id);
  if (!s) return;
  const pv = s.preview;
  if (!pv?.valid || !pv.spot) {
    player.sendMessage(`§c${pv?.reason ?? "Aim at a cave"}.`);
    return;
  }
  const record = getAi(s.key);
  if (!record || record.ownerId !== player.id) {
    stop(player, "§cYou don't control that AI anymore.");
    return;
  }
  const spot = { ...pv.spot, dim: player.dimension.id };
  record.cave = spot;
  saveRecord(player.id, record.role, record);
  stop(player);
  system.run(() => s.onPick(spot));
}
world.afterEvents.playerSwingStart.subscribe(({ player, swingSource }) => {
  if (isLeftClick(swingSource)) pick(player);
});
world.afterEvents.itemUse.subscribe(({ source }) => pick(source));
