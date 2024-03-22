import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';

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
    partialOffset = undefined as number | undefined,
    partialLength = undefined as number | undefined,
): Promise<Buffer> => new Promise((resolve, reject) => {
    const options = {
        headers: {
            'User-Agent': USER_AGENT,
            Range: partialOffset && partialLength
                ? `bytes=${partialOffset.toString()}-${(partialOffset + partialLength - 1).toString()}`
                : 'bytes=0-',
        },
    };

    http.get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
            if (res.headers.location) {
                requestData(res.headers.location, partialOffset, partialLength)
                    .then(resolve)
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/use-unknown-in-catch-callback-variable
                    .catch(reject);
            } else {
                reject(new Error(`Failed to request ${url}, Status Code: ${res.statusCode.toString()}`));
            }
            return;
        }

        if (!res.statusCode || res.statusCode < 200 || res.statusCode > 302) {
            reject(new Error(`Failed to request ${url}, Status Code: ${res.statusCode?.toString() ?? 'undefined'}`));
            return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => { resolve(Buffer.concat(chunks)); });
    })
        .on('error', reject)
        .end();
});

const downloadFile = (
    prefixes: string[],
    type: 'data' | 'config',
    key: string,
    partialOffset = undefined as number | undefined,
    partialLength = undefined as number | undefined,
): Promise<Buffer> => {
    const urls = prefixes.map((prefix) => `${prefix}/${type}/${formatCDNKey(key)}`);

    return urls
        .reduce(
            (prev, url) => prev
                .catch(() => requestData(url, partialOffset, partialLength)),
            Promise.reject<Buffer>(new Error('')),
        );
};

const getFileCache = async (file: string): Promise<Buffer | undefined> => {
    const integrity = await cacheIntegrity.get(file);
    if (integrity) {
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
    name?: string,
    partialOffset = undefined as number | undefined,
    partialLength = undefined as number | undefined,
): Promise<Buffer> => {
    const dir = type === 'build'
        ? path.join(CACHE_DIRS[type], buildCKey)
        : CACHE_DIRS[type];
    const file = name ? path.join(dir, name) : path.join(dir, key);
    const cacheBuffer = await getFileCache(file);

    if (cacheBuffer) {
        if (name === undefined && partialOffset !== undefined && partialLength !== undefined) {
            return cacheBuffer.subarray(partialOffset, partialOffset + partialLength);
        }
        return cacheBuffer;
    }

    const downloadBuffer = await downloadFile(prefixes, 'data', key, partialOffset, partialLength);
    if ((partialOffset === undefined && partialLength === undefined) || name) {
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
): Promise<string> => {
    const downloadBuffer = await downloadFile(prefixes, 'config', key);
    return downloadBuffer.toString('utf-8');
};

export const getProductVersions = async (
    region: string,
    product: string,
): Promise<string> => {
    const url = `http://${region}.patch.battle.net:1119/${product}/versions`;
    const headers = {
        'User-Agent': USER_AGENT,
    };

    const res = await fetch(url, { headers });

    return res.text();
};

export const getProductCDNs = async (
    region: string,
    product: string,
): Promise<string> => {
    const url = `http://${region}.patch.battle.net:1119/${product}/cdns`;
    const headers = {
        'User-Agent': USER_AGENT,
    };

    const res = await fetch(url, { headers });

    return res.text();
};
