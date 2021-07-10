import { getStops, getRoutes, getTrips } from 'gtfs';
import { DateTime } from 'luxon';

import { getServiceIdsByDate, findClosestStoptimeByTime } from '../utils.js';

export const formatLTDLine = async ({ record, lineNumber }) => {
  const stops = await getStops({ stop_id: record.stop }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid stop \`${record.stop}\` found`);
  }

  const routes = await getRoutes({ route_id: record.route }, ['route_id']);

  if (routes.length === 0) {
    throw new Error(`Invalid route \`${record.route}\` found`);
  }

  const serviceDate = DateTime.fromISO(record.calendar_date).toFormat('yyyyMMdd');
  const serviceIds = await getServiceIdsByDate(serviceDate);

  if (serviceIds.length === 0) {
    throw new Error(`No service_ids found for calendar_date \`${record.calendar_date}\``);
  }

  const gtfsTime = `${record.msg_time}:00`;

  const trips = await getTrips({ trip_id: record.trip_sn }, ['trip_id', 'direction_id']);

  if (trips.length === 0) {
    throw new Error(`No trip_id found for \`${record.trip_sn}\``);
  }

  const stopTime = await findClosestStoptimeByTime({ tripId: record.trip_sn, stopId: record.stop }, gtfsTime);

  return {
    lineNumber,
    record: {
      trip_id: trips[0].trip_id,
      stop_id: stops[0].stop_id,
      stop_sequence: stopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: record.board,
      alightings: record.alight,
      load_count: record.departure_load,
      load_type: 1,
      service_date: serviceDate,
      service_departure_time: gtfsTime,
      source: 1
    }
  };
};