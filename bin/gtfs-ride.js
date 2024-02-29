#!/usr/bin/env node

import yargs from 'yargs';
/* eslint-disable-next-line node/file-extension-in-import */
import { hideBin } from 'yargs/helpers';

import { getConfig } from '../lib/file-utils.js';
import gtfsRide from '../index.js';

const { argv } = yargs(hideBin(process.argv))
  .usage('Usage: $0 --configPath ./config.json')
  .help()
  .option('c', {
    alias: 'configPath',
    describe: 'Path to config file',
    type: 'string',
  })
  .option('apcPath', {
    describe: 'Path to APC CSV file',
    type: 'string',
  })
  .option('apcUrl', {
    describe: 'URL of APC CSV file',
    type: 'string',
  })
  .option('gtfsPath', {
    describe: 'Path to GTFS (zipped or unzipped)',
    type: 'string',
  })
  .option('gtfsUrl', {
    describe: 'URL of zipped GTFS file',
    type: 'string',
  })
  .option('skipGTFSImport', {
    describe: 'Don’t import GTFS file.',
    type: 'boolean',
  })
  .default('skipGTFSImport', undefined)
  .option('skipAPCImport', {
    describe: 'Don’t import APC data.',
    type: 'boolean',
  })
  .default('skipAPCImport', undefined);

const config = await getConfig(argv);
await gtfsRide(config);
process.exit();
