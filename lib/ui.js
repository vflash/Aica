import chalk from 'chalk';
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin, output: process.stdout });

export function ask(q) {
    return new Promise(res => {
        process.stdout.write('\n' + q);
        rl.once('line', (answer) => {
            res(answer);
        });
    });
}

function sanitize(text) {
    if (!text) return '';
    return text
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\x1b\].*?\x07/g, '')
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        .replace(/\r/g, '');
}

export function showStartupUI({ role, workdir, port, password, tunnelUrl, externalIP, publicUrl, useUPnP, useIP, useCloudflared, requestMode, autoMode }) {
    console.log();
    console.log(chalk.bgCyan.black(` 🤖 aica — агент "${role}" `));
    console.log(chalk.gray(` 📁 ${workdir}`));
    console.log(chalk.gray(` 🌐 localhost:${port}`));

    if (useUPnP && externalIP) console.log(chalk.green(` 🌍 UPnP: ${externalIP}:${port}`));
    if (useIP && externalIP) console.log(chalk.green(` 🌍 IP: ${externalIP}:${port}`));
    if (useCloudflared && tunnelUrl) console.log(chalk.green(` 🌍 Tunnel: ${tunnelUrl}`));
    if (autoMode) console.log(chalk.yellow(` 🤖 Автономный режим`));

    console.log(chalk.gray(` 🔑 ${password}`));

    // Определяем URL для промпта
    let serverUrl = publicUrl || `http://localhost:${port}`;
    if (!publicUrl) {
        if (useCloudflared && tunnelUrl) serverUrl = tunnelUrl;
        else if (useUPnP && externalIP) serverUrl = `http://${externalIP}:${port}`;
        else if (useIP && externalIP) serverUrl = `http://${externalIP}:${port}`;
    }

    // Убеждаемся что есть протокол
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
        serverUrl = `http://${serverUrl}`;
    }
    // Убираем trailing slash
    serverUrl = serverUrl.replace(/\/$/, '');

    // Формируем подсказку в зависимости от режима
    let helpHint;
    if (requestMode === 'post') {
        helpHint = `POST ${serverUrl}/help (Auth: Bearer ${password})`;
    } else {
        // get или mixed — для /help используем GET с password в query
        helpHint = `GET ${serverUrl}/help?password=${password}`;
    }

    // Минимальный промпт с протоколом и режимом
    console.log();
    console.log(chalk.gray(' ─── промпт для LLM ───'));

    console.log(`Ты работаешь с aica-агентом в проекте. Твоя роль: ${role}.`);
    console.log(`Сервер: ${serverUrl}`);
    console.log(`Пароль: ${password}`);
    console.log(`Используй доступные HTTP инструменты для запросов к серверу.`);
    console.log(`Получи справку: ${helpHint}`);
    console.log(`Следуй инструкциям из ответа сервера.`);

    console.log(chalk.gray(' ────────────────────────'));

    if (!useUPnP && !useIP && !useCloudflared && !publicUrl) {
        console.log(chalk.yellow(' ⚠ localhost only'));
        console.log(chalk.gray(' --upnp | --ip | --cloudflared | --url <URL>'));
    }

    console.log();
    console.log(chalk.gray(' ⏳ ожидание...'));
    console.log();
}

export function showPatchUI(id, action, recentRequests) {
    console.log();
    console.log(chalk.bgBlue.black(` 📨 ${action.action.toUpperCase()} `) + chalk.gray(` #${id}`));
    if (action.description) console.log(chalk.bold(action.description));
    console.log(chalk.gray(` 📁 ${action.file || action.path}`));
    if (action.reason) console.log(chalk.gray(` 💡 ${action.reason}`));

    showRecentRequests(recentRequests);
    showActionSummary(action);
}

export function showSequenceUI(id, action, recentRequests) {
    console.log();
    console.log(chalk.bgMagenta.black(` 📨 SEQUENCE `) + chalk.gray(` #${id}`));
    if (action.description) console.log(chalk.bold(action.description));
    if (action.reason) console.log(chalk.gray(` 💡 ${action.reason}`));

    showRecentRequests(recentRequests);

    console.log(chalk.gray(' 📋 шаги:'));
    for (const step of action.steps) {
        const icon = step.action === 'exec' ? '⚙️' :
                    step.action === 'patch' ? '🔧' :
                    step.action === 'create' ? '📄' :
                    step.action === 'delete' ? '🗑️' :
                    step.action === 'replace' ? '🔄' :
                    step.action === 'rename' ? '📝' :
                    step.action === 'append' ? '➕' : '❓';

        let detail = '';
        if (step.action === 'exec') {
            detail = chalk.yellow(`exec: ${step.command}`);
        } else {
            detail = `${step.action} ${step.file || step.path}`;
        }

        console.log(`   ${step.stepIndex}. ${icon} ${detail}`);
    }

    const firstFileStep = action.steps.find(s => s.diff || s.content);
    if (firstFileStep) {
        console.log(chalk.gray(' ─── preview ───'));
        showActionSummary(firstFileStep);
    }
}

function showRecentRequests(recentRequests) {
    if (recentRequests.length > 0) {
        console.log(chalk.gray(' 📊 последние:'));
        for (const req of recentRequests) {
            const time = req.time?.slice(11, 19) || '??:??:??';
            const icon = req.endpoint === '/get-file' ? '📖' :
                        req.endpoint === '/grep' ? '🔍' :
                        req.endpoint === '/list-files' ? '📂' :
                        req.endpoint === '/tree' ? '🌳' : '📡';
            console.log(chalk.gray(`   ${time} ${icon} ${req.endpoint} ${req.path || ''}`));
        }
    }
}

function showActionSummary(action) {
    if (action.diff) {
        showDiffSummary(action.diff);
    } else if (action.content) {
        showContentPreview(action.content);
    } else if (action.action === 'delete') {
        console.log(chalk.red(` ⚠️  удаление: ${action.file}`));
    } else if (action.action === 'rename') {
        console.log(chalk.yellow(` 📝 ${action.file} → ${action.to}`));
    } else if (action.action === 'exec') {
        console.log(chalk.yellow(` ⚙️  ${action.command}`));
    }
}

function showDiffSummary(diff) {
    const sanitized = sanitize(diff);
    const lines = sanitized.split('\n');

    let files = new Set();
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
        if (line.startsWith('+++ ') || line.startsWith('--- ')) {
            const m = line.match(/[ab]\/(.+)$/);
            if (m) files.add(m[1]);
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
            additions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
            deletions++;
        }
    }

    console.log(chalk.gray(` 📊 ${files.size} файлов, +${additions} -${deletions}`));

    if (files.size > 0 && files.size <= 5) {
        console.log(chalk.gray('   ' + Array.from(files).join(', ')));
    }
}

function showContentPreview(content) {
    const sanitized = sanitize(content);
    const lines = sanitized.split('\n');

    console.log(chalk.gray(` 📊 ${lines.length} строк, ${content.length} байт`));

    if (lines.length > 0) {
        const preview = lines.slice(0, 3);
        for (const line of preview) {
            console.log(chalk.gray(`   ${line.slice(0, 70)}`));
        }
        if (lines.length > 3) {
            console.log(chalk.gray(`   ... ещё ${lines.length - 3}`));
        }
    }
}

export function showResult(id, status, notify = true) {
    console.log();
    if (status === 'applied') {
        console.log(chalk.green(' ✅ применён'));
    } else if (status === 'rejected') {
        console.log(chalk.red(' ❌ отклонён'));
    } else if (status.startsWith('partial')) {
        console.log(chalk.yellow(` ⚠️  частично: ${status}`));
    } else {
        console.log(chalk.red(` ❌ ошибка: ${status}`));
    }

    if (notify) {
        if (status === 'applied' || status === 'rejected') {
            console.log(chalk.bold(`${status}:${id}`));
        } else {
            console.log(chalk.bold(`error:${id}:${status}`));
        }
    }
    console.log();
}