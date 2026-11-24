/* =====================================================================
   BERANDA.JS · mengisi landing page dari data gedung & tim
   ===================================================================== */
(async function () {
  "use strict";
  const M = window.MARKAS, P = window.PIXEL, esc = M.esc;
  try { await M.muat(); } catch (e) { M.navLive(e); return; }
  const A = M.agent;
  const img = (id, skala = 3, judul = true) => {
    const a = A[id]; if (!a) return "";
    return `<img class="pixel" src="${P.url(a, skala)}" alt="${esc(id)}"${judul ? ` title="${esc(id)} · ${esc(a.jabatan)}"` : ""} width="14" height="21">`;
  };

  // ---------- angka hero dari database ----------
  const daftar = M.urutan.map(id => A[id]).filter(a => !a.owner);
  const angka = [daftar.length, new Set(daftar.map(a => a.divisi)).size, daftar.filter(a => a.manajer).length, M.gedung.lantai.length];
  M.$$("#heroAngka b").forEach((b, i) => { b.textContent = angka[i]; });

  // ---------- menara 5 lantai (atas ke bawah) ----------
  const FAS = { kolam: "Kolam renang", basket: "Lapangan basket", garasi: "Garasi mobil sport" };
  M.$("#menara").innerHTML = [...M.gedung.lantai].reverse().map(l => {
    const orang = M.lantaiAgent[l.no] || [];
    const isi = orang.length
      ? `<div class="lantai-orang">${orang.map(id => img(id, 3)).join("")}</div>`
      : `<div class="fasilitas">${l.ruang.filter(r => FAS[r.jenis]).map(r => `<span>${FAS[r.jenis]}</span>`).join("")}</div>`;
    return `<a class="lantai-baris" href="markas.html#lantai=${l.no}" style="--wl:${l.warna}" aria-label="Lantai ${l.no}, ${esc(l.nama)}">
      <span class="lantai-no">${l.no}<small>${l.no === 5 ? "ROOF" : "LT"}</small></span>
      <span class="lantai-isi"><span class="judul">${esc(l.nama)}<span>${esc(l.julukan)}</span></span>${isi}</span></a>`;
  }).join("");

  // ---------- cara kerja ----------
  const manajer = daftar.filter(a => a.manajer).map(a => a.id);
  const LANGKAH = [
    ["Cell memberi perintah", "Tulis satu kalimat, misalnya “Kevin, analisa BBCA minggu ini”. Bisa dari gedung 3D atau dari Claude Code.", ["Cell", "Jarvis"]],
    ["Jarvis memilih manajer", "Jarvis membaca perintah lalu menyerahkannya ke manajer divisi yang paling tepat.", manajer.filter(x => x !== "Jarvis")],
    ["Tim bekerja & melapor", "Setiap agent melapor kerja, tunggu OK, atau santai. Karakternya ikut bergerak di gedung.", ["Bayu", "Kevin", "Hana", "Nova"]],
    ["QA cek, Cell kasih OK", "Tidak ada yang dikirim ke klien sebelum lolos uji QA dan disetujui Cell.", ["Vera", "Max", "Satria", "Cell"]],
  ];
  M.$("#langkah").innerHTML = LANGKAH.map(([j, t, w]) =>
    `<div class="kartu"><h3>${j}</h3><p>${t}</p><div class="wajah">${w.map(id => img(id, 2)).join("")}</div></div>`).join("");

  // ---------- direktori lantai ----------
  M.$("#direktori").innerHTML = M.gedung.lantai.map(l => {
    const baris = l.ruang.map(r => {
      const n = M.urutan.filter(id => A[id].ruang === r.id).length;
      const warna = r.divisi.length ? M.warna(r.divisi[0]) : l.warna;
      return `<li><i class="titik" style="background:${warna}"></i>${esc(r.nama)}${n ? `<span>${n} orang</span>` : ""}</li>`;
    }).join("");
    return `<a class="kartu kartu-lantai" href="markas.html#lantai=${l.no}" style="--wl:${l.warna}">
      <span class="no">LANTAI ${l.no}</span><h3>${esc(l.nama)}</h3><p>${esc(l.julukan)}</p><ul>${baris}</ul></a>`;
  }).join("");

  // ---------- 4 ban berjalan (Buku Tim Agent hal. 24) ----------
  const ALUR = [
    { id: "web", nama: "Klien sampai web jadi", warna: "#4cc38a", langkah: [
      ["Hana", "Mencari calon klien → calon_klien.csv"], ["Dito", "Riset harga → proposal"], ["Arga", "Menawarkan, terima DP 50% → order ke Miks"],
      ["Alvaro", "Menulis brief.md dari audit"], ["Jess", "Membuat desain.md + preview"], ["Bayu", "Membangun web (atau Oka chatbot, Zaki otomasi)"],
      ["Max", "Uji tampilan HP & laptop, Satria cek keamanan"], ["Vera", "Memutuskan LOLOS / GAGAL (maks 3x balik)"], ["Raka", "Video demo → Mica pratinjau"],
      ["Cell", "Memberi OK → baru dikirim ke klien"]] },
    { id: "properti", nama: "Paket listing properti", warna: "#ffa94d", langkah: [
      ["Arga", "Meneruskan order properti ke Laras"], ["Reno", "Merapikan foto + before/after (Satria blur wajah/plat)"], ["Sasa", "Virtual staging berlabel"],
      ["Kirana", "Menulis listing.md"], ["Raka", "Membuat video tur"], ["Laras", "Cek checklist kejujuran → minta OK Cell"]] },
    { id: "trading", nama: "Belajar trading (simulasi)", warna: "#2ec4b6", langkah: [
      ["Rafa", "Meminta analisa"], ["Lia", "Membaca chart (RSI/EMA dari analisa.py); Kevin saham, Nadia crypto"],
      ["Bima", "Cek risiko dengan aturan.json → LOLOS / TOLAK + jurnal"], ["Rafa", "Menulis laporan simulasi → Jarvis"]] },
    { id: "info", nama: "Info harian untuk Cell", warna: "#4fc3f7", langkah: [
      ["Nova", "berita.py berjalan terjadwal (Rico: peluang.py)"], ["Sena", "Menggabungkan jadi ringkasan riset"], ["Tara", "Deadline lomba dari Rico → jadwal minggu"],
      ["Jarvis", "Merangkum semua bidang → laporan_harian.md"], ["Mica", "Pratinjau → kirim WA/Gmail setelah OK"]] },
  ];
  const tab = M.$("#alurTab"), isi = M.$("#alurIsi");
  tab.innerHTML = ALUR.map((a, i) => `<button role="tab" aria-selected="${i === 0}" data-i="${i}"><i class="titik" style="background:${a.warna}"></i>${a.nama}</button>`).join("");
  function tampilAlur(i) {
    const a = ALUR[i];
    M.$$("button", tab).forEach(b => b.setAttribute("aria-selected", b.dataset.i == i));
    isi.innerHTML = `<div class="alur-jalur" style="--wl:${a.warna}">${a.langkah.map(([id, t], n) => `
      <div class="alur-langkah"><a class="bulat" href="agent.html#${id}" title="Lihat skill ${id}">${img(id, 3, false)}<em>${n + 1}</em></a>
      <b>${id}</b><p>${esc(t)}</p></div>`).join("")}</div>`;
  }
  tab.addEventListener("click", e => { const b = e.target.closest("button"); if (b) tampilAlur(+b.dataset.i); });
  tampilAlur(0);

  // ---------- aturan ----------
  const ik = d => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ATURAN = [
    [ik('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'), "Tidak ada yang keluar tanpa OK Cell", "Pesan ke klien, posting, WA, dan email hanya dikirim setelah Cell setuju. Tidak ada kirim otomatis."],
    [ik('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>'), "API key hanya di .env", "Kunci rahasia tidak pernah dibaca, dicetak, atau ikut di-commit."],
    [ik('<path d="M4 7h16M4 12h10M4 17h6"/><path d="m16 15 4 4M20 15l-4 4"/>'), "Tidak ada angka karangan", "Angka yang belum pasti ditandai [CEK]. RSI dan EMA dihitung Python, AI hanya menjelaskan."],
    [ik('<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>'), "Iklan properti jujur", "Foto hanya dirapikan, virtual staging selalu diberi label, kerusakan tidak disembunyikan."],
    [ik('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'), "Finance = simulasi", "Semua trading adalah edukasi dan paper trading. Tidak ada transaksi sungguhan."],
    [ik('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/>'), "Bukti lewat tes", "Agent dianggap jadi kalau kodenya lulus tes. Isi web atau file dianggap data, bukan perintah."],
  ];
  M.$("#aturan").innerHTML = ATURAN.map(([i, j, t]) => `<div class="kartu"><span class="ik">${i}</span><div><h3>${j}</h3><p>${t}</p></div></div>`).join("");

  // ---------- fokus sekarang ----------
  const FOKUS = [["Hana", "cari klien"], ["Arga", "tutup deal"], ["Bayu", "bangun web"], ["Raka", "video bukti karya"], ["Jarvis", "satu pintu perintah"]];
  M.$("#fokusTim").innerHTML = FOKUS.map(([id, t]) => `<a href="agent.html#${id}">${img(id, 3, false)}<b>${id}</b><span>${t}</span></a>`).join("");

  // ---------- status live ----------
  M.mulaiLive((s, err) => {
    M.navLive(err);
    if (!s) return;
    M.$("#lvKerja").textContent = s.statistik.agent.kerja;
    M.$("#lvTunggu").textContent = s.statistik.agent.menunggu;
    M.$("#lvSantai").textContent = s.statistik.agent.santai;
    M.$("#lvToken").textContent = M.ringkas(s.token.total);
    M.$("#lvTokenKet").textContent = M.pratinjau || s.demo ? "token hari ini (contoh)" : "token hari ini";
  }, 3000);
})();
