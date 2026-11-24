"""Data gedung Markas Cell: lantai, ruang, agent, log, token, metrik.

Analogi: database = buku besar gedung. Setiap tabel adalah satu bab:
  lantai, ruang      -> denah gedung (dari data/gedung.json)
  agent              -> karyawan: jabatan, skill, ruangan, dan sedang apa sekarang
  koneksi            -> siapa biasa menyerahkan pekerjaan ke siapa (untuk gambar organisasi)
  perintah, tugas    -> pekerjaan sungguhan (lihat tugas.py)
  log, token, metrik -> buku harian, pemakaian kuota AI, CPU/RAM laptop

Semua fungsi menerima `con` (koneksi pinjaman dari db.koneksi()). Fungsi ini tidak membuka
koneksi sendiri, jadi pemanggil yang menentukan kapan transaksi dimulai dan selesai.
"""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import config
from db import sekarang

KEADAAN = ("kerja", "menunggu", "santai")
STATUS_TUGAS = ("PENDING", "ASSIGNED", "RUNNING", "REVIEW", "REVISION", "APPROVED", "FAILED")
PRIORITAS = ("rendah", "normal", "tinggi")


def _rows(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _detik_lalu(waktu: str | None) -> float | None:
    if not waktu:
        return None
    try:
        return (datetime.now() - datetime.strptime(waktu, "%Y-%m-%d %H:%M:%S")).total_seconds()
    except ValueError:
        return None


# ---------- tim & gedung ----------
def baca_tim(file_tim: Path | None = None) -> dict:
    return _json(file_tim or config.FILE_TIM)


def baca_gedung(file_gedung: Path | None = None) -> dict:
    return _json(file_gedung or config.FILE_GEDUNG)


def ruang_untuk(agent: dict, gedung: dict) -> dict:
    """Cari ruangan agent: dari 'penempatan' dulu, lalu dari divisi."""
    rid = gedung.get("penempatan", {}).get(agent["id"])
    for r in gedung["ruang"]:
        if r["id"] == rid or (rid is None and agent.get("divisi") in r.get("divisi", [])):
            return r
    return gedung["ruang"][0]


def isi_tim(con: sqlite3.Connection, file_tim: Path | None = None, file_gedung: Path | None = None,
            file_profil: Path | None = None) -> int:
    """Masukkan / perbarui gedung + agent + koneksi dari file JSON.

    Aman dengan foreign key: lantai & ruang di-upsert (bukan dihapus lalu diisi ulang),
    agent dipindah ke ruang barunya dulu, baru ruang yang tidak dipakai lagi dihapus.
    Keadaan agent (kerja/santai) yang sudah ada tidak diubah.
    """
    tim, gedung = baca_tim(file_tim), baca_gedung(file_gedung)
    fp = file_profil or config.FILE_PROFIL
    profil = _json(fp) if fp.exists() else {}
    for l in gedung["lantai"]:
        con.execute("""INSERT INTO lantai VALUES (?,?,?,?) ON CONFLICT(no) DO UPDATE SET
                       nama=excluded.nama, julukan=excluded.julukan, warna=excluded.warna""",
                    (l["no"], l["nama"], l["julukan"], l["warna"]))
    for r in gedung["ruang"]:
        con.execute("""INSERT INTO ruang VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                       lantai=excluded.lantai, nama=excluded.nama, jenis=excluded.jenis, divisi=excluded.divisi,
                       x=excluded.x, z=excluded.z, w=excluded.w, d=excluded.d, santai=excluded.santai, bahan=excluded.bahan""",
                    (r["id"], r["lantai"], r["nama"], r["jenis"], json.dumps(r.get("divisi", [])),
                     r["x"], r["z"], r["w"], r["d"], int(bool(r.get("santai"))), r.get("lantaiBahan")))
    for a in tim["agent"]:
        r, p = ruang_untuk(a, gedung), profil.get(a["id"], {})
        peran = config.AKTIF.get(a["id"])
        con.execute(
            """INSERT INTO agent (id, jabatan, divisi, manajer, owner, lapor_ke, model, jenis, fase, tugas_pokok,
                 input, output, alat, alias, kondisi, status_label, prioritas, lantai, ruang, look, diperbarui, aktif, peran)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(id) DO UPDATE SET jabatan=excluded.jabatan, divisi=excluded.divisi,
                 manajer=excluded.manajer, owner=excluded.owner, lapor_ke=excluded.lapor_ke, model=excluded.model,
                 jenis=excluded.jenis, fase=excluded.fase, tugas_pokok=excluded.tugas_pokok, input=excluded.input,
                 output=excluded.output, alat=excluded.alat, alias=excluded.alias, kondisi=excluded.kondisi,
                 status_label=excluded.status_label, prioritas=excluded.prioritas, lantai=excluded.lantai,
                 ruang=excluded.ruang, look=excluded.look, aktif=excluded.aktif, peran=excluded.peran""",
            (a["id"], a.get("jabatan", ""), a.get("divisi", "lobi"), int(bool(a.get("manajer"))),
             int(bool(a.get("owner"))), a.get("lapor_ke"), a.get("model", "-"),
             p.get("jenis", a.get("sumber", "-")), a.get("fase"), a.get("tugas", ""), a.get("input", ""),
             a.get("output", ""), a.get("tools", ""), json.dumps(a.get("alias", [])),
             a.get("keadaan_sekarang", ""), p.get("status", "-"), p.get("prioritas", "-"),
             r["lantai"], r["id"], json.dumps(a.get("look", {})), sekarang(), int(peran is not None), peran),
        )
    ids = [r["id"] for r in gedung["ruang"]]
    con.execute(f"DELETE FROM ruang WHERE id NOT IN ({','.join('?' * len(ids))})", ids)
    con.execute("DELETE FROM koneksi")
    con.executemany("INSERT OR IGNORE INTO koneksi VALUES (?,?,?)",
                    [(k[0], k[1], k[2] if len(k) > 2 else "") for k in tim.get("koneksi", [])])
    con.commit()
    return len(tim["agent"])


def cari_id(con: sqlite3.Connection, nama: str) -> str | None:
    """Terima 'Kevin', 'kevin', atau alias 'stock-analyst' -> 'Kevin'."""
    nama = (nama or "").strip()
    r = con.execute("SELECT id FROM agent WHERE lower(id)=lower(?)", (nama,)).fetchone()
    if r:
        return r["id"]
    for r in con.execute("SELECT id, alias FROM agent"):
        if nama.lower() in [x.lower() for x in json.loads(r["alias"] or "[]")]:
            return r["id"]
    return None


def _rapikan_agent(a: dict) -> dict:
    a["look"] = json.loads(a.get("look") or "{}")
    a["alias"] = json.loads(a.get("alias") or "[]")
    a["manajer"], a["owner"], a["aktif"] = bool(a["manajer"]), bool(a["owner"]), bool(a.get("aktif"))
    umur = _detik_lalu(a.get("diperbarui"))
    # "basi" = mengaku kerja, tapi sudah lama tidak ada kabar (agent mungkin crash)
    a["basi"] = a.get("keadaan") == "kerja" and umur is not None and umur > config.AGENT_BASI
    return a


def daftar_agent(con: sqlite3.Connection) -> list[dict]:
    return [_rapikan_agent(a) for a in _rows(con.execute("SELECT * FROM agent ORDER BY lantai, ruang, manajer DESC"))]


def daftar_lantai(con) -> list[dict]:
    lantai = _rows(con.execute("SELECT * FROM lantai ORDER BY no"))
    ruang = _rows(con.execute("SELECT * FROM ruang"))
    for r in ruang:
        r["divisi"], r["santai"] = json.loads(r["divisi"] or "[]"), bool(r["santai"])
    for l in lantai:
        l["ruang"] = [r for r in ruang if r["lantai"] == l["no"]]
        l["agent"] = [x["id"] for x in con.execute("SELECT id FROM agent WHERE lantai=?", (l["no"],))]
    return lantai


def profil_agent(con, aid: str) -> dict | None:
    """Kartu skill lengkap satu agent + rekan kerja + riwayat tugas sungguhan."""
    r = con.execute("SELECT * FROM agent WHERE id=?", (aid,)).fetchone()
    if r is None:
        return None
    a = _rapikan_agent(dict(r))
    a["menerima_dari"] = _rows(con.execute("SELECT dari AS agent, label FROM koneksi WHERE ke=?", (aid,)))
    a["mengirim_ke"] = _rows(con.execute("SELECT ke AS agent, label FROM koneksi WHERE dari=?", (aid,)))
    a["anak_buah"] = [x["id"] for x in con.execute("SELECT id FROM agent WHERE lapor_ke=?", (aid,))]
    a["tugas"] = _rows(con.execute(
        "SELECT id, judul, status, qa_status, diperbarui FROM tugas WHERE agent=? ORDER BY id DESC LIMIT 10", (aid,)))
    a["log"] = _rows(con.execute("SELECT * FROM log WHERE agent=? ORDER BY id DESC LIMIT 10", (aid,)))
    t = con.execute("SELECT COALESCE(SUM(masuk),0) masuk, COALESCE(SUM(keluar),0) keluar, COUNT(*) panggilan "
                    "FROM token WHERE agent=?", (aid,)).fetchone()
    a["token"] = dict(t)
    return a


def set_status(con: sqlite3.Connection, agent: str, keadaan: str, pesan: str = "") -> str:
    if keadaan not in KEADAAN:
        raise ValueError(f"keadaan harus salah satu dari {KEADAAN}")
    aid = cari_id(con, agent)
    if aid is None:
        raise KeyError(f"agent '{agent}' tidak ada di tim.json")
    lama = con.execute("SELECT keadaan, pesan FROM agent WHERE id=?", (aid,)).fetchone()
    con.execute("UPDATE agent SET keadaan=?, pesan=?, diperbarui=? WHERE id=?", (keadaan, pesan, sekarang(), aid))
    if lama is None or lama["keadaan"] != keadaan or lama["pesan"] != pesan:
        level = {"kerja": "info", "menunggu": "warn", "santai": "ok"}[keadaan]
        catat(con, aid, f"{keadaan.upper()}" + (f": {pesan}" if pesan else ""), level, commit=False)
    con.commit()
    return aid


def turunkan_keadaan(con, aid: str) -> None:
    """Untuk agent aktif, keadaan di gedung DIHITUNG dari tugas yang dipegangnya, bukan diklaim.

    RUNNING -> kerja, REVIEW yang sudah lulus QA -> menunggu OK Cell, selain itu santai.
    """
    r = con.execute("SELECT aktif FROM agent WHERE id=?", (aid,)).fetchone()
    if not r or not r["aktif"]:
        return
    jalan = con.execute("SELECT id, judul FROM tugas WHERE agent=? AND status='RUNNING' ORDER BY id LIMIT 1", (aid,)).fetchone()
    if jalan:
        return set_status(con, aid, "kerja", f"#{jalan['id']} {jalan['judul']}")
    tunggu = con.execute("SELECT id FROM tugas WHERE agent=? AND status='REVIEW' AND qa_status='lulus' "
                         "ORDER BY id LIMIT 1", (aid,)).fetchone()
    if tunggu:
        return set_status(con, aid, "menunggu", f"#{tunggu['id']} lulus QA, tunggu OK Cell")
    set_status(con, aid, "santai", "")


# ---------- log ----------
def catat(con, agent: str, teks: str, level: str = "info", commit: bool = True) -> None:
    con.execute("INSERT INTO log (waktu, agent, level, teks) VALUES (?,?,?,?)", (sekarang(), agent, level, teks[:500]))
    if commit:
        con.commit()


def daftar_log(con, setelah: int = 0, batas: int = 60) -> list[dict]:
    return list(reversed(_rows(con.execute(
        "SELECT * FROM log WHERE id>? ORDER BY id DESC LIMIT ?", (setelah, batas)))))


# ---------- token ----------
def catat_token(con, agent: str, model: str, masuk: int, keluar: int, sumber: str = "lapor",
                biaya_usd: float | None = None, kunci: str | None = None, tugas: int | None = None) -> bool:
    """Catat pemakaian token. `kunci` unik membuat laporan yang dikirim ulang tidak tercatat dua kali."""
    cur = con.execute(
        "INSERT OR IGNORE INTO token (waktu, agent, model, masuk, keluar, sumber, biaya_usd, kunci, tugas) "
        "VALUES (?,?,?,?,?,?,?,?,?)",
        (sekarang(), agent, model, int(masuk), int(keluar), sumber, biaya_usd, kunci, tugas))
    con.commit()
    return cur.rowcount == 1


def ringkas_token(con) -> dict:
    """Total hari ini per agent (semua model dijumlah) + rincian per agent & model."""
    hari_ini = datetime.now().strftime("%Y-%m-%d")
    batas = (hari_ini + " 00:00:00", hari_ini + " 23:59:59")
    per_model = _rows(con.execute(
        """SELECT agent, model, SUM(masuk) masuk, SUM(keluar) keluar, COUNT(*) panggilan, SUM(biaya_usd) biaya_usd
           FROM token WHERE waktu BETWEEN ? AND ? GROUP BY agent, model""", batas))
    per_agent: dict[str, dict] = {}
    for r in per_model:
        a = per_agent.setdefault(r["agent"], {"agent": r["agent"], "masuk": 0, "keluar": 0, "panggilan": 0,
                                              "biaya_usd": 0.0, "model": []})
        a["masuk"] += r["masuk"] or 0
        a["keluar"] += r["keluar"] or 0
        a["panggilan"] += r["panggilan"]
        a["biaya_usd"] += r["biaya_usd"] or 0
        a["model"].append(r["model"])
    daftar = sorted(per_agent.values(), key=lambda a: -(a["masuk"] + a["keluar"]))
    return {"tanggal": hari_ini, "total": sum(a["masuk"] + a["keluar"] for a in daftar),
            "per_agent": daftar, "per_model": per_model}


# ---------- metrik ----------
def catat_metrik(con, cpu: float, ram: float) -> None:
    con.execute("INSERT INTO metrik (waktu, cpu, ram) VALUES (?,?,?)", (sekarang(), cpu, ram))
    con.execute("DELETE FROM metrik WHERE id <= (SELECT MAX(id) - 120 FROM metrik)")  # simpan 120 titik terakhir
    con.commit()


def daftar_metrik(con) -> list[dict]:
    return _rows(con.execute("SELECT waktu, cpu, ram FROM metrik ORDER BY id"))


# ---------- layanan (detak worker) ----------
def detak(con, nama: str, info: dict | None = None) -> None:
    con.execute("INSERT INTO layanan VALUES (?,?,?) ON CONFLICT(nama) DO UPDATE SET detak=excluded.detak, info=excluded.info",
                (nama, sekarang(), json.dumps(info or {})))
    con.commit()


def info_layanan(con, nama: str) -> dict:
    r = con.execute("SELECT * FROM layanan WHERE nama=?", (nama,)).fetchone()
    if not r:
        return {"nama": nama, "hidup": False, "detak": None, "umur_detik": None, "info": {}}
    umur = _detik_lalu(r["detak"])
    return {"nama": nama, "hidup": umur is not None and umur <= config.WORKER_BASI, "detak": r["detak"],
            "umur_detik": round(umur) if umur is not None else None, "info": json.loads(r["info"] or "{}")}


# ---------- idempotensi ----------
def idem_ambil(con, kunci: str, jalur: str) -> dict | None:
    r = con.execute("SELECT jalur, respons FROM idem WHERE kunci=?", (kunci,)).fetchone()
    if r is None:
        return None
    if r["jalur"] != jalur:
        raise ValueError("Idempotency-Key ini sudah dipakai untuk jalur lain")
    return json.loads(r["respons"])


def idem_simpan(con, kunci: str, jalur: str, respons: dict) -> None:
    con.execute("INSERT OR IGNORE INTO idem VALUES (?,?,?,?)", (kunci, jalur, json.dumps(respons), sekarang()))
    con.commit()


# ---------- retensi ----------
def bersihkan(con, hari_log: int = 30, hari_idem: int = 7) -> dict:
    """Hapus log lama & kunci idempotensi kedaluwarsa. Tugas, artefak, dan token TIDAK dihapus."""
    batas_log = (datetime.now() - timedelta(days=hari_log)).strftime("%Y-%m-%d %H:%M:%S")
    batas_idem = (datetime.now() - timedelta(days=hari_idem)).strftime("%Y-%m-%d %H:%M:%S")
    n_log = con.execute("DELETE FROM log WHERE waktu < ?", (batas_log,)).rowcount
    n_idem = con.execute("DELETE FROM idem WHERE waktu < ?", (batas_idem,)).rowcount
    con.commit()
    return {"log": n_log, "idem": n_idem}


def statistik(con) -> dict:
    hit = {k: 0 for k in KEADAAN}
    hit["basi"] = 0
    for a in daftar_agent(con):
        if a.get("owner"):
            continue
        if a["basi"]:       # mengaku kerja tapi lama tanpa kabar: jangan dihitung sebagai kerja
            hit["basi"] += 1
        elif a.get("keadaan") in hit:
            hit[a["keadaan"]] += 1
    tugas = {k: 0 for k in STATUS_TUGAS}
    for r in con.execute("SELECT status, COUNT(*) n FROM tugas GROUP BY status"):
        tugas[r["status"]] = r["n"]
    perlu_ok = con.execute("SELECT COUNT(*) FROM tugas WHERE status='REVIEW' AND qa_status='lulus'").fetchone()[0]
    jumlah = con.execute("SELECT COUNT(*) n, SUM(manajer) m, COUNT(DISTINCT divisi) d, SUM(aktif) a "
                         "FROM agent WHERE owner=0").fetchone()
    return {"agent": hit, "tugas": tugas, "perlu_ok": perlu_ok, "jumlah_agent": jumlah["n"],
            "manajer": jumlah["m"] or 0, "aktif": jumlah["a"] or 0, "divisi": jumlah["d"],
            "lantai": con.execute("SELECT COUNT(*) FROM lantai").fetchone()[0]}
