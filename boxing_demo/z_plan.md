# Fixing Z-Depth (Depth Estimation) for Webcam Brawler

## The Core Problem

MediaPipe's Z value is **not a real metric depth** — it's a relative estimate inferred from 2D landmark geometry. This causes:

- Z drifts with body tilt (relative to hip, not camera)
- Arm extension looks identical at different real distances
- Depth sign can flip (arm appears to pass through body)
- No temporal consistency → jitter between frames

---

## Strategy 1 — Hybrid Pipeline (Primary Approach)

**Keep MediaPipe for XY positions, replace Z with Depth Anything V2 (DAV2).**

Run DAV2-Small in parallel (~30fps, <10ms/frame on GPU). After MediaPipe returns landmark pixel positions, sample the DAV2 depth map at those exact pixels to get a real Z value.

```python
# Pseudocode
mp_landmarks = mediapipe.process(frame)          # Get XY landmark positions
depth_map    = depth_anything_v2.infer(frame)    # Get full frame depth map

for each landmark:
    px, py = landmark.x * width, landmark.y * height
    landmark.z = depth_map[py, px]               # Replace MediaPipe Z
```

**Model to use:** `depth-anything/Depth-Anything-V2-Small-hf` (HuggingFace)

---

## Strategy 2 — Biomechanical Constraint Depth (Fallback / Punch Z)

**Math-only, zero latency.** Uses the foreshortening effect — when the arm is extended toward the camera, it appears shorter in 2D. Back-calculate Z using the calibrated arm length.

### Calibration (T-Pose)
Ask the player to T-pose at game start. Record the pixel distance from shoulder to wrist — this is the baseline full arm length (apparent length when Z = 0).

### Runtime Formula
```
ratio          = apparent_arm_length / calibrated_arm_length
z_component    = sqrt(1 - ratio²)       ← Pythagorean theorem
```

- `z_component = 0.0` → arm fully parallel to camera (no punch depth)
- `z_component = 1.0` → arm fully punching toward camera

This approach **directly solves the punch-reach problem** and is the most reliable signal for hit detection in a brawler context.

---

## Strategy 3 — Video Depth Anything (Temporal Stability)

If frame-to-frame Z flickering is the main complaint, use **Video Depth Anything** instead of the single-image DAV2. It adds temporal self-attention layers to enforce consistency across frames, eliminating scale drift and jitter.

- Repo: `github.com/DepthAnything/Video-Depth-Anything`
- Use `--metric` flag for absolute (not relative) depth values
- Use streaming mode for real-time inference

Tradeoff: slightly higher latency than DAV2-Small, but Z becomes stable across frames.

---

## Recommended Fused Pipeline

Layer all three strategies together:

```
MediaPipe          → XY landmark positions (reliable)
DAV2-Small         → Sample depth at XY pixel → Z_world
Biomechanical      → Foreshortening formula   → Z_arm (for wrists only)
                          ↓
              Weighted blend:
              Z_fused = 0.7 * Z_world + 0.3 * Z_arm
                          ↓
              One Euro Filter (final smoothing)
                          ↓
                    Z_final → Game engine
```

### One Euro Filter Settings for Z
- `freq = 30` (match your camera FPS)
- `mincutoff = 1.0` (reduces jitter at rest)
- `beta = 0.1` (reduces lag during fast movement — increase if punch latency feels slow)

---

## Model Comparison

| Approach | Speed | Z Accuracy | Temporal Stability | Use Case |
|---|---|---|---|---|
| MediaPipe alone | ★★★★★ | ★★☆☆☆ | ★★☆☆☆ | XY only, avoid for Z |
| DAV2-Small | ★★★★☆ | ★★★★☆ | ★★★☆☆ | General body depth |
| Video Depth Anything | ★★★☆☆ | ★★★★☆ | ★★★★★ | Flicker elimination |
| Biomechanical | ★★★★★ | ★★★☆☆ | ★★★★☆ | Wrist/punch Z only |
| **Fused (recommended)** | **★★★★☆** | **★★★★★** | **★★★★★** | **Full game pipeline** |

---

## Key Design Rule

> For hit detection, you only need accurate Z for the **wrists**. Use the biomechanical estimator specifically for wrist landmarks, and DAV2 for everything else (torso position, dodge detection, foot placement).

---

## Related Context

- Game: 1:1 Physics-Driven Webcam Brawler (Souls-like)
- Pose tracking: MediaPipe Pose (33 landmarks, 3D)
- Target platform: PC with standard webcam
- Critical Z joints: RIGHT_WRIST (16), LEFT_WRIST (15), RIGHT_ELBOW (14), LEFT_ELBOW (13)