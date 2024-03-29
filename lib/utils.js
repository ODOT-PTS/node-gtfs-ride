import { DateTime } from 'luxon';
import {
  openDb,
  getStoptimes,
  getTrips,
  getCalendarDates,
  getStops,
} from 'gtfs';
import { sortBy } from 'lodash-es';

/*
 * Calculate seconds from midnight for HH:mm:ss
 */
export function calculateSecondsFromMidnight(time) {
  const split = time.split(':').map((d) => Number.parseInt(d, 10));
  if (split.length !== 3) {
    return null;
  }

  return split[0] * 3600 + split[1] * 60 + split[2];
}

/*
 * Parse GTFS HH:mm:ss time into Luxon (including times after midnight)
 */
const gtfsTimeToLuxon = (time) => {
  const split = time.split(':').map((d) => Number.parseInt(d, 10));
  if (split.length !== 3) {
    throw new Error('Time is not in HH:mm:ss format');
  }

  if (split[0] > 23) {
    return DateTime.fromObject({
      hour: split[0] - 24,
      minute: split[1],
      second: split[0],
    }).plus({ days: 1 });
  }

  return DateTime.fromObject({
    hour: split[0],
    minute: split[1],
    second: split[0],
  });
};

/*
 * Check if stoptime has arrival/departure times, if not estimate based on nearest timepoints
 */
function estimateStoptimeArrivalAndDeparture(tripStoptime) {
  const db = openDb();
  if (tripStoptime.arrival_time !== null) {
    return tripStoptime;
  }

  // Find nearest stoptimes that are timepoints on this trip
  const nextStoptime = db
    .prepare(
      'SELECT * FROM stop_times WHERE trip_id = ? AND stop_sequence > ? AND arrival_time IS NOT NULL ORDER BY stop_sequence ASC',
    )
    .get(tripStoptime.trip_id, tripStoptime.stop_sequence);

  const previousStoptime = db
    .prepare(
      'SELECT * FROM stop_times WHERE trip_id = ? AND stop_sequence < ? AND arrival_time IS NOT NULL ORDER BY stop_sequence ASC',
    )
    .get(tripStoptime.trip_id, tripStoptime.stop_sequence);

  // Use stop sequence to estimate time between timepoints
  const previousTimepointDepartureTime = gtfsTimeToLuxon(
    previousStoptime.departure_time,
  );
  const nextTimepointArrivalTime = gtfsTimeToLuxon(nextStoptime.arrival_time);
  const difference = nextTimepointArrivalTime.diff(
    previousTimepointDepartureTime,
  );
  const estimatedTime = previousTimepointDepartureTime.plus({
    seconds:
      (difference.as('seconds') *
        (tripStoptime.stop_sequence - previousStoptime.stop_sequence)) /
      (nextStoptime.stop_sequence - previousStoptime.stop_sequence),
  });
  tripStoptime.arrival_time = estimatedTime.toFormat('HH:mm:ss');
  tripStoptime.arrival_timestamp = calculateSecondsFromMidnight(
    estimatedTime.toFormat('HH:mm:ss'),
  );
  tripStoptime.departure_time = estimatedTime.toFormat('HH:mm:ss');
  tripStoptime.departure_timestamp = calculateSecondsFromMidnight(
    estimatedTime.toFormat('HH:mm:ss'),
  );

  return tripStoptime;
}

/*
 * Initialize configuration with defaults.
 */
export function setDefaultConfig(initialConfig) {
  const defaults = {
    sqlitePath: ':memory:',
    skipGTFSImport: false,
    skipAPCImport: false,
    mergeDuplicateBoardAlights: false,
  };

  return Object.assign(defaults, initialConfig);
}

/*
 * Calculate seconds from midnight for HH:mm:ss / H:m:s
 */
export function calculateHourTimestamp(time) {
  const split = time.split(':').map((d) => Number.parseInt(d, 10));
  if (split.length !== 3) {
    return null;
  }

  return split[0] * 3600 + split[1] * 60 + split[2];
}

/*
 * Find closest trip by time
 */
export function findClosestTripByTime(
  { stopIds, serviceIds, routeId },
  gtfsTime,
) {
  const db = openDb();
  const queryParameters = [routeId, ...stopIds, ...serviceIds];

  const tripStoptimes = db
    .prepare(
      `SELECT * FROM trips INNER JOIN stop_times ON trips.trip_id = stop_times.trip_id WHERE route_id = ? AND stop_id IN (${stopIds
        .map(() => '?')
        .join(
          ',',
        )}) AND service_id IN (${serviceIds.map(() => '?').join(',')})`,
    )
    .all(...queryParameters);

  if (tripStoptimes.length === 0) {
    throw new Error(
      `No trips found for route_id \`${routeId}\` and stop_id \`${stopIds.join(
        ', ',
      )}\` and service_id \`${serviceIds.join(', ')}\``,
    );
  }

  const estimatedTripStoptimes = tripStoptimes.map((tripStoptime) =>
    estimateStoptimeArrivalAndDeparture(tripStoptime),
  );
  const sortedEstimatedTripStoptimes = sortBy(
    estimatedTripStoptimes,
    'arrival_timestamp',
  );

  let closestTrip;
  const searchTime = gtfsTimeToLuxon(gtfsTime);
  for (const trip of sortedEstimatedTripStoptimes) {
    const nextArrivalTime = gtfsTimeToLuxon(trip.arrival_time);
    const nextDepartureTime = gtfsTimeToLuxon(trip.departure_time);

    if (nextArrivalTime <= searchTime && nextDepartureTime >= searchTime) {
      // Time is between arrival and departure time of trip, so use that
      closestTrip = trip;
      break;
    } else if (nextArrivalTime <= searchTime) {
      // Store trip and loop to next
      closestTrip = trip;
    } else if (closestTrip) {
      // Next trip is after time, compare previous trip's departure_time and next trip's arrival_time to see which is closest
      const nextDiff = nextArrivalTime.diff(searchTime).as('seconds');
      const previousDiff = searchTime
        .diff(gtfsTimeToLuxon(closestTrip.departure_time))
        .as('seconds');

      if (nextDiff < previousDiff) {
        closestTrip = trip;
      }

      break;
    } else {
      // Trip is before the first scheduled trip, use that
      closestTrip = trip;
    }
  }

  return closestTrip;
}

/*
 * Find closest stoptime by time
 */
export function findClosestStoptimeByTime({ tripId, stopId }, gtfsTime) {
  const stoptimes = getStoptimes({ trip_id: tripId, stop_id: stopId }, [
    'trip_id',
    'stop_sequence',
    'arrival_time',
    'arrival_timestamp',
    'departure_time',
    'departure_timestamp',
  ]);

  if (stoptimes.length === 0) {
    throw new Error(
      `No stop times found for trip_id \`${tripId}\` and stop_id \`${stopId}\``,
    );
  }

  if (stoptimes.length === 1) {
    return stoptimes[0];
  }

  const estimatedTripStoptimes = stoptimes.map((tripStoptime) =>
    estimateStoptimeArrivalAndDeparture(tripStoptime),
  );
  const sortedEstimatedTripStoptimes = sortBy(
    estimatedTripStoptimes,
    'arrival_timestamp',
  );

  let closestStoptime;
  const searchTime = gtfsTimeToLuxon(gtfsTime);
  for (const stoptime of sortedEstimatedTripStoptimes) {
    const nextArrivalTime = gtfsTimeToLuxon(stoptime.arrival_time);
    const nextDepartureTime = gtfsTimeToLuxon(stoptime.departure_time);

    if (nextArrivalTime <= searchTime && nextDepartureTime >= searchTime) {
      // Time is between arrival and departure time of stoptime, so use that
      closestStoptime = stoptime;
      break;
    } else if (nextArrivalTime <= searchTime) {
      // Store stoptime and loop to next
      closestStoptime = stoptime;
    } else if (closestStoptime) {
      // Next stoptime is after time, compare previous stoptimes departure_time and next stoptimes arrival_time to see which is closest
      const nextDiff = nextArrivalTime.diff(searchTime).as('seconds');
      const previousDiff = searchTime
        .diff(gtfsTimeToLuxon(closestStoptime.departure_time))
        .as('seconds');

      if (nextDiff < previousDiff) {
        closestStoptime = stoptime;
      }

      break;
    } else {
      // Time is before the first scheduled stoptime, use that
      closestStoptime = stoptime;
    }
  }

  return closestStoptime;
}

/*
 * Find trip by first stoptime
 */
export function findTripByFirstStoptime(
  { routeId, stopId, stopSequence },
  gtfsDate,
  gtfsTime,
) {
  const db = openDb();
  const serviceDate = DateTime.fromISO(gtfsDate).toFormat('yyyyMMdd');
  const serviceIds = getServiceIdsByDate(serviceDate);

  if (serviceIds.length === 0) {
    throw new Error(
      `No service_ids found for service_arrival_date \`${gtfsDate}\``,
    );
  }

  const trips = getTrips({ route_id: routeId, service_Id: serviceIds }, [
    'trip_id',
    'direction_id',
  ]);

  if (trips.length === 0) {
    throw new Error(
      `No trip_ids found for route_id \`${routeId}\` on service_arrival_date \`${gtfsDate}\``,
    );
  }

  let matchedTrip;
  for (const trip of trips) {
    const lastStoptime = db
      .prepare(
        'SELECT trip_id, arrival_time FROM stop_times WHERE trip_id = ? ORDER BY stop_sequence ASC LIMIT 1',
      )
      .get(trip.trip_id);

    if (lastStoptime === undefined) {
      continue;
    }

    if (lastStoptime.arrival_time && lastStoptime.arrival_time === gtfsTime) {
      const stoptimes = getStoptimes({
        trip_id: trip.trip_id,
        stop_id: stopId,
        stop_sequence: stopSequence,
      });

      if (stoptimes.length > 0) {
        matchedTrip = trip;
        break;
      }
    }
  }

  if (!matchedTrip) {
    throw new Error(
      `No trip_ids found for route_id \`${routeId}\` on service_arrival_date \`${gtfsDate}\` with trip end time of \`${gtfsTime}\``,
    );
  }

  return matchedTrip;
}

/*
 * Find all service_ids for a date
 */
export function getServiceIdsByDate(dateString) {
  const db = openDb();
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ];

  const serviceIds = [];
  const date = DateTime.fromFormat(dateString, 'yyyyMMdd');
  const dayOfWeek = days[Number.parseInt(date.toFormat('c'), 10) - 1];
  const calendars = db
    .prepare(
      `SELECT service_id FROM calendar WHERE start_date <= ? AND end_date >= ? AND ${dayOfWeek} = 1`,
    )
    .all(dateString, dateString);

  serviceIds.push(...calendars.map((calendar) => calendar.service_id));

  const calendarDates = getCalendarDates({ date: dateString });

  for (const calendarDate of calendarDates) {
    if (calendarDate.exception_type === 2) {
      // Handle exception_type 2 by removing service_id
      if (serviceIds.includes(calendarDate.service_id)) {
        serviceIds.splice(serviceIds.indexOf(calendarDate.service_id), 1);
      }
    } else if (
      calendarDate.exception_type === 1 &&
      !serviceIds.includes(calendarDate.service_id)
    ) {
      serviceIds.push(calendarDate.service_id);
    }
  }

  return serviceIds;
}

/*
 * Sum all values for a given key in a group, ignoring null
 */
export function sumBoardAlightGroup(group, fieldName) {
  let sum = null;

  for (const boardAlight of group) {
    if (boardAlight[fieldName] === null) {
      continue;
    }

    if (sum === null) {
      sum = 0;
    }

    sum += boardAlight[fieldName];
  }

  return sum;
}

/*
 * For a specific stop_id, returns an array all stop_ids within a parent station
 * and the stop_id of parent station itself. If no parent station, it returns the
 * stop_id.
 */
export function getAllStationStopIds(stopId) {
  const stops = getStops({
    stop_id: stopId,
  });

  if (stops.length === 0) {
    throw new Error(`Invalid stop_id \`${stopId}\``);
  }

  const stop = stops[0];

  if (stop.parent_station === '' || stop.parent_station === null) {
    // Check if stopId is a parent station
    const childStops = getStops({
      parent_station: stopId,
    });

    return [stopId, ...childStops.map((stop) => stop.stop_id)];
  }

  const stopsInParentStation = getStops(
    {
      parent_station: stop.parent_station,
    },
    ['stop_id'],
  );

  return [
    stop.parent_station,
    ...stopsInParentStation.map((stop) => stop.stop_id),
  ];
}
