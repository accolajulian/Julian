// AI Players: menu to choose one of 10 AI players, name it, and spawn it as your companion.
import { world, system, ItemStack } from "@minecraft/server";
import { ActionFormData, ModalFormData } from "@minecraft/server-ui";

const AI_ENTITY = "aip:ai_player";
const MENU_ITEM = "aip:ai_menu";
const GOT_MENU_TAG = "aip_got_menu";
const MAX_NAME_LENGTH = 20;

// Order must match the skin numbers (aip:skin_0 ... aip:skin_9) and the icons.
const AI_PLAYERS = [
  { tag: "Bolt", look: "Robot with a glowing visor" },
  { tag: "Maple", look: "Red hair, green hoodie" },
  { tag: "Rook", look: "Knight in iron armor" },
  { tag: "Ember", look: "Orange hair, leather jacket" },
  { tag: "Frost", look: "White hair, ice-blue parka" },
  { tag: "Moss", look: "Explorer with a safari hat" },
  { tag: "Nova", look: "Purple-haired astronaut" },
  { tag: "Dash", look: "Sporty runner with a headband" },
  { tag: "Juniper", look: "Braids and a teal top" },
  { tag: "Pixel", look: "Gamer with headphones" },
];

// Give every player the menu item the first time they join the world.
world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn || player.hasTag(GOT_MENU_TAG)) return;
  const inventory = player.getComponent("minecraft:inventory");
  if (!inventory?.container) return;
  inventory.container.addItem(new ItemStack(MENU_ITEM, 1));
  player.addTag(GOT_MENU_TAG);
  player.sendMessage("§aYou got the §eAI Player Menu§a! Use it to invite an AI player.");
});

// Using the menu item opens the chooser.
world.afterEvents.itemUse.subscribe(({ source, itemStack }) => {
  if (itemStack?.typeId !== MENU_ITEM) return;
  system.run(() => showChooser(source));
});

// When an AI player dies, show a "left the game" message like a real player.
world.afterEvents.entityDie.subscribe(
  ({ deadEntity }) => {
    const name = deadEntity.nameTag;
    if (name) world.sendMessage(`§e${name} left the game`);
  },
  { entityTypes: [AI_ENTITY] }
);

/** @param {import("@minecraft/server").Player} player */
async function showChooser(player) {
  const form = new ActionFormData().title("Choose an AI Player").body("Pick who you want to play with.");
  AI_PLAYERS.forEach((ai, i) => form.button(`${ai.tag}\n§8${ai.look}`, `textures/aip/icons/${i}`));

  const response = await form.show(player);
  if (response.canceled || response.selection === undefined) return;
  await askForName(player, response.selection);
}

/** @param {import("@minecraft/server").Player} player @param {number} skinIndex */
async function askForName(player, skinIndex) {
  const ai = AI_PLAYERS[skinIndex];
  const form = new ModalFormData()
    .title(`Name your AI Player`)
    .textField("Gamer tag (shown above its head)", ai.tag, { defaultValue: ai.tag });

  const response = await form.show(player);
  if (response.canceled) return;

  const typed = String(response.formValues?.[0] ?? "").trim();
  const name = (typed || ai.tag).slice(0, MAX_NAME_LENGTH);
  spawnAiPlayer(player, skinIndex, name);
}

/** @param {import("@minecraft/server").Player} player @param {number} skinIndex @param {string} name */
function spawnAiPlayer(player, skinIndex, name) {
  // Two blocks in front of the player, at their feet level.
  const view = player.getViewDirection();
  const location = {
    x: player.location.x + view.x * 2,
    y: player.location.y,
    z: player.location.z + view.z * 2,
  };

  const ai = player.dimension.spawnEntity(AI_ENTITY, location);
  ai.triggerEvent(`aip:skin_${skinIndex}`);
  ai.nameTag = name;

  const tameable = ai.getComponent("minecraft:tameable");
  if (tameable && tameable.tame(player)) {
    ai.triggerEvent("aip:on_tame"); // turn on following and fighting
  } else {
    player.sendMessage("§cCouldn't make the AI player yours. Tap it with an emerald instead.");
  }

  world.sendMessage(`§e${name} joined the game`);
}
