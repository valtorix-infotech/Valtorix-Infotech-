"""Generates WebP variants of every photograph and writes them next to the JPEG.

Browsers that support WebP (~97% of traffic) get the smaller file; everything
else keeps the JPEG. The HTML uses <picture> with a WebP source and a JPEG
fallback, so nothing is ever broken by a browser that cannot read WebP.

    python scripts/build_webp.py
"""
import glob
import os
import shutil

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
IMAGES = os.path.join(ROOT, "images")

QUALITY = 78
MIN_BYTES = 8 * 1024   # only keep a WebP if it is actually smaller


def convert(src):
    """Return the WebP path if it is worth using, else None."""
    out = os.path.splitext(src)[0] + ".webp"
    with Image.open(src) as im:
        im = im.convert("RGB")
        im.save(out, "WEBP", quality=QUALITY, method=5)
    src_size = os.path.getsize(src)
    out_size = os.path.getsize(out)
    if out_size >= src_size:
        os.remove(out)
        return None, src_size, out_size
    return out, src_size, out_size


def main():
    files = sorted(
        f for f in glob.glob(os.path.join(IMAGES, "**", "*"), recursive=True)
        if os.path.isfile(f)
        and f.lower().endswith((".jpg", ".jpeg", ".png"))
        and os.path.basename(f) not in ("apple-touch-icon.png",)
        and "brand" not in f.replace("\\", "/").split("/")
    )
    total_before = total_after = 0
    made = 0
    for f in files:
        out, before, after = convert(f)
        total_before += before
        if out:
            total_after += after
            made += 1
            print("  %-44s %6.0f KB -> %5.0f KB" % (os.path.basename(f), before / 1024, after / 1024))
        else:
            total_after += before
    print("\n%d WebP variants written." % made)
    if made:
        print("Pages that use them must switch to <picture> with a WebP <source>.")


if __name__ == "__main__":
    main()
