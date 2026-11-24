/* =====================================================================
   PAPAN.JS · papan tugas (gaya Linear) yang tersambung ke database
   ---------------------------------------------------------------------
   Status tugas di database (backend/tugas.py):
     PENDING -> ASSIGNED -> RUNNING -> REVIEW -> APPROVED
                               ^          |
                               +-REVISION-+        FAILED kalau gagal
   Papan mengelompokkan status itu menjadi 5 kolom yang mudah dibaca.

   Dua sumber data:
   - SERVER : web dibuka lewat MULAI.bat. Semua dibaca & ditulis ke database lewat API.
   - LOKAL  : web dibuka langsung (file) atau server mode demo. Data contoh di browser.
   ===================================================================== */
(function () {
  "use strict";
  const { $, $$, esc } = U;

  const KOLOM = [
    { id: "antre", nama: "Antre", warna: "#8f8775", ket: "Menunggu dikerjakan" },
    { id: "kerja", nama: "Dikerjakan", warna: "var(--s-kerja)", ket: "Agent sedang bekerja" },
    { id: "qa", nama: "Cek QA", warna: "var(--s-qa)", ket: "Vera & tim memeriksa" },
    { id: "ok", nama: "Menunggu OK", warna: "var(--s-menunggu)", ket: "Giliran kamu memutuskan" },
    { id: "selesai", nama: "Selesai", warna: "var(--s-selesai)", ket: "Disetujui atau gagal" },
  ];
  const NAMA_STATUS = { PENDING: "antre", ASSIGNED: "diserahkan", RUNNING: "dikerjakan", REVIEW: "diperiksa", REVISION: "revisi", APPROVED: "disetujui", FAILED: "gagal" };

  function kolomDari(t) {
    switch (t.status) {
      case "PENDING": case "ASSIGNED": return "antre";
      case "RUNNING": case "REVISION": return "kerja";
      case "REVIEW": return t.qa_status === "lulus" ? "ok" : "qa";
      default: return "selesai";
    }
  }

  let sumber = "lokal", owner = false, tugas = [];
  const kunciUnik = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));

  // =====================================================================
  //  SUMBER LOKAL (contoh)
  // =====================================================================
  const KUNCI = "markas-papan-v2";
  const CONTOH = [
    ["Buat landing page Laundry Bersih Jaya", "Bayu", "REVIEW", "lulus"],
    ["Rangkum berita AI hari ini", "Nova", "RUNNING"],
    ["Cari 3 lomba web untuk SMK", "Rico", "PENDING"],
    ["Uji chatbot toko komputer 20 pertanyaan", "Max", "REVIEW", "menunggu"],
    ["Desain logo klien bengkel", "Jess", "REVISION", "belum", 1],
    ["Analisa chart BBCA minggu ini", "Lia", "ASSIGNED"],
    ["Proposal jasa website untuk kafe", "Dito", "APPROVED", "lulus"],
    ["Cek keamanan form kontak", "Satria", "RUNNING"],
    ["Video portofolio 30 detik", "Raka", "PENDING"],
  ];
  const jamSekarang = () => new Date().toISOString().replace("T", " ").slice(0, 19);
  function bikinContoh() {
    return CONTOH.map((c, i) => ({
      id: 41 + i, judul: c[0], agent: c[1], status: c[2], qa_status: c[3] || "belum", revisi: c[4] || 0, prioritas: "normal",
      tujuan: "", kriteria: [], riwayat: [{ ke: c[2], pelaku: "Jarvis", alasan: "data contoh", waktu: jamSekarang() }],
    }));
  }
  function muatLokal() {
    try { tugas = JSON.parse(localStorage.getItem(KUNCI)) || bikinContoh(); } catch (e) { tugas = bikinContoh(); }
    if (!Array.isArray(tugas)) tugas = bikinContoh();
  }
  function simpanLokal() { try { localStorage.setItem(KUNCI, JSON.stringify(tugas)); } catch (e) { /* mode privat */ } }
  function pindahLokal(t, ke, pelaku, alasan = "") {
    t.riwayat = t.riwayat || [];
    t.riwayat.push({ dari: t.status, ke, pelaku, alasan, waktu: jamSekarang() });
    t.status = ke;
  }
  // Jarvis versi contoh: memilih agent dari kata kunci perintah
  const PILIH = [[/chatbot|bot/i, "Oka"], [/logo|desain|poster/i, "Jess"], [/berita|rangkum/i, "Nova"], [/lomba|beasiswa/i, "Rico"],
    [/crypto|bitcoin/i, "Nadia"], [/saham|chart|trading/i, "Lia"], [/video|reels/i, "Raka"], [/proposal|harga/i, "Dito"],
    [/aman|security|keamanan/i, "Satria"], [/foto|listing/i, "Reno"], [/web|landing|halaman|situs/i, "Bayu"]];
  function perintahLokal(teks, prioritas) {
    const agent = (PILIH.find(([re]) => re.test(teks)) || [, "Bayu"])[1];
    const id = Math.max(40, ...tugas.map(t => t.id)) + 1;
    const judul = teks.length > 70 ? teks.slice(0, 67).trim() + "…" : teks;
    tugas.unshift({ id, judul, tujuan: teks, agent, status: "PENDING", qa_status: "belum", revisi: 0, prioritas, kriteria: ["Sesuai perintah", "Rapi di HP"],
      riwayat: [{ ke: "PENDING", pelaku: "Jarvis", alasan: "dipecah dari perintah Cell", waktu: jamSekarang() }] });
    simpanLokal(); gambar();
    return agent;
  }
  function langkahLokal() {
    tugas.forEach(t => {
      if (Math.random() < .5) return;
      if (t.status === "PENDING") pindahLokal(t, "ASSIGNED", "Jarvis");
      else if (t.status === "ASSIGNED" || t.status === "REVISION") pindahLokal(t, "RUNNING", t.agent);
      else if (t.status === "RUNNING") { pindahLokal(t, "REVIEW", t.agent, "hasil diserahkan"); t.qa_status = "menunggu"; }
      else if (t.status === "REVIEW" && t.qa_status !== "lulus") {
        if (Math.random() < .75) { t.qa_status = "lulus"; t.riwayat.push({ ke: "REVIEW", pelaku: "Vera", alasan: "QA lulus", waktu: jamSekarang() }); }
        else { t.revisi++; t.qa_status = "belum"; pindahLokal(t, "REVISION", "Vera", "tampilan HP belum rapi"); }
      }
    });
    simpanLokal(); gambar();
  }

  // =====================================================================
  //  SUMBER SERVER (database)
  // =====================================================================
  async function ambilServer() {
    try { tugas = await U.api("/api/tugas"); gambar(); }
    catch (e) { /* server berhenti sebentar */ }
  }
  async function cekPeran() {
    try { owner = (await U.api("/api/saya")).peran === "owner"; } catch (e) { owner = false; }
    tampilAkses();
  }

  // =====================================================================
  //  TAMPILAN
  // =====================================================================
  function kartu(t) {
    const a = U.peta[t.agent] || { divisi: "" };
    const kol = kolomDari(t);
    const tag = t.status === "FAILED" ? '<span class="tag merah">gagal</span>'
      : t.status === "APPROVED" ? '<span class="tag hijau">OK</span>'
      : t.status === "REVISION" || t.revisi ? `<span class="tag kuning">revisi ${t.revisi || 1}</span>`
      : kol === "qa" ? '<span class="tag ungu">QA</span>'
      : t.status === "ASSIGNED" ? '<span class="tag">diserahkan</span>' : "";
    const tombol = kol === "ok" ? `
      <div class="tombol-tiket">
        <button class="ok" type="button" data-aksi="setujui" data-id="${t.id}">✓ OK</button>
        <button type="button" data-aksi="revisi" data-id="${t.id}">Revisi</button>
      </div>` : t.status === "FAILED" ? `
      <div class="tombol-tiket"><button type="button" data-aksi="ulang" data-id="${t.id}">↻ Coba lagi</button></div>` : "";
    return `
      <article class="tiket" style="--w:${U.warna(a.divisi)}" data-buka="${t.id}" tabindex="0" role="button" aria-label="Detail tugas ${t.id}: ${esc(t.judul)}">
        <div class="id"><span>MC-${t.id}</span>${t.prioritas === "tinggi" ? '<span class="prioritas-tinggi">▲ tinggi</span>' : ""}</div>
        <h4>${esc(t.judul)}</h4>
        <div class="bawah">${U.peta[t.agent] ? `<img class="pixel" src="${U.ava(t.agent, 2)}" alt="">` : ""}<span>${esc(t.agent)}</span>${tag}</div>
        ${tombol}
      </article>`;
  }
  function gambar() {
    $("#papan").innerHTML = KOLOM.map(k => {
      const isi = tugas.filter(t => kolomDari(t) === k.id);
      return `
        <div class="kolom">
          <div class="kolom-kepala" style="--w:${k.warna}"><i></i>${k.nama}<span class="jml">${isi.length}</span></div>
          <div class="kolom-ket">${k.ket}</div>
          ${isi.length ? isi.map(kartu).join("") : `<div class="kolom-kosong">${k.id === "antre" && !tugas.length ? "Belum ada tugas. Beri perintah ke Jarvis di atas." : "Kosong"}</div>`}
        </div>`;
    }).join("");
  }

  function tampilAkses() {
    const server = sumber === "server";
    $("#form-masuk").hidden = !server || owner;
    $("#sudah-masuk").hidden = !server || !owner;
    $("#alat-demo").hidden = server;
    $("#tag-akses").textContent = server ? (owner ? "owner" : "tamu") : "demo";
    $("#tag-perintah").textContent = server ? (owner ? "siap" : "perlu masuk") : "demo";
    $("#judul-akses").textContent = server ? "Masuk sebagai Owner" : "Mode demo";
    $("#catatan-akses").innerHTML = server
      ? (owner ? "" : "Kunci owner ada di file <b>.env</b> di folder markas-cell (baris MARKAS_KUNCI_OWNER). Kunci tidak disimpan di browser.")
      : U.live
        ? "Server berjalan dengan <b>--demo</b>, jadi papan memakai data contoh di browser. Jalankan MULAI.bat biasa untuk tugas sungguhan."
        : "Server belum menyala. Papan memakai <b>data contoh</b> yang tersimpan di browsermu. Coba kirim perintah, lalu klik Jalankan otomatis.";
  }

  // ---------- detail tugas ----------
  const dTugas = $("#dialog-tugas");
  async function bukaDetail(id) {
    let t = tugas.find(x => x.id === id);
    if (!t) return;
    if (sumber === "server") {
      try { t = await U.api("/api/tugas/" + id); } catch (e) { U.kabar("Gagal membuka tugas: " + e.message, "galat"); return; }
    }
    const a = U.peta[t.agent] || {};
    const riwayat = (t.riwayat || []).map(r => `<li><time>${esc(U.jam(r.waktu))}</time><span><b>${esc(r.pelaku)}</b> → ${esc(NAMA_STATUS[r.ke] || r.ke)}${r.alasan ? " · " + esc(r.alasan) : ""}${r.ditolak ? " (ditolak)" : ""}</span></li>`).join("");
    const qa = (t.qa || [])[0];
    const cek = qa ? qa.cek.map(c => `<div class="cek"><b style="color:${c.lulus ? "var(--s-selesai)" : "var(--s-gagal)"}">${c.lulus ? "✓" : "✕"}</b><span>${esc(c.cek)}${c.detail ? ` <span style="color:var(--teks-3)">· ${esc(c.detail)}</span>` : ""}</span></div>`).join("") : "";
    const artefak = (t.artefak || []).map(f => `<li><time>v${f.versi}</time><a class="tautan-emas" href="/api/tugas/${t.id}/artefak/${f.id}" target="_blank" rel="noopener">${esc(f.path)}</a></li>`).join("");
    const kol = kolomDari(t);
    $("#isi-tugas").innerHTML = `
      <div class="dialog-kepala" style="--w:${U.warna(a.divisi)}">
        ${U.peta[t.agent] ? `<img class="pixel" src="${U.ava(t.agent, 4)}" alt="">` : ""}
        <div><h2 id="judul-dialog">MC-${t.id}</h2><div class="sub">${esc(t.judul)}</div></div>
      </div>
      <div class="dialog-isi">
        <dl>
          <dt>Status</dt><dd>${esc(NAMA_STATUS[t.status] || t.status)} · QA ${esc(t.qa_status)}${t.revisi ? ` · revisi ke-${t.revisi}` : ""}</dd>
          <dt>Dikerjakan</dt><dd>${esc(t.agent)}${a.jabatan ? " · " + esc(a.jabatan) : ""}</dd>
          <dt>Prioritas</dt><dd>${esc(t.prioritas || "normal")}</dd>
          ${t.tujuan ? `<dt>Tujuan</dt><dd>${esc(t.tujuan)}</dd>` : ""}
          ${t.kriteria && t.kriteria.length ? `<dt>Kriteria lulus</dt><dd>${t.kriteria.map(k => "• " + esc(k)).join("<br>")}</dd>` : ""}
          ${t.ringkasan ? `<dt>Ringkasan</dt><dd>${esc(t.ringkasan)}</dd>` : ""}
          ${t.error ? `<dt>Galat</dt><dd style="color:var(--s-gagal)">${esc(t.error)}</dd>` : ""}
          ${t.folder ? `<dt>Folder hasil</dt><dd><code>${esc(t.folder)}</code></dd>` : ""}
        </dl>
        ${cek ? `<h4>Hasil QA (${esc(qa.penilai)})</h4>${cek}` : ""}
        ${artefak ? `<h4>File hasil</h4><ul class="daftar-riwayat">${artefak}</ul>` : ""}
        ${riwayat ? `<h4>Riwayat</h4><ul class="daftar-riwayat">${riwayat}</ul>` : ""}
        <div class="dialog-aksi">
          ${kol === "ok" ? `<button class="tombol tombol-garis tombol-kecil" type="button" data-aksi="revisi" data-id="${t.id}">Minta revisi</button>
            <button class="tombol tombol-emas tombol-kecil" type="button" data-aksi="setujui" data-id="${t.id}">✓ Setujui</button>` : ""}
          ${t.status === "FAILED" ? `<button class="tombol tombol-emas tombol-kecil" type="button" data-aksi="ulang" data-id="${t.id}">↻ Coba lagi</button>` : ""}
        </div>
      </div>`;
    if (!dTugas.open) dTugas.showModal();
  }

  // ---------- keputusan Cell ----------
  const dRevisi = $("#dialog-revisi");
  let idRevisi = null;
  function mintaAlasan(id) {
    const t = tugas.find(x => x.id === id);
    idRevisi = id;
    $("#sub-revisi").textContent = t ? `MC-${t.id} · ${t.judul}` : "";
    $("#alasan-revisi").value = "";
    if (dTugas.open) dTugas.close();
    dRevisi.showModal();
    $("#alasan-revisi").focus();
  }
  $("#form-revisi").addEventListener("submit", e => {
    const alasan = $("#alasan-revisi").value.trim();
    if (alasan.length < 3) { e.preventDefault(); U.kabar("Tulis alasan revisi minimal 3 huruf", "galat"); return; }
    putuskan(idRevisi, "revisi", alasan);
  });

  async function putuskan(id, aksi, alasan = "") {
    const t = tugas.find(x => x.id === id);
    if (!t) return;
    if (sumber === "server") {
      if (!owner) { U.kabar("Masuk sebagai Owner dulu (panel kanan atas)", "galat"); $("#kunci").focus(); return; }
      try {
        await U.api(`/api/tugas/${id}/${aksi}`, { method: "POST", body: aksi === "ulang" ? undefined : JSON.stringify({ alasan }) });
        U.kabar(aksi === "setujui" ? `MC-${id} disetujui ✓` : aksi === "revisi" ? `MC-${id} dikirim balik untuk revisi` : `MC-${id} diantre ulang`, "ok");
      } catch (e) {
        if (e.kode === 401 || e.kode === 403) { owner = false; tampilAkses(); }
        U.kabar(e.message, "galat");
      }
      if (dTugas.open) dTugas.close();
      return ambilServer();
    }
    if (aksi === "setujui") { pindahLokal(t, "APPROVED", "Cell", "disetujui"); U.kabar(`MC-${id} disetujui ✓`, "ok"); }
    else if (aksi === "revisi") { t.revisi++; t.qa_status = "belum"; pindahLokal(t, "REVISION", "Cell", alasan); U.kabar(`MC-${id} dikirim balik untuk revisi`, "ok"); }
    else { t.revisi = 0; t.qa_status = "belum"; pindahLokal(t, "PENDING", "Cell", "coba lagi"); }
    if (dTugas.open) dTugas.close();
    simpanLokal(); gambar();
  }

  // ---------- event ----------
  document.addEventListener("click", e => {
    if (e.target.closest("[data-tutup]")) { e.target.closest("dialog").close(); return; }
    const b = e.target.closest("button[data-aksi]");
    if (b) {
      e.stopPropagation();
      const id = Number(b.dataset.id);
      if (b.dataset.aksi === "revisi") mintaAlasan(id); else putuskan(id, b.dataset.aksi);
      return;
    }
    const k = e.target.closest(".tiket[data-buka]");
    if (k) bukaDetail(Number(k.dataset.buka));
  });
  $("#papan").addEventListener("keydown", e => {
    const k = e.target.closest(".tiket[data-buka]");
    if (k && (e.key === "Enter" || e.key === " ") && e.target === k) { e.preventDefault(); bukaDetail(Number(k.dataset.buka)); }
  });
  [dTugas, dRevisi].forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));

  $("#form-perintah").addEventListener("submit", async e => {
    e.preventDefault();
    const teks = $("#teks-perintah").value.trim(), prioritas = $("#prioritas").value;
    if (teks.length < 5) { U.kabar("Perintah minimal 5 huruf", "galat"); return; }
    const tombol = $("#kirim-perintah");
    if (sumber === "lokal") {
      const agent = perintahLokal(teks, prioritas);
      $("#teks-perintah").value = "";
      U.kabar(`Jarvis menyerahkan tugas ke ${agent} (contoh)`, "ok");
      return;
    }
    if (!owner) { U.kabar("Masuk sebagai Owner dulu (panel kanan)", "galat"); $("#kunci").focus(); return; }
    tombol.disabled = true;
    try {
      const r = await U.api("/api/perintah", { method: "POST", headers: { "Idempotency-Key": kunciUnik() }, body: JSON.stringify({ teks, prioritas }) });
      $("#teks-perintah").value = "";
      if (r.jenis === "laporan_wa") { tampilLaporan(r.wa); return; }
      U.kabar(`Perintah #${r.id} diterima. Jarvis akan memecahnya jadi tugas.`, "ok");
      if (U.mode === "STALE") U.kabar("Worker belum jalan: buka MULAI_WORKER.bat supaya tugas dikerjakan", "info");
    } catch (err) {
      if (err.kode === 401 || err.kode === 403) { owner = false; tampilAkses(); }
      U.kabar(err.message, "galat");
    } finally { tombol.disabled = false; }
  });

  // ---------- laporan per agent ke WhatsApp ----------
  function tampilLaporan(h) {
    const el = $("#hasil-laporan");
    el.textContent = h.pesan;
    if (h.tautan && !h.terkirim) {
      const a = document.createElement("a");
      a.href = h.tautan; a.target = "_blank"; a.rel = "noopener"; a.textContent = " Buka WhatsApp →";
      el.append(a);
    }
    U.kabar(h.terkirim ? "Laporan per agent terkirim ke WA" : h.pesan, h.terkirim ? "ok" : h.cara === "manual" ? "info" : "galat");
  }
  $("#kirim-laporan").addEventListener("click", async () => {
    const b = $("#kirim-laporan");
    b.disabled = true;
    try { tampilLaporan(await U.api("/api/laporan/wa", { method: "POST" })); }
    catch (err) { if (err.kode === 401 || err.kode === 403) { owner = false; tampilAkses(); } U.kabar(err.message, "galat"); }
    finally { b.disabled = false; }
  });

  $("#form-masuk").addEventListener("submit", async e => {
    e.preventDefault();
    const kunci = $("#kunci").value.trim();
    if (kunci.length < 8) { U.kabar("Kunci terlalu pendek", "galat"); return; }
    try {
      await U.api("/api/masuk", { method: "POST", body: JSON.stringify({ kunci }) });
      $("#kunci").value = "";
      owner = true; tampilAkses();
      U.kabar("Berhasil masuk sebagai Owner", "ok");
    } catch (err) { U.kabar(err.kode === 401 ? "Kunci owner salah" : err.message, "galat"); }
  });
  $("#keluar").addEventListener("click", async () => {
    try { await U.api("/api/keluar", { method: "POST" }); } catch (e) { /* tetap keluar di tampilan */ }
    owner = false; tampilAkses(); U.kabar("Kamu sudah keluar", "info");
  });

  let timer = null;
  $("#tombol-jalan").addEventListener("click", ev => {
    const b = ev.currentTarget;
    if (timer) { clearInterval(timer); timer = null; b.textContent = "▶ Jalankan otomatis"; }
    else { langkahLokal(); timer = setInterval(langkahLokal, 2500); b.textContent = "❚❚ Jeda"; }
  });
  $("#tombol-reset").addEventListener("click", () => { tugas = bikinContoh(); simpanLokal(); gambar(); U.kabar("Data contoh dikembalikan", "info"); });

  // ---------- perintah terakhir (server) ----------
  document.addEventListener("markas:snapshot", e => {
    if (sumber !== "server") return;
    const p = (e.detail.perintah || [])[0];
    $("#catatan-perintah").innerHTML = p ? `Perintah terakhir #${p.id}: <b>${esc(p.status)}</b>${p.catatan ? " · " + esc(p.catatan) : ""}` : "";
    ambilServer();
  });

  // ---------- mulai ----------
  gambar();
  U.siap.then(({ live, mode }) => {
    sumber = live && mode !== "DEMO" ? "server" : "lokal";
    tampilAkses();
    if (sumber === "server") { ambilServer(); cekPeran(); }
    else { muatLokal(); gambar(); $("#catatan-perintah").textContent = "Mode demo: Jarvis contoh memilih agent dari kata kunci perintahmu."; }
  });
})();
