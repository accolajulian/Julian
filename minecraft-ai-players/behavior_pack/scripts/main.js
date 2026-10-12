// AI Players: tap an AI Recruitment Station to buy a Resource AI or a Fighter AI,
// choose its look, name it, and it spawns as your companion.
import { world, system } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";

const AI_ENTITY = "aip:ai_player";
const MAX_NAME_LENGTH = 20;

// Each player can own one AI of each role at a time.
/** @type {Record<string, { title: string, about: string, price: { item: string, amount: number, label: string }, icon: string }>} */
const ROLES = {
  resource: {
    title: "Resource AI",
    about: "Helps you gather resources. Follows you and only fights back if attacked.",
    price: { item: "minecraft:iron_ingot", amount: 30, label: "Iron Ingots" },
    icon: "textures/items/iron_ingot",
  },
  fighter: {
    title: "Fighter AI",
    about: "Protects you from mobs and players and attacks whatever you hit.",
    price: { item: "minecraft:diamond", amount: 15, label: "Diamonds" },
    icon: "textures/items/diamond",
  },
};

// Order must match the skin numbers (aip:skin_0 ... aip:skin_9) and the icons.
const LOOKS = [
  "Robot with a glowing visor",
  "Red hair, green hoodie",
  "Knight in iron armor",
  "Orange hair, leather jacket",
  "White hair, ice-blue parka",
  "Explorer with a safari hat",
  "Purple-haired astronaut",
  "Sporty runner with a headband",
  "Braids and a teal top",
  "Gamer with headphones",
];

// The AI Recruitment Station block opens the shop when tapped.
system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("aip:station", {
    onPlayerInteract: ({ player }) => {
      if (player) system.run(() => showShop(player));
    },
  });
});

// When an AI player dies: free its owner's slot and show "left the game".
world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    try {
      // Only free the slot if it still points at this AI (not a newer one).
      const key = deadEntity.getDynamicProperty("aip:slot");
      const saved = typeof key === "string" ? world.getDynamicProperty(key) : undefined;
      if (typeof key === "string" && typeof saved === "string" && saved.startsWith(`${deadEntity.id}|`)) {
        world.setDynamicProperty(key, undefined);
      }
      if (deadEntity.nameTag) world.sendMessage(`§e${deadEntity.nameTag} left the game`);
    } catch {
      // The entity was already gone; nothing to clean up.
    }
  },
  { entityTypes: [AI_ENTITY] }
);

// ---------------------------------------------------------------- slots

/** @param {import("@minecraft/server").Player} player @param {string} role */
function slotKey(player, role) {
  return `aip:slot:${player.id}:${role}`;
}

/**
 * The AI this player owns for a role, saved as "entityId|name", or undefined.
 * @param {import("@minecraft/server").Player} player @param {string} role
 */
function getSlot(player, role) {
  const value = world.getDynamicProperty(slotKey(player, role));
  if (typeof value !== "string") return undefined;
  const [id, name] = value.split("|");
  return { id, name };
}

// ---------------------------------------------------------------- inventory

/** @param {import("@minecraft/server").Player} player @param {string} itemId */
function countItem(player, itemId) {
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
function takeItem(player, itemId, amount) {
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

// ---------------------------------------------------------------- forms

/** @param {import("@minecraft/server").Player} player */
async function showShop(player) {
  const roleIds = Object.keys(ROLES);
  const form = new ActionFormData()
    .title("AI Recruitment Station")
    .body("Hire an AI player. You can have one of each kind.");

  for (const roleId of roleIds) {
    const role = ROLES[roleId];
    const owned = getSlot(player, roleId);
    const line2 = owned
      ? `§2Yours: ${owned.name}`
      : `§8${role.price.amount} ${role.price.label}`;
    form.button(`${role.title}\n${line2}`, role.icon);
  }

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const roleId = roleIds[response.selection];

  if (getSlot(player, roleId)) {
    await manageOwned(player, roleId);
  } else {
    await startPurchase(player, roleId);
  }
}

/** @param {import("@minecraft/server").Player} player @param {string} roleId */
async function startPurchase(player, roleId) {
  const role = ROLES[roleId];
  const have = countItem(player, role.price.item);

  if (have < role.price.amount) {
    await new MessageFormData()
      .title(role.title)
      .body(`${role.about}\n\nCost: ${role.price.amount} ${role.price.label}\nYou have: §c${have}`)
      .button1("OK")
      .button2("Close")
      .show(player);
    return;
  }

  const look = await chooseLook(player, role);
  if (look === undefined) return;
  const name = await askForName(player, role);
  if (name === undefined) return;

  // Check again: the inventory may have changed while the menus were open.
  if (countItem(player, role.price.item) < role.price.amount) {
    player.sendMessage(`§cYou need ${role.price.amount} ${role.price.label} to hire a ${role.title}.`);
    return;
  }
  if (getSlot(player, roleId)) {
    player.sendMessage(`§cYou already have a ${role.title}.`);
    return;
  }

  takeItem(player, role.price.item, role.price.amount);
  if (!spawnAiPlayer(player, roleId, look, name)) {
    // Something went wrong: give the payment back.
    player.runCommand(`give @s ${role.price.item} ${role.price.amount}`);
    player.sendMessage("§cThe AI player couldn't join. Your payment was returned.");
  }
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {{ title: string }} role
 * @returns {Promise<number | undefined>}
 */
async function chooseLook(player, role) {
  const form = new ActionFormData().title(`${role.title}: choose a look`);
  LOOKS.forEach((look, i) => form.button(look, `textures/aip/icons/${i}`));
  const response = await form.show(player);
  if (response.canceled) return undefined;
  return response.selection;
}

/**
 * Keeps asking until the player types a name (or closes the form).
 * @param {import("@minecraft/server").Player} player
 * @param {{ title: string }} role
 * @returns {Promise<string | undefined>}
 */
async function askForName(player, role) {
  let warning = "";
  for (;;) {
    const form = new ModalFormData()
      .title(`Name your ${role.title}`)
      .textField(`${warning}Gamer tag (shown above its head, up to ${MAX_NAME_LENGTH} letters)`, "Type a name");
    const response = await form.show(player);
    if (response.canceled) return undefined;

    // Remove Minecraft colour codes (§) and the "|" we use for saving.
    const name = String(response.formValues?.[0] ?? "").replace(/[§|]/g, "").trim();
    if (name.length === 0) {
      warning = "§cYou have to type a name.§r\n";
    } else if (name.length > MAX_NAME_LENGTH) {
      warning = `§cThat name is too long (max ${MAX_NAME_LENGTH}).§r\n`;
    } else {
      return name;
    }
  }
}

/** @param {import("@minecraft/server").Player} player @param {string} roleId */
async function manageOwned(player, roleId) {
  const role = ROLES[roleId];
  const owned = getSlot(player, roleId);
  if (!owned) return;

  const response = await new ActionFormData()
    .title(`${role.title}: ${owned.name}`)
    .button("Call it to me")
    .button("Dismiss it (no refund)")
    .show(player);
  if (response.canceled) return;

  const ai = world.getEntity(owned.id);
  if (response.selection === 0) {
    if (ai) {
      ai.teleport(player.location, { dimension: player.dimension });
    } else {
      player.sendMessage(`§e${owned.name} is too far away to call. Go closer and try again.`);
    }
    return;
  }

  const confirm = await new MessageFormData()
    .title("Dismiss AI player?")
    .body(`${owned.name} will leave and you won't get your ${role.price.label} back.`)
    .button1("Dismiss")
    .button2("Keep")
    .show(player);
  if (confirm.selection !== 0) return;

  world.setDynamicProperty(slotKey(player, roleId), undefined);
  if (ai) ai.remove();
  world.sendMessage(`§e${owned.name} left the game`);
}

// ---------------------------------------------------------------- spawning

/**
 * @param {import("@minecraft/server").Player} player
 * @param {string} roleId
 * @param {number} look
 * @param {string} name
 * @returns {boolean} true if the AI joined
 */
function spawnAiPlayer(player, roleId, look, name) {
  // Two blocks in front of the player, at their feet level.
  const view = player.getViewDirection();
  const location = {
    x: player.location.x + view.x * 2,
    y: player.location.y,
    z: player.location.z + view.z * 2,
  };

  const ai = player.dimension.spawnEntity(AI_ENTITY, location);
  const tameable = ai.getComponent("minecraft:tameable");
  if (!tameable || !tameable.tame(player)) {
    ai.remove();
    return false;
  }

  ai.triggerEvent("aip:on_tame");          // follow the owner
  ai.triggerEvent(`aip:role_${roleId}`);   // fighter or resource behaviour
  ai.triggerEvent(`aip:skin_${look}`);
  ai.nameTag = name;

  const key = slotKey(player, roleId);
  ai.setDynamicProperty("aip:slot", key);
  world.setDynamicProperty(key, `${ai.id}|${name}`);

  world.sendMessage(`§e${name} joined the game`);
  return true;
}
