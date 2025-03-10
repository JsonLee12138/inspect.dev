// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as i18n from '../i18n/i18n.js';
import * as SDK from '../sdk/sdk.js';
import * as UI from '../ui/ui.js';
import { MobileThrottlingSelector } from './MobileThrottlingSelector.js';
import { NetworkThrottlingSelector } from './NetworkThrottlingSelector.js';
import { ThrottlingPresets } from './ThrottlingPresets.js'; // eslint-disable-line no-unused-vars
export const UIStrings = {
    /**
    *@description Text with two placeholders separated by a colon
    *@example {Node removed} PH1
    *@example {div#id1} PH2
    */
    sS: '{PH1}: {PH2}',
    /**
    *@description Text in Throttling Manager of the Network panel
    */
    add: 'Add…',
    /**
    *@description Accessibility label for custom add network throttling option
    *@example {Custom} PH1
    */
    addS: 'Add {PH1}',
    /**
    *@description Text to indicate the network connectivity is offline
    */
    offline: 'Offline',
    /**
    *@description Text in Throttling Manager of the Network panel
    */
    forceDisconnectedFromNetwork: 'Force disconnected from network',
    /**
    *@description Text for throttling the network
    */
    throttling: 'Throttling',
    /**
    *@description Icon title in Throttling Manager of the Network panel
    */
    cpuThrottlingIsEnabled: 'CPU throttling is enabled',
    /**
    *@description Screen reader label for a select box that chooses the CPU throttling speed in the Performance panel
    */
    cpuThrottling: 'CPU throttling',
    /**
    *@description Text for no network throttling
    */
    noThrottling: 'No throttling',
    /**
    *@description Text in Throttling Manager of the Network panel
    *@example {2} PH1
    */
    dSlowdown: '{PH1}× slowdown',
};
const str_ = i18n.i18n.registerUIStrings('mobile_throttling/ThrottlingManager.js', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/** @type {!ThrottlingManager} */
let throttlingManagerInstance;
/**
 * @implements {SDK.SDKModel.SDKModelObserver<!SDK.EmulationModel.EmulationModel>}
 */
export class ThrottlingManager extends Common.ObjectWrapper.ObjectWrapper {
    /**
     * @private
     */
    constructor() {
        super();
        this._cpuThrottlingRate = ThrottlingPresets.CPUThrottlingRates.NoThrottling;
        /** @type {!Set<!UI.Toolbar.ToolbarComboBox>} */
        this._cpuThrottlingControls = new Set();
        this._cpuThrottlingRates = ThrottlingPresets.cpuThrottlingPresets;
        /** @type {!Common.Settings.Setting<!Array<!SDK.NetworkManager.Conditions>>} */
        this._customNetworkConditionsSetting = Common.Settings.Settings.instance().moduleSetting('customNetworkConditions');
        /** @type {!SDK.NetworkManager.Conditions} */
        this._currentNetworkThrottlingConditions = SDK.NetworkManager.NoThrottlingConditions;
        /** @type {!SDK.NetworkManager.Conditions} */
        this._lastNetworkThrottlingConditions;
        SDK.NetworkManager.MultitargetNetworkManager.instance().addEventListener(SDK.NetworkManager.MultitargetNetworkManager.Events.ConditionsChanged, () => {
            this._lastNetworkThrottlingConditions = this._currentNetworkThrottlingConditions;
            this._currentNetworkThrottlingConditions =
                SDK.NetworkManager.MultitargetNetworkManager.instance().networkConditions();
        });
        SDK.SDKModel.TargetManager.instance().observeModels(SDK.EmulationModel.EmulationModel, this);
    }
    /**
     * @param {{forceNew: ?boolean}} opts
     */
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!throttlingManagerInstance || forceNew) {
            throttlingManagerInstance = new ThrottlingManager();
        }
        return throttlingManagerInstance;
    }
    /**
     * @param {!HTMLSelectElement} selectElement
     * @return {!NetworkThrottlingSelector}
     */
    decorateSelectWithNetworkThrottling(selectElement) {
        /** @type {!Array<?SDK.NetworkManager.Conditions>} */
        let options = [];
        const selector = new NetworkThrottlingSelector(populate, select, this._customNetworkConditionsSetting);
        selectElement.addEventListener('change', optionSelected, false);
        return selector;
        /**
         * @param {!Array.<!NetworkThrottlingConditionsGroup>} groups
         * @return {!Array<?SDK.NetworkManager.Conditions>}
         */
        function populate(groups) {
            selectElement.removeChildren();
            options = [];
            for (let i = 0; i < groups.length; ++i) {
                const group = groups[i];
                const groupElement = /** @type {!HTMLOptGroupElement} */ (selectElement.createChild('optgroup'));
                groupElement.label = group.title;
                for (const conditions of group.items) {
                    const title = conditions.title;
                    const option = new Option(title, title);
                    UI.ARIAUtils.setAccessibleName(option, i18nString(UIStrings.sS, { PH1: group.title, PH2: title }));
                    groupElement.appendChild(option);
                    options.push(conditions);
                }
                if (i === groups.length - 1) {
                    const option = new Option(i18nString(UIStrings.add), i18nString(UIStrings.add));
                    UI.ARIAUtils.setAccessibleName(option, i18nString(UIStrings.addS, { PH1: group.title }));
                    groupElement.appendChild(option);
                    options.push(null);
                }
            }
            return options;
        }
        function optionSelected() {
            if (selectElement.selectedIndex === selectElement.options.length - 1) {
                selector.revealAndUpdate();
            }
            else {
                const option = options[selectElement.selectedIndex];
                if (option) {
                    selector.optionSelected(option);
                }
            }
        }
        /**
         * @param {number} index
         */
        function select(index) {
            if (selectElement.selectedIndex !== index) {
                selectElement.selectedIndex = index;
            }
        }
    }
    /**
     * @return {!UI.Toolbar.ToolbarCheckbox}
     */
    createOfflineToolbarCheckbox() {
        const checkbox = new UI.Toolbar.ToolbarCheckbox(i18nString(UIStrings.offline), i18nString(UIStrings.forceDisconnectedFromNetwork), forceOffline.bind(this));
        SDK.NetworkManager.MultitargetNetworkManager.instance().addEventListener(SDK.NetworkManager.MultitargetNetworkManager.Events.ConditionsChanged, networkConditionsChanged);
        checkbox.setChecked(SDK.NetworkManager.MultitargetNetworkManager.instance().networkConditions() ===
            SDK.NetworkManager.OfflineConditions);
        /**
         * @this {!ThrottlingManager}
         */
        function forceOffline() {
            if (checkbox.checked()) {
                SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.OfflineConditions);
            }
            else {
                SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(this._lastNetworkThrottlingConditions);
            }
        }
        function networkConditionsChanged() {
            checkbox.setChecked(SDK.NetworkManager.MultitargetNetworkManager.instance().networkConditions() ===
                SDK.NetworkManager.OfflineConditions);
        }
        return checkbox;
    }
    /**
     * @return {!UI.Toolbar.ToolbarMenuButton}
     */
    createMobileThrottlingButton() {
        const button = new UI.Toolbar.ToolbarMenuButton(appendItems);
        button.setTitle(i18nString(UIStrings.throttling));
        button.setGlyph('');
        button.turnIntoSelect();
        button.setDarkText();
        /** @type {!ConditionsList} */
        let options = [];
        let selectedIndex = -1;
        const selector = new MobileThrottlingSelector(populate, select);
        return button;
        /**
         * @param {!UI.ContextMenu.ContextMenu} contextMenu
         */
        function appendItems(contextMenu) {
            for (let index = 0; index < options.length; ++index) {
                const conditions = options[index];
                if (!conditions) {
                    continue;
                }
                if (conditions.title === ThrottlingPresets.getCustomConditions().title &&
                    conditions.description === ThrottlingPresets.getCustomConditions().description) {
                    continue;
                }
                contextMenu.defaultSection().appendCheckboxItem(i18nString(conditions.title), selector.optionSelected.bind(selector, /** @type {!Conditions} */ (conditions)), selectedIndex === index);
            }
        }
        /**
         * @param {!Array.<!MobileThrottlingConditionsGroup>} groups
         * @return {!ConditionsList}
         */
        function populate(groups) {
            options = [];
            for (const group of groups) {
                for (const conditions of group.items) {
                    options.push(conditions);
                }
                options.push(null);
            }
            return options;
        }
        /**
         * @param {number} index
         */
        function select(index) {
            selectedIndex = index;
            const option = options[index];
            if (option) {
                button.setText(option.title);
                button.setTitle(option.description);
            }
        }
    }
    /**
     * @return {number}
     */
    cpuThrottlingRate() {
        return this._cpuThrottlingRate;
    }
    /**
     * @param {!number} rate
     */
    setCPUThrottlingRate(rate) {
        this._cpuThrottlingRate = rate;
        for (const emulationModel of SDK.SDKModel.TargetManager.instance().models(SDK.EmulationModel.EmulationModel)) {
            emulationModel.setCPUThrottlingRate(this._cpuThrottlingRate);
        }
        let icon = null;
        if (this._cpuThrottlingRate !== ThrottlingPresets.CPUThrottlingRates.NoThrottling) {
            Host.userMetrics.actionTaken(Host.UserMetrics.Action.CpuThrottlingEnabled);
            icon = UI.Icon.Icon.create('smallicon-warning');
            UI.Tooltip.Tooltip.install(icon, i18nString(UIStrings.cpuThrottlingIsEnabled));
        }
        const index = this._cpuThrottlingRates.indexOf(this._cpuThrottlingRate);
        for (const control of this._cpuThrottlingControls) {
            control.setSelectedIndex(index);
        }
        UI.InspectorView.InspectorView.instance().setPanelIcon('timeline', icon);
        this.dispatchEventToListeners(Events.RateChanged, this._cpuThrottlingRate);
    }
    /**
     * @override
     * @param {!SDK.EmulationModel.EmulationModel} emulationModel
     */
    modelAdded(emulationModel) {
        if (this._cpuThrottlingRate !== ThrottlingPresets.CPUThrottlingRates.NoThrottling) {
            emulationModel.setCPUThrottlingRate(this._cpuThrottlingRate);
        }
    }
    /**
     * @override
     * @param {!SDK.EmulationModel.EmulationModel} emulationModel
     */
    modelRemoved(emulationModel) {
    }
    /**
     * @return {!UI.Toolbar.ToolbarComboBox}
     */
    createCPUThrottlingSelector() {
        const control = new UI.Toolbar.ToolbarComboBox(event => this.setCPUThrottlingRate(this._cpuThrottlingRates[ /** @type {!HTMLSelectElement} */(event.target).selectedIndex]), i18nString(UIStrings.cpuThrottling));
        this._cpuThrottlingControls.add(control);
        const currentRate = this._cpuThrottlingRate;
        for (let i = 0; i < this._cpuThrottlingRates.length; ++i) {
            const rate = this._cpuThrottlingRates[i];
            const title = rate === 1 ? i18nString(UIStrings.noThrottling) : i18nString(UIStrings.dSlowdown, { PH1: rate });
            const option = control.createOption(title);
            control.addOption(option);
            if (currentRate === rate) {
                control.setSelectedIndex(i);
            }
        }
        return control;
    }
}
/** @enum {symbol} */
export const Events = {
    RateChanged: Symbol('RateChanged')
};
/**
 * @implements {UI.ActionRegistration.ActionDelegate}
 */
export class ActionDelegate {
    /**
     * @override
     * @param {!UI.Context.Context} context
     * @param {string} actionId
     * @return {boolean}
     */
    handleAction(context, actionId) {
        if (actionId === 'network-conditions.network-online') {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.NoThrottlingConditions);
            return true;
        }
        if (actionId === 'network-conditions.network-low-end-mobile') {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.Slow3GConditions);
            return true;
        }
        if (actionId === 'network-conditions.network-mid-tier-mobile') {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.Fast3GConditions);
            return true;
        }
        if (actionId === 'network-conditions.network-offline') {
            SDK.NetworkManager.MultitargetNetworkManager.instance().setNetworkConditions(SDK.NetworkManager.OfflineConditions);
            return true;
        }
        return false;
    }
}
/**
 * @return {!ThrottlingManager}
 */
export function throttlingManager() {
    return ThrottlingManager.instance();
}
//# sourceMappingURL=ThrottlingManager.js.map