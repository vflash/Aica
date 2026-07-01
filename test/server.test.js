import { describe, it } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';

// Конфигурация из переменных окружения
const BASE_URL = process.env.AICA_BASE_URL || 'http://localhost:3000';
const PASSWORD = process.env.AICA_PASSWORD || '';

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE_URL);

        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (method === 'GET') {
            url.searchParams.append('password', PASSWORD);
        } else {
            options.headers['Authorization'] = `Bearer ${PASSWORD}`;
        }

        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, data: json, text: data });
                } catch (e) {
                    resolve({ status: res.statusCode, data: null, text: data });
                }
            });
        });

        req.on('error', reject);

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

describe('Server API Tests', () => {

    describe('/ping endpoint', () => {
        it('should return pong on GET /ping', async () => {
            const res = await request('GET', '/ping');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.text, 'pong');
        });

        it('should return pong on POST /ping', async () => {
            const res = await request('POST', '/ping');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.text, 'pong');
        });
    });

    describe('/list-patches endpoint', () => {
        it('should return patches list on GET /list-patches', async () => {
            const res = await request('GET', '/list-patches?limit=10');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.ok(Array.isArray(res.data.patches));
            assert.strictEqual(typeof res.data.count, 'number');
        });

        it('should return patches list on POST /list-patches', async () => {
            const res = await request('POST', '/list-patches', { limit: 5 });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.ok(Array.isArray(res.data.patches));
        });
    });

    describe('/diff endpoint', () => {
        it('should require path1 and path2 parameters', async () => {
            const res = await request('GET', '/diff');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.error.includes('required'));
        });

        it('should return diff for existing files', async () => {
            const res = await request('GET', '/diff?path1=package.json&path2=README.md');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.ok(res.data.diff);
            assert.strictEqual(res.data.path1, 'package.json');
            assert.strictEqual(res.data.path2, 'README.md');
        });

        it('should return error for non-existent file', async () => {
            const res = await request('GET', '/diff?path1=package.json&path2=nonexistent.txt');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, false);
            assert.ok(res.data.error.includes('not found'));
        });
    });

    describe('/create-patch dry-run', () => {
        it('should validate patch without applying', async () => {
            const res = await request('POST', '/create-patch', {
                action: 'create',
                file: 'test-temp.txt',
                content: 'test content',
                dry_run: true
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, true);
            assert.strictEqual(res.data.dry_run, true);
            assert.strictEqual(res.data.action, 'create');
        });

        it('should return errors for invalid patch', async () => {
            const res = await request('POST', '/create-patch', {
                action: 'patch',
                dry_run: true
            });

            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.data.success, false);
            assert.strictEqual(res.data.dry_run, true);
            assert.ok(Array.isArray(res.data.errors));
            assert.ok(res.data.errors.length > 0);
        });
    });

    describe('Authentication', () => {
        it('should reject requests without password', async () => {
            const url = new URL('/ping', BASE_URL);
            const res = await new Promise((resolve, reject) => {
                const req = http.request(url, { method: 'GET' }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve({ status: res.statusCode, data: data }));
                });
                req.on('error', reject);
                req.end();
            });

            assert.strictEqual(res.status, 401);
        });
    });
});
