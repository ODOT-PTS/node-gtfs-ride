import { getTrips, getStoptimes, getStops } from 'gtfs';
import { DateTime } from 'luxon';

export const formatSwiftlyLine = ({ record, lineNumber }) => {
  const trips = getTrips({ trip_id: record.trip_id });
  const stops = getStops({ stop_id: record.stop_id });

  const stoptimes = getStoptimes({ trip_id: record.trip_id, stop_id: record.stop_id, departure_time: record.scheduled_time }, ['trip_id', 'stop_sequence']);

  if (trips.length === 0) {
    throw new Error(`Invalid Trip ID \`${record.trip_id}\` found`);
  }

  if (stops.length === 0) {
    throw new Error(`Invalid Stop ID \`${record.stop_id}\` found`);
  }

  if (stoptimes.length === 0) {
    throw new Error(`No stoptime found for stop_id=\`${record.stop_id}\` trip_id=\`${record.trip_id}\` departure_time=\`${record.scheduled_time}\``);
  }

  const serviceDate = DateTime.fromISO(record.service_date).toFormat('yyyyMMdd');

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
