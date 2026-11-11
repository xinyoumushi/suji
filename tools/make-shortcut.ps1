# 在桌面创建「速记」快捷方式（可重复执行，会覆盖旧的）
# 注意：快捷方式的图标路径必须全是 ASCII 字符，含中文的路径 Windows 会解析失败，
# 所以这里把图标复制到 C:\Users\...\AppData\Local\Suji\ 这类纯英文目录再引用。
$ErrorActionPreference = 'SilentlyContinue'

$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root '启动速记.bat'
if (-not (Test-Path $target)) {
  Write-Host "找不到启动器：$target"
  exit 1
}

function Test-Ascii([string]$path) {
  return $path -match '^[\x20-\x7E]+$'
}

$sourceIcon = Join-Path $root 'resources\icon.ico'
$iconPath = ''

if (Test-Path $sourceIcon) {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Suji\icon.ico'),
    (Join-Path $env:PUBLIC 'Suji\icon.ico')
  )
  foreach ($candidate in $candidates) {
    if (-not (Test-Ascii $candidate)) { continue }
    $dir = Split-Path -Parent $candidate
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item $sourceIcon $candidate -Force
    if (Test-Path $candidate) { $iconPath = $candidate; break }
  }
}

$desktop = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktop '速记.lnk'

$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut($linkPath)
$link.TargetPath = $target
$link.WorkingDirectory = $root
$link.WindowStyle = 7
$link.Description = '速记 · 个人备考记忆知识库'
if ($iconPath) { $link.IconLocation = "$iconPath,0" }
$link.Save()

# 让资源管理器尽快刷新图标缓存
& ie4uinit.exe -show 2>$null | Out-Null

Write-Host "已创建桌面快捷方式：$linkPath"
if ($iconPath) { Write-Host "图标已缓存到：$iconPath" }
