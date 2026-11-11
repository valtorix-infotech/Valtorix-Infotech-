"""Generates every Valtorix brand asset from `scripts/brand-data.json`.

The JSON holds the traced polygons of the three supplied master artworks
(mark / horizontal lockup / stacked lockup). This script turns them into
production-ready SVG + PNG files.

    python scripts/build-brand.py

Outputs (all under `images/brand/`):
    valtorix-mark.svg            mark, ink black
    valtorix-mark-white.svg      mark, white
    favicon.svg / favicon-white.svg
    valtorix-logo.svg            horizontal lockup, ink
    valtorix-logo-white.svg      horizontal lockup, white
    valtorix-logo-stacked.svg    stacked lockup (mark over black band)
    favicon-16.png favicon-32.png favicon-64.png
    apple-touch-icon.png icon-192.png icon-512.png
    og-image.png                 1200x630 social card
"""
import json
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, "brand-data.json")
OUTDIR = os.path.join(ROOT, "images", "brand")

INK = "#0A0A0A"
WHITE = "#FFFFFF"
SS = 4  # supersampling factor for PNG rasterisation

with open(DATA, encoding="utf-8") as fh:
    DATA_JSON = json.load(fh)


# --------------------------------------------------------------------------- svg
def path_d(polys, ox, oy):
    parts = []
    for poly in polys:
        seg = ["M %d %d" % (poly[0][0] - ox, poly[0][1] - oy)]
        for x, y in poly[1:]:
            seg.append("L %d %d" % (x - ox, y - oy))
        seg.append("Z")
        parts.append(" ".join(seg))
    return " ".join(parts)


def write_svg(name, view_w, view_h, d, fill):
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
        'width="%d" height="%d" role="img">\n'
        '  <title>VALTORIX INFOTECH</title>\n'
        '  <path fill="%s" fill-rule="evenodd" d="%s"/>\n'
        "</svg>\n"
    ) % (view_w, view_h, view_w, view_h, fill, d)
    with open(os.path.join(OUTDIR, name), "w", encoding="utf-8") as fh:
        fh.write(svg)


# --------------------------------------------------------------------------- png
def render(polys, size_w, size_h, box, color, supersample=SS):
    """Rasterise polygons into an RGBA image.

    `box` is (min_x, min_y, width, height) of the source artwork; it is fitted
    into size_w x size_h preserving aspect ratio and centred.
    """
    ss = supersample
    canvas = Image.new("L", (size_w * ss, size_h * ss), 0)
    scale = min(size_w * ss / box[2], size_h * ss / box[3])
    off_x = (size_w * ss - box[2] * scale) / 2
    off_y = (size_h * ss - box[3] * scale) / 2
    acc = None
    import numpy as np

    for poly in polys:
        layer = Image.new("L", canvas.size, 0)
        d = ImageDraw.Draw(layer)
        pts = [
            ((x - box[0]) * scale + off_x, (y - box[1]) * scale + off_y)
            for x, y in poly
        ]
        d.polygon(pts, fill=255)
        arr = np.array(layer, dtype=bool)
        # even-odd parity: outer shells XOR with their knock-out counters
        acc = arr if acc is None else np.logical_xor(acc, arr)
    mask = Image.fromarray((acc * 255).astype("uint8"), "L")
    mask = mask.resize((size_w, size_h), Image.LANCZOS)
    img = Image.new("RGBA", (size_w, size_h), (0, 0, 0, 0))
    fill = tuple(int(color[i:i + 2], 16) for i in (1, 3, 5)) + (255,)
    img.paste(fill, (0, 0), mask)
    return img


def save(img, name):
    img.save(os.path.join(OUTDIR, name), optimize=True)
    print("  %-26s %s" % (name, os.path.getsize(os.path.join(OUTDIR, name))))


def font(name, size):
    try:
        return ImageFont.truetype(os.path.join("C:/Windows/Fonts", name), size)
    except OSError:
        return ImageFont.load_default()


def tracked(draw, xy, text, fnt, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + tracking
    return x


def tracked_width(draw, text, fnt, tracking):
    if not text:
        return 0
    return sum(draw.textlength(c, font=fnt) for c in text) + tracking * (len(text) - 1)


def tracked_center(draw, cx, y, text, fnt, fill, tracking):
    w = tracked_width(draw, text, fnt, tracking)
    tracked(draw, (cx - w / 2, y), text, fnt, fill, tracking)


# --------------------------------------------------------------------------- main
def main():
    os.makedirs(OUTDIR, exist_ok=True)

    mark = DATA_JSON["mark"]
    horiz = DATA_JSON["horizontal"]
    stack = DATA_JSON["stacked"]

    # --- SVG ---------------------------------------------------------------
    write_svg("valtorix-mark.svg", mark["width"], mark["height"],
              path_d(mark["polys"], mark["min_x"], mark["min_y"]), INK)
    write_svg("valtorix-mark-white.svg", mark["width"], mark["height"],
              path_d(mark["polys"], mark["min_x"], mark["min_y"]), WHITE)
    write_svg("favicon.svg", mark["width"], mark["height"],
              path_d(mark["polys"], mark["min_x"], mark["min_y"]), INK)
    write_svg("favicon-white.svg", mark["width"], mark["height"],
              path_d(mark["polys"], mark["min_x"], mark["min_y"]), WHITE)
    write_svg("valtorix-logo.svg", horiz["width"], horiz["height"],
              path_d(horiz["polys"], horiz["min_x"], horiz["min_y"]), INK)
    write_svg("valtorix-logo-white.svg", horiz["width"], horiz["height"],
              path_d(horiz["polys"], horiz["min_x"], horiz["min_y"]), WHITE)

    # stacked lockup: black artwork + white knock-out wordmark
    st_d = path_d(stack["polys"], stack["min_x"], stack["min_y"])
    st_l = path_d(stack["light_polys"], stack["min_x"], stack["min_y"])
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" '
        'width="%d" height="%d" role="img">\n'
        '  <title>VALTORIX INFOTECH</title>\n'
        '  <path fill="%s" fill-rule="evenodd" d="%s"/>\n'
        '  <path fill="%s" fill-rule="evenodd" d="%s"/>\n'
        "</svg>\n"
    ) % (stack["width"], stack["height"], stack["width"], stack["height"],
         INK, st_d, WHITE, st_l)
    with open(os.path.join(OUTDIR, "valtorix-logo-stacked.svg"), "w", encoding="utf-8") as fh:
        fh.write(svg)

    # --- PNG ---------------------------------------------------------------
    mb = (mark["min_x"], mark["min_y"], mark["width"], mark["height"])
    hb = (horiz["min_x"], horiz["min_y"], horiz["width"], horiz["height"])

    for size in (16, 32, 64):
        save(render(mark["polys"], size, size, mb, INK), "favicon-%d.png" % size)
    save(render(mark["polys"], 180, 180, mb, INK), "apple-touch-icon.png")
    save(render(mark["polys"], 192, 192, mb, INK), "icon-192.png")
    save(render(mark["polys"], 512, 512, mb, INK), "icon-512.png")

    # legacy names kept so any old markup keeps working
    save(render(horiz["polys"], 676, 177, hb, INK), "logo.png")
    save(render(horiz["polys"], 676, 177, hb, WHITE), "logo-white.png")
    # ...and the same lockup at the legacy path outside images/brand/
    render(horiz["polys"], 676, 177, hb, INK).save(
        os.path.join(ROOT, "images", "logo.png"), optimize=True)
    render(horiz["polys"], 676, 177, hb, WHITE).save(
        os.path.join(ROOT, "images", "logo-white.png"), optimize=True)

    # --- social card -------------------------------------------------------
    card = Image.new("RGB", (1200, 630), (255, 255, 255))
    draw = ImageDraw.Draw(card)
    lock = render(horiz["polys"], 540, 141, hb, INK, supersample=3)
    card.paste(lock, ((1200 - 540) // 2, 176), lock)
    draw.rectangle([0, 0, 1199, 10], fill=(10, 10, 10))
    draw.rectangle([0, 620, 1199, 629], fill=(10, 10, 10))
    fnt = font("arialbd.ttf", 24)
    tracked_center(draw, 600, 396, "SOFTWARE STUDIO  ·  HYDERABAD", fnt, (10, 10, 10), 6)
    fnt2 = font("arial.ttf", 19)
    tracked_center(draw, 600, 446, "WEB  ·  MOBILE  ·  AI  ·  CLOUD", fnt2, (120, 120, 118), 3)
    card.save(os.path.join(OUTDIR, "og-image.png"), optimize=True)
    print("  %-26s %s" % ("og-image.png", os.path.getsize(os.path.join(OUTDIR, "og-image.png"))))


if __name__ == "__main__":
    main()
