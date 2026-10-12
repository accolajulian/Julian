# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon` · Needs Minecraft 26.40 or newer (made for 26.52).

![The 10 AI players, front and back](preview.png)

## What it does (v1.9.0)
- **AI Computer:** every player spawns with one in their hotbar (and gets a new one after dying if it's gone).
  It can't be placed or eaten; use it to see how to craft the Coder and what each AI costs (red until you
  have enough, green when you do), with *More help* for the full guide.
- **Coder** block: the shop. Tap it, pick an AI to read what it does and its price, then buy it.
  ```
  Glass  Glass     Glass
  Iron   Redstone  Iron
  Iron   Iron      Iron
  ```
- **Resource AI** costs 30 gold ingots, **Fighter AI** costs 15 diamonds. Each player can only have one of each.
- Prices show in red until you have enough. Trying to buy without enough only tells you how many more you need.
- Buying: choose a look (10 options) and type a name (required). You get an **AI Egg**; use it to throw it,
  and your AI appears where it lands.
- Lost the egg? Open the Coder and pick your AI to get a new one (the old egg stops working).
- **Recall robot:** when you throw the egg, its hotbar slot gets a recall robot (**red** for the Fighter,
  **blue** for the Resource AI). Use it to teleport your AI to you. If the AI is too far away to be loaded,
  it rejoins next to you with everything it carries. Lost it? The Coder gives you a new one.
- **If an AI dies, it respawns next to its owner** after 5 seconds (or when the owner next joins).

### Controls
| Action | What happens |
|---|---|
| Hit (left click) your AI | Opens its menu. Your hits never hurt it. |
| Interact (right click) holding food | Heals it (bread, cooked meat, golden apple) |
| Interact with your AI holding an allowed tool | Puts it in the first empty tool slot |
| Interact with your AI holding armor or a shield | Puts it on (swaps out the old piece) |
| Interact with your AI holding solid blocks | Puts them in its block slots |
| Interact with your Fighter AI holding arrows | Puts them in its arrow slots |
| An ally interacts with your AI | They can take spare cooked chicken |
| Interact with your Fighter AI (empty hand), then hit a player | The Fighter goes after that player |

**Fighter AI menu:** *Inventory*, *Fighting style*, *Targets*, *Follow and protect me*, *Guard this spot*, *Allies & enemies*.

| Fighting style | What it does |
|---|---|
| Sword Combat | Sprints at the enemy and keeps hitting with its melee tool |
| Archer | Shoots with a bow/crossbow from a distance (melee only if it runs out of arrows) |
| Archer then Combat | Fires 5 arrows, then charges in (or right away if the enemy gets close) |

All styles back off to heal at 30% health. Fighters can hold a bow and a crossbow in their tool slots.

**Tombstones (tombs.js):** when it isn't fighting, the Fighter breaks tombstones from a grave/tombstone
add-on within 12 blocks and loots them, most valuable items first: valuables, better armor (swapping out
worse pieces), a shield, better tools, arrows, blocks. Anything it can't use stays on the ground. IDs with
"grave", "tomb", "headstone" or "corpse" are found automatically; others can be taught in its menu
(*Tombstones > Teach*, standing next to one). Looting can be turned off. **Targets:** *Mob killing and player killing*, or *Only player
killing* (it still defends against mobs that attack, and attacks whatever you attack).
**Resource AI menu:** *Inventory*, choose a focus (Wood, Stone, Ores, Everything, Nothing), *Allies & enemies*.

Both AIs have **20 health, the same as a player**, and eat their own cooked chicken (+4 health each) when hurt.

### Bridging and pillaring (movement.js, both AIs)
When a deep gap (3+ blocks of air) or lava is between the AI and where it's going (its target, or you when
it's following), it crouches and places a block in front of it, one every half second, and walks across.
When its target is 2+ blocks above it and close, it jumps and places a block under itself. It uses blocks
from its block slots and tells you when it runs out.

### Gathering (gather.js, Resource AI)
- Walks to the nearest block of its focus (Minecraft's own pathfinding) and mines it when in reach.
- Uses the first tool slot that can mine the block; pickaxe tiers apply like for players (stone for iron,
  lapis and copper; iron for gold, redstone, diamonds and emeralds; diamond for ancient debris). Logs can be
  chopped by hand, slower. Mining takes as long as it would for a player (Efficiency counts).
- Only chops real trees (logs with leaves above), so it won't take apart log houses.
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
| **Backpack** | Resource AI only. What it gathers (576 items). Take everything from the Inventory menu. |

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
