/* eslint-disable @typescript-eslint/naming-convention */

import assert from 'node:assert';
import crypto from 'node:crypto';

import BLTEReader from '../blte.ts';

const MFST_MAGIC = 0x4d465354;

const ContentFlags = {
    Install: 0x4,
    LoadOnWindows: 0x8,
    LoadOnMacOS: 0x10,
    x86_32: 0x20,
    x86_64: 0x40,
    LowViolence: 0x80,
    DoNotLoad: 0x100,
    UpdatePlugin: 0x800,
    ARM64: 0x8000,
    Encrypted: 0x8000000,
    NoNameHash: 0x10000000,
    UncommonResolution: 0x20000000,
    Bundle: 0x40000000,
    NoCompression: 0x80000000,
} as const;

const LocaleFlags = {
    enUS: 0x2,
    koKR: 0x4,
    frFR: 0x10,
    deDE: 0x20,
    zhCN: 0x40,
    esES: 0x80,
    zhTW: 0x100,
    enGB: 0x200,
    // enCN: 0x400,
    // enTW: 0x800,
    esMX: 0x1000,
    ruRU: 0x2000,
    ptBR: 0x4000,
    itIT: 0x8000,
    ptPT: 0x10000,
} as const;

interface FileInfo {
    cKey: string,
    contentFlags: number,
    localeFlags: number,
}

interface RootData {
    fileDataID2CKey: Map<number, FileInfo[]>,
    nameHash2FileDataID: Map<string, number>,
}

const parseRootFile = (inputBuffer: Buffer, eKey: string, cKey: string): RootData => {
    const reader = new BLTEReader(inputBuffer, eKey);
    reader.processBytes();

    const { buffer } = reader;

    const rootHash = crypto.createHash('md5').update(buffer).digest('hex');
    assert(rootHash === cKey, `Invalid root hash: expected ${cKey}, got ${rootHash}`);

    const fileDataID2CKey = new Map<number, FileInfo[]>();
    const nameHash2FileDataID = new Map<string, number>();

    const magic = buffer.readUInt32LE(0);
    if (magic === MFST_MAGIC) {
        // post 8.2.0
        const firstEntry = buffer.readUInt32LE(4);
        const newFormat = firstEntry < 100; // post 10.1.7

        const headerSize = newFormat ? firstEntry : 12;
        // const version = newFormat ? buffer.readUInt32LE(8) : 0;
        const totalFileCount = newFormat ? buffer.readUInt32LE(12) : firstEntry;
        const namedFileCount = newFormat ? buffer.readUInt32LE(16) : buffer.readUInt32LE(8);

        const allowNonNamedFiles = totalFileCount !== namedFileCount;

        let pointer = headerSize;
        while (pointer < buffer.byteLength) {
            const numRecords = buffer.readUInt32LE(pointer);
            const contentFlags = buffer.readUInt32LE(pointer + 4);
            const localeFlags = buffer.readUInt32LE(pointer + 8);
            pointer += 12;

            const fileDataIDs = [];
            let currFileDataID = -1;
            for (let i = 0; i < numRecords; i += 1) {
                currFileDataID += buffer.readUInt32LE(pointer) + 1;
                fileDataIDs.push(currFileDataID);
                pointer += 4;
            }

            for (let i = 0; i < numRecords; i += 1) {
                const fileDataID = fileDataIDs[i];
                const fileCKey = buffer.toString('hex', pointer, pointer + 16);
                pointer += 16;

                if (fileDataID2CKey.has(fileDataID)) {
                    fileDataID2CKey.get(fileDataID)?.push({
                        cKey: fileCKey,
                        contentFlags,
                        localeFlags,
                    });
                } else {
                    fileDataID2CKey.set(fileDataID, [
                        { cKey: fileCKey, contentFlags, localeFlags },
                    ]);
                }
            }

            // eslint-disable-next-line no-bitwise
            if (!(allowNonNamedFiles && (contentFlags & ContentFlags.NoNameHash))) {
                for (let i = 0; i < numRecords; i += 1) {
                    const fileDataID = fileDataIDs[i];
                    const nameHash = buffer.readBigUInt64LE(pointer).toString(16).padStart(16, '0');
                    pointer += 8;

                    nameHash2FileDataID.set(nameHash, fileDataID);
                }
            }
        }
    } else {
        // pre 8.2.0
        let pointer = 0;
        while (pointer < buffer.byteLength) {
            const numRecords = buffer.readUInt32LE(pointer);
            const contentFlags = buffer.readUInt32LE(pointer + 4);
            const localeFlags = buffer.readUInt32LE(pointer + 8);
            pointer += 12;

            const fileDataIDs = [];
            let currFileDataID = -1;
            for (let i = 0; i < numRecords; i += 1) {
                currFileDataID += buffer.readUInt32LE(pointer) + 1;
                fileDataIDs.push(currFileDataID);
                pointer += 4;
            }

            for (let i = 0; i < numRecords; i += 1) {
                const fileDataID = fileDataIDs[i];
                const fileCKey = buffer.toString('hex', pointer, pointer + 16);
                const nameHash = buffer.toString('hex', pointer + 16, pointer + 24);
                pointer += 24;

                if (fileDataID2CKey.has(fileDataID)) {
                    fileDataID2CKey.get(fileDataID)?.push({
                        cKey: fileCKey,
                        contentFlags,
                        localeFlags,
                    });
                } else {
                    fileDataID2CKey.set(fileDataID, [
                        { cKey: fileCKey, contentFlags, localeFlags },
                    ]);
                }

                nameHash2FileDataID.set(nameHash, fileDataID);
            }
        }
    }

    return { fileDataID2CKey, nameHash2FileDataID };
};

export default parseRootFile;

export { ContentFlags, LocaleFlags };

export type { FileInfo, RootData };
