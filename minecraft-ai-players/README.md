# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon` · Needs Minecraft 26.40 or newer (made for 26.52).

![The 10 AI players, front and back](preview.png)

## What it does (v1.6.0)
- **AI Guide** block: every player gets one the first time they join. Tap it to read how everything works.
  Craft another with a book + crafting table.
- **Coder** block: the shop. Tap it, pick an AI to read what it does and its price, then buy it.
  ```
  Glass  Glass     Glass
  Iron   Redstone  Iron
  Iron   Iron      Iron
  ```
- **Resource AI** costs 30 iron ingots, **Fighter AI** costs 15 diamonds. One of each per player.
- Buying: choose a look (10 options) and type a name (required). You get an **AI Egg**; use it to throw it,
  and your AI appears where it lands.
- Lost the egg? Open the Coder and pick your AI to get a new one (the old egg stops working).
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

**Fighter AI menu:** *Inventory*, *Follow and protect me*, *Guard this spot*, *Allies & enemies*.
**Resource AI menu:** *Inventory*, choose a focus (Wood, Stone, Ores, Everything, Nothing), *Allies & enemies*.

Both AIs have **20 health, the same as a player**, and eat their own cooked chicken (+4 health each) when hurt.

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
| **Arrows 1, 2** | Fighter only. 64 each. Used for a bow/crossbow; one arrow per shot. |
| **Armor** | Helmet, chestplate, leggings, boots (any armor material). Shown on the AI, protects it, wears down when it gets hurt. |
| **Shield** | Blocks hits and arrows from the front, with a short pause between blocks. An axe hit knocks it down for 5 seconds. |
| **Blocks 1, 2** | 64 each, solid building blocks only: no sand, gravel, concrete powder, anvils or anything else that falls, no explosives. Used to cover lava. |
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
| `behavior_pack/scripts/gather_data.js` | Generated list of gatherable blocks (don't edit by hand) |
| `behavior_pack/blocks/coder.json` | The Coder block (shop) |
| `behavior_pack/blocks/ai_guide.json` | The AI Guide block |
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
