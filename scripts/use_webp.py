"""Rewrites every <img> that has a WebP variant into a <picture> element.

    <picture>
      <source srcset="images/x.webp" type="image/webp">
      <img src="images/x.jpg" alt="..." loading="lazy" ...>
    </picture>

Browsers that support WebP fetch the smaller file; everything else keeps the
JPEG. The <picture> element is display:contents, so the layout is unchanged.

    python scripts/use_webp.py
"""
import glob
import io
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMAGES = os.path.join(ROOT, "images")

TAG = re.compile(r'<img\s+([^>]*?)src="(images/[^"]+?\.(?:jpg|jpeg|png))"([^>]*?)/?>')


def main():
    total = 0
    for path in sorted(glob.glob(os.path.join(ROOT, "*.html"))):
        src = io.open(path, encoding="utf-8").read()
        changed = 0

        def repl(m):
            nonlocal changed
            before, srcpath, after = m.group(1), m.group(2), m.group(3)
            webp = os.path.splitext(srcpath)[0] + ".webp"
            if not os.path.exists(os.path.join(ROOT, webp)):
                return m.group(0)
            # the legacy logo paths are not used as <img> sources
            if srcpath.endswith(("logo.png", "logo-white.png")):
                return m.group(0)
            changed += 1
            return (
                '<picture><source srcset="%s" type="image/webp">'
                '<img %ssrc="%s"%s/>'
                '</picture>'
            ) % (webp, before, srcpath, after)

        out = TAG.sub(repl, src)
        if out != src:
            io.open(path, "w", encoding="utf-8", newline="\n").write(out)
            total += changed
            print("  %-22s %d images" % (os.path.basename(path), changed))
    print("%d images switched to <picture> with a WebP source." % total)


if __name__ == "__main__":
    main()
