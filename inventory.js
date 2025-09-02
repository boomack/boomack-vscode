/**
 * @typedef {Object} BoomackServer
 * @property {string} name An user readable identifier for the server
 * @property {string} url The HTTP(S) URL of the Boomack server
 * @property {?string} token The API authentication token
 */

// TODO: store tokens as secret

/**
 * @typedef {import('vscode').ExtensionContext} ExtensionContext
 */

const changeListener = []

/**
 * @param {function(BoomackServer[]):void} cb
 */
function onChanged(cb) {
    changeListener.push(cb)
}

/**
 * @param {BoomackServer} a
 * @param {BoomackServer} b
 * @returns {number}
 */
function serverOrder(a, b) {
    const nameA = a.name.toLocaleLowerCase()
    const nameB = b.name.toLocaleLowerCase()
    if (nameA > nameB) return +1
    if (nameA < nameB) return -1
    return 0
}

/**
 * @param {ExtensionContext} context
 * @returns {BoomackServer[]}
 */
function getServers(context) {
    let servers = context.globalState.get('boomack.servers', []);
    servers.sort(serverOrder)
    return servers
}

/**
 * @param {ExtensionContext} context
 * @param {BoomackServer[]} servers
 */
function updateServers(context, servers) {
    context.globalState.update('boomack.servers', servers)
    for (const cb of changeListener) {
        try {
            cb(servers)
        } catch (err) {
            console.error('Calling inventory change handler failed', err)
        }
    }
}

/**
 * @param {ExtensionContext} context
 * @param {BoomackServer} server
 * @returns {boolean}
 */
function addServer(context, server) {
    const oldServers = getServers(context)
    const newServers = [...oldServers.filter(s => s.name !== server.name), server]
    updateServers(context, newServers)
    return oldServers.length !== newServers.length
}

/**
 * @param {ExtensionContext} context
 * @param {string} name
 * @returns {boolean}
 */
function removeServer(context, name) {
    const oldServers = getServers(context)
    const newServers = oldServers.filter(s => s.name !== name)
    updateServers(context, newServers)
    return oldServers.length !== newServers.length
}

module.exports = {
    getServers,
    updateServers,
    addServer,
    removeServer,
    onChanged,
}
