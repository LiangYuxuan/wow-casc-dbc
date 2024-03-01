/* eslint-disable no-bitwise */

import Salsa20 from '../salsa20.ts';

const hexToBytes = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    }
    return bytes;
};

const bytesToHex = (bytes: Uint8Array): string => [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');

// https://github.com/das-labor/legacy/blob/master/microcontroller-2/arm-crypto-lib/testvectors/salsa20-256.64-verified.test-vectors
describe('Salsa20', () => {
    test('Set 1, vector#0', () => {
        const key = '80000000000000000000000000000000'
            + '00000000000000000000000000000000';
        const iv = '0000000000000000';

        const block1 = 'E3BE8FDD8BECA2E3EA8EF9475B29A6E7'
            + '003951E1097A5C38D23B7A5FAD9F6844'
            + 'B22C97559E2723C7CBBD3FE4FC8D9A07'
            + '44652A83E72A9C461876AF4D7EF1A117';
        const block2 = '57BE81F47B17D9AE7C4FF15429A73E10'
            + 'ACF250ED3A90A93C711308A74C6216A9'
            + 'ED84CD126DA7F28E8ABF8BB63517E1CA'
            + '98E712F4FB2E1A6AED9FDC73291FAA17';
        const block3 = '958211C4BA2EBD5838C635EDB81F513A'
            + '91A294E194F1C039AEEC657DCE40AA7E'
            + '7C0AF57CACEFA40C9F14B71A4B3456A6'
            + '3E162EC7D8D10B8FFB1810D71001B618';
        const block4 = '696AFCFD0CDDCC83C7E77F11A649D79A'
            + 'CDC3354E9635FF137E929933A0BD6F53'
            + '77EFA105A3A4266B7C0D089D08F1E855'
            + 'CC32B15B93784A36E56A76CC64BC8477';
        const xor = '50EC2485637DB19C6E795E9C73938280'
            + '6F6DB320FE3D0444D56707D7B456457F'
            + '3DB3E8D7065AF375A225A70951C8AB74'
            + '4EC4D595E85225F08E2BC03FE1C42567';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(block1.toLocaleLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(block2.toLocaleLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(block3.toLocaleLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(block4.toLocaleLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLocaleLowerCase());
    });

    test('Set 2, vector#0', () => {
        const key = '00000000000000000000000000000000'
            + '00000000000000000000000000000000';
        const iv = '0000000000000000';

        const block1 = '9A97F65B9B4C721B960A672145FCA8D4'
            + 'E32E67F9111EA979CE9C4826806AEEE6'
            + '3DE9C0DA2BD7F91EBCB2639BF989C625'
            + '1B29BF38D39A9BDCE7C55F4B2AC12A39';
        const block2 = '2F3C3E10649160B44321B7F830D7D222'
            + '699FAE0E834C76C3997985B5404808AB'
            + '7E6E99AA1FEC2730749213E7F37A291A'
            + 'A6B5AFD2E524C2D608F34D4959930436';
        const block3 = '8598D1FA94516B474B69DA83E3C1312C'
            + '49A05B8283B880B31872CD1EA7D8F1B2'
            + 'D60A86CBA8184F949EA7AE8502A582DB'
            + '392E85C4D70D3D17B2E57D817A98ED6E';
        const block4 = 'F86C7489712FB77896706FC892D9A1C8'
            + '4BB53D081F6EB4AE1C68B1190CBB0B41'
            + '484E9E2B6FEA0A31BF124415921E5CF3'
            + '7C26493A5BC08F7620A8C80503C4C76F';
        const xor = '7C3A1499A63B507B0BC75824ABEEAA26'
            + '109101C5B915F0F554DD9950045D02FA'
            + 'FF815CA8B2C7CFF3625765697B80B026'
            + '7EA87E25412564BD71DD05843A60465E';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(block1.toLocaleLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(block2.toLocaleLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(block3.toLocaleLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(block4.toLocaleLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLocaleLowerCase());
    });

    test('Set 3, vector#0', () => {
        const key = '000102030405060708090A0B0C0D0E0F'
            + '101112131415161718191A1B1C1D1E1F';
        const iv = '0000000000000000';

        const block1 = 'B580F7671C76E5F7441AF87C146D6B51'
            + '3910DC8B4146EF1B3211CF12AF4A4B49'
            + 'E5C874B3EF4F85E7D7ED539FFEBA73EB'
            + '73E0CCA74FBD306D8AA716C7783E89AF';
        const block2 = '9B5B5406977968E7F472DE2924EFFD0E'
            + '8EA74C954D23FCC21E4ED87BBA9E0F79'
            + 'D1477D1810368F02259F7F53966F91CE'
            + 'B50ECD3DA10363E7F08EEAB83A0EF71A';
        const block3 = '68E43AA40C5D5718E636D8E3B0AB3830'
            + 'D61698A12EB15BD9C923FF40A23E80BE'
            + '026B7E1349265AD9C20A6C8A60256F4A'
            + 'CD1D7AD0DCBE1DFF3058ACD9E1B4C537';
        const block4 = '343ED5D011373AF376308D0B0DAB7806'
            + 'A4B4D3BF9B898181D546EFCF83D7464C'
            + 'FC56AE76F03F3711174DC67AC9363E69'
            + '84F5A447BD25642A00754F1133BFD953';
        const xor = '8C03E9237FEE95D5041C753C204D2B35'
            + '764E4A53035A76F9EFBADD7E63E60B69'
            + 'BF23F7C5FD39B2249B0C628FB654D521'
            + '4EB588371E5D2F34BF51396AF3ACB666';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(block1.toLocaleLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(block2.toLocaleLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(block3.toLocaleLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(block4.toLocaleLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLocaleLowerCase());
    });

    test('Set 4, vector#0', () => {
        const key = '0053A6F94C9FF24598EB3E91E4378ADD'
            + '3083D6297CCF2275C81B6EC11467BA0D';
        const iv = '0000000000000000';

        const block1 = 'F9D2DC274BB55AEFC2A0D9F8A982830F'
            + '6916122BC0A6870F991C6ED8D00D2F85'
            + '94E3151DE4C5A19A9A06FBC191C87BF0'
            + '39ADF971314BAF6D02337080F2DAE5CE';
        const block2 = '05BDA8EE240BA6DC53A42C14C17F620F'
            + '6FA799A6BC88775E04EEF427B4B9DE5A'
            + '5349327FCADA077F385BA321DB4B3939'
            + 'C0F49EA99801790B0FD32986AFC41B85';
        const block3 = 'FED5279620FBCBDD3C3980B11FCE4787'
            + 'E6F9F97772BEAAD0EF215FDCD0B3A16F'
            + 'BB56D72AFD5FD52E6A584BF840914168'
            + 'D04A594FFDDA959A63EB4CF42694F03F';
        const block4 = 'F161DCE8FA4CF80F8143DDB21FA1BFA3'
            + '1CA4DC0A412233EDE80EF72DAA1B8039'
            + '4BCE3875CA1E1E195D58BC3197F803A8'
            + '9C433A59A0718C1A009BCB4DA2AC1778';
        const xor = '2052F9A2853E989133D10938222AC76D'
            + 'B8B4CBA135ACB59970DDF9C074C6271A'
            + '5C4E2A7A00D2D697EDFC9B1FF9B365C8'
            + '7347B23020663A30711A71E3A02AB00C';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(131072)));

        expect(bytesToHex(result.slice(0, 64))).toBe(block1.toLocaleLowerCase());
        expect(bytesToHex(result.slice(65472, 65536))).toBe(block2.toLocaleLowerCase());
        expect(bytesToHex(result.slice(65536, 65600))).toBe(block3.toLocaleLowerCase());
        expect(bytesToHex(result.slice(131008, 131072))).toBe(block4.toLocaleLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 131072; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLocaleLowerCase());
    });

    test('Set 5, vector#0', () => {
        const key = '00000000000000000000000000000000'
            + '00000000000000000000000000000000';
        const iv = '8000000000000000';

        const block1 = '2ABA3DC45B4947007B14C851CD694456'
            + 'B303AD59A465662803006705673D6C3E'
            + '29F1D3510DFC0405463C03414E0E07E3'
            + '59F1F1816C68B2434A19D3EEE0464873';
        const block2 = 'EFF0C107DCA563B5C0048EB488B40341'
            + 'ED34052790475CD204A947EB480F3D75'
            + '3EF5347CEBB0A21F25B6CC8DE6B48906'
            + 'E604F554A6B01B23791F95C4A93A4717';
        const block3 = 'E3393E1599863B52DE8C52CF26C752FB'
            + '473B74A34D6D9FE31E9CA8DD6292522F'
            + '13EB456C5BE9E5432C06E1BA3965D454'
            + '48936BC98376BF903969F049347EA05D';
        const block4 = 'FC4B2EF3B6B3815C99A437F16BDB06C5'
            + 'B948692786081D91C48CC7B072ABB901'
            + 'C0491CC6900F2FEA217BFFC70C43EDD6'
            + '65E3E020B59AAA43868E9949FBB9AE22';
        const xor = 'FE40F57D1586D7664C2FCA5AB10BD7C7'
            + '9DE3234836E76949F9DC01CBFABC6D6C'
            + '42AB27DDC748B4DF7991092972AB4985'
            + 'CEC19B3E7C2C85D6E25A338DEC288282';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(block1.toLocaleLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(block2.toLocaleLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(block3.toLocaleLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(block4.toLocaleLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLocaleLowerCase());
    });

    test('Set 6, vector#0', () => {
        const key = '0053A6F94C9FF24598EB3E91E4378ADD'
            + '3083D6297CCF2275C81B6EC11467BA0D';
        const iv = '0D74DB42A91077DE';

        const block1 = 'F5FAD53F79F9DF58C4AEA0D0ED9A9601'
            + 'F278112CA7180D565B420A48019670EA'
            + 'F24CE493A86263F677B46ACE1924773D'
            + '2BB25571E1AA8593758FC382B1280B71';
        const block2 = 'B70C50139C63332EF6E77AC54338A407'
            + '9B82BEC9F9A403DFEA821B83F7860791'
            + '650EF1B2489D0590B1DE772EEDA4E3BC'
            + 'D60FA7CE9CD623D9D2FD5758B8653E70';
        const block3 = '81582C65D7562B80AEC2F1A673A9D01C'
            + '9F892A23D4919F6AB47B9154E08E699B'
            + '4117D7C666477B60F8391481682F5D95'
            + 'D96623DBC489D88DAA6956B9F0646B6E';
        const block4 = 'A13FFA1208F8BF50900886FAAB40FD10'
            + 'E8CAA306E63DF39536A1564FB760B242'
            + 'A9D6A4628CDC878762834E27A541DA2A'
            + '5E3B3445989C76F611E0FEC6D91ACACC';
        const xor = 'C349B6A51A3EC9B712EAED3F90D8BCEE'
            + '69B7628645F251A996F55260C62EF31F'
            + 'D6C6B0AEA94E136C9D984AD2DF3578F7'
            + '8E457527B03A0450580DD874F63B1AB9';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(131072)));

        expect(bytesToHex(result.slice(0, 64))).toBe(block1.toLocaleLowerCase());
        expect(bytesToHex(result.slice(65472, 65536))).toBe(block2.toLocaleLowerCase());
        expect(bytesToHex(result.slice(65536, 65600))).toBe(block3.toLocaleLowerCase());
        expect(bytesToHex(result.slice(131008, 131072))).toBe(block4.toLocaleLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 131072; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLocaleLowerCase());
    });
});
