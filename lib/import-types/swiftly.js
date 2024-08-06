import { getTrips, getStops, openDb } from 'gtfs';
import { DateTime } from 'luxon';

export const formatSwiftlyLine = ({ record, lineNumber }) => {
  const db = openDb();

  const trips = getTrips({ trip_id: record.trip_id });
  const stops = getStops({ stop_id: record.stop_id });

  const formattedScheduledTime = DateTime.fromFormat(
    record.scheduled_time,
    'H:mm:ss',
  ).toISOTime({ includeOffset: false, suppressMilliseconds: true });

  const stoptimes = db
    .prepare(
      'SELECT trip_id, stop_sequence FROM stop_times WHERE trip_id = ? AND stop_id = ? AND (departure_time = ? OR arrival_time = ?)',
    )
    .all([
      record.trip_id,
      record.stop_id,
      formattedScheduledTime,
      formattedScheduledTime,
    ]);

  if (trips.length === 0) {
    throw new Error(`Invalid Trip ID \`${record.trip_id}\` found`);
  }

  if (stops.length === 0) {
    throw new Error(`Invalid Stop ID \`${record.stop_id}\` found`);
  }

  if (stoptimes.length === 0) {
    throw new Error(
      `No stoptime found for stop_id=\`${record.stop_id}\` trip_id=\`${record.trip_id}\` departure_time=\`${formattedScheduledTime}\``,
    );
  }

  const serviceDate = DateTime.fromFormat(
    record.service_date,
    'M/d/yyyy',
  ).toFormat('yyyyMMdd');

  return {
    lineNumber,
    record: {
      trip_id: record.trip_id,
      stop_id: record.stop_id,
      stop_sequence: stoptimes[0].stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: Number.parseInt(record.boardings, 10),
      alightings: Number.parseInt(record.alightings, 10),
      load_count: Number.parseInt(record.occupancy_count, 10),
      load_type: 1,
      service_date: serviceDate,
      service_departure_time: record.actual_time,
      source: 1,
    },
  };
};
