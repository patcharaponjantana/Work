/**
 * Tests for mediapipe-ue.js pure helpers.
 * Run with: node --test mediapipe-ue.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const M = require('./mediapipe-ue.js');

const EPS = 1e-9;
const approx = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

// ─── Helpers ──────────────────────────────────────────────────

/** Build a minimal 33-landmark array from LM_DEFAULT positions,
 *  optionally overriding specific indices. */
function makeLm(overrides = {}) {
  const base = [
    {x:.50,y:.07,z:0},{x:.46,y:.09,z:0},{x:.44,y:.09,z:0},{x:.42,y:.09,z:0},
    {x:.54,y:.09,z:0},{x:.56,y:.09,z:0},{x:.58,y:.09,z:0},{x:.40,y:.11,z:0},
    {x:.60,y:.11,z:0},{x:.47,y:.13,z:0},{x:.53,y:.13,z:0},{x:.35,y:.28,z:0},
    {x:.65,y:.28,z:0},{x:.22,y:.42,z:0},{x:.78,y:.42,z:0},{x:.10,y:.56,z:0},
    {x:.90,y:.56,z:0},{x:.08,y:.62,z:0},{x:.92,y:.62,z:0},{x:.07,y:.60,z:0},
    {x:.93,y:.60,z:0},{x:.09,y:.58,z:0},{x:.91,y:.58,z:0},{x:.39,y:.55,z:0},
    {x:.61,y:.55,z:0},{x:.37,y:.72,z:0},{x:.63,y:.72,z:0},{x:.36,y:.88,z:0},
    {x:.64,y:.88,z:0},{x:.35,y:.92,z:0},{x:.65,y:.92,z:0},{x:.33,y:.96,z:0},
    {x:.67,y:.96,z:0},
  ];
  Object.entries(overrides).forEach(([i, v]) => { base[+i] = { ...base[+i], ...v }; });
  return base;
}

// ─── clamp ────────────────────────────────────────────────────

describe('clamp', () => {
  it('clamps below minimum', () => assert.equal(M.clamp(-5, 0, 10), 0));
  it('clamps above maximum', () => assert.equal(M.clamp(15, 0, 10), 10));
  it('passes through in-range value', () => assert.equal(M.clamp(5, 0, 10), 5));
  it('clamps at boundary lo', () => assert.equal(M.clamp(0, 0, 10), 0));
  it('clamps at boundary hi', () => assert.equal(M.clamp(10, 0, 10), 10));
});

// ─── mapRange ────────────────────────────────────────────────

describe('mapRange', () => {
  it('maps 0.5 from [0,1] to [0,100] = 50', () =>
    assert.ok(approx(M.mapRange(0.5, 0, 1, 0, 100), 50)));
  it('maps 0 from [0,1] to [0,100] = 0', () =>
    assert.ok(approx(M.mapRange(0, 0, 1, 0, 100), 0)));
  it('maps 1 from [0,1] to [0,100] = 100', () =>
    assert.ok(approx(M.mapRange(1, 0, 1, 0, 100), 100)));
  it('handles reversed output range', () =>
    assert.ok(approx(M.mapRange(0, 0, 1, 100, 0), 100)));
  it('handles identical input bounds — returns outMin', () =>
    assert.ok(approx(M.mapRange(0.5, 5, 5, 10, 20), 10)));
  it('maps negative values', () =>
    assert.ok(approx(M.mapRange(-0.5, -1, 1, 0, 200), 50)));
});

// ─── mpToUE ──────────────────────────────────────────────────

describe('mpToUE', () => {
  it('returns an object with X, Y, Z keys', () => {
    const r = M.mpToUE(0.5, 0.5, 0);
    assert.ok('X' in r && 'Y' in r && 'Z' in r);
  });

  it('center point (0.5, 0.5, 0) maps to origin (0, 0, 0)', () => {
    const r = M.mpToUE(0.5, 0.5, 0);
    assert.ok(approx(r.X, 0) && approx(r.Y, 0) && approx(r.Z, 0));
  });

  it('z=-0.5 (close to camera) → X=50 cm (positive forward)', () => {
    const r = M.mpToUE(0.5, 0.5, -0.5);
    assert.ok(approx(r.X, 50));
  });

  it('z=0.5 (far from camera) → X=-50 cm', () => {
    const r = M.mpToUE(0.5, 0.5, 0.5);
    assert.ok(approx(r.X, -50));
  });

  it('x=0 (left edge) → Y=100 cm (right)', () => {
    const r = M.mpToUE(0, 0.5, 0);
    assert.ok(approx(r.Y, 100));
  });

  it('x=1 (right edge) → Y=-100 cm (left)', () => {
    const r = M.mpToUE(1, 0.5, 0);
    assert.ok(approx(r.Y, -100));
  });

  it('y=0 (top) → Z=100 cm (up)', () => {
    const r = M.mpToUE(0.5, 0, 0);
    assert.ok(approx(r.Z, 100));
  });

  it('y=1 (bottom) → Z=-100 cm (down)', () => {
    const r = M.mpToUE(0.5, 1, 0);
    assert.ok(approx(r.Z, -100));
  });
});

// ─── vec3 primitives ─────────────────────────────────────────

describe('vec3', () => {
  it('creates a vector with x, y, z', () => {
    const v = M.vec3(1, 2, 3);
    assert.deepEqual(v, {x:1, y:2, z:3});
  });
});

describe('vec3sub', () => {
  it('subtracts two vectors', () => {
    const r = M.vec3sub({x:5,y:7,z:9}, {x:1,y:2,z:3});
    assert.deepEqual(r, {x:4, y:5, z:6});
  });
  it('gives zero vector when equal', () => {
    const r = M.vec3sub({x:3,y:3,z:3}, {x:3,y:3,z:3});
    assert.deepEqual(r, {x:0, y:0, z:0});
  });
});

describe('vec3add', () => {
  it('adds two vectors', () => {
    const r = M.vec3add({x:1,y:2,z:3}, {x:4,y:5,z:6});
    assert.deepEqual(r, {x:5, y:7, z:9});
  });
});

describe('vec3scale', () => {
  it('scales by 2', () => {
    const r = M.vec3scale({x:1,y:2,z:3}, 2);
    assert.deepEqual(r, {x:2, y:4, z:6});
  });
  it('scales by 0 gives zero vector', () => {
    const r = M.vec3scale({x:5,y:5,z:5}, 0);
    assert.deepEqual(r, {x:0, y:0, z:0});
  });
});

describe('vec3len', () => {
  it('length of (3,4,0) = 5', () =>
    assert.ok(approx(M.vec3len({x:3,y:4,z:0}), 5)));
  it('length of zero vector = 0', () =>
    assert.ok(approx(M.vec3len({x:0,y:0,z:0}), 0)));
  it('length of unit Z = 1', () =>
    assert.ok(approx(M.vec3len({x:0,y:0,z:1}), 1)));
});

describe('vec3normalize', () => {
  it('normalizes (3,4,0) to unit length', () => {
    const r = M.vec3normalize({x:3,y:4,z:0});
    assert.ok(approx(M.vec3len(r), 1));
  });
  it('returns zero vector for degenerate input', () => {
    const r = M.vec3normalize({x:0,y:0,z:0});
    assert.deepEqual(r, {x:0, y:0, z:0});
  });
  it('direction preserved after normalize', () => {
    const r = M.vec3normalize({x:0,y:0,z:5});
    assert.ok(approx(r.z, 1) && approx(r.x, 0) && approx(r.y, 0));
  });
});

describe('vec3dot', () => {
  it('dot of parallel vectors = |a||b|', () => {
    assert.ok(approx(M.vec3dot({x:1,y:0,z:0}, {x:2,y:0,z:0}), 2));
  });
  it('dot of perpendicular vectors = 0', () => {
    assert.ok(approx(M.vec3dot({x:1,y:0,z:0}, {x:0,y:1,z:0}), 0));
  });
  it('dot is commutative', () => {
    const a = {x:1,y:2,z:3}, b = {x:4,y:5,z:6};
    assert.ok(approx(M.vec3dot(a,b), M.vec3dot(b,a)));
  });
});

describe('vec3cross', () => {
  it('X cross Y = Z', () => {
    const r = M.vec3cross({x:1,y:0,z:0}, {x:0,y:1,z:0});
    assert.ok(approx(r.x,0) && approx(r.y,0) && approx(r.z,1));
  });
  it('parallel vectors give zero cross product', () => {
    const r = M.vec3cross({x:1,y:0,z:0}, {x:2,y:0,z:0});
    assert.ok(approx(M.vec3len(r), 0));
  });
  it('anti-commutative: a×b = -(b×a)', () => {
    const a = {x:1,y:2,z:3}, b = {x:4,y:5,z:6};
    const ab = M.vec3cross(a, b);
    const ba = M.vec3cross(b, a);
    assert.ok(approx(ab.x, -ba.x) && approx(ab.y, -ba.y) && approx(ab.z, -ba.z));
  });
});

// ─── angleBetweenVec3 ─────────────────────────────────────────

describe('angleBetweenVec3', () => {
  it('parallel vectors → 0 rad', () =>
    assert.ok(approx(M.angleBetweenVec3({x:1,y:0,z:0}, {x:5,y:0,z:0}), 0)));
  it('opposite vectors → π rad', () =>
    assert.ok(approx(M.angleBetweenVec3({x:1,y:0,z:0}, {x:-1,y:0,z:0}), Math.PI)));
  it('perpendicular vectors → π/2 rad', () =>
    assert.ok(approx(M.angleBetweenVec3({x:1,y:0,z:0}, {x:0,y:1,z:0}), Math.PI/2)));
  it('symmetric', () => {
    const a = {x:1,y:2,z:0}, b = {x:3,y:0,z:1};
    assert.ok(approx(M.angleBetweenVec3(a,b), M.angleBetweenVec3(b,a)));
  });
});

// ─── jointAngleDeg ────────────────────────────────────────────

describe('jointAngleDeg', () => {
  it('returns 180 for a straight limb', () => {
    // root → joint → tip all in a straight line
    const root  = {x:0, y:0, z:0};
    const joint = {x:1, y:0, z:0};
    const tip   = {x:2, y:0, z:0};
    assert.ok(approx(M.jointAngleDeg(root, joint, tip), 180, 0.01));
  });

  it('returns 90 for a right-angle bend', () => {
    const root  = {x:0, y:0, z:0};
    const joint = {x:1, y:0, z:0};
    const tip   = {x:1, y:1, z:0};
    assert.ok(approx(M.jointAngleDeg(root, joint, tip), 90, 0.01));
  });

  it('returns a value in [0, 180]', () => {
    const ang = M.jointAngleDeg({x:0,y:0,z:0},{x:1,y:1,z:0},{x:2,y:0,z:0});
    assert.ok(ang >= 0 && ang <= 180);
  });
});

// ─── ema3 ────────────────────────────────────────────────────

describe('ema3', () => {
  it('alpha=1 → output equals curr', () => {
    const r = M.ema3({x:10,y:20,z:30}, {x:0,y:0,z:0}, 1);
    assert.ok(approx(r.x,10) && approx(r.y,20) && approx(r.z,30));
  });

  it('alpha=0 → output equals prev', () => {
    const r = M.ema3({x:10,y:20,z:30}, {x:1,y:2,z:3}, 0);
    assert.ok(approx(r.x,1) && approx(r.y,2) && approx(r.z,3));
  });

  it('alpha=0.5 → output is midpoint', () => {
    const r = M.ema3({x:10,y:0,z:0}, {x:0,y:0,z:0}, 0.5);
    assert.ok(approx(r.x, 5));
  });

  it('alpha clamps above 1 to behave as alpha=1', () => {
    const r = M.ema3({x:10,y:0,z:0}, {x:0,y:0,z:0}, 2);
    assert.ok(approx(r.x, 10));
  });

  it('converges toward curr over iterations', () => {
    let v = {x:0,y:0,z:0};
    const target = {x:100,y:0,z:0};
    for (let i = 0; i < 50; i++) v = M.ema3(target, v, 0.2);
    assert.ok(v.x > 95, `expected convergence near 100, got ${v.x}`);
  });
});

// ─── detectAttack ────────────────────────────────────────────

describe('detectAttack', () => {
  it('returns false for null input', () => assert.equal(M.detectAttack(null), false));
  it('returns false for short array', () => assert.equal(M.detectAttack([]), false));

  it('returns true when right wrist is raised high above shoulder', () => {
    const lm = makeLm({
      12: {y: 0.50},  // right shoulder — low on screen
      16: {y: 0.10},  // right wrist — high on screen (y smaller)
    });
    assert.equal(M.detectAttack(lm), true);
  });

  it('returns false when right wrist is below shoulder', () => {
    const lm = makeLm({
      12: {y: 0.28},
      16: {y: 0.60},  // wrist lower than shoulder
    });
    assert.equal(M.detectAttack(lm), false);
  });

  it('respects custom threshold', () => {
    // difference is 0.04 — below default 0.05 but above 0.02
    const lm = makeLm({ 12: {y:0.30}, 16: {y:0.26} });
    assert.equal(M.detectAttack(lm, 0.05), false);
    assert.equal(M.detectAttack(lm, 0.02), true);
  });
});

// ─── detectGuard ─────────────────────────────────────────────

describe('detectGuard', () => {
  it('returns false for null input', () => assert.equal(M.detectGuard(null), false));

  it('returns true when both wrists are at chin height', () => {
    // chin ≈ midpoint of nose(0) and mouthLeft(9)
    // nose.y=0.07, mouthLeft.y=0.13 → chinY ≈ 0.10
    const chinY = (0.07 + 0.13) / 2;   // ≈ 0.10
    const lm = makeLm({
      15: {y: chinY + 0.02},  // left wrist near chin
      16: {y: chinY - 0.02},  // right wrist near chin
    });
    assert.equal(M.detectGuard(lm), true);
  });

  it('returns false when only one wrist is at chin height', () => {
    const chinY = (0.07 + 0.13) / 2;
    const lm = makeLm({
      15: {y: chinY + 0.02},  // left wrist near chin
      16: {y: 0.80},          // right wrist far away
    });
    assert.equal(M.detectGuard(lm), false);
  });

  it('returns false when both wrists are far from chin', () => {
    const lm = makeLm({ 15: {y:0.80}, 16: {y:0.80} });
    assert.equal(M.detectGuard(lm), false);
  });
});

// ─── detectDodge ─────────────────────────────────────────────

describe('detectDodge', () => {
  it('returns false for null input', () => assert.equal(M.detectDodge(null), false));

  it('returns false when centered (shoulders symmetric around 0.5)', () => {
    const lm = makeLm({ 11: {x:0.35}, 12: {x:0.65} }); // midX = 0.50
    assert.equal(M.detectDodge(lm), false);
  });

  it('returns true when torso leans left', () => {
    // midX = (0.10 + 0.40) / 2 = 0.25 → offset 0.25 > 0.08
    const lm = makeLm({ 11: {x:0.10}, 12: {x:0.40} });
    assert.equal(M.detectDodge(lm), true);
  });

  it('returns true when torso leans right', () => {
    // midX = (0.60 + 0.90) / 2 = 0.75 → offset 0.25 > 0.08
    const lm = makeLm({ 11: {x:0.60}, 12: {x:0.90} });
    assert.equal(M.detectDodge(lm), true);
  });

  it('respects custom threshold', () => {
    // midX = 0.55 → offset 0.05
    const lm = makeLm({ 11: {x:0.45}, 12: {x:0.65} });
    assert.equal(M.detectDodge(lm, 0.08), false);
    assert.equal(M.detectDodge(lm, 0.04), true);
  });
});

// ─── detectCrouch ────────────────────────────────────────────

describe('detectCrouch', () => {
  it('returns false for null input', () => assert.equal(M.detectCrouch(null), false));

  it('returns false in normal standing pose', () => {
    // Default pose: shoulder width ~0.30, torso height ~0.27, ratio ~0.9 > 0.85
    const lm = makeLm();
    // Ratio = torso_height / shoulder_width
    const sw = Math.abs(lm[11].x - lm[12].x);
    const hipMidY = (lm[23].y + lm[24].y) / 2;
    const shMidY  = (lm[11].y + lm[12].y) / 2;
    const ratio = (hipMidY - shMidY) / sw;
    // Verify default is standing
    assert.ok(ratio >= 0.85, `default ratio ${ratio.toFixed(3)} expected >= 0.85`);
    assert.equal(M.detectCrouch(lm), false);
  });

  it('returns true when shoulders are compressed toward hips', () => {
    // Bring shoulders close to hips: shoulder_y → 0.50, hip_y → 0.55
    // torso_height = 0.05, shoulder_width = 0.30 → ratio ≈ 0.17 < 0.85
    const lm = makeLm({
      11: {x:0.35, y:0.50}, 12: {x:0.65, y:0.50},
      23: {x:0.39, y:0.55}, 24: {x:0.61, y:0.55},
    });
    assert.equal(M.detectCrouch(lm), true);
  });

  it('respects custom threshold', () => {
    // ratio ≈ 0.90 (just above default 0.85)
    const lm = makeLm({
      11: {x:0.35, y:0.30}, 12: {x:0.65, y:0.30},
      23: {x:0.39, y:0.57}, 24: {x:0.61, y:0.57},
    });
    const sw = Math.abs(lm[11].x - lm[12].x);
    const th = (((lm[23].y + lm[24].y)/2) - ((lm[11].y + lm[12].y)/2)) / sw;
    assert.equal(M.detectCrouch(lm, 0.85), th < 0.85);
    assert.equal(M.detectCrouch(lm, 1.0),  true);   // higher threshold always fires
  });
});

// ─── directionToRotator ───────────────────────────────────────

describe('directionToRotator', () => {
  it('is a function', () => assert.ok(typeof M.directionToRotator === 'function'));

  it('returns an object with pitch, yaw, roll keys', () => {
    const r = M.directionToRotator({x:1, y:0, z:0});
    assert.ok('pitch' in r && 'yaw' in r && 'roll' in r);
  });

  it('forward direction {x:1,y:0,z:0} → pitch=0, yaw=0', () => {
    const r = M.directionToRotator({x:1, y:0, z:0});
    assert.ok(approx(r.pitch, 0) && approx(r.yaw, 0));
  });

  it('upward direction {x:0,y:0,z:1} → pitch=-90', () => {
    const r = M.directionToRotator({x:0, y:0, z:1});
    assert.ok(approx(r.pitch, -90, 0.001));
  });

  it('downward direction {x:0,y:0,z:-1} → pitch=+90', () => {
    const r = M.directionToRotator({x:0, y:0, z:-1});
    assert.ok(approx(r.pitch, 90, 0.001));
  });

  it('right direction {x:0,y:1,z:0} → yaw=90', () => {
    const r = M.directionToRotator({x:0, y:1, z:0});
    assert.ok(approx(r.yaw, 90, 0.001));
  });

  it('left direction {x:0,y:-1,z:0} → yaw=-90', () => {
    const r = M.directionToRotator({x:0, y:-1, z:0});
    assert.ok(approx(r.yaw, -90, 0.001));
  });

  it('backward direction {x:-1,y:0,z:0} → yaw=±180', () => {
    const r = M.directionToRotator({x:-1, y:0, z:0});
    assert.ok(approx(Math.abs(r.yaw), 180, 0.001));
  });

  it('roll is always 0', () => {
    const dirs = [
      {x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:1},
      {x:1,y:1,z:0}, {x:1,y:0,z:1},
    ];
    dirs.forEach(d => assert.equal(M.directionToRotator(d).roll, 0));
  });

  it('pitch is in range [-90, 90] for any input', () => {
    const dirs = [
      {x:1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:0,z:1},
      {x:1,y:1,z:1}, {x:-1,y:2,z:-0.5},
    ];
    dirs.forEach(d => {
      const {pitch} = M.directionToRotator(d);
      assert.ok(pitch >= -90 && pitch <= 90, `pitch out of range: ${pitch}`);
    });
  });

  it('zero vector does not throw and returns {pitch:0, yaw:0, roll:0}', () => {
    let r;
    assert.doesNotThrow(() => { r = M.directionToRotator({x:0, y:0, z:0}); });
    assert.ok(approx(r.pitch, 0) && approx(r.yaw, 0) && r.roll === 0);
  });

  it('result is invariant to vector magnitude (scale-independent)', () => {
    const unit   = M.directionToRotator({x:1,  y:1,  z:0.5});
    const scaled = M.directionToRotator({x:10, y:10, z:5});
    assert.ok(approx(unit.pitch, scaled.pitch, 0.001));
    assert.ok(approx(unit.yaw,   scaled.yaw,   0.001));
  });
});

// ─── LM index map ────────────────────────────────────────────

describe('LM', () => {
  it('exports LM constant object', () => assert.ok(typeof M.LM === 'object'));
  it('NOSE = 0', () => assert.equal(M.LM.NOSE, 0));
  it('RIGHT_WRIST = 16', () => assert.equal(M.LM.RIGHT_WRIST, 16));
  it('LEFT_SHOULDER = 11', () => assert.equal(M.LM.LEFT_SHOULDER, 11));
  it('LEFT_HIP = 23', () => assert.equal(M.LM.LEFT_HIP, 23));
});

// ─── clampAngularStep ─────────────────────────────────────────

describe('clampAngularStep', () => {
  it('is a function', () => assert.ok(typeof M.clampAngularStep === 'function'));

  it('returns next unchanged when angle is within limit', () => {
    // Both vectors along +X — angle = 0, always within any limit
    const r = M.clampAngularStep({x:1,y:0,z:0}, {x:1,y:0,z:0}, 15);
    assert.ok(approx(r.x, 1, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 0, 1e-5));
  });

  it('returns next unchanged when angle < maxDeg (small rotation)', () => {
    // 10° rotation from +X toward +Y; limit = 15° → passes through
    const angle = 10 * Math.PI / 180;
    const next = { x: Math.cos(angle), y: Math.sin(angle), z: 0 };
    const prev = { x: 1, y: 0, z: 0 };
    const r = M.clampAngularStep(next, prev, 15);
    assert.ok(approx(M.vec3dot(r, M.vec3normalize(next)), 1, 1e-5));
  });

  it('clamps to exactly maxDeg when angle exceeds limit', () => {
    // 90° rotation from +X to +Y; limit = 30° → result should be 30° from +X
    const next = { x: 0, y: 1, z: 0 };
    const prev = { x: 1, y: 0, z: 0 };
    const r = M.clampAngularStep(next, prev, 30);
    const actualAngleDeg = Math.acos(M.clamp(M.vec3dot(r, prev), -1, 1)) * 180 / Math.PI;
    assert.ok(approx(actualAngleDeg, 30, 0.1), `expected 30°, got ${actualAngleDeg.toFixed(4)}°`);
  });

  it('result is a unit vector', () => {
    const r = M.clampAngularStep({x:0,y:1,z:0}, {x:1,y:0,z:0}, 30);
    assert.ok(approx(M.vec3len(r), 1, 1e-5));
  });

  it('180° flip clamped to maxDeg', () => {
    // Opposite direction — angle = 180°; limit = 15° → result is 15° from prev
    const next = { x: -1, y: 0, z: 0 };
    const prev = { x:  1, y: 0, z: 0 };
    const r = M.clampAngularStep(next, prev, 15);
    const actualAngleDeg = Math.acos(M.clamp(M.vec3dot(r, prev), -1, 1)) * 180 / Math.PI;
    assert.ok(approx(actualAngleDeg, 15, 0.1), `expected 15°, got ${actualAngleDeg.toFixed(4)}°`);
  });

  it('maxDeg=0 always returns prev', () => {
    const next = { x: 0, y: 1, z: 0 };
    const prev = { x: 1, y: 0, z: 0 };
    const r = M.clampAngularStep(next, prev, 0);
    assert.ok(approx(r.x, 1, 1e-5) && approx(r.y, 0, 1e-5));
  });

  it('maxDeg=180 always returns next', () => {
    const next = M.vec3normalize({ x: 1, y: 2, z: 3 });
    const prev = { x: 1, y: 0, z: 0 };
    const r = M.clampAngularStep(next, prev, 180);
    assert.ok(approx(r.x, next.x, 1e-5) && approx(r.y, next.y, 1e-5) && approx(r.z, next.z, 1e-5));
  });

  it('works in 3D (not just XY plane)', () => {
    const next = { x: 0, y: 0, z: 1 };
    const prev = { x: 1, y: 0, z: 0 };
    const r = M.clampAngularStep(next, prev, 45);
    const angleDeg = Math.acos(M.clamp(M.vec3dot(r, prev), -1, 1)) * 180 / Math.PI;
    assert.ok(approx(angleDeg, 45, 0.1));
    assert.ok(approx(M.vec3len(r), 1, 1e-5));
  });
});

// ─── computeMcpGrip ───────────────────────────────────────────
// Landmark layout used for grip tests:
//   lm[0]  = wrist
//   lm[5]  = index  MCP
//   lm[9]  = middle MCP
//   lm[13] = ring   MCP
//   lm[17] = pinky  MCP
// All other indices are filled with dummy {x:0,y:0,z:0} to satisfy length check.

/** Build a minimal 21-landmark hand array with controllable wrist + 4 MCPs. */
function makeHand(wrist, indexMcp, middleMcp, ringMcp, pinkyMcp) {
  const dummy = { x: 0, y: 0, z: 0 };
  const lm = Array.from({ length: 21 }, () => ({ ...dummy }));
  lm[0]  = wrist;
  lm[5]  = indexMcp;
  lm[9]  = middleMcp;
  lm[13] = ringMcp;
  lm[17] = pinkyMcp;
  return lm;
}

describe('computeMcpGrip', () => {
  it('is a function', () => assert.ok(typeof M.computeMcpGrip === 'function'));

  it('returns false for null input', () => assert.equal(M.computeMcpGrip(null), false));
  it('returns false for short array', () => assert.equal(M.computeMcpGrip([]), false));

  it('returns false for open/extended hand — MCPs far from wrist', () => {
    // Wrist at bottom, MCP knuckles extended upward — mcpDist ≈ indexDist
    const lm = makeHand(
      { x: 0.50, y: 0.80 },  // wrist
      { x: 0.60, y: 0.60 },  // index  MCP (extended, ratio ≈ 0.965)
      { x: 0.50, y: 0.55 },  // middle MCP
      { x: 0.40, y: 0.58 },  // ring   MCP
      { x: 0.35, y: 0.62 },  // pinky  MCP
    );
    assert.equal(M.computeMcpGrip(lm), false);
  });

  it('returns true for closed fist — MCPs contracted toward wrist', () => {
    // Wrist at bottom, MCP knuckles pulled close (curled fist)
    const lm = makeHand(
      { x: 0.50, y: 0.80 },  // wrist
      { x: 0.62, y: 0.70 },  // index  MCP (ratio ≈ 0.68 — clearly gripping)
      { x: 0.52, y: 0.68 },  // middle MCP
      { x: 0.42, y: 0.68 },  // ring   MCP
      { x: 0.37, y: 0.72 },  // pinky  MCP
    );
    assert.equal(M.computeMcpGrip(lm), true);
  });

  it('returns false when wrist and index MCP coincide (degenerate)', () => {
    const lm = makeHand(
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },  // same as wrist — indexDist = 0
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0.5 },
    );
    assert.equal(M.computeMcpGrip(lm), false);
  });

  it('borderline case: ratio exactly at 0.95 → not gripping', () => {
    // mcpDist = 0.95 × indexDist → strict less-than fails
    const wrist    = { x: 0, y: 0 };
    const indexMcp = { x: 1, y: 0 };   // indexDist = 1
    // Put all 4 MCPs such that mcpCx = 0.95, mcpCy = 0 → mcpDist = 0.95
    const mcp = { x: 0.95, y: 0 };
    const lm = makeHand(wrist, indexMcp, mcp, mcp, mcp);
    // mcpCx = (1+0.95+0.95+0.95)/4 = 0.9625; mcpDist = 0.9625; 0.9625 < 0.95? No
    assert.equal(M.computeMcpGrip(lm), false);
  });

  it('clearly gripping: mcpDist is 60% of indexDist', () => {
    const wrist    = { x: 0, y: 0 };
    const indexMcp = { x: 0, y: 1 };   // indexDist = 1
    const allMcp   = { x: 0, y: 0.6 }; // each MCP at 0.6 → mcpDist = 0.6, 0.6 < 0.95 ✓
    const lm = makeHand(wrist, allMcp, allMcp, allMcp, allMcp);
    assert.equal(M.computeMcpGrip(lm), true);
  });
});

// ─── computeMcpWeaponDir ──────────────────────────────────────

describe('computeMcpWeaponDir', () => {
  it('is a function', () => assert.ok(typeof M.computeMcpWeaponDir === 'function'));

  it('returns null for null input', () => assert.equal(M.computeMcpWeaponDir(null), null));
  it('returns null for short array', () => assert.equal(M.computeMcpWeaponDir([]), null));

  it('returns an object with weaponDir and palmNormal', () => {
    // Flat hand: palm up (+Y), fingers along +Z
    const lm = makeHand(
      { x: 0, y: 0, z: 0 },              // wrist
      { x:  0.05, y: 0, z: 0.08 },       // index  MCP
      { x:  0,    y: 0, z: 0.09 },       // middle MCP
      { x: -0.02, y: 0, z: 0.08 },       // ring   MCP
      { x: -0.04, y: 0, z: 0.07 },       // pinky  MCP
    );
    const r = M.computeMcpWeaponDir(lm);
    assert.ok(r !== null, 'expected non-null result');
    assert.ok('weaponDir'  in r, 'missing weaponDir');
    assert.ok('palmNormal' in r, 'missing palmNormal');
  });

  it('weaponDir and palmNormal are unit vectors', () => {
    const lm = makeHand(
      { x: 0, y: 0, z: 0 },
      { x:  0.05, y: 0, z: 0.08 },
      { x:  0,    y: 0, z: 0.09 },
      { x: -0.02, y: 0, z: 0.08 },
      { x: -0.04, y: 0, z: 0.07 },
    );
    const r = M.computeMcpWeaponDir(lm);
    assert.ok(approx(M.vec3len(r.weaponDir),  1, 1e-5), 'weaponDir not unit length');
    assert.ok(approx(M.vec3len(r.palmNormal), 1, 1e-5), 'palmNormal not unit length');
  });

  it('palm-up flat hand: palmNormal points ≈ +Y (world up)', () => {
    // Palm facing +Y: MCPs are all in the XZ plane (y ≈ 0)
    const lm = makeHand(
      { x: 0, y: 0, z: 0 },
      { x:  0.05, y: 0, z: 0.08 },
      { x:  0,    y: 0, z: 0.09 },
      { x: -0.02, y: 0, z: 0.08 },
      { x: -0.04, y: 0, z: 0.07 },
    );
    const r = M.computeMcpWeaponDir(lm);
    // palmNormal should be close to (0, ±1, 0); accept both signs
    assert.ok(Math.abs(r.palmNormal.y) > 0.9, `palmNormal.y=${r.palmNormal.y.toFixed(3)} expected ≈ ±1`);
  });

  it('weaponDir is perpendicular to palmNormal', () => {
    const lm = makeHand(
      { x: 0, y: 0, z: 0 },
      { x:  0.05, y: 0, z: 0.08 },
      { x:  0,    y: 0, z: 0.09 },
      { x: -0.02, y: 0, z: 0.08 },
      { x: -0.04, y: 0, z: 0.07 },
    );
    const r = M.computeMcpWeaponDir(lm);
    const d = M.vec3dot(r.weaponDir, r.palmNormal);
    assert.ok(Math.abs(d) < 1e-4, `weaponDir · palmNormal = ${d.toFixed(6)} (expected ≈ 0)`);
  });

  it('weaponDir is perpendicular to knuckle line (kvec)', () => {
    const lm = makeHand(
      { x: 0, y: 0, z: 0 },
      { x:  0.06, y: 0, z: 0.08 },
      { x:  0,    y: 0, z: 0.09 },
      { x: -0.03, y: 0, z: 0.08 },
      { x: -0.05, y: 0, z: 0.07 },
    );
    const r = M.computeMcpWeaponDir(lm);
    const kvec = M.vec3sub(lm[5], lm[17]);
    const d = Math.abs(M.vec3dot(M.vec3normalize(kvec), r.weaponDir));
    assert.ok(d < 1e-3, `weaponDir · kvec = ${d.toFixed(6)} (expected ≈ 0)`);
  });

  it('returns null for degenerate input where all landmarks coincide', () => {
    const zero = { x: 0, y: 0, z: 0 };
    const lm = makeHand(zero, zero, zero, zero, zero);
    assert.equal(M.computeMcpWeaponDir(lm), null);
  });
});

// ─── computeWeaponDirTwoPoint ─────────────────────────────────

describe('computeWeaponDirTwoPoint', () => {
  it('is a function', () => assert.ok(typeof M.computeWeaponDirTwoPoint === 'function'));
  it('returns null for null input', () => assert.equal(M.computeWeaponDirTwoPoint(null), null));
  it('returns null for empty array', () => assert.equal(M.computeWeaponDirTwoPoint([]), null));

  it('returns a unit vector for valid input', () => {
    const lm = makeHand(
      {x:0, y:0, z:0},
      {x:0.05, y:0, z:0.08},
      {x:0, y:0, z:0.09},   // lm[9] = middle MCP
      {x:-0.02, y:0, z:0.08},
      {x:-0.04, y:0, z:0.07},
    );
    const r = M.computeWeaponDirTwoPoint(lm, 9);
    assert.ok(r !== null);
    assert.ok(approx(M.vec3len(r), 1, 1e-5));
  });

  it('wrist→middleMCP default (idx 9): direction matches normalize(lm[9]-lm[0])', () => {
    const lm = makeHand(
      {x:0, y:0, z:0},
      {x:0.05, y:0, z:0},
      {x:0, y:0, z:0.1},   // lm[9] along +Z
      {x:-0.02, y:0, z:0},
      {x:-0.04, y:0, z:0},
    );
    const r = M.computeWeaponDirTwoPoint(lm, 9);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 1, 1e-5));
  });

  it('uses idx=9 when mcpIdx argument is omitted', () => {
    const lm = makeHand(
      {x:0, y:0, z:0},
      {x:0, y:0, z:0},
      {x:0, y:1, z:0},   // lm[9] along +Y
      {x:0, y:0, z:0},
      {x:0, y:0, z:0},
    );
    const r = M.computeWeaponDirTwoPoint(lm);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 1, 1e-5) && approx(r.z, 0, 1e-5));
  });

  it('works for index MCP (idx 5) as target', () => {
    const lm = makeHand(
      {x:0, y:0, z:0},
      {x:1, y:0, z:0},   // lm[5] along +X
      {x:0, y:0, z:0},
      {x:0, y:0, z:0},
      {x:0, y:0, z:0},
    );
    const r = M.computeWeaponDirTwoPoint(lm, 5);
    assert.ok(approx(r.x, 1, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 0, 1e-5));
  });

  it('lm[5]→lm[17]: index MCP to pinky MCP direction', () => {
    const lm = makeHand(
      {x:0, y:0, z:0},
      {x:1, y:0, z:0},   // lm[5]  = +X
      {x:0, y:0, z:0},
      {x:0, y:0, z:0},
      {x:-1, y:0, z:0},  // lm[17] = -X
    );
    // direction from lm[5](+X) → lm[17](-X) should be -X
    const r = M.computeWeaponDirTwoPoint(lm, 17, 5);
    assert.ok(approx(r.x, -1, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 0, 1e-5));
  });

  it('returns null when wrist and target MCP coincide (degenerate)', () => {
    const zero = {x:0, y:0, z:0};
    const lm = makeHand(zero, zero, zero, zero, zero);
    assert.equal(M.computeWeaponDirTwoPoint(lm, 9), null);
  });

  it('result is scale-invariant', () => {
    const lm1 = makeHand({x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:1},   {x:0,y:0,z:0}, {x:0,y:0,z:0});
    const lm2 = makeHand({x:0,y:0,z:0}, {x:0,y:0,z:0}, {x:0,y:0,z:10},  {x:0,y:0,z:0}, {x:0,y:0,z:0});
    const r1 = M.computeWeaponDirTwoPoint(lm1, 9);
    const r2 = M.computeWeaponDirTwoPoint(lm2, 9);
    assert.ok(approx(r1.x, r2.x) && approx(r1.y, r2.y) && approx(r1.z, r2.z));
  });
});

// ─── computeWristRollAngleDeg ─────────────────────────────────

describe('computeWristRollAngleDeg', () => {
  it('is a function', () => assert.ok(typeof M.computeWristRollAngleDeg === 'function'));

  it('returns NaN for zero forearm vector', () => {
    assert.ok(isNaN(M.computeWristRollAngleDeg({ x:0,y:1,z:0 }, { x:0,y:0,z:0 })));
  });

  it('palm-up (normal = +Y), forearm along +X → 0 degrees', () => {
    const deg = M.computeWristRollAngleDeg({ x:0,y:1,z:0 }, { x:1,y:0,z:0 });
    assert.ok(approx(deg, 0, 1e-4), `expected 0, got ${deg}`);
  });

  it('palm-down (normal = -Y), forearm along +X → ±180 degrees', () => {
    const deg = M.computeWristRollAngleDeg({ x:0,y:-1,z:0 }, { x:1,y:0,z:0 });
    assert.ok(approx(Math.abs(deg), 180, 1e-4), `expected ±180, got ${deg}`);
  });

  it('palm facing camera (normal = +Z), forearm along +X → +90 degrees', () => {
    const deg = M.computeWristRollAngleDeg({ x:0,y:0,z:1 }, { x:1,y:0,z:0 });
    assert.ok(approx(deg, 90, 1e-4), `expected 90, got ${deg}`);
  });

  it('palm facing away from camera (normal = -Z), forearm along +X → −90 degrees', () => {
    const deg = M.computeWristRollAngleDeg({ x:0,y:0,z:-1 }, { x:1,y:0,z:0 });
    assert.ok(approx(deg, -90, 1e-4), `expected -90, got ${deg}`);
  });

  it('roll is antisymmetric: flipping palmNormal negates the angle', () => {
    const pn  = M.vec3normalize({ x:1,  y:2,  z:0.5 });
    const npn = M.vec3normalize({ x:-1, y:-2, z:-0.5 });
    const fa  = { x:1, y:0, z:0 };
    const a   = M.computeWristRollAngleDeg(pn,  fa);
    const b   = M.computeWristRollAngleDeg(npn, fa);
    assert.ok(!isNaN(a) && !isNaN(b));
    // a and b should differ by 180 (mod 360) since flipping normal flips the sign
    const diff = Math.abs(Math.abs(a - b) - 180);
    assert.ok(diff < 1e-3, `expected |a - b| ≈ 180, got |${a.toFixed(3)} - ${b.toFixed(3)}| = ${Math.abs(a-b).toFixed(3)}`);
  });

  it('result is invariant to scale of palmNormal', () => {
    const fa  = { x: 1, y: 0, z: 0 };
    const a = M.computeWristRollAngleDeg({ x:0, y:2,  z:0 }, fa);
    const b = M.computeWristRollAngleDeg({ x:0, y:10, z:0 }, fa);
    assert.ok(approx(a, b, 1e-4), `expected same angle, got ${a} vs ${b}`);
  });

  it('result is invariant to scale of forearmDir', () => {
    const pn = { x: 0, y: 1, z: 0 };
    const a  = M.computeWristRollAngleDeg(pn, { x:1, y:0, z:0 });
    const b  = M.computeWristRollAngleDeg(pn, { x:5, y:0, z:0 });
    assert.ok(approx(a, b, 1e-4), `expected same angle, got ${a} vs ${b}`);
  });
});

// ─── rotateVec3ByEuler ────────────────────────────────────────
// Convention: Roll=Rz first, then Pitch=Rx, then Yaw=Ry
// (intrinsic ZXY order: Ry · Rx · Rz · v)

describe('rotateVec3ByEuler', () => {
  it('is a function', () => assert.ok(typeof M.rotateVec3ByEuler === 'function'));

  it('returns an object with x, y, z keys', () => {
    const r = M.rotateVec3ByEuler({x:1,y:0,z:0}, 0, 0, 0);
    assert.ok('x' in r && 'y' in r && 'z' in r);
  });

  it('identity — all zeros leave vector unchanged', () => {
    const r = M.rotateVec3ByEuler({x:1,y:0,z:0}, 0, 0, 0);
    assert.ok(approx(r.x, 1) && approx(r.y, 0) && approx(r.z, 0));
  });

  it('identity on Y-axis vector', () => {
    const r = M.rotateVec3ByEuler({x:0,y:1,z:0}, 0, 0, 0);
    assert.ok(approx(r.x, 0) && approx(r.y, 1) && approx(r.z, 0));
  });

  // ── Roll (Rz) tests ────────────────────────────────────────
  it('Roll +90° — +X axis rotates to +Y axis', () => {
    const r = M.rotateVec3ByEuler({x:1,y:0,z:0}, 0, 0, 90);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 1, 1e-5) && approx(r.z, 0, 1e-5));
  });

  it('Roll -90° — +X axis rotates to -Y axis', () => {
    const r = M.rotateVec3ByEuler({x:1,y:0,z:0}, 0, 0, -90);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, -1, 1e-5) && approx(r.z, 0, 1e-5));
  });

  it('Roll +90° leaves Z-axis unchanged', () => {
    const r = M.rotateVec3ByEuler({x:0,y:0,z:1}, 0, 0, 90);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 1, 1e-5));
  });

  // ── Pitch (Rx) tests ───────────────────────────────────────
  it('Pitch +90° — +Y axis rotates to +Z axis', () => {
    const r = M.rotateVec3ByEuler({x:0,y:1,z:0}, 90, 0, 0);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 1, 1e-5));
  });

  it('Pitch -90° — +Y axis rotates to -Z axis', () => {
    const r = M.rotateVec3ByEuler({x:0,y:1,z:0}, -90, 0, 0);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, -1, 1e-5));
  });

  it('Pitch +90° leaves X-axis unchanged', () => {
    const r = M.rotateVec3ByEuler({x:1,y:0,z:0}, 90, 0, 0);
    assert.ok(approx(r.x, 1, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 0, 1e-5));
  });

  // ── Yaw (Ry) tests ─────────────────────────────────────────
  it('Yaw +90° — +X axis rotates to -Z axis', () => {
    // Ry(90°) · {1,0,0} = {cos90, 0, -sin90} = {0, 0, -1}
    const r = M.rotateVec3ByEuler({x:1,y:0,z:0}, 0, 90, 0);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, -1, 1e-5));
  });

  it('Yaw -90° — +X axis rotates to +Z axis', () => {
    const r = M.rotateVec3ByEuler({x:1,y:0,z:0}, 0, -90, 0);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 1, 1e-5));
  });

  it('Yaw +90° leaves Y-axis unchanged', () => {
    const r = M.rotateVec3ByEuler({x:0,y:1,z:0}, 0, 90, 0);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 1, 1e-5) && approx(r.z, 0, 1e-5));
  });

  // ── Combination and properties ─────────────────────────────
  it('Roll 90° then Pitch 90° on {1,0,0} yields {0,0,1}', () => {
    // Rz(90°): {1,0,0}→{0,1,0}; Rx(90°): {0,1,0}→{0,0,1}; Ry(0°): unchanged
    const r = M.rotateVec3ByEuler({x:1,y:0,z:0}, 90, 0, 90);
    assert.ok(approx(r.x, 0, 1e-5) && approx(r.y, 0, 1e-5) && approx(r.z, 1, 1e-5));
  });

  it('preserves vector length', () => {
    const v = {x:3, y:4, z:0};
    const origLen = M.vec3len(v);
    const r = M.rotateVec3ByEuler(v, 37, -55, 120);
    assert.ok(approx(M.vec3len(r), origLen, 1e-6));
  });

  it('360° rotation returns to original vector', () => {
    const v = {x:1, y:2, z:3};
    const r = M.rotateVec3ByEuler(v, 360, 0, 0);
    assert.ok(approx(r.x, v.x, 1e-5) && approx(r.y, v.y, 1e-5) && approx(r.z, v.z, 1e-5));
  });

  it('works with non-unit-length vectors (scale invariant in direction)', () => {
    const v1 = {x:1,y:0,z:0};
    const v5 = {x:5,y:0,z:0};
    const r1 = M.rotateVec3ByEuler(v1, 45, 30, 60);
    const r5 = M.rotateVec3ByEuler(v5, 45, 30, 60);
    // r5 should be 5× r1
    assert.ok(approx(r5.x, r1.x * 5, 1e-5));
    assert.ok(approx(r5.y, r1.y * 5, 1e-5));
    assert.ok(approx(r5.z, r1.z * 5, 1e-5));
  });
});

// ─── detectBlockPose ─────────────────────────────────────────

describe('detectBlockPose', () => {
  it('is a function', () => assert.ok(typeof M.detectBlockPose === 'function'));
  it('returns false for null',  () => assert.equal(M.detectBlockPose(null),  false));
  it('returns false for empty', () => assert.equal(M.detectBlockPose([]),    false));

  it('returns true when both wrists are in the chest zone', () => {
    // Default makeLm has wrists (15, 16) far below hips — not in chest zone.
    // Override to put both near the mid-torso area.
    const lm = makeLm({
      11: {x:0.35, y:0.28},  // L shoulder
      12: {x:0.65, y:0.28},  // R shoulder
      15: {x:0.40, y:0.40},  // L wrist — between shoulder and hip, near centre
      16: {x:0.60, y:0.40},  // R wrist
      23: {x:0.39, y:0.55},  // L hip
      24: {x:0.61, y:0.55},  // R hip
    });
    assert.equal(M.detectBlockPose(lm), true);
  });

  it('returns false when only right wrist is at chest', () => {
    const lm = makeLm({
      11: {x:0.35, y:0.28}, 12: {x:0.65, y:0.28},
      15: {x:0.40, y:0.80},  // L wrist below hip — not in chest zone
      16: {x:0.60, y:0.40},  // R wrist in chest zone
      23: {x:0.39, y:0.55}, 24: {x:0.61, y:0.55},
    });
    assert.equal(M.detectBlockPose(lm), false);
  });

  it('returns false when both wrists are raised above shoulders', () => {
    const lm = makeLm({
      11: {x:0.35, y:0.28}, 12: {x:0.65, y:0.28},
      15: {x:0.40, y:0.10},  // above shoulder (y < shoulderY - 0.04)
      16: {x:0.60, y:0.10},
      23: {x:0.39, y:0.55}, 24: {x:0.61, y:0.55},
    });
    assert.equal(M.detectBlockPose(lm), false);
  });

  it('returns false when wrists are extended sideways beyond shoulder width', () => {
    const lm = makeLm({
      11: {x:0.35, y:0.28}, 12: {x:0.65, y:0.28},
      15: {x:0.05, y:0.40},  // way outside the shoulder-width band
      16: {x:0.95, y:0.40},
      23: {x:0.39, y:0.55}, 24: {x:0.61, y:0.55},
    });
    assert.equal(M.detectBlockPose(lm), false);
  });

  it('returns false when both wrists are below the hips', () => {
    const lm = makeLm({
      11: {x:0.35, y:0.28}, 12: {x:0.65, y:0.28},
      15: {x:0.40, y:0.70},  // below hipY 0.55
      16: {x:0.60, y:0.70},
      23: {x:0.39, y:0.55}, 24: {x:0.61, y:0.55},
    });
    assert.equal(M.detectBlockPose(lm), false);
  });
});

// ─── computeSwingVector ──────────────────────────────────────

describe('computeSwingVector', () => {
  it('is a function', () => assert.ok(typeof M.computeSwingVector === 'function'));
  it('returns null for null input',  () => assert.equal(M.computeSwingVector(null),  null));
  it('returns null for empty array', () => assert.equal(M.computeSwingVector([]),    null));
  it('returns null when fewer than 8 entries', () => {
    const hist = Array.from({length: 7}, (_, i) => ({x: i * 0.01, y: 0}));
    assert.equal(M.computeSwingVector(hist), null);
  });

  it('returns object with dx, dy, speed when hist is long enough', () => {
    const hist = Array.from({length: 16}, (_, i) => ({x: i * 0.01, y: 0}));
    const r = M.computeSwingVector(hist);
    assert.ok(r !== null);
    assert.ok('dx' in r && 'dy' in r && 'speed' in r);
  });

  it('slash ↘ — wrist moves camera-right+down → display_dx negative, dy positive', () => {
    // MP x increases (camera-right = display-left) → display_dx = -mp_dx < 0
    // dy increases (downward)
    const hist = Array.from({length: 24}, (_, i) => ({
      x: 0.2 + i * 0.01,  // increasing mp.x → display moves left
      y: 0.3 + i * 0.01,  // increasing mp.y → moves down
    }));
    const r = M.computeSwingVector(hist);
    assert.ok(r.dx < 0, `expected dx < 0, got ${r.dx}`);
    assert.ok(r.dy > 0, `expected dy > 0, got ${r.dy}`);
    assert.ok(r.speed > 0.05);
  });

  it('rise ↗ — wrist moves camera-left+up → display_dx positive, dy negative', () => {
    const hist = Array.from({length: 24}, (_, i) => ({
      x: 0.8 - i * 0.01,  // decreasing mp.x → display moves right
      y: 0.7 - i * 0.01,  // decreasing mp.y → moves up
    }));
    const r = M.computeSwingVector(hist);
    assert.ok(r.dx > 0, `expected dx > 0, got ${r.dx}`);
    assert.ok(r.dy < 0, `expected dy < 0, got ${r.dy}`);
    assert.ok(r.speed > 0.05);
  });

  it('stationary wrist returns near-zero speed', () => {
    const hist = Array.from({length: 24}, () => ({x: 0.5, y: 0.5}));
    const r = M.computeSwingVector(hist);
    assert.ok(r.speed < 0.001, `expected speed ≈ 0, got ${r.speed}`);
  });

  it('speed equals hypot(dx, dy)', () => {
    const hist = Array.from({length: 16}, (_, i) => ({x: i * 0.02, y: i * 0.02}));
    const r = M.computeSwingVector(hist);
    assert.ok(approx(r.speed, Math.hypot(r.dx, r.dy), 1e-9));
  });
});
