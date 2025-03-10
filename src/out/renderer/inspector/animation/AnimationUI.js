// Copyright (c) 2015 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as InlineEditor from '../inline_editor/inline_editor.js';
import * as UI from '../ui/ui.js';
import { StepTimingFunction } from './AnimationTimeline.js'; // eslint-disable-line no-unused-vars
export const UIStrings = {
    /**
    *@description Title of the first and last points of an animation
    */
    animationEndpointSlider: 'Animation Endpoint slider',
    /**
    *@description Title of an Animation Keyframe point
    */
    animationKeyframeSlider: 'Animation Keyframe slider',
    /**
    *@description Title of an animation keyframe group
    *@example {anilogo} PH1
    */
    sSlider: '{PH1} slider',
};
const str_ = i18n.i18n.registerUIStrings('animation/AnimationUI.js', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class AnimationUI {
    /**
     * @param {!AnimationImpl} animation
     * @param {!AnimationTimeline} timeline
     * @param {!Element} parentElement
     */
    constructor(animation, timeline, parentElement) {
        this._animation = animation;
        this._timeline = timeline;
        this._parentElement = parentElement;
        const keyframesRule = this._animation.source().keyframesRule();
        if (keyframesRule) {
            this._keyframes = keyframesRule.keyframes();
        }
        /** @type {!HTMLElement} */
        this._nameElement = /** @type {!HTMLElement} */ (parentElement.createChild('div', 'animation-name'));
        this._nameElement.textContent = this._animation.name();
        this._svg = UI.UIUtils.createSVGChild(parentElement, 'svg', 'animation-ui');
        this._svg.setAttribute('height', Options.AnimationSVGHeight.toString());
        /** @type {!HTMLElement} */ (this._svg).style.marginLeft = '-' + Options.AnimationMargin + 'px';
        this._svg.addEventListener('contextmenu', this._onContextMenu.bind(this));
        this._activeIntervalGroup = UI.UIUtils.createSVGChild(this._svg, 'g');
        UI.UIUtils.installDragHandle(this._activeIntervalGroup, this._mouseDown.bind(this, Events.AnimationDrag, null), this._mouseMove.bind(this), this._mouseUp.bind(this), '-webkit-grabbing', '-webkit-grab');
        AnimationUI.installDragHandleKeyboard(this._activeIntervalGroup, this._keydownMove.bind(this, Events.AnimationDrag, null));
        /** @type {!Array.<{group: ?HTMLElement, animationLine: ?HTMLElement, keyframePoints: !Object.<number, !HTMLElement>, keyframeRender: !Object.<number, !HTMLElement>}>} */
        this._cachedElements = [];
        this._movementInMs = 0;
        this._keyboardMovementRateMs = 50;
        this._color = AnimationUI.Color(this._animation);
    }
    /**
     * @param {!AnimationImpl} animation
     * @return {string}
     */
    static Color(animation) {
        const names = Array.from(Colors.keys());
        const hashCode = String.hashCode(animation.name() || animation.id());
        const cappedHashCode = hashCode % names.length;
        const colorName = names[cappedHashCode];
        const color = Colors.get(colorName);
        if (!color) {
            throw new Error('Unable to locate color');
        }
        return color.asString(Common.Color.Format.RGB) || '';
    }
    /**
     * @param {!Element} element
     * @param {function(!Event):void} elementDrag
     */
    static installDragHandleKeyboard(element, elementDrag) {
        element.addEventListener('keydown', elementDrag, false);
    }
    /**
     * @return {!AnimationImpl}
     */
    animation() {
        return this._animation;
    }
    /**
     * @param {?SDK.DOMModel.DOMNode} node
     */
    setNode(node) {
        this._node = node;
    }
    /**
     * @param {!HTMLElement} parentElement
     * @param {string} className
     */
    _createLine(parentElement, className) {
        const line = UI.UIUtils.createSVGChild(parentElement, 'line', className);
        line.setAttribute('x1', Options.AnimationMargin.toString());
        line.setAttribute('y1', Options.AnimationHeight.toString());
        line.setAttribute('y2', Options.AnimationHeight.toString());
        /** @type {!HTMLElement} */ (line).style.stroke = this._color;
        return line;
    }
    /**
     * @param {number} iteration
     * @param {!HTMLElement} parentElement
     */
    _drawAnimationLine(iteration, parentElement) {
        const cache = this._cachedElements[iteration];
        if (!cache.animationLine) {
            cache.animationLine = /** @type {!HTMLElement} */ (this._createLine(parentElement, 'animation-line'));
        }
        if (!cache.animationLine) {
            return;
        }
        cache.animationLine.setAttribute('x2', (this._duration() * this._timeline.pixelMsRatio() + Options.AnimationMargin).toFixed(2));
    }
    /**
     * @param {!HTMLElement} parentElement
     */
    _drawDelayLine(parentElement) {
        if (!this._delayLine || !this._endDelayLine) {
            this._delayLine = this._createLine(parentElement, 'animation-delay-line');
            this._endDelayLine = this._createLine(parentElement, 'animation-delay-line');
        }
        const fill = this._animation.source().fill();
        this._delayLine.classList.toggle('animation-fill', fill === 'backwards' || fill === 'both');
        const margin = Options.AnimationMargin;
        this._delayLine.setAttribute('x1', margin.toString());
        this._delayLine.setAttribute('x2', (this._delay() * this._timeline.pixelMsRatio() + margin).toFixed(2));
        const forwardsFill = fill === 'forwards' || fill === 'both';
        this._endDelayLine.classList.toggle('animation-fill', forwardsFill);
        const leftMargin = Math.min(this._timeline.width(), (this._delay() + this._duration() * this._animation.source().iterations()) * this._timeline.pixelMsRatio());
        /** @type {!HTMLElement} */ (this._endDelayLine).style.transform = 'translateX(' + leftMargin.toFixed(2) + 'px)';
        this._endDelayLine.setAttribute('x1', margin.toString());
        this._endDelayLine.setAttribute('x2', forwardsFill ? (this._timeline.width() - leftMargin + margin).toFixed(2) :
            (this._animation.source().endDelay() * this._timeline.pixelMsRatio() + margin).toFixed(2));
    }
    /**
     * @param {number} iteration
     * @param {!Element} parentElement
     * @param {number} x
     * @param {number} keyframeIndex
     * @param {boolean} attachEvents
     */
    _drawPoint(iteration, parentElement, x, keyframeIndex, attachEvents) {
        if (this._cachedElements[iteration].keyframePoints[keyframeIndex]) {
            this._cachedElements[iteration].keyframePoints[keyframeIndex].setAttribute('cx', x.toFixed(2));
            return;
        }
        /** @type {!HTMLElement} */
        const circle = /** @type {!HTMLElement} */ (UI.UIUtils.createSVGChild(parentElement, 'circle', keyframeIndex <= 0 ? 'animation-endpoint' : 'animation-keyframe-point'));
        circle.setAttribute('cx', x.toFixed(2));
        circle.setAttribute('cy', Options.AnimationHeight.toString());
        circle.style.stroke = this._color;
        circle.setAttribute('r', (Options.AnimationMargin / 2).toString());
        circle.tabIndex = 0;
        UI.ARIAUtils.setAccessibleName(circle, keyframeIndex <= 0 ? i18nString(UIStrings.animationEndpointSlider) :
            i18nString(UIStrings.animationKeyframeSlider));
        if (keyframeIndex <= 0) {
            circle.style.fill = this._color;
        }
        this._cachedElements[iteration].keyframePoints[keyframeIndex] = /** @type {!HTMLElement} */ (circle);
        if (!attachEvents) {
            return;
        }
        /** @type {string} */
        let eventType;
        if (keyframeIndex === 0) {
            eventType = Events.StartEndpointMove;
        }
        else if (keyframeIndex === -1) {
            eventType = Events.FinishEndpointMove;
        }
        else {
            eventType = Events.KeyframeMove;
        }
        UI.UIUtils.installDragHandle(circle, this._mouseDown.bind(this, eventType, keyframeIndex), this._mouseMove.bind(this), this._mouseUp.bind(this), 'ew-resize');
        AnimationUI.installDragHandleKeyboard(circle, this._keydownMove.bind(this, eventType, keyframeIndex));
    }
    /**
     * @param {number} iteration
     * @param {number} keyframeIndex
     * @param {!HTMLElement} parentElement
     * @param {number} leftDistance
     * @param {number} width
     * @param {string} easing
     */
    _renderKeyframe(iteration, keyframeIndex, parentElement, leftDistance, width, easing) {
        /**
         * @param {!HTMLElement} parentElement
         * @param {number} x
         * @param {string} strokeColor
         */
        function createStepLine(parentElement, x, strokeColor) {
            /** @type {!HTMLElement} */
            const line = /** @type {!HTMLElement} */ (UI.UIUtils.createSVGChild(parentElement, 'line'));
            line.setAttribute('x1', x.toString());
            line.setAttribute('x2', x.toString());
            line.setAttribute('y1', Options.AnimationMargin.toString());
            line.setAttribute('y2', Options.AnimationHeight.toString());
            line.style.stroke = strokeColor;
        }
        const bezier = UI.Geometry.CubicBezier.parse(easing);
        const cache = this._cachedElements[iteration].keyframeRender;
        if (!cache[keyframeIndex]) {
            const svg = bezier ? UI.UIUtils.createSVGChild(parentElement, 'path', 'animation-keyframe') :
                UI.UIUtils.createSVGChild(parentElement, 'g', 'animation-keyframe-step');
            cache[keyframeIndex] = /** @type {!HTMLElement} */ (svg);
        }
        const group = cache[keyframeIndex];
        group.tabIndex = 0;
        UI.ARIAUtils.setAccessibleName(group, i18nString(UIStrings.sSlider, { PH1: this._animation.name() }));
        group.style.transform = 'translateX(' + leftDistance.toFixed(2) + 'px)';
        if (easing === 'linear') {
            group.style.fill = this._color;
            const height = InlineEditor.BezierUI.Height;
            group.setAttribute('d', ['M', 0, height, 'L', 0, 5, 'L', width.toFixed(2), 5, 'L', width.toFixed(2), height, 'Z'].join(' '));
        }
        else if (bezier) {
            group.style.fill = this._color;
            InlineEditor.BezierUI.BezierUI.drawVelocityChart(bezier, group, width);
        }
        else {
            const stepFunction = StepTimingFunction.parse(easing);
            group.removeChildren();
            /**  @type {!Object.<string, number>} */
            const offsetMap = { 'start': 0, 'middle': 0.5, 'end': 1 };
            if (stepFunction) {
                const offsetWeight = offsetMap[stepFunction.stepAtPosition];
                for (let i = 0; i < stepFunction.steps; i++) {
                    createStepLine(group, (i + offsetWeight) * width / stepFunction.steps, this._color);
                }
            }
        }
    }
    redraw() {
        const maxWidth = this._timeline.width() - Options.AnimationMargin;
        this._svg.setAttribute('width', (maxWidth + 2 * Options.AnimationMargin).toFixed(2));
        /** @type {!HTMLElement} */ (this._activeIntervalGroup).style.transform =
            'translateX(' + (this._delay() * this._timeline.pixelMsRatio()).toFixed(2) + 'px)';
        this._nameElement.style.transform =
            'translateX(' + (this._delay() * this._timeline.pixelMsRatio() + Options.AnimationMargin).toFixed(2) + 'px)';
        this._nameElement.style.width = (this._duration() * this._timeline.pixelMsRatio()).toFixed(2) + 'px';
        this._drawDelayLine(/** @type {!HTMLElement} */ (this._svg));
        if (this._animation.type() === 'CSSTransition') {
            this._renderTransition();
            return;
        }
        this._renderIteration(this._activeIntervalGroup, 0);
        if (!this._tailGroup) {
            this._tailGroup = UI.UIUtils.createSVGChild(this._activeIntervalGroup, 'g', 'animation-tail-iterations');
        }
        const iterationWidth = this._duration() * this._timeline.pixelMsRatio();
        let iteration;
        for (iteration = 1; iteration < this._animation.source().iterations() && iterationWidth * (iteration - 1) < this._timeline.width(); iteration++) {
            this._renderIteration(this._tailGroup, iteration);
        }
        while (iteration < this._cachedElements.length) {
            const poppedElement = this._cachedElements.pop();
            if (poppedElement && poppedElement.group) {
                poppedElement.group.remove();
            }
        }
    }
    _renderTransition() {
        const activeIntervalGroup = /** @type {!HTMLElement} */ (this._activeIntervalGroup);
        if (!this._cachedElements[0]) {
            this._cachedElements[0] = { animationLine: null, keyframePoints: {}, keyframeRender: {}, group: null };
        }
        this._drawAnimationLine(0, activeIntervalGroup);
        this._renderKeyframe(0, 0, activeIntervalGroup, Options.AnimationMargin, this._duration() * this._timeline.pixelMsRatio(), this._animation.source().easing());
        this._drawPoint(0, activeIntervalGroup, Options.AnimationMargin, 0, true);
        this._drawPoint(0, activeIntervalGroup, this._duration() * this._timeline.pixelMsRatio() + Options.AnimationMargin, -1, true);
    }
    /**
     * @param {!Element} parentElement
     * @param {number} iteration
     */
    _renderIteration(parentElement, iteration) {
        if (!this._cachedElements[iteration]) {
            this._cachedElements[iteration] = {
                animationLine: null,
                keyframePoints: {},
                keyframeRender: {},
                group: /** @type {!HTMLElement} */ (UI.UIUtils.createSVGChild(parentElement, 'g'))
            };
        }
        const group = this._cachedElements[iteration].group;
        if (!group) {
            return;
        }
        group.style.transform =
            'translateX(' + (iteration * this._duration() * this._timeline.pixelMsRatio()).toFixed(2) + 'px)';
        this._drawAnimationLine(iteration, group);
        if (this._keyframes && this._keyframes.length > 1) {
            for (let i = 0; i < this._keyframes.length - 1; i++) {
                const leftDistance = this._offset(i) * this._duration() * this._timeline.pixelMsRatio() + Options.AnimationMargin;
                const width = this._duration() * (this._offset(i + 1) - this._offset(i)) * this._timeline.pixelMsRatio();
                this._renderKeyframe(iteration, i, group, leftDistance, width, this._keyframes[i].easing());
                if (i || (!i && iteration === 0)) {
                    this._drawPoint(iteration, group, leftDistance, i, iteration === 0);
                }
            }
        }
        this._drawPoint(iteration, group, this._duration() * this._timeline.pixelMsRatio() + Options.AnimationMargin, -1, iteration === 0);
    }
    /**
     * @return {number}
     */
    _delay() {
        let delay = this._animation.source().delay();
        if (this._mouseEventType === Events.AnimationDrag || this._mouseEventType === Events.StartEndpointMove) {
            delay += this._movementInMs;
        }
        // FIXME: add support for negative start delay
        return Math.max(0, delay);
    }
    /**
     * @return {number}
     */
    _duration() {
        let duration = this._animation.source().duration();
        if (this._mouseEventType === Events.FinishEndpointMove) {
            duration += this._movementInMs;
        }
        else if (this._mouseEventType === Events.StartEndpointMove) {
            duration -= Math.max(this._movementInMs, -this._animation.source().delay());
            // Cannot have negative delay
        }
        return Math.max(0, duration);
    }
    /**
     * @param {number} i
     * @return {number} offset
     */
    _offset(i) {
        if (!this._keyframes) {
            throw new Error('Unable to calculate offset; keyframes do not exist');
        }
        let offset = this._keyframes[i].offsetAsNumber();
        if (this._mouseEventType === Events.KeyframeMove && i === this._keyframeMoved) {
            console.assert(i > 0 && i < this._keyframes.length - 1, 'First and last keyframe cannot be moved');
            offset += this._movementInMs / this._animation.source().duration();
            offset = Math.max(offset, this._keyframes[i - 1].offsetAsNumber());
            offset = Math.min(offset, this._keyframes[i + 1].offsetAsNumber());
        }
        return offset;
    }
    /**
     * @param {!Events} mouseEventType
     * @param {?number} keyframeIndex
     * @param {!Event} event
     */
    _mouseDown(mouseEventType, keyframeIndex, event) {
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        if (mouseEvent.buttons === 2) {
            return false;
        }
        if (this._svg.enclosingNodeOrSelfWithClass('animation-node-removed')) {
            return false;
        }
        this._mouseEventType = mouseEventType;
        this._keyframeMoved = keyframeIndex;
        this._downMouseX = mouseEvent.clientX;
        event.consume(true);
        if (this._node) {
            Common.Revealer.reveal(this._node);
        }
        return true;
    }
    /**
     * @param {!Event} event
     */
    _mouseMove(event) {
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        this._setMovementAndRedraw((mouseEvent.clientX - (this._downMouseX || 0)) / this._timeline.pixelMsRatio());
    }
    /**
     * @param {number} movement
     */
    _setMovementAndRedraw(movement) {
        this._movementInMs = movement;
        if (this._delay() + this._duration() > this._timeline.duration() * 0.8) {
            this._timeline.setDuration(this._timeline.duration() * 1.2);
        }
        this.redraw();
    }
    /**
     * @param {!Event} event
     */
    _mouseUp(event) {
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        this._movementInMs = (mouseEvent.clientX - (this._downMouseX || 0)) / this._timeline.pixelMsRatio();
        // Commit changes
        if (this._mouseEventType === Events.KeyframeMove) {
            if (this._keyframes && this._keyframeMoved !== null && typeof this._keyframeMoved !== 'undefined') {
                this._keyframes[this._keyframeMoved].setOffset(this._offset(this._keyframeMoved));
            }
        }
        else {
            this._animation.setTiming(this._duration(), this._delay());
        }
        this._movementInMs = 0;
        this.redraw();
        delete this._mouseEventType;
        delete this._downMouseX;
        delete this._keyframeMoved;
    }
    /**
     * @param {!Events} mouseEventType
     * @param {?number} keyframeIndex
     * @param {!Event} event
     */
    _keydownMove(mouseEventType, keyframeIndex, event) {
        const keyboardEvent = /** @type {!KeyboardEvent} */ (event);
        this._mouseEventType = mouseEventType;
        this._keyframeMoved = keyframeIndex;
        switch (keyboardEvent.key) {
            case 'ArrowLeft':
            case 'ArrowUp':
                this._movementInMs = -this._keyboardMovementRateMs;
                break;
            case 'ArrowRight':
            case 'ArrowDown':
                this._movementInMs = this._keyboardMovementRateMs;
                break;
            default:
                return;
        }
        if (this._mouseEventType === Events.KeyframeMove) {
            if (this._keyframes && this._keyframeMoved !== null) {
                this._keyframes[this._keyframeMoved].setOffset(this._offset(this._keyframeMoved));
            }
        }
        else {
            this._animation.setTiming(this._duration(), this._delay());
        }
        this._setMovementAndRedraw(0);
        delete this._mouseEventType;
        delete this._keyframeMoved;
        event.consume(true);
    }
    /**
     * @param {!Event} event
     */
    _onContextMenu(event) {
        /**
         * @param {?SDK.RemoteObject.RemoteObject} remoteObject
         */
        function showContextMenu(remoteObject) {
            if (!remoteObject) {
                return;
            }
            const contextMenu = new UI.ContextMenu.ContextMenu(event);
            contextMenu.appendApplicableItems(remoteObject);
            contextMenu.show();
        }
        this._animation.remoteObjectPromise().then(showContextMenu);
        event.consume(true);
    }
}
/**
 * @enum {string}
 */
export const Events = {
    AnimationDrag: 'AnimationDrag',
    KeyframeMove: 'KeyframeMove',
    StartEndpointMove: 'StartEndpointMove',
    FinishEndpointMove: 'FinishEndpointMove'
};
export const Options = {
    AnimationHeight: 26,
    AnimationSVGHeight: 50,
    AnimationMargin: 7,
    EndpointsClickRegionSize: 10,
    GridCanvasHeight: 40
};
/** @type {!Map<string, ?Common.Color.Color>} */
export const Colors = new Map([
    ['Purple', Common.Color.Color.parse('#9C27B0')], ['Light Blue', Common.Color.Color.parse('#03A9F4')],
    ['Deep Orange', Common.Color.Color.parse('#FF5722')], ['Blue', Common.Color.Color.parse('#5677FC')],
    ['Lime', Common.Color.Color.parse('#CDDC39')], ['Blue Grey', Common.Color.Color.parse('#607D8B')],
    ['Pink', Common.Color.Color.parse('#E91E63')], ['Green', Common.Color.Color.parse('#0F9D58')],
    ['Brown', Common.Color.Color.parse('#795548')], ['Cyan', Common.Color.Color.parse('#00BCD4')]
]);
//# sourceMappingURL=AnimationUI.js.map