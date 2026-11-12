"""Unit tests for the brand and 3D generators.

    python scripts/qa-unit.py

These test the *generators*, not the site: the geometry maths has to be
right, or the 3D stage is subtly wrong in a way no screenshot will show.

Written with the standard library only, so `python scripts/qa-unit.py` works
on a clean checkout with nothing installed.
"""
import json
import math
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

import build_stage3d as stage                                   # noqa: E402
import build_brand as brand                                    # noqa: E402


# ===========================================================================
# build_stage3d — the geometry maths
# ===========================================================================
def _triangle_area(pts, tri):
    """The signed area of one triangle, by the shoelace formula."""
    a, b, c = (pts[i] for i in tri)
    return (
        a[0] * b[1] - b[0] * a[1]
        + b[0] * c[1] - c[0] * b[1]
        + c[0] * a[1] - a[0] * c[1]
    ) / 2.0


class TestSignedArea(unittest.TestCase):
    def test_counter_clockwise_is_positive(self):
        square = [(0, 0), (1, 0), (1, 1), (0, 1)]
        self.assertGreater(stage.signed_area(square), 0)

    def test_clockwise_is_negative(self):
        square = [(0, 0), (0, 1), (1, 1), (1, 0)]
        self.assertLess(stage.signed_area(square), 0)

    def test_area_of_a_unit_square(self):
        self.assertAlmostEqual(stage.signed_area([(0, 0), (1, 0), (1, 1), (0, 1)]), 1.0)

    def test_a_degenerate_polygon_has_no_area(self):
        self.assertAlmostEqual(stage.signed_area([(0, 0), (1, 0), (2, 0)]), 0.0)


class TestToCcw(unittest.TestCase):
    def test_clockwise_input_is_reversed(self):
        cw = [(0, 0), (0, 1), (1, 1), (1, 0)]
        self.assertGreater(stage.signed_area(stage.to_ccw(cw)), 0)

    def test_counter_clockwise_input_is_untouched(self):
        ccw = [(0, 0), (1, 0), (1, 1), (0, 1)]
        self.assertEqual(stage.to_ccw(ccw), ccw)

    def test_the_points_are_the_same_set(self):
        cw = [(0, 0), (0, 1), (1, 1), (1, 0)]
        self.assertEqual(sorted(stage.to_ccw(cw)), sorted(cw))


class TestPointInTri(unittest.TestCase):
    def test_a_point_inside_is_inside(self):
        a, b, c = (0, 0), (4, 0), (0, 4)
        self.assertTrue(stage.point_in_tri((1, 1), a, b, c))

    def test_a_point_outside_is_outside(self):
        a, b, c = (0, 0), (4, 0), (0, 4)
        self.assertFalse(stage.point_in_tri((10, 10), a, b, c))

    def test_the_centroid_is_inside(self):
        a, b, c = (1, 2), (5, 2), (3, 8)
        cx = (a[0] + b[0] + c[0]) / 3
        cy = (a[1] + b[1] + c[1]) / 3
        self.assertTrue(stage.point_in_tri((cx, cy), a, b, c))


class TestTriangulate(unittest.TestCase):
    def test_a_square_becomes_two_triangles(self):
        _, tris = stage.triangulate([(0, 0), (1, 0), (1, 1), (0, 1)])
        self.assertEqual(len(tris), 2)

    def test_an_n_gon_becomes_n_minus_two_triangles(self):
        poly = [(0, 0), (2, 0), (3, 1), (3, 3), (1, 3), (0, 2)]
        _, tris = stage.triangulate(poly)
        self.assertEqual(len(tris), len(poly) - 2)

    def test_the_triangles_cover_the_polygon(self):
        poly = [(0, 0), (4, 0), (4, 4), (2, 5), (0, 4)]
        pts, tris = stage.triangulate(poly)
        covered = sum(_triangle_area(pts, t) for t in tris)
        self.assertAlmostEqual(covered, abs(stage.signed_area(poly)), places=6)

    def test_every_index_is_valid(self):
        poly = [(0, 0), (4, 0), (4, 4), (2, 5), (0, 4)]
        pts, tris = stage.triangulate(poly)
        for t in tris:
            for i in t:
                self.assertTrue(0 <= i < len(pts))

    def test_a_concave_polygon_is_tessellated_without_overlap(self):
        # an L shape: concave, so the naive fan would produce a bad triangle
        poly = [(0, 0), (4, 0), (4, 2), (2, 2), (2, 4), (0, 4)]
        pts, tris = stage.triangulate(poly)
        self.assertEqual(len(tris), len(poly) - 2)
        covered = sum(_triangle_area(pts, t) for t in tris)
        self.assertAlmostEqual(covered, abs(stage.signed_area(poly)), places=6)
        # every triangle points the same way - no folded or inverted faces
        self.assertTrue(all(_triangle_area(pts, t) > 0 for t in tris))


class TestInset(unittest.TestCase):
    def test_the_inset_is_smaller(self):
        square = [(0, 0), (10, 0), (10, 10), (0, 10)]
        inner = stage.inset(square, 1.0)
        self.assertLess(abs(stage.signed_area(inner)), abs(stage.signed_area(square)))

    def test_the_inset_keeps_the_shape_square(self):
        square = [(0, 0), (10, 0), (10, 10), (0, 10)]
        inner = stage.inset(square, 1.0)
        xs = [p[0] for p in inner]
        ys = [p[1] for p in inner]
        self.assertAlmostEqual(max(xs) - min(xs), 8.0, places=6)
        self.assertAlmostEqual(max(ys) - min(ys), 8.0, places=6)

    def test_the_inset_moves_each_edge_inwards(self):
        square = [(0, 0), (10, 0), (10, 10), (0, 10)]
        inner = stage.inset(square, 1.0)
        self.assertGreater(min(p[0] for p in inner), 0.0)
        self.assertLess(max(p[0] for p in inner), 10.0)


class TestEdgeNormals(unittest.TestCase):
    def test_the_normals_are_unit_length(self):
        square = [(0, 0), (10, 0), (10, 10), (0, 10)]
        for nx, ny in stage.edge_normals(square):
            self.assertAlmostEqual(math.hypot(nx, ny), 1.0, places=6)

    def test_the_normal_points_outwards(self):
        square = [(0, 0), (10, 0), (10, 10), (0, 10)]
        normals = stage.edge_normals(square)
        # the first edge runs from (0,0) to (10,0), so its normal points down
        self.assertAlmostEqual(normals[0][1], -1.0, places=6)

    def test_a_zero_length_edge_does_not_raise(self):
        # the guard turns a zero length into 1, so this returns a zero normal
        # rather than dividing by zero
        square = [(0, 0), (0, 0), (10, 0), (10, 10)]
        normals = stage.edge_normals(square)
        self.assertEqual(len(normals), 4)
        self.assertEqual(normals[0], (0.0, 0.0))

    def test_the_traced_logo_has_no_zero_length_edges(self):
        # a zero-length edge would give the 3D mark a black facet
        for key in ("mark", "horizontal", "stacked"):
            for poly in stage.BRAND[key]["polys"]:
                for i in range(len(poly)):
                    a = poly[i]
                    b = poly[(i + 1) % len(poly)]
                    self.assertGreater(
                        math.hypot(b[0] - a[0], b[1] - a[1]), 0.0,
                        "%s has a repeated point" % key)


class TestNormalize(unittest.TestCase):
    def test_the_result_is_a_unit_vector(self):
        x, y, z = stage.normalize((3, 4, 12))
        self.assertAlmostEqual(math.sqrt(x * x + y * y + z * z), 1.0, places=6)

    def test_the_direction_is_preserved(self):
        x, y, z = stage.normalize((3, 4, 12))
        self.assertAlmostEqual(x, 3 / 13, places=6)
        self.assertAlmostEqual(y, 4 / 13, places=6)
        self.assertAlmostEqual(z, 12 / 13, places=6)

    def test_a_zero_vector_does_not_raise(self):
        # the guard turns a zero length into 1, so this returns zeros rather
        # than dividing by zero - which is the point of the guard
        x, y, z = stage.normalize((0, 0, 0))
        self.assertEqual((x, y, z), (0.0, 0.0, 0.0))


class TestMesh(unittest.TestCase):
    def test_a_triangle_adds_three_vertices(self):
        m = stage.Mesh()
        m.tri((0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1), (0, 0, 1), (0, 0, 1))
        self.assertEqual(len(m.positions), 9)
        self.assertEqual(len(m.normals), 9)
        self.assertEqual(m.indices, [0, 1, 2])

    def test_a_quad_adds_two_triangles(self):
        m = stage.Mesh()
        m.quad((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1))
        self.assertEqual(len(m.positions), 18)
        self.assertEqual(m.indices, [0, 1, 2, 3, 4, 5])

    def test_the_indices_stay_inside_the_vertex_buffer(self):
        m = stage.Mesh()
        m.quad((0, 0, 0), (1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 0, 1))
        self.assertLess(max(m.indices), len(m.positions) // 3)


class TestAddBox(unittest.TestCase):
    def test_a_box_has_six_faces(self):
        m = stage.Mesh()
        stage.add_box(m, 0, 0, 0, 1, 1, 1)
        self.assertEqual(len(m.indices), 6 * 6)

    def test_a_box_has_the_right_extent(self):
        m = stage.Mesh()
        stage.add_box(m, 0, 0, 0, 2, 3, 4)
        xs = m.positions[0::3]
        ys = m.positions[1::3]
        zs = m.positions[2::3]
        self.assertAlmostEqual(max(xs) - min(xs), 4.0, places=6)
        self.assertAlmostEqual(max(ys) - min(ys), 6.0, places=6)
        self.assertAlmostEqual(max(zs) - min(zs), 8.0, places=6)


class TestExtrudeMark(unittest.TestCase):
    def test_the_extrusion_produces_geometry(self):
        m = stage.Mesh()
        poly = [(0, 0), (10, 0), (10, 10), (0, 10)]
        stage.extrude_mark(m, poly, 1.0, -1.0, 0.135, 0.091, -0.135)
        self.assertGreater(len(m.positions), 0)
        self.assertGreater(len(m.indices), 0)
        self.assertLess(max(m.indices), len(m.positions) // 3)

    def test_the_normals_are_unit_length(self):
        m = stage.Mesh()
        poly = [(0, 0), (10, 0), (10, 10), (0, 10)]
        stage.extrude_mark(m, poly, 1.0, -1.0, 0.135, 0.091, -0.135)
        for nx, ny, nz in zip(m.normals[0::3], m.normals[1::3], m.normals[2::3]):
            self.assertAlmostEqual(math.sqrt(nx * nx + ny * ny + nz * nz), 1.0, places=6)


# ===========================================================================
# build_stage3d — the generated file
# ===========================================================================
class TestGeneratedStage(unittest.TestCase):
    OUT = os.path.join(ROOT, "stage3d-geometry.js")

    def setUp(self):
        if not os.path.exists(self.OUT):
            self.skipTest("stage3d-geometry.js has not been generated")
        with open(self.OUT, encoding="utf-8") as fh:
            self.src = fh.read()
        self.sections = self._parse(self.src)

    @staticmethod
    def _parse(src):
        """Pull the nested `mark: { positions: [...] }` structure out of the file.

        The file is generated, so its shape is known: one object with one
        nested object per section. A brace matcher is used rather than a
        regular expression, because the sections are written both on one
        line and across several.
        """
        sections = {}
        start = src.index("window.VALTORIX_STAGE")
        i = src.index("{", start)
        depth = 0
        for j in range(i, len(src)):
            if src[j] == "{":
                depth += 1
            elif src[j] == "}":
                depth -= 1
                if depth == 0:
                    end = j
                    break
        body = src[i + 1:end]

        pos = 0
        while True:
            m = re.search(r'(\w+):\s*\{', body[pos:])
            if not m:
                break
            name = m.group(1)
            brace = pos + m.end() - 1
            depth = 0
            for k in range(brace, len(body)):
                if body[k] == "{":
                    depth += 1
                elif body[k] == "}":
                    depth -= 1
                    if depth == 0:
                        inner = body[brace + 1:k]
                        pos = k + 1
                        break
            arrays = {}
            for a in re.finditer(r'(\w+): new \w+Array\((\[[^\]]*\])\)', inner):
                arrays[a.group(1)] = json.loads(a.group(2))
            sections[name] = arrays
        return sections

    def test_the_file_is_generated_not_hand_written(self):
        self.assertIn("generated by scripts/build_stage3d.py", self.src)

    def test_it_assigns_the_global(self):
        self.assertIn("window.VALTORIX_STAGE", self.src)

    def test_every_section_is_present(self):
        for name in ("mark", "slabs", "grid", "motes"):
            self.assertIn(name, self.sections, name + " is missing")

    def test_the_mark_positions_are_triples(self):
        self.assertEqual(len(self.sections["mark"]["positions"]) % 3, 0)

    def test_the_mark_normals_match_the_positions(self):
        self.assertEqual(len(self.sections["mark"]["positions"]),
                         len(self.sections["mark"]["normals"]))

    def test_the_mark_indices_are_inside_the_vertex_buffer(self):
        mark = self.sections["mark"]
        self.assertLess(max(mark["indices"]), len(mark["positions"]) // 3)

    def test_the_mark_index_count_is_a_multiple_of_three(self):
        self.assertEqual(len(self.sections["mark"]["indices"]) % 3, 0)

    def test_the_slab_indices_are_inside_the_vertex_buffer(self):
        slabs = self.sections["slabs"]
        self.assertLess(max(slabs["indices"]), len(slabs["positions"]) // 3)

    def test_the_mark_is_centred_on_the_origin(self):
        xs = self.sections["mark"]["positions"][0::3]
        ys = self.sections["mark"]["positions"][1::3]
        cx = (min(xs) + max(xs)) / 2.0
        cy = (min(ys) + max(ys)) / 2.0
        self.assertAlmostEqual(cx, 0.0, places=3)
        self.assertAlmostEqual(cy, 0.0, places=3)

    def test_the_mark_is_the_requested_width(self):
        xs = self.sections["mark"]["positions"][0::3]
        self.assertAlmostEqual(max(xs) - min(xs), stage.TARGET_WIDTH, places=2)

    def test_the_mark_normals_are_unit_length(self):
        n = self.sections["mark"]["normals"]
        for i in range(0, len(n), 3):
            length = math.sqrt(n[i] ** 2 + n[i + 1] ** 2 + n[i + 2] ** 2)
            self.assertAlmostEqual(length, 1.0, places=4)

    def test_the_grid_is_a_set_of_line_pairs(self):
        grid = self.sections["grid"]["positions"]
        self.assertEqual(len(grid) % 6, 0)
        self.assertGreater(len(grid) // 6, 10)

    def test_the_grid_is_flat(self):
        ys = self.sections["grid"]["positions"][1::6]
        self.assertEqual(len(set(ys)), 1, "the floor is not flat")

    def test_the_motes_are_quadruples(self):
        motes = self.sections["motes"]["data"]
        self.assertEqual(len(motes) % 4, 0)
        self.assertEqual(len(motes) // 4, stage.MOTE_COUNT)

    def test_the_motes_are_in_front_of_the_camera(self):
        zs = self.sections["motes"]["data"][2::4]
        self.assertLess(max(zs), 10.0)

    def test_the_file_is_not_too_large(self):
        size = os.path.getsize(self.OUT) / 1024
        self.assertLess(size, 120, "the geometry is %.0f KB" % size)


# ===========================================================================
# build_brand — the SVG and the PNG
# ===========================================================================
class TestPathD(unittest.TestCase):
    def test_the_path_starts_with_a_move(self):
        d = brand.path_d([[(0, 0), (10, 0), (10, 10)]], 0, 0)
        self.assertTrue(d.startswith("M 0 0"))

    def test_the_path_closes_every_polygon(self):
        d = brand.path_d([[(0, 0), (10, 0), (10, 10)]], 0, 0)
        self.assertEqual(d.count("Z"), 1)

    def test_the_origin_is_subtracted(self):
        d = brand.path_d([[(5, 7), (15, 7), (15, 17)]], 5, 7)
        self.assertIn("M 0 0", d)
        self.assertIn("L 10 0", d)

    def test_each_polygon_gets_its_own_move(self):
        d = brand.path_d([[(0, 0), (1, 0)], [(0, 0), (1, 0)]], 0, 0)
        self.assertEqual(d.count("M "), 2)


class TestWriteSvg(unittest.TestCase):
    def test_the_svg_is_well_formed(self):
        brand.OUTDIR = os.path.join(ROOT, "images", "brand")
        name = "_test-output.svg"
        brand.write_svg(name, 100, 50, "M 0 0 L 10 10 Z", brand.INK)
        path = os.path.join(brand.OUTDIR, name)
        try:
            with open(path, encoding="utf-8") as fh:
                svg = fh.read()
            self.assertTrue(svg.startswith("<svg"))
            self.assertTrue(svg.rstrip().endswith("</svg>"))
            self.assertIn('viewBox="0 0 100 50"', svg)
            self.assertIn('fill-rule="evenodd"', svg)
            self.assertIn("VALTORIX INFOTECH", svg)
        finally:
            if os.path.exists(path):
                os.remove(path)


class TestRender(unittest.TestCase):
    def test_the_output_has_the_requested_size(self):
        img = brand.render([[(0, 0), (10, 0), (10, 10), (0, 10)]], 64, 64,
                           (0, 0, 10, 10), brand.INK)
        self.assertEqual(img.size, (64, 64))

    def test_the_output_is_not_blank(self):
        img = brand.render([[(0, 0), (10, 0), (10, 10), (0, 10)]], 64, 64,
                           (0, 0, 10, 10), brand.INK)
        self.assertGreater(sum(1 for px in img.getdata() if px[3] > 0), 100)

    def test_the_colour_is_the_one_asked_for(self):
        img = brand.render([[(0, 0), (10, 0), (10, 10), (0, 10)]], 32, 32,
                           (0, 0, 10, 10), brand.INK)
        colours = {px[:3] for px in img.getdata() if px[3] > 200}
        self.assertEqual(colours, {(10, 10, 10)})

    def test_a_knockout_is_hole(self):
        # two nested squares: the inner one is a counter and must come out empty
        outer = [(0, 0), (10, 0), (10, 10), (0, 10)]
        inner = [(3, 3), (7, 3), (7, 7), (3, 7)]
        img = brand.render([outer, inner], 100, 100, (0, 0, 10, 10), brand.INK)
        centre = img.getpixel((50, 50))
        corner = img.getpixel((2, 2))
        self.assertEqual(centre[3], 0, "the counter should be transparent")
        self.assertGreater(corner[3], 200, "the shell should be filled")


class TestBrandData(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(HERE, "brand-data.json"), encoding="utf-8") as fh:
            self.data = json.load(fh)

    def test_the_three_artworks_are_present(self):
        for key in ("mark", "horizontal", "stacked"):
            self.assertIn(key, self.data)

    def test_every_polygon_has_at_least_three_points(self):
        for key in ("mark", "horizontal", "stacked"):
            for poly in self.data[key]["polys"]:
                self.assertGreaterEqual(len(poly), 3, key)

    def test_every_point_is_a_pair_of_numbers(self):
        for key in ("mark", "horizontal", "stacked"):
            for poly in self.data[key]["polys"]:
                for point in poly:
                    self.assertEqual(len(point), 2)
                    self.assertIsInstance(point[0], (int, float))
                    self.assertIsInstance(point[1], (int, float))

    def test_the_bounding_box_matches_the_polygons(self):
        for key in ("mark", "horizontal", "stacked"):
            art = self.data[key]
            xs = [p[0] for poly in art["polys"] for p in poly]
            ys = [p[1] for poly in art["polys"] for p in poly]
            self.assertAlmostEqual(art["min_x"], min(xs), delta=1)
            self.assertAlmostEqual(art["min_y"], min(ys), delta=1)
            self.assertAlmostEqual(art["width"], max(xs) - min(xs), delta=1)
            self.assertAlmostEqual(art["height"], max(ys) - min(ys), delta=1)


class TestBrandOutputs(unittest.TestCase):
    """The files the generator produced have to be usable as-is."""

    def _path(self, name):
        return os.path.join(ROOT, "images", "brand", name)

    def test_the_svgs_parse(self):
        from xml.etree import ElementTree
        for name in ("valtorix-mark.svg", "valtorix-logo.svg",
                     "valtorix-logo-stacked.svg", "favicon.svg"):
            path = self._path(name)
            if not os.path.exists(path):
                self.skipTest("%s has not been generated" % name)
            root = ElementTree.parse(path).getroot()
            self.assertTrue(root.tag.endswith("svg"))
            self.assertTrue(root.findall("{http://www.w3.org/2000/svg}path"))

    def test_the_png_icons_have_the_right_size(self):
        from PIL import Image
        expected = {
            "favicon-16.png": (16, 16),
            "favicon-32.png": (32, 32),
            "favicon-64.png": (64, 64),
            "apple-touch-icon.png": (180, 180),
            "icon-192.png": (192, 192),
            "icon-512.png": (512, 512),
            "og-image.png": (1200, 630),
        }
        for name, size in expected.items():
            path = self._path(name)
            if not os.path.exists(path):
                self.skipTest("%s has not been generated" % name)
            with Image.open(path) as img:
                self.assertEqual(img.size, size, name)

    def test_the_icons_are_not_blank(self):
        from PIL import Image
        path = self._path("icon-512.png")
        if not os.path.exists(path):
            self.skipTest("icon-512.png has not been generated")
        with Image.open(path) as img:
            alpha = img.convert("RGBA").split()[3]
            self.assertGreater(alpha.getextrema()[1], 200)

    def test_the_root_favicon_exists(self):
        self.assertTrue(os.path.exists(os.path.join(ROOT, "favicon.ico")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
