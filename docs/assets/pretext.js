// pretext.js — DOM text on a Möbius strip with CSS 3D transforms
// Single row of large characters spiraling around the center of the strip.
// Activated/deactivated by fx.js.
(function () {
  'use strict';

  var LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum ';
  var TEXT = '';
  while (TEXT.length < 2000) TEXT += LOREM;

  // ── Möbius strip parameters ──
  var STRIP_R = 320;       // radius of the center circle (px in 3D space)
  var COLS = 180;          // characters around the full 720° loop
  var CAM_DIST = 900;      // perspective distance

  // ── Container ──
  var container = null;
  var scene = null;
  var charEls = [];
  var animFrame = null;
  var startTime = 0;

  // Pre-load font
  if (document.fonts) {
    var fontFace = new FontFace('Elven Common Speak', "url('assets/fonts/Elvencommonspeak-0WXz.ttf')");
    fontFace.load().then(function (f) { document.fonts.add(f); })
      .catch(function () { console.warn('pretext.js: Elven font fallback'); });
  }

  // ── Möbius strip parametric surface ──
  // u ∈ [0, 4π) — full 720° needed to close a Möbius strip
  // Half-twist over 4π: cross-section rotates by π over the full loop
  function mobiusPoint(u, s) {
    // twist rate: π per 4π of u → factor of 0.25
    var halfU = u * 0.25;
    var ch = Math.cos(halfU), sh = Math.sin(halfU);
    var cu = Math.cos(u), su = Math.sin(u);
    var offset = 0; // s = 0 → center of strip
    return {
      x: (STRIP_R + offset * ch) * cu,
      y: (STRIP_R + offset * ch) * su,
      z: offset * sh
    };
  }

  // Surface tangent along the loop
  function mobiusTangentU(u) {
    var cu = Math.cos(u), su = Math.sin(u);
    return {
      x: -STRIP_R * su,
      y:  STRIP_R * cu,
      z:  0
    };
  }

  // Surface tangent across the strip width (for normal computation)
  function mobiusTangentS(u) {
    var halfU = u * 0.25;
    var ch = Math.cos(halfU), sh = Math.sin(halfU);
    var cu = Math.cos(u), su = Math.sin(u);
    return {
      x: ch * cu,
      y: ch * su,
      z: sh
    };
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function normalize(v) {
    var len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  // ── Color: purple → blue → magenta cycle ──
  function charColor(u01) {
    var hue = 260 + u01 * 80;
    return 'hsl(' + (hue % 360) + ', 80%, 65%)';
  }

  // ── Build DOM ──
  function buildScene() {
    container = document.getElementById('pretext-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pretext-container';
      container.style.cssText = 'position:fixed;inset:0;z-index:10;pointer-events:none;opacity:0;transition:opacity 0.4s;background:#000;overflow:hidden;';
      var ref = document.getElementById('pretext-canvas');
      if (ref && ref.parentNode) {
        ref.parentNode.insertBefore(container, ref);
        ref.parentNode.removeChild(ref);
      } else {
        document.body.appendChild(container);
      }
    }

    // Perspective wrapper — keeps perspective origin at center
    var perspWrap = document.createElement('div');
    perspWrap.style.cssText = 'position:absolute;top:50%;left:50%;width:0;height:0;perspective:' + CAM_DIST + 'px;';
    container.appendChild(perspWrap);

    // Scene — tilted so the strip is flatter w.r.t. the screen
    scene = document.createElement('div');
    scene.style.cssText = 'position:absolute;width:0;height:0;transform-style:preserve-3d;transform:rotateX(68deg);';
    perspWrap.appendChild(scene);

    charEls = [];
    var fontSize = Math.max(28, Math.min(window.innerWidth, window.innerHeight) * 0.045);
    // Tile size: arc length per character, with slight overlap to seal gaps
    var arcLen = Math.ceil((2 * Math.PI * STRIP_R * 2) / COLS) + 4;
    var tileH = Math.ceil(fontSize * 1.6);

    for (var col = 0; col < COLS; col++) {
      var span = document.createElement('span');
      span.textContent = TEXT[col % TEXT.length];
      span.style.cssText =
        'position:absolute;' +
        'font-family:"Elven Common Speak","Courier New",monospace;' +
        'font-size:' + fontSize + 'px;line-height:' + tileH + 'px;' +
        'width:' + arcLen + 'px;height:' + tileH + 'px;' +
        'text-align:center;' +
        'background:#000;' +
        'white-space:pre;will-change:transform;' +
        'backface-visibility:hidden;-webkit-backface-visibility:hidden;' +
        // Center the tile on its transform origin
        'margin-left:' + (-arcLen / 2) + 'px;margin-top:' + (-tileH / 2) + 'px;';
      span.dataset.col = col;
      scene.appendChild(span);
      charEls.push(span);
    }
  }

  // ── Position characters on the Möbius strip center line ──
  function layoutFrame(t) {
    var rotAngle = t * 0.12;

    for (var i = 0; i < charEls.length; i++) {
      var el = charEls[i];
      var col = +el.dataset.col;
      var u = ((col / COLS) * Math.PI * 4) + rotAngle;

      var p = mobiusPoint(u, 0);

      // Tangent frame
      var tu = normalize(mobiusTangentU(u));
      var ts = normalize(mobiusTangentS(u));
      var n = normalize(cross(tu, ts));

      // matrix3d — columns: tu, ts, n, position
      var m = 'matrix3d(' +
        tu.x + ',' + tu.y + ',' + tu.z + ',0,' +
        ts.x + ',' + ts.y + ',' + ts.z + ',0,' +
        n.x + ',' + n.y + ',' + n.z + ',0,' +
        p.x + ',' + p.y + ',' + p.z + ',1)';

      el.style.transform = m;
      el.style.color = charColor(col / COLS);
    }
  }

  // ── Animation loop ──
  function render() {
    var t = (Date.now() - startTime) / 1000;
    layoutFrame(t);
    animFrame = requestAnimationFrame(render);
  }

  // ── Public API ──
  window.pretextStart = function () {
    if (!scene) buildScene();
    container.style.opacity = '1';
    container.classList.add('fx-active');
    startTime = Date.now();
    if (!animFrame) animFrame = requestAnimationFrame(render);
  };

  window.pretextStop = function () {
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    if (container) {
      container.style.opacity = '0';
      container.classList.remove('fx-active');
    }
  };

  window.pretextResize = function () {
    if (scene && container) {
      scene.remove();
      scene = null;
      charEls = [];
      buildScene();
    }
  };

  window.addEventListener('resize', function () {
    if (animFrame) window.pretextResize();
  });
})();
