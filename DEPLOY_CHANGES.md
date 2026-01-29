# 🚀 ПРИМЕНЕНИЕ ИЗМЕНЕНИЙ И ПЕРЕЗАПУСК КОНТЕЙНЕРОВ

## Быстрый способ (если изменения только в коде)

### 1. Подключись к серверу
```bash
ssh user@your-server-ip
```

### 2. Перейди в директорию проекта
```bash
cd /path/to/pressf
```

### 3. Получи последние изменения из Git
```bash
git pull origin main
```

### 4. Перезапусти контейнеры
```bash
docker-compose -f docker-compose.traefik.yml restart
```

Или если нужно пересобрать (если были изменения в Dockerfile):
```bash
docker-compose -f docker-compose.traefik.yml up -d --build
```

---

## Полный перезапуск (если были изменения в Dockerfile или зависимостях)

### 1. Подключись к серверу
```bash
ssh user@your-server-ip
```

### 2. Перейди в директорию проекта
```bash
cd /path/to/pressf
```

### 3. Получи последние изменения
```bash
git pull origin main
```

### 4. Останови контейнеры
```bash
docker-compose -f docker-compose.traefik.yml down
```

### 5. Пересобери и запусти
```bash
docker-compose -f docker-compose.traefik.yml up -d --build
```

---

## Проверка статуса

### Посмотреть логи
```bash
# Все сервисы
docker-compose -f docker-compose.traefik.yml logs -f

# Только backend
docker-compose -f docker-compose.traefik.yml logs -f backend

# Только frontend
docker-compose -f docker-compose.traefik.yml logs -f frontend
```

### Проверить статус контейнеров
```bash
docker-compose -f docker-compose.traefik.yml ps
```

### Проверить здоровье
```bash
curl https://your-domain.com/api/health
```

---

## Если нужно загрузить аватары

### 1. Создай папку на сервере (если её нет)
```bash
mkdir -p /path/to/pressf/server/static/avatars
```

### 2. Загрузи файлы через SCP
```bash
# С локального компьютера
scp avatar-*.png user@server:/path/to/pressf/server/static/avatars/
```

### 3. Или скопируй в контейнер
```bash
# На сервере
docker cp avatar-1.png pressf-backend-1:/usr/src/app/static/avatars/
docker cp avatar-2.png pressf-backend-1:/usr/src/app/static/avatars/
```

### 4. Перезапусти backend
```bash
docker-compose -f docker-compose.traefik.yml restart backend
```

---

## Автоматический скрипт деплоя

Создай файл `deploy.sh` на сервере:

```bash
#!/bin/bash
set -e

echo "🚀 Starting deployment..."

# Перейти в директорию проекта
cd /path/to/pressf

# Получить изменения
echo "📥 Pulling latest changes..."
git pull origin main

# Пересобрать и перезапустить
echo "🔨 Rebuilding containers..."
docker-compose -f docker-compose.traefik.yml up -d --build

# Проверить статус
echo "✅ Checking status..."
docker-compose -f docker-compose.traefik.yml ps

echo "🎉 Deployment complete!"
```

Сделай его исполняемым:
```bash
chmod +x deploy.sh
```

Запуск:
```bash
./deploy.sh
```

---

## Решение проблем

### Если контейнеры не запускаются
```bash
# Посмотри логи
docker-compose -f docker-compose.traefik.yml logs

# Проверь конфигурацию
docker-compose -f docker-compose.traefik.yml config
```

### Если нужно очистить всё и начать заново
```bash
# ОСТОРОЖНО: Это удалит все данные!
docker-compose -f docker-compose.traefik.yml down -v
docker-compose -f docker-compose.traefik.yml up -d --build
```

### Если база данных не работает
```bash
# Проверь статус
docker-compose -f docker-compose.traefik.yml ps db

# Посмотри логи
docker-compose -f docker-compose.traefik.yml logs db
```

---

## Быстрая команда (всё в одной строке)

```bash
cd /path/to/pressf && git pull origin main && docker-compose -f docker-compose.traefik.yml up -d --build
```

---

**Готово!** После перезапуска все изменения будут применены.
