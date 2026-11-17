param([string]$SdkPath = 'D:\Android\sdk', [switch]$Offline)
$ErrorActionPreference = 'Stop'
$projectPath = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectPath
if (-not (Test-Path -LiteralPath $SdkPath)) { throw "找不到 Android SDK：$SdkPath" }
$sdkForProperties = $SdkPath.Replace('\','\\').Replace(':','\:')
[IO.File]::WriteAllText((Join-Path $projectPath 'android\local.properties'), "sdk.dir=$sdkForProperties`n", [Text.UTF8Encoding]::new($false))
$keyDirectory = Join-Path $projectPath 'android\keystore'
$keyPath = Join-Path $keyDirectory 'jiazu-release.jks'
$propertiesPath = Join-Path $projectPath 'android\keystore.properties'
if (-not (Test-Path -LiteralPath $keyPath)) {
  if (Test-Path -LiteralPath $propertiesPath) { throw '签名配置存在，但密钥丢失。请恢复原密钥，避免无法覆盖安装旧版本。' }
  New-Item -ItemType Directory -Path $keyDirectory -Force | Out-Null
  $passwordBytes = [byte[]]::new(32)
  [Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
  $signingPassword = [Convert]::ToHexString($passwordBytes)
  $env:JIAZU_SIGNING_PASSWORD = $signingPassword
  try {
    & keytool -genkeypair -keystore $keyPath -storepass:env JIAZU_SIGNING_PASSWORD -keypass:env JIAZU_SIGNING_PASSWORD -alias jiazu -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Jiazu, OU=Family, O=Jiazu, L=Hangzhou, ST=Zhejiang, C=CN' -noprompt
    if ($LASTEXITCODE -ne 0) { throw '签名密钥生成失败' }
    $properties = "storeFile=keystore/jiazu-release.jks`nstorePassword=$signingPassword`nkeyAlias=jiazu`nkeyPassword=$signingPassword`n"
    [IO.File]::WriteAllText($propertiesPath, $properties, [Text.UTF8Encoding]::new($false))
  } finally { Remove-Item Env:JIAZU_SIGNING_PASSWORD -ErrorAction SilentlyContinue }
}
if (-not (Test-Path -LiteralPath $propertiesPath)) { throw '缺少 keystore.properties，请恢复签名配置' }
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
& npx.cmd cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Android 同步失败' }
$localGradle = Join-Path (Split-Path -Parent $SdkPath) 'tools\gradle-8.13\bin\gradle.bat'
$gradleArguments = @('-p','android','assembleRelease','--console=plain')
if ($Offline) { $gradleArguments += '--offline' }
if (Test-Path -LiteralPath $localGradle) { & $localGradle @gradleArguments } else { & '.\android\gradlew.bat' @gradleArguments }
if ($LASTEXITCODE -ne 0) { throw 'APK 构建失败' }
New-Item -ItemType Directory -Path (Join-Path $projectPath 'releases') -Force | Out-Null
$appVersion = (Get-Content -LiteralPath (Join-Path $projectPath 'package.json') -Raw | ConvertFrom-Json).version
$destination = Join-Path $projectPath ("releases\家族-v{0}.apk" -f $appVersion)
Copy-Item -LiteralPath (Join-Path $projectPath 'android\app\build\outputs\apk\release\app-release.apk') -Destination $destination -Force
Write-Output "安装包已生成：$destination"
