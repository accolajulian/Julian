// Upgraded Resource AI: strip mining.
// It looks for the nearest diamond ore (or ancient debris in the Nether) and digs a 1x2 tunnel
// straight to it, going down or up in steps like stairs, then mines it. If there's none nearby,
// it goes down to diamond level and digs a straight tunnel until it finds some.
// Upgraded AIs can't burn and take no fall damage, so lava and drops don't stop it.
// It never digs through chests, spawners, portals, bedrock or anything that looks player-built.
import { BlockVolume, ItemStack } from "@minecraft/server";
import { GATHER } from "./gather_data.js";
import { saveRecord, findPlayer, giveItem } from "./data.js";
import { addXp, countCollected, blockXp } from "./levels.js";
import { inventoryOf, wearTool, enchantLevel, itemName, isValuable, addValuables, addBlocks, isPlaceableBlock } from "./inventory.js";

const TARGETS = {
  "minecraft:overworld": ["minecraft:diamond_ore", "minecraft:deepslate_diamond_ore"],
  "minecraft:nether": ["minecraft:ancient_debris"],
};
const SCAN_RADIUS = 24;
const SCAN_EVERY_MS = 5000;
const DIAMOND_LEVEL = -54; // where it strip mines when it hasn't found any diamonds yet
const NETHERITE_LEVEL = 15;
const PROTECTED =
  /chest|barrel|shulker|spawner|bedrock|portal|reinforced|barrier|command|structure|jigsaw|furnace|smoker|_door|_bed|sign|rail|hopper|dispenser|dropper|observer|piston|beacon|anvil|enchant|crafting|lectern|bookshelf|planks|glass|wool|carpet|bricks|lantern|torch|ladder|fence|_wall|slab|stairs|end_portal|aip:/;
const PICK_TIER = { wooden: 0, golden: 0, stone: 1, iron: 2, diamond: 3, netherite: 4 };

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/**
 * @typedef {Object} StripState  Per loaded AI (not saved).
 * @property {Vector3 | undefined} target  The ore it's going to.
 * @property {{ x: number, z: number }} dir  Tunnel direction when it has no target.
 * @property {number} scannedAt
 * @property {number} warnedAt
 */

/** @returns {StripState} */
export function createStripState() {
  return { target: undefined, dir: { x: 1, z: 0 }, scannedAt: 0, warnedAt: 0 };
}

/**
 * One step of strip mining (called twice a second). Returns the tool slot it's using.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 * @param {StripState} state
 * @param {() => void} placeTorch  places a torch if it's due (about every 10 blocks underground)
 * @returns {number | undefined}
 */
export function stripMine(ai, ownerId, record, state, placeTorch) {
  const dim = ai.dimension;
  const targets = TARGETS[/** @type {keyof typeof TARGETS} */ (dim.id)];
  if (!targets) return undefined; // not in the Overworld or the Nether

  // Its best pickaxe, or its hands (slower, but they can mine anything): it never needs you to give it one.
  const pick = bestPickaxe(record) ?? HANDS;

  // Look for ore every few seconds (or when it reached the last one).
  const now = Date.now();
  if (state.target && dim.getBlock(state.target)?.typeId && !targets.includes(dim.getBlock(state.target)?.typeId ?? "")) {
    state.target = undefined;
  }
  if (!state.target && now - state.scannedAt > SCAN_EVERY_MS) {
    state.scannedAt = now;
    state.target = findOre(ai, targets);
    if (!state.target) {
      const view = ai.getViewDirection();
      state.dir = Math.abs(view.x) > Math.abs(view.z) ? { x: Math.sign(view.x) || 1, z: 0 } : { x: 0, z: Math.sign(view.z) || 1 };
    }
  }

  const feet = floor(ai.location);
  const target = state.target;

  // Next to the ore: mine it.
  if (target && dist(center(target), { ...ai.location, y: ai.location.y + 1.5 }) <= 3) {
    const info = GATHER[dim.getBlock(target)?.typeId ?? ""];
    const use = info && info.tier > pick.tier ? HANDS : pick; // its pickaxe is too weak: hands
    ai.playAnimation("animation.aip.ai_player.mine");
    breakBlock(ai, ownerId, record, target, use.slot);
    state.target = undefined;
    state.scannedAt = 0; // look for the next one right away
    return pick.slot;
  }

  // Which way: towards the ore, or the tunnel direction (down to the right level first).
  let goal;
  if (target) {
    goal = target;
  } else {
    const level = dim.id === "minecraft:nether" ? NETHERITE_LEVEL : DIAMOND_LEVEL;
    goal = { x: feet.x + state.dir.x * 8, y: Math.abs(feet.y - level) > 1 ? level : feet.y, z: feet.z + state.dir.z * 8 };
  }
  const dx = goal.x - feet.x;
  const dz = goal.z - feet.z;
  const dy = goal.y - feet.y;
  const horizontal = Math.abs(dx) > Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) };
  const sy = dy < -0.5 ? -1 : dy > 1.5 ? 1 : 0;
  const next = { x: feet.x + horizontal.x, y: feet.y + sy, z: feet.z + horizontal.z };
  if (horizontal.x === 0 && horizontal.z === 0) next.x = feet.x; // straight down/up

  // Clear the next step (feet and head; going up also needs room above its own head).
  const cells = [next, { ...next, y: next.y + 1 }];
  if (sy > 0) cells.push({ ...feet, y: feet.y + 2 });
  for (const cell of cells) {
    const block = dim.getBlock(cell);
    if (!block || block.isAir || block.isLiquid) continue;
    if (PROTECTED.test(block.typeId)) {
      // Can't dig here: turn and try another way.
      state.dir = { x: -state.dir.z, z: state.dir.x };
      state.target = undefined;
      return pick.slot;
    }
    ai.playAnimation("animation.aip.ai_player.mine");
    breakBlock(ai, ownerId, record, cell, pick.slot);
    return pick.slot; // one block per step
  }

  // The way is clear: step in.
  ai.teleport({ x: next.x + 0.5, y: next.y, z: next.z + 0.5 }, { facingLocation: center(goal) });
  placeTorch();
  return pick.slot;
}

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {string[]} types
 */
function findOre(ai, types) {
  const dim = ai.dimension;
  const p = floor(ai.location);
  const minY = dim.id === "minecraft:nether" ? 1 : -63;
  const volume = new BlockVolume(
    { x: p.x - SCAN_RADIUS, y: Math.max(minY, p.y - 64), z: p.z - SCAN_RADIUS },
    { x: p.x + SCAN_RADIUS, y: p.y + 8, z: p.z + SCAN_RADIUS }
  );
  /** @type {Vector3 | undefined} */
  let best;
  try {
    for (const loc of dim.getBlocks(volume, { includeTypes: types }).getBlockLocationIterator()) {
      if (!best || dist(loc, p) < dist(best, p)) best = { x: loc.x, y: loc.y, z: loc.z };
    }
  } catch {
    return undefined; // part of the area isn't loaded
  }
  return best;
}

/**
 * Breaks a block in the tunnel. Ores give their drops (valuables first); stone-like blocks fill the
 * block slots; the rest is left behind. Wears the pickaxe.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 * @param {Vector3} p
 * @param {number} slot
 */
function breakBlock(ai, ownerId, record, p, slot) {
  const dim = ai.dimension;
  const id = dim.getBlock(p)?.typeId ?? "";
  const info = GATHER[id];
  dim.setBlockType(p, "minecraft:air");
  dim.playSound("dig.stone", p);

  if (info) {
    const amount = info.min !== undefined && info.max !== undefined ? info.min + Math.floor(Math.random() * (info.max - info.min + 1)) : 1;
    let left = amount;
    if (isValuable(info.drop)) left -= addValuables(record, info.drop, left);
    if (isPlaceableBlock(info.drop)) left -= addBlocks(record, info.drop, left);
    if (left > 0) {
      const owner = findPlayer(ownerId);
      const stack = new ItemStack(info.drop, left);
      if (owner && owner.dimension.id === dim.id && dist(owner.location, ai.location) <= 32) giveItem(owner, stack);
      else dim.spawnItem(stack, center(p));
    }
    addXp(record, blockXp(info.drop));
    countCollected(record, info.drop, amount); // (it's in the 20-minute report)
  }

  const toolId = slot >= 0 ? inventoryOf(record).tools[slot]?.id : undefined;
  if (toolId && wearTool(record, slot) === "broke") {
    dim.playSound("random.break", ai.location);
    findPlayer(ownerId)?.sendMessage(`§c${record.name}'s ${itemName(toolId)} broke!`);
  }
  saveRecord(ownerId, "resource", record);
}

/** Mining with its hands: slot -1, can mine anything. */
const HANDS = { slot: -1, tier: 4, score: 0 };

/** The best pickaxe in its tool slots. @param {import("./data.js").AiRecord} record */
function bestPickaxe(record) {
  /** @type {{ slot: number, tier: number, score: number } | undefined} */
  let best;
  inventoryOf(record).tools.forEach((t, slot) => {
    const m = t ? /^minecraft:(\w+)_pickaxe$/.exec(t.id) : null;
    if (!m || !t) return;
    const tier = PICK_TIER[/** @type {keyof typeof PICK_TIER} */ (m[1])] ?? 0;
    const score = tier * 10 + enchantLevel(t, "efficiency");
    if (!best || score > best.score) best = { slot, tier, score };
  });
  return best;
}

/** @param {Vector3} p */
function floor(p) {
  return { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
}

/** @param {Vector3} p */
function center(p) {
  return { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 };
}

/** @param {Vector3} a @param {Vector3} b */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

