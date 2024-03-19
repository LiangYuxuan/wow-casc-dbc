import fs from 'node:fs/promises';

export default class Store<K extends string | number | symbol, V> {
    private data: Record<K, V | undefined>;

    private dataFile: string;

    private promise: Promise<void>;

    constructor(dataFile: string) {
        this.dataFile = dataFile;
        this.data = {} as Record<K, V | undefined>;

        this.promise = new Promise((resolve) => {
            fs
                .readFile(dataFile, 'utf-8')
                .then((file) => {
                    this.data = JSON.parse(file) as Record<K, V | undefined>;
                    resolve();
                })
                .catch(() => {
                    resolve();
                });
        });
    }

    public async get(key: K): Promise<V | undefined> {
        await this.promise;
        return this.data[key];
    }

    public async set(key: K, value: V): Promise<void> {
        await this.promise;
        this.data[key] = value;
        await fs.writeFile(this.dataFile, JSON.stringify(this.data), 'utf-8');
    }
}
