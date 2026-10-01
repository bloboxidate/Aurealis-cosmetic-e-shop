/* Auréalis relight — a tiny WebGL layer (no library).
 *
 * Draws one of the site's own photographs through a fragment shader that adds a
 * physically-motivated light response to the gold-foil marks, and nothing else: a glint
 * sweeps across ONLY the foil as the page scrolls and the pointer moves. Foil is picked
 * out by its colour (saturated warm gold vs. the cream paper around it), and surface
 * normals derived from the photo's luminance keep the sparkle attached to real strokes.
 *
 * Used for the home "story" image. (A skin-relighting variant for the hero was built and
 * rejected: it made skin look blotchy and left a halo at the silhouette. The existing CSS
 * light layers are more flattering there, so the hero does not use WebGL.)
 *
 * Why not Three.js: this is one full-screen triangle. A scene graph would add ~170 KB
 * gzipped to draw it; this file is ~4 KB.
 *
 * Integration contract (so the page never gets worse):
 *  - The original <img> stays in the DOM as fallback. The canvas is inserted right after
 *    it, mirrors its transform every frame (so GSAP motion on the image carries over),
 *    and the <img> is only hidden once a frame has actually rendered.
 *  - create() returns null (and touches nothing) if WebGL, the texture, or the device
 *    budget isn't there. Context loss restores the <img>.
 *  - Builds only near the viewport; redraws only when its inputs change; coarse pointers
 *    are capped at ~30fps; the canvas is capped to a pixel budget.
 */
(function () {
  'use strict';
  if (window.AuRelight) return;

  var VERT = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'varying vec2 v;',
    'uniform sampler2D u_tex;',
    'uniform vec2 u_res;', 'uniform vec2 u_texel;', 'uniform vec4 u_cover;',
    'uniform vec3 u_light;',   // xy: pointer in canvas uv (top-left origin), z: pointer presence 0..1
    'uniform vec2 u_p;',       // x: scroll progress 0..1
    'uniform float u_amt;',
    'float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}',
    'void main(){',
    '  vec2 cuv=vec2(v.x,1.-v.y);',
    '  vec2 uv=u_cover.zw+cuv*u_cover.xy;',
    '  vec3 base=texture2D(u_tex,uv).rgb;',
    '  if(u_amt<.001){gl_FragColor=vec4(base,1.);return;}',
    '  vec2 e=u_texel*1.5;',
    '  float hx=lum(texture2D(u_tex,uv+vec2(e.x,0.)).rgb)-lum(texture2D(u_tex,uv-vec2(e.x,0.)).rgb);',
    '  float hy=lum(texture2D(u_tex,uv+vec2(0.,e.y)).rgb)-lum(texture2D(u_tex,uv-vec2(0.,e.y)).rgb);',
    '  vec3 n=normalize(vec3(-hx*5.,-hy*5.,1.));',
    '  vec2 d=(u_light.xy-cuv)*vec2(u_res.x/u_res.y,1.);',
    '  vec3 l=normalize(vec3(d,.5));',
    '  vec3 h=normalize(l+vec3(0.,0.,1.));',
    '  float nh=max(dot(n,h),0.);',
    // foil = saturated warm gold; cream paper is low-chroma
    '  float chroma=max(base.r,max(base.g,base.b))-min(base.r,min(base.g,base.b));',
    '  float warm=smoothstep(.02,.12,base.r-base.b)*smoothstep(-.03,.05,base.g-base.b);',
    '  float foil=smoothstep(.16,.34,chroma)*warm;',
    // a soft diagonal band of light that travels with scroll and leans toward the pointer
    '  float s=cuv.x*.78+cuv.y*.62;',
    '  float c=mix(-.30,1.45,u_p.x)+(u_light.x-.5)*.35*u_light.z;',
    '  float band=exp(-pow((s-c)/.13,2.));',
    '  float glint=pow(nh,22.)*u_light.z;',
    '  vec3 col=base+foil*vec3(1.,.86,.55)*(band*1.25+glint*.7)*u_amt;',
    '  col=mix(col,col*vec3(1.04,1.,.92),foil*.35*u_amt);',
    '  gl_FragColor=vec4(clamp(col,0.,1.),1.);',
    '}'
  ].join('\n');

  var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var instances = [];
  var raf = 0;

  function budgetOk() {
    var c = navigator.connection;
    if (c && c.saveData) return false;
    if (navigator.deviceMemory && navigator.deviceMemory <= 2) return false;
    if ((navigator.hardwareConcurrency || 4) <= 2) return false;
    return true;
  }

  function loop(t) {
    raf = 0;
    var again = false;
    for (var i = 0; i < instances.length; i++) {
      var s = instances[i];
      if (s.active()) { if (s.frame(t)) again = true; }
    }
    if (again) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
  }

  function create(opts) {
    var img = opts && opts.img;
    if (!img || !budgetOk()) return null;
    var amount = opts.amount != null ? opts.amount : 1.2;
    var trigger = opts.trigger || img;
    // requestIdleCallback where available (Safari lacks it): run the work in a quiet moment, never mid-frame
    var idle = window.requestIdleCallback ? function (f, o) { return window.requestIdleCallback(f, o); } : function (f) { return setTimeout(f, 250); };

    var S = {
      canvas: null, gl: null, U: null, texW: 0, texH: 0, texImg: null, ready: false, built: false, dead: false, shown: false,
      visible: false, dirty: true, light: { x: 0.5, y: 0.5, z: 0 }, target: { x: 0.5, y: 0.5, z: 0 },
      prog: 0, lastT: 0, lastDraw: 0, lastTransform: '', lastOrigin: '', ox: 0.5, oy: 0.5, cw: 0, ch: 0
    };

    // ---- texture source: its own CORS-enabled <img> load (the visible <img> is untouched) ----
    // img.decode() decodes off the main thread; the old path let createImageBitmap decode a 1536x2048 JPEG
    // synchronously (~280ms on a phone-class CPU). (fetch+Blob would also work but needs the image host in the
    // page's CSP connect-src, so this stays within img-src.) A failure just leaves the original photo in place.
    var im = new Image();
    im.crossOrigin = 'anonymous';
    im.decoding = 'async';
    var started = false;

    // Displayed texture width in device px (covering the <img>'s box) plus headroom for the page's 1.35x zoom.
    function targetWidth(nw, nh) {
      var boxW = img.clientWidth || 600, boxH = img.clientHeight || 400;
      var dprT = Math.min(window.devicePixelRatio || 1, 2);
      var ca0 = boxW / boxH, ta0 = (nw || 1) / (nh || 1);
      return Math.ceil((boxW * dprT) / (ca0 > ta0 ? 1 : ca0 / ta0) * 1.5);
    }
    function mark(n) { if (window.performance && performance.mark) performance.mark(n); }

    function onDecoded() {
      mark('relight:decoded');
      S.texImg = im; S.texW = im.naturalWidth; S.texH = im.naturalHeight;
      var want = targetWidth(S.texW, S.texH);
      // pre-scale to about the displayed size so thin strokes don't alias (no mipmaps for NPOT textures in WebGL1)
      if (want < S.texW * 0.85 && window.createImageBitmap) {
        createImageBitmap(im, { resizeWidth: want, resizeHeight: Math.round(S.texH * want / S.texW), resizeQuality: 'high' })
          .then(function (bm) { S.texImg = bm; S.texW = bm.width; S.texH = bm.height; S.scaled = true; mark('relight:ready'); S.ready = true; maybeBuild(); })
          .catch(function () { S.ready = true; maybeBuild(); });
      } else { S.ready = true; maybeBuild(); }
    }
    im.onerror = function () { S.dead = true; };
    im.onload = function () { if (im.decode) im.decode().then(onDecoded, onDecoded); else onDecoded(); };
    function startLoad() { if (started) return; started = true; var src = img.currentSrc || img.src; if (src) im.src = src; }

    function fail() {
      S.dead = true;
      if (S.canvas && S.canvas.parentNode) S.canvas.parentNode.removeChild(S.canvas);
      img.style.visibility = '';
      var i = instances.indexOf(S); if (i > -1) instances.splice(i, 1);
    }

    function layout() {
      if (!S.built) return;
      var cw = S.canvas.clientWidth, ch = S.canvas.clientHeight;
      if (!cw || !ch) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var scale = Math.min(dpr, Math.sqrt(2.4e6 / (cw * ch)));      // pixel budget
      var w = Math.max(2, Math.round(cw * scale)), h = Math.max(2, Math.round(ch * scale));
      if (S.canvas.width !== w || S.canvas.height !== h) { S.canvas.width = w; S.canvas.height = h; }
      S.cw = cw; S.ch = ch;
      var op = (getComputedStyle(img).objectPosition || '50% 50%').split(' ');
      S.ox = parseFloat(op[0]) / 100; S.oy = parseFloat(op[1] != null ? op[1] : op[0]) / 100;
      if (isNaN(S.ox)) S.ox = 0.5; if (isNaN(S.oy)) S.oy = 0.5;
      S.dirty = true; kick();
    }

    // Heavy GPU-driver work is split across two idle callbacks so neither lands as one long main-thread block
    // (on a phone-class CPU, context + shader compile + texture upload together measured ~300ms).
    var stage = 0, pending = null;
    function build() {
      if (stage === 0) { stage = 1; idle(function () { buildA(); if (!S.dead) idle(buildB, { timeout: 1500 }); }, { timeout: 1500 }); }
    }
    function buildA() {
      if (window.performance && performance.mark) performance.mark('relight:buildA');
      var canvas = document.createElement('canvas');
      var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
      if (!gl) { S.dead = true; return; }
      var vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) { S.dead = true; return; }
      var pr = gl.createProgram();
      gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { S.dead = true; return; }
      gl.useProgram(pr);
      pending = { canvas: canvas, gl: gl, pr: pr };
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one oversized triangle
      var loc = gl.getAttribLocation(pr, 'p');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    function buildB() {
      if (S.dead || !pending) return;
      if (window.performance && performance.mark) performance.mark('relight:buildB');
      var canvas = pending.canvas, gl = pending.gl, pr = pending.pr; pending = null;
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Sampling a large photo straight down to a small canvas (no mipmaps in WebGL1 for non-power-of-two
      // textures) aliases fine detail — thin foil strokes would shimmer — so it was pre-scaled in onload
      // (off-thread). If that wasn't possible, fall back to the browser's high-quality 2D filter here.
      var src = S.texImg;
      if (!S.scaled) {
        try {
          var want = targetWidth();
          if (want < S.texW * 0.85) {
            var k = want / S.texW, sc = document.createElement('canvas');
            sc.width = want; sc.height = Math.round(S.texH * k);
            var cx = sc.getContext('2d');
            cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = 'high';
            cx.drawImage(S.texImg, 0, 0, sc.width, sc.height);
            src = sc; S.texW = sc.width; S.texH = sc.height;
          }
        } catch (e) { src = S.texImg; }
      }
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, src); }
      catch (e) { S.dead = true; return; }            // tainted (no CORS) or unsupported: keep the <img>
      S.texImg = null; src = null;
      S.U = {};
      ['u_res', 'u_texel', 'u_cover', 'u_light', 'u_p', 'u_amt'].forEach(function (n) { S.U[n] = gl.getUniformLocation(pr, n); });
      S.gl = gl; S.canvas = canvas; S.built = true;

      canvas.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('data-relight', 'foil');
      if (img.className) canvas.className = img.className;
      // hidden until the first real frame: an opaque WebGL canvas starts out black
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;visibility:hidden';
      img.parentNode.insertBefore(canvas, img.nextSibling);
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fail(); });
      if (window.ResizeObserver) new ResizeObserver(layout).observe(canvas);
      window.addEventListener('resize', layout);
      layout();
    }

    // Build as soon as the texture is ready, at idle time — not when the story nears the viewport, where the
    // one-off decode/compile/upload would land as a dropped frame mid-scroll. Rendering is still visibility-gated.
    function maybeBuild() { if (S.ready && !S.built && !S.dead) build(); if (S.built) kick(); }

    // ---- visibility gate: only RENDER near the viewport; load + build happen early, at idle ----
    var io = null;
    var armed = false;
    var FLOOR = 5500; // ms after navigation: the hero entrance (curtain + headline) is done by then
    function arm() {
      if (armed) return;
      var now = window.performance ? performance.now() : FLOOR;
      // hard floor: on a phone the story can be only a screen below the hero, so "near the viewport" alone would
      // start the build in the middle of the entrance, when the main thread is busiest
      if (now < FLOOR) { if (!arm.t) arm.t = setTimeout(function () { arm.t = 0; arm(); }, FLOOR - now); return; }
      armed = true; idle(startLoad, { timeout: 2000 });
    }
    arm();
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (es) {
        S.visible = es[es.length - 1].isIntersecting;
        if (S.visible) { arm(); maybeBuild(); S.dirty = true; kick(); }
        if (es[es.length - 1].isIntersecting) arm();
      }, { rootMargin: '500px 0px' });
      io.observe(trigger);
      // the story only needs to be READY a little before it's seen: warm it up when it's within ~1.5 screens
      var io2 = new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) { arm(); io2.disconnect(); } }, { rootMargin: '1500px 0px' });
      io2.observe(trigger);
    } else { S.visible = true; arm(); }
    document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });

    S.active = function () { return S.built && !S.dead && S.visible && !document.hidden; };

    S.frame = function (t) {
      var dt = Math.min(0.1, (t - (S.lastT || t)) / 1000); S.lastT = t;
      if (coarse && t - S.lastDraw < 30) return true;                 // ~30fps on touch devices
      S.lastDraw = t;
      // mirror whatever motion the page applies to the <img> (GSAP transforms). A transform change is a
      // compositor property on the canvas: it needs no redraw.
      var tr = img.style.transform || '', og = img.style.transformOrigin || '';
      if (tr !== S.lastTransform) { S.canvas.style.transform = tr; S.lastTransform = tr; }
      if (og !== S.lastOrigin) { S.canvas.style.transformOrigin = og; S.lastOrigin = og; }
      // damped follow of the pointer (frame-rate independent)
      var a = 1 - Math.pow(0.0008, dt);
      var mx = S.target.x - S.light.x, my = S.target.y - S.light.y, mz = S.target.z - S.light.z;
      S.light.x += mx * a; S.light.y += my * a; S.light.z += mz * a;
      var moving = Math.abs(mx) + Math.abs(my) + Math.abs(mz) > 0.002;
      if (S.dirty || moving) { draw(); S.dirty = moving; }
      return true;                                                    // keep watching the <img> while visible
    };

    function draw() {
      var gl = S.gl, c = S.canvas;
      gl.viewport(0, 0, c.width, c.height);
      var ca = S.cw / S.ch, ta = S.texW / S.texH, sx = 1, sy = 1, ox = 0, oy = 0;
      if (ca > ta) { sy = ta / ca; oy = (1 - sy) * S.oy; } else { sx = ca / ta; ox = (1 - sx) * S.ox; }
      gl.uniform2f(S.U.u_res, c.width, c.height);
      gl.uniform2f(S.U.u_texel, 1 / S.texW, 1 / S.texH);
      gl.uniform4f(S.U.u_cover, sx, sy, ox, oy);
      gl.uniform3f(S.U.u_light, S.light.x, S.light.y, S.light.z);
      gl.uniform2f(S.U.u_p, S.prog, 0);
      gl.uniform1f(S.U.u_amt, amount);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!S.shown) { S.shown = true; c.style.visibility = 'visible'; img.style.visibility = 'hidden'; } // only now, after a real frame
    }

    var api = {
      // clientX/Y in viewport px (or null when the pointer leaves)
      setLight: function (cx, cy) {
        if (S.dead || !S.built) return;
        if (cx == null) { S.target.z = 0; S.dirty = true; kick(); return; }
        var r = S.canvas.getBoundingClientRect();
        S.target.x = (cx - r.left) / r.width; S.target.y = (cy - r.top) / r.height; S.target.z = 1;
        S.dirty = true; kick();
      },
      setProgress: function (p) { if (S.dead) return; S.prog = p < 0 ? 0 : p > 1 ? 1 : p; S.dirty = true; if (S.built) kick(); },
      setAmount: function (a) { amount = a; S.dirty = true; kick(); },
      destroy: function () { if (io) io.disconnect(); fail(); },
      get active() { return S.built && !S.dead; }
    };
    instances.push(S);
    return api;
  }

  window.AuRelight = { create: create };
})();
