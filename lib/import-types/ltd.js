import { getStops, getRoutes } from 'gtfs';
import { DateTime } from 'luxon';

import { getServiceIdsByDate, findClosestTripByTime } from '../utils.js';

export const formatLTDLine = ({ record, lineNumber }) => {
  const paddedStopId = record.stop.padStart(5, '0');
  const stops = getStops({ stop_id: paddedStopId }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid stop \`${record.stop}\` found`);
  }

  const paddedRouteId = record.route.padStart(2, '0');
  const routes = getRoutes({ route_id: paddedRouteId }, ['route_id']);

  if (routes.length === 0) {
    throw new Error(`Invalid route \`${record.route}\` found`);
  }

  const serviceDate = DateTime.fromFormat(
    record.calendar_date,
    'yyyy-MM-dd HH:mm:ss.SSS'
  ).toFormat('yyyyMMdd');
  const serviceIds = getServiceIdsByDate(serviceDate);

  if (serviceIds.length === 0) {
    throw new Error(
      `No service_ids found for calendar_date \`${record.calendar_date}\``
    );
  }

  const gtfsTime = `${record.msg_time}:00`;

  const tripStopTime = findClosestTripByTime(
    {
      stopIds: stops.map((stop) => stop.stop_id),
      routeId: routes[0].route_id,
      serviceIds,
    },
    gtfsTime
  );

  return {
    lineNumber,
    record: {
      trip_id: tripStopTime.trip_id,
      stop_id: tripStopTime.stop_id,
      stop_sequence: tripStopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: record.board,
      alightings: record.alight,
      load_count: record.departure_load,
      load_type: 1,
      service_date: serviceDate,
      service_departure_time: gtfsTime,
      source: 1,
    },
  };
};
