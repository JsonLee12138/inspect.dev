/*
 * Copyright (C) 2007, 2008 Apple Inc.  All rights reserved.
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
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as Platform from '../platform/platform.js';
import * as TextUtils from '../text_utils/text_utils.js';
import * as UI from '../ui/ui.js';
import * as Workspace from '../workspace/workspace.js';
export class ImageView extends UI.View.SimpleView {
    /**
     * @param {string} mimeType
     * @param {!TextUtils.ContentProvider.ContentProvider} contentProvider
     */
    constructor(mimeType, contentProvider) {
        super(Common.UIString.UIString('Image'));
        this.registerRequiredCSS('source_frame/imageView.css', { enableLegacyPatching: false });
        this.element.tabIndex = -1;
        this.element.classList.add('image-view');
        this._url = contentProvider.contentURL();
        this._parsedURL = new Common.ParsedURL.ParsedURL(this._url);
        this._mimeType = mimeType;
        this._contentProvider = contentProvider;
        this._uiSourceCode = contentProvider instanceof Workspace.UISourceCode.UISourceCode ?
            /** @type {!Workspace.UISourceCode.UISourceCode} */ (contentProvider) :
            null;
        if (this._uiSourceCode) {
            this._uiSourceCode.addEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
            new UI.DropTarget.DropTarget(this.element, [UI.DropTarget.Type.ImageFile, UI.DropTarget.Type.URI], Common.UIString.UIString('Drop image file here'), this._handleDrop.bind(this));
        }
        this._sizeLabel = new UI.Toolbar.ToolbarText();
        this._dimensionsLabel = new UI.Toolbar.ToolbarText();
        this._mimeTypeLabel = new UI.Toolbar.ToolbarText(mimeType);
        this._container = this.element.createChild('div', 'image');
        /** @type {!HTMLImageElement} */
        this._imagePreviewElement =
            /** @type {!HTMLImageElement} */ (this._container.createChild('img', 'resource-image-view'));
        this._imagePreviewElement.addEventListener('contextmenu', this._contextMenu.bind(this), true);
    }
    /**
     * @override
     * @return {!Promise<!Array<!UI.Toolbar.ToolbarItem>>}
     */
    async toolbarItems() {
        await this._updateContentIfNeeded();
        return [
            this._sizeLabel, new UI.Toolbar.ToolbarSeparator(), this._dimensionsLabel, new UI.Toolbar.ToolbarSeparator(),
            this._mimeTypeLabel
        ];
    }
    /**
     * @override
     */
    wasShown() {
        this._updateContentIfNeeded();
    }
    /**
     * @override
     */
    disposeView() {
        if (this._uiSourceCode) {
            this._uiSourceCode.removeEventListener(Workspace.UISourceCode.Events.WorkingCopyCommitted, this._workingCopyCommitted, this);
        }
    }
    _workingCopyCommitted() {
        this._updateContentIfNeeded();
    }
    async _updateContentIfNeeded() {
        const { content } = await this._contentProvider.requestContent();
        if (this._cachedContent === content) {
            return;
        }
        const contentEncoded = await this._contentProvider.contentEncoded();
        /** @type {?string} */
        this._cachedContent = content;
        const imageSrc = TextUtils.ContentProvider.contentAsDataURL(content, this._mimeType, contentEncoded) || this._url;
        const loadPromise = new Promise(x => {
            this._imagePreviewElement.onload = x;
        });
        this._imagePreviewElement.src = imageSrc;
        this._imagePreviewElement.alt = ls `Image from ${this._url}`;
        const size = content && !contentEncoded ? content.length : base64ToSize(content);
        this._sizeLabel.setText(Platform.NumberUtilities.bytesToString(size));
        await loadPromise;
        this._dimensionsLabel.setText(Common.UIString.UIString('%d × %d', this._imagePreviewElement.naturalWidth, this._imagePreviewElement.naturalHeight));
    }
    /**
     * @param {!Event} event
     */
    _contextMenu(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        const parsedSrc = new Common.ParsedURL.ParsedURL(this._imagePreviewElement.src);
        if (!this._parsedURL.isDataURL()) {
            contextMenu.clipboardSection().appendItem(Common.UIString.UIString('Copy image URL'), this._copyImageURL.bind(this));
        }
        if (parsedSrc.isDataURL()) {
            contextMenu.clipboardSection().appendItem(Common.UIString.UIString('Copy image as data URI'), this._copyImageAsDataURL.bind(this));
        }
        contextMenu.clipboardSection().appendItem(Common.UIString.UIString('Open image in new tab'), this._openInNewTab.bind(this));
        contextMenu.clipboardSection().appendItem(ls `Save image as...`, async () => {
            await this._saveImage();
        });
        contextMenu.show();
    }
    _copyImageAsDataURL() {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(this._imagePreviewElement.src);
    }
    _copyImageURL() {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.copyText(this._url);
    }
    async _saveImage() {
        const contentEncoded = await this._contentProvider.contentEncoded();
        if (!this._cachedContent) {
            return;
        }
        const cachedContent = this._cachedContent;
        const imageDataURL = TextUtils.ContentProvider.contentAsDataURL(cachedContent, this._mimeType, contentEncoded, '', false);
        if (!imageDataURL) {
            return;
        }
        const link = document.createElement('a');
        link.href = imageDataURL;
        // If it is a Base64 image, set a default file name.
        // When chrome saves a file, the file name characters that are not supported
        // by the OS will be replaced automatically. For example, in the Mac,
        // `:` it will be replaced with `_`.
        link.download = this._parsedURL.isDataURL() ? ls `download` : decodeURIComponent(this._parsedURL.displayName);
        link.click();
        link.remove();
    }
    _openInNewTab() {
        Host.InspectorFrontendHost.InspectorFrontendHostInstance.openInNewTab(this._url);
    }
    /**
     * @param {!DataTransfer} dataTransfer
     */
    async _handleDrop(dataTransfer) {
        const items = dataTransfer.items;
        if (!items.length || items[0].kind !== 'file') {
            return;
        }
        const entry = items[0].webkitGetAsEntry();
        const encoded = !entry.name.endsWith('.svg');
        /**
         * @param {!Blob} file
         */
        const fileCallback = file => {
            const reader = new FileReader();
            reader.onloadend = () => {
                let result;
                try {
                    result = /** @type {?string} */ (reader.result);
                }
                catch (e) {
                    result = null;
                    console.error('Can\'t read file: ' + e);
                }
                if (typeof result !== 'string' || !this._uiSourceCode) {
                    return;
                }
                this._uiSourceCode.setContent(encoded ? btoa(result) : result, encoded);
            };
            if (encoded) {
                reader.readAsBinaryString(file);
            }
            else {
                reader.readAsText(file);
            }
        };
        entry.file(fileCallback);
    }
}
//# sourceMappingURL=ImageView.js.map