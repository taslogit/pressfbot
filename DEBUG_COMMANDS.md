# 🔍 Команды для диагностики и проверки логов

## 1. Проверка логов Backend сервиса

```bash
# Последние 100 строк логов
docker compose logs backend --tail=100

# Логи в реальном времени (follow)
docker compose logs backend --tail=100 -f

# Логи с фильтрацией по ошибкам
docker compose logs backend --tail=200 | grep -i error

# Логи с фильтрацией по предупреждениям
docker compose logs backend --tail=200 | grep -i warn

# Логи за последний час
docker compose logs backend --since 1h

# Логи за конкретное время
docker compose logs backend --since 2024-12-19T10:00:00
```

## 2. Проверка логов Traefik (роутинг)

```bash
# Логи Traefik
docker compose logs traefik --tail=100 -f

# Логи Traefik с фильтрацией по backend
docker compose logs traefik --tail=200 | grep -i backend

# Логи Traefik с фильтрацией по bot
docker compose logs traefik --tail=200 | grep -i bot
```

## 3. Проверка статуса контейнеров

```bash
# Статус всех контейнеров
docker compose ps

# Детальная информация о контейнере backend
docker compose ps backend

# Проверка здоровья контейнеров
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

## 4. Проверка вебхука Telegram бота

```bash
# Проверка переменных окружения бота
docker compose exec backend env | grep -E "TELEGRAM_BOT_TOKEN|WEBHOOK_URL|WEB_APP_URL|BOT_USE_WEBHOOK"

# Проверка доступности вебхука изнутри контейнера
docker compose exec backend curl -X POST http://localhost:3000/bot -H "Content-Type: application/json" -d '{"test": true}' -v

# Проверка вебхука извне (с сервера)
curl -k -X POST https://pressfbot.ru/bot -H "Content-Type: application/json" -d '{"test": true}' -v

# Проверка информации о вебхуке через Telegram API (нужен BOT_TOKEN)
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

## 5. Проверка подключения к базе данных

```bash
# Проверка подключения к PostgreSQL
docker compose exec backend node -e "const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('SELECT NOW()').then(r => { console.log('DB OK:', r.rows[0]); pool.end(); }).catch(e => { console.error('DB ERROR:', e.message); process.exit(1); });"

# Проверка Redis подключения
docker compose exec backend node -e "const Redis = require('ioredis'); const redis = new Redis(process.env.REDIS_URL); redis.ping().then(() => { console.log('Redis OK'); redis.quit(); }).catch(e => { console.error('Redis ERROR:', e.message); process.exit(1); });"
```

## 6. Проверка API endpoints

```bash
# Проверка health endpoint
curl -k https://pressfbot.ru/api/health

# Проверка verify endpoint (нужен initData)
curl -k -X POST https://pressfbot.ru/api/verify -H "Content-Type: application/json" -d '{"initData": "test"}' -v

# Проверка доступности API
curl -k -I https://pressfbot.ru/api/health
```

## 7. Проверка логов Frontend

```bash
# Логи frontend контейнера
docker compose logs frontend --tail=100 -f

# Логи frontend с фильтрацией по ошибкам
docker compose logs frontend --tail=200 | grep -i error
```

## 8. Проверка сетевого подключения между контейнерами

```bash
# Проверка доступности backend из traefik
docker compose exec traefik ping -c 2 backend

# Проверка доступности backend по имени сервиса
docker compose exec backend ping -c 2 traefik

# Проверка портов
docker compose exec backend netstat -tuln | grep 3000
```

## 9. Проверка переменных окружения

```bash
# Все переменные окружения backend
docker compose exec backend env | sort

# Конкретные переменные
docker compose exec backend env | grep -E "PORT|DATABASE_URL|REDIS_URL|BOT_TOKEN|WEBHOOK"
```

## 10. Перезапуск сервисов

```bash
# Перезапуск backend
docker compose restart backend

# Перезапуск всех сервисов
docker compose restart

# Перезапуск с пересборкой (если были изменения в коде)
docker compose up -d --build backend
```

## 11. Проверка использования ресурсов

```bash
# Использование ресурсов контейнерами
docker stats

# Использование ресурсов конкретным контейнером
docker stats backend --no-stream
```

## 12. Проверка логов Docker

```bash
# Системные логи Docker
journalctl -u docker.service -n 50

# Логи конкретного контейнера через docker logs
docker logs pressf-backend-1 --tail=100 -f
```

## 13. Проверка конфигурации Traefik

```bash
# Проверка роутеров Traefik
curl -k https://localhost:8080/api/http/routers | jq '.[] | select(.name | contains("backend"))'

# Проверка сервисов Traefik
curl -k https://localhost:8080/api/http/services | jq '.[] | select(.name | contains("backend"))'

# Проверка middleware Traefik
curl -k https://localhost:8080/api/http/middlewares
```

## 14. Проверка базы данных напрямую

```bash
# Подключение к PostgreSQL
docker compose exec postgres psql -U postgres -d pressf

# В psql консоли:
# \dt - список таблиц
# SELECT COUNT(*) FROM sessions; - количество сессий
# SELECT COUNT(*) FROM profiles; - количество профилей
# \q - выход
```

## 15. Быстрая диагностика (все в одном)

```bash
# Создайте скрипт quick_check.sh:
#!/bin/bash
echo "=== Container Status ==="
docker compose ps
echo ""
echo "=== Backend Logs (last 20 lines) ==="
docker compose logs backend --tail=20
echo ""
echo "=== Backend Health ==="
curl -k -s https://pressfbot.ru/api/health | jq .
echo ""
echo "=== Environment Check ==="
docker compose exec backend env | grep -E "BOT_TOKEN|WEBHOOK|DATABASE_URL" | sed 's/=.*/=***/'
```

## 16. Проверка ошибок в коде

```bash
# Проверка синтаксиса JavaScript в backend
docker compose exec backend node --check /app/server/index.js

# Проверка всех JS файлов
docker compose exec backend find /app/server -name "*.js" -exec node --check {} \;
```

## 17. Мониторинг в реальном времени

```bash
# Все логи одновременно
docker compose logs -f

# Только ошибки из всех сервисов
docker compose logs -f | grep -i error

# Логи backend и traefik одновременно
docker compose logs -f backend traefik
```

## 18. Проверка вебхука через Telegram Bot API

```bash
# Установите BOT_TOKEN в переменную
export BOT_TOKEN="your_bot_token_here"

# Получить информацию о вебхуке
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"

# Установить вебхук вручную
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=https://pressfbot.ru/bot"

# Удалить вебхук
curl -X POST "https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook"
```

## 19. Проверка производительности

```bash
# Время ответа API
time curl -k -s https://pressfbot.ru/api/health

# Проверка с таймаутом
curl -k --max-time 5 https://pressfbot.ru/api/health
```

## 20. Очистка логов (если нужно)

```bash
# Очистка логов контейнера (требует перезапуска)
docker compose down
docker compose up -d
```

---

## 🔧 Типичные проблемы и их диагностика

### Проблема: Бот не отвечает на /start

```bash
# 1. Проверить логи backend
docker compose logs backend --tail=50 | grep -i "start\|webhook\|bot"

# 2. Проверить вебхук
curl "https://api.telegram.org/bot${BOT_TOKEN}/getWebhookInfo"

# 3. Проверить доступность endpoint
curl -k -X POST https://pressfbot.ru/bot -H "Content-Type: application/json" -d '{"message":{"text":"/start"}}' -v
```

### Проблема: Ошибки подключения к БД

```bash
# 1. Проверить статус PostgreSQL
docker compose ps postgres

# 2. Проверить подключение
docker compose exec backend node -e "const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('SELECT 1').then(() => console.log('OK')).catch(e => console.error('ERROR:', e.message));"
```

### Проблема: 404 на API endpoints

```bash
# 1. Проверить роутинг Traefik
curl -k https://localhost:8080/api/http/routers | jq '.[] | select(.name | contains("backend"))'

# 2. Проверить логи Traefik
docker compose logs traefik --tail=50 | grep -i "404\|backend"
```

---

**Примечание:** Замените `<BOT_TOKEN>` на реальный токен бота или используйте переменную окружения.
