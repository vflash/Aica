#!/usr/bin/env node

import chalk from 'chalk';
import { generatePassword } from '../lib/password.js';
import { startServer } from '../lib/server.js';
import { setupUPnP, createCloudflareTunnel, getExternalIP } from '../lib/tunnel.js';
import { showStartupUI } from '../lib/ui.js';

async function main() {
    const args = process.argv.slice(2);

    const role = args.find(arg => !arg.startsWith('--'));
    const useUPnP = args.includes('--upnp');
    const useIP = args.includes('--ip');
    const useCloudflared = args.includes('--cloudflared');
    const useQPost = args.includes('--q-post');
    const useQGet = args.includes('--q-get');
    const useQMix = args.includes('--q-mix');
    const useAuto = args.includes('--auto');

    // Проверка что только один режим
    const modes = [useQPost, useQGet, useQMix].filter(Boolean).length;
    if (modes > 1) {
        console.error('❌ Можно указать только один режим: --q-post, --q-get или --q-mix');
        process.exit(1);
    }

    // По умолчанию mixed
    const requestMode = useQPost ? 'post' : useQGet ? 'get' : 'mixed';

    const portIndex = args.indexOf('--port');
    let customPort = null;
    if (portIndex !== -1) {
        const portArg = args[portIndex + 1];
        customPort = parseInt(portArg, 10);
        if (isNaN(customPort) || customPort < 1 || customPort > 65535) {
            console.error('❌ Неверный порт');
            process.exit(1);
        }
    }

    const urlIndex = args.indexOf('--url');
    let publicUrl = null;
    if (urlIndex !== -1) {
        publicUrl = args[urlIndex + 1];
    }

    if (!role) {
        console.error('❌ Укажите роль: aica <role> [flags]');
        console.error('');
        console.error('Флаги:');
        console.error('  --port <N>        Порт сервера (по умолчанию 3000)');
        console.error('  --url <URL>       Публичный URL для промпта');
        console.error('  --upnp            Внешний IP + UPnP проброс порта');
        console.error('  --ip              Только внешний IP');
        console.error('  --cloudflared     Туннель через cloudflared');
        console.error('  --q-mix           Режим mixed: GET для чтения, POST для изменений (по умолчанию)');
        console.error('  --q-get           Режим get: всё через GET');
        console.error('  --q-post          Режим post: всё через POST');
        console.error('  --auto            Автономный режим: без подтверждений');
        process.exit(1);
    }

    const workdir = process.cwd();
    const password = generatePassword();
    const startPort = customPort || 3000;
    const port = await findAvailablePort(startPort);

    const listenHost = (useUPnP || useIP) ? '0.0.0.0' : '127.0.0.1';
    const server = await startServer({ workdir, role, password, port, listenHost, requestMode, autoMode: useAuto, publicUrl });

    let upnpClient = null;
    let tunnelUrl = null;
    let tunnelProcess = null;
    let externalIP = null;

    if (useUPnP) {
        try {
            externalIP = await getExternalIP();
            console.log(chalk.green(` ✅ Внешний IP: ${externalIP}`));
        } catch (e) {
            console.log(chalk.yellow(' ⚠️  Не удалось определить внешний IP'));
        }
        try {
            upnpClient = await setupUPnP(port);
        } catch (e) {
            console.log(chalk.yellow(' ⚠️  UPnP не сработал'));
        }
    }

    if (useIP) {
        try {
            externalIP = await getExternalIP();
            console.log(chalk.green(` ✅ Внешний IP: ${externalIP}`));
        } catch (e) {
            console.log(chalk.yellow(' ⚠️  Не удалось определить внешний IP'));
        }
    }

    if (useCloudflared) {
        try {
            const result = await createCloudflareTunnel(port);
            tunnelUrl = result.url;
            tunnelProcess = result.process;
        } catch (e) {
            console.log(chalk.yellow(' ⚠️  Туннель не создан'));
        }
    }

    showStartupUI({
        role, workdir, port, password, tunnelUrl, externalIP, publicUrl,
        useUPnP, useIP, useCloudflared, requestMode, autoMode: useAuto
    });

    const cleanup = () => {
        if (upnpClient) {
            try { upnpClient.portUnmapping({ public: port }); } catch {}
        }
        if (tunnelProcess) {
            try { tunnelProcess.kill(); } catch {}
        }
        process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

async function findAvailablePort(startPort) {
    const net = await import('net');
    for (let port = startPort; port < startPort + 100; port++) {
        try {
            await new Promise((resolve, reject) => {
                const server = net.createServer();
                server.listen(port, () => server.close(() => resolve()));
                server.on('error', reject);
            });
            return port;
        } catch (e) {}
    }
    throw new Error('Нет свободных портов');
}

main().catch(err => {
    console.error('❌ Ошибка запуска:', err.message);
    process.exit(1);
});