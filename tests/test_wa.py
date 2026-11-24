"""Tes laporan & kabar WhatsApp. Tidak pernah mengirim WA sungguhan: Fonnte diganti tiruan."""
import os
import unittest
import uuid

from bantu import Server, folder_sementara, pakai_env

TMP = folder_sementara()
pakai_env(TMP)
os.environ["MARKAS_LAPORAN"] = str(TMP / "laporan")
import config  # noqa: E402
import database as data  # noqa: E402
import db  # noqa: E402
import laporan_wa as L  # noqa: E402
import tugas as T  # noqa: E402
import wa  # noqa: E402
import worker  # noqa: E402
from adapter import pilih  # noqa: E402


def tulis_env(path, **isi):
    lama = {k: v for k, v in (b.split("=", 1) for b in path.read_text().splitlines() if "=" in b and not b.startswith("#"))} \
        if path.exists() else {}
    lama.update(isi)
    path.write_text("".join(f"{k}={v}\n" for k, v in lama.items()))


class TesPola(unittest.TestCase):
    def test_kenali_perintah_laporan(self):
        for t in ("kirim laporan ke WA", "Jarvis, kirimkan laporan hari ini ke whatsapp", "tolong send report ke wa",
                  "laporan harian ke WA ya", "kirim rekap semua agent via WA"):
            self.assertTrue(wa.minta_laporan(t), t)
        for t in ("Buat landing page laundry dengan tombol WA", "buat halaman laporan keuangan",
                  "kirim desain logo", "tambahkan tombol whatsapp di halaman kontak"):
            self.assertFalse(wa.minta_laporan(t), t)


class TesLaporanDanKabar(unittest.TestCase):
    def setUp(self):
        uid = uuid.uuid4().hex
        db.pakai(config.DATA / f"wa-{uid}.db")
        config.HASIL = TMP / f"hasil-{uid}"
        config.FILE_ENV = TMP / f"env-{uid}"
        db.siapkan()
        with db.koneksi() as con:
            data.isi_tim(con)
        self.terkirim = []
        self._asli = wa._kirim_fonnte
        wa._kirim_fonnte = lambda teks, token, tujuan: self.terkirim.append((teks, tujuan))

    def tearDown(self):
        wa._kirim_fonnte = self._asli

    def test_laporan_per_agent_pakai_token_asli_bukan_demo(self):
        with db.koneksi() as con:
            data.catat_token(con, "Bayu", "sonnet", 12000, 3000, sumber="worker", biaya_usd=0.12)
            data.catat_token(con, "Jarvis", "sonnet", 2000, 500, sumber="worker")
            data.catat_token(con, "Bayu", "demo", 999999, 999999, sumber="demo")
            teks = L.buat(con)
        self.assertIn("Laporan per agent", teks)
        for nama in ("*Jarvis*", "*Bayu*", "*Vera*"):
            self.assertIn(nama, teks)
        self.assertIn("15.000 token", teks)      # Bayu: 12.000 + 3.000, token demo tidak dihitung
        self.assertIn("Total token: 17.500", teks)
        self.assertNotIn("1.999.998", teks)

    def test_kirim_tanpa_tujuan_dan_tanpa_token(self):
        self.assertEqual(wa.kirim("halo")["cara"], "belum")
        tulis_env(config.FILE_ENV, WA_TUJUAN="6281234567890")
        h = wa.kirim("halo")
        self.assertEqual(h["cara"], "manual")
        self.assertTrue(h["tautan"].startswith("https://wa.me/6281234567890?text="))
        self.assertEqual(self.terkirim, [])
        self.assertNotIn("6281234567890", str(wa.status()))   # nomor lengkap tidak pernah ke browser

    def test_kabar_menunggu_ok_hanya_sekali(self):
        tulis_env(config.FILE_ENV, WA_TUJUAN="6281234567890", FONNTE_TOKEN="tok-palsu")
        with db.koneksi() as con:
            T.buat_perintah(con, "Buatkan halaman profil toko roti", "normal", "Cell")
        uji = pilih("uji")
        for _ in range(4):
            worker.putaran(uji)
        perlu_ok = [t for t, _ in self.terkirim if "Menunggu OK" in t]
        self.assertEqual(len(perlu_ok), 1, self.terkirim)
        for _ in range(2):
            worker.putaran(uji)
        self.assertEqual(len([t for t, _ in self.terkirim if "Menunggu OK" in t]), 1)

    def test_kabar_mati_kalau_wa_notif_0(self):
        tulis_env(config.FILE_ENV, WA_TUJUAN="6281234567890", FONNTE_TOKEN="tok-palsu", WA_NOTIF="0")
        with db.koneksi() as con:
            T.buat_perintah(con, "Buatkan halaman profil toko roti", "normal", "Cell")
        for _ in range(4):
            worker.putaran(pilih("uji"))
        self.assertEqual(self.terkirim, [])

    def test_fonnte_gagal_tidak_merusak(self):
        tulis_env(config.FILE_ENV, WA_TUJUAN="6281234567890", FONNTE_TOKEN="tok-palsu")

        def rusak(*_):
            raise RuntimeError("Fonnte menolak: token salah")
        wa._kirim_fonnte = rusak
        with db.koneksi() as con:
            h = L.kirim_laporan(con, oleh="tes")
        self.assertFalse(h["terkirim"])
        self.assertEqual(h["cara"], "gagal")
        self.assertIn("wa.me", h["tautan"])


class TesAPILaporan(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = folder_sementara()
        os.environ["MARKAS_LAPORAN"] = str(cls.tmp / "laporan")
        cls.s = Server(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        cls.s.stop()

    def test_laporan_hanya_owner(self):
        self.assertEqual(self.s.minta("GET", "/api/laporan")[0], 401)
        self.assertEqual(self.s.minta("POST", "/api/laporan/wa", {})[0], 401)
        self.assertEqual(self.s.minta("GET", "/api/laporan", kunci=self.s.agent)[0], 403)
        kode, j, _ = self.s.minta("GET", "/api/laporan", kunci=self.s.owner)
        self.assertEqual(kode, 200)
        self.assertIn("Laporan per agent", j["teks"])
        self.assertIn("wa", self.s.minta("GET", "/api/snapshot")[1])

    def test_perintah_kirim_laporan_tidak_jadi_tugas(self):
        tulis_env(self.tmp / ".env", WA_TUJUAN="6281234567890")
        kode, j, _ = self.s.minta("POST", "/api/perintah", {"teks": "kirim laporan ke WA"}, self.s.owner)
        self.assertEqual(kode, 200)
        self.assertEqual(j["jenis"], "laporan_wa")
        self.assertEqual(j["wa"]["cara"], "manual")
        self.assertFalse(any("laporan" in p["teks"] for p in self.s.minta("GET", "/api/perintah")[1]))
        self.assertTrue((self.tmp / "laporan").exists())

    def test_token_dari_agent_masuk_laporan(self):
        self.s.minta("POST", "/api/token", {"agent": "Rafa", "model": "haiku", "masuk": 4000, "keluar": 1000}, self.s.agent)
        teks = self.s.minta("GET", "/api/laporan", kunci=self.s.owner)[1]["teks"]
        self.assertIn("*Rafa*", teks)
        self.assertIn("5.000 token", teks)


if __name__ == "__main__":
    unittest.main()
