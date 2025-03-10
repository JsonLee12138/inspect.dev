// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import * as UI from '../ui/ui.js';
/**
 * @implements {UI.SearchableView.Searchable}
 */
export class XMLView extends UI.Widget.Widget {
    /**
     * @param {!Document} parsedXML
     */
    constructor(parsedXML) {
        super(true);
        this.registerRequiredCSS('source_frame/xmlView.css', { enableLegacyPatching: false });
        this.contentElement.classList.add('shadow-xml-view', 'source-code');
        this._treeOutline = new UI.TreeOutline.TreeOutlineInShadow();
        this._treeOutline.registerRequiredCSS('source_frame/xmlTree.css', { enableLegacyPatching: true });
        this.contentElement.appendChild(this._treeOutline.element);
        /** @type {?UI.SearchableView.SearchableView} */
        this._searchableView;
        /** @type {number} */
        this._currentSearchFocusIndex = 0;
        /** @type {!Array.<!XMLViewNode>} */
        this._currentSearchTreeElements = [];
        /** @type {?UI.SearchableView.SearchConfig} */
        this._searchConfig;
        XMLViewNode.populate(this._treeOutline, parsedXML, this);
        const firstChild = this._treeOutline.firstChild();
        if (firstChild) {
            firstChild.select(true /* omitFocus */, false /* selectedByUser */);
        }
    }
    /**
     * @param {!Document} parsedXML
     * @return {!UI.SearchableView.SearchableView}
     */
    static createSearchableView(parsedXML) {
        const xmlView = new XMLView(parsedXML);
        const searchableView = new UI.SearchableView.SearchableView(xmlView, null);
        searchableView.setPlaceholder(Common.UIString.UIString('Find'));
        xmlView._searchableView = searchableView;
        xmlView.show(searchableView.element);
        return searchableView;
    }
    /**
     * @param {string} text
     * @param {string} mimeType
     * @return {?Document}
     */
    static parseXML(text, mimeType) {
        let parsedXML;
        try {
            switch (mimeType) {
                case 'application/xhtml+xml':
                case 'application/xml':
                case 'image/svg+xml':
                case 'text/html':
                case 'text/xml':
                    parsedXML = (new DOMParser()).parseFromString(text, mimeType);
            }
        }
        catch (e) {
            return null;
        }
        if (!parsedXML || parsedXML.body) {
            return null;
        }
        return parsedXML;
    }
    /**
     * @param {number} index
     * @param {boolean} shouldJump
     */
    _jumpToMatch(index, shouldJump) {
        if (!this._searchConfig) {
            return;
        }
        const regex = this._searchConfig.toSearchRegex(true);
        const previousFocusElement = this._currentSearchTreeElements[this._currentSearchFocusIndex];
        if (previousFocusElement) {
            previousFocusElement.setSearchRegex(regex);
        }
        const newFocusElement = this._currentSearchTreeElements[index];
        if (newFocusElement) {
            this._updateSearchIndex(index);
            if (shouldJump) {
                newFocusElement.reveal(true);
            }
            newFocusElement.setSearchRegex(regex, UI.UIUtils.highlightedCurrentSearchResultClassName);
        }
        else {
            this._updateSearchIndex(0);
        }
    }
    /**
     * @param {number} count
     */
    _updateSearchCount(count) {
        if (!this._searchableView) {
            return;
        }
        this._searchableView.updateSearchMatchesCount(count);
    }
    /**
     * @param {number} index
     */
    _updateSearchIndex(index) {
        this._currentSearchFocusIndex = index;
        if (!this._searchableView) {
            return;
        }
        this._searchableView.updateCurrentMatchIndex(index);
    }
    /**
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    _innerPerformSearch(shouldJump, jumpBackwards) {
        if (!this._searchConfig) {
            return;
        }
        let newIndex = this._currentSearchFocusIndex;
        const previousSearchFocusElement = this._currentSearchTreeElements[newIndex];
        this._innerSearchCanceled();
        this._currentSearchTreeElements = [];
        const regex = this._searchConfig.toSearchRegex(true);
        for (let element = /** @type {?UI.TreeOutline.TreeElement} */ (this._treeOutline.rootElement()); element; element = element.traverseNextTreeElement(false)) {
            if (!(element instanceof XMLViewNode)) {
                continue;
            }
            const hasMatch = element.setSearchRegex(regex);
            if (hasMatch) {
                this._currentSearchTreeElements.push(element);
            }
            if (previousSearchFocusElement === element) {
                const currentIndex = this._currentSearchTreeElements.length - 1;
                if (hasMatch || jumpBackwards) {
                    newIndex = currentIndex;
                }
                else {
                    newIndex = currentIndex + 1;
                }
            }
        }
        this._updateSearchCount(this._currentSearchTreeElements.length);
        if (!this._currentSearchTreeElements.length) {
            this._updateSearchIndex(0);
            return;
        }
        newIndex = Platform.NumberUtilities.mod(newIndex, this._currentSearchTreeElements.length);
        this._jumpToMatch(newIndex, shouldJump);
    }
    _innerSearchCanceled() {
        for (let element = /** @type {?UI.TreeOutline.TreeElement} */ (this._treeOutline.rootElement()); element; element = element.traverseNextTreeElement(false)) {
            if (!(element instanceof XMLViewNode)) {
                continue;
            }
            element.revertHighlightChanges();
        }
        this._updateSearchCount(0);
        this._updateSearchIndex(0);
    }
    /**
     * @override
     */
    searchCanceled() {
        this._searchConfig = null;
        this._currentSearchTreeElements = [];
        this._innerSearchCanceled();
    }
    /**
     * @override
     * @param {!UI.SearchableView.SearchConfig} searchConfig
     * @param {boolean} shouldJump
     * @param {boolean=} jumpBackwards
     */
    performSearch(searchConfig, shouldJump, jumpBackwards) {
        this._searchConfig = searchConfig;
        this._innerPerformSearch(shouldJump, jumpBackwards);
    }
    /**
     * @override
     */
    jumpToNextSearchResult() {
        if (!this._currentSearchTreeElements.length) {
            return;
        }
        const newIndex = Platform.NumberUtilities.mod(this._currentSearchFocusIndex + 1, this._currentSearchTreeElements.length);
        this._jumpToMatch(newIndex, true);
    }
    /**
     * @override
     */
    jumpToPreviousSearchResult() {
        if (!this._currentSearchTreeElements.length) {
            return;
        }
        const newIndex = Platform.NumberUtilities.mod(this._currentSearchFocusIndex - 1, this._currentSearchTreeElements.length);
        this._jumpToMatch(newIndex, true);
    }
    /**
     * @override
     * @return {boolean}
     */
    supportsCaseSensitiveSearch() {
        return true;
    }
    /**
     * @override
     * @return {boolean}
     */
    supportsRegexSearch() {
        return true;
    }
}
export class XMLViewNode extends UI.TreeOutline.TreeElement {
    /**
     * @param {!Node|!ParentNode} node
     * @param {boolean} closeTag
     * @param {!XMLView} xmlView
     */
    constructor(node, closeTag, xmlView) {
        super('', !closeTag && 'childElementCount' in node && Boolean(node.childElementCount));
        this._node = node;
        this._closeTag = closeTag;
        this.selectable = true;
        /** @type {!Array.<!UI.UIUtils.HighlightChange>} */
        this._highlightChanges = [];
        this._xmlView = xmlView;
        this._updateTitle();
    }
    /**
     * @param {!UI.TreeOutline.TreeOutline|!UI.TreeOutline.TreeElement} root
     * @param {!Node|!ParentNode} xmlNode
     * @param {!XMLView} xmlView
     */
    static populate(root, xmlNode, xmlView) {
        if (!(xmlNode instanceof Node)) {
            return;
        }
        let node = xmlNode.firstChild;
        while (node) {
            const currentNode = node;
            node = node.nextSibling;
            const nodeType = currentNode.nodeType;
            // ignore empty TEXT
            if (nodeType === 3 && currentNode.nodeValue && currentNode.nodeValue.match(/\s+/)) {
                continue;
            }
            // ignore ATTRIBUTE, ENTITY_REFERENCE, ENTITY, DOCUMENT, DOCUMENT_TYPE, DOCUMENT_FRAGMENT, NOTATION
            if ((nodeType !== 1) && (nodeType !== 3) && (nodeType !== 4) && (nodeType !== 7) && (nodeType !== 8)) {
                continue;
            }
            root.appendChild(new XMLViewNode(currentNode, false, xmlView));
        }
    }
    /**
     * @param {?RegExp} regex
     * @param {string=} additionalCssClassName
     * @return {boolean}
     */
    setSearchRegex(regex, additionalCssClassName) {
        this.revertHighlightChanges();
        if (!regex) {
            return false;
        }
        if (this._closeTag && this.parent && !this.parent.expanded) {
            return false;
        }
        regex.lastIndex = 0;
        let cssClasses = UI.UIUtils.highlightedSearchResultClassName;
        if (additionalCssClassName) {
            cssClasses += ' ' + additionalCssClassName;
        }
        if (!this.listItemElement.textContent) {
            return false;
        }
        const content = this.listItemElement.textContent.replace(/\xA0/g, ' ');
        let match = regex.exec(content);
        const ranges = [];
        while (match) {
            ranges.push(new TextUtils.TextRange.SourceRange(match.index, match[0].length));
            match = regex.exec(content);
        }
        if (ranges.length) {
            UI.UIUtils.highlightRangesWithStyleClass(this.listItemElement, ranges, cssClasses, this._highlightChanges);
        }
        return Boolean(this._highlightChanges.length);
    }
    revertHighlightChanges() {
        UI.UIUtils.revertDomChanges(this._highlightChanges);
        this._highlightChanges = [];
    }
    _updateTitle() {
        const node = this._node;
        if (!('nodeType' in node)) {
            return;
        }
        switch (node.nodeType) {
            case 1: { // ELEMENT
                if (node instanceof Element) {
                    const tag = node.tagName;
                    if (this._closeTag) {
                        this._setTitle(['</' + tag + '>', 'shadow-xml-view-tag']);
                        return;
                    }
                    const titleItems = ['<' + tag, 'shadow-xml-view-tag'];
                    const attributes = node.attributes;
                    for (let i = 0; i < attributes.length; ++i) {
                        const attributeNode = attributes.item(i);
                        if (!attributeNode) {
                            return;
                        }
                        titleItems.push('\xA0', 'shadow-xml-view-tag', attributeNode.name, 'shadow-xml-view-attribute-name', '="', 'shadow-xml-view-tag', attributeNode.value, 'shadow-xml-view-attribute-value', '"', 'shadow-xml-view-tag');
                    }
                    if (!this.expanded) {
                        if (node.childElementCount) {
                            titleItems.push('>', 'shadow-xml-view-tag', '…', 'shadow-xml-view-comment', '</' + tag, 'shadow-xml-view-tag');
                        }
                        else if (node.textContent) {
                            titleItems.push('>', 'shadow-xml-view-tag', node.textContent, 'shadow-xml-view-text', '</' + tag, 'shadow-xml-view-tag');
                        }
                        else {
                            titleItems.push(' /', 'shadow-xml-view-tag');
                        }
                    }
                    titleItems.push('>', 'shadow-xml-view-tag');
                    this._setTitle(titleItems);
                    return;
                }
                return;
            }
            case 3: { // TEXT
                if (node.nodeValue) {
                    this._setTitle([node.nodeValue, 'shadow-xml-view-text']);
                }
                return;
            }
            case 4: { // CDATA
                if (node.nodeValue) {
                    this._setTitle([
                        '<![CDATA[', 'shadow-xml-view-cdata', node.nodeValue, 'shadow-xml-view-text', ']]>', 'shadow-xml-view-cdata'
                    ]);
                }
                return;
            }
            case 7: { // PROCESSING_INSTRUCTION
                if (node.nodeValue) {
                    this._setTitle(['<?' + node.nodeName + ' ' + node.nodeValue + '?>', 'shadow-xml-view-processing-instruction']);
                }
                return;
            }
            case 8: { // COMMENT
                this._setTitle(['<!--' + node.nodeValue + '-->', 'shadow-xml-view-comment']);
                return;
            }
        }
    }
    /**
     * @param {!Array.<string>} items
     */
    _setTitle(items) {
        const titleFragment = document.createDocumentFragment();
        for (let i = 0; i < items.length; i += 2) {
            titleFragment.createChild('span', items[i + 1]).textContent = items[i];
        }
        this.title = titleFragment;
        this._xmlView._innerPerformSearch(false, false);
    }
    /**
     * @override
     */
    onattach() {
        this.listItemElement.classList.toggle('shadow-xml-view-close-tag', this._closeTag);
    }
    /**
     * @override
     */
    onexpand() {
        this._updateTitle();
    }
    /**
     * @override
     */
    oncollapse() {
        this._updateTitle();
    }
    /**
     * @override
     * @returns {!Promise<void>}
     */
    async onpopulate() {
        XMLViewNode.populate(this, this._node, this._xmlView);
        this.appendChild(new XMLViewNode(this._node, true, this._xmlView));
    }
}
//# sourceMappingURL=XMLView.js.map