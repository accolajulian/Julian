// Reports. (The AI doesn't level up on its own any more: it only gets stronger at the Coder.)
// - Every 20 minutes its owner gets a report: "Max collected: 12 raw iron, 30 oak log..." and the
//   count starts again.
// - Messages for an owner who is offline are kept and given when they're back (and any XP it still
//   owed them from when it had levels).
import { world, system } from "@minecraft/server";
import { AI_ENTITY, getAi, saveRecord, findPlayer, allAis, ownerInfo } from "./data.js";
import { itemName } from "./inventory.js";

const REPORT_MS = 20 * 60 * 1000; // 20 minutes
const MAX_NOTES = 10;

/**
 * @typedef {Object} Report  What it did since the last report.
 * @property {number} since
 * @property {Record<string, number>} items  item id -> how many
 * @property {Record<string, number>} kills  name -> how many
 */

/** @param {import("./data.js").AiRecord} record @returns {Report} */
function report(record) {
  if (!record.report) record.report = { since: Date.now(), items: {}, kills: {} };
  return record.report;
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
    owner.sendMessage(`§e${record.name} shared ${xp} XP with you!`);
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
        findPlayer(record.ownerId)?.sendMessage(`§b${record.name} §7(last 20 min)§b ${text}`);
        record.report = undefined;
        changed = true;
      } // owner offline: keep counting until they're back
    }
    if (changed) saveRecord(record.ownerId, record.role, record);
  }
}, 1200);

// Defeating mobs and players: a line in the report.
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
  saveRecord(record.ownerId, record.role, record);
});
