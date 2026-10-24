"""Data for the news-sentiment demo.

Per-article scores only (no titles or text, which are copyrighted), plus TextBlob's word list so
the page can score a sentence in the browser.

    PYTHONPATH=../news-sentiment-analysis/src python _tools/make_sentiment_data.py path/to/cnbc_news.csv
"""
import json
import sys
from pathlib import Path


from news_sentiment import compare_groups, load_articles, score_articles

out = Path(__file__).resolve().parents[1] / "assets" / "data" / "sentiment.json"
scored = score_articles(load_articles(sys.argv[1]), "Trump")
articles = [{"d": r.date.strftime("%Y-%m-%d"), "m": int(r.mentions), "p": round(r.polarity, 3),
             "s": round(r.subjectivity, 3)} for r in scored.itertuples()]
tests = {
    "polarity_full": compare_groups(scored, "polarity"),
    "polarity_since_2015": compare_groups(scored, "polarity", start="2015-06-16"),
    "subjectivity_full": compare_groups(scored, "subjectivity"),
}
target = scored.loc[scored["mentions"], "target_polarity"]

# Export TextBlob's word list exactly as TextBlob loads it: averaged per word, plus the adverbs it
# derives from adjectives ("real" -> "really", "terrible" -> "terribly"). [polarity, subjectivity,
# intensity, is_modifier]; adverbs (RB) strengthen the next word ("very good").
from textblob.en import sentiment as tb_lexicon
tb_lexicon.load() if not len(tb_lexicon) else None
lexicon = {}
for form, senses in dict.items(tb_lexicon):
    p_, s_, i_ = senses[None]
    lexicon[form.lower()] = [round(p_, 4), round(s_, 4), round(i_, 3), int("RB" in senses)]

data = {"n": len(articles), "articles": articles,
        "tests": {k: {kk: (round(vv, 4) if isinstance(vv, float) else vv) for kk, vv in v.items()} for k, v in tests.items()},
        "target": {"mean": round(float(target.mean()), 4), "share_negative": round(float((target < 0).mean()), 3), "n": int(target.size)},
        "lexicon": lexicon}
out.write_text(json.dumps(data, separators=(",", ":")))
print(out, f"{out.stat().st_size/1024:.0f} KB", len(lexicon), "words")
