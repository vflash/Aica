import natUpnp from 'nat-upnp';
import { spawn } from 'child_process';
import chalk from 'chalk';
import https from 'https';
import http from 'http';

const { createClient } = natUpnp;

// Получение внешнего IP
export async function getExternalIP() {
    return new Promise((resolve, reject) => {
        const services = [
            { host: 'api.ipify.org', path: '/?format=json', protocol: 'https' },
            { host: 'ifconfig.me', path: '/', protocol: 'https' },
            { host: 'api.ipinfo.io', path: '/ip', protocol: 'https' },
            { host: 'api.ipify.org', path: '/?format=json', protocol: 'http' },
            { host: 'ifconfig.me', path: '/', protocol: 'http' }
        ];

        let currentIndex = 0;

        function tryNext() {
            if (currentIndex >= services.length) {
                reject(new Error('Не удалось получить внешний IP'));
                return;
            }

            const service = services[currentIndex];
            currentIndex++;

            const client = service.protocol === 'https' ? https : http;

            const req = client.get({
                hostname: service.host,
                path: service.path,
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const ip = json.ip || json.query || data.trim();
                        if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                            resolve(ip);
                        } else {
                            tryNext();
                        }
                    } catch {
                        const ip = data.trim();
                        if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
                            resolve(ip);
                        } else {
                            tryNext();
                        }
                    }
                });
            });

            req.on('error', () => tryNext());
            req.on('timeout', () => {
                req.destroy();
                tryNext();
            });
        }

        tryNext();
    });
}

// UPnP проброс порта
export async function setupUPnP(port) {
    const client = createClient();

    return new Promise((resolve, reject) => {
        console.log(chalk.gray(' 🔌 Проброс порта через UPnP...'));

        client.portMapping({
            public: port,
            private: port,
            description: 'aica agent',
            ttl: 0
        }, (err) => {
            if (err) {
                reject(new Error(`UPnP не сработал: ${err.message}`));
            } else {
                console.log(chalk.green(` ✅ Порт ${port} проброшен через UPnP`));
                resolve(client);
            }
        });
    });
}

// Cloudflare Tunnel
export async function createCloudflareTunnel(port) {
    console.log(chalk.gray(' 🌐 Создание туннеля через cloudflared...'));

    return new Promise((resolve, reject) => {
        const proc = spawn('cloudflared', [
            'tunnel',
            '--url', `http://localhost:${port}`,
            '--no-autoupdate',
            '--metrics', 'localhost:0'
        ], {
            env: { ...process.env, TUNNEL_LOGLEVEL: 'info' }
        });

        let url = null;

        function checkUrl(line) {
            const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match && !url) {
                url = match[0];
                console.log(chalk.green(` 🌍 Туннель: ${url}`));
                resolve({ url, process: proc });
            }
        }

        proc.stdout.on('data', (data) => {
            checkUrl(data.toString());
        });

        proc.stderr.on('data', (data) => {
            checkUrl(data.toString());
        });

        proc.on('error', (err) => {
            if (err.code === 'ENOENT') {
                reject(new Error('cloudflared не найден'));
            } else {
                reject(err);
            }
        });

        proc.on('close', (code) => {
            if (!url) {
                reject(new Error(`cloudflared завершился с кодом ${code}`));
            } else {
                console.log(chalk.yellow(` ⚠️  Туннель закрыт (код ${code})`));
            }
        });

        setTimeout(() => {
            if (!url) {
                proc.kill();
                reject(new Error('Timeout создания туннеля'));
            }
        }, 30000);
    });
}