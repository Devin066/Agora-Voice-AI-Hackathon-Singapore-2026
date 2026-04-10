from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


OUT = Path(__file__).with_name("CareKaki-pitch-deck.pdf")

PAGE_W, PAGE_H = landscape((13.333 * inch, 7.5 * inch))

INK = colors.HexColor("#17201F")
MUTED = colors.HexColor("#5D6B66")
TEAL = colors.HexColor("#0F8F82")
TEAL_DARK = colors.HexColor("#086D64")
MINT = colors.HexColor("#DDF6EF")
CORAL = colors.HexColor("#F05D5E")
CORAL_LIGHT = colors.HexColor("#FFE1DE")
SUN = colors.HexColor("#FFC857")
GREEN = colors.HexColor("#35A06B")
PAPER = colors.HexColor("#F7FBFA")
WHITE = colors.white
LINE = colors.HexColor("#C9D8D3")
BLACK = colors.HexColor("#111111")


def set_font(c, name="Helvetica", size=18, color=INK):
    c.setFont(name, size)
    c.setFillColor(color)


def wrap_text(text, font_name, font_size, max_width):
    words = text.split()
    lines = []
    line = ""
    for word in words:
        candidate = word if not line else f"{line} {word}"
        if stringWidth(candidate, font_name, font_size) <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def draw_wrapped(c, text, x, y, max_width, font_size=18, leading=None,
                 font_name="Helvetica", color=INK, max_lines=None):
    leading = leading or font_size * 1.25
    set_font(c, font_name, font_size, color)
    lines = wrap_text(text, font_name, font_size, max_width)
    if max_lines:
        lines = lines[:max_lines]
    for i, line in enumerate(lines):
        c.drawString(x, y - i * leading, line)
    return y - len(lines) * leading


def pill(c, x, y, text, fill, stroke=None, text_color=INK, pad_x=14,
         height=28, font_size=11, radius=8):
    stroke = stroke or fill
    w = stringWidth(text, "Helvetica-Bold", font_size) + pad_x * 2
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.roundRect(x, y, w, height, radius, stroke=1, fill=1)
    set_font(c, "Helvetica-Bold", font_size, text_color)
    c.drawCentredString(x + w / 2, y + height / 2 - font_size / 2 + 3, text)
    return w


def top_rule(c, section):
    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    c.setStrokeColor(LINE)
    c.setLineWidth(1)
    c.line(0.55 * inch, PAGE_H - 0.48 * inch, PAGE_W - 0.55 * inch, PAGE_H - 0.48 * inch)
    set_font(c, "Helvetica-Bold", 10, TEAL_DARK)
    c.drawString(0.64 * inch, PAGE_H - 0.34 * inch, section.upper())
    set_font(c, "Helvetica", 9, MUTED)
    c.drawRightString(PAGE_W - 0.64 * inch, PAGE_H - 0.34 * inch, "Voice AI Hackathon Singapore 2026")


def footer(c, n):
    set_font(c, "Helvetica", 9, MUTED)
    c.drawString(0.64 * inch, 0.28 * inch, "CareKaki")
    c.drawRightString(PAGE_W - 0.64 * inch, 0.28 * inch, str(n))


def title(c, text, subtitle=None, y=None):
    y = y or PAGE_H - 1.45 * inch
    font_name = "Helvetica-Bold"
    font_size = 40
    max_width = PAGE_W - 1.7 * inch
    lines = wrap_text(text, font_name, font_size, max_width)
    if len(lines) > 1:
        font_size = 34
        lines = wrap_text(text, font_name, font_size, max_width)
    set_font(c, font_name, font_size, INK)
    leading = font_size * 1.18
    for i, line in enumerate(lines):
        c.drawString(0.82 * inch, y - i * leading, line)
    if subtitle:
        draw_wrapped(c, subtitle, 0.85 * inch, y - len(lines) * leading - 0.14 * inch,
                     PAGE_W - 1.7 * inch, 17, color=MUTED)


def card(c, x, y, w, h, fill=WHITE, stroke=LINE, radius=10):
    c.setFillColor(fill)
    c.setStrokeColor(stroke)
    c.setLineWidth(1)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)


def bullet(c, x, y, heading, body, color=TEAL):
    c.setFillColor(color)
    c.circle(x, y + 4, 5, stroke=0, fill=1)
    set_font(c, "Helvetica-Bold", 17, INK)
    c.drawString(x + 18, y, heading)
    draw_wrapped(c, body, x + 18, y - 24, 4.6 * inch, 13, color=MUTED)


def draw_voice_wave(c, cx, cy, scale=1.0, color=TEAL):
    c.setStrokeColor(color)
    c.setLineWidth(3)
    for i, h in enumerate([34, 62, 94, 62, 34]):
        x = cx + (i - 2) * 18 * scale
        c.roundRect(x - 3 * scale, cy - h * scale / 2, 6 * scale,
                    h * scale, 3 * scale, stroke=1, fill=0)


def draw_phone(c, x, y, w, h, title_text, accent=TEAL):
    card(c, x, y, w, h, WHITE, colors.HexColor("#BFD3CC"), 18)
    c.setFillColor(accent)
    c.roundRect(x + 0.22 * inch, y + h - 0.55 * inch, w - 0.44 * inch,
                0.32 * inch, 9, stroke=0, fill=1)
    set_font(c, "Helvetica-Bold", 11, WHITE)
    c.drawCentredString(x + w / 2, y + h - 0.43 * inch, title_text)
    return x, y, w, h


def slide_1(c):
    top_rule(c, "Title")
    set_font(c, "Helvetica-Bold", 58, INK)
    c.drawString(0.82 * inch, PAGE_H - 1.55 * inch, "CareKaki")
    set_font(c, "Helvetica-Bold", 28, TEAL_DARK)
    c.drawString(0.86 * inch, PAGE_H - 2.1 * inch, "Care without constant calling.")
    draw_wrapped(
        c,
        "A voice-first companion for seniors, with daily check-ins, medication nudges, mood signals, and caregiver summaries powered by Agora real-time AI.",
        0.88 * inch,
        PAGE_H - 2.8 * inch,
        5.6 * inch,
        18,
        color=MUTED,
    )
    pill_y = PAGE_H - 4.45 * inch
    pill(c, 0.9 * inch, pill_y, "Agora RTC SDK", MINT, TEAL, TEAL_DARK)
    pill(c, 2.85 * inch, pill_y, "Conversational AI Engine", CORAL_LIGHT, CORAL, CORAL)
    pill(c, 5.7 * inch, pill_y, "Agent Builder Pipeline", colors.HexColor("#FFF0C7"), SUN, INK)

    draw_phone(c, 8.2 * inch, 1.03 * inch, 2.05 * inch, 4.9 * inch, "Grandpa")
    draw_phone(c, 10.55 * inch, 1.03 * inch, 2.05 * inch, 4.9 * inch, "Family")
    draw_voice_wave(c, 9.23 * inch, 3.26 * inch, 1.0, TEAL)
    set_font(c, "Helvetica-Bold", 16, INK)
    c.drawCentredString(9.23 * inch, 2.18 * inch, "Talk")
    c.setFillColor(MINT)
    c.roundRect(10.8 * inch, 4.75 * inch, 1.55 * inch, 0.42 * inch, 8, stroke=0, fill=1)
    set_font(c, "Helvetica-Bold", 13, TEAL_DARK)
    c.drawCentredString(11.58 * inch, 4.91 * inch, "Okay")
    for i, text in enumerate(["Lunch eaten", "Mood quiet", "Night pill risk"]):
        y = 4.18 * inch - i * 0.56 * inch
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.roundRect(10.83 * inch, y, 1.5 * inch, 0.36 * inch, 7, stroke=1, fill=1)
        set_font(c, "Helvetica", 9.5, INK if i < 2 else CORAL)
        c.drawCentredString(11.58 * inch, y + 0.13 * inch, text)
    footer(c, 1)


def slide_2(c):
    top_rule(c, "Problem")
    title(c, "Families miss the moments between calls.")
    set_font(c, "Helvetica-Bold", 72, CORAL)
    c.drawString(0.9 * inch, 4.35 * inch, "87k")
    draw_wrapped(c, "seniors 65+ lived alone in Singapore in 2024",
                 0.95 * inch, 3.95 * inch, 5.45 * inch, 20,
                 font_name="Helvetica-Bold")
    set_font(c, "Helvetica-Bold", 64, TEAL_DARK)
    c.drawString(0.9 * inch, 2.55 * inch, "1 in 4")
    draw_wrapped(c, "citizens will be 65+ by 2030",
                 0.95 * inch, 2.18 * inch, 5.45 * inch, 20,
                 font_name="Helvetica-Bold")

    card(c, 7.25 * inch, 1.25 * inch, 4.95 * inch, 4.55 * inch, WHITE)
    set_font(c, "Helvetica-Bold", 23, INK)
    c.drawString(7.63 * inch, 5.17 * inch, "The care gap")
    bullet(c, 7.73 * inch, 4.48 * inch, "Calling too often feels intrusive.",
           "Families want care without making seniors feel watched.", CORAL)
    bullet(c, 7.73 * inch, 3.22 * inch, "Not calling hides weak signals.",
           "Meals, medication confusion, loneliness, and dizziness can disappear between calls.", TEAL)
    bullet(c, 7.73 * inch, 1.96 * inch, "Caregivers need signal, not surveillance.",
           "The right alert at the right moment beats constant checking.", GREEN)
    set_font(c, "Helvetica", 8.8, MUTED)
    c.drawString(0.9 * inch, 0.58 * inch,
                 "Sources: Singapore MOH Parliamentary QA, 15 Oct 2025; MOH Ageing in the community, updated Apr 2026.")
    footer(c, 2)


def slide_3(c):
    top_rule(c, "Solution")
    title(c, "A daily voice companion that turns conversation into care signals.")
    cols = [
        ("1", "Speak naturally", "Grandpa talks about kopi, lunch, pain, loneliness, or medicine in his own words.", TEAL),
        ("2", "Understand gently", "CareKaki keeps replies short, one question at a time, and extracts useful family context.", SUN),
        ("3", "Escalate safely", "If medication confusion plus dizziness appears, family sees an urgent care signal.", CORAL),
    ]
    for i, (num, head, body, col) in enumerate(cols):
        x = 0.85 * inch + i * 4.1 * inch
        card(c, x, 1.45 * inch, 3.55 * inch, 3.7 * inch, WHITE)
        c.setFillColor(col)
        c.circle(x + 0.48 * inch, 4.65 * inch, 0.23 * inch, stroke=0, fill=1)
        set_font(c, "Helvetica-Bold", 18, WHITE if col != SUN else INK)
        c.drawCentredString(x + 0.48 * inch, 4.57 * inch, num)
        set_font(c, "Helvetica-Bold", 24, INK)
        c.drawString(x + 0.85 * inch, 4.48 * inch, head)
        draw_wrapped(c, body, x + 0.36 * inch, 3.65 * inch, 2.85 * inch, 17, color=MUTED)
    footer(c, 3)


def slide_4(c):
    top_rule(c, "Demo Story")
    title(c, "The judge demo follows one senior, one family, one urgent moment.")
    timeline = [
        ("Morning", "Kopi and lunch", "Meal and medicine become calm care signals.", TEAL),
        ("Memory", "Knee still sore", "CareKaki remembers yesterday and asks gently.", SUN),
        ("Lonely", "Misses grandson", "Family gets a human note, not an alarm.", GREEN),
        ("Risk", "Maybe took night pill twice + dizzy", "CareKaki says: do not take another pill, sit down, alerting family.", CORAL),
        ("Handoff", "Family joins", "The agent summarizes the room context in seconds.", TEAL_DARK),
    ]
    x0 = 0.95 * inch
    y = 5.0 * inch
    for i, (stage, head, body, col) in enumerate(timeline):
        x = x0 + i * 2.42 * inch
        c.setStrokeColor(col)
        c.setLineWidth(3)
        if i < len(timeline) - 1:
            c.line(x + 0.55 * inch, y, x + 2.35 * inch, y)
        c.setFillColor(col)
        c.circle(x + 0.45 * inch, y, 0.18 * inch, stroke=0, fill=1)
        set_font(c, "Helvetica-Bold", 12, col)
        c.drawCentredString(x + 0.45 * inch, y + 0.42 * inch, stage.upper())
        set_font(c, "Helvetica-Bold", 18, INK)
        draw_wrapped(c, head, x, y - 0.56 * inch, 1.85 * inch, 17, font_name="Helvetica-Bold")
        draw_wrapped(c, body, x, y - 1.15 * inch, 1.95 * inch, 12.5, color=MUTED)
    card(c, 1.0 * inch, 0.92 * inch, 11.35 * inch, 1.2 * inch, MINT, TEAL)
    set_font(c, "Helvetica-Bold", 23, TEAL_DARK)
    c.drawString(1.32 * inch, 1.57 * inch, "What judges should remember")
    set_font(c, "Helvetica", 18, INK)
    c.drawString(1.32 * inch, 1.17 * inch,
                 "CareKaki makes one ordinary conversation useful for companionship, family awareness, and safe escalation.")
    footer(c, 4)


def slide_5(c):
    top_rule(c, "Product")
    title(c, "Built as real software, with a reliable stage demo.")
    draw_phone(c, 0.95 * inch, 1.05 * inch, 3.25 * inch, 4.75 * inch, "Senior app", TEAL)
    c.setFillColor(MINT)
    c.circle(2.58 * inch, 4.35 * inch, 0.55 * inch, stroke=0, fill=1)
    draw_voice_wave(c, 2.58 * inch, 4.35 * inch, 0.55, TEAL_DARK)
    set_font(c, "Helvetica-Bold", 17, INK)
    c.drawCentredString(2.58 * inch, 3.35 * inch, "Start CareKaki")
    set_font(c, "Helvetica", 11, MUTED)
    c.drawCentredString(2.58 * inch, 2.95 * inch, "Large controls, readable transcript")

    draw_phone(c, 4.95 * inch, 1.05 * inch, 3.25 * inch, 4.75 * inch, "Family app", CORAL)
    for i, (label, col) in enumerate([("Meal: lunch eaten", GREEN), ("Mood: quiet", SUN), ("Medication: urgent", CORAL)]):
        y = 4.6 * inch - i * 0.65 * inch
        c.setFillColor(WHITE)
        c.setStrokeColor(LINE)
        c.roundRect(5.35 * inch, y, 2.45 * inch, 0.43 * inch, 8, stroke=1, fill=1)
        c.setFillColor(col)
        c.circle(5.58 * inch, y + 0.21 * inch, 0.07 * inch, stroke=0, fill=1)
        set_font(c, "Helvetica-Bold", 11, INK)
        c.drawString(5.78 * inch, y + 0.14 * inch, label)

    card(c, 9.0 * inch, 1.05 * inch, 3.25 * inch, 4.75 * inch, WHITE)
    set_font(c, "Helvetica-Bold", 22, INK)
    c.drawString(9.38 * inch, 5.13 * inch, "Demo reliability")
    items = [
        ("Live Agora voice", "Preferred path for judging."),
        ("Scripted beats", "Fallback if venue audio fails."),
        ("Same care state", "The dashboard updates visibly."),
    ]
    for i, (h, b) in enumerate(items):
        yy = 4.34 * inch - i * 1.02 * inch
        bullet(c, 9.38 * inch, yy, h, b, [TEAL, SUN, CORAL][i])
    footer(c, 5)


def slide_6(c):
    top_rule(c, "Architecture")
    title(c, "Agora is the real-time backbone.")
    boxes = [
        (0.8, 4.0, 2.35, "Browser client", "Next.js, React, mic, transcript, care UI", TEAL),
        (3.65, 4.0, 2.35, "Agora RTC", "Low-latency audio channel and remote agent audio", GREEN),
        (6.5, 4.0, 2.35, "Conversational AI", "Managed agent joins the same channel", CORAL),
        (9.35, 4.0, 2.65, "Agent Builder", "Pipeline mode for STT, LLM, and TTS", SUN),
    ]
    for x_in, y_in, w_in, head, body, col in boxes:
        x, y, w = x_in * inch, y_in * inch, w_in * inch
        card(c, x, y, w, 1.25 * inch, WHITE)
        c.setFillColor(col)
        c.roundRect(x, y + 1.03 * inch, w, 0.22 * inch, 7, stroke=0, fill=1)
        set_font(c, "Helvetica-Bold", 17, INK)
        c.drawString(x + 0.18 * inch, y + 0.72 * inch, head)
        draw_wrapped(c, body, x + 0.18 * inch, y + 0.39 * inch, w - 0.36 * inch, 10.5, color=MUTED)
    c.setStrokeColor(TEAL_DARK)
    c.setLineWidth(2)
    for x in [3.24, 6.08, 8.94]:
        c.line(x * inch, 4.62 * inch, (x + 0.3) * inch, 4.62 * inch)
        c.line((x + 0.24) * inch, 4.7 * inch, (x + 0.3) * inch, 4.62 * inch)
        c.line((x + 0.24) * inch, 4.54 * inch, (x + 0.3) * inch, 4.62 * inch)

    card(c, 1.25 * inch, 1.25 * inch, 4.9 * inch, 1.6 * inch, MINT, TEAL)
    set_font(c, "Helvetica-Bold", 21, TEAL_DARK)
    c.drawString(1.55 * inch, 2.22 * inch, "Python backend")
    draw_wrapped(c, "Generates RTC/RTM tokens, starts the Agora AI agent, and handles hangup.",
                 1.55 * inch, 1.86 * inch, 4.2 * inch, 14, color=INK)
    card(c, 7.1 * inch, 1.25 * inch, 4.9 * inch, 1.6 * inch, CORAL_LIGHT, CORAL)
    set_font(c, "Helvetica-Bold", 21, CORAL)
    c.drawString(7.4 * inch, 2.22 * inch, "Care signal layer")
    draw_wrapped(c, "Local rules convert transcript moments into caregiver cards, timeline, and alerts.",
                 7.4 * inch, 1.86 * inch, 4.2 * inch, 14, color=INK)
    footer(c, 6)


def slide_7(c):
    top_rule(c, "Safety")
    title(c, "Designed to assist, not diagnose.")
    left = [
        ("Medication uncertainty", "Do not take another pill right now."),
        ("Dizziness or falls", "Sit down, keep the phone nearby, alert family."),
        ("Chest or breathing trouble", "Escalate immediately to family/emergency support."),
    ]
    card(c, 0.9 * inch, 1.05 * inch, 5.65 * inch, 4.7 * inch, WHITE)
    set_font(c, "Helvetica-Bold", 25, INK)
    c.drawString(1.25 * inch, 5.12 * inch, "Safety triggers")
    for i, (h, b) in enumerate(left):
        bullet(c, 1.3 * inch, 4.35 * inch - i * 1.18 * inch, h, b, CORAL if i == 0 else TEAL)
    card(c, 7.05 * inch, 1.05 * inch, 5.35 * inch, 4.7 * inch, WHITE)
    set_font(c, "Helvetica-Bold", 25, INK)
    c.drawString(7.38 * inch, 5.12 * inch, "What makes it different")
    bullet(c, 7.45 * inch, 4.35 * inch, "Companion first",
           "The senior experience feels like talking, not being monitored.", GREEN)
    bullet(c, 7.45 * inch, 3.13 * inch, "Family gets context",
           "Caregivers see concise summaries, important quotes, and next actions.", TEAL)
    bullet(c, 7.45 * inch, 1.91 * inch, "Hackathon-real",
           "Live Agora voice path plus scripted fallback for reliable judging.", SUN)
    footer(c, 7)


def slide_8(c):
    top_rule(c, "Submission")
    title(c, "Built, verified, and ready for the final build sprint.")
    metrics = [
        ("RTC voice", "Agora browser channel working"),
        ("AI agent", "Backend starts RUNNING agent"),
        ("Frontend", "Lint and build passed"),
        ("Backend", "31 tests passed"),
    ]
    for i, (h, b) in enumerate(metrics):
        x = 0.95 * inch + (i % 2) * 5.95 * inch
        y = 3.82 * inch - (i // 2) * 1.55 * inch
        card(c, x, y, 5.25 * inch, 1.1 * inch, WHITE)
        c.setFillColor(GREEN)
        c.circle(x + 0.38 * inch, y + 0.55 * inch, 0.14 * inch, stroke=0, fill=1)
        set_font(c, "Helvetica-Bold", 19, INK)
        c.drawString(x + 0.72 * inch, y + 0.64 * inch, h)
        set_font(c, "Helvetica", 14, MUTED)
        c.drawString(x + 0.72 * inch, y + 0.33 * inch, b)
    card(c, 0.95 * inch, 0.92 * inch, 11.2 * inch, 1.18 * inch, MINT, TEAL)
    set_font(c, "Helvetica-Bold", 26, TEAL_DARK)
    c.drawString(1.28 * inch, 1.52 * inch, "Next: polish CareKaki UI, record the demo, submit.")
    set_font(c, "Helvetica", 14, INK)
    c.drawString(1.28 * inch, 1.17 * inch,
                 "Manual Chrome microphone test remains the final live voice check before recording.")
    footer(c, 8)


def slide_9(c):
    top_rule(c, "Close")
    set_font(c, "Helvetica-Bold", 50, INK)
    c.drawString(0.9 * inch, PAGE_H - 1.65 * inch, "CareKaki")
    draw_wrapped(c, "The voice check-in between family calls.",
                 0.93 * inch, PAGE_H - 2.35 * inch, 6.4 * inch,
                 31, font_name="Helvetica-Bold", color=TEAL_DARK)
    draw_wrapped(c,
                 "For seniors: companionship. For families: the important moments. For hackathon judges: a working real-time Agora voice AI experience.",
                 0.95 * inch, PAGE_H - 3.2 * inch, 7.0 * inch, 21, color=MUTED)
    card(c, 8.7 * inch, 1.1 * inch, 3.6 * inch, 4.8 * inch, WHITE)
    c.setFillColor(TEAL)
    c.circle(10.5 * inch, 4.35 * inch, 0.72 * inch, stroke=0, fill=1)
    draw_voice_wave(c, 10.5 * inch, 4.35 * inch, 0.7, WHITE)
    set_font(c, "Helvetica-Bold", 24, INK)
    c.drawCentredString(10.5 * inch, 3.12 * inch, "Demo")
    set_font(c, "Helvetica", 15, MUTED)
    c.drawCentredString(10.5 * inch, 2.72 * inch, "/demo")
    c.drawCentredString(10.5 * inch, 2.38 * inch, "/grandpa")
    c.drawCentredString(10.5 * inch, 2.04 * inch, "/family")
    footer(c, 9)


SLIDES = [
    slide_1,
    slide_2,
    slide_3,
    slide_4,
    slide_5,
    slide_6,
    slide_7,
    slide_8,
    slide_9,
]


def main():
    c = canvas.Canvas(str(OUT), pagesize=(PAGE_W, PAGE_H))
    c.setTitle("CareKaki Pitch Deck")
    c.setAuthor("Team CareKaki")
    c.setSubject("Voice AI Hackathon Singapore 2026 submission deck")
    for slide in SLIDES:
        slide(c)
        c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    main()
