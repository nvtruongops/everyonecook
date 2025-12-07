#!/usr/bin/env pwsh
# Quick deployment package creator for upload-module
# Uses workspace root node_modules

$ErrorActionPreference = "Stop"

Write-Host "🚀 Creating upload-module deployment package..." -ForegroundColor Cyan

# Navigate to upload-module
cd $PSScriptRoot

# Step 1: Clean and build
Write-Host "📦 Building TypeScript..." -ForegroundColor Yellow
if (Test-Path "dist") {
    Remove-Item -Recurse -Force "dist"
}
npm run build

# Step 2: Create node_modules junction in dist
Write-Host "🔗 Creating node_modules link..." -ForegroundColor Yellow
$rootNodeModules = Resolve-Path "../../node_modules"
$distNodeModules = Join-Path (Get-Location) "dist\node_modules"

# Use junction (directory symlink on Windows)
New-Item -ItemType Junction -Path $distNodeModules -Target $rootNodeModules -Force | Out-Null

Write-Host "✅ Deployment package ready!" -ForegroundColor Green
Write-Host "📁 Location: dist/" -ForegroundColor Cyan
Write-Host "🔗 node_modules: Junction to workspace root" -ForegroundColor Cyan
