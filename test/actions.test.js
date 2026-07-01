import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ActionExecutor } from '../lib/actions.js';

describe('ActionExecutor', () => {
    let tempDir;
    let logDir;
    let executor;

    before(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actions-test-'));
        logDir = path.join(tempDir, '.ai-log');
        fs.mkdirSync(logDir, { recursive: true });
        executor = new ActionExecutor(tempDir, logDir);
    });

    after(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('createFile', () => {
        it('should create new file', () => {
            const action = {
                action: 'create',
                file: 'new.txt',
                content: 'Hello World'
            };

            const result = executor.executeSingle(action);
            assert.strictEqual(result, 'created');
            
            const filePath = path.join(tempDir, 'new.txt');
            assert.ok(fs.existsSync(filePath));
            assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'Hello World');
        });

        it('should create file in subdirectory', () => {
            const action = {
                action: 'create',
                file: 'subdir/file.txt',
                content: 'Nested file'
            };

            const result = executor.executeSingle(action);
            assert.strictEqual(result, 'created');
            
            const filePath = path.join(tempDir, 'subdir/file.txt');
            assert.ok(fs.existsSync(filePath));
        });
    });

    describe('replaceFile', () => {
        it('should replace file content', () => {
            const filePath = path.join(tempDir, 'replace.txt');
            fs.writeFileSync(filePath, 'old content');

            const action = {
                action: 'replace',
                file: 'replace.txt',
                content: 'new content'
            };

            const result = executor.executeSingle(action);
            assert.strictEqual(result, 'replaced');
            assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'new content');
        });
    });

    describe('appendFile', () => {
        it('should append to file', () => {
            const filePath = path.join(tempDir, 'append.txt');
            fs.writeFileSync(filePath, 'line1\n');

            const action = {
                action: 'append',
                file: 'append.txt',
                content: 'line2\n'
            };

            const result = executor.executeSingle(action);
            assert.strictEqual(result, 'appended');
            assert.strictEqual(fs.readFileSync(filePath, 'utf8'), 'line1\nline2\n');
        });
    });

    describe('deleteFile', () => {
        it('should delete file', () => {
            const filePath = path.join(tempDir, 'delete.txt');
            fs.writeFileSync(filePath, 'to delete');

            const action = {
                action: 'delete',
                file: 'delete.txt'
            };

            const result = executor.executeSingle(action);
            assert.strictEqual(result, 'deleted');
            assert.ok(!fs.existsSync(filePath));
        });
    });

    describe('renameFile', () => {
        it('should rename file', () => {
            const oldPath = path.join(tempDir, 'old.txt');
            const newPath = path.join(tempDir, 'new.txt');
            fs.writeFileSync(oldPath, 'content');

            const action = {
                action: 'rename',
                file: 'old.txt',
                to: 'new.txt'
            };

            const result = executor.executeSingle(action);
            assert.strictEqual(result, 'renamed');
            assert.ok(!fs.existsSync(oldPath));
            assert.ok(fs.existsSync(newPath));
        });
    });

    describe('executeCommand', () => {
        it('should execute allowed command', () => {
            const action = {
                action: 'exec',
                command: 'node --version'
            };

            const result = executor.executeSingle(action);
            assert.strictEqual(result.success, true);
            assert.ok(result.output.includes('v'));
        });

        it('should reject forbidden command', () => {
            const action = {
                action: 'exec',
                command: 'rm -rf /'
            };

            assert.throws(() => executor.executeSingle(action), /forbidden_command/);
        });
    });

    describe('executeSequence', () => {
        it('should execute sequence of actions', () => {
            const sequence = {
                action: 'sequence',
                steps: [
                    { action: 'create', file: 'seq1.txt', content: 'first', stepIndex: 1 },
                    { action: 'create', file: 'seq2.txt', content: 'second', stepIndex: 2 }
                ]
            };

            const result = executor.execute(sequence);
            assert.ok(result.sequence);
            assert.strictEqual(result.results.length, 2);
            assert.strictEqual(result.results[0].status, 'success');
            assert.strictEqual(result.results[1].status, 'success');
        });
    });
});
