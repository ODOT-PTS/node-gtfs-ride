const readline = require('readline');
/* eslint-disable-next-line no-unused-vars */
const PrettyError = require('pretty-error').start();
const { noop } = require('lodash');
const chalk = require('chalk');
const ProgressBar = require('progress');
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
    colWidths: [20, 40],
    head: ['Item', 'Value']
  });

  table.push(
    ['📅 Date Range', stats.dateRange],
    ['🚪 Board-Alights', stats.boardAlightCount],
    ['🛑 Issues', stats.issues.length],
    ['🕑 Time Required', `${stats.seconds}s`]
  );

  config.log(table.toString());
};

/*
 * Print a progress bar to the console.
 */
exports.progressBar = (formatString, barOptions, config) => {
  if (config.verbose === false) {
    return {
      interrupt: noop,
      tick: noop
    };
  }

  if (barOptions.total === 0) {
    return null;
  }

  if (config.logFunction) {
    let barProgress = 0;
    const renderProgressString = () => {
      return formatString
        .replace(':current', barProgress)
        .replace(':total', barOptions.total)
        .replace('[:bar] ', '');
    };

    config.log(renderProgressString());

    return {
      interrupt: text => {
        config.logWarning(text);
      },
      tick: () => {
        barProgress += 1;
        config.log(renderProgressString());
      }
    };
  }

  return new ProgressBar(formatString, barOptions);
};
