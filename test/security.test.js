import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validatePath, validateCommand, loadAllowedCommands } from '../lib/security.js';

describe('Security Module', () => {
    const workdir = '/tmp/test-workdir';

    describe('validatePath', () => {
        it('should validate safe path', () => {
            const result = validatePath('lib/server.js', workdir);
            assert.ok(result);
            assert.ok(result.includes('lib/server.js'));
        });

        it('should throw error for path outside workspace', () => {
            assert.throws(
                () => validatePath('../../../etc/passwd', workdir),
                /outside workspace/
            );
        });

        it('should throw error for .env files', () => {
            assert.throws(
                () => validatePath('.env', workdir),
                /forbidden_path/
            );
        });

        it('should throw error for .git directory', () => {
            assert.throws(
                () => validatePath('.git/config', workdir),
                /forbidden_path/
            );
        });

        it('should throw error for node_modules', () => {
            assert.throws(
                () => validatePath('node_modules/package.json', workdir),
                /forbidden_path/
            );
        });

        it('should throw error for empty path', () => {
            assert.throws(
                () => validatePath('', workdir),
                /path is required/
            );
        });
    });

    describe('validateCommand', () => {
        const allowedCommands = [
            'npm test',
            'npm run *',
            'node --test'
        ];

        it('should allow whitelisted command', () => {
            const result = validateCommand('npm test', allowedCommands);
            assert.strictEqual(result, true);
        });

        it('should allow command with wildcard', () => {
            const result = validateCommand('npm run build', allowedCommands);
            assert.strictEqual(result, true);
        });

        it('should throw error for non-whitelisted command', () => {
            assert.throws(
                () => validateCommand('rm -rf /', allowedCommands),
                /not in whitelist/
            );
        });

        it('should throw error for shell metacharacters', () => {
            assert.throws(
                () => validateCommand('npm test && echo hacked', allowedCommands),
                /shell metacharacters/
            );
        });

        it('should throw error for empty command', () => {
            assert.throws(
                () => validateCommand('', allowedCommands),
                /empty command/
            );
        });

        it('should throw error for null command', () => {
            assert.throws(
                () => validateCommand(null, allowedCommands),
                /empty command/
            );
        });
    });

    describe('loadAllowedCommands', () => {
        it('should return default commands when no config', () => {
            const commands = loadAllowedCommands('/non/existent/dir');
            assert.ok(Array.isArray(commands));
            assert.ok(commands.length > 0);
            assert.ok(commands.includes('npm test'));
        });
    });
});
