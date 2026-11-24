"""Tugas Markas Cell 2.0: kontrak, state machine, riwayat, artefak, handoff, QA, persetujuan.

Analogi: tugas = struk pesanan restoran. Struk hanya boleh berpindah meja sesuai aturan:
kasir -> dapur -> pencicip -> pemilik. Struk tidak bisa melompat dari kasir langsung ke
"sudah disajikan", dan setiap perpindahan dicatat siapa yang memindahkan dan kenapa.

    PENDING -> ASSIGNED -> RUNNING -> REVIEW -> APPROVED
                              |   ^      |
                              v   |      v
                           FAILED  +-- REVISION
"""
from __future__ import annotations

import hashlib
import json
import mimetypes
from datetime import datetime, timedelta
from pathlib import Path

import config
import database as data
from db import sekarang

# (dari, ke) -> peran yang boleh melakukannya
TRANSISI: dict[tuple[str, str], set[str]] = {
    ("PENDING", "ASSIGNED"): {"dispatcher"},
    ("ASSIGNED", "RUNNING"): {"worker"},
    ("RUNNING", "REVIEW"): {"worker"},           # wajib ada artefak
    ("RUNNING", "ASSIGNED"): {"worker", "sistem"},  # coba lagi setelah error / worker crash
    ("RUNNING", "FAILED"): {"worker"},
    ("REVIEW", "REVISION"): {"qa", "owner"},
    ("REVIEW", "FAILED"): {"qa", "owner"},       # batas revisi habis / Cell menolak final
    ("REVISION", "RUNNING"): {"worker"},
    ("REVIEW", "APPROVED"): {"owner"},           # wajib QA lulus
    ("FAILED", "PENDING"): {"owner"},            # Cell memilih "coba lagi"
}


class TransisiDitolak(Exception):
    """Perubahan status yang melanggar aturan. API menjawab 409."""


class TidakAda(Exception):
    pass


def _rows(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]


def _tugas(row) -> dict:
    t = dict(row)
    t["kriteria"] = json.loads(t.get("kriteria") or "[]")
    return t


def ambil(con, tid: int) -> dict:
    r = con.execute("SELECT * FROM tugas WHERE id=?", (tid,)).fetchone()
    if r is None:
        raise TidakAda(f"tugas #{tid} tidak ada")
    return _tugas(r)


# ---------- membuat ----------
def buat_perintah(con, teks: str, prioritas: str, oleh: str) -> int:
    cur = con.execute("INSERT INTO perintah (teks, prioritas, oleh, dibuat, diperbarui) VALUES (?,?,?,?,?)",
                      (teks, prioritas, oleh, sekarang(), sekarang()))
    data.catat(con, "Cell", f"Perintah #{cur.lastrowid} ke Jarvis: {teks[:120]}", "info", commit=False)
    con.commit()
    return cur.lastrowid


def buat(con, judul: str, tujuan: str, kriteria: list[str], agent: str, prioritas: str = "normal",
         oleh: str = "owner", perintah: int | None = None) -> int:
    if prioritas not in data.PRIORITAS:
        raise ValueError(f"prioritas harus salah satu dari {data.PRIORITAS}")
    r = con.execute("SELECT aktif, peran FROM agent WHERE id=?", (agent,)).fetchone()
    if r is None:
        raise ValueError(f"agent '{agent}' tidak ada")
    if not r["aktif"] or r["peran"] != "specialist":
        raise ValueError(f"{agent} belum aktif sebagai specialist di Markas 2.0 "
                         f"(yang aktif: {', '.join(config.SPECIALIST)})")
    kriteria = [k.strip() for k in kriteria if k and k.strip()] or ["Hasil berupa file yang bisa dibuka dan sesuai tujuan"]
    cur = con.execute(
        """INSERT INTO tugas (perintah, judul, tujuan, kriteria, agent, prioritas, dibuat_oleh, dibuat, diperbarui)
           VALUES (?,?,?,?,?,?,?,?,?)""",
        (perintah, judul, tujuan or judul, json.dumps(kriteria, ensure_ascii=False), agent, prioritas, oleh,
         sekarang(), sekarang()))
    tid = cur.lastrowid
    con.execute("INSERT INTO riwayat_tugas (tugas, dari, ke, pelaku, peran, alasan, waktu) VALUES (?,?,?,?,?,?,?)",
                (tid, None, "PENDING", oleh, "owner" if oleh == "Cell" else oleh, "tugas dibuat", sekarang()))
    data.catat(con, agent, f"Tugas baru #{tid}: {judul}", "info", commit=False)
    con.commit()
    return tid


# ---------- state machine ----------
def pindah(con, tid: int, ke: str, pelaku: str, peran: str, alasan: str = "", **kolom) -> dict:
    """Satu-satunya pintu untuk mengubah status tugas.

    Ditolak (dan dicatat) kalau: transisi tidak ada di TRANSISI, peran tidak berhak,
    syarat khusus tidak terpenuhi, atau tugas sudah diubah proses lain lebih dulu.
    """
    t = ambil(con, tid)
    dari = t["status"]

    def tolak(sebab: str):
        con.execute("INSERT INTO riwayat_tugas (tugas, dari, ke, pelaku, peran, alasan, ditolak, waktu) "
                    "VALUES (?,?,?,?,?,?,1,?)", (tid, dari, ke, pelaku, peran, sebab, sekarang()))
        data.catat(con, pelaku, f"DITOLAK #{tid} {dari}->{ke}: {sebab}", "error", commit=False)
        con.commit()
        raise TransisiDitolak(sebab)

    if (dari, ke) not in TRANSISI:
        tolak(f"transisi {dari} -> {ke} tidak diizinkan")
    if peran not in TRANSISI[(dari, ke)]:
        tolak(f"peran '{peran}' tidak boleh memindah {dari} -> {ke}")
    if ke == "REVIEW" and not con.execute("SELECT 1 FROM artefak WHERE tugas=? AND versi=?",
                                          (tid, t["revisi"])).fetchone():
        tolak("belum ada artefak hasil kerja")
    if ke == "APPROVED" and t["qa_status"] != "lulus":
        tolak(f"QA belum lulus (status QA: {t['qa_status']})")

    kolom["diperbarui"] = sekarang()
    if ke == "RUNNING":
        kolom.setdefault("mulai", sekarang())
    if ke in ("APPROVED", "FAILED"):
        kolom["selesai"] = sekarang()
    set_sql = ", ".join(f"{k}=?" for k in kolom)
    cur = con.execute(f"UPDATE tugas SET status=?, {set_sql} WHERE id=? AND status=?",
                      [ke, *kolom.values(), tid, dari])
    if cur.rowcount != 1:     # ada proses lain yang lebih dulu mengubah tugas ini
        tolak(f"status tugas sudah berubah oleh proses lain (bukan {dari} lagi)")
    con.execute("INSERT INTO riwayat_tugas (tugas, dari, ke, pelaku, peran, alasan, waktu) VALUES (?,?,?,?,?,?,?)",
                (tid, dari, ke, pelaku, peran, alasan, sekarang()))
    level = {"APPROVED": "ok", "FAILED": "error", "REVISION": "warn", "REVIEW": "warn"}.get(ke, "info")
    data.catat(con, t["agent"], f"Tugas #{tid} {dari} -> {ke}" + (f" ({alasan})" if alasan else ""), level, commit=False)
    con.commit()
    data.turunkan_keadaan(con, t["agent"])
    return ambil(con, tid)


def klaim(con, agent: str, worker: str) -> dict | None:
    """Worker mengambil SATU tugas (ASSIGNED atau REVISION). Aman walau dua worker berebut:
    pindah() hanya berhasil kalau status belum diubah proses lain."""
    kandidat = con.execute(
        """SELECT id, status FROM tugas WHERE agent=? AND status IN ('ASSIGNED','REVISION')
           AND (coba_setelah IS NULL OR coba_setelah <= ?)
           ORDER BY CASE prioritas WHEN 'tinggi' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, id LIMIT 3""",
        (agent, sekarang())).fetchall()
    for k in kandidat:
        try:
            return pindah(con, k["id"], "RUNNING", agent, "worker", "diambil worker",
                          worker=worker, percobaan=ambil(con, k["id"])["percobaan"] + 1)
        except TransisiDitolak:
            continue
    return None


def jadwal_ulang(con, tid: int, pelaku: str, error: str) -> dict:
    """Gagal di tengah jalan: coba lagi dengan jeda makin lama (backoff), atau FAILED kalau jatah habis."""
    t = ambil(con, tid)
    if t["percobaan"] >= config.MAKS_PERCOBAAN:
        return pindah(con, tid, "FAILED", pelaku, "worker", f"gagal {t['percobaan']}x: {error[:200]}", error=error[:2000])
    jeda = 30 * 2 ** (t["percobaan"] - 1)          # 30 detik, 60 detik, 120 detik ...
    nanti = (datetime.now() + timedelta(seconds=jeda)).strftime("%Y-%m-%d %H:%M:%S")
    return pindah(con, tid, "ASSIGNED", pelaku, "worker", f"percobaan {t['percobaan']} gagal, coba lagi {jeda} detik lagi",
                  error=error[:2000], coba_setelah=nanti)


# ---------- artefak, handoff, QA, persetujuan ----------
def folder_kerja(con, tid: int) -> Path:
    """Folder hasil satu tugas: hasil/tugas-<id>-<waktu dibuat>.
    Waktu ikut di nama supaya database baru (id mulai dari 1 lagi) tidak memakai folder tugas lama."""
    r = con.execute("SELECT dibuat FROM tugas WHERE id=?", (tid,)).fetchone()
    cap = "".join(ch for ch in (r["dibuat"] if r else "") if ch.isdigit())
    p = config.HASIL / f"tugas-{tid}-{cap}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def rekam_artefak(con, tid: int, versi: int) -> list[dict]:
    """Daftar semua file di folder kerja tugas. Dijalankan ulang = tidak membuat baris ganda."""
    folder = folder_kerja(con, tid)
    for f in sorted(folder.rglob("*")):
        if f.is_file() and not any(bag.startswith(".") for bag in f.relative_to(folder).parts):
            isi = f.read_bytes()
            con.execute("""INSERT INTO artefak (tugas, versi, path, ukuran, sha256, jenis, waktu) VALUES (?,?,?,?,?,?,?)
                           ON CONFLICT(tugas, versi, path) DO UPDATE SET ukuran=excluded.ukuran,
                           sha256=excluded.sha256, waktu=excluded.waktu""",
                        (tid, versi, f.relative_to(folder).as_posix(), len(isi), hashlib.sha256(isi).hexdigest(),
                         mimetypes.guess_type(f.name)[0] or "application/octet-stream", sekarang()))
    con.commit()
    return _rows(con.execute("SELECT * FROM artefak WHERE tugas=? AND versi=? ORDER BY path", (tid, versi)))


def handoff(con, tid: int, dari: str, ke: str, konteks: dict) -> None:
    con.execute("INSERT INTO handoff (tugas, dari, ke, konteks, waktu) VALUES (?,?,?,?,?)",
                (tid, dari, ke, json.dumps(konteks, ensure_ascii=False), sekarang()))
    data.catat(con, dari, f"Serah tugas #{tid} ke {ke}", "info", commit=False)
    con.commit()


def simpan_qa(con, tid: int, versi: int, lulus: bool, cek: list[dict], catatan: str, penilai: str) -> None:
    con.execute("INSERT INTO qa_hasil (tugas, versi, lulus, cek, catatan, penilai, waktu) VALUES (?,?,?,?,?,?,?)",
                (tid, versi, int(lulus), json.dumps(cek, ensure_ascii=False), catatan, penilai, sekarang()))
    con.commit()


def setujui(con, tid: int, oleh: str, catatan: str = "") -> dict:
    t = pindah(con, tid, "APPROVED", oleh, "owner", catatan or "disetujui Cell")
    con.execute("INSERT INTO persetujuan (tugas, keputusan, alasan, oleh, waktu) VALUES (?,?,?,?,?)",
                (tid, "setuju", catatan, oleh, sekarang()))
    con.commit()
    return t


def minta_revisi(con, tid: int, oleh: str, peran: str, alasan: str) -> dict:
    """QA gagal atau Cell meminta perubahan. Kalau jatah revisi habis -> FAILED."""
    t = ambil(con, tid)
    if t["revisi"] >= config.MAKS_REVISI:
        hasil = pindah(con, tid, "FAILED", oleh, peran, f"revisi sudah {t['revisi']}x: {alasan}"[:300])
        keputusan = "tolak"
    else:
        hasil = pindah(con, tid, "REVISION", oleh, peran, alasan[:300], revisi=t["revisi"] + 1, qa_status="belum",
                       qa_percobaan=0)
        keputusan = "revisi"
    if peran == "owner":
        con.execute("INSERT INTO persetujuan (tugas, keputusan, alasan, oleh, waktu) VALUES (?,?,?,?,?)",
                    (tid, keputusan, alasan, oleh, sekarang()))
        con.commit()
    return hasil


def ulang(con, tid: int, oleh: str) -> dict:
    return pindah(con, tid, "PENDING", oleh, "owner", "Cell meminta coba lagi", percobaan=0, error="", coba_setelah=None)


# ---------- membaca ----------
def daftar(con, batas: int = 40) -> list[dict]:
    return [_tugas(r) for r in con.execute(
        """SELECT * FROM tugas ORDER BY
             CASE status WHEN 'REVIEW' THEN 0 WHEN 'RUNNING' THEN 1 WHEN 'REVISION' THEN 2 WHEN 'ASSIGNED' THEN 3
                         WHEN 'PENDING' THEN 4 ELSE 5 END, id DESC LIMIT ?""", (batas,))]


def daftar_perintah(con, batas: int = 10) -> list[dict]:
    return _rows(con.execute("SELECT * FROM perintah ORDER BY id DESC LIMIT ?", (batas,)))


def detail(con, tid: int) -> dict:
    t = ambil(con, tid)
    t["riwayat"] = _rows(con.execute("SELECT * FROM riwayat_tugas WHERE tugas=? ORDER BY id", (tid,)))
    t["artefak"] = _rows(con.execute("SELECT * FROM artefak WHERE tugas=? ORDER BY versi DESC, path", (tid,)))
    t["handoff"] = [dict(h, konteks=json.loads(h["konteks"])) for h in
                    _rows(con.execute("SELECT * FROM handoff WHERE tugas=? ORDER BY id", (tid,)))]
    t["qa"] = [dict(q, cek=json.loads(q["cek"]), lulus=bool(q["lulus"])) for q in
               _rows(con.execute("SELECT * FROM qa_hasil WHERE tugas=? ORDER BY id DESC", (tid,)))]
    t["folder"] = "hasil/" + folder_kerja(con, tid).name
    t["persetujuan"] = _rows(con.execute("SELECT * FROM persetujuan WHERE tugas=? ORDER BY id", (tid,)))
    t["token"] = dict(con.execute("SELECT COALESCE(SUM(masuk),0) masuk, COALESCE(SUM(keluar),0) keluar, "
                                  "COALESCE(SUM(biaya_usd),0) biaya_usd FROM token WHERE tugas=?", (tid,)).fetchone())
    if t["perintah"]:
        p = con.execute("SELECT * FROM perintah WHERE id=?", (t["perintah"],)).fetchone()
        t["perintah_teks"] = p["teks"] if p else ""
    return t


def file_artefak(con, tid: int, aid: int) -> Path:
    r = con.execute("SELECT path FROM artefak WHERE id=? AND tugas=?", (aid, tid)).fetchone()
    if r is None:
        raise TidakAda("artefak tidak ada")
    folder = folder_kerja(con, tid).resolve()
    f = (folder / r["path"]).resolve()
    if folder not in f.parents or not f.is_file():   # tidak boleh keluar dari folder tugas
        raise TidakAda("file artefak tidak ditemukan")
    return f
