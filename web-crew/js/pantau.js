/* =====================================================================
   PANTAU.JS · token, biaya, beban laptop, dan log (gaya Langfuse sederhana)
   Live: dari /api/snapshot (tabel token, metrik, log). Demo: angka contoh.
   ===================================================================== */
(function () {
  "use strict";
  const { $, esc } = U;
  const rupiahUsd = n => "$" + (n || 0).toFixed(2).replace(".", ",");

  function batang(perAgent) {
    const maks = Math.max(1, ...perAgent.map(a => a.masuk + a.keluar));
    $("#p-jml-agent").textContent = perAgent.length + " agent";
    $("#p-batang").innerHTML = perAgent.length ? perAgent.map(a => {
      const ag = U.peta[a.agent] || {}, n = a.masuk + a.keluar;
      return `<div class="batang" style="--w:${U.warna(ag.divisi)}" title="${esc(a.agent)}: ${U.angka(a.masuk)} masuk, ${U.angka(a.keluar)} keluar, ${a.panggilan} panggilan">
        <span class="nama">${U.peta[a.agent] ? `<img class="pixel" src="${U.ava(a.agent, 2)}" alt="">` : ""}${esc(a.agent)}</span>
        <span class="jalur"><span class="isi" style="width:${(n / maks * 100).toFixed(1)}%"></span></span>
        <span class="nilai">${U.ringkas(n)}</span></div>`;
    }).join("") : '<p class="kosong">Belum ada token tercatat hari ini.</p>';
  }

  function grafik(metrik) {
    const svg = $("#p-grafik");
    if (!metrik.length) { svg.innerHTML = '<text x="150" y="64" text-anchor="middle" fill="#8f8775" font-size="11">Belum ada data (psutil belum terpasang?)</text>'; return; }
    const garis = kunci => metrik.map((m, i) => `${(i / Math.max(1, metrik.length - 1) * 300).toFixed(1)},${(116 - (m[kunci] || 0) / 100 * 112).toFixed(1)}`).join(" ");
    svg.innerHTML = [25, 50, 75].map(v => `<line x1="0" x2="300" y1="${116 - v * 1.12}" y2="${116 - v * 1.12}" stroke="#34302a" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join("") +
      `<polyline points="${garis("ram")}" fill="none" stroke="#2ec4b6" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>` +
      `<polyline points="${garis("cpu")}" fill="none" stroke="#e8a317" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
    const akhir = metrik[metrik.length - 1];
    $("#p-cpu-ram").textContent = `CPU ${Math.round(akhir.cpu)}% · RAM ${Math.round(akhir.ram)}%`;
  }

  function log(daftar) {
    $("#p-log").innerHTML = daftar.length ? [...daftar].reverse().slice(0, 60).map(l =>
      `<div><time>${esc(U.jam(l.waktu))}</time><span class="${esc(l.level)}">${esc(l.agent)}</span><span>${esc(l.teks)}</span></div>`).join("")
      : '<p class="kosong">Belum ada catatan.</p>';
  }

  function tampil(s) {
    const usd = s.token.per_agent.reduce((n, a) => n + (a.biaya_usd || 0), 0);
    U.hitung($("#p-token"), s.token.total);
    $("#p-tanggal").textContent = s.token.tanggal || "hari ini";
    $("#p-biaya").textContent = rupiahUsd(usd);
    U.hitung($("#p-panggilan"), s.token.per_agent.reduce((n, a) => n + a.panggilan, 0));
    U.hitung($("#p-selesai"), s.statistik.tugas.APPROVED || 0);
    $("#p-gagal").textContent = (s.statistik.tugas.FAILED || 0) + " gagal";
    $("#p-mode").textContent = s.mode;
    $("#p-worker").textContent = s.worker && s.worker.hidup ? "worker hidup" : s.mode === "DEMO" ? "server mode demo" : "worker belum jalan";
    batang(s.token.per_agent);
    grafik(s.metrik || []);
    log(s.log || []);
  }

  // ---------- data contoh untuk mode demo ----------
  const demo = { metrik: [], log: [], token: {} };
  function langkahDemo() {
    const ai = U.agent.filter(a => !a.owner);
    for (let i = 0; i < 3; i++) {
      const a = ai[Math.floor(Math.random() * ai.length)];
      const t = demo.token[a.id] || (demo.token[a.id] = { agent: a.id, masuk: 0, keluar: 0, panggilan: 0, biaya_usd: 0 });
      const m = 800 + Math.random() * 8000, k = 200 + Math.random() * 2400;
      t.masuk += m; t.keluar += k; t.panggilan++; t.biaya_usd += (m * 3 + k * 15) / 1e6;
      if (Math.random() < .4) demo.log.push({ waktu: new Date().toISOString().replace("T", " ").slice(0, 19), agent: a.id, level: ["info", "ok", "warn"][Math.floor(Math.random() * 3)], teks: "[CONTOH] " + ["mulai tugas", "selesai, kirim ke QA", "menunggu OK Cell", "token tercatat"][Math.floor(Math.random() * 4)] });
    }
    const akhir = demo.metrik[demo.metrik.length - 1] || { cpu: 30, ram: 55 };
    demo.metrik.push({ cpu: Math.max(3, Math.min(97, akhir.cpu + (Math.random() - .5) * 18)), ram: Math.max(30, Math.min(90, akhir.ram + (Math.random() - .5) * 4)) });
    if (demo.metrik.length > 120) demo.metrik.shift();
    const per = Object.values(demo.token).sort((a, b) => (b.masuk + b.keluar) - (a.masuk + a.keluar));
    tampil({
      token: { total: per.reduce((n, a) => n + a.masuk + a.keluar, 0), tanggal: "contoh", per_agent: per },
      statistik: { tugas: { APPROVED: 7, FAILED: 1 } }, mode: "DEMO", worker: { hidup: false }, metrik: demo.metrik, log: demo.log.slice(-60),
    });
  }

  U.siap.then(({ live }) => {
    if (live && U.snapshot) {
      $("#ket-pantau").textContent = "Langsung dari database Markas Cell, diperbarui setiap 4 detik.";
      tampil(U.snapshot);
      document.addEventListener("markas:snapshot", e => tampil(e.detail));
    } else {
      $("#ket-pantau").textContent = "Mode demo: server belum menyala, jadi angka di bawah adalah contoh yang bergerak sendiri. Jalankan MULAI.bat untuk data asli.";
      for (let i = 0; i < 40; i++) langkahDemo();
      setInterval(langkahDemo, 3000);
    }
  });
})();
