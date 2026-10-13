# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon` · Needs Minecraft 26.40 or newer (made for 26.52).

![The 10 AI players, front and back](preview.png)

## What it does (v1.17.0)
- **AI Computer:** every player spawns with one in their hotbar (and gets a new one after dying if it's gone).
  It can't be placed or eaten; use it to see how to craft the Coder and what each AI costs (red until you
  have enough, green when you do), with *More help* for the full guide.
- **Coder** block: the shop. Tap it, pick an AI to read what it does and its price, then buy it.
  ```
  Glass  Glass     Glass
  Iron   Redstone  Iron
  Iron   Iron      Iron
  ```
- **Resource AI** costs 30 gold ingots, **Fighter AI** costs 15 diamonds. Each player can only **buy** one of each, ever.
- Prices show in red until you have enough. Trying to buy without enough only tells you how many more you need.
- Buying: type a name (required). The look is picked automatically (add-ons can't copy a player's skin). Every AI starts with full health and 10 cooked chicken. You get an **AI Egg**; use it to throw it,
  and your AI appears where it lands.
- Lost the egg? Open the Coder and pick your AI to get a new one (the old egg stops working).
- **Recall robot:** when you throw the egg, its hotbar slot gets a recall robot (**red** for the Fighter,
  **blue** for the Resource AI). Use it to teleport your AI to you. If the AI is too far away to be loaded,
  it rejoins next to you with everything it carries. Lost it? The Coder gives you a new one.
- **If an AI dies, it respawns 60 seconds later near the player who bought it** (or its controller).

### Controllers (recall robots)
- Whoever holds an AI's recall robot controls it. Drop it and let another player pick it up, and the AI
  rejoins next to them and follows, protects and obeys them, keeping everything it carries.
- Handing over a controller never changes who bought it: the buyer still can't buy another of that kind,
  and the new controller can still buy their own if they haven't yet. A player can control several AIs.

### Mobs and explosions
- Mobs can't hurt either AI, and no explosion can (creepers, ghast fireballs, TNT).
- The Resource AI never fights (it runs from players who attack it). The Fighter kills mobs.

### Upgrades (at the Coder)
| AI | Cost | What it gets |
|---|---|---|
| Resource AI | 10 diamonds | Strip mining (digs a tunnel straight to diamonds, or netherite in the Nether), no lava/fire/fall damage (no potion bubbles), Computer Chest access |
| Fighter AI | 10 netherite ingots | The 30-block sequence (below), 2 opening arrows at 3x speed in Bow and Sword Combat, no lava/fire damage, Computer Chest access |

### Upgraded Fighter: the 30-block sequence
When an enemy player comes within 30 blocks, the upgraded Fighter gets each of these once:
- **Full sprint:** 1.5x a player's speed and higher jumps, until it lands its first hit on them.
- **Knockback:** that first hit knocks the player back about 7 blocks.
- **Power jump:** if the player is more than 2 blocks higher and within 8 blocks sideways, it jumps about
  10 blocks towards them, swinging the whole way, with no fall damage for 5 seconds.

When the player leaves the 30 blocks and comes back, the sequence starts again. Faster arrows do the same
damage as a normal full-power arrow.

### Computer Chest (chest.js)
Craft: chest + redstone + glass pane. Place it, **left click** it to choose one of your upgraded AIs (or pick
the chest up), **right click** it to open that AI's inventory from anywhere. Only the player who placed it can use it.

### Controls
| Action | What happens |
|---|---|
| Left click your AI, or its recall robot | Commands (Teleport to me, settings, gather focus, Allies & enemies, **Delete** at the bottom) |
| Right click your AI | Its inventory: a 27-slot chest-style screen with labeled slots (owner only) |
| Right click its recall robot | Brings the AI next to you, so you can right click it |
| An ally right clicks your AI | They can take spare cooked chicken |

### Inventory screen (container.js)
Every slot has a job; empty slots show a gray label icon saying what goes there. Drag items in or out like
a chest. Items that aren't allowed in a slot are handed back. The AI's own 10 chicken and its torches are
shown on info labels and can't be taken.

| Row | Resource AI | Fighter AI |
|---|---|---|
| 1 | Tools 1-3, Sword, Bow, Arrows 1-2, Shield, Torches (info) | Tools 1-3, Arrows 1-2, Shield, 3 info labels |
| 2 | Helmet, Chestplate, Leggings, Boots, Blocks 1-2, Own chicken (info), Spare chicken, Valuables 1 | same |
| 3 | Valuables 2-10 | Valuables 2-10 |

**Fighter commands:** *Teleport to me*, *Attack a player*, *Follow and protect me*, *Guard this spot*, *Fighting*, *Tombstones*, *Allies & enemies*, *Delete*.

| Fighting | What it does |
|---|---|
| Sword Combat | Sprints at the enemy and keeps hitting with its sword |
| Bow Only | Keeps its distance and shoots from up to 25 blocks, aiming ahead of moving targets |
| Bow and Sword Combat | Runs in with its bow out, fires one arrow from about 20 blocks, then switches to its sword. No more opening arrows in that fight unless a new target is over 20 blocks away |

All styles back off to heal at 30% health. **Targets** (in the same Fighting section): mobs and players, or only players.

**Tombstones (tombs.js):** when it isn't fighting, the Fighter breaks tombstones from a grave/tombstone
add-on within 12 blocks and loots them, most valuable items first: valuables, better armor (swapping out
worse pieces), a shield, better tools, arrows, blocks. Anything it can't use stays on the ground. IDs with
"grave", "tomb", "headstone" or "corpse" are found automatically; others can be taught in its menu
(*Tombstones > Teach*, standing next to one). Looting can be turned off. **Targets:** *Mob killing and player killing*, or *Only player
killing* (it still defends against mobs that attack, and attacks whatever you attack).
**Resource commands:** "Choose resource": *Teleport to me*, *Follow me* (strictly) or *Wander and gather*, *Trees* or *Caves* (and *Strip mine* when upgraded), *Allies & enemies*, *Delete*.

Both AIs have **20 health, the same as a player**, and eat their own cooked chicken (+4 health each) when hurt.

### Bridging and pillaring (movement.js, both AIs)
When a deep gap (3+ blocks of air) or lava is between the AI and where it's going (its target, or you when
it's following), it crouches and places a block in front of it, one every half second, and walks across.
When its target is 2+ blocks above it and close, it jumps and places a block under itself. It uses blocks
from its block slots and tells you when it runs out.

### Gathering (gather.js, Resource AI)
- Finds the nearest block of its focus within 12 blocks of you, walks to a free spot next to it (stepping up
  blocks, never into lava or off a cliff) and mines it.
- Uses the first tool slot that can mine the block; pickaxe tiers apply like for players (stone for iron,
  lapis and copper; iron for gold, redstone, diamonds and emeralds; diamond for ancient debris). Logs can be
  chopped by hand, slower. Mining takes as long as it would for a player (Efficiency counts).
- **Trees:** chops whole trees (see below). **Caves:** finds ores in caves and ravines and mines them, placing a torch about every 10 blocks.
- **AI Chest:** it always carries its own AI Chest (never placed). Whenever its 10 valuables slots fill up, half of each slot goes into the AI Chest (27 slots), like a starting-out tax. It's locked until the AI is upgraded at the Coder, so by then there's usually a lot saved up. Once upgraded: left click the AI → *AI Chest* → *Take everything*, or pick *<name>'s AI Chest* on a Computer Chest and take items out. Deleting a not-yet-upgraded AI loses what's in its locked AI Chest.
- Carries an infinite water bucket (shown in its inventory, can't be taken). To get down into a ravine it pours water over the edge and swims down; to get back up a wall it pours water above itself and swims up. It scoops the water back up afterwards. (Not in the Nether.)
- Only chops real trees (logs with leaves above), so it won't take apart log houses.
- Chops trees like a player: it walks up to the trunk, stands still and chops the bottom 2 logs, steps into that gap (breaking dirt or leaves in the way), chops the rest of the tree it can reach from there, then moves on to the next tree. It really walks (with gravity and leg movement), and stands still while working instead of strolling around.
- Drops go into its block slots first (building blocks only), then its backpack (576 items).
- **Lava:** it never mines a block touching lava. Lava within 2 blocks of either AI gets covered with blocks
  from its block slots; with no blocks it backs away, stops gathering for a moment and tells you.

### Inventory (inventory.js)
| Slot | Rules |
|---|---|
| **Food** | Makes 10 cooked chicken every 10 minutes of game time, up to 30. The first 10 are the AI's own and can never be taken (it eats them to heal); players (owner and allies) can take anything above 10. The timer starts when the AI first joins the world. |
| **Tools 1, 2, 3** | Used in order. When a tool breaks, it moves on to the next slot. Tools wear like a player's (Unbreaking counts) and keep their enchantments and names. Fighter: swords, axes, trident, mace, bow, crossbow. Resource AI: pickaxes, axes, shovels, hoes, shears. No TNT or explosives. |
| **Arrows 1, 2** | Both AIs. 64 each. Used for a bow/crossbow; one arrow per shot. |
| **Armor** | Helmet, chestplate, leggings, boots (any armor material). Shown on the AI, protects it, wears down when it gets hurt. |
| **Shield** | Blocks hits and arrows from the front, with a short pause between blocks. An axe hit knocks it down for 5 seconds. |
| **Blocks 1, 2** | 64 each, solid building blocks only: no sand, gravel, concrete powder, anvils or anything else that falls, no explosives. Used to bridge, pillar and cover lava. |
| **Valuables 1-10** | 64 each: diamonds, emeralds, netherite, gold, iron, copper, coal, redstone, lapis, quartz, amethyst (raw, ingots, blocks). Ores the Resource AI mines go here first. |
| **Sword, Bow** | Resource AI only. Sword against mobs. It only fights players with the bow or crossbow (needs arrows); without one it runs away. |
| **Torches** | Resource AI only. Starts with 64, places them in dark caves, refills to 64 when the last one is placed. Players can't take them. |
| ~~Backpack~~ | Removed: anything that doesn't fit in its slots goes straight to you (or is dropped if you're far away). |

Smart switches for the Fighter: bow/crossbow (if it has arrows) when the target is more than 6 blocks away,
an axe against a shield, a melee tool up close. Otherwise, slot order. Tools, arrows and food stay with the
AI when it dies; dismissing it gives you back the tools, arrows and spare chicken.

### Smart fighting (brain.js)
- **Most dangerous enemy first:** every nearby enemy gets a score (commanded target > whoever is hurting
  you > whoever hurt the AI > whatever you attacked > remembered enemies > guard intruders > monsters by
  danger), plus closeness and finishing off weak enemies. It only switches when the new target is clearly
  more important.
- **Protects a hurt owner first:** attackers of the owner rank higher still when the owner is under half health.
- **Backs off to heal** under 30% health (runs from danger, heals faster next to its owner) and returns at 70%.
- **Tools:** uses its 3 tool slots in order (see Inventory), picks up allowed tools and arrows next to it.

### Memory (saved in the world, shared by both of your AIs, kept after death)
- **Enemies:** players who attack you or your AIs. Fighters go after them on sight. Forgive them in the menu.
- **Allies:** players you add in the menu. Your AIs never attack them or their AIs, even if they attack you.

| # | Look |
|---|---|
| 0 | Robot with a glowing visor |
| 1 | Red hair, green hoodie |
| 2 | Knight in iron armor |
| 3 | Orange hair, leather jacket |
| 4 | White hair, ice-blue parka |
| 5 | Explorer with a safari hat |
| 6 | Purple-haired astronaut |
| 7 | Sporty runner with a headband |
| 8 | Braids and a teal top |
| 9 | Gamer with headphones |

## Folder map
| Path | What it is |
|---|---|
| `behavior_pack/entities/ai_player.json` | The brain: health, AI goals, roles, follow/guard modes, skin choice |
| `behavior_pack/scripts/main.js` | Guide, shop, eggs, AI menus, commands, respawning (Script API 2.9.0) |
| `behavior_pack/scripts/brain.js` | Smart fighting: target choice, retreat, weapons, enemy memory |
| `behavior_pack/scripts/data.js` | Saved records and memory, shared helpers |
| `behavior_pack/scripts/inventory.js` | All slots (food, tools, armor, shield, blocks, arrows, backpack) and their rules |
| `behavior_pack/scripts/gather.js` | Mining, chopping and lava safety |
| `behavior_pack/scripts/movement.js` | Bridging and pillaring |
| `behavior_pack/scripts/tombs.js` | Tombstone breaking and looting |
| `behavior_pack/scripts/stripmine.js` | Upgraded Resource AI strip mining |
| `behavior_pack/scripts/chest.js` | Computer Chest |
| `behavior_pack/scripts/container.js` | The right-click inventory screen and its slot rules |
| `behavior_pack/scripts/gather_data.js` | Generated list of gatherable blocks (don't edit by hand) |
| `behavior_pack/blocks/coder.json` | The Coder block (shop) |
| `behavior_pack/items/ai_computer.json` | The AI Computer every player spawns with |
| `behavior_pack/items/*_egg.json` | The eggs you get after buying |
| `behavior_pack/entities/ai_capsule.json` | The egg while it's flying |
| `behavior_pack/recipes/` | Crafting recipes |
| `resource_pack/entity/ai_player.entity.json` | Links the model, skins and animations |
| `resource_pack/models/entity/ai_player.geo.json` | Player-shaped 3D model |
| `resource_pack/animations/ai_player.animation.json` | Walking, head look and arm swing |
| `resource_pack/textures/entity/ai_player/skin_*.png` | The 10 skins, drawn by `tools/make_skins.py` |
| `resource_pack/textures/aip/icons/*.png` | Menu button icons |

## Rebuild
```
python3 tools/make_skins.py           # art
python3 tools/make_entity_targets.py  # AI rules (targeting, gathering) + gather_data.js
python3 tools/build.py                # checks JSON and zips the .mcaddon
```
Bump the version numbers in both `manifest.json` files for every release so Minecraft picks up the update.
