// fx.js — WebGL effects overlay for namesake site
// Replaces Elm stars with a WebGL lava mode
(function () {
  'use strict';

  // ── State ──
  var activeMode = null;        // null | 'lava' | 'lava2'
  var mouseX = 0, mouseY = 0;   // raw pointer
  var smoothX = 0, smoothY = 0; // delayed pointer
  var flowX = 0, flowY = 0;     // smoothed pointer velocity
  var travelX = 0, travelY = 0;
  var travelVX = 0, travelVY = 0;
  var travelZ = 0;
  var travelVZ = 0;
  var pointerEnergy = 0;
  var pointerDown = false;
  var lastPointerTime = 0;
  var startTime = Date.now();
  var lastFrameTime = startTime;
  var gl, canvas, siteName;
  var programs = {};
  var animFrame = null;
  var buttonsWired = false;

  // ── Canvas setup ──
  canvas = document.getElementById('fx-canvas');
  siteName = document.getElementById('site-name');
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

  // ── Pointer tracking ──
  mouseX = window.innerWidth / 2;
  mouseY = window.innerHeight / 2;
  smoothX = mouseX;
  smoothY = mouseY;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function registerPointer(x, y) {
    var now = Date.now();
    if (lastPointerTime) {
      var dt = Math.max(16, now - lastPointerTime);
      var vx = (x - mouseX) / dt;
      var vy = (y - mouseY) / dt;
      var speed = Math.sqrt(vx * vx + vy * vy);
      pointerEnergy = Math.min(1.0, pointerEnergy + speed * 2.2 + (pointerDown ? 0.14 : 0.0));
      flowX += (vx - flowX) * 0.35;
      flowY += (vy - flowY) * 0.35;
    }
    mouseX = x;
    mouseY = y;
    lastPointerTime = now;
  }

  document.addEventListener('mousemove', function (e) {
    registerPointer(e.clientX, e.clientY);
  });
  document.addEventListener('mousedown', function (e) {
    pointerDown = true;
    registerPointer(e.clientX, e.clientY);
    pointerEnergy = 1.0;
  });
  document.addEventListener('mouseup', function () {
    pointerDown = false;
  });
  document.addEventListener('touchstart', function (e) {
    if (!e.touches || !e.touches.length) return;
    pointerDown = true;
    registerPointer(e.touches[0].clientX, e.touches[0].clientY);
    pointerEnergy = 1.0;
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!e.touches || !e.touches.length) return;
    registerPointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });
  document.addEventListener('touchend', function () {
    pointerDown = false;
  }, { passive: true });

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
    '  for(int i=0;i<4;i++){f+=w*snoise(p);p*=2.03;w*=0.49;}',
    '  return f;',
    '}'
  ].join('\n');

  var NOISE3D_GLSL = [
    'vec4 mod289v4(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute4(vec4 x){return mod289v4(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise3(vec3 v){',
    '  const vec2 C=vec2(1.0/6.0,1.0/3.0);',
    '  const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    '  vec3 i=floor(v+dot(v,C.yyy));',
    '  vec3 x0=v-i+dot(i,C.xxx);',
    '  vec3 g=step(x0.yzx,x0.xyz);',
    '  vec3 l=1.0-g;',
    '  vec3 i1=min(g.xyz,l.zxy);',
    '  vec3 i2=max(g.xyz,l.zxy);',
    '  vec3 x1=x0-i1+C.xxx;',
    '  vec3 x2=x0-i2+C.yyy;',
    '  vec3 x3=x0-D.yyy;',
    '  i=mod289v3(i);',
    '  vec4 p=permute4(permute4(permute4(',
    '    i.z+vec4(0.0,i1.z,i2.z,1.0))',
    '    +i.y+vec4(0.0,i1.y,i2.y,1.0))',
    '    +i.x+vec4(0.0,i1.x,i2.x,1.0));',
    '  float n_=0.142857142857;',
    '  vec3 ns=n_*D.wyz-D.xzx;',
    '  vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    '  vec4 x_=floor(j*ns.z);',
    '  vec4 y_=floor(j-7.0*x_);',
    '  vec4 x=x_*ns.x+ns.yyyy;',
    '  vec4 y=y_*ns.x+ns.yyyy;',
    '  vec4 h=1.0-abs(x)-abs(y);',
    '  vec4 b0=vec4(x.xy,y.xy);',
    '  vec4 b1=vec4(x.zw,y.zw);',
    '  vec4 s0=floor(b0)*2.0+1.0;',
    '  vec4 s1=floor(b1)*2.0+1.0;',
    '  vec4 sh=-step(h,vec4(0.0));',
    '  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;',
    '  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    '  vec3 p0=vec3(a0.xy,h.x);',
    '  vec3 p1=vec3(a0.zw,h.y);',
    '  vec3 p2=vec3(a1.xy,h.z);',
    '  vec3 p3=vec3(a1.zw,h.w);',
    '  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    '  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    '  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);',
    '  m=m*m;',
    '  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}'
  ].join('\n');

  var FBM3_GLSL = [
    'float fbm3(vec3 p){',
    '  float f=0.0; float w=0.5;',
    '  for(int i=0;i<4;i++){f+=w*snoise3(p);p*=2.03;w*=0.49;}',
    '  return f;',
    '}'
  ].join('\n');

  // ── Vertex shader (fullscreen quad) ──
  var VERT = 'attribute vec2 a_pos;void main(){gl_Position=vec4(a_pos,0.0,1.0);}';

  // ── Lava fragment shader ──
  var FRAG_LAVA = [
    'precision highp float;',
    'uniform float u_time;',
    'uniform vec2 u_res;',
    'uniform vec2 u_mouse;',
    'uniform vec2 u_travel;',
    'uniform float u_depth;',
    'uniform vec2 u_flow;',
    'uniform float u_energy;',
    NOISE_GLSL,
    FBM_GLSL,
    NOISE3D_GLSL,
    FBM3_GLSL,
    'vec3 hsv2rgb(vec3 c){',
    '  vec3 p=abs(fract(c.xxx+vec3(0.0,0.6666667,0.3333333))*6.0-3.0);',
    '  vec3 rgb=clamp(p-1.0,0.0,1.0);',
    '  return c.z*mix(vec3(1.0),rgb,c.y);',
    '}',
    'float krulerHue(float idx){',
    '  float wheel=idx/15.0;',
    '  float wobble=0.05*sin(idx*1.618)+0.025*cos(idx*0.73);',
    '  return fract(0.03+wheel+wobble);',
    '}',
    'vec3 krulerColor(float idx,float drift){',
    '  float hue=fract(krulerHue(idx)+drift);',
    '  float sat=0.72+0.18*sin(idx*0.91+1.2);',
    '  float val=0.82+0.12*cos(idx*1.07+0.4);',
    '  return hsv2rgb(vec3(hue,clamp(sat,0.56,0.96),clamp(val,0.62,1.0)));',
    '}',
    'vec3 layerColor(float layerIdx,float timeDrift){',
    '  float paletteIdx=floor(layerIdx/10.0);',
    '  float local=mod(layerIdx,10.0);',
    '  float familyPhase=timeDrift*0.12+paletteIdx*0.25;',
    '  float familyStep=floor(familyPhase);',
    '  float familyMix=smoothstep(0.10,0.90,fract(familyPhase));',
    '  float startA=mod(paletteIdx*4.0+familyStep*5.0,15.0);',
    '  float startB=mod(startA+5.0,15.0);',
    '  vec3 colorA=krulerColor(mod(startA+local,15.0),paletteIdx*0.01);',
    '  vec3 colorB=krulerColor(mod(startB+local,15.0),0.05+paletteIdx*0.01);',
    '  return mix(colorA,colorB,familyMix);',
    '}',
    '',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;',
    '  float aspect=u_res.x/u_res.y;',
    '  vec2 centered=uv-0.5;',
    '  vec2 p=vec2(centered.x*aspect,centered.y);',
    '  vec2 mouseUv=u_mouse/u_res;',
    '  vec2 steer=mouseUv-0.5;',
    '  vec2 flow=u_flow*vec2(aspect,1.0);',
    '',
    // Forward motion through the field. Pointer steers the trajectory in x/y.
    '  vec2 travel=u_travel*1.12 + flow*0.05 + steer*0.10;',
    '  float zoomPhase=fract(u_depth*0.10);',
    '  float zoom=mix(0.88,2.30,pow(zoomPhase,1.4));',
    '  vec2 world=p*zoom + travel;',
    '  float z=u_depth*1.65;',
    '  float t=u_time*0.018;',
    '',
    // Slice index is driven primarily by forward z progression, then distorted by the field.
    '  float field=fbm3(vec3(world*0.52,z*0.08+t))*1.15;',
    '  field+=fbm3(vec3(world*1.05+6.3,z*0.13-t))*0.42;',
    '  field+=fbm(world*2.0+vec2(z*0.04,-z*0.03))*0.18;',
    '  float sliceCoord=z + field*2.1;',
    '  float layerSpacing=1.15;',
    '  float band=max(sliceCoord/layerSpacing + 3.0,0.0);',
    '  float layerIdx=floor(band);',
    '  float layerPhase=fract(band);',
    '  float edge=min(layerPhase,1.0-layerPhase);',
    '  float seam=exp(-edge*110.0);',
    '  float frontFace=smoothstep(0.08,0.42,layerPhase);',
    '  float backShadow=smoothstep(0.58,0.96,layerPhase);',
    '  float cavityNoise=fbm3(vec3(world*1.35+13.7,z*0.11+t*0.4));',
    '  float cavityMask=smoothstep(0.48,0.72,cavityNoise) * frontFace * (1.0-backShadow);',
    '',
    '  vec3 bg=vec3(0.02,0.01,0.04);',
    '  vec3 color=layerColor(layerIdx,u_time*0.10);',
    '  color*=0.82 + 0.18*frontFace;',
    '  color-=vec3(0.10,0.05,0.12)*backShadow*0.55;',
    '  color+=vec3(1.0,0.97,0.86)*seam*(0.06+u_energy*0.03);',
    '  color=mix(color,bg,cavityMask*0.92);',
    '  color=mix(bg,color,0.985);',
    '  color*=1.0-0.16*length(centered*vec2(aspect,1.0));',
    '  gl_FragColor=vec4(color,1.0);',
    '}'
  ].join('\n');

  // ── Lava 2 fragment shader ──
  // Thresholded z-planes with holes revealing deeper planes over black.
  var FRAG_LAVA2 = [
    'precision highp float;',
    'uniform float u_time;',
    'uniform vec2 u_res;',
    'uniform vec2 u_mouse;',
    'uniform vec2 u_travel;',
    'uniform float u_depth;',
    'uniform vec2 u_flow;',
    'uniform float u_energy;',
    NOISE_GLSL,
    FBM_GLSL,
    NOISE3D_GLSL,
    FBM3_GLSL,
    '',
    'vec3 planeColor(float planeIdx){',
    '  float tone=mod(planeIdx,3.0);',
    '  if(tone<0.5) return vec3(0.18,0.07,0.30);',
    '  if(tone<1.5) return vec3(0.38,0.18,0.58);',
    '  return vec3(0.70,0.50,0.92);',
    '}',
    '',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;',
    '  float aspect=u_res.x/u_res.y;',
    '  vec2 centered=uv-0.5;',
    '  vec2 p=vec2(centered.x*aspect,centered.y);',
    '  vec2 mouseUv=u_mouse/u_res;',
    '  vec2 steer=mouseUv-0.5;',
    '  vec2 flow=u_flow*vec2(aspect,1.0);',
    '  vec2 travel=u_travel*0.85 + steer*0.06 + flow*0.04;',
    '  float cameraZ=u_depth*0.78;',
    '  float spacing=1.85;',
    '  float basePlane=floor(cameraZ/spacing);',
    '  vec3 color=vec3(0.0,0.0,0.0);',
    '  float accum=0.0;',
    '',
    '  for(int i=11;i>=0;i--){',
    '    float depthStep=float(i);',
    '    float plane=basePlane+depthStep;',
    '    float depthFade=1.0-depthStep*0.06;',
    '    vec2 sampleXY=(p*(1.0+depthStep*0.08)+travel*(1.0+depthStep*0.03));',
    '    float sampleZ=plane*0.18+u_time*0.012;',
    '    float density=fbm3(vec3(sampleXY*1.05,sampleZ))*0.85;',
    '    density+=fbm3(vec3(sampleXY*2.1+4.7,sampleZ*1.9))*0.25;',
    '    float threshold=0.18+0.06*sin(plane*0.73);',
    '    float solid=smoothstep(threshold,threshold+0.03,density);',
    '    float edge=smoothstep(threshold+0.01,threshold+0.04,density)-smoothstep(threshold+0.04,threshold+0.07,density);',
    '    vec3 planeCol=planeColor(plane)*depthFade;',
    '    planeCol+=vec3(0.16,0.10,0.24)*edge*(0.7+u_energy*0.2);',
    '    color=mix(color,planeCol,solid*(1.0-accum));',
    '    accum+=solid*(1.0-accum);',
    '  }',
    '',
    '  color*=1.0-0.12*length(centered*vec2(aspect,1.0));',
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
      u_mouse: gl.getUniformLocation(p, 'u_mouse'),
      u_travel: gl.getUniformLocation(p, 'u_travel'),
      u_depth: gl.getUniformLocation(p, 'u_depth'),
      u_flow: gl.getUniformLocation(p, 'u_flow'),
      u_energy: gl.getUniformLocation(p, 'u_energy')
    };
  }

  programs.lava = createProgram('lava', FRAG_LAVA);
  programs.lava2 = createProgram('lava2', FRAG_LAVA2);

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
    var now = Date.now();
    var t = (now - startTime) / 1000.0;
    var dt = Math.min(0.05, (now - lastFrameTime) / 1000.0 || 0.016);
    var dpr = window.devicePixelRatio || 1;
    lastFrameTime = now;

    // Pointer position steers the trajectory. Forward motion is constant with extra push on press.
    smoothX += (mouseX - smoothX) * 0.014;
    smoothY += (mouseY - smoothY) * 0.014;
    flowX *= 0.78;
    flowY *= 0.78;
    pointerEnergy *= pointerDown ? 0.976 : 0.962;

    var nx = (smoothX / window.innerWidth) - 0.5;
    var ny = 0.5 - (smoothY / window.innerHeight);
    var desiredVX = nx * 0.18;
    var desiredVY = ny * 0.14;
    var desiredVZ = 0.38 + (pointerDown ? 0.10 : 0.0) + pointerEnergy * 0.05;
    travelVX += (desiredVX - travelVX) * Math.min(1, dt * 0.85);
    travelVY += (desiredVY - travelVY) * Math.min(1, dt * 0.85);
    travelVZ += (desiredVZ - travelVZ) * Math.min(1, dt * 0.75);
    travelX += travelVX * dt;
    travelY += travelVY * dt;
    travelZ += travelVZ * dt;

    gl.useProgram(prog.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(prog.a_pos);
    gl.vertexAttribPointer(prog.a_pos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(prog.u_time, t);
    gl.uniform2f(prog.u_res, canvas.width, canvas.height);
    gl.uniform2f(prog.u_mouse, smoothX * dpr, canvas.height - smoothY * dpr);
    gl.uniform2f(prog.u_travel, travelX, travelY);
    gl.uniform1f(prog.u_depth, travelZ);
    gl.uniform2f(prog.u_flow, clamp(flowX, -0.35, 0.35), clamp(-flowY, -0.35, 0.35));
    gl.uniform1f(prog.u_energy, clamp(pointerEnergy, 0.0, 1.0));

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    animFrame = requestAnimationFrame(render);
  }

  // ── Mode switching + URL hash routing ──
  var MODE_NAMES = ['drag', 'perspective', 'stars', 'rainbow', 'spinners'];

  function setHash(name) {
    history.replaceState(null, '', '#' + name);
  }

  function activate(mode) {
    activeMode = mode;
    canvas.classList.add('fx-active');
    document.body.classList.add('lava-active');
    if (siteName) siteName.classList.add('is-active');
    setHash(mode);
    if (!animFrame) animFrame = requestAnimationFrame(render);
  }

  function deactivate(elmIndex) {
    activeMode = null;
    canvas.classList.remove('fx-active');
    document.body.classList.remove('lava-active');
    if (siteName) siteName.classList.remove('is-active');
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
    if (elmIndex !== undefined && MODE_NAMES[elmIndex]) {
      setHash(MODE_NAMES[elmIndex]);
    }
  }

  // ── Wire up Elm buttons + inject lava button ──
  function wireButtons() {
    var bgDiv = document.getElementById('background-buttons');
    if (!bgDiv) return false;
    var buttons = bgDiv.querySelectorAll('button');
    if (buttons.length < 5) return false;

    if (buttonsWired) return true;
    buttonsWired = true;

    console.log('fx.js: wiring', buttons.length, 'Elm buttons');

    buttons.forEach(function (btn, i) {
      btn.addEventListener('mousedown', function () {
        deactivate(i);
      });
    });

    var lavaBtn = document.createElement('button');
    lavaBtn.className = 'icon-button';
    lavaBtn.title = 'Lava';
    lavaBtn.innerHTML = '<img src="assets/lava-icon.svg" alt="Lava">';
    lavaBtn.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      activate('lava');
    });
    bgDiv.appendChild(lavaBtn);

    var lava2Btn = document.createElement('button');
    lava2Btn.className = 'icon-button';
    lava2Btn.title = 'Lava 2';
    lava2Btn.innerHTML = '<img src="assets/overlap.png" alt="Lava 2">';
    lava2Btn.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      activate('lava2');
    });
    bgDiv.appendChild(lava2Btn);
    console.log('fx.js: lava button injected');

    applyHash();
    return true;
  }

  function applyHash() {
    var hash = location.hash.replace('#', '');
    if (!hash) return;
    if (hash === 'lava' || hash === 'lava2') {
      activate(hash);
    } else {
      var idx = MODE_NAMES.indexOf(hash);
      if (idx >= 0) {
        var bgDiv = document.getElementById('background-buttons');
        if (bgDiv) {
          var btns = bgDiv.querySelectorAll('button');
          if (btns[idx]) {
            var evt = new MouseEvent('mousedown', { bubbles: true });
            btns[idx].dispatchEvent(evt);
          }
        }
      }
    }
  }

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

  waitForElm();
})();
