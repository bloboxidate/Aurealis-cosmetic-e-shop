/* Auréalis — ambient sound. ON by default; the small speaker button in the header turns it off and the choice is
 * remembered. Everything is synthesised live with the Web Audio API (no audio files): a slow, open pad whose
 * brightness follows how far down the page you are, plus a soft chime when something is added to the bag.
 * Browsers only allow audio after a gesture, so it begins at the visitor's first tap, click or key press (the first
 * tap on the entrance, if it is skipped, counts). Visitors on data-saver never get it. */
(function () {
  'use strict';
  var AC = window.AudioContext || window.webkitAudioContext;
  var root = document.documentElement;
  var conn = navigator.connection;
  var header = document.querySelector('.au-header');
  var host = header && header.querySelector(':scope > div:last-of-type');
  if (!AC || !host || (conn && conn.saveData)) return;

  var KEY = 'au-sound';
  var on = false, ctx = null, master = null, filter = null, tick = 0;

  // A visitor's own choice wins; otherwise the admin's default (data-au-sound on <html>, set in head.ejs).
  function saved() {
    try { var v = localStorage.getItem(KEY); if (v === '0') return false; if (v === '1') return true; } catch (e) {}
    return root.getAttribute('data-au-sound') !== 'off';
  }
  function save(v) { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) {} }

  function build() {
    if (ctx) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    // A generated reverb tail (decaying noise): gives the pad and the chime their air.
    var len = Math.floor(ctx.sampleRate * 2.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (var c = 0; c < 2; c++) { var d = ir.getChannelData(c); for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    var verb = ctx.createConvolver(); verb.buffer = ir;
    var wet = ctx.createGain(); wet.gain.value = 0.6; verb.connect(wet); wet.connect(master);
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 700; filter.Q.value = 0.35;
    var dry = ctx.createGain(); dry.gain.value = 0.55;
    filter.connect(dry); dry.connect(master); filter.connect(verb);
    // The pad: an open D-lydian-ish chord, each voice slightly detuned, triangle + sine.
    [146.83, 220.0, 329.63, 369.99, 493.88].forEach(function (f, i) {
      [-6, 5].forEach(function (cents) {
        var o = ctx.createOscillator(); o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = f; o.detune.value = cents;
        var g = ctx.createGain(); g.gain.value = 0.034 / (1 + i * 0.25);
        o.connect(g); g.connect(filter); o.start();
      });
    });
    // A very slow LFO breathes the filter.
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    var lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(filter.frequency); lfo.start();
    window.AuSound._verb = verb;
  }

  function follow() { // brighter as you travel down the page
    if (!ctx || !on) return;
    var p = parseFloat(root.style.getPropertyValue('--au-p')) || 0;
    filter.frequency.setTargetAtTime(520 + p * 1500, ctx.currentTime, 0.8);
  }

  function setOn(v, fromGesture, auto) {
    on = v; if (!auto) save(v); paint();
    if (v) {
      build();
      var start = function () { ctx.resume(); master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.1); tick = tick || setInterval(follow, 250); };
      if (fromGesture || ctx.state === 'running') start();
      else { // remembered "on": wait for the first gesture
        var evs = ['pointerup', 'click', 'touchend', 'keydown'];   // touchend/click are the gestures iOS and Android accept
        var once = function () { evs.forEach(function (ev) { document.removeEventListener(ev, once, true); }); if (on) start(); };
        evs.forEach(function (ev) { document.addEventListener(ev, once, true); });
      }
    } else if (ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
      clearInterval(tick); tick = 0;
      setTimeout(function () { if (!on && ctx) ctx.suspend(); }, 1400);
    }
  }

  // A soft two-partial bell on a pentatonic note, for "added to bag".
  function chime() {
    if (!on || !ctx || ctx.state !== 'running') return;
    var notes = [587.33, 659.25, 739.99, 880.0, 987.77], f = notes[Math.floor(Math.random() * notes.length)], t = ctx.currentTime;
    [[f, 0.16], [f * 2.01, 0.05]].forEach(function (p) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = p[0];
      var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(p[1], t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
      o.connect(g); g.connect(master); if (window.AuSound._verb) g.connect(window.AuSound._verb);
      o.start(t); o.stop(t + 2);
    });
  }
  window.AuSound = { chime: chime };

  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'au-sound'; btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 10v4"/><path d="M10 7v10"/><path d="M14 9v6"/><path d="M18 11v2"/></svg>';
  function paint() { btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.setAttribute('aria-label', on ? 'Turn ambient sound off' : 'Turn ambient sound on'); btn.title = on ? 'Sound on' : 'Sound off'; btn.classList.toggle('is-on', on); }
  btn.addEventListener('click', function () { setOn(!on, true); });
  host.insertBefore(btn, host.firstChild);
  paint();
  if (saved()) setOn(true, false, true);
})();
