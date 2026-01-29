# 🔍 КОМАНДЫ ДЛЯ ДИАГНОСТИКИ БОТА

## ШАГ 1: Проверка логов контейнера backend

```bash
docker compose logs backend --tail=100 -f
```

**Что ищем:**
- `✅ Webhook set successfully` или `✅ Bot launched via long polling`
- `Webhook info` - информация о webhook
- `[/start] Received start command` - получение команды
- Ошибки при обработке команды

---

## ШАГ 2: Проверка переменных окружения

```bash
docker compose exec backend env | grep -E "TELEGRAM_BOT_TOKEN|WEBHOOK_URL|WEB_APP_URL|BOT_USE_WEBHOOK"
```

**Что проверяем:**
- `TELEGRAM_BOT_TOKEN` - должен быть установлен
- `WEBHOOK_URL` - должен быть указан (если используется webhook)
- `WEB_APP_URL` - должен быть указан
- `BOT_USE_WEBHOOK` - true/false

---

## ШАГ 3: Проверка webhook через API Telegram

**Замените `YOUR_BOT_TOKEN` на ваш токен:**

```bash
curl https://api.telegram.org/botYOUR_BOT_TOKEN/getWebhookInfo
```

**Или через PowerShell:**
```powershell
$token = "YOUR_BOT_TOKEN"
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/getWebhookInfo" | ConvertTo-Json
```

**Что проверяем:**
- `url` - должен совпадать с вашим `WEBHOOK_URL/bot`
- `pending_update_count` - количество ожидающих обновлений
- `last_error_date` и `last_error_message` - ошибки webhook

---

## ШАГ 4: Проверка endpoint /bot на сервере

```bash
curl https://your-domain.com/bot
```

**Или через PowerShell:**
```powershell
Invoke-RestMethod -Uri "https://your-domain.com/bot"
```

**Ожидаемый ответ:**
```json
{"ok":true,"message":"Webhook endpoint is active"}
```

---

## ШАГ 5: Проверка статуса контейнера

```bash
docker compose ps
```

**Что проверяем:**
- Контейнер `backend` должен быть в статусе `Up`
- Нет перезапусков (Restarts = 0)

---

## ШАГ 6: Проверка последних логов с фильтром по /start

```bash
docker compose logs backend --tail=200 | grep -i "start\|webhook\|bot"
```

**Или через PowerShell:**
```powershell
docker compose logs backend --tail=200 | Select-String -Pattern "start|webhook|bot" -CaseSensitive:$false
```

---

## ШАГ 7: Тест отправки сообщения боту (если используется polling)

Если бот работает через long polling, проверьте логи при отправке /start:

```bash
docker compose logs backend -f
```

Затем отправьте `/start` боту и смотрите логи в реальном времени.

---

## ШАГ 8: Переустановка webhook (если используется webhook)

```bash
# Удалить webhook
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/deleteWebhook?drop_pending_updates=true"

# Установить webhook заново
curl -X POST "https://api.telegram.org/botYOUR_BOT_TOKEN/setWebhook?url=https://your-domain.com/bot"
```

**Или через PowerShell:**
```powershell
$token = "YOUR_BOT_TOKEN"
$webhookUrl = "https://your-domain.com/bot"

# Удалить
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/deleteWebhook?drop_pending_updates=true"

# Установить
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook?url=$webhookUrl"
```

---

## ШАГ 9: Проверка подключения к базе данных

```bash
docker compose exec backend node -e "const {Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});p.query('SELECT 1').then(()=>console.log('DB OK')).catch(e=>console.error('DB ERROR:',e.message)).finally(()=>p.end())"
```

---

## ШАГ 10: Проверка Redis (если используется)

```bash
docker compose exec backend node -e "const Redis=require('ioredis');const r=new Redis(process.env.REDIS_URL);r.ping().then(()=>console.log('Redis OK')).catch(e=>console.error('Redis ERROR:',e.message)).finally(()=>r.quit())"
```

---

## 🔧 БЫСТРОЕ ИСПРАВЛЕНИЕ

Если webhook не работает, попробуйте переключиться на polling:

1. В `.env` установите:
   ```
   BOT_USE_WEBHOOK=false
   ```

2. Перезапустите контейнер:
   ```bash
   docker compose restart backend
   ```

3. Проверьте логи:
   ```bash
   docker compose logs backend --tail=50
   ```

Должно появиться: `✅ Bot launched via long polling`

---

## 📝 ЧЕКЛИСТ ПРОБЛЕМ

- ❌ Бот не отвечает на /start
  - Проверьте логи (ШАГ 1)
  - Проверьте webhook/polling (ШАГ 3)
  - Проверьте переменные окружения (ШАГ 2)

- ❌ Webhook показывает ошибки (404 Not Found)
  - **Проблема:** Traefik не может найти endpoint `/bot`
  - **Решение:** Проверьте labels контейнера backend:
    ```bash
    docker inspect pressf-backend-1 | grep -A 20 Labels
    ```
  - Убедитесь, что в `docker-compose.traefik.yml` labels используют хардкод домена:
    ```yaml
    - "traefik.http.routers.pressf-backend.rule=Host(`pressfbot.ru`) && (PathPrefix(`/api`) || PathPrefix(`/bot`) || PathPrefix(`/static`))"
    ```
  - Пересоздайте контейнеры:
    ```bash
    docker compose -f docker-compose.traefik.yml up -d --force-recreate backend
    docker compose -f docker-compose.traefik.yml restart traefik
    ```
  - Проверьте доступность endpoint (ШАГ 4)
  - Переустановите webhook (ШАГ 8)
  - Проверьте SSL сертификат (должен быть валидный HTTPS)

- ❌ Бот не запускается
  - Проверьте статус контейнера (ШАГ 5)
  - Проверьте логи на ошибки (ШАГ 1)
  - Проверьте DATABASE_URL и REDIS_URL (ШАГ 9, 10)
