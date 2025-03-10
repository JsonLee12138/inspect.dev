// Copyright 2014 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Root from '../root/root.js'; // eslint-disable-line no-unused-vars
import { getRegisteredActionExtensions, LegacyActionRegistration } from './ActionRegistration.js'; // eslint-disable-line no-unused-vars
import { Context } from './Context.js'; // eslint-disable-line no-unused-vars
/** @type {!ActionRegistry} */
let actionRegistryInstance;
export class ActionRegistry {
    /**
     * @private
     */
    constructor() {
        /** @type {!Map.<string, !Action>} */
        this._actionsById = new Map();
        this._registerActions();
    }
    /**
     * @param {{forceNew: ?boolean}} opts
     */
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!actionRegistryInstance || forceNew) {
            actionRegistryInstance = new ActionRegistry();
        }
        return actionRegistryInstance;
    }
    _registerActions() {
        const registeredActionExtensions = getRegisteredActionExtensions();
        for (const action of registeredActionExtensions) {
            this._actionsById.set(action.id(), action);
            if (!action.canInstantiate()) {
                action.setEnabled(false);
            }
        }
        // This call is done for the legacy Actions in module.json
        // TODO(crbug.com/1134103): Remove this call when all actions are migrated
        Root.Runtime.Runtime.instance().extensions('action').forEach(registerExtension, this);
        /**
         * @param {!Root.Runtime.Extension} extension
         * @this {ActionRegistry}
         */
        function registerExtension(extension) {
            const actionId = extension.descriptor().actionId;
            if (!actionId) {
                console.error(`No actionId provided for extension ${extension.descriptor().name}`);
                return;
            }
            console.assert(!this._actionsById.get(actionId));
            const action = new LegacyActionRegistration(extension);
            if (!action.category() || action.title()) {
                this._actionsById.set(actionId, action);
            }
            else {
                console.error(`Category actions require a title for command menu: ${actionId}`);
            }
            if (!extension.canInstantiate()) {
                action.setEnabled(false);
            }
        }
    }
    /**
     * @return {!Array.<!Action>}
     */
    availableActions() {
        return this.applicableActions([...this._actionsById.keys()], Context.instance());
    }
    /**
     * @return {!Array.<!Action>}
     */
    actions() {
        return [...this._actionsById.values()];
    }
    /**
     * @param {!Array.<string>} actionIds
     * @param {!Context} context
     * @return {!Array.<!Action>}
     */
    applicableActions(actionIds, context) {
        /** @type {!Array<!Root.Runtime.Extension>} */
        const extensions = [];
        /** @type {!Array<!PreRegisteredAction>} */
        const applicablePreRegisteredActions = [];
        for (const actionId of actionIds) {
            const action = this._actionsById.get(actionId);
            if (action && action.enabled()) {
                if (action instanceof LegacyActionRegistration) {
                    // This call is done for the legacy Actions in module.json
                    // TODO(crbug.com/1134103): Remove this call when all actions are migrated
                    extensions.push(action.extension());
                }
                else if (isActionApplicableToContextTypes(
                /** @type {!PreRegisteredAction} */ (action), context.flavors())) {
                    applicablePreRegisteredActions.push(/** @type {!PreRegisteredAction} */ (action));
                }
            }
        }
        // The call done to Context.applicableExtensions to validate if a legacy Runtime Action extension is applicable
        // will be replaced by isActionApplicableToContextTypes(), which does not rely on Runtime to do the validation.
        // TODO(crbug.com/1134103): Remove this call when all actions are migrated.
        const applicableActionExtensions = [...context.applicableExtensions(extensions)].map(extensionToAction.bind(this));
        return [...applicableActionExtensions, ...applicablePreRegisteredActions];
        /**
         * @param {!Root.Runtime.Extension} extension
         * @return {!Action}
         * @this {ActionRegistry}
         */
        function extensionToAction(extension) {
            const actionId = /** @type {string} */ (extension.descriptor().actionId);
            return /** @type {!Action} */ (this.action(actionId));
        }
        /**
         * @param {!PreRegisteredAction} action
         * @param {!Set.<?>} currentContextTypes
         * @return {boolean}
         */
        function isActionApplicableToContextTypes(action, currentContextTypes) {
            const contextTypes = action.contextTypes();
            if (!contextTypes) {
                return true;
            }
            for (let i = 0; i < contextTypes.length; ++i) {
                const contextType = contextTypes[i];
                const isMatching = Boolean(contextType) && currentContextTypes.has(contextType);
                if (isMatching) {
                    return true;
                }
            }
            return false;
        }
    }
    /**
     * @param {string} actionId
     * @return {?Action}
     */
    action(actionId) {
        return this._actionsById.get(actionId) || null;
    }
}
//# sourceMappingURL=ActionRegistry.js.map