# 🔍 Проверка роутинга Traefik для /bot endpoint

## Команды для диагностики:

```bash
# 1. Проверить, что Traefik видит backend контейнер и его labels
docker inspect pressf-backend-1 | grep -A 30 "Labels"

# 2. Проверить роутеры Traefik через API
curl -k https://localhost:8080/api/http/routers | jq '.[] | select(.name | contains("backend"))'

# 3. Проверить сервисы Traefik
curl -k https://localhost:8080/api/http/services | jq '.[] | select(.name | contains("backend"))'

# 4. Проверить доступность /bot изнутри сети Docker
docker compose -f docker-compose.traefik.yml exec backend curl -X POST http://localhost:3000/bot -H "Content-Type: application/json" -d '{"test": true}' -v

# 5. Проверить доступность /bot через Traefik (снаружи)
curl -k -X POST https://pressfbot.ru/bot -H "Content-Type: application/json" -d '{"message":{"text":"/start"}}' -v

# 6. Проверить логи Traefik на запросы к /bot
docker compose -f docker-compose.traefik.yml logs traefik | grep -i "/bot"

# 7. Проверить, что backend контейнер в правильной сети
docker network inspect pressf-net | grep -A 5 "backend"

# 8. Перезапустить все сервисы для применения изменений
docker compose -f docker-compose.traefik.yml down
docker compose -f docker-compose.traefik.yml up -d

# 9. Проверить статус всех контейнеров
docker compose -f docker-compose.traefik.yml ps
```

## Возможные проблемы:

1. **Traefik не видит новые labels** - нужно перезапустить backend после изменения docker-compose.traefik.yml
2. **Конфликт роутеров** - frontend роутер может перехватывать запросы
3. **Проблема с сетью** - backend не в сети pressf-net
4. **Проблема с приоритетами** - frontend роутер имеет более высокий приоритет

## Решение:

Если проблема сохраняется, попробуйте:

```bash
# Полная перезагрузка всех сервисов
docker compose -f docker-compose.traefik.yml down
docker compose -f docker-compose.traefik.yml up -d --build

# Проверить логи после перезапуска
docker compose -f docker-compose.traefik.yml logs -f
```
