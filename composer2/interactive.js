/**
 * SVG interactives for the retargeting tutorial.
 * Exposes RetargetInteractives on globalThis for non-module scripts.
 *
 * Widgets:
 *   mountBoneMap          – joint pairing exercise (existing)
 *   mountProportionDemo   – leg-length slider (existing)
 *   mountWalkCycle        – live dual-skeleton walk animation
 *   mountBindPoseMismatch – T-pose vs A-pose arm correction demo
 *   mountIKDemo           – 2-bone IK foot-plant with terrain slider
 *   mountRootMotion       – in-place vs root-motion toggle
 *   mountSpineDist        – spine bend distribution across 3 vs 5 bones
 *
 * Pure helpers (also exported for testing):
 *   scaleAround           – scale a point around an origin
 *   solveIK2Bone          – law-of-cosines two-bone IK solver
 *   distributeRotation    – spread a total rotation evenly across N bones
 */
(function attachRetargetInteractives(root) {
  'use strict';

  // ─── Shared SVG helpers ──────────────────────────────────────────────────

  function svgLine(a, b, strokeWidth, extra) {
    return (
      '<line x1="' + a.x.toFixed(1) + '" y1="' + a.y.toFixed(1) +
      '" x2="' + b.x.toFixed(1) + '" y2="' + b.y.toFixed(1) +
      '" stroke="currentColor" stroke-width="' + (strokeWidth || 2.5) +
      '" stroke-linecap="round"' + (extra || '') + '/>'
    );
  }

  function svgCircle(cx, cy, r, extra) {
    return (
      '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
      '" r="' + r + '" ' + (extra || 'fill="currentColor"') + '/>'
    );
  }

  function svgText(x, y, text, extra) {
    return (
      '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
      '" font-size="11" fill="currentColor" opacity="0.7"' + (extra || '') + '>' + text + '</text>'
    );
  }

  // ─── Existing helpers ────────────────────────────────────────────────────

  /** @typedef {{ sourceId: string; targetId: string }} BonePair */

  /** @type {BonePair[]} */
  var CANONICAL_PAIRS = [
    { sourceId: 'spine', targetId: 'spine' },
    { sourceId: 'chest', targetId: 'chest' },
    { sourceId: 'neck', targetId: 'neck' },
    { sourceId: 'head', targetId: 'head' },
    { sourceId: 'ru_arm', targetId: 'ru_arm' },
    { sourceId: 'ru_fore', targetId: 'ru_fore' },
    { sourceId: 'lu_arm', targetId: 'lu_arm' },
    { sourceId: 'lu_fore', targetId: 'lu_fore' },
    { sourceId: 'r_thigh', targetId: 'r_thigh' },
    { sourceId: 'r_shin', targetId: 'r_shin' },
    { sourceId: 'l_thigh', targetId: 'l_thigh' },
    { sourceId: 'l_shin', targetId: 'l_shin' },
  ];

  /**
   * Scale a point around an origin on each axis independently.
   * @param {{ x: number; y: number }} origin
   * @param {{ x: number; y: number }} p
   * @param {number} sx
   * @param {number} sy
   */
  function scaleAround(origin, p, sx, sy) {
    return {
      x: origin.x + (p.x - origin.x) * sx,
      y: origin.y + (p.y - origin.y) * sy,
    };
  }

  // ─── Pure helper: two-bone IK (law of cosines) ──────────────────────────

  /**
   * Solve a two-bone IK chain (e.g. hip–knee–ankle).
   * Returns the knee position so that the ankle reaches `footTarget`.
   *
   * @param {{ x: number; y: number }} hip       Root joint
   * @param {{ x: number; y: number }} footTarget Desired end-effector position
   * @param {number} L1                           Thigh length (hip→knee)
   * @param {number} L2                           Shin length  (knee→ankle)
   * @param {boolean} [bendForward]               Knee bends forward (+X) when true (default)
   * @returns {{ knee: { x: number; y: number }; foot: { x: number; y: number }; reachable: boolean }}
   */
  function solveIK2Bone(hip, footTarget, L1, L2, bendForward) {
    var dx = footTarget.x - hip.x;
    var dy = footTarget.y - hip.y;
    var d = Math.sqrt(dx * dx + dy * dy);

    var reachable = d <= L1 + L2 - 0.001 && d >= Math.abs(L1 - L2) + 0.001;
    var dClamped = Math.max(Math.abs(L1 - L2) + 0.001, Math.min(L1 + L2 - 0.001, d));

    var baseAngle = Math.atan2(dy, dx);
    var cosAlpha = (dClamped * dClamped + L1 * L1 - L2 * L2) / (2 * dClamped * L1);
    cosAlpha = Math.max(-1, Math.min(1, cosAlpha));
    var alpha = Math.acos(cosAlpha);

    var kneeAngle = (bendForward !== false) ? baseAngle - alpha : baseAngle + alpha;
    var knee = {
      x: hip.x + L1 * Math.cos(kneeAngle),
      y: hip.y + L1 * Math.sin(kneeAngle),
    };

    return { knee: knee, foot: footTarget, reachable: reachable };
  }

  // ─── Pure helper: distribute rotation across N bones ────────────────────

  /**
   * Distribute a total rotation evenly across `boneCount` bones.
   * Useful for mapping a 3-bone spine rotation to a 5-bone spine target.
   *
   * @param {number} totalDeg   Total rotation to distribute (degrees)
   * @param {number} boneCount  Number of target bones
   * @returns {number[]}        Per-bone rotation in degrees
   */
  function distributeRotation(totalDeg, boneCount) {
    if (boneCount <= 0) return [];
    var perBone = totalDeg / boneCount;
    var result = [];
    for (var i = 0; i < boneCount; i++) result.push(perBone);
    return result;
  }

  // ─── EXISTING: Bone map lab ──────────────────────────────────────────────

  /**
   * @param {'source'|'target'} fig
   */
  function jointCoords(fig) {
    var pelvis = { x: 80, y: 168 };
    var spine = { x: 80, y: 138 };
    var chest = { x: 80, y: 108 };
    var neck = { x: 80, y: 82 };
    var head = { x: 80, y: 52 };
    var ru_arm = { x: 118, y: 104 };
    var ru_fore = { x: 148, y: 126 };
    var lu_arm = { x: 42, y: 104 };
    var lu_fore = { x: 12, y: 126 };
    var r_thigh = { x: 94, y: 178 };
    var r_shin = { x: 94, y: 228 };
    var r_foot = { x: 94, y: 268 };
    var l_thigh = { x: 66, y: 178 };
    var l_shin = { x: 66, y: 228 };
    var l_foot = { x: 66, y: 268 };

    if (fig === 'target') {
      var sx = 1.12;
      var syLeg = 1.18;
      ru_arm = scaleAround(chest, ru_arm, sx, 1);
      ru_fore = scaleAround(chest, ru_fore, sx, 1);
      lu_arm = scaleAround(chest, lu_arm, sx, 1);
      lu_fore = scaleAround(chest, lu_fore, sx, 1);
      r_thigh = scaleAround(pelvis, r_thigh, 1, syLeg);
      r_shin = scaleAround(r_thigh, r_shin, 1, syLeg);
      r_foot = scaleAround(r_shin, r_foot, 1, syLeg);
      l_thigh = scaleAround(pelvis, l_thigh, 1, syLeg);
      l_shin = scaleAround(l_thigh, l_shin, 1, syLeg);
      l_foot = scaleAround(l_shin, l_foot, 1, syLeg);
    }

    return {
      pelvis: pelvis, spine: spine, chest: chest, neck: neck, head: head,
      ru_arm: ru_arm, ru_fore: ru_fore, lu_arm: lu_arm, lu_fore: lu_fore,
      r_thigh: r_thigh, r_shin: r_shin, r_foot: r_foot,
      l_thigh: l_thigh, l_shin: l_shin, l_foot: l_foot,
    };
  }

  function lineBetween(a, b) {
    return (
      '<line class="bone-line" x1="' + a.x + '" y1="' + a.y +
      '" x2="' + b.x + '" y2="' + b.y +
      '" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'
    );
  }

  function jointCircle(id, cx, cy, label) {
    var r = 9;
    return (
      '<g class="joint" data-joint-id="' + id + '">' +
      '<circle class="joint-dot" cx="' + cx + '" cy="' + cy +
      '" r="' + r + '" fill="color-mix(in oklab, canvastext 35%, canvas)" stroke="currentColor" stroke-width="1.5"/>' +
      '<circle class="bone-hit" cx="' + cx + '" cy="' + cy + '" r="' + (r + 10) + '" />' +
      '<text x="' + (cx + 12) + '" y="' + (cy + 4) +
      '" font-size="11" fill="currentColor" opacity="0.75">' + label + '</text>' +
      '</g>'
    );
  }

  /**
   * @param {'source'|'target'} fig
   */
  function renderStickSvg(fig) {
    var c = jointCoords(fig);
    var bones = [];
    bones.push(lineBetween(c.pelvis, c.spine));
    bones.push(lineBetween(c.spine, c.chest));
    bones.push(lineBetween(c.chest, c.neck));
    bones.push(lineBetween(c.neck, c.head));
    bones.push(lineBetween(c.chest, c.ru_arm));
    bones.push(lineBetween(c.ru_arm, c.ru_fore));
    bones.push(lineBetween(c.chest, c.lu_arm));
    bones.push(lineBetween(c.lu_arm, c.lu_fore));
    bones.push(lineBetween(c.pelvis, c.r_thigh));
    bones.push(lineBetween(c.r_thigh, c.r_shin));
    bones.push(lineBetween(c.r_shin, c.r_foot));
    bones.push(lineBetween(c.pelvis, c.l_thigh));
    bones.push(lineBetween(c.l_thigh, c.l_shin));
    bones.push(lineBetween(c.l_shin, c.l_foot));

    var joints = [];
    joints.push(jointCircle('pelvis', c.pelvis.x, c.pelvis.y, 'Pelvis'));
    joints.push(jointCircle('spine', c.spine.x, c.spine.y, 'Spine'));
    joints.push(jointCircle('chest', c.chest.x, c.chest.y, 'Chest'));
    joints.push(jointCircle('neck', c.neck.x, c.neck.y, 'Neck'));
    joints.push(jointCircle('head', c.head.x, c.head.y, 'Head'));
    joints.push(jointCircle('ru_arm', c.ru_arm.x, c.ru_arm.y, 'R upper'));
    joints.push(jointCircle('ru_fore', c.ru_fore.x, c.ru_fore.y, 'R lower'));
    joints.push(jointCircle('lu_arm', c.lu_arm.x, c.lu_arm.y, 'L upper'));
    joints.push(jointCircle('lu_fore', c.lu_fore.x, c.lu_fore.y, 'L lower'));
    joints.push(jointCircle('r_thigh', c.r_thigh.x, c.r_thigh.y, 'R thigh'));
    joints.push(jointCircle('r_shin', c.r_shin.x, c.r_shin.y, 'R shin'));
    joints.push(jointCircle('l_thigh', c.l_thigh.x, c.l_thigh.y, 'L thigh'));
    joints.push(jointCircle('l_shin', c.l_shin.x, c.l_shin.y, 'L shin'));

    var swayClass = fig === 'source' ? 'rig-sway rig-sway--a' : 'rig-sway rig-sway--b';

    return (
      '<svg class="bone-map-svg" viewBox="0 0 160 285" role="img" aria-label="' +
      (fig === 'source' ? 'Source skeleton' : 'Target skeleton') + '">' +
      '<g class="' + swayClass + '">' +
      '<g class="bones">' + bones.join('') + '</g>' +
      '<g class="joints">' + joints.join('') + '</g>' +
      '</g>' +
      '</svg>'
    );
  }

  /**
   * @param {HTMLElement} mount
   */
  function mountBoneMap(mount) {
    var sourceEl = mount.querySelector('[data-role="source-svg"]');
    var targetEl = mount.querySelector('[data-role="target-svg"]');
    var statusEl = mount.querySelector('[data-role="map-status"]');
    var resetBtn = mount.querySelector('[data-action="reset-map"]');
    var checkBtn = mount.querySelector('[data-action="check-map"]');

    if (!sourceEl || !targetEl || !statusEl) return;

    sourceEl.innerHTML = renderStickSvg('source');
    targetEl.innerHTML = renderStickSvg('target');

    /** @type {'source'|'target'|null} */
    var activeFig = null;
    /** @type {string|null} */
    var pendingJoint = null;
    /** @type {BonePair[]} */
    var userPairs = [];

    function pairKey(p) { return p.sourceId + '->' + p.targetId; }

    function renderPairsMessage() {
      if (userPairs.length === 0) {
        statusEl.textContent = 'Tap a joint on the source, then the matching joint on the target. Pelvis is locked as root.';
        return;
      }
      statusEl.textContent = 'Mapped ' + userPairs.length + ' pair(s). Tap Check mapping when ready.';
    }

    function clearSelectionUi() {
      mount.querySelectorAll('.joint-dot').forEach(function (el) {
        el.removeAttribute('data-selected');
      });
    }

    function applyPairedUi() {
      var pairedSource = {};
      var pairedTarget = {};
      userPairs.forEach(function (p) {
        pairedSource[p.sourceId] = true;
        pairedTarget[p.targetId] = true;
      });
      mount.querySelectorAll('.joint').forEach(function (g) {
        var id = g.getAttribute('data-joint-id');
        var svg = g.closest('.bone-map-svg');
        var isSource = !!(svg && sourceEl.contains(svg));
        var dot = g.querySelector('.joint-dot');
        if (!dot || !id) return;
        dot.removeAttribute('data-selected');
        if (id === 'pelvis') return;
        if ((isSource && pairedSource[id]) || (!isSource && pairedTarget[id])) {
          dot.setAttribute('data-paired', 'true');
        } else {
          dot.removeAttribute('data-paired');
        }
      });
    }

    function flashPairDots(sourceJointId, targetJointId) {
      var s = sourceEl.querySelector('.joint[data-joint-id="' + sourceJointId + '"] .joint-dot');
      var t = targetEl.querySelector('.joint[data-joint-id="' + targetJointId + '"] .joint-dot');
      [s, t].forEach(function (dot) {
        if (!dot) return;
        dot.classList.remove('pair-flash');
        void dot.offsetWidth;
        dot.classList.add('pair-flash');
      });
    }

    function upsertPair(sourceId, targetId) {
      userPairs = userPairs.filter(function (p) {
        return p.sourceId !== sourceId && p.targetId !== targetId;
      });
      userPairs.push({ sourceId: sourceId, targetId: targetId });
      applyPairedUi();
      flashPairDots(sourceId, targetId);
      renderPairsMessage();
    }

    function onJointClick(fig, jointId) {
      if (jointId === 'pelvis') return;
      if (fig === 'source') {
        activeFig = 'source';
        pendingJoint = jointId;
        clearSelectionUi();
        var node = sourceEl.querySelector('.joint[data-joint-id="' + jointId + '"] .joint-dot');
        if (node) node.setAttribute('data-selected', 'true');
        statusEl.textContent = 'Selected source: ' + jointId + '. Now pick the matching target joint.';
        return;
      }
      if (fig === 'target') {
        if (activeFig !== 'source' || !pendingJoint) {
          statusEl.textContent = 'Select a source joint first.';
          return;
        }
        upsertPair(pendingJoint, jointId);
        pendingJoint = null;
        activeFig = null;
        clearSelectionUi();
      }
    }

    function wireSvg(container) {
      container.addEventListener('click', function (ev) {
        var hit = ev.target && ev.target.closest && ev.target.closest('.bone-hit, .joint-dot');
        if (!hit) return;
        var joint = hit.closest('.joint');
        if (!joint) return;
        var id = joint.getAttribute('data-joint-id');
        if (!id) return;
        var fig = sourceEl.contains(joint) ? 'source' : 'target';
        onJointClick(fig, id);
      });
    }

    wireSvg(sourceEl);
    wireSvg(targetEl);

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        userPairs = [];
        activeFig = null;
        pendingJoint = null;
        clearSelectionUi();
        mount.querySelectorAll('.joint-dot').forEach(function (el) {
          el.removeAttribute('data-paired');
        });
        renderPairsMessage();
      });
    }

    if (checkBtn) {
      checkBtn.addEventListener('click', function () {
        var canonSet = {};
        CANONICAL_PAIRS.forEach(function (p) { canonSet[pairKey(p)] = true; });
        var userSet = {};
        userPairs.forEach(function (p) { userSet[pairKey(p)] = true; });
        var missing = CANONICAL_PAIRS.filter(function (p) { return !userSet[pairKey(p)]; }).length;
        var extra = userPairs.filter(function (p) { return !canonSet[pairKey(p)]; }).length;
        if (userPairs.length === 0) {
          statusEl.textContent = 'Map at least one pair before checking.';
          return;
        }
        if (missing === 0 && extra === 0) {
          statusEl.textContent = 'Mapping matches the tutorial reference: logical limbs and spine chains align 1:1.';
        } else {
          statusEl.textContent = 'Not quite: missing ' + missing + ' expected pair(s); ' + extra + ' unexpected pair(s). Try Reset and rebuild.';
        }
      });
    }

    renderPairsMessage();
  }

  // ─── EXISTING: Proportion demo ───────────────────────────────────────────

  /**
   * @param {HTMLElement} mount
   */
  function mountProportionDemo(mount) {
    var svgHost = mount.querySelector('[data-role="prop-svg"]');
    var slider = mount.querySelector('[data-role="leg-slider"]');
    var expl = mount.querySelector('[data-role="prop-explain"]');
    if (!svgHost || !(slider instanceof HTMLInputElement) || !expl) return;

    /** @type {{ thigh: SVGLineElement; shin: SVGLineElement; foot: SVGCircleElement }|null} */
    var legEls = null;

    function buildPropSvg(pelvis, spine, chest, head, rHip, rKnee, rFoot, groundY) {
      var parts = [];
      parts.push('<svg viewBox="0 0 180 295" class="bone-map-svg prop-demo-svg" role="img" aria-label="Leg length proportion demo">');
      parts.push('<line class="ground-line" x1="10" y1="' + groundY + '" x2="170" y2="' + groundY + '" stroke="currentColor" stroke-opacity="0.35" stroke-width="2"/>');
      parts.push('<g class="rig-sway prop-rig-sway">');
      parts.push(lineBetween(pelvis, spine));
      parts.push(lineBetween(spine, chest));
      parts.push(lineBetween(chest, head));
      parts.push('</g>');
      parts.push('<g class="prop-leg-group">');
      parts.push(lineBetween(pelvis, rHip));
      parts.push('<line class="bone-line" data-role="prop-thigh" stroke="currentColor" stroke-width="3" stroke-linecap="round" />');
      parts.push('<line class="bone-line" data-role="prop-shin" stroke="currentColor" stroke-width="3" stroke-linecap="round" />');
      parts.push('<circle class="foot-marker" cx="' + rFoot.x + '" cy="' + rFoot.y + '" r="6" fill="currentColor" opacity="0.45"/>');
      parts.push('</g>');
      parts.push('<text class="ground-label" x="115" y="' + (groundY - 8) + '" font-size="11" fill="currentColor" opacity="0.65">Ground plane</text>');
      parts.push('</svg>');
      return parts.join('');
    }

    function updateLegLines(rHip, rKnee, rFoot) {
      var thigh = legEls && legEls.thigh;
      var shin = legEls && legEls.shin;
      var foot = legEls && legEls.foot;
      if (!thigh || !shin || !foot) return;
      thigh.setAttribute('x1', String(rHip.x));
      thigh.setAttribute('y1', String(rHip.y));
      thigh.setAttribute('x2', String(rKnee.x));
      thigh.setAttribute('y2', String(rKnee.y));
      shin.setAttribute('x1', String(rKnee.x));
      shin.setAttribute('y1', String(rKnee.y));
      shin.setAttribute('x2', String(rFoot.x));
      shin.setAttribute('y2', String(rFoot.y));
      foot.setAttribute('cx', String(rFoot.x));
      foot.setAttribute('cy', String(rFoot.y));
    }

    function render(factor) {
      var pelvis = { x: 90, y: 175 };
      var spine = { x: 90, y: 130 };
      var chest = { x: 90, y: 95 };
      var head = { x: 90, y: 52 };
      var rHip = { x: 104, y: 182 };
      var rKnee = scaleAround(rHip, { x: 104, y: 235 }, 1, factor);
      var rFoot = scaleAround(rKnee, { x: 104, y: 278 }, 1, factor);
      var groundY = 285;

      if (!legEls) {
        svgHost.innerHTML = buildPropSvg(pelvis, spine, chest, head, rHip, rKnee, rFoot, groundY);
        var svg = svgHost.querySelector('svg');
        var thigh = svg && svg.querySelector('[data-role="prop-thigh"]');
        var shin = svg && svg.querySelector('[data-role="prop-shin"]');
        var foot = svg && svg.querySelector('.foot-marker');
        if (thigh instanceof SVGLineElement && shin instanceof SVGLineElement && foot instanceof SVGCircleElement) {
          legEls = { thigh: thigh, shin: shin, foot: foot };
          updateLegLines(rHip, rKnee, rFoot);
        }
      } else {
        updateLegLines(rHip, rKnee, rFoot);
      }

      var gap = groundY - rFoot.y;
      if (gap > 6) {
        expl.textContent = 'Longer legs leave the foot above the ground when translations are copied verbatim from a shorter source — typical foot-float until rotations are relative to bind pose or IK snaps contacts.';
      } else if (gap < -4) {
        expl.textContent = 'Shorter legs drive the foot through the ground — penetration until retarget rules strip translations or IK lifts the root.';
      } else {
        expl.textContent = 'Near contact: engines often solve this blend with rotation-centric retarget plus optional foot IK.';
      }
    }

    function onInput() {
      var min = 0.82, max = 1.28;
      var t = Number(slider.value) / 100;
      var factor = min + t * (max - min);
      slider.setAttribute('aria-valuenow', String(slider.value));
      render(factor);
    }

    slider.addEventListener('input', onInput);
    onInput();
  }

  // ─── NEW: Walk Cycle Retarget ────────────────────────────────────────────

  /**
   * Compute all joint world positions for a walk cycle skeleton.
   * Rotation angles are computed from time `t` (seconds) and then applied
   * identically to both source and target — only the bone LENGTHS differ,
   * demonstrating why foot positions diverge.
   *
   * @param {{ spine:number; chest:number; neck:number; upperArm:number; lowerArm:number;
   *           thigh:number; shin:number }} skel  Bone lengths
   * @param {number} t   Elapsed time in seconds
   * @param {number} [rootX]  X offset for root motion mode
   */
  function computeWalkPose(skel, t, rootX) {
    var freq = 1.1;
    var phase = 2 * Math.PI * freq * t;
    var cx = rootX != null ? rootX : 90;

    var hipSway = Math.sin(phase) * 3.5;
    var hipBob = Math.abs(Math.sin(phase)) * 3;

    var pelvis = { x: cx + hipSway, y: 155 - hipBob };
    var spine  = { x: pelvis.x,    y: pelvis.y - skel.spine };
    var chest  = { x: spine.x,     y: spine.y  - skel.chest };
    var neck   = { x: chest.x,     y: chest.y  - skel.neck  };
    var headC  = { x: neck.x,      y: neck.y   - 14 };

    var sW = 21;
    var lShoulder = { x: chest.x - sW, y: chest.y + 4 };
    var rShoulder = { x: chest.x + sW, y: chest.y + 4 };

    var armSwing = Math.sin(phase) * 20 * (Math.PI / 180);
    var lElbow = {
      x: lShoulder.x - skel.upperArm * Math.sin(armSwing),
      y: lShoulder.y + skel.upperArm * Math.cos(armSwing),
    };
    var rElbow = {
      x: rShoulder.x + skel.upperArm * Math.sin(-armSwing),
      y: rShoulder.y + skel.upperArm * Math.cos(-armSwing),
    };
    var lWrist = {
      x: lElbow.x - skel.lowerArm * Math.sin(armSwing + 0.12),
      y: lElbow.y + skel.lowerArm * Math.cos(armSwing + 0.12),
    };
    var rWrist = {
      x: rElbow.x + skel.lowerArm * Math.sin(-armSwing + 0.12),
      y: rElbow.y + skel.lowerArm * Math.cos(-armSwing + 0.12),
    };

    var hipW = 12;
    var lHip = { x: pelvis.x - hipW, y: pelvis.y + 7 };
    var rHip = { x: pelvis.x + hipW, y: pelvis.y + 7 };

    var legSwing = 26 * (Math.PI / 180);
    var lThighA = Math.sin(phase) * legSwing;
    var rThighA = -Math.sin(phase) * legSwing;
    var lShinBend = Math.max(0, -Math.sin(phase)) * 32 * (Math.PI / 180);
    var rShinBend = Math.max(0, Math.sin(phase)) * 32 * (Math.PI / 180);

    var lKnee = {
      x: lHip.x + skel.thigh * Math.sin(lThighA),
      y: lHip.y + skel.thigh * Math.cos(lThighA),
    };
    var rKnee = {
      x: rHip.x + skel.thigh * Math.sin(rThighA),
      y: rHip.y + skel.thigh * Math.cos(rThighA),
    };
    var lAnkle = {
      x: lKnee.x + skel.shin * Math.sin(lThighA + lShinBend),
      y: lKnee.y + skel.shin * Math.cos(lThighA + lShinBend),
    };
    var rAnkle = {
      x: rKnee.x + skel.shin * Math.sin(rThighA - rShinBend),
      y: rKnee.y + skel.shin * Math.cos(rThighA - rShinBend),
    };

    return {
      pelvis: pelvis, spine: spine, chest: chest, neck: neck, headC: headC,
      lShoulder: lShoulder, rShoulder: rShoulder,
      lElbow: lElbow, rElbow: rElbow, lWrist: lWrist, rWrist: rWrist,
      lHip: lHip, rHip: rHip, lKnee: lKnee, rKnee: rKnee, lAnkle: lAnkle, rAnkle: rAnkle,
    };
  }

  /**
   * Render a full skeleton pose to an SVG string.
   * @param {ReturnType<typeof computeWalkPose>} j  Joint positions
   * @param {number} W  ViewBox width
   * @param {number} H  ViewBox height
   * @param {number} groundY  Ground line Y coordinate
   * @param {string} [footHighlight]  CSS color for foot markers
   */
  function renderWalkSvg(j, W, H, groundY, footHighlight) {
    var parts = [];
    parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="walk-svg" aria-hidden="true">');

    // Ground
    parts.push('<line x1="5" y1="' + groundY + '" x2="' + (W - 5) + '" y2="' + groundY + '" stroke="currentColor" stroke-opacity="0.2" stroke-width="1.5"/>');

    // Back limbs (drawn first so they appear behind)
    parts.push(svgLine(j.rHip, j.rKnee, 2, ' opacity="0.45"'));
    parts.push(svgLine(j.rKnee, j.rAnkle, 2, ' opacity="0.45"'));
    parts.push(svgLine(j.rShoulder, j.rElbow, 2, ' opacity="0.45"'));
    parts.push(svgLine(j.rElbow, j.rWrist, 2, ' opacity="0.45"'));

    // Torso chain
    parts.push(svgLine(j.lHip, j.pelvis, 2.5));
    parts.push(svgLine(j.pelvis, j.rHip, 2.5));
    parts.push(svgLine(j.pelvis, j.spine, 2.5));
    parts.push(svgLine(j.spine, j.chest, 2.5));
    parts.push(svgLine(j.lShoulder, j.chest, 2.5));
    parts.push(svgLine(j.chest, j.rShoulder, 2.5));
    parts.push(svgLine(j.chest, j.neck, 2.5));

    // Head
    parts.push(svgCircle(j.headC.x, j.headC.y, 11, 'fill="none" stroke="currentColor" stroke-width="2.5"'));
    parts.push(svgLine(j.neck, j.headC, 2.5));

    // Front limbs
    parts.push(svgLine(j.lHip, j.lKnee, 2.5));
    parts.push(svgLine(j.lKnee, j.lAnkle, 2.5));
    parts.push(svgLine(j.lShoulder, j.lElbow, 2.5));
    parts.push(svgLine(j.lElbow, j.lWrist, 2.5));

    // Foot markers
    var footFill = footHighlight ? 'fill="' + footHighlight + '" opacity="0.85"' : 'fill="currentColor" opacity="0.55"';
    parts.push(svgCircle(j.lAnkle.x, j.lAnkle.y, 4, footFill));
    parts.push(svgCircle(j.rAnkle.x, j.rAnkle.y, 4, 'fill="currentColor" opacity="0.3"'));

    parts.push('</svg>');
    return parts.join('');
  }

  /**
   * @param {HTMLElement} mount
   */
  function mountWalkCycle(mount) {
    var srcHost = mount.querySelector('[data-role="wc-source"]');
    var tgtHost = mount.querySelector('[data-role="wc-target"]');
    var playBtn = mount.querySelector('[data-action="wc-play"]');
    var speedSel = mount.querySelector('[data-role="wc-speed"]');
    var statusEl = mount.querySelector('[data-role="wc-status"]');
    if (!srcHost || !tgtHost) return;

    var SOURCE_SKEL = { spine: 33, chest: 22, neck: 14, upperArm: 27, lowerArm: 24, thigh: 50, shin: 48 };
    var TARGET_SKEL = { spine: 33, chest: 22, neck: 14, upperArm: 32, lowerArm: 28, thigh: 37, shin: 35 };

    var W = 180, H = 220, GROUND_Y = 207;
    var isPlaying = false;
    var rafId = null;
    var startTime = null;
    var speed = 1.0;

    function tick(ts) {
      if (!startTime) startTime = ts;
      var elapsed = ((ts - startTime) / 1000) * speed;
      var srcPose = computeWalkPose(SOURCE_SKEL, elapsed);
      var tgtPose = computeWalkPose(TARGET_SKEL, elapsed);
      srcHost.innerHTML = renderWalkSvg(srcPose, W, H, GROUND_Y, null);
      tgtHost.innerHTML = renderWalkSvg(tgtPose, W, H, GROUND_Y, 'LinkText');

      // Show whether target foot is above/below ground
      if (statusEl) {
        var footY = tgtPose.lAnkle.y;
        var gap = (GROUND_Y - footY).toFixed(0);
        if (footY < GROUND_Y - 3) {
          statusEl.textContent = 'Target foot is ' + gap + 'px above the ground (float). Same rotations, shorter legs.';
        } else if (footY > GROUND_Y + 3) {
          statusEl.textContent = 'Target foot is ' + Math.abs(Number(gap)) + 'px below the ground (penetration).';
        } else {
          statusEl.textContent = 'Target foot near ground — close match this frame.';
        }
      }

      if (isPlaying) rafId = requestAnimationFrame(tick);
    }

    function play() {
      if (isPlaying) return;
      isPlaying = true;
      startTime = null;
      if (playBtn) { playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true'); }
      rafId = requestAnimationFrame(tick);
    }

    function pause() {
      isPlaying = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (playBtn) { playBtn.textContent = 'Play'; playBtn.setAttribute('aria-pressed', 'false'); }
    }

    if (playBtn) {
      playBtn.setAttribute('aria-pressed', 'false');
      playBtn.addEventListener('click', function () {
        if (isPlaying) pause(); else play();
      });
    }

    if (speedSel) {
      speedSel.addEventListener('change', function () {
        speed = Number(speedSel.value) || 1;
        if (isPlaying) { pause(); play(); }
      });
    }

    play();
  }

  // ─── NEW: Bind Pose Mismatch Visualizer ──────────────────────────────────

  /**
   * Renders a simplified arm diagram (shoulder → elbow → wrist) for
   * the bind pose mismatch demo.
   *
   * Angles are in degrees from +X axis (clockwise = more downward in SVG).
   *
   * @param {number} srcAngle  Source arm angle (degrees from +X)
   * @param {number} tgtAngle  Target arm angle (degrees from +X)
   * @param {string} [note]    Optional annotation text
   */
  function renderArmDiagram(srcAngle, tgtAngle, note) {
    var W = 300, H = 170;
    var upperLen = 52, foreLen = 40;
    var srcShoulder = { x: 70, y: 75 };
    var tgtShoulder = { x: 210, y: 75 };

    function arm(shoulder, deg) {
      var rad = deg * (Math.PI / 180);
      var elbow = {
        x: shoulder.x + upperLen * Math.cos(rad),
        y: shoulder.y + upperLen * Math.sin(rad),
      };
      var wrist = {
        x: elbow.x + foreLen * Math.cos(rad),
        y: elbow.y + foreLen * Math.sin(rad),
      };
      return [
        svgCircle(shoulder.x, shoulder.y, 6),
        svgLine(shoulder, elbow, 3.5),
        svgCircle(elbow.x, elbow.y, 5),
        svgLine(elbow, wrist, 3),
        svgCircle(wrist.x, wrist.y, 4, 'fill="currentColor" opacity="0.5"'),
      ].join('');
    }

    // Reference horizontal line (bind pose indicator)
    function horizRef(shoulder, bindDeg) {
      var rad = bindDeg * (Math.PI / 180);
      var tip = {
        x: shoulder.x + (upperLen + foreLen + 4) * Math.cos(rad),
        y: shoulder.y + (upperLen + foreLen + 4) * Math.sin(rad),
      };
      return '<line x1="' + shoulder.x + '" y1="' + shoulder.y + '" x2="' + tip.x.toFixed(1) + '" y2="' + tip.y.toFixed(1) + '" stroke="currentColor" stroke-opacity="0.18" stroke-width="1.5" stroke-dasharray="3 4"/>';
    }

    var parts = [];
    parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="arm-demo-svg" aria-label="Arm bind pose comparison">');

    // Bind reference guides
    parts.push(horizRef(srcShoulder, 0));   // T-pose ref (horizontal)
    parts.push(horizRef(tgtShoulder, 30));  // A-pose ref (30° below horizontal)

    // Arms
    parts.push(arm(srcShoulder, srcAngle));
    parts.push(arm(tgtShoulder, tgtAngle));

    // Labels
    parts.push(svgText(30, 155, 'Source (T-pose bind)'));
    parts.push(svgText(172, 155, 'Target (A-pose bind)'));

    // Vertical center divider
    parts.push('<line x1="150" y1="10" x2="150" y2="160" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>');

    if (note) {
      parts.push('<text x="' + (W / 2) + '" y="18" font-size="10.5" fill="currentColor" opacity="0.65" text-anchor="middle">' + note + '</text>');
    }

    parts.push('</svg>');
    return parts.join('');
  }

  /**
   * @param {HTMLElement} mount
   */
  function mountBindPoseMismatch(mount) {
    var svgHost = mount.querySelector('[data-role="bpm-svg"]');
    var statusEl = mount.querySelector('[data-role="bpm-status"]');
    var buttons = mount.querySelectorAll('[data-bpm-state]');
    if (!svgHost) return;

    // Source: T-pose (arm at 0° = horizontal right)
    // Target: A-pose (arm at 30° = slightly below horizontal)
    var SRC_BIND = 0;
    var TGT_BIND = 30;
    var ANIM_DELTA = -55; // raise arm 55° upward

    var states = {
      bindpose: {
        srcAngle: SRC_BIND,
        tgtAngle: TGT_BIND,
        note: 'Bind poses only — source is T-pose, target is A-pose (30\u00b0 difference)',
        msg: 'Both skeletons shown in their bind (reference) poses. The 30\u00b0 difference is the root cause of mismatch.',
      },
      naive: {
        srcAngle: SRC_BIND + ANIM_DELTA,
        tgtAngle: SRC_BIND + ANIM_DELTA, // copy absolute angle — ignores bind difference
        note: 'Naive copy: same absolute angle on both. Target arm overshoots.',
        msg: 'Naive copy applies the source\'s final angle (' + (SRC_BIND + ANIM_DELTA) + '\u00b0) to the target. The target arm raises 85\u00b0 instead of 55\u00b0 — overshooting because its bind is 30\u00b0 lower.',
      },
      corrected: {
        srcAngle: SRC_BIND + ANIM_DELTA,
        tgtAngle: TGT_BIND + ANIM_DELTA, // apply delta from target's own bind
        note: 'With correction: delta applied from target\u2019s own bind pose.',
        msg: 'Correction: extract the motion delta (' + ANIM_DELTA + '\u00b0) from the source bind, apply it from the target bind (' + TGT_BIND + '\u00b0 + ' + ANIM_DELTA + '\u00b0 = ' + (TGT_BIND + ANIM_DELTA) + '\u00b0). Both arms raise by the same amount.',
      },
    };

    var currentState = 'bindpose';

    function render(state) {
      var s = states[state];
      svgHost.innerHTML = renderArmDiagram(s.srcAngle, s.tgtAngle, s.note);
      if (statusEl) statusEl.textContent = s.msg;
      buttons.forEach(function (btn) {
        var active = btn.getAttribute('data-bpm-state') === state;
        btn.setAttribute('aria-current', active ? 'true' : 'false');
        if (active) btn.classList.add('active-step');
        else btn.classList.remove('active-step');
      });
      currentState = state;
    }

    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-bpm-state');
        if (next) render(next);
      });
    });

    render('bindpose');
  }

  // ─── NEW: IK Foot Plant Demo ─────────────────────────────────────────────

  /**
   * @param {HTMLElement} mount
   */
  function mountIKDemo(mount) {
    var svgHost   = mount.querySelector('[data-role="ik-svg"]');
    var slider    = mount.querySelector('[data-role="ik-ground-slider"]');
    var toggleBtn = mount.querySelector('[data-action="ik-toggle"]');
    var statusEl  = mount.querySelector('[data-role="ik-status"]');
    if (!svgHost || !(slider instanceof HTMLInputElement)) return;

    var W = 220, H = 240;
    var L1 = 58, L2 = 54; // thigh, shin
    var hipX = 110, hipY = 68;
    var ikActive = false;

    // FK pose: fixed thigh/shin angles (slight forward lean, knee bent)
    var FK_THIGH_RAD = 0.22;  // slight forward lean
    var FK_SHIN_RAD  = 0.55;  // knee bent

    function fkKnee() {
      return {
        x: hipX + L1 * Math.sin(FK_THIGH_RAD),
        y: hipY + L1 * Math.cos(FK_THIGH_RAD),
      };
    }

    function fkFoot() {
      var knee = fkKnee();
      return {
        x: knee.x + L2 * Math.sin(FK_THIGH_RAD + FK_SHIN_RAD),
        y: knee.y + L2 * Math.cos(FK_THIGH_RAD + FK_SHIN_RAD),
      };
    }

    function render(groundY) {
      var parts = [];
      parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="ik-demo-svg" aria-label="IK foot plant demo">');

      // Terrain
      parts.push('<rect x="0" y="' + groundY + '" width="' + W + '" height="' + (H - groundY) + '" fill="currentColor" opacity="0.06"/>');
      parts.push('<line x1="0" y1="' + groundY + '" x2="' + W + '" y2="' + groundY + '" stroke="currentColor" stroke-opacity="0.5" stroke-width="1.5"/>');
      parts.push('<text x="8" y="' + (groundY - 5) + '" font-size="10" fill="currentColor" opacity="0.55">Terrain</text>');

      var knee, foot, reachable;

      if (ikActive) {
        // IK: foot snaps to ground, knee adjusts
        var footTarget = { x: hipX + 14, y: groundY };
        var ik = solveIK2Bone({ x: hipX, y: hipY }, footTarget, L1, L2, true);
        knee = ik.knee;
        foot = ik.foot;
        reachable = ik.reachable;
      } else {
        // FK: fixed pose, foot may float or sink
        knee = fkKnee();
        foot = fkFoot();
        reachable = true;
      }

      var hip = { x: hipX, y: hipY };

      // Hip pin
      parts.push(svgCircle(hip.x, hip.y, 8, 'fill="currentColor" opacity="0.15" stroke="currentColor" stroke-width="1.5"'));
      parts.push(svgText(hip.x + 10, hip.y + 4, 'Hip'));

      // Bones
      var boneColor = ikActive ? 'stroke="LinkText"' : '';
      parts.push('<line x1="' + hip.x.toFixed(1) + '" y1="' + hip.y.toFixed(1) + '" x2="' + knee.x.toFixed(1) + '" y2="' + knee.y.toFixed(1) + '" stroke="currentColor" stroke-width="4" stroke-linecap="round" ' + boneColor + '/>');
      parts.push('<line x1="' + knee.x.toFixed(1) + '" y1="' + knee.y.toFixed(1) + '" x2="' + foot.x.toFixed(1) + '" y2="' + foot.y.toFixed(1) + '" stroke="currentColor" stroke-width="4" stroke-linecap="round" ' + boneColor + '/>');

      // Joints
      parts.push(svgCircle(hip.x, hip.y, 7));
      parts.push(svgCircle(knee.x, knee.y, 6));
      parts.push(svgText(knee.x + 8, knee.y + 4, 'Knee'));

      // Foot marker
      var footPenetrating = foot.y > groundY + 2;
      var footFloating    = foot.y < groundY - 2;
      var footFill = ikActive ? 'fill="LinkText"' :
        footPenetrating ? 'fill="currentColor" opacity="0.8"' :
        footFloating    ? 'fill="currentColor" opacity="0.5"' :
                          'fill="currentColor"';
      parts.push(svgCircle(foot.x, foot.y, 7, footFill));
      parts.push(svgText(foot.x + 9, foot.y + 4, 'Ankle'));

      // Ghost FK foot when IK is on
      if (ikActive) {
        var fk = fkFoot();
        parts.push(svgCircle(fk.x, fk.y, 5, 'fill="currentColor" opacity="0.22"'));
        parts.push('<line x1="' + fk.x.toFixed(1) + '" y1="' + fk.y.toFixed(1) + '" x2="' + foot.x.toFixed(1) + '" y2="' + foot.y.toFixed(1) + '" stroke="currentColor" stroke-opacity="0.2" stroke-width="1" stroke-dasharray="3 3"/>');
      }

      // Foot-to-ground gap indicator (FK only)
      if (!ikActive && Math.abs(foot.y - groundY) > 2) {
        var gapColor = footPenetrating ? 'stroke="currentColor" stroke-opacity="0.55"' : 'stroke="currentColor" stroke-opacity="0.4"';
        parts.push('<line x1="' + (foot.x + 12).toFixed(1) + '" y1="' + foot.y.toFixed(1) + '" x2="' + (foot.x + 12).toFixed(1) + '" y2="' + groundY + '" ' + gapColor + ' stroke-width="1.5" stroke-dasharray="2 3"/>');
        var gapPx = Math.abs(foot.y - groundY).toFixed(0);
        parts.push(svgText(foot.x + 15, (foot.y + groundY) / 2 + 4, gapPx + 'px gap'));
      }

      if (!reachable) {
        parts.push(svgText(10, H - 14, 'Leg fully extended — target out of reach'));
      }

      parts.push('</svg>');
      svgHost.innerHTML = parts.join('');

      if (statusEl) {
        if (ikActive) {
          statusEl.textContent = 'IK active: the solver positions the knee so the ankle lands exactly on the terrain.';
        } else {
          var fkFt = fkFoot();
          var diff = (fkFt.y - groundY).toFixed(1);
          if (fkFt.y < groundY - 2) {
            statusEl.textContent = 'FK only: foot floats ' + Math.abs(Number(diff)) + 'px above terrain. Lower the slider to see penetration.';
          } else if (fkFt.y > groundY + 2) {
            statusEl.textContent = 'FK only: foot sinks ' + diff + 'px into terrain. Raise the slider or enable IK to correct.';
          } else {
            statusEl.textContent = 'FK only: foot is near the terrain surface — no correction needed at this height.';
          }
        }
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        ikActive = !ikActive;
        toggleBtn.textContent = ikActive ? 'Switch to FK only' : 'Enable IK correction';
        toggleBtn.setAttribute('aria-pressed', String(ikActive));
        render(Number(slider.value));
      });
    }

    slider.addEventListener('input', function () {
      render(Number(slider.value));
    });

    render(Number(slider.value));
  }

  // ─── NEW: Root Motion vs In-Place ───────────────────────────────────────

  /**
   * @param {HTMLElement} mount
   */
  function mountRootMotion(mount) {
    var svgHost  = mount.querySelector('[data-role="rm-svg"]');
    var playBtn  = mount.querySelector('[data-action="rm-play"]');
    var modeBtn  = mount.querySelector('[data-action="rm-mode"]');
    var statusEl = mount.querySelector('[data-role="rm-status"]');
    if (!svgHost) return;

    var W = 520, H = 180;
    var GROUND_Y = 165;
    var SKEL = { spine: 28, chest: 19, neck: 12, upperArm: 22, lowerArm: 20, thigh: 42, shin: 40 };

    var isPlaying = false;
    var rootMotion = false;
    var rafId = null;
    var startTime = null;

    function getRootX(t) {
      if (!rootMotion) return 90;
      // Character walks from x=30 to x=490 over ~4 seconds, then wraps
      var cycleW = 460;
      var speed  = cycleW / 4.0;
      return 30 + ((t * speed) % cycleW);
    }

    function tick(ts) {
      if (!startTime) startTime = ts;
      var elapsed = (ts - startTime) / 1000;
      var rootX = getRootX(elapsed);
      var pose  = computeWalkPose(SKEL, elapsed, rootX);

      var parts = [];
      parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="rm-svg" aria-hidden="true">');

      // Ground
      parts.push('<line x1="0" y1="' + GROUND_Y + '" x2="' + W + '" y2="' + GROUND_Y + '" stroke="currentColor" stroke-opacity="0.25" stroke-width="1.5"/>');

      // Root motion trail dots
      if (rootMotion) {
        var elapsed2 = (ts - startTime) / 1000;
        for (var i = 1; i <= 5; i++) {
          var trailT = elapsed2 - i * 0.15;
          if (trailT < 0) continue;
          var trailX = getRootX(trailT);
          parts.push('<circle cx="' + trailX.toFixed(1) + '" cy="' + (GROUND_Y - 3) + '" r="2.5" fill="currentColor" opacity="' + (0.04 * (6 - i)) + '"/>');
        }
      }

      // Skeleton
      var j = pose;
      // Back limbs
      parts.push(svgLine(j.rHip, j.rKnee, 2, ' opacity="0.35"'));
      parts.push(svgLine(j.rKnee, j.rAnkle, 2, ' opacity="0.35"'));
      parts.push(svgLine(j.rShoulder, j.rElbow, 2, ' opacity="0.35"'));
      parts.push(svgLine(j.rElbow, j.rWrist, 2, ' opacity="0.35"'));
      // Torso
      parts.push(svgLine(j.lHip, j.pelvis, 2.5));
      parts.push(svgLine(j.pelvis, j.rHip, 2.5));
      parts.push(svgLine(j.pelvis, j.spine, 2.5));
      parts.push(svgLine(j.spine, j.chest, 2.5));
      parts.push(svgLine(j.lShoulder, j.chest, 2.5));
      parts.push(svgLine(j.chest, j.rShoulder, 2.5));
      parts.push(svgLine(j.chest, j.neck, 2.5));
      // Head
      parts.push(svgCircle(j.headC.x, j.headC.y, 9, 'fill="none" stroke="currentColor" stroke-width="2.5"'));
      parts.push(svgLine(j.neck, j.headC, 2.5));
      // Front limbs
      parts.push(svgLine(j.lHip, j.lKnee, 2.5));
      parts.push(svgLine(j.lKnee, j.lAnkle, 2.5));
      parts.push(svgLine(j.lShoulder, j.lElbow, 2.5));
      parts.push(svgLine(j.lElbow, j.lWrist, 2.5));

      // Root bone indicator (pelvis)
      parts.push('<circle cx="' + j.pelvis.x.toFixed(1) + '" cy="' + j.pelvis.y.toFixed(1) + '" r="4" fill="LinkText" opacity="0.85"/>');

      // "Root" label
      if (rootMotion) {
        parts.push(svgText(j.pelvis.x - 12, j.pelvis.y - 10, 'root', ' font-size="9" opacity="0.6"'));
      }

      // In-place center line
      if (!rootMotion) {
        parts.push('<line x1="90" y1="10" x2="90" y2="' + (GROUND_Y - 2) + '" stroke="currentColor" stroke-opacity="0.12" stroke-width="1" stroke-dasharray="3 4"/>');
      }

      parts.push('</svg>');
      svgHost.innerHTML = parts.join('');

      if (statusEl) {
        statusEl.textContent = rootMotion
          ? 'Root motion: the pelvis (blue dot) drives world translation. Character travels along the ground.'
          : 'In-place: pelvis stays centered. Gameplay code drives velocity; feet cycle without world movement.';
      }

      if (isPlaying) rafId = requestAnimationFrame(tick);
    }

    function play() {
      if (isPlaying) return;
      isPlaying = true;
      startTime = null;
      if (playBtn) { playBtn.textContent = 'Pause'; playBtn.setAttribute('aria-pressed', 'true'); }
      rafId = requestAnimationFrame(tick);
    }

    function pause() {
      isPlaying = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
      if (playBtn) { playBtn.textContent = 'Play'; playBtn.setAttribute('aria-pressed', 'false'); }
    }

    if (playBtn) {
      playBtn.setAttribute('aria-pressed', 'false');
      playBtn.addEventListener('click', function () { if (isPlaying) pause(); else play(); });
    }

    if (modeBtn) {
      modeBtn.addEventListener('click', function () {
        rootMotion = !rootMotion;
        modeBtn.textContent = rootMotion ? 'Switch to in-place' : 'Switch to root motion';
        modeBtn.setAttribute('aria-pressed', String(rootMotion));
        if (isPlaying) { pause(); play(); }
        else { startTime = null; }
      });
    }

    play();
  }

  // ─── NEW: Spine Distribution ─────────────────────────────────────────────

  /**
   * Compute a bent spine chain (all bones curl forward) starting at a base point.
   * @param {number} totalBendDeg   Total forward bend in degrees
   * @param {number} boneCount      Number of bones in chain
   * @param {{ x: number; y: number }} basePos  Base joint world position
   * @param {number} boneLen        Length of each bone
   * @returns {{ x: number; y: number }[]}  Joint positions (boneCount + 1 points)
   */
  function computeSpineChain(totalBendDeg, boneCount, basePos, boneLen) {
    var perBoneDeg = boneCount > 0 ? totalBendDeg / boneCount : 0;
    var points = [{ x: basePos.x, y: basePos.y }];
    var angle = 270; // pointing upward (in SVG, -90°)
    for (var i = 0; i < boneCount; i++) {
      angle += perBoneDeg; // each bone bends forward
      var rad = angle * (Math.PI / 180);
      var last = points[points.length - 1];
      points.push({
        x: last.x + boneLen * Math.cos(rad),
        y: last.y + boneLen * Math.sin(rad),
      });
    }
    return points;
  }

  /**
   * @param {HTMLElement} mount
   */
  function mountSpineDist(mount) {
    var svgHost  = mount.querySelector('[data-role="spine-svg"]');
    var slider   = mount.querySelector('[data-role="spine-slider"]');
    var statusEl = mount.querySelector('[data-role="spine-status"]');
    if (!svgHost || !(slider instanceof HTMLInputElement)) return;

    var W = 320, H = 220;
    var BONE_LEN_3 = 38;  // source: 3 bones
    var BONE_LEN_5 = 23;  // target: 5 bones (same total height)
    var SRC_X  = 80,  SRC_BASE_Y  = 195;
    var TGT3_X = 160, TGT3_BASE_Y = 195;
    var TGT5_X = 240, TGT5_BASE_Y = 195;

    function renderChain(points, cx, label, accent) {
      var parts = [];
      for (var i = 0; i < points.length - 1; i++) {
        var stroke = accent ? 'stroke="LinkText" stroke-opacity="0.85"' : 'stroke="currentColor"';
        parts.push('<line x1="' + points[i].x.toFixed(1) + '" y1="' + points[i].y.toFixed(1) + '" x2="' + points[i + 1].x.toFixed(1) + '" y2="' + points[i + 1].y.toFixed(1) + '" ' + stroke + ' stroke-width="3.5" stroke-linecap="round"/>');
        var fill = accent ? 'fill="LinkText" opacity="0.75"' : 'fill="currentColor" opacity="0.65"';
        parts.push('<circle cx="' + points[i].x.toFixed(1) + '" cy="' + points[i].y.toFixed(1) + '" r="4.5" ' + fill + '/>');
      }
      // Top joint
      var last = points[points.length - 1];
      var fill2 = accent ? 'fill="LinkText" opacity="0.75"' : 'fill="currentColor" opacity="0.65"';
      parts.push('<circle cx="' + last.x.toFixed(1) + '" cy="' + last.y.toFixed(1) + '" r="4.5" ' + fill2 + '/>');
      // Label
      parts.push(svgText(cx - 12, H - 4, label));
      return parts.join('');
    }

    function render(totalBendDeg) {
      var src3  = computeSpineChain(totalBendDeg, 3, { x: SRC_X,  y: SRC_BASE_Y  }, BONE_LEN_3);
      var tgt3  = computeSpineChain(totalBendDeg, 3, { x: TGT3_X, y: TGT3_BASE_Y }, BONE_LEN_3);
      var tgt5  = computeSpineChain(totalBendDeg, 5, { x: TGT5_X, y: TGT5_BASE_Y }, BONE_LEN_5);

      var parts = [];
      parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" class="spine-svg" aria-label="Spine distribution demo">');

      // Base ground indicator
      parts.push('<line x1="10" y1="197" x2="' + (W - 10) + '" y2="197" stroke="currentColor" stroke-opacity="0.12" stroke-width="1"/>');

      // Column dividers
      parts.push('<line x1="120" y1="10" x2="120" y2="' + (H - 20) + '" stroke="currentColor" stroke-opacity="0.1" stroke-width="1"/>');
      parts.push('<line x1="200" y1="10" x2="200" y2="' + (H - 20) + '" stroke="currentColor" stroke-opacity="0.1" stroke-width="1"/>');

      // Column headers
      parts.push(svgText(SRC_X - 22,  14, 'Source (3 bones)'));
      parts.push(svgText(TGT3_X - 24, 14, 'Target (3 bones)'));
      parts.push(svgText(TGT5_X - 22, 14, 'Target (5 bones)'));

      parts.push(renderChain(src3, SRC_X, '', false));
      parts.push(renderChain(tgt3, TGT3_X, '', false));
      parts.push(renderChain(tgt5, TGT5_X, '', true)); // highlight 5-bone

      // Per-bone rotation callout
      var perBone3 = totalBendDeg / 3;
      var perBone5 = totalBendDeg / 5;
      parts.push(svgText(SRC_X  - 22, H - 18, perBone3.toFixed(1) + '\u00b0 / bone'));
      parts.push(svgText(TGT3_X - 20, H - 18, perBone3.toFixed(1) + '\u00b0 / bone'));
      parts.push(svgText(TGT5_X - 16, H - 18, perBone5.toFixed(1) + '\u00b0 / bone'));

      parts.push('</svg>');
      svgHost.innerHTML = parts.join('');

      if (statusEl) {
        statusEl.textContent =
          'Total bend: ' + totalBendDeg + '\u00b0. Distributed as ' +
          perBone3.toFixed(1) + '\u00b0 per bone on the 3-bone chain vs ' +
          perBone5.toFixed(1) + '\u00b0 per bone on the 5-bone chain. ' +
          'Both chains reach the same total arc — the 5-bone chain is smoother.';
      }
    }

    slider.addEventListener('input', function () {
      render(Number(slider.value));
    });

    render(Number(slider.value));
  }

  // ─── Exports ─────────────────────────────────────────────────────────────

  root.RetargetInteractives = {
    CANONICAL_PAIRS: CANONICAL_PAIRS,
    // existing
    mountBoneMap: mountBoneMap,
    mountProportionDemo: mountProportionDemo,
    // new
    mountWalkCycle: mountWalkCycle,
    mountBindPoseMismatch: mountBindPoseMismatch,
    mountIKDemo: mountIKDemo,
    mountRootMotion: mountRootMotion,
    mountSpineDist: mountSpineDist,
    // pure helpers
    scaleAround: scaleAround,
    solveIK2Bone: solveIK2Bone,
    distributeRotation: distributeRotation,
    computeWalkPose: computeWalkPose,
    computeSpineChain: computeSpineChain,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
