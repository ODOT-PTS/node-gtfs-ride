import { getRoutes, getStops } from 'gtfs';
import { DateTime } from 'luxon';
import { getServiceIdsByDate, findClosestTripByTime } from '../utils.js';

export const formatRidecheckPlusLine = async ({ record, lineNumber }) => {
  const stops = await getStops({ stop_code: record.STOP_ID }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid stop code \`${record.STOP_ID}\` found`);
  }

  const routes = await getRoutes({ route_short_name: record.ROUTE_NUMBER }, ['route_id']);

  if (routes.length === 0) {
    throw new Error(`Invalid route number \`${record.ROUTE_NUMBER}\``);
  }

  if (record.TIME_ACTUAL_ARRIVE === 'NULL' || record.TIME_ACTUAL_ARRIVE === '') {
    throw new Error('No TIME_ACTUAL_ARRIVE present');
  }

  const serviceDate = DateTime.fromFormat(record.SIGNUP_NAME, 'd-MMM').toFormat('yyyyMMdd');
  const arrivalTime = DateTime.fromSQL(record.TIME_ACTUAL_ARRIVE);
  const departureTime = DateTime.fromSQL(record.TIME_ACTUAL_DEPART);
  const serviceIds = await getServiceIdsByDate(serviceDate);

  if (serviceIds.length === 0) {
    throw new Error(`No service_ids found for date \`${serviceDate}\``);
  }

  const tripStopTime = await findClosestTripByTime({
    stopIds: stops.map(stop => stop.stop_id),
    routeId: routes[0].route_id,
    serviceIds,
  }, arrivalTime.toFormat('HH:mm:ss'));

  return {
    lineNumber,
    record: {
      trip_id: tripStopTime.trip_id,
      stop_id: tripStopTime.stop_id,
      stop_sequence: tripStopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: Number.parseInt(record.FON, 10) + Number.parseInt(record.RON, 10),
      alightings: Number.parseInt(record.FOFF, 10) + Number.parseInt(record.ROFF, 10),
      load_count: Number.parseInt(record.MAX_LOAD, 10),
      load_type: 1,
      service_date: serviceDate,
      service_arrival_time: arrivalTime.toFormat('HH:mm:ss'),
      service_departure_time: departureTime.toFormat('HH:mm:ss'),
      source: 1,
    },
  };
};
