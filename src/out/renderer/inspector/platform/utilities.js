/*
 * Copyright (C) 2007 Apple Inc.  All rights reserved.
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
/* The long term goal here is to remove all functions in this file and
 * replace them with ES Module functions rather than prototype
 * extensions but in the mean time if an old func in here depends on one
 * that has been migrated, it will need to be imported.
 */
import { inverse } from './map-utilities.js';
import { caseInsensetiveComparator, escapeCharacters, regexSpecialCharacters, sprintf } from './string-utilities.js';
// Still used in the test runners that can't use ES modules :(
String.sprintf = sprintf;
// @ts-ignore https://crbug.com/1050549
String.regexSpecialCharacters = regexSpecialCharacters;
// @ts-ignore https://crbug.com/1050549
String.caseInsensetiveComparator = caseInsensetiveComparator;
/**
 * @this {string}
 * @return {string}
 */
String.prototype.escapeForRegExp = function () {
    return escapeCharacters(this, regexSpecialCharacters());
};
/**
 * @param {number} maxLength
 * @return {string}
 */
String.prototype.trimMiddle = function (maxLength) {
    if (this.length <= maxLength) {
        return String(this);
    }
    let leftHalf = maxLength >> 1;
    let rightHalf = maxLength - leftHalf - 1;
    if ( /** @type {number} */(this.codePointAt(this.length - rightHalf - 1)) >= 0x10000) {
        --rightHalf;
        ++leftHalf;
    }
    if (leftHalf > 0 && /** @type {number} */ (this.codePointAt(leftHalf - 1)) >= 0x10000) {
        --leftHalf;
    }
    return this.substr(0, leftHalf) + '…' + this.substr(this.length - rightHalf, rightHalf);
};
/**
 * @param {number} maxLength
 * @return {string}
 */
String.prototype.trimEndWithMaxLength = function (maxLength) {
    if (this.length <= maxLength) {
        return String(this);
    }
    return this.substr(0, maxLength - 1) + '…';
};
/**
 * @param {string} other
 * @return {number}
 */
String.prototype.compareTo = function (other) {
    if (this > other) {
        return 1;
    }
    if (this < other) {
        return -1;
    }
    return 0;
};
/**
 * @param {string|undefined} string
 * @return {number}
 */
String.hashCode = function (string) {
    if (!string) {
        return 0;
    }
    // Hash algorithm for substrings is described in "Über die Komplexität der Multiplikation in
    // eingeschränkten Branchingprogrammmodellen" by Woelfe.
    // http://opendatastructures.org/versions/edition-0.1d/ods-java/node33.html#SECTION00832000000000000000
    const p = ((1 << 30) * 4 - 5); // prime: 2^32 - 5
    const z = 0x5033d967; // 32 bits from random.org
    const z2 = 0x59d2f15d; // random odd 32 bit number
    let s = 0;
    let zi = 1;
    for (let i = 0; i < string.length; i++) {
        const xi = string.charCodeAt(i) * z2;
        s = (s + zi * xi) % p;
        zi = (zi * z) % p;
    }
    s = (s + zi * (p - 1)) % p;
    return Math.abs(s | 0);
};
/**
 * @param {string} a
 * @param {string} b
 * @return {number}
 */
String.naturalOrderComparator = function (a, b) {
    const chunk = /^\d+|^\D+/;
    let chunka, chunkb, anum, bnum;
    while (true) {
        if (a) {
            if (!b) {
                return 1;
            }
        }
        else {
            if (b) {
                return -1;
            }
            return 0;
        }
        chunka = /** @type {!Array<string>} */ (a.match(chunk))[0];
        chunkb = /** @type {!Array<string>} */ (b.match(chunk))[0];
        anum = !Number.isNaN(Number(chunka));
        bnum = !Number.isNaN(Number(chunkb));
        if (anum && !bnum) {
            return -1;
        }
        if (bnum && !anum) {
            return 1;
        }
        if (anum && bnum) {
            const diff = Number(chunka) - Number(chunkb);
            if (diff) {
                return diff;
            }
            if (chunka.length !== chunkb.length) {
                if (!Number(chunka) && !Number(chunkb)) { // chunks are strings of all 0s (special case)
                    return chunka.length - chunkb.length;
                }
                return chunkb.length - chunka.length;
            }
        }
        else if (chunka !== chunkb) {
            return (chunka < chunkb) ? -1 : 1;
        }
        a = a.substring(chunka.length);
        b = b.substring(chunkb.length);
    }
};
/**
 * @param {string} value
 * @return {string}
 */
Number.toFixedIfFloating = function (value) {
    if (!value || Number.isNaN(Number(value))) {
        return value;
    }
    const number = Number(value);
    return number % 1 ? number.toFixed(3) : String(number);
};
/**
 * @param {!Array<number>} array
 * @param {function(number, number): number} comparator
 * @param {number} left
 * @param {number} right
 * @param {number} pivotIndex
 * @return {number}
 */
const partition = (array, comparator, left, right, pivotIndex) => {
    /**
     * @param {!Array<number>} array
     * @param {number} i1
     * @param {number} i2
     */
    function swap(array, i1, i2) {
        const temp = array[i1];
        array[i1] = array[i2];
        array[i2] = temp;
    }
    const pivotValue = array[pivotIndex];
    swap(array, right, pivotIndex);
    let storeIndex = left;
    for (let i = left; i < right; ++i) {
        if (comparator(array[i], pivotValue) < 0) {
            swap(array, storeIndex, i);
            ++storeIndex;
        }
    }
    swap(array, right, storeIndex);
    return storeIndex;
};
(function () {
    const sortRange = {
        /**
           * @param {function(number, number): number} comparator
           * @param {number} leftBound
           * @param {number} rightBound
           * @param {number} sortWindowLeft
           * @param {number} sortWindowRight
           * @return {!Array.<number>}
           * @this {Array.<number>}
           */
        value: function (comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight) {
            /**
             * @param {!Array<number>} array
             * @param {function(number, number): number} comparator
             * @param {number} left
             * @param {number} right
             * @param {number} sortWindowLeft
             * @param {number} sortWindowRight
             */
            function quickSortRange(array, comparator, left, right, sortWindowLeft, sortWindowRight) {
                if (right <= left) {
                    return;
                }
                const pivotIndex = Math.floor(Math.random() * (right - left)) + left;
                const pivotNewIndex = partition(array, comparator, left, right, pivotIndex);
                if (sortWindowLeft < pivotNewIndex) {
                    quickSortRange(array, comparator, left, pivotNewIndex - 1, sortWindowLeft, sortWindowRight);
                }
                if (pivotNewIndex < sortWindowRight) {
                    quickSortRange(array, comparator, pivotNewIndex + 1, right, sortWindowLeft, sortWindowRight);
                }
            }
            if (leftBound === 0 && rightBound === (this.length - 1) && sortWindowLeft === 0 && sortWindowRight >= rightBound) {
                this.sort(comparator);
            }
            else {
                quickSortRange(this, comparator, leftBound, rightBound, sortWindowLeft, sortWindowRight);
            }
            return this;
        },
        configurable: true,
    };
    Object.defineProperty(Array.prototype, 'sortRange', sortRange);
    Object.defineProperty(Uint32Array.prototype, 'sortRange', sortRange);
})();
Object.defineProperty(Array.prototype, 'lowerBound', {
    /**
     * Return index of the leftmost element that is equal or greater
     * than the specimen object. If there's no such element (i.e. all
     * elements are smaller than the specimen) returns right bound.
     * The function works for sorted array.
     * When specified, |left| (inclusive) and |right| (exclusive) indices
     * define the search window.
     *
     * @param {!T} object
     * @param {function(!T,!S):number} comparator
     * @param {number=} left
     * @param {number=} right
     * @return {number}
     * @this {Array.<!S>}
     * @template T,S
     */
    value: function (object, comparator, left, right) {
        /**
         * @param {string|number} a
         * @param {string|number} b
         */
        function defaultComparator(a, b) {
            return a < b ? -1 : (a > b ? 1 : 0);
        }
        comparator = comparator || defaultComparator;
        let l = left || 0;
        let r = right !== undefined ? right : this.length;
        while (l < r) {
            const m = (l + r) >> 1;
            if (comparator(object, this[m]) > 0) {
                l = m + 1;
            }
            else {
                r = m;
            }
        }
        return r;
    },
    configurable: true
});
Object.defineProperty(Array.prototype, 'upperBound', {
    /**
     * Return index of the leftmost element that is greater
     * than the specimen object. If there's no such element (i.e. all
     * elements are smaller or equal to the specimen) returns right bound.
     * The function works for sorted array.
     * When specified, |left| (inclusive) and |right| (exclusive) indices
     * define the search window.
     *
     * @param {!T} object
     * @param {function(!T,!S):number} comparator
     * @param {number=} left
     * @param {number=} right
     * @return {number}
     * @this {Array.<!S>}
     * @template T,S
     */
    value: function (object, comparator, left, right) {
        /**
         * @param {string|number} a
         * @param {string|number} b
         */
        function defaultComparator(a, b) {
            return a < b ? -1 : (a > b ? 1 : 0);
        }
        comparator = comparator || defaultComparator;
        let l = left || 0;
        let r = right !== undefined ? right : this.length;
        while (l < r) {
            const m = (l + r) >> 1;
            if (comparator(object, this[m]) >= 0) {
                l = m + 1;
            }
            else {
                r = m;
            }
        }
        return r;
    },
    configurable: true
});
Object.defineProperty(Uint32Array.prototype, 'lowerBound', { value: Array.prototype.lowerBound, configurable: true });
Object.defineProperty(Uint32Array.prototype, 'upperBound', { value: Array.prototype.upperBound, configurable: true });
Object.defineProperty(Int32Array.prototype, 'lowerBound', { value: Array.prototype.lowerBound, configurable: true });
Object.defineProperty(Int32Array.prototype, 'upperBound', { value: Array.prototype.upperBound, configurable: true });
Object.defineProperty(Float64Array.prototype, 'lowerBound', { value: Array.prototype.lowerBound, configurable: true });
Object.defineProperty(Array.prototype, 'binaryIndexOf', {
    /**
     * @param {!T} value
     * @param {function(!T,!S):number} comparator
     * @return {number}
     * @this {Array.<!S>}
     * @template T,S
     */
    value: function (value, comparator) {
        const index = this.lowerBound(value, comparator);
        return index < this.length && comparator(value, this[index]) === 0 ? index : -1;
    },
    configurable: true
});
Object.defineProperty(Array.prototype, 'peekLast', {
    /**
     * @return {!T|undefined}
     * @this {Array.<!T>}
     * @template T
     */
    value: function () {
        return this[this.length - 1];
    },
    configurable: true
});
(function () {
    /**
     * @param {!Array.<T>} array1
     * @param {!Array.<T>} array2
     * @param {function(T,T):number} comparator
     * @param {boolean} mergeNotIntersect
     * @return {!Array.<T>}
     * @template T
     */
    function mergeOrIntersect(array1, array2, comparator, mergeNotIntersect) {
        const result = [];
        let i = 0;
        let j = 0;
        while (i < array1.length && j < array2.length) {
            const compareValue = comparator(array1[i], array2[j]);
            if (mergeNotIntersect || !compareValue) {
                result.push(compareValue <= 0 ? array1[i] : array2[j]);
            }
            if (compareValue <= 0) {
                i++;
            }
            if (compareValue >= 0) {
                j++;
            }
        }
        if (mergeNotIntersect) {
            while (i < array1.length) {
                result.push(array1[i++]);
            }
            while (j < array2.length) {
                result.push(array2[j++]);
            }
        }
        return result;
    }
    Object.defineProperty(Array.prototype, 'intersectOrdered', {
        /**
         * @param {!Array.<T>} array
         * @param {function(T,T):number} comparator
         * @return {!Array.<T>}
         * @this {!Array.<T>}
         * @template T
         */
        value: function (array, comparator) {
            return mergeOrIntersect(this, array, comparator, false);
        },
        configurable: true
    });
    Object.defineProperty(Array.prototype, 'mergeOrdered', {
        /**
         * @param {!Array.<T>} array
         * @param {function(T,T):number} comparator
         * @return {!Array.<T>}
         * @this {!Array.<T>}
         * @template T
         */
        value: function (array, comparator) {
            return mergeOrIntersect(this, array, comparator, true);
        },
        configurable: true
    });
})();
/**
 * @param {string} query
 * @param {string=} flags
 * @return {!RegExp}
 */
self.createPlainTextSearchRegex = function (query, flags) {
    // This should be kept the same as the one in StringUtil.cpp.
    let regex = '';
    for (let i = 0; i < query.length; ++i) {
        const c = query.charAt(i);
        if (regexSpecialCharacters().indexOf(c) !== -1) {
            regex += '\\';
        }
        regex += c;
    }
    return new RegExp(regex, flags || '');
};
/**
 * @return {?T}
 * @template T
 */
// @ts-ignore https://crbug.com/1050549
Set.prototype.firstValue = function () {
    if (!this.size) {
        return null;
    }
    return this.values().next().value;
};
/**
 * @return {!Multimap<K,V>}
 * @template K,V
 */
// @ts-ignore https://crbug.com/1050549
Map.prototype.inverse = function () {
    return inverse(this);
};
/**
 * @template K, V
 */
export class Multimap {
    constructor() {
        /** @type {!Map.<K, !Set.<!V>>} */
        this._map = new Map();
    }
    /**
     * @param {K} key
     * @param {V} value
     */
    set(key, value) {
        let set = this._map.get(key);
        if (!set) {
            set = new Set();
            this._map.set(key, set);
        }
        set.add(value);
    }
    /**
     * @param {K} key
     * @return {!Set<!V>}
     */
    get(key) {
        return this._map.get(key) || new Set();
    }
    /**
     * @param {K} key
     * @return {boolean}
     */
    has(key) {
        return this._map.has(key);
    }
    /**
     * @param {K} key
     * @param {V} value
     * @return {boolean}
     */
    hasValue(key, value) {
        const set = this._map.get(key);
        if (!set) {
            return false;
        }
        return set.has(value);
    }
    /**
     * @return {number}
     */
    get size() {
        return this._map.size;
    }
    /**
     * @param {K} key
     * @param {V} value
     * @return {boolean}
     */
    delete(key, value) {
        const values = this.get(key);
        if (!values) {
            return false;
        }
        const result = values.delete(value);
        if (!values.size) {
            this._map.delete(key);
        }
        return result;
    }
    /**
     * @param {K} key
     */
    deleteAll(key) {
        this._map.delete(key);
    }
    /**
     * @return {!Array.<K>}
     */
    keysArray() {
        return [...this._map.keys()];
    }
    /**
     * @return {!Array.<!V>}
     */
    valuesArray() {
        const result = [];
        for (const set of this._map.values()) {
            result.push(...set.values());
        }
        return result;
    }
    clear() {
        this._map.clear();
    }
}
/**
 * @param {function():void} callback
 */
export function runOnWindowLoad(callback) {
    function windowLoaded() {
        window.removeEventListener('DOMContentLoaded', windowLoaded, false);
        callback();
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        callback();
    }
    else {
        window.addEventListener('DOMContentLoaded', windowLoaded, false);
    }
}
/**
 * @param {never} type
 * @param {string} message
 * @return {never}
 */
export function assertNever(type, message) {
    throw new Error(message);
}
const _singletonSymbol = Symbol('singleton');
/**
 * @template T
 * @param {function(new:T)} constructorFunction
 * @return {!T}
 */
// @ts-ignore https://crbug.com/1050549
self.singleton = function (constructorFunction) {
    if (_singletonSymbol in constructorFunction) {
        // @ts-ignore We literally just confirmed this exists.
        return constructorFunction[_singletonSymbol];
    }
    // @ts-ignore https://crbug.com/1050549
    const instance = new constructorFunction();
    // @ts-ignore https://crbug.com/1050549
    constructorFunction[_singletonSymbol] = instance;
    return instance;
};
/**
 * @param {?string} content
 * @return {number}
 */
self.base64ToSize = function (content) {
    if (!content) {
        return 0;
    }
    let size = content.length * 3 / 4;
    if (content[content.length - 1] === '=') {
        size--;
    }
    if (content.length > 1 && content[content.length - 2] === '=') {
        size--;
    }
    return size;
};
/**
 * @param {string} input
 * @return {string}
 */
// @ts-ignore https://crbug.com/1050549
self.unescapeCssString = function (input) {
    // https://drafts.csswg.org/css-syntax/#consume-escaped-code-point
    const reCssEscapeSequence = /(?<!\\)\\(?:([a-fA-F0-9]{1,6})|(.))[\n\t\x20]?/gs;
    return input.replace(reCssEscapeSequence, (_, $1, $2) => {
        if ($2) { // Handle the single-character escape sequence.
            return $2;
        }
        // Otherwise, handle the code point escape sequence.
        const codePoint = parseInt($1, 16);
        const isSurrogate = 0xD800 <= codePoint && codePoint <= 0xDFFF;
        if (isSurrogate || codePoint === 0x0000 || codePoint > 0x10FFFF) {
            return '\uFFFD';
        }
        return String.fromCodePoint(codePoint);
    });
};
// @ts-ignore
self.Platform = self.Platform || {};
// @ts-ignore
Platform = Platform || {};
/** @constructor */
Platform.Multimap = Multimap;
//# sourceMappingURL=utilities.js.map