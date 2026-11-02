/* Ocean lattice experiments. No random texture: one scalar surface owns its normal.
 * Pointy hex radius R=1; centers B(q,r)=(sqrt(3)(q+r/2), 3r/2).
 * All field coordinates and derivatives are in world units. See ocean-lab theory notes.
 */
(function (root) {
  'use strict';
  var TAU = Math.PI * 2, SQRT3 = Math.sqrt(3), APOTHEM = SQRT3 / 2;
  var defaults = Object.freeze({ variant: 'periodic', speed: 0.55, amplitude: 1.7, hexScale: 1, period: 12, variation: 0.006, grid: false, gauge: false });
  var PERIOD = 12, VELOCITY = [0.15, 0.08], EPSILON = 0.006;
  var FACE_NORMALS = Array.from({ length: 6 }, function (_, j) { return [Math.cos(j * Math.PI / 3), Math.sin(j * Math.PI / 3)]; });
  function finite(v, d, lo, hi) { return typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; }
  function clean(options) {
    options = options || {};
    return {
      variant: options.variant === 'unique' ? 'unique' : 'periodic',
      speed: finite(options.speed, defaults.speed, 0, 3),
      amplitude: finite(options.amplitude, defaults.amplitude, 0, 2.5),
      hexScale: finite(options.hexScale, defaults.hexScale, 0.35, 3),
      period: Math.round(finite(options.period, defaults.period, 6, 24)),
      variation: finite(options.variation, defaults.variation, 0, 0.14),
      grid: !!options.grid, gauge: !!options.gauge
    };
  }
  function worldFromAxial(q, r, scale) { scale = scale || 1; return { x: SQRT3 * (q + r / 2) * scale, y: 1.5 * r * scale }; }
  function axialFromWorld(x, y) { return { q: x / SQRT3 - y / 3, r: 2 * y / 3 }; }
  function cellAt(x, y, scale) {
    scale = scale || 1;
    var a = axialFromWorld(x / scale, y / scale), s = -a.q - a.r;
    var q = Math.round(a.q), r = Math.round(a.r), rs = Math.round(s);
    var dq = Math.abs(q - a.q), dr = Math.abs(r - a.r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) q = -r - rs;
    else if (dr > ds) r = -q - rs;
    var center = worldFromAxial(q, r, scale);
    return { q: q, r: r, centerX: center.x, centerY: center.y, x: (x - center.x) / scale, y: (y - center.y) / scale };
  }
  // psi_c changes with the arbitrary local frame chi_c; exp(-i chi_c) psi_c does not.
  // This is a redundant U(1) representation, not a claim to simulate gauge dynamics.
  function phaseForCell(q, r, t, gauge) {
    var theta = TAU * (Math.SQRT2 * q + Math.sqrt(3) * r);
    var chi = gauge ? 2.3 * Math.sin(0.43 * q + 0.71 * r + 0.19 * t) : 0;
    var px = Math.cos(theta + chi), py = Math.sin(theta + chi);
    return Math.atan2(py * Math.cos(chi) - px * Math.sin(chi), px * Math.cos(chi) + py * Math.sin(chi));
  }
  function baseField(x, y, t, period, directional) {
    var a = axialFromWorld(x, y), q = a.q - VELOCITY[0] * t, r = a.r - VELOCITY[1] * t;
    var modes = [[q, 1 / SQRT3, -1 / 3], [r, 0, 2 / 3], [q + r, 1 / SQRT3, 1 / 3]];
    var h = 0, dx = 0, dy = 0, k = TAU / period;
    modes.forEach(function (m, j) {
      var weight = directional ? [0.75, 0.15, 0.10][j] : 1 / 3;
      var phase = k * m[0], slope = -weight * 0.55 * k * Math.sin(phase) - weight * 0.08 * 2 * k * Math.sin(2 * phase);
      h += weight * 0.55 * Math.cos(phase) + weight * 0.08 * Math.cos(2 * phase);
      dx += slope * m[1]; dy += slope * m[2];
    });
    return { height: h, dx: dx, dy: dy };
  }
  function evaluate(variant, x, y, t, options) {
    var o = clean(Object.assign({}, options, { variant: variant }));
    var scale = o.hexScale, p = baseField(x / scale, y / scale, t * o.speed, o.period, o.variant === 'unique');
    if (o.variant === 'unique') {
      var c = cellAt(x, y, scale), b = 1, bx = 0, by = 0;
      FACE_NORMALS.forEach(function (n) {
        var f = 1 - (n[0] * c.x + n[1] * c.y) / APOTHEM, f2 = f * f;
        bx = bx * f2 - b * 2 * f * n[0] / APOTHEM;
        by = by * f2 - b * 2 * f * n[1] / APOTHEM;
        b *= f2;
      });
      var phase = 2.7 * c.x + 1.3 * c.y + phaseForCell(c.q, c.r, t * o.speed, o.gauge) - 0.42 * t * o.speed;
      var sn = Math.sin(phase), cs = Math.cos(phase);
      p.height += o.variation * b * sn;
      p.dx += o.variation * (bx * sn + b * cs * 2.7);
      p.dy += o.variation * (by * sn + b * cs * 1.3);
    }
    return { height: p.height * o.amplitude, dx: p.dx * o.amplitude / scale, dy: p.dy * o.amplitude / scale };
  }
  var vertex = 'attribute vec2 a_position; void main(){gl_Position=vec4(a_position,0.,1.);}';
  var fragment = [
    'precision highp float;',
    'uniform vec2 u_resolution; uniform float u_time,u_amplitude,u_scale,u_unique,u_grid,u_gauge,u_period,u_variation;',
    'const float PI=3.141592653589793, TAU=6.283185307179586, S3=1.7320508075688772, A=.8660254037844386;',
    'vec2 axial(vec2 p){return vec2(p.x/S3-p.y/3.,2.*p.y/3.);}',
    'vec2 world(vec2 c){return vec2(S3*(c.x+c.y*.5),1.5*c.y);}',
    'vec2 cell(vec2 p){ vec2 a=axial(p); vec3 cube=vec3(a,-a.x-a.y); vec3 r=floor(cube+.5); vec3 d=abs(r-cube); if(d.x>d.y && d.x>d.z)r.x=-r.y-r.z; else if(d.y>d.z)r.y=-r.x-r.z; return r.xy;}',
    // Return height, dH/dx, dH/dy; analytic derivative of the complete composed field.
    'vec3 surface(vec2 p){',
    ' vec2 a=axial(p)-vec2(.15,.08)*u_time; float k=TAU/u_period; vec3 outv=vec3(0.);',
    ' for(int j=0;j<3;j++){float v; vec2 g; float w=1./3.; if(j==0){v=a.x;g=vec2(1./S3,-1./3.);if(u_unique>.5)w=.75;}else if(j==1){v=a.y;g=vec2(0.,2./3.);if(u_unique>.5)w=.15;}else{v=a.x+a.y;g=vec2(1./S3,1./3.);if(u_unique>.5)w=.10;} float ph=k*v; float d=-w*.55*k*sin(ph)-w*.08*2.*k*sin(2.*ph); outv+=vec3(w*.55*cos(ph)+w*.08*cos(2.*ph),d*g);}',
    ' if(u_unique>.5){vec2 c=cell(p), local=p-world(c); float b=1.; vec2 gb=vec2(0.);',
    '  for(int j=0;j<6;j++){float angle=float(j)*PI/3.;vec2 n=vec2(cos(angle),sin(angle));float f=1.-dot(n,local)/A; gb=gb*f*f-b*2.*f*n/A; b*=f*f;}',
    '  float theta=TAU*dot(c,vec2(1.4142135623730951,S3)); float chi=u_gauge*2.3*sin(.43*c.x+.71*c.y+.19*u_time); vec2 psi=vec2(cos(theta+chi),sin(theta+chi)); vec2 physical=vec2(psi.x*cos(chi)+psi.y*sin(chi),psi.y*cos(chi)-psi.x*sin(chi)); float phase=dot(vec2(2.7,1.3),local)+atan(physical.y,physical.x)-.42*u_time; outv+=u_variation*vec3(b*sin(phase),gb*sin(phase)+b*cos(phase)*vec2(2.7,1.3));',
    ' } return outv*u_amplitude;',
    '}',
    'void main(){',
    ' vec2 uv=gl_FragCoord.xy/u_resolution; float aspect=u_resolution.x/u_resolution.y;',
    ' vec2 p=(uv-.5)*vec2(14.*aspect,14.);',
    // Rotate the camera only; this does not alter the field or its mathematical symmetry.
    ' mat2 camera=mat2(.913545,-.406737,.406737,.913545); p=camera*p+vec2(9.,-1.8);',
    ' vec3 f=surface(p/u_scale); vec2 slope=f.yz/u_scale;',
    ' vec3 n=normalize(vec3(-slope.x,-slope.y,1.));',
    ' vec3 view=normalize(vec3(.13,-.85,.72)); vec3 light=normalize(vec3(-.42,.57,.52));',
    ' float diffuse=max(0.,dot(n,light)); float facing=max(.0,dot(n,view)); float fresnel=.025+.975*pow(1.-facing,5.);',
    ' vec3 reflection=reflect(-view,n);',
    ' float strip=dot(slope,normalize(vec2(-.42,1.))); float sky=exp(-pow((strip-.092)/.047,2.));',
    ' float silver=exp(-pow((strip-.132)/.012,2.));',
    ' float shoulder=smoothstep(.015,.19,-slope.x*.55+slope.y*.84);',
    ' vec3 col=vec3(.014,.057,.071)+vec3(.012,.065,.069)*diffuse;',
    ' col+=vec3(.012,.070,.074)*shoulder;',
    ' col+=vec3(.08,.26,.27)*sky*(.45+2.*fresnel);',
    ' col+=vec3(.51,.67,.65)*silver*.24;',
    // Grid reads as a very faint diagnostic inscribed in the shared water material.
    ' if(u_grid>.5){vec2 local=p/u_scale-world(cell(p/u_scale));float edge=10.;for(int j=0;j<6;j++){float a=float(j)*PI/3.;edge=min(edge,A-dot(vec2(cos(a),sin(a)),local));}float line=1.-smoothstep(.008,.027,edge);col=mix(col,vec3(.29,.48,.47),line*.13);}',
    ' float vignette=1.-.18*smoothstep(.25,.9,length((uv-.5)*vec2(.75,1.)));col*=vignette;',
    ' col=pow(max(col,vec3(0.)),vec3(.91)); gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');
  function create(canvas, options) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new Error('An ocean canvas is required.');
    var gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL is unavailable. This ocean preview needs a browser with WebGL enabled.');
    function shader(type, source) {
      var s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { var message = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('Ocean shader: ' + message); } return s;
    }
    var vs = shader(gl.VERTEX_SHADER, vertex), fs = shader(gl.FRAGMENT_SHADER, fragment), program = gl.createProgram();
    gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Ocean program: ' + gl.getProgramInfoLog(program));
    var buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    gl.useProgram(program); var position = gl.getAttribLocation(program, 'a_position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    var uniforms = {}; ['resolution','time','amplitude','scale','unique','grid','gauge','period','variation'].forEach(function (name) { uniforms[name] = gl.getUniformLocation(program, 'u_' + name); });
    var state = clean(options), paused = false, destroyed = false, frame = 0, time = 0, epoch = performance.now(), observer;
    function renderAt(seconds) {
      if (destroyed) return;
      time = finite(seconds, 0, 0, 1e8);
      var rect = canvas.getBoundingClientRect(), dpr = Math.min(root.devicePixelRatio || 1, 1.5);
      var w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h); gl.useProgram(program); gl.uniform2f(uniforms.resolution, w, h);
      gl.uniform1f(uniforms.time, time * state.speed); gl.uniform1f(uniforms.amplitude, state.amplitude); gl.uniform1f(uniforms.scale, state.hexScale);
      gl.uniform1f(uniforms.period, state.period); gl.uniform1f(uniforms.variation, state.variation);
      gl.uniform1f(uniforms.unique, state.variant === 'unique' ? 1 : 0); gl.uniform1f(uniforms.grid, state.grid ? 1 : 0); gl.uniform1f(uniforms.gauge, state.gauge ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    function tick(now) { if (paused || destroyed) return; renderAt((now - epoch) / 1000); frame = root.requestAnimationFrame(tick); }
    function pause() { paused = true; root.cancelAnimationFrame(frame); }
    function resume() { if (destroyed || !paused) return; paused = false; epoch = performance.now() - time * 1000; frame = root.requestAnimationFrame(tick); }
    function visibility() { if (document.hidden) root.cancelAnimationFrame(frame); else if (!paused && !destroyed) { epoch = performance.now() - time * 1000; root.cancelAnimationFrame(frame); frame = root.requestAnimationFrame(tick); } }
    document.addEventListener('visibilitychange', visibility);
    if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(function () { if (paused) renderAt(time); }); observer.observe(canvas); }
    renderAt(0); frame = root.requestAnimationFrame(tick);
    return {
      setOptions: function (patch) { state = clean(Object.assign({}, state, patch)); renderAt(time); return Object.assign({}, state); },
      renderAt: renderAt, pause: pause, resume: resume,
      destroy: function () { if (destroyed) return; pause(); destroyed = true; if (observer) observer.disconnect(); document.removeEventListener('visibilitychange', visibility); gl.deleteBuffer(buffer); gl.deleteProgram(program); var ext = gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); },
      get options() { return Object.assign({}, state); }, get time() { return time; }
    };
  }
  root.OceanPatterns = Object.freeze({ create: create, evaluate: evaluate, cellAt: cellAt, worldFromAxial: worldFromAxial, axialFromWorld: axialFromWorld, phaseForCell: phaseForCell, defaults: defaults,
    diagnostics: Object.freeze({ period: PERIOD, velocity: VELOCITY.slice(), epsilon: EPSILON, uniqueWeights: [0.75, 0.15, 0.10], derivative: 'analytic complete-field gradient', localPhase: 'U(1) frame cancellation; no simulated gauge dynamics', periodicSymmetry: 'C6 about the advected center; N=12 axial supercell', uniqueSymmetry: 'directional base breaks C6; fixed hex partition; irrational cell phases; no finite translation repeat', boundaryContinuity: 'C1: cell-interior perturbation and its first derivative vanish on every edge of the directional base' }) });
})(typeof window !== 'undefined' ? window : globalThis);
