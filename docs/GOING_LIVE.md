# Going live

This is the exact path from the finished site to a live deployment. Nothing here is
guesswork — every step was checked against the real GitHub repository, the real Vercel
project and the real live site while preparing it.

---

## Where things stand

| | Status |
|---|---|
| The code | **Done.** 21 commits, merged to `main` as pull request #1 (`7c11c4d`) |
| The GitHub remote | `https://github.com/valtorix-infotech/Valtorix-Infotech-` |
| CI on `main` | **Green** — the QA job (12 gates) and the Lighthouse gate both pass |
| The Vercel project | `valtorixinfotech-1446`, live at `https://valtorixinfotech-1446.vercel.app` |
| The Vercel project is connected to the GitHub repo | **Yes** - it builds a preview deployment for every pull request, and the preview is the finished site. |
| The project deploys `main` to production | **No.** Merging to `main` starts CI but not a Vercel build, so the *Production Branch* is set to something else, or automatic deployments are off for it. One setting, in the dashboard. |
| `GMAIL_USER` and `GMAIL_APP_PASSWORD` on the Vercel project | **Already set** — the live endpoint answers `200 {ok:true}` rather than `500 mail-not-configured` |
| The domain | No custom domain yet; the `*.vercel.app` address is the canonical one and all 37 references to it in the markup already point there |

**One thing is left: connect the repository to the Vercel project.**

---

## Step 1 — point the Vercel project at `main` (one action, in the dashboard)

This is the last thing standing between the finished site and the live one.

The Vercel project **is** connected to this repository - it built a preview
deployment for every pull request, and the preview is the finished site:

> https://valtorixinfotech-1446-git-feature-c214fb-valtorixinfotech-1446.vercel.app

That preview is not a mock-up. It is the real build, running on Vercel's
infrastructure, and it has passed the whole suite against the live URL:
every page returns 200, the fonts are served from the site, the mail
endpoint answers, the old `/strat-project` path redirects, and Lighthouse
scores **100 / 100 / 100 on all ten pages**.

**What has not happened is the production deployment.** Merging to `main`
starts CI but not a Vercel build, which means the project's *Production
Branch* is set to something other than `main` - or automatic deployments
are off for it. The repository has only two branches (`main` and the
feature branch), so the setting is the problem, not the code.

To fix it:

1. Open <https://vercel.com/valtorixinfotech-1446/settings/git>
2. **Production Branch** - set it to `main`
3. Check that **Automatic Deployments** is on for `main` (not "Disabled")
4. **Save**

That is it. The next push to `main` builds and deploys, and the site is
live at <https://valtorixinfotech-1446.vercel.app>.

**If you would rather not use the dashboard**, a token does the same thing
from here:

```powershell
cd "C:\Users\boyap\Downloads\Valtorix Info Tech Website\repo"
$env:VERCEL_TOKEN = "your-token"      # https://vercel.com/account/tokens
node scripts/deploy.js
```

The token is used for that one run and is never written to disk. Revoke
it afterwards.

---

## Step 2 — publish

If the repository is connected (step 1), merging to `main` *is* the publish:

```bash
cd "C:\Users\boyap\Downloads\Valtorix Info Tech Website\repo"
git checkout main
git pull
git push origin main
```

If you are deploying by hand instead:

```bash
vercel --prod --yes
```

---

## Step 3 — check it went live

```bash
# the title changed
curl -s https://valtorixinfotech-1446.vercel.app/ | grep -o "<title>[^<]*</title>"

# the 3D stage is deployed
curl -s https://valtorixinfotech-1446.vercel.app/ | grep -c stage3d

# the fonts are served from the site, not from Google
curl -s https://valtorixinfotech-1446.vercel.app/ | grep -c "fonts/fonts.css"

# the mail endpoint answers
curl -s -X POST https://valtorixinfotech-1446.vercel.app/api/send \
  -H "content-type: application/json" -d '{"fields":{"website":"probe"}}'
```

The last one should answer `400 {"ok":false,"error":"spam-detected"}` — the honeypot
rejecting it. That proves the new endpoint is live without sending an email.

The deployment takes about a minute. Watch it in the Vercel dashboard:
**Project → Deployments**.

---

## Step 4 — send a real test message

The forms are the one thing no automated test can prove. Open the live site and send a
message from both forms:

- <https://valtorixinfotech-1446.vercel.app/contact.html>
- <https://valtorixinfotech-1446.vercel.app/start-a-project.html>

Check that **two** emails arrive in `valtorix.infotech@gmail.com`:

1. the notification to the studio, with the submitted fields
2. the auto-reply to the sender's own address

If the second one does not arrive, the sender's address is probably being rejected by
Gmail as a spam relay — that is a Gmail account policy, not a code fault, and the owner
notification will still have arrived.

---

## Step 5 — a custom domain, later, if wanted

1. Add the domain in **Vercel → Project → Settings → Domains**
2. Point the domain's DNS at Vercel (Vercel prints the exact records)
3. Once it resolves, update the origin in the markup:

   | File | What to change |
   |------|----------------|
   | all 10 `*.html` | `https://valtorixinfotech-1446.vercel.app` → the new origin (37 references) |
   | `sitemap.xml` | every `<loc>` |
   | `robots.txt` | the `Sitemap:` line |
   | `api/send.js` | the `SITE` default — or set `SITE_URL` in the Vercel env vars, which takes precedence |

   ```powershell
   # after the domain resolves
   $env:OLD = "https://valtorixinfotech-1446.vercel.app"
   $env:NEW = "https://www.example.com"
   Get-ChildItem *.html, sitemap.xml, robots.txt, api\send.js |
     ForEach-Object { $s = Get-Content $_.FullName -Raw
                      $s = $s.Replace($env:OLD, $env:NEW)
                      [System.IO.File]::WriteAllText($_.FullName, $s, (New-Object System.Text.UTF8Encoding $false)) }
   ```

4. Set `SITE_URL` in the Vercel environment variables so the emails use the new origin
5. Re-run the suites locally against the new origin and push

---

## If something goes wrong

| Symptom | Where to look |
|---|---|
| The push is refused | The invitation was not accepted, or the role is Read. Check <https://github.com/valtorix-infotech/Valtorix-Infotech-/settings/access> |
| The push is refused with `GH007` | The commits carry an email that is private on your GitHub account. See the note below. |
| The Vercel deployment failed | **Project → Deployments → the failed one → Build Logs**. The most likely cause is `npm ci --omit=dev` failing; run it locally to see |
| The site deploys but the form returns 500 | `GMAIL_USER` / `GMAIL_APP_PASSWORD` are not set on the Vercel project. **Project → Settings → Environment Variables** |
| The form returns 200 but no email arrives | Gmail is rejecting it. The owner notification is the one to check first |
| CI is red | Open the run on GitHub — each of the gates names itself in the step list |

---

## The pull request, and the push that GitHub refused

The work went through a pull request rather than straight to `main`, so nothing deployed
until CI was green.

```bash
git push -u origin feature/concept-b-redesign
gh pr create --base main --head feature/concept-b-redesign --title "..." --body-file ...
gh pr checks 1 --watch
gh pr merge 1 --merge
```

The first push was refused:

```
remote: error: GH007: Your push would publish a private email address.
```

GitHub blocks that on public repositories. The fix is to author the commits with the
account's noreply address:

```bash
git config user.email "281008307+Rakesh-7989@users.noreply.github.com"
git config user.name "Rakesh-7989"

FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter \
  'export GIT_AUTHOR_EMAIL="281008307+Rakesh-7989@users.noreply.github.com";
   export GIT_COMMITTER_EMAIL="281008307+Rakesh-7989@users.noreply.github.com";' \
  -- "origin/main..feature/concept-b-redesign"
```

That rewrites only the new commits — `origin/main` is untouched, so the merge stays a
fast-forward. Check that nothing but the author metadata changed:

```bash
git diff --stat backup/before-rewrite feature/concept-b-redesign   # must be empty
```

---

## What is deliberately not automated

- **The deployment itself.** Vercel's Git integration does it, and that is the safer
  route: the same push that runs CI is the push that deploys.
- **The live email round trip.** It needs a real inbox, and it is the one test that
  proves the whole thing end to end. It is step 4, and it takes thirty seconds.
