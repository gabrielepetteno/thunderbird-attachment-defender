# ============================================================
#  PDF Sanitizer Pro - Installazione Servizio Windows
#
#  Questo script installa il server come SERVIZIO WINDOWS
#  che parte automaticamente al boot e si riavvia da solo
#  in caso di crash. NON serve tenere nessuna finestra aperta.
#
#  ESEGUI COME AMMINISTRATORE in PowerShell:
#    Set-ExecutionPolicy Bypass -Scope Process -Force
#    .\install_service.ps1
# ============================================================

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   PDF Sanitizer Pro - Installazione Servizio" -ForegroundColor Cyan
Write-Host "   Porta: 9097" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# Verifica esecuzione come Admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "  ERRORE: Esegui PowerShell come Amministratore!" -ForegroundColor Red
    Write-Host "  Tasto destro su PowerShell > Esegui come amministratore" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Premi Invio per uscire"
    exit 1
}

# ============================================================
# FASE 1: Scarica NSSM (Non-Sucking Service Manager)
# ============================================================
$nssmPath = "C:\PDF_Sanitizer\nssm.exe"

if (-not (Test-Path $nssmPath)) {
    Write-Host "[1/6] Scaricando NSSM..." -ForegroundColor Yellow

    $nssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $zipPath = "C:\PDF_Sanitizer\nssm.zip"
    $extractPath = "C:\PDF_Sanitizer\nssm_temp"

    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $nssmUrl -OutFile $zipPath -UseBasicParsing
        Expand-Archive -Path $zipPath -DestinationPath $extractPath -Force
        Copy-Item "$extractPath\nssm-2.24\win64\nssm.exe" $nssmPath -Force
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item $extractPath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   NSSM scaricato!" -ForegroundColor Green
    } catch {
        Write-Host "   Impossibile scaricare NSSM automaticamente." -ForegroundColor Red
        Write-Host "   Scaricalo da https://nssm.cc/download" -ForegroundColor Yellow
        Write-Host "   Copia nssm.exe (win64) in C:\PDF_Sanitizer\" -ForegroundColor Yellow
        Read-Host "Premi Invio dopo aver copiato nssm.exe"

        if (-not (Test-Path $nssmPath)) {
            Write-Host "   nssm.exe non trovato. Uscita." -ForegroundColor Red
            exit 1
        }
    }
} else {
    Write-Host "[1/6] NSSM gia' presente." -ForegroundColor Green
}

# ============================================================
# FASE 2: Rimuovi servizio precedente
# ============================================================
Write-Host "[2/6] Rimuovendo servizio precedente (se esiste)..." -ForegroundColor Yellow
& $nssmPath stop "PDFSanitizerPro" 2>$null | Out-Null
Start-Sleep -Seconds 2
& $nssmPath remove "PDFSanitizerPro" confirm 2>$null | Out-Null
Start-Sleep -Seconds 2
Write-Host "   Fatto." -ForegroundColor Green

# ============================================================
# FASE 3: Trova Python e Uvicorn
# ============================================================
Write-Host "[3/6] Cercando Python..." -ForegroundColor Yellow
$pythonPath = (Get-Command python -ErrorAction SilentlyContinue).Source

if (-not $pythonPath) {
    # Cerca nei percorsi comuni
    $commonPaths = @(
        "C:\Python312\python.exe",
        "C:\Python311\python.exe",
        "C:\Python310\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python312\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe",
        "$env:LOCALAPPDATA\Programs\Python\Python310\python.exe"
    )
    foreach ($p in $commonPaths) {
        if (Test-Path $p) { $pythonPath = $p; break }
    }
}

if (-not $pythonPath) {
    Write-Host "   ERRORE: Python non trovato!" -ForegroundColor Red
    Write-Host "   Installa Python e assicurati che sia nel PATH." -ForegroundColor Yellow
    exit 1
}
Write-Host "   Python: $pythonPath" -ForegroundColor Green

# ============================================================
# FASE 4: Apri porta 9097 nel firewall
# ============================================================
Write-Host "[4/6] Configurando Firewall porta 9097..." -ForegroundColor Yellow
netsh advfirewall firewall delete rule name="PDF Sanitizer Pro API" 2>$null | Out-Null
netsh advfirewall firewall add rule name="PDF Sanitizer Pro API" dir=in action=allow protocol=TCP localport=9097 | Out-Null
Write-Host "   Porta 9097 aperta!" -ForegroundColor Green

# ============================================================
# FASE 5: Installa il servizio Windows
# ============================================================
Write-Host "[5/6] Installando servizio Windows..." -ForegroundColor Yellow

# Usa python -m uvicorn per massima compatibilita'
& $nssmPath install "PDFSanitizerPro" $pythonPath "-m uvicorn server:app --host 0.0.0.0 --port 9097 --log-level info"

# Configura il servizio
& $nssmPath set "PDFSanitizerPro" DisplayName "PDF Sanitizer Pro API"
& $nssmPath set "PDFSanitizerPro" Description "Server API per analisi e sanificazione PDF - Protezione automatica email Thunderbird - Porta 9097"
& $nssmPath set "PDFSanitizerPro" AppDirectory "C:\PDF_Sanitizer"
& $nssmPath set "PDFSanitizerPro" Start SERVICE_AUTO_START

# Log
& $nssmPath set "PDFSanitizerPro" AppStdout "C:\PDF_Sanitizer\logs\service_stdout.log"
& $nssmPath set "PDFSanitizerPro" AppStderr "C:\PDF_Sanitizer\logs\service_stderr.log"
& $nssmPath set "PDFSanitizerPro" AppRotateFiles 1
& $nssmPath set "PDFSanitizerPro" AppRotateBytes 10485760

# Auto-riavvio in caso di crash (attende 5 secondi poi riprova)
& $nssmPath set "PDFSanitizerPro" AppThrottle 5000
& $nssmPath set "PDFSanitizerPro" AppRestartDelay 5000
& $nssmPath set "PDFSanitizerPro" AppExit Default Restart

Write-Host "   Servizio installato!" -ForegroundColor Green

# ============================================================
# FASE 6: Avvia il servizio
# ============================================================
Write-Host "[6/6] Avviando il servizio..." -ForegroundColor Yellow
& $nssmPath start "PDFSanitizerPro"

Start-Sleep -Seconds 5

# Verifica
$service = Get-Service -Name "PDFSanitizerPro" -ErrorAction SilentlyContinue

if ($service -and $service.Status -eq "Running") {
    # Test rapido connessione
    $testOk = $false
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:9097/docs" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) { $testOk = $true }
    } catch {}

    Write-Host ""
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host "   INSTALLAZIONE COMPLETATA!" -ForegroundColor Green
    Write-Host "  ============================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Servizio:     PDFSanitizerPro" -ForegroundColor White
    Write-Host "   Stato:        ATTIVO" -ForegroundColor Green
    Write-Host "   Indirizzo:    http://YOUR_SERVER_IP:9097" -ForegroundColor Cyan
    Write-Host "   Porta locale: http://localhost:9097" -ForegroundColor White
    Write-Host "   Avvio:        Automatico (al boot del VPS)" -ForegroundColor White
    Write-Host "   Crash:        Riavvio automatico dopo 5s" -ForegroundColor White
    Write-Host "   Log:          C:\PDF_Sanitizer\logs\" -ForegroundColor White

    if ($testOk) {
        Write-Host "   Test locale:  PASSATO" -ForegroundColor Green
    } else {
        Write-Host "   Test locale:  In attesa (il server sta avviando)" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "   Comandi utili (da PowerShell Admin):" -ForegroundColor Cyan
    Write-Host "     Stato:     Get-Service PDFSanitizerPro" -ForegroundColor Gray
    Write-Host "     Fermare:   C:\PDF_Sanitizer\nssm.exe stop PDFSanitizerPro" -ForegroundColor Gray
    Write-Host "     Avviare:   C:\PDF_Sanitizer\nssm.exe start PDFSanitizerPro" -ForegroundColor Gray
    Write-Host "     Riavviare: C:\PDF_Sanitizer\nssm.exe restart PDFSanitizerPro" -ForegroundColor Gray
    Write-Host "     Rimuovere: C:\PDF_Sanitizer\nssm.exe remove PDFSanitizerPro confirm" -ForegroundColor Gray
    Write-Host "     API Docs:  http://localhost:9097/docs" -ForegroundColor Gray
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  ATTENZIONE: Il servizio non si e' avviato." -ForegroundColor Red
    Write-Host "  Controlla i log: C:\PDF_Sanitizer\logs\service_stderr.log" -ForegroundColor Yellow
    Write-Host ""

    if (Test-Path "C:\PDF_Sanitizer\logs\service_stderr.log") {
        Write-Host "  Ultime righe del log errori:" -ForegroundColor Yellow
        Get-Content "C:\PDF_Sanitizer\logs\service_stderr.log" -Tail 15
    }
}

Write-Host ""
Read-Host "Premi Invio per chiudere"
