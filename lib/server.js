import express from 'express';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import chalk from 'chalk';
import { validatePath, validateCommand, loadAllowedCommands } from './security.js';
import { Logger } from './logger.js';
import { parseActionFile } from './parser.js';
import { ActionExecutor, SequenceError } from './actions.js';
import { showPatchUI, showSequenceUI, showResult, ask } from './ui.js';

export async function startServer({ workdir, role, password, port, listenHost = '127.0.0.1', requestMode = 'mixed', autoMode = false, publicUrl }) {
    const app = express();
    app.use(express.json({ limit: '10mb' }));

    const logger = new Logger(workdir);
    const logDir = path.join(workdir, '.ai-log');
    const executor = new ActionExecutor(workdir, logDir);
    const allowedCommands = loadAllowedCommands(workdir);

    const agentsMdPath = path.join(workdir, 'AGENTS.md');
    const hasAgentsMd = fs.existsSync(agentsMdPath);

    let patchQueue = Promise.resolve();

    // Auth middleware
    const auth = (req, res, next) => {
        const queryPassword = req.query.password;
        const headerToken = req.headers.authorization?.replace('Bearer ', '');

        if (queryPassword === password || headerToken === password) {
            return next();
        }

        return res.status(401).json({ error: 'Unauthorized' });
    };

    app.use(auth);

    app.use((req, res, next) => {
        if (req.path !== '/help') {
            // Для GET запросов параметры в query, для POST - в body
            const logData = req.method === 'GET'
                ? { ...req.query, ...req.body }
                : { ...req.body, ...req.query };
            logger.logRequest(req.method, req.path, logData);
        }
        next();
    });

    // Генерация markdown help в зависимости от режима
    function generateHelpMarkdown() {
        let md = `# aica-агент ${role}\n\n`;

        md += `## Режим: ${requestMode}${autoMode ? ' (автономный)' : ''}\n\n`;

        md += `## Новые методы\n\n`;
        
        md += `### /ping - Health check\n`;
        md += `- \`GET ${getServerUrl()}/ping?password=${password}\` — возвращает "pong"\n`;
        md += `- \`POST ${getServerUrl()}/ping?password=${password}\` — возвращает "pong"\n\n`;
        
        md += `### /list-patches - История патчей\n`;
        md += `- \`GET ${getServerUrl()}/list-patches?password=${password}&limit=50\` — список последних патчей\n`;
        md += `- \`POST ${getServerUrl()}/list-patches\` с body \`{"limit": 50}\`\n\n`;
        md += `Возвращает список патчей из .ai-log с информацией о статусе (applied/rejected/error/partial), времени и размере.\n\n`;
        
        md += `### /rollback - Откат патча\n`;
        md += `- \`POST ${getServerUrl()}/rollback\` с body:\n`;
        md += `\`\`\`json\n`;
        md += `{\n`;
        md += `  "file": "путь/к/файлу",\n`;
        md += `  "patchId": "опционально"\n`;
        md += `}\n`;
        md += `\`\`\`\n`;
        md += `Восстанавливает файл из последнего бэкапа. Используется для отката ошибочных изменений.\n\n`;
        
        md += `### /diff - Сравнение файлов\n`;
        md += `- \`GET ${getServerUrl()}/diff?password=${password}&path1=file1.js&path2=file2.js\`\n`;
        md += `- \`POST ${getServerUrl()}/diff\` с body \`{"path1": "file1.js", "path2": "file2.js"}\`\n\n`;
        md += `Показывает различия между двумя файлами в формате unified diff.\n\n`;
        
        md += `### Dry-run режим для /create-patch\n`;
        md += `Добавь \`"dry_run": true\` в body для проверки валидности патча без применения:\n`;
        md += `\`\`\`json\n`;
        md += `{\n`;
        md += `  "action": "patch",\n`;
        md += `  "file": "lib/server.js",\n`;
        md += `  "content": "...",\n`;
        md += `  "dry_run": true\n`;
        md += `}\n`;
        md += `\`\`\`\n\n`;
        md += `Возвращает результат валидации без создания файла и применения изменений.\n\n`;
        
        md += `## Авторизация\n`;
        md += `Пароль можно передавать двумя способами:\n`;
        md += `1. В URL: \`?password=${password}\`\n`;
        md += `2. В заголовке: \`Authorization: Bearer ${password}\`\n\n`;

        if (requestMode === 'post') {
            // POST режим
            md += `## Чтение файлов\n`;
            md += `Все запросы через POST с JSON body.\n`;
            md += `Авторизация: \`Authorization: Bearer ${password}\`\n\n`;
            md += `Примеры:\n`;
            md += `\`\`\`bash\n`;
            md += `curl -X POST ${getServerUrl()}/help -H "Authorization: Bearer ${password}"\n`;
            md += `curl -X POST ${getServerUrl()}/get-file -H "Authorization: Bearer ${password}" -d '{"path":"lib/server.js"}'\n`;
            md += `curl -X POST ${getServerUrl()}/list-files -H "Authorization: Bearer ${password}" -d '{"path":".","recursive":false}'\n`;
            md += `curl -X POST ${getServerUrl()}/grep -H "Authorization: Bearer ${password}" -d '{"pattern":"TODO","path":"."}'\n`;
            md += `curl -X POST ${getServerUrl()}/tree -H "Authorization: Bearer ${password}" -d '{"path":".","depth":2}'\n`;
            md += `\`\`\`\n\n`;
        } else {
            // GET или mixed режим
            md += `## Чтение файлов\n`;
            md += `Все запросы через GET с password в query параметре.\n\n`;
            md += `Примеры:\n`;
            md += `- \`GET ${getServerUrl()}/help?password=${password}\` — эта инструкция\n`;
            md += `- \`GET ${getServerUrl()}/get-file?path=lib/server.js&password=${password}\` — прочитать файл\n`;
            md += `- \`GET ${getServerUrl()}/list-files?path=.&recursive=false&password=${password}\` — список файлов\n`;
            md += `- \`GET ${getServerUrl()}/grep?pattern=TODO&path=.&password=${password}\` — поиск в файлах\n`;
            md += `- \`GET ${getServerUrl()}/tree?path=.&depth=2&password=${password}\` — дерево проекта\n\n`;
        }

        md += `## Изменения\n`;
        md += `Метод: POST /create-patch\n`;
        md += `Авторизация: \`Authorization: Bearer ${password}\`\n\n`;
        md += `Body:\n`;
        md += `\`\`\`json\n`;
        md += `{\n`;
        md += `  "action": "patch|replace|create|delete|rename|append|exec|sequence",\n`;
        md += `  "file": "путь/к/файлу",\n`;
        md += `  "description": "что делаешь",\n`;
        md += `  "reason": "почему (опционально)",\n`;
        md += `  "content": "diff или содержимое"\n`;
        md += `}\n`;
        md += `\`\`\`\n\n`;

        md += `Доступные actions:\n`;
        md += `- \`patch\` — unified diff\n`;
        md += `- \`replace\` — замена файла\n`;
        md += `- \`create\` — создание файла\n`;
        md += `- \`delete\` — удаление файла\n`;
        md += `- \`rename\` — переименование (добавь "to": "новый_путь")\n`;
        md += `- \`append\` — дописать в конец\n`;
        md += `- \`exec\` — команда из whitelist (добавь "command": "...")\n`;
        md += `- \`sequence\` — последовательность (добавь "steps": [...])\n\n`;

        md += `## Whitelist команд\n`;
        for (const cmd of allowedCommands) {
            md += `- ${cmd}\n`;
        }
        md += `\n`;

        md += `## Правила\n`;
        md += `Не трогай node_modules, .env, .git, .ai-log\n`;
        md += `Стоп-фраза: ~aica-stop\n`;
        md += `Старт-фраза: ~aica-start\n`;
        md += `\n`;
        md += `Критические правила:\n`;
        md += `- НЕ ЗАБЫВАЙ: aica-сервер — твой инструмент для файлов, он избавляет пользователя от ручной работы.\n`;
        md += `- НИКОГДА: не эмулируй ответы сервера, делай только реальные запросы на сервер aica\n`;
        md += `- ЗАПОМНИ какой инструмент использовал для запроса к этому ресурсу и используй его\n`;
        md += `- Если сервер недоступен — честно сообщи\n`;
        md += `- Если человек не прислал результат — жди\n`;
        md += `- Запрещено додумывать содержимое файлов\n`;
        md += `- После мышления обнови инструкции /help \n`;

        if (hasAgentsMd) {
            md += `\n## Контекст проекта\n`;
            md += `Прочитай AGENTS.md в корне проекта и жди дальнейших инструкции\n`;
        }

        return md;
    }

    function getServerUrl() {
        // Универсальная обработка URL с автоматическим добавлением протокола
        let url = publicUrl || 'server';

        // Если протокол не указан, добавляем http:// по умолчанию
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'http://' + url;
        }

        return url;
    }

    // HELP — markdown для LLM, JSON для программных клиентов
    app.get('/help', (req, res) => {
        const accept = req.headers.accept || '';

        if (accept.includes('application/json')) {
            return res.json({ success: true, help: { role, mode: requestMode, autoMode } });
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(generateHelpMarkdown());
    });

    app.post('/help', (req, res) => {
        const accept = req.headers.accept || '';

        if (accept.includes('application/json')) {
            return res.json({ success: true, help: { role, mode: requestMode, autoMode } });
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(generateHelpMarkdown());
    });

    // PING - health check
    app.get('/ping', (req, res) => {
        return res.send('pong');
    });

    app.post('/ping', (req, res) => {
        return res.send('pong');
    });

    // LIST-PATCHES - список патчей из истории
    app.get('/list-patches', (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 50;
            const patches = listPatches(logDir, limit);
            return res.json({ success: true, patches, count: patches.length });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    app.post('/list-patches', (req, res) => {
        try {
            const limit = req.body.limit || 50;
            const patches = listPatches(logDir, limit);
            return res.json({ success: true, patches, count: patches.length });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    // ROLLBACK - откат патча
    app.post('/rollback', async (req, res) => {
        try {
            const { patchId, file } = req.body;
            
            if (!file) {
                return res.json({ success: false, error: 'file is required' });
            }

            const abs = validatePath(file, workdir);
            const result = executor.backup.restore(abs);
            
            logger.logRequest('POST', '/rollback', { file, patchId });
            
            return res.json({
                success: true,
                message: 'File restored from backup',
                file: file,
                backupFile: path.basename(result)
            });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    // DIFF - сравнение двух файлов или версий
    app.get('/diff', (req, res) => {
        try {
            const { path1, path2 } = req.query;
            
            if (!path1 || !path2) {
                return res.json({ success: false, error: 'path1 and path2 are required' });
            }

            const abs1 = validatePath(path1, workdir);
            const abs2 = validatePath(path2, workdir);

            if (!fs.existsSync(abs1)) {
                return res.json({ success: false, error: 'file1 not found' });
            }
            if (!fs.existsSync(abs2)) {
                return res.json({ success: false, error: 'file2 not found' });
            }

            const content1 = fs.readFileSync(abs1, 'utf8');
            const content2 = fs.readFileSync(abs2, 'utf8');
            
            const diff = generateDiff(content1, content2, path1, path2);
            
            return res.json({
                success: true,
                diff: diff,
                path1: path1,
                path2: path2
            });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    app.post('/diff', (req, res) => {
        try {
            const { path1, path2 } = req.body;
            
            if (!path1 || !path2) {
                return res.json({ success: false, error: 'path1 and path2 are required' });
            }

            const abs1 = validatePath(path1, workdir);
            const abs2 = validatePath(path2, workdir);

            if (!fs.existsSync(abs1)) {
                return res.json({ success: false, error: 'file1 not found' });
            }
            if (!fs.existsSync(abs2)) {
                return res.json({ success: false, error: 'file2 not found' });
            }

            const content1 = fs.readFileSync(abs1, 'utf8');
            const content2 = fs.readFileSync(abs2, 'utf8');
            
            const diff = generateDiff(content1, content2, path1, path2);
            
            return res.json({
                success: true,
                diff: diff,
                path1: path1,
                path2: path2
            });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    // GET эндпоинты для чтения
    if (requestMode === 'get' || requestMode === 'mixed') {
        app.get('/get-file', (req, res) => {
            try {
                const abs = validatePath(req.query.path, workdir);
                if (!fs.existsSync(abs)) return res.json({ success: false, error: 'file_not_found' });
                const content = fs.readFileSync(abs, 'utf8');
                const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
                return res.json({ success: true, content, size: content.length, hash, lines: content.split('\n').length });
            } catch (e) {
                return res.json({ success: false, error: e.message });
            }
        });

        app.get('/list-files', (req, res) => {
            try {
                const abs = validatePath(req.query.path, workdir);
                const recursive = req.query.recursive === 'true';
                const files = listFiles(abs, recursive);
                return res.json({ success: true, files });
            } catch (e) {
                return res.json({ success: false, error: e.message });
            }
        });

        app.get('/grep', (req, res) => {
            try {
                const abs = validatePath(req.query.path, workdir);
                const regex = req.query.regex === 'true';
                const matches = grepFiles(abs, req.query.pattern, regex);
                return res.json({ success: true, matches, count: matches.length });
            } catch (e) {
                return res.json({ success: false, error: e.message });
            }
        });

        app.get('/file-info', (req, res) => {
            try {
                const abs = validatePath(req.query.path, workdir);
                const stat = fs.statSync(abs);
                const content = fs.readFileSync(abs, 'utf8');
                const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
                return res.json({ success: true, size: stat.size, modified: stat.mtime.toISOString(), hash, lines: content.split('\n').length });
            } catch (e) {
                return res.json({ success: false, error: e.message });
            }
        });

        app.get('/tree', (req, res) => {
            try {
                const abs = validatePath(req.query.path, workdir);
                const depth = parseInt(req.query.depth) || 3;
                const tree = buildTree(abs, depth);
                return res.json({ success: true, tree });
            } catch (e) {
                return res.json({ success: false, error: e.message });
            }
        });
    }

    // POST эндпоинты для чтения (всегда доступны)
    app.post('/get-file', (req, res) => {
        try {
            const abs = validatePath(req.body.path, workdir);
            if (!fs.existsSync(abs)) return res.json({ success: false, error: 'file_not_found' });
            const content = fs.readFileSync(abs, 'utf8');
            const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
            return res.json({ success: true, content, size: content.length, hash, lines: content.split('\n').length });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    app.post('/list-files', (req, res) => {
        try {
            const abs = validatePath(req.body.path, workdir);
            const files = listFiles(abs, req.body.recursive || false);
            return res.json({ success: true, files });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    app.post('/grep', (req, res) => {
        try {
            const abs = validatePath(req.body.path, workdir);
            const matches = grepFiles(abs, req.body.pattern, req.body.regex);
            return res.json({ success: true, matches, count: matches.length });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    app.post('/file-info', (req, res) => {
        try {
            const abs = validatePath(req.body.path, workdir);
            const stat = fs.statSync(abs);
            const content = fs.readFileSync(abs, 'utf8');
            const hash = createHash('md5').update(content).digest('hex').slice(0, 8);
            return res.json({ success: true, size: stat.size, modified: stat.mtime.toISOString(), hash, lines: content.split('\n').length });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });
            
            // Dry-run режим
            if (body.dry_run === true) {
                return await dryRunPatch(body, workdir, role, logger, executor, allowedCommands, res);
            }

    app.post('/tree', (req, res) => {
        try {
            const abs = validatePath(req.body.path, workdir);
            const tree = buildTree(abs, req.body.depth || 3);
            return res.json({ success: true, tree });
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    // POST /create-patch (всегда POST)
    app.post('/create-patch', async (req, res) => {
        try {
            const body = req.body;

            if (!body.action) {
                return res.json({ success: false, error: 'parse_error: missing action' });
            }

            if (body.action === 'sequence') {
                return await createAndProcessSequence(body, workdir, role, logger, executor, allowedCommands, res, autoMode, patchQueue, (q) => { patchQueue = q; });
            }

            return await createAndProcessSingle(body, workdir, role, logger, executor, allowedCommands, res, autoMode, patchQueue, (q) => { patchQueue = q; });

        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    });

    return new Promise((resolve) => {
        const server = app.listen(port, listenHost, () => {
            resolve(server);
        });
    });
}

function findFreePatchFile(workdir, role) {
    let patchFile = path.join(workdir, `ai-patch-${role}.txt`);
    let fileNumber = 1;

    while (fs.existsSync(patchFile) && fs.readFileSync(patchFile, 'utf8').trim()) {
        fileNumber++;
        patchFile = path.join(workdir, `ai-patch-${role}-${fileNumber}.txt`);
    }

    return patchFile;
}

async function createAndProcessSingle(body, workdir, role, logger, executor, allowedCommands, res, autoMode, patchQueue, setPatchQueue) {
    const { action, file, description, reason, content, to, command, notify } = body;

    const validActions = ['patch', 'replace', 'create', 'delete', 'rename', 'append', 'exec'];
    if (!validActions.includes(action)) {
        return res.json({ success: false, error: `parse_error: unknown action "${action}"` });
    }

    if (['patch', 'replace', 'create', 'delete', 'rename', 'append'].includes(action)) {
        if (!file) return res.json({ success: false, error: 'parse_error: missing file' });
        try {
            validatePath(file, workdir);
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    }

    if (['patch', 'replace', 'create', 'append'].includes(action) && !content) {
        return res.json({ success: false, error: 'parse_error: content is required' });
    }
    if (action === 'rename' && !to) {
        return res.json({ success: false, error: 'parse_error: "to" is required for rename' });
    }
    if (action === 'exec') {
        if (!command) return res.json({ success: false, error: 'parse_error: command is required' });
        try {
            validateCommand(command, allowedCommands);
        } catch (e) {
            return res.json({ success: false, error: e.message });
        }
    }

    const patchFile = findFreePatchFile(workdir, role);

    let fileContent = `Action: ${action}\n`;
    if (file) fileContent += `File: ${file}\n`;
    if (description) fileContent += `Description: ${description}\n`;
    if (reason) fileContent += `Reason: ${reason}\n`;
    if (to) fileContent += `To: ${to}\n`;
    if (command) fileContent += `Command: ${command}\n`;
    if (notify !== undefined) fileContent += `Notify: ${notify}\n`;

    if (content !== undefined) {
        fileContent += `\n${content}`;
    }

    fs.writeFileSync(patchFile, fileContent);
    const id = logger.getNextId();

    const effectiveNotify = notify !== false;

    // Для exec в autoMode - сначала выполняем, потом отвечаем с результатом
    if (autoMode || !effectiveNotify) {
        if (autoMode && action === 'exec') {
            try {
                const parsedAction = parseActionFile(fileContent);
                const result = executor.execute(parsedAction);
                moveToLog(patchFile, 'applied', logger);
                console.log(chalk.gray(` 🔕 Патч #${id} применён автоматически`));
                
                res.json({
                    success: true,
                    id: id,
                    filename: path.basename(patchFile),
                    status: 'auto-applied',
                    message: 'Автономный режим: команда выполнена.',
                    execResult: result
                });
            } catch (e) {
                moveToLog(patchFile, 'error', logger);
                console.log(chalk.red(` ❌ Ошибка автоприменения патча #${id}: ${e.message}`));
                
                res.json({
                    success: true,
                    id: id,
                    filename: path.basename(patchFile),
                    status: 'auto-applied',
                    message: 'Автономный режим: команда выполнена с ошибкой.',
                    execResult: { success: false, output: e.message }
                });
            }
            return;
        }
        
        // Для остальных действий в autoMode
        try {
            const parsedAction = parseActionFile(fileContent);
            executor.execute(parsedAction);
            moveToLog(patchFile, 'applied', logger);
            console.log(chalk.gray(` 🔕 Патч #${id} применён автоматически`));
        } catch (e) {
            moveToLog(patchFile, 'error', logger);
            console.log(chalk.red(` ❌ Ошибка автоприменения патча #${id}: ${e.message}`));
        }
        
        res.json({
            success: true,
            id: id,
            filename: path.basename(patchFile),
            status: 'auto-applied',
            message: autoMode
                ? 'Автономный режим: патч применён автоматически.'
                : 'Патч применён автоматически (notify=false).'
        });
    } else {
        // Обычный режим с подтверждением
        res.json({
            success: true,
            id: id,
            filename: path.basename(patchFile),
            status: 'pending',
            message: 'Файл создан. Человек подтвердит в консоли.'
        });
        
        const newQueue = patchQueue
            .then(() => handlePatchFile(patchFile, logger, executor, id, false))
            .catch(err => {
                console.error(chalk.red(` ❌ Ошибка обработки патча #${id}: ${err.message}`));
            });
        setPatchQueue(newQueue);
    }
}

async function createAndProcessSequence(body, workdir, role, logger, executor, allowedCommands, res, autoMode, patchQueue, setPatchQueue) {
    const { description, reason, steps, notify } = body;

    if (!Array.isArray(steps) || steps.length === 0) {
        return res.json({ success: false, error: 'parse_error: steps must be non-empty array' });
    }

    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (!step.action) {
            return res.json({ success: false, error: `parse_error: step ${i + 1} missing action` });
        }

        if (step.action === 'exec') {
            if (!step.command) {
                return res.json({ success: false, error: `parse_error: step ${i + 1} missing command` });
            }
            try {
                validateCommand(step.command, allowedCommands);
            } catch (e) {
                return res.json({ success: false, error: `step ${i + 1}: ${e.message}` });
            }
        } else if (['patch', 'replace', 'create', 'delete', 'rename', 'append'].includes(step.action)) {
            if (!step.file) {
                return res.json({ success: false, error: `parse_error: step ${i + 1} missing file` });
            }
            try {
                validatePath(step.file, workdir);
            } catch (e) {
                return res.json({ success: false, error: `step ${i + 1}: ${e.message}` });
            }
        } else {
            return res.json({ success: false, error: `parse_error: step ${i + 1} unknown action "${step.action}"` });
        }
    }

    const patchFile = findFreePatchFile(workdir, role);

    let fileContent = `Action: sequence\n`;
    if (description) fileContent += `Description: ${description}\n`;
    if (reason) fileContent += `Reason: ${reason}\n`;
    if (notify !== undefined) fileContent += `Notify: ${notify}\n`;

    for (let i = 0; i < steps.length; i++) {
        fileContent += `\n---\n`;
        const step = steps[i];
        fileContent += `Action: ${step.action}\n`;
        if (step.file) fileContent += `File: ${step.file}\n`;
        if (step.description) fileContent += `Description: ${step.description}\n`;
        if (step.to) fileContent += `To: ${step.to}\n`;
        if (step.command) fileContent += `Command: ${step.command}\n`;
        if (step.content !== undefined) {
            fileContent += `\n${step.content}`;
        }
    }

    fs.writeFileSync(patchFile, fileContent);
    const id = logger.getNextId();

    const effectiveNotify = notify !== false;

    // Проверяем есть ли exec в sequence
    const hasExec = steps.some(s => s.action === 'exec');
    
    // Для sequence с exec в autoMode - сначала выполняем, потом отвечаем с результатом
    if (autoMode || !effectiveNotify) {
        if (autoMode && hasExec) {
            try {
                const parsedAction = parseActionFile(fileContent);
                const result = executor.execute(parsedAction);
                moveToLog(patchFile, 'applied', logger);
                console.log(chalk.gray(` 🔕 Sequence #${id} применена автоматически`));
                
                res.json({
                    success: true,
                    id: id,
                    filename: path.basename(patchFile),
                    status: 'auto-applied',
                    steps: steps.length,
                    message: 'Автономный режим: sequence выполнена.',
                    execResult: result
                });
            } catch (e) {
                moveToLog(patchFile, 'error', logger);
                console.log(chalk.red(` ❌ Ошибка автоприменения sequence #${id}: ${e.message}`));
                
                res.json({
                    success: true,
                    id: id,
                    filename: path.basename(patchFile),
                    status: 'auto-applied',
                    steps: steps.length,
                    message: 'Автономный режим: sequence выполнена с ошибкой.',
                    execResult: e.results || { success: false, output: e.message }
                });
            }
            return;
        }
        
        // Для остальных sequence в autoMode
        try {
            const parsedAction = parseActionFile(fileContent);
            executor.execute(parsedAction);
            moveToLog(patchFile, 'applied', logger);
            console.log(chalk.gray(` 🔕 Sequence #${id} применена автоматически`));
        } catch (e) {
            moveToLog(patchFile, 'error', logger);
            console.log(chalk.red(` ❌ Ошибка автоприменения sequence #${id}: ${e.message}`));
        }
        
        res.json({
            success: true,
            id: id,
            filename: path.basename(patchFile),
            status: 'auto-applied',
            steps: steps.length,
            message: autoMode
                ? 'Автономный режим: sequence применена автоматически.'
                : 'Sequence применена автоматически (notify=false).'
        });
    } else {
        // Обычный режим с подтверждением
        res.json({
            success: true,
            id: id,
            filename: path.basename(patchFile),
            status: 'pending',
            steps: steps.length,
            message: 'Sequence создана. Человек подтвердит в консоли.'
        });
        
        const newQueue = patchQueue
            .then(() => handlePatchFile(patchFile, logger, executor, id, false))
            .catch(err => {
                console.error(chalk.red(` ❌ Ошибка обработки sequence #${id}: ${err.message}`));
            });
        setPatchQueue(newQueue);
    }
}

async function handlePatchFile(filePath, logger, executor, existingId = null, autoMode = false) {
    if (!fs.existsSync(filePath)) {
        console.log(chalk.yellow(` ⚠️  Файл не найден: ${filePath}`));
        return;
    }

    const text = fs.readFileSync(filePath, 'utf8');
    if (!text.trim()) {
        console.log(chalk.yellow(` ⚠️  Файл пустой: ${path.basename(filePath)}`));
        return;
    }

    let action;
    try {
        action = parseActionFile(text);
    } catch (e) {
        console.error(`❌ ${e.message}`);
        moveToLog(filePath, 'error', logger);
        return;
    }

    const id = existingId || logger.getNextId();
    const recentRequests = logger.getRecentRequests(5);

    if (action.action === 'sequence') {
        showSequenceUI(id, action, recentRequests);
    } else {
        showPatchUI(id, action, recentRequests);
    }

    // Автономный режим — применяем без подтверждения
    if (autoMode) {
        console.log(chalk.gray(` 🤖 Автоприменение...`));
        try {
            const result = executor.execute(action);

            if (action.action === 'sequence') {
                for (const r of result.results) {
                    if (r.status === 'success') {
                        console.log(` ✅ шаг ${r.step}: ${r.action}`);
                    } else {
                        console.log(` ❌ шаг ${r.step}: ${r.action} — ${r.error}`);
                    }
                }
            } else {
                console.log(` ✅ ${result}: ${action.file || action.path || action.command}`);
            }

            moveToLog(filePath, 'applied', logger);
            showResult(id, 'applied', action.notify);
        } catch (e) {
            if (e instanceof SequenceError) {
                console.log();
                for (const r of e.results) {
                    if (r.status === 'success') {
                        console.log(` ✅ шаг ${r.step}: ${r.action}`);
                    } else {
                        console.log(` ❌ шаг ${r.step}: ${r.action} — ${r.error}`);
                    }
                }
                moveToLog(filePath, 'partial', logger);
                showResult(id, `partial:${e.message.split(':')[0]}`, action.notify);
            } else {
                console.error(` ❌ ${e.message}`);
                moveToLog(filePath, 'error', logger);
                showResult(id, e.message.split(':')[0], action.notify);
            }
        }
        return;
    }

    // Обычный режим — запрашиваем подтверждение
    const answer = await ask('? применить? [Y/n/q] ');

    if (answer.toLowerCase() === 'q') {
        process.exit(0);
    }

    if (answer.toLowerCase() === 'n') {
        moveToLog(filePath, 'rejected', logger);
        showResult(id, 'rejected', action.notify);
        return;
    }

    try {
        const result = executor.execute(action);

        if (action.action === 'sequence') {
            for (const r of result.results) {
                if (r.status === 'success') {
                    console.log(` ✅ шаг ${r.step}: ${r.action}`);
                } else {
                    console.log(` ❌ шаг ${r.step}: ${r.action} — ${r.error}`);
                }
            }
            moveToLog(filePath, 'applied', logger);
            showResult(id, 'applied', action.notify);
        } else {
            console.log(` ✅ ${result}: ${action.file || action.path || action.command}`);
            moveToLog(filePath, 'applied', logger);
            showResult(id, 'applied', action.notify);
        }

    } catch (e) {
        if (e instanceof SequenceError) {
            console.log();
            for (const r of e.results) {
                if (r.status === 'success') {
                    console.log(` ✅ шаг ${r.step}: ${r.action}`);
                } else {
                    console.log(` ❌ шаг ${r.step}: ${r.action} — ${r.error}`);
                }
            }
            moveToLog(filePath, 'partial', logger);
            showResult(id, `partial:${e.message.split(':')[0]}`, action.notify);
        } else {
            console.error(` ❌ ${e.message}`);
            moveToLog(filePath, 'error', logger);
            showResult(id, e.message.split(':')[0], action.notify);
        }
    }
}

function moveToLog(filePath, status, logger) {
    const basename = path.basename(filePath);
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(logger.logDir, `${ts}_${status}_${basename}`);
    fs.renameSync(filePath, dest);
}

const SKIP_DIRS = ['node_modules', '.git', '.ai-log', 'dist', 'build', '.cache'];

function listFiles(dir, recursive) {
    const result = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP_DIRS.includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);
        const stat = fs.statSync(fullPath);

        result.push({
            name: entry.name,
            type: entry.isDirectory() ? 'dir' : 'file',
            size: stat.size,
            modified: stat.mtime.toISOString()
        });

        if (recursive && entry.isDirectory()) {
            result.push(...listFiles(fullPath, true).map(f => ({
                ...f,
                name: path.join(entry.name, f.name)
            })));
        }
    }
    return result;
}

function grepFiles(dir, pattern, useRegex) {
    const matches = [];
    const regex = useRegex ? new RegExp(pattern) : null;

    function search(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.name.startsWith('.') || SKIP_DIRS.includes(entry.name)) continue;
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                search(fullPath);
            } else if (entry.isFile()) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const lines = content.split('\n');

                    for (let i = 0; i < lines.length; i++) {
                        const found = useRegex
                            ? regex.test(lines[i])
                            : lines[i].includes(pattern);

                        if (found) {
                            matches.push({
                                file: path.relative(dir, fullPath),
                                line: i + 1,
                                text: lines[i].trim()
                            });
                        }
                    }
                } catch {
                    // Бинарные файлы
                }
            }
        }
    }

    search(dir);
    return matches;
}

function buildTree(dir, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth) return null;

    const result = { name: path.basename(dir), type: 'dir', children: [] };
    const entries = fs.readdirSync(dir, { withFileTypes: true });

// Helper функции для новых эндпоинтов

function listPatches(logDir, limit) {
    if (!fs.existsSync(logDir)) return [];
    
    const files = fs.readdirSync(logDir)
        .filter(f => f.includes('_applied_') || f.includes('_rejected_') || f.includes('_error_') || f.includes('_partial_'))
        .sort()
        .reverse()
        .slice(0, limit);
    
    return files.map(filename => {
        const filepath = path.join(logDir, filename);
        const stat = fs.statSync(filepath);
        
        // Парсим имя файла: timestamp_status_originalname
        const parts = filename.split('_');
        const status = parts[1] || 'unknown';
        
        return {
            filename: filename,
            status: status,
            timestamp: stat.mtime.toISOString(),
            size: stat.size
        };
    });
}

function generateDiff(content1, content2, path1, path2) {
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    
    let diff = `--- ${path1}\n+++ ${path2}\n\n`;
    
    // Простой diff алгоритм
    const maxLen = Math.max(lines1.length, lines2.length);
    let inChange = false;
    let contextLines = 3;
    
    for (let i = 0; i < maxLen; i++) {
        const line1 = i < lines1.length ? lines1[i] : null;
        const line2 = i < lines2.length ? lines2[i] : null;
        
        if (line1 !== line2) {
            if (!inChange) {
                // Показываем контекст перед изменением
                const start = Math.max(0, i - contextLines);
                for (let j = start; j < i; j++) {
                    if (j < lines1.length) {
                        diff += ` ${lines1[j]}\n`;
                    }
                }
                inChange = true;
            }
            
            if (line1 !== null) {
                diff += `-${line1}\n`;
            }
            if (line2 !== null) {
                diff += `+${line2}\n`;
            }
        } else {
            if (inChange) {
                // Показываем контекст после изменения
                for (let j = 0; j < contextLines && i + j < lines1.length; j++) {
                    diff += ` ${lines1[i + j]}\n`;
                }
                diff += '\n';
                inChange = false;
            }
        }
    }
    
    return diff;
}

async function dryRunPatch(body, workdir, role, logger, executor, allowedCommands, res) {
    const { action, file, content, to, command } = body;
    
    const validActions = ['patch', 'replace', 'create', 'delete', 'rename', 'append', 'exec'];
    if (!validActions.includes(action)) {
        return res.json({ success: false, error: `parse_error: unknown action "${action}"` });
    }
    
    // Проверка валидности
    const errors = [];
    
    if (['patch', 'replace', 'create', 'delete', 'rename', 'append'].includes(action)) {
        if (!file) {
            errors.push('file is required');
        } else {
            try {
                const abs = validatePath(file, workdir);
                if (!['create', 'delete'].includes(action) && !fs.existsSync(abs)) {
                    errors.push('file not found');
                }
            } catch (e) {
                errors.push(e.message);
            }
        }
    }
    
    if (['patch', 'replace', 'create', 'append'].includes(action) && !content) {
        errors.push('content is required');
    }
    
    if (action === 'rename' && !to) {
        errors.push('"to" is required for rename');
    }
    
    if (action === 'exec') {
        if (!command) {
            errors.push('command is required');
        } else {
            try {
                validateCommand(command, allowedCommands);
            } catch (e) {
                errors.push(e.message);
            }
        }
    }
    
    if (errors.length > 0) {
        return res.json({
            success: false,
            dry_run: true,
            errors: errors
        });
    }
    
    return res.json({
        success: true,
        dry_run: true,
        message: 'Patch validation passed',
        action: action,
        file: file,
        command: command
    });
}

    for (const entry of entries) {
        if (entry.name.startsWith('.') || SKIP_DIRS.includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            result.children.push(buildTree(fullPath, maxDepth, currentDepth + 1));
        } else {
            result.children.push({ name: entry.name, type: 'file' });
        }
    }

    return result;
}
