import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ParticleSystem, glowTexture } from './particles.js';
import { AudioEngine } from './audio.js';

const FIELD = { halfX: 44, halfZ: 30, goalHalf: 10, goalHeight: 9, goalDepth: 3.6 };
const BALL_R = 2.4;
const MATCH_TIME = 120;
const TEAM = {
  blue: { color: 0x179dff, soft: 0x8fdcff, dark: 0x073967, name: 'BLUE' },
  orange: { color: 0xff6f1f, soft: 0xffc37d, dark: 0x6b2405, name: 'ORANGE' },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// ---------------------------------------------------------------- DOM
const $ = (id) => document.getElementById(id);
const dom = {
  app: $('app'),
  canvas: $('scene'),
  scoreBlue: $('score-blue'),
  scoreOrange: $('score-orange'),
  clock: $('clock'),
  clockLabel: $('clock-label'),
  boostArc: $('boost-arc'),
  boostValue: $('boost-value'),
  speedValue: $('speed-value'),
  speedFill: $('speed-fill'),
  ballCam: $('ball-cam'),
  announce: $('announce'),
  announceMain: $('announce-main'),
  announceSub: $('announce-sub'),
  start: $('start-screen'),
  pause: $('pause-screen'),
  end: $('end-screen'),
  endTitle: $('end-title'),
  endScore: $('end-score'),
  endKicker: $('end-kicker'),
  loading: $('loading'),
  play: $('play-button'),
  resume: $('resume-button'),
  restart: $('restart-button'),
  again: $('again-button'),
};

// ---------------------------------------------------------------- Renderer
const renderer = new THREE.WebGLRenderer({
  canvas: dom.canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.88;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03060d);
scene.fog = new THREE.FogExp2(0x040812, 0.0075);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 26, 58);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.28;
pmrem.dispose();

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.4,
  0.6,
  0.9
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------------------------------------------------------------- Lights
const hemi = new THREE.HemisphereLight(0x5f9bd8, 0x07101b, 0.7);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xdcefff, 1.85);
key.position.set(34, 58, 26);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -74;
key.shadow.camera.right = 74;
key.shadow.camera.top = 64;
key.shadow.camera.bottom = -64;
key.shadow.camera.near = 4;
key.shadow.camera.far = 160;
key.shadow.bias = -0.0005;
key.shadow.normalBias = 0.035;
scene.add(key);
scene.add(key.target);

const rim = new THREE.DirectionalLight(0x2f7fd0, 0.8);
rim.position.set(-40, 28, -40);
scene.add(rim);

const goalLightBlue = new THREE.PointLight(0x1d8fff, 90, 78, 1.75);
goalLightBlue.position.set(-44, 10, 0);
scene.add(goalLightBlue);
const goalLightOrange = new THREE.PointLight(0xff731f, 90, 78, 1.75);
goalLightOrange.position.set(44, 10, 0);
scene.add(goalLightOrange);

const overhead = new THREE.PointLight(0x9fd8ff, 65, 110, 1.7);
overhead.position.set(0, 38, 0);
scene.add(overhead);

const particles = new ParticleSystem(scene, 1200);
const audio = new AudioEngine();

function createStars() {
  const positions = [];
  const colors = [];
  const palette = [new THREE.Color(0xbcdcff), new THREE.Color(0x6fa8e8), new THREE.Color(0xffffff), new THREE.Color(0xffd2a1)];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const el = Math.random() * Math.PI * 0.48 + 0.04;
    const r = 150 + Math.random() * 90;
    positions.push(Math.cos(a) * Math.cos(el) * r, Math.sin(el) * r + 6, Math.sin(a) * Math.cos(el) * r);
    const c = palette[Math.floor(Math.random() * palette.length)];
    colors.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.75,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    fog: false,
  }));
  scene.add(stars);
  return stars;
}
const stars = createStars();

// ---------------------------------------------------------------- Textures
function makeFieldTexture() {
  const W = 2048;
  const H = 1400;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const px = (x) => ((x + FIELD.halfX) / (FIELD.halfX * 2)) * W;
  const pz = (z) => ((z + FIELD.halfZ) / (FIELD.halfZ * 2)) * H;

  ctx.fillStyle = '#060d18';
  ctx.fillRect(0, 0, W, H);

  const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.68);
  bg.addColorStop(0, 'rgba(27, 53, 83, 0.65)');
  bg.addColorStop(0.55, 'rgba(9, 20, 35, 0.9)');
  bg.addColorStop(1, 'rgba(2, 6, 12, 1)');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const blueTint = ctx.createLinearGradient(0, 0, W / 2, 0);
  blueTint.addColorStop(0, 'rgba(18, 104, 190, 0.24)');
  blueTint.addColorStop(1, 'rgba(10, 45, 90, 0)');
  ctx.fillStyle = blueTint;
  ctx.fillRect(0, 0, W / 2, H);

  const orangeTint = ctx.createLinearGradient(W, 0, W / 2, 0);
  orangeTint.addColorStop(0, 'rgba(190, 84, 18, 0.2)');
  orangeTint.addColorStop(1, 'rgba(90, 40, 10, 0)');
  ctx.fillStyle = orangeTint;
  ctx.fillRect(W / 2, 0, W / 2, H);

  // subtle noise
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = `rgba(140, 200, 255, ${Math.random() * 0.035})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.4, 1.4);
  }

  // grid
  ctx.lineWidth = 1.4;
  for (let x = -FIELD.halfX; x <= FIELD.halfX; x += 4) {
    ctx.strokeStyle = x % 20 === 0 ? 'rgba(110, 195, 255, 0.18)' : 'rgba(90, 160, 220, 0.08)';
    ctx.beginPath();
    ctx.moveTo(px(x), 0);
    ctx.lineTo(px(x), H);
    ctx.stroke();
  }
  for (let z = -FIELD.halfZ; z <= FIELD.halfZ; z += 4) {
    ctx.strokeStyle = z % 20 === 0 ? 'rgba(110, 195, 255, 0.18)' : 'rgba(90, 160, 220, 0.08)';
    ctx.beginPath();
    ctx.moveTo(0, pz(z));
    ctx.lineTo(W, pz(z));
    ctx.stroke();
  }

  const neon = (color, width = 4) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
  };

  // outer boundary
  neon('rgba(95, 205, 255, 0.95)', 5);
  ctx.strokeRect(px(-FIELD.halfX + 0.7), pz(-FIELD.halfZ + 0.7), px(FIELD.halfX - 0.7) - px(-FIELD.halfX + 0.7), pz(FIELD.halfZ - 0.7) - pz(-FIELD.halfZ + 0.7));

  // center line + circle
  neon('rgba(175, 230, 255, 0.8)', 4);
  ctx.beginPath();
  ctx.moveTo(px(0), pz(-FIELD.halfZ));
  ctx.lineTo(px(0), pz(FIELD.halfZ));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0), pz(0), (W / (FIELD.halfX * 2)) * 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(95, 205, 255, 0.1)';
  ctx.beginPath();
  ctx.arc(px(0), pz(0), (W / (FIELD.halfX * 2)) * 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(px(0), pz(0), 7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(210, 245, 255, 0.9)';
  ctx.fill();

  // goal boxes
  for (const side of [-1, 1]) {
    const color = side < 0 ? 'rgba(80, 185, 255, 0.9)' : 'rgba(255, 150, 70, 0.9)';
    neon(color, 4);
    const boxW = px(side * 34) - px(side * 44);
    ctx.strokeRect(Math.min(px(side * 34), px(side * 44)), pz(-18), Math.abs(boxW), pz(18) - pz(-18));
    ctx.strokeRect(Math.min(px(side * 39), px(side * 44)), pz(-11), Math.abs(px(side * 39) - px(side * 44)), pz(11) - pz(-11));
    ctx.shadowBlur = 0;
    ctx.fillStyle = side < 0 ? 'rgba(30, 120, 200, 0.09)' : 'rgba(200, 100, 30, 0.08)';
    ctx.fillRect(Math.min(px(side * 34), px(side * 44)), pz(-18), Math.abs(boxW), pz(18) - pz(-18));
  }

  // field lettering
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(170, 225, 255, 0.045)';
  ctx.font = '900 150px "Arial Black", sans-serif';
  ctx.fillText('NEON', px(-21), pz(0));
  ctx.fillStyle = 'rgba(255, 190, 130, 0.04)';
  ctx.fillText('CUP', px(21), pz(0));

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeBallTexture() {
  const W = 1024;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e6ecf2';
  ctx.fillRect(0, 0, W, H);

  const r = 46;
  const hStep = r * 1.5;
  const vStep = r * Math.sqrt(3);
  let row = 0;
  for (let y = -r; y < H + r; y += vStep, row++) {
    for (let x = -r; x < W + r; x += hStep * 2) {
      const cx = x + (row % 2 ? hStep : 0);
      const dark = Math.random() < 0.42;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const vx = cx + Math.cos(a) * r * 0.98;
        const vy = y + Math.sin(a) * r * 0.98;
        if (i === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fillStyle = dark ? '#131c28' : '#f4f8fc';
      ctx.fill();
      ctx.strokeStyle = 'rgba(90, 110, 130, 0.55)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, 'rgba(5, 12, 22, 0.72)');
  gradient.addColorStop(0.25, 'rgba(5, 12, 22, 0)');
  gradient.addColorStop(0.75, 'rgba(5, 12, 22, 0)');
  gradient.addColorStop(1, 'rgba(5, 12, 22, 0.72)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return texture;
}

function makeBannerTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 256);
  ctx.font = 'italic 900 152px "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 512, 136);
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.25;
  ctx.fillText(text, 512, 136);
  ctx.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// ---------------------------------------------------------------- Arena
const fieldTexture = makeFieldTexture();

function createArena() {
  const arena = new THREE.Group();
  scene.add(arena);

  const floorMat = new THREE.MeshStandardMaterial({
    map: fieldTexture,
    emissiveMap: fieldTexture,
    emissive: new THREE.Color(0x2a7cb5),
    emissiveIntensity: 0.22,
    roughness: 0.62,
    metalness: 0.3,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.halfX * 2, FIELD.halfZ * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  arena.add(floor);

  const outerFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(132, 108),
    new THREE.MeshStandardMaterial({ color: 0x03070e, roughness: 0.96, metalness: 0.15 })
  );
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.y = -0.04;
  outerFloor.receiveShadow = true;
  arena.add(outerFloor);

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x0a1a2e,
    metalness: 0.7,
    roughness: 0.24,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  function wall(w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    mesh.position.set(x, y, z);
    arena.add(mesh);
    return mesh;
  }

  const H = 10;
  // side walls
  wall(FIELD.halfX * 2, H, 0.4, 0, H / 2, -FIELD.halfZ);
  wall(FIELD.halfX * 2, H, 0.4, 0, H / 2, FIELD.halfZ);
  // end walls with a goal opening
  for (const side of [-1, 1]) {
    const x = side * FIELD.halfX;
    const segW = FIELD.halfZ - FIELD.goalHalf;
    wall(0.4, H, segW, x, H / 2, -(FIELD.goalHalf + segW / 2));
    wall(0.4, H, segW, x, H / 2, FIELD.goalHalf + segW / 2);
    wall(0.4, H - FIELD.goalHeight, FIELD.goalHalf * 2, x, FIELD.goalHeight + (H - FIELD.goalHeight) / 2, 0);
  }

  // wall neon rails and columns
  const railMat = new THREE.MeshBasicMaterial({ color: 0x5fd0ff, toneMapped: false });
  const railMatOrange = new THREE.MeshBasicMaterial({ color: 0xff9040, toneMapped: false });
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(FIELD.halfX * 2, 0.14, 0.18), side < 0 ? railMatOrange : railMat);
    rail.position.set(0, H, side * FIELD.halfZ);
    arena.add(rail);
  }
  for (let x = -40; x <= 40; x += 8) {
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, H * 0.86, 0.07),
        new THREE.MeshBasicMaterial({ color: x < 0 ? 0x2a9dff : 0xff7a2a, transparent: true, opacity: 0.5, toneMapped: false })
      );
      strip.position.set(x, H * 0.46, side * (FIELD.halfZ - 0.22));
      arena.add(strip);
    }
  }

  // floor neon edges
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      new THREE.BoxGeometry(FIELD.halfX * 2, 0.08, 0.3),
      new THREE.MeshBasicMaterial({ color: side < 0 ? 0xff8030 : 0x54c8ff, toneMapped: false })
    );
    edge.position.set(0, 0.05, side * (FIELD.halfZ - 0.15));
    arena.add(edge);
  }

  // center circle ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(9.7, 10, 96),
    new THREE.MeshBasicMaterial({ color: 0xa7e6ff, transparent: true, opacity: 0.65, side: THREE.DoubleSide, toneMapped: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  arena.add(ring);

  // goals
  const goalGroup = new THREE.Group();
  arena.add(goalGroup);

  function buildGoal(side) {
    const team = side < 0 ? TEAM.blue : TEAM.orange;
    const x = side * FIELD.halfX;
    const backX = side * (FIELD.halfX + FIELD.goalDepth);
    const frameMat = new THREE.MeshStandardMaterial({
      color: team.color,
      emissive: team.color,
      emissiveIntensity: 1.6,
      metalness: 0.7,
      roughness: 0.2,
      toneMapped: true,
    });

    const postGeo = new THREE.CylinderGeometry(0.32, 0.32, FIELD.goalHeight, 12);
    for (const z of [-FIELD.goalHalf, FIELD.goalHalf]) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(x, FIELD.goalHeight / 2, z);
      goalGroup.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, FIELD.goalHalf * 2, 12), frameMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, FIELD.goalHeight, 0);
    goalGroup.add(bar);

    // goal line
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.06, FIELD.goalHalf * 2),
      new THREE.MeshBasicMaterial({ color: team.soft, toneMapped: false })
    );
    line.position.set(x, 0.07, 0);
    goalGroup.add(line);

    // interior floor
    const interior = new THREE.Mesh(
      new THREE.PlaneGeometry(FIELD.goalDepth, FIELD.goalHalf * 2),
      new THREE.MeshStandardMaterial({ color: team.dark, emissive: team.color, emissiveIntensity: 0.35, roughness: 0.7 })
    );
    interior.rotation.x = -Math.PI / 2;
    interior.position.set(side * (FIELD.halfX + FIELD.goalDepth / 2), 0.015, 0);
    goalGroup.add(interior);

    // net lines
    const netMat = new THREE.LineBasicMaterial({ color: team.soft, transparent: true, opacity: 0.3 });
    const pts = [];
    for (let y = 0; y <= FIELD.goalHeight; y += 1.1) {
      pts.push(backX, y, -FIELD.goalHalf, backX, y, FIELD.goalHalf);
      pts.push(x, y, -FIELD.goalHalf, backX, y, -FIELD.goalHalf);
      pts.push(x, y, FIELD.goalHalf, backX, y, FIELD.goalHalf);
    }
    for (let z = -FIELD.goalHalf; z <= FIELD.goalHalf; z += 1.1) {
      pts.push(backX, 0, z, backX, FIELD.goalHeight, z);
      pts.push(x, 0, z, backX, 0, z);
      pts.push(x, FIELD.goalHeight, z, backX, FIELD.goalHeight, z);
    }
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    goalGroup.add(new THREE.LineSegments(netGeo, netMat));

    // team banner
    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(17, 4.25),
      new THREE.MeshBasicMaterial({
        map: makeBannerTexture(team.name, '#' + new THREE.Color(team.color).getHexString()),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    );
    banner.position.set(side * (FIELD.halfX + 0.25), 13.2, 0);
    banner.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    arena.add(banner);

    const glow = new THREE.PointLight(team.color, 70, 30, 1.8);
    glow.position.set(x + side * 1.5, 5, 0);
    arena.add(glow);
  }
  buildGoal(-1);
  buildGoal(1);

  // suspended halo
  const halo = new THREE.Group();
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(31, 0.22, 8, 120),
    new THREE.MeshBasicMaterial({ color: 0x77d4ff, transparent: true, opacity: 0.7, toneMapped: false })
  );
  torus.rotation.x = Math.PI / 2;
  halo.add(torus);
  const torus2 = new THREE.Mesh(
    new THREE.TorusGeometry(35, 0.08, 6, 120),
    new THREE.MeshBasicMaterial({ color: 0xff8d3c, transparent: true, opacity: 0.4, toneMapped: false })
  );
  torus2.rotation.x = Math.PI / 2;
  halo.add(torus2);
  halo.position.y = 35;
  arena.add(halo);

  // corner light bars hanging from halo
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i + Math.PI / 4;
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 3.4, 5.3),
      new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffa45c : 0x8fe1ff, toneMapped: false })
    );
    bar.position.set(Math.cos(a) * 33, 31, Math.sin(a) * 33);
    bar.lookAt(0, 28, 0);
    arena.add(bar);
  }

  // stadium steps
  const standMat = new THREE.MeshStandardMaterial({ color: 0x07101d, roughness: 0.82, metalness: 0.25 });
  const crowdPositions = [];
  const crowdColors = [];
  const palette = [new THREE.Color(0x2c9dff), new THREE.Color(0xff7a2c), new THREE.Color(0xa9d9ff), new THREE.Color(0xffd7a5), new THREE.Color(0x2b486e)];

  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 5; tier++) {
      const z = side * (35 + tier * 3.6);
      const y = 1.2 + tier * 1.9;
      const step = new THREE.Mesh(new THREE.BoxGeometry(108, 2.6, 3.6), standMat);
      step.position.set(0, y, z);
      step.receiveShadow = true;
      arena.add(step);

      for (let i = 0; i < 120; i++) {
        const x = -50 + Math.random() * 100;
        crowdPositions.push(x, y + 1.7, z + (Math.random() - 0.5) * 1.6);
        const c = palette[Math.floor(Math.random() * palette.length)];
        crowdColors.push(c.r, c.g, c.b);
      }
    }
  }
  // end stands
  for (const side of [-1, 1]) {
    for (let tier = 0; tier < 4; tier++) {
      const x = side * (52 + tier * 3.2);
      const y = 1.2 + tier * 1.9;
      const step = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 84), standMat);
      step.position.set(x, y, 0);
      arena.add(step);
      for (let i = 0; i < 75; i++) {
        const z = -39 + Math.random() * 78;
        crowdPositions.push(x + (Math.random() - 0.5) * 1.5, y + 1.7, z);
        const c = palette[Math.floor(Math.random() * palette.length)];
        crowdColors.push(c.r, c.g, c.b);
      }
    }
  }

  const crowdGeo = new THREE.BufferGeometry();
  crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute(crowdPositions, 3));
  crowdGeo.setAttribute('color', new THREE.Float32BufferAttribute(crowdColors, 3));
  const crowd = new THREE.Points(
    crowdGeo,
    new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.85, sizeAttenuation: true })
  );
  arena.add(crowd);

  // floodlight towers
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.36, 30, 8),
        new THREE.MeshStandardMaterial({ color: 0x223449, metalness: 0.8, roughness: 0.35 })
      );
      pole.position.set(sx * 55, 15, sz * 43);
      arena.add(pole);
      const rig = new THREE.Mesh(
        new THREE.BoxGeometry(5.8, 1.7, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xd9f3ff, toneMapped: false })
      );
      rig.position.set(sx * 55, 30, sz * 43);
      rig.lookAt(0, 2, 0);
      arena.add(rig);
    }
  }

  // floating arena dust
  const dustPos = [];
  for (let i = 0; i < 420; i++) {
    dustPos.push((Math.random() - 0.5) * 110, 4 + Math.random() * 42, (Math.random() - 0.5) * 100);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: 0x6fc5ff, size: 0.16, transparent: true, opacity: 0.5, depthWrite: false })
  );
  arena.add(dust);

  return { halo };
}

const arena = createArena();

// ---------------------------------------------------------------- Cars
function createCarVisual(teamKey) {
  const team = TEAM[teamKey];
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: team.color,
    metalness: 0.42,
    roughness: 0.32,
    clearcoat: 0.9,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.5,
  });
  const darkMat = new THREE.MeshPhysicalMaterial({
    color: 0x0a1018,
    metalness: 0.75,
    roughness: 0.18,
    clearcoat: 0.8,
    envMapIntensity: 1.1,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: team.soft,
    emissive: team.color,
    emissiveIntensity: 2.1,
    metalness: 0.6,
    roughness: 0.28,
  });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x07090d, metalness: 0.15, roughness: 0.88 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xcfe3f2, metalness: 0.95, roughness: 0.16 });

  const body = new THREE.Mesh(new RoundedBoxGeometry(4.7, 0.82, 2.34, 4, 0.22), bodyMat);
  body.position.set(0.05, 1.14, 0);
  body.castShadow = true;
  tilt.add(body);

  const nose = new THREE.Mesh(new RoundedBoxGeometry(1.75, 0.54, 2.06, 3, 0.2), bodyMat);
  nose.position.set(1.84, 0.94, 0);
  nose.castShadow = true;
  tilt.add(nose);

  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.9, 0.7, 1.66, 4, 0.24), darkMat);
  cabin.position.set(-0.34, 1.75, 0);
  cabin.castShadow = true;
  tilt.add(cabin);

  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.25, 0.2, 1.46, 3, 0.08), bodyMat);
  roof.position.set(-0.42, 2.12, 0);
  tilt.add(roof);

  // side stripes
  for (const z of [-1.17, 1.17]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.09, 0.05), accentMat);
    stripe.position.set(0.1, 1.2, z);
    tilt.add(stripe);
  }

  // front splitter + rear diffuser
  const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 2.2), darkMat);
  splitter.position.set(2.55, 0.72, 0);
  tilt.add(splitter);
  const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 2.1), darkMat);
  diffuser.position.set(-2.26, 0.78, 0);
  tilt.add(diffuser);

  // spoiler
  const wing = new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.12, 2.22, 2, 0.05), bodyMat);
  wing.position.set(-2.04, 2.0, 0);
  wing.castShadow = true;
  tilt.add(wing);
  for (const z of [-0.72, 0.72]) {
    const support = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.48, 0.12), darkMat);
    support.position.set(-1.95, 1.77, z);
    tilt.add(support);
  }

  // lights
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xf2fbff, toneMapped: false });
  for (const z of [-0.72, 0.72]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.17, 0.46), lightMat);
    light.position.set(2.65, 1.18, z);
    tilt.add(light);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false });
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 1.9), tailMat);
  tail.position.set(-2.52, 1.18, 0);
  tilt.add(tail);

  // wheels
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.67, 0.67, 0.52, 20);
  const rimGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.54, 12);
  for (const x of [-1.5, 1.5]) {
    for (const z of [-1.2, 1.2]) {
      const steer = new THREE.Group();
      steer.position.set(x, 0.68, z);
      const spinParent = new THREE.Group();
      spinParent.rotation.x = Math.PI / 2;
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = true;
      const rim = new THREE.Mesh(rimGeo, rimMat);
      spinParent.add(tire);
      spinParent.add(rim);
      steer.add(spinParent);
      tilt.add(steer);
      wheels.push({ steer, tire, rim, spinParent, front: x > 0 });
    }
  }

  // flames
  const flameMat = new THREE.MeshBasicMaterial({
    color: teamKey === 'blue' ? 0x58c8ff : 0xff9a3c,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const flames = [];
  for (const z of [-0.62, 0.62]) {
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 1.7, 10, 1, true), flameMat);
    flame.rotation.z = Math.PI / 2;
    flame.position.set(-2.6, 0.98, z);
    flame.scale.y = 0.01;
    tilt.add(flame);
    flames.push(flame);
  }

  // underglow
  const under = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 5.2),
    new THREE.MeshBasicMaterial({
      map: glowTexture,
      color: team.color,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  under.rotation.x = -Math.PI / 2;
  under.position.y = 0.04;
  root.add(under);

  const glow = new THREE.PointLight(team.color, 5, 8, 2);
  glow.position.set(0, 0.6, 0);
  root.add(glow);

  scene.add(root);
  return { root, tilt, wheels, flames, under, glow };
}

function makeCarState(teamKey) {
  const visual = createCarVisual(teamKey);
  return {
    team: teamKey,
    visual,
    pos: new THREE.Vector3(),
    yaw: 0,
    speed: 0,
    vy: 0,
    y: 0,
    grounded: true,
    jumps: 0,
    boost: 100,
    boosting: false,
    flipTimer: 0,
    wheelSpin: 0,
    steerVisual: 0,
  };
}

const player = makeCarState('blue');
const rival = makeCarState('orange');

// ---------------------------------------------------------------- Ball
const ball = {
  pos: new THREE.Vector3(0, BALL_R, 0),
  vel: new THREE.Vector3(),
  spinAxis: new THREE.Vector3(1, 0, 0),
  radius: BALL_R,
  trailTimer: 0,
};

const ballMesh = new THREE.Mesh(
  new THREE.SphereGeometry(BALL_R, 48, 32),
  new THREE.MeshPhysicalMaterial({
    map: makeBallTexture(),
    metalness: 0.18,
    roughness: 0.36,
    clearcoat: 0.8,
    clearcoatRoughness: 0.28,
    envMapIntensity: 1.2,
  })
);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

const ballGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xbfe9ff,
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
);
ballGlow.scale.set(7, 7, 1);
ballMesh.add(ballGlow);

const ballLight = new THREE.PointLight(0xbfe8ff, 8, 14, 2);
ballLight.position.set(0, 2, 0);
ballMesh.add(ballLight);

const ballShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(6.5, 6.5),
  new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: 0x000000,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  })
);
ballShadow.rotation.x = -Math.PI / 2;
scene.add(ballShadow);

// ---------------------------------------------------------------- Boost pads
const pads = [];
const PAD_LAYOUT = [
  [0, -20, true, true], [0, 20, true, true],
  [-24, -14, false], [-24, 14, false], [24, -14, false], [24, 14, false],
  [-11, -25, false], [-11, 25, false], [11, -25, false], [11, 25, false],
  [-34, -21, true], [-34, 21, true], [34, -21, true], [34, 21, true],
];

function createPads() {
  for (const [x, z, big] of PAD_LAYOUT) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const color = big ? 0xffb347 : 0x59d6ff;

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(big ? 2.2 : 1.35, big ? 2.2 : 1.35, 0.09, 6),
      new THREE.MeshStandardMaterial({ color: 0x0a1c2d, emissive: color, emissiveIntensity: 0.35, metalness: 0.7, roughness: 0.3 })
    );
    base.position.y = 0.06;
    group.add(base);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(big ? 2.4 : 1.5, big ? 0.1 : 0.07, 6, 6),
      new THREE.MeshBasicMaterial({ color, toneMapped: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.13;
    group.add(ring);

    let icon = null;
    if (big) {
      icon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.72, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false })
      );
      icon.position.y = 2.1;
      group.add(icon);
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          color,
          transparent: true,
          opacity: 0.5,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      glow.scale.set(6, 6, 1);
      glow.position.y = 0.5;
      group.add(glow);
    }

    scene.add(group);
    pads.push({
      pos: new THREE.Vector3(x, 0, z),
      big,
      active: true,
      timer: 0,
      group,
      icon,
      ring,
      color,
    });
  }
}
createPads();

// ---------------------------------------------------------------- Ring effects
const rings = [];

function spawnRing(position, color, maxScale = 22) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.14, 6, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  mesh.position.copy(position);
  mesh.rotation.x = Math.PI / 2;
  scene.add(mesh);
  rings.push({ mesh, life: 1, maxLife: 1, maxScale });
}

function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.life -= dt;
    if (r.life <= 0) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
      rings.splice(i, 1);
      continue;
    }
    const t = 1 - r.life / r.maxLife;
    const s = 1 + t * r.maxScale;
    r.mesh.scale.set(s, s, s);
    r.mesh.material.opacity = (1 - t) * 0.9;
  }
}

// ---------------------------------------------------------------- Game state
let state = 'menu';
let stateTimer = 0;
let matchTime = MATCH_TIME;
let scores = { blue: 0, orange: 0 };
let suddenDeath = false;
let timeExpired = false;
let lastCount = 4;
let pendingEnd = false;
let ballCam = true;
let shake = 0;
let announceTimer = 0;
let goalTeam = null;
let worldTime = 0;
let pausedFrom = 'playing';
let aiWake = 0;

const camLook = new THREE.Vector3(0, 2, 0);
const camPos = new THREE.Vector3(0, 26, 58);
const playerInput = { throttle: 0, steer: 0, boost: false, jump: false };

function setAnnounce(main, sub = '', color = null, duration = 0) {
  dom.announceMain.textContent = main;
  dom.announceSub.textContent = sub;
  dom.announce.style.opacity = '';
  if (color) {
    dom.announceMain.style.color = color;
    dom.announceMain.style.textShadow = `0 0 22px ${color}, 0 0 80px ${color}66, 0 18px 60px rgba(0,0,0,.8)`;
  } else {
    dom.announceMain.style.color = '';
    dom.announceMain.style.textShadow = '';
  }
  dom.announce.classList.add('show');
  announceTimer = duration;
}

function hideAnnounce() {
  dom.announce.classList.remove('show');
  announceTimer = 0;
}

function updateScoreboard() {
  dom.scoreBlue.textContent = scores.blue;
  dom.scoreOrange.textContent = scores.orange;
  updateClock();
}

function updateClock() {
  const t = Math.max(0, Math.ceil(matchTime));
  dom.clock.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  dom.clock.classList.toggle('urgent', state === 'playing' && !suddenDeath && matchTime <= 10.5);
  dom.clockLabel.textContent = suddenDeath ? 'OVERTIME' : 'MATCH';
}

function resetPositions() {
  player.pos.set(-20, 0, 0);
  player.yaw = 0;
  player.speed = 0;
  player.vy = 0;
  player.y = 0;
  player.grounded = true;
  player.jumps = 0;
  player.boost = 100;
  player.boosting = false;

  rival.pos.set(20, 0, -6);
  rival.yaw = Math.atan2(6, -20);
  rival.speed = 0;
  rival.vy = 0;
  rival.y = 0;
  rival.grounded = true;
  rival.jumps = 0;
  rival.boost = 100;
  rival.boosting = false;

  ball.pos.set(0, BALL_R, 0);
  ball.vel.set(0, 0, 0);
  ballMesh.quaternion.identity();

  for (const pad of pads) {
    pad.active = true;
    pad.timer = 0;
    pad.group.visible = true;
  }
}

function resetKickoff() {
  resetPositions();
  jumpQueued = false;
  snapCamera();
  aiWake = 0.55;
  state = 'countdown';
  stateTimer = 3.1;
  lastCount = 4;
  hideAnnounce();
  updateClock();
}

function snapCamera() {
  const forward = carForward(player);
  let offsetX = -forward.x;
  let offsetZ = -forward.z;
  if (ballCam) {
    const awayX = player.pos.x - ball.pos.x;
    const awayZ = player.pos.z - ball.pos.z;
    const awayLen = Math.hypot(awayX, awayZ);
    if (awayLen > 1.5) {
      offsetX = awayX / awayLen;
      offsetZ = awayZ / awayLen;
    }
  }
  camPos.set(
    clamp(player.pos.x + offsetX * 14.2, -51, 51),
    clamp(player.y + 7.6, 3.2, 34),
    clamp(player.pos.z + offsetZ * 14.2, -34.5, 34.5)
  );
  camLook.set(ball.pos.x, ball.pos.y + 0.6, ball.pos.z);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

function startMatch() {
  audio.init();
  audio.blip(520, 0.1, 'square', 0.06);
  scores = { blue: 0, orange: 0 };
  matchTime = MATCH_TIME;
  suddenDeath = false;
  timeExpired = false;
  pendingEnd = false;
  jumpQueued = false;
  updateScoreboard();
  resetPositions();
  snapCamera();
  dom.start.classList.add('hidden');
  dom.end.classList.add('hidden');
  dom.pause.classList.add('hidden');
  document.body.classList.add('playing');
  state = 'playing';
  stateTimer = 0;
  aiWake = 1.15;
  audio.countdown(true);
  camLook.set(0, 2, 0);
}

function endMatch() {
  state = 'ended';
  const blueWon = scores.blue > scores.orange;
  const tied = scores.blue === scores.orange;
  dom.endTitle.textContent = tied ? 'DRAW' : blueWon ? 'BLUE WINS' : 'ORANGE WINS';
  dom.endTitle.className = 'menu-title ' + (tied ? '' : blueWon ? 'blue' : 'orange');
  dom.endScore.textContent = `${scores.blue} — ${scores.orange}`;
  dom.endKicker.textContent = suddenDeath ? 'OVERTIME WINNER' : 'MATCH COMPLETE';
  dom.end.classList.remove('hidden');
  hideAnnounce();
  audio.blip(blueWon ? 320 : 220, 0.5, 'sawtooth', 0.1);
  setTimeout(() => audio.blip(blueWon ? 480 : 330, 0.7, 'sine', 0.08), 140);
}

function scoreGoal(team) {
  if (state !== 'playing') return;
  scores[team]++;
  goalTeam = team;
  updateScoreboard();
  state = 'goal';
  stateTimer = 3.1;
  const teamInfo = TEAM[team];
  setAnnounce('GOAL!', team === 'blue' ? 'BLUE SCORES' : 'ORANGE SCORES', '#' + new THREE.Color(teamInfo.soft).getHexString());
  audio.goal();
  shake = 0.9;

  dom.app.classList.remove('goal-flash', 'orange');
  void dom.app.offsetWidth;
  dom.app.classList.add('goal-flash');
  if (team === 'orange') dom.app.classList.add('orange');

  const side = team === 'blue' ? 1 : -1;
  const origin = new THREE.Vector3(side * (FIELD.halfX + 0.5), 4.5, ball.pos.z);
  const colors = [new THREE.Color(teamInfo.color), new THREE.Color(teamInfo.soft), new THREE.Color(0xffffff)];
  particles.spawn(origin, {
    count: 190,
    colors,
    speed: 26,
    spread: 4,
    size: 1.5,
    life: 1.5,
    gravity: 5,
    drag: 1.1,
  });
  particles.spawn(origin, {
    count: 70,
    color: new THREE.Color(0xffffff),
    speed: 10,
    spread: 3,
    size: 2.1,
    life: 1.8,
    gravity: 1.5,
    drag: 0.9,
  });
  spawnRing(origin, teamInfo.color, 26);
  spawnRing(origin, 0xffffff, 18);
  if (suddenDeath) pendingEnd = true;
}

// ---------------------------------------------------------------- Physics
function carForward(car, out = new THREE.Vector3()) {
  return out.set(Math.cos(car.yaw), 0, Math.sin(car.yaw));
}

function updateCar(car, input, dt) {
  const forward = carForward(car);
  const accel = car.grounded ? 34 : 13;
  const maxSpeed = car.boosting ? 44 : 31;

  if (input.throttle > 0) {
    car.speed += accel * input.throttle * dt;
    if (car.speed < 0) car.speed = Math.min(0, car.speed + 55 * dt);
  } else if (input.throttle < 0) {
    const braking = car.speed > 0 ? 58 : 24;
    car.speed += input.throttle * braking * dt;
  } else {
    const drag = car.grounded ? 15 : 1.4;
    car.speed -= car.speed * drag * dt;
  }

  const boosting = input.boost && car.boost > 0;
  car.boosting = boosting;
  if (boosting) {
    car.boost = Math.max(0, car.boost - 31 * dt);
    car.speed += 42 * dt;
    if (car.grounded) car.speed = Math.min(car.speed, 44);
  }

  if (car.speed > maxSpeed) car.speed = damp(car.speed, maxSpeed, 1.4, dt);
  if (car.speed < -15) car.speed = -15;

  const speedFactor = car.grounded
    ? 0.3 + 0.7 * Math.min(Math.abs(car.speed) / 14, 1)
    : 0.2 + 0.32 * Math.min(Math.abs(car.speed) / 14, 1);
  const direction = car.speed >= 0 ? 1 : -1;
  car.yaw += input.steer * 2.65 * speedFactor * direction * dt;

  car.pos.x += Math.cos(car.yaw) * car.speed * dt;
  car.pos.z += Math.sin(car.yaw) * car.speed * dt;

  if (input.jump) {
    if (car.grounded) {
      car.vy = 13.6;
      car.grounded = false;
      car.jumps = 1;
      car.flipTimer = 0.4;
      audio.jump();
      particles.spawn(new THREE.Vector3(car.pos.x, 0.2, car.pos.z), {
        count: 14,
        color: new THREE.Color(TEAM[car.team].soft),
        speed: 6,
        spread: 2,
        size: 0.6,
        life: 0.45,
        gravity: 4,
      });
    } else if (car.jumps < 2) {
      car.vy = 12.8;
      car.jumps = 2;
      car.flipTimer = 0.55;
      car.speed += 2.5;
      audio.jump();
      particles.spawn(new THREE.Vector3(car.pos.x, car.y + 1, car.pos.z), {
        count: 16,
        color: new THREE.Color(0xbdeaff),
        speed: 8,
        spread: 2,
        size: 0.55,
        life: 0.4,
        gravity: 2,
      });
    }
    input.jump = false;
  }

  if (!car.grounded) {
    car.vy -= 36 * dt;
    car.y += car.vy * dt;
    if (car.y <= 0) {
      const impact = Math.abs(car.vy);
      car.y = 0;
      car.vy = 0;
      car.grounded = true;
      car.jumps = 0;
      car.flipTimer = 0;
      if (impact > 8) {
        shake = Math.max(shake, Math.min(impact / 90, 0.18));
        particles.spawn(new THREE.Vector3(car.pos.x, 0.2, car.pos.z), {
          count: Math.round(4 + impact),
          color: new THREE.Color(0x9fd0ff),
          speed: 5,
          spread: 2.2,
          size: 0.5,
          life: 0.5,
          gravity: 5,
        });
      }
    }
  } else {
    car.y = 0;
  }

  // arena bounds for cars
  const limX = FIELD.halfX - 2.2;
  const limZ = FIELD.halfZ - 2.2;
  if (car.pos.x > limX) {
    car.pos.x = limX;
    car.speed *= -0.25;
  }
  if (car.pos.x < -limX) {
    car.pos.x = -limX;
    car.speed *= -0.25;
  }
  if (car.pos.z > limZ) {
    car.pos.z = limZ;
    car.speed *= -0.25;
  }
  if (car.pos.z < -limZ) {
    car.pos.z = -limZ;
    car.speed *= -0.25;
  }

  // landing / visual state
  if (car.flipTimer > 0) car.flipTimer -= dt;

  // boost trail
  if (car.boosting && Math.random() < 0.8) {
    const back = new THREE.Vector3(
      car.pos.x - Math.cos(car.yaw) * 2.4,
      car.y + 0.95,
      car.pos.z - Math.sin(car.yaw) * 2.4
    );
    const dir = new THREE.Vector3(-Math.cos(car.yaw), 0.15, -Math.sin(car.yaw));
    particles.spawn(back, {
      count: 2,
      color: new THREE.Color(TEAM[car.team].color),
      speed: 8,
      spread: 0.7,
      size: 0.85,
      life: 0.32,
      drag: 2.4,
      direction: dir,
      directionSpread: 0.5,
    });
  }

  // pads
  for (const pad of pads) {
    if (!pad.active) continue;
    const dx = car.pos.x - pad.pos.x;
    const dz = car.pos.z - pad.pos.z;
    const radius = pad.big ? 3.6 : 2.6;
    if (car.y < 3.5 && dx * dx + dz * dz < radius * radius) {
      pad.active = false;
      pad.timer = pad.big ? 10 : 4;
      pad.group.visible = false;
      car.boost = Math.min(100, car.boost + (pad.big ? 100 : 12));
      if (car === player) {
        audio.pickup(pad.big);
        particles.spawn(new THREE.Vector3(pad.pos.x, 1, pad.pos.z), {
          count: pad.big ? 26 : 10,
          color: new THREE.Color(pad.color),
          speed: pad.big ? 9 : 5,
          spread: 1.5,
          size: pad.big ? 0.9 : 0.55,
          life: 0.6,
          gravity: 2,
        });
      }
    }
  }
}

function updateVisualCar(car, dt) {
  const v = car.visual;
  v.root.position.set(car.pos.x, car.y, car.pos.z);
  v.root.rotation.y = -car.yaw;

  const speedNorm = Math.min(Math.abs(car.speed) / 35, 1);
  const bank = -car.steerVisual * 0.13 * speedNorm;
  const pitch = car.grounded ? 0 : clamp(-car.vy * 0.012, -0.16, 0.16);
  v.tilt.rotation.x = damp(v.tilt.rotation.x, bank, 8, dt);
  v.tilt.rotation.z = damp(v.tilt.rotation.z, pitch, 8, dt);
  v.tilt.position.y = car.grounded ? Math.sin(worldTime * 22 + (car.team === 'blue' ? 0 : 2)) * 0.012 * speedNorm : 0;

  car.wheelSpin += car.speed * dt * 1.9;
  for (const wheel of v.wheels) {
    wheel.tire.rotation.y = car.wheelSpin;
    wheel.rim.rotation.y = car.wheelSpin;
    if (wheel.front) {
      wheel.steer.rotation.y = damp(wheel.steer.rotation.y, -car.steerVisual * 0.42, 12, dt);
    }
  }

  const flameTarget = car.boosting ? 1 + Math.random() * 0.35 : 0.01;
  for (const flame of v.flames) {
    flame.scale.y = damp(flame.scale.y, flameTarget, 16, dt);
    flame.scale.x = flame.scale.z = damp(flame.scale.x, car.boosting ? 1.1 : 0.6, 12, dt);
    flame.material.opacity = car.boosting ? 0.95 : 0.15;
  }
  v.glow.intensity = car.boosting ? 12 : 4;
  v.under.material.opacity = car.boosting ? 0.48 : 0.22;
}

function resolveCarBall(car) {
  const center = new THREE.Vector3(car.pos.x, car.y + 1.1, car.pos.z);
  const diff = new THREE.Vector3().subVectors(ball.pos, center);
  const dist = diff.length();
  const minDist = BALL_R + 2.42;
  if (dist >= minDist || dist === 0) return;

  const normal = diff.normalize();
  const penetration = minDist - dist;
  ball.pos.addScaledVector(normal, penetration + 0.02);

  const forward = carForward(car);
  const carVel = new THREE.Vector3(forward.x * car.speed, car.vy, forward.z * car.speed);
  const rel = new THREE.Vector3().subVectors(ball.vel, carVel);
  const closing = Math.max(0, -rel.dot(normal));
  const power = closing * 0.82 + Math.abs(car.speed) * 0.26 + (car.boosting ? 9 : 0);

  ball.vel.addScaledVector(normal, power + 3.5);
  ball.vel.addScaledVector(carVel, 0.22);
  ball.vel.y += Math.min(9, power * 0.11 + 0.6);
  ball.vel.clampLength(0, 88);

  const bump = Math.min(1.4, 0.35 + power / 24);
  car.speed *= car.grounded ? 0.86 : 0.94;
  shake = Math.max(shake, Math.min(bump * 0.25, 0.42));

  audio.hit(bump);
  const hitPos = ball.pos.clone().addScaledVector(normal, -BALL_R * 0.6);
  particles.spawn(hitPos, {
    count: Math.round(10 + bump * 16),
    color: new THREE.Color(TEAM[car.team].soft),
    speed: 6 + bump * 7,
    spread: 1.2,
    size: 0.8,
    life: 0.55,
    gravity: 2.5,
    drag: 1.8,
  });
  particles.spawn(hitPos, {
    count: 8,
    color: new THREE.Color(0xffffff),
    speed: 5,
    spread: 1,
    size: 0.6,
    life: 0.35,
    gravity: 1,
  });
  spawnRing(hitPos, TEAM[car.team].color, 4.5);
}

function resolveCars() {
  const dx = rival.pos.x - player.pos.x;
  const dz = rival.pos.z - player.pos.z;
  const dist = Math.hypot(dx, dz);
  const min = 5;
  if (dist > 0 && dist < min) {
    const nx = dx / dist;
    const nz = dz / dist;
    const push = (min - dist) / 2;
    player.pos.x -= nx * push;
    player.pos.z -= nz * push;
    rival.pos.x += nx * push;
    rival.pos.z += nz * push;
    const bump = 4;
    player.speed -= bump;
    rival.speed -= bump;
    shake = Math.max(shake, 0.08);
  }
}

function bounceBall() {
  const r = BALL_R;
  let bounced = false;

  if (ball.pos.y < r) {
    ball.pos.y = r;
    if (ball.vel.y < -3) {
      bounced = true;
      const impact = -ball.vel.y;
      particles.spawn(new THREE.Vector3(ball.pos.x, 0.15, ball.pos.z), {
        count: Math.min(18, Math.round(impact)),
        color: new THREE.Color(0x8edaff),
        speed: 4,
        spread: 1.8,
        size: 0.55,
        life: 0.45,
        gravity: 4,
      });
      if (impact > 16 && ball.pos.distanceTo(player.pos) < 25) shake = Math.max(shake, 0.06);
    }
    ball.vel.y = Math.abs(ball.vel.y) * 0.72;
    ball.vel.x *= 0.985;
    ball.vel.z *= 0.985;
  }

  if (ball.pos.y > 42) {
    ball.pos.y = 42;
    ball.vel.y = -Math.abs(ball.vel.y) * 0.5;
  }

  const inGoalZoneX = Math.abs(ball.pos.x) > FIELD.halfX;
  const inGoalZ = Math.abs(ball.pos.z) < FIELD.goalHalf - 0.15;
  const inGoalY = ball.pos.y < FIELD.goalHeight - 0.15;

  if (!inGoalZoneX || !inGoalZ || !inGoalY) {
    if (ball.pos.z > FIELD.halfZ - r) {
      ball.pos.z = FIELD.halfZ - r;
      ball.vel.z = -Math.abs(ball.vel.z) * 0.82;
      bounced = true;
    }
    if (ball.pos.z < -FIELD.halfZ + r) {
      ball.pos.z = -FIELD.halfZ + r;
      ball.vel.z = Math.abs(ball.vel.z) * 0.82;
      bounced = true;
    }
  }

  // side walls / goal mouth handling
  for (const side of [-1, 1]) {
    const lineX = side * FIELD.halfX;
    const opening = Math.abs(ball.pos.z) < FIELD.goalHalf - 0.1 && ball.pos.y < FIELD.goalHeight - 0.1;
    if (side > 0 && ball.pos.x > lineX - r && ball.pos.x < lineX + FIELD.goalDepth && !opening) {
      ball.pos.x = lineX - r;
      ball.vel.x = -Math.abs(ball.vel.x) * 0.78;
      bounced = true;
    }
    if (side < 0 && ball.pos.x < lineX + r && ball.pos.x > lineX - FIELD.goalDepth && !opening) {
      ball.pos.x = lineX + r;
      ball.vel.x = Math.abs(ball.vel.x) * 0.78;
      bounced = true;
    }

    // inside goal tunnel: side and back nets
    if (Math.abs(ball.pos.x) > FIELD.halfX + 0.3 && Math.abs(ball.pos.x) < FIELD.halfX + FIELD.goalDepth + 1) {
      if (Math.abs(ball.pos.z) > FIELD.goalHalf - r) {
        ball.pos.z = Math.sign(ball.pos.z) * (FIELD.goalHalf - r);
        ball.vel.z *= -0.4;
      }
      const backX = side * (FIELD.halfX + FIELD.goalDepth);
      if ((side > 0 && ball.pos.x > backX - r) || (side < 0 && ball.pos.x < backX + r)) {
        ball.pos.x = backX - side * r;
        ball.vel.x *= -0.32;
        ball.vel.y *= 0.7;
        bounced = true;
      }
    }

    // posts
    for (const z of [-FIELD.goalHalf, FIELD.goalHalf]) {
      if (ball.pos.y > FIELD.goalHeight + r) continue;
      const dx = ball.pos.x - lineX;
      const dz = ball.pos.z - z;
      const d = Math.hypot(dx, dz);
      const min = r + 0.32;
      if (d > 0 && d < min) {
        const nx = dx / d;
        const nz = dz / d;
        ball.pos.x = lineX + nx * min;
        ball.pos.z = z + nz * min;
        const dot = ball.vel.x * nx + ball.vel.z * nz;
        if (dot < 0) {
          ball.vel.x -= 1.6 * dot * nx;
          ball.vel.z -= 1.6 * dot * nz;
        }
        bounced = true;
      }
    }
  }

  if (bounced) {
    ball.vel.multiplyScalar(0.995);
  }
}

function updateBall(dt) {
  ball.vel.y -= 31 * dt;
  ball.vel.multiplyScalar(Math.pow(0.999, dt * 60));
  ball.pos.addScaledVector(ball.vel, dt);

  bounceBall();

  // goal detection
  if (state === 'playing') {
    if (ball.pos.x > FIELD.halfX + 0.55 && Math.abs(ball.pos.z) < FIELD.goalHalf - 0.2 && ball.pos.y < FIELD.goalHeight) {
      scoreGoal('blue');
      return;
    }
    if (ball.pos.x < -FIELD.halfX - 0.55 && Math.abs(ball.pos.z) < FIELD.goalHalf - 0.2 && ball.pos.y < FIELD.goalHeight) {
      scoreGoal('orange');
      return;
    }
  }

  // spin + trail
  const speed = ball.vel.length();
  if (speed > 0.3) {
    const axis = new THREE.Vector3(0, 1, 0).cross(ball.vel).normalize();
    ballMesh.rotateOnWorldAxis(axis, (speed * dt) / BALL_R);
  }

  ball.trailTimer -= dt;
  if (speed > 24 && ball.trailTimer <= 0) {
    ball.trailTimer = 0.035;
    particles.spawn(ball.pos, {
      count: 1,
      color: new THREE.Color(0x9fdcff),
      speed: 0.6,
      spread: 1.4,
      size: 0.7,
      life: 0.4,
      drag: 1,
    });
  }
}

// ---------------------------------------------------------------- AI
let aiJumpCooldown = 0;
function aiControls(dt) {
  const goal = new THREE.Vector3(-FIELD.halfX, 0, 0);
  const toGoal = new THREE.Vector3().subVectors(goal, ball.pos).setY(0);
  if (toGoal.lengthSq() < 0.01) toGoal.set(-1, 0, 0);
  toGoal.normalize();

  const behind = ball.pos.clone().addScaledVector(toGoal, -6.5);
  behind.y = 0;
  // small aim error keeps the rival beatable instead of laser-guided
  behind.z += Math.sin(worldTime * 0.77) * 2.2 + Math.sin(worldTime * 1.91) * 0.8;

  const dx = behind.x - rival.pos.x;
  const dz = behind.z - rival.pos.z;
  const targetDist = Math.hypot(dx, dz);
  const desiredYaw = Math.atan2(dz, dx);
  let diff = wrapAngle(desiredYaw - rival.yaw);

  const ballDx = ball.pos.x - rival.pos.x;
  const ballDz = ball.pos.z - rival.pos.z;
  const ballDist = Math.hypot(ballDx, ballDz);

  const input = { throttle: 1, steer: clamp(diff * 2.1, -1, 1), boost: false, jump: false };

  if (targetDist < 3.5) input.throttle = 0.7;
  if (Math.abs(diff) > 1.8 && rival.speed > 16) input.throttle = 0.18;
  if (Math.abs(diff) > 2.5) input.throttle = 0.5;

  if (rival.boost > 32 && Math.abs(diff) < 0.2 && ballDist > 6 && targetDist > 2 && Math.sin(worldTime * 1.3) > -0.2) input.boost = true;

  aiJumpCooldown -= dt;
  if (aiJumpCooldown <= 0 && ballDist < 6.5 && ball.pos.y > 2.6 && Math.abs(diff) < 0.45) {
    if (rival.grounded || rival.jumps < 2) {
      input.jump = Math.random() < 0.08;
      if (input.jump) aiJumpCooldown = 1.3;
    }
  }

  // keep the rival from driving through its own net: if very close to goal and facing wrong way, turn hard
  if (rival.pos.x < -FIELD.halfX + 6 && Math.abs(rival.pos.z) < 9) {
    const away = Math.atan2(rival.pos.z, rival.pos.x + FIELD.halfX + 12);
    diff = wrapAngle(away - rival.yaw);
    input.steer = clamp(diff * 2.5, -1, 1);
  }

  return input;
}

// ---------------------------------------------------------------- Input
const keys = new Set();
let jumpQueued = false;

if (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) {
  document.body.classList.add('touch');
}

for (const button of document.querySelectorAll('.touch-btn')) {
  const key = button.dataset.key;
  const press = (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    keys.add(key);
    if (key === 'Space') jumpQueued = true;
  };
  const release = (event) => {
    event.preventDefault();
    keys.delete(key);
  };
  button.addEventListener('pointerdown', press);
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
}

function readPlayerInput() {
  if (state !== 'playing') {
    playerInput.throttle = 0;
    playerInput.steer = 0;
    playerInput.boost = false;
    playerInput.jump = false;
    player.steerVisual = 0;
    return;
  }
  const forward = keys.has('KeyW') || keys.has('ArrowUp');
  const back = keys.has('KeyS') || keys.has('ArrowDown');
  const left = keys.has('KeyA') || keys.has('ArrowLeft');
  const right = keys.has('KeyD') || keys.has('ArrowRight');
  playerInput.throttle = forward ? 1 : back ? -0.75 : 0;
  playerInput.steer = left ? -1 : right ? 1 : 0;
  playerInput.boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
  playerInput.jump = jumpQueued;
  jumpQueued = false;
  player.steerVisual = damp(player.steerVisual, playerInput.steer, 10, 1 / 60);
  if (playerInput.steer === 0) player.steerVisual = 0;
}

window.addEventListener('keydown', (event) => {
  const code = event.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(code)) {
    event.preventDefault();
  }
  if (event.repeat) return;
  keys.add(code);

  if (code === 'Space') jumpQueued = true;
  if (code === 'KeyC' && state !== 'menu') {
    ballCam = !ballCam;
    dom.ballCam.classList.toggle('hidden', !ballCam);
  }
  if (code === 'KeyM') audio.toggleMute();
  if (code === 'Enter' && state === 'menu') startMatch();
  if (code === 'Escape') {
    if (state === 'playing' || state === 'countdown' || state === 'goal') {
      pausedFrom = state;
      state = 'paused';
      dom.pause.classList.remove('hidden');
      hideAnnounce();
    } else if (state === 'paused') {
      state = pausedFrom;
      dom.pause.classList.add('hidden');
    }
  }
  if (code === 'KeyR' && state === 'playing') {
    resetKickoff();
  }
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  playerInput.boost = false;
});

dom.play.addEventListener('click', startMatch);
dom.resume.addEventListener('click', () => {
  if (state === 'paused') {
    state = pausedFrom;
    dom.pause.classList.add('hidden');
  }
});
dom.restart.addEventListener('click', startMatch);
dom.again.addEventListener('click', startMatch);

// ---------------------------------------------------------------- Camera
function updateCamera(dt) {
  if (state === 'menu') {
    const a = worldTime * 0.085 + 0.5;
    const target = new THREE.Vector3(Math.cos(a) * 62, 26 + Math.sin(worldTime * 0.3) * 2.5, Math.sin(a) * 62);
    camPos.lerp(target, 1 - Math.exp(-1.2 * dt));
    camera.position.copy(camPos);
    camLook.lerp(new THREE.Vector3(0, 4, 0), 1 - Math.exp(-2 * dt));
    camera.lookAt(camLook);
    return;
  }

  const forward = carForward(player);
  const distance = ballCam ? 14.2 : 14.8;
  const height = ballCam ? 7.6 : 7.1;
  let offsetX = -forward.x;
  let offsetZ = -forward.z;
  if (ballCam) {
    const awayX = player.pos.x - ball.pos.x;
    const awayZ = player.pos.z - ball.pos.z;
    const awayLen = Math.hypot(awayX, awayZ);
    if (awayLen > 1.5) {
      offsetX = awayX / awayLen;
      offsetZ = awayZ / awayLen;
    }
  }
  let targetPos = new THREE.Vector3(
    player.pos.x + offsetX * distance,
    player.y + height,
    player.pos.z + offsetZ * distance
  );

  // aim outward slightly for a better view of the field
  targetPos.x = clamp(targetPos.x, -51, 51);
  targetPos.z = clamp(targetPos.z, -34.5, 34.5);
  targetPos.y = clamp(targetPos.y, 3.2, 34);

  camPos.lerp(targetPos, 1 - Math.exp(-4.4 * dt));
  camera.position.copy(camPos);

  const lookTarget = ballCam
    ? new THREE.Vector3(ball.pos.x, ball.pos.y + 0.6, ball.pos.z)
    : new THREE.Vector3(
        player.pos.x + forward.x * 16,
        player.y + 2.2,
        player.pos.z + forward.z * 16
      );
  // blend toward ball a little even in car cam for awareness
  if (!ballCam) lookTarget.lerp(ball.pos, 0.16);
  camLook.lerp(lookTarget, 1 - Math.exp(-6 * dt));

  if (shake > 0.001) {
    const s = shake * 0.9;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
    shake = damp(shake, 0, 5, dt);
  }

  camera.lookAt(camLook);
}

// ---------------------------------------------------------------- HUD
function updateHud() {
  dom.boostValue.textContent = Math.round(player.boost);
  const circumference = 301.59;
  dom.boostArc.style.strokeDashoffset = String(circumference * (1 - player.boost / 100));
  const color = player.boost > 34 ? '#24a6ff' : player.boost > 12 ? '#ffc247' : '#ff5a4e';
  dom.boostArc.style.stroke = color;
  dom.boostArc.style.filter = `drop-shadow(0 0 6px ${color})`;

  const kmh = Math.round(Math.abs(player.speed) * 4.4);
  dom.speedValue.textContent = kmh;
  dom.speedFill.style.width = `${Math.min(100, (Math.abs(player.speed) / 44) * 100)}%`;

  updateClock();
}

// ---------------------------------------------------------------- State machine
function updateMatch(dt) {
  worldTime += dt;
  if (announceTimer > 0) {
    announceTimer -= dt;
    if (announceTimer <= 0) hideAnnounce();
  }

  if (state === 'paused' || state === 'ended' || state === 'menu') {
    return;
  }

  if (state === 'playing') {
    matchTime -= dt;
    if (matchTime <= 0 && !suddenDeath) {
      matchTime = 0;
      if (scores.blue === scores.orange) {
        suddenDeath = true;
        timeExpired = true;
        setAnnounce('OVERTIME', 'SUDDEN DEATH — NEXT GOAL WINS', null, 2.6);
        audio.countdown(true);
      } else {
        timeExpired = true;
        endMatch();
        return;
      }
    }
  }

  if (state === 'countdown') {
    stateTimer -= dt;
    const n = Math.ceil(stateTimer - 0.1);
    if (n !== lastCount && n > 0) {
      lastCount = n;
      setAnnounce(String(n), n === 3 ? 'GET READY' : '', null, 0);
      audio.countdown(false);
    }
    if (stateTimer <= 0) {
      state = 'playing';
      setAnnounce('GO!', 'KICKOFF', null, 0.75);
      audio.countdown(true);
      playerInput.jump = false;
      jumpQueued = false;
    }
  } else if (state === 'goal') {
    stateTimer -= dt;
    if (stateTimer <= 0) {
      goalTeam = null;
      if (pendingEnd) {
        pendingEnd = false;
        endMatch();
      } else {
        resetKickoff();
      }
    }
  }
}

function updatePads(dt) {
  for (const pad of pads) {
    if (pad.active) {
      if (pad.icon) {
        pad.icon.rotation.y += dt * 1.5;
        pad.icon.rotation.x += dt * 0.7;
        pad.icon.position.y = 2.1 + Math.sin(worldTime * 2 + pad.pos.x) * 0.22;
      }
      if (pad.ring) pad.ring.rotation.z += dt * 0.8;
    } else {
      pad.timer -= dt;
      if (pad.timer <= 0) {
        pad.active = true;
        pad.group.visible = true;
        particles.spawn(new THREE.Vector3(pad.pos.x, 0.6, pad.pos.z), {
          count: 8,
          color: new THREE.Color(pad.color),
          speed: 4,
          spread: 1.2,
          size: 0.45,
          life: 0.5,
          gravity: 1,
        });
      }
    }
  }
}

// ---------------------------------------------------------------- Loop
let last = performance.now();
let accumulator = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min((now - last) / 1000, 0.05);
  last = now;
  accumulator += rawDt;

  updateMatch(rawDt);

  if (state === 'playing') {
    readPlayerInput();
    player.steerVisual = damp(player.steerVisual, playerInput.steer, 8, rawDt);
    if (aiWake > 0) aiWake -= rawDt;
    const ai = aiWake > 0 ? { throttle: 0, steer: 0, boost: false, jump: false } : aiControls(rawDt);

    const steps = Math.max(1, Math.ceil(rawDt / 0.012));
    const dt = rawDt / steps;
    for (let i = 0; i < steps; i++) {
      updateCar(player, playerInput, dt);
      updateCar(rival, ai, dt);
      updateBall(dt);
      resolveCarBall(player);
      resolveCarBall(rival);
      resolveCars();
    }
  } else if (state === 'goal') {
    const steps = Math.max(1, Math.ceil(rawDt / 0.012));
    const dt = rawDt / steps;
    for (let i = 0; i < steps; i++) {
      updateBall(dt);
    }
  } else if (state === 'paused' || state === 'ended') {
    player.steerVisual = 0;
  } else if (state === 'menu') {
    // idle ball spin
    ballMesh.rotation.y += rawDt * 0.18;
    ballMesh.rotation.x += rawDt * 0.05;
  }

  // visuals
  updateVisualCar(player, rawDt);
  updateVisualCar(rival, rawDt);
  ballMesh.position.copy(ball.pos);
  ballShadow.position.set(ball.pos.x, 0.02, ball.pos.z);
  const shadowScale = clamp(1.3 - (ball.pos.y - BALL_R) * 0.02, 0.45, 1.3);
  ballShadow.scale.set(shadowScale, shadowScale, 1);
  ballShadow.material.opacity = clamp(0.5 - (ball.pos.y - BALL_R) * 0.014, 0.12, 0.55);
  ballLight.intensity = 6 + Math.min(ball.vel.length(), 60) * 0.12;

  updatePads(rawDt);
  updateRings(rawDt);
  particles.update(rawDt);
  updateCamera(rawDt);
  updateHud();

  arena.halo.rotation.y += rawDt * 0.035;
  stars.rotation.y += rawDt * 0.004;

  audio.setEngine(player.speed, player.boosting, !player.grounded);

  composer.render();
}

// ---------------------------------------------------------------- Resize
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------- Boot
function boot() {
  resetPositions();
  updateScoreboard();
  ballMesh.position.copy(ball.pos);
  dom.ballCam.classList.remove('hidden');
  camPos.set(0, 26, 58);
  camera.position.copy(camPos);
  camera.lookAt(0, 4, 0);
  renderer.compile(scene, camera);
  requestAnimationFrame((t) => {
    last = t;
    frame(t);
    setTimeout(() => dom.loading.classList.add('done'), 260);
  });
}

window.__rl3d = {
  player,
  rival,
  ball,
  camera,
  scene,
  renderer,
  get state() { return state; },
  get scores() { return { ...scores }; },
  get time() { return matchTime; },
  get ballCam() { return ballCam; },
  startMatch,
  resetKickoff,
  setMatchTime(v) { matchTime = v; updateClock(); },
  setScores(b, o) { scores.blue = b; scores.orange = o; updateScoreboard(); },
};

boot();
