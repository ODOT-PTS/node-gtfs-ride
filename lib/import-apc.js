const fs = require('fs-extra');
const gtfs = require('gtfs');
const parse = require('csv-parse');
const { DateTime } = require('luxon');
const stripBomStream = require('strip-bom-stream');
const untildify = require('untildify');
const Promise = require('bluebird');

const {
  calculateHourTimestamp,
  getServiceIdsByDate,
  findClosestTripByTime
} = require('./utils');
const { cleanLine } = require('./formatters');
const mergeAPC = require('./merge-apc');
const boardAlightModel = require('gtfs/models/gtfs-ride/board-alight');

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

const formatCETLine = async ({ record, lineNumber }) => {
  const db = gtfs.getDb();
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

  // Support multiple stops with the same stop_name
  const stopIds = stops.map(stop => stop.stop_id);
  const routeId = routes[0].route_id;
  const tripStoptimes = await db.all(
    `SELECT * FROM trips INNER JOIN stop_times ON trips.trip_id = stop_times.trip_id WHERE route_id = ? AND stop_id IN (${stopIds.map(() => '?').join(',')}) AND service_id IN (${serviceIds.map(() => '?').join(',')}) ORDER BY arrival_timestamp ASC`,
    [routeId, ...stopIds, ...serviceIds]
  );

  if (tripStoptimes.length === 0) {
    throw new Error(`No trips found for route_id \`${routeId}\` and stop_id \`${stopIds.join(', ')}\` and service_id \`${serviceIds.join(', ')}\``);
  }

  const tripStopTime = findClosestTripByTime(tripStoptimes, DateTime.fromFormat(record.ClientTime, 'M/d/yyyy h:mm:ss a').toFormat('HH:mm:ss'));

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
      service_date: serviceDate
    }
  };
};

const convertToBoardAlight = async (line, config) => {
  let boardAlight;

  try {
    if (config.apc.type === 'rvtd') {
      boardAlight = await formatRVTDLine(line);
    } else if (config.apc.type === 'cet') {
      boardAlight = await formatCETLine(line);
    } else {
      throw new Error(`Unknown APC type \`${config.apc.type}\``);
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

const importLines = async (lines, model, config) => {
  const db = gtfs.getDb();

  if (lines.length === 0) {
    return;
  }

  const fieldNames = model.schema.map(column => column.name);
  const placeholders = [];
  const values = [];
  let lineNumberStart;

  for (const line of lines) {
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
    config.logWarning(`Check ${model.filenameBase}.txt for invalid data between lines ${lineNumberStart} and ${lineNumberStart + lines.length}.`);
    throw error;
  }

  config.log(`Importing - ${model.filenameBase}.txt - ${lineNumberStart + lines.length - 1} lines imported\r`, true);
};

const processLines = async (lines, config) => {
  const formattedLines = [];

  while (lines.length > 0) {
    const line = lines.shift();

    /* eslint-disable-next-line no-await-in-loop */
    const boardAlightLine = await convertToBoardAlight(line, config);

    if (!boardAlightLine) {
      continue;
    }

    formattedLines.push(formatLine(boardAlightLine, boardAlightModel));
  }

  await importLines(formattedLines, boardAlightModel, config);
};

const importFile = (filePath, config) => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      config.recordIssue(`Importing - ${filePath} - No file found\r`);

      return reject(new Error(`Importing - ${filePath} - No file found\r`));
    }

    config.log(`Importing - ${filePath}\r`);

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
          lineCount += 1;
          lines.push({
            record,
            lineNumber: lineCount + 1
          });

          // If we have a bunch of lines ready to insert, then do it
          if (lines.length >= maxInsertVariables / boardAlightModel.schema.length) {
            /* eslint-disable-next-line no-await-in-loop */
            await processLines(lines, config);
          }
        } catch (error) {
          reject(error);
        }
      }
    });

    parser.on('end', async () => {
      // Insert all remaining lines
      await processLines(lines, config).catch(reject);
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

module.exports = async config => {
  config.log('Starting APC import');

  if (!config.apc && !config.apc.path) {
    throw new Error('No APC file provided.');
  }

  const filePath = untildify(config.apc.path);

  await importFile(filePath, config);

  if (config.apc.type === 'cet') {
    // Merge similar APC records
    await mergeAPC(config);
  }

  config.log('Completed APC import');
};
