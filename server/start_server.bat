@echo off
REM ============================================================
REM  PDF Sanitizer Pro - Avvio Server con Auto-Riavvio
REM  Si riavvia automaticamente se il server crasha.
REM  Viene eseguito automaticamente al boot del VPS.
REM ============================================================

cd /d "C:\PDF_Sanitizer"

:loop
echo.
echo  ============================================
echo   PDF Sanitizer Pro - Server
echo   http://YOUR_SERVER_IP:9097
echo   %date% %time%
echo  ============================================
echo.

REM Log dell'avvio
echo [%date% %time%] Avvio server sulla porta 9097... >> "C:\PDF_Sanitizer\logs\startup.log"

REM Controlla che Python sia installato
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Python non trovato! Installa Python e aggiungilo al PATH.
    echo [%date% %time%] ERRORE: Python non trovato >> "C:\PDF_Sanitizer\logs\startup.log"
    timeout /t 30 /nobreak
    goto loop
)

REM Controlla che server.py esista
if not exist "C:\PDF_Sanitizer\server.py" (
    echo [ERRORE] server.py non trovato!
    echo [%date% %time%] ERRORE: server.py non trovato >> "C:\PDF_Sanitizer\logs\startup.log"
    timeout /t 30 /nobreak
    goto loop
)

REM Avvia il server sulla porta 9097
echo Server avviato. Premi CTRL+C per fermare.
echo [%date% %time%] Server avviato su porta 9097 >> "C:\PDF_Sanitizer\logs\startup.log"

python -m uvicorn server:app --host 0.0.0.0 --port 9097 --log-level info

REM Se arriviamo qui, il server si e' fermato (crash o CTRL+C)
echo.
echo [ATTENZIONE] Il server si e' fermato!
echo [%date% %time%] Server fermato - riavvio tra 10 secondi >> "C:\PDF_Sanitizer\logs\startup.log"
echo Riavvio automatico tra 10 secondi... (CTRL+C per annullare)
timeout /t 10 /nobreak

goto loop
