# AI Players — Minecraft Bedrock add-on

An original add-on with AI companions that look like players. It's kept separate from the LeadEmm app.

**Download for iPad:** `dist/AI_Players.mcaddon`

## Stage 1 (current)
- `aip:ai_player`: a custom entity with a player-shaped model and an original robot texture
- Spawn egg: "AI Player Spawn Egg" (in the Creative inventory, Spawn Eggs section)
- Tap it while holding an **emerald** to make it your companion
- After that it follows you, attacks mobs you hit, defends you from anything that hurts you
  (players included), and fights nearby monsters (but not creepers)
- Feed it bread, cooked beef or golden apples to heal it

## Folder map
| Path | What it is |
|---|---|
| `behavior_pack/entities/ai_player.json` | The brain: health, AI goals, taming |
| `resource_pack/entity/ai_player.entity.json` | Links the model, texture, animations and spawn egg |
| `resource_pack/models/entity/ai_player.geo.json` | Player-shaped 3D model |
| `resource_pack/animations/ai_player.animation.json` | Walking, head look and arm swing |
| `resource_pack/textures/entity/ai_player/ai_player.png` | Skin, drawn by `tools/make_texture.py` |
| `resource_pack/texts/en_US.lang` | In-game names |

## Rebuild
```
python3 tools/make_texture.py
python3 tools/build.py
```
