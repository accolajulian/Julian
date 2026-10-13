// Saved data (AI records and memory) and small helpers shared by main.js and brain.js.
import { world } from "@minecraft/server";

export const AI_ENTITY = "aip:ai_player";
/** The skin every AI wears (skin number 10: textures/entity/ai_player/skin_custom.png). */
export const SKIN_LOOK = 10;
export const CAPSULE_ENTITY = "aip:ai_capsule";
const MAX_ENEMIES = 40;

/** @typedef {"resource" | "fighter"} RoleId */
/**
 * @typedef {Object} AiRecord  Saved per AI. Survives the AI dying.
 * @property {string} key  This AI's own ID (also stored on its egg, its Remote and the AI itself).
 * @property {RoleId} role
 * @property {string} ownerId  Who controls it now: whoever has its Remote (controller).
 * @property {string} buyerId  Who bought it. Never changes.
 * @property {string} name
 * @property {number} look
 * @property {"egg" | "thrown" | "alive" | "respawn"} state
 * @property {number} serial  Eggs with an older serial no longer work.
 * @property {string} [id]  Entity id while alive.
 * @property {"follow" | "guard" | "wander" | "stay"} mode  follow you, stay put, guard a spot (Fighter), or wander off on a job.
 * @property {boolean} [upgraded]  Resource AI: its first upgrade (stage 2). Fighter: the final netherite upgrade (stage 4).
 * @property {boolean} [evolved]  A Fighter that started as a Resource AI (stage 3+): it keeps everything the Resource AI could do.
 * @property {number} [diedAt]  When it died (it respawns 60 seconds later).
 * @property {string} focus
 * @property {{ x: number, y: number, z: number, dim: string }} [post]  Guard spot.
 * @property {(import("./inventory.js").ToolData | null)[]} [tools]  3 tool slots, used in order.
 * @property {number[]} [arrows]  2 arrow slots.
 * @property {number} [food]  Cooked chicken it has (the first 30 are its own).
 * @property {number} [foodAt]  Game time of the last food batch.
 * @property {Record<"head" | "chest" | "legs" | "feet", import("./inventory.js").ToolData | null>} [armor]
 * @property {import("./inventory.js").ToolData | null} [shield]
 * @property {({ id: string, count: number } | null)[]} [blocks]  2 block slots.
 * @property {Record<string, number>} [bag]  Gathered items waiting to be collected.
 * @property {({ id: string, count: number } | null)[]} [valuables]  10 slots for diamonds, gold, coal...
 * @property {"sword" | "archer" | "archer_sword"} [combat]  Fighter: Sword Combat, Archer, Archer then Combat.
 * @property {"all" | "players"} [targets]  Fighter: mobs and players, or only players.
 * @property {{ sword: import("./inventory.js").ToolData | null, bow: import("./inventory.js").ToolData | null }} [arms]
 *   Resource AI: sword slot and bow slot (bow or crossbow).
 * @property {number} [torches]  Resource AI: torches (refill to a stack when the last is placed).
 * @property {boolean} [loot]  Fighter: break tombstones and take the loot (default on).
 * @property {({ id: string, count: number } | null)[]} [stash]  Resource AI: its AI Chest (unlocked by the upgrade).
 * @property {number} [hunger]  0-20 (full until it sprints). At 6 or less it can't sprint and eats to full.
 * @property {number} [exhaust]  Sprinting exhaustion towards the next hunger point (4 = 1 point)
 * @property {number} [level]  0-50, from XP (see levels.js)
 * @property {number} [xp]  XP towards the next level
 * @property {number} [xpBank]  XP earned since it last shared with its owner (every 5 levels)
 * @property {number} [pendingXp]  XP to give its owner when they're online
 * @property {import("./levels.js").Report} [report]  What it did since the last 20-minute report
 * @property {string[]} [notes]  Messages for its owner while they're offline
 * @property {string[]} [ores]  Caves: which ores it mines (keys from caves.js; all until chosen)
 * @property {string[]} [netherOres]  Caves in the Nether: which Nether ores it mines
 * @property {import("./caves.js").CaveSpot} [cave]  Caves: where it was sent to work
 * @property {import("./farm.js").FarmPlan} [farm]  Resource AI: the sugar cane farm it's collecting for / building.
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
// Every AI has its own record (key "aip:rec:<key>"). Who controls it can change (by passing its
// Remote to another player); who bought it never does. Each player can BUY one AI of each kind,
// ever ("aip:bought:<player>:<role>"), but can control any number of AIs others hand them.

/** @param {string} key @returns {AiRecord | undefined} */
export function getAi(key) {
  return upgradeRecord(readJson(`aip:rec:${key}`));
}

/**
 * Fixes records saved by older versions (the Resource AI's choices are now Trees and Caves).
 * @param {AiRecord | undefined} record
 */
function upgradeRecord(record) {
  if (record && !["Trees", "Caves", "Strip mine", "Sugar cane farm", "Nothing"].includes(record.focus)) {
    record.focus = record.focus === "Wood" ? "Trees" : "Caves";
  }
  return record;
}

/**
 * Saves an AI record. (The first two arguments are kept so older call sites read naturally.)
 * @param {string} _ownerId @param {RoleId} _role @param {AiRecord} record
 */
export function saveRecord(_ownerId, _role, record) {
  writeJson(`aip:rec:${record.key}`, record);
}

/** @param {string} key */
export function removeAi(key) {
  writeJson(`aip:rec:${key}`, undefined);
}

/** A new unique AI key. */
export function newKey() {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Every AI record in the world. @returns {AiRecord[]} */
export function allAis() {
  migrateOldRecords();
  /** @type {AiRecord[]} */
  const list = [];
  for (const id of world.getDynamicPropertyIds()) {
    if (!id.startsWith("aip:rec:")) continue;
    const record = upgradeRecord(readJson(id));
    if (record) list.push(record);
  }
  return list;
}

/**
 * The AIs a player controls (optionally only one kind).
 * @param {string} playerId @param {RoleId} [role]
 */
export function controlledBy(playerId, role) {
  return allAis().filter((r) => r.ownerId === playerId && (!role || r.role === role));
}

/** @param {string} playerId */
export function ownsAnyAi(playerId) {
  return controlledBy(playerId).length > 0;
}

// ---------------------------------------------------------------- stages
// Each player buys ONE AI: a Resource AI (stage 1). At the Coder it levels up:
//   stage 2 (10 diamonds): strip mining, lava/fire/fall proof, AI Chest unlocked
//   stage 3 (15 diamonds): becomes a Fighter, keeping everything it could do before
//   stage 4 (10 netherite): the Fighter's final upgrade (sprint, power jump, knockback, volley)
// (Fighters bought before version 1.21 have no resource abilities.)

/** Stage 1-4 (an old directly-bought Fighter counts as 3, or 4 when upgraded). @param {AiRecord} r */
export function stageOf(r) {
  if (r.role === "resource") return r.upgraded ? 2 : 1;
  return r.upgraded ? 4 : 3;
}

/** Can gather, build and carry torches/water/AI Chest (a Resource AI, or a Fighter that was one). @param {AiRecord} r */
export function canGather(r) {
  return r.role === "resource" || !!r.evolved;
}

/** Has the Resource AI upgrade's perks: strip mining, fall proof, AI Chest unlocked, Computer Chest. @param {AiRecord} r */
export function resourcePerks(r) {
  return (r.role === "resource" && !!r.upgraded) || !!r.evolved;
}

/** Has the Fighter's final (netherite) upgrade. @param {AiRecord} r */
export function fighterPerks(r) {
  return r.role === "fighter" && !!r.upgraded;
}

/** Lava and fire can't hurt it. @param {AiRecord} r */
export function lavaProof(r) {
  return resourcePerks(r) || fighterPerks(r);
}

/** Opens in a Computer Chest. @param {AiRecord} r */
export function chestReady(r) {
  return resourcePerks(r) || fighterPerks(r);
}

/** Has this player bought their AI yet? (One per player, ever.) @param {string} playerId */
export function hasBoughtAny(playerId) {
  return ROLE_IDS.some((role) => hasBought(playerId, role));
}

/** Has this player already bought an AI of this kind? */
/** @param {string} playerId @param {RoleId} role */
export function hasBought(playerId, role) {
  return world.getDynamicProperty(`aip:bought:${playerId}:${role}`) === true;
}

/** @param {string} playerId @param {RoleId} role */
export function markBought(playerId, role) {
  world.setDynamicProperty(`aip:bought:${playerId}:${role}`, true);
}

/** Converts records saved by versions before 1.12 ("aip:ai:<player>:<role>"). */
function migrateOldRecords() {
  try {
    migrate();
  } catch {
    // Can't save right now (e.g. inside a "before" event); it runs again on the next lookup.
  }
}

function migrate() {
  for (const id of world.getDynamicPropertyIds()) {
    const match = /^aip:ai:(.+):(resource|fighter)$/.exec(id);
    if (!match) continue;
    const old = readJson(id);
    world.setDynamicProperty(id, undefined);
    if (!old) continue;
    const [, playerId, role] = match;
    const record = { ...old, key: newKey(), role, ownerId: playerId, buyerId: playerId };
    writeJson(`aip:rec:${record.key}`, record);
    markBought(playerId, /** @type {RoleId} */ (role));
  }
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
  let key = entity.getDynamicProperty("aip:key");
  if (typeof key !== "string") {
    // An AI from before version 1.12: find its record and remember its key.
    const record = allAis().find((r) => r.id === entity.id);
    if (!record) return undefined;
    key = record.key;
    try {
      entity.setDynamicProperty("aip:key", key);
    } catch {
      // Read-only moment (before an event); it'll be saved next time.
    }
  }
  return { ownerId, role, key };
}

/** Which player and role each AI belongs to, in case a dead AI's saved data can't be read. */
/** @type {Map<string, { ownerId: string, role: RoleId, key: string }>} */
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
