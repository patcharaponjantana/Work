/**
 * mediapipe-ue.js
 * Pure math helpers for the MediaPipe → Unreal Engine tutorial.
 * Works as a browser <script> (attaches MpUE to globalThis)
 * and as a CommonJS/ESM require() target for Node tests.
 *
 * Coordinate conventions
 * ──────────────────────
 * MediaPipe Pose outputs normalized image-space landmarks:
 *   x : 0 (left edge) → 1 (right edge)
 *   y : 0 (top edge)  → 1 (bottom edge)
 *   z : depth relative to hips; negative = closer to camera, ~same scale as x
 *
 * Unreal Engine world space (Z-up, right-hand rule):
 *   X : forward (into screen / away from camera)
 *   Y : right
 *   Z : up
 */
(function (root) {
  'use strict';

  // ── Scalar helpers ────────────────────────────────────────────

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /**
   * Linearly remap v from [inMin,inMax] → [outMin,outMax].
   * Does NOT clamp — caller may clamp if needed.
   */
  function mapRange(v, inMin, inMax, outMin, outMax) {
    if (inMin === inMax) return outMin;
    return outMin + (v - inMin) / (inMax - inMin) * (outMax - outMin);
  }

  // ── Coordinate conversion ─────────────────────────────────────

  /**
   * Convert a single MediaPipe normalized landmark to UE world-space (cm).
   *
   * Mapping rationale:
   *   - MP z (depth, negative closer) → UE X (forward)
   *     We negate z so that "closer to camera" = larger X (in front of character).
   *   - MP x (0–1 left→right) → UE Y (right), centered around 0
   *   - MP y (0–1 top→bottom) → UE Z (up), flipped so y=0 is top = high Z
   *
   * Scale factor 200 maps the full 0–1 range to ±100 cm (1 m span).
   *
   * @param {number} x  MediaPipe normalized x (0–1)
   * @param {number} y  MediaPipe normalized y (0–1)
   * @param {number} z  MediaPipe normalized z (depth, ~−0.5 to 0.5)
   * @returns {{ X: number, Y: number, Z: number }}  UE centimetres
   */
  function mpToUE(x, y, z) {
    return {
      X: -z * 100,
      Y: -(x - 0.5) * 200,
      Z: -(y - 0.5) * 200,
    };
  }

  // ── 3-D vector primitives ─────────────────────────────────────

  /** Create a vector object. */
  function vec3(x, y, z) { return { x, y, z }; }

  /** a − b */
  function vec3sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }

  /** a + b */
  function vec3add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; }

  /** scalar * v */
  function vec3scale(v, s) { return { x: v.x * s, y: v.y * s, z: v.z * s }; }

  /** Euclidean length. */
  function vec3len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }

  /**
   * Normalize v to unit length.
   * Returns the zero vector if v is degenerate.
   */
  function vec3normalize(v) {
    const len = vec3len(v);
    if (len < 1e-10) return { x: 0, y: 0, z: 0 };
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }

  /** Dot product. */
  function vec3dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }

  /** Cross product a × b. */
  function vec3cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }

  // ── Angle calculation ─────────────────────────────────────────

  /**
   * Angle (radians) between two 3-D direction vectors.
   * @param {{ x,y,z }} a
   * @param {{ x,y,z }} b
   * @returns {number}  0 … π
   */
  function angleBetweenVec3(a, b) {
    const na = vec3normalize(a);
    const nb = vec3normalize(b);
    const d = clamp(vec3dot(na, nb), -1, 1);
    return Math.acos(d);
  }

  /**
   * Interior joint angle (degrees) at `joint` given root→joint→tip.
   * This is the angle between vectors (root→joint) and (tip→joint).
   *
   * @param {{ x,y,z }} root
   * @param {{ x,y,z }} joint
   * @param {{ x,y,z }} tip
   * @returns {number}  0–180 degrees
   */
  function jointAngleDeg(root, joint, tip) {
    const toRoot = vec3sub(root, joint);
    const toTip  = vec3sub(tip,  joint);
    const radians = angleBetweenVec3(toRoot, toTip);
    return radians * (180 / Math.PI);
  }

  // ── Smoothing ─────────────────────────────────────────────────

  /**
   * Exponential moving average for a 3-D landmark.
   * alpha=0 → output = prev (no update)
   * alpha=1 → output = curr (no smoothing)
   *
   * @param {{ x,y,z }} curr   new raw sample
   * @param {{ x,y,z }} prev   previous smoothed value
   * @param {number}    alpha  blend weight 0–1
   * @returns {{ x,y,z }}
   */
  function ema3(curr, prev, alpha) {
    const a = clamp(alpha, 0, 1);
    return {
      x: prev.x + a * (curr.x - prev.x),
      y: prev.y + a * (curr.y - prev.y),
      z: prev.z + a * (curr.z - prev.z),
    };
  }

  // ── MediaPipe landmark index constants ────────────────────────
  // Subset used by gesture detection (33-point BlazePose model)
  const LM = {
    NOSE:           0,
    LEFT_EYE:       2,  RIGHT_EYE:       5,
    LEFT_EAR:       7,  RIGHT_EAR:       8,
    MOUTH_LEFT:     9,  MOUTH_RIGHT:     10,
    LEFT_SHOULDER:  11, RIGHT_SHOULDER:  12,
    LEFT_ELBOW:     13, RIGHT_ELBOW:     14,
    LEFT_WRIST:     15, RIGHT_WRIST:     16,
    LEFT_PINKY:     17, RIGHT_PINKY:     18,
    LEFT_INDEX:     19, RIGHT_INDEX:     20,
    LEFT_THUMB:     21, RIGHT_THUMB:     22,
    LEFT_HIP:       23, RIGHT_HIP:       24,
    LEFT_KNEE:      25, RIGHT_KNEE:      26,
    LEFT_ANKLE:     27, RIGHT_ANKLE:     28,
    LEFT_HEEL:      29, RIGHT_HEEL:      30,
    LEFT_FOOT_INDEX:31, RIGHT_FOOT_INDEX:32,
  };

  // ── Gesture detectors ─────────────────────────────────────────
  // All functions accept `lm`, an array of 33 landmark objects { x, y, z }
  // using MediaPipe normalized coordinates (0–1 for x and y).
  // Lower y = higher on screen.

  /**
   * ATTACK — right wrist raised above the right shoulder.
   * In MediaPipe y-down space: wrist.y < shoulder.y means wrist is higher.
   * Threshold (default 0.05) adds a small dead-band to avoid false positives.
   *
   * @param {Array<{x,y,z}>} lm
   * @param {number} [threshold=0.05]
   * @returns {boolean}
   */
  function detectAttack(lm, threshold) {
    if (!lm || lm.length < 33) return false;
    const th = threshold != null ? threshold : 0.05;
    const rWrist   = lm[LM.RIGHT_WRIST];
    const rShoulder = lm[LM.RIGHT_SHOULDER];
    return (rShoulder.y - rWrist.y) > th;
  }

  /**
   * GUARD — both wrists are near chin/mouth height.
   * Chin approximated as midpoint between mouth and nose.
   * Both wrists must be within `band` (default 0.08) of chin y.
   *
   * @param {Array<{x,y,z}>} lm
   * @param {number} [band=0.08]
   * @returns {boolean}
   */
  function detectGuard(lm, band) {
    if (!lm || lm.length < 33) return false;
    const b = band != null ? band : 0.08;
    const chinY  = (lm[LM.NOSE].y + lm[LM.MOUTH_LEFT].y) / 2;
    const lWrist = lm[LM.LEFT_WRIST];
    const rWrist = lm[LM.RIGHT_WRIST];
    return Math.abs(lWrist.y - chinY) < b && Math.abs(rWrist.y - chinY) < b;
  }

  /**
   * DODGE — torso is leaning noticeably left or right.
   * Computed as the horizontal offset of the shoulder midpoint from 0.5 (center).
   * threshold default 0.08 (≈8 % of frame width).
   *
   * @param {Array<{x,y,z}>} lm
   * @param {number} [threshold=0.08]
   * @returns {boolean}
   */
  function detectDodge(lm, threshold) {
    if (!lm || lm.length < 33) return false;
    const th = threshold != null ? threshold : 0.08;
    const midX = (lm[LM.LEFT_SHOULDER].x + lm[LM.RIGHT_SHOULDER].x) / 2;
    return Math.abs(midX - 0.5) > th;
  }

  /**
   * CROUCH — the shoulder-to-hip vertical distance is compressed.
   * normalRatio is calibrated as shoulder_span / torso_height for a standing pose.
   * When crouching, shoulders descend toward hips; ratio drops below threshold.
   *
   * Uses shoulder width as a scale-invariant reference length.
   * ratio = torso_height / shoulder_width  (should be ~1.2 when standing)
   * threshold default 0.85 detects a meaningful squat.
   *
   * @param {Array<{x,y,z}>} lm
   * @param {number} [threshold=0.85]
   * @returns {boolean}
   */
  function detectCrouch(lm, threshold) {
    if (!lm || lm.length < 33) return false;
    const th = threshold != null ? threshold : 0.85;
    const lShoulder = lm[LM.LEFT_SHOULDER];
    const rShoulder = lm[LM.RIGHT_SHOULDER];
    const lHip      = lm[LM.LEFT_HIP];
    const rHip      = lm[LM.RIGHT_HIP];

    const shoulderWidth  = Math.abs(lShoulder.x - rShoulder.x);
    const hipMidY        = (lHip.y + rHip.y) / 2;
    const shoulderMidY   = (lShoulder.y + rShoulder.y) / 2;
    const torsoHeight    = hipMidY - shoulderMidY; // positive when shoulders above hips

    if (shoulderWidth < 1e-4) return false;
    const ratio = torsoHeight / shoulderWidth;
    return ratio < th;
  }

  // ── Bone rotation helpers ─────────────────────────────────────

  /**
   * Convert a 3-D direction vector to a UE FRotator (pitch, yaw, roll in degrees).
   *
   * UE convention (Z-up, X-forward):
   *   Pitch = elevation angle from the XY plane  (-90 = straight up,  +90 = straight down)
   *   Yaw   = azimuth angle in the XY plane      (0 = +X forward,    90 = +Y right)
   *   Roll  = spin around the forward axis        (not derivable from a single direction)
   *
   * Usage: given two consecutive landmarks in UE space, call
   *   directionToRotator(vec3sub(childUE, parentUE))
   * and pass the result to SetBoneRotationByName to align the bone along that limb.
   *
   * @param {{ x,y,z }} dir  direction vector (need not be unit length)
   * @returns {{ pitch:number, yaw:number, roll:number }}  degrees
   */
  function directionToRotator(dir) {
    const n = vec3normalize(dir);
    // If dir was degenerate (zero vector), normalize returns {0,0,0}; asin(0)=0, atan2(0,0)=0 — safe.
    const pitch = -Math.asin(clamp(n.z, -1, 1)) * (180 / Math.PI);
    const yaw   =  Math.atan2(n.y, n.x)         * (180 / Math.PI);
    return { pitch, yaw, roll: 0 };
  }

  // ── Euler rotation ────────────────────────────────────────────

  /**
   * Rotate a 3-D vector by intrinsic ZXY Euler angles (Roll → Pitch → Yaw).
   *
   * Applied in order:
   *   1. Roll  — Rz(rollDeg)   — spin around Z-axis
   *   2. Pitch — Rx(pitchDeg)  — nod around X-axis
   *   3. Yaw   — Ry(yawDeg)    — turn around Y-axis
   *
   * Equivalent to the matrix product: Ry(yaw) · Rx(pitch) · Rz(roll) · v
   *
   * Use this for Absolute Rotation FK: given a bone's T-pose direction,
   * call rotateVec3ByEuler(tposeDir, pitch, yaw, roll) to get the new
   * bone direction for any desired rotation, independent of previous state.
   *
   * @param {{ x,y,z }} v        direction vector (need not be unit length)
   * @param {number}    pitchDeg rotation around X-axis (degrees)
   * @param {number}    yawDeg   rotation around Y-axis (degrees)
   * @param {number}    rollDeg  rotation around Z-axis (degrees)
   * @returns {{ x,y,z }}
   */
  function rotateVec3ByEuler(v, pitchDeg, yawDeg, rollDeg) {
    const D2R = Math.PI / 180;
    const cp = Math.cos(pitchDeg * D2R), sp = Math.sin(pitchDeg * D2R);
    const cy = Math.cos(yawDeg  * D2R), sy = Math.sin(yawDeg  * D2R);
    const cr = Math.cos(rollDeg * D2R), sr = Math.sin(rollDeg * D2R);

    // Step 1: Roll — Rz(roll)
    const x1 = cr * v.x - sr * v.y;
    const y1 = sr * v.x + cr * v.y;
    const z1 = v.z;

    // Step 2: Pitch — Rx(pitch)
    const x2 = x1;
    const y2 = cp * y1 - sp * z1;
    const z2 = sp * y1 + cp * z1;

    // Step 3: Yaw — Ry(yaw)
    const x3 =  cy * x2 + sy * z2;
    const y3 = y2;
    const z3 = -sy * x2 + cy * z2;

    return { x: x3, y: y3, z: z3 };
  }

  // ── Public API ────────────────────────────────────────────────

  const api = {
    // scalar
    clamp,
    mapRange,
    // coordinate conversion
    mpToUE,
    // vector math
    vec3,
    vec3sub,
    vec3add,
    vec3scale,
    vec3len,
    vec3normalize,
    vec3dot,
    vec3cross,
    // angles
    angleBetweenVec3,
    jointAngleDeg,
    // smoothing
    ema3,
    // bone rotation
    directionToRotator,
    rotateVec3ByEuler,
    // gesture detectors
    detectAttack,
    detectGuard,
    detectDodge,
    detectCrouch,
    // landmark index map (useful for consumers)
    LM,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  }
  root.MpUE = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
