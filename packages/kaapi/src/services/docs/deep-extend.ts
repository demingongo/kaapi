'use strict';

const hasOwn = Object.prototype.hasOwnProperty;
const toStr = Object.prototype.toString;
const defineProperty = Object.defineProperty;
const gOPD = Object.getOwnPropertyDescriptor;
const gOPS = Object.getOwnPropertySymbols

const isArray = function isArray(arr: unknown): arr is unknown[] {
	if (typeof Array.isArray === 'function') {
		return Array.isArray(arr);
	}

	return toStr.call(arr) === '[object Array]';
};

const isPlainObject = function isPlainObject(obj: unknown): obj is Record<PropertyKey, unknown> {
	if (!obj || toStr.call(obj) !== '[object Object]') {
		return false;
	}

	const hasOwnConstructor = hasOwn.call(obj, 'constructor');
	const hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
	// Not own constructor property must be Object
	if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
		return false;
	}

	// Own properties are enumerated firstly, so to speed up, if last one is own, then all properties are own.
	let key;
	for (key in obj) { /**/ }

	return typeof key === 'undefined' || hasOwn.call(obj, key);
};

// If name is '__proto__', and Object.defineProperty is available, define __proto__ as an own property on target
const setProperty = function setProperty(target: Record<PropertyKey, unknown> | unknown[], options: { name: string | symbol, newValue: unknown }) {
	if (defineProperty && options.name === '__proto__') {
		defineProperty(target, options.name, {
			enumerable: true,
			configurable: true,
			value: options.newValue,
			writable: true
		});
	} else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        target[options.name as any] = options.newValue;
	}
};

// Return undefined instead of __proto__ if '__proto__' is not an own property
const getProperty = function getProperty(obj: Record<PropertyKey, unknown> | unknown[], name: PropertyKey) {
	if (name === '__proto__') {
		if (!hasOwn.call(obj, name)) {
			return void 0;
		} else if (gOPD) {
			// In early versions of node, obj['__proto__'] is buggy when obj has __proto__ as an own property. Object.getOwnPropertyDescriptor() works.
			return gOPD(obj, name)?.value;
		}
	}

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return obj[name as any];
};


function copyOneProperty(target: Record<PropertyKey, unknown> | unknown[], option: Record<PropertyKey, unknown> | unknown[], name: string | symbol) {
    const src = getProperty(target, name);
    const copy = getProperty(option, name);

    // Prevent never-ending loop
    if (target !== copy) {
        if (copy && isArray(copy)) {
            const clone = src && isArray(src) ? src : [];
            setProperty(target, { name: name, newValue: deepExtend(clone, copy) });
        } else if (isPlainObject(copy)) {
            const clone = src && isPlainObject(src) ? src : {};
            setProperty(target, { name: name, newValue: deepExtend(clone, copy) });
        } else if (typeof copy !== 'undefined') {
            setProperty(target, { name: name, newValue: copy });
        }
    }
}

export function deepExtend<T = unknown, O = unknown>(target: T, ...options: O[]): T & O {
    let formattedTarget: Record<PropertyKey, unknown> | unknown[] = {}

    if (target != null && (isPlainObject(target) || isArray(target)) ) {
        formattedTarget = target
    }

	for (const option of options) {
		// Only deal with non-null/undefined values
		if (option != null && (isPlainObject(option) || isArray(option))) {
			// Extend the base object
			for (const name in option) {
				copyOneProperty(formattedTarget, option, name)
			}
            for (const name of gOPS(option)) {
                copyOneProperty(formattedTarget, option, name)
            }
		}
	}

	// Return the modified object
	return formattedTarget as T & O;
};