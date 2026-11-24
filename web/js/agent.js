/* =====================================================================
   AGENT.JS · dashboard skill tiap agent
   Kartu ringkas di kisi, klik kartu -> laci detail (kemampuan, input/output,
   alat, rekan kerja, riwayat tugas). Alamat agent.html#Kevin langsung membuka Kevin.
   ===================================================================== */
(async function () {
  "use strict";
  const M = window.MARKAS, P = window.PIXEL, esc = M.esc;
  try { await M.muat(); } catch (e) { M.navLive(e); M.$("#kisi").innerHTML = `<p class="kosong">${esc(e.message)}</p>`; return; }
  const A = M.agent;
  const img = (id, s = 3) => A[id] ? `<img class="pixel" src="${P.url(A[id], s)}" alt="" width="14" height="21">` : "";
  const saring = { divisi: "semua", teks: "", urut: "lantai" };

  // ---------- chip divisi ----------
  const hitungDiv = {};
  M.urutan.forEach(id => { hitungDiv[A[id].divisi] = (hitungDiv[A[id].divisi] || 0) + 1; });
  M.$("#chipDivisi").innerHTML = `<button aria-pressed="true" data-d="semua">Semua <em>${M.urutan.length}</em></button>` +
    M.tim.divisi.map(d => `<button aria-pressed="false" data-d="${d.id}"><i class="titik" style="background:${d.warna}"></i>${esc(d.nama)} <em>${hitungDiv[d.id] || 0}</em></button>`).join("");
  M.$("#chipDivisi").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    saring.divisi = b.dataset.d;
    M.$$("#chipDivisi button").forEach(x => x.setAttribute("aria-pressed", x === b));
    gambar();
  });
  M.$("#cari").addEventListener("input", e => { saring.teks = e.target.value.trim().toLowerCase(); gambar(); });
  M.$("#urut").addEventListener("change", e => { saring.urut = e.target.value; gambar(); });

  // ---------- kartu ----------
  function kartu(a) {
    const bintang = a.manajer ? `<span class="bintang" title="Manajer">★</span>` : "";
    return `<button class="kartu-agent" data-id="${a.id}" style="--wd:${M.warna(a.divisi)}" aria-label="Buka detail ${esc(a.id)}">
      <span class="foto">${img(a.id, 3)}</span>
      <span class="nama">${esc(a.id)}${bintang}</span>
      <span class="jab">${esc(a.jabatan)}</span>
      <span class="baris-chip">${a.aktif ? '<span class="chip chip-aktif" title="Benar-benar menjalankan tugas di Markas 2.0">Aktif 2.0</span>' : ""}<span class="chip ${M.kelasStatus(a.status_label)}">${esc(a.status_label)}</span>${a.model && a.model !== "-" ? `<span class="chip">${esc(a.model)}</span>` : ""}</span>
      <span class="skill">${esc(a.tugas_pokok)}</span>
      <span class="bawah"><span>${esc(M.namaRuang(a.ruang))} · Lt ${a.lantai}</span>${M.lencanaKeadaan(a)}</span>
    </button>`;
  }
  const cocok = a => {
    if (saring.divisi !== "semua" && a.divisi !== saring.divisi) return false;
    if (!saring.teks) return true;
    return [a.id, a.jabatan, a.tugas_pokok, a.alat, a.input, a.output, (a.alias || []).join(" "), a.model, a.status_label]
      .join(" ").toLowerCase().includes(saring.teks);
  };
  function gambar() {
    const daftar = M.urutan.map(id => A[id]).filter(cocok);
    let grup;
    if (saring.urut === "divisi") grup = M.tim.divisi.map(d => ({ judul: d.nama, warna: d.warna, isi: daftar.filter(a => a.divisi === d.id) }));
    else if (saring.urut === "prioritas") grup = ["Pakai sekarang", "Saat perlu / mingguan", "Parkir dulu", "-"].map(p => ({
      judul: p === "-" ? "Owner" : p, warna: p.startsWith("Pakai") ? "#1f9d63" : p.startsWith("Saat") ? "#e8a317" : "#b8b0a0", isi: daftar.filter(a => a.prioritas === p) }));
    else grup = [...M.gedung.lantai].map(l => ({ judul: `Lantai ${l.no} · ${l.nama}`, warna: l.warna, isi: daftar.filter(a => a.lantai === l.no), ket: l.julukan }));
    grup = grup.filter(g => g.isi.length);
    M.$("#kisi").innerHTML = grup.map(g => `<h2 class="grup-judul"><i class="titik" style="background:${g.warna}"></i>${esc(g.judul)} <small>${g.isi.length} agent${g.ket ? " · " + esc(g.ket) : ""}</small></h2>
      <div class="kisi-agent">${g.isi.map(kartu).join("")}</div>`).join("");
    M.$("#kosong").hidden = daftar.length > 0;
  }
  gambar();
  M.$("#kisi").addEventListener("click", e => { const k = e.target.closest(".kartu-agent"); if (k) location.hash = k.dataset.id; });

  // ---------- laci detail ----------
  const laci = M.$("#laci"), latar = M.$("#laciLatar");
  let terbuka = null;
  function tutup() { laci.classList.remove("buka"); latar.classList.remove("buka"); laci.setAttribute("aria-hidden", "true"); terbuka = null; if (location.hash) history.replaceState(null, "", location.pathname); }
  latar.addEventListener("click", tutup);
  laci.addEventListener("click", e => { if (e.target.closest(".laci-tutup")) tutup(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && terbuka) tutup(); });

  const relasi = list => list.length ? `<ul>${list.map(r => `<li>${img(r.agent, 2)}<span><a href="#${esc(r.agent)}">${esc(r.agent)}</a> <span>${esc(r.label)}</span></span></li>`).join("")}</ul>` : `<p class="kosong">-</p>`;
  const alat = s => (s && s !== "-") ? s.split(/,\s*(?![^()]*\))/).map(x => `<code>${esc(x.trim())}</code>`).join("") : `<span class="kosong">Tidak memakai alat (manusia)</span>`;

  async function buka(id) {
    id = M.urutan.find(x => x.toLowerCase() === (id || "").toLowerCase());
    if (!id) return;
    terbuka = id;
    const a = A[id];
    laci.style.setProperty("--wd", M.warna(a.divisi));
    laci.innerHTML = kerangka(a, null);
    laci.classList.add("buka"); latar.classList.add("buka"); laci.setAttribute("aria-hidden", "false");
    laci.scrollTop = 0; M.$(".laci-tutup", laci).focus();
    try { const p = await M.profil(id); if (terbuka === id) laci.innerHTML = kerangka(a, p); }
    catch (e) { /* biarkan kerangka dasar */ }
  }
  function kerangka(a, p) {
    const div = M.divisi[a.divisi] || {};
    const tugas = p && p.tugas.length ? `<ul class="riwayat">${p.tugas.map(t => `<li><time><a href="kontrol.html#tugas=${t.id}">#${t.id}</a></time><span>${M.lencanaStatus(t)} ${esc(t.judul)}</span></li>`).join("")}</ul>` : `<p class="kosong">${a.aktif ? "Belum ada tugas tercatat." : "Agent ini belum aktif di Markas 2.0, jadi belum menerima tugas."}</p>`;
    const tok = p ? p.token : { masuk: 0, keluar: 0, panggilan: 0 };
    return `
    <div class="laci-kepala">
      <button class="laci-tutup" aria-label="Tutup">×</button>
      <span class="foto-besar">${img(a.id, 6)}</span>
      <div>
        <span class="chip"><i class="titik" style="background:${div.warna}"></i>${esc(div.nama || a.divisi)}</span>
        <h2>${esc(a.id)}${a.manajer ? ' <span style="color:var(--emas)">★</span>' : ""}</h2>
        <p class="jab">${esc(a.jabatan)}</p>
        <div class="baris-chip" style="display:flex;gap:6px;flex-wrap:wrap">
          <span class="chip ${M.kelasStatus(a.status_label)}">${esc(a.status_label)}</span>
          ${a.prioritas !== "-" ? `<span class="chip ${M.kelasPrioritas(a.prioritas)}">${esc(a.prioritas)}</span>` : ""}
          ${M.lencanaKeadaan(a)}
          ${a.aktif ? '<span class="chip chip-aktif">Aktif 2.0</span>' : '<span class="chip">Belum aktif di 2.0</span>'}
        </div>
      </div>
    </div>
    <div class="laci-isi">
      ${a.pesan ? `<div class="kartu blok"><h3>Sedang dikerjakan</h3><p>${esc(a.pesan)}</p></div>` : ""}
      <div class="kartu blok"><h3>Kemampuan</h3><p>${esc(a.tugas_pokok)}</p></div>
      <div class="kartu blok"><h3>Masuk → keluar</h3>
        <div class="io"><div class="kotak"><small>MENERIMA</small>${esc(a.input || "-")}</div><span class="panah"></span>
        <span class="tengah">${img(a.id, 2)}</span><span class="panah"></span><div class="kotak"><small>MENGHASILKAN</small>${esc(a.output || "-")}</div></div>
      </div>
      <div class="kartu blok"><h3>Alat yang boleh dipakai</h3><div class="alat">${alat(a.alat)}</div></div>
      <div class="fakta">
        <div class="kartu"><small>Otak AI</small><b>${esc(a.model || "-")}</b></div>
        <div class="kartu"><small>Jenis</small><b>${a.jenis === "CC" ? "Sub-agent CC" : a.jenis === "PY" ? "Skrip Python" : esc(a.jenis)}</b></div>
        <div class="kartu"><small>Lapor ke</small><b>${a.lapor_ke ? `<a href="#${esc(a.lapor_ke)}">${esc(a.lapor_ke)}</a>` : "-"}</b></div>
        <div class="kartu"><small>Ruangan</small><b>${esc(M.namaRuang(a.ruang))}</b></div>
        <div class="kartu"><small>Lantai</small><b>${a.lantai}</b></div>
        <div class="kartu"><small>Token total</small><b>${M.ringkas((tok.masuk || 0) + (tok.keluar || 0))}</b></div>
      </div>
      <div class="kartu blok"><h3>Rekan kerja</h3>
        <div class="relasi"><div><h3 style="margin-top:4px">Menerima dari</h3>${p ? relasi(p.menerima_dari) : "…"}</div>
        <div><h3 style="margin-top:4px">Mengirim ke</h3>${p ? relasi(p.mengirim_ke) : "…"}</div></div>
        ${p && p.anak_buah.length ? `<h3 style="margin-top:14px">Anak buah</h3><div style="display:flex;gap:4px;flex-wrap:wrap">${p.anak_buah.map(x => `<a href="#${x}" title="${x}">${img(x, 2)}</a>`).join("")}</div>` : ""}
      </div>
      <div class="kartu blok"><h3>Kondisi & alias</h3><p style="font-size:14px">${esc(a.kondisi || "-")}</p>
        ${(a.alias || []).length ? `<div class="alat" style="margin-top:8px">${a.alias.map(x => `<code>${esc(x)}</code>`).join("")}</div>` : ""}</div>
      <div class="kartu blok"><h3>Tugas terakhir</h3>${p ? tugas : "…"}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn btn-utama" href="markas.html#agent=${encodeURIComponent(a.id)}">Lihat di gedung 3D</a>
        ${a.aktif && a.id !== "Vera" ? `<a class="btn" href="kontrol.html">Beri ${a.id === "Jarvis" ? "perintah" : "tugas"}</a>` : ""}
      </div>
    </div>`;
  }
  const dariHash = () => { const h = decodeURIComponent(location.hash.slice(1)); if (h) buka(h); else if (terbuka) tutup(); };
  window.addEventListener("hashchange", dariHash);
  dariHash();

  // ---------- status live: perbarui lencana di kartu ----------
  M.mulaiLive((s, err) => {
    M.navLive(err);
    if (!s) return;
    M.$$(".kartu-agent").forEach(k => { const el = M.$(".keadaan", k); if (el) el.outerHTML = M.lencanaKeadaan(A[k.dataset.id]); });
  }, 4000);
})();
