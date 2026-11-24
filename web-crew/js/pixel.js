/* =====================================================================
   PIXEL.JS · pabrik karakter pixel Markas Cell
   Setiap karakter digambar dari kode (14 x 21 pixel) berdasarkan "look" di tim.json:
   kulit, rambut, gaya (spiky/bob/panjang/cap/hijab/botak/pendek/robot), baju, aksen, celana, kacamata.
   Sama persis dengan kantor pixel lama, jadi semua wajah tetap dikenali.
   Pose: depan, jalan (frame 0/1), lambai (frame 0/1), belakang, renang.
   ===================================================================== */
(function () {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function gelap(hex, f) { // f<1 lebih gelap, f>1 lebih terang
    const n = parseInt(hex.replace("#", "").padEnd(6, "0").slice(0, 6), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f <= 1) { r *= f; g *= f; b *= f; } else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
    return "#" + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("");
  }
  function normHex(h) { h = (h || "#888").trim(); if (/^#[0-9a-f]{3}$/i.test(h)) h = "#" + [...h.slice(1)].map(c => c + c).join(""); return h; }
  const cacheSprite = new Map();

  function buatSprite(a, pose, frame) {
    const kunci = a.id + "|" + pose + "|" + frame;
    if (cacheSprite.has(kunci)) return cacheSprite.get(kunci);
    const lk = a.look || {};
    const K = normHex(lk.kulit || "#d39a6a"), Ks = gelap(K, .8);
    const R = normHex(lk.rambut || "#222"), Rh = gelap(R, 1.25);
    const B = normHex(lk.baju || "#557"), Bs = gelap(B, .78);
    const A = normHex(lk.aksen || gelap(B, 1.35));
    const C = normHex(lk.celana || "#2b3044"), Cs = gelap(C, .75);
    const S = "#2a2226", E = "#1a1822", gaya = lk.gaya || "pendek";
    const GW = 14, GH = 21, g = Array.from({ length: GH }, () => Array(GW).fill(null));
    const set = (c, r, col) => { if (c >= 0 && c < 12 && r >= 0 && r < 19 && col) g[r + 1][c + 1] = col; };
    const kotak = (c1, c2, r1, r2, col) => { for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) set(c, r, col); };
    const robot = gaya === "robot", logam = "#b9c6d8", logamS = "#8494ab";
  
    const belakang = pose === "belakang";
    // ----- kepala -----
    if (robot) {
      set(6, 0, A); kotak(3, 8, 1, 1, logamS); kotak(2, 9, 2, 6, logam); kotak(2, 2, 2, 6, logamS);
      if (!belakang) { kotak(3, 8, 3, 4, "#0f1b2a"); set(4, 3, A); set(5, 3, A); set(7, 3, A); set(8, 3, A); set(4, 4, gelap(A, .7)); set(7, 4, gelap(A, .7)); kotak(5, 6, 6, 6, logamS); }
      kotak(5, 6, 7, 7, logamS);
    } else if (gaya === "hijab") {
      kotak(3, 8, 0, 0, R); kotak(2, 9, 1, 2, R); kotak(1, 10, 3, 8, R); kotak(1, 1, 3, 9, gelap(R, .85)); kotak(10, 10, 3, 9, gelap(R, .85));
      if (!belakang) { kotak(3, 8, 3, 6, K); set(4, 4, E); set(7, 4, E); set(3, 5, gelap(K, .93)); set(8, 5, gelap(K, .93)); kotak(5, 6, 6, 6, Ks); kotak(3, 8, 2, 2, Rh); }
      else kotak(4, 7, 1, 2, Rh);
    } else {
      // dasar kepala
      kotak(2, 9, 2, 6, K); kotak(4, 7, 7, 7, Ks);
      if (!belakang) { set(4, 4, E); set(7, 4, E); kotak(5, 6, 6, 6, Ks); set(3, 5, gelap(K, .92)); set(8, 5, gelap(K, .92)); }
      if (gaya === "botak") { kotak(3, 8, 0, 1, K); kotak(2, 9, 1, 2, K); set(4, 0, gelap(K, 1.2)); set(5, 0, gelap(K, 1.2)); if (belakang) kotak(2, 9, 2, 6, K); set(1, 4, Ks); set(10, 4, Ks); }
      else {
        kotak(3, 8, 0, 0, R); kotak(2, 9, 1, 1, R);
        if (gaya === "spiky") { set(2, 0, R); set(9, 0, R); set(5, 0, Rh); set(1, 1, R); set(10, 1, R); kotak(2, 9, 2, 2, R); set(3, 3, R); set(6, 3, R); set(8, 3, R); }
        else if (gaya === "cap") { kotak(2, 9, 0, 1, A); set(4, 0, gelap(A, 1.2)); kotak(2, 10, 2, 2, gelap(A, .7)); set(2, 3, R); set(9, 3, R); }
        else { kotak(2, 9, 2, 2, R); set(3, 3, R); set(2, 3, R); set(9, 3, R); set(4, 1, Rh); set(5, 1, Rh); }
        if (gaya === "bob") { kotak(1, 2, 3, 7, R); kotak(9, 10, 3, 7, R); set(1, 2, R); set(10, 2, R); }
        if (gaya === "panjang") { kotak(1, 2, 2, 10, R); kotak(9, 10, 2, 10, R); set(1, 11, R); set(10, 11, R); }
        if (belakang && gaya !== "cap") kotak(2, 9, 2, 6, R);
        if (belakang && gaya === "cap") { kotak(2, 9, 2, 6, R); kotak(2, 9, 0, 2, A); }
        if (belakang && gaya === "panjang") kotak(3, 8, 7, 11, R);
        if (belakang && gaya === "bob") kotak(2, 9, 7, 7, R);
        if (gaya === "pendek" || gaya === "spiky" || gaya === "cap") { set(1, 4, Ks); set(10, 4, Ks); }
        if (lk.kacamata && !belakang) { set(3, 4, E); set(4, 4, "#bfe3ff"); set(5, 4, E); set(6, 4, E); set(7, 4, "#bfe3ff"); set(8, 4, E); }
      }
    }
    // ----- badan -----
    kotak(2, 9, 8, 12, B); kotak(9, 9, 8, 12, Bs); kotak(2, 2, 9, 12, gelap(B, .9));
    if (gaya === "hijab") kotak(1, 10, 8, 9, R);
    if (!belakang) {
      if (a.owner) { kotak(5, 6, 8, 11, A); set(5, 8, "#fff3c4"); } // jaket owner + aksen emas
      else if (!robot && gaya !== "hijab") { set(4, 8, A); set(7, 8, A); set(5, 8, gelap(K, .9)); set(6, 8, gelap(K, .9)); }
      if (robot) { kotak(5, 6, 9, 10, A); }
      if (a.manajer && !robot) set(3, 10, "#f2c14e");
    }
    // lengan
    const tangan = robot ? logam : K;
    if (pose === "lambai") {
      kotak(1, 1, 8, 11, Bs); set(1, 12, tangan);
      kotak(10, 10, 5, 8, Bs); set(10, 4 - (frame % 2), tangan); set(11, 4 - (frame % 2), tangan);
    } else if (belakang) {
      kotak(1, 1, 8, 10, Bs); kotak(10, 10, 8, 10, Bs); set(1, 11, tangan); set(10, 11, tangan);
    } else {
      kotak(1, 1, 8, 11, Bs); kotak(10, 10, 8, 11, Bs); set(1, 12, tangan); set(10, 12, tangan);
    }
    // ----- kaki -----
    if (!belakang) {
      kotak(2, 9, 13, 13, Cs);
      const jalan = pose === "jalan";
      const kiriAngkat = jalan && frame % 2 === 0, kananAngkat = jalan && frame % 2 === 1;
      kotak(3, 5, 14, kiriAngkat ? 16 : 17, C); kotak(6, 8, 14, kananAngkat ? 16 : 17, C); kotak(5, 5, 15, 17, Cs);
      kotak(3, 5, kiriAngkat ? 17 : 18, kiriAngkat ? 17 : 18, S); kotak(6, 8, kananAngkat ? 17 : 18, kananAngkat ? 17 : 18, S);
      if (robot) { kotak(3, 5, 14, 17, logamS); kotak(6, 8, 14, 17, logamS); }
    }
    // ----- garis tepi gelap -----
    const OUT = "#15121c";
    const asli = g.map(r => r.slice());
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) {
      if (asli[r][c]) continue;
      const t = (rr, cc) => rr >= 0 && rr < GH && cc >= 0 && cc < GW && asli[rr][cc];
      if (t(r - 1, c) || t(r + 1, c) || t(r, c - 1) || t(r, c + 1)) g[r][c] = OUT;
    }
    const cv = document.createElement("canvas"); cv.width = GW; cv.height = GH;
    const cx = cv.getContext("2d");
    for (let r = 0; r < GH; r++) for (let c = 0; c < GW; c++) if (g[r][c]) { cx.fillStyle = g[r][c]; cx.fillRect(c, r, 1, 1); }
    cacheSprite.set(kunci, cv);
    return cv;
  }

  /** Potret besar & tajam (diperbesar tanpa dihaluskan). */
  function potret(a, skala = 6, pose = "depan", frame = 0) {
    const sp = buatSprite(a, pose, frame);
    const cv = document.createElement("canvas");
    cv.width = sp.width * skala; cv.height = sp.height * skala;
    const cx = cv.getContext("2d"); cx.imageSmoothingEnabled = false;
    cx.drawImage(sp, 0, 0, cv.width, cv.height);
    cv.className = "pixel"; cv.setAttribute("role", "img"); cv.setAttribute("aria-label", "Karakter " + a.id);
    return cv;
  }
  /** Data URL potret, cocok untuk <img> */
  const cacheUrl = new Map();
  function url(a, skala = 4, pose = "depan") {
    const k = a.id + skala + pose;
    if (!cacheUrl.has(k)) cacheUrl.set(k, potret(a, skala, pose).toDataURL());
    return cacheUrl.get(k);
  }
  window.PIXEL = { sprite: buatSprite, potret, url, gelap, normHex };
})();
