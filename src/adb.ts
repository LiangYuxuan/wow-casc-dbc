import assert from 'node:assert';

export interface HotfixEntry {
    regionID: number,
    pushID: number,
    uniqueID: number,
    tableHash: number,
    recordID: number,
    dataSize: number,
    recordState: number,
    data: Buffer,
}

const ADB_MAGIC = 0x58465448;

export default class ADBReader {
    public build: number;

    public entries: HotfixEntry[] = [];

    public tableEntries = new Map<number, HotfixEntry[]>();

    constructor(buffer: Buffer) {
        const magic = buffer.readUInt32BE(0);
        assert(magic === ADB_MAGIC, `[ADB]: Invalid magic: ${magic.toString(16).padStart(8, '0')}`);

        const version = buffer.readUInt32LE(4);
        assert(version === 9, `[ADB]: Invalid version: ${version.toString()}`);

        const build = buffer.readUInt32LE(8);
        this.build = build;

        let pointer = 44;
        while (pointer < buffer.byteLength) {
            const offset = pointer;

            const entryMagic = buffer.readUInt32BE(offset);
            assert(entryMagic === ADB_MAGIC, `[ADB]: Invalid entry magic: ${magic.toString(16).padStart(8, '0')}`);

            const regionID = buffer.readInt32LE(offset + 4);
            const pushID = buffer.readInt32LE(offset + 8);
            const uniqueID = buffer.readUInt32LE(offset + 12);
            const tableHash = buffer.readUInt32LE(offset + 16);
            const recordID = buffer.readUInt32LE(offset + 20);
            const dataSize = buffer.readUInt32LE(offset + 24);
            const recordState = buffer.readUInt32LE(offset + 28);

            const data = buffer.subarray(offset + 32, offset + 32 + dataSize);

            const entry: HotfixEntry = {
                regionID,
                pushID,
                uniqueID,
                tableHash,
                recordID,
                dataSize,
                recordState,
                data,
            };
            this.entries.push(entry);

            if (!this.tableEntries.has(tableHash)) {
                this.tableEntries.set(tableHash, []);
            }
            this.tableEntries.get(tableHash)?.push(entry);

            pointer += 32 + dataSize;
        }
    }
}
