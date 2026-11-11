/* ==========================================================================
   VALTORIX INFOTECH — the 3D stage
   --------------------------------------------------------------------------
   One persistent WebGL scene for the whole site. The page scrolls normally;
   the canvas is fixed behind it, and scroll position drives the camera and
   the objects through a set of authored chapters.

   Architecture (from the 2026 immersive-3D practice research):
     - ONE renderer, ONE owned animation loop, ONE canvas per page.
     - Scroll is a single normalised value read inside the frame loop, never
       a per-event handler and never a state update per scroll tick.
     - WebGL provides atmosphere; all copy stays real, semantic HTML.
     - The canvas is fixed, so there is no scroll-drift between the DOM and
       the scene.
     - Bounded geometry, capped DPR, step-down-only quality, pause when the
       tab is hidden.
     - prefers-reduced-motion and missing WebGL both keep the static page.

   Two compositions share the renderer:
     stage  a full-viewport world behind the page (the homepage)
     hero   a small canvas holding just the mark (inner pages)
   ========================================================================== */
(function () {
  "use strict";

  var DEG = Math.PI / 180;
  var FOV = 34;

  /* ---------------------------------------------------------------- shaders */
  var MESH_VERT = [
    "attribute vec3 aPosition;",
    "attribute vec3 aNormal;",
    "uniform mat4 uProjection;",
    "uniform mat4 uView;",
    "uniform mat4 uModel;",
    "uniform mat3 uNormalMatrix;",
    "varying vec3 vNormal;",
    "varying vec3 vWorld;",
    "varying float vDepth;",
    "void main(){",
    "  vec4 world = uModel * vec4(aPosition, 1.0);",
    "  vWorld = world.xyz;",
    "  vNormal = uNormalMatrix * aNormal;",
    "  vec4 view = uView * world;",
    "  vDepth = -view.z;",
    "  gl_Position = uProjection * view;",
    "}"
  ].join("\n");

  var MESH_FRAG = [
    "precision mediump float;",
    "uniform vec3 uBase;",
    "uniform vec3 uKey;",
    "uniform vec3 uKeyDir;",
    "uniform vec3 uFillDir;",
    "uniform vec3 uSky;",
    "uniform vec3 uGround;",
    "uniform vec3 uRim;",
    "uniform vec3 uCamera;",
    "uniform vec3 uFog;",
    "uniform float uFogNear;",
    "uniform float uFogFar;",
    "uniform float uOpacity;",
    "varying vec3 vNormal;",
    "varying vec3 vWorld;",
    "varying float vDepth;",
    "void main(){",
    "  vec3 n = normalize(vNormal);",
    "  vec3 v = normalize(uCamera - vWorld);",
    "  vec3 l = normalize(uKeyDir);",
    "  float diff = max(dot(n, l), 0.0);",
    "  float fill = max(dot(n, normalize(uFillDir)), 0.0);",
    "  float hemi = n.y * 0.5 + 0.5;",
    "  vec3 ambient = mix(uGround, uSky, hemi);",
    "  vec3 h = normalize(l + v);",
    "  float spec = pow(max(dot(n, h), 0.0), 34.0);",
    "  float sheen = pow(max(dot(n, h), 0.0), 6.0) * 0.16;",
    "  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.9);",
    "  float lightAmt = 0.20 + 0.78 * diff + 0.26 * fill;",
    "  vec3 col = uBase * (ambient + lightAmt) * 1.55;",
    "  col += uKey * (spec * 0.88 + sheen);",
    "  col += uRim * rim * 0.70;",
    "  float fog = smoothstep(uFogNear, uFogFar, vDepth);",
    "  col = mix(col, uFog, fog);",
    "  gl_FragColor = vec4(col, uOpacity);",
    "}"
  ].join("\n");

  var LINE_VERT = [
    "attribute vec3 aPosition;",
    "uniform mat4 uProjection;",
    "uniform mat4 uView;",
    "varying float vDepth;",
    "void main(){",
    "  vec4 view = uView * vec4(aPosition, 1.0);",
    "  vDepth = -view.z;",
    "  gl_Position = uProjection * view;",
    "}"
  ].join("\n");

  var LINE_FRAG = [
    "precision mediump float;",
    "uniform vec3 uColor;",
    "uniform vec3 uFog;",
    "uniform float uFogNear;",
    "uniform float uFogFar;",
    "uniform float uOpacity;",
    "varying float vDepth;",
    "void main(){",
    "  float fog = smoothstep(uFogNear, uFogFar, vDepth);",
    "  vec3 col = mix(uColor, uFog, fog);",
    "  float a = uOpacity * (1.0 - fog * 0.85);",
    "  gl_FragColor = vec4(col, a);",
    "}"
  ].join("\n");

  var POINT_VERT = [
    "attribute vec3 aPosition;",
    "attribute float aSize;",
    "uniform mat4 uProjection;",
    "uniform mat4 uView;",
    "uniform float uPixelRatio;",
    "varying float vDepth;",
    "void main(){",
    "  vec4 view = uView * vec4(aPosition, 1.0);",
    "  vDepth = -view.z;",
    "  gl_Position = uProjection * view;",
    "  gl_PointSize = aSize * uPixelRatio * (34.0 / max(1.0, -view.z));",
    "}"
  ].join("\n");

  var POINT_FRAG = [
    "precision mediump float;",
    "uniform vec3 uColor;",
    "uniform float uOpacity;",
    "varying float vDepth;",
    "void main(){",
    "  vec2 d = gl_PointCoord - vec2(0.5);",
    "  float r = dot(d, d);",
    "  if (r > 0.25) discard;",
    "  float a = uOpacity * (1.0 - smoothstep(0.0, 0.25, r)) * smoothstep(60.0, 8.0, vDepth);",
    "  gl_FragColor = vec4(uColor, a);",
    "}"
  ].join("\n");

  /* ------------------------------------------------------------------ maths */
  function mat4() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function perspective(out, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    var nf = 1 / (near - far);
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = 2 * far * near * nf; out[15] = 0;
    return out;
  }
  function lookAt(out, eye, center, up) {
    var zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    var len = Math.hypot(zx, zy, zz) || 1;
    zx /= len; zy /= len; zz /= len;
    var xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    out[0] = xx; out[1] = yx; out[2] = zx; out[3] = 0;
    out[4] = xy; out[5] = yy; out[6] = zy; out[7] = 0;
    out[8] = xz; out[9] = yz; out[10] = zz; out[11] = 0;
    out[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    out[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    out[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    out[15] = 1;
    return out;
  }
  function multiply(out, a, b) {
    for (var i = 0; i < 4; i++) {
      for (var j = 0; j < 4; j++) {
        out[i * 4 + j] =
          a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] +
          a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
      }
    }
    return out;
  }
  function translation(out, x, y, z) {
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = x; out[13] = y; out[14] = z; out[15] = 1;
    return out;
  }
  function rotationX(out, a) {
    var s = Math.sin(a), c = Math.cos(a);
    out[0] = 1; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = c; out[6] = -s; out[7] = 0;
    out[8] = 0; out[9] = s; out[10] = c; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }
  function rotationY(out, a) {
    var s = Math.sin(a), c = Math.cos(a);
    out[0] = c; out[1] = 0; out[2] = s; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = -s; out[9] = 0; out[10] = c; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }
  function rotationZ(out, a) {
    var s = Math.sin(a), c = Math.cos(a);
    out[0] = c; out[1] = -s; out[2] = 0; out[3] = 0;
    out[4] = s; out[5] = c; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }
  function scaleMat(out, s) {
    out[0] = s; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = s; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = s; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }
  function normalMatrix(out9, m) {
    out9[0] = m[0]; out9[1] = m[1]; out9[2] = m[2];
    out9[3] = m[4]; out9[4] = m[5]; out9[5] = m[6];
    out9[6] = m[8]; out9[7] = m[9]; out9[8] = m[10];
    var sx = Math.hypot(out9[0], out9[1], out9[2]) || 1;
    var sy = Math.hypot(out9[3], out9[4], out9[5]) || 1;
    var sz = Math.hypot(out9[6], out9[7], out9[8]) || 1;
    for (var i = 0; i < 3; i++) {
      out9[i] /= sx; out9[3 + i] /= sy; out9[6 + i] /= sz;
    }
    return out9;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smoothstep(t) { return t * t * (3 - 2 * t); }
  function mix(a, b, t) { return a + (b - a) * t; }

  /* ------------------------------------------------------------- chapters */
  /* The story of the page. Each chapter is a "gate": a deliberate state the
     world moves into while one section of copy is being read.
       mark.sx / sy  screen position of the mark, -1..1 of the viewport
       mark.size      height of the mark as a fraction of the viewport
       mark.depth     distance in front of the camera
       camZ           how far the camera has travelled into the world
       fog            1 = clear, higher = hazier
  */
  /* The camera only ever travels FORWARD through the world — one continuous
     place, never a rewind. The chapters get deeper and the fog thickens. */
  var CHAPTERS = {
    hero: {
      mark: { sx: 0.08, sy: 0.02, size: 0.30, depth: 5.6, rx: 0.0, ry: 0.0, rz: 0.0 },
      camZ: 0, fog: 1.0, slabs: 0.5, motes: 1.0, grid: 1.0,
      /* narrow screens: the object sits low, small and cropped, as atmosphere */
      m: { sx: 0.0, sy: -0.46, size: 0 }
    },
    capabilities: {
      mark: { sx: -0.56, sy: -0.04, size: 0.20, depth: 4.4, rx: 0.22, ry: 0.62, rz: 0.05 },
      camZ: -9, fog: 1.4, slabs: 1.0, motes: 0.9, grid: 1.0,
      m: { sx: 0.0, sy: -0.52, size: 0 }
    },
    work: {
      mark: { sx: 0.0, sy: 0.28, size: 0.12, depth: 4.0, rx: -0.05, ry: 1.30, rz: 0.0 },
      camZ: -20, fog: 2.1, slabs: 0.5, motes: 0.7, grid: 1.0,
      m: { sx: 0.0, sy: -0.54, size: 0 }
    },
    numbers: {
      mark: { sx: 0.0, sy: 0.44, size: 0.085, depth: 4.0, rx: 0.34, ry: 2.00, rz: 0.0 },
      camZ: -32, fog: 2.9, slabs: 0.3, motes: 0.55, grid: 1.3,
      m: { sx: 0.0, sy: -0.56, size: 0 }
    },
    process: {
      mark: { sx: 0.30, sy: -0.06, size: 0.17, depth: 4.6, rx: -0.14, ry: 2.50, rz: 0.12 },
      camZ: -44, fog: 1.5, slabs: 0.9, motes: 0.95, grid: 1.0,
      m: { sx: 0.0, sy: -0.52, size: 0 }
    },
    cta: {
      mark: { sx: 0.0, sy: 0.0, size: 0.40, depth: 5.0, rx: 0.0, ry: 3.05, rz: 0.0 },
      camZ: -54, fog: 1.0, slabs: 0.25, motes: 1.0, grid: 1.0,
      m: { sx: 0.0, sy: -0.44, size: 0 }
    }
  };

  var NARROW = 900;

  var CHAPTER_ORDER = ["hero", "capabilities", "work", "numbers", "process", "cta"];

  /* --------------------------------------------------------------- helpers */
  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("stage3d shader:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    var a = compile(gl, gl.VERTEX_SHADER, vs);
    var b = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!a || !b) return null;
    gl.attachShader(p, a);
    gl.attachShader(p, b);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.warn("stage3d link:", gl.getProgramInfoLog(p));
      return null;
    }
    return p;
  }
  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  function isTouch() {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  }

  /* =========================================================== the stage */
  function mountStage(canvas, options) {
    options = options || {};
    var H = window.ValtorixStage;
    function refuse(reason) { if (H) H.lastRefusal = reason; return null; }

    if (!canvas || !window.VALTORIX_STAGE) return refuse("no-canvas-or-geometry");
    if (prefersReducedMotion()) return refuse("reduced-motion");

    var gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: "default",
      failIfMajorPerformanceCaveat: true
    });
    if (!gl) return refuse("no-webgl");

    var geo = window.VALTORIX_STAGE;
    var meshProg = program(gl, MESH_VERT, MESH_FRAG);
    var lineProg = program(gl, LINE_VERT, LINE_FRAG);
    var pointProg = program(gl, POINT_VERT, POINT_FRAG);
    if (!meshProg || !lineProg || !pointProg) return refuse("shader");

    function buf(data) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }

    /* --- mark --- */
    var markPos = buf(geo.mark.positions);
    var markNrm = buf(geo.mark.normals);
    var markIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, markIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.mark.indices, gl.STATIC_DRAW);
    var markCount = geo.mark.indices.length;

    /* --- slabs --- */
    var slabPos = buf(geo.slabs.positions);
    var slabNrm = buf(geo.slabs.normals);
    var slabIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, slabIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.slabs.indices, gl.STATIC_DRAW);
    var slabCount = geo.slabs.indices.length;

    /* --- grid --- */
    var gridPos = buf(geo.grid.positions);

    /* --- motes --- */
    var moteBuf = buf(geo.motes.data);
    var moteStride = 4 * 4;

    /* --- uniforms --- */
    function U(prog, names) {
      var o = {};
      for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(prog, names[i]);
      return o;
    }
    var mu = U(meshProg, ["uProjection", "uView", "uModel", "uNormalMatrix", "uBase", "uKey",
      "uKeyDir", "uFillDir", "uSky", "uGround", "uRim", "uCamera", "uFog", "uFogNear",
      "uFogFar", "uOpacity"]);
    var lu = U(lineProg, ["uProjection", "uView", "uColor", "uFog", "uFogNear", "uFogFar", "uOpacity"]);
    var pu = U(pointProg, ["uProjection", "uView", "uColor", "uOpacity", "uPixelRatio"]);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    /* ------------------------------------------------------------ sizing */
    var maxDpr = options.maxDpr || (isTouch() ? 1.5 : 2);
    var dpr = maxDpr;
    var cssW = 1, cssH = 1;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, Math.round(rect.width));
      cssH = Math.max(1, Math.round(rect.height));
      var w = Math.max(1, Math.round(cssW * dpr));
      var h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);

    /* ------------------------------------------------------- scroll state */
    var sections = [];
    var anchors = [];
    function measureSections() {
      sections = [];
      anchors = [];
      var nodes = document.querySelectorAll("[data-stage]");
      var docEl = document.scrollingElement || document.documentElement;
      var maxScroll = Math.max(1, docEl.scrollHeight - window.innerHeight);
      for (var i = 0; i < nodes.length; i++) {
        var key = nodes[i].getAttribute("data-stage");
        if (!CHAPTERS[key]) continue;
        var top = nodes[i].getBoundingClientRect().top + docEl.scrollTop;
        var h = nodes[i].offsetHeight;
        sections.push({ key: key, node: nodes[i] });
        anchors.push(clamp((top + h * 0.35 - window.innerHeight * 0.45) / maxScroll, 0, 1));
      }
      if (!anchors.length) {
        sections = [{ key: "hero", node: document.body }];
        anchors = [0];
      }
      // guarantee a strictly increasing sequence
      for (var j = 1; j < anchors.length; j++) {
        if (anchors[j] <= anchors[j - 1]) anchors[j] = Math.min(1, anchors[j - 1] + 0.001);
      }
      anchors[anchors.length - 1] = Math.max(anchors[anchors.length - 1], 0.999);
    }

    var progress = 0;
    function readScroll() {
      var docEl = document.scrollingElement || document.documentElement;
      var maxScroll = Math.max(1, docEl.scrollHeight - window.innerHeight);
      progress = clamp(docEl.scrollTop / maxScroll, 0, 1);
    }

    /* interpolate the chapter states at the current scroll progress */
    var state = {};
    function narrow(ch) {
      if (!ch.m) return ch;
      return {
        mark: Object.assign({}, ch.mark, ch.m),
        camZ: ch.camZ, fog: ch.fog, slabs: ch.slabs, motes: ch.motes, grid: ch.grid
      };
    }
    function blend(a, b, t) {
      if (window.innerWidth < NARROW) { a = narrow(a); b = narrow(b); }
      var out = { mark: {} };
      var keys = ["camZ", "fog", "slabs", "motes", "grid"];
      for (var i = 0; i < keys.length; i++) out[keys[i]] = mix(a[keys[i]], b[keys[i]], t);
      var mk = ["sx", "sy", "size", "depth", "rx", "ry", "rz"];
      for (var j = 0; j < mk.length; j++) out.mark[mk[j]] = mix(a.mark[mk[j]], b.mark[mk[j]], t);
      return out;
    }
    function currentState() {
      if (anchors.length === 1) return CHAPTERS[anchors.length ? sections[0].key : "hero"];
      var i = 0;
      while (i < anchors.length - 1 && progress > anchors[i + 1]) i++;
      var a = CHAPTERS[sections[i].key];
      var b = CHAPTERS[sections[Math.min(i + 1, sections.length - 1)].key];
      if (!b) return a;
      var span = Math.max(0.0001, anchors[i + 1] - anchors[i]);
      var t = smoothstep(clamp((progress - anchors[i]) / span, 0, 1));
      return blend(a, b, t);
    }

    /* -------------------------------------------------------- the loop */
    var proj = mat4(), view = mat4(), model = mat4();
    var t1 = mat4(), t2 = mat4(), t3 = mat4(), t4 = mat4();
    var nrm = new Float32Array(9);
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var start = 0;
    var running = false;
    var visible = true;
    var frameAcc = 0, frameCount = 0;

    function onPointer(e) {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }
    window.addEventListener("pointermove", onPointer, { passive: true });

    function drawMesh(prog, uniforms, positions, normals, indices, count, modelMat, cam, opacity) {
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, positions);
      var ap = gl.getAttribLocation(prog, "aPosition");
      gl.enableVertexAttribArray(ap);
      gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
      if (normals) {
        gl.bindBuffer(gl.ARRAY_BUFFER, normals);
        var an = gl.getAttribLocation(prog, "aNormal");
        gl.enableVertexAttribArray(an);
        gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 0, 0);
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
      normalMatrix(nrm, modelMat);
      gl.uniformMatrix4fv(uniforms.uProjection, false, proj);
      gl.uniformMatrix4fv(uniforms.uView, false, view);
      gl.uniformMatrix4fv(uniforms.uModel, false, modelMat);
      if (uniforms.uNormalMatrix) gl.uniformMatrix3fv(uniforms.uNormalMatrix, false, nrm);
      gl.uniform3f(uniforms.uCamera, cam[0], cam[1], cam[2]);
      gl.uniform1f(uniforms.uOpacity, opacity);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
    }

    function frame(now) {
      if (!running) return;
      if (!start) start = now;
      var time = (now - start) / 1000;

      readScroll();
      var st = currentState();

      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var aspect = cssW / cssH;
      var camZ = st.camZ;
      var cam = [pointer.x * 0.35, 0.35 + pointer.y * 0.18, camZ];
      perspective(proj, FOV * DEG, aspect, 0.1, 120);
      lookAt(view, cam, [cam[0], cam[1], cam[2] - 1], [0, 1, 0]);

      var fogNear = 4.0;
      var fogFar = 26 + st.fog * 16;
      var fogColor = [0.965, 0.969, 0.980];

      /* ---- the mark ---- */
      if (st.mark.size > 0.002) {
      var depth = st.mark.depth;
      var visH = 2 * depth * Math.tan((FOV * DEG) / 2);
      var visW = visH * aspect;
      var worldScale = (st.mark.size * visH) / 1.4212;
      var wx = st.mark.sx * visW * 0.5;
      var wy = st.mark.sy * visH * 0.5;
      var rock = Math.sin(time * 0.5) * 0.30;
      var tiltX = st.mark.rx + (-pointer.y * 6 * DEG);
      var tiltZ = st.mark.rz + (-pointer.x * 6 * DEG);

      rotationY(t1, st.mark.ry + rock);
      rotationX(t2, tiltX);
      multiply(t3, t1, t2);
      rotationZ(t1, tiltZ);
      multiply(t4, t3, t1);
      translation(t2, wx, wy, camZ - depth);
      multiply(t3, t4, t2);
      scaleMat(t4, worldScale);
      multiply(model, t3, t4);

      gl.useProgram(meshProg);
      gl.uniform3f(mu.uBase, 0.072, 0.075, 0.090);
      gl.uniform3f(mu.uKey, 1.0, 0.99, 0.97);
      gl.uniform3f(mu.uKeyDir, -0.45, 0.72, 0.52);
      gl.uniform3f(mu.uFillDir, 0.65, -0.25, 0.4);
      gl.uniform3f(mu.uSky, 0.62, 0.66, 0.74);
      gl.uniform3f(mu.uGround, 0.12, 0.12, 0.14);
      gl.uniform3f(mu.uRim, 0.102, 0.373, 0.816);
      gl.uniform3f(mu.uFog, fogColor[0], fogColor[1], fogColor[2]);
      gl.uniform1f(mu.uFogNear, fogNear);
      gl.uniform1f(mu.uFogFar, fogFar);
      drawMesh(meshProg, mu, markPos, markNrm, markIdx, markCount, model, cam, 1);
      }

      /* ---- the slabs: a constellation the camera flies past ---- */
      if (st.slabs > 0.02) {
        rotationY(t1, time * 0.06);
        translation(t2, 0, 0, 0);
        multiply(t3, t1, t2);
        scaleMat(t4, 1);
        multiply(model, t3, t4);
        gl.useProgram(meshProg);
        gl.uniform3f(mu.uBase, 0.52, 0.58, 0.70);
        gl.uniform3f(mu.uRim, 0.122, 0.435, 0.921);
        gl.uniform1f(mu.uOpacity, 0.26 * st.slabs);
        drawMesh(meshProg, mu, slabPos, slabNrm, slabIdx, slabCount, model, cam, 0.26 * st.slabs);
      }

      /* ---- the blueprint floor ---- */
      if (st.grid > 0.02) {
        gl.useProgram(lineProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, gridPos);
        var gp = gl.getAttribLocation(lineProg, "aPosition");
        gl.enableVertexAttribArray(gp);
        gl.vertexAttribPointer(gp, 3, gl.FLOAT, false, 0, 0);
        gl.uniformMatrix4fv(lu.uProjection, false, proj);
        gl.uniformMatrix4fv(lu.uView, false, view);
        gl.uniform3f(lu.uColor, 0.55, 0.60, 0.68);
        gl.uniform3f(lu.uFog, fogColor[0], fogColor[1], fogColor[2]);
        gl.uniform1f(lu.uFogNear, fogNear);
        gl.uniform1f(lu.uFogFar, fogFar);
        gl.uniform1f(lu.uOpacity, 0.16 * st.grid);
        gl.drawArrays(gl.LINES, 0, geo.grid.positions.length / 3);
      }

      /* ---- motes ---- */
      if (st.motes > 0.02) {
        gl.useProgram(pointProg);
        gl.bindBuffer(gl.ARRAY_BUFFER, moteBuf);
        var mp = gl.getAttribLocation(pointProg, "aPosition");
        var ms = gl.getAttribLocation(pointProg, "aSize");
        gl.enableVertexAttribArray(mp);
        gl.vertexAttribPointer(mp, 3, gl.FLOAT, false, moteStride, 0);
        gl.enableVertexAttribArray(ms);
        gl.vertexAttribPointer(ms, 1, gl.FLOAT, false, moteStride, 12);
        gl.uniformMatrix4fv(pu.uProjection, false, proj);
        gl.uniformMatrix4fv(pu.uView, false, view);
        gl.uniform3f(pu.uColor, 0.20, 0.30, 0.48);
        gl.uniform1f(pu.uOpacity, 0.55 * st.motes);
        gl.uniform1f(pu.uPixelRatio, dpr);
        gl.drawArrays(gl.POINTS, 0, geo.motes.data.length / 4);
      }

      canvas.__stage = {
        sx: st.mark.sx, sy: st.mark.sy, size: st.mark.size,
        camZ: st.camZ, progress: progress,
        chapter: sections.length ? sections[0].key : "hero"
      };

      /* ---- adaptive quality: step down only ---- */
      frameAcc += now - (frame.last || now);
      frame.last = now;
      frameCount++;
      if (frameCount >= 60) {
        if (frameAcc / frameCount > 24 && dpr > 0.75) {
          dpr = Math.max(0.75, dpr - 0.5);
          resize();
        }
        frameAcc = 0; frameCount = 0;
      }

      requestAnimationFrame(frame);
    }

    /* --------------------------------------------------------- lifecycle */
    function startLoop() { if (!running) { running = true; requestAnimationFrame(frame); } }
    function stopLoop() { running = false; }

    function onVisibility() {
      if (document.hidden) stopLoop();
      else startLoop();
    }
    document.addEventListener("visibilitychange", onVisibility);

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { measureSections(); resize(); }, 150);
    });

    measureSections();
    readScroll();

    /* reveal the stage once the first frame is on screen */
    canvas.style.opacity = "0";
    requestAnimationFrame(function () {
      canvas.style.transition = "opacity 800ms ease";
      canvas.style.opacity = "1";
      if (canvas.parentElement) canvas.parentElement.classList.add("is-3d");
    });

    startLoop();
    if (H) H.instances++;

    return {
      destroy: function () {
        stopLoop();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pointermove", onPointer);
      }
    };
  }

  /* ============================================================== the hero */
  function mountHero(canvas, options) {
    options = options || {};
    var H = window.ValtorixStage;
    function refuse(reason) { if (H) H.lastRefusal = reason; return null; }

    if (!canvas || !window.VALTORIX_STAGE) return refuse("no-canvas-or-geometry");
    if (prefersReducedMotion()) return refuse("reduced-motion");

    var gl = canvas.getContext("webgl", {
      alpha: true, antialias: true, premultipliedAlpha: false,
      powerPreference: "default", failIfMajorPerformanceCaveat: true
    });
    if (!gl) return refuse("no-webgl");

    var geo = window.VALTORIX_STAGE;
    var prog = program(gl, MESH_VERT, MESH_FRAG);
    if (!prog) return refuse("shader");

    function buf(data) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }
    var markPos = buf(geo.mark.positions);
    var markNrm = buf(geo.mark.normals);
    var markIdx = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, markIdx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.mark.indices, gl.STATIC_DRAW);

    function U(prog, names) {
      var o = {};
      for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(prog, names[i]);
      return o;
    }
    var mu = U(prog, ["uProjection", "uView", "uModel", "uNormalMatrix", "uBase", "uKey",
      "uKeyDir", "uFillDir", "uSky", "uGround", "uRim", "uCamera", "uFog", "uFogNear",
      "uFogFar", "uOpacity"]);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    var maxDpr = options.maxDpr || (isTouch() ? 1.5 : 2);
    var dpr = maxDpr;
    var cssW = 1, cssH = 1;

    function resize() {
      var rect = canvas.getBoundingClientRect();
      cssW = Math.max(1, Math.round(rect.width));
      cssH = Math.max(1, Math.round(rect.height));
      var w = Math.max(1, Math.round(cssW * dpr));
      var h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
    else window.addEventListener("resize", resize);

    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    window.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    }, { passive: true });

    var proj = mat4(), view = mat4(), model = mat4();
    var t1 = mat4(), t2 = mat4(), t3 = mat4(), t4 = mat4();
    var nrm = new Float32Array(9);
    var start = 0, running = false, visible = true;
    var frameAcc = 0, frameCount = 0;
    var scrollEl = document.scrollingElement || document.documentElement;
    var scrollProgress = 0;

    function frame(now) {
      if (!running) return;
      if (!start) start = now;
      var t = (now - start) / 1000;

      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;

      var heroEl = canvas.closest ? canvas.closest(".hero, .page-hero") : null;
      var heroH = heroEl ? heroEl.offsetHeight : window.innerHeight;
      scrollProgress = clamp(scrollEl.scrollTop / Math.max(1, heroH), 0, 1);

      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var aspect = cssW / cssH;
      var depth = options.distance || 3.9;
      var visH = 2 * depth * Math.tan((FOV * DEG) / 2);
      var visW = visH * aspect;
      var sc = (1 - 0.15 * scrollProgress) * ((options.size || 0.72) * visH) / 1.4212;
      var opacity = 1 - 0.6 * scrollProgress;
      var rock = Math.sin(t * 0.5) * 0.30;
      var bob = Math.sin(t * 0.72) * 0.022;
      var tiltX = -pointer.y * 8 * DEG;
      var tiltZ = -pointer.x * 8 * DEG;

      var cam = [0, 0, depth];
      perspective(proj, FOV * DEG, aspect, 0.1, 60);
      lookAt(view, cam, [0, 0, 0], [0, 1, 0]);

      rotationY(t1, rock);
      rotationX(t2, tiltX);
      multiply(t3, t1, t2);
      rotationZ(t1, tiltZ);
      multiply(t4, t3, t1);
      translation(t2, 0, bob, 0);
      multiply(t3, t4, t2);
      scaleMat(t4, sc);
      multiply(model, t3, t4);

      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, markPos);
      var ap = gl.getAttribLocation(prog, "aPosition");
      gl.enableVertexAttribArray(ap);
      gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, markNrm);
      var an = gl.getAttribLocation(prog, "aNormal");
      gl.enableVertexAttribArray(an);
      gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, markIdx);
      normalMatrix(nrm, model);
      gl.uniformMatrix4fv(mu.uProjection, false, proj);
      gl.uniformMatrix4fv(mu.uView, false, view);
      gl.uniformMatrix4fv(mu.uModel, false, model);
      gl.uniformMatrix3fv(mu.uNormalMatrix, false, nrm);
      gl.uniform3f(mu.uBase, 0.072, 0.075, 0.090);
      gl.uniform3f(mu.uKey, 1.0, 0.99, 0.97);
      gl.uniform3f(mu.uKeyDir, -0.45, 0.72, 0.52);
      gl.uniform3f(mu.uFillDir, 0.65, -0.25, 0.4);
      gl.uniform3f(mu.uSky, 0.62, 0.66, 0.74);
      gl.uniform3f(mu.uGround, 0.12, 0.12, 0.14);
      gl.uniform3f(mu.uRim, 0.122, 0.435, 0.921);
      gl.uniform3f(mu.uCamera, cam[0], cam[1], cam[2]);
      gl.uniform3f(mu.uFog, 0.965, 0.969, 0.980);
      gl.uniform1f(mu.uFogNear, 40);
      gl.uniform1f(mu.uFogFar, 120);
      gl.uniform1f(mu.uOpacity, opacity);
      gl.drawElements(gl.TRIANGLES, geo.mark.indices.length, gl.UNSIGNED_SHORT, 0);

      canvas.__heroOpacity = opacity;
      canvas.__stage = { sx: 0, sy: 0, size: 0.72, camZ: 0, progress: 0 };

      frameAcc += now - (frame.last || now);
      frame.last = now;
      frameCount++;
      if (frameCount >= 60) {
        if (frameAcc / frameCount > 24 && dpr > 0.75) { dpr = Math.max(0.75, dpr - 0.5); resize(); }
        frameAcc = 0; frameCount = 0;
      }
      requestAnimationFrame(frame);
    }

    function startLoop() { if (!running) { running = true; requestAnimationFrame(frame); } }
    function stopLoop() { running = false; }
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (e) {
        visible = e[0].isIntersecting;
        if (visible) startLoop(); else stopLoop();
      }, { threshold: 0.01 }).observe(canvas);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stopLoop(); else startLoop();
    });

    canvas.style.opacity = "0";
    requestAnimationFrame(function () {
      canvas.style.transition = "opacity 700ms ease";
      canvas.style.opacity = "1";
      if (canvas.parentElement) canvas.parentElement.classList.add("is-3d");
    });

    startLoop();
    if (H) H.instances++;
    return { destroy: stopLoop };
  }

  window.ValtorixStage = {
    mountStage: mountStage,
    mountHero: mountHero,
    chapters: CHAPTERS,
    chapterOrder: CHAPTER_ORDER,
    instances: 0,
    lastRefusal: null
  };
})();
