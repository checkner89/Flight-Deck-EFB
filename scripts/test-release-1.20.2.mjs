import fs from 'node:fs/promises';

const pilot = await fs.readFile('public/pilot-tools.js', 'utf8');
const news = await fs.readFile('public/news-app.js', 'utf8');
const newsService = await fs.readFile('src/news-feed-service.mjs', 'utf8');
const server = await fs.readFile('src/server.mjs', 'utf8');
const html = await fs.readFile('public/index.html', 'utf8');
const css = await fs.readFile('public/release-1.20.2.css', 'utf8');
const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));

function need(source, token, message) {
  if (!source.includes(token)) throw new Error(message);
}

need(pilot, 'const PEN_COLORS', 'Scratchpad pen colors are missing.');
need(pilot, 'const MARKER_COLORS', 'Scratchpad marker colors are missing.');
need(pilot, 'data-scratch-color', 'Scratchpad color palette is missing.');
need(pilot, 'data-scratch-image-add', 'Scratchpad image insert action is missing.');
need(pilot, 'scratchImages', 'Scratchpad image layer is missing.');
need(pilot, 'drawPaper(context', 'Scratchpad does not explicitly paint bright paper.');
need(pilot, 'Freihand-Notizen, Markierungen und Skizzen', 'Scratchpad tile copy is not aligned to the established tile hierarchy.');
need(pilot, 'SYSTEM & SIM SETUP', 'Flight Setup tile category is missing.');
need(news, '/api/news/article?id=', 'News app does not request enhanced article content.');
need(news, 'news-card-image', 'News cards do not support article thumbnails.');
need(news, 'favicon.ico', 'Publisher logo/favicons are missing.');
need(news, 'contentBlocks', 'News reader does not render structured article blocks.');
need(newsService, 'async article(id)', 'Enhanced server-side article reader is missing.');
need(newsService, 'extractContentBlocks', 'Structured article extraction is missing.');
need(newsService, 'content: fullContent,', 'Feed article content fallback is missing.');
need(server, "pathname === '/api/news/article'", 'Enhanced News article API route is missing after prepare.');
need(css, '.pilot-scratchpad .app-tile-icon', 'Unified Scratchpad tile accent is missing.');
need(css, '.news-app-tile .app-tile-icon', 'Unified News tile accent is missing.');
need(css, '.scratchpad-paper canvas{background:#fbfaf6', 'Scratchpad canvas is not explicitly bright.');
need(css, '.news-reader-image', 'Inline News article image styling is missing.');
need(html, 'release-1.20.2.css?v=1.20.2', '1.20.2 UI stylesheet is not wired into the app.');
if (pkg.version !== '1.20.2') throw new Error(`Unexpected package version: ${pkg.version}`);

console.log('Flight Deck EFB 1.20.2 UI, Scratchpad and enhanced News regression checks passed.');
