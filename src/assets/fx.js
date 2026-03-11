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

  // ── Canvas setup ──
  canvas = document.getElementById('fx-canvas');
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

  // ── GLSL helpers ──
  var NOISE_GLSL = [
    'vec3 mod289v3(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec2 mod289v2(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec3 permute(vec3 x){return mod289v3(((x*34.0)+1.0)*x);}',
    'float snoise(vec2 v){',
    '  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);',
    '  vec2 i=floor(v+dot(v,C.yy));',
    '  vec2 x0=v-i+dot(i,C.xx);',
    '  vec2 i1=(x0.x>x0.y)?vec2(1,0):vec2(0,1);',
    '  vec4 x12=x0.xyxy+C.xxzz;',
    '  x12.xy-=i1;',
    '  i=mod289v2(i);',
    '  vec3 p=permute(permute(i.y+vec3(0,i1.y,1))+i.x+vec3(0,i1.x,1));',
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
    '  float f=0.0;float w=0.5;',
    '  for(int i=0;i<5;i++){f+=w*snoise(p);p*=2.0;w*=0.5;}',
    '  return f;',
    '}'
  ].join('\n');

  var HASH_GLSL = [
    'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}',
    'float hash1(float p){return fract(sin(p*127.1)*43758.5453123);}'
  ].join('\n');

  // ── Vertex shader (fullscreen quad) ──
  var VERT = [
    'attribute vec2 a_pos;',
    'void main(){gl_Position=vec4(a_pos,0,1);}'
  ].join('\n');

  // ── Stars fragment shader ──
  var FRAG_STARS = [
    'precision mediump float;',
    'uniform float u_time;',
    'uniform vec2 u_res;',
    NOISE_GLSL,
    FBM_GLSL,
    HASH_GLSL,
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;',
    '  float aspect=u_res.x/u_res.y;',
    '  vec2 p=vec2(uv.x*aspect,uv.y);',
    '',
    // subtle nebula background
    '  float neb=fbm(p*2.0)*0.5+0.5;',
    '  float neb2=fbm(p*1.2+vec2(3.7,1.2))*0.5+0.5;',
    '  vec3 sky=mix(vec3(0.0,0.0,0.02),vec3(0.04,0.0,0.07),neb);',
    '  sky+=vec3(0.02,0.0,0.03)*neb2;',
    '',
    // stars at multiple scales — FBM density modulation
    '  float stars=0.0;',
    '  vec3 starTint=vec3(0.0);',
    '  for(float layer=0.0;layer<4.0;layer++){',
    '    float scale=15.0+layer*25.0;',
    '    vec2 cell=floor(uv*scale);',
    '    vec2 cellUV=fract(uv*scale);',
    '    vec2 spos=vec2(hash(cell),hash(cell+vec2(73,137)));',
    '    float d=length(cellUV-spos);',
    // FBM density: some areas dense, some sparse
    '    float density=fbm(cell/scale*3.0)*0.5+0.5;',
    '    float visible=step(hash(cell+vec2(419,311)),density*0.6+0.1);',
    // twinkle
    '    float phase=hash(cell+vec2(97,53))*6.2832;',
    '    float speed=0.5+hash(cell+vec2(211,89))*2.0;',
    '    float twinkle=0.6+0.4*sin(u_time*speed+phase);',
    // size varies by layer
    '    float sz=0.06-layer*0.012;',
    '    float s=smoothstep(sz,0.0,d)*visible*twinkle;',
    // color temperature per star
    '    float temp=hash(cell+vec2(577,691));',
    '    vec3 tc=mix(vec3(0.7,0.8,1.0),vec3(1.0,0.9,0.7),temp);',
    '    tc=mix(tc,vec3(1.0,0.6,0.4),step(0.92,temp));',
    '    starTint+=s*tc;',
    '    stars+=s;',
    '  }',
    '',
    '  vec3 color=sky+starTint;',
    '  gl_FragColor=vec4(color,1.0);',
    '}'
  ].join('\n');

  // ── Lava lamp fragment shader ──
  var FRAG_LAVA = [
    'precision mediump float;',
    'uniform float u_time;',
    'uniform vec2 u_res;',
    'uniform vec2 u_mouse;',
    NOISE_GLSL,
    FBM_GLSL,
    '',
    'void main(){',
    '  vec2 uv=gl_FragCoord.xy/u_res;',
    '  float aspect=u_res.x/u_res.y;',
    '  vec2 p=vec2(uv.x*aspect,uv.y);',
    '',
    // Base: flat dark warm color
    '  vec3 base=vec3(0.05,0.015,0.08);',
    '',
    // Layer 2: FBM blobs — domain warped for organic oval shapes
    // slow vertical drift to simulate rising lava
    '  vec2 drift=vec2(u_time*0.02,u_time*0.035);',
    '  vec2 q=vec2(fbm(p*2.5+drift+vec2(0.0,1.7)),',
    '              fbm(p*2.5+drift+vec2(5.2,3.1)));',
    // second level of domain warping for extra organicness
    '  vec2 r=vec2(fbm(p*2.5+4.0*q+vec2(1.7,9.2)+drift*0.7),',
    '              fbm(p*2.5+4.0*q+vec2(8.3,2.8)+drift*0.5));',
    '  float n=fbm(p*2.0+4.0*r);',
    '',
    // threshold into discrete blobs with soft edges
    '  float blob1=smoothstep(-0.1,0.2,n);',
    '  float blob2=smoothstep(0.15,0.4,n);',
    '',
    // warm lava colors — varies across the blob
    '  vec3 lavaDeep=vec3(0.6,0.05,0.02);',
    '  vec3 lavaMid=vec3(0.9,0.25,0.05);',
    '  vec3 lavaHot=vec3(1.0,0.55,0.12);',
    '  vec3 blobColor=mix(lavaDeep,lavaMid,blob1);',
    '  blobColor=mix(blobColor,lavaHot,blob2);',
    '',
    // Layer 3: Mouse-following ellipse with FBM warped edge
    '  vec2 mUV=u_mouse/u_res;',
    '  mUV=vec2(mUV.x*aspect,mUV.y);',
    '  vec2 diff=p-mUV;',
    // slightly oval (taller than wide)
    '  diff*=vec2(1.0,0.75);',
    '  float dist=length(diff);',
    // FBM distortion on the edge
    '  float angle=atan(diff.y,diff.x);',
    '  float edgeWarp=fbm(vec2(angle*1.5,u_time*0.08+dist*3.0))*0.07;',
    '  float ellipse=smoothstep(0.22+edgeWarp,0.13+edgeWarp,dist);',
    // bright glow color for the top blob
    '  vec3 glowColor=vec3(1.0,0.7,0.25);',
    '  vec3 glowEdge=vec3(0.95,0.35,0.08);',
    '  vec3 ell=mix(glowEdge,glowColor,smoothstep(0.18,0.05,dist));',
    '',
    // compose layers
    '  vec3 color=base;',
    '  color=mix(color,blobColor,blob1*0.85);',
    '  color=mix(color,ell,ellipse*0.92);',
    '',
    // subtle vignette
    '  float vig=1.0-0.4*length(uv-0.5);',
    '  color*=vig;',
    '',
    '  gl_FragColor=vec4(color,1.0);',
    '}'
  ].join('\n');

  // ── Shader compilation ──
  function compileShader(src, type) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function createProgram(fragSrc) {
    var vs = compileShader(VERT, gl.VERTEX_SHADER);
    var fs = compileShader(fragSrc, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return null;
    var p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error('Program error:', gl.getProgramInfoLog(p));
      return null;
    }
    return {
      program: p,
      a_pos: gl.getAttribLocation(p, 'a_pos'),
      u_time: gl.getUniformLocation(p, 'u_time'),
      u_res: gl.getUniformLocation(p, 'u_res'),
      u_mouse: gl.getUniformLocation(p, 'u_mouse')
    };
  }

  programs.stars = createProgram(FRAG_STARS);
  programs.lava = createProgram(FRAG_LAVA);

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

    // smooth mouse (exponential easing — slow follow for lava, snappier for stars)
    var ease = activeMode === 'lava' ? 0.03 : 0.15;
    smoothX += (mouseX - smoothX) * ease;
    smoothY += (mouseY - smoothY) * ease;

    gl.useProgram(prog.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(prog.a_pos);
    gl.vertexAttribPointer(prog.a_pos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(prog.u_time, t);
    gl.uniform2f(prog.u_res, canvas.width, canvas.height);
    // flip Y for GL coords
    gl.uniform2f(prog.u_mouse, smoothX * dpr, canvas.height - smoothY * dpr);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    animFrame = requestAnimationFrame(render);
  }

  // ── Mode switching ──
  function activate(mode) {
    if (mode === activeMode) return;
    activeMode = mode;
    canvas.classList.add('fx-active');
    if (!animFrame) animFrame = requestAnimationFrame(render);
  }

  function deactivate() {
    activeMode = null;
    canvas.classList.remove('fx-active');
    if (animFrame) {
      cancelAnimationFrame(animFrame);
      animFrame = null;
    }
  }

  // ── Intercept Elm background buttons ──
  // Buttons are inside #background-buttons, ordered:
  // hexagon(drag), pyramid(perspective), stars, rainbow, spinners
  var bgDiv = document.getElementById('background-buttons');
  if (bgDiv) {
    // Watch for Elm to render buttons, then attach listeners
    var observer = new MutationObserver(function () {
      var buttons = bgDiv.querySelectorAll('.icon-button');
      if (buttons.length < 5) return;
      observer.disconnect();

      buttons.forEach(function (btn, i) {
        btn.addEventListener('mousedown', function () {
          if (i === 2) {
            // stars button — activate FBM stars
            activate('stars');
          } else {
            // any other Elm mode — deactivate our overlay
            deactivate();
          }
        });
      });

      // Inject lava lamp button into the button bar
      var lavaBtn = document.createElement('button');
      lavaBtn.className = 'icon-button';
      lavaBtn.innerHTML = '<img src="assets/lava-icon.svg" alt="Lava">';
      lavaBtn.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        activate('lava');
      });
      bgDiv.appendChild(lavaBtn);
    });
    observer.observe(bgDiv, { childList: true, subtree: true });

    // Also check if buttons already exist
    var existing = bgDiv.querySelectorAll('.icon-button');
    if (existing.length >= 5) {
      observer.disconnect();
      existing.forEach(function (btn, i) {
        btn.addEventListener('mousedown', function () {
          if (i === 2) { activate('stars'); } else { deactivate(); }
        });
      });
      var lavaBtn = document.createElement('button');
      lavaBtn.className = 'icon-button';
      lavaBtn.innerHTML = '<img src="assets/lava-icon.svg" alt="Lava">';
      lavaBtn.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        activate('lava');
      });
      bgDiv.appendChild(lavaBtn);
    }
  }
})();
