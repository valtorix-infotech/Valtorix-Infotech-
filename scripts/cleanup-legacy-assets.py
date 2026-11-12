"""Replaces the legacy blue-logo favicons with the new mark and removes assets
that still carry the previous brand (or are exact duplicates).

Run after `build-brand.py`:

    python scripts/cleanup-legacy-assets.py
"""
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMAGES = os.path.join(ROOT, "images")
BRAND = os.path.join(IMAGES, "brand")

sys.path.insert(0, HERE)
from build_brand import DATA_JSON, render  # noqa: E402

# Files to delete: previous-brand artwork, superseded hero backgrounds,
# exact duplicates, and the retired webgl helpers.
DELETE = [
    # duplicate of about-office-hero.jpg
    "8c2c453b-0f7e-4172-bbca-8be31b7702cb.jpg",
    # exact duplicate of project-fintrack.jpg
    "project-fintrack.jpg.jpg",
    # previous brand artwork (blue logo / old tagline)
    "VALTORIX_INFOTECH_8K.jpg",
    "fav-icon.jpg",
    "about-office.jpg",       # old blue logo on the office wall
    "faq-image.jpg",           # old blue logo on the office wall
    "who-we-are-office.jpg",   # old tagline
    "project-ecommerce.jpg",   # old brand in the header
    "project-corporate.jpg",   # screenshot of the previous website
    # superseded photo heroes (the CSS grid hero replaced these)
    "hero-bg.jpg",
    "about-office-hero.jpg",
    "contact-hero.jpg",
    "services-hero.jpg",
    "solutions-hero.jpg",
    "projects-hero.jpg",
    "form-hero.jpg",
    "journey-bg.jpg",
    "why-valtorix-bg.jpg",
    "featured-solution-bg.jpg",
    # no longer referenced (parallax + magnetic buttons are gone)
    "project-edulearn-case.jpg",
    "case-education.jpg",
    "case-retail.jpg",
]


def main():
    mark = DATA_JSON["mark"]
    mb = (mark["min_x"], mark["min_y"], mark["width"], mark["height"])

    # legacy-named favicons, regenerated from the new mark
    for size in (16, 32, 64):
        render(mark["polys"], size, size, mb, "#0A0A0A").save(
            os.path.join(IMAGES, "favicon-%dx%d.png" % (size, size)), optimize=True)

    icon = render(mark["polys"], 256, 256, mb, "#0A0A0A")
    icon.save(os.path.join(IMAGES, "favicon.ico"),
              format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    # apple-touch-icon: black mark on white (iOS expects an opaque square)
    touch = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
    inner = render(mark["polys"], 132, 132, mb, "#0A0A0A")
    touch.alpha_composite(inner, (24, 24))
    touch.save(os.path.join(IMAGES, "apple-touch-icon.png"), optimize=True)

    removed = 0
    for name in DELETE:
        p = os.path.join(IMAGES, name)
        if os.path.exists(p):
            os.remove(p)
            removed += 1
            print("  removed  %s" % name)

    print("%d legacy asset(s) removed; favicons regenerated from the new mark." % removed)


if __name__ == "__main__":
    main()
