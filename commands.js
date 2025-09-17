import { filter, map, max, omitBy, values } from 'lodash-es'
import fs from'node:fs/promises'
import path from 'node:path'
import waitOn from 'wait-on'
import {
    commands,
    ProgressLocation,
    ThemeIcon,
    window,
    workspace,
} from 'vscode'
import mime from 'mime'
import {
    removeItemOnce,
    isFileBinary,
    textViewOfBinaryFile,
} from './utils.js'
import {
    WORKSPACE_SERVER_NAME,
    WORKSPACE_SERVER_LABEL,
    isServerState,
    isPanelState,
    isSlotState,
} from './model.js'
import {
    config,
    loadWorkspaceClientConfig,
    loadWorkspaceServerConfig,
    getFileSrcRootsFromRunConfig,
} from './config.js'
import inventory from './inventory.js'
import { runToolInTerminal } from './tools.js'

/**
 * @typedef {import('vscode').Terminal} Terminal
 * @typedef {import('vscode').QuickPickItem} QuickPickItem
 */
/**
 * @typedef {import('./inventory.js').BoomackServer} BoomackServer
 * @typedef {import('./model.js').UIState} UIState
 * @typedef {import('./model.js').ServerUIState} ServerUIState
 * @typedef {import('./model.js').PanelUIState} PanelUIState
 * @typedef {import('./model.js').SlotUIState} SlotUIState
 * @typedef {import('./model.js').BoomackTarget} BoomackTarget
 * @typedef {import('./navigation.js').Navigator} Navigator
 */

/**
 * @param {any} uiState
 * @return {ServerUIState|undefined}
 */
function resolveServerState(uiState) {
    if (!uiState) return undefined
    if (isServerState(uiState)) {
        const serverState = /** @type {ServerUIState} */ (uiState)
        return serverState
    } else if (isPanelState(uiState)) {
        const panelState = /** @type {PanelUIState} */ (uiState)
        return panelState.server
    } else if (isSlotState(uiState)) {
        const slotState = /** @type {SlotUIState} */ (uiState)
        return slotState.panel?.server
    }
    return undefined
}

/**
 * @param {any} uiState
 * @return {PanelUIState|undefined}
 */
function resolvePanelState(uiState) {
    if (!uiState) return undefined
    if (isPanelState(uiState)) {
        const panelState = /** @type {PanelUIState} */ (uiState)
        return panelState
    } else if (isSlotState(uiState)) {
        const slotState = /** @type {SlotUIState} */ (uiState)
        return slotState.panel
    }
    return undefined
}

// /**
//  * @param {any} uiState
//  * @return {SlotUIState|undefined}
//  */
// function resolveSlotState(uiState) {
//     if (!uiState) return undefined
//     if (isSlotState(uiState)) {
//         const slotState = /** @type {SlotUIState} */ (uiState)
//         return slotState
//     }
//     return undefined
// }

function playgroundCommand() {
    return async () => {
        console.log('Use for protoyping...')
    }
}

/**
 * @template T
 * @param {QuickPickItem[]} items
 * @param {function(string):T} labelMapper
 * @param {Object} [options]
 * @returns {Promise<T|undefined>}
 */
function quickPick(items, labelMapper, options) {
    const quickPick = window.createQuickPick()
    quickPick.canSelectMany = false
    quickPick.items = items
    // Preselecting a single item without canSelectMany
    // is currently not supported by the VS Code API.
    // IQuickPickItem.picked is ignored if canSelectMany is not set.
    // Setting selectedItems with an array containing one element
    // immediately closes the QuickPick if canSelectMany is not set.
    for (const k in options) {
        quickPick[k] = options[k]
    }
    return new Promise(resolve => {
        let resolved = false
        quickPick.onDidHide(() => {
            if (!resolved) resolve(undefined)
            quickPick.dispose()
        })
        quickPick.onDidAccept(() => {
            const selectedLabel = quickPick.selectedItems[0]?.label
            if (selectedLabel) {
                resolve(labelMapper(selectedLabel))
            } else {
                resolve(undefined)
            }
            quickPick.dispose()
        })
        quickPick.show()
    })
}

/**
 * @param {Navigator} navigator
 * @param {string} title
 * @param {{ step: number, totalSteps: number }} [multiStep]
 * @param {boolean} [excludeWorkspaceServer]
 * @returns {Promise<ServerUIState|undefined>}
 */
function userChooseServer(navigator, title, multiStep, excludeWorkspaceServer) {
    let servers = navigator.getServerStates()
    if (excludeWorkspaceServer) {
        servers = servers.filter(s => s.name !== WORKSPACE_SERVER_NAME)
    }
    if (servers.length === 0) {
        window.showWarningMessage("There is no Boomack server to choose from")
        return Promise.resolve(undefined)
    }
    const preselectedServer = navigator.getSelectedServerState()
        || (excludeWorkspaceServer
            ? undefined
            : navigator.serverStates[WORKSPACE_SERVER_NAME])
    const items = servers.map(s => ({
        label: s.name === WORKSPACE_SERVER_NAME
            ? WORKSPACE_SERVER_LABEL
            : s.name,
        description: s.server.url,
        iconPath: new ThemeIcon('server-environment'),
        picked: preselectedServer?.name === s.name,
    }))
    return quickPick(
        items,
        label => servers.find(s => s.name === label
            || s.name === WORKSPACE_SERVER_NAME && label === WORKSPACE_SERVER_LABEL),
        {
            title,
            placeholder: 'Server Name',
            step: multiStep?.step,
            totalSteps: multiStep?.totalSteps,
        })
}

/**
 * @param {Navigator} navigator
 * @param {ServerUIState} serverState
 * @param {string} title
 * @param {{ step: number, totalSteps: number }} [multiStep]
 * @returns {Promise<PanelUIState|undefined>}
 */
function userChoosePanelForServer(navigator, serverState, title, multiStep) {
    const panelStates = navigator.getPanelStates(serverState)
    const preselectedPanelState = navigator.getSelectedPanelState(serverState)
        || serverState.panels['default']
    const items = panelStates.map(p => ({
        label: p.id,
        description: p.definition?.title,
        iconPath: new ThemeIcon('window'),
        picked: preselectedPanelState?.id === p.id,
    }))
    return quickPick(
        items,
        label => panelStates.find(s => s.id === label),
        {
            title,
            placeholder: 'Panel ID',
            step: multiStep?.step,
            totalSteps: multiStep?.totalSteps,
        })
}

/**
 * @param {Navigator} navigator
 * @param {string} title
 * @returns {Promise<PanelUIState|undefined>}
 */
async function userChoosePanel(navigator, title) {
    const serverState = await userChooseServer(
        navigator, title, { step: 1, totalSteps: 2 })
    if (!serverState) return undefined
    const panelState = await userChoosePanelForServer(
        navigator, serverState, title, { step: 2, totalSteps: 2 })
    return panelState
}

/**
 * @param {Navigator} navigator
 * @param {PanelUIState} panelState
 * @param {string} title
 * @param {{ step: number, totalSteps: number }} [multiStep]
 * @returns {Promise<SlotUIState|undefined>}
 */
function userChooseSlotForPanel(navigator, panelState, title, multiStep) {
    const slotStates = navigator.getSlotStates(panelState)
    const preselectedSlot = navigator.getSelectedSlotState(panelState)
        || panelState.slots[panelState.definition?.defaultSlot]
    const items = slotStates.map(p => ({
        label: p.id,
        iconPath: new ThemeIcon('symbol-constant'),
        picked: preselectedSlot?.id === p.id,
    }))
    return quickPick(
        items,
        label => slotStates.find(s => s.id === label),
        {
            title,
            placeholder: 'Slot ID',
            step: multiStep?.step,
            totalSteps: multiStep?.totalSteps,
        })
}

/**
 * @param {Navigator} navigator
 * @param {string} title
 * @returns {Promise<SlotUIState|undefined>}
 */
async function userChooseSlot(navigator, title) {
    const serverState = await userChooseServer(
        navigator, title, { step: 1, totalSteps: 3 })
    if (!serverState) return undefined
    const panelState = await userChoosePanelForServer(
        navigator, serverState, title, { step: 2, totalSteps: 3 })
    if (!panelState) return undefined
    const slotState = await userChooseSlotForPanel(
        navigator, panelState, title, { step: 3, totalSteps: 3 })
    return slotState
}

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
async function openInBrowser(url) {
    const open = await import('open')
    open.default(url)
}

/** @type {Terminal | null} */
let workspaceServerTerminal = null

/**
 * @param {Navigator} navigator
 * @returns {function():(Promise<void>)}
 */
function reloadWorkspaceServerConfig(navigator) {
    return async () => {
        const config = await loadWorkspaceClientConfig()
        navigator.updateWorkspaceServer(config)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function():(Promise<void>)}
 */
function startWorkspaceServerCommand(navigator) {
    return async () => {
        if (workspaceServerTerminal) {
            window.showWarningMessage("Boomack Project Server is already running")
            return
        }
        await window.withProgress({
            title: 'Boomack Project Server',
            cancellable: false,
            location: ProgressLocation.Window,
        }, async progress => {
            progress.report({ increment: 10, message: 'Loading configuration' })
            const url = navigator.serverConfig(WORKSPACE_SERVER_NAME).url
            const clientConfig = await loadWorkspaceClientConfig()
            const serverRunConfig = await loadWorkspaceServerConfig()
            const fileSrcRoots = getFileSrcRootsFromRunConfig(serverRunConfig)
            const projectRoot = workspace.workspaceFolders[0].uri.fsPath
            fileSrcRoots.push(projectRoot)
            navigator.updateWorkspaceServer(clientConfig)
            progress.report({ increment: 20, message: 'Starting...' })
            const args = []
            if (config('server.verbose')) { args.push('-v') }

            args.push('-h'); args.push(clientConfig.server.host)
            args.push('-p'); args.push(`${clientConfig.server.port}`)

            args.push('-o')
            for (let i = 0; i < fileSrcRoots.length; i++) {
                args.push(`api.request.fileSrcRoots.${i}=${fileSrcRoots[i]}`)
            }

            workspaceServerTerminal = runToolInTerminal(
                navigator.getContext(),
                'Boomack Server', null,
                'boomack', args,
                projectRoot,
                () => {
                    commands.executeCommand('setContext',
                        'boomack.workspaceServer.running', false)
                    navigator.setWorkspaceServerRunning(false)
                    removeItemOnce(navigator.getContext().subscriptions, workspaceServerTerminal)
                    workspaceServerTerminal = null
                    window.showInformationMessage("Boomack Project Server stopped")
                })
            try {
                await waitOn({
                    resources: [url],
                    delay: 500,
                    interval: 500,
                    timeout: 30000,
                    tcpTimeout: 1000,
                    httpTimeout: 1000,
                    followRedirect: true,
                    validateStatus: status => status === 200 || status === 401,
                })
                progress.report({ increment: 100, message: 'Started' })
            } catch (err) {
                progress.report({ increment: 100, message: 'Error' })
                window.showErrorMessage(`Failed to start Boomack Project Server: ${err}`)
                console.error('Failed to start Boomack server', err)
                return
            }
            navigator.setWorkspaceServerRunning(true)
            navigator.getContext().subscriptions.push(workspaceServerTerminal)
            commands.executeCommand('setContext',
                    'boomack.workspaceServer.running', true)
            window.showInformationMessage("Boomack Project Server started")
        })
    }
}

/**
 * @returns {function():(void | Promise<void>)}
 */
function stopWorkspaceServerCommand() {
    return async () => {
        if (!workspaceServerTerminal) {
            window.showWarningMessage("Boomack Project Server is not running")
            return
        }
        // TODO kill process directly, if NodeJS is run without a shell
        // const pid = await workspaceServerTerminal.processId
        // if (pid) {
        //     process.kill(pid, 'SIGINT')
        // } else {
        //     workspaceServerTerminal.dispose()
        // }
        workspaceServerTerminal.dispose()
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function():(void | Promise<void>)}
 */
function addServerCommand(navigator) {
    return async () => {
        const defaultName = 'default'
        const defaultUrl = 'http://127.0.0.1:3000/'

        let name = await window.showInputBox({
            title: 'Boomack Server Name',
            placeHolder: defaultName,
            prompt: 'A user friendly name to identify the server',
        })
        if (name === undefined) return
        if (!name) name = defaultName

        if (name === WORKSPACE_SERVER_NAME) {
            window.showErrorMessage("This name is reserved for the workspace server")
            return
        }

        let url = await window.showInputBox({
            title: 'Boomack Server URL',
            placeHolder: defaultUrl,
            prompt: 'Enter the URL of the Boomack server',
        })
        if (url === undefined) return
        if (url === '') url = defaultUrl

        let token = await window.showInputBox({
            title: 'Boomack API Token',
            placeHolder: 'none',
            prompt: 'Leave empty, if the server does not require an API token',
        })
        if (token === undefined) return
        if (!token) token = null

        if (inventory.addServer(navigator.getContext(), { name, url, token })) {
            window.showInformationMessage(
                `Added Boomack server "${name}" to the inventory`)
        } else {
            window.showInformationMessage(
                `Updated Boomack server "${name}" in the inventory`)
        }
    }
}

/**
 * @param {Navigator} navigator
 * @param {string} serverName
 */
function removeServer(navigator, serverName) {
    if (inventory.removeServer(navigator.getContext(), serverName)) {
        window.showInformationMessage(
            `Removed Boomack server "${serverName}" from the inventory`)
    } else {
        window.showWarningMessage(
            `Removed Boomack server "${serverName}" not found in the inventory`)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?ServerUIState):(void | Promise<void>)}
 */
function removeServerCommand(navigator) {
    return async serverState => {
        if (serverState && !isServerState(serverState)) throw new Error('Expected server state or nothing as argument')
        if (!serverState) serverState = await userChooseServer(navigator, 'Remove Boomack Server', null, true)
        if (!serverState) return
        removeServer(navigator, serverState.name)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?ServerUIState, ?string):(Promise<ServerUIState|undefined>)}
 */
function selectServerCommand(navigator) {
    return async (serverState, title) => {
        if (!title) title = 'Select Boomack Server'
        if (serverState && !isServerState(serverState)) throw new Error('Expected server state or nothing as argument')
        if (!serverState) serverState = await userChooseServer(navigator, title)
        if (!serverState) return undefined
        await navigator.selectServer(serverState)
        return serverState
    }
}

/**
 * @param {?string} title
 * @returns {Promise<ServerUIState|undefined>}
 */
async function retroactivelySelectServer(title) {
    return await commands.executeCommand('boomack.server.select', null, title)
}

/**
 * @returns {function(?ServerUIState):(void | Promise<void>)}
 */
function openServerInBrowserCommand() {
    return async serverState => {
        if (serverState && !isServerState(serverState)) throw new Error('Expected server state or nothing as argument')
        if (!serverState) serverState = await retroactivelySelectServer('Open Server in Browser')
        if (!serverState) return
        let url = serverState.server.url
        if (!url.endsWith('/')) url += '/'
        await openInBrowser(url)
    }
}

/**
 * @param {Navigator} navigator
 * @param {boolean} targetSelected
 * @returns {function(any):(void | Promise<void>)}
 */
function refreshPanelsCommand(navigator, targetSelected) {
    return async element => {
        let serverState = resolveServerState(element)
        if (!serverState && targetSelected) serverState = navigator.getSelectedServerState()
        if (!serverState) serverState = await retroactivelySelectServer('Refresh Panels')
        if (!serverState) return
        try {
            await navigator.refreshServerState(serverState)
        } catch (err) {
            window.showWarningMessage(`Failed to connect to Boomack server "${serverState.name}"`)
            console.warn('Failed to refresh server state', serverState.name, err)
        }
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?PanelUIState):(Promise<PanelUIState|undefined>)}
 */
function selectPanelCommand(navigator) {
    return async panelState => {
        if (panelState && !isPanelState(panelState)) throw new Error('Expected panel state or nothing as argument')
        if (!panelState) panelState = await userChoosePanel(navigator, 'Select Boomack Panel')
        if (!panelState) return
        await navigator.selectServer(panelState.server)
        await navigator.selectPanel(panelState.server, panelState)
        return panelState
    }
}

/**
 * @param {?string} title
 * @returns {Promise<PanelUIState|undefined>}
 */
async function retroactivelySelectPanel(title) {
    return await commands.executeCommand('boomack.panel.select', null, title)
}

/**
 * @param {Navigator} navigator
 * @param {PanelUIState} panelState
 */
async function clearPanel(navigator, panelState) {
    const { server: serverState, id: panelId } = panelState
    const serverName = serverState.name
    const client = await navigator.clientFor(serverState.server)
    try {
        var response = await client.clearPanel(panelId)
        if (response.success) {
            window.showInformationMessage(`Cleared panel "${panelId}" on Boomack server "${serverName}".`)
        } else {
            window.showErrorMessage(`Failed to clear panel "${panelId}" on Boomack server "${serverName}". HTTP Status ${response.statusCode}.`)
        }
    } catch (err) {
        console.error("Failed to clear panel:", err)
        window.showErrorMessage(`Failed to clear panel "${panelId}" on Boomack server "${serverName}"`)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function clearPanelCommand(navigator) {
    return async panelState => {
        if (panelState && !isPanelState(panelState)) throw new Error('Expected panel state or nothing as argument')
        if (!panelState) panelState = await retroactivelySelectPanel('Clear Panel')
        if (!panelState) return
        await clearPanel(navigator, panelState)
    }
}

/**
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function openPanelInBrowserCommand() {
    return async panelState => {
        if (panelState && !isPanelState(panelState)) throw new Error('Expected panel state or nothing as argument')
        if (!panelState) panelState = await retroactivelySelectPanel('Open Panel in Browser')
        if (!panelState) return
        let url = panelState.server.server.url
        if (!url.endsWith('/')) url += '/'
        url += `panels/${panelState.id}`
        await openInBrowser(url)
    }
}

/**
 * @param {Navigator} navigator
 * @param {boolean} targetSelected
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function refreshSlotsCommand(navigator, targetSelected) {
    return async element => {
        let panelState = resolvePanelState(element)
        if (!panelState && targetSelected) {
            const selectedServerState = navigator.getSelectedServerState()
            if (selectedServerState) {
                panelState = navigator.getSelectedPanelState(selectedServerState)
            }
        }
        if (!panelState) panelState = await retroactivelySelectPanel('Refresh Panel')
        if (!panelState) return
        try {
            await navigator.refreshPanelState(panelState)
        } catch (err) {
            window.showWarningMessage(`Failed to refresh slots of Boomack panel "${panelState.id}" on server "${panelState.server.name}"`)
            console.warn('Failed to refresh slots of panel', panelState.id, panelState.server.name, err)
        }
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?SlotUIState):(Promise<SlotUIState|undefined>)}
 */
function selectSlotCommand(navigator) {
    return async slotState => {
        if (slotState && !isSlotState(slotState)) throw new Error('Expected slot state or nothing as argument')
        if (!slotState) slotState = await userChooseSlot(navigator, 'Select Boomack Slot')
        if (!slotState) return
        const panelState = slotState.panel
        await navigator.selectServer(slotState.panel.server)
        await navigator.selectPanel(slotState.panel.server, slotState.panel)
        slotState = panelState.slots[slotState.id]
        navigator.selectSlot(panelState, slotState)
        return slotState
    }
}

/**
 * @param {?string} title
 * @returns {Promise<SlotUIState|undefined>}
 */
async function retroactivelySelectSlot(title) {
    return await commands.executeCommand('boomack.slot.select', null, title)
}

/**
 * @param {Navigator} navigator
 * @param {?SlotUIState} slotState
 */
async function clearSlot(navigator, slotState) {
    const { panel: panelState, id: slotId } = slotState
    const { server: serverState, id: panelId } = panelState
    const serverName = serverState.name
    const client = await navigator.clientFor(serverState.server)
    try {
        var response = await client.clearSlot(panelId, slotId)
        if (response.success) {
            window.showInformationMessage(`Cleared slot "${panelId}/${slotId}" on Boomack server "${serverName}".`)
        } else {
            window.showErrorMessage(`Failed to clear slot "${panelId}/${slotId}" on Boomack server "${serverName}". HTTP Status ${response.statusCode}.`)
        }
    } catch (err) {
        console.error("Failed to clear slot:", err)
        window.showErrorMessage(`Failed to clear slot "${panelId}/${slotId}" on Boomack server "${serverName}"`)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function clearSlotCommand(navigator) {
    return async slotState => {
        if (slotState && !isSlotState(slotState)) throw new Error('Expected slot state or nothing as argument')
        if (!slotState) slotState = await retroactivelySelectSlot('Clear Slot')
        if (!slotState) return
        await clearSlot(navigator, slotState)
    }
}

/**
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function openSlotInBrowserCommand() {
    return async slotState => {
        if (slotState && !isSlotState(slotState)) throw new Error('Expected slot state or nothing as argument')
        if (!slotState) slotState = await retroactivelySelectSlot('Open Slot in Browser')
        if (!slotState) return
        const panelItem = slotState.panel
        let url = panelItem.server.server.url
        if (!url.endsWith('/')) url += '/'
        url += `panels/${panelItem.id}/slots/${slotState.id}`
        await openInBrowser(url)
    }
}


/**
 * @param {Navigator} navigator
 * @param {'in'|'out'} direction
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function slotZoomCommand(navigator, direction) {
    return async slotState => {
        if (slotState && !isSlotState(slotState)) throw new Error('Expected slot state or nothing as argument')
        if (!slotState) slotState = await retroactivelySelectSlot('Zoom Slot')
        if (!slotState) return
        const { server, panelId, slotId } = navigator.targetFromSlot(slotState)
        const client = await navigator.clientFor(server)
        let dirWord = null
        if (direction === 'in') dirWord = 'In'
        else if (direction === 'out') dirWord = 'Out'
        await client.evaluateCode([{
            panelId,
            script: `boomack.cmdSlotZoom${dirWord}('${slotId}')`
        }])
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function slotToggleMaximizeCommand(navigator) {
    return async slotState => {
        if (slotState && !isSlotState(slotState)) throw new Error('Expected slot state or nothing as argument')
        if (!slotState) slotState = await retroactivelySelectSlot('Toggle Maximize Slot')
        if (!slotState) return
        const { server, panelId, slotId } = navigator.targetFromSlot(slotState)
        const client = await navigator.clientFor(server)
        await client.evaluateCode([{
            panelId,
            script: `boomack.cmdToggleMaximize('${slotId}')`
        }])
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function slotRemoveCommand(navigator) {
    return async slotState => {
        if (slotState && !isSlotState(slotState)) throw new Error('Expected slot state or nothing as argument')
        if (!slotState) slotState = await retroactivelySelectSlot('Remove Slot')
        if (!slotState) return
        const panelDefinition = slotState.panel.definition
        if (panelDefinition.type !== 'document') {
            window.showWarningMessage("Removing slots is only possible in panels with document layout")
            return
        }
        const newPanelDefinition = {
            ...panelDefinition,
            defaultSlot: panelDefinition.defaultSlot !== slotState.id
                ? panelDefinition.defaultSlot
                : null,
            slots: omitBy(panelDefinition.slots, slot => slot.id === slotState.id),
        }
        const client = await navigator.clientFor(slotState.panel.server.server)
        const response = await client.updatePanel(slotState.panel.id, newPanelDefinition)
        if (!response.success) {
            window.showErrorMessage("Removing the slot failed")
            console.error(`Failed to update panel layout: HTTP status ${response.statusCode} ${response.statusMessage}`)
            console.log(response.body)
            return
        }
        await navigator.refreshPanelState(slotState.panel)
    }
}

/**
 * @param {{ predicate: function(string):boolean, type: string }[]} types
 * @param {string} filename
 * @param {{ defaultType?: string, mimeFallback?: boolean }} [options]
 * @returns {string}
 */
function lookupMediaType(
    types, filename,
    {
        defaultType = 'application/octet-stream',
        mimeFallback = true,
    } = {}
) {
    const name = path.basename(filename)
    for (const { predicate, type } of types) {
        if (predicate(name)) return type
    }
    if (mimeFallback) {
        let ext = path.extname(name)
        if (ext.startsWith('.')) ext = ext.substring(1)
        if (ext) {
            return mime.getType(ext);
        }
    }
    return defaultType;
}

/**
 * @param {string} filename
 * @param {string} [suffix]
 * @returns {string}
 */
function titleForFile(filename, suffix) {
    let title = null
    const titleMode = config('displayTitle')
    if (titleMode === 'filename') {
        title = path.basename(filename)
    } else if (titleMode === 'filepath') {
        title = filename
    }
    if (suffix) {
        title += ' ' + suffix
    }
    return title
}

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {string} filename
 * @param {{
 *   mediaType?: string,
 *   titleSuffix?: string,
 *   options?: Object,
 * }} [options]
 */
async function displayFile(
    navigator, target, filename,
    {
        mediaType,
        titleSuffix,
        options,
    } = {}
) {
    const boomackClient = await navigator.clientFor(target.server)
    if (!mediaType) {
        mediaType = lookupMediaType(boomackClient.config.client.types, filename)
    }
    const presets = null
    const title = titleForFile(filename, titleSuffix)
    const fileStat = await fs.stat(filename)
    const fd = await fs.open(filename)
    const s = fd.createReadStream()
    const result = target.slotId
        ? await boomackClient.streamMediaItemToSlot(
            target.panelId, target.slotId,
            mediaType, s, fileStat.size,
            title, presets, options)
        : await boomackClient.streamMediaItemToPanel(
            target.panelId,
            mediaType, s, fileStat.size,
            title, presets, options)
    fd.close()
    if (!result.success) {
        window.showErrorMessage(`Failed to display file content. HTTP Status ${result.statusCode}.`)
    }
}

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {string} filename
 */
async function displayBinaryFileSource(navigator, target, filename) {
    const text = await textViewOfBinaryFile(filename)
    const boomackClient = await navigator.clientFor(target.server)
    const response = await boomackClient.displayMediaItems({
        panel: target.panelId,
        slot: target.slotId,
        type: 'text/plain',
        text,
    })
    if (!response.success) {
        window.showErrorMessage("Failed to display source of binary file")
        return
    }
}

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {string} filename
 */
async function displayFileSource(navigator, target, filename) {
    if (await isFileBinary(filename)) {
        return await displayBinaryFileSource(navigator, target, filename)
    }
    const clientConfig = await loadWorkspaceClientConfig()
    let mediaType = lookupMediaType(
        clientConfig.client.sourceTypes,
        filename,
        { defaultType: 'text/plain', mimeFallback: false })
    let language = 'plain'
     if (mediaType === 'text/plain') {
        language = lookupMediaType(
            clientConfig.client.sourceLanguages,
            filename,
            { defaultType: 'plain', mimeFallback: false })
    }
    const options = language
        ? { transformation: 'highlight', syntax: language }
        : null
    await displayFile(navigator, target, filename, { mediaType, options })
}

/**
 * @typedef {Object} DisplayFlags
 * @property {'default'|'source'|'prompt'} [typeMode]
 */

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {string} filename
 * @param {DisplayFlags} flags
 */
async function displayFileWithFlags(
    navigator, target, filename,
    {
        typeMode = 'default',
    }
) {
    if (typeMode === 'source') {
        await displayFileSource(navigator, target, filename)
    } else if (typeMode === 'prompt') {
        const mediaType = await window.showInputBox({
            title: "Display",
            prompt: "Enter a media type",
            value: 'application/octet-stream',
        })
        await displayFile(navigator, target, filename, { mediaType })
    } else {
        await displayFile(navigator, target, filename)
    }
}

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {DisplayFlags} flags
 */
async function displayDocumentOnTarget(navigator, target, flags) {
    const editor = window.activeTextEditor
    if (!editor) {
        window.showErrorMessage("No active text editor")
        return
    }
    const filename = editor.document.uri.fsPath
    await displayFileWithFlags(navigator, target, filename, flags)
}

/**
 * @param {Navigator} navigator
 * @param {DisplayFlags} flags
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function displayDocumentInPanelCommand(navigator, flags) {
    return async panelState => {
        if (!panelState) {
            window.showErrorMessage("No target panel selected")
            return
        }
        const target = navigator.targetFromPanel(panelState)
        await displayDocumentOnTarget(navigator, target, flags)
    }
}

/**
 * @param {Navigator} navigator
 * @param {DisplayFlags} flags
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function displayDocumentInSlotCommand(navigator, flags) {
    return async slotState => {
        if (!slotState) {
            window.showErrorMessage("No target slot selected")
            return
        }
        const target = navigator.targetFromSlot(slotState)
        await displayDocumentOnTarget(navigator, target, flags)
    }
}

/**
 * @param {Navigator} navigator
 * @param {DisplayFlags} flags
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function displayDocumentInSlotWithIdCommand(navigator, flags) {
    return async () => {
        const serverState = navigator.getSelectedServerState()
        const panelState = navigator.getSelectedPanelState(serverState)
        const autoSlotIdPattern = /^slot-(\d+)$/
        const autoSlotIds = filter(map(values(panelState.slots), 'id'), id => autoSlotIdPattern.test(id))
        const autoSlotNumbers = map(autoSlotIds, id => Number.parseInt(id.substring(5)))
        const lastAutoSlotNumber = max(autoSlotNumbers)
        const nextAutoSlotNumber = lastAutoSlotNumber === undefined ? 0 : (lastAutoSlotNumber + 1)
        const slotId = await window.showInputBox({
            title: "Display",
            prompt: "Enter a Panel ID",
            value: `slot-${nextAutoSlotNumber}`
        })
        if (!slotId) return
        const target = { ...navigator.targetFromPanel(panelState), slotId }
        await displayDocumentOnTarget(navigator, target, flags)
    }
}

/**
 * @param {Navigator} navigator
 * @param {DisplayFlags} flags
 * @returns {function({fsPath: string}):(void | Promise<void>)}
 */
function displayFileCommand(navigator, flags) {
    return async resource => {
        if (!resource) {
            const editor = window.activeTextEditor
            if (editor) {
                resource = editor.document.uri
            } else {
                window.showErrorMessage("No active text editor")
                return
            }
        }
        if (!resource.fsPath) {
            window.showErrorMessage("Command expects a file resource or editor document as argument")
            return
        }
        const target = navigator.getCurrentTarget()
        if (!target) {
            window.showErrorMessage("No target slot selected")
        }
        const filename = resource.fsPath
        await displayFileWithFlags(navigator, target, filename, flags)
    }
}

export default {
    playgroundCommand,
    reloadWorkspaceServerConfig,
    startWorkspaceServerCommand,
    stopWorkspaceServerCommand,
    addServerCommand,
    removeServerCommand,
    selectServerCommand,
    openServerInBrowserCommand,
    refreshPanelsCommand,
    selectPanelCommand,
    clearPanelCommand,
    openPanelInBrowserCommand,
    refreshSlotsCommand,
    selectSlotCommand,
    clearSlotCommand,
    slotZoomCommand,
    slotToggleMaximizeCommand,
    openSlotInBrowserCommand,
    slotRemoveCommand,
    displayDocumentInPanelCommand,
    displayDocumentInSlotCommand,
    displayDocumentInSlotWithIdCommand,
    displayFileCommand,
}
