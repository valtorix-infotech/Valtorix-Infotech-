"""Generates the full 3D stage geometry for the VALTORIX site.

One persistent scene is made of four layers:

  mark   the extruded VALTORIX V  (the narrator)
  slabs  floating module panels   (the products / practices)
  grid   a perspective floor grid (the blueprint world)
  motes  drifting depth points    (atmosphere)

Output: `stage3d-geometry.js`

    python scripts/build_stage3d.py
"""
import json
import math
import os
import random

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

with open(os.path.join(HERE, "brand-data.json"), encoding="utf-8") as fh:
    BRAND = json.load(fh)

MARK = BRAND["mark"]

# ---------------------------------------------------------------- settings
TARGET_WIDTH = 1.72
DEPTH = 0.27
BEVEL = 0.032
BEVEL_DEPTH = 0.044

SLAB_COUNT = 30
GRID_HALF = 26.0
GRID_STEP = 4.0
GRID_Y = -2.6
GRID_FAR = -96.0
MOTE_COUNT = 340

random.seed(20261111)


# ---------------------------------------------------------------- geometry
def signed_area(poly):
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def to_ccw(poly):
    return list(poly) if signed_area(poly) > 0 else list(reversed(poly))


def point_in_tri(p, a, b, c):
    def cross(o, u, v):
        return (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0])
    d1 = cross(a, b, p)
    d2 = cross(b, c, p)
    d3 = cross(c, a, p)
    return not (((d1 < 0) or (d2 < 0) or (d3 < 0)) and ((d1 > 0) or (d2 > 0) or (d3 > 0)))


def triangulate(poly):
    pts = to_ccw(poly)
    idx = list(range(len(pts)))
    tris = []
    guard = 0
    while len(idx) > 3 and guard < 5000:
        guard += 1
        clipped = False
        for i in range(len(idx)):
            i0 = idx[(i - 1) % len(idx)]
            i1 = idx[i]
            i2 = idx[(i + 1) % len(idx)]
            a, b, c = pts[i0], pts[i1], pts[i2]
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if cross <= 0:
                continue
            if any(point_in_tri(pts[j], a, b, c) for j in idx if j not in (i0, i1, i2)):
                continue
            tris.append((i0, i1, i2))
            idx.pop(i)
            clipped = True
            break
        if not clipped:
            break
    if len(idx) == 3:
        tris.append((idx[0], idx[1], idx[2]))
    got = sum(
        (pts[a][0] * pts[b][1] - pts[b][0] * pts[a][1]
         + pts[b][0] * pts[c][1] - pts[c][0] * pts[b][1]
         + pts[c][0] * pts[a][1] - pts[a][0] * pts[c][1]) / 2.0
        for a, b, c in tris
    )
    want = abs(signed_area(poly))
    if abs(got - want) > max(1e-6, want * 0.001):
        raise SystemExit("triangulation mismatch: got %.4f want %.4f" % (got, want))
    return pts, tris


def inset(poly, amount):
    n = len(poly)
    lines = []
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length
        lines.append(((x1 + nx * amount, y1 + ny * amount), (dx, dy)))
    out = []
    for i in range(n):
        (p1, d1) = lines[(i - 1) % n]
        (p2, d2) = lines[i]
        denom = d1[0] * d2[1] - d1[1] * d2[0]
        if abs(denom) < 1e-9:
            out.append(poly[i])
            continue
        t = ((p2[0] - p1[0]) * d2[1] - (p2[1] - p1[1]) * d2[0]) / denom
        out.append((p1[0] + d1[0] * t, p1[1] + d1[1] * t))
    return out


def edge_normals(poly):
    n = len(poly)
    out = []
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1.0
        out.append((dy / length, -dx / length))
    return out


def normalize(v):
    length = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / length for c in v)


class Mesh:
    def __init__(self):
        self.positions = []
        self.normals = []
        self.indices = []

    def tri(self, a, b, c, na, nb, nc):
        base = len(self.positions) // 3
        for p, n in ((a, na), (b, nb), (c, nc)):
            self.positions.extend(p)
            self.normals.extend(n)
        self.indices.extend([base, base + 1, base + 2])

    def quad(self, p1, p2, p3, p4, n):
        self.tri(p1, p2, p3, n, n, n)
        self.tri(p1, p3, p4, n, n, n)


def extrude_mark(mesh, poly2d, scale, yflip, z_front, z_bevel, z_back):
    poly = [(x * scale, y * yflip * scale) for x, y in poly2d]
    front_pts, tris = triangulate(poly)
    inner = inset(front_pts, BEVEL * scale)
    n = len(front_pts)

    for a, b, c in tris:
        mesh.tri((inner[a][0], inner[a][1], z_front),
                 (inner[b][0], inner[b][1], z_front),
                 (inner[c][0], inner[c][1], z_front),
                 (0, 0, 1), (0, 0, 1), (0, 0, 1))
    for a, b, c in tris:
        mesh.tri((front_pts[a][0], front_pts[a][1], z_back),
                 (front_pts[c][0], front_pts[c][1], z_back),
                 (front_pts[b][0], front_pts[b][1], z_back),
                 (0, 0, -1), (0, 0, -1), (0, 0, -1))

    normals = edge_normals(front_pts)
    for i in range(n):
        j = (i + 1) % n
        nb = normalize((normals[i][0] * 0.72, normals[i][1] * 0.72, 0.69))
        mesh.quad((inner[i][0], inner[i][1], z_front),
                  (inner[j][0], inner[j][1], z_front),
                  (front_pts[j][0], front_pts[j][1], z_bevel),
                  (front_pts[i][0], front_pts[i][1], z_bevel), nb)
    for i in range(n):
        j = (i + 1) % n
        nxy = normals[i]
        mesh.quad((front_pts[i][0], front_pts[i][1], z_bevel),
                  (front_pts[j][0], front_pts[j][1], z_bevel),
                  (front_pts[j][0], front_pts[j][1], z_back),
                  (front_pts[i][0], front_pts[i][1], z_back),
                  (nxy[0], nxy[1], 0))


def add_box(mesh, cx, cy, cz, hx, hy, hz):
    """Axis-aligned box, centred on (cx, cy, cz)."""
    p = [
        (cx - hx, cy - hy, cz - hz), (cx + hx, cy - hy, cz - hz),
        (cx + hx, cy + hy, cz - hz), (cx - hx, cy + hy, cz - hz),
        (cx - hx, cy - hy, cz + hz), (cx + hx, cy - hy, cz + hz),
        (cx + hx, cy + hy, cz + hz), (cx - hx, cy + hy, cz + hz),
    ]
    faces = [
        ((0, 1, 2, 3), (0, 0, -1)),
        ((5, 4, 7, 6), (0, 0, 1)),
        ((1, 5, 6, 2), (1, 0, 0)),
        ((4, 0, 3, 7), (-1, 0, 0)),
        ((3, 2, 6, 7), (0, 1, 0)),
        ((4, 5, 1, 0), (0, -1, 0)),
    ]
    for idx, nrm in faces:
        mesh.quad(p[idx[0]], p[idx[1]], p[idx[2]], p[idx[3]], nrm)


def main():
    # ---------------------------------------------------------------- mark
    scale = TARGET_WIDTH / MARK["width"]
    yflip = -1.0
    mark = Mesh()
    half = DEPTH / 2.0
    for poly in MARK["polys"]:
        centred = [[x - MARK["min_x"], y - MARK["min_y"]] for x, y in poly]
        extrude_mark(mark, centred, scale, yflip, half, half - BEVEL_DEPTH, -half)
    xs = mark.positions[0::3]
    ys = mark.positions[1::3]
    cx = -(min(xs) + max(xs)) / 2.0
    cy = -(min(ys) + max(ys)) / 2.0
    for i in range(0, len(mark.positions), 3):
        mark.positions[i] += cx
        mark.positions[i + 1] += cy

    # ---------------------------------------------------------------- slabs
    # Module panels the camera flies past. Laid out in a loose constellation
    # so the world reads as depth rather than a grid of cards.
    slabs = Mesh()
    slab_meta = []
    for i in range(SLAB_COUNT):
        lane = i % 4
        depth = -6.0 - (i // 4) * 9.5 - random.uniform(0, 4.0)
        side = (-1 if lane % 2 == 0 else 1) * random.uniform(3.0, 9.5)
        y = random.uniform(-1.6, 2.6)
        w = random.uniform(0.35, 1.35)
        h = random.uniform(0.02, 0.07)
        d = random.uniform(0.3, 1.0)
        tilt = random.uniform(-0.7, 0.7)
        add_box(slabs, side, y, depth, w, h, d)
        slab_meta.append([round(side, 3), round(y, 3), round(depth, 3), round(tilt, 3)])

    # ---------------------------------------------------------------- grid
    grid = []
    x = -GRID_HALF
    while x <= GRID_HALF + 0.001:
        grid.extend([x, GRID_Y, 2.0, x, GRID_Y, GRID_FAR])
        x += GRID_STEP
    z = 0.0
    while z >= GRID_FAR:
        grid.extend([-GRID_HALF, GRID_Y, z, GRID_HALF, GRID_Y, z])
        z -= GRID_STEP

    # ---------------------------------------------------------------- motes
    motes = []
    for _ in range(MOTE_COUNT):
        motes.extend([
            round(random.uniform(-16, 16), 3),
            round(random.uniform(-3.5, 6.0), 3),
            round(random.uniform(-88, 4), 3),
            round(random.uniform(1.0, 3.4), 3),   # size
        ])

    def arr(values, digits=4):
        return json.dumps([round(v, digits) for v in values], separators=(",", ":"))

    js = (
        "/* VALTORIX 3D stage geometry — generated by scripts/build_stage3d.py.\n"
        " * The extruded VALTORIX V mark plus the world it travels through:\n"
        " * module slabs, a blueprint floor grid and depth motes.\n"
        " * Do not edit by hand. */\n"
        "window.VALTORIX_STAGE = {\n"
        "  mark: {\n"
        "    positions: new Float32Array(%s),\n"
        "    normals: new Float32Array(%s),\n"
        "    indices: new Uint16Array(%s)\n"
        "  },\n"
        "  slabs: {\n"
        "    positions: new Float32Array(%s),\n"
        "    normals: new Float32Array(%s),\n"
        "    indices: new Uint16Array(%s)\n"
        "  },\n"
        "  grid: { positions: new Float32Array(%s) },\n"
        "  motes: { data: new Float32Array(%s) }\n"
        "};\n"
    ) % (
        arr(mark.positions), arr(mark.normals), json.dumps(mark.indices, separators=(",", ":")),
        arr(slabs.positions), arr(slabs.normals), json.dumps(slabs.indices, separators=(",", ":")),
        arr(grid), arr(motes),
    )

    out = os.path.join(ROOT, "stage3d-geometry.js")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(js)

    print("mark   %4d tris" % (len(mark.indices) // 3))
    print("slabs  %4d tris  (%d slabs)" % (len(slabs.indices) // 3, SLAB_COUNT))
    print("grid   %4d lines" % (len(grid) // 6))
    print("motes  %4d points" % MOTE_COUNT)
    print("wrote %s (%.1f KB)" % (out, os.path.getsize(out) / 1024))


if __name__ == "__main__":
    main()
