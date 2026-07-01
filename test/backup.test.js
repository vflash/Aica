import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BackupManager } from '../lib/backup.js';

describe('BackupManager', () => {
    let tempDir;
    let testFile;
    let backupManager;

    before(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-'));
        testFile = path.join(tempDir, 'test.txt');
        fs.writeFileSync(testFile, 'original content');
        backupManager = new BackupManager(tempDir);
    });

    after(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('create', () => {
        it('should create backup of existing file', () => {
            const backupPath = backupManager.create(testFile);
            assert.ok(backupPath);
            assert.ok(fs.existsSync(backupPath));
            assert.strictEqual(fs.readFileSync(backupPath, 'utf8'), 'original content');
        });

        it('should return null for non-existent file', () => {
            const result = backupManager.create('/non/existent/file.txt');
            assert.strictEqual(result, null);
        });
    });

    describe('getLatest', () => {
        it('should return latest backup', () => {
            backupManager.create(testFile);
            
            const start = Date.now();
            while (Date.now() - start < 10) {}
            
            fs.writeFileSync(testFile, 'modified content');
            const latestBackup = backupManager.create(testFile);
            
            const retrieved = backupManager.getLatest(testFile);
            assert.strictEqual(retrieved, latestBackup);
        });
    });

    describe('restore', () => {
        it('should restore file from latest backup', () => {
            // Use unique file to avoid conflicts with previous tests
            const restoreFile = path.join(tempDir, 'restore-test.txt');
            fs.writeFileSync(restoreFile, 'original content');
            const backupPath = backupManager.create(restoreFile);
            fs.writeFileSync(restoreFile, 'modified content');
            
            backupManager.restore(restoreFile);
            assert.strictEqual(fs.readFileSync(restoreFile, 'utf8'), 'original content');
        });

        it('should throw error when no backup exists', () => {
            const newFile = path.join(tempDir, 'new.txt');
            assert.throws(() => backupManager.restore(newFile), /No backup found/);
        });
    });
});
