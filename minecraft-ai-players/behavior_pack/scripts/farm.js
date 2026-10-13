// Sugar cane farm (Resource AI).
//
// 1. Placing: the player picks "Sugar cane farm" and looks at water. A colored outline shows the finished
//    farm (the 22-long side points away from the player). It can only go in water. Left click to place
//    it, sneak to cancel.
// 2. Collecting: the AI gathers logs, sand and sugar cane (it leaves the bottom of each sugar cane so it
//    grows back). The player can also hand it materials from its menu.
// 3. Building: it crafts the logs into planks and a boat, then, step by step:
//    - rides its boat over the area and lays a floor of planks 1 block below the water surface,
//    - wades along the water channels and puts 1 sand on each plank of the 6 lines,
//    - plants 1 sugar cane on each sand.
//    Before collecting, it puts a warp point (a lodestone) on the closest land next to the farm.
//    20 minutes after the farm was placed it warps back there and is given whatever it's still
//    missing, so the farm always gets finished. (If sugar cane ever runs short while planting, it
//    harvests new growth on the farm, leaving the bottom, and plants it on the next empty sand.)
//
// The farm is 15 wide and 22 long:
// - floor: 15 x 22 = 330 planks, 1 block below the water surface (replacing whatever is there),
// - 6 lines of 18 sand on the floor (2 blocks apart, 2-block gaps at the edges) = 108 sand,
// - 1 sugar cane on every sand = 108 sugar cane.
// Materials: 330 + 5 for the boat = 335 planks = 84 logs (1 plank spare), 108 sand, 108 sugar cane.
import { world, system, ItemStack, MolangVariableMap } from "@minecraft/server";
import { isLeftClick } from "./effects.js";
import { MessageFormData } from "@minecraft/server-ui";
import { GATHER } from "./gather_data.js";
import { getAi, saveRecord, findPlayer, giveItem, countItem, takeItem } from "./data.js";
import { notify } from "./levels.js";
import { inventoryOf, isWood } from "./inventory.js";

export const FARM_FOCUS = "Sugar cane farm";
const WIDTH = 15;
const LENGTH = 22;
const LINES = [2, 4, 6, 8, 10, 12]; // which columns across the width get sand + sugar cane
const LINE_START = 2; // the lines run from block 2 to block 19 along the length (18 blocks)
const LINE_END = 19;
const LANES = [3, 7, 11]; // water channels it travels along (each reaches the lines on both sides)
export const FLOOR_PLANKS = WIDTH * LENGTH; // 330
export const LINE_BLOCKS = LINES.length * (LINE_END - LINE_START + 1); // 108
export const BOAT_PLANKS = 5;
export const NEED_LOGS = Math.ceil((FLOOR_PLANKS + BOAT_PLANKS) / 4); // 84
const CANE_BLOCK = "minecraft:reeds";
const CANE_ITEM = "minecraft:sugar_cane";
const SANDS = ["minecraft:sand", "minecraft:red_sand"];
const BOAT_ENTITY = "minecraft:boat";
const BOAT_ITEM = "minecraft:oak_boat";
const REACH = 4.5; // places blocks this far away
const PLACE_PER_THINK = 2; // blocks placed per think (4 a second)
const SPEED = 0.15; // blocks per tick while building
const PLACING_MS = 180000; // placement mode ends after 3 minutes
const ONLY_WATER = "Only in water";
const CANE_WAIT_TICKS = 20 * 60 * 20; // 20 minutes (game time): then it's given what it's missing
const WARP_BLOCK = "minecraft:lodestone";
const WARP_SEARCH = 40; // looks for land this far from the farm
export const FARM_COST = 10; // iron ingots: the farm's materials are then all provided
const IRON = "minecraft:iron_ingot";

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/**
 * @typedef {Object} FarmPlan  Saved on the AI's record.
 * @property {string} dim
 * @property {number} ox  corner (width 0, length 0) at the water surface
 * @property {number} oy  the water surface layer (the planks go 1 below it)
 * @property {number} oz
 * @property {number} lx  length direction (away from the player who placed it)
 * @property {number} lz
 * @property {number} wx  width direction
 * @property {number} wz
 * @property {"collect" | "planks" | "sand" | "cane"} phase
 * @property {Record<string, number>} logs  collected logs by type
 * @property {Record<string, number>} planks  crafted planks by type
 * @property {number} sand
 * @property {number} cane
 * @property {boolean} boat  crafted its boat
 * @property {string} [boatId]  the boat in the water
 * @property {{ planks: number, sand: number, cane: number }} left  blocks still to place
 * @property {number} [startedAt]  game time the farm was placed
 * @property {boolean} [growing]  short of sugar cane: replanting what grows
 * @property {Vector3} [warp]  its warp point (a lodestone on the closest land)
 * @property {boolean} [paid]  bought for 10 iron: every material was provided (kept by the AI, can't be taken)
 */
/** @typedef {Pick<FarmPlan, "dim" | "ox" | "oy" | "oz" | "lx" | "lz" | "wx" | "wz">} Spot */

// ================================================================ the layout

/** A spot in the farm: w across (0-14), l along (0-21), dy up from the water surface. @param {Spot} g @param {number} w @param {number} l @param {number} dy */
function at(g, w, l, dy) {
  return { x: g.ox + g.wx * w + g.lx * l, y: g.oy + dy, z: g.oz + g.wz * w + g.lz * l };
}

/** @param {number} w @param {number} l */
function isLine(w, l) {
  return LINES.includes(w) && l >= LINE_START && l <= LINE_END;
}

/** The path it travels: up channel 3, across the end, down channel 7, across, up channel 11. */
function routeCells() {
  /** @type {{ w: number, l: number }[]} */
  const cells = [];
  LANES.forEach((w, i) => {
    const along = [...Array(LENGTH).keys()];
    if (i % 2 === 1) along.reverse();
    for (const l of along) cells.push({ w, l });
    const end = along[along.length - 1];
    if (i < LANES.length - 1) for (let x = w + 1; x < LANES[i + 1]; x++) cells.push({ w: x, l: end });
  });
  return cells;
}
const ROUTE = routeCells();

/**
 * The blocks to place in a phase, in the order it builds them (following its route).
 * @param {"planks" | "sand" | "cane"} phase
 */
function phaseCells(phase) {
  /** @type {{ w: number, l: number, dy: number, idx: number }[]} */
  const cells = [];
  for (let w = 0; w < WIDTH; w++) {
    for (let l = 0; l < LENGTH; l++) {
      if (phase !== "planks" && !isLine(w, l)) continue;
      let idx = 0;
      let best = Infinity;
      ROUTE.forEach((r, i) => {
        const d = (r.w - w) ** 2 + (r.l - l) ** 2;
        if (d < best) {
          best = d;
          idx = i;
        }
      });
      cells.push({ w, l, dy: phase === "planks" ? -1 : phase === "sand" ? 0 : 1, idx });
    }
  }
  return cells.sort((a, b) => a.idx - b.idx);
}
const CELLS = { planks: phaseCells("planks"), sand: phaseCells("sand"), cane: phaseCells("cane") };

/** @param {import("@minecraft/server").Block | undefined} block */
function isWater(block) {
  if (!block) return false;
  return /water|seagrass|kelp|bubble_column|coral|sea_pickle/.test(block.typeId) || block.isWaterlogged;
}

/** Already built? @param {"planks" | "sand" | "cane"} phase @param {import("@minecraft/server").Block | undefined} block */
function built(phase, block) {
  if (!block) return false;
  if (phase === "planks") return block.typeId.endsWith("_planks");
  if (phase === "sand") return SANDS.includes(block.typeId);
  return block.typeId === CANE_BLOCK;
}

// ================================================================ materials

/** @param {Record<string, number>} counts */
function sum(counts) {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/** @param {string} logId */
function plankOf(logId) {
  return logId.replace(/_(log|stem)$/, "_planks");
}

/** What it still has to collect. @param {FarmPlan} plan */
export function farmNeeds(plan) {
  const planks = plan.left.planks + (plan.boat ? 0 : BOAT_PLANKS);
  const missingPlanks = Math.max(0, planks - sum(plan.planks));
  return {
    logs: Math.max(0, Math.ceil(missingPlanks / 4) - sum(plan.logs)),
    sand: Math.max(0, plan.left.sand - plan.sand),
    cane: Math.max(0, plan.left.cane - plan.cane),
  };
}

/** @param {import("./data.js").AiRecord} record */
function collecting(record) {
  return record.focus === FARM_FOCUS && record.farm?.phase === "collect" ? record.farm : undefined;
}

/**
 * Which kinds of blocks (GATHER focus) to go and get for its farm right now.
 * @param {import("./data.js").AiRecord} record
 */
export function farmKinds(record) {
  const plan = collecting(record);
  if (!plan) return [];
  const need = farmNeeds(plan);
  return [need.logs > 0 ? "Wood" : "", need.sand > 0 ? "Sand" : "", need.cane > 0 ? "Cane" : ""].filter((k) => k);
}

/**
 * Whatever farm materials it already carries count towards the farm: logs in its wood and block slots,
 * planks in its block slots. (They're moved into the farm's materials.)
 * @param {string} ownerId @param {import("./data.js").AiRecord} record @param {FarmPlan} plan
 */
function useOwnMaterials(ownerId, record, plan) {
  const inv = inventoryOf(record);
  let logs = 0;
  let planks = 0;
  for (const slots of [inv.wood, inv.blocks]) {
    slots.forEach((b, i) => {
      if (!b) return;
      const need = farmNeeds(plan);
      let n = 0;
      if (isWood(b.id) && need.logs > 0) {
        n = Math.min(b.count, need.logs);
        plan.logs[b.id] = (plan.logs[b.id] ?? 0) + n;
        logs += n;
      } else if (b.id.endsWith("_planks") && need.logs > 0) {
        n = Math.min(b.count, need.logs * 4);
        plan.planks[b.id] = (plan.planks[b.id] ?? 0) + n;
        planks += n;
      }
      b.count -= n;
      if (b.count <= 0) slots[i] = null;
    });
  }
  if (logs + planks === 0) return;
  saveRecord(ownerId, record.role, record);
  findPlayer(ownerId)?.sendMessage(
    `§a${record.name} used ${[logs ? `${logs} logs` : "", planks ? `${planks} planks` : ""].filter((t) => t).join(" and ")} it already had for the farm.`
  );
}

/**
 * Keeps a gathered drop for the farm. Returns true if it was kept.
 * @param {import("./data.js").AiRecord} record @param {string} drop @param {number} amount
 */
export function farmCollect(record, drop, amount) {
  const plan = collecting(record);
  if (!plan) return false;
  if (GATHER[drop]?.focus === "Wood") plan.logs[drop] = (plan.logs[drop] ?? 0) + amount;
  else if (SANDS.includes(drop)) plan.sand += amount;
  else if (drop === CANE_ITEM) plan.cane += amount;
  else return false;
  return true;
}

/**
 * Everything collected (or 20 minutes are up): craft the planks and the boat and start building.
 * @param {import("@minecraft/server").Entity} ai @param {string} ownerId @param {import("./data.js").AiRecord} record
 */
export function checkCollected(ai, ownerId, record) {
  const plan = collecting(record);
  if (!plan) return;
  if (plan.startedAt === undefined) plan.startedAt = world.getAbsoluteTime();
  useOwnMaterials(ownerId, record, plan);
  const need = farmNeeds(plan);
  const missing = need.logs + need.sand + need.cane;
  const timeUp = world.getAbsoluteTime() - plan.startedAt >= CANE_WAIT_TICKS;
  if (missing > 0 && !timeUp) return;
  if (missing > 0) {
    // 20 minutes are up: it's given the rest and warps back to the farm.
    if (need.logs > 0) plan.logs["minecraft:oak_log"] = (plan.logs["minecraft:oak_log"] ?? 0) + need.logs;
    plan.sand += need.sand;
    plan.cane += need.cane;
    const given = [need.logs ? `${need.logs} logs` : "", need.sand ? `${need.sand} sand` : "", need.cane ? `${need.cane} sugar cane` : ""]
      .filter((t) => t)
      .join(", ");
    findPlayer(ownerId)?.sendMessage(`§b20 minutes are up: ${record.name} was given the ${given} it still needed.`);
  }
  if (plan.warp && ai.dimension.id === plan.dim) {
    ai.teleport({ x: plan.warp.x + 0.5, y: plan.warp.y + 1, z: plan.warp.z + 0.5 });
    ai.dimension.playSound("mob.endermen.portal", ai.location);
  }
  plan.growing = false;
  let crafted = 0;
  for (const [id, n] of Object.entries(plan.logs)) {
    plan.planks[plankOf(id)] = (plan.planks[plankOf(id)] ?? 0) + n * 4;
    crafted += n * 4;
  }
  plan.logs = {};
  if (!plan.boat) {
    for (let left = BOAT_PLANKS; left > 0; left--) takePlank(plan);
    plan.boat = true;
  }
  plan.phase = "planks";
  saveRecord(ownerId, "resource", record);
  findPlayer(ownerId)?.sendMessage(
    `§a${record.name} has everything for the sugar cane farm!` +
      (crafted > 0 ? ` §fIt crafted ${crafted} planks and a boat.` : "") +
      " §fNow it's building: planks first, then sand, then sugar cane."
  );
}

/** Uses one plank (the type it has most of). @param {FarmPlan} plan */
function takePlank(plan) {
  const id = Object.keys(plan.planks).sort((a, b) => plan.planks[b] - plan.planks[a])[0];
  if (!id || plan.planks[id] <= 0) return undefined;
  plan.planks[id] -= 1;
  if (plan.planks[id] === 0) delete plan.planks[id];
  return id;
}

/**
 * Takes farm materials from a player's inventory (only what it still needs).
 * @param {import("@minecraft/server").Player} player @param {import("./data.js").AiRecord} record
 * @returns {string[]} what was taken
 */
export function giveFarmMaterials(player, record) {
  const plan = collecting(record);
  if (!plan) return [];
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return [];
  /** @type {Set<string>} */
  const ids = new Set();
  for (let i = 0; i < container.size; i++) {
    const id = container.getItem(i)?.typeId;
    if (id) ids.add(id);
  }
  /** @type {string[]} */
  const taken = [];
  const take = (/** @type {string} */ id, /** @type {number} */ want) => {
    const n = Math.min(want, countItem(player, id));
    if (n <= 0) return 0;
    takeItem(player, id, n);
    taken.push(`${n} ${id.replace("minecraft:", "").replace(/_/g, " ")}`);
    return n;
  };
  // Planks first (no crafting needed), then logs.
  for (const id of ids) {
    if (!id.endsWith("_planks")) continue;
    const missing = plan.left.planks + (plan.boat ? 0 : BOAT_PLANKS) - sum(plan.planks) - sum(plan.logs) * 4;
    if (missing <= 0) break;
    const n = take(id, missing);
    plan.planks[id] = (plan.planks[id] ?? 0) + n;
  }
  for (const id of ids) {
    if (GATHER[id]?.focus !== "Wood") continue;
    const n = take(id, farmNeeds(plan).logs);
    if (n > 0) plan.logs[id] = (plan.logs[id] ?? 0) + n;
  }
  for (const id of SANDS) if (ids.has(id)) plan.sand += take(id, farmNeeds(plan).sand);
  if (ids.has(CANE_ITEM)) plan.cane += take(CANE_ITEM, farmNeeds(plan).cane);
  saveRecord(record.ownerId, "resource", record);
  return taken;
}

/**
 * Gives back everything collected for the farm (when it's cancelled or finished).
 * @param {import("./data.js").AiRecord} record
 * @param {import("@minecraft/server").Player | undefined} player
 * @param {import("@minecraft/server").Entity | undefined} ai
 */
export function returnFarmMaterials(record, player, ai) {
  const plan = record.farm;
  if (!plan) return;
  const give = (/** @type {string} */ id, /** @type {number} */ total) => {
    for (let n = total; n > 0; n -= 64) {
      const stack = new ItemStack(id, Math.min(64, n));
      if (player) giveItem(player, stack);
      else ai?.dimension.spawnItem(stack, ai.location);
    }
  };
  // Materials it was provided (bought for iron) are never handed out.
  if (!plan.paid) {
    for (const [id, n] of Object.entries(plan.logs)) give(id, n);
    for (const [id, n] of Object.entries(plan.planks)) give(id, n);
    give("minecraft:sand", plan.sand);
    give(CANE_ITEM, plan.cane);
  }
  const boat = plan.boatId ? world.getEntity(plan.boatId) : undefined;
  if (boat?.isValid) boat.remove();
  if (plan.boat) give(BOAT_ITEM, 1); // its boat (crafted from planks it collected)
}

/**
 * The farm materials it carries (shown on a locked slot in its inventory), or undefined with no farm.
 * @param {import("./data.js").AiRecord} record
 */
export function farmMaterialsText(record) {
  const plan = record.farm;
  if (!plan) return undefined;
  return `${sum(plan.planks) + sum(plan.logs) * 4} planks, ${plan.sand} sand, ${plan.cane} sugar cane`;
}

/** Nothing built yet (cancelling gives the iron back). @param {FarmPlan} plan */
export function farmUntouched(plan) {
  return plan.phase === "collect" || (plan.phase === "planks" && plan.left.planks === FLOOR_PLANKS);
}

/** Progress for menus, a few short lines. @param {FarmPlan} plan */
export function farmProgress(plan) {
  if (plan.phase === "collect") {
    const need = farmNeeds(plan);
    const minutes = plan.startedAt === undefined ? 20 : Math.max(0, Math.ceil((CANE_WAIT_TICKS - (world.getAbsoluteTime() - plan.startedAt)) / 1200));
    return `§7Collecting${minutes > 0 ? ` (${minutes} min left)` : ""}§r\nLogs: ${need.logs}\nSand: ${need.sand}\nSugar cane: ${need.cane}`;
  }
  const names = { planks: "planks", sand: "sand", cane: "sugar cane" };
  return `§7Building:§r ${names[plan.phase]}, ${plan.left[plan.phase]} left`;
}

// ================================================================ building

/**
 * @typedef {Object} BuildState  Per loaded AI (not saved).
 * @property {"planks" | "sand" | "cane"} phase
 * @property {{ w: number, l: number, dy: number, idx: number }[]} cells  still to place, in order
 */
/** @type {Map<string, BuildState>} */
const builds = new Map();

/** Is it building (not collecting)? Then it shouldn't wander off. @param {import("./data.js").AiRecord} record */
export function farmBuilding(record) {
  return record.focus === FARM_FOCUS && !!record.farm && record.farm.phase !== "collect";
}

/**
 * One think of building. Places a couple of blocks near it and moves along its route.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 */
export function buildFarm(ai, ownerId, record) {
  const plan = record.farm;
  if (!plan || plan.phase === "collect") return;
  const dim = ai.dimension;
  if (dim.id !== plan.dim) return;
  const phase = plan.phase;

  let b = builds.get(ai.id);
  if (!b || b.phase !== phase) {
    b = startPhase(ai, plan);
    builds.set(ai.id, b);
    saveRecord(ownerId, "resource", record);
  }

  // Out of sugar cane: harvest what has grown on the farm and plant it on the empty sand.
  if (phase === "cane" && plan.cane <= 0) {
    if (harvestGrowth(ai, plan)) saveRecord(ownerId, "resource", record);
    return;
  }

  // Place what's in reach (looking a few blocks ahead in its order).
  let placed = 0;
  let changed = false;
  for (let i = 0; i < b.cells.length && i < 12 && placed < PLACE_PER_THINK; ) {
    const c = b.cells[i];
    const p = at(plan, c.w, c.l, c.dy);
    const block = dim.getBlock(p);
    if (!block) {
      i++;
      continue; // not loaded
    }
    if (built(phase, block)) {
      b.cells.splice(i, 1);
      continue;
    }
    if (Math.hypot(p.x + 0.5 - ai.location.x, p.z + 0.5 - ai.location.z) > REACH) {
      i++;
      continue;
    }
    const id = phase === "planks" ? takePlank(plan) : phase === "sand" ? (plan.sand > 0 ? "minecraft:sand" : undefined) : plan.cane > 0 ? CANE_BLOCK : undefined;
    if (!id && phase === "cane") break; // used the last sugar cane: next think it harvests new growth
    if (!id) {
      // Ran out (someone broke part of the farm?): go and collect some more.
      plan.phase = "collect";
      saveRecord(ownerId, "resource", record);
      builds.delete(ai.id);
      findPlayer(ownerId)?.sendMessage(`§e${record.name} ran out of materials for the farm and is collecting more.`);
      return;
    }
    if (phase === "sand") plan.sand -= 1;
    if (phase === "cane") plan.cane -= 1;
    dim.setBlockType(p, id);
    dim.playSound(phase === "planks" ? "dig.wood" : phase === "sand" ? "dig.sand" : "dig.grass", p);
    plan.left[phase] = Math.max(0, plan.left[phase] - 1);
    b.cells.splice(i, 1);
    placed++;
    changed = true;
  }
  if (placed > 0) ai.playAnimation("animation.aip.ai_player.mine");
  if (changed) saveRecord(ownerId, "resource", record);

  if (b.cells.length === 0) {
    nextPhase(ai, ownerId, record);
    return;
  }
  // Move to the part of its route next to the next block.
  const r = ROUTE[b.cells[0].idx];
  const target = at(plan, r.w, r.l, 0);
  moveTo(ai, { x: target.x + 0.5, y: target.y, z: target.z + 0.5 }, plan.boatId);
}

/**
 * Puts a warp point (a lodestone) on the closest land next to the farm. Returns where, or undefined.
 * @param {import("@minecraft/server").Dimension} dim @param {Spot} g
 * @returns {Vector3 | undefined}
 */
function placeWarp(dim, g) {
  const corners = [at(g, 0, 0, 0), at(g, WIDTH - 1, LENGTH - 1, 0)];
  const minX = Math.min(corners[0].x, corners[1].x);
  const maxX = Math.max(corners[0].x, corners[1].x);
  const minZ = Math.min(corners[0].z, corners[1].z);
  const maxZ = Math.max(corners[0].z, corners[1].z);
  /** @type {{ p: Vector3, d: number } | undefined} */
  let best;
  // Ring by ring outward from the farm's edge, so the first land found is the closest.
  for (let ring = 1; ring <= WARP_SEARCH && !best; ring++) {
    for (let x = minX - ring; x <= maxX + ring; x++) {
      for (let z = minZ - ring; z <= maxZ + ring; z++) {
        const onRing = x === minX - ring || x === maxX + ring || z === minZ - ring || z === maxZ + ring;
        if (!onRing) continue;
        const dx = x < minX ? minX - x : x > maxX ? x - maxX : 0;
        const dz = z < minZ ? minZ - z : z > maxZ ? z - maxZ : 0;
        const d = Math.hypot(dx, dz);
        if (best && d >= best.d) continue;
        const spot = landAt(dim, x, z, g.oy);
        if (spot) best = { p: spot, d };
      }
    }
  }
  if (!best) return undefined;
  dim.setBlockType(best.p, WARP_BLOCK);
  dim.playSound("random.orb", best.p);
  return best.p;
}

/**
 * Land at (or a little above) the water level here: a solid block with room on top. Returns the spot on top.
 * @param {import("@minecraft/server").Dimension} dim @param {number} x @param {number} z @param {number} waterY
 */
function landAt(dim, x, z, waterY) {
  for (let y = waterY; y <= waterY + 3; y++) {
    const ground = dim.getBlock({ x, y, z });
    const above = dim.getBlock({ x, y: y + 1, z });
    const head = dim.getBlock({ x, y: y + 2, z });
    if (!ground || !above || !head) return undefined;
    if (ground.isAir || ground.isLiquid || isWater(ground) || /leaves|log/.test(ground.typeId)) continue;
    if (above.isAir && head.isAir) return { x, y: y + 1, z };
  }
  return undefined;
}

/** Takes its warp point away (the farm is done or cancelled). @param {FarmPlan} plan */
export function removeWarp(plan) {
  if (!plan.warp) return;
  try {
    const dim = world.getDimension(plan.dim);
    if (dim.getBlock(plan.warp)?.typeId === WARP_BLOCK) dim.setBlockType(plan.warp, "minecraft:air");
  } catch {
    // unloaded: it stays
  }
  plan.warp = undefined;
}

/**
 * Finds a planted sugar cane that has grown (2+ tall), goes to it and harvests the new growth,
 * leaving the bottom so it keeps growing. Returns true if it harvested some.
 * @param {import("@minecraft/server").Entity} ai @param {FarmPlan} plan
 */
function harvestGrowth(ai, plan) {
  const dim = ai.dimension;
  /** @type {{ c: { w: number, l: number, idx: number }, base: Vector3, d: number } | undefined} */
  let best;
  for (const c of CELLS.cane) {
    const base = at(plan, c.w, c.l, 1);
    if (dim.getBlock(base)?.typeId !== CANE_BLOCK || dim.getBlock({ ...base, y: base.y + 1 })?.typeId !== CANE_BLOCK) continue;
    const d = Math.hypot(base.x + 0.5 - ai.location.x, base.z + 0.5 - ai.location.z);
    if (!best || d < best.d) best = { c, base, d };
  }
  if (!best) return false; // nothing has grown yet: wait
  if (best.d > REACH) {
    const r = ROUTE[best.c.idx];
    const target = at(plan, r.w, r.l, 0);
    moveTo(ai, { x: target.x + 0.5, y: target.y, z: target.z + 0.5 }, undefined);
    return false;
  }
  let top = best.base.y + 1;
  while (top < best.base.y + 6 && dim.getBlock({ ...best.base, y: top + 1 })?.typeId === CANE_BLOCK) top++;
  for (let y = top; y > best.base.y; y--) {
    dim.setBlockType({ ...best.base, y }, "minecraft:air");
    plan.cane++;
  }
  dim.playSound("dig.grass", best.base);
  ai.playAnimation("animation.aip.ai_player.mine");
  return true;
}

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {FarmPlan} plan
 * @returns {BuildState}
 */
function startPhase(ai, plan) {
  const phase = /** @type {"planks" | "sand" | "cane"} */ (plan.phase);
  const dim = ai.dimension;
  const cells = CELLS[phase].filter((c) => !built(phase, dim.getBlock(at(plan, c.w, c.l, c.dy))));
  plan.left[phase] = cells.length;

  // Go to the start of its route if it's far away.
  const start = at(plan, ROUTE[0].w, ROUTE[0].l, 0);
  if (Math.hypot(start.x + 0.5 - ai.location.x, start.z + 0.5 - ai.location.z) > 24) {
    ai.teleport({ x: start.x + 0.5, y: start.y + (phase === "planks" ? 0.5 : 0), z: start.z + 0.5 });
  }
  if (phase === "planks") {
    // Put its boat in the water and get in.
    let boat = plan.boatId ? world.getEntity(plan.boatId) : undefined;
    if (!boat?.isValid) {
      try {
        boat = dim.spawnEntity(BOAT_ENTITY, { x: ai.location.x, y: start.y + 0.5, z: ai.location.z });
        plan.boatId = boat.id;
      } catch {
        boat = undefined;
      }
    }
    if (boat) boat.getComponent("minecraft:rideable")?.addRider(ai);
  } else {
    stowBoat(plan); // it wades along the channels for the sand and sugar cane
  }
  return { phase, cells };
}

/** Takes the boat out of the water (it's put back when the farm is done). @param {FarmPlan} plan */
function stowBoat(plan) {
  const boat = plan.boatId ? world.getEntity(plan.boatId) : undefined;
  if (boat?.isValid) {
    boat.getComponent("minecraft:rideable")?.ejectRiders();
    boat.remove();
  }
  plan.boatId = undefined;
}

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 */
function nextPhase(ai, ownerId, record) {
  const plan = /** @type {FarmPlan} */ (record.farm);
  builds.delete(ai.id);
  const owner = findPlayer(ownerId);
  if (plan.phase === "planks") {
    plan.phase = "sand";
    owner?.sendMessage(`§a${record.name} finished the plank floor. §fNow the sand.`);
  } else if (plan.phase === "sand") {
    plan.phase = "cane";
    owner?.sendMessage(`§a${record.name} put down all the sand. §fNow the sugar cane.`);
  } else {
    // Done: park the boat next to the farm for the owner and hand back anything left over.
    const dock = at(plan, Math.floor(WIDTH / 2), -2, 0);
    let docked = false;
    if (isWater(ai.dimension.getBlock(dock))) {
      try {
        ai.dimension.spawnEntity(BOAT_ENTITY, { x: dock.x + 0.5, y: dock.y + 0.5, z: dock.z + 0.5 });
        docked = true;
      } catch {
        // no room: the boat item is given instead
      }
    }
    const close = owner && owner.dimension.id === ai.dimension.id &&
      Math.hypot(owner.location.x - ai.location.x, owner.location.z - ai.location.z) <= 32 ? owner : undefined;
    plan.boat = !docked; // returnFarmMaterials gives the boat item if it couldn't be parked
    returnFarmMaterials(record, close, ai);
    removeWarp(plan);
    record.farm = undefined;
    record.focus = "Trees";
    record.mode = "follow";
    // Told right away (or as soon as the owner is back online).
    notify(record, `§a§l${record.name} finished your sugar cane farm!§r${docked ? " §fIts boat is parked next to it for you." : ""}`);
  }
  saveRecord(ownerId, "resource", record);
}

// ---------------------------------------------------------------- moving while building

/** @type {Map<string, { ai: import("@minecraft/server").Entity, target: Vector3, boatId: string | undefined, until: number }>} */
const movers = new Map();

/**
 * @param {import("@minecraft/server").Entity} ai @param {Vector3} target @param {string | undefined} boatId
 */
function moveTo(ai, target, boatId) {
  movers.set(ai.id, { ai, target, boatId, until: Date.now() + 1500 });
}

// Every tick: push the boat (or the AI, when it's wading) toward its target.
system.runInterval(() => {
  for (const [id, m] of movers) {
    if (!m.ai.isValid || Date.now() > m.until) {
      movers.delete(id);
      continue;
    }
    try {
      const boat = m.boatId ? world.getEntity(m.boatId) : undefined;
      const riding = boat?.isValid && m.ai.getComponent("minecraft:riding")?.entityRidingOn?.id === boat.id;
      const mover = riding && boat ? boat : m.ai;
      const p = mover.location;
      const dx = m.target.x - p.x;
      const dz = m.target.z - p.z;
      const d = Math.hypot(dx, dz);
      const v = mover.getVelocity();
      const speed = d < 0.2 ? 0 : Math.min(SPEED, d);
      const ux = d > 0 ? dx / d : 0;
      const uz = d > 0 ? dz / d : 0;
      mover.applyImpulse({ x: ux * speed - v.x, y: 0, z: uz * speed - v.z });
      if (d >= 0.2) {
        const yaw = (Math.atan2(-ux, uz) * 180) / Math.PI;
        if (!riding) m.ai.setRotation({ x: 0, y: yaw });
        else boat?.setRotation({ x: 0, y: yaw });
      }
    } catch {
      movers.delete(id);
    }
  }
}, 1);

// ================================================================ placing the farm

/**
 * @typedef {Object} Preview
 * @property {Spot | undefined} spot
 * @property {boolean} valid
 * @property {string} reason
 */
/** Players choosing where the farm goes. @type {Map<string, { key: string, until: number, asking: boolean, preview: Preview | undefined }>} */
const placing = new Map();

/** @param {string} playerId */
export function isPlacing(playerId) {
  return placing.has(playerId);
}

/** @param {import("@minecraft/server").Player} player @param {string} key */
export function startPlacing(player, key) {
  placing.set(player.id, { key, until: Date.now() + PLACING_MS, asking: false, preview: undefined });
  player.sendMessage("§eLook at water. Tap Place (or left click) to place it, sneak to cancel.");
}

/** @param {import("@minecraft/server").Player} player @param {string} [why] */
function stopPlacing(player, why) {
  placing.delete(player.id);
  if (why) player.sendMessage(why);
  player.onScreenDisplay.setActionBar("");
}

/**
 * Where the farm would go: starting where the player looks, the long side pointing away from them.
 * @param {import("@minecraft/server").Player} player
 * @returns {Preview}
 */
function preview(player) {
  const dim = player.dimension;
  if (dim.id === "minecraft:nether") return { spot: undefined, valid: false, reason: ONLY_WATER };
  const hit = player.getBlockFromViewDirection({ includeLiquidBlocks: true, includePassableBlocks: true, maxDistance: 64 });
  if (!hit) return { spot: undefined, valid: false, reason: "Look at water" };
  let p = hit.block.location;
  if (isWater(hit.block)) {
    // The top of the water.
    for (let i = 0; i < 64 && isWater(dim.getBlock({ ...p, y: p.y + 1 })); i++) p = { ...p, y: p.y + 1 };
  } else {
    p = { ...p, y: p.y + 1 }; // looking at land: show the outline on it (in red)
  }
  const view = player.getViewDirection();
  const [lx, lz] = Math.abs(view.x) > Math.abs(view.z) ? [Math.sign(view.x), 0] : [0, Math.sign(view.z) || 1];
  const [wx, wz] = [-lz, lx];
  const half = Math.floor(WIDTH / 2);
  /** @type {Spot} */
  const spot = { dim: dim.id, ox: p.x - half * wx, oy: p.y, oz: p.z - half * wz, lx, lz, wx, wz };

  // Every spot of the farm's surface has to be water, with open air (or plants) above it.
  let notWater = 0;
  for (let w = 0; w < WIDTH; w++) {
    for (let l = 0; l < LENGTH; l++) {
      const surface = dim.getBlock(at(spot, w, l, 0));
      if (!surface) return { spot, valid: false, reason: "That's too far away" };
      const above = dim.getBlock(at(spot, w, l, 1));
      const open = !!above && (above.isAir || above.isLiquid || /lily|grass|flower|vine/.test(above.typeId));
      if (!isWater(surface) || !open) notWater++;
    }
  }
  if (notWater > 0) return { spot, valid: false, reason: `${ONLY_WATER} (${notWater} spots aren't)` };
  return { spot, valid: true, reason: "" };
}

/** @param {number} red @param {number} green @param {number} blue */
function color(red, green, blue) {
  const molang = new MolangVariableMap();
  molang.setColorRGB("variable.color", { red, green, blue });
  return molang;
}
/**
 * The outline colors. Made the first time they're needed: Minecraft doesn't allow making them while
 * the add-on is still starting up ("cannot be used in early execution").
 * @type {{ plank: MolangVariableMap, sand: MolangVariableMap, cane: MolangVariableMap, bad: MolangVariableMap } | undefined}
 */
let colors;
function outlineColors() {
  colors ??= {
    plank: color(0.75, 0.58, 0.36),
    sand: color(0.98, 0.92, 0.62),
    cane: color(0.45, 0.95, 0.35),
    bad: color(1, 0.15, 0.15),
  };
  return colors;
}

/**
 * Shows the finished farm as colored dots (only to the placing player): the plank floor's edge
 * 1 block under the water, the sand lines at the surface and the sugar cane above them.
 * @param {import("@minecraft/server").Player} player @param {Preview} pv
 */
function draw(player, pv) {
  player.onScreenDisplay.setActionBar(
    pv.valid
      ? "§aTap Place (or left click): place §7| Sneak: cancel"
      : `§c${pv.reason} §7| Sneak: cancel`
  );
  const g = pv.spot;
  if (!g) return;
  const c = outlineColors();
  const dot = (/** @type {Vector3} */ p, /** @type {number} */ y, /** @type {MolangVariableMap} */ c) => {
    try {
      player.spawnParticle("minecraft:colored_flame_particle", { x: p.x + 0.5, y: p.y + y, z: p.z + 0.5 }, c);
    } catch {
      // unloaded
    }
  };
  for (let w = 0; w < WIDTH; w++) {
    for (let l = 0; l < LENGTH; l++) {
      const edge = w === 0 || w === WIDTH - 1 || l === 0 || l === LENGTH - 1;
      if (edge) dot(at(g, w, l, 0), 0.05, pv.valid ? c.plank : c.bad); // top of the planks
      if (!pv.valid || !isLine(w, l) || l % 2 === 1) continue;
      dot(at(g, w, l, 0), 0.95, c.sand); // top of the sand (at the water surface)
      if (l % 4 === 0) dot(at(g, w, l, 1), 0.7, c.cane); // sugar cane
    }
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
      stopPlacing(player, "§7Farm placing timed out.");
      continue;
    }
    if (s.asking) continue;
    if (player.isSneaking) {
      stopPlacing(player, "§7Cancelled.");
      continue;
    }
    try {
      s.preview = preview(player);
      draw(player, s.preview);
    } catch (error) {
      console.warn(`[AI Players] farm preview error: ${error}`);
    }
  }
}, 10);

// While placing, left click (Attack) OR the Place/use button confirms it. (On iPads and phones the
// on-screen Place button counts as a "use", not a left click.)
/** @param {import("@minecraft/server").Player} player */
function tryConfirm(player) {
  const s = placing.get(player.id);
  if (!s || s.asking) return;
  s.asking = true;
  system.run(() => confirmPlace(player, s).finally(() => (s.asking = false)));
}
world.afterEvents.playerSwingStart.subscribe(({ player, swingSource }) => {
  if (isLeftClick(swingSource)) tryConfirm(player);
});
world.afterEvents.itemUse.subscribe(({ source }) => tryConfirm(source));

/**
 * @param {import("@minecraft/server").Player} player
 * @param {{ key: string, preview: Preview | undefined }} s
 */
async function confirmPlace(player, s) {
  const pv = s.preview;
  if (!pv?.valid || !pv.spot) {
    player.sendMessage(`§c${pv?.reason ?? ONLY_WATER}.`);
    return;
  }
  const record = getAi(s.key);
  if (!record || record.ownerId !== player.id) {
    stopPlacing(player, "§cYou don't control that AI anymore.");
    return;
  }
  const moving = !!record.farm;
  if (!moving && countItem(player, IRON) < FARM_COST) {
    player.sendMessage(`§cThe sugar cane farm costs ${FARM_COST} iron ingots (you have ${countItem(player, IRON)}).`);
    return;
  }
  const response = await new MessageFormData()
    .title("Build here?")
    .body(moving
      ? "Move the farm here?"
      : `Costs §f${FARM_COST} iron ingots§r.\n§7${record.name} gets all the materials (${NEED_LOGS} logs' worth of planks, ${LINE_BLOCKS} sand, ${LINE_BLOCKS} sugar cane) and builds it.`)
    .button1("Build")
    .button2("Cancel")
    .show(player);
  if (response.canceled) return; // closed: keep aiming
  if (response.selection !== 0) {
    stopPlacing(player, "§7Cancelled.");
    return;
  }
  const latest = getAi(s.key);
  if (!latest || latest.ownerId !== player.id) return;
  // Pay for a new farm.
  const paid = !latest.farm;
  if (paid) {
    if (countItem(player, IRON) < FARM_COST) {
      stopPlacing(player, `§cThe sugar cane farm costs ${FARM_COST} iron ingots.`);
      return;
    }
    takeItem(player, IRON, FARM_COST);
  }
  // Moving a farm it's still collecting for keeps what it collected.
  const keep = latest.farm?.phase === "collect" ? latest.farm : undefined;
  if (latest.farm && !keep) returnFarmMaterials(latest, player, undefined);
  if (latest.farm) removeWarp(latest.farm);
  const warp = placeWarp(player.dimension, pv.spot);
  latest.farm = {
    ...pv.spot,
    phase: "collect",
    logs: keep?.logs ?? {},
    planks: keep?.planks ?? {},
    sand: keep?.sand ?? 0,
    cane: keep?.cane ?? 0,
    boat: keep?.boat ?? false,
    left: { planks: FLOOR_PLANKS, sand: LINE_BLOCKS, cane: LINE_BLOCKS },
    startedAt: keep?.startedAt ?? world.getAbsoluteTime(),
    warp,
    paid: paid || keep?.paid,
  };
  // Bought for iron: every material is provided right away, so it goes straight to building.
  const plan = latest.farm;
  if (paid) {
    plan.logs = { "minecraft:oak_log": NEED_LOGS };
    plan.planks = {};
    plan.sand = LINE_BLOCKS;
    plan.cane = LINE_BLOCKS;
    plan.boat = false;
  }
  latest.focus = FARM_FOCUS;
  latest.mode = "wander";
  saveRecord(player.id, "resource", latest);
  stopPlacing(player, `§a${latest.name} has the materials and is building the farm.${paid ? ` §7(-${FARM_COST} iron)` : ""}`);
  player.onScreenDisplay.setTitle("§aFarm placed", { subtitle: `${latest.name} is building it`, fadeInDuration: 5, stayDuration: 50, fadeOutDuration: 10 });
  player.playSound("random.orb");
}
