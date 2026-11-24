/* =====================================================================
   BERANDA.JS · isi halaman beranda
   1) angka hero   2) gedung Menara (kanvas)   3) pita berjalan
   4) animasi alur crew   5) lift gedung yang menempel saat scroll
   6) statistik live   7) gambar kecil di kartu fitur & CTA
   ===================================================================== */
(function () {
  "use strict";
  const { $, $$, esc } = U;

  const CERITA = {
    1: "Pintu masuk dan jalur uang. Mica menyambut pesan WA & Gmail, tim Bisnis mencari klien, tim Properti mengedit foto listing.",
    2: "Pabrik kerja. Bayu membangun web, Oka membuat chatbot, Jess mendesain, lalu Vera dan tim QA memeriksa sebelum hasil naik ke kamu.",
    3: "Ruang riset dan trading. Nova merangkum berita AI, Rico berburu lomba, tim Rafa menganalisa chart untuk latihan trading.",
    4: "Ruang komando. Kamu memberi perintah di sini, Jarvis memecahnya menjadi tugas, Tara dan Eka mengurus jadwal dan belajarmu.",
    5: "Tempat istirahat. Agent yang sedang tidak punya tugas naik ke sini: berenang, main basket, atau nongkrong di garasi.",
  };

  // daftar penghuni + status sekarang untuk lantai tertentu
  function penghuni(no) {
    const daftar = no === 5 ? U.agent.filter(a => !a.owner) : U.agent.filter(a => U.lantaiAgent(a) === no);
    return daftar.map(a => ({ a, keadaan: (U.status[a.id] || {}).keadaan || "santai" }));
  }

  // ---------- 2) hero ----------
  const panggung = $("#panggung");
  SENI.pasang($("#kanvas-hero"), 256, 240, (c, t) => SENI.hero(c, t, { agent: U.agent.filter(a => !a.owner), geser: scrollY }));
  document.addEventListener("markas:gulir", () => {
    if (scrollY < innerHeight * 1.2 && !matchMedia("(prefers-reduced-motion: reduce)").matches)
      panggung.style.translate = `0 ${Math.round(scrollY * .08)}px`;
  });
  $$("img[data-ava]").forEach(img => { img.src = U.ava(img.dataset.ava, 3); });

  // ---------- 3) pita berjalan ----------
  const isiPita = ["<b>29 agent</b> dalam satu gedung", "Perintah → <b>Jarvis</b> → <b>Bayu</b> → <b>Vera</b> → OK", "Dibangun dengan <b>Claude</b>, <b>FastAPI</b>, <b>SQLite</b>",
    "Setiap langkah tercatat di <b>database</b>", "Biaya token terpantau <b>per agent</b>", "Gambar 100% <b>buatan kode</b>, tajam sampai 4K"];
  $("#pita").innerHTML = [...isiPita, ...isiPita].map(s => `<span>${s}</span>`).join("");

  // ---------- 4) alur crew ----------
  const LANGKAH = [
    { id: "Cell", judul: "Cell", peran: "Owner", warna: "#f2c14e", aksi: "Memberi perintah", log: 'Cell: <b>"Buat landing page Laundry Bersih Jaya"</b>' },
    { id: "Jarvis", judul: "Jarvis", peran: "Chief of Staff", warna: "#5ee7ff", aksi: "Memecah perintah jadi tugas", log: "Jarvis: tugas #42 dibuat, diserahkan ke <b>Bayu</b>" },
    { id: "Bayu", judul: "Bayu", peran: "Web Builder", warna: "#2ec4b6", aksi: "Mengerjakan & menyimpan hasil", log: "Bayu: index.html + style.css selesai, dikirim ke QA" },
    { id: "Vera", judul: "Vera", peran: "Manajer QA", warna: "#ab7df8", aksi: "Memeriksa kriteria lulus", log: "Vera: 7/7 cek lulus ✓ tampilan HP, tautan, kecepatan" },
    { id: "Cell", judul: "Cell OK", peran: "Owner", warna: "#4cc38a", aksi: "Menyetujui, hasil dikirim", log: "Cell: <b>OK</b> ✓ tugas #42 selesai" },
  ];
  const wadahAlur = $("#alur-crew"), paket = $("#paket"), logAlur = $("#log-alur");
  LANGKAH.forEach((l, i) => wadahAlur.insertAdjacentHTML("beforeend", `
    <div class="simpul" style="--warna:${l.warna}">
      <div class="ava"><img class="pixel" src="${U.ava(l.id, 3)}" alt=""></div>
      <div><h4>${esc(l.judul)}</h4><div class="peran">${esc(l.peran)}</div><div class="langkah">${i + 1}. ${esc(l.aksi)}</div></div>
    </div>`));
  const simpul = $$(".simpul", wadahAlur);
  let iAlur = 0, alurTerlihat = false;
  function langkahAlur() {
    simpul.forEach((s, k) => s.classList.toggle("aktif", k === iAlur));
    paket.style.left = `calc(10% + ${iAlur} * 20%)`;
    paket.style.background = LANGKAH[iAlur].warna;
    const jam = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    logAlur.insertAdjacentHTML("beforeend", `<div><time>${jam}</time>${LANGKAH[iAlur].log}</div>`);
    while (logAlur.children.length > 5) logAlur.firstElementChild.remove();
    iAlur = (iAlur + 1) % LANGKAH.length;
  }
  new IntersectionObserver(e => { alurTerlihat = e[0].isIntersecting; }).observe(wadahAlur);
  langkahAlur();
  setInterval(() => { if (alurTerlihat && !document.hidden) langkahAlur(); }, 2400);

  // ---------- 5) lift gedung ----------
  const wadahLangkah = $("#cerita-langkah");
  const urutan = [...U.lantai].sort((a, b) => a.no - b.no); // scroll ke bawah = naik lantai
  urutan.forEach((l, i) => {
    const wajah = l.no === 5 ? "" : penghuni(l.no).map(p => `<img class="pixel" src="${U.ava(p.a.id, 2)}" alt="${esc(p.a.id)}" title="${esc(p.a.id)} · ${esc(p.a.jabatan)}">`).join("");
    wadahLangkah.insertAdjacentHTML("beforeend", `
      <article class="langkah-lantai" data-no="${l.no}" style="--w:${l.warna}">
        <canvas class="seni" data-lantai-hp="${l.no}" aria-hidden="true"></canvas>
        <div class="no">${l.no === 5 ? "ROOFTOP" : "LANTAI " + l.no}</div>
        <h3>${esc(l.nama)}</h3>
        <p>${esc(CERITA[l.no] || l.julukan)}</p>
        ${wajah ? `<div class="wajah">${wajah}</div>` : ""}
      </article>`);
  });

  let lantaiAktif = 1;
  const layar = $("#layar-lift");
  SENI.pasang($("#kanvas-lift"), 320, 160, (c, t) => SENI.lantai(c, t, lantaiAktif, { penghuni: penghuni(lantaiAktif) }));
  const tombolLantai = $("#tombol-lantai");
  tombolLantai.innerHTML = urutan.map(l => `<button type="button" data-no="${l.no}" aria-label="Lantai ${l.no}">${l.no === 5 ? "R" : l.no}</button>`).join("");
  tombolLantai.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    const tujuan = $(`.langkah-lantai[data-no="${b.dataset.no}"]`);
    if (tujuan) tujuan.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  function ketLantai(no) {
    const p = penghuni(no);
    if (no === 5) return `${p.filter(x => x.keadaan === "santai").length} agent sedang santai`;
    const k = p.filter(x => x.keadaan === "kerja").length, m = p.filter(x => x.keadaan === "menunggu").length;
    return `${p.length} penghuni · ${k} kerja${m ? ` · ${m} menunggu` : ""}`;
  }
  let gantiTimer = null;
  function pilihLantai(no) {
    $$(".langkah-lantai").forEach(el => el.classList.toggle("aktif", Number(el.dataset.no) === no));
    $$("button", tombolLantai).forEach(b => b.setAttribute("aria-current", Number(b.dataset.no) === no));
    if (no === lantaiAktif) return;
    const l = U.lantai.find(x => x.no === no);
    layar.classList.add("tutup"); // pintu lift menutup, ganti lantai, lalu membuka
    clearTimeout(gantiTimer);
    gantiTimer = setTimeout(() => {
      lantaiAktif = no;
      $("#angka-lift").textContent = no === 5 ? "R" : no;
      $("#nama-lift").textContent = l.nama;
      $("#ket-lift").textContent = ketLantai(no);
      SENI.gambarUlang();
      layar.classList.remove("tutup");
    }, 380);
  }
  // langkah yang berada di tengah layar = lantai aktif
  const ioLangkah = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) pilihLantai(Number(e.target.dataset.no)); }),
    { rootMargin: "-45% 0px -45% 0px" });
  $$(".langkah-lantai").forEach(el => ioLangkah.observe(el));
  $("#nama-lift").textContent = urutan[0].nama;
  $("#ket-lift").textContent = ketLantai(1);
  pilihLantai(1);

  // versi HP: setiap lantai punya gambarnya sendiri
  $$("canvas[data-lantai-hp]").forEach(cv => {
    const no = Number(cv.dataset.lantaiHp);
    // selalu dipasang; kanvas yang tersembunyi (layar lebar) tidak digambar karena tidak terlihat
    SENI.pasang(cv, 320, 160, (c, t) => SENI.lantai(c, t, no, { penghuni: penghuni(no) }));
  });

  // ---------- 7) gambar kecil di kartu fitur & CTA ----------
  $$("canvas[data-lantai]").forEach(cv => {
    const no = Number(cv.dataset.lantai);
    SENI.pasang(cv, 320, 160, (c, t) => SENI.lantai(c, t, no, { penghuni: penghuni(no), semuaDiMeja: no !== 5 }));
  });

  // ---------- 1 & 6) angka ----------
  let tokenDemo = 184200;
  function perbaruiStatistik() {
    const s = U.snapshot;
    const hit = { kerja: 0, menunggu: 0, santai: 0 };
    U.agent.forEach(a => { if (!a.owner) { const k = (U.status[a.id] || {}).keadaan; if (k in hit) hit[k]++; } });
    U.hitung($("#st-kerja"), hit.kerja);
    U.hitung($("#st-menunggu"), hit.menunggu);
    U.hitung($("#st-santai"), hit.santai);
    if (s) {
      U.hitung($("#st-ok"), s.statistik.perlu_ok);
      U.hitung($("#st-token"), s.token.total);
      const usd = s.token.per_agent.reduce((n, a) => n + (a.biaya_usd || 0), 0);
      $("#st-biaya").textContent = "biaya $" + usd.toFixed(2).replace(".", ",");
    } else {
      tokenDemo += Math.round(Math.random() * 4000);
      U.hitung($("#st-ok"), 2);
      U.hitung($("#st-token"), tokenDemo);
      $("#st-biaya").textContent = "contoh, bukan data asli";
    }
    if (lantaiAktif) $("#ket-lift").textContent = ketLantai(lantaiAktif);
  }

  U.siap.then(({ live, mode }) => {
    const ai = U.agent.filter(a => !a.owner);
    U.hitung($("#a-agent"), ai.length);
    $("#h-agent").textContent = ai.length;
    U.hitung($("#a-divisi"), new Set(ai.map(a => a.divisi)).size);
    U.hitung($("#a-manajer"), ai.filter(a => a.manajer).length);
    U.hitung($("#a-lantai"), U.lantai.length);
    $("#ket-statistik").textContent = live
      ? (mode === "LIVE" ? "Langsung dari database, diperbarui setiap 4 detik." : mode === "DEMO" ? "Server berjalan dalam mode demo: angka ini contoh." : "Server menyala, tapi worker belum jalan. Jalankan MULAI_WORKER.bat supaya tugas dikerjakan.")
      : "Mode demo: server belum menyala, angka di bawah adalah contoh. Jalankan MULAI.bat untuk data asli.";
    U.ikutiStatus(perbaruiStatistik);
  });
})();
