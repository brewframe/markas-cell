"""Bentuk data yang boleh dikirim ke API. Nilai di luar pilihan ditolak sebelum menyentuh database."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Keadaan = Literal["kerja", "menunggu", "santai"]
Prioritas = Literal["rendah", "normal", "tinggi"]


class Status(BaseModel):
    agent: str = Field(..., min_length=1, max_length=60)
    keadaan: Keadaan
    pesan: str = Field("", max_length=300)


class Token(BaseModel):
    agent: str = Field(..., min_length=1, max_length=60)
    model: str = Field("-", max_length=60)
    masuk: int = Field(..., ge=0, le=10_000_000)
    keluar: int = Field(..., ge=0, le=10_000_000)


class Perintah(BaseModel):
    teks: str = Field(..., min_length=5, max_length=2000)
    prioritas: Prioritas = "normal"


class TugasBaru(BaseModel):
    """Tugas langsung ke specialist (tanpa lewat Jarvis)."""
    judul: str = Field(..., min_length=3, max_length=120)
    tujuan: str = Field("", max_length=1500)
    kriteria: list[str] = Field(default_factory=list, max_length=6)
    agent: str = Field("Bayu", max_length=60)
    prioritas: Prioritas = "normal"


class Keputusan(BaseModel):
    alasan: str = Field("", max_length=1000)


class Masuk(BaseModel):
    kunci: str = Field(..., min_length=8, max_length=200)
