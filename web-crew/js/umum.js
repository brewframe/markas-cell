/* =====================================================================
   UMUM.JS · alat yang dipakai semua halaman
   Analogi: ini "kotak perkakas" + "resepsionis kecil" di setiap halaman.
   - Kotak perkakas: cari agent, avatar pixel, format angka, notifikasi.
   - Resepsionis: bertanya ke server "kamu menyala?". Kalau ya, data diambil
     dari database (mode LIVE). Kalau tidak, web memakai data contoh (mode DEMO).
   ===================================================================== */
(function () {
  "use strict";
  document.documentElement.classList.add("js"); // tanpa JavaScript, semua isi tetap terlihat
  const D = window.MARKAS;

  const U = {
    agent: D.tim.agent, peta: {}, divisi: {}, lantai: D.gedung.lantai,
    live: false, mode: "DEMO", status: {}, // status: id -> {keadaan, pesan, aktif}
    $: (s, el = document) => el.querySelector(s),
    $$: (s, el = document) => [...el.querySelectorAll(s)],
    esc: s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])),
    angka: n => Math.round(n || 0).toLocaleString("id-ID"),
    ringkas: n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " jt" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(".", ",") + " rb" : String(Math.round(n || 0)),
    jam: w => (w || "").slice(11, 16),
  };

  function pakaiTim(tim) {
    U.agent = tim.agent;
    U.peta = Object.fromEntries(tim.agent.map(a => [a.id, a]));
    U.divisi = Object.fromEntries(tim.divisi.map(d => [d.id, d]));
  }
  pakaiTim(D.tim);

  U.warna = idDivisi => (U.divisi[idDivisi] || {}).warna || "#9aa1ad";
  U.ava = (id, skala = 4) => U.peta[id] && window.PIXEL ? window.PIXEL.url(U.peta[id], skala) : "";
  U.namaDivisi = id => (U.divisi[id] || {}).nama || id;

  // agent ada di lantai berapa? (aturan sama dengan gedung 3D: penempatan khusus, lalu ruang divisi)
  U.lantaiAgent = function (a) {
    if (a.lantai) return a.lantai; // dari database (mode live)
    const rid = D.gedung.penempatan[a.id];
    const r = D.gedung.ruang.find(r => r.id === rid) || D.gedung.ruang.find(r => (r.divisi || []).includes(a.divisi));
    return r ? r.lantai : 1;
  };

  // ---------- jembatan ke server ----------
  U.api = async function (jalur, opsi = {}) {
    const r = await fetch(jalur, Object.assign({ cache: "no-store", credentials: "same-origin" }, opsi, {
      headers: Object.assign({ "Content-Type": "application/json" }, opsi.headers || {}),
    }));
    let isi = null;
    try { isi = await r.json(); } catch (e) { /* bukan JSON */ }
    if (!r.ok) {
      const d = isi && isi.detail;
      const pesan = typeof d === "string" ? d : Array.isArray(d) ? d.map(x => x.msg).join(", ") : "Server menjawab " + r.status;
      const err = new Error(pesan); err.kode = r.status; throw err;
    }
    return isi;
  };

  // ---------- status agent: live dari database, atau simulasi di mode demo ----------
  const pendengar = new Set();
  U.ikutiStatus = fn => { pendengar.add(fn); fn(U.status); };
  const kabari = () => pendengar.forEach(fn => fn(U.status));

  function simulasiAwal() {
    let s = 7;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    U.agent.forEach(a => {
      const k = a.owner ? "kerja" : r() < .5 ? "kerja" : r() < .25 ? "menunggu" : "santai";
      U.status[a.id] = { keadaan: k, pesan: "", aktif: ["Jarvis", "Bayu", "Vera"].includes(a.id) };
    });
  }
  function simulasiLangkah() {
    const calon = U.agent.filter(a => !a.owner);
    for (let i = 0; i < 2; i++) {
      const a = calon[Math.floor(Math.random() * calon.length)];
      U.status[a.id].keadaan = ["kerja", "kerja", "menunggu", "santai", "santai"][Math.floor(Math.random() * 5)];
    }
    kabari();
  }
  U.snapshot = null;
  async function ambilSnapshot() {
    try {
      const s = await U.api("/api/snapshot");
      U.snapshot = s; U.mode = s.mode;
      s.agent.forEach(a => { U.status[a.id] = { keadaan: a.basi ? "santai" : a.keadaan, pesan: a.pesan, aktif: a.aktif, basi: a.basi }; });
      kabari();
      document.dispatchEvent(new CustomEvent("markas:snapshot", { detail: s }));
    } catch (e) { /* server berhenti sebentar: coba lagi di putaran berikutnya */ }
  }

  // ---------- cek server sekali saat halaman dibuka ----------
  U.siap = (async function () {
    simulasiAwal();
    if (location.protocol !== "file:") {
      try {
        const h = await U.api("/api/health");
        U.live = true; U.mode = h.mode;
        try { pakaiTim(await U.api("/api/tim")); } catch (e) { /* pakai data.js */ }
        try {
          const ag = await U.api("/api/agent");
          ag.forEach(a => { if (U.peta[a.id]) U.peta[a.id].lantai = a.lantai; });
        } catch (e) { /* abaikan */ }
      } catch (e) { U.live = false; }
    }
    if (U.live) { await ambilSnapshot(); setInterval(ambilSnapshot, 4000); }
    else setInterval(simulasiLangkah, 3500);
    return { live: U.live, mode: U.mode };
  })();

  // ---------- notifikasi kecil (pengganti alert) ----------
  U.kabar = function (teks, jenis = "info") {
    let wadah = U.$(".toast-wadah");
    if (!wadah) { wadah = document.createElement("div"); wadah.className = "toast-wadah"; wadah.setAttribute("aria-live", "polite"); document.body.append(wadah); }
    const el = document.createElement("div");
    el.className = "toast toast-" + jenis; el.textContent = teks;
    wadah.append(el);
    setTimeout(() => { el.classList.add("pergi"); setTimeout(() => el.remove(), 400); }, 3800);
  };

  // ---------- efek scroll: muncul pelan, progres, nav ----------
  function siapkanScroll() {
    const bar = document.createElement("div");
    bar.className = "progres-scroll"; document.body.prepend(bar);
    const nav = U.$(".nav");
    let antri = false;
    const perbarui = () => {
      antri = false;
      const maks = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${maks > 0 ? Math.min(1, scrollY / maks) : 0})`;
      if (nav) nav.classList.toggle("tergulir", scrollY > 8);
      document.dispatchEvent(new CustomEvent("markas:gulir"));
    };
    addEventListener("scroll", () => { if (!antri) { antri = true; requestAnimationFrame(perbarui); } }, { passive: true });
    perbarui();

    // elemen [data-muncul] naik pelan saat masuk layar; [data-jeda] memberi urutan
    const io = "IntersectionObserver" in window ? new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("tampak"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px", threshold: .08 }) : null;
    U.amati = el => { if (io) io.observe(el); else el.classList.add("tampak"); };
    U.$$("[data-muncul]").forEach(U.amati);
  }

  // angka berhitung naik saat terlihat
  U.hitung = function (el, ke) {
    const dari = Number(el.dataset.nilai || 0);
    el.dataset.nilai = ke;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || dari === ke) { el.textContent = U.angka(ke); return; }
    const mulai = performance.now(), lama = 900;
    const langkah = t => {
      const p = Math.min(1, (t - mulai) / lama), e = 1 - Math.pow(1 - p, 3);
      el.textContent = U.angka(dari + (ke - dari) * e);
      if (p < 1) requestAnimationFrame(langkah);
    };
    requestAnimationFrame(langkah);
  };

  function siapkanNav() {
    const t = U.$(".tombol-menu"), m = U.$(".nav-menu");
    if (t && m) {
      t.addEventListener("click", () => { const b = m.classList.toggle("buka"); t.setAttribute("aria-expanded", b); });
      m.addEventListener("click", e => { if (e.target.closest("a")) { m.classList.remove("buka"); t.setAttribute("aria-expanded", false); } });
    }
  }

  async function lencanaMode() {
    const el = U.$(".lencana-live");
    const { live, mode } = await U.siap;
    // tautan yang hanya berfungsi lewat server (misal tampilan lama) disembunyikan di mode file
    if (!live) U.$$("[data-perlu-server]").forEach(x => { x.hidden = true; });
    if (!el) return;
    const teks = !live ? "Mode demo" : mode === "LIVE" ? "Live · worker jalan" : mode === "DEMO" ? "Server demo" : "Live · worker mati";
    const kelas = !live || mode === "DEMO" ? "demo" : mode === "LIVE" ? "" : "mati";
    el.innerHTML = `<i class="titik ${kelas}"></i><span class="teks">${teks}</span>`;
    el.title = !live ? "Server belum menyala. Data contoh dipakai. Jalankan MULAI.bat untuk data asli."
      : mode === "STALE" ? "Server menyala, tapi worker belum jalan (MULAI_WORKER.bat). Tugas tidak akan dikerjakan."
      : "Terhubung ke database Markas Cell";
  }

  document.addEventListener("DOMContentLoaded", () => { siapkanScroll(); siapkanNav(); lencanaMode(); });
  window.U = U;
})();
