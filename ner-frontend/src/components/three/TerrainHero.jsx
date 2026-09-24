import React, { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

// Deterministic, dependency-free "noise" -- a handful of overlapping
// sine waves. Good enough for a terrain silhouette; a full simplex-noise
// package would be overkill for a background scene that's never the
// literal product data.
function heightAt(x, z) {
  return (
    Math.sin(x * 0.18) * 1.1 +
    Math.cos(z * 0.22) * 1.3 +
    Math.sin((x + z) * 0.12) * 0.9 +
    Math.cos(x * 0.05 - z * 0.07) * 1.6
  );
}

function Terrain() {
  const geometry = useMemo(() => {
    const width = 64;
    const depth = 44;
    const segX = 56;
    const segZ = 40;
    const geo = new THREE.PlaneGeometry(width, depth, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, heightAt(x, z));
    }
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group position={[0, -3.4, -6]}>
      {/* faint solid fill for depth, sits just under the wireframe */}
      <mesh geometry={geometry} receiveShadow={false}>
        <meshBasicMaterial color="#0a1526" transparent opacity={0.55} />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color="#1c7fa8" wireframe transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function RouteAndCargo() {
  const curve = useMemo(() => {
    const pts = [
      new THREE.Vector3(-16, 0.6, 4),
      new THREE.Vector3(-8, 1.4, -2),
      new THREE.Vector3(-1, 0.9, -6),
      new THREE.Vector3(7, 2.1, -4),
      new THREE.Vector3(15, 1.2, 2),
    ].map((p) => p.add(new THREE.Vector3(0, -3.4, -6)));
    return new THREE.CatmullRomCurve3(pts);
  }, []);

  const routePoints = useMemo(() => curve.getPoints(80), [curve]);
  const cargoRef = useRef(null);
  const tRef = useRef(0);

  useFrame((_, delta) => {
    tRef.current = (tRef.current + delta * 0.06) % 1;
    if (cargoRef.current) {
      const p = curve.getPointAt(tRef.current);
      cargoRef.current.position.copy(p);
    }
  });

  return (
    <>
      <Line points={routePoints} color="#22d3ee" lineWidth={1.6} transparent opacity={0.85} />
      <mesh ref={cargoRef}>
        <sphereGeometry args={[0.22, 12, 12]} />
        <meshBasicMaterial color="#e0fbff" />
      </mesh>
    </>
  );
}

function RiskHotspots() {
  const spots = useMemo(
    () => [
      [-10, 2.0, -3],
      [4, 2.6, -8],
      [11, 1.8, 0],
    ],
    []
  );
  const refs = useRef([]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    refs.current.forEach((m, i) => {
      if (!m) return;
      const s = 1 + Math.sin(t * 1.8 + i * 1.4) * 0.28;
      m.scale.setScalar(s);
    });
  });

  return (
    <group position={[0, -3.4, -6]}>
      {spots.map((p, i) => (
        <mesh key={i} position={p} ref={(el) => (refs.current[i] = el)}>
          <sphereGeometry args={[0.28, 12, 12]} />
          <meshBasicMaterial color="#fb7185" transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Rig({ enableParallax }) {
  const { camera, pointer } = useThree();
  useFrame(() => {
    if (!enableParallax) return;
    const targetX = pointer.x * 1.1;
    const targetY = 1.2 + pointer.y * 0.5;
    camera.position.x += (targetX - camera.position.x) * 0.03;
    camera.position.y += (targetY - camera.position.y) * 0.03;
    camera.lookAt(0, -1.2, -6);
  });
  return null;
}

// Interactive, restrained 3D terrain scene for the landing hero:
// wireframe elevation grid, an elevated route line, a moving cargo
// marker, and a few pulsing risk hotspots. Subtle camera parallax
// follows the pointer; idle motion otherwise stays minimal, per the
// design spec's "3D should communicate terrain/routes/risk, not
// become decoration" rule. Caller is responsible for not mounting
// this at all when prefers-reduced-motion is set.
export default function TerrainHero({ className = '' }) {
  return (
    <div className={`terrain-hero ${className}`} aria-hidden="true">
      <Canvas
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 1.2, 9], fov: 42 }}
      >
        <Suspense fallback={null}>
          <fog attach="fog" args={['#060b16', 8, 26]} />
          <Terrain />
          <RouteAndCargo />
          <RiskHotspots />
          <Rig enableParallax />
        </Suspense>
      </Canvas>
    </div>
  );
}
