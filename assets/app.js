// 简易前端聚合器：合并多个 RSS 源并展示（本地浏览器运行）
// 使用多代理服务，彻底解决网络访问限制问题

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
  "https://kill-the-newsletter.com/feeds/k7hkvb3zqarpzkm271ba.xml",
  "https://kill-the-newsletter.com/feeds/fli2m1wthbxvdarcsltq.xml",
  "https://kill-the-newsletter.com/feeds/3e9tv7gzznjb93be3ndd.xml"
];

const state = {
  items: [],
  allItems: [],
  isLoading: false,
  timeFilter: 'all',
};

let currentSource = 'all';

// ========== 个人偏好管理（localStorage）==========
const MY_PREF_KEY = 'my_preferences';

function getMyPreferences() {
    try {
        const data = localStorage.getItem(MY_PREF_KEY);
        return data ? JSON.parse(data) : { keywords: [], exclude: [] };
    } catch { return { keywords: [], exclude: [] }; }
}

function saveMyPreferences(pref) {
    localStorage.setItem(MY_PREF_KEY, JSON.stringify(pref));
}

// 添加一个喜欢的关键词
function addLikeKeyword(keyword) {
    keyword = keyword.trim();
    if (!keyword) return false;
    const pref = getMyPreferences();
    if (!pref.keywords.includes(keyword)) {
        pref.keywords.push(keyword);
        saveMyPreferences(pref);
        renderPreferenceUI();
        return true;
    }
    return false;
}

// 添加一个不喜欢的关键词（排除）
function addDislikeKeyword(keyword) {
    keyword = keyword.trim();
    if (!keyword) return false;
    const pref = getMyPreferences();
    if (!pref.exclude.includes(keyword)) {
        pref.exclude.push(keyword);
        saveMyPreferences(pref);
        renderPreferenceUI();
        return true;
    }
    return false;
}

// 删除关键词
function removePreferenceKeyword(type, keyword) {
    const pref = getMyPreferences();
    if (type === 'like') {
        pref.keywords = pref.keywords.filter(k => k !== keyword);
    } else if (type === 'exclude') {
        pref.exclude = pref.exclude.filter(k => k !== keyword);
    }
    saveMyPreferences(pref);
    renderPreferenceUI();
}

// 清空所有偏好
function clearAllPreferences() {
    saveMyPreferences({ keywords: [], exclude: [] });
    renderPreferenceUI();
}

// 导出偏好（生成JSON文本供复制到preferences.json）
function exportPreferences() {
    const pref = getMyPreferences();
    const json = JSON.stringify(pref, null, 2);
    // 弹窗显示，方便复制
    const textarea = document.createElement('textarea');
    textarea.value = json;
    textarea.style.width = '100%';
    textarea.style.height = '150px';
    textarea.style.padding = '8px';
    textarea.style.boxSizing = 'border-box';
    const container = document.createElement('div');
    container.style.padding = '10px';
    container.innerHTML = '<p style="margin-top:0;">复制以下 JSON 内容，然后粘贴到 GitHub 仓库的 <code>preferences.json</code> 文件中：</p>';
    container.appendChild(textarea);
    const btn = document.createElement('button');
    btn.textContent = '复制到剪贴板';
    btn.style.margin = '10px 0';
    btn.className = 'rss-link';
    btn.style.background = '#28a745';
    btn.onclick = () => {
        navigator.clipboard.writeText(json).then(() => {
            alert('已复制！请前往 GitHub 粘贴到 preferences.json');
        }).catch(() => {
            // fallback
            textarea.select();
            document.execCommand('copy');
            alert('已复制！请前往 GitHub 粘贴到 preferences.json');
        });
    };
    container.appendChild(btn);
    // 用模态框显示
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.width = '100%'; overlay.style.height = '100%';
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    const box = document.createElement('div');
    box.style.background = 'white';
    box.style.borderRadius = '12px';
    box.style.padding = '20px';
    box.style.maxWidth = '600px';
    box.style.maxHeight = '80vh';
    box.style.overflow = 'auto';
    box.appendChild(container);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.marginTop = '10px';
    closeBtn.className = 'rss-link';
    closeBtn.style.background = '#6c757d';
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

// 渲染偏好UI
function renderPreferenceUI() {
    const container = document.getElementById('preferenceKeywords');
    if (!container) return;
    const pref = getMyPreferences();
    const all = [...pref.keywords, ...pref.exclude.map(k => '🚫' + k)];
    if (all.length === 0) {
        container.innerHTML = '<span style="color: #999;">暂无偏好，点击文章下方的 👍 开始调教</span>';
        return;
    }
    container.innerHTML = all.map(item => {
        const isExclude = item.startsWith('🚫');
        const kw = isExclude ? item.slice(2) : item;
        const color = isExclude ? '#dc3545' : '#28a745';
        return `<span style="background: ${color}20; padding: 4px 10px; border-radius: 20px; display: inline-flex; align-items: center; border: 1px solid ${color};">
            ${isExclude ? '👎' : '👍'} ${kw}
            <span style="cursor: pointer; margin-left: 6px; color: #dc3545;" data-type="${isExclude ? 'exclude' : 'like'}" data-keyword="${kw}">✕</span>
        </span>`;
    }).join('');
    // 绑定删除事件
    container.querySelectorAll('span[data-keyword]').forEach(el => {
        el.addEventListener('click', (e) => {
            const type = e.target.getAttribute('data-type');
            const kw = e.target.getAttribute('data-keyword');
            removePreferenceKeyword(type, kw);
        });
    });
}
// ========== 偏好管理结束 ==========

// ========== RSS 抓取部分（多代理）==========
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

// ========== 添加名称映射表 ==========
const SOURCE_NAME_MAP = {
    "China": "Financial Times - China",
    "Opinion": "Financial Times - Opinion",
    "Finance &amp; economics": "The Economist - Finance & economics",
    "FA RSS":"Foreign Affairs",
    "AI 智库跟踪-自定义聚合":"CSIS & Brookings",
    "RSSOpinion":"WSJ.com Opinion"
    // 后续可以在这里添加更多映射，格式："原始名称": "希望显示的名称",
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
    // 使用映射后的名称，如果没有映射则使用原名
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

    // Textise 代理阅读按钮（正确双重编码）
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

    // ================= 添加反馈按钮（喜欢 / 不喜欢）=================
    const feedbackContainer = document.createElement('div');
    feedbackContainer.style.display = 'flex';
    feedbackContainer.style.gap = '6px';
    feedbackContainer.style.marginLeft = 'auto';
    feedbackContainer.style.alignItems = 'center';

    // 从标题提取实词（用于自动生成关键词建议）
    function extractKeywordsFromTitle(title) {
        const stopwords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '它', '她', '他', '们', '与', '或', '但', '而', '等', '及', '对', '从', '向', '以', '于', '之', '这', '那', '及', '于', '与'];
        const words = title.split(/[\s,，、：:;；.。!！?？"“”‘’'\-—]/);
        const candidates = words.filter(w => w.length > 1 && !stopwords.includes(w) && !/^\d+$/.test(w));
        return candidates.slice(0, 3);
    }

    // 喜欢按钮
    const likeBtn = document.createElement('button');
    likeBtn.textContent = '👍';
    likeBtn.style.background = 'none';
    likeBtn.style.border = '1px solid #28a745';
    likeBtn.style.borderRadius = '4px';
    likeBtn.style.cursor = 'pointer';
    likeBtn.style.fontSize = '14px';
    likeBtn.style.padding = '2px 8px';
    likeBtn.title = '我喜欢这篇文章，添加偏好关键词';
    likeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const suggested = extractKeywordsFromTitle(item.title);
        // 构建模态框让用户编辑关键词
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
        const box = document.createElement('div');
        box.style.cssText = 'background:white;border-radius:12px;padding:20px;max-width:500px;width:90%;';
        box.innerHTML = `
            <h4 style="margin-top:0;">👍 添加偏好关键词</h4>
            <p>请输入您关心的关键词（多个用逗号、顿号或空格分隔）：</p>
            <input id="likeKeywordInput" type="text" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;" value="${suggested.join('、')}" placeholder="例如：贸易战, 供应链, 关税">
            <div style="margin-top:12px;display:flex;gap:8px;">
                <button id="confirmLikeBtn" class="rss-link" style="background:#28a745;padding:6px 15px;">确认</button>
                <button id="cancelLikeBtn" class="rss-link" style="background:#6c757d;padding:6px 15px;">取消</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('confirmLikeBtn').onclick = () => {
            const input = document.getElementById('likeKeywordInput');
            const raw = input.value.trim();
            if (!raw) {
                alert('请输入至少一个关键词。');
                return;
            }
            const keywords = raw.split(/[，,、\s]+/).filter(k => k.length > 0);
            if (keywords.length === 0) {
                alert('请输入有效关键词。');
                return;
            }
            let added = 0;
            keywords.forEach(kw => { if (addLikeKeyword(kw)) added++; });
            if (added > 0) {
                likeBtn.textContent = '✅';
                likeBtn.style.borderColor = '#28a745';
                likeBtn.style.background = '#d4edda';
                renderPreferenceUI();
                alert(`已添加关键词：${keywords.join('、')}`);
            } else {
                alert('所有关键词已存在。');
            }
            overlay.remove();
        };
        document.getElementById('cancelLikeBtn').onclick = () => {
            overlay.remove();
        };
    });

    // 不喜欢按钮
    const dislikeBtn = document.createElement('button');
    dislikeBtn.textContent = '👎';
    dislikeBtn.style.background = 'none';
    dislikeBtn.style.border = '1px solid #dc3545';
    dislikeBtn.style.borderRadius = '4px';
    dislikeBtn.style.cursor = 'pointer';
    dislikeBtn.style.fontSize = '14px';
    dislikeBtn.style.padding = '2px 8px';
    dislikeBtn.title = '我不喜欢这类文章，排除关键词';
    dislikeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const suggested = extractKeywordsFromTitle(item.title);
        // 构建模态框让用户编辑排除关键词
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;';
        const box = document.createElement('div');
        box.style.cssText = 'background:white;border-radius:12px;padding:20px;max-width:500px;width:90%;';
        box.innerHTML = `
            <h4 style="margin-top:0;">👎 添加排除关键词</h4>
            <p>请输入您不关心的关键词（多个用逗号、顿号或空格分隔）：</p>
            <input id="dislikeKeywordInput" type="text" style="width:100%;padding:8px;border:1px solid #ccc;border-radius:4px;box-sizing:border-box;" value="${suggested.join('、')}" placeholder="例如：活动, 招聘, 公告">
            <div style="margin-top:12px;display:flex;gap:8px;">
                <button id="confirmDislikeBtn" class="rss-link" style="background:#dc3545;padding:6px 15px;">确认</button>
                <button id="cancelDislikeBtn" class="rss-link" style="background:#6c757d;padding:6px 15px;">取消</button>
            </div>
        `;
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        document.getElementById('confirmDislikeBtn').onclick = () => {
            const input = document.getElementById('dislikeKeywordInput');
            const raw = input.value.trim();
            if (!raw) {
                alert('请输入至少一个关键词。');
                return;
            }
            const keywords = raw.split(/[，,、\s]+/).filter(k => k.length > 0);
            if (keywords.length === 0) {
                alert('请输入有效关键词。');
                return;
            }
            let added = 0;
            keywords.forEach(kw => { if (addDislikeKeyword(kw)) added++; });
            if (added > 0) {
                dislikeBtn.textContent = '✅';
                dislikeBtn.style.borderColor = '#dc3545';
                dislikeBtn.style.background = '#f8d7da';
                renderPreferenceUI();
                alert(`已排除关键词：${keywords.join('、')}`);
            } else {
                alert('所有关键词已在排除列表中。');
            }
            overlay.remove();
        };
        document.getElementById('cancelDislikeBtn').onclick = () => {
            overlay.remove();
        };
    });

    feedbackContainer.appendChild(likeBtn);
    feedbackContainer.appendChild(dislikeBtn);
    proxyContainer.appendChild(feedbackContainer);
    // ================= 反馈按钮结束 =================

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
    // 刷新完成后自动生成 AI 推荐（延迟 500ms 确保 DOM 更新）
    setTimeout(() => loadRecommendations(), 500);
  }
}

// ========== AI 智能梳理（分析所有文章，不限制来源）==========
// 请到 https://cloud.siliconflow.cn/ 注册，获取 API Key，替换下面的字符串
const AI_API_KEY = 'sk-ahfjemfxrpxpgjozrzwmnmncxyuyhonqlepfllikksnwrand';   // 请替换为你的真实 API Key
const AI_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';

async function getAISummary(articles) {
    if (!articles || articles.length === 0) {
        return '暂无文章。';
    }
    // 只取最新 15 篇
    const latest = articles.slice(0, 15);
    
    const articleList = latest.map((item, idx) => 
        `${idx+1}. 标题：${item.title}\n   来源：${item.source || '未知'}\n   日期：${item.pubDate || ''}\n   链接：${item.link}`
    ).join('\n');
    
    // ========== 获取个人偏好，融入推荐 ==========
    const myPref = getMyPreferences();
    let preferenceHint = '';
    if (myPref.keywords.length > 0) {
        preferenceHint = `\n\n用户特别关注以下话题：${myPref.keywords.join('、')}。在筛选时请优先考虑与这些话题相关的文章。`;
    }
    if (myPref.exclude.length > 0) {
        preferenceHint += `\n\n同时，请尽量避免推荐明显涉及以下内容的文章：${myPref.exclude.join('、')}。`;
    }
    // ===========================================

    const systemPrompt = `你是一位专业的经济与国际关系研究助手。请从以下文章中筛选出最重要的 3-5 篇进行推荐。

筛选标准：符合下列条件之一即可
- 涉及国际贸易、多边机构治理、宏观经济、产业政策
- 涉及能源安全、技术竞争、地缘政治、供应链重组
- 推荐深度分析或研究报告，不推荐Event等研讨会的内容
- 推荐发布时间为最近一周以内的更新

${preferenceHint}

输出格式（严格按此格式，不要输出额外内容）：
【推荐一】
文章：完整标题
日期：YYYY-MM-DD（如果文章中有日期，否则可省略）
理由：一句话推荐理由（指出相关领域）
链接：原始链接

如果没有合适的文章，只输出：“今日暂无符合标准的高价值文章。”
`;
    
    const userPrompt = `请分析以下文章并推荐：\n${articleList}`;
    
    try {
        const response = await fetch(AI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen2.5-72B-Instruct',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                temperature: 0.2,
                max_tokens: 1200
            })
        });
        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`API 请求失败: ${response.status} - ${errText}`);
        }
        const data = await response.json();
        let aiText = data.choices[0].message.content;
        // 将文本中的链接转换为 Textise 代理链接
        aiText = aiText.replace(/(https?:\/\/[^\s]+)/g, function(url) {
            const proxyUrl = `https://www.textise.net/showText.aspx?strURL=${encodeURIComponent(encodeURIComponent(url))}`;
            return `<a href="${proxyUrl}" target="_blank">${url}</a>`;
        });
        aiText = aiText.replace(/\n/g, '<br>');
        return aiText;
    } catch (error) {
        console.error('AI 摘要失败:', error);
        return `AI 服务暂时不可用：${error.message}`;
    }
}

async function loadRecommendations() {
    const container = document.getElementById('recommendationsList');
    if (!container) return;
    
    if (state.allItems.length === 0) {
        container.innerHTML = '暂无文章，请稍后刷新页面。';
        return;
    }
    
    container.innerHTML = '🤔 AI 正在分析最新文章，请稍候...';
    try {
        const summary = await getAISummary(state.allItems);
        container.innerHTML = summary;
    } catch (err) {
        console.error(err);
        container.innerHTML = 'AI 推荐暂时不可用，请稍后重试。';
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
  refresh();               // 加载文章，完成后会自动调用 AI 推荐
  renderPreferenceUI();    // 显示偏好管理界面
});
