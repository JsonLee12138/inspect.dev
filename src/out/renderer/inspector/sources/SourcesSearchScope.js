/*
 * Copyright (C) 2011 Google Inc. All rights reserved.
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
import * as Bindings from '../bindings/bindings.js';
import * as Common from '../common/common.js';
import * as Persistence from '../persistence/persistence.js';
import * as TextUtils from '../text_utils/text_utils.js';
import * as Workspace from '../workspace/workspace.js';
/**
 * @implements {Search.SearchConfig.SearchScope}
 */
export class SourcesSearchScope {
    constructor() {
        // FIXME: Add title once it is used by search controller.
        this._searchId = 0;
        /** @type {!Array<!Workspace.UISourceCode.UISourceCode>} */
        this._searchResultCandidates = [];
        /** @type {?function(!Search.SearchConfig.SearchResult):void} */
        this._searchResultCallback = null;
        /** @type {?function(boolean):void} */
        this._searchFinishedCallback = null;
        /** @type {?Workspace.Workspace.ProjectSearchConfig} */
        this._searchConfig = null;
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode1
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode2
     * @return {number}
     */
    static _filesComparator(uiSourceCode1, uiSourceCode2) {
        if (uiSourceCode1.isDirty() && !uiSourceCode2.isDirty()) {
            return -1;
        }
        if (!uiSourceCode1.isDirty() && uiSourceCode2.isDirty()) {
            return 1;
        }
        const isFileSystem1 = uiSourceCode1.project().type() === Workspace.Workspace.projectTypes.FileSystem &&
            !Persistence.Persistence.PersistenceImpl.instance().binding(uiSourceCode1);
        const isFileSystem2 = uiSourceCode2.project().type() === Workspace.Workspace.projectTypes.FileSystem &&
            !Persistence.Persistence.PersistenceImpl.instance().binding(uiSourceCode2);
        if (isFileSystem1 !== isFileSystem2) {
            return isFileSystem1 ? 1 : -1;
        }
        const url1 = uiSourceCode1.url();
        const url2 = uiSourceCode2.url();
        if (url1 && !url2) {
            return -1;
        }
        if (!url1 && url2) {
            return 1;
        }
        return String.naturalOrderComparator(uiSourceCode1.fullDisplayName(), uiSourceCode2.fullDisplayName());
    }
    /**
     * @override
     * @param {!Common.Progress.Progress} progress
     */
    performIndexing(progress) {
        this.stopSearch();
        const projects = this._projects();
        const compositeProgress = new Common.Progress.CompositeProgress(progress);
        for (let i = 0; i < projects.length; ++i) {
            const project = projects[i];
            const projectProgress = compositeProgress.createSubProgress(project.uiSourceCodes().length);
            project.indexContent(projectProgress);
        }
    }
    /**
     * @return {!Array.<!Workspace.Workspace.Project>}
     */
    _projects() {
        const searchInAnonymousAndContentScripts = Common.Settings.Settings.instance().moduleSetting('searchInAnonymousAndContentScripts').get();
        return Workspace.Workspace.WorkspaceImpl.instance().projects().filter(project => {
            if (project.type() === Workspace.Workspace.projectTypes.Service) {
                return false;
            }
            if (!searchInAnonymousAndContentScripts && project.isServiceProject() &&
                project.type() !== Workspace.Workspace.projectTypes.Formatter) {
                return false;
            }
            if (!searchInAnonymousAndContentScripts && project.type() === Workspace.Workspace.projectTypes.ContentScripts) {
                return false;
            }
            return true;
        });
    }
    /**
     * @override
     * @param {!Workspace.Workspace.ProjectSearchConfig} searchConfig
     * @param {!Common.Progress.Progress} progress
     * @param {function(!Search.SearchConfig.SearchResult):void} searchResultCallback
     * @param {function(boolean):void} searchFinishedCallback
     */
    performSearch(searchConfig, progress, searchResultCallback, searchFinishedCallback) {
        this.stopSearch();
        this._searchResultCandidates = [];
        this._searchResultCallback = searchResultCallback;
        this._searchFinishedCallback = searchFinishedCallback;
        this._searchConfig = searchConfig;
        const promises = [];
        const compositeProgress = new Common.Progress.CompositeProgress(progress);
        const searchContentProgress = compositeProgress.createSubProgress();
        const findMatchingFilesProgress = new Common.Progress.CompositeProgress(compositeProgress.createSubProgress());
        for (const project of this._projects()) {
            const weight = project.uiSourceCodes().length;
            const findMatchingFilesInProjectProgress = findMatchingFilesProgress.createSubProgress(weight);
            const filesMathingFileQuery = this._projectFilesMatchingFileQuery(project, searchConfig);
            const promise = project
                .findFilesMatchingSearchRequest(searchConfig, filesMathingFileQuery, findMatchingFilesInProjectProgress)
                .then(this._processMatchingFilesForProject.bind(this, this._searchId, project, searchConfig, filesMathingFileQuery));
            promises.push(promise);
        }
        Promise.all(promises).then(this._processMatchingFiles.bind(this, this._searchId, searchContentProgress, this._searchFinishedCallback.bind(this, true)));
    }
    /**
     * @param {!Workspace.Workspace.Project} project
     * @param {!Workspace.Workspace.ProjectSearchConfig} searchConfig
     * @param {boolean=} dirtyOnly
     * @return {!Array.<string>}
     */
    _projectFilesMatchingFileQuery(project, searchConfig, dirtyOnly) {
        const result = [];
        const uiSourceCodes = project.uiSourceCodes();
        for (let i = 0; i < uiSourceCodes.length; ++i) {
            const uiSourceCode = uiSourceCodes[i];
            if (!uiSourceCode.contentType().isTextType()) {
                continue;
            }
            const binding = Persistence.Persistence.PersistenceImpl.instance().binding(uiSourceCode);
            if (binding && binding.network === uiSourceCode) {
                continue;
            }
            if (dirtyOnly && !uiSourceCode.isDirty()) {
                continue;
            }
            if (searchConfig.filePathMatchesFileQuery(uiSourceCode.fullDisplayName())) {
                result.push(uiSourceCode.url());
            }
        }
        result.sort(String.naturalOrderComparator);
        return result;
    }
    /**
     * @param {number} searchId
     * @param {!Workspace.Workspace.Project} project
     * @param {!Workspace.Workspace.ProjectSearchConfig} searchConfig
     * @param {!Array<string>} filesMathingFileQuery
     * @param {!Array<string>} files
     */
    _processMatchingFilesForProject(searchId, project, searchConfig, filesMathingFileQuery, files) {
        if (searchId !== this._searchId && this._searchFinishedCallback) {
            this._searchFinishedCallback(false);
            return;
        }
        files.sort(String.naturalOrderComparator);
        files = files.intersectOrdered(filesMathingFileQuery, String.naturalOrderComparator);
        const dirtyFiles = this._projectFilesMatchingFileQuery(project, searchConfig, true);
        files = files.mergeOrdered(dirtyFiles, String.naturalOrderComparator);
        const uiSourceCodes = [];
        for (const file of files) {
            const uiSourceCode = project.uiSourceCodeForURL(file);
            if (!uiSourceCode) {
                continue;
            }
            const script = Bindings.DefaultScriptMapping.DefaultScriptMapping.scriptForUISourceCode(uiSourceCode);
            if (script && !script.isAnonymousScript()) {
                continue;
            }
            uiSourceCodes.push(uiSourceCode);
        }
        uiSourceCodes.sort(SourcesSearchScope._filesComparator);
        this._searchResultCandidates =
            this._searchResultCandidates.mergeOrdered(uiSourceCodes, SourcesSearchScope._filesComparator);
    }
    /**
     * @param {number} searchId
     * @param {!Common.Progress.Progress} progress
     * @param {function():void} callback
     */
    _processMatchingFiles(searchId, progress, callback) {
        if (searchId !== this._searchId && this._searchFinishedCallback) {
            this._searchFinishedCallback(false);
            return;
        }
        const files = this._searchResultCandidates;
        if (!files.length) {
            progress.done();
            callback();
            return;
        }
        progress.setTotalWork(files.length);
        let fileIndex = 0;
        const maxFileContentRequests = 20;
        let callbacksLeft = 0;
        for (let i = 0; i < maxFileContentRequests && i < files.length; ++i) {
            scheduleSearchInNextFileOrFinish.call(this);
        }
        /**
         * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
         * @this {SourcesSearchScope}
         */
        function searchInNextFile(uiSourceCode) {
            if (uiSourceCode.isDirty()) {
                contentLoaded.call(this, uiSourceCode, uiSourceCode.workingCopy());
            }
            else {
                uiSourceCode.requestContent().then(deferredContent => {
                    contentLoaded.call(this, uiSourceCode, deferredContent.content || '');
                });
            }
        }
        /**
         * @this {SourcesSearchScope}
         */
        function scheduleSearchInNextFileOrFinish() {
            if (fileIndex >= files.length) {
                if (!callbacksLeft) {
                    progress.done();
                    callback();
                    return;
                }
                return;
            }
            ++callbacksLeft;
            const uiSourceCode = files[fileIndex++];
            setTimeout(searchInNextFile.bind(this, uiSourceCode), 0);
        }
        /**
         * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
         * @param {string} content
         * @this {SourcesSearchScope}
         */
        function contentLoaded(uiSourceCode, content) {
            /**
             * @param {!TextUtils.ContentProvider.SearchMatch} a
             * @param {!TextUtils.ContentProvider.SearchMatch} b
             */
            function matchesComparator(a, b) {
                return a.lineNumber - b.lineNumber;
            }
            progress.worked(1);
            /** @type {!Array<!TextUtils.ContentProvider.SearchMatch>} */
            let matches = [];
            const searchConfig = /** @type {!Workspace.Workspace.ProjectSearchConfig} */ (this._searchConfig);
            const queries = searchConfig.queries();
            if (content !== null) {
                for (let i = 0; i < queries.length; ++i) {
                    const nextMatches = TextUtils.TextUtils.performSearchInContent(content, queries[i], !searchConfig.ignoreCase(), searchConfig.isRegex());
                    matches = matches.mergeOrdered(nextMatches, matchesComparator);
                }
            }
            if (matches && this._searchResultCallback) {
                const searchResult = new FileBasedSearchResult(uiSourceCode, matches);
                this._searchResultCallback(searchResult);
            }
            --callbacksLeft;
            scheduleSearchInNextFileOrFinish.call(this);
        }
    }
    /**
     * @override
     */
    stopSearch() {
        ++this._searchId;
    }
}
/**
 * @implements {Search.SearchConfig.SearchResult}
 */
export class FileBasedSearchResult {
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     * @param {!Array.<!TextUtils.ContentProvider.SearchMatch>} searchMatches
     */
    constructor(uiSourceCode, searchMatches) {
        this._uiSourceCode = uiSourceCode;
        this._searchMatches = searchMatches;
    }
    /**
     * @override
     * @return {string}
     */
    label() {
        return this._uiSourceCode.displayName();
    }
    /**
     * @override
     * @return {string}
     */
    description() {
        return this._uiSourceCode.fullDisplayName();
    }
    /**
     * @override
     * @return {number}
     */
    matchesCount() {
        return this._searchMatches.length;
    }
    /**
     * @override
     * @param {number} index
     * @return {string}
     */
    matchLineContent(index) {
        return this._searchMatches[index].lineContent;
    }
    /**
     * @override
     * @param {number} index
     * @return {!Object}
     */
    matchRevealable(index) {
        const match = this._searchMatches[index];
        return this._uiSourceCode.uiLocation(match.lineNumber, undefined);
    }
    /**
     * @override
     * @param {number} index
     * @return {?}
     */
    matchLabel(index) {
        return this._searchMatches[index].lineNumber + 1;
    }
}
//# sourceMappingURL=SourcesSearchScope.js.map