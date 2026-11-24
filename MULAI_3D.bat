@echo off
REM Klik dua kali: Markas Cell terbuka langsung di GEDUNG 3D (http://localhost:8300/lama/markas.html)
REM Sama persis dengan MULAI.bat (data asli, agent sungguhan), hanya halaman pertamanya gedung 3D.
REM Membuka 2 jendela: SERVER (dashboard) dan WORKER (yang benar-benar menjalankan agent).
REM Pertama kali: library dipasang otomatis dan file .env berisi kunci owner dibuat.
cd /d %~dp0
set PY=python
where python >nul 2>nul || set PY=py
%PY% -c "import fastapi, uvicorn, psutil" 2>nul || %PY% -m pip install -r requirements.txt
REM Ikut membaca papan absen kantor lama kalau ada (hook Claude Code yang sudah jalan langsung tampil)
set PAPAN=
if exist "%USERPROFILE%\tim-agent\kantor-pixel\status.json" set PAPAN=--papan "%USERPROFILE%\tim-agent\kantor-pixel\status.json"
start "Markas Worker" cmd /k "timeout /t 5 >nul & %PY% -u backend\worker.py"
%PY% backend\main.py %PAPAN% --buka /lama/markas.html
pause
