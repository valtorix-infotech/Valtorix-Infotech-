"""One-off extractor: traces the Valtorix logo artwork into plain polygons.

Reads the three supplied master JPGs and writes `scripts/brand-data.json`
(the single source of truth for every generated brand asset).

Run once; the output JSON is committed so `build-brand.py` never needs the
original raster files again.

    python scripts/extract-brand.py "C:/path/to/Valtorix logo1.jpeg" ...
"""
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "brand-data.json")

# epsilon for Douglas-Peucker simplification, tuned per source
SOURCES = {
    # key            filename hint                       eps   invert
    "mark":      ("logo3", 1.6, False),
    "horizontal": ("logo2", 2.0, False),
    "stacked":   ("logo1", 2.0, False),
}


def _polys_from(mask, eps, min_area=60):
    found, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    polys = []
    for c in found:
        if cv2.contourArea(c) < min_area:     # drop JPEG speckle
            continue
        ap = cv2.approxPolyDP(c, eps, True)
        pts = ap.reshape(-1, 2)
        if len(pts) < 3:
            continue
        polys.append([[int(x), int(y)] for x, y in pts])
    return polys


def contours_of(path, eps):
    """Return list of polygons (list of [x, y]) for every dark shape in the image."""
    gray = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise SystemExit("cannot read %s" % path)
    bw = (gray < 128).astype(np.uint8) * 255
    return _polys_from(bw, eps)


def stacked_parts(path, eps):
    """Split the stacked lockup into black artwork and the white knock-out wordmark.

    The stacked lockup is a black band carrying white lettering, so the lettering
    has to be traced from the inverted plate instead of the black plate.
    """
    gray = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    bw = (gray < 128).astype(np.uint8) * 255
    dark = _polys_from(bw, eps)

    # The band is the widest dark contour in the lower half of the image.
    band = None
    for c in cv2.findContours(bw, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0]:
        x, y, w, h = cv2.boundingRect(c)
        if w > 0.8 * gray.shape[1] and y > gray.shape[0] * 0.5:
            if band is None or w * h > band[4]:
                band = (x, y, w, h, w * h)
    if band is None:
        raise SystemExit("band not found in %s" % path)
    bx, by, bw_, bh, _ = band

    # Inside the band the lettering is white -> trace the inverted plate.
    roi = gray[by:by + bh, bx:bx + bw_]
    inv = (roi > 150).astype(np.uint8) * 255
    light = _polys_from(inv, eps, min_area=40)
    light = [[[x + bx, y + by] for x, y in p] for p in light]
    return dark, light


def main(argv):
    paths = argv[1:]
    if len(paths) != 3:
        raise SystemExit(__doc__)
    data = {}
    for (key, (hint, eps, _inv)), path in zip(SOURCES.items(), paths):
        if key == "stacked":
            dark, light = stacked_parts(path, eps)
            polys = dark
        else:
            light = []
            polys = contours_of(path, eps)
        xs = [p[0] for poly in polys for p in poly]
        ys = [p[1] for poly in polys for p in poly]
        data[key] = {
            "width": int(max(xs) - min(xs)),
            "height": int(max(ys) - min(ys)),
            "min_x": int(min(xs)),
            "min_y": int(min(ys)),
            "polys": polys,
            "light_polys": light,
        }
        pts = sum(len(p) for p in polys) + sum(len(p) for p in light)
        print("%-11s %2d polygons, %3d points, bbox %dx%d"
              % (key, len(polys), pts, data[key]["width"], data[key]["height"]))
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(data, fh, separators=(",", ":"))
    print("wrote", OUT)


if __name__ == "__main__":
    main(sys.argv)
