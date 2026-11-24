/* =====================================================================
   KONTROL.JS · perintah ke Jarvis, persetujuan, detail tugas, token, metrik, log
   Alur yang ditampilkan halaman ini:
   Cell -> Jarvis -> Bayu (worker) -> Vera (QA) -> Cell menyetujui
   Tombol "Selesai" manual sengaja tidak ada: tugas hanya selesai lewat QA + persetujuan.
   ===================================================================== */
(async function () {
  "use strict";
  const M = window.MARKAS, P = window.PIXEL, esc = M.esc;
  try { await M.muat(); } catch (e) { M.navLive(e); M.$("#pInfo").textContent = e.message; return; }
  const A = M.agent;
  const img = id => A[id] ? `<img class="pixel" src="${P.url(A[id], 2)}" alt="" width="14" height="21">` : "";
  let peran = "viewer";

  // ---------- sesi owner ----------
  async function gambarSesi() {
    try { peran = (await M.saya()).peran; } catch (e) { peran = "viewer"; }
    const el = M.$("#sesi");
    if (peran === "owner") {
      el.innerHTML = `<span class="sesi-ok"><i class="titik" style="background:var(--kerja)"></i>Masuk sebagai <b>owner</b></span><button class="btn btn-kecil" id="tKeluar" type="button">Keluar</button>`;
      M.$("#tKeluar").onclick = async () => { await M.keluar(); gambarSesi(); };
    } else {
      el.innerHTML = `<form id="formMasuk" class="form-masuk"><label for="kunci"><b>Masuk sebagai owner</b><small>Kunci ada di file <code>.env</code>, baris <code>MARKAS_KUNCI_OWNER</code></small></label>
        <div class="baris-form"><input class="input" id="kunci" type="password" autocomplete="current-password" required minlength="8" placeholder="Kunci owner"><button class="btn btn-utama" type="submit">Masuk</button></div>
        <span class="pesan-info" id="mInfo"></span></form>`;
      M.$("#formMasuk").onsubmit = async e => {
        e.preventDefault();
        try { await M.masuk(M.$("#kunci").value.trim()); gambarSesi(); }
        catch (err) { M.$("#mInfo").className = "pesan-info gagal"; M.$("#mInfo").textContent = err.message; }
      };
    }
    document.body.classList.toggle("owner", peran === "owner");
    if (M.snapshot) gambar(M.snapshot);
  }
  await gambarSesi();
  const perluMasuk = info => { info.className = "pesan-info gagal"; info.textContent = "Masuk dulu sebagai owner (kotak kanan atas)."; };

  // ---------- perintah ----------
  M.$("#formPerintah").addEventListener("submit", async e => {
    e.preventDefault();
    const info = M.$("#pInfo"), teks = M.$("#pTeks").value.trim();
    if (peran !== "owner") return perluMasuk(info);
    if (teks.length < 5) { info.className = "pesan-info gagal"; info.textContent = "Perintah minimal 5 huruf."; return; }
    try {
      const r = await M.kirimPerintah(teks, M.$("#pPrio").value);
      info.className = "pesan-info ok"; info.textContent = `Perintah #${r.id} diterima. Jarvis akan memecahnya jadi tugas.`;
      M.$("#pTeks").value = ""; segarkan();
    } catch (err) { info.className = "pesan-info gagal"; info.textContent = "Gagal: " + err.message; }
  });

  // ---------- aksi tugas (setujui / revisi / ulang / detail) ----------
  async function aksi(jenis, id, alasan) {
    if (peran !== "owner") { alert("Masuk dulu sebagai owner."); return; }
    try {
      if (jenis === "setujui") await M.setujui(id, alasan || "");
      else if (jenis === "revisi") await M.mintaRevisi(id, alasan);
      else if (jenis === "ulang") await M.ulangTugas(id);
      await segarkan();
      if (terbuka === id) buka(id);
    } catch (err) { alert("Gagal: " + err.message); }
  }
  document.addEventListener("click", e => {
    const b = e.target.closest("button[data-aksi]"); if (!b) return;
    const id = +b.dataset.id, jenis = b.dataset.aksi;
    if (jenis === "detail") { location.hash = "tugas=" + id; return; }
    if (jenis === "revisi") {
      const kotak = b.closest("[data-review]") || M.$("#laci"), input = M.$(`textarea[data-alasan="${id}"]`, kotak);
      if (input && input.hidden) { input.hidden = false; input.focus(); b.textContent = "Kirim revisi"; return; }
      const alasan = (input ? input.value : "").trim();
      if (alasan.length < 3) { if (input) input.focus(); return; }
      b.disabled = true; aksi("revisi", id, alasan); return;
    }
    b.disabled = true; aksi(jenis, id);
  });

  const kartuReview = t => {
    const bisa = t.qa_status === "lulus";
    return `<article class="kartu review" data-review="${t.id}">
      <div class="review-atas"><span class="siapa">${img(t.agent)}<b>#${t.id}</b></span><div><b>${esc(t.judul)}</b><div>${M.lencanaStatus(t)}</div></div></div>
      ${t.ringkasan ? `<p class="review-ringkas">${esc(t.ringkasan.slice(0, 220))}${t.ringkasan.length > 220 ? "…" : ""}</p>` : ""}
      <textarea class="input" data-alasan="${t.id}" hidden rows="2" maxlength="1000" placeholder="Apa yang harus diperbaiki Bayu?"></textarea>
      <div class="review-aksi">
        <button class="btn btn-kecil" data-aksi="detail" data-id="${t.id}">Lihat hasil & QA</button>
        <span class="hanya-owner"><button class="btn btn-kecil btn-utama" data-aksi="setujui" data-id="${t.id}" ${bisa ? "" : 'disabled title="Menunggu QA lulus"'}>Setujui</button>
        <button class="btn btn-kecil" data-aksi="revisi" data-id="${t.id}">Minta revisi</button></span>
      </div></article>`;
  };

  // ---------- laci detail tugas ----------
  const laci = M.$("#laci"), latar = M.$("#laciLatar");
  let terbuka = null;
  function tutup() { laci.classList.remove("buka"); latar.classList.remove("buka"); laci.setAttribute("aria-hidden", "true"); terbuka = null; if (location.hash) history.replaceState(null, "", location.pathname); }
  latar.addEventListener("click", tutup);
  laci.addEventListener("click", e => { if (e.target.closest(".laci-tutup")) tutup(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && terbuka) tutup(); });

  async function buka(id) {
    terbuka = id;
    laci.classList.add("buka"); latar.classList.add("buka"); laci.setAttribute("aria-hidden", "false");
    let t;
    try { t = await M.detailTugas(id); } catch (e) { laci.innerHTML = `<div class="laci-isi"><button class="laci-tutup" aria-label="Tutup">×</button><p class="kosong">${esc(e.message)}</p></div>`; return; }
    if (terbuka !== id) return;
    const a = A[t.agent] || {};
    laci.style.setProperty("--wd", M.warna(a.divisi));
    const kriteria = (t.kriteria || []).map(k => `<li>${esc(k)}</li>`).join("");
    const artefak = t.artefak.length ? `<ul class="daftar-file">${t.artefak.map(f => `<li>${M.pratinjau ? `<b>${esc(f.path)}</b>` : `<a href="/api/tugas/${t.id}/artefak/${f.id}" target="_blank" rel="noopener">${esc(f.path)}</a>`}
        <small>v${f.versi} · ${M.ringkas(f.ukuran)} B · ${esc((f.sha256 || "").slice(0, 10))}</small></li>`).join("")}</ul>
        <p class="catatan-kecil">File dibuka dalam mode aman (skrip di dalamnya tidak dijalankan). Folder: <code>${esc(t.folder || "")}</code></p>`
      : `<p class="kosong">Belum ada file hasil.</p>`;
    const qa = t.qa.length ? t.qa.map(q => `<div class="qa-blok ${q.lulus ? "lulus" : "gagal"}"><b>${q.lulus ? "LULUS" : "TIDAK LULUS"}</b> · versi ${q.versi} · ${esc(q.penilai)} · ${esc(M.jam(q.waktu))}
        ${q.catatan ? `<p>${esc(q.catatan)}</p>` : ""}<ul>${q.cek.map(c => `<li class="${c.lulus ? "ok" : "no"}"><span>${c.lulus ? "✓" : "✗"}</span> ${esc(c.cek)} <small>${esc(c.detail || "")}</small></li>`).join("")}</ul></div>`).join("")
      : `<p class="kosong">${t.status === "REVIEW" ? "QA sedang berjalan." : "Belum diperiksa QA."}</p>`;
    const riwayat = `<ol class="garis-waktu">${t.riwayat.map(r => `<li class="${r.ditolak ? "ditolak" : ""}"><time>${esc((r.waktu || "").slice(5, 16))}</time>
        <span>${r.dari ? `${M.STATUS[r.dari] || r.dari} → ` : ""}<b>${M.STATUS[r.ke] || r.ke}</b>${r.ditolak ? " <em>DITOLAK</em>" : ""} <small>oleh ${esc(r.pelaku)} (${esc(r.peran)})${r.alasan ? " · " + esc(r.alasan) : ""}</small></span></li>`).join("")}</ol>`;
    const handoff = t.handoff.length ? `<ul class="riwayat">${t.handoff.map(h => `<li><time>${esc((h.waktu || "").slice(11, 16))}</time><span><b>${esc(h.dari)} → ${esc(h.ke)}</b> <small>${esc(Object.keys(h.konteks).join(", "))}</small></span></li>`).join("")}</ul>` : `<p class="kosong">-</p>`;
    laci.innerHTML = `
      <div class="laci-kepala"><button class="laci-tutup" aria-label="Tutup">×</button>
        <span class="foto-besar">${img(t.agent)}</span>
        <div><span class="chip">Tugas #${t.id}${t.perintah ? ` · dari perintah #${t.perintah}` : ""}</span>
          <h2 style="font-size:24px">${esc(t.judul)}</h2>
          <p class="jab">${esc(t.agent)} · percobaan ${t.percobaan} · revisi ${t.revisi}${t.adapter ? ` · otak: ${esc(t.adapter)}` : ""}</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">${M.lencanaStatus(t)}</div></div></div>
      <div class="laci-isi">
        ${t.status === "REVIEW" ? `<div class="kartu blok hanya-owner" data-review="${t.id}"><h3>Keputusanmu</h3>
          <textarea class="input" data-alasan="${t.id}" hidden rows="2" maxlength="1000" placeholder="Apa yang harus diperbaiki?"></textarea>
          <div class="review-aksi"><button class="btn btn-utama" data-aksi="setujui" data-id="${t.id}" ${t.qa_status === "lulus" ? "" : "disabled"}>Setujui hasil</button>
          <button class="btn" data-aksi="revisi" data-id="${t.id}">Minta revisi</button></div></div>` : ""}
        ${t.status === "FAILED" ? `<div class="kartu blok hanya-owner"><h3>Tugas gagal</h3><p>${esc(t.error || "-")}</p><button class="btn btn-utama" data-aksi="ulang" data-id="${t.id}">Coba lagi</button></div>` : ""}
        <div class="kartu blok"><h3>Tujuan</h3><p>${esc(t.tujuan)}</p>${kriteria ? `<h3 style="margin-top:12px">Kriteria lulus</h3><ul class="kriteria">${kriteria}</ul>` : ""}
          ${t.perintah_teks ? `<h3 style="margin-top:12px">Perintah asli</h3><p class="kutip">${esc(t.perintah_teks)}</p>` : ""}</div>
        <div class="kartu blok"><h3>File hasil</h3>${artefak}</div>
        ${t.ringkasan ? `<div class="kartu blok"><h3>Laporan ${esc(t.agent)}</h3><p class="pre">${esc(t.ringkasan)}</p></div>` : ""}
        <div class="kartu blok"><h3>Pemeriksaan QA</h3>${qa}</div>
        <div class="kartu blok"><h3>Riwayat status</h3>${riwayat}</div>
        <div class="kartu blok"><h3>Serah terima</h3>${handoff}</div>
        <div class="fakta"><div class="kartu"><small>Token masuk</small><b>${M.ringkas(t.token.masuk)}</b></div><div class="kartu"><small>Token keluar</small><b>${M.ringkas(t.token.keluar)}</b></div>
          <div class="kartu"><small>Perkiraan biaya</small><b>${t.token.biaya_usd ? "$" + Number(t.token.biaya_usd).toFixed(2) : "-"}</b></div></div>
        ${t.error && t.status !== "FAILED" ? `<div class="kartu blok"><h3>Error terakhir</h3><p class="pre">${esc(t.error)}</p></div>` : ""}
      </div>`;
  }
  const dariHash = () => { const m = location.hash.match(/tugas=(\d+)/); if (m) buka(+m[1]); else if (terbuka) tutup(); };
  window.addEventListener("hashchange", dariHash);
  dariHash();

  // ---------- grafik metrik ----------
  function grafik(data) {
    const cv = M.$("#grafik"), r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const c = cv.getContext("2d"); c.scale(dpr, dpr);
    const w = r.width, h = r.height, gaya = getComputedStyle(document.documentElement);
    c.clearRect(0, 0, w, h);
    c.strokeStyle = gaya.getPropertyValue("--garis"); c.fillStyle = gaya.getPropertyValue("--tinta-3"); c.font = "11px Inter, sans-serif"; c.lineWidth = 1;
    [0, 50, 100].forEach(v => { const y = h - 18 - (h - 28) * v / 100; c.beginPath(); c.moveTo(30, y); c.lineTo(w, y); c.stroke(); c.fillText(v + "%", 0, y + 4); });
    if (data.length < 2) { c.fillText("Menunggu data…", 40, h / 2); return; }
    [["cpu", "#2f6fed"], ["ram", "#e8a317"]].forEach(([k, warna]) => {
      c.beginPath(); c.strokeStyle = warna; c.lineWidth = 2;
      data.forEach((d, i) => { const x = 30 + (w - 30) * i / (data.length - 1), y = h - 18 - (h - 28) * d[k] / 100; i ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
    });
  }

  // ---------- gambar ulang tiap snapshot ----------
  let logAda = 0, jejakReview = "";
  const STATUS_PERINTAH = { BARU: "Antre di Jarvis", DIPROSES: "Jarvis memecah", DIPECAH: "Jadi tugas", DITOLAK: "Ditolak Jarvis", GAGAL: "Gagal" };
  function gambar(s) {
    const st = s.statistik, tg = st.tugas;
    M.$("#uKerja").textContent = st.agent.kerja;
    M.$("#uTunggu").textContent = st.perlu_ok;
    M.$("#uTugas").textContent = tg.PENDING + tg.ASSIGNED + tg.RUNNING + tg.REVISION + tg.REVIEW;
    M.$("#uToken").textContent = M.ringkas(s.token.total);
    M.$("#uTokenKet").textContent = M.pratinjau || s.demo ? "Token hari ini (contoh)" : "Token hari ini";
    M.$("#tugasKet").textContent = `${tg.APPROVED} disetujui · ${tg.FAILED} gagal`;

    // perintah
    M.$("#daftarPerintah").innerHTML = (s.perintah || []).length ? s.perintah.map(p => `<li><b>#${p.id}</b> <span class="stt pr-${p.status}">${STATUS_PERINTAH[p.status] || p.status}</span>
      <span class="teks">${esc(p.teks.slice(0, 110))}${p.teks.length > 110 ? "…" : ""}</span>${p.catatan ? `<small>${esc(p.catatan)}</small>` : ""}</li>`).join("")
      : `<li class="kosong">Belum ada perintah.</li>`;

    // review: hanya digambar ulang kalau isinya berubah, supaya kotak alasan revisi yang sedang diketik tidak hilang
    const review = s.tugas.filter(t => t.status === "REVIEW");
    const jejak = JSON.stringify(review.map(t => [t.id, t.qa_status])) + peran;
    if (jejak !== jejakReview) {
      jejakReview = jejak;
      M.$("#okJumlah").textContent = review.length ? `${review.length} tugas` : "";
      M.$("#daftarOk").innerHTML = review.length ? review.map(kartuReview).join("")
        : `<p class="kosong">Tidak ada hasil yang menunggu. Hasil muncul di sini setelah lolos QA Vera.</p>`;
    }

    // tabel tugas
    M.$("#tTugas").innerHTML = s.tugas.length ? s.tugas.map(t => `<tr>
      <td>${t.id}</td><td><span class="siapa">${img(t.agent)}${esc(t.agent)}</span></td>
      <td>${esc(t.judul)}${t.prioritas === "tinggi" ? ' <span class="chip pr-perlu">tinggi</span>' : ""}</td>
      <td>${M.lencanaStatus(t)}</td><td>${t.percobaan}${t.revisi ? ` · rev ${t.revisi}` : ""}</td>
      <td style="white-space:nowrap"><button class="btn btn-kecil" data-aksi="detail" data-id="${t.id}">Detail</button>
        ${t.status === "FAILED" ? `<span class="hanya-owner"><button class="btn btn-kecil" data-aksi="ulang" data-id="${t.id}">Coba lagi</button></span>` : ""}</td></tr>`).join("")
      : `<tr><td colspan="6" class="kosong">Belum ada tugas. Kirim perintah ke Jarvis di atas.</td></tr>`;

    // token
    const per = s.token.per_agent, maks = Math.max(1, ...per.map(t => (t.masuk || 0) + (t.keluar || 0)));
    M.$("#tokenTgl").textContent = s.token.tanggal;
    M.$("#tokenBar").innerHTML = per.length ? per.slice(0, 10).map(t => { const n = (t.masuk || 0) + (t.keluar || 0), a = A[t.agent];
      return `<div class="batang" title="${esc([].concat(t.model || []).join(", "))}"><span class="siapa" style="display:flex;gap:6px;align-items:center">${img(t.agent)}${esc(t.agent)}</span><span class="bar"><i style="width:${n / maks * 100}%;background:${a ? M.warna(a.divisi) : "#999"}"></i></span><span>${M.ringkas(n)}</span></div>`; }).join("")
      : `<p class="kosong">Belum ada pemakaian token hari ini.</p>`;
    M.$("#metrikKet").textContent = s.psutil ? (M.pratinjau ? "contoh" : "3 detik sekali") : "psutil belum terpasang";
    const m = s.metrik; grafik(m);
    if (m.length) { M.$("#cpuNow").textContent = Math.round(m[m.length - 1].cpu) + "%"; M.$("#ramNow").textContent = Math.round(m[m.length - 1].ram) + "%"; }

    // log
    const k = M.$("#konsol"), bawah = k.scrollHeight - k.scrollTop - k.clientHeight < 30;
    s.log.forEach(l => { if (l.id <= logAda) return; logAda = l.id;
      const d = document.createElement("div"); d.className = "l-" + l.level;
      d.innerHTML = `<span class="w">${esc(M.jam(l.waktu) || l.waktu)}</span> <span class="a">${esc(l.agent)}</span> ${esc(l.teks)}`; k.appendChild(d); });
    while (k.children.length > 300) k.firstChild.remove();
    if (bawah) k.scrollTop = k.scrollHeight;
  }
  async function segarkan() { try { gambar(await M.segarkan()); M.navLive(null); } catch (e) { /* tunggu putaran berikutnya */ } }
  M.mulaiLive((s, err) => { M.navLive(err); if (s) gambar(s); }, 2000);
  window.addEventListener("resize", () => M.snapshot && grafik(M.snapshot.metrik));
})();
