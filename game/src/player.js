// The attacker: acceleration, friction, gravity, crouch and jump, resolved as a box
// against the world's colliders through physics.moveBox. Aiming down sights slows the
// walk; crouching slows it more and lowers the eye. Health and armour live here too,
// so damage has one place to land.
import * as THREE from 'three';
import { moveBox, overlapsBox } from './physics.js';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const ADS_FACTOR = 0.55;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;
const MAX_HEALTH = 100;

export function createPlayer(colliders, spawn) {
  const state = {
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    velocity: new THREE.Vector3(),
    yaw: spawn.yaw ?? 0,
    pitch: 0,
    eye: STAND_EYE,
    onGround: true,
    crouching: false,
    height: STAND_HEIGHT,
    health: MAX_HEALTH,
    armor: 0,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    state.yaw -= dx * sensitivity;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    state.pitch = Math.min(1.45, state.pitch + pitchKick);
    state.yaw += yawKick;
  }

  // Armour soaks half of every hit until it runs out; the rest hits health.
  function damage(amount) {
    if (!state.alive) return 0;
    let rest = amount;
    if (state.armor > 0) {
      const soaked = Math.min(state.armor, Math.ceil(amount / 2));
      state.armor -= soaked;
      rest = amount - soaked;
    }
    state.health = Math.max(0, state.health - rest);
    if (state.health === 0) state.alive = false;
    return rest;
  }

  function reset(spawnPoint) {
    state.position.set(spawnPoint.x, 0, spawnPoint.z);
    state.velocity.set(0, 0, 0);
    state.yaw = spawnPoint.yaw ?? 0;
    state.pitch = 0;
    state.eye = STAND_EYE;
    state.onGround = true;
    state.crouching = false;
    state.height = STAND_HEIGHT;
    state.health = MAX_HEALTH;
    state.alive = true;
  }

  function step(dt, keys, ads) {
    if (!state.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !state.crouching) {
      state.crouching = true;
      state.height = CROUCH_HEIGHT;
    } else if (!crouching && state.crouching
      && !overlapsBox(colliders, state.position.x, state.position.y, state.position.z, STAND_HEIGHT, RADIUS, 0.02)) {
      state.crouching = false;
      state.height = STAND_HEIGHT;
    }
    const eyeTarget = state.crouching ? CROUCH_EYE : STAND_EYE;
    state.eye += (eyeTarget - state.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(state.yaw);
      const cos = Math.cos(state.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    let speed = state.crouching ? CROUCH_SPEED : WALK_SPEED;
    if (ads) speed *= ADS_FACTOR;
    const blend = Math.min(1, (state.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    state.velocity.x += (wish.x * speed - state.velocity.x) * blend;
    state.velocity.z += (wish.z * speed - state.velocity.z) * blend;
    if (state.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      state.velocity.x *= damp;
      state.velocity.z *= damp;
    }

    if (keys.has('Space') && state.onGround) {
      state.velocity.y = JUMP_SPEED;
      state.onGround = false;
    }
    state.velocity.y -= GRAVITY * dt;
    state.velocity.y = Math.max(-30, state.velocity.y);
    state.onGround = moveBox(colliders, state.position, state.velocity, dt, state.height, RADIUS);
  }

  return {
    state,
    step,
    look,
    recoil,
    damage,
    reset,
    groundSpeed() {
      return Math.hypot(state.velocity.x, state.velocity.z);
    },
  };
}
