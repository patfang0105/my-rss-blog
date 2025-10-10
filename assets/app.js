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
  "https://www.wto.org/library/rss/latest_news_e.xml",
  "https://www.foreignaffairs.com/rss.xml",
  "https://www.piie.com/rss/update.xml",
  "https://amro-asia.org/feed/"
];

const state = {
  feeds: [],
  items: [],
  allItems: [], // 存储所有未过滤的文章
  isLoading: false,
  timeFilter: 'all', // 当前选择的时间筛选
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
  // 多个备用代理服务，按优先级尝试
  const PROXY_SERVICES = [
    {
      name: 'rss2json',
      endpoint: (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`,
      parser: (data) => data.items.map(it => ({
        title: it.title || '无标题',
        link: it.link || '#',
        author: it.author || '',
        pubDate: it.pubDate || it.pubdate || it.date || '',
        description: it.description || '',
        source: data.feed && data.feed.title ? data.feed.title : url,
      }))
    },
    {
      name: 'allorigins',
      endpoint: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    },
    {
      name: 'corsproxy',
      endpoint: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    }
  ];

  // 尝试每个代理服务
  for (const proxy of PROXY_SERVICES) {
    try {
      const endpoint = proxy.endpoint(url);
      const res = await fetch(endpoint, { timeout: 10000 });
      
      if (!res.ok) {
        console.warn(`${proxy.name} 获取 ${url} 失败: ${res.status}`);
        continue; // 尝试下一个代理
      }
      
      const contentType = res.headers.get('content-type') || '';
      let data;
      
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      
      if (!data) {
        console.warn(`${proxy.name} 返回空数据`);
        continue;
      }
      
      const items = proxy.parser(data);
      if (items && items.length > 0) {
        console.log(`✓ 使用 ${proxy.name} 成功获取 ${url}`);
        return items;
      }
      
    } catch (e) {
      console.warn(`${proxy.name} 代理失败:`, e.message);
      continue; // 尝试下一个代理
    }
  }
  
  console.error(`所有代理都失败，无法获取 ${url}`);
  return [];
}

// 简单的 RSS XML 解析器（用于备用代理）
function parseRSSText(xmlText, sourceUrl) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // 检查是否有解析错误
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      console.warn('XML 解析错误:', parserError.textContent);
      return [];
    }
    
    const items = [];
    const channel = xmlDoc.querySelector('channel');
    const feedTitle = channel?.querySelector('title')?.textContent || sourceUrl;
    
    // 支持 RSS 2.0 和 Atom
    const entries = xmlDoc.querySelectorAll('item, entry');
    
    entries.forEach(entry => {
      const title = entry.querySelector('title')?.textContent || '无标题';
      const link = entry.querySelector('link')?.textContent || 
                   entry.querySelector('link')?.getAttribute('href') || '#';
      const author = entry.querySelector('author, creator, dc\\:creator')?.textContent || '';
      const pubDate = entry.querySelector('pubDate, published, updated')?.textContent || '';
      const description = entry.querySelector('description, summary, content')?.textContent || '';
      
      items.push({
        title: title.trim(),
        link: link.trim(),
        author: author.trim(),
        pubDate: pubDate.trim(),
        description: description.trim(),
        source: feedTitle
      });
    });
    
    return items;
  } catch (e) {
    console.error('解析 RSS 文本失败:', e);
    return [];
  }
}

// 根据时间筛选过滤文章
function filterItemsByTime() {
  const now = Date.now();
  const hour24 = 24 * 60 * 60 * 1000;
  const week = 7 * hour24;
  const month = 30 * hour24;

  let filtered = state.allItems;
  
  if (state.timeFilter === '24h') {
    filtered = state.allItems.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= hour24;
    });
  } else if (state.timeFilter === 'week') {
    filtered = state.allItems.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= week;
    });
  } else if (state.timeFilter === 'month') {
    filtered = state.allItems.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= month;
    });
  }
  
  state.items = filtered;
  
  // 更新统计信息
  const statsEl = document.getElementById('filterStats');
  if (statsEl) {
    if (state.timeFilter === 'all') {
      statsEl.textContent = `共 ${filtered.length} 篇文章`;
    } else {
      statsEl.textContent = `筛选后: ${filtered.length} 篇 / 总计: ${state.allItems.length} 篇`;
    }
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
    if (state.allItems.length > 0) {
      container.innerHTML = '<p>当前时间范围内没有文章，请选择其他时间范围。</p>';
    } else {
      container.innerHTML = '<p>暂无内容，请添加订阅源或点击刷新。</p>';
    }
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
    
    state.allItems = merged; // 保存所有文章
    filterItemsByTime(); // 应用时间筛选
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
  
  // 绑定时间筛选单选按钮
  const timeRadios = document.querySelectorAll('input[name="timeRange"]');
  timeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.timeFilter = e.target.value;
      filterItemsByTime();
      renderItems();
      console.log(`时间筛选已更改为: ${state.timeFilter}`);
    });
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
