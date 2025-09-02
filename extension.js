
const vscode = require('vscode')
const { clearClientCache } = require('./client.js')
const {
    ServerTreeItemProvider,
    PanelTreeItemProvider,
    SlotTreeItemProvider,
} = require('./navigation.js')
const commands = require('./commands.js')

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {string} name
 */
function config(name) {
    const config = vscode.workspace.getConfiguration('boomack')
    return config.get(name)
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    console.log('Boomack VS Code extension intializing...')

    // register tree data providers for tree views, defined in package.json

    const serverItemProvider = new ServerTreeItemProvider(context)
    const serversView = vscode.window.createTreeView('boomack-servers', {
        treeDataProvider: serverItemProvider,
    })
    const serverViewVisibilityChangeHandle = serversView.onDidChangeVisibility(e => {
        if (!config('autoSelect.server')) return
        if (!e.visible) return
        if (serversView.selection.length > 0) return
        const servers = serverItemProvider.getChildren(null)
        if (servers.length === 0) return
        const defaultItem = servers.find(x => x.name === 'default') || servers[0]
        serversView.reveal(defaultItem, { select: true })
    })
    context.subscriptions.push(serverViewVisibilityChangeHandle)

    const panelItemProvider = new PanelTreeItemProvider(context, serversView)
    const panelsView = vscode.window.createTreeView('boomack-panels', {
        treeDataProvider: panelItemProvider,
    })
    const serverViewSelectionChangeHandle = serversView.onDidChangeSelection(async () => {
        if (!config('autoSelect.panel')) return
        if (panelsView.selection.length > 0) return
        const panelItems = await panelItemProvider.getChildren(null)
        if (panelItems.length === 0) return
        const defaultItem = panelItems.find(x => x.panelId === 'default') || panelItems[0]
        panelsView.reveal(defaultItem, { select: true })
    })
    context.subscriptions.push(serverViewSelectionChangeHandle)

    const slotItemProvider = new SlotTreeItemProvider(context, panelsView)
    const slotsView = vscode.window.createTreeView('boomack-slots', {
        treeDataProvider: slotItemProvider,
    })
    const panelViewSelectionChangeHandle = panelsView.onDidChangeSelection(async () => {
        if (!config('autoSelect.slot')) return
        if (slotsView.selection.length > 0) return
        const slotItems = await slotItemProvider.getChildren(null)
        if (slotItems.length === 0) return
        const defaultItem = slotItems.find(x => x.defaultSlot) || slotItems[0]
        slotsView.reveal(defaultItem, { select: true })
    })
    context.subscriptions.push(panelViewSelectionChangeHandle)

    // register commands, defined in the package.json

    const startLocalServerHandle = vscode.commands.registerCommand(
        'boomack.startLocalServer',
        () => {
            vscode.window.showWarningMessage('Not Implemented: Start local Boomack server')
        })
    context.subscriptions.push(startLocalServerHandle);

    const addServerHandle = vscode.commands.registerCommand(
        'boomack.addServer',
        commands.addServerCommand(context))
    context.subscriptions.push(addServerHandle);

    const removeServerHandle = vscode.commands.registerCommand(
        'boomack.removeServer',
        commands.removeServerCommand(context))
    context.subscriptions.push(removeServerHandle);

    const selectServerHandle = vscode.commands.registerCommand(
        'boomack.selectServer',
        commands.selectServerCommand(context, serversView))
    context.subscriptions.push(selectServerHandle)

    const refreshPanelsHandle = vscode.commands.registerCommand(
        'boomack.refreshPanelList',
        commands.refreshPanelsCommand(panelItemProvider))
    context.subscriptions.push(refreshPanelsHandle)

    const selectPanelHandle = vscode.commands.registerCommand(
        'boomack.selectPanel',
        commands.selectPanelCommand(panelItemProvider, panelsView))
    context.subscriptions.push(selectPanelHandle)

    const clearPanelHandle = vscode.commands.registerCommand(
        'boomack.clearPanel',
        commands.clearPanelCommand(context, panelItemProvider))
    context.subscriptions.push(clearPanelHandle)

    const clearSelectedPanelHandle = vscode.commands.registerCommand(
        'boomack.clearSelectedPanel',
        commands.clearSelectedPanelCommand(context, panelsView))
    context.subscriptions.push(clearSelectedPanelHandle)

    const refreshSlotsHandle = vscode.commands.registerCommand(
        'boomack.refreshSlotList',
        commands.refreshSlotsCommand(slotItemProvider))
    context.subscriptions.push(refreshSlotsHandle)

    const selectSlotHandle = vscode.commands.registerCommand(
        'boomack.selectSlot',
        commands.selectSlotCommand(slotItemProvider, slotsView))
    context.subscriptions.push(selectSlotHandle)

    const clearSlotHandle = vscode.commands.registerCommand(
        'boomack.clearSlot',
        commands.clearSlotCommand(context, slotItemProvider))
    context.subscriptions.push(clearSlotHandle)

    const clearSelectedSlotHandle = vscode.commands.registerCommand(
        'boomack.clearSelectedSlot',
        commands.clearSelectedSlotCommand(context, slotsView))
    context.subscriptions.push(clearSelectedSlotHandle)

    const displayCurrentFileHandle = vscode.commands.registerCommand(
        'boomack.displayCurrentFile',
        commands.displayCurrentFile(context, slotsView))
    context.subscriptions.push(displayCurrentFileHandle)
}

// This method is called when your extension is deactivated
function deactivate() {
    clearClientCache()
}

module.exports = {
    activate,
    deactivate
}
