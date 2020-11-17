const gtfs = require('gtfs');
const { sortBy, uniqBy } = require('lodash');
const fileUtils = require('./file-utils');

/*
 * Generate GTFS-Ride data.
 */
exports.generateGTFSRide = async config => {
  console.log(config)
};


/*
 * Initialize configuration with defaults.
 */
exports.setDefaultConfig = initialConfig => {
  const defaults = {
    skipImport: false,
  };

  return Object.assign(defaults, initialConfig);
};
