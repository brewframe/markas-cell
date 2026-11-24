"""Laporan harian Markas Cell ke WhatsApp (lewat Fonnte), lengkap per agent.

Analogi: setiap malam, Jarvis menulis "buku harian kantor": berapa perintah masuk,
apa yang dikerjakan TIAP agent, dan berapa token yang dihabiskan. Lalu kurir (wa.py)
mengirimkannya ke HP Cell. Semua angka diambil LANGSUNG dari database (data/markas.db),
termasuk token yang dicatat worker dari keluaran Claude Code. Tidak ada angka contoh.

Tiga cara memicu laporan:
    1. Jadwal otomatis jam 20.00          -> python backend/laporan_wa.py --kirim
    2. Tombol "Kirim laporan ke WA" di web -> POST /api/laporan/wa
    3. Perintah ke Jarvis, misalnya "kirim laporan ke WA"

Cara pakai manual:
    python backend/laporan_wa.py            -> pratinjau di layar (tidak mengirim apa pun)
    python backend/laporan_wa.py --kirim    -> kirim ke WA

Setelan di .env: FONNTE_TOKEN dan WA_TUJUAN (lihat wa.py).
Kalau FONNTE_TOKEN kosong, laporan tetap disimpan ke laporan/harian-TANGGAL.md
dan dicetak tautan wa.me untuk mengirim manual.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import database as data  # noqa: E402
import db  # noqa: E402
import wa  # noqa: E402

FOLDER_LAPORAN = Path(os.environ.get("MARKAS_LAPORAN", config.FOLDER / "laporan"))
PERAN = {"orkestrator": "membagi tugas", "specialist": "mengerjakan", "qa": "memeriksa"}


def _angka(n) -> str:
    return f"{int(n or 0):,}".replace(",", ".")


def _token_agent(con, dari: str, sampai: str) -> dict:
    """Token per agent pada rentang waktu, dari tabel token (data demo tidak dihitung)."""
    hasil = {}
    for r in con.execute("""SELECT agent, SUM(masuk) masuk, SUM(keluar) keluar, COUNT(*) panggilan,
                                   SUM(biaya_usd) biaya, GROUP_CONCAT(DISTINCT model) model
                            FROM token WHERE waktu BETWEEN ? AND ? AND COALESCE(sumber,'') <> 'demo'
                            GROUP BY agent""", (dari, sampai)):
        hasil[r["agent"]] = {"masuk": r["masuk"] or 0, "keluar": r["keluar"] or 0, "panggilan": r["panggilan"],
                             "biaya_usd": r["biaya"] or 0.0, "model": r["model"] or "-"}
    return hasil


def kumpulkan(con, tanggal: str) -> dict:
    """Ambil angka-angka satu hari dari database."""
    dari, sampai = tanggal + " 00:00:00", tanggal + " 23:59:59"
    satu = lambda sql, *a: con.execute(sql, a).fetchone()[0]  # noqa: E731
    token = _token_agent(con, dari, sampai)
    kosong = {"masuk": 0, "keluar": 0, "panggilan": 0, "biaya_usd": 0.0, "model": "-"}

    per_agent = []
    for nama in list(config.AKTIF) + sorted(a for a in token if a not in config.AKTIF):
        peran = config.AKTIF.get(nama, "lapor")
        a = {"agent": nama, "peran": peran, "token": token.get(nama, kosong)}
        st = con.execute("SELECT keadaan, pesan FROM agent WHERE id=?", (nama,)).fetchone()
        a["keadaan"], a["pesan"] = (st["keadaan"], st["pesan"] or "") if st else ("-", "")
        if peran == "orkestrator":
            a["dipecah"] = satu("SELECT COUNT(*) FROM perintah WHERE status='DIPECAH' AND diperbarui BETWEEN ? AND ?", dari, sampai)
            a["ditolak"] = satu("SELECT COUNT(*) FROM perintah WHERE status IN ('DITOLAK','GAGAL') AND diperbarui BETWEEN ? AND ?", dari, sampai)
        elif peran == "specialist":
            a["selesai"] = satu("SELECT COUNT(*) FROM tugas WHERE agent=? AND status='APPROVED' AND selesai BETWEEN ? AND ?", nama, dari, sampai)
            a["perlu_ok"] = satu("SELECT COUNT(*) FROM tugas WHERE agent=? AND status='REVIEW' AND qa_status='lulus'", nama)
            a["jalan"] = satu("SELECT COUNT(*) FROM tugas WHERE agent=? AND status IN ('PENDING','ASSIGNED','RUNNING','REVISION')", nama)
            a["gagal"] = satu("SELECT COUNT(*) FROM tugas WHERE agent=? AND status='FAILED' AND diperbarui BETWEEN ? AND ?", nama, dari, sampai)
        elif peran == "qa":
            a["lulus"] = satu("SELECT COUNT(*) FROM qa_hasil WHERE penilai=? AND lulus=1 AND waktu BETWEEN ? AND ?", nama, dari, sampai)
            a["tolak"] = satu("SELECT COUNT(*) FROM qa_hasil WHERE penilai=? AND lulus=0 AND waktu BETWEEN ? AND ?", nama, dari, sampai)
        per_agent.append(a)

    return {
        "tanggal": tanggal,
        "perintah": satu("SELECT COUNT(*) FROM perintah WHERE dibuat BETWEEN ? AND ?", dari, sampai),
        "selesai": [dict(r) for r in con.execute(
            "SELECT id, judul, agent FROM tugas WHERE status='APPROVED' AND selesai BETWEEN ? AND ? ORDER BY id", (dari, sampai))],
        "gagal": [dict(r) for r in con.execute(
            "SELECT id, judul, agent, error FROM tugas WHERE status='FAILED' AND diperbarui BETWEEN ? AND ? ORDER BY id", (dari, sampai))],
        "perlu_ok": [dict(r) for r in con.execute(
            "SELECT id, judul, agent FROM tugas WHERE status='REVIEW' AND qa_status='lulus' ORDER BY id")],
        "berjalan": satu("SELECT COUNT(*) FROM tugas WHERE status IN ('PENDING','ASSIGNED','RUNNING','REVISION')"),
        "per_agent": per_agent,
        "token_total": sum(t["masuk"] + t["keluar"] for t in token.values()),
        "biaya_total": sum(t["biaya_usd"] for t in token.values()),
        "worker": data.info_layanan(con, "worker"),
    }


def _baris_agent(a: dict) -> str:
    t = a["token"]
    tok = f"{_angka(t['masuk'] + t['keluar'])} token" + (f" (±${t['biaya_usd']:.2f})" if t["biaya_usd"] else "")
    if a["peran"] == "orkestrator":
        kerja = f"{a['dipecah']} perintah dipecah" + (f", {a['ditolak']} ditolak/gagal" if a["ditolak"] else "")
    elif a["peran"] == "specialist":
        kerja = f"{a['selesai']} selesai, {a['perlu_ok']} tunggu OK, {a['jalan']} jalan" + (f", {a['gagal']} gagal" if a["gagal"] else "")
    elif a["peran"] == "qa":
        kerja = f"{a['lulus']} QA lulus, {a['tolak']} dikembalikan"
    else:
        kerja = "melapor dari luar Markas"
    status = {"kerja": "sedang kerja", "menunggu": "tunggu OK", "santai": "santai"}.get(a["keadaan"], a["keadaan"])
    pesan = f": {a['pesan'][:60]}" if a["keadaan"] == "kerja" and a["pesan"] else ""
    return f"• *{a['agent']}* ({PERAN.get(a['peran'], a['peran'])}) {status}{pesan}\n   {kerja} · {tok}"


def tulis(d: dict, tanggal: str | None = None, alamat_web: str = "http://localhost:8300/lama/markas.html") -> str:
    """Susun pesan WA. *teks* = tebal di WhatsApp."""
    tanggal = tanggal or d["tanggal"]
    baris = ["*Laporan Markas Cell*", datetime.strptime(tanggal, "%Y-%m-%d").strftime("%d %b %Y") + f" · {datetime.now():%H:%M}", ""]
    baris.append(f"📥 Perintah masuk: {d['perintah']}")
    baris.append(f"✅ Tugas selesai: {len(d['selesai'])}")
    baris += [f"   • #{x['id']} {x['judul']} ({x['agent']})" for x in d["selesai"][:8]]
    if d["perlu_ok"]:
        baris.append(f"🟡 *Menunggu OK kamu: {len(d['perlu_ok'])}*")
        baris += [f"   • #{x['id']} {x['judul']} ({x['agent']})" for x in d["perlu_ok"][:8]]
    if d["gagal"]:
        baris.append(f"🔴 Gagal: {len(d['gagal'])}")
        baris += [f"   • #{x['id']} {x['judul']}: {(x['error'] or '-')[:80]}" for x in d["gagal"][:5]]
    baris.append(f"⏳ Masih dikerjakan/antre: {d['berjalan']}")
    baris += ["", "*Laporan per agent*"]
    baris += [_baris_agent(a) for a in d["per_agent"]]
    baris.append("")
    baris.append(f"🪙 Total token: {_angka(d['token_total'])}" + (f" (±${d['biaya_total']:.2f})" if d["biaya_total"] else ""))
    baris.append("⚙️ Worker: " + ("hidup" if d["worker"]["hidup"] else "MATI, tugas tidak dikerjakan"))
    if d["perlu_ok"]:
        baris.append(f"Setujui di {alamat_web}")
    return "\n".join(baris)


def buat(con, tanggal: str | None = None) -> str:
    tanggal = tanggal or datetime.now().strftime("%Y-%m-%d")
    return tulis(kumpulkan(con, tanggal), tanggal)


def simpan(teks: str, tanggal: str) -> Path:
    FOLDER_LAPORAN.mkdir(exist_ok=True)
    file = FOLDER_LAPORAN / f"harian-{tanggal}.md"
    file.write_text(teks + "\n", encoding="utf-8")
    return file


def kirim_laporan(con, tanggal: str | None = None, oleh: str = "jadwal") -> dict:
    """Buat, simpan, kirim, lalu catat di log Markas. Dipakai server, jadwal, dan perintah Jarvis."""
    tanggal = tanggal or datetime.now().strftime("%Y-%m-%d")
    teks = buat(con, tanggal)
    simpan(teks, tanggal)
    h = wa.kirim(teks)
    data.catat(con, "sistem", f"Laporan WA ({oleh}): {h['pesan']}", "ok" if h["terkirim"] else "warn")
    return {**h, "teks": teks}


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Laporan harian Markas Cell ke WhatsApp")
    p.add_argument("--kirim", action="store_true", help="benar-benar kirim (tanpa ini hanya pratinjau)")
    p.add_argument("--tanggal", default=datetime.now().strftime("%Y-%m-%d"), help="YYYY-MM-DD (bawaan: hari ini)")
    arg = p.parse_args(argv)

    if not config.FILE_DB.exists():
        print("Database belum ada. Jalankan MULAI.bat sekali dulu.")
        return 1
    db.siapkan(config.FILE_DB)
    with db.koneksi(config.FILE_DB) as con:
        if not arg.kirim:
            teks = buat(con, arg.tanggal)
            print(teks)
            print(f"\n(disimpan di {simpan(teks, arg.tanggal)})")
            print("Ini pratinjau. Tambahkan --kirim untuk mengirim ke WA.")
            return 0
        h = kirim_laporan(con, arg.tanggal, oleh="jadwal")
    print(h["teks"])
    print("\n" + h["pesan"])
    if h.get("tautan") and not h["terkirim"]:
        print(h["tautan"])
    return 0 if h["terkirim"] or h["cara"] == "manual" else 1


if __name__ == "__main__":
    sys.exit(main())
