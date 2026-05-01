/**
 * retarget-math.js
 * Pure geometry helpers for the animation retargeting tutorial.
 * Works as a browser <script> (attaches RetargetMath to globalThis)
 * and as a CommonJS/ESM require() target for Node tests.
 */
(function (root) {
  'use strict';

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function deg2rad(d) { return d * (Math.PI / 180); }
  function rad2deg(r) { return r * (180 / Math.PI); }
  function dist2d(a, b) { return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2); }

  /**
   * Two-bone IK solver using the law of cosines.
   * @param {{x:number,y:number}} hip
   * @param {{x:number,y:number}} footTarget
   * @param {number} L1   thigh length
   * @param {number} L2   shin length
   * @param {boolean} [bendForward=true]  knee bends toward +X when true
   * @returns {{ knee:{x:number,y:number}, foot:{x:number,y:number},
   *             reachable:boolean, reachPct:number, kneeAngleDeg:number }}
   */
  function solveIK2Bone(hip, footTarget, L1, L2, bendForward) {
    const dx = footTarget.x - hip.x;
    const dy = footTarget.y - hip.y;
    const d  = Math.sqrt(dx * dx + dy * dy);
    const maxReach = L1 + L2;
    const minReach = Math.abs(L1 - L2);
    const reachable = d >= minReach + 1e-4 && d <= maxReach - 1e-4;
    const dc = clamp(d, minReach + 1e-4, maxReach - 1e-4);

    const baseAngle = Math.atan2(dy, dx);
    let cosA = (dc * dc + L1 * L1 - L2 * L2) / (2 * dc * L1);
    cosA = clamp(cosA, -1, 1);
    const alpha = Math.acos(cosA);

    const kneeAngle = (bendForward !== false) ? baseAngle - alpha : baseAngle + alpha;
    const knee = {
      x: hip.x + L1 * Math.cos(kneeAngle),
      y: hip.y + L1 * Math.sin(kneeAngle),
    };

    // Knee interior angle in degrees
    const v1x = hip.x - knee.x, v1y = hip.y - knee.y;
    const v2x = footTarget.x - knee.x, v2y = footTarget.y - knee.y;
    const cosKnee = clamp(
      (v1x * v2x + v1y * v2y) / (Math.sqrt(v1x ** 2 + v1y ** 2) * Math.sqrt(v2x ** 2 + v2y ** 2)),
      -1, 1
    );
    const kneeAngleDeg = rad2deg(Math.acos(cosKnee));

    return { knee, foot: footTarget, reachable, reachPct: d / maxReach, kneeAngleDeg };
  }

  /**
   * Distribute totalDeg evenly across boneCount bones.
   * @param {number} totalDeg
   * @param {number} boneCount
   * @returns {number[]}
   */
  function distributeRotation(totalDeg, boneCount) {
    if (boneCount <= 0) return [];
    const per = totalDeg / boneCount;
    return Array.from({ length: boneCount }, () => per);
  }

  /**
   * Weighted spine distribution: bottom-heavy or top-heavy.
   * Weights are a linear ramp; 'bottom' means lower bones bend more.
   * @param {number} totalDeg
   * @param {number} boneCount
   * @param {'even'|'bottom'|'top'} mode
   * @returns {number[]}
   */
  function distributeRotationWeighted(totalDeg, boneCount, mode) {
    if (boneCount <= 0) return [];
    if (mode === 'even') return distributeRotation(totalDeg, boneCount);
    const weights = Array.from({ length: boneCount }, (_, i) => {
      const t = boneCount > 1 ? i / (boneCount - 1) : 0.5;
      return mode === 'bottom' ? (1 - t) + 0.2 : t + 0.2; // ramp + floor
    });
    const total = weights.reduce((a, b) => a + b, 0);
    return weights.map(w => totalDeg * (w / total));
  }

  /**
   * Compute a bent spine chain rising from basePos.
   * @param {number} totalBendDeg  total forward curl
   * @param {number} boneCount
   * @param {{x:number,y:number}} basePos
   * @param {number} boneLen
   * @param {'even'|'bottom'|'top'} [mode='even']
   * @returns {{x:number,y:number}[]}  boneCount + 1 points
   */
  function computeSpineChain(totalBendDeg, boneCount, basePos, boneLen, mode) {
    const perBone = distributeRotationWeighted(totalBendDeg, boneCount, mode || 'even');
    const pts = [{ x: basePos.x, y: basePos.y }];
    let angle = -90; // pointing upward in SVG (270° = -90°)
    for (let i = 0; i < boneCount; i++) {
      angle += perBone[i];
      const r = deg2rad(angle);
      const last = pts[pts.length - 1];
      pts.push({ x: last.x + boneLen * Math.cos(r), y: last.y + boneLen * Math.sin(r) });
    }
    return pts;
  }

  /**
   * Compute all joint world positions for one frame of a walk cycle.
   * @param {{ spine:number, chest:number, neck:number,
   *           upperArm:number, lowerArm:number,
   *           thigh:number, shin:number, headR:number }} skel
   * @param {number} t   elapsed seconds
   * @param {number} [rootX]  override center X (for root-motion mode)
   */
  function computeWalkPose(skel, t, rootX) {
    const freq  = 1.1;
    const phase = 2 * Math.PI * freq * t;
    const cx    = rootX != null ? rootX : 90;

    const hipSway = Math.sin(phase) * 3.5;
    const hipBob  = Math.abs(Math.sin(phase)) * 3;

    const pelvis   = { x: cx + hipSway,  y: 160 - hipBob };
    const spine    = { x: pelvis.x,      y: pelvis.y - skel.spine };
    const chest    = { x: spine.x,       y: spine.y  - skel.chest };
    const neck     = { x: chest.x,       y: chest.y  - skel.neck  };
    const headC    = { x: neck.x,        y: neck.y   - skel.headR };

    const sW       = 22;
    const lShoulder = { x: chest.x - sW, y: chest.y + 4 };
    const rShoulder = { x: chest.x + sW, y: chest.y + 4 };

    const armSwing  = deg2rad(Math.sin(phase) * 20);
    const lElbow    = { x: lShoulder.x - skel.upperArm * Math.sin(armSwing),  y: lShoulder.y + skel.upperArm * Math.cos(armSwing) };
    const rElbow    = { x: rShoulder.x + skel.upperArm * Math.sin(-armSwing), y: rShoulder.y + skel.upperArm * Math.cos(-armSwing) };
    const lWrist    = { x: lElbow.x - skel.lowerArm * Math.sin(armSwing + 0.1),  y: lElbow.y + skel.lowerArm * Math.cos(armSwing + 0.1) };
    const rWrist    = { x: rElbow.x + skel.lowerArm * Math.sin(-armSwing + 0.1), y: rElbow.y + skel.lowerArm * Math.cos(-armSwing + 0.1) };

    const hipW      = 12;
    const lHip      = { x: pelvis.x - hipW, y: pelvis.y + 7 };
    const rHip      = { x: pelvis.x + hipW, y: pelvis.y + 7 };

    const legSwing  = deg2rad(26);
    const lThighA   =  Math.sin(phase) * legSwing;
    const rThighA   = -Math.sin(phase) * legSwing;
    const lShinBend = Math.max(0, -Math.sin(phase)) * deg2rad(32);
    const rShinBend = Math.max(0,  Math.sin(phase)) * deg2rad(32);

    const lKnee  = { x: lHip.x + skel.thigh * Math.sin(lThighA),  y: lHip.y + skel.thigh * Math.cos(lThighA) };
    const rKnee  = { x: rHip.x + skel.thigh * Math.sin(rThighA),  y: rHip.y + skel.thigh * Math.cos(rThighA) };
    const lAnkle = { x: lKnee.x + skel.shin  * Math.sin(lThighA + lShinBend), y: lKnee.y + skel.shin  * Math.cos(lThighA + lShinBend) };
    const rAnkle = { x: rKnee.x + skel.shin  * Math.sin(rThighA - rShinBend), y: rKnee.y + skel.shin  * Math.cos(rThighA - rShinBend) };

    return { pelvis, spine, chest, neck, headC, lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle };
  }

  const api = {
    clamp, lerp, deg2rad, rad2deg, dist2d,
    solveIK2Bone,
    distributeRotation,
    distributeRotationWeighted,
    computeSpineChain,
    computeWalkPose,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  }
  root.RetargetMath = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
