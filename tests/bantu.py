"""Alat bantu tes: setiap tes memakai folder data sementara, tidak pernah menyentuh data/markas.db asli."""
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import json
import urllib.error
import urllib.request
from pathlib import Path

PROYEK = Path(__file__).resolve().parent.parent
BACKEND = PROYEK / "backend"


def folder_sementara() -> Path:
    tmp = Path(tempfile.mkdtemp(prefix="markas-tes-"))
    (tmp / "data").mkdir()
    for f in ("tim.json", "gedung.json", "profil.json"):
        shutil.copy(PROYEK / "data" / f, tmp / "data" / f)
    return tmp


def pakai_env(tmp: Path) -> dict:
    env = {"MARKAS_DATA": str(tmp / "data"), "MARKAS_ENV": str(tmp / ".env"), "MARKAS_HASIL": str(tmp / "hasil")}
    os.environ.update(env)
    if str(BACKEND) not in sys.path:
        sys.path.insert(0, str(BACKEND))
    return env


def port_kosong() -> int:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    p = s.getsockname()[1]
    s.close()
    return p


class Server:
    """Menjalankan backend sungguhan (uvicorn) di port acak untuk tes API."""

    def __init__(self, tmp: Path, *arg: str):
        self.tmp, self.port = tmp, port_kosong()
        env = dict(os.environ, MARKAS_DATA=str(tmp / "data"), MARKAS_ENV=str(tmp / ".env"), MARKAS_HASIL=str(tmp / "hasil"))
        self.proses = subprocess.Popen([sys.executable, str(BACKEND / "main.py"), "--tanpa-browser", "--port", str(self.port), *arg],
                                       env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        for _ in range(100):
            try:
                self.minta("GET", "/api/health")
                break
            except Exception:
                time.sleep(0.1)
        else:
            self.stop()
            raise RuntimeError("server tes tidak menyala: " + self.proses.stderr.read().decode()[-500:])
        env_file = {k: v for k, v in (b.split("=", 1) for b in (tmp / ".env").read_text().splitlines() if "=" in b and not b.startswith("#"))}
        self.owner, self.agent = env_file["MARKAS_KUNCI_OWNER"], env_file["MARKAS_KUNCI_AGENT"]

    def minta(self, metode: str, jalur: str, isi=None, kunci: str | None = None, kepala: dict | None = None):
        """Mengembalikan (kode_status, json_atau_teks, header)."""
        h = {"Content-Type": "application/json", **(kepala or {})}
        if kunci:
            h["X-Markas-Key"] = kunci
        req = urllib.request.Request(f"http://127.0.0.1:{self.port}{jalur}", method=metode, headers=h,
                                     data=json.dumps(isi).encode() if isi is not None else None)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                badan = r.read()
                return r.status, _baca(badan), dict(r.headers)
        except urllib.error.HTTPError as e:
            return e.code, _baca(e.read()), dict(e.headers)

    def stop(self):
        self.proses.stderr.close()
        self.proses.terminate()
        try:
            self.proses.wait(5)
        except subprocess.TimeoutExpired:
            self.proses.kill()


def _baca(b: bytes):
    try:
        return json.loads(b)
    except ValueError:
        return b.decode(errors="replace")
