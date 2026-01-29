# Исправление роутинга Traefik

## Проблема
Запросы к `/bot` попадают на фронтенд (nginx), а не на бэкенд.

## Решение

### 1. Полностью пересоздай контейнеры:
```bash
cd ~/pressf
docker compose -f docker-compose.traefik.yml down
docker compose -f docker-compose.traefik.yml up -d
```

### 2. Проверь логи Traefik:
```bash
docker compose -f docker-compose.traefik.yml logs traefik | tail -50
```

### 3. Проверь роуты через Traefik API:
```bash
curl http://localhost:8080/api/http/routers | grep -A 5 "pressf-backend"
curl http://localhost:8080/api/http/routers | grep -A 5 "pressf-frontend"
```

### 4. Проверь что запрос попадает на бэкенд:
```bash
curl -v https://pressfbot.ru/bot 2>&1 | grep -i "server\|location\|backend"
```

### 5. Альтернатива - проверь напрямую через IP бэкенда:
```bash
# Узнай IP бэкенда
docker compose -f docker-compose.traefik.yml exec backend hostname -i

# Проверь что бэкенд отвечает
docker compose -f docker-compose.traefik.yml exec backend curl -I http://localhost:3000/bot
```

### 6. Если ничего не помогает, попробуй временно отключить фронтенд:
```bash
docker compose -f docker-compose.traefik.yml stop frontend
# Затем проверь /bot
curl -I https://pressfbot.ru/bot
```
