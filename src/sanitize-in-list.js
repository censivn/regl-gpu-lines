'use strict';

module.exports = function createSanitizer(label, list, dflt) {
  return function sanitizeValue (value) {
    if (!value) return dflt;
    if (list.indexOf(value) === -1) {
      throw new Error(
        `Invalid ${label} type. Options are ${JSON.stringify(list).join(', ')}.`
      );
    }
    return value;
  };
};
