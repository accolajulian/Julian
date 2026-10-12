// Saved data (AI records and memory) and small helpers shared by main.js and brain.js.
import { world } from "@minecraft/server";

export const AI_ENTITY = "aip:ai_player";
export const CAPSULE_ENTITY = "aip:ai_capsule";
const MAX_ENEMIES = 40;

/** @typedef {"resource" | "fighter"} RoleId */
/**
 * @typedef {Object} AiRecord  Saved per player per role. Survives the AI dying.
 * @property {string} name
 * @property {number} look
 * @property {"egg" | "thrown" | "alive" | "respawn"} state
 * @property {number} serial  Eggs with an older serial no longer work.
 * @property {string} [id]  Entity id while alive.
 * @property {"follow" | "guard"} mode
 * @property {string} focus
 * @property {{ x: number, y: number, z: number, dim: string }} [post]  Guard spot.
 * @property {(import("./inventory.js").ToolData | null)[]} [tools]  3 tool slots, used in order.
 * @property {number[]} [arrows]  2 arrow slots.
 * @property {number} [food]  Cooked chicken it has (the first 10 are its own).
 * @property {number} [foodAt]  Game time of the last food batch.
 * @property {Record<"head" | "chest" | "legs" | "feet", import("./inventory.js").ToolData | null>} [armor]
 * @property {import("./inventory.js").ToolData | null} [shield]
 * @property {({ id: string, count: number } | null)[]} [blocks]  2 block slots.
 * @property {Record<string, number>} [bag]  Gathered items waiting to be collected.
 */
/**
 * @typedef {Object} Memory  Saved per owner, shared by both of their AIs. Survives death.
 * @property {Record<string, { name: string, times: number, last: number }>} enemies  Players who attacked the owner or their AIs.
 * @property {Record<string, string>} allies  Players the AIs must never attack (id -> name).
 */

/** @type {RoleId[]} */
export const ROLE_IDS = ["resource", "fighter"];

/** @param {unknown} value @returns {value is RoleId} */
export function isRole(value) {
  return value === "resource" || value === "fighter";
}

// ---------------------------------------------------------------- AI records

/** @param {string} playerId @param {RoleId} role @returns {AiRecord | undefined} */
export function getRecord(playerId, role) {
  return readJson(`aip:ai:${playerId}:${role}`);
}

/** @param {string} playerId @param {RoleId} role @param {AiRecord | undefined} record */
export function saveRecord(playerId, role, record) {
  writeJson(`aip:ai:${playerId}:${role}`, record);
}

/** @param {string} playerId */
export function ownsAnyAi(playerId) {
  return ROLE_IDS.some((role) => getRecord(playerId, role));
}

// ---------------------------------------------------------------- memory

/** @param {string} ownerId @returns {Memory} */
export function getMemory(ownerId) {
  /** @type {Memory | undefined} */
  const memory = readJson(`aip:mem:${ownerId}`);
  return { enemies: memory?.enemies ?? {}, allies: memory?.allies ?? {} };
}

/** @param {string} ownerId @param {Memory} memory */
export function saveMemory(ownerId, memory) {
  // Keep only the most recent enemies so the saved data stays small.
  const ids = Object.keys(memory.enemies).sort((a, b) => memory.enemies[b].last - memory.enemies[a].last);
  for (const id of ids.slice(MAX_ENEMIES)) delete memory.enemies[id];
  writeJson(`aip:mem:${ownerId}`, memory);
}

/** @param {string} key @returns {any} */
function readJson(key) {
  const raw = world.getDynamicProperty(key);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** @param {string} key @param {unknown} value */
function writeJson(key, value) {
  world.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value));
}

// ---------------------------------------------------------------- entities

/** @param {string} playerId */
export function findPlayer(playerId) {
  return world.getPlayers().find((p) => p.id === playerId);
}

/**
 * Owner id and role saved on an AI player or a flying egg.
 * @param {import("@minecraft/server").Entity} entity
 */
export function ownerInfo(entity) {
  const ownerId = entity.getDynamicProperty("aip:owner");
  const role = entity.getDynamicProperty("aip:role");
  if (typeof ownerId !== "string" || !isRole(role)) return undefined;
  return { ownerId, role };
}

/** Which player and role each AI belongs to, in case a dead AI's saved data can't be read. */
/** @type {Map<string, { ownerId: string, role: RoleId }>} */
export const knownAis = new Map();

// ---------------------------------------------------------------- inventory

/** @param {import("@minecraft/server").Player} player @param {string} itemId */
export function countItem(player, itemId) {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return 0;
  let total = 0;
  for (let i = 0; i < container.size; i++) {
    const stack = container.getItem(i);
    if (stack?.typeId === itemId) total += stack.amount;
  }
  return total;
}

/** @param {import("@minecraft/server").Player} player @param {string} itemId @param {number} amount */
export function takeItem(player, itemId, amount) {
  const container = player.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  for (let i = 0; i < container.size && amount > 0; i++) {
    const stack = container.getItem(i);
    if (stack?.typeId !== itemId) continue;
    const take = Math.min(stack.amount, amount);
    amount -= take;
    if (take === stack.amount) {
      container.setItem(i, undefined);
    } else {
      stack.amount -= take;
      container.setItem(i, stack);
    }
  }
}

/** Removes one of the item the player is holding. */
/** @param {import("@minecraft/server").Player} player */
export function takeOneFromHand(player) {
  const container = player.getComponent("minecraft:inventory")?.container;
  const held = container?.getItem(player.selectedSlotIndex);
  if (!container || !held) return;
  if (held.amount > 1) {
    held.amount -= 1;
    container.setItem(player.selectedSlotIndex, held);
  } else {
    container.setItem(player.selectedSlotIndex, undefined);
  }
}

/** Puts an item in the inventory, or drops it at the player's feet if full. */
/** @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").ItemStack} item */
export function giveItem(player, item) {
  const leftover = player.getComponent("minecraft:inventory")?.container?.addItem(item);
  if (leftover) player.dimension.spawnItem(leftover, player.location);
}
