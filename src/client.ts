import assert from 'node:assert';
import crypto from 'node:crypto';

import { mapLimit, retry } from 'async';
import cliProgress from 'cli-progress';

import {
    getProductVersions,
    getProductCDNs,
    getConfigFile,
    getDataFile,
} from './fetcher.ts';
import { parseProductVersions, parseProductCDNs } from './parsers/productConfig.ts';
import { parseCDNConfig, parseBuildConfig } from './parsers/config.ts';
import parseArchiveIndex from './parsers/archiveIndex.ts';
import parseEncodingFile from './parsers/encodingFile.ts';
import parseRootFile, { LocaleFlags, ContentFlags } from './parsers/rootFile.ts';
import getNameHash from './jenkins96.ts';
import BLTEReader from './blte.ts';
import WDCReader from './wdc.ts';
import { resolveCDNHost, formatFileSize } from './utils.ts';

import type { Version } from './parsers/productConfig.ts';
import type { FileInfo } from './parsers/rootFile.ts';
import type { MissingKeyBlock } from './blte.ts';

interface ClientPreloadData {
    prefixes: string[],
    archives: ReturnType<typeof parseArchiveIndex>,
    encoding: ReturnType<typeof parseEncodingFile>,
    rootFile: ReturnType<typeof parseRootFile>,
}

interface FileFetchResultFull {
    type: 'full',
    buffer: Buffer,
}

interface FileFetchResultPartial {
    type: 'partial',
    buffer: Buffer,
    blocks: MissingKeyBlock[],
}

type FileFetchResult = FileFetchResultFull | FileFetchResultPartial;

enum LogLevel {
    error = 0,
    warn = 1,
    info = 2,
    debug = 3,
}

const textLogLevel = ['ERROR', 'WARN', 'INFO', 'DEBUG'] as const;

export default class CASCClient {
    public readonly region: string;

    public readonly product: string;

    public readonly version: Version;

    public readonly name2FileDataID = new Map<string, number>();

    public readonly keys = new Map<string, Uint8Array>();

    public preload?: ClientPreloadData;

    static async getProductVersion(region: string, product: string): Promise<Version | undefined> {
        const versionsText = await getProductVersions(region, product);
        const versions = parseProductVersions(versionsText);
        return versions.find((version) => version.Region === region);
    }

    public static LocaleFlags = LocaleFlags;

    public static ContentFlags = ContentFlags;

    public static LogLevel = LogLevel;

    public logLevel: LogLevel;

    constructor(region: string, product: string, version: Version, logLevel = LogLevel.info) {
        this.region = region;
        this.product = product;
        this.version = version;
        this.logLevel = logLevel;
    }

    private log(level: LogLevel, message: unknown): void {
        if (level <= this.logLevel) {
            if (level <= LogLevel.error) {
                // eslint-disable-next-line no-console
                console.error(`${new Date().toISOString()} [${textLogLevel[level]}]:`, message);
            } else {
                // eslint-disable-next-line no-console
                console.log(`${new Date().toISOString()} [${textLogLevel[level]}]:`, message);
            }
        }
    }

    async init(): Promise<void> {
        this.log(LogLevel.info, 'Preloading remote CASC build:');
        this.log(LogLevel.info, this.version);

        this.log(LogLevel.info, 'Fetching CDN configuration...');
        const serverConfigText = await getProductCDNs(this.region, this.product);
        const serverConfig = parseProductCDNs(serverConfigText).find(
            (config) => config.Name === this.region,
        );
        assert(serverConfig, 'No server config found');

        this.log(LogLevel.info, 'Locating fastest CDN server...');
        const prefixes = await resolveCDNHost(
            serverConfig.Hosts.split(' '),
            serverConfig.Path,
        );
        this.log(LogLevel.info, 'Resolved CDN servers:');
        prefixes.forEach((prefix) => {
            this.log(LogLevel.info, prefix);
        });

        this.log(LogLevel.info, 'Fetching build configurations...');
        const cdnConfigText = await getConfigFile(prefixes, this.version.CDNConfig, {
            showAttemptFail: this.logLevel >= LogLevel.warn,
        });
        const cdnConfig = parseCDNConfig(cdnConfigText);
        const buildConfigText = await getConfigFile(prefixes, this.version.BuildConfig, {
            showAttemptFail: this.logLevel >= LogLevel.warn,
        });
        const buildConfig = parseBuildConfig(buildConfigText);

        this.log(LogLevel.info, 'Loading archives...');
        const archiveKeys = cdnConfig.archives.split(' ');
        const archiveCount = archiveKeys.length;
        const archiveTotalSize = cdnConfig.archivesIndexSize
            .split(' ')
            .reduce((a, b) => a + parseInt(b, 10), 0);
        const archiveBar = this.logLevel >= LogLevel.info
            ? new cliProgress.SingleBar({ etaBuffer: 100 }, cliProgress.Presets.shades_classic)
            : undefined;
        archiveBar?.start(archiveCount, 0);
        const archivesMapArray = await mapLimit(
            archiveKeys,
            50,
            async (key: string) => {
                const fileName = `${key}.index`;
                const buffer = await retry({
                    times: 5,
                    interval: 3000,
                }, async () => getDataFile(prefixes, fileName, 'indexes', this.version.BuildConfig, {
                    showProgress: this.logLevel >= LogLevel.info,
                    showAttemptFail: this.logLevel >= LogLevel.warn,
                }));
                const map = parseArchiveIndex(buffer, key);

                archiveBar?.increment();

                return map;
            },
        )
            .then((result) => {
                archiveBar?.stop();
                return result.flatMap((e) => [...e]);
            })
            .catch((error: unknown) => {
                archiveBar?.stop();
                throw error;
            });
        const archives = new Map(archivesMapArray);
        this.log(
            LogLevel.info,
            `Loaded ${archiveCount.toString()} archives (${archives.size.toString()} entries, ${formatFileSize(archiveTotalSize)})`,
        );

        this.log(LogLevel.info, 'Loading encoding table...');
        const [encodingCKey, encodingEKey] = buildConfig.encoding.split(' ');
        const encodingBuffer = await getDataFile(prefixes, encodingEKey, 'build', this.version.BuildConfig, {
            name: 'encoding',
            showProgress: this.logLevel >= LogLevel.info,
            showAttemptFail: this.logLevel >= LogLevel.warn,
        });
        this.log(LogLevel.info, `Loaded encoding table (${formatFileSize(encodingBuffer.byteLength)})`);

        this.log(LogLevel.info, 'Parsing encoding table...');
        const encoding = parseEncodingFile(encodingBuffer, encodingEKey, encodingCKey);
        this.log(LogLevel.info, `Parsed encoding table (${encoding.cKey2EKey.size.toString()} entries)`);

        this.log(LogLevel.info, 'Loading root table...');
        const rootCKey = buildConfig.root;
        const rootEKeys = encoding.cKey2EKey.get(rootCKey);
        assert(rootEKeys, 'Failing to find EKey for root table.');
        const rootEKey = typeof rootEKeys === 'string' ? rootEKeys : rootEKeys[0];
        const rootBuffer = await getDataFile(prefixes, rootEKey, 'build', this.version.BuildConfig, {
            name: 'root',
            showProgress: this.logLevel >= LogLevel.info,
            showAttemptFail: this.logLevel >= LogLevel.warn,
        });
        this.log(LogLevel.info, `Loaded root table (${formatFileSize(rootBuffer.byteLength)})`);

        this.log(LogLevel.info, 'Parsing root file...');
        const rootFile = parseRootFile(rootBuffer, rootEKey, rootCKey);
        this.log(LogLevel.info, `Parsed root file (${rootFile.fileDataID2CKey.size.toString()} entries, ${rootFile.nameHash2FileDataID.size.toString()} hashes)`);

        this.preload = {
            prefixes,
            archives,
            encoding,
            rootFile,
        };
    }

    async loadRemoteListFile(): Promise<void> {
        const url = 'https://github.com/wowdev/wow-listfile/releases/latest/download/community-listfile.csv';
        const text = await (await fetch(url)).text();
        const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

        lines.forEach((line) => {
            const [fileDataID, name] = line.split(';');
            this.name2FileDataID.set(name.trim(), parseInt(fileDataID.trim(), 10));
        });
    }

    async loadRemoteTACTKeys(): Promise<void> {
        const url = 'https://raw.githubusercontent.com/wowdev/TACTKeys/master/WoW.txt';
        const text = await (await fetch(url)).text();
        const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);

        lines.forEach((line) => {
            const [keyName, keyHex] = line.split(' ');

            assert(keyName.length === 16, `Invalid keyName length: ${keyName.length.toString()}`);
            assert(keyHex.length === 32, `Invalid key length: ${keyHex.length.toString()}`);

            const key = Uint8Array.from(Buffer.from(keyHex, 'hex'));

            this.keys.set(keyName.toLowerCase(), key);
        });
    }

    async loadTACTKeys(): Promise<void> {
        const keysCKeys = this.getContentKeysByFileDataID(1302850);
        const lookupCKeys = this.getContentKeysByFileDataID(1302851);

        assert(keysCKeys?.[0], 'Failing to find dbfilesclient/tactkey.db2');
        assert(lookupCKeys?.[0], 'Failing to find dbfilesclient/tactkeylookup.db2');

        const [keysResult, lookupResult] = await Promise.all([
            this.getFileByContentKey(keysCKeys[0].cKey),
            this.getFileByContentKey(lookupCKeys[0].cKey),
        ]);

        const keysReader = new WDCReader(keysResult.buffer);
        const lookupReader = new WDCReader(lookupResult.buffer);

        [...lookupReader.rows.keys()].forEach((keyID) => {
            const lookupRow = lookupReader.rows.get(keyID);
            const keyRow = keysReader.rows.get(keyID);

            if (keyRow) {
                assert(Array.isArray(lookupRow) && lookupRow[0], `Invalid TACTKeyLookup table row at id ${keyID.toString()}`);
                assert(Array.isArray(keyRow) && keyRow[0], `Invalid TACTKey table row at id ${keyID.toString()}`);

                const keyName = lookupRow[0].data.toString(16).padStart(16, '0');
                const keyHexLE = keyRow[0].data.toString(16).padStart(32, '0');

                assert(keyName.length === 16, `Invalid keyName length: ${keyName.length.toString()}`);
                assert(keyHexLE.length === 32, `Invalid key length: ${keyHexLE.length.toString()}`);

                const keyHex = [...keyHexLE.matchAll(/.{2}/g)].map((v) => v[0]).reverse().join('');
                const key = Uint8Array.from(Buffer.from(keyHex, 'hex'));

                this.keys.set(keyName.toLowerCase(), key);
            }
        });
    }

    getFileDataIDByName(name: string): number | undefined {
        assert(this.preload, 'Client not initialized');

        const { rootFile } = this.preload;
        const { nameHash2FileDataID } = rootFile;

        const nameHash = getNameHash(name);
        return nameHash2FileDataID.get(nameHash) ?? this.name2FileDataID.get(name.toLowerCase());
    }

    getContentKeysByFileDataID(fileDataID: number): FileInfo[] | undefined {
        assert(this.preload, 'Client not initialized');

        const { rootFile } = this.preload;

        return rootFile.fileDataID2CKey.get(fileDataID);
    }

    async getFileByContentKey(cKey: string, allowMissingKey?: false): Promise<FileFetchResultFull>;
    async getFileByContentKey(cKey: string, allowMissingKey: true): Promise<FileFetchResult>;
    async getFileByContentKey(cKey: string, allowMissingKey = false): Promise<FileFetchResult> {
        assert(this.preload, 'Client not initialized');

        const { prefixes, encoding, archives } = this.preload;
        const eKeys = encoding.cKey2EKey.get(cKey);
        assert(eKeys, `Failing to find encoding key for ${cKey}`);

        const eKey = typeof eKeys === 'string' ? eKeys : eKeys[0];

        const archive = archives.get(eKey);
        const blte = archive
            ? await getDataFile(prefixes, archive.key, 'data', this.version.BuildConfig, {
                name: eKey,
                partialOffset: archive.offset,
                partialLength: archive.size,
                showProgress: this.logLevel >= LogLevel.info,
                showAttemptFail: this.logLevel >= LogLevel.warn,
            })
            : await getDataFile(prefixes, eKey, 'data', this.version.BuildConfig, {
                showProgress: this.logLevel >= LogLevel.info,
                showAttemptFail: this.logLevel >= LogLevel.warn,
            });

        const reader = new BLTEReader(blte, eKey, this.keys);
        if (!allowMissingKey) {
            reader.processBytes(allowMissingKey);

            return {
                type: 'full',
                buffer: reader.buffer,
            };
        }

        const blocks = reader.processBytes(allowMissingKey);

        if (blocks.length === 0) {
            const hash = crypto.createHash('md5').update(reader.buffer).digest('hex');
            assert(hash === cKey, `Invalid hash: expected ${cKey}, got ${hash}`);

            return {
                type: 'full',
                buffer: reader.buffer,
            };
        }

        return {
            type: 'partial',
            buffer: reader.buffer,
            blocks,
        };
    }
}
