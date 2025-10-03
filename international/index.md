---
layout: default
title: "🌍 国际关系"
---

<div class="category-page">
  <h1>🌍 国际关系</h1>
  <p>共 0 篇文章</p>
  
  <ul class="post-list">
    {% for post in site.categories.international %}
      <li>
        <span class="post-meta">{{ post.date | date: "%Y-%m-%d" }}</span>
        <span class="post-source">[{{ post.source }}]</span>
        <h3>
          <a class="post-link" href="{{ post.url | relative_url }}">{{ post.title }}</a>
        </h3>
        <p class="post-excerpt">{{ post.excerpt | strip_html | truncate: 200 }}</p>
      </li>
    {% endfor %}
  </ul>
</div>

<style>
.category-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
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
</style>
