'use client';

import { Float, Icosahedron, MeshDistortMaterial } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Mesh } from 'three';
import type { LdcnPresenceState } from '@contracts/ldcn.contract';

import { useLDCNStore } from '@/stores/use-ldcn-store';

import { useAccentColors } from './use-accent-colors';
import { useSceneMotion } from './use-scene-motion';

interface PresenceProfile {
  readonly distort: number;
  readonly speed: number;
  readonly emissive: number;
  readonly spin: number;
}

// The Core is the product's signature: one bold 3D presence that visibly reacts
// to what the system is doing. Everything else on a page stays quiet around it.
const PRESENCE: Record<LdcnPresenceState, PresenceProfile> = {
  idle: { distort: 0.16, speed: 0.6, emissive: 0.22, spin: 0.04 },
  observing: { distort: 0.26, speed: 1.0, emissive: 0.4, spin: 0.08 },
  thinking: { distort: 0.46, speed: 2.2, emissive: 0.72, spin: 0.22 },
  speaking_future: { distort: 0.34, speed: 1.4, emissive: 0.55, spin: 0.12 },
  warning: { distort: 0.3, speed: 1.7, emissive: 0.62, spin: 0.1 },
  blocked: { distort: 0.2, speed: 0.5, emissive: 0.46, spin: 0.03 },
  offline: { distort: 0.1, speed: 0.3, emissive: 0.14, spin: 0.02 },
};

interface LDCNCoreProps {
  /** Optional explicit state; defaults to the live presence from the store. */
  readonly state?: LdcnPresenceState;
  readonly scale?: number;
  readonly detail?: number;
}

/**
 * Distorted icosahedron driven by the live LDCN presence state and the active
 * theme accent. Rotation runs per-frame off a ref (no re-renders); material
 * params change only when presence/theme change. Holds still under reduced motion.
 */
export function LDCNCore({ state, scale = 1, detail = 6 }: LDCNCoreProps) {
  const meshRef = useRef<Mesh>(null);
  const presenceFromStore = useLDCNStore((store) => store.presenceState);
  const presence = state ?? presenceFromStore;
  const profile = PRESENCE[presence] ?? PRESENCE.observing;
  const { accent, accentSecondary } = useAccentColors();
  const { animate } = useSceneMotion();

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !animate) return;
    mesh.rotation.y += delta * profile.spin;
    mesh.rotation.x += delta * profile.spin * 0.4;
  });

  return (
    <group scale={scale}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[2.5, 3, 4]} intensity={1.25} color={accentSecondary} />
      <Float
        speed={animate ? 1.4 : 0}
        rotationIntensity={animate ? 0.35 : 0}
        floatIntensity={animate ? 0.55 : 0}
      >
        <Icosahedron ref={meshRef} args={[1, detail]}>
          <MeshDistortMaterial
            color={accent}
            emissive={accent}
            emissiveIntensity={profile.emissive}
            roughness={0.18}
            metalness={0.55}
            distort={animate ? profile.distort : profile.distort * 0.35}
            speed={animate ? profile.speed : 0}
            transparent
            opacity={0.94}
          />
        </Icosahedron>
        {/* Faint wireframe shell adds depth without competing with the core. */}
        <Icosahedron args={[1.34, 1]}>
          <meshBasicMaterial color={accentSecondary} wireframe transparent opacity={0.12} />
        </Icosahedron>
      </Float>
    </group>
  );
}
