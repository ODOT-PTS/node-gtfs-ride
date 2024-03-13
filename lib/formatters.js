import { groupBy, pickBy, sortBy, uniq } from 'lodash-es';

/*
 * Clean imported data
 */
export function cleanLine({ record, lineNumber }, model, config) {
  return {
    lineNumber,
    record: pickBy(record, (value, fieldName) => {
      const columnSchema = model.schema.find(
        (schema) => schema.name === fieldName,
      );

      // Filter out negative values for non-negative integer fields
      if (
        columnSchema.type === 'integer' &&
        columnSchema.min === 0 &&
        Number.parseInt(value, 10) < 0
      ) {
        config.recordIssue({
          message: `Negative integer for ${fieldName}`,
          lineNumber,
        });
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

export function formatIssue({ message, lineNumber, date }) {
  let formattedIssue = message;

  if (lineNumber) {
    formattedIssue += ` on line ${lineNumber}`;
  }

  if (date) {
    formattedIssue += ` for ${date}`;
  }

  return formattedIssue;
}

export function summarizeIssues(issues) {
  const issueGroups = groupBy(issues, 'message');

  const issueSummaries = Object.entries(issueGroups).map(
    ([message, issues]) => {
      return {
        type: message,
        count: issues.length,
        dates: uniq(issues.map((issue) => issue.date)),
        boardings: issues.reduce(
          (sum, issue) => sum + (issue.boardings ?? 0),
          0,
        ),
        alightings: issues.reduce(
          (sum, issue) => sum + (issue.alightings ?? 0),
          0,
        ),
      };
    },
  );

  return sortBy(issueSummaries, 'count').reverse();
}
