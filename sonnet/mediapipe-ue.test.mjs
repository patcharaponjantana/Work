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
