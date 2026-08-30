import fs from 'node:fs/promises';
async function update(filename, transform){const before=await fs.readFile(filename,'utf8');const after=transform(before);if(after!==before)await fs.writeFile(filename,after,'utf8');}
await update('public/index.html',source=>{
  let next=source;
  if(!next.includes('release-1.23.1-ui.css')) next=next.replace('</head>','    <link rel="stylesheet" href="/release-1.23.1-ui.css?v=1.23.1">\n  </head>');
  if(!next.includes('release-1.23.1-ui.js')) next=next.replace('</body>','    <script src="/release-1.23.1-ui.js?v=1.23.1"></script>\n  </body>');
  return next;
});
await update('public/service-worker.js',source=>{
  let next=source.replace(/const CACHE_NAME = '[^']+';/,"const CACHE_NAME = 'flight-deck-efb-v1231-ui-review';");
  for(const asset of ["'/release-1.23.1-ui.css?v=1.23.1'","'/release-1.23.1-ui.js?v=1.23.1'"]){if(!next.includes(asset))next=next.replace("  '/manifest.webmanifest',",`  ${asset},\n  '/manifest.webmanifest',`);}
  return next;
});
console.log('Flight Deck EFB 1.23.1 UI review fixes materialized.');
