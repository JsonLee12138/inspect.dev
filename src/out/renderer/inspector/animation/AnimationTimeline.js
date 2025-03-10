// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as Host from '../host/host.js';
import * as i18n from '../i18n/i18n.js';
import * as Platform from '../platform/platform.js';
import * as SDK from '../sdk/sdk.js';
import * as UI from '../ui/ui.js';
import { AnimationGroupPreviewUI } from './AnimationGroupPreviewUI.js';
import { AnimationModel, Events } from './AnimationModel.js'; // eslint-disable-line no-unused-vars
import { AnimationScreenshotPopover } from './AnimationScreenshotPopover.js';
import { AnimationUI } from './AnimationUI.js';
export const UIStrings = {
    /**
    *@description Timeline hint text content in Animation Timeline of the Animation Inspector
    */
    selectAnEffectAboveToInspectAnd: 'Select an effect above to inspect and modify.',
    /**
    *@description Text to clear everything
    */
    clearAll: 'Clear all',
    /**
    *@description Tooltip text that appears when hovering over largeicon pause button in Animation Timeline of the Animation Inspector
    */
    pauseAll: 'Pause all',
    /**
    *@description Title of the playback rate button listbox
    */
    playbackRates: 'Playback rates',
    /**
    *@description Text in Animation Timeline of the Animation Inspector
    *@example {50} PH1
    */
    playbackRatePlaceholder: '{PH1}%',
    /**
    *@description Text of an item that pause the running task
    */
    pause: 'Pause',
    /**
    *@description Button title in Animation Timeline of the Animation Inspector
    *@example {50%} PH1
    */
    setSpeedToS: 'Set speed to {PH1}',
    /**
    *@description Title of Animation Previews listbox
    */
    animationPreviews: 'Animation previews',
    /**
    *@description Empty buffer hint text content in Animation Timeline of the Animation Inspector
    */
    listeningForAnimations: 'Listening for animations...',
    /**
    *@description Tooltip text that appears when hovering over largeicon replay animation button in Animation Timeline of the Animation Inspector
    */
    replayTimeline: 'Replay timeline',
    /**
    *@description Text in Animation Timeline of the Animation Inspector
    */
    resumeAll: 'Resume all',
    /**
    *@description Title of control button in animation timeline of the animation inspector
    */
    playTimeline: 'Play timeline',
    /**
    *@description Title of control button in animation timeline of the animation inspector
    */
    pauseTimeline: 'Pause timeline',
    /**
    *@description Title of a specific Animation Preview
    *@example {1} PH1
    */
    animationPreviewS: 'Animation Preview {PH1}',
};
const str_ = i18n.i18n.registerUIStrings('animation/AnimationTimeline.js', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/** @type {!WeakMap<!SDK.DOMModel.DOMNode, !NodeUI>} */
const nodeUIsByNode = new WeakMap();
/** @type {!WeakMap<!HTMLElement, number>} */
const playbackRates = new WeakMap();
/**
 * @implements {SDK.SDKModel.SDKModelObserver<!AnimationModel>}
 */
export class AnimationTimeline extends UI.Widget.VBox {
    constructor() {
        super(true);
        this.registerRequiredCSS('animation/animationTimeline.css', { enableLegacyPatching: false });
        this.element.classList.add('animations-timeline');
        this._gridWrapper = this.contentElement.createChild('div', 'grid-overflow-wrapper');
        this._grid = UI.UIUtils.createSVGChild(this._gridWrapper, 'svg', 'animation-timeline-grid');
        this._playbackRate = 1;
        this._allPaused = false;
        this._createHeader();
        this._animationsContainer = this.contentElement.createChild('div', 'animation-timeline-rows');
        const timelineHint = this.contentElement.createChild('div', 'animation-timeline-rows-hint');
        timelineHint.textContent = i18nString(UIStrings.selectAnEffectAboveToInspectAnd);
        /** @type {!Array<!HTMLElement>} */
        this._playbackRateButtons;
        /** @type {!HTMLElement} */
        this._previewContainer;
        /** @type {!HTMLElement} */
        this._timelineScrubber;
        /** @type {!HTMLElement} */
        this._currentTime;
        /** @type {!UI.PopoverHelper.PopoverHelper} */
        this._popoverHelper;
        /** @type {!UI.Toolbar.ToolbarButton} */
        this._clearButton;
        /** @type {?AnimationGroup} */
        this._selectedGroup;
        /** @type {!Array<!AnimationUI>} */
        this._renderQueue;
        /** @const */ this._defaultDuration = 100;
        this._duration = this._defaultDuration;
        /** @const */ this._timelineControlsWidth = 150;
        /** @type {!Map.<!Protocol.DOM.BackendNodeId, !NodeUI>} */
        this._nodesMap = new Map();
        /** @type {!Array<!AnimationUI>} */
        this._uiAnimations = [];
        /** @type {!Array<!AnimationGroup>} */
        this._groupBuffer = [];
        /** @type {!Map.<!AnimationGroup, !AnimationGroupPreviewUI>} */
        this._previewMap = new Map();
        this._symbol = Symbol('animationTimeline');
        /** @type {!Map.<string, !AnimationImpl>} */
        this._animationsMap = new Map();
        SDK.SDKModel.TargetManager.instance().addModelListener(SDK.DOMModel.DOMModel, SDK.DOMModel.Events.NodeRemoved, this._nodeRemoved, this);
        SDK.SDKModel.TargetManager.instance().observeModels(AnimationModel, this);
        UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this._nodeChanged, this);
    }
    /**
     * @override
     */
    wasShown() {
        for (const animationModel of SDK.SDKModel.TargetManager.instance().models(AnimationModel)) {
            this._addEventListeners(animationModel);
        }
    }
    /**
     * @override
     */
    willHide() {
        for (const animationModel of SDK.SDKModel.TargetManager.instance().models(AnimationModel)) {
            this._removeEventListeners(animationModel);
        }
        if (this._popoverHelper) {
            this._popoverHelper.hidePopover();
        }
    }
    /**
     * @override
     * @param {!AnimationModel} animationModel
     */
    modelAdded(animationModel) {
        if (this.isShowing()) {
            this._addEventListeners(animationModel);
        }
    }
    /**
     * @override
     * @param {!AnimationModel} animationModel
     */
    modelRemoved(animationModel) {
        this._removeEventListeners(animationModel);
    }
    /**
     * @param {!AnimationModel} animationModel
     */
    _addEventListeners(animationModel) {
        animationModel.ensureEnabled();
        animationModel.addEventListener(Events.AnimationGroupStarted, this._animationGroupStarted, this);
        animationModel.addEventListener(Events.ModelReset, this._reset, this);
    }
    /**
     * @param {!AnimationModel} animationModel
     */
    _removeEventListeners(animationModel) {
        animationModel.removeEventListener(Events.AnimationGroupStarted, this._animationGroupStarted, this);
        animationModel.removeEventListener(Events.ModelReset, this._reset, this);
    }
    _nodeChanged() {
        for (const nodeUI of this._nodesMap.values()) {
            nodeUI._nodeChanged();
        }
    }
    /**
     * @return {!HTMLElement} element
     */
    _createScrubber() {
        this._timelineScrubber = /** @type {!HTMLElement} */ (document.createElement('div'));
        this._timelineScrubber.classList.add('animation-scrubber');
        this._timelineScrubber.classList.add('hidden');
        this._timelineScrubberLine = this._timelineScrubber.createChild('div', 'animation-scrubber-line');
        this._timelineScrubberLine.createChild('div', 'animation-scrubber-head');
        this._timelineScrubber.createChild('div', 'animation-time-overlay');
        return this._timelineScrubber;
    }
    _createHeader() {
        const toolbarContainer = this.contentElement.createChild('div', 'animation-timeline-toolbar-container');
        const topToolbar = new UI.Toolbar.Toolbar('animation-timeline-toolbar', toolbarContainer);
        this._clearButton = new UI.Toolbar.ToolbarButton(i18nString(UIStrings.clearAll), 'largeicon-clear');
        this._clearButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this._reset.bind(this));
        topToolbar.appendToolbarItem(this._clearButton);
        topToolbar.appendSeparator();
        this._pauseButton =
            new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.pauseAll), 'largeicon-pause', 'largeicon-resume');
        this._pauseButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this._togglePauseAll.bind(this));
        topToolbar.appendToolbarItem(this._pauseButton);
        const playbackRateControl = toolbarContainer.createChild('div', 'animation-playback-rate-control');
        playbackRateControl.addEventListener('keydown', this._handlePlaybackRateControlKeyDown.bind(this));
        UI.ARIAUtils.markAsListBox(playbackRateControl);
        UI.ARIAUtils.setAccessibleName(playbackRateControl, i18nString(UIStrings.playbackRates));
        /** @type {!Array<!HTMLElement>} */
        this._playbackRateButtons = [];
        for (const playbackRate of GlobalPlaybackRates) {
            const button = 
            /** @type {!HTMLElement} */ (playbackRateControl.createChild('button', 'animation-playback-rate-button'));
            button.textContent = playbackRate ? i18nString(UIStrings.playbackRatePlaceholder, { PH1: playbackRate * 100 }) :
                i18nString(UIStrings.pause);
            playbackRates.set(button, playbackRate);
            button.addEventListener('click', this._setPlaybackRate.bind(this, playbackRate));
            UI.ARIAUtils.markAsOption(button);
            UI.Tooltip.Tooltip.install(button, i18nString(UIStrings.setSpeedToS, { PH1: button.textContent }));
            button.tabIndex = -1;
            this._playbackRateButtons.push(button);
        }
        this._updatePlaybackControls();
        this._previewContainer =
            /** @type {!HTMLElement} */ (this.contentElement.createChild('div', 'animation-timeline-buffer'));
        UI.ARIAUtils.markAsListBox(this._previewContainer);
        UI.ARIAUtils.setAccessibleName(this._previewContainer, i18nString(UIStrings.animationPreviews));
        this._popoverHelper =
            new UI.PopoverHelper.PopoverHelper(this._previewContainer, this._getPopoverRequest.bind(this));
        this._popoverHelper.setDisableOnClick(true);
        this._popoverHelper.setTimeout(0);
        const emptyBufferHint = this.contentElement.createChild('div', 'animation-timeline-buffer-hint');
        emptyBufferHint.textContent = i18nString(UIStrings.listeningForAnimations);
        const container = this.contentElement.createChild('div', 'animation-timeline-header');
        const controls = container.createChild('div', 'animation-controls');
        this._currentTime =
            /** @type {!HTMLElement} */ (controls.createChild('div', 'animation-timeline-current-time monospace'));
        const toolbar = new UI.Toolbar.Toolbar('animation-controls-toolbar', controls);
        this._controlButton =
            new UI.Toolbar.ToolbarToggle(i18nString(UIStrings.replayTimeline), 'largeicon-replay-animation');
        this._controlState = _ControlState.Replay;
        this._controlButton.setToggled(true);
        this._controlButton.addEventListener(UI.Toolbar.ToolbarButton.Events.Click, this._controlButtonToggle.bind(this));
        toolbar.appendToolbarItem(this._controlButton);
        const gridHeader = container.createChild('div', 'animation-grid-header');
        UI.UIUtils.installDragHandle(gridHeader, this._repositionScrubber.bind(this), this._scrubberDragMove.bind(this), this._scrubberDragEnd.bind(this), 'text');
        this._gridWrapper.appendChild(this._createScrubber());
        if (this._timelineScrubberLine) {
            UI.UIUtils.installDragHandle(this._timelineScrubberLine, this._scrubberDragStart.bind(this), this._scrubberDragMove.bind(this), this._scrubberDragEnd.bind(this), 'col-resize');
        }
        this._currentTime.textContent = '';
        return container;
    }
    /**
     * @param {!Event} event
     */
    _handlePlaybackRateControlKeyDown(event) {
        const keyboardEvent = /** @type {!KeyboardEvent} */ (event);
        switch (keyboardEvent.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                this._focusNextPlaybackRateButton(event.target, /* focusPrevious */ true);
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                this._focusNextPlaybackRateButton(event.target);
                break;
        }
    }
    /**
     * @param {!EventTarget|null} target
     * @param {boolean=} focusPrevious
     */
    _focusNextPlaybackRateButton(target, focusPrevious) {
        const button = /** @type {!HTMLElement} */ (target);
        const currentIndex = this._playbackRateButtons.indexOf(button);
        const nextIndex = focusPrevious ? currentIndex - 1 : currentIndex + 1;
        if (nextIndex < 0 || nextIndex >= this._playbackRateButtons.length) {
            return;
        }
        const nextButton = this._playbackRateButtons[nextIndex];
        nextButton.tabIndex = 0;
        nextButton.focus();
        if (target) {
            /** @type {!HTMLElement} */ (target).tabIndex = -1;
        }
    }
    /**
     * @param {!Event} event
     * @return {?UI.PopoverHelper.PopoverRequest}
     */
    _getPopoverRequest(event) {
        const element = /** @type {!HTMLElement} */ (event.target);
        if (!element || !element.isDescendant(this._previewContainer)) {
            return null;
        }
        return {
            box: element.boxInWindow(),
            show: popover => {
                let animGroup;
                for (const [group, previewUI] of this._previewMap) {
                    if (previewUI.element === element.parentElement) {
                        animGroup = group;
                    }
                }
                console.assert(typeof animGroup !== 'undefined');
                if (!animGroup) {
                    return Promise.resolve(false);
                }
                const screenshots = animGroup.screenshots();
                if (!screenshots.length) {
                    return Promise.resolve(false);
                }
                /** @type {function(*):void} */
                let fulfill;
                const promise = new Promise(x => {
                    fulfill = x;
                });
                if (!screenshots[0].complete) {
                    screenshots[0].onload = onFirstScreenshotLoaded.bind(null, screenshots);
                }
                else {
                    onFirstScreenshotLoaded(screenshots);
                }
                return promise;
                /**
                 * @param  {!Array.<!HTMLImageElement>} screenshots
                 */
                function onFirstScreenshotLoaded(screenshots) {
                    new AnimationScreenshotPopover(screenshots).show(popover.contentElement);
                    fulfill(true);
                }
            },
            hide: undefined
        };
    }
    _togglePauseAll() {
        this._allPaused = !this._allPaused;
        if (this._pauseButton) {
            this._pauseButton.setToggled(this._allPaused);
        }
        this._setPlaybackRate(this._playbackRate);
        if (this._pauseButton) {
            this._pauseButton.setTitle(this._allPaused ? i18nString(UIStrings.resumeAll) : i18nString(UIStrings.pauseAll));
        }
    }
    /**
     * @param {number} playbackRate
     */
    _setPlaybackRate(playbackRate) {
        this._playbackRate = playbackRate;
        for (const animationModel of SDK.SDKModel.TargetManager.instance().models(AnimationModel)) {
            animationModel.setPlaybackRate(this._allPaused ? 0 : this._playbackRate);
        }
        Host.userMetrics.actionTaken(Host.UserMetrics.Action.AnimationsPlaybackRateChanged);
        if (this._scrubberPlayer) {
            this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();
        }
        this._updatePlaybackControls();
    }
    _updatePlaybackControls() {
        for (const button of this._playbackRateButtons) {
            const selected = this._playbackRate === playbackRates.get(button);
            button.classList.toggle('selected', selected);
            button.tabIndex = selected ? 0 : -1;
        }
    }
    _controlButtonToggle() {
        if (this._controlState === _ControlState.Play) {
            this._togglePause(false);
        }
        else if (this._controlState === _ControlState.Replay) {
            this._replay();
        }
        else {
            this._togglePause(true);
        }
    }
    _updateControlButton() {
        if (!this._controlButton) {
            return;
        }
        this._controlButton.setEnabled(Boolean(this._selectedGroup));
        if (this._selectedGroup && this._selectedGroup.paused()) {
            this._controlState = _ControlState.Play;
            this._controlButton.setToggled(true);
            this._controlButton.setTitle(i18nString(UIStrings.playTimeline));
            this._controlButton.setGlyph('largeicon-play-animation');
        }
        else if (!this._scrubberPlayer || !this._scrubberPlayer.currentTime ||
            this._scrubberPlayer.currentTime >= this.duration()) {
            this._controlState = _ControlState.Replay;
            this._controlButton.setToggled(true);
            this._controlButton.setTitle(i18nString(UIStrings.replayTimeline));
            this._controlButton.setGlyph('largeicon-replay-animation');
        }
        else {
            this._controlState = _ControlState.Pause;
            this._controlButton.setToggled(false);
            this._controlButton.setTitle(i18nString(UIStrings.pauseTimeline));
            this._controlButton.setGlyph('largeicon-pause-animation');
        }
    }
    /**
     * @return {number}
     */
    _effectivePlaybackRate() {
        return (this._allPaused || (this._selectedGroup && this._selectedGroup.paused())) ? 0 : this._playbackRate;
    }
    /**
     * @param {boolean} pause
     */
    _togglePause(pause) {
        if (this._scrubberPlayer) {
            this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();
        }
        if (this._selectedGroup) {
            this._selectedGroup.togglePause(pause);
            const preview = this._previewMap.get(this._selectedGroup);
            if (preview) {
                preview.element.classList.toggle('paused', pause);
            }
        }
        this._updateControlButton();
    }
    _replay() {
        if (!this._selectedGroup) {
            return;
        }
        this._selectedGroup.seekTo(0);
        this._animateTime(0);
        this._updateControlButton();
    }
    /**
     * @return {number}
     */
    duration() {
        return this._duration;
    }
    /**
     * @param {number} duration
     */
    setDuration(duration) {
        this._duration = duration;
        this.scheduleRedraw();
    }
    _clearTimeline() {
        this._uiAnimations = [];
        this._nodesMap.clear();
        this._animationsMap.clear();
        this._animationsContainer.removeChildren();
        this._duration = this._defaultDuration;
        this._timelineScrubber.classList.add('hidden');
        this._selectedGroup = null;
        if (this._scrubberPlayer) {
            this._scrubberPlayer.cancel();
        }
        delete this._scrubberPlayer;
        this._currentTime.textContent = '';
        this._updateControlButton();
    }
    _reset() {
        this._clearTimeline();
        if (this._allPaused) {
            this._togglePauseAll();
        }
        else {
            this._setPlaybackRate(this._playbackRate);
        }
        for (const group of this._groupBuffer) {
            group.release();
        }
        this._groupBuffer = [];
        this._previewMap.clear();
        this._previewContainer.removeChildren();
        this._popoverHelper.hidePopover();
        this._renderGrid();
    }
    /**
     * @param {!Common.EventTarget.EventTargetEvent} event
     */
    _animationGroupStarted(event) {
        this._addAnimationGroup(/** @type {!AnimationGroup} */ (event.data));
    }
    /**
     * @param {!AnimationGroup} group
     */
    _addAnimationGroup(group) {
        /**
         * @param {!AnimationGroup} left
         * @param {!AnimationGroup} right
         */
        function startTimeComparator(left, right) {
            if (left.startTime() === right.startTime()) {
                return 0;
            }
            return left.startTime() > right.startTime() ? 1 : -1;
        }
        const previewGroup = this._previewMap.get(group);
        if (previewGroup) {
            if (this._selectedGroup === group) {
                this._syncScrubber();
            }
            else {
                previewGroup.replay();
            }
            return;
        }
        this._groupBuffer.sort(startTimeComparator);
        // Discard oldest groups from buffer if necessary
        const groupsToDiscard = [];
        const bufferSize = this.width() / 50;
        while (this._groupBuffer.length > bufferSize) {
            const toDiscard = this._groupBuffer.splice(this._groupBuffer[0] === this._selectedGroup ? 1 : 0, 1);
            groupsToDiscard.push(toDiscard[0]);
        }
        for (const g of groupsToDiscard) {
            const discardGroup = this._previewMap.get(g);
            if (!discardGroup) {
                continue;
            }
            discardGroup.element.remove();
            this._previewMap.delete(g);
            g.release();
        }
        // Generate preview
        const preview = new AnimationGroupPreviewUI(group);
        this._groupBuffer.push(group);
        this._previewMap.set(group, preview);
        this._previewContainer.appendChild(preview.element);
        preview.removeButton().addEventListener('click', this._removeAnimationGroup.bind(this, group));
        preview.element.addEventListener('click', this._selectAnimationGroup.bind(this, group));
        preview.element.addEventListener('keydown', this._handleAnimationGroupKeyDown.bind(this, group));
        UI.ARIAUtils.setAccessibleName(preview.element, i18nString(UIStrings.animationPreviewS, { PH1: this._groupBuffer.indexOf(group) + 1 }));
        UI.ARIAUtils.markAsOption(preview.element);
        if (this._previewMap.size === 1) {
            const preview = this._previewMap.get(this._groupBuffer[0]);
            if (preview) {
                preview.element.tabIndex = 0;
            }
        }
    }
    /**
     * @param {!AnimationGroup} group
     * @param {!KeyboardEvent} event
     */
    _handleAnimationGroupKeyDown(group, event) {
        switch (event.key) {
            case ' ':
            case 'Enter':
                this._selectAnimationGroup(group);
                break;
            case 'Backspace':
            case 'Delete':
                this._removeAnimationGroup(group, event);
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                this._focusNextGroup(group, /* target */ event.target, /* focusPrevious */ true);
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                this._focusNextGroup(group, /* target */ event.target);
        }
    }
    /**
     * @param {!AnimationGroup} group
     * @param {!EventTarget|null} target
     * @param {boolean=} focusPrevious
     */
    _focusNextGroup(group, target, focusPrevious) {
        const currentGroupIndex = this._groupBuffer.indexOf(group);
        const nextIndex = focusPrevious ? currentGroupIndex - 1 : currentGroupIndex + 1;
        if (nextIndex < 0 || nextIndex >= this._groupBuffer.length) {
            return;
        }
        const preview = this._previewMap.get(this._groupBuffer[nextIndex]);
        if (preview) {
            preview.element.tabIndex = 0;
            preview.element.focus();
        }
        if (target) {
            /** @type {!HTMLElement} */ (target).tabIndex = -1;
        }
    }
    /**
     * @param {!AnimationGroup} group
     * @param {!Event} event
     */
    _removeAnimationGroup(group, event) {
        const currentGroupIndex = this._groupBuffer.indexOf(group);
        Platform.ArrayUtilities.removeElement(this._groupBuffer, group);
        const previewGroup = this._previewMap.get(group);
        if (previewGroup) {
            previewGroup.element.remove();
        }
        this._previewMap.delete(group);
        group.release();
        event.consume(true);
        if (this._selectedGroup === group) {
            this._clearTimeline();
            this._renderGrid();
        }
        const groupLength = this._groupBuffer.length;
        if (groupLength === 0) {
            /** @type {!HTMLElement} */ (this._clearButton.element).focus();
            return;
        }
        const nextGroup = currentGroupIndex >= this._groupBuffer.length ?
            this._previewMap.get(this._groupBuffer[this._groupBuffer.length - 1]) :
            this._previewMap.get(this._groupBuffer[currentGroupIndex]);
        if (nextGroup) {
            nextGroup.element.tabIndex = 0;
            nextGroup.element.focus();
        }
    }
    /**
     * @param {!AnimationGroup} group
     */
    _selectAnimationGroup(group) {
        /**
         * @param {!AnimationGroupPreviewUI} ui
         * @param {!AnimationGroup} group
         * @this {!AnimationTimeline}
         */
        function applySelectionClass(ui, group) {
            ui.element.classList.toggle('selected', this._selectedGroup === group);
        }
        if (this._selectedGroup === group) {
            this._togglePause(false);
            this._replay();
            return;
        }
        this._clearTimeline();
        this._selectedGroup = group;
        this._previewMap.forEach(applySelectionClass, this);
        this.setDuration(Math.max(500, group.finiteDuration() + 100));
        for (const anim of group.animations()) {
            this._addAnimation(anim);
        }
        this.scheduleRedraw();
        this._timelineScrubber.classList.remove('hidden');
        this._togglePause(false);
        this._replay();
    }
    /**
     * @param {!AnimationImpl} animation
     */
    _addAnimation(animation) {
        /**
         * @param {?SDK.DOMModel.DOMNode} node
         * @this {AnimationTimeline}
         */
        function nodeResolved(node) {
            uiAnimation.setNode(node);
            if (node && nodeUI) {
                nodeUI.nodeResolved(node);
                nodeUIsByNode.set(node, nodeUI);
            }
        }
        let nodeUI = this._nodesMap.get(animation.source().backendNodeId());
        if (!nodeUI) {
            nodeUI = new NodeUI(animation.source());
            this._animationsContainer.appendChild(nodeUI.element);
            this._nodesMap.set(animation.source().backendNodeId(), nodeUI);
        }
        const nodeRow = nodeUI.createNewRow();
        const uiAnimation = new AnimationUI(animation, this, nodeRow);
        animation.source().deferredNode().resolve(nodeResolved.bind(this));
        this._uiAnimations.push(uiAnimation);
        this._animationsMap.set(animation.id(), animation);
    }
    /**
     * @param {!Common.EventTarget.EventTargetEvent} event
     */
    _nodeRemoved(event) {
        const node = event.data.node;
        const nodeUI = nodeUIsByNode.get(node);
        if (nodeUI) {
            nodeUI.nodeRemoved();
        }
    }
    _renderGrid() {
        /** @const */ const gridSize = 250;
        const gridWidth = (this.width() + 10).toString();
        const gridHeight = ((this._cachedTimelineHeight || 0) + 30).toString();
        this._gridWrapper.style.width = gridWidth + 'px';
        this._gridWrapper.style.height = gridHeight.toString() + 'px';
        this._grid.setAttribute('width', gridWidth);
        this._grid.setAttribute('height', gridHeight.toString());
        this._grid.setAttribute('shape-rendering', 'crispEdges');
        this._grid.removeChildren();
        let lastDraw = undefined;
        for (let time = 0; time < this.duration(); time += gridSize) {
            const line = UI.UIUtils.createSVGChild(this._grid, 'rect', 'animation-timeline-grid-line');
            line.setAttribute('x', (time * this.pixelMsRatio() + 10).toString());
            line.setAttribute('y', '23');
            line.setAttribute('height', '100%');
            line.setAttribute('width', '1');
        }
        for (let time = 0; time < this.duration(); time += gridSize) {
            const gridWidth = time * this.pixelMsRatio();
            if (lastDraw === undefined || gridWidth - lastDraw > 50) {
                lastDraw = gridWidth;
                const label = UI.UIUtils.createSVGChild(this._grid, 'text', 'animation-timeline-grid-label');
                label.textContent = Number.millisToString(time);
                label.setAttribute('x', (gridWidth + 10).toString());
                label.setAttribute('y', '16');
            }
        }
    }
    scheduleRedraw() {
        /** @type {!Array<!AnimationUI>} */
        this._renderQueue = [];
        for (const ui of this._uiAnimations) {
            this._renderQueue.push(ui);
        }
        if (this._redrawing) {
            return;
        }
        this._redrawing = true;
        this._renderGrid();
        this._animationsContainer.window().requestAnimationFrame(this._render.bind(this));
    }
    /**
     * @param {number=} timestamp
     */
    _render(timestamp) {
        while (this._renderQueue.length && (!timestamp || window.performance.now() - timestamp < 50)) {
            const animationUI = this._renderQueue.shift();
            if (animationUI) {
                animationUI.redraw();
            }
        }
        if (this._renderQueue.length) {
            this._animationsContainer.window().requestAnimationFrame(this._render.bind(this));
        }
        else {
            delete this._redrawing;
        }
    }
    /**
     * @override
     */
    onResize() {
        this._cachedTimelineWidth = Math.max(0, this._animationsContainer.offsetWidth - this._timelineControlsWidth) || 0;
        this._cachedTimelineHeight = this._animationsContainer.offsetHeight;
        this.scheduleRedraw();
        if (this._scrubberPlayer) {
            this._syncScrubber();
        }
        delete this._gridOffsetLeft;
    }
    /**
     * @return {number}
     */
    width() {
        return this._cachedTimelineWidth || 0;
    }
    /**
     * @param {!AnimationImpl} animation
     * @return {boolean}
     */
    _resizeWindow(animation) {
        let resized = false;
        // This shows at most 3 iterations
        const duration = animation.source().duration() * Math.min(2, animation.source().iterations());
        const requiredDuration = animation.source().delay() + duration + animation.source().endDelay();
        if (requiredDuration > this._duration) {
            resized = true;
            this._duration = requiredDuration + 200;
        }
        return resized;
    }
    _syncScrubber() {
        if (!this._selectedGroup) {
            return;
        }
        this._selectedGroup.currentTimePromise()
            .then(this._animateTime.bind(this))
            .then(this._updateControlButton.bind(this));
    }
    /**
     * @param {number} currentTime
     */
    _animateTime(currentTime) {
        if (this._scrubberPlayer) {
            this._scrubberPlayer.cancel();
        }
        this._scrubberPlayer = this._timelineScrubber.animate([{ transform: 'translateX(0px)' }, { transform: 'translateX(' + this.width() + 'px)' }], { duration: this.duration(), fill: 'forwards' });
        this._scrubberPlayer.playbackRate = this._effectivePlaybackRate();
        this._scrubberPlayer.onfinish = this._updateControlButton.bind(this);
        this._scrubberPlayer.currentTime = currentTime;
        this.element.window().requestAnimationFrame(this._updateScrubber.bind(this));
    }
    /**
     * @return {number}
     */
    pixelMsRatio() {
        return this.width() / this.duration() || 0;
    }
    /**
     * @param {number} timestamp
     */
    _updateScrubber(timestamp) {
        if (!this._scrubberPlayer) {
            return;
        }
        this._currentTime.textContent = Number.millisToString(this._scrubberPlayer.currentTime || 0);
        if (this._scrubberPlayer.playState.toString() === 'pending' || this._scrubberPlayer.playState === 'running') {
            this.element.window().requestAnimationFrame(this._updateScrubber.bind(this));
        }
        else if (this._scrubberPlayer.playState === 'finished') {
            this._currentTime.textContent = '';
        }
    }
    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _repositionScrubber(event) {
        if (!this._selectedGroup) {
            return false;
        }
        // Seek to current mouse position.
        if (!this._gridOffsetLeft) {
            this._gridOffsetLeft = this._grid.totalOffsetLeft() + 10;
        }
        const { x } = /** @type {*} */ (event);
        const seekTime = Math.max(0, x - this._gridOffsetLeft) / this.pixelMsRatio();
        this._selectedGroup.seekTo(seekTime);
        this._togglePause(true);
        this._animateTime(seekTime);
        // Interface with scrubber drag.
        this._originalScrubberTime = seekTime;
        this._originalMousePosition = x;
        return true;
    }
    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _scrubberDragStart(event) {
        if (!this._scrubberPlayer || !this._selectedGroup) {
            return false;
        }
        this._originalScrubberTime = this._scrubberPlayer.currentTime;
        this._timelineScrubber.classList.remove('animation-timeline-end');
        this._scrubberPlayer.pause();
        const { x } = /** @type {*} */ (event);
        this._originalMousePosition = x;
        this._togglePause(true);
        return true;
    }
    /**
     * @param {!Event} event
     */
    _scrubberDragMove(event) {
        const { x } = /** @type {*} */ (event);
        const delta = x - this._originalMousePosition;
        const currentTime = Math.max(0, Math.min((this._originalScrubberTime || 0) + delta / this.pixelMsRatio(), this.duration()));
        if (this._scrubberPlayer) {
            this._scrubberPlayer.currentTime = currentTime;
        }
        this._currentTime.textContent = Number.millisToString(Math.round(currentTime));
        if (this._selectedGroup) {
            this._selectedGroup.seekTo(currentTime);
        }
    }
    /**
     * @param {!Event} event
     */
    _scrubberDragEnd(event) {
        if (this._scrubberPlayer) {
            const currentTime = Math.max(0, this._scrubberPlayer.currentTime || 0);
            this._scrubberPlayer.play();
            this._scrubberPlayer.currentTime = currentTime;
        }
        this._currentTime.window().requestAnimationFrame(this._updateScrubber.bind(this));
    }
}
export const GlobalPlaybackRates = [1, 0.25, 0.1];
/** @enum {string} */
export const _ControlState = {
    Play: 'play-outline',
    Replay: 'replay-outline',
    Pause: 'pause-outline'
};
export class NodeUI {
    /**
     * @param {!AnimationEffect} animationEffect
     */
    constructor(animationEffect) {
        this.element = document.createElement('div');
        this.element.classList.add('animation-node-row');
        this._description = this.element.createChild('div', 'animation-node-description');
        this._description.tabIndex = 0;
        this._timelineElement = this.element.createChild('div', 'animation-node-timeline');
        UI.ARIAUtils.markAsApplication(this._timelineElement);
    }
    /**
     * @param {?SDK.DOMModel.DOMNode} node
     */
    nodeResolved(node) {
        if (!node) {
            UI.UIUtils.createTextChild(this._description, '<node>');
            return;
        }
        this._node = node;
        this._nodeChanged();
        Common.Linkifier.Linkifier.linkify(node).then(link => this._description.appendChild(link));
        if (!node.ownerDocument) {
            this.nodeRemoved();
        }
    }
    /**
     * @return {!Element}
     */
    createNewRow() {
        return this._timelineElement.createChild('div', 'animation-timeline-row');
    }
    nodeRemoved() {
        this.element.classList.add('animation-node-removed');
        this._node = null;
    }
    _nodeChanged() {
        let animationNodeSelected = false;
        if (this._node) {
            animationNodeSelected = (this._node === UI.Context.Context.instance().flavor(SDK.DOMModel.DOMNode));
        }
        this.element.classList.toggle('animation-node-selected', animationNodeSelected);
    }
}
export class StepTimingFunction {
    /**
     * @param {number} steps
     * @param {string} stepAtPosition
     */
    constructor(steps, stepAtPosition) {
        this.steps = steps;
        this.stepAtPosition = stepAtPosition;
    }
    /**
     * @param {string} text
     * @return {?StepTimingFunction}
     */
    static parse(text) {
        let match = text.match(/^steps\((\d+), (start|middle)\)$/);
        if (match) {
            return new StepTimingFunction(parseInt(match[1], 10), match[2]);
        }
        match = text.match(/^steps\((\d+)\)$/);
        if (match) {
            return new StepTimingFunction(parseInt(match[1], 10), 'end');
        }
        return null;
    }
}
//# sourceMappingURL=AnimationTimeline.js.map