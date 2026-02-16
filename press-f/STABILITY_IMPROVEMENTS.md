# План улучшений стабильности приложения

**Дата:** 16.02.2025  
**Цель:** Устранить утечки памяти, race conditions, setState после unmount, улучшить обработку ошибок.

---

## 1. Критические проблемы стабильности

### 1.1 setState после unmount (Search, Notifications, Squads, WitnessApproval)

**Проблема:** Компоненты делают async API-запросы без проверки `isMounted` и без `useApiAbort`. Если пользователь быстро переключается между экранами, запрос может завершиться после размонтирования → React предупреждение "Can't perform a React state update on an unmounted component".

**Экраны:**
- `Search.tsx` — `searchAPI.search()` без AbortSignal и isMounted
- `Notifications.tsx` — `notificationsAPI.list()`, `markRead()` без AbortSignal и isMounted
- `Squads.tsx` — `squadsAPI.get()`, `getLeaderboard()`, `join()`, `create()` без AbortSignal и isMounted
- `WitnessApproval.tsx` — `witnessesAPI.getAll()`, `create()`, `confirm()`, `delete()` без AbortSignal и isMounted

**Решение:** Добавить `useApiAbort()` и проверки `isMounted` во все async функции, которые вызывают `setState`.

---

### 1.2 Race conditions при быстром вводе (Search)

**Проблема:** В `Search.tsx` debounce 300ms, но если пользователь быстро печатает и уходит со страницы, несколько запросов могут завершиться в неправильном порядке → показываются устаревшие результаты.

**Решение:** Использовать `useRef` для отслеживания актуального запроса (requestId) и игнорировать устаревшие ответы.

---

### 1.3 localStorage без try-catch в некоторых местах

**Проблема:** В `App.tsx`, `Squads.tsx`, `WitnessApproval.tsx` есть прямые вызовы `localStorage.getItem/setItem/removeItem` без try-catch. При переполнении хранилища или приватном режиме может выбросить исключение → краш.

**Решение:** Обернуть все прямые вызовы localStorage в try-catch или использовать `storage.ts` утилиты, которые уже имеют защиту.

---

### 1.4 Отсутствие обработки offline/network errors

**Проблема:** Некоторые экраны (Search, Notifications, Squads, WitnessApproval) не показывают пользователю понятное сообщение при сетевой ошибке — только `console.error`.

**Решение:** Использовать `useApiError()` для показа глобального баннера ошибок или локальный state с сообщением.

---

### 1.5 Таймеры без cleanup (Landing, Store)

**Проблема:** В `Landing.tsx` есть таймеры для `homeValueSeenTimerRef`, в `Store.tsx` — множественные таймеры. При быстром переключении экранов таймеры могут продолжать работать и вызывать setState после unmount.

**Решение:** Убедиться, что все таймеры очищаются в cleanup `useEffect`.

---

## 2. Средние проблемы

### 2.1 Отсутствие debounce для некоторых действий

**Проблема:** В `CreateLetter.tsx` автосохранение черновика с debounce 500ms, но при быстром вводе может быть много вызовов `storage.saveDraft()`. В `Store.tsx` при клике на "Повторить" может быть несколько быстрых кликов → несколько запросов.

**Решение:** Добавить debounce/disable кнопки на время запроса.

---

### 2.2 Нет индикации загрузки для некоторых действий

**Проблема:** В `Squads.tsx`, `WitnessApproval.tsx` при создании/удалении нет локального loading state → пользователь может кликнуть несколько раз.

**Решение:** Добавить `isLoading` state и disable кнопок во время запроса.

---

### 2.3 Нет обработки квоты localStorage

**Проблема:** `storage.ts` имеет try-catch, но при переполнении кэш просто не сохраняется без уведомления. Пользователь не знает, что кэш не работает.

**Решение:** При ошибке записи в localStorage логировать предупреждение (в dev) или показывать fallback (показывать данные без кэша, но не крашить приложение).

---

## 3. Рекомендации по улучшению

### 3.1 Единый хук для безопасных async операций

Создать `useSafeAsync` hook, который:
- Автоматически проверяет `isMounted` перед setState
- Предоставляет AbortSignal
- Очищает таймеры при unmount

### 3.2 Retry с экспоненциальной задержкой

Для критичных операций (чек-ин, покупка) добавить retry с экспоненциальной задержкой вместо одного повтора.

### 3.3 Оптимистичные обновления UI

Для быстрых действий (mark as read, toggle favorite) делать оптимистичное обновление UI сразу, затем синхронизировать с сервером в фоне.

### 3.4 Виртуализация длинных списков

Если в будущем появятся списки с 100+ элементами (например, leaderboard), использовать виртуализацию (react-window или react-virtualized).

---

## 4. Приоритет исправлений

**Высокий (критично для стабильности):**
1. ✅ Search: useApiAbort + isMounted
2. ✅ Notifications: useApiAbort + isMounted
3. ✅ Squads: useApiAbort + isMounted
4. ✅ WitnessApproval: useApiAbort + isMounted
5. ✅ localStorage try-catch в App.tsx, Squads, WitnessApproval

**Средний:**
6. Race condition в Search (requestId)
7. Loading states в Squads/WitnessApproval
8. Debounce для повторных кликов

**Низкий:**
9. Обработка квоты localStorage
10. Оптимистичные обновления
