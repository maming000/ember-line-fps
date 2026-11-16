// Pooled effects, so the hot loop never allocates: tracers, impact sparks and the
// bomb's explosion are reused meshes whose life is counted down in step().
import * as THREE from 'three';

const TRACERS = 10;
const SPARKS = 8;
const TRACER_LIFE = 0.07;
const SPARK_LIFE = 0.3;

export function createEffects(scene) {
  const tracers = [];
  for (let index = 0; index < TRACERS; index += 1) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.02, 0.02, 1),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  const sparks = [];
  for (let index = 0; index < SPARKS; index += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0 }),
    );
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0 });
  }
  const explosion = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0, depthWrite: false }),
  );
  explosion.visible = false;
  scene.add(explosion);
  const explosionLight = new THREE.PointLight(0xff7a1a, 0, 30);
  scene.add(explosionLight);
  const explosionState = { life: 0, position: new THREE.Vector3() };

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const mid = new THREE.Vector3();

  function tracer(start, end, color = 0xffc46b) {
    let slot = tracers.find((item) => item.life <= 0);
    if (!slot) slot = tracers[0];
    from.copy(start);
    to.copy(end);
    mid.addVectors(from, to).multiplyScalar(0.5);
    slot.mesh.position.copy(mid);
    slot.mesh.lookAt(to);
    slot.mesh.scale.set(1, 1, from.distanceTo(to));
    slot.mesh.material.color.setHex(color);
    slot.mesh.material.opacity = 0.9;
    slot.mesh.visible = true;
    slot.life = TRACER_LIFE;
  }

  function spark(point) {
    let slot = sparks.find((item) => item.life <= 0);
    if (!slot) slot = sparks[0];
    slot.mesh.position.copy(point);
    slot.mesh.material.opacity = 0.95;
    slot.mesh.visible = true;
    slot.life = SPARK_LIFE;
  }

  function explode(point) {
    explosion.position.copy(point);
    explosion.position.y = 0.8;
    explosion.visible = true;
    explosionState.life = 0.6;
    explosionState.position.copy(point);
    explosionLight.position.copy(point);
    explosionLight.position.y = 1.5;
    explosionLight.intensity = 60;
  }

  function step(dt) {
    for (const item of tracers) {
      if (item.life <= 0) continue;
      item.life -= dt;
      item.mesh.material.opacity = Math.max(0, item.life / TRACER_LIFE) * 0.9;
      if (item.life <= 0) item.mesh.visible = false;
    }
    for (const item of sparks) {
      if (item.life <= 0) continue;
      item.life -= dt;
      item.mesh.material.opacity = Math.max(0, item.life / SPARK_LIFE) * 0.95;
      item.mesh.scale.setScalar(1 + (SPARK_LIFE - item.life) * 6);
      if (item.life <= 0) item.mesh.visible = false;
    }
    if (explosionState.life > 0) {
      explosionState.life -= dt;
      const progress = 1 - explosionState.life / 0.6;
      explosion.scale.setScalar(1 + progress * 9);
      explosion.material.opacity = Math.max(0, 0.85 * (1 - progress));
      explosionLight.intensity = Math.max(0, 60 * (1 - progress));
      if (explosionState.life <= 0) {
        explosion.visible = false;
        explosionLight.intensity = 0;
      }
    }
  }

  return { tracer, spark, explode, step };
}
