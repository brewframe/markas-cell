/* =====================================================================
   API.JS · jembatan antara halaman web dan backend
   Analogi: ini "kurir" gedung. Halaman cukup bilang "ambilkan data gedung",
   kurir yang pergi ke resepsionis (FastAPI) lalu membawa jawabannya.
   Kalau backend tidak ada (misalnya dibuka sebagai pratinjau), kurir memakai
   data contoh dari window.DATA_PRATINJAU dan diberi label "pratinjau".
   ===================================================================== */
(function () {
  "use strict";
  const M = {
    pratinjau: false, tim: null, gedung: null, agent: {}, urutan: [], snapshot: null,
    divisi: {}, lantaiAgent: {},
  };

  // ---------- util kecil ----------
  M.esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  M.$ = (sel, el = document) => el.querySelector(sel);
  M.$$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  M.angka = n => (n || 0).toLocaleString("id-ID");
  M.ringkas = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(".", ",") + " jt" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(".", ",") + " rb" : String(n || 0);
  M.jam = w => (w || "").slice(11, 16);
  M.warna = id => (M.divisi[id] || {}).warna || "#9aa1ad";

  async function ambil(url, opsi) {
    const r = await fetch(url, Object.assign({ cache: "no-store" }, opsi));
    if (!r.ok) {
      let pesan = r.status + "";
      try { const j = await r.json(); pesan = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch (e) { /* biarkan */ }
      throw new Error(pesan);
    }
    return r.json();
  }

  // ---------- versi pratinjau: meniru database.py di browser ----------
  function bangunPratinjau() {
    const D = window.DATA_PRATINJAU, g = D.gedung, profil = D.profil;
    const ruangUntuk = a => {
      const rid = (g.penempatan || {})[a.id];
      return g.ruang.find(r => r.id === rid || (!rid && (r.divisi || []).includes(a.divisi))) || g.ruang[0];
    };
    const agent = D.tim.agent.map(a => {
      const r = ruangUntuk(a), p = profil[a.id] || {};
      return {
        id: a.id, jabatan: a.jabatan, divisi: a.divisi, manajer: !!a.manajer, owner: !!a.owner, lapor_ke: a.lapor_ke,
        model: a.model, jenis: p.jenis || a.sumber, fase: a.fase, tugas_pokok: a.tugas, input: a.input, output: a.output,
        alat: a.tools, alias: a.alias || [], kondisi: a.keadaan_sekarang, status_label: p.status || "-", prioritas: p.prioritas || "-",
        lantai: r.lantai, ruang: r.id, look: a.look || {}, keadaan: "santai", pesan: "", diperbarui: "",
        aktif: ["Jarvis", "Bayu", "Vera"].includes(a.id), basi: false,
      };
    });
    const lantai = g.lantai.map(l => Object.assign({}, l, {
      ruang: g.ruang.filter(r => r.lantai === l.no).map(r => Object.assign({}, r, { bahan: r.lantaiBahan, santai: !!r.santai })),
      agent: agent.filter(a => a.lantai === l.no).map(a => a.id),
    }));
    return { agent, gedung: { lantai, penempatan: g.penempatan } };
  }

  const SIM = { tugas: [], log: [], token: {}, metrik: [], idT: 0, idL: 0 };
  const CONTOH = {
    riset: ["Rangkum berita AI hari ini", "Cari 3 lomba web untuk SMK"], studio: ["Buat landing page laundry", "Uji chatbot 20 pertanyaan", "Render video portofolio"],
    qa: ["Cek .env tidak ikut tersalin", "Uji tampilan di HP 390px"], properti: ["Before/after foto rumah tipe 36", "Tulis caption listing"],
    bisnis: ["Nilai 2 calon klien kafe", "Riset harga jasa web lokal"], finance: ["Analisa BBCA (edukasi)", "Hitung risiko posisi simulasi"],
    pribadi: ["Susun jadwal belajar minggu ini", "Latihan English 15 menit"], owner: ["Rangkum laporan semua bidang"], lobi: ["Cek pesan WA masuk"],
  };
  const waktu = () => { const d = new Date(), p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; };
  function simCatat(agent, teks, level = "info") { SIM.log.push({ id: ++SIM.idL, waktu: waktu(), agent, level, teks }); if (SIM.log.length > 200) SIM.log.shift(); }
  function simLangkah(awal) {
    const kandidat = M.urutan.filter(id => !M.agent[id].owner);
    const n = awal ? 16 : 1;
    for (let i = 0; i < n; i++) {
      const a = M.agent[kandidat[Math.floor(Math.random() * kandidat.length)]];
      const pilih = Math.random() < .5 ? "kerja" : Math.random() < .2 ? "menunggu" : "santai";
      const daftar = CONTOH[a.divisi] || ["Tugas rutin"], judul = daftar[Math.floor(Math.random() * daftar.length)];
      if (a.keadaan !== pilih) simCatat(a.id, pilih.toUpperCase() + (pilih === "kerja" ? ": " + judul : pilih === "menunggu" ? ": Hasil siap, tunggu OK Cell" : ""), { kerja: "info", menunggu: "warn", santai: "ok" }[pilih]);
      a.keadaan = pilih; a.pesan = pilih === "kerja" ? judul : pilih === "menunggu" ? "Hasil siap, tunggu OK Cell" : "";
      if (pilih === "kerja") {
        const t = SIM.token[a.id] || (SIM.token[a.id] = { agent: a.id, model: [a.model], masuk: 0, keluar: 0, panggilan: 0 });
        t.masuk += 800 + Math.floor(Math.random() * 8000); t.keluar += 200 + Math.floor(Math.random() * 2000); t.panggilan++;
      }
    }
    if (awal) SIM.tugas = [
      { id: 3, agent: "Bayu", judul: "[CONTOH] Landing page laundry", status: "REVIEW", qa_status: "lulus", percobaan: 1, revisi: 0, prioritas: "normal", adapter: "contoh", kriteria: [] },
      { id: 2, agent: "Bayu", judul: "[CONTOH] Halaman harga", status: "RUNNING", qa_status: "belum", percobaan: 1, revisi: 0, prioritas: "normal", adapter: "contoh", kriteria: [] },
      { id: 1, agent: "Bayu", judul: "[CONTOH] Profil usaha", status: "APPROVED", qa_status: "lulus", percobaan: 1, revisi: 1, prioritas: "normal", adapter: "contoh", kriteria: [] },
    ];
    SIM.metrik.push({ waktu: waktu(), cpu: 18 + Math.random() * 30, ram: 52 + Math.random() * 8 }); if (SIM.metrik.length > 60) SIM.metrik.shift();
  }
  function simSnapshot(setelah) {
    const per = Object.values(SIM.token).sort((a, b) => (b.masuk + b.keluar) - (a.masuk + a.keluar));
    const hit = { kerja: 0, menunggu: 0, santai: 0 }, tg = { PENDING: 0, ASSIGNED: 0, RUNNING: 0, REVIEW: 0, REVISION: 0, APPROVED: 0, FAILED: 0 };
    M.urutan.forEach(id => { if (!M.agent[id].owner) hit[M.agent[id].keadaan]++; });
    SIM.tugas.forEach(t => tg[t.status]++);
    return {
      agent: M.urutan.map(id => ({ id, keadaan: M.agent[id].keadaan, pesan: M.agent[id].pesan, aktif: M.agent[id].aktif, basi: false })),
      tugas: SIM.tugas, perintah: [], mode: "PRATINJAU", worker: { hidup: false }, log: SIM.log.filter(l => l.id > setelah).slice(-60),
      token: { tanggal: waktu().slice(0, 10), total: per.reduce((s, t) => s + t.masuk + t.keluar, 0), per_agent: per },
      metrik: SIM.metrik, statistik: { agent: hit, tugas: tg, perlu_ok: SIM.tugas.filter(t => t.status === "REVIEW" && t.qa_status === "lulus").length, aktif: 3, jumlah_agent: 29, manajer: 8, divisi: 9, lantai: 5 }, demo: true, psutil: true,
    };
  }

  // ---------- muat semua data awal ----------
  M.muat = async function () {
    let agent;
    try {
      if (window.DATA_PRATINJAU && location.protocol !== "http:") throw new Error("pratinjau");
      const [tim, gedung, daftar] = await Promise.all([ambil("/api/tim"), ambil("/api/gedung"), ambil("/api/agent")]);
      M.tim = tim; M.gedung = gedung; agent = daftar;
    } catch (e) {
      if (!window.DATA_PRATINJAU) throw new Error("Backend tidak menjawab. Jalankan MULAI.bat dulu.");
      M.pratinjau = true; M.tim = window.DATA_PRATINJAU.tim;
      const b = bangunPratinjau(); M.gedung = b.gedung; agent = b.agent;
    }
    M.tim.divisi.forEach(d => { M.divisi[d.id] = d; });
    agent.forEach(a => { M.agent[a.id] = a; });
    M.urutan = agent.map(a => a.id);
    M.gedung.lantai.forEach(l => { M.lantaiAgent[l.no] = l.agent; });
    if (M.pratinjau) { simCatat("sistem", "Pratinjau: data contoh (backend tidak dijalankan)", "warn"); simLangkah(true); }
    return M;
  };

  // ---------- data live tiap 2 detik ----------
  let logTerakhir = 0;
  M.segarkan = async function () {
    let s;
    if (M.pratinjau) { simLangkah(false); s = simSnapshot(logTerakhir); }
    else s = await ambil("/api/snapshot?setelah=" + logTerakhir);
    s.agent.forEach(x => { const a = M.agent[x.id]; if (a) { a.keadaan = x.keadaan; a.pesan = x.pesan; a.diperbarui = x.diperbarui; a.basi = x.basi; a.aktif = x.aktif; } });
    if (s.log.length) logTerakhir = s.log[s.log.length - 1].id;
    M.snapshot = s;
    return s;
  };
  // polling hemat: request berikutnya baru dikirim setelah yang sebelumnya selesai,
  // dan berhenti total saat tab tidak dilihat (dilanjutkan begitu tab dibuka lagi)
  M.mulaiLive = function (cb, ms = 2000) {
    let timer = null;
    const jalan = async () => {
      timer = null;
      if (document.hidden) return;
      try { cb(await M.segarkan(), null); } catch (e) { M.snapshot = null; cb(null, e); }
      timer = setTimeout(jalan, M.pratinjau ? ms * 1.6 : ms);
    };
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !timer) jalan(); });
    jalan();
  };

  // ---------- aksi (perlu masuk sebagai owner) ----------
  const kirim = (url, isi, metode = "POST") => ambil(url, { method: metode, headers: { "Content-Type": "application/json" }, body: JSON.stringify(isi || {}) });
  const PRATINJAU_TOLAK = () => { throw new Error("Pratinjau: aksi ini hanya jalan di laptop dengan backend menyala"); };
  M.saya = async () => M.pratinjau ? { peran: "viewer" } : ambil("/api/saya");
  M.masuk = kunci => M.pratinjau ? PRATINJAU_TOLAK() : kirim("/api/masuk", { kunci });
  M.keluar = () => kirim("/api/keluar");
  M.kirimPerintah = (teks, prioritas = "normal") => M.pratinjau ? PRATINJAU_TOLAK() : kirim("/api/perintah", { teks, prioritas });
  M.kirimTugas = (agent, judul, prioritas = "normal", tujuan = "", kriteria = []) =>
    M.pratinjau ? PRATINJAU_TOLAK() : kirim("/api/tugas", { agent, judul, prioritas, tujuan, kriteria });
  M.setujui = (id, alasan = "") => kirim(`/api/tugas/${id}/setujui`, { alasan });
  M.mintaRevisi = (id, alasan) => kirim(`/api/tugas/${id}/revisi`, { alasan });
  M.ulangTugas = id => kirim(`/api/tugas/${id}/ulang`);
  M.laporan = () => M.pratinjau ? PRATINJAU_TOLAK() : ambil("/api/laporan");
  M.kirimLaporan = () => M.pratinjau ? PRATINJAU_TOLAK() : kirim("/api/laporan/wa");
  M.detailTugas = async id => {
    if (!M.pratinjau) return ambil("/api/tugas/" + id);
    // Pratinjau: detail contoh yang konsisten dengan statusnya (bukan hasil agent sungguhan)
    const t = SIM.tugas.find(x => x.id === id), w = waktu().slice(0, 11);
    const urut = { RUNNING: ["PENDING", "ASSIGNED", "RUNNING"], REVIEW: ["PENDING", "ASSIGNED", "RUNNING", "REVIEW"],
      APPROVED: ["PENDING", "ASSIGNED", "RUNNING", "REVIEW", "REVISION", "RUNNING", "REVIEW", "APPROVED"] }[t.status] || [t.status];
    const pelaku = { PENDING: ["Jarvis", "orkestrator"], ASSIGNED: ["dispatcher", "dispatcher"], RUNNING: ["Bayu", "worker"], REVIEW: ["Bayu", "worker"],
      REVISION: ["Cell", "owner"], APPROVED: ["Cell", "owner"] };
    const riwayat = urut.map((ke, i) => ({ dari: urut[i - 1] || null, ke, pelaku: pelaku[ke][0], peran: pelaku[ke][1], ditolak: 0, waktu: w + `10:${String(i * 2).padStart(2, "0")}:00`, alasan: ke === "REVISION" ? "[CONTOH] tambah bagian testimoni" : "" }));
    const selesai = t.status !== "RUNNING";
    const artefak = selesai ? ["index.html", "style.css"].map((path, i) => ({ id: i + 1, path, versi: t.revisi, ukuran: 4200 + i * 300, sha256: "contoh0000" })) : [];
    const qa = selesai ? [{ versi: t.revisi, lulus: true, penilai: "Vera", waktu: w + "10:20:00", catatan: "[CONTOH] semua kriteria terpenuhi",
      cek: [{ cek: "Ada file hasil", lulus: true, detail: "2 file" }, { cek: "Tanpa data rahasia", lulus: true, detail: "bersih" }, { cek: "Ada tombol WhatsApp", lulus: true, detail: "" }] }] : [];
    return Object.assign({ riwayat, artefak, handoff: selesai ? [{ dari: "Bayu", ke: "Vera", konteks: { ringkasan: "", file: [], kriteria: [] }, waktu: w + "10:06:00" }] : [],
      qa, persetujuan: [], token: { masuk: 0, keluar: 0 }, tujuan: "[CONTOH] Data pratinjau. Jalankan Markas di laptop untuk melihat hasil agent sungguhan.",
      ringkasan: selesai ? "[CONTOH] Bayu membuat index.html dan style.css." : "", folder: "hasil/tugas-contoh", kriteria: ["Ada tombol WhatsApp", "Responsif di HP"] }, t,
      { kriteria: t.kriteria && t.kriteria.length ? t.kriteria : ["Ada tombol WhatsApp", "Responsif di HP"] });
  };
  M.profil = async function (id) {
    if (!M.pratinjau) return ambil("/api/agent/" + encodeURIComponent(id));
    const a = Object.assign({}, M.agent[id]), kon = M.tim.koneksi || [];
    a.menerima_dari = kon.filter(k => k[1] === id).map(k => ({ agent: k[0], label: k[2] || "" }));
    a.mengirim_ke = kon.filter(k => k[0] === id).map(k => ({ agent: k[1], label: k[2] || "" }));
    a.anak_buah = M.urutan.filter(x => M.agent[x].lapor_ke === id);
    a.tugas = SIM.tugas.filter(t => t.agent === id).slice(0, 10);
    a.log = SIM.log.filter(l => l.agent === id).slice(-10).reverse();
    const t = SIM.token[id] || { masuk: 0, keluar: 0, panggilan: 0 };
    a.token = { masuk: t.masuk, keluar: t.keluar, panggilan: t.panggilan };
    return a;
  };

  // ---------- potongan tampilan yang dipakai banyak halaman ----------
  M.KEADAAN = { kerja: "Kerja", menunggu: "Tunggu OK", santai: "Santai" };
  M.lencanaKeadaan = a => a.basi ? `<span class="keadaan k-basi" title="Mengaku kerja, tapi lebih dari 10 menit tanpa kabar"><i></i>Basi?</span>`
    : `<span class="keadaan k-${a.keadaan}"><i></i>${M.KEADAAN[a.keadaan] || a.keadaan}</span>`;
  M.STATUS = { PENDING: "Antre", ASSIGNED: "Ditugaskan", RUNNING: "Dikerjakan", REVIEW: "Review", REVISION: "Revisi", APPROVED: "Disetujui", FAILED: "Gagal" };
  M.lencanaStatus = t => `<span class="stt stt-${t.status}">${M.STATUS[t.status] || t.status}</span>` +
    (t.status === "REVIEW" ? ` <span class="stt qa-${t.qa_status}">QA ${({ menunggu: "berjalan", lulus: "lulus", gagal: "gagal", error: "error", belum: "-" })[t.qa_status] || t.qa_status}</span>` : "") +
    (t.adapter === "uji" ? ' <span class="stt qa-error" title="Dikerjakan adapter tes, bukan AI">UJI</span>' : "");
  M.kelasStatus = s => /^Aktif$/.test(s) ? "st-aktif" : /BETA/.test(s) ? "st-beta" : /tes lulus/.test(s) ? "st-lulus" : /template/.test(s) ? "st-baru"
    : /Prototype/.test(s) ? "st-proto" : /Rancangan/.test(s) ? "st-rancang" : "st-owner";
  M.kelasPrioritas = p => /Pakai/.test(p) ? "pr-pakai" : /perlu/.test(p) ? "pr-perlu" : /Parkir/.test(p) ? "pr-parkir" : "";
  M.namaLantai = no => { const l = M.gedung.lantai.find(x => x.no === no); return l ? `Lt ${l.no} · ${l.nama}` : "-"; };
  M.namaRuang = id => { for (const l of M.gedung.lantai) for (const r of l.ruang) if (r.id === id) return r.nama; return id; };

  // jam & indikator live di navigasi atas
  // indikator di navigasi + banner besar. DEMO / LIVE / STALE / OFFLINE / PRATINJAU
  M.MODE = {
    LIVE: ["nyala", "Live", ""],
    STALE: ["basi", "Worker mati", "Worker tidak berjalan: tugas tidak akan dikerjakan. Jalankan MULAI_WORKER.bat."],
    DEMO: ["contoh", "DEMO", "MODE DEMO: semua gerakan dan angka di layar ini contoh, bukan kerja agent sungguhan."],
    OFFLINE: ["mati", "Offline", "Backend tidak menjawab. Data di layar mungkin sudah lama. Jalankan MULAI.bat."],
    PRATINJAU: ["contoh", "Pratinjau", "PRATINJAU: data contoh di browser. Untuk agent sungguhan, jalankan Markas di laptop."],
  };
  M.mode = () => M.pratinjau ? "PRATINJAU" : !M.snapshot ? "OFFLINE" : (M.snapshot.mode || "LIVE");
  M.navLive = function (err) {
    const mode = err ? "OFFLINE" : M.mode(), [kelas, label, teks] = M.MODE[mode];
    const el = document.getElementById("navLive");
    if (el) { el.className = "live " + kelas; el.querySelector("span").textContent = label; el.title = teks || "Backend dan worker berjalan"; }
    let b = document.getElementById("bannerMode");
    if (!b && teks) { b = document.createElement("div"); b.id = "bannerMode"; b.setAttribute("role", "status"); document.querySelector("header.nav")?.after(b); }
    if (b) { b.className = "banner-mode bm-" + mode.toLowerCase(); b.textContent = teks; b.hidden = !teks; }
  };
  setInterval(() => { const j = document.getElementById("navJam"); if (j) j.textContent = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }); }, 1000);

  // tema terang/gelap (terang = bawaan, disimpan per browser) + tandai menu aktif
  try { const t = localStorage.getItem("markas-tema"); if (t) document.documentElement.dataset.theme = t; } catch (e) { /* mode privat */ }
  document.addEventListener("DOMContentLoaded", () => {
    const hal = document.body.dataset.hal;
    M.$$(".nav-menu a").forEach(a => { if (a.dataset.hal === hal) a.setAttribute("aria-current", "page"); });
    const tb = document.getElementById("tombolTema");
    if (tb) tb.addEventListener("click", () => {
      const baru = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = baru;
      try { localStorage.setItem("markas-tema", baru); } catch (e) { /* abaikan */ }
      document.dispatchEvent(new CustomEvent("markas-tema", { detail: baru }));
    });
  });

  window.MARKAS = M;
})();
