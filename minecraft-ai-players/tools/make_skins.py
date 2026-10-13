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
    """16x16 sides, top and bottom of the Coder block: green Matrix code on black, with a glowing
    green frame (and a crafting grid on top)."""
    glow, rim = (90, 255, 140, 255), (0, 0, 0, 255)

    def face(seed, frame=glow):
        img = Image.new("RGBA", (16, 16))
        matrix_rain(img, 0, 0, 16, 16, random.Random(seed))
        p = img.load()
        for i in range(16):
            p[i, 0] = p[i, 15] = p[0, i] = p[15, i] = frame
        return img, p

    side, _ = face(91)
    top, p = face(92)
    for i in range(1, 15):                            # a 3x3 crafting grid in glowing green
        p[5, i] = p[10, i] = p[i, 5] = p[i, 10] = glow
    bottom, _ = face(93, rim)
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


def computer_icon():
    """16x16 computer: a dark monitor full of green Matrix code, with a stand and keyboard."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    case, dark, glow = (0, 0, 0), (0, 0, 0), (90, 255, 140)
    p = img.load()
    for x in range(1, 15):
        for y in range(1, 11):
            p[x, y] = case + (255,)                   # monitor case
    matrix_rain(img, 2, 2, 12, 8, random.Random(61))  # the screen
    for y in (11, 12):
        p[7, y] = p[8, y] = case + (255,)             # stand
    for x in range(2, 14):
        p[x, 13] = case + (255,)                      # keyboard
        p[x, 14] = (glow if x % 2 else dark) + (255,)
    return img


def remote_icon(seed):
    """16x16 handheld remote: a black body covered in green Matrix code, with a glowing green lens on top."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    edge = (0, 0, 0, 255)
    # body: columns 6-9, rows 1-14, rounded top and bottom
    body = [(x, y) for x in range(5, 11) for y in range(1, 15)]
    for x, y in body:
        p[x, y] = edge
    code = Image.new("RGBA", (4, 12))
    matrix_rain(code, 0, 0, 4, 12, random.Random(seed))
    img.paste(code, (6, 2))
    p[5, 1] = p[10, 1] = p[5, 14] = p[10, 14] = (0, 0, 0, 0)
    p[7, 1] = p[8, 1] = (120, 255, 160, 255)   # glowing lens
    return img


def robot_icon(base, seed):
    """16x16 robot head: antenna, metal head in the given colour, dark visor with glowing eyes, grille."""
    rng = random.Random(seed)
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    dark = tuple(int(c * 0.3) for c in base)
    glow = (120, 240, 255)
    shape = [
        ".......LL.......",
        ".......AA.......",
        ".......AA.......",
        "...XXXXXXXXXX...",
        "..XXXXXXXXXXXX..",
        ".EXXXXXXXXXXXXE.",
        ".EXVVVVVVVVVVXE.",
        ".EXVGGVVVVGGVXE.",
        ".EXVVVVVVVVVVXE.",
        "..XXXXXXXXXXXX..",
        "..XXXGXGXGXXXX..",
        "..XXXXXXXXXXXX..",
        "...XXXXXXXXXX...",
    ]
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == ".":
                continue
            yy = y + 1
            if ch == "L":
                p[x, yy] = glow + (255,)
            elif ch in "VA":
                p[x, yy] = dark + (255,)
            elif ch == "E":
                p[x, yy] = tuple(int(c * 0.6) for c in base) + (255,)
            elif ch == "G":
                p[x, yy] = (glow if y < 9 else dark) + (255,)
            else:
                light = 30 if x < 7 and y < 6 else (-25 if x > 11 or y > 10 else 0)
                c = tuple(max(0, min(255, v + light + rng.randint(-8, 8))) for v in base)
                p[x, yy] = c + (255,)
    return img


SLOT_SHAPES = {
    "tool": ["..........XXX...", ".........XXXXX..", "........XX.XXX..", ".......XX...X...", "......XX........",
             ".....XX.........", "....XX..........", "...XX...........", "..XX............", ".XX............."],
    "weapon": [".............XX.", "............XXX.", "...........XXX..", "..........XXX...", ".........XXX....",
               "...X....XXX.....", "....X..XXX......", ".....XXXX.......", "......XX........", ".....X..X.......", "....X....X......"],
    "armor": ["...XX......XX...", "..XXXX....XXXX..", "..XXXXXXXXXXXX..", "...XXXXXXXXXX...", "...XXXXXXXXXX...",
              "...XXXXXXXXXX...", "...XXXXXXXXXX...", "...XXXXXXXXXX...", "....XXXXXXXX...."],
    "shield": ["..XXXXXXXXXX....", "..XXXXXXXXXX....", "..XXXXXXXXXX....", "..XXXXXXXXXX....", "..XXXXXXXXXX....",
               "...XXXXXXXX.....", "....XXXXXX......", ".....XXXX.......", "......XX........"],
    "food": [".......XXXX.....", "......XXXXXX....", ".....XXXXXXXX...", ".....XXXXXXXX...", "......XXXXXX....",
             ".......XXXX.....", "........XX......", "........XX......", ".......X..X.....", "........XX......"],
    "arrows": ["...........XXXX.", "............XXX.", "...........X.XX.", "..........X...X.", ".........X......",
               "........X.......", ".......X........", "..X..X..........", "...XX...........", "..X.X...........", "...X............"],
    "blocks": ["....XXXXXXXX....", "...X.......XX...", "..XXXXXXXXX.X...", "..X.......X.X...", "..X.......X.X...",
               "..X.......X.X...", "..X.......XX....", "..XXXXXXXXX....."],
    "valuables": ["....XXXXXXXX....", "...XX..XX..XX...", "..XXXXXXXXXXXX..", "...XX......XX...", "....XX....XX....",
                  ".....XX..XX.....", "......XXXX......", ".......XX......."],
    "water": ["...XXXXXXXXXX...", "...X........X...", "...XXXXXXXXXX...", "....XXXXXXXX....", "....XXXXXXXX....",
              ".....XXXXXX.....", ".....XXXXXX.....", "......XXXX......"],
    "info": [".......XX.......", ".......XX.......", "................", "......XXX.......", ".......XX.......",
             ".......XX.......", ".......XX.......", "......XXXX......"],
}


def slot_icon(kind):
    """16x16 slot label: a light outline of what goes in the slot, on a dark square."""
    img = Image.new("RGBA", (16, 16), (40, 42, 50, 170))
    p = img.load()
    shape = SLOT_SHAPES[kind]
    top = (16 - len(shape)) // 2
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "X":
                p[x, top + y] = (190, 195, 205, 255)
    return img


def matrix_code(img, x0, y0, w, h, rng, bg=(0, 0, 0)):
    """Fills an area with green 'falling code': columns of tiny random glyphs, each with a bright
    head and a trail that fades to dark green, on a near-black background."""
    p = img.load()
    for x in range(x0, x0 + w):
        for y in range(y0, y0 + h):
            p[x, y] = bg + (255,)
    rows = max(1, h // 5)
    for cx in range(x0, x0 + w - 2, 4):
        head = rng.randrange(rows)                 # which cell of this column is the bright head
        trail = rng.randint(3, max(3, rows))       # how long its fading trail is
        for r in range(rows):
            behind = (head - r) % rows             # 0 = the head, 1 = just behind it, ...
            if behind >= trail or rng.random() < 0.12:
                continue
            if behind == 0:
                color = (210, 255, 220)            # the head: almost white
            else:
                level = 1 - behind / trail
                color = (int(15 + 30 * level), int(80 + 165 * level), int(30 + 50 * level))
            glyph = rng.getrandbits(12) | 0b000100100010  # never an empty glyph
            for gx in range(3):
                for gy in range(4):
                    px, py = cx + gx, y0 + r * 5 + gy
                    if glyph >> (gx * 4 + gy) & 1 and px < x0 + w and py < y0 + h:
                        p[px, py] = color + (255,)


def matrix_rain(img, x0, y0, w, h, rng, bg=(0, 0, 0)):
    """Matrix code for small (icon-sized) areas: single-pixel streaks of green with bright heads."""
    p = img.load()
    for x in range(x0, x0 + w):
        for y in range(y0, y0 + h):
            p[x, y] = bg + (255,)
        head = rng.randrange(h)
        trail = rng.randint(3, h)
        for k in range(trail):
            y = y0 + (head - k) % h
            if k and rng.random() < 0.3:
                continue
            level = 1 - k / trail
            p[x, y] = ((210, 255, 220) if k == 0 else (int(15 + 30 * level), int(80 + 165 * level), int(30 + 50 * level))) + (255,)


def computer_chest_textures():
    """The Computer Chest: a black box covered in green falling code, a base and a lid like a shulker box
    (64x64 texture: base 16x10x16 at the top, lid 16x6x16 below it) and its item icon."""
    rng = random.Random(77)
    tex = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    matrix_code(tex, 0, 0, 64, 26, rng)   # base
    matrix_code(tex, 0, 26, 64, 22, rng)  # lid
    p = tex.load()
    glow = (90, 255, 140, 255)
    for x in range(64):
        p[x, 16] = glow                   # top edge of the base's sides (the seam)
        p[x, 47] = glow                   # bottom edge of the lid's sides
    icon = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    matrix_rain(icon, 1, 2, 14, 13, random.Random(78))
    q = icon.load()
    for x in range(1, 15):
        q[x, 7] = glow                    # the seam between lid and base
        q[x, 2] = q[x, 14] = (0, 0, 0, 255)
    for y in range(2, 15):
        q[1, y] = q[14, y] = (0, 0, 0, 255)
    return tex, icon


# ---------------------------------------------------------------- computer-look items
# Every item is a little computer: a black body with a dark blue screen, and a symbol on the screen.
SCREEN = (10, 26, 82)          # dark blue screen
SCREEN_LINE = (7, 19, 62)      # every other row a little darker (scanlines)
SCREEN_SHINE = (40, 70, 150)   # a glint in the screen's corner
BODY = (0, 0, 0)               # straight black
CODE_GREEN = (90, 255, 140)


def draw_screen(p, x0, y0, x1, y1):
    """A dark blue screen from (x0, y0) to (x1, y1) inclusive."""
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            p[x, y] = (SCREEN if (y - y0) % 2 == 0 else SCREEN_LINE) + (255,)
    p[x0, y0] = SCREEN_SHINE + (255,)


def draw_symbol(p, rows, left, top, color):
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "X":
                p[left + x, top + y] = color + (255,)


def monitor_icon(symbol=None, color=(170, 210, 255), stand=True):
    """16x16 monitor: black case, dark blue screen (with a symbol on it), stand and keyboard."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    bottom = 11 if stand else 14
    for x in range(1, 15):
        for y in range(1, bottom + 1):
            p[x, y] = BODY + (255,)
    draw_screen(p, 2, 2, 13, bottom - 1)
    if symbol:
        h = len(symbol)
        w = max(len(r) for r in symbol)
        draw_symbol(p, symbol, 2 + (12 - w) // 2, 2 + (bottom - 2 - h) // 2, color)
    if stand:
        for y in (12, 13):
            p[7, y] = p[8, y] = BODY + (255,)
        for x in range(4, 12):
            p[x, 14] = BODY + (255,)
    return img


def pod_icon(symbol, color):
    """16x16 AI egg as a computer pod: a black egg shape with a dark blue screen window and a symbol."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    for x in range(16):
        for y in range(16):
            dx, dy = (x - 7.5) / 5.6, (y - 8.8) / (6.6 if y > 8 else 7.4)
            if dx * dx + dy * dy <= 1:
                p[x, y] = BODY + (255,)
    draw_screen(p, 5, 5, 10, 11)
    if symbol:
        draw_symbol(p, symbol, 5 + (6 - max(len(r) for r in symbol)) // 2, 5 + (7 - len(symbol)) // 2, color)
    for x in range(3, 13):                        # a thin green seam around the middle
        if p[x, 12][3] and not (5 <= x <= 10):
            p[x, 12] = CODE_GREEN + (255,)
    return img


SWORD = ["....X", "...X.", "X.X..", ".X...", "X.X.."]
PICK = ["XXXX.", ".X.X.", "...X.", "..X..", ".X..."]
DOT = [".X.", "XXX", ".X."]
CODE = ["XX.X", "....", "X.XX", "....", "XX.."]


def remote_screen_icon():
    """16x16 remote: a black handheld with a dark blue screen showing code, and green buttons."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    for x in range(5, 11):
        for y in range(1, 15):
            p[x, y] = BODY + (255,)
    p[5, 1] = p[10, 1] = p[5, 14] = p[10, 14] = (0, 0, 0, 0)
    draw_screen(p, 6, 2, 9, 7)
    draw_symbol(p, ["X.X.", "..X.", "XX..", "...X"], 6, 3, CODE_GREEN)
    for x, y in ((7, 9), (8, 9), (6, 11), (9, 11), (7, 13), (8, 13)):
        p[x, y] = CODE_GREEN + (255,)              # buttons
    return img


def chest_item_icon():
    """16x16 Computer Chest item: a black chest with a dark blue screen on the front and a green seam."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    for x in range(1, 15):
        for y in range(3, 15):
            p[x, y] = BODY + (255,)
    for x in range(1, 15):
        p[x, 7] = CODE_GREEN + (255,)              # the lid seam
    draw_screen(p, 4, 9, 11, 13)
    draw_symbol(p, CODE, 6, 9, CODE_GREEN)
    return img


def slot_screen_icon(kind):
    """16x16 slot label: a little monitor showing the outline of what goes in the slot."""
    shape = SLOT_SHAPES[kind]
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    for x in range(16):
        for y in range(16):
            p[x, y] = BODY + (255,)
    draw_screen(p, 1, 1, 14, 14)
    top = (16 - len(shape)) // 2
    for y, row in enumerate(shape):
        for x, ch in enumerate(row):
            if ch == "X" and 1 <= x <= 14 and 1 <= top + y <= 14:
                p[x, top + y] = (150, 200, 255, 255)
    return img


def pack_icon():
    """256x256 pack icon: a computer (black monitor with a dark blue screen of green code, stand and
    keyboard) on a near-black background, drawn as 64x64 pixel art and scaled up."""
    rng = random.Random(256)
    img = Image.new("RGBA", (64, 64), (10, 10, 10, 255))
    p = img.load()
    edge = (40, 44, 60, 255)
    def box(x0, y0, x1, y1, color):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                p[x, y] = color
    box(6, 5, 57, 42, edge)                        # monitor case (with a thin grey rim)
    box(7, 6, 56, 41, BODY + (255,))
    draw_screen(p, 10, 9, 53, 37)
    for cx in range(12, 52, 3):                    # green code falling down the screen
        head = rng.randrange(9, 38)
        trail = rng.randint(5, 18)
        for k in range(trail):
            y = head - k
            if y < 10 or y > 36 or (k and rng.random() < 0.35):
                continue
            level = 1 - k / trail
            color = (210, 255, 220) if k == 0 else (int(15 + 30 * level), int(80 + 165 * level), int(30 + 50 * level))
            p[cx, y] = color + (255,)
    p[49, 39] = p[50, 39] = CODE_GREEN + (255,)    # power light
    box(28, 43, 35, 48, BODY + (255,))             # stand
    box(20, 49, 43, 50, edge)
    box(8, 53, 55, 60, edge)                       # keyboard
    box(9, 54, 54, 59, BODY + (255,))
    for y in (55, 57):
        for x in range(11, 53, 3):
            p[x, y] = p[x + 1, y] = (30, 34, 48, 255)
    box(20, 59, 43, 59, (30, 34, 48, 255))         # space bar
    return img.resize((256, 256), Image.NEAREST)


# ---------------------------------------------------------------- 2000s computer look
# Everything looks like a computer from the 2000s: beige plastic (bevelled: light top/left edges, dark
# bottom/right), chunky CRT monitors with blue desktop screens (sky and a green hill), tower PCs with
# CD and floppy drives, floppy disks, and a silver TV-style remote with rubber buttons.
BEIGE = (221, 213, 190)
BEIGE_HI = (242, 237, 220)
BEIGE_MID = (196, 187, 160)
BEIGE_DK = (152, 142, 116)
BEIGE_EDGE = (98, 90, 72)
SKY_TOP = (34, 82, 180)
SKY_LOW = (96, 150, 225)
HILL = (72, 152, 58)
HILL_DK = (52, 118, 44)
LED_GREEN = (70, 235, 95)
LED_AMBER = (255, 172, 40)
WHITE = (250, 250, 250)


def _fill(p, x0, y0, x1, y1, c):
    for x in range(x0, x1 + 1):
        for y in range(y0, y1 + 1):
            p[x, y] = c + (255,)


def _bevel(p, x0, y0, x1, y1, base=BEIGE, hi=BEIGE_HI, dk=BEIGE_DK, edge=BEIGE_EDGE):
    """A bevelled plastic box (inclusive corners) with a dark outline."""
    _fill(p, x0, y0, x1, y1, base)
    for x in range(x0, x1 + 1):
        p[x, y0 + 1 if y1 - y0 > 2 else y0] = hi + (255,)
        p[x, y1 - 1 if y1 - y0 > 2 else y1] = dk + (255,)
    for y in range(y0, y1 + 1):
        p[x0 + 1 if x1 - x0 > 2 else x0, y] = hi + (255,)
        p[x1 - 1 if x1 - x0 > 2 else x1, y] = dk + (255,)
    for x in range(x0, x1 + 1):
        p[x, y0] = p[x, y1] = edge + (255,)
    for y in range(y0, y1 + 1):
        p[x0, y] = p[x1, y] = edge + (255,)


def _desktop(p, x0, y0, x1, y1, hill=True):
    """A blue 2000s desktop screen: sky fading down, a green hill along the bottom, a glare pixel."""
    h = max(1, y1 - y0)
    for y in range(y0, y1 + 1):
        t = (y - y0) / h
        sky = tuple(int(SKY_TOP[i] + (SKY_LOW[i] - SKY_TOP[i]) * t) for i in range(3))
        for x in range(x0, x1 + 1):
            p[x, y] = sky + (255,)
    if hill:
        w = max(1, x1 - x0)
        for x in range(x0, x1 + 1):
            u = (x - x0) / w
            top = y1 - int(round((h * 0.45) * (1 - (2 * u - 0.8) ** 2)))
            for y in range(max(y0, top), y1 + 1):
                p[x, y] = (HILL if y > top else HILL_DK) + (255,)
    p[x0, y0] = WHITE + (255,)


def _symbol(p, rows, left, top, color, clip=None):
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != "X":
                continue
            px, py = left + x, top + y
            if clip and not (clip[0] <= px <= clip[2] and clip[1] <= py <= clip[3]):
                continue
            p[px, py] = color + (255,)


def crt_icon(symbol=None):
    """16x16 beige CRT monitor (desktop screen, optional white symbol) with a stand and keyboard."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    _bevel(p, 1, 0, 14, 11)
    _desktop(p, 3, 2, 12, 8, hill=symbol is None)
    if symbol:
        w = max(len(r) for r in symbol)
        _symbol(p, symbol, 3 + (10 - w) // 2, 2 + (7 - len(symbol)) // 2, WHITE)
    p[12, 10] = LED_GREEN + (255,)
    _fill(p, 5, 12, 10, 12, BEIGE_DK)            # stand
    _bevel(p, 1, 13, 14, 15)                      # keyboard
    for x in range(3, 13, 2):
        p[x, 14] = BEIGE_HI + (255,)
    return img


def remote_2000s():
    """16x16 silver TV-style remote: a little green LCD and colored rubber buttons."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    _bevel(p, 5, 0, 10, 15, base=(178, 182, 190), hi=(222, 225, 232), dk=(128, 132, 140), edge=(70, 72, 80))
    _fill(p, 6, 2, 9, 4, (150, 182, 120))         # LCD
    p[7, 3] = p[8, 3] = (60, 80, 50, 255)
    for x, c in zip(range(6, 10), ((220, 50, 50), (60, 190, 70), (240, 200, 40), (60, 110, 230))):
        p[x, 6] = c + (255,)                      # red, green, yellow, blue buttons
    for y in (8, 10, 12):
        p[6, y] = p[7, y] = p[8, y] = p[9, y] = (95, 98, 106, 255)
        p[7, y] = (120, 124, 132, 255)
    p[7, 0] = p[8, 0] = (230, 40, 40, 255)        # IR light
    return img


def floppy_icon(color, symbol, ink):
    """16x16 floppy disk: colored plastic, silver metal shutter on top, white label with a symbol."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    dark = tuple(int(c * 0.55) for c in color)
    light = tuple(min(255, int(c * 1.25) + 20) for c in color)
    _bevel(p, 1, 1, 14, 14, base=color, hi=light, dk=dark, edge=tuple(int(c * 0.35) for c in color))
    p[14, 1] = (0, 0, 0, 0)                       # the cut corner
    _fill(p, 4, 1, 11, 5, (190, 194, 202))        # metal shutter
    _fill(p, 9, 2, 10, 4, (90, 94, 102))          # its window
    _fill(p, 3, 8, 12, 14, (244, 242, 232))       # label
    w = max(len(r) for r in symbol)
    _symbol(p, symbol, 3 + (10 - w) // 2, 9, ink, clip=(3, 8, 12, 14))
    return img


def tower_icon():
    """16x16 beige tower PC: CD drives, a floppy drive, power button and LED, vents."""
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    _bevel(p, 3, 0, 12, 15)
    for y in (2, 4):
        _fill(p, 5, y, 10, y, BEIGE_MID)          # CD drive trays
        p[9, y] = BEIGE_EDGE + (255,)
    _fill(p, 6, 6, 9, 6, BEIGE_EDGE)              # floppy slot
    p[7, 9] = p[8, 9] = BEIGE_DK + (255,)         # power button
    p[7, 10] = p[8, 10] = BEIGE_DK + (255,)
    p[10, 10] = LED_GREEN + (255,)
    p[10, 11] = LED_AMBER + (255,)
    for x in range(5, 11, 2):
        p[x, 13] = BEIGE_DK + (255,)              # vents
    return img


def chest_2000s_texture():
    """64x64 Computer Chest texture (base 16x10x16 at the top, lid 16x6x16 below): beige plastic with
    vents, a dark seam where the lid closes, and a few LEDs."""
    rng = random.Random(2000)
    tex = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    p = tex.load()
    for x in range(64):
        for y in range(48):
            n = rng.randint(-5, 5)
            p[x, y] = tuple(max(0, min(255, c + n)) for c in BEIGE) + (255,)
    for x in range(0, 64, 2):
        for y in (19, 20, 21, 22):                # vents along the base's sides
            p[x, y] = BEIGE_DK + (255,)
    for x in range(64):
        p[x, 16] = BEIGE_EDGE + (255,)            # top edge of the base's sides (the seam)
        p[x, 47] = BEIGE_EDGE + (255,)            # bottom edge of the lid's sides
        p[x, 42] = BEIGE_HI + (255,)              # light edge along the lid
    for x in range(4, 64, 16):
        p[x, 24] = LED_GREEN + (255,)
        p[x + 2, 24] = LED_AMBER + (255,)
    return tex


def coder_2000s_textures():
    """16x16 Coder block: the sides are CRT screens full of code, the top a 3x3 grid of keyboard keys
    (it's a crafting table), the bottom plain beige with vents."""
    rng = random.Random(2001)
    side = Image.new("RGBA", (16, 16))
    p = side.load()
    _bevel(p, 0, 0, 15, 15)
    _fill(p, 2, 2, 13, 11, (16, 36, 96))          # dark blue code editor
    colors = (WHITE, (120, 220, 255), (255, 220, 90), (130, 240, 130))
    for y in range(3, 11, 2):
        indent = rng.choice((0, 0, 1, 2))
        length = rng.randint(3, 9 - indent)
        c = rng.choice(colors)
        for x in range(3 + indent, min(13, 3 + indent + length)):
            p[x, y] = c + (255,)
    p[2, 2] = (120, 150, 230, 255)                # glare
    p[12, 13] = LED_GREEN + (255,)
    _fill(p, 3, 13, 7, 13, BEIGE_DK)              # brand badge
    top = Image.new("RGBA", (16, 16))
    q = top.load()
    _bevel(q, 0, 0, 15, 15)
    for kx in range(3):
        for ky in range(3):
            x0, y0 = 1 + kx * 5, 1 + ky * 5
            _bevel(q, x0, y0, x0 + 3, y0 + 3, base=BEIGE_HI, hi=WHITE, dk=BEIGE_MID, edge=BEIGE_DK)
    bottom = Image.new("RGBA", (16, 16))
    r = bottom.load()
    _bevel(r, 0, 0, 15, 15)
    for y in range(4, 12, 2):
        _fill(r, 4, y, 11, y, BEIGE_DK)
    return side, top, bottom


def slot_2000s_icon(kind):
    """16x16 slot label: a little beige-framed blue screen showing the outline of what goes in the slot."""
    shape = SLOT_SHAPES[kind]
    img = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    p = img.load()
    _fill(p, 0, 0, 15, 15, BEIGE)
    for i in range(16):
        p[i, 0] = p[0, i] = BEIGE_HI + (255,)
        p[i, 15] = p[15, i] = BEIGE_DK + (255,)
    _desktop(p, 1, 1, 14, 14, hill=False)
    top = (16 - len(shape)) // 2
    _symbol(p, shape, 0, top, WHITE, clip=(1, 1, 14, 14))
    return img


def pack_2000s_icon():
    """256x256 pack icon: a 2000s desk setup (beige CRT with a blue desktop, tower, keyboard, mouse),
    drawn as 64x64 pixel art and scaled up."""
    img = Image.new("RGBA", (64, 64), (28, 52, 70, 255))
    p = img.load()
    _fill(p, 0, 50, 63, 63, (92, 66, 44))         # desk
    _fill(p, 0, 50, 63, 50, (120, 88, 60))
    _bevel(p, 4, 6, 41, 40)                       # CRT monitor
    _fill(p, 9, 41, 36, 43, BEIGE_MID)            # its deep back
    _desktop(p, 8, 10, 37, 33)
    for x in range(12, 16):                       # desktop icons
        for y in range(12, 15):
            p[x, y] = WHITE + (255,)
    for x in range(12, 16):
        for y in range(17, 20):
            p[x, y] = (255, 220, 90, 255)
    _fill(p, 8, 33, 37, 34, (36, 80, 200))        # taskbar
    _fill(p, 8, 33, 12, 34, (60, 170, 60))        # start button
    p[36, 38] = p[37, 38] = LED_GREEN + (255,)
    _fill(p, 16, 44, 29, 47, BEIGE_DK)            # stand
    _fill(p, 12, 48, 33, 49, BEIGE_MID)
    _bevel(p, 45, 12, 59, 49)                     # tower
    for y in (16, 20):
        _fill(p, 47, y, 57, y + 1, BEIGE_MID)
        p[55, y + 1] = BEIGE_EDGE + (255,)
    _fill(p, 49, 25, 55, 25, BEIGE_EDGE)          # floppy
    _fill(p, 51, 32, 53, 34, BEIGE_DK)            # power
    p[56, 36] = LED_GREEN + (255,)
    _bevel(p, 6, 53, 39, 59)                      # keyboard
    for y in (55, 57):
        for x in range(8, 38, 2):
            p[x, y] = BEIGE_HI + (255,)
    _bevel(p, 44, 54, 49, 60)                     # mouse
    p[46, 55] = p[47, 55] = BEIGE_EDGE + (255,)
    return img.resize((256, 256), Image.NEAREST)


def main():
    skins = []
    for i, paint in enumerate(AI):
        s = Skin(seed=i)
        paint(s)
        skins.append(s.img)
        s.img.save(RP / f"textures/entity/ai_player/skin_{i}.png")
        head_icon(s.img, 64).save(RP / f"textures/aip/icons/{i}.png")

    # Blocks and items: the 2000s computer look.
    for name, img in zip(("side", "top", "bottom"), coder_2000s_textures()):
        img.save(RP / f"textures/blocks/coder_{name}.png")
    crt_icon(CODE).save(RP / "textures/items/ai_computer.png")   # the AI Computer
    chest_2000s_texture().save(RP / "textures/entity/computer_chest.png")
    tower_icon().save(RP / "textures/items/computer_chest.png")
    for kind in SLOT_SHAPES:
        slot_2000s_icon(kind).save(RP / f"textures/items/slot_{kind}.png")
    floppy_icon((200, 50, 50), SWORD, (200, 40, 40)).save(RP / "textures/items/fighter_egg.png")
    floppy_icon((50, 90, 200), PICK, (40, 70, 190)).save(RP / "textures/items/resource_egg.png")
    floppy_icon((60, 60, 66), DOT, (40, 150, 60)).save(RP / "textures/items/ai_capsule.png")
    # The Remotes (item ids still say "robot" so old ones keep working): a silver TV-style remote.
    remote_2000s().save(RP / "textures/items/fighter_robot.png")
    remote_2000s().save(RP / "textures/items/resource_robot.png")

    # Pack icon: a 2000s computer desk
    icon = pack_2000s_icon()
    for p in ("behavior_pack", "resource_pack"):
        icon.save(ROOT / p / "pack_icon.png")

    print("drew", len(skins), "skins")


if __name__ == "__main__":
    main()
