"""Adapter = colokan otak AI untuk agent.

Dispatcher dan worker tidak peduli otaknya apa. Mereka cukup memanggil
adapter.jalankan(prompt, folder, ...) dan menerima HasilAgent.
Ganti penyedia AI = tambah satu file adapter, tanpa mengubah worker.

  claude  -> Claude Code headless (`claude -p`) di laptop Cell (pilihan Cell, 15 Nov 2026)
  uji     -> adapter tes untuk pengujian otomatis. Selalu berlabel "UJI", tidak memanggil AI.
"""
from __future__ import annotations

import os

from .dasar import AdapterAgent, AdapterError, HasilAgent  # noqa: F401


def pilih(nama: str | None = None) -> AdapterAgent:
    nama = (nama or os.environ.get("MARKAS_ADAPTER") or "claude").lower()
    if nama == "claude":
        from .claude_code import AdapterClaudeCode
        return AdapterClaudeCode()
    if nama == "uji":
        from .uji import AdapterUji
        return AdapterUji()
    raise ValueError(f"adapter '{nama}' tidak dikenal (pilihan: claude, uji)")
