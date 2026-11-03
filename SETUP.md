# Emphile Engineering Services: website, CRM and ERP

- `index.html` is the public website. Its enquiry form saves new leads into the CRM.
- `portal/` is the staff back office (sign in at `portal/login.html`):
  Dashboard, CRM (leads, clients), Jobs & billing (jobs, quotes, invoices, payments),
  Inspections (EICR and certificate tracking, next-due alerts), Staff & finance (staff, rota, expenses).
- `supabase/schema.sql` creates the database. `config.js` connects the site to it.

## One-time setup

1. Create a **new** Supabase project for Emphile Engineering (do not reuse the Cleaning Solutions project).
   Note its project ref (the code in the dashboard address bar).
2. In that project, open SQL Editor and run `supabase/schema.sql`.
3. Authentication > Users > Add user: create your login (email + password).
4. Run this in the SQL Editor to make yourself an admin (use your login email):
   `update public.profiles set is_admin = true where email = 'YOUR-LOGIN-EMAIL';`
5. Project Settings > API: copy the Project URL and the **publishable (anon)** key into `config.js`.
   Never paste the secret / service_role key anywhere in this repo.
6. Commit and push, then sign in at `/portal/login.html`.
7. On the dashboard, fill in business name, address, VAT number, payment details and terms.
   They stay blank until you do, and print on quotes and invoices.

## Notes

- Only logged-in admins can read or change data. The public site can only add new leads.
- VAT rate defaults to 0% on quotes and invoices; set it per document.
- Hosting: GitHub Pages works (Settings > Pages > deploy from `main`, root).
