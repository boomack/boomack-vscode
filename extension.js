
const vscode = require('vscode')
const { config } = require('./config.js')
const { clearClientCache } = require('./client.js')
const {
    ServerTreeItemProvider,
    PanelTreeItemProvider,
    SlotTreeItemProvider,
} = require('./navigation.js')
const commands = require('./commands.js')

/**
 * @typedef {import('./navigation.js').PanelItem} PanelItem
 * @typedef {import('./navigation.js').SlotItem} SlotItem
 */

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {ServerTreeItemProvider} serverItemProvider
 * @param {vscode.TreeView} serversView
 */
function autoselectServer(serverItemProvider, serversView) {
    if (serversView.selection.length > 0) return
    if (!config('autoSelect.server')) return
    const servers = serverItemProvider.getChildren(null)
    if (servers.length === 0) return
    const defaultItem = servers.find(x => x.name === 'default') || servers[0]
    serversView.reveal(defaultItem, { select: true })
}

/**
 * @param {PanelItem[]} panelItems
 * @param {vscode.TreeView} panelsView
 * @returns {Promise<void>}
 */
async function autoSelectPanel(panelItems, panelsView) {
    if (panelsView.selection.length > 0) return
    if (!config('autoSelect.panel')) return
    if (panelItems.length === 0) return
    const defaultItem = panelItems.find(x => x.panelId === 'default') || panelItems[0]
    panelsView.reveal(defaultItem, { select: true })
}

/**
 * @param {SlotItem[]} slotItems
 * @param {vscode.TreeView} slotsView
 * @returns {Promise<void>}
 */
async function autoSelectSlot(slotItems, slotsView) {
    if (slotsView.selection.length > 0) return
    if (!config('autoSelect.slot')) return
    if (slotItems.length === 0) return
    const defaultItem = slotItems.find(x => x.defaultSlot) || slotItems[0]
    slotsView.reveal(defaultItem, { select: true })
}

function updateContextActiveTextEditor() {
    vscode.commands.executeCommand('setContext',
            'boomack.activeTextEditor', !!vscode.window.activeTextEditor)
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    console.log('Boomack VS Code extension intializing...')

    updateContextActiveTextEditor()
    const activeTextEditorChangeSubs = vscode.window.onDidChangeActiveTextEditor(() => {
        updateContextActiveTextEditor()
    })
    context.subscriptions.push(activeTextEditorChangeSubs)

    // register tree data providers for tree views, defined in package.json

    const serverItemProvider = new ServerTreeItemProvider(context)
    const serversView = vscode.window.createTreeView('boomack-servers', {
        treeDataProvider: serverItemProvider,
    })

    const panelItemProvider = new PanelTreeItemProvider(context, serversView)
    const panelsView = vscode.window.createTreeView('boomack-panels', {
        treeDataProvider: panelItemProvider,
    })

    const slotItemProvider = new SlotTreeItemProvider(context, panelsView)
    const slotsView = vscode.window.createTreeView('boomack-slots', {
        treeDataProvider: slotItemProvider,
    })

    const serverViewVisibilityChangeSubs = serversView.onDidChangeVisibility(e => {
        if (!e.visible) return
        autoselectServer(serverItemProvider, serversView)
    })
    context.subscriptions.push(serverViewVisibilityChangeSubs)

    const panelsLoadedSubs = panelItemProvider.onItemsLoaded(panels => {
        autoSelectPanel(panels, panelsView)
    })
    context.subscriptions.push(panelsLoadedSubs)

    const serverViewSelectionChangeSubs = serversView.onDidChangeSelection(async () => {
        vscode.commands.executeCommand('setContext',
            'boomack.serverSelected', serversView.selection.length > 0)
    })
    context.subscriptions.push(serverViewSelectionChangeSubs)

    const panelViewSelectionChangeSubs = panelsView.onDidChangeSelection(async () => {
        vscode.commands.executeCommand('setContext',
            'boomack.panelSelected', panelsView.selection.length > 0)
    })
    context.subscriptions.push(panelViewSelectionChangeSubs)

    const slotsLoadedSubs = slotItemProvider.onItemsLoaded(slots => {
        autoSelectSlot(slots, slotsView)
    })
    context.subscriptions.push(slotsLoadedSubs)

    const slotsViewSelectionChangeSubs = slotsView.onDidChangeSelection(async () => {
        vscode.commands.executeCommand('setContext',
            'boomack.slotSelected', slotsView.selection.length > 0)
    })
    context.subscriptions.push(slotsViewSelectionChangeSubs)

    // register commands, defined in the package.json

    const playgroundCmdSubs = vscode.commands.registerCommand(
        'boomack.playground', commands.playgroundCommand())
    context.subscriptions.push(playgroundCmdSubs)

    const startLocalServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.startLocal',
        () => {
            vscode.window.showWarningMessage('Not Implemented: Start local Boomack server')
        })
    context.subscriptions.push(startLocalServerCmdSubs)

    const addServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.add',
        commands.addServerCommand(context))
    context.subscriptions.push(addServerCmdSubs)

    const removeServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.remove',
        commands.removeServerCommand(context))
    context.subscriptions.push(removeServerCmdSubs)

    const selectServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.select',
        commands.selectServerCommand(context, serversView))
    context.subscriptions.push(selectServerCmdSubs)

    const refreshPanelsCmdSubs = vscode.commands.registerCommand(
        'boomack.refreshPanelList',
        commands.refreshPanelsCommand(panelItemProvider))
    context.subscriptions.push(refreshPanelsCmdSubs)

    const selectPanelCmdSubs = vscode.commands.registerCommand(
        'boomack.panel.select',
        commands.selectPanelCommand(panelItemProvider, panelsView))
    context.subscriptions.push(selectPanelCmdSubs)

    const clearPanelCmdSubs = vscode.commands.registerCommand(
        'boomack.panel.clear',
        commands.clearPanelCommand(context, panelsView, panelItemProvider))
    context.subscriptions.push(clearPanelCmdSubs)

    const refreshSlotsCmdSubs = vscode.commands.registerCommand(
        'boomack.refreshSlotList',
        commands.refreshSlotsCommand(slotItemProvider))
    context.subscriptions.push(refreshSlotsCmdSubs)

    const selectSlotCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.select',
        commands.selectSlotCommand(slotItemProvider, slotsView))
    context.subscriptions.push(selectSlotCmdSubs)

    const slotZoomInCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.zoomIn',
        commands.slotZoomCommand(context, slotItemProvider, slotsView, 'in'))
    context.subscriptions.push(slotZoomInCmdSubs)

    const slotZoomOutCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.zoomOut',
        commands.slotZoomCommand(context, slotItemProvider, slotsView, 'out'))
    context.subscriptions.push(slotZoomOutCmdSubs)

    const clearSlotCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.clear',
        commands.clearSlotCommand(context, slotItemProvider, slotsView))
    context.subscriptions.push(clearSlotCmdSubs)

    const displayInSlotCmdSubs = vscode.commands.registerCommand(
        'boomack.display.inSlot',
        commands.displayInSlotCommand(context, slotsView))
    context.subscriptions.push(displayInSlotCmdSubs)

    const displayDocumentCmdSubs = vscode.commands.registerCommand(
        'boomack.display.document',
        commands.displayFileCommand(context, slotItemProvider, slotsView))
    context.subscriptions.push(displayDocumentCmdSubs)

    const displayFileResourceCmdSubs = vscode.commands.registerCommand(
        'boomack.display.fileResource',
        commands.displayFileCommand(context, slotItemProvider, slotsView))
    context.subscriptions.push(displayFileResourceCmdSubs)
}

// This method is called when your extension is deactivated
function deactivate() {
    clearClientCache()
}

module.exports = {
    activate,
    deactivate
}
