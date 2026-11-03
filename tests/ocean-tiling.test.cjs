const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../src/assets/ocean-tiling-geometry.js');
const tessellation = require('../src/assets/ocean-tessellation.js');

const close = (actual, expected, tolerance = 1e-9, label = 'value') => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} vs ${expected} (tolerance ${tolerance})`);
};
const pointClose = (a, b, tolerance = 1e-9, label = 'point') => {
  close(a.x, b.x, tolerance, `${label}.x`);
  close(a.y, b.y, tolerance, `${label}.y`);
};
const midpoint = edge => ({
  x: (edge.start.x + edge.end.x) / 2,
  y: (edge.start.y + edge.end.y) / 2
});
const along = (a, b, t) => ({x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y)});
const polygonArea = points => points.reduce((sum, p, i) => {
  const q = points[(i + 1) % points.length];
  return sum + p.x * q.y - p.y * q.x;
}, 0) / 2;

// Independent convex clipping checks the total covered area, rather than
// relying on the generator's manifold/coverage diagnostics.
function clip(points, axis, bound, sign) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const da = sign * (a[axis] - bound), db = sign * (b[axis] - bound);
    if (da <= 0) result.push(a);
    if (da * db < 0) result.push(along(a, b, da / (da - db)));
  }
  return result;
}
function clippedSquareArea(patch, halfWidth) {
  return patch.faces.reduce((sum, face) => {
    let points = face.vertices.map(index => patch.vertices[index]);
    for (const [axis, bound, sign] of [
      ['x', halfWidth, 1], ['x', -halfWidth, -1],
      ['y', halfWidth, 1], ['y', -halfWidth, -1]
    ]) points = clip(points, axis, bound, sign);
    return sum + polygonArea(points);
  }, 0);
}
function contains(face, patch, p) {
  return face.vertices.every((index, i) => {
    const a = patch.vertices[index];
    const b = patch.vertices[face.vertices[(i + 1) % face.vertices.length]];
    return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) > 0;
  });
}
function determinant(map, p, epsilon = 1e-6) {
  const xp = map({x: p.x + epsilon, y: p.y});
  const xm = map({x: p.x - epsilon, y: p.y});
  const yp = map({x: p.x, y: p.y + epsilon});
  const ym = map({x: p.x, y: p.y - epsilon});
  return ((xp.x - xm.x) * (yp.y - ym.y) - (yp.x - ym.x) * (xp.y - xm.y)) / (4 * epsilon * epsilon);
}

const cuts = [
  {name: 'generic', shift: undefined},
  {name: 'centered eightfold', shift: [0, 0]},
  {name: 'negative', shift: [-0.3819, -0.7283]}
];
const patches = cuts.map(cut => ({
  ...cut, patch: geometry.generate({radius: 9.1, windowShift: cut.shift})
}));

test('cut-and-project vertices and elementary faces satisfy the AB construction for three cuts', () => {
  const halfWidth = (1 + Math.SQRT2) / 2;
  for (const {name, patch} of patches) {
    const shift = patch.window.shift;
    const vertexIds = new Set(), faceIds = new Set();
    for (const vertex of patch.vertices) {
      assert.ok(vertex.lattice.every(Number.isInteger), `${name}: integer lift`);
      assert.ok(!vertexIds.has(vertex.id), `${name}: unique lifted vertex`);
      vertexIds.add(vertex.id);
      const n = vertex.lattice;
      const x = n[0] + (n[1] - n[3]) / Math.SQRT2;
      const y = n[2] + (n[1] + n[3]) / Math.SQRT2;
      const u = n[0] + (n[3] - n[1]) / Math.SQRT2 - shift[0];
      const v = (n[1] + n[3]) / Math.SQRT2 - n[2] - shift[1];
      pointClose(vertex, {x, y}, 1e-12, `${name}: physical projection`);
      assert.ok(Math.abs(u) < halfWidth && Math.abs(v) < halfWidth &&
        Math.abs(u) + Math.abs(v) < Math.SQRT2 * halfWidth, `${name}: octagonal acceptance`);
    }
    const types = new Set();
    for (const face of patch.faces) {
      assert.ok(!faceIds.has(face.id), `${name}: unique lifted face`);
      faceIds.add(face.id);
      assert.equal(face.vertices.length, 4);
      types.add(face.type);
      const points = face.vertices.map(index => patch.vertices[index]);
      const expectedArea = face.type === 'square' ? 1 : Math.SQRT1_2;
      close(polygonArea(points), expectedArea, 1e-11, `${name}: CCW prototile area`);
      const n = points.map(p => p.lattice);
      for (let j = 0; j < 4; j++) {
        close(Math.hypot(points[j].x - points[(j + 1) % 4].x,
          points[j].y - points[(j + 1) % 4].y), 1, 1e-12, 'unit side');
        close(n[0][j] + n[2][j], n[1][j] + n[3][j], 0, 'lifted elementary square');
      }
    }
    assert.deepEqual([...types].sort(), ['rhombus', 'square']);
  }
});

test('AB patches are connected disks with canonical shared edges traversed in opposite directions', () => {
  for (const {name, patch} of patches) {
    const independentIncidents = patch.edges.map(() => []);
    patch.faces.forEach((face, faceIndex) => {
      assert.equal(face.edges.length, 4);
      assert.equal(face.edgeDirections.length, 4);
      face.edges.forEach((edgeIndex, j) => {
        const edge = patch.edges[edgeIndex], direction = face.edgeDirections[j];
        const from = face.vertices[j], to = face.vertices[(j + 1) % 4];
        assert.equal(from, direction === 1 ? edge.a : edge.b);
        assert.equal(to, direction === 1 ? edge.b : edge.a);
        independentIncidents[edgeIndex].push({faceIndex, direction});
      });
    });
    patch.edges.forEach((edge, index) => {
      const incidents = independentIncidents[index];
      assert.ok(incidents.length === 1 || incidents.length === 2, `${name}: edge manifold`);
      assert.deepEqual(edge.faces.slice().sort((a, b) => a - b),
        incidents.map(item => item.faceIndex).sort((a, b) => a - b));
      if (incidents.length === 2) assert.equal(incidents[0].direction, -incidents[1].direction);
      else assert.ok(Math.hypot(midpoint(edge).x, midpoint(edge).y) >= patch.coveredRadius,
        `${name}: no boundary edges inside covered disk`);
      const a = patch.vertices[edge.a].lattice, b = patch.vertices[edge.b].lattice;
      a.forEach((value, j) => close(b[j] - value, j === edge.direction ? 1 : 0, 0, 'canonical positive lattice edge'));
    });
    assert.equal(patch.vertices.length - patch.edges.length + patch.faces.length, 1, `${name}: Euler disk`);
    const visited = new Set([0]), pending = [0];
    while (pending.length) {
      const face = patch.faces[pending.pop()];
      for (const edgeIndex of face.edges) for (const neighbour of patch.edges[edgeIndex].faces) {
        if (!visited.has(neighbour)) {visited.add(neighbour); pending.push(neighbour);}
      }
    }
    assert.equal(visited.size, patch.faces.length, `${name}: connected face graph`);
  }
});

test('independent clipping and interior point coverage find neither holes nor overlapping faces', () => {
  for (const {name, patch} of patches) {
    const halfWidth = patch.coveredRadius / Math.SQRT2;
    close(clippedSquareArea(patch, halfWidth), 4 * halfWidth * halfWidth, 1e-8, `${name}: exact covered area`);
    let probes = 0;
    for (let x = -8.971; x < 9.1; x += 0.37143) for (let y = -8.947; y < 9.1; y += 0.42371) {
      if (x * x + y * y >= patch.coveredRadius * patch.coveredRadius) continue;
      const point = {x, y};
      const count = patch.faces.reduce((sum, face) => {
        if (Math.abs(x - face.center.x) > 1 || Math.abs(y - face.center.y) > 1) return sum;
        return sum + Number(contains(face, patch, point));
      }, 0);
      assert.equal(count, 1, `${name}: coverage at (${x},${y})`);
      probes++;
    }
    assert.ok(probes > 1500, `${name}: substantial interior coverage sample`);
  }
});

test('the centered cut preserves eightfold rotation and edge scaling preserves coverage', () => {
  const centered = patches[1].patch;
  const ids = new Set(centered.vertices.map(vertex => vertex.id));
  for (const vertex of centered.vertices) {
    const [a, b, c, d] = vertex.lattice;
    assert.ok(ids.has([-d, a, b, c].join(',')), '45-degree rotated lift is present');
  }
  const scaled = geometry.generate({radius: 3.7, edgeLength: 2.3, windowShift: [-0.3819, -0.7283]});
  close(scaled.coveredRadius, 3.7 * 2.3, 1e-12);
  for (const face of scaled.faces) close(polygonArea(face.vertices.map(i => scaled.vertices[i])),
    (face.type === 'square' ? 1 : Math.SQRT1_2) * 2.3 ** 2, 1e-11);
  close(clippedSquareArea(scaled, scaled.coveredRadius / Math.SQRT2),
    2 * scaled.coveredRadius ** 2, 1e-8, 'scaled covered area');
});

test('integer inflation expands physical space by the silver ratio and contracts internal space', () => {
  close(geometry.silverRatio, 1 + Math.SQRT2, 0);
  for (const n of [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1], [-3, 4, -2, 5]]) {
    const p = geometry.project(n), expanded = geometry.project(geometry.inflateLattice(n));
    const explicitProduct = geometry.inflationMatrix.map(row => row.reduce((sum, value, i) => sum + value * n[i], 0));
    assert.deepEqual(geometry.inflateLattice(n), explicitProduct);
    pointClose(expanded, {x: geometry.silverRatio * p.x, y: geometry.silverRatio * p.y}, 1e-12, 'physical inflation');
    close(expanded.u, (1 - Math.SQRT2) * p.u, 1e-12, 'internal u contraction');
    close(expanded.v, (1 - Math.SQRT2) * p.v, 1e-12, 'internal v contraction');
  }
});

const deformationPatch = geometry.generate({radius: 5, windowShift: [0, 0]});
const sampleEdges = deformationPatch.edges.filter((_, index) => index % 13 === 0);

test('bounded edge deformations stay inside safe corridors and preserve endpoint tangents', () => {
  for (const edge of sampleEdges) {
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      const p = geometry.deformEdge(edge, t, {amplitude: 999, octaves: 6, seed: 'bound-check'});
      assert.ok(Math.abs(p.offset) <= geometry.wedgeSlope * Math.min(t, 1 - t) * edge.length + 1e-12);
    }
    pointClose(geometry.deformEdge(edge, 0), edge.start, 1e-12);
    pointClose(geometry.deformEdge(edge, 1), edge.end, 1e-12);
    const epsilon = 1e-6;
    for (const t of [epsilon, 1 - epsilon]) {
      const straight = along(edge.start, edge.end, t), curved = geometry.deformEdge(edge, t);
      assert.ok(Math.hypot(curved.x - straight.x, curved.y - straight.y) < 1e-10,
        'quartic envelope preserves endpoint tangent');
    }
  }
});

test('compact polar twists have disjoint supports, exact inverse, unit determinant and fixed endpoints', () => {
  let minimumMidpointDistance = Infinity;
  const edges = deformationPatch.edges;
  for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
    const a = midpoint(edges[i]), b = midpoint(edges[j]);
    minimumMidpointDistance = Math.min(minimumMidpointDistance, Math.hypot(a.x - b.x, a.y - b.y));
  }
  close(minimumMidpointDistance, Math.sin(Math.PI / 8), 1e-12, 'minimum edge midpoint distance');
  assert.ok(2 * geometry.maxTwistRadius < minimumMidpointDistance, 'twist support disks are disjoint');
  for (const edge of sampleEdges) for (const angle of [-7.6, 0, 4, 10]) {
    const options = {angle, radius: 0.185, alternate: true, seed: 17};
    pointClose(geometry.twistEdge(edge, 0, options), edge.start, 1e-12);
    pointClose(geometry.twistEdge(edge, 1, options), edge.end, 1e-12);
    for (const t of [0.03, 0.351, 0.427, 0.5, 0.572, 0.649, 0.97]) {
      const p = along(edge.start, edge.end, t), center = midpoint(edge);
      const mapped = geometry.twistPoint(p, edge, options);
      const inverse = geometry.twistPoint(mapped, edge, {...options, angle: -angle});
      pointClose(inverse, p, 1e-11, 'compact twist inverse');
      close(Math.hypot(mapped.x - center.x, mapped.y - center.y),
        Math.hypot(p.x - center.x, p.y - center.y), 1e-12, 'polar radius preserved');
      close(determinant(point => geometry.twistPoint(point, edge, options), p),
        1, 3e-7, 'compact twist Jacobian');
    }
  }
});

for (const curl of [0, 4, 7.6, 10]) {
  test(`composed deformation at curl ${curl} is invertible, area preserving and shares face boundaries`, () => {
    const map = tessellation.createDeformation(deformationPatch, {curl, seed: 17});
    const points = [
      {x: 0, y: 0}, {x: 0.08, y: -0.12}, {x: -1.37, y: 2.11}, {x: 8.21, y: -7.71},
      ...sampleEdges.slice(0, 12).flatMap(edge => [0.373, 0.463, 0.581].map(t => along(edge.start, edge.end, t)))
    ];
    for (const p of points) {
      const mapped = map.forward(p);
      pointClose(map.inverse(mapped), p, 2e-9, 'inverse after forward');
      pointClose(map.forward(map.inverse(p)), p, 2e-9, 'forward after inverse');
      close(determinant(point => map.forward(point), p), 1, 2e-5, 'complete Jacobian');
      if (curl === 0) pointClose(mapped, p, 1e-12, 'zero curl is identity');
    }
    const strong = deformationPatch.edges.filter(edge => map.isStrong(edge));
    assert.ok(strong.length > 20, 'many genuine shared crests are selected');
    assert.equal(strong.length, map.strongEdges);
    assert.equal(map.matchedFaces, 2 * strong.length);
    for (const face of deformationPatch.faces) {
      assert.ok(face.edges.filter(index => map.isStrong(deformationPatch.edges[index])).length <= 1,
        'dual-graph matching gives each face at most one strong crest');
    }
    for (const edge of strong) {
      assert.equal(edge.faces.length, 2, 'a strong crest is shared by two faces');
      for (const t of [0.173, 0.361, 0.487, 0.593, 0.813]) {
        const views = edge.faces.map(faceIndex => {
          const face = deformationPatch.faces[faceIndex], j = face.edges.indexOf(deformationPatch.edges.indexOf(edge));
          const a = deformationPatch.vertices[face.vertices[j]];
          const b = deformationPatch.vertices[face.vertices[(j + 1) % 4]];
          const localT = face.edgeDirections[j] === 1 ? t : 1 - t;
          return map.forward(along(a, b, localT));
        });
        pointClose(views[0], views[1], 2e-11, 'two face views of one strong deformed boundary');
      }
    }
  });
}

// These are material families on the dual graph, not new geometric prototiles.
// A finite four-family palette must be reused, while a shared edge must always
// separate two different families. Independent per-face hash labels would fail
// the adjacency requirement even though they are deterministic.
function graphSignature(patch) {
  return JSON.stringify({
    faces: patch.faces.map(face => [face.id, face.vertices, face.edges, face.edgeDirections]),
    edges: patch.edges.map(edge => [edge.id, edge.a, edge.b, edge.faces])
  });
}
function permuteGraphIndices(patch) {
  const faceCount = patch.faces.length, edgeCount = patch.edges.length;
  return {
    ...patch,
    faces: patch.faces.slice().reverse().map(face => ({
      ...face, edges: face.edges.map(index => edgeCount - 1 - index)
    })),
    edges: patch.edges.slice().reverse().map(edge => ({
      ...edge, faces: edge.faces.map(index => faceCount - 1 - index)
    }))
  };
}

test('four material families are deterministic graph categories with different neighbours', () => {
  assert.equal(typeof tessellation.tileCategories, 'function');
  for (const {name, patch} of patches) {
    const before = graphSignature(patch);
    const categories = tessellation.tileCategories(patch);
    assert.equal(categories.length, patch.faces.length, `${name}: one family per face`);
    assert.deepEqual(tessellation.tileCategories(patch), categories, `${name}: repeatable classification`);
    assert.equal(graphSignature(patch), before, `${name}: classification preserves geometry and adjacency`);
    const counts = [0, 0, 0, 0];
    categories.forEach(category => {
      assert.ok(Number.isInteger(category) && category >= 0 && category < 4,
        `${name}: category belongs to a finite four-family palette`);
      counts[category]++;
    });
    assert.equal(counts.reduce((sum, count) => sum + count, 0), patch.faces.length);
    assert.ok(counts.every(count => count >= 8), `${name}: each family is reused across many faces (${counts})`);
    let sharedEdges = 0;
    for (const edge of patch.edges) if (edge.faces.length === 2) {
      assert.notEqual(categories[edge.faces[0]], categories[edge.faces[1]],
        `${name}: shared edge ${edge.id} separates different material families`);
      sharedEdges++;
    }
    assert.ok(sharedEdges > patch.faces.length, `${name}: substantial adjacency coverage`);
    for (const type of ['square', 'rhombus']) {
      const families = new Set(patch.faces.flatMap((face, index) => face.type === type ? [categories[index]] : []));
      assert.ok(families.size > 1, `${name}: material families are not just geometric tile types`);
    }
  }
});

test('canonical face identities and adjacency, rather than array indices, determine material families', () => {
  for (const {name, patch} of patches) {
    const original = tessellation.tileCategories(patch);
    const reordered = permuteGraphIndices(patch);
    const reorderedCategories = tessellation.tileCategories(reordered);
    const categoryById = new Map(patch.faces.map((face, index) => [face.id, original[index]]));
    reordered.faces.forEach((face, index) => {
      assert.equal(reorderedCategories[index], categoryById.get(face.id),
        `${name}: family remains attached to ${face.id} after face and edge index permutations`);
    });
  }
});
