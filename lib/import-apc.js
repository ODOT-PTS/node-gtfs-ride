import { writeFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';

import fetch from 'node-fetch';
import { getDb } from 'gtfs';
import { parse } from 'csv-parse';
import stripBomStream from 'strip-bom-stream';
import { dir } from 'tmp-promise';
import untildify from 'untildify';

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
import { formatRidecheckPlusLine } from './import-types/ridecheck.js';

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
  const ridecheckRequiredFieldNames  = [
    'SERIAL_NUMBER',
    'SCHEDULE_ID',
    'SCHEDULE_NAME',
    'SIGNUP_NAME',
    'PROTECTED',
    'ARCHIVED',
    'HANDHELD_NAME',
    'HANDHELD_NUMBER',
    'HANDHELD_TIMESTAMP',
    'APPLICATION_TIMESTAMP',
    'HANDHELD_DONE',
    'DISTINCT_TRIP',
    'SURVEY_STATUS',
    'SURVEY_TYPE',
    'SURVEY_SOURCE',
    'PATTERN_ID',
    'BRANCH',
    'ROUTE_NUMBER',
    'ROUTE_NAME',
    'DIRECTION_NAME',
    'SERVICE_CODE',
    'SERVICE_TYPE',
    'SERVICE_MODE',
    'SURVEY_DATE',
    'SURVEY_DATE_EFFECTIVE',
    'SURVEY_DATE_ATYPICAL',
    'TRIP_START_TIME',
    'TRIP_END_TIME',
    'NEXT_DAY',
    'TIME_PERIOD',
    'SERVICE_DAY',
    'SERVICE_PERIOD',
    'TRIP_NUMBER',
    'TRIP_KEY',
    'BLOCK_NUMBER',
    'BLOCK_KEY',
    'RUN_NUMBER',
    'RUN_KEY',
    'OPERATOR_ID',
    'VEHICLE_NUMBER',
    'VEHICLE_DESCRIPTION',
    'VEHICLE_SEATS',
    'GARAGE_ID',
    'GARAGE_NAME',
    'DIVISION_ID',
    'DIVISION_NAME',
    'REVENUE_START',
    'REVENUE_END',
    'REVENUE_NET',
    'ODOM_START',
    'ODOM_END',
    'ODOM_NET',
    'CONDITION_NUMBER',
    'CHECKER_ID',
    'CHECKER_NAME',
    'REVENUE_MILES',
    'REVENUE_HOURS',
    'ACTUAL_START_TIME',
    'ACTUAL_END_TIME',
    'TOTAL_PASSENGERS_ON',
    'TOTAL_PASSENGERS_OFF',
    'TOTAL_PASSENGERS_IN',
    'TOTAL_PASSENGER_MILES',
    'TOTAL_SEAT_MILES',
    'START_LOAD',
    'END_LOAD',
    'MAX_LOAD',
    'MAX_LOAD_P',
    'MIN_LOAD',
    'PASS_PER_MILE',
    'PASS_PER_HOUR',
    'TP_ONTIME',
    'TP_EARLY',
    'TP_LATE',
    'ONTIME',
    'ONTIME_DIFF_AVG',
    'DWELL_TIME_AVG',
    'SCHEDULED_SPEED',
    'ACTUAL_SPEED',
    'TOTAL_STOPS',
    'REQUIRES_UPDATE',
    'LAST_UPDATE',
    'COMMENTS',
    'TRIP_COUNT',
    'NEW_SURVEY',
    'DISTINCT_TRIP_AVL',
    'TOTAL_WHEELCHAIRS',
    'PULLIN_TIME_SCHEDULED',
    'PULLIN_TIME_ACTUAL',
    'PULLOUT_TIME_SCHEDULED',
    'PULLOUT_TIME_ACTUAL',
    'TRIP_ID',
    'TIME_PERIOD_SORT',
    'NON_STUDENT_FARE',
    'SUPERVISOR_ATTN',
    'FAREBOX',
    'MATCH_COUNT',
    'SERVICE_CLASS',
    'TOTAL_DEMOG_01',
    'TOTAL_DEMOG_02',
    'TOTAL_DEMOG_03',
    'TOTAL_DEMOG_04',
    'TOTAL_DEMOG_05',
    'TOTAL_DEMOG_06',
    'TOTAL_DEMOG_07',
    'TOTAL_DEMOG_08',
    'TOTAL_DEMOG_09',
    'TOTAL_DEMOG_10',
    'TOTAL_DEMOG_11',
    'TOTAL_DEMOG_12',
    'TOTAL_DEMOG_13',
    'TOTAL_DEMOG_14',
    'TOTAL_DEMOG_15',
    'TOTAL_DEMOG_16',
    'TOTAL_DEMOG_17',
    'TOTAL_DEMOG_18',
    'TOTAL_DEMOG_19',
    'TOTAL_DEMOG_20',
    'TOTAL_DEMOG_21',
    'TOTAL_DEMOG_22',
    'TOTAL_DEMOG_23',
    'TOTAL_DEMOG_24',
    'TOTAL_DEMOG_25',
    'TOTAL_DEMOG_26',
    'TOTAL_DEMOG_27',
    'TYPE_RIDECHECK',
    'TYPE_FARECHECK',
    'TYPE_AVLCHECK',
    'TOTAL_DEMOG_SUM',
    'PATTERN_KEY',
    'TRIP_COUNT_AVLCHECK',
    'TRIP_COUNT_FARECHECK',
    'TRIP_COUNT_RIDECHECK',
    'LAYOVER_MINUTES_SCHEDULED',
    'DEADHEAD_MINUTES_SCHEDULED',
    'STANDING_AREA',
    'TRANSACTION_ROLLUP_ID',
    'TOTAL_FON',
    'TOTAL_FOFF',
    'TOTAL_RON',
    'TOTAL_ROFF',
    'TEMPERATURE',
    'CHECKER_AFTER_MINUTES',
    'CHECKER_BEFORE_MINUTES',
    'BLOCK_ID',
    'TYPE_ODCHECK',
    'ASSIGNMENT',
    'TOTAL_KNEELS',
    'TOTAL_BICYCLES',
    'TOTAL_TRAFFIC_PRIORITY',
    'ACTUAL_START_TIME_BEFORE',
    'ACTUAL_END_TIME_AFTER',
    'START_TIMEPOINT',
    'END_TIMEPOINT',
    'ONBOARD_SOFTWARE_VERSION',
    'SCHEDULE_SOFTWARE_VERSION',
    'LOAD_DURATION',
    'LOAD_DURATION_ALT',
    'LAYOVER_MINUTES_ACTUAL',
    'DEADHEAD_MINUTES_ACTUAL',
    'ROUTE_NAME_ALT',
    'TYPE_LOADCHECK',
    'TRIP_COUNT_LOADCHECK',
    'DIRECTION_NAME_ALT',
    'TOTAL_DWELL_TIME',
    'PATTERN_CODE',
    'MOVING_SPEED',
    'SERVICED_P',
    'SCHEDULED_RUNNING_TIME',
    'ACTUAL_RUNNING_TIME',
    'BLOCK_NAME',
    'VEHICLE_COUNT',
    'RUN_NAME',
    'VEHICLE_CODE',
    'DAY_MAP',
    'ACTUAL_RUNNING_TIME_SD',
    'PATTERN_ALT_ACTIVATE',
    'PATTERN_ALT_TIME',
    'PATTERN_ID_ORIG',
    'TYPE_MRIDECHECK',
    'GARAGE_CODE',
    'LUX_A',
    'LUX_B',
    'LUX_CLASS',
    'NEEDS_UPDATE',
    'TRIP_CODE',
    'VEHICLE_DISPLAY_NAME',
    'VEHICLE_MODE',
    'DM_ACTION_TYPE',
    'IS_DM_TRIP',
    'ID',
    'SERIAL_NUMBER',
    'SORT_ORDER',
    'STOP_ID',
    'NEXT_TIMEPOINT_ID',
    'MAIN_CROSS_STREET',
    'TRAVEL_DIRECTION',
    'TIMEPOINT',
    'SEGMENT_MILES',
    'TIMEPOINT_MILES',
    'CITY',
    'COUNTY',
    'TAZ',
    'CENSUS_TRACT',
    'PASSENGER_MILES',
    'NEXT_DAY',
    'TIME_SCHEDULED',
    'TIME_ACTUAL_ARRIVE',
    'TIME_ACTUAL_DEPART',
    'DWELL_TIME',
    'RUNNING_TIME_SCHEDULED',
    'RUNNING_TIME_ACTUAL',
    'PASSENGERS_ON',
    'PASSENGERS_OFF',
    'PASSENGERS_IN',
    'PASSENGERS_SPOT',
    'PASSENGERS_ERROR',
    'TRIP_EARLY',
    'TRIP_ONTIME',
    'TRIP_LATE',
    'TRIP_DIFF_MINUTES',
    'WHEELCHAIRS',
    'BICYCLES',
    'PASSENGER_TRANSACTIONS',
    'SERVICED_STOP',
    'FIRST_LAST_STOP',
    'COMMENT_NUMBER',
    'NON_STUDENT_FARE',
    'MATCH_DISTANCE',
    'FREE_RUNNING',
    'CONTROL_POINT',
    'DEMOG_01',
    'DEMOG_02',
    'DEMOG_03',
    'DEMOG_04',
    'DEMOG_05',
    'DEMOG_06',
    'DEMOG_07',
    'DEMOG_08',
    'DEMOG_09',
    'DEMOG_10',
    'DEMOG_11',
    'DEMOG_12',
    'DEMOG_13',
    'DEMOG_14',
    'DEMOG_15',
    'DEMOG_16',
    'DEMOG_17',
    'DEMOG_18',
    'DEMOG_19',
    'DEMOG_20',
    'DEMOG_21',
    'DEMOG_22',
    'DEMOG_23',
    'DEMOG_24',
    'DEMOG_25',
    'DEMOG_26',
    'DEMOG_27',
    'SIGNUP_NAME',
    'FON',
    'FOFF',
    'RON',
    'ROFF',
    'CHECKER_TIME',
    'LATITUDE',
    'LONGITUDE',
    'SEGMENT_ON',
    'SEGMENT_OFF',
    'CHILD',
    'NR_BOARD',
    'NR_ALIGHT',
    'KNEELS',
    'TRAFFIC_PRIORITY',
    'SEGMENT_MAX_LOAD',
    'LATITUDE_ACTUAL',
    'LONGITUDE_ACTUAL',
    'SEGMENT_DWELL_TIME',
    'SEGMENT_MOVING_SPEED',
    'SEGMENT_ACTUAL_SPEED',
    'SEGMENT_SCHEDULED_SPEED',
    'MATCH_DISTANCE_RSM',
    'STOP_ID_NEAR',
    'STOP_KEY',
    'ACTUAL_ARRIVE',
    'ACTUAL_DEPART',
    'EVENT_TIME_UTC'
  ]

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
  
  if (ridecheckRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'ridecheck';
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
      case 'ridecheck': {
        boardAlightLines.push(await formatRidecheckPlusLine(line));

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
    throw new Error('Couldn’t download files');
  }

  const buffer = await response.buffer();

  await writeFile(filePath, buffer);
  config.log('Download successful');
};

const importApc = async config => {
  config.log('Starting APC import');

  if (!config.apcUrl && !config.apcPath) {
    throw new Error('No APC file provided.');
  }

  const { path, cleanup } = await dir({ unsafeCleanup: true });
  let filePath;

  if (config.apcUrl) {
    filePath = `${path}/apc.csv`;
    await downloadAPC(filePath, config);
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
