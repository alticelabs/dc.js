import {BaseType, select, Selection} from 'd3-selection';
import {dispatch, Dispatch} from 'd3-dispatch';
import {ascending} from 'd3-array';

import {isNumber, uniqueId} from '../core/utils';
import {instanceOfChart} from '../core/core';
import {chartRegistry} from '../core/chart-registry';
import {constants} from '../core/constants';
import {events} from '../core/events';
import {logger} from '../core/logger';
import {printers} from '../core/printers';
import {InvalidStateException} from '../core/invalid-state-exception';
import {BadArgumentException} from '../core/bad-argument-exception';
import {
    BaseAccessor,
    ChartGroupType,
    ChartParentType,
    KeyAccessor,
    LegendItem,
    MinimalCFDimension,
    MinimalCFGroup,
    TitleAccessor,
    ValueAccessor
} from '../core/types';
import {IChartGroup} from '../core/chart-group-types';
import {IBaseMixinConf} from './i-base-mixin-conf';

const _defaultFilterHandler = (dimension: MinimalCFDimension, filters) => {
    if (filters.length === 0) {
        dimension.filter(null);
    } else if (filters.length === 1 && !filters[0].isFiltered) {
        // single value and not a function-based filter
        dimension.filterExact(filters[0]);
    } else if (filters.length === 1 && filters[0].filterType === 'RangedFilter') {
        // single range-based filter
        dimension.filterRange(filters[0]);
    } else {
        dimension.filterFunction(d => {
            for (let i = 0; i < filters.length; i++) {
                const filter = filters[i];
                if (filter.isFiltered) {
                    if (filter.isFiltered(d)) {
                        return true;
                    }
                } else if (filter <= d && filter >= d) {
                    return true;
                }
            }
            return false;
        });
    }
    return filters;
};

const _defaultHasFilterHandler = (filters, filter) => {
    if (filter === null || typeof (filter) === 'undefined') {
        return filters.length > 0;
    }
    return filters.some(f => filter <= f && filter >= f);
};

const _defaultRemoveFilterHandler = (filters, filter) => {
    for (let i = 0; i < filters.length; i++) {
        if (filters[i] <= filter && filters[i] >= filter) {
            filters.splice(i, 1);
            break;
        }
    }
    return filters;
};

const _defaultAddFilterHandler = (filters, filter) => {
    filters.push(filter);
    return filters;
};

const _defaultResetFilterHandler = filters => [];

/**
 * `BaseMixin` is an abstract functional object representing a basic `dc` chart object
 * for all chart and widget implementations. Methods from the {@link #BaseMixin BaseMixin} are inherited
 * and available on all chart implementations in the `dc` library.
 * @mixin BaseMixin
 */
export class BaseMixin {
    public _conf: IBaseMixinConf;

    // tslint:disable-next-line:variable-name
    private __dcFlag__: string;
    private _group: MinimalCFGroup;
    private _anchor: string|Element;
    private _root: Selection<Element, any, any, any>; // Do not assume much, allow any HTML or SVG element
    private _svg: Selection<SVGElement, any, any, any>; // from d3-selection
    private _isChild: boolean;
    private _defaultWidthCalc: (element) => number;
    private _widthCalc: (element) => number;
    private _defaultHeightCalc: (element) => number;
    private _heightCalc: (element) => number;
    private _width: number;
    private _height: number;
    private _keyAccessor: KeyAccessor;
    private _valueAccessor: ValueAccessor;
    private _title: TitleAccessor;
    private _renderTitle: boolean;
    private _mandatoryAttributesList: string[];
    private _chartGroup: IChartGroup;
    private _listeners: Dispatch<BaseMixin>;
    private _legend; // TODO: figure out actual type
    private _defaultData: (group) => any; // TODO: find correct type
    private _data: (group) => any;
    private _filters: any[]; // TODO: find better types
    protected _groupName: string; // StackMixin needs it

    constructor () {
        this.__dcFlag__ = uniqueId().toString();

        this.configure({
            minWidth: 200,
            minHeight: 200,
            useViewBoxResizing: false,
            ordering: d => d.key,
            filterPrinter: printers.filters,
            controlsUseVisibility: false,
            transitionDuration: 750,
            transitionDelay: 0,
            commitHandler: undefined,
            filterHandler: _defaultFilterHandler,
            hasFilterHandler: _defaultHasFilterHandler,
            removeFilterHandler: _defaultRemoveFilterHandler,
            addFilterHandler: _defaultAddFilterHandler,
            resetFilterHandler: _defaultResetFilterHandler,
            label: d => d.key,
            renderLabel: false,
            renderTitle: true,
        });

        this._conf.dimension = undefined;
        this._group = undefined;

        this._anchor = undefined;
        this._root = undefined;
        this._svg = undefined;
        this._isChild = undefined;

        this._defaultWidthCalc = element => {
            const width = element && element.getBoundingClientRect && element.getBoundingClientRect().width;
            return (width && width > this._conf.minWidth) ? width : this._conf.minWidth;
        };
        this._widthCalc = this._defaultWidthCalc;

        this._defaultHeightCalc = element => {
            const height = element && element.getBoundingClientRect && element.getBoundingClientRect().height;
            return (height && height > this._conf.minHeight) ? height : this._conf.minHeight;
        };
        this._heightCalc = this._defaultHeightCalc;
        this._width = undefined;
        this._height = undefined;

        this._keyAccessor = d => d.key;
        this._valueAccessor = d => d.value;

        this._title = d => `${this.keyAccessor()(d)}: ${this.valueAccessor()(d)}`;

        this._mandatoryAttributesList = ['dimension', 'group'];

        this._listeners = dispatch(
            'preRender',
            'postRender',
            'preRedraw',
            'postRedraw',
            'filtered',
            'zoomed',
            'renderlet',
            'pretransition');

        this._legend = undefined;

        this._defaultData = group => group.all();
        this._data = this._defaultData;

        this._filters = [];
    }

    public configure (conf: IBaseMixinConf) {
        this._conf = {...(this._conf), ...conf}
    }
    
    /**
     * Set or get the height attribute of a chart. The height is applied to the SVGElement generated by
     * the chart when rendered (or re-rendered). If a value is given, then it will be used to calculate
     * the new height and the chart returned for method chaining.  The value can either be a numeric, a
     * function, or falsy. If no value is specified then the value of the current height attribute will
     * be returned.
     *
     * By default, without an explicit height being given, the chart will select the width of its
     * anchor element. If that isn't possible it defaults to 200 (provided by the
     * {@link BaseMixin#minHeight minHeight} property). Setting the value falsy will return
     * the chart to the default behavior.
     * @see {@link BaseMixin#minHeight minHeight}
     * @example
     * // Default height
     * chart.height(function (element) {
     *     var height = element && element.getBoundingClientRect && element.getBoundingClientRect().height;
     *     return (height && height > chart.minHeight()) ? height : chart.minHeight();
     * });
     *
     * chart.height(250); // Set the chart's height to 250px;
     * chart.height(function(anchor) { return doSomethingWith(anchor); }); // set the chart's height with a function
     * chart.height(null); // reset the height to the default auto calculation
     * @param {Number|Function} [height]
     * @returns {Number|BaseMixin}
     */
    public height (): number;
    public height (height: number|(() => number)): this;
    public height (height?) {
        if (!arguments.length) {
            if (!isNumber(this._height)) {
                // only calculate once
                this._height = this._heightCalc(this._root.node());
            }
            return this._height;
        }
        this._heightCalc = height ? (typeof height === 'function' ? height : () => height) : this._defaultHeightCalc;
        this._height = undefined;
        return this;
    }

    /**
     * Set or get the width attribute of a chart.
     * @see {@link BaseMixin#height height}
     * @see {@link BaseMixin#minWidth minWidth}
     * @example
     * // Default width
     * chart.width(function (element) {
     *     var width = element && element.getBoundingClientRect && element.getBoundingClientRect().width;
     *     return (width && width > chart.minWidth()) ? width : chart.minWidth();
     * });
     * @param {Number|Function} [width]
     * @returns {Number|BaseMixin}
     */
    public width (): number;
    public width (width: number|(() => number)): this;
    public width (width?) {
        if (!arguments.length) {
            if (!isNumber(this._width)) {
                // only calculate once
                this._width = this._widthCalc(this._root.node());
            }
            return this._width;
        }
        this._widthCalc = width ? (typeof width === 'function' ? width : () => width) : this._defaultWidthCalc;
        this._width = undefined;
        return this;
    }

    /**
     * Set the data callback or retrieve the chart's data set. The data callback is passed the chart's
     * group and by default will return
     * {@link https://github.com/crossfilter/crossfilter/wiki/API-Reference#group_all group.all}.
     * This behavior may be modified to, for instance, return only the top 5 groups.
     * @example
     * // Default data function
     * chart.data(function (group) { return group.all(); });
     *
     * chart.data(function (group) { return group.top(5); });
     * @param {Function} [callback]
     * @returns {*|BaseMixin}
     */
    public data ();
    public data (callback): this;
    public data (callback?) {
        if (!arguments.length) {
            return this._data(this._group);
        }
        this._data = typeof callback === 'function' ? callback : () => callback;
        this.expireCache();
        return this;
    }

    /**
     * **mandatory**
     *
     * Set or get the group attribute of a chart. In `dc` a group is a
     * {@link https://github.com/crossfilter/crossfilter/wiki/API-Reference#group-map-reduce crossfilter group}.
     * Usually the group should be created from the particular dimension associated with the same chart. If a value is
     * given, then it will be used as the new group.
     *
     * If no value specified then the current group will be returned.
     * If `name` is specified then it will be used to generate legend label.
     * @see {@link https://github.com/crossfilter/crossfilter/wiki/API-Reference#group-map-reduce crossfilter.group}
     * @example
     * var index = crossfilter([]);
     * var dimension = index.dimension(pluck('key'));
     * chart.dimension(dimension);
     * chart.group(dimension.group().reduceSum());
     * @param {crossfilter.group} [group]
     * @param {String} [name]
     * @returns {crossfilter.group|BaseMixin}
     */
    public group (): MinimalCFGroup;
    public group (group: MinimalCFGroup, name?: string, accessor?: BaseAccessor<any>): this;
    public group (group?, name?, accessor?) {
        if (!arguments.length) {
            return this._group;
        }
        this._group = group;
        this._groupName = name;
        this.expireCache();
        return this;
    }

    public _computeOrderedGroups (data) {
        // clone the array before sorting, otherwise Array.sort sorts in-place
        return Array.from(data).sort((a, b) => ascending(this._conf.ordering(a), this._conf.ordering(b)));
    }

    /**
     * Clear all filters associated with this chart. The same effect can be achieved by calling
     * {@link BaseMixin#filter chart.filter(null)}.
     * @returns {BaseMixin}
     */
    public filterAll () {
        return this.filter(null);
    }

    /**
     * Execute d3 single selection in the chart's scope using the given selector and return the d3
     * selection.
     *
     * This function is **not chainable** since it does not return a chart instance; however the d3
     * selection result can be chained to d3 function calls.
     * @see {@link https://github.com/d3/d3-selection/blob/master/README.md#select d3.select}
     * @example
     * // Has the same effect as d3.select('#chart-id').select(selector)
     * chart.select(selector)
     * @param {String} sel CSS selector string
     * @returns {d3.selection}
     */
    public select<DescElement extends BaseType> (sel) {
        return this._root.select<DescElement>(sel);
    }

    /**
     * Execute in scope d3 selectAll using the given selector and return d3 selection result.
     *
     * This function is **not chainable** since it does not return a chart instance; however the d3
     * selection result can be chained to d3 function calls.
     * @see {@link https://github.com/d3/d3-selection/blob/master/README.md#selectAll d3.selectAll}
     * @example
     * // Has the same effect as d3.select('#chart-id').selectAll(selector)
     * chart.selectAll(selector)
     * @param {String} sel CSS selector string
     * @returns {d3.selection}
     */
    public selectAll<DescElement extends BaseType, OldDatum> (sel) {
        return this._root ? this._root.selectAll<DescElement, OldDatum>(sel) : null;
    }

    /**
     * Set the root SVGElement to either be an existing chart's root; or any valid [d3 single
     * selector](https://github.com/d3/d3-selection/blob/master/README.md#selecting-elements) specifying a dom
     * block element such as a div; or a dom element or d3 selection. Optionally registers the chart
     * within the chartGroup. This class is called internally on chart initialization, but be called
     * again to relocate the chart. However, it will orphan any previously created SVGElements.
     * @param {anchorChart|anchorSelector|anchorNode} [parent]
     * @param {String} [chartGroup]
     * @returns {String|node|d3.selection|BaseMixin}
     */
    public anchor (): string|Element;
    public anchor (parent: ChartParentType, chartGroup: ChartGroupType): this;
    public anchor (parent?, chartGroup?) {
        if (!arguments.length) {
            return this._anchor;
        }
        this._chartGroup = this._getChartGroup(chartGroup);
        if (instanceOfChart(parent)) {
            this._anchor = parent.anchor();
            if ((this._anchor as any).children) { // is _anchor a div?
                this._anchor = `#${parent.anchorName()}`;
            }
            this._root = parent.root();
            this._isChild = true;
        } else if (parent) {
            if (parent.select && parent.classed) { // detect d3 selection
                this._anchor = parent.node();
            } else {
                this._anchor = parent;
            }
            this._root = select(this._anchor as any); // _anchor can be either string or an Element, both are valid
            this._root.classed(constants.CHART_CLASS, true);
            this._chartGroup.register(this);
            this._isChild = false;
        } else {
            throw new BadArgumentException('parent must be defined');
        }
        return this;
    }

    private _getChartGroup (chartGroup: ChartGroupType): IChartGroup {
        return (!chartGroup || typeof chartGroup === 'string') ? chartRegistry.chartGroup(chartGroup as string) : chartGroup;
    }

    /**
     * Returns the DOM id for the chart's anchored location.
     * @returns {String}
     */
    public anchorName (): string {
        const a: string | Element = this.anchor();
        if (a) {
            if ( typeof a === 'string') {
                return a.replace('#', '');
            } else if (a.id) {
                return a.id;
            }
        }
        return `dc-chart${this.chartID()}`;
    }

    /**
     * Returns the root element where a chart resides. Usually it will be the parent div element where
     * the SVGElement was created. You can also pass in a new root element however this is usually handled by
     * dc internally. Resetting the root element on a chart outside of dc internals may have
     * unexpected consequences.
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement HTMLElement}
     * @param {HTMLElement} [rootElement]
     * @returns {HTMLElement|BaseMixin}
     */
    public root (): Selection<Element, any, any, any>;
    public root (rootElement: Selection<Element, any, any, any>): this;
    public root (rootElement?) {
        if (!arguments.length) {
            return this._root;
        }
        this._root = rootElement;
        return this;
    }

    /**
     * Returns the top SVGElement for this specific chart. You can also pass in a new SVGElement,
     * however this is usually handled by dc internally. Resetting the SVGElement on a chart outside
     * of dc internals may have unexpected consequences.
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement SVGElement}
     * @param {SVGElement|d3.selection} [svgElement]
     * @returns {SVGElement|d3.selection|BaseMixin}
     */
    public svg (): Selection<SVGElement, any, any, any>;
    public svg (svgElement): this;
    public svg (svgElement?) {
        if (!arguments.length) {
            return this._svg;
        }
        this._svg = svgElement;
        return this;
    }

    /**
     * Remove the chart's SVGElements from the dom and recreate the container SVGElement.
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SVGElement SVGElement}
     * @returns {SVGElement}
     */
    public resetSvg (): Selection<SVGElement, any, any, any> {
        this.select('svg').remove();
        return this.generateSvg();
    }

    public sizeSvg (): void {
        if (this._svg) {
            if (!this._conf.useViewBoxResizing) {
                this._svg
                    .attr('width', this.width())
                    .attr('height', this.height());
            } else if (!this._svg.attr('viewBox')) {
                this._svg
                    .attr('viewBox', `0 0 ${this.width()} ${this.height()}`);
            }
        }
    }

    public generateSvg (): Selection<SVGElement, any, any, any> {
        this._svg = this.root().append('svg');
        this.sizeSvg();
        return this._svg;
    }

    /**
     * Turn on optional control elements within the root element. dc currently supports the
     * following html control elements.
     * * root.selectAll('.reset') - elements are turned on if the chart has an active filter. This type
     * of control element is usually used to store a reset link to allow user to reset filter on a
     * certain chart. This element will be turned off automatically if the filter is cleared.
     * * root.selectAll('.filter') elements are turned on if the chart has an active filter. The text
     * content of this element is then replaced with the current filter value using the filter printer
     * function. This type of element will be turned off automatically if the filter is cleared.
     * @returns {BaseMixin}
     */
    public turnOnControls (): this {
        if (this._root) {
            const attribute = this._conf.controlsUseVisibility ? 'visibility' : 'display';
            this.selectAll('.reset').style(attribute, null);
            this.selectAll('.filter').text(this._conf.filterPrinter(this.filters())).style(attribute, null);
        }
        return this;
    }

    /**
     * Turn off optional control elements within the root element.
     * @see {@link BaseMixin#turnOnControls turnOnControls}
     * @returns {BaseMixin}
     */
    public turnOffControls (): this {
        if (this._root) {
            const attribute = this._conf.controlsUseVisibility ? 'visibility' : 'display';
            const value = this._conf.controlsUseVisibility ? 'hidden' : 'none';
            this.selectAll('.reset').style(attribute, value);
            this.selectAll('.filter').style(attribute, value).text(this.filter());
        }
        return this;
    }

    protected _mandatoryAttributes (): string[];
    protected _mandatoryAttributes (_: string[]): this;
    protected _mandatoryAttributes (_?) {
        if (!arguments.length) {
            return this._mandatoryAttributesList;
        }
        this._mandatoryAttributesList = _;
        return this;
    }

    public checkForMandatoryAttributes (a): void {
        if (!this[a] || !this[a]()) {
            throw new InvalidStateException(`Mandatory attribute chart.${a} is missing on chart[#${this.anchorName()}]`);
        }
    }

    /**
     * Invoking this method will force the chart to re-render everything from scratch. Generally it
     * should only be used to render the chart for the first time on the page or if you want to make
     * sure everything is redrawn from scratch instead of relying on the default incremental redrawing
     * behaviour.
     * @returns {BaseMixin}
     */
    public render (): this {
        this._height = this._width = undefined; // force recalculate
        this._listeners.call('preRender', this, this);

        if (this._mandatoryAttributesList) {
            this._mandatoryAttributesList.forEach(e => this.checkForMandatoryAttributes(e));
        }

        const result = this._doRender();

        if (this._legend) {
            this._legend.render();
        }

        this._activateRenderlets('postRender');

        return result;
    }

    // Needed by Composite Charts
    public _activateRenderlets (event?): void {
        this._listeners.call('pretransition', this, this);
        if (this._conf.transitionDuration > 0 && this._svg) {
            this._svg.transition().duration(this._conf.transitionDuration).delay(this._conf.transitionDelay)
                .on('end', () => {
                    this._listeners.call('renderlet', this, this);
                    if (event) {
                        this._listeners.call(event, this, this);
                    }
                });
        } else {
            this._listeners.call('renderlet', this, this);
            if (event) {
                this._listeners.call(event, this, this);
            }
        }
    }

    /**
     * Calling redraw will cause the chart to re-render data changes incrementally. If there is no
     * change in the underlying data dimension then calling this method will have no effect on the
     * chart. Most chart interaction in dc will automatically trigger this method through internal
     * events (in particular {@link redrawAll redrawAll}); therefore, you only need to
     * manually invoke this function if data is manipulated outside of dc's control (for example if
     * data is loaded in the background using
     * {@link https://github.com/crossfilter/crossfilter/wiki/API-Reference#crossfilter_add crossfilter.add}).
     * @returns {BaseMixin}
     */
    public redraw (): this {
        this.sizeSvg();
        this._listeners.call('preRedraw', this, this);

        const result = this._doRedraw();

        if (this._legend) {
            this._legend.render();
        }

        this._activateRenderlets('postRedraw');

        return result;
    }

    /**
     * Redraws all charts in the same group as this chart, typically in reaction to a filter
     * change. If the chart has a {@link BaseMixin.commitFilter commitHandler}, it will
     * be executed and waited for.
     * @returns {BaseMixin}
     */
    public redrawGroup (): this {
        if (this._conf.commitHandler) {
            this._conf.commitHandler(false, (error, result) => {
                if (error) {
                    console.log(error);
                } else {
                    this.chartGroup().redrawAll();
                }
            });
        } else {
            this.chartGroup().redrawAll();
        }
        return this;
    }

    /**
     * Renders all charts in the same group as this chart. If the chart has a
     * {@link BaseMixin.commitFilter commitHandler}, it will be executed and waited for
     * @returns {BaseMixin}
     */
    public renderGroup (): this {
        if (this._conf.commitHandler) {
            this._conf.commitHandler(false, (error, result) => {
                if (error) {
                    console.log(error);
                } else {
                    this.chartGroup().renderAll();
                }
            });
        } else {
            this.chartGroup().renderAll();
        }
        return this;
    }

    protected _invokeFilteredListener (f): void {
        if (f !== undefined) {
            this._listeners.call('filtered', this, this, f);
        }
    }

    protected _invokeZoomedListener (): void {
        this._listeners.call('zoomed', this, this);
    }

    /**
     * Check whether any active filter or a specific filter is associated with particular chart instance.
     * This function is **not chainable**.
     * @see {@link BaseMixin#hasFilterHandler hasFilterHandler}
     * @param {*} [filter]
     * @returns {Boolean}
     */
    public hasFilter (filter?): boolean {
        return this._conf.hasFilterHandler(this._filters, filter);
    }

    public applyFilters (filters) {
        if (this._conf.dimension && this._conf.dimension.filter) {
            const fs = this._conf.filterHandler(this._conf.dimension, filters);
            if (fs) {
                filters = fs;
            }
        }
        return filters;
    }

    /**
     * Replace the chart filter. This is equivalent to calling `chart.filter(null).filter(filter)`
     * but more efficient because the filter is only applied once.
     *
     * @param {*} [filter]
     * @returns {BaseMixin}
     */
    public replaceFilter (filter): this {
        this._filters = this._conf.resetFilterHandler(this._filters);
        this.filter(filter);
        return this;
    }

    /**
     * Filter the chart by the given parameter, or return the current filter if no input parameter
     * is given.
     *
     * The filter parameter can take one of these forms:
     * * A single value: the value will be toggled (added if it is not present in the current
     * filters, removed if it is present)
     * * An array containing a single array of values (`[[value,value,value]]`): each value is
     * toggled
     * * When appropriate for the chart, a {@link filters dc filter object} such as
     *   * {@link filters.RangedFilter `filters.RangedFilter`} for the
     * {@link CoordinateGridMixin CoordinateGridMixin} charts
     *   * {@link filters.TwoDimensionalFilter `filters.TwoDimensionalFilter`} for the
     * {@link HeatMap heat map}
     *   * {@link filters.RangedTwoDimensionalFilter `filters.RangedTwoDimensionalFilter`}
     * for the {@link ScatterPlot scatter plot}
     * * `null`: the filter will be reset using the
     * {@link BaseMixin#resetFilterHandler resetFilterHandler}
     *
     * Note that this is always a toggle (even when it doesn't make sense for the filter type). If
     * you wish to replace the current filter, either call `chart.filter(null)` first - or it's more
     * efficient to call {@link BaseMixin#replaceFilter `chart.replaceFilter(filter)`} instead.
     *
     * Each toggle is executed by checking if the value is already present using the
     * {@link BaseMixin#hasFilterHandler hasFilterHandler}; if it is not present, it is added
     * using the {@link BaseMixin#addFilterHandler addFilterHandler}; if it is already present,
     * it is removed using the {@link BaseMixin#removeFilterHandler removeFilterHandler}.
     *
     * Once the filters array has been updated, the filters are applied to the
     * crossfilter dimension, using the {@link BaseMixin#filterHandler filterHandler}.
     *
     * Once you have set the filters, call {@link BaseMixin#redrawGroup `chart.redrawGroup()`}
     * (or {@link redrawAll `redrawAll()`}) to redraw the chart's group.
     * @see {@link BaseMixin#addFilterHandler addFilterHandler}
     * @see {@link BaseMixin#removeFilterHandler removeFilterHandler}
     * @see {@link BaseMixin#resetFilterHandler resetFilterHandler}
     * @see {@link BaseMixin#filterHandler filterHandler}
     * @example
     * // filter by a single string
     * chart.filter('Sunday');
     * // filter by a single age
     * chart.filter(18);
     * // filter by a set of states
     * chart.filter([['MA', 'TX', 'ND', 'WA']]);
     * // filter by range -- note the use of filters.RangedFilter, which is different
     * // from the syntax for filtering a crossfilter dimension directly, dimension.filter([15,20])
     * chart.filter(filters.RangedFilter(15,20));
     * @param {*} [filter]
     * @returns {BaseMixin}
     */
    public filter ();
    public filter (filter): this;
    public filter (filter?) {
        if (!arguments.length) {
            return this._filters.length > 0 ? this._filters[0] : null;
        }
        let filters: any[] = this._filters;
        // TODO: Not a great idea to have a method blessed onto an Array, needs redesign
        if (filter instanceof Array && filter[0] instanceof Array && !(filter as any).isFiltered) {
            // toggle each filter
            filter[0].forEach(f => {
                if (this._conf.hasFilterHandler(filters, f)) {
                    filters = this._conf.removeFilterHandler(filters, f);
                } else {
                    filters = this._conf.addFilterHandler(filters, f);
                }
            });
        } else if (filter === null) {
            filters = this._conf.resetFilterHandler(filters);
        } else {
            if (this._conf.hasFilterHandler(filters, filter)) {
                filters = this._conf.removeFilterHandler(filters, filter);
            } else {
                filters = this._conf.addFilterHandler(filters, filter);
            }
        }
        this._filters = this.applyFilters(filters);
        this._invokeFilteredListener(filter);

        if (this._root !== null && this.hasFilter()) {
            this.turnOnControls();
        } else {
            this.turnOffControls();
        }

        return this;
    }

    /**
     * Returns all current filters. This method does not perform defensive cloning of the internal
     * filter array before returning, therefore any modification of the returned array will effect the
     * chart's internal filter storage.
     * @returns {Array<*>}
     */
    public filters () {
        return this._filters;
    }

    public highlightSelected (e): void {
        select(e).classed(constants.SELECTED_CLASS, true);
        select(e).classed(constants.DESELECTED_CLASS, false);
    }

    public fadeDeselected (e): void {
        select(e).classed(constants.SELECTED_CLASS, false);
        select(e).classed(constants.DESELECTED_CLASS, true);
    }

    public resetHighlight (e): void {
        select(e).classed(constants.SELECTED_CLASS, false);
        select(e).classed(constants.DESELECTED_CLASS, false);
    }

    /**
     * This function is passed to d3 as the onClick handler for each chart. The default behavior is to
     * filter on the clicked datum (passed to the callback) and redraw the chart group.
     *
     * This function can be replaced in order to change the click behavior (but first look at
     * @example
     * var oldHandler = chart.onClick;
     * chart.onClick = function(datum) {
     *   // use datum.
     * @param {*} datum
     * @return {undefined}
     */
    public onClick (datum: any, i?: number): void {
        const filter = this.keyAccessor()(datum);
        events.trigger(() => {
            this.filter(filter);
            this.redrawGroup();
        });
    }

    // abstract function stub
    protected _doRender (): this {
        // do nothing in base, should be overridden by sub-function
        return this;
    }

    protected _doRedraw (): this {
        // do nothing in base, should be overridden by sub-function
        return this;
    }

    // Legend methods are used by Composite Charts

    public legendables (): LegendItem[] {
        // do nothing in base, should be overridden by sub-function
        return [];
    }

    public legendHighlight (d?: LegendItem) {
        // do nothing in base, should be overridden by sub-function
    }

    public legendReset (d?: LegendItem) {
        // do nothing in base, should be overridden by sub-function
    }

    public legendToggle (d?: LegendItem) {
        // do nothing in base, should be overriden by sub-function
    }

    public isLegendableHidden (d?: LegendItem): boolean {
        // do nothing in base, should be overridden by sub-function
        return false;
    }

    /**
     * Set or get the key accessor function. The key accessor function is used to retrieve the key
     * value from the crossfilter group. Key values are used differently in different charts, for
     * example keys correspond to slices in a pie chart and x axis positions in a grid coordinate chart.
     * @example
     * // default key accessor
     * chart.keyAccessor(function(d) { return d.key; });
     * // custom key accessor for a multi-value crossfilter reduction
     * chart.keyAccessor(function(p) { return p.value.absGain; });
     * @param {Function} [keyAccessor]
     * @returns {Function|BaseMixin}
     */
    public keyAccessor (): KeyAccessor;
    public keyAccessor (keyAccessor: KeyAccessor): this;
    public keyAccessor (keyAccessor?) {
        if (!arguments.length) {
            return this._keyAccessor;
        }
        this._keyAccessor = keyAccessor;
        return this;
    }

    /**
     * Set or get the value accessor function. The value accessor function is used to retrieve the
     * value from the crossfilter group. Group values are used differently in different charts, for
     * example values correspond to slice sizes in a pie chart and y axis positions in a grid
     * coordinate chart.
     * @example
     * // default value accessor
     * chart.valueAccessor(function(d) { return d.value; });
     * // custom value accessor for a multi-value crossfilter reduction
     * chart.valueAccessor(function(p) { return p.value.percentageGain; });
     * @param {Function} [valueAccessor]
     * @returns {Function|BaseMixin}
     */
    public valueAccessor (): ValueAccessor;
    public valueAccessor (valueAccessor: ValueAccessor): this;
    public valueAccessor (valueAccessor?) {
        if (!arguments.length) {
            return this._valueAccessor;
        }
        this._valueAccessor = valueAccessor;
        return this;
    }

    /**
     * Set or get the title function. The chart class will use this function to render the SVGElement title
     * (usually interpreted by browser as tooltips) for each child element in the chart, e.g. a slice
     * in a pie chart or a bubble in a bubble chart. Almost every chart supports the title function;
     * however in grid coordinate charts you need to turn off the brush in order to see titles, because
     * otherwise the brush layer will block tooltip triggering.
     * @example
     * // default title function shows "key: value"
     * chart.title(function(d) { return d.key + ': ' + d.value; });
     * // title function has access to the standard d3 data binding and can get quite complicated
     * chart.title(function(p) {
     *    return p.key.getFullYear()
     *        + '\n'
     *        + 'Index Gain: ' + numberFormat(p.value.absGain) + '\n'
     *        + 'Index Gain in Percentage: ' + numberFormat(p.value.percentageGain) + '%\n'
     *        + 'Fluctuation / Index Ratio: ' + numberFormat(p.value.fluctuationPercentage) + '%';
     * });
     * @param {Function} [titleFunction]
     * @returns {Function|BaseMixin}
     */
    public title (): TitleAccessor;
    public title (titleFunction: TitleAccessor): this;
    public title (titleFunction?) {
        if (!arguments.length) {
            return this._title;
        }
        this._title = titleFunction;
        return this;
    }

    /**
     * Get or set the chart group to which this chart belongs. Chart groups are rendered or redrawn
     * together since it is expected they share the same underlying crossfilter data set.
     * @param {String} [chartGroup]
     * @returns {String|BaseMixin}
     */
    public chartGroup (): IChartGroup;
    public chartGroup (chartGroup: ChartGroupType): this;
    public chartGroup (chartGroup?) {
        if (!arguments.length) {
            return this._chartGroup;
        }
        if (!this._isChild) {
            this._chartGroup.deregister(this);
        }
        this._chartGroup =  this._getChartGroup(chartGroup);
        if (!this._isChild) {
            this._chartGroup.register(this);
        }
        return this;
    }

    /**
     * Expire the internal chart cache. dc charts cache some data internally on a per chart basis to
     * speed up rendering and avoid unnecessary calculation; however it might be useful to clear the
     * cache if you have changed state which will affect rendering.  For example, if you invoke
     * {@link https://github.com/crossfilter/crossfilter/wiki/API-Reference#crossfilter_add crossfilter.add}
     * function or reset group or dimension after rendering, it is a good idea to
     * clear the cache to make sure charts are rendered properly.
     * @returns {BaseMixin}
     */
    protected expireCache (): this {
        // do nothing in base, should be overridden by sub-function
        return this;
    }

    /**
     * Attach a Legend widget to this chart. The legend widget will automatically draw legend labels
     * based on the color setting and names associated with each group.
     * @example
     * chart.legend(new Legend().x(400).y(10).itemHeight(13).gap(5))
     * @param {Legend} [legend]
     * @returns {Legend|BaseMixin}
     */
    public legend ();
    public legend (legend): this;
    public legend (legend?) {
        if (!arguments.length) {
            return this._legend;
        }
        this._legend = legend;
        this._legend.parent(this);
        return this;
    }

    /**
     * Returns the internal numeric ID of the chart.
     * @returns {String}
     */
    public chartID (): string {
        return this.__dcFlag__;
    }

    /**
     * Set chart options using a configuration object. Each key in the object will cause the method of
     * the same name to be called with the value to set that attribute for the chart.
     * @example
     * chart.options({dimension: myDimension, group: myGroup});
     * @param {{}} opts
     * @returns {BaseMixin}
     */
    public options (opts) {
        const applyOptions = [
            'anchor',
            'group',
            'xAxisLabel',
            'yAxisLabel',
            'stack',
            'title',
            'point',
            'getColor',
            'overlayGeoJson'
        ];

        for (const o in opts) {
            if (typeof (this[o]) === 'function') {
                if (opts[o] instanceof Array && applyOptions.indexOf(o) !== -1) {
                    this[o].apply(this, opts[o]);
                } else {
                    this[o].call(this, opts[o]);
                }
            } else {
                logger.debug(`Not a valid option setter name: ${o}`);
            }
        }
        return this;
    }

    /**
     * All dc chart instance supports the following listeners.
     * Supports the following events:
     * * `renderlet` - This listener function will be invoked after transitions after redraw and render. Replaces the
     * deprecated {@link BaseMixin#renderlet renderlet} method.
     * * `pretransition` - Like `.on('renderlet', ...)` but the event is fired before transitions start.
     * * `preRender` - This listener function will be invoked before chart rendering.
     * * `postRender` - This listener function will be invoked after chart finish rendering including
     * all renderlets' logic.
     * * `preRedraw` - This listener function will be invoked before chart redrawing.
     * * `postRedraw` - This listener function will be invoked after chart finish redrawing
     * including all renderlets' logic.
     * * `filtered` - This listener function will be invoked after a filter is applied, added or removed.
     * * `zoomed` - This listener function will be invoked after a zoom is triggered.
     * @see {@link https://github.com/d3/d3-dispatch/blob/master/README.md#dispatch_on d3.dispatch.on}
     * @example
     * .on('renderlet', function(chart, filter){...})
     * .on('pretransition', function(chart, filter){...})
     * .on('preRender', function(chart){...})
     * .on('postRender', function(chart){...})
     * .on('preRedraw', function(chart){...})
     * .on('postRedraw', function(chart){...})
     * .on('filtered', function(chart, filter){...})
     * .on('zoomed', function(chart, filter){...})
     * @param {String} event
     * @param {Function} listener
     * @returns {BaseMixin}
     */
    public on (event, listener): this {
        this._listeners.on(event, listener);
        return this;
    }

    /**
     * A renderlet is similar to an event listener on rendering event. Multiple renderlets can be added
     * to an individual chart.  Each time a chart is rerendered or redrawn the renderlets are invoked
     * right after the chart finishes its transitions, giving you a way to modify the SVGElements.
     * Renderlet functions take the chart instance as the only input parameter and you can
     * use the dc API or use raw d3 to achieve pretty much any effect.
     *
     * Use {@link BaseMixin#on on} with a 'renderlet' prefix.
     * Generates a random key for the renderlet, which makes it hard to remove.
     * @deprecated chart.renderlet has been deprecated. Please use chart.on("renderlet.<renderletKey>", renderletFunction)
     * @example
     * // do this instead of .renderlet(function(chart) { ... })
     * chart.on("renderlet", function(chart){
     *     // mix of dc API and d3 manipulation
     *     chart.select('g.y').style('display', 'none');
     *     // its a closure so you can also access other chart variable available in the closure scope
     *     moveChart.filter(chart.filter());
     * });
     * @param {Function} renderletFunction
     * @returns {BaseMixin}
     */
    public renderlet (renderletFunction): this {
        logger.warnOnce('chart.renderlet has been deprecated. Please use chart.on("renderlet.<renderletKey>", renderletFunction)');
        this.on(`renderlet.${uniqueId()}`, renderletFunction);
        return this;
    }
}
