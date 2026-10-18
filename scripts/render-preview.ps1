# ============================================================
# 用本机已装的 Chrome 把Preview渲染成图（零安装：不用 Playwright）
#
# 两个已经踩过的坑，别再踩：
#   1) Windows PowerShell 5.1 会把「没有 BOM 的 UTF-8 .ps1」当 ANSI 读，
#      脚本里写死的中文文件名会变成乱码。所以：本文件必须存成 UTF-8 with BOM，
#      并且页面路径用「找到那个 html」而不是写死中文名。
#   2) 渲染前必须先删旧图，否则 Test-Path 会把上一轮的旧图当成成功。
#
# 用法：
#   & .\scripts\render-preview.ps1
#   & .\scripts\render-preview.ps1 -Shots paper,'paper+dark','grid+panel'
#
# -Shots 的每一项是一个「镜头」：候选名 + 可选的 +dark / +panel，
# 原样拼到页面 hash 后由页面自己解析，文件名里的 + 会换成 -。
# ============================================================
param(
  [string]$Page,
  [string]$Out,
  [int]$Width = 1440,
  [int]$Height = 900,
  [string[]]$Shots = @('paper', 'grid')
)

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not $Page) {
  $html = Get-ChildItem $root -Filter *.html | Select-Object -First 1
  if (-not $html) { throw "在 $root 下没找到 .html 预览页" }
  $Page = $html.FullName
}
if (-not (Test-Path $Page)) { throw "预览页不存在：$Page" }
if (-not $Out) { $Out = Join-Path $root 'tmp' }

$chromeCandidates = @(
  'C:\Program Files\Google\Chrome\Application\chrome.exe',
  'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) { throw '没找到 Chrome，请把 chrome.exe 的路径加进 $chromeCandidates' }

$Out = (New-Item -ItemType Directory -Force -Path $Out).FullName
$uri = 'file:///' + ((Resolve-Path $Page).Path -replace '\\', '/')
"页面：$uri"
"输出：$Out"

$failed = $false
foreach ($shot in $Shots) {
  $png = Join-Path $Out (($shot -replace '\+', '-') + '.png')
  if (Test-Path $png) { Remove-Item $png -Force }   # 先删，杜绝旧图冒充新图

  & $chrome --headless=new --disable-gpu --hide-scrollbars `
            --force-device-scale-factor=1 --virtual-time-budget=2000 `
            "--window-size=$Width,$Height" "--screenshot=$png" "$uri#$shot" 2>$null | Out-Null

  if (Test-Path $png) {
    $item = Get-Item $png
    "OK    {0,-16} {1,8} bytes   {2:HH:mm:ss}" -f $item.Name, $item.Length, $item.LastWriteTime
  } else {
    "FAIL  $shot"
    $failed = $true
  }
}

if ($failed) { exit 1 }
