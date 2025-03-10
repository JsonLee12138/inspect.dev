/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
 * Copyright (C) IBM Corp. 2009  All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1.  Redistributions of source code must retain the above copyright
 *     notice, this list of conditions and the following disclaimer.
 * 2.  Redistributions in binary form must reproduce the above copyright
 *     notice, this list of conditions and the following disclaimer in the
 *     documentation and/or other materials provided with the distribution.
 * 3.  Neither the name of Apple Computer, Inc. ("Apple") nor the names of
 *     its contributors may be used to endorse or promote products derived
 *     from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY APPLE AND ITS CONTRIBUTORS "AS IS" AND ANY
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL APPLE OR ITS CONTRIBUTORS BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
 * THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as UI from '../ui/ui.js';
import { SourceFrameImpl } from './SourceFrame.js';
export class ResourceSourceFrame extends SourceFrameImpl {
    /**
     * @param {!TextUtils.ContentProvider.ContentProvider} resource
     * @param {boolean=} autoPrettyPrint
     * @param {!UI.TextEditor.Options=} codeMirrorOptions
     */
    constructor(resource, autoPrettyPrint, codeMirrorOptions) {
        super(async () => {
            let content = (await resource.requestContent()).content || '';
            if (await resource.contentEncoded()) {
                content = window.atob(content);
            }
            return { content, isEncoded: false };
        }, codeMirrorOptions);
        this._resource = resource;
        this.setCanPrettyPrint(this._resource.contentType().isDocumentOrScriptOrStyleSheet(), autoPrettyPrint);
    }
    /**
     * @param {!TextUtils.ContentProvider.ContentProvider} resource
     * @param {string} highlighterType
     * @param {boolean=} autoPrettyPrint
     * @return {!UI.Widget.Widget}
     */
    static createSearchableView(resource, highlighterType, autoPrettyPrint) {
        return new SearchableContainer(resource, highlighterType, autoPrettyPrint);
    }
    get resource() {
        return this._resource;
    }
    /**
     * @override
     * @param {!UI.ContextMenu.ContextMenu} contextMenu
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {!Promise<void>}
     */
    populateTextAreaContextMenu(contextMenu, lineNumber, columnNumber) {
        contextMenu.appendApplicableItems(this._resource);
        return Promise.resolve();
    }
}
export class SearchableContainer extends UI.Widget.VBox {
    /**
     * @param {!TextUtils.ContentProvider.ContentProvider} resource
     * @param {string} highlighterType
     * @param {boolean=} autoPrettyPrint
     */
    constructor(resource, highlighterType, autoPrettyPrint) {
        super(true);
        this.registerRequiredCSS('source_frame/resourceSourceFrame.css', { enableLegacyPatching: true });
        const sourceFrame = new ResourceSourceFrame(resource, autoPrettyPrint);
        this._sourceFrame = sourceFrame;
        sourceFrame.setHighlighterType(highlighterType);
        const searchableView = new UI.SearchableView.SearchableView(sourceFrame, sourceFrame);
        searchableView.element.classList.add('searchable-view');
        searchableView.setPlaceholder(ls `Find`);
        sourceFrame.show(searchableView.element);
        sourceFrame.setSearchableView(searchableView);
        searchableView.show(this.contentElement);
        const toolbar = new UI.Toolbar.Toolbar('toolbar', this.contentElement);
        sourceFrame.toolbarItems().then(items => {
            items.map(item => toolbar.appendToolbarItem(item));
        });
    }
    /**
     * @param {number} lineNumber
     * @param {number=} columnNumber
     */
    async revealPosition(lineNumber, columnNumber) {
        this._sourceFrame.revealPosition(lineNumber, columnNumber, true);
    }
}
//# sourceMappingURL=ResourceSourceFrame.js.map