// Computer Chest: the player crafts and places it (AIs never place one). It works like an ender chest:
// every Computer Chest you place opens the same AI Chest, the one your AI fills with half of a material
// whenever its slots are full of it. (The AI Chest unlocks when the AI is upgraded at the Coder.)
// Place it like a block (it's really a small entity, so right clicking it opens an inventory screen).
// - Right click it: your AI's AI Chest (only the player who placed it can open it).
// - Left click it: switch to an upgraded AI's own inventory instead, or pick the chest back up.
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getAi, controlledBy, giveItem, takeOneFromHand, chestReady, canGather, resourcePerks } from "./data.js";
import { stashCount } from "./inventory.js";
import { sync, syncEmpty, syncStash } from "./container.js";

export const CHEST_ENTITY = "aip:computer_chest";
const CHEST_ITEM = "aip:computer_chest";

// Place it against the block you tap.
world.afterEvents.playerInteractWithBlock.subscribe(({ player, block, blockFace, itemStack, isFirstEvent }) => {
  if (!isFirstEvent || itemStack?.typeId !== CHEST_ITEM) return;
  const offset = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], West: [-1, 0, 0], East: [1, 0, 0] }[blockFace] ?? [0, 1, 0];
  const at = { x: block.location.x + offset[0], y: block.location.y + offset[1], z: block.location.z + offset[2] };
  if (!player.dimension.getBlock(at)?.isAir) {
    player.sendMessage("§eThere's no room for the Computer Chest there.");
    return;
  }
  const chest = player.dimension.spawnEntity(CHEST_ENTITY, { x: at.x + 0.5, y: at.y, z: at.z + 0.5 });
  chest.getComponent("minecraft:tameable")?.tame(player); // only this player can open it
  chest.setDynamicProperty("aip:owner", player.id);
  chest.nameTag = "Computer Chest";
  chest.teleport(chest.location, { facingLocation: { x: player.location.x, y: chest.location.y, z: player.location.z } });
  takeOneFromHand(player);
  // Like an ender chest: it opens your AI's AI Chest straight away.
  const ai = controlledBy(player.id).find(canGather);
  if (ai) chest.setDynamicProperty("aip:view", `stash:${ai.key}`);
  player.sendMessage(
    ai
      ? `§aComputer Chest placed. Right click it to open ${ai.name}'s AI Chest${resourcePerks(ai) ? "" : " §7(locked until it's upgraded at the Coder)"}§a.`
      : "§aComputer Chest placed. §7Left click it to choose what it shows."
  );
});

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
      if (chestReady(r)) views.push({ view: r.key, name: `${r.name}'s inventory`, about: "Its slots" });
    }
    const showing = chest.getDynamicProperty("aip:view");
    const current = typeof showing === "string" ? views.find((v) => v.view === showing) : undefined;
    const form = new ActionFormData()
      .title("Computer Chest")
      .body(
        `Showing: §e${current ? current.name : "nothing"}§r\n\n` +
          (views.length
            ? "Choose what it shows, then right click the chest to open it."
            : "§cYou don't have an AI yet.§r Buy one at the Coder.")
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
        } else if (record && chestReady(record) && record.ownerId === ownerId) {
          sync(chest, ownerId, record.role, record.key);
        } else {
          syncEmpty(chest, ownerId, record ? `${record.name} isn't yours or isn't upgraded` : "No AI chosen");
        }
      } catch (error) {
        console.warn(`[AI Players] Computer Chest error: ${error}`);
      }
    }
  }
}, 5);
