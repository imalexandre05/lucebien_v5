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
    [string] $Desde,              # fecha exacta 'AAAA-MM-DD'; tiene prioridad sobre -DiasAtras
    [int]    $TopeEventos = 60000,
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
$hasta = Get-Date
if ($Desde) {
    try { $fechaDesde = [datetime]::ParseExact($Desde, 'yyyy-MM-dd', $null) }
    catch { Write-Host " Fecha invalida: '$Desde'. Usar formato AAAA-MM-DD." -ForegroundColor Red; exit 1 }
} else {
    $fechaDesde = $hasta.AddDays(-$DiasAtras)
}

Write-Host " Equipo:  $Ip"
Write-Host " Usuario: $Usuario"
Write-Host (" Rango:   {0} a {1}" -f $fechaDesde.ToString('yyyy-MM-dd'), $hasta.ToString('yyyy-MM-dd'))
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
    $peticion.Timeout = 60000
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

        # El equipo no siempre declara UTF-8. Forzarlo convierte "CESAR" en
        # "CÃSAR" cuando en realidad mandó Latin-1. Se respeta lo que declare y
        # se cae a UTF-8 solo si no dice nada.
        $codificacion = [System.Text.Encoding]::UTF8
        if ($respuesta.CharacterSet) {
            try { $codificacion = [System.Text.Encoding]::GetEncoding($respuesta.CharacterSet) } catch { }
        }

        $lector = New-Object System.IO.StreamReader($respuesta.GetResponseStream(), $codificacion)
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
Write-Host ' [3/3] Leyendo marcaciones...' -ForegroundColor Cyan

# OJO: no reasignar a $desde. El parametro se llama [string] $Desde y PowerShell
# no distingue mayusculas en nombres de variable: asignarle un DateTime lo
# convierte de vuelta a texto, y despues .ToString($fmt) revienta.
$fmt = 'yyyy-MM-ddTHH:mm:ss-05:00'   # hora Peru, offset explicito

$marcas = @()
$errorMarcas = $null

# ── Paginacion ────────────────────────────────────────────────────────────
# El equipo devuelve como maximo ~30 registros por pagina aunque se le pidan
# 100. Hay que avanzar por la cantidad REALMENTE devuelta, no por la pedida:
# avanzar de 100 en 100 cuando devuelve 30 saltea 70 registros por pagina.
# Ese fue el bug que hizo leer 30 marcas cuando habia muchas mas.
function Read-Tramo {
    param(
        [datetime] $Inicio,
        [datetime] $Fin,
        [bool] $ConFiltro = $true,
        [string] $Etiqueta = 'tramo'
    )

    $acumulado = @()
    $posicion = 0
    $total = $null

    do {
        $cond = @{
            searchID             = "lb-$Etiqueta"
            searchResultPosition = $posicion
            maxResults           = 30
            startTime            = $Inicio.ToString($fmt)
            endTime              = $Fin.ToString($fmt)
        }
        if ($ConFiltro) { $cond.major = 5; $cond.minor = 38 }

        $cuerpo = @{ AcsEventCond = $cond } | ConvertTo-Json -Depth 5 -Compress
        $texto = Invoke-Isapi -Ruta '/ISAPI/AccessControl/AcsEvent?format=json' -Cuerpo $cuerpo -Metodo 'POST'
        $r = ConvertFrom-Isapi -Texto $texto -Etiqueta 'AcsEvent'

        $bloque = $r.Datos.AcsEvent
        $lista  = @($bloque.InfoList | Where-Object { $null -ne $_ })
        $estado = "$($bloque.responseStatusStrg)"

        if ($null -eq $total -and $bloque.totalMatches) { $total = [int] $bloque.totalMatches }

        foreach ($e in $lista) {
            $acumulado += [pscustomobject]@{
                fecha_hora  = "$($e.time)"
                employee_no = "$($e.employeeNoString)"
                nombre      = "$($e.name)"
                serial      = "$($e.serialNo)"
            }
        }

        $devueltos = $lista.Count
        if ($devueltos -eq 0) { break }

        $posicion += $devueltos            # avanzar por lo devuelto, no por lo pedido

        $hayMas = ($estado -eq 'MORE')
        if (-not $hayMas -and $total -and $posicion -lt $total) { $hayMas = $true }
    } while ($hayMas -and $posicion -lt $TopeEventos)

    return ,$acumulado
}

# Se trocea por mes: un rango de varios meses en una sola consulta puede pasarse
# del tiempo de espera o del limite de busqueda del equipo. Ademas asi se ve el
# avance y, si un mes falla, no se pierden los demas.
function Read-Marcas {
    param([bool] $ConFiltro = $true)

    $todo = @()
    $cursor = $fechaDesde
    $i = 0

    while ($cursor -lt $hasta) {
        $finTramo = $cursor.AddMonths(1)
        if ($finTramo -gt $hasta) { $finTramo = $hasta }
        $i++

        $tramo = Read-Tramo -Inicio $cursor -Fin $finTramo -ConFiltro $ConFiltro -Etiqueta "t$i"
        $todo += $tramo

        Write-Host ("       {0}  ->  {1,5} marcas   (acumulado {2})" -f `
            $cursor.ToString('yyyy-MM'), @($tramo).Count, $todo.Count) -ForegroundColor DarkGray

        $cursor = $finTramo
    }

    # Los extremos de cada tramo pueden repetir el evento que cae justo en el
    # limite. El serial identifica al evento, asi que se deduplica por ahi
    # (es el mismo criterio que usara el colector con su indice unico).
    $vistos = @{}
    $unicos = @()
    foreach ($m in $todo) {
        $k = "$($m.serial)"
        if ($k -and $vistos.ContainsKey($k)) { continue }
        if ($k) { $vistos[$k] = $true }
        $unicos += $m
    }

    $repes = $todo.Count - $unicos.Count
    if ($repes -gt 0) {
        Write-Host "       $repes evento(s) repetido(s) en los limites de tramo, descartados." -ForegroundColor DarkGray
    }

    return ,$unicos
}

try {
    $marcas = Read-Marcas -ConFiltro $true
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
        $marcas = Read-Marcas -ConFiltro $false
        Write-Host "       $($marcas.Count) evento(s) leidos sin filtro." -ForegroundColor Green
    } catch {
        Write-Host '       Tampoco funciono sin filtro.' -ForegroundColor Red
        Mostrar-Error $_.Exception.Message
    }
}

# ── Resumen por persona y por dia ─────────────────────────────────────────
# Lo que de verdad hace falta saber: quien marca, y si marca la salida.
if ($marcas.Count -gt 0) {
    $conFecha = foreach ($x in $marcas) {
        $d = $null
        if ([datetime]::TryParse($x.fecha_hora, [ref] $d)) {
            [pscustomobject]@{ nombre = $x.nombre; cod = $x.employee_no; dia = $d.ToString('yyyy-MM-dd'); dt = $d }
        }
    }

    $porPersona = $conFecha | Group-Object cod | ForEach-Object {
        $dias = @($_.Group | Group-Object dia)
        $sinSalida = @($dias | Where-Object { $_.Count -eq 1 }).Count
        [pscustomobject]@{
            cod          = $_.Name
            nombre       = $_.Group[0].nombre
            marcas       = $_.Count
            dias         = $dias.Count
            dias_1_marca = $sinSalida
        }
    } | Sort-Object nombre

    Write-Host ''
    Write-Host '       Resumen por persona:' -ForegroundColor Cyan
    $porPersona | Format-Table -AutoSize | Out-String | Write-Host

    $rutaResumen = Join-Path $PSScriptRoot 'huellero-resumen.csv'
    $porPersona | Export-Csv -Path $rutaResumen -NoTypeInformation -Encoding UTF8
    Write-Host '       Resumen exportado a: huellero-resumen.csv' -ForegroundColor Green

    $totalDias = @($conFecha | Group-Object cod, dia).Count
    $totalUna  = @($conFecha | Group-Object cod, dia | Where-Object { $_.Count -eq 1 }).Count
    Write-Host ''
    Write-Host ("       Jornadas (persona-dia): {0}" -f $totalDias)
    Write-Host ("       Con una sola marca:     {0}" -f $totalUna)
    Write-Host '       (el primer y ultimo dia del rango salen incompletos por el corte de hora)' -ForegroundColor DarkGray
}

if ($marcas.Count -gt 0) {
    $rutaMarcas = Join-Path $PSScriptRoot 'huellero-marcas.csv'
    $marcas | Export-Csv -Path $rutaMarcas -NoTypeInformation -Encoding UTF8
    Write-Host '       Exportadas a: huellero-marcas.csv' -ForegroundColor Green
    Write-Host ''
    $marcas | Select-Object -Last 10 | Format-Table -AutoSize | Out-String | Write-Host
} else {
    Write-Host '       Sin marcaciones en el rango consultado.' -ForegroundColor Yellow
    if (-not $Desde) {
        Write-Host '       Probar con un rango mayor:' -ForegroundColor Yellow
        Write-Host '         .\Probar-Huellero.ps1 -Desde 2026-01-01' -ForegroundColor Gray
    }
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
