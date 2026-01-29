# Диагностика проблемы запуска бота

## Команды для проверки на сервере:

### 1. Проверь статус контейнеров:
```bash
cd ~/pressf
docker compose -f docker-compose.traefik.yml ps
```

### 2. Проверь логи бэкенда:
```bash
docker compose -f docker-compose.traefik.yml logs backend
```

### 3. Проверь последние ошибки:
```bash
docker compose -f docker-compose.traefik.yml logs backend | tail -50
```

### 4. Попробуй запустить вручную:
```bash
docker compose -f docker-compose.traefik.yml up backend
```

### 5. Проверь синтаксис docker-compose:
```bash
docker compose -f docker-compose.traefik.yml config
```

### 6. Проверь что файл корректен:
```bash
cat docker-compose.traefik.yml | head -50
```

## Возможные проблемы:

1. **Синтаксическая ошибка в YAML** - проверь отступы и кавычки
2. **Отсутствует переменная** - проверь .env файл
3. **Проблема с зависимостями** - проверь что db и redis запущены
4. **Ошибка в коде** - проверь логи на ошибки JavaScript
