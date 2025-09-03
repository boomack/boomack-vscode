const fs = require('node:fs/promises')
const path = require('node:path')
const vscode = require('vscode')
const mime = require('mime')
const { config } = require('./config.js')
const inventory = require('./inventory.js')
const { getClientFor } = require('./client.js')

/**
 * @typedef {import('./inventory.js').BoomackServer} BoomackServer
 * @typedef {import('./navigation.js').ServerTreeItemProvider} ServerTreeItemProvider
 * @typedef {import('./navigation.js').PanelTreeItemProvider} PanelTreeItemProvider
 * @typedef {import('./navigation.js').PanelItem} PanelItem
 * @typedef {import('./navigation.js').SlotTreeItemProvider} SlotTreeItemProvider
 * @typedef {import('./navigation.js').SlotItem} SlotItem
 */

function playgroundCommand() {
    return async () => {
        console.log('Use for protoyping...')
    }
}

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
 * @param {string} title
 * @returns {Promise<inventory.BoomackServer | undefined>}
 */
async function chooseServer(context, title) {
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
 * @param {string} serverName
 */
function removeServer(context, serverName) {
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
 * @returns {function(inventory.BoomackServer):(void | Promise<void>)}
 */
function removeServerCommand(context) {
    return async server => {
        if (!server) server = await chooseServer(context, 'Remove Boomack Server')
        if (!server) return
        removeServer(context, server.name)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.TreeView} serverTreeView
 * @returns {function(?inventory.BoomackServer):(void | Promise<void>)}
 */
function selectServerCommand(context, serverTreeView) {
    return async server => {
        if (!server) server = await chooseServer(context, 'Select Boomack Server')
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
 * @param {PanelItem?} item
 * @param {vscode.TreeView} panelTreeView
 * @param {PanelTreeItemProvider} [panelItemProvider]
 * @returns {Promise<PanelItem|undefined>}
 */
async function resolvePanelItem(item, panelTreeView, panelItemProvider) {
    if (item) return item
    if (panelTreeView.selection.length > 0) {
        item = panelTreeView.selection[0]
    }
    if (panelItemProvider) {
        const items = await panelItemProvider.getChildren(null)
        return items.find(item => item.panelId === 'default')
    }
    return undefined
}

/**
 * @param {PanelTreeItemProvider} panelItemProvider
 * @param {string} title
 * @returns {Promise<PanelItem | undefined>}
 */
async function choosePanel(panelItemProvider, title) {
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
        if (!panelItem) panelItem = await choosePanel(panelItemProvider, 'Select Boomack Panel')
        if (!panelItem) return
        panelTreeView.reveal(panelItem, { select: true })
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {PanelItem} panelItem
 */
async function clearPanel(context, panelItem) {
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
 * @param {PanelTreeItemProvider} panelItemProvider
 * @param {vscode.TreeView} panelTreeView
 * @returns {function(?PanelItem):(void | Promise<void>)}
 */
function clearPanelCommand(context, panelTreeView, panelItemProvider) {
    return async panelItem => {
        panelItem = await resolvePanelItem(panelItem, panelTreeView, panelItemProvider)
        if (!panelItem) return
        await clearPanel(context, panelItem)
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
 * @param {SlotItem?} item
 * @param {vscode.TreeView} slotTreeView
 * @param {SlotTreeItemProvider} [slotItemProvider]
 * @returns {Promise<SlotItem|undefined>}
 */
async function resolveSlotItem(item, slotTreeView, slotItemProvider) {
    if (item) return item
    if (slotTreeView.selection.length > 0) {
        item = slotTreeView.selection[0]
    }
    if (slotItemProvider) {
        const items = await slotItemProvider.getChildren(null)
        return items.find(item => item.defaultSlot)
    }
    return undefined
}

/**
 * @param {SlotTreeItemProvider} slotItemProvider
 * @param {string} title
 * @returns {Promise<SlotItem | undefined>}
 */
async function chooseSlot(slotItemProvider, title) {
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
        if (!slotItem) slotItem = await chooseSlot(slotItemProvider, 'Select Boomack Slot')
        if (!slotItem) return
        slotTreeView.reveal(slotItem, { select: true })
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {SlotItem} slotItem
 */
async function clearSlot(context, slotItem) {
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
 * @param {SlotTreeItemProvider} slotItemProvider
 * @returns {function(?SlotItem):(void | Promise<void>)}
 */
function clearSlotCommand(context, slotItemProvider, slotTreeView) {
    return async slotItem => {
        slotItem = await resolveSlotItem(slotItem, slotTreeView, slotItemProvider)
        if (!slotItem) return
        await clearSlot(context, slotItem)
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
 * @param {vscode.ExtensionContext} context
 * @param {BoomackServer} server
 * @param {?string} panelId
 * @param {?string} slotId
 * @param {string} filename
 * @param {?string} [mediaType]
 * @param {?string[]} [presets]
 * @param {?Object} [options]
 */
async function displayFile(context, server, panelId, slotId, filename, mediaType, presets, options) {
    if (!panelId) panelId = 'default'
    const boomackClient = await getClientFor(context, server)
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
    const result = slotId
        ? await boomackClient.streamMediaItemToSlot(
            panelId, slotId,
            mediaType, s, fileStat.size,
            title, presets, options)
        : await boomackClient.streamMediaItemToPanel(
            panelId,
            mediaType, s, fileStat.size,
            title, presets, options)
    fd.close()
    if (!result.success) {
        vscode.window.showErrorMessage(`Failed to display file content. HTTP Status ${result.statusCode}.`)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {vscode.TreeView} slotTreeView
 * @returns {function(?SlotItem):(void | Promise<void>)}
 */
function displayInSlotCommand(context, slotTreeView) {
    return async slotItem => {
        slotItem = await resolveSlotItem(slotItem, slotTreeView)
        if (!slotItem) {
            vscode.window.showErrorMessage("No target slot selected")
            return
        }
        const { server, panelId, slotId } = slotItem
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            vscode.window.showErrorMessage("No active text editor")
            return
        }
        const filename = editor.document.uri.fsPath
        await displayFile(context, server, panelId, slotId, filename)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {SlotTreeItemProvider} slotItemProvider
 * @param {vscode.TreeView} slotTreeView
 * @returns {function({fsPath: string}):(void | Promise<void>)}
 */
function displayFileCommand(context, slotItemProvider, slotTreeView) {
    return async resource => {
        if (!resource) {
            vscode.window.showErrorMessage("Command requires argument")
            return
        }
        if (!resource.fsPath) {
            vscode.window.showErrorMessage("Command expects a file resource or editor document as argument")
            return
        }
        const slotItem = await resolveSlotItem(null, slotTreeView, slotItemProvider)
        if (slotItem === undefined) return
        const { server, panelId, slotId } = slotItem
        const filename = resource.fsPath
        await displayFile(context, server, panelId, slotId, filename)
    }
}

/**
 * @param {vscode.ExtensionContext} context
 * @param {SlotTreeItemProvider} slotItemProvider
 * @param {vscode.TreeView<any>} slotTreeView
 * @param {'in'|'out'} direction
 */
function slotZoomCommand(context, slotItemProvider, slotTreeView, direction) {
    return async slotItem => {
        slotItem = await resolveSlotItem(slotItem, slotTreeView, slotItemProvider)
        if (slotItem === undefined) return
        const { server, panelId, slotId } = slotItem
        const client = await getClientFor(context, server)
        let dirWord = null
        if (direction === 'in') dirWord = 'In'
        else if (direction === 'out') dirWord = 'Out'
        await client.evaluateCode([{
            panelId,
            script: `boomack.cmdSlotZoom${dirWord}('${slotId}')`
        }])
    }
}

module.exports = {
    playgroundCommand,
    addServerCommand,
    removeServerCommand,
    selectServerCommand,
    refreshPanelsCommand,
    selectPanelCommand,
    clearPanelCommand,
    refreshSlotsCommand,
    selectSlotCommand,
    clearSlotCommand,
    slotZoomCommand,
    displayInSlotCommand,
    displayFileCommand,
}
