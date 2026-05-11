/**
 * boxing.js
 * Boxing gesture detectors for a MediaPipe Pose demo.
 * Pure math — no DOM, no MediaPipe dependency.
 *
 * Works as a browser <script> (attaches BoxingDetector to globalThis)
 * and as a CommonJS require() target for Node tests.
 *
 * All functions accept `lm`, an array of 33 landmark objects {x, y, z}
 * using MediaPipe normalised image-space coordinates:
 *   x : 0 (left) → 1 (right)
 *   y : 0 (top)  → 1 (bottom)   lower y = higher on screen
 */
(function (root) {
  'use strict';

  /** Minimum wrist-trail speed to classify as a punch (normalised units / frame). */
  const PUNCH_SPEED = 0.12;

  /** Minimum ankle-trail speed to classify as a kick. */
  const KICK_SPEED = 0.10;

  /** Maximum entries kept in each per-limb ring buffer. */
  const HIST_MAX = 24;

  // ── Landmark indices (boxing-relevant subset) ────────────────────────────
  const B = {
    NOSE:        0,
    MOUTH_LEFT:  9,
    L_SHOULDER: 11, R_SHOULDER: 12,
    L_ELBOW:    13, R_ELBOW:    14,
    L_WRIST:    15, R_WRIST:    16,
    L_HIP:      23, R_HIP:      24,
    L_KNEE:     25, R_KNEE:     26,
    L_ANKLE:    27, R_ANKLE:    28,
  };

  // ── Static pose detectors ────────────────────────────────────────────────

  /**
   * GUARD — both wrists are held near chin height (boxing high-guard).
   * Chin approximated as midpoint between nose (lm[0]) and mouth-left (lm[9]).
   *
   * @param {Array<{x,y,z}>} lm
   * @param {number} [band=0.10]
   * @returns {boolean}
   */
  function detectBoxerGuard(lm, band) {
    if (!lm || lm.length < 17) return false;
    const b     = band != null ? band : 0.10;
    const chinY = (lm[B.NOSE].y + lm[B.MOUTH_LEFT].y) / 2;
    const lW    = lm[B.L_WRIST];
    const rW    = lm[B.R_WRIST];
    return Math.abs(lW.y - chinY) < b && Math.abs(rW.y - chinY) < b;
  }

  /**
   * BLOCK — both wrists are in the chest zone:
   *   • below shoulder level  (not raised above shoulders)
   *   • above hip level       (not dropped below hips)
   *   • within 1.2× shoulder-width of body centre
   *
   * @param {Array<{x,y,z}>} lm
   * @returns {boolean}
   */
  function detectBoxerBlock(lm) {
    if (!lm || lm.length < 25) return false;
    const lWr = lm[B.L_WRIST], rWr = lm[B.R_WRIST];
    const lSh = lm[B.L_SHOULDER], rSh = lm[B.R_SHOULDER];
    const lHp = lm[B.L_HIP],      rHp = lm[B.R_HIP];
    if (!lWr || !rWr || !lSh || !rSh || !lHp || !rHp) return false;

    const shoulderY = (lSh.y + rSh.y) * 0.5;
    const hipY      = (lHp.y + rHp.y) * 0.5;
    const centerX   = (lSh.x + rSh.x) * 0.5;
    const shW       = Math.abs(lSh.x - rSh.x);

    const inChest = p =>
      p.y > shoulderY - 0.04 && p.y < hipY &&
      Math.abs(p.x - centerX) < shW * 1.2;

    return inChest(lWr) && inChest(rWr);
  }

  /**
   * DODGE — torso is leaning noticeably left or right.
   * Measured as horizontal offset of the shoulder midpoint from frame centre (0.5).
   *
   * @param {Array<{x,y,z}>} lm
   * @param {number} [threshold=0.08]
   * @returns {boolean}
   */
  function detectBoxerDodge(lm, threshold) {
    if (!lm || lm.length < 13) return false;
    const th   = threshold != null ? threshold : 0.08;
    const midX = (lm[B.L_SHOULDER].x + lm[B.R_SHOULDER].x) / 2;
    return Math.abs(midX - 0.5) > th;
  }

  /**
   * CROUCH — torso height is compressed relative to shoulder width.
   * ratio = torso_height / shoulder_width; standing ≈ 0.90, crouching < threshold.
   *
   * @param {Array<{x,y,z}>} lm
   * @param {number} [threshold=0.85]
   * @returns {boolean}
   */
  function detectBoxerCrouch(lm, threshold) {
    if (!lm || lm.length < 25) return false;
    const th  = threshold != null ? threshold : 0.85;
    const lSh = lm[B.L_SHOULDER], rSh = lm[B.R_SHOULDER];
    const lHp = lm[B.L_HIP],      rHp = lm[B.R_HIP];

    const sw     = Math.abs(lSh.x - rSh.x);
    const torsoH = ((lHp.y + rHp.y) / 2) - ((lSh.y + rSh.y) / 2);
    if (sw < 1e-4) return false;
    return torsoH / sw < th;
  }

  // ── Dynamic action classifiers ───────────────────────────────────────────

  /**
   * Classify punch type from a swing vector (e.g. from computeSwingVector in MpUE).
   *
   * Classification rules (display space: dx > 0 = right, dy < 0 = up):
   *   uppercut  dy < -0.04  AND  (-dy)/speed > 0.40   — dominant upward motion
   *   hook      |dx|/speed  > 0.65                    — dominant horizontal swing
   *   jab       anything else above PUNCH_SPEED        — straight forward punch
   *
   * @param {{ dx: number, dy: number, speed: number } | null} swing
   * @returns {'hook' | 'uppercut' | 'jab' | null}
   */
  function classifyPunchType(swing) {
    if (!swing || swing.speed <= PUNCH_SPEED) return null;
    const { dx, dy, speed } = swing;
    if (dy < -0.04 && (-dy) / speed > 0.40) return 'uppercut';
    if (Math.abs(dx) / speed > 0.65) return 'hook';
    return 'jab';
  }

  /**
   * Returns true if an ankle swing vector is fast enough to indicate a kick.
   *
   * @param {{ speed: number } | null} swing
   * @returns {boolean}
   */
  function detectKick(swing) {
    return swing != null && swing.speed > KICK_SPEED;
  }

  /**
   * Combined boxing action classifier.
   *
   * Priority: kick > punch > guard > block > dodge > crouch > idle
   *
   * @param {Array<{x,y,z}>}            lm      33 pose landmarks (MP normalised)
   * @param {{ dx,dy,speed }|null}      swingLW  left-wrist  swing (from ring buffer)
   * @param {{ dx,dy,speed }|null}      swingRW  right-wrist swing
   * @param {{ dx,dy,speed }|null}      swingLA  left-ankle  swing
   * @param {{ dx,dy,speed }|null}      swingRA  right-ankle swing
   * @returns {{ action: string, limb: string }}
   */
  function classifyBoxingAction(lm, swingLW, swingRW, swingLA, swingRA) {
    // Kicks first
    const lKick = detectKick(swingLA);
    const rKick = detectKick(swingRA);
    if (lKick || rKick) {
      let side;
      if (lKick && rKick) {
        side = (swingLA.speed >= swingRA.speed) ? 'left' : 'right';
      } else {
        side = lKick ? 'left' : 'right';
      }
      return { action: 'kick', limb: side };
    }

    // Punches
    const lPunch = classifyPunchType(swingLW);
    const rPunch = classifyPunchType(swingRW);
    if (lPunch || rPunch) {
      if (lPunch && rPunch) {
        const side = (swingLW.speed >= swingRW.speed) ? 'left' : 'right';
        return { action: side === 'left' ? lPunch : rPunch, limb: side };
      }
      if (rPunch) return { action: rPunch, limb: 'right' };
      return { action: lPunch, limb: 'left' };
    }

    // Static poses
    if (detectBoxerGuard(lm))  return { action: 'guard',  limb: 'both' };
    if (detectBoxerBlock(lm))  return { action: 'block',  limb: 'both' };
    if (detectBoxerDodge(lm))  return { action: 'dodge',  limb: 'body' };
    if (detectBoxerCrouch(lm)) return { action: 'crouch', limb: 'body' };

    return { action: 'idle', limb: 'none' };
  }

  // ── Public API ───────────────────────────────────────────────────────────
  const api = {
    PUNCH_SPEED,
    KICK_SPEED,
    HIST_MAX,
    B,
    detectBoxerGuard,
    detectBoxerBlock,
    detectBoxerDodge,
    detectBoxerCrouch,
    classifyPunchType,
    detectKick,
    classifyBoxingAction,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  }
  root.BoxingDetector = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
