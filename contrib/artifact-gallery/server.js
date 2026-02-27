'use strict';

const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
let sharp;
try { sharp = require('sharp'); } catch { /* sharp is optional — skip thumbnails if unavailable */ }

const app = express();
const PORT = process.env.PORT || 5000;
const STORAGE_PATH = process.env.STORAGE_PATH || './uploads';
const UPLOAD_MAX_SIZE = process.env.UPLOAD_MAX_SIZE || '50mb';
const GALLERY_TITLE = process.env.GALLERY_TITLE || 'DevBots Artifact Gallery';
const META_FILE = path.join(STORAGE_PATH, '_meta.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_PATH)) {
  fs.mkdirSync(STORAGE_PATH, { recursive: true });
}

// Parse upload size limit into bytes
function parseSizeLimit(sizeStr) {
  const match = String(sizeStr).match(/^(\d+)(mb|kb|gb)?$/i);
  if (!match) return 52428800; // default 50mb
  const num = parseInt(match[1], 10);
  const unit = (match[2] || 'mb').toLowerCase();
  const multipliers = { kb: 1024, mb: 1024 * 1024, gb: 1024 * 1024 * 1024 };
  return num * (multipliers[unit] || multipliers.mb);
}

const uploadSizeBytes = parseSizeLimit(UPLOAD_MAX_SIZE);

// Rate limiters
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
const uploadLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// Multer storage configuration
const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, STORAGE_PATH);
  },
  filename(req, file, cb) {
    const unique = crypto.randomUUID().replace(/-/g, '');
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: uploadSizeBytes },
});

// Load/save artifact metadata
function loadMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2), 'utf8');
}

// Escape HTML special characters to prevent XSS when injecting into HTML
function escapeHtmlAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve vendor JS/CSS as specific files from local node_modules (avoids CDN at runtime)
app.get('/vendor/highlight.min.js', apiLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/highlight.js/highlight.min.js'));
});
app.get('/vendor/highlight-dark.min.css', apiLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/highlight.js/styles/github-dark.min.css'));
});
app.get('/vendor/marked.min.js', apiLimiter, (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules/marked/marked.min.js'));
});

// Inject gallery title into HTML
app.get('/', apiLimiter, (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  html = html.replace(/DevBots Artifact Gallery/g, escapeHtmlAttr(GALLERY_TITLE));
  res.send(html);
});

// Gallery view (SPA redirect)
app.get('/gallery', (req, res) => {
  res.redirect('/#gallery');
});

// Bulk multi-file upload
app.post('/upload', uploadLimiter, upload.array('files', 50), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const meta = loadMeta();
  const added = [];

  for (const file of req.files) {
    // Generate image thumbnail if applicable
    let thumbnail = null;
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    if (sharp && imageExts.includes(path.extname(file.originalname).toLowerCase())) {
      try {
        const thumbName = `thumb_${file.filename}`;
        const thumbPath = path.join(STORAGE_PATH, thumbName);
        await sharp(file.path).resize(200, 200, { fit: 'inside', withoutEnlargement: true }).toFile(thumbPath);
        thumbnail = thumbName;
      } catch {
        // sharp unsupported format — continue without thumbnail
      }
    }

    const artifact = {
      id: path.basename(file.filename, path.extname(file.filename)),
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      uploadedAt: new Date().toISOString(),
      thumbnail,
    };

    meta.push(artifact);
    added.push(artifact);
  }

  saveMeta(meta);
  res.json({ uploaded: added.length, artifacts: added });
});

// Live preview endpoint
app.get('/preview/:id', apiLimiter, (req, res) => {
  const meta = loadMeta();
  const artifact = meta.find((a) => a.id === req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

  const filePath = path.join(STORAGE_PATH, artifact.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found on disk' });

  const ext = path.extname(artifact.originalName).toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

  if (imageExts.includes(ext)) {
    return res.sendFile(path.resolve(filePath));
  }

  // Thumbnail for image
  if (artifact.thumbnail) {
    const thumbPath = path.join(STORAGE_PATH, artifact.thumbnail);
    if (req.query.thumb && fs.existsSync(thumbPath)) {
      return res.sendFile(path.resolve(thumbPath));
    }
  }

  // Return raw content for text-based formats (rendering done client-side)
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    res.json({ id: artifact.id, originalName: artifact.originalName, content, ext });
  } catch {
    res.sendFile(path.resolve(filePath));
  }
});

// JSON API: list all artifacts
app.get('/api/artifacts', apiLimiter, (req, res) => {
  const meta = loadMeta();
  res.json(meta);
});

// JSON API: delete an artifact
app.delete('/api/artifacts/:id', apiLimiter, (req, res) => {
  let meta = loadMeta();
  const artifact = meta.find((a) => a.id === req.params.id);
  if (!artifact) return res.status(404).json({ error: 'Artifact not found' });

  // Remove file(s) from disk
  const filePath = path.join(STORAGE_PATH, artifact.filename);
  try { fs.unlinkSync(filePath); } catch { /* already gone */ }
  if (artifact.thumbnail) {
    const thumbPath = path.join(STORAGE_PATH, artifact.thumbnail);
    try { fs.unlinkSync(thumbPath); } catch { /* already gone */ }
  }

  meta = meta.filter((a) => a.id !== req.params.id);
  saveMeta(meta);
  res.json({ deleted: req.params.id });
});

app.listen(PORT, () => {
  console.log(`${GALLERY_TITLE} running on port ${PORT}`);
});
