const { pickBy } = require('lodash');

/*
 * Clean imported data
 */
exports.cleanLine = async (line, model, lineCount, config) => {
  const lineNumber = lineCount + 1;
  return pickBy(line, (value, fieldName) => {
    const columnSchema = model.schema.find(schema => schema.name === fieldName);

    // Filter out negative values for non-negative integer fields
    if (columnSchema.type === 'integer' && columnSchema.min === 0 && Number.parseInt(value, 10) < 0) {
      config.recordIssue(`Negative integer for ${fieldName} found on ${lineNumber}.`);
      return false;
    }

    // Filter out 'NULL' values for all fields
    if (value === 'NULL') {
      return false;
    }

    return true;
  });
};
