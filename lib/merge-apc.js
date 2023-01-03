import { groupBy, pick, pickBy } from 'lodash-es';
import { openDb, getBoardAlights } from 'gtfs';

import { sumBoardAlightGroup } from './utils.js';
import { progressBar } from './log-utils.js';

function deleteMatchingBoardAlights(mergedBoardAlight) {
  const db = openDb();
  const queryParameters = [];
  const whereClauses = [
    'service_date',
    'trip_id',
    'stop_id',
    'stop_sequence',
    'record_use',
    'schedule_relationship',
    'load_type',
    'source',
  ].map((fieldName) => {
    if (mergedBoardAlight[fieldName] === null) {
      return `${fieldName} IS NULL`;
    }

    queryParameters.push(mergedBoardAlight[fieldName]);
    return `${fieldName} = ?`;
  });

  db.prepare(
    `DELETE FROM board_alight WHERE ${whereClauses.join(' AND ')}`
  ).run(...queryParameters);
}

const mergeApc = (config) => {
  const db = openDb();
  const boardAlights = getBoardAlights(
    {},
    [],
    [
      ['service_date', 'ASC'],
      ['trip_id', 'ASC'],
      ['stop_id', 'ASC'],
      ['stop_sequence', 'ASC'],
      ['record_use', 'ASC'],
      ['schedule_relationship', 'ASC'],
      ['load_type', 'ASC'],
      ['source', 'ASC'],
    ]
  );

  const groups = groupBy(boardAlights, (boardAlight) =>
    [
      boardAlight.service_date,
      boardAlight.trip_id,
      boardAlight.stop_id,
      boardAlight.stop_sequence,
      boardAlight.record_use,
      boardAlight.schedule_relationship,
      boardAlight.load_type,
      boardAlight.source,
    ].join('|')
  );

  const bar = progressBar(
    'Merging APC Data [:bar] :current/:total ',
    {
      total: Object.keys(groups).length,
    },
    config
  );

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
      'source',
    ]);

    deleteMatchingBoardAlights(mergedBoardAlight);

    mergedBoardAlight.boardings = sumBoardAlightGroup(group, 'boardings');
    mergedBoardAlight.alightings = sumBoardAlightGroup(group, 'alightings');
    mergedBoardAlight.bike_boardings = sumBoardAlightGroup(
      group,
      'bike_boardings'
    );
    mergedBoardAlight.bike_alightings = sumBoardAlightGroup(
      group,
      'bike_alightings'
    );
    mergedBoardAlight.ramp_boardings = sumBoardAlightGroup(
      group,
      'ramp_boardings'
    );
    mergedBoardAlight.ramp_alightings = sumBoardAlightGroup(
      group,
      'ramp_alightings'
    );

    // Filter out null values
    const filteredBoardAlight = pickBy(
      mergedBoardAlight,
      (value) => value !== null
    );

    db.prepare(
      `INSERT INTO board_alight (${Object.keys(filteredBoardAlight).join(
        ', '
      )}) VALUES (${Object.keys(filteredBoardAlight)
        .map(() => '?')
        .join(', ')})`
    ).run(...Object.values(filteredBoardAlight));

    bar.tick();
  }
};

export default mergeApc;
