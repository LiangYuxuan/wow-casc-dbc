import assert from 'node:assert';
import crypto from 'node:crypto';

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
import parseRootFile, { FileInfo } from './parsers/rootFile.ts';
import getNameHash from './jenkins96.ts';
import BLTEReader, { MissingKeyBlock } from './blte.ts';
import { resolveCDNHost, asyncQueue, formatFileSize } from './utils.ts';

import type { Version } from './parsers/productConfig.ts';

interface ClientPreloadData {
    prefixes: string[],
    archives: ReturnType<typeof parseArchiveIndex>,
    encoding: ReturnType<typeof parseEncodingFile>,
    rootFile: ReturnType<typeof parseRootFile>,
}

interface FileFetchResultFull {
    type: 'full',
    buffer: Buffer,
    blocks: [],
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

    public preload?: ClientPreloadData;

    static async getProductVersion(region: string, product: string): Promise<Version | undefined> {
        const versionsText = await getProductVersions(region, product);
        const versions = parseProductVersions(versionsText);
        return versions.find((version) => version.Region === region);
    }

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
            if (level >= LogLevel.error) {
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
        const cdnConfigText = await getConfigFile(prefixes, this.version.CDNConfig);
        const cdnConfig = parseCDNConfig(cdnConfigText);
        const buildConfigText = await getConfigFile(prefixes, this.version.BuildConfig);
        const buildConfig = parseBuildConfig(buildConfigText);

        this.log(LogLevel.info, 'Loading archives...');
        const archiveKeys = cdnConfig.archives.split(' ');
        const archiveCount = archiveKeys.length;
        const archiveTotalSize = cdnConfig.archivesIndexSize
            .split(' ')
            .reduce((a, b) => a + parseInt(b, 10), 0);
        const archives = new Map(
            (
                await asyncQueue(
                    archiveKeys,
                    async (key) => {
                        const fileName = `${key}.index`;
                        const buffer = await getDataFile(prefixes, fileName, 'indexes', this.version.BuildConfig);

                        return parseArchiveIndex(buffer, key);
                    },
                    50,
                )
            ).flatMap((e) => [...e]),
        );
        this.log(
            LogLevel.info,
            `Loaded ${archiveCount} archives (${archives.size} entries, ${formatFileSize(archiveTotalSize)})`,
        );

        this.log(LogLevel.info, 'Loading encoding table...');
        const [encodingCKey, encodingEKey] = buildConfig.encoding.split(' ');
        const encodingBuffer = await getDataFile(prefixes, encodingEKey, 'build', this.version.BuildConfig, 'encoding');
        this.log(LogLevel.info, `Loaded encoding table (${formatFileSize(encodingBuffer.byteLength)})`);

        this.log(LogLevel.info, 'Parsing encoding table...');
        const encoding = parseEncodingFile(encodingBuffer, encodingEKey, encodingCKey);
        this.log(LogLevel.info, `Parsed encoding table (${encoding.cKey2EKey.size} entries)`);

        this.log(LogLevel.info, 'Loading root table...');
        const rootCKey = buildConfig.root;
        const rootEKeys = encoding.cKey2EKey.get(rootCKey);
        assert(rootEKeys, 'Failing to find EKey for root table.');
        const rootEKey = typeof rootEKeys === 'string' ? rootEKeys : rootEKeys[0];
        const rootBuffer = await getDataFile(prefixes, rootEKey, 'build', this.version.BuildConfig, 'root');
        this.log(LogLevel.info, `Loaded root table (${formatFileSize(rootBuffer.byteLength)})`);

        this.log(LogLevel.info, 'Parsing root file...');
        const rootFile = parseRootFile(rootBuffer, rootEKey, rootCKey);
        this.log(LogLevel.info, `Parsed root file (${rootFile.fileDataID2CKey.size} entries, ${rootFile.nameHash2FileDataID.size} hashes)`);

        this.preload = {
            prefixes,
            archives,
            encoding,
            rootFile,
        };
    }

    async loadRemoteListFile(): Promise<void> {
        const url = 'https://github.com/wowdev/wow-listfile/releases/download/202402031841/community-listfile.csv';
        const text = await (await fetch(url)).text();
        const lines = text.split('\n');
        lines.forEach((line) => {
            const [fileDataID, name] = line.split(';');
            this.name2FileDataID.set(name.trim(), parseInt(fileDataID.trim(), 10));
        });
    }

    getFileDataIDByName(name: string): number | undefined {
        assert(this.preload, 'Client not initialized');

        const { rootFile } = this.preload;
        const { nameHash2FileDataID } = rootFile;

        const nameHash = getNameHash(name);
        return nameHash2FileDataID.get(nameHash) ?? this.name2FileDataID.get(name);
    }

    getContentKeysByFileDataID(fileDataID: number): FileInfo[] | undefined {
        assert(this.preload, 'Client not initialized');

        const { rootFile } = this.preload;

        return rootFile.fileDataID2CKey.get(fileDataID);
    }

    async getFileByContentKey(
        contentKey: string,
        allowMissingKey = false,
    ): Promise<FileFetchResult> {
        assert(this.preload, 'Client not initialized');

        const { prefixes, encoding, archives } = this.preload;
        const eKeys = encoding.cKey2EKey.get(contentKey);
        assert(eKeys, `Failing to find encoding key for ${contentKey}`);

        const eKey = typeof eKeys === 'string' ? eKeys : eKeys[0];

        const archive = archives.get(eKey);
        const blte = archive
            ? await getDataFile(prefixes, archive.key, 'data', this.version.BuildConfig, eKey, archive.offset, archive.size)
            : await getDataFile(prefixes, eKey, 'data', this.version.BuildConfig);

        const reader = new BLTEReader(blte, eKey);
        const blocks = reader.processBytes(allowMissingKey);

        if (blocks.length === 0) {
            const hash = crypto.createHash('md5').update(reader.buffer).digest('hex');
            assert(hash === contentKey, `Invalid hash: expected ${contentKey}, got ${hash}`);

            return {
                type: 'full',
                buffer: reader.buffer,
                blocks: [],
            };
        }

        return {
            type: 'partial',
            buffer: reader.buffer,
            blocks,
        };
    }
}
