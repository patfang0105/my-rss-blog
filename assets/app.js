// 简易前端聚合器：合并多个 RSS 源并展示（本地浏览器运行）
// 说明：浏览器直接抓取跨域 RSS 需要 CORS 代理，这里默认用 jsDelivr+rss2json 免费方案

const DEFAULT_FEEDS = [
  "https://www.atlanticcouncil.org/feed/",
  "https://patfang0105.github.io/my-rss-feeds/rss_www_csis_org.xml",
  "https://patfang0105.github.io/my-rss-feeds/rss_www_cfr_org.xml"
  "https://www.brookings.edu/feed/"
  "https://www.piie.com/rss/update.xml"
  "https://rmi.org/feed/"
  "https://www.wto.org/library/rss/latest_news_e.xml"
  "https://www.foreignaffairs.com/rss.xml"
  "https://www.imf.org/en/publications/rss?language=eng"
  "https://rhg.com/feed/”
  "http://project-syndicate.org/rss"
  "https://www.imf.org/en/publications/rss?language=eng&series=IMF%20Working%20Papers"
  
];

const state = {
  feeds: [],
  items: [],
  isLoading: false,
};

function loadFeedsFromStorage() {
  const saved = localStorage.getItem('feeds');
  if (saved) {
    try {
      state.feeds = JSON.parse(saved);
      if (!Array.isArray(state.feeds)) throw new Error('invalid');
    } catch {
      state.feeds = [...DEFAULT_FEEDS];
    }
  } else {
    state.feeds = [...DEFAULT_FEEDS];
  }
}

function saveFeeds() {
  localStorage.setItem('feeds', JSON.stringify(state.feeds));
}

function renderFeeds() {
  const ul = document.getElementById('feedList');
  ul.innerHTML = '';
  state.feeds.forEach((url, idx) => {
    const li = document.createElement('li');
    li.style.margin = '6px 0';
    li.innerHTML = `
      <code style="word-break:break-all">${url}</code>
      <button data-idx="${idx}" class="removeBtn" style="margin-left:10px">🗑️ 移除</button>
    `;
    ul.appendChild(li);
  });

  ul.querySelectorAll('.removeBtn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.getAttribute('data-idx'));
      state.feeds.splice(i, 1);
      saveFeeds();
      renderFeeds();
      refresh();
    });
  });
}

async function fetchFeed(url) {
  // 使用 rss2json 公开服务（基于 feed2json/Feedflare 类似服务）。若不可用，可换成你自己的代理。
  // 方案A：jsDelivr + rss2json 代理
  const api = `https://r.jina.ai/http://r.jina.ai/http://r.jina.ai/http://r.jina.ai/`;
  // 上面只是占位，真实可用且更稳定的免费方案：Jina AI Reader（将任意URL转为正文JSON），但不直接输出RSS结构。
  // 因免费CORS代理可能不稳定，这里改用另外一个简单方案：
  // 使用 https://api.rss2json.com/v1/api.json?rss_url=...
  const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;

  const res = await fetch(endpoint);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();
  if (!data || !data.items) return [];
  return data.items.map(it => ({
    title: it.title,
    link: it.link,
    author: it.author || (it.author && it.author.name) || '',
    pubDate: it.pubDate || it.pubdate || it.date || '',
    description: it.description || '',
    source: data.feed && data.feed.title ? data.feed.title : url,
  }));
}

function renderItems() {
  const container = document.getElementById('items');
  container.innerHTML = '';

  if (state.isLoading) {
    container.innerHTML = '<p>加载中...</p>';
    return;
  }

  if (state.items.length === 0) {
    container.innerHTML = '<p>暂无内容，请添加订阅源或点击刷新。</p>';
    return;
  }

  const list = document.createElement('div');
  state.items.forEach(item => {
    const card = document.createElement('div');
    card.style.margin = '12px 0';
    card.style.padding = '12px';
    card.style.border = '1px solid #eee';
    card.style.borderRadius = '8px';
    card.style.background = '#fff';

    const title = document.createElement('a');
    title.href = item.link;
    title.textContent = item.title || '无标题';
    title.target = '_blank';
    title.style.fontWeight = 'bold';
    title.style.textDecoration = 'none';
    title.style.color = '#333';

    const meta = document.createElement('div');
    meta.style.color = '#666';
    meta.style.fontSize = '12px';
    meta.textContent = `${item.source || ''}${item.author ? ' · ' + item.author : ''}${item.pubDate ? ' · ' + new Date(item.pubDate).toLocaleString() : ''}`;

    const desc = document.createElement('div');
    desc.style.marginTop = '6px';
    desc.style.color = '#555';
    desc.innerHTML = (item.description || '').slice(0, 240);

    card.appendChild(title);
    card.appendChild(meta);
    card.appendChild(desc);
    list.appendChild(card);
  });

  container.appendChild(list);
}

async function refresh() {
  state.isLoading = true;
  renderItems();
  try {
    const all = await Promise.allSettled(state.feeds.map(fetchFeed));
    const merged = [];
    for (const r of all) {
      if (r.status === 'fulfilled') merged.push(...r.value);
    }
    merged.sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    state.items = merged;
  } catch (e) {
    console.error(e);
  } finally {
    state.isLoading = false;
    renderItems();
  }
}

function bindUI() {
  const addBtn = document.getElementById('addFeedBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const input = document.getElementById('newFeedUrl');

  addBtn.addEventListener('click', () => {
    const url = input.value.trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      alert('请输入有效的 http(s) 链接');
      return;
    }
    if (!state.feeds.includes(url)) {
      state.feeds.push(url);
      saveFeeds();
      renderFeeds();
      refresh();
    }
    input.value = '';
  });

  refreshBtn.addEventListener('click', refresh);
}

document.addEventListener('DOMContentLoaded', () => {
  loadFeedsFromStorage();
  renderFeeds();
  bindUI();
  refresh();
});


