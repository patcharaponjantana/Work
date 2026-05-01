/**
 * Tests for PoseSkeletonMath (skeleton-math.js).
 * Run with: node --test skeleton-math.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
require('./skeleton-math.js');

const M = globalThis.PoseSkeletonMath;

describe('PoseSkeletonMath.jointInteriorAngleDeg', () => {
  it('is exported', () => {
    assert.ok(typeof M.jointInteriorAngleDeg === 'function');
  });

  it('returns 90° for perpendicular segments at B', () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 0, y: 1, z: 0 };
    const deg = M.jointInteriorAngleDeg(a, b, c);
    assert.ok(deg != null);
    assert.ok(Math.abs(deg - 90) < 1e-6);
  });

  it('returns 0° when A and C lie on the same ray from B', () => {
    const a = { x: 0, y: 1, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 0, y: 2, z: 0 };
    const deg = M.jointInteriorAngleDeg(a, b, c);
    assert.ok(deg != null);
    assert.ok(Math.abs(deg) < 1e-6);
  });

  it('returns 180° when A and C are opposite directions from B', () => {
    const a = { x: 0, y: 1, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 0, y: -1, z: 0 };
    const deg = M.jointInteriorAngleDeg(a, b, c);
    assert.ok(deg != null);
    assert.ok(Math.abs(deg - 180) < 1e-6);
  });

  it('returns null if B coincides with A', () => {
    const a = { x: 0, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 1, y: 0, z: 0 };
    assert.equal(M.jointInteriorAngleDeg(a, b, c), null);
  });
});

describe('PoseSkeletonMath.jointInteriorAngleDetail', () => {
  it('includes cosTheta matching geometry', () => {
    const a = { x: 1, y: 0, z: 0 };
    const b = { x: 0, y: 0, z: 0 };
    const c = { x: 0, y: 1, z: 0 };
    const d = M.jointInteriorAngleDetail(a, b, c);
    assert.ok(d != null);
    assert.ok(Math.abs(d.deg - 90) < 1e-6);
    assert.ok(Math.abs(d.cosTheta) < 1e-6);
  });
});
