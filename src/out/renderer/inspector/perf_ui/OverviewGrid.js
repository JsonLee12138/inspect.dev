/*
 * Copyright (C) 2013 Google Inc. All rights reserved.
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
import * as Platform from '../platform/platform.js';
import * as UI from '../ui/ui.js';
import { TimelineGrid } from './TimelineGrid.js'; // eslint-disable-line no-unused-vars
export class OverviewGrid {
    /**
     * @param {string} prefix
     * @param {!Calculator=} calculator
     */
    constructor(prefix, calculator) {
        this.element = document.createElement('div');
        this.element.id = prefix + '-overview-container';
        this._grid = new TimelineGrid();
        this._grid.element.id = prefix + '-overview-grid';
        this._grid.setScrollTop(0);
        this.element.appendChild(this._grid.element);
        this._window = new Window(this.element, this._grid.dividersLabelBarElement, calculator);
    }
    /**
     * @return {number}
     */
    clientWidth() {
        return this.element.clientWidth;
    }
    /**
     * @param {!Calculator} calculator
     */
    updateDividers(calculator) {
        this._grid.updateDividers(calculator);
    }
    /**
     * @param {!Array.<!Element>} dividers
     */
    addEventDividers(dividers) {
        this._grid.addEventDividers(dividers);
    }
    removeEventDividers() {
        this._grid.removeEventDividers();
    }
    reset() {
        this._window.reset();
    }
    /**
     * @return {number}
     */
    windowLeft() {
        return this._window.windowLeft || 0;
    }
    /**
     * @return {number}
     */
    windowRight() {
        return this._window.windowRight || 0;
    }
    /**
     * @param {number} left
     * @param {number} right
     */
    setWindow(left, right) {
        this._window._setWindow(left, right);
    }
    /**
     * @param {symbol} eventType
     * @param {function(!Common.EventTarget.EventTargetEvent):void} listener
     * @param {!Object=} thisObject
     * @return {!Common.EventTarget.EventDescriptor}
     */
    addEventListener(eventType, listener, thisObject) {
        return this._window.addEventListener(eventType, listener, thisObject);
    }
    /**
     * @param {?function(!Event):boolean} clickHandler
     */
    setClickHandler(clickHandler) {
        this._window.setClickHandler(clickHandler);
    }
    /**
     * @param {number} zoomFactor
     * @param {number} referencePoint
     */
    zoom(zoomFactor, referencePoint) {
        this._window._zoom(zoomFactor, referencePoint);
    }
    /**
     * @param {boolean} enabled
     */
    setResizeEnabled(enabled) {
        this._window.setEnabled(enabled);
    }
}
export const MinSelectableSize = 14;
export const WindowScrollSpeedFactor = .3;
export const ResizerOffset = 3.5; // half pixel because offset values are not rounded but ceiled
export const OffsetFromWindowEnds = 10;
export class Window extends Common.ObjectWrapper.ObjectWrapper {
    /**
     * @param {!Element} parentElement
     * @param {!Element=} dividersLabelBarElement
     * @param {!Calculator=} calculator
     */
    constructor(parentElement, dividersLabelBarElement, calculator) {
        super();
        this._parentElement = parentElement;
        UI.ARIAUtils.markAsGroup(this._parentElement);
        this._calculator = calculator;
        UI.ARIAUtils.setAccessibleName(this._parentElement, ls `Overview grid window`);
        UI.UIUtils.installDragHandle(this._parentElement, this._startWindowSelectorDragging.bind(this), this._windowSelectorDragging.bind(this), this._endWindowSelectorDragging.bind(this), 'text', null);
        if (dividersLabelBarElement) {
            UI.UIUtils.installDragHandle(dividersLabelBarElement, this._startWindowDragging.bind(this), this._windowDragging.bind(this), null, '-webkit-grabbing', '-webkit-grab');
        }
        this._parentElement.addEventListener('wheel', this._onMouseWheel.bind(this), true);
        this._parentElement.addEventListener('dblclick', this._resizeWindowMaximum.bind(this), true);
        UI.Utils.appendStyle(this._parentElement, 'perf_ui/overviewGrid.css', { enableLegacyPatching: true });
        /** @type {!HTMLElement} */
        this._leftResizeElement =
            /** @type {!HTMLElement} */ (parentElement.createChild('div', 'overview-grid-window-resizer'));
        UI.UIUtils.installDragHandle(this._leftResizeElement, this._resizerElementStartDragging.bind(this), this._leftResizeElementDragging.bind(this), null, 'ew-resize');
        /** @type {!HTMLElement} */
        this._rightResizeElement =
            /** @type {!HTMLElement} */ (parentElement.createChild('div', 'overview-grid-window-resizer'));
        UI.UIUtils.installDragHandle(this._rightResizeElement, this._resizerElementStartDragging.bind(this), this._rightResizeElementDragging.bind(this), null, 'ew-resize');
        UI.ARIAUtils.setAccessibleName(this._leftResizeElement, ls `Left Resizer`);
        UI.ARIAUtils.markAsSlider(this._leftResizeElement);
        /**
         * @param {!Event} event
         */
        const leftKeyDown = event => this._handleKeyboardResizing(event, false);
        this._leftResizeElement.addEventListener('keydown', leftKeyDown);
        UI.ARIAUtils.setAccessibleName(this._rightResizeElement, ls `Right Resizer`);
        UI.ARIAUtils.markAsSlider(this._rightResizeElement);
        /**
         * @param {!Event} event
         */
        const rightKeyDown = event => this._handleKeyboardResizing(event, true);
        this._rightResizeElement.addEventListener('keydown', rightKeyDown);
        this._rightResizeElement.addEventListener('focus', this._onRightResizeElementFocused.bind(this));
        /** @type {!HTMLElement} */
        this._leftCurtainElement = /** @type {!HTMLElement} */ (parentElement.createChild('div', 'window-curtain-left'));
        /** @type {!HTMLElement} */
        this._rightCurtainElement = /** @type {!HTMLElement} */ (parentElement.createChild('div', 'window-curtain-right'));
        this.reset();
        /** @type {!WindowSelector|undefined} */
        this._overviewWindowSelector;
        /** @type {number} */
        this._offsetLeft;
        /** @type {number} */
        this._dragStartPoint;
        /** @type {number} */
        this._dragStartLeft;
        /** @type {number} */
        this._dragStartRight;
    }
    _onRightResizeElementFocused() {
        // To prevent browser focus from scrolling the element into view and shifting the contents of the strip
        this._parentElement.scrollLeft = 0;
    }
    reset() {
        this.windowLeft = 0.0;
        this.windowRight = 1.0;
        this.setEnabled(true);
        this._updateCurtains();
    }
    /**
     * @param {boolean} enabled
     */
    setEnabled(enabled) {
        this._enabled = enabled;
        this._rightResizeElement.tabIndex = enabled ? 0 : -1;
        this._leftResizeElement.tabIndex = enabled ? 0 : -1;
    }
    /**
     * @param {?function(!Event):boolean} clickHandler
     */
    setClickHandler(clickHandler) {
        this._clickHandler = clickHandler;
    }
    /**
     * @param {!Event} event
     */
    _resizerElementStartDragging(event) {
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        const target = /** @type {!HTMLElement} */ (event.target);
        if (!this._enabled) {
            return false;
        }
        this._resizerParentOffsetLeft = mouseEvent.pageX - mouseEvent.offsetX - target.offsetLeft;
        event.stopPropagation();
        return true;
    }
    /**
     * @param {!Event} event
     */
    _leftResizeElementDragging(event) {
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        this._resizeWindowLeft(mouseEvent.pageX - (this._resizerParentOffsetLeft || 0));
        event.preventDefault();
    }
    /**
     * @param {!Event} event
     */
    _rightResizeElementDragging(event) {
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        this._resizeWindowRight(mouseEvent.pageX - (this._resizerParentOffsetLeft || 0));
        event.preventDefault();
    }
    /**
     * @param {!Event} event
     * @param {boolean=} moveRightResizer
     */
    _handleKeyboardResizing(event, moveRightResizer) {
        const keyboardEvent = /** @type {!KeyboardEvent} */ (event);
        const target = /** @type {!HTMLElement} */ (event.target);
        let increment = false;
        if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'ArrowRight') {
            if (keyboardEvent.key === 'ArrowRight') {
                increment = true;
            }
            const newPos = this._getNewResizerPosition(target.offsetLeft, increment, keyboardEvent.ctrlKey);
            if (moveRightResizer) {
                this._resizeWindowRight(newPos);
            }
            else {
                this._resizeWindowLeft(newPos);
            }
            event.consume(true);
        }
    }
    /**
     * @param {number} offset
     * @param {boolean=} increment
     * @param {boolean=} ctrlPressed
     * @return {number}
     */
    _getNewResizerPosition(offset, increment, ctrlPressed) {
        let newPos;
        // We shift by 10px if the ctrlKey is pressed and 2 otherwise.  1px shifts result in noOp due to rounding in _updateCurtains
        let pixelsToShift = ctrlPressed ? 10 : 2;
        pixelsToShift = increment ? pixelsToShift : -Math.abs(pixelsToShift);
        const offsetLeft = offset + ResizerOffset;
        newPos = offsetLeft + pixelsToShift;
        if (increment && newPos < OffsetFromWindowEnds) {
            // When incrementing, snap to the window offset value (10px) if the new position is between 0px and 10px
            newPos = OffsetFromWindowEnds;
        }
        else if (!increment && newPos > this._parentElement.clientWidth - OffsetFromWindowEnds) {
            // When decrementing, snap to the window offset value (10px) from the rightmost side if the new position is within 10px from the end.
            newPos = this._parentElement.clientWidth - OffsetFromWindowEnds;
        }
        return newPos;
    }
    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _startWindowSelectorDragging(event) {
        if (!this._enabled) {
            return false;
        }
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        this._offsetLeft = this._parentElement.totalOffsetLeft();
        const position = mouseEvent.x - this._offsetLeft;
        this._overviewWindowSelector = new WindowSelector(this._parentElement, position);
        return true;
    }
    /**
     * @param {!Event} event
     */
    _windowSelectorDragging(event) {
        if (!this._overviewWindowSelector) {
            return;
        }
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        this._overviewWindowSelector._updatePosition(mouseEvent.x - this._offsetLeft);
        event.preventDefault();
    }
    /**
     * @param {!Event} event
     */
    _endWindowSelectorDragging(event) {
        if (!this._overviewWindowSelector) {
            return;
        }
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        const window = this._overviewWindowSelector._close(mouseEvent.x - this._offsetLeft);
        delete this._overviewWindowSelector;
        const clickThreshold = 3;
        if (window.end - window.start < clickThreshold) {
            if (this._clickHandler && this._clickHandler.call(null, event)) {
                return;
            }
            const middle = window.end;
            window.start = Math.max(0, middle - MinSelectableSize / 2);
            window.end = Math.min(this._parentElement.clientWidth, middle + MinSelectableSize / 2);
        }
        else if (window.end - window.start < MinSelectableSize) {
            if (this._parentElement.clientWidth - window.end > MinSelectableSize) {
                window.end = window.start + MinSelectableSize;
            }
            else {
                window.start = window.end - MinSelectableSize;
            }
        }
        this._setWindowPosition(window.start, window.end);
    }
    /**
     * @param {!Event} event
     * @return {boolean}
     */
    _startWindowDragging(event) {
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        this._dragStartPoint = mouseEvent.pageX;
        this._dragStartLeft = this.windowLeft || 0;
        this._dragStartRight = this.windowRight || 0;
        event.stopPropagation();
        return true;
    }
    /**
     * @param {!Event} event
     */
    _windowDragging(event) {
        const mouseEvent = /** @type {!MouseEvent} */ (event);
        mouseEvent.preventDefault();
        let delta = (mouseEvent.pageX - this._dragStartPoint) / this._parentElement.clientWidth;
        if (this._dragStartLeft + delta < 0) {
            delta = -this._dragStartLeft;
        }
        if (this._dragStartRight + delta > 1) {
            delta = 1 - this._dragStartRight;
        }
        this._setWindow(this._dragStartLeft + delta, this._dragStartRight + delta);
    }
    /**
     * @param {number} start
     */
    _resizeWindowLeft(start) {
        // Glue to edge.
        if (start < OffsetFromWindowEnds) {
            start = 0;
        }
        else if (start > this._rightResizeElement.offsetLeft - 4) {
            start = this._rightResizeElement.offsetLeft - 4;
        }
        this._setWindowPosition(start, null);
    }
    /**
     * @param {number} end
     */
    _resizeWindowRight(end) {
        // Glue to edge.
        if (end > this._parentElement.clientWidth - OffsetFromWindowEnds) {
            end = this._parentElement.clientWidth;
        }
        else if (end < this._leftResizeElement.offsetLeft + MinSelectableSize) {
            end = this._leftResizeElement.offsetLeft + MinSelectableSize;
        }
        this._setWindowPosition(null, end);
    }
    _resizeWindowMaximum() {
        this._setWindowPosition(0, this._parentElement.clientWidth);
    }
    /**
     * @param {boolean=} leftSlider
     * @return {number}
     */
    _getRawSliderValue(leftSlider) {
        if (!this._calculator) {
            throw new Error('No calculator to calculate boundaries');
        }
        const minimumValue = this._calculator.minimumBoundary();
        const valueSpan = this._calculator.maximumBoundary() - minimumValue;
        if (leftSlider) {
            return minimumValue + valueSpan * (this.windowLeft || 0);
        }
        return minimumValue + valueSpan * (this.windowRight || 0);
    }
    /**
     * @param {number} leftValue
     * @param {number} rightValue
     */
    _updateResizeElementPositionValue(leftValue, rightValue) {
        const roundedLeftValue = leftValue.toFixed(2);
        const roundedRightValue = rightValue.toFixed(2);
        UI.ARIAUtils.setAriaValueNow(this._leftResizeElement, roundedLeftValue);
        UI.ARIAUtils.setAriaValueNow(this._rightResizeElement, roundedRightValue);
        // Left and right sliders cannot be within 0.5% of each other (Range of AriaValueMin/Max/Now is from 0-100).
        const leftResizeCeiling = Number(roundedRightValue) - 0.5;
        const rightResizeFloor = Number(roundedLeftValue) + 0.5;
        UI.ARIAUtils.setAriaValueMinMax(this._leftResizeElement, '0', leftResizeCeiling.toString());
        UI.ARIAUtils.setAriaValueMinMax(this._rightResizeElement, rightResizeFloor.toString(), '100');
    }
    _updateResizeElementPositionLabels() {
        if (!this._calculator) {
            return;
        }
        const startValue = this._calculator.formatValue(this._getRawSliderValue(/* leftSlider */ true));
        const endValue = this._calculator.formatValue(this._getRawSliderValue(/* leftSlider */ false));
        UI.ARIAUtils.setAriaValueText(this._leftResizeElement, String(startValue));
        UI.ARIAUtils.setAriaValueText(this._rightResizeElement, String(endValue));
    }
    /**
     * @param {string} leftValue
     * @param {string} rightValue
     */
    _updateResizeElementPercentageLabels(leftValue, rightValue) {
        UI.ARIAUtils.setAriaValueText(this._leftResizeElement, leftValue);
        UI.ARIAUtils.setAriaValueText(this._rightResizeElement, rightValue);
    }
    /**
     * @return {{rawStartValue: number, rawEndValue: number}}
     */
    _calculateWindowPosition() {
        return {
            rawStartValue: Number(this._getRawSliderValue(/* leftSlider */ true)),
            rawEndValue: Number(this._getRawSliderValue(/* leftSlider */ false))
        };
    }
    /**
     * @param {number} windowLeft
     * @param {number} windowRight
     */
    _setWindow(windowLeft, windowRight) {
        this.windowLeft = windowLeft;
        this.windowRight = windowRight;
        this._updateCurtains();
        let windowPosition;
        if (this._calculator) {
            windowPosition = this._calculateWindowPosition();
        }
        this.dispatchEventToListeners(Events.WindowChanged, windowPosition);
    }
    _updateCurtains() {
        const windowLeft = this.windowLeft || 0;
        const windowRight = this.windowRight || 0;
        let left = windowLeft;
        let right = windowRight;
        const width = right - left;
        // OverviewGrids that are instantiated before the parentElement is shown will have a parent element client width of 0 which throws off the 'factor' calculation
        if (this._parentElement.clientWidth !== 0) {
            // We allow actual time window to be arbitrarily small but don't want the UI window to be too small.
            const widthInPixels = width * this._parentElement.clientWidth;
            const minWidthInPixels = MinSelectableSize / 2;
            if (widthInPixels < minWidthInPixels) {
                const factor = minWidthInPixels / widthInPixels;
                left = ((windowRight + windowLeft) - width * factor) / 2;
                right = ((windowRight + windowLeft) + width * factor) / 2;
            }
        }
        const leftResizerPercLeftOffset = (100 * left);
        const rightResizerPercLeftOffset = (100 * right);
        const rightResizerPercRightOffset = (100 - (100 * right));
        const leftResizerPercLeftOffsetString = leftResizerPercLeftOffset + '%';
        const rightResizerPercLeftOffsetString = rightResizerPercLeftOffset + '%';
        this._leftResizeElement.style.left = leftResizerPercLeftOffsetString;
        this._rightResizeElement.style.left = rightResizerPercLeftOffsetString;
        this._leftCurtainElement.style.width = leftResizerPercLeftOffsetString;
        this._rightCurtainElement.style.width = rightResizerPercRightOffset + '%';
        this._updateResizeElementPositionValue(leftResizerPercLeftOffset, rightResizerPercLeftOffset);
        if (this._calculator) {
            this._updateResizeElementPositionLabels();
        }
        else {
            this._updateResizeElementPercentageLabels(leftResizerPercLeftOffsetString, rightResizerPercLeftOffsetString);
        }
    }
    /**
     * @param {?number} start
     * @param {?number} end
     */
    _setWindowPosition(start, end) {
        const clientWidth = this._parentElement.clientWidth;
        const windowLeft = typeof start === 'number' ? start / clientWidth : this.windowLeft;
        const windowRight = typeof end === 'number' ? end / clientWidth : this.windowRight;
        this._setWindow(windowLeft || 0, windowRight || 0);
    }
    /**
     * @param {!Event} event
     */
    _onMouseWheel(event) {
        const wheelEvent = /** @type {!WheelEvent} */ (event);
        if (!this._enabled) {
            return;
        }
        if (wheelEvent.deltaY) {
            const zoomFactor = 1.1;
            const wheelZoomSpeed = 1 / 53;
            const reference = wheelEvent.offsetX / this._parentElement.clientWidth;
            this._zoom(Math.pow(zoomFactor, wheelEvent.deltaY * wheelZoomSpeed), reference);
        }
        if (wheelEvent.deltaX) {
            let offset = Math.round(wheelEvent.deltaX * WindowScrollSpeedFactor);
            const windowLeft = this._leftResizeElement.offsetLeft + ResizerOffset;
            const windowRight = this._rightResizeElement.offsetLeft + ResizerOffset;
            if (windowLeft - offset < 0) {
                offset = windowLeft;
            }
            if (windowRight - offset > this._parentElement.clientWidth) {
                offset = windowRight - this._parentElement.clientWidth;
            }
            this._setWindowPosition(windowLeft - offset, windowRight - offset);
            wheelEvent.preventDefault();
        }
    }
    /**
     * @param {number} factor
     * @param {number} reference
     */
    _zoom(factor, reference) {
        let left = this.windowLeft || 0;
        let right = this.windowRight || 0;
        const windowSize = right - left;
        let newWindowSize = factor * windowSize;
        if (newWindowSize > 1) {
            newWindowSize = 1;
            factor = newWindowSize / windowSize;
        }
        left = reference + (left - reference) * factor;
        left = Platform.NumberUtilities.clamp(left, 0, 1 - newWindowSize);
        right = reference + (right - reference) * factor;
        right = Platform.NumberUtilities.clamp(right, newWindowSize, 1);
        this._setWindow(left, right);
    }
}
/** @enum {symbol} */
export const Events = {
    WindowChanged: Symbol('WindowChanged')
};
export class WindowSelector {
    /**
     * @param {!Element} parent
     * @param {number} position
     */
    constructor(parent, position) {
        this._startPosition = position;
        this._width = /** @type {!HTMLElement} */ (parent).offsetWidth;
        this._windowSelector = document.createElement('div');
        this._windowSelector.className = 'overview-grid-window-selector';
        this._windowSelector.style.left = this._startPosition + 'px';
        this._windowSelector.style.right = this._width - this._startPosition + 'px';
        parent.appendChild(this._windowSelector);
    }
    /**
     * @param {number} position
     */
    _close(position) {
        position = Math.max(0, Math.min(position, this._width));
        this._windowSelector.remove();
        return this._startPosition < position ? { start: this._startPosition, end: position } :
            { start: position, end: this._startPosition };
    }
    /**
     * @param {number} position
     */
    _updatePosition(position) {
        position = Math.max(0, Math.min(position, this._width));
        if (position < this._startPosition) {
            this._windowSelector.style.left = position + 'px';
            this._windowSelector.style.right = this._width - this._startPosition + 'px';
        }
        else {
            this._windowSelector.style.left = this._startPosition + 'px';
            this._windowSelector.style.right = this._width - position + 'px';
        }
    }
}
//# sourceMappingURL=OverviewGrid.js.map