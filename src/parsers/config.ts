import assert from 'node:assert';

const normalizeKey = (key: string): string => key
    .split('-')
    .map((part, index) => (
        index === 0
            ? part
            : `${part.charAt(0).toUpperCase()}${part.slice(1)}`
    ))
    .join('');

const parseConfig = (text: string): Record<string, string> => {
    const entries: Record<string, string> = {};

    text
        .split(/\r?\n/)
        .filter((line) => line.trim().length !== 0 && !line.startsWith('#'))
        .forEach((line) => {
            const match = /([^\s]+)\s?=\s?(.*)/.exec(line);
            assert(match !== null, 'Invalid token encountered parsing CDN config');

            const [key, value] = match.slice(1);
            entries[normalizeKey(key)] = value;
        });

    return entries;
};

interface CDNConfig {
    archives: string,
    archivesIndexSize: string,
    archiveGroup: string,
    patchArchives: string,
    patchArchivesIndexSize: string,
    patchArchiveGroup: string,
    fileIndex: string,
    fileIndexSize: string,
    patchFileIndex: string,
    patchFileIndexSize: string,
}

const parseCDNConfig = (
    text: string,
): CDNConfig => parseConfig(text) as unknown as CDNConfig;

interface BuildConfig {
    root: string,
    install: string,
    installSize: string,
    download: string,
    downloadSize: string,
    size: string,
    sizeSize: string,
    encoding: string,
    encodingSize: string,
    patchIndex: string,
    patchIndexSize: string,
    patch: string,
    patchSize: string,
    patchConfig: string,
    buildName: string,
    buildUid: string,
    buildProduct: string,
    buildPlaybuildInstaller: string,
    buildPartialPriority: string,
    vfsRoot: string,
    vfsRootSize: string,
    [key: `vfs${number}` | `vfs${number}Size`]: string,
}

const parseBuildConfig = (
    text: string,
): BuildConfig => parseConfig(text) as unknown as BuildConfig;

export { parseCDNConfig, parseBuildConfig };
