# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon` · Needs Minecraft 26.40 or newer (made for 26.52).

![The 10 AI players, front and back](preview.png)

## What it does (v1.1.0)
- **AI Player Menu** item: you get one the first time you join a world. It's also in the Creative inventory, or use `/give @s aip:ai_menu`.
- Use the menu → pick 1 of 10 AI players → type any gamer tag → it spawns next to you, already yours.
- Its gamer tag always shows above its head, and "joined the game" / "left the game" messages appear in chat.
- It follows you, attacks what you hit, defends you from mobs and players, and fights nearby monsters (not creepers).
- Feed it bread, cooked beef or golden apples to heal it.

| # | Default tag | Look |
|---|---|---|
| 0 | Bolt | Robot with a glowing visor |
| 1 | Maple | Red hair, green hoodie |
| 2 | Rook | Knight in iron armor |
| 3 | Ember | Orange hair, leather jacket |
| 4 | Frost | White hair, ice-blue parka |
| 5 | Moss | Explorer with a safari hat |
| 6 | Nova | Purple-haired astronaut |
| 7 | Dash | Sporty runner with a headband |
| 8 | Juniper | Braids and a teal top |
| 9 | Pixel | Gamer with headphones |

## Folder map
| Path | What it is |
|---|---|
| `behavior_pack/entities/ai_player.json` | The brain: health, AI goals, taming, skin choice |
| `behavior_pack/scripts/main.js` | The menu, naming, spawning and chat messages (Script API 2.9.0) |
| `behavior_pack/items/ai_menu.json` | The AI Player Menu item |
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
