---
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
