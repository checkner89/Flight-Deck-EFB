import fs from 'node:fs/promises';
import { CURATED_NEWS_FEEDS, NewsFeedService } from '../src/news-feed-service.mjs';

const app = await fs.readFile('public/app.js', 'utf8');
const pilot = await fs.readFile('public/pilot-tools.js', 'utf8');
const pilotCss = await fs.readFile('public/pilot-tools.css', 'utf8');
const setup = await fs.readFile('public/sim-session-native.js', 'utf8');
const setupCss = await fs.readFile('public/sim-session-native.css', 'utf8');
const news = await fs.readFile('public/news-app.js', 'utf8');
const html = await fs.readFile('public/index.html', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');
const electron = await fs.readFile('src/electron-main.mjs', 'utf8');
const session = await fs.readFile('src/windows-sim-session.mjs', 'utf8');
const release119 = await fs.readFile('scripts/apply-release-1.19.0.mjs', 'utf8');

function need(source, token, message) { if (!source.includes(token)) throw new Error(message); }
function reject(source, token, message) { if (source.includes(token)) throw new Error(message); }

need(app, 'let airportFocusEnabled = true;', 'Taxi map is not forced into airport-only mode.');
need(app, 'fillOpacity: 1,', 'Airport surroundings are not fully masked.');
need(app, 'map.setMaxBounds(airportBounds.pad(0.35));', 'Taxi map panning is not clamped to the airport.');
need(app, "tileById.get('settings')?.style.setProperty('order', '9999')", 'Settings is not forced to the final app position.');
need(pilot, "session: 'Flight Setup'", 'Sim Session was not renamed to Flight Setup.');
need(pilot, 'flight-setup-grid', 'Flight Setup does not use the simplified shell.');
reject(pilot, 'sim-session-internal', 'Duplicate internal quick-launch grid still exists in Flight Setup.');
need(pilotCss, 'background:#f7f3e9!important', 'Scratchpad paper is not explicitly bright in dark mode.');
need(setup, 'data-addon-filter', 'MSFS internal package browser is missing.');
need(setup, 'simInstalled', 'Flight Setup does not expose in-sim installation state.');
need(setup, 'if(created)refreshNativeStatus()', 'Flight Setup root creation does not guard the initial refresh.');
need(setup, "window.addEventListener('flightdeckflightsetupopen'", 'Flight Setup does not refresh explicitly when opened.');
reject(setup, "grid.append(root)}refreshNativeStatus()", 'Flight Setup observer still refreshes on every DOM mutation.');
need(setupCss, '.addon-panel', 'MSFS internal addon styling is missing.');
need(session, "from './msfs-addon-scanner.mjs'", 'Windows scanner does not use MSFS package scanning.');
need(session, 'sim: publicSimScan(simScan)', 'Sim package scan is not included in Flight Setup status.');
need(news, '/api/news/catalog', 'News app catalog integration is missing.');
need(news, '/api/news/subscriptions', 'News feed installation UI is missing.');
need(news, 'data.newsSignature', 'News tile does not guard repeated DOM writes.');
need(news, 'if(b.dataset.newsSignature===sig)return', 'News tile observer is not idempotent.');
need(html, 'news-app.js?v=1.20.0', 'News app script is not wired for 1.20.0.');
need(html, 'news-app.css?v=1.20.0', 'News app styles are not wired for 1.20.0.');
need(server, "pathname === '/api/news/feed'", 'News feed API route is missing.');
need(server, 'const newsService = new NewsFeedService', 'News service is not initialized by the host.');
need(electron, 'notifyFlightDeckNews', 'Native Windows news notifications are missing.');
need(electron, 'Notification.isSupported()', 'Electron notification guard is missing.');
need(release119, "if (!server.includes('    simSession,'))", '1.19 migration is not compatible with later services.');

if (CURATED_NEWS_FEEDS.length !== 20) throw new Error(`Expected 20 curated feeds, got ${CURATED_NEWS_FEEDS.length}.`);
for (const id of ['fselite', 'cruiselevel', 'msfsaddons', 'threshold', 'flightsimto']) {
  if (!CURATED_NEWS_FEEDS.some((feed) => feed.id === id)) throw new Error(`Curated feed missing: ${id}`);
}
const service = new NewsFeedService({ storageDirectory: '.tmp-news-test' });
if (!Array.isArray(service.catalog()) || service.catalog().length !== 20) throw new Error('News catalog is not available without a network refresh.');

console.log('Flight Deck EFB 1.20.0 airport-only, Flight Setup, MSFS scanner and News regression checks passed.');
