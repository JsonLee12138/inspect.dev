// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import { ls } from '../platform/platform.js';
import * as Root from '../root/root.js';
import * as UI from '../ui/ui.js';
let loadedElementsModule;
async function loadElementsModule() {
    if (!loadedElementsModule) {
        // Side-effect import resources in module.json
        await Root.Runtime.Runtime.instance().loadModulePromise('elements');
        loadedElementsModule = await import('./elements.js');
    }
    return loadedElementsModule;
}
function maybeRetrieveContextTypes(getClassCallBack) {
    if (loadedElementsModule === undefined) {
        return [];
    }
    return getClassCallBack(loadedElementsModule);
}
UI.ViewManager.registerViewExtension({
    location: "panel" /* PANEL */,
    id: 'elements',
    commandPrompt: 'Show Elements',
    title: ls `Elements`,
    order: 10,
    persistence: "permanent" /* PERMANENT */,
    hasToolbar: false,
    async loadView() {
        const Elements = await loadElementsModule();
        return Elements.ElementsPanel.ElementsPanel.instance();
    },
});
UI.ViewManager.registerViewExtension({
    location: "elements-sidebar" /* ELEMENTS_SIDEBAR */,
    id: 'elements.eventListeners',
    commandPrompt: 'Show Event Listeners',
    title: ls `Event Listeners`,
    order: 5,
    hasToolbar: true,
    persistence: "permanent" /* PERMANENT */,
    async loadView() {
        const Elements = await loadElementsModule();
        return Elements.EventListenersWidget.EventListenersWidget.instance();
    },
});
UI.ViewManager.registerViewExtension({
    location: "elements-sidebar" /* ELEMENTS_SIDEBAR */,
    id: 'elements.domProperties',
    commandPrompt: 'Show Properties',
    title: ls `Properties`,
    order: 7,
    persistence: "permanent" /* PERMANENT */,
    async loadView() {
        const Elements = await loadElementsModule();
        return Elements.PropertiesWidget.PropertiesWidget.instance();
    },
});
UI.ViewManager.registerViewExtension({
    experiment: Root.Runtime.ExperimentName.CAPTURE_NODE_CREATION_STACKS,
    location: "elements-sidebar" /* ELEMENTS_SIDEBAR */,
    id: 'elements.domCreation',
    commandPrompt: 'Show Stack Trace',
    title: ls `Stack Trace`,
    order: 10,
    persistence: "permanent" /* PERMANENT */,
    async loadView() {
        const Elements = await loadElementsModule();
        return Elements.NodeStackTraceWidget.NodeStackTraceWidget.instance();
    },
});
UI.ViewManager.registerViewExtension({
    location: "elements-sidebar" /* ELEMENTS_SIDEBAR */,
    id: 'elements.layout',
    commandPrompt: 'Show Layout',
    title: ls `Layout`,
    order: 4,
    persistence: "permanent" /* PERMANENT */,
    async loadView() {
        const Elements = await loadElementsModule();
        return Elements.LayoutSidebarPane.LayoutSidebarPane.instance();
    },
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'elements.hide-element',
    category: UI.ActionRegistration.ActionCategory.ELEMENTS,
    title: ls `Hide element`,
    async loadActionDelegate() {
        const Elements = await loadElementsModule();
        return Elements.ElementsPanel.ElementsActionDelegate.instance();
    },
    contextTypes() {
        return maybeRetrieveContextTypes(Elements => [Elements.ElementsPanel.ElementsPanel]);
    },
    bindings: [
        {
            shortcut: 'H',
        },
    ],
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'elements.edit-as-html',
    category: UI.ActionRegistration.ActionCategory.ELEMENTS,
    title: ls `Edit as HTML`,
    async loadActionDelegate() {
        const Elements = await loadElementsModule();
        return Elements.ElementsPanel.ElementsActionDelegate.instance();
    },
    contextTypes() {
        return maybeRetrieveContextTypes(Elements => [Elements.ElementsPanel.ElementsPanel]);
    },
    bindings: [
        {
            shortcut: 'F2',
        },
    ],
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'elements.duplicate-element',
    category: UI.ActionRegistration.ActionCategory.ELEMENTS,
    title: ls `Duplicate element`,
    async loadActionDelegate() {
        const Elements = await loadElementsModule();
        return Elements.ElementsPanel.ElementsActionDelegate.instance();
    },
    contextTypes() {
        return maybeRetrieveContextTypes(Elements => [Elements.ElementsPanel.ElementsPanel]);
    },
    bindings: [
        {
            shortcut: 'Shift+Alt+Down',
        },
    ],
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'elements.undo',
    category: UI.ActionRegistration.ActionCategory.ELEMENTS,
    title: ls `Undo`,
    async loadActionDelegate() {
        const Elements = await loadElementsModule();
        return Elements.ElementsPanel.ElementsActionDelegate.instance();
    },
    contextTypes() {
        return maybeRetrieveContextTypes(Elements => [Elements.ElementsPanel.ElementsPanel]);
    },
    bindings: [
        {
            shortcut: 'Ctrl+Z',
            platform: "windows,linux" /* WindowsLinux */,
        },
        {
            shortcut: 'Meta+Z',
            platform: "mac" /* Mac */,
        },
    ],
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'elements.redo',
    category: UI.ActionRegistration.ActionCategory.ELEMENTS,
    title: ls `Redo`,
    async loadActionDelegate() {
        const Elements = await loadElementsModule();
        return Elements.ElementsPanel.ElementsActionDelegate.instance();
    },
    contextTypes() {
        return maybeRetrieveContextTypes(Elements => [Elements.ElementsPanel.ElementsPanel]);
    },
    bindings: [
        {
            shortcut: 'Ctrl+Y',
            platform: "windows,linux" /* WindowsLinux */,
        },
        {
            shortcut: 'Meta+Shift+Z',
            platform: "mac" /* Mac */,
        },
    ],
});
UI.ActionRegistration.registerActionExtension({
    actionId: 'elements.capture-area-screenshot',
    async loadActionDelegate() {
        const Elements = await loadElementsModule();
        return Elements.InspectElementModeController.ToggleSearchActionDelegate.instance();
    },
    condition: Root.Runtime.ConditionName.CAN_DOCK,
    title: ls `Capture area screenshot`,
    category: UI.ActionRegistration.ActionCategory.SCREENSHOT,
});
UI.ActionRegistration.registerActionExtension({
    category: UI.ActionRegistration.ActionCategory.ELEMENTS,
    actionId: 'elements.toggle-element-search',
    toggleable: true,
    async loadActionDelegate() {
        const Elements = await loadElementsModule();
        return Elements.InspectElementModeController.ToggleSearchActionDelegate.instance();
    },
    title: ls `Select an element in the page to inspect it`,
    iconClass: "largeicon-node-search" /* LARGEICON_NODE_SEARCH */,
    bindings: [
        {
            shortcut: 'Ctrl+Shift+C',
            platform: "windows,linux" /* WindowsLinux */,
        },
        {
            shortcut: 'Meta+Shift+C',
            platform: "mac" /* Mac */,
        },
    ],
});
Common.Settings.registerSettingExtension({
    category: Common.Settings.SettingCategoryObject.ELEMENTS,
    order: 1,
    title: ls `Show user agent shadow DOM`,
    settingName: 'showUAShadowDOM',
    settingType: Common.Settings.SettingTypeObject.BOOLEAN,
    defaultValue: false,
});
Common.Settings.registerSettingExtension({
    category: Common.Settings.SettingCategoryObject.ELEMENTS,
    order: 2,
    title: ls `Word wrap`,
    settingName: 'domWordWrap',
    settingType: Common.Settings.SettingTypeObject.BOOLEAN,
    options: [
        {
            value: true,
            title: ls `Enable DOM word wrap`,
        },
        {
            value: false,
            title: ls `Disable DOM word wrap`,
        },
    ],
    defaultValue: true,
});
Common.Settings.registerSettingExtension({
    category: Common.Settings.SettingCategoryObject.ELEMENTS,
    order: 3,
    title: ls `Show HTML comments`,
    settingName: 'showHTMLComments',
    settingType: Common.Settings.SettingTypeObject.BOOLEAN,
    defaultValue: true,
    options: [
        {
            value: true,
            title: ls `Show HTML comments`,
        },
        {
            value: false,
            title: ls `Hide HTML comments`,
        },
    ],
});
Common.Settings.registerSettingExtension({
    category: Common.Settings.SettingCategoryObject.ELEMENTS,
    order: 4,
    title: ls `Reveal DOM node on hover`,
    settingName: 'highlightNodeOnHoverInOverlay',
    settingType: Common.Settings.SettingTypeObject.BOOLEAN,
    defaultValue: true,
});
Common.Settings.registerSettingExtension({
    category: Common.Settings.SettingCategoryObject.ELEMENTS,
    order: 5,
    title: ls `Show detailed inspect tooltip`,
    settingName: 'showDetailedInspectTooltip',
    settingType: Common.Settings.SettingTypeObject.BOOLEAN,
    defaultValue: true,
});
Common.Settings.registerSettingExtension({
    settingName: 'showEventListenersForAncestors',
    settingType: Common.Settings.SettingTypeObject.BOOLEAN,
    defaultValue: true,
});
UI.ContextMenu.registerProvider({
    async loadProvider() {
        const Elements = await loadElementsModule();
        return Elements.ElementsPanel.ContextMenuProvider.instance();
    },
});
//# sourceMappingURL=elements-meta.js.map