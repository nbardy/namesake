const test = require('node:test');
const assert = require('node:assert/strict');
require('../src/assets/ocean-patterns.js');
const ocean = globalThis.OceanPatterns;
const settings = { speed: 0.65, amplitude: 1.7, period: 12, variation: 0.006 };
const values = value => [value.height, value.dx, value.dy];
const close = (a, b, tolerance, context) => {
  assert.ok(Math.abs(a - b) <= tolerance, `${context}: ${a} vs ${b}`);
};
const probes = Array.from({ length: 100 }, (_, i) => ({
  x: 29 * Math.sin(i * 2.171 + 0.16), y: 23 * Math.cos(i * 1.371 + 0.67)
}));

test('periodic height and gradients repeat along both superlattice vectors', () => {
  const shifts = [ocean.worldFromAxial(12, 0), ocean.worldFromAxial(0, 12)];
  for (const time of [0, 3.7, 24]) for (const point of probes) {
    const original = values(ocean.evaluate('periodic', point.x, point.y, time, settings));
    for (const shift of shifts) {
      values(ocean.evaluate('periodic', point.x + shift.x, point.y + shift.y, time, settings))
        .forEach((value, i) => close(value, original[i], 3e-12, 'repeat'));
    }
  }
});

test('sixfold height and gradient equivariance follow the moving center', () => {
  const cosine = 0.5, sine = Math.sqrt(3) / 2;
  for (const time of [0, 4, 17]) {
    const velocity = ocean.diagnostics.velocity;
    const center = ocean.worldFromAxial(velocity[0] * time * settings.speed, velocity[1] * time * settings.speed);
    for (const point of probes) {
      const before = ocean.evaluate('periodic', center.x + point.x, center.y + point.y, time, settings);
      const after = ocean.evaluate('periodic', center.x + cosine * point.x - sine * point.y, center.y + sine * point.x + cosine * point.y, time, settings);
      close(after.height, before.height, 3e-12, 'rotated height');
      close(after.dx, cosine * before.dx - sine * before.dy, 3e-12, 'rotated x gradient');
      close(after.dy, sine * before.dx + cosine * before.dy, 3e-12, 'rotated y gradient');
    }
  }
});

test('unique-cell perturbations vanish with their first derivatives on every edge', () => {
  const highVariation = { ...settings, variation: 0.06 };
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) for (let face = 0; face < 6; face++) {
    const center = ocean.worldFromAxial(q, r), angle = face * Math.PI / 3;
    const nx = Math.cos(angle), ny = Math.sin(angle), apothem = Math.sqrt(3) / 2;
    for (const along of [-0.49, -0.23, 0, 0.37, 0.49]) {
      const x = center.x + apothem * nx - along * ny;
      const y = center.y + apothem * ny + along * nx;
      const base = values(ocean.evaluate('unique', x, y, 2.3, { ...highVariation, variation: 0 }));
      const detail = values(ocean.evaluate('unique', x, y, 2.3, highVariation));
      detail.forEach((value, i) => close(value, base[i], 2e-11, 'shared edge'));
      const left = ocean.evaluate('unique', x - 1e-7 * nx, y - 1e-7 * ny, 2.3, highVariation);
      const right = ocean.evaluate('unique', x + 1e-7 * nx, y + 1e-7 * ny, 2.3, highVariation);
      close(left.height, right.height, 1e-6, 'two-sided height limit');
      close(left.dx, right.dx, 1e-5, 'two-sided x slope limit');
      close(left.dy, right.dy, 1e-5, 'two-sided y slope limit');
    }
  }
});

test('the complete analytic derivative agrees with independent central differences', () => {
  for (const variant of ['periodic', 'unique']) for (const step of [1e-4, 1e-5, 1e-6]) for (const point of probes) {
    const sample = ocean.evaluate(variant, point.x, point.y, 8, { ...settings, variation: 0.06 });
    const height = (x, y) => ocean.evaluate(variant, x, y, 8, { ...settings, variation: 0.06 }).height;
    close(sample.dx, (height(point.x + step, point.y) - height(point.x - step, point.y)) / (2 * step), 2e-5, 'x derivative');
    close(sample.dy, (height(point.x, point.y + step) - height(point.x, point.y - step)) / (2 * step), 2e-5, 'y derivative');
  }
});

test('local U(1) frame changes leave height and normals unchanged', () => {
  for (const time of [0, 4, 37]) for (const point of probes) {
    const original = values(ocean.evaluate('unique', point.x, point.y, time, { ...settings, gauge: false }));
    const transformed = values(ocean.evaluate('unique', point.x, point.y, time, { ...settings, gauge: true }));
    transformed.forEach((value, i) => close(value, original[i], 3e-12, 'gauge invariance'));
  }
});

test('cell variation changes its repeating directional base', () => {
  const shift = ocean.worldFromAxial(12, 0);
  let squaredDifference = 0;
  for (const point of probes) {
    const zero = ocean.evaluate('unique', point.x, point.y, 8, { ...settings, variation: 0 });
    const movedZero = ocean.evaluate('unique', point.x + shift.x, point.y + shift.y, 8, { ...settings, variation: 0 });
    values(zero).forEach((value, i) => close(value, values(movedZero)[i], 3e-12, 'directional base repeat'));
    const b = ocean.evaluate('unique', point.x, point.y, 8, settings);
    const moved = ocean.evaluate('unique', point.x + shift.x, point.y + shift.y, 8, settings);
    squaredDifference += (b.height - moved.height) ** 2;
  }
  assert.ok(Math.sqrt(squaredDifference / probes.length) > 1e-5, 'unique detail should change after the base repeat shift');
});

test('a preferred direction intentionally breaks sixfold field symmetry', () => {
  let squaredDifference = 0;
  for (const point of probes) {
    const before = ocean.evaluate('unique', point.x, point.y, 0, { ...settings, variation: 0 });
    const after = ocean.evaluate('unique', point.x / 2 - Math.sqrt(3) * point.y / 2, Math.sqrt(3) * point.x / 2 + point.y / 2, 0, { ...settings, variation: 0 });
    squaredDifference += (before.height - after.height) ** 2;
  }
  assert.ok(Math.sqrt(squaredDifference / probes.length) > 0.01, 'directional variant should differ under a 60-degree field rotation');
});
