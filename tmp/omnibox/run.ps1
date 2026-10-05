# 真窗口实验：新建标签页（Ctrl+T）之后，键盘输入到底进了地址栏还是页面的搜索框。
# 过程：启动带扩展的 Chromium → Ctrl+T → （如出现"改回 Google？"气泡就按一次回车消掉）→
#       读焦点实况 → 发一个探针字符 z → 再读一次 → 截两张整窗图（含地址栏）→ 优雅关闭。
# 用法：pwsh -File tmp/omnibox/run.ps1 [-Round baseline] [-Reuse]
param(
  [int]$Port = 9333,
  [string]$Round = 'baseline',
  [switch]$Reuse,
  [switch]$SkipDismiss,
  [string]$Profile = "$PSScriptRoot\profile",
  [string]$Ext = (Resolve-Path "$PSScriptRoot\..\..\LineTab").Path
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class Win {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  public static string Title(IntPtr h) { var sb = new StringBuilder(512); GetWindowText(h, sb, 512); return sb.ToString(); }
  public static string FgTitle() { return Title(GetForegroundWindow()); }
  public static uint FgPid() { uint p; GetWindowThreadProcessId(GetForegroundWindow(), out p); return p; }
  public static int[] FgRect() { RECT r; GetWindowRect(GetForegroundWindow(), out r); return new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top }; }
  // 进程里面积最大的可见顶层窗口 = 浏览器主窗口（气泡是它的小窗口，不会被选中）
  public static int[] MainRect(uint want) {
    int[] best = new int[] { 0, 0, 0, 0 }; long area = -1;
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != want || !IsWindowVisible(h)) return true;
      RECT r; GetWindowRect(h, out r);
      long a = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      if (a > area) { area = a; best = new int[] { r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top }; }
      return true;
    }, IntPtr.Zero);
    return best;
  }
  public static IntPtr FgHandle() { return GetForegroundWindow(); }
  public static IntPtr MainHandle(uint want) {
    IntPtr best = IntPtr.Zero; long area = -1;
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid != want || !IsWindowVisible(h)) return true;
      RECT r; GetWindowRect(h, out r);
      long a = (long)(r.Right - r.Left) * (r.Bottom - r.Top);
      if (a > area) { area = a; best = h; }
      return true;
    }, IntPtr.Zero);
    return best;
  }
  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(150);
    mouse_event(0x0002, 0, 0, 0, IntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, IntPtr.Zero);
  }
}
"@

$chromium = Join-Path $env:LOCALAPPDATA 'ms-playwright\chromium-1208\chrome-win64\chrome.exe'
if (-not (Test-Path -LiteralPath $chromium)) { throw "找不到 Chromium：$chromium" }

Get-Process chrome -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $chromium } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 500
if (-not $Reuse -and (Test-Path -LiteralPath $Profile)) { Remove-Item -LiteralPath $Profile -Recurse -Force -ErrorAction SilentlyContinue }

$chromeArgs = @(
  "--user-data-dir=$Profile",
  "--load-extension=$Ext",
  "--disable-extensions-except=$Ext",
  "--remote-debugging-port=$Port",
  '--no-first-run', '--no-default-browser-check', '--no-service-autorun', '--hide-crash-restore-bubble',
  '--window-size=1100,760', '--window-position=40,40',
  'about:blank'
)
$proc = Start-Process -FilePath $chromium -ArgumentList $chromeArgs -PassThru
"启动 Chromium pid=$($proc.Id)  扩展=$Ext"

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 250
  try { $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/version" -UseBasicParsing -TimeoutSec 1; $ready = $true; break } catch { }
}
if (-not $ready) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue; throw 'CDP 端口没起来' }
'CDP 就绪'

function Set-Foreground {
  $ws = New-Object -ComObject WScript.Shell
  $null = $ws.AppActivate($proc.Id)
  Start-Sleep -Milliseconds 500
  if ([Win]::FgPid() -ne $proc.Id) { $null = $ws.AppActivate('Chromium'); Start-Sleep -Milliseconds 500 }
  return ([Win]::FgPid() -eq $proc.Id -and [Win]::FgHandle() -eq [Win]::MainHandle([uint32]$proc.Id))
}

function Save-Shot([string]$name) {
  $r = [Win]::MainRect([uint32]$proc.Id)
  if ($r[2] -le 0 -or $r[3] -le 0) { "截图失败：拿不到主窗口矩形"; return }
  $bmp = New-Object System.Drawing.Bitmap($r[2], $r[3])
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r[0], $r[1], 0, 0, $bmp.Size)
  $path = Join-Path $PSScriptRoot "$Round-$name.png"
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  "截图：$path  （窗口 $($r[2])x$($r[3]) @ $($r[0]),$($r[1])）"
}

# 启动时可能已经有气泡挡在前面（上一轮没消掉的"改回 Google？"）。
# 两个按钮：「改回原来的设置」(默认/蓝) 与 「保持现状」；Tab 到第二个再回车 = 保留扩展的新标签页。
$fg0 = [Win]::FgTitle()
if ($fg0 -match '改回|恢复页面') {
  "启动时前台是气泡「$fg0」，Tab 到第二个按钮再回车"
  [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
  Start-Sleep -Milliseconds 400
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
  Start-Sleep -Milliseconds 1500
  "处理后前台：$([Win]::FgTitle())"
}
if (-not (Set-Foreground)) { "!! 前台窗口不是 Chromium（当前是「$([Win]::FgTitle())」），中止"; Stop-Process -Id $proc.Id -Force; exit 1 }
"前台窗口：$([Win]::FgTitle())  前台句柄=$([Win]::FgHandle())  主窗口句柄=$([Win]::MainHandle([uint32]$proc.Id))"

'--- 发 Ctrl+T 新建标签页 ---'
[System.Windows.Forms.SendKeys]::SendWait('^t')
Start-Sleep -Seconds 3
Save-Shot 'after-ctrlt'
'--- Ctrl+T 之后的前台标题 ---'
[Win]::FgTitle()

if (-not $SkipDismiss) {
  $fg = [Win]::FgTitle()
  if ($fg -match '改回') {
    "--- 前台是「$fg」这个气泡，Tab 到「保持现状」再回车（保留扩展的新标签页）---"
    [System.Windows.Forms.SendKeys]::SendWait('{TAB}')
    Start-Sleep -Milliseconds 400
    [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
    Start-Sleep -Milliseconds 1500
    "回车后前台窗口：$([Win]::FgTitle())"
    Save-Shot 'after-dismiss'
  } else { "--- 没有气泡（前台是「$fg」）---" }
}

'--- 焦点实况 ---'
& node "$PSScriptRoot\probe.mjs" $Port

'--- 发一个探针字符 z ---'
if (Set-Foreground) {
  [System.Windows.Forms.SendKeys]::SendWait('z')
  Start-Sleep -Milliseconds 900
} else { "!! 前台又跑了（$([Win]::FgTitle())），跳过探针字符" }

'--- 打字之后 ---'
& node "$PSScriptRoot\probe.mjs" $Port
Save-Shot 'after-z'

if (Set-Foreground) { [System.Windows.Forms.SendKeys]::SendWait('{ESC}') }
Start-Sleep -Milliseconds 500
# 优雅关闭：走 CDP 的 Browser.close，让 Chrome 把 profile 里的偏好落盘（下次 -Reuse 才不会又弹气泡）
& node "$PSScriptRoot\close.mjs" $Port
try { Wait-Process -Id $proc.Id -Timeout 20 -ErrorAction Stop; '（浏览器自己退了）' } catch { '（20 秒还没退，强杀）' }
Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
Get-Process chrome -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $chromium } | Stop-Process -Force -ErrorAction SilentlyContinue
'已关闭实验窗口'