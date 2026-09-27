# Dashboard authentication deployment

This release adds direct username/password accounts. It does not use email invitations, Vercel Authentication, or a paid identity service. Users are not forced to change their initial password.

## Required Vercel environment variables

Add these to the `rating-control-center-vercel` project for Production, Preview, and Development as appropriate:

- `DATABASE_URL`: the existing Neon/PostgreSQL connection string.
- `AUTH_BOOTSTRAP_USERNAME`: the first administrator username, for example `admin`.
- `AUTH_BOOTSTRAP_PASSWORD`: the first administrator password (6–128 characters).
- `AUTH_BOOTSTRAP_DISPLAY_NAME`: optional display name.

The first request creates the authentication tables and the bootstrap administrator only when the users table is empty. After the first administrator login succeeds, `AUTH_BOOTSTRAP_PASSWORD` can be removed from Vercel and the project redeployed.

## Windows PowerShell deployment

Run from `C:\RatingControlCenter-Vercel` after extracting this package over the repository:

```powershell
npm install
npm test
npm run build
git status
git add .
git commit -m "Add dashboard users and scoped access"
git push origin main
```

Set the environment variables in Vercel before opening the deployed dashboard. The first login is the bootstrap administrator. Use **Users** in the header to create more accounts, assign brand or branch access, reset passwords, disable accounts, and revoke their active sessions.
