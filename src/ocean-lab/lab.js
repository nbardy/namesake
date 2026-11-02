(function () {
  'use strict';
  var sets = [
    { title: 'Reciprocal-lattice swells', implemented: 'A',
      eq: 'u=(q−0.15st)/N; v=(r−0.08st)/N; N=12\nH₁ = (0.55/3)S(u,v) + (0.08/3)S(2u,2v)',
      detail: 'Integer reciprocal frequencies give an exact N-cell repeat along either axial basis vector. S is invariant under the sixfold rotation R. Advection preserves that symmetry around a moving center, rather than around the fixed screen origin.',
      look: 'The baseline: broad connected swell shoulders, quiet troughs, and a finite repeating supertile. Directional light may break the image’s visible symmetry even when the height field retains it.' },
    { title: 'Sixfold orbit average',
      eq: 'f(u,v,t)=cos(2πu+α sin(2πv−ωt))\nH₂=(1/6) Σⱼ₌₀⁵ f(Rʲ(u,v),t)',
      detail: 'A rotation permutes the six summands, so H₂(Rx,t)=H₂(x,t). Each term is periodic under the same integer superlattice shifts. All derivatives match at the repeat boundaries.',
      look: 'Curved sixfold interference. A useful exact-symmetry experiment, with a risk of looking like a rosette rather than moving water.' },
    { title: 'Hex-periodic Gerstner surface',
      eq: 'θⱼ=kⱼ·x−ωⱼt+φⱼ; kⱼ∈reciprocal superlattice\nP(x,t)=(x−Σ QⱼAⱼ k̂ⱼ sin θⱼ, Σ Aⱼ cos θⱼ)\nΣ |Qⱼ|Aⱼ|kⱼ| < 1  [sufficient no-fold bound]',
      detail: 'The horizontal displacement and height both share the hex-compatible superlattice. A shared vertex remains shared after displacement. Unequal directional weights preserve seamless repetition while intentionally breaking exact C₆.',
      look: 'Sharper crests and wider troughs give a stronger ocean cue. Deep-water dispersion does not generally produce an exact time loop.',
      source: 'https://developer.nvidia.com/gpugems/gpugems/part-i-natural-effects/chapter-1-effective-water-simulation-physical-models' },
    { title: 'Gauge-covariant edge currents',
      eq: 'δᵢⱼ=θⱼ−θᵢ−Aᵢⱼ; Eᵢⱼ=1−cos δᵢⱼ\nθᵢ′=θᵢ+χᵢ; Aᵢⱼ′=Aᵢⱼ+χⱼ−χᵢ\nW(face)=exp(i Σedges Aᵢⱼ)',
      detail: 'Both bond energy and the closed-loop holonomy stay invariant under arbitrary local U(1) phase relabeling. Each shared edge must use one common connection. Changing every phase by the same amount cannot by itself animate these invariants.',
      look: 'Current filaments and eddies along a hex network. A genuine gauge construction, but not on its own a fluid simulation.',
      source: 'https://www.tpi.uni-jena.de/~floerchinger/qft2/lecture15/' },
    { title: 'Area-preserving tidal warp',
      eq: 'U=u+α sin(2πv+ω₁t)\nV=v+β sin(2πU−ω₂t)\nH₅=S(U,V); det D(U,V)=1',
      detail: 'Each periodic shear has determinant one; their composition preserves area and obeys W(z+n)=W(z)+n. Full derivatives require the warp Jacobian. Shear order distinguishes directions, so exact C₆ is lost.',
      look: 'Long swells bend into tidal currents. This is an incompressible coordinate warp, not a numerical solution of the ocean equations. The time animation of a shear composition is not automatically a one-parameter group.' },
    { title: 'Torus-embedded phase variation',
      eq: 'T(u,v)=(cos 2πu,sin 2πu,cos 2πv,sin 2πv)\nF(z,t)=Σ aⱼ sin(wⱼ·z−ωⱼt+φⱼ)\nH₆=sin(2πu−ωt+ηF(T(u,v),t))',
      detail: 'T(u+m,v+n)=T(u,v) makes any smooth composed field exactly periodic. U(1)×U(1) is the underlying continuous phase torus. Arbitrary F does not preserve sixfold rotations unless orbit-averaged.',
      look: 'Many different ripple shapes within one macro-repeat. Large phase modulation can overwhelm the carrier wave and look cloudy.' },
    { title: 'Incommensurate sixfold stars',
      eq: 'Kⱼ=rotation(jπ/3)k\nH₇=Σⱼ₌₀⁵ cos(Kⱼ·x−ω₁t)\n   +A Σⱼ₌₀⁵ cos(√2 Kⱼ·x−ω₂t)',
      detail: 'Each full six-vector orbit is C₆-invariant. The irrational spatial ratio removes a common nonzero translation period. Opposite wavevectors pair into standing waves; a dominant one-way traveling swell is sacrificed.',
      look: 'Recurring but never exactly repeating interference. Mathematically close to the brief, visually at risk of becoming a kaleidoscope.',
      source: 'https://arxiv.org/abs/2201.11848' },
    { title: 'Boundary-flat unique interiors', implemented: 'B',
      eq: 'Hdir=Σⱼ wⱼ[0.55 cos(2πpⱼ)+0.08 cos(4πpⱼ)]\nw=(0.75,0.15,0.10); p=(u,v,u+v)\nB(ξ)=Πⱼ₌₀⁵ (1−nⱼ·ξ/a)²\nθₘₙ=2π(√2m+√3n)\nH₈=Hdir+ε B(ξ) sin(2.7ξₓ+1.3ξᵧ+θₘₙ−0.42st)\nB=0 and ∇B=0 on every shared edge',
      detail: 'The extra height and slope vanish at each cell boundary, giving exact C¹ matching to the common swell. The irrational phase assignment has no finite lattice period. Its sine/cosine combination gives different interior functions in the real-valued construction; finite-precision rendering cannot guarantee infinite visual uniqueness.',
      look: 'A directional moving ocean with small cell-specific ripples. The hex support is sixfold, but the arbitrary local phases break global C₆. Large ε makes dimples, so this is a restrained-detail test.' },
    { title: 'Edge-matched hexagonal currents',
      eq: 'eⱼ=c+a nⱼ; choose a noncrossing pairing (a,b)\nC(u)=(1−u)³eₐ+3(1−u)²u(eₐ−λnₐ)\n     +3(1−u)u²(eᵦ−λnᵦ)+u³eᵦ',
      detail: 'Adjacent hexes use the same edge midpoint and matching tangent length λ. The outgoing derivative on one tile equals the incoming derivative on its neighbor, giving C¹ path joins. Animation phase must follow each connected path, not restart in every tile.',
      look: 'Graphic tidal channels and woven ribbons. Five noncrossing pairings alone cannot make every tile unique, and interior curve collisions still need checking.',
      source: 'https://arxiv.org/abs/1103.6046' },
    { title: 'Frustrated XY phase waves',
      eq: 'E=J Σneighbors cos(θd−θc−Acd); J>0\nθ⁰ₘₙ=(2π/3)(m−n)\nθc(t)=θ⁰c+ε cos(k·c−ωt)\nIᶜ=Σneighbors sin²(θd−θc−Acd)',
      detail: 'The triangular center lattice admits a 120° three-color state. With consistent link transformations, Iᶜ is gauge invariant. A shared smooth reconstruction, such as normalized Gaussian interpolation, prevents independently drawn cell heights from making seams.',
      look: 'Organized competing currents and defects. More compelling as a scientific graphic than as a quiet homepage surface.',
      source: 'https://arxiv.org/abs/2004.01416' },
    { title: 'Six-neighbor discrete wave equation',
      eq: 'Δd uᶜ=(2/3d²) Σsix neighbors (uᵈ−uᶜ)\nüᶜ+2γu̇ᶜ=v²Δd uᶜ\nΩ²(k)=(4v²/3d²) [γ=0][3−cos(k·a₁)−cos(k·a₂)\n                        −cos(k·(a₂−a₁))]',
      detail: 'The discrete operator is C₆-equivariant even when a chosen wave state is not. Long waves approach the isotropic continuum equation. Shared interpolation gives a continuous surface. A leapfrog solver needs Δt≤d√(2/3)/v in the undamped case.',
      look: 'Propagation and interference with an explicit evolution law. It is a membrane/shallow-water stylization rather than full deep-water dispersion.',
      source: 'https://arxiv.org/abs/2006.00854' },
    { title: 'Analytic sixfold tide lens', rejected: true,
      eq: 'z=x+iy; ζ=exp(iπ/3)\nf(z)=z+εz⁷/L⁶; f(ζz)=ζf(z)\nf′(z)=1+7ε(z/L)⁶',
      detail: 'This local conformal warp is regular only away from its critical points, and its distortion grows without bound. An entire analytic warp with f(z+aᵢ)=f(z)+aᵢ for two independent periods must be a translation: f−z is bounded, entire, and doubly periodic.',
      look: 'Rejected for an endless tiled ocean. The local lens is attractive algebraically, but its global behavior violates the brief. A smooth nonconformal periodic warp avoids this obstruction.',
      source: 'https://people.math.harvard.edu/~ctm/home/text/class/harvard/213a/25/html/home/course/course.pdf' }
  ];
  var list = document.getElementById('equations');
  sets.forEach(function (set, i) {
    var detail = document.createElement('details'), summary = document.createElement('summary');
    var num = document.createElement('span'); num.className = 'index'; num.textContent = String(i + 1).padStart(2, '0'); summary.appendChild(num);
    var label = document.createElement('span'); label.textContent = set.title; summary.appendChild(label);
    if (set.implemented || set.rejected) { var badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = set.implemented ? 'Prototype ' + set.implemented : 'Rejected'; label.appendChild(badge); }
    detail.appendChild(summary);
    var equation = document.createElement('pre'); equation.className = 'equation'; equation.textContent = set.eq; detail.appendChild(equation);
    [set.detail, set.look].forEach(function (text) { var p = document.createElement('p'); p.textContent = text; detail.appendChild(p); });
    if (set.source) { var source = document.createElement('a'); source.href = set.source; source.textContent = 'Mathematical background ↗'; detail.appendChild(source); }
    if (set.implemented) detail.open = true;
    list.appendChild(detail);
  });
  var api = window.OceanPatterns;
  var options = { speed: 0.65, amplitude: 1.7, variation: 0.006, period: 12, grid: true, gauge: false };
  var renderers = [], time = 0, previous = 0, frame = 0, inView = true;
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)'), playing = !motion.matches;
  ['periodic', 'unique'].forEach(function (variant) {
    var canvas = document.getElementById(variant);
    try { var renderer = api.create(canvas, Object.assign({}, options, { variant: variant, speed: 1 })); renderer.pause(); renderers.push({ variant: variant, renderer: renderer }); }
    catch (error) { var message = canvas.parentElement.querySelector('.error'); message.textContent = error.message; message.hidden = false; }
  });
  function draw() { renderers.forEach(function (entry) { entry.renderer.renderAt(time); }); }
  function updateOptions(patch) {
    Object.assign(options, patch);
    renderers.forEach(function (entry) { entry.renderer.setOptions(Object.assign({}, options, { variant: entry.variant, speed: 1 })); });
    draw(); runChecks();
  }
  function tick(now) { frame = 0; if (!playing || document.hidden || !inView) return; if (previous) time += Math.min((now - previous) / 1000, 0.05) * options.speed; previous = now; draw(); frame = requestAnimationFrame(tick); }
  function schedule() { cancelAnimationFrame(frame); previous = 0; frame = 0; if (playing && !document.hidden && inView) frame = requestAnimationFrame(tick); document.getElementById('play').textContent = playing ? 'Pause' : 'Play'; }
  document.getElementById('play').addEventListener('click', function () { playing = !playing; schedule(); });
  document.getElementById('reset').addEventListener('click', function () { time = 0; previous = 0; draw(); });
  ['speed', 'amplitude', 'variation'].forEach(function (key) { document.getElementById(key).addEventListener('input', function (event) { var value = Number(event.target.value), patch = {}; patch[key] = value; document.getElementById(key + '-value').value = value.toFixed(key === 'variation' ? 3 : 2); updateOptions(patch); }); });
  ['grid', 'gauge'].forEach(function (key) { document.getElementById(key).addEventListener('change', function (event) { var patch = {}; patch[key] = event.target.checked; updateOptions(patch); }); });
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', function () { playing = !motion.matches; schedule(); draw(); });
  window.addEventListener('resize', draw);
  if (typeof IntersectionObserver !== 'undefined') { var observer = new IntersectionObserver(function (entries) { inView = entries[0].isIntersecting; schedule(); }, { rootMargin: '120px' }); observer.observe(document.querySelector('.comparisons')); }
  function runChecks() {
    if (!api) return;
    var e = api.evaluate, t = 3.7, result = { periodic: 0, boundaryHeight: 0, boundarySlope: 0, gauge: 0, gradient: 0, rotation: 0, detailShiftRms: 0, samples: 240 };
    var shifts = [api.worldFromAxial(options.period, 0), api.worldFromAxial(0, options.period)];
    var noGauge = Object.assign({}, options, { gauge: false }), withGauge = Object.assign({}, options, { gauge: true });
    var max = Math.max, abs = Math.abs, sum = 0;
    for (var i = 0; i < result.samples; i++) {
      var x = 23 * Math.sin(i * 2.171 + 0.16), y = 19 * Math.cos(i * 1.371 + 0.67);
      var a = e('periodic', x, y, t, options), b = e('unique', x, y, t, noGauge), g = e('unique', x, y, t, withGauge);
      shifts.forEach(function (shift) { var p = e('periodic', x + shift.x, y + shift.y, t, options); result.periodic = max(result.periodic, abs(a.height - p.height), abs(a.dx - p.dx), abs(a.dy - p.dy)); });
      result.gauge = max(result.gauge, abs(b.height - g.height), abs(b.dx - g.dx), abs(b.dy - g.dy));
      var shifted = e('unique', x + shifts[0].x, y + shifts[0].y, t, options); sum += Math.pow(b.height - shifted.height, 2);
      var step = 1e-5, dx = (e('unique', x + step, y, t, options).height - e('unique', x - step, y, t, options).height) / (2 * step), dy = (e('unique', x, y + step, t, options).height - e('unique', x, y - step, t, options).height) / (2 * step);
      result.gradient = max(result.gradient, abs(dx - b.dx), abs(dy - b.dy));
      var start = e('periodic', x, y, 0, options), rotated = e('periodic', 0.5 * x - Math.sqrt(3) * y / 2, Math.sqrt(3) * x / 2 + 0.5 * y, 0, options);
      result.rotation = max(result.rotation, abs(start.height - rotated.height));
    }
    result.detailShiftRms = Math.sqrt(sum / result.samples);
    for (var q = -3; q <= 3; q++) for (var r = -3; r <= 3; r++) for (var j = 0; j < 6; j++) {
      var center = api.worldFromAxial(q, r), angle = j * Math.PI / 3, nx = Math.cos(angle), ny = Math.sin(angle), apothem = Math.sqrt(3) / 2;
      var px = center.x + apothem * nx - 0.23 * ny, py = center.y + apothem * ny + 0.23 * nx;
      var base = e('unique', px, py, t, Object.assign({}, options, { variation: 0 })), detail = e('unique', px, py, t, options);
      result.boundaryHeight = max(result.boundaryHeight, abs(base.height - detail.height));
      result.boundarySlope = max(result.boundarySlope, abs(base.dx - detail.dx), abs(base.dy - detail.dy));
    }
    [['period-error','periodic'],['edge-error','boundaryHeight'],['slope-error','boundarySlope'],['gauge-error','gauge']].forEach(function (item) { document.getElementById(item[0]).textContent = result[item[1]] < 1e-14 ? '< 10⁻¹⁴' : result[item[1]].toExponential(1); });
    document.getElementById('checks-note').textContent = '240 sample points and 294 shared-edge points, including negative cells. Analytic-gradient error versus central differences: ' + result.gradient.toExponential(1) + '. Sixfold field error at t=0: ' + result.rotation.toExponential(1) + '. B changes by RMS ' + result.detailShiftRms.toFixed(4) + ' after A’s repeat shift. These are numerical checks of the formulas, not proof of aperiodicity or visual quality.';
    window.oceanLabChecks = result;
  }
  window.oceanLab = { pause: function () { playing = false; schedule(); }, play: function () { playing = true; schedule(); }, setTime: function (value) { time = value; previous = 0; draw(); }, setOptions: updateOptions, get time() { return time; }, get options() { return Object.assign({}, options); }, renderers: renderers };
  runChecks(); draw(); schedule();
  window.addEventListener('pagehide', function (event) { cancelAnimationFrame(frame); if (!event.persisted) renderers.forEach(function (entry) { entry.renderer.destroy(); }); });
  window.addEventListener('pageshow', function (event) { if (event.persisted) { draw(); schedule(); } });
})();
