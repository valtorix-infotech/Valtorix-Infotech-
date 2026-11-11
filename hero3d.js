/* ==========================================================================
   VALTORIX INFOTECH — 3D hero (the V mark, extruded)
   --------------------------------------------------------------------------
   Hand-written WebGL. No Three.js, no CDN, no model file: the whole scene is
   136 triangles of the actual brand mark, so it costs ~8 KB of JavaScript.

   Design rules (from the 2026 WebGL practice research):
     - WebGL is never the LCP element. The headline is plain HTML and paints
       first; this canvas fades in over a static poster afterwards.
     - The canvas is reserved in CSS from first paint, so nothing shifts.
     - devicePixelRatio is capped (2 desktop / 1.5 touch) and steps DOWN only,
       never back up, when frames run long.
     - The render loop is paused whenever the canvas is off-screen.
     - `prefers-reduced-motion` and unavailable/software WebGL both fall back
       to the static poster with the identical layout.
     - Motion is transform-only and expressed in concrete numbers:
         idle rock  ±24° around Y over ~11 s
         cursor tilt up to 8° around X and Z, eased over ~400 ms
         on scroll   scale 1 -> 0.85, opacity 1 -> 0.4 by the hero's end
   ========================================================================== */
(function () {
  "use strict";

  var DEG = Math.PI / 180;

  var VERT_SRC = [
    "attribute vec3 aPosition;",
    "attribute vec3 aNormal;",
    "uniform mat4 uProjection;",
    "uniform mat4 uView;",
    "uniform mat4 uModel;",
    "uniform mat3 uNormalMatrix;",
    "varying vec3 vNormal;",
    "varying vec3 vWorld;",
    "void main(){",
    "  vec4 world = uModel * vec4(aPosition, 1.0);",
    "  vWorld = world.xyz;",
    "  vNormal = uNormalMatrix * aNormal;",
    "  gl_Position = uProjection * uView * world;",
    "}"
  ].join("\n");

  var FRAG_SRC = [
    "precision mediump float;",
    "uniform vec3 uBase;",
    "uniform vec3 uKey;",
    "uniform vec3 uKeyDir;",
    "uniform vec3 uFillDir;",
    "uniform vec3 uSky;",
    "uniform vec3 uGround;",
    "uniform vec3 uRim;",
    "uniform vec3 uCamera;",
    "uniform float uOpacity;",
    "varying vec3 vNormal;",
    "varying vec3 vWorld;",
    "void main(){",
    "  vec3 n = normalize(vNormal);",
    "  vec3 v = normalize(uCamera - vWorld);",
    "  vec3 l = normalize(uKeyDir);",
    "  float diff = max(dot(n, l), 0.0);",
    "  float fill = max(dot(n, normalize(uFillDir)), 0.0);",
    /* hemispheric ambient: a soft studio gradient so flat faces still read
       as a solid rather than a silhouette */
    "  float hemi = n.y * 0.5 + 0.5;",
    "  vec3 ambient = mix(uGround, uSky, hemi);",
    /* Blinn-Phong specular from the key light, plus a broader sheen */
    "  vec3 h = normalize(l + v);",
    "  float spec = pow(max(dot(n, h), 0.0), 34.0);",
    "  float sheen = pow(max(dot(n, h), 0.0), 6.0) * 0.16;",
    /* edge light: a thin bright line where the surface turns away */
    "  float rim = pow(1.0 - max(dot(n, v), 0.0), 2.9);",
    "  float lightAmt = 0.20 + 0.78 * diff + 0.26 * fill;",
    "  vec3 col = uBase * (ambient + lightAmt) * 1.55;",
    "  col += uKey * (spec * 0.88 + sheen);",
    "  col += uRim * rim * 0.70;",
    "  gl_FragColor = vec4(col, uOpacity);",
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
    var xx = up[1] * zz - up[2] * zy;
    var xy = up[2] * zx - up[0] * zz;
    var xz = up[0] * zy - up[1] * zx;
    len = Math.hypot(xx, xy, xz) || 1;
    xx /= len; xy /= len; xz /= len;
    var yx = zy * xz - zz * xy;
    var yy = zz * xx - zx * xz;
    var yz = zx * xy - zy * xx;
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
          a[j] * b[i * 4] +
          a[4 + j] * b[i * 4 + 1] +
          a[8 + j] * b[i * 4 + 2] +
          a[12 + j] * b[i * 4 + 3];
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

  function rotationY(out, a) {
    var s = Math.sin(a), c = Math.cos(a);
    out[0] = c; out[1] = 0; out[2] = s; out[3] = 0;
    out[4] = 0; out[5] = 1; out[6] = 0; out[7] = 0;
    out[8] = -s; out[9] = 0; out[10] = c; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
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

  function rotationZ(out, a) {
    var s = Math.sin(a), c = Math.cos(a);
    out[0] = c; out[1] = -s; out[2] = 0; out[3] = 0;
    out[4] = s; out[5] = c; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = 1; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  function scale(out, s) {
    out[0] = s; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = s; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = s; out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  }

  function normalMatrix(out9, m) {
    /* inverse-transpose of the upper-left 3x3; the model matrix here is a
       rigid transform plus a uniform scale, so the transpose is enough. */
    out9[0] = m[0]; out9[1] = m[1]; out9[2] = m[2];
    out9[3] = m[4]; out9[4] = m[5]; out9[5] = m[6];
    out9[6] = m[8]; out9[7] = m[9]; out9[8] = m[10];
    var sx = Math.hypot(out9[0], out9[1], out9[2]) || 1;
    var sy = Math.hypot(out9[3], out9[4], out9[5]) || 1;
    var sz = Math.hypot(out9[6], out9[7], out9[8]) || 1;
    for (var i = 0; i < 3; i++) {
      out9[i] /= sx;
      out9[3 + i] /= sy;
      out9[6 + i] /= sz;
    }
    return out9;
  }

  /* ---------------------------------------------------------------- helpers */
  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("hero3d shader:", gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function isTouch() {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  }

  /* ------------------------------------------------------------------ mount */
  function mount(canvas, options) {
    options = options || {};
    var H = window.ValtorixHero3D;
    function refuse(reason) {
      if (H) H.lastRefusal = reason;
      return null;
    }
    if (!canvas || !window.VALTORIX_HERO_GEOMETRY) return refuse("no-canvas-or-geometry");

    /* Fallback 1 — the visitor asked for less motion. Keep the static poster. */
    if (prefersReducedMotion()) return refuse("reduced-motion");

    var glOpts = {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: "default",
      /* refuse a software renderer: better the poster than a 12 fps scene */
      failIfMajorPerformanceCaveat: true
    };
    var gl = canvas.getContext("webgl", glOpts) || canvas.getContext("experimental-webgl", glOpts);
    /* Fallback 2 — no WebGL at all. */
    if (!gl) return refuse("no-webgl");

    var geo = window.VALTORIX_HERO_GEOMETRY;
    var vs = compile(gl, gl.VERTEX_SHADER, VERT_SRC);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return refuse("shader-compile");

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("hero3d link:", gl.getProgramInfoLog(prog));
      return refuse("program-link");
    }
    gl.useProgram(prog);

    function buffer(data, type) {
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }
    var posBuf = buffer(geo.positions, gl.FLOAT);
    var nrmBuf = buffer(geo.normals, gl.FLOAT);
    var idxBuf = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);

    var aPos = gl.getAttribLocation(prog, "aPosition");
    var aNrm = gl.getAttribLocation(prog, "aNormal");
    gl.enableVertexAttribArray(aPos);
    gl.enableVertexAttribArray(aNrm);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.vertexAttribPointer(aNrm, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);

    var u = {
      projection: gl.getUniformLocation(prog, "uProjection"),
      view: gl.getUniformLocation(prog, "uView"),
      model: gl.getUniformLocation(prog, "uModel"),
      normalMatrix: gl.getUniformLocation(prog, "uNormalMatrix"),
      base: gl.getUniformLocation(prog, "uBase"),
      key: gl.getUniformLocation(prog, "uKey"),
      keyDir: gl.getUniformLocation(prog, "uKeyDir"),
      fillDir: gl.getUniformLocation(prog, "uFillDir"),
      sky: gl.getUniformLocation(prog, "uSky"),
      ground: gl.getUniformLocation(prog, "uGround"),
      rim: gl.getUniformLocation(prog, "uRim"),
      camera: gl.getUniformLocation(prog, "uCamera"),
      opacity: gl.getUniformLocation(prog, "uOpacity")
    };

    gl.uniform3f(u.base, 0.072, 0.075, 0.090);
    gl.uniform3f(u.key, 1.0, 0.99, 0.97);
    gl.uniform3f(u.keyDir, -0.45, 0.72, 0.52);
    gl.uniform3f(u.fillDir, 0.65, -0.25, 0.4);
    gl.uniform3f(u.sky, 0.62, 0.66, 0.74);
    gl.uniform3f(u.ground, 0.12, 0.12, 0.14);
    gl.uniform3f(u.rim, 0.122, 0.435, 0.921);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    /* ------------------------------------------------------------- sizing */
    var maxDpr = options.maxDpr || (isTouch() ? 1.5 : 2);
    var dpr = maxDpr;
    var cssW = 1;
    var cssH = 1;

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

    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(canvas);
    } else {
      window.addEventListener("resize", resize);
    }

    /* ------------------------------------------------------- interaction */
    var pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    var onPointer = function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    };
    if (options.pointer !== false) {
      window.addEventListener("pointermove", onPointer, { passive: true });
    }

    /* -------------------------------------------------------- the render loop */
    var proj = mat4(), view = mat4(), model = mat4();
    var tmpA = mat4(), tmpB = mat4(), tmpC = mat4(), tmpD = mat4();
    var nrm = new Float32Array(9);
    var eye = [0, 0, options.distance || 4.1];
    var start = 0;
    var running = false;
    var visible = true;
    var scrollProgress = 0;
    var opacity = 0;

    /* adaptive quality: step the pixel ratio DOWN only */
    var frameAcc = 0;
    var frameCount = 0;

    function frame(now) {
      if (!running) return;
      if (!start) start = now;
      var t = (now - start) / 1000;

      /* eased pointer tilt, up to 8 degrees */
      pointer.x += (pointer.tx - pointer.x) * 0.08;
      pointer.y += (pointer.ty - pointer.y) * 0.08;
      var tiltX = -pointer.y * 8 * DEG;
      var tiltZ = -pointer.x * 8 * DEG;

      /* idle rock around Y — never goes edge-on, so the extrusion always reads */
      var rock = Math.sin(t * 0.58) * 24 * DEG;

      /* gentle bob */
      var bob = Math.sin(t * 0.72) * 0.022;

      /* scroll: scale 1 -> 0.85, fade 1 -> 0.4 by the end of the hero */
      var sc = 1 - 0.15 * scrollProgress;
      var op = 1 - 0.6 * scrollProgress;
      opacity += (op - opacity) * 0.12;

      resize();
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      perspective(proj, 34 * DEG, cssW / cssH, 0.1, 40);
      lookAt(view, eye, [0, 0, 0], [0, 1, 0]);

      rotationY(tmpA, rock);
      rotationX(tmpB, tiltX);
      multiply(tmpC, tmpA, tmpB);
      rotationZ(tmpA, tiltZ);
      multiply(tmpD, tmpC, tmpA);
      translation(tmpB, 0, bob, 0);
      multiply(tmpC, tmpD, tmpB);
      scale(tmpD, sc);
      multiply(model, tmpC, tmpD);
      normalMatrix(nrm, model);

      gl.uniformMatrix4fv(u.projection, false, proj);
      gl.uniformMatrix4fv(u.view, false, view);
      gl.uniformMatrix4fv(u.model, false, model);
      gl.uniformMatrix3fv(u.normalMatrix, false, nrm);
      gl.uniform3f(u.camera, eye[0], eye[1], eye[2]);
      gl.uniform1f(u.opacity, opacity);
      gl.drawElements(gl.TRIANGLES, geo.indices.length, gl.UNSIGNED_SHORT, 0);
      canvas.__heroOpacity = opacity;
      canvas.__heroScale = sc;

      /* step the resolution down if we are running long */
      frameAcc += now - (frame.last || now);
      frame.last = now;
      frameCount++;
      if (frameCount >= 60) {
        var avg = frameAcc / frameCount;
        if (avg > 24 && dpr > 0.75) {
          dpr = Math.max(0.75, dpr - 0.5);
          resize();
        }
        frameAcc = 0;
        frameCount = 0;
      }

      requestAnimationFrame(frame);
    }

    /* ------------------------------------------------------------ lifecycle */
    function startLoop() {
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    }
    function stopLoop() {
      running = false;
    }

    if (window.IntersectionObserver) {
      new IntersectionObserver(
        function (entries) {
          visible = entries[0].isIntersecting;
          if (visible) startLoop();
          else stopLoop();
        },
        { threshold: 0.01 }
      ).observe(canvas);
    }

    /* scroll progress, read inside the loop rather than in a scroll handler */
    var scrollEl = document.scrollingElement || document.documentElement;
    var heroEl = canvas.closest ? canvas.closest(".hero, .page-hero") : null;
    function readScroll() {
      var heroH = heroEl ? heroEl.offsetHeight : window.innerHeight;
      scrollProgress = Math.min(1, Math.max(0, scrollEl.scrollTop / Math.max(1, heroH)));
    }
    var tickScroll = function () {
      readScroll();
      if (running) requestAnimationFrame(tickScroll);
    };
    readScroll();

    /* fade the canvas in over the static poster */
    canvas.style.opacity = "0";
    requestAnimationFrame(function () {
      canvas.style.transition = "opacity 700ms ease";
      canvas.style.opacity = "1";
      if (canvas.parentElement) canvas.parentElement.classList.add("is-3d");
    });

    startLoop();
    requestAnimationFrame(tickScroll);

    if (H) H.instances++;

    return {
      destroy: function () {
        stopLoop();
        window.removeEventListener("pointermove", onPointer);
      }
    };
  }

  window.ValtorixHero3D = {
    mount: mount,
    /** how many scenes are live on this page (diagnostics + tests) */
    instances: 0,
    /** why a mount was refused, for debugging */
    lastRefusal: null
  };
})();
