#!/usr/bin/env node

// eslint-disable-next-line prefer-destructuring
const argv = require('yargs').usage('Usage: $0 --configPath ./config.json')
  .help()
  .option('c', {
    alias: 'configPath',
    describe: 'Path to config file',
    type: 'string'
  })
  .option('apcPath', {
    describe: 'Path to APC CSV file',
    type: 'string'
  })
  .option('apcUrl', {
    describe: 'URL of APC CSV file',
    type: 'string'
  })
  .option('gtfsPath', {
    describe: 'Path to GTFS (zipped or unzipped)',
    type: 'string'
  })
  .option('gtfsUrl', {
    describe: 'URL of zipped GTFS file',
    type: 'string'
  })
  .option('skipGTFSImport', {
    describe: 'Don’t import GTFS file.',
    type: 'boolean'
  })
  .default('skipGTFSImport', undefined)
  .option('skipAPCImport', {
    describe: 'Don’t import APC data.',
    type: 'boolean'
  })
  .default('skipAPCImport', undefined)
  .argv;

const fileUtils = require('../lib/file-utils');
const logUtils = require('../lib/log-utils');
const gtfsRide = require('..');

const handleError = error => {
  const text = error || 'Unknown Error';
  process.stdout.write(`\n${logUtils.formatError(text)}\n`);
  console.error(error);
  process.exit(1);
};

const setupImport = async () => {
  const config = await fileUtils.getConfig(argv);
  await gtfsRide(config);
  process.exit();
};

setupImport()
  .catch(handleError);
