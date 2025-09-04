const _ = require('lodash')
const vscode = require('vscode')
const { WORKSPACE_SERVER_NAME } = require('./model.js')
const inventory = require('./inventory.js')
const { getClientFor } = require('./client.js')

/**
 * @typedef {import('boomack-js').Boomack} BoomackClient
 * @typedef {import('./model.js').BoomackServer} BoomackServer
 * @typedef {import('./model.js').PanelDefinition} PanelDefinition
 * @typedef {import('./model.js').SlotDefinition} SlotDefinition
 * @typedef {import('./model.js').ServerUIState} ServerUIState
 * @typedef {import('./model.js').PanelUIState} PanelUIState
 * @typedef {import('./model.js').SlotUIState} SlotUIState
 * @typedef {import('./model.js').BoomackTarget} BoomackTarget
 */

/**
 * @typedef {Object} InventoryChangedEvent
 * @property {ServerUIState[]} serverStates
 */

/**
 * @typedef {Object} ServerChangedEvent
 * @property {ServerUIState} serverState
 */

/**
 * @typedef {Object} ServerSelectionEvent
 * @property {?ServerUIState} serverState
 */

/**
 * @typedef {Object} PanelChangedEvent
 * @property {ServerUIState} serverState
 * @property {PanelUIState} panelState
 */

/**
 * @typedef {Object} PanelSelectionEvent
 * @property {ServerUIState} serverState
 * @property {?PanelUIState} panelState
 */

/**
 * @typedef {Object} SlotSelectionEvent
 * @property {ServerUIState} serverState
 * @property {PanelUIState} panelState
 * @property {?SlotUIState} slotState
 */

/** @type {BoomackServer} */
const WORKSPACE_SERVER_CONFIG = {
    name: WORKSPACE_SERVER_NAME,
    url: 'http://127.0.0.1:3000/',
    token: null,
}

/** @type {ServerUIState} */
const SERVER_UI_STATE_TEMPLATE = {
    invalid: true,
    name: '<unknown>',
    server: undefined,
    running: null,
    panelIds: undefined,
    panels: undefined,
    selectedPanelId: null,
}

/** @type {PanelUIState} */
const PANEL_UI_STATE_TEMPLATE = {
    invalid: true,
    id: '<unknown>',
    definition: undefined,
    slots: undefined,
    defaultSlotId: undefined,
    selectedSlotId: null,
}

/** @implements {vscode.Disposable} */
class Navigator {

    /**
     * @param {vscode.ExtensionContext} context
     */
    constructor(context) {

        /** @type {vscode.ExtensionContext} */
        this._extContext = context

        /** @type {vscode.Disposable[]} */
        this._subscriptions = []

        // TODO get actual workspace server configuration
        /** @type {BoomackServer} */
        this._workspaceServerConfig = { ...WORKSPACE_SERVER_CONFIG }

        /** @type {BoomackServer[]} */
        this._inventoryServerConfigs = []

        /** @type {Object.<string, ServerUIState>} */
        this.serverStates = {}

        /** @type {?string} */
        this.selectedServerName = null

        /** @type {vscode.EventEmitter<InventoryChangedEvent>} */
        this._serversChangedEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<InventoryChangedEvent>} */
        this.onServersChanged = this._serversChangedEmitter.event

        /** @type {vscode.EventEmitter<ServerChangedEvent>} */
        this._serverChangedEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<ServerChangedEvent>} */
        this.onServerChanged = this._serverChangedEmitter.event

        /** @type {vscode.EventEmitter<ServerSelectionEvent>} */
        this._selectedServerChangedEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<ServerSelectionEvent>} */
        this.onSelectedServerChanged = this._selectedServerChangedEmitter.event

        /** @type {vscode.EventEmitter<PanelChangedEvent>} */
        this._panelChangedEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<PanelChangedEvent>} */
        this.onPanelChanged = this._panelChangedEmitter.event

        /** @type {vscode.EventEmitter<PanelSelectionEvent>} */
        this._selectedPanelChangedEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<PanelSelectionEvent>} */
        this.onSelectedPanelChanged = this._selectedPanelChangedEmitter.event

        /** @type {vscode.EventEmitter<SlotSelectionEvent>} */
        this._selectedSlotChangedEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<SlotSelectionEvent>} */
        this.onSelectedSlotChanged = this._selectedSlotChangedEmitter.event

        this.setInventoryServers(inventory.getServers(context))
        this._subscriptions.push(
            inventory.onChanged(
                servers => this.setInventoryServers(servers)))

        this.serverItemProvider = new ServerTreeItemProvider(this)
        this.panelItemProvider = new PanelTreeItemProvider(this)
        this.slotItemProvider = new SlotTreeItemProvider(this)
    }

    /**
     * @param {vscode.Disposable} subs
     */
    registerSubscription(subs) {
        this._subscriptions.push(subs)
    }

    dispose() {
        for (const disposable of this._subscriptions) {
            try {
                disposable.dispose()
            } catch (err) {
                console.error("Caught exception when calling dispose()", err)
            }
        }
    }

    getContext() { return this._extContext }

    createServerTreeView() {
        const treeView = vscode.window.createTreeView('boomack-servers', {
            treeDataProvider: this.serverItemProvider,
            canSelectMany: false,
        })
        let blockEvent = false
        this.registerSubscription(
            treeView.onDidChangeSelection(async e => {
                const serverState = e.selection.length > 0
                    ? /** @type {ServerUIState} */ (e.selection[0])
                    : null
                blockEvent = true
                await this.selectServer(serverState?.name)
                blockEvent = false
            }))
        this.registerSubscription(
            this.onSelectedServerChanged(async e => {
                if (blockEvent) return
                await treeView.reveal(e.serverState, { select: true })
            })
        )
        return treeView
    }

    createPanelTreeView() {
        const treeView = vscode.window.createTreeView('boomack-panels', {
            treeDataProvider: this.panelItemProvider,
            canSelectMany: false,
        })
        let blockEvent = false
        this.registerSubscription(
            treeView.onDidChangeSelection(async e => {
                const panelState = e.selection.length > 0
                    ? /** @type {PanelUIState} */ (e.selection[0])
                    : null
                if (this.panelItemProvider.serverState) {
                    blockEvent = true
                    await this.selectPanel(
                        this.panelItemProvider.serverState,
                        panelState?.id)
                    blockEvent = false
                }
            }))
        this.registerSubscription(
            this.onSelectedPanelChanged(async e => {
                if (blockEvent) return
                if (e.serverState.name !== this.panelItemProvider.serverState?.name) return
                await treeView.reveal(e.panelState, { select: true })
            })
        )
        return treeView
    }

    createSlotTreeView() {
        const treeView = vscode.window.createTreeView('boomack-slots', {
            treeDataProvider: this.slotItemProvider,
            canSelectMany: false,
        })
        let blockEvent = false
        this.registerSubscription(
            treeView.onDidChangeSelection(e => {
                const slotState = e.selection.length > 0
                    ? /** @type {SlotUIState} */ (e.selection[0])
                    : null
                if (this.slotItemProvider.serverState && this.slotItemProvider.panelState) {
                    blockEvent = true
                    this.selectSlot(
                        this.slotItemProvider.serverState,
                        this.slotItemProvider.panelState.id,
                        slotState.id)
                    blockEvent = false
                }
            }))
        this.registerSubscription(
            this.onSelectedSlotChanged(async e => {
                if (blockEvent) return
                if (e.serverState.name !== this.slotItemProvider.serverState?.name) return
                if (e.panelState.id !== this.slotItemProvider.panelState?.id) return
                await treeView.reveal(e.slotState, { select: true })
            })
        )
        return treeView
    }

    /**
     * @param {string} serverName
     * @returns {BoomackServer|null}
     */
    serverConfig(serverName) {
        if (serverName === WORKSPACE_SERVER_NAME) {
            return this._workspaceServerConfig || undefined
        }
        return this._inventoryServerConfigs.find(s => s.name === serverName)
    }

    /**
     * @param {BoomackServer} server
     */
    async clientFor(server) {
        return await getClientFor(this._extContext, server)
    }

    _updateWorkspaceServerRunningState() {
        const state = this.serverStates[WORKSPACE_SERVER_NAME]
        console.assert(state,
            "No UI state for workspace server")
        console.warn("Detection of workspace server state NOT IMPLEMENTED")
        state.running = false
    }

    _initializeServerStates() {
        if (!this.serverStates[WORKSPACE_SERVER_NAME]) {
            this.serverStates[WORKSPACE_SERVER_NAME] = { ...SERVER_UI_STATE_TEMPLATE }
        }
        const servers = this.getServerStates()
        for (const server of servers) {
            let state = this.serverStates[server.name]
            if (!state) {
                state = { ...SERVER_UI_STATE_TEMPLATE }
                state.panels = {}
                this.serverStates[server.name] = state
            }
        }
        const obsoleteServerNames = _.keys(this.serverStates)
            .filter(name =>
                name !== WORKSPACE_SERVER_NAME
                && !_.some(servers, s => s.name === name))
        for (const name in obsoleteServerNames) {
            delete this.serverStates[name]
        }
        this._updateWorkspaceServerRunningState()
    }

    /**
     * @param {ServerUIState} serverState
     */
    _initializePanelStates(serverState) {
        for (const panelId of serverState.panelIds) {
            let state = serverState.panels[panelId]
            if (!state) {
                state = { ...PANEL_UI_STATE_TEMPLATE }
                serverState.panels[panelId] = state
            }
        }
        const obsoletePanelIds = _.keys(serverState.panels)
            .filter(id => !serverState.panelIds.includes(id))
        for (const id of obsoletePanelIds) {
            delete serverState.panels[id]
            if (serverState.selectedPanelId === id) {
                serverState.selectedPanelId = null
            }
        }
    }

    /**
     * @param {string} serverName
     */
    async _updateServerState(serverName) {
        const server = this.serverConfig(serverName)
        console.assert(server,
            "Server '%s' unknown", serverName)
        const serverState = this.serverStates[serverName]
        console.assert(serverState,
            "No UI state initialized for server '%s'", serverName)

        if (!serverState.invalid) return

        serverState.server = server
        serverState.name = serverName

        if (serverState.running === false) {
            serverState.panelIds = []
            // preserve panel state and selection
            serverState.invalid = false
            return
        }

        const client = await this.clientFor(server)
        const panelIdsResponse = await client.listPanels()
        if (panelIdsResponse.success) {
            const panelIds = /** @type {string[]} */ (panelIdsResponse.body)
            serverState.panelIds = [ ...panelIds ]
        }

        // if (serverState.panelIds.includes('default')) {
        //     await this.updatePanelState(server, 'default')
        // }
        for (const panelId of serverState.panelIds) {
            await this._updatePanelState(serverState, panelId)
        }

        serverState.invalid = false
    }

    /**
     * @param {string} serverName
     */
    async refreshServerState(serverName) {
        const server = this.serverConfig(serverName)
        if (!server) {
            throw new Error(`Server '${serverName}' unknown`)
        }
        const serverState = this.serverStates[server.name]
        console.assert(serverState,
            "No UI state initialized for server '%s'", serverName)
        serverState.invalid = true
        await this._updateServerState(serverName)
        this._serverChangedEmitter.fire({ serverState: this.serverStates[serverName] })
    }

    /**
     * @param {{ url: string, token: ?string }} serverConfig
     */
    async updateWorkspaceServer(serverConfig) {
        this._workspaceServerConfig.url = serverConfig.url
        this._workspaceServerConfig.token = serverConfig.token
        await this.refreshServerState(WORKSPACE_SERVER_NAME)
    }

    /**
     * @param {boolean} running
     */
    async setWorkspaceServerRunning(running) {
        const state = this.serverStates[WORKSPACE_SERVER_NAME]
        console.assert(state,
            "No UI state initialized for server '%s'", WORKSPACE_SERVER_NAME)
        state.running = running
        await this.refreshServerState(WORKSPACE_SERVER_NAME)
    }

    /**
     * @param {BoomackServer[]} serverConfigs
     */
    setInventoryServers(serverConfigs) {
        this._inventoryServerConfigs = serverConfigs
        this._initializeServerStates()
        this._serversChangedEmitter.fire({ serverStates: this.getServerStates() })
    }

    /**
     * @returns {ServerUIState[]}
     */
    getServerStates() {
        return _.sortBy(_.values(this.serverStates),
            s => s.name !== WORKSPACE_SERVER_NAME,
            s => s.name.toLocaleLowerCase())
    }

    /**
     * @returns {?ServerUIState}
     */
    getSelectedServerState() {
        return this.selectedServerName
            ? this.serverStates[this.selectedServerName]
            : null
    }

    /**
     * @param {?string} serverName
     */
    async selectServer(serverName) {
        let serverState = null
        let panelState = null
        let slotState = null
        this.selectedServerName = serverName
        if (serverName) {
            serverState = this.serverStates[serverName]
            if (!serverState) {
                throw new Error(`Unknown Boomack server '${serverName}'`)
            }
            await this._updateServerState(serverName)
            if (serverState.selectedPanelId) {
                panelState = serverState.panels[serverState.selectedPanelId] || null
            }
            if (panelState?.selectedSlotId) {
                slotState = panelState.slots[panelState.selectedSlotId] || null
            }
        }
        this._selectedServerChangedEmitter.fire({ serverState })
        this._selectedPanelChangedEmitter.fire({ serverState, panelState })
        this._selectedSlotChangedEmitter.fire({ serverState, panelState, slotState })
    }

    /**
     * @param {ServerUIState} serverState
     * @param {string} panelId
     */
    async _updatePanelState(serverState, panelId) {
        let panelState = serverState.panels[panelId]
        console.assert(panelState,
            "No UI state initialized for panel '%s' on server '%s'", serverState.name, panelId)
        panelState.id = panelId
        const client = await this.clientFor(serverState.server)
        const response = await client.getPanel(panelId)
        if (response.success) {
            panelState.definition = /** @type {PanelDefinition} */ (response.body)
            panelState.defaultSlotId = panelState.definition.defaultSlot
                || _.sortBy(panelState.definition.slots, 'id')[0]?.id
            panelState.slots = _.keyBy(
                _.map(panelState.definition.slots, s => ({
                    id: s.id,
                    defaultSlot: s.id === panelState.defaultSlotId,
                })),
                s => s.id)
            if (!_.some(panelState.definition.slots, s => s.id === panelState.selectedSlotId)) {
                panelState.selectedSlotId = null
            }
        } else {
            console.error(`Failed to retrieve panel definition: HTTP status ${response.statusCode} ${response.statusMessage}`)
            return
        }
        panelState.invalid = false
    }

    /**
     * @param {ServerUIState} serverState
     * @param {string} panelId
     */
    async refreshPanelState(serverState, panelId) {
        const panelState = serverState.panels[panelId]
        if (!panelState) {
            throw new Error(`Unknown panel '${panelId}' on server '${serverState.name}'`)
        }
        panelState.invalid = true
        await this._updatePanelState(serverState, panelId)
        this._panelChangedEmitter.fire({ serverState, panelState })
    }

    /**
     * @param {?ServerUIState} serverState
     */
    getPanelStates(serverState) {
        if (!serverState) return []
        return _.sortBy(_.values(serverState.panels),
            p => p.id !== 'default',
            p => p.id)
    }

    /**
     * @param {?ServerUIState} serverState
     * @returns {?PanelUIState}
     */
    getSelectedPanelState(serverState) {
        if (!serverState) return null
        if (!serverState.selectedPanelId) return null
        return serverState.panels[serverState.selectedPanelId]
    }

    /**
     * @param {ServerUIState} serverState
     * @param {?string} panelId
     */
    async selectPanel(serverState, panelId) {
        let panelState = null
        let slotState = null
        if (panelId) {
            panelState = serverState.panels[panelId]
            if (!panelState) {
                throw new Error(`Unknown panel '${panelId}' on server '${serverState.name}'`)
            }
            if (panelState?.selectedSlotId) {
                slotState = panelState.slots[panelState.selectedSlotId] || null
            }
        }
        serverState.selectedPanelId = panelId || null
        if (panelId) {
            await this._updatePanelState(serverState, panelId)
        }
        this._selectedPanelChangedEmitter.fire({ serverState, panelState })
        this._selectedSlotChangedEmitter.fire({ serverState, panelState, slotState })
    }

    /**
     * @param {ServerUIState} serverState
     * @param {?string} panelId
     * @returns {SlotUIState[]}
     */
    getSlotStates(serverState, panelId) {
        let panelState = null
        if (panelId) {
            panelState = serverState.panels[panelId]
        }
        if (!panelState) {
            return []
        }
        return _.sortBy(_.values(panelState.slots),
            s => !s.defaultSlot,
            s => s.id)
    }

    /**
     * @param {?PanelUIState} panelState
     * @returns {?SlotUIState}
     */
    getSelectedSlotState(panelState) {
        if (!panelState) return null
        if (!panelState.selectedSlotId) return null
        return panelState.slots[panelState.selectedSlotId]
    }

    /**
     * @param {ServerUIState} serverState
     * @param {string} panelId
     * @param {?string} slotId
     */
    selectSlot(serverState, panelId, slotId) {
        const panelState = serverState.panels[panelId]
        if (!panelState) {
            throw new Error(`Unknown panel '${panelId}' on server '${serverState.name}'`)
        }
        let slotState = null
        if (slotId) {
            slotState = panelState.slots[slotId]
            if (!slotState) {
                throw new Error(`Unknown slot '${slotId}' in panel '${panelId}' on server'${serverState.name}'`)
            }
        }
        panelState.selectedSlotId = slotId
        this._selectedSlotChangedEmitter.fire({ serverState, panelState, slotState })
    }
}

/**
 * @implements {vscode.TreeDataProvider<ServerUIState>}
 */
class ServerTreeItemProvider {

    /**
     * @param {Navigator} navigator
     */
    constructor(navigator) {
        this.navigator = navigator

        /** @type {vscode.EventEmitter<?ServerUIState>} */
        this._changeEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<?ServerUIState>} */
        this.onDidChangeTreeData = this._changeEmitter.event

        navigator.registerSubscription(
            navigator.onServersChanged(
                () => this._changeEmitter.fire(null)))
        navigator.registerSubscription(
            navigator.onServerChanged(
                e => this._changeEmitter.fire(e.serverState)))
    }

    /**
     *
     * @param {?ServerUIState} element
     * @returns {vscode.ProviderResult<ServerUIState[]>}
     */
    getChildren(element) {
        if (element) return []
        return this.navigator.getServerStates()
    }

    /**
     * @param {ServerUIState} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        const server = element.server
        const item = new vscode.TreeItem(element.name, vscode.TreeItemCollapsibleState.None)
        item.iconPath = new vscode.ThemeIcon('server-environment')
        const url = new URL(server.url)
        item.description =
            url.host
            + (server.token ? '  🔑' : '')
            + (server.token && url.protocol === 'http:' ? ' ⚠️' : '')
        return item
    }

    getParent() { return null }
}

/**
 * @implements {vscode.TreeDataProvider<PanelUIState>}
 */
class PanelTreeItemProvider {

    /**
     * @param {Navigator} navigator
     */
    constructor(navigator) {
        this.navigator = navigator

        /** @type {vscode.EventEmitter<?PanelUIState>} */
        this._changeEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<?PanelUIState>} */
        this.onDidChangeTreeData = this._changeEmitter.event

        /** @type {?ServerUIState} */
        this.serverState = null

        navigator.registerSubscription(
            navigator.onSelectedServerChanged(
                e => {
                    this.serverState = e.serverState
                    this._changeEmitter.fire(null)
                }))
        navigator.registerSubscription(
            navigator.onServerChanged(
                e => {
                    if (e.serverState.name !== this.serverState?.name) return
                    this.serverState = e.serverState
                    this._changeEmitter.fire(null)
                }))
        navigator.registerSubscription(
            navigator.onPanelChanged(
                e => this._changeEmitter.fire(e.panelState)))
    }

    /**
     *
     * @param {?PanelUIState} element
     * @returns {vscode.ProviderResult<PanelUIState[]>}
     */
    getChildren(element) {
        if (element || !this.serverState) return []
        return this.navigator.getPanelStates(this.serverState)
    }

    /**
     * @param {PanelUIState} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.id, vscode.TreeItemCollapsibleState.None)
        item.iconPath = new vscode.ThemeIcon('window')
        item.description = element.definition?.title
        return item
    }

    getParent() { return null }
}

/**
 * @implements {vscode.TreeDataProvider<SlotUIState>}
 */
class SlotTreeItemProvider {

    /**
     * @param {Navigator} navigator
     */
    constructor(navigator) {
        this.navigator = navigator

        /** @type {vscode.EventEmitter<?SlotUIState>} */
        this._changeEmitter = new vscode.EventEmitter()
        /** @type {vscode.Event<?SlotUIState>} */
        this.onDidChangeTreeData = this._changeEmitter.event

        /** @type {?ServerUIState} */
        this.serverState = null

        /** @type {?PanelUIState} */
        this.panelState = null

        navigator.registerSubscription(
            navigator.onSelectedPanelChanged(
                e => {
                    this.serverState = e.serverState
                    this.panelState = e.panelState
                    this._changeEmitter.fire(null)
                }))
        navigator.registerSubscription(
            navigator.onPanelChanged(
                e => {
                    if (e.serverState.name !== this.serverState?.name
                        || e.panelState.id === this.panelState?.id ) {
                        return
                    }
                    this.panelState = e.panelState
                    this._changeEmitter.fire(null)
                }))
    }

    /**
     *
     * @param {?SlotUIState} element
     * @returns {vscode.ProviderResult<SlotUIState[]>}
     */
    getChildren(element) {
        if (element || !this.panelState) return []
        return this.navigator.getSlotStates(this.serverState, this.panelState.id)
    }

    /**
     * @param {SlotUIState} element
     * @returns {vscode.TreeItem}
     */
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.id, vscode.TreeItemCollapsibleState.None)
        item.iconPath = new vscode.ThemeIcon('symbol-constant')
        return item
    }

    getParent() { return null }
}

module.exports = {
    Navigator,
}
