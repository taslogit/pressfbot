# Доступность зависимостей и сервисов из РФ

Краткий обзор: что в проекте PRESS F зависит от внешних сервисов и как обеспечить работу из России.

---

## Сводка

| Ресурс | Статус из РФ | Рекомендация |
|--------|--------------|--------------|
| **npm (registry.npmjs.org)** | Нестабильно / ограничено | Зеркало (см. ниже) |
| **Docker Hub (registry-1.docker.io)** | Ограничен с 2024 | Зеркало или прокси |
| **GitHub** | Ограничения для части сервисов | Зеркало / self-hosted Git |
| **Telegram Bot API (api.telegram.org)** | Может блокироваться | Прокси или Local Bot API |
| **PostgreSQL, Redis, Node.js** | Локально / self-hosted | ✅ Без внешней зависимости |
| **TON / TonConnect** | Зависит от эндпоинтов TON | Проверять доступность при деплое |

---

## 1. NPM (пакеты Node.js)

**Используется:** установка зависимостей backend (`server/`) и frontend (`frontend/`).

**Проблема:** прямой доступ к `registry.npmjs.org` из РФ может быть нестабильным или ограниченным.

**Решение — зеркало npm:**

```bash
# Один раз для проекта
npm config set registry https://npm-mirror.gitverse.ru

# Или только для одной установки
npm install --registry=https://npm-mirror.gitverse.ru
```

В корне `server/` или `frontend/` можно создать `.npmrc`:

```
registry=https://npm-mirror.gitverse.ru
```

Альтернативы: корпоративный Artifactory/Nexus или другое зеркало npm.

---

## 2. Docker Hub (образы)

**Используется:** образы в `docker-compose*.yml` (node, nginx, postgres, redis, traefik и т.д.).

**Проблема:** с 2024 года доступ к Docker Hub из РФ ограничен (см. README — ошибки `TLS handshake timeout`).

**Решение — зеркало в `daemon.json`:**

На сервере (Linux):

```json
// /etc/docker/daemon.json
{
  "registry-mirrors": ["https://mirror.gcr.io"]
}
```

После правки: `sudo systemctl restart docker`.

**Варианты зеркал/прокси (проверять актуальность):**

- GitVerse (Сбер) — зеркало Docker Hub в бета
- Timeweb Cloud — бесплатный прокси к Docker Hub
- `mirror.gcr.io`, `registry.docker-cn.com` и др. (см. инструкции в интернете)

Заранее при доступной сети можно подтянуть образы:

```bash
docker pull node:20-alpine
docker pull nginx:stable-alpine
docker pull postgres:15
docker pull redis:7-alpine
```

---

## 3. GitHub

**Используется:** репозиторий, GitHub Actions (CI в `.github/workflows/ci.yml`).

**Проблема:** для части пользователей/организаций из РФ действуют ограничения.

**Варианты:**

- Перенос CI в другой сервис (GitLab CI, self-hosted runner, Drone и т.д.).
- Зеркало репозитория: GitLab.com, GitVerse, Gitea/Bitbucket на своём сервере.
- Локальный запуск тестов и линтеров без GitHub Actions: `npm test`, `npm run lint` в `server/`.

---

## 4. Telegram Bot API

**Используется:** бэкенд обращается к `api.telegram.org` (Telegraf, вебхуки, отправка сообщений).

**Проблема:** доступ к `api.telegram.org` с серверов в РФ может блокироваться.

**Варианты:**

1. **Сервер вне РФ** — хостинг в стране без блокировок (VPS в EU, etc.).
2. **Прокси для исходящих запросов** — настроить HTTP(S)/SOCKS5-прокси для процесса Node.js, который дергает Telegram API.
3. **Local Bot API Server** — самодельный сервер [telegram-bot-api](https://github.com/tdlib/telegram-bot-api) на своём сервере; бэкенд тогда ходит на `localhost` (или внутренний хост), а не на api.telegram.org. Требует сборки из исходников (C++, CMake, OpenSSL, zlib).

---

## 5. Что не зависит от зарубежных сервисов

- **PostgreSQL** — ставится локально / в Docker, внешний реестр не нужен после установки.
- **Redis** — то же самое.
- **Node.js** — дистрибутив можно взять с nodejs.org или с зеркала (например, корпоративного).
- **Исходный код** — после клонирования репозитория разработка и запуск возможны без GitHub/npm, если пакеты уже в `node_modules` или установлены через зеркало.

---

## 6. Рекомендуемый порядок настройки под РФ

1. Настроить **зеркало npm** (`.npmrc` или `npm config`) и переустановить зависимости в `server/` и `frontend/`.
2. Настроить **зеркало Docker** в `/etc/docker/daemon.json` и перезапустить Docker.
3. Убедиться, что **сервер бота** либо вне РФ, либо имеет доступ к `api.telegram.org` (прокси или Local Bot API).
4. При проблемах с GitHub — настроить **зеркало репозитория** и при необходимости перенести CI.

После этого зависимости, скрипты и приложение можно считать доступными для разработки и деплоя из РФ при использовании указанных обходных путей.
