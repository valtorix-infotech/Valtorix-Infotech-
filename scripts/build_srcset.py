"""Give every content image a responsive srcset.

    python scripts/build_srcset.py

`srcset` tells the browser how wide each candidate file is; `sizes` tells
it how wide the slot will be. Without `sizes`, a browser assumes the image
fills the viewport and downloads the largest file it has - which is how a
1400px photograph ends up on a 375px phone.

The slot width is derived from the layout the image sits in, so the two
cannot disagree. Running it again changes nothing, so it is safe to run
after any layout change.

Run it after adding an image or changing a layout.
"""
import glob
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTHS = [480, 800, 1200, 1400]

# The slot an image occupies, by the layout it sits in. These mirror the
# grid definitions in styles.css exactly - the breakpoints below are the
# ones the stylesheet uses, not the ones that seem reasonable.
#
#   .work-grid  2 columns above 960, 1 column below
#   .split      2 columns above 1080, 1 column below
#   .grid-3     3 columns above 960, 2 below, 1 below 720
#   .img-grid   3 columns above 960, 2 below, 1 below 720
#   .grid-4     4 columns above 1080, 2 below, 1 below 720
SIZES = {
    'work-grid': '(max-width: 960px) 92vw, 600px',
    'split': '(max-width: 1080px) 92vw, 600px',
    'grid-3': '(max-width: 720px) 92vw, (max-width: 960px) 46vw, 400px',
    'img-grid': '(max-width: 720px) 92vw, (max-width: 960px) 46vw, 400px',
    'grid-4': '(max-width: 720px) 92vw, (max-width: 1080px) 46vw, 300px',
    'grid-2': '(max-width: 720px) 92vw, 600px',
}
DEFAULT = '(max-width: 1080px) 92vw, 600px'

PICTURE = re.compile(r'<picture>.*?</picture>', re.S)
OPEN = re.compile(r'<(?:div|section|article)[^>]*class="([^"]*)"[^>]*>')


def container_of(before):
    """The layout the element sits in - the nearest grid or split above it."""
    best = None
    for m in OPEN.finditer(before):
        classes = m.group(1).split()
        for name in SIZES:
            if name in classes:
                if best is None or m.start() > best[0]:
                    best = (m.start(), name)
    return best[1] if best else None


def srcset_for(base):
    """The candidate list for an image, skipping widths that do not exist."""
    parts = []
    for w in WIDTHS:
        name = '%s-%d.webp' % (base[:-len('.jpg')], w)
        if os.path.exists(os.path.join(ROOT, 'images', name)):
            parts.append('images/%s %dw' % (name, w))
    return ', '.join(parts)


def main():
    total = 0
    for path in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        name = os.path.basename(path)
        src = io.open(path, encoding='utf-8').read()
        count = [0]

        def rewrite(m):
            before = src[:m.start()]
            block = m.group(0)
            jpg = (re.search(r'<img[^>]*src="([^"]+)"', block) or [None, ''])[1]
            if not jpg or '/brand/' in jpg:
                return block          # a logo mark, not a photograph
            variants = srcset_for(os.path.basename(jpg))
            if not variants:
                return block
            sizes = SIZES.get(container_of(before), DEFAULT)

            img = re.search(r'<img\b[^>]*>', block).group(0)
            # keep everything about the image except the srcset we are replacing
            img = re.sub(r'\s+srcset="[^"]*"', '', img)
            if ' sizes=' not in img:
                img = img[:-1] + '>'

            count[0] += 1
            return ('<picture>'
                    '<source srcset="' + variants + '" sizes="' + sizes + '" type="image/webp">'
                    + img +
                    '</picture>')

        s = PICTURE.sub(rewrite, src)
        if count[0]:
            io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
            total += count[0]
            print('  %-24s %d image(s)' % (name, count[0]))
    print('%d image(s) now have a responsive srcset' % total)


if __name__ == '__main__':
    main()
