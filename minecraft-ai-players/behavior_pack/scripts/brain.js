// The AI players' brain: picks targets, protects the owner, backs off to heal,
// uses its tool slots in order, wears armor, blocks with a shield, eats its chicken,
// stays away from lava, gathers (Resource AI) and remembers enemies and allies (even after dying).
//
// The Script API can't set a mob's target directly, so the brain "points" each AI at its
// target with tags (see tools/make_entity_targets.py):
//   aip_s<k>  on the AI using brain slot k
//   aip_h<k>  on the entity that AI should hunt
//   aip_a<k>  on every entity that AI must never attack
import { world, system, GameMode, EntityDamageCause, EquipmentSlot } from "@minecraft/server";
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
} from "./data.js";
import {
  ALLOWED_TOOLS,
  TOOL_DAMAGE,
  ARROW_ITEM,
  isRanged,
  inventoryOf,
  wearTool,
  addTool,
  addArrows,
  totalArrows,
  useArrow,
  toolFromStack,
  itemName,
  ARMOR_SLOTS,
  ARMOR_COMMAND_SLOT,
  ARMOR_NAMES,
  wearItem,
  addBlocks,
  isPlaceableBlock,
  FOOD_HEALS,
} from "./inventory.js";
import { createGatherState, avoidLava, gather, setGatherBehavior } from "./gather.js";

const SLOTS = 16; // must match tools/make_entity_targets.py
const THINK_TICKS = 10; // the brain thinks twice a second
const SCAN_RADIUS = 16;
const RECENT_MS = 8000; // how long a hit counts as "just now"
const RETREAT_BELOW = 0.3; // back off under 30% health...
const RECOVERED_AT = 0.7; // ...until back to 70%
const GUARD_LEASH = 14;
const COMMAND_MS = 30000;
const RANGED_FROM = 6; // use a bow/crossbow when the target is further than this
const EAT_EVERY_MS = 2500; // how often it can eat a cooked chicken
const SHIELD_COOLDOWN_MS = 1000; // time between shield blocks
const AXE_DISABLES_SHIELD_MS = 5000; // an axe hit knocks its shield down for this long
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
 * @property {string | undefined} equipped  Item id in its hand.
 * @property {number} activeSlot  Tool slot in use (0-2), or -1 for fists.
 * @property {"melee" | "ranged"} style
 * @property {Record<string, string | undefined>} gear  Armor/shield it's wearing (command slot -> item id).
 * @property {boolean} hasShield
 * @property {number} shieldReadyAt
 * @property {number} eatReadyAt
 * @property {import("./gather.js").GatherState} gather
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
 * Call after changing an AI's slots so it picks up the change right away.
 * @param {string | undefined} aiId
 */
export function toolsChanged(aiId) {
  const brain = aiId ? brains.get(aiId) : undefined;
  if (!brain) return;
  brain.equipped = "unknown";
  brain.gear = {};
  brain.gather.pausedUntil = 0; // e.g. new blocks or a pickaxe: try gathering again now
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

// An AI with a shield blocks hits and arrows coming from in front of it (not every hit: it needs
// a moment between blocks, and an axe knocks the shield down for a few seconds).
world.beforeEvents.entityHurt.subscribe((event) => {
  const ai = event.hurtEntity;
  if (ai.typeId !== AI_ENTITY) return;
  const brain = brains.get(ai.id);
  const attacker = event.damageSource.damagingEntity;
  const cause = event.damageSource.cause;
  if (!brain?.hasShield || !attacker || Date.now() < brain.shieldReadyAt) return;
  if (attacker.id === ai.getDynamicProperty("aip:owner")) return; // the owner tapping it to open its menu
  if (cause !== EntityDamageCause.entityAttack && cause !== EntityDamageCause.projectile) return;
  const view = ai.getViewDirection();
  const to = { x: attacker.location.x - ai.location.x, z: attacker.location.z - ai.location.z };
  const len = Math.hypot(to.x, to.z) || 1;
  if ((view.x * to.x + view.z * to.z) / len < 0.3) return; // from the side or behind
  event.cancel = true;
  const held = attacker.typeId === "minecraft:player"
    ? attacker.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId
    : undefined;
  const axe = cause === EntityDamageCause.entityAttack && !!held?.endsWith("_axe");
  brain.shieldReadyAt = Date.now() + (axe ? AXE_DISABLES_SHIELD_MS : SHIELD_COOLDOWN_MS);
  const damage = event.damage;
  system.run(() => shieldBlocked(ai, brain, damage, axe));
});

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {number} damage
 * @param {boolean} byAxe
 */
function shieldBlocked(ai, brain, damage, byAxe) {
  if (!ai.isValid) return;
  ai.dimension.playSound(byAxe ? "random.break" : "item.shield.block", ai.location);
  const info = ownerInfo(ai);
  const record = info ? getRecord(info.ownerId, info.role) : undefined;
  const shield = record ? inventoryOf(record).shield : undefined;
  if (!info || !record || !shield) return;
  if (wearItem(shield, Math.max(1, Math.floor(damage))) === "broke") {
    inventoryOf(record).shield = null;
    brain.gear = {};
    findPlayer(info.ownerId)?.sendMessage(`§c${record.name}'s shield broke!`);
  }
  saveRecord(info.ownerId, info.role, record);
  if (byAxe) findPlayer(info.ownerId)?.sendMessage(`§e${record.name}'s shield was knocked down by an axe!`);
}

// Armor wears down when the AI gets hurt, like a player's.
world.afterEvents.entityHurt.subscribe(({ hurtEntity, damage, damageSource }) => {
  if (hurtEntity.typeId !== AI_ENTITY || !hurtEntity.isValid) return;
  const wearing = [
    EntityDamageCause.entityAttack,
    EntityDamageCause.projectile,
    EntityDamageCause.entityExplosion,
    EntityDamageCause.blockExplosion,
  ];
  if (!wearing.includes(damageSource.cause)) return;
  const info = ownerInfo(hurtEntity);
  const record = info ? getRecord(info.ownerId, info.role) : undefined;
  if (!info || !record) return;
  const armor = inventoryOf(record).armor;
  const amount = Math.max(1, Math.floor(damage / 4));
  let changed = false;
  for (const slot of ARMOR_SLOTS) {
    const piece = armor[slot];
    if (!piece) continue;
    changed = true;
    if (wearItem(piece, amount) === "broke") {
      armor[slot] = null;
      hurtEntity.dimension.playSound("random.break", hurtEntity.location);
      findPlayer(info.ownerId)?.sendMessage(`§c${record.name}'s ${ARMOR_NAMES[slot].toLowerCase()} broke!`);
      const brain = brains.get(hurtEntity.id);
      if (brain) brain.gear = {};
    }
  }
  if (changed) saveRecord(info.ownerId, info.role, record);
});

// AIs never hurt their friends, and melee tools add damage.
world.beforeEvents.entityHurt.subscribe((event) => {
  const attacker = event.damageSource.damagingEntity;
  if (!attacker || attacker.typeId !== AI_ENTITY) return;
  const brain = brains.get(attacker.id);
  if (brain?.slot !== undefined && event.hurtEntity.hasTag(`aip_a${brain.slot}`)) {
    event.cancel = true;
    return;
  }
  if (brain?.equipped && event.damageSource.cause === EntityDamageCause.entityAttack) {
    event.damage += Math.max(0, (TOOL_DAMAGE[brain.equipped] ?? 0) - 3);
  }
});

// Melee hits wear down the tool in use. When it breaks, the AI moves on to the next slot.
world.afterEvents.entityHurt.subscribe(({ damageSource }) => {
  const ai = damageSource.damagingEntity;
  if (!ai || ai.typeId !== AI_ENTITY || damageSource.cause !== EntityDamageCause.entityAttack) return;
  const brain = brains.get(ai.id);
  if (!brain || brain.activeSlot < 0 || brain.style !== "melee") return;
  useTool(ai, brain);
});

// Each arrow the AI shoots uses one arrow from its slots and wears the bow.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (entity.typeId !== "minecraft:arrow") return;
  system.run(() => {
    if (!entity.isValid) return;
    const shooter = entity.getComponent("minecraft:projectile")?.owner;
    if (!shooter || shooter.typeId !== AI_ENTITY) return;
    const brain = brains.get(shooter.id);
    const info = ownerInfo(shooter);
    const record = info ? getRecord(info.ownerId, info.role) : undefined;
    if (!brain || !info || !record) return;
    useArrow(record);
    saveRecord(info.ownerId, info.role, record);
    if (brain.activeSlot >= 0) useTool(shooter, brain);
  });
});

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 */
function useTool(ai, brain) {
  const info = ownerInfo(ai);
  const record = info ? getRecord(info.ownerId, info.role) : undefined;
  if (!info || !record) return;
  const slot = brain.activeSlot;
  const toolId = inventoryOf(record).tools[slot]?.id;
  const result = wearTool(record, slot);
  if (result === "none") return;
  saveRecord(info.ownerId, info.role, record);
  if (result === "broke" && toolId) {
    ai.dimension.playSound("random.break", ai.location);
    const next = inventoryOf(record).tools.findIndex((t, i) => t && i > slot);
    findPlayer(info.ownerId)?.sendMessage(
      `§c${record.name}'s ${itemName(toolId)} broke!§r ` + (next >= 0 ? `Switching to slot ${next + 1}.` : "No tools left.")
    );
    brain.equipped = "unknown";
  }
}

// Its tool, armor and shield may drop when the AI dies. It keeps them, so remove the copies.
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
    if (!brain || !location || !dimension) return;
    const worn = [brain.equipped, ...Object.values(brain.gear)].filter((id) => id && id !== "unknown" && id !== "air");
    if (worn.length === 0) return;
    system.run(() => {
      const items = dimension.getEntities({ location, maxDistance: 3, type: "minecraft:item" });
      for (const id of worn) {
        const copy = items.find((item) => item.isValid && item.getComponent("minecraft:item")?.itemStack.typeId === id);
        copy?.remove();
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

  // ---- Lava: cover it with blocks or back away (both AIs).
  const lavaClose = avoidLava(ai, ownerId, role, record, brain.gather);

  // ---- Wear armor and a shield.
  wearGear(ai, brain, record);

  // ---- Eat one of its own cooked chicken when hurt (they refill over time).
  const inv = inventoryOf(record);
  if (inv.food > 0 && health.currentValue <= health.effectiveMax - FOOD_HEALS && now >= brain.eatReadyAt) {
    inv.food -= 1;
    saveRecord(ownerId, role, record);
    heal(health, FOOD_HEALS);
    ai.dimension.playSound("random.eat", ai.location);
    brain.eatReadyAt = now + EAT_EVERY_MS;
  }

  // ---- Back off and heal when low on health.
  if (!brain.retreating && hpRatio < RETREAT_BELOW) {
    brain.retreating = true;
    ai.triggerEvent("aip:retreat");
    setHunt(brain, undefined);
    owner?.sendMessage(`§e${record.name} is badly hurt and backing off to heal.`);
  }
  if (brain.retreating) {
    heal(health, 0.5); // resting: 1 health a second, plus any chicken it eats
    if (role === "resource") setGatherBehavior(ai, brain.gather, record.focus, false);
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

  pickUpItems(ai, ownerId, role, record);
  if (role !== "fighter") {
    // ---- Gather, unless it was just attacked or there's lava close by.
    const safe = !lavaClose && now - lastHit > RECENT_MS;
    setGatherBehavior(ai, brain.gather, record.focus, safe);
    const slot = safe ? gather(ai, ownerId, record, brain.gather) : undefined;
    equip(ai, brain, record, slot ?? firstTool(record, false));
    return;
  }

  // ---- Guarding: go back to the guard spot if it chased something too far.
  if (record.mode === "guard" && record.post && record.post.dim === ai.dimension.id) {
    if (distance(ai.location, record.post) > GUARD_LEASH) {
      ai.teleport({ x: record.post.x, y: record.post.y, z: record.post.z });
      setHunt(brain, undefined);
    }
  }

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

  // ---- Pick the tool for this target (slot order, with a few smart switches).
  const target = brain.huntId ? world.getEntity(brain.huntId) : undefined;
  equip(ai, brain, record, chooseSlot(record, target, target ? distance(target.location, ai.location) : 0));
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
      if (held && ALLOWED_TOOLS.fighter.has(held)) score += 20;
    }
    score += (SCAN_RADIUS - distance(e.location, ai.location)) * 2;
    if (eHealth.currentValue / eHealth.effectiveMax < 0.3) score += 10;

    if (e.id === brain.huntId) currentScore = score;
    if (!best || score > best.score) best = { entity: e, id: e.id, score };
  }
  return { best, currentScore };
}

// ================================================================ tools

/**
 * First usable tool slot (1, then 2, then 3). A bow or crossbow only counts if it has arrows.
 * @param {import("./data.js").AiRecord} record
 * @param {boolean} meleeOnly
 */
function firstTool(record, meleeOnly) {
  const tools = inventoryOf(record).tools;
  const arrows = totalArrows(record) > 0;
  return tools.findIndex((t) => t && (!isRanged(t.id) || (arrows && !meleeOnly)));
}

/**
 * Which slot to use against this target. Normally the first usable slot, but:
 * a bow/crossbow when the target is far away, an axe against a shield, and a melee tool up close.
 * @param {import("./data.js").AiRecord} record
 * @param {import("@minecraft/server").Entity | undefined} target
 * @param {number} dist
 */
function chooseSlot(record, target, dist) {
  const tools = inventoryOf(record).tools;
  const arrows = totalArrows(record) > 0;
  const usable = [0, 1, 2].filter((i) => tools[i] && (!isRanged(tools[i]?.id) || arrows));
  if (usable.length === 0) return -1;
  if (target) {
    if (dist > RANGED_FROM) {
      const ranged = usable.find((i) => isRanged(tools[i]?.id));
      if (ranged !== undefined) return ranged;
    }
    if (target.typeId === "minecraft:player") {
      const offhand = target.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
      const axe = usable.find((i) => tools[i]?.id.endsWith("_axe"));
      if (offhand?.typeId === "minecraft:shield" && axe !== undefined) return axe;
    }
    if (dist <= RANGED_FROM) {
      const melee = usable.find((i) => !isRanged(tools[i]?.id));
      if (melee !== undefined) return melee;
    }
  }
  return usable[0];
}

/**
 * Holds the tool from a slot (or nothing) and switches between melee and ranged fighting.
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {import("./data.js").AiRecord} record
 * @param {number} slot
 */
function equip(ai, brain, record, slot) {
  const toolId = slot >= 0 ? inventoryOf(record).tools[slot]?.id : undefined;
  brain.activeSlot = toolId ? slot : -1;
  const style = isRanged(toolId) ? "ranged" : "melee";
  if (style !== brain.style) {
    ai.triggerEvent(style === "ranged" ? "aip:use_ranged" : "aip:use_melee");
    brain.style = style;
  }
  if (brain.equipped === toolId) return;
  try {
    ai.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${toolId ?? "air"}`);
  } catch (error) {
    console.warn(`[AI Players] couldn't equip ${toolId}: ${error}`);
  }
  brain.equipped = toolId; // don't retry every tick if it failed
}

/**
 * Puts on the armor and shield from its slots (only when something changed).
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {import("./data.js").AiRecord} record
 */
function wearGear(ai, brain, record) {
  const inv = inventoryOf(record);
  /** @type {Record<string, string>} */
  const wanted = { "slot.weapon.offhand": inv.shield?.id ?? "air" };
  for (const slot of ARMOR_SLOTS) wanted[ARMOR_COMMAND_SLOT[slot]] = inv.armor[slot]?.id ?? "air";
  brain.hasShield = !!inv.shield;
  for (const [commandSlot, id] of Object.entries(wanted)) {
    if (brain.gear[commandSlot] === id) continue;
    try {
      ai.runCommand(`replaceitem entity @s ${commandSlot} 0 ${id}`);
    } catch (error) {
      console.warn(`[AI Players] couldn't put ${id} in ${commandSlot}: ${error}`);
    }
    brain.gear[commandSlot] = id;
  }
}

/**
 * Picks up allowed tools (into the first empty slot), building blocks (never sand, gravel or other
 * falling blocks) and, for Fighters, arrows lying next to it.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").RoleId} role
 * @param {import("./data.js").AiRecord} record
 */
function pickUpItems(ai, ownerId, role, record) {
  for (const item of ai.dimension.getEntities({ location: ai.location, maxDistance: 2.5, type: "minecraft:item" })) {
    const stack = item.getComponent("minecraft:item")?.itemStack;
    if (!stack) continue;
    let message;
    if (ALLOWED_TOOLS[role].has(stack.typeId) && stack.amount === 1) {
      const slot = addTool(record, toolFromStack(stack));
      if (slot === -1) continue;
      item.remove();
      message = `picked up a ${itemName(stack.typeId)} (slot ${slot + 1})`;
    } else if (isPlaceableBlock(stack.typeId)) {
      const added = addBlocks(record, stack.typeId, stack.amount);
      if (added === 0) continue;
      const location = item.location;
      item.remove();
      if (added < stack.amount) {
        stack.amount -= added;
        ai.dimension.spawnItem(stack, location);
      }
      message = `picked up ${added} ${itemName(stack.typeId)}`;
    } else if (role === "fighter" && stack.typeId === ARROW_ITEM) {
      const added = addArrows(record, stack.amount);
      if (added === 0) continue;
      const location = item.location;
      item.remove();
      if (added < stack.amount) {
        stack.amount -= added;
        ai.dimension.spawnItem(stack, location);
      }
      message = `picked up ${added} arrows`;
    } else {
      continue;
    }
    saveRecord(ownerId, role, record);
    toolsChanged(ai.id);
    findPlayer(ownerId)?.sendMessage(`§a${record.name} ${message}.`);
    return; // one per think
  }
}

// ================================================================ slots and tags

/** @param {import("@minecraft/server").Entity} ai */
function ensureBrain(ai) {
  if (brains.has(ai.id)) return;
  // A fresh brain: start calm (in case it was retreating when the world was saved), with melee on.
  ai.triggerEvent("aip:recovered");
  ai.triggerEvent("aip:use_melee");

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
    activeSlot: -1,
    style: /** @type {"melee" | "ranged"} */ ("melee"),
    gear: {},
    hasShield: false,
    shieldReadyAt: 0,
    eatReadyAt: 0,
    gather: createGatherState(),
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

