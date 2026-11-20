import feedparser
import json
import os
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from fetch_imf_ilo import fetch_imf_ilo_items

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
  "https://api.oecd.org/webcms/search/rss?siteName=oecd&interfaceLanguage=en&hiddenFacets=oecd-search-config-pillars%3Apublications&facets=oecd-languages%3Aen",
  "https://www.scmp.com/rss/328461/feed",
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362"
]


def _pub_ts(item):
    """把 RSS 的 pubDate 字符串（如 "Tue, 17 Nov 2026 12:59:46 +0000"）
    解析成真正的时间对象，供排序使用。

    注意：绝对不能直接对字符串排序——字符串比较会先比 "Tue"/"Wed" 这些
    星期名，导致 10 月的稿排到 11 月前面，同一星期几的稿全部挤在一起。
    """
    try:
        dt = parsedate_to_datetime(item.get("pubDate") or "")
    except (TypeError, ValueError, AttributeError):
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def fetch_all_feeds():
    all_items = []
    for url in FEEDS:
        try:
            feed = feedparser.parse(url)
            source_name = feed.feed.get('title', url)

            for entry in feed.entries[:30]:
                title = entry.get('title', '无标题')
                link = entry.get('link', '#')
                if not title or link == '#':
                    continue
                all_items.append({
                    "title": title,
                    "link": link,
                    "pubDate": entry.get('published', entry.get('updated', '')),
                    "author": entry.get('author', ''),
                    "description": entry.get('summary', ''),
                    "source": source_name
                })
            print(f"✅ 成功抓取: {source_name}（{len(feed.entries[:30])} 条）")
        except Exception as e:
            print(f"❌ 抓取失败: {url} - {str(e)}")

    # ══════════════════════════════════════════════════════
    #  IMF / ILO / 世界银行 / UNCTAD 专用抓取
    #  这四家没有可用的官方 RSS，统一由 fetch_imf_ilo.py 处理。
    #  失败不影响主流程，其余源照常输出。
    # ══════════════════════════════════════════════════════
    try:
        extra = fetch_imf_ilo_items()
        all_items.extend(extra)
        print(f"✅ 机构专用抓取（IMF/ILO/世行/UNCTAD）: 共 {len(extra)} 篇")
    except Exception as e:
        print(f"❌ 机构专用抓取失败（不影响其他源）: {e}")

    # 按链接去重
    seen = set()
    unique_items = []
    for item in all_items:
        if item['link'] not in seen:
            seen.add(item['link'])
            unique_items.append(item)

    # 按真实时间倒序（修复原来按字符串排序导致的乱序）
    unique_items.sort(key=_pub_ts, reverse=True)

    with open('rss-data.json', 'w', encoding='utf-8') as f:
        json.dump(unique_items, f, ensure_ascii=False, indent=2)
    print(f"🎉 成功汇总 {len(unique_items)} 篇文章到 rss-data.json")


if __name__ == "__main__":
    fetch_all_feeds()
