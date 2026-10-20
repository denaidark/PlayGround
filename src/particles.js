import * as THREE from 'three';

function makeCircleTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.45, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export const glowTexture = makeCircleTexture('rgba(255,255,255,0.95)', 'rgba(255,255,255,0)');

const vertexShader = /* glsl */ `
  attribute float size;
  attribute float alpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = alpha;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * (420.0 / max(-mvPosition.z, 1.0));
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float falloff = smoothstep(0.5, 0.05, d);
    if (falloff <= 0.001) discard;
    gl_FragColor = vec4(vColor * (1.2 + falloff * 0.8), falloff * vAlpha);
  }
`;

export class ParticleSystem {
  constructor(scene, max = 900) {
    this.max = max;
    this.cursor = 0;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.velocities = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.geometry = geometry;
    scene.add(this.points);
  }

  spawn(position, options = {}) {
    const {
      count = 12,
      color = new THREE.Color(0x66ccff),
      colors = null,
      speed = 6,
      spread = 1,
      size = 0.9,
      life = 0.7,
      gravity = 0,
      drag = 1.6,
      direction = null,
      directionSpread = 1,
      up = 0,
    } = options;

    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const i3 = idx * 3;

      this.positions[i3] = position.x + (Math.random() - 0.5) * spread;
      this.positions[i3 + 1] = position.y + (Math.random() - 0.5) * spread;
      this.positions[i3 + 2] = position.z + (Math.random() - 0.5) * spread;

      let vx, vy, vz;
      if (direction) {
        vx = direction.x + (Math.random() - 0.5) * directionSpread;
        vy = direction.y + (Math.random() - 0.5) * directionSpread + up;
        vz = direction.z + (Math.random() - 0.5) * directionSpread;
        const len = Math.hypot(vx, vy, vz) || 1;
        const sp = speed * (0.35 + Math.random() * 0.85);
        vx = (vx / len) * sp;
        vy = (vy / len) * sp;
        vz = (vz / len) * sp;
      } else {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const sp = speed * (0.25 + Math.random());
        vx = Math.sin(phi) * Math.cos(theta) * sp;
        vy = Math.cos(phi) * sp + up;
        vz = Math.sin(phi) * Math.sin(theta) * sp;
      }

      this.velocities[i3] = vx;
      this.velocities[i3 + 1] = vy;
      this.velocities[i3 + 2] = vz;

      const chosen = colors ? colors[Math.floor(Math.random() * colors.length)] : color;
      this.colors[i3] = chosen.r;
      this.colors[i3 + 1] = chosen.g;
      this.colors[i3 + 2] = chosen.b;

      const l = life * (0.6 + Math.random() * 0.7);
      this.life[idx] = l;
      this.maxLife[idx] = l;
      this.gravity[idx] = gravity;
      this.drag[idx] = drag;
      this.baseSize[idx] = size * (0.55 + Math.random() * 0.9);
      this.sizes[idx] = this.baseSize[idx];
      this.alphas[idx] = 1;
    }
  }

  update(dt) {
    const { positions, velocities, life, maxLife, gravity, drag, sizes, baseSize, alphas } = this;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        alphas[i] = 0;
        sizes[i] = 0;
        continue;
      }
      const i3 = i * 3;
      const damp = Math.exp(-drag[i] * dt);
      velocities[i3] *= damp;
      velocities[i3 + 1] = velocities[i3 + 1] * damp - gravity[i] * dt;
      velocities[i3 + 2] *= damp;
      positions[i3] += velocities[i3] * dt;
      positions[i3 + 1] += velocities[i3 + 1] * dt;
      positions[i3 + 2] += velocities[i3 + 2] * dt;
      if (positions[i3 + 1] < 0.08) {
        positions[i3 + 1] = 0.08;
        velocities[i3 + 1] *= -0.35;
      }
      const t = life[i] / maxLife[i];
      alphas[i] = Math.min(1, t * 1.8);
      sizes[i] = baseSize[i] * (0.5 + t * 0.5);
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}

export function makeGlowSprite(color, size = 6, opacity = 0.55) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}
