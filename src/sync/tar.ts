import * as fs from 'fs';
import * as path from 'path';
import { Writable } from 'stream';

// TAR (ustar) mínimo para o pacote de sincronização: só arquivos comuns, nomes curtos.
// Evita dependência nova no app empacotado.

const BLOCK = 512;

function header(name: string, size: number, mtime: number): Buffer {
  const buf = Buffer.alloc(BLOCK, 0);
  buf.write(name, 0, 100, 'utf8');
  buf.write('0000600\0', 100, 8, 'ascii');
  buf.write('0000000\0', 108, 8, 'ascii');
  buf.write('0000000\0', 116, 8, 'ascii');
  buf.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'ascii');
  buf.write(
    Math.floor(mtime / 1000)
      .toString(8)
      .padStart(11, '0') + '\0',
    136,
    12,
    'ascii',
  );
  buf.write('        ', 148, 8, 'ascii'); // checksum provisório
  buf.write('0', 156, 1, 'ascii');
  buf.write('ustar\0', 257, 6, 'ascii');
  buf.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of buf) sum += byte;
  buf.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
  return buf;
}

const write = (out: Writable, chunk: Buffer) =>
  new Promise<void>((resolve, reject) => {
    if (out.write(chunk)) return resolve();
    out.once('drain', resolve);
    out.once('error', reject);
  });

/** Escreve os arquivos no stream. `name` é o caminho dentro do pacote (com "/"). */
export async function writeTar(
  entries: { name: string; file: string }[],
  out: Writable,
) {
  for (const entry of entries) {
    if (Buffer.byteLength(entry.name) > 99) continue;
    const stat = await fs.promises.stat(entry.file);
    await write(out, header(entry.name, stat.size, stat.mtimeMs));
    const handle = await fs.promises.open(entry.file, 'r');
    try {
      const chunk = Buffer.alloc(1024 * 1024);
      let left = stat.size;
      while (left > 0) {
        const { bytesRead } = await handle.read(
          chunk,
          0,
          Math.min(chunk.length, left),
          null,
        );
        if (!bytesRead) break;
        await write(out, Buffer.from(chunk.subarray(0, bytesRead)));
        left -= bytesRead;
      }
    } finally {
      await handle.close();
    }
    const pad = (BLOCK - (stat.size % BLOCK)) % BLOCK;
    if (pad) await write(out, Buffer.alloc(pad, 0));
  }
  await write(out, Buffer.alloc(BLOCK * 2, 0));
}

/**
 * Extrai em `dest` só os nomes aceitos por `allow` (o resto é ignorado).
 * Recusa caminhos absolutos ou com "..": o pacote vem da rede.
 */
export async function extractTar(
  file: string,
  dest: string,
  allow: (name: string) => boolean,
): Promise<string[]> {
  const extracted: string[] = [];
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size: total } = await handle.stat();
    let offset = 0;
    const head = Buffer.alloc(BLOCK);
    while (offset + BLOCK <= total) {
      await handle.read(head, 0, BLOCK, offset);
      offset += BLOCK;
      if (head.every((b) => b === 0)) break;
      const name = head.toString('utf8', 0, 100).replace(/\0.*$/s, '');
      const size = parseInt(
        head.toString('ascii', 124, 136).replace(/\0.*$/s, '').trim() || '0',
        8,
      );
      const type = head.toString('ascii', 156, 157);
      if (!Number.isFinite(size) || size < 0)
        throw new Error('pacote corrompido');
      const normalized = path.posix.normalize(name);
      const safe =
        (type === '0' || type === '\0') &&
        !normalized.startsWith('/') &&
        !normalized.split('/').includes('..') &&
        allow(normalized);
      if (safe) {
        const target = path.join(dest, ...normalized.split('/'));
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        const out = await fs.promises.open(target, 'w', 0o600);
        try {
          const chunk = Buffer.alloc(1024 * 1024);
          let left = size;
          let pos = offset;
          while (left > 0) {
            const { bytesRead } = await handle.read(
              chunk,
              0,
              Math.min(chunk.length, left),
              pos,
            );
            if (!bytesRead) throw new Error('pacote incompleto');
            await out.write(chunk.subarray(0, bytesRead));
            left -= bytesRead;
            pos += bytesRead;
          }
        } finally {
          await out.close();
        }
        extracted.push(normalized);
      }
      offset += Math.ceil(size / BLOCK) * BLOCK;
    }
  } finally {
    await handle.close();
  }
  return extracted;
}
