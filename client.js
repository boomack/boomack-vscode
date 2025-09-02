const boomack = require('boomack-js')

/**
 * @typedef {import('vscode').ExtensionContext} ExtensionContext
 * @typedef {import('./inventory.js').BoomackServer} BoomackServer
 */

/** @type {Object.<string, boomack.Boomack>} */
const clients = {}

/**
 * @param {ExtensionContext} context
 * @param {BoomackServer} server
 * @returns {Promise<boomack.Boomack>}
 */
async function getClientFor(context, server) {
    let client = clients[server.name]
    if (!client) {
        client = await boomack.withConfig({
            loadDefaultFiles: false,
            loadEnvironmentVars: false,
            additionalFiles: [],
            config: {
                server: { url: server.url },
                client: {
                    timeout: 5000, // TODO make configurable
                    retry: 0, // TODO make configurable
                    format: 'application/json',
                    token: server.token,
                }
            }
        })
        clients[server.name] = client
    }
    return client
}

function clearClientCache() {
    for (const name in clients) {
        delete clients[name]
    }
}

module.exports = {
    getClientFor,
    clearClientCache,
}
