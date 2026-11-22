// vibecraftstudios.de – 3D Collector's Sleeves, farbige Spezial-Vinyls, Genre-Umgebungen & Beat-Synced Audio Previews.
// Build: npm run build (esbuild bündelt three.js tree-shaken nach js/app.js)
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CircleGeometry, Color,
  CylinderGeometry, DoubleSide, Group, LinearFilter, LineSegments, LineBasicMaterial, Mesh,
  MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, Scene, ShaderMaterial,
  TextureLoader, Vector2, WebGLRenderer,
} from 'three';
import { PREVIEWS } from './beats.js';

const root = document.documentElement;
const canvas = document.getElementById('stage');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- Künstler & Seiten-Konfiguration ----------
const STATES = {
  hero: { label: 'brand', color: '#ece6da', matStyle: 0, bpm: 126, portrait: 'assets/img/logo.svg' },
  a: {
    label: 'artist', letter: 'A', name: 'MIRA NYX', genre: 'PROGRESSIVE TRANCE', day: 'MONDAY',
    color: '#8a96ff', matStyle: 1, bpm: 130.4, cover: 'assets/img/mira-cover.webp', portrait: 'assets/img/mira-label.webp',
  },
  b: {
    label: 'artist', letter: 'B', name: 'NOVA JADE', genre: 'SLAP HOUSE', day: 'WEDNESDAY',
    color: '#3ee0ac', matStyle: 2, bpm: 126.0, cover: 'assets/img/nova-cover.webp', portrait: 'assets/img/nova-label.webp',
  },
  c: {
    label: 'artist', letter: 'C', name: 'LAYLA STAR', genre: 'DANCE POP', day: 'FRIDAY',
    color: '#ff8fbf', matStyle: 3, bpm: 134.8, cover: 'assets/img/layla-cover.webp', portrait: 'assets/img/layla-label.webp',
  },
  d: {
    label: 'side', letter: 'D', name: 'SUNDAY LOFI', genre: 'INSTRUMENTAL', day: 'SUNDAY',
    color: '#f0b35a', matStyle: 4, bpm: 84.0, cover: 'assets/img/lofi-cover.webp',
  },
  rotation: { label: 'brand', color: '#ece6da', matStyle: 0, bpm: 120, portrait: 'assets/img/logo.svg' },
};
const ORDER = ['hero', 'a', 'b', 'c', 'd', 'rotation'];
const HERO_ARTISTS = ['a', 'b', 'c'];
const SLEEVE_KEYS = ['a', 'b', 'c', 'd'];

// Positionen der 3D-Bühne: nx/ny (-1..1), size relativ zu visH, pull = Vinyl-Auszug (- links, + rechts)
const LAYOUT_WIDE = {
  hero:     { nx: 0.45,  ny: 0.10,  size: 0.34, tx: -0.10, ty: -0.22, dim: 1.0,  pull: 0.0,   sleeve: 1 },
  a:        { nx: -0.42, ny: 0.01,  size: 0.51, tx: -0.08, ty: 0.22,  dim: 1.0,  pull: 0.72,  sleeve: 1 },
  b:        { nx: 0.42,  ny: 0.01,  size: 0.51, tx: -0.08, ty: -0.22, dim: 1.0,  pull: -0.72, sleeve: 1 },
  c:        { nx: -0.42, ny: 0.01,  size: 0.51, tx: -0.08, ty: 0.22,  dim: 1.0,  pull: 0.72,  sleeve: 1 },
  d:        { nx: 0.42,  ny: 0.01,  size: 0.51, tx: -0.08, ty: -0.22, dim: 1.0,  pull: -0.72, sleeve: 1 },
  rotation: { nx: 0.54,  ny: 0.50,  size: 0.62, tx: -0.78, ty: -0.22, dim: 0.82, pull: 0.0,   sleeve: 0 },
};
const LAYOUT_NARROW = {
  hero:     { nx: 0.0,   ny: 0.48,  size: 0.20, tx: -0.08, ty: -0.08, dim: 0.96, pull: 0.0,   sleeve: 1 },
  a:        { nx: -0.14, ny: 0.47,  size: 0.25, tx: -0.06, ty: 0.14,  dim: 0.95, pull: 0.66,  sleeve: 1 },
  b:        { nx: 0.14,  ny: 0.47,  size: 0.25, tx: -0.06, ty: -0.14, dim: 0.95, pull: -0.66, sleeve: 1 },
  c:        { nx: -0.14, ny: 0.47,  size: 0.25, tx: -0.06, ty: 0.14,  dim: 0.95, pull: 0.66,  sleeve: 1 },
  d:        { nx: 0.14,  ny: 0.47,  size: 0.25, tx: -0.06, ty: -0.14, dim: 0.95, pull: -0.66, sleeve: 1 },
  rotation: { nx: 0.42,  ny: 0.55,  size: 0.36, tx: -0.95, ty: -0.18, dim: 0.36, pull: 0.0,   sleeve: 0 },
};

const hexToVec = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// ---------- Audio Preview Engine + Beat-Map Sync ----------
const audioState = {
  key: null,
  el: null,
  beatEnv: 0,
  downbeatEnv: 0,
  lastBeatIdx: -1,
  ripplePhase: 1,
};

function setupAudio() {
  const buttons = [...document.querySelectorAll('.play-btn[data-preview]')];
  const nowBtn = document.getElementById('now-playing');
  const npTitle = document.getElementById('np-title');
  const audios = {};

  function updateUI() {
    buttons.forEach((btn) => {
      const k = btn.dataset.preview;
      const on = audioState.key === k;
      btn.setAttribute('aria-pressed', String(on));
      const small = btn.querySelector('.play-text small');
      if (small) small.textContent = on ? 'Playing' : 'Preview';
      btn.closest('.preview')?.classList.toggle('is-playing', on);
      if (!on) {
        const bar = btn.closest('.preview')?.querySelector('.play-bar i');
        if (bar) bar.style.transform = 'scaleX(0)';
        const tEl = btn.querySelector('.play-time');
        if (tEl && PREVIEWS[k]) {
          const secs = Math.round(PREVIEWS[k].dur);
          tEl.textContent = `0:${String(secs).padStart(2, '0')}`;
        }
      }
    });
    if (nowBtn && npTitle) {
      if (audioState.key && PREVIEWS[audioState.key]) {
        nowBtn.hidden = false;
        npTitle.textContent = PREVIEWS[audioState.key].title;
      } else {
        nowBtn.hidden = true;
      }
    }
  }

  function stopAudio() {
    if (audioState.el) {
      audioState.el.pause();
      audioState.el.currentTime = 0;
    }
    audioState.key = null;
    audioState.el = null;
    audioState.lastBeatIdx = -1;
    updateUI();
  }

  function togglePreview(key) {
    const meta = PREVIEWS[key];
    if (!meta) return;
    if (audioState.key === key) {
      stopAudio();
      return;
    }
    stopAudio();
    if (!audios[key]) {
      const a = new Audio(meta.src);
      a.preload = 'none';
      a.addEventListener('ended', () => {
        if (audioState.key === key) stopAudio();
      });
      audios[key] = a;
    }
    const el = audios[key];
    el.currentTime = 0;
    audioState.key = key;
    audioState.el = el;
    audioState.lastBeatIdx = -1;
    el.play().then(updateUI).catch(() => stopAudio());
    updateUI();
  }

  buttons.forEach((btn) => btn.addEventListener('click', () => togglePreview(btn.dataset.preview)));
  nowBtn?.addEventListener('click', stopAudio);

  return {
    tick(dt, activeKey, elapsed) {
      audioState.beatEnv *= Math.exp(-dt * 7.8);
      audioState.downbeatEnv *= Math.exp(-dt * 4.5);
      audioState.ripplePhase = Math.min(1, audioState.ripplePhase + dt * 1.15);

      if (audioState.key && audioState.el && !audioState.el.paused) {
        const meta = PREVIEWS[audioState.key];
        const t = audioState.el.currentTime;
        // Fortschrittsbalken & Zeit aktualisieren
        const btn = document.querySelector(`.play-btn[data-preview="${audioState.key}"]`);
        const bar = btn?.closest('.preview')?.querySelector('.play-bar i');
        if (bar) bar.style.transform = `scaleX(${Math.min(1, t / meta.dur)})`;
        const tEl = btn?.querySelector('.play-time');
        if (tEl) {
          const rem = Math.max(0, Math.ceil(meta.dur - t));
          tEl.textContent = `0:${String(rem).padStart(2, '0')}`;
        }

        // Exakte Beat-Map auswerten
        const beats = meta.beats;
        let idx = audioState.lastBeatIdx;
        while (idx + 1 < beats.length && beats[idx + 1][0] <= t + 0.025) {
          idx++;
        }
        if (idx !== audioState.lastBeatIdx && idx >= 0) {
          audioState.lastBeatIdx = idx;
          const isDown = beats[idx][1] === 1;
          audioState.beatEnv = isDown ? 1.0 : 0.62;
          if (isDown) {
            audioState.downbeatEnv = 1.0;
            audioState.ripplePhase = 0.0;
          }
        }
      } else {
        // Stummer Modus: ganz sanfter BPM-Grundpuls des aktiven Artists
        const bpm = STATES[activeKey]?.bpm || 120;
        const beatPhase = (elapsed * bpm / 60) % 1;
        const soft = Math.pow(Math.max(0, 1 - beatPhase * 3.2), 2) * 0.14;
        audioState.beatEnv = Math.max(audioState.beatEnv, soft);
      }
    },
  };
}

// ---------- Etikett auf Canvas zeichnen (Portrait + Vinyl-Typo-Ring) ----------
function drawLabel(state, portraitImg = null) {
  const S = 1024;
  const c = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const ink = '#0d0c0b';

  if (portraitImg && state.label === 'brand') {
    // Brand-Logo als rundes Master-Vinyl-Siegel
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#08080f';
    ctx.fillRect(0, 0, S, S);
    const pad = 22;
    ctx.drawImage(portraitImg, pad, pad, S - pad * 2, S - pad * 2);
    ctx.restore();
  } else if (portraitImg) {
    // Künstler-Portrait rund maskiert im Zentrum
    ctx.save();
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(portraitImg, 0, 0, S, S);

    // Dunkler typografischer Außenring für saubere Lesbarkeit
    const ringGrad = ctx.createRadialGradient(c, c, c * 0.66, c, c, c);
    ringGrad.addColorStop(0, 'rgba(13,12,11,0)');
    ringGrad.addColorStop(0.22, 'rgba(13,12,11,0.72)');
    ringGrad.addColorStop(1, 'rgba(13,12,11,0.92)');
    ctx.fillStyle = ringGrad;
    ctx.fillRect(0, 0, S, S);
    ctx.restore();

    // Feine Akzent-Ringe
    ctx.strokeStyle = state.color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.96, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(236,230,218,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(c, c, c * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    // Umlaufende Schrift im Außenring
    const ring = `SIDE ${state.letter} · ${state.name} · ${state.genre} · ${state.day} 18:30 CET · `;
    ctx.fillStyle = '#ece6da';
    ctx.font = '500 34px "Plex Mono", monospace';
    const radius = c * 0.84;
    const full = ring.repeat(4);
    let angle = -Math.PI / 2;
    const maxAngle = angle + Math.PI * 2 - 0.04;
    for (const ch of full) {
      const w = ctx.measureText(ch).width;
      const step = w / radius;
      if (angle + step > maxAngle) break;
      ctx.save();
      ctx.translate(c + Math.cos(angle + step / 2) * radius, c + Math.sin(angle + step / 2) * radius);
      ctx.rotate(angle + step / 2 + Math.PI / 2);
      ctx.fillText(ch, -w / 2, 0);
      ctx.restore();
      angle += step + 0.005;
    }
  } else {
    // Klassisches Papier-Etikett (Brand / Side D Lofi / Fallback vor Bild-Load)
    ctx.fillStyle = state.color;
    ctx.beginPath();
    ctx.arc(c, c, c, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 2400; i++) {
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
      ctx.fillText('studios', c, c + 70);
      ctx.font = '500 30px "Plex Mono", monospace';
      ctx.fillText('MON · WED · FRI · SUN', c, c + 200);
    } else {
      ctx.font = '500 34px "Plex Mono", monospace';
      ctx.fillText('SIDE', c, c - 230);
      ctx.font = '900 400px "Big Shoulders", sans-serif';
      ctx.fillText(state.letter, c, c + 10);
      ctx.font = '700 64px "Big Shoulders", sans-serif';
      ctx.fillText(state.name, c, c + 235);
    }
  }

  // Mittelloch mit kleinem Chrom-Rand
  ctx.fillStyle = '#060606';
  ctx.beginPath();
  ctx.arc(c, c, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(c, c, 25, 0, Math.PI * 2);
  ctx.stroke();

  return cv;
}

// ---------- GLSL Shader ----------
const quadVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// 1. Collector's Vinyl Sleeve Shader (2.5D-Parallax + Holofoil + Artist-Finish + Beat-Rim)
const sleeveFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uHasMap;
  uniform vec3 uAccent;
  uniform vec2 uTilt;
  uniform float uTime;
  uniform float uBeat;
  uniform float uAlpha;
  uniform float uStyle;
  uniform float uHover;
  uniform float uOpenSide; // +1 = Öffnung rechts, -1 = links, 0 = geschlossen (Hero)
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    if (uAlpha < 0.01) discard;

    // Sanfte 2.5D-Innenparallaxe beim Maus-Kippen (innerhalb sicherer 3%-Marge)
    vec2 centered = vUv - 0.5;
    vec2 uv = clamp(vUv * 0.94 + 0.03 - uTilt * 0.022, 0.002, 0.998);

    vec3 art = uHasMap > 0.5
      ? texture2D(uMap, uv).rgb
      : mix(vec3(0.08, 0.08, 0.09), uAccent * 0.35, 1.0 - length(centered));

    // Nova (Style 2): subtiler RGB-Kanten-Split auf Beats
    if (uStyle > 1.5 && uStyle < 2.5 && uHasMap > 0.5 && uBeat > 0.08) {
      float shift = uBeat * 0.0055 * (0.3 + abs(centered.x));
      art.r = texture2D(uMap, clamp(uv + vec2(shift, 0.0), 0.002, 0.998)).r;
      art.b = texture2D(uMap, clamp(uv - vec2(shift, 0.0), 0.002, 0.998)).b;
    }

    // Helligkeit der Illustration für gezielten Foil-Glanz auf Highlights
    float luma = dot(art, vec3(0.299, 0.587, 0.114));

    // Diagonaler Studio-Lichtreflex + Holofoil-Spektrum
    float diag = dot(centered, normalize(vec2(0.75, 0.65))) + uTilt.x * 0.45 - uTilt.y * 0.3;
    float sheenBand = exp(-pow((diag - 0.08) * 4.2, 2.0));
    float sweepLine = exp(-pow((diag + sin(uTime * 0.55) * 0.28) * 9.0, 2.0));

    // Irideszenter Schimmer je nach Artist-Material (Style 4 = warmes Gold-Bernstein für Lofi)
    vec3 prism = 0.5 + 0.5 * cos(6.28318 * (diag * 1.4 + uTilt.x * 0.6 + vec3(0.0, 0.33, 0.67)));
    vec3 foil = uStyle > 3.5
      ? mix(uAccent, vec3(1.0, 0.88, 0.62), 0.55)
      : mix(uAccent, prism, uStyle > 2.5 ? 0.65 : (uStyle > 1.5 ? 0.35 : 0.25));

    vec3 col = art;
    // Feine Karton-Struktur & leichter Vinyl-Ring-Abdruck (wie echte 12"-Hülle)
    float ringDist = abs(length(centered) - 0.44);
    float ringWear = smoothstep(0.018, 0.0, ringDist) * 0.035;
    float grain = (hash(floor(vUv * 420.0)) - 0.5) * 0.024;
    col += grain + ringWear;

    // Foil-Glanz + Hover-Aufhellung
    col += foil * (sheenBand * (0.09 + luma * 0.14) + sweepLine * 0.055 * (0.4 + uHover));
    col *= 1.0 + uHover * 0.10;

    // Nova: hauchdünne Cyberpunk-Scanlines im Schattenbereich
    if (uStyle > 1.5 && uStyle < 2.5) {
      float scan = sin(vUv.y * 280.0 + uTime * 2.5) * 0.5 + 0.5;
      col += uAccent * scan * (1.0 - luma) * (0.025 + uBeat * 0.04);
    }

    // Feine Kanten-Fase + Beat-Akzent-Rand + Öffnungs-Schatten
    float edgeDist = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float rim = smoothstep(0.016, 0.0, edgeDist);
    float bevel = smoothstep(0.008, 0.0, edgeDist) * (0.25 + 0.35 * max(0.0, centered.y - centered.x * 0.4));
    col += mix(vec3(0.95), uAccent, 0.65) * (rim * (0.24 + uBeat * 0.42 + uHover * 0.35) + bevel * 0.3);

    // Leichter Schatten an der offenen Hüllenseite
    if (uOpenSide > 0.5) {
      col *= 1.0 - smoothstep(0.94, 1.0, vUv.x) * 0.32;
    } else if (uOpenSide < -0.5) {
      col *= 1.0 - smoothstep(0.06, 0.0, vUv.x) * 0.32;
    }

    gl_FragColor = vec4(col, uAlpha);
  }
`;

// 2. Farbige Spezial-Vinyls (5 Pressungen: Black, Midnight-Violet, Chrome-Emerald, Pearl-Pink, Honey-Amber)
const vinylFragment = /* glsl */ `
  uniform float uSpin;
  uniform vec3 uAccent;
  uniform vec2 uLight;
  uniform sampler2D uLabel;
  uniform float uDim;
  uniform float uMatStyle;
  uniform float uBeat;
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
    const float LR = 0.37;

    // Etikett (mit Artist-Portrait oder Typo)
    vec3 label = texture2D(uLabel, clamp(q / (2.0 * LR) + 0.5, 0.0, 1.0)).rgb;
    label += pow(facing, 7.0) * 0.065;
    label *= 0.91 + 0.09 * smoothstep(LR, LR - 0.025, r);

    // Rillen-Geometrie
    float x = r * 440.0;
    float aa = clamp(1.0 - fwidth(x) * 1.2, 0.0, 1.0);
    float groove = mix(0.5, 0.5 + 0.5 * sin(x * 6.28318), aa);
    float band = smoothstep(0.0065, 0.0, abs(r - 0.54))
               + smoothstep(0.0065, 0.0, abs(r - 0.69))
               + smoothstep(0.0065, 0.0, abs(r - 0.83));
    float runout = smoothstep(0.43, 0.385, r);
    float g = mix(groove, 0.5, clamp(band + runout, 0.0, 1.0));

    float sheen = pow(facing, 18.0);
    float wide = pow(facing, 3.2);
    float ang = atan(q.y, q.x);
    float speck = step(0.996, hash(vec2(floor(ang * 75.0), floor(r * 95.0))));

    // Basis-Material je Pressung
    vec3 baseCol = vec3(0.028, 0.027, 0.030);
    vec3 tint = mix(vec3(1.0), uAccent, 0.55);
    float specBoost = 0.78;
    float edgeGlow = 0.14;

    if (uMatStyle > 0.5 && uMatStyle < 1.5) {
      // 1: Mira – Durchscheinendes Mitternachtsblau-Violett + Sternenstaub
      float trans = smoothstep(0.38, 0.96, r);
      baseCol = mix(vec3(0.032, 0.036, 0.095), vec3(0.11, 0.13, 0.30), trans * 0.55 + wide * 0.25);
      tint = mix(vec3(0.88, 0.92, 1.0), uAccent, 0.72);
      specBoost = 0.92;
      edgeGlow = 0.34;
    } else if (uMatStyle > 1.5 && uMatStyle < 2.5) {
      // 2: Nova – Liquid Chrome / Neon-Emerald
      baseCol = mix(vec3(0.045, 0.06, 0.06), vec3(0.09, 0.17, 0.15), wide * 0.65);
      sheen = pow(facing, 24.0) * 1.25 + pow(facing, 6.0) * 0.18;
      tint = mix(vec3(0.92, 1.0, 0.97), uAccent, 0.65);
      specBoost = 1.05;
      edgeGlow = 0.42;
    } else if (uMatStyle > 2.5 && uMatStyle < 3.5) {
      // 3: Layla – Perlmutt-Rose Iridescent (Prismen-Brechung in den Rillen)
      vec3 irid = 0.55 + 0.45 * cos(6.28318 * (facing * 1.3 + r * 0.8 + vec3(0.0, 0.28, 0.62)));
      baseCol = mix(vec3(0.085, 0.045, 0.072), vec3(0.22, 0.11, 0.17), wide * 0.55 + smoothstep(0.4, 1.0, r) * 0.25);
      tint = mix(uAccent, irid, 0.52);
      specBoost = 0.95;
      edgeGlow = 0.36;
    } else if (uMatStyle > 3.5) {
      // 4: Sunday Lofi – Warmes transluzentes Bernstein-Honig-Vinyl
      float amber = smoothstep(0.4, 0.96, r) * 0.5 + wide * 0.45;
      baseCol = mix(vec3(0.08, 0.045, 0.015), vec3(0.32, 0.18, 0.045), amber);
      tint = mix(vec3(1.0, 0.92, 0.76), uAccent, 0.7);
      specBoost = 0.88;
      edgeGlow = 0.38;
    }

    vec3 col = baseCol;
    col += tint * (sheen * (0.28 + 0.72 * g) * specBoost + wide * 0.09);
    col += band * (0.03 + uBeat * 0.03);
    col += speck * (uMatStyle > 0.5 && uMatStyle < 1.5 ? 0.20 : 0.10);

    // Beat-reaktive Rillen-Welle + leuchtender Außenrand
    float beatWave = smoothstep(0.06, 0.0, abs(r - (0.42 + (1.0 - uBeat) * 0.56))) * uBeat * 0.24;
    col += uAccent * beatWave;
    col += mix(vec3(1.0), uAccent, 0.75) * smoothstep(0.968, 1.0, r) * (edgeGlow + uBeat * 0.35);

    // Weicher Übergang Etikett → Vinyl
    float edgeW = max(fwidth(r) * 1.5, 0.002);
    col = mix(label, col, smoothstep(LR - edgeW, LR + edgeW, r));
    gl_FragColor = vec4(col * uDim, 1.0);
  }
`;

// 3. Atmosphärischer Halo + Downbeat-Schallring
const glowFragment = /* glsl */ `
  uniform vec3 uAccent;
  uniform float uStrength;
  uniform float uRipple;
  uniform float uBeat;
  varying vec2 vUv;
  void main() {
    float d = length(vUv * 2.0 - 1.0);
    float a = smoothstep(1.0, 0.0, d);
    float halo = a * a * uStrength * (1.0 + uBeat * 0.45);
    float ringR = 0.36 + uRipple * 0.58;
    float ring = smoothstep(0.016, 0.0, abs(d - ringR)) * (1.0 - uRipple) * 0.32;
    gl_FragColor = vec4(uAccent * (halo + ring), 1.0);
  }
`;

// 4. Novas 3D-Cyberpunk-Neon-Grid (prozedural, anti-aliased, weicher Horizont-Fade)
const gridFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  uniform float uTime;
  uniform float uBeat;
  varying vec2 vUv;
  void main() {
    if (uAlpha < 0.005) discard;
    vec2 g = vec2(vUv.x * 26.0, vUv.y * 26.0 - uTime * 2.2);
    vec2 f = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(0.001));
    float line = 1.0 - min(min(f.x, f.y), 1.0);
    float horizonFade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.22, vUv.y);
    float sideFade = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
    float glow = line * horizonFade * sideFade * (0.28 + uBeat * 0.28);
    gl_FragColor = vec4(uColor * glow * uAlpha, 1.0);
  }
`;

// ---------- 3D-Bühne aufbauen ----------
function start() {
  const audio = setupAudio();

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    root.classList.add('no-webgl');
    return;
  }
  renderer.setClearColor(0x0d0c0b, 1);

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 8.6);

  // Haupt-Rig für Cover + Vinyl + Halo
  const rig = new Group();
  const tilt = new Group();
  rig.add(tilt);
  scene.add(rig);

  // --- Vinyl-Platte (gleitet aus dem Cover heraus & dreht sich beim Seitenwechsel) ---
  const vinylHolder = new Group();
  const flip = new Group();
  vinylHolder.add(flip);
  tilt.add(vinylHolder);

  const makeVinylFace = () =>
    new ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: vinylFragment,
      uniforms: {
        uSpin: { value: 0 },
        uAccent: { value: hexToVec(STATES.hero.color) },
        uLight: { value: new Vector2(0.7, 0.7) },
        uLabel: { value: null },
        uDim: { value: 1 },
        uMatStyle: { value: 0 },
        uBeat: { value: 0 },
      },
    });

  const discGeo = new CircleGeometry(0.95, 220);
  const frontMat = makeVinylFace();
  const backMat = makeVinylFace();
  const frontMesh = new Mesh(discGeo, frontMat);
  const backMesh = new Mesh(discGeo, backMat);
  frontMesh.position.z = 0.008;
  backMesh.position.z = -0.008;
  backMesh.rotation.y = Math.PI;
  const edgeMat = new MeshBasicMaterial({ color: 0x161513, side: DoubleSide });
  const edgeMesh = new Mesh(new CylinderGeometry(0.95, 0.95, 0.016, 128, 1, true), edgeMat);
  edgeMesh.rotation.x = Math.PI / 2;
  flip.add(frontMesh, backMesh, edgeMesh);

  // --- Etiketten erstellen & Artist-Portraits asynchron nachladen ---
  const labels = {};
  for (const k of ORDER) {
    const tex = new CanvasTexture(drawLabel(STATES[k]));
    tex.anisotropy = 4;
    tex.minFilter = LinearFilter;
    labels[k] = tex;
    if (STATES[k].portrait) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        tex.image = drawLabel(STATES[k], img);
        tex.needsUpdate = true;
      };
      img.src = STATES[k].portrait;
    }
  }
  frontMat.uniforms.uLabel.value = labels.hero;
  backMat.uniforms.uLabel.value = labels.a;
  backMat.uniforms.uAccent.value = hexToVec(STATES.a.color);
  backMat.uniforms.uMatStyle.value = STATES.a.matStyle;

  // --- 3D Collector's Sleeves (Mira, Nova, Layla + Sunday Lofi Triptychon) ---
  const loader = new TextureLoader();
  const sleeveGeo = new BoxGeometry(1.94, 1.94, 0.044);
  const sleeves = {};

  for (const k of SLEEVE_KEYS) {
    const st = STATES[k];
    const fMat = new ShaderMaterial({
      vertexShader: quadVertex,
      fragmentShader: sleeveFragment,
      transparent: true,
      uniforms: {
        uMap: { value: null },
        uHasMap: { value: 0 },
        uAccent: { value: hexToVec(st.color) },
        uTilt: { value: new Vector2(0, 0) },
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uAlpha: { value: 1 },
        uStyle: { value: st.matStyle },
        uHover: { value: 0 },
        uOpenSide: { value: 0 },
      },
    });
    const sideMat = new MeshBasicMaterial({ color: 0x1a1816, transparent: true, opacity: 1 });
    const backCardMat = new MeshBasicMaterial({ color: 0x121110, transparent: true, opacity: 1 });
    const mesh = new Mesh(sleeveGeo, [sideMat, sideMat, sideMat, sideMat, fMat, backCardMat]);
    const group = new Group();
    group.add(mesh);
    tilt.add(group);

    loader.load(st.cover, (tex) => {
      tex.anisotropy = 4;
      tex.minFilter = LinearFilter;
      fMat.uniforms.uMap.value = tex;
      fMat.uniforms.uHasMap.value = 1;
      if (reduceMotion) render(0);
    });

    sleeves[k] = {
      group,
      front: fMat,
      sides: [sideMat, backCardMat],
      pos: { x: 0, y: 0, z: 0 },
      rot: { x: 0, y: 0, z: 0 },
      scale: 1,
      alpha: 1,
      hover: 0,
    };
  }

  // --- Halo & Downbeat-Ring hinter dem Rig ---
  const glowMat = new ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: glowFragment,
    uniforms: {
      uAccent: { value: hexToVec(STATES.hero.color) },
      uStrength: { value: 0.34 },
      uRipple: { value: 1.0 },
      uBeat: { value: 0 },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const glowMesh = new Mesh(new PlaneGeometry(5.2, 5.2), glowMat);
  glowMesh.position.z = -0.8;
  rig.add(glowMesh);

  // ---------- Genre-Umgebungen (alle leichtgewichtig auf GPU) ----------
  const envGroup = new Group();
  scene.add(envGroup);

  // Env A (Mira): Perspektivische Autobahn-Lichtstreifen (4 Uhr morgens)
  const STREAKS = 96;
  const streakPos = new Float32Array(STREAKS * 6);
  const streakCol = new Float32Array(STREAKS * 6);
  const streakMeta = [];
  const colAmber = new Color('#ffb463');
  const colIndigo = new Color('#8a96ff');
  for (let i = 0; i < STREAKS; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (1.2 + Math.random() * 6.5);
    const y = (Math.random() - 0.5) * 6.5;
    const z = -Math.random() * 24;
    const len = 0.8 + Math.random() * 2.2;
    const spd = 4.5 + Math.random() * 7.5;
    const c = Math.random() < 0.42 ? colAmber : colIndigo;
    streakMeta.push({ x, y, z, len, spd });
    for (let v = 0; v < 2; v++) {
      const dim = v === 0 ? 1.0 : 0.08;
      streakCol[i * 6 + v * 3] = c.r * dim;
      streakCol[i * 6 + v * 3 + 1] = c.g * dim;
      streakCol[i * 6 + v * 3 + 2] = c.b * dim;
    }
  }
  const streakGeo = new BufferGeometry();
  streakGeo.setAttribute('position', new BufferAttribute(streakPos, 3));
  streakGeo.setAttribute('color', new BufferAttribute(streakCol, 3));
  const streakMat = new LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false,
  });
  const highwayLines = new LineSegments(streakGeo, streakMat);
  envGroup.add(highwayLines);

  // Env B (Nova): Gekipptes 3D-Cyberpunk-Neon-Grid
  const gridMat = new ShaderMaterial({
    vertexShader: quadVertex,
    fragmentShader: gridFragment,
    uniforms: {
      uColor: { value: new Color('#3ee0ac') },
      uAlpha: { value: 0 },
      uTime: { value: 0 },
      uBeat: { value: 0 },
    },
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const gridMesh = new Mesh(new PlaneGeometry(28, 22), gridMat);
  gridMesh.rotation.x = -Math.PI / 2.25;
  gridMesh.position.set(0, -2.5, -5.5);
  envGroup.add(gridMesh);

  // Soft-Radial-Sprite für Partikel
  const dot = document.createElement('canvas');
  dot.width = dot.height = 48;
  const dctx = dot.getContext('2d');
  const grad = dctx.createRadialGradient(24, 24, 0, 24, 24, 24);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  dctx.fillStyle = grad;
  dctx.fillRect(0, 0, 48, 48);
  const dotTex = new CanvasTexture(dot);

  // Env C (Layla): Schwebende 3D-Glühwürmchen & Bokehs (Gold, Cyan, Pink)
  const FF_COUNT = 160;
  const ffPos = new Float32Array(FF_COUNT * 3);
  const ffCol = new Float32Array(FF_COUNT * 3);
  const ffMeta = [];
  const ffPalette = [new Color('#ffe07d'), new Color('#ff8fbf'), new Color('#5ef0ff')];
  for (let i = 0; i < FF_COUNT; i++) {
    const x = (Math.random() - 0.5) * 14;
    const y = (Math.random() - 0.5) * 8.5;
    const z = (Math.random() - 0.5) * 7 - 1.2;
    ffPos[i * 3] = x;
    ffPos[i * 3 + 1] = y;
    ffPos[i * 3 + 2] = z;
    const c = ffPalette[i % ffPalette.length];
    ffCol[i * 3] = c.r;
    ffCol[i * 3 + 1] = c.g;
    ffCol[i * 3 + 2] = c.b;
    ffMeta.push({ x, y, phase: Math.random() * Math.PI * 2, spd: 0.4 + Math.random() * 0.9 });
  }
  const ffGeo = new BufferGeometry();
  ffGeo.setAttribute('position', new BufferAttribute(ffPos, 3));
  ffGeo.setAttribute('color', new BufferAttribute(ffCol, 3));
  const ffMat = new PointsMaterial({
    size: 0.17, map: dotTex, vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false, blending: AdditiveBlending,
  });
  const fireflies = new Points(ffGeo, ffMat);
  envGroup.add(fireflies);

  // Ambient / Lofi Staubpartikel (immer dezent im Hintergrund)
  const DUST_COUNT = 280;
  const dustPos = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 16;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 10;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 6 - 1.5;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute('position', new BufferAttribute(dustPos, 3));
  const dustMat = new PointsMaterial({
    size: 0.055, map: dotTex, transparent: true, opacity: 0.45,
    depthWrite: false, blending: AdditiveBlending, color: new Color(STATES.hero.color),
  });
  const dust = new Points(dustGeo, dustMat);
  envGroup.add(dust);

  // ---------- Zustand & Scroll-Steuerung ----------
  let active = 'hero';
  let navHover = null;
  let flipTarget = 0;
  let flipNow = 0;
  const cur = { x: 0, y: 0, s: 1, tx: 0, ty: 0, dim: 1, pull: 0 };
  const accentNow = hexToVec(STATES.hero.color);
  let accentTarget = hexToVec(STATES.hero.color);
  const envAlpha = { a: 0, b: 0, c: 0, d: 0.45 };
  const pointer = { x: 0, y: 0, sx: 0, sy: 0 };
  let spin = 0;
  let boost = 0;
  let scrollVel = 0;
  let lastScroll = scrollY;
  let elapsed = 0;
  let first = true;

  const sections = Object.fromEntries([...document.querySelectorAll('[data-side]')].map((el) => [el.dataset.side, el]));
  const isNarrow = () => innerWidth / innerHeight < 0.9;
  const layout = () => (isNarrow() ? LAYOUT_NARROW : LAYOUT_WIDE);

  // Nav-Hover hebt im Hero die entsprechende 3D-Plattenhülle hervor
  document.querySelectorAll('.bar nav a[data-nav]').forEach((a) => {
    a.addEventListener('pointerenter', () => { navHover = a.dataset.nav; });
    a.addEventListener('pointerleave', () => { navHover = null; });
  });

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
    const faceMat = step % 2 === 0 ? frontMat : backMat;
    faceMat.uniforms.uLabel.value = labels[key];
    faceMat.uniforms.uAccent.value = hexToVec(STATES[key].color);
    faceMat.uniforms.uMatStyle.value = STATES[key].matStyle;
    flipTarget = step * Math.PI;
    accentTarget = hexToVec(STATES[key].color);
    root.style.setProperty('--accent', STATES[key].color);
    document.querySelectorAll('.bar nav a').forEach((a) =>
      a.setAttribute('aria-current', String(a.getAttribute('href') === `#side-${key}`)));
    active = key;
    if (reduceMotion) render(0);
  }

  // Aktiven Abschnitt über Bildschirmmitte bestimmen (+ Initial-Check bei Reload mitten auf Seite)
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.dataset.side)),
    { rootMargin: '-46% 0px -46% 0px' },
  );
  Object.values(sections).forEach((el) => io.observe(el));

  function detectInitialSection() {
    const mid = innerHeight * 0.5;
    for (const k of ORDER) {
      const r = sections[k]?.getBoundingClientRect();
      if (r && r.top <= mid && r.bottom >= mid) {
        setActive(k);
        return;
      }
    }
  }
  detectInitialSection();

  addEventListener('pointermove', (e) => {
    pointer.x = (e.clientX / innerWidth) * 2 - 1;
    pointer.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });
  addEventListener('resize', resize);

  // Kontinuierlicher lokaler Scroll-Fortschritt (-1 = oberhalb, 0 = zentriert, +1 = verlässt nach oben)
  function sectionProgress(key) {
    const el = sections[key];
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const center = r.top + r.height * 0.5;
    return Math.max(-1, Math.min(1, (innerHeight * 0.5 - center) / Math.max(innerHeight, r.height * 0.75)));
  }

  function render(dt) {
    elapsed += dt;
    audio.tick(dt, active, elapsed);

    const beat = reduceMotion ? 0 : audioState.beatEnv;
    const downbeat = reduceMotion ? 0 : audioState.downbeatEnv;
    const playingActive = audioState.key === active;
    const L = layout()[active];
    const k = reduceMotion || first ? 1 : 1 - Math.exp(-dt * 4.2);
    const kSlow = reduceMotion || first ? 1 : 1 - Math.exp(-dt * 2.8);
    first = false;

    // Scroll-Dynamik (Scratch + Fahrtwind)
    const dy = scrollY - lastScroll;
    lastScroll = scrollY;
    if (!reduceMotion) {
      scrollVel += (Math.abs(dy) * 0.045 - scrollVel) * (1 - Math.exp(-dt * 6));
      boost = Math.max(-6, Math.min(6, boost + dy * 0.004));
      boost *= Math.exp(-dt * 2.6);
      const baseSpin = playingActive ? 1.08 : 0.52;
      spin += dt * (baseSpin + boost);
    }

    const prog = reduceMotion ? 0 : sectionProgress(active);
    const visH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const visW = visH * camera.aspect;

    // Ziel-Ausfahrt der Schallplatte (gleitet beim Einscrollen sanft weiter raus)
    const dynamicPull = L.pull === 0 ? 0 : L.pull * (0.82 + 0.24 * Math.max(0, prog + 0.35));

    cur.x += (L.nx * visW * 0.5 - cur.x) * k;
    cur.y += (L.ny * visH * 0.5 - cur.y) * k;
    cur.s += ((L.size * visH) / 2 - cur.s) * k;
    cur.tx += (L.tx - cur.tx) * k;
    cur.ty += (L.ty - cur.ty) * k;
    cur.dim += (L.dim - cur.dim) * k;
    cur.pull += (dynamicPull - cur.pull) * k;
    flipNow += (flipTarget - flipNow) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 4.4));
    pointer.sx += (pointer.x - pointer.sx) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));
    pointer.sy += (pointer.y - pointer.sy) * (reduceMotion ? 1 : 1 - Math.exp(-dt * 4.5));
    for (let i = 0; i < 3; i++) accentNow[i] += (accentTarget[i] - accentNow[i]) * k;

    const beatScale = 1 + downbeat * 0.022 + beat * 0.012;
    rig.position.set(cur.x, cur.y, 0);
    rig.scale.setScalar(cur.s * beatScale);
    tilt.rotation.set(cur.tx + pointer.sy * 0.11, cur.ty + pointer.sx * 0.16, 0);

    // Vinyl sitzt leicht hinter dem Cover und gleitet zur offenen Seite heraus
    const vinylScale = active === 'hero' ? 0.84 : (L.sleeve ? 0.94 : 1.0);
    vinylHolder.position.set(cur.pull, 0, L.sleeve ? -0.14 : 0);
    vinylHolder.scale.setScalar(vinylScale);
    flip.rotation.y = flipNow;

    // --- 3D-Sleeves choreografieren (Hero-Fächer → Aktive Seite → Filmischer Exit) ---
    const narrow = isNarrow();
    const fanSpread = narrow ? 1.38 : 1.56;
    const hoverTarget = active === 'hero'
      ? (navHover || (pointer.sx < -0.16 ? 'a' : pointer.sx > 0.32 ? 'c' : 'b'))
      : null;

    for (let idx = 0; idx < SLEEVE_KEYS.length; idx++) {
      const ak = SLEEVE_KEYS[idx];
      const sl = sleeves[ak];
      const heroIdx = HERO_ARTISTS.indexOf(ak);
      const isRightSide = ak === 'b' || ak === 'd';
      let tx = 0, ty = 0, tz = 0, rx = 0, ry = 0, rz = 0, sc = 1, alpha = 0;
      let openSide = 0;

      if (active === 'hero' && heroIdx !== -1) {
        // Aufgefächertes 3er-Lineup: alle drei Gesichter klar sichtbar (Mira links, Nova Mitte vorn, Layla rechts)
        const slot = heroIdx - 1; // -1, 0, +1
        const isHov = hoverTarget === ak ? 1 : 0;
        const floatY = reduceMotion ? 0 : Math.sin(elapsed * 1.15 + heroIdx * 1.9) * 0.045;
        tx = slot * fanSpread;
        ty = (slot === 0 ? 0.08 : -0.10) + floatY + isHov * 0.09;
        tz = (slot === 0 ? 0.38 : -0.08) + isHov * 0.26;
        ry = -slot * 0.24;
        rz = -slot * 0.065;
        sc = (slot === 0 ? 0.96 : 0.86) + isHov * 0.06;
        alpha = 1.0;
        sl.hover += (isHov - sl.hover) * k;
      } else if (active === ak) {
        // Aktive Seite: Cover schwebt plastisch im Vordergrund, Vinyl gleitet heraus
        const sway = reduceMotion ? 0 : Math.sin(elapsed * (ak === 'd' ? 0.7 : 1.0) + idx) * 0.025;
        let choreoX = 0, choreoY = 0, choreoRy = 0, choreoRz = 0;
        if (ak === 'a') {
          choreoRy = prog * 0.14;
          choreoX = -Math.max(0, prog) * 0.14;
        } else if (ak === 'b') {
          choreoY = -prog * 0.22;
        } else if (ak === 'c') {
          choreoX = prog * 0.20;
          choreoRz = -prog * 0.045;
        } else if (ak === 'd') {
          choreoY = -prog * 0.10;
          choreoRy = -prog * 0.08;
        }
        tx = (isRightSide ? 0.34 : -0.34) + choreoX;
        ty = sway + choreoY;
        tz = 0.08;
        ry = choreoRy;
        rz = choreoRz;
        sc = 1.0;
        alpha = 1.0;
        openSide = isRightSide ? -1 : 1;
        sl.hover += ((playingActive ? 0.65 : 0.18) - sl.hover) * k;
      } else {
        // Nicht-aktive Sleeves ziehen sauber in Tiefe/Seite weg
        const myIdx = ORDER.indexOf(ak);
        const curIdx = ORDER.indexOf(active);
        const passed = myIdx < curIdx;
        tx = isRightSide ? 1.4 : -1.4;
        ty = passed ? 0.85 : -0.85;
        tz = -1.6;
        ry = passed ? 0.45 : -0.45;
        sc = 0.72;
        alpha = 0.0;
        sl.hover += (0 - sl.hover) * k;
      }

      sl.pos.x += (tx - sl.pos.x) * k;
      sl.pos.y += (ty - sl.pos.y) * k;
      sl.pos.z += (tz - sl.pos.z) * k;
      sl.rot.x += (rx - sl.rot.x) * k;
      sl.rot.y += (ry - sl.rot.y) * k;
      sl.rot.z += (rz - sl.rot.z) * k;
      sl.scale += (sc - sl.scale) * k;
      sl.alpha += (alpha - sl.alpha) * k;

      sl.group.visible = sl.alpha > 0.015;
      if (sl.group.visible) {
        sl.group.position.set(sl.pos.x, sl.pos.y, sl.pos.z);
        sl.group.rotation.set(sl.rot.x, sl.rot.y, sl.rot.z);
        sl.group.scale.setScalar(sl.scale);
        sl.front.uniforms.uTilt.value.set(pointer.sx, pointer.sy);
        sl.front.uniforms.uTime.value = elapsed;
        sl.front.uniforms.uBeat.value = beat;
        sl.front.uniforms.uAlpha.value = sl.alpha;
        sl.front.uniforms.uHover.value = sl.hover;
        sl.front.uniforms.uOpenSide.value = openSide;
        for (const m of sl.sides) m.opacity = sl.alpha;
      }
    }

    // --- Vinyl- & Glow-Uniforms ---
    const la = 0.78 + pointer.sx * 0.85;
    const light = new Vector2(Math.cos(la), Math.sin(la));
    for (const m of [frontMat, backMat]) {
      m.uniforms.uSpin.value = spin;
      m.uniforms.uLight.value.copy(light);
      m.uniforms.uDim.value = cur.dim;
      m.uniforms.uBeat.value = beat;
    }
    glowMat.uniforms.uAccent.value = accentNow;
    glowMat.uniforms.uStrength.value = (active === 'hero' ? 0.28 : 0.36) * cur.dim;
    glowMat.uniforms.uBeat.value = beat;
    glowMat.uniforms.uRipple.value = audioState.ripplePhase;

    // --- Genre-Umgebungen sanft überblenden ---
    envAlpha.a += ((active === 'a' ? 1 : 0) - envAlpha.a) * kSlow;
    envAlpha.b += ((active === 'b' ? 1 : 0) - envAlpha.b) * kSlow;
    envAlpha.c += ((active === 'c' ? 1 : 0) - envAlpha.c) * kSlow;
    envAlpha.d += ((active === 'd' || active === 'hero' || active === 'rotation' ? 0.55 : 0.20) - envAlpha.d) * kSlow;

    // Env A: Autobahn-Lichtstreifen (beschleunigen mit Scroll & Beat)
    streakMat.opacity = envAlpha.a * 0.44;
    highwayLines.visible = envAlpha.a > 0.01;
    if (highwayLines.visible) {
      const speedMult = reduceMotion ? 0 : (1.0 + scrollVel * 2.4 + beat * 1.1);
      const arr = streakGeo.attributes.position.array;
      for (let i = 0; i < STREAKS; i++) {
        const s = streakMeta[i];
        s.z += dt * s.spd * speedMult;
        if (s.z > 6) s.z -= 26;
        const streakLen = s.len * (1 + scrollVel * 0.9 + beat * 0.45);
        arr[i * 6] = s.x;
        arr[i * 6 + 1] = s.y;
        arr[i * 6 + 2] = s.z;
        arr[i * 6 + 3] = s.x;
        arr[i * 6 + 4] = s.y;
        arr[i * 6 + 5] = s.z - streakLen;
      }
      streakGeo.attributes.position.needsUpdate = true;
    }

    // Env B: Cyberpunk Neon-Grid
    gridMesh.visible = envAlpha.b > 0.01;
    if (gridMesh.visible) {
      gridMat.uniforms.uAlpha.value = envAlpha.b;
      gridMat.uniforms.uTime.value = reduceMotion ? 0 : elapsed + scrollVel * 0.15;
      gridMat.uniforms.uBeat.value = beat;
    }

    // Env C: Laylas 3D-Glühwürmchen
    fireflies.visible = envAlpha.c > 0.01;
    ffMat.opacity = envAlpha.c * (0.72 + beat * 0.25);
    if (fireflies.visible && !reduceMotion) {
      const arr = ffGeo.attributes.position.array;
      for (let i = 0; i < FF_COUNT; i++) {
        const m = ffMeta[i];
        arr[i * 3] = m.x + Math.sin(elapsed * m.spd + m.phase) * 0.65;
        arr[i * 3 + 1] = m.y + Math.cos(elapsed * m.spd * 0.8 + m.phase) * 0.45;
      }
      ffGeo.attributes.position.needsUpdate = true;
    }

    // Ambient / Lofi Staub
    dustMat.opacity = envAlpha.d;
    dustMat.color.setRGB(accentNow[0], accentNow[1], accentNow[2], 'srgb');
    if (!reduceMotion) {
      const arr = dustGeo.attributes.position.array;
      for (let i = 0; i < DUST_COUNT; i++) {
        arr[i * 3 + 1] += dt * (0.045 + (i % 7) * 0.01);
        arr[i * 3] += Math.sin(elapsed * 0.25 + i) * dt * 0.018;
        if (arr[i * 3 + 1] > 5) arr[i * 3 + 1] = -5;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
    envGroup.rotation.y = pointer.sx * 0.04;
    envGroup.rotation.x = pointer.sy * 0.025;

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
