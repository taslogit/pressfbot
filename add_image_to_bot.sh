#!/bin/bash
# Скрипт для добавления картинки в .env на сервере

echo "Введи URL картинки (например https://i.imgur.com/xxxxx.jpg):"
read IMAGE_URL

echo ""
echo "Добавляю BOT_INFO_IMAGE_URL в .env..."

# Проверяем есть ли уже эта переменная
if grep -q "^BOT_INFO_IMAGE_URL=" ~/pressf/.env 2>/dev/null; then
    # Обновляем существующую
    sed -i "s|^BOT_INFO_IMAGE_URL=.*|BOT_INFO_IMAGE_URL=$IMAGE_URL|" ~/pressf/.env
    echo "✅ Обновлена существующая переменная"
else
    # Добавляем новую
    echo "" >> ~/pressf/.env
    echo "BOT_INFO_IMAGE_URL=$IMAGE_URL" >> ~/pressf/.env
    echo "✅ Добавлена новая переменная"
fi

echo ""
echo "Перезапускаю бэкенд..."
cd ~/pressf
docker compose -f docker-compose.traefik.yml restart backend

echo ""
echo "✅ Готово! Проверь бота командой /start"
