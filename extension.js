const vscode = require('vscode')
const { config } = require('./config.js')
const { clearClientCache } = require('./client.js')
const { WORKSPACE_SERVER_NAME } = require('./model.js')
const { Navigator } = require('./navigation.js')
const commands = require('./commands.js')

/** @type {?Navigator} */
let navigator = null

// === TODO ===
// - display text selection
// - display HTML source code
// - display with explicit media type / preset
// - setup panel from file
// - setup from assets in directory structure (types, presets, layouts, actions, initial content)
// - detect workspace server config
// - run server in workspace (replaces default server)
// - json schema for server config
// - open home page, panel, slot in browser
// - use file:/// references instead of streaming requests for workspace server
// - allow opt-in streaming requests for workspace server

/**
 * @param {Navigator} navigator
 * @param {vscode.TreeView} serversView
 */
function autoselectServer(navigator, serversView) {
    if (serversView.selection.length > 0) return
    if (!config('autoSelect.server')) return
    const servers = navigator.getServerStates()
    if (servers.length === 0) return
    const defaultItem = servers.find(x => x.name === WORKSPACE_SERVER_NAME) || servers[0]
    return serversView.reveal(defaultItem, { select: true })
}

function updateContextActiveTextEditor() {
    return vscode.commands.executeCommand('setContext',
            'boomack.activeTextEditor', !!vscode.window.activeTextEditor)
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    console.log('Boomack VS Code extension intializing...')

    updateContextActiveTextEditor()
    const activeTextEditorChangeSubs = vscode.window.onDidChangeActiveTextEditor(() =>
        updateContextActiveTextEditor())
    context.subscriptions.push(activeTextEditorChangeSubs)

    if (navigator) throw new Error("Possible multiple parallel activations of the extension")
    navigator = new Navigator(context)

    // register tree data providers for tree views, defined in package.json

    const serversView = navigator.createServerTreeView()
    const panelsView = navigator.createPanelTreeView()
    const slotsView = navigator.createSlotTreeView()

    const serverViewVisibilityChangeSubs = serversView.onDidChangeVisibility(async e => {
        if (!e.visible) return
        await autoselectServer(navigator, serversView)
    })
    context.subscriptions.push(serverViewVisibilityChangeSubs)

    const serverSelectionChangeSubs = navigator.onSelectedServerChanged(e =>
        vscode.commands.executeCommand('setContext',
            'boomack.serverSelected', !!e.serverState))
    context.subscriptions.push(serverSelectionChangeSubs)

    const panelSelectionChangeSubs = navigator.onSelectedPanelChanged(async e =>
        vscode.commands.executeCommand('setContext',
            'boomack.panelSelected', !!e.panelState))
    context.subscriptions.push(panelSelectionChangeSubs)

    const slotSelectionChangeSubs = navigator.onSelectedSlotChanged(async e =>
        vscode.commands.executeCommand('setContext',
            'boomack.slotSelected', !!e.slotState))
    context.subscriptions.push(slotSelectionChangeSubs)

    // register commands, defined in the package.json

    const playgroundCmdSubs = vscode.commands.registerCommand(
        'boomack.playground', commands.playgroundCommand())
    context.subscriptions.push(playgroundCmdSubs)

    const startServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.start',
        () => {
            vscode.window.showWarningMessage('Not Implemented: Start Boomack server for workspace')
        })
    context.subscriptions.push(startServerCmdSubs)

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
    navigator.dispose()
    navigator = null
    clearClientCache()
}

module.exports = {
    activate,
    deactivate
}
