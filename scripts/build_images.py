"""Generate the width variants of every content image.

    python scripts/build_images.py

The site served one 1400px image to every device. On a phone that is four
times the pixels the screen can show, and web.dev puts the waste at two to
four times the data needed. The variant widths here cover the layouts the
site actually uses:

    480   a single column on a phone
    800   one column on a tablet, two columns on a desktop
    1200  a full-width image on a large screen
    1400  the original

Only the WebP variants are generated: every browser that can run this site
supports WebP, and the JPEG stays as the fallback for the `src` attribute.
"""
import glob
import io
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, 'images')

WIDTHS = [480, 800, 1200, 1400]


def variants(path):
    """The width variants of one image, as (width, filename) pairs."""
    name = os.path.splitext(os.path.basename(path))[0]
    out = []
    for w in WIDTHS:
        out.append((w, '%s-%d.webp' % (name, w)))
    return out


def main():
    made = 0
    images = 0
    for path in sorted(glob.glob(os.path.join(IMAGES, '*.jpg'))):
        base = os.path.basename(path)
        if not (base.startswith('industry-') or base.startswith('service-') or
                base.startswith('project-') or base in ('team.jpg', 'case-corporate.jpg')):
            continue
        with Image.open(path) as im:
            im = im.convert('RGB')
            source_width = im.width
            for w, name in variants(path):
                target = os.path.join(IMAGES, name)
                if os.path.exists(target):
                    continue
                if w > source_width:
                    # never upscale - the original is already the largest
                    continue
                out = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
                out.save(target, 'WEBP', quality=78, method=6)
                made += 1
        images += 1
    print('%d variant(s) written for %d image(s)' % (made, images))


if __name__ == '__main__':
    main()
