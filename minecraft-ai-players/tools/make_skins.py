"""Draws the 10 original AI Player skins (64x64, player-style UV layout), their
menu icons, block and item textures, and the pack icons.
Run: python3 tools/make_skins.py"""
import random
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
RP = ROOT / "resource_pack"

# Box-UV origins of each body part in the 64x64 texture.
HEAD, HAT, BODY = (0, 0), (32, 0), (16, 16)
R_ARM, L_ARM, R_LEG, L_LEG = (40, 16), (32, 48), (0, 16), (16, 48)
ARMS, LEGS = (R_ARM, L_ARM), (R_LEG, L_LEG)


class Skin:
    def __init__(self, seed):
        self.img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        self.px = self.img.load()
        self.rng = random.Random(seed)  # fixed seed: same skin every build

    def dot(self, x, y, color, noise=6):
        d = self.rng.randint(-noise, noise)
        self.px[x, y] = tuple(max(0, min(255, c + d)) for c in color[:3]) + (255,)

    def rect(self, x, y, w, h, color, noise=6):
        for i in range(x, x + w):
            for j in range(y, y + h):
                self.dot(i, j, color, noise)

    def clear(self, x, y, w, h):
        for i in range(x, x + w):
            for j in range(y, y + h):
                self.px[i, j] = (0, 0, 0, 0)

    # --- whole parts. Side faces of a box sit next to each other in one strip:
    #     right | front | left | back, so "rows" can be painted all the way round.
    def head_rows(self, top_row, rows, color, part=HEAD):
        u, v = part
        self.rect(u, v + 8 + top_row, 32, rows, color)

    def head_top(self, color, part=HEAD):
        self.rect(part[0] + 8, part[1], 8, 8, color)

    def head_bottom(self, color):
        self.rect(16, 0, 8, 8, color)

    def face(self, x, y, color, part=HEAD, noise=4):
        """One pixel on the front of the head (x, y from 0 to 7)."""
        self.dot(part[0] + 8 + x, part[1] + 8 + y, color, noise)

    def back(self, x, y, color, part=HEAD):
        self.dot(part[0] + 24 + x, part[1] + 8 + y, color)

    def body_all(self, color):
        self.rect(16, 20, 24, 12, color)
        self.rect(20, 16, 8, 4, color)  # top
        self.rect(28, 16, 8, 4, color)  # bottom

    def chest(self, x, y, w, h, color, noise=6):
        """Rectangle on the front of the body (8 wide, 12 tall)."""
        self.rect(20 + x, 20 + y, w, h, color, noise)

    def body_back(self, x, y, w, h, color):
        self.rect(32 + x, 20 + y, w, h, color)

    def body_rows(self, top_row, rows, color):
        self.rect(16, 20 + top_row, 24, rows, color)

    def limb_rows(self, part, top_row, rows, color):
        u, v = part
        self.rect(u, v + 4 + top_row, 16, rows, color)

    def limb_front(self, part, x, y, w, h, color):
        self.rect(part[0] + 4 + x, part[1] + 4 + y, w, h, color)

    def limb_ends(self, part, top, bottom):
        u, v = part
        self.rect(u + 4, v, 4, 4, top)
        self.rect(u + 8, v, 4, 4, bottom)


def person(s, skin, hair, eyes, shirt, pants, shoes, hair_style="short",
           sleeves="long", mouth=None):
    """Paints a basic player: head, hair, face, shirt, arms, legs."""
    mouth = mouth or tuple(int(c * 0.7) for c in skin)

    # Head and hair
    s.head_rows(0, 8, skin)
    s.head_bottom(skin)
    s.head_top(hair)
    s.head_rows(0, 2, hair)
    for x in range(8):                                # back of head
        for y in range(8 if hair_style in ("long", "braids", "bob") else 5):
            s.back(x, y, hair)
    if hair_style in ("long", "braids", "bob"):
        sides_down = 7 if hair_style != "bob" else 5
        for y in range(2, sides_down):                # hair over the ears
            for x in range(8):
                s.dot(0 + x, 8 + y, hair)
                s.dot(16 + x, 8 + y, hair)
            s.face(0, y, hair)
            s.face(7, y, hair)
    else:
        for y in range(2, 4):
            for x in range(5):
                s.dot(0 + x, 8 + y, hair)
                s.dot(19 + x, 8 + y, hair)
    if hair_style == "spiky":
        for x in range(0, 8, 2):
            s.face(x, 2, hair)
    else:
        for x in (0, 1, 2, 5, 6, 7):                  # fringe
            s.face(x, 2, hair)

    # Face: eyes on row 4, mouth on row 6
    white = (245, 245, 245)
    s.face(1, 4, white); s.face(2, 4, eyes)
    s.face(5, 4, eyes); s.face(6, 4, white)
    s.face(3, 6, mouth); s.face(4, 6, mouth)

    # Body and arms
    s.body_all(shirt)
    sleeve_rows = {"long": 11, "short": 4}[sleeves]
    for arm in ARMS:
        s.limb_rows(arm, 0, 12, skin)
        s.limb_rows(arm, 0, sleeve_rows, shirt)
        s.limb_ends(arm, shirt, skin)

    # Legs
    for leg in LEGS:
        s.limb_rows(leg, 0, 10, pants)
        s.limb_rows(leg, 10, 2, shoes)
        s.limb_ends(leg, pants, shoes)


def darker(c, f=0.75):
    return tuple(int(x * f) for x in c)


# ------------------------------------------------------------------ the 10 AI players

def bolt(s):  # 0 - robot
    metal, dark, visor, glow = (176, 186, 198), (120, 130, 145), (24, 30, 44), (79, 224, 255)
    suit, pants, boots = (31, 59, 92), (52, 56, 66), (28, 28, 32)
    person(s, metal, metal, glow, suit, pants, boots, hair_style="short")
    s.head_rows(2, 3, visor)
    s.rect(24, 10, 8, 3, metal)                       # no visor on the back
    for x in (1, 2, 5, 6):
        s.face(x, 3, glow, noise=0)
    for x in range(1, 7):
        s.face(x, 2, visor); s.face(x, 4, visor)
    s.face(3, 6, dark); s.face(4, 6, dark)
    s.rect(11, 3, 2, 2, glow, 0)                      # light on top
    s.chest(3, 3, 2, 2, glow, 0)                      # chest core
    s.chest(0, 10, 8, 2, pants)
    s.body_back(0, 0, 8, 12, darker(suit, 0.8))
    for arm in ARMS:
        s.limb_rows(arm, 9, 3, metal)
        s.limb_front(arm, 0, 2, 4, 1, glow)


def maple(s):  # 1 - red hair, green hoodie
    hoodie = (60, 140, 70)
    person(s, (240, 200, 165), (178, 52, 34), (60, 150, 60), hoodie,
           (60, 90, 150), (225, 225, 225), hair_style="long")
    s.chest(2, 0, 1, 4, (240, 240, 240), 2)           # drawstrings
    s.chest(5, 0, 1, 4, (240, 240, 240), 2)
    s.chest(1, 7, 6, 3, darker(hoodie))               # front pocket
    s.body_back(1, 0, 6, 3, darker(hoodie))           # hood


def rook(s):  # 2 - knight
    iron, iron_dark = (165, 170, 178), (110, 115, 125)
    tabard, gold = (40, 70, 160), (230, 190, 60)
    person(s, (210, 160, 120), (90, 60, 35), (70, 50, 30), iron,
           iron_dark, (60, 62, 70), hair_style="short")
    s.chest(2, 0, 4, 12, tabard)
    s.chest(2, 5, 4, 1, gold, 2)
    s.body_back(2, 0, 4, 12, tabard)
    # Helmet on the outer (hat) layer, leaving the face open below the brow
    s.head_top(iron, HAT)
    s.head_rows(0, 7, iron, HAT)
    s.clear(41, 12, 6, 4)                             # face opening
    s.face(3, 4, iron_dark, HAT); s.face(4, 4, iron_dark, HAT)   # nose guard
    s.face(3, 5, iron_dark, HAT); s.face(4, 5, iron_dark, HAT)
    s.rect(40, 11, 8, 1, iron_dark)                   # brow ridge


def ember(s):  # 3 - orange spiky hair, leather jacket
    jacket = (35, 35, 40)
    person(s, (225, 175, 135), (230, 120, 30), (110, 70, 40), jacket,
           (40, 50, 80), (110, 70, 40), hair_style="spiky")
    s.chest(3, 0, 2, 12, (190, 40, 40))               # red shirt under open jacket
    s.chest(2, 0, 1, 3, (60, 60, 68))                 # collar
    s.chest(5, 0, 1, 3, (60, 60, 68))
    s.chest(0, 11, 8, 1, (90, 60, 35))                # belt


def frost(s):  # 4 - white bob, ice parka
    parka, fur = (140, 200, 235), (245, 245, 250)
    person(s, (245, 220, 200), (235, 240, 245), (90, 170, 230), parka,
           (35, 45, 80), (240, 240, 245), hair_style="bob")
    s.body_rows(0, 1, fur)                            # fur collar
    s.chest(4, 1, 1, 11, darker(parka, 0.7))          # zip
    for arm in ARMS:
        s.limb_rows(arm, 10, 1, fur)                  # fur cuffs


def moss(s):  # 5 - explorer
    shirt, strap = (190, 170, 110), (110, 75, 40)
    person(s, (200, 150, 105), (70, 45, 25), (50, 35, 20), shirt,
           (90, 110, 60), (110, 75, 40), sleeves="short")
    s.chest(1, 0, 1, 12, strap)                       # backpack straps
    s.chest(6, 0, 1, 12, strap)
    s.chest(2, 3, 2, 2, darker(shirt))                # pocket
    s.body_back(1, 1, 6, 9, (120, 140, 70))           # backpack
    s.body_back(1, 4, 6, 1, strap)
    # Safari hat on the hat layer
    hat = (165, 130, 80)
    s.head_top(hat, HAT)
    s.head_rows(0, 2, hat, HAT)
    s.head_rows(2, 1, (90, 60, 30), HAT)              # hat band


def nova(s):  # 6 - astronaut
    suit, accent = (230, 232, 240), (140, 70, 200)
    person(s, (235, 190, 160), (140, 70, 200), (150, 80, 210), suit,
           suit, (90, 80, 110), hair_style="long")
    s.chest(1, 2, 6, 3, (70, 75, 90))                 # chest panel
    s.chest(2, 3, 1, 1, (255, 80, 80), 0)
    s.chest(4, 3, 1, 1, (80, 255, 120), 0)
    s.chest(5, 3, 1, 1, (80, 180, 255), 0)
    s.body_rows(9, 1, accent)                         # belt stripe
    s.body_back(1, 1, 6, 7, (200, 205, 215))          # air tank
    for arm in ARMS:
        s.limb_rows(arm, 3, 1, accent)
        s.limb_rows(arm, 9, 3, (180, 180, 195))       # gloves
    for leg in LEGS:
        s.limb_rows(leg, 5, 1, accent)


def dash(s):  # 7 - runner
    skin, shirt, black = (165, 110, 75), (240, 200, 40), (30, 30, 30)
    person(s, skin, (25, 20, 20), (60, 40, 25), shirt, black,
           (220, 50, 50), sleeves="short")
    # The number 7 on the shirt
    s.chest(2, 2, 4, 1, black, 2)
    for y, x in ((3, 5), (4, 4), (5, 4), (6, 3), (7, 3)):
        s.chest(x, y, 1, 1, black, 2)
    s.rect(16, 20, 1, 12, black); s.rect(31, 20, 1, 12, black)   # side stripes
    for leg in LEGS:                                  # shorts, bare legs, socks
        s.limb_rows(leg, 5, 3, skin)
        s.limb_rows(leg, 8, 2, (240, 240, 240))
    s.head_rows(2, 1, (220, 50, 50), HAT)             # headband


def juniper(s):  # 8 - braids, teal top
    skin, hair, top = (110, 70, 45), (25, 20, 20), (30, 160, 150)
    person(s, skin, hair, (60, 35, 20), top, (90, 60, 120),
           (240, 240, 240), hair_style="braids", sleeves="short",
           mouth=(150, 80, 70))
    for x in (1, 3, 5, 7):                            # braid lines on the back
        for y in range(8):
            if y % 2:
                s.back(x, y, (60, 45, 40))
    s.chest(2, 0, 4, 1, skin)                         # neckline
    s.chest(2, 1, 4, 1, (230, 190, 60), 2)            # gold necklace


def pixel(s):  # 9 - gamer with headphones
    hoodie, dark = (235, 120, 170), (43, 43, 50)
    person(s, (250, 215, 190), (230, 200, 90), (70, 130, 220), hoodie,
           (110, 110, 120), (30, 30, 30))
    s.chest(1, 7, 6, 3, darker(hoodie))               # pocket
    s.chest(2, 2, 4, 2, (245, 245, 245), 2)           # controller logo
    s.chest(2, 2, 1, 1, dark, 0); s.chest(5, 3, 1, 1, dark, 0)
    # Headphones on the hat layer: band over the top, cups on both sides
    s.rect(43, 0, 2, 8, dark)
    for side_x in (32, 48):
        s.rect(side_x + 2, 8, 2, 3, dark)
        s.rect(side_x + 1, 11, 4, 4, dark)
        s.rect(side_x + 2, 12, 2, 2, hoodie, 0)


AI = [bolt, maple, rook, ember, frost, moss, nova, dash, juniper, pixel]


def head_icon(skin_img, size):
    """Front of the head with the hat layer on top, scaled up."""
    face = skin_img.crop((8, 8, 16, 16))
    face.alpha_composite(skin_img.crop((40, 8, 48, 16)))
    return face.resize((size, size), Image.NEAREST)


def coder_textures():
    """16x16 sides, top and bottom of the Coder block."""
    rng = random.Random(99)
    metal, rim, dark = (150, 160, 175), (95, 105, 120), (40, 44, 56)
    screen, face = (79, 224, 255), (24, 30, 44)

    def plate(base):
        img = Image.new("RGBA", (16, 16))
        p = img.load()
        for x in range(16):
            for y in range(16):
                d = rng.randint(-6, 6)
                p[x, y] = tuple(max(0, min(255, c + d)) for c in base) + (255,)
            p[x, 0] = p[x, 15] = rim + (255,)
        for y in range(16):
            p[0, y] = p[15, y] = rim + (255,)
        return img, p

    side, p = plate(metal)
    for x in range(2, 14):                            # screen frame + screen
        for y in range(2, 11):
            p[x, y] = dark + (255,)
    for x in range(3, 13):
        for y in range(3, 10):
            p[x, y] = screen + (255,)
    for x, y in ((5, 5), (10, 5), (5, 6), (10, 6), (6, 8), (7, 8), (8, 8), (9, 8)):
        p[x, y] = face + (255,)                       # smiling face
    for x in (4, 6, 8, 10):                           # coloured buttons
        p[x + 1, 13] = ((255, 90, 90), (90, 255, 120), (255, 210, 70), (90, 170, 255))[(x - 4) // 2] + (255,)

    top, p = plate(metal)
    for x in range(4, 12):                            # glowing ring
        for y in range(4, 12):
            if x in (4, 11) or y in (4, 11):
                p[x, y] = screen + (255,)
    for y in (2, 13):                                 # vents
        for x in range(3, 13):
            p[x, y] = dark + (255,)

    bottom, _ = plate(rim)
    return side, top, bottom


def egg_icon(base, accent, seed):
    """16x16 egg with a band and speckles."""
    rng = random.Random(seed)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    for x in range(16):
        for y in range(16):
            dx, dy = (x - 7.5) / 5.6, (y - 8.8) / (6.6 if y > 8 else 7.4)
            if dx * dx + dy * dy <= 1:
                light = 30 if (x < 7 and y < 8) else (-25 if x > 9 or y > 12 else 0)
                c = tuple(max(0, min(255, v + light + rng.randint(-8, 8))) for v in base)
                p[x, y] = c + (255,)
    for x in range(16):                               # glowing band
        if p[x, 9][3]:
            p[x, 9] = accent + (255,)
    for x, y in ((5, 4), (9, 6), (6, 12), (10, 12), (4, 7)):
        if p[x, y][3]:
            p[x, y] = tuple(int(v * 0.6) for v in base) + (255,)
    return img


def guide_textures():
    """16x16 side (a notice board) and top (planks) of the AI Guide block."""
    rng = random.Random(42)
    wood, wood_dark, paper, ink = (150, 108, 60), (100, 70, 38), (235, 225, 195), (60, 60, 70)
    side = Image.new("RGBA", (16, 16))
    p = side.load()
    for x in range(16):
        for y in range(16):
            edge = x in (0, 15) or y in (0, 15)
            d = rng.randint(-8, 8)
            p[x, y] = tuple(max(0, min(255, c + d)) for c in (wood_dark if edge else wood)) + (255,)
    for x in range(2, 14):                            # paper
        for y in range(2, 14):
            d = rng.randint(-5, 5)
            p[x, y] = tuple(c + d for c in paper) + (255,)
    for y in (4, 6, 8):                               # writing
        for x in range(4, 12 if y != 8 else 9):
            p[x, y] = ink + (255,)
    for x, y in ((6, 10), (7, 10), (8, 10), (9, 10), (6, 11), (9, 11), (6, 12), (7, 12), (8, 12), (9, 12)):
        p[x, y] = (79, 160, 230, 255)                 # little screen doodle
    top = Image.new("RGBA", (16, 16))
    p = top.load()
    for x in range(16):
        for y in range(16):
            d = rng.randint(-10, 10)
            c = wood_dark if y % 4 == 3 else wood
            p[x, y] = tuple(max(0, min(255, v + d)) for v in c) + (255,)
    return side, top


def skull_icon(base, seed):
    """16x16 skull: rounded head, dark eye sockets with a glow, nose and teeth."""
    rng = random.Random(seed)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    dark = tuple(int(c * 0.35) for c in base)
    shape = [
        "....XXXXXXXX....",
        "...XXXXXXXXXX...",
        "..XXXXXXXXXXXX..",
        "..XXXXXXXXXXXX..",
        "..XXXXXXXXXXXX..",
        "..XXEEEXXEEEXX..",
        "..XXEGEXXEGEXX..",
        "..XXEEEXXEEEXX..",
        "..XXXXXXXXXXXX..",
        "...XXXXNNXXXXX..",
        "...XXXXXXXXXX...",
        "....XTXTXTXTX...",
        "....XXXXXXXXX...",
        ".....XXXXXXX....",
    ]
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            if ch in "ENT":
                p[x, y + 1] = dark + (255,)
            elif ch == "G":
                p[x, y + 1] = (255, 255, 255, 255)
            else:
                light = 25 if x < 7 and y < 6 else (-20 if x > 11 or y > 10 else 0)
                c = tuple(max(0, min(255, v + light + rng.randint(-8, 8))) for v in base)
                p[x, y + 1] = c + (255,)
    return img


def main():
    skins = []
    for i, paint in enumerate(AI):
        s = Skin(seed=i)
        paint(s)
        skins.append(s.img)
        s.img.save(RP / f"textures/entity/ai_player/skin_{i}.png")
        head_icon(s.img, 64).save(RP / f"textures/aip/icons/{i}.png")

    for name, img in zip(("side", "top", "bottom"), coder_textures()):
        img.save(RP / f"textures/blocks/coder_{name}.png")
    for name, img in zip(("side", "top"), guide_textures()):
        img.save(RP / f"textures/blocks/ai_guide_{name}.png")
    egg_icon((200, 50, 50), (255, 210, 70), 1).save(RP / "textures/items/fighter_egg.png")
    egg_icon((70, 160, 70), (79, 224, 255), 2).save(RP / "textures/items/resource_egg.png")
    egg_icon((120, 200, 230), (255, 255, 255), 3).save(RP / "textures/items/ai_capsule.png")
    skull_icon((205, 45, 45), 4).save(RP / "textures/items/fighter_skull.png")
    skull_icon((55, 110, 230), 5).save(RP / "textures/items/resource_skull.png")

    # Pack icon: four of the AI players' faces in a grid
    pack = Image.new("RGBA", (128, 128), (15, 20, 30, 255))
    for n, i in enumerate((1, 2, 0, 9)):
        pack.alpha_composite(head_icon(skins[i], 56), (8 + (n % 2) * 64, 8 + (n // 2) * 64))
    for p in ("behavior_pack", "resource_pack"):
        pack.save(ROOT / p / "pack_icon.png")

    print("drew", len(skins), "skins")


if __name__ == "__main__":
    main()
