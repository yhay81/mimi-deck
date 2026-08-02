[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PagesPath = Join-Path $RepoRoot "src\ui\pages.tsx"
$ProductPath = Join-Path $RepoRoot "src\config\product.ts"
$PublicDirectory = Join-Path $RepoRoot "public"
$CatalogPath = Join-Path $PublicDirectory "episodes.json"
$Pages = Get-Content -Raw -LiteralPath $PagesPath
$Product = Get-Content -Raw -LiteralPath $ProductPath

if ($Pages.Contains('data-template-surface="replace-before-release"')) {
    throw "Replace the starter workspace with the product-specific interface before release"
}

if ($Pages.Contains('class="hero"') -or $Pages.Contains('class="product-flow"')) {
    throw "Text-led hero and generic product-flow sections are not releaseable product surfaces"
}

if ($Product.Contains('"web-product-starter"') -or $Product.Contains('"Web Product Starter"')) {
    throw "Replace the starter product identity before release"
}

$KeyFiles = @(
    Get-ChildItem -LiteralPath $PublicDirectory -File |
        Where-Object { $_.Name -match "^[a-zA-Z0-9-]{8,128}\.txt$" }
)
if ($KeyFiles.Count -ne 1) {
    throw "Expected exactly one generated IndexNow key file, found $($KeyFiles.Count)"
}

$Key = (Get-Content -Raw -LiteralPath $KeyFiles[0].FullName).Trim()
if ($Key -ne $KeyFiles[0].BaseName) {
    throw "IndexNow key file name and content do not match"
}

if (-not (Test-Path -LiteralPath $CatalogPath)) {
    throw "Podcast catalog is missing"
}
$Catalog = Get-Content -Raw -LiteralPath $CatalogPath | ConvertFrom-Json
$Episodes = @($Catalog.episodes)
if ($Episodes.Count -lt 100 -or $Episodes.Count -gt 500) {
    throw "Podcast catalog must contain 100-500 episodes, found $($Episodes.Count)"
}
$TrackIds = @($Episodes | ForEach-Object { [string]$_.trackId })
if (@($TrackIds | Sort-Object -Unique).Count -ne $Episodes.Count) {
    throw "Podcast catalog contains duplicate track IDs"
}
foreach ($Episode in $Episodes) {
    if ([string]::IsNullOrWhiteSpace([string]$Episode.title) -or
        [string]::IsNullOrWhiteSpace([string]$Episode.show) -or
        -not ([string]$Episode.url).StartsWith("https://podcasts.apple.com/")) {
        throw "Podcast catalog contains an invalid episode"
    }
}

Write-Output "Product release contract is satisfied"
