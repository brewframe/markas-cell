"""Jarvis Orchestrator: memecah perintah Cell menjadi 1-3 tugas berkontrak.

Analogi: Jarvis kepala pelayan. Cell bilang "buatkan landing page laundry",
Jarvis menulis struk yang jelas untuk dapur: apa yang dibuat, untuk apa, dan
kapan dianggap selesai (kriteria lulus). Jarvis tidak memasak sendiri.
"""
from __future__ import annotations

import json

import config
import database as data
import tugas as T
from adapter import AdapterAgent, AdapterError
from adapter.dasar import ambil_json
from db import sekarang

PROMPT = """PERAN: JARVIS (orchestrator Markas Cell)
Kamu memecah perintah owner menjadi tugas untuk specialist web bernama {specialist}.
Specialist hanya bisa membuat/mengubah FILE (HTML, CSS, JS, Markdown). Ia tidak bisa
menjalankan perintah, mengakses internet, mengirim pesan, atau memakai data rahasia.

Perintah owner:
\"\"\"{teks}\"\"\"

Balas HANYA dengan JSON, tanpa penjelasan lain:
{{"tugas": [{{"judul": "maks 80 huruf", "tujuan": "hasil yang harus dibuat", "kriteria": ["kriteria lulus yang bisa dicek", "..."]}}]}}
Aturan:
- Biasanya cukup 1 tugas. Satu website/halaman = SATU tugas, jangan dipecah per bagian (HTML, CSS, JS),
  karena tiap tugas dikerjakan di folder terpisah.
- Buat 2 atau 3 tugas HANYA kalau hasilnya benar-benar terpisah dan tidak saling bergantung
  (misalnya: landing page + teks caption promosi).
- 2 sampai 6 kriteria per tugas, bisa dicek dari isi file, bahasa Indonesia.
Kalau perintah tidak bisa dikerjakan specialist web (misalnya mengirim WA, transaksi uang, butuh data
rahasia), balas: {{"tolak": "alasan singkat"}}"""


def proses_perintah(con, p: dict, adapter: AdapterAgent) -> list[int]:
    """Ubah satu perintah BARU menjadi tugas PENDING. Mengembalikan id tugas yang dibuat."""
    pid = p["id"]
    berubah = con.execute("UPDATE perintah SET status='DIPROSES', diperbarui=? WHERE id=? AND status='BARU'",
                          (sekarang(), pid)).rowcount
    con.commit()
    if not berubah:
        return []     # sudah diambil proses lain
    data.set_status(con, "Jarvis", "kerja", f"Memecah perintah #{pid}")
    try:
        folder = config.HASIL / f"perintah-{pid}"
        folder.mkdir(parents=True, exist_ok=True)
        h = adapter.jalankan(PROMPT.format(specialist=config.SPECIALIST[0], teks=p["teks"]), folder,
                             boleh_tulis=False, batas_detik=300)
        data.catat_token(con, "Jarvis", h.model, h.masuk, h.keluar, sumber="worker", biaya_usd=h.biaya_usd,
                         kunci=h.sesi)
        rencana = ambil_json(h.teks)
        if rencana.get("tolak"):
            con.execute("UPDATE perintah SET status='DITOLAK', catatan=?, diperbarui=? WHERE id=?",
                        (str(rencana["tolak"])[:500], sekarang(), pid))
            data.catat(con, "Jarvis", f"Perintah #{pid} ditolak: {rencana['tolak']}", "warn", commit=False)
            con.commit()
            return []
        daftar = rencana.get("tugas") or []
        if not isinstance(daftar, list) or not daftar:
            raise AdapterError("rencana Jarvis kosong")
        ids = []
        for t in daftar[:3]:
            judul = str(t.get("judul") or "").strip()[:120]
            if len(judul) < 3:
                continue
            kriteria = [str(k)[:300] for k in (t.get("kriteria") or [])][:6]
            tid = T.buat(con, judul, str(t.get("tujuan") or judul)[:1500], kriteria, config.SPECIALIST[0],
                         p["prioritas"], oleh="Jarvis", perintah=pid)
            T.handoff(con, tid, "Jarvis", config.SPECIALIST[0],
                      {"perintah": p["teks"], "tujuan": t.get("tujuan"), "kriteria": kriteria,
                       "batasan": ["hanya file di folder kerja", "tanpa perintah shell", "tanpa data rahasia"]})
            ids.append(tid)
        if not ids:
            raise AdapterError("tidak ada tugas valid di rencana Jarvis")
        con.execute("UPDATE perintah SET status='DIPECAH', catatan=?, diperbarui=? WHERE id=?",
                    (f"menjadi tugas {', '.join('#' + str(i) for i in ids)}", sekarang(), pid))
        con.commit()
        return ids
    except (AdapterError, ValueError, json.JSONDecodeError) as e:
        con.execute("UPDATE perintah SET status='GAGAL', catatan=?, diperbarui=? WHERE id=?",
                    (str(e)[:500], sekarang(), pid))
        data.catat(con, "Jarvis", f"Perintah #{pid} gagal dipecah: {e}", "error", commit=False)
        con.commit()
        return []
    finally:
        data.set_status(con, "Jarvis", "santai", "")


def bagikan(con) -> list[int]:
    """Dispatcher: PENDING -> ASSIGNED untuk agent specialist yang aktif."""
    hasil = []
    for r in con.execute("SELECT t.id, t.agent FROM tugas t JOIN agent a ON a.id=t.agent "
                         "WHERE t.status='PENDING' AND a.aktif=1 AND a.peran='specialist' ORDER BY t.id").fetchall():
        try:
            T.pindah(con, r["id"], "ASSIGNED", "dispatcher", "dispatcher", f"ditugaskan ke {r['agent']}")
            hasil.append(r["id"])
        except T.TransisiDitolak:
            pass
    return hasil
