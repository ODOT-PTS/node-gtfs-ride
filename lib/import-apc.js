import { writeFile } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';

import fetch from 'node-fetch';
import { getStops, getRoutes, getTrips, getDb } from 'gtfs';
import parse from 'csv-parse';
import { DateTime } from 'luxon';
import stripBomStream from 'strip-bom-stream';
import { dir } from 'tmp-promise';
import untildify from 'untildify';

import boardAlightModel from 'gtfs/models/gtfs-ride/board-alight.js';
import rideFeedInfoModel from 'gtfs/models/gtfs-ride/ride-feed-info.js';
import { calculateHourTimestamp, calculateSecondsFromMidnight, getAllStationStopIds, getServiceIdsByDate, findClosestTripByTime, findClosestStoptimeByTime, findTripByFirstStoptime } from './utils.js';
import { countFileLines } from './file-utils.js';
import { progressBar } from './log-utils.js';
import { cleanLine } from './formatters.js';
import mergeAPC from './merge-apc.js';

const getAPCType = recordFieldNames => {
  const cetRequiredFieldNames = [
    'RouteStop',
    'Route_ID',
    'ClientTime',
    'Entrys',
    'Exits'
  ];

  const ltdRequiredFieldNames = [
    'stop',
    'trip_sn',
    'route',
    'calendar_date',
    'msg_time',
    'board',
    'alight',
    'departure_load'
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
    'source'
  ];

  const wetaRequiredFieldNames = [
    'Date',
    'Crew',
    'Vessel',
    'Sched_Depart',
    'Depart',
    'Arrival',
    'Account',
    'RunSegment',
    'PassengersOn',
    'PassengersOff',
    'BikesOn',
    'BikesOff'
  ];

  if (cetRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'cet';
  }

  if (ltdRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'ltd';
  }

  if (rvtdRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'rvtd';
  }

  if (wetaRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'weta';
  }

  throw new Error(`Unable to detect APC type from field names: ${recordFieldNames.join(', ')}`);
};

const formatCETLine = async ({ record, lineNumber }) => {
  const stops = await getStops({ stop_name: record.RouteStop }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid RouteStop \`${record.RouteStop}\` found`);
  }

  const routes = await getRoutes({ route_short_name: record.Route_ID }, ['route_id']);

  if (routes.length === 0) {
    throw new Error(`Invalid Route_ID \`${record.Route_ID}\` found`);
  }

  const serviceDate = DateTime.fromFormat(record.ClientTime, 'M/d/yyyy h:mm:ss a').toFormat('yyyyMMdd');
  const serviceIds = await getServiceIdsByDate(serviceDate);

  if (serviceIds.length === 0) {
    throw new Error(`No service_ids found for ClientTime \`${record.ClientTime}\``);
  }

  const tripStopTime = await findClosestTripByTime({
    stopIds: stops.map(stop => stop.stop_id),
    routeId: routes[0].route_id,
    serviceIds
  }, DateTime.fromFormat(record.ClientTime, 'M/d/yyyy h:mm:ss a').toFormat('HH:mm:ss'));

  return {
    lineNumber,
    record: {
      trip_id: tripStopTime.trip_id,
      stop_id: tripStopTime.stop_id,
      stop_sequence: tripStopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: record.Entrys,
      alightings: record.Exits,
      service_date: serviceDate,
      source: 1
    }
  };
};

const formatLTDLine = async ({ record, lineNumber }) => {
  const stops = await getStops({ stop_id: record.stop }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid stop \`${record.stop}\` found`);
  }

  const routes = await getRoutes({ route_id: record.route }, ['route_id']);

  if (routes.length === 0) {
    throw new Error(`Invalid route \`${record.route}\` found`);
  }

  const serviceDate = DateTime.fromISO(record.calendar_date).toFormat('yyyyMMdd');
  const serviceIds = await getServiceIdsByDate(serviceDate);

  if (serviceIds.length === 0) {
    throw new Error(`No service_ids found for calendar_date \`${record.calendar_date}\``);
  }

  const gtfsTime = `${record.msg_time}:00`;

  const trips = await getTrips({ trip_id: record.trip_sn }, ['trip_id', 'direction_id']);

  if (trips.length === 0) {
    throw new Error(`No trip_id found for \`${record.trip_sn}\``);
  }

  const stopTime = await findClosestStoptimeByTime({ tripId: record.trip_sn, stopId: record.stop }, gtfsTime);

  return {
    lineNumber,
    record: {
      trip_id: trips[0].trip_id,
      stop_id: stops[0].stop_id,
      stop_sequence: stopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: record.board,
      alightings: record.alight,
      load_count: record.departure_load,
      load_type: 1,
      service_date: serviceDate,
      service_departure_time: gtfsTime,
      source: 1
    }
  };
};

const formatRVTDLine = async ({ record, lineNumber }) => {
  const paddedStopCode = record.stop_code.padStart(6, '0');
  const stops = await getStops({ stop_code: paddedStopCode }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid stop_code \`${paddedStopCode}\` found`);
  }

  const matchedStop = stops[0];
  const tripNameParts = record.trip_name.split(' - ');
  const routeShortName = tripNameParts[0];
  const tripLastStopTime = tripNameParts[2];
  const gtfsTime = DateTime.fromISO(tripLastStopTime).toFormat('H:mm:ss');

  const routes = await getRoutes({ route_short_name: routeShortName }, ['route_id']);

  if (routes.length === 0) {
    throw new Error(`Invalid route_short_name \`${routeShortName}\` found`);
  }

  // Find trip with last stoptime that matches last part of trip_name
  const matchedTrip = await findTripByFirstStoptime({ routeId: routes[0].route_id, stopId: matchedStop.stop_id, stopSequence: record.stope_sequence }, record.service_arrival_date, gtfsTime);

  return {
    lineNumber,
    record: {
      trip_id: matchedTrip.trip_id,
      stop_id: matchedStop.stop_id,
      stop_sequence: record.stope_sequence,
      record_use: record.record_use,
      schedule_relationship: record.schedule_relationship,
      boardings: record.boardings,
      alightings: record.alightings,
      current_load: record.current_load,
      load_type: record.load_type,
      rack_down: record.rack_down,
      bike_boardings: record.bike_boardings,
      bike_alightings: record.bike_alightings,
      ramp_used: record.ramp_used,
      ramp_boardings: record.ramp_boardings,
      ramp_alightings: record.ramp_alightings,
      service_date: record.service_arrival_date,
      service_arrival_time: record.service_arrival_time,
      source: record.source
    }
  };
};

const formatWETALine = async ({ record, lineNumber }) => {
  const db = getDb();

  // Detect route from `RunSegment` field
  const runSegmentCodes = {
    FBVJO: {
      origin_stop_id: '2455444',
      destination_stop_id: '12149044'
    },
    VJOFB: {
      origin_stop_id: '12149044',
      destination_stop_id: '2455444'
    },
    FBRICH: {
      origin_stop_id: '2455444',
      destination_stop_id: '890004'
    },
    RICHFB: {
      origin_stop_id: '890004',
      destination_stop_id: '2455444'
    },
    JLSALA: {
      origin_stop_id: '12030043',
      destination_stop_id: '12030042'
    },
    ALAJLS: {
      origin_stop_id: '12030042',
      destination_stop_id: '12030043'
    },
    FBALA: {
      origin_stop_id: '2455444',
      destination_stop_id: '12030042'
    },
    ALAFB: {
      origin_stop_id: '12030042',
      destination_stop_id: '2455444'
    },
    FBJLS: {
      origin_stop_id: '2455444',
      destination_stop_id: '12030043'
    },
    JLSFB: {
      origin_stop_id: '12030043',
      destination_stop_id: '2455444'
    }
  };

  const routeInfo = runSegmentCodes[record.RunSegment];

  if (!routeInfo) {
    throw new Error(`Invalid RunSegment \`${record.RunSegment}\` found`);
  }

  const serviceDate = DateTime.fromFormat(record.Date, 'M/d/yyyy').toFormat('yyyyMMdd');
  const serviceIds = await getServiceIdsByDate(serviceDate);
  const originStopIds = await getAllStationStopIds(routeInfo.origin_stop_id);
  const destinationStopIds = await getAllStationStopIds(routeInfo.destination_stop_id);

  const originStoptimes = await db.all(
    `SELECT * FROM stop_times INNER JOIN trips ON trips.trip_id = stop_times.trip_id WHERE stop_id IN (${originStopIds.map(() => '?').join(',')}) AND service_id IN (${serviceIds.map(() => '?').join(',')}) AND departure_timestamp = ?`,
    [
      ...originStopIds,
      ...serviceIds,
      calculateSecondsFromMidnight(DateTime.fromFormat(record.Sched_Depart, 'H:mm').toFormat('HH:mm:ss'))
    ]
  );

  let destinationStopTimes;

  // Check if there is a stoptime for the destination after the origin of each trip
  for (const stoptime of originStoptimes) {
    /* eslint-disable-next-line no-await-in-loop */
    destinationStopTimes = await db.all(
      `SELECT * FROM stop_times WHERE stop_id IN (${destinationStopIds.map(() => '?').join(',')}) AND trip_id = ? AND stop_sequence > ?`,
      [
        ...destinationStopIds,
        stoptime.trip_id,
        stoptime.stop_sequence
      ]
    );

    if (destinationStopTimes.length > 0) {
      break;
    }
  }

  if (!destinationStopTimes || destinationStopTimes.length === 0) {
    throw new Error(`Unable to find trip for stop_id \`${routeInfo.origin_stop_id}\` departure time \`${record.Sched_Depart}\``);
  }

  const originStoptime = originStoptimes[0];

  const originBoardAlight = {
    lineNumber,
    record: {
      trip_id: originStoptime.trip_id,
      stop_id: originStoptime.stop_id,
      stop_sequence: originStoptime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: record.PassengersOn,
      load_type: 1,
      bike_boardings: record.BikesOn,
      service_date: serviceDate,
      service_departure_time: record.Depart,
      source: 0
    }
  };

  const destinationStopTime = destinationStopTimes[0];

  const destinationBoardAlight = {
    lineNumber,
    record: {
      trip_id: destinationStopTime.trip_id,
      stop_id: destinationStopTime.stop_id,
      stop_sequence: destinationStopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      alightings: record.PassengersOff,
      load_type: 0,
      bike_alightings: record.BikesOff,
      service_date: serviceDate,
      service_arrival_time: record.Arrival,
      source: 0
    }
  };

  return [
    originBoardAlight,
    destinationBoardAlight
  ];
};

const convertToBoardAlights = async (line, config) => {
  try {
    const boardAlightLines = [];
    switch (config.apcType) {
      case 'cet': {
        boardAlightLines.push(await formatCETLine(line));

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
    'departure_time'
  ];

  for (const fieldName of timestampFormat) {
    if (record[fieldName]) {
      record[`${fieldName}stamp`] = calculateHourTimestamp(record[fieldName]);
    }
  }

  return {
    record,
    lineNumber
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
    total: totalLineCount - 1
  }, config);

  return new Promise((resolve, reject) => {
    const lines = [];
    let lineCount = 0;
    const maxInsertVariables = 800;
    const parser = parse({
      columns: true,
      relax: true,
      trim: true,
      skip_empty_lines: true
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
            lineNumber: lineCount + 1
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
    ride_end_date: lastBoardAlight ? lastBoardAlight.service_date : null
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
