# -*- coding: utf-8 -*-
"""
fetch_imf_ilo.py —— 给没有官方 RSS 的机构（IMF / 国际劳工组织 ILO）专用抓取脚本。

为什么需要这个文件？
  · IMF 官网没有 RSS，且会拦截数据中心 IP，页面内容靠 JS 动态加载；
  · ILO 官网没有 RSS，且被 Cloudflare 人机验证保护。
  这个脚本用「多级回退」策略保证尽量抓到、绝不崩溃：

  IMF 通道：
    ① 普通请求抓 https://www.imf.org/en/News （GitHub 服务器 IP 有机会直接成功）
    ② 失败则用无头浏览器渲染后解析（需要已安装 playwright）
    ③ 再失败则用 Google News 的 site:imf.org 订阅兜底
  ILO 通道：
    ① 普通请求抓 https://www.ilo.org/news
    ② 被拦则用 Google News 的 site:ilo.org 订阅兜底

输出条目格式与 fetch_rss.py 完全一致：
    {"title", "link", "pubDate", "author", "description", "source"}
"""

import json
import re
import calendar
import requests
import feedparser

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

IMF_NEWS_URL = "https://www.imf.org/en/News"
ILO_NEWS_URL = "https://www.ilo.org/news"
# 只保留最近 N 天的条目，避免陈旧内容混入
KEEP_DAYS = 10

# IMF 文章链接形如 https://www.imf.org/en/news/articles/2026/10/07/pr26312-republic-of-madagascar
# 页面上链接是完整 URL，且锚文本自带「October 7, 2026标题」
IMF_LINK_RE = re.compile(
    r'<a\s+href="((?:https?://www\.imf\.org)?(/en/news/articles/(\d{4})/(\d{1,2})/(\d{1,2})/([a-z0-9\-]+)))"[^>]*>(.*?)</a>',
    re.I | re.S)
IMF_DATE_PREFIX_RE = re.compile(r'^\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}', re.I)


# ────────────────────────────  IMF  ────────────────────────────

def _imf_title_from_slug(slug: str) -> str:
    """把 IMF 链接尾部的 slug 还原成可读标题。
    例：pr26312-republic-of-madagascar-imf-executive-board... → Republic of Madagascar IMF Executive Board...
    """
    s = slug.lower()
    # 去掉开头的文件编号（pr26312- / pr-26312- / sp100726- / cf-... 等）
    s = re.sub(r'^((pr|sp|cf|nm|tr|blog)-?\d{3,6}-)', '', s)
    s = s.replace('-', ' ').strip()
    s = re.sub(r'\s+', ' ', s)
    # 单词首字母大写（缩写 imf/wto 等除外）
    words = []
    for w in s.split(' '):
        words.append(w.upper() if w in ('imf', 'wto', 'ai', 'weo', 'gfsr') else w.capitalize())
    return ' '.join(words)


def _imf_items_from_html(html: str):
    """从 IMF 页面 HTML 中解析出条目列表。
    锚文本通常形如「October 7, 2026Coming Soon: 2026 Annual Meetings Curtain Raiser」，
    自带日期与完整标题，优先用锚文本，缺失时回退到 slug 还原。
    """
    items = []
    seen = set()
    for m in IMF_LINK_RE.finditer(html):
        path, y, mo, d, slug, anchor = m.group(1), m.group(3), m.group(4), m.group(5), m.group(6), m.group(7)
        url = "https://www.imf.org" + path if path.startswith("/en") else path
        if url in seen:
            continue
        seen.add(url)
        # 清理锚文本：去内部标签、去前缀日期
        text = re.sub(r"<[^>]+>", "", anchor or "")
        text = re.sub(r"\s+", " ", text).strip()
        text = IMF_DATE_PREFIX_RE.sub("", text).strip()
        title = text if len(text) >= 10 else _imf_title_from_slug(slug)
        if not title:
            continue
        # 日期来自链接本身，绝不做推测
        pub = f"{calendar.month_abbr[int(mo)]}, {int(d):02d} {y} 08:00:00 GMT"
        items.append({
            "title": title,
            "link": url,
            "pubDate": pub,
            "author": "IMF",
            "description": title + "（IMF 官网新闻，自动采集）",
            "source": "IMF 国际货币基金组织",
        })
    return items


def _render_with_playwright(url: str, wait_ms: int = 6000):
    """用无头浏览器渲染页面（IMF 的内容是 JS 动态加载的）。装了 playwright 才可用。"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--no-sandbox", "--disable-gpu"])
            page = browser.new_page(user_agent=UA)
            page.goto(url, wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(wait_ms)
            html = page.content()
            browser.close()
            return html
    except Exception as e:
        print(f"   （浏览器渲染失败：{e}）")
        return None


def _google_news_items(site_domain: str, source_name: str, days: int = KEEP_DAYS):
    """Google News 兜底：订阅 site:domain 的最新收录，等价于该站的最新动态。"""
    url = (f"https://news.google.com/rss/search?q=site:{site_domain}"
           f"+when:{days}d&hl=en-US&gl=US&ceid=US:en")
    try:
        feed = feedparser.parse(url)
        items = []
        for entry in feed.entries[:20]:
            items.append({
                "title": entry.get("title", ""),
                "link": entry.get("link", ""),
                "pubDate": entry.get("published", entry.get("updated", "")),
                "author": entry.get("author", ""),
                "description": (entry.get("summary", "") or "")[:300],
                "source": source_name,
            })
        return items
    except Exception as e:
        print(f"   （Google News 兜底失败：{e}）")
        return []


def fetch_imf():
    print("▶ 抓取 IMF（无官方 RSS）…")
    # ① 普通请求
    try:
        r = requests.get(IMF_NEWS_URL, headers={"User-Agent": UA},
                         timeout=30, allow_redirects=True)
        items = _imf_items_from_html(r.text)
        if len(items) >= 5:
            print(f"   ✅ 普通请求成功，解析到 {len(items)} 条 IMF 内容")
            return items
        print(f"   （普通请求只解析到 {len(items)} 条，可能被拦截，尝试浏览器渲染…）")
    except Exception as e:
        print(f"   （普通请求失败：{e}，尝试浏览器渲染…）")
    # ② 无头浏览器
    html = _render_with_playwright(IMF_NEWS_URL)
    if html:
        items = _imf_items_from_html(html)
        if items:
            print(f"   ✅ 浏览器渲染成功，解析到 {len(items)} 条 IMF 内容")
            return items
    # ③ Google News 兜底
    items = _google_news_items("imf.org", "IMF 国际货币基金组织")
    print(f"   {'✅ Google News 兜底：' + str(len(items)) + ' 条' if items else '❌ IMF 三条通道均未取到'}")
    return items


# ────────────────────────────  ILO  ────────────────────────────

def _ilo_items_from_html(html: str):
    """从 ILO 新闻页 HTML 解析条目（若其主站可达）。"""
    if not HAS_BS4:
        return []
    if "Just a moment" in html or "challenge" in html.lower()[:3000]:
        return []  # Cloudflare 人机验证页
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for a in soup.select("a[href^='/news/']"):
        href = a.get("href", "")
        title = a.get_text(strip=True)
        if not title or len(title) < 15 or href in ("/news",):
            continue
        link = "https://www.ilo.org" + href if href.startswith("/") else href
        # 找同一卡片里的 time 标签
        card = a.find_parent(["article", "div", "li"])
        pub = ""
        if card:
            t = card.find("time")
            if t and t.get("datetime"):
                pub = t["datetime"]
        if not pub:
            continue  # 无法确定日期的条目不要，避免错配
        items.append({
            "title": title,
            "link": link,
            "pubDate": pub,
            "author": "ILO",
            "description": title + "（ILO 官网新闻，自动采集）",
            "source": "ILO 国际劳工组织",
        })
    # 去重
    seen, out = set(), []
    for it in items:
        if it["link"] not in seen:
            seen.add(it["link"])
            out.append(it)
    return out


def fetch_ilo():
    print("▶ 抓取 ILO 国际劳工组织（无官方 RSS）…")
    # ① 普通请求
    try:
        r = requests.get(ILO_NEWS_URL, headers={"User-Agent": UA},
                         timeout=30, allow_redirects=True)
        items = _ilo_items_from_html(r.text)
        if items:
            print(f"   ✅ 普通请求成功，解析到 {len(items)} 条 ILO 内容")
            return items
        print("   （ILO 主站被 Cloudflare 拦截，改用 Google News 兜底…）")
    except Exception as e:
        print(f"   （普通请求失败：{e}，改用 Google News 兜底…）")
    # ② Google News 兜底
    items = _google_news_items("ilo.org", "ILO 国际劳工组织")
    print(f"   {'✅ Google News 兜底：' + str(len(items)) + ' 条' if items else '❌ ILO 两条通道均未取到'}")
    return items


# ────────────────────────  统一入口  ────────────────────────

def fetch_imf_ilo_items():
    """给 fetch_rss.py 调用的总入口，返回 IMF + ILO 的全部条目。"""
    items = []
    items += fetch_imf()
    items += fetch_ilo()
    return items


if __name__ == "__main__":
    # 直接运行本文件时，把结果打印出来（并写入 imf-ilo-preview.json 方便检查）
    result = fetch_imf_ilo_items()
    print(f"\n共取到 {len(result)} 条：")
    for it in result[:15]:
        print("  -", it["source"], "|", it["pubDate"], "|", it["title"][:60])
    with open("imf-ilo-preview.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("\n已写入 imf-ilo-preview.json")
