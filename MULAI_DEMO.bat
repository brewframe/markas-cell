@echo off
REM Klik dua kali: lihat animasi contoh. Memakai database terpisah (data\markas-demo.db),
REM jadi data asli di data\markas.db tidak tersentuh. Tidak ada agent sungguhan yang bekerja.
cd /d %~dp0
set PY=python
where python >nul 2>nul || set PY=py
%PY% -c "import fastapi, uvicorn, psutil" 2>nul || %PY% -m pip install -r requirements.txt
%PY% backend\main.py --demo
pause
