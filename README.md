PRESS F

TL;DR: PRESS F — это Telegram WebApp про тайники, дуэли и наследки. Работает как сейф с таймером, с публичной драмой и блокчейн‑доказательствами, но без слива контента. Быстро, дерзко и по делу 0)))

РУССКАЯ ВЕРСИЯ

PRESS F — Telegram WebApp про цифровые тайники, споры и выживание. Проект делался одним человеком, от сырой идеи до живого продукта. Без команды, без студии, только итерации, фиксы и постепенное наращивание смысла.

История развития по шагам. Сначала был простой прототип с письмами‑капсулами и таймером. Потом появились дуэли и публичная драматургия, чтобы у проекта появился характер. Дальше добавились профили, статистика и уведомления, чтобы всё стало “живым”. Затем пришли шеринг‑механики и инфо‑разделы, чтобы не объяснять в личку одно и то же. Последним слоем легла TON‑часть для наследок, escrow и вечного хранения.

Технически всё прямолинейно: фронт на Vite и React, бэк на Node и Express, Postgres как база, Redis и Bull для фоновых задач, Traefik с Let’s Encrypt для HTTPS. Пользователь входит через Telegram, бэк валидирует initData и выдаёт sessionId, дальше всё идёт через API. Контент лежит в базе, а WebApp живёт за прокси на /api и /bot.

Функционал без воды. Письма‑капсулы с датами открытия, история версий, экспорт. Дуэли и бифы с итогами и шерингом. Профиль, статка, уведомления, настройки. TON‑часть для наследок, escrow и “вечных” планов хранения.

Безопасность не на словах. Telegram initData проверяется на сервере, доступ к API только по sessionId, SSL от Let’s Encrypt, контент шифруется и не читается сервером. Мы не лезем в чужие записи, тут без сюрпризов 0)))

По TON и блокчейну. Идея простая: часть фактов фиксируется on‑chain, сам контент хранится off‑chain. Это даёт доказуемость без лишнего раскрытия, плюс нормальную юридическую логику для наследок и эскроу. Безопасность в том, что факт и время можно подтвердить, а содержание остаётся закрытым.

Стиль мемный и дерзкий, потому что так работает эта аудитория. Если где‑то слишком серьёзно — значит ещё не допилил.

Если упростить в одну фразу: PRESS F — это твой цифровой сейф и арена для разборок, завязанная на Telegram и живую культуру мемов 0)))

TL;DR: PRESS F is a Telegram WebApp for time‑locked vaults, beefs, and inheritance flows. It’s a secure drop system with blockchain proofs and zero content leaks. Fast, bold, straight to the point 0)))

ENGLISH VERSION

PRESS F is a Telegram WebApp about digital vaults, beefs, and survival. It was built by one dev, from a rough idea to a real product. No agency, no team, just grind, fixes, and steady growth.

Development history, step by step. It started as a simple time‑locked letters prototype. Then duels and public drama were added to give it a personality. After that came profiles, stats, and notifications to make the system feel alive. Sharing flows and info sections followed, so users didn’t need long explanations. The last layer was TON features: inheritance plans, escrow, and long‑term storage.

The stack is straightforward: Vite and React on the front, Node and Express on the back, Postgres for data, Redis and Bull for background tasks, Traefik with Let’s Encrypt for HTTPS. Users enter through Telegram, the backend validates initData and issues a sessionId, and everything goes through the API. Content lives in the database, and the app is proxied through /api and /bot.

Core features in plain terms. Time‑locked letters with version history and export. Duels with outcomes and sharing. Profile, stats, notifications, settings. TON layer for inheritance, escrow, and long‑term storage plans.

Security is taken seriously. Telegram initData is verified on the server, API access requires a sessionId, SSL is handled by Let’s Encrypt, and content is encrypted and not readable by us. We don’t peek into your data, promise 0)))

TON and blockchain. The idea is simple: keep proofs on‑chain and keep content off‑chain. This gives verifiability without overexposure, and supports inheritance and escrow flows. Security comes from provable facts and timestamps while the content stays sealed.

The tone is intentionally memey and bold because it matches the audience. If something sounds too serious, it probably needs another pass 0)))

In one sentence: PRESS F is your digital vault and your arena for public drama, built around Telegram and meme culture 0)))
