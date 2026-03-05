@echo off
REM ============================================================
REM  PDF Sanitizer Pro - INSTALLAZIONE COMPLETA
REM
REM  Questo UNICO file fa TUTTO:
REM    1. Crea le cartelle
REM    2. Installa le librerie Python
REM    3. Apre la porta 9097 nel firewall
REM    4. Scarica NSSM per creare il servizio Windows
REM    5. Installa il servizio che parte al boot
REM    6. Avvia il servizio
REM
REM  ESEGUI COME AMMINISTRATORE:
REM    Tasto destro > Esegui come amministratore
REM ============================================================

echo.
echo  =============================================
echo   PDF Sanitizer Pro - Installazione Completa
echo   Porta: 9097
echo  =============================================
echo.

REM --- Verifica Admin ---
net session >nul 2>&1
if errorlevel 1 (
    echo  [ERRORE] Devi eseguire questo file come AMMINISTRATORE!
    echo  Chiudi, poi tasto destro sul file e "Esegui come amministratore"
    echo.
    pause
    exit /b 1
)
echo  [OK] Esecuzione come Amministratore confermata.
echo.

REM ============================================================
REM  FASE 1: Crea cartelle
REM ============================================================
echo  [1/7] Creando cartelle...
if not exist "C:\PDF_Sanitizer" mkdir "C:\PDF_Sanitizer"
if not exist "C:\PDF_Sanitizer\temp" mkdir "C:\PDF_Sanitizer\temp"
if not exist "C:\PDF_Sanitizer\logs" mkdir "C:\PDF_Sanitizer\logs"
echo        C:\PDF_Sanitizer\         OK
echo        C:\PDF_Sanitizer\temp\    OK
echo        C:\PDF_Sanitizer\logs\    OK
echo.

REM ============================================================
REM  FASE 2: Verifica che server.py sia nella cartella
REM ============================================================
echo  [2/7] Verificando server.py...

REM Controlla se esiste gia' nella cartella di destinazione
if exist "C:\PDF_Sanitizer\server.py" (
    echo        server.py trovato in C:\PDF_Sanitizer\   OK
    goto fase3
)

REM Prova a copiarlo dalla cartella dello script
copy /Y "%~dp0server.py" "C:\PDF_Sanitizer\server.py" >nul 2>&1
if exist "C:\PDF_Sanitizer\server.py" (
    echo        server.py copiato in C:\PDF_Sanitizer\   OK
    goto fase3
)

REM Prova dalla cartella corrente
copy /Y "server.py" "C:\PDF_Sanitizer\server.py" >nul 2>&1
if exist "C:\PDF_Sanitizer\server.py" (
    echo        server.py copiato in C:\PDF_Sanitizer\   OK
    goto fase3
)

REM Prova dal Desktop dell'utente corrente
copy /Y "%USERPROFILE%\Desktop\server.py" "C:\PDF_Sanitizer\server.py" >nul 2>&1
if exist "C:\PDF_Sanitizer\server.py" (
    echo        server.py copiato dal Desktop   OK
    goto fase3
)

echo  [ERRORE] server.py non trovato!
echo  Copia server.py manualmente dentro C:\PDF_Sanitizer\
echo  e poi riesegui questo script.
pause
exit /b 1

:fase3

REM ============================================================
REM  FASE 3: Installa dipendenze Python
REM ============================================================
echo  [3/7] Installando dipendenze Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo  [ERRORE] Python non trovato!
    echo  Scarica Python da https://www.python.org/downloads/
    echo  IMPORTANTE: spunta "Add Python to PATH" durante l'installazione!
    pause
    exit /b 1
)
pip install fastapi uvicorn pymupdf python-multipart 2>nul
echo        Dipendenze installate   OK
echo.

REM ============================================================
REM  FASE 4: Apri porta 9097 nel firewall
REM ============================================================
echo  [4/7] Aprendo porta 9097 nel Firewall di Windows...
netsh advfirewall firewall delete rule name="PDF Sanitizer Pro API" >nul 2>&1
netsh advfirewall firewall add rule name="PDF Sanitizer Pro API" dir=in action=allow protocol=TCP localport=9097 >nul
echo        Porta 9097 aperta nel firewall   OK
echo.

REM ============================================================
REM  FASE 5: Scarica NSSM
REM ============================================================
echo  [5/7] Preparando NSSM (Service Manager)...
if exist "C:\PDF_Sanitizer\nssm.exe" (
    echo        NSSM gia' presente   OK
) else (
    echo        Scaricando NSSM...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://nssm.cc/release/nssm-2.24.zip' -OutFile 'C:\PDF_Sanitizer\nssm.zip' -UseBasicParsing" 2>nul
    if exist "C:\PDF_Sanitizer\nssm.zip" (
        powershell -Command "Expand-Archive -Path 'C:\PDF_Sanitizer\nssm.zip' -DestinationPath 'C:\PDF_Sanitizer\nssm_temp' -Force" 2>nul
        copy /Y "C:\PDF_Sanitizer\nssm_temp\nssm-2.24\win64\nssm.exe" "C:\PDF_Sanitizer\nssm.exe" >nul
        rmdir /s /q "C:\PDF_Sanitizer\nssm_temp" >nul 2>&1
        del "C:\PDF_Sanitizer\nssm.zip" >nul 2>&1
        echo        NSSM scaricato   OK
    ) else (
        echo  [ATTENZIONE] Download automatico NSSM fallito.
        echo  Scaricalo manualmente da https://nssm.cc/download
        echo  Copia nssm.exe (cartella win64) in C:\PDF_Sanitizer\nssm.exe
        echo  Poi riesegui questo script.
        pause
        exit /b 1
    )
)
echo.

REM ============================================================
REM  FASE 6: Installa servizio Windows
REM ============================================================
echo  [6/7] Installando servizio Windows "PDFSanitizerPro"...

REM Ferma e rimuovi se esiste gia'
"C:\PDF_Sanitizer\nssm.exe" stop PDFSanitizerPro >nul 2>&1
timeout /t 2 /nobreak >nul
"C:\PDF_Sanitizer\nssm.exe" remove PDFSanitizerPro confirm >nul 2>&1
timeout /t 2 /nobreak >nul

REM Trova Python
for /f "delims=" %%i in ('where python 2^>nul') do set PYTHON_PATH=%%i
if "%PYTHON_PATH%"=="" (
    echo  [ERRORE] Python non trovato nel PATH!
    pause
    exit /b 1
)

REM Installa il servizio
"C:\PDF_Sanitizer\nssm.exe" install PDFSanitizerPro "%PYTHON_PATH%" "-m uvicorn server:app --host 0.0.0.0 --port 9097 --log-level info"

REM Configura il servizio
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro DisplayName "PDF Sanitizer Pro API"
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro Description "Analisi e sanificazione PDF per Thunderbird - Porta 9097"
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro AppDirectory "C:\PDF_Sanitizer"
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro Start SERVICE_AUTO_START
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro AppStdout "C:\PDF_Sanitizer\logs\service_stdout.log"
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro AppStderr "C:\PDF_Sanitizer\logs\service_stderr.log"
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro AppRotateFiles 1
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro AppRotateBytes 10485760
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro AppThrottle 5000
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro AppRestartDelay 5000
"C:\PDF_Sanitizer\nssm.exe" set PDFSanitizerPro AppExit Default Restart

echo        Servizio installato   OK
echo.

REM ============================================================
REM  FASE 7: Avvia il servizio
REM ============================================================
echo  [7/7] Avviando il servizio...
"C:\PDF_Sanitizer\nssm.exe" start PDFSanitizerPro
timeout /t 5 /nobreak >nul

REM Verifica che funzioni
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:9097/docs' -UseBasicParsing -TimeoutSec 5; if($r.StatusCode -eq 200) { Write-Host '        Server risponde   OK' -ForegroundColor Green } } catch { Write-Host '        Server in avvio... riprova tra qualche secondo' -ForegroundColor Yellow }"

echo.
echo  =============================================
echo   INSTALLAZIONE COMPLETATA!
echo  =============================================
echo.
echo   Indirizzo server:  http://YOUR_SERVER_IP:9097
echo   Documentazione:    http://YOUR_SERVER_IP:9097/docs
echo   Servizio Windows:  PDFSanitizerPro
echo   Avvio automatico:  SI (al boot del VPS)
echo   Auto-riavvio:      SI (dopo 5 secondi se crasha)
echo   Log:               C:\PDF_Sanitizer\logs\
echo.
echo   Comandi utili (da Prompt Comandi come Admin):
echo     Stato:     sc query PDFSanitizerPro
echo     Fermare:   C:\PDF_Sanitizer\nssm.exe stop PDFSanitizerPro
echo     Avviare:   C:\PDF_Sanitizer\nssm.exe start PDFSanitizerPro
echo     Riavviare: C:\PDF_Sanitizer\nssm.exe restart PDFSanitizerPro
echo.
echo   RICORDA: Modifica API_SECRET_KEY in C:\PDF_Sanitizer\server.py
echo            con una password sicura!
echo.

pause
