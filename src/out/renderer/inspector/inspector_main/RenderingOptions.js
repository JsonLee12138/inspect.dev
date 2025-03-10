/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
import * as Common from '../common/common.js'; // eslint-disable-line no-unused-vars
import * as UI from '../ui/ui.js';
// TODO(1096068): remove this feature detection and expose the UI
// unconditionally once prefers-reduced-data ships unflagged. At that
// point, we can also add `category` and `tags` to the entry in
// `front_end/sdk/module.json` to make this feature available in the
// Command Menu.
/**
 * @return {boolean}
 */
const supportsPrefersReducedData = () => {
    const query = '(prefers-reduced-data: reduce)';
    // Note: `media` serializes to `'not all'` for unsupported queries.
    return window.matchMedia(query).media === query;
};
export class RenderingOptionsView extends UI.Widget.VBox {
    constructor() {
        super(true);
        this.registerRequiredCSS('inspector_main/renderingOptions.css', { enableLegacyPatching: false });
        this._appendCheckbox(ls `Paint flashing`, ls `Highlights areas of the page (green) that need to be repainted. May not be suitable for people prone to photosensitive epilepsy.`, Common.Settings.Settings.instance().moduleSetting('showPaintRects'));
        this._appendCheckbox(ls `Layout Shift Regions`, ls `Highlights areas of the page (blue) that were shifted. May not be suitable for people prone to photosensitive epilepsy.`, Common.Settings.Settings.instance().moduleSetting('showLayoutShiftRegions'));
        this._appendCheckbox(ls `Layer borders`, ls `Shows layer borders (orange/olive) and tiles (cyan).`, Common.Settings.Settings.instance().moduleSetting('showDebugBorders'));
        this._appendCheckbox(ls `Frame Rendering Stats`, ls `Plots frame throughput, dropped frames distribution, and GPU memory.`, Common.Settings.Settings.instance().moduleSetting('showFPSCounter'));
        this._appendCheckbox(ls `Scrolling performance issues`, ls `Highlights elements (teal) that can slow down scrolling, including touch & wheel event handlers and other main-thread scrolling situations.`, Common.Settings.Settings.instance().moduleSetting('showScrollBottleneckRects'));
        this._appendCheckbox(ls `Highlight ad frames`, ls `Highlights frames (red) detected to be ads.`, Common.Settings.Settings.instance().moduleSetting('showAdHighlights'));
        this._appendCheckbox(ls `Hit-test borders`, ls `Shows borders around hit-test regions.`, Common.Settings.Settings.instance().moduleSetting('showHitTestBorders'));
        this._appendCheckbox(ls `Disable local fonts`, ls `Disables local() sources in @font-face rules. Requires a page reload to apply.`, Common.Settings.Settings.instance().moduleSetting('localFontsDisabled'));
        this._appendCheckbox(ls `Emulate a focused page`, ls `Emulates a focused page.`, Common.Settings.Settings.instance().moduleSetting('emulatePageFocus'));
        this.contentElement.createChild('div').classList.add('panel-section-separator');
        this._appendSelect(ls `Forces media type for testing print and screen styles`, Common.Settings.Settings.instance().moduleSetting('emulatedCSSMedia'));
        this._appendSelect(ls `Forces CSS prefers-color-scheme media feature`, Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeaturePrefersColorScheme'));
        this._appendSelect(ls `Forces CSS prefers-reduced-motion media feature`, Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeaturePrefersReducedMotion'));
        if (supportsPrefersReducedData()) {
            this._appendSelect(ls `Forces CSS prefers-reduced-data media feature`, Common.Settings.Settings.instance().moduleSetting('emulatedCSSMediaFeaturePrefersReducedData'));
        }
        this.contentElement.createChild('div').classList.add('panel-section-separator');
        this._appendSelect(ls `Forces vision deficiency emulation`, Common.Settings.Settings.instance().moduleSetting('emulatedVisionDeficiency'));
        this.contentElement.createChild('div').classList.add('panel-section-separator');
        this._appendCheckbox(ls `Disable AVIF image format`, ls `Requires a page reload to apply and disables caching for image requests.`, Common.Settings.Settings.instance().moduleSetting('avifFormatDisabled'));
        this._appendCheckbox(ls `Disable WebP image format`, ls `Requires a page reload to apply and disables caching for image requests.`, Common.Settings.Settings.instance().moduleSetting('webpFormatDisabled'));
        this.contentElement.createChild('div').classList.add('panel-section-separator');
    }
    /**
     * @param {string} label
     * @param {string} subtitle
     * @param {!Common.Settings.Setting<boolean>} setting
     */
    _appendCheckbox(label, subtitle, setting) {
        const checkboxLabel = UI.UIUtils.CheckboxLabel.create(label, false, subtitle);
        UI.SettingsUI.bindCheckbox(checkboxLabel.checkboxElement, setting);
        this.contentElement.appendChild(checkboxLabel);
    }
    /**
     * @param {string} label
     * @param {!Common.Settings.Setting<*>} setting
     */
    _appendSelect(label, setting) {
        const control = UI.SettingsUI.createControlForSetting(setting, label);
        if (control) {
            this.contentElement.appendChild(control);
        }
    }
}
//# sourceMappingURL=RenderingOptions.js.map