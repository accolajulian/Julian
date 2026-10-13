// Levels, XP and reports.
// - The AI earns XP from mining/chopping/digging, from defeating mobs and players, and from finishing a
//   sugar cane farm. Levels slowly make it faster (walking and mining) and stronger (damage).
// - Every 5 levels it hands the XP it earned over those 5 levels to its owner (as normal player XP).
// - Every 20 minutes its owner gets a report: "Max collected: 12 raw iron, 30 oak log..." and the
//   count starts again.
// - Messages and XP for an owner who is offline are kept and given when they're back.
import { world, system } from "@minecraft/server";
import { AI_ENTITY, getAi, saveRecord, findPlayer, allAis, ownerInfo } from "./data.js";
import { itemName } from "./inventory.js";

export const MAX_LEVEL = 50;
const SHARE_EVERY = 5; // levels
const REPORT_MS = 20 * 60 * 1000; // 20 minutes
const MAX_NOTES = 10;
const MOB_XP = 5;
const PLAYER_XP = 25;
export const FARM_XP = 50;

/** XP for one block mined, by what it drops (anything else: 1). @type {Record<string, number>} */
const BLOCK_XP = {
  "minecraft:diamond": 8,
  "minecraft:emerald": 8,
  "minecraft:ancient_debris": 10,
  "minecraft:raw_gold": 4,
  "minecraft:redstone": 3,
  "minecraft:lapis_lazuli": 3,
  "minecraft:raw_iron": 2,
  "minecraft:raw_copper": 2,
  "minecraft:quartz": 2,
};

/**
 * @typedef {Object} Report  What it did since the last report.
 * @property {number} since
 * @property {Record<string, number>} items  item id -> how many
 * @property {Record<string, number>} kills  name -> how many
 * @property {number} xp
 */

/** XP for one block mined, by what it drops. @param {string} drop */
export function blockXp(drop) {
  return BLOCK_XP[drop] ?? 1;
}

/** XP needed to go from this level to the next. @param {number} level */
export function xpNeeded(level) {
  return 20 + level * 10;
}

/** @param {import("./data.js").AiRecord} record */
export function levelOf(record) {
  return record.level ?? 0;
}

/** Walking speed multiplier: +1% a level, up to +25%. @param {number} level */
export function moveFactor(level) {
  return 1 + Math.min(level, 25) * 0.01;
}

/** Mining time multiplier: 1% faster a level, up to 30% faster. @param {number} level */
export function miningFactor(level) {
  return 1 - Math.min(level, 30) * 0.01;
}

/** Extra damage: +1 every 10 levels (up to +5). @param {number} level */
export function damageBonus(level) {
  return Math.floor(Math.min(level, MAX_LEVEL) / 10);
}

/** @param {number} level */
function perkText(level) {
  return `+${Math.round((moveFactor(level) - 1) * 100)}% speed, ${Math.round((1 - miningFactor(level)) * 100)}% faster mining, +${damageBonus(level)} damage`;
}

/** "Level 7 (35/90 XP)" @param {import("./data.js").AiRecord} record */
export function levelText(record) {
  const level = levelOf(record);
  return level >= MAX_LEVEL ? `Level ${level} (max)` : `Level ${level} (${Math.floor(record.xp ?? 0)}/${xpNeeded(level)} XP)`;
}

/** @param {import("./data.js").AiRecord} record @returns {Report} */
function report(record) {
  if (!record.report) record.report = { since: Date.now(), items: {}, kills: {}, xp: 0 };
  return record.report;
}

/**
 * XP for the AI. Levels it up, and every 5 levels shares what it earned with its owner.
 * (The caller saves the record.)
 * @param {import("./data.js").AiRecord} record @param {number} amount
 */
export function addXp(record, amount) {
  if (amount <= 0) return;
  record.level = levelOf(record);
  record.xp = (record.xp ?? 0) + amount;
  record.xpBank = (record.xpBank ?? 0) + amount;
  report(record).xp += amount;
  while (record.level < MAX_LEVEL && record.xp >= xpNeeded(record.level)) {
    record.xp -= xpNeeded(record.level);
    record.level++;
    notify(record, `§a${record.name} reached level ${record.level}! §7(${perkText(record.level)})`);
    if (record.level % SHARE_EVERY === 0) share(record);
  }
  if (record.level >= MAX_LEVEL) {
    record.xp = 0;
    if (record.xpBank >= xpNeeded(MAX_LEVEL) * SHARE_EVERY) share(record); // max level: keeps sharing
  }
  deliver(record);
}

/** Hands its saved-up XP to its owner. @param {import("./data.js").AiRecord} record */
function share(record) {
  record.pendingXp = (record.pendingXp ?? 0) + (record.xpBank ?? 0);
  record.xpBank = 0;
}

/** Counts something it collected, for the next report. @param {import("./data.js").AiRecord} record @param {string} id @param {number} amount */
export function countCollected(record, id, amount) {
  if (amount <= 0) return;
  const items = report(record).items;
  items[id] = (items[id] ?? 0) + amount;
}

/**
 * Tells its owner something now, or as soon as they're back online.
 * @param {import("./data.js").AiRecord} record @param {string} text
 */
export function notify(record, text) {
  const owner = findPlayer(record.ownerId);
  if (owner) {
    owner.sendMessage(text);
    return;
  }
  record.notes = [...(record.notes ?? []), text].slice(-MAX_NOTES);
}

/** Gives the owner (if online) any XP and messages waiting for them. Returns true if it changed the record. @param {import("./data.js").AiRecord} record */
function deliver(record) {
  const owner = findPlayer(record.ownerId);
  if (!owner) return false;
  let changed = false;
  if (record.notes?.length) {
    for (const note of record.notes) owner.sendMessage(note);
    record.notes = [];
    changed = true;
  }
  if ((record.pendingXp ?? 0) > 0) {
    const xp = Math.floor(record.pendingXp ?? 0);
    owner.addExperience(xp);
    owner.sendMessage(`§e${record.name} shared ${xp} XP with you! §7(every 5 levels it hands over what it earned)`);
    owner.playSound("random.levelup");
    record.pendingXp = 0;
    changed = true;
  }
  return changed;
}

/** @param {Report} r */
function summary(r) {
  const list = (/** @type {Record<string, number>} */ counts, /** @type {(k: string) => string} */ name) =>
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${n} ${name(k)}`)
      .join(", ");
  const parts = [];
  if (Object.keys(r.items).length) parts.push(`§fcollected: ${list(r.items, itemName)}`);
  if (Object.keys(r.kills).length) parts.push(`§fdefeated: ${list(r.kills, (k) => k)}`);
  return parts.join("§7 | ");
}

// Every minute: deliver waiting XP/messages, and send each 20-minute report.
system.runInterval(() => {
  const now = Date.now();
  for (const record of allAis()) {
    let changed = deliver(record);
    const r = record.report;
    if (r && now - r.since >= REPORT_MS) {
      const text = summary(r);
      if (!text) {
        record.report = undefined; // nothing to report: start counting again
        changed = true;
      } else if (findPlayer(record.ownerId)) {
        findPlayer(record.ownerId)?.sendMessage(`§b${record.name} §7(last 20 min)§b ${text}§7 | +${r.xp} XP, ${levelText(record)}`);
        record.report = undefined;
        changed = true;
      } // owner offline: keep counting until they're back
    }
    if (changed) saveRecord(record.ownerId, record.role, record);
  }
}, 1200);

// Defeating mobs and players: XP and a line in the report.
world.afterEvents.entityDie.subscribe(({ deadEntity, damageSource }) => {
  const ai = damageSource.damagingEntity;
  if (!ai || ai.typeId !== AI_ENTITY) return;
  let info, name;
  try {
    info = ai.isValid ? ownerInfo(ai) : undefined;
    name = deadEntity.typeId === "minecraft:player"
      ? /** @type {import("@minecraft/server").Player} */ (deadEntity).name
      : itemName(deadEntity.typeId);
  } catch {
    return;
  }
  const record = info ? getAi(info.key) : undefined;
  if (!record || !name) return;
  const kills = report(record).kills;
  kills[name] = (kills[name] ?? 0) + 1;
  addXp(record, deadEntity.typeId === "minecraft:player" ? PLAYER_XP : MOB_XP);
  saveRecord(record.ownerId, record.role, record);
});
