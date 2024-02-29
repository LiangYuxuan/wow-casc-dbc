/* eslint-disable no-bitwise */

const hashlittle2 = (key: string, pc = 0, pb = 0): [number, number] => {
    const { length } = key;
    let offset = 0;

    let a = 0xdeadbeef + length + pc | 0;
    let b = 0xdeadbeef + length + pc | 0;
    let c = 0xdeadbeef + length + pc + pb | 0;

    while (length - offset > 12) {
        a += key.charCodeAt(offset + 0);
        a += key.charCodeAt(offset + 1) << 8;
        a += key.charCodeAt(offset + 2) << 16;
        a += key.charCodeAt(offset + 3) << 24;

        b += key.charCodeAt(offset + 4);
        b += key.charCodeAt(offset + 5) << 8;
        b += key.charCodeAt(offset + 6) << 16;
        b += key.charCodeAt(offset + 7) << 24;

        c += key.charCodeAt(offset + 8);
        c += key.charCodeAt(offset + 9) << 8;
        c += key.charCodeAt(offset + 10) << 16;
        c += key.charCodeAt(offset + 11) << 24;

        // mix(a, b, c);
        a -= c; a ^= (c << 4) | (c >>> 28); c = c + b | 0;
        b -= a; b ^= (a << 6) | (a >>> 26); a = a + c | 0;
        c -= b; c ^= (b << 8) | (b >>> 24); b = b + a | 0;
        a -= c; a ^= (c << 16) | (c >>> 16); c = c + b | 0;
        b -= a; b ^= (a << 19) | (a >>> 13); a = a + c | 0;
        c -= b; c ^= (b << 4) | (b >>> 28); b = b + a | 0;

        offset += 12;
    }

    if (length - offset > 0) {
        // zero length strings require no mixing
        // eslint-disable-next-line default-case
        switch (length - offset) {
            case 12: c += key.charCodeAt(offset + 11) << 24; // falls through
            case 11: c += key.charCodeAt(offset + 10) << 16; // falls through
            case 10: c += key.charCodeAt(offset + 9) << 8; // falls through
            case 9: c += key.charCodeAt(offset + 8); // falls through
            case 8: b += key.charCodeAt(offset + 7) << 24; // falls through
            case 7: b += key.charCodeAt(offset + 6) << 16; // falls through
            case 6: b += key.charCodeAt(offset + 5) << 8; // falls through
            case 5: b += key.charCodeAt(offset + 4); // falls through
            case 4: a += key.charCodeAt(offset + 3) << 24; // falls through
            case 3: a += key.charCodeAt(offset + 2) << 16; // falls through
            case 2: a += key.charCodeAt(offset + 1) << 8; // falls through
            case 1: a += key.charCodeAt(offset + 0);
        }

        // final(a, b, c);
        c ^= b; c -= (b << 14) | (b >>> 18);
        a ^= c; a -= (c << 11) | (c >>> 21);
        b ^= a; b -= (a << 25) | (a >>> 7);
        c ^= b; c -= (b << 16) | (b >>> 16);
        a ^= c; a -= (c << 4) | (c >>> 28);
        b ^= a; b -= (a << 14) | (a >>> 18);
        c ^= b; c -= (b << 24) | (b >>> 8);
    }

    return [c >>> 0, b >>> 0];
};

const getNameHash = (name: string): string => {
    const normalized = name.replace(/\//g, '\\').toUpperCase();
    const [pc, pb] = hashlittle2(normalized);
    return `${pc.toString(16).padStart(8, '0')}${pb.toString(16).padStart(8, '0')}`;
};

export default getNameHash;
