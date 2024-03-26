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
