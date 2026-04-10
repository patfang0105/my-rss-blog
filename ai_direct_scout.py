import requests
from bs4 import BeautifulSoup
import json
import os
import re
from datetime import datetime
from urllib.parse import urljoin

# ================= 你要追踪的智库网站 =================
TARGET_SITES = [
    {
        "name": "Brookings",
        "url": "https://www.brookings.edu/?s=",
        "article_selector": "article",           # 通用
        "title_selector": "h2, h3",
        "link_selector": "a",
        "date_selector": "time, .date, .published"  # 尝试提取日期
    },
    {
        "name": "Rhodium Group",
        "url": "https://rhg.com/",
        "article_selector": "article",
        "title_selector": "h2, h3",
        "link_selector": "a",
        "date_selector": "time, .date"
    },
    {
        "name": "CSIS",
        "url": "https://www.csis.org/",
        "article_selector": "article",
        "title_selector": "h2, h3",
        "link_selector": "a",
        "date_selector": "time, .date"
    }
    # 可以继续添加，按照相同格式
]
# ====================================================

def fetch_articles(site):
    """抓取网站，返回文章列表，每篇包含 title, link, source, date"""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
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
            
            # 提取日期（如果有）
            pub_date = ""
            if "date_selector" in site and site["date_selector"]:
                date_tag = container.select_one(site["date_selector"])
                if date_tag:
                    raw_date = date_tag.get_text(strip=True)
                    # 尝试解析常见日期格式，例如 "Apr 10, 2025" 或 "2025-04-10"
                    match = re.search(r'(\d{4}-\d{2}-\d{2})', raw_date)
                    if not match:
                        match = re.search(r'([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4})', raw_date)
                    if match:
                        pub_date = match.group(0)
                    else:
                        pub_date = raw_date[:20]  # 截取前20字符
            # 如果没有提取到日期，使用今天的日期（表示“近期”）
            if not pub_date:
                pub_date = datetime.now().strftime("%Y-%m-%d")
            
            articles.append({
                "title": title,
                "link": link,
                "source": site["name"],
                "date": pub_date
            })
        return articles
    except Exception as e:
        print(f"抓取 {site['name']} 失败: {e}")
        return []

def main():
    print("开始抓取智库网站...")
    all_articles = []
    for site in TARGET_SITES:
        print(f"正在抓取: {site['name']}")
        arts = fetch_articles(site)
        print(f"  抓到 {len(arts)} 篇文章")
        all_articles.extend(arts)
    
    if not all_articles:
        print("没有抓到任何文章，退出")
        return
    
    print(f"总共抓取 {len(all_articles)} 篇文章，准备交给 AI 分析...")
    
    # 构建给 AI 的文本（包含标题、来源、日期、链接）
    article_text = ""
    for idx, art in enumerate(all_articles[:30], 1):
        article_text += f"{idx}. 标题：{art['title']}\n   来源：{art['source']}\n   日期：{art['date']}\n   链接：{art['link']}\n\n"
    
    api_key = os.environ.get("SILICONFLOW_API_KEY")
    if not api_key:
        print("错误：未找到 SILICONFLOW_API_KEY")
        return
    
    system_prompt = """你是一位专业的经济与国际关系研究助手。请严格按照以下要求输出推荐：

要求：
1. 从用户提供的文章列表中，筛选出最重要的 3-5 篇文章。
2. 必须包含以下领域：国际贸易、多边机构治理、宏观经济形势、产业政策。
3. 输出格式必须严格如下（不要添加任何额外解释或标记）：

【推荐一】
文章：完整标题
日期：YYYY-MM-DD
理由：一句话说明为什么值得读（必须指明涉及的具体话题）
链接：原始链接

【推荐二】
...（以此类推）

如果没有符合要求的文章，只输出：“未找到符合要求的高价值文章。”
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
                "temperature": 0.2,   # 降低温度，让输出更稳定
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
