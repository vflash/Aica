# aica

**AI-ассистент мост между LLM в чате и локальной файловой системой разработчика.**

aica позволяет AI-агентам безопасно читать файлы проекта через HTTP API и предлагать изменения через систему патчей с подтверждением человеком.

## 🎯 Возможности

### Чтение файлов (HTTP API)
- `GET/POST /get-file` — получение содержимого файла
- `GET/POST /list-files` — список файлов в директории
- `GET/POST /grep` — поиск по содержимому файлов
- `GET/POST /file-info` — метаданные файла (размер, хэш, дата)
- `GET/POST /tree` — дерево каталогов

### Изменения файлов
- **patch** — применение unified diff
- **replace** — замена файла целиком
- **create** — создание нового файла
- **delete** — удаление файла
- **rename** — переименование
- **append** — дописать в конец
- **exec** — выполнение команд из whitelist
- **sequence** — последовательность действий

### Безопасность
- Whitelist путей (запрет node_modules, .env, .git, секретов)
- Whitelist команд для exec (npm test, npm run *, и т.д.)
- Авторизация через Bearer token или query parameter
- Экранирование ANSI escape последовательностей
- Критические правила против эмуляции ответов

### Дополнительно
- Автоматические бэкапы перед изменениями
- Логирование всех HTTP запросов с контекстом
- Поддержка AGENTS.md для контекста проекта
- Туннели: UPnP, cloudflared, localtunnel
- Стоп-фраза `~agent-stop` для завершения сессии
- Параметр `notify` для автоприменения без подтверждения

## 📦 Установка

```bash
git clone <repo> aica
cd aica
npm install
npm link   # для глобальной команды `aica`
```

## 🚀 Использование

### Базовый запуск

```bash
cd ~/projects/my-project
aica aidev
```

При запуске увидите:
```
╔══════════════════════════════════════════════════════════╗
║  🤖 aica — агент "aidev" запущен                         ║
║  📁 /home/user/projects/my-project                       ║
║  🌐 Локально: http://localhost:3000                      ║
║  🌍 Публично: https://xxx.trycloudflare.com              ║
║  🔑 Пароль: abc123xyz                                    ║
╚══════════════════════════════════════════════════════════╝

Скопируйте в чат с LLM:
────────────────────────────────────────
Используй aica-ассистента для работы с файлами проекта.
Твоя роль: aidev.
Сервер: https://xxx.trycloudflare.com
Пароль: abc123xyz
Используй доступные HTTP инструменты для запросов к серверу.
Получи справку: GET https://xxx.trycloudflare.com/help?password=abc123xyz
Следуй инструкциям из ответа сервера.
────────────────────────────────────────
```

### CLI флаги

```bash
aica <role> [options]

Опции:
  --port <number>         Порт сервера (по умолчанию: автовыбор от 3000)
  --url <url>             Использовать существующий URL туннеля
  --upnp                  Проброс порта через UPnP
  --ip                    Показать внешний IP без туннеля
  --cloudflared           Использовать cloudflared для туннеля
  --q-get                 Режим: только GET эндпоинты для чтения
  --q-post                Режим: только POST эндпоинты для чтения
  --q-mix                 Режим: GET и POST эндпоинты (по умолчанию)
  --auto                  Автоматическое применение патчей без подтверждения
```

### Примеры

```bash
# Базовый запуск
aica aidev

# С UPnP пробросом порта
aica aidev --upnp

# С cloudflared туннелем
aica aidev --cloudflared

# Только POST для чтения (безопаснее)
aica aidev --q-post

# Автоматическое применение патчей
aica aidev --auto

# Указать конкретный порт
aica aidev --port 8080

# Использовать существующий туннель
aica aidev --url https://my-tunnel.ngrok.io
```

## 🔧 HTTP API

### Авторизация

Два способа:
1. **Bearer token**: `Authorization: Bearer <password>`
2. **Query parameter**: `?password=<password>`

### Чтение файлов

#### GET /get-file
```bash
curl "http://localhost:3000/get-file?path=src/core.js&password=abc123"
```

#### POST /get-file
```bash
curl -X POST http://localhost:3000/get-file \
  -H "Authorization: Bearer abc123" \
  -H "Content-Type: application/json" \
  -d '{"path": "src/core.js", "reason": "Анализ функции"}'
```

Ответ:
```json
{
  "success": true,
  "content": "...",
  "size": 48523,
  "hash": "a1b2c3d4",
  "lines": 1490
}
```

### Создание патчей

#### POST /create-patch

**Одиночное действие:**
```json
{
  "action": "patch",
  "file": "src/core.js",
  "description": "Оптимизация функции",
  "reason": "Производительность",
  "content": "--- a/src/core.js\n+++ b/src/core.js\n...",
  "notify": true
}
```

**Последовательность действий:**
```json
{
  "action": "sequence",
  "description": "Оптимизация + тесты",
  "steps": [
    {"action": "patch", "file": "src/core.js", "content": "..."},
    {"action": "exec", "command": "npm test"},
    {"action": "exec", "command": "npm run lint"}
  ],
  "notify": true
}
```

Ответ:
```json
{
  "success": true,
  "id": 4342,
  "filename": "ai-patch-aidev.txt",
  "status": "pending"
}
```

### Получение справки

#### GET /help
```bash
curl "http://localhost:3000/help?password=abc123"
```

Возвращает markdown инструкцию для LLM.

## 📝 Формат файла патча

Файл: `ai-patch-{role}.txt`

```
Action: patch
File: src/core.js
Description: Замена String() на конкатенацию
Reason: Оптимизация

--- a/src/core.js
+++ b/src/core.js
@@ -150,3 +150,3 @@
-    return String(key)...
+    return ("" + key)...
```

### Sequence формат

```
Action: sequence
Description: Оптимизация + тесты

---
Action: patch
File: src/core.js

--- a/src/core.js
+++ b/src/core.js
@@ -150,3 +150,3 @@
-    return String(key)...
+    return ("" + key)...

---
Action: exec
Command: npm test
```

## 🔒 Безопасность

### Запрещённые пути
- `node_modules/`
- `.env`, `.env.*`
- `.git/`
- `.ai-log/`
- Файлы с `secret`, `password`, `token`, `key` в имени
- Пути вне рабочего каталога

### Whitelist команд (по умолчанию)
```
npm test
npm run *
npx jest
npx vitest
npx eslint *
npx tsc
yarn test
yarn run *
pnpm test
pnpm run *
```

### Кастомизация whitelist

Создайте `aica.config.json` в корне проекта:

```json
{
  "allowedCommands": [
    "npm test",
    "npm run lint",
    "npm run build",
    "docker compose up"
  ]
}
```

## 📊 Логирование

Все действия пишутся в `.ai-log/`:
- `requests.log` — HTTP запросы с комментариями агента
- `counter.txt` — счётчик ID патчей
- `*.applied_*` — применённые патчи
- `*.rejected_*` — отклонённые патчи
- `.backup_*` — бэкапы файлов

## 🛑 Остановка сессии

Для завершения работы агента в чате:

```
~agent-stop
```

LLM немедленно выйдет из роли агента.

## 📋 Workflow

```
1. LLM делает POST /help → получает инструкцию
2. LLM читает AGENTS.md (если есть) → POST /get-file
3. LLM анализирует код → POST /grep, /get-file
4. LLM хочет изменить → POST /create-patch
   → получает { id: 4342, status: "pending" }
5. Человек в консоли видит патч → Y/n
6. Человек копирует "applied:4342" → вставляет в чат
7. LLM видит результат → продолжает работу
```

## 🎨 Консольный UI

### При появлении патча
```
┌────────────────────────────────────────────────────────┐
│  📨 PATCH #4342  ai-patch-aidev.txt                    │
│  Замена String() на конкатенацию                       │
└────────────────────────────────────────────────────────┘
📁 Файл: src/core.js
💡 Причина: Оптимизация: конкатенация быстрее на 20-30%

📊 Изменения:
   📁 Файлов: 1
   🟢 Добавлено: +1
   🔴 Удалено: -1
   Файлы:
     • src/core.js

? Применить? [Y/n/q]
```

### После применения
```
✅ Патч применён

📤 Для чата
applied:4342
(скопируйте в чат)
```

## 🔧 Режимы работы

### GET режим (--q-get)
Только GET эндпоинты для чтения. Безопаснее, но менее гибко.

### POST режим (--q-post)
Только POST эндпоинты для чтения. Рекомендуется.

### Mixed режим (--q-mix)
GET и POST эндпоинты. По умолчанию.

### Auto режим (--auto)
Автоматическое применение патчей без подтверждения человека. Используйте с осторожностью!

## 🌐 Туннели

### UPnP
```bash
aica aidev --upnp
```
Автоматический проброс порта через UPnP на роутере.

### Cloudflared
```bash
aica aidev --cloudflared
```
Создаёт туннель через cloudflared (нужен установленный cloudflared).

### Внешний IP
```bash
aica aidev --ip
```
Показывает внешний IP без создания туннеля.

## 📁 Структура проекта

```
aica/
├── bin/
│   └── aica.js              # CLI точка входа
├── lib/
│   ├── actions.js           # выполнение действий
│   ├── backup.js            # бэкапы
│   ├── logger.js            # логирование
│   ├── parser.js            # парсер патчей
│   ├── password.js          # генерация паролей
│   ├── security.js          # валидация путей и команд
│   ├── server.js            # HTTP сервер
│   ├── tunnel.js            # туннели (UPnP, cloudflared)
│   └── ui.js                # консольный UI
├── package.json
└── README.md
```

## 📦 Зависимости

```json
{
  "chalk": "^5.3.0",
  "diff": "^5.2.0",
  "express": "^4.19.0",
  "nat-upnp": "^1.1.0"
}
```

## 🤝 Участие в разработке

1. Fork репозитория
2. Создайте ветку для фичи (`git checkout -b feature/amazing-feature`)
3. Commit изменения (`git commit -m 'Add amazing feature'`)
4. Push в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

MIT

## 🐛 Известные ограничения

- Один агент = одна роль (нельзя запустить два агента с одной ролью)
- При закрытии консоли сервер останавливается
- Туннели могут быть нестабильны при плохом интернете
- exec команды ограничены whitelist (по соображениям безопасности)

## 📞 Поддержка

Если нашли баг или есть предложение — создайте issue в репозитории.

---

**aica** — безопасный мост между AI и вашим кодом.
