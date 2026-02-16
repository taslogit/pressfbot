# Отчёт аудита приложения Press F

Проведён глубокий аудит: БД, кеш, игровая механика, XP, уведомления, лимиты запросов, обработка ошибок.

---

## 1. База данных (БД)

### 1.1 Миграции и схема
- **Файл:** `server/migrations.js` — единый скрипт создания/обновления таблиц (CREATE IF NOT EXISTS, ALTER ADD COLUMN IF NOT EXISTS).
- **Плюсы:** Индексы по `user_id`, статусам, датам; составные индексы для типичных запросов (letters, duels); GIN для full-text; CHECK для `reputation`, `experience`, `karma`, `level`.
- **Замечания:**
  - Нет версионированных миграций (один большой скрипт) — при росте проекта лучше перейти на миграции по номерам (например, node-pg-migrate).
  - Дублирование GIN-индексов: `idx_letters_title_gin` и `idx_letters_title_fts` — можно оставить один.

### 1.2 Подключение и пул
- Один `Pool` (pg), создаётся в `index.js`, передаётся в роуты. Нет явного `pool.end()` при shutdown — при грациозном завершении процесса стоит закрывать пул.

### 1.3 Транзакции
- Check-in, создание дуэля/письма, квесты, подарки используют `pool.query` в транзакции (`client` из `pool.connect()`). Важно: везде есть `client.release()` в `finally`.
- **Рекомендация:** В сложных сценариях (check-in: профиль + настройки + активность) транзакции уже используются — ок.

### 1.4 Целостность XP
- **Исправлено в рамках аудита:** При выдаче XP в `daily-login-loot` и `guide-reward` не обновлялось поле `total_xp_earned` — теперь обновляется вместе с `experience` и `spendable_xp`.
- **Исправлено:** Уровень (`level`) в ответе API теперь считается из `experience` по формуле `level = floor(sqrt(experience/100)) + 1` в `profileService.normalizeProfile`, чтобы не расходиться с начислениями XP.

---

## 2. Кеш (Redis)

### 2.1 Инициализация
- `utils/cache.js`: при наличии `REDIS_URL` создаётся клиент ioredis; при отсутствии кеш отключён (get/set не падают, возвращают null/false).
- Защита от stampede: `getOrSet` и ожидание по ключу в `get` через `pendingRequests` Map.

### 2.2 Ключи и TTL
| Ключ / паттерн              | TTL   | Инвалидация |
|----------------------------|-------|-------------|
| `profile:${userId}`        | 300 с | При обновлении профиля, check-in, настройках, referral, достижениях |
| `daily-quests:${userId}:${date}` | 300 с | При claim, updateProgress |
| `tournaments:${status}:${userId}` | 300 с | При регистрации/отмене (delByPattern `tournaments:*`) |
| `squad:${userId}`          | 300 с | При создании/обновлении/добавлении/удалении участника |
| `events:active:${today}`   | 3600 с| При claim награды события |
| `events:progress:${userId}:${eventId}` | — | При claim |
| `avatars:list`             | —    | При старте приложения (`cache.del('avatars:list')`) |
| `activity:*`               | —    | При логировании активности (delByPattern) |

### 2.3 Замечания
- При отключённом Redis все маршруты продолжают работать, читая из БД — поведение корректное.
- `cache.delByPattern('activity:*')` при каждой записи в ленту может быть тяжёлым при большой нагрузке; при необходимости можно инвалидировать только ключи вида `activity:feed:${userId}`.

---

## 3. Игровая механика

### 3.1 Check-in (мёртвый переключатель)
- Один check-in в день (по `last_streak_date` и текущей дате).
- Серия (streak): обновление `current_streak`, `longest_streak`, `last_streak_date`; учёт free skip.
- Бонусы REP за серию: 3d=5, 7d=15, 14d=30, 30d=100, 100d=500.
- XP: база 10 + comeback/reengagement/milestone/lucky/pulse_sync, с учётом множителя xp_boost_2x.
- Всё в одной транзакции, дубликат check-in в тот же день блокируется.

### 3.2 Дневные квесты
- Генерация в 00:00 UTC для всех пользователей (по расписанию в `index.js`).
- Типы и награды заданы в коде; при claim — REP и XP (с xp_boost_2x), кеш квестов инвалидируется.

### 3.3 Дуэли (beefs)
- Создание: начисление XP с множителем.
- Завершение: победитель/проигравший, обновление статуса; при просмотре публичного дуэля — репутация за просмотры (milestones).
- Таймер до дедлайна считается на фронте; бэкенд отдаёт `deadline`.

### 3.4 Письма (letters)
- Создание даёт XP с множителем. Разблокировка по дате; уведомление в Telegram и запись в `notification_events`.

### 3.5 Подарки (gifts)
- Стоимость в REP или из free gift balance; списание атомарное (FOR UPDATE). При claim — эффекты (xp_boost и т.д.), начисление REP получателю.

---

## 4. Система XP

### 4.1 Формулы
- **Уровень:** `level = floor(sqrt(experience / 100)) + 1` (`xpSystem.calculateLevel`).
- **Базы наград:** check_in 10, create_letter 25, create_duel 30, win_duel 50, invite_friend 100, daily_quest 15, update_profile 5, create_squad 20 (`xpSystem.XP_REWARDS`).

### 4.2 Где начисляется XP
- Check-in: база + бонусы, с xp_boost_2x.
- Письмо: создание (letters route), с множителем.
- Дуэль: создание (duels), с множителем.
- Победа в дуэле: в роуте duels при завершении.
- Реферал: invite_friend при создании сессии (index.js).
- Daily quest claim: в dailyQuests с множителем.
- Guide reward: 50 XP, один раз.
- Daily login loot: 5–15 случайно, раз в день.
- События (events): при claim награды.
- Достижения (achievements): при проверке в achievements.js.
- Подарок с эффектом xp_boost: в gifts при claim.

### 4.3 Консистентность (исправления)
- **total_xp_earned:** везде, где добавляется XP, теперь обновляется и `total_xp_earned` (в т.ч. daily-login-loot и guide-reward).
- **level:** при отдаче профиля уровень считается из `experience` в `profileService`, а не из поля `profiles.level` в БД — расхождение уровня и XP исключено.

### 4.4 spendable_xp
- Начисляется вместе с experience/total_xp_earned при выдаче XP. Тратится в магазине (store), Mystery Box; проверка лимита и атомарное списание через UPDATE с условием.

---

## 5. Уведомления

### 5.1 Системные (Telegram + notification_events)
- **Разблокировка письма:** уведомление в Telegram + запись в `notification_events` (unlock).
- **Риск серии (streak_risk):** если streak ≥ 3 и последний check-in вчера, не чаще раза в 12 часов — Telegram + запись (streak_risk).
- **Напоминание check-in:** при истечении таймера dead man switch, с учётом `checkin_reminder_interval_minutes` — Telegram + запись (checkin).
- Запуск: интервал `NOTIFY_INTERVAL_SECONDS` (по умолчанию 300), в цикле запросы к БД и отправка через бота. Учитываются `notifications_enabled` и `telegram_notifications_enabled`.

### 5.2 API уведомлений
- GET `/api/notifications` — список событий с пагинацией.
- POST `/api/notifications/mark-read` — пометить прочитанными (по id или все).

### 5.3 Ошибки и отображение на клиенте
- Бэкенд: единый формат ошибок `sendError(res, status, code, message, details)`; в production детали и стек не отдаются.
- Глобальный обработчик (errorHandler) обрабатывает AppError, Zod, PG 23xxx, ECONNREFUSED/ETIMEDOUT.
- Фронт: `apiRequest` в `utils/api.ts` возвращает `{ ok, error?, code?, details? }`; ретраи для 408, 5xx, TIMEOUT, NETWORK_ERROR; 429 не ретраится. Контекст `useApiError`/`showApiError` для показа пользователю.

---

## 6. Запросы к серверу и лимиты

### 6.1 Rate limit (express-rate-limit)
- **Глобальный:** 15 мин, 1200 запросов (или `RATE_LIMIT_GLOBAL_MAX`), ключ `x-session-id` или IP.
- **GET:** 15 мин, 800 (или `RATE_LIMIT_GET_MAX`), ключ session или IP.
- **POST:** 15 мин, 50.
- **/api/verify:** 10 мин, 30.
- **Создание писем:** 20 за 15 мин.
- **Создание дуэлей:** 10 за 15 мин.
- **Поиск:** 30 за 1 мин.
- Включён `trust proxy: 1` для корректного IP за Traefik/nginx.
- Заголовки: standardHeaders (RateLimit-*).

### 6.2 Free-tier лимиты
- Лимиты по типам (letters, duels и т.д.) и премиум-обход заданы в `middleware/freeTier.js`; в ответах выставляются заголовки X-RateLimit-Resource, X-RateLimit-Limit, X-RateLimit-Used, X-RateLimit-Remaining.

### 6.3 Количество запросов с фронта
- Landing тянет: profile, streak, letters, duels, daily-quests, events/active, ton/plans-summary, activity/feed, tournaments; плюс check-in и daily-login-loot по действиям. Зависимости эффектов исправлены (нет бесконечного цикла по `duelsResolvingToday`). Рекомендуется по возможности объединять запросы или кешировать на клиенте (например, профиль/настройки не дергать лишний раз при каждом переходе).

---

## 7. Рекомендации (кратко)

1. **БД:** при shutdown вызывать `pool.end()`. Дальше — версионированные миграции.
2. **Кеш:** при росте нагрузки уточнить инвалидацию `activity:*` (по пользователю, а не глобально).
3. **XP:** внесённые правки (total_xp_earned в daily-login-loot и guide-reward; level из experience в профиле) задеплоить.
4. **Уведомления:** логировать факт отправки/недоставки в Telegram (уже есть логи при ошибках).
5. **Метрики:** эндпоинты `/api/health` и `/api/metrics` (Prometheus) есть — использовать для мониторинга и алертов.
6. **Фронт:** единая точка входа API и ретраи уже есть; при 429 показывать пользователю понятное сообщение (например, через `useApiError` по `code === '429'`).

---

*Аудит выполнен по состоянию кода на момент проверки. Внесённые исправления отражены в коде (profile.js, profileService.js).*
