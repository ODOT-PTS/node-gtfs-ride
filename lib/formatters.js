import { pickBy } from 'lodash-es';

/*
 * Clean imported data
 */
export function cleanLine({ record, lineNumber }, model, config) {
  return {
    lineNumber,
    record: pickBy(record, (value, fieldName) => {
      const columnSchema = model.schema.find(
        (schema) => schema.name === fieldName
      );

      // Filter out negative values for non-negative integer fields
      if (
        columnSchema.type === 'integer' &&
        columnSchema.min === 0 &&
        Number.parseInt(value, 10) < 0
      ) {
        config.recordIssue(
          `Negative integer for ${fieldName} found on ${lineNumber}.`
        );
        return false;
      }

      // Filter out 'NULL' values for all fields
      if (value === 'NULL') {
        return false;
      }

      return true;
    }),
  };
}
