// The charge: carried by the attacker, planted at a site by holding E, ticking down
// to a detonation that wins the round. A living defender standing on the site defuses
// it. Plant and defuse both take held time, so they are decisions, not taps.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const PLANT_TIME = 3.5;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 35;

export function createBomb(scene) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.22, 0.26),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.3 }),
  );
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.danger), 0, 6);
  scene.add(light);

  const state = {
    carried: true,
    planted: false,
    site: null,
    position: new THREE.Vector3(),
    plantProgress: 0,
    defuseProgress: 0,
    fuseLeft: FUSE_TIME,
    exploded: false,
    beepTimer: 0,
  };

  function reset() {
    state.carried = true;
    state.planted = false;
    state.site = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.fuseLeft = FUSE_TIME;
    state.exploded = false;
    state.beepTimer = 0;
    mesh.visible = false;
    light.intensity = 0;
  }

  function plant(site, position) {
    state.carried = false;
    state.planted = true;
    state.site = site;
    state.position.copy(position);
    state.fuseLeft = FUSE_TIME;
    state.defuseProgress = 0;
    mesh.position.copy(position);
    mesh.position.y = 0.12;
    mesh.visible = true;
  }

  // Returns 'detonated' when the fuse runs out, else null. Beeps speed up as it ticks.
  function step(dt, defusing, audio) {
    if (!state.planted || state.exploded) return null;
    state.fuseLeft -= dt;
    state.beepTimer -= dt;
    const interval = state.fuseLeft > 20 ? 1.0 : state.fuseLeft > 10 ? 0.5 : 0.25;
    if (state.beepTimer <= 0) {
      state.beepTimer = interval;
      audio.beep(state.fuseLeft <= 10 ? 880 : 620);
    }
    light.position.copy(state.position);
    light.position.y = 0.5;
    light.intensity = 4 + Math.sin(state.fuseLeft * 8) * 3;
    if (defusing) {
      state.defuseProgress += dt;
    } else {
      state.defuseProgress = Math.max(0, state.defuseProgress - dt * 2);
    }
    if (state.defuseProgress >= DEFUSE_TIME) {
      state.planted = false;
      state.exploded = false;
      mesh.visible = false;
      light.intensity = 0;
      return 'defused';
    }
    if (state.fuseLeft <= 0) {
      state.exploded = true;
      mesh.visible = false;
      light.intensity = 0;
      return 'detonated';
    }
    return null;
  }

  return { state, reset, plant, step };
}
