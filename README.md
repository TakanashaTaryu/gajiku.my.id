# Kas Terbuka Ormawa

A multi-tenant organization finance application for transparent cash books, payroll, audit logs, and member feedback. It runs on Cloudflare Workers with a Cloudflare D1 database.

## Requirements

- Node.js and npm
- A Cloudflare account for deployment
- A Google OAuth client for sign-in

## Local development

1. Install dependencies:

   ```sh
   npm ci
   ```

2. Create a local D1 database and apply the schema:

   ```sh
   npx wrangler d1 execute kas-terbuka-db --local --file=schema.sql
   npx wrangler d1 execute kas-terbuka-db --local --file=seed.sql
   ```

3. Copy `.dev.vars.example` to `.dev.vars` and fill in local OAuth settings. Use a randomly generated `SESSION_SECRET`; never reuse a production secret locally.

4. Run checks and start the local Worker:

   ```sh
   npm run typecheck
   npm run dev
   ```

   The local app is available at `http://localhost:8787`. The development login helper is restricted to localhost.

The seed file contains fictional demonstration records only. Replace the sample administrator emails with accounts you control when configuring your own instance.

## Configure a Cloudflare deployment

1. Create a D1 database:

   ```sh
   npx wrangler d1 create kas-terbuka-db
   ```

2. Copy the generated database ID into `wrangler.toml`. Set `BASE_DOMAIN`, `APP_URL`, and `GOOGLE_CLIENT_ID` to values for your own deployment. Configure your Cloudflare routes and DNS if using a custom domain.

3. Apply the schema and optional demo data to the remote database:

   ```sh
   npx wrangler d1 execute kas-terbuka-db --remote --file=schema.sql
   npx wrangler d1 execute kas-terbuka-db --remote --file=seed.sql
   ```

4. Set production-only credentials as Worker secrets. Use unique, randomly generated values:

   ```sh
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET
   ```

   Configure `SUPER_ADMIN_EMAILS` as a comma-separated list of administrator accounts in the Worker environment. Do not commit credentials, production emails, or `.dev.vars`.

5. Add the exact OAuth callback URL for your domain to the Google OAuth client, then deploy:

   ```sh
   npm run deploy
   ```

## Security and privacy

- `.env`, `.dev.vars`, and local Wrangler state are excluded from Git. Keep credentials in local ignored files or Cloudflare Worker secrets.
- Do not put real member, payroll, or transaction data in the repository. The included SQL seed is synthetic and optional.
- If a credential was ever committed, rotate it and remove it from the entire Git history before making the repository public. Deleting a secret in a later commit does not remove it from earlier commits.

## License

No license has been selected for this repository yet.
