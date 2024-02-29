export enum LogLevel {
    debug = 'debug',
    info = 'info',
    warn = 'warn',
    error = 'error',
    silent = 'silent',
}

let currentLogLevel: LogLevel = LogLevel.info;

export const setLogLevel = (level: LogLevel) => {
    currentLogLevel = level;
};

export const getLogLevel = () => currentLogLevel;

export const recordLog = (level: LogLevel, message: unknown) => {
    if (level >= currentLogLevel) {
        if (level >= LogLevel.error) {
            // eslint-disable-next-line no-console
            console.error(`${new Date().toISOString()} [${level.toUpperCase()}]:`, message);
        } else {
            // eslint-disable-next-line no-console
            console.log(`${new Date().toISOString()} [${level.toUpperCase()}]:`, message);
        }
    }
};
