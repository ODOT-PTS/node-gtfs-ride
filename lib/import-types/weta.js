import { getDb } from 'gtfs';
import { DateTime } from 'luxon';

import { calculateSecondsFromMidnight, getAllStationStopIds, getServiceIdsByDate } from '../utils.js';

export const formatWETALine = async ({ record, lineNumber }) => {
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
      calculateSecondsFromMidnight(DateTime.fromFormat(record.SchedDepart, 'H:mm').toFormat('HH:mm:ss'))
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