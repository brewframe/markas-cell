"""Koneksi database, migrasi bernomor, dan backup.

Analogi:
  koneksi()  = meminjam buku besar dari rak, lalu wajib dikembalikan (ditutup) setelah dipakai.
               Dulu satu buku dipakai bergantian semua orang tanpa aturan; sekarang tiap
               permintaan meminjam salinannya sendiri.
  migrasi    = renovasi gedung bernomor. Database mencatat sudah sampai renovasi ke berapa,
               jadi renovasi yang sama tidak dikerjakan dua kali.
  backup     = fotokopi buku besar sebelum direnovasi.
"""
from __future__ import annotations

import shutil
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

import config


def _sambung(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=10, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")      # relasi antar tabel benar-benar dicek
    con.execute("PRAGMA busy_timeout = 5000")    # tunggu 5 detik kalau sedang ditulis proses lain
    con.execute("PRAGMA journal_mode = WAL")     # worker & server bisa jalan bersamaan
    return con


@contextmanager
def koneksi(path: Path | None = None):
    """Pinjam satu koneksi, tutup otomatis. Kalau terjadi error, perubahan dibatalkan."""
    con = _sambung(path or AKTIF["db"])
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


# database yang sedang dipakai proses ini (markas.db, atau markas-demo.db saat demo)
AKTIF = {"db": config.FILE_DB}


def pakai(path: Path) -> None:
    AKTIF["db"] = path


# =====================================================================
#  MIGRASI
# =====================================================================
SKEMA_1 = """
CREATE TABLE IF NOT EXISTS lantai (
    no INTEGER PRIMARY KEY, nama TEXT, julukan TEXT, warna TEXT
);
CREATE TABLE IF NOT EXISTS ruang (
    id TEXT PRIMARY KEY, lantai INTEGER REFERENCES lantai(no), nama TEXT, jenis TEXT,
    divisi TEXT, x REAL, z REAL, w REAL, d REAL, santai INTEGER DEFAULT 0, bahan TEXT
);
CREATE TABLE IF NOT EXISTS agent (
    id TEXT PRIMARY KEY,
    jabatan TEXT, divisi TEXT, manajer INTEGER DEFAULT 0, owner INTEGER DEFAULT 0,
    lapor_ke TEXT, model TEXT, jenis TEXT, fase INTEGER,
    tugas_pokok TEXT, input TEXT, output TEXT, alat TEXT, alias TEXT,
    kondisi TEXT, status_label TEXT, prioritas TEXT,
    lantai INTEGER, ruang TEXT REFERENCES ruang(id),
    look TEXT, keadaan TEXT DEFAULT 'santai', pesan TEXT DEFAULT '', diperbarui TEXT
);
CREATE TABLE IF NOT EXISTS koneksi (dari TEXT, ke TEXT, label TEXT, PRIMARY KEY (dari, ke, label));
CREATE TABLE IF NOT EXISTS tugas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, agent TEXT, judul TEXT, prioritas TEXT DEFAULT 'normal',
    status TEXT DEFAULT 'antri', hasil TEXT DEFAULT '', dibuat TEXT, mulai TEXT, selesai TEXT
);
CREATE TABLE IF NOT EXISTS log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, waktu TEXT, agent TEXT, level TEXT DEFAULT 'info', teks TEXT
);
CREATE TABLE IF NOT EXISTS token (
    id INTEGER PRIMARY KEY AUTOINCREMENT, waktu TEXT, agent TEXT, model TEXT, masuk INTEGER, keluar INTEGER
);
CREATE TABLE IF NOT EXISTS metrik (id INTEGER PRIMARY KEY AUTOINCREMENT, waktu TEXT, cpu REAL, ram REAL);
CREATE INDEX IF NOT EXISTS i_log_agent ON log(agent);
CREATE INDEX IF NOT EXISTS i_token_waktu ON token(waktu);
"""

# kolom yang ditambahkan selama versi 1.x (database lama mungkin belum punya)
KOLOM_AGENT_V1 = {
    "owner": "INTEGER DEFAULT 0", "jenis": "TEXT", "fase": "INTEGER", "input": "TEXT", "output": "TEXT",
    "alat": "TEXT", "alias": "TEXT", "kondisi": "TEXT", "status_label": "TEXT", "prioritas": "TEXT",
    "lantai": "INTEGER", "ruang": "TEXT",
}


def _kolom(con, tabel: str) -> set[str]:
    return {r["name"] for r in con.execute(f"PRAGMA table_info({tabel})")}


def _ada_tabel(con, tabel: str) -> bool:
    return con.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (tabel,)).fetchone() is not None


def m001_awal(con):
    """Skema Markas Cell 1.x (aman dijalankan di database lama maupun baru)."""
    con.executescript(SKEMA_1)
    ada = _kolom(con, "agent")
    for kolom, tipe in KOLOM_AGENT_V1.items():
        if kolom not in ada:
            con.execute(f"ALTER TABLE agent ADD COLUMN {kolom} {tipe}")


def m002_tugas_v2(con):
    """Markas 2.0: tugas berkontrak, riwayat status, artefak, handoff, QA, persetujuan.

    Tabel tugas versi 1 (status antri/jalan/selesai) TIDAK dihapus, hanya diganti nama
    menjadi tugas_v1 supaya datanya tetap bisa dibaca.
    """
    if _ada_tabel(con, "tugas") and "tujuan" not in _kolom(con, "tugas"):
        con.execute("ALTER TABLE tugas RENAME TO tugas_v1")
        con.execute("DROP INDEX IF EXISTS i_tugas_agent")
    ada = _kolom(con, "agent")
    if "aktif" not in ada:
        con.execute("ALTER TABLE agent ADD COLUMN aktif INTEGER DEFAULT 0")
    if "peran" not in ada:
        con.execute("ALTER TABLE agent ADD COLUMN peran TEXT")
    ada_token = _kolom(con, "token")
    for kolom, tipe in {"sumber": "TEXT DEFAULT 'lapor'", "biaya_usd": "REAL", "kunci": "TEXT", "tugas": "INTEGER"}.items():
        if kolom not in ada_token:
            con.execute(f"ALTER TABLE token ADD COLUMN {kolom} {tipe}")
    con.executescript("""
    CREATE TABLE IF NOT EXISTS perintah (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teks TEXT NOT NULL, prioritas TEXT NOT NULL DEFAULT 'normal',
        status TEXT NOT NULL DEFAULT 'BARU' CHECK (status IN ('BARU','DIPROSES','DIPECAH','DITOLAK','GAGAL')),
        catatan TEXT DEFAULT '', oleh TEXT, dibuat TEXT, diperbarui TEXT
    );
    CREATE TABLE IF NOT EXISTS tugas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        perintah INTEGER REFERENCES perintah(id),
        judul TEXT NOT NULL, tujuan TEXT NOT NULL DEFAULT '',
        kriteria TEXT NOT NULL DEFAULT '[]',              -- JSON: daftar kriteria lulus
        agent TEXT NOT NULL REFERENCES agent(id),
        prioritas TEXT NOT NULL DEFAULT 'normal' CHECK (prioritas IN ('rendah','normal','tinggi')),
        status TEXT NOT NULL DEFAULT 'PENDING'
            CHECK (status IN ('PENDING','ASSIGNED','RUNNING','REVIEW','REVISION','APPROVED','FAILED')),
        qa_status TEXT NOT NULL DEFAULT 'belum' CHECK (qa_status IN ('belum','menunggu','lulus','gagal','error')),
        percobaan INTEGER NOT NULL DEFAULT 0, revisi INTEGER NOT NULL DEFAULT 0, qa_percobaan INTEGER NOT NULL DEFAULT 0,
        coba_setelah TEXT,                                -- jeda retry (backoff)
        worker TEXT, adapter TEXT, ringkasan TEXT DEFAULT '', error TEXT DEFAULT '',
        dibuat_oleh TEXT, dibuat TEXT, diperbarui TEXT, mulai TEXT, selesai TEXT
    );
    CREATE INDEX IF NOT EXISTS i_tugas_status ON tugas(status, prioritas, id);
    CREATE INDEX IF NOT EXISTS i_tugas_agent2 ON tugas(agent, status);
    CREATE TABLE IF NOT EXISTS riwayat_tugas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tugas INTEGER NOT NULL REFERENCES tugas(id) ON DELETE CASCADE,
        dari TEXT, ke TEXT NOT NULL, pelaku TEXT NOT NULL, peran TEXT NOT NULL, alasan TEXT DEFAULT '',
        ditolak INTEGER NOT NULL DEFAULT 0, waktu TEXT
    );
    CREATE INDEX IF NOT EXISTS i_riwayat_tugas ON riwayat_tugas(tugas, id);
    CREATE TABLE IF NOT EXISTS artefak (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tugas INTEGER NOT NULL REFERENCES tugas(id) ON DELETE CASCADE,
        versi INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL, ukuran INTEGER, sha256 TEXT, jenis TEXT, waktu TEXT,
        UNIQUE (tugas, versi, path)                       -- retry tidak membuat artefak ganda
    );
    CREATE TABLE IF NOT EXISTS handoff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tugas INTEGER NOT NULL REFERENCES tugas(id) ON DELETE CASCADE,
        dari TEXT NOT NULL, ke TEXT NOT NULL, konteks TEXT NOT NULL, waktu TEXT
    );
    CREATE TABLE IF NOT EXISTS qa_hasil (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tugas INTEGER NOT NULL REFERENCES tugas(id) ON DELETE CASCADE,
        versi INTEGER NOT NULL DEFAULT 0, lulus INTEGER NOT NULL, cek TEXT NOT NULL, catatan TEXT DEFAULT '',
        penilai TEXT NOT NULL, waktu TEXT
    );
    CREATE TABLE IF NOT EXISTS persetujuan (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tugas INTEGER NOT NULL REFERENCES tugas(id) ON DELETE CASCADE,
        keputusan TEXT NOT NULL CHECK (keputusan IN ('setuju','revisi','tolak')), alasan TEXT DEFAULT '',
        oleh TEXT NOT NULL, waktu TEXT
    );
    CREATE TABLE IF NOT EXISTS idem (
        kunci TEXT PRIMARY KEY, jalur TEXT NOT NULL, respons TEXT NOT NULL, waktu TEXT
    );
    CREATE TABLE IF NOT EXISTS layanan (
        nama TEXT PRIMARY KEY, detak TEXT, info TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS u_token_kunci ON token(kunci) WHERE kunci IS NOT NULL;
    CREATE INDEX IF NOT EXISTS i_token_agent ON token(agent, waktu);
    CREATE INDEX IF NOT EXISTS i_log_waktu ON log(waktu);
    """)


def m003_notif_wa(con) -> None:
    """Catatan kabar WA yang sudah dikirim, supaya satu tugas tidak dikabari dua kali."""
    con.execute("""CREATE TABLE IF NOT EXISTS notif_wa (
        tugas INTEGER NOT NULL, jenis TEXT NOT NULL, waktu TEXT NOT NULL, hasil TEXT DEFAULT '',
        PRIMARY KEY (tugas, jenis))""")


MIGRASI = [(1, m001_awal), (2, m002_tugas_v2), (3, m003_notif_wa)]
VERSI_TERBARU = MIGRASI[-1][0]


def versi(con) -> int:
    con.execute("CREATE TABLE IF NOT EXISTS schema_version (versi INTEGER PRIMARY KEY, waktu TEXT)")
    r = con.execute("SELECT MAX(versi) v FROM schema_version").fetchone()
    return r["v"] or 0


def siapkan(path: Path | None = None) -> dict:
    """Jalankan migrasi yang belum. Backup otomatis dibuat sebelum database lama diubah."""
    path = path or AKTIF["db"]
    sudah_ada = path.exists() and path.stat().st_size > 0
    cadangan = None
    with koneksi(path) as con:
        v = versi(con)
        perlu = [(n, f) for n, f in MIGRASI if n > v]
        if perlu and sudah_ada and _ada_tabel(con, "agent"):
            con.commit()
            cadangan = backup(path, alasan=f"sebelum-migrasi-v{perlu[-1][0]}")
        for n, fungsi in perlu:
            fungsi(con)
            con.execute("INSERT INTO schema_version VALUES (?, ?)", (n, sekarang()))
            con.commit()
        cek = con.execute("PRAGMA foreign_key_check").fetchall()
    return {"versi_awal": v, "versi": VERSI_TERBARU, "dijalankan": [n for n, _ in perlu],
            "cadangan": str(cadangan) if cadangan else None, "pelanggaran_fk": len(cek)}


# =====================================================================
#  BACKUP & RESTORE
# =====================================================================
def sekarang() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def backup(path: Path | None = None, tujuan: Path | None = None, alasan: str = "manual") -> Path:
    """Salin database memakai API backup SQLite (aman walau sedang dipakai)."""
    path = path or AKTIF["db"]
    tujuan = tujuan or config.CADANGAN / f"{path.stem}-{datetime.now():%Y%m%d-%H%M%S}-{alasan}.db"
    tujuan.parent.mkdir(parents=True, exist_ok=True)
    sumber = sqlite3.connect(path)
    salinan = sqlite3.connect(tujuan)
    try:
        sumber.backup(salinan)
    finally:
        salinan.close()
        sumber.close()
    return tujuan


def periksa(path: Path) -> dict:
    """Cek file cadangan: utuh? versi berapa? berapa tugas?"""
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    try:
        utuh = con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        v = (con.execute("SELECT MAX(versi) FROM schema_version").fetchone()[0] or 0) \
            if utuh and _ada_tabel(con, "schema_version") else 0
        tugas = con.execute("SELECT COUNT(*) FROM tugas").fetchone()[0] if _ada_tabel(con, "tugas") else 0
        return {"utuh": utuh, "versi": v, "tugas": tugas}
    finally:
        con.close()


def pulihkan(cadangan: Path, path: Path | None = None) -> Path:
    """Kembalikan database dari cadangan. Database yang sekarang dibackup dulu, tidak ditimpa begitu saja."""
    path = path or AKTIF["db"]
    info = periksa(cadangan)
    if not info["utuh"]:
        raise ValueError(f"cadangan rusak: {cadangan}")
    simpan = backup(path, alasan="sebelum-pulihkan") if path.exists() else None
    for akhiran in ("-wal", "-shm"):
        p = Path(str(path) + akhiran)
        if p.exists():
            p.unlink()
    shutil.copyfile(cadangan, path)
    return simpan or path


if __name__ == "__main__":
    import json
    import sys
    perintah = sys.argv[1] if len(sys.argv) > 1 else ""
    if perintah == "backup":
        print(f"Cadangan dibuat: {backup()}")
    elif perintah == "periksa" and len(sys.argv) == 3:
        print(json.dumps(periksa(Path(sys.argv[2])), indent=2, ensure_ascii=False))
    elif perintah == "pulihkan" and len(sys.argv) == 3:
        print("Hentikan server dan worker dulu sebelum memulihkan.")
        simpan = pulihkan(Path(sys.argv[2]))
        print(f"Dipulihkan. Database sebelumnya disimpan di: {simpan}")
    else:
        print("Pakai: python backend/db.py backup | periksa <file> | pulihkan <file>")
        sys.exit(1)
