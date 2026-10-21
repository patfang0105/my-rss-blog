// 简易前端聚合器：合并多个 RSS 源并展示
// 优化了多代理服务，提高抓取稳定性

const FEEDS = [
  "https://www.atlanticcouncil.org/feed/",
  "http://project-syndicate.org/rss",
  "https://www.aei.org/feed/",
  "https://www.wto.org/library/rss/latest_news_e.xml",
  "https://www.foreignaffairs.com/rss.xml",
  "https://www.piie.com/rss/update.xml",
  "https://amro-asia.org/feed/",
  "https://cepr.org/rss/vox-content",
  "https://www.bu.edu/gdp/feed/",
  "https://think.ing.com/rss/",
  "https://www.economist.com/finance-and-economics/rss.xml",
  "https://patfang0105.github.io/my-rss-blog/custom_feed.xml",
  "https://www.ft.com/china?format=rss",
  "https://www.ft.com/opinion?format=rss",
  "https://feeds.content.dowjones.io/public/rss/RSSOpinion",
  "https://feeds.content.dowjones.io/public/rss/RSSWorldNews",
  "https://feeds.bloomberg.com/markets/news.rss",
  "https://www.mckinsey.com/insights/rss",
  "https://www.chathamhouse.org/path/83/feed.xml",
  "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114",
  "https://www.oxfordeconomics.com/feed/",
  "https://api.oecd.org/webcms/search/rss?siteName=oecd&interfaceLanguage=en&hiddenFacets=oecd-search-config-pillars%3Apublications&facets=oecd-languages%3Aen",
  "https://kill-the-newsletter.com/feeds/h51uj1qrka13lel7jfvj.xml",
  "https://kill-the-newsletter.com/feeds/fz85qbrcrtd4ka2iukg9.xml",
  "https://rss.app/feeds/hHWon0umvxdjhouR.xml",
  "https://kill-the-newsletter.com/feeds/fli2m1wthbxvdarcsltq.xml",
  "https://rss.app/feeds/v0VR4ZPj5fTGqlK9.xml"
];

const state = {
  items: [],
  allItems: [],
  isLoading: false,
  timeFilter: 'all',
};

let currentSource = 'all';

// ========== RSS 抓取部分（多代理）==========
async function fetchFeed(url) {
  // 优化了代理列表，将更稳定的代理放在前面
  const PROXY_SERVICES = [
    {
      name: 'codetabs',
      endpoint: (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    },
    {
      name: 'corsproxy',
      endpoint: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    },
    {
      name: 'isomorphic-git',
      endpoint: (url) => `https://cors.isomorphic-git.org/${url}`,
      parser: (text) => parseRSSText(text, url)
    },
    {
      name: 'allorigins',
      endpoint: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    },
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
    }
  ];

  for (const proxy of PROXY_SERVICES) {
    try {
      const endpoint = proxy.endpoint(url);
      const res = await fetch(endpoint, { timeout: 10000 });
      if (!res.ok) continue;
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      if (!data) continue;
      const items = proxy.parser(data);
      if (items && items.length > 0) {
        console.log(`✓ 使用 ${proxy.name} 成功获取 ${url}`);
        return items;
      }
    } catch (e) {
      console.warn(`${proxy.name} 代理失败:`, e.message);
      continue;
    }
  }
  console.error(`所有代理都失败，无法获取 ${url}`);
  return [];
}

function parseRSSText(xmlText, sourceUrl) {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) return [];
    const items = [];
    const channel = xmlDoc.querySelector('channel');
    const feedTitle = channel?.querySelector('title')?.textContent || sourceUrl;
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

// ========== 筛选与渲染核心 ==========
function applyFilters() {
  let filtered = state.allItems;
  const now = Date.now();
  const hour24 = 24 * 60 * 60 * 1000;
  const week = 7 * hour24;
  const month = 30 * hour24;

  if (state.timeFilter === '24h') {
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= hour24;
    });
  } else if (state.timeFilter === 'week') {
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= week;
    });
  } else if (state.timeFilter === 'month') {
    filtered = filtered.filter(item => {
      const itemDate = new Date(item.pubDate || 0).getTime();
      return now - itemDate <= month;
    });
  }

  if (currentSource !== 'all') {
    filtered = filtered.filter(item => (item.source || '未知来源') === currentSource);
  }

  state.items = filtered;

  const statsEl = document.getElementById('filterStats');
  if (statsEl) {
    if (state.timeFilter === 'all' && currentSource === 'all') {
      statsEl.textContent = `共 ${filtered.length} 篇文章`;
    } else {
      let msg = `筛选后: ${filtered.length} 篇 / 总计: ${state.allItems.length} 篇`;
      if (currentSource !== 'all') msg += ` · 来源: ${currentSource}`;
      statsEl.textContent = msg;
    }
  }
}

function getSourceStats() {
  const stats = new Map();
  state.allItems.forEach(item => {
    const source = item.source || '未知来源';
    stats.set(source, (stats.get(source) || 0) + 1);
  });
  return Array.from(stats.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// ========== 名称映射表 ==========
const SOURCE_NAME_MAP = {
    "China": "Financial Times - China",
    "Opinion": "Financial Times - Opinion",
    "Finance &amp; economics": "The Economist - Finance & economics",
    "FA RSS":"Foreign Affairs",
    "AI 智库跟踪-自定义聚合":"CSIS & Brookings",
    "RSSOpinion":"WSJ.com Opinion"
    // 可以在这里继续添加映射
};

function renderSourceList() {
  const container = document.getElementById('sourceListItems');
  if (!container) return;
  if (state.allItems.length === 0) {
    container.innerHTML = '<p>暂无数据</p>';
    return;
  }
  const sources = getSourceStats();
  let html = `<div style="margin-bottom: 8px;">
    <a href="#" data-source="all" class="source-filter-link" style="display: block; padding: 6px 10px; background: ${currentSource === 'all' ? '#007acc' : 'transparent'}; color: ${currentSource === 'all' ? 'white' : '#333'}; text-decoration: none; border-radius: 6px; margin-bottom: 4px; font-weight: ${currentSource === 'all' ? 'bold' : 'normal'};">
      📋 全部 <span style="float: right; opacity: 0.8;">${state.allItems.length}</span>
    </a>
  </div>`;
  sources.forEach(source => {
    let displayName = SOURCE_NAME_MAP[source.name] || source.name;
    const isActive = (currentSource === source.name);
    html += `<div style="margin-bottom: 4px;">
      <a href="#" data-source="${escapeHtml(source.name)}" class="source-filter-link" style="display: block; padding: 6px 10px; background: ${isActive ? '#007acc' : 'transparent'}; color: ${isActive ? 'white' : '#333'}; text-decoration: none; border-radius: 6px; font-size: 13px;">
        📄 ${escapeHtml(displayName)} <span style="float: right; opacity: 0.8;">${source.count}</span>
      </a>
    </div>`;
  });
  container.innerHTML = html;
  document.querySelectorAll('.source-filter-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const source = link.getAttribute('data-source');
      currentSource = source === 'all' ? 'all' : source;
      applyFilters();
      renderSourceList();
      renderItems();
    });
  });
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
      container.innerHTML = '<p>当前筛选条件下没有文章，请调整筛选条件。</p>';
    } else {
      container.innerHTML = '<p>暂无内容，请点击刷新按钮加载文章。</p>';
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
    title.title = '直接访问（可能需要 VPN）';

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
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = item.description || '';
    const plainText = tempDiv.textContent || tempDiv.innerText || '';
    desc.textContent = plainText.slice(0, 200) + (plainText.length > 200 ? '...' : '');

    const proxyContainer = document.createElement('div');
    proxyContainer.style.marginTop = '8px';
    proxyContainer.style.display = 'flex';
    proxyContainer.style.gap = '8px';
    proxyContainer.style.flexWrap = 'wrap';
    proxyContainer.style.alignItems = 'center';

    // Textise 代理阅读按钮
    const fullTextBtn = document.createElement('a');
    fullTextBtn.href = `https://www.textise.net/showText.aspx?strURL=${encodeURIComponent(encodeURIComponent(item.link))}`;
    fullTextBtn.target = '_blank';
    fullTextBtn.textContent = '📖 阅读全文（Textise）';
    fullTextBtn.style.display = 'inline-block';
    fullTextBtn.style.padding = '4px 12px';
    fullTextBtn.style.background = '#ff5722';
    fullTextBtn.style.color = 'white';
    fullTextBtn.style.textDecoration = 'none';
    fullTextBtn.style.borderRadius = '4px';
    fullTextBtn.style.fontSize = '12px';
    fullTextBtn.style.fontWeight = 'bold';
    fullTextBtn.style.cursor = 'pointer';
    fullTextBtn.title = '通过 Textise 代理阅读全文（免VPN）';

    const originalBtn = document.createElement('a');
    originalBtn.href = item.link;
    originalBtn.target = '_blank';
    originalBtn.textContent = '🔗 原文';
    originalBtn.style.display = 'inline-block';
    originalBtn.style.padding = '4px 12px';
    originalBtn.style.background = '#607d8b';
    originalBtn.style.color = 'white';
    originalBtn.style.textDecoration = 'none';
    originalBtn.style.borderRadius = '4px';
    originalBtn.style.fontSize = '12px';
    originalBtn.title = '直接访问原网站（可能需要VPN）';

    proxyContainer.appendChild(fullTextBtn);
    proxyContainer.appendChild(originalBtn);

    card.appendChild(title);
    card.appendChild(meta);
    if (desc.textContent) card.appendChild(desc);
    card.appendChild(proxyContainer);
    list.appendChild(card);
  });
  container.appendChild(list);
}

async function refresh() {
  state.isLoading = true;
  renderItems();
  try {
    console.log('开始刷新 RSS 源...');
    const all = await Promise.allSettled(FEEDS.map(fetchFeed));
    const merged = [];
    for (const r of all) {
      if (r.status === 'fulfilled') merged.push(...r.value);
      else console.warn('某个订阅源抓取失败:', r.reason);
    }
    merged.sort((a, b) => {
      const dateA = new Date(a.pubDate || 0);
      const dateB = new Date(b.pubDate || 0);
      return dateB - dateA;
    });
    state.allItems = merged;
    currentSource = 'all';
    applyFilters();
    renderSourceList();
    renderItems();
    console.log(`成功加载 ${merged.length} 篇文章`);
  } catch (e) {
    console.error('刷新时出错:', e);
    alert('刷新失败，请查看浏览器控制台了解详情');
  } finally {
    state.isLoading = false;
    renderItems();
  }
}

// ========== UI 绑定与初始化 ==========
function bindUI() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => refresh());
  else console.error('找不到刷新按钮');

  const timeRadios = document.querySelectorAll('input[name="timeRange"]');
  timeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      state.timeFilter = e.target.value;
      applyFilters();
      renderSourceList();
      renderItems();
      console.log(`时间筛选已更改为: ${state.timeFilter}`);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('RSS 聚合器初始化中...');
  bindUI();
  refresh(); // 加载文章
});
