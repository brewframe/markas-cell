"""Adapter UJI: dipakai tes otomatis supaya alur bisa dibuktikan tanpa memanggil AI.

Ini BUKAN agent sungguhan dan tidak berpura-pura menjadi agent:
- setiap file yang ditulis diawali tanda "[ADAPTER UJI]",
- model tercatat "uji", token 0,
- tugas menyimpan adapter="uji", dan dashboard menampilkan label UJI.

Perilaku bisa diatur lewat isi prompt (khusus tes):
  "#gagal"     -> melempar AdapterError (menguji retry)
  "#qa-tolak"  -> penilaian QA tidak lulus (menguji revisi)
"""
from __future__ import annotations

import json
from pathlib import Path

from .dasar import AdapterAgent, AdapterError, HasilAgent


class AdapterUji(AdapterAgent):
    nama = "uji"

    def jalankan(self, prompt: str, folder: Path, boleh_tulis: bool, batas_detik: int) -> HasilAgent:
        if "#gagal" in prompt:
            raise AdapterError("adapter uji: kegagalan yang disengaja")
        if "PERAN: JARVIS" in prompt:
            teks = json.dumps({"tugas": [{"judul": "Halaman uji", "tujuan": "Membuat halaman HTML sederhana",
                                          "kriteria": ["Ada file index.html", "Ada judul halaman"]}]})
        elif "PERAN: QA" in prompt:
            lulus = "#qa-tolak" not in prompt
            teks = json.dumps({"lulus": lulus, "catatan": "penilaian adapter uji",
                               "kriteria": [{"kriteria": "uji", "lulus": lulus, "alasan": "adapter uji"}]})
        else:
            if boleh_tulis:
                (folder / "index.html").write_text(
                    "<!doctype html><!-- [ADAPTER UJI] bukan hasil AI -->\n<html><head><title>Uji</title></head>"
                    "<body><h1>[ADAPTER UJI]</h1></body></html>\n", encoding="utf-8")
            teks = "[ADAPTER UJI] membuat index.html"
        return HasilAgent(teks=teks, model="uji", masuk=0, keluar=0, biaya_usd=0.0, sesi=None)
