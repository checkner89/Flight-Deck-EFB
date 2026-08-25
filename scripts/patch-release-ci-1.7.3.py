from pathlib import Path

p = Path('.github/workflows/release.yml')
s = p.read_text(encoding='utf-8')
anchor = "          node scripts/verify-msfs-efb-builder.mjs\n"
insert = "          node scripts/verify-msfs-efb-builder.mjs\n          node scripts/verify-traffic-merge.mjs\n          if ((Get-Content 'public/index.html' -Raw) -notmatch 'update-dialog-notes') { throw 'Update dialog release notes UI is missing.' }\n          if ((Get-Content 'public/styles.css' -Raw) -match '\\.efb-pages \\.efb-card \\{[^}]*align-self:\\s*start') { throw 'Global EFB card shrink regression detected.' }\n          if ((Get-Content 'public/styles.css' -Raw) -notmatch '\\.combined-atc-layout \\.atc-messages-card \\{ grid-column: 1 / -1 !important') { throw 'SayIntentions messages full-width contract is missing.' }\n"
if 'node scripts/verify-traffic-merge.mjs' not in s:
    if anchor not in s:
        raise SystemExit('release CI anchor missing')
    s = s.replace(anchor, insert, 1)
p.write_text(s, encoding='utf-8')
