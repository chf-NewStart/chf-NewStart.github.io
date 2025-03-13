import { config as baseConfig } from './wdio.conf';

export const config = {
    ...baseConfig,
    framework: 'mocha',
    mochaOpts: {
        ui: 'bdd',
        timeout: 60000
    },
    specs: [
        './specs/**/*.ts'
    ],
};