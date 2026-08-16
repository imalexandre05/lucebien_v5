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
# CÓMO SE USA (en la PC que ve al huellero por la red):
#
#   1. Abrir PowerShell en la carpeta donde está este archivo.
#   2. Ejecutar:
#
#        powershell -ExecutionPolicy Bypass -File .\Probar-Huellero.ps1
#
#   3. Pide la contraseña de administrador del equipo — la MISMA con la que se
#      entra a https://192.168.1.220 desde el navegador.
#
# Deja los CSV al lado del script. Si algo falla, guarda la respuesta cruda del
# equipo en respuesta-cruda.txt para poder diagnosticarlo.
# ═══════════════════════════════════════════════════════════════════════════

[CmdletBinding()]
param(
    [string] $Ip = '192.168.1.220',
    [string] $Usuario = 'admin',
    [int]    $DiasAtras = 7,
    [switch] $UsarHttp
)

$ErrorActionPreference = 'Stop'
$OutputEncoding = [System.Text.Encoding]::UTF8

# ── Presentación ───────────────────────────────────────────────────────────
Write-Host ''
Write-Host '======================================================' -ForegroundColor DarkGray
Write-Host ' LUCEBIEN - Diagnostico del huellero' -ForegroundColor White
Write-Host '======================================================' -ForegroundColor DarkGray
Write-Host ''
Write-Host " Equipo:  $Ip"
Write-Host " Usuario: $Usuario"
Write-Host " Rango:   ultimos $DiasAtras dia(s)"
Write-Host ''

# ── Contraseña ─────────────────────────────────────────────────────────────
$segura = Read-Host -Prompt ' Clave de administrador del huellero' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
$clave = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($clave)) {
    Write-Host ' Sin clave no se puede continuar.' -ForegroundColor Red
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
    # Ya estaba definido en esta sesion de PowerShell. No es un problema.
}
try {
    [System.Net.ServicePointManager]::SecurityProtocol = `
        [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
} catch { }

$rutaCruda = Join-Path $PSScriptRoot 'respuesta-cruda.txt'
if (Test-Path $rutaCruda) { Remove-Item $rutaCruda -Force }

# ═══════════════════════════════════════════════════════════════════════════
# Llamada ISAPI con autenticacion digest.
# Devuelve SIEMPRE el texto crudo. Nunca interpreta: eso se hace despues, para
# poder distinguir "no llegue al equipo" de "llegue pero no entendi la
# respuesta". Confundir esas dos cosas fue el bug de la primera version.
# ═══════════════════════════════════════════════════════════════════════════
function Invoke-Isapi {
    param(
        [Parameter(Mandatory)] [string] $Ruta,
        [string] $Cuerpo,
        [string] $Metodo = 'GET'
    )

    $url = "$baseUrl$Ruta"
    $credencial = New-Object System.Net.NetworkCredential($Usuario, $clave)
    $cache = New-Object System.Net.CredentialCache
    $cache.Add((New-Object System.Uri($baseUrl)), 'Digest', $credencial)

    $peticion = [System.Net.HttpWebRequest]::Create($url)
    $peticion.Method = $Metodo
    $peticion.Credentials = $cache
    $peticion.Timeout = 30000
    $peticion.UserAgent = 'LuceBien-Diagnostico/1.0'

    if ($Cuerpo) {
        $peticion.ContentType = 'application/json'
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($Cuerpo)
        $peticion.ContentLength = $bytes.Length
        $flujo = $peticion.GetRequestStream()
        $flujo.Write($bytes, 0, $bytes.Length)
        $flujo.Close()
    }

    try {
        $respuesta = $peticion.GetResponse()
        $lector = New-Object System.IO.StreamReader($respuesta.GetResponseStream(), [System.Text.Encoding]::UTF8)
        $texto = $lector.ReadToEnd()
        $lector.Close()
        $respuesta.Close()
        return $texto
    } catch [System.Net.WebException] {
        $we = $_.Exception
        # El cuerpo del error trae el detalle real de Hikvision. Sin esto solo
        # se ve "error 500" y no se sabe por que.
        if ($we.Response) {
            $codigo = [int] $we.Response.StatusCode
            try {
                $lector = New-Object System.IO.StreamReader($we.Response.GetResponseStream())
                $cuerpoError = $lector.ReadToEnd()
                $lector.Close()
            } catch { $cuerpoError = '' }
            throw "HTTP $codigo`n$cuerpoError"
        }
        throw $we.Message
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# El equipo contesta en XML o en JSON segun el endpoint y el firmware. Esta
# funcion acepta las dos cosas en vez de asumir una.
# ═══════════════════════════════════════════════════════════════════════════
function ConvertFrom-Isapi {
    param(
        [Parameter(Mandatory)] [AllowEmptyString()] [string] $Texto,
        [string] $Etiqueta = 'respuesta'
    )

    $limpio = $Texto.Trim()
    if ([string]::IsNullOrWhiteSpace($limpio)) {
        throw "El equipo devolvio una $Etiqueta vacia."
    }

    if ($limpio.StartsWith('{') -or $limpio.StartsWith('[')) {
        return @{ Tipo = 'json'; Datos = ($limpio | ConvertFrom-Json) }
    }

    if ($limpio.StartsWith('<')) {
        return @{ Tipo = 'xml'; Datos = ([xml] $limpio) }
    }

    # No es ninguna de las dos: guardar para poder mirarlo.
    Add-Content -Path $rutaCruda -Value "--- $Etiqueta ---`n$limpio`n" -Encoding UTF8
    throw "El equipo devolvio algo que no es XML ni JSON. Se guardo en respuesta-cruda.txt"
}

function Mostrar-Error {
    param([string] $Mensaje)

    Write-Host ''
    foreach ($linea in ($Mensaje -split "`n" | Select-Object -First 6)) {
        Write-Host "   $linea" -ForegroundColor Red
    }

    if ($Mensaje -match '401|Unauthorized') {
        Write-Host ''
        Write-Host ' La clave no fue aceptada.' -ForegroundColor Yellow
        Write-Host ' Es la misma con la que se entra al equipo desde el navegador.' -ForegroundColor Yellow
        Write-Host ' OJO: tras varios intentos fallidos el equipo bloquea por unos minutos.' -ForegroundColor Yellow
    } elseif ($Mensaje -match 'tiempo|timeout|conectar|connect|remoto|remote') {
        Write-Host ''
        Write-Host " No se llego al equipo en $Ip." -ForegroundColor Yellow
        Write-Host "   ping $Ip" -ForegroundColor Gray
        Write-Host ' Si el ping responde pero esto no, repetir agregando  -UsarHttp' -ForegroundColor Yellow
    }
}

# ═══════════════════════════════════════════════════════════════════════════
# PASO 1 — Responde el equipo?
# ═══════════════════════════════════════════════════════════════════════════
Write-Host ' [1/3] Conectando con el equipo...' -ForegroundColor Cyan

$textoInfo = $null
try {
    $textoInfo = Invoke-Isapi -Ruta '/ISAPI/System/deviceInfo'
} catch {
    Write-Host '       No se llego al equipo.' -ForegroundColor Red
    Mostrar-Error $_.Exception.Message
    exit 1
}

# Llego respuesta: la conexion y la clave estan bien, pase lo que pase al leerla.
Write-Host '       Conectado. La clave es correcta.' -ForegroundColor Green

try {
    $info = ConvertFrom-Isapi -Texto $textoInfo -Etiqueta 'deviceInfo'
    if ($info.Tipo -eq 'xml') { $d = $info.Datos.DeviceInfo } else { $d = $info.Datos.DeviceInfo }

    Write-Host "       Modelo:   $($d.model)"
    Write-Host "       Serie:    $($d.serialNumber)"
    Write-Host "       Firmware: $($d.firmwareVersion) $($d.firmwareReleasedDate)"
    Write-Host "       Formato:  el equipo contesta en $($info.Tipo.ToUpper())"
} catch {
    Write-Host '       Respondio, pero no se pudo leer el detalle del equipo.' -ForegroundColor Yellow
    Write-Host '       No es bloqueante; se sigue.' -ForegroundColor Yellow
    Add-Content -Path $rutaCruda -Value "--- deviceInfo ---`n$textoInfo`n" -Encoding UTF8
}
Write-Host ''

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
        } | ConvertTo-Json -Depth 5 -Compress

        $texto = Invoke-Isapi -Ruta '/ISAPI/AccessControl/UserInfo/Search?format=json' -Cuerpo $cuerpo -Metodo 'POST'
        $r = ConvertFrom-Isapi -Texto $texto -Etiqueta 'UserInfoSearch'

        if ($r.Tipo -eq 'json') {
            $bloque = $r.Datos.UserInfoSearch
            $lista = $bloque.UserInfo
            $estado = $bloque.responseStatusStrg
        } else {
            $bloque = $r.Datos.UserInfoSearch
            $lista = $bloque.UserInfo
            $estado = $bloque.responseStatusStrg
        }

        foreach ($u in $lista) {
            if ($null -eq $u) { continue }
            $personas += [pscustomobject]@{
                employee_no = "$($u.employeeNo)"
                nombre      = "$($u.name)"
                tipo        = "$($u.userType)"
            }
        }

        $posicion += 30
        $hayMas = ($estado -eq 'MORE')
    } while ($hayMas -and $posicion -lt 600)

    Write-Host "       $($personas.Count) persona(s) inscritas." -ForegroundColor Green

    if ($personas.Count -gt 0) {
        $rutaPersonas = Join-Path $PSScriptRoot 'huellero-personas.csv'
        $personas | Export-Csv -Path $rutaPersonas -NoTypeInformation -Encoding UTF8
        Write-Host '       Exportadas a: huellero-personas.csv' -ForegroundColor Green
        Write-Host ''
        $personas | Select-Object -First 10 | Format-Table -AutoSize | Out-String | Write-Host
    }
} catch {
    Write-Host '       No se pudieron leer las personas.' -ForegroundColor Yellow
    Write-Host '       No bloquea: la lista se puede sacar a mano de Person Management.' -ForegroundColor Yellow
    Mostrar-Error $_.Exception.Message
    Write-Host ''
}

# ═══════════════════════════════════════════════════════════════════════════
# PASO 3 — Los eventos de marcacion (lo que leera el colector)
# ═══════════════════════════════════════════════════════════════════════════
Write-Host " [3/3] Leyendo marcaciones de los ultimos $DiasAtras dia(s)..." -ForegroundColor Cyan

$hasta = Get-Date
$desde = $hasta.AddDays(-$DiasAtras)
$fmt = 'yyyy-MM-ddTHH:mm:ss-05:00'   # hora Peru, offset explicito

$marcas = @()
$posicion = 0
$errorMarcas = $null

try {
    do {
        $cond = @{
            searchID             = 'lucebien-diag'
            searchResultPosition = $posicion
            maxResults           = 100
            major                = 5
            minor                = 38
            startTime            = $desde.ToString($fmt)
            endTime              = $hasta.ToString($fmt)
        }
        $cuerpo = @{ AcsEventCond = $cond } | ConvertTo-Json -Depth 5 -Compress

        $texto = Invoke-Isapi -Ruta '/ISAPI/AccessControl/AcsEvent?format=json' -Cuerpo $cuerpo -Metodo 'POST'
        $r = ConvertFrom-Isapi -Texto $texto -Etiqueta 'AcsEvent'

        $bloque = $r.Datos.AcsEvent
        $lista  = $bloque.InfoList
        $estado = $bloque.responseStatusStrg

        foreach ($e in $lista) {
            if ($null -eq $e) { continue }
            $marcas += [pscustomobject]@{
                fecha_hora  = "$($e.time)"
                employee_no = "$($e.employeeNoString)"
                nombre      = "$($e.name)"
                serial      = "$($e.serialNo)"
            }
        }

        $posicion += 100
        $hayMas = ($estado -eq 'MORE')
    } while ($hayMas -and $posicion -lt 3000)

    Write-Host "       $($marcas.Count) marcacion(es) leidas." -ForegroundColor Green
} catch {
    $errorMarcas = $_.Exception.Message
    Write-Host '       Fallo el filtro por tipo de evento.' -ForegroundColor Yellow
    Mostrar-Error $errorMarcas
}

# Si el filtro major/minor no gusto, reintentar sin filtro: algunos firmwares
# lo rechazan y devuelven todo, que igual sirve para confirmar viabilidad.
if ($marcas.Count -eq 0 -and $errorMarcas) {
    Write-Host ''
    Write-Host '       Reintentando sin filtro de tipo de evento...' -ForegroundColor Cyan
    try {
        $cond = @{
            searchID             = 'lucebien-diag2'
            searchResultPosition = 0
            maxResults           = 50
            startTime            = $desde.ToString($fmt)
            endTime              = $hasta.ToString($fmt)
        }
        $cuerpo = @{ AcsEventCond = $cond } | ConvertTo-Json -Depth 5 -Compress
        $texto = Invoke-Isapi -Ruta '/ISAPI/AccessControl/AcsEvent?format=json' -Cuerpo $cuerpo -Metodo 'POST'
        $r = ConvertFrom-Isapi -Texto $texto -Etiqueta 'AcsEvent-sin-filtro'

        foreach ($e in $r.Datos.AcsEvent.InfoList) {
            if ($null -eq $e) { continue }
            $marcas += [pscustomobject]@{
                fecha_hora  = "$($e.time)"
                employee_no = "$($e.employeeNoString)"
                nombre      = "$($e.name)"
                serial      = "$($e.serialNo)"
            }
        }
        Write-Host "       $($marcas.Count) evento(s) leidos sin filtro." -ForegroundColor Green
    } catch {
        Write-Host '       Tampoco funciono sin filtro.' -ForegroundColor Red
        Mostrar-Error $_.Exception.Message
    }
}

if ($marcas.Count -gt 0) {
    $rutaMarcas = Join-Path $PSScriptRoot 'huellero-marcas.csv'
    $marcas | Export-Csv -Path $rutaMarcas -NoTypeInformation -Encoding UTF8
    Write-Host '       Exportadas a: huellero-marcas.csv' -ForegroundColor Green
    Write-Host ''
    $marcas | Select-Object -Last 10 | Format-Table -AutoSize | Out-String | Write-Host
} else {
    Write-Host '       Sin marcaciones en el rango. Probar con mas dias:' -ForegroundColor Yellow
    Write-Host '         .\Probar-Huellero.ps1 -DiasAtras 30' -ForegroundColor Gray
}

# ═══════════════════════════════════════════════════════════════════════════
# Cierre
# ═══════════════════════════════════════════════════════════════════════════
Write-Host ''
Write-Host '======================================================' -ForegroundColor DarkGray
Write-Host ' RESULTADO' -ForegroundColor White
Write-Host '======================================================' -ForegroundColor DarkGray
Write-Host ''
Write-Host " Personas leidas:     $($personas.Count)"
Write-Host " Marcaciones leidas:  $($marcas.Count)"
Write-Host ''

if ($marcas.Count -gt 0) {
    Write-Host ' El equipo entrega las marcaciones por ISAPI.' -ForegroundColor Green
    Write-Host ' La integracion con el ERP es viable.' -ForegroundColor Green
} else {
    Write-Host ' El equipo respondio pero no se obtuvieron marcaciones.' -ForegroundColor Yellow
    if (Test-Path $rutaCruda) {
        Write-Host ' Mandar respuesta-cruda.txt a Alexander para revisarlo.' -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host ' Llevar los CSV generados a Alexander.' -ForegroundColor Cyan
Write-Host ''

$clave = $null
