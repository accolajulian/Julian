// Computer Chest: lets players open their upgraded AIs' inventories from anywhere.
// Place it like a block (it's really a small entity, so right clicking it opens an inventory screen).
// - Left click it: choose which of your upgraded AIs it shows, or pick the chest back up.
// - Right click it: that AI's inventory (only the player who placed it can open it).
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getAi, controlledBy, giveItem, takeOneFromHand } from "./data.js";
import { sync, syncEmpty } from "./container.js";

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
  player.sendMessage("§aComputer Chest placed. Left click it to choose an upgraded AI, right click it to open its inventory.");
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
    const upgraded = controlledBy(player.id).filter((r) => r.upgraded);
    const showing = chest.getDynamicProperty("aip:view");
    const current = typeof showing === "string" ? getAi(showing) : undefined;
    const form = new ActionFormData()
      .title("Computer Chest")
      .body(
        `Showing: §e${current ? current.name : "nothing"}§r\n\n` +
          (upgraded.length
            ? "Choose an upgraded AI, then right click the chest to open its inventory."
            : "§cYou don't control any upgraded AIs yet.§r Upgrade one at the Coder.")
      );
    upgraded.forEach((r) => form.button(`${r.name}\n§8${r.role === "fighter" ? "Fighter AI" : "Resource AI"}`));
    form.button("§cPick up the chest");
    const response = await form.show(player);
    if (response.canceled || response.selection === undefined || !chest.isValid) return;
    if (response.selection < upgraded.length) {
      chest.setDynamicProperty("aip:view", upgraded[response.selection].key);
      player.sendMessage(`§aThe Computer Chest now shows ${upgraded[response.selection].name}'s inventory.`);
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
      const key = chest.getDynamicProperty("aip:view");
      const record = typeof key === "string" ? getAi(key) : undefined;
      try {
        if (record && record.upgraded && record.ownerId === ownerId) {
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
