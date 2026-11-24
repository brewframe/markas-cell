/* =====================================================================
   GEDUNG3D.JS · Markas Cell 5 lantai (Three.js) dengan karakter pixel
   Cara kerja singkat:
   1. Denah dibaca dari database (/api/gedung): lantai, ruangan, posisi.
   2. Setiap ruangan dibangun dari balok sederhana (meja, kursi, rak...) dengan
      lantai bertekstur buatan kode + cahaya matahari & bayangan lembut -> kesan HD.
   3. Karakter = sprite pixel 14x21 dari pixel.js, selalu menghadap kamera (billboard).
   4. Tiap 2 detik status dibaca. kerja -> ke meja, menunggu -> berdiri melambai + "!",
      santai -> naik lift ke rooftop (kolam, basket, teras, garasi).
   ===================================================================== */
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";
import { RoomEnvironment } from "three/addons/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/RoundedBoxGeometry.js";

const M = window.MARKAS, P = window.PIXEL, esc = M.esc;
const $ = id => document.getElementById(id);

// ---------- ukuran gedung (meter) ----------
const TINGGI = 4;                 // tinggi satu lantai
const DASAR = 0.4;                // tinggi alas gedung
const LY = n => DASAR + (n - 1) * TINGGI;   // ketinggian lantai ke-n
const X0 = -15, X1 = 15, Z0 = -9, Z1 = 9;
const LIFT = { x: 13.5, z: -6.2, pintuZ: -3.2 };
const KORIDOR_Z = 0, JALAN_ATAP_Z = 1.5;
const TINGGI_ORANG = 1.85, LEBAR_ORANG = TINGGI_ORANG * 14 / 21;

// =====================================================================
//  PERSIAPAN
// =====================================================================
try { await M.muat(); } catch (e) { $("memuat").textContent = e.message; M.navLive(e); throw e; }
const A = M.agent, LANTAI = M.gedung.lantai;

const kanvas = $("kanvas3d"), panggung = $("panggung");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: kanvas, antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (e) {
  $("memuat").textContent = "Browser ini tidak mendukung WebGL (3D). Coba Chrome/Edge terbaru.";
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;
scene.fog = new THREE.Fog(0xdcebf5, 110, 260);

const kamera = new THREE.PerspectiveCamera(38, 1, 0.5, 600);
kamera.position.set(34, 30, 62);
const kontrol = new OrbitControls(kamera, kanvas);
kontrol.enableDamping = true; kontrol.dampingFactor = 0.08;
kontrol.minDistance = 10; kontrol.maxDistance = 140;
kontrol.maxPolarAngle = Math.PI * 0.47; kontrol.minPolarAngle = 0.15;
kontrol.target.set(0, 9, 0);
kontrol.autoRotateSpeed = 0.6;

// ---------- cahaya: siang hari ----------
scene.add(new THREE.HemisphereLight(0xe3f1ff, 0xcbb894, 0.85));
const matahari = new THREE.DirectionalLight(0xfff1dc, 2.3);
matahari.position.set(26, 46, 38);
matahari.castShadow = true;
matahari.shadow.mapSize.set(2048, 2048);
Object.assign(matahari.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
matahari.shadow.bias = -0.0004; matahari.shadow.normalBias = 0.03; matahari.shadow.radius = 4;
scene.add(matahari, matahari.target);
matahari.target.position.set(0, 8, 0);

// =====================================================================
//  PEMBANTU: bahan, balok, tekstur buatan kode
// =====================================================================
const cacheBahan = new Map();
function bahan(warna, o = {}) {
  const k = warna + JSON.stringify(o);
  if (!cacheBahan.has(k)) cacheBahan.set(k, new THREE.MeshStandardMaterial(Object.assign({ color: warna, roughness: 0.78, metalness: 0 }, o)));
  return cacheBahan.get(k);
}
const KACA = new THREE.MeshPhysicalMaterial({ color: 0xbfe3f5, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const cacheGeo = new Map();
function geoBox(w, h, d) { const k = `${w}|${h}|${d}`; if (!cacheGeo.has(k)) cacheGeo.set(k, new THREE.BoxGeometry(w, h, d)); return cacheGeo.get(k); }
function geoRound(w, h, d, r) { const k = `r${w}|${h}|${d}|${r}`; if (!cacheGeo.has(k)) cacheGeo.set(k, new RoundedBoxGeometry(w, h, d, 3, r)); return cacheGeo.get(k); }

/** balok dengan alas di y (bukan tengah) supaya mudah menaruh di lantai */
function kotak(induk, w, h, d, warna, x, y, z, o = {}) {
  const m = new THREE.Mesh(o.bulat ? geoRound(w, h, d, o.bulat) : geoBox(w, h, d), warna.isMaterial ? warna : bahan(warna, o.bahan));
  m.position.set(x, y + h / 2, z);
  if (o.ry) m.rotation.y = o.ry;
  m.castShadow = o.bayang !== false; m.receiveShadow = true;
  induk.add(m); return m;
}
function silinder(induk, rAtas, rBawah, h, warna, x, y, z, o = {}) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rAtas, rBawah, h, o.seg || 20), warna.isMaterial ? warna : bahan(warna, o.bahan));
  m.position.set(x, y + h / 2, z); m.castShadow = o.bayang !== false; m.receiveShadow = true;
  induk.add(m); return m;
}
// logo Menara Agent (sama dengan img/logo.svg), digambar langsung ke kanvas
const LOGO = [[0,0,240,240,"#1c1a17",52],[112,20,16,16,"#e8a317",0],[116,36,8,16,"#f5f1e8",0],[64,52,112,44,"#f5f1e8",6],[84,66,20,14,"#e8a317",0],[136,66,20,14,"#e8a317",0],[64,104,112,22,"#f5f1e8",0],[74,110,16,10,"#1c1a17",0],[99,110,16,10,"#f2c14e",0],[124,110,16,10,"#1c1a17",0],[149,110,16,10,"#1c1a17",0],[64,132,112,22,"#f5f1e8",0],[74,138,16,10,"#1c1a17",0],[99,138,16,10,"#2ec4b6",0],[124,138,16,10,"#1c1a17",0],[149,138,16,10,"#1c1a17",0],[64,160,112,22,"#f5f1e8",0],[74,166,16,10,"#1c1a17",0],[99,166,16,10,"#ab7df8",0],[124,166,16,10,"#1c1a17",0],[149,166,16,10,"#1c1a17",0],[64,188,112,22,"#f5f1e8",0],[74,194,16,10,"#1c1a17",0],[99,194,16,10,"#4cc38a",0],[124,194,16,10,"#1c1a17",0],[149,194,16,10,"#1c1a17",0],[44,216,152,6,"#f5f1e8",3]];
function gambarLogo(c, x, y, ukuran) {
  const k = ukuran / 240;
  LOGO.forEach(([lx, ly, lw, lh, warna, rx]) => {
    c.fillStyle = warna; c.beginPath();
    c.roundRect(x + lx * k, y + ly * k, lw * k, lh * k, rx * k); c.fill();
  });
}
function kanvasTeks(w, h, gambar) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  gambar(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
  return t;
}
const acak = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

// tekstur lantai (dibuat sekali, diulang)
const POLA = {};
function tekLantai(jenis) {
  if (POLA[jenis]) return POLA[jenis];
  const warna = {
    kayu: ["#b98552", "#a87444", "#c79462"], kayuTerang: ["#dcb98a", "#cfa977", "#e6c79c"], kayuGelap: ["#7a5236", "#6b462d", "#87603f"],
    karpetHijau: ["#5f9c7e"], karpetBiru: ["#5d82b3"], karpetPink: ["#d79bb5"], karpetAbu: ["#8b909c"],
    ubinGelap: ["#4b5263"], marmer: ["#efebe3"], koridor: ["#e7e1d5"], beton: ["#5a5e66"], dek: ["#b88a5c", "#a97c50", "#c39668"], atap: ["#d9d4ca"],
  }[jenis] || ["#ccc"];
  const t = kanvasTeks(256, 256, (c, w, h) => {
    c.fillStyle = warna[0]; c.fillRect(0, 0, w, h);
    if (jenis.startsWith("kayu") || jenis === "dek") {
      const papan = jenis === "dek" ? 32 : 21;
      for (let y = 0, i = 0; y < h; y += papan, i++) {
        c.fillStyle = warna[i % warna.length]; c.fillRect(0, y, w, papan - 2);
        c.fillStyle = "rgba(0,0,0,.18)"; c.fillRect(0, y + papan - 2, w, 2);
        const g = (i * 97) % w; c.fillRect(g, y, 2, papan - 2);
        c.fillStyle = "rgba(255,255,255,.05)";
        for (let k = 0; k < 6; k++) c.fillRect(0, y + 3 + k * 3, w, 1);
      }
    } else if (jenis.startsWith("karpet")) {
      for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(${acak() < .5 ? "0,0,0" : "255,255,255"},${0.03 + acak() * .06})`; c.fillRect(acak() * w, acak() * h, 2, 2); }
    } else if (jenis === "marmer") {
      c.strokeStyle = "rgba(160,150,135,.35)"; c.lineWidth = 1.2;
      for (let i = 0; i < 7; i++) { c.beginPath(); let x = acak() * w, y = 0; c.moveTo(x, y); while (y < h) { x += (acak() - .5) * 30; y += 18; c.lineTo(x, y); } c.stroke(); }
      c.strokeStyle = "rgba(0,0,0,.08)"; c.lineWidth = 2; c.strokeRect(0, 0, w, h);
    } else {
      const s = jenis === "ubinGelap" ? 64 : jenis === "beton" ? 128 : 64;
      for (let i = 0; i < 4000; i++) { c.fillStyle = `rgba(255,255,255,${acak() * .05})`; c.fillRect(acak() * w, acak() * h, 2, 2); }
      c.strokeStyle = jenis === "beton" ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.12)"; c.lineWidth = 2;
      for (let x = 0; x <= w; x += s) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
      for (let y = 0; y <= h; y += s) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  POLA[jenis] = t; return t;
}
function lantaiBertekstur(induk, x, z, w, d, y, jenis, skala = 2.5) {
  const t = tekLantai(jenis).clone(); t.needsUpdate = true; t.repeat.set(w / skala, d / skala);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: jenis === "marmer" || jenis === "beton" ? 0.25 : 0.85, metalness: 0 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x + w / 2, y + 0.012, z + d / 2); m.receiveShadow = true;
  induk.add(m); return m;
}

// =====================================================================
//  PERABOT (semua dari balok, ukuran dalam meter)
// =====================================================================
const LAYAR = {};   // tekstur layar monitor per jenis kerja
function tekLayar(jenis) {
  if (LAYAR[jenis]) return LAYAR[jenis];
  LAYAR[jenis] = kanvasTeks(128, 80, (c, w, h) => {
    c.fillStyle = jenis === "chart" ? "#0d1b1e" : jenis === "desain" ? "#f4f1ea" : "#141a2b"; c.fillRect(0, 0, w, h);
    if (jenis === "chart") {
      c.strokeStyle = "#2ec4b6"; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < 12; i++) { const x = 6 + i * 10, y = 50 - Math.sin(i * .9) * 14 - i * 1.5; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      for (let i = 0; i < 10; i++) { c.fillStyle = i % 3 ? "#22c55e" : "#ef4444"; c.fillRect(10 + i * 11, 58 - (i * 7) % 14, 5, 10 + (i * 5) % 9); }
    } else if (jenis === "desain") {
      ["#ab7df8", "#f78fb3", "#4fc3f7", "#ffd479"].forEach((k, i) => { c.fillStyle = k; c.fillRect(8 + i * 29, 10, 24, 24); });
      c.fillStyle = "#1c1a17"; c.fillRect(8, 44, 80, 6); c.fillStyle = "#9a9284"; c.fillRect(8, 56, 110, 4); c.fillRect(8, 64, 90, 4);
    } else if (jenis === "berita") {
      c.fillStyle = "#4fc3f7"; c.fillRect(8, 8, 60, 8);
      for (let i = 0; i < 6; i++) { c.fillStyle = "rgba(255,255,255,.55)"; c.fillRect(8, 24 + i * 8, 40 + (i * 37) % 70, 4); }
    } else {
      const warna = ["#ab7df8", "#4cc38a", "#ffd479", "#4fc3f7", "#f78fb3"];
      for (let i = 0; i < 9; i++) { c.fillStyle = warna[i % 5]; c.fillRect(8 + (i % 3) * 8, 8 + i * 7.5, 20 + (i * 29) % 70, 4); }
    }
  });
  return LAYAR[jenis];
}
const LAYAR_MATI = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.3, metalness: 0.2 });

/** meja kerja menghadap depan (+z). Agent duduk di depan meja, punggung ke kamera. */
function mejaKerja(induk, x, z, o = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z); induk.add(g);
  const w = o.lebar || 1.7, kayu = o.kayu || "#d9b98d";
  kotak(g, w, 0.06, 0.82, kayu, 0, 0.72, 0, { bulat: 0.02 });
  [[-w / 2 + .06, -.35], [w / 2 - .06, -.35], [-w / 2 + .06, .35], [w / 2 - .06, .35]].forEach(([a, b]) => kotak(g, 0.05, 0.72, 0.05, "#5b5348", a, 0, b));
  kotak(g, w - .1, 0.42, 0.03, kayu, 0, 0.3, -0.38, { bayang: false });
  // monitor menghadap agent (+z)
  kotak(g, 0.12, 0.25, 0.12, "#2b2f38", 0, 0.78, -0.2);
  const layar = new THREE.Mesh(geoBox(0.92, 0.56, 0.04), [LAYAR_MATI, LAYAR_MATI, LAYAR_MATI, LAYAR_MATI, LAYAR_MATI, LAYAR_MATI]);
  layar.position.set(0, 1.25, -0.2); layar.castShadow = true; g.add(layar);
  kotak(g, 0.5, 0.02, 0.16, "#e9e6df", 0, 0.78, 0.12);                       // keyboard
  if (o.mug !== false) silinder(g, .045, .045, .1, o.aksen || "#e8a317", w / 2 - .25, 0.78, 0.05);
  if (o.tanaman) tanaman(g, -w / 2 + .2, -.15, 0.5, 0.78);
  // kursi kantor di depan meja
  const k = new THREE.Group(); k.position.set(0, 0, 0.62); g.add(k);
  silinder(k, .04, .04, .42, "#3a3f4a", 0, 0.06, 0);
  kotak(k, .5, .07, .5, o.kursi || "#2f3542", 0, 0.48, 0, { bulat: .03 });
  kotak(k, .5, .5, .07, o.kursi || "#2f3542", 0, 0.55, .24, { bulat: .03 });
  kotak(k, .6, .04, .6, "#3a3f4a", 0, 0.02, 0, { bayang: false });
  return { grup: g, layar, jenisLayar: o.layar || "kode" };
}
function tanaman(induk, x, z, s = 1, y = 0) {
  silinder(induk, .22 * s, .17 * s, .4 * s, "#c9b8a0", x, y, z, { seg: 14 });
  const daun = new THREE.Mesh(new THREE.IcosahedronGeometry(.42 * s, 1), bahan("#5f9e5f", { flatShading: true, roughness: .9 }));
  daun.position.set(x, y + .4 * s + .38 * s, z); daun.scale.y = 1.25; daun.castShadow = true; induk.add(daun);
  const d2 = daun.clone(); d2.material = bahan("#4f8a52", { flatShading: true, roughness: .9 }); d2.scale.setScalar(.7); d2.position.y += .45 * s; d2.position.x += .1 * s; induk.add(d2);
}
let yAktif = 0;   // ketinggian lantai yang sedang dibangun (dipakai sofa, rak, lampu)
function sofa(induk, x, z, w, warna, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, yAktif, z); g.rotation.y = ry; induk.add(g);
  kotak(g, w, .42, .85, warna, 0, 0, 0, { bulat: .08 });
  kotak(g, w, .5, .22, warna, 0, .35, -.32, { bulat: .08 });
  kotak(g, .2, .32, .85, warna, -w / 2 + .1, .35, 0, { bulat: .06 });
  kotak(g, .2, .32, .85, warna, w / 2 - .1, .35, 0, { bulat: .06 });
  for (let i = 0; i < Math.floor(w / .8); i++) kotak(g, .7, .1, .62, new THREE.Color(warna).offsetHSL(0, 0, .06).getStyle(), -w / 2 + .55 + i * .8, .42, .06, { bulat: .04 });
  return g;
}
function rakBuku(induk, x, z, w = 2, h = 2.2, ry = 0) {
  const g = new THREE.Group(); g.position.set(x, yAktif, z); g.rotation.y = ry; induk.add(g);
  kotak(g, w, h, .4, "#8a6748", 0, 0, 0);
  const warna = ["#c0392b", "#2f6fed", "#e8a317", "#2e8b57", "#7d5ba6", "#e67e22", "#34495e", "#f78fb3"];
  for (let r = 0; r < 4; r++) {
    const y = .15 + r * (h - .2) / 4;
    kotak(g, w - .08, .04, .36, "#6e5039", 0, y, .03, { bayang: false });
    let bx = -w / 2 + .1;
    while (bx < w / 2 - .15) { const bw = .06 + acak() * .07, bh = .3 + acak() * .14; kotak(g, bw, bh, .26, warna[Math.floor(acak() * 8)], bx + bw / 2, y + .04, .06, { bayang: false }); bx += bw + .012; }
  }
  return g;
}
function papanDinding(induk, x, y, z, w, h, tekstur, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tekstur, roughness: .7 }));
  m.position.set(x, y, z); m.rotation.y = ry; induk.add(m);
  kotak(induk, w + .08, h + .08, .04, "#3a342a", x, y - h / 2 - .04, z - .03 * Math.cos(ry), { ry, bayang: false });
  return m;
}
function lampuBerdiri(induk, x, z) {
  silinder(induk, .02, .02, 1.5, "#2b2b2b", x, yAktif, z, { seg: 8 });
  const k = silinder(induk, .12, .22, .25, bahan("#fff4d6", { emissive: 0xffe2a8, emissiveIntensity: .6 }), x, yAktif + 1.45, z);
  k.castShadow = false;
}

// =====================================================================
//  GEDUNG
// =====================================================================
const gedung = new THREE.Group(); scene.add(gedung);
const grupLantai = {};                 // no -> Group (untuk disembunyikan saat fokus)
const kursiAgent = {};                 // id -> {lantai, x, z, meja}
const kursiRapat = [];                 // kursi di Ruang Rapat lantai 4: {lantai, x, z, hadap}
const spotSantai = [];                 // {x, z, jenis, ruang}
const labelRuang = [];                 // {el, pos, lantai}
const animasi = [];                    // fungsi(dt, t) tiap frame
const meshLantai = [];                 // untuk klik lantai

function dinding(induk, x1, z1, x2, z2, y, tinggiPadat, warna = "#f4efe6", kaca = true, tebal = .14) {
  const panjang = Math.hypot(x2 - x1, z2 - z1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2, ry = -Math.atan2(z2 - z1, x2 - x1);
  const padat = kotak(induk, panjang, tinggiPadat, tebal, warna, cx, y, cz, { ry });
  kotak(induk, panjang + .02, .05, tebal + .06, "#b08a5e", cx, y + tinggiPadat, cz, { ry, bayang: false });
  if (kaca) {
    const h = TINGGI - .3 - tinggiPadat - .05;
    const k = new THREE.Mesh(geoBox(panjang, h, .04), KACA); k.position.set(cx, y + tinggiPadat + .05 + h / 2, cz); k.rotation.y = ry; induk.add(k);
  }
  return padat;
}
/** dinding dengan celah pintu di posisi p (sepanjang sumbu) */
function dindingPintu(induk, sumbu, tetap, a, b, pintu, y, lebar = 1.7) {
  const bagian = pintu == null ? [[a, b]] : [[a, pintu - lebar / 2], [pintu + lebar / 2, b]];
  bagian.forEach(([p, q]) => { if (q - p > .1) sumbu === "x" ? dinding(induk, p, tetap, q, tetap, y, 1.05) : dinding(induk, tetap, p, tetap, q, y, 1.05); });
}

function plakatLantai(induk, l, y) {
  const t = kanvasTeks(512, 128, (c, w, h) => {
    c.fillStyle = "#1c1a17"; c.beginPath(); c.roundRect(0, 0, w, h, 22); c.fill();
    c.fillStyle = l.warna; c.beginPath(); c.roundRect(14, 14, 100, 100, 16); c.fill();
    c.fillStyle = "#1c1400"; c.font = "bold 64px Inter, Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(l.no === 5 ? "R" : l.no, 64, 68);
    c.fillStyle = "#fff"; c.textAlign = "left"; c.font = "bold 40px 'Space Grotesk', Inter, Arial"; c.fillText(l.nama.toUpperCase(), 136, 52);
    c.fillStyle = "#cfc6b4"; c.font = "26px Inter, Arial"; c.fillText(l.julukan, 136, 94);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
  m.position.set(X0 - 2.6, y + 1.6, Z1 - .5); m.rotation.y = 0.35; induk.add(m);
  return m;
}

// ---------- alas, jalan, taman ----------
function bangunSekitar() {
  const tanah = new THREE.Mesh(new THREE.CircleGeometry(150, 64), bahan("#cfd9b8", { roughness: 1 }));
  tanah.rotation.x = -Math.PI / 2; tanah.receiveShadow = true; scene.add(tanah);
  lantaiBertekstur(scene, -26, -18, 52, 46, 0, "atap", 3);                                   // plaza
  const jalan = new THREE.Mesh(new THREE.PlaneGeometry(200, 9), bahan("#55595f", { roughness: .95 }));
  jalan.rotation.x = -Math.PI / 2; jalan.position.set(0, .02, 33); jalan.receiveShadow = true; scene.add(jalan);
  for (let x = -96; x < 100; x += 6) kotak(scene, 3, .02, .2, "#f2efe6", x, .02, 33, { bayang: false });
  kotak(scene, 200, .15, 1.2, "#e3ddd0", 0, 0, 28, { bayang: false });
  kotak(scene, 33, DASAR, 21, "#cfc5b2", 0, 0, 0);                                            // alas gedung
  for (let i = 0; i < 3; i++) kotak(scene, 8, DASAR - i * .13, .5, "#d8cfbd", -6, 0, Z1 + 1.6 + i * .5, { bayang: false });   // tangga masuk
  // pohon & lampu jalan
  [[-23, 12], [-25, -6], [23, 13], [25, -8], [-26, 24], [27, 24], [0, -16], [-14, -15], [14, -16]].forEach(([x, z], i) => {
    silinder(scene, .18, .26, 1.6, "#7a5a3c", x, 0, z, { seg: 8 });
    const d = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 + (i % 3) * .3, 1), bahan(i % 2 ? "#6aa86a" : "#5b9a63", { flatShading: true, roughness: .9 }));
    d.position.set(x, 3 + (i % 3) * .3, z); d.castShadow = true; scene.add(d);
  });
  // kota di kejauhan (siluet pucat)
  for (let i = 0; i < 26; i++) {
    const s = i / 26 * Math.PI * 2, r = 105 + (i % 4) * 12, h = 8 + (hash("k" + i) % 22);
    kotak(scene, 8 + (i % 3) * 3, h, 8, ["#c4d7e6", "#bcd0e0", "#cfdeea"][i % 3], Math.cos(s) * r, 0, Math.sin(s) * r - 10, { bayang: false });
  }
}

// ---------- satu lantai kantor ----------
function bangunLantai(l) {
  const g = new THREE.Group(); g.userData.no = l.no; gedung.add(g); grupLantai[l.no] = g;
  const y = LY(l.no);
  // pelat lantai (atap lantai bawahnya)
  const pelat = kotak(g, X1 - X0 + .6, .3, Z1 - Z0 + .6, "#ece6da", 0, y - .3, 0);
  pelat.userData.lantai = l.no; meshLantai.push(pelat);
  kotak(g, X1 - X0 + .7, .12, .1, l.warna, 0, y - .22, Z1 + .32, { bayang: false });     // garis warna lantai di tepi depan
  plakatLantai(g, l, y);
  if (l.no === 5) { bangunRooftop(g, l, y); return; }

  // dinding luar: belakang padat berjendela, samping kaca
  kotak(g, X1 - X0, 1.0, .25, "#efe8dc", 0, y, Z0 - .12);
  const kacaBlk = new THREE.Mesh(geoBox(X1 - X0, 1.9, .06), KACA); kacaBlk.position.set(0, y + 1.0 + .95, Z0 - .1); g.add(kacaBlk);
  for (let x = X0; x <= X1; x += 3) kotak(g, .1, 1.9, .14, "#c9bfae", x, y + 1, Z0 - .1, { bayang: false });
  kotak(g, X1 - X0, TINGGI - 2.9 - .3, .25, "#efe8dc", 0, y + 2.9, Z0 - .12);
  [X0, X1].forEach(x => {
    kotak(g, .25, .9, Z1 - Z0, "#efe8dc", x, y, 0);
    const k = new THREE.Mesh(geoBox(.06, TINGGI - 1.2, Z1 - Z0), KACA); k.position.set(x, y + .9 + (TINGGI - 1.2) / 2, 0); g.add(k);
    for (let z = Z0; z <= Z1; z += 3) kotak(g, .14, TINGGI - 1.2, .1, "#c9bfae", x, y + .9, z, { bayang: false });
  });
  // pagar kaca rendah di sisi depan yang terbuka
  const pagar = new THREE.Mesh(geoBox(X1 - X0, .9, .05), KACA); pagar.position.set(0, y + .45, Z1 + .05); g.add(pagar);
  kotak(g, X1 - X0, .05, .08, "#9aa3ad", 0, y + .9, Z1 + .05, { bahan: { metalness: .8, roughness: .3 }, bayang: false });
  // koridor
  lantaiBertekstur(g, X0, -1.5, 12 - X0, 3, y, "koridor", 2);
  // lampu langit-langit
  const lampu = new THREE.PointLight(0xfff0d8, 14, 30, 1.6); lampu.position.set(-2, y + TINGGI - .6, 0); g.add(lampu);
  // panel lampu (visual)
  for (let x = -12; x <= 9; x += 7) kotak(g, 2.2, .04, .5, bahan("#fffaf0", { emissive: 0xfff3dc, emissiveIntensity: .8 }), x, y + TINGGI - .36, 0, { bayang: false });

  l.ruang.forEach(r => bangunRuang(g, l, r, y));
}

function bangunRuang(g, l, r, y) {
  const x0 = r.x, z0 = r.z, w = r.w, d = r.d, cx = x0 + w / 2, belakang = z0 < 0;
  lantaiBertekstur(g, x0, z0, w, d, y, r.bahan || r.lantaiBahan || "kayu");
  // dinding sekat: sisi koridor (dengan pintu) + sisi kanan ruangan (kalau bukan tepi gedung / lift)
  const zKoridor = belakang ? z0 + d : z0;
  const ujung = Math.min(x0 + w, belakang ? 12 : X1);
  dindingPintu(g, "x", zKoridor, x0, ujung, cx, y);
  if (x0 + w < X1 - .01 && !(belakang && x0 + w >= 12)) dinding(g, x0 + w, z0, x0 + w, z0 + d, y, 1.05);
  // label ruang
  const warna = r.divisi.length ? M.warna(r.divisi[0]) : l.warna;
  labelRuang.push({ teks: r.nama, warna, pos: new THREE.Vector3(cx, y + 2.9, belakang ? z0 + .6 : z0 + d - .8), lantai: l.no });
  // isi ruangan
  const orang = M.urutan.filter(id => A[id].ruang === r.id);
  const isi = ISI_RUANG[r.jenis] || ISI_RUANG.kantor;
  yAktif = y;
  isi(g, r, y, orang, warna);
}

/** atur meja otomatis dalam grid & catat kursi tiap agent */
function aturMeja(g, r, y, orang, o = {}) {
  if (!orang.length) return;
  const lebarMeja = 2.4, kolom = Math.max(1, Math.min(orang.length, Math.floor((r.w - .6) / lebarMeja))), baris = Math.ceil(orang.length / kolom);
  const sisaX = o.sisaKanan || 0, lebarPakai = r.w - sisaX;
  const jarakZ = Math.min(2.7, (r.d - 1.2) / baris);
  orang.forEach((id, i) => {
    const kb = Math.floor(i / kolom), kk = i % kolom, nKolom = Math.min(kolom, orang.length - kb * kolom);
    const x = r.x + lebarPakai / 2 + (kk - (nKolom - 1) / 2) * lebarMeja;
    const z = r.z + .9 + kb * jarakZ;
    const a = A[id];
    const meja = mejaKerja(g, x, z, { lebar: a.manajer ? 2 : 1.7, kayu: a.manajer ? "#a8794d" : "#dcc3a0", layar: o.layar, aksen: M.warna(a.divisi), kursi: o.kursi, tanaman: i === 0 });
    meja.grup.position.y = y;
    kursiAgent[id] = { lantai: r.lantai, x, z: z + .78, meja };
  });
}

// ---------- isi tiap jenis ruangan ----------
const ISI_RUANG = {
  kantor(g, r, y, orang, warna) {
    const jenisLayar = { finance: "chart", riset: "berita", studio: "kode", qa: "kode", properti: "desain", bisnis: "chart", pribadi: "berita" }[r.divisi[0]] || "kode";
    const tambahan = { finance: 0, riset: 0 }[r.divisi[0]] ?? 0;
    aturMeja(g, r, y, orang, { layar: jenisLayar, sisaKanan: tambahan });
    const blk = r.z + .05;
    if (r.divisi[0] === "finance") {           // dinding ticker bergerak
      const t = kanvasTeks(1024, 64, (c, w, h) => {
        c.fillStyle = "#081416"; c.fillRect(0, 0, w, h); c.font = "bold 30px monospace"; c.textBaseline = "middle";
        const isi = ["BBCA ▲1.2%", "NVDA ▲2.4%", "BTC ▼0.8%", "TLKM ▲0.4%", "AAPL ▼0.3%", "ETH ▲1.1%", "SIMULASI"];
        isi.forEach((s, i) => { c.fillStyle = s.includes("▼") ? "#ff6b6b" : s === "SIMULASI" ? "#ffd479" : "#3ddc97"; c.fillText(s, 10 + i * 146, 34); });
      });
      t.wrapS = THREE.RepeatWrapping; t.repeat.set(1.5, 1);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(r.w - 1, .5), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
      m.position.set(r.x + r.w / 2, y + 2.6, blk + .1); g.add(m);
      animasi.push(dt => { t.offset.x += dt * .05; });
    } else if (r.divisi[0] === "riset") {
      papanDinding(g, r.x + r.w / 2, y + 2.3, blk + .12, 3.6, 1.4, kanvasTeks(360, 140, (c, w, h) => {
        c.fillStyle = "#e9f5fb"; c.fillRect(0, 0, w, h); c.fillStyle = "#7fb7d6";
        for (let i = 0; i < 70; i++) { c.beginPath(); c.arc(40 + acak() * 280, 25 + acak() * 95, 3 + acak() * 9, 0, 7); c.fill(); }
        c.fillStyle = "#e5484d"; [[90, 60], [250, 50], [200, 100]].forEach(([x, yy]) => { c.beginPath(); c.arc(x, yy, 6, 0, 7); c.fill(); });
      }));
    } else if (r.divisi[0] === "properti") {
      for (let i = 0; i < 3; i++) papanDinding(g, r.x + 2.5 + i * 2.2, y + 2.3, blk + .12, 1.7, 1.1, kanvasTeks(170, 110, (c, w, h) => {
        c.fillStyle = "#cfe8f7"; c.fillRect(0, 0, w, h); c.fillStyle = "#7ab26a"; c.fillRect(0, 80, w, 30);
        c.fillStyle = ["#f4d9b5", "#e9c7c7", "#d9e6c9"][i]; c.fillRect(45, 40, 80, 45); c.fillStyle = "#b5523a";
        c.beginPath(); c.moveTo(38, 42); c.lineTo(85, 12); c.lineTo(132, 42); c.fill(); c.fillStyle = "#6b4a2e"; c.fillRect(78, 60, 16, 25);
      }));
      kotak(g, 1.2, .8, .7, "#e9e2d4", r.x + r.w - 1.2, y, r.z + r.d - 1, { bulat: .05 });
      const rumah = new THREE.Group(); rumah.position.set(r.x + r.w - 1.2, y + .8, r.z + r.d - 1); g.add(rumah);
      kotak(rumah, .5, .3, .4, "#f4d9b5", 0, 0, 0); const atap = new THREE.Mesh(new THREE.ConeGeometry(.42, .25, 4), bahan("#b5523a")); atap.position.y = .42; atap.rotation.y = Math.PI / 4; rumah.add(atap);
    } else if (r.divisi[0] === "bisnis") {
      papanDinding(g, r.x + r.w / 2, y + 2.2, blk + .12, 3.4, 1.4, kanvasTeks(340, 140, (c, w, h) => {
        c.fillStyle = "#fbfbf7"; c.fillRect(0, 0, w, h); c.fillStyle = "#1f9d63"; c.font = "bold 18px Inter, Arial"; c.fillText("FUNNEL KLIEN", 16, 26);
        [["Calon", 300, "#4cc38a"], ["Proposal", 220, "#e8a317"], ["DP 50%", 140, "#2f6fed"], ["Jadi", 70, "#1c1a17"]].forEach(([s, lw, k], i) => { c.fillStyle = k; c.fillRect(20 + (300 - lw) / 2, 38 + i * 24, lw, 18); });
      }));
    } else if (r.divisi[0] === "qa") {
      for (let i = 0; i < 4; i++) kotak(g, .28, .5, .04, "#1f2430", r.x + 1.2 + i * .5, y + 1.8, r.z + .14, { bayang: false });
      const lampuMerah = kotak(g, .2, .2, .2, bahan("#ff5a5f", { emissive: 0xff2d2d, emissiveIntensity: 1 }), r.x + r.w - .6, y + 2.5, r.z + .2, { bayang: false });
      animasi.push((dt, t) => { lampuMerah.material.emissiveIntensity = .4 + .6 * Math.abs(Math.sin(t * 2)); });
    } else if (r.divisi[0] === "pribadi") {
      papanDinding(g, r.x + r.w / 2, y + 2.2, blk + .12, 3, 1.4, kanvasTeks(300, 140, (c, w, h) => {
        c.fillStyle = "#fff6fa"; c.fillRect(0, 0, w, h); c.fillStyle = "#d75f95"; c.font = "bold 16px Inter, Arial"; c.fillText("JADWAL MINGGU INI", 14, 22);
        for (let i = 0; i < 7; i++) for (let j = 0; j < 3; j++) { c.fillStyle = (i + j) % 4 ? "#f6dbe7" : "#ffd479"; c.fillRect(14 + i * 40, 34 + j * 34, 34, 28); }
      }));
      sofa(g, r.x + r.w - 2, r.z + r.d - 1.1, 2.2, "#e7a9c4", Math.PI);
    } else if (r.divisi[0] === "studio") {
      papanDinding(g, r.x + r.w - 3, y + 2.3, r.z + .12, 4, 1.3, kanvasTeks(400, 130, (c, w, h) => {
        c.fillStyle = "#f4efff"; c.fillRect(0, 0, w, h); c.fillStyle = "#6a3fc2"; c.font = "bold 16px Inter, Arial";
        ["AUDIT", "BRIEF", "DESAIN", "BANGUN", "QA"].forEach((s, i) => { c.fillText(s, 10 + i * 78, 22); for (let k = 0; k < 3 - (i % 2); k++) { c.fillStyle = ["#ffd479", "#bfe3ff", "#c8f0d8"][k]; c.fillRect(10 + i * 78, 34 + k * 30, 64, 24); } c.fillStyle = "#6a3fc2"; });
      }));
    }
    if (orang.length < 3) tanaman(g, r.x + r.w - .8, r.z + r.d - .8, 1.1, y);
    tanaman(g, r.x + .6, r.z + r.d - .6, .9, y);
  },

  lobi(g, r, y, orang) {
    // dinding logo di sisi koridor
    papanDinding(g, -6, y + 2, r.z + .12, 6, 1.3, kanvasTeks(600, 130, (c, w, h) => {
      c.fillStyle = "#1c1a17"; c.fillRect(0, 0, w, h); c.fillStyle = "#e8a317";
      gambarLogo(c, 18, 11, 108);
      c.font = "bold 62px 'Space Grotesk', Inter, Arial"; c.textBaseline = "middle"; c.fillText("MARKAS", 142, 60); c.fillStyle = "#fff"; c.fillText("CELL", 418, 60);
      c.fillStyle = "#8c8473"; c.font = "18px Inter, Arial"; c.fillText("AI STUDIO", 144, 106);
    }));
    // meja resepsionis melengkung
    const meja = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 1.05, 32, 1, true, -Math.PI * .35, Math.PI * .7), bahan("#f3ede2", { side: THREE.DoubleSide }));
    meja.position.set(-6, y + .525, 3.6); meja.rotation.y = Math.PI; meja.castShadow = true; g.add(meja);
    const atas = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.95, 32, 1, Math.PI * .15 + Math.PI, Math.PI * .7), bahan("#a8794d", { side: THREE.DoubleSide }));
    atas.rotation.x = -Math.PI / 2; atas.position.set(-6, y + 1.06, 3.6); g.add(atas);
    kotak(g, .5, .32, .04, "#20242c", -6, y + 1.06, 4.2);
    orang.forEach((id, i) => { kursiAgent[id] = { lantai: r.lantai, x: -6 + i * 1.2, z: 4.4, meja: null, hadap: "depan" }; });
    // ruang tunggu
    sofa(g, 3, 7.6, 3.2, "#5f9c7e", Math.PI);
    sofa(g, 7.5, 7.6, 3.2, "#5f9c7e", Math.PI);
    kotak(g, 2.2, .4, 1, "#a8794d", 5.2, y, 6.1, { bulat: .05 });
    kotak(g, 4, .02, 3, "#d9c9a8", 5.2, y, 6.6, { bayang: false });
    tanaman(g, -13.6, 7.6, 1.4, y); tanaman(g, 1, 4, 1.1, y); tanaman(g, 13.8, 7.6, 1.4, y); tanaman(g, -9.6, 7.8, 1, y);
    // pintu kaca masuk di depan
    [-7.6, -4.4].forEach(x => { const p = new THREE.Mesh(geoBox(1.5, 2.4, .05), KACA); p.position.set(x, y + 1.2, Z1 + .2); g.add(p); kotak(g, .08, 2.4, .1, "#3a3f4a", x - .75, y, Z1 + .2, { bayang: false }); });
  },

  owner(g, r, y, orang) {
    kotak(g, 5, .02, 3.6, "#8b2f3a", r.x + r.w / 2, y, r.z + 3.6, { bayang: false });   // karpet merah
    const x = r.x + r.w / 2;
    // meja besar
    kotak(g, 3, .08, 1.1, "#5b3a22", x, y + .76, r.z + 1.6, { bulat: .03 });
    kotak(g, 3, .76, .1, "#4a2f1b", x, y, r.z + 1.15);
    kotak(g, .1, .76, 1, "#4a2f1b", x - 1.45, y, r.z + 1.6); kotak(g, .1, .76, 1, "#4a2f1b", x + 1.45, y, r.z + 1.6);
    kotak(g, .06, .02, 1.12, "#e8a317", x, y + .84, r.z + 1.6, { bayang: false, bahan: { metalness: .9, roughness: .25 } });
    for (let i = -1; i <= 1; i += 2) { kotak(g, .1, .3, .1, "#222", x + i * .55, y + .84, r.z + 1.35); const s = kotak(g, 1, .6, .04, "#111", x + i * .55, y + 1.05, r.z + 1.35); s.material = new THREE.MeshBasicMaterial({ map: tekLayar(i < 0 ? "chart" : "kode") }); }
    kotak(g, .7, 1.25, .7, "#1c1a17", x, y, r.z + 2.4, { bulat: .1 });                  // kursi bos
    kursiAgent.Cell = { lantai: r.lantai, x, z: r.z + 3.1, meja: null, hadap: "depan" };
    rakBuku(g, r.x + 1.4, r.z + .35, 2.2); rakBuku(g, r.x + r.w - 1.4, r.z + .35, 2.2);
    // piala
    kotak(g, .6, .9, .6, "#efe8dc", r.x + r.w - .8, y, r.z + r.d - 1);
    const piala = new THREE.Mesh(new THREE.CylinderGeometry(.18, .08, .35, 16), bahan("#e8a317", { metalness: 1, roughness: .2 })); piala.position.set(r.x + r.w - .8, y + 1.1, r.z + r.d - 1); g.add(piala);
    sofa(g, r.x + 1.6, r.z + r.d - 1, 2, "#3b3a46", Math.PI / 2);
    tanaman(g, r.x + r.w - .7, r.z + .6 + 2.6, 1.2, y);
  },

  jarvis(g, r, y) {
    const x = r.x + r.w / 2;
    // dinding layar besar: status semua lantai (diperbarui live)
    const kv = document.createElement("canvas"); kv.width = 1024; kv.height = 360;
    const tek = new THREE.CanvasTexture(kv); tek.colorSpace = THREE.SRGBColorSpace;
    const layar = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.15), new THREE.MeshBasicMaterial({ map: tek, toneMapped: false }));
    layar.position.set(x, y + 1.95, r.z + .2); g.add(layar);
    kotak(g, 9.3, 3.4, .12, "#1a1d24", x, y + .25, r.z + .08);
    LAYAR_JARVIS.kv = kv; LAYAR_JARVIS.tek = tek;
    // meja hologram
    silinder(g, 1.1, 1.2, .8, "#2b3140", x, y, r.z + 4.2, { seg: 32 });
    const holo = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, .9, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x5fd4ff, transparent: true, opacity: .18, side: THREE.DoubleSide, depthWrite: false }));
    holo.position.set(x, y + 1.25, r.z + 4.2); g.add(holo);
    const gedungMini = new THREE.Group(); gedungMini.position.set(x, y + .85, r.z + 4.2); g.add(gedungMini);
    LANTAI.forEach((l, i) => { const k = new THREE.Mesh(geoBox(.9, .14, .55), new THREE.MeshBasicMaterial({ color: l.warna, transparent: true, opacity: .85 })); k.position.y = .1 + i * .17; gedungMini.add(k); });
    animasi.push((dt, t) => { gedungMini.rotation.y += dt * .6; holo.material.opacity = .14 + .06 * Math.sin(t * 3); });
    // konsol
    kotak(g, 3.4, .9, .7, "#2b3140", x, y, r.z + 2.2, { bulat: .06 });
    const k2 = kotak(g, 3.2, .04, .5, bahan("#5fd4ff", { emissive: 0x2fb6ff, emissiveIntensity: .7 }), x, y + .9, r.z + 2.2, { bayang: false });
    k2.castShadow = false;
    kursiAgent.Jarvis = { lantai: r.lantai, x, z: r.z + 2.95, meja: null, hadap: "belakang" };
    tanaman(g, r.x + .7, r.z + r.d - .7, 1, y);
  },

  rapat(g, r, y) {
    const x = r.x + r.w / 2 + 1, z = r.z + r.d / 2 + .3;
    kotak(g, 6, .08, 1.8, "#7a5236", x, y + .74, z, { bulat: .04 });
    kotak(g, .3, .74, 1.2, "#3a342a", x - 2.4, y, z); kotak(g, .3, .74, 1.2, "#3a342a", x + 2.4, y, z);
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
      const cx = x - 2.4 + i * 1.2, cz = z + s * 1.25;
      kursiRapat.push({ lantai: r.lantai, x: cx, z: cz, hadap: s < 0 ? "depan" : "belakang", urut: Math.abs(i - 2) * 2 + (s < 0 ? 0 : 1) });
      kotak(g, .5, .07, .5, "#2f3542", cx, y + .46, cz, { bulat: .03 }); kotak(g, .5, .55, .07, "#2f3542", cx, y + .5, cz + s * .24, { bulat: .03 }); silinder(g, .04, .04, .46, "#555", cx, y, cz, { seg: 6 });
    }
    const tv = kotak(g, 3.2, 1.8, .08, "#111", r.x + .4, y + 1.1, z, { ry: Math.PI / 2 });
    tv.material = [bahan("#111"), bahan("#111"), bahan("#111"), bahan("#111"), new THREE.MeshBasicMaterial({ map: tekLayar("chart") }), bahan("#111")];
    tanaman(g, r.x + r.w - .7, r.z + .7 + .1, 1.1, y);
  },

  proyek(g, r, y) {
    papanDinding(g, r.x + 5, y + 2, r.z + .12, 6, 1.6, kanvasTeks(600, 160, (c, w, h) => {
      c.fillStyle = "#fbfaf6"; c.fillRect(0, 0, w, h); c.font = "bold 18px Inter, Arial";
      ["ANTRI", "JALAN", "CEK QA", "TUNGGU OK", "SELESAI"].forEach((s, i) => { c.fillStyle = "#57503f"; c.fillText(s, 12 + i * 118, 24);
        for (let k = 0; k < 2 + (i * 7) % 3; k++) { c.fillStyle = ["#ffd479", "#bfe3ff", "#c8f0d8", "#ffc9c9"][(i + k) % 4]; c.fillRect(12 + i * 118, 36 + k * 38, 100, 30); } });
    }));
    kotak(g, 2, 1.05, .9, "#d9c9a8", r.x + 5, y, r.z + 3.6, { bulat: .05 });          // meja berdiri
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12), bahan(["#ab7df8", "#ffd479", "#4fc3f7"][i], { roughness: .95 })); b.scale.y = .6; b.position.set(r.x + 10 + i * 1.6, y + .33, r.z + 5.4); b.castShadow = true; g.add(b); }
    kotak(g, 2.6, .95, .6, "#efe8dc", r.x + r.w - 2, y, r.z + .5);                     // pantri
    kotak(g, .5, .45, .4, "#2b2f38", r.x + r.w - 2.6, y + .95, r.z + .5);                 // mesin kopi
    tanaman(g, r.x + r.w - .6, r.z + r.d - .7, 1.2, y);
  },

  server(g, r, y) {
    const lampu = [];
    for (let i = 0; i < 6; i++) {
      const x = r.x + 1.4 + i * 1.6;
      kotak(g, 1, 2.3, .9, "#1f232b", x, y, r.z + 1.2, { bahan: { metalness: .5, roughness: .4 } });
      for (let k = 0; k < 8; k++) { const led = new THREE.Mesh(geoBox(.06, .04, .02), new THREE.MeshBasicMaterial({ color: k % 3 ? 0x3ddc97 : 0x5fd4ff })); led.position.set(x - .3 + (k % 4) * .12, y + .4 + Math.floor(k / 4) * .9 + (i % 3) * .2, r.z + 1.66); g.add(led); lampu.push(led); }
    }
    animasi.push((dt, t) => { lampu.forEach((l, i) => { l.visible = Math.sin(t * 4 + i * 1.7) > -.4; }); });
    kotak(g, 2.4, .8, .6, "#e9e2d4", r.x + r.w - 2, y, r.z + r.d - .9);
    tanaman(g, r.x + r.w - .7, r.z + 1, 1, y);
  },

  baca(g, r, y) {
    for (let i = 0; i < 4; i++) rakBuku(g, r.x + 1.6 + i * 2.2, r.z + .4, 2.1, 2.4);
    [[r.x + 4, r.z + 4.4], [r.x + 8, r.z + 4.4]].forEach(([x, z], i) => { sofa(g, x, z, 1.1, i ? "#c97b4a" : "#5d82b3", Math.PI); lampuBerdiri(g, x + .9, z - .4); });
    kotak(g, 1, .45, 1, "#a8794d", r.x + 6, y, r.z + 4.1, { bulat: .04 });
    tanaman(g, r.x + r.w - .7, r.z + r.d - .7, 1.2, y);
  },
};
// Studio Video: meja editing 3 monitor, layar hijau, kamera, lampu softbox
const isiKantor = ISI_RUANG.kantor;
ISI_RUANG.kantor = function (g, r, y, orang, warna) {
  if (r.id !== "video") return isiKantor(g, r, y, orang, warna);
  kotak(g, 3.2, 2.6, .06, "#3fbf5f", r.x + 2.4, y, r.z + .1, { bayang: false });
  kotak(g, 3.2, .02, 1.6, "#3fbf5f", r.x + 2.4, y, r.z + r.d - 1.2, { bayang: false });
  silinder(g, .03, .03, 1.4, "#222", r.x + 5, y, r.z + 5.2, { seg: 8 });
  kotak(g, .35, .25, .45, "#1a1a1a", r.x + 5, y + 1.4, r.z + 5.2);
  [[r.x + 1, r.z + 4.8], [r.x + 4, r.z + 4.8]].forEach(([x, z]) => { silinder(g, .03, .03, 1.7, "#333", x, y, z, { seg: 8 }); kotak(g, .7, .5, .25, bahan("#fffaf0", { emissive: 0xfff3dc, emissiveIntensity: .8 }), x, y + 1.7, z); });
  orang.forEach((id, i) => {
    const x = r.x + r.w - 3 - i * 2.4, meja = mejaKerja(g, x, r.z + 1.6, { lebar: 2.2, layar: "desain", kayu: "#3a3f4a", aksen: "#ab7df8" });
    meja.grup.position.y = y;
    [-.95, .95].forEach(dx => { const s = new THREE.Mesh(geoBox(.6, .4, .03), new THREE.MeshBasicMaterial({ map: tekLayar("desain") })); s.position.set(x + dx, y + 1.2, r.z + 1.45); s.rotation.y = -dx * .35; g.add(s); });
    kursiAgent[id] = { lantai: r.lantai, x, z: r.z + 2.38, meja };
  });
};

const LAYAR_JARVIS = { kv: null, tek: null };
function gambarLayarJarvis() {
  const kv = LAYAR_JARVIS.kv; if (!kv) return;
  const c = kv.getContext("2d"), w = kv.width, h = kv.height;
  c.fillStyle = "#08131f"; c.fillRect(0, 0, w, h);
  c.strokeStyle = "rgba(95,212,255,.15)"; for (let x = 0; x < w; x += 32) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  c.fillStyle = "#5fd4ff"; c.font = "bold 30px monospace"; c.fillText("J.A.R.V.I.S · STATUS GEDUNG", 24, 46);
  c.fillStyle = "#8fb4c9"; c.font = "20px monospace"; c.fillText(new Date().toLocaleTimeString("id-ID"), w - 140, 46);
  [...LANTAI].reverse().forEach((l, i) => {
    const yy = 92 + i * 54, ids = M.urutan.filter(id => A[id].lantai === l.no);
    const n = k => M.urutan.filter(id => A[id].keadaan === k && (posisiLantai(id) === l.no)).length;
    c.fillStyle = l.warna; c.fillRect(24, yy - 26, 10, 38);
    c.fillStyle = "#e6f6ff"; c.font = "bold 24px monospace"; c.fillText(`LT${l.no} ${l.nama.toUpperCase()}`, 46, yy);
    c.font = "22px monospace";
    c.fillStyle = "#3ddc97"; c.fillText(`KERJA ${n("kerja")}`, 520, yy);
    c.fillStyle = "#ff6b6b"; c.fillText(`TUNGGU ${n("menunggu")}`, 690, yy);
    c.fillStyle = "#8fb4c9"; c.fillText(l.no === 5 ? `SANTAI ${n("santai")}` : `${ids.length} MEJA`, 870, yy);
  });
  LAYAR_JARVIS.tek.needsUpdate = true;
}

// ---------- rooftop: kolam, basket, teras, garasi ----------
function bangunRooftop(g, l, y) {
  yAktif = y;
  lantaiBertekstur(g, X0, Z0, X1 - X0, Z1 - Z0, y, "atap", 2);
  // pagar kaca keliling
  [[0, Z0 - .1, X1 - X0, .05], [0, Z1 + .1, X1 - X0, .05]].forEach(([x, z, w, d]) => { const p = new THREE.Mesh(geoBox(w, 1.1, d), KACA); p.position.set(x, y + .55, z); g.add(p); kotak(g, w, .06, .1, "#9aa3ad", x, y + 1.1, z, { bayang: false, bahan: { metalness: .8, roughness: .3 } }); });
  [X0 - .1, X1 + .1].forEach(x => { const p = new THREE.Mesh(geoBox(.05, 1.1, Z1 - Z0), KACA); p.position.set(x, y + .55, 0); g.add(p); kotak(g, .1, .06, Z1 - Z0, "#9aa3ad", x, y + 1.1, 0, { bayang: false, bahan: { metalness: .8, roughness: .3 } }); });
  lantaiBertekstur(g, X0, 1, 30, 1.2, y + .005, "koridor", 2);
  l.ruang.forEach(r => {
    labelRuang.push({ teks: r.nama, warna: { kolam: "#4fc3f7", basket: "#ff8a3d", teras: "#ffd479", garasi: "#e0e0e0" }[r.jenis], pos: new THREE.Vector3(r.x + r.w / 2, y + 2.4, r.z + r.d / 2), lantai: 5 });
    ({ kolam: kolam, basket: lapanganBasket, teras: teras, garasi: garasi })[r.jenis](g, r, y);
  });
}

function kolam(g, r, y) {
  const x = r.x + r.w / 2, z = r.z + r.d / 2 - .3, w = r.w - 1.6, d = r.d - 2.2;
  // tepi kolam
  kotak(g, w + .8, .5, .4, "#f2f4f5", x, y, z - d / 2 - .2); kotak(g, w + .8, .5, .4, "#f2f4f5", x, y, z + d / 2 + .2);
  kotak(g, .4, .5, d, "#f2f4f5", x - w / 2 - .2, y, z); kotak(g, .4, .5, d, "#f2f4f5", x + w / 2 + .2, y, z);
  const dasar = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: kanvasTeks(256, 256, (c, ww, hh) => { c.fillStyle = "#6fd0f2"; c.fillRect(0, 0, ww, hh); c.strokeStyle = "#4bb5de"; c.lineWidth = 3; for (let i = 0; i <= ww; i += 32) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, hh); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(ww, i); c.stroke(); } }) }));
  dasar.rotation.x = -Math.PI / 2; dasar.position.set(x, y + .02, z); g.add(dasar);
  const geo = new THREE.PlaneGeometry(w, d, 40, 24), air = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0x3fb4e8, transparent: true, opacity: .62, roughness: .04, metalness: 0, clearcoat: 1, depthWrite: false }));
  air.rotation.x = -Math.PI / 2; air.position.set(x, y + .4, z); g.add(air);
  const pos = geo.attributes.position, asal = pos.array.slice();
  animasi.push((dt, t) => { for (let i = 0; i < pos.count; i++) { const px = asal[i * 3], py = asal[i * 3 + 1]; pos.array[i * 3 + 2] = Math.sin(px * 1.3 + t * 1.6) * .03 + Math.cos(py * 1.7 + t * 1.2) * .03; } pos.needsUpdate = true; geo.computeVertexNormals(); });
  // tangga kolam
  [-.25, .25].forEach(dx => { const t = new THREE.Mesh(new THREE.TorusGeometry(.35, .03, 8, 16, Math.PI), bahan("#d0d6dc", { metalness: 1, roughness: .2 })); t.position.set(x + w / 2 - .6 + dx, y + .5, z - d / 2 - .1); g.add(t); });
  // orang berenang
  for (let i = 0; i < 6; i++) spotSantai.push({ x: x - w / 2 + 1.2 + (i % 3) * (w - 2.4) / 2, z: z - d / 4 + Math.floor(i / 3) * d / 2, jenis: "renang", ruang: "kolam", yTambah: -0.55 });
  // kursi berjemur di sisi depan kolam
  for (let i = 0; i < 3; i++) {
    const lx = r.x + 1.6 + i * 2.8, lz = r.z + r.d - .6;
    kotak(g, .7, .3, 1.7, "#f4f1ea", lx, y, lz, { bulat: .05 }); kotak(g, .7, .5, .25, "#4fc3f7", lx, y + .3, lz - .7, { bulat: .05 });
    spotSantai.push({ x: lx + .7, z: lz + .2, jenis: "jemur", ruang: "kolam" });
  }
}

function lapanganBasket(g, r, y) {
  const x = r.x + r.w / 2, z = r.z + r.d / 2, w = r.w - .6, d = r.d - .6;
  const tek = kanvasTeks(1024, 768, (c, W, H) => {
    c.fillStyle = "#d6823f"; c.fillRect(0, 0, W, H);
    for (let i = 0; i < H; i += 24) { c.fillStyle = i % 48 ? "rgba(0,0,0,.04)" : "rgba(255,255,255,.04)"; c.fillRect(0, i, W, 24); }
    c.fillStyle = "#2f6fed"; c.fillRect(0, H / 2 - 120, 190, 240); c.fillRect(W - 190, H / 2 - 120, 190, 240);
    c.strokeStyle = "#fff"; c.lineWidth = 8; c.strokeRect(20, 20, W - 40, H - 40);
    c.beginPath(); c.moveTo(W / 2, 20); c.lineTo(W / 2, H - 20); c.stroke();
    c.beginPath(); c.arc(W / 2, H / 2, 90, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(20, H / 2, 300, -Math.PI / 2, Math.PI / 2); c.stroke(); c.beginPath(); c.arc(W - 20, H / 2, 300, Math.PI / 2, Math.PI * 1.5); c.stroke();
    c.fillStyle = "rgba(255,255,255,.85)"; c.font = "bold 54px 'Space Grotesk', Arial"; c.textAlign = "center"; c.fillText("CELL", W / 2, H / 2 + 18);
  });
  const lap = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tek, roughness: .55 }));
  lap.rotation.x = -Math.PI / 2; lap.position.set(x, y + .02, z); lap.receiveShadow = true; g.add(lap);
  // ring di kiri & kanan
  [-1, 1].forEach(s => {
    const rx = x + s * (w / 2 - .25);
    silinder(g, .08, .1, 3.2, "#2b2f38", rx + s * .35, y, z, { seg: 10 });
    kotak(g, .06, 1.05, 1.8, "#f7f7f7", rx, y + 2.75, z, { bahan: { roughness: .2 } });
    kotak(g, .07, .45, .6, "#e5484d", rx - s * .01, y + 2.95, z, { bayang: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.23, .025, 8, 24), bahan("#ff5a1f", { metalness: .4 })); ring.rotation.x = Math.PI / 2; ring.position.set(rx - s * .3, y + 3.05, z); g.add(ring);
    const jaring = new THREE.Mesh(new THREE.CylinderGeometry(.23, .15, .4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: .7 })); jaring.position.set(rx - s * .3, y + 2.83, z); g.add(jaring);
  });
  // spot pemain
  const titik = [[-3.5, -2], [-2, 2], [0, -1], [2, 2.2], [3.6, -1.5], [1.2, 0.6]];
  titik.forEach(([dx, dz]) => spotSantai.push({ x: x + dx, z: z + dz, jenis: "basket", ruang: "basket" }));
  // bola memantul antar pemain
  const bola = new THREE.Mesh(new THREE.SphereGeometry(.14, 20, 14), new THREE.MeshStandardMaterial({ map: kanvasTeks(128, 64, (c, W, H) => { c.fillStyle = "#e0661c"; c.fillRect(0, 0, W, H); c.strokeStyle = "#3a1a08"; c.lineWidth = 3; [16, 48, 80, 112].forEach(xx => { c.beginPath(); c.moveTo(xx, 0); c.lineTo(xx, H); c.stroke(); }); c.beginPath(); c.moveTo(0, H / 2); c.lineTo(W, H / 2); c.stroke(); }), roughness: .6 }));
  bola.castShadow = true; g.add(bola); bola.position.set(x, y + .5, z);
  let dari = new THREE.Vector3(x, y + .5, z), ke = dari.clone(), fase = 1;
  animasi.push((dt, t) => {
    const pemain = AGENT_3D.filter(s => s.spot && s.spot.jenis === "basket" && s.sampai);
    fase += dt / 1.1;
    if (fase >= 1) {
      fase = 0; dari.copy(bola.position);
      if (pemain.length >= 2) { const p = pemain[Math.floor(Math.random() * pemain.length)]; ke.set(p.obj.position.x, y + .5, p.obj.position.z + .3); }
      else if (pemain.length === 1) { ke.set(x + (Math.random() > .5 ? 1 : -1) * (w / 2 - .55), y + 3.05, z); }
      else ke.set(x, y + .14, z);
    }
    bola.position.lerpVectors(dari, ke, fase);
    bola.position.y += Math.sin(fase * Math.PI) * (pemain.length ? 1.6 : 0) + (pemain.length ? 0 : Math.abs(Math.sin(t * 3)) * .3);
    bola.rotation.x += dt * 6;
  });
}

function teras(g, r, y) {
  lantaiBertekstur(g, r.x + .3, r.z + .3, r.w - .6, r.d - .6, y + .01, "dek", 2.4);
  // payung + meja
  [[r.x + 3.2, r.z + 3.4], [r.x + 9, r.z + 3.4]].forEach(([x, z], i) => {
    silinder(g, .04, .04, 2.4, "#ddd", x, y, z, { seg: 8 });
    const p = new THREE.Mesh(new THREE.ConeGeometry(1.5, .6, 8, 1, true), bahan(i ? "#e5484d" : "#e8a317", { side: THREE.DoubleSide, roughness: .9 })); p.position.set(x, y + 2.4, z); p.castShadow = true; g.add(p);
    silinder(g, .55, .55, .06, "#f4f1ea", x, y + .7, z); silinder(g, .05, .05, .7, "#999", x, y, z, { seg: 8 });
    [[-1, 0], [1, 0], [0, 1]].forEach(([dx, dz]) => { kotak(g, .45, .45, .45, "#a8794d", x + dx * 1, y, z + dz * 1, { bulat: .05 }); });
    spotSantai.push({ x: x - 1, z: z + .9, jenis: "teras", ruang: "teras" }, { x: x + 1, z: z + .9, jenis: "teras", ruang: "teras" }, { x: x, z: z + 1.7, jenis: "teras", ruang: "teras" });
  });
  // tanaman pot & lampu taman
  for (let i = 0; i < 4; i++) tanaman(g, r.x + .8 + i * 4, r.z + r.d - .8, 1.2, y);
  // mini bar
  kotak(g, 3, 1.05, .7, "#3a342a", r.x + 6.1, y, r.z + .9, { bulat: .05 });
  kotak(g, 3.1, .06, .8, "#a8794d", r.x + 6.1, y + 1.05, r.z + .9);
}

function mobilSport(warna, spoiler) {
  const g = new THREE.Group();
  const cat = new THREE.MeshPhysicalMaterial({ color: warna, metalness: .55, roughness: .28, clearcoat: 1, clearcoatRoughness: .08 });
  const bentuk = new THREE.Shape();
  bentuk.moveTo(0, .22); bentuk.lineTo(.05, .48); bentuk.quadraticCurveTo(.6, .62, 1.5, .74); bentuk.lineTo(3.3, .8); bentuk.quadraticCurveTo(4.1, .84, 4.4, .78); bentuk.lineTo(4.45, .3); bentuk.lineTo(4.2, .2); bentuk.lineTo(.2, .2); bentuk.closePath();
  const badan = new THREE.Mesh(new THREE.ExtrudeGeometry(bentuk, { depth: 1.75, bevelEnabled: true, bevelThickness: .08, bevelSize: .06, bevelSegments: 4 }), cat);
  badan.position.set(-2.2, 0, -.87); badan.castShadow = true; g.add(badan);
  const kabin = new THREE.Shape();
  kabin.moveTo(1.55, .74); kabin.quadraticCurveTo(2.1, 1.12, 2.6, 1.15); kabin.lineTo(3.0, 1.14); kabin.quadraticCurveTo(3.5, 1.0, 3.8, .82); kabin.lineTo(1.55, .74);
  const kaca = new THREE.Mesh(new THREE.ExtrudeGeometry(kabin, { depth: 1.45, bevelEnabled: true, bevelThickness: .05, bevelSize: .04, bevelSegments: 3 }), new THREE.MeshPhysicalMaterial({ color: 0x121821, metalness: .9, roughness: .06, clearcoat: 1 }));
  kaca.position.set(-2.2, 0, -.72); kaca.castShadow = true; g.add(kaca);
  const ban = new THREE.CylinderGeometry(.34, .34, .3, 28), velg = new THREE.CylinderGeometry(.23, .23, .32, 10);
  [[-1.3, .95], [-1.3, -.95], [1.25, .95], [1.25, -.95]].forEach(([x, z]) => {
    const b = new THREE.Mesh(ban, bahan("#16181c", { roughness: .9 })); b.rotation.x = Math.PI / 2; b.position.set(x, .34, z); b.castShadow = true; g.add(b);
    const v = new THREE.Mesh(velg, bahan("#c8ced6", { metalness: 1, roughness: .25 })); v.rotation.x = Math.PI / 2; v.position.set(x, .34, z); g.add(v);
  });
  [-.6, .6].forEach(z => {
    const ld = new THREE.Mesh(geoBox(.06, .08, .35), new THREE.MeshBasicMaterial({ color: 0xfff6dc })); ld.position.set(-2.25, .5, z); g.add(ld);
    const lb = new THREE.Mesh(geoBox(.06, .07, .45), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); lb.position.set(2.26, .62, z); g.add(lb);
  });
  if (spoiler) { kotak(g, .35, .05, 1.7, cat, 2.05, .98, 0); kotak(g, .06, .18, .06, "#222", 2.05, .8, -.6); kotak(g, .06, .18, .06, "#222", 2.05, .8, .6); }
  return g;
}

function garasi(g, r, y) {
  lantaiBertekstur(g, r.x + .2, r.z + .2, r.w - .4, r.d - .4, y + .01, "beton", 3);
  // kanopi di atas tiang
  [[r.x + .4, r.z + .4], [r.x + r.w - .4, r.z + .4], [r.x + .4, r.z + r.d - .4], [r.x + r.w - .4, r.z + r.d - .4]].forEach(([x, z]) => kotak(g, .25, 3.2, .25, "#2b2f38", x, y, z));
  // atap pergola (bilah) supaya mobil tetap terlihat dari atas
  for (let bx = r.x + .6; bx < r.x + r.w - .3; bx += 1.1) kotak(g, .14, .22, r.d, "#2b2f38", bx, y + 3.2, r.z + r.d / 2, { bayang: true });
  kotak(g, r.w, .25, .25, "#2b2f38", r.x + r.w / 2, y + 3.2, r.z + .3); kotak(g, r.w, .25, .25, "#2b2f38", r.x + r.w / 2, y + 3.2, r.z + r.d - .3);
  const neon = kotak(g, r.w - 1, .08, .08, bahan("#5fd4ff", { emissive: 0x5fd4ff, emissiveIntensity: 1.5 }), r.x + r.w / 2, y + 3.12, r.z + r.d - .2, { bayang: false });
  neon.castShadow = false;
  const lampu = new THREE.PointLight(0xdff4ff, 14, 14, 1.8); lampu.position.set(r.x + r.w / 2, y + 2.9, r.z + r.d / 2); g.add(lampu);
  // papan nama
  const papan = new THREE.Mesh(new THREE.PlaneGeometry(5, .7), new THREE.MeshBasicMaterial({ map: kanvasTeks(500, 70, (c, w, h) => { c.fillStyle = "#111"; c.fillRect(0, 0, w, h); c.fillStyle = "#5fd4ff"; c.font = "bold 40px 'Space Grotesk', Arial"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("GARASI CELL", w / 2, h / 2 + 2); }), toneMapped: false }));
  papan.position.set(r.x + r.w / 2, y + 3.0, r.z + r.d + .01); g.add(papan);
  // meja putar + mobil merah
  const putar = new THREE.Group(); putar.position.set(r.x + 4.2, y, r.z + 3.6); g.add(putar);
  silinder(putar, 2.6, 2.6, .08, "#3a3f4a", 0, 0, 0, { seg: 48, bahan: { metalness: .6, roughness: .3 } });
  const merah = mobilSport(0xd3202a, true); merah.position.y = .08; putar.add(merah);
  animasi.push(dt => { putar.rotation.y += dt * .25; });
  const kuning = mobilSport(0xf2b705, false); kuning.position.set(r.x + 10.5, y, r.z + 3.6); kuning.rotation.y = -.35; g.add(kuning);
  // lemari alat
  kotak(g, 2, 1.6, .5, "#c0392b", r.x + r.w - 1.6, y, r.z + .6, { bahan: { metalness: .4, roughness: .4 } });
  [[r.x + 2, r.z + 6.2], [r.x + 7.5, r.z + 6.2], [r.x + 12.5, r.z + 6.2], [r.x + 13.2, r.z + 1.6]].forEach(([x, z]) => spotSantai.push({ x, z, jenis: "garasi", ruang: "garasi" }));
}

// ---------- lift kaca + menara nama ----------
function bangunLift() {
  const atas = LY(5) + 4.2;
  const lift = new THREE.Group(); scene.add(lift);
  const kaca = new THREE.Mesh(geoBox(2.6, atas - DASAR, 2.6), new THREE.MeshPhysicalMaterial({ color: 0xbfe3f5, roughness: .05, transparent: true, opacity: .18, depthWrite: false }));
  kaca.position.set(LIFT.x, DASAR + (atas - DASAR) / 2, LIFT.z); lift.add(kaca);
  [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]].forEach(([dx, dz]) => kotak(lift, .12, atas - DASAR, .12, "#3a3f4a", LIFT.x + dx, DASAR, LIFT.z + dz, { bahan: { metalness: .7, roughness: .3 } }));
  for (let n = 1; n <= 5; n++) kotak(lift, 2.8, .15, 2.8, "#3a3f4a", LIFT.x, LY(n) + (n === 5 ? 4 : 0) - .15, LIFT.z, { bayang: false });
  // papan nama di puncak lift
  const papan = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.6), new THREE.MeshBasicMaterial({ map: kanvasTeks(600, 160, (c, w, h) => { c.fillStyle = "#1c1a17"; c.beginPath(); c.roundRect(0, 0, w, h, 26); c.fill(); gambarLogo(c, 16, 16, 128); c.font = "bold 66px 'Space Grotesk', Inter, Arial"; c.textBaseline = "middle"; c.fillStyle = "#e8a317"; c.fillText("MARKAS", 158, 82); c.fillStyle = "#fff"; c.fillText("CELL", 418, 82); }), toneMapped: false, transparent: true }));
  papan.position.set(LIFT.x - 1.5, atas + 1, LIFT.z + 1.4); lift.add(papan);
  kotak(lift, .15, 1, .15, "#3a3f4a", LIFT.x - 3, atas, LIFT.z + 1.3); kotak(lift, .15, 1, .15, "#3a3f4a", LIFT.x, atas, LIFT.z + 1.3);
  // dinding lift di lantai 1-4 (sisi koridor) supaya tampak seperti inti gedung
  for (let n = 1; n <= 4; n++) {
    const yy = LY(n), gl = grupLantai[n];
    lantaiBertekstur(gl, 12, -9, 3, 6, yy, "koridor", 2);
    dinding(gl, 12, -9, 12, -3, yy, 1.05);
    dindingPintu(gl, "x", -3, 12, 15, 13.5, yy, 1.4);
  }
}

// =====================================================================
//  KARAKTER PIXEL
// =====================================================================
const cacheTek = new Map();
function tekSprite(a, pose, frame) {
  const k = a.id + pose + frame;
  if (!cacheTek.has(k)) {
    const t = new THREE.CanvasTexture(P.sprite(a, pose, frame));
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
    cacheTek.set(k, t);
  }
  return cacheTek.get(k);
}
const tekSeru = kanvasTeks(64, 64, (c) => { c.fillStyle = "#e5484d"; c.beginPath(); c.arc(32, 32, 28, 0, 7); c.fill(); c.strokeStyle = "#fff"; c.lineWidth = 4; c.stroke(); c.fillStyle = "#fff"; c.fillRect(28, 14, 8, 24); c.fillRect(28, 43, 8, 8); });
const tekBayang = kanvasTeks(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(0,0,0,.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
const geoBayang = new THREE.PlaneGeometry(1.1, .65), bahanBayang = new THREE.MeshBasicMaterial({ map: tekBayang, transparent: true, depthWrite: false });
const cincinPilih = new THREE.Mesh(new THREE.RingGeometry(.5, .65, 32), new THREE.MeshBasicMaterial({ color: 0xe8a317, transparent: true, opacity: .95, side: THREE.DoubleSide, depthWrite: false }));
cincinPilih.rotation.x = -Math.PI / 2; cincinPilih.visible = false; scene.add(cincinPilih);
const pod = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .08, 24), new THREE.MeshStandardMaterial({ color: 0x5fd4ff, emissive: 0x2fb6ff, emissiveIntensity: .8 }));

const AGENT_3D = [];
const lapis = $("lapisLabel");
function buatAgent3D(id) {
  const a = A[id];
  const obj = new THREE.Group(); scene.add(obj);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tekSprite(a, "depan", 0), transparent: true, alphaTest: .5 }));
  sp.center.set(.5, 0); sp.scale.set(LEBAR_ORANG, TINGGI_ORANG, 1); sp.userData.id = id; obj.add(sp);
  const by = new THREE.Mesh(geoBayang, bahanBayang); by.rotation.x = -Math.PI / 2; by.position.y = .02; obj.add(by);
  const seru = new THREE.Sprite(new THREE.SpriteMaterial({ map: tekSeru, transparent: true }));
  seru.scale.set(.5, .5, 1); seru.position.y = TINGGI_ORANG + .35; seru.visible = false; seru.renderOrder = 10; obj.add(seru);
  const podSaya = pod.clone(); podSaya.visible = false; podSaya.position.y = -.04; obj.add(podSaya);
  const label = document.createElement("div"); label.className = "label-3d"; label.innerHTML = `<i></i>${esc(id)}`; lapis.appendChild(label);
  const gel = document.createElement("div"); gel.className = "gelembung"; gel.hidden = true; lapis.appendChild(gel);
  const s = { id, a, obj, sp, seru, pod: podSaya, label, gel, jalur: [], lantai: 1, pose: "depan", frame: 0, waktuFrame: 0, sampai: true, spot: null, tujuan: null, keadaanTampil: null };
  AGENT_3D.push(s);
  return s;
}
const posisiLantai = id => { const s = AGENT_3D.find(x => x.id === id); return s ? s.lantai : A[id].lantai; };

/** tempat tujuan menurut keadaan: kerja/menunggu -> meja, santai -> rooftop */
const spotDipakai = new Map();
// Rapat: saat Jarvis memecah perintah baru, Jarvis + Cell + Bayu + Vera berkumpul di Ruang Rapat (lantai 4)
const rapat = { ids: [], perintah: null, sampai: 0 };
const PESERTA_RAPAT = ["Jarvis", "Cell", "Bayu", "Vera"];
function kursiRapatUntuk(id) {
  const i = rapat.ids.indexOf(id);
  if (i < 0 || !kursiRapat.length) return null;
  const urut = [...kursiRapat].sort((p, q) => p.urut - q.urut);
  return urut[i % urut.length];
}
function tujuanUntuk(s) {
  const a = s.a, kr = kursiRapatUntuk(a.id);
  if (kr) return { lantai: kr.lantai, x: kr.x, z: kr.z, rapat: true, hadap: kr.hadap };
  if (a.keadaan === "santai" && !a.owner && a.id !== "Jarvis") {
    if (s.spot && spotDipakai.get(s.spot) === s.id) return { lantai: 5, x: s.spot.x, z: s.spot.z, spot: s.spot };
    const mulai = hash(a.id) % spotSantai.length;
    for (let i = 0; i < spotSantai.length; i++) {
      const sp = spotSantai[(mulai + i * 7) % spotSantai.length];
      if (!spotDipakai.has(sp)) { spotDipakai.set(sp, s.id); return { lantai: 5, x: sp.x, z: sp.z, spot: sp }; }
    }
    return { lantai: 5, x: -2 + (hash(a.id) % 10), z: JALAN_ATAP_Z + .4 };
  }
  const k = kursiAgent[a.id] || { lantai: a.lantai, x: 0, z: 0 };
  if (a.keadaan === "menunggu" && k.meja) return { lantai: k.lantai, x: k.x + .9, z: k.z + .25 };
  return { lantai: k.lantai, x: k.x, z: k.z };
}
function lepasSpot(s) { if (s.spot && spotDipakai.get(s.spot) === s.id) spotDipakai.delete(s.spot); s.spot = null; }

/** jalur lewat koridor & lift */
function buatJalur(s, t) {
  const p = s.obj.position, dariL = s.lantai, jalur = [];
  const zJalan = n => n === 5 ? JALAN_ATAP_Z : KORIDOR_Z;
  if (dariL === t.lantai) {
    if (Math.abs(p.z - t.z) > .2 || Math.abs(p.x - t.x) > 3) {
      jalur.push({ x: p.x, z: zJalan(dariL), l: dariL }, { x: t.x, z: zJalan(dariL), l: dariL });
    }
  } else {
    jalur.push({ x: p.x, z: zJalan(dariL), l: dariL }, { x: LIFT.x, z: zJalan(dariL), l: dariL }, { x: LIFT.x, z: LIFT.z + .6, l: dariL, lift: true });
    jalur.push({ x: LIFT.x, z: LIFT.z + .6, l: t.lantai, naik: true }, { x: LIFT.x, z: zJalan(t.lantai), l: t.lantai }, { x: t.x, z: zJalan(t.lantai), l: t.lantai });
  }
  jalur.push({ x: t.x, z: t.z, l: t.lantai });
  return jalur;
}

function terapkanKeadaan(awal) {
  AGENT_3D.forEach(s => {
    const a = s.a;
    const diRapat = rapat.ids.includes(a.id);
    const kunci = a.keadaan + "|" + (a.keadaan === "santai" ? "" : "m") + (diRapat ? "|rapat" : "");
    if (s.keadaanTampil === kunci) return;
    s.keadaanTampil = kunci;
    if (a.keadaan !== "santai" || diRapat) lepasSpot(s);
    const t = tujuanUntuk(s);
    s.tujuan = t;
    if (t.spot) s.spot = t.spot;
    if (awal) {
      s.lantai = t.lantai; s.obj.position.set(t.x, LY(t.lantai) + (t.spot && t.spot.yTambah || 0), t.z); s.jalur = []; s.sampai = true;
    } else { s.jalur = buatJalur(s, t); s.sampai = false; }
    if (s.meja === undefined) s.meja = (kursiAgent[a.id] || {}).meja || null;
  });
}

const KECEPATAN = 3.4, DETIK_PER_LANTAI = .7;
function gerakAgent(s, dt) {
  const o = s.obj.position;
  if (s.jalur.length) {
    const w = s.jalur[0];
    if (w.naik) {                                 // naik/turun lift
      const yT = LY(w.l); s.pod.visible = true;
      const arah = Math.sign(yT - o.y), langkah = TINGGI / DETIK_PER_LANTAI * dt;
      if (Math.abs(yT - o.y) <= langkah) { o.y = yT; s.lantai = w.l; s.jalur.shift(); s.pod.visible = false; }
      else { o.y += arah * langkah; s.lantai = Math.max(1, Math.min(5, Math.round((o.y - DASAR) / TINGGI) + 1)); }
      aturPose(s, "depan", dt, false);
      return;
    }
    const dx = w.x - o.x, dz = w.z - o.z, jarak = Math.hypot(dx, dz), langkah = KECEPATAN * dt;
    o.y = LY(s.lantai);
    if (jarak <= langkah) { o.x = w.x; o.z = w.z; s.jalur.shift(); }
    else { o.x += dx / jarak * langkah; o.z += dz / jarak * langkah; }
    aturPose(s, dz < -Math.abs(dx) * .5 ? "belakang" : "jalan", dt, true);
    if (!s.jalur.length) { s.sampai = true; if (s.spot && s.spot.yTambah) o.y = LY(5) + s.spot.yTambah; }
    return;
  }
  // diam di tempat
  const a = s.a, diMeja = s.tujuan && !s.tujuan.spot && a.keadaan === "kerja";
  const hadap = (kursiAgent[a.id] || {}).hadap;
  if (s.tujuan && s.tujuan.rapat) aturPose(s, s.tujuan.hadap, dt, false);
  else if (a.keadaan === "menunggu") aturPose(s, "lambai", dt, true);
  else if (diMeja) aturPose(s, hadap === "depan" ? "depan" : "belakang", dt, false);
  else if (s.spot && s.spot.jenis === "basket") aturPose(s, "jalan", dt * .8, true);
  else aturPose(s, "depan", dt, false);
  if (s.spot && s.spot.jenis === "renang") o.y = LY(5) + s.spot.yTambah + Math.sin(performance.now() / 500 + hash(s.id)) * .05;
}
function aturPose(s, pose, dt, animasiFrame) {
  s.waktuFrame += dt;
  if (animasiFrame && s.waktuFrame > .2) { s.waktuFrame = 0; s.frame = 1 - s.frame; }
  if (!animasiFrame) s.frame = 0;
  const kunci = pose + s.frame;
  if (s.poseKunci !== kunci) { s.poseKunci = kunci; s.sp.material.map = tekSprite(s.a, pose, s.frame); s.sp.material.needsUpdate = true; }
}

// =====================================================================
//  KAMERA, FOKUS LANTAI, KLIK
// =====================================================================
let fokus = 0;     // 0 = semua lantai
const tween = { aktif: false, t: 0, dariP: new THREE.Vector3(), keP: new THREE.Vector3(), dariT: new THREE.Vector3(), keT: new THREE.Vector3() };
function terbangKe(posisi, target) {
  tween.dariP.copy(kamera.position); tween.dariT.copy(kontrol.target); tween.keP.copy(posisi); tween.keT.copy(target); tween.t = 0; tween.aktif = true;
}
function kameraLantai(n) {
  const kecil = panggung.clientWidth < 700;
  if (n === 0) return [new THREE.Vector3(30, 23, kecil ? 84 : 66), new THREE.Vector3(0, 9.5, 0)];
  const y = LY(n);
  return [new THREE.Vector3(9, y + (kecil ? 40 : 29), kecil ? 50 : 35), new THREE.Vector3(0, y + .5, 1)];
}
function setFokus(n, terbang = true) {
  fokus = n;
  // fokus 1-4: hanya lantai itu yang tampil (seperti denah melayang); rooftop & semua: gedung utuh
  for (let i = 1; i <= 5; i++) grupLantai[i].visible = n === 0 || n === 5 || i === n;
  M.$$("#tombolLantai button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.l === n));
  const l = LANTAI.find(x => x.no === n);
  $("judulLantai").textContent = l ? `Lantai ${l.no} · ${l.nama}` : "Semua lantai";
  $("ketLantai").textContent = l ? l.julukan : "Markas Cell · 5 lantai · klik lantai untuk masuk";
  if (terbang) { const [p, t] = kameraLantai(n); terbangKe(p, t); }
  if (!pilihan) gambarPanelLantai();
  hitungLantai();
  history.replaceState(null, "", n ? "#lantai=" + n : location.pathname);
}

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let tekan = null, sorot = null;
kanvas.addEventListener("pointerdown", e => { tekan = { x: e.clientX, y: e.clientY }; });
kanvas.addEventListener("pointerup", e => {
  if (!tekan || Math.hypot(e.clientX - tekan.x, e.clientY - tekan.y) > 6) return;
  const b = kanvas.getBoundingClientRect();
  mouse.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1);
  ray.setFromCamera(mouse, kamera);
  const kena = ray.intersectObjects(AGENT_3D.filter(s => s.obj.visible).map(s => s.sp), false)[0];
  if (kena) { pilihAgent(kena.object.userData.id); return; }
  const lt = ray.intersectObjects(meshLantai.filter(m => m.parent.visible), false)[0];
  if (lt && fokus === 0) setFokus(lt.object.userData.lantai);
});
kanvas.addEventListener("pointermove", e => {
  const b = kanvas.getBoundingClientRect();
  mouse.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1);
  ray.setFromCamera(mouse, kamera);
  const kena = ray.intersectObjects(AGENT_3D.filter(s => s.obj.visible).map(s => s.sp), false)[0];
  sorot = kena ? kena.object.userData.id : null;
  kanvas.style.cursor = kena ? "pointer" : "grab";
});

// ---------- garis alur kerja agent terpilih ----------
const grupGaris = new THREE.Group(); scene.add(grupGaris);
function gambarGaris() {
  grupGaris.clear();
  if (!pilihan || !$("optGaris").checked) return;
  const asal = AGENT_3D.find(s => s.id === pilihan);
  (M.tim.koneksi || []).forEach(([dari, ke]) => {
    if (dari !== pilihan && ke !== pilihan) return;
    const lain = AGENT_3D.find(s => s.id === (dari === pilihan ? ke : dari)); if (!lain || !asal) return;
    const p1 = asal.obj.position.clone().setY(asal.obj.position.y + 1.6), p2 = lain.obj.position.clone().setY(lain.obj.position.y + 1.6);
    const tengah = p1.clone().add(p2).multiplyScalar(.5); tengah.y += 2 + p1.distanceTo(p2) * .15;
    const kurva = new THREE.QuadraticBezierCurve3(p1, tengah, p2);
    const garis = new THREE.Mesh(new THREE.TubeGeometry(kurva, 30, .05, 6), new THREE.MeshBasicMaterial({ color: dari === pilihan ? 0xe8a317 : 0x2f6fed, transparent: true, opacity: .85, depthTest: false }));
    garis.renderOrder = 5; grupGaris.add(garis);
  });
}

// =====================================================================
//  PANEL SAMPING
// =====================================================================
let pilihan = null;
const img = (id, s = 2) => A[id] ? `<img class="pixel" src="${P.url(A[id], s)}" alt="" width="14" height="21">` : "";
function pilihAgent(id) {
  pilihan = id;
  const s = AGENT_3D.find(x => x.id === id);
  if (s && s.lantai !== fokus) setFokus(s.lantai);
  gambarPanelAgent(); gambarGaris(); pilihTab("agent");
  history.replaceState(null, "", "#agent=" + encodeURIComponent(id));
}
function gambarPanelAgent() {
  const a = A[pilihan]; if (!a) return gambarPanelLantai();
  const div = M.divisi[a.divisi] || {};
  $("tabAgent").innerHTML = `
    <div class="kartu profil-mini">
      <div class="atas">${img(a.id, 4)}<div><span class="chip"><i class="titik" style="background:${div.warna}"></i>${esc(div.nama || "")}</span>
        <h3>${esc(a.id)}${a.manajer ? ' <span style="color:var(--emas)">★</span>' : ""}</h3><p class="jab">${esc(a.jabatan)}</p></div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${M.lencanaKeadaan(a)} <span class="chip ${M.kelasStatus(a.status_label)}">${esc(a.status_label)}</span></div>
      ${a.pesan ? `<p class="pesan-kerja">${esc(a.pesan)}</p>` : ""}
      <dl><dt>Ruangan</dt><dd>${esc(M.namaRuang(a.ruang))}, Lt ${a.lantai}</dd><dt>Lapor ke</dt><dd>${esc(a.lapor_ke || "-")}</dd>
        <dt>Otak AI</dt><dd>${esc(a.model)} · ${a.jenis === "PY" ? "Skrip Python" : a.jenis === "CC" ? "Sub-agent CC" : esc(a.jenis)}</dd><dt>Kemampuan</dt><dd>${esc(a.tugas_pokok)}</dd></dl>
      ${panelToken(a.id)}
      <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn btn-kecil btn-utama" href="agent.html#${encodeURIComponent(a.id)}">Skill lengkap</a><button class="btn btn-kecil" id="kembali">← Daftar lantai</button></div>
    </div>
    ${a.owner && a.id !== "Jarvis" ? "" : !a.aktif || a.id === "Vera"
      ? `<div class="kartu profil-mini"><b style="font-size:14px">${a.id === "Vera" ? "Vera memeriksa otomatis" : "Belum aktif di Markas 2.0"}</b>
          <p class="pesan-info">${a.id === "Vera" ? "Vera menjalankan QA untuk setiap hasil Bayu sebelum sampai ke Cell." : "Yang bekerja sungguhan sekarang: Jarvis (pembagi tugas), Bayu (web), dan Vera (QA)."}</p></div>`
      : `<form class="kartu profil-mini" id="formTugas"><b style="font-size:14px">${a.id === "Jarvis" ? "Perintah ke Jarvis" : "Tugas langsung ke " + esc(a.id)}</b>
      <textarea class="input" id="isiTugas" maxlength="${a.id === "Jarvis" ? 2000 : 120}" placeholder="${a.id === "Jarvis" ? "contoh: buatkan landing page laundry kiloan, responsif di HP" : "contoh: halaman harga paket laundry"}"></textarea>
      <div style="display:flex;gap:8px;align-items:center"><button class="btn btn-kecil btn-utama" type="submit">Kirim</button><span class="pesan-info" id="infoTugas"></span></div></form>`}`;
  $("kembali").onclick = () => { pilihan = null; cincinPilih.visible = false; grupGaris.clear(); gambarPanelLantai(); history.replaceState(null, "", fokus ? "#lantai=" + fokus : location.pathname); };
  const f = $("formTugas");
  if (f) f.onsubmit = async e => {
    e.preventDefault(); const teks = $("isiTugas").value.trim(), info = $("infoTugas");
    if (teks.length < 3) { info.className = "pesan-info gagal"; info.textContent = "Minimal 3 huruf"; return; }
    try {
      const r = a.id === "Jarvis" ? await M.kirimPerintah(teks) : await M.kirimTugas(a.id, teks);
      info.className = "pesan-info ok"; info.textContent = `${a.id === "Jarvis" ? "Perintah" : "Tugas"} #${r.id} diterima`; $("isiTugas").value = "";
    } catch (err) {
      info.className = "pesan-info gagal";
      info.innerHTML = /masuk/i.test(err.message) ? 'Masuk dulu di <a href="kontrol.html">halaman Kontrol</a>' : esc(err.message);
    }
  };
}
function panelToken(id) {
  const t = ((M.snapshot && M.snapshot.token && M.snapshot.token.per_agent) || []).find(x => x.agent === id);
  if (!t) return `<div class="token-agent"><span>Token hari ini</span><b>0</b></div>`;
  return `<div class="token-agent" title="Dicatat dari keluaran Claude Code setiap kali agent bekerja"><span>Token hari ini · ${t.panggilan} panggilan${t.biaya_usd ? ` · ±$${t.biaya_usd.toFixed(2)}` : ""}</span><b>${M.angka(t.masuk + t.keluar)}</b></div>`;
}
function gambarPanelLantai() {
  const daftarL = fokus ? LANTAI.filter(l => l.no === fokus) : [...LANTAI].reverse();
  $("tabAgent").innerHTML = `<p class="kosong" style="font-size:13px">Klik karakter di gedung atau nama di bawah untuk melihat detail dan memberi tugas.</p>` +
    daftarL.map(l => {
      const ruang = l.ruang.filter(r => M.urutan.some(id => A[id].ruang === r.id));
      const santai = l.no === 5 ? M.urutan.filter(id => A[id].keadaan === "santai" && !A[id].owner && id !== "Jarvis") : [];
      const baris = ids => ids.map(id => `<button data-id="${id}">${img(id)}<span><b>${esc(id)}</b> <span style="color:var(--tinta-3)">${esc(A[id].jabatan)}</span></span>${M.lencanaKeadaan(A[id])}</button>`).join("");
      return `<div class="kartu" style="padding:8px"><div class="ruang-judul" style="font-size:12px;padding:6px 8px;display:flex;gap:8px;align-items:center;font-weight:700"><i class="titik" style="background:${l.warna}"></i>Lantai ${l.no} · ${esc(l.nama)}</div>
        <div class="daftar-lantai">${l.no === 5 ? (santai.length ? `<div class="ruang-judul">Sedang santai di sini</div>` + baris(santai) : `<p class="kosong" style="padding:4px 8px">Belum ada yang santai.</p>`)
          : ruang.map(r => `<div class="ruang-judul">${esc(r.nama)}</div>` + baris(M.urutan.filter(id => A[id].ruang === r.id))).join("")}</div></div>`;
    }).join("");
}
$("tabAgent").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b) pilihAgent(b.dataset.id); });
function pilihTab(t) {
  M.$$(".sisi-tab button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === t));
  $("tabAgent").hidden = t !== "agent"; $("tabOk").hidden = t !== "ok"; $("tabLog").hidden = t !== "log"; $("tabLapor").hidden = t !== "lapor";
  if (t === "lapor") cekSesi();
}
M.$(".sisi-tab").addEventListener("click", e => { const b = e.target.closest("button"); if (b) pilihTab(b.dataset.tab); });
$("daftarOk").addEventListener("click", aksiPerluOk);
$("daftarOk").addEventListener("submit", aksiPerluOk);

function hitungLantai() {
  const ids = M.urutan.filter(id => !A[id].owner && (fokus === 0 || posisiLantai(id) === fokus || (fokus !== 5 && A[id].lantai === fokus && A[id].keadaan !== "santai")));
  const n = k => ids.filter(id => A[id].keadaan === k).length;
  $("hKerja").textContent = n("kerja"); $("hTunggu").textContent = n("menunggu"); $("hSantai").textContent = fokus && fokus !== 5 ? 0 : n("santai");
}

// tombol lift
$("tombolLantai").innerHTML = [`<button class="tombol-lantai" data-l="0" style="--wl:#e8a317" aria-pressed="true"><span class="no">◇</span><b>Semua lantai</b><small>Tampak luar gedung</small></button>`]
  .concat([...LANTAI].reverse().map(l => `<button class="tombol-lantai" data-l="${l.no}" style="--wl:${l.warna}" aria-pressed="false"><span class="no">${l.no === 5 ? "R" : l.no}</span><b>${esc(l.nama)}</b><small id="kecilL${l.no}">${esc(l.julukan)}</small></button>`)).join("");
$("tombolLantai").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { pilihan = null; cincinPilih.visible = false; grupGaris.clear(); setFokus(+b.dataset.l); } });
$("optPutar").addEventListener("change", e => { kontrol.autoRotate = e.target.checked; });
$("optGaris").addEventListener("change", gambarGaris);

// =====================================================================
//  BANGUN SEMUA & JALANKAN
// =====================================================================
bangunSekitar();
LANTAI.forEach(bangunLantai);
bangunLift();
M.urutan.forEach(buatAgent3D);
terapkanKeadaan(true);
gambarLayarJarvis();

// label ruang (HTML di atas kanvas)
labelRuang.forEach(r => { r.el = document.createElement("div"); r.el.className = "label-ruang"; r.el.style.setProperty("--wl", r.warna); r.el.textContent = r.teks; lapis.appendChild(r.el); });

function ukur() {
  const w = panggung.clientWidth, h = panggung.clientHeight;
  renderer.setSize(w, h, false); kamera.aspect = w / h; kamera.updateProjectionMatrix();
}
new ResizeObserver(ukur).observe(panggung); ukur();

// posisi awal dari alamat (#lantai=3 / #agent=Kevin)
const awalHash = decodeURIComponent(location.hash.slice(1));
const [p0, t0] = kameraLantai(0); kamera.position.copy(p0); kontrol.target.copy(t0);
if (/^lantai=\d/.test(awalHash)) setFokus(+awalHash.split("=")[1]);
else setFokus(0, false);
if (/^agent=/.test(awalHash) && A[awalHash.slice(6)]) setTimeout(() => pilihAgent(awalHash.slice(6)), 300);

const v = new THREE.Vector3();
function proyeksi(pos) { v.copy(pos).project(kamera); return v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 ? [(v.x + 1) / 2 * panggung.clientWidth, (1 - v.y) / 2 * panggung.clientHeight] : null; }
function perbaruiLabel() {
  const semuaNama = $("optLabel").checked;
  AGENT_3D.forEach(s => {
    const terlihat = s.obj.visible, a = s.a;
    const diLantaiIni = fokus === 0 || s.lantai === fokus;
    const tampil = terlihat && (s.id === pilihan || s.id === sorot || (diLantaiIni && (semuaNama || a.keadaan === "menunggu" || fokus !== 0)));
    let xy = tampil ? proyeksi(v.set(s.obj.position.x, s.obj.position.y + TINGGI_ORANG + (a.keadaan === "menunggu" ? .65 : .2), s.obj.position.z)) : null;
    if (xy) { s.label.style.display = ""; s.label.style.transform = `translate(${xy[0]}px,${xy[1]}px) translate(-50%,-100%)`; s.label.classList.toggle("pilih", s.id === pilihan);
      s.label.firstChild.style.background = `var(--${a.keadaan})`; }
    else s.label.style.display = "none";
    // gelembung tugas: teks pekerjaan SUNGGUHAN dari database (kolom pesan agent), seperti obrolan di kantor
    const diRapat = rapat.ids.includes(s.id) && s.tujuan && s.tujuan.rapat;
    const teksGel = !diRapat ? a.pesan : !s.sampai ? `Menuju rapat #${rapat.perintah}`
      : (s.id === "Jarvis" && a.pesan ? a.pesan : `Rapat perintah #${rapat.perintah}`);
    const otomatis = $("optGelembung").checked && a.keadaan !== "santai" && diLantaiIni;
    const gelTampil = terlihat && teksGel && (diRapat || (s.sampai && (s.id === pilihan || s.id === sorot || otomatis)));
    xy = gelTampil ? proyeksi(v.set(s.obj.position.x, s.obj.position.y + TINGGI_ORANG + (a.keadaan === "menunggu" ? 1.25 : .8), s.obj.position.z)) : null;
    if (xy) {
      const kelas = "gelembung aktif" + (diRapat ? " g-rapat" : a.keadaan === "menunggu" ? " g-menunggu" : "");
      if (s.gelKelas !== kelas) { s.gel.className = kelas; s.gelKelas = kelas; }
      if (s.gelTeks !== teksGel) { s.gel.textContent = teksGel; s.gelTeks = teksGel; }
      s.gel.hidden = false; s.gel.style.transform = `translate(${xy[0]}px,${xy[1]}px) translate(-50%,-100%)`;
    } else s.gel.hidden = true;
  });
  labelRuang.forEach(r => {
    const xy = fokus === r.lantai ? proyeksi(r.pos) : null;
    if (xy) { r.el.style.display = ""; r.el.style.transform = `translate(${xy[0]}px,${xy[1]}px) translate(-50%,-50%)`; } else r.el.style.display = "none";
  });
}

const jam = new THREE.Clock();
function loop() {
  const dt = Math.min(jam.getDelta(), .05), t = jam.elapsedTime;
  if (tween.aktif) {
    tween.t = Math.min(1, tween.t + dt / 1.1);
    const e = tween.t < .5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    kamera.position.lerpVectors(tween.dariP, tween.keP, e); kontrol.target.lerpVectors(tween.dariT, tween.keT, e);
    if (tween.t >= 1) tween.aktif = false;
  }
  AGENT_3D.forEach(s => {
    gerakAgent(s, dt);
    s.obj.visible = fokus === 0 || fokus === 5 || Math.abs(s.obj.position.y - LY(fokus)) < 1;
    s.seru.visible = s.a.keadaan === "menunggu";
    if (s.seru.visible) s.seru.position.y = TINGGI_ORANG + .35 + Math.abs(Math.sin(t * 3 + s.id.length)) * .15;
    // layar monitor menyala saat agent bekerja di mejanya
    const k = kursiAgent[s.id];
    if (k && k.meja) {
      const nyala = s.a.keadaan === "kerja" && s.sampai && !s.spot && !(s.tujuan && s.tujuan.rapat);
      if (k.meja.nyala !== nyala) { k.meja.nyala = nyala; k.meja.layar.material = nyala ? [LAYAR_MATI, LAYAR_MATI, LAYAR_MATI, LAYAR_MATI, new THREE.MeshBasicMaterial({ map: tekLayar(k.meja.jenisLayar), toneMapped: false }), LAYAR_MATI] : LAYAR_MATI; }
    }
  });
  const ps = AGENT_3D.find(s => s.id === pilihan);
  if (ps) { cincinPilih.visible = ps.obj.visible; cincinPilih.position.set(ps.obj.position.x, ps.obj.position.y + .04, ps.obj.position.z); cincinPilih.scale.setScalar(1 + Math.sin(t * 4) * .08); }
  animasi.forEach(f => f(dt, t));
  kontrol.update();
  renderer.render(scene, kamera);
  perbaruiLabel();
  requestAnimationFrame(loop);
}
loop();
setTimeout(() => $("memuat").classList.add("hilang"), 200);
setTimeout(() => { $("petunjuk").style.opacity = 0; $("petunjuk").style.transition = "opacity .6s"; }, 9000);

// =====================================================================
//  RAPAT, HUD TOKEN, PERLU OK, PERINTAH & LAPORAN WA (semua data dari database)
// =====================================================================
const perintahDikenal = new Map();
let awalPerintah = true;
/** Jarvis sedang memecah perintah (status DIPROSES) -> rapat. Rapat ditahan minimal beberapa
 *  detik supaya terlihat, walaupun Jarvis cepat selesai. */
function cekRapat(s) {
  const kini = Date.now();
  let aktif = null;
  for (const p of s.perintah || []) {
    const lama = perintahDikenal.get(p.id);
    perintahDikenal.set(p.id, p.status);
    if (p.status === "DIPROSES") aktif = p;
    else if (!awalPerintah && p.status === "DIPECAH" && lama !== "DIPECAH") { rapat.perintah = p.id; rapat.sampai = Math.max(rapat.sampai, kini + 15000); }
  }
  awalPerintah = false;
  if (aktif) { rapat.perintah = aktif.id; rapat.sampai = Math.max(rapat.sampai, kini + 8000); }
  if (kini < rapat.sampai && !rapat.ids.length) { rapat.ids = PESERTA_RAPAT.filter(id => A[id]); rapat.mulai = kini; }
}
/** Rapat bubar kalau waktunya habis, tidak ada perintah yang masih dipecah, dan semua peserta
 *  sempat duduk (atau sudah 40 detik, supaya tidak menggantung). */
setInterval(() => {
  if (!rapat.ids.length) return;
  const kini = Date.now(), masihDipecah = M.snapshot && (M.snapshot.perintah || []).some(p => p.status === "DIPROSES");
  const semuaDuduk = AGENT_3D.filter(s => rapat.ids.includes(s.id)).every(s => s.sampai && s.tujuan && s.tujuan.rapat);
  if (semuaDuduk && !rapat.duduk) { rapat.duduk = kini; rapat.sampai = Math.max(rapat.sampai, kini + 6000); }
  if (masihDipecah || kini < rapat.sampai || (!semuaDuduk && kini - rapat.mulai < 40000)) return;
  rapat.ids = []; rapat.duduk = 0; terapkanKeadaan(false);
}, 1000);

function gambarHud(s) {
  const t = s.token || { total: 0, per_agent: [] };
  const biaya = (t.per_agent || []).reduce((n, a) => n + (a.biaya_usd || 0), 0);
  $("tTotal").textContent = M.angka(t.total);
  $("tBiaya").textContent = s.demo ? "(contoh demo)" : biaya ? `±$${biaya.toFixed(2)}` : "";
}

let kunciOk = "";
function gambarPerluOk(s) {
  const tugas = (s.tugas || []).filter(t => t.status === "REVIEW" && t.qa_status === "lulus");
  const lapor = M.urutan.filter(id => A[id].keadaan === "menunggu" && !tugas.some(t => t.agent === id));
  const n = tugas.length + lapor.length;
  $("nOk").hidden = !n; $("nOk").textContent = n;
  const kunci = tugas.map(t => t.id + ":" + t.revisi).join() + "|" + lapor.join();
  if (kunci === kunciOk || $("daftarOk").contains(document.activeElement)) return;
  kunciOk = kunci;
  $("daftarOk").innerHTML = !n ? `<li class="kosong">Tidak ada yang menunggu OK. Aman.</li>`
    : tugas.map(t => `<li class="kartu tugas-ok" data-tugas="${t.id}">
        <div class="atas">${img(t.agent)}<span><b>MC-${t.id} · ${esc(t.judul)}</b><span class="ket">${esc(t.agent)} selesai, QA Vera lulus${t.revisi ? ` · revisi ke-${t.revisi}` : ""}</span></span></div>
        <div class="aksi"><button class="btn btn-kecil btn-utama" data-aksi="setujui" data-id="${t.id}">✓ OK</button>
          <button class="btn btn-kecil" data-aksi="revisi" data-id="${t.id}">Revisi</button>
          <a class="btn btn-kecil" href="kontrol.html#tugas=${t.id}">Lihat hasil</a></div>
        <form class="revisi" data-id="${t.id}" hidden><input class="input" name="alasan" maxlength="500" placeholder="apa yang harus diperbaiki?"><button class="btn btn-kecil" type="submit">Kirim</button></form>
        <span class="pesan-info"></span></li>`).join("")
    + lapor.map(id => `<li class="kartu" data-id="${id}">${img(id)}<span><b>${id}</b><span>${esc(A[id].pesan || "Menunggu jawaban")}</span></span></li>`).join("");
}
async function aksiPerluOk(e) {
  const li = e.target.closest("li");
  if (!li) return;
  if (li.dataset.id && e.type === "click") return pilihAgent(li.dataset.id);
  const info = li.querySelector(".pesan-info"), b = e.target.closest("button[data-aksi]");
  const tampil = (teks, kelas) => { if (info) { info.className = "pesan-info " + kelas; info.innerHTML = teks; } };
  try {
    if (e.type === "submit") {
      e.preventDefault();
      const alasan = e.target.alasan.value.trim();
      if (alasan.length < 3) return tampil("Tulis alasan revisi minimal 3 huruf", "gagal");
      await M.mintaRevisi(+e.target.dataset.id, alasan);
      tampil("Revisi dikirim. Bayu akan memperbaiki.", "ok"); document.activeElement.blur(); kunciOk = "";
    } else if (b && b.dataset.aksi === "revisi") {
      const f = li.querySelector("form.revisi"); f.hidden = !f.hidden; if (!f.hidden) f.alasan.focus();
    } else if (b && b.dataset.aksi === "setujui") {
      b.disabled = true;
      await M.setujui(+b.dataset.id, "");
      tampil("Disetujui. Tugas selesai.", "ok"); kunciOk = "";
    }
  } catch (err) {
    if (b) b.disabled = false;
    if (/masuk/i.test(err.message)) { tampil("Masuk dulu sebagai owner.", "gagal"); pilihTab("lapor"); }
    else tampil(esc(err.message), "gagal");
  }
}

function gambarStatusWa(s) {
  const w = s.wa, el = $("statusWa");
  if (!w || !el) return;
  el.className = "pesan-info " + (w.siap ? "ok" : "");
  el.innerHTML = w.siap
    ? `WA siap ke nomor ${esc(w.tujuan_samar)}. ${w.notif ? "Kabar otomatis aktif: kamu dapat WA saat tugas menunggu OK atau gagal." : "Kabar otomatis mati (WA_NOTIF=0)."}`
    : w.ada_tujuan ? "FONNTE_TOKEN belum diisi di .env. Tombol kirim akan memberi tautan wa.me untuk kirim manual."
      : "Isi WA_TUJUAN dan FONNTE_TOKEN di file .env supaya laporan terkirim otomatis.";
}

let peranSaya = null;
async function cekSesi() {
  try { peranSaya = (await M.saya()).peran; } catch (e) { peranSaya = "viewer"; }
  $("kotakMasuk").hidden = peranSaya === "owner";
}
$("formMasuk3d").addEventListener("submit", async e => {
  e.preventDefault();
  const info = $("infoMasuk3d");
  try { await M.masuk($("kunci3d").value.trim()); $("kunci3d").value = ""; info.className = "pesan-info ok"; info.textContent = "Berhasil masuk"; await cekSesi(); }
  catch (err) { info.className = "pesan-info gagal"; info.textContent = /salah/i.test(err.message) ? "Kunci owner salah" : err.message; }
});
function hasilWa(h) {
  if (h.terkirim) return { kelas: "ok", html: "✓ " + esc(h.pesan) };
  const tautan = h.tautan ? ` <a href="${esc(h.tautan)}" target="_blank" rel="noopener">Buka WhatsApp →</a>` : "";
  return { kelas: h.cara === "manual" ? "" : "gagal", html: esc(h.pesan) + tautan };
}
$("formPerintah3d").addEventListener("submit", async e => {
  e.preventDefault();
  const teks = $("isiPerintah3d").value.trim(), info = $("infoPerintah3d");
  if (teks.length < 5) { info.className = "pesan-info gagal"; info.textContent = "Tulis perintah minimal 5 huruf"; return; }
  try {
    const r = await M.kirimPerintah(teks, $("prioritas3d").checked ? "tinggi" : "normal");
    $("isiPerintah3d").value = "";
    if (r.jenis === "laporan_wa") { const h = hasilWa(r.wa); info.className = "pesan-info " + h.kelas; info.innerHTML = "Laporan per agent: " + h.html; return; }
    info.className = "pesan-info ok"; info.textContent = `Perintah #${r.id} diterima. Lihat rapat Jarvis di Lantai 4.`;
    pilihan = null; cincinPilih.visible = false; grupGaris.clear(); setFokus(4);
  } catch (err) {
    info.className = "pesan-info gagal";
    info.textContent = /masuk/i.test(err.message) ? "Masuk dulu sebagai owner (kotak di atas)." : err.message;
    if (/masuk/i.test(err.message)) cekSesi();
  }
});
$("lihatLaporan").addEventListener("click", async () => {
  const info = $("infoLaporan");
  try { const r = await M.laporan(); $("isiLaporan").textContent = r.teks; $("isiLaporan").hidden = false; info.textContent = ""; }
  catch (err) { info.className = "pesan-info gagal"; info.textContent = /masuk/i.test(err.message) ? "Masuk dulu sebagai owner." : err.message; cekSesi(); }
});
$("kirimLaporan").addEventListener("click", async () => {
  const info = $("infoLaporan"), b = $("kirimLaporan");
  b.disabled = true; info.className = "pesan-info"; info.textContent = "Mengirim…";
  try { const r = await M.kirimLaporan(); const h = hasilWa(r); info.className = "pesan-info " + h.kelas; info.innerHTML = h.html; $("isiLaporan").textContent = r.teks; $("isiLaporan").hidden = false; }
  catch (err) { info.className = "pesan-info gagal"; info.textContent = /masuk/i.test(err.message) ? "Masuk dulu sebagai owner." : err.message; cekSesi(); }
  finally { b.disabled = false; }
});
if (/^lapor/.test(location.hash.slice(1))) pilihTab("lapor");

// =====================================================================
//  DATA LIVE
// =====================================================================
let logAda = 0, garisTerakhir = 0;
M.mulaiLive((s, err) => {
  M.navLive(err);
  if (!s) return;
  cekRapat(s);
  terapkanKeadaan(false);
  hitungLantai(); gambarLayarJarvis(); gambarHud(s);
  const sedangMengetik = $("tabAgent").contains(document.activeElement) || (($("isiTugas") || {}).value || "").length > 0;
  if (pilihan) { if (!sedangMengetik) gambarPanelAgent(); if (Date.now() - garisTerakhir > 4000) { gambarGaris(); garisTerakhir = Date.now(); } }
  else if (!$("tabAgent").hidden && !$("tabAgent").contains(document.activeElement)) gambarPanelLantai();
  gambarPerluOk(s);
  gambarStatusWa(s);
  const k = $("konsol");
  s.log.forEach(l => { if (l.id <= logAda) return; logAda = l.id; const d = document.createElement("div"); d.className = "l-" + l.level; d.innerHTML = `<span class="w">${esc(M.jam(l.waktu))}</span> <span class="a">${esc(l.agent)}</span> ${esc(l.teks)}`; k.prepend(d); });
  while (k.children.length > 80) k.lastChild.remove();
  for (const l of LANTAI) { const el = $("kecilL" + l.no); if (!el) continue;
    const kerja = M.urutan.filter(id => A[id].keadaan === "kerja" && A[id].lantai === l.no).length;
    el.innerHTML = l.no === 5 ? `<i style="color:var(--santai)">${M.urutan.filter(id => A[id].keadaan === "santai" && !A[id].owner && id !== "Jarvis").length}</i> santai` : `<i style="color:var(--kerja)">${kerja}</i> kerja · ${l.agent.length} meja`; }
});
window.addEventListener("hashchange", () => { const h = decodeURIComponent(location.hash.slice(1)); if (/^lantai=\d/.test(h) && +h.split("=")[1] !== fokus) setFokus(+h.split("=")[1]); });
window.__gedung = { setFokus, pilihAgent, kamera, kontrol, AGENT_3D, rapat };
