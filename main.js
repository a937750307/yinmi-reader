/* ============================================================
   隐秘阅读器 - 核心逻辑
   ============================================================ */

(function () {
  'use strict';

  // ---- DOM References ----
  const $ = (sel) => document.querySelector(sel);
  const pageTitle = $('#page-title');
  const headerTitle = $('#header-title');
  const uploadArea = $('#upload-area');
  const readerWrapper = $('#reader-wrapper');
  const readerContainer = $('#reader-container');
  const layerA = $('#layer-a');
  const layerB = $('#layer-b');
  const uploadBar = $('#upload-bar');
  const barToggle = $('#bar-toggle');
  const barContent = $('#bar-content');
  const barAName = $('#bar-a-name');
  const barBName = $('#bar-b-name');
  const statusDot = $('#status-dot');
  const btnTheme = $('#btn-theme');
  const btnCustomTitle = $('#btn-custom-title');
  const btnExpandUpload = $('#btn-expand-upload');
  const btnCollapseBar = $('#btn-collapse-bar');
  const beianBar = $('#beian-bar');
  const titleDialog = $('#title-dialog');
  const dialogOverlay = $('#dialog-overlay');
  const titleInput = $('#title-input');
  const loadingOverlay = $('#loading-overlay');
  const zoneAEl = $('#zone-a');
  const zoneBEl = $('#zone-b');
  const zoneAName = $('#zone-a-name');
  const zoneBName = $('#zone-b-name');
  const fileAInput = $('#file-a');
  const fileBInput = $('#file-b');

  // ---- State ----
  const state = {
    fileA: null,
    fileB: null,
    contentA: null,
    contentB: null,
    htmlA: '',
    htmlB: '',
    isScrolling: false,
    scrollTimer: null,
    maskVisible: true,
    customTitle: null,
    ready: false
  };

  // ---- Config ----
  const SCROLL_IDLE_DELAY = 500; // ms before mask reappears after scrolling stops

  // ---- Theme ----
  function initTheme() {
    const saved = localStorage.getItem('cipher-reader-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      updateThemeButton(saved);
    }
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('cipher-reader-theme', next);
    updateThemeButton(next);
  }

  function updateThemeButton(theme) {
    btnTheme.textContent = theme === 'dark' ? '明' : '暗';
    btnTheme.title = theme === 'dark' ? '切换明亮模式' : '切换暗夜模式';
  }

  // ---- Title ----
  function updateTitle(name) {
    const title = state.customTitle || name || '隐秘阅读器';
    pageTitle.textContent = title;
    headerTitle.textContent = title;
  }

  function setCustomTitle(title) {
    state.customTitle = title || null;
    const aName = state.fileA ? state.fileA.name : null;
    updateTitle(aName);
  }

  // ---- Dialog ----
  function showTitleDialog() {
    titleInput.value = state.customTitle || (state.fileA ? state.fileA.name : '');
    titleDialog.style.display = 'block';
    dialogOverlay.style.display = 'block';
    setTimeout(() => titleInput.focus(), 100);
  }

  function hideTitleDialog() {
    titleDialog.style.display = 'none';
    dialogOverlay.style.display = 'none';
  }

  // ---- Loading ----
  function showLoading() {
    loadingOverlay.style.display = 'flex';
  }

  function hideLoading() {
    loadingOverlay.style.display = 'none';
  }

  // ---- File Parsing ----
  function getFileExtension(filename) {
    return filename.split('.').pop().toLowerCase();
  }

  async function parseFile(file) {
    const ext = getFileExtension(file.name);

    switch (ext) {
      case 'txt':
      case 'md':
        return await parseTextFile(file);
      case 'pdf':
        return await parsePdfFile(file);
      case 'docx':
        return await parseDocxFile(file);
      case 'epub':
        return await parseEpubFile(file);
      default:
        return await parseTextFile(file); // fallback
    }
  }

  async function parseTextFile(file) {
    const text = await file.text();
    const ext = getFileExtension(file.name);
    if (ext === 'md') {
      return { type: 'html', html: renderMarkdownToHtml(text) };
    }
    return { type: 'text', text };
  }

  function renderMarkdownToHtml(md) {
    return md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }

  async function parsePdfFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      pages.push(canvas);
    }

    return { type: 'pdf', pages };
  }

  async function parseDocxFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return { type: 'html', html: result.value };
  }

  async function parseEpubFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    // Find container.xml
    let containerFile = zip.file('META-INF/container.xml');
    if (!containerFile) {
      // Try case-insensitive
      const files = Object.keys(zip.files);
      const containerPath = files.find(f => f.toLowerCase().includes('container.xml'));
      if (!containerPath) throw new Error('无效的 EPUB 文件：缺少 container.xml');
      containerFile = zip.file(containerPath);
    }

    const containerXml = await containerFile.async('text');
    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(containerXml, 'text/xml');

    const rootfile = containerDoc.querySelector('rootfile');
    if (!rootfile) throw new Error('无效的 EPUB 文件：无法找到 rootfile');

    const opfPath = rootfile.getAttribute('full-path');

    // Parse OPF
    const opfFile = zip.file(opfPath);
    if (!opfFile) throw new Error('无效的 EPUB 文件：缺少 OPF 文件');

    const opfXml = await opfFile.async('text');
    const opfDoc = parser.parseFromString(opfXml, 'text/xml');

    // Build manifest
    const manifest = {};
    opfDoc.querySelectorAll('manifest item').forEach(item => {
      manifest[item.getAttribute('id')] = item.getAttribute('href');
    });

    // Get spine order
    const spineItems = [];
    opfDoc.querySelectorAll('spine itemref').forEach(itemref => {
      const idref = itemref.getAttribute('idref');
      if (manifest[idref]) {
        spineItems.push(manifest[idref]);
      }
    });

    // Resolve paths relative to OPF location
    const basePath = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

    // Extract HTML content from each spine item
    let combinedHtml = '';
    for (const href of spineItems) {
      const contentPath = basePath + href;
      let contentFile = zip.file(contentPath);

      // Try without base path if not found
      if (!contentFile) {
        contentFile = zip.file(href);
      }
      // Try with decoded path
      if (!contentFile) {
        const decodedPath = decodeURIComponent(contentPath);
        contentFile = zip.file(decodedPath);
      }

      if (!contentFile) continue;

      try {
        const html = await contentFile.async('text');
        const doc = parser.parseFromString(html, 'text/html');
        // Extract body content
        const body = doc.body;
        if (body) {
          combinedHtml += body.innerHTML + '\n';
        } else {
          combinedHtml += html + '\n';
        }
      } catch (e) {
        // Skip unreadable sections
      }
    }

    if (!combinedHtml) {
      // Fallback: extract all text from HTML files
      const htmlFiles = Object.keys(zip.files).filter(f =>
        f.endsWith('.html') || f.endsWith('.xhtml') || f.endsWith('.htm')
      );
      for (const htmlFile of htmlFiles) {
        try {
          const content = await zip.file(htmlFile).async('text');
          const doc = parser.parseFromString(content, 'text/html');
          combinedHtml += doc.body.textContent + '\n\n';
        } catch (e) {
          // skip
        }
      }
    }

    if (!combinedHtml) {
      throw new Error('无法从 EPUB 中提取内容');
    }

    return { type: 'html', html: combinedHtml };
  }

  // ---- Rendering ----
  function renderContent(parsed, targetEl) {
    if (!parsed) {
      targetEl.innerHTML = '<div class="loading-placeholder">等待文件加载...</div>';
      return;
    }

    switch (parsed.type) {
      case 'text':
        targetEl.innerHTML = '<div class="plain-text">' +
          escapeHtml(parsed.text) + '</div>';
        break;

      case 'html':
        targetEl.innerHTML = parsed.html;
        break;

      case 'pdf':
        targetEl.innerHTML = '';
        for (const canvas of parsed.pages) {
          targetEl.appendChild(canvas);
        }
        break;
    }
  }

  function renderMaskContent(parsed, targetEl) {
    if (!parsed) {
      targetEl.innerHTML = '<div class="mask-content"><div class="loading-placeholder">等待遮罩文件...</div></div>';
      return;
    }

    let innerHtml = '';

    switch (parsed.type) {
      case 'text': {
        // Show only what fits in viewport (first ~2000 chars)
        const snippet = parsed.text.substring(0, 2000);
        innerHtml = '<div class="plain-text">' + escapeHtml(snippet) + '</div>';
        break;
      }
      case 'html': {
        // Show HTML content clipped by overflow
        innerHtml = parsed.html;
        break;
      }
      case 'pdf': {
        // Show only the first page
        if (parsed.pages.length > 0) {
          const firstPage = parsed.pages[0].cloneNode(true);
          // Scale canvas to fit viewport width
          innerHtml = '';
          const tempDiv = document.createElement('div');
          tempDiv.appendChild(firstPage);
          innerHtml = tempDiv.innerHTML;
        }
        break;
      }
    }

    targetEl.innerHTML = '<div class="mask-content">' + innerHtml + '</div>';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Mask Control ----
  function showMask() {
    layerA.classList.remove('hidden');
    layerA.classList.add('visible');
    state.maskVisible = true;
  }

  function hideMask() {
    layerA.classList.remove('visible');
    layerA.classList.add('hidden');
    state.maskVisible = false;
  }

  function onScrollActivity() {
    if (state.maskVisible) {
      hideMask();
    }

    clearTimeout(state.scrollTimer);
    state.scrollTimer = setTimeout(() => {
      if (!state.maskVisible) {
        showMask();
      }
    }, SCROLL_IDLE_DELAY);
  }

  function instantShowMask() {
    clearTimeout(state.scrollTimer);
    if (!state.maskVisible) {
      showMask();
    }
  }

  // ---- Upload Handling ----
  async function handleFileUpload(file, role) {
    showLoading();

    try {
      const parsed = await parseFile(file);

      if (role === 'A') {
        state.fileA = file;
        state.contentA = parsed;
        zoneAName.textContent = file.name;
        zoneAEl.classList.add('has-file');
        barAName.textContent = truncateName(file.name);
        updateTitle(file.name);
        renderMaskContent(parsed, layerA);
      } else {
        state.fileB = file;
        state.contentB = parsed;
        zoneBName.textContent = file.name;
        zoneBEl.classList.add('has-file');
        barBName.textContent = truncateName(file.name);
        renderContent(parsed, layerB);
      }

      checkReady();
    } catch (err) {
      alert('文件解析失败：' + err.message);
      console.error('Parse error:', err);
    } finally {
      hideLoading();
    }
  }

  function truncateName(name, maxLen) {
    maxLen = maxLen || 20;
    if (name.length <= maxLen) return name;
    const ext = name.lastIndexOf('.');
    const extStr = ext > -1 ? name.substring(ext) : '';
    const base = ext > -1 ? name.substring(0, ext) : name;
    return base.substring(0, maxLen - extStr.length - 3) + '...' + extStr;
  }

  function checkReady() {
    if (state.fileA && state.fileB) {
      state.ready = true;
      statusDot.classList.add('ready');
      collapseUpload();
      showReader();
    }
  }

  function collapseUpload() {
    uploadArea.style.display = 'none';
    beianBar.style.display = 'none';
    uploadBar.style.display = 'flex';
    collapseBarContent();
  }

  function collapseBarContent() {
    barContent.style.display = 'none';
    uploadBar.classList.remove('upload-bar-expanded');
    uploadBar.classList.add('upload-bar-collapsed');
  }

  function expandBarContent() {
    barContent.style.display = 'flex';
    uploadBar.classList.remove('upload-bar-collapsed');
    uploadBar.classList.add('upload-bar-expanded');
  }

  function toggleBarExpand() {
    if (barContent.style.display === 'none' || !barContent.style.display) {
      expandBarContent();
    } else {
      collapseBarContent();
    }
  }

  function expandUpload() {
    uploadArea.style.display = 'flex';
    beianBar.style.display = 'block';
    uploadBar.style.display = 'none';
    readerWrapper.style.display = 'none';
    collapseBarContent();
    state.ready = false;
    statusDot.classList.remove('ready');
  }

  function showReader() {
    readerWrapper.style.display = 'block';
    readerContainer.scrollTop = 0;
    showMask();
  }

  function resetAll() {
    state.fileA = null;
    state.fileB = null;
    state.contentA = null;
    state.contentB = null;
    state.ready = false;
    state.customTitle = null;

    layerA.innerHTML = '';
    layerB.innerHTML = '';
    zoneAName.textContent = '';
    zoneBName.textContent = '';
    zoneAEl.classList.remove('has-file');
    zoneBEl.classList.remove('has-file');
    barAName.textContent = '-';
    barBName.textContent = '-';
    statusDot.classList.remove('ready');
    fileAInput.value = '';
    fileBInput.value = '';
    updateTitle(null);

    readerWrapper.style.display = 'none';
    uploadBar.style.display = 'none';
    uploadArea.style.display = 'flex';
    beianBar.style.display = 'block';
    collapseBarContent();
  }

  // ---- Event Bindings ----
  fileAInput.addEventListener('change', async function () {
    if (this.files.length > 0) {
      await handleFileUpload(this.files[0], 'A');
    }
  });

  fileBInput.addEventListener('change', async function () {
    if (this.files.length > 0) {
      await handleFileUpload(this.files[0], 'B');
    }
  });

  // Scroll detection
  readerContainer.addEventListener('scroll', onScrollActivity, { passive: true });
  document.addEventListener('wheel', function (e) {
    if (!state.ready) return;
    // Check if wheel event is within the reader wrapper area
    const wrapper = readerWrapper;
    if (wrapper.style.display !== 'none') {
      onScrollActivity();
    }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!state.ready) return;
    const wrapper = readerWrapper;
    if (wrapper.style.display !== 'none') {
      onScrollActivity();
    }
  }, { passive: true });

  // Escape key: instant mask
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.ready) {
      e.preventDefault();
      instantShowMask();
    }
  });

  // Theme toggle
  btnTheme.addEventListener('click', toggleTheme);

  // Custom title dialog
  btnCustomTitle.addEventListener('click', showTitleDialog);
  dialogOverlay.addEventListener('click', hideTitleDialog);
  $('#btn-title-cancel').addEventListener('click', hideTitleDialog);
  $('#btn-title-save').addEventListener('click', function () {
    const val = titleInput.value.trim();
    setCustomTitle(val || null);
    hideTitleDialog();
  });
  $('#btn-title-reset').addEventListener('click', function () {
    setCustomTitle(null);
    hideTitleDialog();
  });

  // Expand upload
  btnExpandUpload.addEventListener('click', expandUpload);

  // Bar toggle (collapsed/expanded)
  barToggle.addEventListener('click', toggleBarExpand);
  btnCollapseBar.addEventListener('click', collapseBarContent);

  // Close dialog on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && titleDialog.style.display === 'block') {
      hideTitleDialog();
    }
  });

  // ---- Initialize ----
  function init() {
    initTheme();
    updateTitle(null);
  }

  init();
})();
