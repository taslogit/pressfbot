# Скрипт для загрузки аватаров на сервер
# Использование: .\upload_avatars.ps1

param(
    [Parameter(Mandatory=$true)]
    [string]$ServerIP,
    
    [Parameter(Mandatory=$true)]
    [string]$ServerUser,
    
    [Parameter(Mandatory=$false)]
    [string]$ServerPath = "~/pressf/server/static/avatars"
)

Write-Host "🚀 Загрузка аватаров на сервер..." -ForegroundColor Cyan
Write-Host "Сервер: $ServerUser@$ServerIP" -ForegroundColor Yellow
Write-Host "Путь: $ServerPath" -ForegroundColor Yellow
Write-Host ""

# Проверка наличия файлов
$avatarFiles = Get-ChildItem -Path "." -Filter "*.jpg"
if ($avatarFiles.Count -eq 0) {
    Write-Host "❌ Файлы .jpg не найдены в текущей директории!" -ForegroundColor Red
    exit 1
}

Write-Host "Найдено файлов: $($avatarFiles.Count)" -ForegroundColor Green
Write-Host ""

# Загрузка файлов
Write-Host "📤 Загрузка файлов..." -ForegroundColor Cyan
try {
    scp *.jpg "${ServerUser}@${ServerIP}:${ServerPath}/"
    Write-Host ""
    Write-Host "✅ Аватары успешно загружены!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📋 Теперь выполни на сервере:" -ForegroundColor Yellow
    Write-Host "   chmod -R 755 server/static/avatars" -ForegroundColor White
    Write-Host "   docker compose -f docker-compose.traefik.yml restart backend" -ForegroundColor White
} catch {
    Write-Host "❌ Ошибка при загрузке: $_" -ForegroundColor Red
    exit 1
}
