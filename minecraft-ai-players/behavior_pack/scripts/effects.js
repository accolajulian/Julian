// Little visual effects shared by the rest of the add-on.
import { system, MolangVariableMap, EntitySwingSource } from "@minecraft/server";

/**
 * Is this arm swing a left click (the attack button)? On PC that's "Attack", but on touch screens a
 * tap of the attack button on a block or on empty air can come through as "Mine" or "None".
 * @param {EntitySwingSource} source
 */
export function isLeftClick(source) {
  return source === EntitySwingSource.Attack || source === EntitySwingSource.Mine || source === EntitySwingSource.None;
}

/** Green spark color, made the first time it's needed (not allowed while the add-on starts up). */
/** @type {MolangVariableMap | undefined} */
let green;

/**
 * A burst of sparks flying out of a spot: electric sparks plus green "code" sparks, in a few quick waves.
 * @param {import("@minecraft/server").Dimension} dimension
 * @param {import("@minecraft/server").Vector3} at
 * @param {number} [amount]  sparks per wave
 */
export function sparks(dimension, at, amount = 12) {
  if (!green) {
    green = new MolangVariableMap();
    green.setColorRGB("variable.color", { red: 0.35, green: 1, blue: 0.45 });
  }
  const color = green;
  for (let wave = 0; wave < 3; wave++) {
    system.runTimeout(() => {
      for (let i = 0; i < amount; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 0.2 + Math.random() * 0.6;
        const p = { x: at.x + Math.cos(a) * r, y: at.y + Math.random() * 0.8, z: at.z + Math.sin(a) * r };
        try {
          if (i % 3 === 0) {
            // Electric sparks need a direction to fly in (variable.direction).
            const dir = new MolangVariableMap();
            dir.setVector3("variable.direction", { x: Math.cos(a) * 0.3, y: 0.2 + Math.random() * 0.3, z: Math.sin(a) * 0.3 });
            dimension.spawnParticle("minecraft:electric_spark_particle", p, dir);
          } else {
            dimension.spawnParticle("minecraft:colored_flame_particle", p, color);
          }
        } catch {
          // unloaded or out of the world
        }
      }
    }, wave * 3);
  }
}
