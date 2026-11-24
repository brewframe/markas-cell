"""Perintah otomatis harian: kirim daftar perintah tetap ke Jarvis tanpa membuka web.

Analogi: seperti alarm pagi. Setiap jam 07.00 kertas tugas harian otomatis diletakkan
di meja Jarvis, lalu worker (Jarvis -> agent -> Vera QA) mengerjakannya seperti biasa.
Hasilnya tetap MENUNGGU OK darimu di Papan Tugas. Tidak ada yang dikirim ke klien tanpa izinmu.

Daftar perintah ada di data/perintah_harian.txt (satu baris = satu perintah, # = catatan).
Butuh server Markas menyala (MULAI.bat / jadwal otomatis).

    python backend/perintah_harian.py           -> pratinjau daftar perintah
    python backend/perintah_harian.py --kirim   -> kirim ke Jarvis (dipakai jadwal otomatis)

Aman dijalankan dua kali: setiap perintah membawa Idempotency-Key berisi tanggal,
jadi perintah yang sama tidak dibuat dua kali di hari yang sama.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402

ALAMAT = "http://127.0.0.1:8300"
FILE_DAFTAR = config.DATA / "perintah_harian.txt"


def baca_daftar(path: Path = FILE_DAFTAR) -> list[tuple[str, str]]:
    """Kembalikan [(prioritas, teks)]. Awali baris dengan '!' untuk prioritas tinggi."""
    if not path.exists():
        return []
    hasil = []
    for baris in path.read_text(encoding="utf-8").splitlines():
        baris = baris.strip()
        if not baris or baris.startswith("#"):
            continue
        prioritas = "tinggi" if baris.startswith("!") else "normal"
        teks = baris.lstrip("!").strip()
        if len(teks) >= 5:
            hasil.append((prioritas, teks))
    return hasil


def kirim(teks: str, prioritas: str, kunci_owner: str, tanggal: str) -> dict:
    idem = "harian-" + tanggal + "-" + hashlib.sha256(teks.encode()).hexdigest()[:16]
    req = urllib.request.Request(ALAMAT + "/api/perintah", method="POST",
                                 data=json.dumps({"teks": teks, "prioritas": prioritas}).encode(),
                                 headers={"Content-Type": "application/json", "X-Markas-Key": kunci_owner, "Idempotency-Key": idem})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Kirim perintah harian ke Jarvis")
    p.add_argument("--kirim", action="store_true")
    arg = p.parse_args(argv)
    daftar = baca_daftar()
    if not daftar:
        print(f"Belum ada perintah di {FILE_DAFTAR}. Tulis satu perintah per baris.")
        return 0
    for pr, teks in daftar:
        print(f"[{pr}] {teks}")
    if not arg.kirim:
        print("\nIni pratinjau. Tambahkan --kirim untuk mengirim ke Jarvis.")
        return 0
    kunci = config.baca_env().get("MARKAS_KUNCI_OWNER")
    if not kunci:
        print("Kunci owner belum ada di .env. Jalankan MULAI.bat sekali dulu.")
        return 1
    tanggal, gagal = datetime.now().strftime("%Y-%m-%d"), 0
    for pr, teks in daftar:
        try:
            print("  terkirim, perintah #%s" % kirim(teks, pr, kunci, tanggal)["id"])
        except urllib.error.URLError as e:
            gagal += 1
            print("  GAGAL:", getattr(e, "reason", e), "(server Markas menyala?)")
    return 1 if gagal else 0


if __name__ == "__main__":
    sys.exit(main())
