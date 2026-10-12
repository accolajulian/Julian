// AI inventories: food, 3 tool slots used in order (1 -> 2 -> 3), 4 armor slots, a shield slot,
// 2 block slots, 2 arrow slots (Fighter) and a backpack for gathered items (Resource AI).
// Everything is saved in the AI's record, so it is kept when the AI dies and respawns.
import { world, ItemStack, EnchantmentType, BlockTypes } from "@minecraft/server";

export const FOOD_ITEM = "minecraft:cooked_chicken";
export const FOOD_BATCH = 10; // made every FOOD_EVERY_TICKS
export const FOOD_CAP = 30;
export const FOOD_RESERVED = 10; // the AI's own; players can never take these
export const FOOD_EVERY_TICKS = 12000; // 10 minutes of game time
export const TOOL_SLOTS = 3;
export const ARROW_ITEM = "minecraft:arrow";
export const ARROW_SLOTS = 2;
export const ARROW_SLOT_MAX = 64;
export const BLOCK_SLOTS = 2;
export const BLOCK_SLOT_MAX = 64;
export const BAG_CAPACITY = 576; // 9 stacks
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

/** @param {string | undefined} id */
export function isRanged(id) {
  return id === "minecraft:bow" || id === "minecraft:crossbow";
}

/** @param {string} id */
export function itemName(id) {
  return id.replace("minecraft:", "").replace(/_/g, " ");
}

/** @param {RoleId} role */
export function toolKind(role) {
  return role === "fighter" ? "fighting tool (sword, axe, trident, mace, bow or crossbow)" : "harvesting or mining tool (pickaxe, axe, shovel, hoe or shears)";
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
  return /** @type {Inventory} */ (record);
}

// ---------------------------------------------------------------- food

/** How many cooked chicken players may take (everything above the AI's own 10). */
/** @param {import("./data.js").AiRecord} record */
export function takeableFood(record) {
  return Math.max(0, inventoryOf(record).food - FOOD_RESERVED);
}

/**
 * Adds 10 cooked chicken for every 10 minutes that passed, up to 30.
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
  const blocks = inventoryOf(record).blocks;
  let added = 0;
  for (const pass of ["same", "empty"]) {
    for (let i = 0; i < BLOCK_SLOTS && amount > 0; i++) {
      const slot = blocks[i];
      if (pass === "same" && slot?.id !== id) continue;
      if (pass === "empty" && slot) continue;
      const current = slot?.count ?? 0;
      const fit = Math.min(amount, BLOCK_SLOT_MAX - current);
      if (fit <= 0) continue;
      blocks[i] = { id, count: current + fit };
      amount -= fit;
      added += fit;
    }
  }
  return added;
}

/**
 * Takes one block to place (slot 1 first). Returns its id, or undefined if there are none.
 * @param {import("./data.js").AiRecord} record
 */
export function takeBlock(record) {
  const blocks = inventoryOf(record).blocks;
  const i = blocks.findIndex((b) => b && b.count > 0);
  const slot = blocks[i];
  if (!slot) return undefined;
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
