# Проверка: бот не реагирует на /start

Если после команды /start бот не отвечает и приложение не открывается, проверьте по шагам.

## 1. Доступность вебхука снаружи

С сервера или с любого компьютера:

```bash
# Должен вернуть 200 и {"ok":true,"message":"Webhook endpoint is active"}
curl -s -o /dev/null -w "%{http_code}" https://pressfbot.ru/bot
```

Если не 200 — запросы не доходят до бэкенда (Traefik, firewall, домен).

## 2. Переменные окружения (Docker)

В `.env` или в `docker-compose` должны быть:

- **WEBHOOK_URL** — базовый URL без пути, например `https://pressfbot.ru`. Бэкенд сам добавит `/bot`.
- **WEB_APP_URL** — полный URL веб-приложения, который открывается по кнопке «НАЧАТЬ», например `https://pressfbot.ru`.
- **TELEGRAM_BOT_TOKEN** — токен бота от @BotFather.

В логах при старте должны быть строки:
- `✅ Webhook set successfully` с URL `https://pressfbot.ru/bot`
- `Menu button (Web App) set for /start` (если WEB_APP_URL задан)

## 3. Логи при нажатии /start

После деплоя отправьте боту команду `/start` и сразу смотрите логи:

```bash
docker logs pressf-backend-1 --tail 50
```

- Если появляется **`[/bot] Webhook update received`** — запрос от Telegram доходит до бэкенда.
- Если появляется **`[/start] Received start command`** — бот обработал /start и отправил ответ с кнопкой.
- Если ни того ни другого нет — до бэкенда запрос не доходит (п. 1 или настройки Telegram).

## 4. Ошибка "Connection refused" в getWebhookInfo

Сообщение `lastErrorMessage: "Connection refused"` значит, что в какой-то момент Telegram не смог достучаться до `https://pressfbot.ru/bot`. Часто это старая ошибка. После проверки п. 1 отправьте /start снова и смотрите логи (п. 3). Если в логах есть `[/bot] Webhook update received` и `[/start] Received start command`, вебхук сейчас работает.

## 5. Traefik: маршрут для /bot

В `docker-compose.traefik.yml` у backend должны быть лейблы с правилом для `/bot`, например:

- `PathPrefix(/bot)` с приоритетом выше, чем у других роутеров для того же хоста.

Иначе запросы на `https://pressfbot.ru/bot` могут уходить не в backend, а в frontend, и бот не будет получать апдейты.
