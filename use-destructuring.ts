import { Dispatch, MutableRefObject, SetStateAction, useMemo, useRef } from "react";

type SetState<T> = Dispatch<SetStateAction<T>>;
type Delete = () => void;

type ElementType<T> = T extends (infer TElem)[] ? TElem : never;

type ArraySetState<T> = [T, SetState<T>, Delete][];
type TupleSetState<T> = [T, SetState<T>][];
type ObjectSetState<T> = {
	[K in keyof T & string as `set${Capitalize<K>}`]: SetState<T[K]>;
}

type ArrayCache<T> = [SetState<T>, Delete][];
type ObjectCache<T extends {}> = Map<keyof T & string, SetState<T[keyof T & string]>>;

function useDestucturing<T extends (number extends T['length'] ? [] : any[])>(state: T, setState: SetState<T>): TupleSetState<ElementType<T>>;
function useDestucturing<T extends any[]     >(state: T, setState: SetState<T>): ArraySetState<ElementType<T>>;
function useDestucturing<T extends {}        >(state: T, setState: SetState<T>): ObjectSetState<T>;
function useDestucturing<T extends {} | any[]>(state: T, setState: SetState<T>): ObjectSetState<T> | ArraySetState<ElementType<T>> | TupleSetState<ElementType<T>> {
	if (!isObjectOrArray(state)) throw new Error('useDecompose() can only accept arrays and (not-null) objects.');
	
	const isArr = isArray<ElementType<T>>(state);
	const setStateRef = useRef<ArrayCache<ElementType<T>> | ObjectCache<T>>(isArr ? [] : new Map());

	const result = useMemo<ObjectSetState<T> | ArraySetState<ElementType<T>>>(() => {
		if (isArr) {
			return memoizeArray<ElementType<T>>(
				narrowRef(setStateRef, (current): current is ArrayCache<ElementType<T>> => isArray(current), []),
				state,
				setState as any
			);
		}
		else {
			return memoizeObject<T>(
				narrowRef(setStateRef, (current): current is ObjectCache<T> => current instanceof Map, new Map()),
				state,
				setState
			);
		}
	}, [setState, isArr ? state : hashStrings(keysOf(state))]);

	return result;
};

export default useDestucturing;

const narrowRef = <T, U extends T>(ref: MutableRefObject<T>, isNarrow: (current: T) => current is U, setIfNotNarrow: U): MutableRefObject<U> => {
	const current = ref.current;
	
	if (!isNarrow(current)) {
		ref.current = setIfNotNarrow;
	}

	return ref as MutableRefObject<U>;
}

const memoizeArray = <T>(ref: MutableRefObject<ArrayCache<T>>, array: T[], setArray: SetState<T[]>): ArraySetState<T> => {
	let cache = ref.current;

	if (cache.length !== array.length) {
		cache = ref.current = [
			...limit(cache, array.length),
			...append<[SetState<T>, Delete]>(cache.length, array.length - cache.length, i => [
				createArrayElementSetState(setArray, i),
				createDeleteAction(setArray, i)
			])
		];
	}

	return array.map<[T, SetState<T>, Delete]>((s, i) => [s, cache[i][0], cache[i][1]]);
}

const memoizeObject = <T extends {}>(ref: MutableRefObject<ObjectCache<T>>, state: T, setState: SetState<T>): ObjectSetState<T> => {
	const map = ref.current;

	const setMethods = { } as any;
	for (const key of keysOf(state)) {
		let val = map.get(key);
		if (val === undefined) {
			map.set(key, val = createObjectPropertySetState(setState, key));
		}
		setMethods[`set${capitalize(key)}`] = val;
	}

	return setMethods;
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

const isArray = <T>(array: unknown): array is T[] => Array.isArray(array);

const isObjectOrArray = (obj: unknown): obj is any[] | {} => {
	// because typeof [] === 'object'
	return obj !== null && typeof obj === 'object';
}

const limit = <T>(array: T[], limit: number): T[] => {
	return limit >= array.length ? array : array.slice(0, limit);
}

const append = <T>(offset: number, count: number, factory: (index: number) => T): T[] => {
	return count < 1 ? [] : Array(count).fill(undefined).map((_, i) => factory(offset + i));
}

const capitalize = <T extends string>(key: T): Capitalize<T> => {
	if (key.length === 0) throw new Error(`The argument 'key' must have at least one character.`);
	return key.charAt(0).toUpperCase() + key.substring(1) as Capitalize<T>;
}

const createObjectPropertySetState = <T, K extends keyof T>(setObject: SetState<T>, propertyKey: K): SetState<T[K]> => {
	return setProperty => setObject(oldObject => (
		{
			...oldObject,
			[propertyKey]: evaluateSetStateAction(setProperty, oldObject[propertyKey])
		}
	));
}

const createDeleteAction = <T>(setArray: SetState<T[]>, index: number): (() => void) => {
	return () => setArray(oldArray => oldArray.filter((_, j) => j !== index));
}

const createArrayElementSetState = <T>(setArray: SetState<T[]>, index: number): SetState<T> => {
	return setElement => setArray(oldArray =>
		replaceAtIndex(oldArray, index, evaluateSetStateAction(setElement, oldArray[index]))
	);
}

const replaceAtIndex = <T>(array: T[], index: number, newValue: T): T[] => {
	const result = [...array];
	result[index] = newValue;
	return result;
}

const evaluateSetStateAction = <T>(setStateAction: SetStateAction<T>, oldValue: T): T => {
	return setStateAction instanceof Function ? setStateAction(oldValue) : setStateAction;
}