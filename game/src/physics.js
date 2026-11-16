// Shared box collision: one axis at a time, so a wall never swallows a walker. Both the
// player and the bots move through this, which keeps their collision identical.
import * as THREE from 'three';

const probe = new THREE.Box3();

export function overlapsBox(colliders, x, y, z, height, radius, lift) {
  probe.min.set(x - radius, y + lift, z - radius);
  probe.max.set(x + radius, y + height - lift, z + radius);
  for (let index = 0; index < colliders.length; index += 1) {
    if (probe.intersectsBox(colliders[index])) return colliders[index];
  }
  return null;
}

// Moves position by velocity * dt, resolving x, z, then y in turn. Gravity and jumping are
// the caller's job; this only stops the box at walls and floors. Returns true while the
// feet rest on something.
export function moveBox(colliders, position, velocity, dt, height, radius) {
  const nextX = position.x + velocity.x * dt;
  if (!overlapsBox(colliders, nextX, position.y, position.z, height, radius, 0.04)) {
    position.x = nextX;
  } else {
    velocity.x = 0;
  }
  const nextZ = position.z + velocity.z * dt;
  if (!overlapsBox(colliders, position.x, position.y, nextZ, height, radius, 0.04)) {
    position.z = nextZ;
  } else {
    velocity.z = 0;
  }
  position.y += velocity.y * dt;
  let onGround = false;
  const hit = overlapsBox(colliders, position.x, position.y, position.z, height, radius, 0);
  if (hit && velocity.y <= 0) {
    position.y = hit.max.y;
    velocity.y = 0;
    onGround = true;
  } else if (hit) {
    position.y = hit.min.y - height;
    velocity.y = 0;
  }
  if (position.y < 0) {
    position.y = 0;
    velocity.y = 0;
    onGround = true;
  }
  return onGround;
}
