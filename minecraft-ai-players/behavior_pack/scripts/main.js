// AI Players: guide, shop, eggs, menus and respawning.
// The fighting brain and memory live in brain.js; saved data in data.js.
// - AI Computer: every player spawns with one. Use it to see how to craft the Coder and the prices.
// - Coder block: the shop. Buying an AI gives you an egg; throw it to spawn your AI.
// - Left click your AI (or its recall robot): commands (teleport, attack, follow/guard, settings, gather focus).
// - Right click your AI (or its recall robot): its inventory. That's the only way to open it.
// - Allies can right click your AI to take spare cooked chicken from its food slot.
// - If an AI dies it respawns next to the player who bought it, and keeps its memory.
import { world, system, ItemStack, EntityDamageCause, EntitySwingSource } from "@minecraft/server";
import { ActionFormData, MessageFormData, ModalFormData } from "@minecraft/server-ui";
import {
  AI_ENTITY,
  CAPSULE_ENTITY,
  ROLE_IDS,
  getRecord,
  saveRecord,
  getMemory,
  saveMemory,
  findPlayer,
  ownerInfo,
  knownAis,
  countItem,
  takeItem,
  giveItem,
} from "./data.js";
import { commandAttack, toolsChanged } from "./brain.js";
import "./container.js"; // the AI's right-click inventory
import {
  FOOD_ITEM,
  FOOD_RESERVED,
  FOOD_CAP,
  ARROW_ITEM,
  inventoryOf,
  takeableFood,
  generateFood,
  minutesToNextFood,
  stackFromTool,
  totalArrows,
  ARMOR_SLOTS,
} from "./inventory.js";
import { tombTypes, getTaught, setTaught, addOnThingsNear } from "./tombs.js";
import { FOCUSES } from "./gather_data.js";

/** @typedef {import("./data.js").RoleId} RoleId */
/** @typedef {import("./data.js").AiRecord} AiRecord */

const COMPUTER_ITEM = "aip:ai_computer";
const MAX_NAME_LENGTH = 20;
const RESPAWN_SECONDS = 5;
const START_FOOD = 10; // cooked chicken every AI comes with (it eats them to heal itself)

/** @type {Record<RoleId, { title: string, egg: string, robot: string, color: string, price: { item: string, amount: number, label: string }, icon: string, about: string }>} */
const ROLES = {
  resource: {
    title: "Resource AI",
    egg: "aip:resource_egg",
    robot: "aip:resource_robot",
    color: "§9",
    price: { item: "minecraft:gold_ingot", amount: 30, label: "Gold Ingots" },
    icon: "textures/items/gold_ingot",
    about:
      "A helper that gathers resources for you.\n\n" +
      "§a+§r Follows you around and gathers what you choose: wood, stone, ores or everything\n" +
      "§a+§r Chops real trees (not log houses) and mines with the right pickaxe, like a player\n" +
      "§a+§r Never mines next to lava: covers it with blocks or backs away\n" +
      "§a+§r Keeps ores and blocks in its slots; anything else it gathers goes to you\n" +
      "§a+§r 3 tool slots for harvesting/mining tools, used in order 1, 2, 3\n" +
      "§a+§r A sword slot and a bow slot (bow or crossbow) with 2 arrow slots: sword against mobs,\n" +
      "   and it only fights players with its bow or crossbow (it runs if it has none)\n" +
      "§a+§r Its own stack of torches to light up caves (refills itself)\n" +
      "§a+§r Armor slots, a shield slot and 2 block slots (bridges over ravines and lava, pillars up)\n" +
      "§a+§r 10 slots for valuables; ores it mines go straight in\n" +
      "§a+§r A blue recall robot to call it to you from anywhere\n" +
      "§a+§r Makes 10 cooked chicken every 10 minutes (up to 30) for you to take; eats its own to heal\n" +
      "§a+§r Fights back if something attacks it, backs off to heal when hurt\n" +
      "§a+§r Respawns next to you if it dies, and remembers who attacked it\n\n" +
      "§7Health: 20 (same as a player)   Damage: 3 + tool",
  },
  fighter: {
    title: "Fighter AI",
    egg: "aip:fighter_egg",
    robot: "aip:fighter_robot",
    color: "§c",
    price: { item: "minecraft:diamond", amount: 15, label: "Diamonds" },
    icon: "textures/items/diamond",
    about:
      "A bodyguard that fights for you.\n\n" +
      "§a+§r Follows you and protects you from mobs and players\n" +
      "§a+§r Goes after the most dangerous enemy first, and protects you first when you're hurt\n" +
      "§a+§r Attacks whatever you attack\n" +
      "§a+§r Backs off to heal when badly hurt\n" +
      "§a+§r Fighting styles: Sword Combat, Archer, or Archer then Combat\n" +
      "§a+§r Can hunt mobs and players, or only players\n" +
      "§a+§r 3 tool slots for fighting tools, used in order 1, 2, 3 (next one when a tool breaks)\n" +
      "§a+§r 2 arrow slots, so it can fight with a bow or crossbow\n" +
      "§a+§r Armor slots and a shield slot (it blocks hits from the front)\n" +
      "§a+§r 2 block slots: bridges over ravines and lava, pillars up, covers lava\n" +
      "§a+§r 10 slots for valuables (diamonds, gold, coal, netherite...)\n" +
      "§a+§r Breaks tombstones and takes the most valuable loot\n" +
      "§a+§r A red recall robot to call it to you from anywhere\n" +
      "§a+§r Makes 10 cooked chicken every 10 minutes (up to 30) for you to take; eats its own to heal\n" +
      "§a+§r Remembers players who attacked you, and never attacks your allies\n" +
      "§a+§r Can guard a spot and attack any other player who comes near\n" +
      "§a+§r Left click it (or its recall robot) and pick Attack a player to send it after someone\n" +
      "§a+§r Respawns next to you if it dies, and keeps its memory\n\n" +
      "§7Health: 20 (same as a player)   Damage: 6 + tool",
  },
};
const RESOURCE_FOCUS = FOCUSES; // Wood, Stone, Ores, Everything, Nothing

/** Fighter fighting styles. */
const COMBAT_STYLES = /** @type {const} */ ([
  { id: "sword", label: "Sword Combat", about: "Sprints at the enemy and keeps hitting with its melee tool" },
  { id: "archer", label: "Archer", about: "Shoots with a bow or crossbow from a distance (needs arrows)" },
  { id: "archer_sword", label: "Archer then Combat", about: "Fires a few arrows, then charges in with its melee tool" },
]);
/** Fighter target modes. */
const TARGET_MODES = /** @type {const} */ ([
  { id: "all", label: "Mob killing and player killing", about: "Hunts monsters and enemy players" },
  { id: "players", label: "Only player killing", about: "Ignores monsters unless they attack" },
]);

// The 10 looks (skin numbers aip:skin_0 ... aip:skin_9). An AI's look is picked automatically.
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

const GUIDE_TEXT =
  "§lStep 1: Craft a Coder§r\n" +
  "On a crafting table:\n" +
  "  Glass  -  Glass  -  Glass\n" +
  "  Iron  -  Redstone  -  Iron\n" +
  "  Iron  -  Iron  -  Iron\n" +
  "§7(Iron = Iron Ingot)§r\n\n" +
  "§lStep 2: Buy an AI at the Coder§r\n" +
  `- Resource AI: §6${ROLES.resource.price.amount} ${ROLES.resource.price.label}§r\n` +
  `- Fighter AI: §b${ROLES.fighter.price.amount} ${ROLES.fighter.price.label}§r\n` +
  "Each player can only have one of each. You type its name; it starts with full health and 10 cooked chicken.\n\n" +
  "§lStep 3: Throw the egg§r\n" +
  "You get an AI Egg. Use it to throw it, and your AI appears where it lands. The egg turns into a " +
  "§crecall robot§r (§9blue§r for the Resource AI): use it to bring your AI to you from anywhere.\n\n" +
  "§lControls§r\n" +
  "- §eLeft click§r your AI or its recall robot: commands (teleport to you, attack a player, follow/guard, " +
  "fighting style, targets, gather focus, allies & enemies)\n" +
  "- §eRight click§r your AI: its inventory, like a chest with labeled slots (right click the recall robot to bring it to you)\n" +
  "- Your AI feeds itself with its own cooked chicken when it's hurt\n\n" +
  "§lInventory§r\n" +
  "Food, tools 1-2-3 (used in order; next one when a tool breaks), armor, shield, 2 block slots " +
  "(no sand, gravel or other falling blocks; used to bridge, pillar and cover lava), 10 valuables slots, " +
  "and arrows. Drag items into the labeled slots; wrong items are handed back.\n\n" +
  "§lFighter settings§r (left click it to change)\n" +
  "Style: Sword Combat, Archer, or Archer then Combat. Targets: mobs and players, or only players.\n" +
  "Tombstones: it breaks tombstones near it and takes the most valuable loot (can be turned off).\n\n" +
  "§lFood§r\n" +
  `Each AI makes ${FOOD_RESERVED} cooked chicken every 10 minutes, up to ${FOOD_CAP}. ` +
  `The first ${FOOD_RESERVED} are its own (it eats them to heal); you and your allies can take the rest.\n\n` +
  "§lIf your AI dies§r\n" +
  `It respawns next to you after ${RESPAWN_SECONDS} seconds, and still remembers its enemies and allies.\n\n` +
  "§7Lost your egg? Open the Coder and pick your AI to get a new one.";

/** @param {import("@minecraft/server").Player} player @param {RoleId} role @param {AiRecord} record */
function giveEgg(player, role, record) {
  const egg = new ItemStack(ROLES[role].egg, 1);
  egg.nameTag = `§r${ROLES[role].title} Egg: §e${record.name}`;
  egg.setLore([`§7Owner: ${player.name}`, "§7Use it to throw it and spawn your AI."]);
  egg.setDynamicProperty("aip:owner", player.id);
  egg.setDynamicProperty("aip:serial", record.serial);
  giveItem(player, egg);
}

// ================================================================ startup: blocks

system.beforeEvents.startup.subscribe(({ blockComponentRegistry }) => {
  blockComponentRegistry.registerCustomComponent("aip:coder", {
    onPlayerInteract: ({ player }) => {
      if (player) system.run(() => openMenu(player, showCoder));
    },
  });
});

// Only one of our menus open per player at a time.
/** @type {Set<string>} */
const playersInMenu = new Set();

/**
 * @param {import("@minecraft/server").Player} player
 * @param {(player: import("@minecraft/server").Player) => Promise<void>} menu
 */
async function openMenu(player, menu) {
  if (playersInMenu.has(player.id)) return;
  playersInMenu.add(player.id);
  try {
    await menu(player);
  } finally {
    playersInMenu.delete(player.id);
  }
}

// ================================================================ guide

/** @param {import("@minecraft/server").Player} player */
async function showGuide(player) {
  await new ActionFormData().title("AI Computer: help").body(GUIDE_TEXT).button("Got it").show(player);
}

/**
 * The AI Computer's main screen: how to craft the Coder and what each AI costs
 * (red until you have enough, green when you do).
 * @param {import("@minecraft/server").Player} player
 */
async function showComputer(player) {
  const prices = ROLE_IDS.map((role) => {
    const { title, price } = ROLES[role];
    const owned = getRecord(player.id, role);
    if (owned) return `- ${title}: §2you have one (${owned.name})§r`;
    const have = countItem(player, price.item);
    const color = have >= price.amount ? "§a" : "§c";
    return `- ${title}: ${color}${price.amount} ${price.label}§r §7(you have ${have})§r`;
  });
  const response = await new ActionFormData()
    .title("AI Computer")
    .body(
      "§lCraft the AI crafter: the Coder§r\n" +
        "On a crafting table:\n" +
        "  Glass  -  Glass  -  Glass\n" +
        "  Iron Ingot  -  Redstone  -  Iron Ingot\n" +
        "  Iron Ingot  -  Iron Ingot  -  Iron Ingot\n\n" +
        "§lPlace the Coder and tap it to buy an AI§r\n" +
        prices.join("\n") +
        "\n\n§7Each player can only have one of each AI."
    )
    .button("More help")
    .button("Close")
    .show(player);
  if (response.selection === 0) await showGuide(player);
}

// Every time a player spawns: make sure they have an AI Computer (it's lost on death like any item).
// Every time a player spawns: bring back any AI that died while they were away.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (countItem(player, COMPUTER_ITEM) === 0) {
    giveItem(player, new ItemStack(COMPUTER_ITEM, 1));
    if (initialSpawn) player.sendMessage("§aYou have an §eAI Computer§a in your hotbar. Use it to see how to get AI players.");
  }
  system.runTimeout(() => {
    for (const role of ROLE_IDS) {
      if (getRecord(player.id, role)?.state === "respawn") respawnAi(player.id, role);
    }
  }, 40);
});

// ================================================================ Coder (shop)

/** @param {import("@minecraft/server").Player} player */
async function showCoder(player) {
  const form = new ActionFormData().title("Coder").body("Tap an AI to see what it does and what it costs.");
  for (const role of ROLE_IDS) {
    const info = ROLES[role];
    const owned = getRecord(player.id, role);
    const enough = countItem(player, info.price.item) >= info.price.amount;
    const line2 = owned ? `§2Yours: ${owned.name}` : `${enough ? "§2" : "§c"}${info.price.amount} ${info.price.label}`;
    form.button(`${info.title}\n${line2}`, info.icon);
  }
  form.button("How it works", "textures/items/book_writable");

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  if (response.selection >= ROLE_IDS.length) return showGuide(player);

  const role = ROLE_IDS[response.selection];
  if (getRecord(player.id, role)) {
    await manageOwned(player, role);
  } else {
    await showRoleInfo(player, role);
  }
}

/**
 * "You need 7 more Diamonds." Only how many more, nothing else.
 * @param {import("@minecraft/server").Player} player @param {RoleId} role
 */
function needMore(player, role) {
  const { price } = ROLES[role];
  return `§cYou need ${price.amount - countItem(player, price.item)} more ${price.label}.`;
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
async function showRoleInfo(player, role) {
  const info = ROLES[role];
  const have = countItem(player, info.price.item);
  const enough = have >= info.price.amount;

  const response = await new MessageFormData()
    .title(info.title)
    .body(
      `${info.about}\n\n§rCost: ${enough ? "§a" : "§c"}${info.price.amount} ${info.price.label}§r\n` +
        `You have: ${enough ? "§a" : "§c"}${have}`
    )
    .button1("Buy")
    .button2("Back")
    .show(player);
  if (response.canceled) return;
  if (response.selection === 1) return showCoder(player);
  if (!enough) {
    player.sendMessage(needMore(player, role));
    return;
  }
  await buy(player, role);
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
async function buy(player, role) {
  const info = ROLES[role];
  const look = autoLook(player.id, role);
  const name = await askForName(player, info.title);
  if (name === undefined) return;

  // Check again: the inventory may have changed while the menus were open.
  if (countItem(player, info.price.item) < info.price.amount) {
    player.sendMessage(needMore(player, role));
    return;
  }
  if (getRecord(player.id, role)) {
    player.sendMessage(`§cYou can only have one ${info.title}.`);
    return;
  }

  takeItem(player, info.price.item, info.price.amount);
  /** @type {AiRecord} */
  const record = { name, look, state: "egg", serial: Date.now(), mode: "follow", focus: "Everything", combat: "archer_sword", targets: "all" };
  inventoryOf(record).food = START_FOOD;
  saveRecord(player.id, role, record);
  giveEgg(player, role, record);
  player.sendMessage(`§aYou bought a ${info.title}! Throw the egg to spawn §e${name}§a.`);
}

/**
 * Picks the AI's look automatically: the same for a player every time (no choosing).
 * Add-ons can't read a player's own skin, so it uses one of the 10 AI player skins.
 * @param {string} playerId @param {RoleId} role
 */
function autoLook(playerId, role) {
  let hash = role === "fighter" ? 3 : 0;
  for (const ch of playerId) hash = (hash * 31 + ch.charCodeAt(0)) % 1000003;
  return hash % LOOKS.length;
}

/**
 * Keeps asking until the player types a name (or closes the form).
 * @param {import("@minecraft/server").Player} player @param {string} title
 * @returns {Promise<string | undefined>}
 */
async function askForName(player, title) {
  let warning = "";
  for (;;) {
    const response = await new ModalFormData()
      .title(`Name your ${title}`)
      .textField(`${warning}Name (shown above its head, up to ${MAX_NAME_LENGTH} letters)`, "Type a name")
      .show(player);
    if (response.canceled) return undefined;

    const name = String(response.formValues?.[0] ?? "").replace(/§/g, "").trim();
    if (name.length === 0) {
      warning = "§cYou have to type a name.§r\n";
    } else if (name.length > MAX_NAME_LENGTH) {
      warning = `§cThat name is too long (max ${MAX_NAME_LENGTH}).§r\n`;
    } else {
      return name;
    }
  }
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
async function manageOwned(player, role) {
  const info = ROLES[role];
  const record = getRecord(player.id, role);
  if (!record) return;

  const status = {
    egg: "Waiting in its egg. Throw the egg to spawn it.",
    thrown: "Its egg was thrown.",
    alive: "In the world.",
    respawn: "Respawning soon.",
  }[record.state];

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [];
  if (record.state === "alive" || record.state === "respawn") {
    if (record.state === "alive") actions.push({ label: "Call it to me", run: () => recallAi(player, role) });
    actions.push({
      label: "Get a new recall robot\n§8If you lost it",
      run: () => {
        const r = getRecord(player.id, role);
        if (r) giveItem(player, makeRecallRobot(player, role, r));
      },
    });
  } else {
    actions.push({ label: "Get a new egg (if you lost it)", run: () => replaceEgg(player, role) });
  }
  actions.push({ label: `§cDelete ${record.name}\n§8Removes the AI and its recall robot`, run: () => deleteAi(player, role) });

  const form = new ActionFormData().title(`${info.title}: ${record.name}`).body(status);
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
function replaceEgg(player, role) {
  const record = getRecord(player.id, role);
  if (!record || record.state === "alive") return;
  record.state = "egg";
  record.serial = Date.now(); // the old egg stops working
  saveRecord(player.id, role, record);
  giveEgg(player, role, record);
  player.sendMessage("§aHere's a new egg. Your old one won't work anymore.");
}


// ================================================================ throwing the egg

/** @type {Map<string, { ownerId: string, role: RoleId, thrownAt: number }>} */
const flyingEggs = new Map();

// Using the AI Computer shows how to craft the Coder and the prices.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack?.typeId !== COMPUTER_ITEM) return;
  system.run(() => openMenu(player, showComputer));
});

// Recall robot: right click (use) brings the AI next to you so you can right click it to open its
// inventory (Minecraft only opens an inventory screen when you right click the AI itself)...
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  const role = robotRole(player, itemStack);
  if (!role) return;
  const record = getRecord(player.id, role);
  const ai = record?.id ? world.getEntity(record.id) : undefined;
  const near = ai && ai.dimension.id === player.dimension.id &&
    Math.hypot(ai.location.x - player.location.x, ai.location.y - player.location.y, ai.location.z - player.location.z) < 4;
  if (!near) recallAi(player, role);
  if (record) player.sendMessage(`§eRight click ${record.name} to open its inventory.`);
});

// ...and left click (an attack swing) opens its commands.
world.afterEvents.playerSwingStart.subscribe(({ player, heldItemStack, swingSource }) => {
  if (swingSource !== EntitySwingSource.Attack) return;
  const role = robotRole(player, heldItemStack);
  if (role) system.run(() => openMenu(player, (p) => showCommands(p, role)));
});

/**
 * The role of the recall robot a player is holding (only their own).
 * @param {import("@minecraft/server").Player} player
 * @param {ItemStack | undefined} item
 * @returns {RoleId | undefined}
 */
function robotRole(player, item) {
  const role = ROLE_IDS.find((r) => ROLES[r].robot === item?.typeId);
  if (!role || !item) return undefined;
  if (item.getDynamicProperty("aip:owner") !== player.id) {
    player.sendMessage("§cThis recall robot doesn't belong to you.");
    return undefined;
  }
  return role;
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  const role = ROLE_IDS.find((r) => ROLES[r].egg === itemStack?.typeId);
  if (!role || !itemStack) return;

  const ownerId = itemStack.getDynamicProperty("aip:owner");
  const serial = itemStack.getDynamicProperty("aip:serial");
  if (ownerId !== player.id) {
    player.sendMessage("§cThis egg doesn't belong to you.");
    return;
  }
  const record = getRecord(player.id, role);
  if (!record || record.state !== "egg" || record.serial !== serial) {
    player.sendMessage("§cThis egg doesn't work anymore.");
    return;
  }

  // The egg leaves the player's hand and its slot gets the AI's recall robot.
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container?.getItem(player.selectedSlotIndex)?.typeId === itemStack.typeId) {
    container.setItem(player.selectedSlotIndex, makeRecallRobot(player, role, record));
  } else {
    giveItem(player, makeRecallRobot(player, role, record));
  }

  // Throw it.
  const view = player.getViewDirection();
  const head = player.getHeadLocation();
  const start = { x: head.x + view.x * 0.6, y: head.y + view.y * 0.6, z: head.z + view.z * 0.6 };
  const egg = player.dimension.spawnEntity(CAPSULE_ENTITY, start);
  egg.setDynamicProperty("aip:owner", player.id);
  egg.setDynamicProperty("aip:role", role);
  const projectile = egg.getComponent("minecraft:projectile");
  if (projectile) {
    projectile.owner = player;
    projectile.shoot({ x: view.x * 1.3, y: view.y * 1.3 + 0.1, z: view.z * 1.3 });
  }

  record.state = "thrown";
  saveRecord(player.id, role, record);
  flyingEggs.set(egg.id, { ownerId: player.id, role, thrownAt: Date.now() });
});

world.afterEvents.projectileHitBlock.subscribe(({ projectile, location, hitVector, dimension }) => {
  if (projectile.typeId !== CAPSULE_ENTITY) return;
  // Step back a little from the block so the AI doesn't spawn inside it.
  hatch(projectile, { x: location.x - hitVector.x * 0.5, y: location.y + 0.1, z: location.z - hitVector.z * 0.5 }, dimension);
});

world.afterEvents.projectileHitEntity.subscribe(({ projectile, location, dimension }) => {
  if (projectile.typeId !== CAPSULE_ENTITY) return;
  hatch(projectile, location, dimension);
});

/**
 * The egg landed: spawn the AI there.
 * @param {import("@minecraft/server").Entity} egg
 * @param {import("@minecraft/server").Vector3} location
 * @param {import("@minecraft/server").Dimension} dimension
 */
function hatch(egg, location, dimension) {
  const saved = flyingEggs.get(egg.id);
  const info = saved ?? (egg.isValid ? ownerInfo(egg) : undefined);
  flyingEggs.delete(egg.id);
  if (egg.isValid) egg.remove();
  if (!info) return;

  const record = getRecord(info.ownerId, info.role);
  if (record?.state !== "thrown") return;
  const owner = findPlayer(info.ownerId);
  if (!owner) {
    // Owner left while the egg was flying: spawn it next to them when they're back.
    record.state = "respawn";
    saveRecord(info.ownerId, info.role, record);
    return;
  }
  spawnAi(owner, info.role, location, dimension);
}

// ================================================================ recall robots

/**
 * The recall robot that replaces the egg: red for the Fighter, blue for the Resource AI.
 * @param {import("@minecraft/server").Player} player @param {RoleId} role @param {AiRecord} record
 */
function makeRecallRobot(player, role, record) {
  const robot = new ItemStack(ROLES[role].robot, 1);
  robot.nameTag = `§r${ROLES[role].color}${record.name}'s Recall Robot`;
  robot.setLore([`§7Owner: ${player.name}`, "§7Left click: commands and teleport", "§7Right click: inventory"]);
  robot.setDynamicProperty("aip:owner", player.id);
  return robot;
}

/**
 * Brings the AI to the player. If it's too far away to be loaded, it rejoins next to the player
 * (with everything it carries), and the old copy disappears when its area loads.
 * @param {import("@minecraft/server").Player} player @param {RoleId} role
 */
function recallAi(player, role) {
  const record = getRecord(player.id, role);
  if (!record) return;
  if (record.state === "egg" || record.state === "thrown") {
    player.sendMessage("§eThrow its egg first.");
    return;
  }
  if (record.state === "respawn") {
    player.sendMessage(`§e${record.name} is respawning and will appear next to you.`);
    return;
  }
  const ai = record.id ? world.getEntity(record.id) : undefined;
  if (ai) {
    ai.teleport(player.location, { dimension: player.dimension });
  } else if (!spawnAi(player, role, player.location, player.dimension, true)) {
    return;
  }
  player.sendMessage(`§a${record.name} teleported to you.`);
}

/**
 * Deletes the AI and its recall robot (after asking). Everything it carries is given back, except
 * its own 10 chicken and its torches. You can buy a new one after that.
 * @param {import("@minecraft/server").Player} player @param {RoleId} role
 */
async function deleteAi(player, role) {
  const record = getRecord(player.id, role);
  if (!record) return;
  const confirm = await new MessageFormData()
    .title(`Delete ${record.name}?`)
    .body(
      `${record.name} and its recall robot will be gone for good. You get back everything it carries, ` +
        `but not the ${ROLES[role].price.amount} ${ROLES[role].price.label} you paid.`
    )
    .button1("Delete")
    .button2("Keep")
    .show(player);
  if (confirm.selection !== 0) return;

  const latest = getRecord(player.id, role);
  if (!latest) return;
  returnEverything(player, latest);
  saveRecord(player.id, role, undefined);
  const ai = latest.id ? world.getEntity(latest.id) : undefined;
  ai?.remove();

  // Take its recall robot (and any unthrown egg) out of the player's inventory.
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container) {
    for (let i = 0; i < container.size; i++) {
      const id = container.getItem(i)?.typeId;
      if (id === ROLES[role].robot || id === ROLES[role].egg) container.setItem(i, undefined);
    }
  }
  world.sendMessage(`§e${latest.name} left the game`);
}

// ================================================================ spawning & respawning

/**
 * @param {import("@minecraft/server").Player} owner
 * @param {RoleId} role
 * @param {import("@minecraft/server").Vector3} location
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {boolean} [quiet]  true for a recall (no "joined the game")
 */
function spawnAi(owner, role, location, dimension, quiet = false) {
  const record = getRecord(owner.id, role);
  if (!record) return false;

  const ai = dimension.spawnEntity(AI_ENTITY, location);
  const tameable = ai.getComponent("minecraft:tameable");
  if (!tameable || !tameable.tame(owner)) {
    ai.remove();
    // Give the egg back so nothing is lost.
    record.state = "egg";
    record.serial = Date.now();
    saveRecord(owner.id, role, record);
    giveEgg(owner, role, record);
    owner.sendMessage("§cYour AI couldn't spawn there. You got your egg back.");
    return false;
  }

  ai.setDynamicProperty("aip:owner", owner.id);
  ai.setDynamicProperty("aip:role", role);
  knownAis.set(ai.id, { ownerId: owner.id, role });
  ai.triggerEvent("aip:on_tame");
  ai.triggerEvent(`aip:role_${role}`);
  ai.triggerEvent(role === "fighter" ? "aip:fighter_follow" : "aip:resource_follow");
  ai.triggerEvent(`aip:skin_${record.look}`);
  ai.nameTag = record.name;

  // Start at full health (a moment later, after its role has set its max health).
  system.runTimeout(() => {
    const health = ai.isValid ? ai.getComponent("minecraft:health") : undefined;
    health?.setCurrentValue(health.effectiveMax);
  }, 2);

  record.state = "alive";
  record.id = ai.id;
  record.mode = "follow";
  delete record.post;
  saveRecord(owner.id, role, record);
  if (!quiet) world.sendMessage(`§e${record.name} joined the game`);
  return true;
}

/** @param {string} ownerId @param {RoleId} role */
function respawnAi(ownerId, role) {
  const record = getRecord(ownerId, role);
  const owner = findPlayer(ownerId);
  // If the owner is offline or dead, this runs again when they next spawn.
  if (record?.state !== "respawn" || !owner) return;
  if ((owner.getComponent("minecraft:health")?.currentValue ?? 0) <= 0) return;
  spawnAi(owner, role, owner.location, owner.dimension);
}

world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    let info;
    let id;
    try {
      id = deadEntity.id;
      info = knownAis.get(id) ?? ownerInfo(deadEntity);
    } catch {
      return;
    }
    knownAis.delete(id);
    if (!info) return;
    const record = getRecord(info.ownerId, info.role);
    if (!record || record.id !== id) return; // an old or dismissed AI

    record.state = "respawn";
    delete record.id;
    saveRecord(info.ownerId, info.role, record);

    const owner = findPlayer(info.ownerId);
    world.sendMessage(`§e${record.name} died`);
    owner?.sendMessage(`§7${record.name} will respawn next to you in ${RESPAWN_SECONDS} seconds.`);
    system.runTimeout(() => respawnAi(info.ownerId, info.role), RESPAWN_SECONDS * 20);
  },
  { entityTypes: [AI_ENTITY] }
);

// ================================================================ left click & right click

// Your own hits never hurt your AI: a left click opens its commands instead.
world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.hurtEntity.typeId !== AI_ENTITY) return;
  const attacker = event.damageSource.damagingEntity;
  const info = ownerInfo(event.hurtEntity);
  if (!attacker || !info || attacker.id !== info.ownerId) return;
  event.cancel = true;
  if (event.damageSource.cause === EntityDamageCause.entityAttack) {
    const player = /** @type {import("@minecraft/server").Player} */ (attacker);
    system.run(() => openMenu(player, (p) => showCommands(p, info.role)));
  }
});

// Left click your AI: commands. (openMenu makes sure only one menu opens.)
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity.typeId !== "minecraft:player" || hitEntity.typeId !== AI_ENTITY) return;
  const info = ownerInfo(hitEntity);
  if (!info || info.ownerId !== damagingEntity.id) return;
  const player = /** @type {import("@minecraft/server").Player} */ (damagingEntity);
  system.run(() => openMenu(player, (p) => showCommands(p, info.role)));
});

// Right click your AI: Minecraft opens its inventory screen (owner only; see container.js).
// Allies of the owner can't open it, but right clicking lets them take spare chicken.
world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (target.typeId !== AI_ENTITY) return;
  const info = ownerInfo(target);
  if (info && info.ownerId !== player.id && getMemory(info.ownerId).allies[player.id]) {
    system.run(() => openMenu(player, (p) => takeFood(p, info.ownerId, info.role)));
  }
});

// ================================================================ commands (left click)

/**
 * Everything you can tell your AI to do. Opened by left clicking the AI or its recall robot.
 * @param {import("@minecraft/server").Player} player
 * @param {RoleId} role
 */
async function showCommands(player, role) {
  const record = getRecord(player.id, role);
  if (!record) {
    player.sendMessage(`§eYou don't have a ${ROLES[role].title} anymore.`);
    return;
  }
  const ai = record.id ? world.getEntity(record.id) : undefined;

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [{ label: "Teleport to me", run: () => recallAi(player, role) }];
  let body = "";
  const needAi = (/** @type {(ai: import("@minecraft/server").Entity) => unknown} */ fn) => () =>
    ai?.isValid ? fn(ai) : player.sendMessage(`§e${record.name} is too far away. Teleport it to you first.`);

  if (role === "fighter") {
    const mode = record.mode === "guard" ? "Guarding a spot" : "Following and protecting you";
    const style = COMBAT_STYLES.find((c) => c.id === (record.combat ?? "archer_sword")) ?? COMBAT_STYLES[2];
    const targets = TARGET_MODES.find((t) => t.id === (record.targets ?? "all")) ?? TARGET_MODES[0];
    body = `Right now: §e${mode}§r\nStyle: §e${style.label}§r\nTargets: §e${targets.label}§r`;
    actions.push({ label: "Attack a player", run: needAi((a) => chooseAttackTarget(player, a)) });
    actions.push({ label: "Follow and protect me", run: needAi((a) => setFighterMode(player, a, "follow")) });
    actions.push({ label: "Guard this spot\n§8Attacks any other player who comes near", run: needAi((a) => setFighterMode(player, a, "guard")) });
    actions.push({ label: `Fighting style\n§8${style.label}`, run: () => chooseCombat(player) });
    actions.push({ label: `Targets\n§8${targets.label}`, run: () => chooseTargets(player) });
    actions.push({ label: `Tombstones\n§8Looting ${record.loot === false ? "off" : "on"}`, run: () => showTombs(player) });
  } else {
    body = "Choose resource";
    for (const focus of RESOURCE_FOCUS) {
      actions.push({
        label: focus === record.focus ? `§2${focus} (current)` : focus,
        run: () => {
          const r = getRecord(player.id, role);
          if (!r) return;
          r.focus = focus;
          saveRecord(player.id, role, r);
          toolsChanged(r.id);
          player.sendMessage(focus === "Nothing" ? `§e${r.name} will just follow you.` : `§e${r.name} will gather: ${focus}`);
        },
      });
    }
  }
  actions.push({ label: "Allies & enemies", run: () => showMemory(player) });
  actions.push({ label: `§cDelete ${record.name}\n§8Removes the AI and its recall robot`, run: () => deleteAi(player, role) });

  const form = new ActionFormData().title(`${ROLES[role].color}${record.name}§r (${ROLES[role].title})`).body(body);
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}

/**
 * Pick a player for the Fighter to go after.
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").Entity} ai
 */
async function chooseAttackTarget(player, ai) {
  const allies = getMemory(player.id).allies;
  const choices = world
    .getPlayers()
    .filter((p) => p.id !== player.id && !allies[p.id] && p.dimension.id === ai.dimension.id)
    .filter((p) => Math.hypot(p.location.x - ai.location.x, p.location.z - ai.location.z) <= 64);
  if (choices.length === 0) {
    player.sendMessage("§eThere are no other players near your Fighter (allies don't count).");
    return;
  }
  const form = new ActionFormData().title("Attack a player").body("Your Fighter goes after them, even if it's fighting someone else.");
  choices.forEach((p) => form.button(p.name));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  commandAttack(player, ai, choices[response.selection]);
}

/**
 * Fighter tombstone settings: looting on/off, and teaching it tombstones from another add-on.
 * @param {import("@minecraft/server").Player} player
 */
async function showTombs(player) {
  const record = getRecord(player.id, "fighter");
  if (!record) return;
  const types = tombTypes();
  const known = [...types.blocks, ...types.entities];
  const response = await new ActionFormData()
    .title("Tombstones")
    .body(
      `Looting: §e${record.loot === false ? "off" : "on"}§r\n\n` +
        `When it isn't fighting, ${record.name} breaks tombstones near it and takes the most valuable ` +
        "items first (valuables, better armor and tools, arrows, blocks). The rest stays on the ground.\n\n" +
        `Tombstones it knows: ${known.length ? known.join(", ") : "§cnone yet§r"}\n\n` +
        "§7If it doesn't recognize your tombstones, stand next to one and tap Teach."
    )
    .button(record.loot === false ? "Turn looting on" : "Turn looting off")
    .button("Teach: a tombstone next to me")
    .button("Forget taught tombstones")
    .show(player);
  if (response.canceled) return;
  if (response.selection === 0) {
    record.loot = record.loot === false;
    saveRecord(player.id, "fighter", record);
    player.sendMessage(`§e${record.name}: tombstone looting ${record.loot ? "on" : "off"}.`);
  } else if (response.selection === 1) {
    const things = addOnThingsNear(player);
    if (things.length === 0) {
      player.sendMessage("§eNo add-on blocks or entities right next to you. Stand next to a tombstone and try again.");
      return;
    }
    const pick = new ActionFormData().title("Which one is the tombstone?");
    things.forEach((id) => pick.button(id));
    const choice = await pick.show(player);
    if (choice.canceled || choice.selection === undefined) return;
    setTaught([...getTaught(), things[choice.selection]]);
    player.sendMessage(`§aYour Fighter AIs will now break and loot: ${things[choice.selection]}`);
  } else if (response.selection === 2) {
    setTaught([]);
    player.sendMessage("§eForgot all taught tombstones (ones with grave/tomb in their name still count).");
  }
}

/** @param {import("@minecraft/server").Player} player */
async function chooseCombat(player) {
  const record = getRecord(player.id, "fighter");
  if (!record) return;
  const form = new ActionFormData()
    .title("Fighting style")
    .body("All styles back off to heal at 30% health.");
  COMBAT_STYLES.forEach((c) => form.button(`${c.id === record.combat ? "§2" : ""}${c.label}\n§8${c.about}`));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const choice = COMBAT_STYLES[response.selection];
  record.combat = choice.id;
  saveRecord(player.id, "fighter", record);
  toolsChanged(record.id);
  player.sendMessage(`§e${record.name}: ${choice.label}.`);
}

/** @param {import("@minecraft/server").Player} player */
async function chooseTargets(player) {
  const record = getRecord(player.id, "fighter");
  if (!record) return;
  const form = new ActionFormData()
    .title("Targets")
    .body("Either way it protects you, attacks whatever you attack, and goes after remembered enemies.");
  TARGET_MODES.forEach((t) => form.button(`${t.id === record.targets ? "§2" : ""}${t.label}\n§8${t.about}`));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const choice = TARGET_MODES[response.selection];
  record.targets = choice.id;
  saveRecord(player.id, "fighter", record);
  player.sendMessage(`§e${record.name}: ${choice.label}.`);
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").Entity} ai
 * @param {"follow" | "guard"} mode
 */
function setFighterMode(player, ai, mode) {
  const record = getRecord(player.id, "fighter");
  if (!record) return;
  record.mode = mode;
  if (mode === "guard") {
    record.post = { x: ai.location.x, y: ai.location.y, z: ai.location.z, dim: ai.dimension.id };
    ai.triggerEvent("aip:fighter_guard");
    player.sendMessage(`§e${record.name} is guarding this spot.`);
  } else {
    delete record.post;
    ai.triggerEvent("aip:fighter_follow");
    player.sendMessage(`§e${record.name} will follow and protect you.`);
  }
  saveRecord(player.id, "fighter", record);
}

// ================================================================ items


/**
 * Take cooked chicken from an AI's food slot (only what's above its own 10).
 * @param {import("@minecraft/server").Player} player
 * @param {string} ownerId
 * @param {RoleId} role
 */
async function takeFood(player, ownerId, role) {
  let record = getRecord(ownerId, role);
  if (!record) return;
  const takeable = takeableFood(record);
  if (takeable <= 0) {
    const next = minutesToNextFood(record);
    player.sendMessage(
      `§e${record.name} has no chicken to spare yet` + (next === undefined ? "." : ` (more in about ${next} min).`)
    );
    return;
  }
  let amount = takeable;
  if (takeable > 1) {
    const response = await new ModalFormData()
      .title(`Take chicken from ${record.name}`)
      .slider("How many?", 1, takeable, { valueStep: 1, defaultValue: takeable })
      .show(player);
    if (response.canceled) return;
    amount = Number(response.formValues?.[0] ?? takeable);
  }
  // Read again: someone else may have taken some while the menu was open.
  record = getRecord(ownerId, role);
  if (!record) return;
  amount = Math.min(amount, takeableFood(record));
  if (amount <= 0) return;
  inventoryOf(record).food -= amount;
  saveRecord(ownerId, role, record);
  giveItem(player, new ItemStack(FOOD_ITEM, amount));
  player.sendMessage(`§aYou took ${amount} cooked chicken from ${record.name}.`);
}















/** @param {import("@minecraft/server").Player} player @param {string} id @param {number} total */
function giveStacks(player, id, total) {
  const max = new ItemStack(id, 1).maxAmount;
  while (total > 0) {
    const n = Math.min(max, total);
    giveItem(player, new ItemStack(id, n));
    total -= n;
  }
}




/** @param {import("@minecraft/server").Player} player @param {number} total */
function giveArrows(player, total) {
  while (total > 0) {
    const n = Math.min(64, total);
    giveItem(player, new ItemStack(ARROW_ITEM, n));
    total -= n;
  }
}

/** When an AI is dismissed: everything it carries goes back to the owner (except its own 10 chicken and its torches). */
/** @param {import("@minecraft/server").Player} player @param {AiRecord} record */
function returnEverything(player, record) {
  const inv = inventoryOf(record);
  for (const tool of inv.tools) if (tool) giveItem(player, stackFromTool(tool));
  for (const piece of [...ARMOR_SLOTS.map((slot) => inv.armor[slot]), inv.shield]) if (piece) giveItem(player, stackFromTool(piece));
  for (const b of inv.blocks) if (b) giveStacks(player, b.id, b.count);
  for (const v of inv.valuables) if (v) giveStacks(player, v.id, v.count);
  for (const arm of [inv.arms.sword, inv.arms.bow]) if (arm) giveItem(player, stackFromTool(arm));
  for (const [id, n] of Object.entries(inv.bag)) if (n > 0) giveStacks(player, id, n);
  giveArrows(player, totalArrows(record));
  const food = takeableFood(record);
  if (food > 0) giveItem(player, new ItemStack(FOOD_ITEM, food));
}

// ================================================================ allies & enemies

/** Both of a player's AIs share one memory, kept even when they die. */
/** @param {import("@minecraft/server").Player} player */
async function showMemory(player) {
  const memory = getMemory(player.id);
  const enemies = Object.entries(memory.enemies);
  const allies = Object.entries(memory.allies);
  const list = (/** @type {string[]} */ names) => (names.length ? names.join(", ") : "§7none§r");

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [{ label: "Add an ally", run: () => addAlly(player) }];
  if (allies.length) actions.push({ label: "Remove an ally", run: () => removeAlly(player) });
  if (enemies.length) actions.push({ label: "Forgive an enemy", run: () => forgiveEnemy(player) });

  const form = new ActionFormData()
    .title("Allies & enemies")
    .body(
      `§cEnemies§r (attacked you or your AIs, so your Fighter goes after them):\n${list(
        enemies.map(([, e]) => `${e.name} (x${e.times})`)
      )}\n\n§aAllies§r (your AIs never attack them or their AIs):\n${list(allies.map(([, name]) => name))}`
    );
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}

/** @param {import("@minecraft/server").Player} player */
async function addAlly(player) {
  const memory = getMemory(player.id);
  const choices = world.getPlayers().filter((p) => p.id !== player.id && !memory.allies[p.id]);
  if (choices.length === 0) {
    player.sendMessage("§7There's nobody online to add as an ally right now.");
    return;
  }
  const form = new ActionFormData().title("Add an ally").body("Your AIs will never attack this player.");
  choices.forEach((p) => form.button(p.name));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const ally = choices[response.selection];
  memory.allies[ally.id] = ally.name;
  delete memory.enemies[ally.id];
  saveMemory(player.id, memory);
  player.sendMessage(`§a${ally.name} is now your ally. Your AIs will never attack them.`);
}

/** @param {import("@minecraft/server").Player} player */
async function removeAlly(player) {
  const memory = getMemory(player.id);
  const allies = Object.entries(memory.allies);
  const form = new ActionFormData().title("Remove an ally");
  allies.forEach(([, name]) => form.button(name));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const [id, name] = allies[response.selection];
  delete memory.allies[id];
  saveMemory(player.id, memory);
  player.sendMessage(`§e${name} is no longer your ally.`);
}

/** @param {import("@minecraft/server").Player} player */
async function forgiveEnemy(player) {
  const memory = getMemory(player.id);
  const enemies = Object.entries(memory.enemies);
  const form = new ActionFormData().title("Forgive an enemy").button("§cForgive everyone");
  enemies.forEach(([, e]) => form.button(`${e.name} (attacked x${e.times})`));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  if (response.selection === 0) {
    memory.enemies = {};
    player.sendMessage("§eYour AIs forgave everyone.");
  } else {
    const [id, e] = enemies[response.selection - 1];
    delete memory.enemies[id];
    player.sendMessage(`§eYour AIs forgave ${e.name}.`);
  }
  saveMemory(player.id, memory);
}

// ================================================================ food

// Every 10 seconds: each AI makes 10 cooked chicken per 10 minutes of game time, up to 30.
system.runInterval(() => {
  for (const key of world.getDynamicPropertyIds()) {
    const match = /^aip:ai:(.+):(resource|fighter)$/.exec(key);
    if (!match) continue;
    const [, ownerId, role] = match;
    const record = getRecord(ownerId, /** @type {RoleId} */ (role));
    if (!record) continue;
    if (record.state === "egg" || record.state === "thrown") {
      // Not in the world yet: the 10-minute timer starts when it first joins.
      inventoryOf(record).foodAt = world.getAbsoluteTime();
      saveRecord(ownerId, /** @type {RoleId} */ (role), record);
      continue;
    }
    const added = generateFood(record);
    saveRecord(ownerId, /** @type {RoleId} */ (role), record);
    if (added > 0) {
      findPlayer(ownerId)?.sendMessage(
        `§7${record.name} made ${added} cooked chicken (${inventoryOf(record).food}/${FOOD_CAP}, §a${takeableFood(record)} you can take§7).`
      );
    }
  }
}, 200);

// ================================================================ every second

system.runInterval(() => {
  // Eggs that never landed (thrown into the sky or the void): hatch where they are.
  for (const [eggId, egg] of flyingEggs) {
    if (Date.now() - egg.thrownAt < 8000) continue;
    const entity = world.getEntity(eggId);
    const owner = findPlayer(egg.ownerId);
    if (entity) {
      hatch(entity, entity.location, entity.dimension);
    } else {
      flyingEggs.delete(eggId);
      const record = getRecord(egg.ownerId, egg.role);
      if (record?.state !== "thrown") continue;
      if (owner) {
        spawnAi(owner, egg.role, owner.location, owner.dimension);
      } else {
        record.state = "respawn";
        saveRecord(egg.ownerId, egg.role, record);
      }
    }
  }
}, 20);
