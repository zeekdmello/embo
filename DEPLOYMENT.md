# Putting Embo on the web — step by step

Recommended setup, using the GitHub Student Developer Pack:

```
 Browser ──► https://www.embo.tech   (.TECH domain, free for 1 year)
                 │
                 ▼
          Heroku app, Basic dyno     (covered by the $13/month student credit, always on)
             ├─ Express API          /api/...
             └─ React build          everything else
                 │
                 ▼
          MongoDB Atlas, M0 cluster  (free; you also have $50 credit if you ever need more)
```

You need: **GitHub**, **MongoDB Atlas**, **Heroku** (student credit activated), and optionally your **.TECH** domain.
Time: about 30 minutes.

> The project already contains everything Heroku needs: a `Procfile` (`web: npm start`), a Node version in
> `package.json`, and `build` / `start` scripts. You don't need to change any code.

---

## Step 1 — Put the code on GitHub

1. Go to https://github.com/new and create an **empty** repository named `embo`. You can make it **Private**; Heroku
   can still deploy it. Don't add a README, .gitignore or licence.
2. Open a terminal in the project folder (`C:\Users\zeekd\Zeek WorkSpace\smart-roster`) and run these one at a time:

```bash
git init
```

```bash
git add .
```

```bash
git commit -m "Embo - System management (MERN)"
```

```bash
git branch -M main
```

```bash
git remote add origin https://github.com/<your-username>/embo.git
```

```bash
git push -u origin main
```

> `.gitignore` already keeps out `node_modules`, the build folders, `demo-video/` and **`server/.env`**.
> Never commit `.env` files: they hold your database password.

---

## Step 2 — Create the database (MongoDB Atlas)

1. Log in at https://cloud.mongodb.com.
2. **Create a cluster** and choose **M0 (Free)**. Pick a region (e.g. AWS Mumbai `ap-south-1`). Click **Create**.
3. **Database Access → Add New Database User**, e.g. `embo-app`, with an auto-generated password. **Copy the password.**
4. **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`). Heroku's servers don't have fixed
   IP addresses, so this is required.
5. Click **Database → Connect → Drivers** and copy the connection string, then:
   - put your password in place of `<password>`
   - add the database name **`embo`** right after `.mongodb.net/`

   ```
   mongodb+srv://embo-app:YOUR_PASSWORD@cluster0.abcde.mongodb.net/embo?retryWrites=true&w=majority
   ```
   If the password contains `@ : / ? # %`, URL-encode those characters (e.g. `@` → `%40`).

That final string is your **`MONGODB_URI`**. Keep it private.

> **Student credit ($50):** the M0 cluster is free, so you don't need the credit now. Keep the promo code; if you
> upgrade later, apply it under **Organization → Billing → Apply Credit**.

---

## Step 3 — Deploy on Heroku

### 3a. Create the app
1. Log in at https://dashboard.heroku.com. Under **Account settings → Billing**, check that the student credit shows.
2. Click **New → Create new app**.
   - **App name:** e.g. `embo-roster`. This becomes `https://embo-roster-xxxx.herokuapp.com`.
   - **Region:** United States or Europe (either is fine).
3. Click **Create app**.

### 3b. Add the settings (Config Vars)
Go to **Settings → Reveal Config Vars** and add:

| KEY | VALUE |
|---|---|
| `MONGODB_URI` | your Atlas string from Step 2 |
| `SEED_ON_EMPTY` | `true` |

Heroku sets `PORT` and `NODE_ENV=production` itself. Don't add them.

### 3c. Connect GitHub and deploy
1. Open the **Deploy** tab and set **Deployment method** to **GitHub**. Click **Connect to GitHub** and authorise.
2. Search for your `embo` repo and click **Connect**.
3. Under **Automatic deploys**, choose `main` and click **Enable Automatic Deploys**. From now on, every push updates the site.
4. Under **Manual deploy**, click **Deploy Branch** to do the first deploy now.

The build log should show `npm install`, then `npm run build` (React + server), then `Build succeeded`. It takes about 2–4 minutes.

### 3d. Choose the always-on dyno
Go to **Resources → (pencil icon) → Basic** and save. This is roughly $7/month, which the $13/month student credit covers.
Basic dynos **don't sleep**, so the site is always instant. Eco dynos are cheaper but sleep after 30 minutes without visits.

### 3e. Open it
Click **Open app** (top right).
- On the first start the database is empty, so Embo **loads the sample data automatically**. Press **Generate roster**.
- Check `https://<your-app>.herokuapp.com/api/health`. It should return `{"ok":true,"db":"connected",…}`.
- Make an edit and refresh the page. It should still be there, because it's saved in MongoDB.

**Logs**, if something goes wrong: **More → View logs** in the dashboard.

<details>
<summary>Prefer the command line? (Heroku CLI)</summary>

Install the CLI from https://devcenter.heroku.com/articles/heroku-cli, then run these from the project folder:

```bash
heroku login
```

```bash
heroku create embo-roster
```

```bash
heroku config:set MONGODB_URI="mongodb+srv://embo-app:YOUR_PASSWORD@cluster0.abcde.mongodb.net/embo?retryWrites=true&w=majority"
```

```bash
git push heroku main
```

```bash
heroku ps:type web=basic
```

```bash
heroku open
```

```bash
heroku logs --tail
```
</details>

---

## Step 4 — Use your own domain (.TECH)

Example domain: `embo.tech`. Use whatever you registered.

1. **Heroku:** go to **Settings → Domains → Add domain** and enter **`www.embo.tech`**. Heroku shows a **DNS target**
   like `something-1234.herokudns.com`. Copy it.
2. **Your domain's DNS panel** (get.tech / your registrar → *Manage DNS*):
   - Add a **CNAME** record: Host `www` → Value `something-1234.herokudns.com`.
   - For the bare `embo.tech` (no www): if the panel offers **ALIAS/ANAME** records, point `@` to the same target and
     also add `embo.tech` in Heroku. Otherwise use the panel's **URL forwarding** to send `embo.tech` →
     `https://www.embo.tech`.
3. **HTTPS:** on Basic dynos Heroku issues the certificate automatically (**Settings → SSL Certificates → Automatic
   Certificate Management**). Allow 10–60 minutes after DNS starts working.
4. Visit **https://www.embo.tech**. 🎉

DNS changes can take anywhere from a few minutes to a few hours to spread.

---

## Step 5 — Updating the live site

Push to `main`; Heroku rebuilds automatically:

```bash
git add . && git commit -m "Describe your change" && git push
```

To reload the sample data on the live database, use **Setup → Rules & data → Reset to sample data** in the app.

---

## Alternatives

**Render (free, no card):** **New → Blueprint** → pick the repo (`render.yaml` is included) → paste `MONGODB_URI`. The
free plan sleeps after about 15 minutes without visits, so the first request then takes 30–50 seconds.

**React on Vercel + API on Heroku:** set `CLIENT_ORIGIN=https://<your-app>.vercel.app` on Heroku. On Vercel use root
directory `client`, build `npm run build`, output `dist`, and env `VITE_API_URL=https://<your-heroku-app>.herokuapp.com`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App shows **"Can't reach the Embo server"** | Open `/api/health`, then check the Heroku logs. Usually `MONGODB_URI` is wrong or Atlas Network Access is missing `0.0.0.0/0`. |
| Log: `MongoServerError: bad auth` | Wrong password in `MONGODB_URI`, or special characters not URL-encoded. |
| Log: `querySrv ENOTFOUND` | Typo in the cluster address. Copy it again from Atlas. |
| Log: `H10 App crashed` | Open the logs just above it; the real error (usually the database connection) is printed there. |
| Build fails on `tsc` / `esbuild` | Make sure the repo includes `package-lock.json` and the `client`, `server`, `shared` folders, then redeploy. |
| Domain shows a Heroku error page | The domain isn't added under **Settings → Domains**, or the CNAME points to the wrong target. |
| The dot next to "All changes saved" is red | The API rejected a save. Hover over it for the reason. |
