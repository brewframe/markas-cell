"""Tes unit + database: aturan status, validasi, foreign key, migrasi, backup, token, idempotensi."""
import sqlite3
import unittest
import uuid

from bantu import folder_sementara, pakai_env

TMP = folder_sementara()
pakai_env(TMP)
import config  # noqa: E402
import database as data  # noqa: E402
import db  # noqa: E402
import tugas as T  # noqa: E402


def siapkan():
    db.pakai(config.DATA / f"unit-{uuid.uuid4().hex}.db")
    db.siapkan()
    con = db._sambung(db.AKTIF["db"])
    data.isi_tim(con)
    return con


class TesDatabase(unittest.TestCase):
    def setUp(self):
        self.con = siapkan()

    def tearDown(self):
        self.con.close()

    def test_jumlah_agent_dan_lantai(self):
        st = data.statistik(self.con)
        self.assertEqual((st["jumlah_agent"], st["divisi"], st["lantai"], st["aktif"]), (29, 9, 5, 3))
        self.assertEqual([len(l["agent"]) for l in data.daftar_lantai(self.con)], [8, 10, 8, 4, 0])

    def test_foreign_key_aktif_dan_ditegakkan(self):
        self.assertEqual(self.con.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.con.execute("UPDATE agent SET ruang='tidak-ada' WHERE id='Kevin'")
        self.assertEqual(self.con.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_isi_tim_berulang_aman_dengan_fk(self):
        for _ in range(3):
            self.assertEqual(data.isi_tim(self.con), 30)
        self.assertEqual(self.con.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_cell_dan_jarvis_terpisah_dan_alias(self):
        a = {x["id"]: x for x in data.daftar_agent(self.con)}
        self.assertEqual((a["Cell"]["ruang"], a["Jarvis"]["ruang"]), ("cell", "jarvis"))
        self.assertEqual(data.cari_id(self.con, "stock-analyst"), "Kevin")
        self.assertTrue(a["Bayu"]["aktif"] and not a["Kevin"]["aktif"])

    def test_keadaan_salah_ditolak(self):
        with self.assertRaises(ValueError):
            data.set_status(self.con, "Kevin", "tidur")

    def test_status_basi_tidak_dihitung_kerja(self):
        data.set_status(self.con, "Kevin", "kerja", "Analisa")
        data.set_status(self.con, "Nova", "kerja", "Riset")
        self.con.execute("UPDATE agent SET diperbarui='2020-01-01 00:00:00' WHERE id='Nova'")
        st = data.statistik(self.con)["agent"]
        self.assertEqual((st["kerja"], st["basi"]), (1, 1))

    def test_token_banyak_model_dijumlah_benar(self):
        data.catat_token(self.con, "Kevin", "haiku", 10, 1)
        data.catat_token(self.con, "Kevin", "sonnet", 100, 10)
        r = data.ringkas_token(self.con)
        kevin = next(a for a in r["per_agent"] if a["agent"] == "Kevin")
        self.assertEqual((kevin["masuk"], kevin["keluar"], sorted(kevin["model"])), (110, 11, ["haiku", "sonnet"]))
        self.assertEqual(r["total"], 121)

    def test_token_dengan_kunci_tidak_ganda(self):
        self.assertTrue(data.catat_token(self.con, "Kevin", "x", 5, 5, kunci="sesi-1"))
        self.assertFalse(data.catat_token(self.con, "Kevin", "x", 5, 5, kunci="sesi-1"))
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM token WHERE kunci='sesi-1'").fetchone()[0], 1)


class TesStateMachine(unittest.TestCase):
    def setUp(self):
        self.con = siapkan()
        self.tid = T.buat(self.con, "Halaman tes", "tujuan", ["ada file"], "Bayu", oleh="Cell")

    def tearDown(self):
        self.con.close()

    def test_transisi_ilegal_ditolak_dan_tercatat(self):
        for ke, peran in [("APPROVED", "owner"), ("RUNNING", "worker"), ("ASSIGNED", "owner")]:
            with self.assertRaises(T.TransisiDitolak):
                T.pindah(self.con, self.tid, ke, "tes", peran)
        ditolak = self.con.execute("SELECT COUNT(*) FROM riwayat_tugas WHERE tugas=? AND ditolak=1", (self.tid,)).fetchone()[0]
        self.assertEqual(ditolak, 3)
        self.assertEqual(T.ambil(self.con, self.tid)["status"], "PENDING")

    def test_review_wajib_artefak_dan_approved_wajib_qa(self):
        T.pindah(self.con, self.tid, "ASSIGNED", "d", "dispatcher")
        self.assertEqual(T.klaim(self.con, "Bayu", "w1")["status"], "RUNNING")
        with self.assertRaises(T.TransisiDitolak):
            T.pindah(self.con, self.tid, "REVIEW", "Bayu", "worker")       # belum ada file
        (T.folder_kerja(self.con, self.tid) / "index.html").write_text("<html></html>")
        T.rekam_artefak(self.con, self.tid, 0)
        T.rekam_artefak(self.con, self.tid, 0)                               # dijalankan ulang: tidak ganda
        self.assertEqual(self.con.execute("SELECT COUNT(*) FROM artefak WHERE tugas=?", (self.tid,)).fetchone()[0], 1)
        T.pindah(self.con, self.tid, "REVIEW", "Bayu", "worker", qa_status="menunggu")
        with self.assertRaises(T.TransisiDitolak):
            T.setujui(self.con, self.tid, "Cell")                             # QA belum lulus
        with self.assertRaises(T.TransisiDitolak):
            T.pindah(self.con, self.tid, "APPROVED", "Vera", "qa")            # QA tidak boleh menyetujui
        self.con.execute("UPDATE tugas SET qa_status='lulus' WHERE id=?", (self.tid,))
        self.assertEqual(T.setujui(self.con, self.tid, "Cell")["status"], "APPROVED")
        with self.assertRaises(T.TransisiDitolak):
            T.pindah(self.con, self.tid, "RUNNING", "Bayu", "worker")         # APPROVED tidak bisa kembali

    def test_klaim_tidak_bisa_dobel(self):
        T.pindah(self.con, self.tid, "ASSIGNED", "d", "dispatcher")
        con2 = db._sambung(db.AKTIF["db"])
        self.assertIsNotNone(T.klaim(self.con, "Bayu", "w1"))
        self.assertIsNone(T.klaim(con2, "Bayu", "w2"))
        con2.close()

    def test_retry_dengan_jeda_lalu_failed(self):
        T.pindah(self.con, self.tid, "ASSIGNED", "d", "dispatcher")
        for n in range(config.MAKS_PERCOBAAN):
            self.con.execute("UPDATE tugas SET coba_setelah=NULL WHERE id=?", (self.tid,))
            self.assertIsNotNone(T.klaim(self.con, "Bayu", "w"))
            t = T.jadwal_ulang(self.con, self.tid, "Bayu", "error tes")
            if n < config.MAKS_PERCOBAAN - 1:
                self.assertEqual(t["status"], "ASSIGNED")
                self.assertIsNone(T.klaim(self.con, "Bayu", "w"))     # masih dalam jeda backoff
        self.assertEqual(t["status"], "FAILED")
        self.assertEqual(T.ulang(self.con, self.tid, "Cell")["status"], "PENDING")

    def test_tugas_ke_agent_tidak_aktif_ditolak(self):
        with self.assertRaises(ValueError):
            T.buat(self.con, "x tes", "", [], "Kevin")


class TesBackup(unittest.TestCase):
    def test_backup_dan_pulihkan(self):
        con = siapkan()
        T.buat(con, "Sebelum backup", "", [], "Bayu")
        con.commit()
        con.close()
        cad = db.backup(alasan="tes")
        self.assertTrue(db.periksa(cad)["utuh"])
        with db.koneksi() as c:
            T.buat(c, "Sesudah backup", "", [], "Bayu")
        db.pulihkan(cad)
        with db.koneksi() as c:
            judul = [r[0] for r in c.execute("SELECT judul FROM tugas")]
        self.assertEqual(judul, ["Sebelum backup"])

    def test_migrasi_dari_database_v1(self):
        lama = config.DATA / "v1.db"
        c = sqlite3.connect(lama)
        c.executescript(db.SKEMA_1)
        c.execute("INSERT INTO tugas (agent, judul, status) VALUES ('Kevin','tugas lama','selesai')")
        c.commit()
        c.close()
        info = db.siapkan(lama)
        self.assertEqual(info["dijalankan"], [1, 2, 3])
        self.assertIsNotNone(info["cadangan"])
        c = sqlite3.connect(lama)
        self.assertEqual(c.execute("SELECT judul FROM tugas_v1").fetchone()[0], "tugas lama")   # data lama tetap ada
        self.assertEqual(c.execute("SELECT COUNT(*) FROM tugas").fetchone()[0], 0)
        c.close()
        self.assertEqual(db.siapkan(lama)["dijalankan"], [])   # migrasi tidak diulang


if __name__ == "__main__":
    unittest.main()
