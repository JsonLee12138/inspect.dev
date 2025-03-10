// Copyright 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Diff from '../diff/diff.js';
import * as i18n from '../i18n/i18n.js';
import * as UI from '../ui/ui.js';
import * as WorkspaceDiff from '../workspace_diff/workspace_diff.js';
import { ChangesSidebar, Events } from './ChangesSidebar.js';
import { ChangesTextEditor } from './ChangesTextEditor.js';
export const UIStrings = {
    /**
    *@description Screen-reader accessible name for the code editor in the Changes tool showing the user's changes.
    */
    changesDiffViewer: 'Changes diff viewer',
    /**
    *@description Screen reader/tooltip label for a button in the Changes tool that reverts all changes to the currently open file.
    */
    revertAllChangesToCurrentFile: 'Revert all changes to current file',
    /**
    *@description Text in Changes View of the Changes tab
    */
    noChanges: 'No changes',
    /**
    *@description Text in Changes View of the Changes tab
    */
    binaryData: 'Binary data',
    /**
    *@description Insertion text in Changes View of the Changes tab
    *@example {1} PH1
    */
    sInsertion: '{PH1} insertion (+),',
    /**
    *@description Insertion text in Changes View of the Changes tab
    *@example {2} PH1
    */
    sInsertions: '{PH1} insertions (+),',
    /**
    *@description Deletion text in Changes View of the Changes tab
    *@example {1} PH1
    */
    sDeletion: '{PH1} deletion (-)',
    /**
    *@description Deletion text in Changes View of the Changes tab
    *@example {2} PH1
    */
    sDeletions: '{PH1} deletions (-)',
    /**
    *@description Text in Changes View of the Changes tab
    *@example {2} PH1
    */
    SkippingDMatchingLines: '( … Skipping {PH1} matching lines … )',
};
const str_ = i18n.i18n.registerUIStrings('changes/ChangesView.js', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/** @type {!ChangesView} */
let changesViewInstance;
export class ChangesView extends UI.Widget.VBox {
    /**
     * @private
     */
    constructor() {
        super(true);
        this.registerRequiredCSS('changes/changesView.css', { enableLegacyPatching: true });
        const splitWidget = new UI.SplitWidget.SplitWidget(true /* vertical */, false /* sidebar on left */);
        const mainWidget = new UI.Widget.Widget();
        splitWidget.setMainWidget(mainWidget);
        splitWidget.show(this.contentElement);
        this._emptyWidget = new UI.EmptyWidget.EmptyWidget('');
        this._emptyWidget.show(mainWidget.element);
        this._workspaceDiff = WorkspaceDiff.WorkspaceDiff.workspaceDiff();
        this._changesSidebar = new ChangesSidebar(this._workspaceDiff);
        this._changesSidebar.addEventListener(Events.SelectedUISourceCodeChanged, this._selectedUISourceCodeChanged, this);
        splitWidget.setSidebarWidget(this._changesSidebar);
        /** @type {?Workspace.UISourceCode.UISourceCode} */
        this._selectedUISourceCode = null;
        /** @type {!Array<!Row>} */
        this._diffRows = [];
        this._maxLineDigits = 1;
        this._editor = new ChangesTextEditor({
            bracketMatchingSetting: undefined,
            devtoolsAccessibleName: i18nString(UIStrings.changesDiffViewer),
            lineNumbers: true,
            lineWrapping: false,
            mimeType: undefined,
            autoHeight: undefined,
            padBottom: undefined,
            maxHighlightLength: Infinity,
            placeholder: undefined,
            lineWiseCopyCut: undefined,
            inputStyle: undefined,
        });
        this._editor.setReadOnly(true);
        const editorContainer = mainWidget.element.createChild('div', 'editor-container');
        UI.ARIAUtils.markAsTabpanel(editorContainer);
        this._editor.show(editorContainer);
        this._editor.hideWidget();
        self.onInvokeElement(this._editor.element, this._click.bind(this));
        this._toolbar = new UI.Toolbar.Toolbar('changes-toolbar', mainWidget.element);
        const revertButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.revertAllChangesToCurrentFile), 'largeicon-undo');
        revertButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this._revert.bind(this));
        this._toolbar.appendToolbarItem(revertButton);
        this._diffStats = new UI.Toolbar.ToolbarText('');
        this._toolbar.appendToolbarItem(this._diffStats);
        this._toolbar.setEnabled(false);
        this._hideDiff(i18nString(UIStrings.noChanges));
        this._selectedUISourceCodeChanged();
    }
    /**
     * @param {{forceNew: ?boolean}} opts
     */
    static instance(opts = { forceNew: null }) {
        const { forceNew } = opts;
        if (!changesViewInstance || forceNew) {
            changesViewInstance = new ChangesView();
        }
        return changesViewInstance;
    }
    _selectedUISourceCodeChanged() {
        this._revealUISourceCode(this._changesSidebar.selectedUISourceCode());
    }
    _revert() {
        const uiSourceCode = this._selectedUISourceCode;
        if (!uiSourceCode) {
            return;
        }
        this._workspaceDiff.revertToOriginal(uiSourceCode);
    }
    /**
     * @param {!Event} event
     */
    _click(event) {
        const selection = this._editor.selection();
        if (!selection.isEmpty() || !this._selectedUISourceCode) {
            return;
        }
        const row = this._diffRows[selection.startLine];
        Common.Revealer.reveal(this._selectedUISourceCode.uiLocation(row.currentLineNumber - 1, selection.startColumn), false);
        event.consume(true);
    }
    /**
     * @param {?Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    _revealUISourceCode(uiSourceCode) {
        if (this._selectedUISourceCode === uiSourceCode) {
            return;
        }
        if (this._selectedUISourceCode) {
            this._workspaceDiff.unsubscribeFromDiffChange(this._selectedUISourceCode, this._refreshDiff, this);
        }
        if (uiSourceCode && this.isShowing()) {
            this._workspaceDiff.subscribeToDiffChange(uiSourceCode, this._refreshDiff, this);
        }
        this._selectedUISourceCode = uiSourceCode;
        this._refreshDiff();
    }
    /**
     * @override
     */
    wasShown() {
        this._refreshDiff();
    }
    _refreshDiff() {
        if (!this.isShowing()) {
            return;
        }
        if (!this._selectedUISourceCode) {
            this._renderDiffRows(null);
            return;
        }
        const uiSourceCode = this._selectedUISourceCode;
        if (!uiSourceCode.contentType().isTextType()) {
            this._hideDiff(i18nString(UIStrings.binaryData));
            return;
        }
        this._workspaceDiff.requestDiff(uiSourceCode).then(diff => {
            if (this._selectedUISourceCode !== uiSourceCode) {
                return;
            }
            this._renderDiffRows(diff);
        });
    }
    /**
     * @param {string} message
     */
    _hideDiff(message) {
        this._diffStats.setText('');
        this._toolbar.setEnabled(false);
        this._editor.hideWidget();
        this._emptyWidget.text = message;
        this._emptyWidget.showWidget();
    }
    /**
     * @param {?Diff.Diff.DiffArray} diff
     */
    _renderDiffRows(diff) {
        this._diffRows = [];
        if (!diff || (diff.length === 1 && diff[0][0] === Diff.Diff.Operation.Equal)) {
            this._hideDiff(i18nString(UIStrings.noChanges));
            return;
        }
        let insertions = 0;
        let deletions = 0;
        let currentLineNumber = 0;
        let baselineLineNumber = 0;
        const paddingLines = 3;
        /** @type {!Array<string>} */
        const originalLines = [];
        /** @type {!Array<string>} */
        const currentLines = [];
        for (let i = 0; i < diff.length; ++i) {
            const token = diff[i];
            switch (token[0]) {
                case Diff.Diff.Operation.Equal:
                    this._diffRows.push(...createEqualRows(token[1], i === 0, i === diff.length - 1));
                    originalLines.push(...token[1]);
                    currentLines.push(...token[1]);
                    break;
                case Diff.Diff.Operation.Insert:
                    for (const line of token[1]) {
                        this._diffRows.push(createRow(line, RowType.Addition));
                    }
                    insertions += token[1].length;
                    currentLines.push(...token[1]);
                    break;
                case Diff.Diff.Operation.Delete:
                    deletions += token[1].length;
                    originalLines.push(...token[1]);
                    if (diff[i + 1] && diff[i + 1][0] === Diff.Diff.Operation.Insert) {
                        i++;
                        this._diffRows.push(...createModifyRows(token[1].join('\n'), diff[i][1].join('\n')));
                        insertions += diff[i][1].length;
                        currentLines.push(...diff[i][1]);
                    }
                    else {
                        for (const line of token[1]) {
                            this._diffRows.push(createRow(line, RowType.Deletion));
                        }
                    }
                    break;
            }
        }
        this._maxLineDigits = Math.ceil(Math.log10(Math.max(currentLineNumber, baselineLineNumber)));
        let insertionText = '';
        if (insertions === 1) {
            insertionText = i18nString(UIStrings.sInsertion, { PH1: insertions });
        }
        else {
            insertionText = i18nString(UIStrings.sInsertions, { PH1: insertions });
        }
        let deletionText = '';
        if (deletions === 1) {
            deletionText = i18nString(UIStrings.sDeletion, { PH1: deletions });
        }
        else {
            deletionText = i18nString(UIStrings.sDeletions, { PH1: deletions });
        }
        this._diffStats.setText(`${insertionText} ${deletionText}`);
        this._toolbar.setEnabled(true);
        this._emptyWidget.hideWidget();
        this._editor.operation(() => {
            this._editor.showWidget();
            this._editor.setHighlightMode({
                name: 'devtools-diff',
                diffRows: this._diffRows,
                mimeType: /** @type {!Workspace.UISourceCode.UISourceCode} */ (this._selectedUISourceCode).mimeType(),
                baselineLines: originalLines,
                currentLines: currentLines
            });
            this._editor.setText(this._diffRows.map(row => row.tokens.map(t => t.text).join('')).join('\n'));
            this._editor.setLineNumberFormatter(this._lineFormatter.bind(this));
            this._editor.updateDiffGutter(this._diffRows);
        });
        /**
         * @param {!Array<string>} lines
         * @param {boolean} atStart
         * @param {boolean} atEnd
         * @return {!Array<!Row>}}
         */
        function createEqualRows(lines, atStart, atEnd) {
            const equalRows = [];
            if (!atStart) {
                for (let i = 0; i < paddingLines && i < lines.length; i++) {
                    equalRows.push(createRow(lines[i], RowType.Equal));
                }
                if (lines.length > paddingLines * 2 + 1 && !atEnd) {
                    equalRows.push(createRow(i18nString(UIStrings.SkippingDMatchingLines, { PH1: (lines.length - paddingLines * 2) }), RowType.Spacer));
                }
            }
            if (!atEnd) {
                const start = Math.max(lines.length - paddingLines - 1, atStart ? 0 : paddingLines);
                let skip = lines.length - paddingLines - 1;
                if (!atStart) {
                    skip -= paddingLines;
                }
                if (skip > 0) {
                    baselineLineNumber += skip;
                    currentLineNumber += skip;
                }
                for (let i = start; i < lines.length; i++) {
                    equalRows.push(createRow(lines[i], RowType.Equal));
                }
            }
            return equalRows;
        }
        /**
         * @param {string} before
         * @param {string} after
         * @return {!Array<!Row>}}
         */
        function createModifyRows(before, after) {
            const internalDiff = Diff.Diff.DiffWrapper.charDiff(before, after, true /* cleanup diff */);
            const deletionRows = [createRow('', RowType.Deletion)];
            const insertionRows = [createRow('', RowType.Addition)];
            for (const token of internalDiff) {
                const text = token[1];
                const type = token[0];
                const className = type === Diff.Diff.Operation.Equal ? '' : 'inner-diff';
                const lines = text.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    if (i > 0 && type !== Diff.Diff.Operation.Insert) {
                        deletionRows.push(createRow('', RowType.Deletion));
                    }
                    if (i > 0 && type !== Diff.Diff.Operation.Delete) {
                        insertionRows.push(createRow('', RowType.Addition));
                    }
                    if (!lines[i]) {
                        continue;
                    }
                    if (type !== Diff.Diff.Operation.Insert) {
                        deletionRows[deletionRows.length - 1].tokens.push({ text: lines[i], className });
                    }
                    if (type !== Diff.Diff.Operation.Delete) {
                        insertionRows[insertionRows.length - 1].tokens.push({ text: lines[i], className });
                    }
                }
            }
            return deletionRows.concat(insertionRows);
        }
        /**
         * @param {string} text
         * @param {!RowType} type
         * @return {!Row}
         */
        function createRow(text, type) {
            if (type === RowType.Addition) {
                currentLineNumber++;
            }
            if (type === RowType.Deletion) {
                baselineLineNumber++;
            }
            if (type === RowType.Equal) {
                baselineLineNumber++;
                currentLineNumber++;
            }
            return { baselineLineNumber, currentLineNumber, tokens: text ? [{ text, className: 'inner-diff' }] : [], type };
        }
    }
    /**
     * @param {number} lineNumber
     * @return {string}
     */
    _lineFormatter(lineNumber) {
        const row = this._diffRows[lineNumber - 1];
        let showBaseNumber = row.type === RowType.Deletion;
        let showCurrentNumber = row.type === RowType.Addition;
        if (row.type === RowType.Equal) {
            showBaseNumber = true;
            showCurrentNumber = true;
        }
        const baseText = showBaseNumber ? String(row.baselineLineNumber) : '';
        const base = baseText.padStart(this._maxLineDigits, '\xA0');
        const currentText = showCurrentNumber ? String(row.currentLineNumber) : '';
        const current = currentText.padStart(this._maxLineDigits, '\xA0');
        return base + '\xA0' + current;
    }
}
/** @enum {string} */
export const RowType = {
    Deletion: 'deletion',
    Addition: 'addition',
    Equal: 'equal',
    Spacer: 'spacer'
};
/**
 * @implements {Common.Revealer.Revealer}
 */
export class DiffUILocationRevealer {
    /**
     * @override
     * @param {!Object} diffUILocation
     * @param {boolean=} omitFocus
     * @return {!Promise<void>}
     */
    async reveal(diffUILocation, omitFocus) {
        if (!(diffUILocation instanceof WorkspaceDiff.WorkspaceDiff.DiffUILocation)) {
            throw new Error('Internal error: not a diff ui location');
        }
        await UI.ViewManager.ViewManager.instance().showView('changes.changes');
        ChangesView.instance()._changesSidebar.selectUISourceCode(diffUILocation.uiSourceCode, omitFocus);
    }
}
/**
 * @typedef {!{
 *  baselineLineNumber: number,
 *  currentLineNumber: number,
 *  tokens: !Array<!{text: string, className: string}>,
 *  type: !RowType
 * }}
 */
// @ts-ignore typedef
export let Row;
//# sourceMappingURL=ChangesView.js.map