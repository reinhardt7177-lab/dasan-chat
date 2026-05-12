# 다산초당 챗봇 서버 — 개발용 실행 스크립트.
# 사용:  .\run.ps1            # 기본 127.0.0.1:8080, 리로드 ON
#       .\run.ps1 -Port 9000 # 포트 변경
param(
    [string]$BindHost = "127.0.0.1",
    [int]$Port = 8080
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) {
    Write-Host "[run.ps1] .venv가 없어 uv sync로 생성합니다." -ForegroundColor Yellow
    uv sync
}

uv run python -m dasan_chat --host $BindHost --port $Port --reload
