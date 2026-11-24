/* =====================================================================
   SENI.JS · semua gambar web Markas Cell, digambar dengan kode
   ---------------------------------------------------------------------
   Kenapa tidak pakai foto? Foto internet tidak cocok warnanya dan buram di layar 4K.

   Cara kerjanya (analogi: stempel kecil lalu difotokopi besar):
   1. Setiap adegan digambar di "kanvas kecil" (misal 320 x 160 pixel) seperti pixel art.
   2. Kanvas kecil itu diperbesar ke ukuran layar x devicePixelRatio TANPA dihaluskan.
   Hasilnya: tepi pixel tetap tajam di HP, laptop, sampai monitor 4K, dan ringan
   karena yang digambar ulang tiap frame hanya kanvas kecil.

   Adegan yang tersedia:
     SENI.hero(ctx, t, opsi)          gedung Menara + kota malam
     SENI.lantai(ctx, t, no, opsi)    isi lantai 1-4 dan rooftop (5)
   Dipasang ke <canvas> lewat:  SENI.pasang(canvas, 320, 160, (ctx, t) => ...)
   ===================================================================== */
(function () {
  "use strict";

  // ---------- palet dari logo Menara Agent ----------
  const P = {
    arang: "#1c1a17", arang2: "#26231e", arang3: "#302c25", krem: "#f5f1e8", krem2: "#e6dfd1",
    emas: "#e8a317", emas2: "#f2c14e", emasGelap: "#9a6a00",
    kuning: "#f2c14e", teal: "#2ec4b6", ungu: "#ab7df8", hijau: "#4cc38a", merah: "#ef6b6b", biru: "#4fc3f7",
  };
  const WARNA_LANTAI = { 1: P.hijau, 2: P.ungu, 3: P.teal, 4: P.kuning, 5: P.biru };

  // angka acak yang selalu sama untuk "biji" yang sama (supaya kota tidak berubah tiap frame)
  function acak(biji) { let s = biji >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  function campur(a, b, t) {
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    const r = Math.round(((x >> 16) & 255) * (1 - t) + ((y >> 16) & 255) * t);
    const g = Math.round(((x >> 8) & 255) * (1 - t) + ((y >> 8) & 255) * t);
    const bl = Math.round((x & 255) * (1 - t) + (y & 255) * t);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  }

  // alat gambar dasar
  const kotak = (c, x, y, w, h, warna) => { c.fillStyle = warna; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const titik = (c, x, y, warna) => kotak(c, x, y, 1, 1, warna);

  // ---------- karakter ----------
  // pose: depan | jalan | lambai | belakang | renang  (dari pixel.js)
  function karakter(c, a, x, y, pose = "depan", frame = 0, balik = false) {
    if (!a || !window.PIXEL) return;
    const sp = window.PIXEL.sprite(a, pose, frame);
    if (balik) {
      c.save(); c.translate(Math.round(x) + sp.width, Math.round(y)); c.scale(-1, 1); c.drawImage(sp, 0, 0); c.restore();
    } else c.drawImage(sp, Math.round(x), Math.round(y));
  }

  // gelembung status di atas kepala: "!" kuning (menunggu OK), titik-titik teal (kerja)
  function gelembung(c, x, y, keadaan, t) {
    if (keadaan === "menunggu") {
      const naik = Math.round(Math.sin(t / 250) * 1);
      kotak(c, x, y + naik, 7, 7, P.kuning); kotak(c, x + 3, y + 1 + naik, 1, 3, P.arang); kotak(c, x + 3, y + 5 + naik, 1, 1, P.arang);
      kotak(c, x + 2, y + 7 + naik, 2, 1, P.kuning);
    } else if (keadaan === "kerja") {
      kotak(c, x - 1, y, 9, 5, P.krem);
      for (let i = 0; i < 3; i++) kotak(c, x + 1 + i * 2, y + 2, 1, 1, Math.floor(t / 300) % 3 === i ? P.teal : P.arang3);
      kotak(c, x + 1, y + 5, 2, 1, P.krem);
    }
  }

  // ---------- langit malam + kota (dipakai hero & jendela kantor) ----------
  function langit(c, w, h, t, atas = "#14121a", bawah = "#2b2219") {
    const pita = 12;
    for (let i = 0; i < pita; i++) kotak(c, 0, (h * i) / pita, w, h / pita + 1, campur(atas, bawah, i / (pita - 1)));
    const r = acak(7);
    for (let i = 0; i < w / 5; i++) {
      const x = Math.floor(r() * w), y = Math.floor(r() * h * .6), k = r();
      if (Math.sin(t / 700 + k * 40) > -.2) titik(c, x, y, k > .85 ? P.emas2 : P.krem);
    }
  }
  function kota(c, w, dasar, t, biji, tinggiMaks, warna, warnaJendela, geser = 0) {
    const r = acak(biji);
    let x = -((geser % 40) + 40) % 40 - 40;
    while (x < w + 40) {
      const lb = 14 + Math.floor(r() * 22), tg = 20 + Math.floor(r() * tinggiMaks);
      kotak(c, x, dasar - tg, lb, tg, warna);
      if (r() > .6) kotak(c, x + Math.floor(lb / 2), dasar - tg - 5, 1, 5, warna); // antena kecil
      for (let yy = dasar - tg + 4; yy < dasar - 4; yy += 6)
        for (let xx = x + 3; xx < x + lb - 3; xx += 4) {
          const k = r();
          if (k > .78 && Math.sin(t / 3000 + k * 50) > -.6) kotak(c, xx, yy, 2, 2, warnaJendela);
        }
      x += lb + 2;
    }
  }

  // =====================================================================
  //  HERO: gedung Menara Agent (versi besar logo) di kota malam
  //  ukuran logis 256 x 240
  // =====================================================================
  const JALAN = [];   // pejalan kaki di depan gedung
  function hero(c, t, opsi = {}) {
    const W = 256, H = 240, geser = opsi.geser || 0; // geser = parallax dari scroll
    langit(c, W, H, t);
    // bulan emas
    kotak(c, 200, 26, 18, 18, P.emas2); kotak(c, 203, 23, 12, 24, P.emas2); kotak(c, 197, 29, 24, 12, P.emas2);
    kotak(c, 206, 30, 4, 4, "#e0ae3a"); kotak(c, 211, 38, 3, 3, "#e0ae3a");
    // sorot lampu emas dari puncak menara (berayun pelan)
    const sudut = Math.sin(t / 2600) * .5;
    c.save(); c.globalAlpha = .1; c.fillStyle = P.emas2; c.beginPath();
    c.moveTo(128, 30); c.lineTo(128 + Math.sin(sudut - .12) * 260, 30 - Math.cos(sudut - .12) * 260);
    c.lineTo(128 + Math.sin(sudut + .12) * 260, 30 - Math.cos(sudut + .12) * 260); c.closePath(); c.fill(); c.restore();

    kota(c, W, 206, t, 11, 70, "#221e1a", "#5a4a2a", geser * .3);
    kota(c, W, 212, t, 23, 46, "#2a251f", "#8a6a2a", geser * .6);

    // ---- menara ----
    const x0 = 80, lb = 96;
    // antena + lampu kedip
    kotak(c, x0 + 44, 18, 8, 8, Math.floor(t / 650) % 2 ? P.emas : P.emasGelap);
    if (Math.floor(t / 650) % 2) { c.save(); c.globalAlpha = .25; kotak(c, x0 + 40, 14, 16, 16, P.emas2); c.restore(); }
    kotak(c, x0 + 46, 26, 4, 10, P.krem);
    // kepala robot
    kotak(c, x0 + 4, 36, lb - 8, 30, P.krem); kotak(c, x0 + 6, 34, lb - 12, 2, P.krem);
    kotak(c, x0 + 4, 64, lb - 8, 2, P.krem2);
    const kedip = Math.floor(t / 160) % 30 === 0;
    [x0 + 20, x0 + 60].forEach(mx => {
      if (kedip) kotak(c, mx, 47, 16, 2, P.arang);
      else { kotak(c, mx, 42, 16, 11, P.emas); kotak(c, mx + 2, 44, 4, 3, P.emas2); }
    });
    // 4 lantai (atas = lantai 4)
    const status = opsi.lantaiNyala || {};
    for (let i = 0; i < 4; i++) {
      const no = 4 - i, y = 70 + i * 34, warna = WARNA_LANTAI[no];
      kotak(c, x0, y, lb, 30, P.krem); kotak(c, x0, y + 28, lb, 2, P.krem2);
      for (let j = 0; j < 4; j++) {
        const jx = x0 + 8 + j * 22, nyala = j === 1 || (status[no] ? status[no][j] : Math.sin(t / 1900 + no * 3 + j * 7) > .1);
        kotak(c, jx, y + 7, 16, 16, P.arang);
        if (nyala) {
          kotak(c, jx + 1, y + 8, 14, 14, warna);
          kotak(c, jx + 2, y + 9, 4, 2, campur(warna, "#ffffff", .45));   // kilau kaca
          // siluet agent di jendela
          if ((j + no) % 2 === 0) { kotak(c, jx + 6, y + 13, 4, 4, campur(warna, P.arang, .55)); kotak(c, jx + 5, y + 17, 6, 5, campur(warna, P.arang, .55)); }
          c.save(); c.globalAlpha = .18; kotak(c, jx - 3, y + 4, 22, 22, warna); c.restore();
        }
      }
    }
    // pintu + tanah
    kotak(c, x0 + 40, 196, 16, 10, P.emas); kotak(c, x0 + 47, 196, 2, 10, P.emasGelap);
    kotak(c, x0 - 14, 206, lb + 28, 4, P.krem);
    kotak(c, 0, 210, W, 30, "#1a1814");
    for (let x = ((-t / 40) % 16 + 16) % 16 - 16; x < W; x += 16) kotak(c, x, 224, 8, 1, "#3a3428");
    // lampu jalan
    [24, 232].forEach(lx => { kotak(c, lx, 180, 2, 30, "#4a4436"); kotak(c, lx - 3, 178, 8, 3, P.emas2); c.save(); c.globalAlpha = .12; kotak(c, lx - 12, 181, 26, 29, P.emas2); c.restore(); });

    // pejalan kaki (agent berjalan bolak-balik)
    const agent = opsi.agent || [];
    if (agent.length && !JALAN.length) {
      const r = acak(5);
      for (let i = 0; i < 5; i++) JALAN.push({ a: agent[Math.floor(r() * agent.length)], x: r() * W, v: (r() > .5 ? 1 : -1) * (.012 + r() * .01) });
    }
    JALAN.forEach((p, i) => {
      const x = ((p.x + p.v * t) % (W + 40) + W + 40) % (W + 40) - 20;
      karakter(c, p.a, x, 209 - 21 + (i % 2) * 6, "jalan", Math.floor(t / 180 + i) % 2, p.v < 0);
    });
  }

  // =====================================================================
  //  LANTAI: isi tiap lantai, ukuran logis 320 x 160
  //  opsi.penghuni = [{a, keadaan}]  (agent di lantai itu + statusnya)
  // =====================================================================
  const TEMA = {
    1: { dinding: "#2a2a24", lis: "#3a3a30", lantai: ["#d8cfbd", "#cfc5b0"], nama: "LOBI" },
    2: { dinding: "#28232f", lis: "#3a3346", lantai: ["#8a6a48", "#7d5f40"], nama: "PRODUKSI" },
    3: { dinding: "#1f2a2a", lis: "#2c3c3b", lantai: ["#2f3a40", "#2a343a"], nama: "INTEL" },
    4: { dinding: "#2e2818", lis: "#463c22", lantai: ["#5a3e28", "#4f3622"], nama: "EKSEKUTIF" },
  };

  function lantaiBahan(c, no, y, W, H) {
    const tm = TEMA[no];
    for (let yy = y; yy < H; yy += 4) kotak(c, 0, yy, W, 4, (yy / 4) % 2 ? tm.lantai[0] : tm.lantai[1]);
    if (no === 1) for (let x = 0; x < W; x += 16) kotak(c, x, y, 1, H - y, "#c2b8a2");      // ubin marmer
    if (no === 2) for (let x = 0; x < W; x += 24) kotak(c, x + ((Math.floor(x / 24) % 2) * 6), y, 1, H - y, "#6d5236"); // papan kayu
    if (no === 4) { kotak(c, 60, y + 6, 200, H - y - 10, "#6b2a2a"); kotak(c, 62, y + 8, 196, 1, "#8a3a3a"); } // karpet merah
  }

  function jendelaKota(c, x, y, w, h, t, biji) {
    kotak(c, x - 2, y - 2, w + 4, h + 4, "#4a4436");
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    for (let i = 0; i < h; i += 3) kotak(c, x, y + i, w, 3, campur("#151320", "#2a2030", i / h));
    kota(c, x + w, y + h, t, biji, h * .6, "#1d1a22", "#6a5a30");
    c.restore();
    for (let i = 1; i < 3; i++) kotak(c, x + (w * i) / 3, y, 1, h, "#4a4436");
  }

  // meja dilihat dari depan: laptop di kiri meja (layarnya menghadap agent, punggung laptop ke kita),
  // agent duduk di tengah sehingga wajah & badannya tetap terlihat
  function meja(c, x, y, keadaan, t, warna) {
    // laptop (bagian belakang layar menghadap penonton) + cahaya layar ke wajah
    kotak(c, x + 1, y - 9, 11, 9, "#2a2a30"); kotak(c, x + 5, y - 6, 3, 3, "#4a4a55");
    if (keadaan === "kerja") { c.save(); c.globalAlpha = .22; kotak(c, x + 10, y - 16, 10, 14, P.teal); c.restore(); kotak(c, x + 1, y - 10, 11, 1, P.teal); }
    else if (keadaan === "menunggu") kotak(c, x + 1, y - 10, 11, 1, P.kuning);
    // daun meja
    kotak(c, x, y, 34, 4, "#7a5a3c"); kotak(c, x, y, 34, 1, "#94704c"); kotak(c, x, y + 4, 34, 1, "#4f3824");
    // panel depan meja (menutupi kaki agent)
    kotak(c, x + 2, y + 5, 30, 9, "#5e4430"); kotak(c, x + 4, y + 7, 26, 1, warna);
    // cangkir & tanaman kecil
    kotak(c, x + 28, y - 3, 3, 3, "#e8e2d5");
  }

  function tanaman(c, x, y) {
    kotak(c, x + 2, y + 10, 8, 8, "#8a5a3a"); kotak(c, x, y + 2, 12, 9, "#2f7a4a"); kotak(c, x + 3, y - 2, 6, 6, "#3e9a5e"); kotak(c, x + 2, y + 4, 2, 2, "#4cc38a");
  }

  function isiLantai(c, t, no, opsi) {
    const W = 320, H = 160, tm = TEMA[no], warna = WARNA_LANTAI[no];
    const lantaiY = 104;
    kotak(c, 0, 0, W, lantaiY, tm.dinding);
    kotak(c, 0, lantaiY - 10, W, 10, tm.lis);
    kotak(c, 0, lantaiY - 11, W, 1, campur(tm.lis, "#ffffff", .15));
    lantaiBahan(c, no, lantaiY, W, H);
    // garis lampu atap
    kotak(c, 0, 0, W, 6, "#16140f");
    for (let x = 20; x < W; x += 60) { kotak(c, x, 6, 24, 2, P.krem); c.save(); c.globalAlpha = .06; kotak(c, x - 10, 8, 44, 90, P.krem); c.restore(); }

    // jendela kota di dinding belakang
    jendelaKota(c, 12, 18, 70, 46, t, no * 13);
    jendelaKota(c, 238, 18, 70, 46, t, no * 29);

    // dekorasi khusus per lantai
    if (no === 1) {
      kotak(c, 110, 22, 100, 34, "#1c1a17"); kotak(c, 112, 24, 96, 30, "#22201b");
      // papan nama MARKAS CELL
      kotak(c, 120, 32, 4, 12, P.krem); kotak(c, 126, 32, 4, 12, P.krem); // ikon gedung mini
      for (let i = 0; i < 3; i++) kotak(c, 121 + (i % 2) * 6, 34 + i * 3, 2, 1, [P.kuning, P.teal, P.ungu][i]);
      kotak(c, 136, 34, 64, 3, P.krem); kotak(c, 136, 40, 40, 3, P.emas);
      kotak(c, 150, 76, 60, 18, P.emas); kotak(c, 150, 76, 60, 3, P.emas2); kotak(c, 152, 94, 56, 6, "#8a6210"); // meja resepsionis
      tanaman(c, 96, 78); tanaman(c, 220, 78);
      kotak(c, 286, 66, 26, 38, "#1c1a17"); kotak(c, 288, 68, 22, 36, "#3a5a6a"); kotak(c, 298, 68, 1, 36, "#1c1a17"); // pintu kaca
    }
    if (no === 2) {
      kotak(c, 100, 20, 60, 34, P.krem); kotak(c, 104, 25, 30, 2, P.ungu); kotak(c, 104, 30, 44, 2, "#888"); kotak(c, 104, 35, 22, 2, P.teal); kotak(c, 104, 40, 36, 2, "#888"); // whiteboard
      kotak(c, 172, 18, 24, 72, "#1a1a20");                                            // rak server
      for (let i = 0; i < 8; i++) { kotak(c, 175, 22 + i * 8, 18, 5, "#26262e"); kotak(c, 189, 23 + i * 8, 2, 2, Math.sin(t / 200 + i * 2) > 0 ? P.hijau : "#1d3a2a"); }
      kotak(c, 206, 26, 22, 14, "#e8e2d5"); kotak(c, 208, 28, 18, 10, P.ungu);        // poster
    }
    if (no === 3) {
      // layar besar grafik trading
      kotak(c, 98, 16, 128, 56, "#0b1416"); kotak(c, 100, 18, 124, 52, "#0f1d20");
      let py = 50;
      for (let x = 0; x < 120; x += 4) {
        const ny = 44 + Math.round(Math.sin((x + t / 60) / 14) * 10 + Math.sin((x + t / 90) / 5) * 4);
        const naik = ny <= py;
        kotak(c, 102 + x, Math.min(ny, py), 2, Math.abs(ny - py) + 3, naik ? P.hijau : P.merah);
        py = ny;
      }
      kotak(c, 102, 22, 30, 3, P.teal); kotak(c, 190, 22, 30, 3, P.kuning);
      // rak buku
      for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) kotak(c, 236 + j * 4, 70 + i * 9, 3, 8, [P.ungu, P.teal, P.emas, P.merah, P.krem2, P.hijau][(i + j) % 6]);
    }
    if (no === 4) {
      // layar komando Jarvis
      kotak(c, 110, 18, 100, 44, "#0c1820"); kotak(c, 112, 20, 96, 40, "#0e2230");
      for (let r = 0; r < 4; r++) kotak(c, 150 + Math.cos(t / 900 + r * 1.57) * (8 + r * 4), 38 + Math.sin(t / 900 + r * 1.57) * (5 + r * 2), 3, 3, ["#5ee7ff", P.kuning, P.ungu, P.hijau][r]);
      kotak(c, 157, 37, 6, 6, "#5ee7ff");
      kotak(c, 116, 24, 20, 2, "#5ee7ff"); kotak(c, 180, 52, 24, 2, P.kuning);
      // lukisan + rak piala
      kotak(c, 222, 66, 10, 12, P.emas); kotak(c, 224, 62, 6, 4, P.emas2);
      tanaman(c, 96, 78);
    }

    // ---- agent di meja ----
    const ada = (opsi.penghuni || []);
    const diMeja = ada.filter(p => p.keadaan !== "santai" || opsi.semuaDiMeja);
    const kosong = ada.filter(p => p.keadaan === "santai" && !opsi.semuaDiMeja);
    const perBaris = Math.min(6, Math.max(3, Math.ceil(ada.length / 2)));
    const jarak = 44, lebarBaris = (perBaris - 1) * jarak + 34;
    const xMulai = Math.round((W - lebarBaris) / 2);
    ada.forEach((p, i) => {
      const baris = Math.floor(i / perBaris), kol = i % perBaris;
      const x = xMulai + kol * jarak + (baris ? 22 : 0) - (baris && perBaris * jarak + 22 > W - 10 ? 22 : 0);
      const yMeja = baris ? 138 : 116;
      const diSini = diMeja.includes(p);
      if (diSini) {
        const bob = p.keadaan === "kerja" ? (Math.floor(t / 260 + i) % 2) : 0;
        kotak(c, x + 13, yMeja - 9, 14, 6, "#2e2a26");                 // sandaran kursi
        karakter(c, p.a, x + 13, yMeja - 17 + bob, "depan", 0);
        gelembung(c, x + 17, yMeja - 28 + bob, p.keadaan, t);
      } else {
        kotak(c, x + 13, yMeja - 10, 14, 10, "#3a3530"); kotak(c, x + 14, yMeja - 9, 12, 1, "#4a443a"); // kursi kosong
      }
      meja(c, x, yMeja, diSini ? p.keadaan : "mati", t, warna);
    });
    if (opsi.label !== false && kosong.length && ada.length) {
      // catatan kecil: berapa yang sedang santai di rooftop
      kotak(c, 4, H - 12, 6 + kosong.length * 4, 8, "rgba(0,0,0,.35)");
      kosong.forEach((_, k) => kotak(c, 7 + k * 4, H - 9, 2, 2, P.biru));
    }
  }

  // ---------- rooftop ----------
  const BOLA = { fase: 0 };
  function rooftop(c, t, opsi) {
    const W = 320, H = 160;
    langit(c, W, 110, t, "#13121c", "#3a2a1e");
    kota(c, W, 100, t, 41, 50, "#211d1f", "#6a5530", t / 200);
    // pagar
    kotak(c, 0, 96, W, 3, P.krem2); for (let x = 0; x < W; x += 10) kotak(c, x, 99, 2, 9, P.krem2);
    // lantai atap
    for (let y = 108; y < H; y += 4) kotak(c, 0, y, W, 4, y % 8 ? "#3a352c" : "#352f27");
    // kolam
    kotak(c, 14, 116, 120, 36, "#e6dfd1"); kotak(c, 18, 120, 112, 28, "#1f6f8a");
    for (let i = 0; i < 9; i++) kotak(c, 22 + ((i * 13 + t / 50) % 104), 124 + (i % 4) * 6, 6, 1, "#5fc8e0");
    // lapangan basket
    kotak(c, 150, 112, 90, 44, "#a8552e"); kotak(c, 152, 114, 86, 40, "#b8643a"); kotak(c, 194, 114, 1, 40, P.krem);
    kotak(c, 232, 84, 3, 30, "#ddd"); kotak(c, 224, 82, 14, 10, P.krem); kotak(c, 222, 92, 10, 2, P.merah);
    // garasi + mobil sport emas
    kotak(c, 252, 102, 64, 52, "#26231e");
    const mx = 258;
    kotak(c, mx + 4, 132, 46, 10, P.emas); kotak(c, mx + 14, 125, 24, 8, P.emas); kotak(c, mx + 17, 127, 18, 5, "#2a3a48");
    kotak(c, mx + 4, 136, 46, 2, P.emasGelap);
    [mx + 10, mx + 38].forEach(rx => { kotak(c, rx, 140, 8, 8, "#111"); kotak(c, rx + 3, 143, 2, 2, "#999"); });
    kotak(c, mx + 48, 134, 2, 2, Math.floor(t / 500) % 2 ? P.krem : P.emas2);

    // agent yang santai
    const s = (opsi.penghuni || []).filter(p => p.keadaan === "santai").slice(0, 12);
    s.forEach((p, i) => {
      if (i < 4) { // berenang
        const x = 26 + i * 26 + Math.sin(t / 900 + i) * 6;
        karakter(c, p.a, x, 120 + (i % 2) * 6, "renang", Math.floor(t / 300 + i) % 2);
      } else if (i < 7) { // main basket
        const x = 160 + (i - 4) * 22, lompat = Math.max(0, Math.sin(t / 300 + i)) * 4;
        karakter(c, p.a, x, 116 - lompat, "jalan", Math.floor(t / 200 + i) % 2, i % 2 === 0);
      } else { // nongkrong di dekat pagar, melambai
        karakter(c, p.a, 140 + (i - 7) * 18 - 70 * (i > 9), 88, "lambai", Math.floor(t / 400 + i) % 2);
      }
    });
    // bola basket memantul ke ring
    BOLA.fase = (t / 1400) % 1;
    const bx = 180 + BOLA.fase * 46, by = 120 - Math.sin(BOLA.fase * Math.PI) * 36;
    kotak(c, bx, by, 4, 4, "#e07a2a"); kotak(c, bx + 1, by, 1, 4, "#7a3a10");
  }

  function lantai(c, t, no, opsi = {}) {
    if (no === 5) rooftop(c, t, opsi); else isiLantai(c, t, no, opsi);
  }

  // =====================================================================
  //  PASANG: hubungkan adegan ke <canvas> + atur ukuran tajam & animasi hemat
  // =====================================================================
  const DIAM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const semua = new Set();

  function pasang(canvas, lebarLogis, tinggiLogis, gambar) {
    const kecil = document.createElement("canvas");
    kecil.width = lebarLogis; kecil.height = tinggiLogis;
    const ck = kecil.getContext("2d");
    const cb = canvas.getContext("2d");
    const item = { canvas, kecil, ck, cb, gambar, terlihat: true, lw: lebarLogis, lh: tinggiLogis };

    function ukur() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);  // 3x sudah setajam layar 4K
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    item.ukur = ukur;
    item.render = t => {
      ck.clearRect(0, 0, lebarLogis, tinggiLogis);
      gambar(ck, t);
      cb.imageSmoothingEnabled = false;
      cb.clearRect(0, 0, canvas.width, canvas.height);
      cb.drawImage(kecil, 0, 0, canvas.width, canvas.height);
    };
    ukur();
    if ("ResizeObserver" in window) new ResizeObserver(() => { ukur(); item.render(performance.now()); }).observe(canvas);
    if ("IntersectionObserver" in window)
      new IntersectionObserver(e => { item.terlihat = e[0].isIntersecting; }, { rootMargin: "120px" }).observe(canvas);
    semua.add(item);
    item.render(performance.now());
    return item;
  }

  // satu loop untuk semua kanvas; hanya kanvas yang terlihat yang digambar ulang (hemat baterai)
  let jalan = false;
  function loop(t) {
    if (!document.hidden) semua.forEach(i => { if (i.terlihat) i.render(t); });
    requestAnimationFrame(loop);
  }
  function mulai() { if (!jalan && !DIAM) { jalan = true; requestAnimationFrame(loop); } }
  mulai();

  window.SENI = { P, WARNA_LANTAI, hero, lantai, pasang, karakter, gambarUlang: () => semua.forEach(i => i.render(performance.now())) };
})();
