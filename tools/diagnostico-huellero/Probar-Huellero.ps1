# ═══════════════════════════════════════════════════════════════════════════
# LUCEBIEN · Probar-Huellero.ps1 — diagnóstico del terminal Hikvision
# ═══════════════════════════════════════════════════════════════════════════
#
# QUÉ HACE: se conecta al huellero por ISAPI y comprueba que se pueden leer
# las personas inscritas y los eventos de marcación. NO escribe nada en el
# equipo, NO toca la base de datos y NO instala nada. Solo lee.
#
# PARA QUÉ SIRVE: confirmar que la integración es viable antes de construir
# el colector, y de paso exportar la lista de personas del equipo, que es lo
# que hace falta para mapear cada identificador a un empleado real.
#
# CÓMO SE USA (en la PC del almacén, la que ve al huellero):
#
#   1. Abrir PowerShell en la carpeta donde está este archivo.
#   2. Ejecutar:
#
#        powershell -ExecutionPolicy Bypass -File .\Probar-Huellero.ps1
#
#   3. Pide la contraseña de administrador del equipo y hace el resto.
#
# Deja dos archivos CSV al lado del script: las personas y las marcas leídas.
# ═══════════════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [string] $Ip = '192.168.1.220',
    [string] $Usuario = 'admin',
    [int]    $DiasAtras = 7,
    [switch] $UsarHttp
)

$ErrorActionPreference = 'Stop'

# ── Presentación ───────────────────────────────────────────────────────────
Write-Host ''
Write-Host '══════════════════════════════════════════════════════' -ForegroundColor DarkGray
Write-Host ' LUCEBIEN · Diagnóstico del huellero' -ForegroundColor White
Write-Host '══════════════════════════════════════════════════════' -ForegroundColor DarkGray
Write-Host ''
Write-Host " Equipo:  $Ip"
Write-Host " Usuario: $Usuario"
Write-Host " Rango:   últimos $DiasAtras día(s)"
Write-Host ''

# ── Contraseña ─────────────────────────────────────────────────────────────
$segura = Read-Host -Prompt ' Contraseña de administrador del huellero' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
$clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($clave)) {
    Write-Host ' Sin contraseña no se puede continuar.' -ForegroundColor Red
    exit 1
}

if ($UsarHttp) { $baseUrl = "http://$Ip" } else { $baseUrl = "https://$Ip" }

# ── El equipo usa certificado autofirmado: hay que aceptarlo ───────────────
try {
    Add-Type -TypeDefinition @'
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class AceptarCertificadoDelHuellero : ICertificatePolicy {
    public bool CheckValidationResult(ServicePoint sp, X509Certificate cert, WebRequest req, int problem) {
        return true;
    }
}
'@ -ErrorAction SilentlyContinue
    [System.Net.ServicePointManager]::CertificatePolicy = New-Object AceptarCertificadoDelHuellero
} catch {
    # Ya estaba definido en esta sesión de PowerShell. No es un problema.
}
[System.Net.ServicePointManager]::SecurityProtocol = `
    [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls

# ── Llamada ISAPI con autenticación digest ─────────────────────────────────
function Invoke-Isapi {
    param(
        [Parameter(Mandatory)] [string] $Ruta,
        [string] $Cuerpo,
        [string] $Metodo = 'POST'
    )

    $url = "$baseUrl$Ruta"
    $credencial = New-Object System.Net.NetworkCredential($Usuario, $clave)
    $cache = New-Object System.Net.CredentialCache
    $cache.Add((New-Object System.Uri($url)), 'Digest', $credencial)

    $peticion = [System.Net.HttpWebRequest]::Create($url)
    $peticion.Method = $Metodo
    $peticion.Credentials = $cache
    $peticion.PreAuthenticate = $true
    $peticion.Timeout = 30000
    $peticion.ContentType = 'application/json'
    $peticion.Accept = 'application/json'

    if ($Cuerpo) {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Cuerpo)
        $peticion.ContentLength = $bytes.Length
        $flujo = $peticion.GetRequestStream()
        $flujo.Write($bytes, 0, $bytes.Length)
        $flujo.Close()
    }

    $respuesta = $peticion.GetResponse()
    $lector = New-Object System.IO.StreamReader($respuesta.GetResponseStream())
    $texto = $lector.ReadToEnd()
    $lector.Close()
    $respuesta.Close()
    return $texto
}

function Mostrar-Error {
    param([System.Management.Automation.ErrorRecord] $Registro)

    $mensaje = $Registro.Exception.Message
    Write-Host " $mensaje" -ForegroundColor Red

    if ($mensaje -match '401') {
        Write-Host ''
        Write-Host ' La contraseña o el usuario no son correctos.' -ForegroundColor Yellow
        Write-Host ' Es la misma cuenta con la que se entra a la web del equipo.' -ForegroundColor Yellow
    } elseif ($mensaje -match 'tiempo|timeout|conectar|connect|remoto') {
        Write-Host ''
        Write-Host " No se llegó al equipo en $Ip." -ForegroundColor Yellow
        Write-Host ' Comprobar que esta PC está en la misma red:' -ForegroundColor Yellow
        Write-Host "   ping $Ip" -ForegroundColor Gray
        Write-Host ' Si el ping responde pero esto no, probar con el parámetro -UsarHttp.' -ForegroundColor Yellow
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# PASO 1 — ¿Responde el equipo?
# ═══════════════════════════════════════════════════════════════════════════
Write-Host ' [1/3] Conectando con el equipo...' -ForegroundColor Cyan

try {
    $infoTexto = Invoke-Isapi -Ruta '/ISAPI/System/deviceInfo?format=json' -Metodo 'GET'
    $info = $infoTexto | ConvertFrom-Json
    $d = $info.DeviceInfo

    Write-Host '       Conectado.' -ForegroundColor Green
    Write-Host "       Modelo:   $($d.model)"
    Write-Host "       Serie:    $($d.serialNumber)"
    Write-Host "       Firmware: $($d.firmwareVersion) $($d.firmwareReleasedDate)"
    Write-Host ''
} catch {
    Write-Host '       No se pudo conectar.' -ForegroundColor Red
    Mostrar-Error $_
    exit 1
}

# ═══════════════════════════════════════════════════════════════════════════
# PASO 2 — Las personas inscritas (la lista para el mapeo)
# ═══════════════════════════════════════════════════════════════════════════
Write-Host ' [2/3] Leyendo las personas inscritas...' -ForegroundColor Cyan

$personas = @()
$posicion = 0

try {
    do {
        $cuerpo = @{
            UserInfoSearchCond = @{
                searchID             = 'lucebien-diag'
                searchResultPosition = $posicion
                maxResults           = 30
            }
        } | ConvertTo-Json -Depth 5

        $texto = Invoke-Isapi -Ruta '/ISAPI/AccessControl/UserInfo/Search?format=json' -Cuerpo $cuerpo
        $resultado = ($texto | ConvertFrom-Json).UserInfoSearch

        if ($resultado.UserInfo) {
            foreach ($u in $resultado.UserInfo) {
                $personas += [pscustomobject]@{
                    employee_no = $u.employeeNo
                    nombre      = $u.name
                    tipo        = $u.userType
                }
            }
        }

        $posicion += 30
        $hayMas = ($resultado.responseStatusStrg -eq 'MORE')
    } while ($hayMas -and $posicion -lt 500)

    Write-Host "       $($personas.Count) persona(s) inscritas en el equipo." -ForegroundColor Green

    if ($personas.Count -gt 0) {
        $rutaPersonas = Join-Path $PSScriptRoot 'huellero-personas.csv'
        $personas | Export-Csv -Path $rutaPersonas -NoTypeInformation -Encoding UTF8
        Write-Host "       Exportadas a: huellero-personas.csv" -ForegroundColor Green
        Write-Host ''
        Write-Host '       Primeras 10:' -ForegroundColor Gray
        $personas | Select-Object -First 10 | Format-Table -AutoSize | Out-String | Write-Host
    }
} catch {
    Write-Host '       No se pudieron leer las personas.' -ForegroundColor Yellow
    Write-Host '       No es bloqueante: la lista se puede sacar a mano de Person Management.' -ForegroundColor Yellow
    Mostrar-Error $_
    Write-Host ''
}

# ═══════════════════════════════════════════════════════════════════════════
# PASO 3 — Los eventos de marcación (lo que leerá el colector)
# ═══════════════════════════════════════════════════════════════════════════
Write-Host " [3/3] Leyendo marcaciones de los últimos $DiasAtras día(s)..." -ForegroundColor Cyan

$hasta = Get-Date
$desde = $hasta.AddDays(-$DiasAtras)
$fmt = 'yyyy-MM-ddTHH:mm:ss-05:00'   # hora Perú, offset explícito

$marcas = @()
$posicion = 0

try {
    do {
        $cuerpo = @{
            AcsEventCond = @{
                searchID             = 'lucebien-diag'
                searchResultPosition = $posicion
                maxResults           = 100
                major                = 5      # evento de control de acceso
                minor                = 38     # autenticado por huella
                startTime            = $desde.ToString($fmt)
                endTime              = $hasta.ToString($fmt)
            }
        } | ConvertTo-Json -Depth 5

        $texto = Invoke-Isapi -Ruta '/ISAPI/AccessControl/AcsEvent?format=json' -Cuerpo $cuerpo
        $resultado = ($texto | ConvertFrom-Json).AcsEvent

        if ($resultado.InfoList) {
            foreach ($e in $resultado.InfoList) {
                $marcas += [pscustomobject]@{
                    fecha_hora  = $e.time
                    employee_no = $e.employeeNoString
                    nombre      = $e.name
                    serial      = $e.serialNo
                }
            }
        }

        $posicion += 100
        $hayMas = ($resultado.responseStatusStrg -eq 'MORE')
    } while ($hayMas -and $posicion -lt 2000)

    Write-Host "       $($marcas.Count) marcación(es) leídas." -ForegroundColor Green

    if ($marcas.Count -gt 0) {
        $rutaMarcas = Join-Path $PSScriptRoot 'huellero-marcas.csv'
        $marcas | Export-Csv -Path $rutaMarcas -NoTypeInformation -Encoding UTF8
        Write-Host "       Exportadas a: huellero-marcas.csv" -ForegroundColor Green
        Write-Host ''
        Write-Host '       Últimas 10:' -ForegroundColor Gray
        $marcas | Select-Object -Last 10 | Format-Table -AutoSize | Out-String | Write-Host
    } else {
        Write-Host '       El rango no trajo marcaciones. Probar con más días:' -ForegroundColor Yellow
        Write-Host '         .\Probar-Huellero.ps1 -DiasAtras 30' -ForegroundColor Gray
    }
} catch {
    Write-Host '       No se pudieron leer las marcaciones.' -ForegroundColor Red
    Mostrar-Error $_
    exit 1
}

# ═══════════════════════════════════════════════════════════════════════════
# Cierre
# ═══════════════════════════════════════════════════════════════════════════
Write-Host ''
Write-Host '══════════════════════════════════════════════════════' -ForegroundColor DarkGray
Write-Host ' RESULTADO' -ForegroundColor White
Write-Host '══════════════════════════════════════════════════════' -ForegroundColor DarkGray
Write-Host ''
Write-Host ' El equipo responde por ISAPI y entrega las marcaciones.' -ForegroundColor Green
Write-Host ' La integración con el ERP es viable.' -ForegroundColor Green
Write-Host ''
Write-Host " Personas leídas:     $($personas.Count)"
Write-Host " Marcaciones leídas:  $($marcas.Count)"
Write-Host ''
Write-Host ' Llevar los dos CSV a Alexander para armar el mapeo inicial.' -ForegroundColor Cyan
Write-Host ''

$clave = $null
