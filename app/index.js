const path = require('path');
const gtfs = require('gtfs');

const express = require('express');
const logger = require('morgan');

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
router.get('/', (request, response) => {
  response.render('index');
});

router.get('/api/board-alight', async (request, response, next) => {
  try {
    const boardAlights = await gtfs.getBoardAlight();

    return response.json(boardAlights);
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
