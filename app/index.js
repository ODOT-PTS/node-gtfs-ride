const path = require('path');
const gtfs = require('gtfs');

const express = require('express');
const logger = require('morgan');
const toposort = require('toposort');
const { groupBy, last, uniqBy } = require('lodash');

const utils = require('../lib/utils');
const selectedConfig = require('../config');

const app = express();
const router = new express.Router();

const config = utils.setDefaultConfig(selectedConfig);
// Override noHead config option so full HTML pages are generated
config.noHead = false;
config.assetPath = '/';
config.log = console.log;
config.logWarning = console.warn;
config.logError = console.error;

gtfs.openDb(config).catch(error => {
  if (error instanceof Error && error.code === 'SQLITE_CANTOPEN') {
    config.logError(`Unable to open sqlite database "${config.sqlitePath}" defined as \`sqlitePath\` config.json. Ensure the parent directory exists or remove \`sqlitePath\` from config.json.`);
  }

  throw error;
});

/*
 * Show all timetable pages
 */
router.get('/', async (request, response, next) => {
  try {
    const routes = await gtfs.getRoutes({}, ['route_id', 'route_short_name', 'route_long_name'], [['route_short_name', 'ASC']]);

    const routesWithDirections = await Promise.all(routes.map(async route => {
      const trips = await gtfs.getTrips({
        route_id: route.route_id
      }, [
        'trip_headsign',
        'direction_id'
      ], [
        ['direction_id', 'ASC']
      ]);
      route.directions = uniqBy(trips, trip => trip.direction_id);

      return route;
    }));

    response.render('index', { routes: routesWithDirections });
  } catch (error) {
    next(error);
  }
});

router.get('/api/board-alights', async (request, response, next) => {
  try {
    const db = gtfs.getDb();
    const values = [request.query.route_id];

    let directionQuery = '';
    if (request.direction_id !== 'null') {
      directionQuery = 'AND direction_id = ?';
      values.push(Number.parseInt(request.query.direction_id, 10));
    }

    const boardAlights = await db.all(`SELECT board_alight.trip_id, route_id, stop_id, boardings, alightings, load_count, service_date FROM board_alight LEFT JOIN trips ON board_alight.trip_id = trips.trip_id WHERE route_id = ? ${directionQuery} ORDER BY stop_sequence ASC`, values);

    // Use a directed graph to determine stop order.
    const tripGroups = groupBy(boardAlights, 'trip_id');
    const stopGraph = [];

    for (const tripGroup of Object.values(tripGroups)) {
      const sortedStopIds = [];

      for (const boardAlight of tripGroup) {
        if (last(sortedStopIds) !== boardAlight.stop_id) {
          sortedStopIds.push(boardAlight.stop_id);
        }
      }

      for (const [index, stopId] of sortedStopIds.entries()) {
        if (index === sortedStopIds.length - 1) {
          continue;
        }

        stopGraph.push([stopId, sortedStopIds[index + 1]]);
      }
    }

    const routeStopOrder = toposort(stopGraph);

    const stops = await gtfs.getStops({ stop_id: routeStopOrder }, ['stop_id', 'stop_name']);

    return response.json({
      routeStopOrder,
      stops,
      boardAlights
    });
  } catch (error) {
    next(error);
  }
});

app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'pug');

app.use(logger('dev'));
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', router);
app.set('port', process.env.PORT || 3000);

const server = app.listen(app.get('port'), () => {
  console.log(`Express server listening on port ${server.address().port}`);
});
