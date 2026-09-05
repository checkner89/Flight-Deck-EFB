import fs from 'node:fs/promises';

async function update(filename, transform) {
  const before = await fs.readFile(filename, 'utf8');
  const after = transform(before);
  if (after !== before) {
    await fs.writeFile(filename, after, 'utf8');
    console.log(`FLYXORA cleanup updated ${filename}`);
  }
}

function removeSection(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker);
  if (start < 0) return source;
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end < 0) throw new Error(`FLYXORA cleanup could not remove ${label}: end marker missing.`);
  return source.slice(0, start) + source.slice(end);
}

function removeNewsRoute(source, pathname) {
  const marker = `      if (pathname === '${pathname}'`;
  let next = source;
  while (next.includes(marker)) {
    const start = next.indexOf(marker);
    const followingIf = next.indexOf('\n      if (', start + marker.length);
    if (followingIf < 0) throw new Error(`FLYXORA cleanup could not remove ${pathname}: following route missing.`);
    next = next.slice(0, start) + next.slice(followingIf + 1);
  }
  return next;
}

await update('src/electron-main.mjs', (source) => {
  let next = source;

  // Remove the former close-to-tray interception. Closing the main window must
  // follow Electron's normal window-all-closed path and shut down the app.
  next = next.replace(
    /\n\s*mainWindow\.on\('close', \(event\) => \{\s*if \(isQuitting\) return;\s*event\.preventDefault\(\);\s*mainWindow\.hide\(\);\s*\}\);\s*/,
    '\n',
  );
  next = next.replace(
    /app\.on\('window-all-closed', \(\) => \{[\s\S]*?\n\}\);/,
    "app.on('window-all-closed', () => {\n  app.quit();\n});",
  );

  // Remove Windows notifications and server options that only existed for the
  // retired News app.
  next = next.replace(', Notification,', ',');
  next = removeSection(
    next,
    'function notifyFlightDeckNews(',
    'async function captureMsfsWindow()',
    'Flight Deck News notification handler',
  );
  next = next
    .replace(/^\s*newsStorageDirectory:.*\n/gm, '')
    .replace(/^\s*newsNotificationHandler:.*\n/gm, '');

  if (/mainWindow\.on\('close'[\s\S]{0,240}event\.preventDefault\(\)/.test(next)) {
    throw new Error('FLYXORA cleanup left the close-to-tray handler active.');
  }
  if (!next.includes("app.on('window-all-closed', () => {\n  app.quit();\n});")) {
    throw new Error('FLYXORA cleanup did not materialize quit-on-window-close.');
  }
  if (next.includes('notifyFlightDeckNews(') || next.includes('newsStorageDirectory:') || next.includes('newsNotificationHandler:')) {
    throw new Error('FLYXORA cleanup left News integration in electron-main.');
  }
  return next;
});

await update('src/server.mjs', (source) => {
  let next = source
    .replace(/^import \{ NewsFeedService \} from '\.\/news-feed-service\.mjs';\s*\n/m, '')
    .replace(/^\s*newsStorageDirectory,\s*\n/gm, '')
    .replace(/^\s*newsNotificationHandler,\s*\n/gm, '');

  if (next.includes('  const newsService = new NewsFeedService({')) {
    const startMarker = '  const newsService = new NewsFeedService({';
    const endMarker = '  await newsService.start();';
    const start = next.indexOf(startMarker);
    const end = next.indexOf(endMarker, start);
    if (end < 0) throw new Error('FLYXORA cleanup could not remove NewsFeedService initialization.');
    const endOfLine = next.indexOf('\n', end + endMarker.length);
    next = next.slice(0, start) + next.slice(endOfLine < 0 ? end + endMarker.length : endOfLine + 1);
  }

  for (const pathname of [
    '/api/news/catalog',
    '/api/news/feed',
    '/api/news/article',
    '/api/news/subscriptions',
    '/api/news/notifications',
  ]) {
    next = removeNewsRoute(next, pathname);
  }

  next = next
    .replace(/^\s*newsService,\s*\n/gm, '')
    .replace(/^\s*await newsService\.stop\(\);\s*\n/gm, '');

  if (next.includes("from './news-feed-service.mjs'") || next.includes('NewsFeedService') || next.includes('/api/news/') || next.includes('newsService')) {
    throw new Error('FLYXORA cleanup left News backend code in server.mjs.');
  }
  return next;
});

await update('public/index.html', (source) => source
  .replace(/\s*<link[^>]+news-app\.css\?v=[^>]+>\s*/gi, '\n')
  .replace(/\s*<script[^>]+news-app\.js\?v=[^>]+><\/script>\s*/gi, '\n'));

await update('public/service-worker.js', (source) => source
  .replace(/^\s*['\"]\/news-app\.(?:js|css)\?v=[^'\"\s,]+['\"],?\s*$/gm, '')
  .replace(/\n{3,}/g, '\n\n'));

await Promise.all([
  fs.rm('public/news-app.js', { force: true }),
  fs.rm('public/news-app.css', { force: true }),
  fs.rm('src/news-feed-service.mjs', { force: true }),
]);

const [index, server, serviceWorker] = await Promise.all([
  fs.readFile('public/index.html', 'utf8'),
  fs.readFile('src/server.mjs', 'utf8'),
  fs.readFile('public/service-worker.js', 'utf8'),
]);
if (/news-app\.(?:js|css)/i.test(index) || /news-app\.(?:js|css)/i.test(serviceWorker) || /\/api\/news\//i.test(server)) {
  throw new Error('FLYXORA cleanup validation found a remaining News runtime reference.');
}

console.log('FLYXORA News runtime removed and X now performs a complete application shutdown.');
