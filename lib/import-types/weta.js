import { openDb } from 'gtfs';
import { DateTime } from 'luxon';

import {
  calculateSecondsFromMidnight,
  getAllStationStopIds,
  getServiceIdsByDate,
} from '../utils.js';

export const formatWETALine = ({ record, lineNumber }) => {
  const db = openDb();

  // Detect route from `RunSegment` field
  const runSegmentCodes = {
    FBVJO: {
      origin_stop_id: '2455444',
      destination_stop_id: '12149044',
    },
    VJOFB: {
      origin_stop_id: '12149044',
      destination_stop_id: '2455444',
    },
    FBRICH: {
      origin_stop_id: '2455444',
      destination_stop_id: '890004',
    },
    RICHFB: {
      origin_stop_id: '890004',
      destination_stop_id: '2455444',
    },
    JLSALA: {
      origin_stop_id: '12030043',
      destination_stop_id: '12030042',
    },
    ALAJLS: {
      origin_stop_id: '12030042',
      destination_stop_id: '12030043',
    },
    FBALA: {
      origin_stop_id: '2455444',
      destination_stop_id: '12030042',
    },
    ALAFB: {
      origin_stop_id: '12030042',
      destination_stop_id: '2455444',
    },
    FBJLS: {
      origin_stop_id: '2455444',
      destination_stop_id: '12030043',
    },
    JLSFB: {
      origin_stop_id: '12030043',
      destination_stop_id: '2455444',
    },
  };

  const routeInfo = runSegmentCodes[record.RunSegment];

  if (!routeInfo) {
    throw new Error(`Invalid RunSegment \`${record.RunSegment}\` found`);
  }

  const serviceDate = DateTime.fromFormat(record.Date, 'M/d/yyyy').toFormat(
    'yyyyMMdd',
  );
  const serviceIds = getServiceIdsByDate(serviceDate);
  const originStopIds = getAllStationStopIds(routeInfo.origin_stop_id);
  const destinationStopIds = getAllStationStopIds(
    routeInfo.destination_stop_id,
  );

  const matchingTrips = [];

  const originStoptimes = db
    .prepare(
      `SELECT * FROM stop_times INNER JOIN trips ON trips.trip_id = stop_times.trip_id WHERE stop_id IN (${originStopIds
        .map(() => '?')
        .join(',')}) AND service_id IN (${serviceIds
        .map(() => '?')
        .join(',')}) AND departure_timestamp = ?`,
    )
    .all(
      ...originStopIds,
      ...serviceIds,
      calculateSecondsFromMidnight(
        DateTime.fromFormat(record.SchedDepart, 'H:mm').toFormat('HH:mm:ss'),
      ),
    );

  // For each possible origin stoptime, check if there is a destination stoptime on that trip
  for (const originStoptime of originStoptimes) {
    const destinationStoptimes = db
      .prepare(
        `SELECT * FROM stop_times WHERE stop_id IN (${destinationStopIds
          .map(() => '?')
          .join(
            ',',
          )}) AND trip_id = ? AND stop_sequence > ? ORDER BY stop_sequence ASC`,
      )
      .all(
        ...destinationStopIds,
        originStoptime.trip_id,
        originStoptime.stop_sequence,
      );

    if (destinationStoptimes.length > 0) {
      matchingTrips.push({
        originStoptime,
        destinationStoptime: destinationStoptimes[0],
      });
    }
  }

  if (matchingTrips.length === 0) {
    throw new Error(
      `Unable to find trip for stop_id \`${routeInfo.origin_stop_id}\` departure time \`${record.SchedDepart}\``,
    );
  }

  if (matchingTrips.length > 1) {
    throw new Error(
      `Ambiguous trip match for stop_id \`${routeInfo.origin_stop_id}\` departure time \`${record.SchedDepart}\`. ${matchingTrips.length} possible trips found`,
    );
  }

  const originBoardAlight = {
    lineNumber,
    record: {
      trip_id: matchingTrips[0].originStoptime.trip_id,
      stop_id: matchingTrips[0].originStoptime.stop_id,
      stop_sequence: matchingTrips[0].originStoptime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: record.PassengersOn,
      bike_boardings: record.BikesOn,
      service_date: serviceDate,
      service_departure_time: record.Depart,
      source: 0,
    },
  };

  const destinationBoardAlight = {
    lineNumber,
    record: {
      trip_id: matchingTrips[0].destinationStoptime.trip_id,
      stop_id: matchingTrips[0].destinationStoptime.stop_id,
      stop_sequence: matchingTrips[0].destinationStoptime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      alightings: record.PassengersOff,
      bike_alightings: record.BikesOff,
      service_date: serviceDate,
      service_arrival_time: record.Arrival,
      source: 0,
    },
  };

  return [originBoardAlight, destinationBoardAlight];
};
