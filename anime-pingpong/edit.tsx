// Anime ping-pong duel: KAI (crimson) vs REN (cyan), shot like a fight scene.
// 10 s = 300 frames at 30 fps, 1920x1080. Everything is drawn in SVG; each shot is its own "camera"
// (a transform that keeps moving), joined by hard cuts and two impact frames.
//
// Shots (frames):
//   0-36    standoff, low angle, slow push-in
//   36-66   extreme close-up: KAI's eye, dutch tilt
//   66-105  overhead: the serve
//   105-120 impact frame: REN's return, shake
//   120-165 side tracking: the ball as a comet, whip pan out
//   165-200 worm's-eye hero shot: KAI powers up, "COUNTER!"
//   200-235 ball-cam POV rushing at KAI
//   235-265 diagonal split: both eyes, then the clash cracks the table
//   265-300 frozen slow-mo orbit, "MATCH POINT"
import { AbsoluteFill, Audio, Composition, registerRoot, useCurrentFrame } from "raea";

// ---- look
const INK = "#0b0618";
const NIGHT = "#170c33";
const KAI = "#ff3b4e";
const REN = "#38e1ff";
const BALL = "#fff6d8";
const FIRE = "#ffb02e";
const TABLE = "#123a5c";
const W = 1920;
const H = 1080;

// ---- helpers
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1 progress of f through [a, b], clamped. */
const prog = (f: number, a: number, b: number) => clamp((f - a) / (b - a));
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeIn = (t: number) => t * t * t;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Seeded hash in 0..1, so anything "random" holds still between frames. */
const h = (i: number) => {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
/** Camera shake that decays after a hit at frame `at`. */
const shake = (f: number, at: number, amp: number, len = 12) => {
  const t = f - at;
  if (t < 0 || t > len) return { x: 0, y: 0, r: 0 };
  const k = amp * Math.pow(1 - t / len, 2);
  return { x: (h(f * 3.1) - 0.5) * 2 * k, y: (h(f * 7.7) - 0.5) * 2 * k, r: (h(f * 1.3) - 0.5) * k * 0.08 };
};
const cam = (x: number, y: number, s: number, r: number) =>
  `translate(${W / 2} ${H / 2}) rotate(${r}) scale(${s}) translate(${-x} ${-y})`;

// ---- parts

/** Radial speed lines converging on (cx, cy); they flicker per frame like hand-drawn ones. */
function Radial({ cx, cy, f, color, n = 70, inner = 260, opacity = 0.8, seed = 1 }: {
  cx: number; cy: number; f: number; color: string; n?: number; inner?: number; opacity?: number; seed?: number;
}) {
  const lines = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + h(i + seed) * 0.08;
    const jitter = h(i * 13 + Math.floor(f / 2) * 7 + seed);
    const r0 = inner + jitter * 220;
    const r1 = 1800;
    const w = 4 + h(i * 5 + seed) * 16;
    const ax = Math.cos(a), ay = Math.sin(a), px = -ay, py = ax;
    const pts = [
      [cx + ax * r0, cy + ay * r0],
      [cx + ax * r1 + px * w * 3, cy + ay * r1 + py * w * 3],
      [cx + ax * r1 - px * w * 3, cy + ay * r1 - py * w * 3],
    ].map((p) => p.join(",")).join(" ");
    lines.push(<polygon key={i} points={pts} fill={color} opacity={opacity * (0.4 + 0.6 * jitter)} />);
  }
  return <g>{lines}</g>;
}

/** Horizontal streaks sliding past, for tracking shots. */
function Streaks({ f, speed, color, n = 40, seed = 3 }: { f: number; speed: number; color: string; n?: number; seed?: number }) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const y = h(i + seed) * H;
    const len = 200 + h(i * 3 + seed) * 700;
    const x = ((h(i * 7 + seed) * W * 2 + f * speed * (0.6 + h(i * 11) * 0.8)) % (W * 2)) - W * 0.5;
    out.push(<rect key={i} x={x} y={y} width={len} height={2 + h(i * 17) * 8} fill={color} opacity={0.25 + h(i * 19) * 0.5} />);
  }
  return <g>{out}</g>;
}

/** Spiky anime hair around a head at (0,0). */
function hairPoints(spikes: number, r: number, seed: number) {
  const pts: string[] = [];
  for (let i = 0; i <= spikes; i++) {
    const a = Math.PI * (1.05 + (i / spikes) * 0.9) - 0.15;
    const out = i % 2 === 0 ? r * (1.55 + h(i + seed) * 0.5) : r * 0.95;
    const back = i % 2 === 0 ? 0.35 : 0;
    pts.push(`${Math.cos(a - back) * out},${Math.sin(a - back) * out}`);
  }
  pts.push(`${r * 1.1},${r * 0.2}`, `${-r * 1.2},${r * 0.5}`);
  return pts.join(" ");
}

/**
 * A fighter as a silhouette with a rim of their colour, facing right, feet at (0,0), ~820 px tall.
 * `swing` is the paddle arm's angle in degrees (0 = forward, negative = raised).
 */
function Fighter({ color, swing = 20, seed = 1, glow = 0 }: { color: string; swing?: number; seed?: number; glow?: number }) {
  const sx = 70, sy = -560;
  const a = (swing * Math.PI) / 180;
  const hx = sx + Math.cos(a) * 230, hy = sy + Math.sin(a) * 230;
  const ex = sx + Math.cos(a + 0.6) * 120, ey = sy + Math.sin(a + 0.6) * 120 + 20;
  return (
    <g>
      {glow > 0 && <ellipse cx={0} cy={-420} rx={330} ry={520} fill={color} opacity={0.18 * glow} />}
      {/* coat tail */}
      <polygon points="-70,-320 -190,-120 -120,-140 -150,-40 -40,-260" fill={INK} stroke={color} strokeWidth={5} />
      {/* legs: wide fighting stance */}
      <polygon points="-55,-310 -170,0 -110,0 -10,-230 60,-310" fill={INK} stroke={color} strokeWidth={6} strokeLinejoin="round" />
      <polygon points="10,-300 150,-140 120,0 180,0 215,-150 70,-310" fill={INK} stroke={color} strokeWidth={6} strokeLinejoin="round" />
      {/* back arm */}
      <line x1={-60} y1={-540} x2={-150} y2={-400} stroke={color} strokeWidth={42} strokeLinecap="round" />
      <line x1={-60} y1={-540} x2={-150} y2={-400} stroke={INK} strokeWidth={30} strokeLinecap="round" />
      {/* torso */}
      <polygon points="-95,-575 105,-580 75,-300 -70,-300" fill={INK} stroke={color} strokeWidth={6} strokeLinejoin="round" />
      <polyline points="-20,-575 10,-470 40,-575" fill="none" stroke={color} strokeWidth={5} />
      {/* head + hair */}
      <g transform="translate(20 -665)">
        <polygon points={hairPoints(11, 78, seed)} fill={INK} stroke={color} strokeWidth={6} strokeLinejoin="round" />
        <ellipse cx={0} cy={0} rx={62} ry={74} fill={INK} stroke={color} strokeWidth={6} />
        <polygon points={hairPoints(9, 66, seed + 4)} fill={INK} transform="translate(-6 -18) scale(0.9)" />
        {/* the glowing eye */}
        <polygon points="18,-8 62,-16 50,2" fill={color} />
        <polygon points="18,-8 62,-16 50,2" fill="#fff" opacity={0.7} transform="translate(8 -2) scale(0.5)" />
      </g>
      {/* paddle arm */}
      <polyline points={`${sx},${sy} ${ex},${ey} ${hx},${hy}`} fill="none" stroke={color} strokeWidth={44} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`${sx},${sy} ${ex},${ey} ${hx},${hy}`} fill="none" stroke={INK} strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" />
      <g transform={`translate(${hx} ${hy}) rotate(${swing - 70})`}>
        <rect x={-12} y={-10} width={24} height={70} rx={8} fill="#6b3b1f" />
        <ellipse cx={0} cy={-70} rx={62} ry={70} fill={color} stroke="#fff" strokeWidth={5} />
        <ellipse cx={-14} cy={-88} rx={22} ry={16} fill="#fff" opacity={0.45} />
      </g>
    </g>
  );
}

/** The ball with a tapering trail behind it; `dx, dy` is where it came from (unit vector, times `len`). */
function Ball({ x, y, r = 22, dx = -1, dy = 0, len = 0, trail = FIRE }: {
  x: number; y: number; r?: number; dx?: number; dy?: number; len?: number; trail?: string;
}) {
  const m = Math.hypot(dx, dy) || 1;
  const ux = dx / m, uy = dy / m, px = -uy, py = ux;
  const tail = (k: number, w: number) =>
    `${x + px * r * w},${y + py * r * w} ${x + ux * len * k},${y + uy * len * k} ${x - px * r * w},${y - py * r * w}`;
  return (
    <g>
      {len > 0 && <polygon points={tail(1, 1.6)} fill={trail} opacity={0.35} />}
      {len > 0 && <polygon points={tail(0.75, 1.15)} fill={trail} opacity={0.7} />}
      {len > 0 && <polygon points={tail(0.45, 0.8)} fill="#fff" opacity={0.85} />}
      <circle cx={x} cy={y} r={r * 1.9} fill={trail} opacity={0.3} />
      <circle cx={x} cy={y} r={r} fill={BALL} stroke="#fff" strokeWidth={3} />
    </g>
  );
}

/** Expanding shockwave rings from a hit at frame `at`. */
function Shock({ x, y, f, at, color, max = 900 }: { x: number; y: number; f: number; at: number; color: string; max?: number }) {
  const t = f - at;
  if (t < 0 || t > 18) return null;
  const rings = [0, 3, 6].map((d, i) => {
    const k = easeOut(clamp((t - d) / 14));
    if (t < d) return null;
    return <circle key={i} cx={x} cy={y} r={40 + k * max} fill="none" stroke={i === 1 ? "#fff" : color} strokeWidth={(1 - k) * 40 + 2} opacity={1 - k} />;
  });
  return <g>{rings}</g>;
}

/** Big slanted title text with a hard drop shadow in a fighter's colour. */
function Slam({ text, x, y, f, at, color, size = 180, rot = -6 }: {
  text: string; x: number; y: number; f: number; at: number; color: string; size?: number; rot?: number;
}) {
  const t = f - at;
  if (t < 0) return null;
  const s = t < 5 ? lerp(2.4, 1, easeOut(t / 5)) : 1 + Math.sin(t * 0.25) * 0.015;
  const style = { fontFamily: "Inter", fontWeight: 900, fontStyle: "italic", fontSize: size, letterSpacing: -4 } as const;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} opacity={clamp(t / 3)}>
      <text x={14} y={14} textAnchor="middle" dominantBaseline="middle" style={style} fill={color}>{text}</text>
      <text x={0} y={0} textAnchor="middle" dominantBaseline="middle" style={style} fill="#fff" stroke={INK} strokeWidth={10} paintOrder="stroke">{text}</text>
    </g>
  );
}

/** A huge anime eye filling the frame; `contract` 0..1 shrinks the pupil to a pin. */
function Eye({ color, contract, glint, flip = false }: { color: string; contract: number; glint: number; flip?: boolean }) {
  const pupil = lerp(120, 34, contract);
  return (
    <g transform={flip ? `translate(${W} 0) scale(-1 1)` : undefined}>
      {/* skin and shadow */}
      <rect x={-400} y={-400} width={W + 800} height={H + 800} fill="#e8b48f" />
      <rect x={-400} y={-400} width={W + 800} height={H + 800} fill={INK} opacity={0.35} />
      {/* brow */}
      <polygon points="380,250 1650,140 1700,230 420,330" fill={INK} />
      {/* eye white */}
      <path d="M 330 560 Q 900 230 1640 420 Q 1240 860 330 560 Z" fill="#fbf7ff" stroke={INK} strokeWidth={22} />
      {/* iris */}
      <g>
        <circle cx={1010} cy={540} r={250} fill={color} />
        <circle cx={1010} cy={540} r={250} fill={INK} opacity={0.35} />
        <circle cx={1010} cy={560} r={200} fill={color} />
        <circle cx={1010} cy={540} r={pupil} fill={INK} />
        <circle cx={930} cy={450} r={46} fill="#fff" />
        <circle cx={1090} cy={630} r={18} fill="#fff" opacity={0.8} />
      </g>
      {/* lid line and lashes over the iris */}
      <path d="M 300 560 Q 900 200 1680 410 L 1660 380 Q 900 160 290 520 Z" fill={INK} />
      {[0, 1, 2, 3].map((i) => (
        <polygon key={i} points={`${1500 + i * 40},${390 - i * 6} ${1640 + i * 55},${300 - i * 30} ${1560 + i * 40},${410 - i * 6}`} fill={INK} />
      ))}
      {/* glint star */}
      {glint > 0 && (
        <g transform={`translate(930 450) rotate(${glint * 90}) scale(${glint})`}>
          <polygon points="0,-160 18,-18 160,0 18,18 0,160 -18,18 -160,0 -18,-18" fill="#fff" />
        </g>
      )}
    </g>
  );
}

/** The table seen from directly above, centred on (0,0), long axis horizontal. */
function TableTop() {
  return (
    <g>
      <rect x={-760} y={-420} width={1520} height={840} fill={TABLE} stroke="#fff" strokeWidth={14} />
      <line x1={-760} y1={0} x2={760} y2={0} stroke="#fff" strokeWidth={6} opacity={0.8} />
      <rect x={-10} y={-470} width={20} height={940} fill="#e9e9f5" />
      <rect x={-4} y={-470} width={8} height={940} fill={INK} opacity={0.4} />
    </g>
  );
}

// ---- shots (each takes the global frame f)

/** 0-36: low-angle standoff with names; slow push-in, lightning arcs between their eyes. */
function Standoff({ f }: { f: number }) {
  const t = prog(f, 0, 36);
  const s = lerp(1.0, 1.14, easeInOut(t));
  const bolt: string[] = [];
  for (let i = 0; i <= 12; i++) {
    const x = lerp(700, 1220, i / 12);
    const y = 330 + (i === 0 || i === 12 ? 0 : (h(i + Math.floor(f / 2) * 13) - 0.5) * 90);
    bolt.push(`${x},${y}`);
  }
  return (
    <g transform={cam(960, 560, s, lerp(-2, 1.5, t))}>
      <rect x={-500} y={-500} width={W + 1000} height={H + 1000} fill={NIGHT} />
      <Radial cx={960} cy={420} f={f} color="#3a2470" opacity={0.9} />
      {/* arena lights */}
      {[300, 960, 1620].map((x, i) => <ellipse key={i} cx={x} cy={-40} rx={260} ry={120} fill="#fff" opacity={0.12} />)}
      {/* the table, from below its edge */}
      <polygon points="260,840 1660,840 1760,900 160,900" fill={TABLE} stroke="#fff" strokeWidth={8} />
      <rect x={160} y={900} width={1600} height={40} fill={INK} />
      <rect x={950} y={760} width={20} height={90} fill="#e9e9f5" />
      <g transform="translate(470 1060) scale(0.95)"><Fighter color={KAI} swing={40} seed={2} glow={0.6} /></g>
      <g transform="translate(1450 1060) scale(-0.95 0.95)"><Fighter color={REN} swing={30} seed={9} glow={0.6} /></g>
      <polyline points={bolt.join(" ")} fill="none" stroke="#fff" strokeWidth={10} strokeLinejoin="bevel" opacity={f % 4 < 2 ? 1 : 0.6} />
      <polyline points={bolt.join(" ")} fill="none" stroke="#c9b6ff" strokeWidth={26} opacity={0.35} />
      <Slam text="KAI" x={400} y={290} f={f} at={6} color={KAI} size={150} rot={-8} />
      <Slam text="REN" x={1520} y={290} f={f} at={12} color={REN} size={150} rot={8} />
    </g>
  );
}

/** 36-66: extreme close-up on KAI's eye; the pupil snaps to a pin as he locks on. */
function EyeShot({ f }: { f: number }) {
  const t = prog(f, 36, 66);
  const contract = easeOut(prog(f, 48, 53));
  const glint = Math.sin(prog(f, 50, 62) * Math.PI);
  return (
    <g transform={cam(1000, 540, lerp(1.08, 1.2, t), lerp(-12, -7, t))}>
      <Eye color={KAI} contract={contract} glint={glint} />
      <g opacity={0.5}><Radial cx={1010} cy={540} f={f} color="#fff" inner={420} n={50} opacity={0.5 * contract} seed={4} /></g>
      {/* hair strands across the top of frame */}
      <polygon points="-300,-300 900,-300 620,140 520,40 300,260 220,60 -300,330" fill={INK} />
    </g>
  );
}

/** 66-105: overhead on the table; KAI tosses and serves, the ball streaks to REN's side. */
function Overhead({ f }: { f: number }) {
  const t = prog(f, 66, 105);
  // toss: ball rises toward camera (grows) then drops; hit at 88; travel to the right edge by 103
  const toss = prog(f, 68, 88);
  const lift = Math.sin(toss * Math.PI);
  const fly = easeIn(prog(f, 88, 103));
  const bx = f < 88 ? -620 : lerp(-620, 640, fly);
  const by = f < 88 ? 180 : lerp(180, -150, fly);
  const br = f < 88 ? 22 + lift * 30 : 22;
  const swing = f < 84 ? lerp(-140, -170, prog(f, 66, 84)) : lerp(-170, -20, easeOut(prog(f, 84, 90)));
  const sh = shake(f, 88, 30, 10);
  return (
    <g transform={`translate(${sh.x} ${sh.y})`}>
      <g transform={cam(lerp(-140, 60, easeInOut(t)), 0, lerp(0.95, 1.08, t), lerp(6, -4, t))}>
        <rect x={-2000} y={-2000} width={4000} height={4000} fill="#0e0824" />
        <g opacity={0.6}><Radial cx={0} cy={0} f={f} color="#2a1a55" inner={700} n={60} seed={6} /></g>
        <TableTop />
        {/* KAI's paddle arm from the bottom-left, seen from above */}
        <g transform={`translate(-860 330) rotate(${swing + 90})`}>
          <line x1={0} y1={0} x2={0} y2={-300} stroke={KAI} strokeWidth={60} strokeLinecap="round" />
          <line x1={0} y1={0} x2={0} y2={-300} stroke={INK} strokeWidth={44} strokeLinecap="round" />
          <ellipse cx={0} cy={-390} rx={80} ry={95} fill={KAI} stroke="#fff" strokeWidth={6} />
        </g>
        {/* REN waiting, his paddle at the far right */}
        <ellipse cx={880} cy={-120} rx={80} ry={95} fill={REN} stroke="#fff" strokeWidth={6} />
        <circle cx={bx + 30} cy={by + 40} r={br * 0.9} fill="#000" opacity={0.35 * (f < 88 ? 1 - lift * 0.6 : 1)} />
        <Ball x={bx} y={by} r={br} dx={-1260} dy={330} len={f >= 88 ? 260 + fly * 500 : 0} />
        <Shock x={-620} y={180} f={f} at={88} color={KAI} max={500} />
      </g>
    </g>
  );
}

/** 105-120: impact frame; REN smashes the return, two inverted frames then shockwave and shake. */
function Impact({ f }: { f: number }) {
  const t = f - 105;
  const inverted = t < 2;
  const sh = shake(f, 105, 55, 15);
  const fg = inverted ? INK : "#fff";
  return (
    <g transform={`translate(${sh.x} ${sh.y}) rotate(${sh.r * 57} 960 540)`}>
      <rect x={-200} y={-200} width={W + 400} height={H + 400} fill={inverted ? "#1d4a6e" : "#06142a"} />
      <Radial cx={820} cy={560} f={f} color={inverted ? INK : REN} inner={120} n={90} opacity={inverted ? 1 : 0.7} seed={8} />
      <g transform={`translate(${1260 - t * 6} ${560}) rotate(${-25 + t * 2}) scale(${1.9 + t * 0.01})`}>
        <rect x={-14} y={60} width={28} height={130} rx={10} fill={inverted ? INK : "#6b3b1f"} />
        <ellipse cx={0} cy={0} rx={150} ry={170} fill={inverted ? INK : REN} stroke={fg} strokeWidth={8} />
      </g>
      <Ball x={820 - t * 30} y={560 + t * 4} r={70} dx={1} dy={0} len={300 + t * 30} trail={inverted ? INK : REN} />
      <Shock x={900} y={560} f={f} at={106} color={REN} max={1200} />
    </g>
  );
}

/** 120-165: side tracking with the ball as a cyan comet; streaks pour past; whip pan out at the end. */
function Tracking({ f }: { f: number }) {
  const t = prog(f, 120, 165);
  const whip = easeIn(prog(f, 156, 165));
  const bob = Math.sin(f * 0.5) * 18;
  return (
    <g transform={`translate(${-whip * 2600} 0)`}>
      <rect x={-500} y={-200} width={W + 4000} height={H + 400} fill="#08122a" />
      <Streaks f={f} speed={95} color={REN} n={55} />
      {/* the table edge rushing underneath */}
      <rect x={-500} y={860} width={W + 4000} height={26} fill="#fff" />
      <rect x={-500} y={886} width={W + 4000} height={200} fill={TABLE} />
      {[0, 1, 2, 3].map((i) => {
        const x = ((i * 700 - f * 95) % 2800 + 2800) % 2800 - 400;
        return <rect key={i} x={x} y={886} width={40} height={200} fill="#000" opacity={0.3} />;
      })}
      <g transform={`translate(${lerp(1150, 900, t)} ${500 + bob}) rotate(${lerp(-4, 3, t)})`}>
        <Ball x={0} y={0} r={56} dx={1} dy={-0.08} len={1400} trail={REN} />
        {/* spin lines on the ball */}
        <path d={`M ${-40} ${-10} Q 0 ${-40 + (f % 6) * 8} 40 -10`} fill="none" stroke={REN} strokeWidth={6} />
      </g>
      {/* KAI waiting at the far side, entering frame left */}
      <g transform={`translate(${lerp(-260, 120, t)} 1100) scale(0.9)`} opacity={0.9}><Fighter color={KAI} swing={-50} seed={2} /></g>
    </g>
  );
}

/** 165-200: worm's-eye hero shot of KAI; aura flames rise, "COUNTER!" slams in. */
function Hero({ f }: { f: number }) {
  const t = prog(f, 165, 200);
  const power = easeOut(prog(f, 165, 180));
  const flames = [];
  for (let i = 0; i < 26; i++) {
    const x = 560 + h(i) * 800;
    const hgt = 300 + h(i * 3 + Math.floor(f / 2)) * 500;
    const w = 40 + h(i * 7) * 60;
    flames.push(<polygon key={i} points={`${x - w},1200 ${x + (h(i + f) - 0.5) * 60},${1100 - hgt * power} ${x + w},1200`} fill={i % 3 === 0 ? "#fff" : KAI} opacity={0.3 + 0.4 * h(i * 11)} />);
  }
  const sh = shake(f, 178, 26, 12);
  return (
    <g transform={`translate(${sh.x} ${sh.y})`}>
      <g transform={cam(960, lerp(620, 520, t), lerp(1.0, 1.1, t), lerp(8, 3, t))}>
        <rect x={-500} y={-500} width={W + 1000} height={H + 1000} fill="#1a0610" />
        <Radial cx={980} cy={260} f={f} color="#5a1020" inner={120} n={80} seed={11} />
        {flames}
        {/* low angle: the fighter towers, feet below frame, paddle raised to the sky */}
        <g transform="translate(900 1560) scale(1.55 1.65)"><Fighter color={KAI} swing={-45} seed={2} glow={power} /></g>
        <Slam text="COUNTER!" x={960} y={860} f={f} at={178} color={KAI} size={210} rot={-7} />
      </g>
    </g>
  );
}

/** 200-235: POV from the ball, table lines rushing to a vanishing point where KAI grows and swings. */
function BallCam({ f }: { f: number }) {
  const t = prog(f, 200, 235);
  const vx = 960, vy = 470;
  const approach = easeIn(t);
  const lines = [];
  for (let i = 0; i < 10; i++) {
    const z = ((i / 10 + t * 2.2) % 1);
    const y = lerp(vy, 1400, z * z);
    lines.push(<line key={i} x1={-400} y1={y} x2={W + 400} y2={y} stroke="#fff" strokeWidth={2 + z * 10} opacity={0.15 + z * 0.4} />);
  }
  const ks = lerp(0.35, 1.25, approach);
  const swing = lerp(-80, 10, easeOut(prog(f, 226, 233)));
  return (
    <g transform={`rotate(${Math.sin(f * 0.3) * 3} 960 540)`}>
      <rect x={-500} y={-500} width={W + 1000} height={H + 1000} fill={NIGHT} />
      <Radial cx={vx} cy={vy} f={f} color="#4a2c8a" inner={60} n={80} opacity={0.8} seed={12} />
      {/* table plane in perspective */}
      <polygon points={`${vx - 40},${vy} ${vx + 40},${vy} ${W + 400},1300 -400,1300`} fill={TABLE} />
      <polygon points={`${vx - 3},${vy} ${vx + 3},${vy} 1000,1300 920,1300`} fill="#fff" opacity={0.7} />
      {lines}
      <g transform={`translate(${vx - 40} ${vy + 120 * ks}) scale(${ks})`}><Fighter color={KAI} swing={swing} seed={2} glow={approach} /></g>
      {/* our own trail ahead of the lens edges */}
      <polygon points="0,1080 0,860 420,1080" fill={REN} opacity={0.5} />
      <polygon points="1920,1080 1920,860 1500,1080" fill={REN} opacity={0.5} />
    </g>
  );
}

/** 235-265: diagonal split of both eyes, then the clash: flash, shock, the table cracks. */
function Clash({ f }: { f: number }) {
  if (f < 250) {
    const t = prog(f, 235, 250);
    const slide = easeOut(prog(f, 235, 241));
    return (
      <g>
        <defs>
          <clipPath id="tl"><polygon points={`0,0 ${W + 200},0 0,${H + 200}`} /></clipPath>
          <clipPath id="br"><polygon points={`${W},${H} ${W},-200 -200,${H}`} /></clipPath>
        </defs>
        <g clipPath="url(#tl)">
          <g transform={`translate(${lerp(-260, -60, slide)} ${-40}) scale(0.62) rotate(-8 960 540)`}><Eye color={KAI} contract={1} glint={0} /></g>
        </g>
        <g clipPath="url(#br)">
          <g transform={`translate(${lerp(990, 790, slide)} ${420}) scale(0.62) rotate(8 960 540)`}><Eye color={REN} contract={1} glint={0} flip /></g>
        </g>
        <line x1={W + 60} y1={-60} x2={-60} y2={H + 60} stroke="#fff" strokeWidth={lerp(10, 24, t)} />
        <line x1={W + 60} y1={-60} x2={-60} y2={H + 60} stroke="#c9b6ff" strokeWidth={60} opacity={0.3} />
      </g>
    );
  }
  const t = f - 250;
  const flash = t < 2;
  const sh = shake(f, 250, 60, 15);
  const crack = easeOut(prog(f, 251, 262));
  const cracks = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + h(i) * 0.4;
    let x = 0, y = 0;
    const pts = ["0,0"];
    for (let k = 1; k <= 5; k++) {
      x += Math.cos(a + (h(i * 9 + k) - 0.5) * 0.9) * 150 * crack;
      y += Math.sin(a + (h(i * 9 + k) - 0.5) * 0.9) * 150 * crack;
      pts.push(`${x},${y}`);
    }
    cracks.push(<polyline key={i} points={pts.join(" ")} fill="none" stroke="#fff" strokeWidth={10 - i * 0.4} strokeLinejoin="bevel" />);
  }
  return (
    <g transform={`translate(${sh.x} ${sh.y}) rotate(${sh.r * 57} 960 540)`}>
      <g transform={cam(0, 0, lerp(1.2, 1.05, prog(f, 250, 265)), -14)}>
        <rect x={-2000} y={-2000} width={4000} height={4000} fill={flash ? "#3b2470" : "#0e0824"} />
        {!flash && <Radial cx={0} cy={0} f={f} color="#5b2ea8" inner={200} n={90} seed={14} />}
        <g opacity={flash ? 0 : 1}><TableTop /></g>
        <g transform="translate(140 40)">{cracks}</g>
        <Shock x={140} y={40} f={f} at={250} color={KAI} max={1100} />
        <Shock x={140} y={40} f={f} at={253} color={REN} max={1300} />
        <Ball x={140} y={40} r={46} dx={-1} dy={-0.3} len={flash ? 0 : 500} />
      </g>
    </g>
  );
}

/** 265-300: frozen slow-mo; the camera orbits the hanging ball between both fighters. "MATCH POINT". */
function Finale({ f }: { f: number }) {
  const t = prog(f, 265, 300);
  const drift = lerp(0, 1, t);
  return (
    <g transform={cam(960, 520, lerp(1.25, 1.05, easeOut(t)), lerp(-10, 6, easeInOut(t)))}>
      <rect x={-600} y={-600} width={W + 1200} height={H + 1200} fill={NIGHT} />
      <Radial cx={960} cy={480} f={265} color="#3a2470" inner={200} n={80} opacity={0.9} seed={15} />
      {/* halftone dots */}
      {Array.from({ length: 140 }, (_, i) => (
        <circle key={i} cx={(i % 14) * 150 + ((Math.floor(i / 14) % 2) * 75)} cy={Math.floor(i / 14) * 120} r={6 + h(i) * 5} fill="#fff" opacity={0.06} />
      ))}
      <g transform={`translate(${380 - drift * 40} 1150) scale(1.05)`}><Fighter color={KAI} swing={-10} seed={2} glow={0.8} /></g>
      <g transform={`translate(${1540 + drift * 40} 1150) scale(-1.05 1.05)`}><Fighter color={REN} swing={-20} seed={9} glow={0.8} /></g>
      <g transform={`translate(${960 + drift * 20} ${470 - drift * 10})`}>
        <Ball x={0} y={0} r={60} dx={-1} dy={0.25} len={700} trail={KAI} />
        <Ball x={0} y={0} r={60} dx={1} dy={0.25} len={480} trail={REN} />
      </g>
      <Slam text="MATCH POINT" x={960} y={860} f={f} at={270} color={KAI} size={170} rot={-4} />
    </g>
  );
}

// ---- the piece

/** Chooses the shot for the frame; letterbox bars hold the whole piece in a 2.35 frame. */
export default function Duel() {
  const f = useCurrentFrame();
  let shot;
  if (f < 36) shot = <Standoff f={f} />;
  else if (f < 66) shot = <EyeShot f={f} />;
  else if (f < 105) shot = <Overhead f={f} />;
  else if (f < 120) shot = <Impact f={f} />;
  else if (f < 165) shot = <Tracking f={f} />;
  else if (f < 200) shot = <Hero f={f} />;
  else if (f < 235) shot = <BallCam f={f} />;
  else if (f < 265) shot = <Clash f={f} />;
  else shot = <Finale f={f} />;
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Audio src="duel.wav" />
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {shot}
        {/* cinematic bars */}
        <rect x={0} y={0} width={W} height={70} fill="#000" />
        <rect x={0} y={H - 70} width={W} height={70} fill="#000" />
      </svg>
    </AbsoluteFill>
  );
}

registerRoot(() => <Composition id="anime-pingpong" component={Duel} width={W} height={H} fps={30} durationInFrames={300} />);
