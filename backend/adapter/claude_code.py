"""Adapter Claude Code headless: menjalankan `claude -p` di folder kerja tugas.

Kenapa ini aman:
- Perintah shell (Bash) dan akses web dimatikan. Agent hanya bisa membaca/menulis file.
- `cwd` = folder kerja tugas, jadi file yang ditulis berada di hasil/tugas-<id>-<waktu>/.
- Untuk QA dan Jarvis, alat tulis juga dimatikan (hanya membaca).
- Tidak ada API key yang disimpan Markas: Claude Code memakai login yang sudah ada di laptop.

Setelan lewat .env (opsional):
  MARKAS_CLAUDE_BIN    lokasi program claude (bawaan: dicari otomatis)
  MARKAS_CLAUDE_MODEL  model, misalnya sonnet (bawaan: setelan Claude Code)
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from .dasar import AdapterAgent, AdapterError, HasilAgent

ALAT_TULIS = ["Read", "Write", "Edit", "Glob", "Grep"]
ALAT_BACA = ["Read", "Glob", "Grep"]
DILARANG = ["Bash", "WebFetch", "WebSearch", "NotebookEdit", "Task"]


class AdapterClaudeCode(AdapterAgent):
    nama = "claude"

    def __init__(self):
        self.bin = os.environ.get("MARKAS_CLAUDE_BIN") or shutil.which("claude")
        self.model = os.environ.get("MARKAS_CLAUDE_MODEL")

    def perintah(self, boleh_tulis: bool) -> list[str]:
        if not self.bin:
            raise AdapterError("program `claude` tidak ditemukan. Pasang Claude Code dan login dulu.")
        cmd = [self.bin, "-p", "--output-format", "json",
               "--permission-mode", "acceptEdits" if boleh_tulis else "default",
               "--allowedTools", *(ALAT_TULIS if boleh_tulis else ALAT_BACA),
               "--disallowedTools", *(DILARANG + ([] if boleh_tulis else ["Write", "Edit"]))]
        if self.model:
            cmd += ["--model", self.model]
        return cmd

    def jalankan(self, prompt: str, folder: Path, boleh_tulis: bool, batas_detik: int) -> HasilAgent:
        cmd = self.perintah(boleh_tulis)
        try:
            p = subprocess.run(cmd, input=prompt, cwd=folder, capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=batas_detik)
        except subprocess.TimeoutExpired:
            raise AdapterError(f"agent melewati batas waktu {batas_detik} detik")
        except OSError as e:
            raise AdapterError(f"gagal menjalankan claude: {e}")
        try:
            j = json.loads(p.stdout)
        except json.JSONDecodeError:
            raise AdapterError(f"keluaran claude bukan JSON (kode {p.returncode}): {(p.stderr or p.stdout)[:300]}")
        if j.get("is_error") or p.returncode != 0:
            raise AdapterError(f"claude melaporkan error: {str(j.get('result') or p.stderr)[:300]}")
        u = j.get("usage") or {}
        masuk = sum(int(u.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))
        model = next(iter(j.get("modelUsage") or {}), self.model or "claude")
        return HasilAgent(teks=str(j.get("result") or ""), model=model, masuk=masuk,
                          keluar=int(u.get("output_tokens") or 0), biaya_usd=j.get("total_cost_usd"),
                          sesi=j.get("session_id"), mentah={k: j.get(k) for k in ("num_turns", "duration_ms", "permission_denials")})
