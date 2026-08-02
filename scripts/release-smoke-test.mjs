import { access, readFile } from 'node:fs/promises';

const requiredFiles = ['dist/index.html', 'dist/health.json'];

for (const file of requiredFiles) {
  await access(file);
}

const [indexHtml, healthText] = await Promise.all([
  readFile('dist/index.html', 'utf8'),
  readFile('dist/health.json', 'utf8'),
]);
const health = JSON.parse(healthText);

if (!indexHtml.includes('/assets/')) {
  throw new Error('Production HTML does not reference a built asset');
}
if (
  health.status !== 'ok' ||
  health.service !== 'project-origins' ||
  health.contractVersion !== 1
) {
  throw new Error('Production health asset does not satisfy the beta contract');
}

console.log('Release smoke test passed');
