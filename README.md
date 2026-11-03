# Real or Onion

A true/false quiz: is the headline from a real news outlet, or from *The Onion*?

Satire comes from The Onion's RSS feed; real headlines come from
[r/nottheonion](https://www.reddit.com/r/nottheonion/) and UPI Odd News.
Headlines and images belong to their publishers, and each card links to the original article.

## Refreshing the headlines

A GitHub Actions workflow (`.github/workflows/refresh-headlines.yml`) runs every Monday
around noon Eastern, adds any new headlines to the bank, and commits them. You can also
run it by hand from the Actions tab, or locally:

```
python fetch_headlines.py --onion-pages 5
```

This rewrites `data/questions.js`. Commit and push it to update the live site.

## Running locally

Open `index.html` directly, or run `python -m http.server` and visit http://localhost:8000.
