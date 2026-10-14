// Gathering (Resource AI) and lava safety (both AIs).
//
// The AI finds the nearest block of its focus (within 12 blocks of its owner), walks to a free spot
// next to it (really walking, with gravity, jumping up single blocks, never into lava). To get down
// into a ravine (or back up a wall) it pours its own infinite water bucket and swims, then picks the
// water back up.
// then mines it. Trees are chopped like a player would: stand next to the trunk and chop the bottom
// two logs, step into that gap (breaking dirt or leaves in the way), chop the rest of the tree from
// there, then go to the next tree. It picks a suitable tool from slots 1-2-3,
// takes as long as a player would, puts the drops in its valuables / block slots (anything else goes to
// its owner), and never mines
// next to lava. Lava near any AI gets covered with blocks from its block slots, or the AI backs away.
import { system, BlockVolume, ItemStack } from "@minecraft/server";
import { GATHER, FOCUS_TYPES } from "./gather_data.js";
import { FARM_FOCUS, farmKinds, farmCollect } from "./farm.js";
import { createScoutState, scout } from "./scout.js";
import { caveBlocks, CAVE_LEASH } from "./caves.js";
import { isDropping, startDrop } from "./mlg.js";
import { boatOf, spawnBoat, leaveBoat } from "./boats.js";
import { countCollected } from "./levels.js";
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
  isWood,
  addWood,
  canTakeWood,
  takeValuable,
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
const SPRINT_SPEED = 0.28; // jump sprinting (collecting for a sugar cane farm)
const TRAVEL_ARRIVED = 4; // close enough to a scouted spot
const HOP_AFTER = 30; // ticks stuck on a long trip before it hops over the obstacle
const JUMP = 0.5; // jump strength for stepping up one block
const STEP_UP_AFTER = 6; // ticks against a 1-block step before it just hops up onto it
const TREE_DONE_MS = 600000; // logs it couldn't reach on a tree it finished: skipped for 10 minutes
/** Blocks it breaks through when they're in its way (instead of giving up). */
const SOFT = /leaves|^minecraft:(dirt|coarse_dirt|grass_block|podzol|mycelium|mud|rooted_dirt|sand|red_sand|gravel|snow|snow_layer|vine|moss_block|clay)$/;
const STUCK_TICKS = 40; // no progress for this long: give up the walk
const WALK_MS = 15000; // gives up on a walk after this long
const TRUNK_REACH = 64; // standing inside the trunk it can chop every log of its tree, however far up
const TREE_SEARCH = 24; // looks for the closest tree trunk this far around itself
const TREE_MS = 120000; // gives up on a tree after this long
/** Blocks it may break to step into the trunk gap. */
const WATER_MS = 15000; // gives up swimming after this long
const WATER_DEPTH = 24; // deepest ravine it will swim down
const WATER_HEIGHT = 16; // highest wall it will swim up
/** Blocks it can walk through (plants, torches, snow...). */
const PASSABLE = /short_grass|tall_grass|fern|flower|tulip|poppy|dandelion|orchid|allium|bluet|daisy|cornflower|lily_of|torch|sapling|snow_layer|vine|carpet|dead_bush|sweet_berry|leaf_litter|wildflowers|glow_lichen/;
const WARN_MS = 30000; // don't repeat the same chat warning more often than this
const UNSTICK_MS = 30000; // on Trees/farm: in the same spot with nothing mined this long, it moves on
const BOAT_REACH = 4.5; // from a boat it digs sand this far away
const BOAT_SCAN = 40; // looks this far for sand by the water
const TURN = 0.35; // how much of the way it turns its head each tick (smooth, no snapping)
const TOOL_WARN_MS = 300000; // "needs a pickaxe" at most every 5 minutes
const TABLE_TICKS = 30; // its crafting table stays out this long, then it picks it back up
/** Natural ground it may dig through to climb out of a pit (never anything built, never ores). */
const DIGGABLE = /leaves|^minecraft:(dirt|coarse_dirt|grass_block|dirt_with_roots|podzol|mycelium|mud|rooted_dirt|clay|gravel|sand|red_sand|stone|deepslate|tuff|granite|diorite|andesite|calcite|dripstone_block|netherrack|soul_sand|soul_soil|moss_block|snow|snow_layer|terracotta|\w+_terracotta|sandstone|red_sandstone|blackstone|basalt|end_stone)$/;
const DIG_TICKS = 8; // one block every this many ticks when digging out

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
 * @property {boolean} sprint  Jump sprint (collecting for a sugar cane farm).
 * @property {import("./scout.js").ScoutState} scout  Looking around the map for the best spot.
 * @property {number} speed  Walking speed multiplier from its level.
 * @property {boolean} lost  It scouted and found nothing anywhere: it may stroll around to explore.
 * @property {number} stuckSince  When scouting stopped giving it anywhere new to go (0: it isn't stuck).
 * @property {CaveState} cave  Exploring caves.
 * @property {Vector3 | undefined} anchor  where it was when it last moved a few blocks
 * @property {number} anchorAt
 * @property {number} minedAt  when it last mined something
 */

/**
 * @typedef {Object} TreeJob
 * @property {Vector3} base  lowest log of the trunk
 * @property {Vector3} stand  where it stands next to the trunk to chop the bottom two logs
 * @property {Vector3[]} logs  every log of this tree (even ones not quite connected to it)
 * @property {"approach" | "base" | "enter" | "chop"} phase
 * @property {boolean} walked  already walked for this phase
 * @property {number} until
 */

/** @returns {GatherState} */
export function createGatherState() {
  return {
    mining: undefined, tree: undefined, pausedUntil: 0, idleSince: Date.now(), avoid: new Map(), warned: new Map(),
    walking: false, sprint: false, scout: createScoutState(), speed: 1, lost: false, stuckSince: 0,
    cave: { visited: new Map(), tunnel: undefined, dig: undefined, plannedAt: 0, turn: 0 },
    anchor: undefined, anchorAt: Date.now(), minedAt: Date.now(),
  };
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

  const lava = lavaAround(dim, feet, 1, 1); // only lava right next to it (it never walks into lava anyway)
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
  warn(state, ownerId, "lava", `§6${record.name} found lava and backed away.`);
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
  if (isDropping(ai.id)) return undefined; // mid water-bucket drop

  const dim = ai.dimension;
  const farming = record.focus === FARM_FOCUS;
  state.sprint = farming;
  state.speed = 1;
  // The right tool for the job: an axe for trees (it crafts a wooden one once it has wood; until then
  // it chops by hand), a pickaxe for caves (it crafts a stone one from its cobblestone and a log).
  if (record.focus === "Trees") craftTool(ai, record, ownerId, "axe", state);
  const needSand = farming && farmKinds(record).includes("Sand");
  if (needSand) craftTool(ai, record, ownerId, "shovel", state);
  // Not getting anywhere (same spot, nothing mined for 30 seconds): skip what's around here and move on.
  if (record.focus === "Trees" || farming) {
    if (!state.anchor || dist(ai.location, state.anchor) > 3) {
      state.anchor = { ...ai.location };
      state.anchorAt = now;
    } else if (now - state.anchorAt > UNSTICK_MS && now - state.minedAt > UNSTICK_MS) {
      skipNearby(ai, state, farming ? farmKinds(record) : ["Wood"]);
      state.tree = undefined;
      state.mining = undefined;
      stopWalking(ai.id, state);
      state.scout.nextAt = 0;
      state.anchorAt = now;
    }
  }
  if (record.focus === "Caves" && !craftTool(ai, record, ownerId, "pickaxe", state)) {
    state.mining = undefined;
    state.pausedUntil = now + 10000;
    return undefined;
  }
  const m = state.mining;
  if (m) {
    const block = dim.getBlock(m);
    if (!block || block.typeId !== m.id || dist(center(m), eyeOf(ai)) > m.reach + 1) {
      state.mining = undefined;
      return undefined;
    }
    if (system.currentTick < m.until) {
      face(ai, center(m)); // looks at what it's mining, nothing else
      ai.playAnimation("animation.aip.ai_player.mine");
      return m.slot;
    }
    finishMining(ai, ownerId, record, state, m, owner);
    state.mining = undefined;
    state.idleSince = now;
    return undefined;
  }

  // Boats: collecting sand it can work from a boat along the shore; any other time it gets out on land.
  const boat = boatOf(ai);
  if (boat) {
    if (needSand) return boatSand(ai, record, state, boat);
    toShore(ai, state, boat);
    return undefined;
  }
  boatGoals.delete(ai.id);
  if (needSand && ai.isInWater) {
    stopWalking(ai.id, state);
    spawnBoat(ai); // in the water looking for sand: a boat, and it digs from that
    return undefined;
  }

  if (state.tree) return chopTree(ai, record, state);
  if (state.walking) return undefined; // on its way to a block
  if (record.focus === "Caves") return caveThink(ai, ownerId, record, state, owner);

  // Trees: one whole tree at a time, always the closest trunk to it.
  const trees = record.focus === "Trees";
  if (trees) {
    const base = findTree(ai, record, state);
    if (base) {
      state.lost = false;
      state.stuckSince = 0;
      startTree(ai, state, base);
      state.idleSince = now;
      return undefined;
    }
  }

  // Find the closest gatherable block in reach.
  const target = trees ? undefined : findTarget(ai, record, state, ownerId, REACH, owner);
  if (target && isLog(target.id)) {
    state.lost = false;
    state.stuckSince = 0;
    startTree(ai, state, target.location);
    return undefined;
  }
  if (!target) {
    // Nothing in reach: walk to the nearest one further away (a tree gets the tree routine).
    const far = trees ? undefined : findTarget(ai, record, state, ownerId, WALK_RADIUS, owner);
    if (far && isLog(far.id)) {
      state.lost = false;
      state.stuckSince = 0;
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
    if ((farming || record.focus === "Trees") && !far) {
      // Map awareness: find the best spot for what it needs (the next trees, or the farm's materials)
      // and jump sprint there, instead of strolling around.
      const kinds = farming ? farmKinds(record) : ["Wood"];
      const spot = scout(ai, kinds, state.scout, state.avoid, farming ? undefined : (id) => canTakeWood(record, GATHER[id].drop));
      state.idleSince = now;
      if (spot === "searching") {
        state.lost = false;
        warn(state, ownerId, "scout", `§7${record.name} is scouting for ${kinds.map((k) => KIND_NAMES[k] ?? k).join(", ")}...`);
      } else if (spot === "none") {
        state.lost = true; // nothing anywhere near: it may stroll around to explore
      } else if (spot) {
        state.lost = false;
        state.stuckSince = 0;
        startTravel(ai, state, spot);
      } else if (!state.scout.probe) {
        // Scouting keeps pointing here but there's nothing it can take (e.g. a log house, not trees):
        // after 20 seconds, skip what's around here so it looks somewhere else.
        state.stuckSince ||= now;
        if (now - state.stuckSince > 20000) {
          skipNearby(ai, state, kinds);
          state.stuckSince = 0;
          state.scout.nextAt = 0;
        }
      }
      return undefined;
    }
    if (now - state.idleSince > IDLE_MS) {
      // Probably stuck walking to something it can't mine: take a short break, then look again.
      state.pausedUntil = now + 15000;
      state.idleSince = now + 15000;
    }
    return undefined;
  }
  state.stuckSince = 0;
  state.mining = { ...target.location, id: target.id, slot: target.slot, until: system.currentTick + target.ticks, reach: REACH };
  face(ai, center(target.location));
  return target.slot;
}

/**
 * Makes sure it has the tool for its job, crafting one if it has none. Returns true if it has one.
 * It places a crafting table next to itself, crafts on it, and picks the table back up. It always has
 * its own 10 logs and 10 cobblestone for this (see inventory.js), so it can always craft:
 * - axe: a wooden axe.
 * - pickaxe: a stone pickaxe.
 * - shovel: the best one it can make from its inventory: diamond (a diamond from its valuables), then
 *   iron (an iron ingot), else stone.
 * The only thing that stops it: all 3 tool slots are full.
 * @param {import("@minecraft/server").Entity} ai @param {import("./data.js").AiRecord} record @param {string} ownerId
 * @param {"axe" | "pickaxe" | "shovel"} kind @param {{ warned: Map<string, number> }} state
 */
export function craftTool(ai, record, ownerId, kind, state) {
  const tools = inventoryOf(record).tools;
  if (tools.some((t) => t && new RegExp(`_${kind}$`).test(t.id))) return true;
  const free = tools.findIndex((t) => !t);
  if (free === -1) {
    if (kind === "pickaxe") warn(state, ownerId, "pickaxe", `§e${record.name} needs a pickaxe to mine, but its tool slots are full. Swap one for a pickaxe.`, TOOL_WARN_MS);
    return false;
  }
  let id = kind === "axe" ? "minecraft:wooden_axe" : "minecraft:stone_pickaxe";
  if (kind === "shovel") {
    id = takeValuable(record, "minecraft:diamond") ? "minecraft:diamond_shovel"
      : takeValuable(record, "minecraft:iron_ingot") ? "minecraft:iron_shovel"
      : "minecraft:stone_shovel";
  }
  craftingTable(ai);
  tools[free] = { id, damage: 0 };
  saveRecord(ownerId, record.role, record);
  findPlayer(ownerId)?.sendMessage(`§a${record.name} crafted a ${itemName(id)} (tool slot ${free + 1}).`);
  return true;
}

/**
 * Puts a crafting table down next to the AI for a moment (as it crafts), then picks it back up.
 * Only on an empty spot with ground under it; no room: it crafts without one.
 * @param {import("@minecraft/server").Entity} ai
 */
function craftingTable(ai) {
  const dim = ai.dimension;
  const f = floor(ai.location);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const spot = { x: f.x + dx, y: f.y, z: f.z + dz };
    const below = dim.getBlock({ ...spot, y: spot.y - 1 });
    if (!dim.getBlock(spot)?.isAir || !below || passable(below)) continue;
    try {
      dim.setBlockType(spot, "minecraft:crafting_table");
    } catch {
      return;
    }
    dim.playSound("dig.wood", spot);
    face(ai, center(spot));
    for (let i = 0; i < 3; i++) system.runTimeout(() => ai.isValid && ai.playAnimation("animation.aip.ai_player.mine"), i * 8);
    system.runTimeout(() => {
      try {
        if (dim.getBlock(spot)?.typeId === "minecraft:crafting_table") {
          dim.setBlockType(spot, "minecraft:air"); // picked back up
          dim.playSound("dig.wood", spot);
        }
      } catch {
        // unloaded
      }
    }, TABLE_TICKS);
    return;
  }
}

/**
 * The tool slot it holds for its job while it isn't mining: its axe on Trees, its pickaxe in caves.
 * undefined: no job tool (it uses its first tool).
 * @param {import("./data.js").AiRecord} record
 */
export function jobToolSlot(record) {
  const kind = record.focus === "Trees" ? "axe" : record.focus === "Caves" || record.focus === "Strip mine" ? "pickaxe" : record.focus === FARM_FOCUS ? "shovel" : undefined;
  if (!kind) return undefined;
  return inventoryOf(record).tools.findIndex((t) => t && new RegExp(`_${kind}$`).test(t.id));
}

// ================================================================ trees

/**
 * Skips (for 10 minutes) every block of these kinds near the AI.
 * @param {import("@minecraft/server").Entity} ai @param {GatherState} state @param {string[]} kinds
 */
function skipNearby(ai, state, kinds) {
  const types = Object.keys(GATHER).filter((id) => kinds.includes(GATHER[id].focus));
  const f = floor(ai.location);
  const volume = new BlockVolume({ x: f.x - 12, y: f.y - 8, z: f.z - 12 }, { x: f.x + 12, y: f.y + 12, z: f.z + 12 });
  try {
    for (const p of ai.dimension.getBlocks(volume, { includeTypes: types }).getBlockLocationIterator()) {
      state.avoid.set(`${p.x},${p.y},${p.z}`, Date.now() + TREE_DONE_MS);
    }
  } catch {
    // partly unloaded
  }
}

/**
 * The closest tree trunk: the bottom log of a real tree (standing on the ground, leaves above it), of a
 * kind of wood it has room for. Measured from the AI, so it goes tree to tree.
 * @param {import("@minecraft/server").Entity} ai @param {import("./data.js").AiRecord} record @param {GatherState} state
 * @returns {Vector3 | undefined}
 */
function findTree(ai, record, state) {
  const dim = ai.dimension;
  const f = floor(ai.location);
  const types = Object.keys(GATHER).filter((id) => GATHER[id].focus === "Wood" && canTakeWood(record, GATHER[id].drop));
  if (types.length === 0) return undefined;
  const r = TREE_SEARCH;
  let found;
  try {
    found = [...dim.getBlocks(new BlockVolume({ x: f.x - r, y: f.y - 8, z: f.z - r }, { x: f.x + r, y: f.y + 8, z: f.z + r }), { includeTypes: types }).getBlockLocationIterator()];
  } catch {
    return undefined;
  }
  const now = Date.now();
  /** @type {Vector3 | undefined} */
  let best;
  let bestD = Infinity;
  for (const p of found) {
    const d = Math.hypot(p.x - f.x, p.z - f.z) + Math.abs(p.y - f.y) * 2;
    if (d >= bestD || (state.avoid.get(blockKey(p)) ?? 0) > now) continue;
    const below = dim.getBlock({ ...p, y: p.y - 1 });
    // The bottom of the trunk, on real ground (not a branch, not up in the leaves).
    if (!below || isLog(below.typeId) || passable(below) || /leaves/.test(below.typeId)) continue;
    if (!hasLeavesAbove(dim, p) || lavaNextTo(dim, p).length > 0) continue;
    best = p;
    bestD = d;
  }
  return best;
}

/** @type {Record<string, string>} */
const KIND_NAMES = { Wood: "logs", Sand: "sand", Cane: "sugar cane" };

/** @param {string | undefined} id */
function isLog(id) {
  return !!id && GATHER[id]?.focus === "Wood";
}

/**
 * Plans chopping the tree that `log` belongs to: it'll run up to the trunk (around leaves), chop the
 * bottom two logs with normal reach, step into that gap, and chop the rest of the tree from there.
 * @param {import("@minecraft/server").Entity} ai
 * @param {GatherState} state
 * @param {Vector3} log
 */
function startTree(ai, state, log) {
  const dim = ai.dimension;
  let base = { ...log };
  while (isLog(dim.getBlock({ ...base, y: base.y - 1 })?.typeId)) base = { ...base, y: base.y - 1 };
  const logs = treeLogs(dim, base);
  // A spot right next to the trunk, level with it, that it can walk to.
  const path = findPath(dim, floor(ai.location), (c) => c.y === base.y && Math.abs(c.x - base.x) + Math.abs(c.z - base.z) === 1);
  const stand = path ? path[path.length - 1] ?? floor(ai.location) : standSpot(dim, base, ai.location, true) ?? clearStand(dim, base);
  if (!stand) {
    avoidTree(state, logs);
    return;
  }
  state.tree = { base, stand, logs, phase: "approach", walked: false, until: Date.now() + TREE_MS };
  if (path?.length) {
    state.tree.walked = true;
    startWalking(ai, state, stand, base, path, true);
  }
}

/**
 * Finds a way to walk (around obstacles: leaves count as walls) from `start` to the closest spot where
 * `goal` is true. Steps up 1, drops down up to 2. Returns the spots to walk through (empty: already
 * there), or undefined if there's no way within about 24 blocks.
 * @param {import("@minecraft/server").Dimension} dim @param {Vector3} start @param {(cell: Vector3) => boolean} goal
 * @returns {Vector3[] | undefined}
 */
function findPath(dim, start, goal) {
  /** @type {Map<string, boolean>} */
  const cache = new Map();
  const open = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
    const k = `${x},${y},${z}`;
    let v = cache.get(k);
    if (v === undefined) {
      const b = dim.getBlock({ x, y, z });
      v = !!b && passable(b) && !LAVA.includes(b.typeId);
      cache.set(k, v);
    }
    return v;
  };
  const walkable = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => {
    if (!open(x, y, z) || !open(x, y + 1, z) || open(x, y - 1, z)) return false;
    const below = dim.getBlock({ x, y: y - 1, z });
    return !!below && !below.isLiquid && !LAVA.includes(below.typeId);
  };
  /** @type {Map<string, { p: Vector3, from: string | undefined }>} */
  const seen = new Map([[blockKey(start), { p: start, from: undefined }]]);
  const queue = [start];
  while (queue.length && seen.size < 1500) {
    const p = /** @type {Vector3} */ (queue.shift());
    if (goal(p)) {
      /** @type {Vector3[]} */
      const path = [];
      for (let c = seen.get(blockKey(p)); c && c.from !== undefined; c = seen.get(c.from)) path.unshift(c.p);
      return path;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx;
      const z = p.z + dz;
      if (Math.abs(x - start.x) > 24 || Math.abs(z - start.z) > 24) continue;
      let ny;
      if (walkable(x, p.y, z)) ny = p.y;
      else if (open(p.x, p.y + 2, p.z) && walkable(x, p.y + 1, z)) ny = p.y + 1;
      else if (open(x, p.y, z) && open(x, p.y + 1, z)) {
        for (let dy = 1; dy <= 2; dy++) {
          if (walkable(x, p.y - dy, z)) {
            ny = p.y - dy;
            break;
          }
          if (!open(x, p.y - dy, z)) break;
        }
      }
      if (ny === undefined) continue;
      const q = { x, y: ny, z };
      const key = blockKey(q);
      if (seen.has(key)) continue;
      seen.set(key, { p: q, from: blockKey(p) });
      queue.push(q);
    }
  }
  return undefined;
}

/**
 * Every log of the tree, even ones that aren't quite connected to it: every log within 7 blocks of the
 * trunk (from its bottom up to 30 above) that's closer to this trunk than to any other tree's trunk.
 * @param {import("@minecraft/server").Dimension} dim
 * @param {Vector3} base
 */
function treeLogs(dim, base) {
  const types = Object.keys(GATHER).filter((id) => GATHER[id].focus === "Wood");
  /** @type {Vector3[]} */
  let all;
  try {
    all = [...dim.getBlocks(new BlockVolume({ x: base.x - 14, y: base.y - 3, z: base.z - 14 }, { x: base.x + 14, y: base.y + 30, z: base.z + 14 }), { includeTypes: types }).getBlockLocationIterator()];
  } catch {
    return [base]; // partly unloaded
  }
  // Trunk bottoms: logs standing on the ground. Its own trunk can be 2x2.
  const bottoms = all.filter((p) => {
    const below = dim.getBlock({ ...p, y: p.y - 1 });
    return !!below && !isLog(below.typeId) && !passable(below) && !/leaves/.test(below.typeId);
  });
  const mine = bottoms.filter((b) => Math.abs(b.x - base.x) <= 1 && Math.abs(b.z - base.z) <= 1 && Math.abs(b.y - base.y) <= 1);
  if (mine.length === 0) mine.push(base);
  const others = bottoms.filter((b) => !mine.some((m) => m.x === b.x && m.y === b.y && m.z === b.z));
  const flat = (/** @type {Vector3} */ a, /** @type {Vector3} */ b) => Math.hypot(a.x - b.x, a.z - b.z);
  return all.filter((p) => {
    if (p.y < base.y || p.y > base.y + 30 || Math.abs(p.x - base.x) > 7 || Math.abs(p.z - base.z) > 7) return false;
    const toMine = Math.min(...mine.map((b) => flat(p, b)));
    const toOther = Math.min(Infinity, ...others.filter((b) => b.y <= p.y).map((b) => flat(p, b)));
    return toMine <= toOther;
  });
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
    // 1. Run up to the trunk.
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
    // 2. Chop the bottom two logs, standing next to the trunk (normal reach).
    const next = [t.base, above].find((p) => isLog(dim.getBlock(p)?.typeId));
    if (next) return startChop(ai, record, next, REACH + 1, state);
    t.phase = "enter";
    t.walked = false;
  }

  if (t.phase === "enter") {
    // 3. Step into the gap those two logs left (same X and Z as them), breaking anything soft there.
    breakSoft(dim, t.base, false);
    if (flatDist(ai.location, t.base) > 0.35 || Math.abs(ai.location.y - t.base.y) > 0.6) {
      if (!t.walked) {
        t.walked = true;
        startWalking(ai, state, t.base, { ...t.base, y: t.base.y + 3 });
        return undefined;
      }
      ai.teleport({ x: t.base.x + 0.5, y: t.base.y, z: t.base.z + 0.5 }); // it's right next to it: slide in (no jump)
    }
    ai.clearVelocity();
    t.phase = "chop";
  }

  // 4. From inside the trunk, without jumping or moving, chop every log of the tree (its reach is
  // enlarged for this), lowest first. It stays right where the bottom two logs were.
  if (flatDist(ai.location, t.base) > 0.4 || Math.abs(ai.location.y - t.base.y) > 1) {
    ai.teleport({ x: t.base.x + 0.5, y: t.base.y, z: t.base.z + 0.5 });
  }
  const eye = eyeOf(ai);
  const next = t.logs
    .filter((p) => isLog(dim.getBlock(p)?.typeId))
    .sort((a, b) => a.y - b.y || dist(center(a), eye) - dist(center(b), eye))[0];
  if (next) return startChop(ai, record, next, TRUNK_REACH, state);
  endTree(state, t, false); // the whole tree is chopped: on to the next closest one
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
  const ticks = Math.min(400, Math.max(4, Math.ceil(((info.hardness * 30) / tool.speed))));
  state.mining = { ...p, id, slot: tool.slot, until: system.currentTick + ticks, reach };
  face(ai, center(p));
  return tool.slot;
}

/** @param {GatherState} state @param {TreeJob} t @param {boolean} failed */
function endTree(state, t, failed) {
  // Couldn't get to it: skip it for a minute. Finished: any logs left were out of reach, so skip
  // them for 10 minutes and go to the next tree.
  avoidTree(state, t.logs, failed ? 60000 : TREE_DONE_MS);
  state.tree = undefined;
  state.mining = undefined;
  state.idleSince = Date.now();
}

/** Skip this tree for a while. @param {GatherState} state @param {Vector3[]} logs @param {number} [ms] */
function avoidTree(state, logs, ms = 60000) {
  const until = Date.now() + ms;
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
  // Sugar cane farm: whatever it still needs (logs, sand, sugar cane).
  const farming = record.focus === FARM_FOCUS;
  const kinds = farming ? farmKinds(record) : [FOCUS_TYPES[record.focus]];
  // Caves: only the ores you chose (stone and deepslate versions).
  const types = record.focus === "Caves" ? caveBlocks(record, dim.id) : Object.keys(GATHER).filter((id) => kinds.includes(GATHER[id].focus));
  // Trees: only the kinds of wood it still has room for (once its 3 wood slots are used, just those kinds).
  if (record.focus === "Trees") types.splice(0, types.length, ...types.filter((id) => canTakeWood(record, GATHER[id].drop)));
  if (types.length === 0) return undefined;
  const r = Math.ceil(radius);
  // In caves it looks further up and down (ravines, cave walls).
  const down = kinds.includes("Ores") ? 12 : farming ? 6 : 4;
  const up = kinds.includes("Ores") ? 8 : 6;
  const volume = new BlockVolume({ x: feet.x - r, y: feet.y - down, z: feet.z - r }, { x: feet.x + r, y: feet.y + up, z: feet.z + r });
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
    // Sand under water: only from a boat (on foot it would drown).
    if (info.focus === "Sand" && /water/.test(dim.getBlock({ ...p, y: p.y + 1 })?.typeId ?? "")) continue;
    // Leave the bottom of each sugar cane so it grows back.
    if (info.focus === "Cane" && dim.getBlock({ ...p, y: p.y - 1 })?.typeId !== id) continue;
    const tool = toolFor(record, info);
    if (!tool) {
      // Its pickaxe isn't strong enough for this ore: leave it (and say so now and then).
      warn(state, ownerId, "tier", `§e${record.name} needs a better pickaxe for ${itemName(id)} (it leaves those alone).`, TOOL_WARN_MS);
      continue;
    }
    // Never mine next to lava.
    if (lavaNextTo(dim, p).length > 0) {
      state.avoid.set(key, now + 120000);
      continue;
    }
    const ticks = Math.min(400, Math.max(4, Math.ceil(((info.hardness * 30) / tool.speed))));
    best = { location: p, id, slot: tool.slot, ticks, d };
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

  // Check for lava once more: it may have flowed in. Then it leaves the block alone (no blocks placed).
  if (lavaNextTo(dim, m).length > 0) {
    state.avoid.set(`${m.x},${m.y},${m.z}`, Date.now() + 120000);
    warn(state, ownerId, "lava", `§6${record.name} found lava behind that block and left it alone.`);
    return;
  }

  // Sugar cane: take the rest of the stalk above it too (top first, so nothing pops off).
  let extra = 0;
  if (info.focus === "Cane") {
    let top = m.y + 1;
    while (top < m.y + 8 && dim.getBlock({ ...m, y: top })?.typeId === m.id) top++;
    for (let y = top - 1; y > m.y; y--) {
      dim.setBlockType({ ...m, y }, "minecraft:air");
      extra++;
    }
  }
  dim.setBlockType(m, "minecraft:air");
  dim.playSound(info.tool === "axe" ? "dig.wood" : info.tool === "pickaxe" ? "dig.stone" : info.tool === "shovel" ? "dig.sand" : "dig.grass", m);

  const amount = (info.min !== undefined && info.max !== undefined
    ? info.min + Math.floor(Math.random() * (info.max - info.min + 1))
    : 1) + extra;
  state.minedAt = Date.now();
  // A line in its 20-minute report.
  countCollected(record, info.drop, amount);
  // Collecting for a sugar cane farm: it keeps it for the farm.
  if (farmCollect(record, info.drop, amount)) {
    wearAfterMining(ai, ownerId, record, m.slot);
    saveRecord(ownerId, "resource", record);
    return;
  }

  // Drops go to its valuables / block slots; anything that doesn't fit goes to its owner (or is dropped).
  // Wood goes in its 3 wood slots (one kind each).
  let left = amount;
  if (isWood(info.drop)) left -= addWood(record, info.drop, left);
  else if (isValuable(info.drop)) left -= addValuables(record, info.drop, left);
  else if (isPlaceableBlock(info.drop)) left -= addBlocks(record, info.drop, left);
  if (left > 0) {
    const stack = new ItemStack(info.drop, left);
    const ownerClose = owner && owner.dimension.id === dim.id && dist(owner.location, ai.location) <= 32;
    if (ownerClose) giveItem(owner, stack);
    else dim.spawnItem(stack, center(m));
  }

  wearAfterMining(ai, ownerId, record, m.slot);
  saveRecord(ownerId, "resource", record);
}

/**
 * Wears the tool. If it breaks, the next think uses the next suitable slot.
 * @param {import("@minecraft/server").Entity} ai @param {string} ownerId
 * @param {import("./data.js").AiRecord} record @param {number} slot
 */
function wearAfterMining(ai, ownerId, record, slot) {
  if (slot < 0) return;
  const toolId = inventoryOf(record).tools[slot]?.id;
  if (wearTool(record, slot) === "broke" && toolId) {
    ai.dimension.playSound("random.break", ai.location);
    findPlayer(ownerId)?.sendMessage(`§c${record.name}'s ${itemName(toolId)} broke!`);
  }
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
  // Ores and stone need a pickaxe (strong enough): no hands.
  if (info.tool === "pickaxe") return undefined;
  // Logs, sand...: no suitable tool, so its hands (slower).
  return { slot: -1, speed: 1 };
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

// ================================================================ caves (Resource AI)
// X-ray: it "sees" every chosen ore around it, even inside the walls, and maps the cave it's in (every
// spot it can walk to). Then, smartest first:
// 1. An ore in the cave wall it can walk to: it walks the cave path there and mines it.
// 2. An ore hidden in the rock close by: it digs a tunnel straight to it (only through natural stone,
//    dirt and ores, never next to lava).
// 3. No ore: it follows the cave on, preferring the way down and places it hasn't been yet.
// 4. A dead end: it digs a staircase down and keeps going.

const CAVE_SCAN = 20; // how far around it it sees ores and maps the cave (blocks)
const CAVE_UP = 12;
const CAVE_DOWN = 16;
const CAVE_REACH = 4.5; // mines ores this far from its eyes
const CAVE_PLAN_MS = 2500; // re-plans (scans) at most this often
const CAVE_NODES = 2500; // cave spots it maps at most
const TUNNEL_TO = 10; // digs to hidden ores at most this far away
const TUNNEL_MS = 60000;
const VISITED_MS = 600000; // places it's been count as explored for 10 minutes
const CAVE_AIR = ["minecraft:air", "minecraft:torch", "minecraft:cave_vines", "minecraft:glow_lichen"];

/**
 * @typedef {Object} CaveState
 * @property {Map<string, number>} visited  4x4x4 areas it's been in -> when
 * @property {{ goal: Vector3, ore: boolean, until: number } | undefined} tunnel  digging towards an ore (or down)
 * @property {{ cell: Vector3, until: number } | undefined} dig  the block it's digging in a tunnel
 * @property {number} plannedAt
 * @property {number} turn  which way it digs down at a dead end
 */

/** @param {Vector3} p */
function areaKey(p) {
  return `${Math.floor(p.x) >> 2},${Math.floor(p.y) >> 2},${Math.floor(p.z) >> 2}`;
}

/**
 * One think in a cave. Returns the tool slot it's using.
 * @param {import("@minecraft/server").Entity} ai @param {string} ownerId @param {import("./data.js").AiRecord} record
 * @param {GatherState} state @param {import("@minecraft/server").Player | undefined} owner
 * @returns {number | undefined}
 */
function caveThink(ai, ownerId, record, state, owner) {
  const cs = state.cave;
  const now = Date.now();
  cs.visited.set(areaKey(ai.location), now);
  if (cs.visited.size > 4000) for (const [k, t] of cs.visited) if (now - t > VISITED_MS) cs.visited.delete(k);
  if (cs.tunnel) return tunnelStep(ai, ownerId, record, state, owner);
  if (now - cs.plannedAt < CAVE_PLAN_MS) return undefined;
  cs.plannedAt = now;

  const dim = ai.dimension;
  const f = floor(ai.location);
  const range = dim.heightRange;
  const lo = { x: f.x - CAVE_SCAN, y: Math.max(range.min, f.y - CAVE_DOWN), z: f.z - CAVE_SCAN };
  const hi = { x: f.x + CAVE_SCAN, y: Math.min(range.max - 1, f.y + CAVE_UP), z: f.z + CAVE_SCAN };
  const volume = new BlockVolume(lo, hi);
  // Ores it can mine (its pickaxe is strong enough), not next to lava.
  const oreTypes = caveBlocks(record, dim.id).filter((id) => toolFor(record, GATHER[id]));
  /** @type {Set<string>} */
  const air = new Set();
  /** @type {Set<string>} */
  const lava = new Set();
  /** @type {Vector3[]} */
  let ores = [];
  try {
    for (const p of dim.getBlocks(volume, { includeTypes: CAVE_AIR }).getBlockLocationIterator()) air.add(blockKey(p));
    for (const p of dim.getBlocks(volume, { includeTypes: LAVA }).getBlockLocationIterator()) lava.add(blockKey(p));
    if (oreTypes.length) ores = [...dim.getBlocks(volume, { includeTypes: oreTypes }).getBlockLocationIterator()];
  } catch {
    return undefined; // not loaded
  }
  ores = ores.filter((o) => (state.avoid.get(blockKey(o)) ?? 0) <= now && !lavaNextTo(dim, o).length);

  // Map the cave: every spot it can walk to from here (steps up 1, drops down up to 2).
  const k = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => `${x},${y},${z}`;
  const open = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) => air.has(k(x, y, z));
  const walkable = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ z) =>
    y - 1 >= lo.y && open(x, y, z) && open(x, y + 1, z) && !open(x, y - 1, z) && !lava.has(k(x, y - 1, z));
  /** @type {Map<string, { p: Vector3, steps: number, from: string | undefined }>} */
  const cells = new Map();
  const start = { ...f };
  cells.set(blockKey(start), { p: start, steps: 0, from: undefined });
  const queue = [start];
  while (queue.length && cells.size < CAVE_NODES) {
    const p = /** @type {Vector3} */ (queue.shift());
    const here = /** @type {{ steps: number }} */ (cells.get(blockKey(p)));
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = p.x + dx;
      const z = p.z + dz;
      if (x < lo.x || x > hi.x || z < lo.z || z > hi.z) continue;
      let ny;
      if (walkable(x, p.y, z)) ny = p.y;
      else if (open(p.x, p.y + 2, p.z) && walkable(x, p.y + 1, z)) ny = p.y + 1;
      else if (open(x, p.y, z) && open(x, p.y + 1, z)) {
        for (let dy = 1; dy <= 2; dy++) {
          if (walkable(x, p.y - dy, z)) {
            ny = p.y - dy;
            break;
          }
          if (!open(x, p.y - dy, z)) break;
        }
      }
      if (ny === undefined) continue;
      const q = { x, y: ny, z };
      const key = blockKey(q);
      if (cells.has(key)) continue;
      cells.set(key, { p: q, steps: here.steps + 1, from: blockKey(p) });
      queue.push(q);
    }
  }
  const pathTo = (/** @type {string} */ key) => {
    /** @type {Vector3[]} */
    const path = [];
    for (let c = cells.get(key); c && c.from !== undefined; c = cells.get(c.from)) path.unshift(c.p);
    return path;
  };

  // 1. An ore in the cave wall it can walk to (fewest steps).
  /** @type {{ ore: Vector3, key: string, steps: number } | undefined} */
  let best;
  for (const ore of ores) {
    const exposed = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => open(ore.x + dx, ore.y + dy, ore.z + dz));
    if (!exposed) continue;
    for (const [key, c] of cells) {
      if (best && c.steps >= best.steps) continue;
      if (dist({ x: c.p.x + 0.5, y: c.p.y + 1.6, z: c.p.z + 0.5 }, center(ore)) <= CAVE_REACH) best = { ore, key, steps: c.steps };
    }
  }
  if (best) {
    state.stuckSince = 0;
    if (best.steps === 0) return mineOre(ai, record, state, best.ore);
    startWalking(ai, state, cells.get(best.key)?.p ?? best.ore, best.ore, pathTo(best.key));
    return jobToolSlot(record);
  }

  // 2. An ore hidden in the rock close by: tunnel to it.
  const hidden = ores
    .map((o) => ({ o, d: dist(center(o), eyeOf(ai)) }))
    .filter((h) => h.d <= TUNNEL_TO)
    .sort((a, b) => a.d - b.d)[0];
  if (hidden) {
    if (hidden.d <= CAVE_REACH) return mineOre(ai, record, state, hidden.o);
    cs.tunnel = { goal: hidden.o, ore: true, until: now + TUNNEL_MS };
    return jobToolSlot(record);
  }

  // 3. Follow the cave on: further along, down rather than up, places it hasn't been, not too far
  // from the cave spot you picked.
  const spot = record.cave && record.cave.dim === dim.id ? record.cave : undefined;
  /** @type {{ key: string, score: number } | undefined} */
  let go;
  for (const [key, c] of cells) {
    if (c.steps < 6) continue;
    const seen = now - (cs.visited.get(areaKey(c.p)) ?? 0) < VISITED_MS;
    const far = spot && Math.hypot(c.p.x - spot.x, c.p.z - spot.z) > CAVE_LEASH - 16;
    const score = c.steps * 0.5 + (f.y - c.p.y) * 1.5 - (seen ? 40 : 0) - (far ? 80 : 0);
    if (!go || score > go.score) go = { key, score };
  }
  if (go && go.score > -20) {
    const target = /** @type {{ p: Vector3 }} */ (cells.get(go.key)).p;
    startWalking(ai, state, target, target, pathTo(go.key));
    return jobToolSlot(record);
  }

  // 4. A dead end (or it's explored everything near): dig a staircase down and keep going.
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const [dx, dz] = dirs[cs.turn++ % 4];
  const depth = Math.max(range.min + 6, f.y - 6);
  cs.tunnel = { goal: { x: f.x + dx * 8, y: depth, z: f.z + dz * 8 }, ore: false, until: now + TUNNEL_MS };
  return jobToolSlot(record);
}

/**
 * Starts mining an ore it can reach (gather() finishes it).
 * @param {import("@minecraft/server").Entity} ai @param {import("./data.js").AiRecord} record
 * @param {GatherState} state @param {Vector3} ore
 */
function mineOre(ai, record, state, ore) {
  const id = ai.dimension.getBlock(ore)?.typeId ?? "";
  const info = GATHER[id];
  const tool = info ? toolFor(record, info) : undefined;
  if (!info || !tool) return undefined;
  const ticks = Math.min(400, Math.max(4, Math.ceil((info.hardness * 30) / tool.speed)));
  state.mining = { ...ore, id, slot: tool.slot, until: system.currentTick + ticks, reach: CAVE_REACH + 1 };
  face(ai, center(ore));
  return tool.slot;
}

/**
 * One think of digging a tunnel (1 wide, 2 high, in steps like stairs) towards a hidden ore, or down.
 * @param {import("@minecraft/server").Entity} ai @param {string} ownerId @param {import("./data.js").AiRecord} record
 * @param {GatherState} state @param {import("@minecraft/server").Player | undefined} owner
 * @returns {number | undefined}
 */
function tunnelStep(ai, ownerId, record, state, owner) {
  const cs = state.cave;
  const t = /** @type {NonNullable<CaveState["tunnel"]>} */ (cs.tunnel);
  const dim = ai.dimension;
  const pick = toolFor(record, { tool: "pickaxe", tier: 0, required: true });
  const stop = (/** @type {boolean} */ skip) => {
    if (skip && t.ore) state.avoid.set(blockKey(t.goal), Date.now() + TREE_DONE_MS);
    cs.tunnel = undefined;
    cs.dig = undefined;
    cs.plannedAt = 0;
    return undefined;
  };
  if (!pick || Date.now() > t.until) return stop(true);
  if (t.ore) {
    const id = dim.getBlock(t.goal)?.typeId ?? "";
    if (!GATHER[id]) return stop(false); // someone else mined it
    if (dist(center(t.goal), eyeOf(ai)) <= CAVE_REACH) {
      stop(false);
      return mineOre(ai, record, state, t.goal);
    }
  }
  const feet = floor(ai.location);
  const dx = t.goal.x - feet.x;
  const dz = t.goal.z - feet.z;
  const dy = t.goal.y - feet.y;
  if (!t.ore && Math.abs(dx) + Math.abs(dz) === 0 && Math.abs(dy) < 1) return stop(false);
  const h = Math.abs(dx) >= Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) };
  const sy = dy < -0.5 ? -1 : dy > 1.5 ? 1 : 0;
  const next = { x: feet.x + h.x, y: feet.y + sy, z: feet.z + h.z };
  const cells = [next, { ...next, y: next.y + 1 }];
  if (sy > 0) cells.push({ ...feet, y: feet.y + 2 });
  if (sy < 0) cells.push({ ...next, y: next.y + 2 }); // going down: room for its head on the way
  for (const cell of cells) {
    const block = dim.getBlock(cell);
    if (!block) return stop(true);
    if (passable(block)) continue;
    const info = GATHER[block.typeId];
    const ore = info?.focus === "Ores";
    if ((!ore && !DIGGABLE.test(block.typeId)) || lavaNextTo(dim, cell).length > 0 || (ore && !toolFor(record, info))) return stop(true);
    // Dig it, taking as long as its pickaxe would.
    if (!cs.dig || blockKey(cs.dig.cell) !== blockKey(cell)) {
      const hardness = info?.hardness ?? 1.5;
      cs.dig = { cell, until: system.currentTick + Math.min(200, Math.max(3, Math.ceil((hardness * 30) / pick.speed))) };
    }
    face(ai, center(cell));
    ai.playAnimation("animation.aip.ai_player.mine");
    if (system.currentTick < cs.dig.until) return pick.slot;
    cs.dig = undefined;
    if (ore) {
      finishMining(ai, ownerId, record, state, { ...cell, id: block.typeId, slot: pick.slot }, owner); // an ore on the way: keeps it
    } else {
      dim.setBlockType(cell, "minecraft:air");
      dim.playSound(/dirt|grass|gravel|sand|mud|clay|soul/.test(block.typeId) ? "dig.gravel" : "dig.stone", cell);
      wearAfterMining(ai, ownerId, record, pick.slot);
    }
    return pick.slot;
  }
  // The way is clear: step in (never onto lava).
  if (LAVA.includes(dim.getBlock({ ...next, y: next.y - 1 })?.typeId ?? "")) return stop(true);
  ai.teleport({ x: next.x + 0.5, y: next.y, z: next.z + 0.5 });
  face(ai, center(t.goal));
  return pick.slot;
}

// ================================================================ walking

/**
 * @typedef {{ source: Vector3, col: Vector3, out: Vector3 | undefined, dir: "down" | "up", endY: number, until: number }} WaterRide
 *   Swimming down or up a water column it poured: `source` is the water block, `col` the column it swims in.
 * @typedef {{ ai: import("@minecraft/server").Entity, state: GatherState, stand: Vector3, block: Vector3, until: number, stuck: number, last: Vector3, water?: WaterRide, travel?: boolean, stepTicks: number, path?: Vector3[], careful?: boolean }} Walker
 *   `path`: the rest of the way (cave paths): it walks to `stand`, then the next spot, and so on.
 */
/** AIs walking to a block. @type {Map<string, Walker>} */
const walkers = new Map();

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {GatherState} state
 * @param {Vector3} stand  feet position to walk to
 * @param {Vector3} block  the block it will mine
 * @param {Vector3[]} [path]  spots to walk through, in order (ending at `stand`)
 * @param {boolean} [careful]  it found a way around: it doesn't break leaves or dig unless it gets stuck
 */
function startWalking(ai, state, stand, block, path, careful = false) {
  const rest = path && path.length > 1 ? path.slice(1) : undefined;
  const first = path?.[0] ?? stand;
  walkers.set(ai.id, {
    ai, state, stand: first, block, until: Date.now() + WALK_MS + (path?.length ?? 0) * 700, stuck: 0, last: { ...ai.location }, stepTicks: 0, path: rest, careful,
  });
  state.walking = true;
}

/**
 * A long trip to a spot it scouted: jump sprints there, hopping over anything in the way.
 * @param {import("@minecraft/server").Entity} ai @param {GatherState} state @param {Vector3} spot
 */
function startTravel(ai, state, spot) {
  const target = floor(spot);
  const distance = Math.hypot(target.x - ai.location.x, target.z - ai.location.z);
  walkers.set(ai.id, {
    ai, state, stand: target, block: target, until: Date.now() + 20000 + (distance / 4) * 1000, stuck: 0, last: { ...ai.location }, travel: true, stepTicks: 0,
  });
  state.walking = true;
}

/** @param {string} aiId @param {GatherState} state */
function stopWalking(aiId, state) {
  const w = walkers.get(aiId);
  if (w) pickUpWater(w);
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
  if (w.water) {
    swim(id, w);
    return;
  }
  if (w.travel) {
    travel(id, w);
    return;
  }
  const ai = w.ai;
  const dim = ai.dimension;
  const p = ai.location;
  const dx = w.stand.x + 0.5 - p.x;
  const dz = w.stand.z + 0.5 - p.z;
  const d = Math.hypot(dx, dz);
  if (w.path?.length && d < 0.5 && Math.abs(p.y - w.stand.y) < 1.2) {
    w.stand = /** @type {Vector3} */ (w.path.shift()); // on to the next spot along the way
    w.stuck = 0;
    w.stepTicks = 0;
    return;
  }
  if (d < 0.3 && Math.abs(p.y - w.stand.y) < 1) {
    ai.clearVelocity();
    stopWalking(id, w.state); // arrived: the next think starts work
    return;
  }

  // Not getting anywhere: give up.
  if (Math.hypot(p.x - w.last.x, p.z - w.last.z) > 0.05 || Math.abs(p.y - w.last.y) > 0.3) {
    w.last = { ...p };
    w.stuck = 0;
    w.stepTicks = 0;
  } else if (++w.stuck > STUCK_TICKS) {
    giveUp(id, w);
    return;
  }

  const ux = dx / d;
  const uz = dz / d;
  turnTo(ai, 0, (Math.atan2(-ux, uz) * 180) / Math.PI);
  const fy = Math.floor(p.y + 0.01);
  const ahead = { x: Math.floor(p.x + ux * 0.7), y: fy, z: Math.floor(p.z + uz * 0.7) };
  let jump = false;
  if (ahead.x !== Math.floor(p.x) || ahead.z !== Math.floor(p.z)) {
    if (!free(dim, ahead)) {
      const up = { ...ahead, y: fy + 1 };
      const room = passable(dim.getBlock({ x: Math.floor(p.x), y: fy + 2, z: Math.floor(p.z) }));
      if (!free(dim, up) || !room) {
        // A wall. Leaves: break through. Otherwise dig a stair step into it (climbing out of a pit
        // like a player), or straight through it if where it's going is level with it.
        // Walking a way it found around things: it only breaks or digs if it's stuck anyway.
        if (w.careful && w.stuck < 20) return;
        if (breakSoft(dim, ahead, w.stand.y > fy)) return;
        const dug = digStep(ai, ux, uz, w.stand.y > fy);
        if (dug !== "blocked") {
          w.stuck = 0;
          return;
        }
        // Can't dig it (something built, ore, lava): swim up it with its water bucket instead.
        if (w.stand.y > fy + 1 && ai.isOnGround) waterUp(w, { x: Math.floor(p.x), y: fy, z: Math.floor(p.z) }, ahead);
        return; // otherwise wait (gives up if it stays stuck)
      }
      // A 1-block step: jump it, and if that doesn't get it up, just hop up onto it.
      jump = ai.isOnGround;
      if (++w.stepTicks > STEP_UP_AFTER) {
        ai.teleport({ x: p.x + ux * 0.6, y: fy + 1, z: p.z + uz * 0.6 });
        w.stepTicks = 0;
        w.stuck = 0;
        return;
      }
    } else if (w.state.sprint && ai.isOnGround && d > 2.5 && free(dim, { ...ahead, y: fy - 1 }) === false) {
      jump = true; // jump sprinting (only onto solid ground)
    } else {
      // Never walk into lava. A drop of more than 3 blocks (a ravine): if where it's going is down
      // there, pour water over the edge and swim down; otherwise don't go.
      const below = [1, 2, 3].map((k) => dim.getBlock({ ...ahead, y: fy - k }));
      if (below.some((b) => b && LAVA.includes(b.typeId))) {
        giveUp(id, w);
        return;
      }
      if (below.every((b) => passable(b))) {
        // Where it's going is down there: jump down with its water bucket (or swim down a water column).
        if (w.stand.y < fy - 2 && startDrop(ai, { x: ux, z: uz })) {
          stopWalking(id, w.state);
          return;
        }
        if (!(w.stand.y < fy - 2 && waterDown(w, ahead))) giveUp(id, w);
        return;
      }
    }
  }
  const v = ai.getVelocity();
  const speed = Math.min((w.state.sprint ? SPRINT_SPEED : WALK_SPEED) * w.state.speed, d);
  ai.applyImpulse({ x: ux * speed - v.x, y: jump ? JUMP - Math.max(0, v.y) : 0, z: uz * speed - v.z });
}

/**
 * One tick of a long trip: jump sprinting, swimming across water, dropping down slopes. Stuck (a wall,
 * a cliff) or lava ahead: it hops over (a short teleport to the ground further on).
 * @param {string} id @param {Walker} w
 */
function travel(id, w) {
  const ai = w.ai;
  const dim = ai.dimension;
  const p = ai.location;
  const dx = w.stand.x + 0.5 - p.x;
  const dz = w.stand.z + 0.5 - p.z;
  const d = Math.hypot(dx, dz);
  if (d < TRAVEL_ARRIVED) {
    ai.clearVelocity();
    stopWalking(id, w.state); // there: normal gathering takes over
    return;
  }
  const ux = dx / d;
  const uz = dz / d;
  turnTo(ai, 0, (Math.atan2(-ux, uz) * 180) / Math.PI);
  const ahead = { x: Math.floor(p.x + ux), y: Math.floor(p.y + 0.01), z: Math.floor(p.z + uz) };
  const lavaAhead = [0, -1, -2].some((k) => LAVA.includes(dim.getBlock({ ...ahead, y: ahead.y + k })?.typeId ?? ""));
  if (Math.hypot(p.x - w.last.x, p.z - w.last.z) > 0.05) {
    w.last = { ...p };
    w.stuck = 0;
  } else {
    w.stuck++;
  }
  // Stuck against a wall: dig a stair step up it.
  if (!lavaAhead && w.stuck > 10 && digStep(ai, ux, uz, true) !== "blocked") {
    w.stuck = Math.min(w.stuck, 10);
    return;
  }
  if (lavaAhead || w.stuck > HOP_AFTER) {
    if (!hop(ai, ux, uz)) {
      giveUp(id, w);
      return;
    }
    w.last = { ...ai.location };
    w.stuck = 0;
    return;
  }
  const v = ai.getVelocity();
  const jump = ai.isOnGround; // jump sprinting: jumps again every time it lands
  const sprint = SPRINT_SPEED * w.state.speed;
  ai.applyImpulse({ x: ux * sprint - v.x, y: jump ? JUMP - Math.max(0, v.y) : 0, z: uz * sprint - v.z });
}

/**
 * Hops a few blocks ahead onto the ground: never into lava, never up onto trees, and never much
 * higher or lower than it is (no big jumps). Returns false if there's nowhere to hop.
 * @param {import("@minecraft/server").Entity} ai @param {number} ux @param {number} uz
 */
function hop(ai, ux, uz) {
  const dim = ai.dimension;
  for (const k of [3, 6]) {
    const x = ai.location.x + ux * k;
    const z = ai.location.z + uz * k;
    let top;
    try {
      top = dim.getTopmostBlock({ x, z });
    } catch {
      continue;
    }
    if (!top) continue;
    // Down through any tree to the real ground.
    let y = top.location.y;
    for (let i = 0; i < 40; i++) {
      const b = dim.getBlock({ x, y, z });
      if (!b || !(passable(b) || /leaves|_log$|_stem$/.test(b.typeId))) break;
      y--;
    }
    const ground = dim.getBlock({ x, y, z });
    if (!ground || LAVA.includes(ground.typeId) || ground.isLiquid) continue;
    const feet = { x: Math.floor(x), y: y + 1, z: Math.floor(z) };
    if (!free(dim, feet) || Math.abs(feet.y - ai.location.y) > 2) continue;
    ai.teleport({ x, y: y + 1, z });
    return true;
  }
  return false;
}

/** When each AI may dig its next block. @type {Map<string, number>} */
const digReady = new Map();

/**
 * Digs its way out of a pit like a player, one block at a time: going up, it clears the block above
 * its head and the two above the step in front of it, then steps up (a staircase). Going level, it
 * digs through the 2 blocks in front of it. Only natural ground (dirt, stone...), never next to lava.
 * Returns "dug" (dug or digging), "clear" (nothing in the way any more) or "blocked" (it can't dig there).
 * @param {import("@minecraft/server").Entity} ai @param {number} ux @param {number} uz  direction
 * @param {boolean} up  climbing up (a stair step) or going level
 * @returns {"dug" | "clear" | "blocked"}
 */
export function digStep(ai, ux, uz, up) {
  const dim = ai.dimension;
  const p = ai.location;
  const here = { x: Math.floor(p.x), y: Math.floor(p.y + 0.01), z: Math.floor(p.z) };
  const ahead = { x: Math.floor(p.x + ux * 0.7), y: here.y, z: Math.floor(p.z + uz * 0.7) };
  if (ahead.x === here.x && ahead.z === here.z) return "clear";
  if (up && passable(dim.getBlock(ahead))) return "blocked"; // no wall to make a step in
  const cells = up
    ? [{ ...here, y: here.y + 2 }, { ...ahead, y: here.y + 1 }, { ...ahead, y: here.y + 2 }]
    : [ahead, { ...ahead, y: here.y + 1 }];
  for (const c of cells) {
    const block = dim.getBlock(c);
    if (!block) return "blocked";
    if (passable(block)) continue;
    if (!DIGGABLE.test(block.typeId) || lavaNextTo(dim, c).length > 0) return "blocked";
    if (system.currentTick < (digReady.get(ai.id) ?? 0)) return "dug"; // still digging the last one
    digReady.set(ai.id, system.currentTick + DIG_TICKS);
    const id = block.typeId;
    face(ai, center(c));
    ai.playAnimation("animation.aip.ai_player.mine");
    dim.setBlockType(c, "minecraft:air");
    dim.playSound(/leaves/.test(id) ? "dig.grass" : /dirt|grass|podzol|mycelium|mud|clay|gravel|sand|snow|soul/.test(id) ? "dig.gravel" : "dig.stone", c);
    return "dug";
  }
  return "clear";
}

// ================================================================ water bucket (ravines)
// The Resource AI carries an infinite water bucket (shown in its inventory, can't be taken). It pours a
// water column, swims down or up it, then scoops the water back up, like a player would.

/** Water works here (not in the Nether). @param {import("@minecraft/server").Dimension} dim */
function waterWorks(dim) {
  return dim.id !== "minecraft:nether";
}

/**
 * Pours water over the edge into a ravine. Returns false if it can't (too deep, lava, Nether...).
 * @param {Walker} w
 * @param {Vector3} edge  the empty spot over the drop, at its feet level
 */
function waterDown(w, edge) {
  const dim = w.ai.dimension;
  if (!waterWorks(dim) || !dim.getBlock(edge)?.isAir) return false;
  for (let y = edge.y - 1; y >= edge.y - WATER_DEPTH; y--) {
    const block = dim.getBlock({ ...edge, y });
    if (!block || LAVA.includes(block.typeId)) return false;
    if (!passable(block)) {
      pour(w, { source: edge, col: edge, out: undefined, dir: "down", endY: y + 1, until: Date.now() + WATER_MS });
      return true;
    }
  }
  return false; // too deep
}

/**
 * Pours water above itself against a wall and swims up it. Returns false if it can't.
 * @param {Walker} w
 * @param {Vector3} col  the spot it's standing in
 * @param {Vector3} wall  the wall spot in front of it
 */
function waterUp(w, col, wall) {
  const dim = w.ai.dimension;
  if (!waterWorks(dim)) return false;
  for (let y = col.y + 1; y <= col.y + WATER_HEIGHT; y++) {
    // Its column has to be open all the way up.
    if (!passable(dim.getBlock({ ...col, y: y + 1 }))) return false;
    // The top: room to step onto the wall, with ground under it.
    const top = { ...wall, y };
    if (free(dim, top) && !passable(dim.getBlock({ ...wall, y: y - 1 }))) {
      const source = { ...col, y };
      if (!dim.getBlock(source)?.isAir) return false;
      pour(w, { source, col, out: wall, dir: "up", endY: y, until: Date.now() + WATER_MS });
      return true;
    }
  }
  return false;
}

/** @param {Walker} w @param {WaterRide} ride */
function pour(w, ride) {
  const dim = w.ai.dimension;
  dim.setBlockType(ride.source, "minecraft:water");
  dim.playSound("bucket.empty_water", ride.source);
  w.water = ride;
  w.until = Math.max(w.until, ride.until + 2000);
}

/** Scoops its water back up. @param {Walker} w */
function pickUpWater(w) {
  const ride = w.water;
  if (!ride) return;
  w.water = undefined;
  try {
    const dim = w.ai.dimension;
    const block = dim.getBlock(ride.source);
    if (block && /water/.test(block.typeId)) {
      dim.setBlockType(ride.source, "minecraft:air");
      dim.playSound("bucket.fill_water", ride.source);
    }
  } catch {
    // The AI is gone or the area unloaded; the water stays.
  }
}

/**
 * One tick of swimming down or up its water column.
 * @param {string} id
 * @param {Walker} w
 */
function swim(id, w) {
  const ride = /** @type {WaterRide} */ (w.water);
  const ai = w.ai;
  const p = ai.location;
  if (Date.now() > ride.until) {
    giveUp(id, w); // also picks the water up
    return;
  }
  const v = ai.getVelocity();
  const pull = (/** @type {Vector3} */ c) => ({ x: (c.x + 0.5 - p.x) * 0.3, z: (c.z + 0.5 - p.z) * 0.3 });
  if (ride.dir === "down") {
    if (p.y <= ride.endY + 0.1 && ai.isOnGround) {
      pickUpWater(w); // at the bottom: back to walking
      w.last = { ...p };
      w.stuck = 0;
      return;
    }
    const h = pull(ride.col);
    ai.applyImpulse({ x: h.x - v.x, y: -0.25 - v.y, z: h.z - v.z });
    return;
  }
  // Up: swim to the top, then step onto the wall and scoop the water up.
  const out = /** @type {Vector3} */ (ride.out);
  if (Math.floor(p.x) === out.x && Math.floor(p.z) === out.z) {
    pickUpWater(w);
    w.last = { ...p };
    w.stuck = 0;
    return;
  }
  if (p.y >= ride.endY - 0.1) {
    const h = pull(out);
    ai.applyImpulse({ x: h.x * 2 - v.x, y: 0.05 - v.y, z: h.z * 2 - v.z });
  } else {
    const h = pull(ride.col);
    ai.applyImpulse({ x: h.x - v.x, y: 0.25 - v.y, z: h.z - v.z });
  }
}

/**
 * Breaks leaves, dirt, sand, snow and vines at the feet and head height of a spot (and the block above
 * that when it's heading upwards). Returns true if it broke any.
 * @param {import("@minecraft/server").Dimension} dim @param {Vector3} cell @param {boolean} upwards
 */
function breakSoft(dim, cell, upwards) {
  let broke = false;
  const cells = [cell, { ...cell, y: cell.y + 1 }];
  if (upwards) cells.push({ ...cell, y: cell.y + 2 });
  for (const p of cells) {
    const id = dim.getBlock(p)?.typeId ?? "";
    if (!SOFT.test(id)) continue;
    dim.setBlockType(p, "minecraft:air");
    dim.playSound(/leaves|vine/.test(id) ? "dig.grass" : /sand|gravel/.test(id) ? "dig.sand" : "dig.gravel", p);
    broke = true;
  }
  return broke;
}

/**
 * Every side of a tree trunk is blocked by leaves or dirt: clear one side so it can stand there.
 * @param {import("@minecraft/server").Dimension} dim @param {Vector3} base
 * @returns {Vector3 | undefined}
 */
function clearStand(dim, base) {
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const feet = { x: base.x + sx, y: base.y, z: base.z + sz };
    const floorBlock = dim.getBlock({ ...feet, y: feet.y - 1 });
    if (!floorBlock || passable(floorBlock) || LAVA.includes(floorBlock.typeId)) continue;
    const head = { ...feet, y: feet.y + 1 };
    const ok = [feet, head].every((p) => {
      const b = dim.getBlock(p);
      return !!b && (passable(b) || SOFT.test(b.typeId));
    });
    if (!ok) continue;
    breakSoft(dim, feet, false);
    return feet;
  }
  return undefined;
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
 * @param {{ warned: Map<string, number> }} state
 * @param {string} ownerId
 * @param {string} kind
 * @param {string} message
 * @param {number} [every]  ms between repeats
 */
function warn(state, ownerId, kind, message, every = WARN_MS) {
  const now = Date.now();
  if (now - (state.warned.get(kind) ?? 0) < every) return;
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
export function face(ai, p) {
  const eye = eyeOf(ai);
  const dx = p.x - eye.x;
  const dz = p.z - eye.z;
  const pitch = (-Math.atan2(p.y - eye.y, Math.hypot(dx, dz)) * 180) / Math.PI;
  turnTo(ai, pitch, (Math.atan2(-dx, dz) * 180) / Math.PI);
}

/** Where each AI is turning to look: it turns there smoothly over a few ticks. @type {Map<string, { ai: import("@minecraft/server").Entity, x: number, y: number, until: number }>} */
const turning = new Map();

/**
 * Turns the AI's head/body towards a direction smoothly (a bit more every tick) instead of snapping,
 * so it doesn't jerk around when it changes its mind about where to look.
 * @param {import("@minecraft/server").Entity} ai @param {number} pitch @param {number} yaw
 */
export function turnTo(ai, pitch, yaw) {
  turning.set(ai.id, { ai, x: pitch, y: yaw, until: system.currentTick + 20 });
}

system.runInterval(() => {
  for (const [id, t] of turning) {
    try {
      if (!t.ai.isValid || system.currentTick > t.until) {
        turning.delete(id);
        continue;
      }
      const r = t.ai.getRotation();
      const dy = ((((t.y - r.y) % 360) + 540) % 360) - 180; // the short way round
      const dx = t.x - r.x;
      if (Math.abs(dy) < 1 && Math.abs(dx) < 1) {
        t.ai.setRotation({ x: t.x, y: t.y });
        continue;
      }
      t.ai.setRotation({ x: r.x + dx * TURN, y: r.y + dy * TURN });
    } catch {
      turning.delete(id);
    }
  }
}, 1);

// ================================================================ boats (sand by the water)

/** Where each AI is paddling its boat. @type {Map<string, { boat: import("@minecraft/server").Entity, goal: Vector3, last: Vector3, still: number, sand: Vector3 | undefined, state: GatherState }>} */
const boatGoals = new Map();

/** Water with air above it (the surface). @param {import("@minecraft/server").Dimension} dim @param {Vector3} p */
function surface(dim, p) {
  return /water/.test(dim.getBlock(p)?.typeId ?? "") && !!dim.getBlock({ ...p, y: p.y + 1 })?.isAir;
}

/** Land right next to this spot (solid at water level or a block up). @param {import("@minecraft/server").Dimension} dim @param {Vector3} p */
function shoreAt(dim, p) {
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) =>
    [0, 1].some((dy) => {
      const b = dim.getBlock({ x: p.x + dx, y: p.y + dy, z: p.z + dz });
      return !!b && !passable(b);
    })
  );
}

/**
 * Collecting sand from a boat: digs sand by the water it can reach; otherwise paddles to the closest
 * sand by the water; none: paddles along the shore to find more.
 * @param {import("@minecraft/server").Entity} ai @param {import("./data.js").AiRecord} record
 * @param {GatherState} state @param {import("@minecraft/server").Entity} boat
 * @returns {number | undefined}
 */
function boatSand(ai, record, state, boat) {
  const dim = ai.dimension;
  const now = Date.now();
  state.cave.visited.set(areaKey(boat.location), now);
  const g = boatGoals.get(ai.id);
  if (g && dist(boat.location, g.goal) > 1.2) {
    // Paddling. Not moving for 3 seconds: something's in the way, so skip that sand.
    if (dist(boat.location, g.last) < 0.1) {
      if (++g.still > 6) {
        if (g.sand) state.avoid.set(blockKey(g.sand), now + 60000);
        boatGoals.delete(ai.id);
      }
    } else {
      g.last = { ...boat.location };
      g.still = 0;
    }
    return undefined;
  }
  boatGoals.delete(ai.id);
  const types = Object.keys(GATHER).filter((id) => GATHER[id].focus === "Sand");
  const f = floor(boat.location);
  let found;
  try {
    found = [...dim.getBlocks(new BlockVolume({ x: f.x - BOAT_SCAN, y: f.y - 6, z: f.z - BOAT_SCAN }, { x: f.x + BOAT_SCAN, y: f.y + 3, z: f.z + BOAT_SCAN }), { includeTypes: types }).getBlockLocationIterator()];
  } catch {
    return undefined;
  }
  const eye = eyeOf(ai);
  const byWater = found
    .filter((p) => (state.avoid.get(blockKey(p)) ?? 0) <= now)
    .filter((p) => [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(([dx, dy, dz]) => /water/.test(dim.getBlock({ x: p.x + dx, y: p.y + dy, z: p.z + dz })?.typeId ?? "")))
    .sort((a, b) => dist(center(a), eye) - dist(center(b), eye));
  // In reach: dig it from the boat.
  const near = byWater[0];
  if (near && dist(center(near), eye) <= BOAT_REACH) {
    const id = dim.getBlock(near)?.typeId ?? "";
    const tool = toolFor(record, GATHER[id]) ?? { slot: -1, speed: 1 };
    state.mining = { ...near, id, slot: tool.slot, until: system.currentTick + Math.max(4, Math.ceil((GATHER[id].hardness * 30) / tool.speed)), reach: BOAT_REACH };
    face(ai, center(near));
    return tool.slot;
  }
  // Paddle over next to the closest sand by the water.
  if (near) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (const dy of [0, 1, -1]) {
        const w = { x: near.x + dx, y: near.y + dy, z: near.z + dz };
        if (!surface(dim, w)) continue;
        boatGoals.set(ai.id, { boat, goal: { x: w.x + 0.5, y: w.y, z: w.z + 0.5 }, last: { ...boat.location }, still: 0, sand: near, state });
        return undefined;
      }
    }
    state.avoid.set(blockKey(near), now + 60000);
    return undefined;
  }
  // No sand by the water around here: paddle along the shore to somewhere it hasn't been.
  let best;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    for (const r of [16, 10]) {
      const w = { x: Math.floor(f.x + Math.cos(a) * r), y: f.y, z: Math.floor(f.z + Math.sin(a) * r) };
      if (!surface(dim, w) || !shoreAt(dim, w)) continue;
      const seen = now - (state.cave.visited.get(areaKey(w)) ?? 0) < VISITED_MS;
      const score = r - (seen ? 30 : 0);
      if (!best || score > best.score) best = { w, score };
      break;
    }
  }
  if (best) boatGoals.set(ai.id, { boat, goal: { x: best.w.x + 0.5, y: best.w.y, z: best.w.z + 0.5 }, last: { ...boat.location }, still: 0, sand: undefined, state });
  return undefined;
}

/**
 * Gets out of its boat onto land next to it; no land right there: paddles to the closest shore.
 * @param {import("@minecraft/server").Entity} ai @param {GatherState} state @param {import("@minecraft/server").Entity} boat
 */
function toShore(ai, state, boat) {
  const dim = ai.dimension;
  const f = floor(boat.location);
  for (let r = 1; r <= 3; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        for (const dy of [0, 1, 2]) {
          const feet = { x: f.x + dx, y: f.y + dy, z: f.z + dz };
          const below = dim.getBlock({ ...feet, y: feet.y - 1 });
          if (!free(dim, feet) || !below || passable(below) || below.isLiquid || LAVA.includes(below.typeId)) continue;
          boatGoals.delete(ai.id);
          leaveBoat(ai, boat, undefined);
          system.runTimeout(() => ai.isValid && ai.teleport({ x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 }), 2);
          return;
        }
      }
    }
  }
  if (boatGoals.has(ai.id)) return;
  for (let r = 4; r <= 32; r += 2) {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const w = { x: Math.floor(f.x + Math.cos(a) * r), y: f.y, z: Math.floor(f.z + Math.sin(a) * r) };
      if (!surface(dim, w) || !shoreAt(dim, w)) continue;
      boatGoals.set(ai.id, { boat, goal: { x: w.x + 0.5, y: w.y, z: w.z + 0.5 }, last: { ...boat.location }, still: 0, sand: undefined, state });
      return;
    }
  }
}

// Every tick: each AI with somewhere to paddle pushes its boat there (slowing down as it arrives).
system.runInterval(() => {
  for (const [id, g] of boatGoals) {
    try {
      if (!g.boat.isValid || g.state.mining) continue;
      const p = g.boat.location;
      const dx = g.goal.x - p.x;
      const dz = g.goal.z - p.z;
      const d = Math.hypot(dx, dz);
      const v = g.boat.getVelocity();
      if (d < 0.8) {
        g.boat.applyImpulse({ x: -v.x, y: 0, z: -v.z });
        continue;
      }
      const speed = Math.min(0.35, d * 0.15);
      g.boat.applyImpulse({ x: (dx / d) * speed - v.x, y: 0, z: (dz / d) * speed - v.z });
      g.boat.setRotation({ x: 0, y: (Math.atan2(-dx, dz) * 180) / Math.PI });
    } catch {
      boatGoals.delete(id);
    }
  }
}, 1);

/** Distance ignoring height, to the middle of block b. @param {Vector3} a @param {Vector3} b */
function flatDist(a, b) {
  return Math.hypot(a.x - (b.x + 0.5), a.z - (b.z + 0.5));
}

/** @param {Vector3} a @param {Vector3} b */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
