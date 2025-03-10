// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
import * as Common from '../common/common.js';
import * as LitHtml from '../third_party/lit-html/lit-html.js';
const { render, html } = LitHtml;
const ls = Common.ls;
const ENTER_ADDRESS_TITLE = ls `Enter address`;
export class AddressInputChangedEvent extends Event {
    constructor(address, mode) {
        super('address-input-changed');
        this.data = { address, mode };
    }
}
export class PageNavigationEvent extends Event {
    constructor(navigation) {
        super('page-navigation', {});
        this.data = navigation;
    }
}
export class HistoryNavigationEvent extends Event {
    constructor(navigation) {
        super('history-navigation', {});
        this.data = navigation;
    }
}
export class RefreshRequestedEvent extends Event {
    constructor() {
        super('refresh-requested', {});
    }
}
export class LinearMemoryNavigator extends HTMLElement {
    constructor() {
        super(...arguments);
        this.shadow = this.attachShadow({ mode: 'open' });
        this.address = '0';
        this.error = undefined;
        this.valid = true;
    }
    set data(data) {
        this.address = data.address;
        this.error = data.error;
        this.valid = data.valid;
        this.render();
        const addressInput = this.shadow.querySelector('.address-input');
        if (addressInput) {
            if (data.mode === "Submitted" /* Submitted */) {
                addressInput.blur();
            }
            else if (data.mode === "InvalidSubmit" /* InvalidSubmit */) {
                addressInput.select();
            }
        }
    }
    render() {
        // Disabled until https://crbug.com/1079231 is fixed.
        // clang-format off
        const result = html `
      <style>
        .navigator {
          min-height: 24px;
          display: flex;
          flex-wrap: nowrap;
          justify-content: space-between;
          overflow: hidden;
          align-items: center;
          background-color: var(--color-background);
          color: var(--color-text-primary);
        }

        .navigator-item {
          display: flex;
          white-space: nowrap;
          overflow: hidden;
        }

        .address-input {
          text-align: center;
          outline: none;
          color: var(--color-text-primary);
          border: 1px solid var(--color-background-elevation-2);
          background: transparent;
        }

        .address-input.invalid {
          color: var(--color-accent-red);
        }

        .navigator-button {
          display: flex;
          width: 20px;
          height: 20px;
          background: transparent;
          overflow: hidden;
          border: none;
          padding: 0px;
          outline: none;
          justify-content: center;
          align-items: center;
        }

        .navigator-button devtools-icon {
          height: 14px;
          width: 14px;
          min-height: 14px;
          min-width: 14px;
        }

        .navigator-button:hover devtools-icon {
          --icon-color: var(--color-text-primary);
        }

        .navigator-button:focus devtools-icon {
          --icon-color: var(--color-text-secondary);
        }
        </style>
      <div class="navigator">
        <div class="navigator-item">
          ${this.createButton('ic_undo_16x16_icon', ls `Go back in address history`, new HistoryNavigationEvent("Backward" /* Backward */))}
          ${this.createButton('ic_redo_16x16_icon', ls `Go forward in address history`, new HistoryNavigationEvent("Forward" /* Forward */))}
        </div>
        <div class="navigator-item">
          ${this.createButton('ic_page_prev_16x16_icon', ls `Previous page`, new PageNavigationEvent("Backward" /* Backward */))}
          ${this.createAddressInput()}
          ${this.createButton('ic_page_next_16x16_icon', ls `Next page`, new PageNavigationEvent("Forward" /* Forward */))}
        </div>
        ${this.createButton('refresh_12x12_icon', ls `Refresh`, new RefreshRequestedEvent())}
      </div>
      `;
        render(result, this.shadow, { eventContext: this });
        // clang-format on
    }
    createAddressInput() {
        const classMap = {
            'address-input': true,
            invalid: !this.valid,
        };
        return html `
      <input class=${LitHtml.Directives.classMap(classMap)} data-input="true" .value=${this.address}
        title=${this.valid ? ENTER_ADDRESS_TITLE : this.error} @change=${this.onAddressChange.bind(this, "Submitted" /* Submitted */)} @input=${this.onAddressChange.bind(this, "Edit" /* Edit */)}/>`;
    }
    onAddressChange(mode, event) {
        const addressInput = event.target;
        this.dispatchEvent(new AddressInputChangedEvent(addressInput.value, mode));
    }
    createButton(name, title, event) {
        return html `
      <button class="navigator-button"
        data-button=${event.type} title=${title}
        @click=${this.dispatchEvent.bind(this, event)}>
        <devtools-icon .data=${{ iconName: name, color: 'var(--color-text-secondary)', width: '14px' }}>
        </devtools-icon>
      </button>`;
    }
}
customElements.define('devtools-linear-memory-inspector-navigator', LinearMemoryNavigator);
//# sourceMappingURL=LinearMemoryNavigator.js.map