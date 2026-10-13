// The AI's inventory screen: a real 27-slot inventory (like a chest) that opens when its owner
// right clicks it. Every slot has a job; empty slots show a gray label icon saying what goes there.
//
// The AI's saved record is the source of truth. Several times a second this file:
// - reads what the owner changed in the inventory and saves it into the record, but only if the
//   item is allowed in that slot (anything else is handed back to the owner);
// - writes the record back into the inventory (so tool wear, arrows used, ores mined, chicken
//   made... show up), and puts the labels back in empty slots.
// The AI's own 10 chicken, its torches and its water bucket are shown on info labels, so they can't be taken.
import { world, system, ItemStack } from "@minecraft/server";
import { AI_ENTITY, getAi, saveRecord, findPlayer, knownAis, giveItem } from "./data.js";
import { levelText } from "./levels.js";
import {
  inventoryOf,
  toolFromStack,
  stackFromTool,
  toolsFor,
  toolKind,
  SWORDS,
  RANGED,
  ARMOR_ALLOWED,
  ARMOR_NAMES,
  SHIELD_ITEM,
  FOOD_ITEM,
  FOOD_RESERVED,
  FOOD_CAP,
  ARROW_ITEM,
  ARROW_SLOT_MAX,
  BLOCK_SLOT_MAX,
  VALUABLE_SLOT_MAX,
  TORCH_STACK,
  isPlaceableBlock,
  isValuable,
  stashCount,
} from "./inventory.js";

const SYNC_TICKS = 5;

/** Label items for empty slots. */
const LABEL = {
  tool: "aip:slot_tool",
  weapon: "aip:slot_weapon",
  armor: "aip:slot_armor",
  shield: "aip:slot_shield",
  food: "aip:slot_food",
  arrows: "aip:slot_arrows",
  blocks: "aip:slot_blocks",
  valuables: "aip:slot_valuables",
  info: "aip:slot_info",
  water: "aip:slot_water",
};
export const LABEL_ITEMS = new Set(Object.values(LABEL));

/**
 * @typedef {{ kind: "tool", i: number } | { kind: "sword" } | { kind: "bow" } |
 *   { kind: "armor", slot: "head" | "chest" | "legs" | "feet" } | { kind: "shield" } | { kind: "food" } |
 *   { kind: "arrows", i: number } | { kind: "blocks", i: number } | { kind: "valuables", i: number } |
 *   { kind: "info", text: (record: import("./data.js").AiRecord) => string, lore?: string[], icon?: keyof typeof LABEL }} Slot
 */

/**
 * The 27 slots (3 rows of 9) for each kind of AI.
 * @param {import("./data.js").RoleId} role
 * @param {boolean} [evolved]  a Fighter that was a Resource AI (it has torches, water and an AI Chest too)
 * @returns {Slot[]}
 */
function layout(role, evolved = false) {
  /** @type {Slot[]} */
  const tools = [0, 1, 2].map((i) => ({ kind: "tool", i }));
  /** @type {Slot[]} */
  const armor = [
    { kind: "armor", slot: "head" },
    { kind: "armor", slot: "chest" },
    { kind: "armor", slot: "legs" },
    { kind: "armor", slot: "feet" },
  ];
  /** @type {Slot[]} */
  const arrows = [0, 1].map((i) => ({ kind: "arrows", i }));
  /** @type {Slot[]} */
  const blocks = [0, 1].map((i) => ({ kind: "blocks", i }));
  /** @type {Slot[]} */
  const valuables = [...Array(10).keys()].map((i) => ({ kind: "valuables", i }));
  /** @type {Slot} */
  const foodInfo = {
    kind: "info",
    text: (r) => `Food: ${Math.min(inventoryOf(r).food, FOOD_RESERVED)}/${FOOD_RESERVED} of its own chicken`,
    lore: ["§7It eats these to heal. They can't be taken.", "§7The slot next to this has the spare chicken."],
  };

  /** @type {Slot} */
  const torchInfo = {
    kind: "info",
    text: (r) => `Torches: ${inventoryOf(r).torches}/${TORCH_STACK} (its own)`,
    lore: ["§7It places one about every 10 blocks underground.", "§7They refill and can't be taken."],
  };
  /** @type {Slot} */
  const waterInfo = {
    kind: "info",
    icon: "water",
    text: () => "Water bucket (infinite, its own)",
    lore: ["§7It pours it to get down into ravines", "§7and swim back up. It can't be taken."],
  };
  if (role === "fighter" && evolved) {
    return [
      // Row 1: tools 1-2-3, arrows, shield, name + AI Chest, torches, water
      ...tools, ...arrows, { kind: "shield" },
      {
        kind: "info",
        text: (r) => `${r.name} (Fighter AI${r.upgraded ? " Max" : ""}) - ${levelText(r)} - AI Chest: ${stashCount(r)}`,
        lore: ["§7Tools are used in order 1, 2, 3: weapons for", "§7fighting, pickaxes/axes/shovels for gathering.", "§7Left click it for commands."],
      },
      torchInfo,
      waterInfo,
      // Row 2: armor, blocks, food, first valuable
      ...armor, ...blocks, foodInfo, { kind: "food" }, valuables[0],
      // Row 3: valuables 2-10
      ...valuables.slice(1),
    ];
  }
  if (role === "resource") {
    return [
      // Row 1: tools 1-2-3, shield, torches, info
      ...tools, { kind: "shield" },
      torchInfo,
      {
        kind: "info",
        text: (r) => `${r.name} (Resource AI${r.upgraded ? "+" : ""}) - ${levelText(r)} - AI Chest: ${stashCount(r)}`,
        lore: ["§7Tools are used in order 1, 2, 3.", "§7When its valuables fill up, half goes in its", "§7AI Chest. Unlocked by the upgrade."],
      },
      { kind: "info", text: (r) => (r.mode === "wander" ? `Wandering: ${r.focus}` : "Following you"), lore: ["§7Left click it to change."] },
      waterInfo,
      { kind: "info", text: () => "Mining/harvesting tools only", lore: ["§7Pickaxes, axes, shovels, hoes, shears."] },
      // Row 2: armor, blocks, food, first valuable
      ...armor, ...blocks, foodInfo, { kind: "food" }, valuables[0],
      // Row 3: valuables 2-10
      ...valuables.slice(1),
    ];
  }
  return [
    // Row 1: tools 1-2-3 (weapons), arrows, shield, info
    ...tools, ...arrows, { kind: "shield" },
    { kind: "info", text: (r) => `${r.name} (Fighter AI) - ${levelText(r)}`, lore: ["§7Tools are used in order 1, 2, 3.", "§7When one breaks it uses the next."] },
    { kind: "info", text: () => "Weapons go in the tool slots", lore: ["§7Swords, axes, trident, mace, bow, crossbow."] },
    { kind: "info", text: () => "Left click it for commands", lore: ["§7Teleport, attack, follow, guard, settings."] },
    // Row 2: armor, blocks, food, first valuable
    ...armor, ...blocks, foodInfo, { kind: "food" }, valuables[0],
    // Row 3: valuables 2-10
    ...valuables.slice(1),
  ];
}

/**
 * @param {keyof typeof LABEL} kind
 * @param {string} name
 * @param {string[]} [lore]
 */
function label(kind, name, lore) {
  const item = new ItemStack(LABEL[kind], 1);
  item.nameTag = `§r§7${name}`;
  if (lore) item.setLore(lore);
  return item;
}

/**
 * What a slot should show right now.
 * @param {import("./data.js").AiRecord} record
 * @param {import("./data.js").RoleId} role
 * @param {Slot} s
 * @returns {ItemStack}
 */
function expected(record, role, s) {
  const inv = inventoryOf(record);
  /** @param {{ id: string, count: number } | null | undefined} st */
  const stack = (st) => (st && st.count > 0 ? new ItemStack(st.id, Math.min(st.count, new ItemStack(st.id, 1).maxAmount)) : undefined);
  switch (s.kind) {
    case "tool": {
      const t = inv.tools[s.i];
      const order = ["used first", "used second", "used third"][s.i];
      const what = role === "fighter" && record.evolved ? "fighting or mining tool" : role === "fighter" ? "fighting tool" : "mining/harvesting tool";
      return t ? stackFromTool(t) : label(role === "fighter" ? "weapon" : "tool", `Tool ${s.i + 1} (${order})`, [`§7Put a ${what} here.`]);
    }
    case "sword":
      return inv.arms.sword ? stackFromTool(inv.arms.sword) : label("weapon", "Sword", ["§7Used against mobs."]);
    case "bow":
      return inv.arms.bow ? stackFromTool(inv.arms.bow) : label("weapon", "Bow or crossbow", ["§7The only way it fights players."]);
    case "armor": {
      const piece = inv.armor[s.slot];
      return piece ? stackFromTool(piece) : label("armor", ARMOR_NAMES[s.slot]);
    }
    case "shield":
      return inv.shield ? stackFromTool(inv.shield) : label("shield", "Shield");
    case "food": {
      const spare = Math.max(0, inv.food - FOOD_RESERVED);
      return spare > 0 ? new ItemStack(FOOD_ITEM, spare) : label("food", "Spare chicken (none yet)", ["§710 more every 10 minutes, up to 20 spare."]);
    }
    case "arrows":
      return inv.arrows[s.i] > 0 ? new ItemStack(ARROW_ITEM, inv.arrows[s.i]) : label("arrows", `Arrows ${s.i + 1}`);
    case "blocks":
      return stack(inv.blocks[s.i]) ?? label("blocks", `Blocks ${s.i + 1}`, ["§7Solid blocks only: no sand, gravel or", "§7anything that falls. Used to bridge and cover lava."]);
    case "valuables":
      return stack(inv.valuables[s.i]) ?? label("valuables", `Valuables ${s.i + 1}`, ["§7Diamonds, gold, iron, coal, netherite..."]);
    case "info":
      return label(s.icon ?? "info", s.text(record), s.lore);
  }
}

/**
 * Saves what the owner put in (or took out of) a slot. Returns false if the item isn't allowed there.
 * @param {import("./data.js").AiRecord} record
 * @param {import("./data.js").RoleId} role
 * @param {Slot} s
 * @param {ItemStack | undefined} item  undefined = the slot was emptied
 */
function apply(record, role, s, item) {
  const inv = inventoryOf(record);
  const id = item?.typeId ?? "";
  const n = item?.amount ?? 0;
  switch (s.kind) {
    case "tool":
      if (item && !(toolsFor(record).has(id) && n === 1)) return false;
      inv.tools[s.i] = item ? toolFromStack(item) : null;
      return true;
    case "sword":
    case "bow":
      if (item && !((s.kind === "sword" ? SWORDS : RANGED).has(id) && n === 1)) return false;
      inv.arms[s.kind] = item ? toolFromStack(item) : null;
      return true;
    case "armor":
      if (item && !(ARMOR_ALLOWED[s.slot].has(id) && n === 1)) return false;
      inv.armor[s.slot] = item ? toolFromStack(item) : null;
      return true;
    case "shield":
      if (item && !(id === SHIELD_ITEM && n === 1)) return false;
      inv.shield = item ? toolFromStack(item) : null;
      return true;
    case "food": {
      const own = Math.min(inv.food, FOOD_RESERVED); // its own chicken never change here
      if (item && !(id === FOOD_ITEM && own + n <= FOOD_CAP)) return false;
      inv.food = own + n;
      return true;
    }
    case "arrows":
      if (item && !(id === ARROW_ITEM && n <= ARROW_SLOT_MAX)) return false;
      inv.arrows[s.i] = n;
      return true;
    case "blocks":
      if (item && !(isPlaceableBlock(id) && n <= BLOCK_SLOT_MAX)) return false;
      inv.blocks[s.i] = item ? { id, count: n } : null;
      return true;
    case "valuables":
      if (item && !(isValuable(id) && n <= VALUABLE_SLOT_MAX)) return false;
      inv.valuables[s.i] = item ? { id, count: n } : null;
      return true;
    case "info":
      return !item; // nothing can go on an info label
  }
}

/** @param {ItemStack | undefined} item */
function signature(item) {
  if (!item) return "-";
  return `${item.typeId}|${item.amount}|${item.getComponent("minecraft:durability")?.damage ?? 0}|${item.nameTag ?? ""}`;
}

/** What each AI's inventory looked like the last time it was synced. @type {Map<string, string[]>} */
const snapshots = new Map();

/**
 * Syncs an inventory screen with an AI's record. Used for the AI itself and for Computer Chests
 * showing an upgraded AI's inventory.
 * @param {import("@minecraft/server").Entity} ai  the AI, or a Computer Chest
 * @param {string} ownerId
 * @param {import("./data.js").RoleId} role
 * @param {string} key
 */
export function sync(ai, ownerId, role, key) {
  stashSnapshots.delete(ai.id);
  const container = ai.getComponent("minecraft:inventory")?.container;
  let record = getAi(key);
  if (!container || !record) return;
  if (role === "resource") returnOldWeapons(record, ownerId);
  const slots = layout(role, !!record.evolved).slice(0, container.size);
  const current = slots.map((_, i) => container.getItem(i));
  const snap = snapshots.get(ai.id);

  // What did the owner change since last time?
  if (snap) {
    const owner = findPlayer(ownerId);
    let changed = false;
    current.forEach((item, i) => {
      if (signature(item) === snap[i] || !record) return;
      changed = true;
      const emptied = !item || LABEL_ITEMS.has(item.typeId);
      if (!apply(record, role, slots[i], emptied ? undefined : item) && item) {
        // Not allowed here. In a chest screen, putting an item on a slot swaps it with what was
        // there, so the owner now holds the old item: count that slot as emptied (no duplicates)
        // and hand the new item back.
        apply(record, role, slots[i], undefined);
        if (owner) giveItem(owner, item);
        else ai.dimension.spawnItem(item, ai.location);
        owner?.sendMessage(`§c${slotHelp(slots[i], record)}`);
      }
    });
    if (changed) {
      saveRecord(ownerId, role, record);
      record = getAi(key) ?? record;
    }
  }

  // Show the record (plus labels in empty slots).
  const want = slots.map((s) => expected(record, role, s));
  const wantSig = want.map(signature);
  wantSig.forEach((sig, i) => {
    if (sig !== signature(container.getItem(i))) container.setItem(i, want[i]);
  });
  snapshots.set(ai.id, wantSig);
}

/**
 * The Resource AI no longer has sword, bow or arrow slots: give anything left in them back.
 * @param {import("./data.js").AiRecord} record
 * @param {string} ownerId
 */
function returnOldWeapons(record, ownerId) {
  const inv = inventoryOf(record);
  const arrows = inv.arrows.reduce((a, b) => a + b, 0);
  if (!inv.arms.sword && !inv.arms.bow && arrows === 0) return;
  const owner = findPlayer(ownerId);
  if (!owner) return;
  for (const item of [inv.arms.sword, inv.arms.bow]) if (item) giveItem(owner, stackFromTool(item));
  for (let n = arrows; n > 0; n -= 64) giveItem(owner, new ItemStack(ARROW_ITEM, Math.min(64, n)));
  inv.arms = { sword: null, bow: null };
  inv.arrows = [0, 0];
  saveRecord(ownerId, "resource", record);
  owner.sendMessage(`§e${record.name} doesn't fight anymore, so it gave you back its sword, bow and arrows.`);
}

/**
 * A Computer Chest that isn't showing an AI: every slot is a label, and anything put in goes back.
 * @param {import("@minecraft/server").Entity} chest
 * @param {string} ownerId
 * @param {string} message
 */
export function syncEmpty(chest, ownerId, message) {
  const container = chest.getComponent("minecraft:inventory")?.container;
  if (!container) return;
  snapshots.delete(chest.id);
  stashSnapshots.delete(chest.id);
  const owner = findPlayer(ownerId);
  for (let i = 0; i < container.size; i++) {
    const item = container.getItem(i);
    if (item && !LABEL_ITEMS.has(item.typeId)) {
      if (owner) giveItem(owner, item);
      else chest.dimension.spawnItem(item, chest.location);
    }
    if (item?.typeId !== LABEL.info || item.nameTag !== `§r§7${message}`) {
      container.setItem(i, label("info", message, ["§7Left click the chest to choose an upgraded AI."]));
    }
  }
}

/** What each Computer Chest showing an AI Chest looked like last time. @type {Map<string, string[]>} */
const stashSnapshots = new Map();

/**
 * Shows an upgraded Resource AI's AI Chest in a Computer Chest. Items can be taken out, not put in.
 * @param {import("@minecraft/server").Entity} chest
 * @param {string} ownerId
 * @param {string} key
 */
export function syncStash(chest, ownerId, key) {
  const container = chest.getComponent("minecraft:inventory")?.container;
  const record = getAi(key);
  if (!container || !record) return;
  snapshots.delete(chest.id);
  const stash = inventoryOf(record).stash;
  const snap = stashSnapshots.get(chest.id);
  const owner = findPlayer(ownerId);
  const giveBack = (/** @type {ItemStack} */ item) => {
    if (owner) giveItem(owner, item);
    else chest.dimension.spawnItem(item, chest.location);
  };

  if (snap) {
    let changed = false;
    for (let i = 0; i < Math.min(container.size, stash.length); i++) {
      const item = container.getItem(i);
      if (signature(item) === snap[i]) continue;
      const had = stash[i];
      changed = true;
      if (!item || LABEL_ITEMS.has(item.typeId)) {
        stash[i] = null; // taken out
      } else if (had && item.typeId === had.id && item.amount <= had.count) {
        had.count = item.amount; // some taken out
      } else if (had && item.typeId === had.id) {
        const extra = item.clone();
        extra.amount = item.amount - had.count;
        giveBack(extra); // nothing can be added
      } else {
        // Something put in: hand it back. (Swapping means the old item was taken.)
        giveBack(item);
        stash[i] = null;
        owner?.sendMessage("§cYou can only take things out of the AI Chest.");
      }
    }
    if (changed) saveRecord(ownerId, "resource", record);
  }

  /** @type {ItemStack[]} */
  const want = [];
  for (let i = 0; i < container.size; i++) {
    const s = stash[i];
    want.push(s ? new ItemStack(s.id, s.count) : label("valuables", "AI Chest (empty)", ["§7Half its valuables go here when they fill up."]));
  }
  const wantSig = want.map(signature);
  wantSig.forEach((sig, i) => {
    if (sig !== signature(container.getItem(i))) container.setItem(i, want[i]);
  });
  stashSnapshots.set(chest.id, wantSig);
}

/** @param {Slot} s @param {import("./data.js").AiRecord} record */
function slotHelp(s, record) {
  switch (s.kind) {
    case "tool":
      return `Tool slots take one ${toolKind(record)}.`;
    case "sword":
      return "That slot takes one sword.";
    case "bow":
      return "That slot takes one bow or crossbow.";
    case "armor":
      return `That slot only takes ${ARMOR_NAMES[s.slot].toLowerCase()}.`;
    case "shield":
      return "That slot only takes a shield.";
    case "food":
      return `The food slot only takes cooked chicken (up to ${FOOD_CAP} in total).`;
    case "arrows":
      return "Arrow slots only take arrows.";
    case "blocks":
      return "Block slots only take solid blocks (no sand, gravel or anything that falls).";
    case "valuables":
      return "Valuables slots take diamonds, emeralds, gold, iron, copper, coal, redstone, lapis, quartz, netherite...";
    case "info":
      return "That's an info label; nothing can go there.";
  }
}

/** Label items must never leave the AI's inventory: remove any that end up with players or on the ground. */
function cleanLabels() {
  for (const player of world.getPlayers()) {
    const c = player.getComponent("minecraft:inventory")?.container;
    if (!c) continue;
    for (let i = 0; i < c.size; i++) {
      const item = c.getItem(i);
      if (item && LABEL_ITEMS.has(item.typeId)) c.setItem(i, undefined);
    }
  }
  for (const dim of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    for (const item of world.getDimension(dim).getEntities({ type: "minecraft:item" })) {
      const id = item.getComponent("minecraft:item")?.itemStack.typeId;
      if (id && LABEL_ITEMS.has(id)) item.remove();
    }
  }
}

system.runInterval(() => {
  for (const [id, info] of knownAis) {
    const ai = world.getEntity(id);
    if (!ai?.isValid || ai.typeId !== AI_ENTITY) {
      snapshots.delete(id);
      continue;
    }
    try {
      sync(ai, info.ownerId, info.role, info.key);
    } catch (error) {
      console.warn(`[AI Players] inventory sync error: ${error}`);
    }
  }
}, SYNC_TICKS);

system.runInterval(cleanLabels, 20);
