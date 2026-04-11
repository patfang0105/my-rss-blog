import requests
from bs4 import BeautifulSoup
import json
import os
import re
from datetime import datetime
from urllib.parse import urljoin
import xml.etree.ElementTree as ET

# ================= 你要追踪的智库网站（网页抓取） =================
# 注意：对于有官方 RSS 的网站（如 Brookings、CSIS），建议优先使用 RSS，
# 但此处保留网页抓取作为示例。你可以根据需要添加或删除。
TARGET_SITES = [
    {
        "name": "Brookings",
        "type": "web",
        "url": "https://www.brookings.edu/",
        "article_selector": "article",
        "title_selector": "h2, h3",
        "link_selector": "a",
        "date_selector": "time, .date, .published"
    },
    {
        "name": "CSIS",
        "type": "web",
        "url": "https://www.csis.org/analysis",
        "article_selector": "article.article-search-listing",
        "title_selector": "h2 a, h3 a",
        "link_selector": "h2 a, h3 a",
        "date_selector": "time, .date"
    }
    # 可以继续添加其他网站，例如：
    # {
    #     "name": "World Bank",
    #     "type": "web",
    #     "url": "https://www.worldbank.org/en/news/all",
    #     "article_selector": "div.news-item",
    #     "title_selector": "h3 a",
    #     "link_selector": "a",
    #     "date_selector": "time"
    # }
]
# ===============================================================

def fetch_web_articles(site):
    """抓取网页文章列表"""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        resp = requests.get(site["url"], headers=headers, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        articles = []
        containers = soup.select(site["article_selector"])
        
        for container in containers[:12]:  # 每个网站最多12篇
            # 提取标题
            title_tag = container.select_one(site["title_selector"]) if site["title_selector"] else container.find(["h2", "h3"])
            if not title_tag:
                continue
            title = title_tag.get_text(strip=True)
            if len(title) < 5 or title.startswith("Menu"):
                continue
            
            # 提取链接
            link_tag = container.select_one(site["link_selector"]) if site["link_selector"] else container.find("a")
            if not link_tag or not link_tag.get("href"):
                continue
            link = urljoin(site["url"], link_tag["href"])
            
            # 提取日期
            pub_date = ""
            if "date_selector" in site and site["date_selector"]:
                date_tag = container.select_one(site["date_selector"])
                if date_tag:
                    raw_date = date_tag.get_text(strip=True)
                    # 尝试匹配常见日期格式
                    match = re.search(r'(\d{4}-\d{2}-\d{2})', raw_date)
                    if not match:
                        match = re.search(r'([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})', raw_date)
                    if match:
                        pub_date = match.group(0)
                    else:
                        pub_date = raw_date[:20]
            if not pub_date:
                pub_date = datetime.now().strftime("%Y-%m-%d")
            
            articles.append({
                "title": title,
                "link": link,
                "source": site["name"],
                "date": pub_date
            })
        
        print(f"  {site['name']} 抓取到 {len(articles)} 篇文章")
        # 打印标题便于调试
        for idx, art in enumerate(articles, 1):
            print(f"    {idx}. {art['title']}")
        return articles
    except Exception as e:
        print(f"抓取 {site['name']} 失败: {e}")
        return []

def fetch_articles(site):
    if site.get("type") == "rss":
        # 预留 RSS 支持（如果未来有官方 RSS）
        print(f"暂不支持 RSS 类型: {site['name']}")
        return []
    else:
        return fetch_web_articles(site)

def generate_custom_rss(articles):
    """生成自定义 RSS 源文件 custom_feed.xml"""
    if not articles:
        print("没有文章，跳过生成 RSS")
        return
    rss = ET.Element("rss", version="2.0")
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = "AI 智库追踪 - 自定义聚合"
    ET.SubElement(channel, "link").text = "https://patfang0105.github.io/my-rss-blog/"
    ET.SubElement(channel, "description").text = "由 AI 从 Brookings、CSIS 等网站抓取的最新文章"
    ET.SubElement(channel, "lastBuildDate").text = datetime.now().strftime("%a, %d %b %Y %H:%M:%S GMT")
    
    for art in articles[:50]:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = art["title"]
        ET.SubElement(item, "link").text = art["link"]
        ET.SubElement(item, "guid").text = art["link"]
        ET.SubElement(item, "pubDate").text = art["date"]
        description = f"来源：{art['source']} | 日期：{art['date']}"
        ET.SubElement(item, "description").text = description
    
    tree = ET.ElementTree(rss)
    tree.write("custom_feed.xml", encoding="utf-8", xml_declaration=True)
    print("已生成 custom_feed.xml")

def main():
    print("开始抓取智库网站...")
    all_articles = []
    for site in TARGET_SITES:
        print(f"正在抓取: {site['name']}")
        arts = fetch_articles(site)
        all_articles.extend(arts)
    
    if not all_articles:
        print("没有抓到任何文章，退出")
        # 即使没有文章，也生成一个空的 RSS 文件（避免 404）
        generate_custom_rss([])
        return
    
    print(f"总共抓取 {len(all_articles)} 篇文章，准备交给 AI 分析...")
    
    # 生成自定义 RSS 源
    generate_custom_rss(all_articles)
    
    # 构建给 AI 的文本（标题、来源、日期、链接）
    article_text = ""
    for idx, art in enumerate(all_articles[:30], 1):
        article_text += f"{idx}. 标题：{art['title']}\n   来源：{art['source']}\n   日期：{art['date']}\n   链接：{art['link']}\n\n"
    
    api_key = os.environ.get("SILICONFLOW_API_KEY")
    if not api_key:
        print("错误：未找到 SILICONFLOW_API_KEY，跳过 AI 分析")
        # 即使没有 API Key，也生成 RSS 文件
        return
    
    system_prompt = """你是一位专业的经济与国际关系研究助手。请从以下文章中筛选出最重要的 3-5 篇进行推荐。

筛选标准（满足任一即可）：
- 涉及国际贸易、多边机构治理、宏观经济、产业政策
- 涉及能源安全、技术竞争、地缘政治、供应链重组
- 优先推荐深度分析或研究报告，避免纯粹的活动预告

输出格式（严格按此格式，不要输出额外内容）：
【推荐一】
文章：完整标题
日期：YYYY-MM-DD（如果有）
理由：一句话推荐理由（指出相关领域）
链接：原始链接

如果没有合适的文章，只输出：“今日暂无符合标准的高价值文章。”
"""
    
    user_prompt = f"请分析以下文章并推荐：\n{article_text}"
    
    try:
        response = requests.post(
            "https://api.siliconflow.cn/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            },
            json={
                "model": "Qwen/Qwen2.5-72B-Instruct",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.2,
                "max_tokens": 1200
            },
            timeout=60
        )
        
        if response.status_code == 200:
            ai_result = response.json()["choices"][0]["message"]["content"]
            print("AI 分析完成")
            output = {
                "last_update": datetime.now().isoformat(),
                "ai_recommendations": ai_result
            }
            with open("recommendations.json", "w", encoding="utf-8") as f:
                json.dump(output, f, ensure_ascii=False, indent=2)
            print("已更新 recommendations.json")
        else:
            print(f"AI API 调用失败: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"AI 分析出错: {e}")

if __name__ == "__main__":
    main()
