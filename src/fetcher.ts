import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

import cliProgress from 'cli-progress';

import Store from './store.ts';

const USER_AGENT = 'node-wow-casc-dbc';

const CACHE_ROOT = path.resolve('cache');
const CACHE_DIRS = {
    build: 'builds',
    indexes: 'indices',
    data: 'data',
    dbd: 'dbd',
};

const CACHE_INTEGRITY_FILE = path.resolve(CACHE_ROOT, 'integrity.json');

const cacheIntegrity = new Store<string, string>(CACHE_INTEGRITY_FILE);

const formatCDNKey = (key: string): string => `${key.substring(0, 2)}/${key.substring(2, 4)}/${key}`;

const requestData = async (
    url: string,
    {
        partialOffset,
        partialLength,
        showProgress,
    }: {
        partialOffset?: number,
        partialLength?: number,
        showProgress?: boolean,
    } = {},
): Promise<Buffer> => new Promise((resolve, reject) => {
    const options = {
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'User-Agent': USER_AGENT,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            Range: partialOffset !== undefined && partialLength !== undefined
                ? `bytes=${partialOffset.toString()}-${(partialOffset + partialLength - 1).toString()}`
                : 'bytes=0-',
        },
    };

    http.get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
            if (res.headers.location !== undefined) {
                requestData(res.headers.location, { partialOffset, partialLength, showProgress })
                    .then(resolve)
                    .catch((err: unknown) => {
                        throw err;
                    });
            } else {
                reject(new Error(`Failed to request ${url}, Status Code: ${res.statusCode.toString()}`));
            }
            return;
        }

        if (res.statusCode === undefined || res.statusCode < 200 || res.statusCode > 302) {
            reject(new Error(`Failed to request ${url}, Status Code: ${res.statusCode?.toString() ?? 'undefined'}`));
            return;
        }

        const lengthText = res.headers['content-length'];
        const length = lengthText !== undefined ? parseInt(lengthText, 10) : 0;
        const bar = showProgress === true && !Number.isNaN(length) && length >= 10485760
            ? new cliProgress.SingleBar({ etaBuffer: 10240 }, cliProgress.Presets.shades_classic)
            : undefined;
        bar?.start(length, 0);

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => {
            bar?.increment(chunk.length);
            chunks.push(chunk);
        });
        res.on('end', () => {
            bar?.stop();
            resolve(Buffer.concat(chunks));
        });
        res.on('error', (err) => {
            bar?.stop();
            reject(err);
        });
    })
        .on('error', reject)
        .end();
});

const downloadFile = (
    prefixes: string[],
    type: 'data' | 'config',
    key: string,
    {
        partialOffset,
        partialLength,
        showProgress,
        showAttemptFail,
    }: {
        partialOffset?: number,
        partialLength?: number,
        showProgress?: boolean,
        showAttemptFail?: boolean,
    } = {},
): Promise<Buffer> => {
    const urls = prefixes.map((prefix) => `${prefix}/${type}/${formatCDNKey(key)}`);

    return urls
        .reduce(
            (prev, url, index) => prev
                .catch((err: unknown) => {
                    if (showAttemptFail === true && index > 0 && err instanceof Error) {
                        console.warn(`${new Date().toISOString()} [WARN]:`, err.message);
                    }
                    return requestData(url, { partialOffset, partialLength, showProgress });
                }),
            Promise.reject<Buffer>(new Error('')),
        );
};

const getFileCache = async (file: string): Promise<Buffer | undefined> => {
    const integrity = await cacheIntegrity.get(file);
    if (integrity !== undefined) {
        try {
            const buffer = await fs.readFile(path.resolve(CACHE_ROOT, file));
            const hash = crypto.createHash('sha256').update(buffer).digest('hex');
            if (hash === integrity) {
                return buffer;
            }
        } catch {
            // ignore
        }
    }
    return undefined;
};

export const getDataFile = async (
    prefixes: string[],
    key: string,
    type: keyof typeof CACHE_DIRS,
    buildCKey: string,
    {
        name,
        partialOffset,
        partialLength,
        showProgress,
        showAttemptFail,
    }: {
        name?: string,
        partialOffset?: number,
        partialLength?: number,
        showProgress?: boolean,
        showAttemptFail?: boolean,
    } = {},
): Promise<Buffer> => {
    const dir = type === 'build'
        ? path.join(CACHE_DIRS[type], buildCKey)
        : CACHE_DIRS[type];
    const file = name !== undefined ? path.join(dir, name) : path.join(dir, key);
    const cacheBuffer = await getFileCache(file);

    if (cacheBuffer) {
        if (name === undefined && partialOffset !== undefined && partialLength !== undefined) {
            return cacheBuffer.subarray(partialOffset, partialOffset + partialLength);
        }
        return cacheBuffer;
    }

    const downloadBuffer = await downloadFile(prefixes, 'data', key, {
        partialOffset, partialLength, showProgress, showAttemptFail,
    });
    if ((partialOffset === undefined && partialLength === undefined) || name !== undefined) {
        await fs.mkdir(path.resolve(CACHE_ROOT, dir), { recursive: true });
        await fs.writeFile(path.resolve(CACHE_ROOT, file), downloadBuffer);

        const hash = crypto.createHash('sha256').update(downloadBuffer).digest('hex');
        await cacheIntegrity.set(file, hash);
    }

    return downloadBuffer;
};

export const getConfigFile = async (
    prefixes: string[],
    key: string,
    {
        showProgress, showAttemptFail,
    }: {
        showProgress?: boolean, showAttemptFail?: boolean,
    } = {},
): Promise<string> => {
    const downloadBuffer = await downloadFile(prefixes, 'config', key, { showProgress, showAttemptFail });
    return downloadBuffer.toString('utf-8');
};

export const getProductVersions = async (
    region: string,
    product: string,
): Promise<string> => {
    const url = `http://${region}.patch.battle.net:1119/${product}/versions`;
    const headers = new Headers();
    headers.set('User-Agent', USER_AGENT);

    const res = await fetch(url, { headers });

    return res.text();
};

export const getProductCDNs = async (
    region: string,
    product: string,
): Promise<string> => {
    const url = `http://${region}.patch.battle.net:1119/${product}/cdns`;
    const headers = new Headers();
    headers.set('User-Agent', USER_AGENT);

    const res = await fetch(url, { headers });

    return res.text();
};
