/**
 * Tests for boxing.js pure helpers.
 * Run with: node --test boxing.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const require = createRequire(import.meta.url);
const B = require('./boxing.js');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a minimal 33-landmark array from a default standing pose,
 * optionally overriding specific indices.
 * Arms at sides, centred, standing upright — no gesture should fire.
 */
function makeLm(overrides = {}) {
  const base = [
    {x:.50, y:.07, z:0},  // 0  NOSE
    {x:.46, y:.09, z:0},  // 1
    {x:.44, y:.09, z:0},  // 2
    {x:.42, y:.09, z:0},  // 3
    {x:.54, y:.09, z:0},  // 4
    {x:.56, y:.09, z:0},  // 5
    {x:.58, y:.09, z:0},  // 6
    {x:.40, y:.11, z:0},  // 7
    {x:.60, y:.11, z:0},  // 8
    {x:.47, y:.13, z:0},  // 9  MOUTH_LEFT
    {x:.53, y:.13, z:0},  // 10
    {x:.35, y:.28, z:0},  // 11 L_SHOULDER
    {x:.65, y:.28, z:0},  // 12 R_SHOULDER
    {x:.22, y:.42, z:0},  // 13 L_ELBOW
    {x:.78, y:.42, z:0},  // 14 R_ELBOW
    {x:.10, y:.56, z:0},  // 15 L_WRIST  — arms at sides
    {x:.90, y:.56, z:0},  // 16 R_WRIST
    {x:.08, y:.62, z:0},  // 17
    {x:.92, y:.62, z:0},  // 18
    {x:.07, y:.60, z:0},  // 19
    {x:.93, y:.60, z:0},  // 20
    {x:.09, y:.58, z:0},  // 21
    {x:.91, y:.58, z:0},  // 22
    {x:.39, y:.55, z:0},  // 23 L_HIP
    {x:.61, y:.55, z:0},  // 24 R_HIP
    {x:.37, y:.72, z:0},  // 25 L_KNEE
    {x:.63, y:.72, z:0},  // 26 R_KNEE
    {x:.36, y:.88, z:0},  // 27 L_ANKLE
    {x:.64, y:.88, z:0},  // 28 R_ANKLE
    {x:.35, y:.92, z:0},  // 29
    {x:.65, y:.92, z:0},  // 30
    {x:.33, y:.96, z:0},  // 31
    {x:.67, y:.96, z:0},  // 32
  ];
  Object.entries(overrides).forEach(([i, v]) => {
    base[+i] = { ...base[+i], ...v };
  });
  return base;
}

/** Build a swing vector with the given display-space displacement. */
function makeSwing(dx, dy) {
  return { dx, dy, speed: Math.hypot(dx, dy) };
}

// ─── classifyPunchType ────────────────────────────────────────────────────────

describe('classifyPunchType', () => {
  it('returns null for null input', () =>
    assert.equal(B.classifyPunchType(null), null));

  it('returns null for undefined input', () =>
    assert.equal(B.classifyPunchType(undefined), null));

  it('returns null when speed is below PUNCH_SPEED', () =>
    assert.equal(B.classifyPunchType(makeSwing(0.05, 0.05)), null));

  it('returns null when speed is exactly at PUNCH_SPEED (not strictly above)', () => {
    const sw = { dx: B.PUNCH_SPEED, dy: 0, speed: B.PUNCH_SPEED };
    assert.equal(B.classifyPunchType(sw), null);
  });

  it('detects uppercut — dominant upward swing (dy negative, (-dy)/speed > 0.40)', () =>
    assert.equal(B.classifyPunchType(makeSwing(0.02, -0.18)), 'uppercut'));

  it('detects uppercut even with slight horizontal component', () => {
    const sw = makeSwing(0.04, -0.17);
    assert.equal(B.classifyPunchType(sw), 'uppercut');
  });

  it('detects hook — dominant rightward swing', () =>
    assert.equal(B.classifyPunchType(makeSwing(0.20, 0.01)), 'hook'));

  it('detects hook — dominant leftward swing', () =>
    assert.equal(B.classifyPunchType(makeSwing(-0.20, 0.01)), 'hook'));

  it('detects jab — fast punch with no dominant axis', () => {
    const sw = makeSwing(0.07, 0.12);
    assert.equal(B.classifyPunchType(sw), 'jab');
  });

  it('detects jab — diagonal that is not hook or uppercut', () => {
    // dx=0.06, dy=0.12 → speed≈0.134; |dx|/speed≈0.45 < 0.65; dy>-0.04 → jab
    const sw = makeSwing(0.06, 0.12);
    assert.ok(sw.speed > B.PUNCH_SPEED, 'speed must exceed threshold');
    assert.equal(B.classifyPunchType(sw), 'jab');
  });

  it('uppercut takes precedence over hook when dy is dominant and upward', () => {
    // Large dy upward AND large dx — uppercut ratio wins
    const sw = makeSwing(0.08, -0.20);
    // speed ≈ 0.216; (-dy)/speed ≈ 0.93 > 0.40 → uppercut
    assert.equal(B.classifyPunchType(sw), 'uppercut');
  });
});

// ─── detectKick ──────────────────────────────────────────────────────────────

describe('detectKick', () => {
  it('returns false for null', () =>
    assert.equal(B.detectKick(null), false));

  it('returns false for undefined', () =>
    assert.equal(B.detectKick(undefined), false));

  it('returns false when speed is below KICK_SPEED', () =>
    assert.equal(B.detectKick({ speed: B.KICK_SPEED - 0.001 }), false));

  it('returns false when speed equals KICK_SPEED (not strictly greater)', () =>
    assert.equal(B.detectKick({ speed: B.KICK_SPEED }), false));

  it('returns true when speed is just above KICK_SPEED', () =>
    assert.equal(B.detectKick({ speed: B.KICK_SPEED + 0.001 }), true));

  it('returns true for clearly fast ankle movement', () =>
    assert.equal(B.detectKick({ speed: 0.30 }), true));
});

// ─── detectBoxerGuard ─────────────────────────────────────────────────────────

describe('detectBoxerGuard', () => {
  it('returns false for null landmarks', () =>
    assert.equal(B.detectBoxerGuard(null), false));

  it('returns false for empty array', () =>
    assert.equal(B.detectBoxerGuard([]), false));

  it('returns false when array is shorter than required (< 17)', () =>
    assert.equal(
      B.detectBoxerGuard(Array.from({ length: 16 }, () => ({ x: 0, y: 0, z: 0 }))),
      false
    ));

  it('returns false in default standing pose (wrists at sides, far from chin)', () =>
    assert.equal(B.detectBoxerGuard(makeLm()), false));

  it('returns true when both wrists are at chin height', () => {
    const lm    = makeLm();
    const chinY = (lm[0].y + lm[9].y) / 2;
    assert.equal(
      B.detectBoxerGuard(makeLm({ 15: { y: chinY }, 16: { y: chinY } })),
      true
    );
  });

  it('returns false when only the left wrist is near chin', () => {
    const lm    = makeLm();
    const chinY = (lm[0].y + lm[9].y) / 2;
    assert.equal(
      B.detectBoxerGuard(makeLm({ 15: { y: chinY } })),
      false
    );
  });

  it('returns false when only the right wrist is near chin', () => {
    const lm    = makeLm();
    const chinY = (lm[0].y + lm[9].y) / 2;
    assert.equal(
      B.detectBoxerGuard(makeLm({ 16: { y: chinY } })),
      false
    );
  });

  it('respects custom band parameter', () => {
    const lm    = makeLm();
    const chinY = (lm[0].y + lm[9].y) / 2;
    // Place wrists 0.05 from chin — should pass with band=0.10, fail with band=0.03
    const adjusted = makeLm({ 15: { y: chinY + 0.05 }, 16: { y: chinY + 0.05 } });
    assert.equal(B.detectBoxerGuard(adjusted, 0.10), true);
    assert.equal(B.detectBoxerGuard(adjusted, 0.03), false);
  });
});

// ─── detectBoxerBlock ─────────────────────────────────────────────────────────

describe('detectBoxerBlock', () => {
  it('returns false for null', () =>
    assert.equal(B.detectBoxerBlock(null), false));

  it('returns false for empty array', () =>
    assert.equal(B.detectBoxerBlock([]), false));

  it('returns false in default standing pose (wrists are below hips)', () =>
    assert.equal(B.detectBoxerBlock(makeLm()), false));

  it('returns true when both wrists are in the chest zone', () => {
    const lm      = makeLm();
    const shY     = (lm[11].y + lm[12].y) / 2;  // 0.28
    const hipY    = (lm[23].y + lm[24].y) / 2;  // 0.55
    const centX   = (lm[11].x + lm[12].x) / 2;  // 0.50
    const midY    = (shY + hipY) / 2;             // 0.415
    assert.equal(
      B.detectBoxerBlock(makeLm({
        15: { x: centX - 0.05, y: midY },
        16: { x: centX + 0.05, y: midY },
      })),
      true
    );
  });

  it('returns false when wrists are raised above shoulder level', () => {
    const lm  = makeLm();
    const shY = (lm[11].y + lm[12].y) / 2;  // 0.28
    assert.equal(
      B.detectBoxerBlock(makeLm({
        15: { y: shY - 0.10 },
        16: { y: shY - 0.10 },
      })),
      false
    );
  });

  it('returns false when wrists are below hip level', () =>
    assert.equal(
      B.detectBoxerBlock(makeLm({
        15: { y: 0.70 },
        16: { y: 0.70 },
      })),
      false
    ));

  it('returns false when wrists are extended sideways beyond shoulder width', () => {
    const lm    = makeLm();
    const shY   = (lm[11].y + lm[12].y) / 2;
    const hipY  = (lm[23].y + lm[24].y) / 2;
    const midY  = (shY + hipY) / 2;
    assert.equal(
      B.detectBoxerBlock(makeLm({
        15: { x: 0.05, y: midY },   // far left
        16: { x: 0.95, y: midY },   // far right
      })),
      false
    );
  });

  it('returns false when only one wrist is in the chest zone', () => {
    const lm    = makeLm();
    const shY   = (lm[11].y + lm[12].y) / 2;
    const hipY  = (lm[23].y + lm[24].y) / 2;
    const centX = (lm[11].x + lm[12].x) / 2;
    const midY  = (shY + hipY) / 2;
    assert.equal(
      B.detectBoxerBlock(makeLm({
        15: { x: centX, y: midY },  // in chest
        16: { y: 0.70 },            // below hips
      })),
      false
    );
  });
});

// ─── detectBoxerDodge ─────────────────────────────────────────────────────────

describe('detectBoxerDodge', () => {
  it('returns false for null', () =>
    assert.equal(B.detectBoxerDodge(null), false));

  it('returns false for short array', () =>
    assert.equal(
      B.detectBoxerDodge(Array.from({ length: 12 }, () => ({ x: 0.5, y: 0, z: 0 }))),
      false
    ));

  it('returns false when centred (default pose, midX ≈ 0.50)', () =>
    assert.equal(B.detectBoxerDodge(makeLm()), false));

  it('returns true when leaning right (shoulders shifted right)', () =>
    assert.equal(
      B.detectBoxerDodge(makeLm({ 11: { x: 0.56 }, 12: { x: 0.76 } })),
      true
    ));

  it('returns true when leaning left (shoulders shifted left)', () =>
    assert.equal(
      B.detectBoxerDodge(makeLm({ 11: { x: 0.24 }, 12: { x: 0.44 } })),
      true
    ));

  it('respects custom threshold — slight lean blocked by large threshold', () =>
    assert.equal(
      B.detectBoxerDodge(makeLm({ 11: { x: 0.52 }, 12: { x: 0.68 } }), 0.30),
      false
    ));

  it('respects custom threshold — slight lean passes with small threshold', () =>
    assert.equal(
      B.detectBoxerDodge(makeLm({ 11: { x: 0.52 }, 12: { x: 0.68 } }), 0.04),
      true
    ));
});

// ─── detectDirectionalDodge ───────────────────────────────────────────────────

describe('detectDirectionalDodge', () => {
  it('returns null for missing landmarks', () => {
    assert.equal(B.detectDirectionalDodge(null), null);
    assert.equal(B.detectDirectionalDodge(makeLm().slice(0, 12)), null);
  });

  it('returns null for a centred standing pose', () =>
    assert.equal(B.detectDirectionalDodge(makeLm()), null));

  it('detects dodge_left when raw shoulders shift right in mirrored camera space', () =>
    assert.equal(
      B.detectDirectionalDodge(makeLm({ 11: { x: 0.56 }, 12: { x: 0.76 } })),
      'dodge_left'
    ));

  it('detects dodge_right when raw shoulders shift left in mirrored camera space', () =>
    assert.equal(
      B.detectDirectionalDodge(makeLm({ 11: { x: 0.24 }, 12: { x: 0.44 } })),
      'dodge_right'
    ));

  it('detects dodge_back when shoulders shrink below calibrated ref', () =>
    assert.equal(
      B.detectDirectionalDodge(makeLm({ 11: { x: 0.40 }, 12: { x: 0.60 } }), {
        refShW: 0.26,
        shoulderWidthHist: [0.26, 0.25, 0.24, 0.23],
      }),
      'dodge_back'
    ));

  it('does not flag dodge_back when always narrow without recent shrink', () =>
    assert.equal(
      B.detectDirectionalDodge(makeLm({ 11: { x: 0.40 }, 12: { x: 0.60 } }), {
        refShW: 0.26,
        shoulderWidthHist: [0.20, 0.20, 0.20],
      }),
      null
    ));
});

describe('forward depth helpers', () => {
  it('forwardDepthFromRatio is positive when apparent grows (closer)', () => {
    assert.ok(B.forwardDepthFromRatio(0.30, 0.26) > 0);
    assert.ok(B.forwardDepthFromRatio(0.20, 0.26) < 0);
  });

  it('getForwardPlaneZ matches body depth plus offset for UI and detection', () => {
    const body = 0.12;
    const offset = 0.14;
    assert.equal(B.getForwardPlaneZ(body, offset), body + offset);
  });
});

describe('computeBodySpaceDepths', () => {
  function mockBodyPos() {
    return {
      11: { x: -0.2, y: -0.25, z: 0.05 },
      12: { x:  0.2, y: -0.25, z: 0.05 },
      15: { x: -0.5, y: -0.22, z: 0.12 },
      16: { x:  0.5, y: -0.22, z: 0.12 },
      23: { x: -0.1, y:  0.02, z: 0 },
      24: { x:  0.1, y:  0.02, z: 0 },
      27: { x: -0.1, y:  0.5, z: 0.02 },
      28: { x:  0.1, y:  0.5, z: 0.02 },
    };
  }

  it('returns hip-relative Z in metres for body and limbs', () => {
    const d = B.computeBodySpaceDepths(mockBodyPos());
    assert.ok(Math.abs(d.body - 0.05) < 1e-4);
    assert.ok(Math.abs(d.lw - 0.12) < 1e-4);
  });

  it('subtractForwardDepths zeroes the standing pose', () => {
    const raw = B.computeBodySpaceDepths(mockBodyPos());
    const norm = B.subtractForwardDepths(raw, raw);
    assert.equal(norm.body, 0);
    assert.equal(norm.lw, 0);
  });

  it('detects punch when wrist Z moves forward after baseline', () => {
    const base = B.computeBodySpaceDepths(mockBodyPos());
    const punchPos = mockBodyPos();
    punchPos[15] = { x: -0.5, y: -0.22, z: 0.38 };
    const curr = B.subtractForwardDepths(B.computeBodySpaceDepths(punchPos), base);
    const prev = { body: 0, lw: 0, rw: 0, la: 0, ra: 0 };
    const offset = 0.18;
    const w = { l: 0, r: 0 };
    const ev = B.detectStaminaPlaneCross(prev, curr, offset, w, null, null, null, null);
    assert.equal(ev.kind, 'punch');
    assert.equal(ev.limb, 'left');
  });
});

// ─── detectBoxerCrouch ────────────────────────────────────────────────────────

describe('detectBoxerCrouch', () => {
  it('returns false for null', () =>
    assert.equal(B.detectBoxerCrouch(null), false));

  it('returns false for short array', () =>
    assert.equal(
      B.detectBoxerCrouch(Array.from({ length: 24 }, () => ({ x: 0, y: 0, z: 0 }))),
      false
    ));

  it('returns false in default standing pose (ratio ≈ 0.90 > threshold 0.85)', () =>
    assert.equal(B.detectBoxerCrouch(makeLm()), false));

  it('returns true when shoulders are close to hips (crouching)', () => {
    const lm   = makeLm();
    const hipY = (lm[23].y + lm[24].y) / 2;  // 0.55
    assert.equal(
      B.detectBoxerCrouch(makeLm({
        11: { y: hipY - 0.03 },
        12: { y: hipY - 0.03 },
      })),
      true
    );
  });

  it('respects custom threshold — strict threshold flags standing pose as crouching', () =>
    assert.equal(B.detectBoxerCrouch(makeLm(), 2.0), true));

  it('returns false when shoulder width is zero (degenerate pose)', () =>
    assert.equal(
      B.detectBoxerCrouch(makeLm({ 11: { x: 0.50 }, 12: { x: 0.50 } })),
      false
    ));
});

// ─── classifyBoxingAction ─────────────────────────────────────────────────────

describe('classifyBoxingAction', () => {
  it('returns idle when all inputs are null', () => {
    const res = B.classifyBoxingAction(makeLm(), null, null, null, null);
    assert.equal(res.action, 'idle');
    assert.equal(res.limb,   'none');
  });

  it('ignores punch and kick swings in the simplified defensive action set', () => {
    const punch = makeSwing(0.05, 0.14);
    const kick = { speed: B.KICK_SPEED + 0.05 };
    const res = B.classifyBoxingAction(makeLm(), punch, punch, kick, kick);
    assert.equal(res.action, 'idle');
    assert.equal(res.limb,   'none');
  });

  it('detects guard when both wrists are near chin', () => {
    const lm    = makeLm();
    const chinY = (lm[0].y + lm[9].y) / 2;
    const gLm   = makeLm({ 15: { y: chinY }, 16: { y: chinY } });
    const res   = B.classifyBoxingAction(gLm, null, null, null, null);
    assert.equal(res.action, 'guard');
    assert.equal(res.limb,   'both');
  });

  it('detects dodge_left when the mirrored player jumps left', () => {
    const dLm = makeLm({ 11: { x: 0.56 }, 12: { x: 0.76 } });
    const res = B.classifyBoxingAction(dLm, null, null, null, null);
    assert.equal(res.action, 'dodge_left');
    assert.equal(res.limb,   'left');
  });

  it('detects dodge_right when the mirrored player jumps right', () => {
    const dLm = makeLm({ 11: { x: 0.24 }, 12: { x: 0.44 } });
    const res = B.classifyBoxingAction(dLm, null, null, null, null);
    assert.equal(res.action, 'dodge_right');
    assert.equal(res.limb,   'right');
  });

  it('detects dodge_back when shoulders shrink from moving away', () => {
    const dLm = makeLm({ 11: { x: 0.40 }, 12: { x: 0.60 } });
    const res = B.classifyBoxingAction(dLm, null, null, null, null, {
      refShW: 0.26,
      shoulderWidthHist: [0.26, 0.25, 0.24],
    });
    assert.equal(res.action, 'dodge_back');
    assert.equal(res.limb,   'back');
  });

  it('guard takes priority over directional dodge', () => {
    const lm    = makeLm();
    const chinY = (lm[0].y + lm[9].y) / 2;
    const res   = B.classifyBoxingAction(
      makeLm({ 11: { x: 0.56 }, 12: { x: 0.76 }, 15: { y: chinY }, 16: { y: chinY } }),
      null,
      null,
      null,
      null
    );
    assert.equal(res.action, 'guard');
    assert.equal(res.limb,   'both');
  });
});

describe('detectForwardPlaneCross', () => {
  it('returns true only when crossing forward through a fixed plane', () => {
    assert.equal(B.detectForwardPlaneCross(0.2, 0.4, 0.35), true);
    assert.equal(B.detectForwardPlaneCross(0.4, 0.5, 0.35), false);
    assert.equal(B.detectForwardPlaneCross(0.5, 0.3, 0.35), false);
  });
});

describe('detectRelativePlaneCross', () => {
  const offset = 0.35;

  it('crosses when limb passes body depth + offset (plane moves with base)', () => {
    assert.equal(B.detectRelativePlaneCross(0.2, 0.55, 0.1, 0.15, offset), true);
    assert.equal(B.detectRelativePlaneCross(0.5, 0.55, 0.1, 0.15, offset), false);
    assert.equal(B.detectRelativePlaneCross(0.55, 0.5, 0.1, 0.15, offset), false);
  });

  it('detects a fast cross that skips the exact plane edge between frames', () => {
    assert.equal(B.detectRelativePlaneCross(0.30, 0.62, 0.10, 0.12, offset), true);
  });
});

describe('stamina cross state', () => {
  const offset = 0.35;

  it('re-arms a limb after it retreats behind the plane', () => {
    const state = B.createStaminaCrossState();
    B.updateStaminaCrossArming(state, { body: 0.1, lw: 0.2, rw: 0.1, la: 0.1, ra: 0.1 }, offset);
    assert.equal(state.lw, true);

    const prev = { body: 0.1, lw: 0.2, rw: 0.1, la: 0.1, ra: 0.1 };
    const curr = { body: 0.15, lw: 0.55, rw: 0.2, la: 0.1, ra: 0.1 };
    const w = { l: 0, r: 0 };
    const first = B.detectStaminaPlaneCross(prev, curr, offset, w, null, null, null, null, state);
    assert.equal(first.kind, 'punch');
    assert.equal(state.lw, false);

    const noRepeat = B.detectStaminaPlaneCross(curr, { ...curr, lw: 0.58 }, offset, w, null, null, null, null, state);
    assert.equal(noRepeat, null);

    B.updateStaminaCrossArming(state, { body: 0.15, lw: 0.05, rw: 0.2, la: 0.1, ra: 0.1 }, offset);
    assert.equal(state.lw, true);

    const second = B.detectStaminaPlaneCross(
      { body: 0.15, lw: 0.10, rw: 0.2, la: 0.1, ra: 0.1 },
      { body: 0.18, lw: 0.58, rw: 0.2, la: 0.1, ra: 0.1 },
      offset, w, null, null, null, null, state
    );
    assert.equal(second.kind, 'punch');
  });
});

describe('detectStaminaPlaneCross', () => {
  const offset = 0.35;

  it('returns null when nothing crosses the hip-relative plane', () => {
    const prev = { body: 0.1, lw: 0.1, rw: 0.1, la: 0.1, ra: 0.1 };
    const curr = { body: 0.2, lw: 0.2, rw: 0.2, la: 0.2, ra: 0.2 };
    const w = { l: 0, r: 0 };
    assert.equal(
      B.detectStaminaPlaneCross(prev, curr, offset, w, null, null, null, null),
      null
    );
  });

  it('returns kick when ankle depth crosses body + offset', () => {
    const prev = { body: 0.1, lw: 0.1, rw: 0.1, la: 0.2, ra: 0.1 };
    const curr = { body: 0.15, lw: 0.2, rw: 0.2, la: 0.55, ra: 0.2 };
    const w = { l: 0, r: 0 };
    const ev = B.detectStaminaPlaneCross(prev, curr, offset, w, null, null, null, null);
    assert.equal(ev.kind, 'kick');
    assert.equal(ev.limb, 'left');
  });

  it('returns punch when wrist crosses without wind-up', () => {
    const prev = { body: 0.1, lw: 0.2, rw: 0.1, la: 0.1, ra: 0.1 };
    const curr = { body: 0.15, lw: 0.55, rw: 0.2, la: 0.1, ra: 0.1 };
    const w = { l: 0, r: 0 };
    const ev = B.detectStaminaPlaneCross(prev, curr, offset, w, null, null, null, null);
    assert.equal(ev.kind, 'punch');
    assert.equal(ev.limb, 'left');
  });

  it('returns charge_punch when wrist crosses after wind-up frames', () => {
    const prev = { body: 0.1, lw: 0.2, rw: 0.1, la: 0.1, ra: 0.1 };
    const curr = { body: 0.15, lw: 0.55, rw: 0.2, la: 0.1, ra: 0.1 };
    const w = { l: B.CHARGE_WINDUP_MIN_FRAMES, r: 0 };
    const ev = B.detectStaminaPlaneCross(prev, curr, offset, w, null, null, null, null);
    assert.equal(ev.kind, 'charge_punch');
  });
});

describe('detectOffensiveStaminaEvent', () => {
  it('returns kick for fast left ankle', () => {
    const w = { l: 0, r: 0 };
    const kick = { speed: B.KICK_SPEED + 0.02 };
    const ev = B.detectOffensiveStaminaEvent(w, null, null, kick, null);
    assert.deepEqual(ev, { kind: 'kick', limb: 'left' });
    assert.equal(w.l, 0);
    assert.equal(w.r, 0);
  });

  it('returns punch when no wind-up accumulated', () => {
    const w = { l: 0, r: 0 };
    const punch = makeSwing(0.05, 0.14);
    const ev = B.detectOffensiveStaminaEvent(w, punch, null, null, null);
    assert.equal(ev.kind, 'punch');
    assert.equal(ev.limb, 'left');
    assert.equal(ev.punchType, 'jab');
  });

  it('returns charge_punch after enough low-speed frames on striking limb', () => {
    const w = { l: 0, r: 0 };
    const slow = { dx: 0, dy: 0, speed: 0.02 };
    for (let i = 0; i < B.CHARGE_WINDUP_MIN_FRAMES; i++) {
      B.detectOffensiveStaminaEvent(w, slow, null, null, null);
    }
    const punch = makeSwing(0.05, 0.14);
    const ev = B.detectOffensiveStaminaEvent(w, punch, null, null, null);
    assert.equal(ev.kind, 'charge_punch');
    assert.equal(ev.limb, 'left');
  });

  it('prioritises kick over punch on the same frame', () => {
    const w = { l: 0, r: 0 };
    const kick = { speed: B.KICK_SPEED + 0.02 };
    const punch = makeSwing(0.05, 0.14);
    const ev = B.detectOffensiveStaminaEvent(w, punch, null, kick, null);
    assert.equal(ev.kind, 'kick');
  });
});

 // ─── Biomechanical depth estimation ───────────────────────────────────────────

describe('estimateForeshortenedDepth', () => {
  it('returns 0 for invalid calibration', () => {
    assert.equal(B.estimateForeshortenedDepth(0.1, 0), 0);
    assert.equal(B.estimateForeshortenedDepth(0.1, -1), 0);
  });

  it('returns 0 when current length equals calibration length', () => {
    assert.equal(B.estimateForeshortenedDepth(0.4, 0.4), 0);
  });

  it('returns 0 when current length is longer than calibration length', () => {
    assert.equal(B.estimateForeshortenedDepth(0.5, 0.4), 0);
  });

  it('returns expected depth magnitude when limb is foreshortened', () => {
    const depth = B.estimateForeshortenedDepth(0.3, 0.5);
    assert.ok(Math.abs(depth - 0.8) < 1e-12);
  });
});

describe('createBiomechCalibration', () => {
  it('returns null for missing landmarks', () => {
    assert.equal(B.createBiomechCalibration(null), null);
    assert.equal(B.createBiomechCalibration(makeLm().slice(0, 10)), null);
  });

  it('captures positive baseline lengths for arms and legs', () => {
    const calib = B.createBiomechCalibration(makeLm());
    assert.ok(calib.leftArm > 0);
    assert.ok(calib.rightArm > 0);
    assert.ok(calib.leftLeg > 0);
    assert.ok(calib.rightLeg > 0);
  });
});

describe('estimateBiomechDepths', () => {
  it('returns zero depths without calibration', () => {
    assert.deepEqual(B.estimateBiomechDepths(makeLm(), null), { 15: 0, 16: 0, 27: 0, 28: 0 });
  });

  it('increases wrist depth when a calibrated arm appears shorter', () => {
    const base = makeLm();
    const calib = B.createBiomechCalibration(base);
    const lm = makeLm({
      15: {
        x: base[11].x + (base[15].x - base[11].x) * 0.5,
        y: base[11].y + (base[15].y - base[11].y) * 0.5,
      },
    });
    const depths = B.estimateBiomechDepths(lm, calib);
    assert.ok(depths[15] > 0.8);
    assert.equal(depths[16], 0);
  });

  it('increases ankle depth when a calibrated leg appears shorter', () => {
    const base = makeLm();
    const calib = B.createBiomechCalibration(base);
    const lm = makeLm({
      28: {
        x: base[24].x + (base[28].x - base[24].x) * 0.5,
        y: base[24].y + (base[28].y - base[24].y) * 0.5,
      },
    });
    const depths = B.estimateBiomechDepths(lm, calib);
    assert.ok(depths[28] > 0.8);
    assert.equal(depths[27], 0);
  });
});

// ─── Exported constants ───────────────────────────────────────────────────────

describe('exported constants', () => {
  it('PUNCH_SPEED is a positive number', () =>
    assert.ok(typeof B.PUNCH_SPEED === 'number' && B.PUNCH_SPEED > 0));

  it('charge wind-up tuning constants exist', () => {
    assert.ok(typeof B.CHARGE_WINDUP_MAX_SPEED === 'number' && B.CHARGE_WINDUP_MAX_SPEED > 0);
    assert.ok(Number.isInteger(B.CHARGE_WINDUP_MIN_FRAMES) && B.CHARGE_WINDUP_MIN_FRAMES > 0);
  });

  it('KICK_SPEED is a positive number', () =>
    assert.ok(typeof B.KICK_SPEED === 'number' && B.KICK_SPEED > 0));

  it('HIST_MAX is a positive integer', () =>
    assert.ok(Number.isInteger(B.HIST_MAX) && B.HIST_MAX > 0));

  it('B landmark map has expected keys', () => {
    assert.ok('L_WRIST' in B.B);
    assert.ok('R_WRIST' in B.B);
    assert.ok('L_ANKLE' in B.B);
    assert.ok('R_ANKLE' in B.B);
  });
});
