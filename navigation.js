const vscode = require('vscode')
const inventory = require('./inventory.js')
const { getClientFor } = require('./client.js')

/**
 * @typedef {Object} SlotDefinition
 * @property {string} id
 * @property {number} index
 */

/**
 * @typedef {Object} PanelDefinition
 * @property {string} title
 * @property {string} type
 * @property {string} defaultSlot
 * @property {SlotDefinition[]} slots
 */

class ServerTreeItem extends vscode.TreeItem {
    /**
     * @param {inventory.BoomackServer} server
     */
    constructor(server) {
        super(server.name, vscode.TreeItemCollapsibleState.None)
        this.server = server

        this.iconPath = new vscode.ThemeIcon('server-environment')
        this.id = server.name
        const url = new URL(server.url)
        this.description =
            url.host
            + (server.token ? '  🔑' : '')
            + (server.token && url.protocol === 'http:' ? ' ⚠️' : '')
    }
}

class ServerTreeItemProvider {
    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {
        this._context = context
        this._changeEmitter = new vscode.EventEmitter()
        this.onDidChangeTreeData = this._changeEmitter.event

        inventory.onChanged(() => this._changeEmitter.fire(null))
    }

    /**
     *
     * @param {?inventory.BoomackServer} element
     * @returns {inventory.BoomackServer[]}
     */
    getChildren(element) {
        if (element) return []
        return inventory.getServers(this._context)
    }

    /**
     * @param {inventory.BoomackServer} server
     * @returns {ServerTreeItem}
     */
    getTreeItem(server) {
        return new ServerTreeItem(server)
    }

    getParent() { return null }
}

class PanelItem extends vscode.TreeItem {
    /**
     * @param {inventory.BoomackServer} server
     * @param {string} panelId
     */
    constructor(server, panelId) {
        super(panelId, vscode.TreeItemCollapsibleState.None)
        this.iconPath = new vscode.ThemeIcon('window')
        this.id = panelId

        /** @type {inventory.BoomackServer} */
        this.server = server
        /** @type {string} */
        this.panelId = panelId
    }
}

class PanelTreeItemProvider {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {vscode.TreeView} serverView
     */
    constructor(context, serverView) {
        this._context = context
        this._serverView = serverView
        this._changeEmitter = new vscode.EventEmitter()
        this.onDidChangeTreeData = this._changeEmitter.event

        const changeHandle = serverView.onDidChangeSelection(() => this.refresh())
        context.subscriptions.push(changeHandle)

        /** @type {?PanelItem[]} */
        this._panelItems = null
    }

    refresh() {
        this._panelItems = null
        this._changeEmitter.fire(null)
    }

    /**
     * @param {?PanelItem} element
     * @returns {Promise<PanelItem[]>}
     */
    async getChildren(element) {
        if (element) return []
        if (this._panelItems) return this._panelItems
        const server = this._serverView.selection.length > 0
            ? this._serverView.selection[0]
            : null
        if (!server) return []
        const client = await getClientFor(this._context, server)
        try {
            console.log(`Listing panels for server "${server.name}"`)
            const panelIdResponse = await client.listPanels()
            if (panelIdResponse.success) {
                /** @type {Object} */
                const panelIds = panelIdResponse.body
                if (typeof(panelIds) === 'object' && typeof(panelIds.map) === 'function') {
                    this._panelItems = panelIds.map(id => new PanelItem(server, id))
                    return this._panelItems
                } else {
                    console.error("Failed to parse server response for panel list")
                }
            } else {
                console.error("Server request failed:", panelIdResponse.statusCode, panelIdResponse.statusMessage)
            }
        } catch (err) {
            console.error("Failed to list panels:", err)
        }
        return []
    }

    /**
     * @param {PanelItem} element
     * @returns {PanelItem}
     */
    getTreeItem(element) {
        return element
    }

    getParent() { return null }
}

class SlotItem extends vscode.TreeItem {
    /**
     * @param {inventory.BoomackServer} server
     * @param {string} panelId
     * @param {SlotDefinition} slot
     * @param {boolean} defaultSlot
     */
    constructor(server, panelId, slot, defaultSlot) {
        super(slot.id, vscode.TreeItemCollapsibleState.None)
        this.iconPath = new vscode.ThemeIcon('symbol-constant') // comment, preview
        this.id = slot.id

        /** @type {SlotDefinition} */
        this.slot = slot
        /** @type {inventory.BoomackServer} */
        this.server = server
        /** @type {string} */
        this.panelId = panelId
        /** @type {string} */
        this.slotId = slot.id
        /** @type {boolean} */
        this.defaultSlot = defaultSlot
    }
}

class SlotTreeItemProvider {
    /**
     * @param {vscode.ExtensionContext} context
     * @param {vscode.TreeView} panelView
     */
    constructor(context, panelView) {
        this._context = context
        this._panelView = panelView
        this._changeEmitter = new vscode.EventEmitter()
        this.onDidChangeTreeData = this._changeEmitter.event

        const changeHandle = panelView.onDidChangeSelection(() => this.refresh())
        context.subscriptions.push(changeHandle)

        /** @type {?SlotItem[]} */
        this._slotItems = null
    }

    refresh() {
        this._slotItems = null
        this._changeEmitter.fire(null)
    }

    /**
     * @param {?SlotItem} element
     * @returns {Promise<SlotItem[]>}
     */
    async getChildren(element) {
        if (element) return []
        if (this._slotItems) return this._slotItems
        /** @type {?PanelItem} */
        const panelItem = this._panelView.selection.length > 0
            ? this._panelView.selection[0]
            : null
        if (!panelItem) return []
        const server = panelItem.server
        const client = await getClientFor(this._context, server)
        try {
            console.log(`Listing slots for panel "${panelItem.panelId}" on server "${server.name}"`)
            const panelResponse = await client.getPanel(panelItem.panelId)
            if (panelResponse.success) {
                /** @type {Object} */
                const panel = panelResponse.body
                if (typeof(panel) === 'object' && typeof(panel.slots) === 'object') {
                    this._slotItems = []
                    for (const slotId in panel.slots) {
                        this._slotItems.push(new SlotItem(
                            server,
                            panelItem.panelId,
                            panel.slots[slotId],
                            panel.defaultSlot === slotId))
                    }
                    return this._slotItems
                } else {
                    console.error("Failed to parse server response for panel layout")
                }
            } else {
                console.warn("Server request failed:", panelResponse.statusCode, panelResponse.statusMessage)
            }
        } catch (err) {
            console.warn("Failed to get panel layout:", err)
        }
        return []
    }

    /**
     * @param {SlotItem} element
     * @returns {SlotItem}
     */
    getTreeItem(element) {
        return element
    }

    getParent() { return null }
}

module.exports = {
    ServerTreeItemProvider,
    PanelTreeItemProvider,
    PanelItem,
    SlotTreeItemProvider,
    SlotItem,
}
