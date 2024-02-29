const name2FileDataID = new Map<string, number>();

const getRemoteListFile = async (): Promise<void> => {
    const url = 'https://github.com/wowdev/wow-listfile/releases/download/202402031841/community-listfile.csv';
    const text = await (await fetch(url)).text();
    const lines = text.split('\n');
    lines.forEach((line) => {
        const [fileDataID, name] = line.split(';');
        name2FileDataID.set(name.trim(), parseInt(fileDataID.trim(), 10));
    });
};

const getFileDataIDByNameRemote = async (name: string): Promise<number | undefined> => {
    if (name2FileDataID.size === 0) {
        await getRemoteListFile();
    }

    return name2FileDataID.get(name);
};

export default getFileDataIDByNameRemote;
