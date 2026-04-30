# ImplicitEx Repository Structure

ImplicitEx is a web-based peer-to-peer USDC transfer platform. For now, the website is the application.

## Canonical Root

`~/DevEnv/implicitex`

## Runtime Surfaces

- `app-web/` - current primary application surface
- `desktop-python/` - future Python desktop GUI surface
- `legacy-transfer/` - imported historical material; not canonical source
- `.private/` - local-only sensitive/private files; never commit

## Canonical Source Rules

- Solidity contracts go in `app-web/contracts/`
- Web frontend source goes in `app-web/frontend/`
- Python service code for the web app goes in `app-web/backend/python/`
- Future desktop GUI code goes in `desktop-python/`
- Legacy files are reference material only until intentionally promoted

## Naming Rules

- Internal folders/files: lowercase kebab-case or snake_case
- User-facing product name: `ImplicitEx`
- Avoid duplicate canonical starting points
