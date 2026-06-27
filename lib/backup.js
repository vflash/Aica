import fs from 'fs';
import path from 'path';

export class BackupManager {
    constructor(logDir) {
        this.logDir = logDir;
    }

    create(filePath) {
        if (!fs.existsSync(filePath)) return null;

        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const name = path.basename(filePath);
        const backupPath = path.join(this.logDir, `.backup_${name}_${ts}`);

        fs.copyFileSync(filePath, backupPath);
        return backupPath;
    }

    getLatest(filePath) {
        const name = path.basename(filePath);
        const pattern = `.backup_${name}_`;

        const backups = fs.readdirSync(this.logDir)
            .filter(f => f.startsWith(pattern))
            .sort()
            .reverse();

        if (backups.length === 0) return null;
        return path.join(this.logDir, backups[0]);
    }

    restore(filePath) {
        const latest = this.getLatest(filePath);
        if (!latest) throw new Error('No backup found');

        fs.copyFileSync(latest, filePath);
        return latest;
    }
}