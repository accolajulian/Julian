// Gathering (Resource AI) and lava safety (both AIs).
//
// The AI finds the nearest block of its focus (within 12 blocks of its owner), walks to a free spot
// next to it (stepping up blocks, never into lava or off a cliff), then mines it: it picks a suitable tool from slots 1-2-3,
// takes as long as a player would, puts the drops in its valuables / block slots (anything else goes to
// its owner), and never mines
// next to lava. Lava near any AI gets covered with blocks from its block slots, or the AI backs away.
import { system, BlockVolume, ItemStack } from "@minecraft/server";
import { GATHER } from "./gather_data.js";
import { saveRecord, findPlayer, giveItem } from "./data.js";
import {
  inventoryOf,
  takeBlock,
  addBlocks,
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
const IDLE_MS = 25000; // nothing to mine for this long: take a short break from looking
const WALK_RADIUS = 14; // how far it looks for blocks to walk to
const OWNER_RANGE = 12; // only gathers this close to its owner
const WALK_STEP = 0.22; // blocks per step; a step every 2 ticks is about 2 blocks a second
const WALK_MS = 15000; // gives up on a walk after this long
/** Blocks it can walk through (plants, torches, snow...). */
const PASSABLE = /short_grass|tall_grass|fern|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of|torch|sapling|snow_layer|vine|carpet|dead_bush|sweet_berry|leaf_litter|wildflowers/;
const WARN_MS = 30000; // don't repeat the same chat warning more often than this

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/**
 * @typedef {Object} GatherState  Per loaded AI (not saved).
 * @property {{ x: number, y: number, z: number, id: string, until: number, slot: number } | undefined} mining
 * @property {number} pausedUntil
 * @property {number} idleSince
 * @property {Map<string, number>} avoid  Blocks it won't mine for a while (next to lava), key -> until.
 * @property {Map<string, number>} warned  Chat warning -> last time.
 * @property {boolean} walking  Walking to a block (see `walkers`).
 */

/** @returns {GatherState} */
export function createGatherState() {
  return { mining: undefined, pausedUntil: 0, idleSince: Date.now(), avoid: new Map(), warned: new Map(), walking: false };
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
    (covered === 0 ? " §7Right click it and add blocks (Inventory > Blocks) so it can cover lava." : ""));
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
 * Stops mining and walking when the AI shouldn't gather right now (fighting, lava, healing, no focus).
 * @param {import("@minecraft/server").Entity} ai
 * @param {GatherState} state
 * @param {string} focus
 * @param {boolean} canGather
 */
export function setGatherBehavior(ai, state, focus, canGather) {
  if (canGather && focus !== "Nothing" && Date.now() >= state.pausedUntil) return;
  state.mining = undefined;
  stopWalking(ai.id, state);
}

/**
 * Mines one block at a time near the AI. Returns the tool slot it's using (or -1 for its hand),
 * or undefined when it isn't mining.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 * @param {GatherState} state
 * @param {import("@minecraft/server").Player | undefined} owner
 * @returns {number | undefined}
 */
export function gather(ai, ownerId, record, state, owner) {
  const now = Date.now();
  if (record.focus === "Nothing" || now < state.pausedUntil) return undefined;

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
    finishMining(ai, ownerId, record, state, m, owner);
    state.mining = undefined;
    state.idleSince = now;
    return undefined;
  }

  if (state.walking) return undefined; // on its way to a block

  // Find the closest gatherable block in reach.
  const target = findTarget(ai, record, state, ownerId, REACH, owner);
  if (!target) {
    // Nothing in reach: walk to the nearest one further away.
    const far = findTarget(ai, record, state, ownerId, WALK_RADIUS, owner);
    if (far) {
      const stand = standSpot(dim, far.location, ai.location);
      if (stand) {
        startWalking(ai, state, stand, far.location);
        state.idleSince = now;
        return undefined;
      }
      state.avoid.set(`${far.location.x},${far.location.y},${far.location.z}`, now + 60000);
    }
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
 * @param {number} radius  how far from its eyes to look
 * @param {import("@minecraft/server").Player | undefined} owner
 */
function findTarget(ai, record, state, ownerId, radius, owner) {
  const dim = ai.dimension;
  const feet = floor(ai.location);
  const types = Object.keys(GATHER).filter((id) => record.focus === "Everything" || GATHER[id].focus === record.focus);
  const r = Math.ceil(radius);
  const volume = new BlockVolume({ x: feet.x - r, y: feet.y - 4, z: feet.z - r }, { x: feet.x + r, y: feet.y + 6, z: feet.z + r });
  const nearOwner = owner && owner.dimension.id === dim.id ? owner.location : undefined;
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
    if (d > radius || (best && d >= best.d)) continue;
    // Stay close to its owner.
    if (nearOwner && dist(center(p), nearOwner) > OWNER_RANGE) continue;
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
 * @param {import("@minecraft/server").Player | undefined} owner
 */
function finishMining(ai, ownerId, record, state, m, owner) {
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

  // Drops go to its valuables / block slots; anything that doesn't fit goes to its owner (or is dropped).
  const amount = info.min !== undefined && info.max !== undefined
    ? info.min + Math.floor(Math.random() * (info.max - info.min + 1))
    : 1;
  let left = amount;
  if (isValuable(info.drop)) left -= addValuables(record, info.drop, left);
  if (isPlaceableBlock(info.drop)) left -= addBlocks(record, info.drop, left);
  if (left > 0) {
    const stack = new ItemStack(info.drop, left);
    const ownerClose = owner && owner.dimension.id === dim.id && dist(owner.location, ai.location) <= 32;
    if (ownerClose) giveItem(owner, stack);
    else dim.spawnItem(stack, center(m));
  }

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

// ================================================================ walking

/** AIs walking to a block. @type {Map<string, { ai: import("@minecraft/server").Entity, state: GatherState, stand: Vector3, block: Vector3, until: number, stuck: number }>} */
const walkers = new Map();

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {GatherState} state
 * @param {Vector3} stand  feet position to walk to
 * @param {Vector3} block  the block it will mine
 */
function startWalking(ai, state, stand, block) {
  walkers.set(ai.id, { ai, state, stand, block, until: Date.now() + WALK_MS, stuck: 0 });
  state.walking = true;
}

/** @param {string} aiId @param {GatherState} state */
function stopWalking(aiId, state) {
  walkers.delete(aiId);
  state.walking = false;
}

// Move walking AIs a small step every 2 ticks.
system.runInterval(() => {
  for (const [id, w] of walkers) {
    if (!w.ai.isValid || Date.now() > w.until) {
      stopWalking(id, w.state);
      continue;
    }
    try {
      step(id, w);
    } catch {
      stopWalking(id, w.state);
    }
  }
}, 2);

/**
 * @param {string} id
 * @param {{ ai: import("@minecraft/server").Entity, state: GatherState, stand: Vector3, block: Vector3, until: number, stuck: number }} w
 */
function step(id, w) {
  const dim = w.ai.dimension;
  const p = w.ai.location;
  const tx = w.stand.x + 0.5;
  const tz = w.stand.z + 0.5;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.35) {
    stopWalking(id, w.state); // arrived: the next think starts mining
    return;
  }
  const s = Math.min(WALK_STEP, d);
  const nx = p.x + (dx / d) * s;
  const nz = p.z + (dz / d) * s;
  const fy = Math.floor(p.y + 0.01);
  const cell = { x: Math.floor(nx), y: fy, z: Math.floor(nz) };
  let ny = p.y;

  if (!free(dim, cell)) {
    // Step up one block if there's room.
    const up = { ...cell, y: fy + 1 };
    if (free(dim, up) && passable(dim.getBlock({ x: Math.floor(p.x), y: fy + 2, z: Math.floor(p.z) }))) {
      ny = fy + 1;
    } else {
      if (++w.stuck > 12) giveUp(id, w);
      return;
    }
  }
  // Never walk into lava or off a drop of more than 2 blocks.
  const landing = Math.floor(ny);
  const below = [1, 2, 3].map((k) => dim.getBlock({ ...cell, y: landing - k }));
  if (below.some((b) => b && LAVA.includes(b.typeId)) || below.every((b) => passable(b))) {
    giveUp(id, w);
    return;
  }
  w.ai.teleport({ x: nx, y: ny, z: nz }, { facingLocation: { x: w.block.x + 0.5, y: w.block.y + 0.5, z: w.block.z + 0.5 } });
  w.stuck = 0;
}

/** Can't get there: skip that block for a minute. */
/** @param {string} id @param {{ state: GatherState, block: Vector3 }} w */
function giveUp(id, w) {
  w.state.avoid.set(`${w.block.x},${w.block.y},${w.block.z}`, Date.now() + 60000);
  stopWalking(id, w.state);
}

/**
 * A free spot next to a block where the AI can stand and reach it.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {Vector3} block
 * @param {Vector3} from
 */
function standSpot(dim, block, from) {
  /** @type {Vector3 | undefined} */
  let best;
  let bestD = Infinity;
  const sides = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [sx, sz] of sides) {
    for (const dy of [0, -1, -2, -3, 1]) {
      const feet = { x: block.x + sx, y: block.y + dy, z: block.z + sz };
      if (!free(dim, feet)) continue;
      const floorBlock = dim.getBlock({ ...feet, y: feet.y - 1 });
      if (!floorBlock || passable(floorBlock) || LAVA.includes(floorBlock.typeId)) continue;
      const eye = { x: feet.x + 0.5, y: feet.y + 1.6, z: feet.z + 0.5 };
      if (dist(eye, center(block)) > REACH) continue;
      const d = dist(feet, from);
      if (d < bestD) {
        best = feet;
        bestD = d;
      }
    }
  }
  return best;
}

/** Room for the AI's feet and head. */
/** @param {import("@minecraft/server").Dimension} dim @param {Vector3} feet */
function free(dim, feet) {
  return passable(dim.getBlock(feet)) && passable(dim.getBlock({ ...feet, y: feet.y + 1 }));
}

/** @param {import("@minecraft/server").Block | undefined} block */
function passable(block) {
  if (!block) return false;
  return block.isAir || (block.isLiquid && !LAVA.includes(block.typeId)) || PASSABLE.test(block.typeId);
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
