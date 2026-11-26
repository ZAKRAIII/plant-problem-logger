param(
    [int]$Port = 8080,
    [switch]$OpenBrowser
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = Join-Path $RootDir "data"
$UploadsDir = Join-Path $DataDir "uploads"
$PublicDir = Join-Path $RootDir "public"
$EquipmentsFile = Join-Path $DataDir "equipments.json"
$LogsFile = Join-Path $DataDir "logs.json"

if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir | Out-Null }
if (-not (Test-Path $UploadsDir)) { New-Item -ItemType Directory -Path $UploadsDir | Out-Null }
if (-not (Test-Path $EquipmentsFile)) { Set-Content -Path $EquipmentsFile -Value "[]" -Encoding UTF8 }
if (-not (Test-Path $LogsFile)) { Set-Content -Path $LogsFile -Value "[]" -Encoding UTF8 }

function Read-JsonArray {
    param([string]$Path)
    $raw = Get-Content -Path $Path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) { return @() }
    $parsed = $raw | ConvertFrom-Json
    if ($null -eq $parsed) { return @() }
    return @($parsed)
}

function Get-NextId {
    param($Items)
    $max = 0
    foreach ($item in $Items) {
        if ($null -ne $item.id -and [int]$item.id -gt $max) {
            $max = [int]$item.id
        }
    }
    return ($max + 1)
}

function Write-JsonArray {
    param([string]$Path, $Items)
    $arr = @($Items)
    if ($arr.Count -eq 0) {
        Set-Content -Path $Path -Value "[]" -Encoding UTF8
    } else {
        $json = ConvertTo-Json -InputObject $arr -Depth 6
        Set-Content -Path $Path -Value $json -Encoding UTF8
    }
}

function Compute-DurationMinutes {
    param(
        [string]$StartDate,
        [string]$StartTime,
        [string]$EndDate,
        [string]$EndTime
    )
    if ([string]::IsNullOrWhiteSpace($EndDate) -or [string]::IsNullOrWhiteSpace($EndTime)) {
        return $null
    }
    if ([string]::IsNullOrWhiteSpace($StartDate) -or [string]::IsNullOrWhiteSpace($StartTime)) {
        return $null
    }
    try {
        $startStr = "$StartDate $StartTime"
        $endStr = "$EndDate $EndTime"
        $startDt = [datetime]::Parse($startStr)
        $endDt = [datetime]::Parse($endStr)
        $diff = ($endDt - $startDt).TotalMinutes
        if ($diff -lt 0) { return 0 }
        return [int][math]::Round($diff)
    } catch {
        return $null
    }
}

function Send-JsonResponse {
    param($Response, [int]$StatusCode, $Payload)
    $Response.StatusCode = $StatusCode
    $Response.ContentType = "application/json; charset=utf-8"
    $json = if ($Payload -is [string]) { $Payload } else { ConvertTo-Json -InputObject $Payload -Depth 6 }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Send-TextResponse {
    param($Response, [int]$StatusCode, [string]$ContentType, [string]$Text, [string]$DownloadName = "")
    $Response.StatusCode = $StatusCode
    $Response.ContentType = $ContentType
    if (-not [string]::IsNullOrWhiteSpace($DownloadName)) {
        $Response.AddHeader("Content-Disposition", "attachment; filename=`"$DownloadName`"")
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $Response.ContentLength64 = $bytes.Length
    $Response.OutputStream.Write($bytes, 0, $bytes.Length)
    $Response.OutputStream.Close()
}

function Read-RequestBodyJson {
    param($Request)
    $reader = New-Object System.IO.StreamReader($Request.InputStream, [System.Text.Encoding]::UTF8)
    $body = $reader.ReadToEnd()
    $reader.Close()
    if ([string]::IsNullOrWhiteSpace($body)) { return $null }
    return ($body | ConvertFrom-Json)
}

function Get-MimeType {
    param([string]$FilePath)
    switch ([System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()) {
        ".html" { return "text/html; charset=utf-8" }
        ".css"  { return "text/css; charset=utf-8" }
        ".js"   { return "application/javascript; charset=utf-8" }
        ".json" { return "application/json; charset=utf-8" }
        ".svg"  { return "image/svg+xml" }
        ".png"  { return "image/png" }
        ".jpg"  { return "image/jpeg" }
        ".jpeg" { return "image/jpeg" }
        ".webp" { return "image/webp" }
        ".gif"  { return "image/gif" }
        ".mp4"  { return "video/mp4" }
        ".mov"  { return "video/quicktime" }
        ".webm" { return "video/webm" }
        ".mkv"  { return "video/x-matroska" }
        default { return "application/octet-stream" }
    }
}

function Normalize-Attachments {
    param($InputVal)
    $list = [System.Collections.ArrayList]::new()
    if ($null -eq $InputVal) { return ,[object[]]@() }
    foreach ($item in @($InputVal)) {
        if ($null -ne $item -and $item.url) {
            [void]$list.Add([pscustomobject][ordered]@{
                name     = "$($item.name)"
                url      = "$($item.url)"
                mimeType = "$($item.mimeType)"
                size     = [long]($item.size)
            })
        }
    }
    return ,[object[]]$list.ToArray()
}

function Escape-Csv {
    param([string]$Val)
    if ($null -eq $Val) { return "" }
    if ($Val -match '[,"\r\n]') {
        return '"' + ($Val -replace '"', '""') + '"'
    }
    return $Val
}

$candidatePorts = @($Port) + (8081..8099) + @(8585, 8888, 9000, 3000, 5000) | Select-Object -Unique
$listener = $null
$activePort = $null

foreach ($p in $candidatePorts) {
    $tryListener = New-Object System.Net.HttpListener
    $tryListener.Prefixes.Add("http://localhost:$p/")
    try {
        $tryListener.Start()
        $listener = $tryListener
        $activePort = $p
        break
    } catch {
        try { $tryListener.Close() } catch {}
    }
}

if ($null -eq $listener) {
    throw "Tidak dapat menemukan port kosong untuk menjalankan server."
}

$url = "http://localhost:$activePort/"
Write-Host "Plant Problem Logger running at $url (Press Ctrl+C to stop)"
if ($OpenBrowser) {
    Start-Process $url
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $req = $context.Request
        $res = $context.Response
        $path = $req.Url.AbsolutePath
        $method = $req.HttpMethod

        try {
            if ($path -eq "/api/bootstrap" -and $method -eq "GET") {
                $equipments = Read-JsonArray -Path $EquipmentsFile
                $logs = Read-JsonArray -Path $LogsFile
                $payload = [ordered]@{
                    equipments = @($equipments)
                    logs       = @($logs)
                    categories = @("elektrikal", "mekanikal", "material", "preparation", "Maint. Day", "Start Feeding")
                    statuses   = @("critical", "moderate")
                    shifts     = @("Shift 1", "Shift 2", "Shift 3")
                }
                Send-JsonResponse -Response $res -StatusCode 200 -Payload $payload
            }
            elseif ($path -eq "/api/upload" -and $method -eq "POST") {
                $rawName = $req.QueryString["filename"]
                if ([string]::IsNullOrWhiteSpace($rawName)) { $rawName = "file.bin" }
                $decodedName = [System.Uri]::UnescapeDataString($rawName)
                $ext = [System.IO.Path]::GetExtension($decodedName).ToLowerInvariant()
                $allowedExts = @(".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".mov", ".webm", ".mkv")
                if ($allowedExts -notcontains $ext) {
                    Send-JsonResponse -Response $res -StatusCode 400 -Payload @{ error = "Format file tidak didukung. Gunakan foto (JPG/PNG/WEBP/GIF) atau video (MP4/MOV/WEBM/MKV)." }
                    continue
                }

                $maxBytes = 25 * 1024 * 1024
                $ms = New-Object System.IO.MemoryStream
                $buffer = New-Object byte[] 65536
                $totalRead = 0
                $tooLarge = $false
                while (($read = $req.InputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $totalRead += $read
                    if ($totalRead -gt $maxBytes) {
                        $tooLarge = $true
                        break
                    }
                    $ms.Write($buffer, 0, $read)
                }
                if ($tooLarge) {
                    $ms.Dispose()
                    Send-JsonResponse -Response $res -StatusCode 413 -Payload @{ error = "Ukuran file melebihi batas maksimal 25 MB." }
                    continue
                }

                $baseName = [System.IO.Path]::GetFileNameWithoutExtension($decodedName) -replace '[^a-zA-Z0-9_-]', '_'
                if ([string]::IsNullOrWhiteSpace($baseName)) { $baseName = "media" }
                if ($baseName.Length -gt 40) { $baseName = $baseName.Substring(0, 40) }
                $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
                $rand = ([guid]::NewGuid().ToString("N")).Substring(0, 6)
                $savedName = "${stamp}_${rand}_${baseName}${ext}"
                $destPath = Join-Path $UploadsDir $savedName
                [System.IO.File]::WriteAllBytes($destPath, $ms.ToArray())
                $ms.Dispose()

                $mime = if ($req.ContentType) { $req.ContentType } else { Get-MimeType -FilePath $destPath }
                $uploaded = [ordered]@{
                    name     = $decodedName
                    url      = "/uploads/$savedName"
                    mimeType = $mime
                    size     = $totalRead
                }
                Send-JsonResponse -Response $res -StatusCode 201 -Payload $uploaded
            }
            elseif ($path -eq "/api/logs" -and $method -eq "POST") {
                $body = Read-RequestBodyJson -Request $req
                $logs = [System.Collections.ArrayList]::new()
                foreach ($x in (Read-JsonArray -Path $LogsFile)) { [void]$logs.Add($x) }
                $nextId = Get-NextId -Items $logs
                $durasi = Compute-DurationMinutes -StartDate $body.tanggal_problem_masuk -StartTime $body.jam_problem_masuk -EndDate $body.tanggal_problem_selesai -EndTime $body.jam_problem_selesai
                $kegiatan = if ($body.deskripsi_kegiatan_perbaikan) { "$($body.deskripsi_kegiatan_perbaikan)" } elseif ($body.tindakan) { "$($body.tindakan)" } else { "" }
                $newLog = [ordered]@{
                    id                           = $nextId
                    tanggal_problem_masuk        = "$($body.tanggal_problem_masuk)"
                    jam_problem_masuk            = "$($body.jam_problem_masuk)"
                    line                         = "$($body.line)"
                    kode                         = "$($body.kode)"
                    nama_equipment               = "$($body.nama_equipment)"
                    kategori                     = "$($body.kategori)"
                    deskripsi_kendala            = "$($body.deskripsi_kendala)"
                    status                       = "$($body.status)"
                    tanggal_problem_selesai      = if ($body.tanggal_problem_selesai) { "$($body.tanggal_problem_selesai)" } else { "" }
                    jam_problem_selesai          = if ($body.jam_problem_selesai) { "$($body.jam_problem_selesai)" } else { "" }
                    durasi_menit                 = $durasi
                    shift                        = if ($body.shift) { "$($body.shift)" } else { "" }
                    pelapor                      = if ($body.pelapor) { "$($body.pelapor)" } else { "" }
                    pic_teknisi                  = if ($body.pic_teknisi) { "$($body.pic_teknisi)" } else { "" }
                    deskripsi_kegiatan_perbaikan = $kegiatan
                    lampiran_report              = (Normalize-Attachments $body.lampiran_report)
                    lampiran_resolve             = (Normalize-Attachments $body.lampiran_resolve)
                }
                [void]$logs.Add([pscustomobject]$newLog)
                Write-JsonArray -Path $LogsFile -Items $logs
                Send-JsonResponse -Response $res -StatusCode 201 -Payload $newLog
            }
            elseif ($path -match '^/api/logs/(\d+)$' -and $method -eq "PUT") {
                $targetId = [int]$Matches[1]
                $body = Read-RequestBodyJson -Request $req
                $logs = @(Read-JsonArray -Path $LogsFile)
                $updated = $null
                $newList = @()
                foreach ($item in $logs) {
                    if ([int]$item.id -eq $targetId) {
                        $tMasuk = if ($null -ne $body.tanggal_problem_masuk) { "$($body.tanggal_problem_masuk)" } else { "$($item.tanggal_problem_masuk)" }
                        $jMasuk = if ($null -ne $body.jam_problem_masuk) { "$($body.jam_problem_masuk)" } else { "$($item.jam_problem_masuk)" }
                        $tSelesai = if ($null -ne $body.tanggal_problem_selesai) { "$($body.tanggal_problem_selesai)" } else { "$($item.tanggal_problem_selesai)" }
                        $jSelesai = if ($null -ne $body.jam_problem_selesai) { "$($body.jam_problem_selesai)" } else { "$($item.jam_problem_selesai)" }
                        $durasi = Compute-DurationMinutes -StartDate $tMasuk -StartTime $jMasuk -EndDate $tSelesai -EndTime $jSelesai
                        $existingKegiatan = if ($null -ne $item.deskripsi_kegiatan_perbaikan) { "$($item.deskripsi_kegiatan_perbaikan)" } elseif ($null -ne $item.tindakan) { "$($item.tindakan)" } else { "" }
                        $kegiatan = if ($null -ne $body.deskripsi_kegiatan_perbaikan) { "$($body.deskripsi_kegiatan_perbaikan)" } elseif ($null -ne $body.tindakan) { "$($body.tindakan)" } else { $existingKegiatan }
                        $repFiles = if ($null -ne $body.lampiran_report) { (Normalize-Attachments $body.lampiran_report) } else { (Normalize-Attachments $item.lampiran_report) }
                        $resFiles = if ($null -ne $body.lampiran_resolve) { (Normalize-Attachments $body.lampiran_resolve) } else { (Normalize-Attachments $item.lampiran_resolve) }

                        $updated = [pscustomobject][ordered]@{
                            id                           = $targetId
                            tanggal_problem_masuk        = $tMasuk
                            jam_problem_masuk            = $jMasuk
                            line                         = if ($null -ne $body.line) { "$($body.line)" } else { "$($item.line)" }
                            kode                         = if ($null -ne $body.kode) { "$($body.kode)" } else { "$($item.kode)" }
                            nama_equipment               = if ($null -ne $body.nama_equipment) { "$($body.nama_equipment)" } else { "$($item.nama_equipment)" }
                            kategori                     = if ($null -ne $body.kategori) { "$($body.kategori)" } else { "$($item.kategori)" }
                            deskripsi_kendala            = if ($null -ne $body.deskripsi_kendala) { "$($body.deskripsi_kendala)" } else { "$($item.deskripsi_kendala)" }
                            status                       = if ($null -ne $body.status) { "$($body.status)" } else { "$($item.status)" }
                            tanggal_problem_selesai      = $tSelesai
                            jam_problem_selesai          = $jSelesai
                            durasi_menit                 = $durasi
                            shift                        = if ($null -ne $body.shift) { "$($body.shift)" } else { "$($item.shift)" }
                            pelapor                      = if ($null -ne $body.pelapor) { "$($body.pelapor)" } else { "$($item.pelapor)" }
                            pic_teknisi                  = if ($null -ne $body.pic_teknisi) { "$($body.pic_teknisi)" } else { "$($item.pic_teknisi)" }
                            deskripsi_kegiatan_perbaikan = $kegiatan
                            lampiran_report              = $repFiles
                            lampiran_resolve             = $resFiles
                        }
                        $newList += $updated
                    } else {
                        $newList += $item
                    }
                }
                if ($null -eq $updated) {
                    Send-JsonResponse -Response $res -StatusCode 404 -Payload @{ error = "Log not found" }
                } else {
                    Write-JsonArray -Path $LogsFile -Items $newList
                    Send-JsonResponse -Response $res -StatusCode 200 -Payload $updated
                }
            }
            elseif ($path -match '^/api/logs/(\d+)$' -and $method -eq "DELETE") {
                $targetId = [int]$Matches[1]
                $logs = @(Read-JsonArray -Path $LogsFile)
                $newList = @($logs | Where-Object { [int]$_.id -ne $targetId })
                Write-JsonArray -Path $LogsFile -Items $newList
                Send-JsonResponse -Response $res -StatusCode 200 -Payload @{ deleted = $targetId }
            }
            elseif ($path -eq "/api/equipments" -and $method -eq "POST") {
                $body = Read-RequestBodyJson -Request $req
                $equips = [System.Collections.ArrayList]::new()
                foreach ($x in (Read-JsonArray -Path $EquipmentsFile)) { [void]$equips.Add($x) }
                $nextId = Get-NextId -Items $equips
                $newEq = [ordered]@{
                    id              = $nextId
                    kode_mesin      = "$($body.kode_mesin)"
                    jenis_equipment = "$($body.jenis_equipment)"
                    line            = "$($body.line)"
                    is_active       = if ($null -ne $body.is_active) { [bool]$body.is_active } else { $true }
                }
                [void]$equips.Add([pscustomobject]$newEq)
                Write-JsonArray -Path $EquipmentsFile -Items $equips
                Send-JsonResponse -Response $res -StatusCode 201 -Payload $newEq
            }
            elseif ($path -match '^/api/equipments/(\d+)$' -and $method -eq "PUT") {
                $targetId = [int]$Matches[1]
                $body = Read-RequestBodyJson -Request $req
                $equips = @(Read-JsonArray -Path $EquipmentsFile)
                $updated = $null
                $newList = @()
                foreach ($item in $equips) {
                    if ([int]$item.id -eq $targetId) {
                        $updated = [pscustomobject][ordered]@{
                            id              = $targetId
                            kode_mesin      = if ($null -ne $body.kode_mesin) { "$($body.kode_mesin)" } else { "$($item.kode_mesin)" }
                            jenis_equipment = if ($null -ne $body.jenis_equipment) { "$($body.jenis_equipment)" } else { "$($item.jenis_equipment)" }
                            line            = if ($null -ne $body.line) { "$($body.line)" } else { "$($item.line)" }
                            is_active       = if ($null -ne $body.is_active) { [bool]$body.is_active } else { [bool]$item.is_active }
                        }
                        $newList += $updated
                    } else {
                        $newList += $item
                    }
                }
                if ($null -eq $updated) {
                    Send-JsonResponse -Response $res -StatusCode 404 -Payload @{ error = "Equipment not found" }
                } else {
                    Write-JsonArray -Path $EquipmentsFile -Items $newList
                    Send-JsonResponse -Response $res -StatusCode 200 -Payload $updated
                }
            }
            elseif ($path -eq "/api/export/csv" -and $method -eq "GET") {
                $logs = @(Read-JsonArray -Path $LogsFile)
                $lines = [System.Collections.Generic.List[string]]::new()
                $lines.Add("id,tanggal_problem_masuk,jam_problem_masuk,line,kode,nama equipment,kategori,deskripsi kendala,status,tanggal_problem_selesai,jam_problem_selesai,durasi_menit,shift,pelapor,pic_teknisi,deskripsi_kegiatan_perbaikan,lampiran_report,lampiran_resolve")
                foreach ($l in $logs) {
                    $keg = if ($l.deskripsi_kegiatan_perbaikan) { "$($l.deskripsi_kegiatan_perbaikan)" } elseif ($l.tindakan) { "$($l.tindakan)" } else { "" }
                    $repStr = (@($l.lampiran_report) | Where-Object { $_ -and $_.name } | ForEach-Object { $_.name }) -join "; "
                    $resStr = (@($l.lampiran_resolve) | Where-Object { $_ -and $_.name } | ForEach-Object { $_.name }) -join "; "
                    $row = @(
                        $l.id,
                        (Escape-Csv $l.tanggal_problem_masuk),
                        (Escape-Csv $l.jam_problem_masuk),
                        (Escape-Csv $l.line),
                        (Escape-Csv $l.kode),
                        (Escape-Csv $l.nama_equipment),
                        (Escape-Csv $l.kategori),
                        (Escape-Csv $l.deskripsi_kendala),
                        (Escape-Csv $l.status),
                        (Escape-Csv $l.tanggal_problem_selesai),
                        (Escape-Csv $l.jam_problem_selesai),
                        $l.durasi_menit,
                        (Escape-Csv $l.shift),
                        (Escape-Csv $l.pelapor),
                        (Escape-Csv $l.pic_teknisi),
                        (Escape-Csv $keg),
                        (Escape-Csv $repStr),
                        (Escape-Csv $resStr)
                    ) -join ","
                    $lines.Add($row)
                }
                $csvContent = $lines -join "`r`n"
                Send-TextResponse -Response $res -StatusCode 200 -ContentType "text/csv; charset=utf-8" -Text $csvContent -DownloadName "plant_problem_logs.csv"
            }
            elseif ($path.StartsWith("/uploads/") -and $method -eq "GET") {
                $relUpload = $path.Substring("/uploads/".Length).TrimStart("/")
                $fullUploadPath = [System.IO.Path]::GetFullPath((Join-Path $UploadsDir $relUpload))
                if ($fullUploadPath.StartsWith($UploadsDir) -and (Test-Path $fullUploadPath -PathType Leaf)) {
                    $res.StatusCode = 200
                    $res.ContentType = Get-MimeType -FilePath $fullUploadPath
                    $bytes = [System.IO.File]::ReadAllBytes($fullUploadPath)
                    $res.ContentLength64 = $bytes.Length
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                    $res.OutputStream.Close()
                } else {
                    Send-JsonResponse -Response $res -StatusCode 404 -Payload @{ error = "File not found" }
                }
            }
            else {
                $relPath = if ($path -eq "/") { "index.html" } else { $path.TrimStart("/") }
                $fullPath = [System.IO.Path]::GetFullPath((Join-Path $PublicDir $relPath))
                if ($fullPath.StartsWith($PublicDir) -and (Test-Path $fullPath -PathType Leaf)) {
                    $res.StatusCode = 200
                    $res.ContentType = Get-MimeType -FilePath $fullPath
                    $bytes = [System.IO.File]::ReadAllBytes($fullPath)
                    $res.ContentLength64 = $bytes.Length
                    $res.OutputStream.Write($bytes, 0, $bytes.Length)
                    $res.OutputStream.Close()
                } else {
                    Send-JsonResponse -Response $res -StatusCode 404 -Payload @{ error = "Not found" }
                }
            }
        } catch {
            Send-JsonResponse -Response $res -StatusCode 500 -Payload @{ error = $_.Exception.Message }
        }
    }
} finally {
    $listener.Stop()
    $listener.Close()
}
