# Скрипт для обновления BOT_INFO_IMAGE_URL на сервере

$IMAGE_URL = "https://iimg.su/i/rstipQ"

Write-Host "Добавляю BOT_INFO_IMAGE_URL в .env на сервере..."

# Команда для проверки и обновления .env
$command = @"
cd ~/pressf
if grep -q '^BOT_INFO_IMAGE_URL=' .env; then
    sed -i 's|^BOT_INFO_IMAGE_URL=.*|BOT_INFO_IMAGE_URL=$IMAGE_URL|' .env
    echo 'Обновлено'
else
    echo '' >> .env
    echo 'BOT_INFO_IMAGE_URL=$IMAGE_URL' >> .env
    echo 'Добавлено'
fi
"@

ssh root@155.212.173.155 $command

Write-Host "`nПерезапускаю бэкенд..."
ssh root@155.212.173.155 "cd ~/pressf && docker compose -f docker-compose.traefik.yml restart backend"

Write-Host "`n✅ Готово! Проверь бота командой /start"
