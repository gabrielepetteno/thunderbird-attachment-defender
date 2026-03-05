@echo off
REM ============================================================
REM  PDF Sanitizer Pro - Setup Completo VPS
REM  ESEGUI COME AMMINISTRATORE (tasto destro > Esegui come admin)
REM  Esegui UNA SOLA VOLTA per installare tutto sul VPS.
REM ============================================================

echo.
echo  ============================================
echo   PDF Sanitizer Pro - Setup VPS
echo   Porta: 9097
echo  ============================================
echo.

REM 1. Crea cartelle di lavoro
echo [1/6] Creando cartelle...
if not exist "C:\PDF_Sanitizer" mkdir "C:\PDF_Sanitizer"
if not exist "C:\PDF_Sanitizer\temp" mkdir "C:\PDF_Sanitizer\temp"
if not exist "C:\PDF_Sanitizer\logs" mkdir "C:\PDF_Sanitizer\logs"

REM 2. Copia i file nella cartella di lavoro
echo [2/6] Copiando i file del server...
copy /Y "%~dp0server.py" "C:\PDF_Sanitizer\server.py"
copy /Y "%~dp0requirements.txt" "C:\PDF_Sanitizer\requirements.txt"
copy /Y "%~dp0start_server.bat" "C:\PDF_Sanitizer\start_server.bat"
copy /Y "%~dp0install_service.ps1" "C:\PDF_Sanitizer\install_service.ps1"

REM 3. Installa le dipendenze Python
echo [3/6] Installando le dipendenze Python...
pip install -r "C:\PDF_Sanitizer\requirements.txt"
if errorlevel 1 (
    echo [ERRORE] Installazione dipendenze fallita! Verifica che Python sia nel PATH.
    pause
    exit /b 1
)

REM 4. Apri la porta 9097 nel Firewall di Windows
echo [4/6] Aprendo porta 9097 nel Firewall di Windows...
netsh advfirewall firewall delete rule name="PDF Sanitizer Pro API" >nul 2>&1
netsh advfirewall firewall add rule name="PDF Sanitizer Pro API" dir=in action=allow protocol=TCP localport=9097
if errorlevel 1 (
    echo [ATTENZIONE] Impossibile configurare il firewall. Esegui questo script come Amministratore!
) else (
    echo    Porta 9097 aperta con successo!
)

REM 5. Crea Task Scheduler per avvio automatico al boot del VPS
echo [5/6] Configurando avvio automatico al boot...
schtasks /delete /tn "PDF_Sanitizer_Pro" /f >nul 2>&1
schtasks /create /tn "PDF_Sanitizer_Pro" /tr "C:\PDF_Sanitizer\start_server.bat" /sc onstart /ru SYSTEM /rl HIGHEST /f
if errorlevel 1 (
    echo [ATTENZIONE] Impossibile creare il task schedulato. Esegui come Amministratore!
) else (
    echo    Task schedulato creato con successo!
)

REM 6. Test veloce del server
echo [6/6] Avvio test rapido del server...
cd /d "C:\PDF_Sanitizer"
python -c "import fitz; print(f'  PyMuPDF v{fitz.version[0]} - OK')"
python -c "import fastapi; print(f'  FastAPI - OK')"
python -c "import uvicorn; print(f'  Uvicorn - OK')"

echo.
echo  ============================================
echo   SETUP COMPLETATO CON SUCCESSO!
echo  ============================================
echo.
echo   Cartella server:   C:\PDF_Sanitizer\
echo   Indirizzo:         http://YOUR_SERVER_IP:9097
echo   Porta firewall:    9097 (APERTA)
echo   Auto-avvio:        ATTIVO (Task Scheduler)
echo   Log:               C:\PDF_Sanitizer\logs\
echo.
echo   Per avviare il server ORA:
echo     C:\PDF_Sanitizer\start_server.bat
echo.
echo   Oppure per installarlo come Servizio Windows
echo   (consigliato - piu' stabile):
echo     Apri PowerShell come Admin ed esegui:
echo     Set-ExecutionPolicy Bypass -Scope Process -Force
echo     C:\PDF_Sanitizer\install_service.ps1
echo.
echo   RICORDA: Modifica API_SECRET_KEY in server.py!
echo.

pause
