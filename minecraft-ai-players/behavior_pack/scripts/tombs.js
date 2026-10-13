// Fighter AI: breaks tombstones (from a tombstone/grave add-on) and loots them, taking the most
// valuable items first and sorting each into the right slot.
//
// Tombstones come from another add-on, so their IDs aren't known in advance. Anything whose ID
// contains "grave", "tomb", "headstone" or "corpse" counts automatically, and players can teach
// the Fighter any other ID from its menu (Tombstones > Teach).
import { world, BlockTypes, EntityTypes, BlockVolume, ItemStack } from "@minecraft/server";
import { saveRecord, findPlayer } from "./data.js";
import {
  inventoryOf,
  itemValue,
  toolFromStack,
  stackFromTool,
  ALLOWED_TOOLS,
  armorSlotFor,
  SHIELD_ITEM,
  ARROW_ITEM,
  isValuable,
  addValuables,
  addArrows,
  addBlocks,
  addWood,
  isWood,
  isPlaceableBlock,
  itemName,
} from "./inventory.js";

const NAME_HINT = /grave|tomb|headstone|corpse/;
const SEARCH_RADIUS = 12;
const REACH = 3.5;
const LOOT_MS = 6000; // keep picking up loot around the tombstone for this long
const TAUGHT_KEY = "aip:tomb_types";

/** @type {{ blocks: string[], entities: string[] } | undefined} */
let detected;

/** Tombstone block and entity IDs: detected by name, plus the ones players taught. */
export function tombTypes() {
  if (!detected) {
    const blocks = BlockTypes.getAll().map((t) => t.id).filter((id) => !id.startsWith("minecraft:") && NAME_HINT.test(id));
    const entities = EntityTypes.getAll().map((t) => t.id).filter((id) => !id.startsWith("minecraft:") && NAME_HINT.test(id));
    detected = { blocks, entities };
  }
  const taught = getTaught();
  return {
    blocks: [...new Set([...detected.blocks, ...taught.filter((id) => BlockTypes.get(id))])],
    entities: [...new Set([...detected.entities, ...taught.filter((id) => !BlockTypes.get(id))])],
  };
}

/** @returns {string[]} */
export function getTaught() {
  const raw = world.getDynamicProperty(TAUGHT_KEY);
  try {
    return typeof raw === "string" ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** @param {string[]} ids */
export function setTaught(ids) {
  world.setDynamicProperty(TAUGHT_KEY, JSON.stringify([...new Set(ids)]));
}

/**
 * Add-on blocks and entities right next to a player, to pick a tombstone from.
 * @param {import("@minecraft/server").Player} player
 */
export function addOnThingsNear(player) {
  const ids = new Set();
  const p = player.location;
  for (let x = -3; x <= 3; x++) {
    for (let y = -2; y <= 2; y++) {
      for (let z = -3; z <= 3; z++) {
        const id = player.dimension.getBlock({ x: p.x + x, y: p.y + y, z: p.z + z })?.typeId;
        if (id && !id.startsWith("minecraft:")) ids.add(id);
      }
    }
  }
  for (const e of player.dimension.getEntities({ location: p, maxDistance: 4 })) {
    if (!e.typeId.startsWith("minecraft:") && !e.typeId.startsWith("aip:")) ids.add(e.typeId);
  }
  return [...ids];
}

/**
 * @typedef {Object} LootState  Per loaded Fighter (not saved).
 * @property {number} until
 * @property {import("@minecraft/server").Vector3 | undefined} at
 * @property {string[]} taken
 */

/** @returns {LootState} */
export function createLootState() {
  return { until: 0, at: undefined, taken: [] };
}

/**
 * When it isn't fighting: finds a tombstone, goes to it, breaks it, then loots it.
 * Returns true while it's busy with a tombstone.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 * @param {LootState} state
 */
export function handleTombs(ai, ownerId, record, state) {
  if (record.loot === false) return false;
  const now = Date.now();

  // Looting a broken tombstone.
  if (state.at && now < state.until) {
    lootAround(ai, ownerId, record, state);
    return true;
  }
  if (state.at) {
    if (state.taken.length) {
      findPlayer(ownerId)?.sendMessage(`§6${record.name} looted a tombstone: §f${state.taken.slice(0, 8).join(", ")}${state.taken.length > 8 ? "..." : ""}`);
    }
    state.at = undefined;
    state.taken = [];
  }

  const tomb = findTomb(ai);
  if (!tomb) return false;

  if (tomb.distance > REACH && !moveNextTo(ai, tomb.location)) return false;

  // Break it so its items spill out.
  ai.playAnimation("animation.aip.ai_player.mine");
  const { x, y, z } = tomb.location;
  if (tomb.entity) {
    if (!tomb.entity.kill()) tomb.entity.applyDamage(1000);
  } else {
    ai.dimension.runCommand(`setblock ${x} ${y} ${z} air destroy`);
  }
  ai.dimension.playSound("dig.stone", tomb.location);
  state.at = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
  state.until = now + LOOT_MS;
  state.taken = [];
  return true;
}

/** @param {import("@minecraft/server").Entity} ai */
function findTomb(ai) {
  const types = tombTypes();
  const dim = ai.dimension;
  /** @type {{ location: import("@minecraft/server").Vector3, distance: number, entity?: import("@minecraft/server").Entity } | undefined} */
  let best;

  if (types.blocks.length) {
    const p = ai.location;
    const volume = new BlockVolume(
      { x: Math.floor(p.x) - SEARCH_RADIUS, y: Math.floor(p.y) - 4, z: Math.floor(p.z) - SEARCH_RADIUS },
      { x: Math.floor(p.x) + SEARCH_RADIUS, y: Math.floor(p.y) + 4, z: Math.floor(p.z) + SEARCH_RADIUS }
    );
    try {
      for (const loc of dim.getBlocks(volume, { includeTypes: types.blocks }).getBlockLocationIterator()) {
        const d = dist({ x: loc.x + 0.5, y: loc.y + 0.5, z: loc.z + 0.5 }, ai.location);
        if (!best || d < best.distance) best = { location: loc, distance: d };
      }
    } catch {
      // Part of the area isn't loaded.
    }
  }
  for (const id of types.entities) {
    for (const e of dim.getEntities({ type: id, location: ai.location, maxDistance: SEARCH_RADIUS })) {
      const d = dist(e.location, ai.location);
      const loc = { x: Math.floor(e.location.x), y: Math.floor(e.location.y), z: Math.floor(e.location.z) };
      if (!best || d < best.distance) best = { location: loc, distance: d, entity: e };
    }
  }
  return best;
}

/**
 * Moves the AI to a free spot next to a block (a short hop, like following its owner).
 * @param {import("@minecraft/server").Entity} ai
 * @param {import("@minecraft/server").Vector3} target
 */
function moveNextTo(ai, target) {
  const dim = ai.dimension;
  const sides = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }];
  sides.sort((a, b) =>
    dist({ x: target.x + a.x, y: target.y, z: target.z + a.z }, ai.location) -
    dist({ x: target.x + b.x, y: target.y, z: target.z + b.z }, ai.location)
  );
  for (const s of sides) {
    const feet = { x: target.x + s.x, y: target.y, z: target.z + s.z };
    const free = dim.getBlock(feet)?.isAir && dim.getBlock({ ...feet, y: feet.y + 1 })?.isAir;
    const floor = dim.getBlock({ ...feet, y: feet.y - 1 });
    if (free && floor && !floor.isAir && !floor.isLiquid) {
      ai.teleport({ x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 });
      return true;
    }
  }
  return false;
}

/**
 * Picks up the items around the broken tombstone, most valuable first.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 * @param {LootState} state
 */
function lootAround(ai, ownerId, record, state) {
  if (!state.at) return;
  const items = ai.dimension
    .getEntities({ location: state.at, maxDistance: 5, type: "minecraft:item" })
    .map((entity) => ({ entity, stack: entity.getComponent("minecraft:item")?.itemStack }))
    .filter((i) => i.stack)
    .sort((a, b) => worth(b.stack) - worth(a.stack));

  let changed = false;
  for (const { entity, stack } of items) {
    if (!stack || !entity.isValid) continue;
    const { taken, dropped } = store(record, stack);
    if (taken === 0) continue;
    changed = true;
    const location = entity.location;
    entity.remove();
    if (taken < stack.amount) {
      stack.amount -= taken;
      ai.dimension.spawnItem(stack, location);
    }
    // Anything it swapped out (worse armor or tools) is left on the ground.
    for (const old of dropped) ai.dimension.spawnItem(old, ai.location);
    state.taken.push(`${taken > 1 ? `${taken} ` : ""}${stack.nameTag ?? itemName(stack.typeId)}`);
  }
  if (changed) saveRecord(ownerId, "fighter", record);
}

/** @param {ItemStack | undefined} stack */
function worth(stack) {
  if (!stack) return 0;
  let enchantments = 0;
  try {
    enchantments = stack.getComponent("minecraft:enchantable")?.getEnchantments().length ?? 0;
  } catch {
    // Not enchantable.
  }
  return itemValue(stack.typeId, enchantments) * stack.amount;
}

/**
 * Puts a looted item in the right slot. Better armor/tools replace worse ones.
 * @param {import("./data.js").AiRecord} record
 * @param {ItemStack} stack
 * @returns {{ taken: number, dropped: ItemStack[] }}
 */
function store(record, stack) {
  const inv = inventoryOf(record);
  const id = stack.typeId;
  /** @type {ItemStack[]} */
  const dropped = [];

  if (isValuable(id)) return { taken: addValuables(record, id, stack.amount), dropped };
  if (id === ARROW_ITEM) return { taken: addArrows(record, stack.amount), dropped };

  const armorSlot = armorSlotFor(id);
  if (armorSlot) {
    const current = inv.armor[armorSlot];
    if (current && worth(stackFromTool(current)) >= worth(stack)) return { taken: 0, dropped };
    if (current) dropped.push(stackFromTool(current));
    inv.armor[armorSlot] = toolFromStack(stack);
    return { taken: 1, dropped };
  }
  if (id === SHIELD_ITEM) {
    if (inv.shield) return { taken: 0, dropped };
    inv.shield = toolFromStack(stack);
    return { taken: 1, dropped };
  }
  if (ALLOWED_TOOLS.fighter.has(id)) {
    const empty = inv.tools.findIndex((t) => !t);
    if (empty !== -1) {
      inv.tools[empty] = toolFromStack(stack);
      return { taken: 1, dropped };
    }
    // Replace its least valuable tool if this one is better.
    let worst = 0;
    inv.tools.forEach((t, i) => {
      const w = inv.tools[worst];
      if (t && w && worth(stackFromTool(t)) < worth(stackFromTool(w))) worst = i;
    });
    const old = inv.tools[worst];
    if (old && worth(stackFromTool(old)) < worth(stack)) {
      dropped.push(stackFromTool(old));
      inv.tools[worst] = toolFromStack(stack);
      return { taken: 1, dropped };
    }
    return { taken: 0, dropped };
  }
  if (isWood(id)) return { taken: addWood(record, id, stack.amount), dropped };
  if (isPlaceableBlock(id)) return { taken: addBlocks(record, id, stack.amount), dropped };
  return { taken: 0, dropped }; // not something it carries: left for players
}

/** @param {import("@minecraft/server").Vector3} a @param {import("@minecraft/server").Vector3} b */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
