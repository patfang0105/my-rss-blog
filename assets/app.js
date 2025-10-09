// 简易前端聚合器：合并多个 RSS 源并展示（本地浏览器运行）
// 说明：浏览器直接抓取跨域 RSS 需要 CORS 代理，这里默认用 rss2json 免费方案

const DEFAULT_FEEDS = [
  "https://patfang0105.github.io/my-rss-feeds/rss_www_csis_org.xml",
  "https://patfang0105.github.io/my-rss-feeds/rss_www_cfr_org.xml",
  "https://www.atlanticcouncil.org/feed/",
  "https://www.imf.org/en/publications/rss?language=eng",
  "http://project-syndicate.org/rss",
  "https://rhg.com/feed/",
  "https://www.aei.org/feed/",
  "https://www.wto.org/library/rss/latest_news_e.xml"
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
  if (!ul) return;
  
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
  try {
    // 使用 rss2json 公开服务转换 RSS
    const endpoint = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
    
    const res = await fetch(endpoint);
    if (!res.ok) {
      console.warn(`获取 ${url} 失败: ${res.status}`);
      return [];
    }
    
    const data = await res.json();
    if (!data || !data.items) {
      console.warn(`${url} 返回数据格式不正确`);
      return [];
    }
    
    return data.items.map(it => ({
      title: it.title || '无标题',
      link: it.link || '#',
      author: it.author || '',
      pubDate: it.pubDate || it.pubdate || it.date || '',
      description: it.description || '',
      source: data.feed && data.feed.title ? data.feed.title : url,
    }));
  } catch (e) {
    console.error(`抓取 ${url} 时出错:`, e);
    return [];
  }
}

function renderItems() {
  const container = document.getElementById('items');
  if (!container) return;
  
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
    let metaText = item.source || '';
    if (item.author) metaText += ' · ' + item.author;
    if (item.pubDate) {
      try {
        metaText += ' · ' + new Date(item.pubDate).toLocaleString('zh-CN');
      } catch {
        metaText += ' · ' + item.pubDate;
      }
    }
    meta.textContent = metaText;

    const desc = document.createElement('div');
    desc.style.marginTop = '6px';
    desc.style.color = '#555';
    desc.style.fontSize = '14px';
    // 移除 HTML 标签，只保留纯文本
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = item.description || '';
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    desc.textContent = plainText.slice(0, 200) + (plainText.length > 200 ? '...' : '');

    card.appendChild(title);
    card.appendChild(meta);
    if (desc.textContent) {
      card.appendChild(desc);
    }
    list.appendChild(card);
  });

  container.appendChild(list);
}

async function refresh() {
  state.isLoading = true;
  renderItems();
  
  try {
    console.log('开始刷新 RSS 源...');
    const all = await Promise.allSettled(state.feeds.map(fetchFeed));
    const merged = [];
    
    for (const r of all) {
      if (r.status === 'fulfilled') {
        merged.push(...r.value);
      } else {
        console.warn('某个订阅源抓取失败:', r.reason);
      }
    }
    
    // 按时间排序
    merged.sort((a, b) => {
      const dateA = new Date(a.pubDate || 0);
      const dateB = new Date(b.pubDate || 0);
      return dateB - dateA;
    });
    
    state.items = merged;
    console.log(`成功加载 ${merged.length} 篇文章`);
  } catch (e) {
    console.error('刷新时出错:', e);
    alert('刷新失败，请查看浏览器控制台了解详情');
  } finally {
    state.isLoading = false;
    renderItems();
  }
}

function bindUI() {
  const addBtn = document.getElementById('addFeedBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const input = document.getElementById('newFeedUrl');

  if (!addBtn || !refreshBtn || !input) {
    console.error('找不到必要的 UI 元素');
    return;
  }

  addBtn.addEventListener('click', () => {
    const url = input.value.trim();
    if (!url) {
      alert('请输入 RSS 链接');
      return;
    }
    if (!/^https?:\/\//.test(url)) {
      alert('请输入有效的 http(s) 链接');
      return;
    }
    if (state.feeds.includes(url)) {
      alert('该订阅源已存在');
      return;
    }
    
    state.feeds.push(url);
    saveFeeds();
    renderFeeds();
    refresh();
    input.value = '';
  });

  refreshBtn.addEventListener('click', () => {
    refresh();
  });
  
  // 支持回车添加
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addBtn.click();
    }
  });
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('RSS 聚合器初始化中...');
  loadFeedsFromStorage();
  renderFeeds();
  bindUI();
  refresh();
});
