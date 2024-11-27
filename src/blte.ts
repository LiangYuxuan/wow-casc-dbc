import assert from 'node:assert';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

import Salsa20 from './salsa20.ts';

interface Block {
    compressedSize: number,
    decompressedSize: number,
    hash: string,
}

interface MissingKeyBlock {
    offset: number,
    size: number,
    blockIndex: number,
    keyName: string,
}

const BLTE_MAGIC = 0x424c5445;
const ENC_TYPE_SALSA20 = 0x53;
const EMPTY_HASH = '00000000000000000000000000000000';

export default class BLTEReader {
    public buffer: Buffer;

    public readonly blte: Buffer;

    public readonly blocks: Block[] = [];

    public readonly keys: Map<string, Uint8Array>;

    private processedBlock = 0;

    private processedOffset = 0;

    constructor(buffer: Buffer, eKey: string, keys = new Map<string, Uint8Array>()) {
        this.blte = buffer;
        this.buffer = Buffer.alloc(0);
        this.keys = keys;

        const size = buffer.byteLength;
        assert(size >= 8, `[BLTE]: Invalid size: ${size.toString()} < 8`);

        const magic = buffer.readUInt32BE(0);
        assert(magic === BLTE_MAGIC, `[BLTE]: Invalid magic: ${magic.toString(16).padStart(8, '0')}`);

        const headerSize = buffer.readUInt32BE(4);
        if (headerSize === 0) {
            const blteHash = crypto.createHash('md5').update(buffer).digest('hex');
            assert(blteHash === eKey, `[BLTE]: Invalid hash: expected ${eKey}, got ${blteHash}`);

            this.blocks.push({
                compressedSize: size - 8,
                decompressedSize: size - 9,
                hash: EMPTY_HASH,
            });
            this.processedOffset = 8;

            return;
        }

        const blteHash = crypto.createHash('md5').update(buffer.subarray(0, headerSize)).digest('hex');
        assert(blteHash === eKey, `[BLTE]: Invalid hash: expected ${eKey}, got ${blteHash}`);

        assert(size >= 12, `[BLTE]: Invalid size: ${size.toString()} < 12`);

        const flag = buffer.readUInt8(8);
        const numBlocks = buffer.readIntBE(9, 3);

        assert(numBlocks > 0, `[BLTE]: Invalid number of blocks: ${numBlocks.toString()}`);
        assert(flag === 0x0f, `[BLTE]: Invalid flag: ${flag.toString(16).padStart(2, '0')}`);

        const blockHeaderSize = numBlocks * 24;
        assert(headerSize === blockHeaderSize + 12, `[BLTE]: Invalid header size: header size ${headerSize.toString()} != block header size ${blockHeaderSize.toString()} + 12`);

        assert(size >= headerSize, `[BLTE]: Invalid size: ${size.toString()} < ${headerSize.toString()}`);

        for (let i = 0; i < numBlocks; i += 1) {
            const offset = 12 + i * 24;
            const compressedSize = buffer.readUInt32BE(offset);
            const decompressedSize = buffer.readUInt32BE(offset + 4);
            const hash = buffer.toString('hex', offset + 8, offset + 24);

            this.blocks.push({
                compressedSize,
                decompressedSize,
                hash,
            });
        }

        this.processedOffset = headerSize;
    }

    private processBlock(buffer: Buffer, index: number, allowMissingKey: false): Buffer;
    private processBlock(buffer: Buffer, index: number, allowMissingKey: true): Buffer | string;
    private processBlock(buffer: Buffer, index: number, allowMissingKey: boolean): Buffer | string {
        const flag = buffer.readUInt8(0);
        switch (flag) {
            case 0x45: { // Encrypted
                let offset = 1;

                const keyNameLength = buffer.readUInt8(offset);
                offset += 1;

                const keyNameBE = buffer.toString('hex', offset, offset + keyNameLength);
                offset += keyNameLength;

                const ivLength = buffer.readUInt8(offset);
                offset += 1;

                const ivBuffer = buffer.subarray(offset, offset + ivLength);
                offset += ivLength;

                const encryptType = buffer.readUInt8(offset);
                offset += 1;

                assert(encryptType === ENC_TYPE_SALSA20, `[BLTE]: Invalid encrypt type: ${encryptType.toString(16).padStart(2, '0')} at block ${index.toString()}`);

                const keyName = [...keyNameBE.matchAll(/.{2}/g)].map((v) => v[0]).reverse().join('').toLowerCase();
                const key = this.keys.get(keyName);
                if (!key) {
                    if (allowMissingKey) {
                        return keyName;
                    }
                    throw new Error(`[BLTE]: Missing key: ${keyName} at block ${index.toString()}`);
                }

                const iv = new Uint8Array(8);
                for (let i = 0; i < 8; i += 1) {
                    if (i < ivLength) {
                        // eslint-disable-next-line no-bitwise
                        iv[i] = ivBuffer.readUInt8(i) ^ ((index >>> (8 * i)) & 0xff);
                    } else {
                        iv[i] = 0x00;
                    }
                }

                const handler = new Salsa20(key, iv);
                const decrypted = handler.process(buffer.subarray(offset));

                if (allowMissingKey) {
                    return this.processBlock(Buffer.from(decrypted.buffer), index, true);
                }
                return this.processBlock(Buffer.from(decrypted.buffer), index, false);
            }
            case 0x46: // Frame (Recursive)
                throw new Error(`[BLTE]: Frame (Recursive) block not supported at block ${index.toString()}`);
            case 0x4e: // Frame (Normal)
                return buffer.subarray(1);
            case 0x5a: // Compressed
                return zlib.inflateSync(buffer.subarray(1));
            default:
                throw new Error(`[BLTE]: Invalid block flag: ${flag.toString(16).padStart(2, '0')} at block ${index.toString()}`);
        }
    }

    processBytes(allowMissingKey?: false, size?: number): undefined;
    processBytes(allowMissingKey: true, size?: number): MissingKeyBlock[];
    processBytes(allowMissingKey = false, size = Infinity): MissingKeyBlock[] | undefined {
        const missingKeyBlocks: MissingKeyBlock[] = [];

        while (
            this.processedBlock < this.blocks.length
            && size > this.buffer.byteLength
        ) {
            const blockIndex = this.processedBlock;
            const block = this.blocks[blockIndex];

            const blockBuffer = this.blte.subarray(
                this.processedOffset,
                this.processedOffset + block.compressedSize,
            );
            if (block.hash !== EMPTY_HASH) {
                const blockHash = crypto.createHash('md5').update(blockBuffer).digest('hex');
                assert(blockHash === block.hash, `[BLTE]: Invalid block hash: expected ${block.hash}, got ${blockHash}`);
            }

            if (allowMissingKey) {
                const buffer = this.processBlock(blockBuffer, blockIndex, allowMissingKey);
                if (typeof buffer === 'string') {
                    missingKeyBlocks.push({
                        offset: this.buffer.byteLength,
                        size: block.decompressedSize,
                        blockIndex,
                        keyName: buffer,
                    });

                    this.buffer = Buffer.concat([
                        this.buffer,
                        Buffer.alloc(block.decompressedSize),
                    ]);
                } else {
                    assert(
                        buffer.byteLength === block.decompressedSize,
                        `[BLTE]: Invalid decompressed size: expected ${block.decompressedSize.toString()}, got ${buffer.byteLength.toString()}`,
                    );

                    this.buffer = Buffer.concat([this.buffer, buffer]);
                }
            } else {
                const buffer = this.processBlock(blockBuffer, blockIndex, allowMissingKey);

                assert(
                    buffer.byteLength === block.decompressedSize,
                    `[BLTE]: Invalid decompressed size: expected ${block.decompressedSize.toString()}, got ${buffer.byteLength.toString()}`,
                );

                this.buffer = Buffer.concat([this.buffer, buffer]);
            }

            this.processedBlock += 1;
            this.processedOffset += block.compressedSize;
        }

        return allowMissingKey ? missingKeyBlocks : undefined;
    }
}

export type { MissingKeyBlock };
