/* =====================================================================
   CREW.JS · halaman Kenali Crew
   Kartu setiap agent + status sekarang (live dari database, atau contoh).
   Klik kartu: detail + riwayat tugas (live: GET /api/agent/{nama}).
   ===================================================================== */
(function () {
  "use strict";
  const { $, esc } = U;
  let divisiAktif = "semua";

  const KEADAAN = {
    kerja: { teks: "kerja", warna: "var(--s-kerja)" },
    menunggu: { teks: "menunggu", warna: "var(--s-menunggu)" },
    santai: { teks: "santai", warna: "var(--s-santai)" },
  };
  const statusHtml = id => {
    const s = U.status[id] || {}, k = KEADAAN[s.keadaan] || KEADAAN.santai;
    return `<span class="status-titik" style="--w:${k.warna}" title="${esc(s.pesan || "")}">${k.teks}</span>`;
  };

  function siapkanFilter() {
    const semua = U.agent;
    const chip = (id, nama, warna, jml) =>
      `<button type="button" data-divisi="${esc(id)}" aria-pressed="${id === divisiAktif}" style="--w:${warna}"><i></i>${esc(nama)} <span>${jml}</span></button>`;
    $("#filter").innerHTML = chip("semua", "Semua", "var(--emas)", semua.length) +
      Object.values(U.divisi).map(d => chip(d.id, d.nama, d.warna, semua.filter(a => a.divisi === d.id).length)).join("");
    $("#judul-crew").textContent = `${semua.filter(a => !a.owner).length} agent, ${Object.keys(U.divisi).length} divisi, satu atasan.`;
  }
  $("#filter").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    divisiAktif = b.dataset.divisi;
    $("#filter").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    gambar();
  });
  $("#cari").addEventListener("input", gambar);

  function gambar() {
    const q = $("#cari").value.trim().toLowerCase();
    const hasil = U.agent.filter(a =>
      (divisiAktif === "semua" || a.divisi === divisiAktif) &&
      (!q || `${a.id} ${a.jabatan} ${a.tugas || ""}`.toLowerCase().includes(q)));
    $("#grid-crew").innerHTML = hasil.length ? hasil.map((a, i) => `
      <button class="kartu-agent" type="button" data-id="${esc(a.id)}" style="--w:${U.warna(a.divisi)};--jeda:${Math.min(i, 8)}" data-muncul>
        <span class="keadaan" data-status="${esc(a.id)}">${statusHtml(a.id)}</span>
        <div class="foto"><img class="pixel" src="${U.ava(a.id, 3)}" alt=""></div>
        <div>
          <h3>${esc(a.id)}</h3>
          <div class="jab">${esc(a.jabatan)}</div>
          <div class="meta">
            ${a.owner ? '<span class="pil pil-emas">Owner</span>' : a.manajer ? '<span class="pil pil-emas">Manajer</span>' : ""}
            <span class="pil">${esc(U.namaDivisi(a.divisi))}</span>
            ${a.model && a.model !== "-" ? `<span class="pil">${esc(a.model)}</span>` : ""}
          </div>
        </div>
      </button>`).join("") : '<p class="kosong">Tidak ada agent yang cocok.</p>';
    document.querySelectorAll("#grid-crew [data-muncul]").forEach(U.amati || (el => el.classList.add("tampak")));
  }

  // perbarui titik status tanpa menggambar ulang semua kartu
  function perbaruiStatus() {
    document.querySelectorAll("[data-status]").forEach(el => { el.innerHTML = statusHtml(el.dataset.status); });
  }

  // ---------- detail ----------
  const dialog = $("#detail");
  async function bukaDetail(id) {
    const a = U.peta[id];
    if (!a) return;
    let profil = null;
    if (U.live) { try { profil = await U.api("/api/agent/" + encodeURIComponent(id)); } catch (e) { /* tampilkan data dasar saja */ } }
    const anak = U.agent.filter(x => x.lapor_ke === a.id);
    const lantai = U.lantai.find(l => l.no === U.lantaiAgent(a)) || {};
    const s = U.status[id] || {};
    const link = n => `<a href="#" data-buka="${esc(n)}">${esc(n)}</a>`;
    const tugas = profil && profil.tugas && profil.tugas.length
      ? `<h4>Tugas terakhir</h4><ul class="daftar-riwayat">${profil.tugas.map(t => `<li><time>MC-${t.id}</time><span>${esc(t.judul)} · <b>${esc(t.status)}</b></span></li>`).join("")}</ul>` : "";
    $("#isi-detail").innerHTML = `
      <div class="dialog-kepala" style="--w:${U.warna(a.divisi)}">
        <img class="pixel" src="${U.ava(a.id, 4)}" alt="">
        <div><h2 id="nama-detail">${esc(a.id)}</h2><div class="sub">${esc(a.jabatan)}</div><div style="margin-top:8px">${statusHtml(id)}</div></div>
      </div>
      <div class="dialog-isi">
        <dl>
          <dt>Tugas pokok</dt><dd>${esc(a.tugas || "-")}</dd>
          ${s.pesan ? `<dt>Sedang</dt><dd>${esc(s.pesan)}</dd>` : ""}
          <dt>Lapor ke</dt><dd>${a.lapor_ke ? link(a.lapor_ke) : "Tidak ada (pemilik)"}</dd>
          ${anak.length ? `<dt>Tim</dt><dd>${anak.map(x => link(x.id)).join(", ")}</dd>` : ""}
          <dt>Divisi</dt><dd>${esc(U.namaDivisi(a.divisi))}</dd>
          <dt>Lantai</dt><dd>${esc((lantai.no || "-") + " · " + (lantai.nama || ""))}</dd>
          <dt>Model AI</dt><dd>${esc(a.model || "-")}${s.aktif ? " · <b style='color:var(--s-selesai)'>aktif di Markas 2.0</b>" : ""}</dd>
          ${a.input ? `<dt>Masukan</dt><dd>${esc(a.input)}</dd>` : ""}
          ${a.output ? `<dt>Hasil</dt><dd>${esc(a.output)}</dd>` : ""}
          ${a.tools ? `<dt>Alat</dt><dd>${esc(a.tools)}</dd>` : ""}
        </dl>
        ${tugas}
      </div>`;
    if (!dialog.open) dialog.showModal();
  }
  $("#grid-crew").addEventListener("click", e => { const k = e.target.closest(".kartu-agent"); if (k) bukaDetail(k.dataset.id); });
  $("#isi-detail").addEventListener("click", e => { const l = e.target.closest("[data-buka]"); if (l) { e.preventDefault(); bukaDetail(l.dataset.buka); } });
  dialog.addEventListener("click", e => { if (e.target === dialog || e.target.closest("[data-tutup]")) dialog.close(); });

  siapkanFilter(); gambar();
  U.siap.then(() => { siapkanFilter(); gambar(); U.ikutiStatus(perbaruiStatus); });
})();
