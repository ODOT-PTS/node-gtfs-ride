const fs = require('fs-extra');
const gtfs = require('gtfs');
const parse = require('csv-parse');
const stripBomStream = require('strip-bom-stream');
const untildify = require('untildify');
const Promise = require('bluebird');

const utils = require('./utils');
const { cleanLine } = require('./formatters');
const boardAlightModel = require('gtfs/models/gtfs-ride/board-alight');

const convertToBoardAlight = async (line, lineCount, config) => {
  const lineNumber = lineCount + 1;
  const stops = await gtfs.getStops({ stop_code: line.stop_code }, ['stop_id']);

  if (stops.length === 0) {
    config.recordIssue(`Invalid \`stop_code\` ${line.stop_code} found on line ${lineNumber}.`);
    return null;
  }

  const boardAlight = {
    trip_id: line.trip_id,
    stop_id: stops[0].stop_id,
    stop_sequence: line.stope_sequence,
    record_use: line.record_use,
    schedule_relationship: line.schedule_relationship,
    boardings: line.boardings,
    alightings: line.alightings,
    current_load: line.current_load,
    load_type: line.load_type,
    rack_down: line.rack_down,
    bike_boardings: line.bike_boardings,
    bike_alightings: line.bike_alightings,
    ramp_used: line.ramp_used,
    ramp_boardings: line.ramp_boardings,
    ramp_alightings: line.ramp_alightings,
    service_date: line.service_arrival_date,
    service_arrival_time: line.service_arrival_time,
    source: line.source
  };

  return cleanLine(boardAlight, boardAlightModel, lineCount, config);
};

const formatLine = (line, model, lineCount) => {
  const lineNumber = lineCount + 1;
  for (const fieldName of Object.keys(line)) {
    const columnSchema = model.schema.find(schema => schema.name === fieldName);

    // Remove columns not part of model
    if (!columnSchema) {
      delete line[fieldName];
      continue;
    }

    // Remove null values
    if (line[fieldName] === null || line[fieldName] === '') {
      delete line[fieldName];
    }

    // Convert fields that should be integer
    if (columnSchema.type === 'integer') {
      const value = Number.parseInt(line[fieldName], 10);

      if (Number.isNaN(value)) {
        delete line[fieldName];
      } else {
        line[fieldName] = value;
      }
    }

    // Convert fields that should be float
    if (columnSchema.type === 'real') {
      const value = Number.parseFloat(line[fieldName]);

      if (Number.isNaN(value)) {
        delete line[fieldName];
      } else {
        line[fieldName] = value;
      }
    }

    // Validate required
    if (columnSchema.required === true) {
      if (line[fieldName] === undefined || line[fieldName] === '') {
        throw new Error(`Missing required value in ${model.filenameBase}.txt for ${fieldName} on line ${lineNumber}.`);
      }
    }

    // Validate minimum
    if (columnSchema.min !== undefined) {
      if (line[fieldName] < columnSchema.min) {
        throw new Error(`Invalid value in ${model.filenameBase}.txt for ${fieldName} on line ${lineNumber}: below minimum value of ${columnSchema.min}.`);
      }
    }

    // Validate maximum
    if (columnSchema.max !== undefined) {
      if (line[fieldName] > columnSchema.max) {
        throw new Error(`Invalid value in ${model.filenameBase}.txt for ${fieldName} on line ${lineNumber}: above maximum value of ${columnSchema.max}.`);
      }
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
    if (line[fieldName]) {
      line[`${fieldName}stamp`] = utils.calculateHourTimestamp(line[fieldName]);
    }
  }

  return line;
};

const importLines = async (lines, model, lineCount, config) => {
  const lineNumber = lineCount + 1;
  const db = gtfs.getDb();

  if (lines.length === 0) {
    return;
  }

  const linesToImportCount = lines.length;
  const fieldNames = model.schema.map(column => column.name);
  const placeholders = [];
  const values = [];

  while (lines.length) {
    const line = lines.pop();
    placeholders.push(`(${fieldNames.map(() => '?').join(', ')})`);
    for (const fieldName of fieldNames) {
      values.push(line[fieldName]);
    }
  }

  try {
    await db.run(`INSERT INTO ${model.filenameBase}(${fieldNames.join(', ')}) VALUES${placeholders.join(',')}`, values);
  } catch (error) {
    config.logWarning(`Check ${model.filenameBase}.txt for invalid data between lines ${lineNumber - linesToImportCount} and ${lineNumber}.`);
    throw error;
  }

  config.log(`Importing - ${model.filenameBase}.txt - ${lineCount} lines imported\r`, true);
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
          /* eslint-disable-next-line no-await-in-loop */
          const boardAlightLine = await convertToBoardAlight(record, lineCount, config);

          if (!boardAlightLine) {
            continue;
          }

          lines.push(formatLine(boardAlightLine, boardAlightModel, lineCount));

          // If we have a bunch of lines ready to insert, then do it
          if (lines.length >= maxInsertVariables / boardAlightModel.schema.length) {
            /* eslint-disable-next-line no-await-in-loop */
            await importLines(lines, boardAlightModel, lineCount, config);
          }
        } catch (error) {
          reject(error);
        }
      }
    });

    parser.on('end', async () => {
      // Insert all remaining lines
      await importLines(lines, boardAlightModel, lineCount, config).catch(reject);
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

  config.log('Completed APC import');
};
