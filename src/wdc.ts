/* eslint-disable no-bitwise */

import assert from 'node:assert';

import type { MissingKeyBlock } from './blte.ts';

const WDC5_MAGIC = 0x57444335;

interface SectionHeader {
    tactKeyHash: bigint,
    fileOffset: number,
    recordCount: number,
    stringTableSize: number,
    offsetRecordsEnd: number,
    idListSize: number,
    relationshipDataSize: number,
    offsetMapIDCount: number,
    copyTableCount: number,
}

interface FieldStructure {
    size: number,
    position: number,
}

interface FieldStorageInfoCompressionNone {
    fieldOffsetBits: number,
    fieldSizeBits: number,
    additionalDataSize: number,
    storageType: 'none',
}

interface FieldStorageInfoCompressionBitpacked {
    fieldOffsetBits: number,
    fieldSizeBits: number,
    additionalDataSize: number,
    storageType: 'bitpacked',
    bitpackingOffsetBits: number,
    bitpackingSizeBits: number,
    flags: number,
}

interface FieldStorageInfoCompressionCommonData {
    fieldOffsetBits: number,
    fieldSizeBits: number,
    additionalDataSize: number,
    storageType: 'commonData',
    defaultValue: number,
}

interface FieldStorageInfoCompressionBitpackedIndexed {
    fieldOffsetBits: number,
    fieldSizeBits: number,
    additionalDataSize: number,
    storageType: 'bitpackedIndexed',
    bitpackingOffsetBits: number,
    bitpackingSizeBits: number,
}

interface FieldStorageInfoCompressionBitpackedIndexedArray {
    fieldOffsetBits: number,
    fieldSizeBits: number,
    additionalDataSize: number,
    storageType: 'bitpackedIndexedArray',
    bitpackingOffsetBits: number,
    bitpackingSizeBits: number,
    arrayCount: number,
}

interface FieldStorageInfoCompressionBitpackedSigned {
    fieldOffsetBits: number,
    fieldSizeBits: number,
    additionalDataSize: number,
    storageType: 'bitpackedSigned',
    bitpackingOffsetBits: number,
    bitpackingSizeBits: number,
    flags: number,
}

type FieldStorageInfo = FieldStorageInfoCompressionNone
| FieldStorageInfoCompressionBitpacked
| FieldStorageInfoCompressionCommonData
| FieldStorageInfoCompressionBitpackedIndexed
| FieldStorageInfoCompressionBitpackedIndexedArray
| FieldStorageInfoCompressionBitpackedSigned;

interface OffsetMapEntry {
    offset: number,
    size: number,
    data: Buffer,
}

interface ParsedFieldNone {
    type: 'none',
    data: number | bigint,
    string?: string,
}

interface ParsedFieldCommonData {
    type: 'commonData',
    data: number,
}

interface ParsedFieldBitpacked {
    type: 'bitpacked',
    data: number,
}

interface ParsedFieldBitpackedArray {
    type: 'bitpackedArray',
    data: number[],
}

type ParsedField = ParsedFieldNone
| ParsedFieldCommonData
| ParsedFieldBitpacked
| ParsedFieldBitpackedArray;

interface SparseRow {
    type: 'sparse',
    data: Buffer,
}

interface Section {
    header: SectionHeader,
    isZeroed: boolean,
    recordDataSize: number,
    records: Buffer[],
    idList: number[],
    offsetMap: OffsetMapEntry[],
    relationshipMap: Map<number, number>,
}

const readBitpackedValue = (buffer: Buffer, fieldOffsetBits: number, fieldSizeBits: number) => {
    const offsetBytes = fieldOffsetBits >>> 3;
    const bitOffset = fieldOffsetBits & 0x7;
    const sizeBytes = Math.ceil((fieldSizeBits + bitOffset) / 8);
    const bitMask = (1n << BigInt(fieldSizeBits)) - 1n;

    if (sizeBytes <= 6) {
        // safe to be number
        const rawValue = buffer.readUIntLE(offsetBytes, sizeBytes);
        return Number(BigInt(rawValue >>> bitOffset) & bitMask);
    }

    // need to be bigint
    let remain = sizeBytes;
    let value = 0n;

    while (remain > 0) {
        const byteLength = Math.min(remain, 6);
        const offset = offsetBytes + sizeBytes - byteLength;
        const rawValue = buffer.readUIntLE(offset, byteLength);

        value = (value << BigInt(byteLength * 8)) | BigInt(rawValue);
        remain -= byteLength;
    }

    return (value >> BigInt(bitOffset)) & bitMask;
};

export default class WDCReader {
    public readonly tableHash: number;

    public readonly layoutHash: number;

    public readonly locale: number;

    public readonly isNormal: boolean;

    public readonly hasRelationshipData: boolean;

    public readonly fields: FieldStructure[];

    public readonly fieldsInfo: FieldStorageInfo[];

    public readonly rows = new Map<number, ParsedField[] | SparseRow>();

    public readonly relationships = new Map<number, number>();

    public readonly copyTable = new Map<number, number>();

    constructor(buffer: Buffer, blocks: MissingKeyBlock[]) {
        const magic = buffer.readUInt32BE(0);
        // const version = buffer.readUInt32LE(4);
        // const schema = buffer.toString('ascii', 8, 136);
        // const recordCount = buffer.readUInt32LE(136);
        const fieldCount = buffer.readUInt32LE(140);
        const recordSize = buffer.readUInt32LE(144);
        // const stringTableSize = buffer.readUInt32LE(148);
        const tableHash = buffer.readUInt32LE(152);
        const layoutHash = buffer.readUInt32LE(156);
        // const minID = buffer.readUInt32LE(160);
        // const maxID = buffer.readUInt32LE(164);
        const locale = buffer.readUInt32LE(168);
        const flags = buffer.readUInt16LE(172);
        const idIndex = buffer.readUInt16LE(174);
        // const totalFieldCount = buffer.readUInt32LE(176);
        // const bitpackedDataOffset = buffer.readUInt32LE(180);
        // const lookupColumnCount = buffer.readUInt32LE(184);
        const fieldStorageInfoSize = buffer.readUInt32LE(188);
        const commonDataSize = buffer.readUInt32LE(192);
        const palletDataSize = buffer.readUInt32LE(196);
        const sectionCount = buffer.readUInt32LE(200);

        assert(magic === WDC5_MAGIC, `Invalid magic: ${magic}`);

        this.tableHash = tableHash;
        this.layoutHash = layoutHash;
        this.locale = locale;

        const isNormal = !(flags & 0x1);
        const hasRelationshipData = !!(flags & 0x2);

        this.isNormal = isNormal;
        this.hasRelationshipData = hasRelationshipData;

        const sectionHeaders: SectionHeader[] = [];
        const sectionHeadersOffset = 204;
        for (let i = 0; i < sectionCount; i += 1) {
            const sectionHeaderOffset = sectionHeadersOffset + i * 40;

            sectionHeaders.push({
                tactKeyHash: buffer.readBigUInt64LE(sectionHeaderOffset),
                fileOffset: buffer.readUInt32LE(sectionHeaderOffset + 8),
                recordCount: buffer.readUInt32LE(sectionHeaderOffset + 12),
                stringTableSize: buffer.readUInt32LE(sectionHeaderOffset + 16),
                offsetRecordsEnd: buffer.readUInt32LE(sectionHeaderOffset + 20),
                idListSize: buffer.readUInt32LE(sectionHeaderOffset + 24),
                relationshipDataSize: buffer.readUInt32LE(sectionHeaderOffset + 28),
                offsetMapIDCount: buffer.readUInt32LE(sectionHeaderOffset + 32),
                copyTableCount: buffer.readUInt32LE(sectionHeaderOffset + 36),
            });
        }

        const fields: FieldStructure[] = [];
        const fieldsOffset = 204 + sectionCount * 40;
        for (let i = 0; i < fieldCount; i += 1) {
            const fieldOffset = fieldsOffset + i * 4;
            fields.push({
                size: buffer.readInt16LE(fieldOffset),
                position: buffer.readUInt16LE(fieldOffset + 2),
            });
        }
        this.fields = fields;

        const fieldsInfo: FieldStorageInfo[] = [];
        const fieldsInfoOffset = fieldsOffset + fieldCount * 4;
        for (let i = 0; i < fieldStorageInfoSize / 24; i += 1) {
            const fieldInfoOffset = fieldsInfoOffset + i * 24;

            const fieldOffsetBits = buffer.readUInt16LE(fieldInfoOffset);
            const fieldSizeBits = buffer.readUInt16LE(fieldInfoOffset + 2);
            const additionalDataSize = buffer.readUInt32LE(fieldInfoOffset + 4);
            const storageType = buffer.readUInt32LE(fieldInfoOffset + 8);
            const arg1 = buffer.readUInt32LE(fieldInfoOffset + 12);
            const arg2 = buffer.readUInt32LE(fieldInfoOffset + 16);
            const arg3 = buffer.readUInt32LE(fieldInfoOffset + 20);

            switch (storageType) {
                case 0:
                    fieldsInfo.push({
                        fieldOffsetBits,
                        fieldSizeBits,
                        additionalDataSize,
                        storageType: 'none',
                    });
                    break;
                case 1:
                    fieldsInfo.push({
                        fieldOffsetBits,
                        fieldSizeBits,
                        additionalDataSize,
                        storageType: 'bitpacked',
                        bitpackingOffsetBits: arg1,
                        bitpackingSizeBits: arg2,
                        flags: arg3,
                    });
                    break;
                case 2:
                    fieldsInfo.push({
                        fieldOffsetBits,
                        fieldSizeBits,
                        additionalDataSize,
                        storageType: 'commonData',
                        defaultValue: arg1,
                    });
                    break;
                case 3:
                    fieldsInfo.push({
                        fieldOffsetBits,
                        fieldSizeBits,
                        additionalDataSize,
                        storageType: 'bitpackedIndexed',
                        bitpackingOffsetBits: arg1,
                        bitpackingSizeBits: arg2,
                    });
                    break;
                case 4:
                    fieldsInfo.push({
                        fieldOffsetBits,
                        fieldSizeBits,
                        additionalDataSize,
                        storageType: 'bitpackedIndexedArray',
                        bitpackingOffsetBits: arg1,
                        bitpackingSizeBits: arg2,
                        arrayCount: arg3,
                    });
                    break;
                case 5:
                    fieldsInfo.push({
                        fieldOffsetBits,
                        fieldSizeBits,
                        additionalDataSize,
                        storageType: 'bitpackedSigned',
                        bitpackingOffsetBits: arg1,
                        bitpackingSizeBits: arg2,
                        flags: arg3,
                    });
                    break;
                default:
                    throw new Error(`Unknown storage type: ${storageType}`);
            }
        }
        this.fieldsInfo = fieldsInfo;

        const palletData = new Map<number, number[]>();
        const palletDataOffset = fieldsInfoOffset + fieldStorageInfoSize;
        let palletDataPointer = palletDataOffset;
        for (let i = 0; i < fieldsInfo.length; i += 1) {
            const fieldInfo = fieldsInfo[i];
            if (fieldInfo.storageType === 'bitpackedIndexed' || fieldInfo.storageType === 'bitpackedIndexedArray') {
                const data: number[] = [];
                for (let j = 0; j < fieldInfo.additionalDataSize / 4; j += 1) {
                    data.push(buffer.readUInt32LE(palletDataPointer));
                    palletDataPointer += 4;
                }
                palletData.set(i, data);
            }
        }

        assert(palletDataPointer === palletDataOffset + palletDataSize, `Invalid pallet data size: ${palletDataPointer - palletDataOffset} != ${palletDataSize}`);

        const commonData = new Map<number, Map<number, number>>();
        const commonDataOffset = palletDataPointer;
        let commonDataPointer = commonDataOffset;
        for (let i = 0; i < fieldsInfo.length; i += 1) {
            const fieldInfo = fieldsInfo[i];
            if (fieldInfo.storageType === 'commonData') {
                const map = new Map<number, number>();
                for (let j = 0; j < fieldInfo.additionalDataSize / 8; j += 1) {
                    map.set(
                        buffer.readUInt32LE(commonDataPointer),
                        buffer.readUInt32LE(commonDataPointer + 4),
                    );
                    commonDataPointer += 8;
                }
                commonData.set(i, map);
            }
        }

        assert(commonDataPointer === commonDataOffset + commonDataSize, `Invalid common data size: ${commonDataPointer - commonDataOffset} != ${commonDataSize}`);

        const encryptedIDs = new Map<number, number[]>();
        const encryptedRecordsOffset = commonDataPointer;
        let encryptedRecordsPointer = encryptedRecordsOffset;
        for (let i = 0; i < sectionHeaders.length; i += 1) {
            const sectionHeader = sectionHeaders[i];
            if (sectionHeader.tactKeyHash !== 0n) {
                const count = buffer.readUInt32LE(encryptedRecordsPointer);
                encryptedRecordsPointer += 4;

                const data: number[] = [];
                for (let j = 0; j < count; j += 1) {
                    data.push(buffer.readUInt32LE(encryptedRecordsPointer));
                    encryptedRecordsPointer += 4;
                }
                encryptedIDs.set(i, data);
            }
        }

        const stringTable = new Map<number, string>();
        let stringTableDelta = 0;

        const sectionsOffset = encryptedRecordsPointer;
        let sectionPointer = sectionsOffset;
        const sections = sectionHeaders.map((sectionHeader): Section => {
            assert(sectionPointer === sectionHeader.fileOffset, `Invalid section offset: ${sectionPointer} != ${sectionHeader.fileOffset}`);

            const sectionSize = (
                isNormal
                    ? (sectionHeader.recordCount * recordSize + sectionHeader.stringTableSize)
                    : (sectionHeader.offsetRecordsEnd - sectionPointer)
            )
                + sectionHeader.idListSize
                + sectionHeader.copyTableCount * 8
                + sectionHeader.offsetMapIDCount * 10
                + sectionHeader.relationshipDataSize;

            const recordDataSize = isNormal
                ? recordSize * sectionHeader.recordCount
                : sectionHeader.offsetRecordsEnd - sectionHeader.fileOffset;

            const isZeroed = blocks.some((block) => {
                const sectionStart = sectionHeader.fileOffset;
                const sectionEnd = sectionStart + sectionSize;
                const blockStart = block.offset;
                const blockEnd = blockStart + block.size;

                return sectionStart >= blockStart && sectionEnd <= blockEnd;
            });

            if (isZeroed) {
                sectionPointer += sectionSize;
                if (isNormal) {
                    stringTableDelta += sectionHeader.stringTableSize;
                }
                return {
                    header: sectionHeader,
                    isZeroed,
                    recordDataSize,
                    records: [],
                    idList: [],
                    offsetMap: [],
                    relationshipMap: new Map(),
                };
            }

            const records: Buffer[] = [];
            if (isNormal) {
                for (let j = 0; j < sectionHeader.recordCount; j += 1) {
                    records.push(buffer.subarray(sectionPointer, sectionPointer + recordSize));
                    sectionPointer += recordSize;
                }

                const stringTableOffset = sectionPointer;
                let stringStartPointer = stringTableOffset;
                while (sectionPointer < stringTableOffset + sectionHeader.stringTableSize) {
                    if (buffer[sectionPointer] === 0x00) {
                        if (sectionPointer - stringStartPointer > 0) {
                            const string = buffer.toString('utf-8', stringStartPointer, sectionPointer);
                            stringTable.set(
                                stringStartPointer - stringTableOffset + stringTableDelta,
                                string,
                            );
                        }

                        stringStartPointer = sectionPointer + 1;
                    }
                    sectionPointer += 1;
                }
                stringTableDelta += sectionHeader.stringTableSize;
            } else {
                sectionPointer = sectionHeader.offsetRecordsEnd;
            }

            const idList: number[] = [];
            for (let j = 0; j < sectionHeader.idListSize / 4; j += 1) {
                idList.push(buffer.readUInt32LE(sectionPointer));
                sectionPointer += 4;
            }

            for (let j = 0; j < sectionHeader.copyTableCount; j += 1) {
                const dst = buffer.readUInt32LE(sectionPointer);
                const src = buffer.readUInt32LE(sectionPointer + 4);
                this.copyTable.set(dst, src);

                sectionPointer += 8;
            }

            const offsetMap: OffsetMapEntry[] = [];
            for (let j = 0; j < sectionHeader.offsetMapIDCount; j += 1) {
                const offset = buffer.readUInt32LE(sectionPointer);
                const size = buffer.readUInt16LE(sectionPointer + 4);
                const data = buffer.subarray(offset, offset + size);

                sectionPointer += 6;

                offsetMap.push({
                    offset,
                    size,
                    data,
                });
            }

            const offsetMapIDList: number[] = [];

            if (hasRelationshipData) {
                // Note, if flag 0x02 is set,
                // offset_map_id_list will appear before relationship_map instead
                for (let j = 0; j < sectionHeader.offsetMapIDCount; j += 1) {
                    offsetMapIDList.push(buffer.readUInt32LE(sectionPointer));
                    sectionPointer += 4;
                }
            }

            const relationshipMap = new Map<number, number>();
            if (sectionHeader.relationshipDataSize > 0) {
                const numEntries = buffer.readUInt32LE(sectionPointer);
                // const relationshipMinID = buffer.readUInt32LE(sectionPointer + 4);
                // const relationshipMaxID = buffer.readUInt32LE(sectionPointer + 8);

                sectionPointer += 12;

                for (let j = 0; j < numEntries; j += 1) {
                    const foreignID = buffer.readUInt32LE(sectionPointer);
                    const recordIndex = buffer.readUInt32LE(sectionPointer + 4);
                    sectionPointer += 8;

                    relationshipMap.set(recordIndex, foreignID);
                }
            }

            if (!hasRelationshipData) {
                // see if (hasRelationshipData)
                for (let j = 0; j < sectionHeader.offsetMapIDCount; j += 1) {
                    offsetMapIDList.push(buffer.readUInt32LE(sectionPointer));
                    sectionPointer += 4;
                }
            }

            return {
                header: sectionHeader,
                isZeroed,
                recordDataSize,
                records,
                idList,
                offsetMap,
                relationshipMap,
            };
        });

        const totalRecordDataSize = sections
            .reduce((acc, section) => acc + section.recordDataSize, 0);
        sections.forEach((section) => {
            const {
                header, isZeroed, records, idList, offsetMap, relationshipMap,
            } = section;

            const prevRecordDataSize = sections
                .filter((s) => s.header.fileOffset < header.fileOffset)
                .reduce((acc, s) => acc + s.recordDataSize, 0);

            if (isZeroed) {
                return;
            }

            for (let recordIndex = 0; recordIndex < header.recordCount; recordIndex += 1) {
                let recordID = idList.length > 0 ? idList[recordIndex] : undefined;
                const recordBuffer = isNormal
                    ? records[recordIndex]
                    : offsetMap[recordIndex].data;

                if (isNormal) {
                    const recordData = fieldsInfo.map((fieldInfo, fieldIndex): ParsedField => {
                        switch (fieldInfo.storageType) {
                            case 'none': {
                                const value = readBitpackedValue(
                                    recordBuffer,
                                    fieldInfo.fieldOffsetBits,
                                    fieldInfo.fieldSizeBits,
                                );

                                if (typeof value === 'bigint') {
                                    return {
                                        type: 'none',
                                        data: value,
                                    };
                                }

                                if (!recordID && fieldIndex === idIndex) {
                                    recordID = value;
                                }

                                const fieldOffset = fieldInfo.fieldOffsetBits >>> 3;
                                const offset = prevRecordDataSize - totalRecordDataSize
                                    + (recordSize * recordIndex) + fieldOffset + value;

                                return {
                                    type: 'none',
                                    data: value,
                                    string: stringTable.get(offset),
                                };
                            }
                            case 'commonData': {
                                const value = (
                                    recordID
                                        ? commonData.get(fieldIndex)?.get(recordID)
                                        : undefined
                                )
                                    ?? fieldInfo.defaultValue;
                                return {
                                    type: 'commonData',
                                    data: value,
                                };
                            }
                            case 'bitpacked':
                            case 'bitpackedSigned':
                            case 'bitpackedIndexed':
                            case 'bitpackedIndexedArray': {
                                let value = readBitpackedValue(
                                    recordBuffer,
                                    fieldInfo.fieldOffsetBits,
                                    fieldInfo.fieldSizeBits,
                                );

                                assert(typeof value === 'number', 'Bitpacked value must be a number');

                                if (fieldInfo.storageType === 'bitpackedIndexedArray') {
                                    const fieldPalletData = palletData.get(fieldIndex);

                                    assert(fieldPalletData, `No pallet data for field ${fieldIndex}`);

                                    const data: number[] = [];
                                    const palletStart = value * fieldInfo.arrayCount;

                                    for (let j = 0; j < fieldInfo.arrayCount; j += 1) {
                                        data.push(fieldPalletData[palletStart + j]);
                                    }

                                    return {
                                        type: 'bitpackedArray',
                                        data,
                                    };
                                }

                                if (fieldInfo.storageType === 'bitpackedIndexed') {
                                    const fieldPalletData = palletData.get(fieldIndex);

                                    assert(fieldPalletData, `No pallet data for field ${fieldIndex}`);

                                    value = fieldPalletData[value];
                                }

                                if (!recordID && fieldIndex === idIndex) {
                                    recordID = value;
                                }

                                return {
                                    type: 'bitpacked',
                                    data: value,
                                };
                            }
                            default:
                                fieldInfo satisfies never;
                                throw new Error('Unreachable');
                        }
                    });

                    assert(recordID !== undefined, 'No record ID found');

                    this.rows.set(recordID, recordData);

                    const foreignID = relationshipMap.get(recordIndex);
                    if (foreignID) {
                        this.relationships.set(recordID, foreignID);
                    }
                } else {
                    const recordData = {
                        type: 'sparse',
                        data: recordBuffer,
                    } satisfies SparseRow;

                    // for now (10.2.5), every sparse table has idList
                    // so we can safely assume recordID is not undefined
                    assert(recordID !== undefined, 'No record ID found');

                    this.rows.set(recordID, recordData);

                    const foreignID = relationshipMap.get(recordIndex);
                    if (foreignID) {
                        this.relationships.set(recordID, foreignID);
                    }
                }
            }
        });
    }

    getRowData(id: number): ParsedField[] | SparseRow | undefined {
        const dst = this.copyTable.get(id);
        if (dst) {
            return this.rows.get(dst);
        }
        return this.rows.get(id);
    }

    getRowRelationship(id: number): number | undefined {
        const dst = this.copyTable.get(id);
        if (dst) {
            return this.relationships.get(dst);
        }
        return this.relationships.get(id);
    }
}
