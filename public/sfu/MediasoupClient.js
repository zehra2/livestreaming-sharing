(function () {
    function r(e, n, t) {
        function o(i, f) {
            if (!n[i]) {
                if (!e[i]) {
                    var c = 'function' == typeof require && require;
                    if (!f && c) return c(i, !0);
                    if (u) return u(i, !0);
                    var a = new Error("Cannot find module '" + i + "'");
                    throw ((a.code = 'MODULE_NOT_FOUND'), a);
                }
                var p = (n[i] = { exports: {} });
                e[i][0].call(
                    p.exports,
                    function (r) {
                        var n = e[i][1][r];
                        return o(n || r);
                    },
                    p,
                    p.exports,
                    r,
                    e,
                    n,
                    t,
                );
            }
            return n[i].exports;
        }
        for (var u = 'function' == typeof require && require, i = 0; i < t.length; i++) o(t[i]);
        return o;
    }
    return r;
})()(
    {
        1: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Logger = void 0;
                const debug_1 = require('debug');
                const LIB_NAME = 'awaitqueue';
                class Logger {
                    constructor(prefix) {
                        if (prefix) {
                            this._debug = (0, debug_1.default)(`${LIB_NAME}:${prefix}`);
                            this._warn = (0, debug_1.default)(`${LIB_NAME}:WARN:${prefix}`);
                            this._error = (0, debug_1.default)(`${LIB_NAME}:ERROR:${prefix}`);
                        } else {
                            this._debug = (0, debug_1.default)(LIB_NAME);
                            this._warn = (0, debug_1.default)(`${LIB_NAME}:WARN`);
                            this._error = (0, debug_1.default)(`${LIB_NAME}:ERROR`);
                        }
                        /* eslint-disable no-console */
                        this._debug.log = console.info.bind(console);
                        this._warn.log = console.warn.bind(console);
                        this._error.log = console.error.bind(console);
                        /* eslint-enable no-console */
                    }
                    get debug() {
                        return this._debug;
                    }
                    get warn() {
                        return this._warn;
                    }
                    get error() {
                        return this._error;
                    }
                }
                exports.Logger = Logger;
            },
            { debug: 3 },
        ],
        2: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.AwaitQueue = exports.AwaitQueueRemovedTaskError = exports.AwaitQueueStoppedError = void 0;
                const Logger_1 = require('./Logger');
                const logger = new Logger_1.Logger();
                /**
                 * Custom Error derived class used to reject pending tasks once stop() method
                 * has been called.
                 */
                class AwaitQueueStoppedError extends Error {
                    constructor(message) {
                        super(message ?? 'AwaitQueue stopped');
                        this.name = 'AwaitQueueStoppedError';
                        // @ts-ignore
                        if (typeof Error.captureStackTrace === 'function') {
                            // @ts-ignore
                            Error.captureStackTrace(this, AwaitQueueStoppedError);
                        }
                    }
                }
                exports.AwaitQueueStoppedError = AwaitQueueStoppedError;
                /**
                 * Custom Error derived class used to reject pending tasks once removeTask()
                 * method has been called.
                 */
                class AwaitQueueRemovedTaskError extends Error {
                    constructor(message) {
                        super(message ?? 'AwaitQueue task removed');
                        this.name = 'AwaitQueueRemovedTaskError';
                        // @ts-ignore
                        if (typeof Error.captureStackTrace === 'function') {
                            // @ts-ignore
                            Error.captureStackTrace(this, AwaitQueueRemovedTaskError);
                        }
                    }
                }
                exports.AwaitQueueRemovedTaskError = AwaitQueueRemovedTaskError;
                class AwaitQueue {
                    constructor() {
                        // Queue of pending tasks (map of PendingTasks indexed by id).
                        this.pendingTasks = new Map();
                        // Incrementing PendingTask id.
                        this.nextTaskId = 0;
                        // Whether stop() method is stopping all pending tasks.
                        this.stopping = false;
                    }
                    get size() {
                        return this.pendingTasks.size;
                    }
                    async push(task, name) {
                        name = name ?? task.name;
                        logger.debug(`push() [name:${name}]`);
                        if (typeof task !== 'function') {
                            throw new TypeError('given task is not a function');
                        }
                        if (name) {
                            try {
                                Object.defineProperty(task, 'name', { value: name });
                            } catch (error) {}
                        }
                        return new Promise((resolve, reject) => {
                            const pendingTask = {
                                id: this.nextTaskId++,
                                task: task,
                                name: name,
                                enqueuedAt: Date.now(),
                                executedAt: undefined,
                                completed: false,
                                resolve: (result) => {
                                    // pendingTask.resolve() can only be called in execute() method. Since
                                    // resolve() was called it means that the task successfully completed.
                                    // However the task may have been stopped before it completed (via
                                    // stop() or remove()) so its completed flag was already set. If this
                                    // is the case, abort here since next task (if any) is already being
                                    // executed.
                                    if (pendingTask.completed) {
                                        return;
                                    }
                                    pendingTask.completed = true;
                                    // Remove the task from the queue.
                                    this.pendingTasks.delete(pendingTask.id);
                                    logger.debug(`resolving task [name:${pendingTask.name}]`);
                                    // Resolve the task with the obtained result.
                                    resolve(result);
                                    // Execute the next pending task (if any).
                                    const [nextPendingTask] = this.pendingTasks.values();
                                    // NOTE: During the resolve() callback the user app may have interacted
                                    // with the queue. For instance, the app may have pushed a task while
                                    // the queue was empty so such a task is already being executed. If so,
                                    // don't execute it twice.
                                    if (nextPendingTask && !nextPendingTask.executedAt) {
                                        void this.execute(nextPendingTask);
                                    }
                                },
                                reject: (error) => {
                                    // pendingTask.reject() can be called within execute() method if the
                                    // task completed with error. However it may have also been called in
                                    // stop() or remove() methods (before or while being executed) so its
                                    // completed flag was already set. If so, abort here since next task
                                    // (if any) is already being executed.
                                    if (pendingTask.completed) {
                                        return;
                                    }
                                    pendingTask.completed = true;
                                    // Remove the task from the queue.
                                    this.pendingTasks.delete(pendingTask.id);
                                    logger.debug(`rejecting task [name:${pendingTask.name}]: %s`, String(error));
                                    // Reject the task with the obtained error.
                                    reject(error);
                                    // Execute the next pending task (if any) unless stop() is running.
                                    if (!this.stopping) {
                                        const [nextPendingTask] = this.pendingTasks.values();
                                        // NOTE: During the reject() callback the user app may have interacted
                                        // with the queue. For instance, the app may have pushed a task while
                                        // the queue was empty so such a task is already being executed. If so,
                                        // don't execute it twice.
                                        if (nextPendingTask && !nextPendingTask.executedAt) {
                                            void this.execute(nextPendingTask);
                                        }
                                    }
                                },
                            };
                            // Append task to the queue.
                            this.pendingTasks.set(pendingTask.id, pendingTask);
                            // And execute it if this is the only task in the queue.
                            if (this.pendingTasks.size === 1) {
                                void this.execute(pendingTask);
                            }
                        });
                    }
                    stop() {
                        logger.debug('stop()');
                        this.stopping = true;
                        for (const pendingTask of this.pendingTasks.values()) {
                            logger.debug(`stop() | stopping task [name:${pendingTask.name}]`);
                            pendingTask.reject(new AwaitQueueStoppedError());
                        }
                        this.stopping = false;
                    }
                    remove(taskIdx) {
                        logger.debug(`remove() [taskIdx:${taskIdx}]`);
                        const pendingTask = Array.from(this.pendingTasks.values())[taskIdx];
                        if (!pendingTask) {
                            logger.debug(`stop() | no task with given idx [taskIdx:${taskIdx}]`);
                            return;
                        }
                        pendingTask.reject(new AwaitQueueRemovedTaskError());
                    }
                    dump() {
                        const now = Date.now();
                        let idx = 0;
                        return Array.from(this.pendingTasks.values()).map((pendingTask) => ({
                            idx: idx++,
                            task: pendingTask.task,
                            name: pendingTask.name,
                            enqueuedTime: pendingTask.executedAt
                                ? pendingTask.executedAt - pendingTask.enqueuedAt
                                : now - pendingTask.enqueuedAt,
                            executionTime: pendingTask.executedAt ? now - pendingTask.executedAt : 0,
                        }));
                    }
                    async execute(pendingTask) {
                        logger.debug(`execute() [name:${pendingTask.name}]`);
                        if (pendingTask.executedAt) {
                            throw new Error('task already being executed');
                        }
                        pendingTask.executedAt = Date.now();
                        try {
                            const result = await pendingTask.task();
                            // Resolve the task with its resolved result (if any).
                            pendingTask.resolve(result);
                        } catch (error) {
                            // Reject the task with its rejected error.
                            pendingTask.reject(error);
                        }
                    }
                }
                exports.AwaitQueue = AwaitQueue;
            },
            { './Logger': 1 },
        ],
        3: [
            function (require, module, exports) {
                (function (process) {
                    (function () {
                        /* eslint-env browser */

                        /**
                         * This is the web browser implementation of `debug()`.
                         */

                        exports.formatArgs = formatArgs;
                        exports.save = save;
                        exports.load = load;
                        exports.useColors = useColors;
                        exports.storage = localstorage();
                        exports.destroy = (() => {
                            let warned = false;

                            return () => {
                                if (!warned) {
                                    warned = true;
                                    console.warn(
                                        'Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.',
                                    );
                                }
                            };
                        })();

                        /**
                         * Colors.
                         */

                        exports.colors = [
                            '#0000CC',
                            '#0000FF',
                            '#0033CC',
                            '#0033FF',
                            '#0066CC',
                            '#0066FF',
                            '#0099CC',
                            '#0099FF',
                            '#00CC00',
                            '#00CC33',
                            '#00CC66',
                            '#00CC99',
                            '#00CCCC',
                            '#00CCFF',
                            '#3300CC',
                            '#3300FF',
                            '#3333CC',
                            '#3333FF',
                            '#3366CC',
                            '#3366FF',
                            '#3399CC',
                            '#3399FF',
                            '#33CC00',
                            '#33CC33',
                            '#33CC66',
                            '#33CC99',
                            '#33CCCC',
                            '#33CCFF',
                            '#6600CC',
                            '#6600FF',
                            '#6633CC',
                            '#6633FF',
                            '#66CC00',
                            '#66CC33',
                            '#9900CC',
                            '#9900FF',
                            '#9933CC',
                            '#9933FF',
                            '#99CC00',
                            '#99CC33',
                            '#CC0000',
                            '#CC0033',
                            '#CC0066',
                            '#CC0099',
                            '#CC00CC',
                            '#CC00FF',
                            '#CC3300',
                            '#CC3333',
                            '#CC3366',
                            '#CC3399',
                            '#CC33CC',
                            '#CC33FF',
                            '#CC6600',
                            '#CC6633',
                            '#CC9900',
                            '#CC9933',
                            '#CCCC00',
                            '#CCCC33',
                            '#FF0000',
                            '#FF0033',
                            '#FF0066',
                            '#FF0099',
                            '#FF00CC',
                            '#FF00FF',
                            '#FF3300',
                            '#FF3333',
                            '#FF3366',
                            '#FF3399',
                            '#FF33CC',
                            '#FF33FF',
                            '#FF6600',
                            '#FF6633',
                            '#FF9900',
                            '#FF9933',
                            '#FFCC00',
                            '#FFCC33',
                        ];

                        /**
                         * Currently only WebKit-based Web Inspectors, Firefox >= v31,
                         * and the Firebug extension (any Firefox version) are known
                         * to support "%c" CSS customizations.
                         *
                         * TODO: add a `localStorage` variable to explicitly enable/disable colors
                         */

                        // eslint-disable-next-line complexity
                        function useColors() {
                            // NB: In an Electron preload script, document will be defined but not fully
                            // initialized. Since we know we're in Chrome, we'll just detect this case
                            // explicitly
                            if (
                                typeof window !== 'undefined' &&
                                window.process &&
                                (window.process.type === 'renderer' || window.process.__nwjs)
                            ) {
                                return true;
                            }

                            // Internet Explorer and Edge do not support colors.
                            if (
                                typeof navigator !== 'undefined' &&
                                navigator.userAgent &&
                                navigator.userAgent.toLowerCase().match(/(edge|trident)\/(\d+)/)
                            ) {
                                return false;
                            }

                            // Is webkit? http://stackoverflow.com/a/16459606/376773
                            // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
                            return (
                                (typeof document !== 'undefined' &&
                                    document.documentElement &&
                                    document.documentElement.style &&
                                    document.documentElement.style.WebkitAppearance) ||
                                // Is firebug? http://stackoverflow.com/a/398120/376773
                                (typeof window !== 'undefined' &&
                                    window.console &&
                                    (window.console.firebug || (window.console.exception && window.console.table))) ||
                                // Is firefox >= v31?
                                // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
                                (typeof navigator !== 'undefined' &&
                                    navigator.userAgent &&
                                    navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) &&
                                    parseInt(RegExp.$1, 10) >= 31) ||
                                // Double check webkit in userAgent just in case we are in a worker
                                (typeof navigator !== 'undefined' &&
                                    navigator.userAgent &&
                                    navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/))
                            );
                        }

                        /**
                         * Colorize log arguments if enabled.
                         *
                         * @api public
                         */

                        function formatArgs(args) {
                            args[0] =
                                (this.useColors ? '%c' : '') +
                                this.namespace +
                                (this.useColors ? ' %c' : ' ') +
                                args[0] +
                                (this.useColors ? '%c ' : ' ') +
                                '+' +
                                module.exports.humanize(this.diff);

                            if (!this.useColors) {
                                return;
                            }

                            const c = 'color: ' + this.color;
                            args.splice(1, 0, c, 'color: inherit');

                            // The final "%c" is somewhat tricky, because there could be other
                            // arguments passed either before or after the %c, so we need to
                            // figure out the correct index to insert the CSS into
                            let index = 0;
                            let lastC = 0;
                            args[0].replace(/%[a-zA-Z%]/g, (match) => {
                                if (match === '%%') {
                                    return;
                                }
                                index++;
                                if (match === '%c') {
                                    // We only are interested in the *last* %c
                                    // (the user may have provided their own)
                                    lastC = index;
                                }
                            });

                            args.splice(lastC, 0, c);
                        }

                        /**
                         * Invokes `console.debug()` when available.
                         * No-op when `console.debug` is not a "function".
                         * If `console.debug` is not available, falls back
                         * to `console.log`.
                         *
                         * @api public
                         */
                        exports.log = console.debug || console.log || (() => {});

                        /**
                         * Save `namespaces`.
                         *
                         * @param {String} namespaces
                         * @api private
                         */
                        function save(namespaces) {
                            try {
                                if (namespaces) {
                                    exports.storage.setItem('debug', namespaces);
                                } else {
                                    exports.storage.removeItem('debug');
                                }
                            } catch (error) {
                                // Swallow
                                // XXX (@Qix-) should we be logging these?
                            }
                        }

                        /**
                         * Load `namespaces`.
                         *
                         * @return {String} returns the previously persisted debug modes
                         * @api private
                         */
                        function load() {
                            let r;
                            try {
                                r = exports.storage.getItem('debug');
                            } catch (error) {
                                // Swallow
                                // XXX (@Qix-) should we be logging these?
                            }

                            // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
                            if (!r && typeof process !== 'undefined' && 'env' in process) {
                                r = process.env.DEBUG;
                            }

                            return r;
                        }

                        /**
                         * Localstorage attempts to return the localstorage.
                         *
                         * This is necessary because safari throws
                         * when a user disables cookies/localstorage
                         * and you attempt to access it.
                         *
                         * @return {LocalStorage}
                         * @api private
                         */

                        function localstorage() {
                            try {
                                // TVMLKit (Apple TV JS Runtime) does not have a window object, just localStorage in the global context
                                // The Browser also has localStorage in the global context.
                                return localStorage;
                            } catch (error) {
                                // Swallow
                                // XXX (@Qix-) should we be logging these?
                            }
                        }

                        module.exports = require('./common')(exports);

                        const { formatters } = module.exports;

                        /**
                         * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
                         */

                        formatters.j = function (v) {
                            try {
                                return JSON.stringify(v);
                            } catch (error) {
                                return '[UnexpectedJSONParseError]: ' + error.message;
                            }
                        };
                    }).call(this);
                }).call(this, require('_process'));
            },
            { './common': 4, _process: 52 },
        ],
        4: [
            function (require, module, exports) {
                /**
                 * This is the common logic for both the Node.js and web browser
                 * implementations of `debug()`.
                 */

                function setup(env) {
                    createDebug.debug = createDebug;
                    createDebug.default = createDebug;
                    createDebug.coerce = coerce;
                    createDebug.disable = disable;
                    createDebug.enable = enable;
                    createDebug.enabled = enabled;
                    createDebug.humanize = require('ms');
                    createDebug.destroy = destroy;

                    Object.keys(env).forEach((key) => {
                        createDebug[key] = env[key];
                    });

                    /**
                     * The currently active debug mode names, and names to skip.
                     */

                    createDebug.names = [];
                    createDebug.skips = [];

                    /**
                     * Map of special "%n" handling functions, for the debug "format" argument.
                     *
                     * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
                     */
                    createDebug.formatters = {};

                    /**
                     * Selects a color for a debug namespace
                     * @param {String} namespace The namespace string for the debug instance to be colored
                     * @return {Number|String} An ANSI color code for the given namespace
                     * @api private
                     */
                    function selectColor(namespace) {
                        let hash = 0;

                        for (let i = 0; i < namespace.length; i++) {
                            hash = (hash << 5) - hash + namespace.charCodeAt(i);
                            hash |= 0; // Convert to 32bit integer
                        }

                        return createDebug.colors[Math.abs(hash) % createDebug.colors.length];
                    }
                    createDebug.selectColor = selectColor;

                    /**
                     * Create a debugger with the given `namespace`.
                     *
                     * @param {String} namespace
                     * @return {Function}
                     * @api public
                     */
                    function createDebug(namespace) {
                        let prevTime;
                        let enableOverride = null;
                        let namespacesCache;
                        let enabledCache;

                        function debug(...args) {
                            // Disabled?
                            if (!debug.enabled) {
                                return;
                            }

                            const self = debug;

                            // Set `diff` timestamp
                            const curr = Number(new Date());
                            const ms = curr - (prevTime || curr);
                            self.diff = ms;
                            self.prev = prevTime;
                            self.curr = curr;
                            prevTime = curr;

                            args[0] = createDebug.coerce(args[0]);

                            if (typeof args[0] !== 'string') {
                                // Anything else let's inspect with %O
                                args.unshift('%O');
                            }

                            // Apply any `formatters` transformations
                            let index = 0;
                            args[0] = args[0].replace(/%([a-zA-Z%])/g, (match, format) => {
                                // If we encounter an escaped % then don't increase the array index
                                if (match === '%%') {
                                    return '%';
                                }
                                index++;
                                const formatter = createDebug.formatters[format];
                                if (typeof formatter === 'function') {
                                    const val = args[index];
                                    match = formatter.call(self, val);

                                    // Now we need to remove `args[index]` since it's inlined in the `format`
                                    args.splice(index, 1);
                                    index--;
                                }
                                return match;
                            });

                            // Apply env-specific formatting (colors, etc.)
                            createDebug.formatArgs.call(self, args);

                            const logFn = self.log || createDebug.log;
                            logFn.apply(self, args);
                        }

                        debug.namespace = namespace;
                        debug.useColors = createDebug.useColors();
                        debug.color = createDebug.selectColor(namespace);
                        debug.extend = extend;
                        debug.destroy = createDebug.destroy; // XXX Temporary. Will be removed in the next major release.

                        Object.defineProperty(debug, 'enabled', {
                            enumerable: true,
                            configurable: false,
                            get: () => {
                                if (enableOverride !== null) {
                                    return enableOverride;
                                }
                                if (namespacesCache !== createDebug.namespaces) {
                                    namespacesCache = createDebug.namespaces;
                                    enabledCache = createDebug.enabled(namespace);
                                }

                                return enabledCache;
                            },
                            set: (v) => {
                                enableOverride = v;
                            },
                        });

                        // Env-specific initialization logic for debug instances
                        if (typeof createDebug.init === 'function') {
                            createDebug.init(debug);
                        }

                        return debug;
                    }

                    function extend(namespace, delimiter) {
                        const newDebug = createDebug(
                            this.namespace + (typeof delimiter === 'undefined' ? ':' : delimiter) + namespace,
                        );
                        newDebug.log = this.log;
                        return newDebug;
                    }

                    /**
                     * Enables a debug mode by namespaces. This can include modes
                     * separated by a colon and wildcards.
                     *
                     * @param {String} namespaces
                     * @api public
                     */
                    function enable(namespaces) {
                        createDebug.save(namespaces);
                        createDebug.namespaces = namespaces;

                        createDebug.names = [];
                        createDebug.skips = [];

                        let i;
                        const split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
                        const len = split.length;

                        for (i = 0; i < len; i++) {
                            if (!split[i]) {
                                // ignore empty strings
                                continue;
                            }

                            namespaces = split[i].replace(/\*/g, '.*?');

                            if (namespaces[0] === '-') {
                                createDebug.skips.push(new RegExp('^' + namespaces.slice(1) + '$'));
                            } else {
                                createDebug.names.push(new RegExp('^' + namespaces + '$'));
                            }
                        }
                    }

                    /**
                     * Disable debug output.
                     *
                     * @return {String} namespaces
                     * @api public
                     */
                    function disable() {
                        const namespaces = [
                            ...createDebug.names.map(toNamespace),
                            ...createDebug.skips.map(toNamespace).map((namespace) => '-' + namespace),
                        ].join(',');
                        createDebug.enable('');
                        return namespaces;
                    }

                    /**
                     * Returns true if the given mode name is enabled, false otherwise.
                     *
                     * @param {String} name
                     * @return {Boolean}
                     * @api public
                     */
                    function enabled(name) {
                        if (name[name.length - 1] === '*') {
                            return true;
                        }

                        let i;
                        let len;

                        for (i = 0, len = createDebug.skips.length; i < len; i++) {
                            if (createDebug.skips[i].test(name)) {
                                return false;
                            }
                        }

                        for (i = 0, len = createDebug.names.length; i < len; i++) {
                            if (createDebug.names[i].test(name)) {
                                return true;
                            }
                        }

                        return false;
                    }

                    /**
                     * Convert regexp to namespace
                     *
                     * @param {RegExp} regxep
                     * @return {String} namespace
                     * @api private
                     */
                    function toNamespace(regexp) {
                        return regexp
                            .toString()
                            .substring(2, regexp.toString().length - 2)
                            .replace(/\.\*\?$/, '*');
                    }

                    /**
                     * Coerce `val`.
                     *
                     * @param {Mixed} val
                     * @return {Mixed}
                     * @api private
                     */
                    function coerce(val) {
                        if (val instanceof Error) {
                            return val.stack || val.message;
                        }
                        return val;
                    }

                    /**
                     * XXX DO NOT USE. This is a temporary stub function.
                     * XXX It WILL be removed in the next major release.
                     */
                    function destroy() {
                        console.warn(
                            'Instance method `debug.destroy()` is deprecated and no longer does anything. It will be removed in the next major version of `debug`.',
                        );
                    }

                    createDebug.enable(createDebug.load());

                    return createDebug;
                }

                module.exports = setup;
            },
            { ms: 43 },
        ],
        5: [
            function (require, module, exports) {
                'use strict';
                var __importDefault =
                    (this && this.__importDefault) ||
                    function (mod) {
                        return mod && mod.__esModule ? mod : { default: mod };
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Logger = void 0;
                const debug_1 = __importDefault(require('debug'));
                const APP_NAME = 'h264-profile-level-id';
                class Logger {
                    constructor(prefix) {
                        if (prefix) {
                            this._debug = (0, debug_1.default)(`${APP_NAME}:${prefix}`);
                            this._warn = (0, debug_1.default)(`${APP_NAME}:WARN:${prefix}`);
                            this._error = (0, debug_1.default)(`${APP_NAME}:ERROR:${prefix}`);
                        } else {
                            this._debug = (0, debug_1.default)(APP_NAME);
                            this._warn = (0, debug_1.default)(`${APP_NAME}:WARN`);
                            this._error = (0, debug_1.default)(`${APP_NAME}:ERROR`);
                        }
                        /* eslint-disable no-console */
                        this._debug.log = console.info.bind(console);
                        this._warn.log = console.warn.bind(console);
                        this._error.log = console.error.bind(console);
                        /* eslint-enable no-console */
                    }
                    get debug() {
                        return this._debug;
                    }
                    get warn() {
                        return this._warn;
                    }
                    get error() {
                        return this._error;
                    }
                }
                exports.Logger = Logger;
            },
            { debug: 3 },
        ],
        6: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.generateProfileLevelIdStringForAnswer =
                    exports.isSameProfile =
                    exports.parseSdpProfileLevelId =
                    exports.levelToString =
                    exports.profileToString =
                    exports.profileLevelIdToString =
                    exports.parseProfileLevelId =
                    exports.ProfileLevelId =
                    exports.Level =
                    exports.Profile =
                        void 0;
                const Logger_1 = require('./Logger');
                const logger = new Logger_1.Logger();
                /**
                 * Supported profiles.
                 */
                // ESLint absurdly complains about "'Profile' is already declared in
                // the upper scope".
                // eslint-disable-next-line no-shadow
                var Profile;
                (function (Profile) {
                    Profile[(Profile['ConstrainedBaseline'] = 1)] = 'ConstrainedBaseline';
                    Profile[(Profile['Baseline'] = 2)] = 'Baseline';
                    Profile[(Profile['Main'] = 3)] = 'Main';
                    Profile[(Profile['ConstrainedHigh'] = 4)] = 'ConstrainedHigh';
                    Profile[(Profile['High'] = 5)] = 'High';
                    Profile[(Profile['PredictiveHigh444'] = 6)] = 'PredictiveHigh444';
                })(Profile || (exports.Profile = Profile = {}));
                /**
                 * Supported levels.
                 */
                // ESLint absurdly complains about "'Level' is already declared in
                // the upper scope".
                // eslint-disable-next-line no-shadow
                var Level;
                (function (Level) {
                    Level[(Level['L1_b'] = 0)] = 'L1_b';
                    Level[(Level['L1'] = 10)] = 'L1';
                    Level[(Level['L1_1'] = 11)] = 'L1_1';
                    Level[(Level['L1_2'] = 12)] = 'L1_2';
                    Level[(Level['L1_3'] = 13)] = 'L1_3';
                    Level[(Level['L2'] = 20)] = 'L2';
                    Level[(Level['L2_1'] = 21)] = 'L2_1';
                    Level[(Level['L2_2'] = 22)] = 'L2_2';
                    Level[(Level['L3'] = 30)] = 'L3';
                    Level[(Level['L3_1'] = 31)] = 'L3_1';
                    Level[(Level['L3_2'] = 32)] = 'L3_2';
                    Level[(Level['L4'] = 40)] = 'L4';
                    Level[(Level['L4_1'] = 41)] = 'L4_1';
                    Level[(Level['L4_2'] = 42)] = 'L4_2';
                    Level[(Level['L5'] = 50)] = 'L5';
                    Level[(Level['L5_1'] = 51)] = 'L5_1';
                    Level[(Level['L5_2'] = 52)] = 'L5_2';
                })(Level || (exports.Level = Level = {}));
                /**
                 * Represents a parsed h264 profile-level-id value.
                 */
                class ProfileLevelId {
                    constructor(profile, level) {
                        this.profile = profile;
                        this.level = level;
                    }
                }
                exports.ProfileLevelId = ProfileLevelId;
                // Default ProfileLevelId.
                //
                // TODO: The default should really be profile Baseline and level 1 according to
                // the spec: https://tools.ietf.org/html/rfc6184#section-8.1. In order to not
                // break backwards compatibility with older versions of WebRTC where external
                // codecs don't have any parameters, use profile ConstrainedBaseline level 3_1
                // instead. This workaround will only be done in an interim period to allow
                // external clients to update their code.
                //
                // http://crbug/webrtc/6337.
                const DefaultProfileLevelId = new ProfileLevelId(Profile.ConstrainedBaseline, Level.L3_1);
                /**
                 * Class for matching bit patterns such as "x1xx0000" where 'x' is allowed to
                 * be either 0 or 1.
                 */
                class BitPattern {
                    constructor(str) {
                        this.mask = ~byteMaskString('x', str);
                        this.masked_value = byteMaskString('1', str);
                    }
                    isMatch(value) {
                        return this.masked_value === (value & this.mask);
                    }
                }
                /**
                 * Class for converting between profile_idc/profile_iop to Profile.
                 */
                class ProfilePattern {
                    constructor(profile_idc, profile_iop, profile) {
                        this.profile_idc = profile_idc;
                        this.profile_iop = profile_iop;
                        this.profile = profile;
                    }
                }
                // This is from https://tools.ietf.org/html/rfc6184#section-8.1.
                const ProfilePatterns = [
                    new ProfilePattern(0x42, new BitPattern('x1xx0000'), Profile.ConstrainedBaseline),
                    new ProfilePattern(0x4d, new BitPattern('1xxx0000'), Profile.ConstrainedBaseline),
                    new ProfilePattern(0x58, new BitPattern('11xx0000'), Profile.ConstrainedBaseline),
                    new ProfilePattern(0x42, new BitPattern('x0xx0000'), Profile.Baseline),
                    new ProfilePattern(0x58, new BitPattern('10xx0000'), Profile.Baseline),
                    new ProfilePattern(0x4d, new BitPattern('0x0x0000'), Profile.Main),
                    new ProfilePattern(0x64, new BitPattern('00000000'), Profile.High),
                    new ProfilePattern(0x64, new BitPattern('00001100'), Profile.ConstrainedHigh),
                    new ProfilePattern(0xf4, new BitPattern('00000000'), Profile.PredictiveHigh444),
                ];
                /**
                 * Parse profile level id that is represented as a string of 3 hex bytes.
                 * Nothing will be returned if the string is not a recognized H264 profile
                 * level id.
                 */
                function parseProfileLevelId(str) {
                    // For level_idc=11 and profile_idc=0x42, 0x4D, or 0x58, the constraint set3
                    // flag specifies if level 1b or level 1.1 is used.
                    const ConstraintSet3Flag = 0x10;
                    // The string should consist of 3 bytes in hexadecimal format.
                    if (typeof str !== 'string' || str.length !== 6) {
                        return undefined;
                    }
                    const profile_level_id_numeric = parseInt(str, 16);
                    if (profile_level_id_numeric === 0) {
                        return undefined;
                    }
                    // Separate into three bytes.
                    const level_idc = profile_level_id_numeric & 0xff;
                    const profile_iop = (profile_level_id_numeric >> 8) & 0xff;
                    const profile_idc = (profile_level_id_numeric >> 16) & 0xff;
                    // Parse level based on level_idc and constraint set 3 flag.
                    let level;
                    switch (level_idc) {
                        case Level.L1_1: {
                            level = (profile_iop & ConstraintSet3Flag) !== 0 ? Level.L1_b : Level.L1_1;
                            break;
                        }
                        case Level.L1:
                        case Level.L1_2:
                        case Level.L1_3:
                        case Level.L2:
                        case Level.L2_1:
                        case Level.L2_2:
                        case Level.L3:
                        case Level.L3_1:
                        case Level.L3_2:
                        case Level.L4:
                        case Level.L4_1:
                        case Level.L4_2:
                        case Level.L5:
                        case Level.L5_1:
                        case Level.L5_2: {
                            level = level_idc;
                            break;
                        }
                        // Unrecognized level_idc.
                        default: {
                            logger.warn(
                                `parseProfileLevelId() | unrecognized level_idc [str:${str}, level_idc:${level_idc}]`,
                            );
                            return undefined;
                        }
                    }
                    // Parse profile_idc/profile_iop into a Profile enum.
                    for (const pattern of ProfilePatterns) {
                        if (profile_idc === pattern.profile_idc && pattern.profile_iop.isMatch(profile_iop)) {
                            return new ProfileLevelId(pattern.profile, level);
                        }
                    }
                    logger.warn(
                        `parseProfileLevelId() | unrecognized profile_idc/profile_iop combination [str:${str}, profile_idc:${profile_idc}, profile_iop:${profile_iop}]`,
                    );
                    return undefined;
                }
                exports.parseProfileLevelId = parseProfileLevelId;
                /**
                 * Returns canonical string representation as three hex bytes of the profile
                 * level id, or returns nothing for invalid profile level ids.
                 */
                function profileLevelIdToString(profile_level_id) {
                    // Handle special case level == 1b.
                    if (profile_level_id.level == Level.L1_b) {
                        switch (profile_level_id.profile) {
                            case Profile.ConstrainedBaseline: {
                                return '42f00b';
                            }
                            case Profile.Baseline: {
                                return '42100b';
                            }
                            case Profile.Main: {
                                return '4d100b';
                            }
                            // Level 1_b is not allowed for other profiles.
                            default: {
                                logger.warn(
                                    `profileLevelIdToString() | Level 1_b not is allowed for profile ${profile_level_id.profile}`,
                                );
                                return undefined;
                            }
                        }
                    }
                    let profile_idc_iop_string;
                    switch (profile_level_id.profile) {
                        case Profile.ConstrainedBaseline: {
                            profile_idc_iop_string = '42e0';
                            break;
                        }
                        case Profile.Baseline: {
                            profile_idc_iop_string = '4200';
                            break;
                        }
                        case Profile.Main: {
                            profile_idc_iop_string = '4d00';
                            break;
                        }
                        case Profile.ConstrainedHigh: {
                            profile_idc_iop_string = '640c';
                            break;
                        }
                        case Profile.High: {
                            profile_idc_iop_string = '6400';
                            break;
                        }
                        case Profile.PredictiveHigh444: {
                            profile_idc_iop_string = 'f400';
                            break;
                        }
                        default: {
                            logger.warn(`profileLevelIdToString() | unrecognized profile ${profile_level_id.profile}`);
                            return undefined;
                        }
                    }
                    let levelStr = profile_level_id.level.toString(16);
                    if (levelStr.length === 1) {
                        levelStr = `0${levelStr}`;
                    }
                    return `${profile_idc_iop_string}${levelStr}`;
                }
                exports.profileLevelIdToString = profileLevelIdToString;
                /**
                 * Returns a human friendly name for the given profile.
                 */
                function profileToString(profile) {
                    switch (profile) {
                        case Profile.ConstrainedBaseline: {
                            return 'ConstrainedBaseline';
                        }
                        case Profile.Baseline: {
                            return 'Baseline';
                        }
                        case Profile.Main: {
                            return 'Main';
                        }
                        case Profile.ConstrainedHigh: {
                            return 'ConstrainedHigh';
                        }
                        case Profile.High: {
                            return 'High';
                        }
                        case Profile.PredictiveHigh444: {
                            return 'PredictiveHigh444';
                        }
                        default: {
                            logger.warn(`profileToString() | unrecognized profile ${profile}`);
                            return undefined;
                        }
                    }
                }
                exports.profileToString = profileToString;
                /**
                 * Returns a human friendly name for the given level.
                 */
                function levelToString(level) {
                    switch (level) {
                        case Level.L1_b: {
                            return '1b';
                        }
                        case Level.L1: {
                            return '1';
                        }
                        case Level.L1_1: {
                            return '1.1';
                        }
                        case Level.L1_2: {
                            return '1.2';
                        }
                        case Level.L1_3: {
                            return '1.3';
                        }
                        case Level.L2: {
                            return '2';
                        }
                        case Level.L2_1: {
                            return '2.1';
                        }
                        case Level.L2_2: {
                            return '2.2';
                        }
                        case Level.L3: {
                            return '3';
                        }
                        case Level.L3_1: {
                            return '3.1';
                        }
                        case Level.L3_2: {
                            return '3.2';
                        }
                        case Level.L4: {
                            return '4';
                        }
                        case Level.L4_1: {
                            return '4.1';
                        }
                        case Level.L4_2: {
                            return '4.2';
                        }
                        case Level.L5: {
                            return '5';
                        }
                        case Level.L5_1: {
                            return '5.1';
                        }
                        case Level.L5_2: {
                            return '5.2';
                        }
                        default: {
                            logger.warn(`levelToString() | unrecognized level ${level}`);
                            return undefined;
                        }
                    }
                }
                exports.levelToString = levelToString;
                /**
                 * Parse profile level id that is represented as a string of 3 hex bytes
                 * contained in an SDP key-value map. A default profile level id will be
                 * returned if the profile-level-id key is missing. Nothing will be returned
                 * if the key is present but the string is invalid.
                 */
                function parseSdpProfileLevelId(params = {}) {
                    const profile_level_id = params['profile-level-id'];
                    return profile_level_id ? parseProfileLevelId(profile_level_id) : DefaultProfileLevelId;
                }
                exports.parseSdpProfileLevelId = parseSdpProfileLevelId;
                /**
                 * Returns true if the parameters have the same H264 profile, i.e. the same
                 * H264 profile (Baseline, High, etc).
                 */
                function isSameProfile(params1 = {}, params2 = {}) {
                    const profile_level_id_1 = parseSdpProfileLevelId(params1);
                    const profile_level_id_2 = parseSdpProfileLevelId(params2);
                    // Compare H264 profiles, but not levels.
                    return Boolean(
                        profile_level_id_1 &&
                            profile_level_id_2 &&
                            profile_level_id_1.profile === profile_level_id_2.profile,
                    );
                }
                exports.isSameProfile = isSameProfile;
                /**
                 * Generate codec parameters that will be used as answer in an SDP negotiation
                 * based on local supported parameters and remote offered parameters. Both
                 * local_supported_params and remote_offered_params represent sendrecv media
                 * descriptions, i.e they are a mix of both encode and decode capabilities. In
                 * theory, when the profile in local_supported_params represent a strict
                 * superset of the profile in remote_offered_params, we could limit the profile
                 * in the answer to the profile in remote_offered_params.
                 *
                 * However, to simplify the code, each supported H264 profile should be listed
                 * explicitly in the list of local supported codecs, even if they are redundant.
                 * Then each local codec in the list should be tested one at a time against the
                 * remote codec, and only when the profiles are equal should this function be
                 * called. Therefore, this function does not need to handle profile intersection,
                 * and the profile of local_supported_params and remote_offered_params must be
                 * equal before calling this function. The parameters that are used when
                 * negotiating are the level part of profile-level-id and
                 * level-asymmetry-allowed.
                 */
                function generateProfileLevelIdStringForAnswer(
                    local_supported_params = {},
                    remote_offered_params = {},
                ) {
                    // If both local and remote params do not contain profile-level-id, they are
                    // both using the default profile. In this case, don't return anything.
                    if (!local_supported_params['profile-level-id'] && !remote_offered_params['profile-level-id']) {
                        logger.warn(
                            'generateProfileLevelIdStringForAnswer() | profile-level-id missing in local and remote params',
                        );
                        return undefined;
                    }
                    // Parse profile-level-ids.
                    const local_profile_level_id = parseSdpProfileLevelId(local_supported_params);
                    const remote_profile_level_id = parseSdpProfileLevelId(remote_offered_params);
                    // The local and remote codec must have valid and equal H264 Profiles.
                    if (!local_profile_level_id) {
                        throw new TypeError('invalid local_profile_level_id');
                    }
                    if (!remote_profile_level_id) {
                        throw new TypeError('invalid remote_profile_level_id');
                    }
                    if (local_profile_level_id.profile !== remote_profile_level_id.profile) {
                        throw new TypeError('H264 Profile mismatch');
                    }
                    // Parse level information.
                    const level_asymmetry_allowed =
                        isLevelAsymmetryAllowed(local_supported_params) &&
                        isLevelAsymmetryAllowed(remote_offered_params);
                    const local_level = local_profile_level_id.level;
                    const remote_level = remote_profile_level_id.level;
                    const min_level = minLevel(local_level, remote_level);
                    // Determine answer level. When level asymmetry is not allowed, level upgrade
                    // is not allowed, i.e., the level in the answer must be equal to or lower
                    // than the level in the offer.
                    const answer_level = level_asymmetry_allowed ? local_level : min_level;
                    logger.debug(
                        `generateProfileLevelIdStringForAnswer() | result [profile:${local_profile_level_id.profile}, level:${answer_level}]`,
                    );
                    // Return the resulting profile-level-id for the answer parameters.
                    return profileLevelIdToString(new ProfileLevelId(local_profile_level_id.profile, answer_level));
                }
                exports.generateProfileLevelIdStringForAnswer = generateProfileLevelIdStringForAnswer;
                /**
                 * Convert a string of 8 characters into a byte where the positions containing
                 * character c will have their bit set. For example, c = 'x', str = "x1xx0000"
                 * will return 0b10110000.
                 */
                function byteMaskString(c, str) {
                    return (
                        (Number(str[0] === c) << 7) |
                        (Number(str[1] === c) << 6) |
                        (Number(str[2] === c) << 5) |
                        (Number(str[3] === c) << 4) |
                        (Number(str[4] === c) << 3) |
                        (Number(str[5] === c) << 2) |
                        (Number(str[6] === c) << 1) |
                        (Number(str[7] === c) << 0)
                    );
                }
                // Compare H264 levels and handle the level 1b case.
                function isLessLevel(a, b) {
                    if (a === Level.L1_b) {
                        return b !== Level.L1 && b !== Level.L1_b;
                    }
                    if (b === Level.L1_b) {
                        return a !== Level.L1;
                    }
                    return a < b;
                }
                function minLevel(a, b) {
                    return isLessLevel(a, b) ? a : b;
                }
                function isLevelAsymmetryAllowed(params = {}) {
                    const level_asymmetry_allowed = params['level-asymmetry-allowed'];
                    return (
                        level_asymmetry_allowed === true ||
                        level_asymmetry_allowed === 1 ||
                        level_asymmetry_allowed === '1'
                    );
                }
            },
            { './Logger': 5 },
        ],
        7: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Consumer = void 0;
                const Logger_1 = require('./Logger');
                const EnhancedEventEmitter_1 = require('./EnhancedEventEmitter');
                const errors_1 = require('./errors');
                const logger = new Logger_1.Logger('Consumer');
                class Consumer extends EnhancedEventEmitter_1.EnhancedEventEmitter {
                    constructor({ id, localId, producerId, rtpReceiver, track, rtpParameters, appData }) {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Observer instance.
                        this._observer = new EnhancedEventEmitter_1.EnhancedEventEmitter();
                        logger.debug('constructor()');
                        this._id = id;
                        this._localId = localId;
                        this._producerId = producerId;
                        this._rtpReceiver = rtpReceiver;
                        this._track = track;
                        this._rtpParameters = rtpParameters;
                        this._paused = !track.enabled;
                        this._appData = appData || {};
                        this.onTrackEnded = this.onTrackEnded.bind(this);
                        this.handleTrack();
                    }
                    /**
                     * Consumer id.
                     */
                    get id() {
                        return this._id;
                    }
                    /**
                     * Local id.
                     */
                    get localId() {
                        return this._localId;
                    }
                    /**
                     * Associated Producer id.
                     */
                    get producerId() {
                        return this._producerId;
                    }
                    /**
                     * Whether the Consumer is closed.
                     */
                    get closed() {
                        return this._closed;
                    }
                    /**
                     * Media kind.
                     */
                    get kind() {
                        return this._track.kind;
                    }
                    /**
                     * Associated RTCRtpReceiver.
                     */
                    get rtpReceiver() {
                        return this._rtpReceiver;
                    }
                    /**
                     * The associated track.
                     */
                    get track() {
                        return this._track;
                    }
                    /**
                     * RTP parameters.
                     */
                    get rtpParameters() {
                        return this._rtpParameters;
                    }
                    /**
                     * Whether the Consumer is paused.
                     */
                    get paused() {
                        return this._paused;
                    }
                    /**
                     * App custom data.
                     */
                    get appData() {
                        return this._appData;
                    }
                    /**
                     * App custom data setter.
                     */
                    set appData(appData) {
                        this._appData = appData;
                    }
                    get observer() {
                        return this._observer;
                    }
                    /**
                     * Closes the Consumer.
                     */
                    close() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('close()');
                        this._closed = true;
                        this.destroyTrack();
                        this.emit('@close');
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    /**
                     * Transport was closed.
                     */
                    transportClosed() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('transportClosed()');
                        this._closed = true;
                        this.destroyTrack();
                        this.safeEmit('transportclose');
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    /**
                     * Get associated RTCRtpReceiver stats.
                     */
                    async getStats() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        }
                        return new Promise((resolve, reject) => {
                            this.safeEmit('@getstats', resolve, reject);
                        });
                    }
                    /**
                     * Pauses receiving media.
                     */
                    pause() {
                        logger.debug('pause()');
                        if (this._closed) {
                            logger.error('pause() | Consumer closed');
                            return;
                        }
                        if (this._paused) {
                            logger.debug('pause() | Consumer is already paused');
                            return;
                        }
                        this._paused = true;
                        this._track.enabled = false;
                        this.emit('@pause');
                        // Emit observer event.
                        this._observer.safeEmit('pause');
                    }
                    /**
                     * Resumes receiving media.
                     */
                    resume() {
                        logger.debug('resume()');
                        if (this._closed) {
                            logger.error('resume() | Consumer closed');
                            return;
                        }
                        if (!this._paused) {
                            logger.debug('resume() | Consumer is already resumed');
                            return;
                        }
                        this._paused = false;
                        this._track.enabled = true;
                        this.emit('@resume');
                        // Emit observer event.
                        this._observer.safeEmit('resume');
                    }
                    onTrackEnded() {
                        logger.debug('track "ended" event');
                        this.safeEmit('trackended');
                        // Emit observer event.
                        this._observer.safeEmit('trackended');
                    }
                    handleTrack() {
                        this._track.addEventListener('ended', this.onTrackEnded);
                    }
                    destroyTrack() {
                        try {
                            this._track.removeEventListener('ended', this.onTrackEnded);
                            this._track.stop();
                        } catch (error) {}
                    }
                }
                exports.Consumer = Consumer;
            },
            { './EnhancedEventEmitter': 11, './Logger': 12, './errors': 17 },
        ],
        8: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.DataConsumer = void 0;
                const Logger_1 = require('./Logger');
                const EnhancedEventEmitter_1 = require('./EnhancedEventEmitter');
                const logger = new Logger_1.Logger('DataConsumer');
                class DataConsumer extends EnhancedEventEmitter_1.EnhancedEventEmitter {
                    constructor({ id, dataProducerId, dataChannel, sctpStreamParameters, appData }) {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Observer instance.
                        this._observer = new EnhancedEventEmitter_1.EnhancedEventEmitter();
                        logger.debug('constructor()');
                        this._id = id;
                        this._dataProducerId = dataProducerId;
                        this._dataChannel = dataChannel;
                        this._sctpStreamParameters = sctpStreamParameters;
                        this._appData = appData || {};
                        this.handleDataChannel();
                    }
                    /**
                     * DataConsumer id.
                     */
                    get id() {
                        return this._id;
                    }
                    /**
                     * Associated DataProducer id.
                     */
                    get dataProducerId() {
                        return this._dataProducerId;
                    }
                    /**
                     * Whether the DataConsumer is closed.
                     */
                    get closed() {
                        return this._closed;
                    }
                    /**
                     * SCTP stream parameters.
                     */
                    get sctpStreamParameters() {
                        return this._sctpStreamParameters;
                    }
                    /**
                     * DataChannel readyState.
                     */
                    get readyState() {
                        return this._dataChannel.readyState;
                    }
                    /**
                     * DataChannel label.
                     */
                    get label() {
                        return this._dataChannel.label;
                    }
                    /**
                     * DataChannel protocol.
                     */
                    get protocol() {
                        return this._dataChannel.protocol;
                    }
                    /**
                     * DataChannel binaryType.
                     */
                    get binaryType() {
                        return this._dataChannel.binaryType;
                    }
                    /**
                     * Set DataChannel binaryType.
                     */
                    set binaryType(binaryType) {
                        this._dataChannel.binaryType = binaryType;
                    }
                    /**
                     * App custom data.
                     */
                    get appData() {
                        return this._appData;
                    }
                    /**
                     * App custom data setter.
                     */
                    set appData(appData) {
                        this._appData = appData;
                    }
                    get observer() {
                        return this._observer;
                    }
                    /**
                     * Closes the DataConsumer.
                     */
                    close() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('close()');
                        this._closed = true;
                        this._dataChannel.close();
                        this.emit('@close');
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    /**
                     * Transport was closed.
                     */
                    transportClosed() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('transportClosed()');
                        this._closed = true;
                        this._dataChannel.close();
                        this.safeEmit('transportclose');
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    handleDataChannel() {
                        this._dataChannel.addEventListener('open', () => {
                            if (this._closed) {
                                return;
                            }
                            logger.debug('DataChannel "open" event');
                            this.safeEmit('open');
                        });
                        this._dataChannel.addEventListener('error', (event) => {
                            if (this._closed) {
                                return;
                            }
                            let { error } = event;
                            if (!error) {
                                error = new Error('unknown DataChannel error');
                            }
                            if (error.errorDetail === 'sctp-failure') {
                                logger.error(
                                    'DataChannel SCTP error [sctpCauseCode:%s]: %s',
                                    error.sctpCauseCode,
                                    error.message,
                                );
                            } else {
                                logger.error('DataChannel "error" event: %o', error);
                            }
                            this.safeEmit('error', error);
                        });
                        this._dataChannel.addEventListener('close', () => {
                            if (this._closed) {
                                return;
                            }
                            logger.warn('DataChannel "close" event');
                            this._closed = true;
                            this.emit('@close');
                            this.safeEmit('close');
                            // Emit observer event.
                            this._observer.safeEmit('close');
                        });
                        this._dataChannel.addEventListener('message', (event) => {
                            if (this._closed) {
                                return;
                            }
                            this.safeEmit('message', event.data);
                        });
                    }
                }
                exports.DataConsumer = DataConsumer;
            },
            { './EnhancedEventEmitter': 11, './Logger': 12 },
        ],
        9: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.DataProducer = void 0;
                const Logger_1 = require('./Logger');
                const EnhancedEventEmitter_1 = require('./EnhancedEventEmitter');
                const errors_1 = require('./errors');
                const logger = new Logger_1.Logger('DataProducer');
                class DataProducer extends EnhancedEventEmitter_1.EnhancedEventEmitter {
                    constructor({ id, dataChannel, sctpStreamParameters, appData }) {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Observer instance.
                        this._observer = new EnhancedEventEmitter_1.EnhancedEventEmitter();
                        logger.debug('constructor()');
                        this._id = id;
                        this._dataChannel = dataChannel;
                        this._sctpStreamParameters = sctpStreamParameters;
                        this._appData = appData || {};
                        this.handleDataChannel();
                    }
                    /**
                     * DataProducer id.
                     */
                    get id() {
                        return this._id;
                    }
                    /**
                     * Whether the DataProducer is closed.
                     */
                    get closed() {
                        return this._closed;
                    }
                    /**
                     * SCTP stream parameters.
                     */
                    get sctpStreamParameters() {
                        return this._sctpStreamParameters;
                    }
                    /**
                     * DataChannel readyState.
                     */
                    get readyState() {
                        return this._dataChannel.readyState;
                    }
                    /**
                     * DataChannel label.
                     */
                    get label() {
                        return this._dataChannel.label;
                    }
                    /**
                     * DataChannel protocol.
                     */
                    get protocol() {
                        return this._dataChannel.protocol;
                    }
                    /**
                     * DataChannel bufferedAmount.
                     */
                    get bufferedAmount() {
                        return this._dataChannel.bufferedAmount;
                    }
                    /**
                     * DataChannel bufferedAmountLowThreshold.
                     */
                    get bufferedAmountLowThreshold() {
                        return this._dataChannel.bufferedAmountLowThreshold;
                    }
                    /**
                     * Set DataChannel bufferedAmountLowThreshold.
                     */
                    set bufferedAmountLowThreshold(bufferedAmountLowThreshold) {
                        this._dataChannel.bufferedAmountLowThreshold = bufferedAmountLowThreshold;
                    }
                    /**
                     * App custom data.
                     */
                    get appData() {
                        return this._appData;
                    }
                    /**
                     * App custom data setter.
                     */
                    set appData(appData) {
                        this._appData = appData;
                    }
                    get observer() {
                        return this._observer;
                    }
                    /**
                     * Closes the DataProducer.
                     */
                    close() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('close()');
                        this._closed = true;
                        this._dataChannel.close();
                        this.emit('@close');
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    /**
                     * Transport was closed.
                     */
                    transportClosed() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('transportClosed()');
                        this._closed = true;
                        this._dataChannel.close();
                        this.safeEmit('transportclose');
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    /**
                     * Send a message.
                     *
                     * @param {String|Blob|ArrayBuffer|ArrayBufferView} data.
                     */
                    send(data) {
                        logger.debug('send()');
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        }
                        this._dataChannel.send(data);
                    }
                    handleDataChannel() {
                        this._dataChannel.addEventListener('open', () => {
                            if (this._closed) {
                                return;
                            }
                            logger.debug('DataChannel "open" event');
                            this.safeEmit('open');
                        });
                        this._dataChannel.addEventListener('error', (event) => {
                            if (this._closed) {
                                return;
                            }
                            let { error } = event;
                            if (!error) {
                                error = new Error('unknown DataChannel error');
                            }
                            if (error.errorDetail === 'sctp-failure') {
                                logger.error(
                                    'DataChannel SCTP error [sctpCauseCode:%s]: %s',
                                    error.sctpCauseCode,
                                    error.message,
                                );
                            } else {
                                logger.error('DataChannel "error" event: %o', error);
                            }
                            this.safeEmit('error', error);
                        });
                        this._dataChannel.addEventListener('close', () => {
                            if (this._closed) {
                                return;
                            }
                            logger.warn('DataChannel "close" event');
                            this._closed = true;
                            this.emit('@close');
                            this.safeEmit('close');
                            // Emit observer event.
                            this._observer.safeEmit('close');
                        });
                        this._dataChannel.addEventListener('message', () => {
                            if (this._closed) {
                                return;
                            }
                            logger.warn('DataChannel "message" event in a DataProducer, message discarded');
                        });
                        this._dataChannel.addEventListener('bufferedamountlow', () => {
                            if (this._closed) {
                                return;
                            }
                            this.safeEmit('bufferedamountlow');
                        });
                    }
                }
                exports.DataProducer = DataProducer;
            },
            { './EnhancedEventEmitter': 11, './Logger': 12, './errors': 17 },
        ],
        10: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Device = exports.detectDevice = void 0;
                const ua_parser_js_1 = require('ua-parser-js');
                const Logger_1 = require('./Logger');
                const EnhancedEventEmitter_1 = require('./EnhancedEventEmitter');
                const errors_1 = require('./errors');
                const utils = __importStar(require('./utils'));
                const ortc = __importStar(require('./ortc'));
                const Transport_1 = require('./Transport');
                const Chrome111_1 = require('./handlers/Chrome111');
                const Chrome74_1 = require('./handlers/Chrome74');
                const Chrome70_1 = require('./handlers/Chrome70');
                const Chrome67_1 = require('./handlers/Chrome67');
                const Chrome55_1 = require('./handlers/Chrome55');
                const Firefox120_1 = require('./handlers/Firefox120');
                const Firefox60_1 = require('./handlers/Firefox60');
                const Safari12_1 = require('./handlers/Safari12');
                const Safari11_1 = require('./handlers/Safari11');
                const Edge11_1 = require('./handlers/Edge11');
                const ReactNativeUnifiedPlan_1 = require('./handlers/ReactNativeUnifiedPlan');
                const ReactNative_1 = require('./handlers/ReactNative');
                const logger = new Logger_1.Logger('Device');
                function detectDevice() {
                    // React-Native.
                    // NOTE: react-native-webrtc >= 1.75.0 is required.
                    // NOTE: react-native-webrtc with Unified Plan requires version >= 106.0.0.
                    if (typeof navigator === 'object' && navigator.product === 'ReactNative') {
                        logger.debug('detectDevice() | React-Native detected');
                        if (typeof RTCPeerConnection === 'undefined') {
                            logger.warn(
                                'detectDevice() | unsupported react-native-webrtc without RTCPeerConnection, forgot to call registerGlobals()?',
                            );
                            return undefined;
                        }
                        if (typeof RTCRtpTransceiver !== 'undefined') {
                            logger.debug('detectDevice() | ReactNative UnifiedPlan handler chosen');
                            return 'ReactNativeUnifiedPlan';
                        } else {
                            logger.debug('detectDevice() | ReactNative PlanB handler chosen');
                            return 'ReactNative';
                        }
                    }
                    // Browser.
                    else if (typeof navigator === 'object' && typeof navigator.userAgent === 'string') {
                        const ua = navigator.userAgent;
                        const uaParser = new ua_parser_js_1.UAParser(ua);
                        logger.debug('detectDevice() | browser detected [ua:%s, parsed:%o]', ua, uaParser.getResult());
                        const browser = uaParser.getBrowser();
                        const browserName = browser.name?.toLowerCase();
                        const browserVersion = parseInt(browser.major ?? '0');
                        const engine = uaParser.getEngine();
                        const engineName = engine.name?.toLowerCase();
                        const os = uaParser.getOS();
                        const osName = os.name?.toLowerCase();
                        const osVersion = parseFloat(os.version ?? '0');
                        const device = uaParser.getDevice();
                        const deviceModel = device.model?.toLowerCase();
                        const isIOS = osName === 'ios' || deviceModel === 'ipad';
                        const isChrome =
                            browserName &&
                            ['chrome', 'chromium', 'mobile chrome', 'chrome webview', 'chrome headless'].includes(
                                browserName,
                            );
                        const isFirefox =
                            browserName && ['firefox', 'mobile firefox', 'mobile focus'].includes(browserName);
                        const isSafari = browserName && ['safari', 'mobile safari'].includes(browserName);
                        const isEdge = browserName && ['edge'].includes(browserName);
                        // Chrome, Chromium, and Edge.
                        if ((isChrome || isEdge) && !isIOS && browserVersion >= 111) {
                            return 'Chrome111';
                        } else if (
                            (isChrome && !isIOS && browserVersion >= 74) ||
                            (isEdge && !isIOS && browserVersion >= 88)
                        ) {
                            return 'Chrome74';
                        } else if (isChrome && !isIOS && browserVersion >= 70) {
                            return 'Chrome70';
                        } else if (isChrome && !isIOS && browserVersion >= 67) {
                            return 'Chrome67';
                        } else if (isChrome && !isIOS && browserVersion >= 55) {
                            return 'Chrome55';
                        }
                        // Firefox.
                        else if (isFirefox && !isIOS && browserVersion >= 120) {
                            return 'Firefox120';
                        } else if (isFirefox && !isIOS && browserVersion >= 60) {
                            return 'Firefox60';
                        }
                        // Firefox on iOS (so Safari).
                        else if (isFirefox && isIOS && osVersion >= 14.3) {
                            return 'Safari12';
                        }
                        // Safari with Unified-Plan support enabled.
                        else if (
                            isSafari &&
                            browserVersion >= 12 &&
                            typeof RTCRtpTransceiver !== 'undefined' &&
                            RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')
                        ) {
                            return 'Safari12';
                        }
                        // Safari with Plab-B support.
                        else if (isSafari && browserVersion >= 11) {
                            return 'Safari11';
                        }
                        // Old Edge with ORTC support.
                        else if (isEdge && !isIOS && browserVersion >= 11 && browserVersion <= 18) {
                            return 'Edge11';
                        }
                        // Best effort for WebKit based browsers in iOS.
                        else if (
                            engineName === 'webkit' &&
                            isIOS &&
                            typeof RTCRtpTransceiver !== 'undefined' &&
                            RTCRtpTransceiver.prototype.hasOwnProperty('currentDirection')
                        ) {
                            return 'Safari12';
                        }
                        // Best effort for Chromium based browsers.
                        else if (engineName === 'blink') {
                            const match = ua.match(/(?:(?:Chrome|Chromium))[ /](\w+)/i);
                            if (match) {
                                const version = Number(match[1]);
                                if (version >= 111) {
                                    return 'Chrome111';
                                } else if (version >= 74) {
                                    return 'Chrome74';
                                } else if (version >= 70) {
                                    return 'Chrome70';
                                } else if (version >= 67) {
                                    return 'Chrome67';
                                } else {
                                    return 'Chrome55';
                                }
                            } else {
                                return 'Chrome111';
                            }
                        }
                        // Unsupported browser.
                        else {
                            logger.warn(
                                'detectDevice() | browser not supported [name:%s, version:%s]',
                                browserName,
                                browserVersion,
                            );
                            return undefined;
                        }
                    }
                    // Unknown device.
                    else {
                        logger.warn('detectDevice() | unknown device');
                        return undefined;
                    }
                }
                exports.detectDevice = detectDevice;
                class Device {
                    /**
                     * Create a new Device to connect to mediasoup server.
                     *
                     * @throws {UnsupportedError} if device is not supported.
                     */
                    constructor({ handlerName, handlerFactory, Handler } = {}) {
                        // Loaded flag.
                        this._loaded = false;
                        // Observer instance.
                        this._observer = new EnhancedEventEmitter_1.EnhancedEventEmitter();
                        logger.debug('constructor()');
                        // Handle deprecated option.
                        if (Handler) {
                            logger.warn(
                                'constructor() | Handler option is DEPRECATED, use handlerName or handlerFactory instead',
                            );
                            if (typeof Handler === 'string') {
                                handlerName = Handler;
                            } else {
                                throw new TypeError(
                                    'non string Handler option no longer supported, use handlerFactory instead',
                                );
                            }
                        }
                        if (handlerName && handlerFactory) {
                            throw new TypeError('just one of handlerName or handlerInterface can be given');
                        }
                        if (handlerFactory) {
                            this._handlerFactory = handlerFactory;
                        } else {
                            if (handlerName) {
                                logger.debug('constructor() | handler given: %s', handlerName);
                            } else {
                                handlerName = detectDevice();
                                if (handlerName) {
                                    logger.debug('constructor() | detected handler: %s', handlerName);
                                } else {
                                    throw new errors_1.UnsupportedError('device not supported');
                                }
                            }
                            switch (handlerName) {
                                case 'Chrome111': {
                                    this._handlerFactory = Chrome111_1.Chrome111.createFactory();
                                    break;
                                }
                                case 'Chrome74': {
                                    this._handlerFactory = Chrome74_1.Chrome74.createFactory();
                                    break;
                                }
                                case 'Chrome70': {
                                    this._handlerFactory = Chrome70_1.Chrome70.createFactory();
                                    break;
                                }
                                case 'Chrome67': {
                                    this._handlerFactory = Chrome67_1.Chrome67.createFactory();
                                    break;
                                }
                                case 'Chrome55': {
                                    this._handlerFactory = Chrome55_1.Chrome55.createFactory();
                                    break;
                                }
                                case 'Firefox120': {
                                    this._handlerFactory = Firefox120_1.Firefox120.createFactory();
                                    break;
                                }
                                case 'Firefox60': {
                                    this._handlerFactory = Firefox60_1.Firefox60.createFactory();
                                    break;
                                }
                                case 'Safari12': {
                                    this._handlerFactory = Safari12_1.Safari12.createFactory();
                                    break;
                                }
                                case 'Safari11': {
                                    this._handlerFactory = Safari11_1.Safari11.createFactory();
                                    break;
                                }
                                case 'Edge11': {
                                    this._handlerFactory = Edge11_1.Edge11.createFactory();
                                    break;
                                }
                                case 'ReactNativeUnifiedPlan': {
                                    this._handlerFactory =
                                        ReactNativeUnifiedPlan_1.ReactNativeUnifiedPlan.createFactory();
                                    break;
                                }
                                case 'ReactNative': {
                                    this._handlerFactory = ReactNative_1.ReactNative.createFactory();
                                    break;
                                }
                                default: {
                                    throw new TypeError(`unknown handlerName "${handlerName}"`);
                                }
                            }
                        }
                        // Create a temporal handler to get its name.
                        const handler = this._handlerFactory();
                        this._handlerName = handler.name;
                        handler.close();
                        this._extendedRtpCapabilities = undefined;
                        this._recvRtpCapabilities = undefined;
                        this._canProduceByKind = {
                            audio: false,
                            video: false,
                        };
                        this._sctpCapabilities = undefined;
                    }
                    /**
                     * The RTC handler name.
                     */
                    get handlerName() {
                        return this._handlerName;
                    }
                    /**
                     * Whether the Device is loaded.
                     */
                    get loaded() {
                        return this._loaded;
                    }
                    /**
                     * RTP capabilities of the Device for receiving media.
                     *
                     * @throws {InvalidStateError} if not loaded.
                     */
                    get rtpCapabilities() {
                        if (!this._loaded) {
                            throw new errors_1.InvalidStateError('not loaded');
                        }
                        return this._recvRtpCapabilities;
                    }
                    /**
                     * SCTP capabilities of the Device.
                     *
                     * @throws {InvalidStateError} if not loaded.
                     */
                    get sctpCapabilities() {
                        if (!this._loaded) {
                            throw new errors_1.InvalidStateError('not loaded');
                        }
                        return this._sctpCapabilities;
                    }
                    get observer() {
                        return this._observer;
                    }
                    /**
                     * Initialize the Device.
                     */
                    async load({ routerRtpCapabilities }) {
                        logger.debug('load() [routerRtpCapabilities:%o]', routerRtpCapabilities);
                        routerRtpCapabilities = utils.clone(routerRtpCapabilities);
                        // Temporal handler to get its capabilities.
                        let handler;
                        try {
                            if (this._loaded) {
                                throw new errors_1.InvalidStateError('already loaded');
                            }
                            // This may throw.
                            ortc.validateRtpCapabilities(routerRtpCapabilities);
                            handler = this._handlerFactory();
                            const nativeRtpCapabilities = await handler.getNativeRtpCapabilities();
                            logger.debug('load() | got native RTP capabilities:%o', nativeRtpCapabilities);
                            // This may throw.
                            ortc.validateRtpCapabilities(nativeRtpCapabilities);
                            // Get extended RTP capabilities.
                            this._extendedRtpCapabilities = ortc.getExtendedRtpCapabilities(
                                nativeRtpCapabilities,
                                routerRtpCapabilities,
                            );
                            logger.debug('load() | got extended RTP capabilities:%o', this._extendedRtpCapabilities);
                            // Check whether we can produce audio/video.
                            this._canProduceByKind.audio = ortc.canSend('audio', this._extendedRtpCapabilities);
                            this._canProduceByKind.video = ortc.canSend('video', this._extendedRtpCapabilities);
                            // Generate our receiving RTP capabilities for receiving media.
                            this._recvRtpCapabilities = ortc.getRecvRtpCapabilities(this._extendedRtpCapabilities);
                            // This may throw.
                            ortc.validateRtpCapabilities(this._recvRtpCapabilities);
                            logger.debug('load() | got receiving RTP capabilities:%o', this._recvRtpCapabilities);
                            // Generate our SCTP capabilities.
                            this._sctpCapabilities = await handler.getNativeSctpCapabilities();
                            logger.debug('load() | got native SCTP capabilities:%o', this._sctpCapabilities);
                            // This may throw.
                            ortc.validateSctpCapabilities(this._sctpCapabilities);
                            logger.debug('load() succeeded');
                            this._loaded = true;
                            handler.close();
                        } catch (error) {
                            if (handler) {
                                handler.close();
                            }
                            throw error;
                        }
                    }
                    /**
                     * Whether we can produce audio/video.
                     *
                     * @throws {InvalidStateError} if not loaded.
                     * @throws {TypeError} if wrong arguments.
                     */
                    canProduce(kind) {
                        if (!this._loaded) {
                            throw new errors_1.InvalidStateError('not loaded');
                        } else if (kind !== 'audio' && kind !== 'video') {
                            throw new TypeError(`invalid kind "${kind}"`);
                        }
                        return this._canProduceByKind[kind];
                    }
                    /**
                     * Creates a Transport for sending media.
                     *
                     * @throws {InvalidStateError} if not loaded.
                     * @throws {TypeError} if wrong arguments.
                     */
                    createSendTransport({
                        id,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        appData,
                    }) {
                        logger.debug('createSendTransport()');
                        return this.createTransport({
                            direction: 'send',
                            id: id,
                            iceParameters: iceParameters,
                            iceCandidates: iceCandidates,
                            dtlsParameters: dtlsParameters,
                            sctpParameters: sctpParameters,
                            iceServers: iceServers,
                            iceTransportPolicy: iceTransportPolicy,
                            additionalSettings: additionalSettings,
                            proprietaryConstraints: proprietaryConstraints,
                            appData: appData,
                        });
                    }
                    /**
                     * Creates a Transport for receiving media.
                     *
                     * @throws {InvalidStateError} if not loaded.
                     * @throws {TypeError} if wrong arguments.
                     */
                    createRecvTransport({
                        id,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        appData,
                    }) {
                        logger.debug('createRecvTransport()');
                        return this.createTransport({
                            direction: 'recv',
                            id: id,
                            iceParameters: iceParameters,
                            iceCandidates: iceCandidates,
                            dtlsParameters: dtlsParameters,
                            sctpParameters: sctpParameters,
                            iceServers: iceServers,
                            iceTransportPolicy: iceTransportPolicy,
                            additionalSettings: additionalSettings,
                            proprietaryConstraints: proprietaryConstraints,
                            appData: appData,
                        });
                    }
                    createTransport({
                        direction,
                        id,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        appData,
                    }) {
                        if (!this._loaded) {
                            throw new errors_1.InvalidStateError('not loaded');
                        } else if (typeof id !== 'string') {
                            throw new TypeError('missing id');
                        } else if (typeof iceParameters !== 'object') {
                            throw new TypeError('missing iceParameters');
                        } else if (!Array.isArray(iceCandidates)) {
                            throw new TypeError('missing iceCandidates');
                        } else if (typeof dtlsParameters !== 'object') {
                            throw new TypeError('missing dtlsParameters');
                        } else if (sctpParameters && typeof sctpParameters !== 'object') {
                            throw new TypeError('wrong sctpParameters');
                        } else if (appData && typeof appData !== 'object') {
                            throw new TypeError('if given, appData must be an object');
                        }
                        // Create a new Transport.
                        const transport = new Transport_1.Transport({
                            direction,
                            id,
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                            iceServers,
                            iceTransportPolicy,
                            additionalSettings,
                            proprietaryConstraints,
                            appData,
                            handlerFactory: this._handlerFactory,
                            extendedRtpCapabilities: this._extendedRtpCapabilities,
                            canProduceByKind: this._canProduceByKind,
                        });
                        // Emit observer event.
                        this._observer.safeEmit('newtransport', transport);
                        return transport;
                    }
                }
                exports.Device = Device;
            },
            {
                './EnhancedEventEmitter': 11,
                './Logger': 12,
                './Transport': 16,
                './errors': 17,
                './handlers/Chrome111': 18,
                './handlers/Chrome55': 19,
                './handlers/Chrome67': 20,
                './handlers/Chrome70': 21,
                './handlers/Chrome74': 22,
                './handlers/Edge11': 23,
                './handlers/Firefox120': 24,
                './handlers/Firefox60': 25,
                './handlers/ReactNative': 27,
                './handlers/ReactNativeUnifiedPlan': 28,
                './handlers/Safari11': 29,
                './handlers/Safari12': 30,
                './ortc': 39,
                './utils': 42,
                'ua-parser-js': 49,
            },
        ],
        11: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.EnhancedEventEmitter = void 0;
                const events_1 = require('events');
                const Logger_1 = require('./Logger');
                const logger = new Logger_1.Logger('EnhancedEventEmitter');
                class EnhancedEventEmitter extends events_1.EventEmitter {
                    constructor() {
                        super();
                        this.setMaxListeners(Infinity);
                    }
                    emit(eventName, ...args) {
                        return super.emit(eventName, ...args);
                    }
                    /**
                     * Special addition to the EventEmitter API.
                     */
                    safeEmit(eventName, ...args) {
                        const numListeners = super.listenerCount(eventName);
                        try {
                            return super.emit(eventName, ...args);
                        } catch (error) {
                            logger.error(
                                'safeEmit() | event listener threw an error [eventName:%s]:%o',
                                eventName,
                                error,
                            );
                            return Boolean(numListeners);
                        }
                    }
                    on(eventName, listener) {
                        super.on(eventName, listener);
                        return this;
                    }
                    off(eventName, listener) {
                        super.off(eventName, listener);
                        return this;
                    }
                    addListener(eventName, listener) {
                        super.on(eventName, listener);
                        return this;
                    }
                    prependListener(eventName, listener) {
                        super.prependListener(eventName, listener);
                        return this;
                    }
                    once(eventName, listener) {
                        super.once(eventName, listener);
                        return this;
                    }
                    prependOnceListener(eventName, listener) {
                        super.prependOnceListener(eventName, listener);
                        return this;
                    }
                    removeListener(eventName, listener) {
                        super.off(eventName, listener);
                        return this;
                    }
                    removeAllListeners(eventName) {
                        super.removeAllListeners(eventName);
                        return this;
                    }
                    listenerCount(eventName) {
                        return super.listenerCount(eventName);
                    }
                    listeners(eventName) {
                        return super.listeners(eventName);
                    }
                    rawListeners(eventName) {
                        return super.rawListeners(eventName);
                    }
                }
                exports.EnhancedEventEmitter = EnhancedEventEmitter;
            },
            { './Logger': 12, events: 51 },
        ],
        12: [
            function (require, module, exports) {
                'use strict';
                var __importDefault =
                    (this && this.__importDefault) ||
                    function (mod) {
                        return mod && mod.__esModule ? mod : { default: mod };
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Logger = void 0;
                const debug_1 = __importDefault(require('debug'));
                const APP_NAME = 'mediasoup-client';
                class Logger {
                    constructor(prefix) {
                        if (prefix) {
                            this._debug = (0, debug_1.default)(`${APP_NAME}:${prefix}`);
                            this._warn = (0, debug_1.default)(`${APP_NAME}:WARN:${prefix}`);
                            this._error = (0, debug_1.default)(`${APP_NAME}:ERROR:${prefix}`);
                        } else {
                            this._debug = (0, debug_1.default)(APP_NAME);
                            this._warn = (0, debug_1.default)(`${APP_NAME}:WARN`);
                            this._error = (0, debug_1.default)(`${APP_NAME}:ERROR`);
                        }
                        /* eslint-disable no-console */
                        this._debug.log = console.info.bind(console);
                        this._warn.log = console.warn.bind(console);
                        this._error.log = console.error.bind(console);
                        /* eslint-enable no-console */
                    }
                    get debug() {
                        return this._debug;
                    }
                    get warn() {
                        return this._warn;
                    }
                    get error() {
                        return this._error;
                    }
                }
                exports.Logger = Logger;
            },
            { debug: 3 },
        ],
        13: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Producer = void 0;
                const Logger_1 = require('./Logger');
                const EnhancedEventEmitter_1 = require('./EnhancedEventEmitter');
                const errors_1 = require('./errors');
                const logger = new Logger_1.Logger('Producer');
                class Producer extends EnhancedEventEmitter_1.EnhancedEventEmitter {
                    constructor({
                        id,
                        localId,
                        rtpSender,
                        track,
                        rtpParameters,
                        stopTracks,
                        disableTrackOnPause,
                        zeroRtpOnPause,
                        appData,
                    }) {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Observer instance.
                        this._observer = new EnhancedEventEmitter_1.EnhancedEventEmitter();
                        logger.debug('constructor()');
                        this._id = id;
                        this._localId = localId;
                        this._rtpSender = rtpSender;
                        this._track = track;
                        this._kind = track.kind;
                        this._rtpParameters = rtpParameters;
                        this._paused = disableTrackOnPause ? !track.enabled : false;
                        this._maxSpatialLayer = undefined;
                        this._stopTracks = stopTracks;
                        this._disableTrackOnPause = disableTrackOnPause;
                        this._zeroRtpOnPause = zeroRtpOnPause;
                        this._appData = appData || {};
                        this.onTrackEnded = this.onTrackEnded.bind(this);
                        // NOTE: Minor issue. If zeroRtpOnPause is true, we cannot emit the
                        // '@replacetrack' event here, so RTCRtpSender.track won't be null.
                        this.handleTrack();
                    }
                    /**
                     * Producer id.
                     */
                    get id() {
                        return this._id;
                    }
                    /**
                     * Local id.
                     */
                    get localId() {
                        return this._localId;
                    }
                    /**
                     * Whether the Producer is closed.
                     */
                    get closed() {
                        return this._closed;
                    }
                    /**
                     * Media kind.
                     */
                    get kind() {
                        return this._kind;
                    }
                    /**
                     * Associated RTCRtpSender.
                     */
                    get rtpSender() {
                        return this._rtpSender;
                    }
                    /**
                     * The associated track.
                     */
                    get track() {
                        return this._track;
                    }
                    /**
                     * RTP parameters.
                     */
                    get rtpParameters() {
                        return this._rtpParameters;
                    }
                    /**
                     * Whether the Producer is paused.
                     */
                    get paused() {
                        return this._paused;
                    }
                    /**
                     * Max spatial layer.
                     *
                     * @type {Number | undefined}
                     */
                    get maxSpatialLayer() {
                        return this._maxSpatialLayer;
                    }
                    /**
                     * App custom data.
                     */
                    get appData() {
                        return this._appData;
                    }
                    /**
                     * App custom data setter.
                     */
                    set appData(appData) {
                        this._appData = appData;
                    }
                    get observer() {
                        return this._observer;
                    }
                    /**
                     * Closes the Producer.
                     */
                    close() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('close()');
                        this._closed = true;
                        this.destroyTrack();
                        this.emit('@close');
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    /**
                     * Transport was closed.
                     */
                    transportClosed() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('transportClosed()');
                        this._closed = true;
                        this.destroyTrack();
                        this.safeEmit('transportclose');
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    /**
                     * Get associated RTCRtpSender stats.
                     */
                    async getStats() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        }
                        return new Promise((resolve, reject) => {
                            this.safeEmit('@getstats', resolve, reject);
                        });
                    }
                    /**
                     * Pauses sending media.
                     */
                    pause() {
                        logger.debug('pause()');
                        if (this._closed) {
                            logger.error('pause() | Producer closed');
                            return;
                        }
                        this._paused = true;
                        if (this._track && this._disableTrackOnPause) {
                            this._track.enabled = false;
                        }
                        if (this._zeroRtpOnPause) {
                            new Promise((resolve, reject) => {
                                this.safeEmit('@pause', resolve, reject);
                            }).catch(() => {});
                        }
                        // Emit observer event.
                        this._observer.safeEmit('pause');
                    }
                    /**
                     * Resumes sending media.
                     */
                    resume() {
                        logger.debug('resume()');
                        if (this._closed) {
                            logger.error('resume() | Producer closed');
                            return;
                        }
                        this._paused = false;
                        if (this._track && this._disableTrackOnPause) {
                            this._track.enabled = true;
                        }
                        if (this._zeroRtpOnPause) {
                            new Promise((resolve, reject) => {
                                this.safeEmit('@resume', resolve, reject);
                            }).catch(() => {});
                        }
                        // Emit observer event.
                        this._observer.safeEmit('resume');
                    }
                    /**
                     * Replaces the current track with a new one or null.
                     */
                    async replaceTrack({ track }) {
                        logger.debug('replaceTrack() [track:%o]', track);
                        if (this._closed) {
                            // This must be done here. Otherwise there is no chance to stop the given
                            // track.
                            if (track && this._stopTracks) {
                                try {
                                    track.stop();
                                } catch (error) {}
                            }
                            throw new errors_1.InvalidStateError('closed');
                        } else if (track && track.readyState === 'ended') {
                            throw new errors_1.InvalidStateError('track ended');
                        }
                        // Do nothing if this is the same track as the current handled one.
                        if (track === this._track) {
                            logger.debug('replaceTrack() | same track, ignored');
                            return;
                        }
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@replacetrack', track, resolve, reject);
                        });
                        // Destroy the previous track.
                        this.destroyTrack();
                        // Set the new track.
                        this._track = track;
                        // If this Producer was paused/resumed and the state of the new
                        // track does not match, fix it.
                        if (this._track && this._disableTrackOnPause) {
                            if (!this._paused) {
                                this._track.enabled = true;
                            } else if (this._paused) {
                                this._track.enabled = false;
                            }
                        }
                        // Handle the effective track.
                        this.handleTrack();
                    }
                    /**
                     * Sets the video max spatial layer to be sent.
                     */
                    async setMaxSpatialLayer(spatialLayer) {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        } else if (this._kind !== 'video') {
                            throw new errors_1.UnsupportedError('not a video Producer');
                        } else if (typeof spatialLayer !== 'number') {
                            throw new TypeError('invalid spatialLayer');
                        }
                        if (spatialLayer === this._maxSpatialLayer) {
                            return;
                        }
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@setmaxspatiallayer', spatialLayer, resolve, reject);
                        }).catch(() => {});
                        this._maxSpatialLayer = spatialLayer;
                    }
                    async setRtpEncodingParameters(params) {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        } else if (typeof params !== 'object') {
                            throw new TypeError('invalid params');
                        }
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@setrtpencodingparameters', params, resolve, reject);
                        });
                    }
                    onTrackEnded() {
                        logger.debug('track "ended" event');
                        this.safeEmit('trackended');
                        // Emit observer event.
                        this._observer.safeEmit('trackended');
                    }
                    handleTrack() {
                        if (!this._track) {
                            return;
                        }
                        this._track.addEventListener('ended', this.onTrackEnded);
                    }
                    destroyTrack() {
                        if (!this._track) {
                            return;
                        }
                        try {
                            this._track.removeEventListener('ended', this.onTrackEnded);
                            // Just stop the track unless the app set stopTracks: false.
                            if (this._stopTracks) {
                                this._track.stop();
                            }
                        } catch (error) {}
                    }
                }
                exports.Producer = Producer;
            },
            { './EnhancedEventEmitter': 11, './Logger': 12, './errors': 17 },
        ],
        14: [
            function (require, module, exports) {
                'use strict';
                /**
                 * The RTP capabilities define what mediasoup or an endpoint can receive at
                 * media level.
                 */
                Object.defineProperty(exports, '__esModule', { value: true });
            },
            {},
        ],
        15: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
            },
            {},
        ],
        16: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                var __importDefault =
                    (this && this.__importDefault) ||
                    function (mod) {
                        return mod && mod.__esModule ? mod : { default: mod };
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Transport = void 0;
                const awaitqueue_1 = require('awaitqueue');
                const queue_microtask_1 = __importDefault(require('queue-microtask'));
                const Logger_1 = require('./Logger');
                const EnhancedEventEmitter_1 = require('./EnhancedEventEmitter');
                const errors_1 = require('./errors');
                const utils = __importStar(require('./utils'));
                const ortc = __importStar(require('./ortc'));
                const Producer_1 = require('./Producer');
                const Consumer_1 = require('./Consumer');
                const DataProducer_1 = require('./DataProducer');
                const DataConsumer_1 = require('./DataConsumer');
                const logger = new Logger_1.Logger('Transport');
                class ConsumerCreationTask {
                    constructor(consumerOptions) {
                        this.consumerOptions = consumerOptions;
                        this.promise = new Promise((resolve, reject) => {
                            this.resolve = resolve;
                            this.reject = reject;
                        });
                    }
                }
                class Transport extends EnhancedEventEmitter_1.EnhancedEventEmitter {
                    constructor({
                        direction,
                        id,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        appData,
                        handlerFactory,
                        extendedRtpCapabilities,
                        canProduceByKind,
                    }) {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Transport ICE gathering state.
                        this._iceGatheringState = 'new';
                        // Transport connection state.
                        this._connectionState = 'new';
                        // Map of Producers indexed by id.
                        this._producers = new Map();
                        // Map of Consumers indexed by id.
                        this._consumers = new Map();
                        // Map of DataProducers indexed by id.
                        this._dataProducers = new Map();
                        // Map of DataConsumers indexed by id.
                        this._dataConsumers = new Map();
                        // Whether the Consumer for RTP probation has been created.
                        this._probatorConsumerCreated = false;
                        // AwaitQueue instance to make async tasks happen sequentially.
                        this._awaitQueue = new awaitqueue_1.AwaitQueue();
                        // Consumer creation tasks awaiting to be processed.
                        this._pendingConsumerTasks = [];
                        // Consumer creation in progress flag.
                        this._consumerCreationInProgress = false;
                        // Consumers pending to be paused.
                        this._pendingPauseConsumers = new Map();
                        // Consumer pause in progress flag.
                        this._consumerPauseInProgress = false;
                        // Consumers pending to be resumed.
                        this._pendingResumeConsumers = new Map();
                        // Consumer resume in progress flag.
                        this._consumerResumeInProgress = false;
                        // Consumers pending to be closed.
                        this._pendingCloseConsumers = new Map();
                        // Consumer close in progress flag.
                        this._consumerCloseInProgress = false;
                        // Observer instance.
                        this._observer = new EnhancedEventEmitter_1.EnhancedEventEmitter();
                        logger.debug('constructor() [id:%s, direction:%s]', id, direction);
                        this._id = id;
                        this._direction = direction;
                        this._extendedRtpCapabilities = extendedRtpCapabilities;
                        this._canProduceByKind = canProduceByKind;
                        this._maxSctpMessageSize = sctpParameters ? sctpParameters.maxMessageSize : null;
                        // Clone and sanitize additionalSettings.
                        additionalSettings = utils.clone(additionalSettings) || {};
                        delete additionalSettings.iceServers;
                        delete additionalSettings.iceTransportPolicy;
                        delete additionalSettings.bundlePolicy;
                        delete additionalSettings.rtcpMuxPolicy;
                        delete additionalSettings.sdpSemantics;
                        this._handler = handlerFactory();
                        this._handler.run({
                            direction,
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                            iceServers,
                            iceTransportPolicy,
                            additionalSettings,
                            proprietaryConstraints,
                            extendedRtpCapabilities,
                        });
                        this._appData = appData || {};
                        this.handleHandler();
                    }
                    /**
                     * Transport id.
                     */
                    get id() {
                        return this._id;
                    }
                    /**
                     * Whether the Transport is closed.
                     */
                    get closed() {
                        return this._closed;
                    }
                    /**
                     * Transport direction.
                     */
                    get direction() {
                        return this._direction;
                    }
                    /**
                     * RTC handler instance.
                     */
                    get handler() {
                        return this._handler;
                    }
                    /**
                     * ICE gathering state.
                     */
                    get iceGatheringState() {
                        return this._iceGatheringState;
                    }
                    /**
                     * Connection state.
                     */
                    get connectionState() {
                        return this._connectionState;
                    }
                    /**
                     * App custom data.
                     */
                    get appData() {
                        return this._appData;
                    }
                    /**
                     * App custom data setter.
                     */
                    set appData(appData) {
                        this._appData = appData;
                    }
                    get observer() {
                        return this._observer;
                    }
                    /**
                     * Close the Transport.
                     */
                    close() {
                        if (this._closed) {
                            return;
                        }
                        logger.debug('close()');
                        this._closed = true;
                        // Stop the AwaitQueue.
                        this._awaitQueue.stop();
                        // Close the handler.
                        this._handler.close();
                        // Change connection state to 'closed' since the handler may not emit
                        // '@connectionstatechange' event.
                        this._connectionState = 'closed';
                        // Close all Producers.
                        for (const producer of this._producers.values()) {
                            producer.transportClosed();
                        }
                        this._producers.clear();
                        // Close all Consumers.
                        for (const consumer of this._consumers.values()) {
                            consumer.transportClosed();
                        }
                        this._consumers.clear();
                        // Close all DataProducers.
                        for (const dataProducer of this._dataProducers.values()) {
                            dataProducer.transportClosed();
                        }
                        this._dataProducers.clear();
                        // Close all DataConsumers.
                        for (const dataConsumer of this._dataConsumers.values()) {
                            dataConsumer.transportClosed();
                        }
                        this._dataConsumers.clear();
                        // Emit observer event.
                        this._observer.safeEmit('close');
                    }
                    /**
                     * Get associated Transport (RTCPeerConnection) stats.
                     *
                     * @returns {RTCStatsReport}
                     */
                    async getStats() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        }
                        return this._handler.getTransportStats();
                    }
                    /**
                     * Restart ICE connection.
                     */
                    async restartIce({ iceParameters }) {
                        logger.debug('restartIce()');
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        } else if (!iceParameters) {
                            throw new TypeError('missing iceParameters');
                        }
                        // Enqueue command.
                        return this._awaitQueue.push(
                            async () => await this._handler.restartIce(iceParameters),
                            'transport.restartIce()',
                        );
                    }
                    /**
                     * Update ICE servers.
                     */
                    async updateIceServers({ iceServers } = {}) {
                        logger.debug('updateIceServers()');
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        } else if (!Array.isArray(iceServers)) {
                            throw new TypeError('missing iceServers');
                        }
                        // Enqueue command.
                        return this._awaitQueue.push(
                            async () => this._handler.updateIceServers(iceServers),
                            'transport.updateIceServers()',
                        );
                    }
                    /**
                     * Create a Producer.
                     */
                    async produce({
                        track,
                        encodings,
                        codecOptions,
                        codec,
                        stopTracks = true,
                        disableTrackOnPause = true,
                        zeroRtpOnPause = false,
                        appData = {},
                    } = {}) {
                        logger.debug('produce() [track:%o]', track);
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        } else if (!track) {
                            throw new TypeError('missing track');
                        } else if (this._direction !== 'send') {
                            throw new errors_1.UnsupportedError('not a sending Transport');
                        } else if (!this._canProduceByKind[track.kind]) {
                            throw new errors_1.UnsupportedError(`cannot produce ${track.kind}`);
                        } else if (track.readyState === 'ended') {
                            throw new errors_1.InvalidStateError('track ended');
                        } else if (this.listenerCount('connect') === 0 && this._connectionState === 'new') {
                            throw new TypeError('no "connect" listener set into this transport');
                        } else if (this.listenerCount('produce') === 0) {
                            throw new TypeError('no "produce" listener set into this transport');
                        } else if (appData && typeof appData !== 'object') {
                            throw new TypeError('if given, appData must be an object');
                        }
                        // Enqueue command.
                        return (
                            this._awaitQueue
                                .push(async () => {
                                    let normalizedEncodings;
                                    if (encodings && !Array.isArray(encodings)) {
                                        throw TypeError('encodings must be an array');
                                    } else if (encodings && encodings.length === 0) {
                                        normalizedEncodings = undefined;
                                    } else if (encodings) {
                                        normalizedEncodings = encodings.map((encoding) => {
                                            const normalizedEncoding = { active: true };
                                            if (encoding.active === false) {
                                                normalizedEncoding.active = false;
                                            }
                                            if (typeof encoding.dtx === 'boolean') {
                                                normalizedEncoding.dtx = encoding.dtx;
                                            }
                                            if (typeof encoding.scalabilityMode === 'string') {
                                                normalizedEncoding.scalabilityMode = encoding.scalabilityMode;
                                            }
                                            if (typeof encoding.scaleResolutionDownBy === 'number') {
                                                normalizedEncoding.scaleResolutionDownBy =
                                                    encoding.scaleResolutionDownBy;
                                            }
                                            if (typeof encoding.maxBitrate === 'number') {
                                                normalizedEncoding.maxBitrate = encoding.maxBitrate;
                                            }
                                            if (typeof encoding.maxFramerate === 'number') {
                                                normalizedEncoding.maxFramerate = encoding.maxFramerate;
                                            }
                                            if (typeof encoding.adaptivePtime === 'boolean') {
                                                normalizedEncoding.adaptivePtime = encoding.adaptivePtime;
                                            }
                                            if (typeof encoding.priority === 'string') {
                                                normalizedEncoding.priority = encoding.priority;
                                            }
                                            if (typeof encoding.networkPriority === 'string') {
                                                normalizedEncoding.networkPriority = encoding.networkPriority;
                                            }
                                            return normalizedEncoding;
                                        });
                                    }
                                    const { localId, rtpParameters, rtpSender } = await this._handler.send({
                                        track,
                                        encodings: normalizedEncodings,
                                        codecOptions,
                                        codec,
                                    });
                                    try {
                                        // This will fill rtpParameters's missing fields with default values.
                                        ortc.validateRtpParameters(rtpParameters);
                                        const { id } = await new Promise((resolve, reject) => {
                                            this.safeEmit(
                                                'produce',
                                                {
                                                    kind: track.kind,
                                                    rtpParameters,
                                                    appData,
                                                },
                                                resolve,
                                                reject,
                                            );
                                        });
                                        const producer = new Producer_1.Producer({
                                            id,
                                            localId,
                                            rtpSender,
                                            track,
                                            rtpParameters,
                                            stopTracks,
                                            disableTrackOnPause,
                                            zeroRtpOnPause,
                                            appData,
                                        });
                                        this._producers.set(producer.id, producer);
                                        this.handleProducer(producer);
                                        // Emit observer event.
                                        this._observer.safeEmit('newproducer', producer);
                                        return producer;
                                    } catch (error) {
                                        this._handler.stopSending(localId).catch(() => {});
                                        throw error;
                                    }
                                }, 'transport.produce()')
                                // This catch is needed to stop the given track if the command above
                                // failed due to closed Transport.
                                .catch((error) => {
                                    if (stopTracks) {
                                        try {
                                            track.stop();
                                        } catch (error2) {}
                                    }
                                    throw error;
                                })
                        );
                    }
                    /**
                     * Create a Consumer to consume a remote Producer.
                     */
                    async consume({ id, producerId, kind, rtpParameters, streamId, appData = {} }) {
                        logger.debug('consume()');
                        rtpParameters = utils.clone(rtpParameters);
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        } else if (this._direction !== 'recv') {
                            throw new errors_1.UnsupportedError('not a receiving Transport');
                        } else if (typeof id !== 'string') {
                            throw new TypeError('missing id');
                        } else if (typeof producerId !== 'string') {
                            throw new TypeError('missing producerId');
                        } else if (kind !== 'audio' && kind !== 'video') {
                            throw new TypeError(`invalid kind '${kind}'`);
                        } else if (this.listenerCount('connect') === 0 && this._connectionState === 'new') {
                            throw new TypeError('no "connect" listener set into this transport');
                        } else if (appData && typeof appData !== 'object') {
                            throw new TypeError('if given, appData must be an object');
                        }
                        // Ensure the device can consume it.
                        const canConsume = ortc.canReceive(rtpParameters, this._extendedRtpCapabilities);
                        if (!canConsume) {
                            throw new errors_1.UnsupportedError('cannot consume this Producer');
                        }
                        const consumerCreationTask = new ConsumerCreationTask({
                            id,
                            producerId,
                            kind,
                            rtpParameters,
                            streamId,
                            appData,
                        });
                        // Store the Consumer creation task.
                        this._pendingConsumerTasks.push(consumerCreationTask);
                        // There is no Consumer creation in progress, create it now.
                        (0, queue_microtask_1.default)(() => {
                            if (this._closed) {
                                return;
                            }
                            if (this._consumerCreationInProgress === false) {
                                this.createPendingConsumers();
                            }
                        });
                        return consumerCreationTask.promise;
                    }
                    /**
                     * Create a DataProducer
                     */
                    async produceData({
                        ordered = true,
                        maxPacketLifeTime,
                        maxRetransmits,
                        label = '',
                        protocol = '',
                        appData = {},
                    } = {}) {
                        logger.debug('produceData()');
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        } else if (this._direction !== 'send') {
                            throw new errors_1.UnsupportedError('not a sending Transport');
                        } else if (!this._maxSctpMessageSize) {
                            throw new errors_1.UnsupportedError('SCTP not enabled by remote Transport');
                        } else if (this.listenerCount('connect') === 0 && this._connectionState === 'new') {
                            throw new TypeError('no "connect" listener set into this transport');
                        } else if (this.listenerCount('producedata') === 0) {
                            throw new TypeError('no "producedata" listener set into this transport');
                        } else if (appData && typeof appData !== 'object') {
                            throw new TypeError('if given, appData must be an object');
                        }
                        if (maxPacketLifeTime || maxRetransmits) {
                            ordered = false;
                        }
                        // Enqueue command.
                        return this._awaitQueue.push(async () => {
                            const { dataChannel, sctpStreamParameters } = await this._handler.sendDataChannel({
                                ordered,
                                maxPacketLifeTime,
                                maxRetransmits,
                                label,
                                protocol,
                            });
                            // This will fill sctpStreamParameters's missing fields with default values.
                            ortc.validateSctpStreamParameters(sctpStreamParameters);
                            const { id } = await new Promise((resolve, reject) => {
                                this.safeEmit(
                                    'producedata',
                                    {
                                        sctpStreamParameters,
                                        label,
                                        protocol,
                                        appData,
                                    },
                                    resolve,
                                    reject,
                                );
                            });
                            const dataProducer = new DataProducer_1.DataProducer({
                                id,
                                dataChannel,
                                sctpStreamParameters,
                                appData,
                            });
                            this._dataProducers.set(dataProducer.id, dataProducer);
                            this.handleDataProducer(dataProducer);
                            // Emit observer event.
                            this._observer.safeEmit('newdataproducer', dataProducer);
                            return dataProducer;
                        }, 'transport.produceData()');
                    }
                    /**
                     * Create a DataConsumer
                     */
                    async consumeData({
                        id,
                        dataProducerId,
                        sctpStreamParameters,
                        label = '',
                        protocol = '',
                        appData = {},
                    }) {
                        logger.debug('consumeData()');
                        sctpStreamParameters = utils.clone(sctpStreamParameters);
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('closed');
                        } else if (this._direction !== 'recv') {
                            throw new errors_1.UnsupportedError('not a receiving Transport');
                        } else if (!this._maxSctpMessageSize) {
                            throw new errors_1.UnsupportedError('SCTP not enabled by remote Transport');
                        } else if (typeof id !== 'string') {
                            throw new TypeError('missing id');
                        } else if (typeof dataProducerId !== 'string') {
                            throw new TypeError('missing dataProducerId');
                        } else if (this.listenerCount('connect') === 0 && this._connectionState === 'new') {
                            throw new TypeError('no "connect" listener set into this transport');
                        } else if (appData && typeof appData !== 'object') {
                            throw new TypeError('if given, appData must be an object');
                        }
                        // This may throw.
                        ortc.validateSctpStreamParameters(sctpStreamParameters);
                        // Enqueue command.
                        return this._awaitQueue.push(async () => {
                            const { dataChannel } = await this._handler.receiveDataChannel({
                                sctpStreamParameters,
                                label,
                                protocol,
                            });
                            const dataConsumer = new DataConsumer_1.DataConsumer({
                                id,
                                dataProducerId,
                                dataChannel,
                                sctpStreamParameters,
                                appData,
                            });
                            this._dataConsumers.set(dataConsumer.id, dataConsumer);
                            this.handleDataConsumer(dataConsumer);
                            // Emit observer event.
                            this._observer.safeEmit('newdataconsumer', dataConsumer);
                            return dataConsumer;
                        }, 'transport.consumeData()');
                    }
                    // This method is guaranteed to never throw.
                    async createPendingConsumers() {
                        this._consumerCreationInProgress = true;
                        this._awaitQueue
                            .push(async () => {
                                if (this._pendingConsumerTasks.length === 0) {
                                    logger.debug('createPendingConsumers() | there is no Consumer to be created');
                                    return;
                                }
                                const pendingConsumerTasks = [...this._pendingConsumerTasks];
                                // Clear pending Consumer tasks.
                                this._pendingConsumerTasks = [];
                                // Video Consumer in order to create the probator.
                                let videoConsumerForProbator = undefined;
                                // Fill options list.
                                const optionsList = [];
                                for (const task of pendingConsumerTasks) {
                                    const { id, kind, rtpParameters, streamId } = task.consumerOptions;
                                    optionsList.push({
                                        trackId: id,
                                        kind: kind,
                                        rtpParameters,
                                        streamId,
                                    });
                                }
                                try {
                                    const results = await this._handler.receive(optionsList);
                                    for (let idx = 0; idx < results.length; ++idx) {
                                        const task = pendingConsumerTasks[idx];
                                        const result = results[idx];
                                        const { id, producerId, kind, rtpParameters, appData } = task.consumerOptions;
                                        const { localId, rtpReceiver, track } = result;
                                        const consumer = new Consumer_1.Consumer({
                                            id: id,
                                            localId,
                                            producerId: producerId,
                                            rtpReceiver,
                                            track,
                                            rtpParameters,
                                            appData: appData,
                                        });
                                        this._consumers.set(consumer.id, consumer);
                                        this.handleConsumer(consumer);
                                        // If this is the first video Consumer and the Consumer for RTP probation
                                        // has not yet been created, it's time to create it.
                                        if (
                                            !this._probatorConsumerCreated &&
                                            !videoConsumerForProbator &&
                                            kind === 'video'
                                        ) {
                                            videoConsumerForProbator = consumer;
                                        }
                                        // Emit observer event.
                                        this._observer.safeEmit('newconsumer', consumer);
                                        task.resolve(consumer);
                                    }
                                } catch (error) {
                                    for (const task of pendingConsumerTasks) {
                                        task.reject(error);
                                    }
                                }
                                // If RTP probation must be handled, do it now.
                                if (videoConsumerForProbator) {
                                    try {
                                        const probatorRtpParameters = ortc.generateProbatorRtpParameters(
                                            videoConsumerForProbator.rtpParameters,
                                        );
                                        await this._handler.receive([
                                            {
                                                trackId: 'probator',
                                                kind: 'video',
                                                rtpParameters: probatorRtpParameters,
                                            },
                                        ]);
                                        logger.debug('createPendingConsumers() | Consumer for RTP probation created');
                                        this._probatorConsumerCreated = true;
                                    } catch (error) {
                                        logger.error(
                                            'createPendingConsumers() | failed to create Consumer for RTP probation:%o',
                                            error,
                                        );
                                    }
                                }
                            }, 'transport.createPendingConsumers()')
                            .then(() => {
                                this._consumerCreationInProgress = false;
                                // There are pending Consumer tasks, enqueue their creation.
                                if (this._pendingConsumerTasks.length > 0) {
                                    this.createPendingConsumers();
                                }
                            })
                            // NOTE: We only get here when the await queue is closed.
                            .catch(() => {});
                    }
                    pausePendingConsumers() {
                        this._consumerPauseInProgress = true;
                        this._awaitQueue
                            .push(async () => {
                                if (this._pendingPauseConsumers.size === 0) {
                                    logger.debug('pausePendingConsumers() | there is no Consumer to be paused');
                                    return;
                                }
                                const pendingPauseConsumers = Array.from(this._pendingPauseConsumers.values());
                                // Clear pending pause Consumer map.
                                this._pendingPauseConsumers.clear();
                                try {
                                    const localIds = pendingPauseConsumers.map((consumer) => consumer.localId);
                                    await this._handler.pauseReceiving(localIds);
                                } catch (error) {
                                    logger.error('pausePendingConsumers() | failed to pause Consumers:', error);
                                }
                            }, 'transport.pausePendingConsumers')
                            .then(() => {
                                this._consumerPauseInProgress = false;
                                // There are pending Consumers to be paused, do it.
                                if (this._pendingPauseConsumers.size > 0) {
                                    this.pausePendingConsumers();
                                }
                            })
                            // NOTE: We only get here when the await queue is closed.
                            .catch(() => {});
                    }
                    resumePendingConsumers() {
                        this._consumerResumeInProgress = true;
                        this._awaitQueue
                            .push(async () => {
                                if (this._pendingResumeConsumers.size === 0) {
                                    logger.debug('resumePendingConsumers() | there is no Consumer to be resumed');
                                    return;
                                }
                                const pendingResumeConsumers = Array.from(this._pendingResumeConsumers.values());
                                // Clear pending resume Consumer map.
                                this._pendingResumeConsumers.clear();
                                try {
                                    const localIds = pendingResumeConsumers.map((consumer) => consumer.localId);
                                    await this._handler.resumeReceiving(localIds);
                                } catch (error) {
                                    logger.error('resumePendingConsumers() | failed to resume Consumers:', error);
                                }
                            }, 'transport.resumePendingConsumers')
                            .then(() => {
                                this._consumerResumeInProgress = false;
                                // There are pending Consumer to be resumed, do it.
                                if (this._pendingResumeConsumers.size > 0) {
                                    this.resumePendingConsumers();
                                }
                            })
                            // NOTE: We only get here when the await queue is closed.
                            .catch(() => {});
                    }
                    closePendingConsumers() {
                        this._consumerCloseInProgress = true;
                        this._awaitQueue
                            .push(async () => {
                                if (this._pendingCloseConsumers.size === 0) {
                                    logger.debug('closePendingConsumers() | there is no Consumer to be closed');
                                    return;
                                }
                                const pendingCloseConsumers = Array.from(this._pendingCloseConsumers.values());
                                // Clear pending close Consumer map.
                                this._pendingCloseConsumers.clear();
                                try {
                                    await this._handler.stopReceiving(
                                        pendingCloseConsumers.map((consumer) => consumer.localId),
                                    );
                                } catch (error) {
                                    logger.error('closePendingConsumers() | failed to close Consumers:', error);
                                }
                            }, 'transport.closePendingConsumers')
                            .then(() => {
                                this._consumerCloseInProgress = false;
                                // There are pending Consumer to be resumed, do it.
                                if (this._pendingCloseConsumers.size > 0) {
                                    this.closePendingConsumers();
                                }
                            })
                            // NOTE: We only get here when the await queue is closed.
                            .catch(() => {});
                    }
                    handleHandler() {
                        const handler = this._handler;
                        handler.on('@connect', ({ dtlsParameters }, callback, errback) => {
                            if (this._closed) {
                                errback(new errors_1.InvalidStateError('closed'));
                                return;
                            }
                            this.safeEmit('connect', { dtlsParameters }, callback, errback);
                        });
                        handler.on('@icegatheringstatechange', (iceGatheringState) => {
                            if (iceGatheringState === this._iceGatheringState) {
                                return;
                            }
                            logger.debug('ICE gathering state changed to %s', iceGatheringState);
                            this._iceGatheringState = iceGatheringState;
                            if (!this._closed) {
                                this.safeEmit('icegatheringstatechange', iceGatheringState);
                            }
                        });
                        handler.on('@connectionstatechange', (connectionState) => {
                            if (connectionState === this._connectionState) {
                                return;
                            }
                            logger.debug('connection state changed to %s', connectionState);
                            this._connectionState = connectionState;
                            if (!this._closed) {
                                this.safeEmit('connectionstatechange', connectionState);
                            }
                        });
                    }
                    handleProducer(producer) {
                        producer.on('@close', () => {
                            this._producers.delete(producer.id);
                            if (this._closed) {
                                return;
                            }
                            this._awaitQueue
                                .push(
                                    async () => await this._handler.stopSending(producer.localId),
                                    'producer @close event',
                                )
                                .catch((error) => logger.warn('producer.close() failed:%o', error));
                        });
                        producer.on('@pause', (callback, errback) => {
                            this._awaitQueue
                                .push(
                                    async () => await this._handler.pauseSending(producer.localId),
                                    'producer @pause event',
                                )
                                .then(callback)
                                .catch(errback);
                        });
                        producer.on('@resume', (callback, errback) => {
                            this._awaitQueue
                                .push(
                                    async () => await this._handler.resumeSending(producer.localId),
                                    'producer @resume event',
                                )
                                .then(callback)
                                .catch(errback);
                        });
                        producer.on('@replacetrack', (track, callback, errback) => {
                            this._awaitQueue
                                .push(
                                    async () => await this._handler.replaceTrack(producer.localId, track),
                                    'producer @replacetrack event',
                                )
                                .then(callback)
                                .catch(errback);
                        });
                        producer.on('@setmaxspatiallayer', (spatialLayer, callback, errback) => {
                            this._awaitQueue
                                .push(
                                    async () => await this._handler.setMaxSpatialLayer(producer.localId, spatialLayer),
                                    'producer @setmaxspatiallayer event',
                                )
                                .then(callback)
                                .catch(errback);
                        });
                        producer.on('@setrtpencodingparameters', (params, callback, errback) => {
                            this._awaitQueue
                                .push(
                                    async () => await this._handler.setRtpEncodingParameters(producer.localId, params),
                                    'producer @setrtpencodingparameters event',
                                )
                                .then(callback)
                                .catch(errback);
                        });
                        producer.on('@getstats', (callback, errback) => {
                            if (this._closed) {
                                return errback(new errors_1.InvalidStateError('closed'));
                            }
                            this._handler.getSenderStats(producer.localId).then(callback).catch(errback);
                        });
                    }
                    handleConsumer(consumer) {
                        consumer.on('@close', () => {
                            this._consumers.delete(consumer.id);
                            this._pendingPauseConsumers.delete(consumer.id);
                            this._pendingResumeConsumers.delete(consumer.id);
                            if (this._closed) {
                                return;
                            }
                            // Store the Consumer into the close list.
                            this._pendingCloseConsumers.set(consumer.id, consumer);
                            // There is no Consumer close in progress, do it now.
                            if (this._consumerCloseInProgress === false) {
                                this.closePendingConsumers();
                            }
                        });
                        consumer.on('@pause', () => {
                            // If Consumer is pending to be resumed, remove from pending resume list.
                            if (this._pendingResumeConsumers.has(consumer.id)) {
                                this._pendingResumeConsumers.delete(consumer.id);
                            }
                            // Store the Consumer into the pending list.
                            this._pendingPauseConsumers.set(consumer.id, consumer);
                            // There is no Consumer pause in progress, do it now.
                            (0, queue_microtask_1.default)(() => {
                                if (this._closed) {
                                    return;
                                }
                                if (this._consumerPauseInProgress === false) {
                                    this.pausePendingConsumers();
                                }
                            });
                        });
                        consumer.on('@resume', () => {
                            // If Consumer is pending to be paused, remove from pending pause list.
                            if (this._pendingPauseConsumers.has(consumer.id)) {
                                this._pendingPauseConsumers.delete(consumer.id);
                            }
                            // Store the Consumer into the pending list.
                            this._pendingResumeConsumers.set(consumer.id, consumer);
                            // There is no Consumer resume in progress, do it now.
                            (0, queue_microtask_1.default)(() => {
                                if (this._closed) {
                                    return;
                                }
                                if (this._consumerResumeInProgress === false) {
                                    this.resumePendingConsumers();
                                }
                            });
                        });
                        consumer.on('@getstats', (callback, errback) => {
                            if (this._closed) {
                                return errback(new errors_1.InvalidStateError('closed'));
                            }
                            this._handler.getReceiverStats(consumer.localId).then(callback).catch(errback);
                        });
                    }
                    handleDataProducer(dataProducer) {
                        dataProducer.on('@close', () => {
                            this._dataProducers.delete(dataProducer.id);
                        });
                    }
                    handleDataConsumer(dataConsumer) {
                        dataConsumer.on('@close', () => {
                            this._dataConsumers.delete(dataConsumer.id);
                        });
                    }
                }
                exports.Transport = Transport;
            },
            {
                './Consumer': 7,
                './DataConsumer': 8,
                './DataProducer': 9,
                './EnhancedEventEmitter': 11,
                './Logger': 12,
                './Producer': 13,
                './errors': 17,
                './ortc': 39,
                './utils': 42,
                awaitqueue: 2,
                'queue-microtask': 44,
            },
        ],
        17: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.InvalidStateError = exports.UnsupportedError = void 0;
                /**
                 * Error indicating not support for something.
                 */
                class UnsupportedError extends Error {
                    constructor(message) {
                        super(message);
                        this.name = 'UnsupportedError';
                        if (Error.hasOwnProperty('captureStackTrace')) {
                            // Just in V8.
                            // @ts-ignore
                            Error.captureStackTrace(this, UnsupportedError);
                        } else {
                            this.stack = new Error(message).stack;
                        }
                    }
                }
                exports.UnsupportedError = UnsupportedError;
                /**
                 * Error produced when calling a method in an invalid state.
                 */
                class InvalidStateError extends Error {
                    constructor(message) {
                        super(message);
                        this.name = 'InvalidStateError';
                        if (Error.hasOwnProperty('captureStackTrace')) {
                            // Just in V8.
                            // @ts-ignore
                            Error.captureStackTrace(this, InvalidStateError);
                        } else {
                            this.stack = new Error(message).stack;
                        }
                    }
                }
                exports.InvalidStateError = InvalidStateError;
            },
            {},
        ],
        18: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Chrome111 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpUnifiedPlanUtils = __importStar(require('./sdp/unifiedPlanUtils'));
                const ortcUtils = __importStar(require('./ortc/utils'));
                const errors_1 = require('../errors');
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const scalabilityModes_1 = require('../scalabilityModes');
                const logger = new Logger_1.Logger('Chrome111');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class Chrome111 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Chrome111();
                    }
                    constructor() {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Map of RTCTransceivers indexed by MID.
                        this._mapMidTransceiver = new Map();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Chrome111';
                    }
                    close() {
                        logger.debug('close()');
                        if (this._closed) {
                            return;
                        }
                        this._closed = true;
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                            sdpSemantics: 'unified-plan',
                        });
                        try {
                            pc.addTransceiver('audio');
                            pc.addTransceiver('video');
                            const offer = await pc.createOffer();
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            // libwebrtc supports NACK for OPUS but doesn't announce it.
                            ortcUtils.addNackSuppportForOpus(nativeRtpCapabilities);
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        this.assertNotClosed();
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                sdpSemantics: 'unified-plan',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        this.assertNotClosed();
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        this.assertNotClosed();
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        this.assertNotClosed();
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (encodings && encodings.length > 1) {
                            // Set rid and verify scalabilityMode in each encoding.
                            // NOTE: Even if WebRTC allows different scalabilityMode (different number
                            // of temporal layers) per simulcast stream, we need that those are the
                            // same in all them, so let's pick up the highest value.
                            // NOTE: If scalabilityMode is not given, Chrome will use L1T3.
                            let maxTemporalLayers = 1;
                            for (const encoding of encodings) {
                                const temporalLayers = encoding.scalabilityMode
                                    ? (0, scalabilityModes_1.parse)(encoding.scalabilityMode).temporalLayers
                                    : 3;
                                if (temporalLayers > maxTemporalLayers) {
                                    maxTemporalLayers = temporalLayers;
                                }
                            }
                            encodings.forEach((encoding, idx) => {
                                encoding.rid = `r${idx}`;
                                encoding.scalabilityMode = `L1T${maxTemporalLayers}`;
                            });
                        }
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        // This may throw.
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        // This may throw.
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
                        const mediaSectionIdx = this._remoteSdp.getNextMediaSectionIdx();
                        const transceiver = this._pc.addTransceiver(track, {
                            direction: 'sendonly',
                            streams: [this._sendStream],
                            sendEncodings: encodings,
                        });
                        const offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        // We can now get the transceiver.mid.
                        const localId = transceiver.mid;
                        // Set MID.
                        sendingRtpParameters.mid = localId;
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        const offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings by parsing the SDP offer if no encodings are given.
                        if (!encodings) {
                            sendingRtpParameters.encodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                        }
                        // Set RTP encodings by parsing the SDP offer and complete them with given
                        // one if just a single encoding has been given.
                        else if (encodings.length === 1) {
                            const newEncodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                            Object.assign(newEncodings[0], encodings[0]);
                            sendingRtpParameters.encodings = newEncodings;
                        }
                        // Otherwise if more than 1 encoding are given use them verbatim.
                        else {
                            sendingRtpParameters.encodings = encodings;
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            reuseMid: mediaSectionIdx.reuseMid,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                            extmapAllowMixed: true,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        // Store in the map.
                        this._mapMidTransceiver.set(localId, transceiver);
                        return {
                            localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender: transceiver.sender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        logger.debug('stopSending() [localId:%s]', localId);
                        if (this._closed) {
                            return;
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.sender.replaceTrack(null);
                        this._pc.removeTrack(transceiver.sender);
                        const mediaSectionClosed = this._remoteSdp.closeMediaSection(transceiver.mid);
                        if (mediaSectionClosed) {
                            try {
                                transceiver.stop();
                            } catch (error) {}
                        }
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        this._mapMidTransceiver.delete(localId);
                    }
                    async pauseSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('pauseSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'inactive';
                        this._remoteSdp.pauseMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('pauseSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async resumeSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('resumeSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        this._remoteSdp.resumeSendingMediaSection(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'sendonly';
                        const offer = await this._pc.createOffer();
                        logger.debug('resumeSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async replaceTrack(localId, track) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        await transceiver.sender.replaceTrack(track);
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setMaxSpatialLayer() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('setMaxSpatialLayer() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setRtpEncodingParameters() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug(
                            'setRtpEncodingParameters() | calling pc.setRemoteDescription() [answer:%o]',
                            answer,
                        );
                        await this._pc.setRemoteDescription(answer);
                    }
                    async getSenderStats(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.sender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const results = [];
                        const mapLocalId = new Map();
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const localId = rtpParameters.mid || String(this._mapMidTransceiver.size);
                            mapLocalId.set(trackId, localId);
                            this._remoteSdp.receive({
                                mid: localId,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { trackId, rtpParameters } = options;
                            const localId = mapLocalId.get(trackId);
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === localId);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { trackId } = options;
                            const localId = mapLocalId.get(trackId);
                            const transceiver = this._pc.getTransceivers().find((t) => t.mid === localId);
                            if (!transceiver) {
                                throw new Error('new RTCRtpTransceiver not found');
                            } else {
                                // Store in the map.
                                this._mapMidTransceiver.set(localId, transceiver);
                                results.push({
                                    localId,
                                    track: transceiver.receiver.track,
                                    rtpReceiver: transceiver.receiver,
                                });
                            }
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        if (this._closed) {
                            return;
                        }
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            this._remoteSdp.closeMediaSection(transceiver.mid);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const localId of localIds) {
                            this._mapMidTransceiver.delete(localId);
                        }
                    }
                    async pauseReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('pauseReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'inactive';
                            this._remoteSdp.pauseMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('pauseReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async resumeReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('resumeReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'recvonly';
                            this._remoteSdp.resumeReceivingMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('resumeReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async getReceiverStats(localId) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.receiver.getStats();
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation();
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertNotClosed() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('method called in a closed handler');
                        }
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Chrome111 = Chrome111;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../scalabilityModes': 40,
                '../utils': 42,
                './HandlerInterface': 26,
                './ortc/utils': 32,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/unifiedPlanUtils': 37,
                'sdp-transform': 46,
            },
        ],
        19: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Chrome55 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const errors_1 = require('../errors');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpPlanBUtils = __importStar(require('./sdp/planBUtils'));
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const logger = new Logger_1.Logger('Chrome55');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class Chrome55 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Chrome55();
                    }
                    constructor() {
                        super();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Map of sending MediaStreamTracks indexed by localId.
                        this._mapSendLocalIdTrack = new Map();
                        // Next sending localId.
                        this._nextSendLocalId = 0;
                        // Map of MID, RTP parameters and RTCRtpReceiver indexed by local id.
                        // Value is an Object with mid, rtpParameters and rtpReceiver.
                        this._mapRecvLocalIdInfo = new Map();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Chrome55';
                    }
                    close() {
                        logger.debug('close()');
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                            sdpSemantics: 'plan-b',
                        });
                        try {
                            const offer = await pc.createOffer({
                                offerToReceiveAudio: true,
                                offerToReceiveVideo: true,
                            });
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                            planB: true,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                sdpSemantics: 'plan-b',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (codec) {
                            logger.warn('send() | codec selection is not available in %s handler', this.name);
                        }
                        this._sendStream.addTrack(track);
                        this._pc.addStream(this._sendStream);
                        let offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        let offerMediaObject;
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs);
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        if (track.kind === 'video' && encodings && encodings.length > 1) {
                            logger.debug('send() | enabling simulcast');
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media.find((m) => m.type === 'video');
                            sdpPlanBUtils.addLegacySimulcast({
                                offerMediaObject,
                                track,
                                numStreams: encodings.length,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        offerMediaObject = localSdpObject.media.find((m) => m.type === track.kind);
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings.
                        sendingRtpParameters.encodings = sdpPlanBUtils.getRtpEncodings({
                            offerMediaObject,
                            track,
                        });
                        // Complete encodings with given values.
                        if (encodings) {
                            for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx) {
                                if (encodings[idx]) {
                                    Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
                                }
                            }
                        }
                        // If VP8 and there is effective simulcast, add scalabilityMode to each
                        // encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8'
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                encoding.scalabilityMode = 'L1T3';
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        const localId = String(this._nextSendLocalId);
                        this._nextSendLocalId++;
                        // Insert into the map.
                        this._mapSendLocalIdTrack.set(localId, track);
                        return {
                            localId: localId,
                            rtpParameters: sendingRtpParameters,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        logger.debug('stopSending() [localId:%s]', localId);
                        const track = this._mapSendLocalIdTrack.get(localId);
                        if (!track) {
                            throw new Error('track not found');
                        }
                        this._mapSendLocalIdTrack.delete(localId);
                        this._sendStream.removeTrack(track);
                        this._pc.addStream(this._sendStream);
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        try {
                            await this._pc.setLocalDescription(offer);
                        } catch (error) {
                            // NOTE: If there are no sending tracks, setLocalDescription() will fail with
                            // "Failed to create channels". If so, ignore it.
                            if (this._sendStream.getTracks().length === 0) {
                                logger.warn(
                                    'stopSending() | ignoring expected error due no sending tracks: %s',
                                    error.toString(),
                                );
                                return;
                            }
                            throw error;
                        }
                        if (this._pc.signalingState === 'stable') {
                            return;
                        }
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        // Unimplemented.
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        // Unimplemented.
                    }
                    async replaceTrack(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localId,
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        track,
                    ) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    async setMaxSpatialLayer(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localId,
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        spatialLayer,
                    ) {
                        throw new errors_1.UnsupportedError(' not implemented');
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async setRtpEncodingParameters(localId, params) {
                        throw new errors_1.UnsupportedError('not supported');
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async getSenderStats(localId) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmitTime: maxPacketLifeTime, // NOTE: Old spec.
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertRecvDirection();
                        const results = [];
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const mid = kind;
                            this._remoteSdp.receive({
                                mid,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { kind, rtpParameters } = options;
                            const mid = kind;
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === mid);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { kind, trackId, rtpParameters } = options;
                            const mid = kind;
                            const localId = trackId;
                            const streamId = options.streamId || rtpParameters.rtcp.cname;
                            const stream = this._pc.getRemoteStreams().find((s) => s.id === streamId);
                            const track = stream.getTrackById(localId);
                            if (!track) {
                                throw new Error('remote track not found');
                            }
                            // Insert into the map.
                            this._mapRecvLocalIdInfo.set(localId, { mid, rtpParameters });
                            results.push({ localId, track });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const { mid, rtpParameters } = this._mapRecvLocalIdInfo.get(localId) || {};
                            // Remove from the map.
                            this._mapRecvLocalIdInfo.delete(localId);
                            this._remoteSdp.planBStopReceiving({
                                mid: mid,
                                offerRtpParameters: rtpParameters,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async pauseReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async resumeReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async getReceiverStats(localId) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmitTime: maxPacketLifeTime, // NOTE: Old spec.
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation({ oldDataChannelSpec: true });
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Chrome55 = Chrome55;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../utils': 42,
                './HandlerInterface': 26,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/planBUtils': 36,
                'sdp-transform': 46,
            },
        ],
        20: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Chrome67 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpPlanBUtils = __importStar(require('./sdp/planBUtils'));
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const logger = new Logger_1.Logger('Chrome67');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class Chrome67 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Chrome67();
                    }
                    constructor() {
                        super();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Map of RTCRtpSender indexed by localId.
                        this._mapSendLocalIdRtpSender = new Map();
                        // Next sending localId.
                        this._nextSendLocalId = 0;
                        // Map of MID, RTP parameters and RTCRtpReceiver indexed by local id.
                        // Value is an Object with mid, rtpParameters and rtpReceiver.
                        this._mapRecvLocalIdInfo = new Map();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Chrome67';
                    }
                    close() {
                        logger.debug('close()');
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                            sdpSemantics: 'plan-b',
                        });
                        try {
                            const offer = await pc.createOffer({
                                offerToReceiveAudio: true,
                                offerToReceiveVideo: true,
                            });
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                            planB: true,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                sdpSemantics: 'plan-b',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (codec) {
                            logger.warn('send() | codec selection is not available in %s handler', this.name);
                        }
                        this._sendStream.addTrack(track);
                        this._pc.addTrack(track, this._sendStream);
                        let offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        let offerMediaObject;
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs);
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        if (track.kind === 'video' && encodings && encodings.length > 1) {
                            logger.debug('send() | enabling simulcast');
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media.find((m) => m.type === 'video');
                            sdpPlanBUtils.addLegacySimulcast({
                                offerMediaObject,
                                track,
                                numStreams: encodings.length,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        offerMediaObject = localSdpObject.media.find((m) => m.type === track.kind);
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings.
                        sendingRtpParameters.encodings = sdpPlanBUtils.getRtpEncodings({
                            offerMediaObject,
                            track,
                        });
                        // Complete encodings with given values.
                        if (encodings) {
                            for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx) {
                                if (encodings[idx]) {
                                    Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
                                }
                            }
                        }
                        // If VP8 and there is effective simulcast, add scalabilityMode to each
                        // encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8'
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                encoding.scalabilityMode = 'L1T3';
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        const localId = String(this._nextSendLocalId);
                        this._nextSendLocalId++;
                        const rtpSender = this._pc.getSenders().find((s) => s.track === track);
                        // Insert into the map.
                        this._mapSendLocalIdRtpSender.set(localId, rtpSender);
                        return {
                            localId: localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        logger.debug('stopSending() [localId:%s]', localId);
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        this._pc.removeTrack(rtpSender);
                        if (rtpSender.track) {
                            this._sendStream.removeTrack(rtpSender.track);
                        }
                        this._mapSendLocalIdRtpSender.delete(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        try {
                            await this._pc.setLocalDescription(offer);
                        } catch (error) {
                            // NOTE: If there are no sending tracks, setLocalDescription() will fail with
                            // "Failed to create channels". If so, ignore it.
                            if (this._sendStream.getTracks().length === 0) {
                                logger.warn(
                                    'stopSending() | ignoring expected error due no sending tracks: %s',
                                    error.toString(),
                                );
                                return;
                            }
                            throw error;
                        }
                        if (this._pc.signalingState === 'stable') {
                            return;
                        }
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        // Unimplemented.
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        // Unimplemented.
                    }
                    async replaceTrack(localId, track) {
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        const oldTrack = rtpSender.track;
                        await rtpSender.replaceTrack(track);
                        // Remove the old track from the local stream.
                        if (oldTrack) {
                            this._sendStream.removeTrack(oldTrack);
                        }
                        // Add the new track to the local stream.
                        if (track) {
                            this._sendStream.addTrack(track);
                        }
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        const parameters = rtpSender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await rtpSender.setParameters(parameters);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        const parameters = rtpSender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await rtpSender.setParameters(parameters);
                    }
                    async getSenderStats(localId) {
                        this.assertSendDirection();
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        return rtpSender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmitTime: maxPacketLifeTime, // NOTE: Old spec.
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertRecvDirection();
                        const results = [];
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const mid = kind;
                            this._remoteSdp.receive({
                                mid,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { kind, rtpParameters } = options;
                            const mid = kind;
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === mid);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { kind, trackId, rtpParameters } = options;
                            const localId = trackId;
                            const mid = kind;
                            const rtpReceiver = this._pc.getReceivers().find((r) => r.track && r.track.id === localId);
                            if (!rtpReceiver) {
                                throw new Error('new RTCRtpReceiver not');
                            }
                            // Insert into the map.
                            this._mapRecvLocalIdInfo.set(localId, {
                                mid,
                                rtpParameters,
                                rtpReceiver,
                            });
                            results.push({
                                localId,
                                track: rtpReceiver.track,
                                rtpReceiver,
                            });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const { mid, rtpParameters } = this._mapRecvLocalIdInfo.get(localId) || {};
                            // Remove from the map.
                            this._mapRecvLocalIdInfo.delete(localId);
                            this._remoteSdp.planBStopReceiving({
                                mid: mid,
                                offerRtpParameters: rtpParameters,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async pauseReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async resumeReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async getReceiverStats(localId) {
                        this.assertRecvDirection();
                        const { rtpReceiver } = this._mapRecvLocalIdInfo.get(localId) || {};
                        if (!rtpReceiver) {
                            throw new Error('associated RTCRtpReceiver not found');
                        }
                        return rtpReceiver.getStats();
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmitTime: maxPacketLifeTime, // NOTE: Old spec.
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation({ oldDataChannelSpec: true });
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Chrome67 = Chrome67;
            },
            {
                '../Logger': 12,
                '../ortc': 39,
                '../utils': 42,
                './HandlerInterface': 26,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/planBUtils': 36,
                'sdp-transform': 46,
            },
        ],
        21: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Chrome70 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpUnifiedPlanUtils = __importStar(require('./sdp/unifiedPlanUtils'));
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const scalabilityModes_1 = require('../scalabilityModes');
                const logger = new Logger_1.Logger('Chrome70');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class Chrome70 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Chrome70();
                    }
                    constructor() {
                        super();
                        // Map of RTCTransceivers indexed by MID.
                        this._mapMidTransceiver = new Map();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Chrome70';
                    }
                    close() {
                        logger.debug('close()');
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                            sdpSemantics: 'unified-plan',
                        });
                        try {
                            pc.addTransceiver('audio');
                            pc.addTransceiver('video');
                            const offer = await pc.createOffer();
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                sdpSemantics: 'unified-plan',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        // This may throw.
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        // This may throw.
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
                        const mediaSectionIdx = this._remoteSdp.getNextMediaSectionIdx();
                        const transceiver = this._pc.addTransceiver(track, {
                            direction: 'sendonly',
                            streams: [this._sendStream],
                        });
                        let offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        let offerMediaObject;
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        if (encodings && encodings.length > 1) {
                            logger.debug('send() | enabling legacy simulcast');
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                            sdpUnifiedPlanUtils.addLegacySimulcast({
                                offerMediaObject,
                                numStreams: encodings.length,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        // Special case for VP9 with SVC.
                        let hackVp9Svc = false;
                        const layers = (0, scalabilityModes_1.parse)((encodings || [{}])[0].scalabilityMode);
                        if (
                            encodings &&
                            encodings.length === 1 &&
                            layers.spatialLayers > 1 &&
                            sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp9'
                        ) {
                            logger.debug('send() | enabling legacy simulcast for VP9 SVC');
                            hackVp9Svc = true;
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                            sdpUnifiedPlanUtils.addLegacySimulcast({
                                offerMediaObject,
                                numStreams: layers.spatialLayers,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        // If encodings are given, apply them now.
                        if (encodings) {
                            logger.debug('send() | applying given encodings');
                            const parameters = transceiver.sender.getParameters();
                            for (let idx = 0; idx < (parameters.encodings || []).length; ++idx) {
                                const encoding = parameters.encodings[idx];
                                const desiredEncoding = encodings[idx];
                                // Should not happen but just in case.
                                if (!desiredEncoding) {
                                    break;
                                }
                                parameters.encodings[idx] = Object.assign(encoding, desiredEncoding);
                            }
                            await transceiver.sender.setParameters(parameters);
                        }
                        // We can now get the transceiver.mid.
                        const localId = transceiver.mid;
                        // Set MID.
                        sendingRtpParameters.mid = localId;
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings.
                        sendingRtpParameters.encodings = sdpUnifiedPlanUtils.getRtpEncodings({
                            offerMediaObject,
                        });
                        // Complete encodings with given values.
                        if (encodings) {
                            for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx) {
                                if (encodings[idx]) {
                                    Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
                                }
                            }
                        }
                        // Hack for VP9 SVC.
                        if (hackVp9Svc) {
                            sendingRtpParameters.encodings = [sendingRtpParameters.encodings[0]];
                        }
                        // If VP8 or H264 and there is effective simulcast, add scalabilityMode to
                        // each encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            (sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
                                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                encoding.scalabilityMode = 'L1T3';
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            reuseMid: mediaSectionIdx.reuseMid,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        // Store in the map.
                        this._mapMidTransceiver.set(localId, transceiver);
                        return {
                            localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender: transceiver.sender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        logger.debug('stopSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.sender.replaceTrack(null);
                        this._pc.removeTrack(transceiver.sender);
                        const mediaSectionClosed = this._remoteSdp.closeMediaSection(transceiver.mid);
                        if (mediaSectionClosed) {
                            try {
                                transceiver.stop();
                            } catch (error) {}
                        }
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        this._mapMidTransceiver.delete(localId);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        // Unimplemented.
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        // Unimplemented.
                    }
                    async replaceTrack(localId, track) {
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        await transceiver.sender.replaceTrack(track);
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setMaxSpatialLayer() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('setMaxSpatialLayer() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setRtpEncodingParameters() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug(
                            'setRtpEncodingParameters() | calling pc.setRemoteDescription() [answer:%o]',
                            answer,
                        );
                        await this._pc.setRemoteDescription(answer);
                    }
                    async getSenderStats(localId) {
                        this.assertSendDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.sender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmitTime: maxPacketLifeTime, // NOTE: Old spec.
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertRecvDirection();
                        const results = [];
                        const mapLocalId = new Map();
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const localId = rtpParameters.mid || String(this._mapMidTransceiver.size);
                            mapLocalId.set(trackId, localId);
                            this._remoteSdp.receive({
                                mid: localId,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { trackId, rtpParameters } = options;
                            const localId = mapLocalId.get(trackId);
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === localId);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { trackId } = options;
                            const localId = mapLocalId.get(trackId);
                            const transceiver = this._pc.getTransceivers().find((t) => t.mid === localId);
                            if (!transceiver) {
                                throw new Error('new RTCRtpTransceiver not found');
                            }
                            // Store in the map.
                            this._mapMidTransceiver.set(localId, transceiver);
                            results.push({
                                localId,
                                track: transceiver.receiver.track,
                                rtpReceiver: transceiver.receiver,
                            });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            this._remoteSdp.closeMediaSection(transceiver.mid);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const localId of localIds) {
                            this._mapMidTransceiver.delete(localId);
                        }
                    }
                    async pauseReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async resumeReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async getReceiverStats(localId) {
                        this.assertRecvDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.receiver.getStats();
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmitTime: maxPacketLifeTime, // NOTE: Old spec.
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation();
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Chrome70 = Chrome70;
            },
            {
                '../Logger': 12,
                '../ortc': 39,
                '../scalabilityModes': 40,
                '../utils': 42,
                './HandlerInterface': 26,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/unifiedPlanUtils': 37,
                'sdp-transform': 46,
            },
        ],
        22: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Chrome74 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpUnifiedPlanUtils = __importStar(require('./sdp/unifiedPlanUtils'));
                const ortcUtils = __importStar(require('./ortc/utils'));
                const errors_1 = require('../errors');
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const scalabilityModes_1 = require('../scalabilityModes');
                const logger = new Logger_1.Logger('Chrome74');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class Chrome74 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Chrome74();
                    }
                    constructor() {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Map of RTCTransceivers indexed by MID.
                        this._mapMidTransceiver = new Map();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Chrome74';
                    }
                    close() {
                        logger.debug('close()');
                        if (this._closed) {
                            return;
                        }
                        this._closed = true;
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                            sdpSemantics: 'unified-plan',
                        });
                        try {
                            pc.addTransceiver('audio');
                            pc.addTransceiver('video');
                            const offer = await pc.createOffer();
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            // libwebrtc supports NACK for OPUS but doesn't announce it.
                            ortcUtils.addNackSuppportForOpus(nativeRtpCapabilities);
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                sdpSemantics: 'unified-plan',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        this.assertNotClosed();
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        this.assertNotClosed();
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        this.assertNotClosed();
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (encodings && encodings.length > 1) {
                            encodings.forEach((encoding, idx) => {
                                encoding.rid = `r${idx}`;
                            });
                        }
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        // This may throw.
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        // This may throw.
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
                        const mediaSectionIdx = this._remoteSdp.getNextMediaSectionIdx();
                        const transceiver = this._pc.addTransceiver(track, {
                            direction: 'sendonly',
                            streams: [this._sendStream],
                            sendEncodings: encodings,
                        });
                        let offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        let offerMediaObject;
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        // Special case for VP9 with SVC.
                        let hackVp9Svc = false;
                        const layers = (0, scalabilityModes_1.parse)((encodings || [{}])[0].scalabilityMode);
                        if (
                            encodings &&
                            encodings.length === 1 &&
                            layers.spatialLayers > 1 &&
                            sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp9'
                        ) {
                            logger.debug('send() | enabling legacy simulcast for VP9 SVC');
                            hackVp9Svc = true;
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                            sdpUnifiedPlanUtils.addLegacySimulcast({
                                offerMediaObject,
                                numStreams: layers.spatialLayers,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        // We can now get the transceiver.mid.
                        const localId = transceiver.mid;
                        // Set MID.
                        sendingRtpParameters.mid = localId;
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings by parsing the SDP offer if no encodings are given.
                        if (!encodings) {
                            sendingRtpParameters.encodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                        }
                        // Set RTP encodings by parsing the SDP offer and complete them with given
                        // one if just a single encoding has been given.
                        else if (encodings.length === 1) {
                            let newEncodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                            Object.assign(newEncodings[0], encodings[0]);
                            // Hack for VP9 SVC.
                            if (hackVp9Svc) {
                                newEncodings = [newEncodings[0]];
                            }
                            sendingRtpParameters.encodings = newEncodings;
                        }
                        // Otherwise if more than 1 encoding are given use them verbatim.
                        else {
                            sendingRtpParameters.encodings = encodings;
                        }
                        // If VP8 or H264 and there is effective simulcast, add scalabilityMode to
                        // each encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            (sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
                                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                if (encoding.scalabilityMode) {
                                    encoding.scalabilityMode = `L1T${layers.temporalLayers}`;
                                } else {
                                    encoding.scalabilityMode = 'L1T3';
                                }
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            reuseMid: mediaSectionIdx.reuseMid,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                            extmapAllowMixed: true,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        // Store in the map.
                        this._mapMidTransceiver.set(localId, transceiver);
                        return {
                            localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender: transceiver.sender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        logger.debug('stopSending() [localId:%s]', localId);
                        if (this._closed) {
                            return;
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.sender.replaceTrack(null);
                        this._pc.removeTrack(transceiver.sender);
                        const mediaSectionClosed = this._remoteSdp.closeMediaSection(transceiver.mid);
                        if (mediaSectionClosed) {
                            try {
                                transceiver.stop();
                            } catch (error) {}
                        }
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        this._mapMidTransceiver.delete(localId);
                    }
                    async pauseSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('pauseSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'inactive';
                        this._remoteSdp.pauseMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('pauseSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async resumeSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('resumeSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        this._remoteSdp.resumeSendingMediaSection(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'sendonly';
                        const offer = await this._pc.createOffer();
                        logger.debug('resumeSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async replaceTrack(localId, track) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        await transceiver.sender.replaceTrack(track);
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setMaxSpatialLayer() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('setMaxSpatialLayer() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setRtpEncodingParameters() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug(
                            'setRtpEncodingParameters() | calling pc.setRemoteDescription() [answer:%o]',
                            answer,
                        );
                        await this._pc.setRemoteDescription(answer);
                    }
                    async getSenderStats(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.sender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const results = [];
                        const mapLocalId = new Map();
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const localId = rtpParameters.mid || String(this._mapMidTransceiver.size);
                            mapLocalId.set(trackId, localId);
                            this._remoteSdp.receive({
                                mid: localId,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { trackId, rtpParameters } = options;
                            const localId = mapLocalId.get(trackId);
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === localId);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { trackId } = options;
                            const localId = mapLocalId.get(trackId);
                            const transceiver = this._pc.getTransceivers().find((t) => t.mid === localId);
                            if (!transceiver) {
                                throw new Error('new RTCRtpTransceiver not found');
                            } else {
                                // Store in the map.
                                this._mapMidTransceiver.set(localId, transceiver);
                                results.push({
                                    localId,
                                    track: transceiver.receiver.track,
                                    rtpReceiver: transceiver.receiver,
                                });
                            }
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        if (this._closed) {
                            return;
                        }
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            this._remoteSdp.closeMediaSection(transceiver.mid);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const localId of localIds) {
                            this._mapMidTransceiver.delete(localId);
                        }
                    }
                    async pauseReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('pauseReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'inactive';
                            this._remoteSdp.pauseMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('pauseReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async resumeReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('resumeReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'recvonly';
                            this._remoteSdp.resumeReceivingMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('resumeReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async getReceiverStats(localId) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.receiver.getStats();
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation();
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertNotClosed() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('method called in a closed handler');
                        }
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Chrome74 = Chrome74;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../scalabilityModes': 40,
                '../utils': 42,
                './HandlerInterface': 26,
                './ortc/utils': 32,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/unifiedPlanUtils': 37,
                'sdp-transform': 46,
            },
        ],
        23: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Edge11 = void 0;
                const Logger_1 = require('../Logger');
                const errors_1 = require('../errors');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const edgeUtils = __importStar(require('./ortc/edgeUtils'));
                const HandlerInterface_1 = require('./HandlerInterface');
                const logger = new Logger_1.Logger('Edge11');
                class Edge11 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Edge11();
                    }
                    constructor() {
                        super();
                        // Map of RTCRtpSenders indexed by id.
                        this._rtpSenders = new Map();
                        // Map of RTCRtpReceivers indexed by id.
                        this._rtpReceivers = new Map();
                        // Next localId for sending tracks.
                        this._nextSendLocalId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Edge11';
                    }
                    close() {
                        logger.debug('close()');
                        // Close the ICE gatherer.
                        // NOTE: Not yet implemented by Edge.
                        try {
                            this._iceGatherer.close();
                        } catch (error) {}
                        // Close the ICE transport.
                        try {
                            this._iceTransport.stop();
                        } catch (error) {}
                        // Close the DTLS transport.
                        try {
                            this._dtlsTransport.stop();
                        } catch (error) {}
                        // Close RTCRtpSenders.
                        for (const rtpSender of this._rtpSenders.values()) {
                            try {
                                rtpSender.stop();
                            } catch (error) {}
                        }
                        // Close RTCRtpReceivers.
                        for (const rtpReceiver of this._rtpReceivers.values()) {
                            try {
                                rtpReceiver.stop();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        return edgeUtils.getCapabilities();
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: { OS: 0, MIS: 0 },
                        };
                    }
                    run({
                        direction, // eslint-disable-line @typescript-eslint/no-unused-vars
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters, // eslint-disable-line @typescript-eslint/no-unused-vars
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings, // eslint-disable-line @typescript-eslint/no-unused-vars
                        proprietaryConstraints, // eslint-disable-line @typescript-eslint/no-unused-vars
                        extendedRtpCapabilities,
                    }) {
                        logger.debug('run()');
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._remoteIceParameters = iceParameters;
                        this._remoteIceCandidates = iceCandidates;
                        this._remoteDtlsParameters = dtlsParameters;
                        this._cname = `CNAME-${utils.generateRandomNumber()}`;
                        this.setIceGatherer({ iceServers, iceTransportPolicy });
                        this.setIceTransport();
                        this.setDtlsTransport();
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async updateIceServers(iceServers) {
                        // NOTE: Edge 11 does not implement iceGatherer.gater().
                        throw new errors_1.UnsupportedError('not supported');
                    }
                    async restartIce(iceParameters) {
                        logger.debug('restartIce()');
                        this._remoteIceParameters = iceParameters;
                        if (!this._transportReady) {
                            return;
                        }
                        logger.debug('restartIce() | calling iceTransport.start()');
                        this._iceTransport.start(this._iceGatherer, iceParameters, 'controlling');
                        for (const candidate of this._remoteIceCandidates) {
                            this._iceTransport.addRemoteCandidate(candidate);
                        }
                        this._iceTransport.addRemoteCandidate({});
                    }
                    async getTransportStats() {
                        return this._iceTransport.getStats();
                    }
                    async send(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        { track, encodings, codecOptions, codec },
                    ) {
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (!this._transportReady) {
                            await this.setupTransport({ localDtlsRole: 'server' });
                        }
                        logger.debug('send() | calling new RTCRtpSender()');
                        const rtpSender = new RTCRtpSender(track, this._dtlsTransport);
                        const rtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        rtpParameters.codecs = ortc.reduceCodecs(rtpParameters.codecs, codec);
                        const useRtx = rtpParameters.codecs.some((_codec) => /.+\/rtx$/i.test(_codec.mimeType));
                        if (!encodings) {
                            encodings = [{}];
                        }
                        for (const encoding of encodings) {
                            encoding.ssrc = utils.generateRandomNumber();
                            if (useRtx) {
                                encoding.rtx = { ssrc: utils.generateRandomNumber() };
                            }
                        }
                        rtpParameters.encodings = encodings;
                        // Fill RTCRtpParameters.rtcp.
                        rtpParameters.rtcp = {
                            cname: this._cname,
                            reducedSize: true,
                            mux: true,
                        };
                        // NOTE: Convert our standard RTCRtpParameters into those that Edge
                        // expects.
                        const edgeRtpParameters = edgeUtils.mangleRtpParameters(rtpParameters);
                        logger.debug('send() | calling rtpSender.send() [params:%o]', edgeRtpParameters);
                        await rtpSender.send(edgeRtpParameters);
                        const localId = String(this._nextSendLocalId);
                        this._nextSendLocalId++;
                        // Store it.
                        this._rtpSenders.set(localId, rtpSender);
                        return { localId, rtpParameters, rtpSender };
                    }
                    async stopSending(localId) {
                        logger.debug('stopSending() [localId:%s]', localId);
                        const rtpSender = this._rtpSenders.get(localId);
                        if (!rtpSender) {
                            throw new Error('RTCRtpSender not found');
                        }
                        this._rtpSenders.delete(localId);
                        try {
                            logger.debug('stopSending() | calling rtpSender.stop()');
                            rtpSender.stop();
                        } catch (error) {
                            logger.warn('stopSending() | rtpSender.stop() failed:%o', error);
                            throw error;
                        }
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        // Unimplemented.
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        // Unimplemented.
                    }
                    async replaceTrack(localId, track) {
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const rtpSender = this._rtpSenders.get(localId);
                        if (!rtpSender) {
                            throw new Error('RTCRtpSender not found');
                        }
                        rtpSender.setTrack(track);
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const rtpSender = this._rtpSenders.get(localId);
                        if (!rtpSender) {
                            throw new Error('RTCRtpSender not found');
                        }
                        const parameters = rtpSender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await rtpSender.setParameters(parameters);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const rtpSender = this._rtpSenders.get(localId);
                        if (!rtpSender) {
                            throw new Error('RTCRtpSender not found');
                        }
                        const parameters = rtpSender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await rtpSender.setParameters(parameters);
                    }
                    async getSenderStats(localId) {
                        const rtpSender = this._rtpSenders.get(localId);
                        if (!rtpSender) {
                            throw new Error('RTCRtpSender not found');
                        }
                        return rtpSender.getStats();
                    }
                    async sendDataChannel(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        options,
                    ) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    async receive(optionsList) {
                        const results = [];
                        for (const options of optionsList) {
                            const { trackId, kind } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                        }
                        if (!this._transportReady) {
                            await this.setupTransport({ localDtlsRole: 'server' });
                        }
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters } = options;
                            logger.debug('receive() | calling new RTCRtpReceiver()');
                            const rtpReceiver = new RTCRtpReceiver(this._dtlsTransport, kind);
                            rtpReceiver.addEventListener('error', (event) => {
                                logger.error('rtpReceiver "error" event [event:%o]', event);
                            });
                            // NOTE: Convert our standard RTCRtpParameters into those that Edge
                            // expects.
                            const edgeRtpParameters = edgeUtils.mangleRtpParameters(rtpParameters);
                            logger.debug('receive() | calling rtpReceiver.receive() [params:%o]', edgeRtpParameters);
                            await rtpReceiver.receive(edgeRtpParameters);
                            const localId = trackId;
                            // Store it.
                            this._rtpReceivers.set(localId, rtpReceiver);
                            results.push({
                                localId,
                                track: rtpReceiver.track,
                                rtpReceiver,
                            });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const rtpReceiver = this._rtpReceivers.get(localId);
                            if (!rtpReceiver) {
                                throw new Error('RTCRtpReceiver not found');
                            }
                            this._rtpReceivers.delete(localId);
                            try {
                                logger.debug('stopReceiving() | calling rtpReceiver.stop()');
                                rtpReceiver.stop();
                            } catch (error) {
                                logger.warn('stopReceiving() | rtpReceiver.stop() failed:%o', error);
                            }
                        }
                    }
                    async pauseReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async resumeReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async getReceiverStats(localId) {
                        const rtpReceiver = this._rtpReceivers.get(localId);
                        if (!rtpReceiver) {
                            throw new Error('RTCRtpReceiver not found');
                        }
                        return rtpReceiver.getStats();
                    }
                    async receiveDataChannel(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        options,
                    ) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    setIceGatherer({ iceServers, iceTransportPolicy }) {
                        // @ts-ignore
                        const iceGatherer = new RTCIceGatherer({
                            iceServers: iceServers || [],
                            gatherPolicy: iceTransportPolicy || 'all',
                        });
                        iceGatherer.addEventListener('error', (event) => {
                            logger.error('iceGatherer "error" event [event:%o]', event);
                        });
                        // NOTE: Not yet implemented by Edge, which starts gathering automatically.
                        try {
                            iceGatherer.gather();
                        } catch (error) {
                            logger.debug('setIceGatherer() | iceGatherer.gather() failed: %s', error.toString());
                        }
                        this._iceGatherer = iceGatherer;
                    }
                    setIceTransport() {
                        const iceTransport = new RTCIceTransport(this._iceGatherer);
                        // NOTE: Not yet implemented by Edge.
                        iceTransport.addEventListener('statechange', () => {
                            switch (iceTransport.state) {
                                case 'checking': {
                                    this.emit('@connectionstatechange', 'connecting');
                                    break;
                                }
                                case 'connected':
                                case 'completed': {
                                    this.emit('@connectionstatechange', 'connected');
                                    break;
                                }
                                case 'failed': {
                                    this.emit('@connectionstatechange', 'failed');
                                    break;
                                }
                                case 'disconnected': {
                                    this.emit('@connectionstatechange', 'disconnected');
                                    break;
                                }
                                case 'closed': {
                                    this.emit('@connectionstatechange', 'closed');
                                    break;
                                }
                            }
                        });
                        // NOTE: Not standard, but implemented by Edge.
                        iceTransport.addEventListener('icestatechange', () => {
                            switch (iceTransport.state) {
                                case 'checking': {
                                    this.emit('@connectionstatechange', 'connecting');
                                    break;
                                }
                                case 'connected':
                                case 'completed': {
                                    this.emit('@connectionstatechange', 'connected');
                                    break;
                                }
                                case 'failed': {
                                    this.emit('@connectionstatechange', 'failed');
                                    break;
                                }
                                case 'disconnected': {
                                    this.emit('@connectionstatechange', 'disconnected');
                                    break;
                                }
                                case 'closed': {
                                    this.emit('@connectionstatechange', 'closed');
                                    break;
                                }
                            }
                        });
                        iceTransport.addEventListener('candidatepairchange', (event) => {
                            logger.debug('iceTransport "candidatepairchange" event [pair:%o]', event.pair);
                        });
                        this._iceTransport = iceTransport;
                    }
                    setDtlsTransport() {
                        const dtlsTransport = new RTCDtlsTransport(this._iceTransport);
                        // NOTE: Not yet implemented by Edge.
                        dtlsTransport.addEventListener('statechange', () => {
                            logger.debug('dtlsTransport "statechange" event [state:%s]', dtlsTransport.state);
                        });
                        // NOTE: Not standard, but implemented by Edge.
                        dtlsTransport.addEventListener('dtlsstatechange', () => {
                            logger.debug('dtlsTransport "dtlsstatechange" event [state:%s]', dtlsTransport.state);
                            if (dtlsTransport.state === 'closed') {
                                this.emit('@connectionstatechange', 'closed');
                            }
                        });
                        dtlsTransport.addEventListener('error', (event) => {
                            logger.error('dtlsTransport "error" event [event:%o]', event);
                        });
                        this._dtlsTransport = dtlsTransport;
                    }
                    async setupTransport({ localDtlsRole }) {
                        logger.debug('setupTransport()');
                        // Get our local DTLS parameters.
                        const dtlsParameters = this._dtlsTransport.getLocalParameters();
                        dtlsParameters.role = localDtlsRole;
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        // Start the RTCIceTransport.
                        this._iceTransport.start(this._iceGatherer, this._remoteIceParameters, 'controlling');
                        // Add remote ICE candidates.
                        for (const candidate of this._remoteIceCandidates) {
                            this._iceTransport.addRemoteCandidate(candidate);
                        }
                        // Also signal a 'complete' candidate as per spec.
                        // NOTE: It should be {complete: true} but Edge prefers {}.
                        // NOTE: If we don't signal end of candidates, the Edge RTCIceTransport
                        // won't enter the 'completed' state.
                        this._iceTransport.addRemoteCandidate({});
                        // NOTE: Edge does not like SHA less than 256.
                        this._remoteDtlsParameters.fingerprints = this._remoteDtlsParameters.fingerprints.filter(
                            (fingerprint) => {
                                return (
                                    fingerprint.algorithm === 'sha-256' ||
                                    fingerprint.algorithm === 'sha-384' ||
                                    fingerprint.algorithm === 'sha-512'
                                );
                            },
                        );
                        // Start the RTCDtlsTransport.
                        this._dtlsTransport.start(this._remoteDtlsParameters);
                        this._transportReady = true;
                    }
                }
                exports.Edge11 = Edge11;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../utils': 42,
                './HandlerInterface': 26,
                './ortc/edgeUtils': 31,
            },
        ],
        24: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Firefox120 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const errors_1 = require('../errors');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpUnifiedPlanUtils = __importStar(require('./sdp/unifiedPlanUtils'));
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const scalabilityModes_1 = require('../scalabilityModes');
                const logger = new Logger_1.Logger('Firefox120');
                const SCTP_NUM_STREAMS = { OS: 16, MIS: 2048 };
                class Firefox120 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Firefox120();
                    }
                    constructor() {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Map of RTCTransceivers indexed by MID.
                        this._mapMidTransceiver = new Map();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Firefox120';
                    }
                    close() {
                        logger.debug('close()');
                        if (this._closed) {
                            return;
                        }
                        this._closed = true;
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                        });
                        // NOTE: We need to add a real video track to get the RID extension mapping,
                        // otherwiser Firefox doesn't include it in the SDP.
                        const canvas = document.createElement('canvas');
                        // NOTE: Otherwise Firefox fails in next line.
                        canvas.getContext('2d');
                        const fakeStream = canvas.captureStream();
                        const fakeVideoTrack = fakeStream.getVideoTracks()[0];
                        try {
                            pc.addTransceiver('audio', { direction: 'sendrecv' });
                            pc.addTransceiver(fakeVideoTrack, {
                                direction: 'sendrecv',
                                sendEncodings: [
                                    { rid: 'r0', maxBitrate: 100000 },
                                    { rid: 'r1', maxBitrate: 500000 },
                                ],
                            });
                            const offer = await pc.createOffer();
                            try {
                                canvas.remove();
                            } catch (error) {}
                            try {
                                fakeVideoTrack.stop();
                            } catch (error) {}
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                canvas.remove();
                            } catch (error2) {}
                            try {
                                fakeVideoTrack.stop();
                            } catch (error2) {}
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        this.assertNotClosed();
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async updateIceServers(iceServers) {
                        this.assertNotClosed();
                        // NOTE: Firefox does not implement pc.setConfiguration().
                        throw new errors_1.UnsupportedError('not supported');
                    }
                    async restartIce(iceParameters) {
                        this.assertNotClosed();
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        this.assertNotClosed();
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (encodings && encodings.length > 1) {
                            encodings.forEach((encoding, idx) => {
                                encoding.rid = `r${idx}`;
                            });
                        }
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        // This may throw.
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        // This may throw.
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
                        // NOTE: Firefox fails sometimes to properly anticipate the closed media
                        // section that it should use, so don't reuse closed media sections.
                        //   https://github.com/versatica/mediasoup-client/issues/104
                        //
                        // const mediaSectionIdx = this._remoteSdp!.getNextMediaSectionIdx();
                        const transceiver = this._pc.addTransceiver(track, {
                            direction: 'sendonly',
                            streams: [this._sendStream],
                            sendEncodings: encodings,
                        });
                        const offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        // In Firefox use DTLS role client even if we are the "offerer" since
                        // Firefox does not respect ICE-Lite.
                        if (!this._transportReady) {
                            await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
                        }
                        const layers = (0, scalabilityModes_1.parse)((encodings || [{}])[0].scalabilityMode);
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        // We can now get the transceiver.mid.
                        const localId = transceiver.mid;
                        // Set MID.
                        sendingRtpParameters.mid = localId;
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        const offerMediaObject = localSdpObject.media[localSdpObject.media.length - 1];
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings by parsing the SDP offer if no encodings are given.
                        if (!encodings) {
                            sendingRtpParameters.encodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                        }
                        // Set RTP encodings by parsing the SDP offer and complete them with given
                        // one if just a single encoding has been given.
                        else if (encodings.length === 1) {
                            const newEncodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                            Object.assign(newEncodings[0], encodings[0]);
                            sendingRtpParameters.encodings = newEncodings;
                        }
                        // Otherwise if more than 1 encoding are given use them verbatim.
                        else {
                            sendingRtpParameters.encodings = encodings;
                        }
                        // If VP8 or H264 and there is effective simulcast, add scalabilityMode to
                        // each encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            (sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
                                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                if (encoding.scalabilityMode) {
                                    encoding.scalabilityMode = `L1T${layers.temporalLayers}`;
                                } else {
                                    encoding.scalabilityMode = 'L1T3';
                                }
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                            extmapAllowMixed: true,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        // Store in the map.
                        this._mapMidTransceiver.set(localId, transceiver);
                        return {
                            localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender: transceiver.sender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        logger.debug('stopSending() [localId:%s]', localId);
                        if (this._closed) {
                            return;
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated transceiver not found');
                        }
                        transceiver.sender.replaceTrack(null);
                        // NOTE: Cannot use stop() the transceiver due to the the note above in
                        // send() method.
                        // try
                        // {
                        // 	transceiver.stop();
                        // }
                        // catch (error)
                        // {}
                        this._pc.removeTrack(transceiver.sender);
                        // NOTE: Cannot use closeMediaSection() due to the the note above in send()
                        // method.
                        // this._remoteSdp!.closeMediaSection(transceiver.mid);
                        this._remoteSdp.disableMediaSection(transceiver.mid);
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        this._mapMidTransceiver.delete(localId);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('pauseSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'inactive';
                        this._remoteSdp.pauseMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('pauseSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('resumeSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'sendonly';
                        this._remoteSdp.resumeSendingMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('resumeSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async replaceTrack(localId, track) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        await transceiver.sender.replaceTrack(track);
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated transceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setMaxSpatialLayer() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('setMaxSpatialLayer() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setRtpEncodingParameters() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug(
                            'setRtpEncodingParameters() | calling pc.setRemoteDescription() [answer:%o]',
                            answer,
                        );
                        await this._pc.setRemoteDescription(answer);
                    }
                    async getSenderStats(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.sender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        optionsList,
                    ) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const results = [];
                        const mapLocalId = new Map();
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const localId = rtpParameters.mid || String(this._mapMidTransceiver.size);
                            mapLocalId.set(trackId, localId);
                            this._remoteSdp.receive({
                                mid: localId,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { trackId, rtpParameters } = options;
                            const localId = mapLocalId.get(trackId);
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === localId);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                            answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        if (!this._transportReady) {
                            await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { trackId } = options;
                            const localId = mapLocalId.get(trackId);
                            const transceiver = this._pc.getTransceivers().find((t) => t.mid === localId);
                            if (!transceiver) {
                                throw new Error('new RTCRtpTransceiver not found');
                            }
                            // Store in the map.
                            this._mapMidTransceiver.set(localId, transceiver);
                            results.push({
                                localId,
                                track: transceiver.receiver.track,
                                rtpReceiver: transceiver.receiver,
                            });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        if (this._closed) {
                            return;
                        }
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            this._remoteSdp.closeMediaSection(transceiver.mid);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const localId of localIds) {
                            this._mapMidTransceiver.delete(localId);
                        }
                    }
                    async pauseReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('pauseReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'inactive';
                            this._remoteSdp.pauseMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('pauseReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async resumeReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('resumeReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'recvonly';
                            this._remoteSdp.resumeReceivingMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('resumeReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async getReceiverStats(localId) {
                        this.assertRecvDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.receiver.getStats();
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation();
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertNotClosed() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('method called in a closed handler');
                        }
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Firefox120 = Firefox120;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../scalabilityModes': 40,
                '../utils': 42,
                './HandlerInterface': 26,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/unifiedPlanUtils': 37,
                'sdp-transform': 46,
            },
        ],
        25: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Firefox60 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const errors_1 = require('../errors');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpUnifiedPlanUtils = __importStar(require('./sdp/unifiedPlanUtils'));
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const scalabilityModes_1 = require('../scalabilityModes');
                const logger = new Logger_1.Logger('Firefox60');
                const SCTP_NUM_STREAMS = { OS: 16, MIS: 2048 };
                class Firefox60 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Firefox60();
                    }
                    constructor() {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Map of RTCTransceivers indexed by MID.
                        this._mapMidTransceiver = new Map();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Firefox60';
                    }
                    close() {
                        logger.debug('close()');
                        if (this._closed) {
                            return;
                        }
                        this._closed = true;
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                        });
                        // NOTE: We need to add a real video track to get the RID extension mapping.
                        const canvas = document.createElement('canvas');
                        // NOTE: Otherwise Firefox fails in next line.
                        canvas.getContext('2d');
                        const fakeStream = canvas.captureStream();
                        const fakeVideoTrack = fakeStream.getVideoTracks()[0];
                        try {
                            pc.addTransceiver('audio', { direction: 'sendrecv' });
                            const videoTransceiver = pc.addTransceiver(fakeVideoTrack, {
                                direction: 'sendrecv',
                            });
                            const parameters = videoTransceiver.sender.getParameters();
                            const encodings = [
                                { rid: 'r0', maxBitrate: 100000 },
                                { rid: 'r1', maxBitrate: 500000 },
                            ];
                            parameters.encodings = encodings;
                            await videoTransceiver.sender.setParameters(parameters);
                            const offer = await pc.createOffer();
                            try {
                                canvas.remove();
                            } catch (error) {}
                            try {
                                fakeVideoTrack.stop();
                            } catch (error) {}
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                canvas.remove();
                            } catch (error2) {}
                            try {
                                fakeVideoTrack.stop();
                            } catch (error2) {}
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        this.assertNotClosed();
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async updateIceServers(iceServers) {
                        this.assertNotClosed();
                        // NOTE: Firefox does not implement pc.setConfiguration().
                        throw new errors_1.UnsupportedError('not supported');
                    }
                    async restartIce(iceParameters) {
                        this.assertNotClosed();
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        this.assertNotClosed();
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (encodings) {
                            encodings = utils.clone(encodings);
                            if (encodings.length > 1) {
                                encodings.forEach((encoding, idx) => {
                                    encoding.rid = `r${idx}`;
                                });
                                // Clone the encodings and reverse them because Firefox likes them
                                // from high to low.
                                encodings.reverse();
                            }
                        }
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        // This may throw.
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        // This may throw.
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
                        // NOTE: Firefox fails sometimes to properly anticipate the closed media
                        // section that it should use, so don't reuse closed media sections.
                        //   https://github.com/versatica/mediasoup-client/issues/104
                        //
                        // const mediaSectionIdx = this._remoteSdp!.getNextMediaSectionIdx();
                        const transceiver = this._pc.addTransceiver(track, {
                            direction: 'sendonly',
                            streams: [this._sendStream],
                        });
                        // NOTE: This is not spec compliants. Encodings should be given in addTransceiver
                        // second argument, but Firefox does not support it.
                        if (encodings) {
                            const parameters = transceiver.sender.getParameters();
                            parameters.encodings = encodings;
                            await transceiver.sender.setParameters(parameters);
                        }
                        const offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        // In Firefox use DTLS role client even if we are the "offerer" since
                        // Firefox does not respect ICE-Lite.
                        if (!this._transportReady) {
                            await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
                        }
                        const layers = (0, scalabilityModes_1.parse)((encodings || [{}])[0].scalabilityMode);
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        // We can now get the transceiver.mid.
                        const localId = transceiver.mid;
                        // Set MID.
                        sendingRtpParameters.mid = localId;
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        const offerMediaObject = localSdpObject.media[localSdpObject.media.length - 1];
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings by parsing the SDP offer if no encodings are given.
                        if (!encodings) {
                            sendingRtpParameters.encodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                        }
                        // Set RTP encodings by parsing the SDP offer and complete them with given
                        // one if just a single encoding has been given.
                        else if (encodings.length === 1) {
                            const newEncodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                            Object.assign(newEncodings[0], encodings[0]);
                            sendingRtpParameters.encodings = newEncodings;
                        }
                        // Otherwise if more than 1 encoding are given use them verbatim (but
                        // reverse them back since we reversed them above to satisfy Firefox).
                        else {
                            sendingRtpParameters.encodings = encodings.reverse();
                        }
                        // If VP8 or H264 and there is effective simulcast, add scalabilityMode to
                        // each encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            (sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
                                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                if (encoding.scalabilityMode) {
                                    encoding.scalabilityMode = `L1T${layers.temporalLayers}`;
                                } else {
                                    encoding.scalabilityMode = 'L1T3';
                                }
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                            extmapAllowMixed: true,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        // Store in the map.
                        this._mapMidTransceiver.set(localId, transceiver);
                        return {
                            localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender: transceiver.sender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        logger.debug('stopSending() [localId:%s]', localId);
                        if (this._closed) {
                            return;
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated transceiver not found');
                        }
                        transceiver.sender.replaceTrack(null);
                        // NOTE: Cannot use stop() the transceiver due to the the note above in
                        // send() method.
                        // try
                        // {
                        // 	transceiver.stop();
                        // }
                        // catch (error)
                        // {}
                        this._pc.removeTrack(transceiver.sender);
                        // NOTE: Cannot use closeMediaSection() due to the the note above in send()
                        // method.
                        // this._remoteSdp!.closeMediaSection(transceiver.mid);
                        this._remoteSdp.disableMediaSection(transceiver.mid);
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        this._mapMidTransceiver.delete(localId);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('pauseSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'inactive';
                        this._remoteSdp.pauseMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('pauseSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('resumeSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'sendonly';
                        this._remoteSdp.resumeSendingMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('resumeSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async replaceTrack(localId, track) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        await transceiver.sender.replaceTrack(track);
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated transceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        // NOTE: We require encodings given from low to high, however Firefox
                        // requires them in reverse order, so do magic here.
                        spatialLayer = parameters.encodings.length - 1 - spatialLayer;
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx >= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setMaxSpatialLayer() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('setMaxSpatialLayer() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setRtpEncodingParameters() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug(
                            'setRtpEncodingParameters() | calling pc.setRemoteDescription() [answer:%o]',
                            answer,
                        );
                        await this._pc.setRemoteDescription(answer);
                    }
                    async getSenderStats(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.sender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        optionsList,
                    ) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const results = [];
                        const mapLocalId = new Map();
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const localId = rtpParameters.mid || String(this._mapMidTransceiver.size);
                            mapLocalId.set(trackId, localId);
                            this._remoteSdp.receive({
                                mid: localId,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { trackId, rtpParameters } = options;
                            const localId = mapLocalId.get(trackId);
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === localId);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                            answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        if (!this._transportReady) {
                            await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { trackId } = options;
                            const localId = mapLocalId.get(trackId);
                            const transceiver = this._pc.getTransceivers().find((t) => t.mid === localId);
                            if (!transceiver) {
                                throw new Error('new RTCRtpTransceiver not found');
                            }
                            // Store in the map.
                            this._mapMidTransceiver.set(localId, transceiver);
                            results.push({
                                localId,
                                track: transceiver.receiver.track,
                                rtpReceiver: transceiver.receiver,
                            });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        if (this._closed) {
                            return;
                        }
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            this._remoteSdp.closeMediaSection(transceiver.mid);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const localId of localIds) {
                            this._mapMidTransceiver.delete(localId);
                        }
                    }
                    async pauseReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('pauseReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'inactive';
                            this._remoteSdp.pauseMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('pauseReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async resumeReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('resumeReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'recvonly';
                            this._remoteSdp.resumeReceivingMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('resumeReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async getReceiverStats(localId) {
                        this.assertRecvDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.receiver.getStats();
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation();
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({ localDtlsRole: 'client', localSdpObject });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertNotClosed() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('method called in a closed handler');
                        }
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Firefox60 = Firefox60;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../scalabilityModes': 40,
                '../utils': 42,
                './HandlerInterface': 26,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/unifiedPlanUtils': 37,
                'sdp-transform': 46,
            },
        ],
        26: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.HandlerInterface = void 0;
                const EnhancedEventEmitter_1 = require('../EnhancedEventEmitter');
                class HandlerInterface extends EnhancedEventEmitter_1.EnhancedEventEmitter {
                    constructor() {
                        super();
                    }
                }
                exports.HandlerInterface = HandlerInterface;
            },
            { '../EnhancedEventEmitter': 11 },
        ],
        27: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.ReactNative = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const errors_1 = require('../errors');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpPlanBUtils = __importStar(require('./sdp/planBUtils'));
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const logger = new Logger_1.Logger('ReactNative');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class ReactNative extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new ReactNative();
                    }
                    constructor() {
                        super();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Map of sending MediaStreamTracks indexed by localId.
                        this._mapSendLocalIdTrack = new Map();
                        // Next sending localId.
                        this._nextSendLocalId = 0;
                        // Map of MID, RTP parameters and RTCRtpReceiver indexed by local id.
                        // Value is an Object with mid, rtpParameters and rtpReceiver.
                        this._mapRecvLocalIdInfo = new Map();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'ReactNative';
                    }
                    close() {
                        logger.debug('close()');
                        // Free/dispose native MediaStream but DO NOT free/dispose native
                        // MediaStreamTracks (that is parent's business).
                        // @ts-ignore (proprietary API in react-native-webrtc).
                        this._sendStream.release(/* releaseTracks */ false);
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                            sdpSemantics: 'plan-b',
                        });
                        try {
                            const offer = await pc.createOffer({
                                offerToReceiveAudio: true,
                                offerToReceiveVideo: true,
                            });
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                            planB: true,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                sdpSemantics: 'plan-b',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (codec) {
                            logger.warn('send() | codec selection is not available in %s handler', this.name);
                        }
                        this._sendStream.addTrack(track);
                        this._pc.addStream(this._sendStream);
                        let offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        let offerMediaObject;
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs);
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        if (track.kind === 'video' && encodings && encodings.length > 1) {
                            logger.debug('send() | enabling simulcast');
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media.find((m) => m.type === 'video');
                            sdpPlanBUtils.addLegacySimulcast({
                                offerMediaObject,
                                track,
                                numStreams: encodings.length,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        offerMediaObject = localSdpObject.media.find((m) => m.type === track.kind);
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings.
                        sendingRtpParameters.encodings = sdpPlanBUtils.getRtpEncodings({
                            offerMediaObject,
                            track,
                        });
                        // Complete encodings with given values.
                        if (encodings) {
                            for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx) {
                                if (encodings[idx]) {
                                    Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
                                }
                            }
                        }
                        // If VP8 or H264 and there is effective simulcast, add scalabilityMode to
                        // each encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            (sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
                                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                encoding.scalabilityMode = 'L1T3';
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        const localId = String(this._nextSendLocalId);
                        this._nextSendLocalId++;
                        // Insert into the map.
                        this._mapSendLocalIdTrack.set(localId, track);
                        return {
                            localId: localId,
                            rtpParameters: sendingRtpParameters,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        logger.debug('stopSending() [localId:%s]', localId);
                        const track = this._mapSendLocalIdTrack.get(localId);
                        if (!track) {
                            throw new Error('track not found');
                        }
                        this._mapSendLocalIdTrack.delete(localId);
                        this._sendStream.removeTrack(track);
                        this._pc.addStream(this._sendStream);
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        try {
                            await this._pc.setLocalDescription(offer);
                        } catch (error) {
                            // NOTE: If there are no sending tracks, setLocalDescription() will fail with
                            // "Failed to create channels". If so, ignore it.
                            if (this._sendStream.getTracks().length === 0) {
                                logger.warn(
                                    'stopSending() | ignoring expected error due no sending tracks: %s',
                                    error.toString(),
                                );
                                return;
                            }
                            throw error;
                        }
                        if (this._pc.signalingState === 'stable') {
                            return;
                        }
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        // Unimplemented.
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        // Unimplemented.
                    }
                    async replaceTrack(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localId,
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        track,
                    ) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    async setMaxSpatialLayer(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localId,
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        spatialLayer,
                    ) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async setRtpEncodingParameters(localId, params) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async getSenderStats(localId) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmitTime: maxPacketLifeTime, // NOTE: Old spec.
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertRecvDirection();
                        const results = [];
                        const mapStreamId = new Map();
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const mid = kind;
                            let streamId = options.streamId || rtpParameters.rtcp.cname;
                            // NOTE: In React-Native we cannot reuse the same remote MediaStream for new
                            // remote tracks. This is because react-native-webrtc does not react on new
                            // tracks generated within already existing streams, so force the streamId
                            // to be different. See:
                            // https://github.com/react-native-webrtc/react-native-webrtc/issues/401
                            logger.debug(
                                'receive() | forcing a random remote streamId to avoid well known bug in react-native-webrtc',
                            );
                            streamId += `-hack-${utils.generateRandomNumber()}`;
                            mapStreamId.set(trackId, streamId);
                            this._remoteSdp.receive({
                                mid,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { kind, rtpParameters } = options;
                            const mid = kind;
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === mid);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { kind, trackId, rtpParameters } = options;
                            const localId = trackId;
                            const mid = kind;
                            const streamId = mapStreamId.get(trackId);
                            const stream = this._pc.getRemoteStreams().find((s) => s.id === streamId);
                            const track = stream.getTrackById(localId);
                            if (!track) {
                                throw new Error('remote track not found');
                            }
                            // Insert into the map.
                            this._mapRecvLocalIdInfo.set(localId, { mid, rtpParameters });
                            results.push({ localId, track });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const { mid, rtpParameters } = this._mapRecvLocalIdInfo.get(localId) || {};
                            // Remove from the map.
                            this._mapRecvLocalIdInfo.delete(localId);
                            this._remoteSdp.planBStopReceiving({
                                mid: mid,
                                offerRtpParameters: rtpParameters,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async pauseReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async resumeReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async getReceiverStats(localId) {
                        throw new errors_1.UnsupportedError('not implemented');
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmitTime: maxPacketLifeTime, // NOTE: Old spec.
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation({ oldDataChannelSpec: true });
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.ReactNative = ReactNative;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../utils': 42,
                './HandlerInterface': 26,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/planBUtils': 36,
                'sdp-transform': 46,
            },
        ],
        28: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.ReactNativeUnifiedPlan = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpUnifiedPlanUtils = __importStar(require('./sdp/unifiedPlanUtils'));
                const ortcUtils = __importStar(require('./ortc/utils'));
                const errors_1 = require('../errors');
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const scalabilityModes_1 = require('../scalabilityModes');
                const logger = new Logger_1.Logger('ReactNativeUnifiedPlan');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class ReactNativeUnifiedPlan extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new ReactNativeUnifiedPlan();
                    }
                    constructor() {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Map of RTCTransceivers indexed by MID.
                        this._mapMidTransceiver = new Map();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'ReactNativeUnifiedPlan';
                    }
                    close() {
                        logger.debug('close()');
                        if (this._closed) {
                            return;
                        }
                        this._closed = true;
                        // Free/dispose native MediaStream but DO NOT free/dispose native
                        // MediaStreamTracks (that is parent's business).
                        // @ts-ignore (proprietary API in react-native-webrtc).
                        this._sendStream.release(/* releaseTracks */ false);
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                            sdpSemantics: 'unified-plan',
                        });
                        try {
                            pc.addTransceiver('audio');
                            pc.addTransceiver('video');
                            const offer = await pc.createOffer();
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            // libwebrtc supports NACK for OPUS but doesn't announce it.
                            ortcUtils.addNackSuppportForOpus(nativeRtpCapabilities);
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        this.assertNotClosed();
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                sdpSemantics: 'unified-plan',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        this.assertNotClosed();
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        this.assertNotClosed();
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        this.assertNotClosed();
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (encodings && encodings.length > 1) {
                            encodings.forEach((encoding, idx) => {
                                encoding.rid = `r${idx}`;
                            });
                        }
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        // This may throw.
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        // This may throw.
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
                        const mediaSectionIdx = this._remoteSdp.getNextMediaSectionIdx();
                        const transceiver = this._pc.addTransceiver(track, {
                            direction: 'sendonly',
                            streams: [this._sendStream],
                            sendEncodings: encodings,
                        });
                        let offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        let offerMediaObject;
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        // Special case for VP9 with SVC.
                        let hackVp9Svc = false;
                        const layers = (0, scalabilityModes_1.parse)((encodings || [{}])[0].scalabilityMode);
                        if (
                            encodings &&
                            encodings.length === 1 &&
                            layers.spatialLayers > 1 &&
                            sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp9'
                        ) {
                            logger.debug('send() | enabling legacy simulcast for VP9 SVC');
                            hackVp9Svc = true;
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                            sdpUnifiedPlanUtils.addLegacySimulcast({
                                offerMediaObject,
                                numStreams: layers.spatialLayers,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        // We can now get the transceiver.mid.
                        // NOTE: We cannot read generated MID on iOS react-native-webrtc 111.0.0
                        // because transceiver.mid is not available until setRemoteDescription()
                        // is called, so this is best effort.
                        // Issue: https://github.com/react-native-webrtc/react-native-webrtc/issues/1404
                        // NOTE: So let's fill MID in sendingRtpParameters later.
                        // NOTE: This is fixed in react-native-webrtc 111.0.3.
                        let localId = transceiver.mid ?? undefined;
                        if (!localId) {
                            logger.warn(
                                'send() | missing transceiver.mid (bug in react-native-webrtc, using a workaround',
                            );
                        }
                        // Set MID.
                        // NOTE: As per above, it could be unset yet.
                        sendingRtpParameters.mid = localId;
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings by parsing the SDP offer if no encodings are given.
                        if (!encodings) {
                            sendingRtpParameters.encodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                        }
                        // Set RTP encodings by parsing the SDP offer and complete them with given
                        // one if just a single encoding has been given.
                        else if (encodings.length === 1) {
                            let newEncodings = sdpUnifiedPlanUtils.getRtpEncodings({
                                offerMediaObject,
                            });
                            Object.assign(newEncodings[0], encodings[0]);
                            // Hack for VP9 SVC.
                            if (hackVp9Svc) {
                                newEncodings = [newEncodings[0]];
                            }
                            sendingRtpParameters.encodings = newEncodings;
                        }
                        // Otherwise if more than 1 encoding are given use them verbatim.
                        else {
                            sendingRtpParameters.encodings = encodings;
                        }
                        // If VP8 or H264 and there is effective simulcast, add scalabilityMode to
                        // each encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            (sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
                                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                if (encoding.scalabilityMode) {
                                    encoding.scalabilityMode = `L1T${layers.temporalLayers}`;
                                } else {
                                    encoding.scalabilityMode = 'L1T3';
                                }
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            reuseMid: mediaSectionIdx.reuseMid,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                            extmapAllowMixed: true,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        // Follow up of iOS react-native-webrtc 111.0.0 issue told above. Now yes,
                        // we can read generated MID (if not done above) and fill sendingRtpParameters.
                        // NOTE: This is fixed in react-native-webrtc 111.0.3 so this block isn't
                        // needed starting from that version.
                        if (!localId) {
                            localId = transceiver.mid;
                            sendingRtpParameters.mid = localId;
                        }
                        // Store in the map.
                        this._mapMidTransceiver.set(localId, transceiver);
                        return {
                            localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender: transceiver.sender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        if (this._closed) {
                            return;
                        }
                        logger.debug('stopSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.sender.replaceTrack(null);
                        this._pc.removeTrack(transceiver.sender);
                        const mediaSectionClosed = this._remoteSdp.closeMediaSection(transceiver.mid);
                        if (mediaSectionClosed) {
                            try {
                                transceiver.stop();
                            } catch (error) {}
                        }
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        this._mapMidTransceiver.delete(localId);
                    }
                    async pauseSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('pauseSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'inactive';
                        this._remoteSdp.pauseMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('pauseSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async resumeSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('resumeSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        this._remoteSdp.resumeSendingMediaSection(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'sendonly';
                        const offer = await this._pc.createOffer();
                        logger.debug('resumeSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async replaceTrack(localId, track) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        await transceiver.sender.replaceTrack(track);
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setMaxSpatialLayer() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('setMaxSpatialLayer() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setRtpEncodingParameters() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug(
                            'setRtpEncodingParameters() | calling pc.setRemoteDescription() [answer:%o]',
                            answer,
                        );
                        await this._pc.setRemoteDescription(answer);
                    }
                    async getSenderStats(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.sender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const results = [];
                        const mapLocalId = new Map();
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const localId = rtpParameters.mid || String(this._mapMidTransceiver.size);
                            mapLocalId.set(trackId, localId);
                            this._remoteSdp.receive({
                                mid: localId,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { trackId, rtpParameters } = options;
                            const localId = mapLocalId.get(trackId);
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === localId);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { trackId } = options;
                            const localId = mapLocalId.get(trackId);
                            const transceiver = this._pc.getTransceivers().find((t) => t.mid === localId);
                            if (!transceiver) {
                                throw new Error('new RTCRtpTransceiver not found');
                            } else {
                                // Store in the map.
                                this._mapMidTransceiver.set(localId, transceiver);
                                results.push({
                                    localId,
                                    track: transceiver.receiver.track,
                                    rtpReceiver: transceiver.receiver,
                                });
                            }
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        if (this._closed) {
                            return;
                        }
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            this._remoteSdp.closeMediaSection(transceiver.mid);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const localId of localIds) {
                            this._mapMidTransceiver.delete(localId);
                        }
                    }
                    async pauseReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('pauseReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'inactive';
                            this._remoteSdp.pauseMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('pauseReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async resumeReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('resumeReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'recvonly';
                            this._remoteSdp.resumeReceivingMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('resumeReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async getReceiverStats(localId) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.receiver.getStats();
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation();
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertNotClosed() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('method called in a closed handler');
                        }
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.ReactNativeUnifiedPlan = ReactNativeUnifiedPlan;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../scalabilityModes': 40,
                '../utils': 42,
                './HandlerInterface': 26,
                './ortc/utils': 32,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/unifiedPlanUtils': 37,
                'sdp-transform': 46,
            },
        ],
        29: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Safari11 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpPlanBUtils = __importStar(require('./sdp/planBUtils'));
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const logger = new Logger_1.Logger('Safari11');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class Safari11 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Safari11();
                    }
                    constructor() {
                        super();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Map of RTCRtpSender indexed by localId.
                        this._mapSendLocalIdRtpSender = new Map();
                        // Next sending localId.
                        this._nextSendLocalId = 0;
                        // Map of MID, RTP parameters and RTCRtpReceiver indexed by local id.
                        // Value is an Object with mid, rtpParameters and rtpReceiver.
                        this._mapRecvLocalIdInfo = new Map();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Safari11';
                    }
                    close() {
                        logger.debug('close()');
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                            sdpSemantics: 'plan-b',
                        });
                        try {
                            const offer = await pc.createOffer({
                                offerToReceiveAudio: true,
                                offerToReceiveVideo: true,
                            });
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                            planB: true,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        if (codec) {
                            logger.warn('send() | codec selection is not available in %s handler', this.name);
                        }
                        this._sendStream.addTrack(track);
                        this._pc.addTrack(track, this._sendStream);
                        let offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        let offerMediaObject;
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs);
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        if (track.kind === 'video' && encodings && encodings.length > 1) {
                            logger.debug('send() | enabling simulcast');
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media.find((m) => m.type === 'video');
                            sdpPlanBUtils.addLegacySimulcast({
                                offerMediaObject,
                                track,
                                numStreams: encodings.length,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        offerMediaObject = localSdpObject.media.find((m) => m.type === track.kind);
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings.
                        sendingRtpParameters.encodings = sdpPlanBUtils.getRtpEncodings({
                            offerMediaObject,
                            track,
                        });
                        // Complete encodings with given values.
                        if (encodings) {
                            for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx) {
                                if (encodings[idx]) {
                                    Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
                                }
                            }
                        }
                        // If VP8 and there is effective simulcast, add scalabilityMode to each
                        // encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8'
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                encoding.scalabilityMode = 'L1T3';
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        const localId = String(this._nextSendLocalId);
                        this._nextSendLocalId++;
                        const rtpSender = this._pc.getSenders().find((s) => s.track === track);
                        // Insert into the map.
                        this._mapSendLocalIdRtpSender.set(localId, rtpSender);
                        return {
                            localId: localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        if (rtpSender.track) {
                            this._sendStream.removeTrack(rtpSender.track);
                        }
                        this._mapSendLocalIdRtpSender.delete(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        try {
                            await this._pc.setLocalDescription(offer);
                        } catch (error) {
                            // NOTE: If there are no sending tracks, setLocalDescription() will fail with
                            // "Failed to create channels". If so, ignore it.
                            if (this._sendStream.getTracks().length === 0) {
                                logger.warn(
                                    'stopSending() | ignoring expected error due no sending tracks: %s',
                                    error.toString(),
                                );
                                return;
                            }
                            throw error;
                        }
                        if (this._pc.signalingState === 'stable') {
                            return;
                        }
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        // Unimplemented.
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        // Unimplemented.
                    }
                    async replaceTrack(localId, track) {
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        const oldTrack = rtpSender.track;
                        await rtpSender.replaceTrack(track);
                        // Remove the old track from the local stream.
                        if (oldTrack) {
                            this._sendStream.removeTrack(oldTrack);
                        }
                        // Add the new track to the local stream.
                        if (track) {
                            this._sendStream.addTrack(track);
                        }
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        const parameters = rtpSender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await rtpSender.setParameters(parameters);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        const parameters = rtpSender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await rtpSender.setParameters(parameters);
                    }
                    async getSenderStats(localId) {
                        this.assertSendDirection();
                        const rtpSender = this._mapSendLocalIdRtpSender.get(localId);
                        if (!rtpSender) {
                            throw new Error('associated RTCRtpSender not found');
                        }
                        return rtpSender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertRecvDirection();
                        const results = [];
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const mid = kind;
                            this._remoteSdp.receive({
                                mid,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { kind, rtpParameters } = options;
                            const mid = kind;
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === mid);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { kind, trackId, rtpParameters } = options;
                            const mid = kind;
                            const localId = trackId;
                            const rtpReceiver = this._pc.getReceivers().find((r) => r.track && r.track.id === localId);
                            if (!rtpReceiver) {
                                throw new Error('new RTCRtpReceiver not');
                            }
                            // Insert into the map.
                            this._mapRecvLocalIdInfo.set(localId, {
                                mid,
                                rtpParameters,
                                rtpReceiver,
                            });
                            results.push({
                                localId,
                                track: rtpReceiver.track,
                                rtpReceiver,
                            });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const { mid, rtpParameters } = this._mapRecvLocalIdInfo.get(localId) || {};
                            // Remove from the map.
                            this._mapRecvLocalIdInfo.delete(localId);
                            this._remoteSdp.planBStopReceiving({
                                mid: mid,
                                offerRtpParameters: rtpParameters,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async getReceiverStats(localId) {
                        this.assertRecvDirection();
                        const { rtpReceiver } = this._mapRecvLocalIdInfo.get(localId) || {};
                        if (!rtpReceiver) {
                            throw new Error('associated RTCRtpReceiver not found');
                        }
                        return rtpReceiver.getStats();
                    }
                    async pauseReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async resumeReceiving(
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        localIds,
                    ) {
                        // Unimplemented.
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation({ oldDataChannelSpec: true });
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Safari11 = Safari11;
            },
            {
                '../Logger': 12,
                '../ortc': 39,
                '../utils': 42,
                './HandlerInterface': 26,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/planBUtils': 36,
                'sdp-transform': 46,
            },
        ],
        30: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.Safari12 = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../Logger');
                const utils = __importStar(require('../utils'));
                const ortc = __importStar(require('../ortc'));
                const sdpCommonUtils = __importStar(require('./sdp/commonUtils'));
                const sdpUnifiedPlanUtils = __importStar(require('./sdp/unifiedPlanUtils'));
                const ortcUtils = __importStar(require('./ortc/utils'));
                const errors_1 = require('../errors');
                const HandlerInterface_1 = require('./HandlerInterface');
                const RemoteSdp_1 = require('./sdp/RemoteSdp');
                const scalabilityModes_1 = require('../scalabilityModes');
                const logger = new Logger_1.Logger('Safari12');
                const SCTP_NUM_STREAMS = { OS: 1024, MIS: 1024 };
                class Safari12 extends HandlerInterface_1.HandlerInterface {
                    /**
                     * Creates a factory function.
                     */
                    static createFactory() {
                        return () => new Safari12();
                    }
                    constructor() {
                        super();
                        // Closed flag.
                        this._closed = false;
                        // Map of RTCTransceivers indexed by MID.
                        this._mapMidTransceiver = new Map();
                        // Local stream for sending.
                        this._sendStream = new MediaStream();
                        // Whether a DataChannel m=application section has been created.
                        this._hasDataChannelMediaSection = false;
                        // Sending DataChannel id value counter. Incremented for each new DataChannel.
                        this._nextSendSctpStreamId = 0;
                        // Got transport local and remote parameters.
                        this._transportReady = false;
                    }
                    get name() {
                        return 'Safari12';
                    }
                    close() {
                        logger.debug('close()');
                        if (this._closed) {
                            return;
                        }
                        this._closed = true;
                        // Close RTCPeerConnection.
                        if (this._pc) {
                            try {
                                this._pc.close();
                            } catch (error) {}
                        }
                        this.emit('@close');
                    }
                    async getNativeRtpCapabilities() {
                        logger.debug('getNativeRtpCapabilities()');
                        const pc = new RTCPeerConnection({
                            iceServers: [],
                            iceTransportPolicy: 'all',
                            bundlePolicy: 'max-bundle',
                            rtcpMuxPolicy: 'require',
                        });
                        try {
                            pc.addTransceiver('audio');
                            pc.addTransceiver('video');
                            const offer = await pc.createOffer();
                            try {
                                pc.close();
                            } catch (error) {}
                            const sdpObject = sdpTransform.parse(offer.sdp);
                            const nativeRtpCapabilities = sdpCommonUtils.extractRtpCapabilities({
                                sdpObject,
                            });
                            // libwebrtc supports NACK for OPUS but doesn't announce it.
                            ortcUtils.addNackSuppportForOpus(nativeRtpCapabilities);
                            return nativeRtpCapabilities;
                        } catch (error) {
                            try {
                                pc.close();
                            } catch (error2) {}
                            throw error;
                        }
                    }
                    async getNativeSctpCapabilities() {
                        logger.debug('getNativeSctpCapabilities()');
                        return {
                            numStreams: SCTP_NUM_STREAMS,
                        };
                    }
                    run({
                        direction,
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        iceServers,
                        iceTransportPolicy,
                        additionalSettings,
                        proprietaryConstraints,
                        extendedRtpCapabilities,
                    }) {
                        this.assertNotClosed();
                        logger.debug('run()');
                        this._direction = direction;
                        this._remoteSdp = new RemoteSdp_1.RemoteSdp({
                            iceParameters,
                            iceCandidates,
                            dtlsParameters,
                            sctpParameters,
                        });
                        this._sendingRtpParametersByKind = {
                            audio: ortc.getSendingRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRtpParameters('video', extendedRtpCapabilities),
                        };
                        this._sendingRemoteRtpParametersByKind = {
                            audio: ortc.getSendingRemoteRtpParameters('audio', extendedRtpCapabilities),
                            video: ortc.getSendingRemoteRtpParameters('video', extendedRtpCapabilities),
                        };
                        if (dtlsParameters.role && dtlsParameters.role !== 'auto') {
                            this._forcedLocalDtlsRole = dtlsParameters.role === 'server' ? 'client' : 'server';
                        }
                        this._pc = new RTCPeerConnection(
                            {
                                iceServers: iceServers || [],
                                iceTransportPolicy: iceTransportPolicy || 'all',
                                bundlePolicy: 'max-bundle',
                                rtcpMuxPolicy: 'require',
                                ...additionalSettings,
                            },
                            proprietaryConstraints,
                        );
                        this._pc.addEventListener('icegatheringstatechange', () => {
                            this.emit('@icegatheringstatechange', this._pc.iceGatheringState);
                        });
                        if (this._pc.connectionState) {
                            this._pc.addEventListener('connectionstatechange', () => {
                                this.emit('@connectionstatechange', this._pc.connectionState);
                            });
                        } else {
                            this._pc.addEventListener('iceconnectionstatechange', () => {
                                logger.warn('run() | pc.connectionState not supported, using pc.iceConnectionState');
                                switch (this._pc.iceConnectionState) {
                                    case 'checking': {
                                        this.emit('@connectionstatechange', 'connecting');
                                        break;
                                    }
                                    case 'connected':
                                    case 'completed': {
                                        this.emit('@connectionstatechange', 'connected');
                                        break;
                                    }
                                    case 'failed': {
                                        this.emit('@connectionstatechange', 'failed');
                                        break;
                                    }
                                    case 'disconnected': {
                                        this.emit('@connectionstatechange', 'disconnected');
                                        break;
                                    }
                                    case 'closed': {
                                        this.emit('@connectionstatechange', 'closed');
                                        break;
                                    }
                                }
                            });
                        }
                    }
                    async updateIceServers(iceServers) {
                        this.assertNotClosed();
                        logger.debug('updateIceServers()');
                        const configuration = this._pc.getConfiguration();
                        configuration.iceServers = iceServers;
                        this._pc.setConfiguration(configuration);
                    }
                    async restartIce(iceParameters) {
                        this.assertNotClosed();
                        logger.debug('restartIce()');
                        // Provide the remote SDP handler with new remote ICE parameters.
                        this._remoteSdp.updateIceParameters(iceParameters);
                        if (!this._transportReady) {
                            return;
                        }
                        if (this._direction === 'send') {
                            const offer = await this._pc.createOffer({ iceRestart: true });
                            logger.debug('restartIce() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                        } else {
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('restartIce() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            logger.debug('restartIce() | calling pc.setLocalDescription() [answer:%o]', answer);
                            await this._pc.setLocalDescription(answer);
                        }
                    }
                    async getTransportStats() {
                        this.assertNotClosed();
                        return this._pc.getStats();
                    }
                    async send({ track, encodings, codecOptions, codec }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('send() [kind:%s, track.id:%s]', track.kind, track.id);
                        const sendingRtpParameters = utils.clone(this._sendingRtpParametersByKind[track.kind]);
                        // This may throw.
                        sendingRtpParameters.codecs = ortc.reduceCodecs(sendingRtpParameters.codecs, codec);
                        const sendingRemoteRtpParameters = utils.clone(
                            this._sendingRemoteRtpParametersByKind[track.kind],
                        );
                        // This may throw.
                        sendingRemoteRtpParameters.codecs = ortc.reduceCodecs(sendingRemoteRtpParameters.codecs, codec);
                        const mediaSectionIdx = this._remoteSdp.getNextMediaSectionIdx();
                        const transceiver = this._pc.addTransceiver(track, {
                            direction: 'sendonly',
                            streams: [this._sendStream],
                        });
                        let offer = await this._pc.createOffer();
                        let localSdpObject = sdpTransform.parse(offer.sdp);
                        let offerMediaObject;
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        const layers = (0, scalabilityModes_1.parse)((encodings || [{}])[0].scalabilityMode);
                        if (encodings && encodings.length > 1) {
                            logger.debug('send() | enabling legacy simulcast');
                            localSdpObject = sdpTransform.parse(offer.sdp);
                            offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                            sdpUnifiedPlanUtils.addLegacySimulcast({
                                offerMediaObject,
                                numStreams: encodings.length,
                            });
                            offer = { type: 'offer', sdp: sdpTransform.write(localSdpObject) };
                        }
                        logger.debug('send() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        // We can now get the transceiver.mid.
                        const localId = transceiver.mid;
                        // Set MID.
                        sendingRtpParameters.mid = localId;
                        localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        offerMediaObject = localSdpObject.media[mediaSectionIdx.idx];
                        // Set RTCP CNAME.
                        sendingRtpParameters.rtcp.cname = sdpCommonUtils.getCname({
                            offerMediaObject,
                        });
                        // Set RTP encodings.
                        sendingRtpParameters.encodings = sdpUnifiedPlanUtils.getRtpEncodings({
                            offerMediaObject,
                        });
                        // Complete encodings with given values.
                        if (encodings) {
                            for (let idx = 0; idx < sendingRtpParameters.encodings.length; ++idx) {
                                if (encodings[idx]) {
                                    Object.assign(sendingRtpParameters.encodings[idx], encodings[idx]);
                                }
                            }
                        }
                        // If VP8 or H264 and there is effective simulcast, add scalabilityMode to
                        // each encoding.
                        if (
                            sendingRtpParameters.encodings.length > 1 &&
                            (sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/vp8' ||
                                sendingRtpParameters.codecs[0].mimeType.toLowerCase() === 'video/h264')
                        ) {
                            for (const encoding of sendingRtpParameters.encodings) {
                                if (encoding.scalabilityMode) {
                                    encoding.scalabilityMode = `L1T${layers.temporalLayers}`;
                                } else {
                                    encoding.scalabilityMode = 'L1T3';
                                }
                            }
                        }
                        this._remoteSdp.send({
                            offerMediaObject,
                            reuseMid: mediaSectionIdx.reuseMid,
                            offerRtpParameters: sendingRtpParameters,
                            answerRtpParameters: sendingRemoteRtpParameters,
                            codecOptions,
                        });
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('send() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        // Store in the map.
                        this._mapMidTransceiver.set(localId, transceiver);
                        return {
                            localId,
                            rtpParameters: sendingRtpParameters,
                            rtpSender: transceiver.sender,
                        };
                    }
                    async stopSending(localId) {
                        this.assertSendDirection();
                        if (this._closed) {
                            return;
                        }
                        logger.debug('stopSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.sender.replaceTrack(null);
                        this._pc.removeTrack(transceiver.sender);
                        const mediaSectionClosed = this._remoteSdp.closeMediaSection(transceiver.mid);
                        if (mediaSectionClosed) {
                            try {
                                transceiver.stop();
                            } catch (error) {}
                        }
                        const offer = await this._pc.createOffer();
                        logger.debug('stopSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                        this._mapMidTransceiver.delete(localId);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async pauseSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('pauseSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'inactive';
                        this._remoteSdp.pauseMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('pauseSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    async resumeSending(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('resumeSending() [localId:%s]', localId);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        transceiver.direction = 'sendonly';
                        this._remoteSdp.resumeSendingMediaSection(localId);
                        const offer = await this._pc.createOffer();
                        logger.debug('resumeSending() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeSending() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async replaceTrack(localId, track) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        if (track) {
                            logger.debug('replaceTrack() [localId:%s, track.id:%s]', localId, track.id);
                        } else {
                            logger.debug('replaceTrack() [localId:%s, no track]', localId);
                        }
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        await transceiver.sender.replaceTrack(track);
                    }
                    async setMaxSpatialLayer(localId, spatialLayer) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setMaxSpatialLayer() [localId:%s, spatialLayer:%s]', localId, spatialLayer);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            if (idx <= spatialLayer) {
                                encoding.active = true;
                            } else {
                                encoding.active = false;
                            }
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setMaxSpatialLayer() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('setMaxSpatialLayer() | calling pc.setRemoteDescription() [answer:%o]', answer);
                        await this._pc.setRemoteDescription(answer);
                    }
                    async setRtpEncodingParameters(localId, params) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        logger.debug('setRtpEncodingParameters() [localId:%s, params:%o]', localId, params);
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        const parameters = transceiver.sender.getParameters();
                        parameters.encodings.forEach((encoding, idx) => {
                            parameters.encodings[idx] = { ...encoding, ...params };
                        });
                        await transceiver.sender.setParameters(parameters);
                        this._remoteSdp.muxMediaSectionSimulcast(localId, parameters.encodings);
                        const offer = await this._pc.createOffer();
                        logger.debug('setRtpEncodingParameters() | calling pc.setLocalDescription() [offer:%o]', offer);
                        await this._pc.setLocalDescription(offer);
                        const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                        logger.debug(
                            'setRtpEncodingParameters() | calling pc.setRemoteDescription() [answer:%o]',
                            answer,
                        );
                        await this._pc.setRemoteDescription(answer);
                    }
                    async getSenderStats(localId) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.sender.getStats();
                    }
                    async sendDataChannel({ ordered, maxPacketLifeTime, maxRetransmits, label, protocol }) {
                        this.assertNotClosed();
                        this.assertSendDirection();
                        const options = {
                            negotiated: true,
                            id: this._nextSendSctpStreamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('sendDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // Increase next id.
                        this._nextSendSctpStreamId = ++this._nextSendSctpStreamId % SCTP_NUM_STREAMS.MIS;
                        // If this is the first DataChannel we need to create the SDP answer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            const offer = await this._pc.createOffer();
                            const localSdpObject = sdpTransform.parse(offer.sdp);
                            const offerMediaObject = localSdpObject.media.find((m) => m.type === 'application');
                            if (!this._transportReady) {
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug('sendDataChannel() | calling pc.setLocalDescription() [offer:%o]', offer);
                            await this._pc.setLocalDescription(offer);
                            this._remoteSdp.sendSctpAssociation({ offerMediaObject });
                            const answer = { type: 'answer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('sendDataChannel() | calling pc.setRemoteDescription() [answer:%o]', answer);
                            await this._pc.setRemoteDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        const sctpStreamParameters = {
                            streamId: options.id,
                            ordered: options.ordered,
                            maxPacketLifeTime: options.maxPacketLifeTime,
                            maxRetransmits: options.maxRetransmits,
                        };
                        return { dataChannel, sctpStreamParameters };
                    }
                    async receive(optionsList) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const results = [];
                        const mapLocalId = new Map();
                        for (const options of optionsList) {
                            const { trackId, kind, rtpParameters, streamId } = options;
                            logger.debug('receive() [trackId:%s, kind:%s]', trackId, kind);
                            const localId = rtpParameters.mid || String(this._mapMidTransceiver.size);
                            mapLocalId.set(trackId, localId);
                            this._remoteSdp.receive({
                                mid: localId,
                                kind,
                                offerRtpParameters: rtpParameters,
                                streamId: streamId || rtpParameters.rtcp.cname,
                                trackId,
                            });
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('receive() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        let answer = await this._pc.createAnswer();
                        const localSdpObject = sdpTransform.parse(answer.sdp);
                        for (const options of optionsList) {
                            const { trackId, rtpParameters } = options;
                            const localId = mapLocalId.get(trackId);
                            const answerMediaObject = localSdpObject.media.find((m) => String(m.mid) === localId);
                            // May need to modify codec parameters in the answer based on codec
                            // parameters in the offer.
                            sdpCommonUtils.applyCodecParameters({
                                offerRtpParameters: rtpParameters,
                                answerMediaObject,
                            });
                        }
                        answer = { type: 'answer', sdp: sdpTransform.write(localSdpObject) };
                        if (!this._transportReady) {
                            await this.setupTransport({
                                localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                localSdpObject,
                            });
                        }
                        logger.debug('receive() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const options of optionsList) {
                            const { trackId } = options;
                            const localId = mapLocalId.get(trackId);
                            const transceiver = this._pc.getTransceivers().find((t) => t.mid === localId);
                            if (!transceiver) {
                                throw new Error('new RTCRtpTransceiver not found');
                            }
                            // Store in the map.
                            this._mapMidTransceiver.set(localId, transceiver);
                            results.push({
                                localId,
                                track: transceiver.receiver.track,
                                rtpReceiver: transceiver.receiver,
                            });
                        }
                        return results;
                    }
                    async stopReceiving(localIds) {
                        this.assertRecvDirection();
                        if (this._closed) {
                            return;
                        }
                        for (const localId of localIds) {
                            logger.debug('stopReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            this._remoteSdp.closeMediaSection(transceiver.mid);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('stopReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('stopReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                        for (const localId of localIds) {
                            this._mapMidTransceiver.delete(localId);
                        }
                    }
                    async pauseReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('pauseReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'inactive';
                            this._remoteSdp.pauseMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('pauseReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('pauseReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async resumeReceiving(localIds) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        for (const localId of localIds) {
                            logger.debug('resumeReceiving() [localId:%s]', localId);
                            const transceiver = this._mapMidTransceiver.get(localId);
                            if (!transceiver) {
                                throw new Error('associated RTCRtpTransceiver not found');
                            }
                            transceiver.direction = 'recvonly';
                            this._remoteSdp.resumeReceivingMediaSection(localId);
                        }
                        const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                        logger.debug('resumeReceiving() | calling pc.setRemoteDescription() [offer:%o]', offer);
                        await this._pc.setRemoteDescription(offer);
                        const answer = await this._pc.createAnswer();
                        logger.debug('resumeReceiving() | calling pc.setLocalDescription() [answer:%o]', answer);
                        await this._pc.setLocalDescription(answer);
                    }
                    async getReceiverStats(localId) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const transceiver = this._mapMidTransceiver.get(localId);
                        if (!transceiver) {
                            throw new Error('associated RTCRtpTransceiver not found');
                        }
                        return transceiver.receiver.getStats();
                    }
                    async receiveDataChannel({ sctpStreamParameters, label, protocol }) {
                        this.assertNotClosed();
                        this.assertRecvDirection();
                        const { streamId, ordered, maxPacketLifeTime, maxRetransmits } = sctpStreamParameters;
                        const options = {
                            negotiated: true,
                            id: streamId,
                            ordered,
                            maxPacketLifeTime,
                            maxRetransmits,
                            protocol,
                        };
                        logger.debug('receiveDataChannel() [options:%o]', options);
                        const dataChannel = this._pc.createDataChannel(label, options);
                        // If this is the first DataChannel we need to create the SDP offer with
                        // m=application section.
                        if (!this._hasDataChannelMediaSection) {
                            this._remoteSdp.receiveSctpAssociation();
                            const offer = { type: 'offer', sdp: this._remoteSdp.getSdp() };
                            logger.debug('receiveDataChannel() | calling pc.setRemoteDescription() [offer:%o]', offer);
                            await this._pc.setRemoteDescription(offer);
                            const answer = await this._pc.createAnswer();
                            if (!this._transportReady) {
                                const localSdpObject = sdpTransform.parse(answer.sdp);
                                await this.setupTransport({
                                    localDtlsRole: this._forcedLocalDtlsRole ?? 'client',
                                    localSdpObject,
                                });
                            }
                            logger.debug(
                                'receiveDataChannel() | calling pc.setRemoteDescription() [answer:%o]',
                                answer,
                            );
                            await this._pc.setLocalDescription(answer);
                            this._hasDataChannelMediaSection = true;
                        }
                        return { dataChannel };
                    }
                    async setupTransport({ localDtlsRole, localSdpObject }) {
                        if (!localSdpObject) {
                            localSdpObject = sdpTransform.parse(this._pc.localDescription.sdp);
                        }
                        // Get our local DTLS parameters.
                        const dtlsParameters = sdpCommonUtils.extractDtlsParameters({
                            sdpObject: localSdpObject,
                        });
                        // Set our DTLS role.
                        dtlsParameters.role = localDtlsRole;
                        // Update the remote DTLS role in the SDP.
                        this._remoteSdp.updateDtlsRole(localDtlsRole === 'client' ? 'server' : 'client');
                        // Need to tell the remote transport about our parameters.
                        await new Promise((resolve, reject) => {
                            this.safeEmit('@connect', { dtlsParameters }, resolve, reject);
                        });
                        this._transportReady = true;
                    }
                    assertNotClosed() {
                        if (this._closed) {
                            throw new errors_1.InvalidStateError('method called in a closed handler');
                        }
                    }
                    assertSendDirection() {
                        if (this._direction !== 'send') {
                            throw new Error('method can just be called for handlers with "send" direction');
                        }
                    }
                    assertRecvDirection() {
                        if (this._direction !== 'recv') {
                            throw new Error('method can just be called for handlers with "recv" direction');
                        }
                    }
                }
                exports.Safari12 = Safari12;
            },
            {
                '../Logger': 12,
                '../errors': 17,
                '../ortc': 39,
                '../scalabilityModes': 40,
                '../utils': 42,
                './HandlerInterface': 26,
                './ortc/utils': 32,
                './sdp/RemoteSdp': 34,
                './sdp/commonUtils': 35,
                './sdp/unifiedPlanUtils': 37,
                'sdp-transform': 46,
            },
        ],
        31: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.mangleRtpParameters = exports.getCapabilities = void 0;
                const utils = __importStar(require('../../utils'));
                /**
                 * Normalize ORTC based Edge's RTCRtpReceiver.getCapabilities() to produce a full
                 * compliant ORTC RTCRtpCapabilities.
                 */
                function getCapabilities() {
                    const nativeCaps = RTCRtpReceiver.getCapabilities();
                    const caps = utils.clone(nativeCaps);
                    for (const codec of caps.codecs ?? []) {
                        // Rename numChannels to channels.
                        // @ts-ignore
                        codec.channels = codec.numChannels;
                        // @ts-ignore
                        delete codec.numChannels;
                        // Add mimeType.
                        // @ts-ignore (due to codec.name).
                        codec.mimeType = codec.mimeType || `${codec.kind}/${codec.name}`;
                        // NOTE: Edge sets some numeric parameters as string rather than number. Fix them.
                        if (codec.parameters) {
                            const parameters = codec.parameters;
                            if (parameters.apt) {
                                parameters.apt = Number(parameters.apt);
                            }
                            if (parameters['packetization-mode']) {
                                parameters['packetization-mode'] = Number(parameters['packetization-mode']);
                            }
                        }
                        // Delete emty parameter String in rtcpFeedback.
                        for (const feedback of codec.rtcpFeedback || []) {
                            if (!feedback.parameter) {
                                feedback.parameter = '';
                            }
                        }
                    }
                    return caps;
                }
                exports.getCapabilities = getCapabilities;
                /**
                 * Generate RTCRtpParameters as ORTC based Edge likes.
                 */
                function mangleRtpParameters(rtpParameters) {
                    const params = utils.clone(rtpParameters);
                    // Rename mid to muxId.
                    if (params.mid) {
                        // @ts-ignore (due to muxId).
                        params.muxId = params.mid;
                        delete params.mid;
                    }
                    for (const codec of params.codecs) {
                        // Rename channels to numChannels.
                        if (codec.channels) {
                            // @ts-ignore.
                            codec.numChannels = codec.channels;
                            delete codec.channels;
                        }
                        // Add codec.name (requried by Edge).
                        // @ts-ignore (due to name).
                        if (codec.mimeType && !codec.name) {
                            // @ts-ignore (due to name).
                            codec.name = codec.mimeType.split('/')[1];
                        }
                        // Remove mimeType.
                        // @ts-ignore
                        delete codec.mimeType;
                    }
                    return params;
                }
                exports.mangleRtpParameters = mangleRtpParameters;
            },
            { '../../utils': 42 },
        ],
        32: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.addNackSuppportForOpus = void 0;
                /**
                 * This function adds RTCP NACK support for OPUS codec in given capabilities.
                 */
                function addNackSuppportForOpus(rtpCapabilities) {
                    for (const codec of rtpCapabilities.codecs || []) {
                        if (
                            (codec.mimeType.toLowerCase() === 'audio/opus' ||
                                codec.mimeType.toLowerCase() === 'audio/multiopus') &&
                            !codec.rtcpFeedback?.some((fb) => fb.type === 'nack' && !fb.parameter)
                        ) {
                            if (!codec.rtcpFeedback) {
                                codec.rtcpFeedback = [];
                            }
                            codec.rtcpFeedback.push({ type: 'nack' });
                        }
                    }
                }
                exports.addNackSuppportForOpus = addNackSuppportForOpus;
            },
            {},
        ],
        33: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.OfferMediaSection = exports.AnswerMediaSection = exports.MediaSection = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const utils = __importStar(require('../../utils'));
                class MediaSection {
                    constructor({ iceParameters, iceCandidates, dtlsParameters, planB = false }) {
                        this._mediaObject = {};
                        this._planB = planB;
                        if (iceParameters) {
                            this.setIceParameters(iceParameters);
                        }
                        if (iceCandidates) {
                            this._mediaObject.candidates = [];
                            for (const candidate of iceCandidates) {
                                const candidateObject = {};
                                // mediasoup does mandates rtcp-mux so candidates component is always
                                // RTP (1).
                                candidateObject.component = 1;
                                candidateObject.foundation = candidate.foundation;
                                // Be ready for new candidate.address field in mediasoup server side
                                // field and keep backward compatibility with deprecated candidate.ip.
                                candidateObject.ip = candidate.address ?? candidate.ip;
                                candidateObject.port = candidate.port;
                                candidateObject.priority = candidate.priority;
                                candidateObject.transport = candidate.protocol;
                                candidateObject.type = candidate.type;
                                if (candidate.tcpType) {
                                    candidateObject.tcptype = candidate.tcpType;
                                }
                                this._mediaObject.candidates.push(candidateObject);
                            }
                            this._mediaObject.endOfCandidates = 'end-of-candidates';
                            this._mediaObject.iceOptions = 'renomination';
                        }
                        if (dtlsParameters) {
                            this.setDtlsRole(dtlsParameters.role);
                        }
                    }
                    get mid() {
                        return String(this._mediaObject.mid);
                    }
                    get closed() {
                        return this._mediaObject.port === 0;
                    }
                    getObject() {
                        return this._mediaObject;
                    }
                    setIceParameters(iceParameters) {
                        this._mediaObject.iceUfrag = iceParameters.usernameFragment;
                        this._mediaObject.icePwd = iceParameters.password;
                    }
                    pause() {
                        this._mediaObject.direction = 'inactive';
                    }
                    disable() {
                        this.pause();
                        delete this._mediaObject.ext;
                        delete this._mediaObject.ssrcs;
                        delete this._mediaObject.ssrcGroups;
                        delete this._mediaObject.simulcast;
                        delete this._mediaObject.simulcast_03;
                        delete this._mediaObject.rids;
                        delete this._mediaObject.extmapAllowMixed;
                    }
                    close() {
                        this.disable();
                        this._mediaObject.port = 0;
                    }
                }
                exports.MediaSection = MediaSection;
                class AnswerMediaSection extends MediaSection {
                    constructor({
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        plainRtpParameters,
                        planB = false,
                        offerMediaObject,
                        offerRtpParameters,
                        answerRtpParameters,
                        codecOptions,
                        extmapAllowMixed = false,
                    }) {
                        super({ iceParameters, iceCandidates, dtlsParameters, planB });
                        this._mediaObject.mid = String(offerMediaObject.mid);
                        this._mediaObject.type = offerMediaObject.type;
                        this._mediaObject.protocol = offerMediaObject.protocol;
                        if (!plainRtpParameters) {
                            this._mediaObject.connection = { ip: '127.0.0.1', version: 4 };
                            this._mediaObject.port = 7;
                        } else {
                            this._mediaObject.connection = {
                                ip: plainRtpParameters.ip,
                                version: plainRtpParameters.ipVersion,
                            };
                            this._mediaObject.port = plainRtpParameters.port;
                        }
                        switch (offerMediaObject.type) {
                            case 'audio':
                            case 'video': {
                                this._mediaObject.direction = 'recvonly';
                                this._mediaObject.rtp = [];
                                this._mediaObject.rtcpFb = [];
                                this._mediaObject.fmtp = [];
                                for (const codec of answerRtpParameters.codecs) {
                                    const rtp = {
                                        payload: codec.payloadType,
                                        codec: getCodecName(codec),
                                        rate: codec.clockRate,
                                    };
                                    if (codec.channels > 1) {
                                        rtp.encoding = codec.channels;
                                    }
                                    this._mediaObject.rtp.push(rtp);
                                    const codecParameters = utils.clone(codec.parameters) ?? {};
                                    let codecRtcpFeedback = utils.clone(codec.rtcpFeedback) ?? [];
                                    if (codecOptions) {
                                        const {
                                            opusStereo,
                                            opusFec,
                                            opusDtx,
                                            opusMaxPlaybackRate,
                                            opusMaxAverageBitrate,
                                            opusPtime,
                                            opusNack,
                                            videoGoogleStartBitrate,
                                            videoGoogleMaxBitrate,
                                            videoGoogleMinBitrate,
                                        } = codecOptions;
                                        const offerCodec = offerRtpParameters.codecs.find(
                                            (c) => c.payloadType === codec.payloadType,
                                        );
                                        switch (codec.mimeType.toLowerCase()) {
                                            case 'audio/opus':
                                            case 'audio/multiopus': {
                                                if (opusStereo !== undefined) {
                                                    offerCodec.parameters['sprop-stereo'] = opusStereo ? 1 : 0;
                                                    codecParameters.stereo = opusStereo ? 1 : 0;
                                                }
                                                if (opusFec !== undefined) {
                                                    offerCodec.parameters.useinbandfec = opusFec ? 1 : 0;
                                                    codecParameters.useinbandfec = opusFec ? 1 : 0;
                                                }
                                                if (opusDtx !== undefined) {
                                                    offerCodec.parameters.usedtx = opusDtx ? 1 : 0;
                                                    codecParameters.usedtx = opusDtx ? 1 : 0;
                                                }
                                                if (opusMaxPlaybackRate !== undefined) {
                                                    codecParameters.maxplaybackrate = opusMaxPlaybackRate;
                                                }
                                                if (opusMaxAverageBitrate !== undefined) {
                                                    codecParameters.maxaveragebitrate = opusMaxAverageBitrate;
                                                }
                                                if (opusPtime !== undefined) {
                                                    offerCodec.parameters.ptime = opusPtime;
                                                    codecParameters.ptime = opusPtime;
                                                }
                                                // If opusNack is not set, we must remove NACK support for OPUS.
                                                // Otherwise it would be enabled for those handlers that artificially
                                                // announce it in their RTP capabilities.
                                                if (!opusNack) {
                                                    offerCodec.rtcpFeedback = offerCodec.rtcpFeedback.filter(
                                                        (fb) => fb.type !== 'nack' || fb.parameter,
                                                    );
                                                    codecRtcpFeedback = codecRtcpFeedback.filter(
                                                        (fb) => fb.type !== 'nack' || fb.parameter,
                                                    );
                                                }
                                                break;
                                            }
                                            case 'video/vp8':
                                            case 'video/vp9':
                                            case 'video/h264':
                                            case 'video/h265': {
                                                if (videoGoogleStartBitrate !== undefined) {
                                                    codecParameters['x-google-start-bitrate'] = videoGoogleStartBitrate;
                                                }
                                                if (videoGoogleMaxBitrate !== undefined) {
                                                    codecParameters['x-google-max-bitrate'] = videoGoogleMaxBitrate;
                                                }
                                                if (videoGoogleMinBitrate !== undefined) {
                                                    codecParameters['x-google-min-bitrate'] = videoGoogleMinBitrate;
                                                }
                                                break;
                                            }
                                        }
                                    }
                                    const fmtp = {
                                        payload: codec.payloadType,
                                        config: '',
                                    };
                                    for (const key of Object.keys(codecParameters)) {
                                        if (fmtp.config) {
                                            fmtp.config += ';';
                                        }
                                        fmtp.config += `${key}=${codecParameters[key]}`;
                                    }
                                    if (fmtp.config) {
                                        this._mediaObject.fmtp.push(fmtp);
                                    }
                                    for (const fb of codecRtcpFeedback) {
                                        this._mediaObject.rtcpFb.push({
                                            payload: codec.payloadType,
                                            type: fb.type,
                                            subtype: fb.parameter,
                                        });
                                    }
                                }
                                this._mediaObject.payloads = answerRtpParameters.codecs
                                    .map((codec) => codec.payloadType)
                                    .join(' ');
                                this._mediaObject.ext = [];
                                for (const ext of answerRtpParameters.headerExtensions) {
                                    // Don't add a header extension if not present in the offer.
                                    const found = (offerMediaObject.ext || []).some(
                                        (localExt) => localExt.uri === ext.uri,
                                    );
                                    if (!found) {
                                        continue;
                                    }
                                    this._mediaObject.ext.push({
                                        uri: ext.uri,
                                        value: ext.id,
                                    });
                                }
                                // Allow both 1 byte and 2 bytes length header extensions.
                                if (extmapAllowMixed && offerMediaObject.extmapAllowMixed === 'extmap-allow-mixed') {
                                    this._mediaObject.extmapAllowMixed = 'extmap-allow-mixed';
                                }
                                // Simulcast.
                                if (offerMediaObject.simulcast) {
                                    this._mediaObject.simulcast = {
                                        dir1: 'recv',
                                        list1: offerMediaObject.simulcast.list1,
                                    };
                                    this._mediaObject.rids = [];
                                    for (const rid of offerMediaObject.rids || []) {
                                        if (rid.direction !== 'send') {
                                            continue;
                                        }
                                        this._mediaObject.rids.push({
                                            id: rid.id,
                                            direction: 'recv',
                                        });
                                    }
                                }
                                // Simulcast (draft version 03).
                                else if (offerMediaObject.simulcast_03) {
                                    // eslint-disable-next-line camelcase
                                    this._mediaObject.simulcast_03 = {
                                        value: offerMediaObject.simulcast_03.value.replace(/send/g, 'recv'),
                                    };
                                    this._mediaObject.rids = [];
                                    for (const rid of offerMediaObject.rids || []) {
                                        if (rid.direction !== 'send') {
                                            continue;
                                        }
                                        this._mediaObject.rids.push({
                                            id: rid.id,
                                            direction: 'recv',
                                        });
                                    }
                                }
                                this._mediaObject.rtcpMux = 'rtcp-mux';
                                this._mediaObject.rtcpRsize = 'rtcp-rsize';
                                if (this._planB && this._mediaObject.type === 'video') {
                                    this._mediaObject.xGoogleFlag = 'conference';
                                }
                                break;
                            }
                            case 'application': {
                                // New spec.
                                if (typeof offerMediaObject.sctpPort === 'number') {
                                    this._mediaObject.payloads = 'webrtc-datachannel';
                                    this._mediaObject.sctpPort = sctpParameters.port;
                                    this._mediaObject.maxMessageSize = sctpParameters.maxMessageSize;
                                }
                                // Old spec.
                                else if (offerMediaObject.sctpmap) {
                                    this._mediaObject.payloads = sctpParameters.port;
                                    this._mediaObject.sctpmap = {
                                        app: 'webrtc-datachannel',
                                        sctpmapNumber: sctpParameters.port,
                                        maxMessageSize: sctpParameters.maxMessageSize,
                                    };
                                }
                                break;
                            }
                        }
                    }
                    setDtlsRole(role) {
                        switch (role) {
                            case 'client': {
                                this._mediaObject.setup = 'active';
                                break;
                            }
                            case 'server': {
                                this._mediaObject.setup = 'passive';
                                break;
                            }
                            case 'auto': {
                                this._mediaObject.setup = 'actpass';
                                break;
                            }
                        }
                    }
                    resume() {
                        this._mediaObject.direction = 'recvonly';
                    }
                    muxSimulcastStreams(encodings) {
                        if (!this._mediaObject.simulcast || !this._mediaObject.simulcast.list1) {
                            return;
                        }
                        const layers = {};
                        for (const encoding of encodings) {
                            if (encoding.rid) {
                                layers[encoding.rid] = encoding;
                            }
                        }
                        const raw = this._mediaObject.simulcast.list1;
                        const simulcastStreams = sdpTransform.parseSimulcastStreamList(raw);
                        for (const simulcastStream of simulcastStreams) {
                            for (const simulcastFormat of simulcastStream) {
                                simulcastFormat.paused = !layers[simulcastFormat.scid]?.active;
                            }
                        }
                        this._mediaObject.simulcast.list1 = simulcastStreams
                            .map((simulcastFormats) =>
                                simulcastFormats.map((f) => `${f.paused ? '~' : ''}${f.scid}`).join(','),
                            )
                            .join(';');
                    }
                }
                exports.AnswerMediaSection = AnswerMediaSection;
                class OfferMediaSection extends MediaSection {
                    constructor({
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        plainRtpParameters,
                        planB = false,
                        mid,
                        kind,
                        offerRtpParameters,
                        streamId,
                        trackId,
                        oldDataChannelSpec = false,
                    }) {
                        super({ iceParameters, iceCandidates, dtlsParameters, planB });
                        this._mediaObject.mid = String(mid);
                        this._mediaObject.type = kind;
                        if (!plainRtpParameters) {
                            this._mediaObject.connection = { ip: '127.0.0.1', version: 4 };
                            if (!sctpParameters) {
                                this._mediaObject.protocol = 'UDP/TLS/RTP/SAVPF';
                            } else {
                                this._mediaObject.protocol = 'UDP/DTLS/SCTP';
                            }
                            this._mediaObject.port = 7;
                        } else {
                            this._mediaObject.connection = {
                                ip: plainRtpParameters.ip,
                                version: plainRtpParameters.ipVersion,
                            };
                            this._mediaObject.protocol = 'RTP/AVP';
                            this._mediaObject.port = plainRtpParameters.port;
                        }
                        switch (kind) {
                            case 'audio':
                            case 'video': {
                                this._mediaObject.direction = 'sendonly';
                                this._mediaObject.rtp = [];
                                this._mediaObject.rtcpFb = [];
                                this._mediaObject.fmtp = [];
                                if (!this._planB) {
                                    this._mediaObject.msid = `${streamId || '-'} ${trackId}`;
                                }
                                for (const codec of offerRtpParameters.codecs) {
                                    const rtp = {
                                        payload: codec.payloadType,
                                        codec: getCodecName(codec),
                                        rate: codec.clockRate,
                                    };
                                    if (codec.channels > 1) {
                                        rtp.encoding = codec.channels;
                                    }
                                    this._mediaObject.rtp.push(rtp);
                                    const fmtp = {
                                        payload: codec.payloadType,
                                        config: '',
                                    };
                                    for (const key of Object.keys(codec.parameters)) {
                                        if (fmtp.config) {
                                            fmtp.config += ';';
                                        }
                                        fmtp.config += `${key}=${codec.parameters[key]}`;
                                    }
                                    if (fmtp.config) {
                                        this._mediaObject.fmtp.push(fmtp);
                                    }
                                    for (const fb of codec.rtcpFeedback) {
                                        this._mediaObject.rtcpFb.push({
                                            payload: codec.payloadType,
                                            type: fb.type,
                                            subtype: fb.parameter,
                                        });
                                    }
                                }
                                this._mediaObject.payloads = offerRtpParameters.codecs
                                    .map((codec) => codec.payloadType)
                                    .join(' ');
                                this._mediaObject.ext = [];
                                for (const ext of offerRtpParameters.headerExtensions) {
                                    this._mediaObject.ext.push({
                                        uri: ext.uri,
                                        value: ext.id,
                                    });
                                }
                                this._mediaObject.rtcpMux = 'rtcp-mux';
                                this._mediaObject.rtcpRsize = 'rtcp-rsize';
                                const encoding = offerRtpParameters.encodings[0];
                                const ssrc = encoding.ssrc;
                                const rtxSsrc = encoding.rtx && encoding.rtx.ssrc ? encoding.rtx.ssrc : undefined;
                                this._mediaObject.ssrcs = [];
                                this._mediaObject.ssrcGroups = [];
                                if (offerRtpParameters.rtcp.cname) {
                                    this._mediaObject.ssrcs.push({
                                        id: ssrc,
                                        attribute: 'cname',
                                        value: offerRtpParameters.rtcp.cname,
                                    });
                                }
                                if (this._planB) {
                                    this._mediaObject.ssrcs.push({
                                        id: ssrc,
                                        attribute: 'msid',
                                        value: `${streamId || '-'} ${trackId}`,
                                    });
                                }
                                if (rtxSsrc) {
                                    if (offerRtpParameters.rtcp.cname) {
                                        this._mediaObject.ssrcs.push({
                                            id: rtxSsrc,
                                            attribute: 'cname',
                                            value: offerRtpParameters.rtcp.cname,
                                        });
                                    }
                                    if (this._planB) {
                                        this._mediaObject.ssrcs.push({
                                            id: rtxSsrc,
                                            attribute: 'msid',
                                            value: `${streamId || '-'} ${trackId}`,
                                        });
                                    }
                                    // Associate original and retransmission SSRCs.
                                    this._mediaObject.ssrcGroups.push({
                                        semantics: 'FID',
                                        ssrcs: `${ssrc} ${rtxSsrc}`,
                                    });
                                }
                                break;
                            }
                            case 'application': {
                                // New spec.
                                if (!oldDataChannelSpec) {
                                    this._mediaObject.payloads = 'webrtc-datachannel';
                                    this._mediaObject.sctpPort = sctpParameters.port;
                                    this._mediaObject.maxMessageSize = sctpParameters.maxMessageSize;
                                }
                                // Old spec.
                                else {
                                    this._mediaObject.payloads = sctpParameters.port;
                                    this._mediaObject.sctpmap = {
                                        app: 'webrtc-datachannel',
                                        sctpmapNumber: sctpParameters.port,
                                        maxMessageSize: sctpParameters.maxMessageSize,
                                    };
                                }
                                break;
                            }
                        }
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    setDtlsRole(role) {
                        // Always 'actpass'.
                        this._mediaObject.setup = 'actpass';
                    }
                    resume() {
                        this._mediaObject.direction = 'sendonly';
                    }
                    planBReceive({ offerRtpParameters, streamId, trackId }) {
                        const encoding = offerRtpParameters.encodings[0];
                        const ssrc = encoding.ssrc;
                        const rtxSsrc = encoding.rtx && encoding.rtx.ssrc ? encoding.rtx.ssrc : undefined;
                        const payloads = this._mediaObject.payloads.split(' ');
                        for (const codec of offerRtpParameters.codecs) {
                            if (payloads.includes(String(codec.payloadType))) {
                                continue;
                            }
                            const rtp = {
                                payload: codec.payloadType,
                                codec: getCodecName(codec),
                                rate: codec.clockRate,
                            };
                            if (codec.channels > 1) {
                                rtp.encoding = codec.channels;
                            }
                            this._mediaObject.rtp.push(rtp);
                            const fmtp = {
                                payload: codec.payloadType,
                                config: '',
                            };
                            for (const key of Object.keys(codec.parameters)) {
                                if (fmtp.config) {
                                    fmtp.config += ';';
                                }
                                fmtp.config += `${key}=${codec.parameters[key]}`;
                            }
                            if (fmtp.config) {
                                this._mediaObject.fmtp.push(fmtp);
                            }
                            for (const fb of codec.rtcpFeedback) {
                                this._mediaObject.rtcpFb.push({
                                    payload: codec.payloadType,
                                    type: fb.type,
                                    subtype: fb.parameter,
                                });
                            }
                        }
                        this._mediaObject.payloads += ` ${offerRtpParameters.codecs
                            .filter((codec) => !this._mediaObject.payloads.includes(codec.payloadType))
                            .map((codec) => codec.payloadType)
                            .join(' ')}`;
                        this._mediaObject.payloads = this._mediaObject.payloads.trim();
                        if (offerRtpParameters.rtcp.cname) {
                            this._mediaObject.ssrcs.push({
                                id: ssrc,
                                attribute: 'cname',
                                value: offerRtpParameters.rtcp.cname,
                            });
                        }
                        this._mediaObject.ssrcs.push({
                            id: ssrc,
                            attribute: 'msid',
                            value: `${streamId || '-'} ${trackId}`,
                        });
                        if (rtxSsrc) {
                            if (offerRtpParameters.rtcp.cname) {
                                this._mediaObject.ssrcs.push({
                                    id: rtxSsrc,
                                    attribute: 'cname',
                                    value: offerRtpParameters.rtcp.cname,
                                });
                            }
                            this._mediaObject.ssrcs.push({
                                id: rtxSsrc,
                                attribute: 'msid',
                                value: `${streamId || '-'} ${trackId}`,
                            });
                            // Associate original and retransmission SSRCs.
                            this._mediaObject.ssrcGroups.push({
                                semantics: 'FID',
                                ssrcs: `${ssrc} ${rtxSsrc}`,
                            });
                        }
                    }
                    planBStopReceiving({ offerRtpParameters }) {
                        const encoding = offerRtpParameters.encodings[0];
                        const ssrc = encoding.ssrc;
                        const rtxSsrc = encoding.rtx && encoding.rtx.ssrc ? encoding.rtx.ssrc : undefined;
                        this._mediaObject.ssrcs = this._mediaObject.ssrcs.filter(
                            (s) => s.id !== ssrc && s.id !== rtxSsrc,
                        );
                        if (rtxSsrc) {
                            this._mediaObject.ssrcGroups = this._mediaObject.ssrcGroups.filter(
                                (group) => group.ssrcs !== `${ssrc} ${rtxSsrc}`,
                            );
                        }
                    }
                }
                exports.OfferMediaSection = OfferMediaSection;
                function getCodecName(codec) {
                    const MimeTypeRegex = new RegExp('^(audio|video)/(.+)', 'i');
                    const mimeTypeMatch = MimeTypeRegex.exec(codec.mimeType);
                    if (!mimeTypeMatch) {
                        throw new TypeError('invalid codec.mimeType');
                    }
                    return mimeTypeMatch[2];
                }
            },
            { '../../utils': 42, 'sdp-transform': 46 },
        ],
        34: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.RemoteSdp = void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                const Logger_1 = require('../../Logger');
                const MediaSection_1 = require('./MediaSection');
                const logger = new Logger_1.Logger('RemoteSdp');
                class RemoteSdp {
                    constructor({
                        iceParameters,
                        iceCandidates,
                        dtlsParameters,
                        sctpParameters,
                        plainRtpParameters,
                        planB = false,
                    }) {
                        // MediaSection instances with same order as in the SDP.
                        this._mediaSections = [];
                        // MediaSection indices indexed by MID.
                        this._midToIndex = new Map();
                        this._iceParameters = iceParameters;
                        this._iceCandidates = iceCandidates;
                        this._dtlsParameters = dtlsParameters;
                        this._sctpParameters = sctpParameters;
                        this._plainRtpParameters = plainRtpParameters;
                        this._planB = planB;
                        this._sdpObject = {
                            version: 0,
                            origin: {
                                address: '0.0.0.0',
                                ipVer: 4,
                                netType: 'IN',
                                sessionId: 10000,
                                sessionVersion: 0,
                                username: 'mediasoup-client',
                            },
                            name: '-',
                            timing: { start: 0, stop: 0 },
                            media: [],
                        };
                        // If ICE parameters are given, add ICE-Lite indicator.
                        if (iceParameters && iceParameters.iceLite) {
                            this._sdpObject.icelite = 'ice-lite';
                        }
                        // If DTLS parameters are given, assume WebRTC and BUNDLE.
                        if (dtlsParameters) {
                            this._sdpObject.msidSemantic = { semantic: 'WMS', token: '*' };
                            // NOTE: We take the latest fingerprint.
                            const numFingerprints = this._dtlsParameters.fingerprints.length;
                            this._sdpObject.fingerprint = {
                                type: dtlsParameters.fingerprints[numFingerprints - 1].algorithm,
                                hash: dtlsParameters.fingerprints[numFingerprints - 1].value,
                            };
                            this._sdpObject.groups = [{ type: 'BUNDLE', mids: '' }];
                        }
                        // If there are plain RPT parameters, override SDP origin.
                        if (plainRtpParameters) {
                            this._sdpObject.origin.address = plainRtpParameters.ip;
                            this._sdpObject.origin.ipVer = plainRtpParameters.ipVersion;
                        }
                    }
                    updateIceParameters(iceParameters) {
                        logger.debug('updateIceParameters() [iceParameters:%o]', iceParameters);
                        this._iceParameters = iceParameters;
                        this._sdpObject.icelite = iceParameters.iceLite ? 'ice-lite' : undefined;
                        for (const mediaSection of this._mediaSections) {
                            mediaSection.setIceParameters(iceParameters);
                        }
                    }
                    updateDtlsRole(role) {
                        logger.debug('updateDtlsRole() [role:%s]', role);
                        this._dtlsParameters.role = role;
                        for (const mediaSection of this._mediaSections) {
                            mediaSection.setDtlsRole(role);
                        }
                    }
                    getNextMediaSectionIdx() {
                        // If a closed media section is found, return its index.
                        for (let idx = 0; idx < this._mediaSections.length; ++idx) {
                            const mediaSection = this._mediaSections[idx];
                            if (mediaSection.closed) {
                                return { idx, reuseMid: mediaSection.mid };
                            }
                        }
                        // If no closed media section is found, return next one.
                        return { idx: this._mediaSections.length };
                    }
                    send({
                        offerMediaObject,
                        reuseMid,
                        offerRtpParameters,
                        answerRtpParameters,
                        codecOptions,
                        extmapAllowMixed = false,
                    }) {
                        const mediaSection = new MediaSection_1.AnswerMediaSection({
                            iceParameters: this._iceParameters,
                            iceCandidates: this._iceCandidates,
                            dtlsParameters: this._dtlsParameters,
                            plainRtpParameters: this._plainRtpParameters,
                            planB: this._planB,
                            offerMediaObject,
                            offerRtpParameters,
                            answerRtpParameters,
                            codecOptions,
                            extmapAllowMixed,
                        });
                        // Unified-Plan with closed media section replacement.
                        if (reuseMid) {
                            this._replaceMediaSection(mediaSection, reuseMid);
                        }
                        // Unified-Plan or Plan-B with different media kind.
                        else if (!this._midToIndex.has(mediaSection.mid)) {
                            this._addMediaSection(mediaSection);
                        }
                        // Plan-B with same media kind.
                        else {
                            this._replaceMediaSection(mediaSection);
                        }
                    }
                    receive({ mid, kind, offerRtpParameters, streamId, trackId }) {
                        const idx = this._midToIndex.get(mid);
                        let mediaSection;
                        if (idx !== undefined) {
                            mediaSection = this._mediaSections[idx];
                        }
                        // Unified-Plan or different media kind.
                        if (!mediaSection) {
                            mediaSection = new MediaSection_1.OfferMediaSection({
                                iceParameters: this._iceParameters,
                                iceCandidates: this._iceCandidates,
                                dtlsParameters: this._dtlsParameters,
                                plainRtpParameters: this._plainRtpParameters,
                                planB: this._planB,
                                mid,
                                kind,
                                offerRtpParameters,
                                streamId,
                                trackId,
                            });
                            // Let's try to recycle a closed media section (if any).
                            // NOTE: Yes, we can recycle a closed m=audio section with a new m=video.
                            const oldMediaSection = this._mediaSections.find((m) => m.closed);
                            if (oldMediaSection) {
                                this._replaceMediaSection(mediaSection, oldMediaSection.mid);
                            } else {
                                this._addMediaSection(mediaSection);
                            }
                        }
                        // Plan-B.
                        else {
                            mediaSection.planBReceive({ offerRtpParameters, streamId, trackId });
                            this._replaceMediaSection(mediaSection);
                        }
                    }
                    pauseMediaSection(mid) {
                        const mediaSection = this._findMediaSection(mid);
                        mediaSection.pause();
                    }
                    resumeSendingMediaSection(mid) {
                        const mediaSection = this._findMediaSection(mid);
                        mediaSection.resume();
                    }
                    resumeReceivingMediaSection(mid) {
                        const mediaSection = this._findMediaSection(mid);
                        mediaSection.resume();
                    }
                    disableMediaSection(mid) {
                        const mediaSection = this._findMediaSection(mid);
                        mediaSection.disable();
                    }
                    /**
                     * Closes media section. Returns true if the given MID corresponds to a m
                     * section that has been indeed closed. False otherwise.
                     *
                     * NOTE: Closing the first m section is a pain since it invalidates the bundled
                     * transport, so instead closing it we just disable it.
                     */
                    closeMediaSection(mid) {
                        const mediaSection = this._findMediaSection(mid);
                        // NOTE: Closing the first m section is a pain since it invalidates the
                        // bundled transport, so let's avoid it.
                        if (mid === this._firstMid) {
                            logger.debug(
                                'closeMediaSection() | cannot close first media section, disabling it instead [mid:%s]',
                                mid,
                            );
                            this.disableMediaSection(mid);
                            return false;
                        }
                        mediaSection.close();
                        // Regenerate BUNDLE mids.
                        this._regenerateBundleMids();
                        return true;
                    }
                    muxMediaSectionSimulcast(mid, encodings) {
                        const mediaSection = this._findMediaSection(mid);
                        mediaSection.muxSimulcastStreams(encodings);
                        this._replaceMediaSection(mediaSection);
                    }
                    planBStopReceiving({ mid, offerRtpParameters }) {
                        const mediaSection = this._findMediaSection(mid);
                        mediaSection.planBStopReceiving({ offerRtpParameters });
                        this._replaceMediaSection(mediaSection);
                    }
                    sendSctpAssociation({ offerMediaObject }) {
                        const mediaSection = new MediaSection_1.AnswerMediaSection({
                            iceParameters: this._iceParameters,
                            iceCandidates: this._iceCandidates,
                            dtlsParameters: this._dtlsParameters,
                            sctpParameters: this._sctpParameters,
                            plainRtpParameters: this._plainRtpParameters,
                            offerMediaObject,
                        });
                        this._addMediaSection(mediaSection);
                    }
                    receiveSctpAssociation({ oldDataChannelSpec = false } = {}) {
                        const mediaSection = new MediaSection_1.OfferMediaSection({
                            iceParameters: this._iceParameters,
                            iceCandidates: this._iceCandidates,
                            dtlsParameters: this._dtlsParameters,
                            sctpParameters: this._sctpParameters,
                            plainRtpParameters: this._plainRtpParameters,
                            mid: 'datachannel',
                            kind: 'application',
                            oldDataChannelSpec,
                        });
                        this._addMediaSection(mediaSection);
                    }
                    getSdp() {
                        // Increase SDP version.
                        this._sdpObject.origin.sessionVersion++;
                        return sdpTransform.write(this._sdpObject);
                    }
                    _addMediaSection(newMediaSection) {
                        if (!this._firstMid) {
                            this._firstMid = newMediaSection.mid;
                        }
                        // Add to the vector.
                        this._mediaSections.push(newMediaSection);
                        // Add to the map.
                        this._midToIndex.set(newMediaSection.mid, this._mediaSections.length - 1);
                        // Add to the SDP object.
                        this._sdpObject.media.push(newMediaSection.getObject());
                        // Regenerate BUNDLE mids.
                        this._regenerateBundleMids();
                    }
                    _replaceMediaSection(newMediaSection, reuseMid) {
                        // Store it in the map.
                        if (typeof reuseMid === 'string') {
                            const idx = this._midToIndex.get(reuseMid);
                            if (idx === undefined) {
                                throw new Error(`no media section found for reuseMid '${reuseMid}'`);
                            }
                            const oldMediaSection = this._mediaSections[idx];
                            // Replace the index in the vector with the new media section.
                            this._mediaSections[idx] = newMediaSection;
                            // Update the map.
                            this._midToIndex.delete(oldMediaSection.mid);
                            this._midToIndex.set(newMediaSection.mid, idx);
                            // Update the SDP object.
                            this._sdpObject.media[idx] = newMediaSection.getObject();
                            // Regenerate BUNDLE mids.
                            this._regenerateBundleMids();
                        } else {
                            const idx = this._midToIndex.get(newMediaSection.mid);
                            if (idx === undefined) {
                                throw new Error(`no media section found with mid '${newMediaSection.mid}'`);
                            }
                            // Replace the index in the vector with the new media section.
                            this._mediaSections[idx] = newMediaSection;
                            // Update the SDP object.
                            this._sdpObject.media[idx] = newMediaSection.getObject();
                        }
                    }
                    _findMediaSection(mid) {
                        const idx = this._midToIndex.get(mid);
                        if (idx === undefined) {
                            throw new Error(`no media section found with mid '${mid}'`);
                        }
                        return this._mediaSections[idx];
                    }
                    _regenerateBundleMids() {
                        if (!this._dtlsParameters) {
                            return;
                        }
                        this._sdpObject.groups[0].mids = this._mediaSections
                            .filter((mediaSection) => !mediaSection.closed)
                            .map((mediaSection) => mediaSection.mid)
                            .join(' ');
                    }
                }
                exports.RemoteSdp = RemoteSdp;
            },
            { '../../Logger': 12, './MediaSection': 33, 'sdp-transform': 46 },
        ],
        35: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.applyCodecParameters =
                    exports.getCname =
                    exports.extractDtlsParameters =
                    exports.extractRtpCapabilities =
                        void 0;
                const sdpTransform = __importStar(require('sdp-transform'));
                /**
                 * This function must be called with an SDP with 1 m=audio and 1 m=video
                 * sections.
                 */
                function extractRtpCapabilities({ sdpObject }) {
                    // Map of RtpCodecParameters indexed by payload type.
                    const codecsMap = new Map();
                    // Array of RtpHeaderExtensions.
                    const headerExtensions = [];
                    // Whether a m=audio/video section has been already found.
                    let gotAudio = false;
                    let gotVideo = false;
                    for (const m of sdpObject.media) {
                        const kind = m.type;
                        switch (kind) {
                            case 'audio': {
                                if (gotAudio) {
                                    continue;
                                }
                                gotAudio = true;
                                break;
                            }
                            case 'video': {
                                if (gotVideo) {
                                    continue;
                                }
                                gotVideo = true;
                                break;
                            }
                            default: {
                                continue;
                            }
                        }
                        // Get codecs.
                        for (const rtp of m.rtp) {
                            const codec = {
                                kind: kind,
                                mimeType: `${kind}/${rtp.codec}`,
                                preferredPayloadType: rtp.payload,
                                clockRate: rtp.rate,
                                channels: rtp.encoding,
                                parameters: {},
                                rtcpFeedback: [],
                            };
                            codecsMap.set(codec.preferredPayloadType, codec);
                        }
                        // Get codec parameters.
                        for (const fmtp of m.fmtp || []) {
                            const parameters = sdpTransform.parseParams(fmtp.config);
                            const codec = codecsMap.get(fmtp.payload);
                            if (!codec) {
                                continue;
                            }
                            // Specials case to convert parameter value to string.
                            if (parameters && parameters.hasOwnProperty('profile-level-id')) {
                                parameters['profile-level-id'] = String(parameters['profile-level-id']);
                            }
                            codec.parameters = parameters;
                        }
                        // Get RTCP feedback for each codec.
                        for (const fb of m.rtcpFb || []) {
                            const feedback = {
                                type: fb.type,
                                parameter: fb.subtype,
                            };
                            if (!feedback.parameter) {
                                delete feedback.parameter;
                            }
                            // rtcp-fb payload is not '*', so just apply it to its corresponding
                            // codec.
                            if (fb.payload !== '*') {
                                const codec = codecsMap.get(fb.payload);
                                if (!codec) {
                                    continue;
                                }
                                codec.rtcpFeedback.push(feedback);
                            }
                            // If rtcp-fb payload is '*' it must be applied to all codecs with same
                            // kind (with some exceptions such as RTX codec).
                            else {
                                for (const codec of codecsMap.values()) {
                                    if (codec.kind === kind && !/.+\/rtx$/i.test(codec.mimeType)) {
                                        codec.rtcpFeedback.push(feedback);
                                    }
                                }
                            }
                        }
                        // Get RTP header extensions.
                        for (const ext of m.ext || []) {
                            // Ignore encrypted extensions (not yet supported in mediasoup).
                            if (ext['encrypt-uri']) {
                                continue;
                            }
                            const headerExtension = {
                                kind: kind,
                                uri: ext.uri,
                                preferredId: ext.value,
                            };
                            headerExtensions.push(headerExtension);
                        }
                    }
                    const rtpCapabilities = {
                        codecs: Array.from(codecsMap.values()),
                        headerExtensions: headerExtensions,
                    };
                    return rtpCapabilities;
                }
                exports.extractRtpCapabilities = extractRtpCapabilities;
                function extractDtlsParameters({ sdpObject }) {
                    let setup = sdpObject.setup;
                    let fingerprint = sdpObject.fingerprint;
                    if (!setup || !fingerprint) {
                        const mediaObject = (sdpObject.media || []).find((m) => m.port !== 0);
                        if (mediaObject) {
                            setup ?? (setup = mediaObject.setup);
                            fingerprint ?? (fingerprint = mediaObject.fingerprint);
                        }
                    }
                    if (!setup) {
                        throw new Error('no a=setup found at SDP session or media level');
                    } else if (!fingerprint) {
                        throw new Error('no a=fingerprint found at SDP session or media level');
                    }
                    let role;
                    switch (setup) {
                        case 'active': {
                            role = 'client';
                            break;
                        }
                        case 'passive': {
                            role = 'server';
                            break;
                        }
                        case 'actpass': {
                            role = 'auto';
                            break;
                        }
                    }
                    const dtlsParameters = {
                        role,
                        fingerprints: [
                            {
                                algorithm: fingerprint.type,
                                value: fingerprint.hash,
                            },
                        ],
                    };
                    return dtlsParameters;
                }
                exports.extractDtlsParameters = extractDtlsParameters;
                function getCname({ offerMediaObject }) {
                    const ssrcCnameLine = (offerMediaObject.ssrcs || []).find((line) => line.attribute === 'cname');
                    if (!ssrcCnameLine) {
                        return '';
                    }
                    return ssrcCnameLine.value;
                }
                exports.getCname = getCname;
                /**
                 * Apply codec parameters in the given SDP m= section answer based on the
                 * given RTP parameters of an offer.
                 */
                function applyCodecParameters({ offerRtpParameters, answerMediaObject }) {
                    for (const codec of offerRtpParameters.codecs) {
                        const mimeType = codec.mimeType.toLowerCase();
                        // Avoid parsing codec parameters for unhandled codecs.
                        if (mimeType !== 'audio/opus') {
                            continue;
                        }
                        const rtp = (answerMediaObject.rtp || []).find((r) => r.payload === codec.payloadType);
                        if (!rtp) {
                            continue;
                        }
                        // Just in case.
                        answerMediaObject.fmtp = answerMediaObject.fmtp || [];
                        let fmtp = answerMediaObject.fmtp.find((f) => f.payload === codec.payloadType);
                        if (!fmtp) {
                            fmtp = { payload: codec.payloadType, config: '' };
                            answerMediaObject.fmtp.push(fmtp);
                        }
                        const parameters = sdpTransform.parseParams(fmtp.config);
                        switch (mimeType) {
                            case 'audio/opus': {
                                const spropStereo = codec.parameters['sprop-stereo'];
                                if (spropStereo !== undefined) {
                                    parameters.stereo = spropStereo ? 1 : 0;
                                }
                                break;
                            }
                        }
                        // Write the codec fmtp.config back.
                        fmtp.config = '';
                        for (const key of Object.keys(parameters)) {
                            if (fmtp.config) {
                                fmtp.config += ';';
                            }
                            fmtp.config += `${key}=${parameters[key]}`;
                        }
                    }
                }
                exports.applyCodecParameters = applyCodecParameters;
            },
            { 'sdp-transform': 46 },
        ],
        36: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.addLegacySimulcast = exports.getRtpEncodings = void 0;
                function getRtpEncodings({ offerMediaObject, track }) {
                    // First media SSRC (or the only one).
                    let firstSsrc;
                    const ssrcs = new Set();
                    for (const line of offerMediaObject.ssrcs || []) {
                        if (line.attribute !== 'msid') {
                            continue;
                        }
                        const trackId = line.value.split(' ')[1];
                        if (trackId === track.id) {
                            const ssrc = line.id;
                            ssrcs.add(ssrc);
                            if (!firstSsrc) {
                                firstSsrc = ssrc;
                            }
                        }
                    }
                    if (ssrcs.size === 0) {
                        throw new Error(`a=ssrc line with msid information not found [track.id:${track.id}]`);
                    }
                    const ssrcToRtxSsrc = new Map();
                    // First assume RTX is used.
                    for (const line of offerMediaObject.ssrcGroups || []) {
                        if (line.semantics !== 'FID') {
                            continue;
                        }
                        let [ssrc, rtxSsrc] = line.ssrcs.split(/\s+/);
                        ssrc = Number(ssrc);
                        rtxSsrc = Number(rtxSsrc);
                        if (ssrcs.has(ssrc)) {
                            // Remove both the SSRC and RTX SSRC from the set so later we know that they
                            // are already handled.
                            ssrcs.delete(ssrc);
                            ssrcs.delete(rtxSsrc);
                            // Add to the map.
                            ssrcToRtxSsrc.set(ssrc, rtxSsrc);
                        }
                    }
                    // If the set of SSRCs is not empty it means that RTX is not being used, so take
                    // media SSRCs from there.
                    for (const ssrc of ssrcs) {
                        // Add to the map.
                        ssrcToRtxSsrc.set(ssrc, null);
                    }
                    const encodings = [];
                    for (const [ssrc, rtxSsrc] of ssrcToRtxSsrc) {
                        const encoding = { ssrc };
                        if (rtxSsrc) {
                            encoding.rtx = { ssrc: rtxSsrc };
                        }
                        encodings.push(encoding);
                    }
                    return encodings;
                }
                exports.getRtpEncodings = getRtpEncodings;
                /**
                 * Adds multi-ssrc based simulcast into the given SDP media section offer.
                 */
                function addLegacySimulcast({ offerMediaObject, track, numStreams }) {
                    if (numStreams <= 1) {
                        throw new TypeError('numStreams must be greater than 1');
                    }
                    let firstSsrc;
                    let firstRtxSsrc;
                    let streamId;
                    // Get the SSRC.
                    const ssrcMsidLine = (offerMediaObject.ssrcs || []).find((line) => {
                        if (line.attribute !== 'msid') {
                            return false;
                        }
                        const trackId = line.value.split(' ')[1];
                        if (trackId === track.id) {
                            firstSsrc = line.id;
                            streamId = line.value.split(' ')[0];
                            return true;
                        } else {
                            return false;
                        }
                    });
                    if (!ssrcMsidLine) {
                        throw new Error(`a=ssrc line with msid information not found [track.id:${track.id}]`);
                    }
                    // Get the SSRC for RTX.
                    (offerMediaObject.ssrcGroups || []).some((line) => {
                        if (line.semantics !== 'FID') {
                            return false;
                        }
                        const ssrcs = line.ssrcs.split(/\s+/);
                        if (Number(ssrcs[0]) === firstSsrc) {
                            firstRtxSsrc = Number(ssrcs[1]);
                            return true;
                        } else {
                            return false;
                        }
                    });
                    const ssrcCnameLine = offerMediaObject.ssrcs.find(
                        (line) => line.attribute === 'cname' && line.id === firstSsrc,
                    );
                    if (!ssrcCnameLine) {
                        throw new Error(`a=ssrc line with cname information not found [track.id:${track.id}]`);
                    }
                    const cname = ssrcCnameLine.value;
                    const ssrcs = [];
                    const rtxSsrcs = [];
                    for (let i = 0; i < numStreams; ++i) {
                        ssrcs.push(firstSsrc + i);
                        if (firstRtxSsrc) {
                            rtxSsrcs.push(firstRtxSsrc + i);
                        }
                    }
                    offerMediaObject.ssrcGroups = offerMediaObject.ssrcGroups || [];
                    offerMediaObject.ssrcs = offerMediaObject.ssrcs || [];
                    offerMediaObject.ssrcGroups.push({
                        semantics: 'SIM',
                        ssrcs: ssrcs.join(' '),
                    });
                    for (let i = 0; i < ssrcs.length; ++i) {
                        const ssrc = ssrcs[i];
                        offerMediaObject.ssrcs.push({
                            id: ssrc,
                            attribute: 'cname',
                            value: cname,
                        });
                        offerMediaObject.ssrcs.push({
                            id: ssrc,
                            attribute: 'msid',
                            value: `${streamId} ${track.id}`,
                        });
                    }
                    for (let i = 0; i < rtxSsrcs.length; ++i) {
                        const ssrc = ssrcs[i];
                        const rtxSsrc = rtxSsrcs[i];
                        offerMediaObject.ssrcs.push({
                            id: rtxSsrc,
                            attribute: 'cname',
                            value: cname,
                        });
                        offerMediaObject.ssrcs.push({
                            id: rtxSsrc,
                            attribute: 'msid',
                            value: `${streamId} ${track.id}`,
                        });
                        offerMediaObject.ssrcGroups.push({
                            semantics: 'FID',
                            ssrcs: `${ssrc} ${rtxSsrc}`,
                        });
                    }
                }
                exports.addLegacySimulcast = addLegacySimulcast;
            },
            {},
        ],
        37: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.addLegacySimulcast = exports.getRtpEncodings = void 0;
                function getRtpEncodings({ offerMediaObject }) {
                    const ssrcs = new Set();
                    for (const line of offerMediaObject.ssrcs || []) {
                        const ssrc = line.id;
                        ssrcs.add(ssrc);
                    }
                    if (ssrcs.size === 0) {
                        throw new Error('no a=ssrc lines found');
                    }
                    const ssrcToRtxSsrc = new Map();
                    // First assume RTX is used.
                    for (const line of offerMediaObject.ssrcGroups || []) {
                        if (line.semantics !== 'FID') {
                            continue;
                        }
                        let [ssrc, rtxSsrc] = line.ssrcs.split(/\s+/);
                        ssrc = Number(ssrc);
                        rtxSsrc = Number(rtxSsrc);
                        if (ssrcs.has(ssrc)) {
                            // Remove both the SSRC and RTX SSRC from the set so later we know
                            // that they are already handled.
                            ssrcs.delete(ssrc);
                            ssrcs.delete(rtxSsrc);
                            // Add to the map.
                            ssrcToRtxSsrc.set(ssrc, rtxSsrc);
                        }
                    }
                    // If the set of SSRCs is not empty it means that RTX is not being used, so
                    // take media SSRCs from there.
                    for (const ssrc of ssrcs) {
                        // Add to the map.
                        ssrcToRtxSsrc.set(ssrc, null);
                    }
                    const encodings = [];
                    for (const [ssrc, rtxSsrc] of ssrcToRtxSsrc) {
                        const encoding = { ssrc };
                        if (rtxSsrc) {
                            encoding.rtx = { ssrc: rtxSsrc };
                        }
                        encodings.push(encoding);
                    }
                    return encodings;
                }
                exports.getRtpEncodings = getRtpEncodings;
                /**
                 * Adds multi-ssrc based simulcast into the given SDP media section offer.
                 */
                function addLegacySimulcast({ offerMediaObject, numStreams }) {
                    if (numStreams <= 1) {
                        throw new TypeError('numStreams must be greater than 1');
                    }
                    // Get the SSRC.
                    const ssrcMsidLine = (offerMediaObject.ssrcs || []).find((line) => line.attribute === 'msid');
                    if (!ssrcMsidLine) {
                        throw new Error('a=ssrc line with msid information not found');
                    }
                    const [streamId, trackId] = ssrcMsidLine.value.split(' ');
                    const firstSsrc = ssrcMsidLine.id;
                    let firstRtxSsrc;
                    // Get the SSRC for RTX.
                    (offerMediaObject.ssrcGroups || []).some((line) => {
                        if (line.semantics !== 'FID') {
                            return false;
                        }
                        const ssrcs = line.ssrcs.split(/\s+/);
                        if (Number(ssrcs[0]) === firstSsrc) {
                            firstRtxSsrc = Number(ssrcs[1]);
                            return true;
                        } else {
                            return false;
                        }
                    });
                    const ssrcCnameLine = offerMediaObject.ssrcs.find((line) => line.attribute === 'cname');
                    if (!ssrcCnameLine) {
                        throw new Error('a=ssrc line with cname information not found');
                    }
                    const cname = ssrcCnameLine.value;
                    const ssrcs = [];
                    const rtxSsrcs = [];
                    for (let i = 0; i < numStreams; ++i) {
                        ssrcs.push(firstSsrc + i);
                        if (firstRtxSsrc) {
                            rtxSsrcs.push(firstRtxSsrc + i);
                        }
                    }
                    offerMediaObject.ssrcGroups = [];
                    offerMediaObject.ssrcs = [];
                    offerMediaObject.ssrcGroups.push({
                        semantics: 'SIM',
                        ssrcs: ssrcs.join(' '),
                    });
                    for (let i = 0; i < ssrcs.length; ++i) {
                        const ssrc = ssrcs[i];
                        offerMediaObject.ssrcs.push({
                            id: ssrc,
                            attribute: 'cname',
                            value: cname,
                        });
                        offerMediaObject.ssrcs.push({
                            id: ssrc,
                            attribute: 'msid',
                            value: `${streamId} ${trackId}`,
                        });
                    }
                    for (let i = 0; i < rtxSsrcs.length; ++i) {
                        const ssrc = ssrcs[i];
                        const rtxSsrc = rtxSsrcs[i];
                        offerMediaObject.ssrcs.push({
                            id: rtxSsrc,
                            attribute: 'cname',
                            value: cname,
                        });
                        offerMediaObject.ssrcs.push({
                            id: rtxSsrc,
                            attribute: 'msid',
                            value: `${streamId} ${trackId}`,
                        });
                        offerMediaObject.ssrcGroups.push({
                            semantics: 'FID',
                            ssrcs: `${ssrc} ${rtxSsrc}`,
                        });
                    }
                }
                exports.addLegacySimulcast = addLegacySimulcast;
            },
            {},
        ],
        38: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                var __importDefault =
                    (this && this.__importDefault) ||
                    function (mod) {
                        return mod && mod.__esModule ? mod : { default: mod };
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.debug =
                    exports.parseScalabilityMode =
                    exports.detectDevice =
                    exports.Device =
                    exports.version =
                    exports.types =
                        void 0;
                const debug_1 = __importDefault(require('debug'));
                exports.debug = debug_1.default;
                const Device_1 = require('./Device');
                Object.defineProperty(exports, 'Device', {
                    enumerable: true,
                    get: function () {
                        return Device_1.Device;
                    },
                });
                Object.defineProperty(exports, 'detectDevice', {
                    enumerable: true,
                    get: function () {
                        return Device_1.detectDevice;
                    },
                });
                const types = __importStar(require('./types'));
                exports.types = types;
                /**
                 * Expose mediasoup-client version.
                 */
                exports.version = '3.7.6';
                /**
                 * Expose parseScalabilityMode() function.
                 */
                var scalabilityModes_1 = require('./scalabilityModes');
                Object.defineProperty(exports, 'parseScalabilityMode', {
                    enumerable: true,
                    get: function () {
                        return scalabilityModes_1.parse;
                    },
                });
            },
            { './Device': 10, './scalabilityModes': 40, './types': 41, debug: 3 },
        ],
        39: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __setModuleDefault =
                    (this && this.__setModuleDefault) ||
                    (Object.create
                        ? function (o, v) {
                              Object.defineProperty(o, 'default', { enumerable: true, value: v });
                          }
                        : function (o, v) {
                              o['default'] = v;
                          });
                var __importStar =
                    (this && this.__importStar) ||
                    function (mod) {
                        if (mod && mod.__esModule) return mod;
                        var result = {};
                        if (mod != null)
                            for (var k in mod)
                                if (k !== 'default' && Object.prototype.hasOwnProperty.call(mod, k))
                                    __createBinding(result, mod, k);
                        __setModuleDefault(result, mod);
                        return result;
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.canReceive =
                    exports.canSend =
                    exports.generateProbatorRtpParameters =
                    exports.reduceCodecs =
                    exports.getSendingRemoteRtpParameters =
                    exports.getSendingRtpParameters =
                    exports.getRecvRtpCapabilities =
                    exports.getExtendedRtpCapabilities =
                    exports.validateSctpCapabilities =
                    exports.validateSctpStreamParameters =
                    exports.validateRtpParameters =
                    exports.validateRtpCapabilities =
                        void 0;
                const h264 = __importStar(require('h264-profile-level-id'));
                const utils = __importStar(require('./utils'));
                const RTP_PROBATOR_MID = 'probator';
                const RTP_PROBATOR_SSRC = 1234;
                const RTP_PROBATOR_CODEC_PAYLOAD_TYPE = 127;
                /**
                 * Validates RtpCapabilities. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtpCapabilities(caps) {
                    if (typeof caps !== 'object') {
                        throw new TypeError('caps is not an object');
                    }
                    // codecs is optional. If unset, fill with an empty array.
                    if (caps.codecs && !Array.isArray(caps.codecs)) {
                        throw new TypeError('caps.codecs is not an array');
                    } else if (!caps.codecs) {
                        caps.codecs = [];
                    }
                    for (const codec of caps.codecs) {
                        validateRtpCodecCapability(codec);
                    }
                    // headerExtensions is optional. If unset, fill with an empty array.
                    if (caps.headerExtensions && !Array.isArray(caps.headerExtensions)) {
                        throw new TypeError('caps.headerExtensions is not an array');
                    } else if (!caps.headerExtensions) {
                        caps.headerExtensions = [];
                    }
                    for (const ext of caps.headerExtensions) {
                        validateRtpHeaderExtension(ext);
                    }
                }
                exports.validateRtpCapabilities = validateRtpCapabilities;
                /**
                 * Validates RtpParameters. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtpParameters(params) {
                    if (typeof params !== 'object') {
                        throw new TypeError('params is not an object');
                    }
                    // mid is optional.
                    if (params.mid && typeof params.mid !== 'string') {
                        throw new TypeError('params.mid is not a string');
                    }
                    // codecs is mandatory.
                    if (!Array.isArray(params.codecs)) {
                        throw new TypeError('missing params.codecs');
                    }
                    for (const codec of params.codecs) {
                        validateRtpCodecParameters(codec);
                    }
                    // headerExtensions is optional. If unset, fill with an empty array.
                    if (params.headerExtensions && !Array.isArray(params.headerExtensions)) {
                        throw new TypeError('params.headerExtensions is not an array');
                    } else if (!params.headerExtensions) {
                        params.headerExtensions = [];
                    }
                    for (const ext of params.headerExtensions) {
                        validateRtpHeaderExtensionParameters(ext);
                    }
                    // encodings is optional. If unset, fill with an empty array.
                    if (params.encodings && !Array.isArray(params.encodings)) {
                        throw new TypeError('params.encodings is not an array');
                    } else if (!params.encodings) {
                        params.encodings = [];
                    }
                    for (const encoding of params.encodings) {
                        validateRtpEncodingParameters(encoding);
                    }
                    // rtcp is optional. If unset, fill with an empty object.
                    if (params.rtcp && typeof params.rtcp !== 'object') {
                        throw new TypeError('params.rtcp is not an object');
                    } else if (!params.rtcp) {
                        params.rtcp = {};
                    }
                    validateRtcpParameters(params.rtcp);
                }
                exports.validateRtpParameters = validateRtpParameters;
                /**
                 * Validates SctpStreamParameters. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateSctpStreamParameters(params) {
                    if (typeof params !== 'object') {
                        throw new TypeError('params is not an object');
                    }
                    // streamId is mandatory.
                    if (typeof params.streamId !== 'number') {
                        throw new TypeError('missing params.streamId');
                    }
                    // ordered is optional.
                    let orderedGiven = false;
                    if (typeof params.ordered === 'boolean') {
                        orderedGiven = true;
                    } else {
                        params.ordered = true;
                    }
                    // maxPacketLifeTime is optional.
                    if (params.maxPacketLifeTime && typeof params.maxPacketLifeTime !== 'number') {
                        throw new TypeError('invalid params.maxPacketLifeTime');
                    }
                    // maxRetransmits is optional.
                    if (params.maxRetransmits && typeof params.maxRetransmits !== 'number') {
                        throw new TypeError('invalid params.maxRetransmits');
                    }
                    if (params.maxPacketLifeTime && params.maxRetransmits) {
                        throw new TypeError('cannot provide both maxPacketLifeTime and maxRetransmits');
                    }
                    if (orderedGiven && params.ordered && (params.maxPacketLifeTime || params.maxRetransmits)) {
                        throw new TypeError('cannot be ordered with maxPacketLifeTime or maxRetransmits');
                    } else if (!orderedGiven && (params.maxPacketLifeTime || params.maxRetransmits)) {
                        params.ordered = false;
                    }
                    // label is optional.
                    if (params.label && typeof params.label !== 'string') {
                        throw new TypeError('invalid params.label');
                    }
                    // protocol is optional.
                    if (params.protocol && typeof params.protocol !== 'string') {
                        throw new TypeError('invalid params.protocol');
                    }
                }
                exports.validateSctpStreamParameters = validateSctpStreamParameters;
                /**
                 * Validates SctpCapabilities. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateSctpCapabilities(caps) {
                    if (typeof caps !== 'object') {
                        throw new TypeError('caps is not an object');
                    }
                    // numStreams is mandatory.
                    if (!caps.numStreams || typeof caps.numStreams !== 'object') {
                        throw new TypeError('missing caps.numStreams');
                    }
                    validateNumSctpStreams(caps.numStreams);
                }
                exports.validateSctpCapabilities = validateSctpCapabilities;
                /**
                 * Generate extended RTP capabilities for sending and receiving.
                 */
                function getExtendedRtpCapabilities(localCaps, remoteCaps) {
                    const extendedRtpCapabilities = {
                        codecs: [],
                        headerExtensions: [],
                    };
                    // Match media codecs and keep the order preferred by remoteCaps.
                    for (const remoteCodec of remoteCaps.codecs || []) {
                        if (isRtxCodec(remoteCodec)) {
                            continue;
                        }
                        const matchingLocalCodec = (localCaps.codecs || []).find((localCodec) =>
                            matchCodecs(localCodec, remoteCodec, { strict: true, modify: true }),
                        );
                        if (!matchingLocalCodec) {
                            continue;
                        }
                        const extendedCodec = {
                            mimeType: matchingLocalCodec.mimeType,
                            kind: matchingLocalCodec.kind,
                            clockRate: matchingLocalCodec.clockRate,
                            channels: matchingLocalCodec.channels,
                            localPayloadType: matchingLocalCodec.preferredPayloadType,
                            localRtxPayloadType: undefined,
                            remotePayloadType: remoteCodec.preferredPayloadType,
                            remoteRtxPayloadType: undefined,
                            localParameters: matchingLocalCodec.parameters,
                            remoteParameters: remoteCodec.parameters,
                            rtcpFeedback: reduceRtcpFeedback(matchingLocalCodec, remoteCodec),
                        };
                        extendedRtpCapabilities.codecs.push(extendedCodec);
                    }
                    // Match RTX codecs.
                    for (const extendedCodec of extendedRtpCapabilities.codecs) {
                        const matchingLocalRtxCodec = localCaps.codecs.find(
                            (localCodec) =>
                                isRtxCodec(localCodec) && localCodec.parameters.apt === extendedCodec.localPayloadType,
                        );
                        const matchingRemoteRtxCodec = remoteCaps.codecs.find(
                            (remoteCodec) =>
                                isRtxCodec(remoteCodec) &&
                                remoteCodec.parameters.apt === extendedCodec.remotePayloadType,
                        );
                        if (matchingLocalRtxCodec && matchingRemoteRtxCodec) {
                            extendedCodec.localRtxPayloadType = matchingLocalRtxCodec.preferredPayloadType;
                            extendedCodec.remoteRtxPayloadType = matchingRemoteRtxCodec.preferredPayloadType;
                        }
                    }
                    // Match header extensions.
                    for (const remoteExt of remoteCaps.headerExtensions) {
                        const matchingLocalExt = localCaps.headerExtensions.find((localExt) =>
                            matchHeaderExtensions(localExt, remoteExt),
                        );
                        if (!matchingLocalExt) {
                            continue;
                        }
                        const extendedExt = {
                            kind: remoteExt.kind,
                            uri: remoteExt.uri,
                            sendId: matchingLocalExt.preferredId,
                            recvId: remoteExt.preferredId,
                            encrypt: matchingLocalExt.preferredEncrypt,
                            direction: 'sendrecv',
                        };
                        switch (remoteExt.direction) {
                            case 'sendrecv': {
                                extendedExt.direction = 'sendrecv';
                                break;
                            }
                            case 'recvonly': {
                                extendedExt.direction = 'sendonly';
                                break;
                            }
                            case 'sendonly': {
                                extendedExt.direction = 'recvonly';
                                break;
                            }
                            case 'inactive': {
                                extendedExt.direction = 'inactive';
                                break;
                            }
                        }
                        extendedRtpCapabilities.headerExtensions.push(extendedExt);
                    }
                    return extendedRtpCapabilities;
                }
                exports.getExtendedRtpCapabilities = getExtendedRtpCapabilities;
                /**
                 * Generate RTP capabilities for receiving media based on the given extended
                 * RTP capabilities.
                 */
                function getRecvRtpCapabilities(extendedRtpCapabilities) {
                    const rtpCapabilities = {
                        codecs: [],
                        headerExtensions: [],
                    };
                    for (const extendedCodec of extendedRtpCapabilities.codecs) {
                        const codec = {
                            mimeType: extendedCodec.mimeType,
                            kind: extendedCodec.kind,
                            preferredPayloadType: extendedCodec.remotePayloadType,
                            clockRate: extendedCodec.clockRate,
                            channels: extendedCodec.channels,
                            parameters: extendedCodec.localParameters,
                            rtcpFeedback: extendedCodec.rtcpFeedback,
                        };
                        rtpCapabilities.codecs.push(codec);
                        // Add RTX codec.
                        if (!extendedCodec.remoteRtxPayloadType) {
                            continue;
                        }
                        const rtxCodec = {
                            mimeType: `${extendedCodec.kind}/rtx`,
                            kind: extendedCodec.kind,
                            preferredPayloadType: extendedCodec.remoteRtxPayloadType,
                            clockRate: extendedCodec.clockRate,
                            parameters: {
                                apt: extendedCodec.remotePayloadType,
                            },
                            rtcpFeedback: [],
                        };
                        rtpCapabilities.codecs.push(rtxCodec);
                        // TODO: In the future, we need to add FEC, CN, etc, codecs.
                    }
                    for (const extendedExtension of extendedRtpCapabilities.headerExtensions) {
                        // Ignore RTP extensions not valid for receiving.
                        if (extendedExtension.direction !== 'sendrecv' && extendedExtension.direction !== 'recvonly') {
                            continue;
                        }
                        const ext = {
                            kind: extendedExtension.kind,
                            uri: extendedExtension.uri,
                            preferredId: extendedExtension.recvId,
                            preferredEncrypt: extendedExtension.encrypt,
                            direction: extendedExtension.direction,
                        };
                        rtpCapabilities.headerExtensions.push(ext);
                    }
                    return rtpCapabilities;
                }
                exports.getRecvRtpCapabilities = getRecvRtpCapabilities;
                /**
                 * Generate RTP parameters of the given kind for sending media.
                 * NOTE: mid, encodings and rtcp fields are left empty.
                 */
                function getSendingRtpParameters(kind, extendedRtpCapabilities) {
                    const rtpParameters = {
                        mid: undefined,
                        codecs: [],
                        headerExtensions: [],
                        encodings: [],
                        rtcp: {},
                    };
                    for (const extendedCodec of extendedRtpCapabilities.codecs) {
                        if (extendedCodec.kind !== kind) {
                            continue;
                        }
                        const codec = {
                            mimeType: extendedCodec.mimeType,
                            payloadType: extendedCodec.localPayloadType,
                            clockRate: extendedCodec.clockRate,
                            channels: extendedCodec.channels,
                            parameters: extendedCodec.localParameters,
                            rtcpFeedback: extendedCodec.rtcpFeedback,
                        };
                        rtpParameters.codecs.push(codec);
                        // Add RTX codec.
                        if (extendedCodec.localRtxPayloadType) {
                            const rtxCodec = {
                                mimeType: `${extendedCodec.kind}/rtx`,
                                payloadType: extendedCodec.localRtxPayloadType,
                                clockRate: extendedCodec.clockRate,
                                parameters: {
                                    apt: extendedCodec.localPayloadType,
                                },
                                rtcpFeedback: [],
                            };
                            rtpParameters.codecs.push(rtxCodec);
                        }
                    }
                    for (const extendedExtension of extendedRtpCapabilities.headerExtensions) {
                        // Ignore RTP extensions of a different kind and those not valid for sending.
                        if (
                            (extendedExtension.kind && extendedExtension.kind !== kind) ||
                            (extendedExtension.direction !== 'sendrecv' && extendedExtension.direction !== 'sendonly')
                        ) {
                            continue;
                        }
                        const ext = {
                            uri: extendedExtension.uri,
                            id: extendedExtension.sendId,
                            encrypt: extendedExtension.encrypt,
                            parameters: {},
                        };
                        rtpParameters.headerExtensions.push(ext);
                    }
                    return rtpParameters;
                }
                exports.getSendingRtpParameters = getSendingRtpParameters;
                /**
                 * Generate RTP parameters of the given kind suitable for the remote SDP answer.
                 */
                function getSendingRemoteRtpParameters(kind, extendedRtpCapabilities) {
                    const rtpParameters = {
                        mid: undefined,
                        codecs: [],
                        headerExtensions: [],
                        encodings: [],
                        rtcp: {},
                    };
                    for (const extendedCodec of extendedRtpCapabilities.codecs) {
                        if (extendedCodec.kind !== kind) {
                            continue;
                        }
                        const codec = {
                            mimeType: extendedCodec.mimeType,
                            payloadType: extendedCodec.localPayloadType,
                            clockRate: extendedCodec.clockRate,
                            channels: extendedCodec.channels,
                            parameters: extendedCodec.remoteParameters,
                            rtcpFeedback: extendedCodec.rtcpFeedback,
                        };
                        rtpParameters.codecs.push(codec);
                        // Add RTX codec.
                        if (extendedCodec.localRtxPayloadType) {
                            const rtxCodec = {
                                mimeType: `${extendedCodec.kind}/rtx`,
                                payloadType: extendedCodec.localRtxPayloadType,
                                clockRate: extendedCodec.clockRate,
                                parameters: {
                                    apt: extendedCodec.localPayloadType,
                                },
                                rtcpFeedback: [],
                            };
                            rtpParameters.codecs.push(rtxCodec);
                        }
                    }
                    for (const extendedExtension of extendedRtpCapabilities.headerExtensions) {
                        // Ignore RTP extensions of a different kind and those not valid for sending.
                        if (
                            (extendedExtension.kind && extendedExtension.kind !== kind) ||
                            (extendedExtension.direction !== 'sendrecv' && extendedExtension.direction !== 'sendonly')
                        ) {
                            continue;
                        }
                        const ext = {
                            uri: extendedExtension.uri,
                            id: extendedExtension.sendId,
                            encrypt: extendedExtension.encrypt,
                            parameters: {},
                        };
                        rtpParameters.headerExtensions.push(ext);
                    }
                    // Reduce codecs' RTCP feedback. Use Transport-CC if available, REMB otherwise.
                    if (
                        rtpParameters.headerExtensions.some(
                            (ext) =>
                                ext.uri === 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01',
                        )
                    ) {
                        for (const codec of rtpParameters.codecs) {
                            codec.rtcpFeedback = (codec.rtcpFeedback || []).filter((fb) => fb.type !== 'goog-remb');
                        }
                    } else if (
                        rtpParameters.headerExtensions.some(
                            (ext) => ext.uri === 'http://www.webrtc.org/experiments/rtp-hdrext/abs-send-time',
                        )
                    ) {
                        for (const codec of rtpParameters.codecs) {
                            codec.rtcpFeedback = (codec.rtcpFeedback || []).filter((fb) => fb.type !== 'transport-cc');
                        }
                    } else {
                        for (const codec of rtpParameters.codecs) {
                            codec.rtcpFeedback = (codec.rtcpFeedback || []).filter(
                                (fb) => fb.type !== 'transport-cc' && fb.type !== 'goog-remb',
                            );
                        }
                    }
                    return rtpParameters;
                }
                exports.getSendingRemoteRtpParameters = getSendingRemoteRtpParameters;
                /**
                 * Reduce given codecs by returning an array of codecs "compatible" with the
                 * given capability codec. If no capability codec is given, take the first
                 * one(s).
                 *
                 * Given codecs must be generated by ortc.getSendingRtpParameters() or
                 * ortc.getSendingRemoteRtpParameters().
                 *
                 * The returned array of codecs also include a RTX codec if available.
                 */
                function reduceCodecs(codecs, capCodec) {
                    const filteredCodecs = [];
                    // If no capability codec is given, take the first one (and RTX).
                    if (!capCodec) {
                        filteredCodecs.push(codecs[0]);
                        if (isRtxCodec(codecs[1])) {
                            filteredCodecs.push(codecs[1]);
                        }
                    }
                    // Otherwise look for a compatible set of codecs.
                    else {
                        for (let idx = 0; idx < codecs.length; ++idx) {
                            if (matchCodecs(codecs[idx], capCodec)) {
                                filteredCodecs.push(codecs[idx]);
                                if (isRtxCodec(codecs[idx + 1])) {
                                    filteredCodecs.push(codecs[idx + 1]);
                                }
                                break;
                            }
                        }
                        if (filteredCodecs.length === 0) {
                            throw new TypeError('no matching codec found');
                        }
                    }
                    return filteredCodecs;
                }
                exports.reduceCodecs = reduceCodecs;
                /**
                 * Create RTP parameters for a Consumer for the RTP probator.
                 */
                function generateProbatorRtpParameters(videoRtpParameters) {
                    // Clone given reference video RTP parameters.
                    videoRtpParameters = utils.clone(videoRtpParameters);
                    // This may throw.
                    validateRtpParameters(videoRtpParameters);
                    const rtpParameters = {
                        mid: RTP_PROBATOR_MID,
                        codecs: [],
                        headerExtensions: [],
                        encodings: [{ ssrc: RTP_PROBATOR_SSRC }],
                        rtcp: { cname: 'probator' },
                    };
                    rtpParameters.codecs.push(videoRtpParameters.codecs[0]);
                    rtpParameters.codecs[0].payloadType = RTP_PROBATOR_CODEC_PAYLOAD_TYPE;
                    rtpParameters.headerExtensions = videoRtpParameters.headerExtensions;
                    return rtpParameters;
                }
                exports.generateProbatorRtpParameters = generateProbatorRtpParameters;
                /**
                 * Whether media can be sent based on the given RTP capabilities.
                 */
                function canSend(kind, extendedRtpCapabilities) {
                    return extendedRtpCapabilities.codecs.some((codec) => codec.kind === kind);
                }
                exports.canSend = canSend;
                /**
                 * Whether the given RTP parameters can be received with the given RTP
                 * capabilities.
                 */
                function canReceive(rtpParameters, extendedRtpCapabilities) {
                    // This may throw.
                    validateRtpParameters(rtpParameters);
                    if (rtpParameters.codecs.length === 0) {
                        return false;
                    }
                    const firstMediaCodec = rtpParameters.codecs[0];
                    return extendedRtpCapabilities.codecs.some(
                        (codec) => codec.remotePayloadType === firstMediaCodec.payloadType,
                    );
                }
                exports.canReceive = canReceive;
                /**
                 * Validates RtpCodecCapability. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtpCodecCapability(codec) {
                    const MimeTypeRegex = new RegExp('^(audio|video)/(.+)', 'i');
                    if (typeof codec !== 'object') {
                        throw new TypeError('codec is not an object');
                    }
                    // mimeType is mandatory.
                    if (!codec.mimeType || typeof codec.mimeType !== 'string') {
                        throw new TypeError('missing codec.mimeType');
                    }
                    const mimeTypeMatch = MimeTypeRegex.exec(codec.mimeType);
                    if (!mimeTypeMatch) {
                        throw new TypeError('invalid codec.mimeType');
                    }
                    // Just override kind with media component of mimeType.
                    codec.kind = mimeTypeMatch[1].toLowerCase();
                    // preferredPayloadType is optional.
                    if (codec.preferredPayloadType && typeof codec.preferredPayloadType !== 'number') {
                        throw new TypeError('invalid codec.preferredPayloadType');
                    }
                    // clockRate is mandatory.
                    if (typeof codec.clockRate !== 'number') {
                        throw new TypeError('missing codec.clockRate');
                    }
                    // channels is optional. If unset, set it to 1 (just if audio).
                    if (codec.kind === 'audio') {
                        if (typeof codec.channels !== 'number') {
                            codec.channels = 1;
                        }
                    } else {
                        delete codec.channels;
                    }
                    // parameters is optional. If unset, set it to an empty object.
                    if (!codec.parameters || typeof codec.parameters !== 'object') {
                        codec.parameters = {};
                    }
                    for (const key of Object.keys(codec.parameters)) {
                        let value = codec.parameters[key];
                        if (value === undefined) {
                            codec.parameters[key] = '';
                            value = '';
                        }
                        if (typeof value !== 'string' && typeof value !== 'number') {
                            throw new TypeError(`invalid codec parameter [key:${key}s, value:${value}]`);
                        }
                        // Specific parameters validation.
                        if (key === 'apt') {
                            if (typeof value !== 'number') {
                                throw new TypeError('invalid codec apt parameter');
                            }
                        }
                    }
                    // rtcpFeedback is optional. If unset, set it to an empty array.
                    if (!codec.rtcpFeedback || !Array.isArray(codec.rtcpFeedback)) {
                        codec.rtcpFeedback = [];
                    }
                    for (const fb of codec.rtcpFeedback) {
                        validateRtcpFeedback(fb);
                    }
                }
                /**
                 * Validates RtcpFeedback. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtcpFeedback(fb) {
                    if (typeof fb !== 'object') {
                        throw new TypeError('fb is not an object');
                    }
                    // type is mandatory.
                    if (!fb.type || typeof fb.type !== 'string') {
                        throw new TypeError('missing fb.type');
                    }
                    // parameter is optional. If unset set it to an empty string.
                    if (!fb.parameter || typeof fb.parameter !== 'string') {
                        fb.parameter = '';
                    }
                }
                /**
                 * Validates RtpHeaderExtension. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtpHeaderExtension(ext) {
                    if (typeof ext !== 'object') {
                        throw new TypeError('ext is not an object');
                    }
                    // kind is mandatory.
                    if (ext.kind !== 'audio' && ext.kind !== 'video') {
                        throw new TypeError('invalid ext.kind');
                    }
                    // uri is mandatory.
                    if (!ext.uri || typeof ext.uri !== 'string') {
                        throw new TypeError('missing ext.uri');
                    }
                    // preferredId is mandatory.
                    if (typeof ext.preferredId !== 'number') {
                        throw new TypeError('missing ext.preferredId');
                    }
                    // preferredEncrypt is optional. If unset set it to false.
                    if (ext.preferredEncrypt && typeof ext.preferredEncrypt !== 'boolean') {
                        throw new TypeError('invalid ext.preferredEncrypt');
                    } else if (!ext.preferredEncrypt) {
                        ext.preferredEncrypt = false;
                    }
                    // direction is optional. If unset set it to sendrecv.
                    if (ext.direction && typeof ext.direction !== 'string') {
                        throw new TypeError('invalid ext.direction');
                    } else if (!ext.direction) {
                        ext.direction = 'sendrecv';
                    }
                }
                /**
                 * Validates RtpCodecParameters. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtpCodecParameters(codec) {
                    const MimeTypeRegex = new RegExp('^(audio|video)/(.+)', 'i');
                    if (typeof codec !== 'object') {
                        throw new TypeError('codec is not an object');
                    }
                    // mimeType is mandatory.
                    if (!codec.mimeType || typeof codec.mimeType !== 'string') {
                        throw new TypeError('missing codec.mimeType');
                    }
                    const mimeTypeMatch = MimeTypeRegex.exec(codec.mimeType);
                    if (!mimeTypeMatch) {
                        throw new TypeError('invalid codec.mimeType');
                    }
                    // payloadType is mandatory.
                    if (typeof codec.payloadType !== 'number') {
                        throw new TypeError('missing codec.payloadType');
                    }
                    // clockRate is mandatory.
                    if (typeof codec.clockRate !== 'number') {
                        throw new TypeError('missing codec.clockRate');
                    }
                    const kind = mimeTypeMatch[1].toLowerCase();
                    // channels is optional. If unset, set it to 1 (just if audio).
                    if (kind === 'audio') {
                        if (typeof codec.channels !== 'number') {
                            codec.channels = 1;
                        }
                    } else {
                        delete codec.channels;
                    }
                    // parameters is optional. If unset, set it to an empty object.
                    if (!codec.parameters || typeof codec.parameters !== 'object') {
                        codec.parameters = {};
                    }
                    for (const key of Object.keys(codec.parameters)) {
                        let value = codec.parameters[key];
                        if (value === undefined) {
                            codec.parameters[key] = '';
                            value = '';
                        }
                        if (typeof value !== 'string' && typeof value !== 'number') {
                            throw new TypeError(`invalid codec parameter [key:${key}s, value:${value}]`);
                        }
                        // Specific parameters validation.
                        if (key === 'apt') {
                            if (typeof value !== 'number') {
                                throw new TypeError('invalid codec apt parameter');
                            }
                        }
                    }
                    // rtcpFeedback is optional. If unset, set it to an empty array.
                    if (!codec.rtcpFeedback || !Array.isArray(codec.rtcpFeedback)) {
                        codec.rtcpFeedback = [];
                    }
                    for (const fb of codec.rtcpFeedback) {
                        validateRtcpFeedback(fb);
                    }
                }
                /**
                 * Validates RtpHeaderExtensionParameteters. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtpHeaderExtensionParameters(ext) {
                    if (typeof ext !== 'object') {
                        throw new TypeError('ext is not an object');
                    }
                    // uri is mandatory.
                    if (!ext.uri || typeof ext.uri !== 'string') {
                        throw new TypeError('missing ext.uri');
                    }
                    // id is mandatory.
                    if (typeof ext.id !== 'number') {
                        throw new TypeError('missing ext.id');
                    }
                    // encrypt is optional. If unset set it to false.
                    if (ext.encrypt && typeof ext.encrypt !== 'boolean') {
                        throw new TypeError('invalid ext.encrypt');
                    } else if (!ext.encrypt) {
                        ext.encrypt = false;
                    }
                    // parameters is optional. If unset, set it to an empty object.
                    if (!ext.parameters || typeof ext.parameters !== 'object') {
                        ext.parameters = {};
                    }
                    for (const key of Object.keys(ext.parameters)) {
                        let value = ext.parameters[key];
                        if (value === undefined) {
                            ext.parameters[key] = '';
                            value = '';
                        }
                        if (typeof value !== 'string' && typeof value !== 'number') {
                            throw new TypeError('invalid header extension parameter');
                        }
                    }
                }
                /**
                 * Validates RtpEncodingParameters. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtpEncodingParameters(encoding) {
                    if (typeof encoding !== 'object') {
                        throw new TypeError('encoding is not an object');
                    }
                    // ssrc is optional.
                    if (encoding.ssrc && typeof encoding.ssrc !== 'number') {
                        throw new TypeError('invalid encoding.ssrc');
                    }
                    // rid is optional.
                    if (encoding.rid && typeof encoding.rid !== 'string') {
                        throw new TypeError('invalid encoding.rid');
                    }
                    // rtx is optional.
                    if (encoding.rtx && typeof encoding.rtx !== 'object') {
                        throw new TypeError('invalid encoding.rtx');
                    } else if (encoding.rtx) {
                        // RTX ssrc is mandatory if rtx is present.
                        if (typeof encoding.rtx.ssrc !== 'number') {
                            throw new TypeError('missing encoding.rtx.ssrc');
                        }
                    }
                    // dtx is optional. If unset set it to false.
                    if (!encoding.dtx || typeof encoding.dtx !== 'boolean') {
                        encoding.dtx = false;
                    }
                    // scalabilityMode is optional.
                    if (encoding.scalabilityMode && typeof encoding.scalabilityMode !== 'string') {
                        throw new TypeError('invalid encoding.scalabilityMode');
                    }
                }
                /**
                 * Validates RtcpParameters. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateRtcpParameters(rtcp) {
                    if (typeof rtcp !== 'object') {
                        throw new TypeError('rtcp is not an object');
                    }
                    // cname is optional.
                    if (rtcp.cname && typeof rtcp.cname !== 'string') {
                        throw new TypeError('invalid rtcp.cname');
                    }
                    // reducedSize is optional. If unset set it to true.
                    if (!rtcp.reducedSize || typeof rtcp.reducedSize !== 'boolean') {
                        rtcp.reducedSize = true;
                    }
                }
                /**
                 * Validates NumSctpStreams. It may modify given data by adding missing
                 * fields with default values.
                 * It throws if invalid.
                 */
                function validateNumSctpStreams(numStreams) {
                    if (typeof numStreams !== 'object') {
                        throw new TypeError('numStreams is not an object');
                    }
                    // OS is mandatory.
                    if (typeof numStreams.OS !== 'number') {
                        throw new TypeError('missing numStreams.OS');
                    }
                    // MIS is mandatory.
                    if (typeof numStreams.MIS !== 'number') {
                        throw new TypeError('missing numStreams.MIS');
                    }
                }
                function isRtxCodec(codec) {
                    if (!codec) {
                        return false;
                    }
                    return /.+\/rtx$/i.test(codec.mimeType);
                }
                function matchCodecs(aCodec, bCodec, { strict = false, modify = false } = {}) {
                    const aMimeType = aCodec.mimeType.toLowerCase();
                    const bMimeType = bCodec.mimeType.toLowerCase();
                    if (aMimeType !== bMimeType) {
                        return false;
                    }
                    if (aCodec.clockRate !== bCodec.clockRate) {
                        return false;
                    }
                    if (aCodec.channels !== bCodec.channels) {
                        return false;
                    }
                    // Per codec special checks.
                    switch (aMimeType) {
                        case 'video/h264': {
                            if (strict) {
                                const aPacketizationMode = aCodec.parameters['packetization-mode'] || 0;
                                const bPacketizationMode = bCodec.parameters['packetization-mode'] || 0;
                                if (aPacketizationMode !== bPacketizationMode) {
                                    return false;
                                }
                                if (!h264.isSameProfile(aCodec.parameters, bCodec.parameters)) {
                                    return false;
                                }
                                let selectedProfileLevelId;
                                try {
                                    selectedProfileLevelId = h264.generateProfileLevelIdStringForAnswer(
                                        aCodec.parameters,
                                        bCodec.parameters,
                                    );
                                } catch (error) {
                                    return false;
                                }
                                if (modify) {
                                    if (selectedProfileLevelId) {
                                        aCodec.parameters['profile-level-id'] = selectedProfileLevelId;
                                        bCodec.parameters['profile-level-id'] = selectedProfileLevelId;
                                    } else {
                                        delete aCodec.parameters['profile-level-id'];
                                        delete bCodec.parameters['profile-level-id'];
                                    }
                                }
                            }
                            break;
                        }
                        case 'video/vp9': {
                            if (strict) {
                                const aProfileId = aCodec.parameters['profile-id'] || 0;
                                const bProfileId = bCodec.parameters['profile-id'] || 0;
                                if (aProfileId !== bProfileId) {
                                    return false;
                                }
                            }
                            break;
                        }
                    }
                    return true;
                }
                function matchHeaderExtensions(aExt, bExt) {
                    if (aExt.kind && bExt.kind && aExt.kind !== bExt.kind) {
                        return false;
                    }
                    if (aExt.uri !== bExt.uri) {
                        return false;
                    }
                    return true;
                }
                function reduceRtcpFeedback(codecA, codecB) {
                    const reducedRtcpFeedback = [];
                    for (const aFb of codecA.rtcpFeedback || []) {
                        const matchingBFb = (codecB.rtcpFeedback || []).find(
                            (bFb) =>
                                bFb.type === aFb.type &&
                                (bFb.parameter === aFb.parameter || (!bFb.parameter && !aFb.parameter)),
                        );
                        if (matchingBFb) {
                            reducedRtcpFeedback.push(matchingBFb);
                        }
                    }
                    return reducedRtcpFeedback;
                }
            },
            { './utils': 42, 'h264-profile-level-id': 6 },
        ],
        40: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.parse = void 0;
                const ScalabilityModeRegex = new RegExp('^[LS]([1-9]\\d{0,1})T([1-9]\\d{0,1})');
                function parse(scalabilityMode) {
                    const match = ScalabilityModeRegex.exec(scalabilityMode || '');
                    if (match) {
                        return {
                            spatialLayers: Number(match[1]),
                            temporalLayers: Number(match[2]),
                        };
                    } else {
                        return {
                            spatialLayers: 1,
                            temporalLayers: 1,
                        };
                    }
                }
                exports.parse = parse;
            },
            {},
        ],
        41: [
            function (require, module, exports) {
                'use strict';
                var __createBinding =
                    (this && this.__createBinding) ||
                    (Object.create
                        ? function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              var desc = Object.getOwnPropertyDescriptor(m, k);
                              if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
                                  desc = {
                                      enumerable: true,
                                      get: function () {
                                          return m[k];
                                      },
                                  };
                              }
                              Object.defineProperty(o, k2, desc);
                          }
                        : function (o, m, k, k2) {
                              if (k2 === undefined) k2 = k;
                              o[k2] = m[k];
                          });
                var __exportStar =
                    (this && this.__exportStar) ||
                    function (m, exports) {
                        for (var p in m)
                            if (p !== 'default' && !Object.prototype.hasOwnProperty.call(exports, p))
                                __createBinding(exports, m, p);
                    };
                Object.defineProperty(exports, '__esModule', { value: true });
                __exportStar(require('./Device'), exports);
                __exportStar(require('./Transport'), exports);
                __exportStar(require('./Producer'), exports);
                __exportStar(require('./Consumer'), exports);
                __exportStar(require('./DataProducer'), exports);
                __exportStar(require('./DataConsumer'), exports);
                __exportStar(require('./RtpParameters'), exports);
                __exportStar(require('./SctpParameters'), exports);
                __exportStar(require('./handlers/HandlerInterface'), exports);
                __exportStar(require('./errors'), exports);
            },
            {
                './Consumer': 7,
                './DataConsumer': 8,
                './DataProducer': 9,
                './Device': 10,
                './Producer': 13,
                './RtpParameters': 14,
                './SctpParameters': 15,
                './Transport': 16,
                './errors': 17,
                './handlers/HandlerInterface': 26,
            },
        ],
        42: [
            function (require, module, exports) {
                'use strict';
                Object.defineProperty(exports, '__esModule', { value: true });
                exports.generateRandomNumber = exports.clone = void 0;
                /**
                 * Clones the given value.
                 */
                function clone(value) {
                    if (value === undefined) {
                        return undefined;
                    } else if (Number.isNaN(value)) {
                        return NaN;
                    } else if (typeof structuredClone === 'function') {
                        // Available in Node >= 18.
                        return structuredClone(value);
                    } else {
                        return JSON.parse(JSON.stringify(value));
                    }
                }
                exports.clone = clone;
                /**
                 * Generates a random positive integer.
                 */
                function generateRandomNumber() {
                    return Math.round(Math.random() * 10000000);
                }
                exports.generateRandomNumber = generateRandomNumber;
            },
            {},
        ],
        43: [
            function (require, module, exports) {
                /**
                 * Helpers.
                 */

                var s = 1000;
                var m = s * 60;
                var h = m * 60;
                var d = h * 24;
                var w = d * 7;
                var y = d * 365.25;

                /**
                 * Parse or format the given `val`.
                 *
                 * Options:
                 *
                 *  - `long` verbose formatting [false]
                 *
                 * @param {String|Number} val
                 * @param {Object} [options]
                 * @throws {Error} throw an error if val is not a non-empty string or a number
                 * @return {String|Number}
                 * @api public
                 */

                module.exports = function (val, options) {
                    options = options || {};
                    var type = typeof val;
                    if (type === 'string' && val.length > 0) {
                        return parse(val);
                    } else if (type === 'number' && isFinite(val)) {
                        return options.long ? fmtLong(val) : fmtShort(val);
                    }
                    throw new Error('val is not a non-empty string or a valid number. val=' + JSON.stringify(val));
                };

                /**
                 * Parse the given `str` and return milliseconds.
                 *
                 * @param {String} str
                 * @return {Number}
                 * @api private
                 */

                function parse(str) {
                    str = String(str);
                    if (str.length > 100) {
                        return;
                    }
                    var match =
                        /^(-?(?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i.exec(
                            str,
                        );
                    if (!match) {
                        return;
                    }
                    var n = parseFloat(match[1]);
                    var type = (match[2] || 'ms').toLowerCase();
                    switch (type) {
                        case 'years':
                        case 'year':
                        case 'yrs':
                        case 'yr':
                        case 'y':
                            return n * y;
                        case 'weeks':
                        case 'week':
                        case 'w':
                            return n * w;
                        case 'days':
                        case 'day':
                        case 'd':
                            return n * d;
                        case 'hours':
                        case 'hour':
                        case 'hrs':
                        case 'hr':
                        case 'h':
                            return n * h;
                        case 'minutes':
                        case 'minute':
                        case 'mins':
                        case 'min':
                        case 'm':
                            return n * m;
                        case 'seconds':
                        case 'second':
                        case 'secs':
                        case 'sec':
                        case 's':
                            return n * s;
                        case 'milliseconds':
                        case 'millisecond':
                        case 'msecs':
                        case 'msec':
                        case 'ms':
                            return n;
                        default:
                            return undefined;
                    }
                }

                /**
                 * Short format for `ms`.
                 *
                 * @param {Number} ms
                 * @return {String}
                 * @api private
                 */

                function fmtShort(ms) {
                    var msAbs = Math.abs(ms);
                    if (msAbs >= d) {
                        return Math.round(ms / d) + 'd';
                    }
                    if (msAbs >= h) {
                        return Math.round(ms / h) + 'h';
                    }
                    if (msAbs >= m) {
                        return Math.round(ms / m) + 'm';
                    }
                    if (msAbs >= s) {
                        return Math.round(ms / s) + 's';
                    }
                    return ms + 'ms';
                }

                /**
                 * Long format for `ms`.
                 *
                 * @param {Number} ms
                 * @return {String}
                 * @api private
                 */

                function fmtLong(ms) {
                    var msAbs = Math.abs(ms);
                    if (msAbs >= d) {
                        return plural(ms, msAbs, d, 'day');
                    }
                    if (msAbs >= h) {
                        return plural(ms, msAbs, h, 'hour');
                    }
                    if (msAbs >= m) {
                        return plural(ms, msAbs, m, 'minute');
                    }
                    if (msAbs >= s) {
                        return plural(ms, msAbs, s, 'second');
                    }
                    return ms + ' ms';
                }

                /**
                 * Pluralization helper.
                 */

                function plural(ms, msAbs, n, name) {
                    var isPlural = msAbs >= n * 1.5;
                    return Math.round(ms / n) + ' ' + name + (isPlural ? 's' : '');
                }
            },
            {},
        ],
        44: [
            function (require, module, exports) {
                (function (global) {
                    (function () {
                        /*! queue-microtask. MIT License. Feross Aboukhadijeh <https://feross.org/opensource> */
                        let promise;

                        module.exports =
                            typeof queueMicrotask === 'function'
                                ? queueMicrotask.bind(typeof window !== 'undefined' ? window : global)
                                : // reuse resolved promise, and allocate it lazily
                                  (cb) =>
                                      (promise || (promise = Promise.resolve())).then(cb).catch((err) =>
                                          setTimeout(() => {
                                              throw err;
                                          }, 0),
                                      );
                    }).call(this);
                }).call(
                    this,
                    typeof global !== 'undefined'
                        ? global
                        : typeof self !== 'undefined'
                          ? self
                          : typeof window !== 'undefined'
                            ? window
                            : {},
                );
            },
            {},
        ],
        45: [
            function (require, module, exports) {
                var grammar = (module.exports = {
                    v: [
                        {
                            name: 'version',
                            reg: /^(\d*)$/,
                        },
                    ],
                    o: [
                        {
                            // o=- 20518 0 IN IP4 203.0.113.1
                            // NB: sessionId will be a String in most cases because it is huge
                            name: 'origin',
                            reg: /^(\S*) (\d*) (\d*) (\S*) IP(\d) (\S*)/,
                            names: ['username', 'sessionId', 'sessionVersion', 'netType', 'ipVer', 'address'],
                            format: '%s %s %d %s IP%d %s',
                        },
                    ],
                    // default parsing of these only (though some of these feel outdated)
                    s: [{ name: 'name' }],
                    i: [{ name: 'description' }],
                    u: [{ name: 'uri' }],
                    e: [{ name: 'email' }],
                    p: [{ name: 'phone' }],
                    z: [{ name: 'timezones' }], // TODO: this one can actually be parsed properly...
                    r: [{ name: 'repeats' }], // TODO: this one can also be parsed properly
                    // k: [{}], // outdated thing ignored
                    t: [
                        {
                            // t=0 0
                            name: 'timing',
                            reg: /^(\d*) (\d*)/,
                            names: ['start', 'stop'],
                            format: '%d %d',
                        },
                    ],
                    c: [
                        {
                            // c=IN IP4 10.47.197.26
                            name: 'connection',
                            reg: /^IN IP(\d) (\S*)/,
                            names: ['version', 'ip'],
                            format: 'IN IP%d %s',
                        },
                    ],
                    b: [
                        {
                            // b=AS:4000
                            push: 'bandwidth',
                            reg: /^(TIAS|AS|CT|RR|RS):(\d*)/,
                            names: ['type', 'limit'],
                            format: '%s:%s',
                        },
                    ],
                    m: [
                        {
                            // m=video 51744 RTP/AVP 126 97 98 34 31
                            // NB: special - pushes to session
                            // TODO: rtp/fmtp should be filtered by the payloads found here?
                            reg: /^(\w*) (\d*) ([\w/]*)(?: (.*))?/,
                            names: ['type', 'port', 'protocol', 'payloads'],
                            format: '%s %d %s %s',
                        },
                    ],
                    a: [
                        {
                            // a=rtpmap:110 opus/48000/2
                            push: 'rtp',
                            reg: /^rtpmap:(\d*) ([\w\-.]*)(?:\s*\/(\d*)(?:\s*\/(\S*))?)?/,
                            names: ['payload', 'codec', 'rate', 'encoding'],
                            format: function (o) {
                                return o.encoding ? 'rtpmap:%d %s/%s/%s' : o.rate ? 'rtpmap:%d %s/%s' : 'rtpmap:%d %s';
                            },
                        },
                        {
                            // a=fmtp:108 profile-level-id=24;object=23;bitrate=64000
                            // a=fmtp:111 minptime=10; useinbandfec=1
                            push: 'fmtp',
                            reg: /^fmtp:(\d*) ([\S| ]*)/,
                            names: ['payload', 'config'],
                            format: 'fmtp:%d %s',
                        },
                        {
                            // a=control:streamid=0
                            name: 'control',
                            reg: /^control:(.*)/,
                            format: 'control:%s',
                        },
                        {
                            // a=rtcp:65179 IN IP4 193.84.77.194
                            name: 'rtcp',
                            reg: /^rtcp:(\d*)(?: (\S*) IP(\d) (\S*))?/,
                            names: ['port', 'netType', 'ipVer', 'address'],
                            format: function (o) {
                                return o.address != null ? 'rtcp:%d %s IP%d %s' : 'rtcp:%d';
                            },
                        },
                        {
                            // a=rtcp-fb:98 trr-int 100
                            push: 'rtcpFbTrrInt',
                            reg: /^rtcp-fb:(\*|\d*) trr-int (\d*)/,
                            names: ['payload', 'value'],
                            format: 'rtcp-fb:%s trr-int %d',
                        },
                        {
                            // a=rtcp-fb:98 nack rpsi
                            push: 'rtcpFb',
                            reg: /^rtcp-fb:(\*|\d*) ([\w-_]*)(?: ([\w-_]*))?/,
                            names: ['payload', 'type', 'subtype'],
                            format: function (o) {
                                return o.subtype != null ? 'rtcp-fb:%s %s %s' : 'rtcp-fb:%s %s';
                            },
                        },
                        {
                            // a=extmap:2 urn:ietf:params:rtp-hdrext:toffset
                            // a=extmap:1/recvonly URI-gps-string
                            // a=extmap:3 urn:ietf:params:rtp-hdrext:encrypt urn:ietf:params:rtp-hdrext:smpte-tc 25@600/24
                            push: 'ext',
                            reg: /^extmap:(\d+)(?:\/(\w+))?(?: (urn:ietf:params:rtp-hdrext:encrypt))? (\S*)(?: (\S*))?/,
                            names: ['value', 'direction', 'encrypt-uri', 'uri', 'config'],
                            format: function (o) {
                                return (
                                    'extmap:%d' +
                                    (o.direction ? '/%s' : '%v') +
                                    (o['encrypt-uri'] ? ' %s' : '%v') +
                                    ' %s' +
                                    (o.config ? ' %s' : '')
                                );
                            },
                        },
                        {
                            // a=extmap-allow-mixed
                            name: 'extmapAllowMixed',
                            reg: /^(extmap-allow-mixed)/,
                        },
                        {
                            // a=crypto:1 AES_CM_128_HMAC_SHA1_80 inline:PS1uQCVeeCFCanVmcjkpPywjNWhcYD0mXXtxaVBR|2^20|1:32
                            push: 'crypto',
                            reg: /^crypto:(\d*) ([\w_]*) (\S*)(?: (\S*))?/,
                            names: ['id', 'suite', 'config', 'sessionConfig'],
                            format: function (o) {
                                return o.sessionConfig != null ? 'crypto:%d %s %s %s' : 'crypto:%d %s %s';
                            },
                        },
                        {
                            // a=setup:actpass
                            name: 'setup',
                            reg: /^setup:(\w*)/,
                            format: 'setup:%s',
                        },
                        {
                            // a=connection:new
                            name: 'connectionType',
                            reg: /^connection:(new|existing)/,
                            format: 'connection:%s',
                        },
                        {
                            // a=mid:1
                            name: 'mid',
                            reg: /^mid:([^\s]*)/,
                            format: 'mid:%s',
                        },
                        {
                            // a=msid:0c8b064d-d807-43b4-b434-f92a889d8587 98178685-d409-46e0-8e16-7ef0db0db64a
                            name: 'msid',
                            reg: /^msid:(.*)/,
                            format: 'msid:%s',
                        },
                        {
                            // a=ptime:20
                            name: 'ptime',
                            reg: /^ptime:(\d*(?:\.\d*)*)/,
                            format: 'ptime:%d',
                        },
                        {
                            // a=maxptime:60
                            name: 'maxptime',
                            reg: /^maxptime:(\d*(?:\.\d*)*)/,
                            format: 'maxptime:%d',
                        },
                        {
                            // a=sendrecv
                            name: 'direction',
                            reg: /^(sendrecv|recvonly|sendonly|inactive)/,
                        },
                        {
                            // a=ice-lite
                            name: 'icelite',
                            reg: /^(ice-lite)/,
                        },
                        {
                            // a=ice-ufrag:F7gI
                            name: 'iceUfrag',
                            reg: /^ice-ufrag:(\S*)/,
                            format: 'ice-ufrag:%s',
                        },
                        {
                            // a=ice-pwd:x9cml/YzichV2+XlhiMu8g
                            name: 'icePwd',
                            reg: /^ice-pwd:(\S*)/,
                            format: 'ice-pwd:%s',
                        },
                        {
                            // a=fingerprint:SHA-1 00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33
                            name: 'fingerprint',
                            reg: /^fingerprint:(\S*) (\S*)/,
                            names: ['type', 'hash'],
                            format: 'fingerprint:%s %s',
                        },
                        {
                            // a=candidate:0 1 UDP 2113667327 203.0.113.1 54400 typ host
                            // a=candidate:1162875081 1 udp 2113937151 192.168.34.75 60017 typ host generation 0 network-id 3 network-cost 10
                            // a=candidate:3289912957 2 udp 1845501695 193.84.77.194 60017 typ srflx raddr 192.168.34.75 rport 60017 generation 0 network-id 3 network-cost 10
                            // a=candidate:229815620 1 tcp 1518280447 192.168.150.19 60017 typ host tcptype active generation 0 network-id 3 network-cost 10
                            // a=candidate:3289912957 2 tcp 1845501695 193.84.77.194 60017 typ srflx raddr 192.168.34.75 rport 60017 tcptype passive generation 0 network-id 3 network-cost 10
                            push: 'candidates',
                            reg: /^candidate:(\S*) (\d*) (\S*) (\d*) (\S*) (\d*) typ (\S*)(?: raddr (\S*) rport (\d*))?(?: tcptype (\S*))?(?: generation (\d*))?(?: network-id (\d*))?(?: network-cost (\d*))?/,
                            names: [
                                'foundation',
                                'component',
                                'transport',
                                'priority',
                                'ip',
                                'port',
                                'type',
                                'raddr',
                                'rport',
                                'tcptype',
                                'generation',
                                'network-id',
                                'network-cost',
                            ],
                            format: function (o) {
                                var str = 'candidate:%s %d %s %d %s %d typ %s';

                                str += o.raddr != null ? ' raddr %s rport %d' : '%v%v';

                                // NB: candidate has three optional chunks, so %void middles one if it's missing
                                str += o.tcptype != null ? ' tcptype %s' : '%v';

                                if (o.generation != null) {
                                    str += ' generation %d';
                                }

                                str += o['network-id'] != null ? ' network-id %d' : '%v';
                                str += o['network-cost'] != null ? ' network-cost %d' : '%v';
                                return str;
                            },
                        },
                        {
                            // a=end-of-candidates (keep after the candidates line for readability)
                            name: 'endOfCandidates',
                            reg: /^(end-of-candidates)/,
                        },
                        {
                            // a=remote-candidates:1 203.0.113.1 54400 2 203.0.113.1 54401 ...
                            name: 'remoteCandidates',
                            reg: /^remote-candidates:(.*)/,
                            format: 'remote-candidates:%s',
                        },
                        {
                            // a=ice-options:google-ice
                            name: 'iceOptions',
                            reg: /^ice-options:(\S*)/,
                            format: 'ice-options:%s',
                        },
                        {
                            // a=ssrc:2566107569 cname:t9YU8M1UxTF8Y1A1
                            push: 'ssrcs',
                            reg: /^ssrc:(\d*) ([\w_-]*)(?::(.*))?/,
                            names: ['id', 'attribute', 'value'],
                            format: function (o) {
                                var str = 'ssrc:%d';
                                if (o.attribute != null) {
                                    str += ' %s';
                                    if (o.value != null) {
                                        str += ':%s';
                                    }
                                }
                                return str;
                            },
                        },
                        {
                            // a=ssrc-group:FEC 1 2
                            // a=ssrc-group:FEC-FR 3004364195 1080772241
                            push: 'ssrcGroups',
                            // token-char = %x21 / %x23-27 / %x2A-2B / %x2D-2E / %x30-39 / %x41-5A / %x5E-7E
                            reg: /^ssrc-group:([\x21\x23\x24\x25\x26\x27\x2A\x2B\x2D\x2E\w]*) (.*)/,
                            names: ['semantics', 'ssrcs'],
                            format: 'ssrc-group:%s %s',
                        },
                        {
                            // a=msid-semantic: WMS Jvlam5X3SX1OP6pn20zWogvaKJz5Hjf9OnlV
                            name: 'msidSemantic',
                            reg: /^msid-semantic:\s?(\w*) (\S*)/,
                            names: ['semantic', 'token'],
                            format: 'msid-semantic: %s %s', // space after ':' is not accidental
                        },
                        {
                            // a=group:BUNDLE audio video
                            push: 'groups',
                            reg: /^group:(\w*) (.*)/,
                            names: ['type', 'mids'],
                            format: 'group:%s %s',
                        },
                        {
                            // a=rtcp-mux
                            name: 'rtcpMux',
                            reg: /^(rtcp-mux)/,
                        },
                        {
                            // a=rtcp-rsize
                            name: 'rtcpRsize',
                            reg: /^(rtcp-rsize)/,
                        },
                        {
                            // a=sctpmap:5000 webrtc-datachannel 1024
                            name: 'sctpmap',
                            reg: /^sctpmap:([\w_/]*) (\S*)(?: (\S*))?/,
                            names: ['sctpmapNumber', 'app', 'maxMessageSize'],
                            format: function (o) {
                                return o.maxMessageSize != null ? 'sctpmap:%s %s %s' : 'sctpmap:%s %s';
                            },
                        },
                        {
                            // a=x-google-flag:conference
                            name: 'xGoogleFlag',
                            reg: /^x-google-flag:([^\s]*)/,
                            format: 'x-google-flag:%s',
                        },
                        {
                            // a=rid:1 send max-width=1280;max-height=720;max-fps=30;depend=0
                            push: 'rids',
                            reg: /^rid:([\d\w]+) (\w+)(?: ([\S| ]*))?/,
                            names: ['id', 'direction', 'params'],
                            format: function (o) {
                                return o.params ? 'rid:%s %s %s' : 'rid:%s %s';
                            },
                        },
                        {
                            // a=imageattr:97 send [x=800,y=640,sar=1.1,q=0.6] [x=480,y=320] recv [x=330,y=250]
                            // a=imageattr:* send [x=800,y=640] recv *
                            // a=imageattr:100 recv [x=320,y=240]
                            push: 'imageattrs',
                            reg: new RegExp(
                                // a=imageattr:97
                                '^imageattr:(\\d+|\\*)' +
                                    // send [x=800,y=640,sar=1.1,q=0.6] [x=480,y=320]
                                    '[\\s\\t]+(send|recv)[\\s\\t]+(\\*|\\[\\S+\\](?:[\\s\\t]+\\[\\S+\\])*)' +
                                    // recv [x=330,y=250]
                                    '(?:[\\s\\t]+(recv|send)[\\s\\t]+(\\*|\\[\\S+\\](?:[\\s\\t]+\\[\\S+\\])*))?',
                            ),
                            names: ['pt', 'dir1', 'attrs1', 'dir2', 'attrs2'],
                            format: function (o) {
                                return 'imageattr:%s %s %s' + (o.dir2 ? ' %s %s' : '');
                            },
                        },
                        {
                            // a=simulcast:send 1,2,3;~4,~5 recv 6;~7,~8
                            // a=simulcast:recv 1;4,5 send 6;7
                            name: 'simulcast',
                            reg: new RegExp(
                                // a=simulcast:
                                '^simulcast:' +
                                    // send 1,2,3;~4,~5
                                    '(send|recv) ([a-zA-Z0-9\\-_~;,]+)' +
                                    // space + recv 6;~7,~8
                                    '(?:\\s?(send|recv) ([a-zA-Z0-9\\-_~;,]+))?' +
                                    // end
                                    '$',
                            ),
                            names: ['dir1', 'list1', 'dir2', 'list2'],
                            format: function (o) {
                                return 'simulcast:%s %s' + (o.dir2 ? ' %s %s' : '');
                            },
                        },
                        {
                            // old simulcast draft 03 (implemented by Firefox)
                            //   https://tools.ietf.org/html/draft-ietf-mmusic-sdp-simulcast-03
                            // a=simulcast: recv pt=97;98 send pt=97
                            // a=simulcast: send rid=5;6;7 paused=6,7
                            name: 'simulcast_03',
                            reg: /^simulcast:[\s\t]+([\S+\s\t]+)$/,
                            names: ['value'],
                            format: 'simulcast: %s',
                        },
                        {
                            // a=framerate:25
                            // a=framerate:29.97
                            name: 'framerate',
                            reg: /^framerate:(\d+(?:$|\.\d+))/,
                            format: 'framerate:%s',
                        },
                        {
                            // RFC4570
                            // a=source-filter: incl IN IP4 239.5.2.31 10.1.15.5
                            name: 'sourceFilter',
                            reg: /^source-filter: *(excl|incl) (\S*) (IP4|IP6|\*) (\S*) (.*)/,
                            names: ['filterMode', 'netType', 'addressTypes', 'destAddress', 'srcList'],
                            format: 'source-filter: %s %s %s %s %s',
                        },
                        {
                            // a=bundle-only
                            name: 'bundleOnly',
                            reg: /^(bundle-only)/,
                        },
                        {
                            // a=label:1
                            name: 'label',
                            reg: /^label:(.+)/,
                            format: 'label:%s',
                        },
                        {
                            // RFC version 26 for SCTP over DTLS
                            // https://tools.ietf.org/html/draft-ietf-mmusic-sctp-sdp-26#section-5
                            name: 'sctpPort',
                            reg: /^sctp-port:(\d+)$/,
                            format: 'sctp-port:%s',
                        },
                        {
                            // RFC version 26 for SCTP over DTLS
                            // https://tools.ietf.org/html/draft-ietf-mmusic-sctp-sdp-26#section-6
                            name: 'maxMessageSize',
                            reg: /^max-message-size:(\d+)$/,
                            format: 'max-message-size:%s',
                        },
                        {
                            // RFC7273
                            // a=ts-refclk:ptp=IEEE1588-2008:39-A7-94-FF-FE-07-CB-D0:37
                            push: 'tsRefClocks',
                            reg: /^ts-refclk:([^\s=]*)(?:=(\S*))?/,
                            names: ['clksrc', 'clksrcExt'],
                            format: function (o) {
                                return 'ts-refclk:%s' + (o.clksrcExt != null ? '=%s' : '');
                            },
                        },
                        {
                            // RFC7273
                            // a=mediaclk:direct=963214424
                            name: 'mediaClk',
                            reg: /^mediaclk:(?:id=(\S*))? *([^\s=]*)(?:=(\S*))?(?: *rate=(\d+)\/(\d+))?/,
                            names: ['id', 'mediaClockName', 'mediaClockValue', 'rateNumerator', 'rateDenominator'],
                            format: function (o) {
                                var str = 'mediaclk:';
                                str += o.id != null ? 'id=%s %s' : '%v%s';
                                str += o.mediaClockValue != null ? '=%s' : '';
                                str += o.rateNumerator != null ? ' rate=%s' : '';
                                str += o.rateDenominator != null ? '/%s' : '';
                                return str;
                            },
                        },
                        {
                            // a=keywds:keywords
                            name: 'keywords',
                            reg: /^keywds:(.+)$/,
                            format: 'keywds:%s',
                        },
                        {
                            // a=content:main
                            name: 'content',
                            reg: /^content:(.+)/,
                            format: 'content:%s',
                        },
                        // BFCP https://tools.ietf.org/html/rfc4583
                        {
                            // a=floorctrl:c-s
                            name: 'bfcpFloorCtrl',
                            reg: /^floorctrl:(c-only|s-only|c-s)/,
                            format: 'floorctrl:%s',
                        },
                        {
                            // a=confid:1
                            name: 'bfcpConfId',
                            reg: /^confid:(\d+)/,
                            format: 'confid:%s',
                        },
                        {
                            // a=userid:1
                            name: 'bfcpUserId',
                            reg: /^userid:(\d+)/,
                            format: 'userid:%s',
                        },
                        {
                            // a=floorid:1
                            name: 'bfcpFloorId',
                            reg: /^floorid:(.+) (?:m-stream|mstrm):(.+)/,
                            names: ['id', 'mStream'],
                            format: 'floorid:%s mstrm:%s',
                        },
                        {
                            // any a= that we don't understand is kept verbatim on media.invalid
                            push: 'invalid',
                            names: ['value'],
                        },
                    ],
                });

                // set sensible defaults to avoid polluting the grammar with boring details
                Object.keys(grammar).forEach(function (key) {
                    var objs = grammar[key];
                    objs.forEach(function (obj) {
                        if (!obj.reg) {
                            obj.reg = /(.*)/;
                        }
                        if (!obj.format) {
                            obj.format = '%s';
                        }
                    });
                });
            },
            {},
        ],
        46: [
            function (require, module, exports) {
                var parser = require('./parser');
                var writer = require('./writer');

                exports.write = writer;
                exports.parse = parser.parse;
                exports.parseParams = parser.parseParams;
                exports.parseFmtpConfig = parser.parseFmtpConfig; // Alias of parseParams().
                exports.parsePayloads = parser.parsePayloads;
                exports.parseRemoteCandidates = parser.parseRemoteCandidates;
                exports.parseImageAttributes = parser.parseImageAttributes;
                exports.parseSimulcastStreamList = parser.parseSimulcastStreamList;
            },
            { './parser': 47, './writer': 48 },
        ],
        47: [
            function (require, module, exports) {
                var toIntIfInt = function (v) {
                    return String(Number(v)) === v ? Number(v) : v;
                };

                var attachProperties = function (match, location, names, rawName) {
                    if (rawName && !names) {
                        location[rawName] = toIntIfInt(match[1]);
                    } else {
                        for (var i = 0; i < names.length; i += 1) {
                            if (match[i + 1] != null) {
                                location[names[i]] = toIntIfInt(match[i + 1]);
                            }
                        }
                    }
                };

                var parseReg = function (obj, location, content) {
                    var needsBlank = obj.name && obj.names;
                    if (obj.push && !location[obj.push]) {
                        location[obj.push] = [];
                    } else if (needsBlank && !location[obj.name]) {
                        location[obj.name] = {};
                    }
                    var keyLocation = obj.push
                        ? {} // blank object that will be pushed
                        : needsBlank
                          ? location[obj.name]
                          : location; // otherwise, named location or root

                    attachProperties(content.match(obj.reg), keyLocation, obj.names, obj.name);

                    if (obj.push) {
                        location[obj.push].push(keyLocation);
                    }
                };

                var grammar = require('./grammar');
                var validLine = RegExp.prototype.test.bind(/^([a-z])=(.*)/);

                exports.parse = function (sdp) {
                    var session = {},
                        media = [],
                        location = session; // points at where properties go under (one of the above)

                    // parse lines we understand
                    sdp.split(/(\r\n|\r|\n)/)
                        .filter(validLine)
                        .forEach(function (l) {
                            var type = l[0];
                            var content = l.slice(2);
                            if (type === 'm') {
                                media.push({ rtp: [], fmtp: [] });
                                location = media[media.length - 1]; // point at latest media line
                            }

                            for (var j = 0; j < (grammar[type] || []).length; j += 1) {
                                var obj = grammar[type][j];
                                if (obj.reg.test(content)) {
                                    return parseReg(obj, location, content);
                                }
                            }
                        });

                    session.media = media; // link it up
                    return session;
                };

                var paramReducer = function (acc, expr) {
                    var s = expr.split(/=(.+)/, 2);
                    if (s.length === 2) {
                        acc[s[0]] = toIntIfInt(s[1]);
                    } else if (s.length === 1 && expr.length > 1) {
                        acc[s[0]] = undefined;
                    }
                    return acc;
                };

                exports.parseParams = function (str) {
                    return str.split(/;\s?/).reduce(paramReducer, {});
                };

                // For backward compatibility - alias will be removed in 3.0.0
                exports.parseFmtpConfig = exports.parseParams;

                exports.parsePayloads = function (str) {
                    return str.toString().split(' ').map(Number);
                };

                exports.parseRemoteCandidates = function (str) {
                    var candidates = [];
                    var parts = str.split(' ').map(toIntIfInt);
                    for (var i = 0; i < parts.length; i += 3) {
                        candidates.push({
                            component: parts[i],
                            ip: parts[i + 1],
                            port: parts[i + 2],
                        });
                    }
                    return candidates;
                };

                exports.parseImageAttributes = function (str) {
                    return str.split(' ').map(function (item) {
                        return item
                            .substring(1, item.length - 1)
                            .split(',')
                            .reduce(paramReducer, {});
                    });
                };

                exports.parseSimulcastStreamList = function (str) {
                    return str.split(';').map(function (stream) {
                        return stream.split(',').map(function (format) {
                            var scid,
                                paused = false;

                            if (format[0] !== '~') {
                                scid = toIntIfInt(format);
                            } else {
                                scid = toIntIfInt(format.substring(1, format.length));
                                paused = true;
                            }

                            return {
                                scid: scid,
                                paused: paused,
                            };
                        });
                    });
                };
            },
            { './grammar': 45 },
        ],
        48: [
            function (require, module, exports) {
                var grammar = require('./grammar');

                // customized util.format - discards excess arguments and can void middle ones
                var formatRegExp = /%[sdv%]/g;
                var format = function (formatStr) {
                    var i = 1;
                    var args = arguments;
                    var len = args.length;
                    return formatStr.replace(formatRegExp, function (x) {
                        if (i >= len) {
                            return x; // missing argument
                        }
                        var arg = args[i];
                        i += 1;
                        switch (x) {
                            case '%%':
                                return '%';
                            case '%s':
                                return String(arg);
                            case '%d':
                                return Number(arg);
                            case '%v':
                                return '';
                        }
                    });
                    // NB: we discard excess arguments - they are typically undefined from makeLine
                };

                var makeLine = function (type, obj, location) {
                    var str =
                        obj.format instanceof Function
                            ? obj.format(obj.push ? location : location[obj.name])
                            : obj.format;

                    var args = [type + '=' + str];
                    if (obj.names) {
                        for (var i = 0; i < obj.names.length; i += 1) {
                            var n = obj.names[i];
                            if (obj.name) {
                                args.push(location[obj.name][n]);
                            } else {
                                // for mLine and push attributes
                                args.push(location[obj.names[i]]);
                            }
                        }
                    } else {
                        args.push(location[obj.name]);
                    }
                    return format.apply(null, args);
                };

                // RFC specified order
                // TODO: extend this with all the rest
                var defaultOuterOrder = ['v', 'o', 's', 'i', 'u', 'e', 'p', 'c', 'b', 't', 'r', 'z', 'a'];
                var defaultInnerOrder = ['i', 'c', 'b', 'a'];

                module.exports = function (session, opts) {
                    opts = opts || {};
                    // ensure certain properties exist
                    if (session.version == null) {
                        session.version = 0; // 'v=0' must be there (only defined version atm)
                    }
                    if (session.name == null) {
                        session.name = ' '; // 's= ' must be there if no meaningful name set
                    }
                    session.media.forEach(function (mLine) {
                        if (mLine.payloads == null) {
                            mLine.payloads = '';
                        }
                    });

                    var outerOrder = opts.outerOrder || defaultOuterOrder;
                    var innerOrder = opts.innerOrder || defaultInnerOrder;
                    var sdp = [];

                    // loop through outerOrder for matching properties on session
                    outerOrder.forEach(function (type) {
                        grammar[type].forEach(function (obj) {
                            if (obj.name in session && session[obj.name] != null) {
                                sdp.push(makeLine(type, obj, session));
                            } else if (obj.push in session && session[obj.push] != null) {
                                session[obj.push].forEach(function (el) {
                                    sdp.push(makeLine(type, obj, el));
                                });
                            }
                        });
                    });

                    // then for each media line, follow the innerOrder
                    session.media.forEach(function (mLine) {
                        sdp.push(makeLine('m', grammar.m[0], mLine));

                        innerOrder.forEach(function (type) {
                            grammar[type].forEach(function (obj) {
                                if (obj.name in mLine && mLine[obj.name] != null) {
                                    sdp.push(makeLine(type, obj, mLine));
                                } else if (obj.push in mLine && mLine[obj.push] != null) {
                                    mLine[obj.push].forEach(function (el) {
                                        sdp.push(makeLine(type, obj, el));
                                    });
                                }
                            });
                        });
                    });

                    return sdp.join('\r\n') + '\r\n';
                };
            },
            { './grammar': 45 },
        ],
        49: [
            function (require, module, exports) {
                /////////////////////////////////////////////////////////////////////////////////
                /* UAParser.js v1.0.37
   Copyright © 2012-2021 Faisal Salman <f@faisalman.com>
   MIT License */ /*
   Detect Browser, Engine, OS, CPU, and Device type/model from User-Agent data.
   Supports browser & node.js environment. 
   Demo   : https://faisalman.github.io/ua-parser-js
   Source : https://github.com/faisalman/ua-parser-js */
                /////////////////////////////////////////////////////////////////////////////////

                (function (window, undefined) {
                    'use strict';

                    //////////////
                    // Constants
                    /////////////

                    var LIBVERSION = '1.0.37',
                        EMPTY = '',
                        UNKNOWN = '?',
                        FUNC_TYPE = 'function',
                        UNDEF_TYPE = 'undefined',
                        OBJ_TYPE = 'object',
                        STR_TYPE = 'string',
                        MAJOR = 'major',
                        MODEL = 'model',
                        NAME = 'name',
                        TYPE = 'type',
                        VENDOR = 'vendor',
                        VERSION = 'version',
                        ARCHITECTURE = 'architecture',
                        CONSOLE = 'console',
                        MOBILE = 'mobile',
                        TABLET = 'tablet',
                        SMARTTV = 'smarttv',
                        WEARABLE = 'wearable',
                        EMBEDDED = 'embedded',
                        UA_MAX_LENGTH = 500;

                    var AMAZON = 'Amazon',
                        APPLE = 'Apple',
                        ASUS = 'ASUS',
                        BLACKBERRY = 'BlackBerry',
                        BROWSER = 'Browser',
                        CHROME = 'Chrome',
                        EDGE = 'Edge',
                        FIREFOX = 'Firefox',
                        GOOGLE = 'Google',
                        HUAWEI = 'Huawei',
                        LG = 'LG',
                        MICROSOFT = 'Microsoft',
                        MOTOROLA = 'Motorola',
                        OPERA = 'Opera',
                        SAMSUNG = 'Samsung',
                        SHARP = 'Sharp',
                        SONY = 'Sony',
                        XIAOMI = 'Xiaomi',
                        ZEBRA = 'Zebra',
                        FACEBOOK = 'Facebook',
                        CHROMIUM_OS = 'Chromium OS',
                        MAC_OS = 'Mac OS';

                    ///////////
                    // Helper
                    //////////

                    var extend = function (regexes, extensions) {
                            var mergedRegexes = {};
                            for (var i in regexes) {
                                if (extensions[i] && extensions[i].length % 2 === 0) {
                                    mergedRegexes[i] = extensions[i].concat(regexes[i]);
                                } else {
                                    mergedRegexes[i] = regexes[i];
                                }
                            }
                            return mergedRegexes;
                        },
                        enumerize = function (arr) {
                            var enums = {};
                            for (var i = 0; i < arr.length; i++) {
                                enums[arr[i].toUpperCase()] = arr[i];
                            }
                            return enums;
                        },
                        has = function (str1, str2) {
                            return typeof str1 === STR_TYPE ? lowerize(str2).indexOf(lowerize(str1)) !== -1 : false;
                        },
                        lowerize = function (str) {
                            return str.toLowerCase();
                        },
                        majorize = function (version) {
                            return typeof version === STR_TYPE
                                ? version.replace(/[^\d\.]/g, EMPTY).split('.')[0]
                                : undefined;
                        },
                        trim = function (str, len) {
                            if (typeof str === STR_TYPE) {
                                str = str.replace(/^\s\s*/, EMPTY);
                                return typeof len === UNDEF_TYPE ? str : str.substring(0, UA_MAX_LENGTH);
                            }
                        };

                    ///////////////
                    // Map helper
                    //////////////

                    var rgxMapper = function (ua, arrays) {
                            var i = 0,
                                j,
                                k,
                                p,
                                q,
                                matches,
                                match;

                            // loop through all regexes maps
                            while (i < arrays.length && !matches) {
                                var regex = arrays[i], // even sequence (0,2,4,..)
                                    props = arrays[i + 1]; // odd sequence (1,3,5,..)
                                j = k = 0;

                                // try matching uastring with regexes
                                while (j < regex.length && !matches) {
                                    if (!regex[j]) {
                                        break;
                                    }
                                    matches = regex[j++].exec(ua);

                                    if (!!matches) {
                                        for (p = 0; p < props.length; p++) {
                                            match = matches[++k];
                                            q = props[p];
                                            // check if given property is actually array
                                            if (typeof q === OBJ_TYPE && q.length > 0) {
                                                if (q.length === 2) {
                                                    if (typeof q[1] == FUNC_TYPE) {
                                                        // assign modified match
                                                        this[q[0]] = q[1].call(this, match);
                                                    } else {
                                                        // assign given value, ignore regex match
                                                        this[q[0]] = q[1];
                                                    }
                                                } else if (q.length === 3) {
                                                    // check whether function or regex
                                                    if (typeof q[1] === FUNC_TYPE && !(q[1].exec && q[1].test)) {
                                                        // call function (usually string mapper)
                                                        this[q[0]] = match ? q[1].call(this, match, q[2]) : undefined;
                                                    } else {
                                                        // sanitize match using given regex
                                                        this[q[0]] = match ? match.replace(q[1], q[2]) : undefined;
                                                    }
                                                } else if (q.length === 4) {
                                                    this[q[0]] = match
                                                        ? q[3].call(this, match.replace(q[1], q[2]))
                                                        : undefined;
                                                }
                                            } else {
                                                this[q] = match ? match : undefined;
                                            }
                                        }
                                    }
                                }
                                i += 2;
                            }
                        },
                        strMapper = function (str, map) {
                            for (var i in map) {
                                // check if current value is array
                                if (typeof map[i] === OBJ_TYPE && map[i].length > 0) {
                                    for (var j = 0; j < map[i].length; j++) {
                                        if (has(map[i][j], str)) {
                                            return i === UNKNOWN ? undefined : i;
                                        }
                                    }
                                } else if (has(map[i], str)) {
                                    return i === UNKNOWN ? undefined : i;
                                }
                            }
                            return str;
                        };

                    ///////////////
                    // String map
                    //////////////

                    // Safari < 3.0
                    var oldSafariMap = {
                            '1.0': '/8',
                            1.2: '/1',
                            1.3: '/3',
                            '2.0': '/412',
                            '2.0.2': '/416',
                            '2.0.3': '/417',
                            '2.0.4': '/419',
                            '?': '/',
                        },
                        windowsVersionMap = {
                            ME: '4.90',
                            'NT 3.11': 'NT3.51',
                            'NT 4.0': 'NT4.0',
                            2000: 'NT 5.0',
                            XP: ['NT 5.1', 'NT 5.2'],
                            Vista: 'NT 6.0',
                            7: 'NT 6.1',
                            8: 'NT 6.2',
                            8.1: 'NT 6.3',
                            10: ['NT 6.4', 'NT 10.0'],
                            RT: 'ARM',
                        };

                    //////////////
                    // Regex map
                    /////////////

                    var regexes = {
                        browser: [
                            [
                                /\b(?:crmo|crios)\/([\w\.]+)/i, // Chrome for Android/iOS
                            ],
                            [VERSION, [NAME, 'Chrome']],
                            [
                                /edg(?:e|ios|a)?\/([\w\.]+)/i, // Microsoft Edge
                            ],
                            [VERSION, [NAME, 'Edge']],
                            [
                                // Presto based
                                /(opera mini)\/([-\w\.]+)/i, // Opera Mini
                                /(opera [mobiletab]{3,6})\b.+version\/([-\w\.]+)/i, // Opera Mobi/Tablet
                                /(opera)(?:.+version\/|[\/ ]+)([\w\.]+)/i, // Opera
                            ],
                            [NAME, VERSION],
                            [
                                /opios[\/ ]+([\w\.]+)/i, // Opera mini on iphone >= 8.0
                            ],
                            [VERSION, [NAME, OPERA + ' Mini']],
                            [
                                /\bopr\/([\w\.]+)/i, // Opera Webkit
                            ],
                            [VERSION, [NAME, OPERA]],
                            [
                                // Mixed
                                /\bb[ai]*d(?:uhd|[ub]*[aekoprswx]{5,6})[\/ ]?([\w\.]+)/i, // Baidu
                            ],
                            [VERSION, [NAME, 'Baidu']],
                            [
                                /(kindle)\/([\w\.]+)/i, // Kindle
                                /(lunascape|maxthon|netfront|jasmine|blazer)[\/ ]?([\w\.]*)/i, // Lunascape/Maxthon/Netfront/Jasmine/Blazer
                                // Trident based
                                /(avant|iemobile|slim)\s?(?:browser)?[\/ ]?([\w\.]*)/i, // Avant/IEMobile/SlimBrowser
                                /(?:ms|\()(ie) ([\w\.]+)/i, // Internet Explorer

                                // Webkit/KHTML based                                               // Flock/RockMelt/Midori/Epiphany/Silk/Skyfire/Bolt/Iron/Iridium/PhantomJS/Bowser/QupZilla/Falkon
                                /(flock|rockmelt|midori|epiphany|silk|skyfire|bolt|iron|vivaldi|iridium|phantomjs|bowser|quark|qupzilla|falkon|rekonq|puffin|brave|whale(?!.+naver)|qqbrowserlite|qq|duckduckgo)\/([-\w\.]+)/i,
                                // Rekonq/Puffin/Brave/Whale/QQBrowserLite/QQ, aka ShouQ
                                /(heytap|ovi)browser\/([\d\.]+)/i, // Heytap/Ovi
                                /(weibo)__([\d\.]+)/i, // Weibo
                            ],
                            [NAME, VERSION],
                            [
                                /(?:\buc? ?browser|(?:juc.+)ucweb)[\/ ]?([\w\.]+)/i, // UCBrowser
                            ],
                            [VERSION, [NAME, 'UC' + BROWSER]],
                            [
                                /microm.+\bqbcore\/([\w\.]+)/i, // WeChat Desktop for Windows Built-in Browser
                                /\bqbcore\/([\w\.]+).+microm/i,
                                /micromessenger\/([\w\.]+)/i, // WeChat
                            ],
                            [VERSION, [NAME, 'WeChat']],
                            [
                                /konqueror\/([\w\.]+)/i, // Konqueror
                            ],
                            [VERSION, [NAME, 'Konqueror']],
                            [
                                /trident.+rv[: ]([\w\.]{1,9})\b.+like gecko/i, // IE11
                            ],
                            [VERSION, [NAME, 'IE']],
                            [
                                /ya(?:search)?browser\/([\w\.]+)/i, // Yandex
                            ],
                            [VERSION, [NAME, 'Yandex']],
                            [
                                /slbrowser\/([\w\.]+)/i, // Smart Lenovo Browser
                            ],
                            [VERSION, [NAME, 'Smart Lenovo ' + BROWSER]],
                            [
                                /(avast|avg)\/([\w\.]+)/i, // Avast/AVG Secure Browser
                            ],
                            [[NAME, /(.+)/, '$1 Secure ' + BROWSER], VERSION],
                            [
                                /\bfocus\/([\w\.]+)/i, // Firefox Focus
                            ],
                            [VERSION, [NAME, FIREFOX + ' Focus']],
                            [
                                /\bopt\/([\w\.]+)/i, // Opera Touch
                            ],
                            [VERSION, [NAME, OPERA + ' Touch']],
                            [
                                /coc_coc\w+\/([\w\.]+)/i, // Coc Coc Browser
                            ],
                            [VERSION, [NAME, 'Coc Coc']],
                            [
                                /dolfin\/([\w\.]+)/i, // Dolphin
                            ],
                            [VERSION, [NAME, 'Dolphin']],
                            [
                                /coast\/([\w\.]+)/i, // Opera Coast
                            ],
                            [VERSION, [NAME, OPERA + ' Coast']],
                            [
                                /miuibrowser\/([\w\.]+)/i, // MIUI Browser
                            ],
                            [VERSION, [NAME, 'MIUI ' + BROWSER]],
                            [
                                /fxios\/([-\w\.]+)/i, // Firefox for iOS
                            ],
                            [VERSION, [NAME, FIREFOX]],
                            [
                                /\bqihu|(qi?ho?o?|360)browser/i, // 360
                            ],
                            [[NAME, '360 ' + BROWSER]],
                            [/(oculus|sailfish|huawei|vivo)browser\/([\w\.]+)/i],
                            [[NAME, /(.+)/, '$1 ' + BROWSER], VERSION],
                            [
                                // Oculus/Sailfish/HuaweiBrowser/VivoBrowser
                                /samsungbrowser\/([\w\.]+)/i, // Samsung Internet
                            ],
                            [VERSION, [NAME, SAMSUNG + ' Internet']],
                            [
                                /(comodo_dragon)\/([\w\.]+)/i, // Comodo Dragon
                            ],
                            [[NAME, /_/g, ' '], VERSION],
                            [
                                /metasr[\/ ]?([\d\.]+)/i, // Sogou Explorer
                            ],
                            [VERSION, [NAME, 'Sogou Explorer']],
                            [
                                /(sogou)mo\w+\/([\d\.]+)/i, // Sogou Mobile
                            ],
                            [[NAME, 'Sogou Mobile'], VERSION],
                            [
                                /(electron)\/([\w\.]+) safari/i, // Electron-based App
                                /(tesla)(?: qtcarbrowser|\/(20\d\d\.[-\w\.]+))/i, // Tesla
                                /m?(qqbrowser|2345Explorer)[\/ ]?([\w\.]+)/i, // QQBrowser/2345 Browser
                            ],
                            [NAME, VERSION],
                            [
                                /(lbbrowser)/i, // LieBao Browser
                                /\[(linkedin)app\]/i, // LinkedIn App for iOS & Android
                            ],
                            [NAME],
                            [
                                // WebView
                                /((?:fban\/fbios|fb_iab\/fb4a)(?!.+fbav)|;fbav\/([\w\.]+);)/i, // Facebook App for iOS & Android
                            ],
                            [[NAME, FACEBOOK], VERSION],
                            [
                                /(Klarna)\/([\w\.]+)/i, // Klarna Shopping Browser for iOS & Android
                                /(kakao(?:talk|story))[\/ ]([\w\.]+)/i, // Kakao App
                                /(naver)\(.*?(\d+\.[\w\.]+).*\)/i, // Naver InApp
                                /safari (line)\/([\w\.]+)/i, // Line App for iOS
                                /\b(line)\/([\w\.]+)\/iab/i, // Line App for Android
                                /(alipay)client\/([\w\.]+)/i, // Alipay
                                /(chromium|instagram|snapchat)[\/ ]([-\w\.]+)/i, // Chromium/Instagram/Snapchat
                            ],
                            [NAME, VERSION],
                            [
                                /\bgsa\/([\w\.]+) .*safari\//i, // Google Search Appliance on iOS
                            ],
                            [VERSION, [NAME, 'GSA']],
                            [
                                /musical_ly(?:.+app_?version\/|_)([\w\.]+)/i, // TikTok
                            ],
                            [VERSION, [NAME, 'TikTok']],
                            [
                                /headlesschrome(?:\/([\w\.]+)| )/i, // Chrome Headless
                            ],
                            [VERSION, [NAME, CHROME + ' Headless']],
                            [
                                / wv\).+(chrome)\/([\w\.]+)/i, // Chrome WebView
                            ],
                            [[NAME, CHROME + ' WebView'], VERSION],
                            [
                                /droid.+ version\/([\w\.]+)\b.+(?:mobile safari|safari)/i, // Android Browser
                            ],
                            [VERSION, [NAME, 'Android ' + BROWSER]],
                            [
                                /(chrome|omniweb|arora|[tizenoka]{5} ?browser)\/v?([\w\.]+)/i, // Chrome/OmniWeb/Arora/Tizen/Nokia
                            ],
                            [NAME, VERSION],
                            [
                                /version\/([\w\.\,]+) .*mobile\/\w+ (safari)/i, // Mobile Safari
                            ],
                            [VERSION, [NAME, 'Mobile Safari']],
                            [
                                /version\/([\w(\.|\,)]+) .*(mobile ?safari|safari)/i, // Safari & Safari Mobile
                            ],
                            [VERSION, NAME],
                            [
                                /webkit.+?(mobile ?safari|safari)(\/[\w\.]+)/i, // Safari < 3.0
                            ],
                            [NAME, [VERSION, strMapper, oldSafariMap]],
                            [/(webkit|khtml)\/([\w\.]+)/i],
                            [NAME, VERSION],
                            [
                                // Gecko based
                                /(navigator|netscape\d?)\/([-\w\.]+)/i, // Netscape
                            ],
                            [[NAME, 'Netscape'], VERSION],
                            [
                                /mobile vr; rv:([\w\.]+)\).+firefox/i, // Firefox Reality
                            ],
                            [VERSION, [NAME, FIREFOX + ' Reality']],
                            [
                                /ekiohf.+(flow)\/([\w\.]+)/i, // Flow
                                /(swiftfox)/i, // Swiftfox
                                /(icedragon|iceweasel|camino|chimera|fennec|maemo browser|minimo|conkeror|klar)[\/ ]?([\w\.\+]+)/i,
                                // IceDragon/Iceweasel/Camino/Chimera/Fennec/Maemo/Minimo/Conkeror/Klar
                                /(seamonkey|k-meleon|icecat|iceape|firebird|phoenix|palemoon|basilisk|waterfox)\/([-\w\.]+)$/i,
                                // Firefox/SeaMonkey/K-Meleon/IceCat/IceApe/Firebird/Phoenix
                                /(firefox)\/([\w\.]+)/i, // Other Firefox-based
                                /(mozilla)\/([\w\.]+) .+rv\:.+gecko\/\d+/i, // Mozilla

                                // Other
                                /(polaris|lynx|dillo|icab|doris|amaya|w3m|netsurf|sleipnir|obigo|mosaic|(?:go|ice|up)[\. ]?browser)[-\/ ]?v?([\w\.]+)/i,
                                // Polaris/Lynx/Dillo/iCab/Doris/Amaya/w3m/NetSurf/Sleipnir/Obigo/Mosaic/Go/ICE/UP.Browser
                                /(links) \(([\w\.]+)/i, // Links
                                /panasonic;(viera)/i, // Panasonic Viera
                            ],
                            [NAME, VERSION],
                            [
                                /(cobalt)\/([\w\.]+)/i, // Cobalt
                            ],
                            [NAME, [VERSION, /master.|lts./, '']],
                        ],

                        cpu: [
                            [
                                /(?:(amd|x(?:(?:86|64)[-_])?|wow|win)64)[;\)]/i, // AMD64 (x64)
                            ],
                            [[ARCHITECTURE, 'amd64']],
                            [
                                /(ia32(?=;))/i, // IA32 (quicktime)
                            ],
                            [[ARCHITECTURE, lowerize]],
                            [
                                /((?:i[346]|x)86)[;\)]/i, // IA32 (x86)
                            ],
                            [[ARCHITECTURE, 'ia32']],
                            [
                                /\b(aarch64|arm(v?8e?l?|_?64))\b/i, // ARM64
                            ],
                            [[ARCHITECTURE, 'arm64']],
                            [
                                /\b(arm(?:v[67])?ht?n?[fl]p?)\b/i, // ARMHF
                            ],
                            [[ARCHITECTURE, 'armhf']],
                            [
                                // PocketPC mistakenly identified as PowerPC
                                /windows (ce|mobile); ppc;/i,
                            ],
                            [[ARCHITECTURE, 'arm']],
                            [
                                /((?:ppc|powerpc)(?:64)?)(?: mac|;|\))/i, // PowerPC
                            ],
                            [[ARCHITECTURE, /ower/, EMPTY, lowerize]],
                            [
                                /(sun4\w)[;\)]/i, // SPARC
                            ],
                            [[ARCHITECTURE, 'sparc']],
                            [
                                /((?:avr32|ia64(?=;))|68k(?=\))|\barm(?=v(?:[1-7]|[5-7]1)l?|;|eabi)|(?=atmel )avr|(?:irix|mips|sparc)(?:64)?\b|pa-risc)/i,
                                // IA64, 68K, ARM/64, AVR/32, IRIX/64, MIPS/64, SPARC/64, PA-RISC
                            ],
                            [[ARCHITECTURE, lowerize]],
                        ],

                        device: [
                            [
                                //////////////////////////
                                // MOBILES & TABLETS
                                /////////////////////////

                                // Samsung
                                /\b(sch-i[89]0\d|shw-m380s|sm-[ptx]\w{2,4}|gt-[pn]\d{2,4}|sgh-t8[56]9|nexus 10)/i,
                            ],
                            [MODEL, [VENDOR, SAMSUNG], [TYPE, TABLET]],
                            [
                                /\b((?:s[cgp]h|gt|sm)-\w+|sc[g-]?[\d]+a?|galaxy nexus)/i,
                                /samsung[- ]([-\w]+)/i,
                                /sec-(sgh\w+)/i,
                            ],
                            [MODEL, [VENDOR, SAMSUNG], [TYPE, MOBILE]],
                            [
                                // Apple
                                /(?:\/|\()(ip(?:hone|od)[\w, ]*)(?:\/|;)/i, // iPod/iPhone
                            ],
                            [MODEL, [VENDOR, APPLE], [TYPE, MOBILE]],
                            [
                                /\((ipad);[-\w\),; ]+apple/i, // iPad
                                /applecoremedia\/[\w\.]+ \((ipad)/i,
                                /\b(ipad)\d\d?,\d\d?[;\]].+ios/i,
                            ],
                            [MODEL, [VENDOR, APPLE], [TYPE, TABLET]],
                            [/(macintosh);/i],
                            [MODEL, [VENDOR, APPLE]],
                            [
                                // Sharp
                                /\b(sh-?[altvz]?\d\d[a-ekm]?)/i,
                            ],
                            [MODEL, [VENDOR, SHARP], [TYPE, MOBILE]],
                            [
                                // Huawei
                                /\b((?:ag[rs][23]?|bah2?|sht?|btv)-a?[lw]\d{2})\b(?!.+d\/s)/i,
                            ],
                            [MODEL, [VENDOR, HUAWEI], [TYPE, TABLET]],
                            [
                                /(?:huawei|honor)([-\w ]+)[;\)]/i,
                                /\b(nexus 6p|\w{2,4}e?-[atu]?[ln][\dx][012359c][adn]?)\b(?!.+d\/s)/i,
                            ],
                            [MODEL, [VENDOR, HUAWEI], [TYPE, MOBILE]],
                            [
                                // Xiaomi
                                /\b(poco[\w ]+|m2\d{3}j\d\d[a-z]{2})(?: bui|\))/i, // Xiaomi POCO
                                /\b; (\w+) build\/hm\1/i, // Xiaomi Hongmi 'numeric' models
                                /\b(hm[-_ ]?note?[_ ]?(?:\d\w)?) bui/i, // Xiaomi Hongmi
                                /\b(redmi[\-_ ]?(?:note|k)?[\w_ ]+)(?: bui|\))/i, // Xiaomi Redmi
                                /oid[^\)]+; (m?[12][0-389][01]\w{3,6}[c-y])( bui|; wv|\))/i, // Xiaomi Redmi 'numeric' models
                                /\b(mi[-_ ]?(?:a\d|one|one[_ ]plus|note lte|max|cc)?[_ ]?(?:\d?\w?)[_ ]?(?:plus|se|lite)?)(?: bui|\))/i, // Xiaomi Mi
                            ],
                            [
                                [MODEL, /_/g, ' '],
                                [VENDOR, XIAOMI],
                                [TYPE, MOBILE],
                            ],
                            [
                                /oid[^\)]+; (2\d{4}(283|rpbf)[cgl])( bui|\))/i, // Redmi Pad
                                /\b(mi[-_ ]?(?:pad)(?:[\w_ ]+))(?: bui|\))/i, // Mi Pad tablets
                            ],
                            [
                                [MODEL, /_/g, ' '],
                                [VENDOR, XIAOMI],
                                [TYPE, TABLET],
                            ],
                            [
                                // OPPO
                                /; (\w+) bui.+ oppo/i,
                                /\b(cph[12]\d{3}|p(?:af|c[al]|d\w|e[ar])[mt]\d0|x9007|a101op)\b/i,
                            ],
                            [MODEL, [VENDOR, 'OPPO'], [TYPE, MOBILE]],
                            [
                                // Vivo
                                /vivo (\w+)(?: bui|\))/i,
                                /\b(v[12]\d{3}\w?[at])(?: bui|;)/i,
                            ],
                            [MODEL, [VENDOR, 'Vivo'], [TYPE, MOBILE]],
                            [
                                // Realme
                                /\b(rmx[1-3]\d{3})(?: bui|;|\))/i,
                            ],
                            [MODEL, [VENDOR, 'Realme'], [TYPE, MOBILE]],
                            [
                                // Motorola
                                /\b(milestone|droid(?:[2-4x]| (?:bionic|x2|pro|razr))?:?( 4g)?)\b[\w ]+build\//i,
                                /\bmot(?:orola)?[- ](\w*)/i,
                                /((?:moto[\w\(\) ]+|xt\d{3,4}|nexus 6)(?= bui|\)))/i,
                            ],
                            [MODEL, [VENDOR, MOTOROLA], [TYPE, MOBILE]],
                            [/\b(mz60\d|xoom[2 ]{0,2}) build\//i],
                            [MODEL, [VENDOR, MOTOROLA], [TYPE, TABLET]],
                            [
                                // LG
                                /((?=lg)?[vl]k\-?\d{3}) bui| 3\.[-\w; ]{10}lg?-([06cv9]{3,4})/i,
                            ],
                            [MODEL, [VENDOR, LG], [TYPE, TABLET]],
                            [
                                /(lm(?:-?f100[nv]?|-[\w\.]+)(?= bui|\))|nexus [45])/i,
                                /\blg[-e;\/ ]+((?!browser|netcast|android tv)\w+)/i,
                                /\blg-?([\d\w]+) bui/i,
                            ],
                            [MODEL, [VENDOR, LG], [TYPE, MOBILE]],
                            [
                                // Lenovo
                                /(ideatab[-\w ]+)/i,
                                /lenovo ?(s[56]000[-\w]+|tab(?:[\w ]+)|yt[-\d\w]{6}|tb[-\d\w]{6})/i,
                            ],
                            [MODEL, [VENDOR, 'Lenovo'], [TYPE, TABLET]],
                            [
                                // Nokia
                                /(?:maemo|nokia).*(n900|lumia \d+)/i,
                                /nokia[-_ ]?([-\w\.]*)/i,
                            ],
                            [
                                [MODEL, /_/g, ' '],
                                [VENDOR, 'Nokia'],
                                [TYPE, MOBILE],
                            ],
                            [
                                // Google
                                /(pixel c)\b/i, // Google Pixel C
                            ],
                            [MODEL, [VENDOR, GOOGLE], [TYPE, TABLET]],
                            [
                                /droid.+; (pixel[\daxl ]{0,6})(?: bui|\))/i, // Google Pixel
                            ],
                            [MODEL, [VENDOR, GOOGLE], [TYPE, MOBILE]],
                            [
                                // Sony
                                /droid.+ (a?\d[0-2]{2}so|[c-g]\d{4}|so[-gl]\w+|xq-a\w[4-7][12])(?= bui|\).+chrome\/(?![1-6]{0,1}\d\.))/i,
                            ],
                            [MODEL, [VENDOR, SONY], [TYPE, MOBILE]],
                            [/sony tablet [ps]/i, /\b(?:sony)?sgp\w+(?: bui|\))/i],
                            [
                                [MODEL, 'Xperia Tablet'],
                                [VENDOR, SONY],
                                [TYPE, TABLET],
                            ],
                            [
                                // OnePlus
                                / (kb2005|in20[12]5|be20[12][59])\b/i,
                                /(?:one)?(?:plus)? (a\d0\d\d)(?: b|\))/i,
                            ],
                            [MODEL, [VENDOR, 'OnePlus'], [TYPE, MOBILE]],
                            [
                                // Amazon
                                /(alexa)webm/i,
                                /(kf[a-z]{2}wi|aeo[c-r]{2})( bui|\))/i, // Kindle Fire without Silk / Echo Show
                                /(kf[a-z]+)( bui|\)).+silk\//i, // Kindle Fire HD
                            ],
                            [MODEL, [VENDOR, AMAZON], [TYPE, TABLET]],
                            [
                                /((?:sd|kf)[0349hijorstuw]+)( bui|\)).+silk\//i, // Fire Phone
                            ],
                            [
                                [MODEL, /(.+)/g, 'Fire Phone $1'],
                                [VENDOR, AMAZON],
                                [TYPE, MOBILE],
                            ],
                            [
                                // BlackBerry
                                /(playbook);[-\w\),; ]+(rim)/i, // BlackBerry PlayBook
                            ],
                            [MODEL, VENDOR, [TYPE, TABLET]],
                            [
                                /\b((?:bb[a-f]|st[hv])100-\d)/i,
                                /\(bb10; (\w+)/i, // BlackBerry 10
                            ],
                            [MODEL, [VENDOR, BLACKBERRY], [TYPE, MOBILE]],
                            [
                                // Asus
                                /(?:\b|asus_)(transfo[prime ]{4,10} \w+|eeepc|slider \w+|nexus 7|padfone|p00[cj])/i,
                            ],
                            [MODEL, [VENDOR, ASUS], [TYPE, TABLET]],
                            [/ (z[bes]6[027][012][km][ls]|zenfone \d\w?)\b/i],
                            [MODEL, [VENDOR, ASUS], [TYPE, MOBILE]],
                            [
                                // HTC
                                /(nexus 9)/i, // HTC Nexus 9
                            ],
                            [MODEL, [VENDOR, 'HTC'], [TYPE, TABLET]],
                            [
                                /(htc)[-;_ ]{1,2}([\w ]+(?=\)| bui)|\w+)/i, // HTC

                                // ZTE
                                /(zte)[- ]([\w ]+?)(?: bui|\/|\))/i,
                                /(alcatel|geeksphone|nexian|panasonic(?!(?:;|\.))|sony(?!-bra))[-_ ]?([-\w]*)/i, // Alcatel/GeeksPhone/Nexian/Panasonic/Sony
                            ],
                            [VENDOR, [MODEL, /_/g, ' '], [TYPE, MOBILE]],
                            [
                                // Acer
                                /droid.+; ([ab][1-7]-?[0178a]\d\d?)/i,
                            ],
                            [MODEL, [VENDOR, 'Acer'], [TYPE, TABLET]],
                            [
                                // Meizu
                                /droid.+; (m[1-5] note) bui/i,
                                /\bmz-([-\w]{2,})/i,
                            ],
                            [MODEL, [VENDOR, 'Meizu'], [TYPE, MOBILE]],
                            [
                                // Ulefone
                                /; ((?:power )?armor(?:[\w ]{0,8}))(?: bui|\))/i,
                            ],
                            [MODEL, [VENDOR, 'Ulefone'], [TYPE, MOBILE]],
                            [
                                // MIXED
                                /(blackberry|benq|palm(?=\-)|sonyericsson|acer|asus|dell|meizu|motorola|polytron|infinix|tecno)[-_ ]?([-\w]*)/i,
                                // BlackBerry/BenQ/Palm/Sony-Ericsson/Acer/Asus/Dell/Meizu/Motorola/Polytron
                                /(hp) ([\w ]+\w)/i, // HP iPAQ
                                /(asus)-?(\w+)/i, // Asus
                                /(microsoft); (lumia[\w ]+)/i, // Microsoft Lumia
                                /(lenovo)[-_ ]?([-\w]+)/i, // Lenovo
                                /(jolla)/i, // Jolla
                                /(oppo) ?([\w ]+) bui/i, // OPPO
                            ],
                            [VENDOR, MODEL, [TYPE, MOBILE]],
                            [
                                /(kobo)\s(ereader|touch)/i, // Kobo
                                /(archos) (gamepad2?)/i, // Archos
                                /(hp).+(touchpad(?!.+tablet)|tablet)/i, // HP TouchPad
                                /(kindle)\/([\w\.]+)/i, // Kindle
                                /(nook)[\w ]+build\/(\w+)/i, // Nook
                                /(dell) (strea[kpr\d ]*[\dko])/i, // Dell Streak
                                /(le[- ]+pan)[- ]+(\w{1,9}) bui/i, // Le Pan Tablets
                                /(trinity)[- ]*(t\d{3}) bui/i, // Trinity Tablets
                                /(gigaset)[- ]+(q\w{1,9}) bui/i, // Gigaset Tablets
                                /(vodafone) ([\w ]+)(?:\)| bui)/i, // Vodafone
                            ],
                            [VENDOR, MODEL, [TYPE, TABLET]],
                            [
                                /(surface duo)/i, // Surface Duo
                            ],
                            [MODEL, [VENDOR, MICROSOFT], [TYPE, TABLET]],
                            [
                                /droid [\d\.]+; (fp\du?)(?: b|\))/i, // Fairphone
                            ],
                            [MODEL, [VENDOR, 'Fairphone'], [TYPE, MOBILE]],
                            [
                                /(u304aa)/i, // AT&T
                            ],
                            [MODEL, [VENDOR, 'AT&T'], [TYPE, MOBILE]],
                            [
                                /\bsie-(\w*)/i, // Siemens
                            ],
                            [MODEL, [VENDOR, 'Siemens'], [TYPE, MOBILE]],
                            [
                                /\b(rct\w+) b/i, // RCA Tablets
                            ],
                            [MODEL, [VENDOR, 'RCA'], [TYPE, TABLET]],
                            [
                                /\b(venue[\d ]{2,7}) b/i, // Dell Venue Tablets
                            ],
                            [MODEL, [VENDOR, 'Dell'], [TYPE, TABLET]],
                            [
                                /\b(q(?:mv|ta)\w+) b/i, // Verizon Tablet
                            ],
                            [MODEL, [VENDOR, 'Verizon'], [TYPE, TABLET]],
                            [
                                /\b(?:barnes[& ]+noble |bn[rt])([\w\+ ]*) b/i, // Barnes & Noble Tablet
                            ],
                            [MODEL, [VENDOR, 'Barnes & Noble'], [TYPE, TABLET]],
                            [/\b(tm\d{3}\w+) b/i],
                            [MODEL, [VENDOR, 'NuVision'], [TYPE, TABLET]],
                            [
                                /\b(k88) b/i, // ZTE K Series Tablet
                            ],
                            [MODEL, [VENDOR, 'ZTE'], [TYPE, TABLET]],
                            [
                                /\b(nx\d{3}j) b/i, // ZTE Nubia
                            ],
                            [MODEL, [VENDOR, 'ZTE'], [TYPE, MOBILE]],
                            [
                                /\b(gen\d{3}) b.+49h/i, // Swiss GEN Mobile
                            ],
                            [MODEL, [VENDOR, 'Swiss'], [TYPE, MOBILE]],
                            [
                                /\b(zur\d{3}) b/i, // Swiss ZUR Tablet
                            ],
                            [MODEL, [VENDOR, 'Swiss'], [TYPE, TABLET]],
                            [
                                /\b((zeki)?tb.*\b) b/i, // Zeki Tablets
                            ],
                            [MODEL, [VENDOR, 'Zeki'], [TYPE, TABLET]],
                            [
                                /\b([yr]\d{2}) b/i,
                                /\b(dragon[- ]+touch |dt)(\w{5}) b/i, // Dragon Touch Tablet
                            ],
                            [[VENDOR, 'Dragon Touch'], MODEL, [TYPE, TABLET]],
                            [
                                /\b(ns-?\w{0,9}) b/i, // Insignia Tablets
                            ],
                            [MODEL, [VENDOR, 'Insignia'], [TYPE, TABLET]],
                            [
                                /\b((nxa|next)-?\w{0,9}) b/i, // NextBook Tablets
                            ],
                            [MODEL, [VENDOR, 'NextBook'], [TYPE, TABLET]],
                            [
                                /\b(xtreme\_)?(v(1[045]|2[015]|[3469]0|7[05])) b/i, // Voice Xtreme Phones
                            ],
                            [[VENDOR, 'Voice'], MODEL, [TYPE, MOBILE]],
                            [
                                /\b(lvtel\-)?(v1[12]) b/i, // LvTel Phones
                            ],
                            [[VENDOR, 'LvTel'], MODEL, [TYPE, MOBILE]],
                            [
                                /\b(ph-1) /i, // Essential PH-1
                            ],
                            [MODEL, [VENDOR, 'Essential'], [TYPE, MOBILE]],
                            [
                                /\b(v(100md|700na|7011|917g).*\b) b/i, // Envizen Tablets
                            ],
                            [MODEL, [VENDOR, 'Envizen'], [TYPE, TABLET]],
                            [
                                /\b(trio[-\w\. ]+) b/i, // MachSpeed Tablets
                            ],
                            [MODEL, [VENDOR, 'MachSpeed'], [TYPE, TABLET]],
                            [
                                /\btu_(1491) b/i, // Rotor Tablets
                            ],
                            [MODEL, [VENDOR, 'Rotor'], [TYPE, TABLET]],
                            [
                                /(shield[\w ]+) b/i, // Nvidia Shield Tablets
                            ],
                            [MODEL, [VENDOR, 'Nvidia'], [TYPE, TABLET]],
                            [
                                /(sprint) (\w+)/i, // Sprint Phones
                            ],
                            [VENDOR, MODEL, [TYPE, MOBILE]],
                            [
                                /(kin\.[onetw]{3})/i, // Microsoft Kin
                            ],
                            [
                                [MODEL, /\./g, ' '],
                                [VENDOR, MICROSOFT],
                                [TYPE, MOBILE],
                            ],
                            [
                                /droid.+; (cc6666?|et5[16]|mc[239][23]x?|vc8[03]x?)\)/i, // Zebra
                            ],
                            [MODEL, [VENDOR, ZEBRA], [TYPE, TABLET]],
                            [/droid.+; (ec30|ps20|tc[2-8]\d[kx])\)/i],
                            [MODEL, [VENDOR, ZEBRA], [TYPE, MOBILE]],
                            [
                                ///////////////////
                                // SMARTTVS
                                ///////////////////

                                /smart-tv.+(samsung)/i, // Samsung
                            ],
                            [VENDOR, [TYPE, SMARTTV]],
                            [/hbbtv.+maple;(\d+)/i],
                            [
                                [MODEL, /^/, 'SmartTV'],
                                [VENDOR, SAMSUNG],
                                [TYPE, SMARTTV],
                            ],
                            [
                                /(nux; netcast.+smarttv|lg (netcast\.tv-201\d|android tv))/i, // LG SmartTV
                            ],
                            [
                                [VENDOR, LG],
                                [TYPE, SMARTTV],
                            ],
                            [
                                /(apple) ?tv/i, // Apple TV
                            ],
                            [VENDOR, [MODEL, APPLE + ' TV'], [TYPE, SMARTTV]],
                            [
                                /crkey/i, // Google Chromecast
                            ],
                            [
                                [MODEL, CHROME + 'cast'],
                                [VENDOR, GOOGLE],
                                [TYPE, SMARTTV],
                            ],
                            [
                                /droid.+aft(\w+)( bui|\))/i, // Fire TV
                            ],
                            [MODEL, [VENDOR, AMAZON], [TYPE, SMARTTV]],
                            [
                                /\(dtv[\);].+(aquos)/i,
                                /(aquos-tv[\w ]+)\)/i, // Sharp
                            ],
                            [MODEL, [VENDOR, SHARP], [TYPE, SMARTTV]],
                            [
                                /(bravia[\w ]+)( bui|\))/i, // Sony
                            ],
                            [MODEL, [VENDOR, SONY], [TYPE, SMARTTV]],
                            [
                                /(mitv-\w{5}) bui/i, // Xiaomi
                            ],
                            [MODEL, [VENDOR, XIAOMI], [TYPE, SMARTTV]],
                            [
                                /Hbbtv.*(technisat) (.*);/i, // TechniSAT
                            ],
                            [VENDOR, MODEL, [TYPE, SMARTTV]],
                            [
                                /\b(roku)[\dx]*[\)\/]((?:dvp-)?[\d\.]*)/i, // Roku
                                /hbbtv\/\d+\.\d+\.\d+ +\([\w\+ ]*; *([\w\d][^;]*);([^;]*)/i, // HbbTV devices
                            ],
                            [
                                [VENDOR, trim],
                                [MODEL, trim],
                                [TYPE, SMARTTV],
                            ],
                            [
                                /\b(android tv|smart[- ]?tv|opera tv|tv; rv:)\b/i, // SmartTV from Unidentified Vendors
                            ],
                            [[TYPE, SMARTTV]],
                            [
                                ///////////////////
                                // CONSOLES
                                ///////////////////

                                /(ouya)/i, // Ouya
                                /(nintendo) ([wids3utch]+)/i, // Nintendo
                            ],
                            [VENDOR, MODEL, [TYPE, CONSOLE]],
                            [
                                /droid.+; (shield) bui/i, // Nvidia
                            ],
                            [MODEL, [VENDOR, 'Nvidia'], [TYPE, CONSOLE]],
                            [
                                /(playstation [345portablevi]+)/i, // Playstation
                            ],
                            [MODEL, [VENDOR, SONY], [TYPE, CONSOLE]],
                            [
                                /\b(xbox(?: one)?(?!; xbox))[\); ]/i, // Microsoft Xbox
                            ],
                            [MODEL, [VENDOR, MICROSOFT], [TYPE, CONSOLE]],
                            [
                                ///////////////////
                                // WEARABLES
                                ///////////////////

                                /((pebble))app/i, // Pebble
                            ],
                            [VENDOR, MODEL, [TYPE, WEARABLE]],
                            [
                                /(watch)(?: ?os[,\/]|\d,\d\/)[\d\.]+/i, // Apple Watch
                            ],
                            [MODEL, [VENDOR, APPLE], [TYPE, WEARABLE]],
                            [
                                /droid.+; (glass) \d/i, // Google Glass
                            ],
                            [MODEL, [VENDOR, GOOGLE], [TYPE, WEARABLE]],
                            [/droid.+; (wt63?0{2,3})\)/i],
                            [MODEL, [VENDOR, ZEBRA], [TYPE, WEARABLE]],
                            [
                                /(quest( 2| pro)?)/i, // Oculus Quest
                            ],
                            [MODEL, [VENDOR, FACEBOOK], [TYPE, WEARABLE]],
                            [
                                ///////////////////
                                // EMBEDDED
                                ///////////////////

                                /(tesla)(?: qtcarbrowser|\/[-\w\.]+)/i, // Tesla
                            ],
                            [VENDOR, [TYPE, EMBEDDED]],
                            [
                                /(aeobc)\b/i, // Echo Dot
                            ],
                            [MODEL, [VENDOR, AMAZON], [TYPE, EMBEDDED]],
                            [
                                ////////////////////
                                // MIXED (GENERIC)
                                ///////////////////

                                /droid .+?; ([^;]+?)(?: bui|; wv\)|\) applew).+? mobile safari/i, // Android Phones from Unidentified Vendors
                            ],
                            [MODEL, [TYPE, MOBILE]],
                            [
                                /droid .+?; ([^;]+?)(?: bui|\) applew).+?(?! mobile) safari/i, // Android Tablets from Unidentified Vendors
                            ],
                            [MODEL, [TYPE, TABLET]],
                            [
                                /\b((tablet|tab)[;\/]|focus\/\d(?!.+mobile))/i, // Unidentifiable Tablet
                            ],
                            [[TYPE, TABLET]],
                            [
                                /(phone|mobile(?:[;\/]| [ \w\/\.]*safari)|pda(?=.+windows ce))/i, // Unidentifiable Mobile
                            ],
                            [[TYPE, MOBILE]],
                            [
                                /(android[-\w\. ]{0,9});.+buil/i, // Generic Android Device
                            ],
                            [MODEL, [VENDOR, 'Generic']],
                        ],

                        engine: [
                            [
                                /windows.+ edge\/([\w\.]+)/i, // EdgeHTML
                            ],
                            [VERSION, [NAME, EDGE + 'HTML']],
                            [
                                /webkit\/537\.36.+chrome\/(?!27)([\w\.]+)/i, // Blink
                            ],
                            [VERSION, [NAME, 'Blink']],
                            [
                                /(presto)\/([\w\.]+)/i, // Presto
                                /(webkit|trident|netfront|netsurf|amaya|lynx|w3m|goanna)\/([\w\.]+)/i, // WebKit/Trident/NetFront/NetSurf/Amaya/Lynx/w3m/Goanna
                                /ekioh(flow)\/([\w\.]+)/i, // Flow
                                /(khtml|tasman|links)[\/ ]\(?([\w\.]+)/i, // KHTML/Tasman/Links
                                /(icab)[\/ ]([23]\.[\d\.]+)/i, // iCab
                                /\b(libweb)/i,
                            ],
                            [NAME, VERSION],
                            [
                                /rv\:([\w\.]{1,9})\b.+(gecko)/i, // Gecko
                            ],
                            [VERSION, NAME],
                        ],

                        os: [
                            [
                                // Windows
                                /microsoft (windows) (vista|xp)/i, // Windows (iTunes)
                            ],
                            [NAME, VERSION],
                            [
                                /(windows (?:phone(?: os)?|mobile))[\/ ]?([\d\.\w ]*)/i, // Windows Phone
                            ],
                            [NAME, [VERSION, strMapper, windowsVersionMap]],
                            [
                                /windows nt 6\.2; (arm)/i, // Windows RT
                                /windows[\/ ]?([ntce\d\. ]+\w)(?!.+xbox)/i,
                                /(?:win(?=3|9|n)|win 9x )([nt\d\.]+)/i,
                            ],
                            [
                                [VERSION, strMapper, windowsVersionMap],
                                [NAME, 'Windows'],
                            ],
                            [
                                // iOS/macOS
                                /ip[honead]{2,4}\b(?:.*os ([\w]+) like mac|; opera)/i, // iOS
                                /(?:ios;fbsv\/|iphone.+ios[\/ ])([\d\.]+)/i,
                                /cfnetwork\/.+darwin/i,
                            ],
                            [
                                [VERSION, /_/g, '.'],
                                [NAME, 'iOS'],
                            ],
                            [
                                /(mac os x) ?([\w\. ]*)/i,
                                /(macintosh|mac_powerpc\b)(?!.+haiku)/i, // Mac OS
                            ],
                            [
                                [NAME, MAC_OS],
                                [VERSION, /_/g, '.'],
                            ],
                            [
                                // Mobile OSes
                                /droid ([\w\.]+)\b.+(android[- ]x86|harmonyos)/i, // Android-x86/HarmonyOS
                            ],
                            [VERSION, NAME],
                            [
                                // Android/WebOS/QNX/Bada/RIM/Maemo/MeeGo/Sailfish OS
                                /(android|webos|qnx|bada|rim tablet os|maemo|meego|sailfish)[-\/ ]?([\w\.]*)/i,
                                /(blackberry)\w*\/([\w\.]*)/i, // Blackberry
                                /(tizen|kaios)[\/ ]([\w\.]+)/i, // Tizen/KaiOS
                                /\((series40);/i, // Series 40
                            ],
                            [NAME, VERSION],
                            [
                                /\(bb(10);/i, // BlackBerry 10
                            ],
                            [VERSION, [NAME, BLACKBERRY]],
                            [
                                /(?:symbian ?os|symbos|s60(?=;)|series60)[-\/ ]?([\w\.]*)/i, // Symbian
                            ],
                            [VERSION, [NAME, 'Symbian']],
                            [
                                /mozilla\/[\d\.]+ \((?:mobile|tablet|tv|mobile; [\w ]+); rv:.+ gecko\/([\w\.]+)/i, // Firefox OS
                            ],
                            [VERSION, [NAME, FIREFOX + ' OS']],
                            [
                                /web0s;.+rt(tv)/i,
                                /\b(?:hp)?wos(?:browser)?\/([\w\.]+)/i, // WebOS
                            ],
                            [VERSION, [NAME, 'webOS']],
                            [
                                /watch(?: ?os[,\/]|\d,\d\/)([\d\.]+)/i, // watchOS
                            ],
                            [VERSION, [NAME, 'watchOS']],
                            [
                                // Google Chromecast
                                /crkey\/([\d\.]+)/i, // Google Chromecast
                            ],
                            [VERSION, [NAME, CHROME + 'cast']],
                            [
                                /(cros) [\w]+(?:\)| ([\w\.]+)\b)/i, // Chromium OS
                            ],
                            [[NAME, CHROMIUM_OS], VERSION],
                            [
                                // Smart TVs
                                /panasonic;(viera)/i, // Panasonic Viera
                                /(netrange)mmh/i, // Netrange
                                /(nettv)\/(\d+\.[\w\.]+)/i, // NetTV

                                // Console
                                /(nintendo|playstation) ([wids345portablevuch]+)/i, // Nintendo/Playstation
                                /(xbox); +xbox ([^\);]+)/i, // Microsoft Xbox (360, One, X, S, Series X, Series S)

                                // Other
                                /\b(joli|palm)\b ?(?:os)?\/?([\w\.]*)/i, // Joli/Palm
                                /(mint)[\/\(\) ]?(\w*)/i, // Mint
                                /(mageia|vectorlinux)[; ]/i, // Mageia/VectorLinux
                                /([kxln]?ubuntu|debian|suse|opensuse|gentoo|arch(?= linux)|slackware|fedora|mandriva|centos|pclinuxos|red ?hat|zenwalk|linpus|raspbian|plan 9|minix|risc os|contiki|deepin|manjaro|elementary os|sabayon|linspire)(?: gnu\/linux)?(?: enterprise)?(?:[- ]linux)?(?:-gnu)?[-\/ ]?(?!chrom|package)([-\w\.]*)/i,
                                // Ubuntu/Debian/SUSE/Gentoo/Arch/Slackware/Fedora/Mandriva/CentOS/PCLinuxOS/RedHat/Zenwalk/Linpus/Raspbian/Plan9/Minix/RISCOS/Contiki/Deepin/Manjaro/elementary/Sabayon/Linspire
                                /(hurd|linux) ?([\w\.]*)/i, // Hurd/Linux
                                /(gnu) ?([\w\.]*)/i, // GNU
                                /\b([-frentopcghs]{0,5}bsd|dragonfly)[\/ ]?(?!amd|[ix346]{1,2}86)([\w\.]*)/i, // FreeBSD/NetBSD/OpenBSD/PC-BSD/GhostBSD/DragonFly
                                /(haiku) (\w+)/i, // Haiku
                            ],
                            [NAME, VERSION],
                            [
                                /(sunos) ?([\w\.\d]*)/i, // Solaris
                            ],
                            [[NAME, 'Solaris'], VERSION],
                            [
                                /((?:open)?solaris)[-\/ ]?([\w\.]*)/i, // Solaris
                                /(aix) ((\d)(?=\.|\)| )[\w\.])*/i, // AIX
                                /\b(beos|os\/2|amigaos|morphos|openvms|fuchsia|hp-ux|serenityos)/i, // BeOS/OS2/AmigaOS/MorphOS/OpenVMS/Fuchsia/HP-UX/SerenityOS
                                /(unix) ?([\w\.]*)/i, // UNIX
                            ],
                            [NAME, VERSION],
                        ],
                    };

                    /////////////////
                    // Constructor
                    ////////////////

                    var UAParser = function (ua, extensions) {
                        if (typeof ua === OBJ_TYPE) {
                            extensions = ua;
                            ua = undefined;
                        }

                        if (!(this instanceof UAParser)) {
                            return new UAParser(ua, extensions).getResult();
                        }

                        var _navigator =
                            typeof window !== UNDEF_TYPE && window.navigator ? window.navigator : undefined;
                        var _ua = ua || (_navigator && _navigator.userAgent ? _navigator.userAgent : EMPTY);
                        var _uach = _navigator && _navigator.userAgentData ? _navigator.userAgentData : undefined;
                        var _rgxmap = extensions ? extend(regexes, extensions) : regexes;
                        var _isSelfNav = _navigator && _navigator.userAgent == _ua;

                        this.getBrowser = function () {
                            var _browser = {};
                            _browser[NAME] = undefined;
                            _browser[VERSION] = undefined;
                            rgxMapper.call(_browser, _ua, _rgxmap.browser);
                            _browser[MAJOR] = majorize(_browser[VERSION]);
                            // Brave-specific detection
                            if (
                                _isSelfNav &&
                                _navigator &&
                                _navigator.brave &&
                                typeof _navigator.brave.isBrave == FUNC_TYPE
                            ) {
                                _browser[NAME] = 'Brave';
                            }
                            return _browser;
                        };
                        this.getCPU = function () {
                            var _cpu = {};
                            _cpu[ARCHITECTURE] = undefined;
                            rgxMapper.call(_cpu, _ua, _rgxmap.cpu);
                            return _cpu;
                        };
                        this.getDevice = function () {
                            var _device = {};
                            _device[VENDOR] = undefined;
                            _device[MODEL] = undefined;
                            _device[TYPE] = undefined;
                            rgxMapper.call(_device, _ua, _rgxmap.device);
                            if (_isSelfNav && !_device[TYPE] && _uach && _uach.mobile) {
                                _device[TYPE] = MOBILE;
                            }
                            // iPadOS-specific detection: identified as Mac, but has some iOS-only properties
                            if (
                                _isSelfNav &&
                                _device[MODEL] == 'Macintosh' &&
                                _navigator &&
                                typeof _navigator.standalone !== UNDEF_TYPE &&
                                _navigator.maxTouchPoints &&
                                _navigator.maxTouchPoints > 2
                            ) {
                                _device[MODEL] = 'iPad';
                                _device[TYPE] = TABLET;
                            }
                            return _device;
                        };
                        this.getEngine = function () {
                            var _engine = {};
                            _engine[NAME] = undefined;
                            _engine[VERSION] = undefined;
                            rgxMapper.call(_engine, _ua, _rgxmap.engine);
                            return _engine;
                        };
                        this.getOS = function () {
                            var _os = {};
                            _os[NAME] = undefined;
                            _os[VERSION] = undefined;
                            rgxMapper.call(_os, _ua, _rgxmap.os);
                            if (_isSelfNav && !_os[NAME] && _uach && _uach.platform != 'Unknown') {
                                _os[NAME] = _uach.platform.replace(/chrome os/i, CHROMIUM_OS).replace(/macos/i, MAC_OS); // backward compatibility
                            }
                            return _os;
                        };
                        this.getResult = function () {
                            return {
                                ua: this.getUA(),
                                browser: this.getBrowser(),
                                engine: this.getEngine(),
                                os: this.getOS(),
                                device: this.getDevice(),
                                cpu: this.getCPU(),
                            };
                        };
                        this.getUA = function () {
                            return _ua;
                        };
                        this.setUA = function (ua) {
                            _ua = typeof ua === STR_TYPE && ua.length > UA_MAX_LENGTH ? trim(ua, UA_MAX_LENGTH) : ua;
                            return this;
                        };
                        this.setUA(_ua);
                        return this;
                    };

                    UAParser.VERSION = LIBVERSION;
                    UAParser.BROWSER = enumerize([NAME, VERSION, MAJOR]);
                    UAParser.CPU = enumerize([ARCHITECTURE]);
                    UAParser.DEVICE = enumerize([
                        MODEL,
                        VENDOR,
                        TYPE,
                        CONSOLE,
                        MOBILE,
                        SMARTTV,
                        TABLET,
                        WEARABLE,
                        EMBEDDED,
                    ]);
                    UAParser.ENGINE = UAParser.OS = enumerize([NAME, VERSION]);

                    ///////////
                    // Export
                    //////////

                    // check js environment
                    if (typeof exports !== UNDEF_TYPE) {
                        // nodejs env
                        if (typeof module !== UNDEF_TYPE && module.exports) {
                            exports = module.exports = UAParser;
                        }
                        exports.UAParser = UAParser;
                    } else {
                        // requirejs env (optional)
                        if (typeof define === FUNC_TYPE && define.amd) {
                            define(function () {
                                return UAParser;
                            });
                        } else if (typeof window !== UNDEF_TYPE) {
                            // browser env
                            window.UAParser = UAParser;
                        }
                    }

                    // jQuery/Zepto specific (optional)
                    // Note:
                    //   In AMD env the global scope should be kept clean, but jQuery is an exception.
                    //   jQuery always exports to global scope, unless jQuery.noConflict(true) is used,
                    //   and we should catch that.
                    var $ = typeof window !== UNDEF_TYPE && (window.jQuery || window.Zepto);
                    if ($ && !$.ua) {
                        var parser = new UAParser();
                        $.ua = parser.getResult();
                        $.ua.get = function () {
                            return parser.getUA();
                        };
                        $.ua.set = function (ua) {
                            parser.setUA(ua);
                            var result = parser.getResult();
                            for (var prop in result) {
                                $.ua[prop] = result[prop];
                            }
                        };
                    }
                })(typeof window === 'object' ? window : this);
            },
            {},
        ],
        50: [
            function (require, module, exports) {
                const client = require('mediasoup-client');
                window.mediasoupClient = client;
            },
            { 'mediasoup-client': 38 },
        ],
        51: [
            function (require, module, exports) {
                // Copyright Joyent, Inc. and other Node contributors.
                //
                // Permission is hereby granted, free of charge, to any person obtaining a
                // copy of this software and associated documentation files (the
                // "Software"), to deal in the Software without restriction, including
                // without limitation the rights to use, copy, modify, merge, publish,
                // distribute, sublicense, and/or sell copies of the Software, and to permit
                // persons to whom the Software is furnished to do so, subject to the
                // following conditions:
                //
                // The above copyright notice and this permission notice shall be included
                // in all copies or substantial portions of the Software.
                //
                // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
                // OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
                // MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
                // NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
                // DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
                // OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
                // USE OR OTHER DEALINGS IN THE SOFTWARE.

                'use strict';

                var R = typeof Reflect === 'object' ? Reflect : null;
                var ReflectApply =
                    R && typeof R.apply === 'function'
                        ? R.apply
                        : function ReflectApply(target, receiver, args) {
                              return Function.prototype.apply.call(target, receiver, args);
                          };

                var ReflectOwnKeys;
                if (R && typeof R.ownKeys === 'function') {
                    ReflectOwnKeys = R.ownKeys;
                } else if (Object.getOwnPropertySymbols) {
                    ReflectOwnKeys = function ReflectOwnKeys(target) {
                        return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target));
                    };
                } else {
                    ReflectOwnKeys = function ReflectOwnKeys(target) {
                        return Object.getOwnPropertyNames(target);
                    };
                }

                function ProcessEmitWarning(warning) {
                    if (console && console.warn) console.warn(warning);
                }

                var NumberIsNaN =
                    Number.isNaN ||
                    function NumberIsNaN(value) {
                        return value !== value;
                    };

                function EventEmitter() {
                    EventEmitter.init.call(this);
                }
                module.exports = EventEmitter;
                module.exports.once = once;

                // Backwards-compat with node 0.10.x
                EventEmitter.EventEmitter = EventEmitter;

                EventEmitter.prototype._events = undefined;
                EventEmitter.prototype._eventsCount = 0;
                EventEmitter.prototype._maxListeners = undefined;

                // By default EventEmitters will print a warning if more than 10 listeners are
                // added to it. This is a useful default which helps finding memory leaks.
                var defaultMaxListeners = 10;

                function checkListener(listener) {
                    if (typeof listener !== 'function') {
                        throw new TypeError(
                            'The "listener" argument must be of type Function. Received type ' + typeof listener,
                        );
                    }
                }

                Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
                    enumerable: true,
                    get: function () {
                        return defaultMaxListeners;
                    },
                    set: function (arg) {
                        if (typeof arg !== 'number' || arg < 0 || NumberIsNaN(arg)) {
                            throw new RangeError(
                                'The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' +
                                    arg +
                                    '.',
                            );
                        }
                        defaultMaxListeners = arg;
                    },
                });

                EventEmitter.init = function () {
                    if (this._events === undefined || this._events === Object.getPrototypeOf(this)._events) {
                        this._events = Object.create(null);
                        this._eventsCount = 0;
                    }

                    this._maxListeners = this._maxListeners || undefined;
                };

                // Obviously not all Emitters should be limited to 10. This function allows
                // that to be increased. Set to zero for unlimited.
                EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
                    if (typeof n !== 'number' || n < 0 || NumberIsNaN(n)) {
                        throw new RangeError(
                            'The value of "n" is out of range. It must be a non-negative number. Received ' + n + '.',
                        );
                    }
                    this._maxListeners = n;
                    return this;
                };

                function _getMaxListeners(that) {
                    if (that._maxListeners === undefined) return EventEmitter.defaultMaxListeners;
                    return that._maxListeners;
                }

                EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
                    return _getMaxListeners(this);
                };

                EventEmitter.prototype.emit = function emit(type) {
                    var args = [];
                    for (var i = 1; i < arguments.length; i++) args.push(arguments[i]);
                    var doError = type === 'error';

                    var events = this._events;
                    if (events !== undefined) doError = doError && events.error === undefined;
                    else if (!doError) return false;

                    // If there is no 'error' event listener then throw.
                    if (doError) {
                        var er;
                        if (args.length > 0) er = args[0];
                        if (er instanceof Error) {
                            // Note: The comments on the `throw` lines are intentional, they show
                            // up in Node's output if this results in an unhandled exception.
                            throw er; // Unhandled 'error' event
                        }
                        // At least give some kind of context to the user
                        var err = new Error('Unhandled error.' + (er ? ' (' + er.message + ')' : ''));
                        err.context = er;
                        throw err; // Unhandled 'error' event
                    }

                    var handler = events[type];

                    if (handler === undefined) return false;

                    if (typeof handler === 'function') {
                        ReflectApply(handler, this, args);
                    } else {
                        var len = handler.length;
                        var listeners = arrayClone(handler, len);
                        for (var i = 0; i < len; ++i) ReflectApply(listeners[i], this, args);
                    }

                    return true;
                };

                function _addListener(target, type, listener, prepend) {
                    var m;
                    var events;
                    var existing;

                    checkListener(listener);

                    events = target._events;
                    if (events === undefined) {
                        events = target._events = Object.create(null);
                        target._eventsCount = 0;
                    } else {
                        // To avoid recursion in the case that type === "newListener"! Before
                        // adding it to the listeners, first emit "newListener".
                        if (events.newListener !== undefined) {
                            target.emit('newListener', type, listener.listener ? listener.listener : listener);

                            // Re-assign `events` because a newListener handler could have caused the
                            // this._events to be assigned to a new object
                            events = target._events;
                        }
                        existing = events[type];
                    }

                    if (existing === undefined) {
                        // Optimize the case of one listener. Don't need the extra array object.
                        existing = events[type] = listener;
                        ++target._eventsCount;
                    } else {
                        if (typeof existing === 'function') {
                            // Adding the second element, need to change to array.
                            existing = events[type] = prepend ? [listener, existing] : [existing, listener];
                            // If we've already got an array, just append.
                        } else if (prepend) {
                            existing.unshift(listener);
                        } else {
                            existing.push(listener);
                        }

                        // Check for listener leak
                        m = _getMaxListeners(target);
                        if (m > 0 && existing.length > m && !existing.warned) {
                            existing.warned = true;
                            // No error code for this since it is a Warning
                            // eslint-disable-next-line no-restricted-syntax
                            var w = new Error(
                                'Possible EventEmitter memory leak detected. ' +
                                    existing.length +
                                    ' ' +
                                    String(type) +
                                    ' listeners ' +
                                    'added. Use emitter.setMaxListeners() to ' +
                                    'increase limit',
                            );
                            w.name = 'MaxListenersExceededWarning';
                            w.emitter = target;
                            w.type = type;
                            w.count = existing.length;
                            ProcessEmitWarning(w);
                        }
                    }

                    return target;
                }

                EventEmitter.prototype.addListener = function addListener(type, listener) {
                    return _addListener(this, type, listener, false);
                };

                EventEmitter.prototype.on = EventEmitter.prototype.addListener;

                EventEmitter.prototype.prependListener = function prependListener(type, listener) {
                    return _addListener(this, type, listener, true);
                };

                function onceWrapper() {
                    if (!this.fired) {
                        this.target.removeListener(this.type, this.wrapFn);
                        this.fired = true;
                        if (arguments.length === 0) return this.listener.call(this.target);
                        return this.listener.apply(this.target, arguments);
                    }
                }

                function _onceWrap(target, type, listener) {
                    var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
                    var wrapped = onceWrapper.bind(state);
                    wrapped.listener = listener;
                    state.wrapFn = wrapped;
                    return wrapped;
                }

                EventEmitter.prototype.once = function once(type, listener) {
                    checkListener(listener);
                    this.on(type, _onceWrap(this, type, listener));
                    return this;
                };

                EventEmitter.prototype.prependOnceListener = function prependOnceListener(type, listener) {
                    checkListener(listener);
                    this.prependListener(type, _onceWrap(this, type, listener));
                    return this;
                };

                // Emits a 'removeListener' event if and only if the listener was removed.
                EventEmitter.prototype.removeListener = function removeListener(type, listener) {
                    var list, events, position, i, originalListener;

                    checkListener(listener);

                    events = this._events;
                    if (events === undefined) return this;

                    list = events[type];
                    if (list === undefined) return this;

                    if (list === listener || list.listener === listener) {
                        if (--this._eventsCount === 0) this._events = Object.create(null);
                        else {
                            delete events[type];
                            if (events.removeListener) this.emit('removeListener', type, list.listener || listener);
                        }
                    } else if (typeof list !== 'function') {
                        position = -1;

                        for (i = list.length - 1; i >= 0; i--) {
                            if (list[i] === listener || list[i].listener === listener) {
                                originalListener = list[i].listener;
                                position = i;
                                break;
                            }
                        }

                        if (position < 0) return this;

                        if (position === 0) list.shift();
                        else {
                            spliceOne(list, position);
                        }

                        if (list.length === 1) events[type] = list[0];

                        if (events.removeListener !== undefined)
                            this.emit('removeListener', type, originalListener || listener);
                    }

                    return this;
                };

                EventEmitter.prototype.off = EventEmitter.prototype.removeListener;

                EventEmitter.prototype.removeAllListeners = function removeAllListeners(type) {
                    var listeners, events, i;

                    events = this._events;
                    if (events === undefined) return this;

                    // not listening for removeListener, no need to emit
                    if (events.removeListener === undefined) {
                        if (arguments.length === 0) {
                            this._events = Object.create(null);
                            this._eventsCount = 0;
                        } else if (events[type] !== undefined) {
                            if (--this._eventsCount === 0) this._events = Object.create(null);
                            else delete events[type];
                        }
                        return this;
                    }

                    // emit removeListener for all listeners on all events
                    if (arguments.length === 0) {
                        var keys = Object.keys(events);
                        var key;
                        for (i = 0; i < keys.length; ++i) {
                            key = keys[i];
                            if (key === 'removeListener') continue;
                            this.removeAllListeners(key);
                        }
                        this.removeAllListeners('removeListener');
                        this._events = Object.create(null);
                        this._eventsCount = 0;
                        return this;
                    }

                    listeners = events[type];

                    if (typeof listeners === 'function') {
                        this.removeListener(type, listeners);
                    } else if (listeners !== undefined) {
                        // LIFO order
                        for (i = listeners.length - 1; i >= 0; i--) {
                            this.removeListener(type, listeners[i]);
                        }
                    }

                    return this;
                };

                function _listeners(target, type, unwrap) {
                    var events = target._events;

                    if (events === undefined) return [];

                    var evlistener = events[type];
                    if (evlistener === undefined) return [];

                    if (typeof evlistener === 'function')
                        return unwrap ? [evlistener.listener || evlistener] : [evlistener];

                    return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
                }

                EventEmitter.prototype.listeners = function listeners(type) {
                    return _listeners(this, type, true);
                };

                EventEmitter.prototype.rawListeners = function rawListeners(type) {
                    return _listeners(this, type, false);
                };

                EventEmitter.listenerCount = function (emitter, type) {
                    if (typeof emitter.listenerCount === 'function') {
                        return emitter.listenerCount(type);
                    } else {
                        return listenerCount.call(emitter, type);
                    }
                };

                EventEmitter.prototype.listenerCount = listenerCount;
                function listenerCount(type) {
                    var events = this._events;

                    if (events !== undefined) {
                        var evlistener = events[type];

                        if (typeof evlistener === 'function') {
                            return 1;
                        } else if (evlistener !== undefined) {
                            return evlistener.length;
                        }
                    }

                    return 0;
                }

                EventEmitter.prototype.eventNames = function eventNames() {
                    return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
                };

                function arrayClone(arr, n) {
                    var copy = new Array(n);
                    for (var i = 0; i < n; ++i) copy[i] = arr[i];
                    return copy;
                }

                function spliceOne(list, index) {
                    for (; index + 1 < list.length; index++) list[index] = list[index + 1];
                    list.pop();
                }

                function unwrapListeners(arr) {
                    var ret = new Array(arr.length);
                    for (var i = 0; i < ret.length; ++i) {
                        ret[i] = arr[i].listener || arr[i];
                    }
                    return ret;
                }

                function once(emitter, name) {
                    return new Promise(function (resolve, reject) {
                        function errorListener(err) {
                            emitter.removeListener(name, resolver);
                            reject(err);
                        }

                        function resolver() {
                            if (typeof emitter.removeListener === 'function') {
                                emitter.removeListener('error', errorListener);
                            }
                            resolve([].slice.call(arguments));
                        }

                        eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
                        if (name !== 'error') {
                            addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
                        }
                    });
                }

                function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
                    if (typeof emitter.on === 'function') {
                        eventTargetAgnosticAddListener(emitter, 'error', handler, flags);
                    }
                }

                function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
                    if (typeof emitter.on === 'function') {
                        if (flags.once) {
                            emitter.once(name, listener);
                        } else {
                            emitter.on(name, listener);
                        }
                    } else if (typeof emitter.addEventListener === 'function') {
                        // EventTarget does not have `error` event semantics like Node
                        // EventEmitters, we do not listen for `error` events here.
                        emitter.addEventListener(name, function wrapListener(arg) {
                            // IE does not have builtin `{ once: true }` support so we
                            // have to do it manually.
                            if (flags.once) {
                                emitter.removeEventListener(name, wrapListener);
                            }
                            listener(arg);
                        });
                    } else {
                        throw new TypeError(
                            'The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter,
                        );
                    }
                }
            },
            {},
        ],
        52: [
            function (require, module, exports) {
                // shim for using process in browser
                var process = (module.exports = {});

                // cached from whatever global is present so that test runners that stub it
                // don't break things.  But we need to wrap it in a try catch in case it is
                // wrapped in strict mode code which doesn't define any globals.  It's inside a
                // function because try/catches deoptimize in certain engines.

                var cachedSetTimeout;
                var cachedClearTimeout;

                function defaultSetTimout() {
                    throw new Error('setTimeout has not been defined');
                }
                function defaultClearTimeout() {
                    throw new Error('clearTimeout has not been defined');
                }
                (function () {
                    try {
                        if (typeof setTimeout === 'function') {
                            cachedSetTimeout = setTimeout;
                        } else {
                            cachedSetTimeout = defaultSetTimout;
                        }
                    } catch (e) {
                        cachedSetTimeout = defaultSetTimout;
                    }
                    try {
                        if (typeof clearTimeout === 'function') {
                            cachedClearTimeout = clearTimeout;
                        } else {
                            cachedClearTimeout = defaultClearTimeout;
                        }
                    } catch (e) {
                        cachedClearTimeout = defaultClearTimeout;
                    }
                })();
                function runTimeout(fun) {
                    if (cachedSetTimeout === setTimeout) {
                        //normal enviroments in sane situations
                        return setTimeout(fun, 0);
                    }
                    // if setTimeout wasn't available but was latter defined
                    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
                        cachedSetTimeout = setTimeout;
                        return setTimeout(fun, 0);
                    }
                    try {
                        // when when somebody has screwed with setTimeout but no I.E. maddness
                        return cachedSetTimeout(fun, 0);
                    } catch (e) {
                        try {
                            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
                            return cachedSetTimeout.call(null, fun, 0);
                        } catch (e) {
                            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
                            return cachedSetTimeout.call(this, fun, 0);
                        }
                    }
                }
                function runClearTimeout(marker) {
                    if (cachedClearTimeout === clearTimeout) {
                        //normal enviroments in sane situations
                        return clearTimeout(marker);
                    }
                    // if clearTimeout wasn't available but was latter defined
                    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
                        cachedClearTimeout = clearTimeout;
                        return clearTimeout(marker);
                    }
                    try {
                        // when when somebody has screwed with setTimeout but no I.E. maddness
                        return cachedClearTimeout(marker);
                    } catch (e) {
                        try {
                            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
                            return cachedClearTimeout.call(null, marker);
                        } catch (e) {
                            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
                            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
                            return cachedClearTimeout.call(this, marker);
                        }
                    }
                }
                var queue = [];
                var draining = false;
                var currentQueue;
                var queueIndex = -1;

                function cleanUpNextTick() {
                    if (!draining || !currentQueue) {
                        return;
                    }
                    draining = false;
                    if (currentQueue.length) {
                        queue = currentQueue.concat(queue);
                    } else {
                        queueIndex = -1;
                    }
                    if (queue.length) {
                        drainQueue();
                    }
                }

                function drainQueue() {
                    if (draining) {
                        return;
                    }
                    var timeout = runTimeout(cleanUpNextTick);
                    draining = true;

                    var len = queue.length;
                    while (len) {
                        currentQueue = queue;
                        queue = [];
                        while (++queueIndex < len) {
                            if (currentQueue) {
                                currentQueue[queueIndex].run();
                            }
                        }
                        queueIndex = -1;
                        len = queue.length;
                    }
                    currentQueue = null;
                    draining = false;
                    runClearTimeout(timeout);
                }

                process.nextTick = function (fun) {
                    var args = new Array(arguments.length - 1);
                    if (arguments.length > 1) {
                        for (var i = 1; i < arguments.length; i++) {
                            args[i - 1] = arguments[i];
                        }
                    }
                    queue.push(new Item(fun, args));
                    if (queue.length === 1 && !draining) {
                        runTimeout(drainQueue);
                    }
                };

                // v8 likes predictible objects
                function Item(fun, array) {
                    this.fun = fun;
                    this.array = array;
                }
                Item.prototype.run = function () {
                    this.fun.apply(null, this.array);
                };
                process.title = 'browser';
                process.browser = true;
                process.env = {};
                process.argv = [];
                process.version = ''; // empty string to avoid regexp issues
                process.versions = {};

                function noop() {}

                process.on = noop;
                process.addListener = noop;
                process.once = noop;
                process.off = noop;
                process.removeListener = noop;
                process.removeAllListeners = noop;
                process.emit = noop;
                process.prependListener = noop;
                process.prependOnceListener = noop;

                process.listeners = function (name) {
                    return [];
                };

                process.binding = function (name) {
                    throw new Error('process.binding is not supported');
                };

                process.cwd = function () {
                    return '/';
                };
                process.chdir = function (dir) {
                    throw new Error('process.chdir is not supported');
                };
                process.umask = function () {
                    return 0;
                };
            },
            {},
        ],
    },
    {},
    [50],
);