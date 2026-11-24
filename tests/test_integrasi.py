"""Tes integrasi: perintah -> Jarvis -> dispatcher -> worker -> QA -> persetujuan, memakai adapter UJI.

Adapter uji tidak memanggil AI; tes ini membuktikan ALUR dan ATURAN-nya. Bukti dengan AI sungguhan
ada di docs/TESTING_REPORT.md (uji nyata dengan Claude Code)."""
import unittest
import uuid

from bantu import folder_sementara, pakai_env

TMP = folder_sementara()
pakai_env(TMP)
import config  # noqa: E402
import database as data  # noqa: E402
import db  # noqa: E402
import tugas as T  # noqa: E402
import worker  # noqa: E402
from adapter import pilih  # noqa: E402

UJI = pilih("uji")


def putar(n=4):
    for _ in range(n):
        worker.putaran(UJI)


class TesAlur(unittest.TestCase):
    def setUp(self):
        uid = uuid.uuid4().hex
        db.pakai(config.DATA / f"int-{uid}.db")
        config.HASIL = TMP / f"hasil-{uid}"
        db.siapkan()
        with db.koneksi() as con:
            data.isi_tim(con)

    def test_perintah_sampai_disetujui(self):
        with db.koneksi() as con:
            T.buat_perintah(con, "Buatkan halaman profil usaha", "normal", "Cell")
        putar()
        with db.koneksi() as con:
            t = T.daftar(con)[0]
            self.assertEqual((t["status"], t["qa_status"], t["adapter"]), ("REVIEW", "lulus", "uji"))
            d = T.detail(con, t["id"])
            self.assertEqual([a["path"] for a in d["artefak"]], ["index.html"])
            self.assertTrue((T.folder_kerja(con, t["id"]) / "index.html").exists())   # file benar-benar ada
            self.assertEqual([(h["dari"], h["ke"]) for h in d["handoff"]], [("Jarvis", "Bayu"), ("Bayu", "Vera")])
            self.assertTrue(d["qa"][0]["lulus"])
            self.assertEqual(data.daftar_agent(con)[0] and {a["id"]: a for a in data.daftar_agent(con)}["Bayu"]["keadaan"], "menunggu")
            T.setujui(con, t["id"], "Cell", "oke")
            self.assertEqual(T.ambil(con, t["id"])["status"], "APPROVED")
            urutan = [r["ke"] for r in T.detail(con, t["id"])["riwayat"] if not r["ditolak"]]
            self.assertEqual(urutan, ["PENDING", "ASSIGNED", "RUNNING", "REVIEW", "APPROVED"])
            self.assertEqual({a["id"]: a for a in data.daftar_agent(con)}["Bayu"]["keadaan"], "santai")

    def test_qa_menolak_lalu_revisi_lalu_failed(self):
        with db.koneksi() as con:
            tid = T.buat(con, "Halaman #qa-tolak", "tes #qa-tolak", ["x"], "Bayu", oleh="Cell")
        putar(8)
        with db.koneksi() as con:
            t = T.detail(con, tid)
            self.assertEqual(t["status"], "FAILED")
            self.assertEqual(t["revisi"], config.MAKS_REVISI)
            self.assertIn("REVISION", [r["ke"] for r in t["riwayat"]])
            self.assertEqual(len(t["qa"]), config.MAKS_REVISI + 1)

    def test_owner_minta_revisi(self):
        with db.koneksi() as con:
            tid = T.buat(con, "Halaman revisi", "tes", ["x"], "Bayu", oleh="Cell")
        putar()
        with db.koneksi() as con:
            T.minta_revisi(con, tid, "Cell", "owner", "warna kurang terang")
        putar()
        with db.koneksi() as con:
            t = T.detail(con, tid)
            self.assertEqual((t["status"], t["revisi"], t["qa_status"]), ("REVIEW", 1, "lulus"))
            self.assertEqual(t["persetujuan"][0]["keputusan"], "revisi")
            self.assertEqual({a["versi"] for a in t["artefak"]}, {0, 1})

    def test_agent_gagal_dicoba_ulang_tanpa_dobel(self):
        with db.koneksi() as con:
            tid = T.buat(con, "Halaman #gagal", "#gagal", ["x"], "Bayu", oleh="Cell")
        for _ in range(config.MAKS_PERCOBAAN + 1):
            putar(1)
            with db.koneksi() as con:
                con.execute("UPDATE tugas SET coba_setelah=NULL WHERE id=?", (tid,))
        with db.koneksi() as con:
            t = T.detail(con, tid)
            self.assertEqual((t["status"], t["percobaan"]), ("FAILED", config.MAKS_PERCOBAAN))
            self.assertEqual(con.execute("SELECT COUNT(*) FROM tugas").fetchone()[0], 1)   # retry tidak membuat tugas baru
            self.assertEqual(t["artefak"], [])

    def test_tugas_yatim_dikembalikan(self):
        with db.koneksi() as con:
            tid = T.buat(con, "Halaman yatim", "tes", ["x"], "Bayu", oleh="Cell")
            T.pindah(con, tid, "ASSIGNED", "d", "dispatcher")
            T.klaim(con, "Bayu", "worker-mati")
        self.assertEqual(worker.pulihkan_yatim(), 1)
        with db.koneksi() as con:
            self.assertEqual(T.ambil(con, tid)["status"], "ASSIGNED")


if __name__ == "__main__":
    unittest.main()
