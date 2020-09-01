import { event, select, Selection } from 'd3-selection';

import { events } from '../core/events';
import { BaseMixin } from '../base/base-mixin';
import { uniqueId } from '../core/utils';
import { ChartGroupType, ChartParentType } from '../core/types';
import { ICboxMenuConf } from './i-cbox-menu-conf';
import { ascending } from 'd3-array';
import { adaptHandler } from "../core/d3compat";

const GROUP_CSS_CLASS = 'dc-cbox-group';
const ITEM_CSS_CLASS = 'dc-cbox-item';

/**
 * The CboxMenu is a simple widget designed to filter a dimension by
 * selecting option(s) from a set of HTML `<input />` elements. The menu can be
 * made into a set of radio buttons (single select) or checkboxes (multiple).
 * @mixes BaseMixin
 */
export class CboxMenu extends BaseMixin {
    protected _conf: ICboxMenuConf;

    private _cbox: Selection<HTMLElement, any, HTMLElement, any>;
    private _uniqueId: number;

    /**
     * Create a Cbox Menu.
     *
     * @example
     * // create a cboxMenu under #cbox-container using the default global chart group
     * var cbox = new CboxMenu('#cbox-container')
     *                .dimension(states)
     *                .group(stateGroup);
     * // the option text can be set via the title() function
     * // by default the option text is '`key`: `value`'
     * cbox.title(function (d){
     *     return 'STATE: ' + d.key;
     * })
     * @param {String|node|d3.selection|CompositeChart} parent - Any valid
     * [d3 single selector](https://github.com/mbostock/d3/wiki/Selections#selecting-elements) specifying
     * a dom block element such as a div; or a dom element or d3 selection.
     * @param {String} [chartGroup] - The name of the chart group this widget should be placed in.
     * Interaction with the widget will only trigger events and redraws within its group.
     */
    constructor(parent: ChartParentType, chartGroup: ChartGroupType) {
        super();

        this.configure({
            multiple: false,
            promptText: 'Select all',
            promptValue: null,
            filterDisplayed: d => this._conf.valueAccessor(d) > 0,
            order: (a, b) => ascending(this._conf.keyAccessor(a), this._conf.keyAccessor(b)),
        });

        this._cbox = undefined;

        this._uniqueId = uniqueId();

        this.data(group => group.all().filter(this._conf.filterDisplayed));

        this.anchor(parent, chartGroup);
    }

    public configure(conf: ICboxMenuConf): this {
        super.configure(conf);
        return this;
    }

    public conf(): ICboxMenuConf {
        return this._conf;
    }

    public _doRender(): this {
        return this._doRedraw();
    }

    public _doRedraw(): this {
        this.select('ul').remove();
        this._cbox = this.root().append('ul').classed(GROUP_CSS_CLASS, true);
        this._renderOptions();

        if (this.hasFilter() && this._conf.multiple) {
            this._cbox
                .selectAll('input')
                // adding `false` avoids failing test cases in phantomjs
                .property(
                    'checked',
                    d =>
                        (d && this.filters().indexOf(String(this._conf.keyAccessor(d))) >= 0) ||
                        false
                );
        } else if (this.hasFilter()) {
            this._cbox.selectAll('input').property('checked', d => {
                if (!d) {
                    return false;
                }
                return this._conf.keyAccessor(d) === this.filter();
            });
        }
        return this;
    }

    public _renderOptions() {
        const inputType = this._conf.multiple ? 'checkbox' : 'radio';

        let options: Selection<HTMLLIElement, unknown, HTMLElement, any> = this._cbox
            .selectAll<HTMLLIElement, any>(`li.${ITEM_CSS_CLASS}`)
            .data(this.data(), d => this._conf.keyAccessor(d));

        options.exit().remove();

        options = options.enter().append('li').classed(ITEM_CSS_CLASS, true).merge(options);

        options
            .append('input')
            .attr('type', inputType)
            .attr('value', d => this._conf.keyAccessor(d))
            .attr('name', `domain_${this._uniqueId}`)
            .attr('id', (d, i) => `input_${this._uniqueId}_${i}`);
        options
            .append('label')
            .attr('for', (d, i) => `input_${this._uniqueId}_${i}`)
            .text(this.title());

        const chart = this;
        // 'all' option
        if (this._conf.multiple) {
            this._cbox
                .append('li')
                .append('input')
                .attr('type', 'reset')
                .text(this._conf.promptText)
                .on('click', adaptHandler(function (d, evt) {
                    return chart._onChange(d, evt, this);
                }));
        } else {
            const li = this._cbox.append('li');
            li.append('input')
                .attr('type', inputType)
                .attr('value', this._conf.promptValue)
                .attr('name', `domain_${this._uniqueId}`)
                .attr('id', (d, i) => `input_${this._uniqueId}_all`)
                .property('checked', true);
            li.append('label')
                .attr('for', (d, i) => `input_${this._uniqueId}_all`)
                .text(this._conf.promptText);
        }

        this._cbox.selectAll(`li.${ITEM_CSS_CLASS}`).sort(this._conf.order);

        this._cbox.on('change', adaptHandler(function (d, evt) {
            return chart._onChange(d, evt, this);
        }));
        return options;
    }

    private _onChange(d, evt, element: HTMLElement) {
        let values;
        const target = select(evt.target);
        let options: Selection<HTMLInputElement, unknown, HTMLElement, unknown>;

        if (!target.datum()) {
            values = this._conf.promptValue || null;
        } else {
            options = select(element)
                .selectAll<HTMLInputElement, any>('input')
                .filter(function (o) {
                    if (o) {
                        return this.checked;
                    }
                });
            values = options.nodes().map(option => option.value);
            // check if only prompt option is selected
            if (!this._conf.multiple && values.length === 1) {
                values = values[0];
            }
        }
        this.onChange(values);
    }

    // TODO: come back for better typing, probably generics
    public onChange(val) {
        if (val && this._conf.multiple) {
            this.replaceFilter([val]);
        } else if (val) {
            this.replaceFilter(val);
        } else {
            this.filterAll();
        }
        events.trigger(() => {
            this.redrawGroup();
        });
    }
}
