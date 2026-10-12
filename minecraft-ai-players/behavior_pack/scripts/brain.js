// The AI players' brain: picks targets, protects the owner, backs off to heal,
// uses the best weapon and remembers enemies and allies (even after dying).
//
// The Script API can't set a mob's target directly, so the brain "points" each AI at its
// target with tags (see tools/make_entity_targets.py):
//   aip_s<k>  on the AI using brain slot k
//   aip_h<k>  on the entity that AI should hunt
//   aip_a<k>  on every entity that AI must never attack
import { world, system, ItemStack, GameMode, EntityDamageCause, EquipmentSlot } from "@minecraft/server";
import {
  AI_ENTITY,
  getRecord,
  saveRecord,
  getMemory,
  saveMemory,
  ownsAnyAi,
  findPlayer,
  ownerInfo,
  knownAis,
  giveItem,
} from "./data.js";

const SLOTS = 16; // must match tools/make_entity_targets.py
const THINK_TICKS = 10; // the brain thinks twice a second
const SCAN_RADIUS = 16;
const RECENT_MS = 8000; // how long a hit counts as "just now"
const RETREAT_BELOW = 0.3; // back off under 30% health...
const RECOVERED_AT = 0.7; // ...until back to 70%
const GUARD_LEASH = 14;
const COMMAND_MS = 30000;
const MAX_WEAPONS = 6;

/** Weapon damage. The AI always holds its best one. */
/** @type {Record<string, number>} */
export const WEAPONS = {
  "minecraft:wooden_sword": 4,
  "minecraft:golden_sword": 4,
  "minecraft:stone_sword": 5,
  "minecraft:iron_sword": 6,
  "minecraft:diamond_sword": 7,
  "minecraft:netherite_sword": 8,
  "minecraft:wooden_axe": 3,
  "minecraft:golden_axe": 3,
  "minecraft:stone_axe": 4,
  "minecraft:iron_axe": 5,
  "minecraft:diamond_axe": 6,
  "minecraft:netherite_axe": 7,
  "minecraft:trident": 8,
  "minecraft:mace": 6,
};

/** How dangerous each mob is. Higher = attacked first. Mobs not listed count as 20. */
/** @type {Record<string, number>} */
const DANGER = {
  "minecraft:ravager": 55,
  "minecraft:evoker": 50,
  "minecraft:piglin_brute": 50,
  "minecraft:vindicator": 45,
  "minecraft:wither_skeleton": 45,
  "minecraft:hoglin": 40,
  "minecraft:zoglin": 40,
  "minecraft:witch": 35,
  "minecraft:pillager": 35,
  "minecraft:blaze": 35,
  "minecraft:breeze": 35,
  "minecraft:stray": 32,
  "minecraft:bogged": 32,
  "minecraft:skeleton": 30,
  "minecraft:vex": 30,
  "minecraft:guardian": 30,
  "minecraft:phantom": 25,
  "minecraft:cave_spider": 24,
  "minecraft:husk": 22,
  "minecraft:drowned": 22,
  "minecraft:zombie": 20,
  "minecraft:zombie_villager_v2": 20,
  "minecraft:spider": 18,
  "minecraft:magma_cube": 15,
  "minecraft:slime": 10,
  "minecraft:silverfish": 8,
  "minecraft:endermite": 8,
};
/** Mobs it leaves alone unless they attack first (exploding, neutral or far too strong). */
const LEAVE_ALONE = new Set([
  "minecraft:creeper",
  "minecraft:enderman",
  "minecraft:zombie_pigman",
  "minecraft:warden",
  "minecraft:wither",
  "minecraft:ender_dragon",
]);
const NOT_TARGETS = new Set(["minecraft:item", "minecraft:xp_orb", "minecraft:armor_stand", "aip:ai_capsule"]);

/**
 * @typedef {Object} Brain  Per loaded AI. Not saved: rebuilt when the AI loads.
 * @property {number | undefined} slot
 * @property {string | undefined} huntId
 * @property {number} huntScore
 * @property {boolean} retreating
 * @property {string | undefined} equipped
 * @property {string | undefined} commandId
 * @property {number} commandUntil
 */
/** @type {Map<string, Brain>} */
const brains = new Map();
/** Which AI uses each slot. @type {(string | undefined)[]} */
const slotUsers = new Array(SLOTS).fill(undefined);

/** victim id -> (attacker id -> time). Used for "who just hit the owner / the AI". */
/** @type {Map<string, Map<string, number>>} */
const recentHits = new Map();

// ================================================================ public

/**
 * Sends a Fighter AI after a target for a while (the interact-then-hit command).
 * @param {import("@minecraft/server").Player} owner
 * @param {import("@minecraft/server").Entity} ai
 * @param {import("@minecraft/server").Entity} target
 */
export function commandAttack(owner, ai, target) {
  const memory = getMemory(owner.id);
  if (memory.allies[target.id]) {
    owner.sendMessage(`§e${target.nameTag} is your ally. Remove them as an ally first.`);
    return;
  }
  const brain = brains.get(ai.id);
  if (!brain) return;
  brain.commandId = target.id;
  brain.commandUntil = Date.now() + COMMAND_MS;
  brain.huntScore = 0; // switch right away
  const targetName = target.typeId === "minecraft:player" ? target.nameTag : "that";
  owner.sendMessage(`§e${ai.nameTag} is going after ${targetName}!`);
}

/**
 * Hand your Fighter AI the weapon you're holding.
 * @param {import("@minecraft/server").Player} owner
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} weaponId
 * @returns {boolean} true if the AI took it
 */
export function giveWeapon(owner, ai, weaponId) {
  const record = getRecord(owner.id, "fighter");
  if (!record) return false;
  const weapons = record.weapons ?? [];
  if (weapons.length >= MAX_WEAPONS) {
    owner.sendMessage(`§e${record.name} can't carry more than ${MAX_WEAPONS} weapons.`);
    return false;
  }
  weapons.push(weaponId);
  record.weapons = weapons;
  saveRecord(owner.id, "fighter", record);
  const brain = brains.get(ai.id);
  if (brain) brain.equipped = undefined; // re-pick the best weapon
  owner.sendMessage(`§a${record.name} took the ${itemName(weaponId)}. It always uses its best weapon.`);
  return true;
}

/**
 * Gives all of the Fighter AI's weapons back to its owner.
 * @param {import("@minecraft/server").Player} owner
 */
export function returnWeapons(owner) {
  const record = getRecord(owner.id, "fighter");
  if (!record?.weapons?.length) return;
  for (const id of record.weapons) giveItem(owner, new ItemStack(id, 1));
  record.weapons = [];
  saveRecord(owner.id, "fighter", record);
  const ai = record.id ? world.getEntity(record.id) : undefined;
  const brain = ai ? brains.get(ai.id) : undefined;
  if (ai && brain) equip(ai, brain, undefined);
}

/** @param {string} id */
export function itemName(id) {
  return id.replace("minecraft:", "").replace(/_/g, " ");
}

/** @param {string[] | undefined} weapons */
export function bestWeapon(weapons) {
  let best;
  for (const id of weapons ?? []) if (!best || WEAPONS[id] > WEAPONS[best]) best = id;
  return best;
}

// ================================================================ memory

// Remember who hits whom. Players who attack an owner or their AI become enemies (saved).
world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
  const attacker = damageSource.damagingEntity;
  if (!attacker || !attacker.isValid || !hurtEntity.isValid) return;

  let hits = recentHits.get(hurtEntity.id);
  if (!hits) recentHits.set(hurtEntity.id, (hits = new Map()));
  hits.set(attacker.id, Date.now());

  if (attacker.typeId !== "minecraft:player") return;
  let ownerId;
  if (hurtEntity.typeId === AI_ENTITY) ownerId = ownerInfo(hurtEntity)?.ownerId;
  else if (hurtEntity.typeId === "minecraft:player" && ownsAnyAi(hurtEntity.id)) ownerId = hurtEntity.id;
  if (!ownerId || ownerId === attacker.id) return;

  const memory = getMemory(ownerId);
  if (memory.allies[attacker.id]) return;
  const known = memory.enemies[attacker.id];
  memory.enemies[attacker.id] = {
    name: attacker.nameTag,
    times: (known?.times ?? 0) + 1,
    last: Date.now(),
  };
  saveMemory(ownerId, memory);
  if (!known) {
    const victim = hurtEntity.id === ownerId ? "you" : hurtEntity.nameTag;
    findPlayer(ownerId)?.sendMessage(`§cYour AI players will remember that ${attacker.nameTag} attacked ${victim}.`);
  }
});

// AIs never hurt their friends, and weapons add damage.
world.beforeEvents.entityHurt.subscribe((event) => {
  const attacker = event.damageSource.damagingEntity;
  if (!attacker || attacker.typeId !== AI_ENTITY) return;
  const brain = brains.get(attacker.id);
  if (brain?.slot !== undefined && event.hurtEntity.hasTag(`aip_a${brain.slot}`)) {
    event.cancel = true;
    return;
  }
  if (brain?.equipped && event.damageSource.cause === EntityDamageCause.entityAttack) {
    event.damage += Math.max(0, WEAPONS[brain.equipped] - 3);
  }
});

// A held weapon may drop when the AI dies. It keeps its weapons, so remove the copy.
world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    let brain, location, dimension;
    try {
      brain = brains.get(deadEntity.id);
      location = deadEntity.location;
      dimension = deadEntity.dimension;
    } catch {
      return;
    }
    const equipped = brain?.equipped;
    if (!equipped || !location || !dimension) return;
    system.run(() => {
      for (const item of dimension.getEntities({ location, maxDistance: 3, type: "minecraft:item" })) {
        if (item.getComponent("minecraft:item")?.itemStack.typeId === equipped) {
          item.remove();
          return;
        }
      }
    });
  },
  { entityTypes: [AI_ENTITY] }
);

// ================================================================ thinking

system.runInterval(() => {
  /** @type {import("@minecraft/server").Entity[]} */
  const ais = [];
  for (const dimensionId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    ais.push(...world.getDimension(dimensionId).getEntities({ type: AI_ENTITY }));
  }

  // Remove leftover AIs that were dismissed or replaced (one of each per player).
  const live = [];
  for (const ai of ais) {
    const info = ownerInfo(ai);
    const record = info ? getRecord(info.ownerId, info.role) : undefined;
    if (!info || !record || record.id !== ai.id) {
      ai.remove();
    } else {
      knownAis.set(ai.id, info);
      live.push({ ai, info, record });
    }
  }

  forgetUnloaded(new Set(live.map((l) => l.ai.id)));
  for (const { ai } of live) ensureBrain(ai);
  syncFriendTags(live);

  for (const { ai, info, record } of live) {
    const brain = brains.get(ai.id);
    if (!brain) continue;
    try {
      think(ai, info.ownerId, info.role, record, brain);
    } catch (error) {
      console.warn(`[AI Players] brain error for ${ai.nameTag}: ${error}`);
    }
  }
  cleanRecentHits();
}, THINK_TICKS);

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").RoleId} role
 * @param {import("./data.js").AiRecord} record
 * @param {Brain} brain
 */
function think(ai, ownerId, role, record, brain) {
  const owner = findPlayer(ownerId);
  const health = ai.getComponent("minecraft:health");
  if (!health) return;
  const hpRatio = health.currentValue / health.effectiveMax;
  const now = Date.now();

  // ---- Back off and heal when low on health.
  if (!brain.retreating && hpRatio < RETREAT_BELOW) {
    brain.retreating = true;
    ai.triggerEvent("aip:retreat");
    setHunt(brain, undefined);
    owner?.sendMessage(`§e${record.name} is badly hurt and backing off to heal.`);
  }
  if (brain.retreating) {
    const nearOwner = owner && owner.dimension.id === ai.dimension.id && distance(owner.location, ai.location) < 6;
    heal(health, nearOwner ? 2 : 1);
    if (health.currentValue / health.effectiveMax >= RECOVERED_AT) {
      brain.retreating = false;
      ai.triggerEvent("aip:recovered");
      owner?.sendMessage(`§a${record.name} has healed up and is back in action.`);
    }
    return;
  }
  // Slowly heal when nothing has hit it for a while.
  const lastHit = Math.max(0, ...(recentHits.get(ai.id)?.values() ?? []));
  if (now - lastHit > 10000 && system.currentTick % 80 < THINK_TICKS) heal(health, 1);

  if (role !== "fighter") return;

  // ---- Guarding: go back to the guard spot if it chased something too far.
  if (record.mode === "guard" && record.post && record.post.dim === ai.dimension.id) {
    if (distance(ai.location, record.post) > GUARD_LEASH) {
      ai.teleport({ x: record.post.x, y: record.post.y, z: record.post.z });
      setHunt(brain, undefined);
    }
  }

  pickUpWeapons(ai, ownerId, record);

  // ---- Pick the most dangerous enemy.
  const memory = getMemory(ownerId);
  const { best, currentScore } = chooseTarget(ai, ownerId, owner, record, memory, brain, now);
  if (!best) {
    setHunt(brain, undefined);
  } else if (best.id === brain.huntId) {
    brain.huntScore = best.score;
  } else if (currentScore === undefined || best.score > currentScore * 1.2 + 10) {
    // Switch only if the current target is gone or the new one is clearly more important
    // (stops it flip-flopping between two similar enemies).
    setHunt(brain, best.entity, best.score);
  }

  // ---- Switch to the best weapon (an axe against a player with a shield).
  const target = brain.huntId ? world.getEntity(brain.huntId) : undefined;
  equip(ai, brain, weaponFor(record.weapons, target));
}

/**
 * Scores every nearby entity and returns the most important one to attack.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("@minecraft/server").Player | undefined} owner
 * @param {import("./data.js").AiRecord} record
 * @param {import("./data.js").Memory} memory
 * @param {Brain} brain
 * @param {number} now
 */
function chooseTarget(ai, ownerId, owner, record, memory, brain, now) {
  const ownerHealth = owner?.getComponent("minecraft:health");
  const ownerLow = ownerHealth ? ownerHealth.currentValue / ownerHealth.effectiveMax < 0.5 : false;
  const hitOwner = recentHits.get(ownerId);
  const hitAi = recentHits.get(ai.id);
  const guarding = record.mode === "guard";
  const sameDimOwner = owner && owner.dimension.id === ai.dimension.id ? owner : undefined;

  const candidates = ai.dimension.getEntities({
    location: ai.location,
    maxDistance: SCAN_RADIUS,
    excludeGameModes: [GameMode.Creative, GameMode.Spectator],
  });

  /** @type {{ entity: import("@minecraft/server").Entity, id: string, score: number } | undefined} */
  let best;
  /** Score of the target it's already hunting, if that's still a valid target. */
  let currentScore;
  for (const e of candidates) {
    if (e.id === ai.id || e.id === ownerId || NOT_TARGETS.has(e.typeId)) continue;
    // A hunt tag left over from an AI that used this slot before.
    if (brain.slot !== undefined && e.id !== brain.huntId && e.hasTag(`aip_h${brain.slot}`)) {
      e.removeTag(`aip_h${brain.slot}`);
    }
    if (brain.slot !== undefined && e.hasTag(`aip_a${brain.slot}`)) continue; // a friend
    if (memory.allies[e.id]) continue;
    const eHealth = e.getComponent("minecraft:health");
    if (!eHealth || eHealth.currentValue <= 0) continue;

    const isPlayer = e.typeId === "minecraft:player";
    let score = 0;

    if (brain.commandId === e.id && now < brain.commandUntil) score = Math.max(score, 1000);
    // Protect a hurt owner first.
    if (recent(hitOwner, e.id, now)) score = Math.max(score, ownerLow ? 700 : 400);
    if (recent(hitAi, e.id, now)) score = Math.max(score, 250);
    // Whatever the owner just attacked.
    if (recent(recentHits.get(e.id), ownerId, now)) score = Math.max(score, 200);
    if (isPlayer && memory.enemies[e.id]) score = Math.max(score, 150);
    if (isPlayer && guarding && record.post && distance(e.location, record.post) <= SCAN_RADIUS) {
      score = Math.max(score, 160);
    }
    if (e.typeId === AI_ENTITY) {
      const theirOwner = ownerInfo(e)?.ownerId;
      if (theirOwner && memory.enemies[theirOwner]) score = Math.max(score, 120);
    }
    // Monsters near the owner (or near the guard spot).
    if (score === 0 && !LEAVE_ALONE.has(e.typeId) && e.matches({ families: ["monster"] })) {
      const anchor = guarding ? record.post : sameDimOwner?.location;
      if (!anchor || distance(e.location, anchor) <= 20) score = 30 + (DANGER[e.typeId] ?? 20);
    }
    if (score === 0) continue;

    // Danger from weapons, closeness, and finishing off weak enemies.
    if (isPlayer) {
      const held = e.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
      if (held && WEAPONS[held] !== undefined) score += 20;
    }
    score += (SCAN_RADIUS - distance(e.location, ai.location)) * 2;
    if (eHealth.currentValue / eHealth.effectiveMax < 0.3) score += 10;

    if (e.id === brain.huntId) currentScore = score;
    if (!best || score > best.score) best = { entity: e, id: e.id, score };
  }
  return { best, currentScore };
}

// ================================================================ weapons

/**
 * Best weapon for this target: an axe against a shield (axes knock shields out), otherwise the strongest.
 * @param {string[] | undefined} weapons
 * @param {import("@minecraft/server").Entity | undefined} target
 */
function weaponFor(weapons, target) {
  if (!weapons?.length) return undefined;
  if (target?.typeId === "minecraft:player") {
    const offhand = target.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
    if (offhand?.typeId === "minecraft:shield") {
      const axe = bestWeapon(weapons.filter((w) => w.endsWith("_axe")));
      if (axe) return axe;
    }
  }
  return bestWeapon(weapons);
}

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {string | undefined} weaponId
 */
function equip(ai, brain, weaponId) {
  if (brain.equipped === weaponId) return;
  try {
    ai.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${weaponId ?? "air"}`);
    brain.equipped = weaponId;
  } catch (error) {
    console.warn(`[AI Players] couldn't equip ${weaponId}: ${error}`);
    brain.equipped = weaponId; // don't retry every tick
  }
}

/**
 * Fighter AIs pick up weapons lying right next to them.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 */
function pickUpWeapons(ai, ownerId, record) {
  const weapons = record.weapons ?? [];
  if (weapons.length >= MAX_WEAPONS) return;
  for (const item of ai.dimension.getEntities({ location: ai.location, maxDistance: 2.5, type: "minecraft:item" })) {
    const stack = item.getComponent("minecraft:item")?.itemStack;
    if (!stack || WEAPONS[stack.typeId] === undefined || stack.amount !== 1) continue;
    item.remove();
    weapons.push(stack.typeId);
    record.weapons = weapons;
    saveRecord(ownerId, "fighter", record);
    findPlayer(ownerId)?.sendMessage(`§a${record.name} picked up a ${itemName(stack.typeId)}.`);
    return; // one per think
  }
}

// ================================================================ slots and tags

/** @param {import("@minecraft/server").Entity} ai */
function ensureBrain(ai) {
  if (brains.has(ai.id)) return;
  // A fresh brain: start calm (in case it was retreating when the world was saved).
  ai.triggerEvent("aip:recovered");

  // Keep the slot it had before if that slot is free, otherwise take a free one.
  const saved = ai.getTags().find((t) => /^aip_s\d+$/.test(t));
  let slot = saved ? Number(saved.slice(5)) : undefined;
  if (slot === undefined || slot >= SLOTS || slotUsers[slot]) slot = slotUsers.findIndex((u) => u === undefined);
  if (slot === -1) slot = undefined; // all slots busy: it still fights back, just less cleverly
  for (const tag of ai.getTags()) if (/^aip_s\d+$/.test(tag)) ai.removeTag(tag);
  if (slot !== undefined) {
    ai.addTag(`aip_s${slot}`);
    slotUsers[slot] = ai.id;
  }
  brains.set(ai.id, {
    slot,
    huntId: undefined,
    huntScore: 0,
    retreating: false,
    equipped: "unknown", // forces the first equip
    commandId: undefined,
    commandUntil: 0,
  });
}

/** @param {Set<string>} liveIds */
function forgetUnloaded(liveIds) {
  for (const [id, brain] of brains) {
    if (liveIds.has(id)) continue;
    setHunt(brain, undefined);
    if (brain.slot !== undefined) slotUsers[brain.slot] = undefined;
    brains.delete(id);
  }
}

/**
 * Points an AI at a new target (or none) by moving its hunt tag.
 * @param {Brain} brain
 * @param {import("@minecraft/server").Entity | undefined} target
 * @param {number} [score]
 */
function setHunt(brain, target, score = 0) {
  if (brain.slot === undefined) return;
  const tag = `aip_h${brain.slot}`;
  if (brain.huntId && brain.huntId !== target?.id) {
    const old = world.getEntity(brain.huntId);
    if (old?.isValid) old.removeTag(tag);
  }
  brain.huntId = target?.id;
  brain.huntScore = score;
  if (target?.isValid && !target.hasTag(tag)) target.addTag(tag);
}

/**
 * Puts aip_a<slot> on everyone each AI must never attack: its owner, the owner's allies,
 * and the AIs of the owner and allies. Removes it from everyone else.
 * @param {{ ai: import("@minecraft/server").Entity, info: { ownerId: string } }[]} live
 */
function syncFriendTags(live) {
  /** @type {Map<string, Set<number>>} entity id -> slots that must treat it as a friend */
  const wanted = new Map();
  const add = (/** @type {string} */ id, /** @type {number} */ slot) => {
    let set = wanted.get(id);
    if (!set) wanted.set(id, (set = new Set()));
    set.add(slot);
  };

  for (const { ai, info } of live) {
    const slot = brains.get(ai.id)?.slot;
    if (slot === undefined) continue;
    const friends = new Set([info.ownerId, ...Object.keys(getMemory(info.ownerId).allies)]);
    for (const id of friends) add(id, slot);
    for (const other of live) {
      if (other.ai.id !== ai.id && friends.has(other.info.ownerId)) add(other.ai.id, slot);
    }
  }

  const everyone = [...world.getPlayers(), ...live.map((l) => l.ai)];
  for (const e of everyone) {
    const want = wanted.get(e.id) ?? new Set();
    for (const tag of e.getTags()) {
      if (!/^aip_a\d+$/.test(tag)) continue;
      if (!want.has(Number(tag.slice(5)))) e.removeTag(tag);
    }
    for (const slot of want) if (!e.hasTag(`aip_a${slot}`)) e.addTag(`aip_a${slot}`);
    // Clear hunt tags left over from a previous session.
    for (const tag of e.getTags()) {
      if (!/^aip_h\d+$/.test(tag)) continue;
      const slot = Number(tag.slice(5));
      const user = slotUsers[slot];
      if (!user || brains.get(user)?.huntId !== e.id) e.removeTag(tag);
    }
  }
}

// ================================================================ small helpers

/**
 * @param {import("@minecraft/server").EntityHealthComponent} health
 * @param {number} amount
 */
function heal(health, amount) {
  if (health.currentValue < health.effectiveMax) {
    health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + amount));
  }
}

/** @param {Map<string, number> | undefined} hits @param {string} id @param {number} now */
function recent(hits, id, now) {
  const time = hits?.get(id);
  return time !== undefined && now - time < RECENT_MS;
}

function cleanRecentHits() {
  const cutoff = Date.now() - 30000;
  for (const [victim, hits] of recentHits) {
    for (const [attacker, time] of hits) if (time < cutoff) hits.delete(attacker);
    if (hits.size === 0) recentHits.delete(victim);
  }
}

/** @param {import("@minecraft/server").Vector3} a @param {import("@minecraft/server").Vector3} b */
function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

