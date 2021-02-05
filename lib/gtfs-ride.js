const path = require('path');

const { clone, omit } = require('lodash');
const fs = require('fs-extra');
const gtfs = require('gtfs');
const sanitize = require('sanitize-filename');
const Timer = require('timer-machine');

const fileUtils = require('./file-utils');
const logUtils = require('./log-utils');
const utils = require('./utils');
const importAPC = require('./import-apc');

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

  if (!config.gtfsPath && !config.gtfsUrl) {
    throw new Error('No gtfs info defined in `config.json`.');
  }

  if (!config.apcPath && !config.apcUrl) {
    throw new Error('No APC info defined in `config.json`.');
  }

  const db = gtfs.getDb();
  const timer = new Timer();
  const exportPath = path.join(process.cwd(), 'output', sanitize(config.agencyKey));

  timer.start();

  const gtfsImportConfig = clone(omit(config, 'agency'));
  gtfsImportConfig.agencies = [
    {
      agency_key: config.agencyKey,
      path: config.gtfsPath,
      url: config.gtfsUrl
    }
  ];

  if (!config.skipImport) {
    // Import GTFS
    await gtfs.import(gtfsImportConfig);

    // Import APC Data
    await importAPC(config);
  }

  await fileUtils.prepDirectory(exportPath);

  config.log(`${config.agencyKey}: Generating GTFS-Ride Data`);

  // Export GTFS and GTFS-Ride
  const gtfsExportConfig = {
    ...gtfsImportConfig,
    exportPath: path.join(exportPath, 'gtfs')
  };

  await gtfs.export(gtfsExportConfig);

  // Write log file of all issues
  await fs.writeFile(path.join(exportPath, 'log.txt'), issues.join('\n'));

  timer.stop();

  // Print stats to console
  config.log(`${config.agencyKey}: GTFS-Ride Data created at ${exportPath}`);

  const seconds = Math.round(timer.time() / 1000);
  const boardAlightCount = await db.get('SELECT count(*) from board_alight');
  const outputStats = {
    boardAlights: boardAlightCount['count(*)'],
    issues: issues.length,
    seconds
  };

  logUtils.logStats(outputStats, config);
};
