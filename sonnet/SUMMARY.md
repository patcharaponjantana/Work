# MediaPipe → Unreal Engine Demo — Project Summary

## What this project is

A browser-only interactive demo (`mediapipe-ue.html`) that:

1. Streams the webcam through **MediaPipe Pose** and **MediaPipe Hands** in realtime.
2. Visualises the detected skeleton live in the **left panel** (2D webcam canvas).
3. Drives a **3D stick-figure character** in the **right panel** using Forward Kinematics (FK).
4. Tracks a **sword held in the right hand** and shows it in the 3D view.
5. Detects **combat actions** (block, slash, rise) from pose landmarks alone.

---

## Files


| File                     | Purpose                                                |
| ------------------------ | ------------------------------------------------------ |
| `mediapipe-ue.html`      | Main demo — all UI, webcam loop, rendering             |
| `mediapipe-ue.js`        | Pure math helpers (no DOM, testable in Node / browser) |
| `mediapipe-ue.test.mjs`  | Node `--test` unit tests for `mediapipe-ue.js`         |
| `mediapipe-ue.test.html` | Browser test runner (mirrors `.mjs`, no Node needed)   |
| `index.html`             | Landing page linking to the demo                       |


---

## Coordinate systems


| Space                        | X                      | Y                   | Z                    |
| ---------------------------- | ---------------------- | ------------------- | -------------------- |
| MediaPipe normalised (image) | 0 = left, 1 = right    | 0 = top, 1 = bottom | depth (neg = closer) |
| MediaPipe world              | metres, mid-hip origin | up = +Y             | forward = +Z         |
| Body space (FK)              | right                  | up                  | forward              |
| Unreal Engine                | forward                | right               | up                   |


The demo displays video **mirrored** (selfie view), so `display_x = 1 − mp.x`.

---

## Key landmarks used

```
MediaPipe Pose (33 landmarks, 0-indexed)
  0  Nose          11 L-Shoulder   12 R-Shoulder
  13 L-Elbow       14 R-Elbow      15 L-Wrist     16 R-Wrist
  23 L-Hip         24 R-Hip        25 L-Knee       26 R-Knee
  27 L-Ankle       28 R-Ankle
  18 R-Pinky       20 R-Index      22 R-Thumb   (hand orientation debug)

MediaPipe Hands (21 landmarks, 0-indexed)
   0 Wrist
   5 Index MCP    17 Pinky MCP    ← direction of sword = lm[17]→lm[5]
   9 Middle MCP   13 Ring MCP
```

---

## 3D panel — how FK works

```
pelvis (mid-hip)
  ├─ spine → mid-shoulder → neck → head
  ├─ L-shoulder → L-elbow → L-wrist
  └─ R-shoulder → R-elbow → R-wrist → sword tip
        ↑
        weaponDir3D (from MediaPipe Hands lm[17]→lm[5], body-space)
```

Each joint's world position is `parent_pos + rotate(bone_vec, euler_angles)`.  
The camera supports **orbit** (drag) and **zoom** (mouse wheel).

---

## Sword / weapon direction

- Source: MediaPipe Hands world landmarks.
- Direction: `lm[17]` (pinky MCP) → `lm[5]` (index MCP), normalised.
- Coordinate flip to body space: `y → −y`, `z → −z`.
- **No filtering** — raw realtime value, updated every frame the hand is detected.
- Falls back to a 2D image-space direction (wrist → knuckle centre) when world lm unavailable.
- Wrist roll (`wristTwist.deg`) is derived from the palm normal relative to the forearm axis.

---

## Combat action detection (pose-only, no hand model)

Implemented in `mediapipe-ue.js` (pure, testable) and wired in the HTML:

### `detectBlockPose(lm) → boolean`

Both wrists must be:

- below shoulder level (y > shoulder.y − 0.04)
- above hip level (y < hip.y)
- within 1.1 × shoulder-width from the body centre

### `computeSwingVector(hist) → {dx, dy, speed} | null`

- `hist` = ring buffer of `{x, y}` right-wrist positions (MP normalised), newest last.
- Compares oldest quarter vs newest quarter to compute average displacement.
- Returns in **display space** (`dx = −mp_dx` because of mirror).

### Classification in the HTML (inside `detectGestureAction`)


| Condition                                       | Action                |
| ----------------------------------------------- | --------------------- |
| `detectBlockPose` = true                        | `block` — blue badge  |
| `sv.dx < −0.05 && sv.dy > 0.05 && speed > 0.10` | `slash ↘` — red badge |
| `sv.dx > 0.05 && sv.dy < −0.05 && speed > 0.10` | `rise ↗` — gold badge |


A **wrist trail** (amber line, fades toward the oldest point) is drawn on the webcam canvas to visualise the swing arc.

---

## Visual overlays (left panel — webcam canvas)


| Overlay        | What it shows                                                                   |
| -------------- | ------------------------------------------------------------------------------- |
| Pose skeleton  | Full 33-landmark stick figure                                                   |
| lm 16/18/20/22 | Right wrist, pinky, index, thumb — coloured dots + labels                       |
| Hand landmarks | 21-point hand skeleton; lm[5] and lm[17] highlighted in orange with dashed line |
| Wrist twist    | `Twist Xdeg` label near lm[16]                                                  |
| Wrist trail    | Amber trail of last 24 right-wrist positions                                    |
| Action badge   | Large colour-coded banner: BLOCK / ATTACK ↘ / ATTACK ↗                          |


---

## `mediapipe-ue.js` — exported API

```js
// Scalar
clamp(v, lo, hi)
mapRange(v, inMin, inMax, outMin, outMax)

// Coordinate conversion
mpToUE(mp)                        // MP normalised → UE rotator

// Vector math
vec3(x,y,z)  vec3sub  vec3add  vec3scale  vec3len  vec3normalize
vec3dot  vec3cross

// Angles
angleBetweenVec3(a, b)
jointAngleDeg(parent, joint, child)

// Smoothing
ema3(curr, prev, alpha)           // exponential moving average on {x,y,z}

// Bone rotation
directionToRotator(dir)           // direction vector → {pitch, yaw, roll}
rotateVec3ByEuler(v, pitch, yaw, roll)

// Gesture detectors (single-frame, pose lm)
detectAttack(lm, threshold)       // right wrist above shoulder
detectGuard(lm, threshold)        // both wrists near chin
detectDodge(lm, threshold)        // torso leans sideways
detectCrouch(lm, threshold)       // torso-height / shoulder-width ratio drops

// Combat helpers (pose-only)
detectBlockPose(lm)               // both wrists in chest zone
computeSwingVector(hist)          // {dx, dy, speed} in display space

// Direction smoothing
clampAngularStep(next, prev, maxDeg)

// Hand geometry
computeMcpGrip(lm)                // grip detection from MCP distances
computeMcpWeaponDir(lm)           // weapon dir + palm normal from MCP plane
computeWeaponDirTwoPoint(lm, toIdx, fromIdx)
computeWristRollAngleDeg(palmNormal, forearmDir)

// Landmark index constants
LM                                // { NOSE: 0, L_SHOULDER: 11, ... }
```

---

## Notes for a new boxing demo

- **No hand tracking needed** — all punches and kicks are detectable from pose landmarks alone.
- **Key landmarks for boxing**: wrists (15, 16), elbows (13, 14), shoulders (11, 12), hips (23, 24), knees (25, 26), ankles (27, 28).
- `computeSwingVector` already provides a velocity vector in display space — reuse it for both hands.
- Add a **per-limb velocity buffer** (one for each wrist + each ankle) instead of a single right-wrist buffer.
- Detect punch vs kick by checking which limb crossed the speed threshold.
- Existing helpers `detectAttack`, `detectGuard`, `detectDodge`, `detectCrouch` in `mediapipe-ue.js` are ready to use.
- Load `mediapipe-ue.js` with `<script src="../sonnet/mediapipe-ue.js"></script>` (or copy it).
- CDN scripts needed:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js"            crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js" crossorigin="anonymous"></script>
  <script src="https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js" crossorigin="anonymous"></script>
  ```
- No `@mediapipe/hands` needed.

