// The AI players' brain: picks targets, protects the owner, backs off to heal,
// uses its tool slots in order, wears armor, blocks with a shield, eats its chicken,
// stays away from lava, gathers and lights caves (Resource AI), loots tombstones (Fighter)
// and remembers enemies and allies (even after dying).
//
// The Script API can't set a mob's target directly, so the brain "points" each AI at its
// target with tags (see tools/make_entity_targets.py):
//   aip_s<k>  on the AI using brain slot k
//   aip_h<k>  on the entity that AI should hunt
//   aip_a<k>  on every entity that AI must never attack
import { world, system, GameMode, EntityDamageCause, EquipmentSlot, BlockVolume } from "@minecraft/server";
import {
  AI_ENTITY,
  getAi,
  saveRecord,
  getMemory,
  saveMemory,
  ownsAnyAi,
  findPlayer,
  ownerInfo,
  knownAis,
  lavaProof,
  resourcePerks,
  fighterPerks,
  canGather,
} from "./data.js";
import {
  ALLOWED_TOOLS,
  toolsFor,
  TOOL_DAMAGE,
  ARROW_ITEM,
  isRanged,
  inventoryOf,
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
  isValuable,
  addValuables,
  slotItem,
  wearSlot,
  SWORD_SLOT,
  useTorch,
  TORCH_ITEM,
} from "./inventory.js";
import { handleTombs, createLootState } from "./tombs.js";
import { stripMine, createStripState } from "./stripmine.js";
import { bridgeTowards } from "./movement.js";
import { createGatherState, avoidLava, gather, setGatherBehavior, isBusy } from "./gather.js";
import { FARM_FOCUS, buildFarm, checkCollected, farmBuilding } from "./farm.js";
import { keepLoaded } from "./scout.js";
import { moveFactor, damageBonus, levelOf } from "./levels.js";

const SLOTS = 16; // must match tools/make_entity_targets.py
const THINK_TICKS = 10; // the brain thinks twice a second
const SCAN_RADIUS = 16;
const RECENT_MS = 8000; // how long a hit counts as "just now"
const RETREAT_BELOW = 0.3; // back off under 30% health...
const RECOVERED_AT = 0.7; // ...until back to 70%
const GUARD_LEASH = 14;
const COMMAND_MS = 30000;
const BOW_RANGE = 25; // "Bow Only": shoots from up to this far
const OPENING_RANGE = 20; // "Bow and Sword": one arrow from about this far, then the sword
const SHOT_EVERY_MS = 1300;
const ARROW_SPEED = 3; // blocks per tick (a fully drawn bow)
const ARROW_GRAVITY = 0.05; // blocks per tick per tick

// Upgraded Fighter: a "sequence" against an enemy player starts when that player is within 30 blocks
// and ends when they leave the 30 blocks. Each sequence gets ONE of each: the sprint (until its first
// hit), the 7-block knockback (on that first hit), and the 10-block power jump.
const SEQUENCE_RADIUS = 30;
const SPRINT_MOVEMENT = 0.45; // normal is 0.3: 1.5x faster
const POWER_JUMP_UP = 1.3; // upward push for about a 10-block jump
const NO_FALL_MS = 5000; // no fall damage for this long after a power jump
const KNOCKBACK_FORCE = 2.6; // about 7 blocks
const VOLLEY_ARROWS = 2; // upgraded "Bow and Sword": 2 opening arrows...
const VOLLEY_SPEED = 3; // ...at 3 times the speed
const NORMAL_ARROW_DAMAGE = 9; // faster arrows don't hit harder than a normal full-power arrow
const EAT_EVERY_MS = 2500; // how often it can eat a cooked chicken
const SHIELD_COOLDOWN_MS = 1000; // time between shield blocks
const AXE_DISABLES_SHIELD_MS = 5000; // an axe hit knocks its shield down for this long
const TORCH_EVERY_MS = 3000;
const TORCH_SPACING = 9; // underground with no torch within this many blocks: place one (about every 10 blocks)
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
const NOT_TARGETS = new Set(["minecraft:item", "minecraft:xp_orb", "minecraft:armor_stand", "aip:ai_capsule", "aip:computer_chest"]);

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
 * @property {import("./data.js").RoleId} role
 * @property {import("./tombs.js").LootState} loot
 * @property {boolean} fleeing  Resource AI running from a player it can't shoot at.
 * @property {number} torchReadyAt
 * @property {number} shots  Arrows fired at the current target.
 * @property {boolean} openingDone  "Bow and Sword": the opening arrow of this fight was fired.
 * @property {number} lastFightAt  Last time it had a target (a new fight starts after a pause).
 * @property {number} nextShotAt
 * @property {boolean} wantRanged  Keep its distance (Bow Only) instead of charging in.
 * @property {boolean} upgraded  Fighter's final (netherite) upgrade: the 30-block sequence and volley.
 * @property {boolean} lavaProof  Lava and fire can't hurt it.
 * @property {boolean} resourcePerks  Resource AI upgrade perks: strip mining, no fall damage.
 * @property {number} level  The level its walking speed was last set for (-1: set it again).
 * @property {number} damageBonus  Extra damage from its level.
 * @property {string | undefined} modeEvent  Resource AI: follow/wander/stay event applied.
 * @property {import("./stripmine.js").StripState} strip
 * @property {Map<string, { hit: boolean, jumped: boolean }>} sequences  Upgraded Fighter: enemy players within 30 blocks.
 * @property {boolean} sprinting
 * @property {number} noFallUntil
 * @property {number} warnedAt  Last "Archer needs a bow and arrows" message.
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

// Mobs can't hurt AI players (hits, arrows), and no explosion can (creepers, ghast fireballs, TNT).
// Upgraded AIs also take no fire, lava or fall damage.
const EXPLOSIONS = [EntityDamageCause.entityExplosion, EntityDamageCause.blockExplosion];
const UPGRADED_IMMUNE = [
  EntityDamageCause.lava,
  EntityDamageCause.fire,
  EntityDamageCause.fireTick,
  EntityDamageCause.magma,
];
world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.hurtEntity.typeId !== AI_ENTITY) return;
  const attacker = event.damageSource.damagingEntity;
  const cause = event.damageSource.cause;
  if (attacker && attacker.typeId !== "minecraft:player" && attacker.typeId !== AI_ENTITY) event.cancel = true;
  if (EXPLOSIONS.includes(cause)) event.cancel = true;
  const brain = brains.get(event.hurtEntity.id);
  if (brain?.lavaProof && UPGRADED_IMMUNE.includes(cause)) event.cancel = true;
  // No fall damage: upgraded Resource AI (and the Fighter it becomes) always, any Fighter for 5 seconds after a power jump.
  if (cause === EntityDamageCause.fall && brain && (brain.resourcePerks || Date.now() < brain.noFallUntil)) {
    event.cancel = true;
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
  const record = info ? getAi(info.key) : undefined;
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
  const record = info ? getAi(info.key) : undefined;
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

// AIs never hurt their friends, the Resource AI never fights, and melee tools add damage.
world.beforeEvents.entityHurt.subscribe((event) => {
  const attacker = event.damageSource.damagingEntity;
  if (!attacker || attacker.typeId !== AI_ENTITY) return;
  const brain = brains.get(attacker.id);
  // The Resource AI never fights: it can't hurt mobs or players.
  if (brain?.role === "resource") {
    event.cancel = true;
    return;
  }
  if (brain?.slot !== undefined && event.hurtEntity.hasTag(`aip_a${brain.slot}`)) {
    event.cancel = true;
    return;
  }
  if (event.damageSource.damagingProjectile?.getDynamicProperty("aip:fast")) {
    event.damage = Math.min(event.damage, NORMAL_ARROW_DAMAGE);
  }
  if (brain?.equipped && event.damageSource.cause === EntityDamageCause.entityAttack) {
    event.damage += Math.max(0, (TOOL_DAMAGE[brain.equipped] ?? 0) - 3);
  }
  // Stronger with levels: +1 damage every 10 levels.
  if (brain && event.damageSource.cause === EntityDamageCause.entityAttack) event.damage += brain.damageBonus;
});

// Upgraded Fighter: its first hit on an enemy player in a sequence knocks them back about 7 blocks.
world.afterEvents.entityHurt.subscribe(({ hurtEntity, damageSource }) => {
  const ai = damageSource.damagingEntity;
  if (!ai || ai.typeId !== AI_ENTITY || hurtEntity.typeId !== "minecraft:player") return;
  if (damageSource.cause !== EntityDamageCause.entityAttack || !hurtEntity.isValid) return;
  const brain = brains.get(ai.id);
  if (!brain?.upgraded || brain.role !== "fighter") return;
  if (distance(ai.location, hurtEntity.location) > SEQUENCE_RADIUS) return;
  let seq = brain.sequences.get(hurtEntity.id);
  if (!seq) brain.sequences.set(hurtEntity.id, (seq = { hit: false, jumped: false }));
  if (seq.hit) return;
  seq.hit = true;
  const dx = hurtEntity.location.x - ai.location.x;
  const dz = hurtEntity.location.z - ai.location.z;
  const len = Math.hypot(dx, dz) || 1;
  /** @type {import("@minecraft/server").Player} */ (hurtEntity).applyKnockback(
    { x: (dx / len) * KNOCKBACK_FORCE, z: (dz / len) * KNOCKBACK_FORCE },
    0.5
  );
  stopSprint(ai, brain);
});

// Melee hits wear down the tool in use. When it breaks, the AI moves on to the next slot.
world.afterEvents.entityHurt.subscribe(({ damageSource }) => {
  const ai = damageSource.damagingEntity;
  if (!ai || ai.typeId !== AI_ENTITY || damageSource.cause !== EntityDamageCause.entityAttack) return;
  const brain = brains.get(ai.id);
  if (!brain || brain.activeSlot < 0 || brain.style !== "melee") return;
  useTool(ai, brain);
});

// The AI's ranged behavior only keeps it at bow distance: the plain arrows it shoots are removed,
// and the script fires aimed arrows instead (see fireArrow).
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (entity.typeId !== "minecraft:arrow") return;
  if (entity.getDynamicProperty("aip:aimed")) return;
  const shooter = entity.getComponent("minecraft:projectile")?.owner;
  if (shooter?.typeId === AI_ENTITY) entity.remove();
});

/**
 * Shoots an arrow that leads the target: it aims where the target will be when the arrow gets
 * there (using the target's speed and the distance), and a bit higher to make up for gravity.
 * Uses one arrow and wears the bow.
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {import("@minecraft/server").Entity} target
 * @param {number} [speedTimes]  3 for the upgraded Fighter's opening volley
 */
function fireArrow(ai, brain, target, speedTimes = 1) {
  const info = ownerInfo(ai);
  const record = info ? getAi(info.key) : undefined;
  if (!info || !record || !useArrow(record)) return false;

  const speed = ARROW_SPEED * speedTimes;
  const from = ai.getHeadLocation();
  const v = target.getVelocity();
  const aim = { x: target.location.x, y: target.location.y + 1, z: target.location.z };
  let t = distance(from, aim) / speed;
  let at = aim;
  for (let i = 0; i < 3; i++) {
    at = { x: aim.x + v.x * t, y: aim.y + Math.max(0, v.y) * t, z: aim.z + v.z * t };
    t = distance(from, at) / speed;
  }
  at = { ...at, y: at.y + 0.5 * ARROW_GRAVITY * t * t * 1.1 };
  const d = distance(from, at) || 1;
  const dir = { x: (at.x - from.x) / d, y: (at.y - from.y) / d, z: (at.z - from.z) / d };

  const arrow = ai.dimension.spawnEntity("minecraft:arrow", { x: from.x + dir.x * 0.8, y: from.y + dir.y * 0.8, z: from.z + dir.z * 0.8 });
  arrow.setDynamicProperty("aip:aimed", true);
  if (speedTimes > 1) arrow.setDynamicProperty("aip:fast", true);
  const projectile = arrow.getComponent("minecraft:projectile");
  if (projectile) {
    projectile.owner = ai;
    projectile.shoot({ x: dir.x * speed, y: dir.y * speed, z: dir.z * speed });
  }
  ai.dimension.playSound("random.bow", ai.location);
  saveRecord(info.ownerId, info.role, record);
  brain.shots += 1;
  if (brain.activeSlot >= 0) useTool(ai, brain);
  return true;
}

/**
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 */
function useTool(ai, brain) {
  const info = ownerInfo(ai);
  const record = info ? getAi(info.key) : undefined;
  if (!info || !record) return;
  const slot = brain.activeSlot;
  const toolId = slotItem(record, slot)?.id;
  const result = wearSlot(record, slot);
  if (result === "none") return;
  saveRecord(info.ownerId, info.role, record);
  if (result === "broke" && toolId) {
    ai.dimension.playSound("random.break", ai.location);
    const next = slot < SWORD_SLOT ? inventoryOf(record).tools.findIndex((t, i) => t && i > slot) : -1;
    findPlayer(info.ownerId)?.sendMessage(
      `§c${record.name}'s ${itemName(toolId)} broke!§r ` + (next >= 0 ? `Switching to slot ${next + 1}.` : "")
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

  // Remove leftover copies of AIs that were deleted, recalled from far away, or handed to a new controller.
  const live = [];
  for (const ai of ais) {
    const info = ownerInfo(ai);
    const record = info ? getAi(info.key) : undefined;
    if (!info || !record || record.id !== ai.id || record.ownerId !== info.ownerId) {
      ai.remove();
    } else {
      knownAis.set(ai.id, info);
      live.push({ ai, info, record });
    }
  }

  forgetUnloaded(new Set(live.map((l) => l.ai.id)));
  for (const { ai, info } of live) ensureBrain(ai, info.role);
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

  // ---- Stage perks (see data.js): lava/fire proof, fall proof, the Fighter's final upgrade.
  brain.role = role;
  if (lavaProof(record) && !brain.lavaProof) ai.triggerEvent("aip:upgrade");
  brain.lavaProof = lavaProof(record);
  brain.resourcePerks = resourcePerks(record);
  brain.upgraded = fighterPerks(record);

  // ---- Its level: a bit faster for every level (sprinting uses its own speed), and stronger.
  brain.damageBonus = damageBonus(levelOf(record));
  if (brain.level !== levelOf(record) && !brain.sprinting) {
    const movement = ai.getComponent("minecraft:movement");
    movement?.setCurrentValue(movement.defaultValue * moveFactor(levelOf(record)));
    brain.level = levelOf(record);
  }

  // ---- Working far from every player (gathering, building, guarding): keep its land loaded so it
  // doesn't freeze. One ticking area per AI, and each player only has one AI.
  keepLoaded(ai, record.key, record.mode === "wander" || record.mode === "guard");

  // ---- Lava: cover it with blocks or back away (lava proof AIs don't mind lava).
  const lavaClose = brain.lavaProof ? false : avoidLava(ai, ownerId, role, record, brain.gather);

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
    stopSprint(ai, brain);
    ai.triggerEvent("aip:retreat");
    setHunt(brain, undefined);
    owner?.sendMessage(`§e${record.name} is badly hurt and backing off to heal.`);
  }
  if (brain.retreating) {
    heal(health, 0.5); // resting: 1 health a second, plus any chicken it eats
    if (canGather(record)) setGatherBehavior(ai, brain.gather, record.focus, false);
    if (health.currentValue / health.effectiveMax >= RECOVERED_AT) {
      brain.retreating = false;
      if (!brain.fleeing) ai.triggerEvent("aip:recovered");
      owner?.sendMessage(`§a${record.name} has healed up and is back in action.`);
    }
    return;
  }
  // Slowly heal when nothing has hit it for a while.
  const lastHit = Math.max(0, ...(recentHits.get(ai.id)?.values() ?? []));
  if (now - lastHit > 10000 && system.currentTick % 80 < THINK_TICKS) heal(health, 1);

  pickUpItems(ai, ownerId, role, record);
  if (role !== "fighter") {
    // ---- It never fights: it runs from players who attack it.
    gatherWork(ai, ownerId, role, record, brain, owner, lavaClose, lastHit, resourceDefense(ai, brain, record, owner, now), now);
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

  // ---- A Fighter that was a Resource AI, told to gather: it gathers whenever there's nothing to fight.
  if (record.evolved && record.mode === "wander") {
    if (!brain.huntId) {
      stopSprint(ai, brain);
      gatherWork(ai, ownerId, role, record, brain, owner, lavaClose, lastHit, undefined, now);
      return;
    }
    setGatherBehavior(ai, brain.gather, record.focus, false); // an enemy: drop the work and fight
  } else {
    brain.modeEvent = undefined; // following/guarding (its own movement groups)
  }

  // ---- Nothing to fight: break and loot tombstones nearby.
  if (!brain.huntId && now - lastHit > RECENT_MS && handleTombs(ai, ownerId, record, brain.loot)) {
    stopSprint(ai, brain);
    equip(ai, brain, record, chooseSlot(record, brain, owner, undefined, 0));
    return;
  }

  // ---- Pick the tool for this target and shoot if it's holding a bow.
  const target = brain.huntId ? world.getEntity(brain.huntId) : undefined;
  const dist = target ? distance(target.location, ai.location) : 0;
  if (target) {
    // A new fight (after a pause), or a new target that's far away: the opening arrow is allowed again.
    if (now - brain.lastFightAt > 10000 || (brain.shots === 0 && dist > OPENING_RANGE)) brain.openingDone = false;
    brain.lastFightAt = now;
  }
  equip(ai, brain, record, chooseSlot(record, brain, owner, target, dist));
  const holdingBow = isRanged(slotItem(record, brain.activeSlot)?.id);
  const range = brain.wantRanged ? BOW_RANGE : OPENING_RANGE;
  const volley = brain.upgraded && !brain.wantRanged; // upgraded "Bow and Sword": 2 fast opening arrows
  if (target && holdingBow && dist <= range && now >= brain.nextShotAt && fireArrow(ai, brain, target, volley ? VOLLEY_SPEED : 1)) {
    brain.nextShotAt = now + SHOT_EVERY_MS;
    if (volley) {
      for (let i = 1; i < VOLLEY_ARROWS; i++) {
        system.runTimeout(() => {
          if (ai.isValid && target.isValid) fireArrow(ai, brain, target, VOLLEY_SPEED);
        }, 4 * i);
      }
    }
    if (!brain.wantRanged) {
      brain.openingDone = true; // Bow and Sword: that was the one arrow; now the sword
      equip(ai, brain, record, chooseSlot(record, brain, owner, target, dist));
    }
  }

  // ---- Upgraded: the 30-block sequence against enemy players (sprint, knockback, power jump).
  upgradedSequence(ai, brain, target, dist, now);

  // ---- Bridge or pillar towards the target (or the owner it's following).
  if (!lavaClose) {
    const followOwner = record.mode !== "guard" && owner && owner.dimension.id === ai.dimension.id && distance(owner.location, ai.location) > 4;
    bridgeTowards(ai, ownerId, role, record, target?.location ?? (followOwner ? owner.location : undefined));
  }
}

/**
 * Gathering work (Resource AI, or a Fighter that was one, when it has nothing to fight): follow its owner,
 * or wander and gather / strip mine / build a sugar cane farm.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").RoleId} role
 * @param {import("./data.js").AiRecord} record
 * @param {Brain} brain
 * @param {import("@minecraft/server").Player | undefined} owner
 * @param {boolean} lavaClose
 * @param {number} lastHit
 * @param {number | undefined} fleeSlot  Resource AI running from a player (it holds this slot)
 * @param {number} now
 */
function gatherWork(ai, ownerId, role, record, brain, owner, lavaClose, lastHit, fleeSlot, now) {
  // ---- Direction: strictly follow its owner, or wander and gather (or strip mine, if upgraded).
  const wandering = record.mode === "wander";
  const stripping = wandering && brain.resourcePerks && record.focus === "Strip mine";

  // ---- Gather only while wandering, and not while being attacked or near lava.
  const safe = wandering && !lavaClose && now - lastHit > RECENT_MS;
  setGatherBehavior(ai, brain.gather, stripping ? "Nothing" : record.focus, safe && !stripping);
  // Sugar cane farm: collect the materials (normal gathering), then build it.
  const building = wandering && farmBuilding(record);
  let slot = fleeSlot;
  if (slot === undefined && safe) {
    if (stripping) {
      slot = stripMine(ai, ownerId, record, brain.strip, () => placeTorch(ai, ownerId, record, brain, Date.now()));
    } else if (building) {
      buildFarm(ai, ownerId, record);
    } else {
      slot = gather(ai, ownerId, record, brain.gather, undefined);
      if (record.focus === FARM_FOCUS) checkCollected(ai, ownerId, record);
    }
  }
  // While it's walking to or chopping/mining something it stands still instead of strolling off.
  // On Trees it goes from tree to tree (scouting for the next ones) and only strolls around when there
  // are no trees anywhere near.
  const lockedOn = record.focus === "Trees" && !brain.gather.lost;
  const working = wandering && !stripping && (isBusy(brain.gather) || building || lockedOn);
  const modeEvent = stripping || working ? "aip:resource_stay" : wandering ? "aip:resource_wander" : "aip:resource_follow";
  if (brain.modeEvent !== modeEvent) {
    ai.triggerEvent(modeEvent);
    brain.modeEvent = modeEvent;
  }
  equip(ai, brain, record, slot ?? firstTool(record, false));
  if (safe) placeTorch(ai, ownerId, record, brain, now);
  // Not mining and its owner is away: bridge/pillar to catch up.
  if (slot === undefined && !isBusy(brain.gather) && !building && !lavaClose && owner && owner.dimension.id === ai.dimension.id && distance(owner.location, ai.location) > 4) {
    bridgeTowards(ai, ownerId, role, record, owner.location);
  }
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
  // "Only players": it still defends against mobs that attack, but doesn't go looking for them.
  const huntMobs = record.targets !== "players";
  const sameDimOwner = owner && owner.dimension.id === ai.dimension.id ? owner : undefined;

  const radius = brain.upgraded ? SEQUENCE_RADIUS : SCAN_RADIUS;
  const candidates = ai.dimension.getEntities({
    location: ai.location,
    maxDistance: radius,
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
    if (score === 0 && huntMobs && !LEAVE_ALONE.has(e.typeId) && e.matches({ families: ["monster"] })) {
      const anchor = guarding ? record.post : sameDimOwner?.location;
      if (!anchor || distance(e.location, anchor) <= 20) score = 30 + (DANGER[e.typeId] ?? 20);
    }
    if (score === 0) continue;

    // Danger from weapons, closeness, and finishing off weak enemies.
    if (isPlayer) {
      const held = e.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Mainhand)?.typeId;
      if (held && ALLOWED_TOOLS.fighter.has(held)) score += 20;
    }
    score += Math.max(0, radius - distance(e.location, ai.location)) * 2;
    if (eHealth.currentValue / eHealth.effectiveMax < 0.3) score += 10;

    if (e.id === brain.huntId) currentScore = score;
    if (!best || score > best.score) best = { entity: e, id: e.id, score };
  }
  return { best, currentScore };
}

// ================================================================ upgraded Fighter sequence

/**
 * Against an enemy player within 30 blocks: sprint (1.5x speed and jump) until its first hit, and one
 * 10-block power jump if they're more than 2 blocks higher. Each once per sequence; a sequence ends
 * when the player leaves the 30 blocks (coming back starts a new one).
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {import("@minecraft/server").Entity | undefined} target
 * @param {number} dist
 * @param {number} now
 */
function upgradedSequence(ai, brain, target, dist, now) {
  if (!brain.upgraded) return stopSprint(ai, brain);

  // Players who left the 30 blocks: their sequence is over.
  for (const [id] of brain.sequences) {
    const p = world.getEntity(id);
    if (!p?.isValid || p.dimension.id !== ai.dimension.id || distance(p.location, ai.location) > SEQUENCE_RADIUS) {
      brain.sequences.delete(id);
    }
  }
  if (!target || target.typeId !== "minecraft:player" || dist > SEQUENCE_RADIUS) return stopSprint(ai, brain);

  let seq = brain.sequences.get(target.id);
  if (!seq) brain.sequences.set(target.id, (seq = { hit: false, jumped: false }));

  // Full sprint until the first hit lands.
  if (!seq.hit) startSprint(ai, brain);
  else stopSprint(ai, brain);

  // Power jump: the enemy is more than 2 blocks higher and fairly close.
  const above = target.location.y - ai.location.y;
  const flat = Math.hypot(target.location.x - ai.location.x, target.location.z - ai.location.z);
  if (!seq.jumped && above > 2 && flat < 8 && ai.isOnGround) {
    seq.jumped = true;
    powerJump(ai, brain, target, now);
  }
}

/** @param {import("@minecraft/server").Entity} ai @param {Brain} brain */
function startSprint(ai, brain) {
  ai.addEffect("jump_boost", 30, { amplifier: 1, showParticles: false }); // jumps higher too
  if (brain.sprinting) return;
  brain.sprinting = true;
  ai.getComponent("minecraft:movement")?.setCurrentValue(SPRINT_MOVEMENT);
}

/** @param {import("@minecraft/server").Entity} ai @param {Brain} brain */
function stopSprint(ai, brain) {
  if (!brain.sprinting) return;
  brain.sprinting = false;
  ai.getComponent("minecraft:movement")?.resetToDefaultValue();
  brain.level = -1; // the next think puts back its level speed
  ai.removeEffect("jump_boost");
}

/**
 * Jumps about 10 blocks up towards the enemy, swinging all the way. No fall damage for 5 seconds.
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {import("@minecraft/server").Entity} target
 * @param {number} now
 */
function powerJump(ai, brain, target, now) {
  const dx = target.location.x - ai.location.x;
  const dz = target.location.z - ai.location.z;
  const len = Math.hypot(dx, dz) || 1;
  const reach = Math.min(0.6, len / 10);
  brain.noFallUntil = now + NO_FALL_MS;
  ai.applyImpulse({ x: (dx / len) * reach, y: POWER_JUMP_UP, z: (dz / len) * reach });
  ai.dimension.playSound("mob.irongolem.throw", ai.location);
  for (let i = 0; i < 8; i++) {
    system.runTimeout(() => {
      if (ai.isValid) ai.playAnimation("animation.aip.ai_player.mine"); // keeps swinging
    }, i * 5);
  }
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
 * Which slot to use against this target, following the Fighter's fighting style:
 * - Sword Combat: melee tools only. It sprints in and keeps hitting.
 * - Bow Only: bow/crossbow (melee only if it has no bow or arrows). Keeps its distance.
 * - Bow and Sword: holds its bow while running in, fires one arrow from about 20 blocks, then
 *   switches to its sword. No more opening arrows in the same fight unless a new target is
 *   further than 20 blocks away.
 * Also sets brain.wantRanged (keep distance) for Bow Only.
 * @param {import("./data.js").AiRecord} record
 * @param {Brain} brain
 * @param {import("@minecraft/server").Player | undefined} owner
 * @param {import("@minecraft/server").Entity | undefined} target
 * @param {number} dist
 */
function chooseSlot(record, brain, owner, target, dist) {
  const tools = inventoryOf(record).tools;
  const arrows = totalArrows(record) > 0;
  // Only weapons (a Fighter that gathers may also carry pickaxes and shovels).
  const usable = [0, 1, 2].filter((i) => tools[i] && ALLOWED_TOOLS.fighter.has(tools[i]?.id ?? "") && (!isRanged(tools[i]?.id) || arrows));
  const melee = usable.filter((i) => !isRanged(tools[i]?.id));
  const ranged = usable.filter((i) => isRanged(tools[i]?.id));
  const style = record.combat ?? "archer_sword";
  brain.wantRanged = false;

  if (style === "archer") {
    if (ranged.length) {
      brain.wantRanged = true;
      return ranged[0];
    }
    return pickMelee(melee, tools, target);
  }
  if (style === "sword") return pickMelee(melee, tools, target);

  // Bow and Sword: the bow until the opening arrow is fired, then the sword.
  if (target && ranged.length && !brain.openingDone && dist > 4) return ranged[0];
  return melee.length ? pickMelee(melee, tools, target) : -1;
}

/**
 * First melee slot, or an axe against a player holding a shield.
 * @param {number[]} melee
 * @param {(import("./inventory.js").ToolData | null)[]} tools
 * @param {import("@minecraft/server").Entity | undefined} target
 */
function pickMelee(melee, tools, target) {
  if (melee.length === 0) return -1;
  if (target?.typeId === "minecraft:player") {
    const offhand = target.getComponent("minecraft:equippable")?.getEquipment(EquipmentSlot.Offhand);
    const axe = melee.find((i) => tools[i]?.id.endsWith("_axe"));
    if (offhand?.typeId === "minecraft:shield" && axe !== undefined) return axe;
  }
  return melee[0];
}

/**
 * Holds the tool from a slot (or nothing) and switches between melee and ranged fighting.
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {import("./data.js").AiRecord} record
 * @param {number} slot
 */
function equip(ai, brain, record, slot) {
  const toolId = slotItem(record, slot)?.id;
  brain.activeSlot = toolId ? slot : -1;
  // Keep its distance only for Bow Only; "Bow and Sword" charges in with its bow out.
  const style = isRanged(toolId) && brain.wantRanged ? "ranged" : "melee";
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
 * The Resource AI never fights. When a player attacks it, it runs away (mobs can't hurt it).
 * Returns the slot to hold while fighting, or undefined when it isn't fighting.
 * @param {import("@minecraft/server").Entity} ai
 * @param {Brain} brain
 * @param {import("./data.js").AiRecord} record
 * @param {import("@minecraft/server").Player | undefined} owner
 * @param {number} now
 */
function resourceDefense(ai, brain, record, owner, now) {
  /** @type {import("@minecraft/server").Entity | undefined} */
  let attacker;
  let latest = 0;
  for (const [id, time] of recentHits.get(ai.id) ?? []) {
    if (now - time > RECENT_MS || time < latest) continue;
    const e = world.getEntity(id);
    // Mobs can't hurt it and it doesn't fight them: only players count.
    if (e?.isValid && id !== owner?.id && e.typeId === "minecraft:player") {
      attacker = e;
      latest = time;
    }
  }
  // It never fights back: it runs from the player instead.
  const flee = !!attacker;
  if (flee && !brain.fleeing) {
    brain.fleeing = true;
    ai.triggerEvent("aip:retreat");
    owner?.sendMessage(`§e${record.name} doesn't fight, so it's running away from ${attacker?.nameTag}.`);
  } else if (!flee && brain.fleeing) {
    brain.fleeing = false;
    if (!brain.retreating) ai.triggerEvent("aip:recovered");
  }
  return flee ? -1 : undefined;
}

/**
 * Resource AI: places one of its own torches about every 10 blocks underground, in caves and
 * mines (the torch slot refills itself).
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").AiRecord} record
 * @param {Brain} brain
 * @param {number} now
 */
export function placeTorch(ai, ownerId, record, brain, now) {
  if (now < brain.torchReadyAt) return;
  brain.torchReadyAt = now + 1000;
  const dim = ai.dimension;
  const feet = { x: Math.floor(ai.location.x), y: Math.floor(ai.location.y), z: Math.floor(ai.location.z) };
  try {
    // Underground (in a cave or a mine), not outside.
    if (dim.getSkyLightLevel(feet) >= 4) return;
    const here = dim.getBlock(feet);
    const below = dim.getBlock({ ...feet, y: feet.y - 1 });
    if (!here?.isAir || !below || below.isAir || below.isLiquid) return;
    const r = TORCH_SPACING;
    const nearby = new BlockVolume({ x: feet.x - r, y: feet.y - 2, z: feet.z - r }, { x: feet.x + r, y: feet.y + 2, z: feet.z + r });
    if (dim.containsBlock(nearby, { includeTypes: [TORCH_ITEM] })) return;
    dim.setBlockType(feet, TORCH_ITEM);
  } catch {
    return; // unloaded area or a block a torch can't go on
  }
  useTorch(record);
  saveRecord(ownerId, "resource", record);
  brain.torchReadyAt = now + TORCH_EVERY_MS;
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
 * Picks up allowed tools (into the first empty slot), valuables, building blocks (never sand,
 * gravel or other falling blocks) and arrows lying next to it.
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
    if (toolsFor(record).has(stack.typeId) && stack.amount === 1) {
      const slot = addTool(record, toolFromStack(stack));
      if (slot === -1) continue;
      item.remove();
      message = `picked up a ${itemName(stack.typeId)} (slot ${slot + 1})`;
    } else if (isValuable(stack.typeId) || isPlaceableBlock(stack.typeId)) {
      const added = isValuable(stack.typeId)
        ? addValuables(record, stack.typeId, stack.amount)
        : addBlocks(record, stack.typeId, stack.amount);
      if (added === 0) continue;
      const location = item.location;
      item.remove();
      if (added < stack.amount) {
        stack.amount -= added;
        ai.dimension.spawnItem(stack, location);
      }
      message = `picked up ${added} ${itemName(stack.typeId)}`;
    } else if (stack.typeId === ARROW_ITEM) {
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

/** @param {import("@minecraft/server").Entity} ai @param {import("./data.js").RoleId} role */
function ensureBrain(ai, role) {
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
    role,
    loot: createLootState(),
    fleeing: false,
    torchReadyAt: 0,
    shots: 0,
    openingDone: false,
    lastFightAt: 0,
    nextShotAt: 0,
    wantRanged: false,
    upgraded: false,
    lavaProof: false,
    resourcePerks: false,
    level: -1,
    damageBonus: 0,
    modeEvent: undefined,
    strip: createStripState(),
    sequences: new Map(),
    sprinting: false,
    noFallUntil: 0,
    warnedAt: 0,
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
  if (brain.huntId !== target?.id) brain.shots = 0;
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

