import { writeFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import { Buffer } from 'node:buffer';

import fetch from 'node-fetch';
import { getDb } from 'gtfs';
import { parse } from 'csv-parse';
import stripBomStream from 'strip-bom-stream';
import { dir } from 'tmp-promise';
import untildify from 'untildify';
import { DateTime } from 'luxon';

import boardAlightModel from 'gtfs/models/gtfs-ride/board-alight.js';
import rideFeedInfoModel from 'gtfs/models/gtfs-ride/ride-feed-info.js';
import { calculateHourTimestamp } from './utils.js';
import { countFileLines } from './file-utils.js';
import { progressBar } from './log-utils.js';
import { cleanLine } from './formatters.js';
import mergeAPC from './merge-apc.js';

import { formatCETLine } from './import-types/cet.js';
import { formatLTDLine } from './import-types/ltd.js';
import { formatRVTDLine } from './import-types/rvtd.js';
import { formatSwiftlyLine } from './import-types/swiftly.js';
import { formatGMVLine } from './import-types/gmv.js';
import { formatWETALine } from './import-types/weta.js';

const getAPCType = recordFieldNames => {
  const cetRequiredFieldNames = [
    'RouteStop',
    'Route_ID',
    'ClientTime',
    'Entrys',
    'Exits',
  ];

  const gmvRequiredFieldNames = [
    'VehicleId',
    'VehicleName',
    'RouteId',
    'RouteName',
    'PatternId',
    'PatternName',
    'StopId',
    'StopName',
    'StopNumber',
    'Timepoint',
    'TripId',
    'TripName',
    'RunId',
    'RunName',
    'BlockId',
    'Arrive',
    'ArriveVariance',
    'ScheduledArrive',
    'Depart',
    'DepartVariance',
    'ScheduledDepart',
    'Ons',
    'Offs',
    'ArrivalPassengers',
    'VehicleCapacity',
    'DeparturePassengers',
  ];

  const ltdRequiredFieldNames = [
    'stop',
    'trip_sn',
    'route',
    'calendar_date',
    'msg_time',
    'board',
    'alight',
    'departure_load',
  ];

  const rvtdRequiredFieldNames = [
    'stop_code',
    'trip_id',
    'stope_sequence',
    'record_use',
    'schedule_relationship',
    'boardings',
    'alightings',
    'current_load',
    'load_type',
    'rack_down',
    'bike_boardings',
    'bike_alightings',
    'ramp_used',
    'ramp_boardings',
    'ramp_alightings',
    'service_arrival_date',
    'service_arrival_time',
    'source',
  ];

  const wetaRequiredFieldNames = [
    'Date',
    'Vessel',
    'SchedDepart',
    'Depart',
    'Arrival',
    'RunSegment',
    'PassengersOn',
    'PassengersOff',
    'BikesOn',
    'BikesOff',
  ];

  const swiftlyRequiredFieldNames = [
    'service_date',
    'actual_time',
    'scheduled_time',
    'trip_id',
    'stop_id',
    'boardings',
    'alightings',
    'occupancy_count',
  ];

  if (cetRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'cet';
  }

  if (gmvRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'gmv';
  }

  if (ltdRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'ltd';
  }

  if (rvtdRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'rvtd';
  }

  if (swiftlyRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'swiftly';
  }

  if (wetaRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'weta';
  }

  throw new Error(`Unable to detect APC type from field names: ${recordFieldNames.join(', ')}`);
};

const convertToBoardAlights = async (line, config) => {
  try {
    const boardAlightLines = [];
    switch (config.apcType) {
      case 'cet': {
        boardAlightLines.push(await formatCETLine(line));

        break;
      }

      case 'gmv': {
        boardAlightLines.push(await formatGMVLine(line));

        break;
      }

      case 'ltd': {
        boardAlightLines.push(await formatLTDLine(line));

        break;
      }

      case 'rvtd': {
        boardAlightLines.push(await formatRVTDLine(line));

        break;
      }

      case 'swiftly': {
        boardAlightLines.push(await formatSwiftlyLine(line));

        break;
      }

      case 'weta': {
        boardAlightLines.push(...await formatWETALine(line));

        break;
      }

      default: {
        throw new Error(`Unknown APC type \`${config.apcType}\``);
      }
    }

    return Promise.all(boardAlightLines.map(line => cleanLine(line, boardAlightModel, config)));
  } catch (error) {
    config.recordIssue(`${error.message} on line ${line.lineNumber}`);
    return [];
  }
};

const formatLine = ({ record, lineNumber }, model) => {
  for (const fieldName of Object.keys(record)) {
    const columnSchema = model.schema.find(schema => schema.name === fieldName);

    // Remove columns not part of model
    if (!columnSchema) {
      delete record[fieldName];
      continue;
    }

    // Remove null values
    if (record[fieldName] === null || record[fieldName] === '') {
      delete record[fieldName];
    }

    // Convert fields that should be integer
    if (columnSchema.type === 'integer') {
      const value = Number.parseInt(record[fieldName], 10);

      if (Number.isNaN(value)) {
        delete record[fieldName];
      } else {
        record[fieldName] = value;
      }
    }

    // Convert fields that should be float
    if (columnSchema.type === 'real') {
      const value = Number.parseFloat(record[fieldName]);

      if (Number.isNaN(value)) {
        delete record[fieldName];
      } else {
        record[fieldName] = value;
      }
    }

    // Validate required
    if (columnSchema.required === true && (record[fieldName] === undefined || record[fieldName] === '')) {
      throw new Error(`Missing required value in ${model.filenameBase}.txt for ${fieldName} on line ${lineNumber}.`);
    }

    // Validate minimum
    if (columnSchema.min !== undefined && record[fieldName] < columnSchema.min) {
      throw new Error(`Invalid value in ${model.filenameBase}.txt for ${fieldName} on line ${lineNumber}: below minimum value of ${columnSchema.min}.`);
    }

    // Validate maximum
    if (columnSchema.max !== undefined && record[fieldName] > columnSchema.max) {
      throw new Error(`Invalid value in ${model.filenameBase}.txt for ${fieldName} on line ${lineNumber}: above maximum value of ${columnSchema.max}.`);
    }
  }

  // Convert to midnight timestamp
  const timestampFormat = [
    'start_time',
    'end_time',
    'arrival_time',
    'departure_time',
  ];

  for (const fieldName of timestampFormat) {
    if (record[fieldName]) {
      record[`${fieldName}stamp`] = calculateHourTimestamp(record[fieldName]);
    }
  }

  return {
    record,
    lineNumber,
  };
};

const importLines = async (lines, bar, config) => {
  const db = getDb();
  const model = boardAlightModel;
  const formattedLines = [];

  while (lines.length > 0) {
    const line = lines.shift();
    bar.tick();

    /* eslint-disable-next-line no-await-in-loop */
    const boardAlightLines = await convertToBoardAlights(line, config);

    for (const boardAlightLine of boardAlightLines) {
      formattedLines.push(formatLine(boardAlightLine, model));
    }
  }

  if (formattedLines.length === 0) {
    return;
  }

  const fieldNames = model.schema.map(column => column.name);
  const placeholders = [];
  const values = [];
  let lineNumberStart;

  for (const line of formattedLines) {
    if (!lineNumberStart) {
      lineNumberStart = line.lineNumber;
    }

    placeholders.push(`(${fieldNames.map(() => '?').join(', ')})`);
    for (const fieldName of fieldNames) {
      values.push(line.record[fieldName]);
    }
  }

  try {
    await db.run(`INSERT INTO ${model.filenameBase}(${fieldNames.join(', ')}) VALUES${placeholders.join(',')}`, values);
  } catch (error) {
    config.logWarning(`Check APC data for invalid data between lines ${lineNumberStart} and ${lineNumberStart + lines.length}.`);
    throw error;
  }
};

const importFile = async (filePath, config) => {
  if (!existsSync(filePath)) {
    config.recordIssue(`Importing - ${filePath} - No file found\r`);

    throw new Error(`Importing - ${filePath} - No file found\r`);
  }

  const totalLineCount = await countFileLines(filePath);
  const bar = progressBar(`Importing - ${filePath} [:bar] :current/:total `, {
    total: totalLineCount - 1,
  }, config);

  return new Promise((resolve, reject) => {
    const lines = [];
    let lineCount = 0;
    const maxInsertVariables = 800;
    const parser = parse({
      columns: true,
      relax: true,
      trim: true,
      skip_empty_lines: true,
    });

    parser.on('readable', async () => {
      let record;
      /* eslint-disable-next-line no-cond-assign */
      while (record = parser.read()) {
        try {
          // Auto-detect APC type from field names
          if (!config.apcType) {
            config.apcType = getAPCType(Object.keys(record));
          }

          lineCount += 1;
          lines.push({
            record,
            lineNumber: lineCount + 1,
          });

          // If we have a bunch of lines ready to insert, then do it
          if (lines.length >= maxInsertVariables / boardAlightModel.schema.length) {
            /* eslint-disable-next-line no-await-in-loop */
            await importLines(lines, bar, config);
          }
        } catch (error) {
          reject(error);
        }
      }
    });

    parser.on('end', async () => {
      // Insert all remaining lines
      try {
        await importLines(lines, bar, config);
        resolve();
      } catch (error) {
        reject(error);
      }
    });

    parser.on('error', reject);

    createReadStream(filePath)
      .pipe(stripBomStream())
      .pipe(parser);
  });
};

const createRideFeedInfo = async () => {
  const db = getDb();
  const model = rideFeedInfoModel;
  const fieldNames = model.schema.map(column => column.name);
  const firstBoardAlight = await db.get('SELECT * FROM board_alight ORDER BY service_date ASC');
  const lastBoardAlight = await db.get('SELECT * FROM board_alight ORDER BY service_date DESC');

  const record = {
    ride_files: 0,
    ride_start_date: firstBoardAlight ? firstBoardAlight.service_date : null,
    ride_end_date: lastBoardAlight ? lastBoardAlight.service_date : null,
  };

  const line = formatLine({ lineNumber: 1, record }, model);
  const placeholders = `(${fieldNames.map(() => '?').join(', ')})`;
  const values = fieldNames.map(fieldName => line.record[fieldName]);

  await db.run(`INSERT INTO ${model.filenameBase}(${fieldNames.join(', ')}) VALUES${placeholders}`, values);
};

const downloadAPC = async (filePath, config) => {
  config.log(`Downloading APC Data from ${config.apcUrl}`);

  const response = await fetch(config.apcUrl, { method: 'GET' });

  if (response.status !== 200) {
    throw new Error('Couldn’t download file');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  await writeFile(filePath, buffer);
  config.log('Download successful');
};

const downloadSwiftlyAPC = async (filePath, config) => {
  if (!config.swiftlyAPIKey) {
    throw new Error('No `swiftlyAPIKey` defined in config.');
  }

  // If no `swiftlyStartDate` defined, get last 7 days
  const startDate = config.swiftlyStartDate ?? DateTime.now().plus({ weeks: -1 }).toFormat('MM-dd-yyyy');
  const endDate = config.swiftlyEndDate ?? DateTime.now().toFormat('MM-dd-yyyy');

  config.log('Requesting APC Data from Swiftly API');

  const swiftlyAPIUrl = `https://api.goswift.ly/admin/${config.swiftlyAgencyKey}/apc-connector-csv-export?startDate=${startDate}&endDate=${endDate}`;
  const response = await fetch(swiftlyAPIUrl, {
    method: 'GET',
    headers: {
      Authorization: config.swiftlyAPIKey,
    },
  });

  if (response.status !== 200) {
    config.logError(JSON.stringify(await response.json(), null, 2));
    throw new Error('Swiftly API Request Failed');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  await writeFile(filePath, buffer);
  config.log('Request successful');
};

const importApc = async config => {
  config.log('Starting APC import');

  const { path, cleanup } = await dir({ unsafeCleanup: true });
  let filePath;

  if (config.apcUrl) {
    filePath = `${path}/apc.csv`;
    await downloadAPC(filePath, config);
  } else if (config.swiftlyAgencyKey) {
    filePath = `${path}/apc.csv`;
    await downloadSwiftlyAPC(filePath, config);
  } else {
    filePath = untildify(config.apcPath);
  }

  await importFile(filePath, config);

  cleanup();

  // Merge similar APC records for formats that require this
  if (config.mergeDuplicateBoardAlights === true) {
    await mergeAPC(config);
  }

  await createRideFeedInfo();

  config.log('Completed APC import');
};

export default importApc;
