// Boats (any AI that's following you).
// - You're on the water (swimming or in a boat) and it's in the water too, or you paddle off more than
//   8 blocks away: it spawns its own boat, gets in, and paddles along a few blocks ahead of you, to your right.
// - You place a boat in the water: it gets in your boat. Already in a boat: it follows you in it.
// - You get in the same boat: you swap seats so YOU steer (the front seat).
// - You're back on land: it gets out (its own spawned boat disappears; your boat is left alone).
import { world, system } from "@minecraft/server";
import { controlledBy, findPlayer } from "./data.js";

const BOATS = ["minecraft:boat", "minecraft:chest_boat"];
const FOLLOW_BY_BOAT_FROM = 8; // you're paddling away further than this: it follows by boat
const PADDLE_SPEED = 0.7; // top speed (blocks per tick): faster than a player's boat, so it can keep ahead
const AHEAD = 4; // where it paddles: this far ahead of you...
const RIGHT = 2; // ...and this far to your right
const LEAD_TICKS = 8; // ...plus where you'll be this many ticks from now (so it doesn't lag behind)
const OWN_BOAT = "aip:ai_boat"; // set on boats an AI spawned for itself

/** @typedef {import("@minecraft/server").Entity} Entity */
/** AIs paddling a boat (they're the driver). @type {Map<string, { ai: Entity, ownerId: string }>} */
const paddlers = new Map();
/** Last seat swap per boat (so it doesn't keep swapping). @type {Map<string, number>} */
const swapped = new Map();

/** The boat this entity is riding, if any. @param {Entity} e */
export function boatOf(e) {
  try {
    const on = e.getComponent("minecraft:riding")?.entityRidingOn;
    return on && BOATS.includes(on.typeId) ? on : undefined;
  } catch {
    return undefined;
  }
}

/** Is this AI in a boat? @param {Entity} ai */
export function inBoat(ai) {
  return !!boatOf(ai);
}

/**
 * Called every think for an AI. Gets it into or out of a boat as needed. Returns true while it's in
 * a boat (so it shouldn't do its walking/sprinting/teleport-follow).
 * @param {Entity} ai
 * @param {import("@minecraft/server").Player | undefined} owner
 * @param {import("./data.js").AiRecord} record
 */
export function boatThink(ai, owner, record) {
  const boat = boatOf(ai);
  const following = record.mode === "follow" && owner && owner.dimension.id === ai.dimension.id;
  if (!following || !owner) {
    // Not following: on a job, gathering decides when it gets out (on land; see gather.js). Staying
    // or guarding in a boat it just floats there (safe from drowning).
    paddlers.delete(ai.id);
    return false;
  }
  const ownerBoat = boatOf(owner);
  const ownerOnWater = !!ownerBoat || owner.isInWater;

  if (boat) {
    // Sharing a boat with you: you steer.
    if (ownerBoat && ownerBoat.id === boat.id) {
      paddlers.delete(ai.id);
      letOwnerSteer(boat, owner, ai);
      return true;
    }
    // You're back on land: it gets out.
    if (!ownerOnWater && owner.isOnGround) {
      paddlers.delete(ai.id);
      leaveBoat(ai, boat, owner);
      return false;
    }
    // Otherwise it paddles along with you (every tick, below).
    paddlers.set(ai.id, { ai, ownerId: owner.id });
    return true;
  }

  // Not in a boat yet: you're out on the water and it's in the water too, or you paddled off.
  const d = Math.hypot(owner.location.x - ai.location.x, owner.location.z - ai.location.z);
  if (ownerOnWater && (ai.isInWater || (ownerBoat && d > FOLLOW_BY_BOAT_FROM))) {
    spawnBoat(ai);
    return true;
  }
  return false;
}

/** Spawns a boat for the AI on the water (next to it, or next to you if it's on land) and puts it in. @param {Entity} ai */
export function spawnBoat(ai) {
  const dim = ai.dimension;
  let p = { x: ai.location.x, y: Math.floor(ai.location.y), z: ai.location.z };
  // Float it on top of the water.
  for (let i = 0; i < 8 && /water/.test(dim.getBlock({ x: p.x, y: p.y + 1, z: p.z })?.typeId ?? ""); i++) p = { ...p, y: p.y + 1 };
  try {
    const boat = dim.spawnEntity("minecraft:boat", { x: p.x, y: p.y + 0.6, z: p.z });
    boat.setDynamicProperty(OWN_BOAT, true);
    boat.getComponent("minecraft:rideable")?.addRider(ai);
    dim.playSound("random.splash", p);
  } catch {
    // no room / not loaded
  }
}

/**
 * Gets out of the boat. Its own spawned boat disappears; a player's boat is left where it is.
 * @param {Entity} ai @param {Entity} boat @param {import("@minecraft/server").Player | undefined} _owner
 */
export function leaveBoat(ai, boat, _owner) {
  try {
    boat.getComponent("minecraft:rideable")?.ejectRider(ai);
    if (boat.getDynamicProperty(OWN_BOAT) === true) system.runTimeout(() => boat.isValid && boat.remove(), 2);
  } catch {
    // gone
  }
}

/**
 * You and the AI are in the same boat: make sure you're in the front (driver's) seat.
 * @param {Entity} boat @param {import("@minecraft/server").Player} owner @param {Entity} ai
 */
function letOwnerSteer(boat, owner, ai) {
  const rideable = boat.getComponent("minecraft:rideable");
  if (!rideable) return;
  const riders = rideable.getRiders();
  if (riders[0]?.id === owner.id) return;
  if (Date.now() - (swapped.get(boat.id) ?? 0) < 3000) return;
  swapped.set(boat.id, Date.now());
  // The AI hops out (you slide into the front seat) and gets back in behind you.
  rideable.ejectRider(ai);
  system.runTimeout(() => {
    if (boat.isValid && ai.isValid && boatOf(owner)?.id === boat.id) rideable.addRider(ai);
  }, 4);
}

// Every tick: each AI driving a boat paddles to a spot a block ahead of you, to your right.
system.runInterval(() => {
  for (const [id, p] of paddlers) {
    try {
      const owner = findPlayer(p.ownerId);
      const boat = p.ai.isValid ? boatOf(p.ai) : undefined;
      if (!owner || !boat || owner.dimension.id !== boat.dimension.id) {
        paddlers.delete(id);
        continue;
      }
      // Where you're heading: your boat's direction if you're in one, else where you're looking.
      const ownerBoat = boatOf(owner);
      const v0 = ownerBoat ? ownerBoat.getVelocity() : { x: 0, y: 0, z: 0 };
      const moving = Math.hypot(v0.x, v0.z) > 0.05;
      const look = owner.getViewDirection();
      const fx0 = moving ? v0.x : look.x;
      const fz0 = moving ? v0.z : look.z;
      const fl = Math.hypot(fx0, fz0) || 1;
      const fx = fx0 / fl;
      const fz = fz0 / fl;
      // A few blocks ahead of where you'll be in a moment, to your right.
      const ov = ownerBoat ? v0 : owner.getVelocity();
      const target = {
        x: owner.location.x + ov.x * LEAD_TICKS + fx * AHEAD - fz * RIGHT,
        z: owner.location.z + ov.z * LEAD_TICKS + fz * AHEAD + fx * RIGHT,
      };
      const dx = target.x - boat.location.x;
      const dz = target.z - boat.location.z;
      const d = Math.hypot(dx, dz);
      const v = boat.getVelocity();
      const speed = Math.min(PADDLE_SPEED, d * 0.2);
      const ux = d > 0 ? dx / d : 0;
      const uz = d > 0 ? dz / d : 0;
      boat.applyImpulse({ x: ux * speed - v.x, y: 0, z: uz * speed - v.z });
      if (d > 0.5) boat.setRotation({ x: 0, y: (Math.atan2(-ux, uz) * 180) / Math.PI });
    } catch {
      paddlers.delete(id);
    }
  }
}, 1);

// You place a boat in the water: your AI (following you) gets in it.
world.afterEvents.entitySpawn.subscribe(({ entity }) => {
  if (!BOATS.includes(entity.typeId)) return;
  system.runTimeout(() => {
    try {
      if (!entity.isValid || entity.getDynamicProperty(OWN_BOAT) === true) return;
      const dim = entity.dimension;
      const onWater = /water/.test(dim.getBlock({ x: entity.location.x, y: Math.floor(entity.location.y), z: entity.location.z })?.typeId ?? "") ||
        /water/.test(dim.getBlock({ x: entity.location.x, y: Math.floor(entity.location.y) - 1, z: entity.location.z })?.typeId ?? "");
      if (!onWater) return;
      for (const player of dim.getPlayers({ location: entity.location, maxDistance: 8 })) {
        for (const record of controlledBy(player.id)) {
          if (record.mode !== "follow" || !record.id) continue;
          const ai = world.getEntity(record.id);
          if (!ai?.isValid || ai.dimension.id !== dim.id || boatOf(ai)) continue;
          if (Math.hypot(ai.location.x - entity.location.x, ai.location.z - entity.location.z) > 32) continue;
          ai.teleport({ x: entity.location.x, y: entity.location.y + 0.5, z: entity.location.z });
          entity.getComponent("minecraft:rideable")?.addRider(ai);
          return;
        }
      }
    } catch {
      // gone
    }
  }, 5);
});
