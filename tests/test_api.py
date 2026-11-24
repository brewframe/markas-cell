"""Tes API: backend sungguhan dijalankan di port acak dengan data sementara."""
import unittest

from bantu import Server, folder_sementara


class TesAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = folder_sementara()
        cls.s = Server(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        cls.s.stop()

    def test_health_dan_mode_stale_tanpa_worker(self):
        kode, j, _ = self.s.minta("GET", "/api/health")
        self.assertEqual(kode, 200)
        self.assertTrue(j["database"]["fk"])
        self.assertEqual(j["mode"], "STALE")

    def test_baca_tanpa_kunci_boleh(self):
        for jalur in ("/api/snapshot", "/api/agent", "/api/tugas", "/api/gedung", "/api/agent/Kevin"):
            self.assertEqual(self.s.minta("GET", jalur)[0], 200, jalur)

    def test_halaman_web_baru_dan_lama(self):
        """Web baru (gaya CrewAI) di /, web lama tetap ada di /lama/."""
        for jalur in ("/", "/papan.html", "/crew.html", "/pantau.html", "/js/umum.js", "/js/seni.js", "/css/crew.css",
                      "/img/logo.svg", "/lama/", "/lama/kontrol.html"):
            self.assertEqual(self.s.minta("GET", jalur)[0], 200, jalur)
        self.assertIn("Markas Cell", str(self.s.minta("GET", "/")[1]))
        self.assertEqual(self.s.minta("GET", "/tidak-ada.html")[0], 404)

    def test_tulis_tanpa_kunci_ditolak_401(self):
        self.assertEqual(self.s.minta("POST", "/api/perintah", {"teks": "Buat halaman"})[0], 401)
        self.assertEqual(self.s.minta("POST", "/api/status", {"agent": "Kevin", "keadaan": "kerja"})[0], 401)
        self.assertEqual(self.s.minta("POST", "/api/tugas", {"judul": "abc"}, kunci="kunci-palsu-123")[0], 401)

    def test_peran_agent_hanya_boleh_melapor(self):
        self.assertEqual(self.s.minta("POST", "/api/status", {"agent": "Kevin", "keadaan": "kerja"}, self.s.agent)[0], 200)
        self.assertEqual(self.s.minta("POST", "/api/perintah", {"teks": "Buat halaman"}, self.s.agent)[0], 403)
        self.assertEqual(self.s.minta("POST", "/api/tugas/1/setujui", {}, self.s.agent)[0], 403)

    def test_enum_ditolak_422(self):
        self.assertEqual(self.s.minta("POST", "/api/status", {"agent": "Kevin", "keadaan": "tidur"}, self.s.agent)[0], 422)
        self.assertEqual(self.s.minta("POST", "/api/tugas", {"judul": "abc", "prioritas": "super"}, self.s.owner)[0], 422)

    def test_host_asing_ditolak(self):
        self.assertEqual(self.s.minta("GET", "/api/agent", kepala={"Host": "evil.example"})[0], 400)

    def test_idempotensi_tugas(self):
        k = {"Idempotency-Key": "tes-idem-1"}
        a = self.s.minta("POST", "/api/tugas", {"judul": "Halaman idem"}, self.s.owner, k)
        b = self.s.minta("POST", "/api/tugas", {"judul": "Halaman idem"}, self.s.owner, k)
        self.assertEqual((a[0], b[0]), (200, 200))
        self.assertEqual(a[1]["id"], b[1]["id"])

    def test_transisi_ilegal_409(self):
        tid = self.s.minta("POST", "/api/tugas", {"judul": "Halaman 409"}, self.s.owner)[1]["id"]
        kode, j, _ = self.s.minta("POST", f"/api/tugas/{tid}/setujui", {}, self.s.owner)
        self.assertEqual(kode, 409)
        detail = self.s.minta("GET", f"/api/tugas/{tid}")[1]
        self.assertTrue(any(r["ditolak"] for r in detail["riwayat"]))

    def test_tugas_ke_agent_belum_aktif_422(self):
        self.assertEqual(self.s.minta("POST", "/api/tugas", {"judul": "abc", "agent": "Kevin"}, self.s.owner)[0], 422)

    def test_sesi_cookie_owner(self):
        kode, _, h = self.s.minta("POST", "/api/masuk", {"kunci": self.s.owner})
        self.assertEqual(kode, 200)
        cookie = h.get("set-cookie") or h.get("Set-Cookie")
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=strict", cookie)
        nilai = cookie.split(";")[0]
        self.assertEqual(self.s.minta("GET", "/api/saya", kepala={"Cookie": nilai})[1]["peran"], "owner")
        self.assertEqual(self.s.minta("POST", "/api/masuk", {"kunci": "salah-salah-salah"})[0], 401)

    def test_batas_laju(self):
        kode = [self.s.minta("POST", "/api/token", {"agent": "Nova", "model": "x", "masuk": 1, "keluar": 1}, self.s.agent)[0]
                for _ in range(35)]
        self.assertIn(429, kode)


class TesDemoTerpisah(unittest.TestCase):
    def test_demo_tidak_menyentuh_database_asli(self):
        tmp = folder_sementara()
        s = Server(tmp, "--demo")
        try:
            j = s.minta("GET", "/api/health")[1]
            self.assertEqual((j["mode"], j["database"]["file"]), ("DEMO", "markas-demo.db"))
            self.assertEqual(s.minta("POST", "/api/perintah", {"teks": "Buat halaman"}, s.owner)[0], 409)
        finally:
            s.stop()
        self.assertFalse((tmp / "data" / "markas.db").exists())


if __name__ == "__main__":
    unittest.main()
