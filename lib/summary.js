import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderFile } from 'pug';

/*
 * Render summary html
 */
export async function generateSummaryHtml(outputStats) {
  const html = await renderFile(path.join(fileURLToPath(import.meta.url), '../../views/summary.pug'), {
    ...outputStats,
    title: 'Summary of GTFS-Ride Data Creation',
  });

  return html;
}
