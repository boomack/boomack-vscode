import boomack from 'boomack-js'
import { config } from './config.mjs'

/**
 * @typedef {import('vscode').ExtensionContext} ExtensionContext
 * @typedef {import('./inventory.mjs').BoomackServer} BoomackServer
 */

/** @type {Object.<string, boomack.Boomack>} */
const clients = {}

/**
 * @param {BoomackServer} server
 * @returns {Promise<boomack.Boomack>}
 */
export async function getClientFor(server) {
    let client = clients[server.name]
    if (client && (client.apiUrl !== server.url || client.token !== server.token)) {
        client = null
    }
    if (!client) {
        client = await boomack.withConfig({
            loadDefaultFiles: false,
            loadEnvironmentVars: false,
            additionalFiles: [],
            config: {
                server: { url: server.url },
                client: {
                    timeout: config('boomack.client.timeout'),
                    retry: config('boomack.client.retry'),
                    format: 'application/json',
                    token: server.token,
                }
            }
        })
        clients[server.name] = client
    }
    return client
}

export function clearClientCache() {
    for (const name in clients) {
        delete clients[name]
    }
}
