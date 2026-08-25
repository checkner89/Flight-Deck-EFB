from pathlib import Path

path = Path('public/index.html')
text = path.read_text(encoding='utf-8')
old = '<article data-settings-panel="system" class="efb-card settings-card"><h2>Connector configuration</h2><p>Optionale lokale Variablen für den Windows-Host:</p><code>NAVIGRAPH_CLIENT_ID</code><code>NAVIGRAPH_CLIENT_SECRET</code><code>BEYONDATC_LOG_DIR</code><code>GSX_ADDON_MANAGER</code><code>FLIGHT_DECK_UPDATE_URL</code><small>Zugangsdaten werden nicht an Browser oder Mobilgerät ausgegeben. Der Update-Kanal muss HTTPS verwenden.</small></article>'
new = '<article data-settings-panel="system" class="efb-card settings-card"><h2>Connector configuration</h2><p>Optionale lokale Pfad-/Endpoint-Overrides für Sonderinstallationen. In einer Standardinstallation ist hier keine Konfiguration erforderlich:</p><code>BEYONDATC_LOG_DIR</code><code>GSX_ADDON_MANAGER</code><code>PMDG_PACKAGES_DIR</code><code>LITTLENAVMAP_API_URL</code><small>Diese Werte bleiben ausschließlich im Windows-Host. Fenix Remote EFB wird lokal auf Port 8083 erkannt; Updates kommen direkt aus dem GitHub-Release-Kanal. Navigraph ist in diesem Build weiterhin deaktiviert.</small></article>'
if old not in text:
    raise SystemExit('connector configuration UI anchor missing')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
