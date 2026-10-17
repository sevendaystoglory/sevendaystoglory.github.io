// Post body helpers: copy buttons on code blocks, and a pass that tells
// image captions from run-in headings. Both are written in Markdown as a
// paragraph starting with *italics*; a caption is a paragraph that is only
// the italics, a run-in heading has the paragraph's text following it.
// Runs on load and again after an in-place page swap.

function addCopyButtons() {
    document.querySelectorAll('pre:not([data-copy])').forEach(block => {
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.textContent = 'Copy';
        block.dataset.copy = '1';
        block.appendChild(copyButton);
        copyButton.addEventListener('click', async () => {
            const code = block.querySelector('code').innerText;
            try {
                await navigator.clipboard.writeText(code);
                copyButton.textContent = 'Copied!';
                setTimeout(() => { copyButton.textContent = 'Copy'; }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
                copyButton.textContent = 'Failed to copy';
            }
        });
    });
}

function markParagraphs() {
    document.querySelectorAll('.post-body p').forEach(p => {
        const em = p.firstElementChild;
        if (!em || em.tagName !== 'EM') return;
        if (p.closest('blockquote')) return;                       // a quotation set in italics is not a caption
        if (p.textContent.trim() === em.textContent.trim()) { p.classList.add('caption'); return; }
        // a run-in heading: the italics are the very first thing in the paragraph
        let n = p.firstChild;
        while (n && n.nodeType === 3 && !n.textContent.trim()) n = n.nextSibling;
        if (n === em) p.classList.add('runin');
    });
}

function initPost() { addCopyButtons(); markParagraphs(); }
initPost();
document.addEventListener('ascii:page-enter', initPost);
