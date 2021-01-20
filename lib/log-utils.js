const readline = require('readline');
/* eslint-disable-next-line no-unused-vars */
const PrettyError = require('pretty-error').start();
const { noop } = require('lodash');
const chalk = require('chalk');
const Table = require('cli-table');

/*
 * Returns a log function based on config settings
 */
exports.log = config => {
  if (config.verbose === false) {
    return noop;
  }

  if (config.logFunction) {
    return config.logFunction;
  }

  return (text, overwrite) => {
    if (overwrite === true) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
    } else {
      process.stdout.write('\n');
    }

    process.stdout.write(text);
  };
};

/*
 * Returns an warning log function based on config settings
 */
exports.logWarning = config => {
  if (config.logFunction) {
    return config.logFunction;
  }

  return text => {
    process.stdout.write(`\n${exports.formatWarning(text)}\n`);
  };
};

/*
 * Returns an error log function based on config settings
 */
exports.logError = config => {
  if (config.logFunction) {
    return config.logFunction;
  }

  return text => {
    process.stdout.write(`\n${exports.formatError(text)}\n`);
  };
};

/*
 * Format console warning text
 */
exports.formatWarning = text => {
  return `${chalk.yellow.underline('Warning')}${chalk.yellow(':')} ${chalk.yellow(text)}`;
};

/*
 * Format console error text
 */
exports.formatError = text => {
  return `${chalk.red.underline('Error')}${chalk.red(':')} ${chalk.red(text)}`;
};

/*
 * Print a table of stats to the console.
 */
exports.logStats = (stats, config) => {
  // Hide stats table from custom log functions
  if (config.logFunction) {
    return;
  }

  const table = new Table({
    colWidths: [40, 20],
    head: ['Item', 'Count']
  });

  table.push(
    ['🛑 Issues', stats.issues],
    ['🕑 Time Required', stats.seconds]
  );

  config.log(table.toString());
};
