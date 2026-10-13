// AI Players: guide, shop, eggs, menus and respawning.
// The fighting brain and memory live in brain.js; saved data in data.js.
// - AI Computer: every player spawns with one. Use it to see how to craft the Coder and the prices.
// - Coder block: the shop. Buying an AI gives you an egg; throw it to spawn your AI.
// - Left click its Remote: commands (teleport, attack, follow/guard, settings, gather focus). Clicking the AI itself does nothing.
// - Right click your AI: its inventory. Right clicking the Remote does nothing.
// - Allies can right click your AI to take spare cooked chicken from its food slot.
// - If an AI dies it respawns next to the player who bought it, and keeps its memory.
import { world, system, ItemStack, EntityDamageCause } from "@minecraft/server";
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
  markBought,
  getMemory,
  saveMemory,
  findPlayer,
  ownerInfo,
  knownAis,
  countItem,
  takeItem,
  giveItem,
  stageOf,
  canGather,
  resourcePerks,
  hasBoughtAny,
  SKIN_LOOK,
} from "./data.js";
import { releaseLoaded } from "./scout.js";
import { CAVE_ORES, NETHER_ORES, oresOf, netherOresOf, startCavePlacing, isCavePlacing } from "./caves.js";
import { levelText } from "./levels.js";
import { sparks, isLeftClick } from "./effects.js"; // (also starts the 20-minute reports)
import { commandAttack, toolsChanged, hungerOf } from "./brain.js";
import "./container.js"; // the AI's right-click inventory
import "./chest.js"; // Computer Chest (opens the AI Chest from anywhere)
import { FARM_FOCUS, startPlacing, isPlacing, farmProgress, giveFarmMaterials, returnFarmMaterials, removeWarp } from "./farm.js";
import {
  FOOD_ITEM,
  FOOD_RESERVED,
  FOOD_BATCH,
  FOOD_CAP,
  ARROW_ITEM,
  inventoryOf,
  takeableFood,
  generateFood,
  minutesToNextFood,
  stackFromTool,
  totalArrows,
  ARMOR_SLOTS,
  stashTotals,
  stashCount,
  itemName,
} from "./inventory.js";
import { tombTypes, getTaught, setTaught, addOnThingsNear } from "./tombs.js";
import { FOCUSES } from "./gather_data.js";

/** @typedef {import("./data.js").RoleId} RoleId */
/** @typedef {import("./data.js").AiRecord} AiRecord */

const COMPUTER_ITEM = "aip:ai_computer";
const MAX_NAME_LENGTH = 20;
const RESPAWN_SECONDS = 60;
const START_FOOD = 15; // cooked chicken every AI comes with (it eats them to heal itself and when hungry)

/** What each stage is called (see data.js stageOf). */
/** @type {Record<number, string>} */
const STAGE_NAMES = { 1: "Resource AI", 2: "Resource AI+", 3: "Fighter AI", 4: "Fighter AI Max" };

/** The level-ups at the Coder: from stage 1 to 2, 2 to 3 (becomes a Fighter), and 3 to 4. */
/** @type {Record<number, { item: string, amount: number, label: string, title: string, about: string }>} */
const LEVEL_UPS = {
  1: {
    item: "minecraft:diamond",
    amount: 10,
    label: "Diamonds",
    title: "Level up to Resource AI+",
    about:
      "§a+§r Strip mining: it digs a tunnel straight to diamonds (or netherite in the Nether) and mines them\n" +
      "§a+§r Can't be hurt by lava or fire (no potion bubbles), and takes no fall damage\n" +
      "§a+§r Its AI Chest unlocks: everything it saved up is yours (open it from a Computer Chest)",
  },
  2: {
    item: "minecraft:diamond",
    amount: 15,
    label: "Diamonds",
    title: "Become a Fighter AI",
    about:
      "It becomes a Fighter and §ekeeps everything it could do§r: gathering, sugar cane farms, strip mining,\n" +
      "its AI Chest, torches, water bucket, lava/fire/fall proof.\n\n" +
      "§a+§r Follows and protects you from mobs and players, most dangerous enemy first\n" +
      "§a+§r Attacks whatever you attack, or any player you send it after\n" +
      "§a+§r Fight styles: Sword, Bow (25 blocks, aims ahead), or Bow + Sword\n" +
      "§a+§r Hunts mobs and players, or only players; can guard a spot\n" +
      "§a+§r Arrow slots; its tool slots take weapons and mining tools\n" +
      "§a+§r Breaks tombstones and takes the most valuable loot\n" +
      "§a+§r While it's gathering it still drops everything to fight any enemy that shows up\n" +
      "§a+§r Gets a red Remote",
  },
  3: {
    item: "minecraft:netherite_ingot",
    amount: 10,
    label: "Netherite Ingots",
    title: "Final upgrade: Fighter AI Max",
    about:
      "When an enemy player comes within 30 blocks, once each time they come back into range:\n" +
      "§a+§r Full sprint: runs and jumps 1.5x faster than a player until it lands its first hit\n" +
      "§a+§r That first hit knocks the player back about 7 blocks\n" +
      "§a+§r Power jump: jumps about 10 blocks to reach a player more than 2 blocks above it, swinging all\n" +
      "   the way up (no fall damage for 5 seconds after)\n" +
      "§a+§r Bow + Sword: 2 opening arrows at 3x speed instead of 1",
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
      "§a+§r A blue Remote to call it to you from anywhere\n" +
      "§a+§r Makes 15 cooked chicken every 10 minutes (up to 45); keeps 30 for itself, you take the rest\n" +
      "§a+§r Runs away from players who attack it\n" +
      "§a+§r Respawns near the player who bought it 60 seconds after dying\n" +
      "§a+§r Level it up at the Coder: §b10 diamonds§r (strip mining, lava/fall proof, AI Chest), then\n" +
      "   §b15 diamonds§r to become a Fighter that keeps all of this, then §b10 netherite§r for its final upgrade\n\n" +
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
      "§a+§r Fight styles: Sword, Bow (25 blocks, aims ahead), or Bow + Sword\n" +
      "§a+§r Can hunt mobs and players, or only players\n" +
      "§a+§r 3 tool slots for fighting tools, used in order 1, 2, 3 (next one when a tool breaks)\n" +
      "§a+§r 2 arrow slots, so it can fight with a bow or crossbow\n" +
      "§a+§r Armor slots and a shield slot (it blocks hits from the front)\n" +
      "§a+§r 2 block slots: bridges over ravines and lava, pillars up, covers lava\n" +
      "§a+§r 10 slots for valuables (diamonds, gold, coal, netherite...)\n" +
      "§a+§r Breaks tombstones and takes the most valuable loot\n" +
      "§a+§r A red Remote to call it to you from anywhere\n" +
      "§a+§r Makes 15 cooked chicken every 10 minutes (up to 45); keeps 30 for itself, you take the rest\n" +
      "§a+§r Remembers players who attacked you, and never attacks your allies\n" +
      "§a+§r Can guard a spot and attack any other player who comes near\n" +
      "§a+§r Left click its Remote and pick Attack a player to send it after someone\n" +
      "§a+§r Respawns near the player who bought it 60 seconds after dying, and keeps its memory\n" +
      "§a+§r Upgrade it at the Coder (10 netherite ingots): sprint, power jump, knockback, double arrows\n\n" +
      "§7Health: 20 (same as a player)   Damage: 6 + tool",
  },
};
const RESOURCE_FOCUS = FOCUSES; // Trees, Caves, Nothing

/** Fighter fighting styles. */
const COMBAT_STYLES = /** @type {const} */ ([
  { id: "sword", label: "Sword", about: "Sprints at the enemy and keeps hitting with its sword" },
  { id: "archer", label: "Bow", about: "Shoots from up to 25 blocks, aiming ahead of moving targets" },
  { id: "archer_sword", label: "Bow + Sword", about: "One arrow from 20 blocks, then runs in with its sword" },
]);
/** Fighter target modes. */
const TARGET_MODES = /** @type {const} */ ([
  { id: "all", label: "Mobs + players", about: "Hunts monsters and enemy players" },
  { id: "players", label: "Players only", about: "Ignores monsters unless they attack" },
]);


const GUIDE_TEXT =
  "§lStep 1: Craft a Coder§r\n" +
  "On a crafting table:\n" +
  "  Glass  -  Glass  -  Glass\n" +
  "  Iron  -  Redstone  -  Iron\n" +
  "  Iron  -  Iron  -  Iron\n" +
  "§7(Iron = Iron Ingot)§r\n\n" +
  "§lStep 2: Buy your AI at the Coder§r\n" +
  `Resource AI: §6${ROLES.resource.price.amount} ${ROLES.resource.price.label}§r. Each player can only buy ONE AI, ever.\n` +
  "Then level it up at the Coder:\n" +
  "  §b10 Diamonds§r: Resource AI+ (strip mining, lava/fall proof, AI Chest unlocked)\n" +
  "  §b15 Diamonds§r: becomes a Fighter AI and keeps everything it could do\n" +
  "  §b10 Netherite Ingots§r: Fighter AI Max (sprint, power jump, knockback, double arrows)\n" +
  "You type its name; it starts with full health and 15 cooked chicken. " +
  "Give your Remote to a friend (drop it) and they control your AI; it doesn't let anyone buy extra.\n\n" +
  "§lStep 3: Throw the egg§r\n" +
  "You get an AI Egg. Use it to throw it, and your AI appears where it lands. The egg turns into a " +
  "§cRemote§r (§9blue§r for the Resource AI): use it to bring your AI to you from anywhere.\n\n" +
  "§lControls§r\n" +
  "- §eLeft click§r its Remote (the only way to give it commands): teleport to you, attack a player, follow/guard, " +
  "fighting style, targets, gather focus, allies & enemies\n" +
  "- §eRight click§r your AI: its inventory, like a chest with labeled slots\n" +
  "- Your AI feeds itself with its own cooked chicken when it's hurt\n\n" +
  "§lInventory§r\n" +
  "Food, tools 1-2-3 (used in order; next one when a tool breaks), armor, shield, 2 block slots " +
  "(no sand, gravel or other falling blocks; used to bridge, pillar and cover lava), 10 valuables slots, " +
  "and arrows. Drag items into the labeled slots; wrong items are handed back.\n\n" +
  "§lFighter settings§r (left click its Remote to change)\n" +
  "Style: Sword, Bow, or Bow + Sword. Targets: mobs + players, or players only.\n" +
  "Tombstones: it breaks tombstones near it and takes the most valuable loot (can be turned off).\n\n" +
  "§lFood§r\n" +
  `Each AI makes ${FOOD_BATCH} cooked chicken every 10 minutes, up to ${FOOD_CAP}. ` +
  `The first ${FOOD_RESERVED} are its own (it eats them to heal and when hungry); you and your allies can take the rest.\n\n` +
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
  const priceLine = (/** @type {string} */ title, /** @type {{ item: string, amount: number, label: string }} */ price) => {
    const have = countItem(player, price.item);
    return `- ${title}: ${have >= price.amount ? "§a" : "§c"}${price.amount} ${price.label}§r §7(you have ${have})§r`;
  };
  const mineAis = controlledBy(player.id);
  const prices = [
    hasBoughtAny(player.id)
      ? `- Your AI: ${mineAis.length ? mineAis.map((r) => `§e${r.name}§r (${STAGE_NAMES[stageOf(r)]})`).join(", ") : "§7already bought§r"}`
      : priceLine("Buy a Resource AI", ROLES.resource.price),
    ...[1, 2, 3].map((stage) => priceLine(LEVEL_UPS[stage].title, LEVEL_UPS[stage])),
  ];
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
        "\n\n" +
        "§lComputer Chest§r: chest + redstone + glass pane. Opens your AI Chest (materials it mined) from anywhere.\n\n" +
        "§7Each player can only buy one AI. If someone gives you their Remote, you control their AI too."
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
  const owned = controlledBy(player.id);
  const form = new ActionFormData().title("Coder");
  /** @type {(() => Promise<unknown> | unknown)[]} */
  const runs = [];
  if (owned.length) {
    form.body("Tap your AI to level it up, get a new egg or Remote.");
    for (const r of owned) {
      const stage = stageOf(r);
      const next = LEVEL_UPS[stage];
      const enough = next ? countItem(player, next.item) >= next.amount : false;
      form.button(
        `${r.name} §8(${STAGE_NAMES[stage]})\n${next ? `${enough ? "§2" : "§c"}Next: ${next.amount} ${next.label}` : "§2Fully upgraded"}`,
        r.role === "fighter" ? ROLES.fighter.icon : ROLES.resource.icon
      );
      runs.push(() => manageOwned(player, r.key));
    }
  } else if (hasBoughtAny(player.id)) {
    form.body("§7You already bought your AI (one per player). Whoever has its Remote controls it.");
  } else {
    const info = ROLES.resource;
    const enough = countItem(player, info.price.item) >= info.price.amount;
    form.body("Buy your AI. §7Each player can only buy one, then level it up here.");
    form.button(`${info.title}\n${enough ? "§2" : "§c"}${info.price.amount} ${info.price.label}`, info.icon);
    runs.push(() => showRoleInfo(player, "resource"));
  }
  form.button("How it works", "textures/items/book_writable");
  runs.push(() => showGuide(player));

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await runs[response.selection]();
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
  const look = SKIN_LOOK; // every AI wears the same skin (see data.js)
  const name = await askForName(player, info.title);
  if (name === undefined) return;

  // Check again: the inventory may have changed while the menus were open.
  if (countItem(player, info.price.item) < info.price.amount) {
    player.sendMessage(needMore(player, role));
    return;
  }
  if (hasBoughtAny(player.id)) {
    player.sendMessage("§cEach player can only buy one AI.");
    return;
  }

  takeItem(player, info.price.item, info.price.amount);
  markBought(player.id, role);
  /** @type {AiRecord} */
  const record = {
    key: newKey(), role, ownerId: player.id, buyerId: player.id,
    name, look, state: "egg", serial: Date.now(), mode: "follow", focus: "Trees", combat: "archer_sword", targets: "all",
  };
  inventoryOf(record).food = START_FOOD;
  saveRecord(player.id, role, record);
  giveEgg(player, record);
  sparks(player.dimension, player.location, 16);
  player.playSound("random.levelup");
  player.sendMessage(`§aYou bought a ${info.title}! Throw the egg to spawn §e${name}§a.`);
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
      label: "Get a new Remote\n§8If you lost it",
      run: () => {
        const r = mine(player, key);
        if (r) giveItem(player, makeRecallRobot(player, r));
      },
    });
  } else {
    actions.push({ label: "Get a new egg (if you lost it)", run: () => replaceEgg(player, key) });
  }
  const next = LEVEL_UPS[stageOf(record)];
  if (next) {
    const enough = countItem(player, next.item) >= next.amount;
    actions.push({ label: `${next.title}\n${enough ? "§2" : "§c"}${next.amount} ${next.label}`, run: () => levelUp(player, key) });
  }
  actions.push({ label: `§cDelete ${record.name}\n§8Removes the AI and its Remote`, run: () => deleteAi(player, key) });

  const form = new ActionFormData()
    .title(`${STAGE_NAMES[stageOf(record)]}: ${record.name}`)
    .body(`${status}\n§bStage ${stageOf(record)} of 4: ${STAGE_NAMES[stageOf(record)]}`);
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}


/**
 * Levels the AI up to its next stage at the Coder: shows what it gets and the price (red until you have enough).
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function levelUp(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const stage = stageOf(record);
  const up = LEVEL_UPS[stage];
  if (!up) return;
  const have = countItem(player, up.item);
  const enough = have >= up.amount;
  const response = await new MessageFormData()
    .title(up.title)
    .body(`${up.about}\n\n§rCost: ${enough ? "§a" : "§c"}${up.amount} ${up.label}§r\nYou have: ${enough ? "§a" : "§c"}${have}`)
    .button1("Level up")
    .button2("Back")
    .show(player);
  if (response.selection !== 0) return;
  if (countItem(player, up.item) < up.amount) {
    player.sendMessage(`§cYou need ${up.amount - countItem(player, up.item)} more ${up.label}.`);
    return;
  }
  const latest = mine(player, key);
  if (!latest || stageOf(latest) !== stage) return;
  takeItem(player, up.item, up.amount);
  sparks(player.dimension, player.location, 16);
  const upgradedAi = latest.id ? world.getEntity(latest.id) : undefined;
  if (upgradedAi?.isValid) sparks(upgradedAi.dimension, upgradedAi.location, 16);
  player.playSound("random.levelup");

  if (stage === 2) {
    becomeFighter(player, latest);
  } else {
    latest.upgraded = true;
    saveRecord(player.id, latest.role, latest);
    toolsChanged(latest.id);
    player.sendMessage(
      stage === 1
        ? `§b${latest.name} is now a Resource AI+! §fLeft click its Remote and pick Strip mine. §6Its AI Chest is unlocked: ${stashCount(latest)} items saved up!`
        : `§b${latest.name} is now a Fighter AI Max!`
    );
  }
}

/**
 * Stage 2 to 3: the Resource AI becomes a Fighter, keeping everything it had and could do.
 * @param {import("@minecraft/server").Player} player @param {AiRecord} record
 */
function becomeFighter(player, record) {
  record.role = "fighter";
  record.evolved = true;
  record.upgraded = false; // (the Fighter's final upgrade comes next)
  record.combat = record.combat ?? "archer_sword";
  record.targets = record.targets ?? "all";
  saveRecord(player.id, "fighter", record);

  const ai = record.id ? world.getEntity(record.id) : undefined;
  if (ai?.isValid) {
    ai.setDynamicProperty("aip:role", "fighter");
    knownAis.set(ai.id, { ownerId: record.ownerId, role: "fighter", key: record.key });
    ai.triggerEvent("aip:role_fighter");
    if (record.mode !== "wander") ai.triggerEvent(record.mode === "follow" ? "aip:fighter_follow" : "aip:fighter_guard");
    ai.dimension.playSound("random.levelup", ai.location);
  }
  toolsChanged(record.id);

  // Its blue Remote becomes a red one (and an egg not thrown yet becomes a Fighter egg).
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container) {
    for (let i = 0; i < container.size; i++) {
      const item = container.getItem(i);
      if (!item || item.getDynamicProperty("aip:key") !== record.key) continue;
      if (item.typeId === ROLES.resource.robot) container.setItem(i, makeRecallRobot(player, record));
      if (item.typeId === ROLES.resource.egg) {
        container.setItem(i, undefined);
        giveEgg(player, record);
      }
    }
  }
  player.sendMessage(
    `§b${record.name} is now a Fighter AI! §fIt keeps everything it could do before. ` +
      "Its Remote now has fight commands, plus §eJobs§f (it still fights any enemy that shows up)."
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

// Remote: everything is done with LEFT click (an attack swing), which opens its menu.
// Right clicking the Remote does nothing.
world.afterEvents.playerSwingStart.subscribe(({ player, heldItemStack, swingSource }) => {
  // (placing a farm or picking a cave spot uses left click too)
  if (!isLeftClick(swingSource) || isPlacing(player.id) || isCavePlacing(player.id)) return;
  // Holding the button down keeps swinging: don't open the menu again right after it closed.
  if (Date.now() - (menuClosedAt.get(player.id) ?? 0) < 600) return;
  const record = robotRecord(player, heldItemStack);
  if (record) {
    system.run(async () => {
      await openMenu(player, (p) => showCommands(p, record.key));
      menuClosedAt.set(player.id, Date.now());
    });
  }
});

/** When each player's Remote menu last closed. @type {Map<string, number>} */
const menuClosedAt = new Map();


/** The name on an AI's Remote: just "Remote", in green (matches its Matrix look). @param {AiRecord} record */
const REMOTE_NAME = (record) => (void record, "§r§aRemote");

/**
 * The AI a Remote controls. Holding someone else's robot makes you its controller.
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
  if (record.ownerId !== player.id && !takeControl(player, record)) return undefined;
  return getAi(record.key);
}

/**
 * The key stored on a Remote (robots from before version 1.12 only know their owner).
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

  // The egg leaves the player's hand and its slot gets the AI's Remote.
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
  egg.setDynamicProperty("aip:role", record.role);
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

// ================================================================ Remotes


/**
 * The Remote (controller) that replaces the egg: red for the Fighter, blue for the Resource AI.
 * Whoever holds it controls the AI.
 * @param {import("@minecraft/server").Player} player @param {AiRecord} record
 */
function makeRecallRobot(player, record) {
  const robot = new ItemStack(ROLES[record.role].robot, 1);
  robot.nameTag = REMOTE_NAME(record);
  robot.setLore([`§7AI: ${record.name}`, `§7Controlled by: ${player.name}`, "§7Left click: menu"]);
  robot.setDynamicProperty("aip:key", record.key);
  robot.setDynamicProperty("aip:owner", player.id);
  return robot;
}

/**
 * Makes a player the controller of an AI (they picked up its Remote). The AI comes to them
 * and follows and protects them from now on; everything it carries stays with it.
 * This does NOT count as buying: it doesn't stop either player from buying their own.
 * One AI per player: someone who already controls an AI can hold another player's robot, but it does
 * nothing for them. Returns true if they took control.
 * @param {import("@minecraft/server").Player} player @param {AiRecord} record
 * @returns {boolean}
 */
function takeControl(player, record) {
  const already = controlledBy(player.id);
  if (already.length > 0) {
    const warnKey = `${player.id}:${record.key}`;
    if (Date.now() - (controlWarned.get(warnKey) ?? 0) > 30000) {
      controlWarned.set(warnKey, Date.now());
      player.sendMessage(
        `§cYou already control ${already[0].name}. §fEach player can only have one AI, so ${record.name}'s Remote does nothing for you.`
      );
    }
    return false;
  }
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
  previous?.sendMessage(`§e${player.name} picked up ${record.name}'s Remote and now controls it.`);
  return true;
}

/** "You already control an AI" warnings, so they aren't repeated every second. @type {Map<string, number>} */
const controlWarned = new Map();

// Someone picked up another player's Remote: they become its controller.
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
      } else if (
        item.nameTag !== REMOTE_NAME(record) ||
        item.typeId !== ROLES[record.role].robot ||
        item.getLore().some((line) => line.includes("Right click"))
      ) {
        container.setItem(i, makeRecallRobot(player, record)); // an older one: rename it "Remote" (and fix its colour)
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
 * Deletes the AI and its Remote (after asking). Everything it carries is given back, except
 * its own 30 chicken and its torches. Whoever bought it still can't buy another one.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function deleteAi(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const role = record.role;
  const confirm = await new MessageFormData()
    .title(`Delete ${record.name}?`)
    .body(
      "Gone for good. You get its items back. No refund." +
        (canGather(record) && !resourcePerks(record) && stashCount(record) > 0
          ? `\n§6Its locked AI Chest (${stashCount(record)} items) is lost.`
          : "")
    )
    .button1("§cDelete")
    .button2("Cancel")
    .show(player);
  if (confirm.selection !== 0) return;

  const latest = mine(player, key);
  if (!latest) return;
  returnEverything(player, latest);
  releaseLoaded(key);
  removeAi(key);
  const ai = latest.id ? world.getEntity(latest.id) : undefined;
  ai?.remove();

  // Take its Remote (and any unthrown egg) out of the player's inventory.
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

// Commands only come from the Remote (left click it), never from clicking the AI itself.

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
 * The Remote's menu (left click the Remote): everything you can tell your AI to do.
 * Kept short: one status line, plain buttons, details in sub-menus.
 * @param {import("@minecraft/server").Player} player
 * @param {string} key
 */
async function showCommands(player, key) {
  const record = mine(player, key);
  if (!record) {
    player.sendMessage("§eYou don't control that AI anymore.");
    return;
  }
  const ai = record.id ? world.getEntity(record.id) : undefined;
  const fighter = record.role === "fighter";
  const now = { wander: record.focus, guard: "Guarding", stay: "Staying put", follow: "Following you" }[record.mode] ?? "Following you";
  const needAi = (/** @type {(ai: import("@minecraft/server").Entity) => unknown} */ fn) => () =>
    ai?.isValid ? fn(ai) : player.sendMessage(`§e${record.name} is too far. Use Teleport first.`);

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [];
  // Jobs first: a stray tap on it only opens a menu.
  if (canGather(record)) actions.push({ label: `${record.mode === "wander" ? "§2" : ""}Jobs`, run: () => showJobs(player, key) });
  // One button: stop following (stay here) or start following again.
  const following = record.mode === "follow";
  actions.push({ label: following ? "Stay here" : "Follow me", run: needAi((a) => setMode(player, key, a, following ? "stay" : "follow")) });
  if (fighter) actions.push({ label: "Fight", run: () => showFight(player, key) });
  // (Not the first button: on touch screens the tap that opens the menu can land on the first one.)
  actions.push({ label: "Teleport", run: () => recallAi(player, key) });
  if (canGather(record)) actions.push({ label: `AI Chest${resourcePerks(record) ? "" : " §8(locked)"}`, run: () => showStash(player, key) });
  actions.push({ label: "More", run: () => showMore(player, key) });

  const form = new ActionFormData()
    .title(`${record.name} · ${STAGE_NAMES[stageOf(record)]}`)
    .body(`§7Now:§r ${now}\n§7${levelText(record)} · Hunger ${hungerOf(record)}/20`);
  actions.forEach((a) => form.button(a.label));
  // On touch screens the finger that opened the menu can "press" a button as it lifts. A press in
  // the first moment after the menu opens is ignored and the menu shows again.
  for (let tries = 0; tries < 3; tries++) {
    const opened = Date.now();
    const response = await form.show(player);
    if (response.canceled || response.selection === undefined) return;
    if (Date.now() - opened < GHOST_TAP_MS) continue;
    await actions[response.selection].run();
    return;
  }
}

/** Presses this soon after the Remote's menu opens are the opening tap itself, not a choice. */
const GHOST_TAP_MS = 800;

/**
 * Sends the AI off to do a job (gathering, strip mining), or back to following (job undefined).
 * A Fighter still fights any enemy that shows up while working.
 * @param {import("@minecraft/server").Player} player @param {string} key @param {string | undefined} job
 */
function setJob(player, key, job) {
  const r = mine(player, key);
  if (!r) return;
  if (job) {
    r.focus = job;
    r.mode = "wander";
  } else {
    r.mode = "follow";
    const ai = r.id ? world.getEntity(r.id) : undefined;
    ai?.triggerEvent(r.role === "fighter" ? "aip:fighter_follow" : "aip:resource_follow");
  }
  saveRecord(player.id, r.role, r);
  toolsChanged(r.id);
  player.sendMessage(`§e${r.name}: ${job ?? "following you"}`);
}

/**
 * Jobs: picking one starts it. The sugar cane farm opens its own menu once it's placed.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function showJobs(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const working = record.mode === "wander";
  const jobs = RESOURCE_FOCUS.filter((f) => f !== "Nothing");
  if (resourcePerks(record)) jobs.push("Strip mine");
  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = jobs.map((job) => ({
    label: `${working && record.focus === job ? "§2" : ""}${job}`,
    run: () => (job === "Caves" ? showCaves(player, key) : setJob(player, key, job)),
  }));
  actions.push({
    label: `${working && record.focus === FARM_FOCUS ? "§2" : ""}Sugar cane farm §8(In Water Only)${record.farm ? " - in progress" : ""}`,
    run: () => (record.farm ? showFarm(player, key) : startPlacing(player, key)),
  });
  const form = new ActionFormData().title("Jobs").body(working ? `§7Now:§r ${record.focus}` : "Pick a job.");
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}

/**
 * Caves: which ores to mine (on/off) and where to work (a cave spot picked with a laser).
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function showCaves(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const ores = oresOf(record);
  const nether = netherOresOf(record);
  const working = record.mode === "wander" && record.focus === "Caves";
  const spot = record.cave ? `${record.cave.x}, ${record.cave.y}, ${record.cave.z}` : "§cnot picked";
  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [
    { label: "Choose ores", run: () => chooseOres(player, key) },
    { label: "Pick cave spot", run: () => pickCave(player, key) },
  ];
  if (record.cave && !working) actions.push({ label: "§2Go mine", run: () => setJob(player, key, "Caves") });
  const form = new ActionFormData()
    .title("Caves")
    .body(
      `§7Ores:§r ${CAVE_ORES.filter((o) => ores.includes(o.key)).map((o) => o.label.replace(" ore", "")).join(", ")}\n` +
        `§7Nether:§r ${NETHER_ORES.filter((o) => nether.includes(o.key)).map((o) => o.label).join(", ")}\n§7Spot:§r ${spot}`
    );
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}

/**
 * Switch each ore on or off (stone and deepslate versions both count).
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function chooseOres(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const ores = oresOf(record);
  const nether = netherOresOf(record);
  const form = new ModalFormData().title("Ores to mine");
  CAVE_ORES.forEach((o) => form.toggle(o.label, { defaultValue: ores.includes(o.key) }));
  NETHER_ORES.forEach((o) => form.toggle(`Nether: ${o.label}`, { defaultValue: nether.includes(o.key) }));
  const response = await form.show(player);
  if (response.canceled || !response.formValues) return;
  const values = response.formValues;
  const chosen = CAVE_ORES.filter((_, i) => values[i] === true).map((o) => o.key);
  const chosenNether = NETHER_ORES.filter((_, i) => values[CAVE_ORES.length + i] === true).map((o) => o.key);
  if (chosen.length === 0 && chosenNether.length === 0) {
    player.sendMessage("§cPick at least one ore.");
    return;
  }
  const latest = mine(player, key);
  if (!latest) return;
  latest.ores = chosen;
  latest.netherOres = chosenNether;
  saveRecord(player.id, latest.role, latest);
  toolsChanged(latest.id);
  player.sendMessage(`§e${latest.name} mines: ${CAVE_ORES.filter((o) => chosen.includes(o.key)).map((o) => o.label.replace(" ore", "")).join(", ")}`);
  if (!latest.cave) await pickCave(player, key);
}

/**
 * The laser: pick a cave spot and the AI is sent there to mine.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
function pickCave(player, key) {
  startCavePlacing(player, key, (spot) => {
    const record = mine(player, key);
    if (!record) return;
    const dimension = world.getDimension(spot.dim);
    const location = { x: spot.x + 0.5, y: spot.y, z: spot.z + 0.5 };
    const ai = record.id ? world.getEntity(record.id) : undefined;
    if (record.state === "alive" && ai) ai.teleport(location, { dimension });
    else if (record.state === "alive") spawnAi(player, key, location, dimension, true);
    setJob(player, key, "Caves");
    player.onScreenDisplay.setTitle("§aSent to the cave", { subtitle: `${record.name} is mining`, fadeInDuration: 5, stayDuration: 40, fadeOutDuration: 10 });
  });
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
    player.sendMessage("§eNo players near it (friends don't count).");
    return;
  }
  const form = new ActionFormData().title("Attack who?");
  choices.forEach((p) => form.button(p.name));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  commandAttack(player, ai, choices[response.selection]);
}

/**
 * Fight: everything about fighting on one screen. Settings switch to the next option when tapped.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function showFight(player, key) {
  for (;;) {
    const record = mine(player, key);
    if (!record) return;
    const ai = record.id ? world.getEntity(record.id) : undefined;
    const styleIndex = Math.max(0, COMBAT_STYLES.findIndex((c) => c.id === (record.combat ?? "archer_sword")));
    const targetIndex = Math.max(0, TARGET_MODES.findIndex((t) => t.id === (record.targets ?? "all")));
    const response = await new ActionFormData()
      .title("Fight")
      .button("Attack a player")
      .button(`${record.mode === "guard" ? "§2" : ""}Guard here`)
      .button(`Style: §2${COMBAT_STYLES[styleIndex].label}`)
      .button(`Targets: §2${TARGET_MODES[targetIndex].label}`)
      .button(`Loot tombstones: §2${record.loot === false ? "Off" : "On"}`)
      .button("Teach a tombstone")
      .show(player);
    if (response.canceled || response.selection === undefined) return;
    const pick = response.selection;
    if (pick <= 1 && !ai?.isValid) {
      player.sendMessage(`§e${record.name} is too far. Use Teleport first.`);
      return;
    }
    if (pick === 0 && ai) return chooseAttackTarget(player, ai);
    if (pick === 1 && ai) return setMode(player, key, ai, "guard");
    if (pick === 5) return teachTomb(player);
    if (pick === 2) record.combat = COMBAT_STYLES[(styleIndex + 1) % COMBAT_STYLES.length].id;
    if (pick === 3) record.targets = TARGET_MODES[(targetIndex + 1) % TARGET_MODES.length].id;
    if (pick === 4) record.loot = record.loot === false;
    saveRecord(player.id, "fighter", record);
    toolsChanged(record.id);
  }
}

/**
 * More: the things you rarely need.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function showMore(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const response = await new ActionFormData().title("More").button("Friends & enemies").button("§cDelete").show(player);
  if (response.selection === 0) return showMemory(player);
  if (response.selection === 1) return deleteAi(player, key);
}

/**
 * Teach the Fighter what a tombstone from another add-on looks like (stand next to one).
 * @param {import("@minecraft/server").Player} player
 */
async function teachTomb(player) {
  const things = addOnThingsNear(player);
  const known = [...tombTypes().blocks, ...tombTypes().entities];
  const pick = new ActionFormData()
    .title("Teach a tombstone")
    .body(things.length ? "Which one is the tombstone?" : "§eStand next to a tombstone first.");
  things.forEach((id) => pick.button(id));
  if (known.length) pick.button("§cForget taught ones");
  const choice = await pick.show(player);
  if (choice.canceled || choice.selection === undefined) return;
  if (choice.selection >= things.length) {
    setTaught([]);
    player.sendMessage("§eForgot taught tombstones.");
    return;
  }
  setTaught([...getTaught(), things[choice.selection]]);
  player.sendMessage(`§aIt will loot: ${things[choice.selection]}`);
}

/**
 * Follow you, stay where it is, or (Fighter) guard this spot.
 * @param {import("@minecraft/server").Player} player
 * @param {string} key
 * @param {import("@minecraft/server").Entity} ai
 * @param {"follow" | "stay" | "guard"} mode
 */
function setMode(player, key, ai, mode) {
  const record = mine(player, key);
  if (!record) return;
  record.mode = mode;
  const fighter = record.role === "fighter";
  if (mode === "follow") {
    delete record.post;
    ai.triggerEvent(fighter ? "aip:fighter_follow" : "aip:resource_follow");
  } else {
    record.post = { x: ai.location.x, y: ai.location.y, z: ai.location.z, dim: ai.dimension.id };
    ai.triggerEvent(fighter ? "aip:fighter_guard" : "aip:resource_stay");
  }
  player.sendMessage(`§e${record.name}: ${{ follow: "following you", stay: "staying here", guard: "guarding here" }[mode]}`);
  saveRecord(player.id, record.role, record);
  toolsChanged(record.id);
}

// ================================================================ items


/**
 * Take cooked chicken from an AI's food slot (only what's above its own 30).
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

/** When an AI is dismissed: everything it carries goes back to the owner (except its own 30 chicken and its torches). */
/** @param {import("@minecraft/server").Player} player @param {AiRecord} record */
function returnEverything(player, record) {
  const inv = inventoryOf(record);
  for (const tool of inv.tools) if (tool) giveItem(player, stackFromTool(tool));
  for (const piece of [...ARMOR_SLOTS.map((slot) => inv.armor[slot]), inv.shield]) if (piece) giveItem(player, stackFromTool(piece));
  for (const b of inv.blocks) if (b) giveStacks(player, b.id, b.count);
  for (const v of inv.valuables) if (v) giveStacks(player, v.id, v.count);
  if (resourcePerks(record)) for (const s of inv.stash) if (s) giveStacks(player, s.id, s.count); // AI Chest (unlocked)
  for (const arm of [inv.arms.sword, inv.arms.bow]) if (arm) giveItem(player, stackFromTool(arm));
  for (const [id, n] of Object.entries(inv.bag)) if (n > 0) giveStacks(player, id, n);
  giveArrows(player, totalArrows(record));
  const food = takeableFood(record);
  if (food > 0) giveItem(player, new ItemStack(FOOD_ITEM, food));
}

// ================================================================ sugar cane farm

/**
 * Progress of the sugar cane farm, with ways to help (hand over materials), move or cancel it.
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function showFarm(player, key) {
  const record = mine(player, key);
  const plan = record?.farm;
  if (!record || !plan) return;
  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [];
  if (record.focus !== FARM_FOCUS || record.mode !== "wander") {
    actions.push({ label: "Keep building", run: () => setJob(player, key, FARM_FOCUS) });
  }
  if (plan.phase === "collect") {
    actions.push({
      label: "Give materials",
      run: () => {
        const r = mine(player, key);
        if (!r) return;
        const taken = giveFarmMaterials(player, r);
        player.sendMessage(taken.length ? `§a${r.name} took ${taken.join(", ")}.` : "§eYou have nothing it needs.");
      },
    });
    actions.push({ label: "Move farm", run: () => startPlacing(player, key) });
  }
  actions.push({
    label: "§cCancel farm",
    run: () => {
      const r = mine(player, key);
      if (!r?.farm) return;
      returnFarmMaterials(r, player, r.id ? world.getEntity(r.id) : undefined);
      removeWarp(r.farm);
      r.farm = undefined;
      r.focus = "Trees";
      saveRecord(player.id, r.role, r);
      toolsChanged(r.id);
      player.sendMessage(`§e${r.name}: farm cancelled. You got its materials back.`);
    },
  });
  const form = new ActionFormData().title("Sugar cane farm").body(farmProgress(plan));
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}

// ================================================================ AI Chest (Resource AI)

/**
 * The Resource AI's AI Chest: half its valuables go in whenever they fill up. Locked until upgraded,
 * then everything can be taken (here, or from a Computer Chest).
 * @param {import("@minecraft/server").Player} player @param {string} key
 */
async function showStash(player, key) {
  const record = mine(player, key);
  if (!record) return;
  const lines = Object.entries(stashTotals(record))
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${n} ${itemName(id)}`);
  const contents = lines.length ? lines.join("\n") : "§7Empty";
  const form = new ActionFormData().title("AI Chest");
  if (!resourcePerks(record)) {
    form.body(`§6Locked§r: level up at the Coder.\n\n${contents}`);
    form.button("OK");
    await form.show(player);
    return;
  }
  form.body(contents);
  form.button("Take all");
  form.button("Back");
  const response = await form.show(player);
  if (response.selection !== 0) return;
  const latest = mine(player, key);
  if (!latest || !resourcePerks(latest)) return;
  const stash = inventoryOf(latest).stash;
  for (const s of stash) if (s) giveStacks(player, s.id, s.count);
  stash.fill(null);
  saveRecord(player.id, latest.role, latest);
  player.sendMessage("§aTook everything from the AI Chest.");
}

// ================================================================ friends & enemies

/** Friends (never attacked) and enemies (attacked you or your AI). Kept even when the AI dies. */
/** @param {import("@minecraft/server").Player} player */
async function showMemory(player) {
  const memory = getMemory(player.id);
  const enemies = Object.entries(memory.enemies);
  const allies = Object.entries(memory.allies);
  const list = (/** @type {string[]} */ names) => (names.length ? names.join(", ") : "§7none§r");

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [{ label: "Add friend", run: () => addAlly(player) }];
  if (allies.length) actions.push({ label: "Remove friend", run: () => removeAlly(player) });
  if (enemies.length) actions.push({ label: "Forgive enemy", run: () => forgiveEnemy(player) });

  const form = new ActionFormData()
    .title("Friends & enemies")
    .body(`§aFriends:§r ${list(allies.map(([, name]) => name))}\n§cEnemies:§r ${list(enemies.map(([, e]) => e.name))}`);
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
    player.sendMessage("§7Nobody online to add.");
    return;
  }
  const form = new ActionFormData().title("Add friend");
  choices.forEach((p) => form.button(p.name));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const ally = choices[response.selection];
  memory.allies[ally.id] = ally.name;
  delete memory.enemies[ally.id];
  saveMemory(player.id, memory);
  player.sendMessage(`§a${ally.name} is now a friend.`);
}

/** @param {import("@minecraft/server").Player} player */
async function removeAlly(player) {
  const memory = getMemory(player.id);
  const allies = Object.entries(memory.allies);
  const form = new ActionFormData().title("Remove friend");
  allies.forEach(([, name]) => form.button(name));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  const [id, name] = allies[response.selection];
  delete memory.allies[id];
  saveMemory(player.id, memory);
  player.sendMessage(`§e${name} is no longer a friend.`);
}

/** @param {import("@minecraft/server").Player} player */
async function forgiveEnemy(player) {
  const memory = getMemory(player.id);
  const enemies = Object.entries(memory.enemies);
  const form = new ActionFormData().title("Forgive enemy").button("§cEveryone");
  enemies.forEach(([, e]) => form.button(e.name));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  if (response.selection === 0) {
    memory.enemies = {};
    player.sendMessage("§eForgave everyone.");
  } else {
    const [id, e] = enemies[response.selection - 1];
    delete memory.enemies[id];
    player.sendMessage(`§eForgave ${e.name}.`);
  }
  saveMemory(player.id, memory);
}

// ================================================================ food

// Every 10 seconds: each AI makes 15 cooked chicken per 10 minutes of game time, up to 45.
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
    generateFood(record); // quietly (no message)
    saveRecord(record.ownerId, record.role, record);
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
