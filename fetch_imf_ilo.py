# -*- coding: utf-8 -*-
"""
fetch_imf_ilo.py  (v4) —— 给没有可用官方 RSS 的多边机构专用抓取脚本。
覆盖：IMF（国际货币基金组织）、ILO（国际劳工组织）、世界银行 World Bank、
      UNCTAD（联合国贸易和发展会议）。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
v4 新增（本次）：UNCTAD 联合国贸发会议
  实测结论：unctad.org 的 RSS 全部 404（/rss.xml、/publications/rss、/news/rss）。
  但官网两个列表页是普通静态 HTML，requests 直接抓即可，不需要浏览器：
    ① https://unctad.org/publications  —— 出版物/报告（126KB，含日期标题，16 条）
    ② https://unctad.org/press         —— 新闻稿列表（91KB，5 条）
  页面为统一卡片组件（ny-card / ny-list），日期就在卡片内（ny-card__date /
  ny-list__date，如 "09 Nov 2026" / "10 November 2026"），标题在 h3 或
  aria-label 里。实测两页共解析 21 条，标题日期链接全部正确。
  常见坑（已处理）：同一出版物在页面里有两个 <a>（无日期的大卡片 + 带日期的
  横排卡片），必须"先解析后去重、优先保留有日期的"，否则最新报告会被误丢。

v3 已有（保持）：世界银行、Google News 超时修复、21 天窗口
  世界银行：官网 /ext/en/news 列表页，requests 直接抓，日期在 URL 里，8/8 正确。
  另：世行官方搜索 API 索引停在 6 周前，不适合每日跟踪，弃用。

v2 已有（保持）：IMF、ILO
  ① 日期格式改为标准 RFC822（"30 Sep 2026 08:00:00 GMT"），下游可直接解析；
  ② 「新鲜度闸门」：页面最新条目若老于 7 天，判定为抓到静态旧页面，自动降级；
  ③ ILO 经 Google News 兜底时标题会带 " - International Labour Organization" 后缀，
     自动剥离，并过滤区域性会议指南、NORMLEX 等事务性页面；
  ④ 按解析出的真实日期排序。

通道设计：
  UNCTAD ：① 官网 publications + press 两页 → ② Google News（site:unctad.org）
  世界银行：① 官网新闻列表页（主通道，实测可用）→ ② Google News（site:worldbank.org）
  IMF    ：① 普通请求官网 → ② 无头浏览器渲染（仅完全无结果时）→ ③ Google News（site:imf.org）
  ILO    ：① 普通请求官网 → ② Google News（site:ilo.org）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import json
import re
import calendar
import requests
import feedparser
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime

try:
    from bs4 import BeautifulSoup
    HAS_BS4 = True
except ImportError:
    HAS_BS4 = False

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

IMF_NEWS_URL = "https://www.imf.org/en/News"
ILO_NEWS_URL = "https://www.ilo.org/news"
WB_NEWS_URL = "https://www.worldbank.org/ext/en/news"
UNCTAD_PAGES = ["https://unctad.org/publications",   # 报告/出版物
                "https://unctad.org/press"]          # 新闻稿
KEEP_DAYS = 21          # 只保留最近 N 天（数据池应尽量完整，由下游按当天窗口再筛）
FRESH_DAYS = 7          # 闸门：页面最新条目若老于 N 天，判定为静态旧页面

IMF_LINK_RE = re.compile(
    r'<a\s+href="((?:https?://www\.imf\.org)?(/en/news/articles/(\d{4})/(\d{1,2})/(\d{1,2})/([a-z0-9\-]+)))"[^>]*>(.*?)</a>',
    re.I | re.S)
IMF_DATE_PREFIX_RE = re.compile(
    r'^\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}', re.I)

# 世行文章链接：https://www.worldbank.org/en/news/press-release/2026/11/05/slug
WB_LINK_RE = re.compile(
    r'https://www\.worldbank\.org/en/news/([a-z\-]+)/(\d{4})/(\d{1,2})/(\d{1,2})/([a-z0-9\-]+)', re.I)
# 世行的视频/播客不是文章正文，直接跳过
WB_NON_ARTICLE = ("video", "podcast", "photo-essay", "photoessay")


def _rfc822(y, m, d, hh=8):
    """生成标准 RFC822 日期字符串，如 '30 Sep 2026 08:00:00 GMT'。"""
    return f"{int(d):02d} {calendar.month_abbr[int(m)]} {int(y)} {hh:02d}:00:00 GMT"


def _parse_date(s):
    if not s:
        return None
    try:
        dt = parsedate_to_datetime(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _is_fresh(items, days=FRESH_DAYS):
    """判断抓取结果是否新鲜：最新一条是否在 days 天内。"""
    newest = None
    for it in items:
        dt = _parse_date(it.get("pubDate"))
        if dt and (newest is None or dt > newest):
            newest = dt
    if newest is None:
        return False
    return (datetime.now(timezone.utc) - newest) <= timedelta(days=days)


def _slug_to_title(slug: str) -> str:
    """兜底：把 URL slug 还原成可读标题。"""
    s = re.sub(r'^(pr|sp|cf|nm|tr|blog)-?\d{3,6}-', '', slug.lower())
    s = s.replace('-', ' ')
    s = re.sub(r'\s+', ' ', s).strip()
    small = {"a", "an", "the", "of", "in", "on", "at", "to", "for", "and", "or",
             "as", "by", "with", "from", "is", "are", "its", "it"}
    words = []
    for i, w in enumerate(s.split(" ")):
        if w in ("imf", "wto", "ai", "weo", "gfsr", "gdp", "us", "uk", "eu"):
            words.append(w.upper())
        elif i > 0 and w in small:
            words.append(w)
        else:
            words.append(w.capitalize())
    return " ".join(words)


# ──────────────────────────  UNCTAD 联合国贸发会议  ──────────────────────────

# 合法条目路径：/publication/xxx、/news/xxx、/press-material/xxx
UNCTAD_PATH_RE = re.compile(r'^/(publication|news|press-material)/[a-z0-9\-]+/?$')
UNCTAD_DATE_RE = re.compile(r'\b(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})\b')
_MONTHS_ABBR = {'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'}


def _unctad_date_in_container(a):
    """日期必须与链接同一容器：先查 a 内部（卡片型），再向上找限定容器（列表型）。"""
    d = a.find('p', class_='ny-card__date')
    if d:
        return d.get_text(strip=True)
    p = a
    for _ in range(3):
        p = p.parent
        if p is None:
            return None
        cls = p.get('class') or []
        if any(c.startswith(('ny-list__content', 'ny-card__body')) for c in cls):
            d = p.find('p', class_='ny-list__date') or p.find('p', class_='ny-card__date')
            return d.get_text(strip=True) if d else None
    return None


def _unctad_title_of(a):
    """标题优先级：卡片内 h3 → aria-label（Read more about X）→ 锚文本（去掉混入的日期）。"""
    h = a.find(['h2', 'h3', 'h4'])
    if h:
        t = h.get_text(' ', strip=True)
        if len(t) >= 15:
            return t
    m = re.match(r'Read more about (.+)', a.get('aria-label', ''))
    if m and len(m.group(1).strip()) >= 15:
        return m.group(1).strip()
    t = a.get_text(' ', strip=True)
    t = UNCTAD_DATE_RE.sub('', t).strip(' |-–—')
    return t if len(t) >= 15 else ''


def _unctad_items_from_html(html: str):
    """解析 UNCTAD 列表页（publications / press 通用同一套卡片组件）。"""
    if not HAS_BS4:
        return []
    soup = BeautifulSoup(html, "html.parser")
    got = {}
    for a in soup.find_all('a', href=True):
        href = a.get('href', '')
        if not UNCTAD_PATH_RE.match(href):
            continue
        if '/dashboard' in href or href.startswith('/publication/unctad16'):
            continue
        raw = _unctad_date_in_container(a)
        if not raw:
            continue
        m = UNCTAD_DATE_RE.search(raw)
        if not m:
            continue
        d, mo, y = m.groups()
        mo = mo.title()[:3]
        if mo not in _MONTHS_ABBR:
            continue
        title = _unctad_title_of(a)
        if not title:
            continue
        date = f"{d} {mo} {y}"
        # 同一 href 在页面上有两个 <a>（无日期大卡片 + 带日期横排卡片），
        # 必须先解析再去重、保留有日期（且标题更长）的那份，否则最新报告会被误丢。
        if href not in got or len(title) > len(got[href][1]):
            got[href] = (date, title, "https://unctad.org" + href)
    # 跨 href 同文去重（/news/ 与 /press-material/ 可能同文）
    seen_title, out = {}, []
    for date, title, url in got.values():
        k = re.sub(r'\W+', '', title.lower())[:60]
        if k in seen_title:
            old_date, old_t, old_u = seen_title[k]
            if date > old_date:
                out[out.index((old_date, old_t, old_u))] = (date, title, url)
                seen_title[k] = (date, title, url)
            continue
        seen_title[k] = (date, title, url)
        out.append((date, title, url))
    out.sort(reverse=True)
    return [{
        "title": t,
        "link": u,
        "pubDate": _rfc822_date(d),
        "author": "UNCTAD",
        "description": t + "（UNCTAD 官网，自动采集）",
        "source": "UNCTAD 联合国贸发会议",
    } for d, t, u in out]


def _rfc822_date(s: str):
    """把 '09 Nov 2026' / '10 November 2026' 转成标准 RFC822。"""
    m = UNCTAD_DATE_RE.search(s or "")
    if not m:
        return ""
    d, mo, y = m.groups()
    mo = mo.title()[:3]
    if mo not in _MONTHS_ABBR:
        return ""
    return f"{int(d):02d} {mo} {y} 08:00:00 GMT"


def fetch_unctad():
    print("▶ 抓取 UNCTAD 联合国贸发会议（无官方 RSS）…")
    items = []
    for page in UNCTAD_PAGES:
        try:
            r = requests.get(page, headers={"User-Agent": UA,
                                             "Accept-Language": "en-US,en;q=0.9"},
                             timeout=30, allow_redirects=True)
            if r.status_code == 200:
                got = _unctad_items_from_html(r.text)
                print(f"   · {page.rsplit('/', 1)[-1]} 页解析 {len(got)} 条")
                items += got
            else:
                print(f"   ⚠ {page} 返回 HTTP {r.status_code}")
        except Exception as e:
            print(f"   ⚠ {page} 请求失败：{type(e).__name__}")
    # 按 URL 去重（两页可能有交叉）
    seen, uniq = set(), []
    for it in items:
        if it["link"] in seen:
            continue
        seen.add(it["link"])
        uniq.append(it)
    if len(uniq) >= 5:
        print(f"   ✅ 官网解析成功，合计 {len(uniq)} 条")
        return uniq
    if uniq:
        print(f"   ⚠ 官网只解析到 {len(uniq)} 条，改用 Google News 兜底…")
    else:
        print("   ⚠ 官网未解析到条目（页面结构可能已改版），改用 Google News 兜底…")
    got = _google_news_items("unctad.org", "UNCTAD 联合国贸发会议")
    print(f"   {'✅ Google News 兜底：' + str(len(got)) + ' 条' if got else '❌ UNCTAD 两条通道均未取到'}")
    return got


# ──────────────────────────  世界银行 World Bank  ──────────────────────────

def _wb_items_from_html(html: str):
    """从世行新闻列表页（/ext/en/news）解析条目。标题日期链接三要素齐全。"""
    if not HAS_BS4:
        # 没有 bs4 时退化为正则：只用 slug 还原标题，保证不断流
        out, seen = [], set()
        for m in WB_LINK_RE.finditer(html):
            typ, y, mo, d, slug = m.groups()
            if typ.lower() in WB_NON_ARTICLE:
                continue
            url = m.group(0)
            if url in seen:
                continue
            seen.add(url)
            out.append({
                "title": _slug_to_title(slug),
                "link": url,
                "pubDate": _rfc822(y, mo, d),
                "author": "World Bank",
                "description": "世界银行官网新闻（自动采集）",
                "source": "世界银行 World Bank",
            })
        return out

    soup = BeautifulSoup(html, "html.parser")
    items, seen = [], set()
    for a in soup.find_all("a", href=True):
        m = WB_LINK_RE.search(a["href"])
        if not m:
            continue
        typ, y, mo, d, slug = m.groups()
        if typ.lower() in WB_NON_ARTICLE:
            continue
        url = "https://www.worldbank.org" + a["href"].split("worldbank.org")[-1]
        if url in seen:
            continue
        seen.add(url)

        # 策略 1：锚文本本身是标题（不是一串 URL）
        title = a.get_text(" ", strip=True)
        if title.startswith("http") or len(title) < 15:
            title = ""
        # 策略 2：向上找父级，取它前面那个兄弟 div 的文本（世行卡片结构）
        if not title:
            p = a.parent
            for _ in range(3):
                if p is None:
                    break
                sib = p.find_previous_sibling("div")
                if sib:
                    t = sib.get_text(" ", strip=True)
                    low = t.lower()
                    if (15 < len(t) < 260 and "http" not in t
                            and "default image" not in low
                            and low not in ("speech", "press release", "statement",
                                            "feature story", "immersive story")):
                        title = t
                        break
                p = p.parent
        # 策略 3：slug 还原
        if not title:
            title = _slug_to_title(slug)

        items.append({
            "title": title,
            "link": url,
            "pubDate": _rfc822(y, mo, d),
            "author": "World Bank",
            "description": title + "（世界银行官网新闻，自动采集）",
            "source": "世界银行 World Bank",
        })
    return items


def fetch_worldbank():
    print("▶ 抓取 世界银行 World Bank（无官方 RSS）…")
    # ① 官网新闻列表页（实测可用，普通请求即可）
    try:
        r = requests.get(WB_NEWS_URL, headers={"User-Agent": UA,
                                               "Accept-Language": "en-US,en;q=0.9"},
                         timeout=30, allow_redirects=True)
        if r.status_code == 200:
            items = _wb_items_from_html(r.text)
            # 世行不是每天都发稿，列表最新一条隔一周以上是正常的，
            # 因此这里不做严格新鲜度闸门：只要解析出 ≥3 条真实文章就采用。
            if len(items) >= 3:
                fresh = _is_fresh(items, days=FRESH_DAYS)
                print(f"   ✅ 官网列表页解析成功（{'内容新鲜' if fresh else '最新一条距今较久，但确为官网最新'}），{len(items)} 条")
                return items
            print("   ⚠ 官网未解析到足够条目（页面结构可能已改版），改用 Google News 兜底…")
        else:
            print(f"   ⚠ 官网返回 HTTP {r.status_code}，改用 Google News 兜底…")
    except Exception as e:
        print(f"   ⚠ 官网请求失败：{e}，改用 Google News 兜底…")

    # ② Google News 兜底
    items = _google_news_items("worldbank.org", "世界银行 World Bank")
    print(f"   {'✅ Google News 兜底：' + str(len(items)) + ' 条' if items else '❌ 世行两条通道均未取到'}")
    return items


# ────────────────────────────  IMF  ────────────────────────────

def _imf_items_from_html(html: str):
    items, seen = [], set()
    for m in IMF_LINK_RE.finditer(html):
        path, y, mo, d, slug, anchor = (m.group(1), m.group(3), m.group(4),
                                        m.group(5), m.group(6), m.group(7))
        url = "https://www.imf.org" + path if path.startswith("/en") else path
        if url in seen:
            continue
        seen.add(url)
        text = re.sub(r"<[^>]+>", "", anchor or "")
        text = re.sub(r"\s+", " ", text).strip()
        text = IMF_DATE_PREFIX_RE.sub("", text).strip()
        title = text if len(text) >= 10 else _slug_to_title(slug)
        if not title:
            continue
        items.append({
            "title": title,
            "link": url,
            "pubDate": _rfc822(y, mo, d),
            "author": "IMF",
            "description": title + "（IMF 官网新闻，自动采集）",
            "source": "IMF 国际货币基金组织",
        })
    return items


def _render_with_playwright(url: str, wait_ms: int = 6000):
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
    """Google News 兜底：site:domain 的最新收录。返回条目并清理标题后缀。

    注意：feedparser.parse(url) 内部走 urllib，没有超时参数，某些网络环境下会
    长时间挂起（实测本机可达 5 分钟以上）。这里先用 requests 带超时抓取，
    再把内容交给 feedparser 解析，确保整条流水线不会卡死。
    """
    url = (f"https://news.google.com/rss/search?q=site:{site_domain}"
           f"+when:{days}d&hl=en-US&gl=US&ceid=US:en")
    try:
        resp = requests.get(url, headers={"User-Agent": UA}, timeout=20)
        if resp.status_code != 200:
            print(f"   （Google News 返回 HTTP {resp.status_code}）")
            return []
        feed = feedparser.parse(resp.content)
        items = []
        for entry in feed.entries[:25]:
            title = (entry.get("title") or "").strip()
            title = re.sub(r'\s+-\s+(International Labour Organization|ILO|IMF|'
                           r'International Monetary Fund|World Bank|World Bank Group)\s*$',
                           '', title, flags=re.I)
            if not title:
                continue
            items.append({
                "title": title,
                "link": entry.get("link", ""),
                "pubDate": entry.get("published", entry.get("updated", "")),
                "author": "",
                "description": re.sub(r"<[^>]+>", "", entry.get("summary", "") or "")[:300],
                "source": source_name,
            })
        return items
    except Exception as e:
        print(f"   （Google News 兜底失败：{type(e).__name__}）")
        return []


def fetch_imf():
    print("▶ 抓取 IMF 国际货币基金组织（无官方 RSS）…")
    # ① 普通请求
    got_any = False
    try:
        r = requests.get(IMF_NEWS_URL, headers={"User-Agent": UA},
                         timeout=30, allow_redirects=True)
        items = _imf_items_from_html(r.text)
        if len(items) >= 5 and _is_fresh(items):
            print(f"   ✅ 普通请求成功（内容新鲜），{len(items)} 条")
            return items
        if items:
            got_any = True
            print(f"   ⚠ 普通请求只拿到 {len(items)} 条且内容偏旧（IMF 列表是 JS 动态加载），继续降级…")
        else:
            print("   ⚠ 普通请求未解析到条目（疑似被拦截），继续降级…")
    except Exception as e:
        print(f"   ⚠ 普通请求失败：{e}，继续降级…")
    # ② 无头浏览器：仅在"一条都解析不到"（页面结构异常/被拦截）时才尝试。
    #    若已解析到条目但内容偏旧，那是 IMF 列表 JS 动态加载的固有问题，
    #    浏览器渲染同样只能拿到同一份旧内容——此时直接省掉约 50 秒，走 Google News。
    if not got_any:
        html = _render_with_playwright(IMF_NEWS_URL)
        if html:
            items = _imf_items_from_html(html)
            if items and _is_fresh(items):
                print(f"   ✅ 浏览器渲染成功（内容新鲜），{len(items)} 条")
                return items
            print("   ⚠ 浏览器渲染亦未取到新鲜内容，继续降级…")
    # ③ Google News
    items = _google_news_items("imf.org", "IMF 国际货币基金组织")
    print(f"   {'✅ Google News 兜底：' + str(len(items)) + ' 条' if items else '❌ IMF 三条通道均未取到'}")
    return items


# ────────────────────────────  ILO  ────────────────────────────

ILO_JUNK = ("guide for participants", "normlex", "comments -",
            "information system on international labour", "regional meeting",
            "list of ratifications", "committee on the application of standards")


def _ilo_items_from_html(html: str):
    if not HAS_BS4:
        return []
    if "Just a moment" in html or "challenge" in html.lower()[:3000]:
        return []
    soup = BeautifulSoup(html, "html.parser")
    items = []
    for a in soup.select("a[href^='/news/']"):
        href = a.get("href", "")
        title = a.get_text(strip=True)
        if not title or len(title) < 15 or href in ("/news",):
            continue
        if any(k in title.lower() for k in ILO_JUNK):
            continue
        link = "https://www.ilo.org" + href if href.startswith("/") else href
        card = a.find_parent(["article", "div", "li"])
        pub = ""
        if card:
            t = card.find("time")
            if t and t.get("datetime"):
                pub = t["datetime"]
        if not pub:
            continue
        items.append({
            "title": title,
            "link": link,
            "pubDate": pub,
            "author": "ILO",
            "description": title + "（ILO 官网新闻，自动采集）",
            "source": "ILO 国际劳工组织",
        })
    seen, out = set(), []
    for it in items:
        if it["link"] not in seen:
            seen.add(it["link"])
            out.append(it)
    return out


def fetch_ilo():
    print("▶ 抓取 ILO 国际劳工组织（无官方 RSS）…")
    try:
        r = requests.get(ILO_NEWS_URL, headers={"User-Agent": UA},
                         timeout=30, allow_redirects=True)
        items = _ilo_items_from_html(r.text)
        if items and _is_fresh(items):
            print(f"   ✅ 普通请求成功，{len(items)} 条")
            return items
        print("   ⚠ ILO 主站被 Cloudflare 拦截或内容不可用，改用 Google News 兜底…")
    except Exception as e:
        print(f"   ⚠ 普通请求失败：{e}，改用 Google News 兜底…")
    items = _google_news_items("ilo.org", "ILO 国际劳工组织")
    items = [it for it in items if not any(k in it["title"].lower() for k in ILO_JUNK)]
    print(f"   {'✅ Google News 兜底：' + str(len(items)) + ' 条' if items else '❌ ILO 两条通道均未取到'}")
    return items


# ────────────────────────  统一入口  ────────────────────────

def _filter_recent(items, days=KEEP_DAYS):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = []
    for it in items:
        dt = _parse_date(it.get("pubDate"))
        if dt is None or dt >= cutoff:
            out.append(it)
    return out


def fetch_imf_ilo_items():
    """抓取 UNCTAD / 世界银行 / IMF / ILO 四个无可用 RSS 的机构。

    函数名保持 fetch_imf_ilo_items 不变，是为了让已部署的 fetch_rss.py 无需改动。
    """
    items = []
    items += fetch_unctad()
    items += fetch_worldbank()
    items += fetch_imf()
    items += fetch_ilo()
    items = _filter_recent(items)
    # 按 URL 去重（Google News 兜底与官网通道可能重叠）
    seen, uniq = set(), []
    for it in items:
        key = it.get("link") or it.get("title")
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)
    uniq.sort(key=lambda x: _parse_date(x.get("pubDate")) or datetime.min.replace(tzinfo=timezone.utc),
              reverse=True)
    return uniq


if __name__ == "__main__":
    result = fetch_imf_ilo_items()
    print(f"\n共取到 {len(result)} 条（近 {KEEP_DAYS} 天）：")
    for it in result[:25]:
        print("  -", it["source"], "|", it["pubDate"][:25], "|", it["title"][:62])
    with open("institutions-preview.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("\n已写入 institutions-preview.json")
