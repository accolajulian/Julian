// Bridging and pillaring with blocks from the AI's block slots (or its own endless cobblestone).
// - A deep gap (ravine) or lava between the AI and where it's going: it crouch-bridges across like a
//   player. It stays crouched the whole way, keeps a block under itself and places the next one just
//   in front, only shuffling forward onto blocks that are there, until it's fully across (2 blocks of
//   real ground ahead).
// - Its target is 2+ blocks above it and close by: it jumps and places a block under itself.
import { system } from "@minecraft/server";
import { saveRecord, getAi } from "./data.js";
import { takeBlock } from "./inventory.js";

const LAVA = ["minecraft:lava", "minecraft:flowing_lava"];

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
  if (bridges.has(ai.id)) return true; // already crouch-bridging
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

  // Start crouch-bridging (the loop below does the rest).
  bridges.set(ai.id, { ai, ownerId, role, key: record.key, dir: step, y: feet.y, placed: new Set(), until: Date.now() + BRIDGE_MS });
  ai.isSneaking = true;
  return true;
}

// ================================================================ crouch-bridging

const BRIDGE_MS = 60000; // gives up after this long
const SNEAK_SPEED = 0.06; // blocks per tick: a careful crouch-walk

/** @typedef {{ ai: import("@minecraft/server").Entity, ownerId: string, role: import("./data.js").RoleId, key: string, dir: { x: number, z: number }, y: number, placed: Set<string>, until: number }} Bridge */
/** AIs crouch-bridging right now. @type {Map<string, Bridge>} */
const bridges = new Map();

/** Is this AI crouch-bridging? @param {string} aiId */
export function isBridging(aiId) {
  return bridges.has(aiId);
}

/** @param {string} id @param {Bridge} b */
function endBridge(id, b) {
  bridges.delete(id);
  try {
    if (b.ai.isValid) b.ai.isSneaking = false;
  } catch {
    // gone
  }
}

/** @param {Vector3} p */
function key(p) {
  return `${p.x},${p.y},${p.z}`;
}

/** @param {import("@minecraft/server").Block | undefined} b */
function solid(b) {
  return !!b && !b.isAir && !b.isLiquid;
}

/**
 * Puts a block at p if there's nothing there (or lava). Returns true if p is solid afterwards.
 * @param {Bridge} b @param {Vector3} p
 */
function fill(b, p) {
  const dim = b.ai.dimension;
  const block = dim.getBlock(p);
  if (!block) return false;
  if (solid(block)) return true;
  if (!block.isAir && !LAVA.includes(block.typeId)) return false; // water: leave it
  const record = getAi(b.key);
  if (!record) return false;
  dim.setBlockType(p, takeBlock(record));
  dim.playSound("dig.stone", p);
  saveRecord(b.ownerId, b.role, record);
  b.placed.add(key(p));
  return true;
}

// Every 2 ticks: keep each bridging AI crouched, a block under it and one just in front, and shuffle
// it forward onto blocks that are there. Done when there are 2 blocks of real ground ahead.
system.runInterval(() => {
  for (const [id, b] of bridges) {
    const ai = b.ai;
    if (!ai.isValid || Date.now() > b.until) {
      endBridge(id, b);
      continue;
    }
    try {
      const dim = ai.dimension;
      const p = ai.location;
      if (p.y < b.y - 0.6) {
        endBridge(id, b); // it fell off anyway: stop
        continue;
      }
      const cell = { x: Math.floor(p.x), y: b.y - 1, z: Math.floor(p.z) };
      fill(b, cell); // never let it stand over nothing
      const next = { x: cell.x + b.dir.x, y: b.y - 1, z: cell.z + b.dir.z };
      const after = { x: next.x + b.dir.x, y: b.y - 1, z: next.z + b.dir.z };
      // Fully across: 2 blocks of real (not placed) ground ahead of it.
      if (solid(dim.getBlock(next)) && !b.placed.has(key(next)) && solid(dim.getBlock(after)) && !b.placed.has(key(after))) {
        endBridge(id, b);
        continue;
      }
      // Something in the way at body height: stop (normal walking handles steps and walls).
      if (!dim.getBlock({ x: next.x, y: b.y, z: next.z })?.isAir) {
        endBridge(id, b);
        continue;
      }
      // How far across its block it is along the bridge (-0.5 to 0.5). Halfway: place the next one.
      const across = (p.x - cell.x - 0.5) * b.dir.x + (p.z - cell.z - 0.5) * b.dir.z;
      const ahead = across > -0.1 ? fill(b, next) : solid(dim.getBlock(next));
      // Shuffle forward only onto a block that's there (or while still in the middle of its own block),
      // and keep to the middle of the bridge sideways.
      const go = ahead || across < 0.2 ? SNEAK_SPEED : 0;
      const sideX = b.dir.x === 0 ? (cell.x + 0.5 - p.x) * 0.3 : 0;
      const sideZ = b.dir.z === 0 ? (cell.z + 0.5 - p.z) * 0.3 : 0;
      const v = ai.getVelocity();
      ai.applyImpulse({ x: b.dir.x * go + sideX - v.x, y: 0, z: b.dir.z * go + sideZ - v.z });
      ai.setRotation({ x: 30, y: (Math.atan2(-b.dir.x, b.dir.z) * 180) / Math.PI });
      ai.isSneaking = true;
    } catch {
      endBridge(id, b);
    }
  }
}, 2);

/** @param {import("@minecraft/server").Dimension} dim @param {Vector3} p */
function isAir(dim, p) {
  return dim.getBlock(p)?.isAir ?? false;
}

