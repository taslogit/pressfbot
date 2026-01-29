# Диагностика webhook бота

## Команды для проверки на сервере:

### 1. Проверь что изменения применились:
```bash
cd ~/pressf
git pull
docker compose -f docker-compose.traefik.yml config | grep -A 2 "priority"
```

### 2. Перезапусти Traefik:
```bash
docker compose -f docker-compose.traefik.yml restart traefik
```

### 3. Проверь что webhook доступен:
```bash
curl -X POST https://pressfbot.ru/bot -H "Content-Type: application/json" -d '{"message":{"text":"/start"}}'
```

### 4. Проверь логи бэкенда в реальном времени:
```bash
docker compose -f docker-compose.traefik.yml logs -f backend
```
Затем отправь /start боту и смотри логи.

### 5. Проверь что webhook установлен в Telegram:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

### 6. Проверь доступность URL изображения:
```bash
curl -I https://iimg.su/i/rstipQ
```

### 7. Попробуй отправить тестовое сообщение напрямую через API:
```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/sendMessage" \
  -H "Content-Type: application/json" \
  -d '{"chat_id": <YOUR_CHAT_ID>, "text": "test"}'
```
