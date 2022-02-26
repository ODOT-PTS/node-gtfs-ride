import { getStops, getTrips } from 'gtfs';
import { DateTime } from 'luxon';
import { getServiceIdsByDate, findClosestTripByTime, findClosestStoptimeByTime } from '../utils.js';

export const formatRidecheckPlusLine = async ({ record, lineNumber }) => {
  
  const stops = await getStops({ stop_id: record.STOP_KEY }, ['stop_id']);

  if (stops.length === 0) {
    throw new Error(`Invalid stop \`${record.StopId}\` found`);
  }

  const scheduledArrivalTime = DateTime.fromFormat(record.TIME_SCHEDULED, 'MM/dd/yyyy HH:mm:ss ZZ', { setZone: true });
  const arrivalTime = DateTime.fromFormat(record.TIME_ACTUAL_ARRIVE, 'MM/dd/yyyy HH:mm:ss ZZ', { setZone: true });
  const departureTime = DateTime.fromFormat(record.TIME_ACTUAL_DEPART, 'MM/dd/yyyy HH:mm:ss ZZ', { setZone: true });

  const serviceIds = await getServiceIdsByDate(scheduledArrivalTime.toFormat('yyyyMMdd'));

  if (serviceIds.length === 0) {
    throw new Error(`No service_ids found for calendar_date \`${record.ScheduledArrive}\``);
  }

  const trips = await getTrips({ trip_id: record.TRIP_KEY}, ['trip_id']);
  let tripId;
  

  if (trips.length === 0) {
    const tripStopTime = await findClosestTripByTime({
      stopIds: [record.StopId],
      routeId: record.RouteId,
      serviceIds,
    }, scheduledArrivalTime.toFormat('HH:mm:ss'));

    if (!tripStopTime) {
      throw new Error(`No trip_id found for \`${record.TripName}\``);
    }

    tripId = tripStopTime.trip_id;
  } else {
    tripId = trips[0].trip_id;
  }

  const stopTime = await findClosestStoptimeByTime({ tripId, stopId: record.StopId }, arrivalTime.toFormat('HH:mm:ss'));

  return {
    lineNumber,
    record: {
      trip_id: tripId,
      stop_id: stops[0].StopId,
      stop_sequence: stopTime.stop_sequence,
      record_use: 0,
      schedule_relationship: 0,
      boardings: Number.parseInt(record.FON, 10) + Number.parseInt(record.RON, 10),
      alightings: Number.parseInt(record.FOFF, 10) + Number.parseInt(record.ROFF, 10),
      load_count: Number.parseInt(record.MAX_LOAD, 10),
      load_type: 1,
      service_date: scheduledArrivalTime.toFormat('yyyyMMdd'),
      service_arrival_time: arrivalTime.toFormat('HH:mm:ss'),
      service_departure_time: departureTime.toFormat('HH:mm:ss'),
      source: 1,
    },
  };
};
