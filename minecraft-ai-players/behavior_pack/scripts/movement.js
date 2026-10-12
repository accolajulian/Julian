// Bridging and pillaring with blocks from the AI's block slots.
// - A deep gap (ravine) or lava between the AI and where it's going: it crouches and places a block
//   in front of it, one every think, so it can walk across, like a player bridging.
// - Its target is 2+ blocks above it and close by: it jumps and places a block under itself.
import { system } from "@minecraft/server";
import { saveRecord, findPlayer } from "./data.js";
import { takeBlock, totalBlocks } from "./inventory.js";

const LAVA = ["minecraft:lava", "minecraft:flowing_lava"];
const WARN_MS = 30000;
/** @type {Map<string, number>} owner id -> last "needs blocks" warning */
const warned = new Map();

/** @typedef {import("@minecraft/server").Vector3} Vector3 */

/**
 * Places at most one block to help the AI get to `goal`. Returns true if it placed one.
 * @param {import("@minecraft/server").Entity} ai
 * @param {string} ownerId
 * @param {import("./data.js").RoleId} role
 * @param {import("./data.js").AiRecord} record
 * @param {Vector3 | undefined} goal
 */
export function bridgeTowards(ai, ownerId, role, record, goal) {
  if (!goal) return false;
  const dim = ai.dimension;
  const feet = { x: Math.floor(ai.location.x), y: Math.floor(ai.location.y), z: Math.floor(ai.location.z) };

  // Only from solid ground (not mid-jump, not swimming).
  const ground = dim.getBlock({ x: feet.x, y: feet.y - 1, z: feet.z });
  if (!ground || ground.isAir || ground.isLiquid) return false;

  const dx = goal.x - ai.location.x;
  const dz = goal.z - ai.location.z;
  const flat = Math.hypot(dx, dz);

  // ---- Pillar up: the goal is high above and nearly straight up.
  if (goal.y - ai.location.y >= 2 && flat < 3) {
    const head = dim.getBlock({ x: feet.x, y: feet.y + 2, z: feet.z });
    if (!head?.isAir) return false; // ceiling
    if (!hasBlocks(ownerId, record)) return false;
    ai.playAnimation("animation.aip.ai_player.crouch");
    ai.applyImpulse({ x: 0, y: 0.52, z: 0 });
    // A few ticks later it's at the top of its jump: put a block where its feet were.
    system.runTimeout(() => {
      if (!ai.isValid || !dim.getBlock(feet)?.isAir || ai.location.y < feet.y + 0.9) return;
      const block = takeBlock(record);
      if (!block) return;
      dim.setBlockType(feet, block);
      dim.playSound("dig.stone", feet);
      saveRecord(ownerId, role, record);
    }, 5);
    return true;
  }

  // ---- Bridge forward: one block ahead, along the main direction (keeps the bridge straight).
  if (flat < 2.5) return false;
  const step = Math.abs(dx) > Math.abs(dz) ? { x: Math.sign(dx), z: 0 } : { x: 0, z: Math.sign(dz) };
  const ahead = { x: feet.x + step.x, y: feet.y, z: feet.z + step.z };
  const under = { x: ahead.x, y: feet.y - 1, z: ahead.z };
  const a = dim.getBlock(ahead);
  const u = dim.getBlock(under);
  if (!a || !u) return false;
  if (!a.isAir) return false; // a wall or a step: normal walking handles that

  const lava = LAVA.includes(u.typeId);
  // A real drop: at least 3 blocks of air below the next step. Don't bridge when the goal is
  // below (it can just walk down).
  const deep = u.isAir && isAir(dim, { ...under, y: under.y - 1 }) && isAir(dim, { ...under, y: under.y - 2 });
  if (!lava && !(deep && goal.y >= feet.y - 1)) return false;
  if (!hasBlocks(ownerId, record)) return false;

  const block = takeBlock(record);
  if (!block) return false;
  ai.playAnimation("animation.aip.ai_player.crouch");
  dim.setBlockType(under, block);
  dim.playSound("dig.stone", under);
  saveRecord(ownerId, role, record);
  // A small push so it steps onto the new block.
  ai.applyImpulse({ x: step.x * 0.12, y: 0, z: step.z * 0.12 });
  return true;
}

/** @param {import("@minecraft/server").Dimension} dim @param {Vector3} p */
function isAir(dim, p) {
  return dim.getBlock(p)?.isAir ?? false;
}

/** @param {string} ownerId @param {import("./data.js").AiRecord} record */
function hasBlocks(ownerId, record) {
  if (totalBlocks(record) > 0) return true;
  const now = Date.now();
  if (now - (warned.get(ownerId) ?? 0) > WARN_MS) {
    warned.set(ownerId, now);
    findPlayer(ownerId)?.sendMessage(`§e${record.name} needs blocks to get across. §7Right click it and add blocks in Inventory > Blocks.`);
  }
  return false;
}
