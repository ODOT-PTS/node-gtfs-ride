const path = require('path');

const { clone, omit } = require('lodash');
const fs = require('fs-extra');
const gtfs = require('gtfs');
const sanitize = require('sanitize-filename');
const Timer = require('timer-machine');

const fileUtils = require('./file-utils');
const logUtils = require('./log-utils');
const utils = require('./utils');
const importAPC = require('./import');

/*
 * Generate GTFS-Ride data
 */
module.exports = async initialConfig => {
  const config = utils.setDefaultConfig(initialConfig);
  config.log = logUtils.log(config);
  config.logWarning = logUtils.logWarning(config);
  config.logError = logUtils.logError(config);

  const issues = [];
  config.recordIssue = issue => {
    issues.push(issue);
  };

  await gtfs.openDb(config).catch(error => {
    if (error instanceof Error && error.code === 'SQLITE_CANTOPEN') {
      config.logError(`Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`);
    }

    throw error;
  });

  if (!config.gtfs) {
    throw new Error('No gtfs defined in `config.json`.');
  }

  if (!config.apc || !config.apc.type) {
    throw new Error(`${agencyKey}: No APC info in \`config.json\`.`);
  }

  const timer = new Timer();
  const agencyKey = config.gtfs.agency_key;
  const exportPath = path.join(process.cwd(), 'output', sanitize(agencyKey));

  timer.start();

  const gtfsImportConfig = clone(omit(config, 'agency'));
  gtfsImportConfig.agencies = [
    {
      agency_key: config.gtfs.agency_key,
      path: config.gtfs.gtfs_static_path,
      url: config.gtfs.gtfs_static_url
    }
  ];

  if (!config.skipImport) {
    // Import GTFS
    await gtfs.import(gtfsImportConfig);

    // Import APC Data
    await importAPC(config);
  }

  await fileUtils.prepDirectory(exportPath);

  config.log(`${agencyKey}: Generating GTFS-Ride Data`);

  // Export GTFS and GTFS-Ride
  const gtfsExportConfig = {
    ...gtfsImportConfig,
    exportPath: path.join(exportPath, 'gtfs')
  };

  await gtfs.export(gtfsExportConfig);

  // Log all issues
  await fs.writeFile(path.join(exportPath, 'log.txt'), issues.join('\n'));

  timer.stop();

  // Print stats to console
  config.log(`${agencyKey}: GTFS-Ride Data created at ${exportPath}`);

  const seconds = Math.round(timer.time() / 1000);
  const outputStats = {
    issues: issues.length,
    seconds
  };

  logUtils.logStats(outputStats, config);
};
