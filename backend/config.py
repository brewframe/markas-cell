"""Setelan Markas Cell: lokasi file, kunci rahasia, dan daftar agent yang aktif.

Analogi: ini "papan informasi" di ruang server. Semua bagian lain membaca dari sini,
jadi lokasi database atau kunci cukup diubah di satu tempat.

Semua lokasi bisa diganti lewat environment variable (dipakai oleh tes):
  MARKAS_DATA   folder data (bawaan: <proyek>/data)
  MARKAS_ENV    file .env berisi kunci (bawaan: <proyek>/.env)
  MARKAS_HASIL  folder hasil kerja agent (bawaan: <proyek>/hasil)
"""
from __future__ import annotations

import os
import secrets
from pathlib import Path

FOLDER = Path(__file__).resolve().parent.parent
DATA = Path(os.environ.get("MARKAS_DATA", FOLDER / "data"))
FILE_ENV = Path(os.environ.get("MARKAS_ENV", FOLDER / ".env"))
HASIL = Path(os.environ.get("MARKAS_HASIL", FOLDER / "hasil"))
CADANGAN = DATA / "cadangan"
FILE_DB = DATA / "markas.db"
FILE_DB_DEMO = DATA / "markas-demo.db"   # mode demo TIDAK PERNAH menulis ke markas.db
FILE_TIM = DATA / "tim.json"
FILE_GEDUNG = DATA / "gedung.json"
FILE_PROFIL = DATA / "profil.json"

# Markas 2.0 sengaja mulai dari 3 agent yang benar-benar bekerja.
# Agent lain tetap tampil di gedung, tapi berlabel "belum aktif".
AKTIF = {
    "Jarvis": "orkestrator",   # memecah perintah Cell menjadi tugas
    "Bayu": "specialist",      # mengerjakan tugas web
    "Vera": "qa",              # memeriksa hasil sebelum sampai ke Cell
}
SPECIALIST = [nama for nama, peran in AKTIF.items() if peran == "specialist"]

# batas kerja worker
MAKS_PERCOBAAN = 3          # percobaan per tugas sebelum FAILED
MAKS_REVISI = 2             # revisi dari QA/Cell sebelum FAILED
BATAS_WAKTU_AGENT = int(os.environ.get("MARKAS_BATAS_WAKTU", "900"))   # detik per panggilan AI
WORKER_BASI = 20            # detik tanpa detak -> worker dianggap mati (STALE)
AGENT_BASI = 600            # detik tanpa laporan saat "kerja" -> status dianggap basi


def baca_env(path: Path | None = None) -> dict:
    """Baca file .env sederhana (KUNCI=nilai per baris). Tanpa pustaka tambahan."""
    path = path or FILE_ENV
    hasil = {}
    if path.exists():
        for baris in path.read_text(encoding="utf-8").splitlines():
            baris = baris.strip()
            if baris and not baris.startswith("#") and "=" in baris:
                k, v = baris.split("=", 1)
                hasil[k.strip()] = v.strip().strip('"').strip("'")
    return hasil


def pastikan_env(path: Path | None = None) -> tuple[dict, bool]:
    """Buat .env berisi kunci acak kalau belum ada. Mengembalikan (isi, baru_dibuat).

    Kunci owner = untuk Cell (masuk dashboard & memberi perintah).
    Kunci agent = untuk skrip/hook yang melapor status & token.
    File ini tidak ikut di-commit (.gitignore) dan tidak pernah dikirim ke browser.
    """
    path = path or FILE_ENV
    isi = baca_env(path)
    perlu = {"MARKAS_KUNCI_OWNER": "o_", "MARKAS_KUNCI_AGENT": "a_"}
    kurang = {k: p + secrets.token_urlsafe(24) for k, p in perlu.items() if not isi.get(k)}
    if kurang:
        path.parent.mkdir(parents=True, exist_ok=True)
        lama = path.read_text(encoding="utf-8") if path.exists() else \
            "# Kunci rahasia Markas Cell. JANGAN dibagikan, JANGAN di-commit.\n"
        tambahan = "".join(f"{k}={v}\n" for k, v in kurang.items())
        path.write_text(lama.rstrip("\n") + "\n" + tambahan, encoding="utf-8")
        isi.update(kurang)
    return isi, bool(kurang)
