# Release 0.2.9: post-deploy checklist (Story 4.8)

The deploy went out on 2026-10-08. Story 4.8 stays at `review` in `sprint-status.yaml` until the OG debugger result is recorded in its spec (`spec-4-8-prerendered-series-pages-og-meta-route-shells-sitemap.md` → Implementation Notes).

Test series: the 2016 Finals flagship, `06715a85-ec33-46a4-8383-d058055eefe6`.

## Status

| # | Check | Status |
|---|---|---|
| 1 | Cold deep-link GET | **ok, 2026-10-08** (agent). The 301 keeps the query, then 200 |
| 2 | Fetch with JavaScript off | **ok, 2026-10-08** (agent). Headline and absolute `og:image` in the HTML; no Game 7 score |
| 3 | Sitemap 200 | **ok, 2026-10-08** (agent). 188 `<loc>` entries |
| — | Full probe against the live site | **GREEN, 2026-10-08** (agent), 92 rows |
| 4 | Platform OG debugger | **ok, 2026-10-08** (owner, Facebook). Tags as emitted; only `fb:app_id` warned (expected) |
| 5 | Search Console sitemap submission | **owed: you**, then the agent adds the verification file |

## 4. OG debugger: does the card unfurl?

Paste these URLs, one at a time, into the **Facebook Sharing Debugger** (https://developers.facebook.com/tools/debug/; needs a Facebook login) and click **Debug**. Use the exact URLs below, **with the trailing slash**.

| What it tests | URL |
|---|---|
| Flagship preview (the main one) | `https://ujsolon.github.io/predictgame7/series/06715a85-ec33-46a4-8383-d058055eefe6/` |
| Flagship result page | `https://ujsolon.github.io/predictgame7/series/06715a85-ec33-46a4-8383-d058055eefe6/result/` |
| A share link as 4.4 will produce it | `https://ujsolon.github.io/predictgame7/series/06715a85-ec33-46a4-8383-d058055eefe6/?method=elo&utm_source=share` |
| An app-route shell (fallback card) | `https://ujsolon.github.io/predictgame7/predict/` |

What to check for each:
- **Title:** "Cleveland Cavaliers vs Golden State Warriors — Game 7, 2016 Finals" (the shell shows "PredictGame7 — Where data meets playoff drama").
- **Description:** "Every Game 7 has a history. Decode the biggest game in basketball on PredictGame7."
- **Image:** the 1200×630 card, with both teams and logos and "2016 Finals · Game 7". It shows **no score and no winner**.
- **Warnings:** a "missing fb:app_id" warning is normal for a site without a Facebook app; ignore it. Any other warning, such as an image that can't be fetched or a wrong size, is worth reporting.
- If the debugger shows an old or empty preview, click **Scrape Again**, because Facebook caches.

Alternatives: LinkedIn Post Inspector (https://www.linkedin.com/post-inspector/), or paste the link into a draft post on X or into a Slack or Discord message and look at the unfurl without sending.

**Record it:** tell the agent the date, the platform and what you saw. It adds the result to the 4.8 spec and moves 4.8 to `done`.

## 5. Search Console sitemap submission

Crawlers only read `robots.txt` at the host root (`https://ujsolon.github.io/robots.txt`). Ours is at `/predictgame7/robots.txt`, so nothing finds the sitemap automatically.

1. Open https://search.google.com/search-console and add a property.
2. Choose **URL prefix** (not Domain) and enter `https://ujsolon.github.io/predictgame7/`.
3. Verification: choose **HTML file**. Google gives you a file named like `google1234abcd.html`. Give the file, or just its name and contents, to the agent. It goes into `public/` and ships on the next `npm run deploy`. Then click **Verify** in Search Console.
4. Once verified: **Sitemaps** → enter `sitemap.xml` → **Submit**.
5. Optional: Bing Webmaster Tools → import from Search Console.

## Re-running checks 1–3 yourself (PowerShell)

Windows PowerShell 5.1 aliases `curl` to `Invoke-WebRequest`, which is why `curl -sI` failed. Call **`curl.exe`** explicitly, and use `Select-String` in place of `grep`. Replace nothing; the id is filled in.

```powershell
$B  = "https://ujsolon.github.io/predictgame7"
$ID = "06715a85-ec33-46a4-8383-d058055eefe6"

# 1. Cold deep link: expect "301" with a Location ending in /?method=elo, then a final "200"
curl.exe -sI "$B/series/$ID`?method=elo" | Select-String "^HTTP|^Location"
curl.exe -sIL "$B/series/$ID`?method=elo" | Select-String "^HTTP"

# 2. JavaScript off: expect og:image ending in og/$ID.png and the headline in the HTML
curl.exe -sL "$B/series/$ID/" | Select-String -Pattern 'og:image" content="[^"]+"|id="series-headline"[^>]*>[^<]+' -AllMatches | ForEach-Object { $_.Matches.Value }

# 3. Sitemap: expect "200" and 188
curl.exe -sI "$B/sitemap.xml" | Select-String "^HTTP"
(curl.exe -s "$B/sitemap.xml" | Select-String -Pattern "<loc>" -AllMatches).Matches.Count

# Everything at once (headless Chrome): expect "GREEN: every deep-link row held."
node scripts/probe-deep-links.mjs "$B/"
```

The backtick before `?` stops PowerShell from reading `$ID?` as part of the variable name. These exact commands were run in Windows PowerShell 5.1 on 2026-10-08. They printed `301` with the `/?method=elo` Location, then `200`, the `og:image` URL and the headline, `200`, and `188`.
