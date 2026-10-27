'use strict';
// ============================================================
//  Utilidades generales
// ============================================================
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const wait = ms => new Promise(r => setTimeout(r, ms));
function weighted(entries) {
  let tot = 0; for (const e of entries) tot += e[1];
  let r = Math.random() * tot;
  for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
  return entries[entries.length - 1][0];
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function ihash(x, z, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, z, s) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  return lerp(lerp(ihash(xi, zi, s), ihash(xi + 1, zi, s), u), lerp(ihash(xi, zi + 1, s), ihash(xi + 1, zi + 1, s), u), v);
}
function fbm(x, z, s, oct) {
  let t = 0, amp = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { t += vnoise(x * f, z * f, s + i * 17) * amp; n += amp; amp *= 0.5; f *= 2.03; }
  return t / n;
}
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } }
};

// ============================================================
//  Tipos y tabla de efectividad (valores de los juegos)
// ============================================================
const TYPES = {
  normal: { n: 'Normal', c: '#a8a77a' }, fuego: { n: 'Fuego', c: '#ee8130' }, agua: { n: 'Agua', c: '#6390f0' },
  planta: { n: 'Planta', c: '#7ac74c' }, electrico: { n: 'Eléctrico', c: '#f7d02c' }, hielo: { n: 'Hielo', c: '#96d9d6' },
  veneno: { n: 'Veneno', c: '#a33ea1' }, tierra: { n: 'Tierra', c: '#e2bf65' }, volador: { n: 'Volador', c: '#a98ff3' },
  roca: { n: 'Roca', c: '#b6a136' }, fantasma: { n: 'Fantasma', c: '#735797' }, siniestro: { n: 'Siniestro', c: '#705746' }
};
const EFF = {
  normal: { roca: .5, fantasma: 0 },
  fuego: { fuego: .5, agua: .5, planta: 2, hielo: 2, roca: .5 },
  agua: { fuego: 2, agua: .5, planta: .5, tierra: 2, roca: 2 },
  electrico: { agua: 2, electrico: .5, planta: .5, tierra: 0, volador: 2 },
  planta: { fuego: .5, agua: 2, planta: .5, veneno: .5, tierra: 2, volador: .5, roca: 2 },
  hielo: { fuego: .5, agua: .5, planta: 2, hielo: .5, tierra: 2, volador: 2 },
  veneno: { planta: 2, veneno: .5, tierra: .5, roca: .5, fantasma: .5 },
  tierra: { fuego: 2, electrico: 2, planta: .5, veneno: 2, volador: 0, roca: 2 },
  volador: { electrico: .5, planta: 2, roca: .5 },
  roca: { fuego: 2, hielo: 2, tierra: .5, volador: 2 },
  fantasma: { normal: 0, fantasma: 2, siniestro: .5 },
  siniestro: { fantasma: 2, siniestro: .5 }
};
const effMul = (mt, types) => types.reduce((m, t) => m * ((EFF[mt] && EFF[mt][t] != null) ? EFF[mt][t] : 1), 1);

// ============================================================
//  Movimientos
// ============================================================
const MOVES = {
  placaje: { n: 'Placaje', t: 'normal', p: 40, acc: 100, contact: true },
  grunido: { n: 'Gruñido', t: 'normal', p: 0, acc: 100, fx: 'foe:atk:-1' },
  malicioso: { n: 'Malicioso', t: 'normal', p: 0, acc: 100, fx: 'foe:def:-1' },
  ataquerapido: { n: 'Ataque Rápido', t: 'normal', p: 40, acc: 100, prio: 1, contact: true },
  mordisco: { n: 'Mordisco', t: 'siniestro', p: 60, acc: 100, contact: true },
  golpecuerpo: { n: 'Golpe Cuerpo', t: 'normal', p: 85, acc: 100, contact: true },
  danzaespada: { n: 'Danza Espada', t: 'normal', p: 0, acc: 100, fx: 'self:atk:2' },
  hiperrayo: { n: 'Hiperrayo', t: 'normal', p: 130, acc: 90 },
  salpicadura: { n: 'Salpicadura', t: 'normal', p: 0, acc: 100, fx: 'none' },
  ascuas: { n: 'Ascuas', t: 'fuego', p: 40, acc: 100 },
  colmilloigneo: { n: 'Colmillo Ígneo', t: 'fuego', p: 65, acc: 95, contact: true },
  lanzallamas: { n: 'Lanzallamas', t: 'fuego', p: 90, acc: 100 },
  llamarada: { n: 'Llamarada', t: 'fuego', p: 110, acc: 85 },
  pistolaagua: { n: 'Pistola Agua', t: 'agua', p: 40, acc: 100 },
  hidropulso: { n: 'Hidropulso', t: 'agua', p: 60, acc: 100 },
  surf: { n: 'Surf', t: 'agua', p: 90, acc: 100 },
  hidrobomba: { n: 'Hidrobomba', t: 'agua', p: 110, acc: 80 },
  latigocepa: { n: 'Látigo Cepa', t: 'planta', p: 45, acc: 100, contact: true },
  hojaafilada: { n: 'Hoja Afilada', t: 'planta', p: 55, acc: 95 },
  bombagermen: { n: 'Bomba Germen', t: 'planta', p: 80, acc: 100 },
  rayosolar: { n: 'Rayo Solar', t: 'planta', p: 110, acc: 100 },
  impactrueno: { n: 'Impactrueno', t: 'electrico', p: 40, acc: 100 },
  chispa: { n: 'Chispa', t: 'electrico', p: 65, acc: 100, contact: true },
  rayo: { n: 'Rayo', t: 'electrico', p: 90, acc: 100 },
  trueno: { n: 'Trueno', t: 'electrico', p: 110, acc: 70 },
  agilidad: { n: 'Agilidad', t: 'normal', p: 0, acc: 100, fx: 'self:spd:2' },
  nievepolvo: { n: 'Nieve Polvo', t: 'hielo', p: 40, acc: 100 },
  vientohielo: { n: 'Viento Hielo', t: 'hielo', p: 55, acc: 95 },
  rayohielo: { n: 'Rayo Hielo', t: 'hielo', p: 90, acc: 100 },
  ventisca: { n: 'Ventisca', t: 'hielo', p: 110, acc: 70 },
  acido: { n: 'Ácido', t: 'veneno', p: 40, acc: 100 },
  bombalodo: { n: 'Bomba Lodo', t: 'veneno', p: 90, acc: 100 },
  bofetonlodo: { n: 'Bofetón Lodo', t: 'tierra', p: 40, acc: 100 },
  excavar: { n: 'Excavar', t: 'tierra', p: 80, acc: 100, contact: true },
  terremoto: { n: 'Terremoto', t: 'tierra', p: 100, acc: 100 },
  tornado: { n: 'Tornado', t: 'volador', p: 40, acc: 100 },
  ataqueala: { n: 'Ataque Ala', t: 'volador', p: 60, acc: 100, contact: true },
  pajaroosado: { n: 'Pájaro Osado', t: 'volador', p: 110, acc: 100, contact: true },
  lanzarrocas: { n: 'Lanzarrocas', t: 'roca', p: 50, acc: 90 },
  defensaferrea: { n: 'Defensa Férrea', t: 'normal', p: 0, acc: 100, fx: 'self:def:2' },
  avalancha: { n: 'Avalancha', t: 'roca', p: 75, acc: 90 },
  rocaafilada: { n: 'Roca Afilada', t: 'roca', p: 100, acc: 80 },
  lenguetazo: { n: 'Lengüetazo', t: 'fantasma', p: 40, acc: 100, contact: true },
  punosombra: { n: 'Puño Sombra', t: 'fantasma', p: 60, acc: 100 },
  bolasombra: { n: 'Bola Sombra', t: 'fantasma', p: 80, acc: 100 }
};
const ppMax = id => { const p = MOVES[id].p; return p === 0 ? 20 : p <= 50 ? 30 : p <= 75 ? 20 : p <= 95 ? 15 : 8; };
const LEARN = {
  normal: [['placaje', 1], ['grunido', 3], ['ataquerapido', 7], ['malicioso', 10], ['mordisco', 15], ['golpecuerpo', 24], ['danzaespada', 30], ['hiperrayo', 44]],
  fuego: [['ascuas', 5], ['colmilloigneo', 14], ['lanzallamas', 26], ['llamarada', 42]],
  agua: [['pistolaagua', 5], ['hidropulso', 14], ['surf', 28], ['hidrobomba', 42]],
  planta: [['latigocepa', 5], ['hojaafilada', 14], ['bombagermen', 26], ['rayosolar', 42]],
  electrico: [['impactrueno', 5], ['chispa', 14], ['agilidad', 20], ['rayo', 28], ['trueno', 42]],
  hielo: [['nievepolvo', 5], ['vientohielo', 14], ['rayohielo', 28], ['ventisca', 42]],
  veneno: [['acido', 8], ['bombalodo', 30]],
  tierra: [['bofetonlodo', 5], ['excavar', 18], ['terremoto', 34]],
  volador: [['tornado', 5], ['ataqueala', 14], ['pajaroosado', 36]],
  roca: [['lanzarrocas', 5], ['defensaferrea', 12], ['avalancha', 18], ['rocaafilada', 32]],
  fantasma: [['lenguetazo', 5], ['punosombra', 16], ['bolasombra', 30]],
  siniestro: []
};

// ============================================================
//  Pokémon. H = altura real (m). mode: walk | amphi | swim | fly | levitate
//  base = PS / ataque / defensa / velocidad (medias de las estadísticas oficiales)
// ============================================================
const SPECIES = {
  bulbasaur: { dex: 1, name: 'Bulbasaur', types: ['planta', 'veneno'], H: .7, mode: 'walk', base: { hp: 45, atk: 57, def: 57, spd: 45 }, rate: 45, evo: [{ to: 'ivysaur', lvl: 16 }], desc: 'Lleva una semilla en el lomo desde que nace. Crece absorbiendo la luz del sol.' },
  ivysaur: { dex: 2, name: 'Ivysaur', types: ['planta', 'veneno'], H: 1.0, mode: 'walk', base: { hp: 60, atk: 71, def: 71, spd: 60 }, rate: 45, evo: [{ to: 'venusaur', lvl: 32 }] },
  venusaur: { dex: 3, name: 'Venusaur', types: ['planta', 'veneno'], H: 2.0, mode: 'walk', base: { hp: 80, atk: 91, def: 91, spd: 80 }, rate: 45 },
  charmander: { dex: 4, name: 'Charmander', types: ['fuego'], H: .6, mode: 'walk', base: { hp: 39, atk: 56, def: 47, spd: 65 }, rate: 45, evo: [{ to: 'charmeleon', lvl: 16 }], desc: 'La llama de su cola indica su salud. Si se apagara, su vida correría peligro.' },
  charmeleon: { dex: 5, name: 'Charmeleon', types: ['fuego'], H: 1.1, mode: 'walk', base: { hp: 58, atk: 72, def: 62, spd: 80 }, rate: 45, evo: [{ to: 'charizard', lvl: 36 }] },
  charizard: { dex: 6, name: 'Charizard', types: ['fuego', 'volador'], H: 1.7, mode: 'walk', base: { hp: 78, atk: 97, def: 85, spd: 100 }, rate: 45 },
  squirtle: { dex: 7, name: 'Squirtle', types: ['agua'], H: .5, mode: 'amphi', base: { hp: 44, atk: 49, def: 64, spd: 43 }, rate: 45, evo: [{ to: 'wartortle', lvl: 16 }], desc: 'Se protege en su caparazón y dispara chorros de agua a gran presión.' },
  wartortle: { dex: 8, name: 'Wartortle', types: ['agua'], H: 1.0, mode: 'amphi', base: { hp: 59, atk: 64, def: 80, spd: 58 }, rate: 45, evo: [{ to: 'blastoise', lvl: 36 }] },
  blastoise: { dex: 9, name: 'Blastoise', types: ['agua'], H: 1.6, mode: 'amphi', base: { hp: 79, atk: 84, def: 102, spd: 78 }, rate: 45, surf: { speed: 7 } },
  pidgey: { dex: 16, name: 'Pidgey', types: ['normal', 'volador'], H: .3, mode: 'fly', base: { hp: 40, atk: 38, def: 38, spd: 56 }, rate: 255, evo: [{ to: 'pidgeotto', lvl: 18 }] },
  pidgeotto: { dex: 17, name: 'Pidgeotto', types: ['normal', 'volador'], H: 1.1, mode: 'fly', base: { hp: 63, atk: 55, def: 55, spd: 71 }, rate: 120, evo: [{ to: 'pidgeot', lvl: 36 }] },
  pidgeot: { dex: 18, name: 'Pidgeot', types: ['normal', 'volador'], H: 1.5, mode: 'fly', base: { hp: 83, atk: 75, def: 72, spd: 101 }, rate: 45 },
  rattata: { dex: 19, name: 'Rattata', types: ['normal'], H: .3, mode: 'walk', base: { hp: 30, atk: 38, def: 35, spd: 72 }, rate: 255, evo: [{ to: 'raticate', lvl: 20 }] },
  raticate: { dex: 20, name: 'Raticate', types: ['normal'], H: .7, mode: 'walk', base: { hp: 55, atk: 66, def: 65, spd: 97 }, rate: 127 },
  pikachu: { dex: 25, name: 'Pikachu', types: ['electrico'], H: .4, mode: 'walk', base: { hp: 35, atk: 52, def: 45, spd: 90 }, rate: 190, evo: [{ to: 'raichu', item: 'piedratrueno' }] },
  raichu: { dex: 26, name: 'Raichu', types: ['electrico'], H: .8, mode: 'walk', base: { hp: 60, atk: 90, def: 68, spd: 110 }, rate: 75 },
  sandshrew: { dex: 27, name: 'Sandshrew', types: ['tierra'], H: .6, mode: 'walk', base: { hp: 50, atk: 52, def: 70, spd: 40 }, rate: 255, evo: [{ to: 'sandslash', lvl: 22 }] },
  sandslash: { dex: 28, name: 'Sandslash', types: ['tierra'], H: 1.0, mode: 'walk', base: { hp: 75, atk: 77, def: 95, spd: 65 }, rate: 90 },
  vulpix: { dex: 37, name: 'Vulpix', types: ['fuego'], H: .6, mode: 'walk', base: { hp: 38, atk: 46, def: 55, spd: 65 }, rate: 190, evo: [{ to: 'ninetales', item: 'piedrafuego' }] },
  ninetales: { dex: 38, name: 'Ninetales', types: ['fuego'], H: 1.1, mode: 'walk', base: { hp: 73, atk: 78, def: 90, spd: 100 }, rate: 75 },
  geodude: { dex: 74, name: 'Geodude', types: ['roca', 'tierra'], H: .4, mode: 'levitate', hover: .25, base: { hp: 40, atk: 55, def: 65, spd: 20 }, rate: 255, evo: [{ to: 'graveler', lvl: 25 }] },
  graveler: { dex: 75, name: 'Graveler', types: ['roca', 'tierra'], H: 1.0, mode: 'walk', base: { hp: 55, atk: 70, def: 80, spd: 35 }, rate: 120 },
  gastly: { dex: 92, name: 'Gastly', types: ['fantasma', 'veneno'], H: 1.3, mode: 'levitate', hover: .8, base: { hp: 30, atk: 70, def: 35, spd: 80 }, rate: 190, evo: [{ to: 'haunter', lvl: 25 }] },
  haunter: { dex: 93, name: 'Haunter', types: ['fantasma', 'veneno'], H: 1.6, mode: 'levitate', hover: .6, base: { hp: 45, atk: 87, def: 50, spd: 95 }, rate: 90, evo: [{ to: 'gengar', lvl: 38 }] },
  gengar: { dex: 94, name: 'Gengar', types: ['fantasma', 'veneno'], H: 1.5, mode: 'walk', base: { hp: 60, atk: 95, def: 70, spd: 110 }, rate: 45 },
  magikarp: { dex: 129, name: 'Magikarp', types: ['agua'], H: .9, anchor: 'center', mode: 'swim', base: { hp: 20, atk: 12, def: 40, spd: 80 }, rate: 255, evo: [{ to: 'gyarados', lvl: 20 }], learn: [['salpicadura', 1], ['placaje', 15]] },
  gyarados: { dex: 130, name: 'Gyarados', types: ['agua', 'volador'], H: 5.2, anchor: 'waterline', mode: 'swim', base: { hp: 95, atk: 100, def: 90, spd: 81 }, rate: 45, surf: { speed: 10 } },
  lapras: { dex: 131, name: 'Lapras', types: ['agua', 'hielo'], H: 2.0, anchor: 'waterline', mode: 'swim', base: { hp: 130, atk: 85, def: 95, spd: 60 }, rate: 45, surf: { speed: 8 } },
  eevee: { dex: 133, name: 'Eevee', types: ['normal'], H: .3, mode: 'walk', base: { hp: 55, atk: 50, def: 55, spd: 55 }, rate: 45, evo: [{ to: 'vaporeon', item: 'piedraagua' }, { to: 'jolteon', item: 'piedratrueno' }, { to: 'flareon', item: 'piedrafuego' }] },
  vaporeon: { dex: 134, name: 'Vaporeon', types: ['agua'], H: 1.0, mode: 'amphi', base: { hp: 130, atk: 88, def: 77, spd: 65 }, rate: 45 },
  jolteon: { dex: 135, name: 'Jolteon', types: ['electrico'], H: .8, mode: 'walk', base: { hp: 65, atk: 88, def: 77, spd: 130 }, rate: 45 },
  flareon: { dex: 136, name: 'Flareon', types: ['fuego'], H: .9, mode: 'walk', base: { hp: 65, atk: 113, def: 88, spd: 65 }, rate: 45 },
  swinub: { dex: 220, name: 'Swinub', types: ['hielo', 'tierra'], H: .4, mode: 'walk', base: { hp: 50, atk: 40, def: 35, spd: 50 }, rate: 225, evo: [{ to: 'piloswine', lvl: 33 }] },
  piloswine: { dex: 221, name: 'Piloswine', types: ['hielo', 'tierra'], H: 1.1, mode: 'walk', base: { hp: 100, atk: 80, def: 70, spd: 50 }, rate: 75 }
};
const PREVO = {};
for (const k in SPECIES) for (const e of (SPECIES[k].evo || [])) PREVO[e.to] = k;
const stageOf = id => { let s = 1; while (PREVO[id]) { id = PREVO[id]; s++; } return s; };
const DEX_ORDER = Object.keys(SPECIES).sort((a, b) => SPECIES[a].dex - SPECIES[b].dex);
const canWater = sp => ['swim', 'amphi', 'levitate', 'fly'].includes(SPECIES[sp].mode);
const canLand = sp => SPECIES[sp].mode !== 'swim';

// ============================================================
//  Objetos
// ============================================================
const ITEMS = {
  pokeball: { n: 'Poké Ball', d: 'Ball básica para atrapar Pokémon salvajes.', c: '#e53935', kind: 'ball', mult: 1, w: 18 },
  superball: { n: 'Super Ball', d: 'Mejor índice de captura que la Poké Ball (×1,5).', c: '#1e6fe0', kind: 'ball', mult: 1.5, w: 6 },
  ultraball: { n: 'Ultra Ball', d: 'Gran índice de captura (×2).', c: '#2b2b2b', kind: 'ball', mult: 2, w: 2 },
  baya: { n: 'Baya Aranja', d: 'Restaura 10 PS.', c: '#3f7fd9', kind: 'heal', amt: 10, battle: true, w: 26 },
  pocion: { n: 'Poción', d: 'Restaura 20 PS.', c: '#9b59d0', kind: 'heal', amt: 20, battle: true, w: 14 },
  superpocion: { n: 'Superpoción', d: 'Restaura 60 PS.', c: '#e05a9b', kind: 'heal', amt: 60, battle: true, w: 5 },
  hiperpocion: { n: 'Hiperpoción', d: 'Restaura 120 PS.', c: '#e07a2f', kind: 'heal', amt: 120, battle: true, w: 1.5 },
  revivir: { n: 'Revivir', d: 'Reanima a un Pokémon debilitado con la mitad de sus PS.', c: '#f2c53d', kind: 'revive', battle: true, w: 3 },
  eter: { n: 'Éter', d: 'Restaura los PP de todos los movimientos.', c: '#45b4e6', kind: 'pp', battle: true, w: 4 },
  proteina: { n: 'Proteína', d: '+3 de Ataque permanente.', c: '#d84a4a', kind: 'boost', stat: 'atk', v: 3, w: 3 },
  hierro: { n: 'Hierro', d: '+3 de Defensa permanente.', c: '#7a8a99', kind: 'boost', stat: 'def', v: 3, w: 3 },
  carburante: { n: 'Carburante', d: '+3 de Velocidad permanente.', c: '#3bb06b', kind: 'boost', stat: 'spd', v: 3, w: 3 },
  masps: { n: 'Más PS', d: '+5 de PS máximos permanentes.', c: '#e8c13a', kind: 'boost', stat: 'hp', v: 5, w: 3 },
  caramelo: { n: 'Caramelo Raro', d: 'Sube un nivel al instante.', c: '#7fb5ff', kind: 'level', w: 1.5 },
  piedrafuego: { n: 'Piedra Fuego', d: 'Hace evolucionar a Vulpix y Eevee.', c: '#ff7a2a', kind: 'stone', w: 1.2 },
  piedratrueno: { n: 'Piedra Trueno', d: 'Hace evolucionar a Pikachu y Eevee.', c: '#9be04a', kind: 'stone', w: 1.2 },
  piedraagua: { n: 'Piedra Agua', d: 'Hace evolucionar a Eevee.', c: '#3aa0ff', kind: 'stone', w: 1.2 }
};
const BONUS_CAP = 30;

// ============================================================
//  Lógica de cada Pokémon
// ============================================================
let uidSeq = Date.now() % 100000;
const totalExp = L => Math.floor(0.8 * L * L * L);
function stat(c, k) {
  const b = SPECIES[c.sp].base[k], L = c.lvl, bo = (c.bonus && c.bonus[k]) || 0;
  return k === 'hp' ? Math.floor(b * 2 * L / 100) + L + 10 + bo : Math.floor(b * 2 * L / 100) + 5 + bo;
}
const maxHP = c => stat(c, 'hp');
const typesOf = c => SPECIES[c.sp].types;
const nameOf = c => SPECIES[c.sp].name;
function learnList(c) {
  const sp = SPECIES[c.sp];
  if (sp.learn) return sp.learn;
  let list = LEARN.normal.slice();
  for (const t of sp.types) if (t !== 'normal') list = list.concat(LEARN[t]);
  return list;
}
function pickMoves(c) {
  const all = learnList(c).filter(m => m[1] <= c.lvl).map(m => m[0]);
  const T = typesOf(c), score = m => MOVES[m].p * (T.includes(MOVES[m].t) ? 1.5 : 1) * MOVES[m].acc / 100;
  const status = all.filter(m => MOVES[m].p === 0);
  const atk = all.filter(m => MOVES[m].p > 0).sort((a, b) => score(b) - score(a));
  const res = atk.slice(0, 3);
  if (status.length) res.push(status[status.length - 1]);
  for (const m of atk.slice(3)) { if (res.length >= 4) break; res.push(m); }
  return res.slice(0, 4);
}
function refreshMoves(c) {
  const old = c.moves || [], pp = c.pp || {};
  c.moves = pickMoves(c);
  const np = {};
  for (const m of c.moves) np[m] = old.includes(m) && pp[m] != null ? pp[m] : ppMax(m);
  c.pp = np;
  return c.moves.filter(m => !old.includes(m));
}
function makeCreature(sp, lvl) {
  const c = { uid: ++uidSeq, sp, lvl, exp: totalExp(lvl), bonus: { hp: 0, atk: 0, def: 0, spd: 0 }, noEvo: false };
  refreshMoves(c); c.hp = maxHP(c); return c;
}
const levelEvo = c => (SPECIES[c.sp].evo || []).find(e => e.lvl && c.lvl >= e.lvl);
const canEvolve = c => !!levelEvo(c);
const stoneEvo = (c, item) => (SPECIES[c.sp].evo || []).find(e => e.item === item);
function healFull(c) { c.hp = maxHP(c); for (const m of c.moves) c.pp[m] = ppMax(m); }
