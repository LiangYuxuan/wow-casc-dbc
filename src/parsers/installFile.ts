import assert from 'node:assert';
import crypto from 'node:crypto';

import BLTEReader from '../blte.ts';

const INSTALL_MAGIC = 0x494e;

const MAGIC_OFFSET = 0;
const VERSION_OFFSET = 2;
const HASH_SIZE_OFFSET = 3;
const NUM_TAGS_OFFSET = 4;
const NUM_ENTRIES_OFFSET = 6;
const TAGS_OFFSET = 10;

interface InstallTag {
    name: string,
    type: number,
    files: boolean[],
}

interface InstallFile {
    name: string,
    hash: string,
    size: number,
    tags: InstallTag[],
}

interface InstallData {
    tags: InstallTag[],
    files: InstallFile[],
}

const parseInstallFile = (inputBuffer: Buffer, eKey: string, cKey: string): InstallData => {
    const reader = new BLTEReader(inputBuffer, eKey);
    reader.processBytes();

    const { buffer } = reader;

    const installHash = crypto.createHash('md5').update(buffer).digest('hex');
    assert(installHash === cKey, `Invalid root hash: expected ${cKey}, got ${installHash}`);

    const magic = buffer.readUInt16BE(MAGIC_OFFSET);
    assert(magic === INSTALL_MAGIC, `Invalid install magic: ${magic.toString(16).padStart(4, '0')}`);

    const version = buffer.readUInt8(VERSION_OFFSET);
    const hashSize = buffer.readUInt8(HASH_SIZE_OFFSET);
    const numTags = buffer.readUInt16BE(NUM_TAGS_OFFSET);
    const numEntries = buffer.readUInt32BE(NUM_ENTRIES_OFFSET);

    assert(version === 1, `Invalid install version: ${version.toString()}`);

    let pointer = TAGS_OFFSET;

    const tags: InstallTag[] = [];
    for (let i = 0; i < numTags; i += 1) {
        const startOffset = pointer;
        while (buffer[pointer] !== 0x00) {
            pointer += 1;
        }

        const name = buffer.toString('utf-8', startOffset, pointer);
        pointer += 1;

        const type = buffer.readUInt16BE(pointer);
        pointer += 2;

        const files = [];
        const finalOffset = pointer + Math.ceil(numEntries / 8);
        while (pointer < finalOffset) {
            const byte = buffer.readUInt8(pointer);
            pointer += 1;

            for (let j = 7; j >= 0; j -= 1) {
                // eslint-disable-next-line no-bitwise
                files.push((byte & (1 << j)) > 0);
            }
        }

        tags.push({ name, type, files });
    }

    const files: InstallFile[] = [];
    for (let i = 0; i < numEntries; i += 1) {
        const startOffset = pointer;
        while (buffer[pointer] !== 0x00) {
            pointer += 1;
        }

        const name = buffer.toString('utf-8', startOffset, pointer);
        pointer += 1;

        const hash = buffer.toString('hex', pointer, pointer + hashSize);
        pointer += hashSize;

        const size = buffer.readUInt32BE(pointer);
        pointer += 4;

        const fileTags = tags.filter((tag) => tag.files[i]);

        files.push({
            name,
            hash,
            size,
            tags: fileTags,
        });
    }

    return { tags, files };
};

export default parseInstallFile;

export type { InstallFile, InstallData };
