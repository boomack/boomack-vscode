const fs = require('node:fs/promises')
const path = require('node:path')
const vscode = require('vscode')
const mime = require('mime')
const { removeItemOnce } = require('./utils.js')
const { WORKSPACE_SERVER_NAME, WORKSPACE_SERVER_LABEL } = require('./model.js')
const { config } = require('./config.js')
const inventory = require('./inventory.js')
const tools = require('./tools.js')

/**
 * @typedef {import('./inventory.js').BoomackServer} BoomackServer
 * @typedef {import('./model.js').ServerUIState} ServerUIState
 * @typedef {import('./model.js').PanelUIState} PanelUIState
 * @typedef {import('./model.js').SlotUIState} SlotUIState
 * @typedef {import('./model.js').BoomackTarget} BoomackTarget
 * @typedef {import('./navigation.js').Navigator} Navigator
 */

function playgroundCommand() {
    return async () => {
        console.log('Use for protoyping...')
    }
}

/**
 * @template T
 * @param {vscode.QuickPickItem[]} items
 * @param {function(string):T} labelMapper
 * @param {Object} [options]
 * @returns {Promise<T|undefined>}
 */
function quickPick(items, labelMapper, options) {
    const quickPick = vscode.window.createQuickPick()
    quickPick.canSelectMany = false
    quickPick.items = items
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
 * @returns {Promise<ServerUIState|undefined>}
 */
function userChooseServer(navigator, title, multiStep) {
    const servers = navigator.getServerStates()
    const items = servers.map(s => ({
        label: s.name === WORKSPACE_SERVER_NAME
            ? WORKSPACE_SERVER_LABEL
            : s.name,
        description: s.server.url,
        iconPath: new vscode.ThemeIcon('server-environment'),
        picked: navigator.getSelectedServerState()?.name === s.name,
    }))
    return quickPick(
        items,
        label => servers.find(s => s.name === label),
        {
            title,
            placeholder: 'Server Name',
            step: multiStep?.step,
            totalSteps: multiStep?.totalSteps,
        })
}

/**
 * @param {?PanelUIState} item
 * @param {Navigator} navigator
 * @returns {PanelUIState|null}
 */
function resolvePanel(item, navigator) {
    if (item) return item
    let serverState = navigator.getSelectedServerState()
    if (!serverState) {
        const serverStates = navigator.getServerStates()
        if (serverStates.length === 1) serverState = serverStates[0]
    }
    if (!serverState) return null
    let panelState = navigator.getSelectedPanelState(serverState)
    if (!panelState) {
        const panelStates = navigator.getPanelStates(serverState)
        if (panelStates.length === 1) panelState = panelStates[0]
    }
    return panelState
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
    const items = panelStates.map(p => ({
        label: p.id,
        description: p.definition?.title,
        iconPath: new vscode.ThemeIcon('window'),
        picked: navigator.getSelectedPanelState(serverState)?.id === p.id,
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
 * @param {boolean} [chooseContext]
 * @returns {Promise<PanelUIState|undefined>}
 */
async function userChoosePanel(navigator, title, chooseContext) {
    const serverState = navigator.getServerStates().length > 1
        ? chooseContext
            ? await userChooseServer(navigator, title, { step: 1, totalSteps: 2 })
            : navigator.getSelectedServerState()
        : navigator.getServerStates()[0]
    if (!serverState) return undefined
    return await userChoosePanelForServer(navigator, serverState, title,
        chooseContext ? { step: 2, totalSteps: 2 } : undefined)
}

/**
 * @param {?SlotUIState} item
 * @param {Navigator} navigator
 * @returns {SlotUIState|null}
 */
function resolveSlot(item, navigator) {
    if (item) return item
    let serverState = navigator.getSelectedServerState()
    if (!serverState) {
        const serverStates = navigator.getServerStates()
        if (serverStates.length === 1) serverState = serverStates[0]
    }
    if (!serverState) return null
    let panelState = navigator.getSelectedPanelState(serverState)
    if (!panelState) {
        const panelStates = navigator.getPanelStates(serverState)
        if (panelStates.length === 1) panelState = panelStates[0]
    }
    let slotState = navigator.getSelectedSlotState(panelState)
    if (!slotState) {
        const slotStates = navigator.getSlotStates(panelState)
        if (slotStates.length === 1) slotState = slotStates[0]
    }
    return slotState
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
    const items = slotStates.map(p => ({
        label: p.id,
        iconPath: new vscode.ThemeIcon('symbol-constant'),
        picked: navigator.getSelectedSlotState(panelState)?.id === p.id,
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
 * @param {boolean} [chooseContext]
 * @returns {Promise<SlotUIState|undefined>}
 */
async function userChooseSlot(navigator, title, chooseContext) {
    const serverState = chooseContext
        ? await userChooseServer(navigator, title, { step: 1, totalSteps: 3 })
        : navigator.getSelectedServerState()
    if (!serverState) return undefined
    const panelState = chooseContext
        ? await userChoosePanelForServer(navigator, serverState, title, { step: 2, totalSteps: 3 })
        : navigator.getSelectedPanelState(serverState)
    if (!panelState) return undefined
    return await userChooseSlotForPanel(navigator, panelState, title,
        chooseContext ? { step: 3, totalSteps: 3 } : undefined)
}

/**
 * @param {string} url
 * @returns {Promise<void>}
 */
async function openInBrowser(url) {
    const open = await import('open')
    open.default(url)
}

/** @type {vscode.Terminal | null} */
let workspaceServerTerminal = null

/**
 *
 * @param {Navigator} navigator
 * @returns {function():(void | Promise<void>)}
 */
function startWorkspaceServerCommand(navigator) {
    return () => {
        if (workspaceServerTerminal) {
            vscode.window.showWarningMessage("Boomack server is already running")
            return
        }
        workspaceServerTerminal = tools.runToolInTerminal(
            navigator.getContext(),
            'Boomack Server',
            'boomack', [],
            vscode.workspace.workspaceFolders[0].uri.fsPath,
            () => {
                vscode.commands.executeCommand('setContext',
                    'boomack.workspaceServer.running', false)
                navigator.setWorkspaceServerRunning(false)
                removeItemOnce(navigator.getContext().subscriptions, workspaceServerTerminal)
                workspaceServerTerminal = null
                vscode.window.showInformationMessage("Project Boomack server stopped")
            })
        navigator.setWorkspaceServerRunning(true)
        navigator.getContext().subscriptions.push(workspaceServerTerminal)
        vscode.commands.executeCommand('setContext',
                'boomack.workspaceServer.running', true)
        vscode.window.showInformationMessage("Project Boomack server started")
    }
}

/**
 * @returns {function():(void | Promise<void>)}
 */
function stopWorkspaceServerCommand() {
    return () => {
        if (!workspaceServerTerminal) {
            vscode.window.showWarningMessage("Project Boomack server is not running")
            return
        }
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

        let name = await vscode.window.showInputBox({
            title: 'Boomack Server Name',
            placeHolder: defaultName,
            prompt: 'A user friendly name to identify the server',
        })
        if (name === undefined) return
        if (!name) name = defaultName

        if (name === WORKSPACE_SERVER_NAME) {
            vscode.window.showErrorMessage("This name is reserved for the workspace server")
            return
        }

        let url = await vscode.window.showInputBox({
            title: 'Boomack Server URL',
            placeHolder: defaultUrl,
            prompt: 'Enter the URL of the Boomack server',
        })
        if (url === undefined) return
        if (url === '') url = defaultUrl

        let token = await vscode.window.showInputBox({
            title: 'Boomack API Token',
            placeHolder: 'none',
            prompt: 'Leave empty, if the server does not require an API token',
        })
        if (token === undefined) return
        if (!token) token = null

        if (inventory.addServer(navigator.getContext(), { name, url, token })) {
            vscode.window.showInformationMessage(
                `Added Boomack server "${name}" to the inventory`)
        } else {
            vscode.window.showInformationMessage(
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
        vscode.window.showInformationMessage(
            `Removed Boomack server "${serverName}" from the inventory`)
    } else {
        vscode.window.showWarningMessage(
            `Removed Boomack server "${serverName}" not found in the inventory`)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(ServerUIState):(void | Promise<void>)}
 */
function removeServerCommand(navigator) {
    return async server => {
        if (!server) server = await userChooseServer(navigator, 'Remove Boomack Server')
        if (!server) return
        removeServer(navigator, server.name)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?ServerUIState):(void | Promise<void>)}
 */
function selectServerCommand(navigator) {
    return async serverState => {
        if (!serverState) serverState = await userChooseServer(navigator, 'Select Boomack Server')
        if (!serverState) return
        await navigator.selectServer(serverState)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?ServerUIState):(void | Promise<void>)}
 */
function openServerInBrowserCommand(navigator) {
    return async serverItem => {
        if (!serverItem) serverItem = await userChooseServer(navigator, 'Open Server in Browser')
        if (!serverItem) return
        let url = serverItem.server.url
        if (!url.endsWith('/')) url += '/'
        await openInBrowser(url)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?ServerUIState):(void | Promise<void>)}
 */
function refreshPanelsCommand(navigator) {
    return async serverState => {
        if (!serverState) serverState = navigator.getSelectedServerState()
        if (!serverState) return
        await navigator.refreshServerState(serverState)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function selectPanelCommand(navigator) {
    return async panelState => {
        if (!panelState) panelState = await userChoosePanel(navigator, 'Select Boomack Panel', true)
        if (!panelState) return
        await navigator.selectServer(panelState.server)
        await navigator.selectPanel(panelState.server, panelState)
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
            vscode.window.showInformationMessage(`Cleared panel "${panelId}" on Boomack server "${serverName}".`)
        } else {
            vscode.window.showErrorMessage(`Failed to clear panel "${panelId}" on Boomack server "${serverName}". HTTP Status ${response.statusCode}.`)
        }
    } catch (err) {
        console.error("Failed to clear panel:", err)
        vscode.window.showErrorMessage(`Failed to clear panel "${panelId}" on Boomack server "${serverName}"`)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function clearPanelCommand(navigator) {
    return async panelItem => {
        panelItem = resolvePanel(panelItem, navigator)
        if (!panelItem) panelItem = await userChoosePanel(navigator, 'Clear Panel', true)
        if (!panelItem) return
        await clearPanel(navigator, panelItem)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function openPanelInBrowserCommand(navigator) {
    return async panelItem => {
        panelItem = resolvePanel(panelItem, navigator)
        if (!panelItem) panelItem = await userChoosePanel(navigator, 'Open Panel in Browser', true)
        if (!panelItem) return
        let url = panelItem.server.server.url
        if (!url.endsWith('/')) url += '/'
        url += `panels/${panelItem.id}`
        await openInBrowser(url)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?PanelUIState):(void | Promise<void>)}
 */
function refreshSlotsCommand(navigator) {
    return async element => {
        element = resolvePanel(element, navigator)
        if (!element) element = await userChoosePanel(navigator, 'Refresh Panel', true)
        if (!element) return
        await navigator.refreshPanelState(element)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function selectSlotCommand(navigator) {
    return async slotState => {
        if (!slotState) slotState = await userChooseSlot(navigator, 'Select Boomack Slot', true)
        if (!slotState) return
        const panelState = slotState.panel
        await navigator.selectServer(slotState.panel.server)
        await navigator.selectPanel(slotState.panel.server, slotState.panel)
        slotState = panelState.slots[slotState.id]
        navigator.selectSlot(panelState, slotState)
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
            vscode.window.showInformationMessage(`Cleared slot "${panelId}/${slotId}" on Boomack server "${serverName}".`)
        } else {
            vscode.window.showErrorMessage(`Failed to clear slot "${panelId}/${slotId}" on Boomack server "${serverName}". HTTP Status ${response.statusCode}.`)
        }
    } catch (err) {
        console.error("Failed to clear slot:", err)
        vscode.window.showErrorMessage(`Failed to clear slot "${panelId}/${slotId}" on Boomack server "${serverName}"`)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function clearSlotCommand(navigator) {
    return async slotState => {
        slotState = resolveSlot(slotState, navigator)
        if (!slotState) slotState = await userChooseSlot(navigator, 'Clear Slot', true)
        if (!slotState) return
        await clearSlot(navigator, slotState)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function openSlotInBrowserCommand(navigator) {
    return async slotItem => {
        slotItem = resolveSlot(slotItem, navigator)
        if (!slotItem) slotItem = await userChooseSlot(navigator, 'Open Slot in Browser', true)
        if (!slotItem) return
        const panelItem = slotItem.panel
        let url = panelItem.server.server.url
        if (!url.endsWith('/')) url += '/'
        url += `panels/${panelItem.id}/slots/${slotItem.id}`
        await openInBrowser(url)
    }
}

/**
 * @param {{ predicate: function(string):boolean, type: string }[]} types
 * @param {string} filename
 * @returns {string}
 */
function lookupMediaType(types, filename) {
    const name = path.basename(filename)
    for (const { predicate, type } of types) {
        if (predicate(name)) return type
    }
	let ext = path.extname(name)
    if (ext.startsWith('.')) ext = ext.substring(1)
	if (ext) {
		return mime.getType(ext);
	} else {
		return 'application/octet-stream';
	}
}

/**
 * @param {Navigator} navigator
 * @param {BoomackTarget} target
 * @param {string} filename
 * @param {?string} [mediaType]
 * @param {?string[]} [presets]
 * @param {?Object} [options]
 */
async function displayFile(navigator, target, filename, mediaType, presets, options) {
    const boomackClient = await navigator.clientFor(target.server)
    if (!mediaType) {
        mediaType = lookupMediaType(boomackClient.config.client.types, filename)
    }
    if (!presets) presets = null
    if (!options) options = null
    let title = null
    const titleMode = config('displayTitle')
    if (titleMode === 'filename') {
        title = path.basename(filename)
    } else if (titleMode === 'filepath') {
        title = filename
    }
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
        vscode.window.showErrorMessage(`Failed to display file content. HTTP Status ${result.statusCode}.`)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function(?SlotUIState):(void | Promise<void>)}
 */
function displayInSlotCommand(navigator) {
    return async slotState => {
        slotState = resolveSlot(slotState, navigator)
        if (!slotState) {
            vscode.window.showErrorMessage("No target slot selected")
            return
        }
        const target = navigator.targetFromSlot(slotState)
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            vscode.window.showErrorMessage("No active text editor")
            return
        }
        const filename = editor.document.uri.fsPath
        await displayFile(navigator, target, filename)
    }
}

/**
 * @param {Navigator} navigator
 * @returns {function({fsPath: string}):(void | Promise<void>)}
 */
function displayFileCommand(navigator) {
    return async resource => {
        if (!resource) {
            vscode.window.showErrorMessage("Command requires argument")
            return
        }
        if (!resource.fsPath) {
            vscode.window.showErrorMessage("Command expects a file resource or editor document as argument")
            return
        }
        const target = navigator.getCurrentTarget()
        if (!target) {
            vscode.window.showErrorMessage("No target slot selected")
        }
        const filename = resource.fsPath
        await displayFile(navigator, target, filename)
    }
}

/**
 * @param {Navigator} navigator
 * @param {'in'|'out'} direction
 * @returns {function(SlotUIState):(void | Promise<void>)}
 */
function slotZoomCommand(navigator, direction) {
    return async slotState => {
        slotState = resolveSlot(slotState, navigator)
        if (slotState === undefined) return
        if (!slotState) {
            vscode.window.showErrorMessage("No target slot selected")
            return
        }
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
 * @returns {function(SlotUIState):(void | Promise<void>)}
 */
function slotToggleMaximizeCommand(navigator) {
    return async slotState => {
        slotState = resolveSlot(slotState, navigator)
        if (!slotState) slotState == await userChooseSlot(navigator, 'Slot Toggle Maximize')
        if (!slotState) {
            vscode.window.showErrorMessage("No target slot selected")
            return
        }
        const { server, panelId, slotId } = navigator.targetFromSlot(slotState)
        const client = await navigator.clientFor(server)
        await client.evaluateCode([{
            panelId,
            script: `boomack.cmdToggleMaximize('${slotId}')`
        }])
    }
}

module.exports = {
    playgroundCommand,
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
    displayInSlotCommand,
    displayFileCommand,
}
