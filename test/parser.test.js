import { describe, it } from 'node:test';
import assert from 'node:assert';

// Динамический импорт модуля
const { parseActionFile } = await import('../lib/parser.js');

describe('Parser Module', () => {
    describe('parseActionFile', () => {
        it('should parse simple patch action', () => {
            const input = `Action: patch
File: test.txt
Description: Test patch

--- a/test.txt
+++ b/test.txt
@@ -1 +1 @@
-old
+new`;

            const result = parseActionFile(input);
            assert.strictEqual(result.action, 'patch');
            assert.strictEqual(result.file, 'test.txt');
            assert.ok(result.diff);
        });

        it('should parse create action', () => {
            const input = `Action: create
File: new.txt
Content-Type: text/plain

Hello World`;

            const result = parseActionFile(input);
            assert.strictEqual(result.action, 'create');
            assert.strictEqual(result.file, 'new.txt');
            assert.strictEqual(result.content, 'Hello World');
        });

        it('should parse exec action', () => {
            const input = `Action: exec
Command: npm test`;

            const result = parseActionFile(input);
            assert.strictEqual(result.action, 'exec');
            assert.strictEqual(result.command, 'npm test');
        });

        it('should throw error for missing Action header', () => {
            const input = `File: test.txt

content`;

            assert.throws(() => parseActionFile(input), /missing Action header/);
        });

        it('should throw error for unknown action', () => {
            const input = `Action: unknown
File: test.txt

content`;

            assert.throws(() => parseActionFile(input), /unknown action/);
        });

        it('should throw error for patch without diff', () => {
            const input = `Action: patch
File: test.txt`;

            assert.throws(() => parseActionFile(input), /empty diff/);
        });

        it('should throw error for exec without command', () => {
            const input = `Action: exec`;

            assert.throws(() => parseActionFile(input), /missing Command header/);
        });

        it('should parse sequence action', () => {
            const input = `Action: sequence
Description: Multi-step operation

Action: create
File: file1.txt

content1

---

Action: create
File: file2.txt

content2`;

            const result = parseActionFile(input);
            assert.strictEqual(result.action, 'sequence');
            assert.strictEqual(result.steps.length, 2);
            assert.strictEqual(result.steps[0].file, 'file1.txt');
            assert.strictEqual(result.steps[1].file, 'file2.txt');
        });

        it('should throw error for empty sequence', () => {
            const input = `Action: sequence
Description: Empty`;

            assert.throws(() => parseActionFile(input), /empty sequence/);
        });

        it('should handle notify header', () => {
            const input = `Action: create
File: test.txt
Notify: false

content`;

            const result = parseActionFile(input);
            assert.strictEqual(result.notify, false);
        });
    });
});
