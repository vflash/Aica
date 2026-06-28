import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

export class Logger {
    constructor(workdir) {
        this.workdir = workdir;
        this.logDir = path.join(workdir, '.ai-log');
        this.requestsLog = path.join(this.logDir, 'requests.log');
        this.counterFile = path.join(this.logDir, 'counter.txt');

        fs.mkdirSync(this.logDir, { recursive: true });
        this.ensureGitignore();
    }

    ensureGitignore() {
        const gi = path.join(this.workdir, '.gitignore');
        let content = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
        const additions = [];
        if (!content.includes('.ai-log')) additions.push('.ai-log/');
        if (!content.includes('ai-patch-')) additions.push('ai-patch-*.txt');

        if (additions.length > 0) {
            content += '\n# aica agent\n' + additions.join('\n') + '\n';
            fs.writeFileSync(gi, content);
        }
    }

    logRequest(method, endpoint, body) {
        const timestamp = new Date().toISOString();
        const entry = {
            time: timestamp,
            method,
            endpoint,
            path: body.path || body.pattern || '',
            file: body.file || '',
            action: body.action || '',
            reason: body.reason,
            context: body.context,
            query: method === 'GET' ? body : undefined
        };

        fs.appendFileSync(this.requestsLog, JSON.stringify(entry) + '\n');

        // Улучшенное логирование с информацией о файле/пути
        const fileInfo = body.path || body.file || body.pattern || '';
        console.log(chalk.gray(`[${timestamp.slice(11, 19)}] ${method} ${endpoint} ${fileInfo ? '→ ' + fileInfo : ''}`));
        if (body.reason) console.log(chalk.gray(`  💭 "${body.reason}"`));
    }

    getNextId() {
        let counter = 0;
        if (fs.existsSync(this.counterFile)) {
            counter = parseInt(fs.readFileSync(this.counterFile, 'utf8'), 10) || 0;
        }
        counter++;
        fs.writeFileSync(this.counterFile, String(counter));
        return counter;
    }

    getRecentRequests(limit = 5) {
        if (!fs.existsSync(this.requestsLog)) return [];
        const lines = fs.readFileSync(this.requestsLog, 'utf8').trim().split('\n');
        return lines.slice(-limit).map(l => {
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
    }
}