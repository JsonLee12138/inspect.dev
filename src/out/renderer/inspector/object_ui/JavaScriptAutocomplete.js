// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Formatter from '../formatter/formatter.js';
import * as Platform from '../platform/platform.js';
import * as Root from '../root/root.js';
import * as SDK from '../sdk/sdk.js';
import * as TextUtils from '../text_utils/text_utils.js';
import * as UI from '../ui/ui.js';
const DEFAULT_TIMEOUT = 500;
/** @type {!JavaScriptAutocomplete} */
let javaScriptAutocompleteInstance;
export class JavaScriptAutocomplete {
    /** @private */
    constructor() {
        /** @type {!Map<string, {date: number, value: !Promise<!Array<!CompletionGroup>>}>} */
        this._expressionCache = new Map();
        SDK.ConsoleModel.ConsoleModel.instance().addEventListener(SDK.ConsoleModel.Events.CommandEvaluated, this._clearCache, this);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.RuntimeModel.ExecutionContext, this._clearCache, this);
        SDK.SDKModel.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerResumed, this._clearCache, this);
        SDK.SDKModel.TargetManager.instance().addModelListener(SDK.DebuggerModel.DebuggerModel, SDK.DebuggerModel.Events.DebuggerPaused, this._clearCache, this);
    }
    static instance() {
        if (!javaScriptAutocompleteInstance) {
            javaScriptAutocompleteInstance = new JavaScriptAutocomplete();
        }
        return javaScriptAutocompleteInstance;
    }
    _clearCache() {
        this._expressionCache.clear();
    }
    /**
     * @param {string} fullText
     * @param {string} query
     * @param {boolean=} force
     * @return {!Promise<!UI.SuggestBox.Suggestions>}
     */
    async completionsForTextInCurrentContext(fullText, query, force) {
        const trimmedText = fullText.trim();
        const [mapCompletions, expressionCompletions] = await Promise.all([this._mapCompletions(trimmedText, query), this._completionsForExpression(trimmedText, query, force)]);
        return mapCompletions.concat(expressionCompletions);
    }
    /**
     * @param {string} fullText
     * @return {!Promise<?{args: !Array<!Array<string>>, argumentIndex: number}|undefined>}
     */
    async argumentsHint(fullText) {
        const functionCall = await Formatter.FormatterWorkerPool.formatterWorkerPool().findLastFunctionCall(fullText);
        if (!functionCall) {
            return null;
        }
        const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        if (!executionContext) {
            return null;
        }
        const result = await executionContext.evaluate({
            expression: functionCall.baseExpression,
            objectGroup: 'argumentsHint',
            includeCommandLineAPI: true,
            silent: true,
            returnByValue: false,
            generatePreview: false,
            throwOnSideEffect: true,
            timeout: DEFAULT_TIMEOUT,
            allowUnsafeEvalBlockedByCSP: undefined,
            disableBreaks: undefined,
            replMode: undefined,
        }, 
        /* userGesture */ false, /* awaitPromise */ false);
        if (!result || 'error' in result || result.exceptionDetails ||
            ('object' in result && (!result.object || result.object.type !== 'function'))) {
            executionContext.runtimeModel.releaseObjectGroup('argumentsHint');
            return null;
        }
        const args = await this._argumentsForFunction(result.object, async () => {
            const result = await executionContext.evaluate({
                expression: functionCall.receiver,
                objectGroup: 'argumentsHint',
                includeCommandLineAPI: true,
                silent: true,
                returnByValue: false,
                generatePreview: false,
                throwOnSideEffect: true,
                timeout: DEFAULT_TIMEOUT,
                allowUnsafeEvalBlockedByCSP: undefined,
                disableBreaks: undefined,
                replMode: undefined,
            }, 
            /* userGesture */ false, /* awaitPromise */ false);
            return (result && !('error' in result) && !result.exceptionDetails && result.object) ? result.object : null;
        }, functionCall.functionName);
        executionContext.runtimeModel.releaseObjectGroup('argumentsHint');
        if (!args.length || (args.length === 1 && (!args[0] || !args[0].length))) {
            return null;
        }
        return { args, argumentIndex: functionCall.argumentIndex };
    }
    /**
     * @param {!SDK.RemoteObject.RemoteObject} functionObject
     * @param {function():!Promise<?SDK.RemoteObject.RemoteObject>} receiverObjGetter
     * @param {string=} parsedFunctionName
     * @return {!Promise<!Array<!Array<string>>>}
     */
    async _argumentsForFunction(functionObject, receiverObjGetter, parsedFunctionName) {
        const description = functionObject.description;
        if (!description) {
            return [];
        }
        if (!description.endsWith('{ [native code] }')) {
            return [await Formatter.FormatterWorkerPool.formatterWorkerPool().argumentsList(description)];
        }
        // Check if this is a bound function.
        if (description === 'function () { [native code] }') {
            const properties = await functionObject.getOwnProperties(false);
            const internalProperties = properties.internalProperties || [];
            const targetProperty = internalProperties.find(property => property.name === '[[TargetFunction]]');
            const argsProperty = internalProperties.find(property => property.name === '[[BoundArgs]]');
            const thisProperty = internalProperties.find(property => property.name === '[[BoundThis]]');
            if (thisProperty && targetProperty && argsProperty && targetProperty.value && thisProperty.value &&
                argsProperty.value) {
                const thisValue = thisProperty.value;
                const originalSignatures = await this._argumentsForFunction(targetProperty.value, () => Promise.resolve(thisValue));
                const boundArgsLength = SDK.RemoteObject.RemoteObject.arrayLength(argsProperty.value);
                const clippedArgs = [];
                for (const signature of originalSignatures) {
                    const restIndex = signature.slice(0, boundArgsLength).findIndex(arg => arg.startsWith('...'));
                    if (restIndex !== -1) {
                        clippedArgs.push(signature.slice(restIndex));
                    }
                    else {
                        clippedArgs.push(signature.slice(boundArgsLength));
                    }
                }
                return clippedArgs;
            }
        }
        const javaScriptMetadata = 
        /** @type {!Common.JavaScriptMetaData.JavaScriptMetaData} */ (await /** @type {!Root.Runtime.Extension} */ (Root.Runtime.Runtime.instance().extension(Common.JavaScriptMetaData.JavaScriptMetaData))
            .instance());
        const descriptionRegexResult = /^function ([^(]*)\(/.exec(description);
        const name = descriptionRegexResult && descriptionRegexResult[1] || parsedFunctionName;
        if (!name) {
            return [];
        }
        const uniqueSignatures = javaScriptMetadata.signaturesForNativeFunction(name);
        if (uniqueSignatures) {
            return uniqueSignatures;
        }
        const receiverObj = await receiverObjGetter();
        if (!receiverObj) {
            return [];
        }
        const className = receiverObj.className;
        if (className) {
            const instanceMethods = javaScriptMetadata.signaturesForInstanceMethod(name, className);
            if (instanceMethods) {
                return instanceMethods;
            }
        }
        // Check for static methods on a constructor.
        if (receiverObj.description && receiverObj.type === 'function' &&
            receiverObj.description.endsWith('{ [native code] }')) {
            const receiverDescriptionRegexResult = /^function ([^(]*)\(/.exec(receiverObj.description);
            if (receiverDescriptionRegexResult) {
                const receiverName = receiverDescriptionRegexResult[1];
                const staticSignatures = javaScriptMetadata.signaturesForStaticMethod(name, receiverName);
                if (staticSignatures) {
                    return staticSignatures;
                }
            }
        }
        /** @type {!Array<string>} */
        let protoNames;
        if (receiverObj.type === 'number') {
            protoNames = ['Number', 'Object'];
        }
        else if (receiverObj.type === 'string') {
            protoNames = ['String', 'Object'];
        }
        else if (receiverObj.type === 'symbol') {
            protoNames = ['Symbol', 'Object'];
        }
        else if (receiverObj.type === 'bigint') {
            protoNames = ['BigInt', 'Object'];
        }
        else if (receiverObj.type === 'boolean') {
            protoNames = ['Boolean', 'Object'];
        }
        else if (receiverObj.type === 'undefined' || receiverObj.subtype === 'null') {
            protoNames = [];
        }
        else {
            protoNames = await receiverObj.callFunctionJSON(function () {
                const result = [];
                for (let object = this; object; object = Object.getPrototypeOf(object)) {
                    if (typeof object === 'object' && object.constructor && object.constructor.name) {
                        result[result.length] = object.constructor.name;
                    }
                }
                return result;
            }, []);
        }
        if (!protoNames) {
            return [];
        }
        for (const proto of protoNames) {
            const instanceSignatures = javaScriptMetadata.signaturesForInstanceMethod(name, proto);
            if (instanceSignatures) {
                return instanceSignatures;
            }
        }
        return [];
    }
    /**
     * @param {string} text
     * @param {string} query
     * @return {!Promise<!UI.SuggestBox.Suggestions>}
     */
    async _mapCompletions(text, query) {
        const mapMatch = text.match(/\.\s*(get|set|delete)\s*\(\s*$/);
        const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        if (!executionContext || !mapMatch) {
            return [];
        }
        const expression = await Formatter.FormatterWorkerPool.formatterWorkerPool().findLastExpression(text.substring(0, mapMatch.index));
        if (!expression) {
            return [];
        }
        const result = await executionContext.evaluate({
            expression,
            objectGroup: 'mapCompletion',
            includeCommandLineAPI: true,
            silent: true,
            returnByValue: false,
            generatePreview: false,
            throwOnSideEffect: true,
            timeout: DEFAULT_TIMEOUT,
            allowUnsafeEvalBlockedByCSP: undefined,
            disableBreaks: undefined,
            replMode: undefined,
        }, 
        /* userGesture */ false, /* awaitPromise */ false);
        if ('error' in result || Boolean(result.exceptionDetails) || result.object.subtype !== 'map') {
            return [];
        }
        const properties = await result.object.getOwnProperties(false);
        const internalProperties = properties.internalProperties || [];
        const entriesProperty = internalProperties.find(property => property.name === '[[Entries]]');
        if (!entriesProperty || !entriesProperty.value) {
            return [];
        }
        const keysObj = await entriesProperty.value.callFunctionJSON(function () {
            const actualThis = /** @type {!Array<{key: ?}>} */ (this);
            /** @type {!Object<string, ?boolean>} */
            const result = { __proto__: null };
            for (let i = 0; i < actualThis.length; i++) {
                if (typeof actualThis[i].key === 'string') {
                    result[actualThis[i].key] = true;
                }
            }
            return result;
        }, []);
        executionContext.runtimeModel.releaseObjectGroup('mapCompletion');
        const rawKeys = Object.keys(keysObj);
        /** @type {!UI.SuggestBox.Suggestions} */
        const caseSensitivePrefix = [];
        /** @type {!UI.SuggestBox.Suggestions} */
        const caseInsensitivePrefix = [];
        /** @type {!UI.SuggestBox.Suggestions} */
        const caseSensitiveAnywhere = [];
        /** @type {!UI.SuggestBox.Suggestions} */
        const caseInsensitiveAnywhere = [];
        let quoteChar = '"';
        if (query.startsWith('\'')) {
            quoteChar = '\'';
        }
        let endChar = ')';
        if (mapMatch[0].indexOf('set') !== -1) {
            endChar = ', ';
        }
        const sorter = rawKeys.length < 1000 ? String.naturalOrderComparator : undefined;
        const keys = rawKeys.sort(sorter).map(key => quoteChar + key + quoteChar);
        for (const key of keys) {
            if (key.length < query.length) {
                continue;
            }
            if (query.length && key.toLowerCase().indexOf(query.toLowerCase()) === -1) {
                continue;
            }
            // Substitute actual newlines with newline characters. @see crbug.com/498421
            const title = key.split('\n').join('\\n');
            const text = title + endChar;
            if (key.startsWith(query)) {
                caseSensitivePrefix.push(/** @type {!UI.SuggestBox.Suggestion} */ ({ text: text, title: title, priority: 4 }));
            }
            else if (key.toLowerCase().startsWith(query.toLowerCase())) {
                caseInsensitivePrefix.push(/** @type {!UI.SuggestBox.Suggestion} */ ({ text: text, title: title, priority: 3 }));
            }
            else if (key.indexOf(query) !== -1) {
                caseSensitiveAnywhere.push(/** @type {!UI.SuggestBox.Suggestion} */ ({ text: text, title: title, priority: 2 }));
            }
            else {
                caseInsensitiveAnywhere.push(
                /** @type {!UI.SuggestBox.Suggestion} */ ({ text: text, title: title, priority: 1 }));
            }
        }
        const suggestions = caseSensitivePrefix.concat(caseInsensitivePrefix, caseSensitiveAnywhere, caseInsensitiveAnywhere);
        if (suggestions.length) {
            suggestions[0].subtitle = Common.UIString.UIString('Keys');
        }
        return suggestions;
    }
    /**
     * @param {string} fullText
     * @param {string} query
     * @param {boolean=} force
     * @return {!Promise<!UI.SuggestBox.Suggestions>}
     */
    async _completionsForExpression(fullText, query, force) {
        const executionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        if (!executionContext) {
            return [];
        }
        let expression;
        if (fullText.endsWith('?.')) {
            expression = await Formatter.FormatterWorkerPool.formatterWorkerPool().findLastExpression(fullText.substring(0, fullText.length - 2));
        }
        else if (fullText.endsWith('.') || fullText.endsWith('[')) {
            expression = await Formatter.FormatterWorkerPool.formatterWorkerPool().findLastExpression(fullText.substring(0, fullText.length - 1));
        }
        if (!expression) {
            if (fullText.endsWith('.')) {
                return [];
            }
            expression = '';
        }
        const expressionString = expression;
        const dotNotation = fullText.endsWith('.');
        const bracketNotation = Boolean(expressionString) && fullText.endsWith('[');
        // User is entering float value, do not suggest anything.
        if ((expressionString && !isNaN(Number(expressionString))) ||
            (!expressionString && query && !isNaN(Number(query)))) {
            return [];
        }
        if (!query && !expressionString && !force) {
            return [];
        }
        const selectedFrame = executionContext.debuggerModel.selectedCallFrame();
        /** @type {?Array<!CompletionGroup>} */
        let completionGroups;
        const TEN_SECONDS = 10000;
        let cache = this._expressionCache.get(expressionString);
        if (cache && cache.date + TEN_SECONDS > Date.now()) {
            completionGroups = await cache.value;
        }
        else if (!expressionString && selectedFrame) {
            /** @type {!Array<!CompletionGroup>} */
            const value = [{
                    items: ['this'],
                    title: undefined,
                }];
            const scopeChain = selectedFrame.scopeChain();
            const groupPromises = [];
            for (const scope of scopeChain) {
                groupPromises.push(scope.object()
                    .getAllProperties(false /* accessorPropertiesOnly */, false /* generatePreview */)
                    .then(result => ({ properties: result.properties, name: scope.name() })));
            }
            const fullScopes = await Promise.all(groupPromises);
            executionContext.runtimeModel.releaseObjectGroup('completion');
            for (const scope of fullScopes) {
                if (scope.properties) {
                    value.push({ title: scope.name, items: scope.properties.map(property => property.name).sort() });
                }
            }
            cache = { date: Date.now(), value: Promise.resolve(value) };
            this._expressionCache.set(expressionString, cache);
            completionGroups = await cache.value;
        }
        else {
            const resultPromise = executionContext.evaluate({
                expression: expressionString,
                objectGroup: 'completion',
                includeCommandLineAPI: true,
                silent: true,
                returnByValue: false,
                generatePreview: false,
                throwOnSideEffect: true,
                timeout: DEFAULT_TIMEOUT,
                allowUnsafeEvalBlockedByCSP: undefined,
                disableBreaks: undefined,
                replMode: undefined,
            }, 
            /* userGesture */ false, /* awaitPromise */ false);
            cache = { date: Date.now(), value: resultPromise.then(result => completionsOnGlobal.call(this, result)) };
            this._expressionCache.set(expressionString, cache);
            completionGroups = await cache.value;
        }
        return this._receivedPropertyNames(completionGroups.slice(0), dotNotation, bracketNotation, expressionString, query);
        /**
         * @this {JavaScriptAutocomplete}
         * @param {!SDK.RuntimeModel.EvaluationResult} result
         * @return {!Promise<!Array<!CompletionGroup>>}
         */
        async function completionsOnGlobal(result) {
            if ('error' in result || Boolean(result.exceptionDetails) || !result.object) {
                return [];
            }
            if (!executionContext) {
                return [];
            }
            /** @type {?SDK.RemoteObject.RemoteObject} */
            let object = result.object;
            while (object && object.type === 'object' && object.subtype === 'proxy') {
                /** @type {!SDK.RemoteObject.GetPropertiesResult} */
                const propertiesObject = await object.getOwnProperties(false /* generatePreview */);
                const internalProperties = propertiesObject.internalProperties || [];
                const target = internalProperties.find(property => property.name === '[[Target]]');
                if (target && target.value) {
                    object = target.value;
                }
                else {
                    break;
                }
            }
            if (!object) {
                return [];
            }
            /** @type {!Array<!CompletionGroup>} */
            let completions = [];
            if (object.type === 'object' || object.type === 'function') {
                completions = /** @type {!Array<!CompletionGroup>} */ (await object.callFunctionJSON(
                /** @type {function(this:Object, ...*):!Object} */ (getCompletions), [SDK.RemoteObject.RemoteObject.toCallArgument(object.subtype)])) ||
                    [];
            }
            else if (object.type === 'string' || object.type === 'number' || object.type === 'boolean' ||
                object.type === 'bigint') {
                const evaluateResult = await executionContext.evaluate({
                    expression: '(' + getCompletions + ')("' + object.type + '")',
                    objectGroup: 'completion',
                    includeCommandLineAPI: false,
                    silent: true,
                    returnByValue: true,
                    generatePreview: false,
                    allowUnsafeEvalBlockedByCSP: undefined,
                    disableBreaks: undefined,
                    replMode: undefined,
                    throwOnSideEffect: undefined,
                    timeout: undefined,
                }, 
                /* userGesture */ false, 
                /* awaitPromise */ false);
                if (!('error' in evaluateResult) && evaluateResult.object && !evaluateResult.exceptionDetails) {
                    completions = /** @type {!Array<!CompletionGroup>} */ (evaluateResult.object.value) || [];
                }
            }
            executionContext.runtimeModel.releaseObjectGroup('completion');
            if (!expressionString) {
                const globalNames = await executionContext.globalLexicalScopeNames();
                if (globalNames) {
                    // Merge lexical scope names with first completion group on global object: let a and let b should be in the same group.
                    if (completions.length) {
                        completions[0].items = completions[0].items.concat(globalNames);
                    }
                    else {
                        completions.push({ items: globalNames.sort(), title: Common.UIString.UIString('Lexical scope variables') });
                    }
                }
            }
            for (const group of completions) {
                for (let i = 0; i < group.items.length; i++) {
                    group.items[i] = group.items[i].replace(/\n/g, '\\n');
                }
                group.items.sort(group.items.length < 1000 ? this._itemComparator : undefined);
            }
            return completions;
            /**
             * @param {string=} type
             * @return {!Object}
             * @this {Object}
             */
            function getCompletions(type) {
                let object;
                if (type === 'string') {
                    object = new String('');
                }
                else if (type === 'number') {
                    object = new Number(0);
                }
                // Object-wrapped BigInts cannot be constructed via `new BigInt`.
                else if (type === 'bigint') {
                    object = Object(BigInt(0));
                }
                else if (type === 'boolean') {
                    object = new Boolean(false);
                }
                else {
                    object = this;
                }
                /** @type {!Array<!CompletionGroup>} */
                const result = [];
                try {
                    for (let o = object; o; o = Object.getPrototypeOf(o)) {
                        if ((type === 'array' || type === 'typedarray') && o === object && o.length > 9999) {
                            continue;
                        }
                        /** @type {!CompletionGroup} */
                        const group = /** @type {!CompletionGroup} */ ({ items: [], title: undefined, __proto__: null });
                        try {
                            if (typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, 'constructor') && o.constructor &&
                                o.constructor.name) {
                                group.title = o.constructor.name;
                            }
                        }
                        catch (ee) {
                            // we could break upon cross origin check.
                        }
                        result[result.length] = group;
                        const names = Object.getOwnPropertyNames(o);
                        const isArray = Array.isArray(o);
                        for (let i = 0; i < names.length && group.items.length < 10000; ++i) {
                            // Skip array elements indexes.
                            if (isArray && /^[0-9]/.test(names[i])) {
                                continue;
                            }
                            group.items[group.items.length] = names[i];
                        }
                    }
                }
                catch (e) {
                }
                return result;
            }
        }
    }
    /**
     * @param {?Array<!CompletionGroup>} propertyGroups
     * @param {boolean} dotNotation
     * @param {boolean} bracketNotation
     * @param {string} expressionString
     * @param {string} query
     * @return {!UI.SuggestBox.Suggestions}
     */
    _receivedPropertyNames(propertyGroups, dotNotation, bracketNotation, expressionString, query) {
        if (!propertyGroups) {
            return [];
        }
        const includeCommandLineAPI = (!dotNotation && !bracketNotation);
        if (includeCommandLineAPI) {
            const commandLineAPI = [
                'dir',
                'dirxml',
                'keys',
                'values',
                'profile',
                'profileEnd',
                'monitorEvents',
                'unmonitorEvents',
                'inspect',
                'copy',
                'clear',
                'getEventListeners',
                'debug',
                'undebug',
                'monitor',
                'unmonitor',
                'table',
                'queryObjects',
                '$',
                '$$',
                '$x',
                '$0',
                '$_'
            ];
            propertyGroups.push({
                items: commandLineAPI,
                title: undefined,
            });
        }
        return this._completionsForQuery(dotNotation, bracketNotation, expressionString, query, propertyGroups);
    }
    /**
       * @param {boolean} dotNotation
       * @param {boolean} bracketNotation
       * @param {string} expressionString
       * @param {string} query
       * @param {!Array<!CompletionGroup>} propertyGroups
       * @return {!UI.SuggestBox.Suggestions}
       */
    _completionsForQuery(dotNotation, bracketNotation, expressionString, query, propertyGroups) {
        const quoteUsed = (bracketNotation && query.startsWith('\'')) ? '\'' : '"';
        if (!expressionString) {
            // See ES2017 spec: https://www.ecma-international.org/ecma-262/8.0/index.html
            const keywords = [
                // Section 11.6.2.1 Reserved keywords.
                'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete', 'do', 'else',
                'exports', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'new', 'return',
                'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
                // Section 11.6.2.1's note mentions words treated as reserved in certain cases.
                'let', 'static',
                // Other keywords not explicitly reserved by spec.
                'async', 'of'
            ];
            propertyGroups.push({ title: ls `keywords`, items: keywords.sort() });
        }
        /** @type {!Set<string>} */
        const allProperties = new Set();
        /** @type {!UI.SuggestBox.Suggestions} */
        let result = [];
        let lastGroupTitle;
        const regex = /^[a-zA-Z_$\u008F-\uFFFF][a-zA-Z0-9_$\u008F-\uFFFF]*$/;
        const lowerCaseQuery = query.toLowerCase();
        for (const group of propertyGroups) {
            /** @type {!UI.SuggestBox.Suggestions} */
            const caseSensitivePrefix = [];
            /** @type {!UI.SuggestBox.Suggestions} */
            const caseInsensitivePrefix = [];
            /** @type {!UI.SuggestBox.Suggestions} */
            const caseSensitiveAnywhere = [];
            /** @type {!UI.SuggestBox.Suggestions} */
            const caseInsensitiveAnywhere = [];
            for (let i = 0; i < group.items.length; i++) {
                let property = group.items[i];
                // Assume that all non-ASCII characters are letters and thus can be used as part of identifier.
                if (!bracketNotation && !regex.test(property)) {
                    continue;
                }
                if (bracketNotation) {
                    if (!/^[0-9]+$/.test(property)) {
                        property = quoteUsed + Platform.StringUtilities.escapeCharacters(property, quoteUsed + '\\') + quoteUsed;
                    }
                    property += ']';
                }
                if (allProperties.has(property)) {
                    continue;
                }
                if (property.length < query.length) {
                    continue;
                }
                const lowerCaseProperty = property.toLowerCase();
                if (query.length && lowerCaseProperty.indexOf(lowerCaseQuery) === -1) {
                    continue;
                }
                allProperties.add(property);
                if (property.startsWith(query)) {
                    caseSensitivePrefix.push(
                    /** @type {!UI.SuggestBox.Suggestion} */ ({ text: property, priority: property === query ? 5 : 4 }));
                }
                else if (lowerCaseProperty.startsWith(lowerCaseQuery)) {
                    caseInsensitivePrefix.push(/** @type {!UI.SuggestBox.Suggestion} */ ({ text: property, priority: 3 }));
                }
                else if (property.indexOf(query) !== -1) {
                    caseSensitiveAnywhere.push(/** @type {!UI.SuggestBox.Suggestion} */ ({ text: property, priority: 2 }));
                }
                else {
                    caseInsensitiveAnywhere.push(/** @type {!UI.SuggestBox.Suggestion} */ ({ text: property, priority: 1 }));
                }
            }
            const structuredGroup = caseSensitivePrefix.concat(caseInsensitivePrefix, caseSensitiveAnywhere, caseInsensitiveAnywhere);
            if (structuredGroup.length && group.title !== lastGroupTitle) {
                structuredGroup[0].subtitle = group.title;
                lastGroupTitle = group.title;
            }
            result = result.concat(structuredGroup);
            result.forEach(item => {
                if (item.text.endsWith(']')) {
                    item.title = item.text.substring(0, item.text.length - 1);
                }
            });
        }
        return result;
    }
    /**
     * @param {string} a
     * @param {string} b
     * @return {number}
     */
    _itemComparator(a, b) {
        const aStartsWithUnderscore = a.startsWith('_');
        const bStartsWithUnderscore = b.startsWith('_');
        if (aStartsWithUnderscore && !bStartsWithUnderscore) {
            return 1;
        }
        if (bStartsWithUnderscore && !aStartsWithUnderscore) {
            return -1;
        }
        return String.naturalOrderComparator(a, b);
    }
    /**
     * @param {string} expression
     * @return {!Promise<boolean>}
     */
    static async isExpressionComplete(expression) {
        const currentExecutionContext = UI.Context.Context.instance().flavor(SDK.RuntimeModel.ExecutionContext);
        if (!currentExecutionContext) {
            return true;
        }
        const result = await currentExecutionContext.runtimeModel.compileScript(expression, '', false, currentExecutionContext.id);
        if (!result || !result.exceptionDetails || !result.exceptionDetails.exception) {
            return true;
        }
        const description = result.exceptionDetails.exception.description;
        if (description) {
            return !description.startsWith('SyntaxError: Unexpected end of input') &&
                !description.startsWith('SyntaxError: Unterminated template literal');
        }
        return false;
    }
}
export class JavaScriptAutocompleteConfig {
    /**
     * @param {!UI.TextEditor.TextEditor} editor
     */
    constructor(editor) {
        this._editor = editor;
    }
    /**
     * @param {!UI.TextEditor.TextEditor} editor
     * @return {!UI.SuggestBox.AutocompleteConfig}
     */
    static createConfigForEditor(editor) {
        const autocomplete = new JavaScriptAutocompleteConfig(editor);
        return {
            substituteRangeCallback: autocomplete._substituteRange.bind(autocomplete),
            suggestionsCallback: autocomplete._suggestionsCallback.bind(autocomplete),
            tooltipCallback: autocomplete._tooltipCallback.bind(autocomplete),
            anchorBehavior: undefined,
            isWordChar: undefined,
        };
    }
    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?TextUtils.TextRange.TextRange}
     */
    _substituteRange(lineNumber, columnNumber) {
        const token = this._editor.tokenAtTextPosition(lineNumber, columnNumber);
        if (token && token.type === 'js-string') {
            return new TextUtils.TextRange.TextRange(lineNumber, token.startColumn, lineNumber, columnNumber);
        }
        const lineText = this._editor.line(lineNumber);
        let index;
        for (index = columnNumber - 1; index >= 0; index--) {
            if (' =:[({;,!+-*/&|^<>.\t\r\n'.indexOf(lineText.charAt(index)) !== -1) {
                break;
            }
        }
        return new TextUtils.TextRange.TextRange(lineNumber, index + 1, lineNumber, columnNumber);
    }
    /**
     * @param {!TextUtils.TextRange.TextRange} queryRange
     * @param {!TextUtils.TextRange.TextRange} substituteRange
     * @param {boolean=} force
     * @return {!Promise<!UI.SuggestBox.Suggestions>}
     */
    async _suggestionsCallback(queryRange, substituteRange, force) {
        const query = this._editor.text(queryRange);
        const before = this._editor.text(new TextUtils.TextRange.TextRange(0, 0, queryRange.startLine, queryRange.startColumn));
        const token = this._editor.tokenAtTextPosition(substituteRange.startLine, substituteRange.startColumn);
        if (token) {
            const excludedTokens = new Set(['js-comment', 'js-string-2', 'js-def']);
            const trimmedBefore = before.trim();
            if (!trimmedBefore.endsWith('[') && !trimmedBefore.match(/\.\s*(get|set|delete)\s*\(\s*$/)) {
                excludedTokens.add('js-string');
            }
            if (!trimmedBefore.endsWith('.')) {
                excludedTokens.add('js-property');
            }
            if (excludedTokens.has(token.type)) {
                return [];
            }
        }
        const queryAndAfter = this._editor.line(queryRange.startLine).substring(queryRange.startColumn);
        const words = await JavaScriptAutocomplete.instance().completionsForTextInCurrentContext(before, query, force);
        if (!force && queryAndAfter && queryAndAfter !== query &&
            words.some(word => queryAndAfter.startsWith(word.text) && query.length !== word.text.length)) {
            return [];
        }
        return words;
    }
    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {!Promise<?Element>}
     */
    async _tooltipCallback(lineNumber, columnNumber) {
        const before = this._editor.text(new TextUtils.TextRange.TextRange(0, 0, lineNumber, columnNumber));
        const result = await JavaScriptAutocomplete.instance().argumentsHint(before);
        if (!result) {
            return null;
        }
        const argumentIndex = result.argumentIndex;
        const tooltip = document.createElement('div');
        for (const args of result.args) {
            const argumentsElement = document.createElement('span');
            for (let i = 0; i < args.length; i++) {
                if (i === argumentIndex || (i < argumentIndex && args[i].startsWith('...'))) {
                    argumentsElement.appendChild(UI.Fragment.html `<b>${args[i]}</b>`);
                }
                else {
                    UI.UIUtils.createTextChild(argumentsElement, args[i]);
                }
                if (i < args.length - 1) {
                    UI.UIUtils.createTextChild(argumentsElement, ', ');
                }
            }
            tooltip.appendChild(UI.Fragment.html `<div class='source-code'>\u0192(${argumentsElement})</div>`);
        }
        return tooltip;
    }
}
/** @typedef {{title:(string|undefined), items:Array<string>}} */
// @ts-ignore typedef
export let CompletionGroup;
//# sourceMappingURL=JavaScriptAutocomplete.js.map