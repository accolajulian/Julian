// AI Players: guide, shop, eggs, menus and respawning.
// The fighting brain and memory live in brain.js; saved data in data.js.
// - AI Guide block: explains everything.
// - Coder block: the shop. Buying an AI gives you an egg; throw it to spawn your AI.
// - Hit (left click) your AI to open its menu (with its Inventory). Interact (right click) to feed it,
//   put a tool or arrows in its slots, or (Fighter AI) select it and then hit a player to send it after them.
// - Allies can interact with your AI to take cooked chicken from its food slot.
// - If an AI dies it respawns next to the player who bought it, and keeps its memory.
import { world, system, ItemStack, EntityDamageCause } from "@minecraft/server";
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
  takeOneFromHand,
  giveItem,
} from "./data.js";
import { commandAttack, toolsChanged } from "./brain.js";
import {
  ALLOWED_TOOLS,
  FOOD_ITEM,
  FOOD_RESERVED,
  FOOD_CAP,
  ARROW_ITEM,
  ARROW_SLOT_MAX,
  ARROW_SLOTS,
  TOOL_SLOTS,
  inventoryOf,
  takeableFood,
  generateFood,
  minutesToNextFood,
  toolFromStack,
  stackFromTool,
  describeTool,
  addTool,
  addArrows,
  totalArrows,
  toolKind,
  itemName,
  ARMOR_SLOTS,
  ARMOR_NAMES,
  armorSlotFor,
  SHIELD_ITEM,
  BLOCK_SLOTS,
  BLOCK_SLOT_MAX,
  BAG_CAPACITY,
  addBlocks,
  totalBlocks,
  isPlaceableBlock,
  bagCount,
} from "./inventory.js";
import { FOCUSES } from "./gather_data.js";

/** @typedef {import("./data.js").RoleId} RoleId */
/** @typedef {import("./data.js").AiRecord} AiRecord */

const GUIDE_BLOCK = "aip:ai_guide";
const GOT_GUIDE_TAG = "aip_got_guide";
const MAX_NAME_LENGTH = 20;
const RESPAWN_SECONDS = 5;
const COMMAND_SECONDS = 20; // how long a selected Fighter AI waits for you to pick a target

/** @type {Record<RoleId, { title: string, egg: string, price: { item: string, amount: number, label: string }, icon: string, about: string }>} */
const ROLES = {
  resource: {
    title: "Resource AI",
    egg: "aip:resource_egg",
    price: { item: "minecraft:iron_ingot", amount: 30, label: "Iron Ingots" },
    icon: "textures/items/iron_ingot",
    about:
      "A helper that gathers resources for you.\n\n" +
      "§a+§r Follows you around and gathers what you choose: wood, stone, ores or everything\n" +
      "§a+§r Chops real trees (not log houses) and mines with the right pickaxe, like a player\n" +
      "§a+§r Never mines next to lava: covers it with blocks or backs away\n" +
      "§a+§r Keeps what it gathers in a backpack for you to collect\n" +
      "§a+§r 3 tool slots for harvesting/mining tools, used in order 1, 2, 3\n" +
      "§a+§r Armor slots, a shield slot and 2 block slots\n" +
      "§a+§r Makes 10 cooked chicken every 10 minutes (up to 30) for you to take; eats its own to heal\n" +
      "§a+§r Fights back if something attacks it, backs off to heal when hurt\n" +
      "§a+§r Respawns next to you if it dies, and remembers who attacked it\n\n" +
      "§7Health: 20 (same as a player)   Damage: 3 + tool",
  },
  fighter: {
    title: "Fighter AI",
    egg: "aip:fighter_egg",
    price: { item: "minecraft:diamond", amount: 15, label: "Diamonds" },
    icon: "textures/items/diamond",
    about:
      "A bodyguard that fights for you.\n\n" +
      "§a+§r Follows you and protects you from mobs and players\n" +
      "§a+§r Goes after the most dangerous enemy first, and protects you first when you're hurt\n" +
      "§a+§r Attacks whatever you attack\n" +
      "§a+§r Backs off to heal when badly hurt\n" +
      "§a+§r 3 tool slots for fighting tools, used in order 1, 2, 3 (next one when a tool breaks)\n" +
      "§a+§r 2 arrow slots, so it can fight with a bow or crossbow\n" +
      "§a+§r Armor slots and a shield slot (it blocks hits from the front)\n" +
      "§a+§r 2 block slots: covers lava near it so it never walks into it\n" +
      "§a+§r Makes 10 cooked chicken every 10 minutes (up to 30) for you to take; eats its own to heal\n" +
      "§a+§r Remembers players who attacked you, and never attacks your allies\n" +
      "§a+§r Can guard a spot and attack any other player who comes near\n" +
      "§a+§r Interact with it, then hit a player, to send it after them\n" +
      "§a+§r Respawns next to you if it dies, and keeps its memory\n\n" +
      "§7Health: 20 (same as a player)   Damage: 6 + tool",
  },
};
const RESOURCE_FOCUS = FOCUSES; // Wood, Stone, Ores, Everything, Nothing

/** Food you can give your AI (interact while holding it) and how much it heals. */
/** @type {Record<string, number>} */
const FOODS = {
  "minecraft:bread": 10,
  "minecraft:cooked_beef": 16,
  "minecraft:cooked_porkchop": 16,
  "minecraft:cooked_chicken": 12,
  "minecraft:golden_apple": 40,
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

const GUIDE_TEXT =
  "§lStep 1: Craft a Coder§r\n" +
  "On a crafting table:\n" +
  "  Glass  -  Glass  -  Glass\n" +
  "  Iron  -  Redstone  -  Iron\n" +
  "  Iron  -  Iron  -  Iron\n" +
  "§7(Iron = Iron Ingot)§r\n\n" +
  "§lStep 2: Buy an AI at the Coder§r\n" +
  `- Resource AI: §f${ROLES.resource.price.amount} ${ROLES.resource.price.label}§r\n` +
  `- Fighter AI: §b${ROLES.fighter.price.amount} ${ROLES.fighter.price.label}§r\n` +
  "You can own one of each. You choose its look and type its name.\n\n" +
  "§lStep 3: Throw the egg§r\n" +
  "You get an AI Egg. Use it to throw it, and your AI appears where it lands.\n\n" +
  "§lControls§r\n" +
  "- §eHit§r your AI: open its menu\n" +
  "- §eInteract§r with your AI while holding food: heal it\n" +
  "- §eInteract§r with your AI while holding a tool, armor, a shield, blocks or arrows: put it in its slots\n" +
  "- §eInteract§r with your Fighter AI (empty hand), then §ehit§r a player: it attacks them\n" +
  "- Your AI's menu has §eInventory§r and §eAllies & enemies§r\n\n" +
  "§lInventory§r\n" +
  "Food, tools 1-2-3 (used in order; next one when a tool breaks), armor, shield, 2 block slots " +
  "(no sand, gravel or other falling blocks), arrows (Fighter) and a backpack (Resource AI).\n\n" +
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
  blockComponentRegistry.registerCustomComponent("aip:guide", {
    onPlayerInteract: ({ player }) => {
      if (player) system.run(() => openMenu(player, showGuide));
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
  await new ActionFormData().title("AI Guide").body(GUIDE_TEXT).button("Got it").show(player);
}

// First time a player joins: give them an AI Guide block.
// Every time a player spawns: bring back any AI that died while they were away.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (initialSpawn && !player.hasTag(GOT_GUIDE_TAG)) {
    player.addTag(GOT_GUIDE_TAG);
    giveItem(player, new ItemStack(GUIDE_BLOCK, 1));
    player.sendMessage("§aYou got an §eAI Guide§a! Place it and tap it to learn how to get AI players.");
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
    const line2 = owned ? `§2Yours: ${owned.name}` : `§8${info.price.amount} ${info.price.label}`;
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

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
async function showRoleInfo(player, role) {
  const info = ROLES[role];
  const have = countItem(player, info.price.item);
  const enough = have >= info.price.amount;

  const response = await new MessageFormData()
    .title(info.title)
    .body(
      `${info.about}\n\n§rCost: §e${info.price.amount} ${info.price.label}§r\n` +
        `You have: ${enough ? "§a" : "§c"}${have}`
    )
    .button1(enough ? "Buy" : "Not enough")
    .button2("Back")
    .show(player);
  if (response.canceled) return;
  if (response.selection === 1) return showCoder(player);
  if (!enough) {
    player.sendMessage(`§cYou need ${info.price.amount} ${info.price.label} to buy a ${info.title}.`);
    return;
  }
  await buy(player, role);
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
async function buy(player, role) {
  const info = ROLES[role];
  const look = await chooseLook(player, info.title);
  if (look === undefined) return;
  const name = await askForName(player, info.title);
  if (name === undefined) return;

  // Check again: the inventory may have changed while the menus were open.
  if (countItem(player, info.price.item) < info.price.amount) {
    player.sendMessage(`§cYou need ${info.price.amount} ${info.price.label} to buy a ${info.title}.`);
    return;
  }
  if (getRecord(player.id, role)) {
    player.sendMessage(`§cYou already have a ${info.title}.`);
    return;
  }

  takeItem(player, info.price.item, info.price.amount);
  /** @type {AiRecord} */
  const record = { name, look, state: "egg", serial: Date.now(), mode: "follow", focus: "Everything" };
  inventoryOf(record);
  saveRecord(player.id, role, record);
  giveEgg(player, role, record);
  player.sendMessage(`§aYou bought a ${info.title}! Throw the egg to spawn §e${name}§a.`);
}

/** @param {import("@minecraft/server").Player} player @param {string} title @returns {Promise<number | undefined>} */
async function chooseLook(player, title) {
  const form = new ActionFormData().title(`${title}: choose a look`);
  LOOKS.forEach((look, i) => form.button(look, `textures/aip/icons/${i}`));
  const response = await form.show(player);
  if (response.canceled) return undefined;
  return response.selection;
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
  if (record.state === "alive") {
    actions.push({ label: "Call it to me", run: () => callToPlayer(player, role) });
  } else {
    actions.push({ label: "Get a new egg (if you lost it)", run: () => replaceEgg(player, role) });
  }
  actions.push({ label: "§cDismiss it (no refund)", run: () => dismiss(player, role) });

  const form = new ActionFormData().title(`${info.title}: ${record.name}`).body(status);
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
function callToPlayer(player, role) {
  const record = getRecord(player.id, role);
  const ai = record?.id ? world.getEntity(record.id) : undefined;
  if (!record || !ai) {
    player.sendMessage("§eYour AI is too far away to call. Go closer and try again.");
    return;
  }
  ai.teleport(player.location, { dimension: player.dimension });
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

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
async function dismiss(player, role) {
  const record = getRecord(player.id, role);
  if (!record) return;
  const confirm = await new MessageFormData()
    .title("Dismiss AI?")
    .body(`${record.name} will leave for good and you won't get your ${ROLES[role].price.label} back.`)
    .button1("Dismiss")
    .button2("Keep")
    .show(player);
  if (confirm.selection !== 0) return;

  returnEverything(player, record);
  saveRecord(player.id, role, undefined);
  const ai = record.id ? world.getEntity(record.id) : undefined;
  if (ai) ai.remove();
  world.sendMessage(`§e${record.name} left the game`);
}

// ================================================================ throwing the egg

/** @type {Map<string, { ownerId: string, role: RoleId, thrownAt: number }>} */
const flyingEggs = new Map();

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

  // Take the egg out of the player's hand.
  const container = player.getComponent("minecraft:inventory")?.container;
  if (container?.getItem(player.selectedSlotIndex)?.typeId === itemStack.typeId) {
    container.setItem(player.selectedSlotIndex, undefined);
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

// ================================================================ spawning & respawning

/**
 * @param {import("@minecraft/server").Player} owner
 * @param {RoleId} role
 * @param {import("@minecraft/server").Vector3} location
 * @param {import("@minecraft/server").Dimension} dimension
 */
function spawnAi(owner, role, location, dimension) {
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

  record.state = "alive";
  record.id = ai.id;
  record.mode = "follow";
  delete record.post;
  saveRecord(owner.id, role, record);
  world.sendMessage(`§e${record.name} joined the game`);
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

// ================================================================ hitting & interacting

// Your own hits never hurt your AI.
world.beforeEvents.entityHurt.subscribe((event) => {
  if (event.hurtEntity.typeId !== AI_ENTITY) return;
  const attacker = event.damageSource.damagingEntity;
  const info = ownerInfo(event.hurtEntity);
  if (!attacker || !info || attacker.id !== info.ownerId) return;
  event.cancel = true;

  // Hitting your own AI opens its menu (the hit handler below does this too;
  // openMenu makes sure only one menu opens).
  if (event.damageSource.cause === EntityDamageCause.entityAttack) {
    const ai = event.hurtEntity;
    const player = /** @type {import("@minecraft/server").Player} */ (attacker);
    system.run(() => openMenu(player, (p) => showAiMenu(p, ai, info.role)));
  }
});

/** Fighter AIs waiting for their owner to pick a target. */
/** @type {Map<string, { aiId: string, until: number }>} */
const commandSelections = new Map();

// Left click (hit).
world.afterEvents.entityHitEntity.subscribe(({ damagingEntity, hitEntity }) => {
  if (damagingEntity.typeId !== "minecraft:player") return;
  const player = /** @type {import("@minecraft/server").Player} */ (damagingEntity);
  const info = hitEntity.typeId === AI_ENTITY ? ownerInfo(hitEntity) : undefined;

  if (info && info.ownerId === player.id) {
    system.run(() => openMenu(player, (p) => showAiMenu(p, hitEntity, info.role)));
    return;
  }
  sendFighterAfter(player, hitEntity);
});

// Right click (interact).
world.afterEvents.playerInteractWithEntity.subscribe(({ player, target, itemStack }) => {
  const info = target.typeId === AI_ENTITY ? ownerInfo(target) : undefined;

  if (info && info.ownerId === player.id) {
    const heal = itemStack ? FOODS[itemStack.typeId] : undefined;
    if (heal) {
      feed(player, target, heal);
    } else if (itemStack && ALLOWED_TOOLS[info.role].has(itemStack.typeId)) {
      quickAddTool(player, info.role, target);
    } else if (itemStack && (armorSlotFor(itemStack.typeId) || itemStack.typeId === SHIELD_ITEM)) {
      quickAddGear(player, info.role, target);
    } else if (itemStack && isPlaceableBlock(itemStack.typeId)) {
      quickAddBlocks(player, info.role, target);
    } else if (itemStack && info.role === "fighter" && itemStack.typeId === ARROW_ITEM) {
      quickAddArrows(player, target);
    } else if (itemStack && (ALLOWED_TOOLS.fighter.has(itemStack.typeId) || ALLOWED_TOOLS.resource.has(itemStack.typeId))) {
      player.sendMessage(`§c${target.nameTag} can only use a ${toolKind(info.role)}.`);
    } else if (info.role === "fighter") {
      commandSelections.set(player.id, { aiId: target.id, until: Date.now() + COMMAND_SECONDS * 1000 });
      player.sendMessage(`§e${target.nameTag} is ready! §fNow hit the player it should attack.`);
    } else {
      player.sendMessage(`§7Hit ${target.nameTag} to open its menu. Interact while holding food to heal it.`);
    }
    return;
  }
  // Allies of the owner can take chicken from the AI's food slot.
  if (info && getMemory(info.ownerId).allies[player.id] && !commandSelections.has(player.id)) {
    system.run(() => openMenu(player, (p) => takeFood(p, info.ownerId, info.role)));
    return;
  }
  sendFighterAfter(player, target);
});

/**
 * If the player picked a Fighter AI a moment ago, send it after this target.
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").Entity} target
 */
function sendFighterAfter(player, target) {
  const selection = commandSelections.get(player.id);
  if (!selection) return;
  commandSelections.delete(player.id);
  if (Date.now() > selection.until || target.id === player.id) return;
  const ai = world.getEntity(selection.aiId);
  if (ai && ai.id !== target.id) commandAttack(player, ai, target);
}

/**
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").Entity} ai
 * @param {number} amount
 */
function feed(player, ai, amount) {
  const health = ai.getComponent("minecraft:health");
  if (!health) return;
  if (health.currentValue >= health.effectiveMax) {
    player.sendMessage(`§7${ai.nameTag} is already at full health.`);
    return;
  }
  health.setCurrentValue(Math.min(health.effectiveMax, health.currentValue + amount));
  takeOneFromHand(player);
  player.sendMessage(`§a${ai.nameTag} healed (${Math.round(health.currentValue)}/${health.effectiveMax}).`);
}

// ================================================================ AI menus (left click)

/**
 * @param {import("@minecraft/server").Player} player
 * @param {import("@minecraft/server").Entity} ai
 * @param {RoleId} role
 */
async function showAiMenu(player, ai, role) {
  const record = getRecord(player.id, role);
  if (!record || !ai.isValid) return;
  const health = ai.getComponent("minecraft:health");
  const hp = health ? `${Math.round(health.currentValue)}/${health.effectiveMax}` : "?";
  const memory = getMemory(player.id);
  const memoryLine = `Remembers ${Object.keys(memory.enemies).length} enemies, ${Object.keys(memory.allies).length} allies`;

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [];
  let body;

  if (role === "fighter") {
    const mode = record.mode === "guard" ? "Guarding a spot" : "Following and protecting you";
    const tool = inventoryOf(record).tools.find((t) => t);
    body =
      `Health: ${hp}\nRight now: §e${mode}§r\n` +
      `First tool: §e${tool ? describeTool(tool) : "fists"}§r   Arrows: ${totalArrows(record)}\n${memoryLine}`;
    actions.push({ label: "Follow and protect me", run: () => setFighterMode(player, ai, "follow") });
    actions.push({
      label: "Guard this spot\n§8Attacks any other player who comes near",
      run: () => setFighterMode(player, ai, "guard"),
    });
  } else {
    body =
      `Health: ${hp}\nFocus: §e${record.focus}§r\n${memoryLine}\n\n` +
      `Backpack: ${bagCount(record)} / ${BAG_CAPACITY}\n\n` +
      "§7Choose what it should gather. It needs a pickaxe for stone and ores (iron or better for gold, " +
      "redstone, diamonds and emeralds). Choose Nothing to just follow you.";
    for (const focus of RESOURCE_FOCUS) {
      actions.push({
        label: focus === record.focus ? `§2${focus} (current)` : focus,
        run: () => {
          record.focus = focus;
          saveRecord(player.id, role, record);
          player.sendMessage(focus === "Nothing" ? `§e${record.name} will just follow you.` : `§e${record.name} will gather: ${focus}`);
        },
      });
    }
  }
  actions.unshift({ label: `Inventory\n§8Food, tools, armor, shield, blocks${role === "fighter" ? ", arrows" : ", backpack"}`, run: () => showInventory(player, role) });
  actions.push({ label: "Allies & enemies", run: () => showMemory(player) });

  const form = new ActionFormData().title(`${record.name} (${role === "fighter" ? "Fighter" : "Resource"} AI)`).body(body);
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined || !ai.isValid) return;
  await actions[response.selection].run();
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

// ================================================================ inventory

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
async function showInventory(player, role) {
  const record = getRecord(player.id, role);
  if (!record) return;
  const inv = inventoryOf(record);
  const next = minutesToNextFood(record);
  const takeable = takeableFood(record);

  let body =
    `§lFood§r: ${inv.food} cooked chicken (§a${takeable} you can take§r)\n` +
    `§7The first ${FOOD_RESERVED} are ${record.name}'s own. ` +
    (next === undefined ? "Full." : `Next ${FOOD_RESERVED} in about ${next} min.`) +
    `§r\n\n§lTools§r §7(used in order 1, 2, 3; when one breaks it moves to the next)§r\n` +
    inv.tools.map((t, i) => `${i + 1}: ${describeTool(t)}`).join("\n");
  body +=
    `\n\n§lArmor§r: ${ARMOR_SLOTS.map((slot) => describeTool(inv.armor[slot])).join(", ")}` +
    `\n§lShield§r: ${describeTool(inv.shield)}` +
    `\n§lBlocks§r: ${inv.blocks.map((b, i) => `slot ${i + 1}: ${b ? `${b.count} ${itemName(b.id)}` : "empty"}`).join(", ")}`;
  if (role === "fighter") body += `\n§lArrows§r: ${inv.arrows.map((n, i) => `slot ${i + 1}: ${n}`).join(", ")}`;
  if (role === "resource") body += `\n§lBackpack§r: ${bagCount(record)} / ${BAG_CAPACITY} items`;

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [];
  if (takeable > 0) actions.push({ label: `Take chicken (${takeable})`, run: () => takeFood(player, player.id, role) });
  for (let i = 0; i < TOOL_SLOTS; i++) {
    actions.push({ label: `Tool slot ${i + 1}\n§8${describeTool(inv.tools[i])}`, run: () => showToolSlot(player, role, i) });
  }
  const worn = ARMOR_SLOTS.filter((slot) => inv.armor[slot]).length;
  actions.push({ label: `Armor\n§8${worn} / 4 pieces`, run: () => showGear(player, role) });
  actions.push({ label: `Shield\n§8${describeTool(inv.shield)}`, run: () => showGear(player, role) });
  actions.push({ label: `Blocks\n§8${totalBlocks(record)} / ${BLOCK_SLOT_MAX * BLOCK_SLOTS}`, run: () => showBlocks(player, role) });
  if (role === "fighter") {
    actions.push({ label: `Arrows\n§8${totalArrows(record)} / ${ARROW_SLOT_MAX * ARROW_SLOTS}`, run: () => showArrows(player) });
  }
  if (role === "resource") {
    actions.push({ label: `Backpack\n§8${bagCount(record)} / ${BAG_CAPACITY}`, run: () => collectBag(player) });
  }

  const form = new ActionFormData().title(`${record.name}'s inventory`).body(body);
  actions.forEach((a) => form.button(a.label));
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await actions[response.selection].run();
}

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

/** @param {import("@minecraft/server").Player} player @param {RoleId} role @param {number} slot */
async function showToolSlot(player, role, slot) {
  const record = getRecord(player.id, role);
  if (!record) return;
  const tools = inventoryOf(record).tools;
  const tool = tools[slot];
  const held = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
  const heldOk = held && ALLOWED_TOOLS[role].has(held.typeId) && held.amount === 1;

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [];
  if (heldOk) {
    actions.push({
      label: tool ? `Swap in your ${itemName(held.typeId)}` : `Put your ${itemName(held.typeId)} here`,
      run: () => putHeldTool(player, role, slot),
    });
  }
  if (tool) actions.push({ label: `Take back ${describeTool(tool)}`, run: () => takeTool(player, role, slot) });
  if (tool && slot > 0) actions.push({ label: `Move up to slot ${slot}`, run: () => moveTool(player, role, slot, slot - 1) });
  if (tool && slot < TOOL_SLOTS - 1) actions.push({ label: `Move down to slot ${slot + 2}`, run: () => moveTool(player, role, slot, slot + 1) });

  const hint = heldOk ? "" : `\n\n§7To put a tool here, hold a ${toolKind(role)} and open this again.`;
  const form = new ActionFormData().title(`Tool slot ${slot + 1}`).body(`${describeTool(tool)}${hint}`);
  actions.forEach((a) => form.button(a.label));
  form.button("Back");
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  if (response.selection >= actions.length) return showInventory(player, role);
  await actions[response.selection].run();
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role @param {number} slot */
function putHeldTool(player, role, slot) {
  const record = getRecord(player.id, role);
  const container = player.getComponent("minecraft:inventory")?.container;
  const held = container?.getItem(player.selectedSlotIndex);
  if (!record || !container || !held || !ALLOWED_TOOLS[role].has(held.typeId)) return;
  const tools = inventoryOf(record).tools;
  const old = tools[slot];
  tools[slot] = toolFromStack(held);
  container.setItem(player.selectedSlotIndex, old ? stackFromTool(old) : undefined);
  saveRecord(player.id, role, record);
  toolsChanged(record.id);
  player.sendMessage(`§a${record.name} has a ${itemName(held.typeId)} in slot ${slot + 1}.`);
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role @param {number} slot */
function takeTool(player, role, slot) {
  const record = getRecord(player.id, role);
  const tool = record ? inventoryOf(record).tools[slot] : undefined;
  if (!record || !tool) return;
  inventoryOf(record).tools[slot] = null;
  saveRecord(player.id, role, record);
  toolsChanged(record.id);
  giveItem(player, stackFromTool(tool));
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role @param {number} from @param {number} to */
function moveTool(player, role, from, to) {
  const record = getRecord(player.id, role);
  if (!record) return;
  const tools = inventoryOf(record).tools;
  [tools[from], tools[to]] = [tools[to], tools[from]];
  saveRecord(player.id, role, record);
  toolsChanged(record.id);
  return showToolSlot(player, role, to);
}

/** @param {import("@minecraft/server").Player} player */
async function showArrows(player) {
  const record = getRecord(player.id, "fighter");
  if (!record) return;
  const inv = inventoryOf(record);
  const have = countItem(player, ARROW_ITEM);
  const response = await new ActionFormData()
    .title("Arrow slots")
    .body(`${inv.arrows.map((n, i) => `Slot ${i + 1}: ${n} / ${ARROW_SLOT_MAX}`).join("\n")}\n\nYou have ${have} arrows.`)
    .button("Add my arrows")
    .button("Take the arrows back")
    .button("Back")
    .show(player);
  if (response.canceled) return;
  if (response.selection === 0) {
    const added = addArrows(record, have);
    if (added > 0) takeItem(player, ARROW_ITEM, added);
    saveRecord(player.id, "fighter", record);
    toolsChanged(record.id);
    player.sendMessage(added > 0 ? `§aAdded ${added} arrows.` : "§eNo room for more arrows (or you have none).");
  } else if (response.selection === 1) {
    const total = totalArrows(record);
    inv.arrows = [0, 0];
    saveRecord(player.id, "fighter", record);
    toolsChanged(record.id);
    if (total > 0) giveArrows(player, total);
  } else {
    return showInventory(player, "fighter");
  }
}

/**
 * Armor and shield: put on what you're holding, or take pieces back.
 * @param {import("@minecraft/server").Player} player @param {RoleId} role
 */
async function showGear(player, role) {
  const record = getRecord(player.id, role);
  if (!record) return;
  const inv = inventoryOf(record);
  const held = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
  const heldSlot = held ? armorSlotFor(held.typeId) : undefined;
  const heldShield = held?.typeId === SHIELD_ITEM;

  /** @type {{ label: string, run: () => unknown }[]} */
  const actions = [];
  if (held && (heldSlot || heldShield)) {
    actions.push({ label: `Put on your ${itemName(held.typeId)}`, run: () => quickAddGear(player, role, undefined) });
  }
  for (const slot of ARMOR_SLOTS) {
    const piece = inv.armor[slot];
    if (piece) actions.push({ label: `Take back ${ARMOR_NAMES[slot].toLowerCase()}\n§8${describeTool(piece)}`, run: () => takeGear(player, role, slot) });
  }
  if (inv.shield) actions.push({ label: `Take back shield\n§8${describeTool(inv.shield)}`, run: () => takeGear(player, role, "shield") });

  const body =
    ARMOR_SLOTS.map((slot) => `${ARMOR_NAMES[slot]}: ${describeTool(inv.armor[slot])}`).join("\n") +
    `\nShield: ${describeTool(inv.shield)}\n\n§7To add armor or a shield, hold it and open this again ` +
    `(or interact with ${record.name} while holding it). Armor wears down when it gets hurt. ` +
    "The shield blocks hits from the front; an axe knocks it down for a few seconds.";
  const form = new ActionFormData().title("Armor & shield").body(body);
  actions.forEach((a) => form.button(a.label));
  form.button("Back");
  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  if (response.selection >= actions.length) return showInventory(player, role);
  await actions[response.selection].run();
}

/**
 * Puts the armor piece or shield the player is holding on their AI (swapping out the old one).
 * @param {import("@minecraft/server").Player} player @param {RoleId} role
 * @param {import("@minecraft/server").Entity | undefined} ai
 */
function quickAddGear(player, role, ai) {
  const record = getRecord(player.id, role);
  const container = player.getComponent("minecraft:inventory")?.container;
  const held = container?.getItem(player.selectedSlotIndex);
  if (!record || !container || !held) return;
  const inv = inventoryOf(record);
  const slot = armorSlotFor(held.typeId);
  let old;
  if (slot) {
    old = inv.armor[slot];
    inv.armor[slot] = toolFromStack(held);
  } else if (held.typeId === SHIELD_ITEM) {
    old = inv.shield;
    inv.shield = toolFromStack(held);
  } else {
    return;
  }
  container.setItem(player.selectedSlotIndex, old ? stackFromTool(old) : undefined);
  saveRecord(player.id, role, record);
  toolsChanged(ai?.id ?? record.id);
  player.sendMessage(`§a${record.name} put on the ${itemName(held.typeId)}.`);
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role @param {import("./inventory.js").ArmorSlot | "shield"} slot */
function takeGear(player, role, slot) {
  const record = getRecord(player.id, role);
  if (!record) return;
  const inv = inventoryOf(record);
  const piece = slot === "shield" ? inv.shield : inv.armor[slot];
  if (!piece) return;
  if (slot === "shield") inv.shield = null;
  else inv.armor[slot] = null;
  saveRecord(player.id, role, record);
  toolsChanged(record.id);
  giveItem(player, stackFromTool(piece));
}

/** @param {import("@minecraft/server").Player} player @param {RoleId} role */
async function showBlocks(player, role) {
  const record = getRecord(player.id, role);
  if (!record) return;
  const inv = inventoryOf(record);
  const held = player.getComponent("minecraft:inventory")?.container?.getItem(player.selectedSlotIndex);
  const heldOk = held && isPlaceableBlock(held.typeId);
  const response = await new ActionFormData()
    .title("Block slots")
    .body(
      inv.blocks.map((b, i) => `Slot ${i + 1}: ${b ? `${b.count} / ${BLOCK_SLOT_MAX} ${itemName(b.id)}` : "empty"}`).join("\n") +
        `\n\n§7${record.name} uses these to cover lava. Only solid building blocks: ` +
        "no sand, gravel, concrete powder or anything else that falls, and nothing explosive."
    )
    .button(heldOk ? `Add your ${itemName(held.typeId)}` : "Add blocks\n§8Hold the blocks first")
    .button("Take all blocks back")
    .button("Back")
    .show(player);
  if (response.canceled) return;
  if (response.selection === 0) {
    if (heldOk) quickAddBlocks(player, role, undefined);
    else player.sendMessage("§eHold a stack of solid blocks (not sand or gravel) and try again.");
  } else if (response.selection === 1) {
    for (const b of inv.blocks) if (b) giveStacks(player, b.id, b.count);
    inv.blocks = [null, null];
    saveRecord(player.id, role, record);
  } else {
    return showInventory(player, role);
  }
}

/**
 * Moves the blocks the player is holding (that stack) into their AI's block slots.
 * @param {import("@minecraft/server").Player} player @param {RoleId} role
 * @param {import("@minecraft/server").Entity | undefined} ai
 */
function quickAddBlocks(player, role, ai) {
  const record = getRecord(player.id, role);
  const container = player.getComponent("minecraft:inventory")?.container;
  const held = container?.getItem(player.selectedSlotIndex);
  if (!record || !container || !held) return;
  if (!isPlaceableBlock(held.typeId)) {
    player.sendMessage("§c" + record.name + " only takes solid building blocks (no sand, gravel or falling blocks).");
    return;
  }
  const added = addBlocks(record, held.typeId, held.amount);
  if (added === 0) {
    player.sendMessage(`§e${record.name}'s block slots are full.`);
    return;
  }
  if (added >= held.amount) {
    container.setItem(player.selectedSlotIndex, undefined);
  } else {
    held.amount -= added;
    container.setItem(player.selectedSlotIndex, held);
  }
  saveRecord(player.id, role, record);
  toolsChanged(ai?.id ?? record.id);
  player.sendMessage(`§a${record.name} took ${added} ${itemName(held.typeId)} (${totalBlocks(record)} blocks).`);
}

/** The Resource AI's backpack: everything it gathered. */
/** @param {import("@minecraft/server").Player} player */
async function collectBag(player) {
  const record = getRecord(player.id, "resource");
  if (!record) return;
  const bag = inventoryOf(record).bag;
  const entries = Object.entries(bag).filter(([, n]) => n > 0);
  const response = await new MessageFormData()
    .title(`${record.name}'s backpack`)
    .body(entries.length ? entries.map(([id, n]) => `${n} ${itemName(id)}`).join("\n") : "Empty.")
    .button1(entries.length ? "Take everything" : "OK")
    .button2("Back")
    .show(player);
  if (response.canceled) return;
  if (response.selection === 1) return showInventory(player, "resource");
  if (!entries.length) return;
  for (const [id, n] of entries) giveStacks(player, id, n);
  inventoryOf(record).bag = {};
  saveRecord(player.id, "resource", record);
  toolsChanged(record.id); // room again: start gathering right away
  player.sendMessage(`§aYou collected everything from ${record.name}'s backpack.`);
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

/** @param {import("@minecraft/server").Player} player @param {RoleId} role @param {import("@minecraft/server").Entity} ai */
function quickAddTool(player, role, ai) {
  const record = getRecord(player.id, role);
  const container = player.getComponent("minecraft:inventory")?.container;
  const held = container?.getItem(player.selectedSlotIndex);
  if (!record || !container || !held) return;
  const slot = addTool(record, toolFromStack(held));
  if (slot === -1) {
    player.sendMessage(`§e${record.name}'s tool slots are full. Hit it and open Inventory to swap tools.`);
    return;
  }
  container.setItem(player.selectedSlotIndex, undefined);
  saveRecord(player.id, role, record);
  toolsChanged(ai.id);
  player.sendMessage(`§a${record.name} put the ${itemName(held.typeId)} in slot ${slot + 1}.`);
}

/** @param {import("@minecraft/server").Player} player @param {import("@minecraft/server").Entity} ai */
function quickAddArrows(player, ai) {
  const record = getRecord(player.id, "fighter");
  if (!record) return;
  const added = addArrows(record, countItem(player, ARROW_ITEM));
  if (added === 0) {
    player.sendMessage(`§e${record.name}'s arrow slots are full.`);
    return;
  }
  takeItem(player, ARROW_ITEM, added);
  saveRecord(player.id, "fighter", record);
  toolsChanged(ai.id);
  player.sendMessage(`§a${record.name} took ${added} arrows (${totalArrows(record)} total).`);
}

/** @param {import("@minecraft/server").Player} player @param {number} total */
function giveArrows(player, total) {
  while (total > 0) {
    const n = Math.min(64, total);
    giveItem(player, new ItemStack(ARROW_ITEM, n));
    total -= n;
  }
}

/** When an AI is dismissed: everything it carries (except its own 10 chicken) goes back to the owner. */
/** @param {import("@minecraft/server").Player} player @param {AiRecord} record */
function returnEverything(player, record) {
  const inv = inventoryOf(record);
  for (const tool of inv.tools) if (tool) giveItem(player, stackFromTool(tool));
  for (const piece of [...ARMOR_SLOTS.map((slot) => inv.armor[slot]), inv.shield]) if (piece) giveItem(player, stackFromTool(piece));
  for (const b of inv.blocks) if (b) giveStacks(player, b.id, b.count);
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
