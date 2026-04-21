// flame.js — 2D ASCII fire (3 parallax layers) + gold ring with Elvish text
(function () {
  'use strict';

  // ── Flame text mode: 'ascii' or 'words' ──
  var FLAME_MODE = 'words'; // default to words

  var CHARS = [' ', '.', 'i', '/', '\\', '|', '^'];
  var WORDS = ['ONE', 'RING', 'TO', 'RULE', 'THEM'];
  var PALETTE = [
    [10,  0,  0],
    [50,  8,  0],
    [120, 24, 0],
    [190, 50, 0],
    [240, 120, 20],
    [255, 180, 60]
  ];

  var ELVISH = 'Ash nazg durbatuluk ash nazg gimbatul ash nazg thrakatuluk agh burzum-ishi krimpatul ';
  var RING_TEXT = '';
  while (RING_TEXT.length < 400) RING_TEXT += ELVISH;

  // ── Noise ──
  function hashF(n) { var s = Math.sin(n) * 43758.5453; return s - Math.floor(s); }

  function noise3D(x, y, z) {
    var ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    var fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    fz = fz * fz * (3 - 2 * fz);
    var a = ix + iy * 137 + iz * 5039;
    var n000 = hashF(a);       var n100 = hashF(a + 1);
    var n010 = hashF(a + 137); var n110 = hashF(a + 138);
    a += 5039;
    var n001 = hashF(a);       var n101 = hashF(a + 1);
    var n011 = hashF(a + 137); var n111 = hashF(a + 138);
    var nx00 = n000 + (n100 - n000) * fx;
    var nx10 = n010 + (n110 - n010) * fx;
    var nx01 = n001 + (n101 - n001) * fx;
    var nx11 = n011 + (n111 - n011) * fx;
    var nxy0 = nx00 + (nx10 - nx00) * fy;
    var nxy1 = nx01 + (nx11 - nx01) * fy;
    return nxy0 + (nxy1 - nxy0) * fz;
  }

  function fbm3D(x, y, z) {
    return 0.5 * noise3D(x, y, z) +
           0.25 * noise3D(x * 2, y * 2, z * 2) +
           0.125 * noise3D(x * 4, y * 4, z * 4);
  }

  // ── Fire boundary ──
  var FP = [
    { base: 0.15, speed: 1.0, xs: 0.008, amp: 0.45,
      s1f: 0.003, s1a: 0.20, s1s: 1.4,
      s2f: 0.011, s2a: 0.10, s2s: 2.8,
      pf: 0.005, pa: 0.22, ps: 0.9 },
    { base: 0.22, speed: 0.65, xs: 0.006, amp: 0.35,
      s1f: 0.004, s1a: 0.16, s1s: 1.0,
      s2f: 0.014, s2a: 0.08, s2s: 2.0,
      pf: 0.007, pa: 0.16, ps: 0.6 },
    { base: 0.30, speed: 0.4, xs: 0.005, amp: 0.25,
      s1f: 0.005, s1a: 0.12, s1s: 0.6,
      s2f: 0.016, s2a: 0.06, s2s: 1.4,
      pf: 0.009, pa: 0.10, ps: 0.4 }
  ];

  function flameBoundary(x, t, layer) {
    var p = FP[layer], tt = t * p.speed;
    return p.base
      - p.s1a * Math.sin(x * p.s1f) * Math.cos(tt * p.s1s)
      - p.s2a * Math.sin(x * p.s2f + 2.1) * Math.sin(tt * p.s2s + 0.7)
      - p.pa * Math.abs(Math.sin(x * p.pf + 0.3)) * (0.6 + 0.4 * Math.sin(tt * p.ps))
      - p.amp * fbm3D(x * p.xs, layer * 10 + 7.3, tt * 0.5);
  }

  // ── Ring parameters (computed on resize) ──
  var RING_R = 0;       // center radius in px
  var RING_BAND = 0;    // band width in px
  var RING_TILT = 1.15; // tilt angle — mostly horizontal, face-up
  var TEXT_COUNT = 50;

  // ── Canvas + state ──
  var canvas, ctx;
  var animFrame = null;
  var startTime = 0;

  if (document.fonts) {
    var ff = new FontFace('Elven Common Speak', "url('assets/fonts/Elvencommonspeak-0WXz.ttf')");
    ff.load().then(function (f) { document.fonts.add(f); }).catch(function () {});
  }

  function init() {
    canvas = document.getElementById('flame-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
  }

  function resize() {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    RING_R = Math.min(canvas.width, canvas.height) * 0.22;
    RING_BAND = RING_R * 0.16;
  }

  // Boundary cache
  var bCache = [null, null, null];

  function render() {
    if (!canvas || !ctx) { animFrame = null; return; }

    var w = canvas.width, h = canvas.height;
    var t = (Date.now() - startTime) / 1000;
    var dpr = window.devicePixelRatio || 1;
    var fs = Math.round(14 * dpr);
    var cw = fs * 0.65;
    var ch = fs * 1.15;
    var cols = Math.ceil(w / cw);
    var rows = Math.ceil(h / ch);

    ctx.fillStyle = '#080000';
    ctx.fillRect(0, 0, w, h);
    ctx.font = fs + 'px "Courier New",monospace';
    ctx.textBaseline = 'top';

    // Pre-compute boundaries
    for (var l = 0; l < 3; l++) {
      if (!bCache[l] || bCache[l].length < cols) bCache[l] = new Float32Array(cols);
      for (var c = 0; c < cols; c++) bCache[l][c] = flameBoundary(c * cw, t, l);
    }

    // ── Draw flames ──
    var alphas = [1.0, 0.55, 0.3];
    var useWords = FLAME_MODE === 'words';

    for (var l2 = 2; l2 >= 0; l2--) {
      ctx.globalAlpha = alphas[l2];
      var bc = bCache[l2];

      if (useWords) {
        // Word mode: each row has a fixed word based on vertical position.
        // Text layout is static — the flame boundary only clips visibility.
        // Word bands: screen divided into 5 equal zones top→bottom = ONE→THEM
        var zoneH = h / 5;

        for (var r = 0; r < rows; r++) {
          var py = r * ch;
          var yn = py / h;

          // Fixed word for this row based on screen position
          var wordI = (py / zoneH) | 0; if (wordI > 4) wordI = 4;
          var word = WORDS[wordI];
          var fullWord = word + ' ';

          for (var c2 = 0; c2 < cols; c2++) {
            // Clip: only draw if below the flame boundary
            if (yn < bc[c2]) continue;

            // Color by depth below boundary
            var depth = (yn - bc[c2]) / (1.0 - bc[c2]);
            if (depth > 1) depth = 1;
            var heat = depth + 0.08 * hashF(c2 * 7.1 + r * 13.3 + ((t * 6) | 0) * 3.7 + l2 * 50);
            if (heat > 1) heat = 1;
            if (heat < 0.08) continue;
            var ci = (heat * 6) | 0; if (ci > 5) ci = 5;

            // Fixed character position — column determines which letter
            var letter = fullWord[c2 % fullWord.length];
            var pc = PALETTE[ci];
            ctx.fillStyle = 'rgb(' + pc[0] + ',' + pc[1] + ',' + pc[2] + ')';
            ctx.fillText(letter, c2 * cw, py);
          }
        }
      } else {
        // ASCII char mode
        for (var r2 = 0; r2 < rows; r2++) {
          var py2 = r2 * ch;
          var yn2 = py2 / h;
          for (var c3 = 0; c3 < cols; c3++) {
            if (yn2 < bc[c3]) continue;
            var depth2 = (yn2 - bc[c3]) / (1.0 - bc[c3]);
            if (depth2 > 1) depth2 = 1;
            var heat2 = depth2 + 0.08 * hashF(c3 * 7.1 + r2 * 13.3 + ((t * 6) | 0) * 3.7 + l2 * 50);
            if (heat2 > 1) heat2 = 1;
            var ci2 = (heat2 * 6) | 0; if (ci2 > 5) ci2 = 5;
            var chi2 = (heat2 * 7) | 0; if (chi2 > 6) chi2 = 6;
            if (chi2 === 0) continue;
            var pc2 = PALETTE[ci2];
            ctx.fillStyle = 'rgb(' + pc2[0] + ',' + pc2[1] + ',' + pc2[2] + ')';
            ctx.fillText(CHARS[chi2], c3 * cw, py2);
          }
        }
      }
    }

    ctx.globalAlpha = 1.0;

    // ── Gold ring — stroke-based (naturally hollow) ──
    // A thick stroked ellipse IS a ring. No fill, no evenodd, no cutout needed.
    var rotY = t * 0.4;
    var cx = w / 2, cy = h * 0.42;
    var cosT = Math.cos(RING_TILT);
    var sinT = Math.sin(RING_TILT);

    // Projected ellipse radii for the ring center circle
    var rx = RING_R;
    var ry = RING_R * cosT;
    // The projected band width differs: on the top surface it's foreshortened
    var bandProj = RING_BAND * cosT;
    // Band depth visible on the near (bottom) side
    var bandDepth = RING_BAND * 0.4 * sinT;

    // 1. Front rim: thick stroke on bottom arc, offset downward by bandDepth
    //    This gives the ring its 3D band thickness on the near side
    var frontGrad = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0);
    frontGrad.addColorStop(0, 'rgb(100,55,10)');
    frontGrad.addColorStop(0.3, 'rgb(190,130,30)');
    frontGrad.addColorStop(0.5, 'rgb(235,175,55)');
    frontGrad.addColorStop(0.7, 'rgb(190,130,30)');
    frontGrad.addColorStop(1, 'rgb(100,55,10)');
    ctx.strokeStyle = frontGrad;
    ctx.lineWidth = bandDepth;
    ctx.beginPath();
    ctx.ellipse(cx, cy + bandDepth * 0.5, rx, ry, 0, 0.05, Math.PI - 0.05);
    ctx.stroke();

    // 2. Top surface: thick stroked ellipse = annulus (naturally hollow!)
    var topGrad = ctx.createLinearGradient(cx, cy - ry - bandProj, cx, cy + ry + bandProj);
    topGrad.addColorStop(0, 'rgb(90,50,12)');
    topGrad.addColorStop(0.35, 'rgb(190,130,35)');
    topGrad.addColorStop(0.5, 'rgb(230,170,55)');
    topGrad.addColorStop(0.75, 'rgb(200,140,40)');
    topGrad.addColorStop(1, 'rgb(110,65,15)');
    ctx.strokeStyle = topGrad;
    ctx.lineWidth = bandProj;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 3. Outline edges (thin black lines)
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5 * dpr;
    // Outer top edge
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + bandProj * 0.5, ry + bandProj * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Inner top edge
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - bandProj * 0.5, ry - bandProj * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Specular highlight on outer edge
    ctx.strokeStyle = 'rgba(255,230,150,0.3)';
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + bandProj * 0.4, ry + bandProj * 0.4, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();

    // 5. Elvish text on the front-facing outer rim
    var ringFs = Math.round(11 * dpr);
    ctx.font = ringFs + 'px "Elven Common Speak","Courier New",monospace';
    var textRx = rx + bandProj * 0.3;
    var textRy = ry + bandProj * 0.3;

    for (var ti = 0; ti < TEXT_COUNT; ti++) {
      var angle = (ti / TEXT_COUNT) * Math.PI * 2 + rotY;
      var cosA = Math.cos(angle), sinA = Math.sin(angle);

      if (sinA < 0.05) continue;

      var sx = cx + textRx * cosA;
      var sy = cy + textRy * sinA + bandDepth * sinA * 0.5;

      var tAngle = Math.atan2(-textRy * cosA, -textRx * sinA) + Math.PI * 0.5;

      var glow = 0.4 + 0.6 * sinA;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(tAngle);
      ctx.globalAlpha = glow;
      ctx.fillStyle = 'rgb(' + Math.round(255 * glow) + ',' + Math.round(210 * glow) + ',' + Math.round(80 * glow) + ')';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.5;
      ctx.strokeText(RING_TEXT[ti % RING_TEXT.length], 0, 0);
      ctx.fillText(RING_TEXT[ti % RING_TEXT.length], 0, 0);
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    animFrame = requestAnimationFrame(render);
  }

  window.flameStart = function () {
    if (!canvas) init();
    resize();
    startTime = Date.now();
    if (!animFrame) animFrame = requestAnimationFrame(render);
  };

  window.flameStop = function () {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
  };

  window.flameResize = resize;
  window.flameToggleMode = function () {
    FLAME_MODE = FLAME_MODE === 'words' ? 'ascii' : 'words';
    return FLAME_MODE;
  };
  window.addEventListener('resize', function () { if (animFrame) resize(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
