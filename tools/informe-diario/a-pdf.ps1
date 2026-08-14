# Convierte un .docx a .pdf usando Microsoft Word.
# Uso: powershell -ExecutionPolicy Bypass -File a-pdf.ps1 -Entrada "...docx" -Salida "...pdf"

param(
  [Parameter(Mandatory = $true)][string]$Entrada,
  [Parameter(Mandatory = $true)][string]$Salida
)

$ErrorActionPreference = 'Stop'
$Entrada = (Resolve-Path $Entrada).Path

$word = $null
$doc = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  # ReadOnly y sin confirmar conversiones, para que nunca abra un cuadro de diálogo.
  $doc = $word.Documents.Open($Entrada, $false, $true)
  $wdFormatPDF = 17
  $doc.SaveAs([ref]$Salida, [ref]$wdFormatPDF)
  Write-Output $Salida
}
finally {
  if ($doc) { $doc.Close($false) | Out-Null }
  if ($word) { $word.Quit() | Out-Null }
  if ($doc) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($doc) | Out-Null }
  if ($word) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null }
}
