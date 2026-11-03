"""Builds the question bank for Real or Onion.

Pulls satire headlines from The Onion's RSS feed and real headlines from
r/nottheonion (real news that sounds fake) and UPI Odd News, grabs an image
for each, and writes data/questions.js for the site to load.

Usage: python fetch_headlines.py [--onion-pages 3] [--no-images]
"""

import argparse
import concurrent.futures
import html
import json
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

UA = "Mozilla/5.0 (RealOrOnion quiz; personal project)"
OUT = Path(__file__).parent / "data" / "questions.js"
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "media": "http://search.yahoo.com/mrss/",
}
ONION_SKIP = {"Cartoons", "Explainer", "American Voices", "Commentary", "Opinion",
              "Editorial", "Infographic", "Quiz", "Horoscopes"}
SMALL_WORDS = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "nor",
               "of", "on", "or", "the", "to", "vs", "via"}


def get(url, timeout=12, retries=3):
    for attempt in range(retries):
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(5 * (attempt + 1))
                continue
            raise
    return ""


def og_image(url):
    try:
        page = get(url, timeout=8, retries=1)
    except Exception:
        return None
    m = (re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)', page)
         or re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', page))
    return html.unescape(m.group(1)) if m else None


def title_case(text):
    # The Onion capitalizes every word, most real outlets don't; normalizing
    # removes that giveaway.
    words = text.split(" ")
    out = []
    for i, w in enumerate(words):
        if i and w.lower() in SMALL_WORDS:
            out.append(w.lower() if w.islower() or w.istitle() else w)
        elif w[:1].isalpha():
            out.append(w[0].upper() + w[1:])
        else:
            # Handle words that start with quotes or brackets, e.g. 'too
            out.append(re.sub(r"^(\W*)(\w)", lambda m: m.group(1) + m.group(2).upper(), w))
    return " ".join(out)


def clean(text):
    text = html.unescape(text or "").strip()
    return re.sub(r"\s+", " ", text)


def fetch_onion(pages):
    items = []
    for page in range(1, pages + 1):
        url = "https://theonion.com/feed/" + (f"?paged={page}" if page > 1 else "")
        try:
            root = ET.fromstring(get(url))
        except Exception as e:
            print(f"  onion page {page} failed: {e}")
            break
        for it in root.iter("item"):
            # Cartoons, explainers, and opinion pieces aren't news-style headlines
            cats = {c.text for c in it.findall("category")}
            if cats & ONION_SKIP:
                continue
            items.append({
                "title": clean(it.findtext("title")),
                "url": it.findtext("link"),
                "date": it.findtext("pubDate"),
                "source": "The Onion",
                "real": False,
            })
    return items


def fetch_nottheonion():
    items = []
    for period in ("month", "year"):
        url = f"https://www.reddit.com/r/nottheonion/top/.rss?t={period}"
        try:
            root = ET.fromstring(get(url))
        except Exception as e:
            print(f"  r/nottheonion ({period}) failed: {e}")
            continue
        for entry in root.findall("atom:entry", NS):
            content = entry.findtext("atom:content", default="", namespaces=NS)
            # The [link] anchor in the post body points at the real article.
            m = re.search(r'<a href="([^"]+)">\[link\]</a>', html.unescape(content))
            if not m or "reddit.com" in m.group(1):
                continue
            article = m.group(1)
            items.append({
                "title": clean(entry.findtext("atom:title", namespaces=NS)),
                "url": article,
                "date": entry.findtext("atom:updated", namespaces=NS),
                "source": re.sub(r"^www\.", "", article.split("/")[2]),
                "real": True,
            })
        time.sleep(2)
    return items


def fetch_upi():
    items = []
    try:
        root = ET.fromstring(get("https://rss.upi.com/news/odd_news.rss"))
    except Exception as e:
        print(f"  UPI failed: {e}")
        return items
    for it in root.iter("item"):
        if "odd news" in (it.findtext("title") or "").lower():
            continue  # roundup posts, not single stories
        media = it.find("media:content", NS)
        items.append({
            # "Watch:" / "Look:" prefixes would give the answer away
            "title": re.sub(r"^(Watch|Look|Listen):\s*", "", clean(it.findtext("title"))),
            "url": it.findtext("link"),
            "date": it.findtext("pubDate"),
            "source": "UPI",
            "real": True,
            "image": media.get("url") if media is not None else None,
        })
    return items


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--onion-pages", type=int, default=3)
    ap.add_argument("--no-images", action="store_true")
    args = ap.parse_args()

    print("Fetching The Onion...")
    onion = fetch_onion(args.onion_pages)
    print(f"  {len(onion)} headlines")
    print("Fetching r/nottheonion...")
    nto = fetch_nottheonion()
    print(f"  {len(nto)} headlines")
    print("Fetching UPI Odd News...")
    upi = fetch_upi()
    print(f"  {len(upi)} headlines")

    seen, questions = set(), []
    for q in onion + nto + upi:
        key = q["title"].lower()
        if not q["title"] or key in seen:
            continue
        seen.add(key)
        q["original_title"] = q["title"]
        q["title"] = title_case(q["title"])
        q.setdefault("image", None)
        questions.append(q)

    if not args.no_images:
        need = [q for q in questions if not q["image"]]
        print(f"Looking up images for {len(need)} articles...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            for q, img in zip(need, pool.map(lambda q: og_image(q["url"]), need)):
                q["image"] = img

    OUT.parent.mkdir(exist_ok=True)
    payload = {"generated": time.strftime("%Y-%m-%d %H:%M"), "questions": questions}
    # A .js file (not .json) so index.html works when opened straight from disk.
    OUT.write_text("window.QUESTION_BANK = " + json.dumps(payload, indent=1, ensure_ascii=False) + ";\n",
                   encoding="utf-8")
    real = sum(q["real"] for q in questions)
    with_img = sum(bool(q["image"]) for q in questions)
    print(f"Wrote {len(questions)} questions ({real} real, {len(questions) - real} Onion, "
          f"{with_img} with images) to {OUT}")


if __name__ == "__main__":
    main()
