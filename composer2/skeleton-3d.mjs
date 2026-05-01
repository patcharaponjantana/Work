/**
 * 3D pose lab: draggable joints, bone lines, interior-angle readout.
 * Depends on global PoseSkeletonMath from skeleton-math.js (loaded before this module).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** MediaPipe-inspired subset: logical names → initial hips-up, arms T, facing +Z */
const JOINT_IDS = [
  'midHip',
  'leftHip',
  'rightHip',
  'spine',
  'nose',
  'leftShoulder',
  'rightShoulder',
  'leftElbow',
  'rightElbow',
  'leftWrist',
  'rightWrist',
  'leftKnee',
  'rightKnee',
  'leftAnkle',
  'rightAnkle',
];

const INITIAL = {
  midHip: { x: 0, y: 1, z: 0 },
  leftHip: { x: -0.15, y: 1, z: 0 },
  rightHip: { x: 0.15, y: 1, z: 0 },
  spine: { x: 0, y: 1.45, z: 0 },
  nose: { x: 0, y: 1.78, z: 0.02 },
  leftShoulder: { x: -0.35, y: 1.52, z: 0 },
  rightShoulder: { x: 0.35, y: 1.52, z: 0 },
  leftElbow: { x: -0.72, y: 1.52, z: 0 },
  rightElbow: { x: 0.72, y: 1.52, z: 0 },
  leftWrist: { x: -1.08, y: 1.52, z: 0 },
  rightWrist: { x: 1.08, y: 1.52, z: 0 },
  leftKnee: { x: -0.15, y: 0.52, z: 0 },
  rightKnee: { x: 0.15, y: 0.52, z: 0 },
  leftAnkle: { x: -0.15, y: 0.02, z: 0.05 },
  rightAnkle: { x: 0.15, y: 0.02, z: 0.05 },
};

/** Undirected bone pairs for drawing */
const BONE_EDGES = [
  ['midHip', 'leftHip'],
  ['midHip', 'rightHip'],
  ['midHip', 'spine'],
  ['spine', 'nose'],
  ['spine', 'leftShoulder'],
  ['spine', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'],
  ['leftElbow', 'leftWrist'],
  ['rightShoulder', 'rightElbow'],
  ['rightElbow', 'rightWrist'],
  ['leftHip', 'leftKnee'],
  ['leftKnee', 'leftAnkle'],
  ['rightHip', 'rightKnee'],
  ['rightKnee', 'rightAnkle'],
];

/** Rows for interior angle at middle joint: (parent, joint, child, label) */
const ANGLE_DEFS = [
  { parent: 'leftShoulder', joint: 'leftElbow', child: 'leftWrist', label: 'Left elbow' },
  { parent: 'rightShoulder', joint: 'rightElbow', child: 'rightWrist', label: 'Right elbow' },
  { parent: 'leftHip', joint: 'leftKnee', child: 'leftAnkle', label: 'Left knee' },
  { parent: 'rightHip', joint: 'rightKnee', child: 'rightAnkle', label: 'Right knee' },
  { parent: 'spine', joint: 'leftShoulder', child: 'leftElbow', label: 'Left shoulder' },
  { parent: 'spine', joint: 'rightShoulder', child: 'rightElbow', label: 'Right shoulder' },
  { parent: 'midHip', joint: 'leftHip', child: 'leftKnee', label: 'Left hip' },
  { parent: 'midHip', joint: 'rightHip', child: 'rightKnee', label: 'Right hip' },
  { parent: 'midHip', joint: 'spine', child: 'nose', label: 'Spine (torso lean)' },
];

const JOINT_COLORS = {
  midHip: 0x22c55e,
  leftHip: 0x86efac,
  rightHip: 0x86efac,
  spine: 0x3b82f6,
  nose: 0x93c5fd,
  leftShoulder: 0xf59e0b,
  rightShoulder: 0xf59e0b,
  leftElbow: 0xfbbf24,
  rightElbow: 0xfbbf24,
  leftWrist: 0xfcd34d,
  rightWrist: 0xfcd34d,
  leftKnee: 0xa78bfa,
  rightKnee: 0xa78bfa,
  leftAnkle: 0xc4b5fd,
  rightAnkle: 0xc4b5fd,
};

function cloneInitialPositions() {
  const m = new Map();
  for (const id of JOINT_IDS) {
    const p = INITIAL[id];
    m.set(id, new THREE.Vector3(p.x, p.y, p.z));
  }
  return m;
}

function v3plain(v) {
  return { x: v.x, y: v.y, z: v.z };
}

function mount(container) {
  const M = globalThis.PoseSkeletonMath;
  if (!M) {
    console.warn('skeleton-3d: PoseSkeletonMath missing; load skeleton-math.js first.');
    return;
  }

  const host = container.querySelector('[data-role="sk3d-canvas-host"]');
  const anglesEl = container.querySelector('[data-role="sk3d-angles"]');
  const deriveEl = container.querySelector('[data-role="sk3d-derivation"]');
  const resetBtn = container.querySelector('[data-action="sk3d-reset"]');
  if (!host || !anglesEl) return;

  const BONE_HEIGHT = 1;
  /** Cylinder along +Y from y=0 to y=1 after geometry default; scale.y = edge length. */
  const cylinderGeom = new THREE.CylinderGeometry(0.018, 0.018, BONE_HEIGHT, 10, 1);
  cylinderGeom.translate(0, BONE_HEIGHT / 2, 0);
  const boneMat = new THREE.MeshBasicMaterial({ color: 0xa8b8d8 });

  function readSize() {
    let w = Math.floor(host.clientWidth);
    let h = Math.floor(host.clientHeight);
    if (w < 2) w = 640;
    if (h < 2) h = 420;
    return { w: Math.max(280, w), h: Math.max(280, h) };
  }

  let size = readSize();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(size.w, size.h);
  renderer.setClearColor(0x1a1d26, 1);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, size.w / size.h, 0.05, 80);
  camera.position.set(2.2, 1.5, 2.8);
  camera.lookAt(0, 1.05, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.05, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();

  scene.add(new THREE.GridHelper(5, 20, 0x3d4454, 0x2a3040));

  const jointPos = cloneInitialPositions();
  const sphereGeom = new THREE.SphereGeometry(0.065, 18, 14);
  const jointMeshes = [];
  const meshById = new Map();

  for (const id of JOINT_IDS) {
    const mat = new THREE.MeshBasicMaterial({
      color: JOINT_COLORS[id] || 0x888888,
    });
    const mesh = new THREE.Mesh(sphereGeom, mat);
    mesh.userData.jointId = id;
    mesh.position.copy(jointPos.get(id));
    scene.add(mesh);
    jointMeshes.push(mesh);
    meshById.set(id, mesh);
  }

  const boneUp = new THREE.Vector3(0, 1, 0);
  const boneDir = new THREE.Vector3();
  const boneMeshes = [];
  for (let ei = 0; ei < BONE_EDGES.length; ei++) {
    const edge = BONE_EDGES[ei];
    const mesh = new THREE.Mesh(cylinderGeom, boneMat);
    mesh.userData.edgeA = edge[0];
    mesh.userData.edgeB = edge[1];
    mesh.castShadow = false;
    scene.add(mesh);
    boneMeshes.push(mesh);
  }

  function syncBones() {
    for (let i = 0; i < boneMeshes.length; i++) {
      const mesh = boneMeshes[i];
      const pa = jointPos.get(mesh.userData.edgeA);
      const pb = jointPos.get(mesh.userData.edgeB);
      boneDir.subVectors(pb, pa);
      const len = boneDir.length();
      mesh.position.copy(pa);
      mesh.scale.set(1, len > 1e-8 ? len / BONE_HEIGHT : 1e-6, 1);
      if (len > 1e-8) {
        mesh.quaternion.setFromUnitVectors(boneUp, boneDir.clone().normalize());
      } else {
        mesh.quaternion.identity();
      }
    }
  }

  function syncJoints() {
    for (const id of JOINT_IDS) {
      meshById.get(id).position.copy(jointPos.get(id));
    }
  }

  function renderAngles() {
    const parts = ['<dl class="sk3d-angle-dl">'];
    const derivParts = [];

    for (let idx = 0; idx < ANGLE_DEFS.length; idx++) {
      const row = ANGLE_DEFS[idx];
      const pa = jointPos.get(row.parent);
      const pb = jointPos.get(row.joint);
      const pc = jointPos.get(row.child);
      const detail = M.jointInteriorAngleDetail(v3plain(pa), v3plain(pb), v3plain(pc));
      const slug = 'deriv-' + idx;

      if (!detail) {
        parts.push('<dt>' + escapeHtml(row.label) + '</dt><dd>— (degenerate segment)</dd>');
        continue;
      }

      parts.push(
        '<dt>' +
          escapeHtml(row.label) +
          '</dt><dd><strong>' +
          detail.deg.toFixed(1) +
          '°</strong> at <code>' +
          escapeHtml(row.joint) +
          '</code></dd>'
      );

      derivParts.push(
        '<details class="sk3d-details" id="' +
          slug +
          '"><summary>How: ' +
          escapeHtml(row.label) +
          '</summary>' +
          '<pre class="sk3d-math">' +
          'u = A − B = (' +
          formatNum(pa.x - pb.x) +
          ', ' +
          formatNum(pa.y - pb.y) +
          ', ' +
          formatNum(pa.z - pb.z) +
          ')\n' +
          'v = C − B = (' +
          formatNum(pc.x - pb.x) +
          ', ' +
          formatNum(pc.y - pb.y) +
          ', ' +
          formatNum(pc.z - pb.z) +
          ')\n' +
          '|u| = ' +
          detail.lenU.toFixed(4) +
          ',  |v| = ' +
          detail.lenV.toFixed(4) +
          '\n' +
          'u·v = ' +
          detail.dotRaw.toFixed(4) +
          '\n' +
          'cos θ = clamp((u·v)/(|u||v|), −1, 1) = ' +
          detail.cosTheta.toFixed(4) +
          '\n' +
          'θ = arccos(cos θ)×180/π = ' +
          detail.deg.toFixed(2) +
          '°\n' +
          'Joints: A=' +
          row.parent +
          ', B=' +
          row.joint +
          ', C=' +
          row.child +
          '</pre></details>'
      );
    }
    parts.push('</dl>');
    anglesEl.innerHTML = parts.join('');
    if (deriveEl) deriveEl.innerHTML = derivParts.join('');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatNum(n) {
    return n.toFixed(3);
  }

  syncBones();
  syncJoints();
  renderAngles();

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const camDir = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let dragId = null;

  function setNDC(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onDown(ev) {
    setNDC(ev.clientX, ev.clientY);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(jointMeshes, false);
    if (hits.length === 0) return;
    dragId = hits[0].object.userData.jointId;
    controls.enabled = false;
    try {
      renderer.domElement.setPointerCapture(ev.pointerId);
    } catch (e) {}
    ev.preventDefault();
  }

  function onMove(ev) {
    if (!dragId) return;
    setNDC(ev.clientX, ev.clientY);
    raycaster.setFromCamera(ndc, camera);
    camera.getWorldDirection(camDir);
    plane.setFromNormalAndCoplanarPoint(camDir, jointPos.get(dragId));
    if (raycaster.ray.intersectPlane(plane, hit)) {
      jointPos.get(dragId).copy(hit);
      syncJoints();
      syncBones();
      renderAngles();
    }
    ev.preventDefault();
  }

  function onUp(ev) {
    if (dragId) {
      try {
        renderer.domElement.releasePointerCapture(ev.pointerId);
      } catch (e) {}
      dragId = null;
      controls.enabled = true;
    }
  }

  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);

  function tick() {
    requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  function onResize() {
    size = readSize();
    camera.aspect = size.w / size.h;
    camera.updateProjectionMatrix();
    renderer.setSize(size.w, size.h);
  }

  window.addEventListener('resize', onResize);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(function () {
      onResize();
    });
    ro.observe(host);
  }

  requestAnimationFrame(function () {
    requestAnimationFrame(onResize);
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      const fresh = cloneInitialPositions();
      for (const id of JOINT_IDS) {
        jointPos.get(id).copy(fresh.get(id));
      }
      syncJoints();
      syncBones();
      renderAngles();
    });
  }
}

function boot() {
  const container = document.querySelector('[data-widget="skeleton-3d"]');
  if (container) mount(container);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
