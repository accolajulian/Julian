# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon` · Needs Minecraft 26.40 or newer (made for 26.52).

![The 10 AI players, front and back](preview.png)

## What it does (v1.27.1)
- **AI Computer:** every player spawns with one in their hotbar (and gets a new one after dying if it's gone).
  It can't be placed or eaten; use it to see how to craft the Coder and what each AI costs (red until you
  have enough, green when you do), with *More help* for the full guide.
- **Coder** block: the shop. Tap it, pick an AI to read what it does and its price, then buy it.
  ```
  Glass  Glass     Glass
  Iron   Redstone  Iron
  Iron   Iron      Iron
  ```
- Each player buys **one AI, ever**: a **Resource AI** for 30 gold ingots. It then levels up at the Coder (see *Stages*). (Players who bought both AIs in older versions keep them.)
- Prices show in red until you have enough. Trying to buy without enough only tells you how many more you need.
- Buying: type a name (required). The look is picked automatically (add-ons can't copy a player's skin). Every AI starts with full health and 10 cooked chicken. You get an **AI Egg**; use it to throw it,
  and your AI appears where it lands.
- Lost the egg? Open the Coder and pick your AI to get a new one (the old egg stops working).
- **Remote:** when you throw the egg, its hotbar slot gets a Remote (**red** for the Fighter,
  **blue** for the Resource AI). Use it to teleport your AI to you. If the AI is too far away to be loaded,
  it rejoins next to you with everything it carries. Lost it? The Coder gives you a new one.
- **If an AI dies, it respawns 60 seconds later near the player who bought it** (or its controller).

### Controllers (Remotes)
- Whoever holds an AI's Remote controls it. Drop it and let another player pick it up, and the AI
  rejoins next to them and follows, protects and obeys them, keeping everything it carries.
- Handing over a controller never changes who bought it: the buyer still can't buy another of that kind,
  and the new controller can still buy their own if they haven't yet. **One AI per player:** someone who already controls an AI can hold another player's Remote, but it does nothing for them.

### Mobs and explosions
- Mobs can't hurt either AI, and no explosion can (creepers, ghast fireballs, TNT).
- The Resource AI never fights (it runs from players who attack it). The Fighter kills mobs.

### Stages (level up at the Coder)
| Stage | Cost | What it gets |
|---|---|---|
| 1. Resource AI | 30 gold ingots (buy) | Gathering (Trees, Caves), sugar cane farm, torches, water bucket, AI Chest (locked) |
| 2. Resource AI+ | 10 diamonds | Strip mining (digs a tunnel straight to diamonds, or netherite in the Nether), no lava/fire/fall damage (no potion bubbles), AI Chest unlocked, Computer Chest access |
| 3. Fighter AI | 15 diamonds | Becomes a Fighter and **keeps everything above**: fights mobs and players, guards, fighting styles, arrows, tombstone looting, red Remote. Remote → *Jobs* sends it off to do its old jobs; it drops the work to fight any enemy, then goes back to it. Its tool slots take weapons and mining tools. |
| 4. Fighter AI Max | 10 netherite ingots | The 30-block sequence (below), 2 opening arrows at 3x speed in Bow + Sword |

While an AI is working (gathering, building, guarding) with no player within 40 blocks, it keeps its land loaded with one ticking area so it doesn't freeze. Its ticking areas are removed when it comes back near a player, is deleted, or the world reloads (only ones the add-on made).

### Upgraded Fighter: the 30-block sequence
When an enemy player comes within 30 blocks, the upgraded Fighter gets each of these once:
- **Full sprint:** 1.5x a player's speed and higher jumps, until it lands its first hit on them.
- **Knockback:** that first hit knocks the player back about 7 blocks.
- **Power jump:** if the player is more than 2 blocks higher and within 8 blocks sideways, it jumps about
  10 blocks towards them, swinging the whole way, with no fall damage for 5 seconds.

When the player leaves the 30 blocks and comes back, the sequence starts again. Faster arrows do the same
damage as a normal full-power arrow.

### Trees: tree to tree
On *Trees* it locks on to one tree after another instead of strolling around: when no tree is close it scouts
the map and jump sprints to the nearest trees (only strolling if there are no trees anywhere near). Logs it
can't reach on a tree are skipped for 10 minutes and it moves on. Leaves, dirt, sand, snow and vines in its way
are broken; a 1-block step it can't jump, it hops up onto.

### Self-sufficient
The AI never asks you to fill its inventory: with no suitable tool it mines with its hands (slower, but it can
mine anything), with no blocks it bridges and covers lava with its own endless cobblestone, and with no bow it
just fights in melee. Tools and blocks you give it are still used first (tools make it faster).

### Levels, XP and reports (levels.js)
- The AI earns XP: 1 per block mined/chopped/dug (iron/copper/quartz 2, redstone/lapis 3, gold 4, diamond/emerald 8,
  ancient debris 10), 5 per mob it defeats, 25 per player, 50 for finishing a sugar cane farm.
- Levels 0-50 (level n needs 20 + 10n XP). Every level: +1% walking speed (up to +25%), 1% faster mining (up to 30%);
  +1 damage every 10 levels.
- **Every 5 levels it shares the XP it earned over those levels with its owner** (normal player XP).
- **Every 20 minutes** its owner gets a report: *Max (last 20 min) collected: 12 raw iron, 30 oak log | defeated: 3 zombie | +54 XP, Level 4 (12/60 XP)*. Then it starts counting again.
- Finishing a sugar cane farm is announced the moment it's done.
- Messages and shared XP for an owner who's offline are kept and given when they're back.

### Computer Chest (chest.js)
Craft: chest + redstone + glass pane. The **player** places it (AIs never place one). It works like an **ender chest**:
every Computer Chest you place opens the same **AI Chest**, the one your AI fills. **Right click** it to open your AI's
AI Chest (locked until the AI is upgraded at the Coder; it shows how much is saved). **Left click** it to switch to an
upgraded AI's own inventory instead, or to pick the chest up. Only the player who placed it can use it.

### Controls
| Action | What happens |
|---|---|
| Left click its Remote (the **only** way to give commands) | The Remote menu (below). **Delete** is at the bottom. Clicking the AI itself does nothing. |
| Right click your AI | Its inventory: a 27-slot chest-style screen with labeled slots (owner only) |
| Right click its Remote | Nothing: everything is in the left-click menu (use *Teleport* to bring the AI to you) |
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

**Remote menu (Fighter):** *Jobs* (if it was a Resource AI), *Follow me*, *Guard here*, *Attack a player*, *Fight settings* (Style, Targets, Loot tombstones, Teach a tombstone: tap to change), *AI Chest*, *Friends & enemies*, *Delete*.

| Fighting | What it does |
|---|---|
| Sword | Sprints at the enemy and keeps hitting with its sword |
| Bow | Keeps its distance and shoots from up to 25 blocks, aiming ahead of moving targets |
| Bow + Sword | Runs in with its bow out, fires one arrow from about 20 blocks, then switches to its sword. No more opening arrows in that fight unless a new target is over 20 blocks away |

All styles back off to heal at 30% health. **Targets** (in the same Fighting section): mobs and players, or only players.

**Tombstones (tombs.js):** when it isn't fighting, the Fighter breaks tombstones from a grave/tombstone
add-on within 12 blocks and loots them, most valuable items first: valuables, better armor (swapping out
worse pieces), a shield, better tools, arrows, blocks. Anything it can't use stays on the ground. IDs with
"grave", "tomb", "headstone" or "corpse" are found automatically; others can be taught in its menu
(*Tombstones > Teach*, standing next to one). Looting can be turned off. **Targets:** *Mob killing and player killing*, or *Only player
killing* (it still defends against mobs that attack, and attacks whatever you attack).
**Remote menu (Resource AI):** *Jobs* (*Trees*, *Caves*, *Strip mine* when upgraded, *Sugar cane farm*: picking one starts it), *AI Chest*, *Friends & enemies*, *Delete*.

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
- **Sugar cane farm:** pick it and look at water. A colored outline shows the finished farm (planks edge 1 block under the water, sand lines, sugar cane); the 22-long side points away from you. It can only go in water (the action bar says so in red). Tap Place (or left click) to place, sneak to cancel. The AI then collects **84 logs** (335 planks: 330 floor + 5 boat), **108 sand** and **108 sugar cane** (leaving the bottom of each cane to regrow; you can also hand it materials from its menu), crafts the planks and a boat, rides the boat to lay a 15 x 22 plank floor 1 block below the water surface (replacing anything there), then wades along the channels putting sand on the 6 lines of 18 and planting sugar cane on each. When it's done, its boat is parked next to the farm.
  - While collecting it **jump sprints** and uses **map awareness**: it scans all loaded land around it (48 blocks) for the best spot (most of what it still needs, closest first). If there's nothing loaded nearby it briefly loads land further out with ticking areas (rings at 96/160/224 blocks), scans it, and jump sprints there, hopping over walls, cliffs and lava. Far from every player it keeps its own land loaded so it doesn't freeze.
  - **Warp point & 20-minute rule:** before collecting, it puts a warp point (a lodestone) on the closest land next to the farm. 20 minutes (game time) after the farm was placed, if it's still missing anything it's given the rest, warps back to its warp point and builds the full farm. The lodestone is removed when the farm is finished or cancelled.
- **AI Chest:** it always carries its own AI Chest (never placed). Whenever its slots are full of a material (valuables or blocks), half of that material goes into the AI Chest (27 slots), like a starting-out tax. If its valuables are full of other things, half of each goes in to make room. It's locked until the AI is upgraded at the Coder, so by then there's usually a lot saved up. Once upgraded: left click its Remote → *AI Chest* → *Take everything*, or right click any Computer Chest you've placed (like an ender chest) and take items out. Deleting a not-yet-upgraded AI loses what's in its locked AI Chest.
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
