import fs from 'fs';
import path from 'path';
import { applyPatch } from 'diff';
import { execSync } from 'child_process';
import { validatePath, validateCommand, loadAllowedCommands } from './security.js';
import { BackupManager } from './backup.js';

export class ActionExecutor {
    constructor(workdir, logDir) {
        this.workdir = workdir;
        this.backup = new BackupManager(logDir);
        this.allowedCommands = loadAllowedCommands(workdir);
    }

    execute(action) {
        if (action.action === 'sequence') {
            return this.executeSequence(action.steps);
        }

        return this.executeSingle(action);
    }

    executeSingle(action) {
        if (action.action === 'exec') {
            return this.executeCommand(action.command);
        }

        const filePath = action.file || action.path;
        const abs = validatePath(filePath, this.workdir);

        if (!['create', 'delete'].includes(action.action)) {
            this.backup.create(abs);
        }

        switch (action.action) {
            case 'patch':
                return this.applyPatch(abs, action.diff);
            case 'replace':
                return this.replaceFile(abs, action.content);
            case 'create':
                return this.createFile(abs, action.content);
            case 'delete':
                return this.deleteFile(abs);
            case 'rename':
                return this.renameFile(abs, action.to);
            case 'append':
                return this.appendFile(abs, action.content);
            default:
                throw new Error(`unknown_action: ${action.action}`);
        }
    }

    executeSequence(steps) {
        const results = [];

        for (const step of steps) {
            try {
                const result = this.executeSingle(step);
                results.push({ step: step.stepIndex, action: step.action, status: 'success', result });
            } catch (e) {
                results.push({ step: step.stepIndex, action: step.action, status: 'failed', error: e.message });
                throw new SequenceError(results, e.message);
            }
        }

        return { sequence: true, results };
    }

    executeCommand(command) {
        validateCommand(command, this.allowedCommands);

        try {
            const out = execSync(command, {
                encoding: 'utf8',
                timeout: 120000,
                cwd: this.workdir,
                maxBuffer: 10 * 1024 * 1024
            });
            return { success: true, output: out };
        } catch (e) {
            return {
                success: false,
                output: (e.stdout || '') + (e.stderr || ''),
                exitCode: e.status
            };
        }
    }

    applyPatch(abs, diff) {
        const original = fs.readFileSync(abs, 'utf8');
        const result = applyPatch(original, diff);
        if (result === false) throw new Error('patch_conflict');
        fs.writeFileSync(abs, result);
        return 'patched';
    }

    replaceFile(abs, content) {
        fs.writeFileSync(abs, content);
        return 'replaced';
    }

    createFile(abs, content) {
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
        return 'created';
    }

    deleteFile(abs) {
        fs.unlinkSync(abs);
        return 'deleted';
    }

    renameFile(abs, to) {
        const toAbs = validatePath(to, this.workdir);
        fs.renameSync(abs, toAbs);
        return 'renamed';
    }

    appendFile(abs, content) {
        fs.appendFileSync(abs, content);
        return 'appended';
    }
}

export class SequenceError extends Error {
    constructor(results, message) {
        super(message);
        this.name = 'SequenceError';
        this.results = results;
    }
}