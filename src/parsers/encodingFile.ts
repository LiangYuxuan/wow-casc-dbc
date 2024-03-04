import assert from 'node:assert';
import crypto from 'node:crypto';

import BLTEReader from '../blte.ts';

const ENC_MAGIC = 0x454e;

const MAGIC_OFFSET = 0;
const VERSION_OFFSET = 2;
const HASH_SIZE_CKEY_OFFSET = 3;
const HASH_SIZE_EKEY_OFFSET = 4;
const CKEY_PAGE_SIZE_OFFSET = 5;
const EKEY_PAGE_SIZE_OFFSET = 7;
const CKEY_PAGE_COUNT_OFFSET = 9;
const EKEY_PAGE_COUNT_OFFSET = 13;
// const UNK11_OFFSET = 17;
const SPEC_BLOCK_SIZE_OFFSET = 18;
const SPEC_BLOCK_OFFSET = 22;

interface EncodingData {
    eSpec: string[],
    cKey2FileSize: Map<string, number>,
    cKey2EKey: Map<string, string | string[]>,
    eKey2ESpecIndex: Map<string, number>,
    eKey2FileSize: Map<string, number>,
}

const parseEncodingFile = (inputBuffer: Buffer, eKey: string, cKey: string): EncodingData => {
    const reader = new BLTEReader(inputBuffer, eKey);
    reader.processBytes();

    const { buffer } = reader;

    const encodingHash = crypto.createHash('md5').update(buffer).digest('hex');
    assert(encodingHash === cKey, `Invalid encoding hash: expected ${cKey}, got ${encodingHash}`);

    const magic = buffer.readUInt16BE(MAGIC_OFFSET);
    assert(magic === ENC_MAGIC, `Invalid encoding magic: ${magic}`);

    const version = buffer.readUInt8(VERSION_OFFSET);
    const hashSizeCKey = buffer.readUInt8(HASH_SIZE_CKEY_OFFSET);
    const hashSizeEKey = buffer.readUInt8(HASH_SIZE_EKEY_OFFSET);
    const cKeyPageSizeKB = buffer.readUInt16BE(CKEY_PAGE_SIZE_OFFSET);
    const eKeyPageSizeKB = buffer.readUInt16BE(EKEY_PAGE_SIZE_OFFSET);
    const cKeyPageCount = buffer.readUInt32BE(CKEY_PAGE_COUNT_OFFSET);
    const eKeyPageCount = buffer.readUInt32BE(EKEY_PAGE_COUNT_OFFSET);
    const specBlockSize = buffer.readUInt32BE(SPEC_BLOCK_SIZE_OFFSET);

    assert(version === 1, `Invalid encoding version: ${version}`);

    const eSpec: string[] = [];
    let eSpecStringStart = SPEC_BLOCK_OFFSET;
    for (
        let i = SPEC_BLOCK_OFFSET;
        i < SPEC_BLOCK_OFFSET + specBlockSize;
        i += 1
    ) {
        if (buffer[i] === 0x00) {
            eSpec.push(buffer.toString('ascii', eSpecStringStart, i));
            eSpecStringStart = i + 1;
        }
    }

    const cKey2FileSize = new Map<string, number>();
    const cKey2EKey = new Map<string, string | string[]>();
    const cKeyPageIndexOffset = SPEC_BLOCK_OFFSET + specBlockSize;
    const cKeyPageIndexEntrySize = hashSizeCKey + 0x10;
    const cKeyPageOffset = cKeyPageIndexOffset + cKeyPageIndexEntrySize * cKeyPageCount;
    const cKeyPageSize = cKeyPageSizeKB * 1024;
    for (let i = 0; i < cKeyPageCount; i += 1) {
        const indexOffset = cKeyPageIndexOffset + i * cKeyPageIndexEntrySize;
        const pageOffset = cKeyPageOffset + i * cKeyPageSize;

        const firstCKey = buffer.toString('hex', indexOffset, indexOffset + hashSizeCKey);
        const pageChecksum = buffer.toString('hex', indexOffset + hashSizeCKey, indexOffset + hashSizeCKey + 0x10);

        const pageBuffer = buffer.subarray(pageOffset, pageOffset + cKeyPageSize);
        const pageHash = crypto.createHash('md5').update(pageBuffer).digest('hex');
        assert(pageHash === pageChecksum, `Invalid ckey page ${i} checksum: expected ${pageChecksum}, got ${pageHash}`);

        const pageFirstCKey = pageBuffer.toString('hex', 6, 6 + hashSizeCKey);
        assert(pageFirstCKey === firstCKey, `Invalid ckey page ${i} first ckey: expected ${firstCKey}, got ${pageFirstCKey}`);

        let pagePointer = 0;
        while (pagePointer < cKeyPageSize) {
            const keyCount = pageBuffer.readUInt8(pagePointer);
            pagePointer += 1;
            if (keyCount === 0x00) {
                break;
            }

            const fileSize = pageBuffer.readUIntBE(pagePointer, 5);
            pagePointer += 5;

            const fileCKey = pageBuffer.toString('hex', pagePointer, pagePointer + hashSizeCKey);
            pagePointer += hashSizeCKey;

            cKey2FileSize.set(fileCKey, fileSize);

            if (keyCount === 1) {
                const fileEKey = pageBuffer.toString('hex', pagePointer, pagePointer + hashSizeEKey);
                cKey2EKey.set(fileCKey, fileEKey);
                pagePointer += hashSizeEKey;
            } else {
                const fileEKeys: string[] = [];
                for (let j = 0; j < keyCount; j += 1) {
                    const fileEKey = pageBuffer.toString('hex', pagePointer, pagePointer + hashSizeEKey);
                    fileEKeys.push(fileEKey);
                    pagePointer += hashSizeEKey;
                }
                cKey2EKey.set(fileCKey, fileEKeys);
            }
        }
    }

    const eKey2ESpecIndex = new Map<string, number>();
    const eKey2FileSize = new Map<string, number>();
    const eKeyPageIndexOffset = cKeyPageOffset + cKeyPageSize * cKeyPageCount;
    const eKeyPageIndexEntrySize = hashSizeEKey + 0x10;
    const eKeyPageOffset = eKeyPageIndexOffset + eKeyPageIndexEntrySize * eKeyPageCount;
    const eKeyPageSize = eKeyPageSizeKB * 1024;
    const eKeyPageEntrySize = hashSizeEKey + 0x04 + 0x05;
    for (let i = 0; i < eKeyPageCount; i += 1) {
        const indexOffset = eKeyPageIndexOffset + i * eKeyPageIndexEntrySize;
        const pageOffset = eKeyPageOffset + i * eKeyPageSize;

        const firstEKey = buffer.toString('hex', indexOffset, indexOffset + hashSizeEKey);
        const pageChecksum = buffer.toString('hex', indexOffset + hashSizeEKey, indexOffset + hashSizeEKey + 0x10);

        const pageBuffer = buffer.subarray(pageOffset, pageOffset + eKeyPageSize);
        const pageHash = crypto.createHash('md5').update(pageBuffer).digest('hex');
        assert(pageHash === pageChecksum, `Invalid ekey page ${i} checksum: expected ${pageChecksum}, got ${pageHash}`);

        const pageFirstEKey = pageBuffer.toString('hex', 0, hashSizeEKey);
        assert(pageFirstEKey === firstEKey, `Invalid ekey page ${i} first ekey: expected ${firstEKey}, got ${pageFirstEKey}`);

        let pagePointer = 0;
        while (pagePointer + eKeyPageEntrySize <= eKeyPageSize) {
            const fileEKey = pageBuffer.toString('hex', pagePointer, pagePointer + hashSizeEKey);
            pagePointer += hashSizeEKey;

            const eSpecIndex = pageBuffer.readUInt32BE(pagePointer);
            pagePointer += 4;
            eKey2ESpecIndex.set(fileEKey, eSpecIndex);

            const fileSize = pageBuffer.readUIntBE(pagePointer, 5);
            pagePointer += 5;
            eKey2FileSize.set(fileEKey, fileSize);
        }
    }

    return {
        eSpec, cKey2FileSize, cKey2EKey, eKey2ESpecIndex, eKey2FileSize,
    };
};

export default parseEncodingFile;
