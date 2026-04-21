// reflow-knot.js — Three.js torus knot with dynamic text reflow texture
// Text is rendered to a hidden 2D canvas, mapped onto a TorusKnotGeometry.
// Activated/deactivated by fx.js as the 'knot' mode.
(function () {
  'use strict';

  var threeCanvas = null;   // WebGL canvas
  var threeRenderer = null;
  var threeScene = null;
  var threeCamera = null;
  var torusKnot = null;
  var textCanvas = null;    // hidden 2D canvas for text reflow
  var textCtx = null;
  var texture = null;
  var animFrame = null;
  var startTime = 0;

  var ELVISH = 'Ash nazg durbatuluk ash nazg gimbatul ash nazg thrakatuluk agh burzum-ishi krimpatul ';
  var LOREM = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat ';
  var TEXT_CONTENT = '';
  while (TEXT_CONTENT.length < 2000) TEXT_CONTENT += ELVISH + LOREM;

  // Pre-load font
  if (document.fonts) {
    var ff = new FontFace('Elven Common Speak', "url('assets/fonts/Elvencommonspeak-0WXz.ttf')");
    ff.load().then(function (f) { document.fonts.add(f); }).catch(function () {});
  }

  // ── Wait for Three.js to load ──
  function waitForThree(cb) {
    if (window.THREE) { cb(); return; }
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = cb;
    script.onerror = function () { console.warn('reflow-knot: Three.js failed to load'); };
    document.head.appendChild(script);
  }

  // ── Build the hidden text reflow canvas ──
  function buildTextCanvas() {
    textCanvas = document.createElement('canvas');
    textCanvas.width = 512;
    textCanvas.height = 1024;
    textCtx = textCanvas.getContext('2d');
    reflowText();
  }

  function reflowText() {
    var w = textCanvas.width, h = textCanvas.height;
    textCtx.fillStyle = '#000000';
    textCtx.fillRect(0, 0, w, h);

    textCtx.fillStyle = '#cc88ff'; // Purple-ish Elvish text
    textCtx.font = 'bold 28px "Elven Common Speak", monospace';
    textCtx.textAlign = 'left';
    textCtx.textBaseline = 'top';

    var words = TEXT_CONTENT.split(' ');
    var line = '';
    var y = 16;
    var lineHeight = 36;
    var margin = 16;

    for (var i = 0; i < words.length; i++) {
      var testLine = line + words[i] + ' ';
      var metrics = textCtx.measureText(testLine);
      if (metrics.width > (w - margin * 2) && i > 0) {
        textCtx.fillText(line, margin, y);
        line = words[i] + ' ';
        y += lineHeight;
        if (y > h - lineHeight) break; // filled the canvas
      } else {
        line = testLine;
      }
    }
    textCtx.fillText(line, margin, y);

    // Tile vertically to fill
    var blockH = y + lineHeight + 16;
    var cy = blockH;
    while (cy < h) {
      textCtx.drawImage(textCanvas, 0, 0, w, blockH, 0, cy, w, blockH);
      cy += blockH;
    }
  }

  // ── Build Three.js scene ──
  function buildScene() {
    var THREE = window.THREE;

    threeCanvas = document.getElementById('knot-canvas');
    if (!threeCanvas) return;

    threeRenderer = new THREE.WebGLRenderer({
      canvas: threeCanvas,
      antialias: true,
      alpha: true
    });
    threeRenderer.setPixelRatio(window.devicePixelRatio || 1);
    threeRenderer.setSize(window.innerWidth, window.innerHeight);
    threeRenderer.setClearColor(0x050505, 1);

    threeScene = new THREE.Scene();

    threeCamera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 0.1, 1000
    );
    threeCamera.position.z = 40;

    // Lighting
    var ambient = new THREE.AmbientLight(0xffffff, 0.5);
    threeScene.add(ambient);

    var point1 = new THREE.PointLight(0xcc88ff, 1.2); // purple
    point1.position.set(20, 20, 30);
    threeScene.add(point1);

    var point2 = new THREE.PointLight(0x4488ff, 0.8); // blue accent
    point2.position.set(-15, -10, 20);
    threeScene.add(point2);

    // Text texture
    buildTextCanvas();
    texture = new THREE.CanvasTexture(textCanvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;

    var material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.25,
      metalness: 0.85,
      emissive: new THREE.Color(0x220044),
      emissiveIntensity: 0.15
    });

    var geometry = new THREE.TorusKnotGeometry(12, 3, 200, 32);
    torusKnot = new THREE.Mesh(geometry, material);
    threeScene.add(torusKnot);
  }

  // ── Render loop ──
  function render() {
    if (!threeRenderer || !torusKnot) { animFrame = null; return; }

    var t = (Date.now() - startTime) / 1000;

    // Slow tumble
    torusKnot.rotation.x += 0.003;
    torusKnot.rotation.y += 0.004;

    // Scroll texture — ticker tape effect
    texture.offset.x -= 0.003;

    threeRenderer.render(threeScene, threeCamera);
    animFrame = requestAnimationFrame(render);
  }

  // ── Public API ──
  window.knotStart = function () {
    waitForThree(function () {
      if (!threeRenderer) buildScene();
      if (threeCanvas) {
        threeCanvas.style.opacity = '1';
        threeCanvas.classList.add('fx-active');
      }
      startTime = Date.now();
      if (!animFrame) animFrame = requestAnimationFrame(render);
    });
  };

  window.knotStop = function () {
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    if (threeCanvas) {
      threeCanvas.style.opacity = '0';
      threeCanvas.classList.remove('fx-active');
    }
  };

  window.knotResize = function () {
    if (threeRenderer && threeCamera) {
      threeCamera.aspect = window.innerWidth / window.innerHeight;
      threeCamera.updateProjectionMatrix();
      threeRenderer.setSize(window.innerWidth, window.innerHeight);
    }
  };

  window.addEventListener('resize', function () {
    if (animFrame) window.knotResize();
  });
})();
