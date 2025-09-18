import { filter, first, map, max, omitBy, values } from 'lodash-es'
import fs from'node:fs/promises'
import path from 'node:path'
import waitOn from 'wait-on'
import { ctrlc } from 'ctrlc-windows'
import {
    commands,
    NotebookCellKind,
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
import {
    getBoomackServerCommandLine,
    runInTerminal,
} from './tools.js'

/**
 * @typedef {import('vscode').Terminal} Terminal
 * @typedef {import('vscode').QuickPickItem} QuickPickItem
 * @typedef {import('vscode').TextEditor} TextEditor
 * @typedef {import('vscode').Selection} Selection
 * @typedef {import('vscode').NotebookCell} NotebookCell
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

/**
 * @param {any} uiState
 * @return {SlotUIState|undefined}
 */
function resolveSlotState(uiState) {
    if (!uiState) return undefined
    if (isSlotState(uiState)) {
        const slotState = /** @type {SlotUIState} */ (uiState)
        return slotState
    }
    return undefined
}

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
 * @param {boolean} [allowSelectNothing]
 * @returns {Promise<PanelUIState|null|undefined>}
 */
async function userChoosePanelForServer(navigator, serverState, title, multiStep, allowSelectNothing) {
    if (serverState.invalid) {
        await navigator.refreshServerState(serverState)
    }
    const panelStates = navigator.getPanelStates(serverState)
    const preselectedPanelState = navigator.getSelectedPanelState(serverState)
        || serverState.panels['default']
    let items = panelStates.map(p => ({
        label: p.id,
        description: p.definition?.title,
        iconPath: new ThemeIcon('window'),
        picked: preselectedPanelState?.id === p.id,
    }))
    if (allowSelectNothing) {
        // Currently the TreeView API does not allow to unselect items
        // Therefore, selecting nothing at this point is pointless
        // items = [
        //     {
        //         label: 'Select Nothing',
        //         iconPath: new ThemeIcon('circle'),
        //         alwaysShow: true,
        //     },
        //     ... items,
        // ]
    }
    return await quickPick(
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
 * @param {boolean} [allowSelectNothing]
 * @returns {Promise<{ serverState: ServerUIState, panelState: ?PanelUIState }|undefined>}
 */
async function userChoosePanel(navigator, title, allowSelectNothing) {
    const serverState = await userChooseServer(
        navigator, title, { step: 1, totalSteps: 2 })
    if (!serverState) return undefined
    const panelState = await userChoosePanelForServer(
        navigator, serverState, title, { step: 2, totalSteps: 2 }, allowSelectNothing)
    return { serverState, panelState }
}

/**
 * @param {Navigator} navigator
 * @param {PanelUIState} panelState
 * @param {string} title
 * @param {{ step: number, totalSteps: number }} [multiStep]
 * @param {boolean} [allowSelectNothing]
 * @returns {Promise<SlotUIState|null|undefined>}
 */
function userChooseSlotForPanel(navigator, panelState, title, multiStep, allowSelectNothing) {
    const slotStates = navigator.getSlotStates(panelState)
    const preselectedSlot = navigator.getSelectedSlotState(panelState)
        || panelState.slots[panelState.definition?.defaultSlot]
    /** @type {QuickPickItem[]} */
    let items = slotStates.map(p => ({
            label: p.id,
            iconPath: new ThemeIcon('symbol-constant'),
            picked: preselectedSlot?.id === p.id,
        }))
    if (allowSelectNothing) {
        // Currently the TreeView API does not allow to unselect items
        // Therefore, selecting nothing at this point is pointless
        // items = [
        //     {
        //         label: 'Select Nothing',
        //         iconPath: new ThemeIcon('circle'),
        //         alwaysShow: true,
        //     },
        //     ... items,
        // ]
    }
    return quickPick(
        items,
        label => slotStates.find(s => s.id === label) || null,
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
 * @param {boolean} [allowSelectNothing]
 * @returns {Promise<{ panelState: PanelUIState, slotState: ?SlotUIState }|undefined>}
 */
async function userChooseSlot(navigator, title, allowSelectNothing) {
    const serverState = await userChooseServer(
        navigator, title, { step: 1, totalSteps: 3 })
    if (!serverState) return undefined
    const panelState = await userChoosePanelForServer(
        navigator, serverState, title, { step: 2, totalSteps: 3 })
    if (!panelState) return undefined
    const slotState = await userChooseSlotForPanel(
        navigator, panelState, title, { step: 3, totalSteps: 3 }, allowSelectNothing)
    return { panelState, slotState }
}


/**
 * @param {Navigator} navigator
 * @returns {ServerUIState|undefined}
 */
function guessTargetServer(navigator) {
    const selectedServerState = navigator.getSelectedServerState()
    if (selectedServerState) return selectedServerState
    const serverStates = values(navigator.serverStates)
    if (serverStates.length === 1) return serverStates[0]
    return undefined
}

/**
 * @param {Navigator} navigator
 * @param {?string} title
 * @returns {Promise<ServerUIState|undefined>}
 */
async function resolveTargetServer(navigator, title) {
    let serverState = guessTargetServer(navigator)
    if (serverState) return serverState
    return await userChooseServer(navigator, title)
}

/**
 * @param {Navigator} navigator
 * @param {?ServerUIState} serverState
 * @returns {Promise<PanelUIState|undefined>}
 */
async function guessTargetPanel(navigator, serverState) {
    if (!serverState) return undefined
    const selectedPanelState = navigator.getSelectedPanelState(serverState)
    if (selectedPanelState) return selectedPanelState
    if (serverState.invalid) {
        await navigator.refreshServerState(serverState)
    }
    return serverState.panels['default']
}

/**
 * @param {Navigator} navigator
 * @param {?string} title
 * @returns {Promise<PanelUIState|undefined>}
 */
async function resolveTargetPanel(navigator, title) {
    const serverState = await resolveTargetServer(navigator, title)
    if (!serverState) return undefined
    const panelState = await guessTargetPanel(navigator, serverState)
    if (panelState) return panelState
    return await userChoosePanelForServer(navigator, serverState, title)
}

/**
 * @param {Navigator} navigator
 * @param {?PanelUIState} panelState
 * @returns {Promise<SlotUIState|undefined>}
 */
async function guessTargetSlot(navigator, panelState) {
    if (!panelState) return undefined
    const selectedSlotState = navigator.getSelectedSlotState(panelState)
    if (selectedSlotState) return selectedSlotState
    if (panelState.invalid) {
        await navigator.refreshPanelState(panelState)
    }
    const slotStates = values(panelState.slots)
    return first(filter(slotStates, slot => slot.defaultSlot))
}

/**
 * @param {Navigator} navigator
 * @param {?string} title
 * @returns {Promise<SlotUIState|undefined>}
 */
async function resolveTargetSlot(navigator, title) {
    const panelState = await resolveTargetPanel(navigator, title)
    if (!panelState) return undefined
    const slotState = await guessTargetSlot(navigator, panelState)
    if (slotState) return slotState
    return await userChooseSlotForPanel(navigator, panelState, title)
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

            const cmdLine = await getBoomackServerCommandLine(navigator.getContext())
            if (!cmdLine) {
                window.showErrorMessage("Failed to start Project Server")
                return
            }
            console.log('Boomack Commandline:', cmdLine.cmd, [...cmdLine.args, ...args])
            let started = false
            workspaceServerTerminal = runInTerminal(
                navigator.getContext(),
                'Boomack Server', null,
                cmdLine.cmd, [...cmdLine.args, ...args],
                projectRoot,
                () => {
                    const terminal = workspaceServerTerminal
                    workspaceServerTerminal = null
                    commands.executeCommand('setContext',
                        'boomack.workspaceServer.running', false)
                    navigator.setWorkspaceServerRunning(false)
                    removeItemOnce(navigator.getContext().subscriptions, terminal)
                    if (started) {
                        window.showInformationMessage("Boomack Project Server stopped")
                    }
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
                started = true
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
        const pid = await workspaceServerTerminal.processId
        if (pid) {
            if (process.platform === 'win32') {
                ctrlc(pid)
            } else {
                process.kill(pid, 'SIGINT')
            }
        } else {
            workspaceServerTerminal.dispose()
        }
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
 * @param {Navigator} navigator
 * @returns {function(any):(void | Promise<void>)}
 */
function openServerInBrowserCommand(navigator) {
    return async uiState => {
        let serverState = resolveServerState(uiState)
        if (!serverState) serverState = await resolveTargetServer(navigator, 'Open Server in Browser')
        if (!serverState) return
        let url = serverState.server.url
        if (!url.endsWith('/')) url += '/'
        await openInBrowser(url)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(any):(void | Promise<void>)}
 */
function refreshPanelsCommand(navigator) {
    return async uiState => {
        let serverState = resolveServerState(uiState)
        if (!serverState) serverState = await resolveTargetServer(navigator, 'Refresh Panels')
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
 * @returns {function(?PanelUIState, ?string):(Promise<PanelUIState|undefined>)}
 */
function selectPanelCommand(navigator) {
    return async (panelState, title) => {
        if (!title) title = 'Select Boomack Panel'
        if (panelState && !isPanelState(panelState)) throw new Error('Expected panel state or nothing as argument')
        let serverState = panelState?.server
        if (!panelState) {
            let choice = await userChoosePanel(navigator, title, true)
            if (choice) {
                serverState = choice.serverState
                panelState = choice.panelState
            }
        }
        if (!serverState) return undefined
        await navigator.selectServer(serverState)
        await navigator.selectPanel(serverState, panelState)
        return panelState
    }
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
 * @returns {function(any):(void | Promise<void>)}
 */
function clearPanelCommand(navigator) {
    return async uiState => {
        let panelState = resolvePanelState(uiState)
        if (!panelState) panelState = await resolveTargetPanel(navigator, 'Clear Panel')
        if (!panelState) return
        await clearPanel(navigator, panelState)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(any):(void | Promise<void>)}
 */
function openPanelInBrowserCommand(navigator) {
    return async uiState => {
        let panelState = resolvePanelState(uiState)
        if (!panelState) panelState = await resolveTargetPanel(navigator, 'Open Panel in Browser')
        if (!panelState) return
        let url = panelState.server.server.url
        if (!url.endsWith('/')) url += '/'
        url += `panels/${panelState.id}`
        await openInBrowser(url)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function refreshSlotsCommand(navigator) {
    return async element => {
        let panelState = resolvePanelState(element)
        if (!panelState) panelState = await resolveTargetPanel(navigator, 'Refresh Panel')
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
 * @returns {function(?SlotUIState, ?string):(Promise<SlotUIState|undefined>)}
 */
function selectSlotCommand(navigator) {
    return async (slotState, title) => {
        if (!title) title = 'Select Boomack Slot'
        if (slotState && !isSlotState(slotState)) throw new Error('Expected slot state or nothing as argument')
        let panelState = slotState?.panel
        if (!slotState) {
            let choice = await userChooseSlot(navigator, title, true)
            if (choice) {
                panelState = choice.panelState
                slotState = choice.slotState
            }
        }
        if (!panelState) return undefined
        await navigator.selectServer(panelState.server)
        await navigator.selectPanel(panelState.server, panelState)
        // slotState = panelState.slots[slotState.id]
        navigator.selectSlot(panelState, slotState)
        return slotState
    }
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
 * @returns {function(any):(void | Promise<void>)}
 */
function clearSlotCommand(navigator) {
    return async uiState => {
        let slotState = resolveSlotState(uiState)
        if (!slotState) slotState = await resolveTargetSlot(navigator, 'Clear Slot')
        if (!slotState) return
        await clearSlot(navigator, slotState)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(any):(void | Promise<void>)}
 */
function openSlotInBrowserCommand(navigator) {
    return async uiState => {
        let slotState = resolveSlotState(uiState)
        if (!slotState) slotState = await resolveTargetSlot(navigator, 'Open Slot in Browser')
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
 * @returns {function(any):(void | Promise<void>)}
 */
function slotZoomCommand(navigator, direction) {
    return async uiState => {
        let dirWord = '???'
        if (direction === 'in') {
            dirWord = 'In'
        } else if (direction === 'out') {
            dirWord = 'Out'
        }
        let slotState = resolveSlotState(uiState)
        if (!slotState) slotState = await resolveTargetSlot(navigator, `Zoom ${dirWord}`)
        if (!slotState) return
        const { server, panelId, slotId } = navigator.targetFromSlot(slotState)
        const client = await navigator.clientFor(server)
        await client.evaluateCode([{
            panelId,
            script: `boomack.cmdSlotZoom${dirWord}('${slotId}')`
        }])
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(any):(void | Promise<void>)}
 */
function slotToggleMaximizeCommand(navigator) {
    return async uiState => {
        let slotState = resolveSlotState(uiState)
        if (!slotState) slotState = await resolveTargetSlot(navigator, 'Toggle Maximize Slot')
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
        if (!slotState) {
            const choice = await userChooseSlot(navigator, 'Remove Slot')
            slotState = choice?.slotState
        }
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
    await displayFile(
        navigator, target, filename,
        {
            mediaType, options,
            titleSuffix: '(Source)',
        })
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
    if (typeMode === 'default') {
        await displayFile(navigator, target, filename)
    } else if (typeMode === 'source') {
        await displayFileSource(navigator, target, filename)
    } else if (typeMode === 'prompt') {
        const mediaType = await window.showInputBox({
            title: "Display",
            prompt: "Enter a media type",
            value: 'application/octet-stream',
        })
        await displayFile(navigator, target, filename, { mediaType })
    } else {
        throw new Error(`Display type mode '${typeMode}' is not supported for file`)
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

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {TextEditor} editor
 * @param {Selection} selection
 * @param {{
 *   mediaType?: string,
 *   options?: Object,
 * }} [options]
 */
async function displaySelection(
    navigator, target, editor, selection,
    {
        mediaType,
        options,
    } = {}
) {
    const filename = editor.document.uri.fsPath
    const boomackClient = await navigator.clientFor(target.server)
    if (!options) { options = {} }
    if (!mediaType) {
        const clientConfig = await loadWorkspaceClientConfig()
        mediaType = lookupMediaType(
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
        if (language) {
            options = { ...options, transformation: 'highlight', syntax: language }
        }
    }
    const title = titleForFile(filename, `(Lines ${selection.start.line + 1} – ${selection.end.line + 1})`)
    const result = await boomackClient.displayMediaItems([{
        panel: target.panelId,
        slot: target.slotId || null,
        text: editor.document.getText(selection),
        type: mediaType,
        title,
        options,
    }])
    if (!result.success) {
        window.showErrorMessage(`Failed to display selected text. HTTP Status ${result.statusCode}.`)
    }
}

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {TextEditor} editor
 * @param {Selection} selection
 * @param {DisplayFlags} flags
 */
async function displaySelectionWithFlags(
    navigator, target, editor, selection,
    {
        typeMode = 'source',
    }
) {
    if (typeMode === 'source') {
        await displaySelection(navigator, target, editor, selection)
    } else if (typeMode === 'prompt') {
        const mediaType = await window.showInputBox({
            title: "Display",
            prompt: "Enter a media type",
            value: 'application/octet-stream',
        })
        await displaySelection(navigator, target, editor, selection, { mediaType })
    } else {
        throw new Error(`Display type mode '${typeMode}' is not supported for selection`)
    }
}

/**
 * @param {Navigator} navigator
 * @param {DisplayFlags} flags
 * @returns {function({fsPath: string}):(void | Promise<void>)}
 */
function displaySelectionCommand(navigator, flags) {
    return async () => {
        const editor = window.activeTextEditor
        if (!editor) {
            window.showErrorMessage("No active text editor")
            return
        }
        const selection = editor.selection
        if (!selection) {
            window.showErrorMessage("No selection")
            return
        }
        const target = navigator.getCurrentTarget()
        if (!target) {
            window.showErrorMessage("No target slot selected")
        }
        await displaySelectionWithFlags(navigator, target, editor, selection, flags)
    }
}

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {NotebookCell} cell
 * @param {boolean} displaySource
 * @param {{
 *   options?: Object,
 * }} [options]
 */
async function displayNotebookCell(
    navigator, target, cell, displaySource,
    {
        options,
    } = {}
) {
    const notebook = cell.notebook
    const filename = notebook.uri.fsPath
    const boomackClient = await navigator.clientFor(target.server)
    if (!options) { options = {} }
    let request = {
        panel: target.panelId,
        slot: target.slotId || null,
        options,
    }
    if (cell.kind === NotebookCellKind.Markup) {
        request.text = cell.document.getText()
        if (displaySource) {
            request.title = titleForFile(filename, `(Cell ${cell.index + 1} Source)`)
            request.type = 'text/plain'
            request.options = {
                ...options,
                transformation: 'highlight',
                syntax: 'markdown',
            }
        } else {
            request.title = titleForFile(filename, `(Cell ${cell.index + 1} Output)`)
            request.type = 'text/markdown'
        }
        const result = await boomackClient.displayMediaItems([request])
        if (!result.success) {
            window.showErrorMessage(`Failed to display markup cell. HTTP Status ${result.statusCode}.`)
        }
    } else if (cell.kind === NotebookCellKind.Code) {
        if (displaySource) {
            request.text = cell.document.getText()
            request.title = titleForFile(filename, `(Cell ${cell.index + 1} Source)`)
            request.type = 'text/plain'
            request.options = {
                ...options,
                transformation: 'highlight',
                syntax: cell.document.languageId, // map VS Code language ID to PrismJS language
            }
            const result = await boomackClient.displayMediaItems([request])
            if (!result.success) {
                window.showErrorMessage(`Failed to display cell source. HTTP Status ${result.statusCode}.`)
            }
        } else if (cell.outputs.length > 0 && cell.outputs[0].items.length > 0) {
            const output = cell.outputs[0].items[0]
            request.title = titleForFile(filename, `(Cell ${cell.index + 1} Output)`)
            if (output.mime === 'application/vnd.code.notebook.error') {
                request.type = 'text/plain'
                request.text = JSON.parse(new TextDecoder('utf8').decode(output.data)).stack
            } else {
                request.type = output.mime === 'application/vnd.code.notebook.stdout'
                    ? 'text/plain' : output.mime
                request.data = Buffer.from(output.data).toString('base64')
            }
            const result = await boomackClient.displayMediaItems([request])
            if (!result.success) {
                window.showErrorMessage(`Failed to display cell output. HTTP Status ${result.statusCode}.`)
            }
        }
    }

}

/**
 * @param {Navigator} navigator
 * @param {boolean} displaySource
 * @returns {function(NotebookCell):(void | Promise<void>)}
 */
function displayNotebookCellCommand(navigator, displaySource) {
    return async cell => {
        if (!cell) {
            window.showErrorMessage("Command expects a Notebook cell as argument")
            return
        }
        const target = navigator.getCurrentTarget()
        if (!target) {
            window.showErrorMessage("No target slot selected")
        }
        await displayNotebookCell(navigator, target, cell, displaySource)
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
    displaySelectionCommand,
    displayNotebookCellCommand,
}
