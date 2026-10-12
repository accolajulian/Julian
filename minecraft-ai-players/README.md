# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon` · Needs Minecraft 26.40 or newer (made for 26.52).

![The 10 AI players, front and back](preview.png)

## What it does (v1.2.0)
- **AI Recruitment Station** block: tap it to open the shop. Find it in the Creative inventory
  (Construction tab), use `/give @s aip:ai_station`, or craft it:
  ```
  Glass  Glass     Glass
  Iron   Redstone  Iron
  Iron   Iron      Iron
  ```
- Each player can own **one Resource AI** (costs 30 iron ingots) and **one Fighter AI** (costs 15 diamonds).
- Buying: pick the kind → pick 1 of 10 looks → type a name (required) → pay → it spawns next to you, already yours.
- Already own one? Its shop button lets you **call it to you** or **dismiss it** (no refund), which frees the slot.
- **Fighter AI:** 60 health, 7 damage. Attacks what you hit, defends you from mobs and players, fights nearby monsters (not creepers).
- **Resource AI:** 30 health, 3 damage. Follows you and only fights back when attacked. Gathering (chopping/mining) comes next.
- Name tags always show; "joined the game" / "left the game" messages appear in chat.
- Feed any AI bread, cooked beef or golden apples to heal it.

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
| `behavior_pack/entities/ai_player.json` | The brain: health, AI goals, taming, roles, skin choice |
| `behavior_pack/scripts/main.js` | The shop, payment, naming, spawning and chat messages (Script API 2.9.0) |
| `behavior_pack/blocks/ai_station.json` | The AI Recruitment Station block |
| `behavior_pack/recipes/ai_station.json` | Crafting recipe for the station |
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
