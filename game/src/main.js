// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. main.js owns the match: its phases, its rounds, its money, its shooting ray
// and its grenades. Every other module owns one job and is told what to do.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, ATTACKER_SPAWN, DEFENDER_SPAWNS } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons, ARSENAL, BUY_ORDER, GRENADE_PRICE } from './weapons.js';
import { createBots } from './bots.js';
import { createBomb, PLANT_TIME, DEFUSE_TIME } from './bomb.js';
import { createEconomy, ROUND_WIN, ROUND_LOSS, KILL_REWARD, PLANT_REWARD, ARMOR_PRICE, ARMOR_POINTS } from './economy.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const ROUND_TIME = 100;
const WIN_ROUNDS = 5;
const MAX_ROUNDS = 9;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = shot ? mulberry32(seed) : Math.random;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 40, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const bots = createBots(scene, world, random);
const bomb = createBomb(scene);
const economy = createEconomy();
const effects = createEffects(scene);
const audio = createAudio();
const weapons = createWeapons(camera);
const player = createPlayer(world.colliders, ATTACKER_SPAWN);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();

// The match state, in one place: everything the round needs to know.
const state = {
  phase: 'menu',
  round: 1,
  scoreA: 0,
  scoreD: 0,
  timer: ROUND_TIME,
  roundOver: false,
  matchOver: false,
  planting: false,
  plantHeld: 0,
  inSite: null,
  kills: 0,
  elapsed: 0,
};
let noises = [];
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let fovTarget = 74;

const grenades = [];
const grenadeNext = new THREE.Vector3();
const grenadeBox = new THREE.Box3();
for (let index = 0; index < 2; index += 1) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 10, 8),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.rust), roughness: 0.5, metalness: 0.4 }),
  );
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);
  grenades.push({ mesh, velocity: new THREE.Vector3(), fuse: 0, live: false });
}

const hud = createHud({
  onPlay: () => {
    audio.unlock();
    if (state.phase === 'menu' || state.matchOver) startMatch();
    else if (state.phase === 'roundEnd') startBuyPhase();
    else if (state.phase === 'paused') resumeRound();
  },
  onBuy: (id) => buyItem(id),
  onDeploy: () => {
    audio.unlock();
    audio.click();
    deploy();
  },
});

function syncCamera() {
  const body = player.state;
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
  camera.fov += (fovTarget - camera.fov) * 0.2;
  camera.updateProjectionMatrix();
}

function pushHud() {
  const def = weapons.def();
  hud.setHealth(player.state.health, player.state.armor);
  hud.setAmmo(weapons.state.mag[weapons.state.current], weapons.state.reserve[weapons.state.current], def.name);
  hud.setMoney(economy.state.money);
  hud.setTimer(state.phase === 'round' ? state.timer : ROUND_TIME);
  hud.setScore(state.scoreA, state.scoreD, state.round);
  hud.setCrosshair(weapons.spread(player.groundSpeed(), input.state.ads));
}

function buyMenuData() {
  const items = BUY_ORDER.map((id) => ({
    id,
    name: ARSENAL[id].name,
    desc: id === 'p9' ? '12-round sidearm · your backup' : id === 'vex' ? 'Fast SMG · close quarters' : 'One-tap headshot rifle',
    price: ARSENAL[id].price,
    owned: Boolean(weapons.state.owned[id]),
  }));
  items.push({
    id: 'grenade',
    name: 'Frag Grenade',
    desc: 'Cooks 1.2 s · G to throw',
    price: GRENADE_PRICE,
    owned: economy.state.grenades >= 2,
  });
  items.push({
    id: 'armor',
    name: 'Kevlar Vest',
    desc: `Soaks half of every hit · +${ARMOR_POINTS} armour`,
    price: ARMOR_PRICE,
    owned: economy.state.armorBought,
  });
  return { round: state.round, money: economy.state.money, items };
}

function buyItem(id) {
  if (state.phase !== 'buy') return;
  if (id === 'grenade') {
    if (economy.buyGrenade()) audio.click();
  } else if (id === 'armor') {
    if (economy.buyArmor()) {
      player.state.armor = ARMOR_POINTS;
      audio.click();
    }
  } else if (economy.buyWeapon(id) && weapons.buy(id)) {
    audio.click();
  }
  hud.showBuy(buyMenuData());
  pushHud();
}

function startMatch() {
  state.round = 1;
  state.scoreA = 0;
  state.scoreD = 0;
  state.matchOver = false;
  state.kills = 0;
  economy.reset();
  weapons.state.current = 'p9';
  weapons.state.owned = { p9: true };
  weapons.switchTo('p9');
  startBuyPhase();
}

function startBuyPhase() {
  state.phase = 'buy';
  state.timer = ROUND_TIME;
  state.roundOver = false;
  state.planting = false;
  state.plantHeld = 0;
  state.inSite = null;
  player.reset(ATTACKER_SPAWN);
  if (economy.state.armorBought) player.state.armor = ARMOR_POINTS;
  bots.reset(DEFENDER_SPAWNS);
  bomb.reset();
  weapons.refillAmmo();
  for (const grenade of grenades) {
    grenade.live = false;
    grenade.mesh.visible = false;
  }
  noises = [];
  hud.setBomb('');
  hud.showBuy(buyMenuData());
  pushHud();
  input.releaseLock();
}

function deploy() {
  if (state.phase !== 'buy') return;
  state.phase = 'round';
  hud.hideOverlay();
  input.requestLock();
  pushHud();
}

function resumeRound() {
  state.phase = 'round';
  hud.hideOverlay();
  input.requestLock();
}

function endRound(winner, reason) {
  if (state.roundOver) return;
  state.roundOver = true;
  state.phase = 'roundEnd';
  if (winner === 'attackers') {
    state.scoreA += 1;
    economy.earn(ROUND_WIN);
    audio.roundWin();
  } else {
    state.scoreD += 1;
    economy.earn(ROUND_LOSS);
    audio.roundLose();
  }
  const matchWon = state.scoreA >= WIN_ROUNDS || state.scoreD >= WIN_ROUNDS || state.round >= MAX_ROUNDS;
  state.matchOver = matchWon;
  input.releaseLock();
  const titles = {
    eliminated: winner === 'attackers' ? 'Squad wiped' : 'You are down',
    detonation: 'Charge detonated',
    defused: 'Charge defused',
    timeout: 'Time expired',
  };
  const copies = {
    eliminated: winner === 'attackers' ? 'All four defenders are down. The yard is yours.' : 'The defenders held the yard. Buy up and go again.',
    detonation: 'The charge blew the Furnace sky-high. The yard is yours.',
    defused: 'A defender cut the charge with seconds to spare.',
    timeout: 'The round ran out with the charge still in your pocket.',
  };
  const title = matchWon
    ? (state.scoreA > state.scoreD ? 'Match won — the yard is yours' : 'Match lost — the yard holds')
    : titles[reason];
  const copy = matchWon
    ? `Final score ${state.scoreA} : ${state.scoreD} over ${state.round} rounds, ${state.kills} eliminations.`
    : `${copies[reason]} Score ${state.scoreA} : ${state.scoreD}. +$${winner === 'attackers' ? ROUND_WIN : ROUND_LOSS}.`;
  hud.setScore(state.scoreA, state.scoreD, state.round);
  hud.setMoney(economy.state.money);
  hud.setBomb('');
  hud.showRoundEnd({ title, copy, matchOver: matchWon });
  if (!matchWon) state.round += 1;
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    if (state.phase === 'round') hud.hideOverlay();
  } else if (state.phase === 'round' && player.state.alive) {
    state.phase = 'paused';
    hud.showPaused();
  }
}

function siteUnderPlayer() {
  for (const site of world.sites) {
    const distance = Math.hypot(site.x - player.state.position.x, site.z - player.state.position.z);
    if (distance <= site.radius) return site;
  }
  return null;
}

function shoot(spread) {
  const def = weapons.def();
  if (!weapons.takeRound()) return false;
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  weapons.muzzleWorld(muzzle);
  if (hit) {
    effects.tracer(muzzle, hit.point);
    if (hit.object.userData.bot) {
      const bot = hit.object.userData.bot;
      const part = hit.object.userData.part;
      const killed = bots.damage(hit.object, def.damage[part]);
      hud.hitMarker(killed, shot ? 4000 : 90);
      audio.hit(killed);
      if (killed) {
        state.kills += 1;
        economy.earn(KILL_REWARD);
        hud.killfeed(`You eliminated ${bot.name} · +$${KILL_REWARD}`);
      }
    } else {
      effects.spark(hit.point);
    }
  } else {
    aimPoint.copy(camera.position).addScaledVector(direction, 60);
    effects.tracer(muzzle, aimPoint);
  }
  weapons.pullTrigger();
  player.recoil(def.kick + random() * 0.003, (random() * 2 - 1) * 0.003);
  noises.push({ x: player.state.position.x, z: player.state.position.z, radius: bots.hearRadius, at: state.elapsed });
  audio.shot('player');
  pushHud();
  return true;
}

function throwGrenade() {
  if (economy.state.grenades <= 0) return;
  const slot = grenades.find((item) => !item.live);
  if (!slot) return;
  economy.state.grenades -= 1;
  camera.getWorldDirection(direction);
  slot.mesh.position.copy(camera.position).addScaledVector(direction, 0.5);
  slot.mesh.position.y -= 0.1;
  slot.velocity.copy(direction).multiplyScalar(17);
  slot.velocity.y += 4;
  slot.fuse = 1.2;
  slot.live = true;
  slot.mesh.visible = true;
  audio.click();
  pushHud();
}

function explodeGrenade(slot) {
  slot.live = false;
  slot.mesh.visible = false;
  const point = slot.mesh.position;
  effects.explode(point);
  audio.explosion();
  noises.push({ x: point.x, z: point.z, radius: bots.hearRadius, at: state.elapsed });
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const distance = Math.hypot(bot.position.x - point.x, bot.position.z - point.z);
    if (distance > 6) continue;
    const amount = Math.round(120 * (1 - distance / 6));
    if (bots.damage(bot.torso, amount)) {
      state.kills += 1;
      economy.earn(KILL_REWARD);
      hud.killfeed(`Frag eliminated ${bot.name} · +$${KILL_REWARD}`);
    }
  }
  const playerDistance = Math.hypot(player.state.position.x - point.x, player.state.position.z - point.z);
  if (playerDistance < 5 && player.state.alive) {
    player.damage(Math.round(60 * (1 - playerDistance / 5)));
    hud.damageFlash();
  }
  pushHud();
}

function stepGrenades(dt) {
  for (const slot of grenades) {
    if (!slot.live) continue;
    slot.fuse -= dt;
    slot.velocity.y -= 12 * dt;
    grenadeNext.copy(slot.mesh.position).addScaledVector(slot.velocity, dt);
    // A cheap bounce: stop the axis that hits a wall, keep the rest.
    const next = grenadeNext;
    grenadeBox.min.set(next.x - 0.09, next.y - 0.09, next.z - 0.09);
    grenadeBox.max.set(next.x + 0.09, next.y + 0.09, next.z + 0.09);
    let blocked = false;
    for (const collider of world.colliders) {
      if (grenadeBox.intersectsBox(collider)) { blocked = true; break; }
    }
    if (blocked || next.y < 0.09) {
      slot.velocity.multiplyScalar(0.35);
      slot.velocity.y = Math.abs(slot.velocity.y) * 0.4;
      if (next.y < 0.09) next.y = 0.09;
    } else {
      slot.mesh.position.copy(next);
    }
    if (slot.fuse <= 0) explodeGrenade(slot);
  }
}

function step(dt) {
  state.elapsed += dt;
  if (state.phase === 'round') {
    state.timer -= dt;
    const body = player.state;
    player.step(dt, input.state.keys, input.state.ads);
    weapons.step(dt, input.state.ads);
    fovTarget = input.state.ads ? 58 : 74;
    if (input.consumePressed('KeyR')) {
      weapons.reload();
      audio.reload();
    }
    if (input.consumePressed('Digit1')) weapons.switchTo('p9');
    if (input.consumePressed('Digit2')) weapons.switchTo('vex');
    if (input.consumePressed('Digit3')) weapons.switchTo('ar77');
    if (input.consumePressed('KeyG')) throwGrenade();
    if (input.consumePressed('KeyB')) hud.killfeed('Buy phase is over — win the round to buy again');

    // Planting: hold E inside a site while carrying the charge.
    state.inSite = bomb.state.carried ? siteUnderPlayer() : null;
    if (state.inSite && input.state.keys.has('KeyE')) {
      state.plantHeld += dt;
      hud.setBomb(`Planting at site ${state.inSite.id}… ${Math.round((state.plantHeld / PLANT_TIME) * 100)}%`);
      if (state.plantHeld >= PLANT_TIME) {
        bomb.plant(state.inSite, player.state.position);
        economy.earn(PLANT_REWARD);
        hud.killfeed(`Charge planted at site ${state.inSite.id} · +$${PLANT_REWARD}`);
        hud.setBomb(`Charge planted — site ${state.inSite.id} · ${Math.ceil(bomb.state.fuseLeft)}s`);
        audio.beep(880);
        state.plantHeld = 0;
      }
    } else {
      state.plantHeld = Math.max(0, state.plantHeld - dt * 2);
      if (bomb.state.planted) hud.setBomb(`Charge planted — site ${bomb.state.site.id} · ${Math.ceil(bomb.state.fuseLeft)}s`);
      else hud.setBomb('');
    }

    const bombResult = bomb.step(dt, bots.anyDefusing(), audio);
    if (bombResult === 'detonated') {
      effects.explode(bomb.state.position);
      audio.explosion();
      endRound('attackers', 'detonation');
    } else if (bombResult === 'defused') {
      endRound('defenders', 'defused');
    }

    bots.step(dt, {
      time: state.elapsed,
      playerPosition: body.position,
      playerAlive: body.alive,
      playerSpeed: player.groundSpeed(),
      playerCrouch: body.crouching,
      noises,
      bombPlanted: bomb.state.planted,
      bombSite: bomb.state.planted ? bomb.state.site : null,
      bombSiteNode: bomb.state.planted ? (bomb.state.site.id === 'A' ? 'aSite' : 'bSite') : null,
      world,
      effects,
      audio,
      damagePlayer: (amount, fromBot) => {
        if (!body.alive) return;
        player.damage(amount);
        hud.damageFlash();
        if (!body.alive) {
          hud.killfeed(`${fromBot.name} eliminated you`);
          endRound('defenders', 'eliminated');
        }
        pushHud();
      },
    });
    stepGrenades(dt);
    noises = [];

    if (!state.roundOver) {
      if (bots.aliveCount() === 0) endRound('attackers', 'eliminated');
      else if (state.timer <= 0) endRound('defenders', 'timeout');
    }
    pushHud();
  } else {
    weapons.step(dt, false);
  }
  effects.step(dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (state.phase === 'round' || state.phase === 'buy') player.look(look.x, look.y);
    if (state.phase === 'round' && input.state.firing && weapons.ready()) {
      shoot(shot ? 0 : weapons.spread(player.groundSpeed(), input.state.ads));
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function runShot(name) {
  hud.hideOverlay();
  player.state.pitch = 0;
  if (name === 'start') {
    startBuyPhase();
    hud.showStart();
    player.state.position.set(-2, 0, 10);
    player.state.yaw = 0.12;
    syncCamera();
  } else if (name === 'play') {
    startBuyPhase();
    deploy();
    state.timer = 62;
    economy.state.money = 4000;
    if (economy.buyWeapon('ar77')) weapons.buy('ar77');
    weapons.switchTo('ar77');
    player.state.position.set(0, 0, 10);
    player.state.yaw = 0;
    settle(20);
    aimAt(bots.aimPoint(2));
    for (let round = 0; round < 2; round += 1) {
      shoot(0);
      settle(8);
    }
    settle(12);
    aimAt(bots.aimPoint(2));
    shoot(0);
    settle(1);
    hud.setBomb('');
    pushHud();
  } else {
    startBuyPhase();
    deploy();
    state.scoreA = 0;
    state.round = 1;
    const site = world.sites[0];
    bomb.plant(site, new THREE.Vector3(site.x, 0, site.z));
    bots.bots[0].alive = false;
    bots.bots[0].fall = 1;
    bots.bots[0].group.rotation.x = -1.45;
    bots.bots[0].group.position.y = -0.08;
    player.state.position.set(-6, 0, -4);
    aimAt(new THREE.Vector3(site.x, 1, site.z));
    settle(30);
    endRound('attackers', 'detonation');
    // endRound already showed its overlay; keep the planted charge visible behind it.
    bomb.state.planted = true;
    bomb.state.site = site;
    pushHud();
  }
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

hud.showStart();
pushHud();
syncCamera();
// A handle for automated playtests; harmless in the shipped game.
window.__ember = { state, player, bots, bomb, economy, weapons, input, world };
if (shot) runShot(shot);
else requestAnimationFrame(frame);
