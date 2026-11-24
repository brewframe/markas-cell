"""Backend Markas Cell 2.0 (FastAPI).

Analogi: backend = resepsionis gedung. Ia menerima perintah Cell, mencatatnya di buku besar,
dan menjawab pertanyaan layar ("siapa sedang kerja?"). Resepsionis TIDAK memasak:
pekerjaan dijalankan oleh worker (backend/worker.py) yang berjalan di jendela terpisah.

Cara jalan:
  python backend/main.py                 -> http://localhost:8300  (data asli: data/markas.db)
  python backend/main.py --demo          -> animasi contoh, database terpisah data/markas-demo.db
  python backend/main.py --papan "C:\\Users\\LOQ\\tim-agent\\kantor-pixel\\status.json"

Peran (lihat keamanan.py): viewer = semua GET, agent = lapor status/token, owner = semua.
Dokumentasi lengkap: docs/API_DOCUMENTATION.md dan http://localhost:8300/docs
"""
from __future__ import annotations

import argparse
import asyncio
import json
import random
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import database as data  # noqa: E402
import db  # noqa: E402
import keamanan as K  # noqa: E402
import skema as S  # noqa: E402
import tugas as T  # noqa: E402
import laporan_wa as L  # noqa: E402
import wa  # noqa: E402

try:
    import psutil  # CPU & RAM laptop; kalau tidak ada, metrik dikosongkan
except ImportError:  # pragma: no cover
    psutil = None

WEB = config.FOLDER / "web-crew"      # tampilan utama (gaya CrewAI)
WEB_LAMA = config.FOLDER / "web"     # tampilan lama (gedung 3D, kontrol) tetap bisa dibuka di /lama/
PORT = 8300
SETELAN = {"demo": False, "papan": None, "integrasi": {"papan": "mati", "galat": 0, "pesan": ""}}


def con_req():
    """Dependency: setiap request meminjam koneksinya sendiri, lalu ditutup."""
    with db.koneksi() as con:
        yield con


# ---------- pekerjaan latar belakang (masing-masing memakai koneksi sendiri) ----------
async def rekam_metrik():
    while True:
        if psutil:
            with db.koneksi() as con:
                data.catat_metrik(con, psutil.cpu_percent(interval=None), psutil.virtual_memory().percent)
        await asyncio.sleep(3)


async def retensi_harian():
    while True:
        with db.koneksi() as con:
            n = data.bersihkan(con)
            if any(n.values()):
                data.catat(con, "sistem", f"Retensi: {n['log']} log & {n['idem']} kunci lama dihapus", "info")
        await asyncio.sleep(24 * 3600)


async def baca_papan_lama():
    """Salin status dari status.json (papan absen kantor lama) ke database setiap 3 detik.
    Masalah tidak lagi diam-diam diabaikan: dicatat di log dan terlihat di /api/health."""
    terakhir, integ = {}, SETELAN["integrasi"]
    while True:
        path = Path(SETELAN["papan"])
        try:
            papan = json.loads(path.read_text(encoding="utf-8"))
            integ.update(papan="terhubung", pesan="")
            with db.koneksi() as con:
                for nama, s in papan.items():
                    kunci = (s.get("keadaan"), s.get("pesan", ""), s.get("waktu"))
                    if terakhir.get(nama) == kunci:
                        continue
                    terakhir[nama] = kunci
                    try:
                        data.set_status(con, nama, s.get("keadaan", "santai"), s.get("pesan", ""))
                    except (KeyError, ValueError) as e:
                        integ["galat"] += 1
                        data.catat(con, "sistem", f"Papan lama: '{nama}' dilewati ({e})", "warn")
        except FileNotFoundError:
            integ.update(papan="file tidak ada", pesan=str(path))
        except json.JSONDecodeError as e:
            integ.update(papan="isi rusak", pesan=str(e)[:200])
            integ["galat"] += 1
        await asyncio.sleep(3)


async def mode_demo():
    """Animasi contoh. Hanya menggerakkan karakter + token contoh di markas-demo.db.
    Demo TIDAK membuat tugas palsu, supaya tidak terlihat seperti agent sungguhan bekerja."""
    contoh = ["Rangkum berita AI hari ini", "Uji tampilan di HP 390px", "Analisa BBCA (edukasi)", "Tulis caption listing"]
    with db.koneksi() as con:
        agent = [a for a in data.daftar_agent(con) if not a["owner"]]
    while True:
        a = random.choice(agent)
        pilihan = random.choices(["kerja", "menunggu", "santai"], [5, 1, 4])[0]
        pesan = ("[DEMO] " + random.choice(contoh)) if pilihan == "kerja" else ("[DEMO] tunggu OK" if pilihan == "menunggu" else "")
        with db.koneksi() as con:
            data.set_status(con, a["id"], pilihan, pesan)
            if pilihan == "kerja":
                data.catat_token(con, a["id"], "demo", random.randint(800, 9000), random.randint(200, 2500), sumber="demo")
        await asyncio.sleep(random.uniform(1.5, 3.5))


@asynccontextmanager
async def siklus(app: FastAPI):
    db.pakai(config.FILE_DB_DEMO if SETELAN["demo"] else config.FILE_DB)
    info = db.siapkan()
    env, baru = config.pastikan_env()
    K.atur_kunci(env)
    with db.koneksi() as con:
        jumlah = data.isi_tim(con)
        data.catat(con, "sistem", f"Markas 2.0 menyala. {jumlah} karakter, database versi {info['versi']}"
                   + (f", cadangan: {Path(info['cadangan']).name}" if info["cadangan"] else ""), "ok")
        if baru:
            data.catat(con, "sistem", f"Kunci baru dibuat di {config.FILE_ENV.name}. Buka file itu untuk kunci owner.", "warn")
    if psutil:
        psutil.cpu_percent(interval=None)
    latar = [asyncio.create_task(rekam_metrik()), asyncio.create_task(retensi_harian())]
    if SETELAN["papan"]:
        SETELAN["integrasi"]["papan"] = "menghubungkan"
        latar.append(asyncio.create_task(baca_papan_lama()))
    if SETELAN["demo"]:
        latar.append(asyncio.create_task(mode_demo()))
        with db.koneksi() as con:
            data.catat(con, "sistem", "MODE DEMO: data contoh di markas-demo.db, bukan kerja agent sungguhan", "warn")
    yield
    for t in latar:
        t.cancel()


app = FastAPI(title="Markas Cell", version="2.0", lifespan=siklus)


@app.middleware("http")
async def penjaga(request: Request, call_next):
    """Tolak Host asing (DNS rebinding) dan banjir request tulis."""
    if not K.host_aman(request.headers.get("host")):
        return JSONResponse({"detail": "Host tidak diizinkan"}, status_code=400)
    if request.method in ("POST", "PATCH", "PUT", "DELETE"):
        ip = request.client.host if request.client else "-"
        if not K.laju_aman((ip, request.url.path)):
            return JSONResponse({"detail": "Terlalu banyak request, coba lagi sebentar"}, status_code=429)
    return await call_next(request)


def _mode(con) -> dict:
    w = data.info_layanan(con, "worker")
    if SETELAN["demo"]:
        mode = "DEMO"
    elif w["hidup"]:
        mode = "LIVE"
    else:
        mode = "STALE"      # dashboard hidup, tapi tidak ada worker yang mengerjakan tugas
    return {"mode": mode, "worker": w}


def _idem(con, request: Request, jalur: str):
    kunci = request.headers.get("idempotency-key")
    if not kunci:
        return None, None
    if len(kunci) > 100:
        raise HTTPException(422, "Idempotency-Key terlalu panjang")
    try:
        return kunci, data.idem_ambil(con, kunci, jalur)
    except ValueError as e:
        raise HTTPException(422, str(e))


# =====================================================================
#  BACA (viewer)
# =====================================================================
@app.get("/api/snapshot")
def snapshot(setelah: int = 0, con=Depends(con_req)):
    return {
        "agent": [{k: a[k] for k in ("id", "keadaan", "pesan", "diperbarui", "aktif", "basi")} for a in data.daftar_agent(con)],
        "tugas": T.daftar(con, 30),
        "perintah": T.daftar_perintah(con, 8),
        "log": data.daftar_log(con, setelah),
        "token": data.ringkas_token(con),
        "metrik": data.daftar_metrik(con),
        "statistik": data.statistik(con),
        "demo": SETELAN["demo"],
        "psutil": psutil is not None,
        "wa": wa.status(),
        **_mode(con),
    }


@app.get("/api/health")
def health(con=Depends(con_req)):
    con.execute("SELECT 1").fetchone()
    return {"ok": True, "database": {"versi": db.versi(con), "fk": con.execute("PRAGMA foreign_keys").fetchone()[0] == 1,
                                     "file": db.AKTIF["db"].name},
            "integrasi": SETELAN["integrasi"], **_mode(con)}


@app.get("/api/saya")
def saya(request: Request):
    return {"peran": K.peran_saya(request)}


@app.get("/api/gedung")
def gedung(con=Depends(con_req)):
    return {"lantai": data.daftar_lantai(con), "penempatan": data.baca_gedung().get("penempatan", {})}


@app.get("/api/tim")
def tim():
    return data.baca_tim()


@app.get("/api/agent")
def agent(con=Depends(con_req)):
    return data.daftar_agent(con)


@app.get("/api/agent/{nama}")
def agent_satu(nama: str, con=Depends(con_req)):
    aid = data.cari_id(con, nama)
    if aid is None:
        raise HTTPException(404, f"agent '{nama}' tidak ada")
    return data.profil_agent(con, aid)


@app.get("/api/tugas")
def tugas_daftar(con=Depends(con_req)):
    return T.daftar(con)


@app.get("/api/tugas/{tid}")
def tugas_detail(tid: int, con=Depends(con_req)):
    try:
        return T.detail(con, tid)
    except T.TidakAda as e:
        raise HTTPException(404, str(e))


@app.get("/api/perintah")
def perintah_daftar(con=Depends(con_req)):
    return T.daftar_perintah(con, 30)


@app.get("/api/log")
def log(setelah: int = 0, con=Depends(con_req)):
    return data.daftar_log(con, setelah)


# =====================================================================
#  SESI OWNER
# =====================================================================
@app.post("/api/masuk")
def masuk(m: S.Masuk, response: Response):
    peran = K.peran_dari_kunci(m.kunci)
    if peran != "owner":
        raise HTTPException(401, "Kunci owner salah")
    response.set_cookie(K.NAMA_COOKIE, K.buat_sesi("owner"), httponly=True, samesite="strict",
                        max_age=K.UMUR_SESI, path="/")
    return {"peran": "owner"}


@app.post("/api/keluar")
def keluar(request: Request, response: Response):
    K.hapus_sesi(request.cookies.get(K.NAMA_COOKIE))
    response.delete_cookie(K.NAMA_COOKIE, path="/")
    return {"peran": "viewer"}


# =====================================================================
#  LAPORAN AGENT (agent / owner)
# =====================================================================
@app.post("/api/status")
def lapor_status(s: S.Status, con=Depends(con_req), peran=K.wajib("agent", "owner")):
    try:
        return {"ok": True, "agent": data.set_status(con, s.agent, s.keadaan, s.pesan)}
    except KeyError as e:
        raise HTTPException(404, str(e))


@app.post("/api/token")
def token(t: S.Token, request: Request, con=Depends(con_req), peran=K.wajib("agent", "owner")):
    aid = data.cari_id(con, t.agent)
    if aid is None:
        raise HTTPException(404, f"agent '{t.agent}' tidak ada")
    kunci = request.headers.get("idempotency-key")
    baru = data.catat_token(con, aid, t.model, t.masuk, t.keluar, sumber="lapor", kunci=kunci[:100] if kunci else None)
    return {"ok": True, "tercatat": baru}


# =====================================================================
#  PERINTAH & TUGAS (owner)
# =====================================================================
@app.post("/api/perintah")
def perintah_baru(p: S.Perintah, request: Request, con=Depends(con_req), peran=K.wajib("owner")):
    if SETELAN["demo"]:
        raise HTTPException(409, "Mode demo tidak menerima perintah sungguhan")
    kunci, lama = _idem(con, request, "/api/perintah")
    if lama:
        return lama
    if wa.minta_laporan(p.teks):
        # "kirim laporan ke WA" dikerjakan langsung dari database: cepat, tanpa token AI
        data.catat(con, "Cell", f"Perintah ke Jarvis: {p.teks.strip()[:120]}", "info")
        h = L.kirim_laporan(con, oleh="perintah Cell")
        hasil = {"id": None, "jenis": "laporan_wa", "wa": {k: v for k, v in h.items() if k != "teks"}}
        if kunci:
            data.idem_simpan(con, kunci, "/api/perintah", hasil)
        return hasil
    hasil = {"id": T.buat_perintah(con, p.teks.strip(), p.prioritas, "Cell")}
    if kunci:
        data.idem_simpan(con, kunci, "/api/perintah", hasil)
    return hasil


@app.post("/api/tugas")
def tugas_baru(t: S.TugasBaru, request: Request, con=Depends(con_req), peran=K.wajib("owner")):
    if SETELAN["demo"]:
        raise HTTPException(409, "Mode demo tidak menerima tugas sungguhan")
    kunci, lama = _idem(con, request, "/api/tugas")
    if lama:
        return lama
    aid = data.cari_id(con, t.agent)
    if aid is None:
        raise HTTPException(404, f"agent '{t.agent}' tidak ada")
    try:
        hasil = {"id": T.buat(con, t.judul.strip(), t.tujuan.strip(), t.kriteria, aid, t.prioritas, oleh="Cell")}
    except ValueError as e:
        raise HTTPException(422, str(e))
    if kunci:
        data.idem_simpan(con, kunci, "/api/tugas", hasil)
    return hasil


def _aksi(fungsi, *arg):
    try:
        return fungsi(*arg)
    except T.TidakAda as e:
        raise HTTPException(404, str(e))
    except T.TransisiDitolak as e:
        raise HTTPException(409, str(e))


@app.post("/api/tugas/{tid}/setujui")
def tugas_setujui(tid: int, k: S.Keputusan, con=Depends(con_req), peran=K.wajib("owner")):
    return _aksi(T.setujui, con, tid, "Cell", k.alasan)


@app.post("/api/tugas/{tid}/revisi")
def tugas_revisi(tid: int, k: S.Keputusan, con=Depends(con_req), peran=K.wajib("owner")):
    if len(k.alasan.strip()) < 3:
        raise HTTPException(422, "Tulis alasan revisi supaya Bayu tahu apa yang harus diperbaiki")
    return _aksi(T.minta_revisi, con, tid, "Cell", "owner", k.alasan.strip())


@app.post("/api/tugas/{tid}/ulang")
def tugas_ulang(tid: int, con=Depends(con_req), peran=K.wajib("owner")):
    return _aksi(T.ulang, con, tid, "Cell")


# =====================================================================
#  LAPORAN WHATSAPP (owner)
# =====================================================================
@app.get("/api/laporan")
def laporan_pratinjau(con=Depends(con_req), peran=K.wajib("owner")):
    """Isi laporan hari ini (per agent, token real) tanpa mengirim apa pun."""
    return {"teks": L.buat(con), "wa": wa.status()}


@app.post("/api/laporan/wa")
def laporan_kirim(con=Depends(con_req), peran=K.wajib("owner")):
    if SETELAN["demo"]:
        raise HTTPException(409, "Mode demo tidak mengirim WA")
    return L.kirim_laporan(con, oleh="tombol web")


@app.get("/api/tugas/{tid}/artefak/{aid}")
def artefak(tid: int, aid: int, con=Depends(con_req), peran=K.wajib("owner")):
    """File hasil kerja agent. Dikirim dengan CSP sandbox: kalau berisi HTML, skripnya
    tidak dijalankan dan tidak bisa memakai sesi owner."""
    try:
        f = T.file_artefak(con, tid, aid)
    except T.TidakAda as e:
        raise HTTPException(404, str(e))
    return FileResponse(f, headers={"Content-Security-Policy": "sandbox", "X-Content-Type-Options": "nosniff",
                                    "Cache-Control": "no-store"})


# ---------- frontend ----------
@app.get("/")
def beranda():
    return FileResponse(WEB / "index.html", headers={"Cache-Control": "no-store"})


app.mount("/lama", StaticFiles(directory=WEB_LAMA, html=True), name="web-lama")
app.mount("/", StaticFiles(directory=WEB, html=True), name="web")


if __name__ == "__main__":
    import uvicorn
    import webbrowser

    p = argparse.ArgumentParser(description="Markas Cell")
    p.add_argument("--demo", action="store_true", help="animasi contoh di database terpisah (markas-demo.db)")
    p.add_argument("--papan", help="path status.json kantor lama untuk ikut dibaca")
    p.add_argument("--port", type=int, default=PORT)
    p.add_argument("--tanpa-browser", action="store_true")
    p.add_argument("--buka", default="/", help="halaman yang dibuka di browser, misalnya /lama/markas.html (gedung 3D)")
    arg = p.parse_args()
    SETELAN.update(demo=arg.demo, papan=arg.papan)
    if not arg.tanpa_browser:
        webbrowser.open(f"http://localhost:{arg.port}{arg.buka if arg.buka.startswith('/') else '/' + arg.buka}")
    print(f"Markas Cell 2.0 menyala di http://localhost:{arg.port}  (Ctrl+C untuk berhenti)")
    print(f"Kunci owner ada di {config.FILE_ENV}  (dipakai untuk masuk di halaman Kontrol)")
    # 127.0.0.1 = hanya bisa dibuka dari laptop ini
    uvicorn.run(app, host="127.0.0.1", port=arg.port, log_level="warning")
