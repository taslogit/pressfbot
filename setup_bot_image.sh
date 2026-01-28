#!/bin/bash
# Скрипт для настройки картинки бота на сервере

echo "=== Настройка картинки для бота ==="

# 1. Создаем папку для статики если нет
mkdir -p ~/pressf/public

# 2. Инструкция по загрузке картинки
echo ""
echo "ВАРИАНТ А: Загрузить картинку на сервер"
echo "1) Скопируй картинку на сервер:"
echo "   scp путь/к/картинке.jpg root@155.212.173.155:~/pressf/public/bot-info.jpg"
echo ""
echo "ВАРИАНТ Б: Использовать внешний URL"
echo "1) Залей картинку на imgur.com или imgbb.com"
echo "2) Скопируй прямую ссылку на картинку"
echo ""

# 3. Запрашиваем URL
read -p "Введи URL картинки (или путь если загрузил на сервер): " IMAGE_URL

# 4. Если это локальный путь, конвертируем в URL
if [[ $IMAGE_URL == /* ]] || [[ $IMAGE_URL == ~/* ]]; then
    # Локальный путь - нужно настроить статику
    echo "Настраиваем статику для локального файла..."
    IMAGE_URL="https://pressfbot.ru/public/bot-info.jpg"
    
    # Проверяем docker-compose.traefik.yml
    if ! grep -q "public:/app/public" ~/pressf/docker-compose.traefik.yml; then
        echo "Добавляем volume для статики в docker-compose..."
        # Это нужно сделать вручную или через sed
    fi
fi

# 5. Добавляем в .env
echo ""
echo "Добавляем BOT_INFO_IMAGE_URL в .env..."

# Проверяем есть ли уже эта переменная
if grep -q "BOT_INFO_IMAGE_URL" ~/pressf/.env; then
    # Обновляем существующую
    sed -i "s|BOT_INFO_IMAGE_URL=.*|BOT_INFO_IMAGE_URL=$IMAGE_URL|" ~/pressf/.env
    echo "Обновлена существующая переменная"
else
    # Добавляем новую
    echo "" >> ~/pressf/.env
    echo "BOT_INFO_IMAGE_URL=$IMAGE_URL" >> ~/pressf/.env
    echo "Добавлена новая переменная"
fi

echo ""
echo "✅ Настройка завершена!"
echo ""
echo "Перезапускаем бэкенд..."
cd ~/pressf
docker compose -f docker-compose.traefik.yml restart backend

echo ""
echo "Готово! Проверь бота командой /start"
