"use strict";

const { AsyncLocalStorage } = require("async_hooks");

// Global AsyncLocalStorage to hold transaction-level and request-level contexts
const contextStorage = new AsyncLocalStorage();

/**
 * Helper to retrieve the current context store
 */
function getContext() {
    return contextStorage.getStore() || {};
}

module.exports = {
    contextStorage,
    getContext
};
