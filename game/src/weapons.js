// The arsenal: three guns and the numbers that make them play differently. Each entry
// owns its damage by body part, its magazine, its fire rate, its spread and its price;
// the module owns the view model, the magazine state, the reload and the kick. The
// main loop owns the ray and the damage, so a gun never decides what it hit.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const ARSENAL = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', short: 'P9', price: 0, auto: false,
    damage: { head: 68, torso: 34, leg: 26 },
    mag: 12, reserve: 36, fireGap: 0.18, reloadTime: 1.4,
    spreadStill: 0.004, spreadMove: 0.03, kick: 0.006, adsSpread: 0.45,
  },
  vex: {
    id: 'vex', name: 'Vex-9 SMG', short: 'VEX', price: 1500, auto: true,
    damage: { head: 50, torso: 25, leg: 18 },
    mag: 28, reserve: 84, fireGap: 0.085, reloadTime: 1.7,
    spreadStill: 0.006, spreadMove: 0.035, kick: 0.005, adsSpread: 0.45,
  },
  ar77: {
    id: 'ar77', name: 'AR-77 Rifle', short: 'AR-77', price: 2700, auto: true,
    damage: { head: 100, torso: 34, leg: 25 },
    mag: 25, reserve: 75, fireGap: 0.11, reloadTime: 2.1,
    spreadStill: 0.0025, spreadMove: 0.028, kick: 0.009, adsSpread: 0.4,
  },
};
export const BUY_ORDER = ['p9', 'vex', 'ar77'];
export const GRENADE_PRICE = 300;

const MUZZLE_TIME = 0.06;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });
  const group = new THREE.Group();
  const long = def.id === 'ar77' ? 0.38 : def.id === 'vex' ? 0.32 : 0.22;
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, long), body);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, long * 0.6), grip);
  barrel.position.set(0, 0.016, -long * 0.62);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.12), grip);
  stock.position.set(0, -0.014, long / 2 - 0.04);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.045, 0.07), accent);
  sight.position.set(0, 0.068, -long * 0.2);
  group.add(receiver, barrel, stock, sight);
  if (def.id === 'vex') {
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), grip);
    mag.position.set(0, -0.1, -0.05);
    group.add(mag);
  }
  group.scale.setScalar(0.65);
  group.position.set(0.26, -0.3, -0.6);
  return group;
}

export function createWeapons(camera) {
  const models = {};
  for (const def of Object.values(ARSENAL)) {
    models[def.id] = buildViewModel(def);
    models[def.id].visible = false;
    camera.add(models[def.id]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.26, -0.27, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.26, -0.24, -0.75);
  camera.add(flashLight);

  const state = {
    current: 'p9',
    owned: { p9: true },
    mag: {},
    reserve: {},
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
  };
  for (const def of Object.values(ARSENAL)) {
    state.mag[def.id] = def.mag;
    state.reserve[def.id] = def.reserve;
  }
  models.p9.visible = true;

  function def() {
    return ARSENAL[state.current];
  }

  function step(dt, ads) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    const adsBlend = ads ? 1 : 0;
    model.position.x = 0.26 - adsBlend * 0.26;
    model.position.y = -0.3 + adsBlend * 0.08;
    model.position.z = -0.6 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag[state.current];
        const take = Math.min(need, state.reserve[state.current]);
        state.mag[state.current] += take;
        state.reserve[state.current] -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag[state.current] > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag[state.current] <= 0) return false;
      state.mag[state.current] -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag[state.current] === def().mag || state.reserve[state.current] === 0) return;
      state.reloadLeft = def().reloadTime;
    },
    spread(speed, ads) {
      const base = def().spreadStill + Math.min(1, speed / 5.2) * def().spreadMove;
      return ads ? base * def().adsSpread : base;
    },
    switchTo(id) {
      if (!state.owned[id] || id === state.current) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      state.cooldown = Math.max(state.cooldown, 0.25);
      state.reloadLeft = 0;
      return true;
    },
    buy(id) {
      if (state.owned[id]) return false;
      state.owned[id] = true;
      state.mag[id] = ARSENAL[id].mag;
      state.reserve[id] = ARSENAL[id].reserve;
      return true;
    },
    refillAmmo() {
      for (const item of Object.values(ARSENAL)) {
        if (!state.owned[item.id]) continue;
        state.mag[item.id] = item.mag;
        state.reserve[item.id] = item.reserve;
      }
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
    },
    muzzleWorld(out) {
      out.set(0.26, -0.27, -1.0);
      return camera.localToWorld(out);
    },
  };
}
