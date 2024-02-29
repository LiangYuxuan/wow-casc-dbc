import crypto from 'node:crypto';
import zlib from 'node:zlib';

interface Block {
    compressedSize: number,
    decompressedSize: number,
    hash: string,
}

const BLTE_MAGIC = 0x424c5445;
// const ENC_TYPE_SALSA20 = 0x53;
const EMPTY_HASH = '00000000000000000000000000000000';

export default class BLTEReader {
    public buffer: Buffer;

    private blte: Buffer;

    private blocks: Block[] = [];

    private processedBlock = 0;

    private processedOffset = 0;

    constructor(buffer: Buffer, eKey: string) {
        this.blte = buffer;
        this.buffer = Buffer.alloc(0);

        const size = buffer.byteLength;
        if (size < 8) {
            throw new Error(`[BLTE]: Invalid size: ${size} < 8`);
        }

        const magic = buffer.readUInt32BE(0);
        if (magic !== BLTE_MAGIC) {
            throw new Error(`[BLTE]: Invalid magic: ${magic}`);
        }

        const headerSize = buffer.readUInt32BE(4);
        if (headerSize === 0) {
            const blteHash = crypto.createHash('md5').update(buffer).digest('hex');

            if (blteHash !== eKey) {
                throw new Error(`[BLTE]: Invalid hash: expected ${eKey}, got ${blteHash}`);
            }

            this.blocks.push({
                compressedSize: size - 8,
                decompressedSize: size - 9,
                hash: EMPTY_HASH,
            });
            this.processedOffset = 8;

            return;
        }

        const blteHash = crypto.createHash('md5').update(buffer.subarray(0, headerSize)).digest('hex');
        if (blteHash !== eKey) {
            throw new Error(`[BLTE]: Invalid hash: expected ${eKey}, got ${blteHash}`);
        }

        if (size < 12) {
            throw new Error(`[BLTE]: Invalid size: ${size} < 12`);
        }

        const flag = buffer.readUInt8(8);
        const numBlocks = buffer.readIntBE(9, 3);

        if (numBlocks === 0 || flag !== 0x0f) {
            throw new Error('[BLTE]: Invalid table format');
        }

        const blockHeaderSize = numBlocks * 24;
        if (headerSize !== blockHeaderSize + 12) {
            throw new Error(`[BLTE]: Invalid header size: header size ${headerSize} != block header size ${blockHeaderSize} + 12`);
        }

        if (size < headerSize) {
            throw new Error(`[BLTE]: Invalid size: ${size} < ${headerSize}`);
        }

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

    processBytes(size = Infinity) {
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
                if (blockHash !== block.hash) {
                    throw new Error(`[BLTE]: Invalid block hash: expected ${block.hash}, got ${blockHash}`);
                }
            }

            const flag = blockBuffer.readUInt8(0);
            switch (flag) {
                case 0x45: // Encrypted
                    throw new Error('[BLTE]: Not implemented'); // TODO
                case 0x46: // Frame (Recursive)
                    throw new Error('[BLTE]: Frame (Recursive) block not supported');
                case 0x4e: // Frame (Normal)
                    this.buffer = Buffer.concat([
                        this.buffer,
                        blockBuffer.subarray(1),
                    ]);
                    break;
                case 0x5a: // Compressed
                    this.buffer = Buffer.concat([
                        this.buffer,
                        zlib.inflateSync(blockBuffer.subarray(1)),
                    ]);
                    break;
                default:
                    throw new Error(`[BLTE]: Invalid block flag: ${flag}`);
            }

            this.processedBlock += 1;
            this.processedOffset += block.compressedSize;
        }
    }
}
