/* Auréalis aurora — the home "Northern Light" chapter, drawn live in one fragment shader.
 *
 * Raw WebGL, no library (one full-screen triangle). Three layered light curtains with slanted
 * rays, a thin halo ring, drifting stars, film grain. Palette = the brand's five colours; scroll
 * progress walks the palette (azure -> sage -> lavender -> honey -> apricot) and the cursor bends
 * the curtains and lifts a glow.
 *
 * Integration contract (so the page never gets worse) — same as relight.js:
 *  - A CSS gradient sits behind the canvas as the fallback. The canvas stays visibility:hidden
 *    until its first drawn frame, so there is never a black flash.
 *  - create() returns null (touching nothing) when WebGL or the shader is unavailable, or when
 *    motion is off (reduced motion / au-fail). Context loss hides the canvas and rebuilds on restore.
 *  - Compiles at idle, not on scroll. Renders only while the section is on screen and the tab is
 *    visible. Renders at a fraction of CSS pixels (the light is soft) and drops the fraction
 *    automatically if frames run slow. Coarse pointers are capped at ~30fps.
 */
(function () {
  'use strict';
  if (window.AuAurora) return;

  var VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'uniform vec2 u_res;',
    'uniform float u_t;',
    'uniform vec3 u_m;',   // pointer: x,y in canvas px (y up), z presence 0..1
    'uniform float u_p;',  // scroll progress 0..1
    'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
    '  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}',
    'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}',
    // brand palette: azure, sage, lavender, honey, apricot
    'vec3 pal(float x){x=clamp(x,0.,1.)*4.;',
    '  vec3 az=vec3(.647,.82,.894),sg=vec3(.647,.749,.592),lv=vec3(.749,.71,.91),hn=vec3(.969,.835,.584),ap=vec3(.973,.682,.498);',
    '  if(x<1.)return mix(az,sg,x);if(x<2.)return mix(sg,lv,x-1.);if(x<3.)return mix(lv,hn,x-2.);return mix(hn,ap,x-3.);}',
    'void main(){',
    '  vec2 R=u_res;vec2 p=(gl_FragCoord.xy-.5*R)/R.y;float t=u_t;',
    '  vec2 m=(u_m.xy-.5*R)/R.y;float md=length(p-m);float push=u_m.z*exp(-md*md*7.);',
    '  vec3 col=mix(vec3(.024,.036,.064),vec3(.075,.052,.14),smoothstep(-.5,.5,p.y));',
    // stars, thinning towards the horizon, each twinkling at its own rate
    '  vec2 fc=gl_FragCoord.xy/3.;float sr=h21(floor(fc));float sd=length(fract(fc)-.5)*3.;',
    '  col+=vec3(.9,.92,1.)*step(.9975,sr)*smoothstep(1.5,.2,sd)*(.45+.55*sin(t*1.6+sr*80.))*smoothstep(-.05,.45,p.y)*.85;',
    // three curtains of light
    '  for(int i=0;i<3;i++){float fi=float(i);',
    '    float x=p.x*1.15+fi*2.7;',
    '    float sway=fbm(vec2(x*.8+t*.05*(1.+fi*.3),fi*5.+t*.03));',
    '    float y0=-.2+fi*.07+(sway-.5)*.5+.04*sin(x*3.+t*.2+fi)+push*.12;',
    '    float d=p.y-y0;',
    '    float edge=smoothstep(-.03,.02,d);',
    '    float fall=exp(-max(d,0.)*(4.6-fi*.7));',
    '    float rays=pow(.5+.5*vn(vec2(x*34.+d*3.5*(1.+fi),t*.25+fi*9.)),2.1);',
    '    float body=edge*fall*(.25+1.1*rays)*(.55+.45*fbm(vec2(x*2.2+t*.07,d*2.5+fi)));',
    '    body+=exp(-pow(d*26.,2.))*.42;',
    '    vec3 c=pal(u_p*.62+fi*.14+d*.55+.1*sin(x*2.));c=mix(vec3(dot(c,vec3(.3,.59,.11))),c,1.7);',
    '    col+=c*body*(.9-fi*.14);',
    '  }',
    // halo: a thin ring of warm light with a faint core, drifting a touch with the cursor
    '  float ax=.5*R.x/R.y;vec2 hc=vec2(ax*.6,.1)+m*.05;float r=length(p-hc);',
    '  float ring=exp(-pow((r-.27)*70.,2.))*.5+exp(-pow((r-.27)*10.,2.))*.08;',
    '  col+=vec3(1.,.83,.6)*(ring*.55+exp(-r*r*14.)*.16)*(.75+.25*sin(t*.4));',
    '  col+=pal(.55)*push*.07;',
    '  col=1.-exp(-col*1.55);',
    '  col*=mix(.62,1.,smoothstep(1.1,.2,length(p*vec2(.9,1.1))));',
    '  col+=(h21(gl_FragCoord.xy+fract(t)*91.)-.5)*.022;',
    '  gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  var root = document.documentElement;
  var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

  function create(opts) {
    var canvas = opts && opts.canvas, stage = opts && opts.stage, host = (opts && opts.host) || (stage && stage.parentNode);
    if (!canvas || !stage || !host) return null;
    if (!root.classList.contains('au-motion') || root.classList.contains('au-fail')) return null;

    var gl = null, prog = null, buf = null, loc = {};
    var S = { p: 0, tp: 0, mx: 0.5, my: 0.5, tmx: 0.5, tmy: 0.5, pres: 0, tpres: 0, t: 0, last: 0, lastDraw: 0,
              visible: false, raf: 0, drawn: false, scale: coarse ? 0.45 : 0.68, w: 0, h: 0, slow: 0, n: 0, sum: 0, cuts: 0, lost: false, dead: false };

    function compile(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { if (window.console) console.warn('[aurora] shader:', gl.getShaderInfoLog(s)); return null; }
      return s;
    }
    function setup() {
      var vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
      if (!vs || !fs) return false;
      prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var a = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      loc.res = gl.getUniformLocation(prog, 'u_res'); loc.t = gl.getUniformLocation(prog, 'u_t');
      loc.m = gl.getUniformLocation(prog, 'u_m'); loc.p = gl.getUniformLocation(prog, 'u_p');
      return true;
    }
    function size() {
      var cw = stage.clientWidth, ch = stage.clientHeight; if (!cw || !ch) return;
      var s = S.scale;
      // pixel budget: the shader is per-pixel heavy, so never more than ~0.75 MP whatever the screen
      var px = cw * ch * s * s; if (px > 750000) s *= Math.sqrt(750000 / px);
      S.w = Math.max(2, Math.round(cw * s)); S.h = Math.max(2, Math.round(ch * s));
      if (canvas.width !== S.w || canvas.height !== S.h) { canvas.width = S.w; canvas.height = S.h; }
      if (gl && !S.lost) gl.viewport(0, 0, S.w, S.h);
    }
    function draw() {
      if (!gl || S.lost || !S.w) return;
      gl.uniform2f(loc.res, S.w, S.h); gl.uniform1f(loc.t, S.t);
      gl.uniform3f(loc.m, S.mx * S.w, (1 - S.my) * S.h, S.pres); gl.uniform1f(loc.p, S.p);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!S.drawn) { S.drawn = true; canvas.style.visibility = 'visible'; canvas.classList.add('is-on'); }
    }
    function frame(now) {
      S.raf = 0;
      if (!S.visible || document.hidden || S.lost) return;
      if (coarse && now - S.lastDraw < 30) { S.raf = requestAnimationFrame(frame); return; }
      var dt = Math.min((now - (S.last || now)) / 1000, 0.1); S.last = now; S.lastDraw = now;
      S.t += dt;
      var k = function (r) { return 1 - Math.exp(-dt * r); };
      S.mx += (S.tmx - S.mx) * k(5); S.my += (S.tmy - S.my) * k(5);
      S.pres += (S.tpres - S.pres) * k(3); S.p += (S.tp - S.p) * k(6);
      draw();
      // If frames run slow, render fewer pixels (twice at most) rather than stutter.
      if (S.cuts < 2 && dt > 0) {
        S.n++; if (S.n > 10) S.sum += dt;
        if (S.n >= 70) { if (S.sum / 60 > 0.026) { S.scale *= 0.72; S.cuts++; size(); } S.n = 0; S.sum = 0; }
      }
      S.raf = requestAnimationFrame(frame);
    }
    function kick() { if (!S.raf && S.visible && !document.hidden && !S.lost && !S.dead) { S.last = 0; S.raf = requestAnimationFrame(frame); } }

    function build() {
      if (S.dead) return;
      try {
        gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      } catch (e) { gl = null; }
      if (!gl || !setup()) { S.dead = true; return; }
      canvas.addEventListener('webglcontextlost', function (e) {
        e.preventDefault(); S.lost = true; if (S.raf) { cancelAnimationFrame(S.raf); S.raf = 0; }
        canvas.style.visibility = 'hidden'; canvas.classList.remove('is-on'); S.drawn = false;
      });
      canvas.addEventListener('webglcontextrestored', function () {
        S.lost = false; if (setup()) { size(); draw(); kick(); } else S.dead = true;
      });
      size(); draw(); kick();
    }

    // Visibility: only render while the chapter is on screen.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { S.visible = es[0].isIntersecting; if (S.visible) kick(); }).observe(host);
    } else S.visible = true;
    document.addEventListener('visibilitychange', kick);
    if ('ResizeObserver' in window) new ResizeObserver(function () { size(); if (S.drawn && !S.raf) draw(); }).observe(stage);
    else window.addEventListener('resize', size);

    // Build at idle, never as it scrolls into view (a one-off compile shows up as a dropped frame).
    var ric = window.requestIdleCallback || function (f) { return setTimeout(f, 300); };
    ric(build, { timeout: 2500 });

    return {
      setProgress: function (p) { S.tp = Math.max(0, Math.min(1, p)); },
      setPointer: function (x, y) { // x,y in 0..1 of the stage, or null to release
        if (x == null) { S.tpres = 0; return; }
        S.tmx = x; S.tmy = y; S.tpres = 1;
      }
    };
  }

  window.AuAurora = { create: create };
})();
