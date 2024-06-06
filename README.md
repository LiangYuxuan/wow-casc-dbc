# WoW CASC & DBC

Node.js tool to fetch World of Warcraft data files from CASC and parse DBC/DB2 files.

## Snippet

### Basic Usage

```javascript
import { CASCClient, WDCReader, DBDParser } from '@rhyster/wow-casc-dbc';

// Get version
const region = 'us';
const product = 'wow';
const version = await CASCClient.getProductVersion(region, product);

// Client initialization
const client = new CASCClient(region, product, version);
await client.init();
await client.loadRemoteTACTKeys();
await client.loadRemoteListFile(); // pretty slow, recommend to provide fileDataID directly

// Fetch file
const fileDataID = client.getFileDataIDByName('dbfilesclient/questxp.db2'); // see previous line
const cKeys = client.getContentKeysByFileDataID(fileDataID);
const cKey = cKeys.find((data) => !!(data.localeFlags & CASCClient.LocaleFlags.enUS));
const { buffer } = await client.getFileByContentKey(cKey.cKey);

// Parse DB2 file
const reader = new WDCReader(buffer);
const parser = await DBDParser.parse(reader);

// Access DB2 file
reader.getAllIDs().forEach((id) => {
    const rowFields = reader.getRowData(id);
});
parser.getAllIDs().forEach((id) => {
    const rowObject = parser.getRowData(id);
});
```

### Partial Decrypt

Some file is encrypted and no key released yet. For DB2 files, you can ignore the encrypted part and parse the others.

```javascript
// ...

const result = await client.getFileByContentKey(cKey.cKey, true);
const reader = new WDCReader(result.buffer, result.blocks);
const parser = await DBDParser.parse(reader);

// ...
```

### Hotfix

Applying hotfix requires `DBCache.bin` file from the client, and it seems the only way to get this is from the client. So, you need to search for `DBCache.bin` yourself, like `<WoWPath>/_retail_/Cache/ADB/enUS/DBCache.bin` or download it somewhere.

It's also important to compare build, region and locale with the db2 file that to be patched to avoid broken data.

```javascript
// ...

const dbcache = await fs.readFile('path/to/DBCache.bin');
const buffer = await fs.readFile('path/to/name.db2');

const adb = new ADBReader(dbcache);
assert(adb.build === parseInt(version.BuildId, 10));

const reader = new WDCReader(buffer, [], adb);
const parser = await DBDParser.parse(reader);

// ...
```

## License

MIT License
