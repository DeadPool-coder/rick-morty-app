'use strict';
// ============================================================
//  Kit de modelado procedural (todo se dibuja con geometría propia)
// ============================================================
const V3 = THREE.Vector3;
const PI = Math.PI;
const UG = {
  sph: new THREE.SphereGeometry(1, 32, 22),
  cone: new THREE.ConeGeometry(1, 1, 20),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  tor: new THREE.TorusGeometry(1, .22, 12, 36),
  box: new THREE.BoxGeometry(1, 1, 1)
};
const rockGeo = (() => {
  const g = new THREE.SphereGeometry(1, 20, 14), p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = fbm(v.x * 1.8 + 5, v.y * 1.8 + v.z * 1.6, 31, 3); v.multiplyScalar(.82 + n * .36); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
})();
function taperTube(pts, r0, r1, seg, rad, rFn) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2])));
  const fr = curve.computeFrenetFrames(seg, false), pos = [], nor = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, P = curve.getPointAt(t), N = fr.normals[i], B = fr.binormals[i], r = rFn ? rFn(t) : lerp(r0, r1, t);
    for (let j = 0; j <= rad; j++) {
      const a = j / rad * PI * 2, cx = -Math.cos(a), cy = Math.sin(a);
      const nx = cx * N.x + cy * B.x, ny = cx * N.y + cy * B.y, nz = cx * N.z + cy * B.z;
      pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz); nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < rad; j++) { const a = i * (rad + 1) + j, b = (i + 1) * (rad + 1) + j; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
  return { geo: g, curve };
}
function shapeGeo(pts, depth, smoothShape) {
  const s = new THREE.Shape();
  if (smoothShape) { s.moveTo(pts[0][0], pts[0][1]); s.splineThru(pts.slice(1).concat([pts[0]]).map(p => new THREE.Vector2(p[0], p[1]))); }
  else { s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); }
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * .4, bevelSize: depth * .4, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -depth / 2); g.computeVertexNormals(); return g;
}
function Kit() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const mats = new Map();
  const M = (c, o) => {
    if (c && c.isMaterial) return c;
    const key = c + '|' + (o ? JSON.stringify(o) : '');
    let m = mats.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .6, metalness: 0 }, o || {})); mats.set(key, m); }
    return m;
  };
  const ud = { legs: [], arms: [], wings: [], tails: [], flames: [], floats: [], auras: [], fins: [], body };
  const k = {
    root, body, ud, M,
    g(p, par, r) { const o = new THREE.Group(); if (p) o.position.set(p[0], p[1], p[2]); if (r) { o.rotation.set(r[0], r[1], r[2]); if (r[3]) o.rotation.order = r[3]; } (par || body).add(o); return o; },
    mesh(geo, c, p, s, r, par, o) {
      const m = new THREE.Mesh(geo, M(c, o));
      if (p) m.position.set(p[0], p[1], p[2]);
      if (s != null) { if (typeof s === 'number') m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]); }
      if (r) { m.rotation.set(r[0], r[1], r[2]); if (r[3]) m.rotation.order = r[3]; }
      m.castShadow = true; m.receiveShadow = true; (par || body).add(m); return m;
    },
    E(c, p, s, r, par, o) { return k.mesh(UG.sph, c, p, s, r, par, o); },
    C(c, p, s, r, par, o) { return k.mesh(UG.cone, c, p, s, r, par, o); },
    Y(c, p, s, r, par, o) { return k.mesh(UG.cyl, c, p, s, r, par, o); },
    T(c, p, s, r, par, o) { return k.mesh(UG.tor, c, p, s, r, par, o); },
    B(c, p, s, r, par, o) { return k.mesh(UG.box, c, p, s, r, par, o); },
    R(c, p, s, r, par, o) { return k.mesh(rockGeo, c, p, s, r, par, o); },
    tube(c, pts, r0, r1, par, o, rFn, noCap) {
      const { geo, curve } = taperTube(pts, r0, r1, 28, 14, rFn);
      const m = k.mesh(geo, c, null, null, null, par, Object.assign({ side: THREE.DoubleSide }, o || {}));
      if (!noCap) k.E(c, pts[pts.length - 1], rFn ? rFn(1) : r1, null, par, o);
      m.userData.curve = curve; return m;
    },
    shape(c, pts, depth, p, s, r, par, o, sm) { return k.mesh(shapeGeo(pts, depth, sm), c, p, s, r, par, Object.assign({ side: THREE.DoubleSide }, o || {})); }
  };
  return k;
}
// Ojos con esclerótica, iris, pupila y brillo
function eyes(k, par, x, y, z, w, h, o) {
  o = o || {};
  for (const s of [-1, 1]) {
    const g = k.g([s * x, y, z], par, [o.rx || 0, s * (o.ry != null ? o.ry : .4), s * (o.rz || 0)]);
    const d = w * .5;
    if (o.iris) {
      k.E(o.sclera || '#fbfbfb', [0, 0, 0], [w, h, d], null, g, { roughness: .25 });
      const ix = o.look ? -s * o.look * w : 0, iy = (o.irisY || 0) * h;
      k.E(o.iris, [ix, iy, d * .55], [w * (o.irisS || .64), h * (o.irisS || .64) * (o.irisH || 1), d * .6], null, g, { roughness: .2 });
      k.E('#09090d', [ix, iy, d * .82], [w * (o.pupS || .3), h * (o.pupS || .3) * (o.irisH || 1), d * .45], null, g, { roughness: .1 });
    } else k.E(o.color || '#15151c', [0, 0, 0], [w, h, d], null, g, { roughness: .12 });
    k.E('#ffffff', [w * .26, h * .3, d * .9], [w * .2, h * .17, d * .2], null, g, { roughness: .05, emissive: '#ffffff', emissiveIntensity: .5 });
    if (o.brow) k.E(o.brow, [0, h * .9, d * .15], [w * 1.2, h * .25, d * .8], [0, 0, s * (o.browA || .35)], g);
  }
}
function legQ(k, p, len, r, c, o) {
  o = o || {};
  const pv = k.g(p);
  k.E(c, [0, -len * .25, 0], [r * 1.3, len * .45, r * 1.3], null, pv);
  k.Y(c, [0, -len * .62, 0], [r, len * .6, r], null, pv);
  k.E(o.foot || c, [0, -len, r * .35], [r * 1.2, r * .6, r * 1.45], null, pv);
  if (o.claw) for (const i of [-1, 0, 1]) k.C(o.claw, [i * r * .55, -len - r * .15, r * 1.5], [r * .17, r * .38, r * .17], [PI / 2, 0, 0], pv);
  pv.userData.ph = o.ph || 0; k.ud.legs.push(pv); return pv;
}
function legB(k, p, len, r, c, o) {
  o = o || {};
  const pv = k.g(p);
  k.E(c, [0, -len * .35, 0], [r * 1.25, len * .62, r * 1.3], null, pv);
  k.E(o.foot || c, [0, -len, r * .5], [r * 1.05, r * .55, r * 1.6], null, pv);
  if (o.claw) for (const i of [-1, 0, 1]) k.C(o.claw, [i * r * .5, -len - r * .1, r * 2.0], [r * .16, r * .34, r * .16], [PI / 2, 0, 0], pv);
  pv.userData.ph = o.ph || 0; k.ud.legs.push(pv); return pv;
}
function arm(k, p, len, r, c, o) {
  o = o || {};
  const s = o.side || 1, pv = k.g(p, null, [0, 0, s * (o.splay != null ? o.splay : .35)]);
  k.E(c, [0, -len * .5, len * .12], [r, len * .56, r], [o.fwd != null ? o.fwd : .3, 0, 0], pv);
  k.E(o.hand || c, [0, -len * .95, len * .28], [r * 1.15, r, r * 1.15], null, pv);
  if (o.claw) for (const i of [-1, 0, 1]) k.C(o.claw, [i * r * .5, -len * .95 - r * .7, len * .28 + r * .5], [r * .15, r * .42, r * .15], [PI * .75, 0, 0], pv);
  pv.userData.side = s; k.ud.arms.push(pv); return pv;
}
function tailPivot(k, p, par) { const t = k.g(p, par); k.ud.tails.push(t); return t; }
const addMat = (c, op) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false });
function flame(k, par, p, s) {
  const g = k.g(p, par);
  const parts = [['#ff3d00', .7, [.95, 1.8, .95], .95], ['#ff9a1a', .85, [.62, 1.25, .62], .7], ['#fff3a8', .95, [.32, .7, .32], .48]];
  for (const [c, op, sc, y] of parts) { const m = new THREE.Mesh(UG.sph, addMat(c, op)); m.scale.set(sc[0] * s, sc[1] * s, sc[2] * s); m.position.y = y * s; g.add(m); }
  const tip = new THREE.Mesh(UG.cone, addMat('#ff5a10', .6)); tip.scale.set(s * .5, s * 1.5, s * .5); tip.position.y = s * 2.3; g.add(tip);
  g.userData.ph = ihash(k.ud.flames.length, 3, 9) * 6; k.ud.flames.push(g); return g;
}
function birdWing(k, p, side, len, wid, c, tip) {
  const pv = k.g(p);
  k.E(c, [side * len * .5, 0, -wid * .2], [len * .55, wid * .14, wid * .6], null, pv);
  k.E(tip || c, [side * len * .92, 0, -wid * .45], [len * .3, wid * .1, wid * .42], [0, side * .4, 0], pv);
  pv.userData.side = side; pv.userData.bird = true; k.ud.wings.push(pv); return pv;
}

// ============================================================
//  Modelos de cada Pokémon (frente = +z, arriba = +y)
// ============================================================
const BUILD = {
  bulbasaur(k) {
    const B = '#7fcfb0', D = '#3e9a83', G = '#55ad48', GD = '#2f7d34';
    k.E(B, [0, .42, -.02], [.4, .3, .48]);
    k.E(D, [.27, .52, .12], [.1, .06, .09], [0, 0, .6]); k.E(D, [-.25, .5, -.18], [.09, .06, .1], [0, 0, -.6]); k.E(D, [.14, .63, -.28], [.08, .04, .07]);
    const h = k.g([0, .56, .38]);
    k.E(B, [0, 0, 0], [.36, .27, .3], null, h); k.E(B, [0, -.07, .1], [.31, .19, .24], null, h);
    k.E(D, [0, .21, -.02], [.08, .05, .08], null, h); k.E(D, [.2, .13, .05], [.06, .04, .05], null, h); k.E(D, [-.18, .14, .07], [.05, .035, .05], null, h);
    for (const s of [-1, 1]) k.C(B, [s * .23, .2, -.04], [.065, .14, .05], [-.15, 0, -s * .55], h);
    eyes(k, h, .16, .05, .22, .085, .1, { iris: '#d63a3a', ry: .55, irisS: .7, pupS: .3, irisY: -.02 });
    k.E('#2b5d4f', [0, -.12, .33], [.17, .012, .03], null, h);
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .25, .3, sz * .24], .28, .095, B, { claw: '#ffffff', ph: ph[i++] });
    const bu = k.g([0, .73, -.1]); k.E(G, [0, 0, 0], [.3, .27, .31], null, bu);
    for (let j = 0; j < 6; j++) { const a = j / 6 * PI * 2; k.E(GD, [Math.sin(a) * .27, 0, Math.cos(a) * .28], [.025, .25, .1], [0, a, 0], bu); }
    k.C(G, [0, .29, 0], [.07, .12, .07], null, bu);
  },
  ivysaur(k) {
    const B = '#6cbfa6', D = '#357f6c';
    k.E(B, [0, .5, -.02], [.45, .33, .55]);
    k.E(D, [.3, .6, .15], [.1, .06, .09], [0, 0, .6]); k.E(D, [-.28, .58, -.2], [.1, .06, .1], [0, 0, -.6]);
    const h = k.g([0, .68, .45]);
    k.E(B, [0, 0, 0], [.36, .27, .32], null, h); k.E(B, [0, -.07, .12], [.31, .19, .25], null, h);
    k.E(D, [0, .2, 0], [.09, .05, .08], null, h);
    for (const s of [-1, 1]) k.C(B, [s * .24, .2, -.06], [.07, .16, .05], [-.2, 0, -s * .5], h);
    eyes(k, h, .16, .05, .23, .08, .09, { iris: '#c9333a', ry: .55, irisS: .72, pupS: .3, brow: D, browA: .25 });
    k.E('#2b5d4f', [0, -.12, .35], [.17, .012, .03], null, h);
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .29, .36, sz * .28], .34, .11, B, { claw: '#ffffff', ph: ph[i++] });
    k.Y('#7a5a34', [0, .9, -.1], [.07, .15, .07]);
    for (let j = 0; j < 4; j++) {
      const a = j * PI / 2 + PI / 4, lf = k.g([Math.sin(a) * .05, .92, Math.cos(a) * .05 - .1], null, [.25, a, 0, 'YXZ']);
      k.E('#3f9a3d', [0, 0, .36], [.15, .025, .38], null, lf); k.E('#2c7a2e', [0, .012, .36], [.015, .02, .36], null, lf);
    }
    k.E('#e96f96', [0, 1.1, -.1], [.17, .22, .17]); k.E('#c44a74', [0, 1.28, -.1], [.06, .06, .06]);
    for (let j = 0; j < 3; j++) { const a = j / 3 * PI * 2; k.C('#3f9a3d', [Math.sin(a) * .12, 1.0, Math.cos(a) * .12 - .1], [.06, .16, .03], [0, a, 0]); }
  },
  venusaur(k) {
    const B = '#5fae9a', D = '#2f7a68';
    k.E(B, [0, .62, 0], [.62, .42, .72]);
    for (const p of [[.42, .8, .2], [-.4, .78, -.25], [.2, .95, -.4], [-.3, .9, .3]]) k.E(D, p, [.13, .06, .12]);
    const h = k.g([0, .78, .66]);
    k.E(B, [0, 0, 0], [.44, .3, .36], null, h); k.E(B, [0, -.08, .16], [.38, .2, .27], null, h);
    k.E(D, [0, .22, 0], [.12, .05, .1], null, h);
    for (const s of [-1, 1]) k.C(B, [s * .3, .22, -.05], [.08, .17, .06], [-.2, 0, -s * .5], h);
    eyes(k, h, .2, .04, .28, .085, .07, { iris: '#c13a3a', ry: .6, irisS: .7, pupS: .32, brow: D, browA: .4 });
    k.E('#244f43', [0, -.14, .42], [.24, .014, .03], null, h);
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .42, .48, sz * .38], .46, .17, B, { claw: '#f5f5f5', ph: ph[i++] });
    k.Y('#8a5a33', [0, 1.12, -.05], [.14, .35, .14]);
    for (let j = 0; j < 5; j++) {
      const a = j / 5 * PI * 2, lf = k.g([0, 1.05, -.05], null, [.2, a, 0, 'YXZ']);
      k.E('#3d8f3a', [0, 0, .55], [.22, .03, .6], null, lf); k.E('#2b6e2c', [0, .015, .55], [.02, .02, .58], null, lf);
    }
    for (let j = 0; j < 5; j++) {
      const a = j / 5 * PI * 2 + .6, pt = k.g([0, 1.32, -.05], null, [-.12, a, 0, 'YXZ']);
      k.E('#f07a91', [0, 0, .42], [.3, .05, .46], null, pt);
      k.E('#ffffff', [.08, .03, .5], [.05, .02, .05], null, pt); k.E('#ffffff', [-.09, .03, .35], [.04, .02, .04], null, pt);
    }
    k.E('#f3d34a', [0, 1.38, -.05], [.16, .1, .16]);
  },
  charmander(k) {
    const O = '#f58b3c', Y = '#f7d88a';
    k.E(O, [0, .52, 0], [.25, .3, .22]); k.E(Y, [0, .48, .1], [.19, .24, .14]);
    const h = k.g([0, .98, .04]);
    k.E(O, [0, 0, 0], [.26, .25, .24], null, h); k.E(O, [0, -.06, .16], [.19, .14, .15], null, h);
    eyes(k, h, .12, .04, .19, .06, .085, { iris: '#22437e', irisS: .78, pupS: .36, ry: .38, irisH: 1.05 });
    for (const s of [-1, 1]) k.E('#7a3b18', [s * .035, -.03, .305], .012, null, h);
    k.E('#8a3c1c', [0, -.12, .27], [.12, .01, .03], null, h);
    for (const s of [-1, 1]) legB(k, [s * .13, .32, 0], .2, .09, O, { claw: '#ffffff', ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .22, .68, .05], .2, .055, O, { side: s, splay: .3, fwd: .5, claw: '#ffffff' });
    const tp = tailPivot(k, [0, .35, -.18]);
    k.tube(O, [[0, 0, 0], [0, -.08, -.18], [0, -.02, -.36], [0, .14, -.5], [0, .3, -.55]], .08, .045, tp);
    flame(k, tp, [0, .33, -.55], .07);
  },
  charmeleon(k) {
    const R = '#e0553b', Y = '#f2cf8a';
    k.E(R, [0, .76, 0], [.24, .4, .21]); k.E(Y, [0, .72, .09], [.18, .32, .14]);
    k.Y(R, [0, 1.15, .03], [.11, .2, .11]);
    const h = k.g([0, 1.36, .08]);
    k.E(R, [0, 0, 0], [.22, .21, .23], null, h); k.E(R, [0, -.05, .2], [.15, .12, .2], null, h);
    k.C(R, [0, .12, -.22], [.06, .24, .06], [-1.95, 0, 0], h);
    eyes(k, h, .12, .05, .17, .055, .07, { iris: '#2a6a8a', irisS: .75, pupS: .33, ry: .45, brow: R, browA: .35 });
    for (const s of [-1, 1]) k.E('#6a2a14', [s * .035, -.02, .39], .012, null, h);
    k.E('#7a2c18', [0, -.11, .33], [.12, .01, .05], null, h);
    for (const s of [-1, 1]) legB(k, [s * .13, .45, 0], .33, .1, R, { claw: '#ffffff', ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .22, 1.0, .05], .3, .055, R, { side: s, splay: .28, fwd: .5, claw: '#ffffff' });
    const tp = tailPivot(k, [0, .45, -.18]);
    k.tube(R, [[0, 0, 0], [0, -.12, -.25], [0, -.06, -.5], [0, .14, -.68], [0, .34, -.72]], .09, .045, tp);
    flame(k, tp, [0, .37, -.72], .08);
  },
  charizard(k) {
    const O = '#f0893a', Y = '#f3d68c', W = '#2e7fa6';
    k.E(O, [0, 1.0, 0], [.36, .5, .32]); k.E(Y, [0, .95, .14], [.27, .42, .2]);
    k.tube(O, [[0, 1.35, .05], [0, 1.6, .12], [0, 1.78, .2]], .15, .11);
    const h = k.g([0, 1.88, .26]);
    k.E(O, [0, 0, 0], [.21, .19, .23], null, h); k.E(O, [0, -.05, .22], [.15, .11, .19], null, h);
    for (const s of [-1, 1]) k.C(O, [s * .1, .13, -.18], [.04, .22, .04], [-1.9, 0, -s * .2], h);
    eyes(k, h, .11, .05, .16, .055, .065, { iris: '#1f5a7a', irisS: .78, pupS: .34, ry: .5, brow: O, browA: .3 });
    for (const s of [-1, 1]) k.E('#5a2410', [s * .035, -.01, .42], .013, null, h);
    k.E('#7a2c18', [0, -.11, .35], [.12, .01, .06], null, h);
    for (const s of [-1, 1]) legB(k, [s * .17, .62, 0], .5, .14, O, { claw: '#ffffff', ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .3, 1.3, .1], .36, .065, O, { side: s, splay: .3, fwd: .6, claw: '#ffffff' });
    const wingPts = [[0, 0], [.35, .28], [.8, .64], [1.28, .88], [1.22, .55], [1.06, .3], [.96, .06], [.76, .14], [.6, -.1], [.42, .0], [.24, -.17], [0, -.12]];
    for (const s of [-1, 1]) {
      const wg = k.g([s * .16, 1.38, -.22], null, [0, -s * .55, 0]);
      const inner = k.g(null, wg); inner.scale.x = s;
      k.shape(W, wingPts, .015, [0, 0, 0], 1, null, inner);
      k.tube(O, [[0, 0, 0], [.4, .32, 0], [.82, .66, 0], [1.28, .88, 0]], .045, .02, inner);
      wg.userData.side = s; wg.userData.baseY = -s * .55; wg.userData.membrane = true; k.ud.wings.push(wg);
    }
    const tp = tailPivot(k, [0, .65, -.26]);
    k.tube(O, [[0, 0, 0], [0, -.25, -.35], [0, -.25, -.75], [0, 0, -1.05], [0, .3, -1.15]], .15, .06, tp);
    flame(k, tp, [0, .36, -1.15], .11);
  },
  squirtle(k) {
    const B = '#86c9e8', S = '#b06b35', SR = '#f1e3c0', P = '#f2d48e';
    k.E(B, [0, .42, 0], [.22, .26, .2]);
    k.E(P, [0, .42, .1], [.19, .23, .13]);
    for (const y of [.36, .46]) k.E('#b8955a', [0, y, .225], [.15, .008, .02]);
    k.E(S, [0, .45, -.07], [.25, .28, .2]);
    k.T(SR, [0, .45, -.02], [.245, .28, .5]);
    for (const p of [[0, .52, -.26], [.12, .42, -.24], [-.12, .42, -.24], [0, .34, -.25]]) k.E('#8f5427', p, [.07, .06, .02]);
    const h = k.g([0, .82, .06]);
    k.E(B, [0, 0, 0], [.25, .23, .23], null, h); k.E(B, [0, -.05, .1], [.2, .16, .18], null, h);
    eyes(k, h, .12, .05, .18, .07, .09, { iris: '#7a2a18', irisS: .72, pupS: .34, ry: .42 });
    k.E('#3b6a80', [0, -.1, .27], [.12, .01, .03], null, h);
    for (const s of [-1, 1]) legB(k, [s * .12, .22, 0], .14, .085, B, { ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .21, .58, .05], .18, .055, B, { side: s, splay: .45, fwd: .4 });
    const tp = tailPivot(k, [0, .28, -.2]);
    k.tube(B, [[0, 0, 0], [0, -.03, -.12], [0, .05, -.22], [0, .16, -.2], [0, .15, -.12], [0, .08, -.13]], .06, .03, tp);
  },
  wartortle(k) {
    const B = '#7a97dc', S = '#9a5d31', SR = '#f1e3c0', P = '#f2d48e', F = '#eef0ff';
    k.E(B, [0, .55, 0], [.24, .32, .22]); k.E(P, [0, .55, .11], [.2, .28, .14]);
    for (const y of [.46, .58]) k.E('#b8955a', [0, y, .245], [.16, .008, .02]);
    k.E(S, [0, .58, -.08], [.28, .34, .22]); k.T(SR, [0, .58, -.03], [.27, .33, .5]);
    const h = k.g([0, 1.02, .07]);
    k.E(B, [0, 0, 0], [.22, .21, .21], null, h); k.E(B, [0, -.05, .1], [.17, .14, .16], null, h);
    eyes(k, h, .11, .05, .16, .06, .075, { iris: '#5a2a1a', irisS: .72, pupS: .34, ry: .45, brow: '#5f7cc0', browA: .2 });
    for (const s of [-1, 1]) k.C('#ffffff', [s * .04, -.11, .24], [.012, .03, .012], [PI, 0, 0], h);
    for (const s of [-1, 1]) k.tube(F, [[s * .17, .08, -.02], [s * .27, .2, -.08], [s * .3, .34, -.18], [s * .22, .4, -.26], [s * .17, .33, -.24]], .055, .025, h);
    for (const s of [-1, 1]) legB(k, [s * .13, .3, 0], .22, .09, B, { ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .23, .75, .05], .24, .055, B, { side: s, splay: .4, fwd: .4 });
    const tp = tailPivot(k, [0, .35, -.24]);
    k.tube(F, [[0, 0, 0], [0, .05, -.25], [0, .3, -.4], [0, .55, -.3], [0, .5, -.15]], .13, .05, tp);
    k.tube('#c3cdf6', [[.05, .05, -.05], [.06, .12, -.28], [.05, .36, -.4], [.03, .52, -.28]], .03, .015, tp);
  },
  blastoise(k) {
    const B = '#5b88c9', S = '#8a5a32', SR = '#f1e3c0', P = '#f2d48e';
    k.E(B, [0, .78, 0], [.42, .5, .38]); k.E(P, [0, .75, .2], [.33, .42, .2]);
    for (const y of [.6, .76, .92]) k.E('#b8955a', [0, y, .385], [.24, .01, .03]);
    k.E(S, [0, .82, -.12], [.48, .55, .38]); k.T(SR, [0, .82, -.04], [.47, .54, .55]);
    for (const p of [[0, .95, -.47], [.22, .78, -.42], [-.22, .78, -.42], [0, .6, -.45]]) k.E('#6f4524', p, [.11, .09, .03]);
    for (const s of [-1, 1]) {
      k.Y('#c4c8ce', [s * .27, 1.28, .0], [.085, .5, .085], [PI / 2 - .4, 0, 0], null, { metalness: .5, roughness: .35 });
      k.T('#5e6470', [s * .27, 1.38, .23], [.085, .085, .25], [PI / 2 - .4, 0, 0], null, { metalness: .5, roughness: .4 });
      k.E('#9aa0a8', [s * .27, 1.17, -.22], [.14, .12, .14], null, null, { metalness: .4, roughness: .4 });
    }
    const h = k.g([0, 1.28, .24]);
    k.E(B, [0, 0, 0], [.24, .2, .24], null, h); k.E(B, [0, -.05, .12], [.2, .14, .18], null, h);
    for (const s of [-1, 1]) k.C(B, [s * .17, .14, -.05], [.05, .1, .03], [-.3, 0, -s * .6], h);
    eyes(k, h, .11, .04, .18, .06, .06, { iris: '#6a2a1a', irisS: .72, pupS: .34, ry: .45, brow: '#3f6aa8', browA: .4 });
    k.E('#2e4f80', [0, -.1, .29], [.14, .01, .03], null, h);
    for (const s of [-1, 1]) legB(k, [s * .22, .42, 0], .32, .15, B, { claw: '#f3f3f3', ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .4, 1.05, .1], .4, .1, B, { side: s, splay: .45, fwd: .4, claw: '#f3f3f3' });
    const tp = tailPivot(k, [0, .4, -.42]); k.tube(B, [[0, 0, 0], [0, -.06, -.12], [0, -.04, -.2]], .07, .035, tp);
    k.ud.seat = new V3(0, 1.4, -.22);
  },
  pikachu(k) {
    const Y = '#f6d02e', BR = '#7b4a1f', RC = '#e5453a', BL = '#1d1d1d';
    k.E(Y, [0, .42, 0], [.22, .27, .19]);
    k.E(BR, [0, .56, -.16], [.15, .028, .05], [-.3, 0, 0]); k.E(BR, [0, .45, -.185], [.14, .028, .05], [-.15, 0, 0]);
    const h = k.g([0, .86, .04]);
    k.E(Y, [0, 0, 0], [.26, .23, .22], null, h);
    for (const s of [-1, 1]) k.E(RC, [s * .17, -.07, .13], [.06, .06, .03], [0, s * .65, 0], h);
    for (const s of [-1, 1]) { const ep = k.g([s * .12, .15, -.03], h, [-.1, 0, -s * .32]); k.E(Y, [0, .24, 0], [.06, .25, .045], null, ep); k.E(BL, [0, .41, 0], [.052, .1, .042], null, ep); }
    eyes(k, h, .1, .04, .185, .055, .065, { ry: .45 });
    k.E(BL, [0, -.02, .222], [.014, .01, .01], null, h);
    for (const s of [-1, 1]) k.E('#5a2a12', [s * .025, -.07, .205], [.025, .006, .01], [0, 0, s * .4], h);
    for (const s of [-1, 1]) legB(k, [s * .1, .2, .02], .14, .07, Y, { ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .17, .58, .07], .14, .045, Y, { side: s, splay: .4, fwd: .7 });
    const tp = tailPivot(k, [0, .3, -.16]);
    const bolt = [[0, 0], [.05, .12], [-.03, .17], [.1, .32], [.02, .36], [.16, .55], [.36, .64], [.22, .43], [.29, .4], [.15, .21], [.21, .19], [.07, .02]];
    k.shape(Y, bolt, .04, [0, 0, 0], 1, [0, PI / 2, 0], tp);
    k.shape(BR, [[0, 0], [.05, .12], [.0, .14], [-.03, .05]], .045, [0, 0, 0], 1, [0, PI / 2, 0], tp);
  },
  raichu(k) {
    const O = '#e9a23d', C = '#f5e3b3', BRN = '#6b3d1a', BL = '#1e1e1e';
    k.E(O, [0, .45, 0], [.26, .32, .23]); k.E(C, [0, .42, .1], [.2, .25, .15]);
    const h = k.g([0, .9, .04]);
    k.E(O, [0, 0, 0], [.25, .22, .21], null, h);
    for (const s of [-1, 1]) k.E('#f7d33c', [s * .17, -.07, .12], [.06, .06, .03], [0, s * .65, 0], h);
    for (const s of [-1, 1]) {
      const ep = k.g([s * .15, .13, -.03], h, [-.15, 0, -s * .7]);
      k.E(BRN, [0, .2, 0], [.1, .22, .03], null, ep); k.E('#f0c36a', [0, .2, .015], [.07, .18, .02], null, ep);
      k.tube(BRN, [[0, .38, 0], [s * .05, .45, -.03], [s * .02, .5, -.06]], .03, .012, ep);
    }
    eyes(k, h, .1, .04, .18, .055, .065, { ry: .45 });
    k.E(BL, [0, -.02, .215], [.014, .01, .01], null, h);
    for (const s of [-1, 1]) legB(k, [s * .12, .22, .02], .17, .08, O, { foot: BRN, ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .2, .62, .07], .17, .05, O, { side: s, splay: .4, fwd: .7, hand: BRN });
    const tp = tailPivot(k, [0, .3, -.2]);
    k.tube(BL, [[0, 0, 0], [0, -.08, -.25], [0, .0, -.55], [0, .25, -.75], [0, .45, -.8]], .025, .015, tp);
    k.shape('#f7d33c', [[0, 0], [.1, .08], [.04, .1], [.15, .2], [.05, .22], [.18, .34], [-.04, .2], [.02, .18], [-.06, .08], [.0, .06]], .03, [0, .45, -.8], 1, [0, PI / 2, 0], tp);
  },
  pidgey(k) {
    const Bn = '#c28a4c', Cr = '#f3e2bd', Dk = '#3a2a1f', Pk = '#dca29a';
    k.E(Bn, [0, .35, 0], [.2, .19, .25]); k.E(Cr, [0, .32, .07], [.16, .15, .18]);
    const h = k.g([0, .55, .14]);
    k.E(Bn, [0, 0, 0], .14, null, h); k.E(Cr, [0, -.03, .06], [.11, .1, .1], null, h);
    k.C('#6a6a72', [0, -.02, .17], [.035, .09, .035], [PI / 2, 0, 0], h);
    for (const s of [-1, 1]) k.E(Dk, [s * .09, .02, .075], [.02, .025, .06], [0, s * .6, 0], h);
    eyes(k, h, .085, .03, .09, .035, .04, { ry: .9 });
    for (const i of [-1, 1]) k.C(Bn, [i * .03, .14, -.05], [.03, .1, .02], [-.6, 0, -i * .2], h);
    for (const s of [-1, 1]) birdWing(k, [s * .15, .42, -.02], s, .26, .3, Bn, '#8a5a2e');
    for (const i of [-1, 0, 1]) k.E(Bn, [i * .06, .33, -.3], [.05, .02, .12], [0, i * .3, 0]);
    for (const s of [-1, 1]) { const pv = k.g([s * .06, .18, 0]); k.Y(Pk, [0, -.06, 0], [.015, .12, .015], null, pv); for (const i of [-1, 0, 1]) k.Y(Pk, [i * .012, -.12, .03], [.008, .06, .008], [PI / 2, i * .4, 0], pv); pv.userData.ph = s > 0 ? 0 : PI; k.ud.legs.push(pv); }
  },
  pidgeotto(k) {
    const Bn = '#b77c40', Cr = '#f3e2bd', R = '#d8473a', Yw = '#f3c84a', Pk = '#dca29a';
    k.E(Bn, [0, .55, 0], [.26, .26, .34]); k.E(Cr, [0, .5, .1], [.2, .2, .24]);
    const h = k.g([0, .85, .2]);
    k.E(Bn, [0, 0, 0], .17, null, h); k.E(Cr, [0, -.04, .07], [.13, .12, .12], null, h);
    k.C('#6a6a72', [0, -.03, .2], [.04, .11, .04], [PI / 2, 0, 0], h);
    eyes(k, h, .1, .03, .11, .04, .04, { ry: .9, brow: '#2a1a12', browA: .3 });
    const cr = [[0, .15, -.02], [0, .32, -.15], [0, .3, -.35], [0, .2, -.5]];
    k.tube(R, cr, .05, .012, h); k.tube(Yw, cr.map(p => [.03, p[1] - .03, p[2] + .02]), .04, .01, h); k.tube(R, cr.map(p => [-.03, p[1] - .05, p[2] + .04]), .035, .01, h);
    for (const s of [-1, 1]) birdWing(k, [s * .2, .65, -.02], s, .45, .45, Bn, '#7a4a22');
    for (const [i, c] of [[-1, R], [0, Yw], [1, R]]) k.E(c, [i * .07, .48, -.42], [.06, .02, .2], [0, i * .25, 0]);
    for (const s of [-1, 1]) { const pv = k.g([s * .08, .3, 0]); k.Y(Pk, [0, -.1, 0], [.02, .2, .02], null, pv); for (const i of [-1, 0, 1]) k.Y(Pk, [i * .015, -.2, .04], [.01, .08, .01], [PI / 2, i * .4, 0], pv); pv.userData.ph = s > 0 ? 0 : PI; k.ud.legs.push(pv); }
  },
  pidgeot(k) {
    const Bn = '#c08850', Cr = '#f5e6c6', R = '#d8473a', Yw = '#f3c84a', Pk = '#dca29a';
    k.E(Bn, [0, .62, 0], [.3, .3, .4]); k.E(Cr, [0, .57, .12], [.24, .24, .28]);
    const h = k.g([0, .98, .26]);
    k.E(Bn, [0, 0, 0], .19, null, h); k.E(Cr, [0, -.04, .08], [.14, .13, .13], null, h);
    k.C('#6a6a72', [0, -.03, .22], [.045, .12, .045], [PI / 2, 0, 0], h);
    eyes(k, h, .11, .03, .12, .045, .045, { ry: .9, brow: '#2a1a12', browA: .35 });
    for (let i = 0; i < 4; i++) {
      const c = i % 2 ? Yw : R, o = (i - 1.5) * .03;
      k.tube(c, [[o, .16, -.02], [o, .35, -.2], [o * 2, .32, -.5], [o * 3, .15, -.75], [o * 3, -.05, -.85]], .05 - i * .006, .01, h);
    }
    for (const s of [-1, 1]) birdWing(k, [s * .24, .74, -.02], s, .6, .55, Bn, '#7a4a22');
    for (let i = -2; i <= 2; i++) k.E(i % 2 ? Yw : R, [i * .08, .55, -.55], [.06, .02, .3], [0, i * .2, 0]);
    for (const s of [-1, 1]) { const pv = k.g([s * .1, .33, 0]); k.Y(Pk, [0, -.11, 0], [.022, .22, .022], null, pv); for (const i of [-1, 0, 1]) k.Y(Pk, [i * .018, -.22, .045], [.011, .09, .011], [PI / 2, i * .4, 0], pv); pv.userData.ph = s > 0 ? 0 : PI; k.ud.legs.push(pv); }
  },
  rattata(k) {
    const P = '#9e6cbb', C = '#efdcb7', Pk = '#e6a6b0';
    k.E(P, [0, .22, 0], [.16, .14, .24]); k.E(C, [0, .17, .05], [.12, .1, .18]);
    const h = k.g([0, .28, .22]);
    k.E(P, [0, 0, 0], [.12, .11, .13], null, h); k.E(P, [0, -.03, .1], [.07, .06, .08], null, h);
    k.E(Pk, [0, -.01, .18], .018, null, h);
    for (const s of [-1, 1]) k.B('#ffffff', [s * .012, -.08, .15], [.02, .04, .012], null, h);
    for (const s of [-1, 1]) for (const a of [-.15, 0, .15]) k.Y('#f3ecf5', [s * .08, -.03 + a * .1, .12], [.003, .12, .003], [0, 0, s * (PI / 2 + a)], h);
    for (const s of [-1, 1]) { k.E(P, [s * .09, .1, -.02], [.065, .075, .02], [0, s * .3, 0], h); k.E(Pk, [s * .09, .1, -.005], [.045, .055, .01], [0, s * .3, 0], h); }
    eyes(k, h, .07, .03, .085, .035, .04, { iris: '#c8282f', irisS: .85, pupS: .35, ry: .65 });
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .1, .13, sz * .13], .11, .035, P, { foot: Pk, ph: ph[i++] });
    const tp = tailPivot(k, [0, .2, -.22]);
    k.tube(P, [[0, 0, 0], [0, .02, -.15], [0, .1, -.25], [0, .2, -.22], [0, .18, -.15]], .022, .012, tp);
  },
  raticate(k) {
    const Bn = '#c99460', C = '#efdcb7', Dk = '#6e4a2a';
    k.E(Bn, [0, .36, 0], [.24, .22, .34]); k.E(C, [0, .3, .08], [.18, .15, .25]);
    const h = k.g([0, .5, .3]);
    k.E(Bn, [0, 0, 0], [.17, .15, .17], null, h); k.E(C, [0, -.05, .12], [.11, .09, .1], null, h);
    k.E('#3a2a20', [0, -.01, .22], .022, null, h);
    for (const s of [-1, 1]) k.B('#fff8e8', [s * .018, -.12, .19], [.03, .09, .015], null, h);
    for (const s of [-1, 1]) for (const a of [-.15, 0, .15]) k.Y('#ffffff', [s * .12, -.05 + a * .1, .15], [.005, .2, .005], [0, 0, s * (PI / 2 + a)], h);
    for (const s of [-1, 1]) { k.E(Bn, [s * .12, .12, -.04], [.06, .07, .02], [0, s * .4, 0], h); k.E(Dk, [s * .12, .12, -.025], [.04, .05, .01], [0, s * .4, 0], h); }
    eyes(k, h, .09, .04, .12, .04, .045, { iris: '#b5202a', irisS: .85, pupS: .35, ry: .6, brow: Dk, browA: .4 });
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .15, .22, sz * .18], .2, .05, Bn, { foot: '#f0c9a0', ph: ph[i++] });
    const tp = tailPivot(k, [0, .32, -.32]);
    k.tube('#9a6a3a', [[0, 0, 0], [0, .0, -.2], [0, .1, -.38], [0, .25, -.4], [0, .3, -.3]], .03, .015, tp);
  },
  sandshrew(k) {
    const Y = '#e1c06a', Cr = '#f6ecca', Bn = '#a9813e';
    k.E(Y, [0, .32, 0], [.22, .25, .21]); k.E(Cr, [0, .3, .1], [.17, .2, .13]);
    for (const y of [.28, .38, .48]) k.E(Bn, [0, y, -.16], [.18, .01, .08], [-.3, 0, 0]);
    for (const x of [-.06, .06]) k.E(Bn, [x, .38, -.2], [.01, .14, .03]);
    const h = k.g([0, .62, .06]);
    k.E(Y, [0, 0, 0], [.15, .14, .14], null, h); k.E(Y, [0, -.04, .11], [.07, .06, .07], null, h);
    k.E('#3a2a1a', [0, -.03, .18], .015, null, h);
    for (const s of [-1, 1]) k.C(Y, [s * .1, .11, -.03], [.04, .07, .02], [0, 0, -s * .5], h);
    eyes(k, h, .07, .03, .11, .035, .045, { ry: .5 });
    for (const s of [-1, 1]) legB(k, [s * .1, .15, .02], .1, .07, Y, { claw: '#ffffff', ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .19, .4, .08], .13, .045, Y, { side: s, splay: .5, fwd: .7, claw: '#ffffff' });
    const tp = tailPivot(k, [0, .14, -.18]); k.C(Y, [0, -.03, -.06], [.05, .12, .05], [-1.9, 0, 0], tp);
  },
  sandslash(k) {
    const Y = '#d8a947', Cr = '#f1e2bb', Bn = '#8b5a2b', Tan = '#e7c98a';
    k.E(Y, [0, .48, 0], [.28, .32, .26]); k.E(Cr, [0, .45, .12], [.22, .26, .16]);
    const h = k.g([0, .86, .14]);
    k.E(Y, [0, 0, 0], [.17, .15, .17], null, h); k.E(Y, [0, -.04, .13], [.08, .07, .09], null, h);
    k.E('#3a2a1a', [0, -.03, .22], .016, null, h);
    eyes(k, h, .08, .03, .13, .035, .045, { ry: .5, brow: Bn, browA: .3 });
    for (let r = 0; r < 4; r++) for (let c = -2; c <= 2; c++) {
      if (r === 3 && Math.abs(c) === 2) continue;
      const g = k.g([c * .1, .35 + r * .17, -.2 + r * .02], null, [-.9 - r * .25, c * .3, 0, 'YXZ']);
      k.C(Bn, [0, .12, 0], [.06, .26, .06], null, g); k.C(Tan, [0, .27, 0], [.025, .06, .025], null, g);
    }
    for (const s of [-1, 1]) legB(k, [s * .13, .24, .02], .2, .08, Y, { claw: '#ffffff', ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .25, .62, .08], .22, .055, Y, { side: s, splay: .5, fwd: .7, claw: '#ffffff' });
  },
  vulpix(k) {
    const R = '#d4633b', O = '#f39a4e', Cr = '#f3d9b0', Bn = '#6e3a22';
    k.E(R, [0, .3, 0], [.14, .13, .25]); k.E(Cr, [0, .28, .17], [.1, .1, .08]);
    const h = k.g([0, .46, .25]);
    k.E(R, [0, 0, 0], [.13, .12, .13], null, h); k.E(R, [0, -.04, .1], [.07, .06, .09], null, h);
    k.E(Bn, [0, -.02, .19], .016, null, h);
    for (const s of [-1, 1]) { k.C(R, [s * .08, .14, -.03], [.06, .15, .03], [0, 0, -s * .35], h); k.C(Bn, [s * .08, .13, -.01], [.035, .1, .015], [0, 0, -s * .35], h); }
    for (let i = 0; i < 3; i++) k.tube(O, [[(i - 1) * .04, .1, .08], [(i - 1) * .06, .17, .04], [(i - 1) * .08, .17, -.04], [(i - 1) * .06, .12, -.05]], .025, .012, h);
    eyes(k, h, .07, .03, .1, .035, .045, { iris: '#7a3a1a', irisS: .85, pupS: .35, ry: .55 });
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .08, .2, sz * .14], .2, .03, R, { foot: Bn, ph: ph[i++] });
    const tp = tailPivot(k, [0, .32, -.24]);
    for (let j = 0; j < 6; j++) {
      const a = (j - 2.5) * .3;
      k.tube(R, [[0, 0, 0], [Math.sin(a) * .08, .08, -.12], [Math.sin(a) * .16, .25, -.18], [Math.sin(a) * .18, .38, -.08], [Math.sin(a) * .12, .36, 0]], .04, .03, tp, null, null, true);
      k.E(O, [Math.sin(a) * .12, .36, 0], .045, null, tp);
    }
  },
  ninetales(k) {
    const G = '#f2e0a6', O = '#f1a24a', Rd = '#c93a2e';
    k.E(G, [0, .55, 0], [.2, .19, .4]);
    for (let i = 0; i < 7; i++) { const a = i / 7 * PI * 2; k.E(G, [Math.cos(a) * .12, .62 + Math.sin(a) * .1, .32], [.08, .1, .08]); }
    const h = k.g([0, .82, .4]);
    k.E(G, [0, 0, 0], [.14, .13, .15], null, h); k.E(G, [0, -.04, .14], [.07, .06, .11], null, h);
    k.E('#5a3a22', [0, -.02, .25], .016, null, h);
    for (const s of [-1, 1]) k.C(G, [s * .08, .15, -.03], [.05, .16, .03], [0, 0, -s * .3], h);
    for (let i = 0; i < 3; i++) k.tube(G, [[(i - 1) * .04, .1, .02], [(i - 1) * .06, .18, -.12], [(i - 1) * .1, .14, -.32]], .04, .01, h);
    eyes(k, h, .07, .03, .11, .035, .04, { iris: Rd, irisS: .85, pupS: .35, ry: .6, rz: .2 });
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .1, .42, sz * .26], .42, .04, G, { ph: ph[i++] });
    const tp = tailPivot(k, [0, .58, -.38]);
    for (let j = 0; j < 9; j++) {
      const a = (j - 4) * .2, sx = Math.sin(a);
      k.tube(G, [[0, 0, 0], [sx * .1, .1, -.2], [sx * .3, .3, -.45], [sx * .45, .5, -.55], [sx * .5, .7, -.5]], .055, .03, tp, null, null, true);
      k.E(O, [sx * .5, .7, -.5], .05, null, tp);
    }
  },
  geodude(k) {
    const Gr = '#9b968c', Dk = '#6e6a62';
    k.R(Gr, [0, .4, 0], [.36, .33, .33]);
    for (const s of [-1, 1]) k.R(Dk, [s * .12, .52, .24], [.12, .06, .07], [0, 0, s * .25]);
    eyes(k, null, .11, .43, .28, .045, .03, { color: '#141414', ry: .3 });
    k.E('#3a3631', [0, .3, .3], [.1, .018, .03]);
    for (const s of [-1, 1]) {
      const a = k.g([s * .32, .42, 0]);
      k.R(Gr, [s * .12, 0, 0], [.12, .1, .1], null, a); k.R(Gr, [s * .28, .06, .07], [.11, .13, .11], null, a); k.R(Gr, [s * .36, .14, .16], [.12, .12, .12], null, a);
      for (let f = 0; f < 4; f++) k.R(Gr, [s * (.3 + f * .03), .14 + (f - 1.5) * .03, .27], .04, null, a);
      a.userData.side = s; a.userData.rock = true; k.ud.arms.push(a);
    }
  },
  graveler(k) {
    const Gr = '#8f8a80', Dk = '#66625a';
    k.R(Gr, [0, .62, 0], [.42, .4, .38]);
    for (const p of [[.3, .85, -.1], [-.3, .85, -.12], [0, .95, -.2], [.25, .4, -.15], [-.25, .42, -.12]]) k.R(Dk, p, .17);
    for (const s of [-1, 1]) k.R(Dk, [s * .14, .74, .3], [.13, .06, .07], [0, 0, s * .25]);
    eyes(k, null, .13, .66, .34, .05, .035, { color: '#141414', ry: .3 });
    k.E('#3a3631', [0, .5, .36], [.13, .02, .03]);
    for (const [y, sw] of [[.72, 1], [.5, .8]]) for (const s of [-1, 1]) {
      const a = k.g([s * .36, y, .05]);
      k.R(Gr, [s * .12, 0, .05], [.13 * sw, .11, .11], null, a); k.R(Gr, [s * .26, -.06, .15], [.12 * sw, .13, .12], null, a);
      a.userData.side = s; a.userData.rock = true; k.ud.arms.push(a);
    }
    for (const s of [-1, 1]) { const pv = k.g([s * .17, .3, 0]); k.R(Gr, [0, -.12, .02], [.13, .16, .14], null, pv); pv.userData.ph = s > 0 ? 0 : PI; k.ud.legs.push(pv); }
  },
  gastly(k) {
    k.E('#2a1b38', [0, .65, 0], .28, null, null, { roughness: .25 });
    eyes(k, null, .11, .72, .22, .1, .075, { iris: '#ffffff', pupS: .32, ry: .45, rz: .35 });
    k.E('#4a0f2a', [0, .54, .23], [.11, .05, .04]);
    for (const s of [-1, 1]) k.C('#ffffff', [s * .05, .555, .26], [.015, .05, .015], [PI, 0, 0]);
    for (const [s, o] of [[1.45, .2], [1.8, .12], [2.2, .07]]) {
      const m = new THREE.Mesh(UG.sph, new THREE.MeshBasicMaterial({ color: '#8b5ad8', transparent: true, opacity: o, depthWrite: false }));
      m.scale.setScalar(.28 * s); m.position.y = .65; k.body.add(m); k.ud.auras.push(m);
    }
  },
  haunter(k) {
    const P = '#6f57a9';
    k.E(P, [0, .9, 0], [.3, .28, .26]);
    for (const [x, y, z, rz, rx] of [[0, .22, -.05, 0, -.3], [.16, .16, -.08, -.6, -.3], [-.16, .16, -.08, .6, -.3], [.1, .05, -.2, -.3, -1.2], [-.1, .05, -.2, .3, -1.2]]) k.C(P, [x, .9 + y, z], [.07, .22, .05], [rx, 0, rz]);
    k.tube(P, [[0, .72, -.02], [0, .5, -.1], [0, .32, 0], [.08, .2, .08], [.15, .15, .05]], .2, .02);
    eyes(k, null, .11, .96, .2, .09, .07, { iris: '#ffffff', pupS: .3, ry: .45, rz: .3 });
    k.E('#3a0f2a', [0, .82, .22], [.14, .045, .04]); k.E('#ffffff', [0, .815, .245], [.13, .022, .02]);
    for (const s of [-1, 1]) {
      const hd = k.g([s * .48, .85, .18]);
      k.E(P, [0, 0, 0], [.09, .075, .05], null, hd);
      for (const i of [-1, 0, 1]) k.E(P, [i * .045, -.085, 0], [.025, .065, .025], [0, 0, i * .2], hd);
      hd.userData.side = s; hd.userData.ph = s * 1.3; k.ud.floats.push(hd);
    }
  },
  gengar(k) {
    const P = '#6a4e9e';
    k.E(P, [0, .58, 0], [.42, .4, .38]);
    for (let r = 0; r < 3; r++) for (let c = -1; c <= 1; c++) k.C(P, [c * .14, .7 + r * .1 - Math.abs(c) * .06, -.3 - r * .02], [.06, .2, .05], [-1.1, 0, c * .4]);
    for (const s of [-1, 1]) k.C(P, [s * .2, .98, -.02], [.09, .26, .06], [-.1, 0, -s * .3]);
    eyes(k, null, .14, .7, .32, .09, .06, { iris: '#e02a2a', sclera: '#ff6b6b', pupS: .3, irisS: .6, ry: .4, rz: .35 });
    k.E('#3a0f2a', [0, .48, .33], [.24, .07, .05]); k.E('#ffffff', [0, .48, .36], [.23, .045, .03]);
    k.E('#3a0f2a', [0, .48, .385], [.22, .004, .01]);
    for (const s of [-1, 1]) legB(k, [s * .18, .22, .02], .18, .1, P, { ph: s > 0 ? 0 : PI });
    for (const s of [-1, 1]) arm(k, [s * .38, .55, .1], .2, .06, P, { side: s, splay: .7, fwd: .6 });
    const tp = tailPivot(k, [0, .3, -.35]); k.C(P, [0, 0, -.06], [.05, .14, .05], [-1.7, 0, 0], tp);
  },
  magikarp(k) {
    const O = '#ee6a3c', Cr = '#f3e3b2', Fy = '#f4d06a', Wh = '#f2ecd0';
    k.E(O, [0, 0, 0], [.15, .34, .42]); k.E(Cr, [0, -.12, .06], [.12, .2, .3]);
    for (const [y, z] of [[.12, .1], [.05, -.1], [.15, -.12], [-.02, .12], [.1, -.28]]) for (const s of [-1, 1]) k.E('#f7875a', [s * .125, y, z], [.02, .06, .06]);
    eyes(k, null, .11, .08, .27, .11, .11, { iris: '#ffffff', pupS: .22, ry: 1.2 });
    k.E('#f5b89a', [0, -.03, .42], [.07, .08, .04]); k.E('#c84a2a', [0, -.03, .45], [.04, .05, .02]);
    for (const s of [-1, 1]) k.tube(Wh, [[s * .06, -.02, .4], [s * .12, -.12, .36], [s * .15, -.26, .28]], .02, .012);
    k.shape(Fy, [[-.3, 0], [-.22, .16], [-.1, .1], [0, .2], [.1, .12], [.2, .18], [.3, 0]], .02, [0, .3, 0], 1, [0, PI / 2, 0]);
    for (const s of [-1, 1]) k.E(Fy, [s * .15, -.12, .12], [.02, .08, .1], [.4, 0, s * .4]);
    const tp = tailPivot(k, [0, 0, -.38]);
    k.shape(Fy, [[0, 0], [-.26, .25], [-.34, .2], [-.22, 0], [-.34, -.2], [-.26, -.25]], .025, [0, 0, 0], 1, [0, PI / 2, 0], tp);
    k.ud.fish = true;
  },
  gyarados(k) {
    const B = '#4f80c8', Cr = '#f0dca0', W = '#f4f4f4', R = '#c8303a', Dk = '#2f5590';
    const spine = [[0, -1.0, -1.9], [0, -.2, -1.5], [0, .55, -.8], [0, 1.45, -.25], [0, 2.3, 0], [0, 2.95, .35]];
    const rF = t => .44 - t * .1 + Math.sin(t * PI) * .05;
    const sp = k.tube(B, spine, .42, .34, null, null, rF, true);
    const curve = sp.userData.curve, up = new V3(0, 1, 0), q = new THREE.Quaternion();
    for (let t = .08; t < .97; t += .065) {
      const P = curve.getPointAt(t), T = curve.getTangentAt(t), n = new V3(0, -T.z, T.y).normalize(), r = rF(t);
      const m = k.E(Cr, [P.x + n.x * r * .55, P.y + n.y * r * .55, P.z + n.z * r * .55], [r * .78, .13, r * .5]);
      q.setFromUnitVectors(up, T); m.quaternion.copy(q);
      if (t > .15 && t < .85) { const f = k.C('#3e6db8', [P.x - n.x * r * .95, P.y - n.y * r * .95, P.z - n.z * r * .95], [.03, .28, .16]); q.setFromUnitVectors(up, n.clone().negate().add(T.clone().multiplyScalar(-.6)).normalize()); f.quaternion.copy(q); }
    }
    k.tube(B, [[0, -1.0, -1.9], [0, -.95, -2.6], [0, -.3, -3.2], [0, .45, -3.5]], .38, .12, null, null, null, true);
    k.shape(W, [[0, 0], [.45, .5], [.3, .1], [.55, -.2], [.1, -.05]], .03, [0, .45, -3.5], 1.2, [0, PI / 2, .4]);
    const h = k.g([0, 3.05, .45], null, [.25, 0, 0]);
    k.E(B, [0, 0, 0], [.42, .36, .5], null, h); k.E(B, [0, -.05, .42], [.3, .2, .35], null, h);
    const jaw = k.g([0, -.2, .1], h, [.4, 0, 0]); k.E(B, [0, -.06, .35], [.26, .09, .32], null, jaw); k.E(Cr, [0, -.1, .3], [.2, .05, .26], null, jaw);
    k.E(R, [0, -.2, .42], [.22, .07, .3], null, h);
    for (const s of [-1, 1]) { k.C(W, [s * .13, -.25, .66], [.035, .14, .035], [PI, 0, 0], h); k.C(W, [s * .1, -.18, .55], [.02, .08, .02], [0, 0, 0], jaw); }
    k.C(W, [0, .38, -.12], [.05, .5, .2], [-.55, 0, 0], h);
    for (const s of [-1, 1]) k.C(W, [s * .2, .3, -.15], [.04, .38, .14], [-.7, 0, -s * .5], h);
    for (const s of [-1, 1]) k.C(W, [s * .4, .05, -.1], [.04, .32, .14], [-1.2, 0, -s * 1.1], h);
    for (const s of [-1, 1]) k.tube(W, [[s * .22, -.05, .55], [s * .5, -.05, .35], [s * .75, -.25, .0], [s * .8, -.5, -.25]], .04, .015, h);
    eyes(k, h, .25, .14, .3, .1, .065, { iris: '#ffffff', pupS: .35, ry: .7, brow: Dk, browA: .5 });
    const P = curve.getPointAt(.66), T = curve.getTangentAt(.66), n = new V3(0, -T.z, T.y).normalize();
    k.ud.seat = P.clone().addScaledVector(n, -.48); k.ud.serpent = true;
  },
  lapras(k) {
    const B = '#5ba3dc', Cr = '#f2e6bc', Sh = '#8c8fae', Kn = '#6d6f8e';
    k.E(B, [0, 0, 0], [.75, .42, .95]); k.E(Cr, [0, -.12, .15], [.62, .3, .78]);
    k.E(Sh, [0, .22, -.15], [.68, .32, .75]);
    for (const [x, z] of [[0, .1], [.32, -.05], [-.32, -.05], [.2, -.45], [-.2, -.45], [0, -.3], [.42, -.35], [-.42, -.35]]) k.C(Kn, [x, .43 - Math.abs(x) * .3, z - .1], [.08, .18, .08], [0, 0, -x * .6]);
    for (const [s, z, sc] of [[1, .35, 1], [-1, .35, 1], [1, -.6, .75], [-1, -.6, .75]]) {
      const f = k.g([s * .62, -.08, z], null, [0, s * (z > 0 ? .5 : -.4), 0]); k.E(B, [s * .2, 0, 0], [.42 * sc, .06, .18 * sc], null, f); f.userData.side = s; f.userData.ph = z > 0 ? 0 : PI; k.ud.fins.push(f);
    }
    k.tube(B, [[0, .1, .62], [0, .55, .88], [0, 1.1, .88], [0, 1.45, .78]], .21, .15);
    for (let t = .1; t < .9; t += .12) { const y = .2 + t * 1.25, z = .7 + Math.sin(t * PI) * .26 + .1; k.E(Cr, [0, y, z], [.14, .09, .06]); }
    const h = k.g([0, 1.55, .85]);
    k.E(B, [0, 0, .05], [.27, .22, .3], null, h);
    k.C('#4a8bc8', [0, .22, 0], [.05, .2, .05], [-.35, 0, 0], h);
    for (const s of [-1, 1]) k.tube(B, [[s * .2, .1, -.05], [s * .3, .16, -.12], [s * .27, .22, -.18]], .045, .02, h);
    eyes(k, h, .17, .05, .2, .08, .09, { color: '#1b2340', ry: .75 });
    k.E('#2f5f8f', [0, -.09, .33], [.16, .012, .03], null, h);
    k.ud.seat = new V3(0, .55, -.2);
  },
  eevee(k) {
    const Bn = '#c48a4f', Cr = '#f2e3c2', Dk = '#5a3a22';
    k.E(Bn, [0, .22, 0], [.13, .12, .2]);
    for (let i = 0; i < 9; i++) { const a = i / 9 * PI * 2; k.E(Cr, [Math.cos(a) * .09, .28 + Math.sin(a) * .07, .13], [.06, .07, .06]); }
    const h = k.g([0, .42, .18]);
    k.E(Bn, [0, 0, 0], [.13, .12, .12], null, h); k.E(Bn, [0, -.04, .08], [.07, .06, .07], null, h);
    k.E(Dk, [0, -.02, .155], .014, null, h);
    for (const s of [-1, 1]) { k.E(Bn, [s * .09, .17, -.02], [.05, .16, .025], [0, 0, -s * .35], h); k.E(Dk, [s * .09, .17, -.005], [.032, .12, .012], [0, 0, -s * .35], h); }
    eyes(k, h, .065, .02, .09, .038, .048, { color: '#3b2212', ry: .5 });
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .07, .15, sz * .1], .14, .03, Bn, { ph: ph[i++] });
    const tp = tailPivot(k, [0, .28, -.18]);
    k.E(Bn, [0, .1, -.08], [.09, .15, .09], [-.6, 0, 0], tp); k.E(Cr, [0, .23, -.16], [.07, .08, .07], null, tp);
  },
  vaporeon(k) {
    const Bl = '#78c7e6', Dk = '#2f6f9a', Wh = '#f2f6f8', Fn = '#a7dbee';
    k.E(Bl, [0, .3, 0], [.16, .15, .32]);
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; k.E(Wh, [Math.cos(a) * .1, .37 + Math.sin(a) * .08, .22], [.07, .06, .03], [0, 0, a]); }
    k.T(Dk, [0, .37, .2], [.12, .1, .25]);
    const h = k.g([0, .52, .3]);
    k.E(Bl, [0, 0, 0], [.13, .12, .13], null, h); k.E(Bl, [0, -.04, .09], [.07, .06, .07], null, h);
    for (const s of [-1, 1]) k.shape(Fn, [[0, 0], [.08, .16], [.04, .14], [.06, .26], [0, .16], [-.04, .2], [-.02, .08]], .015, [s * .1, .06, -.02], 1, [0, s * .7, -s * .5], h);
    k.shape(Fn, [[0, 0], [.06, .12], [0, .1], [-.06, .12]], .015, [0, .11, -.02], 1, [0, PI / 2, 0], h);
    eyes(k, h, .07, .02, .1, .035, .045, { color: '#16243a', ry: .5 });
    k.shape(Fn, [[-.2, 0], [-.05, .12], [.15, 0]], .015, [0, .44, -.05], 1, [0, PI / 2, 0]);
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .09, .2, sz * .18], .18, .035, Bl, { ph: ph[i++] });
    const tp = tailPivot(k, [0, .32, -.3]);
    k.tube(Bl, [[0, 0, 0], [0, .05, -.25], [0, .18, -.45], [0, .32, -.5]], .08, .035, tp);
    k.shape(Fn, [[0, 0], [.18, .1], [.22, -.02], [.1, -.04], [.2, -.16], [0, -.06]], .02, [0, .34, -.52], 1, [0, PI / 2, -.8], tp);
  },
  jolteon(k) {
    const Y = '#f5d54a', Wh = '#f8f8f0';
    k.E(Y, [0, .3, 0], [.14, .14, .26]);
    for (let i = 0; i < 10; i++) { const a = i / 10 * PI * 2; k.C(Wh, [Math.cos(a) * .12, .37 + Math.sin(a) * .1, .16], [.035, .14, .03], [0, 0, a - PI / 2]); }
    for (let i = 0; i < 6; i++) k.C(Y, [(i % 2 ? .05 : -.05), .42, .1 - i * .06], [.03, .13, .025], [-1.2, 0, (i % 2 ? -.4 : .4)]);
    const h = k.g([0, .5, .25]);
    k.E(Y, [0, 0, 0], [.12, .11, .12], null, h); k.E(Y, [0, -.04, .09], [.06, .055, .07], null, h);
    k.E('#3a2a10', [0, -.02, .16], .013, null, h);
    for (const s of [-1, 1]) k.C(Y, [s * .07, .17, -.02], [.045, .2, .025], [0, 0, -s * .3], h);
    eyes(k, h, .065, .02, .09, .035, .045, { color: '#1d1a12', ry: .5, brow: '#d9b832', browA: .2 });
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .08, .2, sz * .15], .2, .03, Y, { foot: Wh, ph: ph[i++] });
    const tp = tailPivot(k, [0, .32, -.26]);
    for (let j = 0; j < 4; j++) k.C(Y, [(j - 1.5) * .03, .03, -.06], [.03, .18, .025], [-2 + j * .15, 0, (j - 1.5) * .3], tp);
  },
  flareon(k) {
    const O = '#ea6b3a', Yw = '#f8dc8b';
    k.E(O, [0, .32, 0], [.15, .15, .26]);
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; k.E(Yw, [Math.cos(a) * .12, .4 + Math.sin(a) * .1, .14 + (i % 2) * .03], [.07, .08, .07]); }
    const h = k.g([0, .55, .25]);
    k.E(O, [0, 0, 0], [.13, .12, .12], null, h); k.E(O, [0, -.04, .09], [.065, .06, .07], null, h);
    k.E('#3a1a10', [0, -.02, .165], .014, null, h);
    k.E(Yw, [0, .13, .05], [.06, .05, .05], null, h);
    for (const s of [-1, 1]) { k.E(O, [s * .09, .16, -.02], [.055, .16, .025], [0, 0, -s * .4], h); k.E('#b9442a', [s * .09, .16, -.005], [.035, .12, .012], [0, 0, -s * .4], h); }
    eyes(k, h, .065, .02, .09, .036, .046, { color: '#2a160e', ry: .5 });
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .09, .21, sz * .15], .2, .035, O, { ph: ph[i++] });
    const tp = tailPivot(k, [0, .35, -.24]);
    for (const [x, y, z, s] of [[0, .12, -.08, .12], [0, .26, -.12, .11], [.05, .2, -.04, .09], [-.05, .2, -.04, .09], [0, .36, -.08, .08]]) k.E(Yw, [x, y, z], s, null, tp);
  },
  swinub(k) {
    const Bn = '#9a6a3e', Dk = '#5a3a20', Pk = '#e9a7a2';
    k.E(Bn, [0, .25, 0], [.24, .21, .26]);
    for (let i = 0; i < 14; i++) { const a = i / 14 * PI * 2; k.C(Bn, [Math.cos(a) * .2, .1, Math.sin(a) * .22], [.04, .1, .04], [Math.sin(a) * .5 + PI, 0, -Math.cos(a) * .5]); }
    for (let i = 0; i < 5; i++) k.E(Dk, [(i % 2 ? .02 : -.02), .44, .12 - i * .07], [.025, .02, .05], [0, i % 2 ? .5 : -.5, 0]);
    k.E(Pk, [0, .22, .25], [.08, .06, .05]); for (const s of [-1, 1]) k.E('#7a3a3a', [s * .025, .22, .295], .012);
    eyes(k, null, .08, .3, .22, .025, .03, { ry: .4 });
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .12, .08, sz * .12], .06, .035, Dk, { ph: ph[i++] });
  },
  piloswine(k) {
    const Bn = '#8a5d3c', Lt = '#a87b55', Pk = '#e9a7a2';
    k.E(Bn, [0, .6, 0], [.5, .45, .5]);
    for (let r = 0; r < 4; r++) for (let i = 0; i < 16; i++) {
      const a = i / 16 * PI * 2 + r * .2, y = .95 - r * .2, rr = .32 + r * .07;
      k.C(r % 2 ? Lt : Bn, [Math.cos(a) * rr, y, Math.sin(a) * rr], [.08, .3, .08], [Math.sin(a) * .35 + PI, 0, -Math.cos(a) * .35]);
    }
    k.C(Lt, [0, 1.1, .05], [.12, .25, .1], [.3, 0, 0]);
    k.E(Pk, [0, .5, .48], [.12, .09, .07]); for (const s of [-1, 1]) k.E('#7a3a3a', [s * .04, .5, .54], .018);
    for (const s of [-1, 1]) k.tube('#f4f0e6', [[s * .12, .4, .42], [s * .2, .3, .55], [s * .25, .42, .68], [s * .22, .55, .7]], .045, .015);
    const ph = [0, PI, PI, 0]; let i = 0;
    for (const sx of [-1, 1]) for (const sz of [1, -1]) legQ(k, [sx * .25, .16, sz * .22], .12, .07, '#4a4a52', { ph: ph[i++] });
  }
};

// Construye el modelo, lo escala a su altura real y prepara la animación
function buildPokemon(sp) {
  const def = SPECIES[sp], k = Kit();
  BUILD[sp](k);
  const box = new THREE.Box3().setFromObject(k.root);
  const anchor = def.anchor || 'ground';
  let s;
  if (anchor === 'ground') { k.body.position.y = -box.min.y; s = def.H / (box.max.y - box.min.y); }
  else if (anchor === 'center') { s = def.H / (box.max.z - box.min.z); }
  else s = def.H / box.max.y;
  k.root.scale.setScalar(s);
  const ud = k.ud;
  ud.sp = sp; ud.mode = def.mode; ud.H = def.H; ud.s = s; ud.anchor = anchor;
  ud.bodyY = k.body.position.y;
  ud.R = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * s * .5;
  ud.top = anchor === 'ground' ? def.H : box.max.y * s;
  ud.stride = Math.max(.25, def.H * .55);
  k.root.userData = ud;
  return k.root;
}
function animatePoke(m, t, move, air) {
  const u = m.userData; if (!u || !u.body) return;
  const f = 5.5 / Math.sqrt(Math.max(u.H, .3));
  u.legs.forEach(l => l.rotation.x = air ? .6 : Math.sin(t * f * 1.6 + l.userData.ph) * .7 * move);
  u.arms.forEach(a => { a.rotation.x = Math.sin(t * f * 1.6 + (a.userData.side > 0 ? PI : 0)) * .5 * move + (a.userData.rock ? Math.sin(t * 2) * .1 : 0); });
  u.wings.forEach(w => {
    if (w.userData.bird) {
      const sd = w.userData.side;
      if (air) { w.rotation.set(0, 0, sd * Math.sin(t * 14) * .9); }
      else { w.rotation.set(0, sd * -1.1, sd * -.45); }
    } else if (w.userData.membrane) w.rotation.y = w.userData.baseY + Math.sin(t * (air ? 8 : 1.6)) * (air ? .5 : .1);
  });
  u.tails.forEach((tl, i) => { tl.rotation.y = Math.sin(t * (u.fish ? 9 : 2.6) + i) * (u.fish ? .5 : .22); });
  u.flames.forEach(fl => { const k = 1 + Math.sin(t * 23 + fl.userData.ph) * .12 + Math.sin(t * 37) * .05; fl.scale.set(k, 1 + Math.sin(t * 17 + fl.userData.ph) * .2, k); });
  u.floats.forEach(h => { h.position.y = .85 + Math.sin(t * 2.2 + h.userData.ph) * .06; h.rotation.z = Math.sin(t * 1.7 + h.userData.ph) * .25; });
  u.auras.forEach((a, i) => { const k = 1 + Math.sin(t * 2.5 + i * 1.7) * .08; a.scale.setScalar(a.userData.s0 || (a.userData.s0 = a.scale.x)); a.scale.multiplyScalar(k); });
  u.fins.forEach(fn => fn.rotation.z = fn.userData.side * Math.sin(t * 2 + fn.userData.ph) * .25 * (move + .3));
  let y = u.bodyY;
  if (u.mode === 'levitate') y += Math.sin(t * 2.1) * .05 / u.s;
  else if (u.fish) { u.body.rotation.y = Math.sin(t * 6) * .08 * (move + .3); }
  else if (u.serpent) { u.body.rotation.z = Math.sin(t * .9) * .03; u.body.rotation.x = Math.sin(t * .7) * .02; }
  else y += Math.abs(Math.sin(t * f * 1.6)) * .025 * move / u.s * u.H;
  u.body.position.y = y;
  u.body.scale.y = 1 + Math.sin(t * 2) * .012;
}
function setEmissive(m, col, k) {
  m.traverse(o => {
    const mt = o.material;
    if (o.isMesh && mt && mt.emissive && !mt.userData.keepE) {
      if (mt.userData.e0 == null) { mt.userData.e0 = mt.emissive.getHex(); mt.userData.ei0 = mt.emissiveIntensity; }
      if (k <= 0) { mt.emissive.setHex(mt.userData.e0); mt.emissiveIntensity = mt.userData.ei0; }
      else { mt.emissive.set(col); mt.emissiveIntensity = k; }
    }
  });
}
function disposeModel(m) { m.traverse(o => { if (o.isMesh) { if (o.material) o.material.dispose(); if (o.geometry && !Object.values(UG).includes(o.geometry) && o.geometry !== rockGeo) o.geometry.dispose(); } }); }

// ============================================================
//  Entrenador (1,75 m) con articulaciones
// ============================================================
function buildTrainer() {
  const k = Kit(), M = { skin: '#efc39f', jacket: '#d8352f', shirt: '#f5f5f5', jeans: '#2f4566', shoe: '#f4f4f4', sole: '#c0392b', cap: '#d8352f', hair: '#3a2618', bag: '#3e8e5a' };
  const ud = { thighs: [], shins: [], uarms: [], farms: [] };
  const hip = k.g([0, .95, 0]);
  for (const s of [-1, 1]) {
    const th = k.g([s * .1, 0, 0], hip);
    k.E(M.jeans, [0, -.2, 0], [.085, .24, .09], null, th);
    const sh = k.g([0, -.43, 0], th);
    k.E(M.jeans, [0, -.2, 0], [.065, .23, .07], null, sh);
    k.B(M.shoe, [0, -.46, .05], [.11, .08, .26], null, sh); k.B(M.sole, [0, -.5, .05], [.115, .025, .265], null, sh);
    th.userData.s = s; ud.thighs.push(th); ud.shins.push(sh);
  }
  k.E(M.jeans, [0, .97, 0], [.18, .1, .12]);
  const torso = k.g([0, 1.0, 0]);
  k.E(M.jacket, [0, .26, 0], [.2, .3, .13], null, torso); k.E(M.shirt, [0, .36, .085], [.07, .16, .05], null, torso);
  k.E('#b52a25', [0, .02, 0], [.2, .06, .13], null, torso);
  k.B(M.bag, [0, .3, -.17], [.3, .36, .14], null, torso); k.B('#2c6a43', [0, .22, -.245], [.22, .14, .03], null, torso);
  for (const s of [-1, 1]) k.B('#2c6a43', [s * .12, .38, .02], [.03, .3, .26], [0, 0, 0], torso);
  k.Y(M.skin, [0, 1.55, 0], [.05, .1, .05]);
  const head = k.g([0, 1.67, 0]);
  k.E(M.skin, [0, 0, 0], [.105, .125, .115], null, head);
  k.E(M.hair, [0, .02, -.03], [.11, .12, .11], null, head);
  k.E(M.cap, [0, .065, 0], [.115, .075, .12], null, head); k.B(M.cap, [0, .05, .12], [.17, .015, .12], [-.12, 0, 0], head);
  k.E(M.shirt, [0, .1, .075], [.05, .035, .03], null, head);
  for (const s of [-1, 1]) { k.E('#1b1b22', [s * .038, .0, .1], [.014, .018, .01], null, head); k.E(M.hair, [s * .04, .03, .102], [.025, .006, .008], null, head); }
  k.E('#c98d74', [0, -.05, .108], [.02, .006, .006], null, head);
  for (const s of [-1, 1]) k.E(M.skin, [s * .105, 0, 0], [.02, .03, .015], null, head);
  for (const s of [-1, 1]) {
    const ua = k.g([s * .23, 1.48, 0], null, [0, 0, s * .08]);
    k.E(M.jacket, [0, -.14, 0], [.055, .16, .055], null, ua);
    const fa = k.g([0, -.29, 0], ua);
    k.E(M.jacket, [0, -.12, 0], [.045, .14, .045], null, fa); k.E(M.skin, [0, -.27, .01], [.04, .05, .03], null, fa);
    ua.userData.s = s; ud.uarms.push(ua); ud.farms.push(fa);
  }
  ud.head = head; ud.torso = torso;
  k.root.userData = ud; return k.root;
}
function poseTrainer(m, t, speed, air, mode) {
  const u = m.userData, ph = t * (5.2 + speed * .9), a = clamp(speed / 6, 0, 1.1);
  if (mode === 'sit') {
    u.thighs.forEach(th => { th.rotation.set(-1.45, 0, th.userData.s * .35); }); u.shins.forEach(s => s.rotation.x = 1.5);
    u.uarms.forEach(ua => { ua.rotation.set(-.6, 0, ua.userData.s * .25); }); u.farms.forEach(f => f.rotation.x = -.6); return;
  }
  if (mode === 'throw') { u.uarms[1].rotation.set(-2.5, 0, .2); u.farms[1].rotation.x = -.3; return; }
  u.thighs.forEach((th, i) => {
    const s = i ? 1 : -1, sw = Math.sin(ph + (i ? PI : 0));
    th.rotation.set(air ? -.5 * (i ? 1 : .3) : sw * .6 * a, 0, 0);
    u.shins[i].rotation.x = air ? .8 : Math.max(0, -Math.sin(ph + (i ? PI : 0) + .9)) * 1.0 * a + .05;
  });
  u.uarms.forEach((ua, i) => { ua.rotation.set(Math.sin(ph + (i ? 0 : PI)) * .55 * a + (air ? -.6 : 0), 0, ua.userData.s * (.08 + (air ? .3 : 0))); u.farms[i].rotation.x = -.25 - a * .5; });
  u.torso.rotation.x = a * .08; u.head.rotation.y = 0;
  const breathe = Math.sin(t * 1.8) * .006; u.torso.position.y = 1.0 + breathe;
}

// ============================================================
//  Objetos del mundo (tamaño real) y Poké Balls
// ============================================================
function ballMesh(kind) {
  const g = new THREE.Group(), r = .055;
  const top = kind === 'superball' ? '#1e6fe0' : kind === 'ultraball' ? '#2b2b2b' : '#e53935';
  const mt = new THREE.MeshStandardMaterial({ color: top, roughness: .25, metalness: .05 });
  const wt = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: .3 });
  const bk = new THREE.MeshStandardMaterial({ color: '#151515', roughness: .4 });
  const h1 = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, PI * 2, 0, PI / 2), mt); g.add(h1);
  const h2 = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 14, 0, PI * 2, PI / 2, PI / 2), wt); g.add(h2);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.005, r * 1.005, r * .16, 28), bk); g.add(band);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(r * .32, r * .32, r * .2, 20), bk); btn.rotation.x = PI / 2; btn.position.z = r * .95; g.add(btn);
  const btn2 = new THREE.Mesh(new THREE.CylinderGeometry(r * .2, r * .2, r * .22, 20), wt); btn2.rotation.x = PI / 2; btn2.position.z = r * 1.0; g.add(btn2);
  if (kind === 'superball') for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(r * .5, r * .2, r * .3), new THREE.MeshStandardMaterial({ color: '#e53935', roughness: .3 })); m.position.set(s * r * .62, r * .72, 0); m.rotation.z = s * -.8; g.add(m); }
  if (kind === 'ultraball') { const y = new THREE.MeshStandardMaterial({ color: '#f2c53d', roughness: .3 }); for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(r * .25, r * .2, r * .9), y); m.position.set(s * r * .55, r * .78, 0); m.rotation.z = s * -.7; g.add(m); } }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData.r = r; return g;
}
function itemModel(type) {
  if (ITEMS[type].kind === 'ball') return ballMesh(type);
  const k = Kit(), c = ITEMS[type].c;
  if (type === 'baya') { k.E(c, [0, .05, 0], [.05, .045, .05], null, null, { roughness: .35 }); k.E('#7fc0ff', [.02, .07, .03], .012); k.C('#3d8a3a', [0, .1, 0], [.02, .03, .02]); for (const a of [0, 2.1, 4.2]) k.E('#4a9a3a', [Math.sin(a) * .025, .095, Math.cos(a) * .025], [.022, .006, .012], [0, a, 0]); }
  else if (['pocion', 'superpocion', 'hiperpocion', 'eter'].includes(type)) {
    k.Y(c, [0, .07, 0], [.035, .12, .035], null, null, { roughness: .2, metalness: .1 }); k.Y('#f2f2f2', [0, .14, 0], [.028, .03, .028]); k.B('#e0e0e0', [0, .165, .01], [.02, .02, .035]); k.B('#ffffff', [0, .07, .036], [.04, .05, .002]);
  } else if (type === 'revivir') { k.mesh(new THREE.OctahedronGeometry(.06, 0), c, [0, .06, 0], [1, .6, 1], null, null, { roughness: .2, metalness: .3, emissive: '#7a5a00', emissiveIntensity: .3 }); }
  else if (type === 'caramelo') { k.E(c, [0, .04, 0], [.04, .035, .035], null, null, { roughness: .2 }); for (const s of [-1, 1]) k.C('#e8f1ff', [s * .055, .04, 0], [.025, .04, .025], [0, 0, s * PI / 2]); }
  else if (ITEMS[type].kind === 'stone') { k.R(c, [0, .05, 0], [.06, .05, .055], null, null, { roughness: .3, metalness: .1, emissive: c, emissiveIntensity: .25 }); }
  else { k.Y(c, [0, .06, 0], [.03, .1, .03], null, null, { roughness: .3 }); k.Y('#f5f5f5', [0, .12, 0], [.032, .025, .032]); k.B('#ffffff', [0, .06, .031], [.035, .04, .002]); }
  return k.root;
}

// Centro Pokémon (12 × 9 m)
function centerTexture() {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const x = cv.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 96);
  x.fillStyle = '#d8352f'; x.font = '900 54px Nunito, system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('CENTRO POKÉMON', 256, 52);
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
}
let _centerTex = null;
function buildCenter() {
  const k = Kit(), W = 12, D = 9, Hh = 4.2;
  k.B('#a9a59c', [0, .1, 0], [W + 1.4, .2, D + 2.6], null, null, { roughness: .9 });
  k.B('#efe6d2', [0, .2 + Hh / 2, 0], [W, Hh, D], null, null, { roughness: .85 });
  k.B('#ffffff', [0, Hh + .35, 0], [W + .3, .35, D + .3]);
  k.B('#d63a3a', [0, Hh + .75, 0], [W + .9, .45, D + .9], null, null, { roughness: .55 });
  k.B('#d63a3a', [0, Hh + 1.3, -.5], [6, .8, 5], null, null, { roughness: .55 });
  const glass = { color: '#9fd6f2', roughness: .08, metalness: .4, transparent: true, opacity: .75, emissive: '#2a5070', emissiveIntensity: .2 };
  k.B('#3a3a44', [0, 1.55, D / 2 + .02], [2.8, 2.9, .1]);
  k.B('#9fd6f2', [0, 1.5, D / 2 + .06], [2.5, 2.7, .05], null, null, glass);
  for (const x of [-3.8, 3.8]) { k.B('#3a3a44', [x, 2.2, D / 2 + .02], [2.4, 1.6, .08]); k.B('#9fd6f2', [x, 2.2, D / 2 + .05], [2.2, 1.4, .05], null, null, glass); }
  for (const s of [-1, 1]) for (const z of [-2, 1.5]) { k.B('#3a3a44', [s * (W / 2 + .02), 2.2, z], [.08, 1.5, 2.2]); k.B('#9fd6f2', [s * (W / 2 + .05), 2.2, z], [.05, 1.3, 2], null, null, glass); }
  const sg = k.g([0, Hh - .35, D / 2 + .12]);
  k.mesh(new THREE.CylinderGeometry(.75, .75, .14, 40, 1, false, -PI / 2, PI), '#e53935', [0, 0, 0], null, [PI / 2, 0, 0], sg, { roughness: .3 });
  k.mesh(new THREE.CylinderGeometry(.75, .75, .14, 40, 1, false, PI / 2, PI), '#f5f5f5', [0, 0, 0], null, [PI / 2, 0, 0], sg, { roughness: .3 });
  k.B('#151515', [0, 0, .01], [1.5, .14, .16], null, sg); k.Y('#151515', [0, 0, .04], [.26, .18, .26], [PI / 2, 0, 0], sg); k.Y('#ffffff', [0, 0, .07], [.16, .18, .16], [PI / 2, 0, 0], sg);
  if (!_centerTex) _centerTex = centerTexture();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.05), new THREE.MeshStandardMaterial({ map: _centerTex, roughness: .5, emissive: '#ffffff', emissiveMap: _centerTex, emissiveIntensity: .15 }));
  sign.position.set(0, Hh + .75, D / 2 + .46); k.body.add(sign);
  const lamps = [];
  for (const x of [-2.4, 2.4]) {
    k.Y('#4a4a52', [x, 1.4, D / 2 + 1.6], [.06, 2.8, .06], null, null, { metalness: .6, roughness: .4 });
    const b = k.E('#fff3c4', [x, 2.9, D / 2 + 1.6], .16, null, null, { emissive: '#ffd27a', emissiveIntensity: .2 }); b.material.userData.keepE = true; lamps.push(b.material);
  }
  k.root.userData = { lamps, W, D };
  k.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return k.root;
}
