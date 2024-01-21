import { getTrips, getStoptimes, getStops } from 'gtfs';
import { DateTime } from 'luxon';

export const formatPassioLine = ({ record, lineNumber }) => {
  const trips = getTrips({ trip_id: record['Trip ID'] });
  const stops = getStops({ stop_id: record['Stop ID'] });

  const stoptimes = getStoptimes(
    {
      trip_id: record['Trip ID'],
      stop_id: record['Stop ID'],
      departure_time: record['Time point'],
    },
    ['trip_id', 'stop_sequence'],
  );

  if (trips.length === 0) {
    throw new Error(`Invalid Trip ID \`${record['Trip ID']}\` found`);
  }

  if (stops.length === 0) {
    throw new Error(`Invalid Stop ID \`${record['Stop ID']}\` found`);
  }

  if (stoptimes.length === 0) {
    throw new Error(
      `No stoptime found for stop_id=\`${record['Stop ID']}\` trip_id=\`${record['Trip ID']}\` departure_time=\`${record['Time point']}\``,
    );
  }

  const serviceDate = DateTime.fromISO(record.Date).toFormat('yyyyMMdd');

  return {
    lineNumber,
    record: {
      trip_id: record['Trip ID'],
      stop_id: record['Stop ID'],
      stop_sequence: stoptimes[0].stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings:
        record['On off'] === 'on' ? Number.parseInt(record.Count, 10) : 0,
      alightings:
        record['On off'] === 'off' ? Number.parseInt(record.Count, 10) : 0,
      load_count: Number.parseInt(record['Pax load'], 10),
      load_type: 1,
      service_date: serviceDate,
      service_departure_time: record.Time,
      source: 1,
    },
  };
};
