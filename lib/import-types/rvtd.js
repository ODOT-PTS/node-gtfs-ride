import { getStops, getRoutes } from 'gtfs';
import { DateTime } from 'luxon';
import { findTripByFirstStoptime } from '../utils.js';

export const formatRVTDLine = ({ record, lineNumber }) => {
  const paddedStopCode = record.stop_code.padStart(6, '0');
  const stops = getStops({ stop_code: paddedStopCode }, ['stop_id']);

  try {
    if (stops.length === 0) {
      throw new Error(`Invalid stop_code \`${paddedStopCode}\` found`);
    }

    const matchedStop = stops[0];
    const tripNameParts = record.trip_name.split(' - ');
    const routeShortName = tripNameParts[0];
    const tripLastStopTime = tripNameParts[2];
    const gtfsTime = DateTime.fromISO(tripLastStopTime).toFormat('H:mm:ss');

    const routes = getRoutes({ route_short_name: routeShortName }, [
      'route_id',
    ]);

    if (routes.length === 0) {
      throw new Error(`Invalid route_short_name \`${routeShortName}\` found`);
    }

    // Find trip with last stoptime that matches last part of trip_name
    const matchedTrip = findTripByFirstStoptime(
      {
        routeId: routes[0].route_id,
        stopId: matchedStop.stop_id,
        stopSequence: record.stope_sequence,
      },
      record.service_arrival_date,
      gtfsTime,
    );

    return {
      lineNumber,
      record: {
        trip_id: matchedTrip.trip_id,
        stop_id: matchedStop.stop_id,
        stop_sequence: record.stope_sequence,
        record_use: record.record_use,
        schedule_relationship: record.schedule_relationship,
        boardings: record.boardings,
        alightings: record.alightings,
        load_count: record.current_load,
        load_type: record.load_type,
        rack_down: record.rack_down,
        bike_boardings: record.bike_boardings,
        bike_alightings: record.bike_alightings,
        ramp_used: record.ramp_used,
        ramp_boardings: record.ramp_boardings,
        ramp_alightings: record.ramp_alightings,
        service_date: record.service_arrival_date,
        service_arrival_time: record.service_arrival_time,
        source: record.source,
      },
    };
  } catch (error) {
    // Add info to error cause
    error.cause = {
      ...(error.cause || {}),
      date: record.service_arrival_date,
      boardings: record.boardings,
      alightings: record.alightings,
    };

    throw error;
  }
};
