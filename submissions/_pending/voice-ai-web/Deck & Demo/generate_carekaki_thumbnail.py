from math import cos, sin, pi
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


OUT = Path(__file__).with_name("CareKaki-thumbnail.png")
OUT_SMALL = Path(__file__).with_name("CareKaki-thumbnail-1200x675.png")

W, H = 1600, 900

INK = (22, 32, 31)
MUTED = (86, 105, 99)
TEAL = (12, 139, 128)
TEAL_DARK = (5, 94, 86)
MINT = (217, 248, 239)
CORAL = (239, 85, 84)
SUN = (255, 200, 87)
PAPER = (247, 251, 250)
WHITE = (255, 255, 255)
LINE = (193, 214, 207)


FONT_REG = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"


def font(path, size):
    return ImageFont.truetype(path, size)


def text_size(draw, text, f):
    box = draw.textbbox((0, 0), text, font=f)
    return box[2] - box[0], box[3] - box[1]


def rounded(draw, xy, r, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=r, fill=fill, outline=outline, width=width)


def soft_shadow(base, xy, r=28, blur=32, offset=(0, 16), alpha=70):
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    shifted = (xy[0] + offset[0], xy[1] + offset[1], xy[2] + offset[0], xy[3] + offset[1])
    sd.rounded_rectangle(shifted, radius=r, fill=(0, 34, 32, alpha))
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    base.alpha_composite(shadow)


def add_gradient_background(img):
    px = img.load()
    for y in range(H):
        for x in range(W):
            t = (x / W) * 0.65 + (y / H) * 0.35
            r = int(239 * (1 - t) + 219 * t)
            g = int(250 * (1 - t) + 246 * t)
            b = int(247 * (1 - t) + 241 * t)
            px[x, y] = (r, g, b, 255)

    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-220, -240, 520, 500), fill=(15, 143, 130, 54))
    gd.ellipse((1090, 120, 1840, 920), fill=(239, 93, 94, 40))
    gd.ellipse((720, -360, 1650, 520), fill=(255, 200, 87, 34))
    glow = glow.filter(ImageFilter.GaussianBlur(85))
    img.alpha_composite(glow)


def draw_wave(draw, cx, cy, scale=1.0, color=TEAL):
    bars = [42, 82, 128, 164, 128, 82, 42]
    for i, h in enumerate(bars):
        x = cx + (i - 3) * 29 * scale
        draw.rounded_rectangle(
            (x - 6 * scale, cy - h * scale / 2, x + 6 * scale, cy + h * scale / 2),
            radius=int(7 * scale),
            fill=color,
        )


def draw_phone(base, x, y, w, h, label, accent, urgent=False):
    soft_shadow(base, (x, y, x + w, y + h), r=34, blur=26, offset=(0, 22), alpha=46)
    d = ImageDraw.Draw(base)
    rounded(d, (x, y, x + w, y + h), 36, WHITE, (183, 207, 200), 2)
    rounded(d, (x + 28, y + 30, x + w - 28, y + 86), 20, accent)
    f_label = font(FONT_BOLD, 24)
    tw, th = text_size(d, label, f_label)
    d.text((x + w / 2 - tw / 2, y + 48 - th / 2), label, font=f_label, fill=WHITE)

    if label == "Grandpa":
        d.ellipse((x + w / 2 - 88, y + 155, x + w / 2 + 88, y + 331), fill=MINT)
        draw_wave(d, x + w / 2, y + 243, 0.78, TEAL_DARK)
        rounded(d, (x + 46, y + 382, x + w - 46, y + 452), 18, TEAL_DARK)
        f = font(FONT_BOLD, 23)
        text = "Start call"
        tw, th = text_size(d, text, f)
        d.text((x + w / 2 - tw / 2, y + 417 - th / 2), text, font=f, fill=WHITE)
        d.text((x + 64, y + 500), "“I had kopi. It is quiet today.”", font=font(FONT_REG, 22), fill=MUTED)
    else:
        status = "Urgent" if urgent else "Okay"
        fill = CORAL if urgent else MINT
        text_col = WHITE if urgent else TEAL_DARK
        rounded(d, (x + 58, y + 142, x + w - 58, y + 210), 18, fill)
        f = font(FONT_BOLD, 28)
        tw, th = text_size(d, status, f)
        d.text((x + w / 2 - tw / 2, y + 176 - th / 2), status, font=f, fill=text_col)
        rows = [
            ("Lunch eaten", TEAL),
            ("Mood quiet", SUN),
            ("Night pill risk", CORAL),
        ]
        for i, (txt, col) in enumerate(rows):
            yy = y + 262 + i * 74
            rounded(d, (x + 46, yy, x + w - 46, yy + 52), 14, (251, 253, 252), LINE, 2)
            d.ellipse((x + 70, yy + 19, x + 84, yy + 33), fill=col)
            d.text((x + 104, yy + 15), txt, font=font(FONT_BOLD, 22), fill=INK if i < 2 else CORAL)


def draw_network(base):
    d = ImageDraw.Draw(base)
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    cx, cy = 1042, 178
    nodes = []
    for i in range(18):
        a = i * 2 * pi / 18
        rr = 95 + (i % 3) * 32
        nodes.append((cx + cos(a) * rr, cy + sin(a) * rr))
    for i, p in enumerate(nodes):
        for j in [i + 4, i + 7]:
            q = nodes[j % len(nodes)]
            ld.line((p[0], p[1], q[0], q[1]), fill=(15, 143, 130, 38), width=2)
    for p in nodes:
        ld.ellipse((p[0] - 5, p[1] - 5, p[0] + 5, p[1] + 5), fill=(15, 143, 130, 90))
    layer = layer.filter(ImageFilter.GaussianBlur(0.2))
    base.alpha_composite(layer)
    d.ellipse((cx - 52, cy - 52, cx + 52, cy + 52), fill=(255, 255, 255, 210), outline=(173, 207, 200), width=2)
    draw_wave(d, cx, cy, 0.38, TEAL_DARK)


def main():
    img = Image.new("RGBA", (W, H), PAPER + (255,))
    add_gradient_background(img)
    d = ImageDraw.Draw(img)

    draw_network(img)

    # subtle dotted AI field
    for x in range(80, W, 70):
        for y in range(90, H, 70):
            if (x * 17 + y * 11) % 5 == 0:
                d.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(15, 143, 130, 38))

    # left content
    d.text((92, 84), "CareKaki", font=font(FONT_BLACK, 118), fill=INK)
    d.text((98, 212), "Care without constant calling.", font=font(FONT_BOLD, 48), fill=TEAL_DARK)
    body = "A voice-first companion for seniors, with daily check-ins, medication nudges, mood signals, and caregiver summaries powered by Agora real-time AI."
    words = body.split()
    line = ""
    y = 310
    f_body = font(FONT_REG, 31)
    for word in words:
        cand = word if not line else f"{line} {word}"
        if text_size(d, cand, f_body)[0] <= 650:
            line = cand
        else:
            d.text((100, y), line, font=f_body, fill=MUTED)
            y += 43
            line = word
    if line:
        d.text((100, y), line, font=f_body, fill=MUTED)

    tags = [("Agora RTC", MINT, TEAL_DARK), ("Conversational AI", (255, 226, 224), CORAL), ("Caregiver summary", (255, 242, 203), INK)]
    x = 100
    for txt, fill, col in tags:
        f = font(FONT_BOLD, 25)
        tw, th = text_size(d, txt, f)
        rounded(d, (x, 575, x + tw + 38, 631), 18, fill, col, 2)
        d.text((x + 19, 603 - th / 2), txt, font=f, fill=col)
        x += tw + 58

    # bottom tagline strip
    rounded(d, (92, 705, 735, 825), 26, (255, 255, 255, 220), (191, 214, 207), 2)
    d.text((126, 737), "For seniors: companionship.", font=font(FONT_BOLD, 27), fill=INK)
    d.text((126, 779), "For families: the important moments.", font=font(FONT_REG, 25), fill=MUTED)

    # product mock
    draw_phone(img, 858, 236, 285, 550, "Grandpa", TEAL_DARK)
    draw_phone(img, 1198, 236, 285, 550, "Family", CORAL, urgent=True)

    # connector path
    d = ImageDraw.Draw(img)
    d.line((1148, 492, 1192, 492), fill=TEAL_DARK, width=5)
    d.polygon([(1188, 480), (1210, 492), (1188, 504)], fill=TEAL_DARK)
    d.text((1030, 830), "Voice AI Hackathon Singapore 2026", font=font(FONT_BOLD, 22), fill=TEAL_DARK)

    img = img.convert("RGB")
    img.save(OUT, optimize=True)
    img.resize((1200, 675), Image.Resampling.LANCZOS).save(OUT_SMALL, optimize=True)
    print(OUT)
    print(OUT_SMALL)


if __name__ == "__main__":
    main()
