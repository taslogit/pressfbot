# 🚨 КРИТИЧНЫЕ ИСПРАВЛЕНИЯ - БЫСТРЫЙ СПИСОК

## 🔴 КРИТИЧНО - ИСПРАВИТЬ СЕГОДНЯ

### 1. CORS - Убрать `*`
**Файл:** `server/index.js:152`
```javascript
// БЫЛО:
res.header('Access-Control-Allow-Origin', '*');

// ДОЛЖНО БЫТЬ:
const allowedOrigins = [
  process.env.WEB_APP_URL,
  'https://pressfbot.ru'
].filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  // ... остальное
});
```

### 2. Session ID из Query - УБРАТЬ
**Файл:** `server/middleware/auth.js:15`
```javascript
// БЫЛО:
const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId || req.query?.sessionId;

// ДОЛЖНО БЫТЬ:
const sessionId = req.headers['x-session-id'] || req.cookies?.sessionId;
```

### 3. Не сохранять init_data в БД
**Файл:** `server/index.js:485`
```javascript
// БЫЛО:
await pool.query(
  'INSERT INTO sessions(id, telegram_id, init_data, expires_at, last_seen_at) VALUES($1, $2, $3, $4, now())',
  [sessionId, tgUserId, initData, expiresAt]
);

// ДОЛЖНО БЫТЬ:
await pool.query(
  'INSERT INTO sessions(id, telegram_id, expires_at, last_seen_at) VALUES($1, $2, $3, now())',
  [sessionId, tgUserId, expiresAt]
);
```

### 4. Rate Limiting на все эндпоинты
**Файл:** `server/index.js` - добавить после строки 148
```javascript
const letterCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many letters created'
});

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30
});

// Применить к роутам
app.use('/api/letters', letterCreateLimiter);
app.use('/api/search', searchLimiter);
```

### 5. Security Headers
**Файл:** `server/index.js` - добавить после helmet()
```javascript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
```

---

## 🟡 ВЫСОКИЙ ПРИОРИТЕТ - ЭТА НЕДЕЛЯ

### 6. Database Connection Pool
```javascript
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### 7. Составные индексы
**Файл:** `server/migrations.js` - добавить в createTables()
```sql
CREATE INDEX IF NOT EXISTS idx_letters_user_status_created 
ON letters(user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_duels_user_status 
ON duels(challenger_id, status, created_at DESC);
```

### 8. Лимит размера контента
**Файл:** `server/validation/index.js`
```javascript
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

const letterSchema = z.object({
  content: z.string().max(MAX_CONTENT_SIZE),
  attachments: z.array(z.string()).max(10)
});
```

---

## 📋 ЧЕКЛИСТ ДЛЯ DEPLOY

- [ ] CORS исправлен
- [ ] Session ID убран из query
- [ ] init_data не сохраняется
- [ ] Rate limiting добавлен
- [ ] Security headers добавлены
- [ ] Database pool настроен
- [ ] Индексы добавлены
- [ ] Лимиты на размер контента
- [ ] `.env` проверен (нет секретов в Git)
- [ ] HTTPS работает
- [ ] Бэкапы БД настроены

---

## 🔧 БЫСТРЫЕ КОМАНДЫ ДЛЯ ПРОВЕРКИ

```bash
# Проверить что нет секретов в Git
git grep -i "TELEGRAM_BOT_TOKEN\|DATABASE_URL\|REDIS_URL" -- "*.js" "*.ts" "*.json"

# Проверить CORS
curl -H "Origin: https://evil.com" -I https://pressfbot.ru/api/health

# Проверить rate limiting
for i in {1..350}; do curl https://pressfbot.ru/api/health; done
```
