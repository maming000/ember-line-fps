// The defenders: four bots that hold the sites, patrol the lanes, hear gunfire and
// converge on a planted charge to defuse it. Each bot is a small state machine — hold,
// patrol, investigate, engage, defuse — over a waypoint graph, with line of sight
// checked by raycast and shots that miss more the farther and faster the target is.
// A bot never sees through a wall and never knows where the player is until it sees
// or hears them.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS } from './world.js';
import { moveBox } from './physics.js';

const NAMES = ['Ash', 'Cinder', 'Slag', 'Flint'];
const HEALTH = 100;
const SPEED = 3.2;
const ENGAGE_SPEED = 1.6;
const REACTION = 0.45;
const BURST_MIN = 3;
const BURST_MAX = 5;
const SHOT_GAP = 0.13;
const BURST_PAUSE_MIN = 0.7;
const BURST_PAUSE_MAX = 1.3;
const HEAR_RADIUS = 26;
const SIGHT_RANGE = 46;
const FALL_SECONDS = 0.45;

const byId = new Map(WAYPOINTS.map((node) => [node.id, node]));

function nearestNode(position) {
  let best = WAYPOINTS[0];
  let bestDistance = Infinity;
  for (const node of WAYPOINTS) {
    const distance = (node.x - position.x) ** 2 + (node.z - position.z) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best;
}

// Breadth-first over the waypoint graph; the path is a list of node ids to follow.
function findPath(fromId, toId) {
  if (fromId === toId) return [toId];
  const previous = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const link of byId.get(current).links) {
      if (previous.has(link)) continue;
      previous.set(link, current);
      if (link === toId) {
        const path = [toId];
        let step = link;
        while (previous.get(step) !== null) {
          step = previous.get(step);
          path.unshift(step);
        }
        return path;
      }
      queue.push(link);
    }
  }
  return [toId];
}

function buildBotMesh(scene, index) {
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.75 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });
  const visor = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.5 });
  const group = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), dark);
  legs.position.y = 0.4;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.65, 0.32), cloth);
  torso.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), dark);
  head.position.y = 1.62;
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.05), visor);
  strip.position.set(0, 1.64, -0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.55), dark);
  gun.position.set(0.2, 1.15, -0.3);
  group.add(legs, torso, head, strip, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  group.position.set(0, 0, 0);
  scene.add(group);
  return { group, legs, torso, head };
}

export function createBots(scene, world, random) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = SIGHT_RANGE;
  const toPlayer = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const target = new THREE.Vector3();
  const bots = [];
  const hitMeshes = [];

  const holds = ['aSite', 'bSite', 'midN', 'def'];
  for (let index = 0; index < 4; index += 1) {
    const parts = buildBotMesh(scene, index);
    const bot = {
      id: index,
      name: NAMES[index],
      group: parts.group,
      torso: parts.torso,
      head: parts.head,
      legs: parts.legs,
      position: parts.group.position,
      velocity: new THREE.Vector3(),
      yaw: 0,
      hp: HEALTH,
      alive: true,
      state: 'hold',
      holdNode: holds[index],
      path: [],
      pathIndex: 0,
      speed: SPEED,
      reaction: 0,
      burstLeft: 0,
      shotTimer: 0,
      pauseTimer: 0,
      losOk: false,
      losTimer: index * 0.04,
      heard: null,
      scanPhase: random() * Math.PI * 2,
      fall: 0,
      defusing: false,
      strafeDir: 1,
      strafeTimer: 0,
    };
    parts.torso.userData = { bot, part: 'torso' };
    parts.head.userData = { bot, part: 'head' };
    parts.legs.userData = { bot, part: 'leg' };
    hitMeshes.push(parts.torso, parts.head, parts.legs);
    bots.push(bot);
  }

  function reset(spawns) {
    for (let index = 0; index < bots.length; index += 1) {
      const bot = bots[index];
      const spawn = spawns[index];
      bot.position.set(spawn.x, 0, spawn.z);
      bot.velocity.set(0, 0, 0);
      bot.yaw = spawn.yaw ?? Math.PI;
      bot.group.rotation.set(0, bot.yaw, 0);
      bot.hp = HEALTH;
      bot.alive = true;
      bot.state = 'hold';
      bot.path = [];
      bot.pathIndex = 0;
      bot.reaction = 0;
      bot.burstLeft = 0;
      bot.shotTimer = 0;
      bot.pauseTimer = 0;
      bot.losOk = false;
      bot.heard = null;
      bot.fall = 0;
      bot.defusing = false;
    }
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return false;
    bot.hp -= amount;
    if (bot.hp > 0) return false;
    bot.alive = false;
    bot.fall = 0;
    bot.defusing = false;
    return true;
  }

  function setPath(bot, nodeId) {
    const from = nearestNode(bot.position).id;
    bot.path = findPath(from, nodeId);
    bot.pathIndex = 0;
  }

  function followPath(bot, dt, speed) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = byId.get(bot.path[bot.pathIndex]);
    const dx = node.x - bot.position.x;
    const dz = node.z - bot.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.5) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    bot.velocity.set((dx / distance) * speed, 0, (dz / distance) * speed);
    bot.yaw = Math.atan2(-dx, -dz);
    bot.velocity.y = -0.1;
    moveBox(world.colliders, bot.position, bot.velocity, dt, 1.72, 0.34);
    bot.group.rotation.y = bot.yaw;
    return false;
  }

  function checkLos(bot, playerPosition) {
    eye.set(bot.position.x, bot.position.y + 1.5, bot.position.z);
    target.copy(playerPosition);
    target.y += 1.2;
    toPlayer.subVectors(target, eye);
    const distance = toPlayer.length();
    if (distance > SIGHT_RANGE) return false;
    raycaster.set(eye, toPlayer.normalize());
    raycaster.far = distance;
    scene.updateMatrixWorld(true);
    return raycaster.intersectObjects(world.shootables, false).length === 0;
  }

  function step(dt, env) {
    const now = env.time;
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / FALL_SECONDS);
        bot.group.rotation.x = -bot.fall * 1.45;
        bot.group.position.y = -bot.fall * 0.08;
        continue;
      }
      bot.group.rotation.x = 0;
      bot.group.position.y = 0;

      // Hearing: a shot inside the radius is a position to investigate.
      for (const noise of env.noises) {
        const distance = Math.hypot(noise.x - bot.position.x, noise.z - bot.position.z);
        if (distance < noise.radius) {
          bot.heard = { x: noise.x, z: noise.z, at: now };
        }
      }

      // Sight, throttled and staggered so four bots never raycast on one frame.
      bot.losTimer -= dt;
      if (bot.losTimer <= 0) {
        bot.losTimer = 0.15;
        bot.losOk = env.playerAlive && checkLos(bot, env.playerPosition);
      }

      if (bot.losOk && env.playerAlive) {
        if (bot.state !== 'engage') {
          bot.state = 'engage';
          bot.reaction = REACTION + random() * 0.2;
          bot.burstLeft = 0;
          bot.pauseTimer = 0.2;
        }
      } else if (bot.state === 'engage') {
        bot.state = bot.heard ? 'investigate' : 'hold';
        bot.burstLeft = 0;
      }

      if (env.bombPlanted && bot.state !== 'engage') {
        bot.state = 'defuse';
        if (bot.path.length === 0 || bot.path[bot.path.length - 1] !== env.bombSiteNode) {
          setPath(bot, env.bombSiteNode);
        }
      } else if (!env.bombPlanted && bot.state === 'defuse') {
        bot.state = 'hold';
        bot.path = [];
      }

      if (bot.state === 'engage') {
        const dx = env.playerPosition.x - bot.position.x;
        const dz = env.playerPosition.z - bot.position.z;
        const distance = Math.hypot(dx, dz) || 1;
        bot.yaw = Math.atan2(-dx, -dz);
        bot.group.rotation.y = bot.yaw;
        // Strafe sideways while engaging, flipping direction every second or so.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeTimer = 0.8 + random() * 0.6;
          bot.strafeDir = random() < 0.5 ? -1 : 1;
        }
        const away = distance < 6 ? -1 : 0;
        const sideX = (-dz / distance) * bot.strafeDir + (dx / distance) * away;
        const sideZ = (dx / distance) * bot.strafeDir + (dz / distance) * away;
        bot.velocity.set(sideX * ENGAGE_SPEED, -0.1, sideZ * ENGAGE_SPEED);
        moveBox(world.colliders, bot.position, bot.velocity, dt, 1.72, 0.34);
        // Fire in bursts after the reaction delay.
        if (bot.reaction > 0) {
          bot.reaction -= dt;
        } else if (bot.burstLeft > 0) {
          bot.shotTimer -= dt;
          if (bot.shotTimer <= 0) {
            bot.shotTimer = SHOT_GAP;
            bot.burstLeft -= 1;
            fireAt(bot, env, distance);
            if (bot.burstLeft === 0) bot.pauseTimer = BURST_PAUSE_MIN + random() * (BURST_PAUSE_MAX - BURST_PAUSE_MIN);
          }
        } else {
          bot.pauseTimer -= dt;
          if (bot.pauseTimer <= 0) {
            bot.burstLeft = BURST_MIN + Math.floor(random() * (BURST_MAX - BURST_MIN + 1));
            bot.shotTimer = 0;
          }
        }
      } else if (bot.state === 'defuse') {
        const site = env.bombSite;
        const distance = Math.hypot(site.x - bot.position.x, site.z - bot.position.z);
        if (distance > 1.6) {
          followPath(bot, dt, SPEED);
          bot.defusing = false;
        } else {
          bot.defusing = true;
          bot.yaw += dt * 0.4;
          bot.group.rotation.y = bot.yaw;
        }
      } else if (bot.state === 'investigate' && bot.heard) {
        const node = nearestNode(new THREE.Vector3(bot.heard.x, 0, bot.heard.z));
        if (bot.path.length === 0 || bot.path[bot.path.length - 1] !== node.id) setPath(bot, node.id);
        if (followPath(bot, dt, SPEED)) {
          bot.heard = null;
          bot.state = 'hold';
          bot.path = [];
        }
      } else {
        // Hold or patrol: walk to the hold node, then scan the lane.
        const node = byId.get(bot.holdNode);
        const distance = Math.hypot(node.x - bot.position.x, node.z - bot.position.z);
        if (distance > 1.2) {
          if (bot.path.length === 0 || bot.path[bot.path.length - 1] !== bot.holdNode) setPath(bot, bot.holdNode);
          followPath(bot, dt, SPEED);
        } else {
          bot.yaw = Math.PI + Math.sin(now * 0.5 + bot.scanPhase) * 0.9;
          bot.group.rotation.y = bot.yaw;
        }
      }
    }
  }

  function fireAt(bot, env, distance) {
    // Hit chance falls with range and with the target's speed; crouching helps them.
    let chance = 0.55 - (distance / SIGHT_RANGE) * 0.3;
    chance -= Math.min(0.2, env.playerSpeed / 5.2) * 0.25;
    if (env.playerCrouch) chance -= 0.08;
    const muzzle = new THREE.Vector3(bot.position.x, bot.position.y + 1.35, bot.position.z);
    const aim = new THREE.Vector3(env.playerPosition.x, env.playerPosition.y + 1.2, env.playerPosition.z);
    if (random() < Math.max(0.08, chance)) {
      env.effects.tracer(muzzle, aim, 0xffb36b);
      env.damagePlayer(9 + Math.floor(random() * 7), bot);
    } else {
      aim.x += (random() * 2 - 1) * 1.6;
      aim.y += (random() * 2 - 1) * 0.9;
      aim.z += (random() * 2 - 1) * 1.6;
      env.effects.tracer(muzzle, aim, 0xffb36b);
    }
    env.audio.shot('bot');
  }

  return {
    bots,
    hitMeshes,
    step,
    reset,
    damage,
    hearRadius: HEAR_RADIUS,
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    anyDefusing() {
      return bots.some((bot) => bot.alive && bot.defusing);
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      return new THREE.Vector3(bot.position.x, bot.position.y + 1.15, bot.position.z);
    },
  };
}
