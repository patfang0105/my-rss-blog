#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
RSS 聚合器 - 将多个 RSS 源聚合为 Jekyll 博客文章
"""

import feedparser
import os
import yaml
from datetime import datetime
import re

def clean_filename(title):
    """清理文件名，移除特殊字符"""
    # 移除特殊字符，只保留字母、数字、空格和连字符
    cleaned = re.sub(r'[^\w\s-]', '', title)
    # 替换空格为连字符
    cleaned = re.sub(r'\s+', '-', cleaned)
    # 限制长度
    return cleaned[:50]

def parse_rss_feeds():
    """解析所有 RSS 源"""
    # 读取配置文件
    with open('_config.yml', 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
    
    all_posts = []
    
    for feed_config in config['rss_feeds']:
        print(f"正在解析 {feed_config['name']}...")
        
        try:
            feed = feedparser.parse(feed_config['url'])
            
            for entry in feed.entries:
                # 解析发布时间
                if hasattr(entry, 'published_parsed') and entry.published_parsed:
                    published_date = datetime(*entry.published_parsed[:6])
                else:
                    published_date = datetime.now()
                
                post = {
                    'title': entry.title,
                    'link': entry.link,
                    'summary': entry.summary if hasattr(entry, 'summary') else '',
                    'published': published_date,
                    'source': feed_config['name'],
                    'category': feed_config['category'],
                    'filename': clean_filename(entry.title)
                }
                all_posts.append(post)
                
        except Exception as e:
            print(f"解析 {feed_config['name']} 失败: {e}")
    
    # 按时间排序
    all_posts.sort(key=lambda x: x['published'], reverse=True)
    
    return all_posts

def generate_jekyll_posts(posts):
    """生成 Jekyll 博客文章"""
    # 创建 _posts 目录
    os.makedirs('_posts', exist_ok=True)
    
    # 生成首页文章列表
    generate_index_page(posts)
    
    # 生成分类页面
    generate_category_pages(posts)
    
    # 生成最新的几篇文章
    for i, post in enumerate(posts[:20]):  # 只生成最新的20篇
        generate_post_file(post, i)

def generate_index_page(posts):
    """生成首页"""
    index_content = """---
layout: default
title: "我的 RSS 聚合站"
---

<div class="home">
  <h1 class="page-heading">📰 我的 RSS 聚合站</h1>
  <p class="page-description">实时更新的新闻和文章聚合</p>
  
  <div class="rss-stats">
    <p>📊 统计信息：</p>
    <ul>
      <li>总文章数：{{ site.posts.size }}</li>
      <li>最后更新：{{ site.time | date: "%Y-%m-%d %H:%M" }}</li>
    </ul>
  </div>
  
  <h2>📰 最新文章</h2>
  <ul class="post-list">
    {% for post in site.posts limit:10 %}
      <li>
        <span class="post-meta">{{ post.date | date: "%Y-%m-%d" }}</span>
        <span class="post-source">[{{ post.source }}]</span>
        <h3>
          <a class="post-link" href="{{ post.url | relative_url }}">{{ post.title }}</a>
        </h3>
        <p class="post-excerpt">{{ post.excerpt | strip_html | truncate: 200 }}</p>
      </li>
    {{% endfor %}}
  </ul>
  
  <h2>📂 分类</h2>
  <div class="categories">
    <a href="/tech/" class="category-link">🔧 技术新闻</a>
    <a href="/international/" class="category-link">🌍 国际关系</a>
  </div>
</div>

<style>
.home {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.rss-stats {
  background: #f5f5f5;
  padding: 15px;
  border-radius: 5px;
  margin: 20px 0;
}

.post-list {
  list-style: none;
  padding: 0;
}

.post-list li {
  border-bottom: 1px solid #eee;
  padding: 15px 0;
}

.post-meta {
  color: #666;
  font-size: 0.9em;
}

.post-source {
  background: #007acc;
  color: white;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.8em;
  margin-left: 10px;
}

.post-link {
  color: #333;
  text-decoration: none;
}

.post-link:hover {
  color: #007acc;
}

.post-excerpt {
  color: #666;
  margin-top: 5px;
}

.categories {
  display: flex;
  gap: 20px;
  margin-top: 20px;
}

.category-link {
  background: #007acc;
  color: white;
  padding: 10px 20px;
  text-decoration: none;
  border-radius: 5px;
}

.category-link:hover {
  background: #005a9e;
}
</style>
"""
    
    with open('index.md', 'w', encoding='utf-8') as f:
        f.write(index_content)

def generate_category_pages(posts):
    """生成分类页面"""
    # 技术新闻页面
    tech_posts = [p for p in posts if p['category'] == 'tech']
    generate_category_page(tech_posts, 'tech', '技术新闻', '🔧')
    
    # 国际关系页面
    intl_posts = [p for p in posts if p['category'] == 'international']
    generate_category_page(intl_posts, 'international', '国际关系', '🌍')

def generate_category_page(posts, category, title, icon):
    """生成单个分类页面"""
    os.makedirs(category, exist_ok=True)
    
    content = f"""---
layout: default
title: "{icon} {title}"
---

<div class="category-page">
  <h1>{icon} {title}</h1>
  <p>共 {len(posts)} 篇文章</p>
  
  <ul class="post-list">
    {{% for post in site.categories.{category} %}}
      <li>
        <span class="post-meta">{{{{ post.date | date: "%Y-%m-%d" }}}}</span>
        <span class="post-source">[{{{{ post.source }}}}]</span>
        <h3>
          <a class="post-link" href="{{{{ post.url | relative_url }}}}">{{{{ post.title }}}}</a>
        </h3>
        <p class="post-excerpt">{{{{ post.excerpt | strip_html | truncate: 200 }}}}</p>
      </li>
    {{% endfor %}}
  </ul>
</div>

<style>
.category-page {{
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}}

.post-list {{
  list-style: none;
  padding: 0;
}}

.post-list li {{
  border-bottom: 1px solid #eee;
  padding: 15px 0;
}}

.post-meta {{
  color: #666;
  font-size: 0.9em;
}}

.post-source {{
  background: #007acc;
  color: white;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.8em;
  margin-left: 10px;
}}

.post-link {{
  color: #333;
  text-decoration: none;
}}

.post-link:hover {{
  color: #007acc;
}}

.post-excerpt {{
  color: #666;
  margin-top: 5px;
}}
</style>
"""
    
    with open(f'{category}/index.md', 'w', encoding='utf-8') as f:
        f.write(content)

def generate_post_file(post, index):
    """生成单个博客文章文件"""
    filename = f"{post['published'].strftime('%Y-%m-%d')}-{post['filename']}-{index}.md"
    filepath = os.path.join('_posts', filename)
    
    content = f"""---
layout: post
title: "{post['title']}"
date: {post['published'].strftime('%Y-%m-%d %H:%M:%S')}
categories: {post['category']}
source: "{post['source']}"
---

# {post['title']}

**来源**: {post['source']}  
**发布时间**: {post['published'].strftime('%Y-%m-%d %H:%M')}  
**原文链接**: [{post['link']}]({post['link']})

## 摘要

{post['summary']}

---

[阅读原文]({post['link']}) | [返回首页](/)
"""
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

def main():
    """主函数"""
    print("🚀 开始聚合 RSS 源...")
    
    # 解析 RSS 源
    posts = parse_rss_feeds()
    print(f"✅ 成功解析 {len(posts)} 篇文章")
    
    # 生成 Jekyll 文章
    generate_jekyll_posts(posts)
    print("✅ 成功生成 Jekyll 博客文章")
    
    print("🎉 RSS 聚合完成！")

if __name__ == "__main__":
    main()
