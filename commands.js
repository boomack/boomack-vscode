const fs = require('node:fs/promises')
const vscode = require('vscode')
const inventory = require('./inventory.js')
const { getClientFor } = require('./client.js')

/**
 * @typedef {import('./navigation.js').ServerTreeItemProvider} ServerTreeItemProvider
 * @typedef {import('./navigation.js').PanelTreeItemProvider} PanelTreeItemProvider
 * @typedef {import('./navigation.js').PanelItem} PanelItem
 * @typedef {import('./navigation.js').SlotTreeItemProvider} SlotTreeItemProvider
 * @typedef {import('./navigation.js').SlotItem} SlotItem
 */

/**
 * @param {vscode.ExtensionContext} context
 * @returns {function():(void | Promise<void>)}
 */
function addServerCommand(context) {
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

        if (inventory.addServer(context, { name, url, token })) {
            vscode.window.showInformationMessage(
                `Added Boomack server "${name}" to the inventory`)
        } else {
            vscode.window.showInformationMessage(
                `Updated Boomack server "${name}" in the inventory`)
        }

    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {string} serverName
 */
function _removeServer(context, serverName) {
    if (inventory.removeServer(context, serverName)) {
        vscode.window.showInformationMessage(
            `Removed Boomack server "${serverName}" from the inventory`)
    } else {
        vscode.window.showWarningMessage(
            `Removed Boomack server "${serverName}" not found in the inventory`)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {string} title
 * @returns {Promise<inventory.BoomackServer | undefined>}
 */
async function _chooseServer(context, title) {
    const servers = inventory.getServers(context)
    const items = servers.map(s => ({
        label: s.name,
        description: s.url,
        serverName: s.name,
        iconPath: new vscode.ThemeIcon('server-environment'),
    }))
    const selection = await vscode.window.showQuickPick(items, { title })
    if (!selection) return undefined
    return servers.find(s => s.name === selection.serverName)
}

/**
 * @param {vscode.ExtensionContext} context
 * @returns {function(inventory.BoomackServer):(void | Promise<void>)}
 */
function removeServerCommand(context) {
    return async server => {
        if (!server) server = await _chooseServer(context, 'Remove Boomack Server')
        if (!server) return
        _removeServer(context, server.name)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.TreeView} serverTreeView
 * @returns {function(?inventory.BoomackServer):(void | Promise<void>)}
 */
function selectServerCommand(context, serverTreeView) {
    return async server => {
        if (!server) server = await _chooseServer(context, 'Select Boomack Server')
        if (!server) return
        serverTreeView.reveal(server, { select: true })
    }
}

/**
 * @param {PanelTreeItemProvider} treeItemProvider
 * @returns {function():(void | Promise<void>)}
 */
function refreshPanelsCommand(treeItemProvider) {
    return () => treeItemProvider.refresh()
}

/**
 * @param {PanelTreeItemProvider} panelItemProvider
 * @param {string} title
 * @returns {Promise<PanelItem | undefined>}
 */
async function _choosePanel(panelItemProvider, title) {
    const panelItems = await panelItemProvider.getChildren(null)
    const items = panelItems.map(x => ({
        label: x.panelId,
        panelId: x.panelId,
        iconPath: new vscode.ThemeIcon('window'),
    }))
    const selection = await vscode.window.showQuickPick(items, { title })
    if (!selection) return undefined
    return panelItems.find(x => x.panelId === selection.panelId)
}

/**
 * @param {PanelTreeItemProvider} panelItemProvider
 * @param {vscode.TreeView} panelTreeView
 * @returns {function(?PanelItem):(void | Promise<void>)}
 */
function selectPanelCommand(panelItemProvider, panelTreeView) {
    return async panelItem => {
        if (!panelItem) panelItem = await _choosePanel(panelItemProvider, 'Select Boomack Panel')
        if (!panelItem) return
        panelTreeView.reveal(panelItem, { select: true })
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {PanelItem} panelItem
 */
async function _clearPanel(context, panelItem) {
    const { server, panelId } = panelItem
    const client = await getClientFor(context, server)
    try {
        var response = await client.clearPanel(panelId)
        if (response.success) {
            vscode.window.showInformationMessage(`Cleared panel "${panelId}" on Boomack server "${server.name}".`)
        } else {
            vscode.window.showErrorMessage(`Failed to clear panel "${panelId}" on Boomack server "${server.name}". HTTP Status ${response.statusCode}.`)
        }
    } catch (err) {
        console.error("Failed to clear panel:", err)
        vscode.window.showErrorMessage(`Failed to clear panel "${panelId}" on Boomack server "${server.name}"`)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.TreeView} panelTreeView
 * @returns {function(?PanelItem):(void | Promise<void>)}
 */
function clearSelectedPanelCommand(context, panelTreeView) {
    return async () => {
        if (panelTreeView.selection.length === 0) return
        _clearPanel(context, panelTreeView.selection[0])
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {PanelTreeItemProvider} panelItemProvider
 * @returns {function(?PanelItem):(void | Promise<void>)}
 */
function clearPanelCommand(context, panelItemProvider) {
    return async panelItem => {
        if (!panelItem) panelItem = await _choosePanel(panelItemProvider, 'Clear Boomack Panel')
        if (!panelItem) return
        await _clearPanel(context, panelItem)
    }
}

/**
 * @param {SlotTreeItemProvider} treeItemProvider
 * @returns {function():(void | Promise<void>)}
 */
function refreshSlotsCommand(treeItemProvider) {
    return () => treeItemProvider.refresh()
}

/**
 * @param {SlotTreeItemProvider} slotItemProvider
 * @param {string} title
 * @returns {Promise<SlotItem | undefined>}
 */
async function _chooseSlot(slotItemProvider, title) {
    const slotItems = await slotItemProvider.getChildren(null)
    const items = slotItems.map(x => ({
        label: x.slotId,
        slotId: x.slotId,
        iconPath: new vscode.ThemeIcon('symbol-constant'),
    }))
    const selection = await vscode.window.showQuickPick(items, { title })
    if (!selection) return undefined
    return slotItems.find(x => x.slotId === selection.slotId)
}

/**
 * @param {SlotTreeItemProvider} slotItemProvider
 * @param {vscode.TreeView} slotTreeView
 * @returns {function(?SlotItem):(void | Promise<void>)}
 */
function selectSlotCommand(slotItemProvider, slotTreeView) {
    return async slotItem => {
        if (!slotItem) slotItem = await _chooseSlot(slotItemProvider, 'Select Boomack Slot')
        if (!slotItem) return
        slotTreeView.reveal(slotItem, { select: true })
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {SlotItem} slotItem
 */
async function _clearSlot(context, slotItem) {
    const { server, panelId, slotId } = slotItem
    const client = await getClientFor(context, server)
    try {
        var response = await client.clearSlot(panelId, slotId)
        if (response.success) {
            vscode.window.showInformationMessage(`Cleared slot "${panelId}/${slotId}" on Boomack server "${server.name}".`)
        } else {
            vscode.window.showErrorMessage(`Failed to clear slot "${panelId}/${slotId}" on Boomack server "${server.name}". HTTP Status ${response.statusCode}.`)
        }
    } catch (err) {
        console.error("Failed to clear slot:", err)
        vscode.window.showErrorMessage(`Failed to clear slot "${panelId}/${slotId}" on Boomack server "${server.name}"`)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.TreeView} slotTreeView
 * @returns {function(?SlotItem):(void | Promise<void>)}
 */
function clearSelectedSlotCommand(context, slotTreeView) {
    return async () => {
        if (slotTreeView.selection.length === 0) return
        _clearSlot(context, slotTreeView.selection[0])
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {SlotTreeItemProvider} slotItemProvider
 * @returns {function(?SlotItem):(void | Promise<void>)}
 */
function clearSlotCommand(context, slotItemProvider) {
    return async slotItem => {
        if (!slotItem) slotItem = await _chooseSlot(slotItemProvider, 'Clear Boomack Slot')
        if (!slotItem) return
        await _clearSlot(context, slotItem)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.TreeView} slotTreeView
 * @returns {function(?SlotItem):(void | Promise<void>)}
 */
function displayCurrentFile(context, slotTreeView) {
    return async slotItem => {
        if (!slotItem) {
            if (slotTreeView.selection.length > 0) {
                slotItem = slotTreeView.selection[0]
            } else {
                vscode.window.showErrorMessage("No target slot selected")
                return
            }
        }
        const { server, panelId, slotId } = slotItem
        const client = await getClientFor(context, server)
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            vscode.window.showErrorMessage("No active text editor")
            return
        }
        const filename = editor.document.uri.fsPath
        const fileStat = await fs.stat(filename)
        const fd = await fs.open(filename)
        const s = fd.createReadStream()
        const result = await client.streamMediaItemToSlot(
            panelId, slotId,
            'text/plain', s, fileStat.size,
            filename,
            null, null)
        fd.close()
        if (!result.success) {
            vscode.window.showErrorMessage(`Failed to display file content. HTTP Status ${result.statusCode}.`)
        }
    }
}

module.exports = {
    addServerCommand,
    removeServerCommand,
    selectServerCommand,
    refreshPanelsCommand,
    selectPanelCommand,
    clearPanelCommand,
    clearSelectedPanelCommand,
    refreshSlotsCommand,
    selectSlotCommand,
    clearSlotCommand,
    clearSelectedSlotCommand,
    displayCurrentFile,
}
