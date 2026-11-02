// fx.js — WebGL/WebGPU effects overlay for namesake site
(function () {
  'use strict';

  // Only finished effects are reachable from the public site.
  var PUBLISHED_EFFECTS = ['knot'];

  // ── State ──
  var activeMode = null;        // null | 'lava' | 'lava2' | 'lava3' | 'pretext' | 'flame' | 'knot'
  var mouseX = 0, mouseY = 0;   // raw pointer
  var smoothX = 0, smoothY = 0; // delayed pointer
  var flowX = 0, flowY = 0;     // smoothed pointer velocity
  var travelX = 0, travelY = 0;
  var travelVX = 0, travelVY = 0;
  var travelZ = 0;
  var travelVZ = 0;
  var viewForwardX = 0, viewForwardY = 0, viewForwardZ = 1;
  var viewUpX = 0, viewUpY = 1, viewUpZ = 0;
  var bankAngle = 0;
  var pointerEnergy = 0;
  var pointerDown = false;
  var lastPointerTime = 0;
  var startTime = Date.now();
  var lastFrameTime = startTime;
  var gl, canvas, gpuCanvas, siteName;
  var programs = {};
  var gpuRenderer = null;
  var gpuInitPromise = null;
  var animFrame = null;
  var buttonsWired = false;

  // ── Canvas setup ──
  canvas = document.getElementById('fx-canvas');
  gpuCanvas = document.getElementById('fx-canvas-gpu');
  siteName = document.getElementById('site-name');
  if (!canvas && !gpuCanvas) { console.warn('fx.js: no effect canvas'); return; }
  if (canvas && PUBLISHED_EFFECTS.some(isWebGlMode)) {
    gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) console.warn('fx.js: no WebGL');
  }

  function resizeSurface(target, renderScale, dprCap) {
    if (!target) return;
    var dpr = Math.min(window.devicePixelRatio || 1, dprCap || 4);
    var scale = renderScale || 1;
    target.width = Math.max(1, Math.floor(window.innerWidth * dpr * scale));
    target.height = Math.max(1, Math.floor(window.innerHeight * dpr * scale));
    target.style.width = window.innerWidth + 'px';
    target.style.height = window.innerHeight + 'px';
  }

  function resize() {
    resizeSurface(canvas, 0.88, 1.25);
    resizeSurface(gpuCanvas, 0.82, 1.25);
    if (gl && canvas) {
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    if (gpuRenderer && gpuCanvas) {
      gpuRenderer.resize(gpuCanvas.width, gpuCanvas.height);
    }
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

  function dot3(ax, ay, az, bx, by, bz) {
    return ax * bx + ay * by + az * bz;
  }

  function cross3(ax, ay, az, bx, by, bz) {
    return [
      ay * bz - az * by,
      az * bx - ax * bz,
      ax * by - ay * bx
    ];
  }

  function normalize3(x, y, z, fallback) {
    var len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-5) return fallback ? fallback.slice() : [0, 0, 1];
    return [x / len, y / len, z / len];
  }

  function rotateAroundAxis(vec, axis, angle) {
    var cosA = Math.cos(angle);
    var sinA = Math.sin(angle);
    var dotVA = dot3(vec[0], vec[1], vec[2], axis[0], axis[1], axis[2]);
    var crossVA = cross3(axis[0], axis[1], axis[2], vec[0], vec[1], vec[2]);
    return [
      vec[0] * cosA + crossVA[0] * sinA + axis[0] * dotVA * (1 - cosA),
      vec[1] * cosA + crossVA[1] * sinA + axis[1] * dotVA * (1 - cosA),
      vec[2] * cosA + crossVA[2] * sinA + axis[2] * dotVA * (1 - cosA)
    ];
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
    '  vec2 steer=(mouseUv-0.5)*vec2(aspect,1.0);',
    '  vec2 flow=u_flow*vec2(aspect,1.0);',
    '  vec2 cameraXY=u_travel*0.96;',
    '  vec2 look=steer*0.46 + flow*0.08;',
    '  vec3 rayDir=normalize(vec3(p+look,1.20));',
    '  float cameraZ=u_depth*1.12;',
    '  float spacing=1.85;',
    '  float basePlane=floor(cameraZ/spacing);',
    '  vec3 color=vec3(0.0,0.0,0.0);',
    '  float accum=0.0;',
    '',
    '  for(int i=0;i<18;i++){',
    '    float plane=basePlane+1.0+float(i);',
    '    float planeZ=plane*spacing;',
    '    float planeDist=planeZ-cameraZ;',
    '    float depthNorm=clamp(float(i)/17.0,0.0,1.0);',
    '    float nearFade=smoothstep(0.02,0.28,planeDist);',
    '    vec2 hit=cameraXY + (rayDir.xy/max(rayDir.z,0.001))*planeDist;',
    '    float density=fbm3(vec3(hit*0.58,planeZ*0.16))*0.82;',
    '    density+=fbm3(vec3(hit*1.24+4.7,planeZ*0.31))*0.24;',
    '    density+=fbm(hit*1.10+vec2(plane*0.23,plane*0.11))*0.12;',
    '    float threshold=0.20+0.06*sin(plane*0.73);',
    '    float solid=smoothstep(threshold,threshold+0.035,density);',
    '    solid*=nearFade;',
    '    float edge=smoothstep(threshold+0.01,threshold+0.05,density)-smoothstep(threshold+0.05,threshold+0.09,density);',
    '    vec3 planeCol=planeColor(plane)*(1.0-depthNorm*0.52);',
    '    planeCol+=vec3(0.16,0.10,0.24)*edge*(0.8+u_energy*0.2);',
    '    planeCol+=vec3(0.05,0.02,0.08)*(1.0-depthNorm)*(1.0-solid)*0.2;',
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
    if (!gl) return null;
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
    if (!gl) return null;
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
  var quad = null;
  if (gl) {
    quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  }

  function createLava3Renderer(target) {
    if (!target || !navigator.gpu) return Promise.resolve(null);

    var atlasCols = 8;
    var atlasRows = 8;
    var sliceCount = atlasCols * atlasRows;
    var sliceSize = 192;
    var planeCount = 14;
    var spacing = 2.15;
    var sliceScale = 0.095;
    var format = navigator.gpu.getPreferredCanvasFormat();
    var computeParamsData = new Float32Array([
      sliceSize, atlasCols, atlasRows, sliceCount,
      8.0, 17.0, 0.17, 0.0
    ]);
    var renderParamsData = new Float32Array(20);

    var computeShader = [
      'struct BakeParams {',
      '  header0: vec4<f32>,',
      '  header1: vec4<f32>,',
      '};',
      '@group(0) @binding(0) var atlasTex: texture_storage_2d<rgba8unorm, write>;',
      '@group(0) @binding(1) var<uniform> params: BakeParams;',
      '',
      'fn hash21(p: vec2<f32>) -> f32 {',
      '  let h = dot(p, vec2<f32>(127.1, 311.7));',
      '  return fract(sin(h) * 43758.5453123);',
      '}',
      '',
      'fn wrap2(p: vec2<f32>, period: f32) -> vec2<f32> {',
      '  return p - floor(p / period) * period;',
      '}',
      '',
      'fn tileNoise(p: vec2<f32>, period: f32) -> f32 {',
      '  let i = floor(p);',
      '  let f = fract(p);',
      '  let a = hash21(wrap2(i, period));',
      '  let b = hash21(wrap2(i + vec2<f32>(1.0, 0.0), period));',
      '  let c = hash21(wrap2(i + vec2<f32>(0.0, 1.0), period));',
      '  let d = hash21(wrap2(i + vec2<f32>(1.0, 1.0), period));',
      '  let u = f * f * (vec2<f32>(3.0, 3.0) - 2.0 * f);',
      '  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);',
      '}',
      '',
      'fn tileFbm(p: vec2<f32>, period: f32, seed: f32) -> f32 {',
      '  var q = p + vec2<f32>(seed * 0.37, -seed * 0.21);',
      '  var per = period;',
      '  var amp = 0.5;',
      '  var total = 0.0;',
      '  for (var i = 0; i < 4; i = i + 1) {',
      '    total = total + amp * tileNoise(q, per);',
      '    q = q * 2.03 + vec2<f32>(11.7, 3.1);',
      '    per = per * 2.0;',
      '    amp = amp * 0.5;',
      '  }',
      '  return total;',
      '}',
      '',
      '@compute @workgroup_size(8, 8, 1)',
      'fn main(@builtin(global_invocation_id) gid: vec3<u32>) {',
      '  let sliceSize = u32(params.header0.x);',
      '  let atlasCols = u32(params.header0.y);',
      '  let atlasRows = u32(params.header0.z);',
      '  let sliceCount = u32(params.header0.w);',
      '  let totalWidth = atlasCols * sliceSize;',
      '  let totalHeight = atlasRows * sliceSize;',
      '  if (gid.x >= totalWidth || gid.y >= totalHeight) {',
      '    return;',
      '  }',
      '  let tile = vec2<u32>(gid.x / sliceSize, gid.y / sliceSize);',
      '  let sliceIndex = tile.x + tile.y * atlasCols;',
      '  if (sliceIndex >= sliceCount) {',
      '    return;',
      '  }',
      '  let local = vec2<f32>(',
      '    f32(gid.x % sliceSize) / f32(sliceSize),',
      '    f32(gid.y % sliceSize) / f32(sliceSize)',
      '  );',
      '  let scale = params.header1.x;',
      '  let seed = params.header1.y + f32(sliceIndex) * params.header1.z;',
      '  let p = local * scale;',
      '  var density = tileFbm(p + vec2<f32>(seed * 0.13, -seed * 0.07), 8.0, seed) * 0.74;',
      '  density = density + tileFbm(p * 2.1 + vec2<f32>(4.3 - seed * 0.05, 1.7 + seed * 0.03), 16.0, seed * 1.3) * 0.26;',
      '  let carve = tileFbm(p * 0.52 + vec2<f32>(seed * 0.07, seed * 0.04), 4.0, seed * 0.61);',
      '  density = density - carve * 0.22;',
      '  density = clamp(density, 0.0, 1.0);',
      '  textureStore(atlasTex, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(density, density, density, 1.0));',
      '}'
    ].join('\n');

    var renderShader = [
      'struct RenderParams {',
      '  viewport: vec4<f32>,',
      '  camera: vec4<f32>,',
      '  forwardData: vec4<f32>,',
      '  upData: vec4<f32>,',
      '  atlas: vec4<f32>,',
      '};',
      '',
      '@group(0) @binding(0) var<uniform> params: RenderParams;',
      '@group(0) @binding(1) var atlasTex: texture_2d<f32>;',
      '@group(0) @binding(2) var atlasSampler: sampler;',
      '',
      'struct VsOut {',
      '  @builtin(position) pos: vec4<f32>,',
      '  @location(0) uv: vec2<f32>,',
      '};',
      '',
      '@vertex',
      'fn vsMain(@builtin(vertex_index) index: u32) -> VsOut {',
      '  var positions = array<vec2<f32>, 3>(',
      '    vec2<f32>(-1.0, -3.0),',
      '    vec2<f32>(-1.0, 1.0),',
      '    vec2<f32>(3.0, 1.0)',
      '  );',
      '  var out: VsOut;',
      '  let pos = positions[index];',
      '  out.pos = vec4<f32>(pos, 0.0, 1.0);',
      '  out.uv = pos * 0.5 + vec2<f32>(0.5, 0.5);',
      '  return out;',
      '}',
      '',
      'fn planeColor(plane: f32) -> vec3<f32> {',
      '  let tone = plane - floor(plane / 3.0) * 3.0;',
      '  if (tone < 0.5) { return vec3<f32>(0.18, 0.07, 0.30); }',
      '  if (tone < 1.5) { return vec3<f32>(0.38, 0.18, 0.58); }',
      '  return vec3<f32>(0.70, 0.50, 0.92);',
      '}',
      '',
      'fn atlasUv(slice: f32, localUv: vec2<f32>) -> vec2<f32> {',
      '  let cols = params.atlas.x;',
      '  let col = slice - floor(slice / cols) * cols;',
      '  let row = floor(slice / cols);',
      '  return (vec2<f32>(col, row) + localUv) / vec2<f32>(params.atlas.x, params.atlas.y);',
      '}',
      '',
      'fn safeTileUv(localUv: vec2<f32>) -> vec2<f32> {',
      '  let pad = params.viewport.w * 2.0;',
      '  return fract(localUv) * (1.0 - pad * 2.0) + vec2<f32>(pad, pad);',
      '}',
      '',
      '@fragment',
      'fn fsMain(in: VsOut) -> @location(0) vec4<f32> {',
      '  let uv = vec2<f32>(',
      '    in.pos.x / max(params.viewport.x, 1.0),',
      '    in.pos.y / max(params.viewport.y, 1.0)',
      '  );',
      '  let centered = uv - vec2<f32>(0.5, 0.5);',
      '  let aspect = params.viewport.z;',
      '  let texel = vec2<f32>(params.viewport.w, params.viewport.w);',
      '  let p = vec2<f32>(centered.x * aspect, centered.y);',
      '  let forward = normalize(params.forwardData.xyz);',
      '  let up = normalize(params.upData.xyz);',
      '  let right = normalize(cross(forward, up));',
      '  let ray = normalize(right * p.x + up * p.y + forward * 1.15);',
      '  let cameraXY = params.camera.xy;',
      '  let cameraZ = params.camera.z;',
      '  let energy = params.camera.w;',
      '  let spacing = params.forwardData.w;',
      '  let planeCount = u32(params.upData.w);',
      '  let sliceScale = params.atlas.z;',
      '  let sliceCount = params.atlas.w;',
      '  var color = vec3<f32>(0.0, 0.0, 0.0);',
      '  var accum = 0.0;',
      '  let forwardSign = select(-1.0, 1.0, forward.z >= 0.0);',
      '  let basePlane = select(ceil(cameraZ / spacing), floor(cameraZ / spacing), forward.z >= 0.0);',
      '  for (var i: u32 = 0u; i < 12u; i = i + 1u) {',
      '    if (i >= planeCount) { break; }',
      '    let plane = basePlane + forwardSign * (1.0 + f32(i));',
      '    let planeZ = plane * spacing;',
      '    if (abs(ray.z) < 0.0005) { continue; }',
      '    let rayT = (planeZ - cameraZ) / ray.z;',
      '    if (rayT <= 0.0) { continue; }',
      '    let nearFade = smoothstep(0.08, 0.38, rayT);',
      '    let hit = cameraXY + ray.xy * rayT;',
      '    let chunk = floor(plane / max(sliceCount, 1.0));',
      '    let sampleUv = fract(hit * sliceScale + vec2<f32>(plane * 0.173 + chunk * 0.137, plane * 0.097 - chunk * 0.081));',
      '    let baseUv = safeTileUv(sampleUv);',
      '    let slice = plane - floor(plane / sliceCount) * sliceCount;',
      '    let filteredDensity = (',
      '      textureSampleLevel(atlasTex, atlasSampler, atlasUv(slice, baseUv), 0.0).r * 2.0 +',
      '      textureSampleLevel(atlasTex, atlasSampler, atlasUv(slice, safeTileUv(sampleUv + vec2<f32>( texel.x, 0.0))), 0.0).r +',
      '      textureSampleLevel(atlasTex, atlasSampler, atlasUv(slice, safeTileUv(sampleUv + vec2<f32>(-texel.x, 0.0))), 0.0).r +',
      '      textureSampleLevel(atlasTex, atlasSampler, atlasUv(slice, safeTileUv(sampleUv + vec2<f32>(0.0,  texel.y))), 0.0).r +',
      '      textureSampleLevel(atlasTex, atlasSampler, atlasUv(slice, safeTileUv(sampleUv + vec2<f32>(0.0, -texel.y))), 0.0).r',
      '    ) / 6.0;',
      '    let closeFactor = 1.0 - smoothstep(0.45, 1.85, rayT);',
      '    let detailUv = safeTileUv(sampleUv * (2.2 + closeFactor * 1.6) + vec2<f32>(plane * 0.031, -plane * 0.027));',
      '    let detailDensity = textureSampleLevel(atlasTex, atlasSampler, atlasUv(slice, detailUv), 0.0).r;',
      '    let density = mix(filteredDensity, filteredDensity * 0.52 + detailDensity * 0.48, closeFactor);',
      '    let threshold = 0.53 + 0.11 * sin(plane * 0.73);',
      '    let aa = max(params.viewport.w * mix(3.8, 1.9, closeFactor), 0.008);',
      '    let solid = smoothstep(threshold - aa, threshold + aa, density) * nearFade;',
      '    let edge = smoothstep(threshold - aa, threshold + aa, density) - smoothstep(threshold + aa, threshold + aa * 3.2, density);',
      '    let depthNorm = f32(i) / max(f32(planeCount) - 1.0, 1.0);',
      '    var planeCol = planeColor(plane) * (1.0 - depthNorm * 0.44);',
      '    planeCol = planeCol + vec3<f32>(0.08, 0.05, 0.14) * edge * (0.68 + energy * 0.14);',
      '    color = mix(color, planeCol, solid * (1.0 - accum));',
      '    accum = accum + solid * (1.0 - accum);',
      '  }',
      '  color = color * (1.0 - 0.12 * length(vec2<f32>(centered.x * aspect, centered.y)));',
      '  return vec4<f32>(color, 1.0);',
      '}'
    ].join('\n');

    return navigator.gpu.requestAdapter().then(function (adapter) {
      if (!adapter) return null;
      return adapter.requestDevice();
    }).then(function (device) {
      if (!device) return null;

      var context = target.getContext('webgpu');
      if (!context) return null;

      context.configure({
        device: device,
        format: format,
        alphaMode: 'premultiplied'
      });

      var atlasTexture = device.createTexture({
        size: [sliceSize * atlasCols, sliceSize * atlasRows, 1],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.STORAGE_BINDING
      });
      var atlasView = atlasTexture.createView();
      var sampler = device.createSampler({
        addressModeU: 'clamp-to-edge',
        addressModeV: 'clamp-to-edge',
        magFilter: 'linear',
        minFilter: 'linear'
      });

      var computeParamsBuffer = device.createBuffer({
        size: computeParamsData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      device.queue.writeBuffer(computeParamsBuffer, 0, computeParamsData);

      var renderParamsBuffer = device.createBuffer({
        size: renderParamsData.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      var computePipeline = device.createComputePipeline({
        layout: 'auto',
        compute: {
          module: device.createShaderModule({ code: computeShader }),
          entryPoint: 'main'
        }
      });
      var renderPipeline = device.createRenderPipeline({
        layout: 'auto',
        vertex: {
          module: device.createShaderModule({ code: renderShader }),
          entryPoint: 'vsMain'
        },
        fragment: {
          module: device.createShaderModule({ code: renderShader }),
          entryPoint: 'fsMain',
          targets: [{ format: format }]
        },
        primitive: {
          topology: 'triangle-list'
        }
      });

      var computeBindGroup = device.createBindGroup({
        layout: computePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: atlasView },
          { binding: 1, resource: { buffer: computeParamsBuffer } }
        ]
      });
      var renderBindGroup = device.createBindGroup({
        layout: renderPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: renderParamsBuffer } },
          { binding: 1, resource: atlasView },
          { binding: 2, resource: sampler }
        ]
      });

      var bakeEncoder = device.createCommandEncoder();
      var bakePass = bakeEncoder.beginComputePass();
      bakePass.setPipeline(computePipeline);
      bakePass.setBindGroup(0, computeBindGroup);
      bakePass.dispatchWorkgroups(
        Math.ceil((sliceSize * atlasCols) / 8),
        Math.ceil((sliceSize * atlasRows) / 8),
        1
      );
      bakePass.end();
      device.queue.submit([bakeEncoder.finish()]);

      return {
        resize: function () {
          if (!target.width || !target.height) return;
          context.configure({
            device: device,
            format: format,
            alphaMode: 'premultiplied'
          });
        },
        render: function (state) {
          renderParamsData[0] = state.width;
          renderParamsData[1] = state.height;
          renderParamsData[2] = state.aspect;
          renderParamsData[3] = 1 / sliceSize;
          renderParamsData[4] = state.cameraX;
          renderParamsData[5] = state.cameraY;
          renderParamsData[6] = state.cameraZ;
          renderParamsData[7] = state.energy;
          renderParamsData[8] = state.forwardX;
          renderParamsData[9] = state.forwardY;
          renderParamsData[10] = state.forwardZ;
          renderParamsData[11] = spacing;
          renderParamsData[12] = state.upX;
          renderParamsData[13] = state.upY;
          renderParamsData[14] = state.upZ;
          renderParamsData[15] = planeCount;
          renderParamsData[16] = atlasCols;
          renderParamsData[17] = atlasRows;
          renderParamsData[18] = sliceScale;
          renderParamsData[19] = sliceCount;
          device.queue.writeBuffer(renderParamsBuffer, 0, renderParamsData);

          var encoder = device.createCommandEncoder();
          var pass = encoder.beginRenderPass({
            colorAttachments: [{
              view: context.getCurrentTexture().createView(),
              clearValue: { r: 0, g: 0, b: 0, a: 0 },
              loadOp: 'clear',
              storeOp: 'store'
            }]
          });
          pass.setPipeline(renderPipeline);
          pass.setBindGroup(0, renderBindGroup);
          pass.draw(3, 1, 0, 0);
          pass.end();
          device.queue.submit([encoder.finish()]);
        }
      };
    }).catch(function (err) {
      console.warn('fx.js: WebGPU lava3 init failed', err);
      return null;
    });
  }

  function ensureGpuRenderer() {
    if (gpuRenderer) return Promise.resolve(gpuRenderer);
    if (gpuInitPromise) return gpuInitPromise;
    gpuInitPromise = createLava3Renderer(gpuCanvas).then(function (renderer) {
      gpuRenderer = renderer;
      if (gpuRenderer && gpuCanvas) {
        gpuRenderer.resize(gpuCanvas.width, gpuCanvas.height);
      } else {
        gpuInitPromise = null;
      }
      return gpuRenderer;
    });
    return gpuInitPromise;
  }

  function isWebGlMode(mode) {
    return mode === 'lava' || mode === 'lava2';
  }

  var flameCanvas = document.getElementById('flame-canvas');
  var knotCanvas = document.getElementById('knot-canvas');
  var waveCanvas = document.getElementById('wave-canvas');

  function showActiveCanvas(mode) {
    if (canvas) canvas.classList.toggle('fx-active', isWebGlMode(mode));
    if (gpuCanvas) gpuCanvas.classList.toggle('fx-active', mode === 'lava3');
    if (flameCanvas) flameCanvas.classList.toggle('fx-active', mode === 'flame');
    if (knotCanvas) knotCanvas.classList.toggle('fx-active', mode === 'knot');
    if (waveCanvas) waveCanvas.classList.toggle('fx-active', mode === 'wave');
    // pretext manages its own container visibility via pretextStart/pretextStop
  }

  // ── Render loop ──
  function render() {
    if (!activeMode || activeMode === 'pretext' || activeMode === 'flame' || activeMode === 'knot' || activeMode === 'wave') {
      animFrame = null;
      return;
    }

    var now = Date.now();
    var t = (now - startTime) / 1000.0;
    var dt = Math.min(0.05, (now - lastFrameTime) / 1000.0 || 0.016);
    lastFrameTime = now;

    // Pointer position steers the trajectory. Lava3 uses a persistent heading, so center acts as a dead zone.
    var isLava3 = activeMode === 'lava3';
    var pointerEase = activeMode === 'lava2' ? 0.010 : 0.014;
    var velocityEase = activeMode === 'lava2' ? 0.42 : 0.85;
    var lateralX = activeMode === 'lava2' ? 0.065 : 0.18;
    var lateralY = activeMode === 'lava2' ? 0.055 : 0.14;
    var forwardBase = activeMode === 'lava2' ? 0.48 : 0.38;
    var pressBoost = activeMode === 'lava2' ? 0.06 : 0.10;
    var energyBoost = activeMode === 'lava2' ? 0.04 : 0.05;
    smoothX += (mouseX - smoothX) * pointerEase;
    smoothY += (mouseY - smoothY) * pointerEase;
    flowX *= 0.78;
    flowY *= 0.78;
    pointerEnergy *= pointerDown ? 0.976 : 0.962;

    var nx = (smoothX / window.innerWidth) - 0.5;
    var ny = 0.5 - (smoothY / window.innerHeight);
    var desiredVX = nx * lateralX;
    var desiredVY = ny * lateralY;
    var desiredVZ = forwardBase + (pointerDown ? pressBoost : 0.0) + pointerEnergy * energyBoost;
    if (isLava3) {
      var stickX = nx * 2.0;
      var stickY = ny * 2.0;
      var deadZone = 0.12;
      var stickMag = Math.sqrt(stickX * stickX + stickY * stickY);
      var steerX = 0;
      var steerY = 0;
      if (stickMag > deadZone) {
        var steerMag = Math.min(1, (stickMag - deadZone) / (1 - deadZone));
        steerX = (stickX / stickMag) * steerMag;
        steerY = (stickY / stickMag) * steerMag;
      }
      var targetForward = normalize3(
        steerX * 0.58,
        steerY * 0.42,
        1.0,
        [0, 0, 1]
      );
      var forward = normalize3(
        viewForwardX + (targetForward[0] - viewForwardX) * Math.min(1, dt * 3.2),
        viewForwardY + (targetForward[1] - viewForwardY) * Math.min(1, dt * 3.2),
        viewForwardZ + (targetForward[2] - viewForwardZ) * Math.min(1, dt * 3.2),
        [0, 0, 1]
      );
      var worldUp = [0, 1, 0];
      var rightVec = cross3(worldUp[0], worldUp[1], worldUp[2], forward[0], forward[1], forward[2]);
      var right = normalize3(rightVec[0], rightVec[1], rightVec[2], [1, 0, 0]);
      var horizonUpVec = cross3(forward[0], forward[1], forward[2], right[0], right[1], right[2]);
      var horizonUp = normalize3(horizonUpVec[0], horizonUpVec[1], horizonUpVec[2], worldUp);
      var horizonRightVec = cross3(horizonUp[0], horizonUp[1], horizonUp[2], forward[0], forward[1], forward[2]);
      var horizonRight = normalize3(horizonRightVec[0], horizonRightVec[1], horizonRightVec[2], right);
      bankAngle += ((-steerX * 0.42) - bankAngle) * Math.min(1, dt * 2.4);
      var up = normalize3(
        horizonUp[0] * Math.cos(bankAngle) + horizonRight[0] * Math.sin(bankAngle),
        horizonUp[1] * Math.cos(bankAngle) + horizonRight[1] * Math.sin(bankAngle),
        horizonUp[2] * Math.cos(bankAngle) + horizonRight[2] * Math.sin(bankAngle),
        horizonUp
      );
      viewForwardX = forward[0];
      viewForwardY = forward[1];
      viewForwardZ = forward[2];
      viewUpX = up[0];
      viewUpY = up[1];
      viewUpZ = up[2];
      desiredVX = forward[0] * 0.18 + steerX * 0.02;
      desiredVY = forward[1] * 0.15 + steerY * 0.02;
      desiredVZ = Math.max(0.46, forward[2]) * 0.62 + (pointerDown ? 0.05 : 0.0) + pointerEnergy * 0.035;
    }
    travelVX += (desiredVX - travelVX) * Math.min(1, dt * velocityEase);
    travelVY += (desiredVY - travelVY) * Math.min(1, dt * velocityEase);
    travelVZ += (desiredVZ - travelVZ) * Math.min(1, dt * 0.75);
    travelX += travelVX * dt;
    travelY += travelVY * dt;
    travelZ += travelVZ * dt;

    if (activeMode === 'lava3') {
      if (gpuRenderer && gpuCanvas && gpuCanvas.width && gpuCanvas.height) {
        var gpuAspect = gpuCanvas.width / gpuCanvas.height;
        gpuRenderer.render({
          width: gpuCanvas.width,
          height: gpuCanvas.height,
          aspect: gpuAspect,
          time: t,
          cameraX: travelX * 0.92,
          cameraY: travelY * 0.92,
          cameraZ: travelZ * 1.08,
          forwardX: viewForwardX,
          forwardY: viewForwardY,
          forwardZ: viewForwardZ,
          upX: viewUpX,
          upY: viewUpY,
          upZ: viewUpZ,
          energy: clamp(pointerEnergy, 0.0, 1.0)
        });
      }
      animFrame = requestAnimationFrame(render);
      return;
    }

    if (!programs[activeMode]) {
      animFrame = null;
      return;
    }

    var prog = programs[activeMode];
    var dpr = window.devicePixelRatio || 1;
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
    if (PUBLISHED_EFFECTS.indexOf(mode) < 0) {
      deactivate(0);
      return;
    }
    // Stop current custom mode if switching away
    if (activeMode === 'pretext' && mode !== 'pretext' && window.pretextStop) {
      window.pretextStop();
    }
    if (activeMode === 'flame' && mode !== 'flame' && window.flameStop) {
      window.flameStop();
    }
    if (activeMode === 'knot' && mode !== 'knot' && window.knotStop) {
      window.knotStop();
    }
    if (activeMode === 'wave' && mode !== 'wave' && window.waveStop) {
      window.waveStop();
    }

    if (mode === 'knot') {
      activeMode = mode;
      showActiveCanvas(mode);
      document.body.classList.add('lava-active');
      if (siteName) siteName.classList.add('is-active');
      setHash(mode);
      if (window.knotStart) window.knotStart();
      return;
    }

    if (mode === 'wave') {
      activeMode = mode;
      showActiveCanvas(mode);
      document.body.classList.add('lava-active');
      if (siteName) siteName.classList.add('is-active');
      setHash(mode);
      if (window.waveStart) window.waveStart();
      return;
    }

    if (mode === 'flame') {
      activeMode = mode;
      showActiveCanvas(mode);
      document.body.classList.add('lava-active');
      if (siteName) siteName.classList.add('is-active');
      setHash(mode);
      if (window.flameStart) window.flameStart();
      return;
    }

    if (mode === 'pretext') {
      activeMode = mode;
      showActiveCanvas(mode);
      document.body.classList.add('lava-active');
      if (siteName) siteName.classList.add('is-active');
      setHash(mode);
      if (window.pretextStart) window.pretextStart();
      return;
    }

    if (mode === 'lava3') {
      if (!navigator.gpu || !gpuCanvas) {
        console.warn('fx.js: WebGPU unavailable, falling back to lava2');
        mode = 'lava2';
      } else {
        viewForwardX = 0;
        viewForwardY = 0;
        viewForwardZ = 1;
        viewUpX = 0;
        viewUpY = 1;
        viewUpZ = 0;
        bankAngle = 0;
        ensureGpuRenderer().then(function (renderer) {
          if (!renderer && activeMode === 'lava3') {
            console.warn('fx.js: lava3 init failed, falling back to lava2');
            activate('lava2');
          }
        });
      }
    }
    activeMode = mode;
    showActiveCanvas(mode);
    document.body.classList.add('lava-active');
    if (siteName) siteName.classList.add('is-active');
    setHash(mode);
    if (!animFrame) animFrame = requestAnimationFrame(render);
  }

  function deactivate(elmIndex) {
    if (activeMode === 'pretext' && window.pretextStop) window.pretextStop();
    if (activeMode === 'flame' && window.flameStop) window.flameStop();
    if (activeMode === 'knot' && window.knotStop) window.knotStop();
    if (activeMode === 'wave' && window.waveStop) window.waveStop();
    activeMode = null;
    showActiveCanvas(null);
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

  // ── Wire up Elm buttons + experimental effects ──
  function wireButtons() {
    var bgDiv = document.getElementById('background-buttons');
    if (!bgDiv) return false;
    var buttons = bgDiv.querySelectorAll('button');
    if (buttons.length < 5) return false;

    if (buttonsWired) return true;
    buttonsWired = true;

    console.log('fx.js: wiring', buttons.length, 'Elm buttons');

    buttons.forEach(function (btn, i) {
      var label = ['Drag', 'Perspective', 'Stars', 'Rainbow', 'Spinners'][i];
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.addEventListener('click', function (event) {
        if (event.detail === 0) btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });
      btn.addEventListener('mousedown', function () {
        deactivate(i);
      });
    });

    var knotBtn = document.createElement('button');
    knotBtn.className = 'icon-button';
    knotBtn.title = 'Knot';
    knotBtn.setAttribute('aria-label', 'Knot');
    knotBtn.innerHTML = '<img src="assets/knot-icon.svg" alt="Knot">';
    knotBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      activate('knot');
    });
    bgDiv.appendChild(knotBtn);

    applyHash();
    return true;
  }

  function applyHash() {
    var hash = location.hash.replace('#', '');
    if (!hash) return;
    if (PUBLISHED_EFFECTS.indexOf(hash) >= 0) {
      activate(hash);
    } else if (['lava', 'lava2', 'lava3', 'pretext', 'flame', 'wave'].indexOf(hash) >= 0) {
      // Retired and unfinished effects stay hidden, including old shared links.
      deactivate(0);
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

  window.addEventListener('knoterror', function () {
    if (activeMode !== 'knot') return;
    var firstButton = document.querySelector('#background-buttons button');
    if (firstButton) firstButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    else deactivate(0);
  });
  window.addEventListener('hashchange', applyHash);
  waitForElm();
})();
