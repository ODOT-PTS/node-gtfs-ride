import { getStops, getRoutes } from 'gtfs';
import { DateTime } from 'luxon';

import { getServiceIdsByDate, findClosestTripByTime } from '../utils.js';

export const formatCETLine = async ({ record, lineNumber }) => {
  const stops = await getStops({ stop_name: record.RouteStop }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid RouteStop \`${record.RouteStop}\` found`);
  }

  const routes = await getRoutes({ route_short_name: Number.parseInt(record.Route, 10) }, ['route_id']);

  if (routes.length === 0) {
    throw new Error(`Invalid Route_ID \`${record.Route_ID}\` found`);
  }

  const serviceDate = DateTime.fromFormat(record.ClientTime, 'M/d/yyyy h:mm:ss a').toFormat('yyyyMMdd');
  const serviceIds = await getServiceIdsByDate(serviceDate);

  if (serviceIds.length === 0) {
    throw new Error(`No service_ids found for ClientTime \`${record.ClientTime}\``);
  }

  const tripStopTime = await findClosestTripByTime({
    stopIds: stops.map(stop => stop.stop_id),
    routeId: routes[0].route_id,
    serviceIds,
  }, DateTime.fromFormat(record.ClientTime, 'M/d/yyyy h:mm:ss a').toFormat('HH:mm:ss'));

  return {
    lineNumber,
    record: {
      trip_id: tripStopTime.trip_id,
      stop_id: tripStopTime.stop_id,
      stop_sequence: tripStopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: record.Entrys,
      alightings: record.Exits,
      service_date: serviceDate,
      source: 1,
    },
  };
};
