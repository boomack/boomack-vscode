import { keyBy, keys, map, some, sortBy, values } from 'lodash-es'
import {
    EventEmitter,
    ProgressLocation,
    ThemeIcon,
    TreeItem,
    TreeItemCollapsibleState,
    window,
} from 'vscode'
import {
    isServerState,
    WORKSPACE_SERVER_LABEL,
    WORKSPACE_SERVER_NAME,
} from './model.js'
import inventory from './inventory.js'
import { getClientFor } from './client.js'

/**
 * @template T
 * @typedef {import('vscode').Event<T>} Event<T>
 */
/**
 * @template T
 * @typedef {import('vscode').ProviderResult<T>} ProviderResult<T>
 */
/**
 * @template T
 * @typedef {import('vscode').TreeDataProvider<T>} TreeDataProvider<T>
 */
/**
 * @typedef {import('vscode').Disposable} Disposable
 * @typedef {import('vscode').ExtensionContext} ExtensionContext
 * @typedef {import('boomack-js').Boomack} BoomackClient
 */
/**
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
 * @property {PanelUIState} panelState
 */

/**
 * @typedef {Object} PanelSelectionEvent
 * @property {ServerUIState} serverState
 * @property {?PanelUIState} panelState
 */

/**
 * @typedef {Object} SlotSelectionEvent
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
    stateType: 'server',
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
    stateType: 'panel',
    server: undefined,
    invalid: true,
    id: '<unknown>',
    definition: undefined,
    slots: undefined,
    defaultSlotId: undefined,
    selectedSlotId: null,
}

/** @type {SlotUIState} */
const SLOT_UI_STATE_TEMPLATE = {
    stateType: 'slot',
    id: '<unknown>',
    defaultSlot: false,
    panel: undefined,
}

/** @implements {Disposable} */
export class Navigator {

    /**
     * @param {ExtensionContext} context
     */
    constructor(context) {

        /** @type {ExtensionContext} */
        this._extContext = context

        /** @type {Disposable[]} */
        this._subscriptions = []

        /** @type {BoomackServer} */
        this._workspaceServerConfig = { ...WORKSPACE_SERVER_CONFIG }

        /** @type {BoomackServer[]} */
        this._inventoryServerConfigs = []

        /** @type {Object.<string, ServerUIState>} */
        this.serverStates = {}

        /** @type {?string} */
        this.selectedServerName = null

        /** @type {EventEmitter<InventoryChangedEvent>} */
        this._serversChangedEmitter = new EventEmitter()
        /** @type {Event<InventoryChangedEvent>} */
        this.onServersChanged = this._serversChangedEmitter.event

        /** @type {EventEmitter<ServerChangedEvent>} */
        this._serverChangedEmitter = new EventEmitter()
        /** @type {Event<ServerChangedEvent>} */
        this.onServerChanged = this._serverChangedEmitter.event

        /** @type {EventEmitter<ServerSelectionEvent>} */
        this._selectedServerChangedEmitter = new EventEmitter()
        /** @type {Event<ServerSelectionEvent>} */
        this.onSelectedServerChanged = this._selectedServerChangedEmitter.event

        /** @type {EventEmitter<PanelChangedEvent>} */
        this._panelChangedEmitter = new EventEmitter()
        /** @type {Event<PanelChangedEvent>} */
        this.onPanelChanged = this._panelChangedEmitter.event

        /** @type {EventEmitter<PanelSelectionEvent>} */
        this._selectedPanelChangedEmitter = new EventEmitter()
        /** @type {Event<PanelSelectionEvent>} */
        this.onSelectedPanelChanged = this._selectedPanelChangedEmitter.event

        /** @type {EventEmitter<SlotSelectionEvent>} */
        this._selectedSlotChangedEmitter = new EventEmitter()
        /** @type {Event<SlotSelectionEvent>} */
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
     * @param {Disposable} subs
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
        const treeView = window.createTreeView('boomack-servers', {
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
                await this.selectServer(serverState)
                blockEvent = false
            }))
        this.registerSubscription(
            this.onSelectedServerChanged(async e => {
                if (blockEvent) return
                await treeView.reveal(e.serverState, { select: true })
            }))
        return treeView
    }

    createPanelTreeView() {
        const treeView = window.createTreeView('boomack-panels', {
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
                        panelState)
                    blockEvent = false
                }
            }))
        this.registerSubscription(
            this.onSelectedPanelChanged(async e => {
                if (blockEvent) return
                if (e.serverState.name !== this.panelItemProvider.serverState?.name) return
                await treeView.reveal(e.panelState, { select: true })
            }))
        return treeView
    }

    createSlotTreeView() {
        const treeView = window.createTreeView('boomack-slots', {
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
                        this.slotItemProvider.panelState,
                        slotState)
                    blockEvent = false
                }
            }))
        this.registerSubscription(
            this.onSelectedSlotChanged(async e => {
                if (blockEvent) return
                if (e.panelState.server.name !== this.slotItemProvider.serverState?.name) return
                if (e.panelState.id !== this.slotItemProvider.panelState?.id) return
                await treeView.reveal(e.slotState, { select: true })
            }))
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
        return await getClientFor(server)
    }

    _updateServerStateCollection() {
        if (!this.serverStates[WORKSPACE_SERVER_NAME]) {
            this.serverStates[WORKSPACE_SERVER_NAME] = {
                ...SERVER_UI_STATE_TEMPLATE,
                name: WORKSPACE_SERVER_NAME,
                server: this._workspaceServerConfig,
                running: false,
                panels: {},
            }
        }
        const servers = this._inventoryServerConfigs
        for (const server of servers) {
            let state = this.serverStates[server.name]
            if (!state) {
                state = {
                    ...SERVER_UI_STATE_TEMPLATE,
                    name: server.name,
                    server,
                    panels: {},
                }
                this.serverStates[server.name] = state
            }
        }
        const obsoleteServerNames = keys(this.serverStates)
            .filter(name =>
                name !== WORKSPACE_SERVER_NAME
                && !some(servers, s => s.name === name))
        for (const name of obsoleteServerNames) {
            delete this.serverStates[name]
        }
    }

    /**
     * @param {ServerUIState} serverState
     */
    async _updateServerState(serverState) {
        if (!isServerState(serverState)) throw new Error("Expected server state as first argument")
        let server = serverState.name === WORKSPACE_SERVER_NAME
            ? this._workspaceServerConfig
            : this._inventoryServerConfigs.find(s => s.name === serverState.name)
        if (!server) throw new Error(`Config for server '${serverState.name}' is missing`)

        if (!serverState.invalid) return

        serverState.server = server

        if (serverState.running === false) {
            // can only be the case for workspace server
            serverState.panelIds = []
            // preserve panel state and selection
            serverState.invalid = false
            return
        }

        await window.withProgress({
            location: ProgressLocation.Notification,
            cancellable: false,
            title: `Boomack ${serverState.name}`
        }, async progress => {
            progress.report({ increment: 0, message: 'Loading panel list' })
            const client = await this.clientFor(server)
            const panelIdsResponse = await client.listPanels()
            if (panelIdsResponse.success) {
                const panelIds = /** @type {string[]} */ (panelIdsResponse.body)
                serverState.panelIds = [ ...panelIds ]
            }
            this._updatePanelStateCollection(serverState)

            // const defaultPanelState = serverState.panels['default']
            // if (defaultPanelState) {
            //     await this._updatePanelState(defaultPanelState)
            // }
            const panelStates = values(serverState.panels)
            let progressValue = 10
            for (const panelState of panelStates) {
                progress.report({ increment: progressValue, message: `Loading panel "${panelState.id}"` })
                await this._updatePanelState(panelState)
                progressValue += 90 / panelStates.length
            }

            progress.report({ increment: 100 })

            serverState.invalid = false
        })
    }

    /**
     * @param {ServerUIState} serverState
     */
    async refreshServerState(serverState) {
        serverState.invalid = true
        await this._updateServerState(serverState)
        this._serverChangedEmitter.fire({ serverState: this.serverStates[serverState.name] })
    }

    /**
     * @param {{server: Object, client: Object}} config
     */
    updateWorkspaceServer(config) {
        this._workspaceServerConfig.url = config.server.url
            || `http://${config.server.host}:${config.server.port}/`
        this._workspaceServerConfig.token = config.client.token
            || null
        this._serverChangedEmitter.fire({ serverState: this.serverStates[WORKSPACE_SERVER_NAME] })
    }

    /**
     * @param {boolean} running
     */
    async setWorkspaceServerRunning(running) {
        const serverState = this.serverStates[WORKSPACE_SERVER_NAME]
        console.assert(serverState,
            "No UI state initialized for server '%s'", WORKSPACE_SERVER_NAME)
        serverState.running = running
        await this.refreshServerState(serverState)
    }

    /**
     * @param {BoomackServer[]} serverConfigs
     */
    setInventoryServers(serverConfigs) {
        this._inventoryServerConfigs = serverConfigs
        this._updateServerStateCollection()
        this._serversChangedEmitter.fire({ serverStates: this.getServerStates() })
    }

    /**
     * @returns {ServerUIState[]}
     */
    getServerStates() {
        return sortBy(values(this.serverStates),
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
     * @param {?ServerUIState} serverState
     */
    async selectServer(serverState) {
        const serverName = serverState?.name || null
        if (this.selectedServerName === serverName) return
        let panelState = null
        let slotState = null
        this.selectedServerName = serverName
        if (serverState) {
            try {
            await this._updateServerState(serverState)
            } catch (err) {
                window.showWarningMessage(`Failed to connect to Boomack server "${serverName}"`)
                console.warn('Failed to refresh panels on', serverName, err)
            }
            if (serverState.selectedPanelId) {
                panelState = serverState.panels[serverState.selectedPanelId] || null
            }
            if (panelState?.selectedSlotId) {
                slotState = panelState.slots[panelState.selectedSlotId] || null
            }
        }
        this._selectedServerChangedEmitter.fire({ serverState })
        if (serverState) {
            this._selectedPanelChangedEmitter.fire({ serverState, panelState })
            if (panelState) {
                this._selectedSlotChangedEmitter.fire({ panelState, slotState })
            }
        }
    }

    /**
     * @param {ServerUIState} serverState
     */
    _updatePanelStateCollection(serverState) {
        if (!serverState) throw new Error("Missing argument serverState")
        for (const panelId of serverState.panelIds) {
            let state = serverState.panels[panelId]
            if (!state) {
                state = {
                    ...PANEL_UI_STATE_TEMPLATE,
                    id: panelId,
                    server: serverState,
                }
                serverState.panels[panelId] = state
            }
        }
        const obsoletePanelIds = keys(serverState.panels)
            .filter(id => !serverState.panelIds.includes(id))
        for (const id of obsoletePanelIds) {
            const panelState = serverState.panels[id]
            panelState.server = undefined // reset backlink
            delete serverState.panels[id]
            if (serverState.selectedPanelId === id) {
                serverState.selectedPanelId = null
            }
        }
    }

    /**
     * @param {PanelUIState} panelState
     */
    async _updatePanelState(panelState) {
        if (!panelState) throw new Error("Missing argument panelState")
        const client = await this.clientFor(panelState.server.server)
        const response = await client.getPanel(panelState.id)
        if (response.success) {
            panelState.definition = /** @type {PanelDefinition} */ (response.body)
            panelState.defaultSlotId = panelState.definition.defaultSlot
            if (!panelState.defaultSlotId && panelState.definition.type === 'grid') {
                panelState.defaultSlotId = sortBy(panelState.definition.slots, 'id')[0]?.id
            }
            if (panelState.slots) {
                for (const slotState of values(panelState.slots)) {
                    slotState.panel = undefined // reset backlink
                }
            }
            panelState.slots = keyBy(
                map(panelState.definition.slots, s => ({
                    ...SLOT_UI_STATE_TEMPLATE,
                    panel: panelState,
                    id: s.id,
                    defaultSlot: s.id === panelState.defaultSlotId,
                })),
                s => s.id)
            if (!some(panelState.definition.slots, s => s.id === panelState.selectedSlotId)) {
                panelState.selectedSlotId = null
            }
        } else {
            console.error(`Failed to retrieve panel definition: HTTP status ${response.statusCode} ${response.statusMessage}`)
            return
        }
        panelState.invalid = false
    }

    /**
     * @param {PanelUIState} panelState
     */
    async refreshPanelState(panelState) {
        if (!panelState) throw new Error("Missing argument panelState")
        panelState.invalid = true
        await this._updatePanelState(panelState)
        this._panelChangedEmitter.fire({ panelState })
    }

    /**
     * @param {?ServerUIState} serverState
     */
    getPanelStates(serverState) {
        if (!serverState) return []
        return sortBy(values(serverState.panels),
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
     * @param {?PanelUIState} panelState
     */
    async selectPanel(serverState, panelState) {
        if (!serverState) throw new Error("Missing argument serverState")
        const panelId = panelState?.id || null
        if (serverState.selectedPanelId === panelId) return
        let slotState = null
        if (panelState) {
            if (panelState?.selectedSlotId) {
                slotState = panelState.slots[panelState.selectedSlotId] || null
            }
        }
        serverState.selectedPanelId = panelId
        if (panelState) {
            await this._updatePanelState(panelState)
        }
        this._selectedPanelChangedEmitter.fire({ serverState, panelState })
        if (panelState) {
            this._selectedSlotChangedEmitter.fire({ panelState, slotState })
        }
    }

    /**
     * @param {?PanelUIState} panelState
     * @returns {SlotUIState[]}
     */
    getSlotStates(panelState) {
        if (!panelState) return []
        return sortBy(values(panelState.slots),
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
     * @param {PanelUIState} panelState
     * @param {?SlotUIState} slotState
     */
    selectSlot(panelState, slotState) {
        if (!panelState) throw new Error("Missing argument panelState")
        const slotId = slotState?.id || null
        if (panelState.selectedSlotId === slotId) return
        panelState.selectedSlotId = slotId
        this._selectedSlotChangedEmitter.fire({ panelState, slotState })
    }

    /**
     * @param {ServerUIState} serverState
     * @returns {PanelUIState|null}
     */
    defaultPanelForServer(serverState) {
        return serverState.panels['default'] || null
    }

    /**
     * @param {PanelUIState} panelState
     * @returns {SlotUIState|null}
     */
    defaultSlotForPanel(panelState) {
        if (!panelState.defaultSlotId) return null
        return panelState.slots[panelState.defaultSlotId] || null
    }

    /**
     * @param {ServerUIState} serverState
     * @returns {BoomackTarget}
     */
    targetFromServer(serverState) {
        const panelState = this.defaultPanelForServer(serverState)
        const panelId = panelState?.id
        const slotState = panelState ? this.defaultSlotForPanel(panelState) : null
        const slotId = slotState?.id
        const server = serverState.server
        return { server, panelId, slotId }
    }

    /**
     * @param {PanelUIState} panelState
     * @returns {BoomackTarget}
     */
    targetFromPanel(panelState) {
        const { server: serverState, id: panelId } = panelState
        const server = serverState.server
        const slotState = panelState.definition.type === 'grid'
            ? this.defaultSlotForPanel(panelState)
            : null
        const slotId = slotState?.id
        return { server, panelId, slotId }
    }

    /**
     * @param {SlotUIState} slotState
     * @returns {BoomackTarget}
     */
    targetFromSlot(slotState) {
        const { panel: panelState, id: slotId } = slotState
        const { server: serverState, id: panelId } = panelState
        const server = serverState.server
        return { server, panelId, slotId }
    }

    /**
     * @returns {BoomackTarget|null}
     */
    getCurrentTarget() {
        let serverState = this.getSelectedServerState()
        if (!serverState) {
            serverState = this.serverStates[WORKSPACE_SERVER_NAME] || null
        }
        if (!serverState) return null
        let panelState = this.getSelectedPanelState(serverState)
        if (!panelState) {
            return this.targetFromServer(serverState)
        }
        let slotState = this.getSelectedSlotState(panelState)
        if (!slotState) {
            return this.targetFromPanel(panelState)
        }
        if (!slotState) return null
        return {
            server: serverState.server,
            panelId: panelState.id,
            slotId: slotState.id,
        }
    }
}

/**
 * @implements {TreeDataProvider<ServerUIState>}
 */
class ServerTreeItemProvider {

    /**
     * @param {Navigator} navigator
     */
    constructor(navigator) {
        this.navigator = navigator

        /** @type {EventEmitter<?ServerUIState>} */
        this._changeEmitter = new EventEmitter()
        /** @type {Event<?ServerUIState>} */
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
     * @returns {ProviderResult<ServerUIState[]>}
     */
    getChildren(element) {
        if (element) return []
        return this.navigator.getServerStates()
    }

    /**
     * @param {ServerUIState} element
     * @returns {TreeItem}
     */
    getTreeItem(element) {
        const server = element.server
        const label = element.name === WORKSPACE_SERVER_NAME
            ? WORKSPACE_SERVER_LABEL
            : element.name
        const item = new TreeItem(label, TreeItemCollapsibleState.None)
        item.iconPath = new ThemeIcon('server-environment')
        item.contextValue = element.name === WORKSPACE_SERVER_NAME
            ? 'workspaceServer'
            : 'inventoryServer'
        if (server) {
            const url = new URL(server.url)
            item.description =
                url.host
                + (server.token ? '  🔑' : '')
                + (server.token && url.protocol === 'http:' ? ' ⚠️' : '')
        }
        return item
    }

    getParent() { return null }
}

/**
 * @implements {TreeDataProvider<PanelUIState>}
 */
class PanelTreeItemProvider {

    /**
     * @param {Navigator} navigator
     */
    constructor(navigator) {
        this.navigator = navigator

        /** @type {EventEmitter<?PanelUIState>} */
        this._changeEmitter = new EventEmitter()
        /** @type {Event<?PanelUIState>} */
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
     * @returns {ProviderResult<PanelUIState[]>}
     */
    getChildren(element) {
        if (element || !this.serverState) return []
        return this.navigator.getPanelStates(this.serverState)
    }

    /**
     * @param {PanelUIState} element
     * @returns {TreeItem}
     */
    getTreeItem(element) {
        if (!element.server) throw new Error('Showing tree item for disposed panel state')
        const item = new TreeItem(element.id, TreeItemCollapsibleState.None)
        item.iconPath = new ThemeIcon('window')
        item.description = element.definition?.title
        return item
    }

    getParent() { return null }
}

/**
 * @implements {TreeDataProvider<SlotUIState>}
 */
class SlotTreeItemProvider {

    /**
     * @param {Navigator} navigator
     */
    constructor(navigator) {
        this.navigator = navigator

        /** @type {EventEmitter<?SlotUIState>} */
        this._changeEmitter = new EventEmitter()
        /** @type {Event<?SlotUIState>} */
        this.onDidChangeTreeData = this._changeEmitter.event

        /** @type {?ServerUIState} */
        this.serverState = null

        /** @type {?PanelUIState} */
        this.panelState = null

        navigator.registerSubscription(
            navigator.onSelectedServerChanged(
                e => {
                    this.serverState = e.serverState
                    this.panelState = null
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
            navigator.onSelectedPanelChanged(
                e => {
                    this.serverState = e.serverState
                    this.panelState = e.panelState
                    this._changeEmitter.fire(null)
                }))
        navigator.registerSubscription(
            navigator.onPanelChanged(
                e => {
                    if (e.panelState.server.name !== this.serverState?.name
                        || e.panelState.id !== this.panelState?.id ) {
                        return
                    }
                    this.panelState = e.panelState
                    this._changeEmitter.fire(null)
                }))
    }

    /**
     *
     * @param {?SlotUIState} element
     * @returns {ProviderResult<SlotUIState[]>}
     */
    getChildren(element) {
        if (element || !this.panelState) return []
        return this.navigator.getSlotStates( this.panelState)
    }

    /**
     * @param {SlotUIState} element
     * @returns {TreeItem}
     */
    getTreeItem(element) {
        if (!element.panel) throw new Error('Showing tree item for disposed slot state')
        const item = new TreeItem(element.id, TreeItemCollapsibleState.None)
        if (element.defaultSlot) {
            item.description = '(default)'
        }
        item.iconPath = new ThemeIcon('symbol-constant')
        return item
    }

    getParent() { return null }
}

export default {
    Navigator,
}
