/* Scroll-driven 3D scene: four trucks arrive, unload, and a large racking warehouse builds itself.
   PBR materials, image-based lighting (RoomEnvironment), rounded geometry, soft shadows,
   ambient occlusion (GTAO) and filmic tone mapping, all from the Three.js library and its official
   addons. Everything is procedural; no external models. Progress p (0..1) = page scroll. */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const eo = (t) => 1 - Math.pow(1 - t, 3);
const ei = (t) => t * t * t;
const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eback = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const lerp = (a, b, t) => a + (b - a) * t;
const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

const LOW = window.matchMedia('(max-width: 700px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const HIGH = !LOW && (navigator.hardwareConcurrency || 8) >= 8;   // full quality: AO + 4k shadows only on strong machines

/* ---------- procedural textures ---------- */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function grain(ctx, w, h, amt) {
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(id, 0, 0);
}
const cardboardTex = () => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#cfa772'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 160; i++) { c.strokeStyle = `rgba(120,80,30,${Math.random() * 0.08})`; c.beginPath(); const y = Math.random() * h; c.moveTo(0, y); c.lineTo(w, y + (Math.random() - 0.5) * 6); c.stroke(); }
  c.fillStyle = 'rgba(236,224,196,.92)'; c.fillRect(w * 0.42, 0, w * 0.16, h);
  c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(w * 0.42, 0, w * 0.02, h);
  c.fillStyle = '#f3f3f1'; c.fillRect(w * 0.08, h * 0.62, w * 0.28, h * 0.26);
  c.fillStyle = '#222'; for (let k = 0; k < 4; k++) c.fillRect(w * 0.1, h * (0.65 + k * 0.05), w * (0.14 + Math.random() * 0.1), 3);
  c.fillStyle = '#111'; for (let k = 0; k < 14; k++) c.fillRect(w * 0.1 + k * 6, h * 0.84, 2 + (k % 3), h * 0.03);
  c.strokeStyle = 'rgba(70,45,15,.35)'; c.lineWidth = 6; c.strokeRect(0, 0, w, h);
  grain(c, w, h, 14);
});
const woodTex = () => canvasTex(256, 128, (c, w, h) => {
  c.fillStyle = '#c9a06a'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 90; i++) { c.strokeStyle = `rgba(${90 + Math.random() * 40},${55 + Math.random() * 30},20,${0.08 + Math.random() * 0.18})`; c.lineWidth = 1 + Math.random() * 2; c.beginPath(); const y = Math.random() * h; c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + (Math.random() - 0.5) * 8, w * 0.7, y + (Math.random() - 0.5) * 8, w, y + (Math.random() - 0.5) * 6); c.stroke(); }
  for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(70,40,15,.35)'; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 6, 3, 0, 0, 7); c.fill(); }
  grain(c, w, h, 10);
});
const concreteTex = (rx, ry) => canvasTex(512, 512, (c, w, h) => {
  c.fillStyle = '#dcdfe4'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(${150 + Math.random() * 60},${155 + Math.random() * 60},${160 + Math.random() * 60},.10)`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 90, 0, 7); c.fill(); }
  for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(40,40,48,.10)'; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, 14 + Math.random() * 30, 8 + Math.random() * 16, Math.random() * 3, 0, 7); c.fill(); }
  grain(c, w, h, 16);
  c.strokeStyle = 'rgba(90,96,104,.55)'; c.lineWidth = 3; c.strokeRect(0, 0, w, h);
}, [rx, ry]);
const asphaltTex = (rx, ry) => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#585c63'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},${Math.random() > 0.5 ? 255 : 0},.05)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  c.strokeStyle = 'rgba(20,20,24,.4)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(20, 0); c.lineTo(60, 90); c.lineTo(50, 140); c.lineTo(100, 256); c.stroke();
  grain(c, w, h, 20);
}, [rx, ry]);
const grassTex = (rx, ry) => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = '#7da35f'; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 1200; i++) { c.fillStyle = `rgba(${60 + Math.random() * 50},${110 + Math.random() * 60},${40 + Math.random() * 40},.35)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 5); }
  grain(c, w, h, 14);
}, [rx, ry]);
const plateTex = (rx, ry) => canvasTex(128, 128, (c, w, h) => {
  c.fillStyle = '#9ca2ab'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 4; c.lineCap = 'round';
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const cx = x * 32 + 16, cy = y * 32 + 16, a = (x + y) % 2 ? 1 : -1;
    c.beginPath(); c.moveTo(cx - 9 * a, cy - 9); c.lineTo(cx + 9 * a, cy + 9); c.stroke();
  }
  grain(c, w, h, 10);
}, [rx, ry]);
const hazardTex = (rx) => canvasTex(128, 32, (c, w, h) => {
  c.fillStyle = '#F2C230'; c.fillRect(0, 0, w, h); c.fillStyle = '#1b1d20';
  for (let x = -h; x < w + h; x += 32) { c.beginPath(); c.moveTo(x, h); c.lineTo(x + 16, h); c.lineTo(x + 16 + h, 0); c.lineTo(x + h, 0); c.fill(); }
}, [rx, 1]);
const ribTex = (rx) => canvasTex(64, 64, (c, w, h) => {
  const g = c.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, '#cfd3da'); g.addColorStop(0.5, '#e8ebef'); g.addColorStop(1, '#c4c9d1');
  c.fillStyle = g; c.fillRect(0, 0, w, h); grain(c, w, h, 6);
}, [rx, 1]);
const containerTex = (hex) => canvasTex(256, 256, (c, w, h) => {
  c.fillStyle = hex; c.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 16) { c.fillStyle = 'rgba(0,0,0,.20)'; c.fillRect(x, 0, 5, h); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x + 5, 0, 3, h); }
  for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(80,40,10,.10)'; c.fillRect(Math.random() * w, Math.random() * h, 40, 3); }
  grain(c, w, h, 12);
});
const decalTex = (text, bg, fg) => canvasTex(512, 128, (c, w, h) => {
  c.fillStyle = bg; c.fillRect(0, 0, w, h); c.strokeStyle = fg; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12);
  c.fillStyle = fg; c.font = '800 70px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 4);
});

/* ---------- geometry helpers ---------- */
const bx = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const rb = (w, h, d, r = 0.05, s = 3) => new RoundedBoxGeometry(w, h, d, s, r);
const rbAt = (w, h, d, r, x, y, z, s = 2) => { const g = rb(w, h, d, r, s); g.translate(x, y, z); return g; };

function init() {
  const root = document.querySelector('.scene3d');
  if (!root) return;
  const stage = root.querySelector('.stage');
  const canvas = root.querySelector('canvas');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: !HIGH, powerPreference: 'high-performance' });
  } catch (e) { return; }
  document.documentElement.classList.add('has3d');
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const BG = 0xDDE6EE;
  renderer.setClearColor(BG, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(BG, 190, 380);
  const cam = new THREE.PerspectiveCamera(28, 1, 1, 600);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.add(new THREE.HemisphereLight(0xdff0ff, 0xb9b39a, 0.45));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-40, 70, 48);
  sun.castShadow = true;
  sun.shadow.mapSize.set(HIGH ? 4096 : 2048, HIGH ? 4096 : 2048);
  Object.assign(sun.shadow.camera, { left: -64, right: 64, top: 60, bottom: -60, near: 1, far: 240 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  /* ---------- materials ---------- */
  const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.05, envMapIntensity: 0.85 }, o));
  const phys = (c, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({ color: c, roughness: 0.4, envMapIntensity: 1 }, o));
  const M = {
    paint: phys(0xD71920, { roughness: 0.34, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12 }),
    rack: std(0xC8161D, { roughness: 0.42, metalness: 0.45 }),
    beam: std(0xF28A1C, { roughness: 0.42, metalness: 0.5 }),
    blue: std(0x2457A6, { roughness: 0.45, metalness: 0.4 }),
    steel: std(0xB9BFC8, { roughness: 0.4, metalness: 0.75 }),
    dark: std(0x2A2D32, { roughness: 0.55, metalness: 0.4 }),
    white: std(0xF4F5F7, { roughness: 0.5 }),
    rubber: std(0x16181B, { roughness: 0.95 }),
    glass: phys(0x16222E, { roughness: 0.03, metalness: 0.0, clearcoat: 1, envMapIntensity: 1.8 }),
    chrome: std(0xe2e6eb, { metalness: 1, roughness: 0.16 }),
    yellow: std(0xF2C230, { roughness: 0.55 }),
    orange: std(0xFF7A1A, { roughness: 0.6 }),
    green: std(0x2FA05A, { roughness: 0.6 }),
    wood: std(0xffffff, { map: woodTex(), roughness: 0.85 }),
    lamp: std(0xffffff, { emissive: 0xFFF0C0, emissiveIntensity: 2.4 }),
    tail: std(0xff3030, { emissive: 0xff1d1d, emissiveIntensity: 1.3 }),
    amber: std(0xffb020, { emissive: 0xff9a00, emissiveIntensity: 2 }),
    carton: std(0xffffff, { map: cardboardTex(), roughness: 0.82 }),
    vest: std(0xFF7A1A, { roughness: 0.7 }),
    refl: std(0xE9F1F3, { roughness: 0.4, metalness: 0.2 }),
    navy: std(0x2B3D63, { roughness: 0.8 }),
    skin: std(0xE2B896, { roughness: 0.75 }),
    hat: std(0xFFFFFF, { roughness: 0.4 }),
    slab: std(0xffffff, { map: concreteTex(19, 9), roughness: 0.5, envMapIntensity: 0.6 }),
    road: std(0xffffff, { map: asphaltTex(80, 3), roughness: 0.95 }),
    grass: std(0xffffff, { map: grassTex(60, 50), roughness: 1 }),
    plate: std(0xffffff, { map: plateTex(6, 4), roughness: 0.5, metalness: 0.5 }),
    hazard: std(0xffffff, { map: hazardTex(190), roughness: 0.6 }),
    wall: std(0xffffff, { map: ribTex(150), roughness: 0.65, metalness: 0.1 }),
    pil: std(0xC3C8D0, { roughness: 0.6, metalness: 0.25 }),
    leaf: std(0x5f8f4e, { roughness: 0.9 }),
    trunk: std(0x6b4a2d, { roughness: 0.9 }),
  };
  const place = (m, parent = scene) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const mesh = (geo, material, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geo, material); m.position.set(x, y, z); return place(m, parent); };
  const inst = (geo, material, n) => { const m = new THREE.InstancedMesh(geo, material, n); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); return m; };
  const dummy = new THREE.Object3D();
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const up = (g) => { g.translate(0, 0.5, 0); return g; };
  const flat = (m) => { m.castShadow = false; return m; };

  /* ---------- ground, slab, road, building shell ---------- */
  const SX = 76, SZ0 = -26, SZ1 = 9;               // slab: x -38..38, z -26..9
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 420), M.grass);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.32; ground.receiveShadow = true; scene.add(ground);
  const slab = flat(mesh(BOX, M.slab)); slab.scale.set(SX, 0.3, SZ1 - SZ0); slab.position.set(0, -0.15, (SZ0 + SZ1) / 2);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(420, 8), M.road);
  road.rotation.x = -Math.PI / 2; road.position.set(0, -0.28, 14.4); road.receiveShadow = true; scene.add(road);
  // lane dashes (instanced, cheap)
  const dashes = inst(BOX, std(0xF2F3F5, { roughness: 0.7 }), 70);
  for (let i = 0; i < 70; i++) { dummy.position.set(-210 + i * 6, -0.265, 14.4); dummy.rotation.set(0, 0, 0); dummy.scale.set(2.6, 0.02, 0.16); dummy.updateMatrix(); dashes.setMatrixAt(i, dummy.matrix); }
  [10.6, 18.2].forEach((z) => { const c = flat(mesh(BOX, std(0xcfd3d9))); c.scale.set(420, 0.18, 0.3); c.position.set(0, -0.2, z); });
  const sidewalk = flat(mesh(BOX, std(0xd2d5da, { roughness: 0.9 }))); sidewalk.scale.set(420, 0.14, 3); sidewalk.position.set(0, -0.23, 20);
  const hz = flat(mesh(BOX, M.hazard)); hz.scale.set(SX, 0.03, 0.42); hz.position.set(0, 0.015, 8.9);
  [5.05, 8.25].forEach((z) => { const l = flat(mesh(BOX, M.yellow)); l.scale.set(SX, 0.012, 0.1); l.position.set(0, 0.008, z); });
  [-2.2, 0.2].forEach((z) => { const l = flat(mesh(BOX, M.green)); l.scale.set(SX, 0.012, 0.16); l.position.set(0, 0.009, z); });   // walkway
  // cut-away building shell (back and left walls), taller
  const WH = 14;
  const back = mesh(BOX, M.wall); back.scale.set(SX + 1, WH, 0.5); back.position.set(0, WH / 2, SZ0 - 0.3);
  const left = mesh(BOX, M.wall); left.scale.set(0.5, WH, SZ1 - SZ0 + 1); left.position.set(-SX / 2 - 0.2, WH / 2, (SZ0 + SZ1) / 2);
  for (let x = -35; x <= 35; x += 7) { const pil = mesh(BOX, M.pil); pil.scale.set(0.55, WH, 0.55); pil.position.set(x, WH / 2, SZ0 - 0.05); }
  for (let z = SZ0 + 3; z <= SZ1; z += 7) { const pil = mesh(BOX, M.pil); pil.scale.set(0.55, WH, 0.55); pil.position.set(-SX / 2 + 0.1, WH / 2, z); }
  for (let x = -33; x <= 33; x += 7) { const w = flat(mesh(BOX, M.glass)); w.scale.set(5, 1.7, 0.12); w.position.set(x + 0.5, WH - 2, SZ0 - 0.02); }
  for (let z = SZ0 + 3; z <= SZ1 - 4; z += 7) { const w = flat(mesh(BOX, M.glass)); w.scale.set(0.12, 1.7, 5); w.position.set(-SX / 2 + 0.05, WH - 2, z + 0.5); }
  // brand on the back wall
  const logoTex = new THREE.TextureLoader().load('logo.png'); logoTex.colorSpace = THREE.SRGBColorSpace; logoTex.anisotropy = 8;
  const logoMat = new THREE.MeshStandardMaterial({ map: logoTex, transparent: true, roughness: 0.5, envMapIntensity: 0.6 });
  const wallLogo = new THREE.Mesh(new THREE.PlaneGeometry(15, 10.7), logoMat); wallLogo.position.set(0, 7.0, SZ0 + 0.06); scene.add(wallLogo);
  // roof steel along the back: trusses + rails
  for (let x = -36; x <= 36; x += 6) { const t = mesh(BOX, M.dark); t.scale.set(0.25, 0.5, 6); t.position.set(x, WH - 0.3, SZ0 + 3); t.castShadow = true; }
  const rb1 = mesh(BOX, M.steel); rb1.scale.set(SX, 0.35, 0.35); rb1.position.set(0, WH - 3.0, SZ0 + 0.6);
  // bollards, lamps, trees, parked cars outside
  const bollardGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.95, 14); bollardGeo.translate(0, 0.475, 0);
  const bol = inst(bollardGeo, M.yellow, 20);
  for (let i = 0; i < 20; i++) { dummy.position.set(-36 + i * 3.8, 0, 9.5); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); bol.setMatrixAt(i, dummy.matrix); }
  for (let i = 0; i < 9; i++) {
    const x = -72 + i * 18;
    mesh(new THREE.CylinderGeometry(0.12, 0.16, 8, 10), M.dark, x, 4, 18.9);
    mesh(bx(0.12, 0.12, 2.2), M.dark, x, 8, 17.9);
    mesh(rb(0.8, 0.14, 0.4, 0.04), M.lamp, x, 7.9, 16.9).castShadow = false;
  }
  for (let i = 0; i < 16; i++) {
    const x = -90 + i * 12 + hash(i) * 4, z = 33 + hash(i + 9) * 6, s = 0.8 + hash(i + 3) * 0.6;
    mesh(new THREE.CylinderGeometry(0.2 * s, 0.28 * s, 2.6 * s, 8), M.trunk, x, 1.3 * s, z);
    mesh(new THREE.IcosahedronGeometry(1.8 * s, 2), M.leaf, x, 3.7 * s, z);
    mesh(new THREE.IcosahedronGeometry(1.3 * s, 2), M.leaf, x + 0.9 * s, 4.7 * s, z - 0.3);
  }

  /* ---------- wheel + rack building blocks ---------- */
  const wheelGeos = (() => {
    const tire = new THREE.CylinderGeometry(0.56, 0.56, 0.34, 28); tire.rotateX(Math.PI / 2);
    const rim = new THREE.CylinderGeometry(0.34, 0.34, 0.37, 24); rim.rotateX(Math.PI / 2);
    const hub = new THREE.CylinderGeometry(0.13, 0.13, 0.4, 16); hub.rotateX(Math.PI / 2);
    const lug = new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8); lug.rotateX(Math.PI / 2);
    return { tire, rim, hub, lug };
  })();
  function makeWheel() {
    const g = new THREE.Group();
    const t = new THREE.Mesh(wheelGeos.tire, M.rubber); t.castShadow = true; g.add(t);
    g.add(new THREE.Mesh(wheelGeos.rim, M.steel)); g.add(new THREE.Mesh(wheelGeos.hub, M.chrome));
    for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(wheelGeos.lug, M.chrome); const a = (k / 6) * Math.PI * 2; l.position.set(Math.cos(a) * 0.22, Math.sin(a) * 0.22, 0); g.add(l); }
    return g;
  }

  /* ---------- racking layout: 10 blocks (4 loaded from trucks, 6 with a partial stock) ---------- */
  const BAYS = 5, LEVELS = 4, BAYW = 1.5, LVLH = 1.35, ROWD = 0.9, GAP = 0.1;
  const BLOCKS = [
    { x0: -34, z0: 3, truck: 0 }, { x0: -15, z0: 3, truck: 1 }, { x0: 5, z0: 3, truck: 2 }, { x0: 24, z0: 3, truck: 3 },
    { x0: -34, z0: -8 }, { x0: -15, z0: -8 }, { x0: 5, z0: -8 }, { x0: 24, z0: -8 },
    { x0: -34, z0: -21 }, { x0: 24, z0: -21 },
  ];
  const S0 = 0.40, SL = 0.08;
  const stagger = (bi) => (bi < 4 ? bi * 0.012 : bi < 8 ? 0.045 + (bi - 4) * 0.01 : 0.09 + (bi - 8) * 0.012);
  const segStart = (l, bi) => S0 + l * SL + stagger(bi);
  const posts = [], beams = [], braces = [], plates = [], guards = [];
  const slotsByBlock = BLOCKS.map(() => []);
  BLOCKS.forEach((b, bi) => {
    for (let r = 0; r < 2; r++) {
      const rz = b.z0 + r * (ROWD + GAP);
      const zs = [rz + 0.05, rz + ROWD - 0.05];
      for (let l = 0; l < LEVELS; l++) for (let i = 0; i <= BAYS; i++) {
        zs.forEach((z) => posts.push({ x: b.x0 + i * BAYW, z, l, bi }));
        braces.push({ x: b.x0 + i * BAYW, z: rz + ROWD / 2, y: l * LVLH + LVLH * 0.5, l, bi, dir: (i + l) % 2 ? 1 : -1 });
      }
      for (let i = 0; i <= BAYS; i++) zs.forEach((z) => plates.push({ x: b.x0 + i * BAYW, z, bi }));
      for (let l = 0; l <= LEVELS; l++) for (let i = 0; i < BAYS; i++) zs.forEach((z) => beams.push({ x: b.x0 + i * BAYW, z, l, bi }));
      for (let l = 0; l < LEVELS; l++) for (let i = 0; i < BAYS; i++) slotsByBlock[bi].push({ x: b.x0 + i * BAYW + BAYW / 2, z: rz + ROWD / 2, y: l * LVLH + 0.17, l, i, r, bi });
    }
    [0, BAYS].forEach((i) => guards.push({ x: b.x0 + i * BAYW, z: b.z0 + ROWD + GAP + ROWD - 0.05, bi }));
    slotsByBlock[bi].sort((a, c) => a.l - c.l || a.i - c.i || a.r - c.r);
  });
  const postGeo = up(mergeGeometries([bx(0.1, 1, 0.03, 0, 0, 0), bx(0.03, 1, 0.08, -0.035, 0, 0.025), bx(0.03, 1, 0.08, 0.035, 0, 0.025)]));
  const beamGeo = mergeGeometries([bx(1, 0.14, 0.05, 0.5, 0, 0), bx(1, 0.03, 0.09, 0.5, -0.06, 0.02)]);
  const postMesh = inst(postGeo, M.rack, posts.length);
  const beamMesh = inst(beamGeo, M.beam, beams.length);
  const braceMesh = inst(up(bx(0.035, 1, 0.035)), M.steel, braces.length);
  const plateMesh = inst(up(bx(0.26, 0.03, 0.24)), M.dark, plates.length);
  const guardMesh = inst(up(rb(0.34, 0.55, 0.34, 0.035)), M.yellow, guards.length);

  /* ---------- pallets: euro-pallet with wood texture + 8 cartons ---------- */
  const palletGeo = (() => {
    const parts = [];
    [-0.5, -0.25, 0, 0.25, 0.5].forEach((x) => parts.push(bx(0.145, 0.022, 0.8, x, 0.133, 0)));
    [-0.5, 0, 0.5].forEach((x) => parts.push(bx(0.145, 0.022, 0.8, x, 0.011, 0)));
    [-0.5, 0, 0.5].forEach((x) => [-0.34, 0, 0.34].forEach((z) => parts.push(bx(0.1, 0.1, 0.1, x, 0.072, z))));
    return mergeGeometries(parts);
  })();
  const loadGeo = (() => {
    const parts = [];
    for (let ly = 0; ly < 2; ly++) for (let ix = 0; ix < 2; ix++) for (let iz = 0; iz < 2; iz++)
      parts.push(rbAt(0.54, 0.36, 0.38, 0.022, (ix - 0.5) * 0.56, 0.18 + ly * 0.37, (iz - 0.5) * 0.39, 2));
    return mergeGeometries(parts);
  })();
  const CART = [0xffffff, 0xf0e3cf, 0xe9d3b0, 0xf6f0e6, 0xdcc19a, 0xffffff, 0xc9dcf5, 0xf3d6c6];
  const TRUCK_Z = 13.9, DECK = 1.09;
  const TRUCKS = [
    { stop: -30.25, inn: [0.26, 0.40], out: [0.92, 0.98], block: 0 },
    { stop: -11.25, inn: [0.20, 0.34], out: [0.90, 0.96], block: 1 },
    { stop: 8.75, inn: [0.14, 0.28], out: [0.88, 0.94], block: 2 },
    { stop: 27.75, inn: [0.08, 0.22], out: [0.86, 0.92], block: 3 },
  ];
  const pallets = [];
  TRUCKS.forEach((t, ti) => {
    slotsByBlock[t.block].forEach((s, j) => {
      const layer = j < 20 ? 1 : 0, rr = j % 20, col = Math.floor(rr / 2), across = rr % 2;
      const inLevel = s.i * 2 + s.r;
      const t0 = segStart(s.l, t.block) + 0.033 + (inLevel / 10) * 0.03;
      pallets.push({ t, slot: s, t0, t1: t0 + 0.04, cx: (col - 4.5) * 0.95, cz: across ? 0.62 : -0.62, cy: DECK + layer * 0.92, color: CART[(j * 5 + ti * 2) % CART.length] });
    });
  });
  const baseMesh = inst(palletGeo, M.wood, pallets.length);
  const loadMesh = inst(loadGeo, M.carton, pallets.length);
  pallets.forEach((p, i) => loadMesh.setColorAt(i, new THREE.Color(p.color)));
  // partial stock in the other blocks: pops in once the level is built
  const stock = [];
  BLOCKS.forEach((b, bi) => {
    if (b.truck !== undefined) return;
    slotsByBlock[bi].forEach((s, j) => { if (hash(bi * 100 + j) < 0.55) stock.push({ s, bi, t0: segStart(s.l, bi) + 0.04 + hash(j) * 0.03, c: CART[(bi + j) % CART.length], ry: (hash(j + 7) - 0.5) * 0.08 }); });
  });
  const stockBase = inst(palletGeo, M.wood, stock.length);
  const stockLoad = inst(loadGeo, M.carton, stock.length);
  stock.forEach((q, i) => stockLoad.setColorAt(i, new THREE.Color(q.c)));

  /* ---------- trucks ---------- */
  function makeTruck(tint) {
    const g = new THREE.Group(); const wheels = [];
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    [0.76, -0.76].forEach((z) => add(rb(10.6, 0.2, 0.14, 0.02), M.dark, 0, 0.92, z));
    for (let x = -5; x <= 5; x += 1.25) add(bx(0.1, 0.1, 1.6), M.dark, x, 0.92, 0);
    add(rb(10.6, 0.1, 2.5, 0.02), M.steel, 0, 1.04, 0);
    add(rb(10.6, 0.3, 0.06, 0.02), M.white, 0, 1.24, 1.22); add(rb(10.6, 0.3, 0.06, 0.02), M.white, 0, 1.24, -1.22);
    add(rb(0.14, 2.9, 2.5, 0.03), M.white, 5.25, 2.5, 0);
    add(rb(0.16, 0.34, 2.52, 0.03), M.paint, 5.25, 1.55, 0);
    [-4.2, -1.4, 1.4, 4.2].forEach((x) => [1.22, -1.22].forEach((z) => add(bx(0.06, 1.1, 0.06), M.dark, x, 1.6, z)));
    const straps = [-3.6, 0, 3.6].map((x) => add(rb(0.12, 0.035, 2.55, 0.01), M.rubber, x, DECK + 1.86, 0));
    add(rb(0.1, 0.12, 2.2, 0.02), M.dark, -5.45, 0.66, 0);
    [1.1, -1.1].forEach((z) => add(rb(0.05, 0.2, 0.32, 0.015), M.tail, -5.34, 1.0, z));
    add(rb(0.03, 0.18, 0.5, 0.01), M.white, -5.35, 0.78, 0);
    [0.9, -0.9].forEach((z) => add(bx(0.1, 0.8, 0.1), M.dark, 3.6, 0.5, z));
    [1.06, -1.06].forEach((z) => add(rb(3.0, 0.06, 0.5, 0.02), M.dark, -2.7, 1.3, z));
    const cabMat = tint || M.paint;
    add(rb(2.7, 1.2, 2.5, 0.14), cabMat, 6.9, 1.3, 0);
    add(rb(1.7, 1.35, 2.4, 0.18), cabMat, 7.1, 2.55, 0);
    add(rb(1.4, 0.55, 2.3, 0.12), cabMat, 6.7, 3.45, 0);
    add(rb(0.06, 0.9, 2.12, 0.02), M.glass, 7.95, 2.62, 0).rotation.z = -0.13;
    [1.21, -1.21].forEach((z) => add(rb(1.05, 0.72, 0.04, 0.02), M.glass, 7.15, 2.65, z));
    [1.275, -1.275].forEach((z) => {
      add(rb(1.4, 0.78, 0.025, 0.02), M.white, 6.95, 1.3, z);
      const d = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.857), logoMat);
      d.position.set(6.95, 1.3, z + (z > 0 ? 0.016 : -0.016)); if (z < 0) d.rotation.y = Math.PI; g.add(d);
    });
    add(rb(0.08, 0.85, 1.9, 0.02), M.dark, 8.28, 1.35, 0);
    [1.15, 1.35, 1.55].forEach((y) => add(rb(0.05, 0.04, 1.8, 0.01), M.chrome, 8.34, y + 0.05, 0));
    [0.95, -0.95].forEach((z) => add(rb(0.07, 0.24, 0.42, 0.03), M.lamp, 8.31, 0.82, z));
    add(rb(0.4, 0.34, 2.56, 0.08), M.dark, 8.4, 0.62, 0);
    [-0.9, -0.45, 0, 0.45, 0.9].forEach((z) => add(rb(0.06, 0.1, 0.18, 0.02), M.amber, 7.2, 3.82, z));
    [1.45, -1.45].forEach((z) => { add(bx(0.05, 0.05, 0.3), M.dark, 8.0, 2.8, z * 0.93); add(rb(0.18, 0.5, 0.08, 0.03), M.dark, 8.0, 2.8, z); });
    [1.1, -1.1].forEach((z) => { add(new THREE.CylinderGeometry(0.09, 0.09, 2.7, 12), M.chrome, 5.55, 2.25, z * 1.12); add(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 12), M.dark, 5.55, 3.62, z * 1.12); });
    [1.18, -1.18].forEach((z) => { const t = new THREE.CylinderGeometry(0.3, 0.3, 1.2, 18); t.rotateZ(Math.PI / 2); add(t, M.steel, 5.2, 0.78, z); });
    [[-3.9, 1.0], [-2.7, 1.0], [-1.5, 1.0], [-3.9, -1.0], [-2.7, -1.0], [-1.5, -1.0], [5.9, 1.0], [5.9, -1.0], [7.55, 1.0], [7.55, -1.0]].forEach(([x, z]) => {
      const w = makeWheel(); w.position.set(x, 0.56, z); g.add(w); wheels.push(w);
    });
    [1.07, -1.07].forEach((z) => add(rb(2.0, 0.08, 0.5, 0.03), cabMat, 6.7, 1.22, z));
    scene.add(g); return { g, wheels, straps };
  }
  const tints = [M.paint, std(0x2457A6, { roughness: 0.34, metalness: 0.2 }), M.paint, std(0x2F7D4F, { roughness: 0.34, metalness: 0.2 })];
  TRUCKS.forEach((t, i) => Object.assign(t, makeTruck(i === 1 || i === 3 ? tints[i] : null)));
  const truckX = (t, p) => {
    const a = seg(p, t.inn[0], t.inn[1]), b = seg(p, t.out[0], t.out[1]);
    if (b > 0) return t.stop + ei(b) * 90;
    return t.stop - 80 + eo(a) * 80;
  };
  TRUCKS.forEach((t) => { t.first = Math.min(...pallets.filter((q) => q.t === t).map((q) => q.t0)); });

  /* ---------- mezzanine (larger) ---------- */
  const MZ = { x0: -10, x1: 8, z0: -19, z1: -12.5, h: 3.0 };
  const mzCols = [0, 1, 2, 3].map((k) => MZ.x0 + (k * (MZ.x1 - MZ.x0)) / 3);
  const mzRows = [MZ.z0, (MZ.z0 + MZ.z1) / 2, MZ.z1];
  const mzPosts = []; mzCols.forEach((x) => mzRows.forEach((z) => mzPosts.push({ x, z })));
  const mzPostMesh = inst(up(rb(0.2, 1, 0.2, 0.025)), M.blue, mzPosts.length);
  const mzBase = inst(up(bx(0.42, 0.04, 0.42)), M.dark, mzPosts.length);
  const mzW = MZ.x1 - MZ.x0 + 0.3, mzD = MZ.z1 - MZ.z0 + 0.3;
  const mzCx = (MZ.x0 + MZ.x1) / 2, mzCz = (MZ.z0 + MZ.z1) / 2;
  const mzPlate = place(new THREE.Mesh(BOX, M.plate)); mzPlate.material = std(0xffffff, { map: plateTex(mzW / 2, mzD / 2), roughness: 0.5, metalness: 0.5 });
  const mzBeams = mzRows.map((z) => ({ m: mesh(BOX, M.beam), z }));
  const railDefs = [
    { x: mzCx, z: MZ.z0 - 0.1, w: mzW, d: 0.05 }, { x: MZ.x0 - 0.1, z: mzCz, w: 0.05, d: mzD },
    { x: MZ.x1 + 0.1, z: mzCz, w: 0.05, d: mzD }, { x: mzCx + 3.0, z: MZ.z1 + 0.1, w: 12, d: 0.05 },
  ];
  const rails = [];
  railDefs.forEach((r) => [0.55, 1.05].forEach((hh) => rails.push({ m: mesh(BOX, M.yellow), r, hh })));
  const railPosts = [];
  railDefs.forEach((r) => { const horiz = r.w > r.d, len = horiz ? r.w : r.d, n = Math.max(2, Math.round(len / 1.4)); for (let k = 0; k <= n; k++) { const f = k / n - 0.5; railPosts.push(horiz ? { x: r.x + f * len, z: r.z } : { x: r.x, z: r.z + f * len }); } });
  const rpMesh = inst(up(bx(0.05, 1, 0.05)), M.yellow, railPosts.length);
  const STEPS = 15, stairX = MZ.x0 + 1.6, STEPD = 0.3;
  const stepMesh = inst(rb(1, 1, 1, 0.1, 2), M.plate, STEPS);
  const stringers = [-0.65, 0.65].map((dx) => ({ m: mesh(BOX, M.beam), dx }));
  const stairRails = [-0.7, 0.7].map((dx) => ({ m: mesh(BOX, M.yellow), dx }));
  const mzLoads = [];
  for (let k = 0; k < 14; k++) mzLoads.push({ x: MZ.x0 + 2.4 + (k % 5) * 3.1, z: MZ.z0 + 1.6 + Math.floor(k / 5) * 2.0, c: CART[k % CART.length] });
  const mzPal = inst(palletGeo, M.wood, mzLoads.length);
  const mzLoadMesh = inst(loadGeo, M.carton, mzLoads.length);
  mzLoads.forEach((l, i) => mzLoadMesh.setColorAt(i, new THREE.Color(l.c)));
  const MZ0 = 0.56;

  /* ---------- extra life: containers, conveyor, crane, parked cars, cones, floor stacks, signs ---------- */
  const colorsC = ['#C8161D', '#2457A6', '#E8E9EC', '#2F7D4F', '#F28A1C', '#2B2D31'];
  const containers = [];
  [[46, 0], [46, -9], [46, -18]].forEach(([x, z], i) => [0, 1].forEach((lv) => {
    const m = new THREE.Mesh(BOX, std(0xffffff, { map: containerTex(colorsC[(i * 2 + lv) % colorsC.length]), roughness: 0.65, metalness: 0.3 }));
    m.scale.set(2.5, 2.6, 11.5); m.position.set(x, 1.3 + lv * 2.62, z); m.castShadow = true; m.receiveShadow = true; scene.add(m); containers.push({ m, lv, i });
  }));
  // conveyor line in the mid area, with moving cartons
  const CV = { x0: -9, x1: 11, z: -2.2, y: 0.9 };
  const rollerGeo = new THREE.CylinderGeometry(0.07, 0.07, 1.0, 10); rollerGeo.rotateX(Math.PI / 2);
  const nR = Math.floor((CV.x1 - CV.x0) / 0.26);
  const rollers = inst(rollerGeo, M.steel, nR);
  for (let i = 0; i < nR; i++) { dummy.position.set(CV.x0 + i * 0.26, CV.y, CV.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); rollers.setMatrixAt(i, dummy.matrix); }
  [0.52, -0.52].forEach((dz) => { const r = mesh(BOX, M.blue); r.scale.set(CV.x1 - CV.x0, 0.14, 0.08); r.position.set((CV.x0 + CV.x1) / 2, CV.y - 0.02, CV.z + dz); });
  const legGeo = up(bx(0.08, 1, 0.08)); const legs = inst(legGeo, M.dark, 18);
  for (let i = 0; i < 9; i++) [0.5, -0.5].forEach((dz, k) => { dummy.position.set(CV.x0 + i * 2.5, 0, CV.z + dz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, CV.y - 0.05, 1); dummy.updateMatrix(); legs.setMatrixAt(i * 2 + k, dummy.matrix); });
  const boxGeo = rb(0.8, 0.5, 0.6, 0.03, 2);
  const cvBoxes = inst(boxGeo, M.carton, 9);
  for (let i = 0; i < 9; i++) cvBoxes.setColorAt(i, new THREE.Color(CART[i % CART.length]));
  // overhead gantry crane
  const rails2 = [SZ0 + 1.2, SZ1 - 2.2].map((z) => { const r = mesh(BOX, M.steel); r.scale.set(SX - 2, 0.3, 0.3); r.position.set(0, WH - 3.4, z); return r; });
  const bridge = new THREE.Group(); scene.add(bridge);
  const bridgeBeam = new THREE.Mesh(BOX, M.paint); bridgeBeam.scale.set(0.7, 0.6, (SZ1 - 2.2) - (SZ0 + 1.2)); bridgeBeam.castShadow = true; bridge.add(bridgeBeam);
  [SZ0 + 1.2, SZ1 - 2.2].forEach((z) => { const e = new THREE.Mesh(BOX, M.dark); e.scale.set(1.4, 0.7, 0.9); e.position.z = z - (SZ0 + SZ1 - 1.0) / 2; bridge.add(e); });
  const trolley = new THREE.Group(); bridge.add(trolley);
  const tr = new THREE.Mesh(BOX, M.dark); tr.scale.set(1.2, 0.5, 1.4); trolley.add(tr);
  const cable = new THREE.Mesh(BOX, M.dark); cable.scale.set(0.06, 1, 0.06); trolley.add(cable);
  const hook = new THREE.Mesh(BOX, M.yellow); hook.scale.set(0.5, 0.4, 0.5); trolley.add(hook);
  const hookLoad = new THREE.Mesh(loadGeo, M.carton); hookLoad.castShadow = true; trolley.add(hookLoad);
  // parked cars across the road
  const carCols = [0x2457A6, 0xE8E9EC, 0xC8161D, 0x2B2D31, 0xB9BFC8, 0x2F7D4F];
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group(); const col = std(carCols[i % carCols.length], { roughness: 0.3, metalness: 0.4 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    add(rb(4.3, 0.75, 1.8, 0.2), col, 0, 0.7, 0); add(rb(2.3, 0.7, 1.6, 0.25), col, -0.2, 1.3, 0);
    add(rb(2.0, 0.5, 1.62, 0.15), M.glass, -0.2, 1.33, 0);
    [[1.4, 0.82], [1.4, -0.82], [-1.4, 0.82], [-1.4, -0.82]].forEach(([x, z]) => { const w = makeWheel(); w.scale.setScalar(0.5); w.position.set(x, 0.3, z); g.add(w); });
    g.position.set(-62 + i * 15 + hash(i) * 4, 0, 25.5 + (i % 2) * 3.4); g.rotation.y = (i % 2 ? 0 : Math.PI) + (hash(i + 5) - 0.5) * 0.1; scene.add(g);
  }
  // traffic cones near each dock
  const coneGeo = new THREE.ConeGeometry(0.22, 0.6, 12); coneGeo.translate(0, 0.3, 0);
  const cones = inst(coneGeo, M.orange, 16);
  TRUCKS.forEach((t, i) => [[-6.5, 11.4], [9.8, 11.4], [-6.5, 16.6], [9.8, 16.6]].forEach(([dx, z], k) => { dummy.position.set(t.stop + dx, 0, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); cones.setMatrixAt(i * 4 + k, dummy.matrix); }));
  // loose pallet stacks on the floor + dock numbers
  const floorStock = [];
  for (let k = 0; k < 14; k++) floorStock.push({ x: -8 + (k % 7) * 2.6 + hash(k) * 0.4, z: 1.0 + Math.floor(k / 7) * 1.5, c: CART[k % CART.length], t0: 0.30 + k * 0.012, ry: (hash(k + 2) - 0.5) * 0.5 });
  const fsBase = inst(palletGeo, M.wood, floorStock.length), fsLoad = inst(loadGeo, M.carton, floorStock.length);
  floorStock.forEach((q, i) => fsLoad.setColorAt(i, new THREE.Color(q.c)));
  TRUCKS.forEach((t, i) => {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshStandardMaterial({ map: decalTex('DOCK ' + (i + 1), '#F2C230', '#1B1D20'), roughness: 0.7 }));
    d.rotation.x = -Math.PI / 2; d.position.set(t.stop + 2.2, 0.02, 7.0); d.receiveShadow = true; scene.add(d);
  });

  /* ---------- ghost outlines (the "plans") ---------- */
  const ghostMat = new THREE.LineBasicMaterial({ color: 0xD71920, transparent: true, opacity: 0 });
  const ghosts = new THREE.Group(); scene.add(ghosts);
  const ghostBox = (w, h, d, x, y, z) => { const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), ghostMat); e.position.set(x, y, z); ghosts.add(e); };
  BLOCKS.forEach((b) => ghostBox(BAYS * BAYW, LEVELS * LVLH + 0.3, 2 * ROWD + GAP, b.x0 + (BAYS * BAYW) / 2, (LEVELS * LVLH + 0.3) / 2, b.z0 + ROWD + GAP / 2));
  ghostBox(mzW, MZ.h + 0.2, mzD, mzCx, (MZ.h + 0.2) / 2, mzCz);
  const grid = new THREE.GridHelper(76, 76, 0xD71920, 0xBFC4CC); grid.position.set(0, 0.006, -8.5);
  grid.scale.z = (SZ1 - SZ0) / 76; grid.material.transparent = true; grid.material.opacity = 0; scene.add(grid);

  /* ---------- forklifts (3) ---------- */
  function makeForklift() {
    const f = new THREE.Group();
    const fadd = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; f.add(o); return o; };
    fadd(rb(1.5, 0.75, 1.05, 0.1), M.paint, -0.2, 0.68, 0);
    fadd(rb(0.55, 0.7, 1.0, 0.1), M.dark, -1.05, 0.8, 0);
    fadd(rb(0.5, 0.12, 0.7, 0.04), M.rubber, -0.25, 1.12, 0); fadd(rb(0.1, 0.4, 0.7, 0.04), M.rubber, -0.52, 1.35, 0);
    fadd(new THREE.TorusGeometry(0.13, 0.02, 8, 16), M.dark, 0.32, 1.28, 0).rotation.y = Math.PI / 2;
    [0.42, -0.42].forEach((z) => fadd(bx(0.07, 2.05, 0.1), M.beam, 0.66, 1.1, z * 1.05));
    [0.4, 1.0, 1.7, 2.1].forEach((y) => fadd(bx(0.06, 0.06, 0.95), M.beam, 0.66, y + 0.1, 0));
    fadd(bx(0.14, 0.4, 1.0), M.beam, 0.74, 0.62, 0);
    [0.28, -0.28].forEach((z) => fadd(rb(1.0, 0.07, 0.12, 0.02), M.steel, 1.2, 0.3, z));
    [[0.2, 0.46], [0.2, -0.46], [-0.6, 0.46], [-0.6, -0.46]].forEach(([x, z]) => fadd(bx(0.05, 1.2, 0.05), M.dark, x, 1.5, z * 0.95));
    fadd(rb(1.0, 0.05, 1.1, 0.02), M.dark, -0.2, 2.1, 0);
    fadd(rb(0.14, 0.1, 0.14, 0.03), M.amber, -0.35, 2.2, 0);
    [[0.3, 0.55], [0.3, -0.55], [-0.75, 0.55], [-0.75, -0.55]].forEach(([x, z]) => { const w = makeWheel(); w.scale.setScalar(0.52); w.position.set(x, 0.29, z); f.add(w); });
    const load = new THREE.Group(); load.position.set(1.25, 0.34, 0);
    const lb = new THREE.Mesh(palletGeo, M.wood); lb.castShadow = true; load.add(lb); const ll = new THREE.Mesh(loadGeo, M.carton); ll.position.y = 0.144; ll.castShadow = true; load.add(ll);
    f.add(load); scene.add(f); return { f, load };
  }
  const forks = [
    { ...makeForklift(), z: 6.6, x0: -34, x1: 32, ph: 0 }, { ...makeForklift(), z: -4.2, x0: -33, x1: 30, ph: 1.7 }, { ...makeForklift(), z: -9.8 + 0.0, x0: -30, x1: -12, ph: 3.1 },
  ];

  /* ---------- workers ---------- */
  const workers = [];
  const limb = (r, len, m) => { const g = new THREE.CylinderGeometry(r, r * 0.9, len, 10); g.translate(0, -len / 2, 0); return new THREE.Mesh(g, m); };
  function makeWorker(x, y, z, o = {}) {
    const g = new THREE.Group();
    const add = (m, parent = g) => { m.castShadow = true; parent.add(m); return m; };
    const vestM = o.vest || M.vest;
    const torso = add(new THREE.Mesh(rb(0.4, 0.52, 0.26, 0.06), vestM)); torso.position.y = 0.95;
    [0.05, -0.1].forEach((dy) => { const s = new THREE.Mesh(bx(0.41, 0.045, 0.27), M.refl); s.position.set(0, 0.95 + dy, 0); g.add(s); });
    const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 12), M.skin)); head.position.y = 1.4;
    const hat = add(new THREE.Mesh(new THREE.SphereGeometry(0.165, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), o.hat || M.hat)); hat.position.y = 1.43;
    const brim = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 18), o.hat || M.hat)); brim.position.y = 1.43;
    const mkLeg = (dx) => { const p = new THREE.Group(); p.position.set(dx, 0.7, 0); add(limb(0.075, 0.66, M.navy), p); const b = add(new THREE.Mesh(rb(0.12, 0.08, 0.24, 0.02), M.dark), p); b.position.set(0, -0.68, 0.04); g.add(p); return p; };
    const mkArm = (dx) => { const p = new THREE.Group(); p.position.set(dx, 1.15, 0); add(limb(0.055, 0.5, M.navy), p); const h = add(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 8), M.skin), p); h.position.y = -0.52; g.add(p); return p; };
    const w = { g, legL: mkLeg(-0.1), legR: mkLeg(0.1), armL: mkArm(-0.26), armR: mkArm(0.26), x, y, z, ph: Math.random() * 6, start: 0.40 + workers.length * 0.03, walk: o.walk || null };
    g.position.set(x, y, z); g.scale.setScalar(0); scene.add(g); workers.push(w); return w;
  }
  const yellowHat = std(0xF2C230, { roughness: 0.4 }), blueVest = std(0x2F6FDB, { roughness: 0.7 });
  makeWorker(-28, 0, 6.6); makeWorker(-22, 0, 7.4, { walk: [-30, -19] }); makeWorker(-9, 0, 6.6, { hat: yellowHat }); makeWorker(2, 0, 7.3);
  makeWorker(14, 0, 6.8, { walk: [6, 20], hat: yellowHat }); makeWorker(26, 0, 6.6); makeWorker(33, 0, 7.4, { vest: blueVest });
  makeWorker(-6, 0, -0.6); makeWorker(1, 0, -3.6, { vest: blueVest, hat: yellowHat }); makeWorker(8, 0, -0.8, { walk: [-4, 9] });
  makeWorker(-3, MZ.h + 0.2, -16); makeWorker(4, MZ.h + 0.2, -14.5, { hat: yellowHat }); makeWorker(-26, 0, -4.8); makeWorker(30, 0, -4.8, { vest: blueVest });

  /* ---------- handover badge ---------- */
  const badge = new THREE.Group();
  badge.add(new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.26, 18, 56), M.paint));
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 0.14, 48), M.white); disc.rotation.x = Math.PI / 2; badge.add(disc);
  const ck1 = new THREE.Mesh(rb(0.44, 1.3, 0.38, 0.1), M.paint); ck1.position.set(-0.7, -0.2, 0.12); ck1.rotation.z = Math.PI / 4; badge.add(ck1);
  const ck2 = new THREE.Mesh(rb(0.44, 2.45, 0.38, 0.1), M.paint); ck2.position.set(0.45, 0.32, 0.12); ck2.rotation.z = -Math.PI / 4; badge.add(ck2);
  badge.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  badge.position.set(0, 12.5, -2); badge.scale.setScalar(0); scene.add(badge);

  /* ---------- captions ---------- */
  const caps = [...root.querySelectorAll('.cp')], dots = [...root.querySelectorAll('.sdots i')];
  let capIdx = -1;
  const setCap = (i) => { if (i === capIdx) return; capIdx = i; caps.forEach((c, k) => c.classList.toggle('on', k === i)); dots.forEach((d, k) => d.classList.toggle('on', k <= i)); };

  /* ---------- per-frame update ---------- */
  const M4 = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(rx, ry, rz);
    if (sx === 0 || sy === 0 || sz === 0) dummy.scale.set(0, 0, 0); else dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix(); return dummy.matrix;
  };
  const dz = ROWD - 0.1;
  function update(p, time) {
    posts.forEach((q, i) => { const g = eo(seg(p, segStart(q.l, q.bi), segStart(q.l, q.bi) + 0.03)); postMesh.setMatrixAt(i, M4(q.x, q.l * LVLH, q.z, g < 0.003 ? 0 : 1, g < 0.003 ? 0 : LVLH * g, 1)); });
    postMesh.instanceMatrix.needsUpdate = true;
    plates.forEach((q, i) => { const g = seg(p, segStart(0, q.bi), segStart(0, q.bi) + 0.01); plateMesh.setMatrixAt(i, M4(q.x, 0, q.z, g < 0.003 ? 0 : 1, 1, 1)); });
    plateMesh.instanceMatrix.needsUpdate = true;
    guards.forEach((q, i) => { const g = eo(seg(p, segStart(0, q.bi) + 0.02, segStart(0, q.bi) + 0.05)); guardMesh.setMatrixAt(i, M4(q.x, 0, q.z, g < 0.003 ? 0 : 1, g < 0.003 ? 0 : g, 1)); });
    guardMesh.instanceMatrix.needsUpdate = true;
    beams.forEach((q, i) => {
      const a = q.l >= LEVELS ? segStart(LEVELS - 1, q.bi) + 0.03 : segStart(q.l, q.bi) + 0.012;
      const g = eo(seg(p, a, a + 0.026));
      beamMesh.setMatrixAt(i, M4(q.x, q.l * LVLH + 0.1, q.z, g < 0.003 ? 0 : BAYW * g, 1, 1));
    });
    beamMesh.instanceMatrix.needsUpdate = true;
    braces.forEach((q, i) => {
      const h = LVLH * 0.8, L = Math.hypot(dz, h), ang = Math.atan2(dz, h) * q.dir;
      const g = eo(seg(p, segStart(q.l, q.bi) + 0.016, segStart(q.l, q.bi) + 0.045));
      braceMesh.setMatrixAt(i, M4(q.x, q.y - h * 0.5, q.z - (dz * 0.5) * q.dir, g < 0.003 ? 0 : 1, g < 0.003 ? 0 : L * g, 1, ang, 0, 0));
    });
    braceMesh.instanceMatrix.needsUpdate = true;

    TRUCKS.forEach((t) => {
      const x = truckX(t, p);
      t.g.position.set(x, 0, TRUCK_Z);
      t.wheels.forEach((w) => { w.rotation.z = -x / 0.56; });
      t.straps.forEach((s) => { s.visible = p < t.first - 0.012; });
    });
    pallets.forEach((pl, i) => {
      const tx = truckX(pl.t, p), s = pl.slot;
      let x, y, z, ry;
      if (p < pl.t0) { x = tx + pl.cx; y = pl.cy; z = TRUCK_Z + pl.cz; ry = Math.PI / 2; }
      else {
        const u = eio(seg(p, pl.t0, pl.t1));
        x = lerp(pl.t.stop + pl.cx, s.x, u); z = lerp(TRUCK_Z + pl.cz, s.z, u);
        y = lerp(pl.cy, s.y, u) + Math.sin(Math.PI * u) * 3.4; ry = (Math.PI / 2) * (1 - u);
      }
      baseMesh.setMatrixAt(i, M4(x, y, z, 1, 1, 1, 0, ry, 0));
      loadMesh.setMatrixAt(i, M4(x, y + 0.144, z, 1, 1, 1, 0, ry, 0));
    });
    baseMesh.instanceMatrix.needsUpdate = true; loadMesh.instanceMatrix.needsUpdate = true;
    stock.forEach((q, i) => {
      const g = eback(seg(p, q.t0, q.t0 + 0.03)), s = g < 0.003 ? 0 : g;
      stockBase.setMatrixAt(i, M4(q.s.x, q.s.y, q.s.z, s, s, s, 0, q.ry, 0)); stockLoad.setMatrixAt(i, M4(q.s.x, q.s.y + 0.144 * s, q.s.z, s, s, s, 0, q.ry, 0));
    });
    stockBase.instanceMatrix.needsUpdate = true; stockLoad.instanceMatrix.needsUpdate = true;
    floorStock.forEach((q, i) => {
      const g = eback(seg(p, q.t0, q.t0 + 0.03)), s = g < 0.003 ? 0 : g;
      fsBase.setMatrixAt(i, M4(q.x, 0, q.z, s, s, s, 0, q.ry, 0)); fsLoad.setMatrixAt(i, M4(q.x, 0.144 * s, q.z, s, s, s, 0, q.ry, 0));
    });
    fsBase.instanceMatrix.needsUpdate = true; fsLoad.instanceMatrix.needsUpdate = true;

    // mezzanine
    mzPosts.forEach((q, i) => {
      const g = eo(seg(p, MZ0 + (i % 4) * 0.01, MZ0 + 0.05 + (i % 4) * 0.01));
      mzPostMesh.setMatrixAt(i, M4(q.x, 0.02, q.z, g < 0.003 ? 0 : 1, g < 0.003 ? 0 : MZ.h * g, 1));
      mzBase.setMatrixAt(i, M4(q.x, 0, q.z, g < 0.003 ? 0 : 1, 1, 1));
    });
    mzPostMesh.instanceMatrix.needsUpdate = true; mzBase.instanceMatrix.needsUpdate = true;
    const gb = eo(seg(p, MZ0 + 0.05, MZ0 + 0.09));
    mzBeams.forEach(({ m, z }) => { m.visible = gb > 0.003; m.scale.set(Math.max(0.0001, mzW * gb), 0.24, 0.12); m.position.set(mzCx, MZ.h - 0.14, z); });
    const gp = eo(seg(p, MZ0 + 0.08, MZ0 + 0.13));
    mzPlate.visible = gp > 0.003; mzPlate.scale.set(Math.max(0.0001, mzW * gp), 0.1, Math.max(0.0001, mzD * gp)); mzPlate.position.set(mzCx, MZ.h + 0.05, mzCz);
    const gr = eo(seg(p, MZ0 + 0.12, MZ0 + 0.16));
    rails.forEach(({ m, r, hh }) => { m.visible = gr > 0.003; if (r.w > r.d) m.scale.set(Math.max(0.0001, r.w * gr), 0.05, 0.05); else m.scale.set(0.05, 0.05, Math.max(0.0001, r.d * gr)); m.position.set(r.x, MZ.h + 0.1 + hh, r.z); });
    railPosts.forEach((q, i) => rpMesh.setMatrixAt(i, M4(q.x, MZ.h + 0.1, q.z, gr < 0.003 ? 0 : 1, gr < 0.003 ? 0 : 1.1 * gr, 1)));
    rpMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < STEPS; i++) {
      const g = eback(seg(p, MZ0 + 0.13 + i * 0.004, MZ0 + 0.16 + i * 0.004));
      stepMesh.setMatrixAt(i, M4(stairX, MZ.h - (i + 1) * (MZ.h / STEPS) + 0.04, MZ.z1 + 0.15 + i * STEPD, g < 0.003 ? 0 : 1.2 * g, 0.1, STEPD));
    }
    stepMesh.instanceMatrix.needsUpdate = true;
    const gs = eo(seg(p, MZ0 + 0.17, MZ0 + 0.2)), slopeLen = Math.hypot(MZ.h, STEPS * STEPD), slopeAng = Math.atan2(MZ.h, STEPS * STEPD);
    stringers.forEach(({ m, dx }) => { m.visible = gs > 0.003; m.scale.set(0.06, 0.18, Math.max(0.0001, slopeLen * gs)); m.position.set(stairX + dx, MZ.h / 2, MZ.z1 + (STEPS * STEPD) / 2 + 0.1); m.rotation.set(slopeAng, 0, 0); });
    stairRails.forEach(({ m, dx }) => { m.visible = gs > 0.003; m.scale.set(0.045, 0.045, Math.max(0.0001, slopeLen * gs)); m.position.set(stairX + dx, MZ.h / 2 + 0.95, MZ.z1 + (STEPS * STEPD) / 2 + 0.1); m.rotation.set(slopeAng, 0, 0); });
    mzLoads.forEach((l, i) => {
      const g = eback(seg(p, MZ0 + 0.19 + i * 0.006, MZ0 + 0.23 + i * 0.006)), s = g < 0.003 ? 0 : g;
      mzPal.setMatrixAt(i, M4(l.x, MZ.h + 0.1, l.z, s, s, s, 0, i * 0.4, 0)); mzLoadMesh.setMatrixAt(i, M4(l.x, MZ.h + 0.1 + 0.144 * s, l.z, s, s, s, 0, i * 0.4, 0));
    });
    mzPal.instanceMatrix.needsUpdate = true; mzLoadMesh.instanceMatrix.needsUpdate = true;

    // extra elements
    containers.forEach(({ m, lv, i }) => { const g = eback(seg(p, 0.05 + i * 0.03 + lv * 0.03, 0.12 + i * 0.03 + lv * 0.03)); m.visible = g > 0.003; m.scale.set(2.5, 2.6 * Math.max(0.001, g), 11.5); m.position.y = (2.6 * Math.max(0.001, g)) / 2 + lv * 2.62; });
    const cvT = (time * 0.0006) % 1;
    for (let i = 0; i < 9; i++) { const f = (cvT + i / 9) % 1; cvBoxes.setMatrixAt(i, M4(lerp(CV.x0 + 0.5, CV.x1 - 0.5, f), CV.y + 0.32, CV.z + (i % 3 - 1) * 0.0, seg(p, 0.30, 0.34) > 0 ? 1 : 0, 1, 1)); }
    cvBoxes.instanceMatrix.needsUpdate = true;
    const cr = seg(p, 0.3, 0.36);
    bridge.visible = cr > 0.001; bridge.scale.setScalar(Math.max(0.001, cr));
    const bx0 = Math.sin(p * 20) * 26, tz = Math.sin(p * 31 + 1) * 8;
    bridge.position.set(bx0, WH - 3.2, (SZ0 + SZ1 - 1.0) / 2); trolley.position.set(0, -0.4, tz);
    const drop = 2.8 + (Math.sin(p * 40) + 1) * 2.4; cable.scale.set(0.06, drop, 0.06); cable.position.y = -drop / 2; hook.position.y = -drop; hookLoad.position.y = -drop - 0.9; hookLoad.visible = Math.sin(p * 40) > -0.3;

    ghostMat.opacity = seg(p, 0.0, 0.1) * (1 - seg(p, 0.5, 0.75)) * 0.9;
    grid.material.opacity = seg(p, 0, 0.1) * (1 - seg(p, 0.28, 0.45)) * 0.7;

    // forklifts
    const fa = seg(p, 0.40, 0.88);
    forks.forEach((fk, i) => {
      const ph = fa * Math.PI * (5 + i) - Math.PI / 2 + fk.ph;
      fk.f.position.set(lerp(fk.x0, fk.x1, (Math.sin(ph) + 1) / 2), 0, fk.z);
      fk.f.rotation.y = Math.cos(ph) >= 0 ? 0 : Math.PI;
      fk.f.visible = fa > 0 && fa < 1; fk.load.visible = Math.sin(ph * 0.5) > -0.2;
    });

    workers.forEach((w, i) => {
      const s = eback(seg(p, w.start, w.start + 0.04));
      w.g.scale.setScalar(Math.max(0.0001, s));
      if (w.walk) {
        const f = (Math.sin(time * 0.0004 + w.ph) + 1) / 2, dir = Math.cos(time * 0.0004 + w.ph) >= 0 ? 1 : -1;
        w.g.position.set(lerp(w.walk[0], w.walk[1], f), w.y, w.z); w.g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const sw = Math.sin(time * 0.009) * 0.7;
        w.legL.rotation.x = sw; w.legR.rotation.x = -sw; w.armL.rotation.x = -sw; w.armR.rotation.x = sw;
      } else {
        w.g.position.set(w.x, w.y, w.z); w.g.rotation.y = Math.sin(time * 0.0006 + i) * 0.8;
        w.armR.rotation.x = -0.4 + Math.sin(time * 0.003 + w.ph) * 0.25; w.armL.rotation.x = 0; w.legL.rotation.x = 0; w.legR.rotation.x = 0;
      }
    });

    badge.scale.setScalar(Math.max(0.0001, eback(seg(p, 0.9, 0.96))));
    badge.position.y = 12.5 + Math.sin(time * 0.002) * 0.3;

    // camera orbit
    const aspect = Math.max(0.4, stage.clientWidth / Math.max(1, stage.clientHeight));
    const az = lerp(24, 56, eio(p)) * Math.PI / 180;
    const el = lerp(36, 30, seg(p, 0.5, 1)) * Math.PI / 180;
    let R = 128 - 18 * eo(seg(p, 0, 0.5)) + 26 * eio(seg(p, 0.84, 1));
    R *= Math.min(2.4, Math.max(1, 1.5 / aspect));
    const tgt = new THREE.Vector3(0, 1.5, -1.5);
    cam.position.set(tgt.x + R * Math.sin(az) * Math.cos(el), tgt.y + R * Math.sin(el), tgt.z + R * Math.cos(az) * Math.cos(el));
    cam.lookAt(tgt);
    badge.rotation.y = az;

    setCap(p < 0.22 ? 0 : p < 0.42 ? 1 : p < 0.86 ? 2 : 3);
    root.style.setProperty('--p', p.toFixed(4));
  }

  /* ---------- post-processing: MSAA + GTAO + tone mapping ---------- */
  let composer = null;
  if (HIGH) {
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, cam));
    const gtao = new GTAOPass(scene, cam, 4, 4);
    gtao.output = GTAOPass.OUTPUT.Default;
    gtao.blendIntensity = 0.9;
    gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.6, thickness: 2.0, scale: 1.25, samples: 16, distanceFallOff: 1.0 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 16 });
    composer.addPass(gtao);
    composer.addPass(new OutputPass());
  }

  /* ---------- scroll, resize, loop ---------- */
  let target = 0, cur = 0, visible = true;
  const topOffset = () => parseFloat(getComputedStyle(stage).top) || 0;
  const readScroll = () => { const r = root.getBoundingClientRect(); target = clamp((topOffset() - r.top) / Math.max(1, r.height - stage.offsetHeight)); };
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, HIGH ? 1.75 : 1.25);
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    if (composer) { composer.setPixelRatio(dpr); composer.setSize(w, h); }
    cam.aspect = w / Math.max(1, h); cam.updateProjectionMatrix();
  };
  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', () => { resize(); readScroll(); });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: '200px' }).observe(root);
  resize(); readScroll(); cur = target;

  const render = () => { if (composer) composer.render(); else renderer.render(scene, cam); };
  const loop = (time) => {
    requestAnimationFrame(loop);
    if (!visible) return;
    cur += (target - cur) * 0.14;
    if (Math.abs(target - cur) < 0.0004) cur = target;
    update(cur, time);
    render();
  };
  requestAnimationFrame(loop);
  window.__scene3d = {
    get p() { return cur; }, set: (v) => { target = cur = v; },
    snap: (v, type = 'image/jpeg', q = 0.92) => { cur = target = v; update(v, 4000); render(); return canvas.toDataURL(type, q); },
  };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
