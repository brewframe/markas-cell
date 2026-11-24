"""Worker Markas Cell: proses terpisah yang BENAR-BENAR menjalankan agent.

Analogi: kalau server (main.py) adalah resepsionis, worker adalah dapur.
Resepsionis hanya mencatat pesanan; dapur yang memasak. Kalau dapur mati,
resepsionis tetap buka dan dashboard menampilkan status STALE.

Satu putaran worker (diulang tiap 2 detik):
  1. Jarvis   : ambil satu perintah BARU, pecah menjadi tugas PENDING
  2. Dispatcher: PENDING -> ASSIGNED ke specialist aktif
  3. Bayu     : klaim satu tugas ASSIGNED/REVISION -> RUNNING, jalankan Claude Code,
                simpan file hasil -> REVIEW (atau coba lagi dengan jeda kalau gagal)
  4. Vera     : QA untuk tugas REVIEW yang belum diperiksa
  5. Kurir WA : kabari Cell lewat WhatsApp kalau ada tugas menunggu OK atau gagal

Cara jalan:
  python backend/worker.py              (terus berjalan, Ctrl+C untuk berhenti)
  python backend/worker.py --sekali     (satu putaran saja, untuk tes)
  python backend/worker.py --adapter uji (adapter tes, tidak memanggil AI)
"""
from __future__ import annotations

import argparse
import os
import socket
import sqlite3
import sys
import threading
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import database as data  # noqa: E402
import db  # noqa: E402
import orkestrator  # noqa: E402
import qa  # noqa: E402
import tugas as T  # noqa: E402
import wa  # noqa: E402
from adapter import AdapterAgent, AdapterError, pilih  # noqa: E402

NAMA = f"worker@{socket.gethostname()}:{os.getpid()}"
INFO = {"nama": NAMA}


def jantung(berhenti: threading.Event) -> None:
    """Detak tiap 5 detik di thread terpisah, supaya dashboard tahu worker hidup
    walaupun agent sedang mengerjakan tugas panjang."""
    while not berhenti.is_set():
        try:
            with db.koneksi() as con:
                data.detak(con, "worker", INFO)
        except Exception:
            pass
        berhenti.wait(5)

PROMPT_SPECIALIST = """PERAN: SPECIALIST WEB ({agent}, Studio Web Markas Cell)
Kerjakan tugas berikut dengan membuat atau mengubah file di folder kerja ini (folder saat ini).

Judul: {judul}
Tujuan: {tujuan}
Kriteria lulus (QA akan memeriksa satu per satu):
{kriteria}
{revisi}
Aturan wajib:
- Tulis semua file HANYA di folder kerja ini. Jangan membuat folder di luar.
- Jangan menulis kunci API, kata sandi, atau data pribadi asli. Pakai contoh yang jelas palsu.
- Jangan mengarang angka/fakta sebagai fakta. Kalau perlu contoh, beri tanda [CONTOH].
- Halaman web harus bisa dibuka langsung di browser (HTML + CSS, tanpa build tool).
Setelah selesai, balas dengan ringkasan singkat: file apa saja yang dibuat dan isinya."""


def _revisi(con, t: dict) -> str:
    if not t["revisi"]:
        return ""
    r = con.execute("SELECT alasan FROM riwayat_tugas WHERE tugas=? AND ke='REVISION' AND ditolak=0 "
                    "ORDER BY id DESC LIMIT 1", (t["id"],)).fetchone()
    return (f"\nINI REVISI ke-{t['revisi']}. File versi sebelumnya ada di folder ini. Perbaiki sesuai catatan:\n"
            f"{r['alasan'] if r else '-'}\n")


def kerjakan(con, t: dict, adapter: AdapterAgent) -> None:
    """Jalankan satu tugas RUNNING sampai REVIEW, atau jadwalkan ulang kalau gagal."""
    tid = t["id"]
    folder = T.folder_kerja(con, tid)
    prompt = PROMPT_SPECIALIST.format(agent=t["agent"], judul=t["judul"], tujuan=t["tujuan"],
                                      kriteria="\n".join(f"- {k}" for k in t["kriteria"]), revisi=_revisi(con, t))
    try:
        h = adapter.jalankan(prompt, folder, boleh_tulis=True, batas_detik=config.BATAS_WAKTU_AGENT)
        data.catat_token(con, t["agent"], h.model, h.masuk, h.keluar, sumber="worker", biaya_usd=h.biaya_usd,
                         kunci=h.sesi, tugas=tid)
        artefak = T.rekam_artefak(con, tid, t["revisi"])
        if not artefak:
            raise AdapterError("agent selesai tanpa menghasilkan file apa pun")
        con.execute("UPDATE tugas SET ringkasan=?, adapter=? WHERE id=?", (h.teks[:4000], adapter.nama, tid))
        con.commit()
        T.pindah(con, tid, "REVIEW", t["agent"], "worker", f"{len(artefak)} file hasil", qa_status="menunggu",
                 qa_percobaan=0, error="")
        T.handoff(con, tid, t["agent"], "Vera", {"ringkasan": h.teks[:1000], "file": [a["path"] for a in artefak],
                                                 "kriteria": t["kriteria"]})
    except AdapterError as e:
        T.jadwal_ulang(con, tid, t["agent"], str(e))


def putaran(adapter: AdapterAgent) -> dict:
    """Satu putaran kerja. Setiap langkah memakai koneksi sendiri supaya error satu langkah tidak menular."""
    hasil = {"perintah": 0, "dibagi": 0, "dikerjakan": 0, "qa": 0}
    with db.koneksi() as con:
        data.detak(con, "worker", INFO)
        p = con.execute("SELECT * FROM perintah WHERE status='BARU' ORDER BY id LIMIT 1").fetchone()
        if p:
            orkestrator.proses_perintah(con, dict(p), adapter)
            hasil["perintah"] = 1
    with db.koneksi() as con:
        hasil["dibagi"] = len(orkestrator.bagikan(con))
    for agent in config.SPECIALIST:
        with db.koneksi() as con:
            t = T.klaim(con, agent, NAMA)
            if t:
                con.execute("UPDATE tugas SET adapter=? WHERE id=?", (adapter.nama, t["id"]))
                con.commit()
                INFO["tugas"] = t["id"]
                try:
                    kerjakan(con, t, adapter)
                finally:
                    INFO.pop("tugas", None)
                hasil["dikerjakan"] += 1
    with db.koneksi() as con:
        r = con.execute("SELECT id FROM tugas WHERE status='REVIEW' AND qa_status='menunggu' ORDER BY id LIMIT 1").fetchone()
        if r:
            qa.periksa(con, T.ambil(con, r["id"]), adapter)
            hasil["qa"] = 1
    with db.koneksi() as con:      # kabar WA: tugas baru menunggu OK / gagal (kalau Fonnte diatur)
        hasil["kabar_wa"] = wa.kabari_perubahan(con)
    return hasil


def pulihkan_yatim() -> int:
    """Tugas RUNNING milik worker yang sudah mati dikembalikan ke antrean (bukan dikerjakan dobel)."""
    n = 0
    with db.koneksi() as con:
        for r in con.execute("SELECT id, worker FROM tugas WHERE status='RUNNING'").fetchall():
            if r["worker"] != NAMA:
                try:
                    T.pindah(con, r["id"], "ASSIGNED", "sistem", "sistem", f"worker {r['worker']} berhenti, dikembalikan ke antrean")
                    n += 1
                except T.TransisiDitolak:
                    pass
    return n


def main():
    p = argparse.ArgumentParser(description="Worker Markas Cell")
    p.add_argument("--sekali", action="store_true", help="jalankan satu putaran lalu berhenti")
    p.add_argument("--adapter", help="claude (bawaan) atau uji")
    p.add_argument("--jeda", type=float, default=2.0)
    arg = p.parse_args()
    os.environ.update({k: v for k, v in config.baca_env().items() if k.startswith("MARKAS_") and k not in os.environ})
    adapter = pilih(arg.adapter)
    if adapter.nama == "claude" and not getattr(adapter, "bin", None):
        print("[worker] Program `claude` (Claude Code) tidak ditemukan. Pasang & login dulu, lalu jalankan ulang.")
        sys.exit(1)
    try:
        info = db.siapkan()
    except sqlite3.IntegrityError:      # server sedang memigrasi di saat yang sama: tunggu sebentar
        time.sleep(3)
        info = db.siapkan()
    with db.koneksi() as con:
        data.isi_tim(con)
        lain = data.info_layanan(con, "worker")
    if lain["hidup"] and lain["info"].get("nama") != NAMA:
        print(f"[worker] Worker lain masih hidup ({lain['info'].get('nama')}). Jalankan satu worker saja.")
        sys.exit(1)
    INFO["adapter"] = adapter.nama
    berhenti = threading.Event()
    detak = threading.Thread(target=jantung, args=(berhenti,), daemon=True)
    detak.start()
    print(f"[worker] {NAMA} siap. Adapter: {adapter.nama}. Database versi {info['versi']}.")
    yatim = pulihkan_yatim()
    if yatim:
        print(f"[worker] {yatim} tugas yatim dikembalikan ke antrean")
    try:
        jalan(adapter, arg)
    except KeyboardInterrupt:
        print("[worker] berhenti")
    finally:
        berhenti.set()
        detak.join(timeout=3)
        with db.koneksi() as con:      # beri tahu dashboard: worker sudah berhenti (bukan crash)
            con.execute("DELETE FROM layanan WHERE nama='worker'")


def jalan(adapter: AdapterAgent, arg) -> None:
    while True:
        try:
            h = putaran(adapter)
            if any(h.values()):
                print(f"[worker] {time.strftime('%H:%M:%S')} {h}")
        except Exception:   # jangan biarkan satu error mematikan worker; catat lalu lanjut
            traceback.print_exc()
            try:
                with db.koneksi() as con:
                    data.catat(con, "sistem", f"Worker error: {traceback.format_exc(limit=1)[-300:]}", "error")
            except Exception:
                pass
        if arg.sekali:
            break
        time.sleep(arg.jeda)


if __name__ == "__main__":
    main()
