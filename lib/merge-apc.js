const { groupBy, pick, pickBy } = require('lodash');
const gtfs = require('gtfs');

const { sumBoardAlightGroup } = require('./utils.js');

async function deleteMatchingBoardAlights(mergedBoardAlight) {
  const db = gtfs.getDb();
  const queryParameters = [];
  const whereClauses = [
    'service_date',
    'trip_id',
    'stop_id',
    'stop_sequence',
    'record_use',
    'schedule_relationship',
    'load_type',
    'source'
  ].map(fieldName => {
    if (mergedBoardAlight[fieldName] === null) {
      return `${fieldName} IS NULL`;
    }

    queryParameters.push(mergedBoardAlight[fieldName]);
    return `${fieldName} = ?`;
  });

  await db.run(`DELETE FROM board_alight WHERE ${whereClauses.join(' AND ')}`, queryParameters);
}

module.exports = async config => {
  const db = gtfs.getDb();
  config.log('Merging APC Data');

  const boardAlights = await gtfs.getBoardAlight({}, [], [
    ['service_date', 'ASC'],
    ['trip_id', 'ASC'],
    ['stop_id', 'ASC'],
    ['stop_sequence', 'ASC'],
    ['record_use', 'ASC'],
    ['schedule_relationship', 'ASC'],
    ['load_type', 'ASC'],
    ['source', 'ASC']
  ]);

  const groups = groupBy(boardAlights, boardAlight => {
    return [
      boardAlight.service_date,
      boardAlight.trip_id,
      boardAlight.stop_id,
      boardAlight.stop_sequence,
      boardAlight.record_use,
      boardAlight.schedule_relationship,
      boardAlight.load_type,
      boardAlight.source
    ].join('|');
  });

  for (const group of Object.values(groups)) {
    const mergedBoardAlight = pick(group[0], [
      'service_date',
      'trip_id',
      'stop_id',
      'stop_sequence',
      'record_use',
      'schedule_relationship',
      'current_load',
      'load_count',
      'load_type',
      'rack_down',
      'ramp_used',
      'service_arrival_time',
      'service_arrival_timestamp',
      'service_departure_time',
      'service_departure_timestamp',
      'source'
    ]);

    /* eslint-disable-next-line no-await-in-loop */
    await deleteMatchingBoardAlights(mergedBoardAlight);

    mergedBoardAlight.boardings = sumBoardAlightGroup(group, 'boardings');
    mergedBoardAlight.alightings = sumBoardAlightGroup(group, 'alightings');
    mergedBoardAlight.bike_boardings = sumBoardAlightGroup(group, 'bike_boardings');
    mergedBoardAlight.bike_alightings = sumBoardAlightGroup(group, 'bike_alightings');
    mergedBoardAlight.ramp_boardings = sumBoardAlightGroup(group, 'ramp_boardings');
    mergedBoardAlight.ramp_alightings = sumBoardAlightGroup(group, 'ramp_alightings');

    // Filter out null values
    const filteredBoardAlight = pickBy(mergedBoardAlight, value => value !== null);

    /* eslint-disable-next-line no-await-in-loop */
    await db.run(
      `INSERT INTO board_alight (${Object.keys(filteredBoardAlight).join(', ')}) VALUES (${Object.keys(filteredBoardAlight).map(() => '?').join(', ')})`,
      [...Object.values(filteredBoardAlight)]
    );
  }
};
