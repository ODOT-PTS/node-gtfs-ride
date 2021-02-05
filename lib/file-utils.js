const path = require('path');

const fs = require('fs-extra');
const { snakeCase } = require('lodash');
const sanitize = require('sanitize-filename');
const untildify = require('untildify');

/*
 * Attempt to parse the specified config JSON file.
 */
exports.getConfig = async argv => {
  let config;

  if (argv.configPath) {
    // If a `configPath` is specified, try to read it and throw error if it doesn't exist
    try {
      const data = await fs.readFile(path.resolve(untildify(argv.configPath)), 'utf8').catch(error => {
        console.error(new Error(`Cannot find configuration file at \`${argv.configPath}\`. Use config-sample.json as a starting point, pass --configPath option`));
        throw error;
      });
      config = Object.assign(JSON.parse(data), argv);
    } catch (error) {
      console.error(new Error(`Cannot parse configuration file at \`${argv.configPath}\`. Check to ensure that it is valid JSON.`));
      throw error;
    }
  } else if (fs.existsSync(path.resolve('./config.json'))) {
    // Else if `config.json` exists, use config values read from it
    try {
      const data = await fs.readFile(path.resolve('./config.json'), 'utf8');
      config = Object.assign(JSON.parse(data), argv);
      console.log('Using configuration from ./config.json');
    } catch (error) {
      console.error(new Error('Cannot parse configuration file at `./config.json`. Check to ensure that it is valid JSON.'));
      throw error;
    }
  } else {
    // Use argv values from CLI
    config = argv;
  }

  return config;
};

/*
 * Prepare the specified directory for saving HTML timetables by deleting
 * everything and creating the expected folders.
 */
exports.prepDirectory = async exportPath => {
  await fs.remove(exportPath);
  await fs.ensureDir(exportPath);
};

/*
 * Count the number of lines in a file
 */
exports.countFileLines = async filePath => {
  return new Promise((resolve, reject) => {
    let lineCount = 0;
    fs.createReadStream(filePath)
      .on('data', buffer => {
        let idx = -1;
        lineCount--; // Because the loop will run once for idx=-1
        do {
          idx = buffer.indexOf(10, idx + 1);
          lineCount++;
        } while (idx !== -1);
      }).on('end', () => {
        resolve(lineCount);
      }).on('error', reject);
  });
};

/*
 * Generate a folder name based on a string.
 */
exports.generateFolderName = folderName => snakeCase(sanitize(folderName));
