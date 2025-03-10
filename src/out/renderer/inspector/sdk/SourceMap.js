/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
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
import * as Common from '../common/common.js';
import * as TextUtils from '../text_utils/text_utils.js';
import { CompilerSourceMappingContentProvider } from './CompilerSourceMappingContentProvider.js';
import { PageResourceLoader } from './PageResourceLoader.js'; // eslint-disable-line no-unused-vars
/**
 * @interface
 */
export class SourceMap {
    /**
     * @return {string}
     */
    compiledURL() {
        throw new Error('Not implemented');
    }
    /**
     * @return {string}
     */
    url() {
        throw new Error('Not implemented');
    }
    /**
     * @return {!Array<string>}
     */
    sourceURLs() {
        throw new Error('Not implemented');
    }
    /**
     * @param {string} sourceURL
     * @param {!Common.ResourceType.ResourceType} contentType
     * @return {!TextUtils.ContentProvider.ContentProvider}
     */
    sourceContentProvider(sourceURL, contentType) {
        throw new Error('Not implemented');
    }
    /**
     * @param {string} sourceURL
     * @return {?string}
     */
    embeddedContentByURL(sourceURL) {
        throw new Error('Not implemented');
    }
    /**
     * @param {number} lineNumber in compiled resource
     * @param {number} columnNumber in compiled resource
     * @return {?SourceMapEntry}
     */
    findEntry(lineNumber, columnNumber) {
        throw new Error('Not implemented');
    }
    /**
     * @param {string} sourceURL
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?SourceMapEntry}
     */
    sourceLineMapping(sourceURL, lineNumber, columnNumber) {
        throw new Error('Not implemented');
    }
    /**
     * @return {!Array<!SourceMapEntry>}
     */
    mappings() {
        throw new Error('Not implemented');
    }
}
// eslint-disable-next-line no-unused-vars
class SourceMapV3 {
    constructor() {
        /** @type {number} */ this.version;
        /** @type {string|undefined} */ this.file;
        /** @type {!Array.<string>} */ this.sources;
        /** @type {!Array.<!Section>|undefined} */ this.sections;
        /** @type {string} */ this.mappings;
        /** @type {string|undefined} */ this.sourceRoot;
        /** @type {!Array.<string>|undefined} */ this.names;
        /** @type {string|undefined} */ this.sourcesContent;
    }
}
// eslint-disable-next-line no-unused-vars
class Section {
    constructor() {
        /** @type {!SourceMapV3} */ this.map;
        /** @type {!Offset} */ this.offset;
        /** @type {string|undefined} */ this.url;
    }
}
// eslint-disable-next-line no-unused-vars
class Offset {
    constructor() {
        /** @type {number} */ this.line;
        /** @type {number} */ this.column;
    }
}
export class SourceMapEntry {
    /**
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @param {string=} sourceURL
     * @param {number=} sourceLineNumber
     * @param {number=} sourceColumnNumber
     * @param {string=} name
     */
    constructor(lineNumber, columnNumber, sourceURL, sourceLineNumber, sourceColumnNumber, name) {
        this.lineNumber = lineNumber;
        this.columnNumber = columnNumber;
        this.sourceURL = sourceURL;
        // These two type-casts are wrong. However, when you try to fix them,
        // a lot of comparator functions defined below start to produce incorrect
        // behavior. Instead of trying to fix this, we should cast away and
        // pretend that everything is all right.
        this.sourceLineNumber = /** @type {number} */ (sourceLineNumber);
        this.sourceColumnNumber = /** @type {number} */ (sourceColumnNumber);
        this.name = name;
    }
    /**
     * @param {!SourceMapEntry} entry1
     * @param {!SourceMapEntry} entry2
     * @return {number}
     */
    static compare(entry1, entry2) {
        if (entry1.lineNumber !== entry2.lineNumber) {
            return entry1.lineNumber - entry2.lineNumber;
        }
        return entry1.columnNumber - entry2.columnNumber;
    }
}
export class EditResult {
    /**
     * @param {!SourceMap} map
     * @param {!Array<!TextUtils.TextRange.SourceEdit>} compiledEdits
     * @param {!Map<string, string>} newSources
     */
    constructor(map, compiledEdits, newSources) {
        this.map = map;
        this.compiledEdits = compiledEdits;
        this.newSources = newSources;
    }
}
const base64Digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
/** @type {!Map<string, number>} */
const base64Map = new Map();
for (let i = 0; i < base64Digits.length; ++i) {
    base64Map.set(base64Digits.charAt(i), i);
}
/** @type {!WeakMap<!SourceMapV3, !Array<string>>} */
const sourceMapToSourceList = new WeakMap();
/**
 * @implements {SourceMap}
 */
export class TextSourceMap {
    /**
     * Implements Source Map V3 model. See https://github.com/google/closure-compiler/wiki/Source-Maps
     * for format description.
     * @param {string} compiledURL
     * @param {string} sourceMappingURL
     * @param {!SourceMapV3} payload
     * @param {!PageResourceLoadInitiator} initiator
     */
    constructor(compiledURL, sourceMappingURL, payload, initiator) {
        this._initiator = initiator;
        /** @type {?SourceMapV3} */
        this._json = payload;
        this._compiledURL = compiledURL;
        this._sourceMappingURL = sourceMappingURL;
        this._baseURL = sourceMappingURL.startsWith('data:') ? compiledURL : sourceMappingURL;
        /** @type {?Array<!SourceMapEntry>} */
        this._mappings = null;
        /** @type {!Map<string, !TextSourceMap.SourceInfo>} */
        this._sourceInfos = new Map();
        if (this._json.sections) {
            const sectionWithURL = Boolean(this._json.sections.find(section => Boolean(section.url)));
            if (sectionWithURL) {
                Common.Console.Console.instance().warn(`SourceMap "${sourceMappingURL}" contains unsupported "URL" field in one of its sections.`);
            }
        }
        this._eachSection(this._parseSources.bind(this));
    }
    /**
     * @param {string} sourceMapURL
     * @param {string} compiledURL
     * @param {!PageResourceLoadInitiator} initiator
     * @return {!Promise<!TextSourceMap>}
     * @throws {!Error}
     * @this {TextSourceMap}
     */
    static async load(sourceMapURL, compiledURL, initiator) {
        let updatedContent;
        try {
            const { content } = await PageResourceLoader.instance().loadResource(sourceMapURL, initiator);
            updatedContent = content;
            if (content.slice(0, 3) === ')]}') {
                updatedContent = content.substring(content.indexOf('\n'));
            }
        }
        catch (error) {
            throw new Error(ls `Could not load content for ${sourceMapURL}: ${error.message}`);
        }
        try {
            const payload = /** @type {!SourceMapV3} */ (JSON.parse(updatedContent));
            return new TextSourceMap(compiledURL, sourceMapURL, payload, initiator);
        }
        catch (error) {
            throw new Error(ls `Could not parse content for ${sourceMapURL}: ${error.message}`);
        }
    }
    /**
     * @override
     * @return {string}
     */
    compiledURL() {
        return this._compiledURL;
    }
    /**
     * @override
     * @return {string}
     */
    url() {
        return this._sourceMappingURL;
    }
    /**
     * @override
     * @return {!Array.<string>}
     */
    sourceURLs() {
        return [...this._sourceInfos.keys()];
    }
    /**
     * @override
     * @param {string} sourceURL
     * @param {!Common.ResourceType.ResourceType} contentType
     * @return {!TextUtils.ContentProvider.ContentProvider}
     */
    sourceContentProvider(sourceURL, contentType) {
        const info = this._sourceInfos.get(sourceURL);
        if (info && info.content) {
            return TextUtils.StaticContentProvider.StaticContentProvider.fromString(sourceURL, contentType, info.content);
        }
        return new CompilerSourceMappingContentProvider(sourceURL, contentType, this._initiator);
    }
    /**
     * @override
     * @param {string} sourceURL
     * @return {?string}
     */
    embeddedContentByURL(sourceURL) {
        const entry = this._sourceInfos.get(sourceURL);
        if (!entry) {
            return null;
        }
        return entry.content;
    }
    /**
     * @override
     * @param {number} lineNumber in compiled resource
     * @param {number} columnNumber in compiled resource
     * @return {?SourceMapEntry}
     */
    findEntry(lineNumber, columnNumber) {
        const mappings = this.mappings();
        const index = mappings.upperBound(undefined, (unused, entry) => lineNumber - entry.lineNumber || columnNumber - entry.columnNumber);
        return index ? mappings[index - 1] : null;
    }
    /**
     * @override
     * @param {string} sourceURL
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {?SourceMapEntry}
     */
    sourceLineMapping(sourceURL, lineNumber, columnNumber) {
        const mappings = this._reversedMappings(sourceURL);
        const first = mappings.lowerBound(lineNumber, lineComparator);
        const last = mappings.upperBound(lineNumber, lineComparator);
        if (first >= mappings.length || mappings[first].sourceLineNumber !== lineNumber) {
            return null;
        }
        const columnMappings = mappings.slice(first, last);
        if (!columnMappings.length) {
            return null;
        }
        const index = columnMappings.lowerBound(columnNumber, (columnNumber, mapping) => columnNumber - mapping.sourceColumnNumber);
        return index >= columnMappings.length ? columnMappings[columnMappings.length - 1] : columnMappings[index];
        /**
         * @param {number} lineNumber
         * @param {!SourceMapEntry} mapping
         * @return {number}
         */
        function lineComparator(lineNumber, mapping) {
            return lineNumber - mapping.sourceLineNumber;
        }
    }
    /**
     * @param {string} sourceURL
     * @param {number} lineNumber
     * @param {number} columnNumber
     * @return {!Array<!SourceMapEntry>}
     */
    findReverseEntries(sourceURL, lineNumber, columnNumber) {
        const mappings = this._reversedMappings(sourceURL);
        const endIndex = mappings.upperBound(undefined, (unused, entry) => lineNumber - entry.sourceLineNumber || columnNumber - entry.sourceColumnNumber);
        let startIndex = endIndex;
        while (startIndex > 0 && mappings[startIndex - 1].sourceLineNumber === mappings[endIndex - 1].sourceLineNumber &&
            mappings[startIndex - 1].sourceColumnNumber === mappings[endIndex - 1].sourceColumnNumber) {
            --startIndex;
        }
        return mappings.slice(startIndex, endIndex);
    }
    /**
     * @override
     * @return {!Array<!SourceMapEntry>}
     */
    mappings() {
        if (this._mappings === null) {
            this._mappings = [];
            this._eachSection(this._parseMap.bind(this));
            this._json = null;
        }
        return /** @type {!Array<!SourceMapEntry>} */ (this._mappings);
    }
    /**
     * @param {string} sourceURL
     * @return {!Array.<!SourceMapEntry>}
     */
    _reversedMappings(sourceURL) {
        const info = this._sourceInfos.get(sourceURL);
        if (!info) {
            return [];
        }
        const mappings = this.mappings();
        if (info.reverseMappings === null) {
            info.reverseMappings = mappings.filter(mapping => mapping.sourceURL === sourceURL).sort(sourceMappingComparator);
        }
        return info.reverseMappings;
        /**
         * @param {!SourceMapEntry} a
         * @param {!SourceMapEntry} b
         * @return {number}
         */
        function sourceMappingComparator(a, b) {
            if (a.sourceLineNumber !== b.sourceLineNumber) {
                return a.sourceLineNumber - b.sourceLineNumber;
            }
            if (a.sourceColumnNumber !== b.sourceColumnNumber) {
                return a.sourceColumnNumber - b.sourceColumnNumber;
            }
            if (a.lineNumber !== b.lineNumber) {
                return a.lineNumber - b.lineNumber;
            }
            return a.columnNumber - b.columnNumber;
        }
    }
    /**
     * @param {function(!SourceMapV3, number, number):void} callback
     */
    _eachSection(callback) {
        if (!this._json) {
            return;
        }
        if (!this._json.sections) {
            callback(this._json, 0, 0);
            return;
        }
        for (const section of this._json.sections) {
            callback(section.map, section.offset.line, section.offset.column);
        }
    }
    /**
     * @param {!SourceMapV3} sourceMap
     */
    _parseSources(sourceMap) {
        const sourcesList = [];
        let sourceRoot = sourceMap.sourceRoot || '';
        if (sourceRoot && !sourceRoot.endsWith('/')) {
            sourceRoot += '/';
        }
        for (let i = 0; i < sourceMap.sources.length; ++i) {
            const href = sourceRoot + sourceMap.sources[i];
            let url = Common.ParsedURL.ParsedURL.completeURL(this._baseURL, href) || href;
            const source = sourceMap.sourcesContent && sourceMap.sourcesContent[i];
            if (url === this._compiledURL && source) {
                url += Common.UIString.UIString('? [sm]');
            }
            this._sourceInfos.set(url, new TextSourceMap.SourceInfo(source || null, null));
            sourcesList.push(url);
        }
        sourceMapToSourceList.set(sourceMap, sourcesList);
    }
    /**
     * @param {!SourceMapV3} map
     * @param {number} lineNumber
     * @param {number} columnNumber
     */
    _parseMap(map, lineNumber, columnNumber) {
        let sourceIndex = 0;
        let sourceLineNumber = 0;
        let sourceColumnNumber = 0;
        let nameIndex = 0;
        // TODO(crbug.com/1011811): refactor away map.
        // `sources` can be undefined if it wasn't previously
        // processed and added to the list. However, that
        // is not WAI and we should make sure that we can
        // only reach this point when we are certain
        // we have the list available.
        const sources = sourceMapToSourceList.get(map);
        const names = map.names || [];
        const stringCharIterator = new TextSourceMap.StringCharIterator(map.mappings);
        let sourceURL = sources && sources[sourceIndex];
        while (true) {
            if (stringCharIterator.peek() === ',') {
                stringCharIterator.next();
            }
            else {
                while (stringCharIterator.peek() === ';') {
                    lineNumber += 1;
                    columnNumber = 0;
                    stringCharIterator.next();
                }
                if (!stringCharIterator.hasNext()) {
                    break;
                }
            }
            columnNumber += this._decodeVLQ(stringCharIterator);
            if (!stringCharIterator.hasNext() || this._isSeparator(stringCharIterator.peek())) {
                this.mappings().push(new SourceMapEntry(lineNumber, columnNumber));
                continue;
            }
            const sourceIndexDelta = this._decodeVLQ(stringCharIterator);
            if (sourceIndexDelta) {
                sourceIndex += sourceIndexDelta;
                if (sources) {
                    sourceURL = sources[sourceIndex];
                }
            }
            sourceLineNumber += this._decodeVLQ(stringCharIterator);
            sourceColumnNumber += this._decodeVLQ(stringCharIterator);
            if (!stringCharIterator.hasNext() || this._isSeparator(stringCharIterator.peek())) {
                this.mappings().push(new SourceMapEntry(lineNumber, columnNumber, sourceURL, sourceLineNumber, sourceColumnNumber));
                continue;
            }
            nameIndex += this._decodeVLQ(stringCharIterator);
            this.mappings().push(new SourceMapEntry(lineNumber, columnNumber, sourceURL, sourceLineNumber, sourceColumnNumber, names[nameIndex]));
        }
        // As per spec, mappings are not necessarily sorted.
        this.mappings().sort(SourceMapEntry.compare);
    }
    /**
     * @param {string} char
     * @return {boolean}
     */
    _isSeparator(char) {
        return char === ',' || char === ';';
    }
    /**
     * @param {!TextSourceMap.StringCharIterator} stringCharIterator
     * @return {number}
     */
    _decodeVLQ(stringCharIterator) {
        // Read unsigned value.
        let result = 0;
        let shift = 0;
        let digit = TextSourceMap._VLQ_CONTINUATION_MASK;
        while (digit & TextSourceMap._VLQ_CONTINUATION_MASK) {
            digit = base64Map.get(stringCharIterator.next()) || 0;
            result += (digit & TextSourceMap._VLQ_BASE_MASK) << shift;
            shift += TextSourceMap._VLQ_BASE_SHIFT;
        }
        // Fix the sign.
        const negative = result & 1;
        result >>= 1;
        return negative ? -result : result;
    }
    /**
     * @param {string} url
     * @param {!TextUtils.TextRange.TextRange} textRange
     * @return {?TextUtils.TextRange.TextRange}
     */
    reverseMapTextRange(url, textRange) {
        /**
         * @param {!{lineNumber: number, columnNumber: number}} position
         * @param {!SourceMapEntry} mapping
         * @return {number}
         */
        function comparator(position, mapping) {
            if (position.lineNumber !== mapping.sourceLineNumber) {
                return position.lineNumber - mapping.sourceLineNumber;
            }
            return position.columnNumber - mapping.sourceColumnNumber;
        }
        const mappings = this._reversedMappings(url);
        if (!mappings.length) {
            return null;
        }
        const startIndex = mappings.lowerBound({ lineNumber: textRange.startLine, columnNumber: textRange.startColumn }, comparator);
        const endIndex = mappings.upperBound({ lineNumber: textRange.endLine, columnNumber: textRange.endColumn }, comparator);
        const startMapping = mappings[startIndex];
        const endMapping = mappings[endIndex];
        return new TextUtils.TextRange.TextRange(startMapping.lineNumber, startMapping.columnNumber, endMapping.lineNumber, endMapping.columnNumber);
    }
}
TextSourceMap._VLQ_BASE_SHIFT = 5;
TextSourceMap._VLQ_BASE_MASK = (1 << 5) - 1;
TextSourceMap._VLQ_CONTINUATION_MASK = 1 << 5;
TextSourceMap.StringCharIterator = class {
    /**
     * @param {string} string
     */
    constructor(string) {
        this._string = string;
        this._position = 0;
    }
    /**
     * @return {string}
     */
    next() {
        return this._string.charAt(this._position++);
    }
    /**
     * @return {string}
     */
    peek() {
        return this._string.charAt(this._position);
    }
    /**
     * @return {boolean}
     */
    hasNext() {
        return this._position < this._string.length;
    }
};
TextSourceMap.SourceInfo = class {
    /**
     * @param {?string} content
     * @param {?Array<!SourceMapEntry>} reverseMappings
     */
    constructor(content, reverseMappings) {
        this.content = content;
        this.reverseMappings = reverseMappings;
    }
};
//# sourceMappingURL=SourceMap.js.map