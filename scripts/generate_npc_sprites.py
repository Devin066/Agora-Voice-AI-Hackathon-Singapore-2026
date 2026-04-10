from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "godot" / "assets" / "characters"
SCALE = 3
CANVAS = 64


def rect(draw: ImageDraw.ImageDraw, x1: int, y1: int, x2: int, y2: int, fill: str) -> None:
    draw.rectangle((x1 * SCALE, y1 * SCALE, x2 * SCALE + (SCALE - 1), y2 * SCALE + (SCALE - 1)), fill=fill)


def ellipse(draw: ImageDraw.ImageDraw, x1: int, y1: int, x2: int, y2: int, fill: str) -> None:
    draw.ellipse((x1 * SCALE, y1 * SCALE, x2 * SCALE + (SCALE - 1), y2 * SCALE + (SCALE - 1)), fill=fill)


def hsym_rects(draw: ImageDraw.ImageDraw, pairs: list[tuple[int, int, int, int]], fill: str, center: int = 32) -> None:
    for x1, y1, x2, y2 in pairs:
        rect(draw, x1, y1, x2, y2, fill)
        mx1 = (center * 2 - 1) - x2
        mx2 = (center * 2 - 1) - x1
        rect(draw, mx1, y1, mx2, y2, fill)


SKIN = {
    "chef": "#F1C6A8",
    "butler": "#D9A47A",
    "maid": "#E6B79A",
    "gardener": "#A96F4B",
}


NPCS = {
    "chef": {
        "shadow": "#09101248",
        "hair": "#6A4A2B",
        "outline": "#1A1714",
        "white": "#F4F0E6",
        "coat": "#E5E1D8",
        "coat_dark": "#C6BCA7",
        "apron": "#FBF7EE",
        "accent": "#B3412D",
        "pants": "#3A4C54",
        "shoes": "#0A1113",
        "hat": "#F8F4EA",
        "hat_band": "#B3412D",
        "walk": [
            {"arm_offset": -1, "leg_left": (28, 52, 31, 61), "leg_right": (33, 52, 36, 61)},
            {"arm_offset": -2, "leg_left": (27, 52, 30, 61), "leg_right": (35, 51, 38, 60)},
            {"arm_offset": 0, "leg_left": (28, 52, 31, 61), "leg_right": (33, 52, 36, 61)},
            {"arm_offset": 2, "leg_left": (26, 51, 29, 60), "leg_right": (34, 52, 37, 61)},
        ],
    },
    "butler": {
        "shadow": "#09101248",
        "hair": "#262425",
        "outline": "#131518",
        "white": "#F0ECE4",
        "coat": "#2F313B",
        "coat_dark": "#1F2128",
        "vest": "#5D2330",
        "tie": "#E2D8C0",
        "pants": "#20242B",
        "shoes": "#080C0D",
        "walk": [
            {"arm_offset": -1, "leg_left": (28, 52, 31, 61), "leg_right": (33, 52, 36, 61)},
            {"arm_offset": -2, "leg_left": (27, 52, 30, 61), "leg_right": (35, 51, 38, 60)},
            {"arm_offset": 0, "leg_left": (28, 52, 31, 61), "leg_right": (33, 52, 36, 61)},
            {"arm_offset": 2, "leg_left": (26, 51, 29, 60), "leg_right": (34, 52, 37, 61)},
        ],
    },
    "maid": {
        "shadow": "#09101248",
        "hair": "#413227",
        "outline": "#1D1B20",
        "skin": "#E8B99A",
        "dress": "#5B7088",
        "dress_dark": "#425467",
        "apron": "#EDE8DE",
        "collar": "#F7F3EC",
        "accent": "#B7C8D6",
        "shoes": "#0B1011",
        "walk": [
            {"arm_offset": -1, "hem_shift": 0, "leg_left": (28, 54, 30, 61), "leg_right": (34, 54, 36, 61)},
            {"arm_offset": -2, "hem_shift": -1, "leg_left": (27, 54, 29, 61), "leg_right": (35, 53, 37, 60)},
            {"arm_offset": 0, "hem_shift": 0, "leg_left": (28, 54, 30, 61), "leg_right": (34, 54, 36, 61)},
            {"arm_offset": 2, "hem_shift": 1, "leg_left": (27, 53, 29, 60), "leg_right": (35, 54, 37, 61)},
        ],
    },
    "gardener": {
        "shadow": "#09101248",
        "hair": "#3E2918",
        "outline": "#182015",
        "skin": "#B4764F",
        "shirt": "#5E7F4E",
        "shirt_dark": "#49643C",
        "overalls": "#6A503B",
        "strap": "#D5B68A",
        "hat": "#7D5C33",
        "brim": "#5B4223",
        "pants": "#314235",
        "shoes": "#0B1011",
        "walk": [
            {"arm_offset": -1, "leg_left": (28, 52, 31, 61), "leg_right": (33, 52, 36, 61)},
            {"arm_offset": -2, "leg_left": (27, 52, 30, 61), "leg_right": (35, 51, 38, 60)},
            {"arm_offset": 0, "leg_left": (28, 52, 31, 61), "leg_right": (33, 52, 36, 61)},
            {"arm_offset": 2, "leg_left": (26, 51, 29, 60), "leg_right": (34, 52, 37, 61)},
        ],
    },
}


def new_canvas(shadow: str) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (CANVAS * SCALE, CANVAS * SCALE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    ellipse(draw, 20, 53, 43, 60, shadow)
    return image, draw


def draw_face(draw: ImageDraw.ImageDraw, skin: str, hair: str, outline: str, y_top: int = 8) -> None:
    rect(draw, 24, y_top, 39, 21, skin)
    rect(draw, 24, y_top + 8, 39, 23, skin)
    rect(draw, 26, y_top + 8, 29, y_top + 9, outline)
    rect(draw, 34, y_top + 8, 37, y_top + 9, outline)
    rect(draw, 29, y_top + 12, 34, y_top + 12, "#9E6E52")
    rect(draw, 23, y_top - 1, 40, y_top + 2, hair)
    rect(draw, 23, y_top + 2, 24, y_top + 9, hair)
    rect(draw, 39, y_top + 2, 40, y_top + 9, hair)


def save(image: Image.Image, filename: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    image = image.resize((192, 192), resample=Image.Resampling.NEAREST)
    image.save(OUT_DIR / filename)


def draw_chef(frame: dict[str, int], filename: str) -> None:
    cfg = NPCS["chef"]
    image, draw = new_canvas(cfg["shadow"])
    hsym_rects(draw, [(19, 21, 22, 44), (23, 24, 26, 50)], cfg["coat"])
    rect(draw, 27, 23, 36, 49, cfg["apron"])
    rect(draw, 29, 28, 34, 31, cfg["coat_dark"])
    rect(draw, 30, 31, 33, 44, cfg["accent"])
    rect(draw, 30, 45, 33, 49, cfg["coat_dark"])
    rect(draw, 26 + frame["arm_offset"], 30, 28 + frame["arm_offset"], 44, cfg["coat_dark"])
    rect(draw, 35 - frame["arm_offset"], 30, 37 - frame["arm_offset"], 44, cfg["coat_dark"])
    leg_left = frame["leg_left"]
    leg_right = frame["leg_right"]
    rect(draw, *leg_left, cfg["pants"])
    rect(draw, *leg_right, cfg["pants"])
    rect(draw, leg_left[0] - 1, 60, leg_left[2] + 1, 61, cfg["shoes"])
    rect(draw, leg_right[0] - 1, 60, leg_right[2] + 1, 61, cfg["shoes"])
    draw_face(draw, SKIN["chef"], cfg["hair"], cfg["outline"])
    rect(draw, 22, 10, 41, 13, cfg["hat"])
    rect(draw, 23, 8, 40, 10, cfg["hat"])
    rect(draw, 24, 13, 39, 14, cfg["hat_band"])
    save(image, filename)


def draw_butler(frame: dict[str, int], filename: str) -> None:
    cfg = NPCS["butler"]
    image, draw = new_canvas(cfg["shadow"])
    hsym_rects(draw, [(19, 21, 22, 46), (23, 24, 26, 50)], cfg["coat"])
    rect(draw, 27, 23, 36, 49, cfg["coat_dark"])
    rect(draw, 29, 24, 34, 38, cfg["vest"])
    rect(draw, 30, 24, 33, 27, cfg["tie"])
    rect(draw, 27, 39, 28, 50, cfg["white"])
    rect(draw, 35, 39, 36, 50, cfg["white"])
    rect(draw, 26 + frame["arm_offset"], 29, 28 + frame["arm_offset"], 46, cfg["coat_dark"])
    rect(draw, 35 - frame["arm_offset"], 29, 37 - frame["arm_offset"], 46, cfg["coat_dark"])
    leg_left = frame["leg_left"]
    leg_right = frame["leg_right"]
    rect(draw, *leg_left, cfg["pants"])
    rect(draw, *leg_right, cfg["pants"])
    rect(draw, leg_left[0] - 1, 60, leg_left[2] + 1, 61, cfg["shoes"])
    rect(draw, leg_right[0] - 1, 60, leg_right[2] + 1, 61, cfg["shoes"])
    draw_face(draw, SKIN["butler"], cfg["hair"], cfg["outline"])
    rect(draw, 24, 9, 39, 11, cfg["hair"])
    rect(draw, 24, 10, 25, 14, cfg["hair"])
    rect(draw, 38, 10, 39, 14, cfg["hair"])
    save(image, filename)


def draw_maid(frame: dict[str, int], filename: str) -> None:
    cfg = NPCS["maid"]
    image, draw = new_canvas(cfg["shadow"])
    rect(draw, 23, 21, 40, 23, cfg["collar"])
    rect(draw, 21, 24, 42, 48 + frame["hem_shift"], cfg["dress"])
    rect(draw, 24, 24, 39, 50 + frame["hem_shift"], cfg["dress"])
    rect(draw, 26, 26, 37, 47 + frame["hem_shift"], cfg["apron"])
    rect(draw, 28, 48 + frame["hem_shift"], 35, 51 + frame["hem_shift"], cfg["dress_dark"])
    rect(draw, 23 + frame["arm_offset"], 30, 25 + frame["arm_offset"], 46, cfg["dress_dark"])
    rect(draw, 39 - frame["arm_offset"], 30, 41 - frame["arm_offset"], 46, cfg["dress_dark"])
    leg_left = frame["leg_left"]
    leg_right = frame["leg_right"]
    rect(draw, *leg_left, cfg["accent"])
    rect(draw, *leg_right, cfg["accent"])
    rect(draw, leg_left[0] - 1, 60, leg_left[2] + 1, 61, cfg["shoes"])
    rect(draw, leg_right[0] - 1, 60, leg_right[2] + 1, 61, cfg["shoes"])
    draw_face(draw, cfg["skin"], cfg["hair"], cfg["outline"])
    rect(draw, 24, 9, 39, 12, cfg["hair"])
    rect(draw, 22, 15, 24, 18, cfg["hair"])
    rect(draw, 39, 15, 41, 18, cfg["hair"])
    rect(draw, 24, 10, 39, 12, cfg["collar"])
    rect(draw, 26, 8, 37, 9, cfg["apron"])
    save(image, filename)


def draw_gardener(frame: dict[str, int], filename: str) -> None:
    cfg = NPCS["gardener"]
    image, draw = new_canvas(cfg["shadow"])
    hsym_rects(draw, [(19, 22, 22, 44), (23, 24, 26, 50)], cfg["shirt"])
    rect(draw, 27, 23, 36, 49, cfg["overalls"])
    rect(draw, 28, 24, 29, 48, cfg["strap"])
    rect(draw, 34, 24, 35, 48, cfg["strap"])
    rect(draw, 30, 25, 33, 36, cfg["shirt_dark"])
    rect(draw, 26 + frame["arm_offset"], 30, 28 + frame["arm_offset"], 44, cfg["shirt_dark"])
    rect(draw, 35 - frame["arm_offset"], 30, 37 - frame["arm_offset"], 44, cfg["shirt_dark"])
    leg_left = frame["leg_left"]
    leg_right = frame["leg_right"]
    rect(draw, *leg_left, cfg["pants"])
    rect(draw, *leg_right, cfg["pants"])
    rect(draw, leg_left[0] - 1, 60, leg_left[2] + 1, 61, cfg["shoes"])
    rect(draw, leg_right[0] - 1, 60, leg_right[2] + 1, 61, cfg["shoes"])
    draw_face(draw, cfg["skin"], cfg["hair"], cfg["outline"])
    rect(draw, 21, 10, 42, 13, cfg["brim"])
    rect(draw, 24, 8, 39, 11, cfg["hat"])
    save(image, filename)


def main() -> None:
    drawers = {
        "chef": draw_chef,
        "butler": draw_butler,
        "maid": draw_maid,
        "gardener": draw_gardener,
    }

    for name, draw_fn in drawers.items():
        frames = NPCS[name]["walk"]
        draw_fn(frames[0], f"{name}_idle.png")
        for index, frame in enumerate(frames):
            draw_fn(frame, f"{name}_walk_{index}.png")


if __name__ == "__main__":
    main()
