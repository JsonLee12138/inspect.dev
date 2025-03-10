// Copyright (c) 2017 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as SDK from '../sdk/sdk.js';
import * as Workspace from '../workspace/workspace.js';
import { FileSystemWorkspaceBinding } from './FileSystemWorkspaceBinding.js'; // eslint-disable-line no-unused-vars
import { PersistenceBinding, PersistenceImpl } from './PersistenceImpl.js';
/** @type {?NetworkPersistenceManager} */
let networkPersistenceManagerInstance;
export class NetworkPersistenceManager extends Common.ObjectWrapper.ObjectWrapper {
    /**
     * @private
     * @param {!Workspace.Workspace.WorkspaceImpl} workspace
     */
    constructor(workspace) {
        super();
        /** @type {!WeakMap<!Workspace.UISourceCode.UISourceCode, !PersistenceBinding>} */
        this._bindings = new WeakMap();
        /** @type {!WeakMap<!Workspace.UISourceCode.UISourceCode, !Promise<?string>>} */
        this._originalResponseContentPromises = new WeakMap();
        /** @type {!WeakSet<!Workspace.UISourceCode.UISourceCode>} */
        this._savingForOverrides = new WeakSet();
        this._savingSymbol = Symbol('SavingForOverrides');
        this._enabledSetting = Common.Settings.Settings.instance().moduleSetting('persistenceNetworkOverridesEnabled');
        this._enabledSetting.addChangeListener(this._enabledChanged, this);
        this._workspace = workspace;
        /** @type {!Map<string, !Workspace.UISourceCode.UISourceCode>} */
        this._networkUISourceCodeForEncodedPath = new Map();
        this._interceptionHandlerBound = this._interceptionHandler.bind(this);
        this._updateInterceptionThrottler = new Common.Throttler.Throttler(50);
        /** @type {?Workspace.Workspace.Project} */
        this._project = null;
        /** @type {?Workspace.Workspace.Project} */
        this._activeProject = null;
        this._active = false;
        this._enabled = false;
        this._workspace.addEventListener(Workspace.Workspace.Events.ProjectAdded, event => {
            this._onProjectAdded(/** @type {!Workspace.Workspace.Project} */ (event.data));
        });
        this._workspace.addEventListener(Workspace.Workspace.Events.ProjectRemoved, event => {
            this._onProjectRemoved(/** @type {!Workspace.Workspace.Project} */ (event.data));
        });
        PersistenceImpl.instance().addNetworkInterceptor(this._canHandleNetworkUISourceCode.bind(this));
        /** @type {!Array<!Common.EventTarget.EventDescriptor>} */
        this._eventDescriptors = [];
        this._enabledChanged();
    }
    /**
     * @param {{forceNew: ?boolean, workspace: ?Workspace.Workspace.WorkspaceImpl}} opts
     */
    static instance(opts = { forceNew: null, workspace: null }) {
        const { forceNew, workspace } = opts;
        if (!networkPersistenceManagerInstance || forceNew) {
            if (!workspace) {
                throw new Error('Missing workspace for NetworkPersistenceManager');
            }
            networkPersistenceManagerInstance = new NetworkPersistenceManager(workspace);
        }
        return networkPersistenceManagerInstance;
    }
    /**
     * @return {boolean}
     */
    active() {
        return this._active;
    }
    /**
     * @return {?Workspace.Workspace.Project}
     */
    project() {
        return this._project;
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     * @return {?Promise<?string>}
     */
    originalContentForUISourceCode(uiSourceCode) {
        const binding = this._bindings.get(uiSourceCode);
        if (!binding) {
            return null;
        }
        const fileSystemUISourceCode = binding.fileSystem;
        return this._originalResponseContentPromises.get(fileSystemUISourceCode) || null;
    }
    async _enabledChanged() {
        if (this._enabled === this._enabledSetting.get()) {
            return;
        }
        this._enabled = this._enabledSetting.get();
        if (this._enabled) {
            this._eventDescriptors = [
                Workspace.Workspace.WorkspaceImpl.instance().addEventListener(Workspace.Workspace.Events.UISourceCodeRenamed, event => {
                    this._uiSourceCodeRenamedListener(event);
                }),
                Workspace.Workspace.WorkspaceImpl.instance().addEventListener(Workspace.Workspace.Events.UISourceCodeAdded, event => {
                    this._uiSourceCodeAdded(event);
                }),
                Workspace.Workspace.WorkspaceImpl.instance().addEventListener(Workspace.Workspace.Events.UISourceCodeRemoved, event => {
                    this._uiSourceCodeRemovedListener(event);
                }),
                Workspace.Workspace.WorkspaceImpl.instance().addEventListener(Workspace.Workspace.Events.WorkingCopyCommitted, event => this._onUISourceCodeWorkingCopyCommitted(
                /** @type {!Workspace.UISourceCode.UISourceCode} */ (event.data.uiSourceCode)))
            ];
            await this._updateActiveProject();
        }
        else {
            Common.EventTarget.EventTarget.removeEventListeners(this._eventDescriptors);
            await this._updateActiveProject();
        }
    }
    /**
     * @param {!Common.EventTarget.EventTargetEvent} event
     */
    async _uiSourceCodeRenamedListener(event) {
        const uiSourceCode = /** @type {!Workspace.UISourceCode.UISourceCode} */ (event.data.uiSourceCode);
        await this._onUISourceCodeRemoved(uiSourceCode);
        await this._onUISourceCodeAdded(uiSourceCode);
    }
    /**
     * @param {!Common.EventTarget.EventTargetEvent} event
     */
    async _uiSourceCodeRemovedListener(event) {
        await this._onUISourceCodeRemoved(/** @type {!Workspace.UISourceCode.UISourceCode} */ (event.data));
    }
    /**
     * @param {!Common.EventTarget.EventTargetEvent} event
     */
    async _uiSourceCodeAdded(event) {
        await this._onUISourceCodeAdded(/** @type {!Workspace.UISourceCode.UISourceCode} */ (event.data));
    }
    async _updateActiveProject() {
        const wasActive = this._active;
        this._active =
            Boolean(this._enabledSetting.get() && SDK.SDKModel.TargetManager.instance().mainTarget() && this._project);
        if (this._active === wasActive) {
            return;
        }
        if (this._active && this._project) {
            await Promise.all(this._project.uiSourceCodes().map(uiSourceCode => this._filesystemUISourceCodeAdded(uiSourceCode)));
            const networkProjects = this._workspace.projectsForType(Workspace.Workspace.projectTypes.Network);
            for (const networkProject of networkProjects) {
                await Promise.all(networkProject.uiSourceCodes().map(uiSourceCode => this._networkUISourceCodeAdded(uiSourceCode)));
            }
        }
        else if (this._project) {
            await Promise.all(this._project.uiSourceCodes().map(uiSourceCode => this._filesystemUISourceCodeRemoved(uiSourceCode)));
            this._networkUISourceCodeForEncodedPath.clear();
        }
        PersistenceImpl.instance().refreshAutomapping();
    }
    /**
     * @param {string} url
     * @return {string}
     */
    _encodedPathFromUrl(url) {
        if (!this._active || !this._project) {
            return '';
        }
        let urlPath = Common.ParsedURL.ParsedURL.urlWithoutHash(url.replace(/^https?:\/\//, ''));
        if (urlPath.endsWith('/') && urlPath.indexOf('?') === -1) {
            urlPath = urlPath + 'index.html';
        }
        let encodedPathParts = encodeUrlPathToLocalPathParts(urlPath);
        const projectPath = FileSystemWorkspaceBinding.fileSystemPath(this._project.id());
        const encodedPath = encodedPathParts.join('/');
        if (projectPath.length + encodedPath.length > 200) {
            const domain = encodedPathParts[0];
            const encodedFileName = encodedPathParts[encodedPathParts.length - 1];
            const shortFileName = encodedFileName ? encodedFileName.substr(0, 10) + '-' : '';
            const extension = Common.ParsedURL.ParsedURL.extractExtension(urlPath);
            const extensionPart = extension ? '.' + extension.substr(0, 10) : '';
            encodedPathParts =
                [domain, 'longurls', shortFileName + String.hashCode(encodedPath).toString(16) + extensionPart];
        }
        return encodedPathParts.join('/');
        /**
         * @param {string} urlPath
         * @return {!Array<string>}
         */
        function encodeUrlPathToLocalPathParts(urlPath) {
            const encodedParts = [];
            for (const pathPart of fileNamePartsFromUrlPath(urlPath)) {
                if (!pathPart) {
                    continue;
                }
                // encodeURI() escapes all the unsafe filename characters except /:?*
                let encodedName = encodeURI(pathPart).replace(/[\/:\?\*]/g, match => '%' + match[0].charCodeAt(0).toString(16));
                // Windows does not allow a small set of filenames.
                if (_reservedFileNames.has(encodedName.toLowerCase())) {
                    encodedName = encodedName.split('').map(char => '%' + char.charCodeAt(0).toString(16)).join('');
                }
                // Windows does not allow the file to end in a space or dot (space should already be encoded).
                const lastChar = encodedName.charAt(encodedName.length - 1);
                if (lastChar === '.') {
                    encodedName = encodedName.substr(0, encodedName.length - 1) + '%2e';
                }
                encodedParts.push(encodedName);
            }
            return encodedParts;
        }
        /**
         * @param {string} urlPath
         * @return {!Array<string>}
         */
        function fileNamePartsFromUrlPath(urlPath) {
            urlPath = Common.ParsedURL.ParsedURL.urlWithoutHash(urlPath);
            const queryIndex = urlPath.indexOf('?');
            if (queryIndex === -1) {
                return urlPath.split('/');
            }
            if (queryIndex === 0) {
                return [urlPath];
            }
            const endSection = urlPath.substr(queryIndex);
            const parts = urlPath.substr(0, urlPath.length - endSection.length).split('/');
            parts[parts.length - 1] += endSection;
            return parts;
        }
    }
    /**
     * @param {string} path
     * @return {string}
     */
    _decodeLocalPathToUrlPath(path) {
        try {
            return unescape(path);
        }
        catch (e) {
            console.error(e);
        }
        return path;
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    async _unbind(uiSourceCode) {
        const binding = this._bindings.get(uiSourceCode);
        if (binding) {
            this._bindings.delete(binding.network);
            this._bindings.delete(binding.fileSystem);
            await PersistenceImpl.instance().removeBinding(binding);
        }
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} networkUISourceCode
     * @param {!Workspace.UISourceCode.UISourceCode} fileSystemUISourceCode
     */
    async _bind(networkUISourceCode, fileSystemUISourceCode) {
        if (this._bindings.has(networkUISourceCode)) {
            await this._unbind(networkUISourceCode);
        }
        if (this._bindings.has(fileSystemUISourceCode)) {
            await this._unbind(fileSystemUISourceCode);
        }
        const binding = new PersistenceBinding(networkUISourceCode, fileSystemUISourceCode);
        this._bindings.set(networkUISourceCode, binding);
        this._bindings.set(fileSystemUISourceCode, binding);
        await PersistenceImpl.instance().addBinding(binding);
        const uiSourceCodeOfTruth = this._savingForOverrides.has(networkUISourceCode) ? networkUISourceCode : fileSystemUISourceCode;
        const [{ content }, encoded] = await Promise.all([uiSourceCodeOfTruth.requestContent(), uiSourceCodeOfTruth.contentEncoded()]);
        PersistenceImpl.instance().syncContent(uiSourceCodeOfTruth, content || '', encoded);
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    _onUISourceCodeWorkingCopyCommitted(uiSourceCode) {
        this.saveUISourceCodeForOverrides(uiSourceCode);
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    canSaveUISourceCodeForOverrides(uiSourceCode) {
        return this._active && uiSourceCode.project().type() === Workspace.Workspace.projectTypes.Network &&
            !this._bindings.has(uiSourceCode) && !this._savingForOverrides.has(uiSourceCode);
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    async saveUISourceCodeForOverrides(uiSourceCode) {
        if (!this.canSaveUISourceCodeForOverrides(uiSourceCode)) {
            return;
        }
        this._savingForOverrides.add(uiSourceCode);
        let encodedPath = this._encodedPathFromUrl(uiSourceCode.url());
        const content = (await uiSourceCode.requestContent()).content || '';
        const encoded = await uiSourceCode.contentEncoded();
        const lastIndexOfSlash = encodedPath.lastIndexOf('/');
        const encodedFileName = encodedPath.substr(lastIndexOfSlash + 1);
        encodedPath = encodedPath.substr(0, lastIndexOfSlash);
        if (this._project) {
            await this._project.createFile(encodedPath, encodedFileName, content, encoded);
        }
        this._fileCreatedForTest(encodedPath, encodedFileName);
        this._savingForOverrides.delete(uiSourceCode);
    }
    /**
     * @param {string} path
     * @param {string} fileName
     */
    _fileCreatedForTest(path, fileName) {
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     * @return {string}
     */
    _patternForFileSystemUISourceCode(uiSourceCode) {
        const relativePathParts = FileSystemWorkspaceBinding.relativePath(uiSourceCode);
        if (relativePathParts.length < 2) {
            return '';
        }
        if (relativePathParts[1] === 'longurls' && relativePathParts.length !== 2) {
            return 'http?://' + relativePathParts[0] + '/*';
        }
        return 'http?://' + this._decodeLocalPathToUrlPath(relativePathParts.join('/'));
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    async _onUISourceCodeAdded(uiSourceCode) {
        await this._networkUISourceCodeAdded(uiSourceCode);
        await this._filesystemUISourceCodeAdded(uiSourceCode);
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    _canHandleNetworkUISourceCode(uiSourceCode) {
        return this._active && !uiSourceCode.url().startsWith('snippet://');
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    async _networkUISourceCodeAdded(uiSourceCode) {
        if (uiSourceCode.project().type() !== Workspace.Workspace.projectTypes.Network ||
            !this._canHandleNetworkUISourceCode(uiSourceCode)) {
            return;
        }
        const url = Common.ParsedURL.ParsedURL.urlWithoutHash(uiSourceCode.url());
        this._networkUISourceCodeForEncodedPath.set(this._encodedPathFromUrl(url), uiSourceCode);
        const project = /** @type {!FileSystem} */ (this._project);
        const fileSystemUISourceCode = project.uiSourceCodeForURL(project.fileSystemPath() + '/' + this._encodedPathFromUrl(url));
        if (fileSystemUISourceCode) {
            await this._bind(uiSourceCode, fileSystemUISourceCode);
        }
    }
    /**
      * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
      */
    async _filesystemUISourceCodeAdded(uiSourceCode) {
        if (!this._active || uiSourceCode.project() !== this._project) {
            return;
        }
        this._updateInterceptionPatterns();
        const relativePath = FileSystemWorkspaceBinding.relativePath(uiSourceCode);
        const networkUISourceCode = this._networkUISourceCodeForEncodedPath.get(relativePath.join('/'));
        if (networkUISourceCode) {
            await this._bind(networkUISourceCode, uiSourceCode);
        }
    }
    _updateInterceptionPatterns() {
        this._updateInterceptionThrottler.schedule(innerUpdateInterceptionPatterns.bind(this));
        /**
         * @this {NetworkPersistenceManager}
         * @return {!Promise<void>}
         */
        function innerUpdateInterceptionPatterns() {
            if (!this._active || !this._project) {
                return SDK.NetworkManager.MultitargetNetworkManager.instance().setInterceptionHandlerForPatterns([], this._interceptionHandlerBound);
            }
            const patterns = new Set();
            const indexFileName = 'index.html';
            for (const uiSourceCode of this._project.uiSourceCodes()) {
                const pattern = this._patternForFileSystemUISourceCode(uiSourceCode);
                patterns.add(pattern);
                if (pattern.endsWith('/' + indexFileName)) {
                    patterns.add(pattern.substr(0, pattern.length - indexFileName.length));
                }
            }
            return SDK.NetworkManager.MultitargetNetworkManager.instance().setInterceptionHandlerForPatterns(Array.from(patterns).map(pattern => ({ urlPattern: pattern, interceptionStage: Protocol.Network.InterceptionStage.HeadersReceived })), this._interceptionHandlerBound);
        }
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    async _onUISourceCodeRemoved(uiSourceCode) {
        await this._networkUISourceCodeRemoved(uiSourceCode);
        await this._filesystemUISourceCodeRemoved(uiSourceCode);
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    async _networkUISourceCodeRemoved(uiSourceCode) {
        if (uiSourceCode.project().type() === Workspace.Workspace.projectTypes.Network) {
            await this._unbind(uiSourceCode);
            this._networkUISourceCodeForEncodedPath.delete(this._encodedPathFromUrl(uiSourceCode.url()));
        }
    }
    /**
     * @param {!Workspace.UISourceCode.UISourceCode} uiSourceCode
     */
    async _filesystemUISourceCodeRemoved(uiSourceCode) {
        if (uiSourceCode.project() !== this._project) {
            return;
        }
        this._updateInterceptionPatterns();
        this._originalResponseContentPromises.delete(uiSourceCode);
        await this._unbind(uiSourceCode);
    }
    /** @param {?Workspace.Workspace.Project} project */
    async _setProject(project) {
        if (project === this._project) {
            return;
        }
        if (this._project) {
            await Promise.all(this._project.uiSourceCodes().map(uiSourceCode => this._filesystemUISourceCodeRemoved(uiSourceCode)));
        }
        this._project = project;
        if (this._project) {
            await Promise.all(this._project.uiSourceCodes().map(uiSourceCode => this._filesystemUISourceCodeAdded(uiSourceCode)));
        }
        await this._updateActiveProject();
        this.dispatchEventToListeners(Events.ProjectChanged, this._project);
    }
    /**
     * @param {!Workspace.Workspace.Project} project
     */
    async _onProjectAdded(project) {
        if (project.type() !== Workspace.Workspace.projectTypes.FileSystem ||
            FileSystemWorkspaceBinding.fileSystemType(project) !== 'overrides') {
            return;
        }
        const fileSystemPath = FileSystemWorkspaceBinding.fileSystemPath(project.id());
        if (!fileSystemPath) {
            return;
        }
        if (this._project) {
            this._project.remove();
        }
        await this._setProject(project);
    }
    /**
     * @param {!Workspace.Workspace.Project} project
     */
    async _onProjectRemoved(project) {
        if (project === this._project) {
            await this._setProject(null);
        }
    }
    /**
     * @param {!SDK.NetworkManager.InterceptedRequest} interceptedRequest
     * @return {!Promise<void>}
     */
    async _interceptionHandler(interceptedRequest) {
        const method = interceptedRequest.request.method;
        if (!this._active || (method !== 'GET' && method !== 'POST')) {
            return;
        }
        const proj = /** @type {!FileSystem} */ (this._project);
        const path = proj.fileSystemPath() + '/' + this._encodedPathFromUrl(interceptedRequest.request.url);
        const fileSystemUISourceCode = proj.uiSourceCodeForURL(path);
        if (!fileSystemUISourceCode) {
            return;
        }
        let mimeType = '';
        if (interceptedRequest.responseHeaders) {
            const responseHeaders = SDK.NetworkManager.NetworkManager.lowercaseHeaders(interceptedRequest.responseHeaders);
            mimeType = responseHeaders['content-type'];
        }
        if (!mimeType) {
            const expectedResourceType = Common.ResourceType.resourceTypes[interceptedRequest.resourceType] || Common.ResourceType.resourceTypes.Other;
            mimeType = fileSystemUISourceCode.mimeType();
            if (Common.ResourceType.ResourceType.fromMimeType(mimeType) !== expectedResourceType) {
                mimeType = expectedResourceType.canonicalMimeType();
            }
        }
        const project = 
        /** @type {!FileSystem} */ (fileSystemUISourceCode.project());
        this._originalResponseContentPromises.set(fileSystemUISourceCode, interceptedRequest.responseBody().then(response => {
            if (response.error || response.content === null) {
                return null;
            }
            return response.encoded ? atob(response.content) : response.content;
        }));
        const blob = await project.requestFileBlob(fileSystemUISourceCode);
        if (blob) {
            interceptedRequest.continueRequestWithContent(new Blob([blob], { type: mimeType }));
        }
    }
}
const _reservedFileNames = new Set([
    'con', 'prn', 'aux', 'nul', 'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7',
    'com8', 'com9', 'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9'
]);
export const Events = {
    ProjectChanged: Symbol('ProjectChanged')
};
//# sourceMappingURL=NetworkPersistenceManager.js.map