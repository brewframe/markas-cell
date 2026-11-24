// Tes ujung-ke-ujung GEDUNG 3D (tampilan lama) dengan data sungguhan dari database.
// Server + worker adapter UJI di folder sementara (tidak memanggil AI, tidak mengirim WA sungguhan).
//   buka gedung 3D -> masuk owner -> perintah ke Jarvis -> rapat di lantai 4 -> gelembung tugas
//   -> OK dari tab "Perlu OK" -> token tampil -> "kirim laporan ke WA" -> tombol laporan
// Jalankan:  node tests/e2e_3d.js [folder_screenshot]
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path"), net = require("net");

const PROYEK = path.resolve(__dirname, "..");
const PY = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const FOLDER_LAYAR = process.argv[2];
const portKosong = () => new Promise(ok => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
const tidur = ms => new Promise(r => setTimeout(r, ms));
// gedung 3D sibuk menggambar terus, jadi klik dikirim langsung lewat DOM (tanpa menunggu navigasi)
let page;
const klik = sel => page.$eval(sel, el => el.click());
function cek(kondisi, pesan) { if (!kondisi) throw new Error("GAGAL: " + pesan); console.log("  ok  " + pesan); }

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "markas-3d-"));
  fs.mkdirSync(path.join(tmp, "data"));
  for (const f of ["tim.json", "gedung.json", "profil.json"]) fs.copyFileSync(path.join(PROYEK, "data", f), path.join(tmp, "data", f));
  fs.writeFileSync(path.join(tmp, ".env"), "WA_TUJUAN=6281200000000\n");   // nomor contoh, tanpa token: tidak ada WA terkirim
  const env = { ...process.env, MARKAS_DATA: path.join(tmp, "data"), MARKAS_ENV: path.join(tmp, ".env"), MARKAS_HASIL: path.join(tmp, "hasil"),
    MARKAS_LAPORAN: path.join(tmp, "laporan"), MARKAS_ADAPTER: "uji" };
  const port = await portKosong(), alamat = `http://127.0.0.1:${port}`;
  const proses = [];
  const jalankan = arg => { const p = spawn(PY, arg, { cwd: PROYEK, env, stdio: "ignore" }); proses.push(p); return p; };
  let browser, gagal = false;
  const foto = async nama => { if (FOLDER_LAYAR) await page.screenshot({ path: path.join(FOLDER_LAYAR, nama + ".png") }); };
  try {
    if (FOLDER_LAYAR) fs.mkdirSync(FOLDER_LAYAR, { recursive: true });
    jalankan(["backend/main.py", "--tanpa-browser", "--port", String(port)]);
    for (let i = 0; i < 100; i++) { try { if ((await fetch(alamat + "/api/health")).ok) break; } catch {} await tidur(100); }
    jalankan(["backend/worker.py", "--adapter", "uji", "--jeda", "1.5"]);
    const kunci = fs.readFileSync(path.join(tmp, ".env"), "utf8").match(/MARKAS_KUNCI_OWNER=(.+)/)[1].trim();

    browser = await chromium.launch();
    page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    const errorHalaman = [];
    page.on("pageerror", e => errorHalaman.push(e.message));
    page.on("console", m => { if (m.type() === "error" && !/fonts\.g|status of 401/.test(m.text())) errorHalaman.push("console: " + m.text()); });

    console.log("1. gedung 3D terbuka dan LIVE");
    await page.goto(alamat + "/lama/markas.html");
    await page.waitForFunction(() => /Live/.test(document.querySelector("#navLive").textContent), null, { timeout: 15000 });
    cek(true, "indikator Live (worker jalan)");
    cek(await page.isVisible("#hudToken"), "HUD token tampil");

    console.log("2. masuk owner dari tab Perintah & WA");
    await klik('.sisi-tab button[data-tab="lapor"]');
    await page.waitForSelector("#kotakMasuk:not([hidden])");
    await page.fill("#kunci3d", kunci);
    await klik("#formMasuk3d button[type=submit]");
    await page.waitForSelector("#kotakMasuk[hidden]", { state: "attached" });
    cek(true, "masuk sebagai owner");
    await page.waitForFunction(() => /WA_TUJUAN|FONNTE_TOKEN|WA siap/.test(document.querySelector("#statusWa").textContent));
    cek(/FONNTE_TOKEN/.test(await page.textContent("#statusWa")), "status WA terbaca (token belum diisi)");

    console.log("3. perintah ke Jarvis -> rapat di lantai 4");
    await page.fill("#isiPerintah3d", "Buatkan halaman profil toko roti contoh");
    await klik("#formPerintah3d button[type=submit]");
    await page.waitForFunction(() => /diterima/.test(document.querySelector("#infoPerintah3d").textContent));
    cek(true, "perintah diterima database");
    await page.waitForFunction(() => window.__gedung.rapat.ids.includes("Jarvis"), null, { timeout: 15000 });
    cek(true, "Jarvis, Cell, Bayu, Vera rapat");
    await page.waitForFunction(() => [...document.querySelectorAll(".gelembung.g-rapat")].some(g => !g.hidden && /rapat|Memecah/i.test(g.textContent)), null, { timeout: 40000 });
    cek(true, "gelembung rapat tampil di atas karakter");
    await tidur(800); await foto("3d-rapat");

    console.log("4. hasil masuk Perlu OK, disetujui dari gedung");
    await page.waitForSelector('#daftarOk button[data-aksi="setujui"]', { state: "attached", timeout: 60000 });
    const id = Number(await page.getAttribute('#daftarOk button[data-aksi="setujui"]', "data-id"));
    cek(id > 0, `tugas MC-${id} menunggu OK`);
    await page.evaluate(() => window.__gedung.setFokus(2));
    await tidur(1500); await foto("3d-tunggu-ok");
    await klik('.sisi-tab button[data-tab="ok"]');
    await foto("3d-perlu-ok");
    await klik(`#daftarOk button[data-aksi="setujui"][data-id="${id}"]`);
    let t;
    for (let i = 0; i < 40; i++) { t = await (await fetch(`${alamat}/api/tugas/${id}`)).json(); if (t.status === "APPROVED") break; await tidur(250); }
    cek(t.status === "APPROVED", "status APPROVED dari tombol OK di gedung 3D");

    console.log("5. token real tampil");
    await page.evaluate(() => window.__gedung.pilihAgent("Bayu"));
    await page.waitForSelector("#tabAgent .token-agent");
    cek(/Token hari ini/.test(await page.textContent("#tabAgent .token-agent")), "panel Bayu menampilkan token hari ini");

    console.log("6. laporan per agent ke WA");
    await klik('.sisi-tab button[data-tab="lapor"]');
    await klik("#lihatLaporan");
    await page.waitForSelector("#isiLaporan:not([hidden])");
    const isi = await page.textContent("#isiLaporan");
    cek(/Laporan per agent/.test(isi) && /\*Bayu\*/.test(isi) && /\*Vera\*/.test(isi) && /\*Jarvis\*/.test(isi), "isi laporan memuat setiap agent");
    cek(/1 selesai/.test(isi), "laporan Bayu: 1 tugas selesai");
    await klik("#kirimLaporan");
    await page.waitForFunction(() => /Buka WhatsApp/.test(document.querySelector("#infoLaporan").textContent));
    cek(await page.getAttribute("#infoLaporan a", "href").then(h => h.startsWith("https://wa.me/6281200000000")), "tanpa token: tautan wa.me untuk kirim manual");
    await foto("3d-laporan-wa");
    await page.fill("#isiPerintah3d", "kirim laporan ke WA");
    await klik("#formPerintah3d button[type=submit]");
    await page.waitForFunction(() => /Laporan per agent/.test(document.querySelector("#infoPerintah3d").textContent));
    cek(true, "perintah \"kirim laporan ke WA\" dikerjakan langsung");
    const daftarPerintah = await (await fetch(alamat + "/api/perintah")).json();
    cek(!daftarPerintah.some(p => /laporan/.test(p.teks)), "perintah laporan tidak menjadi tugas AI (tanpa token)");

    console.log("7. web baru punya tautan Gedung 3D");
    await page.goto(alamat + "/papan.html");
    await page.waitForFunction(() => !/Memeriksa/.test(document.querySelector(".lencana-live").textContent));
    cek(await page.isVisible('a[href="/lama/markas.html"]'), "menu Gedung 3D tampil saat server jalan");
    cek(await page.isVisible("#kirim-laporan"), "tombol Kirim laporan ke WA di Papan Tugas");

    if (FOLDER_LAYAR) {
      await page.goto(alamat + "/lama/markas.html#lantai=4");
      await tidur(2500); await foto("3d-lantai4");
      await page.goto(alamat + "/lama/markas.html");
      await tidur(2500); await foto("3d-semua");
      console.log("  screenshot disimpan di " + FOLDER_LAYAR);
    }
    cek(errorHalaman.length === 0, "tidak ada error JavaScript: " + (errorHalaman.join("; ") || "-"));
    console.log("\nE2E GEDUNG 3D LULUS");
  } catch (e) {
    gagal = true; console.error("\n" + e.message);
    try { if (page && FOLDER_LAYAR) await foto("gagal"); } catch {}
  } finally {
    if (browser) await browser.close();
    for (const p of proses) p.kill();
    await tidur(500);
    fs.rmSync(tmp, { recursive: true, force: true });
    process.exit(gagal ? 1 : 0);
  }
})();
