// Copyright 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as ARIAUtils from './ARIAUtils.js';
import { Icon } from './Icon.js';
import { Keys } from './KeyboardShortcut.js';
import { createTextButton } from './UIUtils.js';
import { createShadowRootWithCoreStyles } from './utils/create-shadow-root-with-core-styles.js';
export class Infobar {
    /**
     * @param {!Type} type
     * @param {string} text
     * @param {!Array<!InfobarAction>=} actions
     * @param {!Common.Settings.Setting<*>=} disableSetting
     */
    constructor(type, text, actions, disableSetting) {
        this.element = /** @type {!HTMLElement} */ (document.createElement('div'));
        this.element.classList.add('flex-none');
        this._shadowRoot = createShadowRootWithCoreStyles(this.element, { cssFile: 'ui/infobar.css', enableLegacyPatching: true, delegatesFocus: undefined });
        /** @type {!HTMLDivElement} */
        this._contentElement =
            /** @type {!HTMLDivElement} */ (this._shadowRoot.createChild('div', 'infobar infobar-' + type));
        this._mainRow = this._contentElement.createChild('div', 'infobar-main-row');
        this._detailsRows = this._contentElement.createChild('div', 'infobar-details-rows hidden');
        this._hasDetails = false;
        this._infoContainer = this._mainRow.createChild('div', 'infobar-info-container');
        this._infoMessage = this._infoContainer.createChild('div', 'infobar-info-message');
        // TODO(chromium:1098185) Do we really need both sprite sheet and separate svg files?
        if (type === Type.Issue) {
            // Icon is part of sprite sheet.
            const icon = Icon.create('smallicon-issue-blue-text', 'icon');
            this._infoMessage.appendChild(icon);
        }
        else {
            // Icon is in separate file and included via CSS.
            this._infoMessage.createChild('div', type + '-icon icon');
        }
        this._infoText = this._infoMessage.createChild('div', 'infobar-info-text');
        this._infoText.textContent = text;
        ARIAUtils.markAsAlert(this._infoText);
        this._actionContainer = this._infoContainer.createChild('div', 'infobar-info-actions');
        if (actions) {
            for (const action of actions) {
                const actionCallback = this._actionCallbackFactory(action);
                let buttonClass = 'infobar-button';
                if (action.highlight) {
                    buttonClass += ' primary-button';
                }
                const button = createTextButton(action.text, actionCallback, buttonClass);
                this._actionContainer.appendChild(button);
            }
        }
        /** @type {?Common.Settings.Setting<*>} */
        this._disableSetting = disableSetting || null;
        if (disableSetting) {
            const disableButton = createTextButton(ls `Don't show again`, this._onDisable.bind(this), 'infobar-button');
            this._actionContainer.appendChild(disableButton);
        }
        this._closeContainer = this._mainRow.createChild('div', 'infobar-close-container');
        this._toggleElement =
            createTextButton(ls `Learn more`, this._onToggleDetails.bind(this), 'link-style devtools-link hidden');
        this._closeContainer.appendChild(this._toggleElement);
        this._closeButton = this._closeContainer.createChild('div', 'close-button', 'dt-close-button');
        // @ts-ignore This is a custom element defined in UIUitls.js that has a `setTabbable` that TS doesn't
        //            know about.
        this._closeButton.setTabbable(true);
        ARIAUtils.setDescription(this._closeButton, ls `Close`);
        self.onInvokeElement(this._closeButton, this.dispose.bind(this));
        if (type !== Type.Issue) {
            this._contentElement.tabIndex = 0;
        }
        ARIAUtils.setAccessibleName(this._contentElement, text);
        this._contentElement.addEventListener('keydown', event => {
            if (event.keyCode === Keys.Esc.code) {
                this.dispose();
                event.consume();
                return;
            }
            if (event.target !== this._contentElement) {
                return;
            }
            if (event.key === 'Enter' && this._hasDetails) {
                this._onToggleDetails();
                event.consume();
                return;
            }
        });
        /** @type {?function():*} */
        this._closeCallback = null;
    }
    /**
     * @param {!Type} type
     * @param {string} text
     * @param {!Array<!InfobarAction>=} actions
     * @param {!Common.Settings.Setting<*>=} disableSetting
     * @return {?Infobar}
     */
    static create(type, text, actions, disableSetting) {
        if (disableSetting && disableSetting.get()) {
            return null;
        }
        return new Infobar(type, text, actions, disableSetting);
    }
    dispose() {
        this.element.remove();
        this._onResize();
        if (this._closeCallback) {
            this._closeCallback.call(null);
        }
    }
    /**
     * @param {string} text
     */
    setText(text) {
        this._infoText.textContent = text;
        this._onResize();
    }
    /**
     * @param {?function():*} callback
     */
    setCloseCallback(callback) {
        this._closeCallback = callback;
    }
    /**
     * @param {!Widget} parentView
     */
    setParentView(parentView) {
        this._parentView = parentView;
    }
    /**
     * @param {!InfobarAction} action
     * @returns {!function():void}
     */
    _actionCallbackFactory(action) {
        if (!action.delegate) {
            return action.dismiss ? this.dispose.bind(this) : () => { };
        }
        if (!action.dismiss) {
            return action.delegate;
        }
        return (() => {
            if (action.delegate) {
                action.delegate();
            }
            this.dispose();
        })
            .bind(this);
    }
    _onResize() {
        if (this._parentView) {
            this._parentView.doResize();
        }
    }
    _onDisable() {
        if (this._disableSetting) {
            this._disableSetting.set(true);
        }
        this.dispose();
    }
    _onToggleDetails() {
        this._detailsRows.classList.remove('hidden');
        this._toggleElement.remove();
        this._onResize();
    }
    /**
     * @param {string=} message
     * @return {!Element}
     */
    createDetailsRowMessage(message) {
        this._hasDetails = true;
        this._toggleElement.classList.remove('hidden');
        const infobarDetailsRow = this._detailsRows.createChild('div', 'infobar-details-row');
        const detailsRowMessage = infobarDetailsRow.createChild('span', 'infobar-row-message');
        detailsRowMessage.textContent = message || '';
        return detailsRowMessage;
    }
}
/** @typedef {{
 *        text: !string,
 *        highlight: !boolean,
 *        delegate: ?function():void,
 *        dismiss: !boolean
 * }}
 */
// @ts-ignore typedef
export let InfobarAction;
/** @enum {string} */
export const Type = {
    Warning: 'warning',
    Info: 'info',
    Issue: 'issue',
};
//# sourceMappingURL=Infobar.js.map