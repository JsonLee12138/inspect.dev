// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import { RowType } from './ChangesView.js'; // eslint-disable-line no-unused-vars
/**
 * @param {!Object} config
 * @param {{diffRows: !Array<!Row>, baselineLines: !Array<string>, currentLines: !Array<string>, mimeType: string}} parserConfig
 * @return {{
 *  startState: function():!DiffState,
 *  token: function(!CodeMirror.StringStream, !DiffState):string,
 *  blankLine: function(!DiffState):string,
 *  copyState: function(!DiffState):DiffState
 * }}
 */
export function ChangesHighlighter(config, parserConfig) {
    const diffRows = parserConfig.diffRows;
    const baselineLines = parserConfig.baselineLines;
    const currentLines = parserConfig.currentLines;
    const syntaxHighlightMode = CodeMirror.getMode({}, parserConfig.mimeType);
    /**
     * @param {!DiffState} state
     * @param {number} baselineLineNumber
     * @param {number} currentLineNumber
     */
    function fastForward(state, baselineLineNumber, currentLineNumber) {
        if (baselineLineNumber > state.baselineLineNumber) {
            fastForwardSyntaxHighlighter(state.baselineSyntaxState, state.baselineLineNumber, baselineLineNumber, baselineLines);
            state.baselineLineNumber = baselineLineNumber;
        }
        if (currentLineNumber > state.currentLineNumber) {
            fastForwardSyntaxHighlighter(state.currentSyntaxState, state.currentLineNumber, currentLineNumber, currentLines);
            state.currentLineNumber = currentLineNumber;
        }
    }
    /**
     * @param {!Object} syntaxState
     * @param {number} from
     * @param {number} to
     * @param {!Array<string>} lines
     */
    function fastForwardSyntaxHighlighter(syntaxState, from, to, lines) {
        let lineNumber = from;
        while (lineNumber < to && lineNumber < lines.length) {
            const stream = new CodeMirror.StringStream(lines[lineNumber]);
            if (stream.eol() && syntaxHighlightMode.blankLine) {
                syntaxHighlightMode.blankLine(syntaxState);
            }
            while (!stream.eol()) {
                if (syntaxHighlightMode.token) {
                    syntaxHighlightMode.token(stream, syntaxState);
                }
                stream.start = stream.pos;
            }
            lineNumber++;
        }
    }
    return {
        /**
         * @return {!DiffState}
         */
        startState: function () {
            return {
                rowNumber: 0,
                diffTokenIndex: 0,
                currentLineNumber: 0,
                baselineLineNumber: 0,
                currentSyntaxState: CodeMirror.startState(syntaxHighlightMode),
                baselineSyntaxState: CodeMirror.startState(syntaxHighlightMode),
                syntaxPosition: 0,
                diffPosition: 0,
                syntaxStyle: '',
                diffStyle: ''
            };
        },
        /**
         * @param {!CodeMirror.StringStream} stream
         * @param {!DiffState} state
         * @return {string}
         */
        token: function (stream, state) {
            const diffRow = diffRows[state.rowNumber];
            if (!diffRow) {
                // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
                stream.next();
                return '';
            }
            fastForward(state, diffRow.baselineLineNumber - 1, diffRow.currentLineNumber - 1);
            let classes = '';
            // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
            if (stream.pos === 0) {
                classes += ' line-background-' + diffRow.type + ' line-' + diffRow.type;
            }
            const syntaxHighlighterNeedsRefresh = state.diffPosition >= state.syntaxPosition;
            if (state.diffPosition <= state.syntaxPosition) {
                state.diffPosition += diffRow.tokens[state.diffTokenIndex].text.length;
                state.diffStyle = diffRow.tokens[state.diffTokenIndex].className;
                state.diffTokenIndex++;
            }
            if (syntaxHighlighterNeedsRefresh) {
                if (syntaxHighlightMode.token &&
                    (diffRow.type === RowType.Deletion || diffRow.type === RowType.Addition ||
                        diffRow.type === RowType.Equal)) {
                    state.syntaxStyle =
                        syntaxHighlightMode.token(
                        // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
                        stream, diffRow.type === RowType.Deletion ? state.baselineSyntaxState : state.currentSyntaxState) ||
                            '';
                    // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
                    state.syntaxPosition = stream.pos;
                }
                else {
                    state.syntaxStyle = '';
                    state.syntaxPosition = Infinity;
                }
            }
            // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
            stream.pos = Math.min(state.syntaxPosition, state.diffPosition);
            classes += ' ' + state.syntaxStyle;
            classes += ' ' + state.diffStyle;
            // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
            if (stream.eol()) {
                state.rowNumber++;
                if (diffRow.type === RowType.Deletion) {
                    state.baselineLineNumber++;
                }
                else {
                    state.currentLineNumber++;
                }
                state.diffPosition = 0;
                state.syntaxPosition = 0;
                state.diffTokenIndex = 0;
            }
            return classes;
        },
        /**
         * @param {!DiffState} state
         * @return {string}
         */
        blankLine: function (state) {
            const diffRow = diffRows[state.rowNumber];
            state.rowNumber++;
            state.syntaxPosition = 0;
            state.diffPosition = 0;
            state.diffTokenIndex = 0;
            if (!diffRow) {
                return '';
            }
            let style = '';
            if (syntaxHighlightMode.blankLine) {
                if (diffRow.type === RowType.Equal || diffRow.type === RowType.Addition) {
                    // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
                    style = syntaxHighlightMode.blankLine(state.currentSyntaxState);
                    state.currentLineNumber++;
                }
                else if (diffRow.type === RowType.Deletion) {
                    // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
                    style = syntaxHighlightMode.blankLine(state.baselineSyntaxState);
                    state.baselineLineNumber++;
                }
            }
            return style + ' line-background-' + diffRow.type + ' line-' + diffRow.type;
        },
        /**
         * @param {!DiffState} state
         * @return {!DiffState}
         */
        copyState: function (state) {
            const newState = Object.assign({}, state);
            // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
            newState.currentSyntaxState = CodeMirror.copyState(syntaxHighlightMode, state.currentSyntaxState);
            // @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
            newState.baselineSyntaxState = CodeMirror.copyState(syntaxHighlightMode, state.baselineSyntaxState);
            return /** @type {!DiffState} */ (newState);
        }
    };
}
// @ts-ignore TODO(crbug.com/1011811): Fix after upstream CodeMirror type fixes
CodeMirror.defineMode('devtools-diff', ChangesHighlighter);
/**
 * @typedef {!{
 *  rowNumber: number,
 *  diffTokenIndex: number,
 *  currentLineNumber: number,
 *  baselineLineNumber: number,
 *  currentSyntaxState: !Object,
 *  baselineSyntaxState: !Object,
 *  syntaxPosition: number,
 *  diffPosition: number,
 *  syntaxStyle: string,
 *  diffStyle: string
 * }}
 */
// @ts-ignore typedef
export let DiffState;
//# sourceMappingURL=ChangesHighlighter.js.map