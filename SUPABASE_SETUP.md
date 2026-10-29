# Supabase development setup

The app uses email/password accounts. One owner creates each business and can give managers access with one-time codes. Each account is connected to at most one business. Use a separate Supabase project for development.

1. In [Supabase Dashboard](https://supabase.com/dashboard), create a new project in your organization. Choose a nearby region and save the database password in your password manager. Wait until the project is ready.
2. Open **Connect** in the project dashboard. Copy the **Project URL** and **publishable key** into `Web/.env.local`, using `Web/.env.example` as the template. Keep `NEXT_PUBLIC_SITE_URL=http://localhost:3000` for local development. Do not use a secret or service role key in a `NEXT_PUBLIC_` variable.
3. In **Authentication → Sign In / Providers**, keep email/password and **Allow new users to sign up** enabled. Turn **Confirm Email** off for the immediate signup flow used by this prototype.
4. From the `Web` directory, apply the checked-in migration with the CLI:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push --dry-run
   npx supabase db push
   npx supabase migration list
   ```

   Find the project ref in the project dashboard URL or **Project Settings → General**. The CLI may prompt for the database password. Enter it in the prompt, not in chat or a shell command. On a fresh project, the dry run should show `20261028064653_owner_cashflow_schema.sql`, `20261028130337_business_manager_access.sql`, `20261029033112_enable_business_realtime.sql`, and `20261029034501_obligation_date_and_corrections.sql` before you apply them.

5. Open `http://localhost:3000/login`, choose **Buat akun**, enter the owner's email and a new password, and create the business. Add a test transaction and confirm it remains after a reload.
6. As the owner, open **Akses**, create an invitation code, and give it directly to the manager. The manager creates a separate account, selects **Punya kode undangan** during setup, and enters the code. The code works once and expires after seven days. The owner can cancel an unused code or remove a manager from **Akses**.

Use a different password from any one pasted into a chat or log. To add another business owner, use **Buat akun** with a different email address and create a separate business. Email confirmation and password recovery by email require custom SMTP for addresses outside the Supabase project team; set that up before enabling those flows. [Supabase Auth configuration](https://supabase.com/docs/guides/auth/general-configuration), [SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp)

The migrations create `businesses`, `transactions`, `obligations`, `business_members`, and `business_invites` with row level security. Owners control settings and access; managers can record/correct transactions and obligations, record payments, and read the shared dashboard. The projection page is owner-only. Invitation codes are stored only as hashes. The third migration publishes business changes to Supabase Realtime so open pages update across accounts; the app also refreshes on navigation, tab focus, and periodically. The fourth migration adds a separate obligation date, backfills existing records from their creation date in Jakarta time, and prevents corrections below payments already recorded. There is no demo-data import: a new business starts empty.

For deployment, set the same environment variables in Vercel with `NEXT_PUBLIC_SITE_URL` set to the deployed origin. Review the email confirmation and account recovery policy before using real business data.
