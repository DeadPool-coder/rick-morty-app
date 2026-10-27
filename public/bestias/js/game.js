'use strict';
// ============================================================
//  Estado y guardado
// ============================================================
const SAVE_KEY = 'pokemon_horizonte_v2';
let G = null, state = 'title', pendingEvos = [], soundOn = true, T = 0;
function newGame(starter) {
  G = {
    team: [makeCreature(starter, 5)], reserve: [],
    inv: Object.fromEntries(Object.keys(ITEMS).map(k => [k, 0])),
    pos: [2, 6], respawn: [16, 6 + 4.5 + 3], collected: {}, day: .1, wins: 0, caught: 0, dex: {}
  };
  Object.assign(G.inv, { pokeball: 8, pocion: 3, baya: 3 });
  G.dex[starter] = 'caught';
}
function saveGame() {
  if (!G || !G.team) return;
  const p = player.surf ? G.lastLand || G.respawn : [player.pos.x, player.pos.z];
  G.pos = p;
  const now = Date.now();
  for (const k in G.collected) if (now - G.collected[k] > ITEM_RESPAWN) delete G.collected[k];
  store.set(SAVE_KEY, G);
}
function loadGame() {
  const s = store.get(SAVE_KEY);
  if (!s || !s.team || !s.team.length) return false;
  for (const c of s.team.concat(s.reserve || [])) { if (!SPECIES[c.sp]) return false; uidSeq = Math.max(uidSeq, c.uid || 0); }
  G = s; G.reserve = G.reserve || []; G.dex = G.dex || {};
  for (const k in ITEMS) if (G.inv[k] == null) G.inv[k] = 0;
  return true;
}
const seen = sp => { if (G && G.dex && !G.dex[sp]) G.dex[sp] = 'seen'; };
const caught = sp => { if (G && G.dex) G.dex[sp] = 'caught'; };

// ============================================================
//  Física (metros, segundos)
// ============================================================
const PHY = { g: 9.81, walk: 3.0, run: 6.6, accel: 16, airAccel: 2.5, jumpV: 3.7, maxSlopeTan: 0.95, wade: 0.9, radius: .3 };
const player = { pos: new V3(2, 0, 6), vel: new V3(), yaw: 0, onGround: true, mesh: buildTrainer(), speed: 0, stamina: 100, tired: false, invuln: 0, surf: null, warnT: 0, pose: null };
scene.add(player.mesh);
player.mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });

const keys = new Set();
let joy = { x: 0, y: 0, id: null }, touchRun = false, wantJump = false;
function inputVec() {
  let ix = 0, iz = 0;
  if (keys.has('w') || keys.has('arrowup')) iz += 1;
  if (keys.has('s') || keys.has('arrowdown')) iz -= 1;
  if (keys.has('a') || keys.has('arrowleft')) ix -= 1;
  if (keys.has('d') || keys.has('arrowright')) ix += 1;
  if (joy.id != null) { ix += joy.x; iz -= joy.y; }
  const L = Math.hypot(ix, iz); if (L > 1) { ix /= L; iz /= L; }
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  return [fx * iz - fz * ix, fz * iz + fx * ix, Math.min(1, L)];
}
function humanStep(x0, z0, x1, z1, onGround) {
  const h1 = groundY(x1, z1);
  if (WATER - h1 > PHY.wade) return 'deep';
  if (!onGround) return 'ok';
  const h0 = groundY(x0, z0), d = Math.hypot(x1 - x0, z1 - z0) || 1e-6;
  if ((h1 - h0) / d > PHY.maxSlopeTan) return 'steep';
  return 'ok';
}
function menuBlocking() { return !$('#menu').hidden || !$('#modal').hidden || !$('#help').hidden; }
function uiBlocking() { return menuBlocking() || evoBusy; }
function updatePlayer(dt) {
  if (player.surf) { updateSurf(dt); return; }
  const [mx, mz, amt] = menuBlocking() ? [0, 0, 0] : inputVec();
  const p = player.pos, depth = WATER - groundY(p.x, p.z);
  const wantRun = (keys.has('shift') || touchRun || (joy.id != null && Math.hypot(joy.x, joy.y) > .96)) && amt > .1;
  const running = wantRun && !player.tired && depth < .4;
  if (running) { player.stamina = Math.max(0, player.stamina - 18 * dt); if (player.stamina <= 0) player.tired = true; }
  else { player.stamina = Math.min(100, player.stamina + 12 * dt); if (player.tired && player.stamina > 35) player.tired = false; }
  let maxSp = (running ? PHY.run : PHY.walk) * amt;
  if (depth > .1) maxSp *= lerp(1, .4, clamp(depth / PHY.wade, 0, 1));
  const acc = player.onGround ? PHY.accel : PHY.airAccel;
  const tx = mx * maxSp, tz = mz * maxSp, dx = tx - player.vel.x, dz = tz - player.vel.z, dl = Math.hypot(dx, dz), st = acc * dt;
  if (dl <= st) { player.vel.x = tx; player.vel.z = tz; } else { player.vel.x += dx / dl * st; player.vel.z += dz / dl * st; }
  // pendientes demasiado empinadas: se resbala
  const [gx, gz] = groundGrad(p.x, p.z), slope = Math.hypot(gx, gz);
  if (player.onGround && slope > 1.2) { player.vel.x -= gx / slope * 6 * dt; player.vel.z -= gz / slope * 6 * dt; }
  let nx = p.x + player.vel.x * dt, nz = p.z + player.vel.z * dt;
  let r = humanStep(p.x, p.z, nx, nz, player.onGround);
  if (r !== 'ok') {
    const rx = humanStep(p.x, p.z, nx, p.z, player.onGround), rz = humanStep(p.x, p.z, p.x, nz, player.onGround);
    if (rx === 'ok') { nz = p.z; player.vel.z = 0; } else if (rz === 'ok') { nx = p.x; player.vel.x = 0; }
    else { nx = p.x; nz = p.z; player.vel.x = player.vel.z = 0; }
    if (r === 'deep' && T - player.warnT > 5) { player.warnT = T; warnDeep(); }
  }
  p.x = nx; p.z = nz;
  resolveCollisions(p, PHY.radius);
  const g = groundY(p.x, p.z);
  if (wantJump && player.onGround && !menuBlocking() && WATER - g < .5) { player.vel.y = PHY.jumpV; player.onGround = false; sfx('jump'); }
  wantJump = false;
  if (player.onGround) { if (p.y - g < .5 && player.vel.y <= 0) p.y = g; else player.onGround = false; }
  if (!player.onGround) {
    player.vel.y -= PHY.g * dt; p.y += player.vel.y * dt;
    if (p.y <= g) { if (player.vel.y < -5) burst(p.clone(), '#bfae8a', 14, 1.5, .5, { add: false, g: 2, size: .15 }); p.y = g; player.vel.y = 0; player.onGround = true; }
  }
  player.speed = Math.hypot(player.vel.x, player.vel.z);
  if (player.speed > .3) player.yaw = angLerp(player.yaw, Math.atan2(player.vel.x, player.vel.z), dt * 10);
  if (depth > .15 && player.speed > .5 && Math.random() < dt * 8) burst(new V3(p.x, WATER + .05, p.z), '#e6f6ff', 6, 1.4, .5, { add: false, g: 6, size: .12 });
  if (depth < 0) G.lastLand = [p.x, p.z];
  player.invuln = Math.max(0, player.invuln - dt);
}
function warnDeep() {
  const sf = surfer();
  toast(sf ? `El agua es demasiado profunda para caminar. Pulsa R para surfear con ${nameOf(sf)}.` : 'El agua es demasiado profunda. Necesitas un Pokémon de agua grande que te lleve (Blastoise, Lapras o Gyarados).', 3800);
}
function angLerp(a, b, t) { let d = ((b - a + PI) % (PI * 2)) - PI; if (d < -PI) d += PI * 2; return a + d * clamp(t, 0, 1); }

// ============================================================
//  Surf: montar un Pokémon de agua
// ============================================================
const surfer = () => G.team.find(c => c.hp > 0 && SPECIES[c.sp].surf);
const surfDepth = sp => sp === 'gyarados' ? 1.6 : sp === 'lapras' ? 1.1 : .8;
function findWaterSpot() {
  const sf = surfer(); if (!sf) return null;
  const need = surfDepth(sf.sp);
  for (const a of [0, .4, -.4, .8, -.8]) for (let d = 1.5; d <= 6; d += .5) {
    const x = player.pos.x + Math.sin(player.yaw + a) * d, z = player.pos.z + Math.cos(player.yaw + a) * d;
    if (WATER - groundY(x, z) >= need) return new V3(x, 0, z);
  }
  return null;
}
function findLandSpot() {
  const s = player.surf; if (!s) return null;
  for (const a of [0, .5, -.5, 1, -1, 1.6, -1.6]) for (let d = 1.2; d <= 6; d += .4) {
    const x = s.pos.x + Math.sin(s.heading + a) * (d + s.R), z = s.pos.z + Math.cos(s.heading + a) * (d + s.R), h = groundY(x, z);
    if (h > .05) { const [gx, gz] = groundGrad(x, z); if (Math.hypot(gx, gz) < .8) return new V3(x, h, z); }
  }
  return null;
}
async function startSurf() {
  const spot = findWaterSpot(), sf = surfer();
  if (!spot || !sf || state !== 'explore') return;
  state = 'cutscene'; camFollow = true;
  hideCompanion();
  const m = buildPokemon(sf.sp); scene.add(m);
  spot.y = waterY(spot.x, spot.z);
  m.position.copy(spot); m.rotation.y = player.yaw;
  await releaseAnim(m, spot, player.pos.clone().add(new V3(0, 1.3, 0)));
  cry(sf.sp);
  const seat = m.userData.body.localToWorld(m.userData.seat.clone());
  const from = player.pos.clone();
  player.pose = 'sit';
  await tween(650, k => { player.pos.lerpVectors(from, seat, k); player.pos.y += Math.sin(k * PI) * 1.2; });
  player.surf = { c: sf, mesh: m, pos: spot.clone(), heading: player.yaw, speed: 0, R: m.userData.R, vy: 0 };
  state = 'explore'; camFollow = false; toast(`¡Surfeas sobre ${nameOf(sf)}!`);
}
async function endSurf(spot) {
  const s = player.surf; if (!s) return;
  spot = spot || findLandSpot(); if (!spot) { toast('Acércate más a la orilla para bajar.'); return; }
  state = 'cutscene'; camFollow = true;
  const from = player.pos.clone();
  player.pose = null;
  await tween(600, k => { player.pos.lerpVectors(from, spot, k); player.pos.y += Math.sin(k * PI) * 1.0; });
  player.pos.copy(spot); player.vel.set(0, 0, 0); player.onGround = true; player.yaw = s.heading;
  await returnAnim(s.mesh, player.pos.clone().add(new V3(0, 1.3, 0)));
  scene.remove(s.mesh); disposeModel(s.mesh);
  player.surf = null; state = 'explore'; camFollow = false;
  showCompanion();
  if (pendingEvos.length) setTimeout(processEvos, 600);
}
function updateSurf(dt) {
  const s = player.surf, sp = SPECIES[s.c.sp].surf.speed, need = surfDepth(s.c.sp) * .85;
  const [mx, mz, amt] = menuBlocking() ? [0, 0, 0] : inputVec();
  const boost = (keys.has('shift') || touchRun) ? 1.3 : 1;
  if (amt > .05) {
    const want = Math.atan2(mx, mz), diff = Math.abs(((want - s.heading + PI * 3) % (PI * 2)) - PI);
    s.heading = angLerp(s.heading, want, dt * (1.0 + .8 * (1 - s.speed / (sp * 1.3))));
    s.speed += (amt * sp * boost * (diff > 2 ? .2 : 1) - s.speed) * clamp(dt * .9, 0, 1);
  } else s.speed *= Math.pow(.55, dt);
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
  const nx = s.pos.x + fx * s.speed * dt, nz = s.pos.z + fz * s.speed * dt;
  const px = nx + fx * s.R * .9, pz = nz + fz * s.R * .9;
  if (WATER - groundY(px, pz) >= need && WATER - groundY(nx, nz) >= need) { s.pos.x = nx; s.pos.z = nz; }
  else { s.speed *= -.25; if (T - player.warnT > 3) { player.warnT = T; toast('Aquí el agua es poco profunda. Pulsa R para bajar a tierra.'); } }
  const wy = waterY(s.pos.x, s.pos.z);
  s.pos.y = lerp(s.pos.y || wy, wy, clamp(dt * 6, 0, 1));
  const e = Math.max(1, s.R), pitch = Math.atan2(waterY(s.pos.x + fx * e, s.pos.z + fz * e) - waterY(s.pos.x - fx * e, s.pos.z - fz * e), 2 * e);
  const roll = Math.atan2(waterY(s.pos.x + fz * e, s.pos.z - fx * e) - waterY(s.pos.x - fz * e, s.pos.z + fx * e), 2 * e);
  s.mesh.position.copy(s.pos); s.mesh.rotation.set(-pitch, s.heading, roll, 'YXZ');
  animatePoke(s.mesh, T, clamp(s.speed / sp, 0, 1), false);
  s.mesh.updateMatrixWorld(true);
  const seat = s.mesh.userData.body.localToWorld(s.mesh.userData.seat.clone());
  player.pos.copy(seat); player.yaw = s.heading; player.vel.set(0, 0, 0); player.speed = 0;
  if (s.speed > 1.2 && Math.random() < dt * 14) burst(new V3(s.pos.x - fx * s.R, wy + .05, s.pos.z - fz * s.R), '#f2fbff', 8, 1.6, .7, { add: false, g: 5, size: .2 });
  player.invuln = Math.max(0, player.invuln - dt);
}

// ============================================================
//  Compañero que te sigue
// ============================================================
const companion = { c: null, mesh: null, pos: new V3(), yaw: 0, moveAmt: 0, sp: null, hidden: false };
function leader() { return G.team.find(c => c.hp > 0) || G.team[0]; }
function canStand(sp, x, z) {
  const d = WATER - groundY(x, z), m = SPECIES[sp].mode, H = SPECIES[sp].H;
  if (m === 'walk') return d < Math.max(.25, H * .4);
  if (m === 'swim') return d > (sp === 'magikarp' ? .6 : 1.4);
  return true;
}
function entityY(ud, x, z, alt) {
  const g = groundY(x, z), d = WATER - g, sp = ud.sp, m = ud.mode;
  if (m === 'levitate') return Math.max(g, d > 0 ? waterY(x, z) : g) + (SPECIES[sp].hover || .5);
  if (m === 'fly') return Math.max(g, d > 0 ? waterY(x, z) : g) + (alt || 0);
  if (m === 'swim') return waterY(x, z) + (ud.anchor === 'center' ? ud.top * .3 - .05 : 0);
  if (m === 'amphi' && d > ud.H * .5) return waterY(x, z) - ud.H * .35;
  return g;
}
function setCompanion(c, at) {
  if (!c) return;
  if (companion.mesh && companion.c === c && companion.sp === c.sp) return;
  const old = companion.mesh ? companion.pos.clone() : (at || player.pos.clone().add(new V3(1.2, 0, -1.2)));
  if (companion.mesh) { scene.remove(companion.mesh); disposeModel(companion.mesh); }
  companion.c = c; companion.sp = c.sp; companion.mesh = buildPokemon(c.sp); companion.pos.copy(old);
  companion.mesh.position.copy(old); companion.mesh.visible = !companion.hidden; scene.add(companion.mesh);
}
function hideCompanion() { if (!companion.mesh || companion.hidden) return; companion.hidden = true; const m = companion.mesh; returnAnim(m, player.pos.clone().add(new V3(0, 1.3, 0))).then(() => { if (companion.hidden && companion.mesh === m) m.visible = false; }); }
function showCompanion() {
  const c = leader(); if (!c || c.hp <= 0) return;
  companion.hidden = false; setCompanion(c);
  const a = player.yaw + PI * .75, spot = player.pos.clone().add(new V3(Math.sin(a) * 1.5, 0, Math.cos(a) * 1.5));
  if (!canStand(c.sp, spot.x, spot.z)) spot.copy(player.pos);
  companion.pos.copy(spot); companion.pos.y = entityY(companion.mesh.userData, spot.x, spot.z, 0);
  companion.mesh.position.copy(companion.pos); companion.mesh.visible = true;
  releaseAnim(companion.mesh, companion.pos.clone(), player.pos.clone().add(new V3(0, 1.3, 0)));
}
function updateCompanion(dt) {
  if (!companion.mesh) return;
  if (state === 'battle' || state === 'cutscene') { if (!companion.busy) animatePoke(companion.mesh, T, 0, false); return; }
  if (companion.hidden || player.surf) return;
  const c = companion.c, u = companion.mesh.userData;
  if (c.hp <= 0) { companion.mesh.visible = false; return; }
  const a = player.yaw + PI + .6, dist = 1.2 + u.R;
  const tx = player.pos.x + Math.sin(a) * dist, tz = player.pos.z + Math.cos(a) * dist;
  const dx = tx - companion.pos.x, dz = tz - companion.pos.z, d = Math.hypot(dx, dz);
  let mv = 0;
  if (d > 30) { if (canStand(c.sp, tx, tz)) companion.pos.set(tx, 0, tz); }
  else if (d > .3) {
    const spd = clamp(d * 2.2, 0, 7.5), nx = companion.pos.x + dx / d * spd * dt, nz = companion.pos.z + dz / d * spd * dt;
    if (canStand(c.sp, nx, nz)) { companion.pos.x = nx; companion.pos.z = nz; mv = clamp(spd / 4, 0, 1); }
    companion.yaw = angLerp(companion.yaw, Math.atan2(dx, dz), dt * 8);
  } else companion.yaw = angLerp(companion.yaw, player.yaw, dt * 3);
  resolveCollisions(companion.pos, Math.min(.6, u.R));
  companion.moveAmt = lerp(companion.moveAmt, mv, .15);
  const ty = entityY(u, companion.pos.x, companion.pos.z, mv > .2 ? 1.2 : 0);
  companion.pos.y = lerp(companion.pos.y, ty, clamp(dt * 10, 0, 1));
  companion.mesh.position.copy(companion.pos); companion.mesh.rotation.y = companion.yaw; companion.mesh.visible = true;
  animatePoke(companion.mesh, T, companion.moveAmt, u.mode === 'fly' && companion.pos.y - groundY(companion.pos.x, companion.pos.z) > .3);
}

// ============================================================
//  Pokémon salvajes
// ============================================================
const wilds = [];
const SPAWN = {
  pradera: [['rattata', 4], ['pidgey', 4], ['pikachu', 1.2], ['eevee', .6], ['bulbasaur', .6]],
  bosque: [['pidgey', 2], ['rattata', 2], ['bulbasaur', 1.5], ['pikachu', 2], ['eevee', .6]],
  desierto: [['sandshrew', 4], ['vulpix', 2], ['geodude', 2], ['charmander', 1]],
  playa: [['squirtle', 3], ['pidgey', 1.5], ['sandshrew', 1], ['rattata', 1]],
  montana: [['geodude', 4], ['charmander', 1.5], ['pidgey', 1], ['vulpix', 1]],
  tundra: [['swinub', 4], ['vulpix', .5], ['eevee', 1], ['pidgey', .8]],
  nieve: [['swinub', 3], ['geodude', 2]],
  mar: [['magikarp', 6], ['squirtle', 1.2], ['lapras', .45]]
};
function wildLevelAt(x, z) { return clamp(Math.round(2 + Math.hypot(x, z) / 45 + rand(-1, 2)), 2, 80); }
function spawnWild(x, z, spForce, lvlForce) {
  const h = groundY(x, z), water = WATER - h > .7;
  let sp = spForce;
  if (!sp) {
    const tbl = (water ? SPAWN.mar : SPAWN[biomeAt(x, z, h)] || SPAWN.pradera).slice();
    if (!water && isNight()) tbl.push(['gastly', 2.5]);
    sp = weighted(tbl);
    if (sp === 'lapras' && Math.hypot(x, z) < 110) sp = 'magikarp';
  }
  let lvl = lvlForce || wildLevelAt(x, z);
  if (sp === 'lapras') lvl = Math.max(lvl, 15);
  for (let e = levelEvo({ sp, lvl }); e && lvl >= e.lvl + randi(0, 4); e = levelEvo({ sp, lvl })) sp = e.to;
  if (lvl >= 30 && Math.random() < .25) { const st = (SPECIES[sp].evo || []).filter(e => e.item); if (st.length) sp = pick(st).to; }
  if (!canStand(sp, x, z)) return null;
  const c = makeCreature(sp, lvl), mesh = buildPokemon(sp);
  const w = { c, mesh, pos: new V3(x, 0, z), home: new V3(x, 0, z), target: new V3(x, 0, z), yaw: rand(0, 6.28), timer: rand(1, 4), mode: 'idle', aggro: Math.random() < .3, cool: 0, moveAmt: 0, t0: rand(0, 10), alt: 0, vy: 0, jump: 0 };
  w.pos.y = entityY(mesh.userData, x, z, 0);
  mesh.position.copy(w.pos); scene.add(mesh);
  w.tag = makeTag(w); scene.add(w.tag);
  wilds.push(w); return w;
}
function removeWild(w) {
  const i = wilds.indexOf(w); if (i >= 0) wilds.splice(i, 1);
  scene.remove(w.mesh); scene.remove(w.tag); disposeModel(w.mesh); w.tag.material.map.dispose(); w.tag.material.dispose();
}
function makeTag(w) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true, toneMapped: false }));
  sp.scale.set(1.6, .4, 1); sp.userData = { cv, tex }; drawTag(sp, w); return sp;
}
function drawTag(sp, w) {
  const { cv, tex } = sp.userData, x = cv.getContext('2d'), my = G && G.team ? leader().lvl : 5, d = w.c.lvl - my;
  x.clearRect(0, 0, 256, 64);
  x.fillStyle = 'rgba(10,14,26,.72)'; x.beginPath(); if (x.roundRect) x.roundRect(8, 8, 240, 48, 24); else x.rect(8, 8, 240, 48); x.fill();
  typesOf(w.c).forEach((t, i) => { x.fillStyle = TYPES[t].c; x.beginPath(); x.arc(30 + i * 14, 32, 8, 0, 7); x.fill(); });
  x.font = '800 24px Nunito, system-ui, sans-serif'; x.textBaseline = 'middle';
  x.fillStyle = '#f4f1e6'; x.fillText(nameOf(w.c), 26 + typesOf(w.c).length * 14 + 6, 33);
  x.fillStyle = d >= 5 ? '#ff7b7b' : d >= 2 ? '#ffd166' : '#9be89b';
  x.textAlign = 'right'; x.fillText('Nv.' + w.c.lvl, 236, 33); x.textAlign = 'left';
  tex.needsUpdate = true;
}
let spawnTimer = 0;
function updateWilds(dt) {
  spawnTimer -= dt;
  const focus = player.pos;
  if (state === 'explore' && spawnTimer <= 0) {
    spawnTimer = .5;
    if (wilds.length < (isTouch ? 16 : 24)) {
      const a = rand(0, 6.28), d = rand(30, 85), x = focus.x + Math.cos(a) * d, z = focus.z + Math.sin(a) * d;
      if (!centers.some(s => Math.hypot(s.x - x, s.z - z) < 18)) spawnWild(x, z);
    }
    for (const w of wilds.slice()) if (w.pos.distanceTo(focus) > 130 && (!battle || battle.w !== w)) removeWild(w);
  }
  for (const w of wilds) {
    const u = w.mesh.userData;
    if (battle && battle.w === w) { if (!w.busy) animatePoke(w.mesh, T + w.t0, 0, u.mode === 'fly' && w.alt > .3); continue; }
    let move = 0;
    if (state === 'explore') {
      w.cool = Math.max(0, w.cool - dt);
      const d = Math.hypot(focus.x - w.pos.x, focus.z - w.pos.z);
      const sameMedium = player.surf ? canWater(w.c.sp) : canLand(w.c.sp) && canStand(w.c.sp, focus.x, focus.z);
      let tx = null, tz = null, spd = clamp(.6 + u.H * .9, .8, 3) * (u.mode === 'fly' ? 1.8 : 1);
      if (w.aggro && d < 14 && w.cool <= 0 && player.invuln <= 0 && sameMedium) { tx = focus.x; tz = focus.z; spd *= 2.2; w.mode = 'chase'; }
      else {
        if (w.mode === 'chase') { w.mode = 'idle'; w.timer = 2; }
        w.timer -= dt;
        if (w.timer <= 0) {
          if (w.mode === 'idle') { w.mode = 'walk'; const a = rand(0, 6.28), r = rand(3, 14); w.target.set(w.home.x + Math.cos(a) * r, 0, w.home.z + Math.sin(a) * r); w.timer = rand(4, 9); }
          else { w.mode = 'idle'; w.timer = rand(2, 5); }
        }
        if (w.mode === 'walk') { tx = w.target.x; tz = w.target.z; }
      }
      if (tx != null) {
        const dx = tx - w.pos.x, dz = tz - w.pos.z, L = Math.hypot(dx, dz);
        if (L > .5) {
          const nx = w.pos.x + dx / L * spd * dt, nz = w.pos.z + dz / L * spd * dt;
          if (canStand(w.c.sp, nx, nz)) { w.pos.x = nx; w.pos.z = nz; move = clamp(spd / 2.5, .4, 1); w.yaw = angLerp(w.yaw, Math.atan2(dx, dz), dt * 6); }
          else { w.mode = 'idle'; w.timer = rand(1, 3); }
        } else if (w.mode === 'walk') { w.mode = 'idle'; w.timer = rand(1, 3); }
      }
      if (u.mode !== 'fly' && u.mode !== 'swim') resolveCollisions(w.pos, Math.min(.8, u.R * .8));
      if (d < 1.0 + u.R && player.invuln <= 0 && w.cool <= 0 && !uiBlocking() && sameMedium) startBattle(w);
    }
    // vuelo, saltos de Magikarp y altura
    if (u.mode === 'fly') {
      const overWater = WATER - groundY(w.pos.x, w.pos.z) > 0;
      const want = move > 0 || overWater ? 2.5 + Math.sin(T * .5 + w.t0) * 1.2 : 0;
      w.alt += clamp(want - w.alt, -1.8 * dt, 2.2 * dt);
    }
    let y = entityY(u, w.pos.x, w.pos.z, w.alt);
    if (w.c.sp === 'magikarp' && state === 'explore') {
      if (!w.jump && Math.random() < dt * .12) { w.jump = 1; w.vy = rand(3, 4.5); }
      if (w.jump) { w.jumpY = (w.jumpY || 0) + w.vy * dt; w.vy -= PHY.g * dt; if (w.jumpY <= 0) { w.jump = 0; w.jumpY = 0; burst(new V3(w.pos.x, WATER + .05, w.pos.z), '#f0fbff', 22, 2.4, .7, { add: false, g: 7, size: .14 }); } y += w.jumpY || 0; w.mesh.rotation.z = w.jump ? Math.sin(T * 12) * .5 : 0; }
    }
    w.moveAmt = lerp(w.moveAmt, move, .12);
    w.pos.y = y;
    w.mesh.position.copy(w.pos); w.mesh.rotation.y = w.yaw;
    w.tag.position.set(w.pos.x, w.pos.y + u.top + .35, w.pos.z);
    w.tag.visible = state === 'explore' && w.pos.distanceTo(focus) < 40;
    animatePoke(w.mesh, T + w.t0, w.moveAmt, u.mode === 'fly' && w.alt > .3);
  }
}

// ============================================================
//  Cámara en tercera persona con colisión con el terreno
// ============================================================
const cam = { yaw: PI, pitch: .32, dist: 5.5, pos: new V3(), look: new V3(), dragging: null };
const camTarget = { pos: new V3(), look: new V3() };
let camFollow = false;
function updateCamera(dt) {
  let wantPos, wantLook;
  if (state === 'explore' || camFollow) {
    const ride = player.surf, d = ride ? cam.dist + ride.R * 2.2 : cam.dist;
    wantLook = player.pos.clone().add(new V3(0, ride ? 1.0 : 1.45, 0));
    const dir = new V3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
    let dd = d;
    for (let i = 1; i <= 10; i++) {
      const p = wantLook.clone().addScaledVector(dir, d * i / 10);
      if (p.y < groundY(p.x, p.z) + .35) { dd = d * (i - 1) / 10; break; }
    }
    wantPos = wantLook.clone().addScaledVector(dir, Math.max(1.2, dd));
    const gy = groundY(wantPos.x, wantPos.z); if (wantPos.y < gy + .35) wantPos.y = gy + .35;
    if (wantPos.y < WATER + .25 && WATER - gy > 0) wantPos.y = WATER + .25;
  } else { wantPos = camTarget.pos; wantLook = camTarget.look; }
  const k = 1 - Math.pow(state === 'explore' || camFollow ? .00004 : .02, dt);
  cam.pos.lerp(wantPos, k); cam.look.lerp(wantLook, k);
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  sky.position.copy(camera.position);
}

// ============================================================
//  Día y noche
// ============================================================
const DAY_LEN = 600;
const SKY = {
  day: { top: new THREE.Color('#3b86d9'), hor: new THREE.Color('#c4e4fb') },
  set: { top: new THREE.Color('#41558f'), hor: new THREE.Color('#ffae78') },
  night: { top: new THREE.Color('#040917'), hor: new THREE.Color('#15203a') }
};
function isNight() { return G && Math.sin(G.day * PI * 2) < -.06; }
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function updateDay(dt) {
  if (!G) G = { day: .1 };
  if (state !== 'title') G.day = (G.day + dt / DAY_LEN) % 1;
  const a = G.day * PI * 2, sh = Math.sin(a);
  const dayK = smooth(-.1, .35, sh), setK = 1 - Math.abs(clamp(sh, -.3, .5) - .05) / .45;
  _c1.copy(SKY.night.top).lerp(SKY.day.top, dayK); _c2.copy(SKY.night.hor).lerp(SKY.day.hor, dayK);
  const sk = clamp(setK, 0, 1) * .75; _c1.lerp(SKY.set.top, sk * .5); _c2.lerp(SKY.set.hor, sk);
  skyU.uTop.value.copy(_c1); skyU.uHor.value.copy(_c2); skyU.uGround.value.copy(_c2).multiplyScalar(.7);
  const sd = new V3(Math.cos(a) * .8, sh, .45).normalize(); skyU.uSun.value.copy(sd);
  skyU.uNight.value = 1 - smooth(-.25, .05, sh); skyU.uTime.value = T;
  scene.fog.color.copy(_c2);
  const night = skyU.uNight.value;
  sun.intensity = lerp(.32, 2.5, dayK);
  sun.color.set(dayK > .7 ? '#fff1dc' : dayK > .15 ? '#ffb27a' : '#9fb4ff');
  hemi.intensity = lerp(.22, .8, dayK); hemi.color.copy(_c2).lerp(new THREE.Color('#ffffff'), .4);
  const ldir = sh > -.05 ? sd.clone() : sd.clone().negate().setY(Math.abs(sd.y) + .3).normalize();
  const c = battle ? battle.mid : player.pos;
  sun.position.copy(c).addScaledVector(ldir, 120); sun.target.position.copy(c);
  waterU.uSky.value.copy(_c2); waterU.uSunDir.value.copy(ldir); waterU.uSunCol.value.copy(sun.color).multiplyScalar(dayK > .1 ? 1 : .35);
  waterU.uDeep.value.set(night > .5 ? '#06243d' : '#0d4f7a'); waterU.uShallow.value.set(night > .5 ? '#1c5a6a' : '#3fb7c9');
  waterU.uTime.value = T; grassU.uTime.value = T;
  for (const cl of clouds) cl.material.opacity = lerp(.25, .9, dayK);
  for (const ce of centers) for (const l of ce.mesh.userData.lamps) l.emissiveIntensity = night > .4 ? 3 : .2;
  const hh = Math.floor(((G.day * 24) + 6) % 24), mm = Math.floor((((G.day * 24) + 6) % 1) * 60);
  $('#clock').textContent = (isNight() ? 'Noche' : 'Día') + ' · ' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

// ============================================================
//  Animaciones, partículas y efectos
// ============================================================
const tweens = [];
function tween(dur, fn) { return new Promise(res => tweens.push({ t0: performance.now(), dur, fn, res })); }
function updateTweens() {
  const now = performance.now();
  for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i], k = clamp((now - tw.t0) / tw.dur, 0, 1); tw.fn(k); if (k >= 1) { tweens.splice(i, 1); tw.res(); } }
}
const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const softTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
const bursts = [];
function burst(pos, color, n, speed, life, o) {
  o = o || {};
  const g = new THREE.BufferGeometry(), arr = new Float32Array(n * 3), vel = [];
  for (let i = 0; i < n; i++) {
    arr.set([pos.x + rand(-1, 1) * (o.spread || 0), pos.y, pos.z + rand(-1, 1) * (o.spread || 0)], i * 3);
    const v = new V3(rand(-1, 1), rand(-.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(.4, 1) * speed);
    if (o.dir) v.addScaledVector(o.dir, speed * .8); vel.push(v);
  }
  g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size: o.size || .25, map: softTex, transparent: true, depthWrite: false, blending: o.add === false ? THREE.NormalBlending : THREE.AdditiveBlending, toneMapped: false }));
  scene.add(p); bursts.push({ p, vel, life: life || .8, t: 0, g: o.g != null ? o.g : 3 });
}
function updateBursts(dt) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.t += dt; const a = b.p.geometry.attributes.position;
    for (let j = 0; j < b.vel.length; j++) { b.vel[j].y -= b.g * dt; a.array[j * 3] += b.vel[j].x * dt; a.array[j * 3 + 1] += b.vel[j].y * dt; a.array[j * 3 + 2] += b.vel[j].z * dt; }
    a.needsUpdate = true; b.p.material.opacity = 1 - b.t / b.life;
    if (b.t >= b.life) { scene.remove(b.p); b.p.geometry.dispose(); b.p.material.dispose(); bursts.splice(i, 1); }
  }
}
function screenPos(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; }
function floatText(world, text, color) {
  const s = screenPos(world), d = document.createElement('div');
  d.className = 'dmg'; d.textContent = text; d.style.color = color || '#fff'; d.style.left = s.x + 'px'; d.style.top = s.y + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1000);
}
function toast(msg, ms) {
  const d = document.createElement('div'); d.className = 'toast panel'; d.textContent = msg; $('#toasts').appendChild(d);
  setTimeout(() => { d.style.transition = 'opacity .3s'; d.style.opacity = 0; setTimeout(() => d.remove(), 300); }, ms || 2600);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}
function flashScreen(color, ms) { const f = $('#fade'); f.style.background = color || '#fff'; f.style.opacity = .9; setTimeout(() => f.style.opacity = 0, ms || 120); }
// lanzar una Poké Ball con trayectoria parabólica real
async function throwBall(kind, from, to, dur) {
  const b = ballMesh(kind); scene.add(b);
  const t = (dur || 650) / 1000, g = new V3(0, -PHY.g, 0);
  const v0 = to.clone().sub(from).sub(g.clone().multiplyScalar(.5 * t * t)).divideScalar(t);
  await tween(dur || 650, k => { const tt = k * t; b.position.copy(from).addScaledVector(v0, tt).addScaledVector(g, .5 * tt * tt); b.rotation.x = -k * 14; });
  return b;
}
async function releaseAnim(mesh, at, from) {
  const s = mesh.scale.x; mesh.visible = false;
  const b = await throwBall('pokeball', from, at.clone().add(new V3(0, .5, 0)), 450);
  scene.remove(b); flashScreen('#ffffff', 60);
  burst(at.clone().add(new V3(0, .5, 0)), '#ffffff', 40, 3, .5);
  mesh.visible = true; mesh.scale.setScalar(.001);
  await tween(300, k => mesh.scale.setScalar(s * ease(k)));
  mesh.scale.setScalar(s);
}
async function returnAnim(mesh, to) {
  const s = mesh.scale.x, from = mesh.position.clone().add(new V3(0, mesh.userData.top * .5 || .5, 0));
  const beam = new THREE.Mesh(UG.cyl, addMat('#ff3030', .8)); scene.add(beam);
  const place = () => { const mid = from.clone().add(to).multiplyScalar(.5), L = from.distanceTo(to); beam.position.copy(mid); beam.scale.set(.04, L, .04); beam.quaternion.setFromUnitVectors(new V3(0, 1, 0), to.clone().sub(from).normalize()); };
  place(); setEmissive(mesh, '#ff2020', 1.2);
  await tween(380, k => mesh.scale.setScalar(s * (1 - k)));
  scene.remove(beam); beam.material.dispose(); mesh.visible = false; mesh.scale.setScalar(s); setEmissive(mesh, '#000', 0);
}

// sonido sintetizado y gritos de Pokémon
let actx = null;
function initAudio() { if (actx) return; try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
function tone(f, d, type, vol, when, slide, vib) {
  if (!actx || !soundOn) return;
  try {
    const t = actx.currentTime + (when || 0), o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    if (vib) { const l = actx.createOscillator(), lg = actx.createGain(); l.frequency.value = vib; lg.gain.value = f * .06; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + d + .05); }
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(vol || .08, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + .05);
  } catch (e) { }
}
function cry(sp) {
  const h = ihash(SPECIES[sp].dex, 7, 3), base = 900 / Math.sqrt(SPECIES[sp].H + .3) * (.7 + h * .6);
  tone(base, .22, h > .5 ? 'sawtooth' : 'square', .035, 0, base * (.6 + h * .5), 18 + h * 20);
  tone(base * 1.25, .3, 'triangle', .04, .16, base * .7, 12);
}
function sfx(k) {
  if (k === 'pick') { tone(880, .1, 'triangle', .06); tone(1320, .16, 'triangle', .06, .08); }
  else if (k === 'hit') tone(200, .18, 'square', .05, 0, 60);
  else if (k === 'super') { tone(320, .25, 'sawtooth', .06, 0, 60); tone(160, .25, 'square', .04, .03, 50); }
  else if (k === 'weak') tone(260, .15, 'triangle', .04, 0, 150);
  else if (k === 'lvl') [523, 659, 784, 1046].forEach((f, i) => tone(f, .16, 'triangle', .07, i * .09));
  else if (k === 'heal') [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone(f, .22, 'sine', .06, i * .14));
  else if (k === 'battle') [392, 392, 523, 466, 392, 587].forEach((f, i) => tone(f, .12, 'square', .04, i * .1));
  else if (k === 'catch') [523, 659, 784, 1046].forEach((f, i) => tone(f, .2, 'triangle', .07, i * .12));
  else if (k === 'shake') tone(160, .08, 'square', .04);
  else if (k === 'jump') tone(300, .12, 'sine', .04, 0, 480);
  else if (k === 'evo') { for (let i = 0; i < 14; i++) tone(300 + i * 55, .12, 'triangle', .04, i * .2); }
  else if (k === 'faint') tone(420, .6, 'sawtooth', .04, 0, 70);
  else if (k === 'click') tone(700, .05, 'sine', .03);
  else if (k === 'thunder') tone(90, .5, 'sawtooth', .07, 0, 40);
}

// ============================================================
//  Interacción en el mundo
// ============================================================
function nearestWild(r) {
  let best = null, bd = r;
  for (const w of wilds) { const d = w.pos.distanceTo(player.pos); if (d < bd && (player.surf ? canWater(w.c.sp) : true)) { bd = d; best = w; } }
  return best;
}
function nearestCenter(r) { let best = null, bd = r; for (const s of centers) { const d = s.door.distanceTo(player.pos); if (d < bd) { bd = d; best = s; } } return best; }
function nearestItem(r) { let best = null, bd = r; for (const it of worldItems) { const d = Math.hypot(it.x - player.pos.x, it.z - player.pos.z); if (d < bd) { bd = d; best = it; } } return best; }
function interact() {
  if (state !== 'explore') return;
  if (player.surf) { const w = nearestWild(10); if (w) startBattle(w); return; }
  const s = nearestCenter(3.5);
  if (s) {
    G.team.forEach(healFull); G.respawn = [s.door.x, s.door.z + 1];
    sfx('heal'); burst(s.door.clone().add(new V3(0, 1.5, 0)), '#ffb3c8', 60, 3, 1.4);
    toast('Tus Pokémon se han recuperado por completo. ¡Esperamos volver a verte!'); refreshHUD(); saveGame(); return;
  }
  const it = nearestItem(1.8); if (it) { pickItem(it); return; }
  const w = nearestWild(9); if (w) startBattle(w);
}
function ride() {
  if (state !== 'explore' || menuBlocking()) return;
  if (player.surf) endSurf(); else if (findWaterSpot()) startSurf();
  else if (WATER - groundY(player.pos.x + Math.sin(player.yaw) * 2, player.pos.z + Math.cos(player.yaw) * 2) > .5) warnDeep();
  else toast('Mira hacia el agua profunda para surfear.');
}
function pickItem(it) {
  G.inv[it.type] = (G.inv[it.type] || 0) + 1; G.collected[it.id] = Date.now();
  if (it.spark && it.spark.parent) it.spark.parent.remove(it.spark);
  it.mesh.parent.remove(it.mesh); const i = worldItems.indexOf(it); if (i >= 0) worldItems.splice(i, 1);
  for (const ch of chunks.values()) { const j = ch.items.indexOf(it); if (j >= 0) ch.items.splice(j, 1); }
  sfx('pick'); burst(new V3(it.x, it.y + .2, it.z), '#fff6c0', 18, 1.5, .5);
  toast('Has encontrado: ' + ITEMS[it.type].n); refreshQuick();
}
const sparkles = [];
function updateItems(dt) {
  for (const it of worldItems) {
    if (!it.spark) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: '#fff7c8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); s.scale.setScalar(.35); s.position.set(it.x, it.y + .25, it.z); it.mesh.parent.add(s); it.spark = s; }
    const tw = Math.max(0, Math.sin(T * 3 + it.ph * 5)); it.spark.material.opacity = tw * tw; it.spark.scale.setScalar(.15 + tw * .35);
    if (state === 'explore' && !player.surf && Math.hypot(it.x - player.pos.x, it.z - player.pos.z) < .9 && Math.abs(player.pos.y - it.y) < 1.5) { pickItem(it); break; }
  }
}
function updatePrompt() {
  const el = $('#prompt');
  if (state !== 'explore' || menuBlocking()) { el.hidden = true; return; }
  let html = '';
  if (player.surf) {
    const w = nearestWild(10), land = findLandSpot();
    if (w) html = `<kbd>E</kbd>Desafiar a ${nameOf(w.c)} Nv.${w.c.lvl}`;
    else if (land) html = `<kbd>R</kbd>Bajar a tierra`;
  } else {
    const s = nearestCenter(3.5), it = s ? null : nearestItem(1.8), w = s || it ? null : nearestWild(9);
    if (s) html = `<kbd>E</kbd>Curar a tus Pokémon`;
    else if (it) html = `<kbd>E</kbd>Recoger objeto`;
    else if (w) html = `<kbd>E</kbd>Desafiar a ${nameOf(w.c)} Nv.${w.c.lvl}`;
    else if (findWaterSpot()) html = `<kbd>R</kbd>Surfear con ${nameOf(surfer())}`;
  }
  el.innerHTML = html; el.hidden = !html;
}

// ============================================================
//  Retratos 3D para la interfaz
// ============================================================
const PR = { r: null, scene: null, cam: null, cache: new Map() };
function portraitURL(sp) {
  if (PR.cache.has(sp)) return PR.cache.get(sp);
  try {
    if (!PR.r) {
      PR.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); PR.r.setSize(160, 160); PR.r.setPixelRatio(1);
      PR.r.outputEncoding = THREE.sRGBEncoding; PR.r.toneMapping = THREE.ACESFilmicToneMapping;
      PR.scene = new THREE.Scene(); PR.scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.1));
      const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(2, 4, 5); PR.scene.add(d);
      PR.cam = new THREE.PerspectiveCamera(28, 1, .01, 200);
    }
    const m = buildPokemon(sp); animatePoke(m, 0, 0, false); PR.scene.add(m); m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m), c = box.getCenter(new V3()), size = box.getSize(new V3()), r = Math.max(size.x, size.y, size.z) * .5;
    PR.cam.position.copy(c).add(new V3(.55, .25, 1).normalize().multiplyScalar(r * 4.4)); PR.cam.lookAt(c);
    PR.r.render(PR.scene, PR.cam);
    const url = PR.r.domElement.toDataURL('image/png');
    PR.scene.remove(m); disposeModel(m); PR.cache.set(sp, url); return url;
  } catch (e) { return ''; }
}
const pimg = (sp, size) => `<img class="pimg" alt="" src="${portraitURL(sp)}" style="width:${size || 44}px;height:${size || 44}px">`;

// ============================================================
//  HUD
// ============================================================
const hpCol = r => r > .5 ? 'var(--good)' : r > .2 ? 'var(--warn)' : 'var(--bad)';
const chips = types => types.map(t => `<span class="chip" style="background:${TYPES[t].c}">${TYPES[t].n}</span>`).join(' ');
function expPct(c) { const a = totalExp(c.lvl), b = totalExp(c.lvl + 1); return clamp((c.exp - a) / (b - a), 0, 1) * 100; }
let hudKey = '';
function refreshHUD() {
  if (!G || !G.team || !G.team.length) return;
  const c = leader(), mh = maxHP(c), r = c.hp / mh, h = groundY(player.pos.x, player.pos.z);
  const where = player.surf ? 'Surfeando' : BIOME_NAME[biomeAt(player.pos.x, player.pos.z, h)];
  $('#card').innerHTML = `${pimg(c.sp, 46)}<div class="info">
    <div class="row"><span class="name">${nameOf(c)}</span><span class="num"><b>Nv.${c.lvl}</b></span></div>
    <div class="bar"><i style="width:${r * 100}%;background:${hpCol(r)}"></i></div>
    <div class="row"><small class="num muted">PS ${c.hp}/${mh}</small><span id="team-dots">${G.team.map(t => `<i class="${t.hp <= 0 ? 'f' : ''}" title="${nameOf(t)}"></i>`).join('')}</span></div>
    <div class="bar xp"><i style="width:${expPct(c)}%"></i></div>
    <small class="muted">${where} · ${Math.round(Math.hypot(player.pos.x, player.pos.z))} m del inicio</small></div>`;
  if (!player.surf && !companion.hidden && (companion.c !== c || companion.sp !== c.sp)) setCompanion(c);
  refreshQuick();
}
function refreshQuick() {
  const it = ['pokeball', 'pocion', 'baya'];
  $('#quick').innerHTML = it.map(k => `<span class="it" title="${ITEMS[k].n}"><span class="dot ${ITEMS[k].kind === 'ball' ? 'ball' : ''}" style="--c:${ITEMS[k].c}"></span><span class="num">${G.inv[k] || 0}</span></span>`).join('') + `<button id="q-menu">Equipo · Mochila</button>`;
  $('#q-menu').onclick = () => { if (state === 'explore') openMenu('team'); };
}
function updateStamina() { const s = $('#stamina'); s.hidden = player.stamina >= 99.5 || !!player.surf; s.querySelector('i').style.width = player.stamina + '%'; s.classList.toggle('tired', player.tired); }
const mm = $('#minimap'), mctx = mm.getContext('2d');
let mmBase = null, mmAt = new V3(1e9, 0, 1e9);
const MM_R = 110;
function drawMinimap() {
  const W = mm.width, S = 2 * MM_R / W, P = player.pos;
  if (!mmBase || Math.hypot(P.x - mmAt.x, P.z - mmAt.z) > 10) {
    mmAt.copy(P);
    const N = 56, img = mctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = mmAt.x - MM_R + (i + .5) * 2 * MM_R / N, z = mmAt.z - MM_R + (j + .5) * 2 * MM_R / N, h = terrainH(x, z);
      const c = h < 0 ? new THREE.Color('#2f8fd0').multiplyScalar(clamp(1 + h * .04, .45, 1)) : groundColor(x, z, h, 0).clone();
      c.convertLinearToSRGB();
      const o = (j * N + i) * 4; img.data[o] = c.r * 255; img.data[o + 1] = c.g * 255; img.data[o + 2] = c.b * 255; img.data[o + 3] = 255;
    }
    mmBase = document.createElement('canvas'); mmBase.width = mmBase.height = N; mmBase.getContext('2d').putImageData(img, 0, 0);
  }
  mctx.imageSmoothingEnabled = true; mctx.clearRect(0, 0, W, W);
  mctx.drawImage(mmBase, (mmAt.x - P.x) / S, (mmAt.z - P.z) / S, W, W);
  const toM = (x, z) => [W / 2 + (x - P.x) / S, W / 2 + (z - P.z) / S];
  for (const it of worldItems) { const [a, b] = toM(it.x, it.z); mctx.fillStyle = '#fff6a0'; mctx.fillRect(a - 1.5, b - 1.5, 3, 3); }
  for (const w of wilds) { const [a, b] = toM(w.pos.x, w.pos.z); mctx.fillStyle = TYPES[typesOf(w.c)[0]].c; mctx.beginPath(); mctx.arc(a, b, 3, 0, 7); mctx.fill(); mctx.strokeStyle = 'rgba(0,0,0,.55)'; mctx.stroke(); }
  for (const s of centers) { const [a, b] = toM(s.x, s.z); mctx.fillStyle = '#ff5a5a'; mctx.fillRect(a - 5, b - 4, 10, 8); mctx.fillStyle = '#fff'; mctx.fillRect(a - 1, b - 3, 2, 6); mctx.fillRect(a - 3, b - 1, 6, 2); }
  const yaw = player.surf ? player.surf.heading : player.yaw;
  mctx.save(); mctx.translate(W / 2, W / 2); mctx.rotate(-yaw + PI);
  mctx.fillStyle = '#fff'; mctx.strokeStyle = '#111'; mctx.lineWidth = 1.5;
  mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 5); mctx.lineTo(0, 2); mctx.lineTo(-5, 5); mctx.closePath(); mctx.fill(); mctx.stroke(); mctx.restore();
}

// ============================================================
//  Combate por turnos
// ============================================================
let battle = null;
const bLog = [];
function log(msg) { bLog.push(msg); while (bLog.length > 3) bLog.shift(); $('#b-log').innerHTML = bLog.map(m => `<p>${m}</p>`).join(''); }
const myC = () => G.team[battle.meIdx];
const stageMul = s => s >= 0 ? (2 + s) / 2 : 2 / (2 - s);
const effStat = (c, k, who) => stat(c, k) * stageMul(battle.stages[who][k] || 0);
function battleEligible(c) { return c.hp > 0 && (battle.myWater ? canWater(c.sp) : canLand(c.sp)); }
function renderBattleCards() {
  if (!battle) return;
  const f = battle.foe, m = myC(), fr = f.hp / maxHP(f), mr = m.hp / maxHP(m);
  $('#b-foe').innerHTML = `<div class="row"><span class="name">${nameOf(f)}</span><b class="num">Nv.${f.lvl}</b></div>
   <div class="row"><span>${chips(typesOf(f))}</span><small class="muted">${G.dex[f.sp] === 'caught' ? '● Capturado' : 'Salvaje'}</small></div>
   <div class="bar"><i style="width:${fr * 100}%;background:${hpCol(fr)}"></i></div>`;
  $('#b-me').innerHTML = `<div class="row"><span class="name">${nameOf(m)}</span><b class="num">Nv.${m.lvl}</b></div>
   <div class="row"><span>${chips(typesOf(m))}</span><small class="num">PS ${m.hp}/${maxHP(m)}</small></div>
   <div class="bar"><i style="width:${mr * 100}%;background:${hpCol(mr)}"></i></div>
   <div class="bar xp"><i style="width:${expPct(m)}%"></i></div>`;
}
function actionsHTML(html) { $('#b-actions').innerHTML = html; }
function showMain() {
  if (!battle) return;
  renderBattleCards();
  if (battle.forceSwitch) { showSwitch(true); return; }
  const balls = ['pokeball', 'superball', 'ultraball'].reduce((a, k) => a + (G.inv[k] || 0), 0);
  actionsHTML(`<button data-a="fight" class="primary">Luchar<span class="sub">Elige un movimiento</span></button>
    <button data-a="bag">Mochila<span class="sub">Curar o reanimar</span></button>
    <button data-a="ball" ${balls > 0 ? '' : 'disabled'}>Poké Ball<span class="sub">${balls} en la mochila</span></button>
    <button data-a="switch" ${G.team.filter(c => battleEligible(c)).length > 1 ? '' : 'disabled'}>Pokémon<span class="sub">Cambiar de Pokémon</span></button>
    <button data-a="run" class="wide">Huir</button>`);
  $('#b-actions').querySelectorAll('button').forEach(b => b.onclick = () => {
    sfx('click'); const a = b.dataset.a;
    if (a === 'fight') showMoves(); else if (a === 'bag') showBag(); else if (a === 'switch') showSwitch(false);
    else if (a === 'ball') showBalls(); else if (a === 'run') playerAct({ kind: 'run' });
  });
}
function showMoves() {
  const m = myC(), noPP = m.moves.every(id => m.pp[id] <= 0);
  actionsHTML(m.moves.map(id => {
    const mv = MOVES[id], e = mv.p ? effMul(mv.t, typesOf(battle.foe)) : 1;
    const tag = mv.p === 0 ? 'Estado' : `Pot. ${mv.p} · ${e === 0 ? 'No afecta' : e > 1 ? 'Muy eficaz' : e < 1 ? 'Poco eficaz' : 'Normal'}`;
    return `<button class="mv" style="--tc:${TYPES[mv.t].c}" data-m="${id}" ${m.pp[id] > 0 ? '' : 'disabled'}>${mv.n}<span class="sub num">${TYPES[mv.t].n} · ${tag} · PP ${m.pp[id]}/${ppMax(id)}</span></button>`;
  }).join('') + (noPP ? `<button data-m="forcejeo" class="wide">Forcejeo (sin PP)</button>` : '') + `<button class="wide" data-back>Volver</button>`);
  $('#b-actions').querySelectorAll('[data-m]').forEach(b => b.onclick = () => playerAct({ kind: 'move', id: b.dataset.m }));
  $('#b-actions').querySelector('[data-back]').onclick = showMain;
}
function showBalls() {
  const ks = ['pokeball', 'superball', 'ultraball'].filter(k => G.inv[k] > 0);
  actionsHTML(ks.map(k => `<button data-b="${k}">${ITEMS[k].n} <span class="num">×${G.inv[k]}</span><span class="sub">${ITEMS[k].d}</span></button>`).join('') + `<button class="wide" data-back>Volver</button>`);
  $('#b-actions').querySelectorAll('[data-b]').forEach(b => b.onclick = () => playerAct({ kind: 'catch', ball: b.dataset.b }));
  $('#b-actions').querySelector('[data-back]').onclick = showMain;
}
function showBag() {
  const usable = Object.keys(ITEMS).filter(k => ITEMS[k].battle && G.inv[k] > 0);
  actionsHTML((usable.length ? usable.map(k => `<button data-i="${k}">${ITEMS[k].n} <span class="num">×${G.inv[k]}</span><span class="sub">${ITEMS[k].d}</span></button>`).join('') : `<p class="muted" style="grid-column:1/-1;margin:0">No tienes objetos de combate.</p>`) + `<button class="wide" data-back>Volver</button>`);
  $('#b-actions').querySelectorAll('[data-i]').forEach(b => b.onclick = async () => {
    const k = b.dataset.i;
    if (ITEMS[k].kind === 'revive') { const t = await chooseCreature('¿A quién quieres reanimar?', c => c.hp <= 0); if (t) playerAct({ kind: 'item', id: k, target: t }); }
    else playerAct({ kind: 'item', id: k, target: myC() });
  });
  $('#b-actions').querySelector('[data-back]').onclick = showMain;
}
function showSwitch(forced) {
  actionsHTML(G.team.map((c, i) => {
    const ok = battleEligible(c) && i !== battle.meIdx, why = c.hp <= 0 ? 'Debilitado' : i === battle.meIdx ? 'En combate' : !battleEligible(c) ? (battle.myWater ? 'No puede estar en el agua' : 'No puede salir del agua') : `PS ${c.hp}/${maxHP(c)}`;
    return `<button data-s="${i}" ${ok ? '' : 'disabled'} class="pk">${pimg(c.sp, 30)}<span>${nameOf(c)} <span class="num">Nv.${c.lvl}</span><span class="sub num">${why}</span></span></button>`;
  }).join('') + (forced ? '' : `<button class="wide" data-back>Volver</button>`));
  $('#b-actions').querySelectorAll('[data-s]').forEach(b => b.onclick = () => playerAct({ kind: 'switch', idx: +b.dataset.s }));
  const bk = $('#b-actions').querySelector('[data-back]'); if (bk) bk.onclick = showMain;
  if (forced) log('Elige qué Pokémon sale ahora.');
}
function placeBattle() {
  const w = battle.w, P = player.pos, F = w.pos;
  let dir = new V3(F.x - P.x, 0, F.z - P.z); const dist = dir.length();
  if (dist < .1) dir.set(Math.sin(player.yaw), 0, Math.cos(player.yaw)); dir.normalize();
  battle.dir = dir;
  const fu = w.mesh.userData;
  // tu Pokémon se pone delante de ti y el salvaje se acerca a una distancia de combate
  battle.myPos = P.clone().addScaledVector(dir, 1.3 + (player.surf ? player.surf.R * 1.2 : 0)); battle.myPos.y = 0;
  const sep = clamp(1.8 + fu.R * 1.3 + fu.H * .5, 2.4, 12);
  const want = battle.myPos.clone().addScaledVector(dir, sep);
  if (dist > 1.3 + sep - .5 && canStand(w.c.sp, want.x, want.z)) { w.pos.x = want.x; w.pos.z = want.z; }
  else if (dist < 1.3 + sep - .5) { if (canStand(w.c.sp, want.x, want.z)) { w.pos.x = want.x; w.pos.z = want.z; } }
  battle.myWater = WATER - groundY(battle.myPos.x, battle.myPos.z) > .5;
}
function firstEligibleIdx() { return G.team.findIndex(c => battleEligible(c)); }
async function startBattle(w) {
  if (state !== 'explore' || battle) return;
  closeMenu();
  battle = { w, foe: w.c, stages: { me: {}, foe: {} }, part: new Set(), busy: true, forceSwitch: false, mid: w.pos.clone() };
  placeBattle();
  // si el líder no puede pelear aquí, busca otro; si nadie puede, se cancela
  let idx = G.team.findIndex(c => battleEligible(c) && !(player.surf && c === player.surf.c));
  if (idx < 0) idx = firstEligibleIdx();
  if (idx < 0 && battle.myWater && !player.surf) {
    // retrocede hasta tierra firme
    for (let k = 1; k <= 12 && battle.myWater; k++) { battle.myPos.addScaledVector(battle.dir, -.3); battle.myWater = WATER - groundY(battle.myPos.x, battle.myPos.z) > .5; }
    idx = firstEligibleIdx();
  }
  if (idx < 0) { battle = null; w.cool = 6; player.invuln = 3; toast(player.surf ? 'Ninguno de tus Pokémon puede luchar en el agua.' : 'Ninguno de tus Pokémon puede luchar aquí.'); return; }
  state = 'battle'; battle.meIdx = idx; battle.part.add(G.team[idx].uid);
  battle.mount = !!(player.surf && G.team[idx] === player.surf.c);
  seen(w.c.sp);
  const c = G.team[idx];
  const fu = w.mesh.userData;
  w.yaw = Math.atan2(-battle.dir.x, -battle.dir.z); w.mesh.rotation.y = w.yaw; w.tag.visible = false;
  if (fu.mode === 'fly') w.alt = 1.6;
  w.pos.y = entityY(fu, w.pos.x, w.pos.z, w.alt); w.mesh.position.copy(w.pos);
  battle.foePos = w.pos.clone();
  player.yaw = Math.atan2(battle.dir.x, battle.dir.z); player.vel.set(0, 0, 0); player.speed = 0;
  if (player.surf) player.surf.speed = 0;
  // cámara lateral que encuadra a los dos
  const finishSetup = () => {
    const mu = meshOf('me').userData;
    if (!battle.mount) battle.myPos.y = entityY(mu, battle.myPos.x, battle.myPos.z, mu.mode === 'fly' ? 1.2 : 0);
    const myP = battle.mount ? player.surf.pos : battle.myPos;
    const mid = myP.clone().add(battle.foePos).multiplyScalar(.5); battle.mid = mid;
    const span = myP.distanceTo(battle.foePos) + mu.R + fu.R, tallest = Math.max(mu.top, fu.top);
    const perp = new V3(-battle.dir.z, 0, battle.dir.x), tall = innerWidth < innerHeight;
    const D = clamp(span * 1.05 + tallest * 1.3, 3, 32) * (tall ? 1.55 : 1);
    camTarget.pos.copy(mid).addScaledVector(battle.dir, -D * .3).addScaledVector(perp, -D * .95);
    camTarget.pos.y = Math.max(mid.y, WATER) + tallest * .45 + D * .2 + .4;
    const gy = groundY(camTarget.pos.x, camTarget.pos.z); camTarget.pos.y = Math.max(camTarget.pos.y, gy + 1.2, WATER + .8);
    camTarget.look.copy(mid).lerp(myP, tall ? .1 : .3).add(new V3(0, tallest * (tall ? .05 : .15), 0));
    const a = camTarget.pos, seg = mid.clone().sub(a).setY(0), L2 = seg.lengthSq() || 1;
    hideDecoWhere((x, z) => { const t = clamp(((x - a.x) * seg.x + (z - a.z) * seg.z) / L2, 0, 1.15); return Math.hypot(x - (a.x + seg.x * t), z - (a.z + seg.z * t)) < 4 || Math.hypot(x - mid.x, z - mid.z) < span * .6 + 2; });
  };
  flashScreen('#ffffff', 160); sfx('battle');
  $('#hud').hidden = true; $('#touch').hidden = true; $('#battle').hidden = false;
  bLog.length = 0; log(`¡Un ${nameOf(w.c)} salvaje de nivel ${w.c.lvl} quiere luchar!`);
  actionsHTML('<p class="muted" style="grid-column:1/-1;margin:0">…</p>');
  cry(w.c.sp);
  if (battle.mount) { finishSetup(); await wait(500); log(`¡Adelante, ${nameOf(c)}!`); cry(c.sp); battle.busy = false; showMain(); return; }
  // el compañero corre a su puesto o sale de su Poké Ball
  const wasOut = companion.mesh && companion.c === c && !companion.hidden && companion.mesh.visible && !player.surf;
  companion.hidden = false; setCompanion(c);
  companion.busy = true;
  const cm = companion.mesh, target = battle.myPos.clone(); target.y = entityY(cm.userData, target.x, target.z, cm.userData.mode === 'fly' ? 1.2 : 0);
  companion.yaw = Math.atan2(battle.dir.x, battle.dir.z);
  finishSetup();
  await wait(350);
  if (wasOut) { const from = companion.pos.clone(); cm.rotation.y = companion.yaw; await tween(450, k => { cm.position.lerpVectors(from, target, ease(k)); animatePoke(cm, T, 1, false); }); }
  else { cm.position.copy(target); cm.rotation.y = companion.yaw; await releaseAnim(cm, target, player.pos.clone().add(new V3(0, 1.3, 0))); }
  companion.pos.copy(target); cm.position.copy(target); companion.busy = false;
  log(`¡Adelante, ${nameOf(c)}!`); cry(c.sp);
  battle.busy = false; showMain();
}
function chooseFoeMove() {
  const f = battle.foe, me = myC(), st = battle.stages.foe;
  return weighted(f.moves.map(id => {
    const mv = MOVES[id];
    if (mv.p === 0) return [id, mv.fx === 'none' ? 10 : (st.atk || 0) < 2 ? 22 : 2];
    return [id, Math.max(.5, mv.p * effMul(mv.t, typesOf(me)) * (typesOf(f).includes(mv.t) ? 1.5 : 1) * mv.acc / 100)];
  }));
}
function calcDamage(att, def, mv, aw, dw) {
  const A = effStat(att, 'atk', aw), D = effStat(def, 'def', dw);
  const e = effMul(mv.t, typesOf(def)), stab = typesOf(att).includes(mv.t) ? 1.5 : 1, crit = Math.random() < (mv === MOVES.hojaafilada ? .125 : .0417);
  if (e === 0) return { dmg: 0, e, crit: false };
  const dmg = Math.max(1, Math.floor(((2 * att.lvl / 5 + 2) * mv.p * A / D / 50 + 2) * stab * e * rand(.85, 1) * (crit ? 1.5 : 1)));
  return { dmg, e, crit };
}
const meshOf = who => who === 'me' ? (battle.mount ? player.surf.mesh : companion.mesh) : battle.w.mesh;
const posOf = who => meshOf(who).position;
const centerOf = who => posOf(who).clone().add(new V3(0, meshOf(who).userData.top * .55, 0));
async function lunge(who) {
  const isMe = who === 'me', m = meshOf(who), from = m.position.clone(), to = posOf(isMe ? 'foe' : 'me');
  const dir = to.clone().sub(from).setY(0); const L = dir.length(); dir.normalize();
  const reach = Math.max(.5, L - meshOf(isMe ? 'foe' : 'me').userData.R - m.userData.R * .6);
  if (isMe) companion.busy = true; else battle.w.busy = true;
  await tween(200, k => { m.position.copy(from).addScaledVector(dir, ease(k) * reach); animatePoke(m, T, 1, false); });
  burst(centerOf(isMe ? 'foe' : 'me'), '#ffffff', 26, 3, .4);
  await tween(260, k => m.position.copy(from).addScaledVector(dir, (1 - ease(k)) * reach));
  m.position.copy(from); if (isMe) companion.busy = false; else battle.w.busy = false;
}
async function stream(who, color, o) {
  o = o || {};
  const from = centerOf(who).clone(), tw = who === 'me' ? 'foe' : 'me', to = centerOf(tw);
  from.y += meshOf(who).userData.top * .15;
  await tween(o.dur || 480, k => {
    const p = from.clone().lerp(to, k); if (o.arc) p.y += Math.sin(k * PI) * o.arc;
    burst(p, color, o.n || 5, o.spread || .8, o.life || .35, { add: o.add, g: o.g != null ? o.g : 0, size: o.size || .3 });
  });
  burst(to, color, 40, 3, .6, { add: o.add, size: (o.size || .3) * 1.2 });
}
async function bolt(who) {
  const tw = who === 'me' ? 'foe' : 'me', to = centerOf(tw), from = to.clone().add(new V3(rand(-1, 1), 8, rand(-1, 1)));
  const grp = new THREE.Group(); scene.add(grp);
  const mat = addMat('#fff39a', 1);
  for (let b = 0; b < 2; b++) {
    let prev = from.clone();
    for (let i = 1; i <= 8; i++) {
      const p = from.clone().lerp(to, i / 8); if (i < 8) p.add(new V3(rand(-.5, .5), 0, rand(-.5, .5)));
      const seg = new THREE.Mesh(UG.cyl, mat), mid = prev.clone().add(p).multiplyScalar(.5), L = prev.distanceTo(p);
      seg.position.copy(mid); seg.scale.set(.05, L, .05); seg.quaternion.setFromUnitVectors(new V3(0, 1, 0), p.clone().sub(prev).normalize()); grp.add(seg); prev = p;
    }
  }
  sfx('thunder'); const h0 = hemi.intensity;
  for (let i = 0; i < 3; i++) { grp.visible = true; hemi.intensity = h0 * 2.5; await wait(70); grp.visible = false; hemi.intensity = h0; await wait(50); }
  scene.remove(grp); mat.dispose();
  burst(to, '#fff17a', 50, 4, .5);
}
async function rocks(who) {
  const tw = who === 'me' ? 'foe' : 'me', to = centerOf(tw), from = centerOf(who).add(new V3(0, .8, 0)), list = [];
  for (let i = 0; i < 3; i++) { const r = new THREE.Mesh(rockGeo, new THREE.MeshStandardMaterial({ color: '#8b7d6b', roughness: .9 })); r.scale.setScalar(.18 + i * .05); r.castShadow = true; scene.add(r); list.push(r); }
  await tween(520, k => list.forEach((r, i) => { const kk = clamp(k * 1.3 - i * .15, 0, 1); r.position.lerpVectors(from, to, kk); r.position.y += Math.sin(kk * PI) * 1.6; r.rotation.x += .2; }));
  list.forEach(r => { scene.remove(r); r.material.dispose(); });
  burst(to, '#b9a58a', 40, 3, .7, { add: false, g: 6, size: .25 });
}
async function quake(who) {
  const tw = who === 'me' ? 'foe' : 'me', p = posOf(tw).clone();
  const ring = new THREE.Mesh(UG.tor, new THREE.MeshBasicMaterial({ color: '#c9a86a', transparent: true, opacity: .8 })); ring.rotation.x = PI / 2; ring.position.copy(p).add(new V3(0, .1, 0)); scene.add(ring);
  const c0 = camTarget.pos.clone();
  await tween(600, k => { ring.scale.setScalar(.5 + k * 4); ring.material.opacity = .8 * (1 - k); camTarget.pos.copy(c0).add(new V3(Math.sin(k * 60) * .12, Math.cos(k * 50) * .08, 0)); });
  camTarget.pos.copy(c0); scene.remove(ring); ring.material.dispose();
  burst(p.clone().add(new V3(0, .3, 0)), '#a88b5e', 50, 3, .8, { add: false, g: 6, size: .3, spread: .6 });
}
async function beam(who, color) {
  const from = centerOf(who), to = centerOf(who === 'me' ? 'foe' : 'me');
  const b = new THREE.Mesh(UG.cyl, addMat(color, .9)); scene.add(b);
  const L = from.distanceTo(to), mid = from.clone().add(to).multiplyScalar(.5);
  b.position.copy(mid); b.quaternion.setFromUnitVectors(new V3(0, 1, 0), to.clone().sub(from).normalize());
  await tween(500, k => b.scale.set(.05 + Math.sin(k * PI) * .25, L, .05 + Math.sin(k * PI) * .25));
  scene.remove(b); b.material.dispose(); burst(to, color, 50, 4, .6);
}
async function moveFX(who, mv) {
  if (mv.contact) { await lunge(who); return; }
  const t = mv.t;
  if (t === 'fuego') await stream(who, '#ff7a1a', { n: 6, size: .4, spread: .6 });
  else if (t === 'agua') await stream(who, '#7fd0ff', { n: 6, size: .25, add: false, g: 3, arc: .5 });
  else if (t === 'electrico') await bolt(who);
  else if (t === 'planta') await stream(who, '#7fdc5a', { n: 4, size: .22, add: false, spread: 1.2 });
  else if (t === 'hielo') await stream(who, '#c8f4ff', { n: 6, size: .28, spread: .5 });
  else if (t === 'roca') await rocks(who);
  else if (t === 'tierra') await quake(who);
  else if (t === 'veneno') await stream(who, '#c05ad8', { n: 5, size: .35, add: false, arc: 1 });
  else if (t === 'fantasma') await stream(who, '#7a4fd0', { n: 6, size: .45, add: false });
  else if (t === 'volador') await stream(who, '#f0f4ff', { n: 8, size: .2, spread: 1.6, dur: 380 });
  else await beam(who, '#ffd9a0');
}
async function hitReact(who) {
  const m = meshOf(who), base = m.position.clone(), isMe = who === 'me';
  if (isMe) companion.busy = true; else battle.w.busy = true;
  const away = base.clone().sub(posOf(isMe ? 'foe' : 'me')).setY(0).normalize().multiplyScalar(.25);
  for (let i = 0; i < 3; i++) {
    setEmissive(m, '#ffffff', 1.1); await tween(60, k => m.position.copy(base).addScaledVector(away, Math.sin(k * PI)));
    setEmissive(m, '#000', 0); await tween(60, () => { });
  }
  m.position.copy(base); if (isMe) companion.busy = false; else battle.w.busy = false;
}
async function useMove(who, mvId) {
  const att = who === 'me' ? myC() : battle.foe, def = who === 'me' ? battle.foe : myC(), dw = who === 'me' ? 'foe' : 'me';
  const mv = mvId === 'forcejeo' ? { n: 'Forcejeo', t: 'normal', p: 35, acc: 100, contact: true } : MOVES[mvId];
  if (who === 'me' && att.pp[mvId] != null) att.pp[mvId] = Math.max(0, att.pp[mvId] - 1);
  const label = who === 'me' ? nameOf(att) : `${nameOf(att)} salvaje`, dlabel = who === 'me' ? `${nameOf(def)} salvaje` : nameOf(def);
  log(`¡${label} usó ${mv.n}!`); await wait(250);
  if (mv.p === 0) {
    if (mv.fx === 'none') { burst(centerOf(who), '#bfe8ff', 20, 2, .5, { add: false, g: 6 }); await tween(500, k => meshOf(who).position.y = posOf(who).y + Math.abs(Math.sin(k * PI * 3)) * .02); log('Pero no ha pasado nada...'); await wait(600); return; }
    const [tgt, st, val] = mv.fx.split(':'), side = tgt === 'self' ? who : dw, stg = battle.stages[side], n = +val;
    const names = { atk: 'El ataque', def: 'La defensa', spd: 'La velocidad' };
    const tl = tgt === 'self' ? label : dlabel;
    if ((n > 0 && (stg[st] || 0) >= 6) || (n < 0 && (stg[st] || 0) <= -6)) { log(`¡${names[st]} de ${tl} no puede ${n > 0 ? 'subir' : 'bajar'} más!`); await wait(600); return; }
    stg[st] = clamp((stg[st] || 0) + n, -6, 6);
    const col = n > 0 ? (st === 'atk' ? '#ff7a5a' : st === 'def' ? '#6ab0ff' : '#ffe06a') : '#8a9ab8';
    const c = centerOf(side); burst(n > 0 ? c.clone().add(new V3(0, -.4, 0)) : c.clone().add(new V3(0, .6, 0)), col, 50, n > 0 ? 2 : 1.4, 1, { g: n > 0 ? -3 : 4, add: n > 0 });
    await wait(600);
    log(`¡${names[st]} de ${tl} ${n > 0 ? (n > 1 ? 'ha subido mucho' : 'ha subido') : 'ha bajado'}!`); await wait(500); return;
  }
  if (Math.random() * 100 > mv.acc) { await moveFX(who, mv); log(`¡${dlabel} ha esquivado el ataque!`); await wait(550); return; }
  await moveFX(who, mv);
  const { dmg, e, crit } = calcDamage(att, def, mv, who, dw);
  if (e === 0) { log(`No afecta a ${dlabel}...`); await wait(700); return; }
  def.hp = Math.max(0, def.hp - dmg);
  sfx(e > 1 ? 'super' : e < 1 ? 'weak' : 'hit');
  floatText(centerOf(dw).add(new V3(0, meshOf(dw).userData.top * .6, 0)), '-' + dmg, e > 1 ? '#ffd166' : '#ffffff');
  const hr = hitReact(dw); renderBattleCards(); await hr;
  if (crit) { log('¡Un golpe crítico!'); await wait(350); }
  if (e > 1) log('¡Es muy eficaz!'); else if (e < 1) log('No es muy eficaz...');
  await wait(450);
}
async function faintAnim(who) {
  const m = meshOf(who), b = m.position.clone(), s = m.scale.x;
  sfx('faint'); cry(who === 'me' ? myC().sp : battle.foe.sp);
  if (who === 'me') companion.busy = true; else battle.w.busy = true;
  await tween(700, k => { m.position.y = b.y - k * m.userData.top * .4; m.rotation.z = k * .6; });
  if (who === 'me') { await returnAnim(m, player.pos.clone().add(new V3(0, 1.3, 0))); }
  else { await tween(300, k => m.scale.setScalar(s * (1 - k))); m.visible = false; }
  m.scale.setScalar(s); m.position.copy(b); m.rotation.z = 0;
  if (who === 'me') companion.busy = false; else battle.w.busy = false;
}
async function checkFaints() {
  if (battle.foe.hp <= 0) { await victory(); return true; }
  if (myC().hp <= 0) {
    log(`¡${nameOf(myC())} se ha debilitado!`);
    await faintAnim('me');
    if (G.team.some(c => battleEligible(c))) { battle.forceSwitch = true; battle.busy = false; showMain(); return true; }
    await blackout(); return true;
  }
  return false;
}
async function playerAct(act) {
  if (!battle || battle.busy) return;
  if (battle.forceSwitch && act.kind !== 'switch') return;
  battle.busy = true; actionsHTML('<p class="muted" style="grid-column:1/-1;margin:0">…</p>');
  if (battle.forceSwitch) { battle.forceSwitch = false; await switchTo(act.idx); battle.busy = false; showMain(); return; }
  if (act.kind === 'move') {
    const me = myC(), foe = battle.foe, fm = chooseFoeMove();
    const pm = act.id === 'forcejeo' ? 0 : (MOVES[act.id].prio || 0), pf = MOVES[fm].prio || 0;
    const ms = effStat(me, 'spd', 'me'), fs = effStat(foe, 'spd', 'foe');
    const meFirst = pm !== pf ? pm > pf : (ms > fs || (ms === fs && Math.random() < .5));
    const order = meFirst ? [['me', act.id], ['foe', fm]] : [['foe', fm], ['me', act.id]];
    for (const [who, mv] of order) { await useMove(who, mv); if (await checkFaints()) return; }
  } else {
    if (act.kind === 'run') {
      const ms = effStat(myC(), 'spd', 'me'), fs = effStat(battle.foe, 'spd', 'foe');
      battle.runs = (battle.runs || 0) + 1;
      const ch = clamp((ms * 128 / Math.max(1, fs) + 30 * battle.runs) / 256, .2, 1);
      if (Math.random() < ch) { log('¡Has escapado sin problemas!'); await wait(700); await endBattle('run'); return; }
      log('¡No has podido escapar!'); await wait(650);
    } else if (act.kind === 'item') await useItemBattle(act.id, act.target);
    else if (act.kind === 'switch') await switchTo(act.idx);
    else if (act.kind === 'catch') { if (await tryCatch(act.ball)) return; }
    await useMove('foe', chooseFoeMove()); if (await checkFaints()) return;
  }
  battle.busy = false; showMain();
}
async function switchTo(idx) {
  const old = myC();
  if (old.hp > 0 && !battle.mount) { log(`¡${nameOf(old)}, vuelve!`); await returnAnim(companion.mesh, player.pos.clone().add(new V3(0, 1.3, 0))); }
  battle.meIdx = idx; battle.stages.me = {}; battle.part.add(G.team[idx].uid);
  const c = myC();
  if (player.surf && c === player.surf.c) { battle.mount = true; log(`¡Adelante, ${nameOf(c)}!`); cry(c.sp); renderBattleCards(); await wait(500); return; }
  battle.mount = false; setCompanion(c);
  const cm = companion.mesh, target = battle.myPos.clone(); target.y = entityY(cm.userData, target.x, target.z, cm.userData.mode === 'fly' ? 1.2 : 0);
  companion.yaw = Math.atan2(battle.dir.x, battle.dir.z); cm.rotation.y = companion.yaw; cm.position.copy(target); companion.pos.copy(target);
  companion.busy = true; await releaseAnim(cm, target, player.pos.clone().add(new V3(0, 1.3, 0))); companion.busy = false;
  log(`¡Adelante, ${nameOf(c)}!`); cry(c.sp);
  renderBattleCards(); await wait(300);
}
function applyItem(k, c) {
  const it = ITEMS[k];
  if (it.kind === 'heal') { if (c.hp <= 0 || c.hp >= maxHP(c)) return null; const before = c.hp; c.hp = Math.min(maxHP(c), c.hp + it.amt); return `${nameOf(c)} recupera ${c.hp - before} PS.`; }
  if (it.kind === 'pp') { if (c.moves.every(m => c.pp[m] >= ppMax(m))) return null; c.moves.forEach(m => c.pp[m] = ppMax(m)); return `Los PP de ${nameOf(c)} se han restaurado.`; }
  if (it.kind === 'revive') { if (c.hp > 0) return null; c.hp = Math.ceil(maxHP(c) / 2); return `¡${nameOf(c)} ha vuelto en sí!`; }
  if (it.kind === 'boost') { if ((c.bonus[it.stat] || 0) >= BONUS_CAP) return null; const was = maxHP(c); c.bonus[it.stat] = (c.bonus[it.stat] || 0) + it.v; if (it.stat === 'hp' && c.hp > 0) c.hp += maxHP(c) - was; const nm = { atk: 'Ataque', def: 'Defensa', spd: 'Velocidad', hp: 'PS máximos' }[it.stat]; return `¡${nameOf(c)} gana +${it.v} de ${nm}!`; }
  if (it.kind === 'level') { if (c.lvl >= 100) return null; c.exp = totalExp(c.lvl + 1); levelUp(c, []); return `¡${nameOf(c)} sube al nivel ${c.lvl}!`; }
  return null;
}
async function useItemBattle(k, target) {
  const msg = applyItem(k, target);
  if (!msg) { log('No tendría ningún efecto.'); await wait(700); return; }
  G.inv[k]--; sfx('heal');
  if (target === myC()) burst(centerOf('me'), '#8dffb0', 40, 2, .8, { g: -2 });
  log(`Usas ${ITEMS[k].n}. ${msg}`); renderBattleCards(); await wait(800);
}
async function tryCatch(ballKind) {
  if (!G.inv[ballKind]) return false;
  G.inv[ballKind]--; const f = battle.foe, fm = battle.w.mesh, fu = fm.userData;
  log(`¡Lanzas una ${ITEMS[ballKind].n}!`);
  player.pose = 'throw'; setTimeout(() => player.pose = player.surf ? 'sit' : null, 350);
  const to = centerOf('foe').add(new V3(0, fu.top * .25, 0));
  const ball = await throwBall(ballKind, player.pos.clone().add(new V3(.25, 1.6, 0)), to, 700);
  battle.w.busy = true;
  flashScreen('#ffffff', 60); burst(to, '#ffffff', 40, 3, .5); setEmissive(fm, '#ff3030', 1.3);
  const s0 = fm.scale.x; await tween(300, k => fm.scale.setScalar(s0 * (1 - k)));
  fm.visible = false; setEmissive(fm, '#000', 0);
  const onWater = WATER - groundY(to.x, to.z) > .1, rest = (onWater ? waterY(to.x, to.z) : groundY(to.x, to.z)) + ball.userData.r;
  let vy = 0; await tween(500, k => { vy -= PHY.g * .016; ball.position.y = Math.max(rest, ball.position.y + vy * .016); });
  ball.position.y = rest;
  const mh = maxHP(f), lowLvl = f.lvl < 13 ? (36 - 2 * f.lvl) / 10 : 1;
  const a = ((3 * mh - 2 * f.hp) * SPECIES[f.sp].rate * ITEMS[ballKind].mult * lowLvl) / (3 * mh);
  const per = Math.pow(clamp(a / 255, .005, 1), .25);
  let ok = true;
  for (let i = 0; i < 4; i++) {
    await wait(i === 3 ? 250 : 450);
    if (Math.random() > per) { ok = false; break; }
    if (i < 3) { sfx('shake'); log('.'.repeat(i + 1)); await tween(400, k => ball.rotation.z = Math.sin(k * PI * 2) * .45); }
  }
  if (ok) {
    sfx('catch'); burst(ball.position.clone(), '#ffe27a', 50, 2.5, 1.1, { g: -1 });
    G.caught = (G.caught || 0) + 1; caught(f.sp);
    f.hp = Math.max(1, f.hp);
    const dest = G.team.length < 6 ? 'team' : 'reserve'; G[dest].push(f);
    log(`¡Ya está! ¡Has atrapado a ${nameOf(f)}!${dest === 'reserve' ? ' Se ha enviado a la reserva.' : ''}`);
    await wait(1400); scene.remove(ball); fm.scale.setScalar(s0);
    await endBattle('caught'); return true;
  }
  burst(ball.position.clone(), '#ffffff', 30, 3, .5); scene.remove(ball); flashScreen('#ffffff', 50);
  fm.visible = true; await tween(250, k => fm.scale.setScalar(s0 * ease(k))); fm.scale.setScalar(s0); battle.w.busy = false;
  log(pick(['¡Oh, no! ¡El Pokémon se ha escapado!', '¡Vaya! ¡Parecía que ya era tuyo!', '¡Argh! ¡Casi lo consigues!'])); await wait(800);
  return false;
}
function levelUp(c, learned) {
  const oldMax = maxHP(c);
  while (c.lvl < 100 && c.exp >= totalExp(c.lvl + 1)) { c.lvl++; for (const m of refreshMoves(c)) learned.push(m); }
  if (c.hp > 0) c.hp = Math.min(maxHP(c), c.hp + (maxHP(c) - oldMax));
  if (canEvolve(c) && !c.noEvo && !pendingEvos.includes(c.uid)) pendingEvos.push(c.uid);
}
async function victory() {
  const f = battle.foe;
  log(`¡${nameOf(f)} salvaje se ha debilitado!`);
  await faintAnim('foe');
  G.wins = (G.wins || 0) + 1;
  const baseY = 40 + (SPECIES[f.sp].base.hp + SPECIES[f.sp].base.atk + SPECIES[f.sp].base.def + SPECIES[f.sp].base.spd) / 4;
  const gain = Math.floor(baseY * f.lvl / 4.2);
  for (const c of G.team) {
    if (c.hp <= 0 || c.lvl >= 100) continue;
    const amt = battle.part.has(c.uid) ? gain : Math.floor(gain * .3);
    const before = c.lvl; c.exp += amt;
    const learned = []; levelUp(c, learned);
    if (battle.part.has(c.uid)) log(`${nameOf(c)} ha ganado ${amt} puntos de experiencia.`);
    renderBattleCards();
    if (c.lvl > before) {
      sfx('lvl'); log(`¡${nameOf(c)} ha subido al nivel ${c.lvl}!`); await wait(700);
      for (const m of learned) { log(`¡${nameOf(c)} ha aprendido ${MOVES[m].n}!`); await wait(700); }
    } else await wait(450);
  }
  const loot = [];
  if (Math.random() < .35) loot.push('baya');
  if (Math.random() < .15) loot.push('pokeball');
  if (Math.random() < .08) loot.push(pick(['proteina', 'hierro', 'carburante', 'masps']));
  if (Math.random() < .08) loot.push(pick(['pocion', 'eter']));
  if (f.lvl >= 15 && Math.random() < .05) loot.push('caramelo');
  if (Math.random() < .03) loot.push(pick(['piedrafuego', 'piedratrueno', 'piedraagua']));
  for (const k of loot) G.inv[k] = (G.inv[k] || 0) + 1;
  if (loot.length) { log('Ha dejado caer: ' + loot.map(k => ITEMS[k].n).join(', ') + '.'); await wait(900); }
  await wait(300); await endBattle('win');
}
async function blackout() {
  log('¡No te quedan Pokémon en condiciones de luchar!'); await wait(1300);
  const f = $('#fade'); f.style.background = '#000'; f.style.opacity = 1; await wait(500);
  const w = battle.w; w.cool = 10; w.c.hp = maxHP(w.c);
  G.team.forEach(healFull);
  if (player.surf) { scene.remove(player.surf.mesh); disposeModel(player.surf.mesh); player.surf = null; player.pose = null; }
  await endBattle('lose');
  player.pos.set(G.respawn[0], groundY(G.respawn[0], G.respawn[1]), G.respawn[1]); player.vel.set(0, 0, 0);
  companion.pos.copy(player.pos).add(new V3(1.5, 0, 1.5)); companion.hidden = false; setCompanion(leader());
  cam.pos.copy(player.pos).add(new V3(0, 3, 6));
  updateChunks(player.pos, true);
  await wait(300); f.style.opacity = 0;
  toast('Has corrido al último Centro Pokémon. Tus Pokémon están curados.', 3800);
}
async function endBattle(result) {
  const w = battle.w;
  if (result === 'win' || result === 'caught') removeWild(w);
  else { w.cool = 8; w.busy = false; w.mesh.visible = true; w.mesh.scale.setScalar(w.mesh.userData.s); }
  restoreDeco();
  const surfing = !!player.surf;
  $('#battle').hidden = true; $('#hud').hidden = false; $('#touch').hidden = !isTouch;
  const fighter = companion.mesh;
  battle = null; state = 'explore'; player.invuln = 3;
  if (surfing) {
    if (fighter && fighter.visible) { returnAnim(fighter, player.pos.clone().add(new V3(0, 1.3, 0))); }
    companion.hidden = true;
    // si el Pokémon que te lleva se ha debilitado, otro te recoge o llegas nadando a la orilla
    if (player.surf.c.hp <= 0) {
      const sf = surfer();
      if (sf) { const s = player.surf; scene.remove(s.mesh); disposeModel(s.mesh); const m = buildPokemon(sf.sp); scene.add(m); s.c = sf; s.mesh = m; s.R = m.userData.R; toast(`${nameOf(sf)} te lleva ahora.`); }
      else { const land = nearestLand(player.surf.pos); scene.remove(player.surf.mesh); disposeModel(player.surf.mesh); player.surf = null; player.pose = null; if (land) { player.pos.copy(land); } toast('Has llegado a la orilla como has podido.', 3200); showCompanion(); }
    }
  } else if (companion.c && companion.c.hp <= 0) { companion.hidden = false; setCompanion(leader()); }
  for (const x of wilds) drawTag(x.tag, x);
  if (!player.surf) { if (companion.c !== leader()) setCompanion(leader()); companion.hidden = false; if (companion.mesh) companion.mesh.visible = leader().hp > 0; }
  refreshHUD(); saveGame();
  setTimeout(processEvos, 500);
}
function nearestLand(p) {
  for (let r = 2; r < 200; r += 2) for (let a = 0; a < PI * 2; a += .3) { const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r, h = groundY(x, z); if (h > .2) return new V3(x, h, z); }
  return new V3(G.respawn[0], groundY(G.respawn[0], G.respawn[1]), G.respawn[1]);
}

// ============================================================
//  Evolución (siempre decides tú)
// ============================================================
let evoBusy = false;
async function processEvos() {
  if (evoBusy) return; evoBusy = true;
  while (pendingEvos.length) {
    if (state !== 'explore' || player.surf) { await wait(400); if (player.surf && state === 'explore') { evoBusy = false; return; } continue; }
    const uid = pendingEvos.shift(), c = G.team.concat(G.reserve).find(x => x.uid === uid);
    if (!c || !canEvolve(c) || c.noEvo) continue;
    const to = levelEvo(c).to, next = SPECIES[to];
    const ch = await ask(`¡${nameOf(c)} quiere evolucionar!`,
      `<span class="evo-row">${pimg(c.sp, 72)}<b>→</b>${pimg(to, 72)}</span>${nameOf(c)} ha alcanzado el nivel ${c.lvl} y puede convertirse en <b>${next.name}</b> (${next.types.map(t => TYPES[t].n).join(' / ')}). ¿Le dejas evolucionar?`,
      [{ v: 'never', t: 'No evolucionar nunca' }, { v: 'later', t: 'Ahora no' }, { v: 'yes', t: 'Evolucionar', primary: true }]);
    if (ch === 'yes') await evolve(c, to);
    else if (ch === 'never') { c.noEvo = true; toast(`${nameOf(c)} no evolucionará. Puedes cambiarlo en Equipo.`, 3500); }
    else toast('Puedes hacerle evolucionar cuando quieras desde el menú Equipo.', 3200);
  }
  evoBusy = false; saveGame();
}
async function evolve(c, to) {
  closeMenu(); state = 'cutscene';
  const oldName = nameOf(c);
  const wasHidden = companion.hidden;
  companion.hidden = false; setCompanion(c);
  const m0 = companion.mesh; m0.visible = true;
  const p = companion.pos.clone(), fwd = new V3(Math.sin(companion.yaw), 0, Math.cos(companion.yaw)), H = Math.max(SPECIES[c.sp].H, SPECIES[to].H);
  camTarget.pos.copy(p).addScaledVector(fwd, 2.5 + H * 2).add(new V3(1, 1 + H * .8, 0)); camTarget.look.copy(p).add(new V3(0, H * .5, 0));
  $('#hud').hidden = true; $('#touch').hidden = true;
  const et = $('#evo-text'); et.hidden = false; et.textContent = `¿Qué? ¡${oldName} está evolucionando!`;
  sfx('evo'); cry(c.sp); await wait(800);
  const s0 = m0.scale.x;
  await tween(3200, k => {
    const fr = 2 + k * 16, on = Math.sin(T * fr * 2) > 0;
    setEmissive(m0, '#ffffff', on ? 1.4 : .4 + k * .6);
    m0.scale.setScalar(s0 * (1 + Math.sin(T * fr) * .1 * k));
    if (Math.random() < .35) burst(p.clone().add(new V3(rand(-1, 1) * H, rand(.2, 1.5) * H, rand(-1, 1) * H)), '#ffffff', 4, 1.5, .6);
  });
  flashScreen('#ffffff', 400);
  const wasMax = maxHP(c);
  c.sp = to; c.hp = c.hp > 0 ? Math.min(maxHP(c), c.hp + maxHP(c) - wasMax) : 0;
  const learned = refreshMoves(c); caught(to);
  setCompanion(c);
  const m1 = companion.mesh, s1 = m1.scale.x;
  setEmissive(m1, '#ffffff', 1.4);
  await tween(600, k => { m1.scale.setScalar(s1 * (.5 + .5 * ease(k))); setEmissive(m1, '#ffffff', 1.4 * (1 - k)); });
  setEmissive(m1, '#000', 0); m1.scale.setScalar(s1);
  burst(p.clone().add(new V3(0, H * .6, 0)), '#ffe9a8', 90, 4, 1.4); sfx('lvl'); cry(to);
  et.textContent = `¡Enhorabuena! ¡Tu ${oldName} ha evolucionado a ${SPECIES[to].name}!`;
  await wait(2400);
  for (const mv of learned) { et.textContent = `¡${SPECIES[to].name} ha aprendido ${MOVES[mv].n}!`; await wait(1400); }
  et.hidden = true; state = 'explore';
  $('#hud').hidden = false; $('#touch').hidden = !isTouch;
  companion.hidden = wasHidden && !!player.surf;
  if (leader() !== c) setCompanion(leader());
  refreshHUD();
  if (canEvolve(c) && !c.noEvo && !pendingEvos.includes(c.uid)) pendingEvos.push(c.uid);
  saveGame();
}

// ============================================================
//  Ventanas y menú
// ============================================================
function ask(title, html, btns) {
  return new Promise(res => {
    const box = $('#modal-box');
    box.innerHTML = `<h2 class="h">${title}</h2><p>${html}</p><div class="btns">${btns.map((b, i) => `<button data-i="${i}" class="${b.primary ? 'primary' : ''}">${b.t}</button>`).join('')}</div>`;
    $('#modal').hidden = false;
    box.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { sfx('click'); $('#modal').hidden = true; res(btns[+el.dataset.i].v); });
    const pr = box.querySelector('.primary'); if (pr) pr.focus();
  });
}
function chooseCreature(title, filter, list) {
  return new Promise(res => {
    const box = $('#modal-box'), L = (list || G.team).filter(filter);
    box.innerHTML = `<h2 class="h">${title}</h2>${L.length ? `<div class="pick">${L.map((c, i) => `<button data-i="${i}">${pimg(c.sp, 36)}<span><b>${nameOf(c)}</b> Nv.${c.lvl}<br><small class="num muted">PS ${c.hp}/${maxHP(c)}</small></span></button>`).join('')}</div>` : '<p class="muted">Ningún Pokémon puede usarlo ahora.</p>'}<div class="btns"><button data-x>Cancelar</button></div>`;
    $('#modal').hidden = false;
    box.querySelectorAll('[data-i]').forEach(el => el.onclick = () => { $('#modal').hidden = true; res(L[+el.dataset.i]); });
    box.querySelector('[data-x]').onclick = () => { $('#modal').hidden = true; res(null); };
  });
}
let menuTab = 'team';
function openMenu(tab) { menuTab = tab || menuTab; $('#menu').hidden = false; renderMenu(); }
function closeMenu() { $('#menu').hidden = true; }
$('#m-close').onclick = closeMenu;
$('#menu').addEventListener('click', e => { if (e.target.id === 'menu') closeMenu(); });
document.querySelectorAll('.tab').forEach(b => b.onclick = () => { sfx('click'); menuTab = b.dataset.tab; renderMenu(); });
$('#m-sound').onclick = () => { soundOn = !soundOn; store.set('pokemon_sound', soundOn); $('#m-sound').textContent = soundOn ? 'Sonido: sí' : 'Sonido: no'; };
$('#help-close').onclick = () => $('#help').hidden = true;
function creatureCard(c, i, where) {
  const sp = SPECIES[c.sp], mh = maxHP(c), r = c.hp / mh, le = (sp.evo || []).find(e => e.lvl), ie = (sp.evo || []).filter(e => e.item);
  let evoHTML = '';
  if (le) evoHTML = `<button data-act="evo" ${canEvolve(c) ? 'class="primary"' : 'disabled'}>${canEvolve(c) ? 'Evolucionar a ' + SPECIES[le.to].name : 'Evoluciona en Nv.' + le.lvl}</button>`;
  const stoneTxt = ie.length ? `<small class="muted">Evoluciona con: ${ie.map(e => `${ITEMS[e.item].n} → ${SPECIES[e.to].name}`).join(' · ')}</small>` : '';
  return `<div class="ccard ${where === 'team' && i === 0 ? 'lead' : ''}" data-i="${i}" data-w="${where}">
   <div class="top">${pimg(c.sp, 64)}<div style="flex:1;min-width:0">
     <div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline"><span class="nm">${sp.name}</span><b class="num">Nv.${c.lvl}</b></div>
     <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${chips(sp.types)}<small class="muted">Nº ${String(sp.dex).padStart(3, '0')}${where === 'team' && i === 0 ? ' · Líder' : ''}</small></div></div></div>
   <div class="bar"><i style="width:${r * 100}%;background:${hpCol(r)}"></i></div>
   <div style="display:flex;justify-content:space-between"><small class="num muted">PS ${c.hp}/${mh}</small><small class="num muted">EXP ${Math.round(expPct(c))} %</small></div>
   <div class="bar xp"><i style="width:${expPct(c)}%"></i></div>
   <div class="stats num"><div>PS<b>${mh}</b></div><div>Ata<b>${stat(c, 'atk')}</b></div><div>Def<b>${stat(c, 'def')}</b></div><div>Vel<b>${stat(c, 'spd')}</b></div></div>
   <div class="moves">${c.moves.map(m => `<span style="--tc:${TYPES[MOVES[m].t].c}">${MOVES[m].n} <span class="muted num">${c.pp[m]}/${ppMax(m)}</span></span>`).join('')}</div>
   ${sp.surf ? '<small class="muted">Puede llevarte por el agua (Surf).</small>' : ''}
   ${le ? `<label class="tg"><input type="checkbox" data-act="noevo" id="noevo-${c.uid}" ${c.noEvo ? '' : 'checked'}> Permitir evolución al subir de nivel</label>` : ''}${stoneTxt}${!sp.evo ? '<small class="muted">Forma final: ya no puede evolucionar.</small>' : ''}
   <div class="actions">
     ${where === 'team' ? `${i > 0 ? '<button data-act="lead">Hacer líder</button>' : ''}${evoHTML}${G.team.length > 1 ? '<button data-act="toBox">A la reserva</button>' : ''}`
      : `<button data-act="toTeam" ${G.team.length < 6 ? '' : 'disabled'}>${G.team.length < 6 ? 'Al equipo' : 'Equipo lleno (6)'}</button>${evoHTML}<button data-act="release">Liberar</button>`}
   </div></div>`;
}
function renderMenu() {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === menuTab));
  $('#m-sound').textContent = soundOn ? 'Sonido: sí' : 'Sonido: no';
  const body = $('#m-body');
  if (menuTab === 'team') body.innerHTML = G.team.map((c, i) => creatureCard(c, i, 'team')).join('') + `<p class="muted" style="grid-column:1/-1;margin:0;font-size:13px">Victorias: <b class="num">${G.wins || 0}</b> · Capturas: <b class="num">${G.caught || 0}</b> · El líder te acompaña y sale primero en combate.</p>`;
  else if (menuTab === 'box') body.innerHTML = G.reserve.length ? G.reserve.map((c, i) => creatureCard(c, i, 'box')).join('') : '<div class="empty">La reserva está vacía. Los Pokémon que captures con el equipo lleno aparecerán aquí.</div>';
  else if (menuTab === 'dex') {
    const n = DEX_ORDER.filter(s => G.dex[s] === 'caught').length, sn = DEX_ORDER.filter(s => G.dex[s]).length;
    body.innerHTML = `<p class="muted" style="grid-column:1/-1;margin:0">Vistos: <b class="num">${sn}</b> · Capturados: <b class="num">${n}</b> de ${DEX_ORDER.length}</p>` + DEX_ORDER.map(s => {
      const st = G.dex[s], sp = SPECIES[s];
      return `<div class="dcard ${st ? '' : 'unk'}">${st ? pimg(s, 72) : '<span class="qm">?</span>'}<div><small class="muted num">Nº ${String(sp.dex).padStart(3, '0')}</small><b>${st ? sp.name : '???'}</b>${st ? `<span>${chips(sp.types)}</span>` : ''}<small class="muted">${st === 'caught' ? '● Capturado' : st ? 'Visto' : 'Sin descubrir'} · ${sp.H} m</small></div></div>`;
    }).join('');
  } else {
    const ks = Object.keys(ITEMS).filter(k => G.inv[k] > 0);
    body.innerHTML = ks.length ? ks.map(k => `<div class="icard"><span class="ico ${ITEMS[k].kind === 'ball' ? 'ball' : ''}" style="--c:${ITEMS[k].c}"></span><div class="t"><b>${ITEMS[k].n} <span class="num muted">×${G.inv[k]}</span></b><small>${ITEMS[k].d}</small></div>${ITEMS[k].kind === 'ball' ? '<small class="muted">En combate</small>' : `<button data-use="${k}">Usar</button>`}</div>`).join('') : '<div class="empty">La mochila está vacía. Busca destellos en el suelo.</div>';
  }
  body.querySelectorAll('[data-use]').forEach(b => b.onclick = async () => {
    const k = b.dataset.use, it = ITEMS[k];
    if (it.kind === 'stone') {
      const c = await chooseCreature('¿En quién usas ' + it.n + '?', x => !!stoneEvo(x, k), G.team.concat(G.reserve));
      if (!c) return;
      const to = stoneEvo(c, k).to;
      const ok = await ask(`¿Usar ${it.n} en ${nameOf(c)}?`, `<span class="evo-row">${pimg(c.sp, 72)}<b>→</b>${pimg(to, 72)}</span>${nameOf(c)} evolucionará en <b>${SPECIES[to].name}</b>. La piedra se gasta y no se puede deshacer.`, [{ v: false, t: 'Cancelar' }, { v: true, t: 'Evolucionar', primary: true }]);
      if (!ok) return;
      if (player.surf) { toast('Baja a tierra para hacerle evolucionar.'); return; }
      G.inv[k]--;
      if (G.reserve.includes(c)) { G.reserve.splice(G.reserve.indexOf(c), 1); G.team.unshift(c); if (G.team.length > 6) G.reserve.push(G.team.pop()); }
      closeMenu(); await evolve(c, to); return;
    }
    const filt = it.kind === 'revive' ? c => c.hp <= 0 : it.kind === 'heal' ? c => c.hp > 0 && c.hp < maxHP(c) : () => true;
    const c = await chooseCreature('¿En quién usas ' + it.n + '?', filt);
    if (!c) return;
    const msg = applyItem(k, c);
    if (!msg) { toast('No tendría ningún efecto.'); return; }
    G.inv[k]--; sfx(it.kind === 'level' ? 'lvl' : 'heal'); toast(msg); refreshHUD(); renderMenu(); saveGame();
    if (pendingEvos.length && !player.surf) { closeMenu(); processEvos(); }
  });
  body.querySelectorAll('.ccard').forEach(card => {
    const i = +card.dataset.i, where = card.dataset.w, list = where === 'team' ? G.team : G.reserve, c = list[i];
    card.querySelectorAll('[data-act]').forEach(el => {
      const a = el.dataset.act;
      if (a === 'noevo') el.onchange = () => { c.noEvo = !el.checked; toast(c.noEvo ? `${nameOf(c)} no evolucionará.` : `${nameOf(c)} podrá evolucionar.`); saveGame(); };
      else el.onclick = async () => {
        sfx('click');
        if (a === 'lead') { G.team.splice(i, 1); G.team.unshift(c); }
        else if (a === 'toBox') { if (player.surf && c === player.surf.c) { toast('No puedes guardar al Pokémon que te lleva.'); return; } G.team.splice(i, 1); G.reserve.push(c); }
        else if (a === 'toTeam') { if (G.team.length >= 6) return; G.reserve.splice(i, 1); G.team.push(c); }
        else if (a === 'release') { const ok = await ask('¿Liberar a ' + nameOf(c) + '?', 'Volverá a la naturaleza y no podrás recuperarlo.', [{ v: false, t: 'Cancelar' }, { v: true, t: 'Liberar', primary: true }]); if (!ok) return; G.reserve.splice(i, 1); }
        else if (a === 'evo') {
          if (!canEvolve(c)) return;
          if (player.surf) { toast('Baja a tierra para hacerle evolucionar.'); return; }
          if (where === 'box') { G.reserve.splice(i, 1); G.team.unshift(c); if (G.team.length > 6) G.reserve.push(G.team.pop()); }
          closeMenu(); await evolve(c, levelEvo(c).to); return;
        }
        if (!player.surf) setCompanion(leader());
        refreshHUD(); renderMenu(); saveGame();
      };
    });
  });
}

// ============================================================
//  Entrada
// ============================================================
addEventListener('keydown', e => {
  initAudio();
  const k = e.key.toLowerCase();
  if (k === 'tab') e.preventDefault();
  if (k === ' ') e.preventDefault();
  keys.add(k);
  if (e.repeat || state === 'title') return;
  if (!$('#help').hidden) { if (k === 'escape' || k === 'h') $('#help').hidden = true; return; }
  if (!$('#modal').hidden) return;
  if ((k === 'tab' || k === 'i') && state === 'explore') { $('#menu').hidden ? openMenu('team') : closeMenu(); return; }
  if (k === 'escape' && !$('#menu').hidden) { closeMenu(); return; }
  if (!$('#menu').hidden) return;
  if (k === 'h' && state === 'explore') { $('#help').hidden = false; return; }
  if (k === 'e') interact();
  if (k === 'r') ride();
  if (k === ' ') wantJump = true;
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', e => { initAudio(); if (cam.dragging == null) { cam.dragging = e.pointerId; cam.lx = e.clientX; cam.ly = e.clientY; cvs.setPointerCapture(e.pointerId); } });
cvs.addEventListener('pointermove', e => {
  if (cam.dragging !== e.pointerId) return;
  const dx = e.clientX - cam.lx, dy = e.clientY - cam.ly; cam.lx = e.clientX; cam.ly = e.clientY;
  if (state === 'explore') { cam.yaw -= dx * .006; cam.pitch = clamp(cam.pitch + dy * .004, -.15, 1.3); }
});
const endDrag = e => { if (cam.dragging === e.pointerId) cam.dragging = null; };
cvs.addEventListener('pointerup', endDrag); cvs.addEventListener('pointercancel', endDrag);
cvs.addEventListener('wheel', e => { e.preventDefault(); cam.dist = clamp(cam.dist * (1 + Math.sign(e.deltaY) * .1), 2.2, 16); }, { passive: false });
cvs.addEventListener('contextmenu', e => e.preventDefault());
{
  const jb = $('#joy'), knob = jb.querySelector('i');
  const upd = e => { const r = jb.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; } joy.x = dx; joy.y = dy; knob.style.transform = `translate(${dx * 38}px,${dy * 38}px)`; };
  jb.addEventListener('pointerdown', e => { initAudio(); joy.id = e.pointerId; jb.setPointerCapture(e.pointerId); upd(e); });
  jb.addEventListener('pointermove', e => { if (joy.id === e.pointerId) upd(e); });
  const end = e => { if (joy.id === e.pointerId) { joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; } };
  jb.addEventListener('pointerup', end); jb.addEventListener('pointercancel', end);
  $('#t-jump').onclick = () => wantJump = true;
  $('#t-act').onclick = () => interact();
  $('#t-ride').onclick = () => ride();
  $('#t-run').onclick = () => { touchRun = !touchRun; $('#t-run').classList.toggle('on', touchRun); };
  $('#t-menu').onclick = () => { if (state === 'explore') openMenu('team'); };
}

// ============================================================
//  Pantalla de título
// ============================================================
const titleModels = [];
const STARTERS = ['bulbasaur', 'charmander', 'squirtle'];
let hoverStarter = -1;
function setupTitle() {
  const cx = 8, cz = 14;
  STARTERS.forEach((sp, i) => {
    const m = buildPokemon(sp), x = cx + (i - 1) * 1.3, z = cz;
    m.position.set(x, groundY(x, z), z); scene.add(m); titleModels.push(m);
  });
  player.pos.set(cx, groundY(cx, cz - 2), cz - 2); player.mesh.visible = false;
  const y0 = groundY(cx, cz);
  camTarget.pos.set(cx, y0 + 1.2, cz + 4); camTarget.look.set(cx, y0 + .45, cz);
  cam.pos.copy(camTarget.pos).add(new V3(0, 3, 4)); cam.look.copy(camTarget.look);
  $('#starters').innerHTML = STARTERS.map((sp, i) => `<button class="starter panel" data-sp="${sp}" data-i="${i}"><span style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span class="nm">${SPECIES[sp].name}</span><span>${chips(SPECIES[sp].types)}</span></span><small>${SPECIES[sp].desc}</small></button>`).join('');
  document.querySelectorAll('.starter').forEach(b => {
    const i = +b.dataset.i;
    b.onmouseenter = b.onfocus = () => { if (hoverStarter !== i) cry(STARTERS[i]); hoverStarter = i; };
    b.onmouseleave = () => { hoverStarter = -1; };
    b.onclick = () => { initAudio(); store.del(SAVE_KEY); newGame(b.dataset.sp); beginGame(true); };
  });
  if (store.get(SAVE_KEY)) { $('#cont').hidden = false; $('#cont').onclick = () => { initAudio(); if (loadGame()) beginGame(false); else { $('#cont').hidden = true; toast('No se pudo cargar la partida guardada.'); } }; }
}
function updateTitle(dt) {
  titleModels.forEach((m, i) => {
    const on = hoverStarter === i;
    m.rotation.y = on ? m.rotation.y + dt * 2 : lerp(m.rotation.y, Math.sin(T * .5 + i) * .35, .05);
    animatePoke(m, T + i, on ? .5 : 0, false);
  });
  const cx = 8, cz = 14, y0 = groundY(cx, cz);
  camTarget.pos.set(cx + Math.sin(T * .18) * 1.2, y0 + 1.1, cz + 3.6); camTarget.look.set(cx, y0 + .4, cz);
}
function beginGame(isNew) {
  for (const m of titleModels) { scene.remove(m); disposeModel(m); } titleModels.length = 0;
  $('#title').hidden = true; $('#hud').hidden = false; $('#touch').hidden = !isTouch;
  player.mesh.visible = true;
  player.pos.set(G.pos[0], groundY(G.pos[0], G.pos[1]), G.pos[1]);
  if (WATER - player.pos.y > PHY.wade) { const l = nearestLand(player.pos); player.pos.copy(l); }
  for (const k of [...chunks.keys()]) unloadChunk(k);
  updateChunks(player.pos, true);
  for (const w of wilds.slice()) removeWild(w);
  companion.hidden = false; setCompanion(leader(), player.pos.clone().add(new V3(1.2, 0, -1.2)));
  cam.yaw = PI * .9; cam.pos.copy(player.pos).add(new V3(2, 3, 6));
  state = 'explore';
  for (let i = 0; i < 6; i++) { const a = rand(0, 6.28), d = rand(14, 35); spawnWild(player.pos.x + Math.cos(a) * d, player.pos.z + Math.sin(a) * d); }
  refreshHUD(); saveGame();
  if (isNew) {
    toast(`¡${nameOf(G.team[0])} se une a tu aventura!`, 3000); cry(G.team[0].sp);
    setTimeout(() => toast('Busca destellos en el suelo y cúrate en el Centro Pokémon.', 4200), 1800);
    if (!store.get('pokemon_help_seen')) { $('#help').hidden = false; store.set('pokemon_help_seen', true); }
  } else toast('Partida cargada. ¡Bienvenido de nuevo!');
}

// ============================================================
//  Bucle principal
// ============================================================
const clock = new THREE.Clock();
let hudTimer = 0, mapTimer = 0, saveTimer = 0, perf = { t: 0, n: 0, done: LOW };
function loop() {
  requestAnimationFrame(loop);
  const raw = clock.getDelta(), dt = Math.min(raw, .05); T += dt;
  // si va muy lento durante los primeros segundos de juego, propone el modo ligero
  if (!perf.done && state === 'explore') { perf.t += raw; perf.n++; if (perf.t > 6) { perf.done = true; if (perf.n / perf.t < 24) { store.set('pokemon_low', '1'); toast('Tu equipo va algo justo: la próxima vez el juego cargará en modo ligero.', 5000); } } }
  updateTweens(); updateDay(dt); updateBursts(dt);
  if (state === 'title') { updateTitle(dt); updateCamera(dt); updateChunks(player.pos, false); }
  else {
    if (state === 'explore') updatePlayer(dt);
    else if (player.surf && state === 'battle') { const s = player.surf; s.mesh.position.y = waterY(s.mesh.position.x, s.mesh.position.z); animatePoke(s.mesh, T, 0, false); s.mesh.updateMatrixWorld(true); player.pos.copy(s.mesh.userData.body.localToWorld(s.mesh.userData.seat.clone())); }
    poseTrainer(player.mesh, T, player.speed, !player.onGround && !player.surf, player.pose || (player.surf ? 'sit' : null));
    player.mesh.position.copy(player.pos); player.mesh.rotation.y = player.surf ? player.surf.heading : player.yaw;
    if (player.surf || player.pose === 'sit') player.mesh.position.y -= .78;
    updateCompanion(dt); updateWilds(dt); updateItems(dt); updateChunks(player.surf ? player.surf.pos : player.pos, false); updateCamera(dt);
    hudTimer -= dt; mapTimer -= dt; saveTimer -= dt;
    if (state === 'explore') {
      if (hudTimer <= 0) { hudTimer = .5; refreshHUD(); }
      if (mapTimer <= 0) { mapTimer = .12; drawMinimap(); }
      if (saveTimer <= 0) { saveTimer = 20; saveGame(); }
      updatePrompt(); updateStamina();
    } else $('#prompt').hidden = true;
  }
  for (const c of clouds) { c.position.x += dt * 3; const P = camera.position; if (c.position.x - P.x > 600) c.position.x -= 1200; if (c.position.x - P.x < -600) c.position.x += 1200; if (c.position.z - P.z > 600) c.position.z -= 1200; if (c.position.z - P.z < -600) c.position.z += 1200; }
  renderer.render(scene, camera);
}
{ const s = store.get('pokemon_sound'); if (s === false) soundOn = false; }
updateChunks(player.pos, true);
setupTitle();
addEventListener('beforeunload', () => { if (state !== 'title') saveGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state !== 'title') saveGame(); });
loop();
