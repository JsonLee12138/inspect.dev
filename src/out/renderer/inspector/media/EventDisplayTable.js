// Copyright 2019 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as DataGrid from '../data_grid/data_grid.js';
import * as i18n from '../i18n/i18n.js';
import * as SourceFrame from '../source_frame/source_frame.js';
import * as UI from '../ui/ui.js';
export const UIStrings = {
    /**
    *@description Text for timestamps of items
    */
    timestamp: 'Timestamp',
    /**
    *@description The column header for event names.
    */
    eventName: 'Event name',
    /**
    *@description Text for the value of something
    */
    value: 'Value',
    /**
    *@description Data grid name for Event Display data grids
    */
    eventDisplay: 'Event display',
};
const str_ = i18n.i18n.registerUIStrings('media/EventDisplayTable.js', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
/**
 * @typedef {{
 *     id: string,
 *     title: string,
 *     sortable: boolean,
 *     weight: (number|undefined),
 * }}
 */
// @ts-ignore typedef
export let EventDisplayColumnConfig;
/** @enum {string} */
export const MediaEventColumnKeys = {
    Timestamp: 'displayTimestamp',
    Event: 'event',
    Value: 'value'
};
/**
 * @extends {DataGrid.DataGrid.DataGridNode<!EventNode>}
 */
export class EventNode extends DataGrid.DataGrid.DataGridNode {
    /**
     * @param {!PlayerEvent} event
     */
    constructor(event) {
        super(event, false);
        this._expandableElement = null;
    }
    /**
     * @override
     * @param {string} columnId
     * @return {!HTMLElement}
     */
    createCell(columnId) {
        const cell = this.createTD(columnId);
        const cellData = /** @type string */ (this.data[columnId]);
        if (columnId === MediaEventColumnKeys.Value) {
            const enclosed = cell.createChild('div', 'event-display-table-contents-json-wrapper');
            this._expandableElement =
                new SourceFrame.JSONView.JSONView(new SourceFrame.JSONView.ParsedJSON(cellData, '', ''), true);
            this._expandableElement.markAsRoot();
            this._expandableElement.show(enclosed);
        }
        else {
            cell.classList.add('event-display-table-basic-text-table-entry');
            UI.UIUtils.createTextChild(cell, cellData);
        }
        return cell;
    }
}
export class PlayerEventsView extends UI.Widget.VBox {
    constructor() {
        super();
        // Set up element styles.
        this.registerRequiredCSS('media/eventDisplayTable.css', { enableLegacyPatching: false });
        this.contentElement.classList.add('event-display-table-contents-table-container');
        this._dataGrid = this._createDataGrid([
            {
                id: MediaEventColumnKeys.Timestamp,
                title: i18nString(UIStrings.timestamp),
                weight: 1,
                sortable: false,
            },
            { id: MediaEventColumnKeys.Event, title: i18nString(UIStrings.eventName), weight: 2, sortable: false }, {
                id: MediaEventColumnKeys.Value,
                title: i18nString(UIStrings.value),
                weight: 7,
                sortable: false,
            }
        ]);
        this._firstEventTime = 0;
        this._dataGrid.setStriped(true);
        this._dataGrid.asWidget().show(this.contentElement);
    }
    /**
     * @param {!Array.<!EventDisplayColumnConfig>} headers
     * @return {!DataGrid.DataGrid.DataGridImpl<!EventNode>}
     */
    _createDataGrid(headers) {
        const gridColumnDescs = [];
        for (const headerDesc of headers) {
            gridColumnDescs.push(PlayerEventsView._convertToGridDescriptor(headerDesc));
        }
        // TODO(tmathmeyer) SortableDataGrid doesn't play nice with nested JSON
        // renderers, since they can change size, and this breaks the visible
        // element computation in ViewportDataGrid.
        const datagrid = new DataGrid.DataGrid.DataGridImpl({
            displayName: i18nString(UIStrings.eventDisplay),
            columns: gridColumnDescs,
            deleteCallback: undefined,
            editCallback: undefined,
            refreshCallback: undefined,
        });
        datagrid.asWidget().contentElement.classList.add('no-border-top-datagrid');
        return datagrid;
    }
    /**
     * @param {!PlayerEvent} event
     */
    onEvent(event) {
        if (this._firstEventTime === 0 && typeof event.timestamp === 'number') {
            this._firstEventTime = event.timestamp;
        }
        event = this._subtractFirstEventTime(event);
        const stringified = /** @type {string} */ (event.value);
        try {
            const json = JSON.parse(stringified);
            event.event = json.event;
            delete json['event'];
            event.value = json;
            const node = new EventNode(event);
            const scroll = /** @type {!HTMLElement} */ (this._dataGrid.scrollContainer);
            const isAtBottom = scroll.scrollTop === (scroll.scrollHeight - scroll.offsetHeight);
            this._dataGrid.rootNode().appendChild(/** @type {!DataGrid.DataGrid.DataGridNode<!EventNode>} */ (node));
            if (isAtBottom) {
                scroll.scrollTop = scroll.scrollHeight;
            }
        }
        catch (e) {
            // If this is a legacy message event, ignore it for now until they
            // are handled.
        }
    }
    /**
     * @param {!PlayerEvent} event
     */
    _subtractFirstEventTime(event) {
        if (typeof event.timestamp === 'number') {
            event.displayTimestamp = (event.timestamp - this._firstEventTime).toFixed(3);
        }
        return event;
    }
    /**
     * @param {!EventDisplayColumnConfig} columnConfig
     * @return {!DataGrid.DataGrid.ColumnDescriptor}
     */
    static _convertToGridDescriptor(columnConfig) {
        return /** @type {!DataGrid.DataGrid.ColumnDescriptor} */ ({
            id: columnConfig.id,
            title: columnConfig.title,
            sortable: columnConfig.sortable,
            weight: columnConfig.weight || 0,
            sort: DataGrid.DataGrid.Order.Ascending
        });
    }
}
//# sourceMappingURL=EventDisplayTable.js.map