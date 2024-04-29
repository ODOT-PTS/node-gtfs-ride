import path from 'node:path';
import { writeFile } from 'node:fs/promises';

import { clone, omit } from 'lodash-es';
import { openDb, importGtfs, exportGtfs, getAgencies } from 'gtfs';
import { DateTime } from 'luxon';
import open from 'open';
import Timer from 'timer-machine';
import untildify from 'untildify';

import { generateFolderName, prepDirectory } from './file-utils.js';
import { log, logWarning, logError, logStats } from './log-utils.js';
import { setDefaultConfig } from './utils.js';
import importAPC from './import-apc.js';
import { generateSummaryHtml } from './summary.js';
import {
  countIssuesByDate,
  formatIssue,
  summarizeIssues,
} from './formatters.js';

/*
 * Generate GTFS-Ride data
 */
const gtfsRide = async (initialConfig) => {
  const config = setDefaultConfig(initialConfig);
  config.log = log(config);
  config.logWarning = logWarning(config);
  config.logError = logError(config);

  const issues = [];
  config.recordIssue = (issue) => {
    issues.push(issue);
  };

  try {
    const db = openDb(config);
    const timer = new Timer();

    timer.start();

    if (!config.skipGTFSImport) {
      // Import GTFS
      if (!config.gtfsPath && !config.gtfsUrl) {
        throw new Error('No gtfs info defined in `config.json`.');
      }

      const gtfsImportConfig = clone(omit(config, ['gtfsPath', 'gtfsUrl']));
      gtfsImportConfig.agencies = [
        {
          path: config.gtfsPath,
          url: config.gtfsUrl,
        },
      ];

      await importGtfs(gtfsImportConfig);
    }

    if (!config.skipAPCImport) {
      if (!config.apcPath && !config.apcUrl && !config.swiftlyAgencyKey) {
        throw new Error('No APC info defined in `config.json`.');
      }

      // Import APC Data
      await importAPC(config);
    }

    let folderName;
    try {
      // Get agency name for export folder from first line of agency.txt
      const agencies = getAgencies();
      folderName = generateFolderName(agencies[0].agency_name);
    } catch {
      if (config.sqlitePath === ':memory:') {
        throw new Error(
          'No agencies found in SQLite. You are using an in-memory database - if running this from command line be sure to specify a value for `sqlitePath` in config.json other than ":memory:".',
        );
      }

      throw new Error(
        'No agencies found in SQLite. Be sure to first import data into SQLite using `gtfs-import` or `gtfs.import(config);`',
      );
    }

    const defaultExportPath = path.join(process.cwd(), 'output', folderName);
    const exportPath = untildify(config.exportPath || defaultExportPath);

    await prepDirectory(exportPath);

    // Export GTFS with GTFS-Ride included
    config.log('Generating GTFS-Ride Data');

    await exportGtfs({
      exportPath: path.join(exportPath, 'gtfs_ride'),
      sqlitePath: config.sqlitePath,
    });

    // Write log file of all issues
    await writeFile(
      path.join(exportPath, 'log.txt'),
      issues.map((issue) => formatIssue(issue)).join('\n'),
    );

    timer.stop();

    // Print stats to console
    config.log(`GTFS-Ride Data created at ${exportPath}`);

    const seconds = Math.round(timer.time() / 1000);
    const boardAlightCount = db
      .prepare('SELECT count(*) from board_alight')
      .get();
    const oldestDate = db
      .prepare(
        'SELECT service_date from board_alight ORDER BY service_date ASC LIMIT 1',
      )
      .get();
    const newestDate = db
      .prepare(
        'SELECT service_date from board_alight ORDER BY service_date DESC LIMIT 1',
      )
      .get();
    const stopsWithDataResults = db
      .prepare('SELECT DISTINCT stop_id from board_alight')
      .all();
    const stopsWithData = stopsWithDataResults.map((stop) => stop.stop_id);
    const stopsWithoutData = db
      .prepare(
        `SELECT DISTINCT stop_id, stop_name from stops where stop_id NOT IN (${stopsWithData
          .map(() => '?')
          .join(',')})`,
      )
      .all(...stopsWithData);
    const tripsWithDataResults = db
      .prepare('SELECT DISTINCT trip_id from board_alight')
      .all();
    const tripsWithData = tripsWithDataResults.map((trip) => trip.trip_id);
    const tripsWithoutData = db
      .prepare(
        `SELECT DISTINCT trips.trip_id, trips.direction_id, trips.route_id, routes.route_short_name, routes.route_long_name from trips INNER JOIN routes ON routes.route_id = trips.route_id where trips.trip_id NOT IN (${tripsWithData
          .map(() => '?')
          .join(',')})`,
      )
      .all(...tripsWithData);

    let dateRange = '';
    let issueDateCounts = [];

    if (oldestDate && newestDate) {
      dateRange = `${DateTime.fromFormat(
        oldestDate.service_date.toString(),
        'yyyyMMdd',
      ).toLocaleString(DateTime.DATE_FULL)} -  ${DateTime.fromFormat(
        newestDate.service_date.toString(),
        'yyyyMMdd',
      ).toLocaleString(DateTime.DATE_FULL)}`;

      issueDateCounts = countIssuesByDate(
        issues,
        oldestDate.service_date,
        newestDate.service_date,
      );
    }

    const outputStats = {
      apcType: config.apcType,
      boardAlightCount: boardAlightCount['count(*)'],
      issues,
      issueSummaries: summarizeIssues(issues),
      issueDateCounts,
      seconds,
      dateRange,
      stopsWithData,
      stopsWithoutData,
      tripsWithData,
      tripsWithoutData,
    };

    logStats(outputStats, config);

    // Write summary html of output
    const summaryHtmlPath = path.join(exportPath, 'summary.html');
    const html = await generateSummaryHtml(outputStats);
    await writeFile(summaryHtmlPath, html);
    open(summaryHtmlPath);
  } catch (error) {
    if (error instanceof Error && error.code === 'SQLITE_CANTOPEN') {
      config.logError(
        `Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`,
      );
    }

    throw error;
  }
};

export default gtfsRide;
