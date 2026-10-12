"""Draws the original AI Player skin (64x64, standard player-style UV layout)
and the pack icons. Run: python3 tools/make_texture.py"""
import random
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
rng = random.Random(7)  # fixed seed so the texture is the same every build

img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
px = img.load()


def shade(color, amount=10):
    """Small random brightness change so flat colors look hand-pixeled."""
    d = rng.randint(-amount, amount)
    return tuple(max(0, min(255, c + d)) for c in color[:3]) + (255,)


def fill(x, y, w, h, color, noise=10):
    for i in range(x, x + w):
        for j in range(y, y + h):
            px[i, j] = shade(color, noise)


def box(u, v, w, h, d, side, front=None, top=None, bottom=None, back=None):
    """Paints the 6 faces of a box-UV cube (uv origin u,v; size w,h,d)."""
    fill(u + d, v, w, d, top or side)                 # top
    fill(u + d + w, v, w, d, bottom or side)          # bottom
    fill(u, v + d, d, h, side)                        # right side
    fill(u + d, v + d, w, h, front or side)           # front
    fill(u + d + w, v + d, d, h, side)                # left side
    fill(u + 2 * d + w, v + d, w, h, back or side)    # back


METAL = (176, 186, 198)
METAL_DARK = (120, 130, 145)
VISOR = (24, 30, 44)
GLOW = (79, 224, 255)
SUIT = (31, 59, 92)
SUIT_DARK = (22, 40, 64)
PANTS = (52, 56, 66)
BOOTS = (28, 28, 32)

# ---- Head (uv 0,0 size 8x8x8): metal robot head with a visor band ----
box(0, 0, 8, 8, 8, METAL)
fill(8, 8 + 2, 8, 3, VISOR, 4)                  # visor band on the face
fill(0, 8 + 2, 8, 3, VISOR, 4)                  # wraps round the right side
fill(16, 8 + 2, 8, 3, VISOR, 4)                 # ...and the left side
for x in (9, 10, 13, 14):                       # glowing eyes
    px[x, 11] = GLOW + (255,)
fill(10, 8 + 6, 4, 1, METAL_DARK, 4)            # mouth grille
fill(11, 0 + 3, 2, 2, GLOW, 0)                  # little light on top

# ---- Body (uv 16,16 size 8x12x4): navy suit with a chest core ----
box(16, 16, 8, 12, 4, SUIT, back=SUIT_DARK)
fill(20, 20 + 10, 8, 2, PANTS, 6)               # belt line (front)
fill(23, 20 + 3, 2, 2, GLOW, 0)                 # chest core light
fill(22, 20 + 3, 1, 2, SUIT_DARK, 2)
fill(25, 20 + 3, 1, 2, SUIT_DARK, 2)

# ---- Arms (right uv 40,16 / left uv 32,48, size 4x12x4) ----
for u, v in ((40, 16), (32, 48)):
    box(u, v, 4, 12, 4, SUIT, bottom=METAL)
    for face_x in (u, u + 4, u + 8, u + 12):    # metal hands, bottom 3 rows
        fill(face_x, v + 4 + 9, 4, 3, METAL, 8)
    fill(u + 4, v + 4 + 2, 4, 1, GLOW, 0)       # shoulder stripe

# ---- Legs (right uv 0,16 / left uv 16,48, size 4x12x4) ----
for u, v in ((0, 16), (16, 48)):
    box(u, v, 4, 12, 4, PANTS, bottom=BOOTS)
    for face_x in (u, u + 4, u + 8, u + 12):    # boots, bottom 3 rows
        fill(face_x, v + 4 + 9, 4, 3, BOOTS, 4)

# Hat layer (uv 32,0) stays fully transparent.

out = ROOT / "resource_pack/textures/entity/ai_player/ai_player.png"
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out)

# ---- Pack icons: the robot face, scaled up ----
face = img.crop((8, 8, 16, 16)).resize((128, 128), Image.NEAREST)
icon = Image.new("RGBA", (128, 128), (15, 20, 30, 255))
icon.alpha_composite(face)
for pack in ("behavior_pack", "resource_pack"):
    icon.save(ROOT / pack / "pack_icon.png")

print("wrote", out)
