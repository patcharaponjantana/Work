/**
 * Tests for retarget-math.js pure helpers.
 * Run with: node --test retarget-math.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const M = require('./retarget-math.js');

// ─── Utilities ────────────────────────────────────────────────

describe('clamp', () => {
  it('clamps below minimum', () => assert.equal(M.clamp(-5, 0, 10), 0));
  it('clamps above maximum', () => assert.equal(M.clamp(15, 0, 10), 10));
  it('passes through in-range value', () => assert.equal(M.clamp(5, 0, 10), 5));
});

describe('deg2rad / rad2deg', () => {
  it('deg2rad(180) ≈ π', () => assert.ok(Math.abs(M.deg2rad(180) - Math.PI) < 1e-9));
  it('rad2deg(π) = 180', () => assert.ok(Math.abs(M.rad2deg(Math.PI) - 180) < 1e-9));
  it('round-trips', () => assert.ok(Math.abs(M.rad2deg(M.deg2rad(45)) - 45) < 1e-9));
});

describe('dist2d', () => {
  it('returns 0 for same point', () => assert.equal(M.dist2d({x:3,y:4},{x:3,y:4}), 0));
  it('returns 5 for 3-4-5 triangle', () => assert.equal(M.dist2d({x:0,y:0},{x:3,y:4}), 5));
  it('is symmetric', () => {
    assert.equal(M.dist2d({x:1,y:2},{x:4,y:6}), M.dist2d({x:4,y:6},{x:1,y:2}));
  });
});

// ─── solveIK2Bone ─────────────────────────────────────────────

describe('solveIK2Bone', () => {
  it('is a function', () => assert.ok(typeof M.solveIK2Bone === 'function'));

  it('returns knee and foot fields', () => {
    const r = M.solveIK2Bone({x:100,y:50},{x:110,y:180},65,60,true);
    assert.ok('knee' in r && 'foot' in r && 'reachable' in r);
  });

  it('foot equals the supplied target', () => {
    const ft = {x:110,y:175};
    const r = M.solveIK2Bone({x:100,y:50},ft,60,55,true);
    assert.ok(Math.abs(r.foot.x - ft.x) < 1e-9);
    assert.ok(Math.abs(r.foot.y - ft.y) < 1e-9);
  });

  it('knee is exactly L1 from hip', () => {
    const hip = {x:100,y:50}, L1=68, L2=62;
    const r = M.solveIK2Bone(hip,{x:110,y:175},L1,L2,true);
    const d = M.dist2d(hip, r.knee);
    assert.ok(Math.abs(d - L1) < 0.01, `Expected L1=${L1}, got ${d}`);
  });

  it('knee is exactly L2 from foot', () => {
    const foot = {x:100,y:175}, L1=68, L2=62;
    const r = M.solveIK2Bone({x:100,y:50},foot,L1,L2,true);
    const d = M.dist2d(r.knee, foot);
    assert.ok(Math.abs(d - L2) < 0.01, `Expected L2=${L2}, got ${d}`);
  });

  it('reachable=true for normal reach', () => {
    const r = M.solveIK2Bone({x:100,y:50},{x:105,y:170},65,60,true);
    assert.equal(r.reachable, true);
  });

  it('reachable=false when too far', () => {
    const r = M.solveIK2Bone({x:0,y:0},{x:0,y:600},60,55,true);
    assert.equal(r.reachable, false);
  });

  it('reachPct is d / maxReach', () => {
    const hip={x:0,y:0}, foot={x:0,y:100}, L1=60, L2=55;
    const r = M.solveIK2Bone(hip,foot,L1,L2,true);
    const expected = 100 / (L1+L2);
    assert.ok(Math.abs(r.reachPct - expected) < 0.001);
  });

  it('bendForward=true puts knee to the right (positive X) of straight-down chain', () => {
    const r = M.solveIK2Bone({x:100,y:50},{x:100,y:160},60,55,true);
    assert.ok(r.knee.x > 100, 'knee should be right of hip with bendForward=true');
  });

  it('bendForward=false puts knee to the left', () => {
    const r = M.solveIK2Bone({x:100,y:50},{x:100,y:160},60,55,false);
    assert.ok(r.knee.x < 100, 'knee should be left of hip with bendForward=false');
  });

  it('kneeAngleDeg is between 0 and 180', () => {
    const r = M.solveIK2Bone({x:100,y:50},{x:110,y:170},65,60,true);
    assert.ok(r.kneeAngleDeg >= 0 && r.kneeAngleDeg <= 180);
  });
});

// ─── distributeRotation ───────────────────────────────────────

describe('distributeRotation', () => {
  it('returns correct length', () => assert.equal(M.distributeRotation(90,3).length, 3));
  it('each element = totalDeg / boneCount', () => {
    M.distributeRotation(90,3).forEach(v => assert.ok(Math.abs(v-30)<1e-9));
  });
  it('sums to totalDeg', () => {
    const sum = M.distributeRotation(75,5).reduce((a,b)=>a+b,0);
    assert.ok(Math.abs(sum-75)<1e-9);
  });
  it('returns [] for boneCount=0', () => assert.deepEqual(M.distributeRotation(90,0),[]));
  it('single bone gets full amount', () => {
    assert.ok(Math.abs(M.distributeRotation(45,1)[0]-45)<1e-9);
  });
  it('works for zero bend', () => {
    M.distributeRotation(0,4).forEach(v => assert.equal(v,0));
  });
});

// ─── distributeRotationWeighted ───────────────────────────────

describe('distributeRotationWeighted', () => {
  it('even mode equals distributeRotation', () => {
    const a = M.distributeRotation(60,4);
    const b = M.distributeRotationWeighted(60,4,'even');
    a.forEach((v,i) => assert.ok(Math.abs(v-b[i])<1e-9));
  });

  it('bottom mode sums to totalDeg', () => {
    const sum = M.distributeRotationWeighted(60,4,'bottom').reduce((a,b)=>a+b,0);
    assert.ok(Math.abs(sum-60)<1e-6);
  });

  it('top mode sums to totalDeg', () => {
    const sum = M.distributeRotationWeighted(60,4,'top').reduce((a,b)=>a+b,0);
    assert.ok(Math.abs(sum-60)<1e-6);
  });

  it('bottom mode: first bone gets more than last', () => {
    const r = M.distributeRotationWeighted(60,4,'bottom');
    assert.ok(r[0] > r[r.length-1], 'first bone should be heaviest in bottom mode');
  });

  it('top mode: last bone gets more than first', () => {
    const r = M.distributeRotationWeighted(60,4,'top');
    assert.ok(r[r.length-1] > r[0], 'last bone should be heaviest in top mode');
  });

  it('returns [] for boneCount=0', () => {
    assert.deepEqual(M.distributeRotationWeighted(60,0,'even'),[]);
  });
});

// ─── computeSpineChain ────────────────────────────────────────

describe('computeSpineChain', () => {
  it('returns boneCount+1 points', () => {
    assert.equal(M.computeSpineChain(30,3,{x:60,y:180},35).length, 4);
    assert.equal(M.computeSpineChain(30,5,{x:60,y:180},22).length, 6);
  });

  it('first point equals basePos', () => {
    const base = {x:80,y:190};
    const pts = M.computeSpineChain(20,3,base,36);
    assert.equal(pts[0].x, base.x);
    assert.equal(pts[0].y, base.y);
  });

  it('zero bend produces vertical chain (each y decreasing)', () => {
    const pts = M.computeSpineChain(0,3,{x:80,y:180},36);
    for (let i=1;i<pts.length;i++) assert.ok(pts[i].y < pts[i-1].y);
  });

  it('zero bend: x stays constant', () => {
    const pts = M.computeSpineChain(0,3,{x:80,y:180},36);
    pts.forEach(p => assert.ok(Math.abs(p.x-80)<0.01));
  });

  it('each segment has length = boneLen', () => {
    const pts = M.computeSpineChain(45,4,{x:80,y:190},30);
    for (let i=1;i<pts.length;i++) {
      const d = M.dist2d(pts[i-1],pts[i]);
      assert.ok(Math.abs(d-30)<0.01, `segment ${i} d=${d}`);
    }
  });
});

// ─── computeWalkPose ─────────────────────────────────────────

describe('computeWalkPose', () => {
  const SKEL = {spine:30,chest:20,neck:12,upperArm:24,lowerArm:22,thigh:45,shin:42,headR:11};

  it('returns required joints', () => {
    const p = M.computeWalkPose(SKEL, 0);
    ['pelvis','spine','chest','neck','headC','lHip','rHip','lKnee','rKnee','lAnkle','rAnkle',
     'lShoulder','rShoulder','lElbow','rElbow'].forEach(k => {
      assert.ok(k in p, `missing: ${k}`);
      assert.ok('x' in p[k] && 'y' in p[k]);
    });
  });

  it('pose differs between t=0 and t=0.5', () => {
    const p0 = M.computeWalkPose(SKEL, 0);
    const p1 = M.computeWalkPose(SKEL, 0.5);
    assert.ok(p0.lAnkle.x !== p1.lAnkle.x || p0.lAnkle.y !== p1.lAnkle.y);
  });

  it('rootX shifts pelvis x', () => {
    const p = M.computeWalkPose(SKEL, 0, 300);
    assert.ok(Math.abs(p.pelvis.x - 300) < 10);
  });

  it('left and right ankles are horizontally separated', () => {
    const p = M.computeWalkPose(SKEL, 0.25);
    assert.ok(Math.abs(p.lAnkle.x - p.rAnkle.x) > 1);
  });
});
