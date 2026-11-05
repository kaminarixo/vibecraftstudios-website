// vibecraftstudios.de – 3D-Schallplatte, die sich beim Scrollen von Seite zu Seite dreht.
// Build: npm run build (esbuild bündelt three.js tree-shaken nach js/app.js)
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color,
  CylinderGeometry, DoubleSide, Group, LinearFilter, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Points, PointsMaterial, Scene, ShaderMaterial, Vector2, WebGLRenderer,
} from 'three';

const root = document.documentElement;
const canvas = document.getElementById('stage');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Inhalte der Plattenseiten ----------
const STATES = {
  hero: { label: 'brand', color: '#ece6da' },
  a: { label: 'side', letter: 'A', name: 'MIRA NYX', genre: 'PROGRESSIVE TRANCE', day: 'MONDAY', color: '#8a96ff' },
  b: { label: 'side', letter: 'B', name: 'NOVA JADE', genre: 'SLAP HOUSE', day: 'WEDNESDAY', color: '#3ee0ac' },
  c: { label: 'side', letter: 'C', name: 'LAYLA STAR', genre: 'DANCE POP', day: 'FRIDAY', color: '#ff8fbf' },
  d: { label: 'side', letter: 'D', name: 'SUNDAY LOFI', genre: 'INSTRUMENTAL', day: 'SUNDAY', color: '#f0b35a' },
  rotation: { label: 'brand', color: '#ece6da' },
};
const ORDER = ['hero', 'a', 'b', 'c', 'd', 'rotation'];

// Position der Platte je Abschnitt: nx/ny in Bildschirmkoordinaten (-1..1), size = Durchmesser relativ zur Höhe
const LAYOUT_WIDE = {
  hero: { nx: 0.46, ny: 0.1, size: 0.82, tx: -0.42, ty: -0.38, dim: 1 },
  a: { nx: -0.5, ny: 0, size: 0.8, tx: -0.3, ty: 0.42, dim: 1 },
  b: { nx: 0.5, ny: 0, size: 0.8, tx: -0.3, ty: -0.42, dim: 1 },
  c: { nx: -0.5, ny: 0, size: 0.8, tx: -0.3, ty: 0.42, dim: 1 },
  d: { nx: 0.5, ny: 0, size: 0.8, tx: -0.3, ty: -0.42, dim: 1 },
  rotation: { nx: 0.55, ny: 0.55, size: 0.6, tx: -1.05, ty: -0.2, dim: 0.55 },
};
const LAYOUT_NARROW = {
  hero: { nx: 0.35, ny: 0.42, size: 0.5, tx: -0.42, ty: -0.38, dim: 0.9 },
  a: { nx: 0.4, ny: 0.5, size: 0.42, tx: -0.3, ty: -0.42, dim: 0.5 },
  b: { nx: 0.4, ny: 0.5, size: 0.42, tx: -0.3, ty: -0.42, dim: 0.5 },
  c: { nx: 0.4, ny: 0.5, size: 0.42, tx: -0.3, ty: -0.42, dim: 0.5 },
  d: { nx: 0.4, ny: 0.5, size: 0.42, tx: -0.3, ty: -0.42, dim: 0.5 },
  rotation: { nx: 0.45, ny: 0.55, size: 0.4, tx: -1.05, ty: -0.2, dim: 0.4 },
};

const hexToVec = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// ---------- Etikett auf Canvas zeichnen ----------
function drawLabel(state) {
  const S = 1024;
  const c = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const ink = '#0d0c0b';

  ctx.fillStyle = state.color;
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();

  // leichte Papierstruktur
  for (let i = 0; i < 2600; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * c;
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2, 2);
  }

  ctx.strokeStyle = 'rgba(13,12,11,.35)';
  ctx.lineWidth = 3;
  for (const rr of [0.95, 0.66]) {
    ctx.beginPath();
    ctx.arc(c, c, c * rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // umlaufende Schrift
  const ring = state.label === 'brand'
    ? 'VIBECRAFTSTUDIOS · INDEPENDENT ANIME MUSIC · 33⅓ RPM · STEREO · '
    : `SIDE ${state.letter} · ${state.name} · ${state.genre} · ${state.day} 18:30 CET · `;
  ctx.fillStyle = ink;
  ctx.font = '500 34px "Plex Mono", monospace';
  const radius = c * 0.81;
  const full = ring.repeat(4);
  let angle = -Math.PI / 2;
  const maxAngle = angle + Math.PI * 2 - 0.02;
  for (const ch of full) {
    const w = ctx.measureText(ch).width;
    const step = w / radius;
    if (angle + step > maxAngle) break;
    ctx.save();
    ctx.translate(c + Math.cos(angle + step / 2) * radius, c + Math.sin(angle + step / 2) * radius);
    ctx.rotate(angle + step / 2 + Math.PI / 2);
    ctx.fillText(ch, -w / 2, 0);
    ctx.restore();
    angle += step + 0.004;
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (state.label === 'brand') {
    ctx.font = '900 132px "Big Shoulders", sans-serif';
    ctx.fillText('vibecraft', c, c - 70);
    ctx.font = '900 132px "Big Shoulders", sans-serif';
    ctx.fillText('studios', c, c + 70);
    ctx.font = '500 30px "Plex Mono", monospace';
    ctx.fillText('MON · WED · FRI · SUN', c, c + 200);
  } else {
    ctx.font = '500 34px "Plex Mono", monospace';
    ctx.fillText(`SIDE`, c, c - 230);
    ctx.font = '900 400px "Big Shoulders", sans-serif';
    ctx.fillText(state.letter, c, c + 10);
    ctx.font = '700 64px "Big Shoulders", sans-serif';
    ctx.fillText(state.name, c, c + 235);
  }

  // Mittelloch
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  ctx.arc(c, c, 22, 0, Math.PI * 2);
  ctx.fill();

  const tex = new CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.minFilter = LinearFilter;
  return tex;
}

// ---------- Shader der Plattenoberfläche ----------
const vinylVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const vinylFragment = /* glsl */ `
  uniform float uSpin;
  uniform vec3 uAccent;
  uniform vec2 uLight;
  uniform sampler2D uLabel;
  uniform float uDim;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    float cs = cos(uSpin), sn = sin(uSpin);
    vec2 q = mat2(cs, -sn, sn, cs) * p;
    vec2 dir = p / max(r, 1e-4);
    float facing = abs(dot(dir, uLight));
    const float LR = 0.34;
    // Etikett
    vec3 label = texture2D(uLabel, clamp(q / (2.0 * LR) + 0.5, 0.0, 1.0)).rgb;
    label += pow(facing, 8.0) * 0.06;
    label *= 0.9 + 0.1 * smoothstep(LR, LR - 0.02, r);
    // Rillen
    vec3 col;
    {
      float x = r * 430.0;
      float aa = clamp(1.0 - fwidth(x) * 1.2, 0.0, 1.0);
      float groove = mix(0.5, 0.5 + 0.5 * sin(x * 6.28318), aa);
      float band = smoothstep(0.007, 0.0, abs(r - 0.53)) + smoothstep(0.007, 0.0, abs(r - 0.67)) + smoothstep(0.007, 0.0, abs(r - 0.81));
      float runout = smoothstep(0.41, 0.37, r);
      float g = mix(groove, 0.5, clamp(band + runout, 0.0, 1.0));
      float sheen = pow(facing, 16.0);
      float wide = pow(facing, 3.0);
      vec3 tint = mix(vec3(1.0), uAccent, 0.55);
      col = vec3(0.03, 0.029, 0.032);
      col += tint * (sheen * (0.3 + 0.7 * g) * 0.75 + wide * 0.06);
      col += (band * 0.025);
      float ang = atan(q.y, q.x);
      float speck = step(0.9965, hash(vec2(floor(ang * 70.0), floor(r * 90.0))));
      col += speck * 0.10;
      col += smoothstep(0.972, 1.0, r) * 0.12;
    }
    // weicher Übergang Etikett → Vinyl, gegen Treppchen an der Kante
    float edgeW = max(fwidth(r) * 1.5, 0.002);
    col = mix(label, col, smoothstep(LR - edgeW, LR + edgeW, r));
    gl_FragColor = vec4(col * uDim, 1.0);
  }
`;

const glowFragment = /* glsl */ `
  uniform vec3 uAccent;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float d = length(vUv * 2.0 - 1.0);
    float a = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(uAccent * a * a * uStrength, 1.0);
  }
`;

// ---------- Bühne aufbauen ----------
function start() {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    root.classList.add('no-webgl');
    return;
  }
  // Deckender Hintergrund in Seitenfarbe, sonst zeichnen sich die Kanten des Lichtscheins ab
  renderer.setClearColor(0x0d0c0b, 1);
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const rig = new Group(); // Position und Größe je Abschnitt
  const tilt = new Group(); // Neigung + Maus
  const flip = new Group(); // Seitenwechsel
  rig.add(tilt);
  tilt.add(flip);
  scene.add(rig);

  const makeFace = () =>
    new ShaderMaterial({
      vertexShader: vinylVertex,
      fragmentShader: vinylFragment,
      uniforms: {
        uSpin: { value: 0 },
        uAccent: { value: hexToVec(STATES.hero.color) },
        uLight: { value: new Vector2(0.7, 0.7) },
        uLabel: { value: null },
        uDim: { value: 1 },
      },
    });
  const disc = new CircleGeometry(1, 256);
  const frontMat = makeFace();
  const backMat = makeFace();
  const front = new Mesh(disc, frontMat);
  const back = new Mesh(disc, backMat);
  front.position.z = 0.007;
  back.position.z = -0.007;
  back.rotation.y = Math.PI;
  const edge = new Mesh(new CylinderGeometry(1, 1, 0.014, 160, 1, true), new MeshBasicMaterial({ color: 0x151412, side: DoubleSide }));
  edge.rotation.x = Math.PI / 2;
  flip.add(front, back, edge);

  const glowMat = new ShaderMaterial({
    vertexShader: vinylVertex,
    fragmentShader: glowFragment,
    uniforms: { uAccent: { value: hexToVec(STATES.hero.color) }, uStrength: { value: 0.35 } },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const glow = new Mesh(new PlaneGeometry(4.4, 4.4), glowMat);
  glow.position.z = -0.6;
  rig.add(glow);

  // Staub in der Luft
  const COUNT = 420;
  const positions = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 16;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 10;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(positions, 3));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dctx = dot.getContext('2d');
  const grad = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = grad;
  dctx.fillRect(0, 0, 32, 32);
  const dustMat = new PointsMaterial({
    size: 0.045, map: new CanvasTexture(dot), transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, color: new Color(STATES.hero.color),
  });
  const dust = new Points(dustGeo, dustMat);
  scene.add(dust);

  // Etiketten
  const labels = Object.fromEntries(ORDER.map((k) => [k, drawLabel(STATES[k])]));
  frontMat.uniforms.uLabel.value = labels.hero;
  backMat.uniforms.uLabel.value = labels.a;
  backMat.uniforms.uAccent.value = hexToVec(STATES.a.color);

  // Zustand
  let active = 'hero';
  let flipTarget = 0;
  let flipNow = 0;
  const cur = { x: 0, y: 0, s: 1, tx: 0, ty: 0, dim: 1 };
  const accentNow = hexToVec(STATES.hero.color);
  let accentTarget = hexToVec(STATES.hero.color);
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let spin = 0;
  let boost = 0;
  let lastScroll = scrollY;
  let first = true;

  const layout = () => (innerWidth / innerHeight < 0.9 ? LAYOUT_NARROW : LAYOUT_WIDE);

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setPixelRatio(Math.min(devicePixelRatio, w < 700 ? 1.5 : 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (reduceMotion) render(0);
  }

  function setActive(key) {
    if (key === active || !STATES[key]) return;
    const step = ORDER.indexOf(key);
    // Die Seite, die gleich nach vorn dreht, bekommt das neue Etikett
    const faceMat = step % 2 === 0 ? frontMat : backMat;
    faceMat.uniforms.uLabel.value = labels[key];
    faceMat.uniforms.uAccent.value = hexToVec(STATES[key].color);
    flipTarget = step * Math.PI;
    accentTarget = hexToVec(STATES[key].color);
    root.style.setProperty('--accent', STATES[key].color);
    document.querySelectorAll('.bar nav a').forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === `#side-${key}`)));
    active = key;
    if (reduceMotion) render(0);
  }

  // Welcher Abschnitt kreuzt gerade die Bildschirmmitte?
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.dataset.side)),
    { rootMargin: '-48% 0px -48% 0px' },
  );
  document.querySelectorAll('[data-side]').forEach((el) => io.observe(el));

  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  addEventListener('resize', resize);

  function render(dt) {
    const L = layout()[active];
    const k = reduceMotion || first ? 1 : 1 - Math.exp(-dt * 3.2);
    first = false;

    // Scrollen gibt der Platte Schwung, wie ein kurzer Scratch
    const v = scrollY - lastScroll;
    lastScroll = scrollY;
    if (!reduceMotion) {
      boost = Math.max(-6, Math.min(6, boost + v * 0.004));
      boost *= Math.exp(-dt * 2.5);
      spin += dt * (0.55 + boost);
    }

    const visH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const visW = visH * camera.aspect;
    cur.x += (L.nx * visW * 0.5 - cur.x) * k;
    cur.y += (L.ny * visH * 0.5 - cur.y) * k;
    cur.s += ((L.size * visH) / 2 - cur.s) * k;
    cur.tx += (L.tx - cur.tx) * k;
    cur.ty += (L.ty - cur.ty) * k;
    cur.dim += (L.dim - cur.dim) * k;
    flipNow += (flipTarget - flipNow) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 4));
    pointer.sx += (pointer.x - pointer.sx) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 4));
    pointer.sy += (pointer.y - pointer.sy) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 4));
    for (let i = 0; i < 3; i++) accentNow[i] += (accentTarget[i] - accentNow[i]) * k;

    rig.position.set(cur.x, cur.y, 0);
    rig.scale.setScalar(cur.s);
    tilt.rotation.set(cur.tx + pointer.sy * 0.12, cur.ty + pointer.sx * 0.18, 0);
    flip.rotation.y = flipNow;

    const la = 0.8 + pointer.sx * 0.9 + spin * 0.0;
    const light = new Vector2(Math.cos(la), Math.sin(la));
    for (const m of [frontMat, backMat]) {
      m.uniforms.uSpin.value = spin;
      m.uniforms.uLight.value.copy(light);
      m.uniforms.uDim.value = cur.dim;
    }
    glowMat.uniforms.uAccent.value = accentNow;
    glowMat.uniforms.uStrength.value = 0.32 * cur.dim;
    dustMat.color.setRGB(accentNow[0], accentNow[1], accentNow[2], 'srgb');

    if (!reduceMotion) {
      const arr = dustGeo.attributes.position.array;
      for (let i = 0; i < COUNT; i++) {
        arr[i * 3 + 1] += dt * (0.05 + (i % 7) * 0.012);
        arr[i * 3] += Math.sin(spin * 0.3 + i) * dt * 0.02;
        if (arr[i * 3 + 1] > 5) arr[i * 3 + 1] = -5;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
    dust.rotation.y = pointer.sx * 0.05;

    renderer.render(scene, camera);
  }

  resize();
  if (reduceMotion) {
    render(0);
    return;
  }
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    render(dt);
  });
}

// ---------- Nächster Termin (Europe/Berlin) ----------
const TZ = 'Europe/Berlin';
const DROPS = { 1: 'Side A · Mira Nyx', 3: 'Side B · Nova Jade', 5: 'Side C · Layla Star', 0: 'Side D · Sunday Lofi' };

function berlinOffsetMin(date) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName').value;
  const m = name.match(/GMT([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}
function berlinParts(date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day };
}
function berlinWall(y, m, d, h, min) {
  const naive = Date.UTC(y, m - 1, d, h, min);
  let ts = naive - berlinOffsetMin(new Date(naive)) * 60000;
  ts = naive - berlinOffsetMin(new Date(ts)) * 60000;
  return new Date(ts);
}

function updateNext() {
  const el = document.getElementById('next-drop');
  if (!el) return;
  const now = new Date();
  const t = berlinParts(now);
  const todayWd = new Date(Date.UTC(t.y, t.m - 1, t.d, 12)).getUTCDay();
  document.querySelectorAll('#week li').forEach((li) => li.classList.toggle('today', Number(li.dataset.wd) === todayWd));
  for (let i = 0; i < 8; i++) {
    const cal = new Date(Date.UTC(t.y, t.m - 1, t.d + i, 12));
    const wd = cal.getUTCDay();
    if (!(wd in DROPS)) continue;
    const at = berlinWall(cal.getUTCFullYear(), cal.getUTCMonth() + 1, cal.getUTCDate(), 18, 30);
    const diff = at - now;
    if (diff < 0) continue;
    const mins = Math.floor(diff / 60000);
    const dd = Math.floor(mins / 1440);
    const hh = Math.floor((mins % 1440) / 60);
    const mm = mins % 60;
    const left = dd > 0 ? `${dd}d ${String(hh).padStart(2, '0')}h` : `${hh}h ${String(mm).padStart(2, '0')}m`;
    const day = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'long' }).format(at);
    el.innerHTML = `Next up: <strong>${DROPS[wd]}</strong> — ${day} 18:30, in ${left}.`;
    return;
  }
}

updateNext();
setInterval(updateNext, 30000);

// Schriften zuerst laden, damit die Etiketten sauber gesetzt sind
const fontsReady = document.fonts
  ? Promise.race([
    Promise.all([
      document.fonts.load('900 100px "Big Shoulders"'),
      document.fonts.load('700 60px "Big Shoulders"'),
      document.fonts.load('500 30px "Plex Mono"'),
    ]),
    new Promise((r) => setTimeout(r, 1500)),
  ])
  : Promise.resolve();
fontsReady.then(start, start);
