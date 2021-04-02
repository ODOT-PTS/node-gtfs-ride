const path = require('path');
const pug = require('pug');

/*
 * Render summary html
 */
exports.generateSummaryHtml = async outputStats => {
  const html = await pug.renderFile(path.join(__dirname, '..', 'views/summary.pug'), {
    ...outputStats,
    title: 'Summary of GTFS-Ride Data Creation'
  });

  return html;
};
