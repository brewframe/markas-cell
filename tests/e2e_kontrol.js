// Tes ujung-ke-ujung di browser sungguhan (Playwright + Chromium).
// Menyalakan server + worker adapter UJI di folder sementara, lalu memeriksa alur Cell:
//   masuk owner -> kirim perintah -> tunggu hasil QA -> minta revisi -> setujui -> APPROVED
// Tidak memanggil AI sungguhan dan tidak menyentuh data/markas.db.
// Jalankan:  node tests/e2e_kontrol.js     (perlu: npm i playwright  &&  npx playwright install chromium)
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), net = require("net");

const PROYEK = path.resolve(__dirname, "..");
const PY = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

const portKosong = () => new Promise(ok => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const tidur = ms => new Promise(r => setTimeout(r, ms));
function cek(kondisi, pesan) { if (!kondisi) throw new Error("GAGAL: " + pesan); console.log("  ok  " + pesan); }

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "markas-e2e-"));
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
    const page = await browser.newPage();
    const errorHalaman = [];
    page.on("pageerror", e => errorHalaman.push(e.message));
    page.on("dialog", d => { errorHalaman.push("dialog: " + d.message()); d.dismiss(); });
    await page.goto(alamat + "/lama/kontrol.html");

    console.log("1. masuk sebagai owner");
    await page.fill("#kunci", "kunci-salah-123");
    await page.click("#formMasuk button[type=submit]");
    await page.waitForSelector("#mInfo.gagal");
    cek(true, "kunci salah ditolak");
    await page.fill("#kunci", kunci);
    await page.click("#formMasuk button[type=submit]");
    await page.waitForSelector("#tKeluar");
    cek(await page.evaluate(() => document.body.classList.contains("owner")), "masuk sebagai owner");
    cek(!(await page.evaluate(() => document.cookie.includes("markas_sesi"))), "cookie sesi tidak terbaca JavaScript (HttpOnly)");
    await page.waitForFunction(() => /LIVE/i.test(document.querySelector("#bannerMode, #navLive")?.textContent || ""), null, { timeout: 15000 });
    cek(true, "mode LIVE (worker terdeteksi)");

    console.log("2. kirim perintah ke Jarvis");
    await page.fill("#pTeks", "Buat halaman profil singkat untuk toko roti contoh");
    await page.click("#formPerintah button[type=submit]");
    await page.waitForSelector("#pInfo.ok");
    cek(/Perintah #\d+ diterima/.test(await page.textContent("#pInfo")), "perintah diterima");

    console.log("3. tunggu Bayu selesai dan QA Vera lulus");
    const tombolSetujui = '#daftarOk button[data-aksi="setujui"]:not([disabled])';
    await page.waitForSelector(tombolSetujui, { timeout: 30000 });
    const id = await page.getAttribute(tombolSetujui, "data-id");
    cek(true, `tugas #${id} masuk "Perlu persetujuanmu" dengan QA lulus`);

    console.log("4. buka detail tugas");
    await page.click(`#daftarOk button[data-aksi="detail"][data-id="${id}"]`);
    await page.waitForSelector("#laci.buka");
    const isiLaci = await page.textContent("#laci");
    cek(/index\.html/.test(isiLaci), "laci menampilkan file hasil");
    cek(/QA|Vera/.test(isiLaci), "laci menampilkan hasil QA");
    await page.click("#laci .laci-tutup");

    console.log("5. minta revisi");
    const kartu = `#daftarOk [data-review="${id}"]`;
    await page.click(`${kartu} button[data-aksi="revisi"]`);
    await page.fill(`${kartu} textarea[data-alasan="${id}"]`, "Tambahkan jam buka toko");
    await page.click(`${kartu} button[data-aksi="revisi"]`);
    const status = async () => (await (await fetch(`${alamat}/api/tugas/${id}`)).json());
    for (let i = 0; i < 60 && (await status()).revisi < 1; i++) await tidur(250);
    cek((await status()).revisi === 1, "tugas masuk revisi ke-1");

    console.log("6. setujui hasil revisi");
    await page.waitForSelector(`#daftarOk [data-review="${id}"] button[data-aksi="setujui"]:not([disabled])`, { timeout: 30000 });
    await page.click(`#daftarOk [data-review="${id}"] button[data-aksi="setujui"]`);
    for (let i = 0; i < 40 && (await status()).status !== "APPROVED"; i++) await tidur(250);
    const akhir = await status();
    cek(akhir.status === "APPROVED", "status akhir APPROVED");
    const jalur = akhir.riwayat.map(r => r.ke).join(" > ");
    cek(jalur === "PENDING > ASSIGNED > RUNNING > REVIEW > REVISION > RUNNING > REVIEW > APPROVED", "riwayat lengkap: " + jalur);
    cek(akhir.persetujuan.some(p => p.keputusan === "setuju"), "persetujuan Cell tercatat");
    await page.waitForFunction(i => !document.querySelector(`#daftarOk [data-review="${i}"]`), id, { timeout: 10000 });
    cek(true, "kartu hilang dari daftar persetujuan");
    cek(errorHalaman.length === 0, "tidak ada error JavaScript / dialog: " + (errorHalaman.join("; ") || "-"));
    console.log("\nE2E LULUS");
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
