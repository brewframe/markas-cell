@echo off
REM Menyalakan server + worker Markas Cell TANPA membuka browser (dipakai jadwal otomatis saat laptop menyala).
REM Kedua jendela dibuka dalam keadaan kecil (minimized). Tutup jendelanya untuk mematikan.
cd /d %~dp0
if not exist laporan mkdir laporan
set PY=python
where python >nul 2>nul || set PY=py
start "Markas Server" /min cmd /c "%PY% backend\main.py --tanpa-browser >> laporan\server.log 2>&1"
timeout /t 6 >nul
start "Markas Worker" /min cmd /c "%PY% -u backend\worker.py >> laporan\worker.log 2>&1"
