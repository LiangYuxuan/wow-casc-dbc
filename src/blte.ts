import assert from 'node:assert';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

import Salsa20 from './salsa20.ts';
import { getKeyByKeyName } from './key.ts';

interface Block {
    compressedSize: number,
    decompressedSize: number,
    hash: string,
}

const BLTE_MAGIC = 0x424c5445;
const ENC_TYPE_SALSA20 = 0x53;
const EMPTY_HASH = '00000000000000000000000000000000';

export default class BLTEReader {
    public buffer: Buffer;

    public readonly blte: Buffer;

    public readonly blocks: Block[] = [];

    private processedBlock = 0;

    private processedOffset = 0;

    constructor(buffer: Buffer, eKey: string) {
        this.blte = buffer;
        this.buffer = Buffer.alloc(0);

        const size = buffer.byteLength;
        assert(size >= 8, `[BLTE]: Invalid size: ${size} < 8`);

        const magic = buffer.readUInt32BE(0);
        assert(magic === BLTE_MAGIC, `[BLTE]: Invalid magic: ${magic}`);

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

        assert(size >= 12, `[BLTE]: Invalid size: ${size} < 12`);

        const flag = buffer.readUInt8(8);
        const numBlocks = buffer.readIntBE(9, 3);

        assert(numBlocks > 0, `[BLTE]: Invalid number of blocks: ${numBlocks}`);
        assert(flag === 0x0f, `[BLTE]: Invalid flag: ${flag}`);

        const blockHeaderSize = numBlocks * 24;
        assert(headerSize === blockHeaderSize + 12, `[BLTE]: Invalid header size: header size ${headerSize} != block header size ${blockHeaderSize} + 12`);

        assert(size >= headerSize, `[BLTE]: Invalid size: ${size} < ${headerSize}`);

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

    private processBlock(
        blockBuffer: Buffer,
        blockIndex: number,
        allowMissingKey: boolean,
    ): Buffer | undefined {
        const flag = blockBuffer.readUInt8(0);
        switch (flag) {
            case 0x45: { // Encrypted
                let offset = 1;

                const keyNameLength = blockBuffer.readUInt8(offset);
                offset += 1;

                const keyName = blockBuffer.toString('hex', offset, offset + keyNameLength);
                offset += keyNameLength;

                const ivLength = blockBuffer.readUInt8(offset);
                offset += 1;

                const ivBuffer = blockBuffer.subarray(offset, offset + ivLength);
                offset += ivLength;

                const encryptType = blockBuffer.readUInt8(offset);
                offset += 1;

                assert(encryptType === ENC_TYPE_SALSA20, `[BLTE]: Invalid encrypt type: ${encryptType}`);

                const key = getKeyByKeyName(keyName);
                if (!key) {
                    if (allowMissingKey) {
                        return undefined;
                    }
                    throw new Error(`[BLTE]: Missing key: ${keyName}`);
                }

                const iv = new Uint8Array(8);
                for (let i = 0; i < 8; i += 1) {
                    const byte = ivBuffer.byteLength > i ? ivBuffer.readUInt8(i) : undefined;
                    // eslint-disable-next-line no-bitwise
                    iv[i] = byte ? (byte ^ ((blockIndex << (8 * i)) & 0xff)) : 0x00;
                }

                const handler = new Salsa20(key, iv);
                const buffer = handler.process(blockBuffer.subarray(offset));

                return this.processBlock(Buffer.from(buffer.buffer), blockIndex, allowMissingKey);
            }
            case 0x46: // Frame (Recursive)
                throw new Error('[BLTE]: Frame (Recursive) block not supported');
            case 0x4e: // Frame (Normal)
                return blockBuffer.subarray(1);
            case 0x5a: // Compressed
                return zlib.inflateSync(blockBuffer.subarray(1));
            default:
                throw new Error(`[BLTE]: Invalid block flag: ${flag}`);
        }
    }

    processBytes(allowMissingKey = false, size = Infinity) {
        const missingKeyBlocks: { offset: number, size: number }[] = [];

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

            const buffer = this.processBlock(blockBuffer, blockIndex, allowMissingKey);
            if (buffer) {
                assert(buffer.byteLength === block.decompressedSize, `[BLTE]: Invalid decompressed size: expected ${block.decompressedSize}, got ${buffer.byteLength}`);

                this.buffer = Buffer.concat([this.buffer, buffer]);
            } else {
                missingKeyBlocks.push({
                    offset: this.buffer.byteLength,
                    size: block.decompressedSize,
                });

                this.buffer = Buffer.concat([this.buffer, Buffer.alloc(block.decompressedSize)]);
            }

            this.processedBlock += 1;
            this.processedOffset += block.compressedSize;
        }

        return missingKeyBlocks;
    }
}
