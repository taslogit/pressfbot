# Press F — Roadmap исправлений и улучшений

## Фаза 1: Критичные баги (сделано)

- [x] **MainButton SEND** — CreateLetter подписан на `pressf:send-letter`
- [x] **FuneralDJ** — синхронизация выбора с сервером
- [x] **Названия аватаров на витрине** — Bone Lord, AFK Phantom, Tin Can, Crown Royal
- [x] **Draft: сохранение attachments** — метаданные (type, id), файлы перевыбираются при restore

## Фаза 2: UX и консистентность

- [ ] Удалить/обернуть console.log для production
- [ ] Обработка ошибок сети (toast при падении API)
- [ ] Дублирование роутов в App (index и /)

## Фаза 3: Техдолг

- [ ] Интеграционные тесты letters (починить timeout/503)
- [ ] Очистка orphan attachments (cron для temp/)
- [ ] checkQuestTrigger — удалить или реализовать

## Фаза 4: Улучшения

- [ ] Обновить README под стек (Vite, Telegram, Express)
- [ ] Funeral tracks — проверить лицензии Mixkit
- [ ] Ghost Profile: F counter persistence (опционально)
