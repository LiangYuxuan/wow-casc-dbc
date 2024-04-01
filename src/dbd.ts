import assert from 'node:assert';

import type WDCReader from './wdc.ts';

interface Manifest {
    tableHash: string,
    tableName?: string,
    db2FileDataID?: number,
    dbcFileDataID?: number,
}

interface Column {
    name: string,
    type: string,
    isID: boolean,
    isInline: boolean,
    isRelation: boolean,
    isSigned: boolean,
    size?: number,
    arraySize?: number,
}

type ColumnData = number | bigint | string | undefined;

const PATTERN_COLUMN = /^(int|float|locstring|string)(<[^:]+::[^>]+>)?\s([^\s]+)/;
const PATTERN_LAYOUT = /^LAYOUT\s(.*)/;
const PATTERN_FIELD = /^(\$([^$]+)\$)?([^<[]+)(<(u|)(\d+)>)?(\[(\d+)\])?$/;

const castIntegerBySize = (
    value: number,
    src: number,
    srcSigned: boolean,
    dst: number,
    dstSigned: boolean,
): number => {
    const castBuffer = Buffer.alloc(6);

    if (srcSigned) {
        castBuffer.writeIntLE(value, 0, src);
    } else {
        castBuffer.writeUIntLE(value, 0, src);
    }

    return dstSigned ? castBuffer.readIntLE(0, dst) : castBuffer.readUIntLE(0, dst);
};

const castFloat = (value: number, src: number, srcSigned: boolean): number => {
    const castBuffer = Buffer.alloc(4);

    if (srcSigned) {
        castBuffer.writeIntLE(value, 0, src);
    } else {
        castBuffer.writeUIntLE(value, 0, src);
    }

    const result = castBuffer.readFloatLE(0);
    return Math.round(result * 100) / 100;
};

const castBigInt64 = (value: bigint, srcSigned: boolean, dstSigned: boolean): bigint => {
    const castBuffer = Buffer.alloc(8);

    if (srcSigned) {
        castBuffer.writeBigInt64LE(value, 0);
    } else {
        castBuffer.writeBigUInt64LE(value, 0);
    }

    return dstSigned ? castBuffer.readBigInt64LE(0) : castBuffer.readBigUInt64LE(0);
};

export default class DBDParser {
    public readonly wdc: WDCReader;

    public readonly definitions = new Map<string, string>();

    public columns: Column[] = [];

    private cache = new Map<number, Record<string, ColumnData | ColumnData[]>>();

    private constructor(wdc: WDCReader) {
        this.wdc = wdc;
    }

    private async init(): Promise<void> {
        const manifestsURL = 'https://raw.githubusercontent.com/wowdev/WoWDBDefs/master/manifest.json';
        const manifests = await (await fetch(manifestsURL)).json() as Manifest[];

        const tableHashHex = this.wdc.tableHash.toString(16).padStart(8, '0').toLowerCase();
        const manifest = manifests.find((v) => v.tableHash.toLowerCase() === tableHashHex);

        assert(manifest?.tableName, `No manifest found for table hash ${tableHashHex}`);

        const url = `https://raw.githubusercontent.com/wowdev/WoWDBDefs/master/definitions/${manifest.tableName}.dbd`;
        const text = await (await fetch(url)).text();
        const lines = text.split('\n').map((v) => v.trim());

        const chunks = lines.reduce<string[][]>((acc, line) => {
            if (line.length > 0) {
                acc[acc.length - 1].push(line);
            } else {
                acc.push([]);
            }
            return acc;
        }, [[]]).filter((chunk) => chunk.length > 0);

        const columnsChunk = chunks.shift();
        assert(columnsChunk?.[0] === 'COLUMNS', 'No column definitions found');

        columnsChunk.shift();
        columnsChunk.forEach((line) => {
            const match = line.match(PATTERN_COLUMN);
            if (match) {
                const [, type, , name] = match;
                this.definitions.set(name.replace('?', ''), type);
            }
        });

        const layoutHashHex = this.wdc.layoutHash.toString(16).padStart(8, '0').toLowerCase();
        const versionChunk = chunks.find((chunk) => chunk.find((line) => {
            const layoutsMatch = line.match(PATTERN_LAYOUT);
            const layouts = layoutsMatch?.[1].split(',').map((v) => v.trim().toLowerCase());
            return layouts?.includes(layoutHashHex);
        }));

        assert(versionChunk, `No version definition found for layout hash ${layoutHashHex}`);

        versionChunk.forEach((line) => {
            if (line.startsWith('LAYOUT') || line.startsWith('BUILD') || line.startsWith('COMMENT')) {
                return;
            }

            const match = line.match(PATTERN_FIELD);
            if (match) {
                const [, , annotationsText, name, , unsigned, sizeText, , arraySizeText] = match;
                const type = this.definitions.get(name);

                assert(type, `No type found for column ${name}`);

                const annotations = annotationsText ? annotationsText.split(',').map((v) => v.trim()) : undefined;
                const size = sizeText ? parseInt(sizeText, 10) : undefined;
                const arraySize = arraySizeText ? parseInt(arraySizeText, 10) : undefined;

                const isID = !!annotations?.includes('id');
                const isInline = !annotations?.includes('noninline');
                const isRelation = !!annotations?.includes('relation');
                const isSigned = !unsigned;

                this.columns.push({
                    name,
                    type,
                    isID,
                    isInline,
                    isRelation,
                    isSigned,
                    size,
                    arraySize,
                });
            }
        });
    }

    static async parse(wdc: WDCReader): Promise<DBDParser> {
        const parser = new DBDParser(wdc);

        await parser.init();

        return parser;
    }

    getAllIDs(): number[] {
        return this.wdc.getAllIDs();
    }

    getRowData(id: number): Record<string, ColumnData | ColumnData[]> | undefined {
        if (this.cache.has(id)) {
            return structuredClone(this.cache.get(id));
        }

        const row = this.wdc.getRowData(id);
        if (!row) {
            return undefined;
        }

        const data: Record<string, ColumnData | ColumnData[]> = {};
        if (Array.isArray(row)) {
            let fieldIndex = 0;
            this.columns.forEach((column) => {
                if (column.isID) {
                    data[column.name] = id;

                    if (column.isInline) {
                        fieldIndex += 1;
                    }
                } else if (column.isInline) {
                    const cell = row[fieldIndex];
                    assert(cell, `No value found for column ${column.name}`);

                    const fieldInfo = this.wdc.fieldsInfo[fieldIndex];
                    const srcSigned = fieldInfo.storageType === 'bitpackedSigned';
                    const srcSize = (
                        fieldInfo.storageType === 'none'
                        || fieldInfo.storageType === 'bitpacked'
                        || fieldInfo.storageType === 'bitpackedSigned'
                    )
                        ? Math.ceil(fieldInfo.fieldSizeBits / 8)
                        : 4;
                    const dstSize = column.size ? Math.ceil(column.size / 8) : undefined;

                    if (cell.type === 'bitpackedArray') {
                        data[column.name] = cell.data.map((v) => {
                            if (column.type === 'float') {
                                return castFloat(v, srcSize, srcSigned);
                            }
                            if (dstSize) {
                                return castIntegerBySize(
                                    v,
                                    srcSize,
                                    srcSigned,
                                    dstSize,
                                    column.isSigned,
                                );
                            }
                            return v;
                        });
                    } else if (column.type === 'string' || column.type === 'locstring') {
                        if (cell.data > 0) {
                            assert(cell.type === 'none', `Invalid data type for string column ${column.name}`);
                            assert(typeof cell.string === 'string', `Missing string for string column ${column.name}`);

                            data[column.name] = cell.string;
                        }
                    } else if (column.type === 'float') {
                        assert(typeof cell.data === 'number', `Invalid data type for float column ${column.name}`);

                        data[column.name] = castFloat(cell.data, srcSize, srcSigned);
                    } else if (typeof cell.data === 'number') {
                        data[column.name] = castIntegerBySize(
                            cell.data,
                            srcSize,
                            srcSigned,
                            dstSize ?? srcSize,
                            column.isSigned,
                        );
                    } else {
                        assert(!column.size || column.size === 64, `Unexpected size ${column.size?.toString() ?? ''} for column ${column.name}`);

                        if (srcSigned !== column.isSigned) {
                            data[column.name] = castBigInt64(
                                cell.data,
                                srcSigned,
                                column.isSigned,
                            );
                        } else {
                            data[column.name] = cell.data;
                        }
                    }

                    fieldIndex += 1;
                } else if (column.isRelation) {
                    const relation = this.wdc.getRowRelationship(id);
                    data[column.name] = relation ?? 0;
                }
            });
        } else {
            const buffer = row.data;
            let offset = 0;
            let fieldIndex = 0;
            this.columns.forEach((column) => {
                if (column.isID) {
                    data[column.name] = id;

                    if (column.isInline) {
                        fieldIndex += 1;
                    }
                } else if (column.isInline) {
                    const values = [];

                    if (column.type === 'string' || column.type === 'locstring') {
                        const count = column.arraySize ?? 1;

                        for (let i = 0; i < count; i += 1) {
                            const startOffset = offset;
                            while (buffer[offset] !== 0x00) {
                                offset += 1;
                            }

                            values.push(buffer.toString('utf-8', startOffset, offset));
                            offset += 1;
                        }

                        data[column.name] = count > 1 ? values : values[0];
                    } else {
                        // note: layout hash won't change when array size changes
                        // so we try to determine array size based on field structure
                        const currField = this.wdc.fields[fieldIndex];
                        const nextField = this.wdc.fields[fieldIndex + 1];
                        const size = Math.ceil((column.size ?? (32 - currField.size)) / 8);

                        let count;
                        if (fieldIndex + 1 < this.wdc.fields.length) {
                            count = (nextField.position - currField.position) / size;
                        } else {
                            // nextPos = byteLength - offset + currPos
                            count = column.arraySize ? ((buffer.byteLength - offset) / size) : 1;
                        }

                        for (let i = 0; i < count; i += 1) {
                            if (column.type === 'float') {
                                const value = buffer.readFloatLE(offset);
                                values.push(Math.round(value * 100) / 100);
                                offset += 4;
                            } else if (size > 6) {
                                assert(size === 8, `Unexpected size ${size.toString()} for column ${column.name}`);

                                const value = column.isSigned
                                    ? buffer.readBigInt64LE(offset)
                                    : buffer.readBigUInt64LE(offset);

                                values.push(value);
                                offset += size;
                            } else {
                                const value = column.isSigned
                                    ? buffer.readIntLE(offset, size)
                                    : buffer.readUIntLE(offset, size);

                                values.push(value);
                                offset += size;
                            }
                        }

                        data[column.name] = count > 1 ? values : values[0];
                    }

                    fieldIndex += 1;
                } else if (column.isRelation) {
                    const relation = this.wdc.getRowRelationship(id);
                    data[column.name] = relation ?? 0;
                }
            });
        }

        this.cache.set(id, data);

        return structuredClone(data);
    }
}
