from pathlib import Path

path = Path('public/app.js')
text = path.read_text(encoding='utf-8')
old = """    const altitude = Number(entry.altitudeFeet);
    const groundSpeed = Number(entry.groundSpeed);
    const distance = Number(status.distanceNm);
"""
new = """    const altitude = entry.altitudeFeet === null || entry.altitudeFeet === undefined || entry.altitudeFeet === '' ? null : Number(entry.altitudeFeet);
    const groundSpeed = entry.groundSpeed === null || entry.groundSpeed === undefined || entry.groundSpeed === '' ? null : Number(entry.groundSpeed);
    const distance = status.distanceNm === null || status.distanceNm === undefined || status.distanceNm === '' ? null : Number(status.distanceNm);
"""
if old not in text:
    raise SystemExit('Live Traffic numeric rendering anchor missing')
text = text.replace(old, new, 1)
path.write_text(text, encoding='utf-8')
