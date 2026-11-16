// Ember Yard: an original industrial yard, 40 by 34 metres, two bomb sites and three
// lanes between them. A is the Furnace, a brick kiln in the north-west; B is the Silo,
// a grain tower in the north-east; mid is a container lane with a divider wall that
// splits it into two sightlines. Every box is a collider and a surface a bullet stops
// on. Plain geometry only, no models and no textures.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WAYPOINTS = [
  { id: 'atk', x: 0, z: 14, links: ['midS', 'west', 'east'] },
  { id: 'midS', x: 0, z: 8, links: ['atk', 'mid', 'west', 'east'] },
  { id: 'mid', x: 0, z: 0, links: ['midS', 'midN', 'west', 'east'] },
  { id: 'midN', x: 0, z: -6, links: ['mid', 'aGate', 'bGate', 'def'] },
  { id: 'aGate', x: -8, z: -4, links: ['midN', 'aSite', 'west'] },
  { id: 'aSite', x: -12, z: -11, links: ['aGate', 'def'] },
  { id: 'bGate', x: 8, z: -4, links: ['midN', 'bSite', 'east'] },
  { id: 'bSite', x: 12, z: -11, links: ['bGate', 'def'] },
  { id: 'def', x: 0, z: -13, links: ['midN', 'aSite', 'bSite'] },
  { id: 'west', x: -14, z: 4, links: ['atk', 'midS', 'mid', 'aGate'] },
  { id: 'east', x: 14, z: 4, links: ['atk', 'midS', 'mid', 'bGate'] },
];

export const ATTACKER_SPAWN = { x: 0, z: 14, yaw: 0 };
export const DEFENDER_SPAWNS = [
  { x: -12, z: -11, yaw: Math.PI },
  { x: 12, z: -11, yaw: Math.PI },
  { x: -4, z: -13, yaw: Math.PI },
  { x: 4, z: -13, yaw: Math.PI },
];

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ember' ? 0.55 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(radius, height, x, y, z, material, segments = 18) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // A box collider is close enough for a round prop and keeps collision identical.
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - radius, y - height / 2, z - radius),
      new THREE.Vector3(x + radius, y + height / 2, z + radius),
    ));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and the 40 x 34 m perimeter, 5 m walls, open to a dusk sky.
  box(40.4, 0.4, 34.4, 0, -0.2, 0, 'ground');
  box(0.4, 5, 34.4, -20.2, 2.5, 0, 'surface');
  box(0.4, 5, 34.4, 20.2, 2.5, 0, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, -17.2, 'surface');
  box(40.4, 5, 0.4, 0, 2.5, 17.2, 'surface');

  // Mid divider: two wall stubs that split the centre lane into left and right
  // sightlines, with a gap in the middle to cross through.
  box(0.6, 3.4, 6, -3.2, 1.7, 2, 'hairline');
  box(0.6, 3.4, 6, 3.2, 1.7, -2, 'hairline');
  box(1.2, 1.1, 1.2, 0, 0.55, 5.4, 'rust');

  // Shipping containers: the big cover in mid, one rust, one charcoal.
  box(4.6, 2.6, 2.2, -8.5, 1.3, 6.5, 'rust');
  box(4.6, 2.6, 2.2, 8.5, 1.3, -6.5, 'hairline');
  box(2.2, 2.6, 4.6, -17.5, 1.3, 2, 'hairline');
  box(2.2, 2.6, 4.6, 17.5, 1.3, -2, 'rust');

  // Crate stacks to crouch behind, scattered on the lanes.
  box(1.2, 1.1, 1.2, -5.5, 0.55, -8.5, 'hairline');
  box(1.2, 1.1, 1.2, 5.5, 0.55, 8.5, 'hairline');
  box(1.2, 1.1, 1.2, -1.8, 0.55, -11, 'hairline');
  box(1.2, 1.1, 1.2, 1.8, 0.55, 11, 'hairline');
  box(2.4, 0.9, 1.2, -12, 0.45, 2, 'hairline');
  box(2.4, 0.9, 1.2, 12, 0.45, -2, 'hairline');

  // Site A, the Furnace: a brick kiln with a chimney and a low wall to plant behind.
  box(4.5, 3.2, 2.5, -16.5, 1.6, -14.5, 'rust');
  cylinder(0.7, 6.5, -18.2, 3.25, -15, 'hairline');
  box(3.2, 1.1, 1.2, -10.5, 0.55, -13.5, 'hairline');
  // Site B, the Silo: a grain tower with a catwalk block and crates.
  cylinder(2.2, 7, 16.5, 3.5, -14.5, 'surface');
  box(3.0, 1.8, 1.4, 10.5, 0.9, -14.8, 'hairline');
  box(1.2, 1.1, 1.2, 13.5, 0.55, -8.5, 'hairline');

  // Barrels and pipes along the walls, for reading the yard at a glance.
  cylinder(0.55, 1.1, -18.5, 0.55, 8, 'rust', 12);
  cylinder(0.55, 1.1, -18.5, 0.55, 9.4, 'rust', 12);
  cylinder(0.55, 1.1, 18.5, 0.55, -8, 'hairline', 12);
  box(0.5, 0.5, 12, -19.6, 3.4, -6, 'hairline');
  box(0.5, 0.5, 12, 19.6, 3.4, 6, 'hairline');

  // Bomb sites: a glowing ring on the floor, a light beam, and a warm lamp.
  const sites = [];
  for (const site of [
    { id: 'A', name: 'Furnace', x: -12, z: -11 },
    { id: 'B', name: 'Silo', x: 12, z: -11 },
  ]) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 2.6, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 7, 12, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.set(site.x, 3.5, site.z);
    group.add(beam);
    const lamp = new THREE.PointLight(new THREE.Color(PALETTE.accent), 12, 12);
    lamp.position.set(site.x, 3.2, site.z);
    group.add(lamp);
    sites.push({ ...site, radius: 2.6, ring, beam, lamp });
  }

  // Light: dusk hemisphere, a warm low sun from the south-west, a cool fill.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.ember), new THREE.Color(PALETTE.ground), 1.5);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(PALETTE.ember), 3.0);
  key.position.set(-12, 16, 14);
  key.target.position.set(0, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -24;
  key.shadow.camera.right = 24;
  key.shadow.camera.top = 24;
  key.shadow.camera.bottom = -24;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.7);
  fill.position.set(10, 10, -12);
  scene.add(fill);
  const ambient = new THREE.AmbientLight(new THREE.Color(PALETTE.ember), 0.55);
  scene.add(ambient);

  return { colliders, shootables, group, sites };
}
