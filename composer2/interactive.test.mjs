/**
 * Tests for pure geometry helpers exposed by interactive.js.
 * Run with: node --test interactive.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
require('./interactive.js');

const R = globalThis.RetargetInteractives;

// ─── scaleAround ─────────────────────────────────────────────────────────────

describe('RetargetInteractives.scaleAround', () => {
  it('scales a point around origin on each axis', () => {
    assert.ok(typeof R.scaleAround === 'function');
    const origin = { x: 0, y: 0 };
    const p = { x: 10, y: 20 };
    const q = R.scaleAround(origin, p, 2, 0.5);
    assert.deepEqual(q, { x: 20, y: 10 });
  });

  it('handles non-zero origins like hip pivots', () => {
    const hip = { x: 104, y: 182 };
    const knee = { x: 104, y: 235 };
    const k = R.scaleAround(hip, knee, 1, 1.2);
    assert.equal(k.x, 104);
    assert.ok(k.y > knee.y);
  });

  it('scale of 1 on both axes returns the original point', () => {
    const origin = { x: 50, y: 80 };
    const p = { x: 90, y: 120 };
    const q = R.scaleAround(origin, p, 1, 1);
    assert.equal(q.x, p.x);
    assert.equal(q.y, p.y);
  });
});

// ─── solveIK2Bone ─────────────────────────────────────────────────────────────

describe('RetargetInteractives.solveIK2Bone', () => {
  it('is exported as a function', () => {
    assert.ok(typeof R.solveIK2Bone === 'function');
  });

  it('places foot at the target position', () => {
    const hip = { x: 100, y: 50 };
    const foot = { x: 100, y: 160 };
    const result = R.solveIK2Bone(hip, foot, 60, 55, true);
    assert.ok(Math.abs(result.foot.x - foot.x) < 0.001);
    assert.ok(Math.abs(result.foot.y - foot.y) < 0.001);
  });

  it('marks reachable=true when foot is within reach', () => {
    const hip = { x: 100, y: 80 };
    const foot = { x: 110, y: 190 };
    const result = R.solveIK2Bone(hip, foot, 60, 55, true);
    assert.equal(result.reachable, true);
  });

  it('marks reachable=false when foot is out of reach', () => {
    const hip = { x: 0, y: 0 };
    const foot = { x: 0, y: 500 }; // way too far
    const result = R.solveIK2Bone(hip, foot, 50, 50, true);
    assert.equal(result.reachable, false);
  });

  it('knee is at exactly L1 distance from hip', () => {
    const hip = { x: 100, y: 60 };
    const foot = { x: 110, y: 175 };
    const L1 = 62, L2 = 58;
    const result = R.solveIK2Bone(hip, foot, L1, L2, true);
    const kDist = Math.sqrt(
      Math.pow(result.knee.x - hip.x, 2) + Math.pow(result.knee.y - hip.y, 2)
    );
    assert.ok(Math.abs(kDist - L1) < 0.01, 'knee should be L1 from hip, got ' + kDist);
  });

  it('knee is at exactly L2 distance from foot', () => {
    const hip = { x: 100, y: 60 };
    const foot = { x: 100, y: 165 };
    const L1 = 55, L2 = 52;
    const result = R.solveIK2Bone(hip, foot, L1, L2, true);
    const fDist = Math.sqrt(
      Math.pow(result.knee.x - foot.x, 2) + Math.pow(result.knee.y - foot.y, 2)
    );
    assert.ok(Math.abs(fDist - L2) < 0.01, 'knee should be L2 from foot, got ' + fDist);
  });

  it('straight-down reach: knee bends to positive X with bendForward=true', () => {
    const hip = { x: 100, y: 50 };
    const foot = { x: 100, y: 155 };
    const result = R.solveIK2Bone(hip, foot, 55, 52, true);
    assert.ok(result.knee.x > hip.x, 'knee should be to the right of hip with bendForward');
  });

  it('straight-down reach: knee bends to negative X with bendForward=false', () => {
    const hip = { x: 100, y: 50 };
    const foot = { x: 100, y: 155 };
    const result = R.solveIK2Bone(hip, foot, 55, 52, false);
    assert.ok(result.knee.x < hip.x, 'knee should be to the left of hip without bendForward');
  });
});

// ─── distributeRotation ───────────────────────────────────────────────────────

describe('RetargetInteractives.distributeRotation', () => {
  it('is exported as a function', () => {
    assert.ok(typeof R.distributeRotation === 'function');
  });

  it('returns an array of length boneCount', () => {
    const result = R.distributeRotation(90, 3);
    assert.equal(result.length, 3);
  });

  it('each element equals totalDeg / boneCount', () => {
    const result = R.distributeRotation(90, 3);
    result.forEach(function (v) {
      assert.ok(Math.abs(v - 30) < 0.0001);
    });
  });

  it('sums to totalDeg', () => {
    const total = 75;
    const result = R.distributeRotation(total, 5);
    const sum = result.reduce(function (a, b) { return a + b; }, 0);
    assert.ok(Math.abs(sum - total) < 0.0001);
  });

  it('returns [] for boneCount <= 0', () => {
    assert.deepEqual(R.distributeRotation(90, 0), []);
    assert.deepEqual(R.distributeRotation(90, -1), []);
  });

  it('works with a single bone (no distribution)', () => {
    const result = R.distributeRotation(45, 1);
    assert.equal(result.length, 1);
    assert.ok(Math.abs(result[0] - 45) < 0.0001);
  });

  it('works with zero total bend', () => {
    const result = R.distributeRotation(0, 4);
    result.forEach(function (v) { assert.equal(v, 0); });
  });
});

// ─── computeSpineChain ───────────────────────────────────────────────────────

describe('RetargetInteractives.computeSpineChain', () => {
  it('is exported as a function', () => {
    assert.ok(typeof R.computeSpineChain === 'function');
  });

  it('returns boneCount + 1 points', () => {
    const pts = R.computeSpineChain(30, 3, { x: 80, y: 190 }, 38);
    assert.equal(pts.length, 4); // 3 bones = 4 joints
  });

  it('returns boneCount + 1 points for 5-bone chain', () => {
    const pts = R.computeSpineChain(30, 5, { x: 80, y: 190 }, 23);
    assert.equal(pts.length, 6);
  });

  it('first point equals basePos', () => {
    const base = { x: 100, y: 200 };
    const pts = R.computeSpineChain(20, 3, base, 35);
    assert.equal(pts[0].x, base.x);
    assert.equal(pts[0].y, base.y);
  });

  it('with zero bend, chain goes straight up', () => {
    const base = { x: 90, y: 180 };
    const boneLen = 40;
    const pts = R.computeSpineChain(0, 3, base, boneLen);
    // Each segment should be pointing straight up (y decreasing, x constant)
    for (let i = 1; i < pts.length; i++) {
      assert.ok(Math.abs(pts[i].x - base.x) < 0.01, 'x should not drift with zero bend');
      assert.ok(pts[i].y < pts[i - 1].y, 'each joint should be above the last');
    }
  });

  it('consecutive bone distances equal boneLen', () => {
    const pts = R.computeSpineChain(45, 4, { x: 80, y: 190 }, 30);
    for (let i = 1; i < pts.length; i++) {
      const dist = Math.sqrt(
        Math.pow(pts[i].x - pts[i - 1].x, 2) + Math.pow(pts[i].y - pts[i - 1].y, 2)
      );
      assert.ok(Math.abs(dist - 30) < 0.001, 'segment ' + i + ' length should be 30, got ' + dist);
    }
  });
});

// ─── computeWalkPose ─────────────────────────────────────────────────────────

describe('RetargetInteractives.computeWalkPose', () => {
  it('is exported as a function', () => {
    assert.ok(typeof R.computeWalkPose === 'function');
  });

  it('returns an object with expected joint keys', () => {
    const skel = { spine: 30, chest: 20, neck: 12, upperArm: 25, lowerArm: 22, thigh: 45, shin: 42 };
    const pose = R.computeWalkPose(skel, 0);
    const expected = ['pelvis', 'spine', 'chest', 'neck', 'headC', 'lHip', 'rHip', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle'];
    expected.forEach(function (k) {
      assert.ok(k in pose, 'missing joint: ' + k);
      assert.ok('x' in pose[k] && 'y' in pose[k]);
    });
  });

  it('pelvis y varies with time (hip bob)', () => {
    const skel = { spine: 30, chest: 20, neck: 12, upperArm: 25, lowerArm: 22, thigh: 45, shin: 42 };
    const t0 = R.computeWalkPose(skel, 0.0);
    const t1 = R.computeWalkPose(skel, 0.2);
    // Hip bob should produce different y values at different times
    // (may be equal at exactly 0 and certain multiples, but not 0 and 0.2)
    assert.ok(
      t0.pelvis.y !== t1.pelvis.y || t0.pelvis.x !== t1.pelvis.x,
      'pose should differ between t=0 and t=0.2'
    );
  });

  it('rootX overrides the default center x', () => {
    const skel = { spine: 30, chest: 20, neck: 12, upperArm: 25, lowerArm: 22, thigh: 45, shin: 42 };
    const pose = R.computeWalkPose(skel, 0, 200);
    // Pelvis should be near x=200 (with small hip sway)
    assert.ok(Math.abs(pose.pelvis.x - 200) < 10, 'pelvis.x should be near rootX=200');
  });
});

// ─── mediaPipeNormalizedToImagePx ──────────────────────────────────────────

describe('RetargetInteractives.mediaPipeNormalizedToImagePx', () => {
  it('is exported as a function', () => {
    assert.ok(typeof R.mediaPipeNormalizedToImagePx === 'function');
  });

  it('scales x and y by width and height', () => {
    const p = R.mediaPipeNormalizedToImagePx({ x: 0.5, y: 0.25, z: -0.1 }, 640, 480);
    assert.ok(Math.abs(p.x - 320) < 0.001);
    assert.ok(Math.abs(p.y - 120) < 0.001);
  });

  it('scales z by width (MediaPipe convention)', () => {
    const p = R.mediaPipeNormalizedToImagePx({ x: 0, y: 0, z: 0.2 }, 800, 600);
    assert.ok(Math.abs(p.z - 160) < 0.001);
  });
});

// ─── hipRelativeVector ─────────────────────────────────────────────────────

describe('RetargetInteractives.hipRelativeVector', () => {
  it('is exported as a function', () => {
    assert.ok(typeof R.hipRelativeVector === 'function');
  });

  it('subtracts components', () => {
    const hip = { x: 0.5, y: 0.5, z: 0 };
    const w = { x: 0.6, y: 0.4, z: -0.05 };
    const v = R.hipRelativeVector(hip, w, {});
    assert.ok(Math.abs(v.x - 0.1) < 1e-9);
    assert.ok(Math.abs(v.y - -0.1) < 1e-9);
    assert.equal(v.z, -0.05);
  });

  it('mirrorX flips the x delta', () => {
    const a = { x: 0.2, y: 0, z: 0 };
    const b = { x: 0.5, y: 0, z: 0 };
    const v = R.hipRelativeVector(a, b, { mirrorX: true });
    assert.ok(Math.abs(v.x - -0.3) < 1e-9);
    assert.equal(v.y, 0);
  });
});

// ─── mpBasisToUeVector ──────────────────────────────────────────────────────

describe('RetargetInteractives.mpBasisToUeVector', () => {
  it('is exported as a function', () => {
    assert.ok(typeof R.mpBasisToUeVector === 'function');
  });

  it('maps depth to +X, image x to +Y, -image y to Z', () => {
    const v = R.mpBasisToUeVector({ x: 0, y: 0, z: 1 }, { scale: 100, depthGain: 1 });
    assert.ok(Math.abs(v.x - 100) < 1e-9);
    assert.ok(Math.abs(v.y) < 1e-9);
    assert.ok(Math.abs(v.z) < 1e-9);
  });

  it('applies depthGain to z input', () => {
    const v = R.mpBasisToUeVector({ x: 0, y: 0, z: 1 }, { scale: 10, depthGain: 2 });
    assert.ok(Math.abs(v.x - 20) < 1e-9);
  });

  it('applies flip factors', () => {
    const v = R.mpBasisToUeVector({ x: 1, y: 1, z: 1 }, { scale: 1, flipX: -1, flipY: -1, flipZ: -1 });
    assert.deepEqual(v, { x: -1, y: -1, z: 1 });
  });
});

// ─── directionToYawPitchDegrees ─────────────────────────────────────────────

describe('RetargetInteractives.directionToYawPitchDegrees', () => {
  it('is exported as a function', () => {
    assert.ok(typeof R.directionToYawPitchDegrees === 'function');
  });

  it('returns valid=false for zero vector', () => {
    const r = R.directionToYawPitchDegrees({ x: 0, y: 0, z: 0 });
    assert.equal(r.valid, false);
  });

  it('+X is yaw 0 and pitch 0', () => {
    const r = R.directionToYawPitchDegrees({ x: 1, y: 0, z: 0 });
    assert.equal(r.valid, true);
    assert.ok(Math.abs(r.yaw) < 1e-9);
    assert.ok(Math.abs(r.pitch) < 1e-9);
  });

  it('+Y is yaw 90°', () => {
    const r = R.directionToYawPitchDegrees({ x: 0, y: 1, z: 0 });
    assert.equal(r.valid, true);
    assert.ok(Math.abs(r.yaw - 90) < 1e-6);
    assert.ok(Math.abs(r.pitch) < 1e-6);
  });

  it('normalized internally', () => {
    const r = R.directionToYawPitchDegrees({ x: 10, y: 0, z: 0 });
    assert.equal(r.valid, true);
    assert.ok(Math.abs(r.yaw) < 1e-9);
  });
});
