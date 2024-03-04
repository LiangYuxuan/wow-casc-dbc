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

// https://github.com/das-labor/legacy/blob/master/microcontroller-2/arm-crypto-lib/testvectors/salsa20-full-verified.test-vectors
describe('Salsa20 128-bit', () => {
    test('Set 1, Vector #0', () => {
        const key = '80000000000000000000000000000000';
        const iv = '0000000000000000';

        const bk1 = '4DFA5E481DA23EA09A31022050859936'
                  + 'DA52FCEE218005164F267CB65F5CFD7F'
                  + '2B4F97E0FF16924A52DF269515110A07'
                  + 'F9E460BC65EF95DA58F740B7D1DBB0AA';
        const bk2 = 'DA9C1581F429E0A00F7D67E23B730676'
                  + '783B262E8EB43A25F55FB90B3E753AEF'
                  + '8C6713EC66C51881111593CCB3E8CB8F'
                  + '8DE124080501EEEB389C4BCB6977CF95';
        const bk3 = '7D5789631EB4554400E1E025935DFA7B'
                  + '3E9039D61BDC58A8697D36815BF1985C'
                  + 'EFDF7AE112E5BB81E37ECF0616CE7147'
                  + 'FC08A93A367E08631F23C03B00A8DA2F';
        const bk4 = 'B375703739DACED4DD4059FD71C3C47F'
                  + 'C2F9939670FAD4A46066ADCC6A564578'
                  + '3308B90FFB72BE04A6B147CBE38CC0C3'
                  + 'B9267C296A92A7C69873F9F263BE9703';
        const xor = 'F7A274D268316790A67EC058F45C0F2A'
                  + '067A99FCDE6236C0CEF8E056349FE54C'
                  + '5F13AC74D2539570FD34FEAB06C57205'
                  + '3949B59585742181A5A760223AFA22D4';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 2, Vector #0', () => {
        const key = '00000000000000000000000000000000';
        const iv = '0000000000000000';

        const bk1 = '6513ADAECFEB124C1CBE6BDAEF690B4F'
                  + 'FB00B0FCACE33CE806792BB414801998'
                  + '34BFB1CFDD095802C6E95E251002989A'
                  + 'C22AE588D32AE79320D9BD7732E00338';
        const bk2 = '75E9D0493CA05D2820408719AFC75120'
                  + '692040118F76B8328AC279530D846670'
                  + '65E735C52ADD4BCFE07C9D93C0091790'
                  + '2B187D46A25924767F91A6B29C961859';
        const bk3 = '0E47D68F845B3D31E8B47F3BEA660E2E'
                  + 'CA484C82F5E3AE00484D87410A1772D0'
                  + 'FA3B88F8024C170B21E50E0989E94A26'
                  + '69C91973B3AE5781D305D8122791DA4C';
        const bk4 = 'CCBA51D3DB400E7EB780C0CCBD3D2B5B'
                  + 'B9AAD82A75A1F746824EE5B9DAF7B794'
                  + '7A4B808DF48CE94830F6C9146860611D'
                  + 'A649E735ED5ED6E3E3DFF7C218879D63';
        const xor = '6D3937FFA13637648E477623277644AD'
                  + 'AD3854E6B2B3E4D68155356F68B30490'
                  + '842B2AEA2E32239BE84E613C6CE1B9BD'
                  + '026094962CB1A6757AF5A13DDAF8252C';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 3, Vector #0', () => {
        const key = '000102030405060708090A0B0C0D0E0F';
        const iv = '0000000000000000';

        const bk1 = '2DD5C3F7BA2B20F76802410C68868889'
                  + '5AD8C1BD4EA6C9B140FB9B90E21049BF'
                  + '583F527970EBC1A4C4C5AF117A5940D9'
                  + '2B98895B1902F02BF6E9BEF8D6B4CCBE';
        const bk2 = 'AB56CC2C5BFFEF174BBE28C48A17039E'
                  + 'CB795F4C2541E2F4AE5C69CA7FC2DED4'
                  + 'D39B2C7B936ACD5C2ECD4719FD6A3188'
                  + '323A14490281CBE8DAC48E4664FF3D3B';
        const bk3 = '9A18E827C33633E932FC431D697F0775'
                  + 'B4C5B0AD26D1ACD5A643E3A01A065821'
                  + '42A43F48E5D3D9A91858887310D39969'
                  + 'D65E7DB788AFE27D03CD985641967357';
        const bk4 = '752357191E8041ABB8B5761FAF9CB9D7'
                  + '3072E10B4A3ED8C6ADA2B05CBBAC298F'
                  + '2ED6448360F63A51E073DE02338DBAF2'
                  + 'A8384157329BC31A1036BBB4CBFEE660';
        const xor = 'F3BCF4D6381742839C5627050D4B227F'
                  + 'EB1ECCC527BF605C4CB9D6FB0618F419'
                  + 'B51846707550BBEEE381E44A50A406D0'
                  + '20C8433D08B19C98EFC867ED9897EDBB';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 4, Vector #0', () => {
        const key = '0053A6F94C9FF24598EB3E91E4378ADD';
        const iv = '0000000000000000';

        const bk1 = 'BE4EF3D2FAC6C4C3D822CE67436A407C'
                  + 'C237981D31A65190B51053D13A19C89F'
                  + 'C90ACB45C8684058733EDD259869C58E'
                  + 'EF760862BEFBBCA0F6E675FD1FA25C27';
        const bk2 = 'F5666B7BD1F4BC8134E0E45CDB69876D'
                  + '1D0ADAE6E3C17BFBFE4BCE02461169C5'
                  + '4B787C6EF602AF92BEBBD66321E0CAF0'
                  + '44E1ADA8CCB9F9FACFC4C1031948352E';
        const bk3 = '292EEB202F1E3A353D9DC6188C5DB434'
                  + '14C9EF3F479DF988125EC39B30C014A8'
                  + '09683084FBCDD5271165B1B1BF54DAB4'
                  + '40577D864CD186867876F7FDA5C79653';
        const bk4 = 'C012E8E03878A6E7D236FEC001A9F895'
                  + 'B4F58B2AF2F3D237A944D93273F5F3B5'
                  + '45B1220A6A2C732FC85E7632921F2D36'
                  + '6B3290C7B0A73FB61D49BC7616FC02B8';
        const xor = '196D1A0977F0585B23367497D449E11D'
                  + 'E328ECD944BC133F786348C9591B35B7'
                  + '189CDDD934757ED8F18FBC984DA377A8'
                  + '07147F1A6A9A8759FD2A062FD76D275E';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(131072)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(65472, 65536))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(65536, 65600))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(131008, 131072))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 131072; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 5, Vector #0', () => {
        const key = '00000000000000000000000000000000';
        const iv = '8000000000000000';

        const bk1 = 'B66C1E4446DD9557E578E223B0B76801'
                  + '7B23B267BB0234AE4626BF443F219776'
                  + '436FB19FD0E8866FCD0DE9A9538F4A09'
                  + 'CA9AC0732E30BCF98E4F13E4B9E201D9';
        const bk2 = '462920041C5543954D6230C531042B99'
                  + '9A289542FEB3C129C5286E1A4B4CF118'
                  + '7447959785434BEF0D05C6EC8950E469'
                  + 'BBA6647571DDD049C72D81AC8B75D027';
        const bk3 = 'DD84E3F631ADDC4450B9813729BD8E7C'
                  + 'C8909A1E023EE539F12646CFEC03239A'
                  + '68F3008F171CDAE514D20BCD584DFD44'
                  + 'CBF25C05D028E51870729E4087AA025B';
        const bk4 = '5AC8474899B9E28211CC7137BD0DF290'
                  + 'D3E926EB32D8F9C92D0FB1DE4DBE452D'
                  + 'E3800E554B348E8A3D1B9C59B9C77B09'
                  + '0B8E3A0BDAC520E97650195846198E9D';
        const xor = '104639D9F65C879F7DFF8A82A94C130C'
                  + 'D6C727B3BC8127943ACDF0AB7AD6D28B'
                  + 'F2ADF50D81F50C53D0FDFE15803854C7'
                  + 'D67F6C9B4752275696E370A467A4C1F8';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 6, Vector #0', () => {
        const key = '0053A6F94C9FF24598EB3E91E4378ADD';
        const iv = '0D74DB42A91077DE';

        const bk1 = '05E1E7BEB697D999656BF37C1B978806'
                  + '735D0B903A6007BD329927EFBE1B0E2A'
                  + '8137C1AE291493AA83A821755BEE0B06'
                  + 'CD14855A67E46703EBF8F3114B584CBA';
        const bk2 = '1A70A37B1C9CA11CD3BF988D3EE4612D'
                  + '15F1A08D683FCCC6558ECF2089388B8E'
                  + '555E7619BF82EE71348F4F8D0D2AE464'
                  + '339D66BFC3A003BF229C0FC0AB6AE1C6';
        const bk3 = '4ED220425F7DDB0C843232FB03A7B1C7'
                  + '616A50076FB056D3580DB13D2C295973'
                  + 'D289CC335C8BC75DD87F121E85BB9981'
                  + '66C2EF415F3F7A297E9E1BEE767F84E2';
        const bk4 = 'E121F8377E5146BFAE5AEC9F422F474F'
                  + 'D3E9C685D32744A76D8B307A682FCA1B'
                  + '6BF790B5B51073E114732D3786B985FD'
                  + '4F45162488FEEB04C8F26E27E0F6B5CD';
        const xor = '620BB4C2ED20F4152F0F86053D3F5595'
                  + '8E1FBA48F5D86B25C8F31559F3158072'
                  + '6E7ED8525D0B9EA5264BF97750713476'
                  + '1EF65FE195274AFBF000938C03BA59A7';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(131072)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(65472, 65536))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(65536, 65600))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(131008, 131072))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 131072; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });
});

describe('Salsa20 256-bit', () => {
    test('Set 1, Vector #0', () => {
        const key = '80000000000000000000000000000000'
                  + '00000000000000000000000000000000';
        const iv = '0000000000000000';

        const bk1 = 'E3BE8FDD8BECA2E3EA8EF9475B29A6E7'
                  + '003951E1097A5C38D23B7A5FAD9F6844'
                  + 'B22C97559E2723C7CBBD3FE4FC8D9A07'
                  + '44652A83E72A9C461876AF4D7EF1A117';
        const bk2 = '57BE81F47B17D9AE7C4FF15429A73E10'
                  + 'ACF250ED3A90A93C711308A74C6216A9'
                  + 'ED84CD126DA7F28E8ABF8BB63517E1CA'
                  + '98E712F4FB2E1A6AED9FDC73291FAA17';
        const bk3 = '958211C4BA2EBD5838C635EDB81F513A'
                  + '91A294E194F1C039AEEC657DCE40AA7E'
                  + '7C0AF57CACEFA40C9F14B71A4B3456A6'
                  + '3E162EC7D8D10B8FFB1810D71001B618';
        const bk4 = '696AFCFD0CDDCC83C7E77F11A649D79A'
                  + 'CDC3354E9635FF137E929933A0BD6F53'
                  + '77EFA105A3A4266B7C0D089D08F1E855'
                  + 'CC32B15B93784A36E56A76CC64BC8477';
        const xor = '50EC2485637DB19C6E795E9C73938280'
                  + '6F6DB320FE3D0444D56707D7B456457F'
                  + '3DB3E8D7065AF375A225A70951C8AB74'
                  + '4EC4D595E85225F08E2BC03FE1C42567';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 2, Vector #0', () => {
        const key = '00000000000000000000000000000000'
                  + '00000000000000000000000000000000';
        const iv = '0000000000000000';

        const bk1 = '9A97F65B9B4C721B960A672145FCA8D4'
                  + 'E32E67F9111EA979CE9C4826806AEEE6'
                  + '3DE9C0DA2BD7F91EBCB2639BF989C625'
                  + '1B29BF38D39A9BDCE7C55F4B2AC12A39';
        const bk2 = '2F3C3E10649160B44321B7F830D7D222'
                  + '699FAE0E834C76C3997985B5404808AB'
                  + '7E6E99AA1FEC2730749213E7F37A291A'
                  + 'A6B5AFD2E524C2D608F34D4959930436';
        const bk3 = '8598D1FA94516B474B69DA83E3C1312C'
                  + '49A05B8283B880B31872CD1EA7D8F1B2'
                  + 'D60A86CBA8184F949EA7AE8502A582DB'
                  + '392E85C4D70D3D17B2E57D817A98ED6E';
        const bk4 = 'F86C7489712FB77896706FC892D9A1C8'
                  + '4BB53D081F6EB4AE1C68B1190CBB0B41'
                  + '484E9E2B6FEA0A31BF124415921E5CF3'
                  + '7C26493A5BC08F7620A8C80503C4C76F';
        const xor = '7C3A1499A63B507B0BC75824ABEEAA26'
                  + '109101C5B915F0F554DD9950045D02FA'
                  + 'FF815CA8B2C7CFF3625765697B80B026'
                  + '7EA87E25412564BD71DD05843A60465E';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 3, Vector #0', () => {
        const key = '000102030405060708090A0B0C0D0E0F'
                  + '101112131415161718191A1B1C1D1E1F';
        const iv = '0000000000000000';

        const bk1 = 'B580F7671C76E5F7441AF87C146D6B51'
                  + '3910DC8B4146EF1B3211CF12AF4A4B49'
                  + 'E5C874B3EF4F85E7D7ED539FFEBA73EB'
                  + '73E0CCA74FBD306D8AA716C7783E89AF';
        const bk2 = '9B5B5406977968E7F472DE2924EFFD0E'
                  + '8EA74C954D23FCC21E4ED87BBA9E0F79'
                  + 'D1477D1810368F02259F7F53966F91CE'
                  + 'B50ECD3DA10363E7F08EEAB83A0EF71A';
        const bk3 = '68E43AA40C5D5718E636D8E3B0AB3830'
                  + 'D61698A12EB15BD9C923FF40A23E80BE'
                  + '026B7E1349265AD9C20A6C8A60256F4A'
                  + 'CD1D7AD0DCBE1DFF3058ACD9E1B4C537';
        const bk4 = '343ED5D011373AF376308D0B0DAB7806'
                  + 'A4B4D3BF9B898181D546EFCF83D7464C'
                  + 'FC56AE76F03F3711174DC67AC9363E69'
                  + '84F5A447BD25642A00754F1133BFD953';
        const xor = '8C03E9237FEE95D5041C753C204D2B35'
                  + '764E4A53035A76F9EFBADD7E63E60B69'
                  + 'BF23F7C5FD39B2249B0C628FB654D521'
                  + '4EB588371E5D2F34BF51396AF3ACB666';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 4, Vector #0', () => {
        const key = '0053A6F94C9FF24598EB3E91E4378ADD'
                  + '3083D6297CCF2275C81B6EC11467BA0D';
        const iv = '0000000000000000';

        const bk1 = 'F9D2DC274BB55AEFC2A0D9F8A982830F'
                  + '6916122BC0A6870F991C6ED8D00D2F85'
                  + '94E3151DE4C5A19A9A06FBC191C87BF0'
                  + '39ADF971314BAF6D02337080F2DAE5CE';
        const bk2 = '05BDA8EE240BA6DC53A42C14C17F620F'
                  + '6FA799A6BC88775E04EEF427B4B9DE5A'
                  + '5349327FCADA077F385BA321DB4B3939'
                  + 'C0F49EA99801790B0FD32986AFC41B85';
        const bk3 = 'FED5279620FBCBDD3C3980B11FCE4787'
                  + 'E6F9F97772BEAAD0EF215FDCD0B3A16F'
                  + 'BB56D72AFD5FD52E6A584BF840914168'
                  + 'D04A594FFDDA959A63EB4CF42694F03F';
        const bk4 = 'F161DCE8FA4CF80F8143DDB21FA1BFA3'
                  + '1CA4DC0A412233EDE80EF72DAA1B8039'
                  + '4BCE3875CA1E1E195D58BC3197F803A8'
                  + '9C433A59A0718C1A009BCB4DA2AC1778';
        const xor = '2052F9A2853E989133D10938222AC76D'
                  + 'B8B4CBA135ACB59970DDF9C074C6271A'
                  + '5C4E2A7A00D2D697EDFC9B1FF9B365C8'
                  + '7347B23020663A30711A71E3A02AB00C';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(131072)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(65472, 65536))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(65536, 65600))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(131008, 131072))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 131072; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 5, Vector #0', () => {
        const key = '00000000000000000000000000000000'
                  + '00000000000000000000000000000000';
        const iv = '8000000000000000';

        const bk1 = '2ABA3DC45B4947007B14C851CD694456'
                  + 'B303AD59A465662803006705673D6C3E'
                  + '29F1D3510DFC0405463C03414E0E07E3'
                  + '59F1F1816C68B2434A19D3EEE0464873';
        const bk2 = 'EFF0C107DCA563B5C0048EB488B40341'
                  + 'ED34052790475CD204A947EB480F3D75'
                  + '3EF5347CEBB0A21F25B6CC8DE6B48906'
                  + 'E604F554A6B01B23791F95C4A93A4717';
        const bk3 = 'E3393E1599863B52DE8C52CF26C752FB'
                  + '473B74A34D6D9FE31E9CA8DD6292522F'
                  + '13EB456C5BE9E5432C06E1BA3965D454'
                  + '48936BC98376BF903969F049347EA05D';
        const bk4 = 'FC4B2EF3B6B3815C99A437F16BDB06C5'
                  + 'B948692786081D91C48CC7B072ABB901'
                  + 'C0491CC6900F2FEA217BFFC70C43EDD6'
                  + '65E3E020B59AAA43868E9949FBB9AE22';
        const xor = 'FE40F57D1586D7664C2FCA5AB10BD7C7'
                  + '9DE3234836E76949F9DC01CBFABC6D6C'
                  + '42AB27DDC748B4DF7991092972AB4985'
                  + 'CEC19B3E7C2C85D6E25A338DEC288282';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(512)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(192, 256))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(256, 320))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(448, 512))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 512; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });

    test('Set 6, Vector #0', () => {
        const key = '0053A6F94C9FF24598EB3E91E4378ADD'
                  + '3083D6297CCF2275C81B6EC11467BA0D';
        const iv = '0D74DB42A91077DE';

        const bk1 = 'F5FAD53F79F9DF58C4AEA0D0ED9A9601'
                  + 'F278112CA7180D565B420A48019670EA'
                  + 'F24CE493A86263F677B46ACE1924773D'
                  + '2BB25571E1AA8593758FC382B1280B71';
        const bk2 = 'B70C50139C63332EF6E77AC54338A407'
                  + '9B82BEC9F9A403DFEA821B83F7860791'
                  + '650EF1B2489D0590B1DE772EEDA4E3BC'
                  + 'D60FA7CE9CD623D9D2FD5758B8653E70';
        const bk3 = '81582C65D7562B80AEC2F1A673A9D01C'
                  + '9F892A23D4919F6AB47B9154E08E699B'
                  + '4117D7C666477B60F8391481682F5D95'
                  + 'D96623DBC489D88DAA6956B9F0646B6E';
        const bk4 = 'A13FFA1208F8BF50900886FAAB40FD10'
                  + 'E8CAA306E63DF39536A1564FB760B242'
                  + 'A9D6A4628CDC878762834E27A541DA2A'
                  + '5E3B3445989C76F611E0FEC6D91ACACC';
        const xor = 'C349B6A51A3EC9B712EAED3F90D8BCEE'
                  + '69B7628645F251A996F55260C62EF31F'
                  + 'D6C6B0AEA94E136C9D984AD2DF3578F7'
                  + '8E457527B03A0450580DD874F63B1AB9';

        const handler = new Salsa20(hexToBytes(key), hexToBytes(iv));
        const result = handler.process(hexToBytes('00'.repeat(131072)));

        expect(bytesToHex(result.slice(0, 64))).toBe(bk1.toLowerCase());
        expect(bytesToHex(result.slice(65472, 65536))).toBe(bk2.toLowerCase());
        expect(bytesToHex(result.slice(65536, 65600))).toBe(bk3.toLowerCase());
        expect(bytesToHex(result.slice(131008, 131072))).toBe(bk4.toLowerCase());

        const xorResult = new Uint8Array(64);
        for (let i = 0; i < 131072; i += 1) {
            xorResult[i % 64] ^= result[i];
        }

        expect(bytesToHex(xorResult)).toBe(xor.toLowerCase());
    });
});
