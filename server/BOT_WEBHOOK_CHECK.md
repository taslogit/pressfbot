# Проверка: бот не реагирует на /start

Если после команды /start бот не отвечает и приложение не открывается, проверьте по шагам.

## 0. Connection refused — типичная причина

**Ошибка «Connection refused»** значит: Telegram стучится на `https://pressfbot.ru:443/bot`, но **на порту 443 никто не принимает соединение**.

- Вебхук у Telegram всегда идёт по **HTTPS на порт 443**. Без работающего reverse proxy с SSL бот апдейты не получит.
- Нужно поднимать стек **с Traefik** (или другим прокси с SSL), а не только `docker-compose.yml` (там нет прокси на 443).

**Что проверить на сервере:**

```bash
# 1. Запущен ли Traefik (должен быть контейнер traefik)
docker ps | grep -E 'traefik|backend'

# 2. Слушается ли на хосте порт 443
ss -tlnp | grep 443
# или
netstat -tlnp | grep 443

# 3. Доступен ли /bot снаружи (выполнить с сервера или с другого компьютера)
curl -v https://pressfbot.ru/bot
# Ожидается: HTTP 200 и тело с "ok":true. Если "Connection refused" — до контейнеров запрос не доходит.
```

**Если Traefik не запущен:** поднимайте проект так, чтобы был и Traefik, и backend, например:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
```

Убедитесь, что в `docker-compose.traefik.yml` есть сервис `traefik` и у backend заданы лейблы для роутов (в т.ч. для `/bot`).

**Фаервол:** на хосте должен быть открыт порт 443 (например `ufw allow 443` и `ufw reload`).

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

## 6. Не запускается «с команды»

### 6.1 Бэкенд не поднимается по `docker compose up`

- Запускайте стек **с Traefik**, чтобы на 443 был HTTPS:
  ```bash
  docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
  ```
- Проверьте `.env`: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL` (или `POSTGRES_*`), при необходимости `WEBHOOK_URL`, `WEB_APP_URL`.
- Логи бэкенда:
  ```bash
  docker logs pressf-backend-1 --tail 100
  ```
  Если контейнер сразу падает — смотрите ошибку в логах (БД недоступна, нет токена и т.п.).

### 6.2 Web App не открывается по кнопке «НАЧАТЬ» / меню

- В логах при старте должно быть: `Menu button (Web App) set for /start`. Если нет — в окружении backend не задан **WEB_APP_URL** (в Traefik-сборке он берётся из `${WEB_APP_URL}` в `.env`).
- **WEB_APP_URL** должен быть **https**, например `https://pressfbot.ru` — тот же домен, где отдаётся фронтенд. Telegram не открывает Web App по http.
- Проверьте в браузере: открывается ли `https://pressfbot.ru` и отдаёт ли страницу приложения. Если там 502/404 — сначала исправьте фронт и Traefik.

### 6.3 Web App показывает «404 page not found»

Это значит, что запрос `GET https://pressfbot.ru/` доходит до сервера, но вместо главной страницы приложения возвращается 404. Обычно так бывает, если **не запущен или не собран контейнер frontend**.

**Что сделать:**

1. Убедиться, что в стеке поднят **frontend** (вместе с Traefik):
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
   docker ps
   ```
   Должны быть контейнеры: traefik, backend, **frontend**, db (и при необходимости redis).

2. Пересобрать образ фронтенда и перезапустить:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.traefik.yml build --no-cache frontend
   docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d frontend
   ```

3. Проверить с сервера или с компьютера:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" https://pressfbot.ru/
   ```
   Ожидается **200**. Если 404 — запрос идёт не во frontend (проверьте правила Traefik и что контейнер frontend в сети `pressf-net`).

4. В Traefik для домена `pressfbot.ru` маршрут без пути (главная страница) должен вести на **frontend** (priority 0), а `/bot`, `/api`, `/static` — на backend (см. п. 5).

5. **404 при том что frontend запущен и в контейнере есть index.html** — Traefik не направляет запросы на frontend. Часто контейнер был создан без лейблов Traefik (запускали только `docker-compose.yml`). Пересоздайте frontend с обоими файлами:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d frontend --force-recreate
   ```
   Проверьте, что у контейнера есть лейблы Traefik:
   ```bash
   docker inspect pressf-frontend-1 --format '{{json .Config.Labels}}' | grep -o 'traefik[^"]*'
   ```
   Должны быть `traefik.enable=true`, `traefik.http.routers.pressf-frontend.rule=...` и т.д. После этого `curl -s -o /dev/null -w "%{http_code}" https://pressfbot.ru/` должен вернуть 200.
