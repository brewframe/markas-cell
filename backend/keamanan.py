"""Keamanan Markas Cell: siapa boleh melakukan apa.

Analogi: gedung punya tiga jenis kartu akses.
  owner  (Cell)   -> boleh semua: memberi perintah, menyetujui, menolak.
  agent  (skrip)  -> hanya boleh melapor status dan token.
  viewer (tamu)   -> hanya melihat (semua GET). Tidak perlu kartu.

Cara membuktikan diri:
  - Skrip/agent: header  X-Markas-Key: <kunci dari .env>
  - Browser Cell: masuk sekali di halaman Kontrol dengan kunci owner. Server memberi
    cookie sesi HttpOnly (tidak bisa dibaca JavaScript) dengan SameSite=Strict.
    Kunci owner tidak pernah disimpan di browser.

Perlindungan tambahan:
  - Cek header Host: hanya localhost/127.0.0.1. Ini menutup serangan DNS rebinding
    (situs jahat yang menyamar menjadi "localhost").
  - Batas laju sederhana untuk request tulis.
"""
from __future__ import annotations

import hmac
import secrets
import time
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, Request

HOST_BOLEH = {"localhost", "127.0.0.1", "[::1]"}
NAMA_COOKIE = "markas_sesi"
UMUR_SESI = 12 * 3600

KUNCI: dict[str, str] = {}          # peran -> kunci (diisi main.py dari .env)
SESI: dict[str, tuple[str, float]] = {}   # token sesi -> (peran, kedaluwarsa)
_LAJU: dict[tuple, deque] = defaultdict(deque)


def atur_kunci(env: dict) -> None:
    KUNCI.clear()
    if env.get("MARKAS_KUNCI_OWNER"):
        KUNCI["owner"] = env["MARKAS_KUNCI_OWNER"]
    if env.get("MARKAS_KUNCI_AGENT"):
        KUNCI["agent"] = env["MARKAS_KUNCI_AGENT"]


def peran_dari_kunci(kunci: str | None) -> str | None:
    if not kunci:
        return None
    for peran, k in KUNCI.items():
        if hmac.compare_digest(kunci.encode(), k.encode()):   # perbandingan waktu-konstan
            return peran
    return None


def buat_sesi(peran: str) -> str:
    token = secrets.token_urlsafe(32)
    SESI[token] = (peran, time.time() + UMUR_SESI)
    return token


def hapus_sesi(token: str | None) -> None:
    if token:
        SESI.pop(token, None)


def peran_saya(request: Request) -> str:
    p = peran_dari_kunci(request.headers.get("x-markas-key"))
    if p:
        return p
    s = SESI.get(request.cookies.get(NAMA_COOKIE, ""))
    if s and s[1] > time.time():
        return s[0]
    return "viewer"


def wajib(*boleh: str):
    """Dependency FastAPI: tolak 401 kalau belum masuk, 403 kalau perannya tidak cukup."""
    def cek(request: Request) -> str:
        p = peran_saya(request)
        if p in boleh:
            return p
        if p == "viewer":
            raise HTTPException(401, "Perlu masuk. Buka halaman Kontrol dan masukkan kunci owner.")
        raise HTTPException(403, f"Peran '{p}' tidak boleh melakukan ini")
    return Depends(cek)


def host_aman(host_header: str | None) -> bool:
    if not host_header:
        return False
    host = host_header.rsplit(":", 1)[0] if not host_header.startswith("[") else host_header.split("]")[0] + "]"
    return host.lower() in HOST_BOLEH


def laju_aman(kunci: tuple, batas: int = 30, jendela: float = 10.0) -> bool:
    """Maksimal `batas` request tulis per `jendela` detik untuk satu kunci."""
    sekarang = time.monotonic()
    q = _LAJU[kunci]
    while q and q[0] < sekarang - jendela:
        q.popleft()
    if len(q) >= batas:
        return False
    q.append(sekarang)
    return True
