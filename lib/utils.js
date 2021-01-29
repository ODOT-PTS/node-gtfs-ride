const { DateTime } = require('luxon');
const gtfs = require('gtfs');

/*
 * Initialize configuration with defaults.
 */
exports.setDefaultConfig = initialConfig => {
  const defaults = {
    skipImport: false
  };

  return Object.assign(defaults, initialConfig);
};

/*
 * Calculate seconds from midnight for HH:mm:ss / H:m:s
 */
exports.calculateHourTimestamp = time => {
  const split = time.split(':').map(d => Number.parseInt(d, 10));
  if (split.length !== 3) {
    return null;
  }

  return (split[0] * 3600) + (split[1] * 60) + split[2];
};

/*
 * Find closest trip by time
 */
exports.findClosestTripByTime = (tripStoptimes, time) => {
  let closestTrip;
  const searchTime = DateTime.fromISO(time);
  for (const trip of tripStoptimes) {
    const nextArrivalTime = DateTime.fromISO(trip.arrival_time);
    const nextDepartureTime = DateTime.fromISO(trip.departure_time);

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
      const previousDiff = searchTime.diff(DateTime.fromISO(closestTrip.departure_time)).as('seconds');

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
};

/*
 * Find all service_ids for a date
 */
exports.getServiceIdsByDate = async dateString => {
  const db = gtfs.getDb();
  const days = [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  ];

  const serviceIds = [];
  const date = DateTime.fromFormat(dateString, 'yyyyMMdd');
  const dayOfWeek = days[Number.parseInt(date.toFormat('c'), 10) - 1];
  const calendars = await db.all(`SELECT service_id FROM calendar WHERE start_date <= ? AND end_date >= ? AND ${dayOfWeek} = 1`, [dateString, dateString]);

  serviceIds.push(...calendars.map(calendar => calendar.service_id));

  const calendarDates = await gtfs.getCalendarDates({ date: dateString });

  for (const calendarDate of calendarDates) {
    console.log(calendarDate);
    if (calendarDate.exception_type === 2) {
      // Handle exception_type 2 by removing service_id
      if (serviceIds.includes(calendarDate.service_id)) {
        serviceIds.splice(serviceIds.indexOf(calendarDate.service_id), 1);
      }
    } else if (calendarDate.exception_type === 1 && !serviceIds.includes(calendarDate.service_id)) {
      serviceIds.push(calendarDate.service_id);
    }
  }

  return serviceIds;
};

/*
 * Sum all values for a given key in a group, ignoring null
 */
exports.sumBoardAlightGroup = (group, fieldName) => {
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
};
