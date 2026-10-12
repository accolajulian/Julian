// Gathering (Resource AI) and lava safety (both AIs).
//
// Walking to blocks is done by the AI's own "move_to_block" behavior (see make_entity_targets.py).
// This file does the mining once the AI is close: it picks a suitable tool from slots 1-2-3,
// takes as long as a player would, puts the drops in its valuables / block slots / backpack, and never mines
// next to lava. Lava near any AI gets covered with blocks from its block slots, or the AI backs away.
import { system, BlockVolume, ItemStack } from "@minecraft/server";
import { GATHER } from "./gather_data.js";
import { saveRecord, findPlayer } from "./data.js";
import {
  inventoryOf,
  takeBlock,
  addBlocks,
  addToBag,
  bagCount,
  BAG_CAPACITY,
  wearTool,
  enchantLevel,
  itemName,
  isPlaceableBlock,
  isValuable,
  addValuables,
} from "./inventory.js";

const LAVA = ["minecraft:lava", "minecraft:flowing_lava"];
const LEAVES = [
  ...["oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak", "azalea"].map(
    (w) => `minecraft:${w}_leaves`
  ),
  "minecraft:azalea_leaves_flowered",
  "minecraft:nether_wart_block",
  "minecraft:warped_wart_block",
];
const REACH = 3.5;
const MATERIAL_TIER = { wooden: 0, golden: 0, stone: 1, iron: 2, diamond: 3, netherite: 4 };
const MATERIAL_SPEED = { wooden: 2, stone: 4, iron: 6, diamond: 8, netherite: 9, golden: 12 };
const IDLE_MS = 25000; // nothing to mine for this long: stop walking to blocks for a bit
const WARN_MS = 30000; // don't repeat the same chat warning more often than this

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/**
 * @typedef {Object} GatherState  Per loaded AI (not saved).
 * @property {{ x: number, y: number, z: number, id: string, until: number, slot: number } | undefined} mining
 * @property {number} pausedUntil
 * @property {number} idleSince
 * @property {Map<string, number>} avoid  Blocks it won't mine for a while (next to lava), key -> until.
 * @property {Map<string, number>} warned  Chat warning -> last time.
 * @property {string | undefined} groupEvent  The gather event currently applied.
 */

/** @returns {GatherState} */
export function createGatherState() {
  return { mining: undefined, pausedUntil: 0, idleSince: Date.now(), avoid: new Map(), warned: new Map(), groupEvent: undefined };
}

// ================================================================ lava safety (both AIs)

/**
 * Covers nearby lava with blocks from the block slots, or backs away from it.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").RoleId} role
 * @param {import("./data.js").AiRecord} record
 * @param {GatherState} state
 * @returns {boolean} true if there is still lava close by
 */
export function avoidLava(ai, ownerId, role, record, state) {
  const dim = ai.dimension;
  const feet = floor(ai.location);

  // Standing in lava: get out right away.
  const here = [feet, { ...feet, y: feet.y + 1 }].some((p) => LAVA.includes(dim.getBlock(p)?.typeId ?? ""));
  if (here) {
    const owner = findPlayer(ownerId);
    if (owner && owner.dimension.id === dim.id) ai.teleport(owner.location);
    else ai.applyImpulse({ x: 0, y: 0.6, z: 0 });
    state.mining = undefined;
    return true;
  }

  const lava = lavaAround(dim, feet, 2, 1);
  if (lava.length === 0) return false;

  // Cover the closest lava blocks (up to 3 at a time) with blocks it carries.
  lava.sort((a, b) => dist(a, ai.location) - dist(b, ai.location));
  let covered = 0;
  for (const spot of lava.slice(0, 3)) {
    const block = takeBlock(record);
    if (!block) break;
    dim.setBlockType(spot, block);
    covered++;
  }
  if (covered > 0) {
    saveRecord(ownerId, role, record);
    dim.playSound("dig.stone", ai.location);
    if (covered === lava.length) return false;
  }

  // Still lava: back away from it and stop mining for a bit.
  const center = lava.reduce((c, p) => ({ x: c.x + p.x / lava.length, y: 0, z: c.z + p.z / lava.length }), { x: 0, y: 0, z: 0 });
  const away = { x: ai.location.x - (center.x + 0.5), z: ai.location.z - (center.z + 0.5) };
  const len = Math.hypot(away.x, away.z) || 1;
  ai.applyImpulse({ x: (away.x / len) * 0.45, y: 0.15, z: (away.z / len) * 0.45 });
  state.mining = undefined;
  state.pausedUntil = Date.now() + 10000;
  warn(state, ownerId, "lava", `§6${record.name} found lava and backed away.` +
    (covered === 0 ? " §7Give it blocks (Inventory > Blocks) so it can cover lava." : ""));
  return true;
}

/**
 * Lava blocks in a box around a point.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {Vector3} center
 * @param {number} radius
 * @param {number} height
 */
function lavaAround(dim, center, radius, height) {
  const volume = new BlockVolume(
    { x: center.x - radius, y: center.y - height, z: center.z - radius },
    { x: center.x + radius, y: center.y + height, z: center.z + radius }
  );
  try {
    return [...dim.getBlocks(volume, { includeTypes: LAVA }).getBlockLocationIterator()];
  } catch {
    return []; // part of the box is unloaded or outside the world
  }
}

/** Lava touching a block (6 sides). */
/** @param {import("@minecraft/server").Dimension} dim @param {Vector3} p */
function lavaNextTo(dim, p) {
  const sides = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
    { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  ];
  return sides
    .map((d) => ({ x: p.x + d.x, y: p.y + d.y, z: p.z + d.z }))
    .filter((s) => LAVA.includes(dim.getBlock(s)?.typeId ?? ""));
}

// ================================================================ gathering (Resource AI)

/**
 * Turns the AI's walking-to-blocks behavior on/off to match its focus and situation.
 * @param {import("@minecraft/server").Entity} ai
 * @param {GatherState} state
 * @param {string} focus
 * @param {boolean} canGather
 */
export function setGatherBehavior(ai, state, focus, canGather) {
  const on = canGather && focus !== "Nothing" && Date.now() >= state.pausedUntil;
  const event = on ? `aip:gather_${focus.toLowerCase()}` : "aip:gather_off";
  if (state.groupEvent !== event) {
    ai.triggerEvent(event);
    state.groupEvent = event;
  }
  if (!on) state.mining = undefined;
}

/**
 * Mines one block at a time near the AI. Returns the tool slot it's using (or -1 for its hand),
 * or undefined when it isn't mining.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 * @param {GatherState} state
 * @returns {number | undefined}
 */
export function gather(ai, ownerId, record, state) {
  const now = Date.now();
  if (record.focus === "Nothing" || now < state.pausedUntil) return undefined;
  if (bagCount(record) >= BAG_CAPACITY) {
    warn(state, ownerId, "full", `§e${record.name}'s backpack is full. Hit it and open Inventory > Backpack.`);
    state.pausedUntil = now + 15000;
    return undefined;
  }

  const dim = ai.dimension;
  const m = state.mining;
  if (m) {
    const block = dim.getBlock(m);
    if (!block || block.typeId !== m.id || dist(center(m), ai.location) > REACH + 1.5) {
      state.mining = undefined;
      return undefined;
    }
    if (system.currentTick < m.until) {
      ai.playAnimation("animation.aip.ai_player.mine");
      return m.slot;
    }
    finishMining(ai, ownerId, record, state, m);
    state.mining = undefined;
    state.idleSince = now;
    return undefined;
  }

  // Find the closest gatherable block in reach.
  const target = findTarget(ai, record, state, ownerId);
  if (!target) {
    if (now - state.idleSince > IDLE_MS) {
      // Probably stuck walking to something it can't mine: take a short break, then look again.
      state.pausedUntil = now + 15000;
      state.idleSince = now + 15000;
    }
    return undefined;
  }
  state.mining = { ...target.location, id: target.id, slot: target.slot, until: system.currentTick + target.ticks };
  return target.slot;
}

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {import("./data.js").AiRecord} record
 * @param {GatherState} state
 * @param {string} ownerId
 */
function findTarget(ai, record, state, ownerId) {
  const dim = ai.dimension;
  const feet = floor(ai.location);
  const types = Object.keys(GATHER).filter((id) => record.focus === "Everything" || GATHER[id].focus === record.focus);
  const volume = new BlockVolume({ x: feet.x - 4, y: feet.y - 2, z: feet.z - 4 }, { x: feet.x + 4, y: feet.y + 3, z: feet.z + 4 });
  let found;
  try {
    found = [...dim.getBlocks(volume, { includeTypes: types }).getBlockLocationIterator()];
  } catch {
    return undefined;
  }

  const now = Date.now();
  const eye = { x: ai.location.x, y: ai.location.y + 1.5, z: ai.location.z };
  /** @type {{ location: Vector3, id: string, slot: number, ticks: number, d: number } | undefined} */
  let best;
  let missingTool;
  for (const p of found) {
    const d = dist(center(p), eye);
    if (d > REACH || (best && d >= best.d)) continue;
    const key = `${p.x},${p.y},${p.z}`;
    if ((state.avoid.get(key) ?? 0) > now) continue;
    // Don't dig out the block it's standing on.
    if (p.x === feet.x && p.z === feet.z && p.y === feet.y - 1) continue;
    const id = dim.getBlock(p)?.typeId;
    const info = id ? GATHER[id] : undefined;
    if (!id || !info) continue;
    // Only chop real trees (logs with leaves above them), not someone's log house.
    if (info.focus === "Wood" && !hasLeavesAbove(dim, p)) continue;
    const tool = toolFor(record, info);
    if (!tool) {
      missingTool = info;
      continue;
    }
    // Never mine next to lava.
    if (lavaNextTo(dim, p).length > 0) {
      state.avoid.set(key, now + 120000);
      continue;
    }
    const ticks = Math.min(400, Math.max(4, Math.ceil((info.hardness * 30) / tool.speed)));
    best = { location: p, id, slot: tool.slot, ticks, d };
  }

  if (!best && missingTool) {
    const need = missingTool.tier >= 2 ? "an iron pickaxe or better" : missingTool.tier === 1 ? "a stone pickaxe or better" : "a pickaxe";
    warn(state, ownerId, `tool${missingTool.tier}`, `§e${record.name} needs ${need} in a tool slot to mine that.`);
  }
  return best;
}

/**
 * Breaks the block and stores what it drops.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 * @param {GatherState} state
 * @param {{ x: number, y: number, z: number, id: string, slot: number }} m
 */
function finishMining(ai, ownerId, record, state, m) {
  const dim = ai.dimension;
  const info = GATHER[m.id];
  if (!info) return;

  // Check for lava once more: it may have flowed in. Cover it if possible, otherwise leave the block.
  const lava = lavaNextTo(dim, m);
  for (const spot of lava) {
    const block = takeBlock(record);
    if (!block) {
      state.avoid.set(`${m.x},${m.y},${m.z}`, Date.now() + 120000);
      saveRecord(ownerId, "resource", record);
      warn(state, ownerId, "lava", `§6${record.name} found lava behind that block and left it alone.`);
      return;
    }
    dim.setBlockType(spot, block);
  }

  dim.setBlockType(m, "minecraft:air");
  dim.playSound(info.tool === "axe" ? "dig.wood" : "dig.stone", m);

  // Drops go to the block slots (if they're building blocks) and then the backpack.
  const amount = info.min !== undefined && info.max !== undefined
    ? info.min + Math.floor(Math.random() * (info.max - info.min + 1))
    : 1;
  let left = amount;
  if (isValuable(info.drop)) left -= addValuables(record, info.drop, left);
  if (isPlaceableBlock(info.drop)) left -= addBlocks(record, info.drop, left);
  left -= addToBag(record, info.drop, left);
  if (left > 0) dim.spawnItem(new ItemStack(info.drop, left), center(m)); // no room: drop it

  // Wear the tool. If it breaks, the next think uses the next suitable slot.
  if (m.slot >= 0) {
    const toolId = inventoryOf(record).tools[m.slot]?.id;
    if (wearTool(record, m.slot) === "broke" && toolId) {
      dim.playSound("random.break", ai.location);
      findPlayer(ownerId)?.sendMessage(`§c${record.name}'s ${itemName(toolId)} broke!`);
    }
  }
  saveRecord(ownerId, "resource", record);
}

/**
 * The first tool slot (1, 2, 3) that can mine this block, and how fast. Hand counts for logs.
 * @param {import("./data.js").AiRecord} record
 * @param {{ tool: string, tier: number, required: boolean }} info
 */
function toolFor(record, info) {
  const tools = inventoryOf(record).tools;
  for (let slot = 0; slot < tools.length; slot++) {
    const tool = tools[slot];
    const match = tool ? /^minecraft:(\w+?)_(pickaxe|axe|shovel|hoe)$/.exec(tool.id) : null;
    if (!tool || !match || match[2] !== info.tool) continue;
    const material = /** @type {keyof typeof MATERIAL_TIER} */ (match[1]);
    if (info.tool === "pickaxe" && (MATERIAL_TIER[material] ?? 0) < info.tier) continue;
    const efficiency = enchantLevel(tool, "efficiency");
    const speed = (MATERIAL_SPEED[material] ?? 1) + (efficiency > 0 ? efficiency * efficiency + 1 : 0);
    return { slot, speed };
  }
  return info.required ? undefined : { slot: -1, speed: 1 };
}

/** @param {import("@minecraft/server").Dimension} dim @param {Vector3} p */
function hasLeavesAbove(dim, p) {
  const volume = new BlockVolume({ x: p.x - 2, y: p.y + 1, z: p.z - 2 }, { x: p.x + 2, y: p.y + 8, z: p.z + 2 });
  try {
    return dim.containsBlock(volume, { includeTypes: LEAVES });
  } catch {
    return false;
  }
}

// ================================================================ helpers

/**
 * @param {GatherState} state
 * @param {string} ownerId
 * @param {string} kind
 * @param {string} message
 */
function warn(state, ownerId, kind, message) {
  const now = Date.now();
  if (now - (state.warned.get(kind) ?? 0) < WARN_MS) return;
  state.warned.set(kind, now);
  findPlayer(ownerId)?.sendMessage(message);
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
