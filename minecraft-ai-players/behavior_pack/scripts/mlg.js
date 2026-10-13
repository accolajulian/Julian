// Water bucket drop (any AI): to get down from a high place it jumps off toward the ground and, just
// before it lands, places water right where it's about to land. Once it's down it scoops the water back
// up. Its water bucket is its own built-in one, like a creative one: placing never empties it and
// scooping never fills it, it never makes an empty bucket, and players can't take it.
import { world, system } from "@minecraft/server";

const MIN_DROP = 4; // only for drops at least this high
const MAX_DROP = 120; // and at most this high
const DROP_MS = 8000; // gives up (and cleans up) after this long
const SCOOP_AFTER = 3; // ticks after landing before it scoops the water back up
const LAVA = /lava/;

/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {{ ai: import("@minecraft/server").Entity, water: Vector3 | undefined, landed: number, until: number }} Drop */
/** AIs dropping right now. @type {Map<string, Drop>} */
const drops = new Map();
/** AIs whose hand item was changed (bucket) and needs putting back. @type {Set<string>} */
const handChanged = new Set();

/** Is this AI in the middle of a water bucket drop? @param {string} aiId */
export function isDropping(aiId) {
  return drops.has(aiId);
}

/** True once after a drop changed what the AI holds (so it re-equips its tool). @param {string} aiId */
export function takeHandChanged(aiId) {
  return handChanged.delete(aiId);
}

/**
 * The block it would land on below a spot: the first solid block going down. undefined if there's
 * lava, nothing within range, or it isn't loaded.
 * @param {import("@minecraft/server").Dimension} dim @param {number} x @param {number} y @param {number} z
 */
function groundBelow(dim, x, y, z) {
  for (let k = 1; k <= MAX_DROP; k++) {
    const b = dim.getBlock({ x, y: y - k, z });
    if (!b) return undefined;
    if (LAVA.test(b.typeId)) return undefined;
    if (!b.isAir && !b.isLiquid && !/grass|flower|fern|snow_layer|vine|torch/.test(b.typeId)) return { x, y: y - k, z, liquid: false };
    if (b.isLiquid) return { x, y: y - k, z, liquid: true }; // water below: no bucket needed
  }
  return undefined;
}

/**
 * Starts a drop if there's a big enough drop in this direction (and water works here). Returns true
 * if it jumped.
 * @param {import("@minecraft/server").Entity} ai @param {{ x: number, z: number }} dir  unit direction
 */
export function startDrop(ai, dir) {
  if (drops.has(ai.id) || !ai.isOnGround) return false;
  const dim = ai.dimension;
  if (dim.id === "minecraft:nether") return false; // water doesn't work there
  const p = ai.location;
  const edge = { x: Math.floor(p.x + dir.x), y: Math.floor(p.y), z: Math.floor(p.z + dir.z) };
  const ground = groundBelow(dim, edge.x, edge.y, edge.z);
  if (!ground || edge.y - (ground.y + 1) < MIN_DROP) return false;
  drops.set(ai.id, { ai, water: undefined, landed: 0, until: Date.now() + DROP_MS });
  hold(ai, "minecraft:water_bucket");
  ai.applyImpulse({ x: dir.x * 0.32, y: 0.42, z: dir.z * 0.32 });
  return true;
}

/** Shows an item in the AI's hand (its built-in bucket). @param {import("@minecraft/server").Entity} ai @param {string} id */
function hold(ai, id) {
  try {
    ai.runCommand(`replaceitem entity @s slot.weapon.mainhand 0 ${id}`);
    handChanged.add(ai.id);
  } catch {
    // no hand
  }
}

/** @param {string} id @param {Drop} d */
function finish(id, d) {
  drops.delete(id);
  if (d.water) {
    try {
      const dim = d.ai.dimension;
      if (/water/.test(dim.getBlock(d.water)?.typeId ?? "")) {
        dim.setBlockType(d.water, "minecraft:air"); // scooped back up (its bucket stays the same)
        dim.playSound("bucket.fill_water", d.water);
      }
    } catch {
      // unloaded
    }
  }
  if (d.ai.isValid) hold(d.ai, "minecraft:bucket");
  // a moment later the brain puts its tool back (takeHandChanged)
}

// Every tick: watch each falling AI and put water right under where it's about to land, early enough
// for how fast it's falling. Scoop it back up a moment after it lands.
system.runInterval(() => {
  for (const [id, d] of drops) {
    const ai = d.ai;
    if (!ai.isValid || Date.now() > d.until) {
      finish(id, d);
      continue;
    }
    try {
      const dim = ai.dimension;
      const p = ai.location;
      const v = ai.getVelocity();
      if (!d.water) {
        const ground = groundBelow(dim, Math.floor(p.x), Math.floor(p.y), Math.floor(p.z));
        if (!ground) continue;
        if (ground.liquid) {
          // Landing in water anyway: nothing to place.
          if (ai.isInWater) finish(id, d);
          continue;
        }
        const landing = { x: ground.x, y: ground.y + 1, z: ground.z };
        const height = p.y - landing.y;
        // Fast: place it when it'd reach the ground within about 3 ticks (or 4 blocks up, whichever is more).
        if (v.y < 0 && height <= Math.max(4, -v.y * 3) && dim.getBlock(landing)?.isAir) {
          dim.setBlockType(landing, "minecraft:water");
          dim.playSound("bucket.empty_water", landing);
          d.water = landing;
        }
        continue;
      }
      // Landed (in the water or on the ground): scoop it up a moment later.
      if (ai.isInWater || ai.isOnGround) {
        if (++d.landed >= SCOOP_AFTER) finish(id, d);
      }
    } catch {
      finish(id, d);
    }
  }
}, 1);

// If it dies mid-drop, don't leave a bucket lying around for players to take.
world.afterEvents.entityDie.subscribe(({ deadEntity }) => {
  let id;
  try {
    id = deadEntity.id;
  } catch {
    return;
  }
  const d = drops.get(id);
  if (!d) return;
  let at, dim;
  try {
    at = d.ai.location;
    dim = d.ai.dimension;
  } catch {
    drops.delete(id);
    return;
  }
  finish(id, d);
  system.run(() => {
    for (const item of dim.getEntities({ location: at, maxDistance: 4, type: "minecraft:item" })) {
      const stackId = item.getComponent("minecraft:item")?.itemStack.typeId;
      if (stackId === "minecraft:water_bucket" || stackId === "minecraft:bucket") item.remove();
    }
  });
});
