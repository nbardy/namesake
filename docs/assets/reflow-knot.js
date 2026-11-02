// reflow-knot.js — a slowly turning, satin-violet trefoil.
// Activated/deactivated by fx.js as the 'knot' mode.
(function () {
  'use strict';

  var threeCanvas = null;
  var threeRenderer = null;
  var threeScene = null;
  var threeCamera = null;
  var torusKnot = null;
  var animFrame = null;
  var active = false;
  var loading = false;
  var elapsed = 0;
  var previousTime = 0;
  var radius = 20;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function waitForThree(cb) {
    if (window.THREE) { cb(); return; }
    if (loading) return;
    loading = true;
    var script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    script.onload = function () { loading = false; cb(); };
    script.onerror = function () {
      loading = false;
      console.warn('Knot could not load its renderer.');
      if (active) window.dispatchEvent(new Event('knoterror'));
    };
    document.head.appendChild(script);
  }

  // Fit the entire turning silhouette using the narrower field of view.
  function resize() {
    if (!threeRenderer || !threeCamera) return;
    var width = window.innerWidth;
    var height = window.innerHeight;
    threeCamera.aspect = width / height;
    var verticalFov = threeCamera.fov * Math.PI / 180;
    var horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * threeCamera.aspect);
    var fieldOfView = Math.min(verticalFov, horizontalFov);
    threeCamera.position.z = radius * 1.16 / Math.sin(fieldOfView / 2);
    threeCamera.far = Math.max(200, threeCamera.position.z + radius * 3);
    threeCamera.updateProjectionMatrix();
    // A bounded backing store keeps high-density phones from rendering 9x pixels.
    threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    threeRenderer.setSize(width, height);
  }

  function buildScene() {
    var THREE = window.THREE;
    threeCanvas = document.getElementById('knot-canvas');
    if (!threeCanvas) return;

    try {
      threeRenderer = new THREE.WebGLRenderer({
        canvas: threeCanvas,
        antialias: true,
        alpha: false,
        powerPreference: 'low-power'
      });
    } catch (error) {
      console.warn('Knot could not start WebGL.');
      if (active) window.dispatchEvent(new Event('knoterror'));
      return;
    }
    threeRenderer.setClearColor(0x050505, 1);
    threeRenderer.outputEncoding = THREE.sRGBEncoding;
    threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    threeRenderer.toneMappingExposure = 1.1;

    threeScene = new THREE.Scene();
    threeCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);

    // Broad lavender key, restrained blue fill, and a rear violet rim.
    // The untextured surface makes the over/under crossings easy to read.
    threeScene.add(new THREE.AmbientLight(0x8d92c9, 0.24));
    var key = new THREE.DirectionalLight(0xe5d9ff, 1.75);
    key.position.set(-18, 24, 30);
    threeScene.add(key);
    var fill = new THREE.DirectionalLight(0x658aff, 0.55);
    fill.position.set(20, -12, 12);
    threeScene.add(fill);
    var rim = new THREE.DirectionalLight(0xa36bff, 1.6);
    rim.position.set(10, 8, -20);
    threeScene.add(rim);

    var material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x6433b8).convertSRGBToLinear(),
      roughness: 0.27,
      metalness: 0.5,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25
    });
    var geometry = new THREE.TorusKnotGeometry(12, 2.5, 320, 40);
    geometry.computeBoundingSphere();
    radius = geometry.boundingSphere.radius;
    torusKnot = new THREE.Mesh(geometry, material);
    torusKnot.rotation.set(0.3, 0.35, 0.15);
    threeScene.add(torusKnot);
    resize();
  }

  function render(time) {
    animFrame = null;
    if (!active || !threeRenderer || !torusKnot) return;
    if (previousTime) elapsed += Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (!reducedMotion.matches) {
      torusKnot.rotation.x = 0.3 + Math.sin(elapsed * 0.12) * 0.2;
      torusKnot.rotation.y = 0.35 + elapsed * 0.11;
      torusKnot.rotation.z = 0.15 + Math.sin(elapsed * 0.08) * 0.12;
    }
    threeRenderer.render(threeScene, threeCamera);
    if (!reducedMotion.matches) animFrame = requestAnimationFrame(render);
  }

  function startRendering() {
    if (!active) return;
    if (!threeRenderer) buildScene();
    if (!threeRenderer) return;
    resize();
    threeCanvas.style.opacity = '1';
    threeCanvas.classList.add('fx-active');
    previousTime = 0;
    if (!animFrame) animFrame = requestAnimationFrame(render);
  }

  window.knotStart = function () {
    active = true;
    waitForThree(startRendering);
  };

  window.knotStop = function () {
    active = false;
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = null;
    previousTime = 0;
    if (threeCanvas) {
      threeCanvas.style.opacity = '0';
      threeCanvas.classList.remove('fx-active');
    }
  };

  window.knotResize = function () {
    resize();
    if (active && reducedMotion.matches && threeRenderer) {
      threeRenderer.render(threeScene, threeCamera);
    }
  };

  window.addEventListener('resize', function () {
    if (active) window.knotResize();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (animFrame) cancelAnimationFrame(animFrame);
      animFrame = null;
      previousTime = 0;
    } else if (active) {
      startRendering();
    }
  });
  reducedMotion.addEventListener('change', function () {
    if (active) startRendering();
  });
})();
