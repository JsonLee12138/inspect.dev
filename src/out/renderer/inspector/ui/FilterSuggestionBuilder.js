// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
export class FilterSuggestionBuilder {
    /**
     * @param {!Array<string>} keys
     * @param {function(string, !Array<string>):void=} valueSorter
     */
    constructor(keys, valueSorter) {
        this._keys = keys;
        this._valueSorter = valueSorter || ((key, result) => result.sort());
        /** @type {!Map<string, !Set<string>>} */
        this._valuesMap = new Map();
    }
    /**
     * @param {string} expression
     * @param {string} prefix
     * @param {boolean=} force
     * @return {!Promise<!Suggestions>}
     */
    completions(expression, prefix, force) {
        if (!prefix && !force) {
            return Promise.resolve([]);
        }
        const negative = prefix.startsWith('-');
        if (negative) {
            prefix = prefix.substring(1);
        }
        const modifier = negative ? '-' : '';
        const valueDelimiterIndex = prefix.indexOf(':');
        /** @type {!Suggestions} */
        const suggestions = [];
        if (valueDelimiterIndex === -1) {
            const matcher = new RegExp('^' + prefix.escapeForRegExp(), 'i');
            for (const key of this._keys) {
                if (matcher.test(key)) {
                    suggestions.push(/** @type {!Suggestion} */ ({ text: modifier + key + ':' }));
                }
            }
        }
        else {
            const key = prefix.substring(0, valueDelimiterIndex).toLowerCase();
            const value = prefix.substring(valueDelimiterIndex + 1);
            const matcher = new RegExp('^' + value.escapeForRegExp(), 'i');
            const values = Array.from(this._valuesMap.get(key) || new Set());
            this._valueSorter(key, values);
            for (const item of values) {
                if (matcher.test(item) && (item !== value)) {
                    suggestions.push(/** @type {!Suggestion} */ ({ text: modifier + key + ':' + item }));
                }
            }
        }
        return Promise.resolve(suggestions);
    }
    /**
     * @param {string} key
     * @param {?string=} value
     */
    addItem(key, value) {
        if (!value) {
            return;
        }
        let set = this._valuesMap.get(key);
        if (!set) {
            set = /** @type {!Set<string>} */ (new Set());
            this._valuesMap.set(key, set);
        }
        set.add(value);
    }
    clear() {
        this._valuesMap.clear();
    }
}
//# sourceMappingURL=FilterSuggestionBuilder.js.map