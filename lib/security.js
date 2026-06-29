import fs from 'fs';
import path from 'path';

const FORBIDDEN_PATTERNS = [
    /node_modules/i,
    /\.env(\..*)?$/i,
    /\.git\//i,
    /\.ai-log/i,
    /ai-patch-/i,
    /agent\.js/i,
    /\.key$/i,
    /secret/i,
    /aica.config.json/i,
    /private.*key/i,
    /token/i
];

const DEFAULT_ALLOWED_COMMANDS = [
    'npm test',
    'npm run *',
    'npx jest',
    'npx vitest',
    'npx eslint *',
    'npx tsc',
    'npx tsc --*',
    'yarn test',
    'yarn run *',
    'pnpm test',
    'pnpm run *'
];

export function validatePath(filePath, workdir) {
    if (!filePath) throw new Error('forbidden_path: path is required');

    const abs = path.resolve(workdir, filePath);

    if (!abs.startsWith(path.resolve(workdir))) {
        throw new Error('forbidden_path: outside workspace');
    }

    // Исправлено: исключаем lib/ из проверки password
    const relativePath = path.relative(workdir, abs);
    if (!relativePath.startsWith('lib' + path.sep) && !relativePath.startsWith('lib/')) {
        for (const pattern of FORBIDDEN_PATTERNS) {
            if (pattern.test(abs)) {
                throw new Error(`forbidden_path: matches ${pattern}`);
            }
        }
    } else {
        // Для lib/ проверяем все паттерны кроме password
        const libPatterns = FORBIDDEN_PATTERNS.filter(p => p.source !== 'password');
        for (const pattern of libPatterns) {
            if (pattern.test(abs)) {
                throw new Error(`forbidden_path: matches ${pattern}`);
            }
        }
    }

    return abs;
}

export function isGitignored(absPath, workdir) {
    try {
        const gitignorePath = path.join(workdir, '.gitignore');
        if (!fs.existsSync(gitignorePath)) return false;

        const content = fs.readFileSync(gitignorePath, 'utf8');
        const relPath = path.relative(workdir, absPath);

        for (const line of content.split('\n')) {
            const pattern = line.trim();
            if (!pattern || pattern.startsWith('#')) continue;

            if (relPath.includes(pattern.replace(/\*/g, ''))) {
                return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

export function loadAllowedCommands(workdir) {
    const configPath = path.join(workdir, 'aica.config.json');

    if (fs.existsSync(configPath)) {
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (Array.isArray(config.allowedCommands)) {
                return config.allowedCommands;
            }
        } catch (e) {
            console.warn(`⚠️  Ошибка чтения aica.config.json: ${e.message}`);
        }
    }

    return DEFAULT_ALLOWED_COMMANDS;
}

export function validateCommand(command, allowedCommands) {
    if (!command || typeof command !== 'string') {
        throw new Error('forbidden_command: empty command');
    }

    const cmd = command.trim();

    if (/[;&|`$]/.test(cmd)) {
        throw new Error('forbidden_command: shell metacharacters not allowed');
    }

    for (const pattern of allowedCommands) {
        if (pattern.includes('*')) {
            const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
            if (regex.test(cmd)) return true;
        } else if (cmd === pattern) {
            return true;
        }
    }

    throw new Error(`forbidden_command: "${cmd}" not in whitelist`);
}
