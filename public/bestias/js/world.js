'use strict';
// ============================================================
//  Render, luces y cielo
// ============================================================
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
// calidad: ?calidad=baja fuerza el modo ligero; también se activa solo si el equipo va lento
const LOW = /calidad=baja/.test(location.search) || (() => { try { return localStorage.getItem('pokemon_low') === '1'; } catch (e) { return false; } })();
if ('enabled' in THREE.ColorManagement) THREE.ColorManagement.enabled = true; else THREE.ColorManagement.legacyMode = false;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(LOW ? 1 : Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('#game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.05, 1500);
scene.fog = new THREE.Fog(0xbfe3ff, 70, 230);
const hemi = new THREE.HemisphereLight(0xdcefff, 0x5d6b3e, 0.75); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.castShadow = true; sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 300 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const skyU = {
  uTop: { value: new THREE.Color('#3f8fe0') }, uHor: { value: new THREE.Color('#bfe3ff') }, uGround: { value: new THREE.Color('#8aa7bd') },
  uSun: { value: new V3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#fff4d6') }, uNight: { value: 0 }, uTime: { value: 0 }
};
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }`,
  fragmentShader: `uniform vec3 uTop,uHor,uGround,uSun,uSunCol; uniform float uNight,uTime; varying vec3 vDir;
  float hash(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  void main(){ vec3 d=normalize(vDir); float h=d.y;
    vec3 col = h>0. ? mix(uHor,uTop,pow(clamp(h,0.,1.),.55)) : mix(uHor,uGround,clamp(-h*4.,0.,1.));
    float s=max(dot(d,uSun),0.);
    col += uSunCol*(pow(s,1400.)*24. + pow(s,64.)*.35 + pow(s,6.)*.12)*(1.-uNight*.9);
    vec3 m=-uSun; float ms=max(dot(d,m),0.); col += vec3(.85,.9,1.)*pow(ms,2200.)*14.*uNight + vec3(.3,.35,.5)*pow(ms,40.)*.25*uNight;
    if(uNight>0. && h>0.){ vec3 q=floor(d*420.); float st=step(.9975,hash(q)); float tw=.6+.4*sin(uTime*3.+hash(q+3.)*40.); col += vec3(st*tw*uNight*1.4); }
    gl_FragColor=vec4(col,1.);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
  }`
}));
sky.renderOrder = -10; scene.add(sky);

// nubes suaves (sprites generados)
function cloudTexture(seed) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d'), r = mulberry32(seed);
  for (let i = 0; i < 26; i++) {
    const px = 40 + r() * 176, py = 60 + (r() - .5) * 40, rad = 18 + r() * 34;
    const g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; return t;
}
const clouds = [];
{
  const tex = [cloudTexture(3), cloudTexture(8), cloudTexture(13)];
  for (let i = 0; i < 22; i++) {
    const m = new THREE.SpriteMaterial({ map: tex[i % 3], transparent: true, depthWrite: false, fog: false, opacity: .9 });
    const s = new THREE.Sprite(m); const w = rand(90, 180); s.scale.set(w, w * .45, 1);
    s.position.set(rand(-600, 600), rand(140, 200), rand(-600, 600)); scene.add(s); clouds.push(s);
  }
}

// ============================================================
//  Terreno infinito (alturas en metros) con sitios aplanados
// ============================================================
const SEED = 4242, CH = 48, SEG = 32, VIEW = LOW || isTouch ? 2 : 3, WATER = 0;
function rawH(x, z) {
  const c = fbm(x / 460, z / 460, SEED, 4);
  const hills = fbm(x / 95, z / 95, SEED + 50, 4);
  const det = fbm(x / 18, z / 18, SEED + 70, 2);
  const mtn = fbm(x / 260, z / 260, SEED + 99, 3);
  let h = (c - 0.45) * 78 + (hills - 0.5) * 18 + (det - .5) * 1.6;
  const m = Math.max(0, mtn - 0.56); h += m * m * 520;
  const k = Math.exp(-(x * x + z * z) / 14000);
  return lerp(h, Math.max(h, 4.5 + (hills - 0.5) * 6), k);
}
const siteCache = new Map();
function siteOf(cx, cz) {
  const key = cx + ',' + cz;
  if (siteCache.has(key)) return siteCache.get(key);
  let s = null;
  if (cx === 0 && cz === 0) s = { x: 16, z: 6 };
  else if (ihash(cx, cz, SEED + 21) < 0.045) s = { x: cx * CH + 16 + ihash(cx, cz, 5) * 16, z: cz * CH + 16 + ihash(cx, cz, 6) * 16 };
  if (s) { const h = rawH(s.x, s.z); if (h < 2.5 || h > 24) s = null; else s.h = h; }
  siteCache.set(key, s); return s;
}
function terrainH(x, z) {
  let h = rawH(x, z);
  const cx = Math.floor(x / CH), cz = Math.floor(z / CH);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const s = siteOf(cx + dx, cz + dz); if (!s) continue;
    const d = Math.hypot(Math.max(Math.abs(x - s.x) - 8, 0), Math.max(Math.abs(z - (s.z + 1.5)) - 7.5, 0));
    if (d < 16) h = lerp(h, s.h, smooth(16, 0, d));
  }
  return h;
}
function groundY(x, z) {
  const s = CH / SEG, gx = Math.floor(x / s) * s, gz = Math.floor(z / s) * s, fx = (x - gx) / s, fz = (z - gz) / s;
  const a = terrainH(gx, gz), b = terrainH(gx + s, gz), c = terrainH(gx, gz + s), d = terrainH(gx + s, gz + s);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}
function groundGrad(x, z) { const e = .5; return [(groundY(x + e, z) - groundY(x - e, z)) / (2 * e), (groundY(x, z + e) - groundY(x, z - e)) / (2 * e)]; }
function climate(x, z) { return { t: fbm(x / 720 + 300, z / 720 - 200, SEED + 7, 3), m: fbm(x / 560 - 100, z / 560 + 400, SEED + 13, 3) }; }
function biomeAt(x, z, h) {
  if (h < WATER) return 'agua';
  if (h < 1.3) return 'playa';
  if (h > 38) return 'nieve';
  if (h > 24) return 'montana';
  const { t, m } = climate(x, z);
  if (t > 0.56 && m < 0.5) return 'desierto';
  if (t < 0.41) return 'tundra';
  if (m > 0.535) return 'bosque';
  return 'pradera';
}
const BIOME_NAME = { agua: 'Mar', playa: 'Playa', nieve: 'Cumbres nevadas', montana: 'Montaña', desierto: 'Desierto', tundra: 'Tundra', bosque: 'Bosque', pradera: 'Pradera' };
const BC = {
  agua: new THREE.Color('#b9a477'), playa: new THREE.Color('#e7d39b'), nieve: new THREE.Color('#f1f5f9'), montana: new THREE.Color('#857c70'),
  desierto: new THREE.Color('#e2c27f'), tundra: new THREE.Color('#c9d6cf'), bosque: new THREE.Color('#3f7a33'), pradera: new THREE.Color('#6fae46'),
  rock: new THREE.Color('#7d776c'), dirt: new THREE.Color('#8a6f4c'), snowy: new THREE.Color('#e9eff4')
};
const tmpC = new THREE.Color();
function groundColor(x, z, h, slope) {
  const b = biomeAt(x, z, h);
  tmpC.copy(BC[b]);
  const n = vnoise(x / 7, z / 7, 77) - .5, n2 = vnoise(x / 31, z / 31, 9);
  if (b === 'agua') tmpC.multiplyScalar(clamp(1 + h * .05, .4, 1));
  else if (b === 'pradera' || b === 'bosque') { tmpC.offsetHSL(n * .03, 0, n * .06); if (n2 > .68) tmpC.lerp(new THREE.Color('#9bbf55'), .4); if (n2 < .25) tmpC.lerp(BC.dirt, .25); }
  else tmpC.offsetHSL(0, 0, n * .05);
  if (b === 'montana' && h > 32) tmpC.lerp(BC.snowy, smooth(32, 38, h));
  if (slope > .75 && b !== 'agua' && b !== 'playa') tmpC.lerp(BC.rock, smooth(.75, 1.3, slope));
  return tmpC;
}
const detailTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x = cv.getContext('2d'), img = x.createImageData(256, 256);
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const v = 215 + (vnoise(i / 3, j / 3, 5) - .5) * 50 + (vnoise(i / 11, j / 11, 6) - .5) * 40;
    const o = (j * 256 + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = clamp(v, 0, 255); img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(9, 9); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
})();
const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, metalness: 0, map: detailTex });

// ============================================================
//  Agua con olas, espuma en la orilla y color por profundidad
// ============================================================
function waveRaw(x, z, t) {
  return .10 * Math.sin(.32 * x + .9 * t) + .07 * Math.sin(.27 * z - .4 * x + 1.3 * t) + .04 * Math.sin(.9 * (x + z) + 2.2 * t) + .025 * Math.sin(1.7 * x - 1.3 * z + 3.1 * t);
}
function waterY(x, z) { const d = WATER - groundY(x, z); return WATER + waveRaw(x, z, waterU.uTime.value) * smooth(0, 2.5, d); }
const waterU = Object.assign(THREE.UniformsUtils.clone(THREE.UniformsLib.fog), {
  uTime: { value: 0 }, uDeep: { value: new THREE.Color('#0b4774') }, uShallow: { value: new THREE.Color('#2fb3c6') },
  uSky: { value: new THREE.Color('#bfe3ff') }, uSunDir: { value: new V3(0, 1, 0) }, uSunCol: { value: new THREE.Color('#fff2d8') }
});
const waterMat = new THREE.ShaderMaterial({
  uniforms: waterU, transparent: true, depthWrite: false, fog: true,
  vertexShader: `uniform float uTime; attribute float depth; varying float vDepth; varying vec3 vWorld; varying vec3 vN;
  #include <fog_pars_vertex>
  float wv(vec2 p,float t){ return .10*sin(.32*p.x+.9*t)+.07*sin(.27*p.y-.4*p.x+1.3*t)+.04*sin(.9*(p.x+p.y)+2.2*t)+.025*sin(1.7*p.x-1.3*p.y+3.1*t); }
  void main(){ vec4 wp=modelMatrix*vec4(position,1.); float a=smoothstep(0.,2.5,depth); float h=wv(wp.xz,uTime)*a; wp.y+=h;
    float e=.3; float hx=wv(wp.xz+vec2(e,0.),uTime)*a-h; float hz=wv(wp.xz+vec2(0.,e),uTime)*a-h;
    vN=normalize(vec3(-hx/e,1.,-hz/e)); vDepth=depth; vWorld=wp.xyz;
    vec4 mvPosition=viewMatrix*wp; gl_Position=projectionMatrix*mvPosition;
    #include <fog_vertex>
  }`,
  fragmentShader: `uniform vec3 uDeep,uShallow,uSky,uSunDir,uSunCol; uniform float uTime; varying float vDepth; varying vec3 vWorld; varying vec3 vN;
  #include <common>
  #include <fog_pars_fragment>
  void main(){ if(vDepth<-.2) discard;
    vec3 V=normalize(cameraPosition-vWorld); vec3 N=normalize(vN + vec3(sin(vWorld.x*2.3+uTime*1.7)*.03, 0., cos(vWorld.z*2.1-uTime*1.5)*.03));
    float fres=pow(1.-max(dot(N,V),0.),4.);
    vec3 base=mix(uShallow,uDeep,smoothstep(0.,7.,vDepth));
    vec3 col=mix(base,uSky,.04+fres*.42);
    vec3 H=normalize(uSunDir+V); col+=uSunCol*pow(max(dot(N,H),0.),220.)*2.2;
    float fn=sin(vWorld.x*1.7+uTime*1.3)*sin(vWorld.z*1.9-uTime*1.1)*.5+.5;
    float foam=(1.-smoothstep(0.,.5,vDepth))*(.5+.5*fn);
    col=mix(col,vec3(.95,.98,1.),foam*.85);
    float alpha=mix(.45,.94,smoothstep(0.,3.,vDepth)); alpha=max(alpha,foam*.9);
    gl_FragColor=vec4(col,alpha);
    #include <tonemapping_fragment>
    #include <encodings_fragment>
    #include <fog_fragment>
  }`
});

// ============================================================
//  Vegetación y rocas (geometrías fusionadas con color por vértice)
// ============================================================
function mergeParts(parts) {
  const P = [], N = [], C = [], col = new THREE.Color();
  for (const [g0, m, c, jit] of parts) {
    const g = g0.index ? g0.toNonIndexed() : g0.clone(); g.applyMatrix4(m);
    const p = g.attributes.position, n = g.attributes.normal; col.set(c);
    for (let i = 0; i < p.count; i++) {
      P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i));
      const j = jit ? 1 + (ihash(i, p.count, 7) - .5) * jit : 1; C.push(col.r * j, col.g * j, col.b * j);
    }
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  out.computeBoundingSphere(); return out;
}
const M4 = (p, s, r) => new THREE.Matrix4().compose(new V3(p[0], p[1], p[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(r || [0, 0, 0]))), Array.isArray(s) ? new V3(s[0], s[1], s[2]) : new V3(s, s, s));
function blobGeo(seed, lo) {
  const g = lo ? new THREE.SphereGeometry(1, 7, 5) : new THREE.SphereGeometry(1, 14, 10), p = g.attributes.position, v = new V3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = fbm(v.x * 1.6 + seed, v.y * 1.6 + v.z * 1.4, 11 + seed, 3); v.multiplyScalar(.8 + n * .4); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); return g;
}
function buildDecoSet(lo) {
  const DECO = {};
  const BLOBS = [blobGeo(1, lo), blobGeo(5, lo), blobGeo(9, lo)];
  const trunkGeo = lo ? new THREE.CylinderGeometry(.6, 1, 1, 5, 1) : new THREE.CylinderGeometry(.6, 1, 1, 9, 3);
  const coneGeo = lo ? new THREE.ConeGeometry(1, 1, 6, 1) : new THREE.ConeGeometry(1, 1, 10, 2);
  const sph = lo ? new THREE.SphereGeometry(1, 6, 4) : UG.sph, cyl = lo ? new THREE.CylinderGeometry(1, 1, 1, 6) : UG.cyl, rk = lo ? new THREE.IcosahedronGeometry(1, 0) : rockGeo;
  const bark = '#6b4a2f', l1 = '#3f7f2f', l2 = '#4b8f36', l3 = '#356f2a';
  DECO.oak = mergeParts([
    [trunkGeo, M4([0, 2.3, 0], [.38, 4.6, .38]), bark, .2], [trunkGeo, M4([.7, 4, .2], [.14, 2.2, .14], [0, 0, -.8]), bark, .2], [trunkGeo, M4([-.6, 4.3, -.3], [.12, 2, .12], [.3, 0, .9]), bark, .2],
    [BLOBS[0], M4([0, 6.6, 0], [2.6, 2.2, 2.6]), l2, .25], [BLOBS[1], M4([1.6, 5.6, .5], [1.9, 1.7, 1.9]), l1, .25], [BLOBS[2], M4([-1.5, 5.8, -.6], [2, 1.7, 2]), l3, .25],
    [BLOBS[1], M4([.3, 5.2, -1.6], [1.8, 1.5, 1.8]), l1, .25], [BLOBS[0], M4([-.4, 7.9, .4], [1.7, 1.4, 1.7]), l2, .25], [BLOBS[2], M4([.4, 5.3, 1.6], [1.7, 1.4, 1.7]), l3, .25]
  ]);
  const pineParts = [[trunkGeo, M4([0, 4.5, 0], [.3, 9, .3]), bark, .2]];
  for (let i = 0; i < 6; i++) pineParts.push([coneGeo, M4([0, 3 + i * 1.45, 0], [2.7 - i * .38, 2.6, 2.7 - i * .38], [0, i, 0]), i % 2 ? '#2c5e33' : '#336b3a', .2]);
  DECO.pine = mergeParts(pineParts);
  const snowParts = pineParts.slice();
  for (let i = 0; i < 6; i++) snowParts.push([coneGeo, M4([0, 3.5 + i * 1.45, 0], [(2.7 - i * .38) * .78, 1.5, (2.7 - i * .38) * .78], [0, i + .5, 0]), '#eef3f6', .05]);
  DECO.snowpine = mergeParts(snowParts);
  const palm = [];
  for (let i = 0; i < 6; i++) palm.push([trunkGeo, M4([i * i * .03, .6 + i * 1.1, 0], [.22 - i * .015, 1.2, .22 - i * .015], [0, 0, -i * .06]), '#8a6a45', .25]);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; palm.push([BLOBS[0], M4([.8 + Math.cos(a) * 1.4, 6.6 - .5, Math.sin(a) * 1.4], [1.8, .12, .45], [0, -a, -.35]), i % 2 ? '#4f8f37' : '#3f7f2f', .2]); }
  DECO.palm = mergeParts(palm);
  const cg = '#4f7f3a';
  DECO.cactus = mergeParts([[cyl, M4([0, 1.8, 0], [.34, 3.6, .34]), cg, .15], [sph, M4([0, 3.6, 0], .34), cg, .1],
    [cyl, M4([.55, 1.6, 0], [.2, .9, .2], [0, 0, PI / 2]), cg, .15], [cyl, M4([.95, 2.2, 0], [.2, 1.3, .2]), cg, .15], [sph, M4([.95, 2.85, 0], .2), cg, .1],
    [cyl, M4([-.45, 2.3, 0], [.18, .7, .18], [0, 0, PI / 2]), cg, .15], [cyl, M4([-.78, 2.75, 0], [.18, 1, .18]), cg, .15], [sph, M4([-.78, 3.25, 0], .18), cg, .1]]);
  DECO.bush = mergeParts([[BLOBS[0], M4([0, .5, 0], [.9, .7, .9]), l2, .3], [BLOBS[1], M4([.6, .4, .2], [.6, .5, .6]), l1, .3], [BLOBS[2], M4([-.5, .4, -.2], [.65, .5, .65]), l3, .3]]);
  DECO.rock = mergeParts([[rk, M4([0, .3, 0], [1, .75, 1.1]), '#8b857a', .25], [rk, M4([.9, .1, .3], [.45, .35, .5]), '#7a756b', .25]]);
  DECO.boulder = mergeParts([[rk, M4([0, .8, 0], [2, 1.6, 1.8], [0, .6, 0]), '#857f74', .22]]);
  DECO.dead = mergeParts([[trunkGeo, M4([0, 2, 0], [.25, 4, .25]), '#6b5a48', .2], [trunkGeo, M4([.5, 3, 0], [.1, 1.6, .1], [0, 0, -.9]), '#6b5a48', .2], [trunkGeo, M4([-.4, 3.4, .2], [.08, 1.3, .08], [.4, 0, .9]), '#6b5a48', .2]]);
  const fl = [];
  for (let i = 0; i < 7; i++) { const a = i * 2.4, r = .15 + (i % 3) * .18; fl.push([cyl, M4([Math.cos(a) * r, .12, Math.sin(a) * r], [.008, .24, .008]), '#4f8f37', 0]); fl.push([sph, M4([Math.cos(a) * r, .25, Math.sin(a) * r], [.05, .03, .05]), '#ffffff', .1]); }
  DECO.flowers = mergeParts(fl);
  return DECO;
}
const DECO = buildDecoSet(false), DECO_LO = buildDecoSet(true);
const decoMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: 0 });

// hierba con viento
const grassU = { uTime: { value: 0 } };
const grassGeo = (() => {
  const P = [], C = [], N = [];
  const base = new THREE.Color('#2c5a1c'), tip = new THREE.Color('#93c552');
  for (let b = 0; b < 9; b++) {
    const a = b * 2.1, r = (b % 3) * .06, ox = Math.cos(a) * r, oz = Math.sin(a) * r, h = .3 + (b % 4) * .07, w = .025, bend = .08 + (b % 3) * .04, ry = a * 1.7;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const pt = (u, v) => { const x = (u - .5) * w * 2 * (1 - v), y = v * h, z = v * v * bend; return [ox + x * cs + z * sn, y, oz - x * sn + z * cs]; };
    for (let s = 0; s < 3; s++) {
      const v0 = s / 3, v1 = (s + 1) / 3;
      const q = [pt(0, v0), pt(1, v0), pt(1, v1), pt(0, v1)];
      for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...q[i]); const v = i < 2 ? v0 : v1; const c = base.clone().lerp(tip, v); C.push(c.r, c.g, c.b); N.push(0, 1, 0); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
})();
const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
grassMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = grassU.uTime;
  sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    vec2 ip = vec2(0.);
    #ifdef USE_INSTANCING
    ip = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
    #endif
    float sw = sin(uTime*1.6 + ip.x*.12 + ip.y*.09)*.6 + sin(uTime*3.3 + ip.x*.5)*.25;
    float k = position.y*position.y*1.4;
    transformed.x += sw*k*.35; transformed.z += sw*k*.18;`);
};

// ============================================================
//  Bloques del mundo
// ============================================================
const chunks = new Map(), centers = [], worldItems = [];
const ITEM_RESPAWN = 8 * 60 * 1000;
function buildChunk(cx, cz) {
  const key = cx + ',' + cz, group = new THREE.Group();
  const ox = cx * CH + CH / 2, oz = cz * CH + CH / 2;
  const geo = new THREE.PlaneGeometry(CH, CH, SEG, SEG); geo.rotateX(-PI / 2);
  const pos = geo.attributes.position, nor = geo.attributes.normal, cols = new Float32Array(pos.count * 3), depth = new Float32Array(pos.count);
  let minH = 1e9;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox, z = pos.getZ(i) + oz, h = terrainH(x, z);
    const e = .75, hx = (terrainH(x + e, z) - terrainH(x - e, z)) / (2 * e), hz = (terrainH(x, z + e) - terrainH(x, z - e)) / (2 * e);
    const n = new V3(-hx, 1, -hz).normalize();
    pos.setY(i, h); nor.setXYZ(i, n.x, n.y, n.z);
    const c = groundColor(x, z, h, Math.hypot(hx, hz)); cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    depth[i] = WATER - h; minH = Math.min(minH, h);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const ground = new THREE.Mesh(geo, terrainMat); ground.position.set(ox, 0, oz); ground.receiveShadow = true;
  group.add(ground);
  let wgeo = null;
  if (minH < .6) {
    wgeo = new THREE.PlaneGeometry(CH, CH, SEG, SEG); wgeo.rotateX(-PI / 2); wgeo.setAttribute('depth', new THREE.BufferAttribute(depth, 1));
    const w = new THREE.Mesh(wgeo, waterMat); w.position.set(ox, WATER, oz); w.renderOrder = 2; group.add(w);
  }
  const rng = mulberry32(ihash(cx, cz, SEED + 3) * 4294967296);
  const lists = {}, colliders = [];
  const put = (k, x, y, z, s, rot, tint) => (lists[k] || (lists[k] = [])).push({ x, y, z, s, rot, tint });
  const site = siteOf(cx, cz);
  for (let i = 0; i < 90; i++) {
    const x = cx * CH + rng() * CH, z = cz * CH + rng() * CH, h = groundY(x, z), b = biomeAt(x, z, h), r = rng(), s = .75 + rng() * .6, rot = rng() * 6.28;
    if (Math.hypot(x - 2, z - 4) < 7) continue;
    let nearSite = false; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const st = siteOf(cx + dx, cz + dz); if (st && Math.abs(x - st.x) < 13 && Math.abs(z - st.z - 2) < 13) nearSite = true; }
    if (nearSite) continue;
    const [gx, gz] = groundGrad(x, z), slope = Math.hypot(gx, gz);
    const tint = .85 + rng() * .3, y = h - .15;
    if (b === 'bosque') {
      if (r < .3 && slope < .8) { put('oak', x, y, z, s, rot, tint); colliders.push({ x, z, r: .45 * s }); }
      else if (r < .5 && slope < .9) { put('pine', x, y, z, s, rot, tint); colliders.push({ x, z, r: .35 * s }); }
      else if (r < .66) put('bush', x, h, z, s, rot, tint);
      else if (r < .74) put('flowers', x, h, z, s, rot, 1);
    } else if (b === 'pradera') {
      if (r < .05 && slope < .7) { put('oak', x, y, z, s, rot, tint); colliders.push({ x, z, r: .45 * s }); }
      else if (r < .11) put('bush', x, h, z, s, rot, tint);
      else if (r < .34) put('flowers', x, h, z, s, rot, 1);
      else if (r < .37) { put('rock', x, h, z, s * .6, rot, tint); colliders.push({ x, z, r: .6 * s }); }
    } else if (b === 'desierto') {
      if (r < .06 && slope < .6) { put('cactus', x, y, z, s, rot, tint); colliders.push({ x, z, r: .4 }); }
      else if (r < .1) { put('rock', x, h, z, s, rot, tint); colliders.push({ x, z, r: .9 * s }); }
      else if (r < .12) { put('dead', x, y, z, s, rot, tint); colliders.push({ x, z, r: .3 }); }
    } else if (b === 'tundra') {
      if (r < .16 && slope < .9) { put('snowpine', x, y, z, s, rot, tint); colliders.push({ x, z, r: .35 * s }); }
      else if (r < .2) { put('rock', x, h, z, s * .8, rot, tint); colliders.push({ x, z, r: .7 * s }); }
      else if (r < .22) { put('dead', x, y, z, s, rot, tint); colliders.push({ x, z, r: .3 }); }
    } else if (b === 'montana' || b === 'nieve') {
      if (r < .1) { put('boulder', x, h - .3, z, s, rot, tint); colliders.push({ x, z, r: 1.7 * s }); }
      else if (r < .18) { put('rock', x, h, z, s, rot, tint); colliders.push({ x, z, r: .9 * s }); }
      else if (r < .24 && b === 'montana' && slope < .9) { put('pine', x, y, z, s * .8, rot, tint); colliders.push({ x, z, r: .3 }); }
      else if (r < .3 && b === 'nieve' && slope < .9) { put('snowpine', x, y, z, s * .8, rot, tint); colliders.push({ x, z, r: .3 }); }
    } else if (b === 'playa') {
      if (r < .04) { put('palm', x, y, z, s, rot, tint); colliders.push({ x, z, r: .3 }); }
      else if (r < .07) put('rock', x, h, z, s * .4, rot, tint);
    }
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new V3(0, 1, 0), tc = new THREE.Color();
  for (const k in lists) {
    const L = lists[k];
    const im = new THREE.InstancedMesh(DECO_LO[k], decoMat, L.length); im.userData.kind = k;
    L.forEach((e, i) => {
      q.setFromAxisAngle(up, e.rot); m4.compose(new V3(e.x, e.y, e.z), q, new V3(e.s, e.s, e.s)); im.setMatrixAt(i, m4);
      if (k === 'flowers') tc.setHSL(pick([0, .1, .15, .58, .83, .95]), .75, .62); else tc.setRGB(e.tint, e.tint, e.tint * .96);
      im.setColorAt(i, tc);
    });
    im.castShadow = k !== 'flowers'; im.receiveShadow = true; im.frustumCulled = false;
    im.userData.pts = L.map(e => [e.x, e.z]); im.userData.shadow = im.castShadow;
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
    group.add(im);
  }
  // objetos tirados en el suelo
  const items = [];
  const nItems = rng() < .5 ? 1 : rng() < .5 ? 2 : 3;
  const wsum = Object.values(ITEMS).reduce((a, b) => a + b.w, 0);
  for (let i = 0; i < nItems; i++) {
    const x = cx * CH + 4 + rng() * (CH - 8), z = cz * CH + 4 + rng() * (CH - 8), h = groundY(x, z);
    let r = rng() * wsum, type = 'baya';
    for (const k in ITEMS) { r -= ITEMS[k].w; if (r <= 0) { type = k; break; } }
    if (h < .2) continue;
    const id = key + ':' + i;
    if (G && G.collected && G.collected[id] && Date.now() - G.collected[id] < ITEM_RESPAWN) continue;
    const m = itemModel(type); m.position.set(x, h, z); m.rotation.y = rng() * 6; group.add(m);
    if (m.userData.r) m.position.y += m.userData.r;
    const it = { id, type, mesh: m, x, z, y: h, ph: rng() * 6 }; items.push(it); worldItems.push(it);
  }
  // Centro Pokémon
  let center = null;
  if (site && site.x >= cx * CH && site.x < cx * CH + CH && site.z >= cz * CH && site.z < cz * CH + CH) {
    const m = buildCenter(); m.position.set(site.x, site.h - .05, site.z); group.add(m);
    center = { x: site.x, z: site.z, y: site.h, mesh: m, door: new V3(site.x, site.h, site.z + 4.5 + 1.6) };
    centers.push(center);
    colliders.push({ box: true, x0: site.x - 6.05, x1: site.x + 6.05, z0: site.z - 4.55, z1: site.z + 4.55 });
    for (const lx of [-2.4, 2.4]) colliders.push({ x: site.x + lx, z: site.z + 4.5 + 1.6, r: .12 });
  }
  scene.add(group);
  chunks.set(key, { cx, cz, group, colliders, items, center, geo, wgeo, grass: null, near: false });
}
function buildGrass(ch) {
  if (LOW) return null;
  const { cx, cz } = ch, rng = mulberry32(ihash(cx, cz, SEED + 77) * 4294967296);
  const pts = [], n = isTouch ? 600 : 1300;
  for (let i = 0; i < n; i++) {
    const x = cx * CH + rng() * CH, z = cz * CH + rng() * CH, h = groundY(x, z);
    if (h < .4) continue;
    const b = biomeAt(x, z, h);
    const dens = b === 'pradera' ? 1 : b === 'bosque' ? .55 : b === 'tundra' ? .25 : b === 'montana' ? .12 : 0;
    if (rng() > dens) continue;
    const [gx, gz] = groundGrad(x, z); if (Math.hypot(gx, gz) > .9) continue;
    let nearSite = false; const st = siteOf(cx, cz); if (st && Math.abs(x - st.x) < 9 && Math.abs(z - st.z - 2) < 9) nearSite = true;
    if (nearSite) continue;
    pts.push([x, h, z, .7 + rng() * .8, rng() * 6.28, b]);
  }
  if (!pts.length) return null;
  const im = new THREE.InstancedMesh(grassGeo, grassMat, pts.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new V3(0, 1, 0), c = new THREE.Color();
  pts.forEach((p, i) => {
    q.setFromAxisAngle(up, p[4]); m4.compose(new V3(p[0], p[1] - .02, p[2]), q, new V3(p[3], p[3], p[3])); im.setMatrixAt(i, m4);
    if (p[5] === 'tundra') c.set('#c8c49a'); else if (p[5] === 'montana') c.set('#a7b07a'); else if (p[5] === 'bosque') c.setRGB(.8, .9, .8); else c.setRGB(1, 1, 1);
    im.setColorAt(i, c);
  });
  im.receiveShadow = true; im.frustumCulled = false; if (im.instanceColor) im.instanceColor.needsUpdate = true;
  ch.group.add(im); return im;
}
function unloadChunk(key) {
  const ch = chunks.get(key); if (!ch) return;
  scene.remove(ch.group); ch.geo.dispose(); if (ch.wgeo) ch.wgeo.dispose();
  ch.group.traverse(o => { if (o.isInstancedMesh && o.dispose) o.dispose(); });
  for (const it of ch.items) { const i = worldItems.indexOf(it); if (i >= 0) worldItems.splice(i, 1); }
  if (ch.center) { const i = centers.indexOf(ch.center); if (i >= 0) centers.splice(i, 1); disposeModel(ch.center.mesh); }
  chunks.delete(key);
}
function updateChunks(focus, force) {
  const pcx = Math.floor(focus.x / CH), pcz = Math.floor(focus.z / CH), need = [];
  for (let dz = -VIEW; dz <= VIEW; dz++) for (let dx = -VIEW; dx <= VIEW; dx++) {
    const k = (pcx + dx) + ',' + (pcz + dz);
    if (!chunks.has(k)) need.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
  }
  need.sort((a, b) => a[2] - b[2]);
  const n = force ? need.length : Math.min(1, need.length);
  for (let i = 0; i < n; i++) buildChunk(need[i][0], need[i][1]);
  let grassBuilt = 0;
  for (const [k, ch] of chunks) {
    if (Math.abs(ch.cx - pcx) > VIEW + 1 || Math.abs(ch.cz - pcz) > VIEW + 1) { unloadChunk(k); continue; }
    const near = Math.abs(ch.cx - pcx) <= 1 && Math.abs(ch.cz - pcz) <= 1;
    if (ch.near !== near) {
      if (near && (force || grassBuilt < 1)) { ch.grass = buildGrass(ch); grassBuilt++; ch.near = true; }
      else if (!near) { if (ch.grass) { ch.group.remove(ch.grass); ch.grass.dispose(); ch.grass = null; } ch.near = false; }
      ch.group.children.forEach(o => { if (o.isInstancedMesh && o !== ch.grass && o.userData.kind) { o.castShadow = ch.near && o.userData.shadow; o.geometry = ch.near ? DECO[o.userData.kind] : DECO_LO[o.userData.kind]; } });
    }
  }
}
// oculta temporalmente vegetación que tapa la cámara en combate
const hiddenDeco = [];
function hideDecoWhere(test) {
  const m4 = new THREE.Matrix4(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const ch of chunks.values()) ch.group.children.forEach(im => {
    if (!im.isInstancedMesh || !im.userData.pts) return;
    let touched = false;
    im.userData.pts.forEach((p, i) => { if (!test(p[0], p[1])) return; im.getMatrixAt(i, m4); hiddenDeco.push({ im, i, m: m4.clone() }); im.setMatrixAt(i, zero); touched = true; });
    if (touched) im.instanceMatrix.needsUpdate = true;
  });
}
function restoreDeco() { for (const h of hiddenDeco) { h.im.setMatrixAt(h.i, h.m); h.im.instanceMatrix.needsUpdate = true; } hiddenDeco.length = 0; }
function nearbyColliders(x, z) {
  const res = [], cx = Math.floor(x / CH), cz = Math.floor(z / CH);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const ch = chunks.get((cx + dx) + ',' + (cz + dz)); if (ch) for (const c of ch.colliders) res.push(c); }
  return res;
}
// empuja un círculo fuera de los obstáculos (árboles, rocas, edificios)
function resolveCollisions(p, r) {
  for (const c of nearbyColliders(p.x, p.z)) {
    if (c.box) {
      const qx = clamp(p.x, c.x0, c.x1), qz = clamp(p.z, c.z0, c.z1), dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
      if (d < r) {
        if (d > 1e-4) { p.x = qx + dx / d * r; p.z = qz + dz / d * r; }
        else { const l = p.x - c.x0, ri = c.x1 - p.x, f = c.z1 - p.z, b = p.z - c.z0, mn = Math.min(l, ri, f, b); if (mn === l) p.x = c.x0 - r; else if (mn === ri) p.x = c.x1 + r; else if (mn === f) p.z = c.z1 + r; else p.z = c.z0 - r; }
      }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + r;
      if (d < min && d > 1e-4) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; }
    }
  }
}
