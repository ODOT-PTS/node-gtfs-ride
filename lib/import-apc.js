const fetch = require('node-fetch');
const fs = require('fs-extra');
const gtfs = require('gtfs');
const parse = require('csv-parse');
const { DateTime } = require('luxon');
const stripBomStream = require('strip-bom-stream');
const tmp = require('tmp-promise');
const untildify = require('untildify');
const Promise = require('bluebird');

const {
  calculateHourTimestamp,
  convertIOtoDirection,
  getServiceIdsByDate,
  findClosestTripByTime
} = require('./utils');
const { countFileLines } = require('./file-utils.js');
const { progressBar } = require('./log-utils.js');
const { cleanLine } = require('./formatters');
const mergeAPC = require('./merge-apc');
const boardAlightModel = require('gtfs/models/gtfs-ride/board-alight');
const rideFeedInfoModel = require('gtfs/models/gtfs-ride/ride-feed-info');

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
    'route',
    'calendar_date',
    'msg_time',
    'dir',
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

  if (cetRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'cet';
  } else if (ltdRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'ltd';
  } else if (rvtdRequiredFieldNames.every(fieldName => recordFieldNames.includes(fieldName))) {
    return 'rvtd';
  }

  throw new Error(`Unable to detect APC type from field names: ${recordFieldNames.join(', ')}`);
};

const formatCETLine = async ({ record, lineNumber }) => {
  const stops = await gtfs.getStops({ stop_name: record.RouteStop }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid RouteStop \`${record.RouteStop}\` found`);
  }

  const routes = await gtfs.getRoutes({ route_short_name: record.Route_ID }, ['route_id']);

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
  const stops = await gtfs.getStops({ stop_id: record.stop }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid stop \`${record.stop}\` found`);
  }

  const routes = await gtfs.getRoutes({ route_id: record.route }, ['route_id']);

  if (routes.length === 0) {
    throw new Error(`Invalid route \`${record.route}\` found`);
  }

  const serviceDate = DateTime.fromISO(record.calendar_date).toFormat('yyyyMMdd');
  const serviceIds = await getServiceIdsByDate(serviceDate);

  if (serviceIds.length === 0) {
    throw new Error(`No service_ids found for calendar_date \`${record.calendar_date}\``);
  }

  const gtfsTime = `${record.msg_time}:00`;

  const tripStopTime = await findClosestTripByTime({
    stopIds: [record.stop],
    routeId: record.route,
    serviceIds,
    directionId: convertIOtoDirection(record.dir)
  }, gtfsTime);

  return {
    lineNumber,
    record: {
      trip_id: tripStopTime.trip_id,
      stop_id: tripStopTime.stop_id,
      stop_sequence: tripStopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: record.board,
      alightings: record.alight,
      current_load: record.departure_load,
      load_type: 1,
      service_date: serviceDate,
      service_departure_time: gtfsTime,
      source: 1
    }
  };
};

const formatRVTDLine = async ({ record, lineNumber }) => {
  const stops = await gtfs.getStops({ stop_code: record.stop_code }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid stop_code \`${record.stop_code}\` found`);
  }

  return {
    lineNumber,
    record: {
      trip_id: record.trip_id,
      stop_id: stops[0].stop_id,
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

const convertToBoardAlight = async (line, config) => {
  let boardAlight;

  try {
    if (config.apcType === 'cet') {
      boardAlight = await formatCETLine(line);
    } else if (config.apcType === 'ltd') {
      boardAlight = await formatLTDLine(line);
    } else if (config.apcType === 'rvtd') {
      boardAlight = await formatRVTDLine(line);
    } else {
      throw new Error(`Unknown APC type \`${config.apcType}\``);
    }
  } catch (error) {
    config.recordIssue(`${error.message} on line ${line.lineNumber}`);
    return;
  }

  return cleanLine(boardAlight, boardAlightModel, config);
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
  const db = gtfs.getDb();
  const model = boardAlightModel;
  const formattedLines = [];

  while (lines.length > 0) {
    const line = lines.shift();
    bar.tick();

    /* eslint-disable-next-line no-await-in-loop */
    const boardAlightLine = await convertToBoardAlight(line, config);

    if (!boardAlightLine) {
      continue;
    }

    formattedLines.push(formatLine(boardAlightLine, model));
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
  if (!fs.existsSync(filePath)) {
    config.recordIssue(`${config.agencyKey}: Importing - ${filePath} - No file found\r`);

    throw new Error(`${config.agencyKey}: Importing - ${filePath} - No file found\r`);
  }

  const totalLineCount = await countFileLines(filePath);
  const bar = progressBar(`${config.agencyKey}: Importing - ${filePath} [:bar] :current/:total `, {
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
      await importLines(lines, bar, config).catch(reject);
      resolve();
    });

    parser.on('error', reject);

    fs.createReadStream(filePath)
      .pipe(stripBomStream())
      .pipe(parser);
  })
    .catch(error => {
      throw error;
    });
};

const createRideFeedInfo = async () => {
  const db = gtfs.getDb();
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
  config.log(`${config.agencyKey}: Downloading APC Data from ${config.apcUrl}`);

  const response = await fetch(config.apcUrl, { method: 'GET' });

  if (response.status !== 200) {
    throw new Error('Couldn’t download files');
  }

  const buffer = await response.buffer();

  await fs.writeFile(filePath, buffer);
  config.log(`${config.agencyKey}: Download successful`);
};

module.exports = async config => {
  config.log('Starting APC import');

  if (!config.apcUrl && !config.apcPath) {
    throw new Error('No APC file provided.');
  }

  const { path, cleanup } = await tmp.dir({ unsafeCleanup: true });
  let filePath;

  if (config.apcUrl) {
    filePath = `${path}/${config.agencyKey}-apc.csv`;
    await downloadAPC(filePath, config);
  } else {
    filePath = untildify(config.apcPath);
  }

  await importFile(filePath, config);

  cleanup();

  // Merge similar APC records for formats that require this
  if (config.apcType === 'cet') {
    await mergeAPC(config);
  }

  await createRideFeedInfo();

  config.log('Completed APC import');
};
