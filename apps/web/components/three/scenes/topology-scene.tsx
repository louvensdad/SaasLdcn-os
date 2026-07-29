'use client';

import { Html, Icosahedron, Line, OrbitControls } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Vector3, type Color, type Mesh } from 'three';

import { useAccentColors } from '../use-accent-colors';
import SceneCanvasInner from '../scene-canvas-inner';
import { SceneEffects } from '../scene-effects';

export interface TopoNode {
  readonly id: string;
  readonly label: string;
}

export interface TopoEdge {
  readonly from: string;
  readonly to: string;
}

interface TopologySceneProps {
  readonly nodes: readonly TopoNode[];
  readonly edges: readonly TopoEdge[];
  readonly animate: boolean;
  readonly dpr: number | [number, number];
}

/** A signal travelling along an edge — gives the static graph a sense of flow. */
function SignalDot({ from, to, color, animate, offset }: {
  readonly from: Vector3;
  readonly to: Vector3;
  readonly color: Color;
  readonly animate: boolean;
  readonly offset: number;
}) {
  const ref = useRef<Mesh>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = animate ? (state.clock.elapsedTime * 0.35 + offset) % 1 : 0.5;
    ref.current.position.lerpVectors(from, to, t);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.05, 12, 12]} />
      <meshBasicMaterial color={color} transparent opacity={0.9} />
    </mesh>
  );
}

function Graph({ nodes, edges, animate }: Omit<TopologySceneProps, 'dpr'>) {
  const { accent, accentSecondary } = useAccentColors();

  const positions = useMemo(() => {
    const map = new Map<string, Vector3>();
    const total = nodes.length;
    nodes.forEach((node, index) => {
      const angle = (index / total) * Math.PI * 2;
      map.set(
        node.id,
        new Vector3(Math.cos(angle) * 2.4, Math.sin(angle) * 1.5, Math.sin(angle * 2) * 0.65),
      );
    });
    return map;
  }, [nodes]);

  const colorFor = (index: number): Color => (index % 2 === 0 ? accent : accentSecondary);

  return (
    <group>
      <ambientLight intensity={0.6} />
      <pointLight position={[4, 5, 6]} intensity={1.4} color={accentSecondary} />

      {/* Edges */}
      {edges.map((edge, index) => {
        const a = positions.get(edge.from);
        const b = positions.get(edge.to);
        if (!a || !b) return null;
        // Deterministic per-edge phase (golden-ratio spread) so renders stay pure
        // and dots keep their phase across re-renders.
        const offset = (index * 0.618033988749895) % 1;
        return (
          <group key={`${edge.from}-${edge.to}`}>
            <Line points={[a, b]} color={accent} lineWidth={1} transparent opacity={0.28} />
            <SignalDot from={a} to={b} color={accentSecondary} animate={animate} offset={offset} />
          </group>
        );
      })}

      {/* Nodes */}
      {nodes.map((node, index) => {
        const position = positions.get(node.id);
        if (!position) return null;
        const color = colorFor(index);
        return (
          <group key={node.id} position={position}>
            <Icosahedron args={[0.34, 1]}>
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={0.55}
                roughness={0.3}
                metalness={0.45}
              />
            </Icosahedron>
            <Html center distanceFactor={9} occlude={false} style={{ pointerEvents: 'none' }}>
              <span className="whitespace-nowrap rounded-full border border-white/10 bg-black/55 px-2 py-0.5 text-xs font-semibold tracking-wide text-[color:var(--text)] backdrop-blur-sm">
                {node.label}
              </span>
            </Html>
          </group>
        );
      })}

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={animate}
        autoRotateSpeed={0.55}
        rotateSpeed={0.5}
      />
    </group>
  );
}

/**
 * Self-contained, navigable 3D graph. Dynamic-import boundary for the topology —
 * orbitable (no zoom, so it never steals page scroll), theme-colored, with
 * flowing signals. Holds still under reduced motion.
 */
export default function TopologyScene({ nodes, edges, animate, dpr }: TopologySceneProps) {
  return (
    <SceneCanvasInner dpr={dpr} frameloop="always" camera={{ position: [0, 0, 6], fov: 45 }}>
      <Graph nodes={nodes} edges={edges} animate={animate} />
      <SceneEffects intensity={0.75} />
    </SceneCanvasInner>
  );
}
