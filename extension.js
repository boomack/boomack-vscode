const vscode = require('vscode')
const { clearClientCache } = require('./client.js')
const { Navigator } = require('./navigation.js')
const commands = require('./commands.js')

/** @type {?Navigator} */
let navigator = null

// === TODO ===
// - display text selection
// - display HTML source code
// - display with explicit media type / preset
// - setup panel from file
// - setup from playbook
// - setup from assets in directory structure (types, presets, layouts, actions, initial content)
// - detect workspace server config
// - json schema for server config
// - json schema for panel layout
// - json schema for display request
// - json schema for playbook
// - use file:/// references instead of streaming requests for workspace server
// - allow opt-in streaming requests for workspace server

function updateContextActiveTextEditor() {
    return vscode.commands.executeCommand('setContext',
            'boomack.activeTextEditor', !!vscode.window.activeTextEditor)
}

/**
 * @param {Navigator} navigator
 */
function setupContextUpdateForSelectionState(navigator) {
    const context = navigator.getContext()
    context.subscriptions.push(
        navigator.onSelectedServerChanged(e =>
            vscode.commands.executeCommand('setContext',
                'boomack.serverSelected', !!e.serverState)))

    context.subscriptions.push(
        navigator.onSelectedPanelChanged(e =>
            vscode.commands.executeCommand('setContext',
                'boomack.panelSelected', !!e.panelState)))

    context.subscriptions.push(
        navigator.onSelectedSlotChanged(e =>
            vscode.commands.executeCommand('setContext',
                'boomack.slotSelected', !!e.slotState)))

}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    console.log('Boomack VS Code extension initializing...')

    updateContextActiveTextEditor()
    const activeTextEditorChangeSubs = vscode.window.onDidChangeActiveTextEditor(() =>
        updateContextActiveTextEditor())
    context.subscriptions.push(activeTextEditorChangeSubs)

    if (navigator) throw new Error("Possible multiple parallel activations of the extension")
    navigator = new Navigator(context)

    navigator.createServerTreeView()
    navigator.createPanelTreeView()
    navigator.createSlotTreeView()

    setupContextUpdateForSelectionState(navigator)

    // register commands, defined in the package.json

    const playgroundCmdSubs = vscode.commands.registerCommand(
        'boomack.playground', commands.playgroundCommand())
    context.subscriptions.push(playgroundCmdSubs)

    const startWorkspaceServerCmdSubs = vscode.commands.registerCommand(
        'boomack.workspaceServer.start', commands.startWorkspaceServerCommand(navigator))
    context.subscriptions.push(startWorkspaceServerCmdSubs)

    const stopWorkspaceServerCmdSubs = vscode.commands.registerCommand(
        'boomack.workspaceServer.stop', commands.stopWorkspaceServerCommand())
    context.subscriptions.push(stopWorkspaceServerCmdSubs)

    const addServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.add',
        commands.addServerCommand(navigator))
    context.subscriptions.push(addServerCmdSubs)

    const removeServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.remove',
        commands.removeServerCommand(navigator))
    context.subscriptions.push(removeServerCmdSubs)

    const selectServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.select',
        commands.selectServerCommand(navigator))
    context.subscriptions.push(selectServerCmdSubs)

    const openServerInBrowserCmdSubs = vscode.commands.registerCommand(
        'boomack.server.openInBrowser',
        commands.openServerInBrowserCommand(navigator))
    context.subscriptions.push(openServerInBrowserCmdSubs)

    const refreshServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.refresh',
        commands.refreshPanelsCommand(navigator, false))
    context.subscriptions.push(refreshServerCmdSubs)

    const refreshSelectedServerCmdSubs = vscode.commands.registerCommand(
        'boomack.server.refreshSelected',
        commands.refreshPanelsCommand(navigator, true))
    context.subscriptions.push(refreshSelectedServerCmdSubs)

    const selectPanelCmdSubs = vscode.commands.registerCommand(
        'boomack.panel.select',
        commands.selectPanelCommand(navigator))
    context.subscriptions.push(selectPanelCmdSubs)

    const clearPanelCmdSubs = vscode.commands.registerCommand(
        'boomack.panel.clear',
        commands.clearPanelCommand(navigator))
    context.subscriptions.push(clearPanelCmdSubs)

    const openPanelInBrowserCmdSubs = vscode.commands.registerCommand(
        'boomack.panel.openInBrowser',
        commands.openPanelInBrowserCommand())
    context.subscriptions.push(openPanelInBrowserCmdSubs)

    const refreshPanelCmdSubs = vscode.commands.registerCommand(
        'boomack.panel.refresh',
        commands.refreshSlotsCommand(navigator, false))
    context.subscriptions.push(refreshPanelCmdSubs)

    const refreshSelectedPanelCmdSubs = vscode.commands.registerCommand(
        'boomack.panel.refreshSelected',
        commands.refreshSlotsCommand(navigator, true))
    context.subscriptions.push(refreshSelectedPanelCmdSubs)

    const selectSlotCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.select',
        commands.selectSlotCommand(navigator))
    context.subscriptions.push(selectSlotCmdSubs)

    const slotZoomInCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.zoomIn',
        commands.slotZoomCommand(navigator, 'in'))
    context.subscriptions.push(slotZoomInCmdSubs)

    const slotZoomOutCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.zoomOut',
        commands.slotZoomCommand(navigator, 'out'))
    context.subscriptions.push(slotZoomOutCmdSubs)

    const slotToggleMaximizeCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.toggleMaximize',
        commands.slotToggleMaximizeCommand(navigator))
    context.subscriptions.push(slotToggleMaximizeCmdSubs)

    const clearSlotCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.clear',
        commands.clearSlotCommand(navigator))
    context.subscriptions.push(clearSlotCmdSubs)

    const openSlotInBrowserCmdSubs = vscode.commands.registerCommand(
        'boomack.slot.openInBrowser',
        commands.openSlotInBrowserCommand(navigator))
    context.subscriptions.push(openSlotInBrowserCmdSubs)

    const displayInSlotCmdSubs = vscode.commands.registerCommand(
        'boomack.display.inSlot',
        commands.displayInSlotCommand(navigator))
    context.subscriptions.push(displayInSlotCmdSubs)

    const displayDocumentCmdSubs = vscode.commands.registerCommand(
        'boomack.display.document',
        commands.displayFileCommand(navigator))
    context.subscriptions.push(displayDocumentCmdSubs)

    const displayFileResourceCmdSubs = vscode.commands.registerCommand(
        'boomack.display.fileResource',
        commands.displayFileCommand(navigator))
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
