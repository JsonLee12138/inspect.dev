// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as SDK from '../sdk/sdk.js';
import * as UI from '../ui/ui.js';
/**
 * @type {!WeakMap<!Element, !HTMLElement>}
 */
const containerToBreakpointEntry = new WeakMap();
/**
 * @type {!WeakMap<!Element, !HTMLInputElement>}
 */
const breakpointEntryToCheckbox = new WeakMap();
/** @type {!XHRBreakpointsSidebarPane} */
let xhrBreakpointsSidebarPaneInstance;
/**
 * @implements {UI.ContextFlavorListener.ContextFlavorListener}
 * @implements {UI.Toolbar.ItemsProvider}
 * @implements {UI.ListControl.ListDelegate<string>}
 */
export class XHRBreakpointsSidebarPane extends UI.Widget.VBox {
    /**
     * @private
     */
    constructor() {
        super(true);
        this.registerRequiredCSS('browser_debugger/xhrBreakpointsSidebarPane.css', { enableLegacyPatching: true });
        /** @type {!UI.ListModel.ListModel<string>} */
        this._breakpoints = new UI.ListModel.ListModel();
        this._list = new UI.ListControl.ListControl(this._breakpoints, this, UI.ListControl.ListMode.NonViewport);
        this.contentElement.appendChild(this._list.element);
        this._list.element.classList.add('breakpoint-list', 'hidden');
        UI.ARIAUtils.markAsList(this._list.element);
        UI.ARIAUtils.setAccessibleName(this._list.element, ls `XHR/fetch Breakpoints`);
        this._emptyElement = this.contentElement.createChild('div', 'gray-info-message');
        this._emptyElement.textContent = Common.UIString.UIString('No breakpoints');
        /** @type {!Map.<string, !Element>} */
        this._breakpointElements = new Map();
        this._addButton = new UI.Toolbar.ToolbarButton(ls `Add XHR/fetch breakpoint`, 'largeicon-add');
        this._addButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, event => {
            this._addButtonClicked();
        });
        this._emptyElement.addEventListener('contextmenu', this._emptyElementContextMenu.bind(this), true);
        this._emptyElement.tabIndex = -1;
        this._restoreBreakpoints();
        this._update();
    }
    static instance() {
        if (!xhrBreakpointsSidebarPaneInstance) {
            xhrBreakpointsSidebarPaneInstance = new XHRBreakpointsSidebarPane();
        }
        return xhrBreakpointsSidebarPaneInstance;
    }
    /**
     * @override
     * @return {!Array<!UI.Toolbar.ToolbarItem>}
     */
    toolbarItems() {
        return [this._addButton];
    }
    /**
     * @param {!Event} event
     */
    _emptyElementContextMenu(event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        contextMenu.defaultSection().appendItem(Common.UIString.UIString('Add breakpoint'), this._addButtonClicked.bind(this));
        contextMenu.show();
    }
    async _addButtonClicked() {
        await UI.ViewManager.ViewManager.instance().showView('sources.xhrBreakpoints');
        const inputElementContainer = document.createElement('p');
        inputElementContainer.classList.add('breakpoint-condition');
        inputElementContainer.textContent = Common.UIString.UIString('Break when URL contains:');
        const inputElement = inputElementContainer.createChild('span', 'breakpoint-condition-input');
        UI.ARIAUtils.setAccessibleName(inputElement, ls `URL Breakpoint`);
        this._addListElement(inputElementContainer, /** @type {?Element} */ (this._list.element.firstChild));
        /**
         * @param {boolean} accept
         * @param {!Element} e
         * @param {string} text
         * @this {XHRBreakpointsSidebarPane}
         */
        function finishEditing(accept, e, text) {
            this._removeListElement(inputElementContainer);
            if (accept) {
                SDK.DOMDebuggerModel.DOMDebuggerManager.instance().addXHRBreakpoint(text, true);
                this._setBreakpoint(text);
            }
            this._update();
        }
        const config = new UI.InplaceEditor.Config(finishEditing.bind(this, true), finishEditing.bind(this, false));
        UI.InplaceEditor.InplaceEditor.startEditing(inputElement, /** @type {!UI.InplaceEditor.Config<?>} */ (config));
    }
    /**
     * @override
     * @param {string} item
     * @return {number}
     */
    heightForItem(item) {
        return 0;
    }
    /**
     * @override
     * @param {string} item
     * @return {boolean}
     */
    isItemSelectable(item) {
        return true;
    }
    /**
     * @param {string} url
     */
    _setBreakpoint(url) {
        if (this._breakpoints.indexOf(url) !== -1) {
            this._list.refreshItem(url);
        }
        else {
            this._breakpoints.insertWithComparator(url, (a, b) => {
                if (a > b) {
                    return 1;
                }
                if (a < b) {
                    return -1;
                }
                return 0;
            });
        }
        if (!this._list.selectedItem() || !this.hasFocus()) {
            this._list.selectItem(this._breakpoints.at(0));
        }
    }
    /**
     * @override
     * @param {string} item
     * @return {!Element}
     */
    createElementForItem(item) {
        const listItemElement = document.createElement('div');
        UI.ARIAUtils.markAsListitem(listItemElement);
        const element = /** @type {!HTMLElement} */ (listItemElement.createChild('div', 'breakpoint-entry'));
        containerToBreakpointEntry.set(listItemElement, element);
        const enabled = SDK.DOMDebuggerModel.DOMDebuggerManager.instance().xhrBreakpoints().get(item) || false;
        UI.ARIAUtils.markAsCheckbox(element);
        UI.ARIAUtils.setChecked(element, enabled);
        element.addEventListener('contextmenu', this._contextMenu.bind(this, item), true);
        const title = item ? Common.UIString.UIString('URL contains "%s"', item) : Common.UIString.UIString('Any XHR or fetch');
        const label = UI.UIUtils.CheckboxLabel.create(title, enabled);
        UI.ARIAUtils.markAsHidden(label);
        UI.ARIAUtils.setAccessibleName(element, title);
        element.appendChild(label);
        label.checkboxElement.addEventListener('click', this._checkboxClicked.bind(this, item, enabled), false);
        element.addEventListener('click', event => {
            if (event.target === element) {
                this._checkboxClicked(item, enabled);
            }
        }, false);
        breakpointEntryToCheckbox.set(element, label.checkboxElement);
        label.checkboxElement.tabIndex = -1;
        element.tabIndex = -1;
        if (item === this._list.selectedItem()) {
            element.tabIndex = 0;
            this.setDefaultFocusedElement(element);
        }
        element.addEventListener('keydown', event => {
            let handled = false;
            if (event.key === ' ') {
                this._checkboxClicked(item, enabled);
                handled = true;
            }
            else if (isEnterKey(event)) {
                this._labelClicked(item);
                handled = true;
            }
            if (handled) {
                event.consume(true);
            }
        });
        if (item === this._hitBreakpoint) {
            element.classList.add('breakpoint-hit');
            UI.ARIAUtils.setDescription(element, ls `breakpoint hit`);
        }
        label.classList.add('cursor-auto');
        label.textElement.addEventListener('dblclick', this._labelClicked.bind(this, item), false);
        this._breakpointElements.set(item, listItemElement);
        return listItemElement;
    }
    /**
     * @override
     * @param {?string} from
     * @param {?string} to
     * @param {?HTMLElement} fromElement
     * @param {?HTMLElement} toElement
     */
    selectedItemChanged(from, to, fromElement, toElement) {
        if (fromElement) {
            const breakpointEntryElement = containerToBreakpointEntry.get(fromElement);
            if (!breakpointEntryElement) {
                throw new Error('Expected breakpoint entry to be found for an element');
            }
            breakpointEntryElement.tabIndex = -1;
        }
        if (toElement) {
            const breakpointEntryElement = containerToBreakpointEntry.get(toElement);
            if (!breakpointEntryElement) {
                throw new Error('Expected breakpoint entry to be found for an element');
            }
            this.setDefaultFocusedElement(breakpointEntryElement);
            breakpointEntryElement.tabIndex = 0;
            if (this.hasFocus()) {
                breakpointEntryElement.focus();
            }
        }
    }
    /**
     * @override
     * @param {?Element} fromElement
     * @param {?Element} toElement
     */
    updateSelectedItemARIA(fromElement, toElement) {
        return true;
    }
    /**
     * @param {string} url
     */
    _removeBreakpoint(url) {
        const index = this._breakpoints.indexOf(url);
        if (index >= 0) {
            this._breakpoints.remove(index);
        }
        this._breakpointElements.delete(url);
        this._update();
    }
    /**
     * @param {!Element} element
     * @param {?Node} beforeNode
     */
    _addListElement(element, beforeNode) {
        this._list.element.insertBefore(element, beforeNode);
        this._emptyElement.classList.add('hidden');
        this._list.element.classList.remove('hidden');
    }
    /**
     * @param {!Element} element
     */
    _removeListElement(element) {
        this._list.element.removeChild(element);
        if (!this._list.element.firstElementChild) {
            this._emptyElement.classList.remove('hidden');
            this._list.element.classList.add('hidden');
        }
    }
    /**
     * @param {string} url
     * @param {!Event} event
     */
    _contextMenu(url, event) {
        const contextMenu = new UI.ContextMenu.ContextMenu(event);
        /**
         * @this {XHRBreakpointsSidebarPane}
         */
        function removeBreakpoint() {
            SDK.DOMDebuggerModel.DOMDebuggerManager.instance().removeXHRBreakpoint(url);
            this._removeBreakpoint(url);
        }
        /**
         * @this {XHRBreakpointsSidebarPane}
         */
        function removeAllBreakpoints() {
            for (const url of this._breakpointElements.keys()) {
                SDK.DOMDebuggerModel.DOMDebuggerManager.instance().removeXHRBreakpoint(url);
                this._removeBreakpoint(url);
            }
            this._update();
        }
        const removeAllTitle = Common.UIString.UIString('Remove all breakpoints');
        contextMenu.defaultSection().appendItem(Common.UIString.UIString('Add breakpoint'), this._addButtonClicked.bind(this));
        contextMenu.defaultSection().appendItem(Common.UIString.UIString('Remove breakpoint'), removeBreakpoint.bind(this));
        contextMenu.defaultSection().appendItem(removeAllTitle, removeAllBreakpoints.bind(this));
        contextMenu.show();
    }
    /**
     * @param {string} url
     * @param {boolean} checked
     */
    _checkboxClicked(url, checked) {
        const hadFocus = this.hasFocus();
        SDK.DOMDebuggerModel.DOMDebuggerManager.instance().toggleXHRBreakpoint(url, !checked);
        this._list.refreshItem(url);
        this._list.selectItem(url);
        if (hadFocus) {
            this.focus();
        }
    }
    /**
     * @param {string} url
     */
    _labelClicked(url) {
        const element = this._breakpointElements.get(url);
        const inputElement = document.createElement('span');
        inputElement.classList.add('breakpoint-condition');
        inputElement.textContent = url;
        if (element) {
            this._list.element.insertBefore(inputElement, element);
            element.classList.add('hidden');
        }
        /**
         * @param {boolean} accept
         * @param {!Element} e
         * @param {string} text
         * @this {XHRBreakpointsSidebarPane}
         */
        function finishEditing(accept, e, text) {
            this._removeListElement(inputElement);
            if (accept) {
                SDK.DOMDebuggerModel.DOMDebuggerManager.instance().removeXHRBreakpoint(url);
                this._removeBreakpoint(url);
                let enabled = true;
                if (element) {
                    const breakpointEntryElement = containerToBreakpointEntry.get(element);
                    const checkboxElement = breakpointEntryElement ? breakpointEntryToCheckbox.get(breakpointEntryElement) : undefined;
                    if (checkboxElement) {
                        enabled = checkboxElement.checked;
                    }
                }
                SDK.DOMDebuggerModel.DOMDebuggerManager.instance().addXHRBreakpoint(text, enabled);
                this._setBreakpoint(text);
                this._list.selectItem(text);
            }
            else if (element) {
                element.classList.remove('hidden');
            }
            this.focus();
        }
        const config = new UI.InplaceEditor.Config(finishEditing.bind(this, true), finishEditing.bind(this, false));
        UI.InplaceEditor.InplaceEditor.startEditing(inputElement, /** @type {!UI.InplaceEditor.Config<?>} */ (config));
    }
    /**
     * @override
     * @param {?Object} object
     */
    flavorChanged(object) {
        this._update();
    }
    _update() {
        const isEmpty = this._breakpoints.length === 0;
        this._list.element.classList.toggle('hidden', isEmpty);
        this._emptyElement.classList.toggle('hidden', !isEmpty);
        const details = UI.Context.Context.instance().flavor(SDK.DebuggerModel.DebuggerPausedDetails);
        if (!details || details.reason !== Protocol.Debugger.PausedEventReason.XHR) {
            if (this._hitBreakpoint) {
                const oldHitBreakpoint = this._hitBreakpoint;
                delete this._hitBreakpoint;
                if (this._breakpoints.indexOf(oldHitBreakpoint) >= 0) {
                    this._list.refreshItem(oldHitBreakpoint);
                }
            }
            return;
        }
        const url = details.auxData && details.auxData['breakpointURL'];
        this._hitBreakpoint = url;
        if (this._breakpoints.indexOf(url) < 0) {
            return;
        }
        this._list.refreshItem(url);
        UI.ViewManager.ViewManager.instance().showView('sources.xhrBreakpoints');
    }
    _restoreBreakpoints() {
        const breakpoints = SDK.DOMDebuggerModel.DOMDebuggerManager.instance().xhrBreakpoints();
        for (const url of breakpoints.keys()) {
            this._setBreakpoint(url);
        }
    }
}
//# sourceMappingURL=XHRBreakpointsSidebarPane.js.map