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

  // ── Direction smoothing helpers ───────────────────────────────────────────

  /**
   * Limit how much a direction vector can rotate between frames.
   *
   * Slerps `prev` toward `next` by at most `maxDeg` degrees.
   * If the angle between them is already within the limit, `next` is returned
   * unchanged.  This caps angular velocity so a single mis-detected frame
   * cannot snap the sword to a completely different orientation.
   *
   * Both vectors must be unit length (or will be normalised internally).
   *
   * @param {{ x,y,z }} next    target direction this frame
   * @param {{ x,y,z }} prev    smoothed direction from previous frame
   * @param {number}    maxDeg  maximum allowed rotation per call (degrees)
   * @returns {{ x,y,z }}  normalised direction
   */
  function clampAngularStep(next, prev, maxDeg) {
    const n = vec3normalize(next);
    const p = vec3normalize(prev);
    const dot   = clamp(vec3dot(p, n), -1, 1);
    const angle = Math.acos(dot);                 // radians, 0…π
    const limit = maxDeg * (Math.PI / 180);
    if (angle <= limit) return n;                 // already within budget
    const t = limit / angle;                      // fraction of full rotation
    return vec3normalize({
      x: p.x + t * (n.x - p.x),
      y: p.y + t * (n.y - p.y),
      z: p.z + t * (n.z - p.z),
    });
  }

  // ── Hand landmark geometry (grip + weapon direction + wrist roll) ────────

  /**
   * Grip detection from 21 image-normalised hand landmarks.
   * Uses only wrist (lm[0]) and MCP knuckles (lm[5,9,13,17]).
   * Finger tips are NOT needed — robust when a weapon occludes curled fingers.
   *
   * Principle: when fingers curl into a fist the MCP knuckle centre moves
   * closer to the wrist relative to the index-MCP-to-wrist distance.
   *
   * @param {Array<{x,y}>} lm  21 MediaPipe Hand image-normalised landmarks
   * @returns {boolean}  true when hand appears to be gripping
   */
  function computeMcpGrip(lm) {
    if (!lm || lm.length < 18) return false;
    const wr    = lm[0];
    const mcpCx = (lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 4;
    const mcpCy = (lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 4;
    const mcpDist   = Math.hypot(mcpCx - wr.x, mcpCy - wr.y);
    const indexDist = Math.hypot(lm[5].x - wr.x, lm[5].y - wr.y);
    if (indexDist < 1e-6) return false;
    return mcpDist < indexDist * 0.95;
  }

  /**
   * Compute weapon direction and palm normal from 21 world-space hand landmarks.
   * Uses only wrist (lm[0]) and MCP knuckles (lm[5,9,13,17]).
   *
   * Geometry (all in the same world-space frame as the input landmarks):
   *   kvec   = index_MCP(lm[5]) → pinky_MCP(lm[17])   across knuckles, ⊥ weapon shaft
   *   mcpW   = wrist(lm[0]) → knuckle_centre            roughly along weapon shaft
   *   pn     = cross(mcpW, kvec)                        palm normal (out of palm face)
   *   shaft  = cross(kvec, pn)                          weapon shaft direction
   *
   * @param {Array<{x,y,z}>} lm  21 MediaPipe Hand world-space landmarks (metres)
   * @returns {{ weaponDir: {x,y,z}, palmNormal: {x,y,z} } | null}
   *   weaponDir   unit vector pointing from wrist toward weapon tip
   *   palmNormal  unit vector pointing out of the palm face
   *   Returns null if landmarks are missing or geometry is degenerate.
   */
  function computeMcpWeaponDir(lm) {
    if (!lm || lm.length < 18) return null;
    const kvec = vec3sub(lm[5], lm[17]);  // index MCP → pinky MCP (across knuckles)
    const mcpCenter = {
      x: (lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 4,
      y: (lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 4,
      z: (lm[5].z + lm[9].z + lm[13].z + lm[17].z) / 4,
    };
    const mcpW      = vec3sub(mcpCenter, lm[0]);  // wrist → knuckle centre
    const pn        = vec3cross(mcpW, kvec);       // palm normal
    const shaft     = vec3cross(kvec, pn);          // weapon shaft
    const palmNormal = vec3normalize(pn);
    const weaponDir  = vec3normalize(shaft);
    if (isNaN(weaponDir.x) || isNaN(palmNormal.x)) return null;
    return { weaponDir, palmNormal };
  }

  /**
   * Compute wrist roll angle in degrees from palm normal and forearm direction.
   *
   * Roll = 0   when palm faces world-up   (projected ⊥ to forearm).
   * Roll = +90 when palm faces world-right.
   * Roll = ±180 when palm faces world-down.
   *
   * @param {{ x,y,z }} palmNormal  palm normal vector (points out of palm face; need not be unit)
   * @param {{ x,y,z }} forearmDir  direction from elbow to wrist (need not be unit)
   * @returns {number}  roll angle in degrees (−180 … 180), or NaN if inputs are degenerate
   */
  /**
   * Weapon direction from any two hand landmarks.
   * Both points should be on the back of the hand so they stay visible
   * when the fingers are curled around a weapon handle.
   *
   * Common pairs (MediaPipe Hand landmark indices):
   *   fromIdx=5,  toIdx=17  index_MCP → pinky_MCP   (across knuckles)
   *   fromIdx=0,  toIdx=9   wrist     → middle_MCP   (hand axis)
   *
   * @param {Array<{x,y,z}>} lm        21 MediaPipe Hand world-space landmarks (metres)
   * @param {number} [toIdx=9]         target landmark index
   * @param {number} [fromIdx=0]       source landmark index (default: wrist)
   * @returns {{ x,y,z } | null}  normalised direction vector, or null if degenerate
   */
  function computeWeaponDirTwoPoint(lm, toIdx, fromIdx) {
    const from = (fromIdx != null) ? fromIdx : 0;
    const to   = (toIdx   != null) ? toIdx   : 9;
    if (!lm || lm.length <= Math.max(from, to)) return null;
    const dir = vec3normalize({
      x: lm[to].x - lm[from].x,
      y: lm[to].y - lm[from].y,
      z: lm[to].z - lm[from].z,
    });
    return isNaN(dir.x) ? null : dir;
  }

  function computeWristRollAngleDeg(palmNormal, forearmDir) {
    const fa = vec3normalize(forearmDir);
    if (isNaN(fa.x)) return NaN;

    // Project palm normal perpendicular to the forearm axis
    const dot  = vec3dot(palmNormal, fa);
    const perp = vec3normalize({
      x: palmNormal.x - dot * fa.x,
      y: palmNormal.y - dot * fa.y,
      z: palmNormal.z - dot * fa.z,
    });
    if (isNaN(perp.x)) return NaN;  // palm normal is parallel to forearm — degenerate

    // Reference vector: world-up (0,1,0) projected off the forearm
    const up    = { x: 0, y: 1, z: 0 };
    const upDot = vec3dot(up, fa);
    const upRef = vec3normalize({
      x: up.x - upDot * fa.x,
      y: up.y - upDot * fa.y,
      z: up.z - upDot * fa.z,
    });
    if (isNaN(upRef.x)) return NaN;  // forearm is vertical — upRef is degenerate

    // Second tangent: forearm × upRef (completes the perpendicular frame)
    const tang = vec3cross(fa, upRef);

    const cosA = vec3dot(perp, upRef);
    const sinA = vec3dot(perp, tang);
    return Math.atan2(sinA, cosA) * (180 / Math.PI);
  }

  // ── Pose-based combat-action helpers ─────────────────────────

  /**
   * detectBlockPose(lm) → boolean
   *
   * Returns true when both wrists are held in front of the chest:
   *   • wrist y  >  (shoulder y − 0.04)  — not raised above shoulders
   *   • wrist y  <  hip y                — not dropped below hips
   *   • |wrist x − shoulder-centre x|   < shoulder-width  — not extended sideways
   *
   * All coordinates are MediaPipe normalised image-space (y increases downward).
   * Landmarks used: 11 L-shoulder, 12 R-shoulder, 15 L-wrist, 16 R-wrist, 23 L-hip, 24 R-hip.
   */
  function detectBlockPose(lm) {
    if (!lm || lm.length < 25) return false;
    const lWr = lm[15], rWr = lm[16];
    const lSh = lm[11], rSh = lm[12];
    const lHp = lm[23], rHp = lm[24];
    if (!lWr || !rWr || !lSh || !rSh || !lHp || !rHp) return false;

    const shoulderY = (lSh.y + rSh.y) * 0.5;
    const hipY      = (lHp.y + rHp.y) * 0.5;
    const centerX   = (lSh.x + rSh.x) * 0.5;
    const shW       = Math.abs(lSh.x - rSh.x);

    const inChest = p =>
      p.y > shoulderY - 0.04 && p.y < hipY &&
      Math.abs(p.x - centerX) < shW * 1.1;

    return inChest(lWr) && inChest(rWr);
  }

  /**
   * computeSwingVector(hist) → {dx, dy, speed} | null
   *
   * Given a ring-buffer `hist` of {x, y} right-wrist positions (MediaPipe normalised,
   * most-recent last), compares the first quarter against the last quarter to estimate
   * a displacement vector.
   *
   * Returns null when hist is too short (< 8 entries).
   * The returned dx/dy are in **display space** (mirrored: display_x = 1 − mp.x),
   * so dx > 0 means the wrist is moving toward display-right.
   */
  function computeSwingVector(hist) {
    if (!hist || hist.length < 8) return null;

    const q   = Math.max(1, Math.floor(hist.length / 4));
    const avg = (arr, k) => arr.reduce((s, p) => s + p[k], 0) / arr.length;

    const oldPts = hist.slice(0, q);
    const newPts = hist.slice(-q);

    const mp_dx = avg(newPts, 'x') - avg(oldPts, 'x');
    const mp_dy = avg(newPts, 'y') - avg(oldPts, 'y');

    // Convert MP dx to display dx (mirrored display)
    const dx    = -mp_dx;
    const dy    = mp_dy;
    const speed = Math.hypot(dx, dy);

    return { dx, dy, speed };
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
    // direction smoothing
    clampAngularStep,
    // hand geometry (grip / weapon direction / wrist roll)
    computeMcpGrip,
    computeMcpWeaponDir,
    computeWeaponDirTwoPoint,
    computeWristRollAngleDeg,
    // pose-only combat-action predicates
    detectBlockPose,
    computeSwingVector,
    // landmark index map (useful for consumers)
    LM,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  }
  root.MpUE = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
