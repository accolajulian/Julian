// Computer Chest: the player crafts and places it (AIs never place one). It works like an ender chest:
// every Computer Chest you place opens the same AI Chest, the one your AI fills with half of a material
// whenever its slots are full of it. (The AI Chest unlocks when the AI is upgraded at the Coder.)
// Place it like a block (it's really a small entity, so right clicking it opens an inventory screen).
// - Right click it: your AI's AI Chest: only materials it mined (never its torches or chicken).
//   Only the player who placed it can open it.
// - Left click it: pick it back up (or choose which AI's chest, if you control more than one).
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getAi, controlledBy, giveItem, canGather, resourcePerks } from "./data.js";
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
  entity.teleport(at, { facingLocation: { x: player.location.x, y: at.y, z: player.location.z } });
  entity.getComponent("minecraft:tameable")?.tame(player); // only this player can open it
  entity.setDynamicProperty("aip:owner", player.id);
  entity.nameTag = "Computer Chest";
  // Like an ender chest: it opens your AI's AI Chest.
  const ai = controlledBy(player.id).find(canGather);
  if (ai) entity.setDynamicProperty("aip:view", `stash:${ai.key}`);
  player.sendMessage(
    ai
      ? `§aComputer Chest placed. Right click it to open ${ai.name}'s AI Chest${resourcePerks(ai) ? "" : " §7(locked until it's upgraded at the Coder)"}§a.`
      : "§aComputer Chest placed."
  );
});

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

// Left click: choose an AI or pick the chest up. (Hits never break it.)
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (hitEntity.typeId !== CHEST_ENTITY || damagingEntity.typeId !== "minecraft:player") return;
  const player = /** @type {import("@minecraft/server").Player} */ (damagingEntity);
  if (hitEntity.getDynamicProperty("aip:owner") !== player.id) {
    player.sendMessage("§cThis Computer Chest belongs to someone else.");
    return;
  }
  system.run(() => chestMenu(player, hitEntity));
});

/** Players with this menu open (only one at a time). @type {Set<string>} */
const open = new Set();

/**
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").Entity} chest
 */
async function chestMenu(player, chest) {
  if (open.has(player.id)) return;
  open.add(player.id);
  try {
    const mine = controlledBy(player.id);
    // Each AI's AI Chest (locked until upgraded), and each upgraded AI's own inventory.
    /** @type {{ view: string, name: string, about: string }[]} */
    const views = [];
    for (const r of mine) {
      if (canGather(r)) {
        views.push({
          view: `stash:${r.key}`,
          name: `${r.name}'s AI Chest`,
          about: resourcePerks(r) ? `${stashCount(r)} items` : `Locked: ${stashCount(r)} items saved`,
        });
      }
    }
    const showing = chest.getDynamicProperty("aip:view");
    const current = typeof showing === "string" ? views.find((v) => v.view === showing) : undefined;
    const form = new ActionFormData()
      .title("Computer Chest")
      .body(
        `Showing: §e${current ? current.name : "nothing"}§r\n\n` +
          (views.length ? "Right click the chest to open the AI Chest." : "§cYou don't have an AI yet.§r Buy one at the Coder.")
      );
    views.forEach((v) => form.button(`${v.name}\n§8${v.about}`));
    form.button("§cPick up the chest");
    const response = await form.show(player);
    if (response.canceled || response.selection === undefined || !chest.isValid) return;
    if (response.selection < views.length) {
      chest.setDynamicProperty("aip:view", views[response.selection].view);
      player.sendMessage(`§aThe Computer Chest now shows ${views[response.selection].name}.`);
    } else {
      chest.remove();
      giveItem(player, new ItemStack(CHEST_ITEM, 1));
    }
  } finally {
    open.delete(player.id);
  }
}

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
