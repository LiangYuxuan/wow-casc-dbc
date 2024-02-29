const parseProductConfig = (text: string): Record<string, string>[] => {
    const lines = text.split(/\r?\n/);

    // First line contains field definitions.
    // Example: Name!STRING:0|Path!STRING:0|Hosts!STRING:0|Servers!STRING:0|ConfigPath!STRING:0
    // Whitespace is replaced so that a field like 'Install Key' becomes 'InstallKey'.
    // This just improves coding readability when accessing the fields later on.
    const headers = lines[0]
        .split('|')
        .map((header) => header.split('!')[0].replace(' ', ''));

    const entries = lines
        .filter((line, index) => index > 0 && line.trim().length !== 0 && !line.startsWith('#'))
        .map((line) => {
            const node: Record<string, string> = {};
            const entryFields = line.split('|');
            for (let i = 0, n = entryFields.length; i < n; i += 1) {
                node[headers[i]] = entryFields[i];
            }

            return node;
        });

    return entries;
};

export interface Version {
    Region: string,
    BuildConfig: string,
    CDNConfig: string,
    KeyRing: string,
    BuildId: string,
    VersionsName: string,
    ProductConfig: string,
}

export const parseProductVersions = (
    text: string,
): Version[] => parseProductConfig(text) as unknown as Version[];

export interface CDN {
    Name: string,
    Path: string,
    Hosts: string,
    Servers: string,
    ConfigPath: string,
}

export const parseProductCDNs = (
    text: string,
): CDN[] => parseProductConfig(text) as unknown as CDN[];
