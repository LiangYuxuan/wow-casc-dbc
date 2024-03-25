# WoW CASC & DBC

Node.js tool to fetch World of Warcraft data files from CASC and parse DBC/DB2 files.

## Snippet

```javascript
// Get version
const region = 'us';
const product = 'wow';
const version = await CASCClient.getProductVersion(region, product);

// Client initialization
const client = new CASCClient(region, product, version);
await client.init();
await client.loadRemoteTACTKeys();
await client.loadRemoteListFile();

// Fetch file
const fileDataID = client.getFileDataIDByName('dbfilesclient/questxp.db2');
const cKeys = client.getContentKeysByFileDataID(fileDataID);
const cKey = cKeys.find((data) => !!(data.localeFlags & CASCClient.LocaleFlags.enUS));
const { buffer } = await client.getFileByContentKey(cKey.cKey);

// Parse DB2 file
const reader = new WDCReader(buffer);
const parser = await DBDParser.parse(reader);

// Access DB2 file
// reader.getRowData
// parser.getRowData
```

## License

MIT License
