// ==UserScript==
// @name         YouTube UI Revert
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Reverts YouTube's new video card UI changes: restores vertical dots, bullet delimiter, "X views" format, and channel name on its own row
// @author       stan
// @match        https://www.youtube.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const VERTICAL_DOTS_PATH   = 'M12 4a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Z';
    const HORIZONTAL_DOTS_PATH = 'M6 10a2 2 0 100 4 2 2 0 000-4Zm6 0a2 2 0 100 4 2 2 0 000-4Zm6 0a2 2 0 100 4 2 2 0 000-4Z';

    function processCard(card) {

        // 1. Replace horizontal dots menu icon with vertical dots
        const svgPath = card.querySelector('.ytLockupMetadataViewModelMenuButton button svg path');
        if (svgPath && svgPath.getAttribute('d') === HORIZONTAL_DOTS_PATH) {
            svgPath.setAttribute('d', VERTICAL_DOTS_PATH);
        }

        const rows = card.querySelectorAll('.ytContentMetadataViewModelMetadataRow');
        rows.forEach(row => {

            // 2. Split merged channel+stats row back into two separate rows.
            // Use the views span as the split point — handles single channel links,
            // plain text channel names, and multi-creator cards.
            const viewsSpan = row.querySelector('.ytContentMetadataViewModelMetadataText[aria-label*="views" i], .ytContentMetadataViewModelMetadataText[aria-label*="thousand" i], .ytContentMetadataViewModelMetadataText[aria-label*="million" i]');
            const channelLink = row.querySelector('a.ytAttributedStringLink');

            if (viewsSpan && viewsSpan !== row.firstElementChild) {
                const channelRow = document.createElement('div');
                channelRow.setAttribute('role', 'group');
                channelRow.className = row.className;

                const statsRow = document.createElement('div');
                statsRow.setAttribute('role', 'group');
                statsRow.className = row.className;

                const children = [...row.childNodes];
                const viewsIdx = children.indexOf(viewsSpan);

                // Walk back from the views span to exclude any preceding delimiter and play icon
                let splitIdx = viewsIdx;
                if (splitIdx > 0) {
                    const prev = children[splitIdx - 1];
                    if (prev.nodeType === Node.ELEMENT_NODE && prev.classList.contains('ytContentMetadataViewModelDelimiter')) {
                        splitIdx--;
                    }
                }
                if (splitIdx > 0) {
                    const prev = children[splitIdx - 1];
                    if (prev.nodeType === Node.ELEMENT_NODE && prev.classList.contains('ytContentMetadataViewModelLeadingIcon')) {
                        splitIdx--;
                    }
                }

                // Distribute nodes: channel content before split, stats from views span onward
                children.slice(0, splitIdx).forEach(n => channelRow.appendChild(n));
                children.slice(splitIdx, viewsIdx).forEach(n => n.parentNode && n.parentNode.removeChild(n));
                while (row.firstChild) statsRow.appendChild(row.firstChild);

                // 3. Restore channel link styles
                if (channelLink) {
                    channelLink.style.fontSize   = '14px';
                    channelLink.style.lineHeight = '20px';
                    channelLink.style.color      = 'inherit';
                    channelLink.style.textWrap   = 'nowrap';
                }

                // 4. Remove delimiters from channel row and restore spacing between creator name spans
                channelRow.querySelectorAll('.ytContentMetadataViewModelDelimiter').forEach(d => d.remove());
                [...channelRow.querySelectorAll('.ytContentMetadataViewModelMetadataText')].slice(1).forEach(span => {
                    span.style.marginLeft = '4px';
                });

                row.parentNode.insertBefore(channelRow, row);
                row.parentNode.insertBefore(statsRow, row);
                row.remove();

                fixStatsRow(statsRow);
            } else {
                fixStatsRow(row);
            }
        });
    }

    function fixStatsRow(row) {
        // 1. Remove leading play icon
        row.querySelectorAll('.ytContentMetadataViewModelLeadingIcon').forEach(el => el.remove());

        // Remove empty leading span left over from where the channel name was
        const firstEl = row.firstElementChild;
        if (firstEl && firstEl.textContent.trim() === '' && !firstEl.querySelector('svg')) {
            firstEl.remove();
        }
        // Remove the now-orphaned delimiter that followed the channel name
        if (row.firstElementChild?.classList.contains('ytContentMetadataViewModelDelimiter')) {
            row.firstElementChild.remove();
        }

        // 2. Replace blank delimiter nodes with " • "
        row.querySelectorAll('.ytContentMetadataViewModelDelimiter').forEach(d => {
            if (d.textContent.trim() === '') {
                d.textContent = ' • ';
            }
        });

        // 3. Fix view count format: "41k" → "41K views"
        row.querySelectorAll('.ytContentMetadataViewModelMetadataText').forEach(span => {
            const aria = span.getAttribute('aria-label') || '';
            const text = span.textContent.trim();
            if (/views|thousand|million|billion/i.test(aria) && !/views/i.test(text) && text !== '') {
                span.textContent = text.replace(/([kmb])$/i, m => m.toUpperCase()) + ' views';
            }
        });
    }

    function processSearchRenderer(renderer) {

        // 1. Replace horizontal dots menu icon with vertical dots
        const svgPath = renderer.querySelector('ytd-menu-renderer yt-icon-button#button svg path');
        if (svgPath && svgPath.getAttribute('d') === HORIZONTAL_DOTS_PATH) {
            svgPath.setAttribute('d', VERTICAL_DOTS_PATH);
        }

        // 2. Fix view count format: "78k" → "78K views"
        const metaSpans = renderer.querySelectorAll('#metadata-line span.inline-metadata-item');
        if (metaSpans.length >= 1) {
            const viewSpan = metaSpans[0];
            const text = viewSpan.textContent.trim();
            if (/^[\d.,]+[kmb]?$/i.test(text) && !/views/i.test(text)) {
                viewSpan.textContent = text.replace(/([kmb])$/i, m => m.toUpperCase()) + ' views';
            }
        }
    }

    function processAll() {
        document.querySelectorAll('.ytLockupViewModelMetadata').forEach(processCard);
        document.querySelectorAll('ytd-video-renderer').forEach(processSearchRenderer);
    }

    let debounceTimer;
    function scheduleProcessAll() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(processAll, 100);
    }

    processAll();

    const observer = new MutationObserver(mutations => {
        let relevant = false;
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node instanceof Element) {
                    relevant = true;
                    break;
                }
            }
            if (m.type === 'characterData' || m.type === 'attributes') {
                relevant = true;
            }
            if (relevant) break;
        }
        if (relevant) scheduleProcessAll();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['d', 'aria-label'],
    });

    window.addEventListener('yt-navigate-finish', processAll);

})();
