import assert from 'node:assert';
import crypto from 'node:crypto';

import { recordLog, LogLevel } from './logger.ts';
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
import getFileDataIDByNameRemote from './listfile.ts';
import BLTEReader from './blte.ts';
import { resolveCDNHost, asyncQueue, formatFileSize } from './utils.ts';

import type { Version } from './parsers/productConfig.ts';

interface ClientPreloadData {
    prefixes: string[],
    archives: ReturnType<typeof parseArchiveIndex>,
    encoding: ReturnType<typeof parseEncodingFile>,
    rootFile: ReturnType<typeof parseRootFile>,
}

export default class CASCClient {
    public readonly region: string;

    public readonly product: string;

    public readonly version: Version;

    public preload?: ClientPreloadData;

    static async getProductVersion(region: string, product: string): Promise<Version | undefined> {
        const versionsText = await getProductVersions(region, product);
        const versions = parseProductVersions(versionsText);
        return versions.find((version) => version.Region === region);
    }

    constructor(region: string, product: string, version: Version) {
        this.region = region;
        this.product = product;
        this.version = version;
    }

    async init(): Promise<void> {
        recordLog(LogLevel.info, 'Preloading remote CASC build:');
        recordLog(LogLevel.info, this.version);

        recordLog(LogLevel.info, 'Fetching CDN configuration...');
        const serverConfigText = await getProductCDNs(this.region, this.product);
        const serverConfig = parseProductCDNs(serverConfigText).find(
            (config) => config.Name === this.region,
        );
        assert(serverConfig, 'No server config found');

        recordLog(LogLevel.info, 'Locating fastest CDN server...');
        const prefixes = await resolveCDNHost(
            serverConfig.Hosts.split(' '),
            serverConfig.Path,
        );
        recordLog(LogLevel.info, 'Resolved CDN servers:');
        prefixes.forEach((prefix) => {
            recordLog(LogLevel.info, prefix);
        });

        recordLog(LogLevel.info, 'Fetching build configurations...');
        const cdnConfigText = await getConfigFile(prefixes, this.version.CDNConfig);
        const cdnConfig = parseCDNConfig(cdnConfigText);
        const buildConfigText = await getConfigFile(prefixes, this.version.BuildConfig);
        const buildConfig = parseBuildConfig(buildConfigText);

        recordLog(LogLevel.info, 'Loading archives...');
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
        recordLog(
            LogLevel.info,
            `Loaded ${archiveCount} archives (${archives.size} entries, ${formatFileSize(archiveTotalSize)})`,
        );

        recordLog(LogLevel.info, 'Loading encoding table...');
        const [encodingCKey, encodingEKey] = buildConfig.encoding.split(' ');
        const encodingBuffer = await getDataFile(prefixes, encodingEKey, 'build', this.version.BuildConfig, 'encoding');
        recordLog(LogLevel.info, `Loaded encoding table (${formatFileSize(encodingBuffer.byteLength)})`);

        recordLog(LogLevel.info, 'Parsing encoding table...');
        const encoding = parseEncodingFile(encodingBuffer, encodingEKey, encodingCKey);
        recordLog(LogLevel.info, `Parsed encoding table (${encoding.cKey2EKey.size} entries)`);

        recordLog(LogLevel.info, 'Loading root table...');
        const rootCKey = buildConfig.root;
        const rootEKeys = encoding.cKey2EKey.get(rootCKey);
        assert(rootEKeys, 'Failing to find EKey for root table.');
        const rootEKey = typeof rootEKeys === 'string' ? rootEKeys : rootEKeys[0];
        const rootBuffer = await getDataFile(prefixes, rootEKey, 'build', this.version.BuildConfig, 'root');
        recordLog(LogLevel.info, `Loaded root table (${formatFileSize(rootBuffer.byteLength)})`);

        recordLog(LogLevel.info, 'Parsing root file...');
        const rootFile = parseRootFile(rootBuffer, rootEKey, rootCKey);
        recordLog(LogLevel.info, `Parsed root file (${rootFile.fileDataID2CKey.size} entries, ${rootFile.nameHash2FileDataID.size} hashes)`);

        this.preload = {
            prefixes,
            archives,
            encoding,
            rootFile,
        };
    }

    async getFileDataIDByName(name: string, useRemote = false): Promise<number | undefined> {
        assert(this.preload, 'Client not initialized');

        const { rootFile } = this.preload;
        const { nameHash2FileDataID } = rootFile;

        const nameHash = getNameHash(name);
        const fileDataID = nameHash2FileDataID.get(nameHash);
        if (!useRemote || fileDataID) {
            return fileDataID;
        }

        return getFileDataIDByNameRemote(name);
    }

    getContentKeysByFileDataID(fileDataID: number): FileInfo[] | undefined {
        assert(this.preload, 'Client not initialized');

        const { rootFile } = this.preload;

        return rootFile.fileDataID2CKey.get(fileDataID);
    }

    async getFileByContentKey(contentKey: string): Promise<Buffer> {
        assert(this.preload, 'Client not initialized');

        const { prefixes, encoding } = this.preload;
        const eKeys = encoding.cKey2EKey.get(contentKey);
        assert(eKeys, `Failing to find encoding key for ${contentKey}`);

        const eKey = typeof eKeys === 'string' ? eKeys : eKeys[0];
        const blte = await getDataFile(prefixes, eKey, 'data', this.version.BuildConfig, 'data');

        const reader = new BLTEReader(blte, eKey);
        reader.processBytes();

        const hash = crypto.createHash('md5').update(reader.buffer).digest('hex');
        assert(hash === contentKey, `Invalid content key: expected ${contentKey}, got ${hash}`);

        return reader.buffer;
    }
}
