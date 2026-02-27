/* app.js — Client-side logic for DevBots Artifact Gallery */
'use strict';

// ============================================================
// Utilities
// ============================================================

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

// Map file extension → display category + emoji
const EXT_MAP = {
  md: { cat: 'doc', icon: '📄', label: 'Markdown' },
  html: { cat: 'doc', icon: '🌐', label: 'HTML' },
  js: { cat: 'code', icon: '📜', label: 'JavaScript' },
  ts: { cat: 'code', icon: '📘', label: 'TypeScript' },
  py: { cat: 'code', icon: '🐍', label: 'Python' },
  sh: { cat: 'code', icon: '🖥️', label: 'Shell' },
  json: { cat: 'data', icon: '📋', label: 'JSON' },
  yaml: { cat: 'data', icon: '📋', label: 'YAML' },
  yml: { cat: 'data', icon: '📋', label: 'YAML' },
  xml: { cat: 'data', icon: '📋', label: 'XML' },
  css: { cat: 'code', icon: '🎨', label: 'CSS' },
  scss: { cat: 'code', icon: '🎨', label: 'SCSS' },
  png: { cat: 'image', icon: '🖼️', label: 'PNG' },
  jpg: { cat: 'image', icon: '🖼️', label: 'JPEG' },
  jpeg: { cat: 'image', icon: '🖼️', label: 'JPEG' },
  gif: { cat: 'image', icon: '🖼️', label: 'GIF' },
  svg: { cat: 'image', icon: '🖼️', label: 'SVG' },
  webp: { cat: 'image', icon: '🖼️', label: 'WebP' },
  wasm: { cat: 'binary', icon: '⚙️', label: 'WASM' },
  txt: { cat: 'doc', icon: '📄', label: 'Text' },
  csv: { cat: 'data', icon: '📊', label: 'CSV' },
  toml: { cat: 'data', icon: '📋', label: 'TOML' },
  dockerfile: { cat: 'code', icon: '🐳', label: 'Dockerfile' },
};

function extInfo(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  return EXT_MAP[ext] || { cat: 'doc', icon: '📄', label: ext.toUpperCase() || 'File' };
}

// ============================================================
// View / routing
// ============================================================

function showView(name) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  const view = document.getElementById(`view-${name}`);
  if (view) view.classList.add('active');
  const link = document.querySelector(`.nav-link[data-view="${name}"]`);
  if (link) link.classList.add('active');
  if (name === 'gallery') loadGallery();
  if (name === 'home') loadStats();
}

// Toolbar nav links
document.querySelectorAll('.nav-link[data-view]').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    showView(link.dataset.view);
    history.replaceState(null, '', `#${link.dataset.view}`);
  });
});

// Hero / inline buttons that navigate to another view
document.querySelectorAll('[data-goto]').forEach(btn => {
  btn.addEventListener('click', e => {
    e.preventDefault();
    showView(btn.dataset.goto);
  });
});

// Handle initial hash
(function () {
  const hash = (location.hash || '#home').replace('#', '');
  const valid = ['home', 'gallery', 'upload', 'settings'];
  showView(valid.includes(hash) ? hash : 'home');
})();

// ============================================================
// Stats (Home)
// ============================================================

async function loadStats() {
  try {
    const artifacts = await fetchArtifacts();
    document.getElementById('stat-total').textContent = artifacts.length;
    const totalBytes = artifacts.reduce((s, a) => s + (a.size || 0), 0);
    document.getElementById('stat-size').textContent = formatSize(totalBytes);
    const types = new Set(artifacts.map(a => extInfo(a.originalName).cat));
    document.getElementById('stat-types').textContent = types.size;
  } catch {
    // silently ignore on load
  }
}

// ============================================================
// API helpers
// ============================================================

async function fetchArtifacts() {
  const res = await fetch('/api/artifacts');
  if (!res.ok) throw new Error('Failed to load artifacts');
  return res.json();
}

async function deleteArtifact(id) {
  const res = await fetch(`/api/artifacts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
  return res.json();
}

// ============================================================
// Gallery
// ============================================================

let allArtifacts = [];
let selectedIds = new Set();
let viewMode = 'grid'; // 'grid' | 'list'

document.getElementById('view-grid').addEventListener('click', () => {
  viewMode = 'grid';
  document.getElementById('view-grid').classList.add('active');
  document.getElementById('view-list').classList.remove('active');
  const grid = document.getElementById('gallery-grid');
  grid.classList.remove('list-view');
});

document.getElementById('view-list').addEventListener('click', () => {
  viewMode = 'list';
  document.getElementById('view-list').classList.add('active');
  document.getElementById('view-grid').classList.remove('active');
  const grid = document.getElementById('gallery-grid');
  grid.classList.add('list-view');
});

document.getElementById('search-input').addEventListener('input', renderGallery);
document.getElementById('filter-type').addEventListener('change', renderGallery);
document.getElementById('sort-by').addEventListener('change', renderGallery);

document.getElementById('bulk-delete-btn').addEventListener('click', async () => {
  if (!selectedIds.size) return;
  if (!confirm(`Delete ${selectedIds.size} artifact(s)?`)) return;
  for (const id of selectedIds) {
    try { await deleteArtifact(id); } catch { /* continue */ }
  }
  selectedIds.clear();
  loadGallery();
});

document.getElementById('deselect-all-btn').addEventListener('click', () => {
  selectedIds.clear();
  renderGallery();
  updateBulkBar();
});

async function loadGallery() {
  try {
    allArtifacts = await fetchArtifacts();
    selectedIds.clear();
    updateBulkBar();
    renderGallery();
  } catch {
    document.getElementById('gallery-empty').style.display = 'block';
    document.getElementById('gallery-grid').innerHTML = '';
  }
}

function renderGallery() {
  const query = document.getElementById('search-input').value.toLowerCase();
  const filterCat = document.getElementById('filter-type').value;
  const sortBy = document.getElementById('sort-by').value;

  let items = allArtifacts.slice();

  // Filter
  if (query) {
    items = items.filter(a => (a.originalName || '').toLowerCase().includes(query));
  }
  if (filterCat) {
    items = items.filter(a => extInfo(a.originalName).cat === filterCat);
  }

  // Sort
  items.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc': return new Date(a.uploadedAt) - new Date(b.uploadedAt);
      case 'date-desc': return new Date(b.uploadedAt) - new Date(a.uploadedAt);
      case 'name-asc': return (a.originalName || '').localeCompare(b.originalName || '');
      case 'name-desc': return (b.originalName || '').localeCompare(a.originalName || '');
      case 'size-asc': return (a.size || 0) - (b.size || 0);
      case 'size-desc': return (b.size || 0) - (a.size || 0);
      default: return 0;
    }
  });

  const grid = document.getElementById('gallery-grid');
  const empty = document.getElementById('gallery-empty');

  if (items.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = items.map(artifact => buildCard(artifact)).join('');

  // Attach card events
  grid.querySelectorAll('.gallery-card').forEach(card => {
    const id = card.dataset.id;

    card.querySelector('.card-cb').addEventListener('change', e => {
      e.stopPropagation();
      if (e.target.checked) selectedIds.add(id);
      else selectedIds.delete(id);
      card.classList.toggle('selected', e.target.checked);
      updateBulkBar();
    });

    card.querySelector('.card-preview-btn').addEventListener('click', e => {
      e.stopPropagation();
      openPreview(id);
    });

    card.querySelector('.card-delete-btn').addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Delete this artifact?')) return;
      try {
        await deleteArtifact(id);
        allArtifacts = allArtifacts.filter(a => a.id !== id);
        selectedIds.delete(id);
        renderGallery();
        updateBulkBar();
      } catch {
        alert('Delete failed.');
      }
    });

    // Click on card body to preview
    card.addEventListener('click', e => {
      if (e.target.closest('.card-cb, .card-actions')) return;
      openPreview(id);
    });
  });

  // Restore checkbox state
  selectedIds.forEach(id => {
    const card = grid.querySelector(`.gallery-card[data-id="${id}"]`);
    if (card) {
      card.classList.add('selected');
      card.querySelector('.card-cb').checked = true;
    }
  });
}

function buildCard(artifact) {
  const info = extInfo(artifact.originalName);
  const isImage = info.cat === 'image' && artifact.thumbnail;
  const thumbSrc = isImage ? `/preview/${artifact.id}?thumb=1` : null;

  return `
    <div class="gallery-card" data-id="${artifact.id}">
      <input type="checkbox" class="card-cb" aria-label="Select ${artifact.originalName}" />
      <div class="card-thumbnail">
        ${thumbSrc ? `<img src="${thumbSrc}" alt="${artifact.originalName}" loading="lazy" />` : `<span>${info.icon}</span>`}
      </div>
      <div class="card-body">
        <div class="card-name" title="${artifact.originalName}">${artifact.originalName}</div>
        <div class="card-meta">
          <span>${formatSize(artifact.size || 0)}</span>
          <span>${formatDate(artifact.uploadedAt)}</span>
        </div>
        <span class="card-badge">${info.label}</span>
      </div>
      <div class="card-actions">
        <button class="btn btn-icon card-preview-btn" title="Preview">👁️</button>
        <button class="btn btn-icon card-delete-btn" title="Delete" style="color:var(--danger)">🗑️</button>
      </div>
    </div>
  `.trim();
}

function updateBulkBar() {
  const bar = document.getElementById('bulk-actions');
  const count = document.getElementById('selected-count');
  if (selectedIds.size > 0) {
    bar.style.display = 'flex';
    count.textContent = `${selectedIds.size} selected`;
  } else {
    bar.style.display = 'none';
  }
}

// ============================================================
// Upload
// ============================================================

let uploadQueue = [];

const dropZone = document.getElementById('drop-zone');
const filePicker = document.getElementById('file-picker');

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFilesToQueue([...e.dataTransfer.files]);
});

dropZone.addEventListener('click', e => {
  if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
    filePicker.click();
  }
});

filePicker.addEventListener('change', () => {
  if (filePicker.files.length) addFilesToQueue([...filePicker.files]);
  filePicker.value = '';
});

function addFilesToQueue(files) {
  uploadQueue = uploadQueue.concat(files);
  renderUploadQueue();
}

function renderUploadQueue() {
  const section = document.getElementById('upload-queue');
  const list = document.getElementById('upload-queue-list');
  if (uploadQueue.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';
  list.innerHTML = uploadQueue.map((f, i) => `
    <div class="upload-queue-item" id="queue-item-${i}">
      <span>${extInfo(f.name).icon}</span>
      <span class="upload-item-name" title="${f.name}">${f.name}</span>
      <span class="upload-item-size">${formatSize(f.size)}</span>
      <div style="flex:1"><div class="progress-bar-wrap"><div class="progress-bar" id="pb-${i}"></div></div></div>
    </div>
  `).join('');
}

document.getElementById('upload-clear-btn').addEventListener('click', () => {
  uploadQueue = [];
  renderUploadQueue();
  document.getElementById('upload-results').style.display = 'none';
});

document.getElementById('upload-start-btn').addEventListener('click', async () => {
  if (uploadQueue.length === 0) return;
  const btn = document.getElementById('upload-start-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading…';

  const results = [];
  const BATCH = 5;

  // Upload in batches of 5 to avoid overwhelming the server
  for (let i = 0; i < uploadQueue.length; i += BATCH) {
    const batch = uploadQueue.slice(i, i + BATCH);
    const formData = new FormData();
    batch.forEach(f => formData.append('files', f));

    try {
      const res = await fetch('/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        batch.forEach((f, bi) => {
          const pb = document.getElementById(`pb-${i + bi}`);
          if (pb) pb.style.width = '100%';
          results.push({ name: f.name, ok: true });
        });
      } else {
        batch.forEach(f => results.push({ name: f.name, ok: false, error: data.error || 'Upload failed' }));
      }
    } catch (err) {
      batch.forEach(f => results.push({ name: f.name, ok: false, error: err.message }));
    }
  }

  btn.disabled = false;
  btn.textContent = '⬆️ Upload All';
  uploadQueue = [];
  renderUploadQueue();
  showUploadResults(results);
});

function showUploadResults(results) {
  const section = document.getElementById('upload-results');
  const list = document.getElementById('upload-results-list');
  section.style.display = 'block';
  list.innerHTML = results.map(r => `
    <div class="upload-result-item">
      <span class="${r.ok ? 'result-ok' : 'result-err'}">${r.ok ? '✔' : '✘'}</span>
      <span>${r.name}</span>
      ${r.error ? `<span style="color:var(--danger);font-size:12px">${r.error}</span>` : ''}
    </div>
  `).join('');
}

document.getElementById('upload-go-gallery').addEventListener('click', () => {
  document.getElementById('upload-results').style.display = 'none';
  showView('gallery');
});

// ============================================================
// Preview Modal
// ============================================================

const modal = document.getElementById('preview-modal');
const previewContent = document.getElementById('preview-content');
const previewTitle = document.getElementById('preview-title');

document.getElementById('preview-close').addEventListener('click', closePreview);
document.getElementById('modal-backdrop').addEventListener('click', closePreview);

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modal.style.display !== 'none') closePreview();
});

function closePreview() {
  modal.style.display = 'none';
  previewContent.innerHTML = '';
}

async function openPreview(id) {
  const artifact = allArtifacts.find(a => a.id === id);
  if (!artifact) return;

  const info = extInfo(artifact.originalName);
  previewTitle.textContent = artifact.originalName;
  previewContent.innerHTML = '<p style="color:var(--text-muted);text-align:center">Loading…</p>';
  modal.style.display = 'flex';

  try {
    if (info.cat === 'image') {
      previewContent.innerHTML = `<img src="/preview/${id}" alt="${artifact.originalName}" />`;
      return;
    }

    const res = await fetch(`/preview/${id}`);
    if (!res.ok) { previewContent.innerHTML = '<p style="color:var(--danger)">Failed to load preview.</p>'; return; }

    const data = await res.json();
    const { content, ext } = data;

    if (ext === '.md') {
      const rawHtml = typeof marked !== 'undefined' ? marked.parse(content) : escapeHtml(content);
      // Use DOM-based sanitization to strip script elements and on* event handlers
      const sanitized = domSanitize(rawHtml);
      previewContent.innerHTML = `<div class="preview-markdown">${sanitized}</div>`;
    } else if (ext === '.html') {
      const blob = new Blob([content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      previewContent.innerHTML = `<iframe src="${url}" sandbox="allow-scripts" title="HTML preview"></iframe>`;
    } else if (ext === '.wasm') {
      // Show hex dump of first 512 bytes (content is base64 or raw)
      previewContent.innerHTML = `
        <div class="hex-dump">
          <p style="color:var(--text-secondary);margin-bottom:8px">WASM binary — file info:</p>
          <pre>Name: ${artifact.originalName}\nSize: ${formatSize(artifact.size)}\nType: WebAssembly binary</pre>
        </div>`;
    } else {
      const langMap = {
        '.js': 'javascript', '.ts': 'typescript', '.py': 'python',
        '.sh': 'bash', '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
        '.xml': 'xml', '.css': 'css', '.scss': 'scss', '.html': 'html',
        '.toml': 'toml', '.dockerfile': 'dockerfile', '.csv': 'plaintext',
        '.txt': 'plaintext',
      };
      const lang = langMap[ext] || 'plaintext';
      const escaped = escapeHtml(content);
      let highlighted = escaped;
      if (typeof hljs !== 'undefined') {
        try { highlighted = hljs.highlight(content, { language: lang }).value; } catch { /* fallback */ }
      }
      previewContent.innerHTML = `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    }
  } catch {
    previewContent.innerHTML = '<p style="color:var(--danger)">Preview unavailable.</p>';
  }
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// DOM-based sanitizer: removes <script> elements and on* event attributes
function domSanitize(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, object, embed, link[rel="import"]').forEach(el => el.remove());
  template.content.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name) || attr.name.toLowerCase() === 'href' && /^javascript:/i.test(attr.value)) {
        el.removeAttribute(attr.name);
      }
    });
  });
  const div = document.createElement('div');
  div.appendChild(template.content.cloneNode(true));
  return div.innerHTML;
}

// ============================================================
// Init
// ============================================================

loadStats();
