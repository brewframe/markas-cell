"""Cara agent melapor ke Markas Cell (cukup 2 baris di agent mana pun).

    import sys; sys.path.append(r"C:\\Users\\LOQ\\markas-cell\\backend")   # sesuaikan lokasinya
    from lapor import lapor_status, lapor_token

    lapor_status("Nova", "kerja", "Mengambil berita AI")
    lapor_token("Nova", "haiku", masuk=1200, keluar=350)
    lapor_status("Nova", "santai")

Markas 2.0 mewajibkan kunci agent. Kunci dibaca otomatis dari file .env di folder markas-cell
(MARKAS_KUNCI_AGENT), atau dari environment variable dengan nama yang sama.
Laporan yang gagal karena jaringan dicoba lagi 3x dengan jeda. Laporan token membawa
Idempotency-Key, jadi pengiriman ulang tidak tercatat dua kali.
Kalau server Markas mati, laporan dilewati tanpa membuat agent error.

Dari terminal:
    python backend/lapor.py Kevin kerja "Analisa BBCA"
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ALAMAT = os.environ.get("MARKAS_ALAMAT", "http://127.0.0.1:8300")
FILE_ENV = Path(__file__).resolve().parent.parent / ".env"


def _kunci() -> str:
    if os.environ.get("MARKAS_KUNCI_AGENT"):
        return os.environ["MARKAS_KUNCI_AGENT"]
    if FILE_ENV.exists():
        for baris in FILE_ENV.read_text(encoding="utf-8").splitlines():
            if baris.startswith("MARKAS_KUNCI_AGENT="):
                return baris.split("=", 1)[1].strip()
    return ""


def _kirim(jalur: str, data: dict, idem: str | None = None) -> bool:
    kepala = {"Content-Type": "application/json", "X-Markas-Key": _kunci()}
    if idem:
        kepala["Idempotency-Key"] = idem
    for coba in range(3):
        req = urllib.request.Request(ALAMAT + jalur, data=json.dumps(data).encode(), headers=kepala, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=3) as r:
                return r.status == 200
        except urllib.error.HTTPError as e:   # 401/404/422: mengulang tidak akan membantu
            print(f"[lapor] ditolak {e.code}: {e.read()[:200]!r}", file=sys.stderr)
            return False
        except Exception as e:                # server mati / jaringan: coba lagi dengan jeda
            if coba == 2:
                print(f"[lapor] dilewati: {e}", file=sys.stderr)
                return False
            time.sleep(0.5 * 2 ** coba)
    return False


def lapor_status(agent: str, keadaan: str, pesan: str = "") -> bool:
    """keadaan: kerja / menunggu / santai"""
    return _kirim("/api/status", {"agent": agent, "keadaan": keadaan, "pesan": pesan})


def lapor_token(agent: str, model: str, masuk: int, keluar: int) -> bool:
    return _kirim("/api/token", {"agent": agent, "model": model, "masuk": masuk, "keluar": keluar},
                  idem=str(uuid.uuid4()))


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    ok = lapor_status(sys.argv[1], sys.argv[2], " ".join(sys.argv[3:]))
    print("terkirim" if ok else "gagal (server menyala? kunci benar?)")
