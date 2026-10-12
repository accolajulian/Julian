// AI Players: guide, shop, eggs, menus and respawning.
// The fighting brain and memory live in brain.js; saved data in data.js.
// - AI Guide block: explains everything.
// - Coder block: the shop. Buying an AI gives you an egg; throw it to spawn your AI.
// - Hit (left click) your AI to open its menu. Interact (right click) to feed it, give it a
//   weapon, or (Fighter AI) select it and then hit a player to send it after them.
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
import { WEAPONS, commandAttack, giveWeapon, returnWeapons, bestWeapon, itemName } from "./brain.js";

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
      "§a+§r Follows you around\n" +
      "§a+§r Hit it to choose what it should focus on getting\n" +
      "§a+§r Fights back if something attacks it, backs off to heal when hurt\n" +
      "§a+§r Respawns next to you if it dies, and remembers who attacked it\n\n" +
      "§7Health: 30   Damage: 3\n" +
      "§7Gathering is being added in a later update.",
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
      "§a+§r Uses the best weapon you give it (or picks up)\n" +
      "§a+§r Remembers players who attacked you, and never attacks your allies\n" +
      "§a+§r Can guard a spot and attack any other player who comes near\n" +
      "§a+§r Interact with it, then hit a player, to send it after them\n" +
      "§a+§r Respawns next to you if it dies, and keeps its memory\n\n" +
      "§7Health: 60   Damage: 6 + weapon",
  },
};
const RESOURCE_FOCUS = ["Wood", "Stone", "Ores", "Everything"];

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
  "- §eInteract§r with your Fighter AI while holding a sword or axe: give it the weapon\n" +
  "- §eInteract§r with your Fighter AI (empty hand), then §ehit§r a player: it attacks them\n" +
  "- Your AI's menu has §eAllies & enemies§r: add friends it must never attack\n\n" +
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

  if (role === "fighter") returnWeapons(player);
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
    } else if (info.role === "fighter" && itemStack && WEAPONS[itemStack.typeId] !== undefined) {
      if (giveWeapon(player, target, itemStack.typeId)) takeOneFromHand(player);
    } else if (info.role === "fighter") {
      commandSelections.set(player.id, { aiId: target.id, until: Date.now() + COMMAND_SECONDS * 1000 });
      player.sendMessage(`§e${target.nameTag} is ready! §fNow hit the player it should attack.`);
    } else {
      player.sendMessage(`§7Hit ${target.nameTag} to open its menu. Interact while holding food to heal it.`);
    }
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
    const weapon = bestWeapon(record.weapons);
    body =
      `Health: ${hp}\nRight now: §e${mode}§r\n` +
      `Weapon: §e${weapon ? itemName(weapon) : "fists"}§r (carrying ${record.weapons?.length ?? 0})\n${memoryLine}`;
    actions.push({ label: "Follow and protect me", run: () => setFighterMode(player, ai, "follow") });
    actions.push({
      label: "Guard this spot\n§8Attacks any other player who comes near",
      run: () => setFighterMode(player, ai, "guard"),
    });
    if (record.weapons?.length) actions.push({ label: "Give my weapons back", run: () => returnWeapons(player) });
  } else {
    body =
      `Health: ${hp}\nFocus: §e${record.focus}§r\n${memoryLine}\n\n` +
      "§7Choose what it should focus on getting. (Gathering is coming in a later update.)";
    for (const focus of RESOURCE_FOCUS) {
      actions.push({
        label: focus === record.focus ? `§2${focus} (current)` : focus,
        run: () => {
          record.focus = focus;
          saveRecord(player.id, role, record);
          player.sendMessage(`§e${record.name} will focus on: ${focus}`);
        },
      });
    }
  }
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
