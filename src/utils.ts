export const resolveCDNHost = async (
    hosts: string[],
    path: string,
): Promise<string[]> => {
    const latencies = await Promise.allSettled(
        hosts.map(async (host) => {
            const start = Date.now();
            await fetch(`http://${host}/`);
            const end = Date.now();
            return {
                host,
                latency: end - start,
            };
        }),
    );

    const resolved = latencies
        .filter((result): result is PromiseFulfilledResult<{
            host: string, latency: number,
        }> => result.status === 'fulfilled')
        .map((result) => result.value)
        .sort((a, b) => a.latency - b.latency);

    return resolved.map((result) => `http://${result.host}/${path}`);
};

const startProcessBar = (total: number, screenWidth = 80) => {
    const totalText = total.toString();
    const barLength = screenWidth - totalText.length * 2 - 4;
    const bar = ' '.repeat(barLength);
    process.stdout.write(`[${bar}] ${'0'.padStart(totalText.length, ' ')}/${totalText}`);
    process.stdout.cursorTo(0);
};

const updateProcessBar = (current: number, total: number, screenWidth = 80) => {
    const totalText = total.toString();
    const barLength = screenWidth - totalText.length * 2 - 4;
    const bar = '='.repeat(Math.floor((current / total) * barLength));
    process.stdout.write(`[${bar.padEnd(barLength, ' ')}] ${current.toString().padStart(totalText.length, ' ')}/${totalText}`);
    process.stdout.cursorTo(0);
};

const endProcessBar = () => {
    process.stdout.write('\n');
};

export const asyncQueue = <T, U>(
    items: T[],
    handler: (arg: T) => Promise<U>,
    limit: number,
): Promise<U[]> => {
    if (items.length === 0) {
        return Promise.resolve([]);
    }

    return new Promise((resolve, reject) => {
        const results: U[] = [];
        let current = 0;
        let pending = 0;
        let completed = 0;

        const next = () => {
            if (current < items.length) {
                const index = current;
                current += 1;
                pending += 1;

                handler(items[index])
                    .then((result) => {
                        results[index] = result;
                    })
                    // eslint-disable-next-line max-len
                    // eslint-disable-next-line @typescript-eslint/use-unknown-in-catch-callback-variable
                    .catch(reject)
                    .finally(() => {
                        pending -= 1;
                        completed += 1;
                        updateProcessBar(completed, items.length);
                        next();
                    });
            } else if (pending === 0) {
                endProcessBar();
                resolve(results);
            }
        };

        startProcessBar(items.length);
        for (let i = 0; i < limit; i += 1) {
            next();
        }
    });
};

const JEDEC = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
// Simplified version of https://github.com/avoidwork/filesize.js
export const formatFileSize = (input: number) => {
    if (Number.isNaN(input)) return '';

    let size = Number(input);
    const isNegative = size < 0;
    const result = [];

    // Flipping a negative number to determine the size.
    if (isNegative) size = -size;

    // Determining the exponent.
    let exponent = Math.floor(Math.log(size) / Math.log(1024));
    if (exponent < 0) exponent = 0;

    // Exceeding supported length, time to reduce & multiply.
    if (exponent > 8) exponent = 8;

    // Zero is now a special case because bytes divide by 1.
    if (size === 0) {
        result[0] = 0;
        result[1] = JEDEC[exponent];
    } else {
        const val = size / (2 ** (exponent * 10));

        result[0] = Number(val.toFixed(exponent > 0 ? 2 : 0));

        if (result[0] === 1024 && exponent < 8) {
            result[0] = 1;
            exponent += 1;
        }

        result[1] = JEDEC[exponent];
    }

    // Decorating a 'diff'.
    if (isNegative) result[0] = -result[0];

    return result.join(' ');
};
