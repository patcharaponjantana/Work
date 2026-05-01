/**
 * Pure 3D vector + joint-angle helpers for the pose lab.
 * Attaches PoseSkeletonMath on globalThis for the browser and Node tests.
 */
(function (root) {
  'use strict';

  function vec3Sub(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function vec3Len(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  /**
   * @param {{x:number,y:number,z:number}} v
   * @returns {{x:number,y:number,z:number}|null}
   */
  function vec3Normalize(v) {
    var len = vec3Len(v);
    if (len < 1e-10) return null;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  function vec3Dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  /**
   * Unit bone from parent → child (direction of the segment).
   */
  function boneUnitVector(parent, child) {
    return vec3Normalize(vec3Sub(child, parent));
  }

  /**
   * Interior angle at B between segments B→A and B→C (vectors u = A−B, v = C−B).
   * θ = arccos(clamp((u·v)/(|u||v|), −1, 1)) in degrees.
   * @returns {number|null} degrees, or null if either edge has zero length
   */
  function jointInteriorAngleDeg(a, b, c) {
    var u = vec3Sub(a, b);
    var v = vec3Sub(c, b);
    var lu = vec3Len(u);
    var lv = vec3Len(v);
    if (lu < 1e-10 || lv < 1e-10) return null;
    var cosTh = clamp(vec3Dot(u, v) / (lu * lv), -1, 1);
    return (Math.acos(cosTh) * 180) / Math.PI;
  }

  /**
   * Same geometry as jointInteriorAngleDeg plus scalar terms for teaching UI.
   * @returns {{ deg: number, cosTheta: number, dotRaw: number, lenU: number, lenV: number }|null}
   */
  function jointInteriorAngleDetail(a, b, c) {
    var u = vec3Sub(a, b);
    var v = vec3Sub(c, b);
    var lu = vec3Len(u);
    var lv = vec3Len(v);
    if (lu < 1e-10 || lv < 1e-10) return null;
    var dotRaw = vec3Dot(u, v);
    var cosTh = clamp(dotRaw / (lu * lv), -1, 1);
    return {
      deg: (Math.acos(cosTh) * 180) / Math.PI,
      cosTheta: cosTh,
      dotRaw: dotRaw,
      lenU: lu,
      lenV: lv,
    };
  }

  root.PoseSkeletonMath = {
    vec3Sub: vec3Sub,
    vec3Len: vec3Len,
    vec3Normalize: vec3Normalize,
    vec3Dot: vec3Dot,
    boneUnitVector: boneUnitVector,
    jointInteriorAngleDeg: jointInteriorAngleDeg,
    jointInteriorAngleDetail: jointInteriorAngleDetail,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
