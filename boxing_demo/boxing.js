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

  /** Wrist swing speed at or below this counts as wind-up frames toward a charge punch. */
  const CHARGE_WINDUP_MAX_SPEED = 0.055;

  /** Minimum consecutive low-speed frames on a limb before a punch counts as charged. */
  const CHARGE_WINDUP_MIN_FRAMES = 10;

  /** Limb must retreat this far behind the plane before it can trigger stamina again. */
  const STAMINA_REARM_MARGIN = 0.02;

  /** Frames averaged when capturing standing depth baseline. */
  const DEPTH_BASELINE_FRAMES = 12;

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
   * Directional dodge for the simplified defensive game loop.
   *
   * MediaPipe's x is raw camera space, while the demo is displayed as a
   * mirrored selfie view. Therefore raw x > centre means the player appears to
   * jump left in the UI, and raw x < centre means the player appears right.
   *
   * Back dodge uses shoulder-width shrinkage as a webcam-friendly proxy for
   * stepping away from the camera.
   *
   * @param {Array<{x,y,z}>} lm
   * @param {{
   *   sideThreshold?: number,
   *   refShW?: number,
   *   backShrinkRatio?: number,
   *   shoulderWidthHist?: number[],
   * }} [opts]
   * @returns {'dodge_left' | 'dodge_right' | 'dodge_back' | null}
   */
  function detectDirectionalDodge(lm, opts) {
    if (!lm || lm.length < 25) return null;
    const sideThreshold = opts && opts.sideThreshold != null ? opts.sideThreshold : 0.08;
    const backShrinkRatio = opts && opts.backShrinkRatio != null ? opts.backShrinkRatio : 0.88;
    const refShW = opts && opts.refShW;
    const shWHist = opts && opts.shoulderWidthHist;

    const lSh = lm[B.L_SHOULDER], rSh = lm[B.R_SHOULDER];
    if (!lSh || !rSh) return null;

    const midX = (lSh.x + rSh.x) * 0.5;
    const shW = Math.abs(lSh.x - rSh.x);

    if (midX > 0.5 + sideThreshold) return 'dodge_left';
    if (midX < 0.5 - sideThreshold) return 'dodge_right';

    if (refShW > 1e-4 && shW < refShW * backShrinkRatio) {
      const recentMax = shWHist && shWHist.length
        ? Math.max.apply(null, shWHist)
        : shW;
      if (recentMax >= refShW * 0.92 && recentMax > shW * 1.03) return 'dodge_back';
    }
    return null;
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
   * Advance per-limb punch wind-up counters (for charge punch).
   * Call on frames where no punch/kick spike is firing.
   *
   * @param {{ l: number, r: number }} windup — mutated in place
   * @param {{ dx: number, dy: number, speed: number } | null} swingLW
   * @param {{ dx: number, dy: number, speed: number } | null} swingRW
   */
  function tickPunchWindup(windup, swingLW, swingRW) {
    if (!windup) return;
    if (swingLW && swingLW.speed <= CHARGE_WINDUP_MAX_SPEED) {
      windup.l = Math.min(999, windup.l + 1);
    } else {
      windup.l = 0;
    }
    if (swingRW && swingRW.speed <= CHARGE_WINDUP_MAX_SPEED) {
      windup.r = Math.min(999, windup.r + 1);
    } else {
      windup.r = 0;
    }
  }

  /**
   * Forward depth when apparent size grows (e.g. shoulder width when stepping closer).
   * Positive = toward camera.
   */
  function forwardDepthFromRatio(apparent, reference, scale) {
    const s = scale != null ? scale : 0.9;
    if (!(reference > 1e-4)) return 0;
    return (apparent / reference - 1) * s;
  }

  /**
   * Forward depth when a limb segment foreshortens (shorter 2D length = more forward).
   */
  function forwardDepthFromForeshortening(apparent, reference, scale) {
    const s = scale != null ? scale : 0.9;
    if (!(apparent > 1e-4)) return 0;
    return (reference / apparent - 1) * s;
  }

  /** Hip-relative stamina plane Z (same units as computeForwardDepths). */
  function getForwardPlaneZ(baseDepth, planeOffset) {
    if (baseDepth == null || planeOffset == null) return null;
    return baseDepth + planeOffset;
  }

  /**
   * @deprecated Use forwardDepthFromForeshortening for limbs.
   */
  function segmentForwardDepth(apparent, reference, scale) {
    return forwardDepthFromForeshortening(apparent, reference, scale);
  }

  /**
   * Forward depth (metres-ish) for body and four limb chains from normalised landmarks.
   *
   * @param {Array<{x,y,z}>} lm
   * @param {{ shW:number, lArm:number, rArm:number, lLeg:number, rLeg:number }} refs
   * @returns {{ body:number, lw:number, rw:number, la:number, ra:number } | null}
   */
  function computeForwardDepths(lm, refs) {
    if (!lm || lm.length < 29 || !refs) return null;
    const lSh = lm[B.L_SHOULDER], rSh = lm[B.R_SHOULDER];
    const lHp = lm[B.L_HIP], rHp = lm[B.R_HIP];
    if (!lSh || !rSh || !lHp || !rHp) return null;
    const shW = Math.abs(lSh.x - rSh.x);
    return {
      body: forwardDepthFromRatio(shW, refs.shW),
      lw:   forwardDepthFromForeshortening(dist2(lSh, lm[B.L_WRIST]), refs.lArm),
      rw:   forwardDepthFromForeshortening(dist2(rSh, lm[B.R_WRIST]), refs.rArm),
      la:   forwardDepthFromForeshortening(dist2(lHp, lm[B.L_ANKLE]), refs.lLeg),
      ra:   forwardDepthFromForeshortening(dist2(rHp, lm[B.R_ANKLE]), refs.rLeg),
    };
  }

  /**
   * Forward depth from 3D body-space positions (metres, hip-relative Z).
   * Matches the 3D skeleton and stamina plane in world space.
   *
   * @param {Record<number,{x:number,y:number,z:number}>} bodyPos
   */
  function computeBodySpaceDepths(bodyPos) {
    if (!bodyPos) return null;
    const lHp = bodyPos[B.L_HIP], rHp = bodyPos[B.R_HIP];
    const lSh = bodyPos[B.L_SHOULDER], rSh = bodyPos[B.R_SHOULDER];
    if (!lHp || !rHp || !lSh || !rSh) return null;
    const hipZ = (lHp.z + rHp.z) * 0.5;
    const shMidZ = (lSh.z + rSh.z) * 0.5;
    const lW = bodyPos[B.L_WRIST], rW = bodyPos[B.R_WRIST];
    const lA = bodyPos[B.L_ANKLE], rA = bodyPos[B.R_ANKLE];
    return {
      body: shMidZ - hipZ,
      lw:   lW ? lW.z - hipZ : shMidZ - hipZ,
      rw:   rW ? rW.z - hipZ : shMidZ - hipZ,
      la:   lA ? lA.z - hipZ : 0,
      ra:   rA ? rA.z - hipZ : 0,
    };
  }

  /**
   * @param {{ body,lw,rw,la,ra:number}} depths
   * @param {{ body,lw,rw,la,ra:number}} baseline
   */
  function subtractForwardDepths(depths, baseline) {
    if (!depths || !baseline) return depths;
    return {
      body: depths.body - baseline.body,
      lw:   depths.lw - baseline.lw,
      rw:   depths.rw - baseline.rw,
      la:   depths.la - baseline.la,
      ra:   depths.ra - baseline.ra,
    };
  }

  /**
   * @param {Array<{ body,lw,rw,la,ra:number}>} samples
   */
  function averageForwardDepths(samples) {
    if (!samples || !samples.length) return null;
    const n = samples.length;
    const sum = { body: 0, lw: 0, rw: 0, la: 0, ra: 0 };
    samples.forEach(d => {
      sum.body += d.body;
      sum.lw += d.lw;
      sum.rw += d.rw;
      sum.la += d.la;
      sum.ra += d.ra;
    });
    return {
      body: sum.body / n,
      lw:   sum.lw / n,
      rw:   sum.rw / n,
      la:   sum.la / n,
      ra:   sum.ra / n,
    };
  }

  /**
   * Collect samples for {@link DEPTH_BASELINE_FRAMES} then return the mean standing pose.
   *
   * @param {Array<{ body,lw,rw,la,ra:number}>} samples in-out
   * @param {Record<number,{x,y,z}>} bodyPos
   * @returns {{ body,lw,rw,la,ra:number}|null} baseline when ready
   */
  function captureDepthBaseline(samples, bodyPos) {
    if (!samples || !bodyPos || samples.length >= DEPTH_BASELINE_FRAMES) return null;
    const d = computeBodySpaceDepths(bodyPos);
    if (!d) return null;
    samples.push(d);
    if (samples.length < DEPTH_BASELINE_FRAMES) return null;
    return averageForwardDepths(samples);
  }

  /**
   * Hip midpoint in body space (metres, after worldLmToBodyPos negate).
   *
   * @param {Record<number,{x:number,y:number,z:number}>} bodyPos
   * @returns {{ x:number, z:number }|null}
   */
  function computeHipMid(bodyPos) {
    if (!bodyPos) return null;
    const lHp = bodyPos[B.L_HIP], rHp = bodyPos[B.R_HIP];
    if (!lHp || !rHp) return null;
    return {
      x: (lHp.x + rHp.x) * 0.5,
      z: (lHp.z + rHp.z) * 0.5,
    };
  }

  /**
   * Collect hip-mid samples for {@link DEPTH_BASELINE_FRAMES} then return standing mean.
   *
   * @param {Array<{x:number,z:number}>} samples in-out
   * @param {Record<number,{x,y,z}>} bodyPos
   * @returns {{ hipX:number, hipZ:number }|null}
   */
  function captureCharBaseline(samples, bodyPos) {
    if (!samples || !bodyPos || samples.length >= DEPTH_BASELINE_FRAMES) return null;
    const mid = computeHipMid(bodyPos);
    if (!mid) return null;
    samples.push(mid);
    if (samples.length < DEPTH_BASELINE_FRAMES) return null;
    const n = samples.length;
    let sumX = 0;
    let sumZ = 0;
    samples.forEach(s => {
      sumX += s.x;
      sumZ += s.z;
    });
    return { hipX: sumX / n, hipZ: sumZ / n };
  }

  /**
   * Floor translation from body-space hips (same frame as 3D skeleton).
   *
   * @param {Record<number,{x,y,z}>} bodyPos
   * @param {{ hipX:number, hipZ:number }} baseline
   * @returns {{ x:number, y:number, z:number }|null}
   */
  function computeCharPositionFromBodyPos(bodyPos, baseline) {
    if (!bodyPos || !baseline) return null;
    const mid = computeHipMid(bodyPos);
    if (!mid) return null;
    return {
      x: mid.x - baseline.hipX,
      y: 0,
      z: mid.z - baseline.hipZ,
    };
  }

  /**
   * Capture standing reference lengths for forward-depth / plane crossing.
   *
   * @param {Array<{x,y,z}>} lm
   */
  function captureForwardRefs(lm) {
    if (!lm || lm.length < 29) return null;
    const lSh = lm[B.L_SHOULDER], rSh = lm[B.R_SHOULDER];
    const lHp = lm[B.L_HIP], rHp = lm[B.R_HIP];
    if (!lSh || !rSh || !lHp || !rHp) return null;
    const shW = Math.abs(lSh.x - rSh.x);
    if (shW < 1e-4) return null;
    return {
      shW,
      lArm: dist2(lSh, lm[B.L_WRIST]) || shW * 0.8,
      rArm: dist2(rSh, lm[B.R_WRIST]) || shW * 0.8,
      lLeg: dist2(lHp, lm[B.L_ANKLE]) || shW * 1.2,
      rLeg: dist2(rHp, lm[B.R_ANKLE]) || shW * 1.2,
    };
  }

  /**
   * True when forward depth crosses the plane from behind to in-front (one-shot edge).
   *
   * @param {number} prevZ depth previous frame
   * @param {number} currZ depth current frame
   * @param {number} planeZ threshold (same units as computeForwardDepths)
   */
  function detectForwardPlaneCross(prevZ, currZ, planeZ) {
    if (prevZ == null || currZ == null || planeZ == null) return false;
    return prevZ < planeZ && currZ >= planeZ;
  }

  /**
   * Limb crosses a plane anchored at body (hip) depth + offset, moving with the fighter.
   *
   * @param {number} prevCh limb depth previous frame
   * @param {number} currCh limb depth current frame
   * @param {number} prevBase body depth previous frame
   * @param {number} currBase body depth current frame
   * @param {number} planeOffset metres ahead of base (same units as computeForwardDepths)
   */
  function detectRelativePlaneCross(prevCh, currCh, prevBase, currBase, planeOffset) {
    if (
      prevCh == null || currCh == null ||
      prevBase == null || currBase == null || planeOffset == null
    ) {
      return false;
    }
    const planePrev = prevBase + planeOffset;
    const planeCurr = currBase + planeOffset;
    const planeLo = Math.min(planePrev, planeCurr);
    const planeHi = Math.max(planePrev, planeCurr);
    if (!(currCh > prevCh + 1e-5)) return false;
    return prevCh < planeHi && currCh >= planeLo;
  }

  /** Per-limb gates so each arm/leg can cross the plane again after retracting. */
  function createStaminaCrossState() {
    return { lw: true, rw: true, la: true, ra: true };
  }

  /**
   * Re-arm a limb when its depth drops behind the hip-relative plane (with margin).
   *
   * @param {{ lw:boolean, rw:boolean, la:boolean, ra:boolean }} state
   * @param {{ body,lw,rw,la,ra:number}} currDepths
   * @param {number} planeOffset
   * @param {number} [margin]
   */
  function updateStaminaCrossArming(state, currDepths, planeOffset, margin) {
    if (!state || !currDepths) return;
    const m = margin != null ? margin : STAMINA_REARM_MARGIN;
    const plane = currDepths.body + planeOffset;
    ['lw', 'rw', 'la', 'ra'].forEach(ch => {
      if (currDepths[ch] < plane - m) state[ch] = true;
    });
  }

  /**
   * Stamina event when a limb forward depth crosses body depth + `planeOffset`.
   * Plane follows the hip/body base each frame (less noisy than swing-speed spikes).
   *
   * Priority at cross: kick (ankle) > charge punch > punch (wrist).
   *
   * @param {{ body,lw,rw,la,ra:number}} prevDepths
   * @param {{ body,lw,rw,la,ra:number}} currDepths
   * @param {number} planeOffset ahead of body depth (metres-ish)
   * @param {{ l:number, r:number }} windup
   * @param {{ dx,dy,speed }|null} swingLW
   * @param {{ dx,dy,speed }|null} swingRW
   * @param {{ dx,dy,speed }|null} swingLA
   * @param {{ dx,dy,speed }|null} swingRA
   * @param {{ lw:boolean, rw:boolean, la:boolean, ra:boolean }} [crossState]
   * @returns {{ kind:'kick'|'punch'|'charge_punch', limb:string, channel:string }|null}
   */
  function detectStaminaPlaneCross(
    prevDepths, currDepths, planeOffset, windup, swingLW, swingRW, swingLA, swingRA,
    crossState
  ) {
    if (!prevDepths || !currDepths) return null;

    const crossed = [];
    const channels = ['la', 'ra', 'lw', 'rw'];
    channels.forEach(ch => {
      const armed = !crossState || crossState[ch];
      if (
        armed &&
        detectRelativePlaneCross(
          prevDepths[ch], currDepths[ch],
          prevDepths.body, currDepths.body,
          planeOffset
        )
      ) {
        crossed.push(ch);
      }
    });
    if (!crossed.length) {
      tickPunchWindup(windup, swingLW, swingRW);
      return null;
    }

    let event = null;

    if (crossed.includes('la') || crossed.includes('ra')) {
      windup.l = 0;
      windup.r = 0;
      const limb =
        crossed.includes('la') && crossed.includes('ra')
          ? (currDepths.la >= currDepths.ra ? 'left' : 'right')
          : crossed.includes('la')
            ? 'left'
            : 'right';
      event = { kind: 'kick', limb, channel: limb === 'left' ? 'la' : 'ra' };
    } else if (crossed.includes('lw') || crossed.includes('rw')) {
      const limb =
        crossed.includes('lw') && crossed.includes('rw')
          ? (currDepths.lw >= currDepths.rw ? 'left' : 'right')
          : crossed.includes('lw')
            ? 'left'
            : 'right';
      const charged =
        (limb === 'left' ? windup.l : windup.r) >= CHARGE_WINDUP_MIN_FRAMES;
      windup.l = 0;
      windup.r = 0;
      event = {
        kind: charged ? 'charge_punch' : 'punch',
        limb,
        channel: limb === 'left' ? 'lw' : 'rw',
      };
    }

    if (event && crossState) crossState[event.channel] = false;
    return event;
  }

  /**
   * @deprecated Use detectStaminaPlaneCross — swing-only detection is too noisy.
   */
  function detectOffensiveStaminaEvent(windup, swingLW, swingRW, swingLA, swingRA) {
    if (!windup) return null;

    const lKick = detectKick(swingLA);
    const rKick = detectKick(swingRA);
    if (lKick || rKick) {
      let limb;
      if (lKick && rKick) {
        limb = swingLA.speed >= swingRA.speed ? 'left' : 'right';
      } else {
        limb = lKick ? 'left' : 'right';
      }
      windup.l = 0;
      windup.r = 0;
      return { kind: 'kick', limb };
    }

    const lPunch = classifyPunchType(swingLW);
    const rPunch = classifyPunchType(swingRW);
    if (lPunch || rPunch) {
      let limb;
      let punchType;
      if (lPunch && rPunch) {
        limb = swingLW.speed >= swingRW.speed ? 'left' : 'right';
        punchType = limb === 'left' ? lPunch : rPunch;
      } else if (rPunch) {
        limb = 'right';
        punchType = rPunch;
      } else {
        limb = 'left';
        punchType = lPunch;
      }
      const charged = (limb === 'left' ? windup.l : windup.r) >= CHARGE_WINDUP_MIN_FRAMES;
      windup.l = 0;
      windup.r = 0;
      return {
        kind: charged ? 'charge_punch' : 'punch',
        limb,
        punchType,
      };
    }

    tickPunchWindup(windup, swingLW, swingRW);
    return null;
  }

  // ── Biomechanical depth estimation ───────────────────────────────────────

  /** Clamp a number between min and max. */
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  /** 2D landmark distance in normalised image space. */
  function dist2(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /**
   * Format one MediaPipe landmark as a debug string (raw x, y, z, visibility).
   *
   * @param {{ x:number, y:number, z?:number, visibility?:number }|null|undefined} p
   * @param {string} [label]
   * @returns {string}
   */
  function formatLandmarkRaw(p, label) {
    const prefix = label ? label + ' ' : '';
    if (!p) return prefix + '—';
    const z = p.z != null ? p.z : 0;
    const vis =
      p.visibility != null ? ` vis=${Number(p.visibility).toFixed(3)}` : '';
    return (
      prefix +
      `x=${Number(p.x).toFixed(4)} y=${Number(p.y).toFixed(4)} z=${Number(z).toFixed(4)}` +
      vis
    );
  }

  /**
   * Raw left/right wrist lines for UI debug (image + optional world landmarks).
   *
   * @param {Array<{x,y,z,visibility?}>|null} lm          poseLandmarks
   * @param {Array<{x,y,z}>|null} [worldLm]               poseWorldLandmarks
   * @returns {{ left: string, right: string }}
   */
  function formatWristRawDebug(lm, worldLm) {
    const lImg = lm && lm[B.L_WRIST] ? lm[B.L_WRIST] : null;
    const rImg = lm && lm[B.R_WRIST] ? lm[B.R_WRIST] : null;
    const lWorld = worldLm && worldLm[B.L_WRIST] ? worldLm[B.L_WRIST] : null;
    const rWorld = worldLm && worldLm[B.R_WRIST] ? worldLm[B.R_WRIST] : null;

    function wristLine(side, img, world) {
      const lines = [
        `${side} wrist [${side === 'L' ? B.L_WRIST : B.R_WRIST}] img: ${formatLandmarkRaw(img)}`,
      ];
      if (worldLm) {
        lines.push(
          `${side} wrist world: ${formatLandmarkRaw(world)}`
        );
      }
      return lines.join('\n');
    }

    return {
      left:  wristLine('L', lImg, lWorld),
      right: wristLine('R', rImg, rWorld),
    };
  }

  /**
   * Estimate forward depth from foreshortening.
   *
   * If a limb has calibrated length L and currently appears as length l in 2D,
   * then forward depth magnitude is sqrt(1 - (l/L)^2). This is a unitless
   * extension ratio where 0 = limb parallel to image plane and 1 = fully toward
   * the camera. Sign is intentionally not inferred here; callers decide whether
   * the motion should count as forward.
   *
   * @param {number} apparentLength current 2D limb length
   * @param {number} calibratedLength baseline 2D limb length
   * @returns {number} 0..1 forward-depth magnitude
   */
  function estimateForeshortenedDepth(apparentLength, calibratedLength) {
    if (!(calibratedLength > 1e-6) || !(apparentLength >= 0)) return 0;
    const ratio = clamp(apparentLength / calibratedLength, 0, 1);
    return Math.sqrt(Math.max(0, 1 - ratio * ratio));
  }

  /**
   * Create a baseline calibration from the current pose.
   * Best captured with arms/legs visible and extended in the image plane.
   *
   * @param {Array<{x,y,z}>} lm 33 pose landmarks
   * @returns {{ leftArm:number, rightArm:number, leftLeg:number, rightLeg:number } | null}
   */
  function createBiomechCalibration(lm) {
    if (!lm || lm.length < 29) return null;
    const calib = {
      leftArm:  dist2(lm[B.L_SHOULDER], lm[B.L_WRIST]),
      rightArm: dist2(lm[B.R_SHOULDER], lm[B.R_WRIST]),
      leftLeg:  dist2(lm[B.L_HIP],      lm[B.L_ANKLE]),
      rightLeg: dist2(lm[B.R_HIP],      lm[B.R_ANKLE]),
    };
    if (!calib.leftArm || !calib.rightArm || !calib.leftLeg || !calib.rightLeg) return null;
    return calib;
  }

  /**
   * Estimate biomechanical forward depth for wrists and ankles.
   *
   * Returned values are unitless 0..1 magnitudes. In the demo these are scaled
   * into metres and applied as positive forward Z for wrist/ankle landmarks.
   *
   * @param {Array<{x,y,z}>} lm
   * @param {{ leftArm:number, rightArm:number, leftLeg:number, rightLeg:number }} calibration
   * @returns {{ 15:number, 16:number, 27:number, 28:number }}
   */
  function estimateBiomechDepths(lm, calibration) {
    const out = { 15: 0, 16: 0, 27: 0, 28: 0 };
    if (!lm || lm.length < 29 || !calibration) return out;

    out[B.L_WRIST] = estimateForeshortenedDepth(
      dist2(lm[B.L_SHOULDER], lm[B.L_WRIST]),
      calibration.leftArm
    );
    out[B.R_WRIST] = estimateForeshortenedDepth(
      dist2(lm[B.R_SHOULDER], lm[B.R_WRIST]),
      calibration.rightArm
    );
    out[B.L_ANKLE] = estimateForeshortenedDepth(
      dist2(lm[B.L_HIP], lm[B.L_ANKLE]),
      calibration.leftLeg
    );
    out[B.R_ANKLE] = estimateForeshortenedDepth(
      dist2(lm[B.R_HIP], lm[B.R_ANKLE]),
      calibration.rightLeg
    );

    return out;
  }

  /**
   * Combined defensive action classifier.
   *
   * Only exposes the current game verbs: guard, dodge_left, dodge_right,
   * dodge_back, and idle. Punch/kick/block/crouch helpers remain exported for
   * experiments, but are intentionally not part of this simplified action set.
   *
   * @param {Array<{x,y,z}>}            lm      33 pose landmarks (MP normalised)
   * @param {{ dx,dy,speed }|null}      swingLW  left-wrist  swing (from ring buffer)
   * @param {{ dx,dy,speed }|null}      swingRW  right-wrist swing
   * @param {{ dx,dy,speed }|null}      swingLA  left-ankle  swing
   * @param {{ dx,dy,speed }|null}      swingRA  right-ankle swing
   * @param {object} [dodgeOpts]         passed to detectDirectionalDodge
   * @returns {{ action: string, limb: string }}
   */
  function classifyBoxingAction(lm, swingLW, swingRW, swingLA, swingRA, dodgeOpts) {
    if (detectBoxerGuard(lm))  return { action: 'guard',  limb: 'both' };

    const dodge = detectDirectionalDodge(lm, dodgeOpts);
    if (dodge) {
      const limb = dodge === 'dodge_left' ? 'left' : dodge === 'dodge_right' ? 'right' : 'back';
      return { action: dodge, limb };
    }

    return { action: 'idle', limb: 'none' };
  }

  // ── Public API ───────────────────────────────────────────────────────────
  const api = {
    PUNCH_SPEED,
    KICK_SPEED,
    CHARGE_WINDUP_MAX_SPEED,
    CHARGE_WINDUP_MIN_FRAMES,
    STAMINA_REARM_MARGIN,
    HIST_MAX,
    B,
    detectBoxerGuard,
    detectBoxerBlock,
    detectBoxerDodge,
    detectDirectionalDodge,
    detectBoxerCrouch,
    classifyPunchType,
    detectKick,
    tickPunchWindup,
    forwardDepthFromRatio,
    forwardDepthFromForeshortening,
    getForwardPlaneZ,
    segmentForwardDepth,
    computeForwardDepths,
    computeBodySpaceDepths,
    subtractForwardDepths,
    averageForwardDepths,
    captureDepthBaseline,
    DEPTH_BASELINE_FRAMES,
    computeHipMid,
    captureCharBaseline,
    computeCharPositionFromBodyPos,
    captureForwardRefs,
    detectForwardPlaneCross,
    detectRelativePlaneCross,
    createStaminaCrossState,
    updateStaminaCrossArming,
    detectStaminaPlaneCross,
    detectOffensiveStaminaEvent,
    estimateForeshortenedDepth,
    createBiomechCalibration,
    estimateBiomechDepths,
    formatLandmarkRaw,
    formatWristRawDebug,
    classifyBoxingAction,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    module.exports.default = api;
  }
  root.BoxingDetector = api;

})(typeof globalThis !== 'undefined' ? globalThis : this);
