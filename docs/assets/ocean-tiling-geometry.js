/*
 * Ammann–Beenker cut-and-project geometry and a bounded shared-edge deformation.
 *
 * This is an aperiodic tiling, NOT a periodic octagonal decoration. Regular
 * octagons alone cannot tile the plane; the actual tiles here are unit squares
 * and 45/135-degree rhombi, with eight possible directed edge directions.
 *
 * Let e_j=(cos(j*pi/4),sin(j*pi/4)) and
 *     f_j=(cos(3*j*pi/4),sin(3*j*pi/4)), j=0..3.
 * Vertices are P_parallel n, n in Z^4, provided P_perp n belongs to w+W.
 * W=P_perp[-1/2,1/2]^4 is the regular unit-side octagon
 * |u|<=a, |v|<=a, |u|+|v|<=sqrt(2)*a, a=(1+sqrt(2))/2.
 * Accepted nearest lattice neighbours are connected; elementary lattice squares
 * with all four corners accepted give the square/rhombus faces. The irrational
 * projection gives long-range order without a translation period. The generic
 * window shift removes singular choices on the acceptance-window boundary.
 *
 * Mathematical reference (formulas (1),(2), Section 2):
 * A. N. Rogers, C. Richard and A. J. Guttmann, Self-avoiding walks and polygons on quasiperiodic
 * tilings, https://arxiv.org/abs/cond-mat/0302414 . This implementation is original.
 *
 * generate({radius,edgeLength,windowShift}) covers the disk of radius
 * radius*edgeLength and includes a one-tile guard band. IDs use integer lattice
 * coordinates and remain stable when radius changes; indices are patch-local.
 * Faces are CCW. Edge a->b is the POSITIVE lattice-axis direction. A face's
 * edgeDirections entry is +1 if its boundary follows a->b, -1 otherwise.
 * Thus a single deformed edge, reversed for its neighbour, cannot open a seam.
 */
(function (root) {
  'use strict';
  var S = Math.SQRT1_2;
  var SILVER = 1 + Math.SQRT2;
  var A = SILVER / 2;
  var DIAGONAL_BOUND = A * Math.SQRT2;
  var WINDOW_RADIUS = A / Math.cos(Math.PI / 8);
  var INFLATION = [[1, 1, 0, -1], [1, 1, 1, 0], [0, 1, 1, 1], [-1, 0, 1, 1]];
  var MIN_MIDPOINT_SPACING = Math.sin(Math.PI / 8);
  var MAX_TWIST_RADIUS = 0.49 * MIN_MIDPOINT_SPACING;
  var DEFAULT_SHIFT = [0.17320508075688773, 0.2718281828459045];
  var PARALLEL = [[1, 0], [S, S], [0, 1], [-S, S]];
  var PERPENDICULAR = [[1, 0], [-S, S], [0, -1], [S, S]];
  var WEDGE_SLOPE = 0.45 * Math.tan(Math.PI / 8);
  // max_{0<t<1} 16*t^2*(1-t)^2/min(t,1-t) = 64/27.
  var MAX_EDGE_AMPLITUDE = WEDGE_SLOPE * 27 / 64;

  function latticeKey(n) { return n.join(','); }
  function number(value, fallback) { return typeof value === 'number' && isFinite(value) ? value : fallback; }
  function hash(value) {
    var result = 2166136261;
    for (var i = 0; i < value.length; i++) {
      result ^= value.charCodeAt(i);
      result = Math.imul(result, 16777619);
    }
    return result >>> 0;
  }
  function containsInternal(u, v, shift) {
    shift = shift || DEFAULT_SHIFT;
    u -= shift[0]; v -= shift[1];
    // Strict inequalities implement an open acceptance window. The default
    // cut is generic. For a user-supplied singular cut this makes no claim of
    // selecting the correct one-sided limit; diagnostics exposes any holes.
    return Math.abs(u) < A && Math.abs(v) < A && Math.abs(u) + Math.abs(v) < DIAGONAL_BOUND;
  }
  function project(n) {
    return {
      x: n[0] + (n[1] - n[3]) * S,
      y: n[2] + (n[1] + n[3]) * S,
      u: n[0] + (n[3] - n[1]) * S,
      v: (n[1] + n[3]) * S - n[2]
    };
  }
  function generate(options) {
    options = options || {};
    var radius = number(options.radius, 12);
    var edgeLength = number(options.edgeLength, 1);
    if (!(radius > 0 && radius <= 100)) throw new RangeError('Ocean tiling radius must be in (0, 100].');
    if (!(edgeLength > 0 && edgeLength <= 10000)) throw new RangeError('Ocean tiling edgeLength must be in (0, 10000].');
    var w = options.windowShift || DEFAULT_SHIFT;
    if (!Array.isArray(w) || w.length !== 2 || !isFinite(w[0]) || !isFinite(w[1]) || Math.abs(w[0]) > 1e8 || Math.abs(w[1]) > 1e8) {
      throw new RangeError('windowShift must contain two finite coordinates of magnitude at most 1e8.');
    }
    w = [Number(w[0]), Number(w[1])];
    var candidates = [], byLattice = new Map();
    var outerRadius = radius + 3;
    // Orthogonality gives n_j=(p.e_j+q.f_j)/2. The bounds are therefore
    // exhaustive, including negative coordinates and displaced windows.
    var span = (outerRadius + WINDOW_RADIUS) / 2;
    var c1 = (w[1] - w[0]) * S / 2;
    var c3 = (w[0] + w[1]) * S / 2;
    var margin = Infinity;
    for (var n1 = Math.ceil(c1 - span); n1 <= Math.floor(c1 + span); n1++) {
      for (var n3 = Math.ceil(c3 - span); n3 <= Math.floor(c3 + span); n3++) {
        var p = (n1 - n3) * S;
        var q = (n1 + n3) * S;
        // The axial window inequalities bound n0,n2 to at most three
        // consecutive integers each; enumeration costs O(radius^2), not O(r^4).
        for (var n0 = Math.ceil(p + w[0] - A); n0 <= Math.floor(p + w[0] + A); n0++) {
          for (var n2 = Math.ceil(q - w[1] - A); n2 <= Math.floor(q - w[1] + A); n2++) {
            var u = n0 - p, v = q - n2;
            var ax = Math.abs(u - w[0]), ay = Math.abs(v - w[1]);
            if (!containsInternal(u, v, w)) continue;
            var x = n0 + p, y = n2 + q;
            if (x * x + y * y > outerRadius * outerRadius) continue;
            var n = [n0, n1, n2, n3], id = latticeKey(n);
            margin = Math.min(margin, A - ax, A - ay, (DIAGONAL_BOUND - ax - ay) * S);
            byLattice.set(id, candidates.length);
            candidates.push({id: id, lattice: n, x: x, y: y, internal: [u, v]});
          }
        }
      }
    }
    var vertices = [], faces = [], edges = [], used = new Map(), edgeIndex = new Map();
    function useVertex(candidateIndex) {
      if (used.has(candidateIndex)) return used.get(candidateIndex);
      var original = candidates[candidateIndex];
      var index = vertices.length;
      vertices.push({id: original.id, lattice: original.lattice, x: original.x * edgeLength, y: original.y * edgeLength, internal: original.internal});
      used.set(candidateIndex, index);
      return index;
    }
    var faceRadius = radius + 1;
    for (var vi = 0; vi < candidates.length; vi++) {
      var original = candidates[vi];
      for (var i = 0; i < 4; i++) {
        for (var j = i + 1; j < 4; j++) {
          var ni = original.lattice.slice(), nj = original.lattice.slice(), nij = original.lattice.slice();
          ni[i]++; nj[j]++; nij[i]++; nij[j]++;
          var ii = byLattice.get(latticeKey(ni)), ji = byLattice.get(latticeKey(nj)), iji = byLattice.get(latticeKey(nij));
          if (ii === undefined || ji === undefined || iji === undefined) continue;
          var centerX = original.x + (PARALLEL[i][0] + PARALLEL[j][0]) / 2;
          var centerY = original.y + (PARALLEL[i][1] + PARALLEL[j][1]) / 2;
          if (centerX * centerX + centerY * centerY > faceRadius * faceRadius) continue;
          var faceVertices = [vi, ii, iji, ji].map(useVertex);
          var faceNumber = faces.length;
          var face = {
            id: original.id + ':' + i + j,
            type: j - i === 2 ? 'square' : 'rhombus',
            orientation: i,
            angle: i * Math.PI / 4,
            axes: [i, j],
            vertices: faceVertices,
            edges: [], edgeDirections: [],
            center: {x: centerX * edgeLength, y: centerY * edgeLength},
            area: (j - i === 2 ? 1 : S) * edgeLength * edgeLength,
            signature: hash(original.id + ':' + i + j)
          };
          for (var k = 0; k < 4; k++) {
            var from = faceVertices[k], to = faceVertices[(k + 1) % 4];
            var fromN = vertices[from].lattice, toN = vertices[to].lattice, axis = 0;
            while (fromN[axis] === toN[axis]) axis++;
            var positive = toN[axis] > fromN[axis];
            var ea = positive ? from : to, eb = positive ? to : from;
            var edgeId = vertices[ea].id + ':' + axis;
            var ei = edgeIndex.get(edgeId);
            if (ei === undefined) {
              ei = edges.length;
              edgeIndex.set(edgeId, ei);
              edges.push({
                id: edgeId, a: ea, b: eb,
                start: {x: vertices[ea].x, y: vertices[ea].y},
                end: {x: vertices[eb].x, y: vertices[eb].y},
                direction: axis, angle: axis * Math.PI / 4,
                length: edgeLength, faces: [], signature: hash(edgeId)
              });
            }
            edges[ei].faces.push(faceNumber);
            face.edges.push(ei);
            face.edgeDirections.push(positive ? 1 : -1);
          }
          faces.push(face);
        }
      }
    }
    var bounds = {minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
    vertices.forEach(function (vtx) {
      bounds.minX = Math.min(bounds.minX, vtx.x); bounds.maxX = Math.max(bounds.maxX, vtx.x);
      bounds.minY = Math.min(bounds.minY, vtx.y); bounds.maxY = Math.max(bounds.maxY, vtx.y);
    });
    var boundaryEdges = 0, interiorBoundaryEdges = 0, nonManifoldEdges = 0;
    edges.forEach(function (edge) {
      if (edge.faces.length > 2) nonManifoldEdges++;
      if (edge.faces.length === 1) {
        boundaryEdges++;
        var mx = (edge.start.x + edge.end.x) / (2 * edgeLength);
        var my = (edge.start.y + edge.end.y) / (2 * edgeLength);
        if (mx * mx + my * my < radius * radius) interiorBoundaryEdges++;
      }
    });
    return {
      vertices: vertices, faces: faces, edges: edges,
      radius: radius, edgeLength: edgeLength,
      coveredRadius: radius * edgeLength, bounds: bounds,
      window: {shift: w, halfWidth: A, diagonalBound: DIAGONAL_BOUND, circumradius: WINDOW_RADIUS},
      silverRatio: SILVER,
      diagnostics: {
        boundaryEdges: boundaryEdges, interiorBoundaryEdges: interiorBoundaryEdges,
        nonManifoldEdges: nonManifoldEdges,
        eulerCharacteristic: vertices.length - edges.length + faces.length,
        windowBoundaryMargin: margin
      }
    };
  }

  /* A continuous shared-edge shape family, with an explicit noncrossing bound.
   * Let E(t)=a+t(b-a)+d(t)N. It never retraces because its tangent projection
   * along b-a is exactly t. The quartic envelope gives d=d'=0 at both ends.
   * |d| <= .45*tan(pi/8)*min(t,1-t)*L keeps every curve inside a strict
   * wedge corridor: AB edges meet at >=pi/4 and opposite sides are separated
   * by >=sin(pi/4)*L. These corridors do not cross in a square or rhombus.
   * Each face MUST reuse this canonical edge; its neighbour reverses it.
   * These are deformations of a known tiling, not new crystallographic groups.
   */
  function deformEdge(edge, t, options) {
    options = options || {};
    if (options.mode === 'twist') return twistEdge(edge, t, options);
    t = Math.max(0, Math.min(1, number(t, 0)));
    var a = edge.start, b = edge.end;
    if (!a || !b) throw new TypeError('deformEdge expects an edge from generate().');
    var dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    var amplitude = Math.max(-MAX_EDGE_AMPLITUDE, Math.min(MAX_EDGE_AMPLITUDE, number(options.amplitude, 0.075)));
    var octaves = Math.max(1, Math.min(6, Math.round(number(options.octaves, 3))));
    var roughness = Math.max(0.25, Math.min(1.5, number(options.roughness, 0.72)));
    var seed = hash(edge.id + ':' + (options.seed === undefined ? 0 : options.seed));
    var total = 0, normalization = 0, frequency = 1, weight = 1;
    for (var octave = 0; octave < octaves; octave++) {
      var phase = (hash(seed + ':' + octave) / 4294967296) * 2 * Math.PI;
      total += weight * Math.sin(2 * Math.PI * frequency * t + phase);
      normalization += weight;
      frequency *= SILVER;
      weight *= Math.pow(SILVER, -roughness);
    }
    var envelope = 16 * t * t * (1 - t) * (1 - t);
    var offset = amplitude * length * envelope * total / normalization;
    return {x: a.x + t * dx - dy * offset / length, y: a.y + t * dy + dx * offset / length, offset: offset};
  }
  /* A stronger curl family, also with a global no-crossing construction.
   * Around each edge midpoint m, apply T(p)=m+R_theta(r)(p-m),
   * theta(r)=angle*(1-r^2/rho^2)^3 for r<rho, and zero outside.
   * Radius r is unchanged, so the inverse uses -theta and det(DT)=1.
   * The minimum distance between AB edge midpoints is sin(pi/8)*L;
   * rho<half that distance makes all support disks disjoint. Other edges
   * miss the disk: midpoint-to-adjacent-edge distance >=sin(pi/4)*L/2.
   * Consequently evaluating only this edge's twist is the restriction of
   * one global homeomorphism. Arbitrary finite angle is geometrically safe;
   * the bounded angle here also keeps ordinary polyline sampling practical.
   * Edge endpoints and their tangent neighbourhoods remain exactly fixed.
   */
  function twistPoint(point, edge, options) {
    options = options || {};
    var a = edge.start, b = edge.end;
    if (!a || !b) throw new TypeError('twistPoint expects an edge from generate().');
    var length = Math.hypot(b.x - a.x, b.y - a.y);
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    var dx = point.x - mx, dy = point.y - my;
    var fraction = Math.max(0.001, Math.min(MAX_TWIST_RADIUS, number(options.radius, 0.18)));
    var r = Math.hypot(dx, dy) / length;
    var angle = Math.max(-4 * Math.PI, Math.min(4 * Math.PI, number(options.angle, 2.8)));
    if (options.alternate && hash(edge.id + ':' + (options.seed || 0)) % 2) angle = -angle;
    var theta = r < fraction ? angle * Math.pow(1 - r * r / (fraction * fraction), 3) : 0;
    if (theta === 0) return {x: point.x, y: point.y, angle: 0};
    var cs = Math.cos(theta), sn = Math.sin(theta);
    return {x: mx + dx * cs - dy * sn, y: my + dx * sn + dy * cs, angle: theta};
  }
  function twistEdge(edge, t, options) {
    t = Math.max(0, Math.min(1, number(t, 0)));
    return twistPoint({x: edge.start.x + t * (edge.end.x - edge.start.x), y: edge.start.y + t * (edge.end.y - edge.start.y)}, edge, options);
  }
  // P_parallel M=delta P_parallel, P_perp M=(1-sqrt(2))P_perp.
  // Thus this same integer map expands geometric lengths by the silver
  // ratio and contracts the internal acceptance coordinates. It provides
  // an explicit scale coupling for a delta-lacunary octave spectrum.
  // M alone is NOT a complete face-substitution rule.
  function inflateLattice(n) {
    return INFLATION.map(function (row) {
      return row.reduce(function (sum, value, index) { return sum + value * n[index]; }, 0);
    });
  }
  var api = Object.freeze({
    generate: generate, project: project, containsInternal: containsInternal,
    deformEdge: deformEdge, twistEdge: twistEdge, twistPoint: twistPoint, silverRatio: SILVER,
    inflationMatrix: INFLATION, inflateLattice: inflateLattice,
    minEdgeMidpointSpacing: MIN_MIDPOINT_SPACING, maxTwistRadius: MAX_TWIST_RADIUS,
    maxEdgeAmplitude: MAX_EDGE_AMPLITUDE, wedgeSlope: WEDGE_SLOPE,
    parallelBasis: PARALLEL, perpendicularBasis: PERPENDICULAR
  });
  root.OceanTilingGeometry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
