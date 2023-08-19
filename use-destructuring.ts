import { MutableRefObject, useMemo, useRef } from "react";

type TupleSetState<T extends FiniteTuple<T>> = { [K in keyof T]: [T[K], SetState<T[K]>] }; // Do not display `Remove` when array is fixed size tuple.
type ArraySetState<T extends unknown[]>      = { [K in keyof T]: [T[K], SetState<T[K]>, Remove] };
type ObjectSetState<T extends {}>            = { [K in keyof T & string as `set${Capitalize<K>}`]: SetState<T[K]> };

function useDestucturing<T extends FiniteTuple<T>>(state: T, setState: SetState<T>): TupleSetState<T>;
function useDestucturing<T extends unknown[]     >(state: T, setState: SetState<T>): ArraySetState<T>;
function useDestucturing<T extends {}            >(state: T, setState: SetState<T>): ObjectSetState<T>;
function useDestucturing<T extends unknown       >(state: T, setState: SetState<T>): unknown {

	if (!isObjectOrArray(state)) throw new Error('useDestructuring() only accepts arrays and (not-null) objects.');
	
	const isArr = Array.isArray(state);
	const setStateRef = useRef<ArrayCache | ObjectCache<any>>(isArr ? [] : new Map());

	const result = useMemo(() => {
		if (isArr) {
			return memoizeArray<any>(
				narrowRef(setStateRef, isArrayCache, []),
				state,
				setState
			);
		}
		else {
			return memoizeObject<any>(
				narrowRef(setStateRef, isObjectCache, new Map()),
				state,
				setState
			);
		}
	}, [setState, isArr ? state : hashStrings(keysOf(state))]);
	/*
		Sadly we need to hash the object keys here because useEffect does not accept variable arg arrays.
		Calling Object.keys also returns a new array each call.
		Object.keys({ a: "" }) === Object.keys({ a: "" }) -> false
	*/

	return result;
};

export default useDestucturing;

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;
type Remove = () => void;
type FiniteTuple<T extends [...unknown[]]> = number extends T['length'] ? never : [...unknown[]];

type ArrayCache = [SetState<unknown>, Remove][];
const isArrayCache = (current: unknown): current is ArrayCache => Array.isArray(current);

type ObjectCache<T extends {}> = Map<keyof T & string, SetState<unknown>>;
const isObjectCache = (current: unknown): current is ObjectCache<any> => current instanceof Map;

const narrowRef = <T, U extends T>(ref: MutableRefObject<T>, isNarrow: (current: T) => current is U, setIfNotNarrow: U): MutableRefObject<U> => {
	const current = ref.current;
	
	if (!isNarrow(current)) {
		ref.current = setIfNotNarrow;
	}

	return ref as MutableRefObject<U>;
}

const isObjectOrArray = (obj: unknown): obj is unknown[] | {} => {
	// because typeof [] === 'object'
	return obj !== null && typeof obj === 'object';
}

const keysOf = <T extends {}>(object: T): (keyof T & string)[] => {
	return Object.keys(object) as (keyof T & string)[];
}

const hashStrings = (str: string[]): number => {
	// XOR hashes because the order of the keys is irrelevant
	return str.map(s => hashString(s)).reduce((a, b) => a ^ b, 0);
}

const hashString = (str: string, seed: number = 0): number => {
	// cyrb53, src: https://github.com/bryc/code/blob/master/jshash/experimental/cyrb53.js
    let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;

    for(let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

/* #### Array Memoization #### */

const memoizeArray = <T extends unknown[]>(ref: MutableRefObject<ArrayCache>, array: T, setArray: SetState<T>): ArraySetState<T> => {
	let cache = ref.current;

	if (cache.length !== array.length) {
		cache = ref.current = [
			...limit(cache, array.length),
			...append(
				cache.length,
				array.length - cache.length,
				(i): [SetState<unknown>, Remove] => [
					createArrayElementSetState(setArray, i),
					createDeleteAction(setArray, i)
				]
			)
		];
	}

	return array.map((s, i) => ([s, cache[i][0], cache[i][1]])) as ArraySetState<T>;
}

const limit = <T>(array: T[], limit: number): T[] => {
	return limit >= array.length ? array : array.slice(0, limit);
}

const append = <T>(offset: number, count: number, factory: (index: number) => T): T[] => {
	return count < 1 ? [] : Array(count).fill(undefined).map((_, i) => factory(offset + i));
}

const createDeleteAction = <T extends unknown[]>(setArray: SetState<T>, index: number): Remove => {
	return () => setArray(oldArray => oldArray.filter((_, j) => j !== index) as T);
}

const createArrayElementSetState = <T extends unknown[]>(setArray: SetState<T>, index: number): SetState<unknown> => {
	return setElement => setArray(oldArray =>
		replaceAtIndex(oldArray, index, evaluateSetStateAction(setElement, oldArray[index]))
	);
}

const replaceAtIndex = <T extends unknown[]>(array: T, index: number, newElement: unknown): T => {
	const oldElement = array[index];

	if (oldElement === newElement) {
		return array;
	}
	else {
		const result = [...array] as T;
		result[index] = newElement;
		return result;
	}
}

/* #### Object Memoization #### */

const memoizeObject = <T extends {}>(ref: MutableRefObject<ObjectCache<T>>, state: T, setState: SetState<T>): ObjectSetState<T> => {
	const oldMap = ref.current;
	const newMap = new Map();

	const setMethods = { } as any;

	for (const key of keysOf(state)) {
		const val = oldMap.get(key) ?? createObjectPropertySetState(setState, key);
		newMap.set(key, val);
		setMethods[`set${capitalize(key)}`] = val;
	}

	ref.current = newMap;

	return setMethods;
}

const createObjectPropertySetState = <T, K extends keyof T>(setObject: SetState<T>, propertyKey: K): SetState<T[K]> => {
	return setProperty => setObject(oldObject => {
		const oldProperty = oldObject[propertyKey];
		const newProperty = evaluateSetStateAction(setProperty, oldProperty);
		
		if (oldProperty === newProperty) {
			return oldObject;
		}
		else {
			return {
				...oldObject,
				[propertyKey]: newProperty
			};
		}
	});
}

const capitalize = <T extends string>(key: T): Capitalize<T> => {
	if (key.length === 0) throw new Error(`The argument 'key' must have at least one character.`);
	return key.charAt(0).toUpperCase() + key.substring(1) as Capitalize<T>;
}

const evaluateSetStateAction = <T>(setStateAction: React.SetStateAction<T>, oldValue: T): T => {
	return setStateAction instanceof Function ? setStateAction(oldValue) : setStateAction;
}