/*
 * @param {Array|String} a Input array or string.
 * @param {Array|String} b Input array or string.
 * @param {Function} [cmp] Optional function used to compare array values, by default `===` (strict equal operator) is used.
 * @param {Boolean} [atomicChanges=false] Whether an array of `inset|delete|equal` operations should
 * be returned instead of changes set. This makes this function compatible with {@link module:utils/diff~diff `diff()`}.
 * @returns {Array} Array of changes.
 */
function fastDiff(a, b, cmp, atomicChanges = false) {
	// Set the comparator function.
	cmp = cmp || function (a, b) {
		return a === b;
	};

	// Convert the string (or any array-like object - eg. NodeList) to an array by using the slice() method because,
	// unlike Array.from(), it returns array of UTF-16 code units instead of the code points of a string.
	// One code point might be a surrogate pair of two code units. All text offsets are expected to be in code units.
	// See ckeditor/ckeditor5#3147.
	//
	// We need to make sure here that fastDiff() works identical to diff().
	if (!Array.isArray(a)) {
		a = Array.prototype.slice.call(a);
	}

	if (!Array.isArray(b)) {
		b = Array.prototype.slice.call(b);
	}

	// Find first and last change.
	const changeIndexes = findChangeBoundaryIndexes(a, b, cmp);

	// Transform into changes array.
	return atomicChanges ? changeIndexesToAtomicChanges(changeIndexes, b.length) : changeIndexesToChanges(b, changeIndexes);
}

// @param {Array} arr1
// @param {Array} arr2
// @param {Function} cmp Comparator function.
// @returns {Object}
// @returns {Number} return.firstIndex Index of the first change in both values (always the same for both).
// @returns {Number} result.lastIndexOld Index of the last common value in `arr1`.
// @returns {Number} result.lastIndexNew Index of the last common value in `arr2`.
function findChangeBoundaryIndexes(arr1, arr2, cmp) {
	// Find the first difference between passed values.
	const firstIndex = findFirstDifferenceIndex(arr1, arr2, cmp);

	// If arrays are equal return -1 indexes object.
	if (firstIndex === -1) {
		return { firstIndex: -1, lastIndexOld: -1, lastIndexNew: -1 };
	}

	// Remove the common part of each value and reverse them to make it simpler to find the last difference between them.
	const oldArrayReversed = cutAndReverse(arr1, firstIndex);
	const newArrayReversed = cutAndReverse(arr2, firstIndex);

	// Find the first difference between reversed values.
	// It should be treated as "how many elements from the end the last difference occurred".
	//
	// For example:
	//
	// 				initial	->	after cut	-> reversed:
	// oldValue:	'321ba'	->	'21ba'		-> 'ab12'
	// newValue:	'31xba'	->	'1xba'		-> 'abx1'
	// lastIndex:							-> 2
	//
	// So the last change occurred two characters from the end of the arrays.
	const lastIndex = findFirstDifferenceIndex(oldArrayReversed, newArrayReversed, cmp);

	// Use `lastIndex` to calculate proper offset, starting from the beginning (`lastIndex` kind of starts from the end).
	const lastIndexOld = arr1.length - lastIndex;
	const lastIndexNew = arr2.length - lastIndex;

	return { firstIndex, lastIndexOld, lastIndexNew };
}

// Returns a first index on which given arrays differ. If both arrays are the same, -1 is returned.
//
// @param {Array} arr1
// @param {Array} arr2
// @param {Function} cmp Comparator function.
// @returns {Number}
function findFirstDifferenceIndex(arr1, arr2, cmp) {
	for (let i = 0; i < Math.max(arr1.length, arr2.length); i++) {
		if (arr1[i] === undefined || arr2[i] === undefined || !cmp(arr1[i], arr2[i])) {
			return i;
		}
	}

	return -1; // Return -1 if arrays are equal.
}

// Returns a copy of the given array with `howMany` elements removed starting from the beginning and in reversed order.
//
// @param {Array} arr Array to be processed.
// @param {Number} howMany How many elements from array beginning to remove.
// @returns {Array} Shortened and reversed array.
function cutAndReverse(arr, howMany) {
	return arr.slice(howMany).reverse();
}

// Generates changes array based on change indexes from `findChangeBoundaryIndexes` function. This function will
// generate array with 0 (no changes), 1 (deletion or insertion) or 2 records (insertion and deletion).
//
// @param {Array} newArray New array for which change indexes were calculated.
// @param {Object} changeIndexes Change indexes object from `findChangeBoundaryIndexes` function.
// @returns {Array.<Object>} Array of changes compatible with {@link module:utils/difftochanges~diffToChanges} format.
function changeIndexesToChanges(newArray, changeIndexes) {
	const result = [];
	const { firstIndex, lastIndexOld, lastIndexNew } = changeIndexes;

	// Order operations as 'insert', 'delete' array to keep compatibility with {@link module:utils/difftochanges~diffToChanges}
	// in most cases. However, 'diffToChanges' does not stick to any order so in some cases
	// (for example replacing '12345' with 'abcd') it will generate 'delete', 'insert' order.
	if (lastIndexNew - firstIndex > 0) {
		result.push({
			index: firstIndex,
			type: 'insert',
			values: newArray.slice(firstIndex, lastIndexNew)
		});
	}

	if (lastIndexOld - firstIndex > 0) {
		result.push({
			index: firstIndex + (lastIndexNew - firstIndex), // Increase index of what was inserted.
			type: 'delete',
			howMany: lastIndexOld - firstIndex
		});
	}

	return result;
}

// Generates array with set `equal|insert|delete` operations based on change indexes from `findChangeBoundaryIndexes` function.
//
// @param {Object} changeIndexes Change indexes object from `findChangeBoundaryIndexes` function.
// @param {Number} newLength Length of the new array on which `findChangeBoundaryIndexes` calculated change indexes.
// @returns {Array.<String>} Array of changes compatible with {@link module:utils/diff~diff} format.
function changeIndexesToAtomicChanges(changeIndexes, newLength) {
	const { firstIndex, lastIndexOld, lastIndexNew } = changeIndexes;

	// No changes.
	if (firstIndex === -1) {
		return Array(newLength).fill('equal');
	}

	let result = [];
	if (firstIndex > 0) {
		result = result.concat(Array(firstIndex).fill('equal'));
	}

	if (lastIndexNew - firstIndex > 0) {
		result = result.concat(Array(lastIndexNew - firstIndex).fill('insert'));
	}

	if (lastIndexOld - firstIndex > 0) {
		result = result.concat(Array(lastIndexOld - firstIndex).fill('delete'));
	}

	if (lastIndexNew < newLength) {
		result = result.concat(Array(newLength - lastIndexNew).fill('equal'));
	}

	return result;
}

function diff(a, b, cmp) {
	// Set the comparator function.
	cmp = cmp || function (a, b) {
		return a === b;
	};

	const aLength = a.length;
	const bLength = b.length;

	// Perform `fastDiff` for longer strings/arrays (see #269).
	if (aLength > 200 || bLength > 200 || aLength + bLength > 300) {
		return fastDiff(a, b, cmp, true);
	}

	// Temporary action type statics.
	let _insert, _delete;

	// Swapped the arrays to use the shorter one as the first one.
	if (bLength < aLength) {
		const tmp = a;

		a = b;
		b = tmp;

		// We swap the action types as well.
		_insert = 'delete';
		_delete = 'insert';
	} else {
		_insert = 'insert';
		_delete = 'delete';
	}

	const m = a.length;
	const n = b.length;
	const delta = n - m;

	// Edit scripts, for each diagonal.
	const es = {};
	// Furthest points, the furthest y we can get on each diagonal.
	const fp = {};

	function snake(k) {
		// We use -1 as an alternative below to handle initial values ( instead of filling the fp with -1 first ).
		// Furthest points (y) on the diagonal below k.
		const y1 = (fp[k - 1] !== undefined ? fp[k - 1] : -1) + 1;
		// Furthest points (y) on the diagonal above k.
		const y2 = fp[k + 1] !== undefined ? fp[k + 1] : -1;
		// The way we should go to get further.
		const dir = y1 > y2 ? -1 : 1;

		// Clone previous changes array (if any).
		if (es[k + dir]) {
			es[k] = es[k + dir].slice(0);
		}

		// Create changes array.
		if (!es[k]) {
			es[k] = [];
		}

		// Push the action.
		es[k].push(y1 > y2 ? _insert : _delete);

		// Set the beginning coordinates.
		let y = Math.max(y1, y2);
		let x = y - k;

		// Traverse the diagonal as long as the values match.
		while (x < m && y < n && cmp(a[x], b[y])) {
			x++;
			y++;
			// Push no change action.
			es[k].push('equal');
		}

		return y;
	}

	let p = 0;
	let k;

	// Traverse the graph until we reach the end of the longer string.
	do {
		// Updates furthest points and edit scripts for diagonals below delta.
		for (k = -p; k < delta; k++) {
			fp[k] = snake(k);
		}

		// Updates furthest points and edit scripts for diagonals above delta.
		for (k = delta + p; k > delta; k--) {
			fp[k] = snake(k);
		}

		// Updates furthest point and edit script for the delta diagonal.
		// note that the delta diagonal is the one which goes through the sink (m, n).
		fp[delta] = snake(delta);

		p++;
	} while (fp[delta] !== n);

	// Return the final list of edit changes.
	// We remove the first item that represents the action for the injected nulls.
	return es[delta].slice(1);
}

function diffToChanges(diff, output) {
	const changes = [];
	let index = 0;
	let lastOperation;

	diff.forEach(change => {
		if (change == 'equal') {
			pushLast();

			index++;
		} else if (change == 'insert') {
			if (isContinuationOf('insert')) {
				lastOperation.values.push(output[index]);
			} else {
				pushLast();

				lastOperation = {
					type: 'insert',
					index,
					values: [output[index]]
				};
			}

			index++;
		} else /* if ( change == 'delete' ) */ {
			if (isContinuationOf('delete')) {
				lastOperation.howMany++;
			} else {
				pushLast();

				lastOperation = {
					type: 'delete',
					index,
					howMany: 1
				};
			}
		}
	});

	pushLast();

	return changes;

	function pushLast() {
		if (lastOperation) {
			changes.push(lastOperation);
			lastOperation = null;
		}
	}

	function isContinuationOf(expected) {
		return lastOperation && lastOperation.type == expected;
	}
}
