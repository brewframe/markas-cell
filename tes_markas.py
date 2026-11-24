"""Jalankan SEMUA tes Markas Cell dengan satu perintah (tanpa install tambahan):

    python tes_markas.py

Isi:
  tests/test_unit.py       aturan status tugas, validasi, foreign key, migrasi, backup/restore, token
  tests/test_api.py        backend sungguhan di port acak: kunci, peran, Host, enum, 409, idempotensi, demo terpisah
  tests/test_integrasi.py  perintah -> Jarvis -> Bayu -> QA Vera -> persetujuan (adapter UJI, tanpa AI)
Tes end-to-end browser (opsional, butuh Node + Playwright): node tests/e2e_kontrol.js
Semua tes memakai folder sementara. data/markas.db asli tidak disentuh.
"""
import sys
import unittest
from pathlib import Path

folder = Path(__file__).resolve().parent / "tests"
sys.path.insert(0, str(folder))
hasil = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.discover(str(folder), pattern="test_*.py"))
print(f"\n{'SEMUA TES LULUS' if hasil.wasSuccessful() else 'ADA TES GAGAL'}: {hasil.testsRun} tes")
sys.exit(0 if hasil.wasSuccessful() else 1)
