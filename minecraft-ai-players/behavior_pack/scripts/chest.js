// Computer Chest: the player crafts and places it (AIs never place one). It works like an ender chest:
// every Computer Chest you place opens the same AI Chest, the one your AI fills with half of a material
// whenever its slots are full of it. (The AI Chest unlocks when the AI is upgraded at the Coder.)
// Place it like a block (it's really a small entity, so right clicking it opens an inventory screen).
// - Right click it: your AI's AI Chest: only materials it mined (never its torches or chicken).
//   Only the player who placed it can open it.
// - Left click it: it breaks like a normal chest and drops itself as an item (nothing inside is lost:
//   the AI Chest lives with the AI).
// It sits exactly like a placed block: centered on its block, facing straight one of the 4 ways, and
// never moves, turns or shows a name over it.
import { world, system, ItemStack } from "@minecraft/server";
import { getAi, controlledBy, canGather, resourcePerks } from "./data.js";
import { stashCount } from "./inventory.js";
import { syncEmpty, syncStash } from "./container.js";
import { sparks } from "./effects.js";

export const CHEST_ENTITY = "aip:computer_chest";
const CHEST_ITEM = "aip:computer_chest";

// Placing it: the item places the chest itself (like an armor stand), so it works with a tap of
// Place on touch screens too. Here it's set up for the player who placed it (the closest one).
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (entity.typeId !== CHEST_ENTITY || !entity.isValid || entity.getDynamicProperty("aip:owner") !== undefined) return;
  const player = entity.dimension
    .getPlayers({ location: entity.location, maxDistance: 10 })
    .sort((a, b) => dist(a.location, entity.location) - dist(b.location, entity.location))[0];
  if (!player) return;
  const at = { x: Math.floor(entity.location.x) + 0.5, y: Math.floor(entity.location.y + 0.01), z: Math.floor(entity.location.z) + 0.5 };
  // Face the player, snapped to one of the 4 straight directions (like a placed chest).
  const yaw = Math.round(((Math.atan2(-(player.location.x - at.x), player.location.z - at.z) * 180) / Math.PI) / 90) * 90;
  entity.setDynamicProperty("aip:spot", JSON.stringify({ ...at, yaw }));
  settle(entity);
  entity.getComponent("minecraft:tameable")?.tame(player); // only this player can open it
  entity.setDynamicProperty("aip:owner", player.id);
  // Like an ender chest: it opens your AI's AI Chest.
  const ai = controlledBy(player.id).find(canGather);
  if (ai) entity.setDynamicProperty("aip:view", `stash:${ai.key}`);
  player.sendMessage(
    ai
      ? `§aComputer Chest placed. Right click it to open ${ai.name}'s AI Chest${resourcePerks(ai) ? "" : " §7(locked until it's upgraded at the Coder)"}§a.`
      : "§aComputer Chest placed."
  );
});

/**
 * Keeps a chest exactly where it was placed (block center, straight rotation), with no name over it.
 * @param {import("@minecraft/server").Entity} chest
 */
function settle(chest) {
  if (chest.nameTag) chest.nameTag = "";
  const raw = chest.getDynamicProperty("aip:spot");
  let spot;
  if (typeof raw === "string") {
    spot = JSON.parse(raw);
  } else {
    // Placed before this version: snap it where it is.
    const l = chest.location;
    spot = { x: Math.floor(l.x) + 0.5, y: Math.floor(l.y + 0.01), z: Math.floor(l.z) + 0.5, yaw: Math.round(chest.getRotation().y / 90) * 90 };
    chest.setDynamicProperty("aip:spot", JSON.stringify(spot));
  }
  const l = chest.location;
  const r = chest.getRotation();
  if (Math.hypot(l.x - spot.x, l.y - spot.y, l.z - spot.z) > 0.01 || Math.abs(r.y - spot.yaw) > 0.5 || r.x !== 0) {
    chest.teleport({ x: spot.x, y: spot.y, z: spot.z }, { rotation: { x: 0, y: spot.yaw } });
  }
  chest.clearVelocity();
}

/** @param {import("@minecraft/server").Vector3} a @param {import("@minecraft/server").Vector3} b */
function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

// Opening it: the lid slides up like a shulker box's (no spinning) and closes again once nobody is
// looking at it up close any more (the inventory screen was closed and they looked away or left).
world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (target.typeId !== CHEST_ENTITY || target.getDynamicProperty("aip:owner") !== player.id) return;
  if (target.getProperty("aip:open") !== true) {
    target.setProperty("aip:open", true);
    target.dimension.playSound("random.shulkerboxopen", target.location);
    sparks(target.dimension, { x: target.location.x, y: target.location.y + 0.9, z: target.location.z }, 14);
  }
});
system.runInterval(() => {
  for (const dimensionId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    for (const chest of world.getDimension(dimensionId).getEntities({ type: CHEST_ENTITY })) {
      try {
        settle(chest); // never budges or turns
      } catch {
        // unloaded
      }
      if (chest.getProperty("aip:open") !== true) continue;
      const watched = chest.dimension.getPlayers({ location: chest.location, maxDistance: 6 }).some((p) =>
        p.getEntitiesFromViewDirection({ maxDistance: 6 }).some((hit) => hit.entity.id === chest.id)
      );
      if (!watched) {
        chest.setProperty("aip:open", false);
        chest.dimension.playSound("random.shulkerboxclosed", chest.location);
      }
    }
  }
}, 10);

// Left click: it breaks like a normal chest and drops itself (only its owner can break it).
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (hitEntity.typeId !== CHEST_ENTITY || damagingEntity.typeId !== "minecraft:player") return;
  const player = /** @type {import("@minecraft/server").Player} */ (damagingEntity);
  if (hitEntity.getDynamicProperty("aip:owner") !== player.id) {
    player.sendMessage("§cThis Computer Chest belongs to someone else.");
    return;
  }
  system.run(() => {
    if (!hitEntity.isValid) return;
    const at = hitEntity.location;
    const dim = hitEntity.dimension;
    hitEntity.remove();
    dim.playSound("dig.stone", at);
    dim.spawnItem(new ItemStack(CHEST_ITEM, 1), { x: at.x, y: at.y + 0.3, z: at.z });
  });
});

// Keep every Computer Chest showing its chosen AI's inventory.
system.runInterval(() => {
  for (const dimensionId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    for (const chest of world.getDimension(dimensionId).getEntities({ type: CHEST_ENTITY })) {
      const ownerId = chest.getDynamicProperty("aip:owner");
      if (typeof ownerId !== "string") continue;
      const view = chest.getDynamicProperty("aip:view");
      const stash = typeof view === "string" && view.startsWith("stash:");
      const key = typeof view === "string" ? view.replace(/^stash:/, "") : undefined;
      const record = key ? getAi(key) : undefined;
      try {
        if (stash && record && canGather(record) && record.ownerId === ownerId && !resourcePerks(record)) {
          syncEmpty(chest, ownerId, `${record.name}'s AI Chest is locked (${stashCount(record)} items saved). Level it up at the Coder to unlock it.`);
        } else if (stash && record && canGather(record) && record.ownerId === ownerId) {
          syncStash(chest, ownerId, record.key);
        } else {
          // Not showing an AI Chest (an older chest showed the AI's own slots): switch to its owner's AI Chest.
          const mine = record && canGather(record) && record.ownerId === ownerId ? record : controlledBy(ownerId).find(canGather);
          if (mine) chest.setDynamicProperty("aip:view", `stash:${mine.key}`);
          else syncEmpty(chest, ownerId, "No AI Chest yet");
        }
      } catch (error) {
        console.warn(`[AI Players] Computer Chest error: ${error}`);
      }
    }
  }
}, 5);
