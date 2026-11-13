# Builds the addon into ..\dist\win\x64\postpin-process.uxpaddon and runs the tests.
# Needs the MSVC build tools, LLVM (libclang for bindgen) and the SDK headers, see
# vendor\uxp-hybrid-sdk\SOURCE.md.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
cargo test --release
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
cargo build --release --target x86_64-pc-windows-msvc
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
New-Item -ItemType Directory -Force ..\dist\win\x64 | Out-Null
Copy-Item target\x86_64-pc-windows-msvc\release\postpin_process.dll ..\dist\win\x64\postpin-process.uxpaddon
Write-Host "addon: ..\dist\win\x64\postpin-process.uxpaddon"
