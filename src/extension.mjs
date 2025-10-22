import {
    commands,
    window,
} from 'vscode'
import { loadWorkspaceClientConfig } from './config.mjs'
import { clearClientCache } from './client.mjs'
import { Navigator } from './navigation.mjs'
import cmd from './commands.mjs'

/**
 * @typedef {import('vscode').ExtensionContext} ExtensionContext
 */

/** @type {?Navigator} */
let navigator = null

// === TODO ===
// - [ ] uncouple target (server, panel, slot) from tree view selection (indicate by icon?)
// - [ ] show Boomack target in status bar
// - [X] command for forcing panel reload on connected Web Clients
// - [X] setup panel from file
// - [X] send display request from file
// - [X] execute playbook
// - [ ] setup from assets in directory structure (presets, types, actions, panels, initial content)
// - [ ] json schema for server config
// - [X] json schema for panel layout
// - [X] json schema for display request
// - [X] json schema for preset
// - [X] json schema for playbook
// - [ ] use file:/// references instead of streaming requests for workspace server
// - [ ] allow opt-in streaming requests for workspace server per config option
// - [ ] watches for display requests
// - [ ] watches for panel layouts

function updateContextActiveTextEditor() {
    return commands.executeCommand('setContext',
            'boomack.activeTextEditor', !!window.activeTextEditor)
}

function updateContextActiveNotebookEditor() {
    return commands.executeCommand('setContext',
            'boomack.activeNotebookEditor', !!window.activeNotebookEditor)
}

/**
 * @param {Navigator} navigator
 */
function setupContextUpdateForSelectionState(navigator) {
    const context = navigator.getContext()
    context.subscriptions.push(
        navigator.onSelectedServerChanged(e =>
            commands.executeCommand('setContext',
                'boomack.serverSelected', !!e.serverState)))

    context.subscriptions.push(
        navigator.onSelectedPanelChanged(e =>
            commands.executeCommand('setContext',
                'boomack.panelSelected', !!e.panelState)))

    context.subscriptions.push(
        navigator.onSelectedSlotChanged(e =>
            commands.executeCommand('setContext',
                'boomack.slotSelected', !!e.slotState)))

}

/**
 * @param {ExtensionContext} context
 */
export function activate(context) {

    // Use the console to output diagnostic information (console.log) and errors (console.error)
    console.log('Boomack VS Code extension initializing...')

    updateContextActiveTextEditor()
    const activeTextEditorChangeSubs = window.onDidChangeActiveTextEditor(() =>
        updateContextActiveTextEditor())
    context.subscriptions.push(activeTextEditorChangeSubs)

    updateContextActiveNotebookEditor()
    const activeNotebookEditorChangeSubs = window.onDidChangeActiveNotebookEditor(() =>
        updateContextActiveNotebookEditor())
    context.subscriptions.push(activeNotebookEditorChangeSubs)

    if (navigator) throw new Error("Possible multiple parallel activations of the extension")
    navigator = new Navigator(context)

    loadWorkspaceClientConfig().then(config => {
        navigator.updateWorkspaceServer(config)
    })

    navigator.createServerTreeView()
    navigator.createPanelTreeView()
    navigator.createSlotTreeView()

    setupContextUpdateForSelectionState(navigator)

    // register commands, defined in the package.json

    const playgroundCmdSubs = commands.registerCommand(
        'boomack.playground',
        cmd.playgroundCommand())
    context.subscriptions.push(playgroundCmdSubs)

    const reloadWorkspaceServerConfigCmdSubs = commands.registerCommand(
        'boomack.workspaceServer.reloadConfig',
        cmd.reloadWorkspaceServerConfig(navigator))
    context.subscriptions.push(reloadWorkspaceServerConfigCmdSubs)

    const startWorkspaceServerCmdSubs = commands.registerCommand(
        'boomack.workspaceServer.start',
        cmd.startWorkspaceServerCommand(navigator))
    context.subscriptions.push(startWorkspaceServerCmdSubs)

    const stopWorkspaceServerCmdSubs = commands.registerCommand(
        'boomack.workspaceServer.stop',
        cmd.stopWorkspaceServerCommand())
    context.subscriptions.push(stopWorkspaceServerCmdSubs)

    const addServerCmdSubs = commands.registerCommand(
        'boomack.server.add',
        cmd.addServerCommand(navigator))
    context.subscriptions.push(addServerCmdSubs)

    const removeServerCmdSubs = commands.registerCommand(
        'boomack.server.remove',
        cmd.removeServerCommand(navigator))
    context.subscriptions.push(removeServerCmdSubs)

    const selectServerCmdSubs = commands.registerCommand(
        'boomack.server.select',
        cmd.selectServerCommand(navigator))
    context.subscriptions.push(selectServerCmdSubs)

    const openServerInBrowserCmdSubs = commands.registerCommand(
        'boomack.server.openInBrowser',
        cmd.openServerInBrowserCommand(navigator))
    context.subscriptions.push(openServerInBrowserCmdSubs)

    const refreshServerCmdSubs = commands.registerCommand(
        'boomack.server.refresh',
        cmd.refreshPanelsCommand(navigator))
    context.subscriptions.push(refreshServerCmdSubs)

    const addPanelCmdSubs = commands.registerCommand(
        'boomack.panel.add',
        cmd.addPanelCommand(navigator))
    context.subscriptions.push(addPanelCmdSubs)

    const selectPanelCmdSubs = commands.registerCommand(
        'boomack.panel.select',
        cmd.selectPanelCommand(navigator))
    context.subscriptions.push(selectPanelCmdSubs)

    const clearPanelCmdSubs = commands.registerCommand(
        'boomack.panel.clear',
        cmd.clearPanelCommand(navigator))
    context.subscriptions.push(clearPanelCmdSubs)

    const removePanelCmdSubs = commands.registerCommand(
        'boomack.panel.remove',
        cmd.removePanelCommand(navigator))
    context.subscriptions.push(removePanelCmdSubs)

    const openPanelInBrowserCmdSubs = commands.registerCommand(
        'boomack.panel.openInBrowser',
        cmd.openPanelInBrowserCommand(navigator))
    context.subscriptions.push(openPanelInBrowserCmdSubs)

    const reloadPanelInBrowserCmdSubs = commands.registerCommand(
        'boomack.panel.reloadInBrowser',
        cmd.reloadPanelInBrowserCommand(navigator))
    context.subscriptions.push(reloadPanelInBrowserCmdSubs)

    const refreshPanelCmdSubs = commands.registerCommand(
        'boomack.panel.refresh',
        cmd.refreshSlotsCommand(navigator))
    context.subscriptions.push(refreshPanelCmdSubs)

    const updatePanelWithActiveDocumentCmdSubs = commands.registerCommand(
        'boomack.panel.update.withActiveDocument',
        cmd.displayFileCommand(navigator, { typeMode: 'panel-layout' }))
    context.subscriptions.push(updatePanelWithActiveDocumentCmdSubs)

    const revertMaximizedSlotCmdSubs = commands.registerCommand(
        'boomack.panel.revertMaximizedSlot',
        cmd.revertMaximizedSlotCommand(navigator))
    context.subscriptions.push(revertMaximizedSlotCmdSubs)

    const selectSlotCmdSubs = commands.registerCommand(
        'boomack.slot.select',
        cmd.selectSlotCommand(navigator))
    context.subscriptions.push(selectSlotCmdSubs)

    const clearSlotCmdSubs = commands.registerCommand(
        'boomack.slot.clear',
        cmd.clearSlotCommand(navigator))
    context.subscriptions.push(clearSlotCmdSubs)

    const openSlotInBrowserCmdSubs = commands.registerCommand(
        'boomack.slot.openInBrowser',
        cmd.openSlotInBrowserCommand(navigator))
    context.subscriptions.push(openSlotInBrowserCmdSubs)

    const slotZoomInCmdSubs = commands.registerCommand(
        'boomack.slot.zoomIn',
        cmd.slotZoomCommand(navigator, 'in'))
    context.subscriptions.push(slotZoomInCmdSubs)

    const slotZoomOutCmdSubs = commands.registerCommand(
        'boomack.slot.zoomOut',
        cmd.slotZoomCommand(navigator, 'out'))
    context.subscriptions.push(slotZoomOutCmdSubs)

    const slotMaximizeSlotCmdSubs = commands.registerCommand(
        'boomack.slot.maximize',
        cmd.slotMaximizeCommand(navigator))
    context.subscriptions.push(slotMaximizeSlotCmdSubs)

    const slotToggleMaximizeCmdSubs = commands.registerCommand(
        'boomack.slot.toggleMaximize',
        cmd.slotToggleMaximizeCommand(navigator))
    context.subscriptions.push(slotToggleMaximizeCmdSubs)

    const removeSlotCmdSubs = commands.registerCommand(
        'boomack.slot.remove',
        cmd.removeSlotCommand(navigator))
    context.subscriptions.push(removeSlotCmdSubs)

    const hideSlotCmdSubs = commands.registerCommand(
        'boomack.slot.hide',
        cmd.hideSlotCommand(navigator))
    context.subscriptions.push(hideSlotCmdSubs)

    const showSlotCmdSubs = commands.registerCommand(
        'boomack.slot.show',
        cmd.showSlotCommand(navigator))
    context.subscriptions.push(showSlotCmdSubs)

    const toggleSlotVisibilityCmdSubs = commands.registerCommand(
        'boomack.slot.toggleVisibility',
        cmd.toggleSlotVisibilityCommand(navigator))
    context.subscriptions.push(toggleSlotVisibilityCmdSubs)

    const displayActiveDocumentCmdSubs = commands.registerCommand(
        'boomack.display.activeDocument',
        cmd.displayFileCommand(navigator, { typeMode: 'default' }))
    context.subscriptions.push(displayActiveDocumentCmdSubs)

    const displayActiveDocumentSourceCmdSubs = commands.registerCommand(
        'boomack.display.activeDocument.source',
        cmd.displayFileCommand(navigator, { typeMode: 'source' }))
    context.subscriptions.push(displayActiveDocumentSourceCmdSubs)

    const displayActiveDocumentWithMediaTypeCmdSubs = commands.registerCommand(
        'boomack.display.activeDocument.withMediaType',
        cmd.displayFileCommand(navigator, { typeMode: 'prompt' }))
    context.subscriptions.push(displayActiveDocumentWithMediaTypeCmdSubs)

    const displayActiveDocumentAsDisplayRequestCmdSubs = commands.registerCommand(
        'boomack.display.activeDocument.asDisplayRequest',
        cmd.displayFileCommand(navigator, { typeMode: 'display-request' }))
    context.subscriptions.push(displayActiveDocumentAsDisplayRequestCmdSubs)

    const displayActiveDocumentInSlotWithIdCmdSubs = commands.registerCommand(
        'boomack.display.activeDocument.inSlot.withId',
        cmd.displayDocumentInSlotWithIdCommand(navigator, { typeMode: 'default' }))
    context.subscriptions.push(displayActiveDocumentInSlotWithIdCmdSubs)

    const displayActiveDocumentSourceInSlotWithIdCmdSubs = commands.registerCommand(
        'boomack.display.activeDocument.source.inSlot.withId',
        cmd.displayDocumentInSlotWithIdCommand(navigator, { typeMode: 'source' }))
    context.subscriptions.push(displayActiveDocumentSourceInSlotWithIdCmdSubs)

    const displayActiveDocumentWithMediaTypeInSlotWithIdCmdSubs = commands.registerCommand(
        'boomack.display.activeDocument.withMediaType.inSlot.withId',
        cmd.displayDocumentInSlotWithIdCommand(navigator, { typeMode: 'prompt' }))
    context.subscriptions.push(displayActiveDocumentWithMediaTypeInSlotWithIdCmdSubs)

    const displayActiveNotebookCellCmdSubs = commands.registerCommand(
        'boomack.display.activeNotebookCell',
        cmd.displayNotebookCellCommand(navigator, false))
    context.subscriptions.push(displayActiveNotebookCellCmdSubs)

    const displayActiveNotebookCellSourceCmdSubs = commands.registerCommand(
        'boomack.display.activeNotebookCell.source',
        cmd.displayNotebookCellCommand(navigator, true))
    context.subscriptions.push(displayActiveNotebookCellSourceCmdSubs)

    const displayCurrentSelectionSourceCmdSubs = commands.registerCommand(
        'boomack.display.currentSelection.source',
        cmd.displaySelectionCommand(navigator, { typeMode: 'source' }))
    context.subscriptions.push(displayCurrentSelectionSourceCmdSubs)

    const displayCurrentSelectionWithMediaTypeCmdSubs = commands.registerCommand(
        'boomack.display.currentSelection.withMediaType',
        cmd.displaySelectionCommand(navigator, { typeMode: 'prompt' }))
    context.subscriptions.push(displayCurrentSelectionWithMediaTypeCmdSubs)

    const displayDocumentCmdSubs = commands.registerCommand(
        'boomack.display.document',
        cmd.displayFileCommand(navigator, { typeMode: 'default' }))
    context.subscriptions.push(displayDocumentCmdSubs)

    const displayDocumentSourceCmdSubs = commands.registerCommand(
        'boomack.display.document.source',
        cmd.displayFileCommand(navigator, { typeMode: 'source' }))
    context.subscriptions.push(displayDocumentSourceCmdSubs)

    const displayDocumentWithMediaTypeCmdSubs = commands.registerCommand(
        'boomack.display.document.withMediaType',
        cmd.displayFileCommand(navigator, { typeMode: 'prompt' }))
    context.subscriptions.push(displayDocumentWithMediaTypeCmdSubs)

    const displaySelectionSourceCmdSubs = commands.registerCommand(
        'boomack.display.selection.source',
        cmd.displaySelectionCommand(navigator, { typeMode: 'source' }))
    context.subscriptions.push(displaySelectionSourceCmdSubs)

    const displayDocumentInPanelCmdSubs = commands.registerCommand(
        'boomack.display.document.inPanel',
        cmd.displayDocumentInPanelCommand(navigator, { typeMode: 'default' }))
    context.subscriptions.push(displayDocumentInPanelCmdSubs)

    const displayDocumentSourceInPanelCmdSubs = commands.registerCommand(
        'boomack.display.document.source.inPanel',
        cmd.displayDocumentInPanelCommand(navigator, { typeMode: 'source' }))
    context.subscriptions.push(displayDocumentSourceInPanelCmdSubs)

    const displayInSlotCmdSubs = commands.registerCommand(
        'boomack.display.document.inSlot',
        cmd.displayDocumentInSlotCommand(navigator, { typeMode: 'default' }))
    context.subscriptions.push(displayInSlotCmdSubs)

    const displayDocumentSourceInSlotCmdSubs = commands.registerCommand(
        'boomack.display.document.source.inSlot',
        cmd.displayDocumentInSlotCommand(navigator, { typeMode: 'source' }))
    context.subscriptions.push(displayDocumentSourceInSlotCmdSubs)

    const displayFileCmdSubs = commands.registerCommand(
        'boomack.display.file',
        cmd.displayFileCommand(navigator, { typeMode: 'default' }))
    context.subscriptions.push(displayFileCmdSubs)

    const displayFileSourceCmdSubs = commands.registerCommand(
        'boomack.display.file.source',
        cmd.displayFileCommand(navigator, { typeMode: 'source' }))
    context.subscriptions.push(displayFileSourceCmdSubs)

    const displayNotebookCellCmdSubs = commands.registerCommand(
        'boomack.display.notebook.cell',
        cmd.displayNotebookCellCommand(navigator, false))
    context.subscriptions.push(displayNotebookCellCmdSubs)

    const displayNotebookCellSourceCmdSubs = commands.registerCommand(
        'boomack.display.notebook.cell.source',
        cmd.displayNotebookCellCommand(navigator, true))
    context.subscriptions.push(displayNotebookCellSourceCmdSubs)

    const executeActiveDocumentAsPlaybookCmdSubs = commands.registerCommand(
        'boomack.playbook.execute.activeDocument',
        cmd.displayFileCommand(navigator, { typeMode: 'playbook' }))
    context.subscriptions.push(executeActiveDocumentAsPlaybookCmdSubs)
}

// This method is called when your extension is deactivated
export function deactivate() {
    navigator.dispose()
    navigator = null
    clearClientCache()
}
