// AI inventories: food, 3 tool slots used in order (1 -> 2 -> 3), 4 armor slots, a shield slot,
// 2 block slots, 2 arrow slots, 3 wood slots and 10 valuables slots. (The old backpack is no longer used.)
// Everything is saved in the AI's record, so it is kept when the AI dies and respawns.
import { world, ItemStack, EnchantmentType, BlockTypes } from "@minecraft/server";

export const FOOD_ITEM = "minecraft:cooked_chicken";
export const FOOD_BATCH = 15; // made every FOOD_EVERY_TICKS
export const FOOD_CAP = 45;
export const FOOD_RESERVED = 30; // the AI's own; players can never take these
export const FOOD_EVERY_TICKS = 12000; // 10 minutes of game time
export const TOOL_SLOTS = 3;
export const ARROW_ITEM = "minecraft:arrow";
export const ARROW_SLOTS = 2;
export const ARROW_SLOT_MAX = 64;
export const BLOCK_SLOTS = 2;
export const BLOCK_SLOT_MAX = 64;
export const BAG_CAPACITY = 576; // 9 stacks
export const TORCH_ITEM = "minecraft:torch";
export const TORCH_STACK = 64;
/** Slot numbers used by the brain: 0-2 are the tool slots, then the Resource AI's sword and bow slots. */
export const SWORD_SLOT = 3;
export const BOW_SLOT = 4;
export const VALUABLE_SLOTS = 10;
export const VALUABLE_SLOT_MAX = 64;
export const WOOD_SLOTS = 3; // one kind of wood per slot
export const WOOD_SLOT_MAX = 64;
export const STASH_WOOD_MAX = 64; // at most a stack of each kind of wood goes in the AI Chest
export const STASH_SLOTS = 27; // the Resource AI's AI Chest (a chest's worth of slots)

/** Higher-value items for the 10 valuables slots. */
export const VALUABLES = new Set(
  [
    "diamond", "diamond_block", "emerald", "emerald_block",
    "netherite_ingot", "netherite_scrap", "netherite_block", "ancient_debris",
    "gold_ingot", "gold_nugget", "raw_gold", "gold_block", "raw_gold_block",
    "iron_ingot", "iron_nugget", "raw_iron", "iron_block", "raw_iron_block",
    "copper_ingot", "raw_copper", "copper_block", "raw_copper_block",
    "coal", "charcoal", "coal_block",
    "redstone", "redstone_block", "lapis_lazuli", "lapis_block",
    "quartz", "quartz_block", "amethyst_shard",
  ].map((id) => `minecraft:${id}`)
);
export const SHIELD_ITEM = "minecraft:shield";
export const FOOD_HEALS = 4; // health a cooked chicken gives the AI when it eats one

/** @typedef {"head" | "chest" | "legs" | "feet"} ArmorSlot */
/** @type {ArmorSlot[]} */
export const ARMOR_SLOTS = ["head", "chest", "legs", "feet"];
const ARMOR_MATERIALS = ["leather", "chainmail", "iron", "golden", "diamond", "netherite"];
/** @type {Record<ArmorSlot, Set<string>>} */
export const ARMOR_ALLOWED = {
  head: new Set([...ARMOR_MATERIALS.map((m) => `minecraft:${m}_helmet`), "minecraft:turtle_helmet"]),
  chest: new Set(ARMOR_MATERIALS.map((m) => `minecraft:${m}_chestplate`)),
  legs: new Set(ARMOR_MATERIALS.map((m) => `minecraft:${m}_leggings`)),
  feet: new Set(ARMOR_MATERIALS.map((m) => `minecraft:${m}_boots`)),
};
/** @type {Record<ArmorSlot, string>} */
export const ARMOR_NAMES = { head: "Helmet", chest: "Chestplate", legs: "Leggings", feet: "Boots" };
/** Command slot names used to put armor on the AI. */
/** @type {Record<ArmorSlot, string>} */
export const ARMOR_COMMAND_SLOT = { head: "slot.armor.head", chest: "slot.armor.chest", legs: "slot.armor.legs", feet: "slot.armor.feet" };

/** @param {string} id @returns {ArmorSlot | undefined} */
export function armorSlotFor(id) {
  return ARMOR_SLOTS.find((slot) => ARMOR_ALLOWED[slot].has(id));
}

/** @typedef {import("./data.js").RoleId} RoleId */
/**
 * @typedef {Object} ToolData  A tool saved in a slot.
 * @property {string} id
 * @property {number} damage  How worn it is (0 = brand new).
 * @property {string} [name]  Custom name, if it was renamed in an anvil.
 * @property {[string, number][]} [ench]  Enchantments: [id, level].
 */

const MATERIALS = ["wooden", "stone", "iron", "golden", "diamond", "netherite"];
const kinds = (/** @type {string} */ kind) => MATERIALS.map((m) => `minecraft:${m}_${kind}`);

/** Only fighting tools for the Fighter, only harvesting/mining tools for the Resource AI. No explosives. */
/** @type {Record<RoleId, Set<string>>} */
export const ALLOWED_TOOLS = {
  fighter: new Set([
    ...kinds("sword"),
    ...kinds("axe"),
    "minecraft:trident",
    "minecraft:mace",
    "minecraft:bow",
    "minecraft:crossbow",
  ]),
  resource: new Set([...kinds("pickaxe"), ...kinds("axe"), ...kinds("shovel"), ...kinds("hoe"), "minecraft:shears"]),
};

/** Melee damage of each tool. The AI does (its own damage) + (tool damage - 3). */
/** @type {Record<string, number>} */
export const TOOL_DAMAGE = {
  "minecraft:wooden_sword": 4,
  "minecraft:golden_sword": 4,
  "minecraft:stone_sword": 5,
  "minecraft:iron_sword": 6,
  "minecraft:diamond_sword": 7,
  "minecraft:netherite_sword": 8,
  "minecraft:wooden_axe": 3,
  "minecraft:golden_axe": 3,
  "minecraft:stone_axe": 4,
  "minecraft:iron_axe": 5,
  "minecraft:diamond_axe": 6,
  "minecraft:netherite_axe": 7,
  "minecraft:trident": 8,
  "minecraft:mace": 6,
  "minecraft:iron_pickaxe": 4,
  "minecraft:diamond_pickaxe": 5,
  "minecraft:netherite_pickaxe": 6,
};

/** Resource AI weapon slots: a sword slot and a bow slot (bow or crossbow). */
export const SWORDS = new Set(kinds("sword"));
export const RANGED = new Set(["minecraft:bow", "minecraft:crossbow"]);

/** @param {string | undefined} id */
export function isRanged(id) {
  return id === "minecraft:bow" || id === "minecraft:crossbow";
}

/** @param {string} id */
export function itemName(id) {
  return id.replace("minecraft:", "").replace(/_/g, " ");
}

/** Every tool a Fighter that was a Resource AI may hold (it fights and gathers). */
const BOTH_TOOLS = new Set([...ALLOWED_TOOLS.fighter, ...ALLOWED_TOOLS.resource]);

/**
 * Which tools this AI's tool slots take.
 * @param {import("./data.js").AiRecord} record
 */
export function toolsFor(record) {
  if (record.role === "fighter" && record.evolved) return BOTH_TOOLS;
  return ALLOWED_TOOLS[record.role];
}

/** @param {import("./data.js").AiRecord} record */
export function toolKind(record) {
  if (record.role === "fighter" && record.evolved) return "fighting, mining or harvesting tool";
  return record.role === "fighter" ? "fighting tool (sword, axe, trident, mace, bow or crossbow)" : "harvesting or mining tool (pickaxe, axe, shovel, hoe or shears)";
}

// ---------------------------------------------------------------- record setup

/**
 * @typedef {Object} Inventory
 * @property {(ToolData | null)[]} tools
 * @property {number[]} arrows
 * @property {number} food
 * @property {number} foodAt
 * @property {Record<ArmorSlot, ToolData | null>} armor
 * @property {ToolData | null} shield
 * @property {({ id: string, count: number } | null)[]} blocks
 * @property {Record<string, number>} bag
 * @property {({ id: string, count: number } | null)[]} valuables
 * @property {{ sword: ToolData | null, bow: ToolData | null }} arms  Resource AI: sword and bow/crossbow slots.
 * @property {number} torches  Resource AI: its own torches (refills itself; players can't take them).
 * @property {({ id: string, count: number } | null)[]} wood  3 wood slots, one kind of wood each.
 * @property {({ id: string, count: number } | null)[]} stash  Resource AI: its AI Chest. Locked until upgraded.
 */

/**
 * Makes sure a record has all inventory fields (older records may not).
 * @param {import("./data.js").AiRecord} record
 */
export function inventoryOf(record) {
  if (!Array.isArray(record.tools) || record.tools.length !== TOOL_SLOTS) {
    record.tools = Array.from({ length: TOOL_SLOTS }, (_, i) => record.tools?.[i] ?? null);
  }
  if (!Array.isArray(record.arrows) || record.arrows.length !== ARROW_SLOTS) record.arrows = [0, 0];
  if (typeof record.food !== "number") record.food = 0;
  if (typeof record.foodAt !== "number") record.foodAt = world.getAbsoluteTime();
  if (!record.armor) record.armor = { head: null, chest: null, legs: null, feet: null };
  if (record.shield === undefined) record.shield = null;
  if (!Array.isArray(record.blocks) || record.blocks.length !== BLOCK_SLOTS) record.blocks = [null, null];
  if (!record.bag) record.bag = {};
  if (!Array.isArray(record.wood) || record.wood.length !== WOOD_SLOTS) {
    record.wood = Array.from({ length: WOOD_SLOTS }, (_, i) => record.wood?.[i] ?? null);
  }
  if (!record.arms) record.arms = { sword: null, bow: null };
  if (typeof record.torches !== "number") record.torches = TORCH_STACK;
  if (!Array.isArray(record.valuables) || record.valuables.length !== VALUABLE_SLOTS) {
    record.valuables = Array.from({ length: VALUABLE_SLOTS }, (_, i) => record.valuables?.[i] ?? null);
  }
  if (!Array.isArray(record.stash) || record.stash.length !== STASH_SLOTS) {
    record.stash = Array.from({ length: STASH_SLOTS }, (_, i) => record.stash?.[i] ?? null);
  }
  return /** @type {Inventory} */ (record);
}

// ---------------------------------------------------------------- food

/** How many cooked chicken players may take (everything above the AI's own 30). */
/** @param {import("./data.js").AiRecord} record */
export function takeableFood(record) {
  return Math.max(0, inventoryOf(record).food - FOOD_RESERVED);
}

/**
 * Adds 15 cooked chicken for every 10 minutes that passed, up to 45.
 * @param {import("./data.js").AiRecord} record
 * @returns {number} how many were added
 */
export function generateFood(record) {
  const inv = inventoryOf(record);
  const now = world.getAbsoluteTime();
  let added = 0;
  while (now - inv.foodAt >= FOOD_EVERY_TICKS) {
    inv.foodAt += FOOD_EVERY_TICKS;
    const before = inv.food;
    inv.food = Math.min(FOOD_CAP, inv.food + FOOD_BATCH);
    added += inv.food - before;
  }
  if (inv.food >= FOOD_CAP) inv.foodAt = now; // full: the next batch starts counting once some are taken
  return added;
}

/** Minutes until the next batch, or undefined when full. */
/** @param {import("./data.js").AiRecord} record */
export function minutesToNextFood(record) {
  const inv = inventoryOf(record);
  if (inv.food >= FOOD_CAP) return undefined;
  const ticksLeft = FOOD_EVERY_TICKS - (world.getAbsoluteTime() - inv.foodAt);
  return Math.max(1, Math.ceil(ticksLeft / 1200));
}

// ---------------------------------------------------------------- tools

/** @param {ItemStack} stack @returns {ToolData} */
export function toolFromStack(stack) {
  /** @type {ToolData} */
  const tool = { id: stack.typeId, damage: stack.getComponent("minecraft:durability")?.damage ?? 0 };
  if (stack.nameTag) tool.name = stack.nameTag;
  try {
    const ench = stack.getComponent("minecraft:enchantable")?.getEnchantments() ?? [];
    if (ench.length) tool.ench = ench.map((e) => [e.type.id, e.level]);
  } catch {
    // Not enchantable.
  }
  return tool;
}

/** @param {ToolData} tool */
export function stackFromTool(tool) {
  const stack = new ItemStack(tool.id, 1);
  const durability = stack.getComponent("minecraft:durability");
  if (durability) durability.damage = Math.min(tool.damage, durability.maxDurability - 1);
  if (tool.name) stack.nameTag = tool.name;
  if (tool.ench?.length) {
    try {
      stack.getComponent("minecraft:enchantable")?.addEnchantments(
        tool.ench.map(([id, level]) => ({ type: new EnchantmentType(id), level }))
      );
    } catch {
      // An enchantment that can't go back on; keep the tool anyway.
    }
  }
  return stack;
}

/** @param {string} id */
export function maxDurability(id) {
  try {
    return new ItemStack(id, 1).getComponent("minecraft:durability")?.maxDurability ?? 0;
  } catch {
    return 0;
  }
}

/** "Iron Sword (190/250)" */
/** @param {ToolData | null | undefined} tool */
export function describeTool(tool) {
  if (!tool) return "§7empty§r";
  const max = maxDurability(tool.id);
  const name = tool.name ?? itemName(tool.id);
  return max ? `${name} (${max - tool.damage}/${max})` : name;
}

/**
 * Wears a tool down by one use. Unbreaking makes it last longer, like for players.
 * @param {import("./data.js").AiRecord} record
 * @param {number} slot
 * @returns {"ok" | "broke" | "none"}
 */
export function wearTool(record, slot) {
  const tools = inventoryOf(record).tools;
  const tool = tools[slot];
  if (!tool) return "none";
  const result = wearItem(tool, 1);
  if (result === "broke") tools[slot] = null;
  return result;
}

/**
 * The item in a slot number (0-2 tool slots, SWORD_SLOT, BOW_SLOT).
 * @param {import("./data.js").AiRecord} record
 * @param {number} slot
 */
export function slotItem(record, slot) {
  const inv = inventoryOf(record);
  if (slot === SWORD_SLOT) return inv.arms.sword;
  if (slot === BOW_SLOT) return inv.arms.bow;
  return slot >= 0 ? inv.tools[slot] ?? null : null;
}

/**
 * Wears the item in a slot by one use; empties the slot if it breaks.
 * @param {import("./data.js").AiRecord} record
 * @param {number} slot
 * @returns {"ok" | "broke" | "none"}
 */
export function wearSlot(record, slot) {
  if (slot < SWORD_SLOT) return wearTool(record, slot);
  const inv = inventoryOf(record);
  const key = slot === SWORD_SLOT ? "sword" : "bow";
  const item = inv.arms[key];
  if (!item) return "none";
  const result = wearItem(item, 1);
  if (result === "broke") inv.arms[key] = null;
  return result;
}

/**
 * Uses one torch. When the last one is placed, the slot fills back up to a full stack.
 * @param {import("./data.js").AiRecord} record
 */
export function useTorch(record) {
  const inv = inventoryOf(record);
  inv.torches -= 1;
  if (inv.torches <= 0) inv.torches = TORCH_STACK;
}

// ---------------------------------------------------------------- loot value

const MATERIAL_VALUE = { netherite: 90, diamond: 60, iron: 20, chainmail: 15, golden: 10, gold: 10, stone: 5, turtle: 25, leather: 3, wooden: 3 };
/** @type {Record<string, number>} */
const ITEM_VALUE = {
  "minecraft:netherite_block": 900, "minecraft:diamond_block": 450, "minecraft:emerald_block": 270,
  "minecraft:netherite_ingot": 100, "minecraft:netherite_scrap": 25, "minecraft:ancient_debris": 25,
  "minecraft:diamond": 50, "minecraft:emerald": 30, "minecraft:gold_block": 90, "minecraft:iron_block": 54,
  "minecraft:gold_ingot": 10, "minecraft:raw_gold": 8, "minecraft:iron_ingot": 6, "minecraft:raw_iron": 5,
  "minecraft:lapis_block": 18, "minecraft:redstone_block": 9, "minecraft:coal_block": 9,
  "minecraft:copper_ingot": 3, "minecraft:raw_copper": 2, "minecraft:lapis_lazuli": 2, "minecraft:redstone": 1,
  "minecraft:coal": 1, "minecraft:charcoal": 1, "minecraft:quartz": 2, "minecraft:amethyst_shard": 2,
  "minecraft:gold_nugget": 1, "minecraft:iron_nugget": 1, "minecraft:trident": 80, "minecraft:mace": 80,
  "minecraft:bow": 8, "minecraft:crossbow": 10, "minecraft:shield": 8, "minecraft:arrow": 0.5,
};

/**
 * How valuable one item is (used to loot the best things first).
 * @param {string} id
 * @param {number} [enchantments]
 */
export function itemValue(id, enchantments = 0) {
  let value = ITEM_VALUE[id];
  if (value === undefined) {
    const material = /^minecraft:([a-z]+)_/.exec(id)?.[1] ?? "";
    value = /** @type {Record<string, number>} */ (MATERIAL_VALUE)[material] ?? 0.1;
  }
  return value + enchantments * 10;
}

/**
 * Wears any item with durability (tool, armor, shield). The caller removes it if it broke.
 * @param {ToolData} item
 * @param {number} amount
 * @returns {"ok" | "broke"}
 */
export function wearItem(item, amount) {
  const max = maxDurability(item.id);
  if (!max) return "ok";
  const unbreaking = enchantLevel(item, "unbreaking");
  for (let i = 0; i < amount; i++) {
    if (Math.random() < 1 / (unbreaking + 1)) item.damage += 1;
  }
  return item.damage >= max ? "broke" : "ok";
}

/** @param {ToolData} item @param {string} name */
export function enchantLevel(item, name) {
  return item.ench?.find(([id]) => id.replace("minecraft:", "") === name)?.[1] ?? 0;
}

/**
 * Puts a tool in the first empty slot.
 * @param {import("./data.js").AiRecord} record
 * @param {ToolData} tool
 * @returns {number} the slot used, or -1 if all are full
 */
export function addTool(record, tool) {
  const tools = inventoryOf(record).tools;
  const slot = tools.findIndex((t) => !t);
  if (slot !== -1) tools[slot] = tool;
  return slot;
}

// ---------------------------------------------------------------- arrows

/** @param {import("./data.js").AiRecord} record */
export function totalArrows(record) {
  return inventoryOf(record).arrows.reduce((a, b) => a + b, 0);
}

/**
 * Adds arrows to the arrow slots (64 each). Returns how many fit.
 * @param {import("./data.js").AiRecord} record
 * @param {number} amount
 */
export function addArrows(record, amount) {
  const arrows = inventoryOf(record).arrows;
  let added = 0;
  for (let i = 0; i < ARROW_SLOTS && amount > 0; i++) {
    const fit = Math.min(amount, ARROW_SLOT_MAX - arrows[i]);
    arrows[i] += fit;
    amount -= fit;
    added += fit;
  }
  return added;
}

/**
 * Uses one arrow (slot 1 first). Returns false if there were none.
 * @param {import("./data.js").AiRecord} record
 */
export function useArrow(record) {
  const arrows = inventoryOf(record).arrows;
  const slot = arrows.findIndex((n) => n > 0);
  if (slot === -1) return false;
  arrows[slot] -= 1;
  return true;
}

// ---------------------------------------------------------------- blocks

/** Blocks that fall when there's nothing under them. Never allowed in block slots. */
const FALLING_BLOCKS = new Set([
  "minecraft:sand",
  "minecraft:red_sand",
  "minecraft:gravel",
  "minecraft:suspicious_sand",
  "minecraft:suspicious_gravel",
  "minecraft:anvil",
  "minecraft:chipped_anvil",
  "minecraft:damaged_anvil",
  "minecraft:dragon_egg",
  "minecraft:scaffolding",
  "minecraft:pointed_dripstone",
  ...["white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray", "light_gray", "cyan", "purple",
    "blue", "brown", "green", "red", "black"].map((c) => `minecraft:${c}_concrete_powder`),
]);
/** Not solid building blocks, explosive, or not placeable on their own. */
const NOT_BUILDING_BLOCKS =
  /tnt|respawn_anchor|_bed$|_door$|sign|banner|shulker_box|command_block|structure|jigsaw|barrier|bedrock|spawner|portal|fire|lava|water|air$|light_block|sapling|flower|tulip|orchid|allium|bluet|daisy|poppy|dandelion|cornflower|lily|_bush|fern|short_grass|tall_grass|seagrass|kelp|torch|lantern|button|pressure_plate|rail|carpet|slab|pane|bars|ladder|vine|chain|candle|cake|flower_pot|head$|skull|lever|tripwire|redstone_wire|repeater|comparator|trapdoor|coral_fan|amethyst_bud|amethyst_cluster|sea_pickle|frog_spawn|_egg$|mushroom$|azalea$|snow_layer/;

/** Solid building blocks only: no sand, gravel or anything else that falls, and no explosives. */
/** @param {string} id */
export function isPlaceableBlock(id) {
  if (FALLING_BLOCKS.has(id) || NOT_BUILDING_BLOCKS.test(id)) return false;
  try {
    return BlockTypes.get(id) !== undefined;
  } catch {
    return false;
  }
}

/** @param {import("./data.js").AiRecord} record */
export function totalBlocks(record) {
  return inventoryOf(record).blocks.reduce((sum, b) => sum + (b?.count ?? 0), 0);
}

/**
 * Adds blocks: first to a slot already holding that block, then to an empty slot. Returns how many fit.
 * @param {import("./data.js").AiRecord} record
 * @param {string} id
 * @param {number} amount
 */
export function addBlocks(record, id, amount) {
  if (!isPlaceableBlock(id)) return 0;
  const inv = inventoryOf(record);
  let added = addStacked(inv.blocks, id, amount, BLOCK_SLOT_MAX);
  // Block slots full of this block: half of it goes in its AI Chest, then there's room again.
  if (added < amount && (record.role === "resource" || record.evolved) && payIntoStash(record, id, false) > 0) {
    added += addStacked(inv.blocks, id, amount - added, BLOCK_SLOT_MAX);
  }
  return added;
}

/**
 * Adds items to a row of stack slots: first to slots already holding that item, then to empty ones.
 * @param {({ id: string, count: number } | null)[]} slots
 * @param {string} id
 * @param {number} amount
 * @param {number} max  per slot
 * @returns {number} how many fit
 */
function addStacked(slots, id, amount, max) {
  let added = 0;
  for (const pass of ["same", "empty"]) {
    for (let i = 0; i < slots.length && amount > 0; i++) {
      const slot = slots[i];
      if (pass === "same" && slot?.id !== id) continue;
      if (pass === "empty" && slot) continue;
      const current = slot?.count ?? 0;
      const fit = Math.min(amount, max - current);
      if (fit <= 0) continue;
      slots[i] = { id, count: current + fit };
      amount -= fit;
      added += fit;
    }
  }
  return added;
}

// ---------------------------------------------------------------- valuables (10 slots)

/** @param {string} id */
export function isValuable(id) {
  return VALUABLES.has(id);
}

/**
 * @param {import("./data.js").AiRecord} record
 * @param {string} id
 * @param {number} amount
 * @returns {number} how many fit
 */
export function addValuables(record, id, amount) {
  if (!isValuable(id)) return 0;
  const inv = inventoryOf(record);
  let added = addStacked(inv.valuables, id, amount, VALUABLE_SLOT_MAX);
  // Valuables full of this item: half of it goes in its AI Chest, then there's room again.
  if (added < amount && (record.role === "resource" || record.evolved) && payIntoStash(record, id, true) > 0) {
    added += addStacked(inv.valuables, id, amount - added, VALUABLE_SLOT_MAX);
  }
  return added;
}

// ---------------------------------------------------------------- wood (3 slots)
// Each wood slot holds one kind of wood (oak, birch...), up to a stack. When a slot is full, half of
// it goes in the AI Chest, but the AI Chest only ever takes up to a stack of each kind of wood.
// Once all 3 slots hold a kind of wood, it only chops trees of those kinds.

/** Logs and stems (any kind of wood). @param {string} id */
export function isWood(id) {
  return /^minecraft:\w+_(log|stem)$/.test(id);
}

/**
 * Adds wood to its slot (or an empty slot). Returns how many fit.
 * @param {import("./data.js").AiRecord} record @param {string} id @param {number} amount
 */
export function addWood(record, id, amount) {
  if (!isWood(id)) return 0;
  const inv = inventoryOf(record);
  const put = () => {
    let i = inv.wood.findIndex((w) => w?.id === id);
    if (i === -1) i = inv.wood.findIndex((w) => !w);
    if (i === -1) return 0;
    const slot = inv.wood[i] ?? { id, count: 0 };
    const fit = Math.min(amount, WOOD_SLOT_MAX - slot.count);
    if (fit <= 0) return 0;
    slot.count += fit;
    inv.wood[i] = slot;
    amount -= fit;
    return fit;
  };
  let added = put();
  if (amount > 0 && (record.role === "resource" || record.evolved) && payWoodIntoStash(record, id) > 0) added += put();
  return added;
}

/**
 * Its slot of this wood is full: half of it goes in the AI Chest (up to a stack of it in there).
 * @param {import("./data.js").AiRecord} record @param {string} id
 */
function payWoodIntoStash(record, id) {
  const inv = inventoryOf(record);
  const i = inv.wood.findIndex((w) => w?.id === id);
  const slot = inv.wood[i];
  if (!slot) return 0;
  const room = STASH_WOOD_MAX - (stashTotals(record)[id] ?? 0);
  const moved = addStacked(inv.stash, id, Math.max(0, Math.min(Math.floor(slot.count / 2), room)), VALUABLE_SLOT_MAX);
  slot.count -= moved;
  if (slot.count <= 0) inv.wood[i] = null;
  return moved;
}

/**
 * This kind of wood can't be taken any more: its slot is full and the AI Chest has a stack of it.
 * @param {import("./data.js").AiRecord} record @param {string} id
 */
function woodDone(record, id) {
  const slot = inventoryOf(record).wood.find((w) => w?.id === id);
  if (!slot || slot.count < WOOD_SLOT_MAX) return false;
  if (!(record.role === "resource" || record.evolved) || (stashTotals(record)[id] ?? 0) >= STASH_WOOD_MAX) return true;
  // The AI Chest is packed with other things: no room for half of it either.
  return !inventoryOf(record).stash.some((s) => !s || (s.id === id && s.count < VALUABLE_SLOT_MAX));
}

/**
 * Can it still chop trees of this wood? Only the kinds in its 3 slots once they're all used.
 * @param {import("./data.js").AiRecord} record @param {string} id
 */
export function canTakeWood(record, id) {
  const wood = inventoryOf(record).wood;
  if (!wood.some((w) => w?.id === id) && !wood.some((w) => !w)) return false;
  return !woodDone(record, id);
}

/** All 3 wood slots are full (and the AI Chest has its stack of each): the Trees job is done. @param {import("./data.js").AiRecord} record */
export function woodFull(record) {
  return inventoryOf(record).wood.every((w) => w && woodDone(record, w.id));
}

// ---------------------------------------------------------------- AI Chest (Resource AI)
// It always carries its AI Chest (it never places anything). Like an ender chest, it's the same chest
// wherever you open it: from the AI's menu or from any Computer Chest you craft and place.
// Whenever its slots are full of a material, half of that material goes into the AI Chest, like a
// starting-out tax. It's locked until the AI is upgraded at the Coder, so by then there's usually a
// good amount saved up.

/**
 * Moves half of a material into the AI Chest (from the valuables or block slots). If its valuables
 * are full of OTHER things, half of each valuables slot goes in instead, to make room.
 * Returns how many items moved.
 * @param {import("./data.js").AiRecord} record
 * @param {string} id  the material that didn't fit
 * @param {boolean} valuables  valuables slots (true) or block slots (false)
 */
export function payIntoStash(record, id, valuables) {
  const inv = inventoryOf(record);
  const slots = valuables ? inv.valuables : inv.blocks;
  const halve = (/** @type {string | undefined} */ only) => {
    let moved = 0;
    slots.forEach((v, i) => {
      if (!v || (only && v.id !== only)) return;
      const fit = addStacked(inv.stash, v.id, Math.floor(v.count / 2), VALUABLE_SLOT_MAX);
      v.count -= fit;
      moved += fit;
      if (v.count <= 0) slots[i] = null;
    });
    return moved;
  };
  const moved = halve(id);
  return moved > 0 || !valuables ? moved : halve(undefined);
}

/** Items in the AI Chest, by item id. @param {import("./data.js").AiRecord} record */
export function stashTotals(record) {
  /** @type {Record<string, number>} */
  const totals = {};
  for (const s of inventoryOf(record).stash) if (s) totals[s.id] = (totals[s.id] ?? 0) + s.count;
  return totals;
}

/** @param {import("./data.js").AiRecord} record */
export function stashCount(record) {
  return inventoryOf(record).stash.reduce((sum, s) => sum + (s?.count ?? 0), 0);
}

/** @param {import("./data.js").AiRecord} record */
export function totalValuables(record) {
  return inventoryOf(record).valuables.reduce((sum, v) => sum + (v?.count ?? 0), 0);
}

/** What it builds with when its block slots are empty: its own endless supply (like its water bucket). */
export const BUILT_IN_BLOCK = "minecraft:cobblestone";

/**
 * Takes one block to place (slot 1 first). With nothing in its block slots it uses its own endless
 * cobblestone, so it never needs you to give it blocks.
 * @param {import("./data.js").AiRecord} record
 */
export function takeBlock(record) {
  const blocks = inventoryOf(record).blocks;
  const i = blocks.findIndex((b) => b && b.count > 0);
  const slot = blocks[i];
  if (!slot) return BUILT_IN_BLOCK;
  slot.count -= 1;
  if (slot.count <= 0) blocks[i] = null;
  return slot.id;
}

// ---------------------------------------------------------------- backpack (gathered items)

/** @param {import("./data.js").AiRecord} record */
export function bagCount(record) {
  return Object.values(inventoryOf(record).bag).reduce((a, b) => a + b, 0);
}

/**
 * @param {import("./data.js").AiRecord} record
 * @param {string} id
 * @param {number} amount
 * @returns {number} how many fit
 */
export function addToBag(record, id, amount) {
  const fit = Math.max(0, Math.min(amount, BAG_CAPACITY - bagCount(record)));
  if (fit > 0) inventoryOf(record).bag[id] = (inventoryOf(record).bag[id] ?? 0) + fit;
  return fit;
}
