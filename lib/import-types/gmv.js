import { getStops, getTrips } from 'gtfs';
import { DateTime } from 'luxon';
import {
  getServiceIdsByDate,
  findClosestTripByTime,
  findClosestStoptimeByTime,
} from '../utils.js';

export const formatGMVLine = ({ record, lineNumber }) => {
  const scheduledArrivalTime = DateTime.fromFormat(
    record.ScheduledArrive,
    'MM/dd/yyyy HH:mm:ss ZZ',
    { setZone: true },
  );
  const arrivalTime = DateTime.fromFormat(
    record.Arrive,
    'MM/dd/yyyy HH:mm:ss ZZ',
    { setZone: true },
  );
  const departureTime = DateTime.fromFormat(
    record.Depart,
    'MM/dd/yyyy HH:mm:ss ZZ',
    { setZone: true },
  );
  const boardings = Number.parseInt(record.Ons, 10);
  const alightings = Number.parseInt(record.Offs, 10);
  const loadCount = Number.parseInt(record.DeparturePassengers, 10);

  try {
    if (record.StopId === '') {
      throw new Error('Empty stop found');
    }

    const stops = getStops({ stop_id: record.StopId }, ['stop_id']);

    if (stops.length === 0) {
      throw new Error(`Invalid stop \`${record.StopId}\` found`);
    }

    const serviceIds = getServiceIdsByDate(
      scheduledArrivalTime.toFormat('yyyyMMdd'),
    );

    if (serviceIds.length === 0) {
      throw new Error(
        `No service_ids found for calendar_date \`${scheduledArrivalTime.toFormat('yyyyMMdd')}\``,
        { cause: { reason: 'no-service-ids' } },
      );
    }

    const trips = getTrips({ trip_id: record.TripName }, ['trip_id']);
    let tripId;

    if (trips.length === 0) {
      const tripStopTime = findClosestTripByTime(
        {
          stopIds: [record.StopId],
          routeId: record.RouteId,
          serviceIds,
        },
        scheduledArrivalTime.toFormat('HH:mm:ss'),
      );

      if (!tripStopTime) {
        throw new Error(`No trip_id found for \`${record.TripName}\``);
      }

      tripId = tripStopTime.trip_id;
    } else {
      tripId = trips[0].trip_id;
    }

    const stopTime = findClosestStoptimeByTime(
      { tripId, stopId: record.StopId },
      arrivalTime.toFormat('HH:mm:ss'),
    );

    return {
      lineNumber,
      record: {
        trip_id: tripId,
        stop_id: stops[0].stop_id,
        stop_sequence: stopTime.stop_sequence,
        record_use: 0,
        schedule_relationship: 0,
        boardings,
        alightings,
        load_count: loadCount,
        load_type: 1,
        service_date: scheduledArrivalTime.toFormat('yyyyMMdd'),
        service_arrival_time: arrivalTime.toFormat('HH:mm:ss'),
        service_departure_time: departureTime.toFormat('HH:mm:ss'),
        source: 1,
      },
    };
  } catch (error) {
    // Add info to error cause
    error.cause = {
      ...(error.cause || {}),
      date: scheduledArrivalTime.toFormat('yyyyMMdd'),
      boardings,
      alightings,
    };

    throw error;
  }
};
