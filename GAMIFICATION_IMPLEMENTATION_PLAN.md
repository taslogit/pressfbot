# 🚀 ПЛАН РЕАЛИЗАЦИИ ГЕЙМИФИКАЦИИ
## Технический план внедрения retention-механик

---

## ФАЗА 1: БЫСТРЫЙ WIN (1-2 недели)

### 1. СТРИКИ (STREAKS) - КРИТИЧНО ДЛЯ RETENTION

#### Backend изменения:
**Файл:** `server/migrations.js`
```sql
-- Добавить в user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS last_streak_date DATE;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS streak_free_skip INTEGER DEFAULT 0; -- Купленные пропуски
```

**Файл:** `server/routes/profile.js`
- При check-in проверять дату последнего чек-ина
- Если прошло > 1 дня - сброс стрика (или использование пропуска)
- Если прошло = 1 день - +1 к стрику
- Обновлять longest_streak если текущий больше
- Начислять бонусы за стрики (3, 7, 14, 30, 100 дней)

**API endpoint:**
```javascript
// GET /api/profile/streak
// Возвращает: { current: 7, longest: 12, nextBonus: { days: 7, reward: 15 } }
```

#### Frontend изменения:
**Файл:** `press-f/screens/Landing.tsx`
- Добавить визуальный индикатор стрика на главной
- Показывать прогресс до следующего бонуса
- Анимация при увеличении стрика

**Файл:** `press-f/types.ts`
```typescript
export interface StreakInfo {
  current: number;
  longest: number;
  lastStreakDate: string;
  nextBonus?: {
    days: number;
    reward: number;
  };
  freeSkips: number;
}
```

**Файл:** `press-f/utils/storage.ts`
- Добавить функции для работы со стриками
- Кэширование стрика в localStorage

---

### 2. ЕЖЕДНЕВНЫЕ ЗАДАНИЯ (DAILY QUESTS)

#### Backend изменения:
**Файл:** `server/migrations.js`
```sql
CREATE TABLE IF NOT EXISTS daily_quests (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL,
  quest_type VARCHAR(50) NOT NULL, -- 'create_letter', 'check_in', 'create_duel', etc.
  target_count INTEGER DEFAULT 1,
  current_count INTEGER DEFAULT 0,
  reward INTEGER DEFAULT 10, -- Reputation
  quest_date DATE NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  is_claimed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_daily_quests_user_date ON daily_quests(user_id, quest_date);
```

**Файл:** `server/routes/profile.js`
- Endpoint: `GET /api/profile/daily-quests` - получить задания на сегодня
- Endpoint: `POST /api/profile/daily-quests/:id/claim` - забрать награду
- Логика генерации 3 случайных заданий каждый день
- Обновление прогресса при действиях пользователя

**Файл:** `server/index.js` или отдельный сервис
- Job для генерации заданий в 00:00 UTC
- Обновление прогресса заданий при событиях

#### Frontend изменения:
**Файл:** `press-f/screens/Landing.tsx`
- Компонент "Ежедневные задания" на главной
- Визуальный прогресс выполнения
- Кнопка "Забрать награду"

**Файл:** `press-f/components/DailyQuests.tsx` (новый)
- Список заданий
- Прогресс-бары
- Анимации при выполнении

**Файл:** `press-f/types.ts`
```typescript
export interface DailyQuest {
  id: string;
  type: 'create_letter' | 'check_in' | 'create_duel' | 'win_duel' | 'invite_friend' | 'update_profile' | 'create_squad';
  title: string;
  description: string;
  targetCount: number;
  currentCount: number;
  reward: number;
  isCompleted: boolean;
  isClaimed: boolean;
  questDate: string;
}
```

---

### 3. РАСШИРЕННАЯ СИСТЕМА УРОВНЕЙ И ОПЫТА

#### Backend изменения:
**Файл:** `server/migrations.js`
```sql
-- Добавить в profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS experience INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS total_xp_earned INTEGER DEFAULT 0;
```

**Файл:** `server/routes/profile.js`
- Функция расчета уровня на основе опыта
- Начисление опыта при действиях:
  - Check-in: +10 XP
  - Создание письма: +25 XP
  - Создание бифа: +30 XP
  - Выигрыш бифа: +50 XP
  - Приглашение друга: +100 XP
  - Ежедневные задания: +15-30 XP

**Формула уровня:**
```javascript
function calculateLevel(xp) {
  // Квадратичная прогрессия
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

function xpForLevel(level) {
  return Math.pow(level - 1, 2) * 100;
}
```

#### Frontend изменения:
**Файл:** `press-f/screens/Profile.tsx`
- Визуальный прогресс-бар уровня
- Показывать XP до следующего уровня
- Анимация при повышении уровня
- Показывать титулы по уровням

**Файл:** `press-f/utils/levelSystem.ts` (новый)
```typescript
export const LEVEL_TITLES = {
  1: 'Новичок',
  5: 'Ученик',
  10: 'Опытный',
  15: 'Ветеран',
  20: 'Мастер',
  25: 'Эксперт',
  30: 'Легенда',
  35: 'Миф',
  40: 'Бессмертный',
  50: 'Бог'
};

export function calculateLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

export function xpForLevel(level: number): number {
  return Math.pow(level - 1, 2) * 100;
}

export function getTitleForLevel(level: number): string {
  const titles = Object.keys(LEVEL_TITLES).map(Number).sort((a, b) => b - a);
  const titleLevel = titles.find(t => level >= t) || 1;
  return LEVEL_TITLES[titleLevel];
}
```

---

## ФАЗА 2: СОЦИАЛЬНЫЕ МЕХАНИКИ (2-4 недели)

### 4. РЕФЕРАЛЬНАЯ СИСТЕМА

#### Backend изменения:
**Файл:** `server/migrations.js`
```sql
-- Добавить в profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referred_by BIGINT; -- ID пользователя который пригласил
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS referrals_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS referral_events (
  id UUID PRIMARY KEY,
  referrer_id BIGINT NOT NULL,
  referred_id BIGINT NOT NULL,
  reward_given BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

CREATE INDEX idx_referral_events_referrer ON referral_events(referrer_id);
```

**Файл:** `server/index.js` (verify endpoint)
- При создании сессии проверять start_param на `ref_XXXXX`
- Если есть - сохранять referred_by
- Генерировать уникальный referral_code для каждого пользователя

**Файл:** `server/routes/profile.js`
- Endpoint: `GET /api/profile/referral` - получить свою реферальную ссылку и статистику
- Endpoint: `GET /api/profile/referrals` - список приглашенных
- Начисление наград при регистрации по реферальной ссылке

#### Frontend изменения:
**Файл:** `press-f/screens/Profile.tsx`
- Раздел "Пригласи друзей"
- Показывать реферальную ссылку
- QR-код для реферальной ссылки
- Статистика приглашенных
- Прогресс до бонусов

**Файл:** `press-f/components/ReferralSection.tsx` (новый)
- Компонент с реферальной ссылкой
- Кнопка "Скопировать"
- Кнопка "Поделиться в Telegram"

---

### 5. ПУБЛИЧНЫЕ БИФЫ С ХАЙПОМ

#### Backend изменения:
**Файл:** `server/migrations.js`
```sql
-- Добавить в duels
ALTER TABLE duels ADD COLUMN IF NOT EXISTS views_count INTEGER DEFAULT 0;
ALTER TABLE duels ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMP;
```

**Файл:** `server/routes/duels.js`
- Endpoint: `POST /api/duels/:id/view` - увеличить счетчик просмотров
- Endpoint: `GET /api/duels/hype` - получить топ публичных бифов
- Начисление репутации за просмотры (100, 500, 1000)

#### Frontend изменения:
**Файл:** `press-f/screens/Duels.tsx`
- Вкладка "Хайп" с топом бифов
- Счетчик просмотров на публичных бифах
- Анимация при достижении milestones (100, 500, 1000 просмотров)

---

## ФАЗА 3: ДОЛГОСРОЧНЫЕ МЕХАНИКИ (1-2 месяца)

### 6. СЕЗОННЫЕ СОБЫТИЯ

#### Backend изменения:
**Файл:** `server/migrations.js`
```sql
CREATE TABLE IF NOT EXISTS seasonal_events (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  config JSONB, -- Задания, награды
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_event_progress (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL,
  event_id UUID NOT NULL,
  progress JSONB DEFAULT '{}', -- Прогресс по заданиям
  rewards_claimed TEXT[], -- ID наград которые забрали
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, event_id)
);
```

**Файл:** `server/routes/events.js` (новый)
- Endpoint: `GET /api/events/active` - получить активные события
- Endpoint: `GET /api/events/:id/progress` - прогресс пользователя
- Endpoint: `POST /api/events/:id/claim` - забрать награду

---

## 📋 ПРИОРИТЕТНЫЙ СПИСОК РЕАЛИЗАЦИИ

### НЕДЕЛЯ 1-2:
1. ✅ Стрики (STREAKS) - backend + frontend
2. ✅ Ежедневные задания - backend + frontend
3. ✅ Система опыта и уровней - backend + frontend

### НЕДЕЛЯ 3-4:
4. ✅ Реферальная система - backend + frontend
5. ✅ Публичные бифы с хайпом - backend + frontend
6. ✅ Система подарков - backend + frontend

### НЕДЕЛЯ 5-8:
7. ✅ Сезонные события - backend + frontend
8. ✅ Турниры - backend + frontend
9. ✅ Лента активности - backend + frontend

---

## 🎯 МЕТРИКИ ДЛЯ ОТСЛЕЖИВАНИЯ

**Добавить в аналитику:**
- Количество пользователей с стриком 7+ дней
- Средний стрик пользователя
- Процент выполнения ежедневных заданий
- Количество рефералов на пользователя
- Средний уровень пользователей
- Время в приложении до/после внедрения

---

## 💻 БЫСТРЫЙ СТАРТ - КОД ДЛЯ СТРИКОВ

### Backend (server/routes/profile.js):
```javascript
// При check-in
router.post('/check-in', async (req, res) => {
  const userId = req.userId;
  const today = new Date().toISOString().split('T')[0];
  
  // Получить текущие настройки
  const settings = await pool.query(
    'SELECT * FROM user_settings WHERE user_id = $1',
    [userId]
  );
  
  const lastStreakDate = settings.rows[0]?.last_streak_date;
  const currentStreak = settings.rows[0]?.current_streak || 0;
  const freeSkips = settings.rows[0]?.streak_free_skip || 0;
  
  let newStreak = currentStreak;
  let usedSkip = false;
  
  if (lastStreakDate) {
    const lastDate = new Date(lastStreakDate);
    const daysDiff = Math.floor((new Date(today) - lastDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 1) {
      // Продолжение стрика
      newStreak = currentStreak + 1;
    } else if (daysDiff > 1) {
      // Пропуск дня
      if (freeSkips > 0 && daysDiff === 2) {
        // Использовать пропуск
        newStreak = currentStreak + 1;
        usedSkip = true;
        await pool.query(
          'UPDATE user_settings SET streak_free_skip = streak_free_skip - 1 WHERE user_id = $1',
          [userId]
        );
      } else {
        // Сброс стрика
        newStreak = 1;
      }
    }
  } else {
    // Первый чек-ин
    newStreak = 1;
  }
  
  // Обновить longest_streak если нужно
  const longestStreak = settings.rows[0]?.longest_streak || 0;
  if (newStreak > longestStreak) {
    await pool.query(
      'UPDATE user_settings SET longest_streak = $1 WHERE user_id = $2',
      [newStreak, userId]
    );
  }
  
  // Начислить бонусы за стрики
  let streakBonus = 0;
  if (newStreak === 3) streakBonus = 5;
  else if (newStreak === 7) streakBonus = 15;
  else if (newStreak === 14) streakBonus = 30;
  else if (newStreak === 30) streakBonus = 100;
  else if (newStreak === 100) streakBonus = 500;
  
  if (streakBonus > 0) {
    await pool.query(
      'UPDATE profiles SET reputation = reputation + $1 WHERE user_id = $2',
      [streakBonus, userId]
    );
  }
  
  // Обновить стрик
  await pool.query(
    `UPDATE user_settings 
     SET current_streak = $1, last_streak_date = $2, last_check_in = now() 
     WHERE user_id = $3`,
    [newStreak, today, userId]
  );
  
  return res.json({
    ok: true,
    streak: newStreak,
    bonus: streakBonus,
    usedSkip
  });
});
```

---

**Готов начать реализацию с самых критичных механик!**
