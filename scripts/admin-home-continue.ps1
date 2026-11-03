# MyeongHa Admin Console: safely resume the same development branch on a home PC.
# No passwords, API tokens, or .env files are copied.
$ErrorActionPreference = 'Stop'
$branch = 'feat/admin-console/admin-01-shell-20261026'
$repo = 'https://github.com/gycha0109-beep/MyeongHa.git'
$target = Join-Path $env:USERPROFILE 'Documents\MyeongHa-admin-console-home-20261102'

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw 'Git is required. Install Git for Windows first.'
}
if (-not (Test-Path $target)) {
  git clone --single-branch --branch $branch $repo $target
  if ($LASTEXITCODE -ne 0) { throw 'Git clone failed. Check GitHub authentication.' }
} else {
  if (-not (Test-Path (Join-Path $target '.git'))) { throw 'Target folder is not a Git repository. No changes made.' }
  $origin = (git -C $target remote get-url origin).Trim()
  if ($origin -notmatch '(^|[:/])gycha0109-beep/MyeongHa(\.git)?$') { throw 'Target repository origin does not match; refusing to modify it.' }
  $dirty = @(git -C $target status --porcelain)
  if ($dirty.Count -gt 0) { throw 'Local changes detected. Please handle them before updating.' }
  git -C $target checkout $branch
  if ($LASTEXITCODE -ne 0) { throw 'Could not select the Admin branch.' }
  git -C $target pull --ff-only origin $branch
  if ($LASTEXITCODE -ne 0) { throw 'Fast-forward pull failed. Existing work preserved.' }
}
$commit = (git -C $target rev-parse --short HEAD).Trim()
Write-Output ('READY: '+$target)
Write-Output ('BRANCH: '+$branch)
Write-Output ('COMMIT: '+$commit)
Write-Output 'Admin deployment credentials remain in GitHub Actions Production environment; they are not downloadable.'
Write-Output 'Private Admin Worker has NOT been activated. Do not change Production branch protection.'
Write-Output 'Roadmap: docs/operations/ADMIN_HOME_CONTINUATION_20261102.md'
Write-Output 'PR: https://github.com/gycha0109-beep/MyeongHa/pull/2630'
Write-Output 'Blocked stage: https://github.com/gycha0109-beep/MyeongHa/actions/runs/41402190932'
