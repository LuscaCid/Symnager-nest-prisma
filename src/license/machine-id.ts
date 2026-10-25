import { execFileSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

function readOsMachineId(): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'reg',
        [
          'query',
          'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
          '/v',
          'MachineGuid',
        ],
        { encoding: 'utf8', windowsHide: true, timeout: 5000 },
      );
      return /MachineGuid\s+REG_SZ\s+(\S+)/i.exec(out)?.[1] ?? null;
    }
    if (process.platform === 'darwin') {
      const out = execFileSync(
        'ioreg',
        ['-rd1', '-c', 'IOPlatformExpertDevice'],
        { encoding: 'utf8', timeout: 5000 },
      );
      return /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out)?.[1] ?? null;
    }
    for (const file of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
      const id = fs.existsSync(file)
        ? fs.readFileSync(file, 'utf8').trim()
        : '';
      if (id) return id;
    }
  } catch {
    // cai no identificador da instalação
  }
  return null;
}

/**
 * Identificador estável da máquina (sha256). Usa o ID do sistema operacional;
 * sem ele (ex.: container), um UUID gravado na pasta de dados.
 */
export function getMachineId(dataDir: string): string {
  let raw = readOsMachineId();
  if (!raw) {
    const file = path.join(dataDir, '.installation-id');
    try {
      raw = fs.readFileSync(file, 'utf8').trim();
    } catch {
      raw = '';
    }
    if (!raw) {
      raw = randomUUID();
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(file, raw, { mode: 0o600 });
    }
  }
  return createHash('sha256').update(`symnager:${raw}`).digest('hex');
}
