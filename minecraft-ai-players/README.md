# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon` · Needs Minecraft 26.40 or newer (made for 26.52).

![The 10 AI players, front and back](preview.png)

## What it does (v1.4.0)
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
| Interact with your Fighter AI holding a sword/axe/trident/mace | Gives it the weapon |
| Interact with your Fighter AI (empty hand), then hit a player | The Fighter goes after that player |

**Fighter AI menu:** *Follow and protect me*, *Guard this spot*, *Give my weapons back*, *Allies & enemies*.
**Resource AI menu:** choose a focus (Wood, Stone, Ores, Everything), *Allies & enemies*. Gathering comes later.

### Smart fighting (brain.js)
- **Most dangerous enemy first:** every nearby enemy gets a score (commanded target > whoever is hurting
  you > whoever hurt the AI > whatever you attacked > remembered enemies > guard intruders > monsters by
  danger), plus closeness and finishing off weak enemies. It only switches when the new target is clearly
  more important.
- **Protects a hurt owner first:** attackers of the owner rank higher still when the owner is under half health.
- **Backs off to heal** under 30% health (runs from danger, heals faster next to its owner) and returns at 70%.
- **Best weapon:** carries up to 6 weapons (given by you or picked up) and holds the strongest. Uses an axe
  against a player holding a shield.

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
python3 tools/make_entity_targets.py  # AI targeting rules (brain slots)
python3 tools/build.py                # checks JSON and zips the .mcaddon
```
Bump the version numbers in both `manifest.json` files for every release so Minecraft picks up the update.
