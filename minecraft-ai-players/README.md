# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon` · Needs Minecraft 26.40 or newer (made for 26.52).

![The 10 AI players, front and back](preview.png)

## What it does (v1.3.0)
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
| Interact with your Fighter AI, then hit a player | The Fighter attacks that player, even if it was fighting someone else |

**Fighter AI menu:** *Follow and protect me* or *Guard this spot* (stays put and attacks any other player who
comes near, then returns to its spot).
**Resource AI menu:** choose a focus (Wood, Stone, Ores, Everything). Gathering itself comes in a later update.

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
python3 tools/make_skins.py
python3 tools/build.py
```
Bump the version numbers in both `manifest.json` files for every release so Minecraft picks up the update.
