// fx.js — WebGL effects overlay for namesake site
// Replaces Elm stars with FBM starfield, adds lava lamp mode
(function () {
  'use strict';

  // ── State ──
  var activeMode = null;        // null | 'stars' | 'lava'
  var mouseX = 0, mouseY = 0;  // raw mouse
  var smoothX = 0, smoothY = 0; // delayed mouse (for lava)
  var startTime = Date.now();
  var gl, canvas;
  var programs = {};
  var animFrame = null;
  var buttonsWired = false;

  // ── Canvas setup ──
  canvas = document.getElementById('fx-canvas');
  if (!canvas) { console.warn('fx.js: no #fx-canvas'); return; }
  gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) { console.warn('fx.js: no WebGL'); return; }

  function resize() {
    var dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    gl.viewport(0, 0, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Mouse tracking ──
  document.addEventListener('mousemove', function (e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  // ── GLSL noise primitives ──
  var NOISE_GLSL = [
    'vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec2 mod289v2(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec3 permute(vec3 x){return mod289v3(((x*34.0)+1.0)*x);}',
    'float snoise(vec2 v){',
    '  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);',
    '  vec2 i=floor(v+dot(v,C.yy));',
    '  vec2 x0=v-i+dot(i,C.xx);',
    '  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);',
    '  vec4 x12=x0.xyxy+C.xxzz;',
    '  x12.xy-=i1;',
    '  i=mod289v2(i);',
    '  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));',
    '  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);',
    '  m=m*m;m=m*m;',
    '  vec3 x=2.0*fract(p*C.www)-1.0;',
    '  vec3 h=abs(x)-0.5;',
    '  vec3 ox=floor(x+0.5);',
    '  vec3 a0=x-ox;',
    '  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);',
    '  vec3 g;',
    '  g.x=a0.x*x0.x+h.x*x0.y;',
    '  g.yz=a0.yz*x12.xz+h.yz*x12.yw;',
    '  return 130.0*dot(m,g);',
    '}'
  ].join('\n');

  var FBM_GLSL = [
    'float fbm(vec2 p){',
    '  float f=0.0; float w=0.5;',
    '  for(int i=0;i<3;i++){f+=w*snoise(p);p*=2.03;w*=0.49;}',
    '  return f;',
    '}'
  ].join('\n');

  // ── Vertex shader (fullscreen quad) ──
  var VERT = 'attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}';

  // ── Lava lamp fragment shader ──
  // Perlin height field centered on mouse. Three z-height slices
  // like topographic contours of a mountain. Radial coords.
  // Slice 1 (bottom, widest):  z in [0.2, 0.4]
  // Slice 2 (middle):          z in [0.5, 0.6]
  // Slice 3 (top, smallest):   z in [0.8, 0.95]
  var FRAG_LAVA = [
    'precision highp float;',
    'uniform float u_time;',
    'uniform vec2 u_res;',
    'uniform vec2 u_mouse;',
    NOISE_GLSL,
    FBM_GLSL,
    '',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;',
    '  float aspect=u_res.x/u_res.y;',
    '',
    // radial coords from mouse
    '  vec2 mUV=u_mouse/u_res;',
    '  vec2 p=vec2(uv.x*aspect,uv.y);',
    '  vec2 m=vec2(mUV.x*aspect,mUV.y);',
    '  vec2 diff=p-m;',
    '  float dist=length(diff);',
    '  float angle=atan(diff.y,diff.x);',
    '',
    // Height field: radial falloff * (1 + noise) gives a noisy mountain
    // FBM sampled in radial coords so the shape is organic
    '  float noise=fbm(vec2(angle*0.8+u_time*0.02,dist*2.0+u_time*0.015));',
    // mountain shape: peaks at mouse (dist=0), decays outward
    // noise warps the slope so contours are blobby, not circular
    '  float h=(1.0-dist*1.8)+noise*0.35;',
    '  h=clamp(h,0.0,1.0);',
    '',
    // base color
    '  vec3 base=vec3(0.04,0.01,0.07);',
    '',
    // Slice 1 (bottom, widest): z in [0.2, 0.4]
    '  float s1=smoothstep(0.18,0.22,h)*smoothstep(0.42,0.38,h);',
    '  vec3 col1=vec3(0.45,0.04,0.02);',
    '',
    // Slice 2 (middle): z in [0.5, 0.6]
    '  float s2=smoothstep(0.48,0.52,h)*smoothstep(0.62,0.58,h);',
    '  vec3 col2=vec3(0.85,0.2,0.04);',
    '',
    // Slice 3 (top, smallest): z in [0.8, 0.95]
    '  float s3=smoothstep(0.78,0.82,h)*smoothstep(0.97,0.93,h);',
    '  vec3 col3=vec3(1.0,0.6,0.15);',
    '',
    // Also fill the interior of each slice for the lava-lamp look
    // Bottom fill: anything above 0.2
    '  float fill1=smoothstep(0.18,0.22,h);',
    '  vec3 fillCol1=vec3(0.25,0.02,0.01);',
    // Middle fill: anything above 0.5
    '  float fill2=smoothstep(0.48,0.52,h);',
    '  vec3 fillCol2=vec3(0.55,0.08,0.02);',
    // Top fill: anything above 0.8
    '  float fill3=smoothstep(0.78,0.82,h);',
    '  vec3 fillCol3=vec3(0.8,0.3,0.06);',
    '',
    // compose: fills first, then contour outlines on top
    '  vec3 color=base;',
    '  color=mix(color,fillCol1,fill1);',
    '  color=mix(color,fillCol2,fill2);',
    '  color=mix(color,fillCol3,fill3);',
    // contour lines are brighter edges of each slice
    '  color=mix(color,col1,s1);',
    '  color=mix(color,col2,s2);',
    '  color=mix(color,col3,s3);',
    '',
    '  color*=1.0-0.3*length(uv-0.5);',
    '  gl_FragColor=vec4(color,1.0);',
    '}'
  ].join('\n');

  // ── Shader compilation ──
  function compileShader(src, type) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('fx.js shader error:', gl.getShaderInfoLog(s));
      console.error('Source:\n', src);
      return null;
    }
    return s;
  }

  function createProgram(name, fragSrc) {
    var vs = compileShader(VERT, gl.VERTEX_SHADER);
    var fs = compileShader(fragSrc, gl.FRAGMENT_SHADER);
    if (!vs || !fs) { console.error('fx.js: failed to compile', name); return null; }
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('fx.js link error:', name, gl.getProgramInfoLog(p));
      return null;
    }
    console.log('fx.js: compiled', name, 'OK');
    return {
      program: p,
      a_pos: gl.getAttribLocation(p, 'a_pos'),
      u_time: gl.getUniformLocation(p, 'u_time'),
      u_res: gl.getUniformLocation(p, 'u_res'),
      u_mouse: gl.getUniformLocation(p, 'u_mouse')
    };
  }

  programs.lava = createProgram('lava', FRAG_LAVA);

  // fullscreen quad
  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  // ── Render loop ──
  function render() {
    if (!activeMode || !programs[activeMode]) {
      animFrame = null;
      return;
    }

    var prog = programs[activeMode];
    var t = (Date.now() - startTime) / 1000.0;
    var dpr = window.devicePixelRatio || 1;

    // smooth mouse (exponential easing)
    var ease = activeMode === 'lava' ? 0.03 : 0.15;
    smoothX += (mouseX - smoothX) * ease;
    smoothY += (mouseY - smoothY) * ease;

    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(prog.a_pos);
    gl.vertexAttribPointer(prog.a_pos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(prog.u_time, t);
    gl.uniform2f(prog.u_res, canvas.width, canvas.height);
    gl.uniform2f(prog.u_mouse, smoothX * dpr, canvas.height - smoothY * dpr);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    animFrame = requestAnimationFrame(render);
  }

  // ── Mode switching + URL hash routing ──
  // Elm modes: #drag, #perspective, #stars, #rainbow, #spinners
  // WebGL modes: #lava
  var MODE_NAMES = ['drag', 'perspective', 'stars', 'rainbow', 'spinners'];

  function setHash(name) {
    history.replaceState(null, '', '#' + name);
  }

  function activate(mode) {
    activeMode = mode;
    canvas.classList.add('fx-active');
    setHash(mode);
    if (!animFrame) animFrame = requestAnimationFrame(render);
  }

  function deactivate(elmIndex) {
    activeMode = null;
    canvas.classList.remove('fx-active');
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    if (elmIndex !== undefined && MODE_NAMES[elmIndex]) {
      setHash(MODE_NAMES[elmIndex]);
    }
  }

  // ── Wire up Elm buttons + inject lava button ──
  // Elm renders asynchronously, so we poll until #background-buttons has children
  function wireButtons() {
    var bgDiv = document.getElementById('background-buttons');
    if (!bgDiv) return false;
    var buttons = bgDiv.querySelectorAll('button');
    if (buttons.length < 5) return false;

    // Already wired
    if (buttonsWired) return true;
    buttonsWired = true;

    console.log('fx.js: wiring', buttons.length, 'Elm buttons');

    // When any Elm button is clicked, deactivate WebGL + set hash
    buttons.forEach(function (btn, i) {
      btn.addEventListener('mousedown', function () {
        deactivate(i);
      });
    });

    // Inject lava lamp button — uses same .icon-button class as Elm buttons
    var lavaBtn = document.createElement('button');
    lavaBtn.className = 'icon-button';
    lavaBtn.innerHTML = '<img src="assets/lava-icon.svg" alt="Lava">';
    lavaBtn.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      activate('lava');
    });
    bgDiv.appendChild(lavaBtn);
    console.log('fx.js: lava button injected');

    // Route from URL hash on load
    applyHash();

    return true;
  }

  // Read hash and activate the right mode
  function applyHash() {
    var hash = location.hash.replace('#', '');
    if (!hash) return;
    if (hash === 'lava') {
      activate('lava');
    } else {
      // For Elm modes, simulate clicking the right button
      var idx = MODE_NAMES.indexOf(hash);
      if (idx >= 0) {
        var bgDiv = document.getElementById('background-buttons');
        if (bgDiv) {
          var btns = bgDiv.querySelectorAll('button');
          if (btns[idx]) {
            // Dispatch mousedown to trigger Elm's handler
            var evt = new MouseEvent('mousedown', { bubbles: true });
            btns[idx].dispatchEvent(evt);
          }
        }
      }
    }
  }

  // Poll for Elm buttons (they render async after fullscreen() call)
  function waitForElm() {
    if (wireButtons()) return;
    var attempts = 0;
    var interval = setInterval(function () {
      attempts++;
      if (wireButtons() || attempts > 100) {
        clearInterval(interval);
        if (attempts > 100) console.warn('fx.js: gave up waiting for Elm buttons');
      }
    }, 50);
  }

  // Start polling immediately
  waitForElm();
})();
