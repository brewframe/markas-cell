@echo off
REM Klik dua kali SEKALI untuk memasang 3 jadwal Windows (Task Scheduler):
REM   MarkasCell-Nyala    : saat kamu login ke Windows -> server + worker menyala diam-diam
REM   MarkasCell-Perintah : setiap hari jam 07.00 -> kirim data\perintah_harian.txt ke Jarvis
REM   MarkasCell-Laporan  : setiap hari jam 20.00 -> laporan harian dikirim ke WA
REM StartWhenAvailable: kalau laptop mati di jam itu, tugas jalan begitu laptop menyala.
REM Ubah jam di bawah (07:00 dan 20:00) sesuai keinginanmu, lalu klik dua kali lagi.
cd /d %~dp0
if not exist laporan mkdir laporan
set PY=python
where python >nul 2>nul || set PY=py
for /f "delims=" %%i in ('where %PY%') do (set PYPATH=%%i & goto :ada)
:ada
powershell -NoProfile -Command ^
 "$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries;" ^
 "$a1 = New-ScheduledTaskAction -Execute '%~dp0MULAI_DIAM.bat' -WorkingDirectory '%~dp0';" ^
 "Register-ScheduledTask -TaskName 'MarkasCell-Nyala' -Action $a1 -Trigger (New-ScheduledTaskTrigger -AtLogOn) -Settings $s -Force | Out-Null;" ^
 "$a2 = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c \"%PYPATH%\" backend\perintah_harian.py --kirim >> laporan\otomatis.log 2>&1' -WorkingDirectory '%~dp0';" ^
 "Register-ScheduledTask -TaskName 'MarkasCell-Perintah' -Action $a2 -Trigger (New-ScheduledTaskTrigger -Daily -At 07:00) -Settings $s -Force | Out-Null;" ^
 "$a3 = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c \"%PYPATH%\" backend\laporan_wa.py --kirim >> laporan\otomatis.log 2>&1' -WorkingDirectory '%~dp0';" ^
 "Register-ScheduledTask -TaskName 'MarkasCell-Laporan' -Action $a3 -Trigger (New-ScheduledTaskTrigger -Daily -At 20:00) -Settings $s -Force | Out-Null"
echo.
echo Jadwal terpasang: MarkasCell-Nyala, MarkasCell-Perintah (07.00), MarkasCell-Laporan (20.00).
echo Cek di aplikasi "Task Scheduler". Catatan jalannya ada di folder laporan\otomatis.log
pause
