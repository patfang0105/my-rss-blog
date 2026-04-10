import requests
from bs4 import BeautifulSoup
import json
import os
import re
from datetime import datetime

# ================= 在这里配置你要追踪的智库网站 =================
# 每个网站需要填写：名称、网址、文章选择器（CSS选择器）
# 文章选择器：右键点击网页上的文章标题 -> 检查元素，找到包裹文章的标签，例如 article、.post、.news-item 等
TARGET_SITES = [
    {
        "name": "Brookings",
        "url": "https://www.brookings.edu/",
        "article_selector": "article",  # 通用，大多数网站用 article 标签
        "link_selector": "a",
        "title_selector": "h2, h3"
    },
    {
        "name": "Rhodium Group",
        "url": "https://rhg.com/",
        "article_selector": "article",
        "link_selector": "a",
        "title_selector": "h2, h3"
    },
    {
        "name": "CSIS",
        "url": "https://www.csis.org/",
        "article_selector": "article",
        "link_selector": "a",
        "title_selector": "h2, h3"
    },
    {
        "name": "World Bank",
        "url": "https://www.worldbank.org/en/news/all",
        "article_selector": "div.news-item",  # 世界银行可能不同，可调整
        "link_selector": "a",
        "title_selector": "h3"
    },
    {
        "name": "IMF",
        "url": "https://www.imf.org/en/News",
        "article_selector": "div.news-item",
        "link_selector": "a",
        "title_selector": "h3"
    }
    # 你可以继续添加更多网站，按照上面的格式
]
# =============================================================

def fetch_articles(site):
    """抓取单个网站首页的文章标题和链接"""
    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
        resp = requests.get(site["url"], headers=headers, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        articles = []
        
        # 找到文章容器
        containers = soup.select(site["article_selector"])
        for container in containers[:10]:  # 每个网站最多取10篇
            # 提取标题
            title_tag = container.select_one(site["title_selector"]) if site["title_selector"] else container.find(["h2", "h3"])
            # 提取链接
            link_tag = container.select_one(site["link_selector"]) if site["link_selector"] else container.find("a")
            
            if not title_tag or not link_tag:
                continue
                
            title = title_tag.get_text(strip=True)
            link = link_tag.get("href")
            if not link:
                continue
            # 处理相对链接
            if link.startswith("/"):
                base_url = site["url"].rstrip("/")
                # 如果 base_url 包含路径，需要提取域名部分
                from urllib.parse import urljoin
                link = urljoin(site["url"], link)
            
            # 过滤掉太短的标题（可能是导航栏）
            if title and len(title) > 5 and not title.startswith("Menu"):
                articles.append({
                    "title": title,
                    "link": link,
                    "source": site["name"],
                    "date": datetime.now().strftime("%Y-%m-%d")
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
        articles = fetch_articles(site)
        print(f"  抓到 {len(articles)} 篇文章")
        all_articles.extend(articles)
    
    if not all_articles:
        print("没有抓到任何文章，退出")
        return
    
    print(f"总共抓取 {len(all_articles)} 篇文章，准备交给 AI 分析...")
    
    # 构建发送给 AI 的文本（限制长度，避免 token 过多）
    article_text = ""
    for idx, art in enumerate(all_articles[:30], 1):  # 最多30篇
        article_text += f"{idx}. 标题：{art['title']}\n   来源：{art['source']}\n   链接：{art['link']}\n\n"
    
    # 调用硅基流动 API
    api_key = os.environ.get("SILICONFLOW_API_KEY")
    if not api_key:
        print("错误：未找到 SILICONFLOW_API_KEY 环境变量")
        return
    
    system_prompt = """你是一位专业的经济与国际关系研究助手。请根据以下标准，从用户提供的文章列表中筛选出最重要的 5-10 篇文章：
1. 内容涉及国际贸易、多边机构治理、宏观经济形势、产业政策。
2. 优先推荐来自顶尖智库（如 Brookings, CSIS, IMF, World Bank）的深度分析。
3. 优先选择时效性强、对未来有前瞻性判断的文章。

请严格按照下面的格式输出，不要输出任何额外内容：

【推荐一】
文章：文章完整标题
理由：一句话说明为什么值得读（必须指明涉及的具体话题）
链接：原始链接

【推荐二】
文章：...
理由：...
链接：...

如果没有符合条件的文章，只输出：“未找到符合要求的高价值文章。”
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
                "model": "Qwen/Qwen2.5-72B-Instruct",  # 可换成 deepseek-ai/DeepSeek-V3
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 1000
            },
            timeout=60
        )
        
        if response.status_code == 200:
            ai_result = response.json()["choices"][0]["message"]["content"]
            print("AI 分析完成")
            
            # 将 AI 返回的结果保存为 recommendations.json
            # 为了与你现有的“编辑推荐”板块兼容，我们包装一下
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
