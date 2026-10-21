import feedparser
import json
import os
from datetime import datetime

FEEDS = [
  "https://www.atlanticcouncil.org/feed/",
  "http://project-syndicate.org/rss",
  "https://www.aei.org/feed/",
  "https://www.wto.org/library/rss/latest_news_e.xml",
  "https://www.foreignaffairs.com/rss.xml",
  "https://www.piie.com/rss/update.xml",
  "https://amro-asia.org/feed/",
  "https://cepr.org/rss/vox-content",
  "https://www.bu.edu/gdp/feed/",
  "https://think.ing.com/rss/",
  "https://www.economist.com/finance-and-economics/rss.xml",
  "https://patfang0105.github.io/my-rss-blog/custom_feed.xml",
  "https://www.ft.com/china?format=rss",
  "https://www.ft.com/opinion?format=rss",
  "https://feeds.content.dowjones.io/public/rss/RSSOpinion",
  "https://feeds.content.dowjones.io/public/rss/RSSWorldNews",
  "https://feeds.bloomberg.com/markets/news.rss",
  "https://www.mckinsey.com/insights/rss",
  "https://www.chathamhouse.org/path/83/feed.xml",
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
  "https://www.oxfordeconomics.com/feed/",
  "https://api.oecd.org/webcms/search/rss?siteName=oecd&interfaceLanguage=en&hiddenFacets=oecd-search-config-pillars%3Apublications&facets=oecd-languages%3Aen"
]

def fetch_all_feeds():
    all_items = []
    for url in FEEDS:
        try:
            feed = feedparser.parse(url)
            source_name = feed.feed.get('title', url)
            
            for entry in feed.entries[:30]:
                all_items.append({
                    "title": entry.get('title', '无标题'),
                    "link": entry.get('link', '#'),
                    "pubDate": entry.get('published', entry.get('updated', '')),
                    "author": entry.get('author', ''),
                    "description": entry.get('summary', ''),
                    "source": source_name
                })
            print(f"✅ 成功抓取: {source_name}")
        except Exception as e:
            print(f"❌ 抓取失败: {url} - {str(e)}")
    
    seen = set()
    unique_items = []
    for item in all_items:
        if item['link'] not in seen:
            seen.add(item['link'])
            unique_items.append(item)
            
    unique_items.sort(key=lambda x: x['pubDate'], reverse=True)
    
    with open('rss-data.json', 'w', encoding='utf-8') as f:
        json.dump(unique_items, f, ensure_ascii=False, indent=2)
    print(f"🎉 成功汇总 {len(unique_items)} 篇文章到 rss-data.json")

if __name__ == "__main__":
    fetch_all_feeds()
