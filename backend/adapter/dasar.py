"""Kontrak semua adapter."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path


class AdapterError(Exception):
    """Panggilan AI gagal (timeout, tidak terpasang, keluaran rusak). Worker akan mencoba lagi."""


@dataclass
class HasilAgent:
    teks: str                       # jawaban akhir agent
    model: str = "-"
    masuk: int = 0                  # token masuk (termasuk cache) menurut penyedia
    keluar: int = 0
    biaya_usd: float | None = None  # perkiraan biaya dari penyedia, bukan tagihan resmi
    sesi: str | None = None         # id sesi penyedia -> kunci idempotensi laporan token
    mentah: dict = field(default_factory=dict)


class AdapterAgent:
    nama = "dasar"

    def jalankan(self, prompt: str, folder: Path, boleh_tulis: bool, batas_detik: int) -> HasilAgent:
        """Jalankan agent di `folder`. boleh_tulis=False -> hanya membaca (untuk QA & Jarvis)."""
        raise NotImplementedError


def ambil_json(teks: str) -> dict:
    """Ambil objek JSON pertama dari jawaban AI (kadang dibungkus ```json ... ```)."""
    m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", teks, re.S)
    calon = [m.group(1)] if m else []
    awal = teks.find("{")
    if awal >= 0:
        calon.append(teks[awal:teks.rfind("}") + 1])
    for c in calon:
        try:
            return json.loads(c)
        except json.JSONDecodeError:
            continue
    raise AdapterError("jawaban agent tidak berisi JSON yang valid")
