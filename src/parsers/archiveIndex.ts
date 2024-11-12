import assert from 'node:assert';
import crypto from 'node:crypto';

const VERSION_SUB_OFFSET = -12;
const CHECKSUM_SIZE_SUB_OFFSET = -5;

const BLOCK_SIZE_OFFSET = 3;
const OFFSET_BYTES_OFFSET = 4;
const SIZE_BYTES_OFFSET = 5;
const KEY_SIZE_OFFSET = 6;
// const CHECKSUM_SIZE_OFFSET = 7;
const NUM_ELEMENTS_OFFSET = 8;
const CHECKSUM_OFFSET = 12;

const CHECKSUM_TRIES = [
    10,
    9,
    8,
    7,
    6,
    5,
    4,
    3,
    2,
    1,
    0,
];

interface ArchiveIndex {
    key: string,
    size: number,
    offset: number,
}

const tryArchiveIndexChecksumSize = (buffer: Buffer, cKey: string): number => {
    const res = CHECKSUM_TRIES.filter(
        (index) => (
            buffer.readUInt8(buffer.byteLength - index + CHECKSUM_SIZE_SUB_OFFSET) === index
            && buffer.readUInt8(buffer.byteLength - index + VERSION_SUB_OFFSET) === 1
        ),
    );

    if (res.length === 1) {
        return res[0];
    }

    throw new Error(`Invalid checksum size: ${res.join(', ')} in ${cKey}`);
};

const parseArchiveIndex = (buffer: Buffer, cKey: string): Map<string, ArchiveIndex> => {
    const checksumSize = tryArchiveIndexChecksumSize(buffer, cKey);

    const versionOffset = buffer.byteLength - checksumSize + VERSION_SUB_OFFSET;
    const footerOffset = versionOffset - checksumSize;

    const tocChecksum = buffer.toString('hex', footerOffset, versionOffset);
    const version = buffer.readUInt8(versionOffset);
    const blockSizeKB = buffer.readUInt8(versionOffset + BLOCK_SIZE_OFFSET);
    const offsetBytes = buffer.readUInt8(versionOffset + OFFSET_BYTES_OFFSET);
    const sizeBytes = buffer.readUInt8(versionOffset + SIZE_BYTES_OFFSET);
    const keySize = buffer.readUInt8(versionOffset + KEY_SIZE_OFFSET);
    const numElements = buffer.readUInt32LE(versionOffset + NUM_ELEMENTS_OFFSET);
    const footerChecksum = buffer.toString('hex', versionOffset + CHECKSUM_OFFSET);

    assert(version === 1, `Invalid version: ${version.toString()} in ${cKey}`);

    const entrySize = keySize + offsetBytes + sizeBytes;
    const blockSize = blockSizeKB * 1024;
    const numBlocks = footerOffset / (blockSize + keySize + checksumSize);
    const tocSize = (keySize + checksumSize) * numBlocks;
    const toc = buffer.subarray(footerOffset - tocSize, footerOffset);
    const footer = buffer.subarray(footerOffset);
    const footerCheckBuffer = Buffer.concat([
        buffer.subarray(versionOffset, buffer.byteLength - checksumSize),
        Buffer.alloc(checksumSize),
    ]);

    const hash = crypto.createHash('md5').update(footer).digest('hex');
    assert(hash === cKey, `Invalid footer hash in ${cKey}: expected ${cKey}, got ${hash}`);

    const footerHash = crypto.createHash('md5').update(footerCheckBuffer).digest('hex').slice(0, checksumSize * 2);
    assert(footerHash === footerChecksum, `Invalid footer checksum in ${cKey}: expected ${footerChecksum}, got ${footerHash}`);

    const tocHash = crypto.createHash('md5').update(toc).digest('hex').slice(0, checksumSize * 2);
    assert(tocHash === tocChecksum, `Invalid toc checksum in ${cKey}: expected ${tocChecksum}, got ${tocHash}`);

    const result = new Map<string, ArchiveIndex>();
    for (let i = 0; i < numBlocks; i += 1) {
        const lastEkey = toc.toString('hex', i * keySize, (i + 1) * keySize);
        const blockChecksum = toc.toString('hex', numBlocks * keySize + i * checksumSize, numBlocks * keySize + (i + 1) * checksumSize);
        const blockOffset = i * blockSize;

        const blockHash = crypto.createHash('md5').update(buffer.subarray(i * blockSize, (i + 1) * blockSize)).digest('hex').slice(0, checksumSize * 2);
        assert(blockChecksum === blockHash, `Invalid block hash in ${cKey} at ${i.toString()}: expected ${blockChecksum}, got ${blockHash}`);

        let length = 0;
        while (length < blockSize) {
            const entryOffset = blockOffset + length * entrySize;
            const eKey = buffer.toString('hex', entryOffset, entryOffset + keySize);
            const size = buffer.readUIntBE(entryOffset + keySize, sizeBytes);
            const offset = buffer.readUIntBE(entryOffset + keySize + sizeBytes, offsetBytes);

            result.set(eKey, { key: cKey, size, offset });
            length += 1;

            if (eKey === lastEkey) {
                break;
            }
        }
    }

    assert(result.size === numElements, `Invalid number of elements: ${result.size.toString()} != ${numElements.toString()} in ${cKey}`);

    return result;
};

export default parseArchiveIndex;

export type { ArchiveIndex };
