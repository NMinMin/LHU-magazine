import { state, saveToLocalStorage, saveToSupabase } from './state.js';
import { showToast, removeVietnameseDiacritics, toTitleCase } from './utils.js';
import { renderAiReviewPanel } from './ai.js';
import { getQuillInstance, getQuillArticleId, setQuillArticleId, getLoadingQuillContent, setLoadingQuillContent, syncWorkspacePreview } from './editor.js';

let singleArticlePreviewTemplate = '';
export function getSingleArticlePreviewTemplate() {
    if (!singleArticlePreviewTemplate) {
        const container = document.getElementById('a4-container');
        if (container) {
            singleArticlePreviewTemplate = container.innerHTML;
        }
    }
    return singleArticlePreviewTemplate;
}

export function initApp() {
    populateIssueSelector();
    const selector = document.getElementById('issue-selector');
    if (selector) {
        selector.value = state.appState.currentIssueId || '';
    }
    recalculateContinuousPages();
    renderArticlesList();

    if (state.appState.currentArticleId) {
        loadArticleIntoEditor(state.appState.currentArticleId);
    } else {
        clearEditorForm();
    }

    const dmToggle = document.getElementById('dark-mode-toggle');
    if (dmToggle) {
        dmToggle.checked = document.documentElement.classList.contains('dark');
        dmToggle.addEventListener('change', toggleDarkMode);
    }

    switchMobileTab(state.appState.mobileTab || 'editor');

    if (selector) {
        selector.addEventListener('change', function (e) {
            if (!e.target.value) return;
            state.appState.currentIssueId = e.target.value;
            const articles = state.appState.issues[state.appState.currentIssueId].articles;
            if (articles.length > 0) {
                state.appState.currentArticleId = articles[0].id;
            } else {
                state.appState.currentArticleId = null;
            }
            saveToLocalStorage();
            initApp();
        });
    }
}

export function toggleSidebar() {
    const panel = document.getElementById('sidebar-panel');
    const backdrop = document.getElementById('sidebar-backdrop');
    state.appState.sidebarCollapsed = !state.appState.sidebarCollapsed;
    if (state.appState.sidebarCollapsed) {
        if (panel) {
            panel.style.width = '0px';
            panel.style.opacity = '0';
            panel.style.pointerEvents = 'none';
        }
        if (backdrop) backdrop.classList.add('hidden');
    } else {
        if (panel) {
            panel.style.width = '18rem';
            panel.style.opacity = '1';
            panel.style.pointerEvents = 'auto';
        }
        if (backdrop && window.innerWidth < 1024) {
            backdrop.classList.remove('hidden');
        }
    }
    saveToLocalStorage();
}

export function populateIssueSelector() {
    const selector = document.getElementById('issue-selector');
    if (!selector) return;
    selector.innerHTML = '';
    if (!Object.keys(state.appState.issues).length) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Chưa có số báo — nhấn + để tạo';
        selector.appendChild(placeholder);
        return;
    }
    for (const key in state.appState.issues) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = state.appState.issues[key].title;
        selector.appendChild(option);
    }
}

export function recalculateContinuousPages() {
    const currentIssue = state.appState.issues[state.appState.currentIssueId];
    if (!currentIssue) {
        const totalArts = document.getElementById('sidebar-total-articles');
        const globalPage = document.getElementById('global-page-count');
        if (totalArts) totalArts.textContent = '0';
        if (globalPage) globalPage.textContent = '0 bài báo (Tổng cộng 0 trang)';
        return;
    }

    let currentPageCounter = 1;
    let totalPageBudget = 0;

    currentIssue.articles.forEach((art) => {
        const count = parseInt(art.pageCount || 5);
        art.startPage = currentPageCounter;
        art.endPage = currentPageCounter + count - 1;

        currentPageCounter = art.endPage + 1;
        totalPageBudget += count;
    });

    const totalArts = document.getElementById('sidebar-total-articles');
    const globalPage = document.getElementById('global-page-count');
    if (totalArts) totalArts.textContent = currentIssue.articles.length;
    if (globalPage) globalPage.textContent = `${currentIssue.articles.length} bài báo (Tổng cộng ${totalPageBudget} trang)`;
}

export function syncCurrentArticlePageCountFromPreview(art) {
    if (!art) return;

    const renderedPages = document.querySelectorAll('#a4-container > .a4-page, #content-pages > .a4-page').length;
    const actualPageCount = Math.max(1, renderedPages);
    const previousPageCount = parseInt(art.pageCount || 1);

    if (previousPageCount !== actualPageCount) {
        art.pageCount = actualPageCount;
        recalculateContinuousPages();

        if (state.appState.currentArticleId === art.id) {
            renderArticlesList();
            saveToLocalStorage();
        }
    }

    if (state.appState.currentArticleId === art.id) {
        const formatPage = (num) => String(num || 0).padStart(3, '0');
        const pageCountInput = document.getElementById('input-page-count');
        const calculatedPages = document.getElementById('form-calculated-pages');

        if (pageCountInput) pageCountInput.value = actualPageCount;
        if (calculatedPages) calculatedPages.textContent = `Từ trang ${formatPage(art.startPage)} đến ${formatPage(art.endPage)}`;
    }
}

export function renderArticlesList() {
    const container = document.getElementById('articles-list');
    if (!container) return;
    container.innerHTML = '';

    const currentIssue = state.appState.issues[state.appState.currentIssueId];
    if (!currentIssue || currentIssue.articles.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 px-4 text-slate-400 dark:text-slate-500">
                <i class="fa-solid fa-folder-open text-3xl mb-2"></i>
                <p class="text-xs">Chưa có bài viết nào trong số này</p>
            </div>
        `;
        return;
    }

    currentIssue.articles.forEach((art, index) => {
        const isActive = art.id === state.appState.currentArticleId;
        const formatPage = (num) => String(num).padStart(3, '0');
        const pageRangeStr = `Tr. ${formatPage(art.startPage)} - ${formatPage(art.endPage)}`;

        const item = document.createElement('div');
        item.className = `group relative p-2.5 rounded-xl transition-all border cursor-pointer ${isActive
            ? 'bg-blue-50/95 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800'
            : 'bg-white dark:bg-slate-800 border-slate-200/60 dark:hover:border-slate-500 dark:border-slate-700/60'
            }`;
        item.setAttribute('draggable', 'true');
        item.setAttribute('data-id', art.id);

        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('dragenter', handleDragEnter);
        item.addEventListener('dragleave', handleDragLeave);
        item.addEventListener('drop', handleDrop);
        item.addEventListener('dragend', handleDragEnd);

        item.addEventListener('click', (e) => {
            if (e.target.closest('.drag-handle')) return;
            selectArticle(art.id);
        });

        item.innerHTML = `
            <div class="flex items-start space-x-2">
                <div class="drag-handle p-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Kéo sắp xếp thứ tự">
                    <i class="fa-solid fa-grip-lines"></i>
                </div>

                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-start">
                        <span class="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Bài ${index + 1}</span>
                        <span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1 py-0.2 rounded">${pageRangeStr}</span>
                    </div>
                    <h4 class="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate mt-0.5 ${isActive ? 'text-blue-900 dark:text-blue-300' : ''}" title="${art.titleVn}">
                        ${art.titleVn || '(Không có tiêu đề)'}
                    </h4>
                    <p class="text-[9px] text-slate-500 dark:text-slate-400 truncate">${art.authors || 'Chưa rõ tác giả'}</p>
                </div>
            </div>
        `;
        container.appendChild(item);
    });
}

let dragSrcElement = null;

function handleDragStart(e) {
    dragSrcElement = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.getAttribute('data-id'));
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    return false;
}

function handleDragEnter(e) {
    this.classList.add('border-blue-500', 'bg-blue-50/50');
}

function handleDragLeave(e) {
    this.classList.remove('border-blue-500', 'bg-blue-50/50');
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();

    const sourceId = e.dataTransfer.getData('text/plain');
    const targetId = this.getAttribute('data-id');

    if (sourceId !== targetId) {
        reorderArticlesInState(sourceId, targetId);
    }
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    const items = document.querySelectorAll('#articles-list > div');
    items.forEach(item => {
        item.classList.remove('border-blue-500', 'bg-blue-50/50');
    });
}

function reorderArticlesInState(sourceId, targetId) {
    const currentIssue = state.appState.issues[state.appState.currentIssueId];
    const articles = currentIssue.articles;

    const sourceIndex = articles.findIndex(a => a.id === sourceId);
    const targetIndex = articles.findIndex(a => a.id === targetId);

    if (sourceIndex !== -1 && targetIndex !== -1) {
        const [movedArticle] = articles.splice(sourceIndex, 1);
        articles.splice(targetIndex, 0, movedArticle);

        recalculateContinuousPages();
        renderArticlesList();
        saveToLocalStorage();

        if (state.appState.currentArticleId === sourceId || state.appState.currentArticleId === targetId) {
            loadArticleIntoEditor(state.appState.currentArticleId);
        }

        showToast("Sắp xếp lại bài báo thành công! Số trang dồn đã được cập nhật.");
    }
}

export function selectArticle(id) {
    state.appState.currentArticleId = id;
    loadArticleIntoEditor(id);
    renderArticlesList();
    saveToLocalStorage();
    if (window.innerWidth < 1024 && !state.appState.sidebarCollapsed) {
        toggleSidebar();
    }
    if (state.appState.previewMode === 'full') {
        const firstPage = document.getElementById(`page-art-${id}-pg-1`);
        if (firstPage) firstPage.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

export function loadArticleIntoEditor(id) {
    const currentIssue = state.appState.issues[state.appState.currentIssueId];
    const art = currentIssue.articles.find(a => a.id === id);

    if (!art) {
        clearEditorForm();
        return;
    }

    document.getElementById('input-page-count').value = art.pageCount || 5;
    document.getElementById('input-title-vn').value = art.titleVn || '';
    document.getElementById('input-title-en').value = art.titleEn || '';
    document.getElementById('input-authors').value = art.authors || '';
    document.getElementById('input-email').value = art.email || '';
    document.getElementById('input-date-received').value = art.dateReceived || '';
    document.getElementById('input-date-revised').value = art.dateRevised || '';
    document.getElementById('input-date-accepted').value = art.dateAccepted || '';
    document.getElementById('input-date-published').value = art.datePublished || '';
    document.getElementById('input-abstract-vn').value = art.abstractVn || '';
    document.getElementById('input-abstract-en').value = art.abstractEn || '';
    document.getElementById('input-keywords-vn').value = art.keywordsVn || '';
    document.getElementById('input-keywords-en').value = art.keywordsEn || '';

    const formatPage = (num) => String(num).padStart(3, '0');
    document.getElementById('form-calculated-pages').textContent = `Từ trang ${formatPage(art.startPage)} đến ${formatPage(art.endPage)}`;

    renderLivePreview(art);
    renderAiReviewPanel(art);
}

export function clearEditorForm() {
    document.getElementById('input-page-count').value = 1;
    document.getElementById('input-title-vn').value = '';
    document.getElementById('input-title-en').value = '';
    document.getElementById('input-authors').value = '';
    document.getElementById('input-email').value = '';
    document.getElementById('input-date-received').value = '';
    document.getElementById('input-date-revised').value = '';
    document.getElementById('input-date-accepted').value = '';
    document.getElementById('input-date-published').value = '';
    document.getElementById('input-abstract-vn').value = '';
    document.getElementById('input-abstract-en').value = '';
    document.getElementById('input-keywords-vn').value = '';
    document.getElementById('input-keywords-en').value = '';
    document.getElementById('form-calculated-pages').textContent = 'Trang: 0 - 0';

    document.getElementById('ai-suggestions-container').innerHTML = `
        <div class="text-center py-12 text-slate-400">
            <i class="fa-solid fa-wand-magic-sparkles text-3xl mb-3 text-indigo-400"></i>
            <p class="text-xs">Chưa chọn bài báo để phân tích</p>
        </div>
    `;
}

export function syncFormToPreview() {
    const currentIssue = state.appState.issues[state.appState.currentIssueId];
    if (!currentIssue || !state.appState.currentArticleId) return;

    const art = currentIssue.articles.find(a => a.id === state.appState.currentArticleId);
    if (!art) return;

    art.titleVn = document.getElementById('input-title-vn').value;
    art.titleEn = document.getElementById('input-title-en').value;
    art.authors = document.getElementById('input-authors').value;
    art.email = document.getElementById('input-email').value;
    art.dateReceived = document.getElementById('input-date-received').value;
    art.dateRevised = document.getElementById('input-date-revised').value;
    art.dateAccepted = document.getElementById('input-date-accepted').value;
    art.datePublished = document.getElementById('input-date-published').value;
    art.abstractVn = document.getElementById('input-abstract-vn').value;
    art.abstractEn = document.getElementById('input-abstract-en').value;
    art.keywordsVn = document.getElementById('input-keywords-vn').value;
    art.keywordsEn = document.getElementById('input-keywords-en').value;

    saveToLocalStorage();
    renderLivePreview(art);

    const activeItem = document.querySelector(`[data-id="${art.id}"] h4`);
    if (activeItem) {
        activeItem.textContent = art.titleVn || '(Không có tiêu đề)';
    }
    const activeAuthorText = document.querySelector(`[data-id="${art.id}"] p`);
    if (activeAuthorText) {
        activeAuthorText.textContent = art.authors || 'Chưa rõ tác giả';
    }
}

export function footerDateText(art) {
    const issue = state.appState.issues[state.appState.currentIssueId];
    const issueTitle = issue?.title || '';
    const issueMatch = issueTitle.match(/(?:Số|Issue)\s*0*(\d+)/i) || issueTitle.match(/\b0*(\d+)\b/);
    const issueNumber = issueMatch?.[1] || '20';
    const dateMatch = String(art?.datePublished || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) return `JSLHU, Issue ${issueNumber}, 2025`;
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const month = monthNames[Number(dateMatch[2]) - 1];
    return `JSLHU, Issue ${issueNumber}, ${month} ${dateMatch[1]}`;
}

export function effectiveHeaderLanguage(art) {
    const issue = state.appState.issues[state.appState.currentIssueId];
    return art?.evenHeaderLanguage && art.evenHeaderLanguage !== 'issue'
        ? art.evenHeaderLanguage : (issue?.evenHeaderLanguage || 'vi');
}

export function syncHeaderLanguageControls(art) {
    const issueHeader = document.getElementById('issue-header-language');
    const articleHeader = document.getElementById('article-header-language');
    if (issueHeader) issueHeader.value = state.appState.issues[state.appState.currentIssueId]?.evenHeaderLanguage || 'vi';
    if (articleHeader) articleHeader.value = art?.evenHeaderLanguage || 'issue';
}

export function setIssueHeaderLanguage(value) {
    const issue = state.appState.issues[state.appState.currentIssueId];
    if (!issue) return;
    issue.evenHeaderLanguage = value === 'en' ? 'en' : 'vi';
    saveToLocalStorage();
    const art = issue.articles.find(item => item.id === state.appState.currentArticleId);
    if (art) renderLivePreview(art);
}

export function setArticleHeaderLanguage(value) {
    const art = state.appState.issues[state.appState.currentIssueId]?.articles.find(item => item.id === state.appState.currentArticleId);
    if (!art) return;
    art.evenHeaderLanguage = ['vi', 'en'].includes(value) ? value : 'issue';
    saveToLocalStorage();
    renderLivePreview(art);
}

export function formatKeywords(value, fallback) {
    const keywords = String(value || '')
        .split(/[;,]/)
        .map(item => item.trim())
        .filter(Boolean);
    if (!keywords.length) return fallback;
    return keywords
        .map((keyword, index) => keyword + (index < keywords.length - 1 ? ';' : ''))
        .join('\n');
}

export function articleDisplayPageNumber(art, articlePageNumber) {
    const articleStartPage = parseInt(art?.startPage || 1);
    return articleStartPage + Math.max(1, parseInt(articlePageNumber || 1)) - 1;
}

export function createArticlePage(pageNumber, art) {
    const displayPageNumber = articleDisplayPageNumber(art, pageNumber);
    const page = document.createElement('section');
    page.className = 'a4-page article-page font-serif text-black';
    page.setAttribute('aria-label', `Trang ${displayPageNumber}`);

    const header = document.createElement('div');
    header.className = `article-running-header ${displayPageNumber % 2 ? 'odd' : 'even'}`;
    header.textContent = displayPageNumber % 2
        ? (art.authors || 'Tác giả')
        : toTitleCase(effectiveHeaderLanguage(art) === 'en'
            ? (art.titleEn || art.titleVn || 'ARTICLE TITLE')
            : (art.titleVn || art.titleEn || 'TIÊU ĐỀ BÀI BÁO'));
    page.appendChild(header);

    const content = document.createElement('div');
    content.className = 'article-page-content';
    page.appendChild(content);

    const footer = document.createElement('div');
    footer.className = `preview-page-footer ${displayPageNumber % 2 ? 'odd' : 'even'}`;
    footer.innerHTML = '<span class="footer-date"></span><span class="footer-page"></span>';
    footer.querySelector('.footer-date').textContent = footerDateText(art);
    footer.querySelector('.footer-page').textContent = displayPageNumber;
    page.appendChild(footer);
    document.getElementById('content-pages').appendChild(page);
    return content;
}

export function pageHasOverflow(content) {
    return content.scrollWidth > content.clientWidth + 2 || content.scrollHeight > content.clientHeight + 2;
}

export function appendTextBlockAcrossPages(sourceNode, stateObj, art) {
    const words = (sourceNode.textContent || '').trim().split(/\s+/).filter(Boolean);
    let offset = 0;
    while (offset < words.length) {
        let low = 1, high = words.length - offset, best = 0;
        while (low <= high) {
            const middle = Math.floor((low + high) / 2);
            const candidate = sourceNode.cloneNode(false);
            candidate.textContent = words.slice(offset, offset + middle).join(' ');
            stateObj.content.appendChild(candidate);
            const fits = !pageHasOverflow(stateObj.content);
            candidate.remove();
            if (fits) { best = middle; low = middle + 1; } else { high = middle - 1; }
        }
        if (!best) {
            if (stateObj.content.childElementCount) {
                stateObj.pageNumber += 1;
                stateObj.content = createArticlePage(stateObj.pageNumber, art);
                continue;
            }
            best = 1;
        }
        const fragment = sourceNode.cloneNode(false);
        fragment.textContent = words.slice(offset, offset + best).join(' ');
        stateObj.content.appendChild(fragment);
        offset += best;
        if (offset < words.length) {
            stateObj.pageNumber += 1;
            stateObj.content = createArticlePage(stateObj.pageNumber, art);
        }
    }
}

export function paginateContent(html, art) {
    const pages = document.getElementById('content-pages');
    if (!pages) return;
    pages.innerHTML = '';
    const source = document.createElement('div');
    source.innerHTML = html || '';
    const stateObj = { pageNumber: 2, content: createArticlePage(2, art) };
    const nodes = Array.from(source.children);
    if (!nodes.some(node => node.textContent.trim() || node.querySelector('img, table'))) {
        stateObj.content.innerHTML = '<p style="text-align:center;color:#999">Nội dung bài báo bắt đầu từ trang 2.</p>';
        return;
    }
    nodes.forEach(node => {
        const clone = node.cloneNode(true);
        stateObj.content.appendChild(clone);
        if (!pageHasOverflow(stateObj.content)) return;
        clone.remove();
        if (stateObj.content.childElementCount) {
            stateObj.pageNumber += 1;
            stateObj.content = createArticlePage(stateObj.pageNumber, art);
            stateObj.content.appendChild(clone);
            if (!pageHasOverflow(stateObj.content)) return;
            clone.remove();
        }
        if (/^(P|BLOCKQUOTE)$/i.test(node.tagName) && node.textContent.trim()) {
            appendTextBlockAcrossPages(node, stateObj, art);
        } else {
            stateObj.content.appendChild(clone);
        }
    });
}

export function renderSingleArticlePreview(art) {
    const template = getSingleArticlePreviewTemplate();
    const a4Container = document.getElementById('a4-container');
    if (!a4Container) return;
    a4Container.innerHTML = template;

    const formatVnDate = (dtStr) => {
        if (!dtStr) return '--/--/----';
        const parts = dtStr.split('-');
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const headerMeta = document.getElementById('preview-header-meta');
    if (headerMeta) headerMeta.textContent = 'Tạp chí Khoa học Lạc Hồng, 2025, 20, 001-005';
    syncHeaderLanguageControls(art);

    const pvTitleVn = document.getElementById('pv-title-vn');
    const pvTitleEn = document.getElementById('pv-title-en');
    const pvAuthorsVn = document.getElementById('pv-authors-vn');
    const pvAuthorsEn = document.getElementById('pv-authors-en');
    const pvContactEmail = document.getElementById('pv-contact-email');
    const pvContactEmailEn = document.getElementById('pv-contact-email-en');
    const pvDateReceived = document.getElementById('pv-date-received');
    const pvDateRevised = document.getElementById('pv-date-revised');
    const pvDateAccepted = document.getElementById('pv-date-accepted');
    const pvDatePublished = document.getElementById('pv-date-published');
    const pvDateReceivedEn = document.getElementById('pv-date-received-en');
    const pvDateRevisedEn = document.getElementById('pv-date-revised-en');
    const pvDateAcceptedEn = document.getElementById('pv-date-accepted-en');
    const pvDatePublishedEn = document.getElementById('pv-date-published-en');
    const pvKeywordsVn = document.getElementById('pv-keywords-vn');
    const pvKeywordsEn = document.getElementById('pv-keywords-en');
    const pvAbstractVn = document.getElementById('pv-abstract-vn');
    const pvAbstractEn = document.getElementById('pv-abstract-en');

    if (pvTitleVn) pvTitleVn.textContent = art.titleVn || 'TIÊU ĐỀ BÀI BÁO (TIẾNG VIỆT)';
    if (pvTitleEn) pvTitleEn.textContent = art.titleEn || 'ARTICLE TITLE IN ENGLISH';
    if (pvAuthorsVn) pvAuthorsVn.textContent = art.authors || 'Tên các tác giả';
    if (pvAuthorsEn) pvAuthorsEn.textContent = removeVietnameseDiacritics(art.authors) || 'Authors Name';
    if (pvContactEmail) pvContactEmail.textContent = art.email || 'email@domain.com';
    if (pvContactEmailEn) pvContactEmailEn.textContent = art.email || 'email@domain.com';

    if (pvDateReceived) pvDateReceived.textContent = formatVnDate(art.dateReceived);
    if (pvDateRevised) pvDateRevised.textContent = formatVnDate(art.dateRevised);
    if (pvDateAccepted) pvDateAccepted.textContent = formatVnDate(art.dateAccepted);
    if (pvDatePublished) pvDatePublished.textContent = formatVnDate(art.datePublished);

    if (pvDateReceivedEn) pvDateReceivedEn.textContent = formatVnDate(art.dateReceived);
    if (pvDateRevisedEn) pvDateRevisedEn.textContent = formatVnDate(art.dateRevised);
    if (pvDateAcceptedEn) pvDateAcceptedEn.textContent = formatVnDate(art.dateAccepted);
    if (pvDatePublishedEn) pvDatePublishedEn.textContent = formatVnDate(art.datePublished);

    if (pvKeywordsVn) pvKeywordsVn.textContent = formatKeywords(art.keywordsVn, 'Nhập từ khóa...');
    if (pvKeywordsEn) pvKeywordsEn.textContent = formatKeywords(art.keywordsEn, 'Keywords...');

    if (pvAbstractVn) pvAbstractVn.textContent = art.abstractVn || 'Nhập tóm tắt tiếng Việt...';
    if (pvAbstractEn) pvAbstractEn.textContent = art.abstractEn || 'Enter English abstract...';

    const firstDisplayPageNumber = articleDisplayPageNumber(art, 1);
    const firstPageFooter = document.querySelector('#a4-container > .a4-page .preview-page-footer');
    if (firstPageFooter) {
        firstPageFooter.classList.toggle('odd', firstDisplayPageNumber % 2 === 1);
        firstPageFooter.classList.toggle('even', firstDisplayPageNumber % 2 === 0);
    }
    const footerNum = document.getElementById('pv-page-footer-num');
    if (footerNum) footerNum.textContent = firstDisplayPageNumber;
    const footerDate = document.querySelector('#a4-container > .a4-page .footer-date');
    if (footerDate) footerDate.textContent = footerDateText(art);
    paginateContent(art.bodyContent, art);
    syncCurrentArticlePageCountFromPreview(art);
}

export function togglePreviewMode() {
    state.appState.previewMode = state.appState.previewMode === 'full' ? 'single' : 'full';
    saveToLocalStorage();
    renderLivePreview();
}

export function renderLivePreview(art) {
    const issue = state.appState.issues[state.appState.currentIssueId];
    const activeArticleObj = art || issue?.articles.find(item => item.id === state.appState.currentArticleId);
    const title = document.getElementById('preview-mode-title');
    const button = document.getElementById('btn-toggle-preview-mode');
    const container = document.getElementById('a4-container');

    if (!container) return;

    if (!issue || !activeArticleObj) {
        container.innerHTML = '<div class="py-20 text-center text-sm font-semibold text-slate-400">Chưa có bài báo để xem trước.</div>';
        return;
    }

    if (state.appState.previewMode !== 'full') {
        if (title) title.innerHTML = '<i class="fa-solid fa-file-invoice mr-1 text-emerald-500"></i> Xem bài viết hiện tại';
        if (button) {
            button.innerHTML = '<i class="fa-solid fa-book-open"></i><span class="hidden md:inline ml-1">Xem toàn bộ số báo</span>';
            button.className = 'px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded text-[11px] font-bold flex items-center transition-colors whitespace-nowrap';
        }
        renderSingleArticlePreview(activeArticleObj);
        return;
    }

    if (title) title.innerHTML = `<i class="fa-solid fa-book-open mr-1 text-indigo-500"></i> Đang xem toàn bộ số báo (${issue.articles.length} bài)`;
    if (button) {
        button.innerHTML = '<i class="fa-solid fa-file-invoice"></i><span class="hidden md:inline ml-1">Xem bài viết đơn lẻ</span>';
        button.className = 'px-2.5 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 rounded text-[11px] font-bold flex items-center transition-colors whitespace-nowrap';
    }

    const compiledPages = [];
    issue.articles.forEach(item => {
        renderSingleArticlePreview(item);
        Array.from(container.children).forEach((page, pageIndex) => {
            const clone = page.cloneNode(true);
            if (pageIndex === 0) clone.id = `page-art-${item.id}-pg-1`;
            clone.dataset.articleId = item.id;
            compiledPages.push(clone);
        });
    });
    container.replaceChildren(...compiledPages);
    syncHeaderLanguageControls(activeArticleObj);
    saveToLocalStorage();
    adjustPreviewScale();
}

export function createNewArticle() {
    const currentIssue = state.appState.issues[state.appState.currentIssueId];
    if (!currentIssue) {
        showToast("Hãy tạo số báo trước khi thêm bài viết!");
        return;
    }

    const newId = `art-${Date.now()}`;
    const newArt = {
        id: newId,
        titleVn: "",
        titleEn: "",
        authors: "",
        email: "",
        dateReceived: "",
        dateRevised: "",
        dateAccepted: "",
        datePublished: "",
        keywordsVn: "",
        keywordsEn: "",
        abstractVn: "",
        abstractEn: "",
        bodyContent: "",
        pageCount: 1,
        aiReviewSuggestions: null,
        evenHeaderLanguage: "issue"
    };

    currentIssue.articles.push(newArt);
    state.appState.currentArticleId = newId;

    recalculateContinuousPages();
    renderArticlesList();
    loadArticleIntoEditor(newId);
    saveToLocalStorage();

    showToast("Thêm bài viết mới thành công!");
}

export function deleteCurrentArticle() {
    const currentIssue = state.appState.issues[state.appState.currentIssueId];
    if (!currentIssue || !state.appState.currentArticleId) return;

    const articles = currentIssue.articles;
    const idx = articles.findIndex(a => a.id === state.appState.currentArticleId);
    if (idx !== -1) {
        articles.splice(idx, 1);

        if (articles.length > 0) {
            state.appState.currentArticleId = articles[0].id;
        } else {
            state.appState.currentArticleId = null;
        }

        recalculateContinuousPages();
        renderArticlesList();
        if (state.appState.currentArticleId) {
            loadArticleIntoEditor(state.appState.currentArticleId);
        } else {
            clearEditorForm();
        }
        saveToLocalStorage();
        showToast("Đã xóa bài báo khỏi danh sách!");
    }
}

export function createNewIssue() {
    const name = prompt("Nhập tên số báo mới (ví dụ: Số 03 - Năm 2026):");
    if (!name) return;

    const newIssueId = `issue-${Date.now()}`;
    state.appState.issues[newIssueId] = {
        title: name,
        articles: [],
        evenHeaderLanguage: 'vi'
    };

    state.appState.currentIssueId = newIssueId;
    state.appState.currentArticleId = null;
    saveToLocalStorage();

    populateIssueSelector();
    const selector = document.getElementById('issue-selector');
    if (selector) selector.value = newIssueId;
    initApp();

    showToast(`Khởi tạo thành công ${name}!`);
}

export function zoomPreview(dir) {
    state.appState.zoomLevel += (dir * 10);
    if (state.appState.zoomLevel < 50) state.appState.zoomLevel = 50;
    if (state.appState.zoomLevel > 150) state.appState.zoomLevel = 150;

    const a4 = document.getElementById('a4-container');
    if (a4) a4.style.transform = `scale(${state.appState.zoomLevel / 100})`;
}

export function activeArticle() {
    return state.appState.issues[state.appState.currentIssueId]?.articles.find(art => art.id === state.appState.currentArticleId) || null;
}

export function toggleDarkMode() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    } else {
        document.documentElement.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    }
    const dmToggle = document.getElementById('dark-mode-toggle');
    if (dmToggle) dmToggle.checked = document.documentElement.classList.contains('dark');
}

export function switchMobileTab(tabName) {
    state.appState.mobileTab = tabName;

    const tabs = ['editor', 'preview', 'ai'];
    tabs.forEach(t => {
        const tabBtn = document.getElementById(`tab-${t}`);
        if (tabBtn) {
            if (t === tabName) {
                tabBtn.classList.add('border-blue-600', 'text-blue-600', 'dark:text-blue-400', 'dark:border-blue-400');
                tabBtn.classList.remove('border-transparent', 'text-slate-500', 'dark:text-slate-400', 'hover:text-slate-700', 'dark:hover:text-slate-300');
            } else {
                tabBtn.classList.remove('border-blue-600', 'text-blue-600', 'dark:text-blue-400', 'dark:border-blue-400');
                tabBtn.classList.add('border-transparent', 'text-slate-500', 'dark:text-slate-400', 'hover:text-slate-700', 'dark:hover:text-slate-300');
            }
        }
    });

    const editorSec = document.getElementById('editor-section');
    const previewSec = document.getElementById('preview-section');
    const aiSec = document.getElementById('ai-review-section');

    if (editorSec) editorSec.classList.toggle('max-lg:hidden', tabName !== 'editor');
    if (previewSec) {
        previewSec.classList.toggle('max-lg:hidden', tabName !== 'preview');
        if (tabName === 'preview') {
            setTimeout(adjustPreviewScale, 50);
        }
    }
    if (aiSec) aiSec.classList.toggle('max-lg:hidden', tabName !== 'ai');

    saveToLocalStorage();
}

export function adjustPreviewScale() {
    const container = document.getElementById('preview-section');
    const a4 = document.getElementById('a4-container');
    if (!container || !a4) return;

    const a4Width = 794;
    const containerWidth = container.clientWidth - 32;

    if (window.innerWidth < 1024 && containerWidth < a4Width) {
        const scale = Math.max(0.3, containerWidth / a4Width);
        a4.style.transform = `scale(${scale})`;
        a4.style.transformOrigin = 'top center';

        const wrapper = document.getElementById('a4-scale-wrapper');
        if (wrapper) {
            wrapper.style.height = `${a4.scrollHeight * scale}px`;
        }
    } else {
        a4.style.transform = `scale(${state.appState.zoomLevel / 100})`;
        a4.style.transformOrigin = 'top center';
        const wrapper = document.getElementById('a4-scale-wrapper');
        if (wrapper) {
            wrapper.style.height = 'auto';
        }
    }
}

window.addEventListener('resize', () => {
    adjustPreviewScale();
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) {
        if (window.innerWidth >= 1024) {
            backdrop.classList.add('hidden');
            const panel = document.getElementById('sidebar-panel');
            if (panel) {
                if (state.appState.sidebarCollapsed) {
                    panel.style.width = '0px';
                    panel.style.opacity = '0';
                    panel.style.pointerEvents = 'none';
                } else {
                    panel.style.width = '18rem';
                    panel.style.opacity = '1';
                    panel.style.pointerEvents = 'auto';
                }
            }
        } else if (!state.appState.sidebarCollapsed) {
            backdrop.classList.remove('hidden');
        }
    }
});

/**
 * Sync the current article preview fully before PDF export/print.
 * Ensures the A4 container reflects the latest state.
 */
export function preparePreviewForOutput() {
    const art = activeArticle();
    if (art) {
        renderSingleArticlePreview(art);
        recalculateContinuousPages();
    }
    adjustPreviewScale();
}

