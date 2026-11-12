# Going live

This is the exact path from the finished site to a live deployment. Nothing here is
guesswork — every step was checked against the real GitHub repository, the real Vercel
project and the real live site while preparing it.

---

## What is already in place

| | Status |
|---|---|
| The code | Finished and committed — 21 commits on `feature/concept-b-redesign`, pull request #1 |
| The GitHub remote | `https://github.com/valtorix-infotech/Valtorix-Infotech-` |
| The Vercel project | `valtorixinfotech-1446`, live at `https://valtorixinfotech-1446.vercel.app` |
| The Vercel project is connected to the GitHub repo | **Yes** — the live site currently serves exactly what `origin/main` contains (the old `webgl-bg.js`, the old title). Pushing to `main` deploys it. |
| `GMAIL_USER` and `GMAIL_APP_PASSWORD` on the Vercel project | **Already set** — the live endpoint answers `200 {ok:true}` rather than `500 mail-not-configured` |
| The domain | No custom domain yet; the `*.vercel.app` address is the canonical one and all 37 references to it in the markup already point there |
| CI | `.github/workflows/qa.yml` — 11 gates + the Lighthouse gate, running on every push and pull request |

**Nothing needs reconfiguring on Vercel. The only missing piece is push access.**

---

## Step 1 — get push access (one action, by the org owner)

`Rakesh-7989` can read the repository but cannot write to it. A push was refused:

```
remote: Permission to valtorix-infotech/Valtorix-Infotech-.git denied to Rakesh-7989.
fatal: unable to access '...': The requested URL returned error: 403
```

The org owner (`valtorix-infotech`) does one of these:

**Option A — invite to the repository** (smallest change)

1. Open <https://github.com/valtorix-infotech/Valtorix-Infotech-/settings/access>
2. **Add people** → type `Rakesh-7989` → role **Write**
3. Accept the invitation from the `Rakesh-7989` account

**Option B — invite to the organisation**

1. Open <https://github.com/orgs/valtorix-infotech/people>
2. **Invite people** → type `Rakesh-7989` → role **Write** (or Owner)

Either works. Option B is better if more people will push to it.

> **Why not a new repository under your own account?** It would work, but the Vercel
> project is already connected to *this* repository, and the canonical URL,
> `sitemap.xml`, `robots.txt`, the JSON-LD and the `SITE_URL` default all point at
> `valtorixinfotech-1446.vercel.app`. A new repository means a new Vercel project on a
> different address, and every one of those references would have to change.

---

## Step 2 — push and open a pull request

The push goes through a pull request rather than straight to `main`, so nothing deploys until
CI is green.

```bash
cd "C:\Users\boyap\Downloads\Valtorix Info Tech Website\repo"
git push -u origin feature/concept-b-redesign
```

Then open the pull request:

```bash
gh pr create --base main --head feature/concept-b-redesign \
  --title "Rebuild the site around the new VALTORIX identity, with a persistent 3D stage" \
  --body-file docs/PR_BODY.md
```

`main` is an ancestor of the work, so the merge is a **fast-forward** — nothing is
overwritten and no `--force` is needed:

```
main                          302a247  (the old site)
feature/concept-b-redesign    ee04b98  (+21 commits, the new site)
```

Watch the gates:

```bash
gh pr checks 1 --watch
```

Then merge:

```bash
gh pr merge 1 --squash --delete-branch
```

Vercel sees the merge to `main` and starts the deployment. GitHub Actions runs once more on
the merge commit.

> **If the push is refused with `GH007: Your push would publish a private email address`**,
> the commits carry an email that is private on your GitHub account. GitHub blocks that on
> public repositories. The fix is to author the commits with the account's noreply address:
>
> ```bash
> git config user.email "281008307+Rakesh-7989@users.noreply.github.com"
> git config user.name "Rakesh-7989"
>
> FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --env-filter \
>   'export GIT_AUTHOR_EMAIL="281008307+Rakesh-7989@users.noreply.github.com";
>    export GIT_COMMITTER_EMAIL="281008307+Rakesh-7989@users.noreply.github.com";' \
>   -- "origin/main..feature/concept-b-redesign"
> ```
>
> That rewrites only the new commits — `origin/main` is untouched, so the merge stays a
> fast-forward. Check that nothing but the author metadata changed:
>
> ```bash
> git diff --stat backup/before-rewrite feature/concept-b-redesign   # must be empty
> ```
>
> Alternatively, make the address public at <https://github.com/settings/emails> — but the
> noreply address publishes nothing at all and is the better default for a public repository.

---

## Step 3 — check it went live

```bash
# the live site is serving the new build
curl -I https://valtorixinfotech-1446.vercel.app/

# the title changed
curl -s https://valtorixinfotech-1446.vercel.app/ | grep -o "<title>[^<]*</title>"

# the 3D stage is deployed
curl -s https://valtorixinfotech-1446.vercel.app/ | grep -c "stage3d"
```

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

   ```bash
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
| The push is refused again | The invitation was not accepted, or the role is Read. Check <https://github.com/valtorix-infotech/Valtorix-Infotech-/settings/access> |
| The Vercel deployment failed | **Project → Deployments → the failed one → Build Logs**. The most likely cause is `npm ci --omit=dev` failing; run it locally to see |
| The site deploys but the form returns 500 | `GMAIL_USER` / `GMAIL_APP_PASSWORD` are not set on the Vercel project. **Project → Settings → Environment Variables** |
| The form returns 200 but no email arrives | Gmail is rejecting it. The owner notification is the one to check first |
| CI is red | Open the run on GitHub — each of the 11 gates names itself in the step list |

---

## What is deliberately not automated

- **The deployment itself.** Vercel's Git integration does it, and that is the safer
  route: the same push that runs CI is the push that deploys.
- **The live email round trip.** It needs a real inbox, and it is the one test that
  proves the whole thing end to end. It is step 4, and it takes thirty seconds.
