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
  getAi,
  saveRecord,
  removeAi,
  newKey,
  allAis,
  controlledBy,
  hasBought,
  markBought,
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
import "./chest.js"; // Computer Chest (upgraded AIs' inventories from anywhere)
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
const RESPAWN_SECONDS = 60;
const START_FOOD = 10; // cooked chicken every AI comes with (it eats them to heal itself)

/** Upgrades at the Coder. */
/** @type {Record<RoleId, { item: string, amount: number, label: string, about: string }>} */
const UPGRADES = {
  resource: {
    item: "minecraft:diamond",
    amount: 10,
    label: "Diamonds",
    about:
      "§a+§r Strip mining: it digs a tunnel straight to diamonds (or netherite in the Nether) and mines them\n" +
      "§a+§r Can't be hurt by lava or fire (no potion bubbles), and takes no fall damage\n" +
      "§a+§r Its inventory can be opened from a Computer Chest",
  },
  fighter: {
    item: "minecraft:netherite_ingot",
    amount: 10,
    label: "Netherite Ingots",
    about:
      "§a+§r Can't be hurt by lava or fire (no potion bubbles), and takes no fall damage\n" +
      "§a+§r Its inventory can be opened from a Computer Chest",
  },
};

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
      "A helper that gathers resources for you. It never fights, and mobs can't hurt it.\n\n" +
      "§a+§r Two directions: strictly follow you, or wander and get what you choose (wood, stone, ores...)\n" +
      "§a+§r Chops real trees (not log houses) and mines with the right pickaxe, like a player\n" +
      "§a+§r Never mines next to lava: covers it with blocks or backs away\n" +
      "§a+§r Keeps ores and blocks in its slots; anything else it gathers goes to you\n" +
      "§a+§r 3 tool slots for harvesting/mining tools, used in order 1, 2, 3\n" +
      "§a+§r Its own stack of torches: places one about every 10 blocks underground (refills itself)\n" +
      "§a+§r Armor slots, a shield slot and 2 block slots (bridges over ravines and lava, pillars up)\n" +
      "§a+§r 10 slots for valuables; ores it mines go straight in\n" +
      "§a+§r A blue recall robot to call it to you from anywhere\n" +
      "§a+§r Makes 10 cooked chicken every 10 minutes (up to 30) for you to take; eats its own to heal\n" +
      "§a+§r Runs away from players who attack it\n" +
      "§a+§r Respawns near the player who bought it 60 seconds after dying\n" +
      "§a+§r Upgrade it at the Coder (10 diamonds): strip mines to diamonds/netherite, lava and fall proof\n\n" +
      "§7Health: 20 (same as a player)",
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
      "§a+§r Backs off to heal when badly hurt. Mobs and explosions can't hurt it\n" +
      "§a+§r Fighting: Sword Combat, Bow Only (25 blocks, aims ahead), or Bow and Sword Combat\n" +
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
      "§a+§r Respawns near the player who bought it 60 seconds after dying, and keeps its memory\n" +
      "§a+§r Upgrade it at the Coder (10 netherite ingots): lava and fall proof, Computer Chest access\n\n" +
      "§7Health: 20 (same as a player)   Damage: 6 + tool",
  },
};
const RESOURCE_FOCUS = FOCUSES; // Wood, Stone, Ores, Everything, Nothing

/** Fighter fighting styles. */
const COMBAT_STYLES = /** @type {const} */ ([
  { id: "sword", label: "Sword Combat", about: "Sprints at the enemy and keeps hitting with its sword" },
  { id: "archer", label: "Bow Only", about: "Shoots from up to 25 blocks, aiming ahead of moving targets" },
  { id: "archer_sword", label: "Bow and Sword Combat", about: "One arrow from 20 blocks, then runs in with its sword" },
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
  "Each player can only buy one of each. You type its name; it starts with full health and 10 cooked chicken. " +
  "Give your recall robot to a friend (drop it) and they control your AI; it doesn't let anyone buy extra.\n\n" +
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
  "Fighting: Sword Combat, Bow Only, or Bow and Sword Combat. Targets: mobs and players, or only players.\n" +
  "Tombstones: it breaks tombstones near it and takes the most valuable loot (can be turned off).\n\n" +
  "§lFood§r\n" +
  `Each AI makes ${FOOD_RESERVED} cooked chicken every 10 minutes, up to ${FOOD_CAP}. ` +
  `The first ${FOOD_RESERVED} are its own (it eats them to heal); you and your allies can take the rest.\n\n` +
  "§lIf your AI dies§r\n" +
  `It respawns near the player who bought it after ${RESPAWN_SECONDS} seconds, and still remembers its enemies and allies.\n\n` +
  "§7Lost your egg? Open the Coder and pick your AI to get a new one.";


/** @param {import("@minecraft/server").Player} player @param {AiRecord} record */
function giveEgg(player, record) {
  const egg = new ItemStack(ROLES[record.role].egg, 1);
  egg.nameTag = `§r${ROLES[record.role].title} Egg: §e${record.name}`;
  egg.setLore([`§7Bought by: ${player.name}`, "§7Use it to throw it and spawn your AI."]);
  egg.setDynamicProperty("aip:key", record.key);
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

/**
 * The AI with this key, if this player controls it.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
function mine(player, key) {
  const record = getAi(key);
  return record && record.ownerId === player.id ? record : undefined;
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
    if (hasBought(player.id, role)) return `- ${title}: §7you already bought one§r`;
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
        "\n\n§lUpgrades§r (at the Coder): Resource AI §b10 Diamonds§r, Fighter AI §b10 Netherite Ingots§r\n" +
        "§lComputer Chest§r: chest + redstone + glass pane. Opens your upgraded AIs' inventories from anywhere.\n\n" +
        "§7Each player can only buy one of each AI. If someone gives you their recall robot, you control their AI too."
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
    for (const record of allAis()) {
      if (record.state === "respawn" && (record.ownerId === player.id || record.buyerId === player.id)) respawnAi(record.key);
    }
  }, 40);
});

// ================================================================ Coder (shop)


/** @param {import("@minecraft/server").Player} player */
async function showCoder(player) {
  const form = new ActionFormData().title("Coder").body("Tap an AI to see what it does and what it costs.\n§7Each player can only buy one of each.");
  for (const role of ROLE_IDS) {
    const info = ROLES[role];
    const controlled = controlledBy(player.id, role);
    const enough = countItem(player, info.price.item) >= info.price.amount;
    const line2 = controlled.length
      ? `§2Yours: ${controlled.map((r) => r.name).join(", ")}`
      : hasBought(player.id, role)
        ? "§7Already bought"
        : `${enough ? "§2" : "§c"}${info.price.amount} ${info.price.label}`;
    form.button(`${info.title}\n${line2}`, info.icon);
  }
  form.button("How it works", "textures/items/book_writable");

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  if (response.selection >= ROLE_IDS.length) return showGuide(player);

  const role = ROLE_IDS[response.selection];
  const controlled = controlledBy(player.id, role);
  if (controlled.length === 1) return manageOwned(player, controlled[0].key);
  if (controlled.length > 1) {
    const pick = new ActionFormData().title(`Your ${ROLES[role].title}s`);
    controlled.forEach((r) => pick.button(r.name));
    const choice = await pick.show(player);
    if (choice.canceled || choice.selection === undefined) return;
    return manageOwned(player, controlled[choice.selection].key);
  }
  if (hasBought(player.id, role)) {
    player.sendMessage(`§cEach player can only buy one ${ROLES[role].title}, and you already bought yours.`);
    return;
  }
  await showRoleInfo(player, role);
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
  if (hasBought(player.id, role)) {
    player.sendMessage(`§cEach player can only buy one ${info.title}.`);
    return;
  }

  takeItem(player, info.price.item, info.price.amount);
  markBought(player.id, role);
  /** @type {AiRecord} */
  const record = {
    key: newKey(), role, ownerId: player.id, buyerId: player.id,
    name, look, state: "egg", serial: Date.now(), mode: "follow", focus: "Everything", combat: "archer_sword", targets: "all",
  };
  inventoryOf(record).food = START_FOOD;
  saveRecord(player.id, role, record);
  giveEgg(player, record);
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


/** @param {import("@minecraft/server").Player} player @param {string} key */
async function manageOwned(player, key) {
  const record = mine(player, key);
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
    if (record.state === "alive") actions.push({ label: "Call it to me", run: () => recallAi(player, key) });
    actions.push({
      label: "Get a new recall robot\n§8If you lost it",
      run: () => {
        const r = mine(player, key);
        if (r) giveItem(player, makeRecallRobot(player, r));
      },
    });
  } else {
    actions.push({ label: "Get a new egg (if you lost it)", run: () => replaceEgg(player, key) });
  }
  if (!record.upgraded) {
    const up = UPGRADES[record.role];
    const enough = countItem(player, up.item) >= up.amount;
    actions.push({ label: `Upgrade\n${enough ? "§2" : "§c"}${up.amount} ${up.label}`, run: () => upgradeAi(player, key) });
  }
  actions.push({ label: `§cDelete ${record.name}\n§8Removes the AI and its recall robot`, run: () => deleteAi(player, key) });

  const form = new ActionFormData()
    .title(`${ROLES[record.role].title}: ${record.name}`)
    .body(`${status}${record.upgraded ? "\n§bUpgraded" : ""}`);
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}


/**
 * The upgrade at the Coder: shows what it does and its price (red until you have enough).
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function upgradeAi(player, key) {
  const record = mine(player, key);
  if (!record || record.upgraded) return;
  const up = UPGRADES[record.role];
  const have = countItem(player, up.item);
  const enough = have >= up.amount;
  const response = await new MessageFormData()
    .title(`Upgrade ${record.name}`)
    .body(`${up.about}\n\n§rCost: ${enough ? "§a" : "§c"}${up.amount} ${up.label}§r\nYou have: ${enough ? "§a" : "§c"}${have}`)
    .button1("Upgrade")
    .button2("Back")
    .show(player);
  if (response.selection !== 0) return;
  if (countItem(player, up.item) < up.amount) {
    player.sendMessage(`§cYou need ${up.amount - countItem(player, up.item)} more ${up.label}.`);
    return;
  }
  const latest = mine(player, key);
  if (!latest || latest.upgraded) return;
  takeItem(player, up.item, up.amount);
  latest.upgraded = true;
  saveRecord(player.id, latest.role, latest);
  toolsChanged(latest.id);
  player.sendMessage(
    `§b${latest.name} is upgraded!` +
      (latest.role === "resource" ? " §fLeft click it and pick Strip mine." : " §fIts inventory now works with a Computer Chest.")
  );
}

/** @param {import("@minecraft/server").Player} player @param {string} key */
function replaceEgg(player, key) {
  const record = mine(player, key);
  if (!record || record.state === "alive") return;
  record.state = "egg";
  record.serial = Date.now(); // the old egg stops working
  saveRecord(player.id, record.role, record);
  giveEgg(player, record);
  player.sendMessage("§aHere's a new egg. Your old one won't work anymore.");
}

// ================================================================ throwing the egg

/** @type {Map<string, { key: string, thrownAt: number }>} */
const flyingEggs = new Map();

// Using the AI Computer shows how to craft the Coder and the prices.
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  if (itemStack?.typeId !== COMPUTER_ITEM) return;
  system.run(() => openMenu(player, showComputer));
});

// Recall robot: right click (use) brings the AI next to you so you can right click it to open its
// inventory (Minecraft only opens an inventory screen when you right click the AI itself)...
world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  const record = robotRecord(player, itemStack);
  if (!record) return;
  const ai = record.id ? world.getEntity(record.id) : undefined;
  const near = ai && ai.dimension.id === player.dimension.id &&
    Math.hypot(ai.location.x - player.location.x, ai.location.y - player.location.y, ai.location.z - player.location.z) < 4;
  if (!near) recallAi(player, record.key);
  player.sendMessage(`§eRight click ${record.name} to open its inventory.`);
});

// ...and left click (an attack swing) opens its commands.
world.afterEvents.playerSwingStart.subscribe(({ player, heldItemStack, swingSource }) => {
  if (swingSource !== EntitySwingSource.Attack) return;
  const record = robotRecord(player, heldItemStack);
  if (record) system.run(() => openMenu(player, (p) => showCommands(p, record.key)));
});


/**
 * The AI a recall robot controls. Holding someone else's robot makes you its controller.
 * @param {import("@minecraft/server").Player} player
 * @param {ItemStack | undefined} item
 * @returns {AiRecord | undefined}
 */
function robotRecord(player, item) {
  if (!item || !ROLE_IDS.some((r) => ROLES[r].robot === item.typeId)) return undefined;
  const key = robotKey(item);
  const record = key ? getAi(key) : undefined;
  if (!record) {
    player.sendMessage("§cThis AI doesn't exist anymore.");
    return undefined;
  }
  if (record.ownerId !== player.id) takeControl(player, record);
  return getAi(record.key);
}

/**
 * The key stored on a recall robot (robots from before version 1.12 only know their owner).
 * @param {ItemStack} item
 */
function robotKey(item) {
  const key = item.getDynamicProperty("aip:key");
  if (typeof key === "string") return key;
  const ownerId = item.getDynamicProperty("aip:owner");
  const role = ROLE_IDS.find((r) => ROLES[r].robot === item.typeId);
  return typeof ownerId === "string" && role ? controlledBy(ownerId, role)[0]?.key : undefined;
}

world.afterEvents.itemUse.subscribe(({ source: player, itemStack }) => {
  const role = ROLE_IDS.find((r) => ROLES[r].egg === itemStack?.typeId);
  if (!role || !itemStack) return;

  const eggKey = itemStack.getDynamicProperty("aip:key");
  const serial = itemStack.getDynamicProperty("aip:serial");
  const record = typeof eggKey === "string" ? getAi(eggKey) : controlledBy(player.id, role)[0];
  if (record && record.ownerId !== player.id) {
    player.sendMessage("§cThis egg doesn't belong to you.");
    return;
  }
  if (!record || record.state !== "egg" || record.serial !== serial) {
    player.sendMessage("§cThis egg doesn't work anymore.");
    return;
  }

  // The egg leaves the player's hand and its slot gets the AI's recall robot.
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container?.getItem(player.selectedSlotIndex)?.typeId === itemStack.typeId) {
    container.setItem(player.selectedSlotIndex, makeRecallRobot(player, record));
  } else {
    giveItem(player, makeRecallRobot(player, record));
  }

  // Throw it.
  const view = player.getViewDirection();
  const head = player.getHeadLocation();
  const start = { x: head.x + view.x * 0.6, y: head.y + view.y * 0.6, z: head.z + view.z * 0.6 };
  const egg = player.dimension.spawnEntity(CAPSULE_ENTITY, start);
  egg.setDynamicProperty("aip:owner", player.id);
  egg.setDynamicProperty("aip:role", role);
  egg.setDynamicProperty("aip:key", record.key);
  const projectile = egg.getComponent("minecraft:projectile");
  if (projectile) {
    projectile.owner = player;
    projectile.shoot({ x: view.x * 1.3, y: view.y * 1.3 + 0.1, z: view.z * 1.3 });
  }

  record.state = "thrown";
  saveRecord(player.id, role, record);
  flyingEggs.set(egg.id, { key: record.key, thrownAt: Date.now() });
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
  const stored = egg.isValid ? egg.getDynamicProperty("aip:key") : undefined;
  const key = saved?.key ?? (typeof stored === "string" ? stored : undefined);
  flyingEggs.delete(egg.id);
  if (egg.isValid) egg.remove();
  const record = key ? getAi(key) : undefined;
  if (!record || record.state !== "thrown") return;
  const owner = findPlayer(record.ownerId);
  if (!owner) {
    // Owner left while the egg was flying: spawn it next to them when they're back.
    record.state = "respawn";
    saveRecord(record.ownerId, record.role, record);
    return;
  }
  spawnAi(owner, record.key, location, dimension);
}

// ================================================================ recall robots


/**
 * The recall robot (controller) that replaces the egg: red for the Fighter, blue for the Resource AI.
 * Whoever holds it controls the AI.
 * @param {import("@minecraft/server").Player} player @param {AiRecord} record
 */
function makeRecallRobot(player, record) {
  const robot = new ItemStack(ROLES[record.role].robot, 1);
  robot.nameTag = `§r${ROLES[record.role].color}${record.name}'s Recall Robot`;
  robot.setLore([`§7Controlled by: ${player.name}`, "§7Left click: commands and teleport", "§7Right click: bring it here", "§7Give it to a friend to let them control it."]);
  robot.setDynamicProperty("aip:key", record.key);
  robot.setDynamicProperty("aip:owner", player.id);
  return robot;
}

/**
 * Makes a player the controller of an AI (they picked up its recall robot). The AI comes to them
 * and follows and protects them from now on; everything it carries stays with it.
 * This does NOT count as buying: it doesn't stop either player from buying their own.
 * @param {import("@minecraft/server").Player} player @param {AiRecord} record
 */
function takeControl(player, record) {
  const previous = findPlayer(record.ownerId);
  record.ownerId = player.id;
  saveRecord(player.id, record.role, record);

  // Re-tame it to the new controller: it rejoins (next to where it was, or next to them).
  const ai = record.id ? world.getEntity(record.id) : undefined;
  if (record.state === "alive") {
    if (ai?.isValid) {
      if (spawnAi(player, record.key, ai.location, ai.dimension, true)) ai.remove();
    } else {
      record.state = "respawn";
      delete record.id;
      saveRecord(player.id, record.role, record);
      respawnAi(record.key);
    }
  }

  // Update the robot(s) the player holds for this AI.
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container) {
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (item && ROLES[record.role].robot === item.typeId && robotKey(item) === record.key) {
        container.setItem(i, makeRecallRobot(player, record));
      }
    }
  }
  player.sendMessage(`§aYou now control ${record.name} (${ROLES[record.role].title}).`);
  previous?.sendMessage(`§e${player.name} picked up ${record.name}'s recall robot and now controls it.`);
}

// Someone picked up another player's recall robot: they become its controller.
system.runInterval(() => {
  for (const player of world.getPlayers()) {
    const container = player.getComponent("minecraft:inventory")?.container;
    if (!container) continue;
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item || !ROLE_IDS.some((r) => ROLES[r].robot === item.typeId)) continue;
      const key = robotKey(item);
      const record = key ? getAi(key) : undefined;
      if (!record) {
        container.setItem(i, undefined); // its AI was deleted
      } else if (record.ownerId !== player.id) {
        takeControl(player, record);
      }
    }
  }
}, 20);


/**
 * Brings the AI to the player. If it's too far away to be loaded, it rejoins next to the player
 * (with everything it carries), and the old copy disappears when its area loads.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
function recallAi(player, key) {
  const record = mine(player, key);
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
  } else if (!spawnAi(player, key, player.location, player.dimension, true)) {
    return;
  }
  player.sendMessage(`§a${record.name} teleported to you.`);
}


/**
 * Deletes the AI and its recall robot (after asking). Everything it carries is given back, except
 * its own 10 chicken and its torches. Whoever bought it still can't buy another one.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function deleteAi(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const role = record.role;
  const confirm = await new MessageFormData()
    .title(`Delete ${record.name}?`)
    .body(
      `${record.name} and its recall robot will be gone for good. You get back everything it carries.\n\n` +
        `§cThere's no refund, and whoever bought it can't buy another ${ROLES[role].title} (one per player).`
    )
    .button1("Delete")
    .button2("Keep")
    .show(player);
  if (confirm.selection !== 0) return;

  const latest = mine(player, key);
  if (!latest) return;
  returnEverything(player, latest);
  removeAi(key);
  const ai = latest.id ? world.getEntity(latest.id) : undefined;
  ai?.remove();

  // Take its recall robot (and any unthrown egg) out of the player's inventory.
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container) {
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item) continue;
      const isRobot = item.typeId === ROLES[role].robot && robotKey(item) === key;
      const isEgg = item.typeId === ROLES[role].egg && item.getDynamicProperty("aip:key") === key;
      if (isRobot || isEgg) container.setItem(i, undefined);
    }
  }
  world.sendMessage(`§e${latest.name} left the game`);
}

// ================================================================ spawning & respawning

/**
 * @param {import("@minecraft/server").Player} owner  its controller
 * @param {string} key
 * @param {import("@minecraft/server").Vector3} location
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {boolean} [quiet]  true for a recall (no "joined the game")
 */
function spawnAi(owner, key, location, dimension, quiet = false) {
  const record = getAi(key);
  if (!record) return false;
  const role = record.role;

  const ai = dimension.spawnEntity(AI_ENTITY, location);
  const tameable = ai.getComponent("minecraft:tameable");
  if (!tameable || !tameable.tame(owner)) {
    ai.remove();
    // Give the egg back so nothing is lost.
    record.state = "egg";
    record.serial = Date.now();
    saveRecord(owner.id, role, record);
    giveEgg(owner, record);
    owner.sendMessage("§cYour AI couldn't spawn there. You got your egg back.");
    return false;
  }

  ai.setDynamicProperty("aip:owner", owner.id);
  ai.setDynamicProperty("aip:role", role);
  ai.setDynamicProperty("aip:key", key);
  knownAis.set(ai.id, { ownerId: owner.id, role, key });
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
  delete record.diedAt;
  record.mode = "follow";
  delete record.post;
  saveRecord(owner.id, role, record);
  if (!quiet) world.sendMessage(`§e${record.name} joined the game`);
  return true;
}


/**
 * Brings back an AI that's waiting to respawn. After dying it waits 60 seconds and comes back near the
 * player who bought it (or near its controller if the buyer isn't around). It's always tamed to its
 * controller, so that player has to be online.
 * @param {string} key
 */
function respawnAi(key) {
  const record = getAi(key);
  if (!record || record.state !== "respawn") return;
  if (record.diedAt && Date.now() - record.diedAt < RESPAWN_SECONDS * 1000) return; // not yet
  const alive = (/** @type {import("@minecraft/server").Player | undefined} */ p) =>
    p && (p.getComponent("minecraft:health")?.currentValue ?? 0) > 0 ? p : undefined;
  const controller = alive(findPlayer(record.ownerId));
  if (!controller) return; // tried again when they spawn
  const near = (record.diedAt ? alive(findPlayer(record.buyerId)) : undefined) ?? controller;
  spawnAi(controller, key, near.location, near.dimension);
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
    const record = getAi(info.key);
    if (!record || record.id !== id) return; // an old or deleted AI

    record.state = "respawn";
    record.diedAt = Date.now();
    delete record.id;
    saveRecord(record.ownerId, record.role, record);

    const owner = findPlayer(record.ownerId);
    const buyer = findPlayer(record.buyerId);
    world.sendMessage(`§e${record.name} died`);
    const where = buyer ? `near ${buyer.id === owner?.id ? "you" : buyer.name}` : "near you";
    owner?.sendMessage(`§7${record.name} will respawn ${where} in ${RESPAWN_SECONDS} seconds.`);
    system.runTimeout(() => respawnAi(record.key), RESPAWN_SECONDS * 20 + 5);
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
    system.run(() => openMenu(player, (p) => showCommands(p, info.key)));
  }
});

// Left click your AI: commands. (openMenu makes sure only one menu opens.)
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity.typeId !== "minecraft:player" || hitEntity.typeId !== AI_ENTITY) return;
  const info = ownerInfo(hitEntity);
  if (!info || info.ownerId !== damagingEntity.id) return;
  const player = /** @type {import("@minecraft/server").Player} */ (damagingEntity);
  system.run(() => openMenu(player, (p) => showCommands(p, info.key)));
});

// Right click your AI: Minecraft opens its inventory screen (owner only; see container.js).
// Allies of the owner can't open it, but right clicking lets them take spare chicken.
world.afterEvents.playerInteractWithEntity.subscribe(({ player, target }) => {
  if (target.typeId !== AI_ENTITY) return;
  const info = ownerInfo(target);
  if (info && info.ownerId !== player.id && getMemory(info.ownerId).allies[player.id]) {
    system.run(() => openMenu(player, (p) => takeFood(p, info.key)));
  }
});

// ================================================================ commands (left click)

/**
 * Everything you can tell your AI to do. Opened by left clicking the AI or its recall robot.
 * @param {import("@minecraft/server").Player} player
 * @param {string} key
 */
async function showCommands(player, key) {
  const record = mine(player, key);
  if (!record) {
    player.sendMessage("§eYou don't control that AI anymore.");
    return;
  }
  const role = record.role;
  const ai = record.id ? world.getEntity(record.id) : undefined;

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [{ label: "Teleport to me", run: () => recallAi(player, key) }];
  let body = "";
  const needAi = (/** @type {(ai: import("@minecraft/server").Entity) => unknown} */ fn) => () =>
    ai?.isValid ? fn(ai) : player.sendMessage(`§e${record.name} is too far away. Teleport it to you first.`);

  if (role === "fighter") {
    const mode = record.mode === "guard" ? "Guarding a spot" : "Following and protecting you";
    const style = COMBAT_STYLES.find((c) => c.id === (record.combat ?? "archer_sword")) ?? COMBAT_STYLES[2];
    const targets = TARGET_MODES.find((t) => t.id === (record.targets ?? "all")) ?? TARGET_MODES[0];
    body = `Right now: §e${mode}§r\nStyle: §e${style.label}§r\nTargets: §e${targets.label}§r`;
    actions.push({ label: "Attack a player", run: needAi((a) => chooseAttackTarget(player, a)) });
    actions.push({ label: "Follow and protect me", run: needAi((a) => setFighterMode(player, key, a, "follow")) });
    actions.push({ label: "Guard this spot\n§8Attacks any other player who comes near", run: needAi((a) => setFighterMode(player, key, a, "guard")) });
    actions.push({ label: `Fighting\n§8${style.label}, ${targets.label.toLowerCase()}`, run: () => chooseFighting(player, key) });
    actions.push({ label: `Tombstones\n§8Looting ${record.loot === false ? "off" : "on"}`, run: () => showTombs(player, key) });
  } else {
    body = "Choose resource";
    const wandering = record.mode === "wander";
    const setResource = (/** @type {{ mode?: "follow" | "wander", focus?: string }} */ change) => () => {
      const r = mine(player, key);
      if (!r) return;
      if (change.mode) r.mode = change.mode;
      if (change.focus) {
        r.focus = change.focus;
        r.mode = "wander"; // picking something to get sends it off to get it
      }
      saveRecord(player.id, role, r);
      toolsChanged(r.id);
      player.sendMessage(r.mode === "wander" ? `§e${r.name} will wander and get: ${r.focus}` : `§e${r.name} will follow you.`);
    };
    actions.push({ label: `${wandering ? "" : "§2"}Follow me\n§8Strictly follows you, doesn't gather`, run: setResource({ mode: "follow" }) });
    actions.push({ label: `${wandering ? "§2" : ""}Wander and gather\n§8Goes off to get the resource below`, run: setResource({ mode: "wander" }) });
    const resources = RESOURCE_FOCUS.filter((f) => f !== "Nothing");
    if (record.upgraded) resources.push("Strip mine");
    for (const focus of resources) {
      const about = focus === "Strip mine" ? `\n§8Tunnels to ${ai?.dimension.id === "minecraft:nether" ? "netherite" : "diamonds"}` : "";
      actions.push({ label: `${focus === record.focus ? "§2" : ""}${focus}${about}`, run: setResource({ focus }) });
    }
  }
  actions.push({ label: "Allies & enemies", run: () => showMemory(player) });
  actions.push({ label: `§cDelete ${record.name}\n§8Removes the AI and its recall robot`, run: () => deleteAi(player, key) });

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
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function showTombs(player, key) {
  const record = mine(player, key);
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

/**
 * The Fighter's one fighting section: how it fights, and what it goes after.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function chooseFighting(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const targets = TARGET_MODES.find((t) => t.id === (record.targets ?? "all")) ?? TARGET_MODES[0];
  const other = TARGET_MODES.find((t) => t.id !== targets.id) ?? TARGET_MODES[1];
  const form = new ActionFormData()
    .title("Fighting")
    .body(`Pick how ${record.name} fights. Every style backs off to heal at 30% health.\n\nTargets: §e${targets.label}`);
  COMBAT_STYLES.forEach((c) => form.button(`${c.id === (record.combat ?? "archer_sword") ? "§2" : ""}${c.label}\n§8${c.about}`));
  form.button(`Switch targets to: ${other.label}\n§8${other.about}`);
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const latest = mine(player, key);
  if (!latest) return;
  if (response.selection < COMBAT_STYLES.length) {
    latest.combat = COMBAT_STYLES[response.selection].id;
    player.sendMessage(`§e${latest.name}: ${COMBAT_STYLES[response.selection].label}.`);
  } else {
    latest.targets = other.id;
    player.sendMessage(`§e${latest.name}: ${other.label}.`);
  }
  saveRecord(player.id, "fighter", latest);
  toolsChanged(latest.id);
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {string} key
 * @param {import("@minecraft/server").Entity} ai
 * @param {"follow" | "guard"} mode
 */
function setFighterMode(player, key, ai, mode) {
  const record = mine(player, key);
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
 * @param {string} key
 */
async function takeFood(player, key) {
  let record = getAi(key);
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
  record = getAi(key);
  if (!record) return;
  amount = Math.min(amount, takeableFood(record));
  if (amount <= 0) return;
  inventoryOf(record).food -= amount;
  saveRecord(record.ownerId, record.role, record);
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
  for (const record of allAis()) {
    if (record.state === "respawn") {
      respawnAi(record.key); // in case its timer was missed (world reloaded); its food updates next round
      continue;
    }
    if (record.state === "egg" || record.state === "thrown") {
      // Not in the world yet: the 10-minute timer starts when it first joins.
      inventoryOf(record).foodAt = world.getAbsoluteTime();
      saveRecord(record.ownerId, record.role, record);
      continue;
    }
    const added = generateFood(record);
    saveRecord(record.ownerId, record.role, record);
    if (added > 0) {
      findPlayer(record.ownerId)?.sendMessage(
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
    if (entity) {
      hatch(entity, entity.location, entity.dimension);
    } else {
      flyingEggs.delete(eggId);
      const record = getAi(egg.key);
      if (record?.state !== "thrown") continue;
      const owner = findPlayer(record.ownerId);
      if (owner) {
        spawnAi(owner, record.key, owner.location, owner.dimension);
      } else {
        record.state = "respawn";
        saveRecord(record.ownerId, record.role, record);
      }
    }
  }
}, 20);
