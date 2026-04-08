// 简易前端聚合器：合并多个 RSS 源并展示（本地浏览器运行）
// 使用多代理服务，彻底解决网络访问限制问题

const FEEDS = [
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
  "https://amro-asia.org/feed/",
  "https://politepol.com/fd/X589A2bsRjn8.xml",
  "https://cepr.org/rss/vox-content",
  "https://patfang0105.github.io/my-rss-feeds/rss_bu_gdp.xml",
  "https://think.ing.com/rss/",
  "https://www.economist.com/finance-and-economics/rss.xml"
];

const state = {
  items: [],
  allItems: [],
  isLoading: false,
  timeFilter: 'all',
};

async function fetchFeed(url) {
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
    },
    {
      name: 'thingproxy',
      endpoint: (url) => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(url)}`,
      parser: (text) => parseRSSText(text, url)
    },
    {
      name: 'cors-anywhere',
      endpoint: (url) => `https://cors-anywhere.herokuapp.com/${url}`,
      parser: (text) => parseRSSText(text, url)
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

    // 使用 Textise 代理（稳定，免VPN）
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
    if (desc.textContent) {
      card.appendChild(desc);
    }
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
      if (r.status === 'fulfilled') {
        merged.push(...r.value);
      } else {
        console.warn('某个订阅源抓取失败:', r.reason);
      }
    }
    merged.sort((a, b) => {
      const dateA = new Date(a.pubDate || 0);
      const dateB = new Date(b.pubDate || 0);
      return dateB - dateA;
    });
    state.allItems = merged;
    filterItemsByTime();
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
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => refresh());
  } else {
    console.error('找不到刷新按钮');
  }
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

// ========== AI 智能梳理功能 ==========
const AI_API_KEY = 'sk-73f087f61dac445cb086dde246685a86';  // 粘贴您的完整Key
const AI_API_URL = 'https://api.deepseek.com/v1/chat/completions';

async function getAISummary(articles) {
    const latest = articles.slice(0, 15);
    if (latest.length === 0) return '暂无文章，请稍后重试。';

    const articleList = latest.map((item, idx) => 
        `${idx+1}. 标题：${item.title}\n   链接：${item.link}`
    ).join('\n');

    const systemPrompt = `你是一位专业的研究助手。用户给你一系列最新文章的标题和链接，请你：
1. 从中挑选出 3-5 篇最值得关注的文章（基于内容重要性、时效性、智库权威性）。
2. 对每一篇推荐的文章，用一句话说明需要关注理由（50字以内）。
3. 以友好的中文输出，格式为：
   【推荐一】
   文章：标题
   理由：...
   链接：直接输出完整URL
   每篇之间空一行。不要输出额外解释。`;

    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: `请分析以下文章并推荐：\n${articleList}` }
                ],
                temperature: 0.3,
                max_tokens: 800
            })
        });

        if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
        const data = await response.json();
        let aiText = data.choices[0].message.content;
        aiText = aiText.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');
        aiText = aiText.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
        aiText = aiText.replace(/\n/g, '<br>');
        return aiText;
    } catch (error) {
        console.error('AI 摘要失败:', error);
        return 'AI 服务暂时不可用，请稍后重试。';
    }
}

function bindAIButton() {
    const btn = document.getElementById('aiSummaryBtn');
    const contentDiv = document.getElementById('aiSummaryContent');
    if (!btn || !contentDiv) return;

    btn.addEventListener('click', async () => {
        if (state.allItems.length === 0) {
            contentDiv.innerHTML = '⚠️ 暂无文章，请先点击“刷新内容”加载文章。';
            return;
        }
        contentDiv.innerHTML = '🤔 AI 正在分析最新文章，请稍候...';
        const summary = await getAISummary(state.allItems);
        contentDiv.innerHTML = summary;
    });
}

document.addEventListener('DOMContentLoaded', () => {
  console.log('RSS 聚合器初始化中...');
  bindUI();
  bindAIButton();   // <--- 添加这一行
  refresh();
});
