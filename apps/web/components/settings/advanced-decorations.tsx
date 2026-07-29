'use client';

/** Purely decorative SVGs for the Advanced tab -- they carry no real data, they
 * reproduce the reference screenshot's visual motifs: an isometric cube cluster,
 * a glowing architecture-graph constellation, and a dotted world map. */

interface IsoCubeProps {
  readonly cx: number;
  readonly cy: number;
  readonly e: number;
  readonly top: string;
  readonly left: string;
  readonly right: string;
  readonly stroke?: string;
}

/** A single isometric cube centred at (cx, cy) with edge length `e`. */
function IsoCube({ cx, cy, e, top, left, right, stroke = 'rgba(255,255,255,0.25)' }: IsoCubeProps) {
  const topFace = `${cx},${cy - e} ${cx + e},${cy - e / 2} ${cx},${cy} ${cx - e},${cy - e / 2}`;
  const leftFace = `${cx - e},${cy - e / 2} ${cx},${cy} ${cx},${cy + e} ${cx - e},${cy + e / 2}`;
  const rightFace = `${cx + e},${cy - e / 2} ${cx},${cy} ${cx},${cy + e} ${cx + e},${cy + e / 2}`;
  return (
    <g stroke={stroke} strokeWidth={1} strokeLinejoin="round">
      <polygon points={topFace} fill={top} />
      <polygon points={leftFace} fill={left} />
      <polygon points={rightFace} fill={right} />
    </g>
  );
}

/** Isometric cube cluster for the "Desenvolvedor & registro" card (top-right). */
export function CubeCluster() {
  return (
    <svg width="104" height="92" viewBox="0 0 104 92" fill="none" aria-hidden className="hidden shrink-0 sm:block">
      <IsoCube cx={40} cy={54} e={20} top="#a78bfa" left="#6d28d9" right="#8b5cf6" />
      <IsoCube cx={66} cy={40} e={16} top="#c4b5fd" left="#7c3aed" right="#a78bfa" />
      <IsoCube cx={70} cy={66} e={13} top="#5eead4" left="#0f766e" right="#14b8a6" />
    </svg>
  );
}

type Hue = 'violet' | 'violetDeep' | 'teal';
interface GraphNode {
  readonly id: string;
  readonly cx: number;
  readonly cy: number;
  readonly e: number;
  readonly hue: Hue;
  readonly glow?: boolean;
}

// Layout mirrors the reference: one big glowing violet cube just left of
// centre, satellites spread wide across the full panel height, teal accents
// on a few, tiny star-dots scattered around.
const NODES: readonly GraphNode[] = [
  { id: 'core', cx: 280, cy: 210, e: 42, hue: 'violet', glow: true },
  { id: 'n1', cx: 118, cy: 96, e: 15, hue: 'teal' },
  { id: 'n2', cx: 208, cy: 56, e: 13, hue: 'teal' },
  { id: 'n3', cx: 350, cy: 44, e: 14, hue: 'violetDeep' },
  { id: 'n4', cx: 470, cy: 92, e: 17, hue: 'violet' },
  { id: 'n5', cx: 60, cy: 210, e: 13, hue: 'violetDeep' },
  { id: 'n6', cx: 128, cy: 300, e: 15, hue: 'violet' },
  { id: 'n7', cx: 296, cy: 336, e: 13, hue: 'violetDeep' },
  { id: 'n8', cx: 452, cy: 300, e: 16, hue: 'violet' },
  { id: 'n9', cx: 508, cy: 196, e: 12, hue: 'teal' },
  { id: 'n10', cx: 396, cy: 152, e: 10, hue: 'violetDeep' },
];

const EDGES: readonly [string, string][] = [
  ['core', 'n1'], ['core', 'n2'], ['core', 'n3'], ['core', 'n4'], ['core', 'n5'],
  ['core', 'n6'], ['core', 'n7'], ['core', 'n8'], ['core', 'n9'], ['core', 'n10'],
  ['n1', 'n2'], ['n3', 'n4'], ['n4', 'n9'], ['n6', 'n7'], ['n8', 'n9'],
];

const HUES: Record<Hue, { top: string; left: string; right: string }> = {
  violet: { top: '#c4b0ff', left: '#5b21b6', right: '#8b5cf6' },
  violetDeep: { top: '#8d76d8', left: '#3b2a75', right: '#5d43ad' },
  teal: { top: '#7fead9', left: '#0f766e', right: '#2dd4bf' },
};

// Deterministic star-dot field (no Math.random -> stable SSR/CSR markup).
const STAR_DOTS: readonly { x: number; y: number; r: number; o: number }[] = (() => {
  const dots: { x: number; y: number; r: number; o: number }[] = [];
  let seed = 11;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  for (let i = 0; i < 46; i += 1) {
    dots.push({ x: 20 + rand() * 520, y: 16 + rand() * 350, r: rand() > 0.8 ? 2.4 : 1.4, o: 0.25 + rand() * 0.5 });
  }
  return dots;
})();

/** Glowing isometric-cube constellation evoking the architecture graph -- a
 * decorative echo of the reference (the real, interactive topology lives on
 * /architecture, reachable via the "Topologia ao vivo" link). */
export function ArchitectureConstellation({ className }: { readonly className?: string }) {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  return (
    <svg viewBox="0 0 560 384" className={className} fill="none" aria-hidden preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="adv-core-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.6" />
          <stop offset="55%" stopColor="#8b5cf6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={280} cy={205} r={165} fill="url(#adv-core-glow)" />
      {STAR_DOTS.map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={dot.r} fill="#a78bfa" opacity={dot.o} />
      ))}
      {EDGES.map(([from, to]) => {
        const a = byId[from];
        const b = byId[to];
        return <line key={`${from}-${to}`} x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy} stroke="rgba(167,139,250,0.4)" strokeWidth={1.2} />;
      })}
      {EDGES.map(([from, to]) => {
        const a = byId[from];
        const b = byId[to];
        return (
          <circle
            key={`dot-${from}-${to}`}
            cx={(a.cx + b.cx) / 2}
            cy={(a.cy + b.cy) / 2}
            r={2}
            fill="#c4b5fd"
            opacity={0.8}
          />
        );
      })}
      {NODES.map((node) => {
        const hue = HUES[node.hue];
        return (
          <g key={node.id}>
            {node.glow ? <circle cx={node.cx} cy={node.cy} r={node.e * 2.1} fill="url(#adv-core-glow)" /> : null}
            <IsoCube cx={node.cx} cy={node.cy} e={node.e} top={hue.top} left={hue.left} right={hue.right} stroke="rgba(255,255,255,0.35)" />
          </g>
        );
      })}
    </svg>
  );
}

// Continent regions on a 200x100 equirectangular-ish grid, each continent
// composed from several overlapping ellipses so the dotted silhouette reads
// as an actual world map (not a blob per continent). [cx, cy, rx, ry]
const CONTINENTS: readonly [number, number, number, number][] = [
  // North America (Alaska -> Canada/US -> Mexico taper) + Greenland
  [24, 22, 8, 5],
  [40, 27, 16, 9],
  [45, 38, 9, 6],
  [51, 45, 5, 5],
  [63, 14, 6, 4],
  // South America (wide north, tapering south)
  [61, 58, 8, 7],
  [59, 68, 6, 9],
  [56, 82, 3.5, 8],
  // Europe (+ UK / Scandinavia)
  [101, 24, 8, 6],
  [95, 17, 3, 3],
  [104, 13, 5, 4],
  // Africa (wide Sahara, tapering south)
  [102, 44, 11, 8],
  [107, 56, 8, 8],
  [109, 68, 5, 7],
  // Asia (Siberia band, Middle East / Central, India, East Asia, SE Asia)
  [138, 18, 30, 8],
  [126, 32, 12, 8],
  [139, 44, 6, 7],
  [154, 32, 11, 9],
  [160, 48, 7, 4],
  [168, 56, 6, 3],
  // Australia + New Zealand
  [166, 72, 9, 6],
  [184, 82, 3, 3],
];

function insideContinents(x: number, y: number): boolean {
  return CONTINENTS.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
}

// Reference shows one highlighted, glowing dot over Brazil.
const HIGHLIGHT = { x: 60, y: 66 };

/** Dotted world map (continent-shaped) for the localization card. */
export function DottedWorldMap({ className }: { readonly className?: string }) {
  const dots: { x: number; y: number }[] = [];
  for (let y = 4; y < 96; y += 2.3) {
    for (let x = 4; x < 198; x += 2.3) {
      if (insideContinents(x, y)) dots.push({ x, y });
    }
  }
  return (
    <svg viewBox="0 0 200 100" className={className} aria-hidden preserveAspectRatio="xMidYMid meet">
      <defs>
        <radialGradient id="map-highlight" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.8" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {dots.map((dot, index) => (
        <circle key={index} cx={dot.x} cy={dot.y} r={0.8} fill="var(--accent)" opacity={0.5} />
      ))}
      <circle cx={HIGHLIGHT.x} cy={HIGHLIGHT.y} r={7} fill="url(#map-highlight)" />
      <circle cx={HIGHLIGHT.x} cy={HIGHLIGHT.y} r={2} fill="var(--accent)" />
    </svg>
  );
}
