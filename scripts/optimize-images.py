"""Optimises the photographic assets in `images/`.

Every source photo in the repo is 1.3-2.9 MB, which wrecks Core Web Vitals on
mobile. This script re-encodes them to a sane size (max 1400px wide,
progressive JPEG, quality 82) which keeps them visually identical at the
size they are actually displayed.

    python scripts/optimize-images.py            # only touches files > 250 KB
    python scripts/optimize-images.py --force    # re-encode everything
"""
import glob
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, "images")

MAX_W = 1400
QUALITY = 82
THRESHOLD = 250 * 1024
FORCE = "--force" in sys.argv

SKIP_DIRS = {"brand"}
SKIP_NAMES = {"logo.png", "logo-white.png", "apple-touch-icon.png"}


def save_jpeg(img, dest):
    if img.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        img = img.convert("RGBA")
        bg.paste(img, mask=img.split()[-1])
        img = bg
    else:
        img = img.convert("RGB")
    img.save(dest, "JPEG", quality=QUALITY, optimize=True, progressive=True)


def main():
    total_before = total_after = 0
    touched = 0
    for path in sorted(glob.glob(os.path.join(IMAGES, "**", "*"), recursive=True)):
        if not os.path.isfile(path):
            continue
        rel = os.path.relpath(path, IMAGES)
        if rel.split(os.sep)[0] in SKIP_DIRS or os.path.basename(path) in SKIP_NAMES:
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext not in (".jpg", ".jpeg", ".png"):
            continue
        size = os.path.getsize(path)
        total_before += size
        if not FORCE and size <= THRESHOLD:
            total_after += size
            continue
        try:
            with Image.open(path) as im:
                w, h = im.size
                if w > MAX_W:
                    im = im.resize((MAX_W, round(h * MAX_W / w)), Image.LANCZOS)
                dest = os.path.splitext(path)[0] + ".jpg"
                save_jpeg(im, dest)
        except Exception as exc:  # noqa: BLE001
            print("  skip %-42s %s" % (rel, exc))
            total_after += size
            continue
        if dest != path and os.path.exists(path):
            os.remove(path)
        new = os.path.getsize(dest)
        total_after += new
        touched += 1
        print("  %-42s %6.0f KB -> %5.0f KB" % (rel, size / 1024, new / 1024))
    print("\n%d file(s) re-encoded. Total %.1f MB -> %.1f MB"
          % (touched, total_before / 1048576, total_after / 1048576))


if __name__ == "__main__":
    main()
