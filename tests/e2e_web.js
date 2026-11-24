// Tes ujung-ke-ujung WEB BARU (gaya CrewAI) di browser sungguhan (Playwright + Chromium).
// Menyalakan server + worker adapter UJI di folder sementara, lalu memeriksa:
//   semua halaman terbuka tanpa error -> masuk owner -> kirim perintah -> tunggu QA lulus
//   -> buka detail -> minta revisi -> setujui -> APPROVED -> crew & pantau membaca data live
// Tidak memanggil AI sungguhan dan tidak menyentuh data/markas.db.
// Jalankan:  node tests/e2e_web.js            (perlu: npm i playwright && npx playwright install chromium)
// Tambahkan folder untuk menyimpan screenshot: node tests/e2e_web.js hasil_layar
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), net = require("net");

const PROYEK = path.resolve(__dirname, "..");
const PY = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const FOLDER_LAYAR = process.argv[2];

const portKosong = () => new Promise(ok => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const tidur = ms => new Promise(r => setTimeout(r, ms));
function cek(kondisi, pesan) { if (!kondisi) throw new Error("GAGAL: " + pesan); console.log("  ok  " + pesan); }

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "markas-web-"));
  fs.mkdirSync(path.join(tmp, "data"));
  for (const f of ["tim.json", "gedung.json", "profil.json"]) fs.copyFileSync(path.join(PROYEK, "data", f), path.join(tmp, "data", f));
  const env = { ...process.env, MARKAS_DATA: path.join(tmp, "data"), MARKAS_ENV: path.join(tmp, ".env"), MARKAS_HASIL: path.join(tmp, "hasil"), MARKAS_ADAPTER: "uji" };
  const port = await portKosong(), alamat = `http://127.0.0.1:${port}`;
  const proses = [];
  const jalankan = arg => { const p = spawn(PY, arg, { cwd: PROYEK, env, stdio: "ignore" }); proses.push(p); return p; };
  let browser, gagal = false;
  try {
    jalankan(["backend/main.py", "--tanpa-browser", "--port", String(port)]);
    for (let i = 0; i < 100; i++) { try { if ((await fetch(alamat + "/api/health")).ok) break; } catch {} await tidur(100); }
    jalankan(["backend/worker.py", "--adapter", "uji", "--jeda", "0.5"]);
    const kunci = fs.readFileSync(path.join(tmp, ".env"), "utf8").match(/MARKAS_KUNCI_OWNER=(.+)/)[1].trim();

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errorHalaman = [];
    page.on("pageerror", e => errorHalaman.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/fonts\.g|status of 401/.test(m.text())) errorHalaman.push("console: " + m.text()); });
    page.on("dialog", d => { errorHalaman.push("dialog: " + d.message()); d.dismiss(); });

    console.log("1. semua halaman terbuka");
    for (const h of ["/", "/papan.html", "/crew.html", "/pantau.html"]) {
      await page.goto(alamat + h);
      await page.waitForFunction(() => !/Memeriksa/.test(document.querySelector(".lencana-live").textContent), null, { timeout: 10000 });
      cek(/Live/.test(await page.textContent(".lencana-live")), `${h} terhubung ke server (Live)`);
    }

    console.log("2. masuk sebagai owner di papan");
    await page.goto(alamat + "/papan.html");
    await page.waitForSelector("#form-masuk:not([hidden])");
    await page.fill("#kunci", "kunci-salah-123");
    await page.click("#form-masuk button[type=submit]");
    await page.waitForSelector(".toast-galat");
    cek(/salah/i.test(await page.textContent(".toast-galat")), "kunci salah ditolak");
    await page.fill("#kunci", kunci);
    await page.click("#form-masuk button[type=submit]");
    await page.waitForSelector("#sudah-masuk:not([hidden])");
    cek(true, "masuk sebagai owner");
    cek(!(await page.evaluate(() => document.cookie.includes("markas_sesi"))), "cookie sesi tidak terbaca JavaScript (HttpOnly)");

    console.log("3. kirim perintah ke Jarvis");
    await page.fill("#teks-perintah", "Buat halaman profil singkat untuk toko roti contoh");
    await page.click("#kirim-perintah");
    await page.waitForFunction(() => [...document.querySelectorAll(".toast-ok")].some(t => /Perintah #\d+ diterima/.test(t.textContent)));
    cek(true, "perintah diterima database");

    console.log("4. tunggu kartu masuk kolom Menunggu OK");
    const tombolOk = 'button[data-aksi="setujui"]';
    await page.waitForSelector("#papan " + tombolOk, { timeout: 40000 });
    const id = Number(await page.getAttribute("#papan " + tombolOk, "data-id"));
    cek(id > 0, `tugas MC-${id} menunggu OK dengan QA lulus`);

    console.log("5. buka detail tugas");
    await page.click(`.tiket[data-buka="${id}"] h4`);
    await page.waitForSelector("#dialog-tugas[open]");
    const isi = await page.textContent("#dialog-tugas");
    cek(/index\.html/.test(isi), "detail menampilkan file hasil");
    cek(/Hasil QA/.test(isi), "detail menampilkan hasil QA");
    cek(/Riwayat/.test(isi), "detail menampilkan riwayat");

    console.log("6. minta revisi lewat dialog");
    await page.click('#dialog-tugas button[data-aksi="revisi"]');
    await page.waitForSelector("#dialog-revisi[open]");
    await page.fill("#alasan-revisi", "Tambahkan jam buka toko");
    await page.click('#form-revisi button[type="submit"]');
    const status = async () => (await (await fetch(`${alamat}/api/tugas/${id}`)).json());
    for (let i = 0; i < 60 && (await status()).revisi < 1; i++) await tidur(250);
    cek((await status()).revisi === 1, "tugas masuk revisi ke-1");

    console.log("7. setujui hasil revisi dari kartu");
    await page.waitForSelector(`#papan ${tombolOk}[data-id="${id}"]`, { timeout: 40000 });
    await page.click(`#papan ${tombolOk}[data-id="${id}"]`);
    for (let i = 0; i < 40 && (await status()).status !== "APPROVED"; i++) await tidur(250);
    const akhir = await status();
    cek(akhir.status === "APPROVED", "status akhir APPROVED");
    cek(akhir.riwayat.map(r => r.ke).join(">") === "PENDING>ASSIGNED>RUNNING>REVIEW>REVISION>RUNNING>REVIEW>APPROVED", "riwayat lengkap");
    cek(akhir.persetujuan.some(p => p.keputusan === "setuju"), "persetujuan Cell tercatat");
    await page.waitForFunction(() => /OK/.test([...document.querySelectorAll(".kolom")][4].textContent), null, { timeout: 10000 });
    cek(true, "kartu pindah ke kolom Selesai");

    console.log("8. crew & pantau membaca database");
    await page.goto(alamat + "/crew.html");
    await page.click('.kartu-agent[data-id="Bayu"]');
    await page.waitForSelector("#detail[open]");
    cek(/Tugas terakhir/.test(await page.textContent("#detail")), "detail Bayu menampilkan riwayat tugas dari database");
    await page.goto(alamat + "/pantau.html");
    await page.waitForFunction(() => document.querySelector("#p-mode").textContent === "LIVE", null, { timeout: 10000 });
    cek(true, "pantau: worker LIVE");
    await page.waitForFunction(() => Number(document.querySelector("#p-selesai").textContent.replace(/\D/g, "")) >= 1, null, { timeout: 10000 });
    cek(true, "pantau: tugas selesai terhitung");

    console.log("9. keluar");
    await page.goto(alamat + "/papan.html");
    await page.waitForSelector("#sudah-masuk:not([hidden])");
    await page.click("#keluar");
    await page.waitForSelector("#form-masuk:not([hidden])");
    cek((await (await page.request.get(alamat + "/api/saya")).json()).peran === "viewer", "sesi owner dihapus");

    if (FOLDER_LAYAR) {
      fs.mkdirSync(FOLDER_LAYAR, { recursive: true });
      for (const [nama, w, h, dpr] of [["laptop", 1440, 900, 1], ["4k", 1920, 1080, 2], ["hp", 390, 844, 3]]) {
        const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
        for (const hal of ["index", "papan", "crew", "pantau"]) {
          await p.goto(`${alamat}/${hal}.html`); await p.waitForTimeout(1500);
          await p.screenshot({ path: path.join(FOLDER_LAYAR, `${nama}-${hal}.png`) });
        }
        await p.close();
      }
      console.log("  screenshot disimpan di " + FOLDER_LAYAR);
    }
    cek(errorHalaman.length === 0, "tidak ada error JavaScript / dialog: " + (errorHalaman.join("; ") || "-"));
    console.log("\nE2E WEB LULUS");
  } catch (e) {
    gagal = true; console.error("\n" + e.message);
  } finally {
    if (browser) await browser.close();
    for (const p of proses) p.kill();
    await tidur(500);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(gagal ? 1 : 0);
  }
})();
