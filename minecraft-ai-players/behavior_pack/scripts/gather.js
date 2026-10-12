// Gathering (Resource AI) and lava safety (both AIs).
//
// The AI finds the nearest block of its focus (within 12 blocks of its owner), walks to a free spot
// next to it (really walking, with gravity, jumping up single blocks, never into lava or off a cliff),
// then mines it. Trees are chopped like a player would: stand next to the trunk and chop the bottom
// two logs, step into that gap (breaking dirt or leaves in the way), chop the rest of the tree from
// there, then go to the next tree. It picks a suitable tool from slots 1-2-3,
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
const WALK_SPEED = 0.2; // blocks per tick (about a player's walking speed)
const JUMP = 0.42; // jump strength for stepping up one block
const STUCK_TICKS = 40; // no progress for this long: give up the walk
const WALK_MS = 15000; // gives up on a walk after this long
const TREE_REACH = 6; // from inside the trunk it reaches logs this far away
const TREE_MS = 120000; // gives up on a tree after this long
/** Blocks it may break to step into the trunk gap. */
const CLEARABLE = /leaves|dirt|grass_block|podzol|mycelium|mud|moss|snow|vine|roots|propagule|_log$|_stem$|_wood$/;
/** Blocks it can walk through (plants, torches, snow...). */
const PASSABLE = /short_grass|tall_grass|fern|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of|torch|sapling|snow_layer|vine|carpet|dead_bush|sweet_berry|leaf_litter|wildflowers/;
const WARN_MS = 30000; // don't repeat the same chat warning more often than this

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/**
 * @typedef {Object} GatherState  Per loaded AI (not saved).
 * @property {{ x: number, y: number, z: number, id: string, until: number, slot: number, reach: number } | undefined} mining
 * @property {TreeJob | undefined} tree  The tree it's chopping.
 * @property {number} pausedUntil
 * @property {number} idleSince
 * @property {Map<string, number>} avoid  Blocks it won't mine for a while (next to lava), key -> until.
 * @property {Map<string, number>} warned  Chat warning -> last time.
 * @property {boolean} walking  Walking to a block (see `walkers`).
 */

/**
 * @typedef {Object} TreeJob
 * @property {Vector3} base  lowest log of the trunk
 * @property {Vector3} stand  where it stands to chop the bottom two logs
 * @property {Vector3[]} logs  every log of this tree
 * @property {"approach" | "base" | "enter" | "chop"} phase
 * @property {boolean} walked  already tried walking for this phase
 * @property {number} until
 */

/** @returns {GatherState} */
export function createGatherState() {
  return { mining: undefined, tree: undefined, pausedUntil: 0, idleSince: Date.now(), avoid: new Map(), warned: new Map(), walking: false };
}

/** Busy with a block or a tree (it should stand still, not wander off). @param {GatherState} state */
export function isBusy(state) {
  return state.walking || !!state.mining || !!state.tree;
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
  state.tree = undefined;
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
    if (!block || block.typeId !== m.id || dist(center(m), eyeOf(ai)) > m.reach + 1) {
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

  if (state.tree) return chopTree(ai, record, state);
  if (state.walking) return undefined; // on its way to a block

  // Find the closest gatherable block in reach.
  const target = findTarget(ai, record, state, ownerId, REACH, owner);
  if (target && isLog(target.id)) {
    startTree(ai, state, target.location);
    return undefined;
  }
  if (!target) {
    // Nothing in reach: walk to the nearest one further away (a tree gets the tree routine).
    const far = findTarget(ai, record, state, ownerId, WALK_RADIUS, owner);
    if (far && isLog(far.id)) {
      startTree(ai, state, far.location);
      state.idleSince = now;
      return undefined;
    }
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
  state.mining = { ...target.location, id: target.id, slot: target.slot, until: system.currentTick + target.ticks, reach: REACH };
  return target.slot;
}

// ================================================================ trees

/** @param {string | undefined} id */
function isLog(id) {
  return !!id && GATHER[id]?.focus === "Wood";
}

/**
 * Plans chopping the tree that `log` belongs to.
 * @param {import("@minecraft/server").Entity} ai
 * @param {GatherState} state
 * @param {Vector3} log
 */
function startTree(ai, state, log) {
  const dim = ai.dimension;
  let base = { ...log };
  while (isLog(dim.getBlock({ ...base, y: base.y - 1 })?.typeId)) base = { ...base, y: base.y - 1 };
  const logs = treeLogs(dim, base);
  const stand = standSpot(dim, base, ai.location, true);
  if (!stand) {
    avoidTree(state, logs);
    return;
  }
  state.tree = { base, stand, logs, phase: "approach", walked: false, until: Date.now() + TREE_MS };
}

/**
 * Every log of the tree: logs connected to the trunk, going up and out (not into the next tree over).
 * @param {import("@minecraft/server").Dimension} dim
 * @param {Vector3} base
 */
function treeLogs(dim, base) {
  const seen = new Set([blockKey(base)]);
  const queue = [base];
  /** @type {Vector3[]} */
  const logs = [];
  while (queue.length > 0 && logs.length < 120) {
    const p = /** @type {Vector3} */ (queue.shift());
    logs.push(p);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const n = { x: p.x + dx, y: p.y + dy, z: p.z + dz };
          if (n.y < base.y || Math.abs(n.x - base.x) > 5 || Math.abs(n.z - base.z) > 5 || n.y > base.y + 30) continue;
          // At ground level only the trunk itself (2x2 trunks), so it doesn't wander into the next tree.
          if (n.y <= base.y + 1 && (dy !== 0 || Math.abs(dx) + Math.abs(dz) !== 1)) continue;
          const k = blockKey(n);
          if (seen.has(k)) continue;
          seen.add(k);
          if (isLog(dim.getBlock(n)?.typeId)) queue.push(n);
        }
      }
    }
  }
  return logs;
}

/**
 * One think of chopping a tree. Returns the tool slot while chopping.
 * @param {import("@minecraft/server").Entity} ai
 * @param {import("./data.js").AiRecord} record
 * @param {GatherState} state
 * @returns {number | undefined}
 */
function chopTree(ai, record, state) {
  const t = /** @type {TreeJob} */ (state.tree);
  const dim = ai.dimension;
  if (Date.now() > t.until) {
    endTree(state, t, true);
    return undefined;
  }
  if (state.walking) return undefined;
  const above = { ...t.base, y: t.base.y + 1 };

  if (t.phase === "approach") {
    // 1. Walk up to the trunk.
    if (flatDist(ai.location, t.stand) > 0.8) {
      if (t.walked) {
        endTree(state, t, true); // couldn't get there
        return undefined;
      }
      t.walked = true;
      startWalking(ai, state, t.stand, above);
      return undefined;
    }
    ai.clearVelocity();
    t.phase = "base";
  }

  if (t.phase === "base") {
    // 2. Stand still and chop the bottom two logs.
    const next = [t.base, above].find((p) => isLog(dim.getBlock(p)?.typeId));
    if (next) return startChop(ai, record, next, REACH + 1, state);
    t.phase = "enter";
    t.walked = false;
  }

  if (t.phase === "enter") {
    // 3. Step into the gap the two logs left, breaking dirt or leaves in the way.
    if (clearGap(dim, record, t.base)) return undefined;
    if (flatDist(ai.location, t.base) > 0.4 || Math.abs(ai.location.y - t.base.y) > 0.6) {
      if (!t.walked) {
        t.walked = true;
        startWalking(ai, state, t.base, { ...t.base, y: t.base.y + 3 });
        return undefined;
      }
      ai.teleport({ x: t.base.x + 0.5, y: t.base.y, z: t.base.z + 0.5 }); // it's one block away: hop in
    }
    ai.clearVelocity();
    t.phase = "chop";
  }

  // 4. Chop the rest of the tree from inside the trunk, lowest logs first.
  const eye = eyeOf(ai);
  const next = t.logs
    .filter((p) => dist(center(p), eye) <= TREE_REACH && isLog(dim.getBlock(p)?.typeId))
    .sort((a, b) => a.y - b.y || dist(center(a), eye) - dist(center(b), eye))[0];
  if (next) return startChop(ai, record, next, TREE_REACH, state);
  endTree(state, t, false); // done: on to the next tree
  return undefined;
}

/**
 * Starts mining a log (the mining part of gather() finishes it).
 * @param {import("@minecraft/server").Entity} ai
 * @param {import("./data.js").AiRecord} record
 * @param {Vector3} p
 * @param {number} reach
 * @param {GatherState} state
 */
function startChop(ai, record, p, reach, state) {
  const id = /** @type {string} */ (ai.dimension.getBlock(p)?.typeId);
  const info = GATHER[id];
  const tool = toolFor(record, info) ?? { slot: -1, speed: 1 };
  const ticks = Math.min(400, Math.max(4, Math.ceil((info.hardness * 30) / tool.speed)));
  state.mining = { ...p, id, slot: tool.slot, until: system.currentTick + ticks, reach };
  face(ai, center(p));
  return tool.slot;
}

/**
 * Breaks dirt or leaves where the AI's feet and head go in the trunk gap. Returns true if it broke something.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {import("./data.js").AiRecord} record
 * @param {Vector3} base
 */
function clearGap(dim, record, base) {
  let broke = false;
  for (const p of [base, { ...base, y: base.y + 1 }]) {
    const block = dim.getBlock(p);
    if (!block || passable(block) || !CLEARABLE.test(block.typeId)) continue;
    const id = block.typeId;
    dim.setBlockType(p, "minecraft:air");
    dim.playSound(/leaves/.test(id) ? "dig.grass" : "dig.gravel", p);
    const drop = /grass_block|podzol|mycelium/.test(id) ? "minecraft:dirt" : id;
    if (!/leaves|vine|snow/.test(id) && isPlaceableBlock(drop)) addBlocks(record, drop, 1);
    broke = true;
  }
  return broke;
}

/** @param {GatherState} state @param {TreeJob} t @param {boolean} failed */
function endTree(state, t, failed) {
  if (failed) avoidTree(state, t.logs);
  state.tree = undefined;
  state.mining = undefined;
  state.idleSince = Date.now();
}

/** Skip this tree for a minute. @param {GatherState} state @param {Vector3[]} logs */
function avoidTree(state, logs) {
  const until = Date.now() + 60000;
  for (const p of logs) state.avoid.set(blockKey(p), until);
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

/**
 * @typedef {{ ai: import("@minecraft/server").Entity, state: GatherState, stand: Vector3, block: Vector3, until: number, stuck: number, last: Vector3 }} Walker
 */
/** AIs walking to a block. @type {Map<string, Walker>} */
const walkers = new Map();

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {GatherState} state
 * @param {Vector3} stand  feet position to walk to
 * @param {Vector3} block  the block it will mine
 */
function startWalking(ai, state, stand, block) {
  walkers.set(ai.id, { ai, state, stand, block, until: Date.now() + WALK_MS, stuck: 0, last: { ...ai.location } });
  state.walking = true;
}

/** @param {string} aiId @param {GatherState} state */
function stopWalking(aiId, state) {
  walkers.delete(aiId);
  state.walking = false;
}

// Walking AIs take a real step every tick: pushed along the ground (so gravity and the walking
// animation work), jumping up single blocks.
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
}, 1);

/**
 * @param {string} id
 * @param {Walker} w
 */
function step(id, w) {
  const ai = w.ai;
  const dim = ai.dimension;
  const p = ai.location;
  const dx = w.stand.x + 0.5 - p.x;
  const dz = w.stand.z + 0.5 - p.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3 && Math.abs(p.y - w.stand.y) < 1) {
    ai.clearVelocity();
    stopWalking(id, w.state); // arrived: the next think starts work
    return;
  }

  // Not getting anywhere: give up.
  if (Math.hypot(p.x - w.last.x, p.z - w.last.z) > 0.05 || Math.abs(p.y - w.last.y) > 0.3) {
    w.last = { ...p };
    w.stuck = 0;
  } else if (++w.stuck > STUCK_TICKS) {
    giveUp(id, w);
    return;
  }

  const ux = dx / d;
  const uz = dz / d;
  ai.setRotation({ x: 0, y: (Math.atan2(-ux, uz) * 180) / Math.PI });
  const fy = Math.floor(p.y + 0.01);
  const ahead = { x: Math.floor(p.x + ux * 0.7), y: fy, z: Math.floor(p.z + uz * 0.7) };
  let jump = false;
  if (ahead.x !== Math.floor(p.x) || ahead.z !== Math.floor(p.z)) {
    if (!free(dim, ahead)) {
      if (breakLeaves(dim, ahead)) return; // leaves in the way: break through
      const up = { ...ahead, y: fy + 1 };
      const room = passable(dim.getBlock({ x: Math.floor(p.x), y: fy + 2, z: Math.floor(p.z) }));
      if (!free(dim, up) || !room) return; // a wall: wait (gives up if it stays stuck)
      jump = ai.isOnGround;
    } else {
      // Never walk into lava or off a drop of more than 3 blocks.
      const below = [1, 2, 3].map((k) => dim.getBlock({ ...ahead, y: fy - k }));
      if (below.some((b) => b && LAVA.includes(b.typeId)) || below.every((b) => passable(b))) {
        giveUp(id, w);
        return;
      }
    }
  }
  const v = ai.getVelocity();
  const speed = Math.min(WALK_SPEED, d);
  ai.applyImpulse({ x: ux * speed - v.x, y: jump ? JUMP - Math.max(0, v.y) : 0, z: uz * speed - v.z });
}

/**
 * Breaks leaves at the feet and head height of a spot. Returns true if it broke any.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {Vector3} cell
 */
function breakLeaves(dim, cell) {
  let broke = false;
  for (const p of [cell, { ...cell, y: cell.y + 1 }]) {
    if (!LEAVES.includes(dim.getBlock(p)?.typeId ?? "")) continue;
    dim.setBlockType(p, "minecraft:air");
    dim.playSound("dig.grass", p);
    broke = true;
  }
  return broke;
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
 * @param {boolean} [level]  a tree trunk: prefer standing level with it
 */
function standSpot(dim, block, from, level = false) {
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
      const d = dist(feet, from) + (level ? Math.abs(dy) * 4 : 0);
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

/** @param {Vector3} p */
function blockKey(p) {
  return `${p.x},${p.y},${p.z}`;
}

/** @param {import("@minecraft/server").Entity} ai */
function eyeOf(ai) {
  return { x: ai.location.x, y: ai.location.y + 1.6, z: ai.location.z };
}

/** Turns the AI to look at a point. @param {import("@minecraft/server").Entity} ai @param {Vector3} p */
function face(ai, p) {
  const eye = eyeOf(ai);
  const dx = p.x - eye.x;
  const dz = p.z - eye.z;
  const pitch = (-Math.atan2(p.y - eye.y, Math.hypot(dx, dz)) * 180) / Math.PI;
  ai.setRotation({ x: pitch, y: (Math.atan2(-dx, dz) * 180) / Math.PI });
}

/** Distance ignoring height. @param {Vector3} a @param {Vector3} b */
function flatDist(a, b) {
  return Math.hypot(a.x - (b.x + 0.5), a.z - (b.z + 0.5));
}

/** @param {Vector3} a @param {Vector3} b */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
