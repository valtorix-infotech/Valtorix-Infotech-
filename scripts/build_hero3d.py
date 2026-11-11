"""Builds the 3D hero geometry from the traced VALTORIX mark.

The mark is two concave polygons. This script:
  1. triangulates each polygon with ear clipping (and verifies the result
     against the polygon's shoelace area),
  2. extrudes it into a bevelled solid,
  3. writes a compact flat buffer that `hero3d.js` uploads straight to the GPU.

Output: `hero3d-geometry.js`  (a plain script, no module system needed)

    python scripts/build_hero3d.py
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

with open(os.path.join(HERE, "brand-data.json"), encoding="utf-8") as fh:
    BRAND = json.load(fh)

MARK = BRAND["mark"]

# ---------------------------------------------------------------- settings
TARGET_WIDTH = 1.72   # world units
DEPTH = 0.27          # full depth of the solid
BEVEL = 0.032         # chamfer size on the front edge
BEVEL_DEPTH = 0.044   # how far the chamfer sits back from the front face


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
    has_neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    has_pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (has_neg and has_pos)


def triangulate(poly):
    """Ear clipping. Returns a list of index triples into `poly`."""
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
            # convex?
            cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
            if cross <= 0:
                continue
            # no other vertex inside?
            if any(
                point_in_tri(pts[j], a, b, c)
                for j in idx
                if j not in (i0, i1, i2)
            ):
                continue
            tris.append((i0, i1, i2))
            idx.pop(i)
            clipped = True
            break
        if not clipped:
            break
    if len(idx) == 3:
        tris.append((idx[0], idx[1], idx[2]))

    # verify against the shoelace area
    got = sum(
        (pts[a][0] * pts[b][1] - pts[b][0] * pts[a][1]) / 2.0 for a, b, c in tris
    )
    want = abs(signed_area(poly))
    if abs(got - want) > max(1.0, want * 0.01):
        raise SystemExit("triangulation mismatch: got %.1f want %.1f" % (got, want))
    return pts, tris


def inset(poly, amount):
    """Offset every edge inward by `amount` and re-intersect the edges."""
    n = len(poly)
    lines = []
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / length, dx / length          # inward for CCW winding
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
    """Outward XY normal per edge (for a CCW polygon the outward normal is the
    right-hand normal)."""
    n = len(poly)
    out = []
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1.0
        out.append((dy / length, -dx / length))
    return out


class Mesh:
    def __init__(self):
        self.positions = []
        self.normals = []
        self.indices = []

    def add_tri(self, a, b, c, na, nb, nc):
        base = len(self.positions) // 3
        for p, nrm in ((a, na), (b, nb), (c, nc)):
            self.positions.extend(p)
            self.normals.extend(nrm)
        self.indices.extend([base, base + 1, base + 2])

    def quad(self, p1, p2, p3, p4, n1, n2, n3, n4):
        self.add_tri(p1, p2, p3, n1, n2, n3)
        self.add_tri(p1, p3, p4, n1, n3, n4)


def extrude(mesh, poly2d, scale, yflip, z_front, z_bevel, z_back):
    """Extrude one 2D polygon (already in world units) into the mesh."""
    poly = [(x * scale, y * yflip * scale) for x, y in poly2d]
    front_pts, tris = triangulate(poly)

    inner = inset(front_pts, BEVEL * scale)
    n_front = len(front_pts)

    # ---- front face (inset polygon, facing +Z)
    for a, b, c in tris:
        mesh.add_tri(
            (inner[a][0], inner[a][1], z_front),
            (inner[b][0], inner[b][1], z_front),
            (inner[c][0], inner[c][1], z_front),
            (0, 0, 1), (0, 0, 1), (0, 0, 1),
        )

    # ---- back face (outer polygon, facing -Z)
    back_z = z_back
    for a, b, c in tris:
        mesh.add_tri(
            (front_pts[a][0], front_pts[a][1], back_z),
            (front_pts[c][0], front_pts[c][1], back_z),
            (front_pts[b][0], front_pts[b][1], back_z),
            (0, 0, -1), (0, 0, -1), (0, 0, -1),
        )

    normals = edge_normals(front_pts)

    # ---- chamfer band: inner ring (z_front) -> outer ring (z_bevel)
    for i in range(n_front):
        j = (i + 1) % n_front
        nxy = normals[i]
        nb = (nxy[0] * 0.72, nxy[1] * 0.72, 0.69)
        nb = normalize(nb)
        mesh.quad(
            (inner[i][0], inner[i][1], z_front),
            (inner[j][0], inner[j][1], z_front),
            (front_pts[j][0], front_pts[j][1], z_bevel),
            (front_pts[i][0], front_pts[i][1], z_bevel),
            nb, nb, nb, nb,
        )

    # ---- side wall: outer ring (z_bevel) -> outer ring (z_back)
    for i in range(n_front):
        j = (i + 1) % n_front
        nxy = normals[i]
        mesh.quad(
            (front_pts[i][0], front_pts[i][1], z_bevel),
            (front_pts[j][0], front_pts[j][1], z_bevel),
            (front_pts[j][0], front_pts[j][1], z_back),
            (front_pts[i][0], front_pts[i][1], z_back),
            (nxy[0], nxy[1], 0), (nxy[0], nxy[1], 0),
            (nxy[0], nxy[1], 0), (nxy[0], nxy[1], 0),
        )


def normalize(v):
    length = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / length for c in v)


def main():
    polys = MARK["polys"]
    min_x = MARK["min_x"]
    max_x = MARK["min_x"] + MARK["width"]
    min_y = MARK["min_y"]
    max_y = MARK["min_y"] + MARK["height"]

    # normalise: centre the mark on the origin and scale to TARGET_WIDTH
    scale = TARGET_WIDTH / MARK["width"]
    yflip = -1.0  # SVG y grows downward; flip so +Y is up in the scene

    mesh = Mesh()
    half = DEPTH / 2.0
    for poly in polys:
        # `centred` already puts the mark's bounding box on the origin
        centred = [[x - min_x, y - min_y] for x, y in poly]
        extrude(
            mesh,
            centred,
            scale,
            yflip,
            z_front=half,
            z_bevel=half - BEVEL_DEPTH,
            z_back=-half,
        )

    tris = len(mesh.indices) // 3
    print("triangles: %d   vertices: %d" % (tris, len(mesh.positions) // 3))

    # centre the finished solid on the origin, using its own bounding box
    xs = mesh.positions[0::3]
    ys = mesh.positions[1::3]
    cx = -(min(xs) + max(xs)) / 2.0
    cy = -(min(ys) + max(ys)) / 2.0
    for i in range(0, len(mesh.positions), 3):
        mesh.positions[i] += cx
        mesh.positions[i + 1] += cy

    js = (
        "/* VALTORIX 3D hero geometry — generated by scripts/build_hero3d.py.\n"
        " * The extruded VALTORIX V mark. Do not edit by hand. */\n"
        "window.VALTORIX_HERO_GEOMETRY = {\n"
        "  positions: new Float32Array(%s),\n"
        "  normals: new Float32Array(%s),\n"
        "  indices: new Uint16Array(%s)\n"
        "};\n"
    ) % (
        json.dumps([round(v, 4) for v in mesh.positions], separators=(",", ":")),
        json.dumps([round(v, 4) for v in mesh.normals], separators=(",", ":")),
        json.dumps(mesh.indices, separators=(",", ":")),
    )

    out = os.path.join(ROOT, "hero3d-geometry.js")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(js)
    print("wrote %s (%.1f KB)" % (out, os.path.getsize(out) / 1024))


if __name__ == "__main__":
    main()
