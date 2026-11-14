AMONG US x MAFIA WARS IRL - Netlify version
Deploy: push this folder to GitHub (or drag-drop it via Netlify CLI), import it in Netlify.
  Build command: (leave empty)   Publish dir: public   Functions: netlify/functions   (already set in netlify.toml)
Then in Netlify > Site configuration > Environment variables add:
  ADMIN_USER = your admin username   ADMIN_PASS = your admin password   SECRET = any long random string
(Without them the default login Levi / Levi0321 is used.)
Site: your-site.netlify.app      Admin: your-site.netlify.app/admin
Data: stored in Netlify Blobs (store "amongus"). View/export: Netlify CLI  ->  netlify blobs:list amongus
NOTE: drag-and-drop deploys of a plain folder do NOT build functions. Use GitHub or "netlify deploy --prod" (CLI).
