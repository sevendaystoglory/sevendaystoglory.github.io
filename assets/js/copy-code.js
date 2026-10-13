function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('pre:not([data-copy])');
    
    codeBlocks.forEach(block => {
        // Create copy button
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.textContent = 'Copy';
        
        // Add button to code block
        block.dataset.copy = '1';
        block.appendChild(copyButton);
        
        // Add click handler
        copyButton.addEventListener('click', async () => {
            const code = block.querySelector('code').innerText;
            try {
                await navigator.clipboard.writeText(code);
                copyButton.textContent = 'Copied!';
                setTimeout(() => {
                    copyButton.textContent = 'Copy';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy:', err);
                copyButton.textContent = 'Failed to copy';
            }
        });
    });
}
addCopyButtons();
document.addEventListener('ascii:page-enter', addCopyButtons);
