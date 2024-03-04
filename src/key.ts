import assert from 'node:assert';

const keys = new Map<string, Uint8Array>(
    (await (await fetch('https://raw.githubusercontent.com/wowdev/TACTKeys/master/WoW.txt')).text())
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .map((line) => {
            const [keyNameLE, keyHex] = line.split(' ');

            assert(keyNameLE.length === 16, `Invalid keyName length: ${keyNameLE.length}`);
            assert(keyHex.length === 32, `Invalid key length: ${keyHex.length}`);

            const keyName = [...keyNameLE.matchAll(/.{2}/g)].map((v) => v[0]).reverse().join('');
            const key = Uint8Array.from(Buffer.from(keyHex, 'hex'));

            return [keyName.toLowerCase(), key];
        }),
);

export const getKeyByKeyName = (keyName: string): Uint8Array | undefined => keys.get(
    keyName.toLowerCase(),
);

export const setKeyByKeyName = (keyName: string, key: Uint8Array): void => {
    keys.set(keyName, key);
};
